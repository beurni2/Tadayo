/// <reference lib="esnext.temporal" />
// Home's day choice (spec 06, 08; T1, T5, T9, T14; FQ50, FQ63, FQ75): for a viewer and the server's
// time, the day open now and the day that opens next in each of their clubs. The club list answers
// with it (`open_day` and `next_day`, the contract's ClubSummary), and Home asks it first (getHome,
// B2). Every route, job, push and widget that places a day asks it here, never in a handler (T9):
// through the SQL that lists it (`daysByClub`), or through this policy on facts loaded for it
// (`chooseDays`). The two state the same rule, condition by condition, and
// tests/src/db/home-days.test.ts runs both on the same rows.
//
// The roster's next dates are the same rule asked of one member (listMembers; spec 09, 32): the next
// day among those whose star is that member, by the SQL (`nextDaysByStar`) or by the policy
// (`chooseNextDayOf`), the pair run on the same rows by the same test.
//
// Home's recent days (`recentDays`, getHome's `recent_days`) are the days of the same rule that have closed
// and hold a drop the viewer may see the media of, which the read predicate's own SQL decides
// (`readableDrops`); it has no policy twin, since no command asks it of one day, and the privacy matrix
// judges it from the world's rows apart from this statement (tests/src/privacy/home.ts).
//
// The rule:
// - Only the viewer's clubs: their account is active and they have an active interval there. A
//   stranger, a former member or a guessed id gets nothing (T14); a rejoined member gets the club's
//   days on the new interval.
// - Not a suspended club (spec 22: Home's `unavailable`). A paused club keeps the days its rows hold
//   until they pass (FQ50); a proposed club has none (spec 04).
// - Only a scheduled day: a suspended or cancelled one is neither open nor next (T5; spec 06, 22).
//   Its neutral answer is getOccurrence's.
// - Not a held day: one whose star's interval ended, or whose star asked to delete their account,
//   before its reveal never opens (FQ63, T27), whatever the worker that ends the interval has done
//   (T1). These are the read predicate's own two conditions, from the same source (read.ts'
//   `notBeforeReveal`, read-sql.ts' `starKeepsDay`). A day already open when its star leaves stays
//   open to its close, as its drops stay readable.
// - Open while reveal_at <= now < close_at. Next: the earliest reveal_at after now, so while a day
//   is open the next is the one after it. Two days of a club never overlap (one date each, and a
//   day closes at 01:00 on the next date, before that date's 07:00), and each choice takes the
//   earliest reveal anyway. A day exists only where a schedule assigned one, so an unused weekday
//   or a Sunday never appears, and no row gives no day: nothing is invented (T49).
// - The star as the contract's Person, by FQ75's rule: the account's name while the interval is
//   active, the name it ended with once it has ended; the avatar's version only while both the
//   interval and the account are active. A day with no name to show (an account deleted during its
//   open day, whose interval kept none) is left out, never sent nameless, until B6 settles a deleted
//   account's days (docs/LIMITATIONS.md).
//
// It reads no clock: `now` is a ServerNow, the caller's sample, taken first in its transaction (T1).
// Each condition is written as the one value that grants, so a fact that is missing or unknown
// denies.

import type { ServerNow } from "../time/clock.ts";
import { wholeMicroseconds } from "../time/instant.ts";
import { checkNow, notBeforeReveal, type AccountState, type DayStatus, type MembershipState } from "./read.ts";
import { checkViewer, readableDrops, starKeepsDay, type FragmentSql } from "./read-sql.ts";

/** Where a chosen day is at `now`: the open day is open, the next one is collecting (OccurrencePhase). */
export type ChosenPhase = "open" | "collecting";

/** Where a day Home names is at `now`: a chosen day's phase, or past for a recent day (OccurrencePhase). */
export type PlacedPhase = ChosenPhase | "past";

