// Only the time module reads a clock (T1; TECH-DESIGN section 5: "Nothing else reads the system
// clock"). A route, a job, a migration or an ops script that read the time for itself would decide
// by a clock that the dev clock can't move and the tests' fake clock can't hold, and in SQL `now()`
// and the literal 'now' are the transaction's start, before any lock (ADR-013). Tests may read
// clocks. The tests' fake clock, for its part, appears in no product code, and no numbered
// migration, which every environment runs, makes the dev clock's table.
//
// The scan reads the server's code a line at a time, so it catches the ordinary ways of reading a
// clock, not a deliberate way round it such as `const D = Date; new D()`. The app's own clock, the
// device half of T1, is the ios lane's: Swift isn't scanned here.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const TIME_MODULE = join("packages", "domain", "src", "time") + sep;
const MIGRATIONS = join("db", "migrations") + sep;

const READS = [
  { what: "Date.now()", pattern: /\bDate\s*\.\s*now\b/ },
  { what: "performance.now() or its timeOrigin", pattern: /\bperformance\s*\.\s*(?:now|timeOrigin)\b/ },
  { what: "new Date() with no argument", pattern: /\bnew\s+Date\s*\(\s*\)/ },
  { what: "new Date with no parentheses", pattern: /\bnew\s+Date\b(?!\s*\()/ },
  { what: "Date() without new", pattern: /(?<!\bnew\s+)(?<![\w$.])Date\s*\(/ },
  { what: "the global object's Date", pattern: /\b(?:globalThis|global|window|self)\s*\.\s*Date\b/ },
  { what: "Date built by Reflect", pattern: /\bReflect\s*\.\s*construct\s*\(\s*Date\b/ },
  {
    what: "a formatter's format() with no argument, which formats the time now",
    pattern: /\.format(?:ToParts)?\s*\(\s*\)/,
  },
  { what: "Temporal.Now", pattern: /\bTemporal\s*\.\s*Now\b/ },
  { what: "process.hrtime", pattern: /\bprocess\s*\.\s*hrtime\b/ },
  {
    what: "a clock function of SQL's",
    // Written `now()`, or with a space, `now ()`; these take no argument, so prose's "now (T5)"
    // isn't one.
    pattern: /\b(?:now|clock_timestamp|statement_timestamp|transaction_timestamp|timeofday)(?:\(|\s+\(\s*\))/i,
  },
  {
    what: "a clock keyword of SQL's",
    pattern: /\b(?:current_timestamp|current_date|current_time|localtimestamp|localtime)\b/i,
  },
  // `age(t)` with one argument measures from today's midnight.
  { what: "SQL's age()", pattern: /\bage\s*\(/i },
  {
    what: "a clock literal of SQL's",
    // The word alone or with a time on either side: 'now', 'today 07:00', '01:00 tomorrow'.
    pattern: /'\s*(?:now|today|tomorrow|yesterday)\b[^']*'|'[^']*\b(?:now|today|tomorrow|yesterday)\s*'/i,
  },
  { what: "the tests' fake clock", pattern: /\bfakeClock\b|@tadayo\/domain\/testing/ },
] as const;

/** Why the root harness of the photo user's tests reads a clock (KEPT). */
const HARNESS =
  "the root harness of services/worker/src/privileges.test.ts, which only that test starts, as root: it times how soon the worker killed a fake photo process (past its memory, past its deadline), and no request, job or rule of a day reads it";

/**
 * Lines that read a clock and decide nothing by it, each with its reason. The match is the whole
 * line, trimmed, so any change to one is scanned again.
 */
const KEPT: readonly { file: string; line: string; why: string }[] = [
  {
    file: join("tools", "ops", "src", "migrate.ts"),
    line: "applied_at timestamptz NOT NULL DEFAULT pg_catalog.now()",
    why: "the migration runner's record of when it applied a file, which nothing compares with a day's instants",
  },
  {
    file: join("tools", "ops", "src", "dev-clock.ts"),
    line: "SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) OPERATOR(pg_catalog.*) 1000000)",
    why: "the dev clock's own tool: an instant becomes an offset only by Postgres's own clock, which the offset is from; it runs by hand on dev only (environment.ts), and no request, job or rule of a day reads it",
  },
  {
    file: join("services", "worker", "src", "privileges-harness.ts"),
    line: 'appendFileSync(out + "memory.log", String(Date.now()) + "\\n");',
    why: HARNESS,
  },
  {
    file: join("services", "worker", "src", "privileges-harness.ts"),
    line: "const started = Date.now();",
    why: HARNESS,
  },
  {
    file: join("services", "worker", "src", "privileges-harness.ts"),
    line: "const settledAt = Date.now();",
    why: HARNESS,
  },
];

/** The server's folders (docs/MILESTONES.md, "Lanes"), but `tests/`, whole: each must be there. */
const ROOTS = ["packages", "services", "db", join("apps", "web"), join("tools", "ops")];
const SCANNED = /\.(?:ts|mts|cts|js|mjs|cjs|sql|html)$/;
const TEST = /\.test\.(?:ts|mts|cts|js|mjs|cjs)$/;

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" }).map((entry) => join(dir, entry));
}

/**
 * A file the scan reads: code, SQL or a web page anywhere under a root, in `src` or out of it,
 * but a test, a dependency, or the time module itself. Swift isn't among them.
 */
export function isProductFile(file: string): boolean {
  return (
    SCANNED.test(file) && !TEST.test(file) && !file.split(sep).includes("node_modules") && !file.startsWith(TIME_MODULE)
  );
}

function productFiles(): string[] {
  return ROOTS.flatMap(walk).filter(isProductFile).sort();
}

/** Each line of `text` that reads a clock, as "file:line: what", leaving out the lines KEPT. */
export function clockReads(file: string, text: string): string[] {
  const found: string[] = [];
  text.split("\n").forEach((line, index) => {
    if (KEPT.some((kept) => kept.file === file && kept.line === line.trim())) return;
    for (const read of READS) {
      if (read.pattern.test(line)) found.push(`${file}:${String(index + 1)}: ${read.what}`);
    }
  });
  return found;
}

describe("only the time module reads a clock (T1)", () => {
  it("finds every package, service, migration and ops script to look at, and no test", () => {
    const files = productFiles();
    for (const file of [
      "db/bootstrap.sql",
      "db/migrations/0006_contributions.sql",
      "packages/contracts/scripts/openapi.ts",
      "packages/contracts/src/common.ts",
      "packages/domain/src/index.ts",
      "services/api/src/index.ts",
      "services/worker/src/index.ts",
      "tools/ops/src/migrate.ts",
      "tools/ops/sql/dev_clock.sql",
    ]) {
      expect(files).toContain(join(...file.split("/")));
    }
    expect(files.some((file) => file.startsWith(TIME_MODULE))).toBe(false);
    expect(files.some((file) => TEST.test(file))).toBe(false);
  });

  it('looks in every folder the server\'s lane owns but its tests (docs/MILESTONES.md, "Lanes")', () => {
    const row = readFileSync(join(ROOT, "docs", "MILESTONES.md"), "utf8")
      .split("\n")
      .find((line) => line.startsWith("| **api** |"));
    const owned = [...(row ?? "").matchAll(/`([^`]+)`/g)].map((match) => (match[1] ?? "").replace(/\/$/, ""));
    expect(owned).toContain("services");
    for (const folder of owned) {
      const path = join(ROOT, ...folder.split("/"));
      if (folder === "tests" || !existsSync(path) || !statSync(path).isDirectory()) continue;
      const scanned = ROOTS.some((root) => (join(...folder.split("/")) + sep).startsWith(root + sep));
      expect(scanned, folder).toBe(true);
    }
  });

  it("would look at code, SQL or a page anywhere under them, in src or out of it", () => {
    for (const file of [
      "packages/domain/src/authorization/read.sql",
      "packages/domain/authorization/media.ts",
      "services/worker/main.ts",
      "services/api/src/routes/days.mjs",
      "apps/web/src/invite.js",
      "apps/web/invite.html",
      "tools/ops/src/dev-clock.ts",
    ]) {
      expect(isProductFile(join(...file.split("/"))), file).toBe(true);
    }
    for (const file of [
      "packages/domain/src/time/clock.ts",
      "services/api/src/routes.test.ts",
      "packages/domain/node_modules/postgres/src/index.js",
      "packages/contracts/openapi.yaml",
      "packages/swift/TadayoCore/Sources/TadayoCore/Countdown.swift",
    ]) {
      expect(isProductFile(join(...file.split("/"))), file).toBe(false);
    }
  });

  it("finds no other code that reads the time", () => {
    const found = productFiles().flatMap((file) => clockReads(file, readFileSync(join(ROOT, file), "utf8")));
    expect(found).toEqual([]);
  });

  it("keeps only lines that are still there, each with its reason", () => {
    for (const kept of KEPT) {
      const lines = readFileSync(join(ROOT, kept.file), "utf8")
        .split("\n")
        .map((line) => line.trim());
      expect(lines, kept.file).toContain(kept.line);
      expect(kept.why).not.toBe("");
    }
  });

  it("catches each way of reading it", () => {
    for (const line of [
      "const t = Date.now();",
      "const t = performance.now();",
      "const t = new Date();",
      "const t = new Date;",
      "const s = Date();",
      "Temporal.Now.instant()",
      "process.hrtime.bigint()",
      "const origin = performance.timeOrigin;",
      "const t = new globalThis.Date();",
      "const t = Reflect.construct(Date, []);",
      'new Intl.DateTimeFormat("en-GB").format()',
      "formatter.formatToParts( )",
      "sql`SELECT now()`",
      "SELECT now ()",
      "SELECT clock_timestamp( )",
      "DEFAULT pg_catalog.now()",
      "sql`SELECT clock_timestamp()`",
      "WHERE reveal_at <= CURRENT_TIMESTAMP",
      "SELECT localtimestamp",
      "SELECT transaction_timestamp()",
      "WHERE reveal_at <= 'now'::timestamptz",
      "SELECT timestamptz 'now'",
      "WHERE local_date = 'today'::date",
      "SELECT CAST('Tomorrow' AS date)",
      "WHERE reveal_at <= 'today 07:00'::timestamptz",
      "WHERE close_at <= 'tomorrow 01:00'",
      "SELECT '07:00 today'::timestamptz",
      "SELECT timestamptz 'yesterday 07:00+00'",
      "SELECT age(reveal_at) > interval '1 day'",
      "SELECT AGE (reveal_at)",
      'import { fakeClock } from "@tadayo/domain/testing";',
      "const clock = fakeClock(start);",
    ]) {
      expect(clockReads("x.ts", line), line).not.toEqual([]);
    }
    for (const line of [
      "new Date(Date.parse(day))",
      "new Date(instant)",
      "const d = nextDate(date);",
      "x.Date(1)",
      "// Home shows the day now (T5)",
      "// the members active now (T7)",
      "snow()",
      "reveal_at <= $1",
      "const nowish = 1;",
      'const label = "Today";',
      "formatter.format(new Date(instant))",
      "SELECT '2026-11-13 07:00:00+00'::timestamptz",
      "// a member's day isn't open now, so it's hidden",
      "const page = usage(1) + message(2);",
    ]) {
      expect(clockReads("x.ts", line), line).toEqual([]);
    }
  });

  it("leaves the dev clock's table out of every numbered migration, which prod runs too (ADR-013)", () => {
    const migrations = walk("db").filter((file) => file.startsWith(MIGRATIONS) && file.endsWith(".sql"));
    expect(migrations.length).toBeGreaterThan(0);
    for (const file of migrations) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).not.toMatch(/dev_clock/i);
    }
  });
});
