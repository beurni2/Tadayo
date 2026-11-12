/// <reference lib="esnext.temporal" />
// `tools/ops`' `dev-clock` against Postgres, as `tadayo_app` (docs/plans/B0.md, slice 10a; ADR-013;
// T3, T53). The table is made only inside transactions that roll back, as only `dev` has it
// (clock.test.ts); a test that finds an occurrence committed to the shared database says so
// instead of failing on it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prepareClock } from "@tadayo/domain";
import { closedProblems, devClock, LONGEST_OFFSET_DAYS, OpsError } from "@tadayo/ops";
import { afterAll, describe, expect, it } from "vitest";
import { appSql, rolledBack, type Tx } from "./harness.ts";
import { newWorld } from "./world.ts";

const MAKE_SQL = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "tools", "ops", "sql", "dev_clock.sql"),
  "utf8",
);

const app = appSql();
afterAll(async () => {
  await app.end();
});

const inHours = (hours: number) => Temporal.Now.instant().add({ hours });

async function alone(tx: Tx): Promise<void> {
  const [row] = await tx<{ n: string }[]>`SELECT pg_catalog.count(*)::pg_catalog.text AS n FROM app.occurrences`;
  expect(row?.n, "the test database holds a committed occurrence: no test here may leave one").toBe("0");
}

async function present(tx: Tx): Promise<boolean> {
  const [row] = await tx<{ present: boolean }[]>`
    SELECT pg_catalog.to_regclass('app.dev_clock') IS NOT NULL AS present`;
  return row?.present === true;
}

async function stored(tx: Tx): Promise<{ rows: number; offset: string | null }> {
  const [row] = await tx<{ rows: string; offset: string | null }[]>`
    SELECT pg_catalog.count(*)::pg_catalog.text AS rows, pg_catalog.max(offset_microseconds)::pg_catalog.text AS "offset"
      FROM app.dev_clock`;
  return { rows: Number(row?.rows), offset: row?.offset ?? null };
}

/** What the file made, by its identity: dropping and remaking any of it gives new object ids. */
async function identity(tx: Tx): Promise<string> {
  const [row] = await tx<{ ids: string }[]>`
    SELECT pg_catalog.concat_ws(',',
             'app.dev_clock'::pg_catalog.regclass::pg_catalog.oid,
             'app.dev_clock_forward'::pg_catalog.regproc::pg_catalog.oid,
             (SELECT pg_catalog.string_agg(t.oid::pg_catalog.text || t.tgenabled::pg_catalog.text, ',' ORDER BY t.tgname)
                FROM pg_catalog.pg_trigger t WHERE t.tgrelid = 'app.dev_clock'::pg_catalog.regclass AND NOT t.tgisinternal),
             (SELECT p.prosrc FROM pg_catalog.pg_proc p WHERE p.oid = 'app.dev_clock_forward'::pg_catalog.regproc)) AS ids`;
  return row?.ids ?? "";
}