/** A day as Home names it: the contract's Occurrence, with its instants whole. */
export interface PlacedDay {
  readonly id: string;
  readonly clubId: string;
  readonly star: {
    /** The star's membership interval. */
    readonly membershipId: string;
    readonly displayName: string;
    /** The version of the star's avatar, or null when there is none to show. */
    readonly avatarVersion: string | null;
  };
  /** The day's date in the club's timezone, such as 2026-11-07. */
  readonly localDate: string;
  readonly revealAt: Temporal.Instant;
  readonly closeAt: Temporal.Instant;
  readonly phase: PlacedPhase;
}

/** A day as Home places it: open now, or the next to open. */
export interface ChosenDay extends PlacedDay {
  readonly phase: ChosenPhase;
}

/**
 * One of Home's recent days (the contract's DayLink): a day that has closed, which the viewer can read
 * something in, with the photo that covers it for them, or null when they can read no photo of it.
 */
export interface RecentDay {
  readonly day: PlacedDay & { readonly phase: "past" };
  readonly coverDropId: string | null;
}

/** A club's two days at `now`, each null when there is none. */
export interface DayChoice {
  readonly open: ChosenDay | null;
  readonly next: ChosenDay | null;
}

/** What the policy reads about one day of the club, as the database holds it. */
export interface DayFacts {
  readonly id: string;
  readonly clubId: string;
  readonly status: DayStatus;
  readonly localDate: string;
  readonly revealAt: Temporal.Instant;
  readonly closeAt: Temporal.Instant;
  /** The star's membership interval, its state, when it ended and the name it ended with. */
  readonly starInterval: string;
  readonly starIntervalState: MembershipState;
  readonly starLeftAt: Temporal.Instant | null;
  readonly starEndedName: string | null;
  /** The star's account, its name now, when it asked to be deleted, and its ready avatar's version. */
  readonly starAccount: AccountState;
  readonly starName: string | null;
  readonly starDeletionRequestedAt: Temporal.Instant | null;
  readonly starAvatarVersion: string | null;
}

/** What the policy reads about one viewer and one club. */
export interface ClubDayFacts {
  /** The viewer's account, or null when no account has the viewer's id. */
  readonly viewerAccount: AccountState | null;
  /** `active` when the viewer has an active interval in the club, else the state of their latest one, or null. */
  readonly viewerInterval: MembershipState | null;
  readonly clubSuspendedAt: Temporal.Instant | null;
  /** Every day of the club, in any status. */
  readonly days: readonly DayFacts[];
}

const NONE: DayChoice = { open: null, next: null };

/** The name members see of the day's star (FQ75), or null when there is none. */
function starNameOf(day: DayFacts): string | null {
  return day.starIntervalState === "active" ? day.starName : day.starEndedName;
}

function before(a: Temporal.Instant, b: Temporal.Instant): boolean {
  return Temporal.Instant.compare(a, b) < 0;
}

/** Whether the day can be chosen at all, whatever the time: scheduled, not held, with a star to name. */
function placeable(day: DayFacts): boolean {
  return (
    day.status === "scheduled" &&
    notBeforeReveal(day.starLeftAt, day.revealAt) &&
    notBeforeReveal(day.starDeletionRequestedAt, day.revealAt) &&
    typeof starNameOf(day) === "string"
  );
}

function chosen(day: DayFacts, phase: ChosenPhase): ChosenDay {
  const name = starNameOf(day);
  if (name === null) throw new Error("authorization: a day with no star to name was chosen");
  return {
    id: day.id,
    clubId: day.clubId,
    star: {
      membershipId: day.starInterval,
      displayName: name,
      avatarVersion: day.starIntervalState === "active" && day.starAccount === "active" ? day.starAvatarVersion : null,
    },
    localDate: day.localDate,
    revealAt: day.revealAt,
    closeAt: day.closeAt,
    phase,
  };
}

/**
 * The club's open day and next day for the viewer at `now`, by the rule above; neither for facts
 * that are null (no such club) or that deny.
 */
