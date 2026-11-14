/// <reference lib="esnext.temporal" />
// The read predicate (./read.ts) for the database (TECH-DESIGN section 5: "the SQL fragments that
// filter reads"). These two are all a route, a job or a command asks:
// - A list (a day's manifest, Home, Memories, search, favourites, a widget's candidates) filters
//   by `readableDrops`, so its pages hold only what the viewer may read and a cursor can't step
//   over a hidden row into view (T14, spec 32). A serializer that needs each listed drop's answer
//   for more than the caption takes it from the module too, as
//   `` x.id IN (${readableDrops(sql, viewer, now, "media")}) AS media_readable ``, never by
//   comparing reveal_at with a time of its own.
// - One drop, such as the media route's, asks `mayReadDrop`: the TypeScript policy on the facts
//   loaded for it. A command asks it after taking its locks (TECH-DESIGN section 5, step 4).
// Both answer only yes or no, the same no for a drop that doesn't exist (T14).
//
// `readableDrops` and `dropReadFacts` state the same conditions as `mayRead`, in the same order,
// each as the one value that grants, and tests/src/db/authorization.test.ts runs every role of the
// privacy matrix through both paths on the same rows. Each takes the caller's postgres.js tagged
// template, typed by its shape, so this package doesn't depend on postgres.js. The connection must
// have the time module's INSTANT_TYPE (`postgres(url, { types: { instant: INSTANT_TYPE } })`):
// both bind `now` as a timestamptz, and the facts' instants come back as Temporal.Instant, so
// without it both fail loudly, whatever drop is asked about.
//
// A drop id that isn't one of ours (a guess, a typo, a NUL) finds nothing, as a missing drop does
// (T14): the statement binds a null in its place, so Postgres never sees it. The viewer is the
// session's account id, so one that isn't an id at all is the caller's mistake, and throws.

import type { ServerNow } from "../time/clock.ts";
import {
  checkRead,
  mayRead,
  type AccountState,
  type DayStatus,
  type DropReadFacts,
  type DropState,
  type MembershipState,
  type ReadWhat,
} from "./read.ts";

// The values are typed `never` so that postgres.js's own tagged template, whose values are its
// parameter types, fits; each function below binds only strings, nulls, booleans and Temporal.Instants,
// which INSTANT_TYPE's connection takes, and fragments made by the same tagged template, through
// `bound`.

/** postgres.js's tagged template: awaited it runs, and inside another query it is a fragment. */
export type FragmentSql<F> = (template: TemplateStringsArray, ...values: readonly never[]) => F;

/** One query in the caller's transaction or pool, as postgres.js runs a tagged template. */
export type QuerySql = (
  template: TemplateStringsArray,
  ...values: readonly never[]
) => PromiseLike<readonly Record<string, unknown>[]>;

type Bound<R> = (
  template: TemplateStringsArray,
  ...values: readonly (string | null | boolean | Temporal.Instant | R)[]
) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Throws unless `viewer` is an account id: the session's, so anything else is the caller's mistake. */
export function checkViewer(viewer: unknown): void {
  if (typeof viewer !== "string" || !ID.test(viewer)) throw new TypeError("authorization: the viewer is an account id");
}

/**
 * The read predicate's two conditions on a day's star (FQ63, T27): the star's interval hadn't ended,
 * and the star hadn't asked to delete their account, before the day's reveal, so a day whose star
 * left before it opened is held and never opens, whatever the worker that ends the interval has done
 * (T1). `readableDrops` and Home's day choice (./days.ts) both put it in their statements, so the two
 * can't drift; it names their aliases: `o` the day, `s` the star's interval, `su` the star's account.
 */
export function starKeepsDay<F>(sql: FragmentSql<F>): F {
  return bound(sql)`(s.left_at IS NULL OR s.left_at >= o.reveal_at)
       AND (su.deletion_requested_at IS NULL OR su.deletion_requested_at >= o.reveal_at)`;
}

/**
 * The ids of the drops `viewer` may see `what` of at `now`, as a subquery to filter by:
 * `` sql`SELECT ... FROM app.drops x WHERE x.occurrence_id = ${day} AND x.id IN (${readableDrops(sql, viewer, now, "caption")})` ``.
 * It names its own tables, so it never depends on the caller's aliases.
 */
export function readableDrops<F>(sql: FragmentSql<F>, viewer: string, now: ServerNow, what: ReadWhat): F {
  checkViewer(viewer);
  checkRead(what, now);
  const beyondCaption = what !== "caption";
  return bound(sql)`
    SELECT d.id
      FROM app.drops d
      JOIN app.drop_audience a ON a.drop_id = d.id
      JOIN app.memberships m ON m.interval_id = a.interval_id
      JOIN app.users u ON u.id = m.user_id
      JOIN app.occurrences o ON o.id = d.occurrence_id
      JOIN app.clubs c ON c.id = d.club_id
      JOIN app.memberships s ON s.interval_id = o.star_interval_id
      JOIN app.users su ON su.id = s.user_id
      JOIN app.memberships am ON am.interval_id = d.author_interval_id
      JOIN app.users au ON au.id = am.user_id
     WHERE m.user_id = ${viewer}::pg_catalog.text
       AND u.state = 'active'
       AND m.state = 'active'
       AND d.state = 'active'
       AND o.status = 'scheduled'
       AND c.suspended_at IS NULL
       AND ${starKeepsDay(sql)}
       AND au.state = 'active'
       AND NOT EXISTS (SELECT FROM app.blocks b
                        WHERE (b.blocker_user_id = m.user_id AND b.blocked_user_id = am.user_id)
                           OR (b.blocker_user_id = am.user_id AND b.blocked_user_id = m.user_id))
       AND (NOT ${beyondCaption}::pg_catalog.bool OR o.reveal_at <= ${now}::pg_catalog.timestamptz)`;
}

