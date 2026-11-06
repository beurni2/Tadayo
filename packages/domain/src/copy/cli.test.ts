import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

// A refused line, as the lint prints it, for one "Sent" (in any case) in the text.
const refusedSent = (path: string, word: string, text: string) =>
  `${path}: [banned-word] "${word}" is outside the vocabulary (T41): use spec 03's nouns, and "Added" for a ` +
  `committed drop\n    in: ${JSON.stringify(text)}\n`;

const FQ68_PATH = "apps/ios/Tadayo/Localizable.xcstrings";
const FQ68_VALUE = "Sent to %@";

/** Each file on its own: the exact output, which names every refused line and FQ68's count. */
function expectRefused(path: string, content: string, refused: readonly string[], excused: number): void {
  for (const entry of readdirSync(repo)) {
    if (entry !== ".git") rmSync(join(repo, entry), { recursive: true, force: true });
  }
  write(path, content);
  const lines = refused.flatMap((text) =>
    Array.from(text.matchAll(/sent/giu), ([word]) => refusedSent(path, word, text)),
  );
  expect(run(), `${path}: ${content}`).toEqual({
    status: 1,
    out: lines.join("") + fq68(excused) + `copy lint: 1 string file(s), ${String(lines.length)} finding(s)\n`,
  });
}

// The exception is matched exactly: a value, key or catalog that only contains, ends with, or
// differs in case or spacing from FQ68's is still refused (review finding 1 of PR #20).
it("refuses Sent in another key of FQ68's catalog, while allowing FQ68's line beside it", { timeout: 20_000 }, () => {
  expectRefused(FQ68_PATH, catalog({ "auth.code.sentTo": FQ68_VALUE, "drop.state": FQ68_VALUE }), [FQ68_VALUE], 1);
});

it("refuses Sent in any other value of FQ68's key, however close", { timeout: 20_000 }, () => {
  for (const value of [
    "Sent to %@.",
    "Sent to %@ now",
    "Sent to %@ Sent",
    "Sent To %@",
    "sent to %@",
    " Sent to %@",
    "Sent to %@ ",
    "Sent to your inbox",
  ]) {
    expectRefused(FQ68_PATH, catalog({ "auth.code.sentTo": value }), [value], 0);
  }
});

it("refuses FQ68's value under any other key, however close", { timeout: 20_000 }, () => {
  for (const key of ["auth.code.sentto", "x.auth.code.sentTo", "auth.code.sentTo.again", "auth.code"]) {
    expectRefused(FQ68_PATH, catalog({ [key]: FQ68_VALUE }), [FQ68_VALUE], 0);
  }
});

it("refuses FQ68's line in any other file, and as a catalog's key", { timeout: 20_000 }, () => {
  for (const path of [
    "apps/ios/TadayoShare/Localizable.xcstrings",
    "x/apps/ios/Tadayo/Localizable.xcstrings",
    "apps/ios/tadayo/Localizable.xcstrings",
  ]) {
    expectRefused(path, catalog({ "auth.code.sentTo": FQ68_VALUE }), [FQ68_VALUE], 0);
  }
  expectRefused(FQ68_PATH, JSON.stringify({ strings: { [FQ68_VALUE]: {} } }), [FQ68_VALUE], 0);
  expectRefused("apps/ios/Tadayo/Localizable.strings", `"auth.code.sentTo" = "${FQ68_VALUE}";`, [FQ68_VALUE], 0);
  expectRefused("apps/web/index.html", `<p>${FQ68_VALUE}</p>`, [FQ68_VALUE], 0);
});
