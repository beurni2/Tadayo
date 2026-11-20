/// <reference lib="esnext.temporal" />
// Home's day choice on real rows (packages/domain/src/authorization/days.ts; spec 05, 06, 08; T1, T2,
// T5, T9, T14, T27; FQ50, FQ63, FQ75; Q03, Q18), through both of its paths: the SQL that lists it
// (`daysByClub`) and the policy on facts this test loads from the same rows (`chooseDays`). Each case
// asks both and expects the same whole answer from each, so the two can't drift apart.
//
// The instants come from the time module (`dayInstants`) in each of ADR-008's six zones, around
// their 2026 transitions, and the server's time from the tests' fake clock at each edge: a
// microsecond before the reveal, the reveal, a microsecond before the close, the close. No worker
// runs: nothing but the rows and the clock decides (Q18). The last test runs the chain under the dev
// clock, as `dev` will, with a day in 2099.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  chooseDays,
  chooseDaysAhead,
  chooseNextDayOf,
  chosenDay,
  chosenDays,
  dayInstants,
  daysAheadByClub,
  daysByClub,
  listClubs,
  nextDaysByStar,
  prepareClock,
  type ClubDayFacts,
  type DayChoice,
  type DayFacts,
  type ServerNow,
} from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, describe, expect, it } from "vitest";
import { rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import { joinByRoster, leave, named, newAvatar, newId, newUser, newWorld, type Member } from "./world.ts";

const DEV_CLOCK = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "tools", "ops", "sql", "dev_clock.sql"),
  "utf8",
);

const db = worldSql();
afterAll(async () => {
  await db.end();
});

/** world.ts's helpers take the plain transaction; this one only adds INSTANT_TYPE. */
const plain = (tx: WorldTx) => tx as unknown as Tx;
const at = (text: string) => Temporal.Instant.from(text);
const µs = (instant: Temporal.Instant, n: number) => instant.add({ microseconds: n });
const NONE: DayChoice = { open: null, next: null };

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const weekdayOf = (date: string) => {
  const day = WEEKDAYS[Temporal.PlainDate.from(date).dayOfWeek - 1];
  if (day === undefined) throw new Error(`${date} is a Sunday, which has no day`);
  return day;
};

/** The server's time at `instant`, as the tests' fake clock samples it in `tx` (T1). */
async function sample(tx: WorldTx, instant: Temporal.Instant): Promise<ServerNow> {
  return fakeClock(instant).sample(tx);
}

interface ZoneClub {
  club: string;
  ana: Member;
  ben: Member;
  /** Each day's id by its date. */
  days: Map<string, string>;
}

/**
 * A club of two in `zone`, Ana its creator and Ben joined by a roster (T7), with one schedule whose
 * weekdays are those of `dates` (Ana's when `ana` says so, else Ben's), and a day on each date, its
 * instants resolved by the time module (ADR-008), as the generator will write them.
 */
