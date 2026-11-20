/// <reference lib="esnext.temporal" />
// What a link's token names, for the account that holds it (the contract's `previewInvitation` and
// `acceptInvitation`; spec 04, 32; T7, T14, T52; FQ47, FQ59, FQ66, FQ71, FQ75; docs/plans/api-b1-clubs.md,
// section 4): the link, its candidate, the club, and the exact roster the club's open revision shows that
// candidate. One statement reads it, so it is one snapshot, at the caller's `now`.
//
// The token is hashed here, in the process, as `createInvitation` hashed it: the SHA-256 of its base64url
// text. Only the hash goes to the database, so no statement, row, receipt or log holds a usable token.
//
// Nothing here decides: `invitationStanding` (./invitation-preview.ts) and `acceptInvitation`
// (./accept-invitation.ts) read the same facts, so the preview and the command can't disagree on what a
// token is.

import { createHash } from "node:crypto";
import { activeMemberships } from "../authorization/member.ts";
import type { QuerySql } from "../authorization/read-sql.ts";
import type { ServerNow } from "../time/clock.ts";

/** The contract's `InvitationToken`: base64url, 43 to 128 characters. */
const TOKEN = /^[A-Za-z0-9_-]{43,128}$/;

/** The SHA-256 of the token's text, in hex, or null for a text that can't be a token. */
export function tokenHash(token: unknown): string | null {
  if (typeof token !== "string" || !TOKEN.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export interface RosterName {
  readonly name: string;
}

export interface RosterCandidate extends RosterName {
  readonly id: string;
}

/** The club's open revision as it lists the link's candidate. */
export interface OpenRoster {
  readonly id: string;
  readonly version: number;
  /**
   * The candidate's row on it was accepted with this very link, by an account whose profile name is still
   * the label it shows: an acceptance stands only for the name the members read (FQ66).
   */
  readonly accepted: boolean;
  /**
   * Every member it lists has approved it, and its members are exactly the club's active members: what
   * `applyIfReady` asks before anyone joins (./apply-roster.ts). The acceptance is all it still needs.
   */
  readonly ready: boolean;
  /** The label it shows for the link's candidate (FQ66). */
  readonly label: string;
  /** Its members who have a name to show, in the order they joined (FQ114). */
  readonly members: readonly RosterName[];
  /** Its candidates by their position, each by the one label it shows. */
  readonly candidates: readonly RosterCandidate[];
}

export interface LinkFacts {
  readonly invitationId: string;
  readonly revoked: boolean;
  readonly replaced: boolean;
  /** The account that first accepted with it, or null. */
  readonly boundUserId: string | null;
  readonly expiresAt: Temporal.Instant;
  /** `expiresAt` isn't after the caller's `now`. */
  readonly pastExpiry: boolean;
  readonly candidateId: string;
  readonly candidateState: "open" | "joined" | "ended";
  /** The interval of the member who proposed the candidate, and so made the link. */
  readonly proposerInterval: string;
  readonly club: { readonly id: string; readonly name: string; readonly timezone: string };
  readonly suspended: boolean;
  /** Active members of the club. */
  readonly members: number;
  /** The caller's own interval in the club by the authorization module's rule, or null. */
  readonly membershipId: string | null;
  /** The inviter's name by FQ75's rule, or null when there is none to show. */
  readonly inviterName: string | null;
  /** The caller accepted with another link for another candidate of this club who is still open. */
  readonly holdsAnother: boolean;
  /** Null when the club has no open revision that lists the candidate. */
  readonly roster: OpenRoster | null;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant | R)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const HASH = /^[0-9a-f]{64}$/;

function shape(): Error {
  return new Error("clubs: an invitation came back in a shape the schema doesn't allow");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw shape();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw shape();
  return value;
}

function optionalText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw shape();
  return value;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw shape();
  return value;
}

function list(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw shape();
  return value as unknown[];
}

function instant(value: unknown): Temporal.Instant {
  if (value instanceof Temporal.Instant) return value;
  try {
    return Temporal.Instant.from(text(value));
  } catch (error) {
    if (error instanceof RangeError) throw shape();
    throw error;
  }
}

function rosterOf(value: unknown): OpenRoster | null {
  if (value === null || value === undefined) return null;
  const row = record(value);
  const version = count(row["version"]);
  if (version < 1) throw shape();
  return {
    id: text(row["id"]),
    version,
    accepted: flag(row["accepted"]),
    ready: flag(row["ready"]),
    label: text(row["label"]),
    members: list(row["members"]).map((name) => ({ name: text(name) })),
    candidates: list(row["candidates"]).map((entry) => {
      const candidate = record(entry);
      return { id: text(candidate["id"]), name: text(candidate["name"]) };
    }),
  };
}

/**
 * The facts of the link whose token hashes to `hash`, for the account `userId` at `now`, or null when no
 * link has that hash.
 */
export async function linkFacts(
  sql: QuerySql,
  userId: string,
  hash: string,
  now: ServerNow,
): Promise<LinkFacts | null> {
  if (typeof userId !== "string" || !ID.test(userId)) throw new TypeError("clubs: the caller is an account id");
  if (typeof hash !== "string" || !HASH.test(hash)) throw new TypeError("clubs: a token's hash is 64 hex digits");
  const rows = await bound(sql)`
    SELECT i.id AS invitation_id, i.revoked_at IS NOT NULL AS revoked, i.replaced_by_id IS NOT NULL AS replaced,
           i.bound_user_id, i.expires_at, i.expires_at <= ${now}::pg_catalog.timestamptz AS past_expiry,
           k.id AS candidate_id, k.state AS candidate_state, k.proposed_by_interval_id,
           c.id AS club_id, c.name AS club_name, c.timezone, c.suspended_at IS NOT NULL AS suspended,
           (SELECT pg_catalog.count(*)::pg_catalog.int4 FROM app.memberships m
             WHERE m.club_id = c.id AND m.state = 'active') AS members,
           (SELECT am.interval_id FROM (${activeMemberships(sql, userId)}) am WHERE am.club_id = c.id) AS membership_id,
           (SELECT CASE WHEN pm.state = 'active' THEN pu.display_name ELSE pm.ended_display_name END
              FROM app.memberships pm JOIN app.users pu ON pu.id = pm.user_id
             WHERE pm.interval_id = k.proposed_by_interval_id) AS inviter_name,
           EXISTS (SELECT FROM app.invitations o JOIN app.candidates ok ON ok.id = o.candidate_id
                    WHERE o.bound_user_id = ${userId}::pg_catalog.text AND ok.club_id = c.id
                      AND ok.state = 'open' AND ok.id <> k.id) AS holds_another,
           (SELECT pg_catalog.jsonb_build_object(
                     'id', r.id, 'version', r.version, 'label', rc.label,
                     'accepted', rc.accepted_invitation_id IS NOT DISTINCT FROM i.id
                                 AND EXISTS (SELECT FROM app.users bu
                                              WHERE bu.id = i.bound_user_id AND bu.display_name = rc.label),
                     'ready',
                     NOT EXISTS (SELECT FROM app.roster_revision_members rm
                                  WHERE rm.revision_id = r.id
                                    AND NOT EXISTS (SELECT FROM app.roster_approvals a
                                                     WHERE a.revision_id = rm.revision_id
                                                       AND a.interval_id = rm.interval_id AND a.decision = 'approved'))
                       AND NOT EXISTS (SELECT FROM app.memberships m
                                        WHERE m.club_id = r.club_id AND m.state = 'active'
                                          AND NOT EXISTS (SELECT FROM app.roster_revision_members rm
                                                           WHERE rm.revision_id = r.id AND rm.interval_id = m.interval_id))
                       AND NOT EXISTS (SELECT FROM app.roster_revision_members rm
                                         JOIN app.memberships m ON m.interval_id = rm.interval_id
                                        WHERE rm.revision_id = r.id AND m.state <> 'active'),
                     'members',
                     (SELECT pg_catalog.jsonb_agg(su.display_name ORDER BY s.joined_at, s.interval_id COLLATE "C")
                        FROM app.roster_revision_members rm
                        JOIN app.memberships s ON s.interval_id = rm.interval_id
                        JOIN app.users su ON su.id = s.user_id
                       WHERE rm.revision_id = r.id AND s.state = 'active' AND su.display_name IS NOT NULL),
                     'candidates',
                     (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', x.candidate_id, 'name', x.label)
                                                  ORDER BY x.position)
                        FROM app.roster_revision_candidates x WHERE x.revision_id = r.id))
              FROM app.roster_revisions r
              JOIN app.roster_revision_candidates rc ON rc.revision_id = r.id AND rc.candidate_id = k.id
             WHERE r.club_id = c.id AND r.state = 'open' AND r.roster_sealed_at IS NOT NULL) AS roster
      FROM app.invitations i
      JOIN app.candidates k ON k.id = i.candidate_id
      JOIN app.clubs c ON c.id = k.club_id
     WHERE i.token_sha256 = pg_catalog.decode(${hash}, 'hex')`;
  const [row] = rows;
  if (row === undefined) return null;
  const state = row["candidate_state"];
  if (state !== "open" && state !== "joined" && state !== "ended") throw shape();
  return {
    invitationId: text(row["invitation_id"]),
    revoked: flag(row["revoked"]),
    replaced: flag(row["replaced"]),
    boundUserId: optionalText(row["bound_user_id"]),
    expiresAt: instant(row["expires_at"]),
    pastExpiry: flag(row["past_expiry"]),
    candidateId: text(row["candidate_id"]),
    candidateState: state,
    proposerInterval: text(row["proposed_by_interval_id"]),
    club: { id: text(row["club_id"]), name: text(row["club_name"]), timezone: text(row["timezone"]) },
    suspended: flag(row["suspended"]),
    members: count(row["members"]),
    membershipId: optionalText(row["membership_id"]),
    inviterName: optionalText(row["inviter_name"]),
    holdsAnother: flag(row["holds_another"]),
    roster: rosterOf(row["roster"]),
  };
}

/**
 * Whether the link names nothing to this caller, the same as a token nobody made (T14, FQ59): revoked,
 * replaced by a newer link, used by another account, or of a club moderation has suspended (FQ80: nothing
 * of a suspended club). The preview and the command both ask this first.
 */
export function namesNothing(facts: LinkFacts, userId: string): boolean {
  return (
    facts.revoked || facts.replaced || facts.suspended || (facts.boundUserId !== null && facts.boundUserId !== userId)
  );
}
