// The failure alert's two reads and writes on Postgres as `tadayo_app` (the outside audit's B7;
// tools/ops/src/failure-alert.ts; docs/plans/api-b2-failure-alerts.md, section 1.4): it reads the counts not yet
// reported, and once GitHub has answered it marks each as reported up to the total it read, never the total there is
// by then, and never lower than a mark already made, in one statement under its own time limits. What it says to
// GitHub, with a fake GitHub, is tools/ops/src/failure-alert.test.ts.
//
// Every code here carries a random part of its own, so the rows are this file's alone; they are removed at the end.

import { randomBytes } from "node:crypto";
import { countFailures, isPlainLoopback } from "@tadayo/domain";
import { markReported, unreportedCounts, type FailureCount } from "@tadayo/ops";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { adminSql, appSql } from "./harness.ts";

const app = appSql();
const codes: string[] = [];
afterAll(async () => {
  await app.end();
  if (codes.length === 0) return;
  if (!isPlainLoopback(process.env["DATABASE_ADMIN_URL"] ?? "")) {
    throw new Error("ops-failure-alert: DATABASE_ADMIN_URL isn't a database on this machine, so nothing is removed");
  }
  // A count is never deleted (0020): the superuser removes this file's rows with the table's triggers off, for that
  // transaction alone.
  const admin = adminSql();
  try {
    await admin.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`DELETE FROM app.failure_counts WHERE code IN ${tx(codes)}`;
    });
  } finally {
    await admin.end();
  }
});

/** Codes of this test's own, sorted as Postgres's "C" collation sorts them. */
function codesOf(n: number): string[] {
  const run = randomBytes(6).toString("hex");
  const made = Array.from({ length: n }, (_, at) => `Fault:alert_${run}_${String(at + 1)}`);
  codes.push(...made);
  return made;
}

/** The unreported counts among `mine`. */
async function unreportedOf(mine: readonly string[]): Promise<FailureCount[]> {
  return (await unreportedCounts(app)).filter((count) => mine.includes(count.code));
}

async function reportedOf(source: string, made: string): Promise<string | undefined> {
  const [found] = await app<{ reported: string }[]>`
    SELECT reported::text AS reported FROM app.failure_counts WHERE source = ${source} AND code = ${made}`;
  return found?.reported;
}

describe("unreportedCounts", () => {
  it("reads each count with more failures than it has reported, in source and code order, totals as whole numbers", async () => {
    const [a, b, c] = codesOf(3) as [string, string, string];
    await countFailures(
      app,
      "worker",
      new Map([
        [b, 2],
        [a, 1],
      ]),
    );
    await countFailures(app, "api", new Map([[c, 3]]));
    expect(await unreportedOf([a, b, c])).toEqual([
      { source: "api", code: c, total: 3n, reported: 0n },
      { source: "worker", code: a, total: 1n, reported: 0n },
      { source: "worker", code: b, total: 2n, reported: 0n },
    ]);
    // A count whose every failure is reported is left out.
    await app`UPDATE app.failure_counts SET reported = total WHERE source = 'worker' AND code = ${a}`;
    expect((await unreportedOf([a, b, c])).map((count) => count.code)).toEqual([c, b]);
  });
});

