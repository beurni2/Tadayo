/// <reference lib="esnext.temporal" />
// Who may add to a day, and what the day is to them at the server's time (spec 06, 07, 11, 32; T1, T3, T4,
// T9, T14, T17; FQ50, FQ63): the authorization module's rule for every command that targets a day, a
// reservation now (packages/domain/src/drops/reserve.ts), the commit and a highlight later (B3, B4). A handler
// never states it again (T9).
//
// - Nothing for anyone but a member: the caller's account is active, they have an active interval in the
//   day's club, the club isn't suspended (spec 22), and the day is scheduled, neither suspended nor cancelled
//   (T9). Anything else, an id nobody has included, is `not_found`, the neutral not-found (T14). These are
//   `activeMemberships`' three conditions (./member.ts) and the day's own status, as Home's day choice
//   states them (./days.ts). A paused club's days take additions until they open (FQ50).
// - A held day, one whose star's interval ended, or whose star asked to delete their account, before its
//   reveal, never opens (FQ63, T27): `held`, the read predicate's own two conditions (./read.ts'
//   `notBeforeReveal`), whatever the time. The person the day is for has gone (MEMBERSHIP_CHANGED).
// - From the day's reveal on, its drops are frozen (T3, D02): `closed`, with the day as the contract's
//   Occurrence at that instant (`open` until its close, `past` after).
// - Before it, `collecting`: the caller's interval, whether it is the day's star interval (the role, T17,
//   never a flag from the app), and the day as the contract's Occurrence.
//
// A refusal offers the same person's next day for the person to confirm (T4): `nextTargetOf`, Home's own
// rule for a member's next day (./days.ts `chooseNextDayOf`) among the star's days that reveal after the
// target, so a full allowance never offers the same day again, and a missed cutoff never one that has also
// opened.
//
// It reads no clock: `now` is the caller's sample, taken after its locks (T1, T3). The loaders take no lock,
// so a command keeps its own fixed order (TECH-DESIGN section 5). Each condition grants only on the one
// value that grants, so a fact that is missing or unknown denies.

import type { ServerNow } from "../time/clock.ts";
import { chooseNextDayOf, placeable, placed, type ChosenDay, type DayFacts, type PlacedDay } from "./days.ts";
import { checkNow, notBeforeReveal, type AccountState, type DayStatus, type MembershipState } from "./read.ts";
import { checkViewer, type QuerySql } from "./read-sql.ts";

/** What the rule reads about one caller and one day. */
export interface AddTargetFacts {
  /** The caller's account, or null when no account has the caller's id. */
  readonly viewerAccount: AccountState | null;
  /** The caller's active interval in the day's club, or null when they have none. */
  readonly viewerInterval: string | null;
  readonly clubSuspendedAt: Temporal.Instant | null;
  readonly day: DayFacts;
}

/** What the day is to the caller at `now`. */
export type AddTarget =
  | { readonly kind: "not_found" }
  | { readonly kind: "held" }
  | {
      readonly kind: "closed";
      /** The day at `now`; null for a day with no star to name, which no answer sends nameless. */
      readonly target: PlacedDay | null;
    }
  | {
      readonly kind: "collecting";
      readonly target: ChosenDay & { readonly phase: "collecting" };
      /** The caller's active interval in the day's club. */
      readonly interval: string;
      /** Whether that interval is the day's star interval (T17). */
      readonly isStar: boolean;
    };

function before(a: Temporal.Instant, b: Temporal.Instant): boolean {
  return Temporal.Instant.compare(a, b) < 0;
}

/** The rule above. `facts` null is a day nobody has. */
export function addTargetOutcome(facts: AddTargetFacts | null, now: ServerNow): AddTarget {
  checkNow(now);
  if (facts === null) return { kind: "not_found" };
  const { day } = facts;
  if (!(
    facts.viewerAccount === "active" &&
    typeof facts.viewerInterval === "string" &&
    facts.clubSuspendedAt === null &&
    day.status === "scheduled"
  )) {
    return { kind: "not_found" };
  }
  if (!(notBeforeReveal(day.starLeftAt, day.revealAt) && notBeforeReveal(day.starDeletionRequestedAt, day.revealAt))) {
    return { kind: "held" };
  }
  if (!before(now, day.revealAt)) {
    return { kind: "closed", target: placeable(day) ? placed(day, before(now, day.closeAt) ? "open" : "past") : null };
  }
  // Collecting, and not held: placeable but for a star with no name, which only an ended interval can lack.
  if (!placeable(day)) return { kind: "held" };
  return {
    kind: "collecting",
    target: { ...placed(day, "collecting"), phase: "collecting" },
    interval: facts.viewerInterval,
    isStar: facts.viewerInterval === day.starInterval,
  };
}

/**
 * The same person's next day after the target, for a refusal to offer (T4): the earliest of `later`, the
 * star's other days, that Home would offer that member as next (`chooseNextDayOf`: scheduled, not held, a
 * star to name, its reveal after `now`) and that reveals after the target too; null when there is none.
 */
export function nextTargetOf(
  facts: AddTargetFacts,
  later: readonly DayFacts[],
  now: ServerNow,
): (ChosenDay & { readonly phase: "collecting" }) | null {
  checkNow(now);
  const { day } = facts;
  const next = chooseNextDayOf(
    {
      viewerAccount: facts.viewerAccount,
      viewerInterval: facts.viewerInterval === null ? null : "active",
      clubSuspendedAt: facts.clubSuspendedAt,
      days: later.filter((one) => one.clubId === day.clubId && before(day.revealAt, one.revealAt)),
    },
    day.starInterval,
    now,
  );
  return next === null ? null : { ...next, phase: "collecting" };
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | null | Temporal.Instant | R)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT: readonly AccountState[] = ["active", "deleting", "deleted"];
const MEMBERSHIP: readonly MembershipState[] = ["active", "left", "left_by_block", "account_deleted"];
const STATUS: readonly DayStatus[] = ["scheduled", "suspended", "cancelled"];

