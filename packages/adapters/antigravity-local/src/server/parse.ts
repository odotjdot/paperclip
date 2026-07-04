import { asNumber, asString, parseJson, parseObject } from "@paperclipai/adapter-utils/server-utils";

function collectMessageText(message: unknown): string[] {
  if (typeof message === "string") {
    const trimmed = message.trim();
    return trimmed ? [trimmed] : [];
  }

  const record = parseObject(message);
  const direct = asString(record.text, "").trim();
  const lines: string[] = direct ? [direct] : [];
  const content = Array.isArray(record.content) ? record.content : [];

  for (const partRaw of content) {
    const part = parseObject(partRaw);
    const type = asString(part.type, "").trim();
    if (type === "output_text" || type === "text" || type === "content") {
      const text = asString(part.text, "").trim() || asString(part.content, "").trim();
      if (text) lines.push(text);
    }
  }

  return lines;
}

function asErrorText(value: unknown): string {
  if (typeof value === "string") return value;
  const rec = parseObject(value);
  const message =
    asString(rec.message, "") ||
    asString(rec.error, "") ||
    asString(rec.code, "") ||
    asString(rec.detail, "");
  if (message) return message;
  try {
    return JSON.stringify(rec);
  } catch {
    return "";
  }
}

function accumulateUsage(
  target: { inputTokens: number; cachedInputTokens: number; outputTokens: number },
  usageRaw: unknown,
) {
  const usage = parseObject(usageRaw);
  const usageMetadata = parseObject(usage.usageMetadata);
  const source = Object.keys(usageMetadata).length > 0 ? usageMetadata : usage;

  target.inputTokens += asNumber(source.input_tokens, asNumber(source.inputTokens, asNumber(source.promptTokenCount, 0)));
  target.cachedInputTokens += asNumber(
    source.cached_input_tokens,
    asNumber(source.cachedInputTokens, asNumber(source.cachedContentTokenCount, asNumber(source.cached, 0))),
  );
  target.outputTokens += asNumber(
    source.output_tokens,
    asNumber(source.outputTokens, asNumber(source.candidatesTokenCount, 0)),
  );
}

/**
 * Parse agy output. agy uses --output-format json which emits either:
 * - A single JSON object (result) at the end
 * - Possibly JSONL (one event per line) depending on version
 * We handle both by trying each line as JSON and also trying the entire stdout.
 */
export function parseAgySingleJson(stdout: string) {
  const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  const messages: string[] = [];
  let errorMessage: string | null = null;
  let costUsd: number | null = null;
  let resultEvent: Record<string, unknown> | null = null;

  const trimmed = stdout.trim();
  if (!trimmed) {
    return { summary: "", usage, costUsd, errorMessage, resultEvent };
  }

  // Try single-object parse first (agy --output-format json)
  const single = parseJson(trimmed);
  if (single && typeof single === "object" && !Array.isArray(single)) {
    const event = single as Record<string, unknown>;
    resultEvent = event;
    accumulateUsage(usage, event.usage ?? event.usageMetadata ?? event.stats);
    costUsd =
      asNumber(event.total_cost_usd, asNumber(event.cost_usd, asNumber(event.cost, 0))) || costUsd;

    const status = asString(event.status, "").toLowerCase();
    const isError =
      event.is_error === true ||
      asString(event.subtype, "").toLowerCase() === "error" ||
      status === "error" ||
      status === "failed";

    if (isError) {
      const text = asErrorText(event.error ?? event.message ?? event.result).trim();
      if (text) errorMessage = text;
    }

    // Extract text from result/response/output fields
    const resultText =
      asString(event.result, "").trim() ||
      asString(event.response, "").trim() ||
      asString(event.output, "").trim() ||
      asString(event.text, "").trim();
    if (resultText) messages.push(resultText);

    // Also collect from message field
    messages.push(...collectMessageText(event.message));

    return { summary: messages.join("\n\n").trim(), usage, costUsd, errorMessage, resultEvent };
  }

  // Fall back to JSONL parsing (one event per line)
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const event = parseJson(line);
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      // Plain text line
      const text = line.trim();
      if (text) messages.push(text);
      continue;
    }

    const record = event as Record<string, unknown>;
    const type = asString(record.type, "").trim();

    if (type === "result" || !type) {
      resultEvent = record;
      accumulateUsage(usage, record.usage ?? record.usageMetadata ?? record.stats);
      costUsd =
        asNumber(record.total_cost_usd, asNumber(record.cost_usd, asNumber(record.cost, 0))) || costUsd;
      const status = asString(record.status, "").toLowerCase();
      const isError =
        record.is_error === true ||
        asString(record.subtype, "").toLowerCase() === "error" ||
        status === "error" ||
        status === "failed";
      if (isError) {
        const text = asErrorText(record.error ?? record.message ?? record.result).trim();
        if (text) errorMessage = text;
      }
      const resultText =
        asString(record.result, "").trim() ||
        asString(record.response, "").trim() ||
        asString(record.output, "").trim() ||
        asString(record.text, "").trim();
      if (resultText && messages.length === 0) messages.push(resultText);
      continue;
    }

    if (type === "assistant" || type === "message") {
      const role = asString(record.role, "").trim().toLowerCase();
      if (!role || role === "assistant") {
        messages.push(...collectMessageText(record.message ?? record.content));
      }
      continue;
    }

    if (type === "error") {
      const text = asErrorText(record.error ?? record.message ?? record.detail).trim();
      if (text) errorMessage = text;
      continue;
    }

    if (type === "system") {
      const subtype = asString(record.subtype, "").trim().toLowerCase();
      if (subtype === "error") {
        const text = asErrorText(record.error ?? record.message ?? record.detail).trim();
        if (text) errorMessage = text;
      }
      continue;
    }

    if (record.usage || record.usageMetadata) {
      accumulateUsage(usage, record.usage ?? record.usageMetadata);
      costUsd =
        asNumber(record.total_cost_usd, asNumber(record.cost_usd, asNumber(record.cost, 0))) || costUsd;
    }
  }

  // If no structured messages, use raw stdout as the summary
  if (messages.length === 0 && trimmed.length > 0) {
    messages.push(trimmed);
  }

  return { summary: messages.join("\n\n").trim(), usage, costUsd, errorMessage, resultEvent };
}