describe("dev-clock, through the schema's own owner", () => {
  it("makes app.dev_clock when it's missing, closed as the schema demands, and dev's API can start on it", async () => {
    await rolledBack(app, async (tx) => {
      await alone(tx);
      expect(await present(tx)).toBe(false);
      const report = await devClock(tx, { makeSql: MAKE_SQL });
      expect(report.made).toBe(true);
      expect(report.offsetMicroseconds).toBe(0n);
      expect(await closedProblems(tx)).toEqual([]);
      // The check the API runs at start-up, on dev (ADR-013).
      await expect(prepareClock("dev", tx)).resolves.toBeDefined();
      const [owner] = await tx<{ owner: string }[]>`
        SELECT relowner::pg_catalog.regrole::pg_catalog.text AS owner FROM pg_catalog.pg_class
         WHERE oid = 'app.dev_clock'::pg_catalog.regclass`;
      expect(owner?.owner).toBe("tadayo_app");
    });
  });

  it("leaves a table that's there as it is: the same table, triggers and function, and says it made nothing", async () => {
    await rolledBack(app, async (tx) => {
      await devClock(tx, { makeSql: MAKE_SQL });
      const before = await identity(tx);
      expect(before).not.toBe("");
      const again = await devClock(tx, { makeSql: MAKE_SQL });
      expect(again.made).toBe(false);
      await devClock(tx, { makeSql: MAKE_SQL, to: inHours(48) });
      await devClock(tx, { makeSql: MAKE_SQL, to: inHours(72) });
      // Nothing was dropped, remade, disabled or replaced: object ids, trigger states and the function's text hold.
      expect(await identity(tx)).toBe(before);
    });
  });

  it("moves the clock to the instant it's given, to within the milliseconds the run takes", async () => {
    await rolledBack(app, async (tx) => {
      const target = inHours(72).round({ smallestUnit: "second", roundingMode: "floor" });
      const report = await devClock(tx, { makeSql: MAKE_SQL, to: target });
      const lag = report.devNow.epochMilliseconds - target.epochMilliseconds;
      expect(lag).toBeGreaterThanOrEqual(0);
      expect(lag).toBeLessThan(5_000);
      // The report is what the server's clock reads: dev's own sample agrees with it.
      const clock = await prepareClock("dev", tx);
      const sampled = await clock.sample(tx);
      expect(sampled.epochMilliseconds - target.epochMilliseconds).toBeGreaterThanOrEqual(lag);
      expect(sampled.epochMilliseconds - target.epochMilliseconds).toBeLessThan(5_000);
      expect(report.devNow.epochNanoseconds - report.postgresNow.epochNanoseconds).toBe(
        report.offsetMicroseconds * 1000n,
      );
    });
  });

  it("starts with no row, which is no offset, then keeps the one row it makes", async () => {
    await rolledBack(app, async (tx) => {
      await devClock(tx, { makeSql: MAKE_SQL });
      expect(await stored(tx)).toEqual({ rows: 0, offset: null });
      const first = await devClock(tx, { makeSql: MAKE_SQL, to: inHours(24) });
      expect(await stored(tx)).toEqual({ rows: 1, offset: first.offsetMicroseconds.toString() });
      const second = await devClock(tx, { makeSql: MAKE_SQL, to: inHours(48) });
      expect(second.offsetMicroseconds).toBeGreaterThan(first.offsetMicroseconds);
      expect(await stored(tx)).toEqual({ rows: 1, offset: second.offsetMicroseconds.toString() });
    });
  });

  it("without a target, reports the clock as it is and moves nothing", async () => {
    await rolledBack(app, async (tx) => {
      const moved = await devClock(tx, { makeSql: MAKE_SQL, to: inHours(24) });
      const status = await devClock(tx, { makeSql: MAKE_SQL });
      expect(status.made).toBe(false);
      expect(status.offsetMicroseconds).toBe(moved.offsetMicroseconds);
    });
  });

  it("moves forward only: a target before what the clock reads is refused, and the offset stays (T3)", async () => {
    await rolledBack(app, async (tx) => {
      const moved = await devClock(tx, { makeSql: MAKE_SQL, to: inHours(72) });
      await expect(devClock(tx, { makeSql: MAKE_SQL, to: inHours(24) })).rejects.toThrow(/only moves forward/);
      await expect(devClock(tx, { makeSql: MAKE_SQL, to: Temporal.Now.instant() })).rejects.toThrow(OpsError);
      expect(await stored(tx)).toEqual({ rows: 1, offset: moved.offsetMicroseconds.toString() });
    });
  });

  it("refuses a target before Postgres's own clock even with no row, and makes no row", async () => {
    await rolledBack(app, async (tx) => {
      await devClock(tx, { makeSql: MAKE_SQL });
      await expect(devClock(tx, { makeSql: MAKE_SQL, to: inHours(-1) })).rejects.toThrow(/only moves forward/);
      expect(await stored(tx)).toEqual({ rows: 0, offset: null });
    });
  });

  it("refuses a target further ahead than the longest offset, so a typo in the year can't be kept, and goes up to it", async () => {
    await rolledBack(app, async (tx) => {
      await devClock(tx, { makeSql: MAKE_SQL });
      const beyond = devClock(tx, { makeSql: MAKE_SQL, to: inHours((LONGEST_OFFSET_DAYS + 1) * 24) });
      await expect(beyond).rejects.toThrow(/366 days/);
      expect(await stored(tx)).toEqual({ rows: 0, offset: null });
      const near = await devClock(tx, { makeSql: MAKE_SQL, to: inHours((LONGEST_OFFSET_DAYS - 1) * 24) });
      expect(near.offsetMicroseconds).toBeGreaterThan(0n);
    });
  });

  it("refuses to make the table on a database that has occurrences, where a clock back at no offset would reopen days (T3)", async () => {
    await rolledBack(app, async (tx) => {
      await newWorld(tx);
      await expect(devClock(tx, { makeSql: MAKE_SQL })).rejects.toThrow(/has occurrences/);
      expect(await present(tx)).toBe(false);
      // With a target too: the table is still not made.
      await expect(devClock(tx, { makeSql: MAKE_SQL, to: inHours(24) })).rejects.toThrow(/has occurrences/);
      expect(await present(tx)).toBe(false);
    });
  });

  it("goes on moving a table that's there once the database has occurrences", async () => {
    await rolledBack(app, async (tx) => {
      await devClock(tx, { makeSql: MAKE_SQL });
      await newWorld(tx);
      const report = await devClock(tx, { makeSql: MAKE_SQL, to: inHours(24) });
      expect(report.made).toBe(false);
      expect(report.offsetMicroseconds).toBeGreaterThan(0n);
    });
  });

  it("changes nothing when the schema isn't closed (T53), and says what's open", async () => {
    await rolledBack(app, async (tx) => {
      await tx.unsafe("CREATE TABLE app.ops_dev_clock_open (x integer)");
      await expect(devClock(tx, { makeSql: MAKE_SQL })).rejects.toThrow(/isn't closed.*ops_dev_clock_open/);
      expect(await present(tx)).toBe(false);
    });
  });

  it("checks the schema again after it, and keeps nothing when the table it made would leave it open", async () => {
    await rolledBack(app, async (tx) => {
      // The file with one more statement, which opens the table it makes to one of the API roles.
      const opened = `${MAKE_SQL}\nGRANT SELECT ON app.dev_clock TO anon;`;
      await expect(devClock(tx, { makeSql: opened })).rejects.toThrow(
        /would leave the schema app open \(T53\), so nothing is changed.*dev_clock/,
      );
    });
    await rolledBack(app, async (tx) => {
      expect(await present(tx)).toBe(false);
    });
  });

  it("won't move a clock whose guard is off: a disabled trigger is refused, as at the API's start-up", async () => {
    await rolledBack(app, async (tx) => {
      await devClock(tx, { makeSql: MAKE_SQL });
      await tx.unsafe("ALTER TABLE app.dev_clock DISABLE TRIGGER dev_clock_forward");
      await expect(devClock(tx, { makeSql: MAKE_SQL, to: inHours(24) })).rejects.toThrow(
        /as tools\/ops\/sql\/dev_clock\.sql makes it/,
      );
      expect(await stored(tx)).toEqual({ rows: 0, offset: null });
    });
  });
});