describe("markReported", () => {
  it("marks the total it read, so a failure counted after the read stays for the next alert", async () => {
    const [made] = codesOf(1) as [string];
    await countFailures(app, "api", new Map([[made, 3]]));
    const read = await unreportedOf([made]);
    expect(read).toEqual([{ source: "api", code: made, total: 3n, reported: 0n }]);
    // Two more while GitHub answers.
    await countFailures(app, "api", new Map([[made, 2]]));
    await markReported(app, read);
    expect(await reportedOf("api", made)).toBe("3");
    expect(await unreportedOf([made])).toEqual([{ source: "api", code: made, total: 5n, reported: 3n }]);
  });

  it("never lowers a mark: an older read marked after a newer one leaves the newer", async () => {
    const [made] = codesOf(1) as [string];
    await countFailures(app, "worker", new Map([[made, 1]]));
    const older = await unreportedOf([made]);
    await countFailures(app, "worker", new Map([[made, 4]]));
    const newer = await unreportedOf([made]);
    await markReported(app, newer);
    expect(await reportedOf("worker", made)).toBe("5");
    await markReported(app, older);
    expect(await reportedOf("worker", made)).toBe("5");
    expect(await unreportedOf([made])).toEqual([]);
  });

  it("marks nothing for no counts, and only the source a count names", async () => {
    const [made] = codesOf(1) as [string];
    await countFailures(app, "api", new Map([[made, 2]]));
    await countFailures(app, "worker", new Map([[made, 2]]));
    await markReported(app, []);
    await markReported(
      app,
      (await unreportedOf([made])).filter((count) => count.source === "worker"),
    );
    expect(await reportedOf("api", made)).toBe("0");
    expect(await reportedOf("worker", made)).toBe("2");
  });

  it("deadlocks with no count: marks and counts of many codes at once, in any order, all finish", async () => {
    const mine = codesOf(6);
    await countFailures(app, "api", new Map(mine.map((made) => [made, 1])));
    const url = process.env["DATABASE_URL"];
    if (!url) throw new Error("set DATABASE_URL, as the ci step db-tests does (tools/ci/ci_steps.py)");
    const pool = postgres(url, { max: 10, onnotice: () => undefined });
    try {
      for (let round = 0; round < 10; round += 1) {
        const read = (await unreportedCounts(pool)).filter((count) => mine.includes(count.code));
        const reversed = new Map([...mine].reverse().map((made) => [made, 1]));
        const settled = await Promise.allSettled([
          markReported(pool, [...read].reverse()),
          countFailures(pool, "api", reversed),
          countFailures(pool, "api", new Map(mine.map((made) => [made, 1]))),
          markReported(pool, read),
        ]);
        expect(
          settled.map((outcome) => outcome.status),
          `round ${String(round)}`,
        ).toEqual(["fulfilled", "fulfilled", "fulfilled", "fulfilled"]);
      }
    } finally {
      await pool.end();
    }
    const totals = await app<{ total: string }[]>`
      SELECT total::text AS total FROM app.failure_counts WHERE source = 'api' AND code IN ${app(mine)}`;
    expect(totals.map((found) => found.total)).toEqual(Array.from({ length: 6 }, () => "21"));
  });

  it("waits at most its own lock limit for a row another writer holds, whatever the session's defaults", async () => {
    const [made] = codesOf(1) as [string];
    await countFailures(app, "api", new Map([[made, 3]]));
    const read = await unreportedOf([made]);
    const url = process.env["DATABASE_URL"];
    if (!url) throw new Error("set DATABASE_URL, as the ci step db-tests does (tools/ci/ci_steps.py)");
    // A session whose own defaults would let it wait without end, and a writer that holds the row meanwhile.
    const unbounded = postgres(url, { max: 1, onnotice: () => undefined });
    await unbounded.unsafe(
      "SET lock_timeout = 0; SET statement_timeout = 0; SET idle_in_transaction_session_timeout = 0",
    );
    const holding = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const holder = app.begin(async (tx) => {
      await tx`SELECT 1 FROM app.failure_counts WHERE source = 'api' AND code = ${made} FOR UPDATE`;
      holding.resolve(undefined);
      await release.promise;
    });
    try {
      await holding.promise;
      const started = performance.now();
      const refused: unknown = await markReported(unbounded, read).catch((error: unknown) => error);
      const waited = performance.now() - started;
      expect((refused as { code?: string }).code).toBe("55P03");
      expect(waited).toBeGreaterThanOrEqual(4_500);
      expect(waited).toBeLessThan(9_000);
    } finally {
      release.resolve(undefined);
      await holder;
    }
    try {
      expect(await reportedOf("api", made)).toBe("0");
      // Once the row is free, the same session marks it; the limits were that transaction's own, so the session's
      // own settings are as they were after it committed.
      await markReported(unbounded, read);
      expect(await reportedOf("api", made)).toBe("3");
      const [after] = await unbounded<{ lock: string; statement: string; idle: string }[]>`
        SELECT pg_catalog.current_setting('lock_timeout') AS lock,
               pg_catalog.current_setting('statement_timeout') AS statement,
               pg_catalog.current_setting('idle_in_transaction_session_timeout') AS idle`;
      expect(after).toEqual({ lock: "0", statement: "0", idle: "0" });
    } finally {
      await unbounded.end();
    }
  }, 20_000);
});
