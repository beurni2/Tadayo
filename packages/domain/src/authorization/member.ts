// Who is a member of a club, for a route that reads or changes something of the club that isn't a drop
// (T9, T14; spec 07): the caller's account is active, they have an active interval there, and the club
// isn't suspended (spec 22; FQ80's default: nothing of a suspended club). A stranger, a former member, an
// account being deleted and a guessed id all get the same nothing, which a route answers with the neutral
// not-found. These are the three conditions Home's day choice (./days.ts `daysByClub`) and the club list
// state in their own statements; tests/src/db/schedule-commands.test.ts runs this one and `daysByClub` on
// the same rows.
//
// It reads no clock: a membership has no time rule of its own.

import { checkViewer, type FragmentSql, type QuerySql } from "./read-sql.ts";

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | R)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * `userId`'s memberships, as a subquery of rows `(club_id, interval_id)`: one for each club the rule lets
 * them act in, and no other. A caller joins it on its own club id with no check of its own.
 */
export function activeMemberships<F>(sql: FragmentSql<F>, userId: string): F {
  checkViewer(userId);
  return bound(sql)`
    SELECT m.club_id, m.interval_id
      FROM app.memberships m
      JOIN app.users u ON u.id = m.user_id
      JOIN app.clubs c ON c.id = m.club_id
     WHERE m.user_id = ${userId}::pg_catalog.text
       AND m.state = 'active' AND u.state = 'active' AND c.suspended_at IS NULL`;
}

/** `userId`'s membership interval in `clubId`, or null when the rule gives them nothing of that club. */
export async function activeMember(tx: QuerySql, userId: string, clubId: string): Promise<string | null> {
  checkViewer(userId);
  // An id that can't be one finds nothing, as one nobody has.
  if (typeof clubId !== "string" || !ID.test(clubId)) return null;
  const rows = await bound(tx)`
    SELECT am.interval_id FROM (${activeMemberships(tx, userId)}) am
     WHERE am.club_id = ${clubId}::pg_catalog.text`;
  const interval = rows[0]?.["interval_id"];
  return typeof interval === "string" ? interval : null;
}
