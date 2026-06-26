import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "publish.sh");

function createSite(name = "paperclip-page-test") {
  const siteDir = mkdtempSync(join(tmpdir(), `${name}-`));
  writeFileSync(join(siteDir, "index.html"), "<!doctype html><title>Paperclip</title>\n");
  return siteDir;
}

function runPublish(args, env = {}) {
  try {
    return {
      output: execFileSync("bash", [scriptPath, ...args], {
        encoding: "utf8",
        env: {
          ...process.env,
          PAPERCLIP_PAGE_BUCKET: "paperclip-pages-test",
          PAPERCLIP_PAGE_BASE_URL: "https://pages.example.test/",
          ...env,
        },
        stdio: ["ignore", "pipe", "pipe"],
      }),
      status: 0,
    };
  } catch (error) {
    return {
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
      status: error.status ?? 1,
    };
  }
}

test("publish helper stays executable", () => {
  assert.equal(statSync(scriptPath).mode & 0o111, 0o111);
});

test("dry run validates and prints the planned target without requiring AWS", () => {
  const result = runPublish([
    createSite(),
    "--slug",
    "demo-page",
    "--dry-run",
  ]);

  assert.equal(result.status, 0);
  assert.match(result.output, /^paperclip-page dry run$/m);
  assert.match(result.output, /^mode: publish$/m);
  assert.match(result.output, /^bucket: paperclip-pages-test$/m);
  assert.match(result.output, /^prefix: demo-page\/$/m);
  assert.match(result.output, /^url: https:\/\/pages\.example\.test\/demo-page\/$/m);
});

test("dry run normalizes a safe default prefix", () => {
  const result = runPublish(
    [createSite(), "--slug", "demo-page", "--dry-run"],
    { PAPERCLIP_PAGE_DEFAULT_PREFIX: "/reports/launches/" },
  );

  assert.equal(result.status, 0);
  assert.match(result.output, /^prefix: reports\/launches\/demo-page\/$/m);
  assert.match(result.output, /^url: https:\/\/pages\.example\.test\/reports\/launches\/demo-page\/$/m);
});

test("rejects nested slugs", () => {
  const result = runPublish([createSite(), "--slug", "nested/path", "--dry-run"]);

  assert.notEqual(result.status, 0);
  assert.match(result.output, /slug must be one path segment/);
});

test("rejects hidden files in the source tree", () => {
  const siteDir = createSite();
  mkdirSync(join(siteDir, "assets"));
  writeFileSync(join(siteDir, "assets", ".secret"), "do not publish\n");

  const result = runPublish([siteDir, "--slug", "demo-page", "--dry-run"]);

  assert.notEqual(result.status, 0);
  assert.match(result.output, /hidden files and dot paths are not allowed/);
});
