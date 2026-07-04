import path from "node:path";
import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asNumber,
  asString,
  ensurePathInEnv,
  parseObject,
} from "@paperclipai/adapter-utils/server-utils";
import {
  ensureAdapterExecutionTargetCommandResolvable,
  maybeRunSandboxInstallCommand,
  ensureAdapterExecutionTargetDirectory,
  runAdapterExecutionTargetProcess,
  describeAdapterExecutionTarget,
  resolveAdapterExecutionTargetCwd,
} from "@paperclipai/adapter-utils/execution-target";
import { DEFAULT_AGY_COMMAND } from "../index.js";
import { detectAgyAuthRequired, detectAgyQuotaExhausted, parseAgySingleJson } from "./parse.js";
import { firstNonEmptyLine } from "./utils.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function commandLooksLikeAgy(command: string): boolean {
  const base = path.basename(command).toLowerCase();
  return base === "agy" || base === "agy.exe";
}

function summarizeProbeDetail(stdout: string, stderr: string, parsedError: string | null): string | null {
  const raw = parsedError?.trim() || firstNonEmptyLine(stderr) || firstNonEmptyLine(stdout);
  if (!raw) return null;
  const clean = raw.replace(/\s+/g, " ").trim();
  const max = 240;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = asString(config.command, DEFAULT_AGY_COMMAND);
  const target = ctx.executionTarget ?? null;
  const targetIsRemote = target?.kind === "remote";
  const cwd = resolveAdapterExecutionTargetCwd(target, asString(config.cwd, ""), process.cwd());
  const targetLabel = targetIsRemote
    ? ctx.environmentName ?? describeAdapterExecutionTarget(target)
    : null;
  const runId = `antigravity-envtest-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (targetLabel) {
    checks.push({
      code: "antigravity_environment_target",
      level: "info",
      message: `Probing inside environment: ${targetLabel}`,
    });
  }

  try {
    await ensureAdapterExecutionTargetDirectory(runId, target, cwd, {
      cwd,
      env: {},
      createIfMissing: true,
    });
    checks.push({
      code: "antigravity_cwd_valid",
      level: "info",
      message: `Working directory is valid: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "antigravity_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
    });
  }

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });

  // agy is a Go binary — no npm install command
  const installCheck = await maybeRunSandboxInstallCommand({
    runId,
    target,
    adapterKey: "antigravity",
    installCommand: null,
    detectCommand: command,
    env,
  });
  if (installCheck) checks.push(installCheck);

  // AC1: named failure when agy is absent (not a crash)
  try {
    await ensureAdapterExecutionTargetCommandResolvable(command, target, cwd, runtimeEnv);
    checks.push({
      code: "antigravity_command_resolvable",
      level: "info",
      message: `Command is executable: ${command}`,
    });
  } catch (err) {
    checks.push({
      code: "antigravity_command_not_found",
      level: "error",
      message: `agy command not found on PATH: ${command}`,
      detail: err instanceof Error ? err.message : String(err),
      hint: "Install the agy Go binary and ensure it is on PATH. See: https://github.com/google-gemini/agy/releases",
    });
    // Return early — no point running the hello probe without the command
    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  const canRunProbe =
    checks.every((check) => check.code !== "antigravity_cwd_invalid" && check.code !== "antigravity_command_not_found");

  if (canRunProbe) {
    if (!commandLooksLikeAgy(command)) {
      checks.push({
        code: "antigravity_hello_probe_skipped_custom_command",
        level: "info",
        message: "Skipped hello probe because command is not `agy`.",
        detail: command,
        hint: "Use the `agy` CLI command to run the automatic auth probe.",
      });
    } else {
      const helloProbeTimeoutSec = Math.max(1, asNumber(config.helloProbeTimeoutSec, 60));

      // Non-TTY workaround: --yes, --no-color, capture stderr
      const args = ["-p", "Respond with hello.", "--output-format", "json", "--headless", "--yes", "--no-color"];

      const probe = await runAdapterExecutionTargetProcess(
        runId,
        target,
        command,
        args,
        {
          cwd,
          env,
          timeoutSec: helloProbeTimeoutSec,
          graceSec: 5,
          onLog: async () => {},
        },
      );
      const parsed = parseAgySingleJson(probe.stdout);
      const detail = summarizeProbeDetail(probe.stdout, probe.stderr, parsed.errorMessage);
      const authMeta = detectAgyAuthRequired({
        parsed: parsed.resultEvent,
        stdout: probe.stdout,
        stderr: probe.stderr,
      });
      const quotaMeta = detectAgyQuotaExhausted({
        parsed: parsed.resultEvent,
        stdout: probe.stdout,
        stderr: probe.stderr,
      });

      if (quotaMeta.exhausted) {
        checks.push({
          code: "antigravity_hello_probe_quota_exhausted",
          level: "warn",
          message: probe.timedOut
            ? "agy CLI is retrying after quota exhaustion."
            : "agy CLI authentication is configured, but the current account or API key is over quota.",
          ...(detail ? { detail } : {}),
          hint: "The configured Google account or API key is over quota. Check Google AI usage/billing, then retry.",
        });
      } else if (probe.timedOut) {
        checks.push({
          code: "antigravity_hello_probe_timed_out",
          level: "warn",
          message: "agy hello probe timed out.",
          hint: "Retry the probe. If this persists, verify agy can run headlessly from this directory.",
        });
      } else if ((probe.exitCode ?? 1) === 0) {
        const summary = parsed.summary.trim();
        const hasHello = /\bhello\b/i.test(summary);
        checks.push({
          code: hasHello ? "antigravity_hello_probe_passed" : "antigravity_hello_probe_unexpected_output",
          level: hasHello ? "info" : "warn",
          message: hasHello
            ? "agy hello probe succeeded."
            : "agy probe ran but did not return `hello` as expected.",
          ...(summary ? { detail: summary.replace(/\s+/g, " ").trim().slice(0, 240) } : {}),
          ...(hasHello
            ? {}
            : {
              hint: "Try `agy -p \"Respond with hello.\" --output-format json --headless --yes --no-color` manually to inspect full output.",
            }),
        });
      } else if (authMeta.requiresAuth) {
        checks.push({
          code: "antigravity_hello_probe_auth_required",
          level: "warn",
          message: "agy CLI is installed, but Google authentication is not ready.",
          ...(detail ? { detail } : {}),
          hint: "Run `agy auth` or `agy auth login` to authenticate with your Google account, then retry the probe.",
        });
      } else {
        checks.push({
          code: "antigravity_hello_probe_failed",
          level: "error",
          message: "agy hello probe failed.",
          ...(detail ? { detail } : {}),
          hint: "Run `agy -p \"Respond with hello.\" --output-format json --headless --yes --no-color` manually to debug.",
        });
      }
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