async function zoneClub(
  tx: WorldTx,
  zone: string,
  dates: readonly string[],
  ana: (weekday: string) => boolean = (weekday) => weekday === "saturday",
): Promise<ZoneClub> {
  const made = Temporal.Instant.from("2026-01-01T10:00:00Z");
  const madeAt = new Date(made.epochMilliseconds);
  const suffix = ` ${newId("z").slice(-6)}`;
  const anaUser = await newUser(plain(tx), `Ana${suffix}`);
  const benUser = await newUser(plain(tx), `Ben${suffix}`);
  const club = newId("club");
  const anaInterval = newId("mem");
  await tx`
    INSERT INTO app.clubs (id, name, timezone, creator_interval_id, created_at)
    VALUES (${club}, ${`Zone people${suffix}`}, ${zone}, ${anaInterval}, ${madeAt})`;
  await tx`
    INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_at)
    VALUES (${anaInterval}, ${club}, ${anaUser}, 'creator', ${madeAt})`;
  const anaMember = { user: anaUser, interval: anaInterval };
  const [benInterval] = await joinByRoster(
    plain(tx),
    club,
    anaMember,
    [{ user: benUser, label: `Ben${suffix}` }],
    madeAt,
  );
  if (benInterval === undefined) throw new Error("zoneClub: the roster added nobody");
  await tx`UPDATE app.clubs SET activated_at = ${madeAt} WHERE id = ${club}`;
  const version = newId("sched");
  await tx`
    INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
    VALUES (${version}, ${club}, '2026-01-05', ${madeAt})`;
  const firsts = new Map<string, string>();
  for (const date of [...dates].sort()) if (!firsts.has(weekdayOf(date))) firsts.set(weekdayOf(date), date);
  for (const [weekday, first] of firsts) {
    await tx`
      INSERT INTO app.schedule_assignments (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
      VALUES (${version}, ${club}, ${weekday}, ${ana(weekday) ? anaInterval : benInterval}, ${first}, ${madeAt})`;
  }
  const days = new Map<string, string>();
  for (const date of dates) {
    const { revealAt, closeAt } = dayInstants(Temporal.PlainDate.from(date), zone);
    const id = newId("occ");
    await tx`
      INSERT INTO app.occurrences (id, club_id, star_interval_id, schedule_version_id, local_date, reveal_at, close_at,
                                   collecting_from)
      VALUES (${id}, ${club}, ${ana(weekdayOf(date)) ? anaInterval : benInterval}, ${version}, ${date}, ${revealAt},
              ${closeAt}, ${made})`;
    days.set(date, id);
  }
  return { club, ana: anaMember, ben: { user: benUser, interval: benInterval }, days };
}

/** The club's two days for `viewer` at `now` by the SQL path: `daysByClub`, filtered to the club. */
async function bySql(tx: WorldTx, viewer: string, club: string, now: ServerNow): Promise<DayChoice> {
  const rows = await tx<{ open_day: unknown; next_day: unknown }[]>`
    SELECT d.open_day, d.next_day FROM (${daysByClub(tx, viewer, now)}) d WHERE d.club_id = ${club}`;
  if (rows.length > 1) throw new Error("daysByClub listed a club twice");
  const row = rows[0];
  return row === undefined
    ? NONE
    : { open: chosenDay(row.open_day, "open"), next: chosenDay(row.next_day, "collecting") };
}

/** The facts the policy reads about `viewer` and `club`, as this test reads them from the rows. */
async function factsOf(tx: WorldTx, viewer: string, club: string): Promise<ClubDayFacts | null> {
  const [clubRow] = await tx<{ suspended_at: Temporal.Instant | null }[]>`
    SELECT suspended_at FROM app.clubs WHERE id = ${club}`;
  if (clubRow === undefined) return null;
  const [account] = await tx<
    { state: ClubDayFacts["viewerAccount"] }[]
  >`SELECT state FROM app.users WHERE id = ${viewer}`;
  const [interval] = await tx<{ state: ClubDayFacts["viewerInterval"] }[]>`
    SELECT state FROM app.memberships WHERE club_id = ${club} AND user_id = ${viewer}
     ORDER BY state = 'active' DESC, joined_at DESC LIMIT 1`;
  const days = await tx<
    {
      id: string;
      club_id: string;
      status: DayFacts["status"];
      local_date: string;
      reveal_at: Temporal.Instant;
      close_at: Temporal.Instant;
      interval_id: string;
      interval_state: DayFacts["starIntervalState"];
      left_at: Temporal.Instant | null;
      ended_name: string | null;
      account_state: DayFacts["starAccount"];
      name: string | null;
      deletion_requested_at: Temporal.Instant | null;
      avatar: string | null;
    }[]
  >`
    SELECT o.id, o.club_id, o.status, o.local_date::text AS local_date, o.reveal_at, o.close_at,
           s.interval_id, s.state AS interval_state, s.left_at, s.ended_display_name AS ended_name,
           su.state AS account_state, su.display_name AS name, su.deletion_requested_at,
           (SELECT content_version FROM app.uploads WHERE id = su.avatar_upload_id AND state = 'ready') AS avatar
      FROM app.occurrences o
      JOIN app.memberships s ON s.interval_id = o.star_interval_id
      JOIN app.users su ON su.id = s.user_id
     WHERE o.club_id = ${club}`;
  return {
    viewerAccount: account?.state ?? null,
    viewerInterval: interval?.state ?? null,
    clubSuspendedAt: clubRow.suspended_at,
    days: days.map((day) => ({
      id: day.id,
      clubId: day.club_id,
      status: day.status,
      localDate: day.local_date,
      revealAt: day.reveal_at,
      closeAt: day.close_at,
      starInterval: day.interval_id,
      starIntervalState: day.interval_state,
      starLeftAt: day.left_at,
      starEndedName: day.ended_name,
      starAccount: day.account_state,
      starName: day.name,
      starDeletionRequestedAt: day.deletion_requested_at,
      starAvatarVersion: day.avatar,
    })),
  };
}

