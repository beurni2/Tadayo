/// <reference lib="esnext.temporal" />
// What the roster tests share (docs/plans/api-b1-clubs.md, section 3): each command as its route runs
// it, and the rows of the steps no command makes yet, a candidate's acceptance and a member's decision,
// which are PR 3's (`acceptInvitation`, `approveRoster`, `declineRoster`).
//
// A refused request throws `Refused`, which the route's transaction rolls back, so a request here is a
// savepoint inside the test's own transaction: a refusal leaves exactly what the route's would.

import { randomUUID } from "node:crypto";
import { invitationLinkBody, rosterRevisionBody } from "@tadayo/api";
import {
  createInvitation,
  proposeRoster,
  readRevision,
  Refused,
  revokeInvitation,
  type Json,
  type MadeInvitation,
  type ServerNow,
} from "@tadayo/domain";
import type { FakeClock } from "@tadayo/domain/testing";
import type { Tx, WorldTx } from "./harness.ts";
import { newUser } from "./world.ts";

export const plain = (tx: WorldTx) => tx as unknown as Tx;

/** What a refused request says, its code and its facts. Fails when the request wasn't refused. */
export async function refusal(done: Promise<unknown>): Promise<{ code: string; facts: object }> {
  try {
    await done;
  } catch (error) {
    if (error instanceof Refused) return { code: error.code, facts: error.facts };
    throw error;
  }
  throw new Error("the request wasn't refused");
}

export interface PersonBody {
  membership_id: string;
  display_name: string;
  avatar_version?: string;
}

export interface CandidateBody {
  id: string;
  name: string;
  proposed_by: PersonBody;
  invitation?: { id: string; state: string; expires_at: string };
}

/** The contract's RosterRevision, as the route serializes it. */
export interface RevisionBody {
  id: string;
  version: number;
  club: { id: string; name: string; timezone: string; my_membership_id: string };
  state: string;
  proposed_by: PersonBody;
  members: PersonBody[];
  candidates: CandidateBody[];
  my_decision: string;
  superseded_by?: string;
}

export interface Proposal {
  key?: string;
  expected?: number;
}

/** The club's roster version now: what a member who has just read the club sends. */
export async function rosterVersion(tx: WorldTx, club: string): Promise<number> {
  const [row] = await tx<{ roster_version: number }[]>`SELECT roster_version FROM app.clubs WHERE id = ${club}`;
  if (row === undefined) throw new Error("rosterVersion: no such club");
  return row.roster_version;
}

/** `proposeRoster` as its route runs it; `expected` defaults to the club's version now. */
export async function propose(
  tx: WorldTx,
  clock: FakeClock,
  userId: string,
  clubId: string,
  labels: readonly string[],
  sent: Proposal = {},
): Promise<RevisionBody> {
  const expected = sent.expected ?? (await rosterVersion(tx, clubId));
  const answer = await tx.savepoint((sp) =>
    proposeRoster(
      sp,
      clock,
      {
        userId,
        key: sent.key ?? randomUUID(),
        clubId,
        expectedRosterVersion: expected,
        add: labels.map((label) => ({ label })),
      },
      rosterRevisionBody,
    ),
  );
  return answer as unknown as RevisionBody;
}

/** `getRosterRevision` as its route runs it: the body, or null for the neutral not-found. */
export async function read(
  tx: WorldTx,
  userId: string,
  revisionId: string,
  now: ServerNow,
): Promise<RevisionBody | null> {
  const sight = await readRevision(tx, userId, revisionId, now);
  return sight === null ? null : (rosterRevisionBody(sight) as unknown as RevisionBody);
}

/** `createInvitation` as its route runs it. */
export const link = (
  tx: WorldTx,
  clock: FakeClock,
  userId: string,
  clubId: string,
  candidateId: string,
  key: string = randomUUID(),
): Promise<MadeInvitation> =>
  tx.savepoint((sp) => createInvitation(sp, clock, { userId, key, clubId, candidateId }, invitationLinkBody));

/** `revokeInvitation` as its route runs it. */
export const revoke = (tx: WorldTx, clock: FakeClock, userId: string, invitationId: string): Promise<Json> =>
  tx.savepoint(async (sp) => {
    const revoked = await revokeInvitation(sp, clock, { userId, invitationId });
    return { invitation_id: revoked.invitationId, state: "revoked" };
  });

/**
 * A new account accepts `revisionId` as `candidateId` with the link `invitationId`, by the rows PR 3's
 * `acceptInvitation` will write: the link bound to the account, and the candidate's row on that revision
 * accepted with it. Returns the account.
 */
export async function accept(
  tx: WorldTx,
  revisionId: string,
  candidateId: string,
  invitationId: string,
  at: Date,
  name = "Someone",
): Promise<string> {
  const user = await newUser(plain(tx), name);
  await plain(tx)`UPDATE app.invitations SET bound_user_id = ${user}, bound_at = ${at} WHERE id = ${invitationId}`;
  await plain(tx)`
    UPDATE app.roster_revision_candidates SET accepted_at = ${at}, accepted_invitation_id = ${invitationId}
     WHERE revision_id = ${revisionId} AND candidate_id = ${candidateId}`;
  return user;
}

/** A member's own decision on a revision, by the row PR 3's `approveRoster` or `declineRoster` will write. */
export async function decide(
  tx: WorldTx,
  revisionId: string,
  intervalId: string,
  decision: "approved" | "declined",
  at: Date,
): Promise<void> {
  await plain(tx)`
    INSERT INTO app.roster_approvals (revision_id, interval_id, decision, implicit, decided_at)
    VALUES (${revisionId}, ${intervalId}, ${decision}, false, ${at})`;
}
