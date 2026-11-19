/// <reference lib="esnext.temporal" />
// The worker's first job against Postgres (services/worker/src/generation.ts and main.ts; spec 05, 34;
// T1, T52; FQ115): a pass makes each club's days in a transaction of its own, one club's failure or held
// row stops no other's, a pass told to stop visits no further club, and the worker's own process makes a
// club's days by the server's clock and stops cleanly.
//
// The passes here visit only this file's clubs, through the pass's own work-list argument: the database
// is shared with every other file, whose committed clubs a whole pass would also visit. The process at
// the end runs a whole pass, as the worker does; days made for another file's leftover club are days that
// club is owed.

import { spawn } from "node:child_process";
import { join } from "node:path";
import { clubsWithAWeek } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { generationPass, LOCK_WAIT_MS, type WorkerSql } from "@tadayo/worker";
import { afterAll, describe, expect, it } from "vitest";
import { worldSql, type WorldTx } from "./harness.ts";
import { clubOf, confirmedWeek, forgetCommittedDays, holding, waitingOn } from "./week-world.ts";

const db = worldSql(6);
afterAll(async () => {
  await db.end();
  // The committed runs below leave days no rollback takes away.
  await forgetCommittedDays();
});

const world = db as unknown as WorldTx;
const worker = db as unknown as WorkerSql;
const TIMES = { opened: "2026-11-02T14:00:00Z", confirmed: "2026-11-04T14:00:00.123456Z" };
const NOW = "2026-11-06T14:41:00Z";
const only =
  (...ids: string[]) =>
  () =>
    Promise.resolve(ids);

async function count(club: string): Promise<number> {
  const [row] = await world<{ n: number }[]>`
    SELECT pg_catalog.count(*)::int4 AS n FROM app.occurrences WHERE club_id = ${club}`;
  return row?.n ?? -1;
}

describe("a generation pass (spec 05, 34)", () => {
  it("makes every listed club's days and counts them", async () => {
    const six = await db.begin((tx) => confirmedWeek(tx, 6, TIMES));
    const two = await db.begin((tx) => confirmedWeek(tx, 2, TIMES));
    const result = await generationPass(worker, fakeClock(NOW), only(six.club, two.club));
    // The six's 25 days to Saturday 5 December, and the two's 16: no Saturday is either's.
    expect(result).toEqual({ clubs: 2, made: 41, failures: [] });
    expect(await count(six.club)).toBe(25);
    expect(await count(two.club)).toBe(16);
    // A second pass finds nothing to make.
    expect(await generationPass(worker, fakeClock(NOW), only(six.club, two.club))).toEqual({
      clubs: 2,
      made: 0,
      failures: [],
    });
  });

  it("goes on to the next club when one fails, and reports the failure by the error's class alone", async () => {
    const before = await db.begin((tx) => confirmedWeek(tx, 6, TIMES));
    const after = await db.begin((tx) => confirmedWeek(tx, 6, TIMES));
    // The middle one can't be a club's id, which the command refuses.
    const result = await generationPass(worker, fakeClock(NOW), only(before.club, "not an id", after.club));
    // What isn't an id isn't repeated either.
    expect(result).toEqual({ clubs: 3, made: 50, failures: ["a club with no id: TypeError"] });
    expect(await count(before.club)).toBe(25);
    expect(await count(after.club)).toBe(25);
  });

  it(
    "gives up on a club whose row stays held, names it by its id and Postgres's code, and makes the next club's days",
    { timeout: 30_000 },
    async () => {
      const stuck = await db.begin((tx) => confirmedWeek(tx, 6, TIMES));
      const free = await db.begin((tx) => confirmedWeek(tx, 6, TIMES));
      const hold = await holding(db, stuck.club);
      const began = performance.now();
      try {
        const result = await generationPass(worker, fakeClock(NOW), only(stuck.club, free.club));
        // 55P03 is lock_not_available: the wait for the club's row ran out.
        expect(result).toEqual({ clubs: 2, made: 25, failures: [`${stuck.club}: PostgresError 55P03`] });
        const waited = performance.now() - began;
        expect(waited).toBeGreaterThanOrEqual(LOCK_WAIT_MS - 100);
        expect(waited).toBeLessThan(LOCK_WAIT_MS + 5_000);
        expect(await count(stuck.club)).toBe(0);
        expect(await count(free.club)).toBe(25);
      } finally {
        await hold.release();
      }
      // The next pass, with the row free, makes them.
      expect(await generationPass(worker, fakeClock(NOW), only(stuck.club, free.club))).toEqual({
        clubs: 2,
        made: 25,
        failures: [],
      });
    },
  );

  it("visits no further club once it is told to stop, and finishes the one it is on", async () => {
    const first = await db.begin((tx) => confirmedWeek(tx, 6, TIMES));
    const second = await db.begin((tx) => confirmedWeek(tx, 6, TIMES));
    let asked = 0;
    // Asked before each club: the stop comes while the first is being made.
    const stopping = () => (asked += 1) > 1;
    const result = await generationPass(worker, fakeClock(NOW), only(first.club, second.club), stopping);
    expect(result).toEqual({ clubs: 1, made: 25, failures: [] });
    expect(await count(first.club)).toBe(25);
    expect(await count(second.club)).toBe(0);
    // Already told to stop, a pass visits none.
    expect(await generationPass(worker, fakeClock(NOW), only(first.club, second.club), () => true)).toEqual({
      clubs: 0,
      made: 0,
      failures: [],
    });
  });

  it(
    "commits each club on its own: a club made before one that waits is already there",
    { timeout: 20_000 },
    async () => {
      const first = await db.begin((tx) => confirmedWeek(tx, 6, TIMES));
      const second = await db.begin((tx) => confirmedWeek(tx, 6, TIMES));
      const hold = await holding(db, second.club);
      const pass = generationPass(worker, fakeClock(NOW), only(first.club, second.club));
      try {
        await waitingOn(db, hold.pid);
        expect(await count(first.club)).toBe(25);
        expect(await count(second.club)).toBe(0);
      } finally {
        await hold.release();
        await pass.catch(() => undefined);
      }
      expect((await pass).made).toBe(50);
    },
  );

  it("visits every club with a week when it is given no list", async () => {
    const mine = await db.begin((tx) => confirmedWeek(tx, 6, TIMES));
    const bare = await db.begin((tx) => clubOf(tx, 4));
    const listed = await clubsWithAWeek(world);
    expect(listed).toContain(mine.club);
    expect(listed).not.toContain(bare.club);
    // The pass with no list, as the worker runs it: every listed club is visited, this one's days made.
    const result = await generationPass(worker, fakeClock(NOW));
    expect(result.clubs).toBe(listed.length);
    expect(result.failures).toEqual([]);
    expect(await count(mine.club)).toBe(25);
    expect(await count(bare.club)).toBe(0);
  });
});