export function chooseDays(facts: ClubDayFacts | null, now: ServerNow): DayChoice {
  checkNow(now);
  if (facts === null) return NONE;
  if (!(facts.viewerAccount === "active" && facts.viewerInterval === "active" && facts.clubSuspendedAt === null))
    return NONE;
  const days = facts.days
    .filter(placeable)
    .sort((a, b) => Temporal.Instant.compare(a.revealAt, b.revealAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const open = days.find((day) => !before(now, day.revealAt) && before(now, day.closeAt));
  const next = days.find((day) => before(now, day.revealAt));
  return {
    open: open === undefined ? null : chosen(open, "open"),
    next: next === undefined ? null : chosen(next, "collecting"),
  };
}

/**
 * The next day of the member `starInterval` for the viewer at `now`: `chooseDays`' next, among the days
 * whose star is that member; null for facts that are null or that deny, and when the member has none.
 * A member whose interval has ended always has none: a day of theirs still to open is held (`placeable`,
 * the read predicate's rule), which is why `nextDaysByStar` lists a club's active intervals and no other.
 */
export function chooseNextDayOf(facts: ClubDayFacts | null, starInterval: string, now: ServerNow): ChosenDay | null {
  if (facts === null) return null;
  return chooseDays({ ...facts, days: facts.days.filter((day) => day.starInterval === starInterval) }, now).next;
}

type Bound<F> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant | F)[]) => F;

function bound<F>(sql: FragmentSql<F>): Bound<F> {
  return sql as unknown as Bound<F>;
}

/**
 * One of a club's two days, as a scalar subquery on the outer statement's club `c`; with `ofMember`, the
 * day of that kind whose star is the outer statement's membership `sm`.
 */
function oneDay<F>(sql: FragmentSql<F>, now: ServerNow, phase: ChosenPhase, ofMember = false): F {
  const whose = ofMember ? bound(sql)`o.star_interval_id = sm.interval_id` : bound(sql)`TRUE`;
  const when =
    phase === "open"
      ? bound(sql)`o.reveal_at <= ${now}::pg_catalog.timestamptz AND ${now}::pg_catalog.timestamptz < o.close_at`
      : bound(sql)`o.reveal_at > ${now}::pg_catalog.timestamptz`;
  return bound(sql)`
    SELECT ${dayObject(sql)}
      FROM app.occurrences o
      JOIN app.memberships s ON s.interval_id = o.star_interval_id
      JOIN app.users su ON su.id = s.user_id
     WHERE o.club_id = c.id
       AND ${placeableDay(sql)}
       AND ${when}
       AND ${whose}
     ORDER BY o.reveal_at, o.id
     LIMIT 1`;
}

/**
 * A day as a jsonb object for `chosenDay` and `recentDay` to read: the day `o`, its star by FQ75's rule from
 * the star's interval `s` and account `su` (the name while the interval is active, the name it ended with
 * after; the avatar's version only while both are active).
 */
function dayObject<F>(sql: FragmentSql<F>): F {
  return bound(sql)`pg_catalog.jsonb_build_object(
             'id', o.id, 'club_id', o.club_id, 'local_date', o.local_date,
             'reveal_at', o.reveal_at, 'close_at', o.close_at,
             'star_membership_id', s.interval_id,
             'star_name', CASE WHEN s.state = 'active' THEN su.display_name ELSE s.ended_display_name END,
             'star_avatar_version',
             CASE WHEN s.state = 'active' AND su.state = 'active'
                  THEN (SELECT up.content_version FROM app.uploads up
                         WHERE up.id = su.avatar_upload_id AND up.state = 'ready') END)`;
}

/**
 * `placeable`'s three conditions on the day `o`, whatever the time: scheduled, not held (its star `s`, `su`
 * hadn't left or asked to delete their account before its reveal: `starKeepsDay`), with a star to name.
 */
function placeableDay<F>(sql: FragmentSql<F>): F {
  return bound(sql)`o.status = 'scheduled'
       AND ${starKeepsDay(sql)}
       AND (CASE WHEN s.state = 'active' THEN su.display_name ELSE s.ended_display_name END) IS NOT NULL`;
}

/**
 * Each active member of each club of `viewer`'s with that member's next day at `now`, as a subquery of
 * rows `(club_id, star_interval_id, next_day)`: the roster's next dates (listMembers; spec 09, 32). A
 * member's next day is the club's next-day rule above, among the days whose star is that member: the
 * earliest reveal after `now` of a scheduled day that isn't held, or null when they have none (T49). It
 * lists only the clubs `daysByClub` lists, by the same three conditions, so a caller joins it on its own
 * club and member ids with no check of its own (T9, T14).
 */
