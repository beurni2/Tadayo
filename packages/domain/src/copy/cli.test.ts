import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "cli.ts");
let repo = "";

function write(path: string, content: string): void {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
}

function run() {
  const result = spawnSync(process.execPath, [CLI], { cwd: repo, encoding: "utf8" });
  return { status: result.status, out: result.stdout + result.stderr };
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "copy-lint-"));
  spawnSync("git", ["init", "-q"], { cwd: repo });
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

it("passes a repository with no string files", () => {
  write("README.md", "Sent!");
  expect(run()).toEqual({ status: 0, out: "copy lint: 0 string file(s), 0 finding(s)\n" });
});

it("passes clean string files, and skips design/reference and ignored files", () => {
  write("apps/web/index.html", "<p>Photo opens Friday at 7 AM</p>");
  write("design/reference/claude-design/handoff-0/frame.html", "<p>Sent!</p>");
  write(".gitignore", "build/\n");
  write("build/Copy.strings", '"a" = "Sent";');
  expect(run()).toEqual({ status: 0, out: "copy lint: 1 string file(s), 0 finding(s)\n" });
});

it("fails on each finding, naming the file and the rule", () => {
  write("apps/ios/Tadayo/Localizable.xcstrings", JSON.stringify({ strings: { "Her pick": {} } }));
  write("apps/web/index.html", "<p>Sent!</p>");
  write("apps/web/design/reference/page.html", "<p>Her day</p>");
  const { status, out } = run();
  expect(status).toBe(1);
  expect(out).toContain("apps/ios/Tadayo/Localizable.xcstrings: [gendered-pronoun]");
  expect(out).toContain("apps/web/index.html: [banned-word]");
  expect(out).toContain("apps/web/index.html: [exclamation]");
  expect(out).toContain("apps/web/design/reference/page.html: [gendered-pronoun]");
  expect(out).toContain("copy lint: 3 string file(s), 4 finding(s)");
});
