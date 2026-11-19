/// <reference lib="esnext.temporal" />
// The club's roster and next dates against Postgres as `tadayo_app` (packages/domain/src/clubs/members.ts,
// the contract's `listMembers`; spec 09, 32; T1, T9, T14, T15, T49, T55; FQ26, FQ63, FQ98). The clubs get
// their weeks and their days as the product gives them: first days opened and confirmed, days made by
// `makeDays` (week-world.ts). The contract's own scenes are reproduced from rows: Sunday people in their
// first days on Thursday 5 November 2026, and with their week in force on Friday the 6th.

import { Members } from "@tadayo/contracts";
import { listMembers, makeDays, WEEKDAYS, type Roster } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { membersBody } from "@tadayo/api";
import { afterAll, describe, expect, it } from "vitest";
import { rolledBack, worldSql, type Tx, type WorldTx } from "./harness.ts";
import { chooseOwn, clubOf, confirmedWeek, confirmOwn, NAMES, type ConfirmedWeek } from "./week-world.ts";
import { AT, joinByRoster, leave, newId, newUser } from "./world.ts";

const db = worldSql();
afterAll(async () => {
  await db.end();
});

const plain = (tx: WorldTx) => tx as unknown as Tx;
const at = (text: string) => Temporal.Instant.from(text);

/** Monday 2 November 2026, 9 AM in New York; Wednesday the 4th, 9 AM (the contract's first-days fixture, FQ79). */
const TIMES = { opened: "2026-11-02T14:00:00Z", confirmed: "2026-11-04T14:00:00Z" };
/** Thursday 5 November, 9:41 AM, and Friday the 6th, 9:41 AM, in New York: the contract's two scenes. */
const THURSDAY = "2026-11-05T14:41:00Z";
const FRIDAY = "2026-11-06T14:41:00Z";

async function roster(tx: WorldTx, user: string, club: string, now: string): Promise<Roster | null> {
  return listMembers(tx, user, club, await fakeClock(now).sample(tx));
}

/** The roster as the test reads it: each member's name, position, next date and whether they are next. */
function rows(found: Roster | null) {
  if (found === null) throw new Error("the roster was refused");
  return found.members.map((member) => [
    member.person.displayName,
    member.position,
    member.nextDay?.localDate ?? null,
    member.nextUp,
  ]);
}

async function days(tx: WorldTx, w: ConfirmedWeek, now: string): Promise<void> {
  await tx.savepoint((sp) => makeDays(sp, fakeClock(now), w.club));
}

describe("the roster in a club's first days (the contract's first_days scene; FQ98, T49)", () => {
  it("lists every member in the order they joined, the confirmed with their first date, the others with none", async () => {
    await rolledBack(db, async (tx) => {
      // Maya, Alex, Sam and Nina confirmed on Wednesday at 9 AM; Ben and Debby haven't.
      const w = await confirmedWeek(tx, 6, TIMES, { who: [1, 2, 3, 5] });
      await days(tx, w, "2026-11-04T14:01:00Z");
      const found = await roster(tx, w.users[0] ?? "", w.club, THURSDAY);
      expect(rows(found)).toEqual([
        ["Ben", 1, null, false],
        ["Maya", 2, "2026-11-10", false],
        ["Alex", 3, "2026-11-11", false],
        // Thursday the 5th's 7 AM was 22 hours after the confirmation, so Sam's first is the 12th.
        ["Sam", 4, "2026-11-12", false],
        ["Debby", 5, null, false],
        ["Nina", 6, "2026-11-07", true],
      ]);
      expect(found?.club).toEqual({
        id: w.club,
        name: "Sunday people",
        timezone: "America/New_York",
        membershipId: w.members[0],
      });
      // Maya's next day, whole: the contract's Occurrence, its instants resolved in the club's zone.
      const maya = found?.members[1]?.nextDay;
      expect(maya).toMatchObject({
        clubId: w.club,
        star: { membershipId: w.members[1], displayName: "Maya", avatarVersion: null },
        localDate: "2026-11-10",
        revealAt: at("2026-11-10T12:00:00Z"),
        closeAt: at("2026-11-11T06:00:00Z"),
        phase: "collecting",
      });
      // The route's body of this scene is the contract's `Members` too.
      if (found === null) throw new Error("refused");
      expect(Members.safeParse(membersBody(at(THURSDAY), found)).success).toBe(true);
    });
  });

  it("keeps the order they joined whichever days are confirmed, so no row moves when a member confirms", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES, { who: [] });
      const order = async () => rows(await roster(tx, w.users[3] ?? "", w.club, THURSDAY)).map(([name]) => name);
      const joined = ["Ben", "Maya", "Alex", "Sam", "Debby", "Nina"];
      expect(await order()).toEqual(joined);
      // The last to join confirms first, then the fifth: their days come before the others' in the week.
      const clock = fakeClock(TIMES.confirmed);
      await confirmOwn(tx, clock, w, 5);
      expect(await order()).toEqual(joined);
      await confirmOwn(tx, clock, w, 4);
      await days(tx, w, "2026-11-04T14:01:00Z");
      expect(await order()).toEqual(joined);
    });
  });

  it("gives every member the same list, whoever asks (T55)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES, { who: [1, 2, 3, 5] });
      await days(tx, w, "2026-11-04T14:01:00Z");
      const asBen = await roster(tx, w.users[0] ?? "", w.club, THURSDAY);
      for (const [index, user] of w.users.entries()) {
        const mine = await roster(tx, user, w.club, THURSDAY);
        expect(mine?.members).toEqual(asBen?.members);
        expect(mine?.club.membershipId).toBe(w.members[index]);
      }
    });
  });
});

