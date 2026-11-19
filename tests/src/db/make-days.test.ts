/// <reference lib="esnext.temporal" />
// The days a confirmed week makes, against Postgres as `tadayo_app` (packages/domain/src/schedule/
// make-days.ts and generate.ts; spec 05, 06, 34; T1, T2, T6; FQ16, FQ61, FQ63, FQ79, FQ115). The clubs get
// their weeks as the product gives them (week-world.ts), the time is the tests' fake clock, and the
// migration's own guard judges every row the command writes (occurrences_insert_guard).

import { clubsWithAWeek, makeDays, WEEKDAYS } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, describe, expect, it } from "vitest";
import { rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import {
  clubOf,
  confirmedWeek,
  confirmOwn,
  forgetCommittedDays,
  counting,
  holding,
  waitingOn,
  type ConfirmedWeek,
} from "./week-world.ts";
import { AT, checkAsAtCommit, joinByRoster, leave, newId, newUser } from "./world.ts";

const db = worldSql(6);
afterAll(async () => {
  await db.end();
  // The committed runs below leave days no rollback takes away.
  await forgetCommittedDays();
});

const plain = (tx: WorldTx) => tx as unknown as Tx;
const at = (text: string) => Temporal.Instant.from(text);
const NY = "America/New_York";

/** Monday 2 November 2026, 9 AM in New York, and Wednesday the 4th, 9 AM, with microseconds. */
const TIMES = { opened: "2026-11-02T14:00:00Z", confirmed: "2026-11-04T14:00:00.123456Z" };
/** Friday 6 November 2026, 9:41 AM in New York, with microseconds. */
const NOW = "2026-11-06T14:41:00.654321Z";

interface Day {
  local_date: string;
  star_interval_id: string;
  schedule_version_id: string;
  reveal_at: Temporal.Instant;
  close_at: Temporal.Instant;
  collecting_from: Temporal.Instant;
  status: string;
}

async function daysOf(tx: WorldTx, club: string): Promise<Day[]> {
  return tx<Day[]>`
    SELECT local_date::text, star_interval_id, schedule_version_id, reveal_at, close_at, collecting_from, status
      FROM app.occurrences WHERE club_id = ${club} ORDER BY local_date`;
}

/** One run as the worker makes it, then the checks Postgres keeps for COMMIT. */
async function run(tx: WorldTx, club: string, now: string): Promise<number> {
  const made = await tx.savepoint((sp) => makeDays(sp, fakeClock(now), club));
  await checkAsAtCommit(plain(tx));
  return made;
}

/**
 * The six's days from Friday the 6th at 9:41 AM to Saturday 5 December, the last day of the fourth week
 * after this one (FQ115): Friday the 6th has opened, Thursday the 5th was under 24 hours after the
 * confirmation, so Sam's first is the 12th (FQ79).
 */
const SIX_DATES = [
  "2026-11-07",
  "2026-11-09",
  "2026-11-10",
  "2026-11-11",
  "2026-11-12",
  "2026-11-13",
  "2026-11-14",
  "2026-11-16",
  "2026-11-17",
  "2026-11-18",
  "2026-11-19",
  "2026-11-20",
  "2026-11-21",
  "2026-11-23",
  "2026-11-24",
  "2026-11-25",
  "2026-11-26",
  "2026-11-27",
  "2026-11-28",
  "2026-11-30",
  "2026-12-01",
  "2026-12-02",
  "2026-12-03",
  "2026-12-04",
  "2026-12-05",
];
/** The date after `date`. */
const dayAfter = (date: string) => Temporal.PlainDate.from(date).add({ days: 1 }).toString();
/** Monday is index 0: the six's stars from Monday, by their place in the order they joined. */
const starOf = (w: ConfirmedWeek, date: string) => w.members[Temporal.PlainDate.from(date).dayOfWeek - 1];

describe("making a club's days (spec 05; FQ115)", () => {
  it("makes each owed day once, for its star, under its version, with its instants, collecting from the sample", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      expect(await run(tx, w.club, NOW)).toBe(25);
      const days = await daysOf(tx, w.club);
      expect(days.map((day) => day.local_date)).toEqual(SIX_DATES);
      for (const day of days) {
        expect(day.star_interval_id).toBe(starOf(w, day.local_date));
        expect(day.schedule_version_id).toBe(w.version);
        // Every one of these dates is in New York's winter time, five hours behind UTC: 7 AM is 12:00Z
        // and 1 AM on the next date is 06:00Z.
        expect(day.reveal_at).toEqual(at(`${day.local_date}T12:00:00Z`));
        expect(day.close_at).toEqual(at(`${dayAfter(day.local_date)}T06:00:00Z`));
        // The clock's sample, to the microsecond (spec 06: collecting begins when generated).
        expect(day.collecting_from).toEqual(at(NOW));
        expect(day.status).toBe("scheduled");
      }
    });
  });

  it("makes nothing a second time, and only the new week when the club's Monday comes (spec 34)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      await run(tx, w.club, NOW);
      const before = await daysOf(tx, w.club);
      expect(await run(tx, w.club, NOW)).toBe(0);
      expect(await run(tx, w.club, "2026-11-06T23:00:00Z")).toBe(0);
      expect(await daysOf(tx, w.club)).toEqual(before);
      // The rest of the week adds nothing: the window ends on Sunday 6 December all week.
      expect(await run(tx, w.club, "2026-11-07T14:41:00Z")).toBe(0);
      expect(await run(tx, w.club, "2026-11-09T04:59:59.999999Z")).toBe(0);
      // Monday the 9th, midnight in New York: the window now reaches Saturday 12 December.
      expect(await run(tx, w.club, "2026-11-09T05:00:00Z")).toBe(6);
      const after = await daysOf(tx, w.club);
      expect(after.slice(-6).map((day) => day.local_date)).toEqual([
        "2026-12-07",
        "2026-12-08",
        "2026-12-09",
        "2026-12-10",
        "2026-12-11",
        "2026-12-12",
      ]);
      expect(after.at(-1)).toMatchObject({ local_date: "2026-12-12", star_interval_id: w.members[5] });
      expect(after.at(-1)?.collecting_from).toEqual(at("2026-11-09T05:00:00Z"));
      // Nothing already made moved (FQ61).
      expect(after.slice(0, -6)).toEqual(before);
      expect(await run(tx, w.club, "2026-11-10T14:41:00Z")).toBe(0);
    });
  });

  it("never makes a day at or after its 7 AM", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      // Saturday the 7th opens at 12:00Z: at that instant it is no longer owed.
      await run(tx, w.club, "2026-11-07T12:00:00Z");
      const late = (await daysOf(tx, w.club)).map((day) => day.local_date);
      expect(late).not.toContain("2026-11-07");
      expect(late[0]).toBe("2026-11-09");
    });
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      await run(tx, w.club, "2026-11-07T11:59:59.999999Z");
      expect((await daysOf(tx, w.club))[0]?.local_date).toBe("2026-11-07");
    });
  });

  it("makes the days of the members who have confirmed while the others still choose (FQ55)", async () => {
    await rolledBack(db, async (tx) => {
      // Maya and Alex alone have confirmed: Tuesday and Wednesday.
      const w = await confirmedWeek(tx, 6, TIMES, { who: [1, 2] });
      expect(await run(tx, w.club, NOW)).toBe(8);
      const days = await daysOf(tx, w.club);
      expect(days.map((day) => day.local_date)).toEqual([
        "2026-11-10",
        "2026-11-11",
        "2026-11-17",
        "2026-11-18",
        "2026-11-24",
        "2026-11-25",
        "2026-12-01",
        "2026-12-02",
      ]);
      expect(new Set(days.map((day) => day.star_interval_id))).toEqual(new Set([w.members[1], w.members[2]]));
    });
  });

  it("gives a club of two its four days a week, two each", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 2, TIMES);
      await run(tx, w.club, NOW);
      const days = await daysOf(tx, w.club);
      // Monday and Thursday are Ben's, Tuesday and Friday Maya's; Friday the 6th has opened and
      // Thursday the 5th came too soon.
      expect(days.map((day) => day.local_date)).toEqual([
        "2026-11-09",
        "2026-11-10",
        "2026-11-12",
        "2026-11-13",
        "2026-11-16",
        "2026-11-17",
        "2026-11-19",
        "2026-11-20",
        "2026-11-23",
        "2026-11-24",
        "2026-11-26",
        "2026-11-27",
        "2026-11-30",
        "2026-12-01",
        "2026-12-03",
        "2026-12-04",
      ]);
      const ben = days.filter((day) => day.star_interval_id === w.members[0]).map((day) => day.local_date);
      expect(ben).toEqual([
        "2026-11-09",
        "2026-11-12",
        "2026-11-16",
        "2026-11-19",
        "2026-11-23",
        "2026-11-26",
        "2026-11-30",
        "2026-12-03",
      ]);
    });
  });

  it("makes no day for a member who has left, and goes on making everyone else's (FQ63)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      await leave(
        plain(tx),
        { user: w.users[5] ?? "", interval: w.members[5] ?? "" },
        "Nina",
        new Date("2026-11-05T12:00:00Z"),
      );
      expect(await run(tx, w.club, NOW)).toBe(20);
      const days = await daysOf(tx, w.club);
      expect(days.some((day) => day.star_interval_id === w.members[5])).toBe(false);
      expect(days.some((day) => Temporal.PlainDate.from(day.local_date).dayOfWeek === 6)).toBe(false);
    });
  });

  it("makes no day for a club left with one member (FQ16), and keeps the days it had", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 2, TIMES);
      await run(tx, w.club, NOW);
      const before = await daysOf(tx, w.club);
      await leave(
        plain(tx),
        { user: w.users[1] ?? "", interval: w.members[1] ?? "" },
        "Maya",
        new Date("2026-11-06T16:00:00Z"),
      );
      // A week later the window holds dates nobody has made, Ben's among them.
      expect(await run(tx, w.club, "2026-11-13T14:41:00Z")).toBe(0);
      expect(await daysOf(tx, w.club)).toEqual(before);
    });
  });

  it("makes no day for a suspended club (spec 22), and makes them again once it is lifted", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      await tx`UPDATE app.clubs SET suspended_at = ${at("2026-11-05T12:00:00Z")} WHERE id = ${w.club}`;
      expect(await run(tx, w.club, NOW)).toBe(0);
      expect(await daysOf(tx, w.club)).toEqual([]);
      await tx`UPDATE app.clubs SET suspended_at = NULL WHERE id = ${w.club}`;
      expect(await run(tx, w.club, NOW)).toBe(25);
    });
  });

  it("makes each date under the week in force on it, and a later week's days only from its start (FQ61)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      expect(await run(tx, w.club, NOW)).toBe(25);
      // A second week from Monday 7 December, the first Monday with no day made, as a membership change
      // will write one: the same six days, the members last first.
      const next = newId("ver");
      await tx`
        INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
        VALUES (${next}, ${w.club}, '2026-12-07', ${new Date("2026-11-06T15:00:00Z")})`;
      const dates = ["2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12"];
      for (const [index, weekday] of WEEKDAYS.entries()) {
        await tx`
          INSERT INTO app.schedule_assignments
            (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
          VALUES (${next}, ${w.club}, ${weekday}, ${w.members[5 - index] ?? ""}, ${dates[index] ?? ""},
                  ${new Date("2026-11-06T15:00:00Z")})`;
      }
      // Monday the 9th at 9:41 AM in New York: the window reaches Saturday 12 December.
      expect(await run(tx, w.club, "2026-11-09T14:41:00Z")).toBe(6);
      const days = await daysOf(tx, w.club);
      expect(days.slice(0, 25).every((day) => day.schedule_version_id === w.version)).toBe(true);
      expect(days.slice(25).map((day) => [day.local_date, day.schedule_version_id, day.star_interval_id])).toEqual(
        dates.map((date, index) => [date, next, w.members[5 - index]]),
      );
    });
  });

  it("makes no day for a club that hasn't started, though its rows hold a week (spec 04)", async () => {
    await rolledBack(db, async (tx) => {
      // No command gives a proposed club a week; the rows allow one, so the run reads the club's start itself.
      const ben = await newUser(plain(tx), "Ben");
      const maya = await newUser(plain(tx), "Maya");
      const club = newId("club");
      const first = newId("mem");
      await tx`
        INSERT INTO app.clubs (id, name, timezone, creator_interval_id, created_at)
        VALUES (${club}, 'Sunday people', ${NY}, ${first}, ${AT.created})`;
      await tx`
        INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_at)
        VALUES (${first}, ${club}, ${ben}, 'creator', ${AT.created})`;
      await joinByRoster(plain(tx), club, { user: ben, interval: first }, [{ user: maya, label: "Maya" }], AT.joined);
      const week = newId("ver");
      await tx`
        INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
        VALUES (${week}, ${club}, '2026-11-02', ${new Date("2026-11-02T14:00:00Z")})`;
      await tx`
        INSERT INTO app.schedule_assignments
          (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
        VALUES (${week}, ${club}, 'monday', ${first}, '2026-11-09', ${new Date("2026-11-04T14:00:00Z")})`;
      expect(await run(tx, club, NOW)).toBe(0);
      expect(await daysOf(tx, club)).toEqual([]);
      // Started, the same rows make Ben's Mondays: the 9th, 16th, 23rd and 30th.
      await tx`UPDATE app.clubs SET activated_at = ${new Date("2026-11-02T13:00:00Z")} WHERE id = ${club}`;
      expect(await run(tx, club, NOW)).toBe(4);
    });
  });

  it("makes nothing for a club with no week, for an id nobody has, and refuses what can't be an id", async () => {
    await rolledBack(db, async (tx) => {
      const bare = await clubOf(tx, 4);
      expect(await run(tx, bare.club, NOW)).toBe(0);
      expect(await run(tx, "club_nobody_has_this", NOW)).toBe(0);
      await expect(makeDays(tx, fakeClock(NOW), "not an id")).rejects.toThrow(TypeError);
      expect(await daysOf(tx, bare.club)).toEqual([]);
    });
  });

  it("lists the clubs that have a week, in id order, and no club without one", async () => {
    await rolledBack(db, async (tx) => {
      const one = await confirmedWeek(tx, 4, TIMES);
      const two = await confirmedWeek(tx, 2, TIMES, { who: [] });
      const bare = await clubOf(tx, 4);
      const listed = await clubsWithAWeek(tx);
      expect(listed).toContain(one.club);
      // A week nobody has confirmed a day in is still listed: it is owed nothing yet.
      expect(listed).toContain(two.club);
      expect(listed).not.toContain(bare.club);
      expect(listed).toEqual([...listed].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
      expect(new Set(listed).size).toBe(listed.length);
    });
  });
});