export function nextDaysByStar<F>(sql: FragmentSql<F>, viewer: string, now: ServerNow): F {
  checkViewer(viewer);
  checkNow(now);
  return bound(sql)`
    SELECT c.id AS club_id, sm.interval_id AS star_interval_id,
           (${oneDay(sql, now, "collecting", true)}) AS next_day
      FROM app.clubs c
      JOIN app.memberships sm ON sm.club_id = c.id AND sm.state = 'active'
     WHERE c.suspended_at IS NULL
       AND EXISTS (SELECT FROM app.memberships m JOIN app.users u ON u.id = m.user_id
                    WHERE m.club_id = c.id AND m.user_id = ${viewer}::pg_catalog.text
                      AND m.state = 'active' AND u.state = 'active')`;
}

/**
 * Each club of `viewer`'s with its two days at `now`, as a subquery of rows `(club_id, open_day,
 * next_day)`, each day a jsonb object for `chosenDay` to read, or null. It lists every club the
 * rule lets the viewer see days of and no other, so a caller joins it on its own club ids, or
 * filters it by a path's, with no check of its own (T9, T14): another's club, one the viewer left
 * or a guessed id is simply not in it. The connection needs INSTANT_TYPE, since `now` is bound as a
 * timestamptz.
 */
export function daysByClub<F>(sql: FragmentSql<F>, viewer: string, now: ServerNow): F {
  checkViewer(viewer);
  checkNow(now);
  return bound(sql)`
    SELECT c.id AS club_id,
           (${oneDay(sql, now, "open")}) AS open_day,
           (${oneDay(sql, now, "collecting")}) AS next_day
      FROM app.clubs c
     WHERE c.suspended_at IS NULL
       AND EXISTS (SELECT FROM app.memberships m JOIN app.users u ON u.id = m.user_id
                    WHERE m.club_id = c.id AND m.user_id = ${viewer}::pg_catalog.text
                      AND m.state = 'active' AND u.state = 'active')`;
}

/** The most recent days Home links to (the contract's `recent_days`). */
export const RECENT_DAYS = 6;

/**
 * Each club of `viewer`'s with its recent days at `now`, as a subquery of rows `(club_id, recent_days)`,
 * `recent_days` a jsonb array for `recentDay` to read, newest first: Home's secondary links (the contract's
 * DayLink; spec 08, 18; T5, T9, T15). A recent day is a day of the club that has closed (`close_at <= now`),
 * that `placeable`'s three conditions keep, and that holds a drop the viewer may see the media of
 * (`readableDrops`, the read predicate itself), the newest by `reveal_at`, then id byte by byte, at most
 * `RECENT_DAYS`. The statement orders them by `close_at` instead, newest first: the same order, since a
 * club's scheduled days never overlap, and the one the index `occurrences_upcoming` holds, which Postgres may
 * read backward rather than sort (docs/plans/api-b2-home.md section 6 has the plan it chose). So a withdrawn,
 * removed or held drop, a cancelled or suspended day, a drop whose audience the viewer's active interval
 * isn't in (a late joiner's, a rejoined member's old ones), an author's deletion and a block each keep a day
 * out when nothing else of it is readable, and nothing says why (T14, T15).
 *
 * Each day's cover is D08's choice among its photos the viewer may see the media of: the star's photo that is
 * the star's highlight, then the star's earliest photo, then the earliest photo, earliest by `submitted_at`,
 * then id byte by byte (the feed's order, T35); never a video, so a day with only videos has none. Its bytes come from the
 * media route (T12).
 *
 * It lists the clubs `daysByClub` lists, by the same three conditions, so a caller joins it on its own club
 * id with no check of its own. The connection needs INSTANT_TYPE, since `now` is bound as a timestamptz.
 */