function shape(what: string): Error {
  return new Error(`authorization: ${what} came back in a shape the rule doesn't know`);
}

function text(value: unknown, what: string): string {
  if (typeof value !== "string") throw shape(what);
  return value;
}

function instant(value: unknown, what: string): Temporal.Instant {
  if (!(value instanceof Temporal.Instant)) throw shape(what);
  return value;
}

function orNull<T>(value: unknown, read: (value: unknown) => T): T | null {
  return value === null ? null : read(value);
}

function oneOf<T extends string>(value: unknown, values: readonly T[], what: string): T {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) throw shape(what);
  return value as T;
}

/** A day's columns as `dayFactsOf` reads them, on the day `o`, its star's interval `s` and account `su`. */
function dayColumns<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): R {
  return bound(sql)`o.id, o.club_id, o.status, o.local_date::pg_catalog.text AS local_date, o.reveal_at, o.close_at,
         s.interval_id AS star_interval, s.state AS star_interval_state, s.left_at AS star_left_at,
         s.ended_display_name AS star_ended_name, su.state AS star_account, su.display_name AS star_name,
         su.deletion_requested_at AS star_deletion_requested_at,
         (SELECT up.content_version FROM app.uploads up
           WHERE up.id = su.avatar_upload_id AND up.state = 'ready') AS star_avatar_version`;
}

function dayFactsOf(row: Readonly<Record<string, unknown>>): DayFacts {
  const localDate = text(row["local_date"], "the day's date");
  if (!DATE.test(localDate)) throw shape("the day's date");
  const revealAt = instant(row["reveal_at"], "the day's reveal_at");
  const closeAt = instant(row["close_at"], "the day's close_at");
  if (!before(revealAt, closeAt)) throw shape("the day's instants");
  return {
    id: text(row["id"], "the day's id"),
    clubId: text(row["club_id"], "the day's club"),
    status: oneOf(row["status"], STATUS, "the day's status"),
    localDate,
    revealAt,
    closeAt,
    starInterval: text(row["star_interval"], "the day's star"),
    starIntervalState: oneOf(row["star_interval_state"], MEMBERSHIP, "the star's interval"),
    starLeftAt: orNull(row["star_left_at"], (v) => instant(v, "the star's left_at")),
    starEndedName: orNull(row["star_ended_name"], (v) => text(v, "the star's ended name")),
    starAccount: oneOf(row["star_account"], ACCOUNT, "the star's account"),
    starName: orNull(row["star_name"], (v) => text(v, "the star's name")),
    starDeletionRequestedAt: orNull(row["star_deletion_requested_at"], (v) =>
      instant(v, "the star's deletion request"),
    ),
    starAvatarVersion: orNull(row["star_avatar_version"], (v) => text(v, "the star's avatar version")),
  };
}

/**
 * The facts `addTargetOutcome` needs about `userId` and the day `occurrenceId`, in one statement, or null when
 * no day has that id. An id that can't be one is bound as a null, so Postgres never sees it, and finds
 * nothing, as a missing day does (T14). The connection needs INSTANT_TYPE.
 */
export async function loadAddTarget(
  sql: QuerySql,
  userId: string,
  occurrenceId: string,
): Promise<AddTargetFacts | null> {
  checkViewer(userId);
  if (typeof occurrenceId !== "string") throw new TypeError("authorization: the day is an id");
  const id = ID.test(occurrenceId) ? occurrenceId : null;
  const rows = await bound(sql)`
    SELECT ${dayColumns(sql)},
           c.suspended_at AS club_suspended_at,
           (SELECT u.state FROM app.users u WHERE u.id = ${userId}::pg_catalog.text) AS viewer_account,
           (SELECT m.interval_id FROM app.memberships m
             WHERE m.club_id = o.club_id AND m.user_id = ${userId}::pg_catalog.text AND m.state = 'active') AS viewer_interval
      FROM app.occurrences o
      JOIN app.clubs c ON c.id = o.club_id
      JOIN app.memberships s ON s.interval_id = o.star_interval_id
      JOIN app.users su ON su.id = s.user_id
     WHERE o.id = ${id}::pg_catalog.text`;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    viewerAccount: orNull(row["viewer_account"], (v) => oneOf(v, ACCOUNT, "the caller's account")),
    viewerInterval: orNull(row["viewer_interval"], (v) => text(v, "the caller's interval")),
    clubSuspendedAt: orNull(row["club_suspended_at"], (v) => instant(v, "the club's suspension")),
    day: dayFactsOf(row),
  };
}

/**
 * The days of `day`'s star in its club that reveal after it, in any status, for `nextTargetOf`: a few weeks'
 * worth at most, as generation makes them (FQ115). The connection needs INSTANT_TYPE.
 */
export async function loadLaterDays(sql: QuerySql, day: DayFacts): Promise<readonly DayFacts[]> {
  const rows = await bound(sql)`
    SELECT ${dayColumns(sql)}
      FROM app.occurrences o
      JOIN app.memberships s ON s.interval_id = o.star_interval_id
      JOIN app.users su ON su.id = s.user_id
     WHERE o.club_id = ${day.clubId}::pg_catalog.text
       AND o.star_interval_id = ${day.starInterval}::pg_catalog.text
       AND o.reveal_at > ${day.revealAt}::pg_catalog.timestamptz
     ORDER BY o.reveal_at, o.id COLLATE "C"`;
  return rows.map(dayFactsOf);
}