describe("the roster once the week is in force (the contract's sunday_people scene; FQ26, FQ98)", () => {
  it("is the contract's Friday: Debby's day is open, so Debby's next is the 13th, and Nina is next up", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      await days(tx, w, "2026-11-04T14:01:00Z");
      const found = await roster(tx, w.users[0] ?? "", w.club, FRIDAY);
      expect(rows(found)).toEqual([
        ["Ben", 1, "2026-11-09", false],
        ["Maya", 2, "2026-11-10", false],
        ["Alex", 3, "2026-11-11", false],
        ["Sam", 4, "2026-11-12", false],
        ["Debby", 5, "2026-11-13", false],
        ["Nina", 6, "2026-11-07", true],
      ]);
      // The route's body of it is the contract's `Members`.
      if (found === null) throw new Error("refused");
      const body = membersBody(at(FRIDAY), found);
      expect(Members.safeParse(body).success).toBe(true);
    });
  });

  it("orders the members by the week from Monday, not by when they joined", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES, { who: [] });
      const clock = fakeClock(TIMES.confirmed);
      // Ben, the first to join, takes Saturday and Nina, the last, takes Monday.
      await chooseOwn(tx, clock, w, 0, ["saturday"]);
      await chooseOwn(tx, clock, w, 5, ["monday"]);
      const joined = ["Ben", "Maya", "Alex", "Sam", "Debby", "Nina"];
      const order = async () => rows(await roster(tx, w.users[2] ?? "", w.club, THURSDAY)).map(([name]) => name);
      await confirmOwn(tx, clock, w, 0, ["saturday"]);
      await confirmOwn(tx, clock, w, 5, ["monday"]);
      for (const who of [1, 2, 3]) await confirmOwn(tx, clock, w, who);
      // One member still to confirm: the first days are open, and the order is still the joining's.
      expect(await order()).toEqual(joined);
      await confirmOwn(tx, clock, w, 4);
      // The last confirmation applied the first days: the rows move once, to the week's order.
      expect(await order()).toEqual(["Nina", "Maya", "Alex", "Sam", "Debby", "Ben"]);
      await days(tx, w, "2026-11-04T14:01:00Z");
      expect(rows(await roster(tx, w.users[2] ?? "", w.club, THURSDAY))).toEqual([
        ["Nina", 1, "2026-11-09", false],
        ["Maya", 2, "2026-11-10", false],
        ["Alex", 3, "2026-11-11", false],
        ["Sam", 4, "2026-11-12", false],
        ["Debby", 5, "2026-11-06", true],
        ["Ben", 6, "2026-11-07", false],
      ]);
    });
  });

  it("places a member of a club of three by the earlier of their two days, with the earlier date next", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 3, TIMES);
      await days(tx, w, "2026-11-04T14:01:00Z");
      // Ben has Monday and Thursday, Maya Tuesday and Friday, Alex Wednesday and Saturday.
      expect(rows(await roster(tx, w.users[1] ?? "", w.club, FRIDAY))).toEqual([
        ["Ben", 1, "2026-11-09", false],
        ["Maya", 2, "2026-11-10", false],
        ["Alex", 3, "2026-11-07", true],
      ]);
    });
  });

  it("drops a member who has left from the list, keeps everyone else's position without a gap, and names no day of theirs as next", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      await days(tx, w, "2026-11-04T14:01:00Z");
      // Nina, whose Saturday the 7th was next, leaves on Thursday evening: Nina's day is held (FQ63).
      await leave(
        plain(tx),
        { user: w.users[5] ?? "", interval: w.members[5] ?? "" },
        "Nina",
        new Date("2026-11-06T01:00:00Z"),
      );
      expect(rows(await roster(tx, w.users[0] ?? "", w.club, FRIDAY))).toEqual([
        ["Ben", 1, "2026-11-09", true],
        ["Maya", 2, "2026-11-10", false],
        ["Alex", 3, "2026-11-11", false],
        ["Sam", 4, "2026-11-12", false],
        ["Debby", 5, "2026-11-13", false],
      ]);
      // And Nina no longer gets the roster.
      expect(await roster(tx, w.users[5] ?? "", w.club, FRIDAY)).toBeNull();
    });
  });

  it("skips a day an operator has suspended: the member's next is the one after it (T5, T9)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      await days(tx, w, "2026-11-04T14:01:00Z");
      await tx`UPDATE app.occurrences SET status = 'suspended' WHERE club_id = ${w.club} AND local_date = '2026-11-07'`;
      const found = rows(await roster(tx, w.users[0] ?? "", w.club, FRIDAY));
      expect(found[5]).toEqual(["Nina", 6, "2026-11-14", false]);
      expect(found[0]).toEqual(["Ben", 1, "2026-11-09", true]);
    });
  });

  it("follows the week in force on the club's own date: a later week moves the rows only from its start (FQ61)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      // A second week from Monday 16 November, as a membership change will write one: the same days, last first.
      const next = newId("ver");
      await tx`
        INSERT INTO app.schedule_versions (id, club_id, effective_from, created_at)
        VALUES (${next}, ${w.club}, '2026-11-16', ${new Date("2026-11-06T15:00:00Z")})`;
      const dates = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"];
      for (const [index, weekday] of WEEKDAYS.entries()) {
        await tx`
          INSERT INTO app.schedule_assignments
            (schedule_version_id, club_id, weekday, star_interval_id, first_date, confirmed_at)
          VALUES (${next}, ${w.club}, ${weekday}, ${w.members[5 - index] ?? ""}, ${dates[index] ?? ""},
                  ${new Date("2026-11-06T15:00:00Z")})`;
      }
      const names = async (now: string) => rows(await roster(tx, w.users[2] ?? "", w.club, now)).map(([name]) => name);
      expect(await names(FRIDAY)).toEqual([...NAMES]);
      // Sunday the 15th, a microsecond before midnight in New York: still the first week, though in UTC
      // it has been the 16th for five hours (T2).
      expect(await names("2026-11-16T04:59:59.999999Z")).toEqual([...NAMES]);
      // Midnight on Monday the 16th in New York: the second week's order.
      expect(await names("2026-11-16T05:00:00Z")).toEqual([...NAMES].reverse());
      expect(await names("2026-12-01T17:00:00Z")).toEqual([...NAMES].reverse());
    });
  });

  it("has nobody next and no dates when no day has been made (T49: nothing is invented)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      expect(rows(await roster(tx, w.users[0] ?? "", w.club, FRIDAY))).toEqual([
        ["Ben", 1, null, false],
        ["Maya", 2, null, false],
        ["Alex", 3, null, false],
        ["Sam", 4, null, false],
        ["Debby", 5, null, false],
        ["Nina", 6, null, false],
      ]);
    });
  });

  it("lists a club with no week at all in the order its members joined", async () => {
    await rolledBack(db, async (tx) => {
      const bare = await clubOf(tx, 4);
      expect(rows(await roster(tx, bare.users[3] ?? "", bare.club, FRIDAY))).toEqual([
        ["Ben", 1, null, false],
        ["Maya", 2, null, false],
        ["Alex", 3, null, false],
        ["Sam", 4, null, false],
      ]);
    });
  });
});