export function recentDays<F>(sql: FragmentSql<F>, viewer: string, now: ServerNow): F {
  checkViewer(viewer);
  checkNow(now);
  return bound(sql)`
    SELECT c.id AS club_id,
           (SELECT COALESCE(pg_catalog.jsonb_agg(r.day ORDER BY r.reveal_at DESC, r.id COLLATE "C"), '[]'::pg_catalog.jsonb)
              FROM (SELECT o.id, o.reveal_at,
                           ${dayObject(sql)} || pg_catalog.jsonb_build_object('cover_drop_id', (
                             SELECT x.id
                               FROM app.drops x
                               LEFT JOIN app.highlights hl ON hl.drop_id = x.id
                              WHERE x.occurrence_id = o.id
                                AND x.media_class = 'photo'
                                AND x.id IN (${readableDrops(sql, viewer, now, "media")})
                              ORDER BY (x.author_interval_id = o.star_interval_id AND hl.drop_id IS NOT NULL) DESC,
                                       x.author_interval_id = o.star_interval_id DESC,
                                       x.submitted_at, x.id COLLATE "C"
                              LIMIT 1)) AS day
                      FROM app.occurrences o
                      JOIN app.memberships s ON s.interval_id = o.star_interval_id
                      JOIN app.users su ON su.id = s.user_id
                     WHERE o.club_id = c.id
                       AND ${placeableDay(sql)}
                       AND o.close_at <= ${now}::pg_catalog.timestamptz
                       AND EXISTS (SELECT FROM app.drops x
                                    WHERE x.occurrence_id = o.id
                                      AND x.id IN (${readableDrops(sql, viewer, now, "media")}))
                     ORDER BY o.close_at DESC, o.id COLLATE "C"
                     LIMIT ${String(RECENT_DAYS)}::pg_catalog.int4) r) AS recent_days
      FROM app.clubs c
     WHERE c.suspended_at IS NULL
       AND EXISTS (SELECT FROM app.memberships m JOIN app.users u ON u.id = m.user_id
                    WHERE m.club_id = c.id AND m.user_id = ${viewer}::pg_catalog.text
                      AND m.state = 'active' AND u.state = 'active')`;
}

function shape(): Error {
  return new Error("authorization: a day came back in a shape the schema doesn't allow");
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw shape();
  return value;
}

/** A timestamptz as jsonb writes it (ISO 8601 with the session's offset), read whole. */
function instant(value: unknown): Temporal.Instant {
  if (typeof value !== "string") throw shape();
  let read: Temporal.Instant;
  try {
    read = Temporal.Instant.from(value);
  } catch {
    throw shape();
  }
  return wholeMicroseconds(read, "a day's instant");
}

const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/**
 * The day `daysByClub` gave in its `open_day` (phase `open`) or `next_day` (phase `collecting`)
 * column, or null when it gave none. Anything outside the shape throws, so a surprise refuses
 * rather than shows.
 */
export function chosenDay(value: unknown, phase: ChosenPhase): ChosenDay | null {
  if (value === null) return null;
  return { ...placedDay(value), phase };
}

/**
 * One day of the array `recentDays` gave in its `recent_days` column, as a past day with its cover. Anything
 * outside the shape throws, so a surprise refuses rather than shows.
 */
export function recentDay(value: unknown): RecentDay {
  const day = placedDay(value);
  const row = value as Record<string, unknown>;
  const cover = row["cover_drop_id"];
  return { day: { ...day, phase: "past" }, coverDropId: cover === null ? null : text(cover) };
}

/** A day's object, as `dayObject` builds it, without its phase. */
function placedDay(value: unknown): Omit<PlacedDay, "phase"> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw shape();
  const row = value as Record<string, unknown>;
  const localDate = text(row["local_date"]);
  if (!DATE.test(localDate)) throw shape();
  const avatar = row["star_avatar_version"] === null ? null : text(row["star_avatar_version"]);
  const revealAt = instant(row["reveal_at"]);
  const closeAt = instant(row["close_at"]);
  if (!before(revealAt, closeAt)) throw shape();
  return {
    id: text(row["id"]),
    clubId: text(row["club_id"]),
    star: { membershipId: text(row["star_membership_id"]), displayName: text(row["star_name"]), avatarVersion: avatar },
    localDate,
    revealAt,
    closeAt,
  };
}