const AGY_AUTH_REQUIRED_RE =
  /(?:not\s+authenticated|please\s+authenticate|api[_ ]?key\s+(?:required|missing|invalid)|authentication\s+required|unauthorized|invalid\s+credentials|not\s+logged\s+in|login\s+required|run\s+`?agy\s+auth(?:\s+login)?`?\s+first|google\s+auth|sign\s+in)/i;
const AGY_QUOTA_EXHAUSTED_RE =
  /(?:resource_exhausted|quota|rate[-\s]?limit|too many requests|\b429\b|billing details)/i;

function extractAgyErrorMessages(parsed: Record<string, unknown>): string[] {
  const messages: string[] = [];
  const errorMsg = asString(parsed.error, "").trim();
  if (errorMsg) messages.push(errorMsg);

  const raw = Array.isArray(parsed.errors) ? parsed.errors : [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const msg = entry.trim();
      if (msg) messages.push(msg);
      continue;
    }
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    const msg = asString(obj.message, "") || asString(obj.error, "") || asString(obj.code, "");
    if (msg) {
      messages.push(msg);
      continue;
    }
    try {
      messages.push(JSON.stringify(obj));
    } catch {
      // skip non-serializable entry
    }
  }

  return messages;
}

export function detectAgyAuthRequired(input: {
  parsed: Record<string, unknown> | null;
  stdout: string;
  stderr: string;
}): { requiresAuth: boolean } {
  const errors = extractAgyErrorMessages(input.parsed ?? {});
  const messages = [...errors, input.stdout, input.stderr]
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const requiresAuth = messages.some((line) => AGY_AUTH_REQUIRED_RE.test(line));
  return { requiresAuth };
}

export function detectAgyQuotaExhausted(input: {
  parsed: Record<string, unknown> | null;
  stdout: string;
  stderr: string;
}): { exhausted: boolean } {
  const errors = extractAgyErrorMessages(input.parsed ?? {});
  const messages = [...errors, input.stdout, input.stderr]
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const exhausted = messages.some((line) => AGY_QUOTA_EXHAUSTED_RE.test(line));
  return { exhausted };
}

export function describeAgyFailure(parsed: Record<string, unknown>): string | null {
  const status = asString(parsed.status, "");
  const errors = extractAgyErrorMessages(parsed);
  const detail = errors[0] ?? "";
  const parts = ["agy run failed"];
  if (status) parts.push(`status=${status}`);
  if (detail) parts.push(detail);
  return parts.length > 1 ? parts.join(": ") : null;
}