describe("members who joined at one instant (FQ114)", () => {
  it("lists them by their membership's id, in byte order, the same for every member and every time", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await newUser(plain(tx), "Ben");
      const club = newId("club");
      const first = newId("mem");
      await tx`
        INSERT INTO app.clubs (id, name, timezone, creator_interval_id, created_at)
        VALUES (${club}, 'Sunday people', 'America/New_York', ${first}, ${AT.created})`;
      await tx`
        INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_at)
        VALUES (${first}, ${club}, ${ben}, 'creator', ${AT.created})`;
      // One roster brings four in at the same instant.
      const names = ["Maya", "Alex", "Sam", "Debby"];
      const users: string[] = [];
      for (const name of names) users.push(await newUser(plain(tx), name));
      const joined = await joinByRoster(
        plain(tx),
        club,
        { user: ben, interval: first },
        users.map((user, index) => ({ user, label: names[index] ?? "" })),
        AT.joined,
      );
      await tx`UPDATE app.clubs SET activated_at = ${new Date(AT.joined.getTime() + 3_600_000)} WHERE id = ${club}`;
      // Byte order, written without the database's or the language's collation.
      const bytes = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
      const expected = [first, ...[...joined].sort(bytes)];
      for (const user of [ben, ...users]) {
        const found = await roster(tx, user, club, FRIDAY);
        expect(found?.members.map((member) => member.person.membershipId)).toEqual(expected);
        expect(found?.members.map((member) => member.position)).toEqual([1, 2, 3, 4, 5]);
      }
    });
  });
});

