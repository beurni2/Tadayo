/// <reference lib="esnext.temporal" />
// A day's two instants, from its date in the club's zone (spec 05; T2; ADR-008; Q03).
//
// A day opens at 07:00 on its date and closes at 01:00 on the next date, both in the club's IANA
// zone, so every member shares the same two instants wherever they are. Each is resolved on its
// own, never one from the other plus a duration, by spec 05's two rules:
//   - a wall time the clocks pass twice (they go back) takes its first occurrence;
//   - a wall time the clocks skip (they go forward) takes the next valid instant: the moment they
//     jump, the first instant after it on the wall.
// Temporal (Node 26) gives the first rule as `earlier`. No disambiguation option gives the
// second: `compatible` and `later` move the wall time on by the gap's length, which is later than
// the jump whenever the time falls inside the gap rather than at its start (ADR-008). So that
// rule is written out below. The occurrence rows store these instants; Postgres only compares them.

export const REVEAL_TIME = Temporal.PlainTime.from("07:00");
export const CLOSE_TIME = Temporal.PlainTime.from("01:00");

export interface DayInstants {
  /** 07:00 on the day's date in the club's zone: the reveal, and the cutoff (T3). */
  readonly revealAt: Temporal.Instant;
  /** 01:00 on the next date in the club's zone: Home moves on (spec 06, T5). */
  readonly closeAt: Temporal.Instant;
}

const compareWall = (a: Temporal.PlainDateTime, b: Temporal.PlainDateTime) => Temporal.PlainDateTime.compare(a, b);

/**
 * A club's zone as Temporal names it, or a RangeError: an IANA name (never a bare offset such as
 * "+05:00", which Temporal takes as a zone but which has no clock changes, and which the contract
 * refuses: FQ19) that Temporal can resolve. The contract's own check uses Intl, which also takes
 * old abbreviations such as BST, PST and IST that Temporal refuses, so the command that makes a
 * club stores what this returns, in one spelling ("europe/london" becomes "Europe/London").
 * Temporal also reads a string that starts with T as an ISO time and takes its offset or its
 * bracketed zone ("T07+05" gives +05:00, "T07:00[Europe/London]" Europe/London), so the name it
 * resolves must be the one given, apart from case, and not an offset.
 */
export function clubTimeZone(zone: string): string {
  const refused = () => new RangeError(`time: ${zone} isn't an IANA time zone (T2, FQ19)`);
  const id = Temporal.PlainDate.from("2026-01-01").toZonedDateTime(zone).timeZoneId;
  if (id.toLowerCase() !== zone.toLowerCase() || /^[+-]/.test(id)) throw refused();
  return id;
}

/** The instant a wall time names in an IANA zone, by spec 05's two rules. */
export function resolveCivilTime(date: Temporal.PlainDate, time: Temporal.PlainTime, zone: string): Temporal.Instant {
  const wall = date.toPlainDateTime(time);
  // On the wall once, or the first of two: that instant.
  const first = wall.toZonedDateTime(clubTimeZone(zone), { disambiguation: "earlier" });
  if (compareWall(first.toPlainDateTime(), wall) === 0) return first.toInstant();
  // Skipped: `earlier` lands before the jump, so the next transition is the jump itself. Check it
  // is: the wall is before the wall time just ahead of it, and past it from it on.
  const jump = first.getTimeZoneTransition("next");
  if (
    jump === null ||
    compareWall(jump.subtract({ nanoseconds: 1 }).toPlainDateTime(), wall) >= 0 ||
    compareWall(jump.toPlainDateTime(), wall) <= 0
  ) {
    throw new Error(`time: no next valid instant for ${wall.toString()} in ${zone}`);
  }
  return jump.toInstant();
}

/** A day's reveal and close, each resolved on its own in the club's zone (T2). */
export function dayInstants(localDate: Temporal.PlainDate, zone: string): DayInstants {
  const revealAt = resolveCivilTime(localDate, REVEAL_TIME, zone);
  const closeAt = resolveCivilTime(localDate.add({ days: 1 }), CLOSE_TIME, zone);
  return { revealAt, closeAt };
}