/**
 * Each active member's next day for `viewer` at `now` by the SQL path (`nextDaysByStar`, the roster's next
 * dates), by the member's interval: no entry at all when the path lists nothing of the club.
 */
async function byStarSql(tx: WorldTx, viewer: string, club: string, now: ServerNow) {
  const rows = await tx<{ star_interval_id: string; next_day: unknown }[]>`
    SELECT d.star_interval_id, d.next_day FROM (${nextDaysByStar(tx, viewer, now)}) d WHERE d.club_id = ${club}`;
  const found = new Map(rows.map((row) => [row.star_interval_id, chosenDay(row.next_day, "collecting")]));
  if (found.size !== rows.length) throw new Error("nextDaysByStar listed a member twice");
  return found;
}

/** The same by the policy on this test's facts: every active member, when the rule lets the viewer see the club. */
async function byStarPolicy(tx: WorldTx, facts: ClubDayFacts | null, club: string, now: ServerNow) {
  const found = new Map<string, DayChoice["next"]>();
  if (
    facts === null ||
    !(facts.viewerAccount === "active" && facts.viewerInterval === "active" && facts.clubSuspendedAt === null)
  ) {
    return found;
  }
  const members = await tx<{ interval_id: string }[]>`
    SELECT interval_id FROM app.memberships WHERE club_id = ${club} AND state = 'active'`;
  for (const member of members) found.set(member.interval_id, chooseNextDayOf(facts, member.interval_id, now));
  return found;
}

/**
 * Both paths at `instant`, which must agree whole; returns their answer. Each member's next day is held the
 * same way at every instant asked: the SQL that lists it and the policy on the same facts.
 */
async function both(tx: WorldTx, viewer: string, club: string, instant: Temporal.Instant): Promise<DayChoice> {
  const now = await sample(tx, instant);
  const sql = await bySql(tx, viewer, club, now);
  const facts = await factsOf(tx, viewer, club);
  const policy = chooseDays(facts, now);
  expect(sql, `the SQL and the policy at ${instant.toString()}`).toEqual(policy);
  const starsSql = await byStarSql(tx, viewer, club, now);
  const starsPolicy = await byStarPolicy(tx, facts, club, now);
  expect(starsSql, `each member's next day, the SQL and the policy, at ${instant.toString()}`).toEqual(starsPolicy);
  // Every day not yet closed (a membership change's `announced`): the two paths again, and the open day
  // and the next day are its first days.
  const aheadRows = await tx<{ days: unknown }[]>`
    SELECT d.days FROM (${daysAheadByClub(tx, viewer, now)}) d WHERE d.club_id = ${club}`;
  if (aheadRows.length > 1) throw new Error("daysAheadByClub listed a club twice");
  const ahead = aheadRows[0] === undefined ? [] : chosenDays(aheadRows[0].days);
  expect(ahead, `the days ahead, the SQL and the policy, at ${instant.toString()}`).toEqual(
    chooseDaysAhead(facts, now),
  );
  expect(ahead.slice(0, sql.open === null ? 1 : 2)).toEqual([sql.open, sql.next].filter((day) => day !== null));
  // The club's next day is the earliest of its members' next days, or one whose star is no longer active.
  const earliest = [...starsSql.values()]
    .filter((day) => day !== null)
    .sort((a, b) => Temporal.Instant.compare(a.revealAt, b.revealAt))[0];
  if (earliest !== undefined) {
    expect(sql.next).not.toBeNull();
    if (sql.next !== null)
      expect(Temporal.Instant.compare(sql.next.revealAt, earliest.revealAt)).toBeLessThanOrEqual(0);
  }
  return sql;
}

