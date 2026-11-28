// What `countFailures` sends Postgres, and what it refuses before sending anything (the outside audit's B7;
// docs/plans/api-b2-failure-alerts.md, section 1.1). The statement itself, on Postgres with 0020's table, is
// tests/src/db/failure-counts.test.ts.

import { describe, expect, it } from "vitest";
import { countFailures, FAILURE_CODE, FAILURE_SOURCES } from "./failure-count.ts";
import { InputFault } from "./fault.ts";

/** A tagged template that keeps each statement's text and values, and answers with no rows. */
function recording() {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = (template: TemplateStringsArray, ...values: readonly never[]) => {
    calls.push({ text: template.join("$"), values: [...values] });
    return Promise.resolve([] as readonly Record<string, unknown>[]);
  };
  return { sql, calls };
}

describe("countFailures", () => {
  it("adds every count in one statement, the source and the counts bound as values, in code order", async () => {
    const { sql, calls } = recording();
    await countFailures(
      sql,
      "api",
      new Map([
        ["Fault:propose_roster_6", 2],
        ["PostgresError:23505", 1],
        ["Error:ECONNREFUSED", 3],
      ]),
    );
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.text).toMatch(/INSERT INTO app\.failure_counts/);
    expect(call?.text).toMatch(/ON CONFLICT \(source, code\) DO UPDATE SET total = f\.total \+ EXCLUDED\.total/);
    expect(call?.values).toEqual([
      "api",
      JSON.stringify({ "Error:ECONNREFUSED": 3, "Fault:propose_roster_6": 2, "PostgresError:23505": 1 }),
    ]);
  });

  it("sends nothing for no counts", async () => {
    const { sql, calls } = recording();
    await countFailures(sql, "worker", new Map());
    expect(calls).toEqual([]);
  });

  it("takes the worker's codes, a topic and a code", async () => {
    const { sql, calls } = recording();
    await countFailures(sql, "worker", new Map([["upload.prepare:lease_lapsed", 1]]));
    expect(calls[0]?.values).toEqual(["worker", '{"upload.prepare:lease_lapsed":1}']);
  });

  it("refuses a source outside the two, and sends nothing", async () => {
    const { sql, calls } = recording();
    for (const source of ["API", "web", "", "api "]) {
      await expect(
        countFailures(sql, source as (typeof FAILURE_SOURCES)[number], new Map([["unknown", 1]])),
        source,
      ).rejects.toBeInstanceOf(InputFault);
    }
    expect(calls).toEqual([]);
  });

  it("refuses a code outside the table's pattern, and never quotes it", async () => {
    const { sql, calls } = recording();
    const bad = ["", "a b", "Fault:x|y", "ana@example.invalid", "a/b", "é", "x".repeat(201), "line\nbreak"];
    for (const code of bad) {
      expect(FAILURE_CODE.test(code), code).toBe(false);
      const error: unknown = await countFailures(sql, "api", new Map([[code, 1]])).catch((caught: unknown) => caught);
      expect(error, code).toBeInstanceOf(InputFault);
      if (code !== "") expect((error as Error).message, code).not.toContain(code);
    }
    expect(FAILURE_CODE.test("x".repeat(200))).toBe(true);
    expect(calls).toEqual([]);
  });

  it("refuses a count that isn't a whole number from 1", async () => {
    const { sql, calls } = recording();
    for (const n of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(countFailures(sql, "api", new Map([["unknown", n]])), String(n)).rejects.toBeInstanceOf(InputFault);
    }
    expect(calls).toEqual([]);
  });

  it("names the two sources the table takes", () => {
    expect(FAILURE_SOURCES).toEqual(["api", "worker"]);
  });
});
