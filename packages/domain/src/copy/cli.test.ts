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

// FQ68's exception, as every run prints it, with how many times it was found.
const fq68 = (times: number) =>
  `copy lint: exception: "Sent" allowed in "Sent to %@", the value of auth.code.sentTo in ` +
  `apps/ios/Tadayo/Localizable.xcstrings [banned-word], by FQ68 (ADR-029): T41's ban on Sent covers a ` +
  `drop's states, and the sign-in code screen (A02-code) says where the code went; found ${String(times)} time(s)\n`;

/** A string catalog with each key's English value. */
function catalog(values: Record<string, string>): string {
  const strings = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      { localizations: { en: { stringUnit: { state: "translated", value } } } },
    ]),
  );
  return JSON.stringify({ sourceLanguage: "en", strings, version: "1.0" });
}

it("passes a repository with no string files", () => {
  write("README.md", "Sent!");
  expect(run()).toEqual({ status: 0, out: fq68(0) + "copy lint: 0 string file(s), 0 finding(s)\n" });
});

it("passes clean string files, and skips design/reference and ignored files", () => {
  write("apps/web/index.html", "<p>Photo opens Friday at 7 AM</p>");
  write("design/reference/claude-design/handoff-0/frame.html", "<p>Sent!</p>");
  write(".gitignore", "build/\n");
  write("build/Copy.strings", '"a" = "Sent";');
  expect(run()).toEqual({ status: 0, out: fq68(0) + "copy lint: 1 string file(s), 0 finding(s)\n" });
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

it("allows FQ68's sign-in line, and says so on every run", () => {
  write(
    "apps/ios/Tadayo/Localizable.xcstrings",
    catalog({ "auth.code.sentTo": "Sent to %@", "auth.code.resend": "Send a new code" }),
  );
  expect(run()).toEqual({ status: 0, out: fq68(1) + "copy lint: 1 string file(s), 0 finding(s)\n" });
});

it("refuses Sent anywhere but FQ68's exact line: another key, another value, another catalog, a key", () => {
  const sentTo = "Sent to %@";
  for (const [path, content] of [
    ["apps/ios/Tadayo/Localizable.xcstrings", catalog({ "auth.code.sentTo": sentTo, "drop.state": sentTo })],
    ["apps/ios/Tadayo/Localizable.xcstrings", catalog({ "auth.code.sentTo": "Sent to your inbox" })],
    ["apps/ios/TadayoShare/Localizable.xcstrings", catalog({ "auth.code.sentTo": sentTo })],
    ["apps/ios/Tadayo/Localizable.xcstrings", JSON.stringify({ strings: { [sentTo]: {} } })],
  ] as const) {
    rmSync(join(repo, "apps"), { recursive: true, force: true });
    write(path, content);
    const { status, out } = run();
    expect(status).toBe(1);
    expect(out).toContain(`${path}: [banned-word]`);
    expect(out).toContain("copy lint: 1 string file(s), 1 finding(s)");
  }
});