/** Each path's open and next day ids at `instant`. */
async function ids(tx: WorldTx, viewer: string, club: string, instant: Temporal.Instant) {
  const choice = await both(tx, viewer, club, instant);
  return { open: choice.open?.id ?? null, next: choice.next?.id ?? null };
}

/** The four edges of a day: a microsecond before the reveal, the reveal, a microsecond before the close, the close. */
const edges = (reveal: Temporal.Instant, close: Temporal.Instant) => [µs(reveal, -1), reveal, µs(close, -1), close];

// ADR-008's six zones, each with days around its 2026 transitions (packages/domain/src/time/civil.test.ts'
// ZONE_TABLE): London's missing 01:00 (Saturday 28 March) and doubled 01:00 (Saturday 24 October),
// Santiago's 19- and 17-hour Saturdays, Lord Howe's half hour, Troll's two hours, and an ordinary New
// York week of a pair's four days.
const ZONES: readonly (readonly [zone: string, dates: readonly string[]])[] = [
  ["Europe/London", ["2026-03-27", "2026-03-28", "2026-03-30", "2026-10-24", "2026-10-26"]],
  ["America/Santiago", ["2026-04-04", "2026-04-06", "2026-09-05", "2026-09-07"]],
  ["Australia/Lord_Howe", ["2026-04-04", "2026-04-06", "2026-10-03", "2026-10-05"]],
  ["Antarctica/Troll", ["2026-03-28", "2026-03-30", "2026-10-24", "2026-10-26"]],
  ["Africa/Ouagadougou", ["2026-03-28", "2026-10-24"]],
  ["America/New_York", ["2026-11-09", "2026-11-10", "2026-11-12", "2026-11-13"]],
];

describe("which day is open and which is next, on Postgres, in every zone (T1, T2, T5; spec 05, 06; Q03, Q18)", () => {
  for (const [zone, dates] of ZONES) {
    it(`in ${zone}, opens each day at its 7 AM exactly and closes it at its 1 AM exactly, and gives the next in date order`, async () => {
      await rolledBack(db, async (tx) => {
        const z = await zoneClub(tx, zone, dates);
        const order = [...dates].sort();
        for (const [index, date] of order.entries()) {
          const { revealAt, closeAt } = dayInstants(Temporal.PlainDate.from(date), zone);
          const day = z.days.get(date) ?? "";
          const after = z.days.get(order[index + 1] ?? "") ?? null;
          const [before, reveal, last, close] = edges(revealAt, closeAt);
          for (const viewer of [z.ana.user, z.ben.user]) {
            expect(await ids(tx, viewer, z.club, before as Temporal.Instant), `${date} before`).toEqual({
              open: null,
              next: day,
            });
            expect(await ids(tx, viewer, z.club, reveal as Temporal.Instant), `${date} reveal`).toEqual({
              open: day,
              next: after,
            });
            expect(await ids(tx, viewer, z.club, last as Temporal.Instant), `${date} last`).toEqual({
              open: day,
              next: after,
            });
            expect(await ids(tx, viewer, z.club, close as Temporal.Instant), `${date} close`).toEqual({
              open: null,
              next: after,
            });
          }
          // The answer carries the day's own date and the instants the time module resolved, stored and
          // read back to the microsecond, and the star whose weekday it is.
          const open = (await both(tx, z.ana.user, z.club, revealAt)).open;
          expect(open?.localDate).toBe(date);
          expect(open?.revealAt.equals(revealAt)).toBe(true);
          expect(open?.closeAt.equals(closeAt)).toBe(true);
          expect(open?.clubId).toBe(z.club);
          expect(open?.star.membershipId).toBe(weekdayOf(date) === "saturday" ? z.ana.interval : z.ben.interval);
          expect(open?.phase).toBe("open");
        }
      });
    });
  }

  it("closes London's Saturdays at the jump over the missing 01:00 and at the first of the two 01:00s, and Santiago's after 19 and 17 hours", async () => {
    await rolledBack(db, async (tx) => {
      const london = await zoneClub(tx, "Europe/London", ["2026-03-28", "2026-10-24"]);
      const santiago = await zoneClub(tx, "America/Santiago", ["2026-04-04", "2026-09-05"]);
      const closes: [ZoneClub, string, string, string][] = [
        [london, "2026-03-28", "2026-03-28T07:00:00Z", "2026-03-29T01:00:00Z"],
        [london, "2026-10-24", "2026-10-24T06:00:00Z", "2026-10-25T00:00:00Z"],
        [santiago, "2026-04-04", "2026-04-04T10:00:00Z", "2026-04-05T05:00:00Z"],
        [santiago, "2026-09-05", "2026-09-05T11:00:00Z", "2026-09-06T04:00:00Z"],
      ];
      for (const [z, date, reveal, close] of closes) {
        const day = z.days.get(date) ?? "";
        expect((await both(tx, z.ana.user, z.club, at(reveal))).open?.id, `${date} opens at ${reveal}`).toBe(day);
        expect((await both(tx, z.ana.user, z.club, µs(at(reveal), -1))).open, `${date} not before`).toBeNull();
        expect((await both(tx, z.ana.user, z.club, µs(at(close), -1))).open?.id, `${date} open until ${close}`).toBe(
          day,
        );
        expect((await both(tx, z.ana.user, z.club, at(close))).open, `${date} closed at ${close}`).toBeNull();
      }
    });
  });
});

