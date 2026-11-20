/// <reference lib="esnext.temporal" />
// One roster revision for one of the members it asks (the contract's `getRosterRevision` and
// `RosterRevision`; spec 04, 32; G03-approve, G05-members, book p30; T7, T9, T14, T15, T33, T55; handoff 1;
// FQ60, FQ66, FQ71, FQ75, FQ80, FQ119): the exact roster a proposal wrote and sealed, which this only reads.
//
// Who (FQ119's default): the caller is a member of the revision's club by the authorization module's rule
// (`activeMemberships`: an active account, an active interval, a club that isn't suspended), and that
// interval is one of the revision's own members (`roster_revision_members`), the people it asks. A member
// who joined later, a former member, a candidate, a stranger and an id that can't be one all get null,
// which the route answers with the neutral not-found (T14). A candidate reads the roster through the
// invitation's preview, never here (T7).
//
// What:
// - `members`: the revision's member rows, each as the contract's Person by FQ75's rule (../schedule/
//   week.ts `person`), in the order they joined, two who joined at one instant by their interval's id,
//   byte by byte (FQ114). A member with no name to show is left out, never sent nameless, as a day's star
//   is.
// - `candidates`: its candidate rows by their position, each with the one label this revision shows
//   (FQ66) and the member who proposed that candidate.
// - `invitation`: on a candidate only when the caller's interval proposed that candidate and a link
//   exists: the candidate's latest link (`replaced_by_id IS NULL`) by id, expiry and state, never its
//   token (handoff 1). The state is read, never stored: accepted when this revision's row of the candidate
//   was accepted with it; else used when an account accepted an earlier revision with it; else revoked;
//   else expired when its expiry isn't after `now`; else live (FQ59, FQ71).
// - `myDecision`: the caller's own row of `roster_approvals`, or pending. Nothing else of that table is
//   read, no acceptance but through the proposer's `invitation`, and no count (T15, T33).
//
// A revision whose proposer, or one of whose candidates' proposers, has no name to show (an account
// deleted, whose interval kept none: T27) isn't served, since the contract's answer must name them: null.
//
// It is one statement, so one snapshot, at the caller's `now`, the clock's sample taken first.

import { activeMemberships } from "../authorization/member.ts";
import type { FragmentSql, QuerySql } from "../authorization/read-sql.ts";
import { person, personOf, type SchedulePerson } from "../schedule/week.ts";
import type { ServerNow } from "../time/clock.ts";

export type LinkState = "live" | "accepted" | "used" | "revoked" | "expired";
export type RevisionState = "open" | "applied" | "did_not_go_ahead" | "superseded";
export type RosterDecision = "pending" | "approved" | "declined";

const LINK_STATES: readonly LinkState[] = ["live", "accepted", "used", "revoked", "expired"];
const REVISION_STATES: readonly RevisionState[] = ["open", "applied", "did_not_go_ahead", "superseded"];
const DECISIONS: readonly RosterDecision[] = ["pending", "approved", "declined"];

/** The candidate's latest link, for the member who proposed the candidate. */
export interface RevisionLink {
  readonly id: string;
  readonly state: LinkState;
  readonly expiresAt: Temporal.Instant;
}

export interface RevisionCandidate {
  readonly id: string;
  /** The one name this revision shows for the candidate (FQ66). */
  readonly name: string;
  readonly proposedBy: SchedulePerson;
  /** Null for everyone but the candidate's proposer, and while no link has been made. */
  readonly invitation: RevisionLink | null;
}

export interface RevisionSight {
  readonly id: string;
  readonly version: number;
  readonly club: {
    readonly id: string;
    readonly name: string;
    readonly timezone: string;
    /** The caller's own membership interval in it. */
    readonly membershipId: string;
  };
  readonly state: RevisionState;
  readonly proposedBy: SchedulePerson;
  readonly members: readonly SchedulePerson[];
  readonly candidates: readonly RevisionCandidate[];
  readonly myDecision: RosterDecision;
  readonly supersededBy: string | null;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant | R)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function shape(): Error {
  return new Error("clubs: the roster revision came back in a shape the schema doesn't allow");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw shape();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw shape();
  return value;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw shape();
  return value as unknown[];
}

function oneOf<T extends string>(known: readonly T[], value: unknown): T {
  const found = known.find((one) => one === value);
  if (found === undefined) throw shape();
  return found;
}

function instant(value: unknown): Temporal.Instant {
  try {
    return Temporal.Instant.from(text(value));
  } catch (error) {
    if (error instanceof RangeError) throw shape();
    throw error;
  }
}

function linkOf(value: unknown): RevisionLink | null {
  if (value === null || value === undefined) return null;
  const row = record(value);
  return { id: text(row["id"]), state: oneOf(LINK_STATES, row["state"]), expiresAt: instant(row["expires_at"]) };
}

/**
 * Every revision the account `userId` may read at `now`, as a subquery of one row each (FQ119): the
 * caller filters it by `id`, or by `club_id` and `state` for a club's open one (./members.ts), and reads
 * each row with `sightOf`.
 */
