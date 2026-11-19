/// <reference lib="esnext.temporal" />
// The worker's first job against Postgres (services/worker/src/generation.ts and main.ts; spec 05, 34;
// T1, T52; FQ115): a pass makes each club's days in a transaction of its own, one club's failure stops no
// other's, and the worker's own process makes a club's days by the server's clock and stops cleanly.
//
// The passes here visit only this file's clubs, through the pass's own work-list argument: the database
// is shared with every other file, whose committed clubs a whole pass would also visit. The process at
// the end runs a whole pass, as the worker does; days made for another file's leftover club are days that
// club is owed.

import { spawn } from "node:child_process";
import { join } from "node:path";
import { clubsWithAWeek } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { generationPass, type WorkerSql } from "@tadayo/worker";
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
    expect(result).toEqual({ clubs: 2, made: 40, failures: [] });
    expect(await count(six.club)).toBe(24);
    expect(await count(two.club)).toBe(16);
    // A second pass finds nothing to make.
    expect(await generationPass(worker, fakeClock(NOW), only(six.club, two.club))).toEqual({
      clubs: 2,
      made: 0,
      failures: [],
    });
  });

  it("goes on to the next club when one fails, and reports the failure by class alone", async () => {
    const before = await db.begin((tx) => confirmedWeek(tx, 6, TIMES));
    const after = await db.begin((tx) => confirmedWeek(tx, 6, TIMES));
    // The middle one can't be a club's id, which the command refuses.
    const result = await generationPass(worker, fakeClock(NOW), only(before.club, "not an id", after.club));
    expect(result).toEqual({ clubs: 3, made: 48, failures: ["TypeError"] });
    expect(await count(before.club)).toBe(24);
    expect(await count(after.club)).toBe(24);
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
        expect(await count(first.club)).toBe(24);
        expect(await count(second.club)).toBe(0);
      } finally {
        await hold.release();
        await pass.catch(() => undefined);
      }
      expect((await pass).made).toBe(48);
    },
  );

  it("visits every club with a week when it is given no list", async () => {
    const mine = await db.begin((tx) => confirmedWeek(tx, 4, TIMES));
    const bare = await db.begin((tx) => clubOf(tx, 4));
    const listed = await clubsWithAWeek(world);
    expect(listed).toContain(mine.club);
    expect(listed).not.toContain(bare.club);
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
      // Six members and 29 dates, today to today plus 28: four of them Sundays and today's own day
      // opened or not, or five Sundays: 24 or 25 days, by the weekday and the hour it runs at.
      const made = await count(mine.club);
      expect(made).toBeGreaterThanOrEqual(24);
      expect(made).toBeLessThanOrEqual(25);
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