describe("only the viewer's clubs, and only a scheduled day that isn't held, on Postgres (T9, T14, T27; FQ50, FQ63; spec 22)", () => {
  const SAT = { reveal: at("2026-11-07T07:00:00Z"), close: at("2026-11-08T01:00:00Z") };
  const PHASES = edges(SAT.reveal, SAT.close);

  it("gives a stranger, a former member, an account being deleted, an account with no club and an unknown account nothing", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const stranger = (await newWorld(plain(tx), " other")).ana.user;
      await leave(plain(tx), w.ben, named(w, "Ben"), new Date("2026-11-06T20:10:00Z"));
      await tx`
        UPDATE app.users SET state = 'deleting', deletion_requested_at = '2026-11-06T20:10:00Z' WHERE id = ${w.cleo.user}`;
      // Ana, the star and a member, sees Ana's one day at each edge; nobody else sees anything.
      const ana = [
        { open: null, next: w.day },
        { open: w.day, next: null },
        { open: w.day, next: null },
        { open: null, next: null },
      ];
      for (const [index, instant] of PHASES.entries()) {
        expect(await ids(tx, w.ana.user, w.club, instant), instant.toString()).toEqual(ana[index]);
        for (const viewer of [stranger, w.ben.user, w.cleo.user, w.dan.user, newId("acct")])
          expect(await both(tx, viewer, w.club, instant), `${viewer} ${instant.toString()}`).toEqual(NONE);
      }
      // A club id that names nothing gives nothing, by both paths.
      expect(await both(tx, w.ana.user, newId("club"), SAT.reveal)).toEqual(NONE);
    });
  });

  it("gives a rejoined member the club's days on the new interval", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await leave(plain(tx), w.ben, named(w, "Ben"), new Date("2026-11-06T20:10:00Z"));
      expect(await both(tx, w.ben.user, w.club, SAT.reveal)).toEqual(NONE);
      await joinByRoster(
        plain(tx),
        w.club,
        w.ana,
        [{ user: w.ben.user, label: named(w, "Ben") }],
        new Date("2026-11-06T20:20:00Z"),
      );
      expect(await ids(tx, w.ben.user, w.club, µs(SAT.reveal, -1))).toEqual({ open: null, next: w.day });
      expect(await ids(tx, w.ben.user, w.club, SAT.reveal)).toEqual({ open: w.day, next: null });
    });
  });

  it("gives nothing in a suspended club, and a paused club's days as its rows hold them (FQ50)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await leave(plain(tx), w.ben, named(w, "Ben"), new Date("2026-11-06T20:10:00Z"));
      await leave(plain(tx), w.cleo, named(w, "Cleo"), new Date("2026-11-06T20:10:00Z"));
      expect(await ids(tx, w.ana.user, w.club, µs(SAT.reveal, -1))).toEqual({ open: null, next: w.day });
      expect(await ids(tx, w.ana.user, w.club, SAT.reveal)).toEqual({ open: w.day, next: null });
      await tx`UPDATE app.clubs SET suspended_at = '2026-11-06T20:30:00Z' WHERE id = ${w.club}`;
      for (const instant of PHASES) expect(await both(tx, w.ana.user, w.club, instant)).toEqual(NONE);
    });
  });

  it("never chooses a suspended or cancelled day, and moves next on to the day after it", async () => {
    for (const status of ["suspended", "cancelled"]) {
      await rolledBack(db, async (tx) => {
        const z = await zoneClub(tx, "Europe/London", ["2026-11-07", "2026-11-09"]);
        const [sat, mon] = [z.days.get("2026-11-07"), z.days.get("2026-11-09")];
        expect(await ids(tx, z.ana.user, z.club, SAT.reveal)).toEqual({ open: sat, next: mon });
        await tx`UPDATE app.occurrences SET status = ${status} WHERE id = ${sat ?? ""}`;
        expect(await ids(tx, z.ana.user, z.club, µs(SAT.reveal, -1)), status).toEqual({ open: null, next: mon });
        expect(await ids(tx, z.ana.user, z.club, SAT.reveal), status).toEqual({ open: null, next: mon });
      });
    }
  });

  it("holds a day whose star left a microsecond before its reveal, by leaving, a block or a deletion: never open, never next (FQ63)", async () => {
    for (const state of ["left", "left_by_block", "account_deleted"]) {
      await rolledBack(db, async (tx) => {
        const z = await zoneClub(tx, "Europe/London", ["2026-11-07", "2026-11-09"]);
        const mon = z.days.get("2026-11-09");
        await tx`
          UPDATE app.memberships SET state = ${state}, left_at = ${µs(SAT.reveal, -1)},
                 contributions = ${state === "account_deleted" ? null : "keep"}, ended_display_name = 'Ana'
           WHERE interval_id = ${z.ana.interval}`;
        for (const instant of PHASES)
          expect(await ids(tx, z.ben.user, z.club, instant), `${state} ${instant.toString()}`).toEqual({
            open: null,
            next: mon,
          });
      });
    }
  });

  it("holds a day whose star asked to delete their account a microsecond before its reveal, whether the interval has ended or not (T27)", async () => {
    const asked = µs(SAT.reveal, -1);
    const endings: [string, Temporal.Instant | null][] = [
      ["not ended yet", null],
      ["ended before the reveal", asked],
      ["ended after the close", µs(SAT.close, 5)],
    ];
    for (const [name, ended] of endings) {
      await rolledBack(db, async (tx) => {
        const z = await zoneClub(tx, "Europe/London", ["2026-11-07", "2026-11-09"]);
        const mon = z.days.get("2026-11-09");
        await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${asked} WHERE id = ${z.ana.user}`;
        if (ended !== null)
          await tx`
            UPDATE app.memberships SET state = 'account_deleted', left_at = ${ended} WHERE interval_id = ${z.ana.interval}`;
        for (const instant of PHASES)
          expect(await ids(tx, z.ben.user, z.club, instant), `${name} ${instant.toString()}`).toEqual({
            open: null,
            next: mon,
          });
      });
    }
  });

  it("keeps a day open to its close when its star leaves or asks to delete at its reveal or a microsecond after", async () => {
    for (const when of [SAT.reveal, µs(SAT.reveal, 1)]) {
      for (const how of ["leaves", "asks to delete"]) {
        await rolledBack(db, async (tx) => {
          const z = await zoneClub(tx, "Europe/London", ["2026-11-07"]);
          const sat = z.days.get("2026-11-07");
          if (how === "leaves")
            await tx`
              UPDATE app.memberships SET state = 'left', left_at = ${when}, contributions = 'keep', ended_display_name = 'Ana'
               WHERE interval_id = ${z.ana.interval}`;
          else
            await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${when} WHERE id = ${z.ana.user}`;
          const label = `${how} at ${when.toString()}`;
          expect(await ids(tx, z.ben.user, z.club, µs(SAT.close, -1)), label).toEqual({ open: sat, next: null });
          expect(await ids(tx, z.ben.user, z.club, SAT.close), label).toEqual({ open: null, next: null });
        });
      }
    }
  });
});