const ACCOUNT: readonly AccountState[] = ["active", "deleting", "deleted"];
const MEMBERSHIP: readonly MembershipState[] = ["active", "left", "left_by_block", "account_deleted"];
const DROP: readonly DropState[] = ["active", "held", "withdrawn", "removed"];
const DAY: readonly DayStatus[] = ["scheduled", "suspended", "cancelled"];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`authorization: ${what} came back as ${String(value)}`);
}

function orNull<T>(value: unknown, read: (v: unknown) => T): T | null {
  return value === null ? null : read(value);
}

function instant(value: unknown, what: string): Temporal.Instant {
  if (value instanceof Temporal.Instant) return value;
  throw new Error(`authorization: ${what} came back as ${typeof value}, not a Temporal.Instant: use INSTANT_TYPE`);
}

/**
 * Whether `viewer` may see `what` of `drop` at `now`: `mayRead` on the facts loaded for it, and
 * false for a drop that doesn't exist (T14).
 */
export async function mayReadDrop(
  sql: QuerySql,
  viewer: string,
  drop: string,
  what: ReadWhat,
  now: ServerNow,
): Promise<boolean> {
  checkViewer(viewer);
  checkRead(what, now);
  return mayRead(await dropReadFacts(sql, viewer, drop, now), what, now);
}

/**
 * The facts `mayRead` needs about `viewer` and one drop, or null when no drop has that id, in one
 * statement, so they all come from one snapshot. Every row that must exist is joined, so a
 * missing one gives null too; only the viewer's account, their interval in the audience and a
 * block may be absent. The statement always returns one row, which carries `now` back, so a
 * connection without INSTANT_TYPE fails here whatever the drop id: one that exists, one that
 * doesn't, or one that isn't an id at all, which is bound as a null and so finds nothing. It
 * takes no lock, so a command keeps its own fixed order (TECH-DESIGN section 5). Any value outside
 * the schema's throws, so a surprise refuses rather than grants.
 */
async function dropReadFacts(
  sql: QuerySql,
  viewer: string,
  drop: string,
  now: ServerNow,
): Promise<DropReadFacts | null> {
  checkViewer(viewer);
  if (typeof drop !== "string") throw new TypeError("authorization: the drop is an id");
  const id = ID.test(drop) ? drop : null;
  const rows = await bound(sql)`
    SELECT ${now}::pg_catalog.timestamptz AS now, f.*
      FROM (VALUES (true)) AS one (x)
      LEFT JOIN LATERAL (
        SELECT (SELECT u.state FROM app.users u WHERE u.id = ${viewer}::pg_catalog.text) AS viewer_account,
               (SELECT m.state
                  FROM app.drop_audience a JOIN app.memberships m ON m.interval_id = a.interval_id
                 WHERE a.drop_id = d.id AND m.user_id = ${viewer}::pg_catalog.text
                 ORDER BY m.state = 'active' DESC, m.interval_id
                 LIMIT 1) AS viewer_interval,
               d.state AS drop_state,
               o.status AS day_status,
               c.suspended_at AS club_suspended_at,
               o.reveal_at,
               s.left_at AS star_left_at,
               su.deletion_requested_at AS star_deletion_requested_at,
               au.state AS author_account,
               EXISTS (SELECT FROM app.blocks b
                        WHERE (b.blocker_user_id = ${viewer}::pg_catalog.text AND b.blocked_user_id = am.user_id)
                           OR (b.blocker_user_id = am.user_id AND b.blocked_user_id = ${viewer}::pg_catalog.text)) AS blocked
          FROM app.drops d
          JOIN app.occurrences o ON o.id = d.occurrence_id
          JOIN app.clubs c ON c.id = d.club_id
          JOIN app.memberships s ON s.interval_id = o.star_interval_id
          JOIN app.users su ON su.id = s.user_id
          JOIN app.memberships am ON am.interval_id = d.author_interval_id
          JOIN app.users au ON au.id = am.user_id
         WHERE d.id = ${id}::pg_catalog.text
      ) AS f ON true`;
  const row = rows[0];
  if (row === undefined || !instant(row["now"], "now").equals(now))
    throw new Error("authorization: the facts came back without the server's time");
  if (row["drop_state"] === null) return null;
  if (typeof row["blocked"] !== "boolean")
    throw new Error("authorization: the block check came back without an answer");
  return {
    viewerAccount: orNull(row["viewer_account"], (v) => oneOf(v, ACCOUNT, "the viewer's account")),
    viewerInterval: orNull(row["viewer_interval"], (v) => oneOf(v, MEMBERSHIP, "the viewer's interval")),
    drop: oneOf(row["drop_state"], DROP, "the drop's state"),
    day: oneOf(row["day_status"], DAY, "the day's status"),
    clubSuspendedAt: orNull(row["club_suspended_at"], (v) => instant(v, "the club's suspension")),
    revealAt: instant(row["reveal_at"], "the day's reveal_at"),
    starLeftAt: orNull(row["star_left_at"], (v) => instant(v, "the star's left_at")),
    starDeletionRequestedAt: orNull(row["star_deletion_requested_at"], (v) =>
      instant(v, "the star's deletion request"),
    ),
    authorAccount: oneOf(row["author_account"], ACCOUNT, "the author's account"),
    blocked: row["blocked"],
  };
}
