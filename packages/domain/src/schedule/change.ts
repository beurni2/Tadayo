/// <reference lib="esnext.temporal" />
// A new member's days once a club's first days have applied: the membership change (spec 05; FQ16, FQ79,
// FQ100, FQ102, the founder's answers to FQ125 to FQ127 and to the three-to-four card, FQ129 to FQ131;
// docs/plans/api-b2-new-member-day.md, section 1). Pure rules: they read no clock and no database.
// ./settle-change.ts reads the facts under the club's row and writes what `pickAfter` says, for every
// command that starts or ends a membership and when the first days apply; ./confirm-days.ts dates a new
// member's confirmed day by `newMemberFirstDate` and starts the week it writes on `nextWeekStart`.
//
// - Nobody already in the week is asked anything, and nobody moves (FQ125, FQ126): a member who stays
//   keeps exactly their days through any join or leave, even where spec 05's table would give a smaller
//   club two days each (FQ131).
// - One exception, the founder's answer on three to four members: when the free days can't give each new
//   member spec 05's number (three who hold all six days, and a fourth joins), a day is freed now
//   (`freed`): each member already in the week keeps their first day from Monday, and their other days
//   leave the week, their days announced from the next week on cancelled. The new member picks from them
//   and starts next week. Where enough days are free (two members and a third who hasn't confirmed, and a
//   fourth; two who join at once), nobody's day is freed: the new members pick from the free ones.
// - A free day is one no active member has in the club's latest week: one nobody had, a member's who left,
//   or one just freed.
// - The members with no day in the latest week (someone who joined since, or a late joiner of the first
//   days, FQ100) pick free days in one proposal per club, each spec 05's number for the club's size
//   (FQ131), holding at first the table's days for their place in the order they joined when those are
//   free and nobody it includes holds them, else the first such days from Monday (FQ48). A member who joins
//   while it is open is added to it; when the club's size changes the number of days each, a new pick takes
//   its place for the members then without a day, and the earlier one's id answers MEMBERSHIP_CHANGED. It
//   applies when every member it includes who is still active has confirmed, and ends with no successor
//   when nobody it includes is still a member or the club is paused (FQ16).
// - A new member's confirmed day first opens on that weekday in the week after the confirmation, the
//   first such date whose 7 AM is at least 24 elapsed hours after it (FQ79, FQ130), after the last day of
//   that weekday announced for a member still in the club, and on or after the start of the week it joins.

import { firstDate } from "./first-date.ts";
import { daysPerMember, proposedWeek, WEEKDAYS, type Weekday } from "./propose.ts";
import type { ProposedDays } from "./roster-change.ts";

/** One day of the club's latest week: its star by membership interval, a member still or not. */
export interface WeekDay {
  readonly weekday: Weekday;
  readonly star: string;
}

/** One member the open pick includes, as its rows say. Whether they are still a member is `active`'s. */
export interface PickMember {
  readonly id: string;
  readonly confirmed: boolean;
  /** The days they hold in it. */
  readonly held: readonly Weekday[];
}

export interface PickFacts {
  /** The club's active members, by membership interval, in the order they joined (FQ98, FQ114). */
  readonly active: readonly string[];
  /** The club's first days are open. */
  readonly firstDaysOpen: boolean;
  /** The days of the club's latest week, or null when its first days never applied. */
  readonly week: readonly WeekDay[] | null;
  /** The open pick, or null. */
  readonly open: null | { readonly daysPerMember: 1 | 2; readonly members: readonly PickMember[] };
}

export type PickProposal =
  | { readonly kind: "nothing" }
  /** The open pick ends with no successor. */
  | { readonly kind: "drop" }
  /** The open pick applies: everyone it includes who is still a member has confirmed. */
  | { readonly kind: "apply" }
  /** Members who joined while it is open, each with the days they hold at first. */
  | { readonly kind: "add"; readonly members: readonly ProposedDays[] }
  /** A pick for the members with no day; `replaces` when it takes an open pick's place. */
  | {
      readonly kind: "open";
      readonly replaces: boolean;
      readonly daysPerMember: 1 | 2;
      readonly proposed: readonly ProposedDays[];
    };

export interface PickChange {
  /** Days of members already in the week that leave it now, by member in the order they joined, from Monday. */
  readonly freed: readonly WeekDay[];
  readonly proposal: PickProposal;
}

const NOTHING: PickChange = { freed: [], proposal: { kind: "nothing" } };

function check(active: readonly string[]): void {
  if (active.length > 6) throw new RangeError("schedule: a club has at most six members (A01)");
  if (new Set(active).size !== active.length) throw new Error("schedule: each active member is listed once");
}

const fromMonday = (days: readonly Weekday[]): Weekday[] => WEEKDAYS.filter((weekday) => days.includes(weekday));

/**
 * The days each of `ids` holds at first: `per` days, the table's for their place among the `active` when
 * free and not in `taken`, else the first such from Monday. `taken` gains what each is given.
 */