describe("the star as the club sees them, on Postgres (FQ75)", () => {
  const OPEN = at("2026-11-07T10:00:00Z");
  const DURING = at("2026-11-07T09:00:00Z");

  it("names an active star by their account's name now, with their ready avatar's version while the account is active", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      expect((await both(tx, w.cleo.user, w.club, OPEN)).open?.star).toEqual({
        membershipId: w.ana.interval,
        displayName: named(w, "Ana"),
        avatarVersion: null,
      });
      const avatar = await newAvatar(plain(tx), w.ana.user, "ready");
      await tx`UPDATE app.users SET avatar_upload_id = ${avatar.id}, display_name = ${named(w, "Anna")} WHERE id = ${w.ana.user}`;
      expect((await both(tx, w.cleo.user, w.club, OPEN)).open?.star).toEqual({
        membershipId: w.ana.interval,
        displayName: named(w, "Anna"),
        avatarVersion: avatar.version,
      });
    });
  });

  it("keeps the name and drops the avatar while a deletion asked for during the open day hasn't ended the interval; then the name it ended with", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      const avatar = await newAvatar(plain(tx), w.ana.user, "ready");
      await tx`UPDATE app.users SET avatar_upload_id = ${avatar.id} WHERE id = ${w.ana.user}`;
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${DURING} WHERE id = ${w.ana.user}`;
      expect((await both(tx, w.cleo.user, w.club, OPEN)).open?.star).toEqual({
        membershipId: w.ana.interval,
        displayName: named(w, "Ana"),
        avatarVersion: null,
      });
      await tx`
        UPDATE app.memberships SET state = 'account_deleted', left_at = ${DURING}, ended_display_name = ${named(w, "Ana B")}
         WHERE interval_id = ${w.ana.interval}`;
      expect((await both(tx, w.cleo.user, w.club, OPEN)).open?.star).toEqual({
        membershipId: w.ana.interval,
        displayName: named(w, "Ana B"),
        avatarVersion: null,
      });
    });
  });

  it("names a star who left during the open day by the name it ended with, whatever the account is called now", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      await leave(plain(tx), w.ana, named(w, "Ana L"), new Date(DURING.epochMilliseconds));
      await tx`UPDATE app.users SET display_name = ${named(w, "Someone")} WHERE id = ${w.ana.user}`;
      expect((await both(tx, w.cleo.user, w.club, OPEN)).open?.star).toEqual({
        membershipId: w.ana.interval,
        displayName: named(w, "Ana L"),
        avatarVersion: null,
      });
    });
  });

  it("leaves out an open day whose star has no name to show, and still gives the next day (B6, docs/LIMITATIONS.md)", async () => {
    await rolledBack(db, async (tx) => {
      const z = await zoneClub(tx, "Europe/London", ["2026-11-07", "2026-11-09"]);
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${DURING} WHERE id = ${z.ana.user}`;
      await tx`
        UPDATE app.memberships SET state = 'account_deleted', left_at = ${DURING} WHERE interval_id = ${z.ana.interval}`;
      expect(await ids(tx, z.ben.user, z.club, OPEN)).toEqual({ open: null, next: z.days.get("2026-11-09") });
    });
  });
});

