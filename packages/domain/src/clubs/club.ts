// One club's information for one of its members (the contract's `getClub` and `ClubDetail`; spec 03, 04;
// book p24; T9, T14, T33; FQ16, FQ80): the club as the list gives it (./club-list.ts: its state, its
// members' number and Home's two days at `now`), the roster's version, whether another person can be
// proposed, and the open roster revision's id when there is one.
//
// Who: the authorization module's `activeMemberships`, the one rule for something of a club that isn't a
// drop: the account is active, it has an active interval there, and the club isn't suspended (FQ80's
// default: nothing of a suspended club). Everyone else gets null, which the route answers with the
// neutral not-found, the same as an id nobody has (T14).
//
// `roster_version` counts neither approvals nor acceptances (T33; db/migrations/0003_people_and_clubs.sql).
// `can_propose` is false once the active members and the candidates still open make six (A01, T6): it says
// that the roster is full, never who has accepted. The contract's other reason for false, a club that
// can't take proposals, is today only a suspended club, which nobody reads (so `suspended` in the row below
// is always false, kept for the list's parser); `proposeRoster` must refuse exactly where this is false. It is one statement,
// so one snapshot.

import { daysByClub } from "../authorization/days.ts";
import { activeMemberships } from "../authorization/member.ts";
import type { QuerySql } from "../authorization/read-sql.ts";
import type { ServerNow } from "../time/clock.ts";
import { clubRow, type ClubRow } from "./club-list.ts";

/** A club holds at most six people, its candidates still open counted (A01, T6). */
export const CLUB_SIZE = 6;

export interface ClubDetail {
  readonly club: ClubRow;
  /** What a proposal sends as `expected_roster_version`. */
  readonly rosterVersion: number;
  readonly canPropose: boolean;
  /** The open roster revision, or null. */
  readonly openRevisionId: string | null;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | R)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function shape(): Error {
  return new Error("clubs: the club came back in a shape the schema doesn't allow");
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw shape();
  return value;
}

/** The information of `clubId` as the account `userId` gets it at `now`, or null (T14). */
export async function readClub(
  sql: QuerySql,
  userId: string,
  clubId: string,
  now: ServerNow,
): Promise<ClubDetail | null> {
  // An id that can't be one names no club, as one nobody has.
  if (typeof clubId !== "string" || !ID.test(clubId)) return null;
  const rows = await bound(sql)`
    SELECT pg_catalog.jsonb_build_object(
             'id', c.id, 'name', c.name, 'timezone', c.timezone, 'membership_id', am.interval_id,
             'suspended', c.suspended_at IS NOT NULL, 'activated', c.activated_at IS NOT NULL,
             'member_count', (SELECT pg_catalog.count(*) FROM app.memberships a
                               WHERE a.club_id = c.id AND a.state = 'active'),
             'open_day', h.open_day, 'next_day', h.next_day) AS club,
           c.roster_version,
           (SELECT pg_catalog.count(*)::pg_catalog.int4 FROM app.candidates k
             WHERE k.club_id = c.id AND k.state = 'open') AS open_candidates,
           (SELECT r.id FROM app.roster_revisions r WHERE r.club_id = c.id AND r.state = 'open') AS open_revision_id
      FROM app.clubs c
      JOIN (${activeMemberships(sql, userId)}) am ON am.club_id = c.id
      LEFT JOIN (${daysByClub(sql, userId, now)}) h ON h.club_id = c.id
     WHERE c.id = ${clubId}::pg_catalog.text`;
  const [row] = rows;
  if (row === undefined) return null;
  const club = clubRow(row["club"]);
  if (club.id !== clubId) throw shape();
  const open = row["open_revision_id"];
  if (open !== null && typeof open !== "string") throw shape();
  return {
    club,
    rosterVersion: count(row["roster_version"]),
    canPropose: club.memberCount + count(row["open_candidates"]) < CLUB_SIZE,
    openRevisionId: open,
  };
}
