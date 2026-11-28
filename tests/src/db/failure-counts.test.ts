// The failure counts on Postgres as `tadayo_app` (the outside audit's B7; db/migrations/0020_failure_counts.sql;
// packages/domain/src/failure-count.ts; docs/plans/api-b2-failure-alerts.md, sections 1.1 and 1.2): the first count of
// a code makes its row and later ones add to it, counts made at once all land, the schema refuses what no writer may
// write, the table is closed like every table of `app` (T53), and the API counts each 5xx it answers through its own
// pool, after the answer.
//
// Every code here carries a random part of its own, so the rows are this file's alone; they are removed at the end.

import { randomBytes } from "node:crypto";
import { buildApp, connect } from "@tadayo/api";
import { noStorage } from "@tadayo/api/testing";
import { countFailures, isPlainLoopback, type Clock } from "@tadayo/domain";
import { Fault } from "@tadayo/domain/fault";
import { afterAll, describe, expect, it, vi } from "vitest";
import { adminSql, appSql, worldSql } from "./harness.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("set DATABASE_URL, as the ci step db-tests does (tools/ci/ci_steps.py)");

const app = appSql();
const codes: string[] = [];
afterAll(async () => {
  await app.end();
  if (codes.length === 0) return;
  if (!isPlainLoopback(process.env["DATABASE_ADMIN_URL"] ?? "")) {
    throw new Error("failure-counts: DATABASE_ADMIN_URL isn't a database on this machine, so nothing is removed");
  }
  const admin = adminSql();
  try {
    await admin`DELETE FROM app.failure_counts WHERE code IN ${admin(codes)}`;
  } finally {
    await admin.end();
  }
});

/** A code of this file's own, as a site code would read. */
function code(prefix = "Fault"): string {
  const made = `${prefix}:test_${randomBytes(6).toString("hex")}_1`;
  codes.push(made);
  return made;
}

async function rowOf(source: string, made: string): Promise<{ total: string; reported: string } | null> {
  const [found] = await app<{ total: string; reported: string }[]>`
    SELECT total::text AS total, reported::text AS reported FROM app.failure_counts
     WHERE source = ${source} AND code = ${made}`;
  return found ?? null;
}

