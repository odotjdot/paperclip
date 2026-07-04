import pc from "picocolors";

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

function printUsage(parsed: Record<string, unknown>) {
  const usage = asRecord(parsed.usage) ?? asRecord(parsed.usageMetadata) ?? asRecord(parsed.stats);
  const usageMetadata = asRecord(usage?.usageMetadata);
  const source = usageMetadata ?? usage ?? {};
  const input = asNumber(source.input_tokens, asNumber(source.inputTokens, asNumber(source.promptTokenCount)));
  const output = asNumber(source.output_tokens, asNumber(source.outputTokens, asNumber(source.candidatesTokenCount)));
  const cached = asNumber(
    source.cached_input_tokens,
    asNumber(source.cachedInputTokens, asNumber(source.cachedContentTokenCount, asNumber(source.cached))),
  );
  const cost = asNumber(parsed.total_cost_usd, asNumber(parsed.cost_usd, asNumber(parsed.cost)));
  console.log(pc.blue(`tokens: in=${input} out=${output} cached=${cached} cost=$${cost.toFixed(6)}`));
}

export function printAgyStreamEvent(raw: string, _debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(line) as Record<string, unknown>;
  } catch {
    console.log(line);
    return;
  }

  const type = asString(parsed.type);

  if (type === "system") {
    const subtype = asString(parsed.subtype);
    if (subtype === "init") {
      const model = asString(parsed.model, "agy");
      console.log(pc.blue(`agy init (model: ${model})`));
      return;
    }
    if (subtype === "error") {
      const text = errorText(parsed.error ?? parsed.message ?? parsed.detail);
      if (text) console.log(pc.red(`error: ${text}`));
      return;
    }
    console.log(pc.blue(`system: ${subtype || "event"}`));
    return;
  }

  if (type === "assistant" || (type === "message" && asString(parsed.role).trim().toLowerCase() === "assistant")) {
    const content = parsed.message ?? parsed.content ?? "";
    const text = typeof content === "string" ? content.trim() : asString(asRecord(content)?.text).trim();
    if (text) console.log(pc.green(`assistant: ${text}`));
    return;
  }

  if (type === "result" || (!type && (parsed.result !== undefined || parsed.response !== undefined))) {
    printUsage(parsed);
    const status = asString(parsed.status).toLowerCase();
    const isError = parsed.is_error === true || status === "error" || status === "failed";
    const subtype = asString(parsed.subtype, status || "result");
    if (subtype || isError) {
      console.log((isError ? pc.red : pc.blue)(`result: subtype=${subtype} is_error=${isError ? "true" : "false"}`));
    }
    if (isError) {
      const text = errorText(parsed.error ?? parsed.message ?? parsed.result);
      if (text) console.log(pc.red(`error: ${text}`));
    }
    return;
  }

  if (type === "error") {
    const text = errorText(parsed.error ?? parsed.message ?? parsed.detail);
    if (text) console.log(pc.red(`error: ${text}`));
    return;
  }

  console.log(line);
}
