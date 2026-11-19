/// <reference lib="esnext.temporal" />
// The days a club is owed (spec 05: "Generate upcoming occurrences several weeks ahead"; spec 06; T2,
// T6; FQ16, FQ61, FQ63, FQ79, FQ115). A pure rule: it reads no clock and no database. The command that
// makes the days (./make-days.ts) gives it the club's facts and the clock's sample, and the database's
// own guard judges every row again (db/migrations/0005_schedules_and_days.sql, occurrences_insert_guard).
//
// - The window is the club's own today at `now` through today plus HORIZON_DAYS, both dates in the club's
//   zone.
// - A date in it is owed when it isn't a Sunday (T6), the version in force on it (the latest that started
//   on or before it: FQ61) gives its weekday to a star, the date is on or after that day's first date
//   (FQ79), and the star is still a member (FQ63).
// - Its two instants are resolved in the club's zone, each on its own (T2; ../time/civil.ts).
// - A day is never made late: a date whose 7 AM is at `now` or before it isn't owed. A day made after its
//   reveal would be born open, with nobody having been able to add to it (spec 04: no instant reveal).
// - A club that hasn't started, is suspended (spec 22) or has fewer than two members (FQ16) is owed
//   nothing. The days it already has stay as they are: this rule only ever adds.
// - A date that already has a day is not owed again, whoever's day it is.

import { clubTimeZone, dayInstants } from "../time/civil.ts";
import { WEEKDAYS, type Weekday } from "./propose.ts";

/**
 * How far ahead days are made, in days after the club's today: four weeks (FQ115), the number the
 * contract's fixtures took (packages/contracts/src/fixtures/world.ts, `changeFrom`).
 */
export const HORIZON_DAYS = 28;

export interface WeekAssignment {
  readonly weekday: Weekday;
  /** The star's membership interval. */
  readonly starInterval: string;
  /** The first local date the day opens (FQ79). */
  readonly firstDate: string;
  /** Whether the star's interval is active. */
  readonly starActive: boolean;
}

export interface WeekVersion {
  readonly id: string;
  /** The local date it is in force from. */
  readonly effectiveFrom: string;
  readonly assignments: readonly WeekAssignment[];
}

export interface GenerationFacts {
  /** The club's IANA zone. */
  readonly zone: string;
  readonly activated: boolean;
  readonly suspended: boolean;
  /** Active members. */
  readonly activeMembers: number;
  /** Every version of the club's week, in any order. */
  readonly versions: readonly WeekVersion[];
  /** The local dates that already have a day. */
  readonly made: ReadonlySet<string>;
}

export interface OwedDay {
  readonly localDate: string;
  readonly versionId: string;
  readonly starInterval: string;
  readonly revealAt: Temporal.Instant;
  readonly closeAt: Temporal.Instant;
}

/** The days the club is owed at `now`, in date order. */
export function daysToMake(facts: GenerationFacts, now: Temporal.Instant): OwedDay[] {
  const zone = clubTimeZone(facts.zone);
  // A fact that is missing makes no day: `!(n >= 2)` is true of a number that isn't one.
  if (!facts.activated || facts.suspended || !(facts.activeMembers >= 2)) return [];
  // ISO dates compare as text.
  const versions = [...facts.versions].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  const today = now.toZonedDateTimeISO(zone).toPlainDate();
  const owed: OwedDay[] = [];
  for (let ahead = 0; ahead <= HORIZON_DAYS; ahead += 1) {
    const date = today.add({ days: ahead });
    const weekday = WEEKDAYS[date.dayOfWeek - 1];
    if (weekday === undefined) continue; // Sunday (T6).
    const localDate = date.toString();
    if (facts.made.has(localDate)) continue;
    const inForce = versions.filter((version) => version.effectiveFrom <= localDate).at(-1);
    const day = inForce?.assignments.find((assignment) => assignment.weekday === weekday);
    if (inForce === undefined || day === undefined) continue;
    if (!day.starActive || !(day.firstDate <= localDate)) continue;
    const { revealAt, closeAt } = dayInstants(date, zone);
    if (!(Temporal.Instant.compare(revealAt, now) > 0)) continue;
    owed.push({ localDate, versionId: inForce.id, starInterval: day.starInterval, revealAt, closeAt });
  }
  return owed;
}
