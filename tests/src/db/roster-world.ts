/// <reference lib="esnext.temporal" />
// What the roster tests share (docs/plans/api-b1-clubs.md, sections 3 and 4): each command as its route
// runs it. `accept` and `decide` write a candidate's acceptance and a member's decision by their rows,
// for the tests of the reads that were written before the commands were (PR 2's); `acceptWith`, `approve`
// and `decline` run the commands.
//
// A refused request throws `Refused`, which the route's transaction rolls back, so a request here is a
// savepoint inside the test's own transaction: a refusal leaves exactly what the route's would.

import { randomUUID } from "node:crypto";
import {
  clubDetailBody,
  invitationAcceptanceBody,
  invitationLinkBody,
  invitationPreviewBody,
  rosterRevisionBody,
} from "@tadayo/api";
import {
  acceptInvitation,
  approveRoster,
  createClub,
  createInvitation,
  declineRoster,
  previewInvitation,
  previewInvitationWeb,
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

/** A club its creator has just made with `createClub` in `timezone`: proposed, with nobody else. */
export async function founded(
  tx: WorldTx,
  clock: FakeClock,
  name = "Ben",
  timezone = "America/New_York",
): Promise<{ user: string; club: string; interval: string }> {
  const user = await newUser(plain(tx), name);
  const made = await tx.savepoint((sp) =>
    createClub(sp, clock, { userId: user, key: randomUUID(), name: "Sunday people", timezone }, clubDetailBody),
  );
  const { club } = made.answer as unknown as { club: { id: string; my_membership_id: string } };
  return { user, club: club.id, interval: club.my_membership_id };
}

/** A link for the candidate, made by its proposer: its id and its token. */
export async function linkFor(
  tx: WorldTx,
  clock: FakeClock,
  userId: string,
  clubId: string,
  candidateId: string,
): Promise<{ id: string; token: string }> {
  const made = await link(tx, clock, userId, clubId, candidateId);
  return { id: (made.answer as unknown as { invitation_id: string }).invitation_id, token: made.token ?? "" };
}

export interface PreviewBody {
  state: string;
  invitation_id?: string;
  inviter_name?: string;
  club_name?: string;
  revision_id?: string;
  revision_version?: number;
  roster?: { name: string; kind: string; is_you: boolean }[];
  expires_at?: string;
  club?: { id: string; name: string; timezone: string; my_membership_id: string };
}

/** `previewInvitation` as its route runs it: the body, or null for the neutral not-found. */
export async function preview(tx: WorldTx, userId: string, token: string, now: ServerNow): Promise<PreviewBody | null> {
  const sight = await previewInvitation(tx, userId, token, now);
  return sight === null ? null : (invitationPreviewBody(sight) as unknown as PreviewBody);
}

/** `previewInvitationWeb` as its route runs it. */
export async function webPreview(tx: WorldTx, token: string, now: ServerNow): Promise<Json | null> {
  const found = await previewInvitationWeb(tx, token, now);
  return found === null ? null : { inviter_name: found.inviterName };
}

export interface AcceptanceBody {
  invitation_id: string;
  state: string;
  club?: { id: string; name: string; timezone: string; my_membership_id: string };
}

/** `acceptInvitation` as its route runs it. */
export const acceptWith = (
  tx: WorldTx,
  clock: FakeClock,
  userId: string,
  token: string,
  revisionId: string,
  expectedVersion: number,
  key: string = randomUUID(),
): Promise<AcceptanceBody> =>
  tx.savepoint((sp) =>
    acceptInvitation(sp, clock, { userId, key, token, revisionId, expectedVersion }, invitationAcceptanceBody),
  ) as unknown as Promise<AcceptanceBody>;

/** `approveRoster` as its route runs it. */
export const approve = (
  tx: WorldTx,
  clock: FakeClock,
  userId: string,
  revisionId: string,
  expectedVersion: number,
  key: string = randomUUID(),
): Promise<RevisionBody> =>
  tx.savepoint((sp) =>
    approveRoster(sp, clock, { userId, key, revisionId, expectedVersion }, rosterRevisionBody),
  ) as unknown as Promise<RevisionBody>;

/** `declineRoster` as its route runs it. */
export const decline = (
  tx: WorldTx,
  clock: FakeClock,
  userId: string,
  revisionId: string,
  expectedVersion: number,
  key: string = randomUUID(),
): Promise<RevisionBody> =>
  tx.savepoint((sp) =>
    declineRoster(sp, clock, { userId, key, revisionId, expectedVersion }, rosterRevisionBody),
  ) as unknown as Promise<RevisionBody>;
