// Only the time module reads a clock (T1; TECH-DESIGN section 5: "Nothing else reads the system
// clock"). A route, a job, a migration or an ops script that read the time for itself would decide
// by a clock that the dev clock can't move and the tests' fake clock can't hold, and in SQL `now()`
// and the literal 'now' are the transaction's start, before any lock (ADR-013). Tests may read
// clocks. The tests' fake clock, for its part, appears in no product code, and no numbered
// migration, which every environment runs, makes the dev clock's table.

import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const TIME_MODULE = join("packages", "domain", "src", "time") + sep;
const MIGRATIONS = join("db", "migrations") + sep;

const READS = [
  { what: "Date.now()", pattern: /\bDate\s*\.\s*now\b/ },
  { what: "performance.now()", pattern: /\bperformance\s*\.\s*now\b/ },
  { what: "new Date() with no argument", pattern: /\bnew\s+Date\s*\(\s*\)/ },
  { what: "new Date with no parentheses", pattern: /\bnew\s+Date\b(?!\s*\()/ },
  { what: "Date() without new", pattern: /(?<!\bnew\s+)(?<![\w$.])Date\s*\(/ },
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
  { what: "a clock literal of SQL's", pattern: /'\s*(?:now|today|tomorrow|yesterday)\s*'/i },
  { what: "the tests' fake clock", pattern: /\bfakeClock\b|@tadayo\/domain\/testing/ },
] as const;

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
];

const CODE = /\.(?:ts|mts|cts|js|mjs|cjs)$/;
const TEST = /\.test\.(?:ts|mts|cts|js|mjs|cjs)$/;

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" });
  } catch {
    return [];
  }
  return entries.map((entry) => join(dir, entry));
}

/**
 * The product's code: every package's and service's `src`, the ops scripts and their SQL, and
 * every SQL file under `db/`. Test files and the time module itself are left out.
 */
function productFiles(): string[] {
  const code: string[] = [];
  for (const parent of ["packages", "services"]) {
    for (const name of readdirSync(join(ROOT, parent))) code.push(...walk(join(parent, name, "src")));
  }
  code.push(...walk(join("tools", "ops", "src")));
  const sql = [...walk("db"), ...walk(join("tools", "ops", "sql"))].filter((file) => file.endsWith(".sql"));
  return [...code.filter((file) => CODE.test(file) && !TEST.test(file)), ...sql]
    .filter((file) => !file.includes(`node_modules${sep}`) && !file.startsWith(TIME_MODULE))
    .sort();
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
  it("finds the migrations, the ops scripts and the domain's own code to look at", () => {
    const files = productFiles();
    expect(files).toContain(join("db", "migrations", "0006_contributions.sql"));
    expect(files).toContain(join("packages", "domain", "src", "index.ts"));
    expect(files).toContain(join("tools", "ops", "src", "migrate.ts"));
    expect(files).toContain(join("tools", "ops", "sql", "dev_clock.sql"));
    expect(files.some((file) => file.startsWith(TIME_MODULE))).toBe(false);
    expect(files.some((file) => TEST.test(file))).toBe(false);
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