describe("runs at once, committed (spec 34; T1)", () => {
  const committed = (count: number) => db.begin((tx) => confirmedWeek(tx, count, TIMES));
  const world = db as unknown as WorldTx;

  it("makes each day once when two runs meet, and each run counts only its own", async () => {
    for (let round = 0; round < 6; round += 1) {
      const w = await committed(6);
      const counts = await Promise.all([
        db.begin((tx) => makeDays(tx, fakeClock(NOW), w.club)),
        db.begin((tx) => makeDays(tx, fakeClock(NOW), w.club)),
        db.begin((tx) => makeDays(tx, fakeClock(NOW), w.club)),
      ]);
      expect(counts.reduce((sum, count) => sum + count, 0)).toBe(25);
      // The club's row puts them in one order: the first makes all, the others none.
      expect([...counts].sort((a, b) => a - b)).toEqual([0, 0, 25]);
      expect((await daysOf(world, w.club)).map((day) => day.local_date)).toEqual(SIX_DATES);
    }
  });

  it(
    "samples its clock only once it holds the club's row, and dates its days from that sample (T1; T3's order)",
    { timeout: 20_000 },
    async () => {
      const w = await committed(6);
      const hold = await holding(db, w.club);
      const { clock, samples } = counting(NOW);
      const running = db.begin((tx) => makeDays(tx, clock, w.club));
      try {
        await waitingOn(db, hold.pid);
        expect(samples()).toBe(0);
        // The time moves while it waits: Saturday the 7th, 9:41 AM, when that day has opened.
        clock.set(at("2026-11-07T14:41:00Z"));
      } finally {
        await hold.release();
        await running.catch(() => undefined);
      }
      expect(await running).toBe(24);
      expect(samples()).toBe(1);
      const days = await daysOf(world, w.club);
      expect(days[0]?.local_date).toBe("2026-11-09");
      expect(days.at(-1)?.local_date).toBe("2026-12-05");
      expect(new Set(days.map((day) => day.collecting_from.toString()))).toEqual(new Set(["2026-11-07T14:41:00Z"]));
    },
  );

  it(
    "waits for a confirmation in flight and reads the week only once it has the club's row: the day confirmed meanwhile is made too (FQ61)",
    { timeout: 20_000 },
    async () => {
      // Maya and Alex have confirmed. Sam's confirmation is in flight: it holds the club's row and hasn't
      // committed.
      const w = await db.begin((tx) => confirmedWeek(tx, 6, TIMES, { who: [1, 2] }));
      let commit = (): void => undefined;
      const go = new Promise<void>((resolve) => (commit = resolve));
      let held: (pid: number) => void = () => undefined;
      const taken = new Promise<number>((resolve) => (held = resolve));
      const confirming = db.begin(async (tx) => {
        await confirmOwn(tx, fakeClock(TIMES.confirmed), w, 3);
        const [row] = await tx<{ pid: number }[]>`SELECT pg_catalog.pg_backend_pid() AS pid`;
        held(row?.pid ?? -1);
        await go;
      });
      const pid = await Promise.race([taken, confirming.then(() => -1)]);
      const running = db.begin((tx) => makeDays(tx, fakeClock(NOW), w.club));
      try {
        await waitingOn(db, pid);
        expect(await daysOf(world, w.club)).toEqual([]);
      } finally {
        commit();
        await confirming.catch(() => undefined);
        await running.catch(() => undefined);
      }
      await confirming;
      // Maya's four Tuesdays, Alex's four Wednesdays and Sam's four Thursdays from the 12th: a run that
      // had read the week before it had the row would have made eight.
      expect(await running).toBe(12);
      const days = await daysOf(world, w.club);
      expect(days.filter((day) => day.star_interval_id === w.members[3]).map((day) => day.local_date)).toEqual([
        "2026-11-12",
        "2026-11-19",
        "2026-11-26",
        "2026-12-03",
      ]);
    },
  );
});