function firstHolds(
  ids: readonly string[],
  active: readonly string[],
  per: 1 | 2,
  taken: Set<Weekday>,
): ProposedDays[] {
  const table = proposedWeek(active.length);
  return ids.map((id): ProposedDays => {
    const days: Weekday[] = [];
    const wanted = table[active.indexOf(id)] ?? [];
    for (const weekday of [...wanted, ...WEEKDAYS]) {
      if (days.length === per) break;
      if (taken.has(weekday)) continue;
      taken.add(weekday);
      days.push(weekday);
    }
    // Spec 05's numbers leave enough free days: two each for up to three members, one each for up to six.
    if (days.length !== per) throw new Error("schedule: the week has no free day left for a new member");
    return { id, days: fromMonday(days) };
  });
}

/** What a change of the club's members, or its first days applying, does to its week and its pick. */
export function pickAfter(facts: PickFacts): PickChange {
  const { active, week, open } = facts;
  check(active);
  if (facts.firstDaysOpen || week === null) return NOTHING;
  if (active.length < 2) return open === null ? NOTHING : { freed: [], proposal: { kind: "drop" } };
  const per = daysPerMember(active.length);

  // Each active member's days in the week, from Monday. The members with none are new: each needs `per`
  // free days. Only when the free days can't give them that (three who hold all six days, and a fourth)
  // does the founder's answer free a day now: each member keeps their first `per` days, and the rest are
  // freed. Otherwise everyone keeps exactly their days, and nothing is cancelled (FQ125, FQ131).
  const daysOf = new Map(
    active.map((id) => [id, fromMonday(week.filter((day) => day.star === id).map((day) => day.weekday))] as const),
  );
  const fresh = active.filter((id) => daysOf.get(id)?.length === 0);
  const held = active.reduce((count, id) => count + (daysOf.get(id)?.length ?? 0), 0);
  const freeing = WEEKDAYS.length - held < per * fresh.length;
  const freed: WeekDay[] = [];
  const kept: WeekDay[] = [];
  for (const id of active) {
    (daysOf.get(id) ?? []).forEach((weekday, nth) =>
      (freeing && nth >= per ? freed : kept).push({ weekday, star: id }),
    );
  }
  const inWeek = new Set(kept.map((day) => day.weekday));

  if (open === null) {
    if (fresh.length === 0) return { freed, proposal: { kind: "nothing" } };
    return {
      freed,
      proposal: { kind: "open", replaces: false, daysPerMember: per, proposed: firstHolds(fresh, active, per, inWeek) },
    };
  }
  const included = open.members.filter((member) => active.includes(member.id));
  const everyoneConfirmed = included.length > 0 && included.every((member) => member.confirmed);
  if (open.daysPerMember !== per) {
    // A member it includes who hasn't confirmed has no day, so is among `fresh`: none means all confirmed.
    if (fresh.length === 0) return { freed, proposal: { kind: everyoneConfirmed ? "apply" : "drop" } };
    return {
      freed,
      proposal: { kind: "open", replaces: true, daysPerMember: per, proposed: firstHolds(fresh, active, per, inWeek) },
    };
  }
  const listed = new Set(open.members.map((member) => member.id));
  const joining = fresh.filter((id) => !listed.has(id));
  if (joining.length > 0) {
    const taken = new Set(inWeek);
    for (const member of included) if (!member.confirmed) for (const weekday of member.held) taken.add(weekday);
    return { freed, proposal: { kind: "add", members: firstHolds(joining, active, per, taken) } };
  }
  if (included.length === 0) return { freed, proposal: { kind: "drop" } };
  if (everyoneConfirmed) return { freed, proposal: { kind: "apply" } };
  return { freed, proposal: { kind: "nothing" } };
}

/** The Monday after the week of `today`, weeks running Monday to Sunday: where "next week" starts. */
export function nextMonday(today: Temporal.PlainDate): Temporal.PlainDate {
  return today.add({ days: 8 - today.dayOfWeek });
}

/**
 * The local date a week written on `today` starts: today, or the day after the start of the club's latest
 * week, `latestStart`, when that is today or later (a club has one week per start date).
 */
export function nextWeekStart(today: Temporal.PlainDate, latestStart: Temporal.PlainDate | null): Temporal.PlainDate {
  if (latestStart !== null && Temporal.PlainDate.compare(latestStart, today) >= 0) return latestStart.add({ days: 1 });
  return today;
}

/**
 * The first local date of a new member's `weekday` confirmed at `confirmedAt` (FQ130): in the week after
 * the confirmation's, on or after `weekStart`, the start of the week it joins, after `lastAnnounced`, the
 * last day of that weekday announced for a member still in the club, if any, and the first such date whose
 * 7 AM in `zone` is at least 24 elapsed hours after the confirmation (FQ79).
 */
export function newMemberFirstDate(
  weekday: Weekday,
  confirmedAt: Temporal.Instant,
  zone: string,
  weekStart: Temporal.PlainDate,
  lastAnnounced: Temporal.PlainDate | null,
): Temporal.PlainDate {
  const today = confirmedAt.toZonedDateTimeISO(zone).toPlainDate();
  let notBefore = nextMonday(today);
  if (Temporal.PlainDate.compare(weekStart, notBefore) > 0) notBefore = weekStart;
  if (lastAnnounced !== null && Temporal.PlainDate.compare(lastAnnounced, notBefore) >= 0) {
    notBefore = lastAnnounced.add({ days: 1 });
  }
  return firstDate(weekday, confirmedAt, zone, notBefore);
}
