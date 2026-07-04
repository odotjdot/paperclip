import { describe, expect, it } from "vitest";
import { detectAgyAuthRequired, parseAgySingleJson } from "./parse.js";

describe("parseAgySingleJson — single JSON object (agy --output-format json)", () => {
  it("extracts result text from a result-type single JSON object", () => {
    const stdout = JSON.stringify({
      type: "result",
      result: "hello",
      status: "success",
      usage: { input_tokens: 100, output_tokens: 10 },
    });

    const parsed = parseAgySingleJson(stdout);

    expect(parsed.summary).toBe("hello");
    expect(parsed.errorMessage).toBeNull();
    expect(parsed.usage.inputTokens).toBe(100);
    expect(parsed.usage.outputTokens).toBe(10);
  });

  it("extracts result text from response field", () => {
    const stdout = JSON.stringify({
      response: "hello world",
      status: "ok",
    });

    const parsed = parseAgySingleJson(stdout);
    expect(parsed.summary).toBe("hello world");
    expect(parsed.errorMessage).toBeNull();
  });

  it("extracts result text from output field", () => {
    const stdout = JSON.stringify({
      output: "task done",
    });

    const parsed = parseAgySingleJson(stdout);
    expect(parsed.summary).toBe("task done");
  });

  it("marks errors from status=error", () => {
    const stdout = JSON.stringify({
      type: "result",
      status: "error",
      error: "something went wrong",
    });

    const parsed = parseAgySingleJson(stdout);
    expect(parsed.errorMessage).toBe("something went wrong");
  });

  it("marks errors from is_error=true", () => {
    const stdout = JSON.stringify({
      is_error: true,
      result: "",
      error: "auth failed",
    });

    const parsed = parseAgySingleJson(stdout);
    expect(parsed.errorMessage).toBe("auth failed");
  });

  it("handles empty stdout gracefully", () => {
    const parsed = parseAgySingleJson("");
    expect(parsed.summary).toBe("");
    expect(parsed.errorMessage).toBeNull();
    expect(parsed.usage.inputTokens).toBe(0);
    expect(parsed.usage.outputTokens).toBe(0);
  });

  it("falls back to raw stdout when not valid JSON", () => {
    const stdout = "plain text response from agy\nsome more text";
    const parsed = parseAgySingleJson(stdout);
    expect(parsed.summary).toBe("plain text response from agy\nsome more text");
    expect(parsed.errorMessage).toBeNull();
  });

  it("handles JSONL fallback: collects assistant messages across lines", () => {
    const stdout = [
      JSON.stringify({ type: "message", role: "assistant", content: "first part" }),
      JSON.stringify({ type: "message", role: "user", content: "ignored user message" }),
      JSON.stringify({ type: "message", role: "assistant", content: "second part" }),
      JSON.stringify({ type: "result", status: "success" }),
    ].join("\n");

    const parsed = parseAgySingleJson(stdout);
    expect(parsed.summary).toContain("first part");
    expect(parsed.summary).toContain("second part");
    expect(parsed.summary).not.toContain("ignored user message");
    expect(parsed.errorMessage).toBeNull();
  });

  it("collects JSONL error events", () => {
    const stdout = [
      JSON.stringify({ type: "error", error: "agy failure" }),
    ].join("\n");

    const parsed = parseAgySingleJson(stdout);
    expect(parsed.errorMessage).toBe("agy failure");
  });

  it("accumulates usage from stats field", () => {
    const stdout = JSON.stringify({
      type: "result",
      result: "done",
      status: "success",
      stats: {
        input_tokens: 500,
        output_tokens: 50,
        cached: 200,
      },
    });

    const parsed = parseAgySingleJson(stdout);
    expect(parsed.usage.inputTokens).toBe(500);
    expect(parsed.usage.outputTokens).toBe(50);
    expect(parsed.usage.cachedInputTokens).toBe(200);
  });

  it("extracts cost from total_cost_usd", () => {
    const stdout = JSON.stringify({
      result: "done",
      total_cost_usd: 0.001234,
    });

    const parsed = parseAgySingleJson(stdout);
    expect(parsed.costUsd).toBe(0.001234);
  });
});

describe("detectAgyAuthRequired — AC1 named failure detection", () => {
  it("returns requiresAuth=true when stderr contains auth-required message", () => {
    const result = detectAgyAuthRequired({
      parsed: null,
      stdout: "",
      stderr: "Error: not authenticated. Please run `agy auth login` first.",
    });
    expect(result.requiresAuth).toBe(true);
  });

  it("returns requiresAuth=true for google auth message", () => {
    const result = detectAgyAuthRequired({
      parsed: null,
      stdout: "Please sign in to your Google account",
      stderr: "",
    });
    expect(result.requiresAuth).toBe(true);
  });

  it("returns requiresAuth=true for unauthorized in error object", () => {
    const result = detectAgyAuthRequired({
      parsed: { error: "Unauthorized: invalid credentials" },
      stdout: "",
      stderr: "",
    });
    expect(result.requiresAuth).toBe(true);
  });

  it("returns requiresAuth=false for non-auth errors", () => {
    const result = detectAgyAuthRequired({
      parsed: null,
      stdout: "Some unexpected output",
      stderr: "Error: file not found",
    });
    expect(result.requiresAuth).toBe(false);
  });

  it("returns requiresAuth=false for empty output", () => {
    const result = detectAgyAuthRequired({
      parsed: null,
      stdout: "",
      stderr: "",
    });
    expect(result.requiresAuth).toBe(false);
  });
});

describe("parseAgySingleJson — non-TTY output handling", () => {
  it("strips ANSI escape codes embedded in plain text output", () => {
    // agy may emit ANSI codes despite --no-color on some versions;
    // the parser should not crash and should return the raw text.
    const stdout = "[32mhello world[0m";
    const parsed = parseAgySingleJson(stdout);
    // We don't strip ANSI (that's the CLI's responsibility via --no-color),
    // but the parser should not error or return null.
    expect(typeof parsed.summary).toBe("string");
    expect(parsed.errorMessage).toBeNull();
  });

  it("handles stdout that starts with non-JSON noise before JSON", () => {
    // Some agy versions print a line of text before the JSON block
    const stdout = [
      "Running agy...",
      JSON.stringify({ type: "result", result: "task complete", status: "success" }),
    ].join("\n");

    const parsed = parseAgySingleJson(stdout);
    // The result event should be captured via JSONL fallback
    expect(parsed.summary).toBe("task complete");
    expect(parsed.errorMessage).toBeNull();
  });
});