export function readableRevisions<F>(sql: FragmentSql<F>, userId: string, now: ServerNow): F {
  return bound(sql)`
    SELECT r.id, r.club_id, r.version, r.state, r.superseded_by_id,
           pg_catalog.jsonb_build_object(
             'id', c.id, 'name', c.name, 'timezone', c.timezone, 'membership_id', am.interval_id) AS club,
           (SELECT ${person(sql)} FROM app.memberships s JOIN app.users su ON su.id = s.user_id
             WHERE s.interval_id = r.proposed_by_interval_id) AS proposed_by,
           (SELECT pg_catalog.jsonb_agg(${person(sql)} ORDER BY s.joined_at, s.interval_id COLLATE "C")
              FROM app.roster_revision_members rm
              JOIN app.memberships s ON s.interval_id = rm.interval_id
              JOIN app.users su ON su.id = s.user_id
             WHERE rm.revision_id = r.id) AS members,
           (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                     'id', k.id, 'name', rc.label,
                     'proposed_by',
                     (SELECT ${person(sql)} FROM app.memberships s JOIN app.users su ON su.id = s.user_id
                       WHERE s.interval_id = k.proposed_by_interval_id),
                     'invitation',
                     CASE WHEN k.proposed_by_interval_id = am.interval_id THEN
                       (SELECT pg_catalog.jsonb_build_object(
                                 'id', i.id, 'expires_at', i.expires_at,
                                 'state',
                                 CASE WHEN rc.accepted_invitation_id = i.id THEN 'accepted'
                                      WHEN i.bound_user_id IS NOT NULL THEN 'used'
                                      WHEN i.revoked_at IS NOT NULL THEN 'revoked'
                                      WHEN i.expires_at <= ${now}::pg_catalog.timestamptz THEN 'expired'
                                      ELSE 'live' END)
                          FROM app.invitations i
                         WHERE i.candidate_id = k.id AND i.replaced_by_id IS NULL)
                     END) ORDER BY rc.position)
              FROM app.roster_revision_candidates rc
              JOIN app.candidates k ON k.id = rc.candidate_id
             WHERE rc.revision_id = r.id) AS candidates,
           coalesce((SELECT a.decision FROM app.roster_approvals a
                      WHERE a.revision_id = r.id AND a.interval_id = am.interval_id), 'pending') AS my_decision
      FROM app.roster_revisions r
      JOIN app.clubs c ON c.id = r.club_id
      JOIN (${activeMemberships(sql, userId)}) am ON am.club_id = r.club_id
     WHERE r.roster_sealed_at IS NOT NULL
       AND EXISTS (SELECT FROM app.roster_revision_members mine
                    WHERE mine.revision_id = r.id AND mine.interval_id = am.interval_id)`;
}

/** The revision `revisionId` as the account `userId` gets it at `now`, or null (T14). */
export async function readRevision(
  sql: QuerySql,
  userId: string,
  revisionId: string,
  now: ServerNow,
): Promise<RevisionSight | null> {
  // An id that can't be one names no revision, as one nobody has.
  if (typeof revisionId !== "string" || !ID.test(revisionId)) return null;
  const rows = await bound(sql)`
    SELECT v.* FROM (${readableRevisions(sql, userId, now)}) v WHERE v.id = ${revisionId}::pg_catalog.text`;
  const [row] = rows;
  if (row === undefined) return null;
  const sight = sightOf(row);
  if (sight !== null && sight.id !== revisionId) throw shape();
  return sight;
}

/**
 * One row of `readableRevisions` as the contract's revision, or null when its proposer, or a candidate's
 * proposer, has no name to show (FQ75). The row may have passed through `to_jsonb`.
 */
export function sightOf(row: Readonly<Record<string, unknown>>): RevisionSight | null {
  const id = text(row["id"]);
  const version = row["version"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) throw shape();
  const club = record(row["club"]);
  const membershipId = text(club["membership_id"]);

  const proposedBy = personOf(row["proposed_by"]).person;
  if (proposedBy === null) return null;
  const members = list(row["members"]).flatMap((entry) => {
    const who = personOf(entry).person;
    return who === null ? [] : [who];
  });
  // The caller is one of them, and has a name: the gate lets nobody without one this far (FQ69).
  if (!members.some((member) => member.membershipId === membershipId)) throw shape();

  const candidates: RevisionCandidate[] = [];
  for (const entry of list(row["candidates"])) {
    const candidate = record(entry);
    const proposer = personOf(candidate["proposed_by"]);
    if (proposer.person === null) return null;
    const invitation = linkOf(candidate["invitation"]);
    // A link is only ever its candidate's proposer's to see.
    if (invitation !== null && proposer.id !== membershipId) throw shape();
    candidates.push({
      id: text(candidate["id"]),
      name: text(candidate["name"]),
      proposedBy: proposer.person,
      invitation,
    });
  }
  if (candidates.length === 0) throw shape();

  const superseded = row["superseded_by_id"];
  return {
    id,
    version,
    club: { id: text(club["id"]), name: text(club["name"]), timezone: text(club["timezone"]), membershipId },
    state: oneOf(REVISION_STATES, row["state"]),
    proposedBy,
    members,
    candidates,
    myDecision: oneOf(DECISIONS, row["my_decision"]),
    supersededBy: superseded === null || superseded === undefined ? null : text(superseded),
  };
}