describe("the worker's process (T1)", () => {
  const ENTRY = join(import.meta.dirname, "..", "..", "..", "services", "worker", "src", "main.ts");

  it(
    "makes a club's days by the server's clock soon after it starts, says only how many, and stops cleanly",
    { timeout: 60_000 },
    async () => {
      const url = process.env.DATABASE_URL ?? "";
      expect(url, "set DATABASE_URL, as the ci step db-tests does").not.toBe("");
      // The worker runs by the real clock, so this club's week is dated from it: opened three days ago
      // and confirmed two days ago, every day's first date has come or comes within the week.
      const real = Temporal.Now.instant().round("second");
      const mine = await db.begin((tx) =>
        confirmedWeek(tx, 6, {
          opened: real.subtract({ hours: 72 }).toString(),
          confirmed: real.subtract({ hours: 48 }).toString(),
        }),
      );
      expect(await count(mine.club)).toBe(0);
      const child = spawn(process.execPath, [ENTRY], {
        env: { PATH: process.env.PATH ?? "", DATABASE_URL: url, TADAYO_ENVIRONMENT: "prod" },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      const exited = new Promise<number | null>((done) => child.on("close", done));
      try {
        for (let tries = 0; tries < 400 && !/worker: made \d+ days?\n/.test(stdout); tries += 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        expect(stdout, stderr).toMatch(/^worker: started, making days every minute\nworker: made \d+ days?\n$/);
      } finally {
        child.kill("SIGTERM");
      }
      expect(await exited).toBe(0);
      expect(stdout).toMatch(/worker: stopped on SIGTERM\n$/);
      expect(stderr).toBe("");
      // Its last day is the Saturday of the fourth week after this one in New York (FQ115), worked out
      // here from the real date alone: this week's Monday plus 33 days. Its first is today's, if today
      // isn't a Sunday and 7 AM there hasn't come, or else the next day that isn't a Sunday.
      const zoned = real.toZonedDateTimeISO("America/New_York");
      const today = zoned.toPlainDate();
      const last = today.subtract({ days: today.dayOfWeek - 1 }).add({ days: 33 });
      const opened = today.dayOfWeek === 7 || zoned.hour >= 7;
      let first = opened ? today.add({ days: 1 }) : today;
      if (first.dayOfWeek === 7) first = first.add({ days: 1 });
      const [ends] = await world<{ first: string; last: string; n: number }[]>`
        SELECT pg_catalog.min(local_date)::text AS first, pg_catalog.max(local_date)::text AS last,
               pg_catalog.count(*)::int4 AS n
          FROM app.occurrences WHERE club_id = ${mine.club}`;
      expect(ends?.last).toBe(last.toString());
      expect(ends?.first).toBe(first.toString());
      // Every date between them but the Sundays.
      const span = first.until(last, { largestUnit: "days" }).days + 1;
      const sundays = Array.from({ length: span }, (_, index) => first.add({ days: index })).filter(
        (date) => date.dayOfWeek === 7,
      ).length;
      expect(ends?.n).toBe(span - sundays);
      const [late] = await world<{ n: number }[]>`
        SELECT pg_catalog.count(*)::int4 AS n FROM app.occurrences
         WHERE club_id = ${mine.club} AND reveal_at <= collecting_from`;
      expect(late?.n).toBe(0);
      // Nothing it wrote names a club, a member or a date.
      expect(stdout).not.toContain(mine.club);
      for (const member of mine.members) expect(stdout).not.toContain(member);
    },
  );
});
