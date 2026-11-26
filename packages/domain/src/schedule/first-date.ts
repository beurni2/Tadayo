/// <reference lib="esnext.temporal" />
// The first date a newly confirmed day opens (FQ79; spec 04: no instant first reveal; T2).
//
// It is the first date on the day's weekday whose 7 AM, resolved in the club's zone, is at least 24
// elapsed hours after the confirmation. Instants are compared, never calendar dates: exactly 24 hours
// qualifies, one nanosecond less waits a week, and the 24 hours are real time across a clock change.
//
// A week that starts after the confirmation (new first days after a member who left had confirmed a day,
// whose made days a new week must follow: FQ61, FQ124) adds its start: the date is also on or after it.

import { REVEAL_TIME, clubTimeZone, resolveCivilTime } from "../time/civil.ts";
import type { ServerNow } from "../time/clock.ts";
import { WEEKDAYS, type Weekday } from "./propose.ts";

const LEAD_NANOSECONDS = 24n * 3_600_000_000_000n;

/**
 * The first local date of `weekday` in `zone` whose 7 AM is at least 24 elapsed hours after `confirmedAt`,
 * and which is on or after `notBefore`, the start of the day's week, when that is given.
 */
export function firstDate(
  weekday: Weekday,
  confirmedAt: ServerNow,
  zone: string,
  notBefore?: Temporal.PlainDate,
): Temporal.PlainDate {
  const isoDay = WEEKDAYS.indexOf(weekday) + 1;
  if (isoDay === 0) throw new RangeError(`schedule: ${weekday} can't be someone's day (T6)`);
  const club = clubTimeZone(zone);
  const earliest = confirmedAt.epochNanoseconds + LEAD_NANOSECONDS;
  // The weekday's first date on or after the confirmation's own local date, then week by week. Its
  // 7 AM is past the lead by the third at the latest: two weeks is more than 24 hours and any clock change.
  let date = confirmedAt.toZonedDateTimeISO(club).toPlainDate();
  if (notBefore !== undefined && Temporal.PlainDate.compare(notBefore, date) > 0) date = notBefore;
  date = date.add({ days: (isoDay - date.dayOfWeek + 7) % 7 });
  for (let week = 0; week < 3; week += 1) {
    if (resolveCivilTime(date, REVEAL_TIME, club).epochNanoseconds >= earliest) return date;
    date = date.add({ days: 7 });
  }
  throw new Error(`schedule: no first date for ${weekday} after ${confirmedAt.toString()} in ${club}`);
}