/** Postgres's refusal of `statement`, by its SQLSTATE, in a transaction of its own that is rolled back. */
async function refusedWith(statement: (tx: typeof app) => Promise<unknown>): Promise<string | undefined> {
  try {
    await app.begin(async (tx) => {
      await statement(tx as unknown as typeof app);
    });
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe("countFailures on Postgres", () => {
  it("makes a code's row with its first count, and adds each later one to it, under each source apart", async () => {
    const one = code();
    const two = code("PostgresError");
    expect(await rowOf("api", one)).toBeNull();
    await countFailures(app, "api", new Map([[one, 1]]));
    expect(await rowOf("api", one)).toEqual({ total: "1", reported: "0" });
    await countFailures(
      app,
      "api",
      new Map([
        [one, 2],
        [two, 5],
      ]),
    );
    expect(await rowOf("api", one)).toEqual({ total: "3", reported: "0" });
    expect(await rowOf("api", two)).toEqual({ total: "5", reported: "0" });
    await countFailures(app, "worker", new Map([[one, 1]]));
    expect(await rowOf("worker", one)).toEqual({ total: "1", reported: "0" });
    expect(await rowOf("api", one)).toEqual({ total: "3", reported: "0" });
  });

  it("loses none of forty counts made at once over ten connections, the first ones racing to make the row", async () => {
    const made = code();
    const other = code();
    const pool = worldSql(10);
    try {
      await Promise.all(
        Array.from({ length: 40 }, (_, n) =>
          countFailures(
            pool,
            "api",
            new Map(
              n % 2 === 0
                ? [
                    [made, 1],
                    [other, 1],
                  ]
                : [
                    [other, 1],
                    [made, 1],
                  ],
            ),
          ),
        ),
      );
    } finally {
      await pool.end();
    }
    expect(await rowOf("api", made)).toEqual({ total: "40", reported: "0" });
    expect(await rowOf("api", other)).toEqual({ total: "40", reported: "0" });
  });
});

describe("the table's own rules (db/migrations/0020_failure_counts.sql)", () => {
  it("refuses a code outside the pattern, a source outside the two, and counts no writer makes", async () => {
    const made = code();
    const cases: [string, (tx: typeof app) => Promise<unknown>][] = [
      ["a space", (tx) => tx`INSERT INTO app.failure_counts (source, code, total) VALUES ('api', 'a b', 1)`],
      ["a bar", (tx) => tx`INSERT INTO app.failure_counts (source, code, total) VALUES ('api', 'a|b', 1)`],
      ["an at", (tx) => tx`INSERT INTO app.failure_counts (source, code, total) VALUES ('api', 'a@b', 1)`],
      ["empty", (tx) => tx`INSERT INTO app.failure_counts (source, code, total) VALUES ('api', '', 1)`],
      [
        "201 characters",
        (tx) => tx`INSERT INTO app.failure_counts (source, code, total) VALUES ('api', ${"x".repeat(201)}, 1)`,
      ],
      ["a source", (tx) => tx`INSERT INTO app.failure_counts (source, code, total) VALUES ('web', ${made}, 1)`],
      ["no count", (tx) => tx`INSERT INTO app.failure_counts (source, code, total) VALUES ('api', ${made}, 0)`],
      [
        "a negative count",
        (tx) => tx`INSERT INTO app.failure_counts (source, code, total) VALUES ('api', ${made}, -1)`,
      ],
      [
        "reported past the total",
        (tx) => tx`INSERT INTO app.failure_counts (source, code, total, reported) VALUES ('api', ${made}, 2, 3)`,
      ],
      [
        "a negative reported",
        (tx) => tx`INSERT INTO app.failure_counts (source, code, total, reported) VALUES ('api', ${made}, 2, -1)`,
      ],
      ["a null total", (tx) => tx`INSERT INTO app.failure_counts (source, code, total) VALUES ('api', ${made}, NULL)`],
    ];
    for (const [name, statement] of cases) {
      expect(await refusedWith(statement), name).toMatch(/^(23514|23502)$/);
    }
    // The longest code the pattern takes, and a row whose every count is reported, are taken.
    const longest = `${made}${"x".repeat(200 - made.length)}`;
    codes.push(longest);
    await app`INSERT INTO app.failure_counts (source, code, total, reported) VALUES ('api', ${longest}, 2, 2)`;
    expect(await rowOf("api", longest)).toEqual({ total: "2", reported: "2" });
    // An update can't take reported past the total either, nor lower a count or a mark, nor move a row.
    const updates: [string, (tx: typeof app) => Promise<unknown>, string][] = [
      [
        "reported past the total",
        (tx) => tx`UPDATE app.failure_counts SET reported = total + 1 WHERE source = 'api' AND code = ${longest}`,
        "23514",
      ],
      [
        "a lower total",
        (tx) => tx`UPDATE app.failure_counts SET total = 1, reported = 1 WHERE source = 'api' AND code = ${longest}`,
        "23000",
      ],
      [
        "a lower mark",
        (tx) => tx`UPDATE app.failure_counts SET reported = 1 WHERE source = 'api' AND code = ${longest}`,
        "23000",
      ],
      [
        "another code",
        (tx) => tx`UPDATE app.failure_counts SET code = ${made} WHERE source = 'api' AND code = ${longest}`,
        "23000",
      ],
      [
        "another source",
        (tx) => tx`UPDATE app.failure_counts SET source = 'worker' WHERE source = 'api' AND code = ${longest}`,
        "23000",
      ],
    ];
    for (const [name, statement, sqlstate] of updates) expect(await refusedWith(statement), name).toBe(sqlstate);
    expect(await rowOf("api", longest)).toEqual({ total: "2", reported: "2" });
  });

  it("is closed like every table of app: row level security on, with no policy (T53)", async () => {
    const [table] = await app<{ rls: boolean; policies: number; owner: string }[]>`
      SELECT c.relrowsecurity AS rls, c.relowner::regrole::text AS owner,
             (SELECT count(*)::int FROM pg_catalog.pg_policy p WHERE p.polrelid = c.oid) AS policies
        FROM pg_catalog.pg_class c WHERE c.oid = 'app.failure_counts'::regclass`;
    expect(table).toEqual({ rls: true, policies: 0, owner: "tadayo_app" });
  });
});

describe("the API's 5xx, counted through its own pool (services/api/src/failure-count.ts)", () => {
  it("counts each 500 by its error's class and site code, once the answer has gone", async () => {
    const siteCode = `test_${randomBytes(6).toString("hex")}_1`;
    const made = `Fault:${siteCode}`;
    codes.push(made);
    const api = connect(DATABASE_URL);
    const server = buildApp({
      sql: api,
      clock: {} as Clock,
      // The gate's seam throws the code's own failure, as a route's would.
      authenticate: () => Promise.reject(new Fault(siteCode, "a failure of the test's own: ana@example.invalid")),
      storage: noStorage,
      log: { level: "silent" },
    });
    try {
      await server.ready();
      expect((await server.inject({ method: "GET", url: "/v1/me" })).statusCode).toBe(500);
      expect((await server.inject({ method: "GET", url: "/v1/me" })).statusCode).toBe(500);
      await vi.waitFor(
        async () => {
          expect(await rowOf("api", made)).toEqual({ total: "2", reported: "0" });
        },
        { timeout: 10_000, interval: 50 },
      );
    } finally {
      await server.close();
    }
  });
});
