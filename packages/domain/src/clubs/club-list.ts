// The caller's clubs and the invitations they have accepted (spec 04, 05; T7, T14, T33; FQ16, FQ75; the
// contract's ClubList, book p32). Both lists come from ONE statement, so they are one snapshot: an
// invitation that turns into a membership while the list is read is in the clubs or in the invitations,
// never in neither. They are read through the account's own rows only: a club is listed for an *active*
// interval of the caller's (a club they left is never listed), an invitation for the link the caller is
// bound to. Nothing else of a club comes out: no roster, no approval, no day (T33; `open_day` and
// `next_day`, which need Home's day logic, come in B2).
//
// An invitation's inviter is the candidate's proposer, by FQ75's rule: the interval's person's name
// while the interval is active, the name it ended with after (a deleted account may have none, and the
// invitation then has no name to show and is left out; B1 settles what the app shows).

import type { QuerySql } from "../authorization/read-sql.ts";
import { clubState, type ClubState } from "./club-state.ts";
import { invitationState, type InvitationState } from "./invitation-state.ts";

/** The contract's bound on each list. A person's clubs are capped in B1; no row can pass this in B0. */
export const LIST_LIMIT = 50;

export interface ClubRow {
  readonly id: string;
  readonly name: string;
  readonly timezone: string;
  /** The caller's own interval in it. */
  readonly membershipId: string;
  readonly state: ClubState;
  /** Active members, the caller included. */
  readonly memberCount: number;
}

export interface InvitationRow {
  readonly id: string;
  readonly clubName: string;
  readonly inviterName: string;
  readonly state: InvitationState;
}

export interface ClubListing {
  /** Oldest membership first. */
  readonly clubs: readonly ClubRow[];
  /** Newest invitation first. */
  readonly invitations: readonly InvitationRow[];
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly string[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw shape();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw shape();
  return value;
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw shape();
  return value;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw shape();
  return value;
}

function shape(): Error {
  return new Error("clubs: the list came back in a shape the schema doesn't allow");
}

function club(value: unknown): ClubRow {
  const row = record(value);
  const count = row["member_count"];
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1) throw shape();
  return {
    id: text(row["id"]),
    name: text(row["name"]),
    timezone: text(row["timezone"]),
    membershipId: text(row["membership_id"]),
    state: clubState({
      suspended: flag(row["suspended"]),
      activated: flag(row["activated"]),
      activeMembers: count,
    }),
    memberCount: count,
  };
}

function invitation(value: unknown): InvitationRow {
  const row = record(value);
  return {
    id: text(row["id"]),
    clubName: text(row["club_name"]),
    inviterName: text(row["inviter_name"]),
    state: invitationState({
      candidateEnded: flag(row["candidate_ended"]),
      acceptedOnOpenRevision: flag(row["accepted_on_open_revision"]),
    }),
  };
}

/** The clubs and invitations of the account `userId`, in `sql`'s transaction or pool. */
export async function listClubs(sql: QuerySql, userId: string): Promise<ClubListing> {
  if (typeof userId !== "string" || !ID.test(userId)) throw new TypeError("clubs: the caller is an account id");
  const rows = await bound(sql)`
    SELECT
      (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'id', k.id, 'name', k.name, 'timezone', k.timezone, 'membership_id', k.interval_id,
                'suspended', k.suspended_at IS NOT NULL, 'activated', k.activated_at IS NOT NULL,
                'member_count', k.member_count) ORDER BY k.joined_at, k.interval_id), '[]'::pg_catalog.jsonb)
         FROM (SELECT c.id, c.name, c.timezone, c.suspended_at, c.activated_at, m.interval_id, m.joined_at,
                      (SELECT pg_catalog.count(*) FROM app.memberships a
                        WHERE a.club_id = c.id AND a.state = 'active') AS member_count
                 FROM app.memberships m
                 JOIN app.clubs c ON c.id = m.club_id
                WHERE m.user_id = ${userId} AND m.state = 'active'
                ORDER BY m.joined_at, m.interval_id
                LIMIT ${String(LIST_LIMIT)}::pg_catalog.int4) k) AS clubs,
      (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'id', v.id, 'club_name', v.club_name, 'inviter_name', v.inviter_name,
                'candidate_ended', v.candidate_ended, 'accepted_on_open_revision', v.accepted_on_open_revision)
                ORDER BY v.created_at DESC, v.id), '[]'::pg_catalog.jsonb)
         FROM (SELECT i.id, i.created_at, c.name AS club_name,
                      CASE WHEN pm.state = 'active' THEN pu.display_name ELSE pm.ended_display_name END AS inviter_name,
                      cd.state = 'ended' AS candidate_ended,
                      EXISTS (SELECT FROM app.roster_revisions r
                                JOIN app.roster_revision_candidates rc
                                  ON rc.revision_id = r.id AND rc.club_id = r.club_id
                               WHERE r.club_id = cd.club_id AND r.state = 'open'
                                 AND rc.candidate_id = cd.id AND rc.accepted_invitation_id = i.id) AS accepted_on_open_revision
                 FROM app.invitations i
                 JOIN app.candidates cd ON cd.id = i.candidate_id
                 JOIN app.clubs c ON c.id = cd.club_id
                 JOIN app.memberships pm ON pm.interval_id = cd.proposed_by_interval_id
                 JOIN app.users pu ON pu.id = pm.user_id
                WHERE i.bound_user_id = ${userId} AND cd.state <> 'joined'
                  AND CASE WHEN pm.state = 'active' THEN pu.display_name ELSE pm.ended_display_name END IS NOT NULL
                ORDER BY i.created_at DESC, i.id
                LIMIT ${String(LIST_LIMIT)}::pg_catalog.int4) v) AS invitations`;
  const row = rows[0];
  if (row === undefined) throw shape();
  return {
    clubs: list(row["clubs"]).map(club),
    invitations: list(row["invitations"]).map(invitation),
  };
}
