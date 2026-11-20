/// <reference lib="esnext.temporal" />
// The membership change: the week every active member confirms when a club's members change after its
// first days have applied (spec 05: "Changing membership from three to four requires the one day cadence
// next week; four to three requires two. Existing announced reveal times remain fixed"; FQ16, FQ56, FQ61,
// FQ100, FQ102, FQ115, FQ125 to FQ127; docs/plans/api-b2-membership-change.md, section 2). Pure rules:
// they read no clock and no database. ./settle-change.ts reads the facts under the club's row and writes
// what they say, for every command that starts or ends a membership and when the first days apply.
//
// - When (`changeAfter`). While the first days are open their own rule decides (./roster-change.ts), and a
//   club that never had a confirmed week gets new first days, not a change (FQ102, FQ123). With fewer than
//   two members the club is paused (FQ16): an open change ends and none is proposed. When the active
//   members are exactly the stars of the club's latest week, each with spec 05's days, there is nothing to
//   change, and an open change ends. Otherwise a change is proposed for the active members, in place of an
//   open one for other members (FQ126): everyone confirms the new one.
// - Which week (`changeWeek`; FQ125). Where spec 05's table keeps the days each member has, every member
//   who stays keeps their days, a leaver's are free, and a member who lacks days (someone new, or a late
//   joiner of the first days: FQ100) is proposed days nobody keeps: the table's days for their place in the
//   order they joined when free, else the first free days from Monday. Where the table changes the days
//   each (between three and four members), the table's whole week in the order they joined, as a revision
//   of the first days does (FQ102).
// - From when (`changeStart`; FQ61, FQ115). The first Monday after every day already made and after the
//   days' window seen from today (./generate.ts `windowEnd`). A change that replaces an open one keeps its
//   start while that is still ahead: no day was made from it on (FQ127), so it is still the first free week.

import { windowEnd } from "./generate.ts";
import { daysPerMember, proposedWeek, WEEKDAYS, type Weekday } from "./propose.ts";
import type { ProposedDays } from "./roster-change.ts";

/** One day of the club's latest week: its star by membership interval, a member still or not. */
export interface WeekDay {
  readonly weekday: Weekday;
  readonly star: string;
}

export interface ChangeFacts {
  /** The club's active members, by membership interval, in the order they joined (FQ98, FQ114). */
  readonly active: readonly string[];
  /** The club's first days are open. */
  readonly firstDaysOpen: boolean;
  /** The days of the club's latest week, or null when no day was ever confirmed. */
  readonly week: readonly WeekDay[] | null;
  /** The open change, with the membership intervals it includes, or null. */
  readonly open: null | { readonly members: readonly string[] };
}

export interface ProposedWeek {
  readonly daysPerMember: 1 | 2;
  /** Every active member, in the order they joined, each with spec 05's number of days from Monday. */
  readonly proposed: readonly ProposedDays[];
}

export type WeekChange =
  | { readonly kind: "nothing" }
  /** The open change ends with no successor. */
  | { readonly kind: "drop" }
  /** A change for the active members; `replaces` when it takes an open change's place. */
  | ({ readonly kind: "propose"; readonly replaces: boolean } & ProposedWeek);

const fromMonday = (days: readonly Weekday[]): Weekday[] => WEEKDAYS.filter((weekday) => days.includes(weekday));

function check(active: readonly string[]): void {
  if (active.length > 6) throw new RangeError("schedule: a club has at most six members (A01)");
  if (new Set(active).size !== active.length) throw new Error("schedule: each active member is listed once");
}

/** The week a change proposes for `active`, given the days of the club's latest `week` (FQ125). */
export function changeWeek(active: readonly string[], week: readonly WeekDay[]): ProposedWeek {
  check(active);
  // Throws for a roster outside two to six (A01).
  const per = daysPerMember(active.length);
  const table = proposedWeek(active.length);
  const kept = new Map(
    active.map((id) => [id, fromMonday(week.filter((day) => day.star === id).map((day) => day.weekday))]),
  );
  const most = Math.max(0, ...[...kept.values()].map((days) => days.length));
  if (most !== 0 && most !== per) {
    // The table changes the days each member has: its whole week, in the order they joined.
    return { daysPerMember: per, proposed: active.map((id, place) => ({ id, days: table[place] ?? [] })) };
  }
  const taken = new Set<Weekday>([...kept.values()].flat());
  const proposed = active.map((id, place): ProposedDays => {
    const days = [...(kept.get(id) ?? [])];
    // The table's days for their place that nobody keeps, then the first free days from Monday.
    const wanted = (table[place] ?? []).filter((weekday) => !taken.has(weekday));
    for (const weekday of [...wanted, ...WEEKDAYS]) {
      if (days.length === per) break;
      if (taken.has(weekday)) continue;
      taken.add(weekday);
      days.push(weekday);
    }
    if (days.length !== per) throw new Error("schedule: the week has no free day left for a member");
    return { id, days: fromMonday(days) };
  });
  return { daysPerMember: per, proposed };
}

/** What a change of the club's members, or the first days applying, does to its week. */
export function changeAfter(facts: ChangeFacts): WeekChange {
  const { active, week, open } = facts;
  check(active);
  if (facts.firstDaysOpen || week === null) return { kind: "nothing" };
  if (active.length < 2) return open === null ? { kind: "nothing" } : { kind: "drop" };
  const per = daysPerMember(active.length);
  const asTheWeek =
    week.every((day) => active.includes(day.star)) &&
    active.every((id) => week.filter((day) => day.star === id).length === per);
  if (asTheWeek) return open === null ? { kind: "nothing" } : { kind: "drop" };
  if (open !== null && open.members.length === active.length && open.members.every((id) => active.includes(id))) {
    return { kind: "nothing" };
  }
  return { kind: "propose", replaces: open !== null, ...changeWeek(active, week) };
}

/**
 * The local date a change proposed on `today` starts: the first Monday after the days' window seen from
 * `today` and after `lastMade`, the last local date a day was made for (FQ61, FQ115). `replacedStart` is
 * the start of the open change it replaces, kept while it is still ahead of `today` and of every day made
 * (FQ126, FQ127).
 */
export function changeStart(
  today: Temporal.PlainDate,
  lastMade: Temporal.PlainDate | null,
  replacedStart: Temporal.PlainDate | null,
): Temporal.PlainDate {
  // Still ahead, and still after every day made: generation makes none from an open change's start (FQ127).
  if (
    replacedStart !== null &&
    Temporal.PlainDate.compare(replacedStart, today) > 0 &&
    (lastMade === null || Temporal.PlainDate.compare(lastMade, replacedStart) < 0)
  ) {
    return replacedStart;
  }
  let start = windowEnd(today).add({ days: 1 });
  if (lastMade !== null && Temporal.PlainDate.compare(lastMade, start) >= 0) {
    start = lastMade.add({ days: 8 - lastMade.dayOfWeek });
  }
  return start;
}