describe("who gets the roster (T14)", () => {
  it("gives nothing to a member who left, and the whole roster again once that person rejoins, on the new membership", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      const nina = { user: w.users[5] ?? "", interval: w.members[5] ?? "" };
      await leave(plain(tx), nina, "Nina", new Date("2026-11-06T01:00:00Z"));
      expect(await roster(tx, nina.user, w.club, FRIDAY)).toBeNull();
      const [again] = await joinByRoster(
        plain(tx),
        w.club,
        { user: w.users[0] ?? "", interval: w.members[0] ?? "" },
        [{ user: nina.user, label: "Nina" }],
        new Date("2026-11-06T02:00:00Z"),
      );
      const found = await roster(tx, nina.user, w.club, FRIDAY);
      expect(found?.club.membershipId).toBe(again);
      // The old membership isn't in the list; the new one is, once, with no day (Saturday was the old one's).
      const ids = found?.members.map((member) => member.person.membershipId) ?? [];
      expect(ids).not.toContain(nina.interval);
      expect(ids.filter((id) => id === again)).toHaveLength(1);
      expect(found?.members.find((member) => member.person.membershipId === again)?.nextDay).toBeNull();
    });
  });

  it("gives nothing to an account that has asked to be deleted, though its membership hasn't ended yet", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      expect(await roster(tx, w.users[1] ?? "", w.club, FRIDAY)).not.toBeNull();
      await tx`
        UPDATE app.users SET state = 'deleting', deletion_requested_at = '2026-11-06T01:00:00Z'
         WHERE id = ${w.users[1] ?? ""}`;
      expect(await roster(tx, w.users[1] ?? "", w.club, FRIDAY)).toBeNull();
      // The others still get it. Maya's row stays while the membership is active, by name, with no day
      // (the day is held: T27) and no avatar: FQ117 asks whether it should.
      const found = await roster(tx, w.users[0] ?? "", w.club, FRIDAY);
      const maya = found?.members.find((member) => member.person.membershipId === w.members[1]);
      expect(maya).toMatchObject({
        person: { displayName: "Maya", avatarVersion: null },
        nextDay: null,
        nextUp: false,
      });
    });
  });

  it("gives nothing to a stranger, to an id nobody has, to what can't be an id, or of a suspended club", async () => {
    await rolledBack(db, async (tx) => {
      const w = await confirmedWeek(tx, 6, TIMES);
      const stranger = await newUser(plain(tx), "Zed");
      expect(await roster(tx, stranger, w.club, FRIDAY)).toBeNull();
      expect(await roster(tx, w.users[0] ?? "", "club_nobody_has_this", FRIDAY)).toBeNull();
      expect(await roster(tx, w.users[0] ?? "", "not an id", FRIDAY)).toBeNull();
      // A member of another club gets nothing of this one.
      const other = await confirmedWeek(tx, 2, TIMES);
      expect(await roster(tx, other.users[0] ?? "", w.club, FRIDAY)).toBeNull();
      expect(await roster(tx, other.users[0] ?? "", other.club, FRIDAY)).not.toBeNull();
      await tx`UPDATE app.clubs SET suspended_at = ${at("2026-11-05T12:00:00Z")} WHERE id = ${w.club}`;
      expect(await roster(tx, w.users[0] ?? "", w.club, FRIDAY)).toBeNull();
    });
  });
});