describe("a viewer of two clubs in two zones gets each club's own days (T14)", () => {
  it("never mixes them: each club's days carry its own id, star and date, whatever the other's hold", async () => {
    await rolledBack(db, async (tx) => {
      const w = await newWorld(plain(tx));
      // Ana is also in a New York club, whose Saturday opens five hours after London's.
      const ny = await zoneClub(tx, "America/New_York", ["2026-11-07"]);
      await joinByRoster(
        plain(tx),
        ny.club,
        ny.ana,
        [{ user: w.ana.user, label: named(w, "Ana") }],
        new Date("2026-11-02T08:00:00Z"),
      );
      const nyDay = ny.days.get("2026-11-07") ?? "";
      const londonOpen = at("2026-11-07T08:00:00Z");
      const both2 = async (instant: Temporal.Instant) => ({
        london: await both(tx, w.ana.user, w.club, instant),
        ny: await both(tx, w.ana.user, ny.club, instant),
      });
      const now = await both2(londonOpen);
      expect(now.london.open?.id).toBe(w.day);
      expect(now.london.open?.clubId).toBe(w.club);
      expect(now.london.open?.star.membershipId).toBe(w.ana.interval);
      expect(now.london.next).toBeNull();
      expect(now.ny.open).toBeNull();
      expect(now.ny.next?.id).toBe(nyDay);
      expect(now.ny.next?.clubId).toBe(ny.club);
      expect(now.ny.next?.star.membershipId).toBe(ny.ana.interval);
      expect(now.ny.next?.revealAt.toString()).toBe("2026-11-07T12:00:00Z");
      // listClubs puts each club's days on that club, in one statement.
      const listing = await listClubs(tx, w.ana.user, await sample(tx, londonOpen));
      const byId = new Map(listing.clubs.map((club) => [club.id, club]));
      expect(byId.get(w.club)?.openDay?.id).toBe(w.day);
      expect(byId.get(w.club)?.nextDay).toBeNull();
      expect(byId.get(ny.club)?.openDay).toBeNull();
      expect(byId.get(ny.club)?.nextDay?.id).toBe(nyDay);
      // London's day suspended, then New York's club: each club keeps its own answer.
      await tx`UPDATE app.occurrences SET status = 'suspended' WHERE id = ${w.day}`;
      const later = await both2(londonOpen);
      expect(later.london).toEqual(NONE);
      expect(later.ny.next?.id).toBe(nyDay);
      await tx`UPDATE app.clubs SET suspended_at = '2026-11-07T07:30:00Z' WHERE id = ${ny.club}`;
      expect((await both2(londonOpen)).ny).toEqual(NONE);
    });
  });
});

