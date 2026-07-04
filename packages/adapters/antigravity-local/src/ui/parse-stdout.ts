import type { TranscriptEntry } from "@paperclipai/adapter-utils";

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function errorText(value: unknown): string {
  if (typeof value === "string") return value;
  const rec = asRecord(value);
  if (!rec) return "";
  const msg =
    (typeof rec.message === "string" && rec.message) ||
    (typeof rec.error === "string" && rec.error) ||
    (typeof rec.code === "string" && rec.code) ||
    "";
  if (msg) return msg;
  try {
    return JSON.stringify(rec);
  } catch {
    return "";
  }
}

function collectTextEntries(messageRaw: unknown, ts: string, kind: "assistant" | "user"): TranscriptEntry[] {
  if (typeof messageRaw === "string") {
    const text = messageRaw.trim();
    return text ? [{ kind, ts, text }] : [];
  }

  const message = asRecord(messageRaw);
  if (!message) return [];

  const entries: TranscriptEntry[] = [];
  const directText = asString(message.text).trim();
  if (directText) entries.push({ kind, ts, text: directText });

  const content = Array.isArray(message.content) ? message.content : [];
  for (const partRaw of content) {
    const part = asRecord(partRaw);
    if (!part) continue;
    const type = asString(part.type).trim();
    if (type !== "output_text" && type !== "text" && type !== "content") continue;
    const text = asString(part.text).trim() || asString(part.content).trim();
    if (text) entries.push({ kind, ts, text });
  }

  return entries;
}

function readUsage(parsed: Record<string, unknown>) {
  const usage = asRecord(parsed.usage) ?? asRecord(parsed.usageMetadata) ?? asRecord(parsed.stats);
  const usageMetadata = asRecord(usage?.usageMetadata);
  const source = usageMetadata ?? usage ?? {};
  return {
    inputTokens: asNumber(source.input_tokens, asNumber(source.inputTokens, asNumber(source.promptTokenCount))),
    outputTokens: asNumber(source.output_tokens, asNumber(source.outputTokens, asNumber(source.candidatesTokenCount))),
    cachedTokens: asNumber(
      source.cached_input_tokens,
      asNumber(source.cachedInputTokens, asNumber(source.cachedContentTokenCount, asNumber(source.cached))),
    ),
  };
}

/**
 * Parse a single stdout line from agy.
 * agy uses --output-format json which may emit JSONL or a single JSON blob.
 * Each line is processed as JSON if possible, otherwise emitted as stdout.
 */
export function parseAgyStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const parsed = asRecord(safeJsonParse(line));
  if (!parsed) {
    return [{ kind: "stdout", ts, text: line }];
  }

  const type = asString(parsed.type);

  if (type === "system") {
    const subtype = asString(parsed.subtype);
    if (subtype === "init") {
      const sessionId = asString(parsed.session_id) || asString(parsed.sessionId) || "";
      return [{ kind: "init", ts, model: asString(parsed.model, "agy"), sessionId }];
    }
    if (subtype === "error") {
      const text = errorText(parsed.error ?? parsed.message ?? parsed.detail);
      return [{ kind: "stderr", ts, text: text || "error" }];
    }
    return [{ kind: "system", ts, text: `system: ${subtype || "event"}` }];
  }

  if (type === "assistant") {
    return collectTextEntries(parsed.message ?? parsed.content, ts, "assistant");
  }

  if (type === "user") {
    return collectTextEntries(parsed.message ?? parsed.content, ts, "user");
  }

  if (type === "message") {
    const role = asString(parsed.role).trim().toLowerCase();
    if (role === "assistant") {
      return collectTextEntries(parsed.content ?? parsed.message, ts, "assistant");
    }
    if (role === "user") {
      return collectTextEntries(parsed.content ?? parsed.message, ts, "user");
    }
    return [];
  }

  if (type === "result" || (!type && (parsed.result !== undefined || parsed.response !== undefined || parsed.output !== undefined))) {
    const usage = readUsage(parsed);
    const status = asString(parsed.status).toLowerCase();
    const isError =
      parsed.is_error === true || status === "error" || status === "failed";
    const errors = isError
      ? [errorText(parsed.error ?? parsed.message ?? parsed.result)].filter(Boolean)
      : [];
    return [{
      kind: "result",
      ts,
      text:
        asString(parsed.result) ||
        asString(parsed.response) ||
        asString(parsed.output) ||
        asString(parsed.text),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedTokens: usage.cachedTokens,
      costUsd: asNumber(parsed.total_cost_usd, asNumber(parsed.cost_usd, asNumber(parsed.cost))),
      subtype: asString(parsed.subtype, status || "result"),
      isError,
      errors,
    }];
  }

  if (type === "error") {
    const text = errorText(parsed.error ?? parsed.message ?? parsed.detail);
    return [{ kind: "stderr", ts, text: text || "error" }];
  }

  return [{ kind: "stdout", ts, text: line }];
}