describe("the chain on dev: the dev clock's sample reaches the day choice (ADR-013, T1)", () => {
  it("puts a day on the right side of its reveal by the dev clock's offset alone, with no worker", async () => {
    await rolledBack(db, async (tx) => {
      await tx.unsafe(DEV_CLOCK);
      const z = await zoneClub(tx, "America/New_York", ["2099-01-02"], () => true);
      const day = z.days.get("2099-01-02");
      const { revealAt } = dayInstants(Temporal.PlainDate.from("2099-01-02"), "America/New_York");
      const clock = await prepareClock("dev", tx);
      const [row] = await tx<{ us: string }[]>`
        SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) OPERATOR(pg_catalog.*) 1000000)
                 ::pg_catalog.int8::pg_catalog.text AS us`;
      // A minute before the reveal by the dev clock, then a minute after: it only moves forward.
      const ahead = (revealAt.epochNanoseconds / 1000n - BigInt(row?.us ?? "0")).toString();
      await tx`INSERT INTO app.dev_clock (offset_microseconds) VALUES (${ahead}::pg_catalog.int8 - 60000000)`;
      const before = await listClubs(tx, z.ben.user, await clock.sample(tx));
      expect(before.clubs.map((club) => [club.openDay?.id ?? null, club.nextDay?.id ?? null])).toEqual([[null, day]]);
      await tx`UPDATE app.dev_clock SET offset_microseconds = offset_microseconds + 120000000`;
      const after = await listClubs(tx, z.ben.user, await clock.sample(tx));
      expect(after.clubs.map((club) => [club.openDay?.id ?? null, club.nextDay?.id ?? null])).toEqual([[day, null]]);
    });
  });
});
