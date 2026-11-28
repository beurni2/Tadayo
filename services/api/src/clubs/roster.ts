/// <reference lib="esnext.temporal" />
// A club's roster revisions and its candidates' links over HTTP (the contract's `proposeRoster`,
// `getRosterRevision`, `approveRoster`, `declineRoster`, `createInvitation`, `revokeInvitation` and `removeCandidate`;
// spec 04, 32; FQ148; G01-invite-people,
// G03-approve, book p30; T1, T7, T9, T14, T15, T19, T33, T52, T55). The rules, the order of the refusals,
// the locks and who may read or act are the domain's (packages/domain/src/clubs/roster-revision.ts,
// propose-roster.ts, decide-roster.ts, invitation.ts and remove-candidate.ts): a handler here parses the request by the contract's own schema,
// runs the read or the command in one transaction, and serializes what comes back, each serializer an
// explicit field list (T55).
//
// A caller with nothing of the club, of the revision or of the link gets the neutral not-found, the same
// answer as an id nobody has (T14). A link's token is in one answer only, the first `createInvitation`'s
// `url`, in the URL's fragment; it is never logged here, and a replay has none (T7, T52, FQ77).

import { CreateInvitationRequest, ProposeRosterRequest, RosterDecisionRequest } from "@tadayo/contracts";
import {
  approveRoster,
  contractInstant,
  createInvitation,
  declineRoster,
  proposeRoster,
  readRevision,
  Refused,
  removeCandidate,
  revokeInvitation,
  type CreateInvitationInput,
  type MadeLink,
  type Json,
  type MadeInvitation,
  type ProposeRosterInput,
  type RevisionSight,
  type RosterDecisionInput,
} from "@tadayo/domain";
import { created, IDEMPOTENCY_KEY, ok, problem, refusal } from "../answers.ts";
import type { Deps, Handler } from "../deps.ts";
import { signedIn } from "../deps.ts";
import { personBody } from "../schedule/routes.ts";

/** The contract's `RosterRevision` as its caller sees it: a link only where the domain's read put one. */
export function rosterRevisionBody(revision: RevisionSight): { readonly [key: string]: Json } {
  return {
    id: revision.id,
    version: revision.version,
    club: {
      id: revision.club.id,
      name: revision.club.name,
      timezone: revision.club.timezone,
      my_membership_id: revision.club.membershipId,
    },
    state: revision.state,
    proposed_by: personBody(revision.proposedBy),
    members: revision.members.map(personBody),
    candidates: revision.candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      proposed_by: personBody(candidate.proposedBy),
      ...(candidate.invitation === null
        ? {}
        : {
            invitation: {
              id: candidate.invitation.id,
              state: candidate.invitation.state,
              expires_at: contractInstant(candidate.invitation.expiresAt),
            },
          }),
    })),
    my_decision: revision.myDecision,
    ...(revision.supersededBy === null ? {} : { superseded_by: revision.supersededBy }),
  };
}

/** The contract's `InvitationLink` without its `url`: what `createInvitation`'s receipt keeps (FQ77). */
export function invitationLinkBody(made: MadeLink): { readonly [key: string]: Json } {
  return {
    invitation_id: made.invitationId,
    candidate_id: made.candidateId,
    expires_at: contractInstant(made.expiresAt),
  };
}

/** The link to share: the token in the fragment, which reaches no server and no log (T7, T52). */
export function invitationUrl(token: string): string {
  return `https://tadayo.app/i#${token}`;
}

/** A path's parameter, as Fastify decoded it; anything that isn't a string names nothing. */
function parameter(params: unknown, name: string): string {
  const value = (params as Readonly<Record<string, unknown>> | null)?.[name];
  return typeof value === "string" ? value : "";
}

/** The first bad field of a body the contract refused, by name, or none: never an unknown key, never a value. */
function firstBadField(
  fields: readonly string[],
  issues: readonly { readonly path: readonly PropertyKey[] }[],
): string | undefined {
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && fields.includes(field)) return field;
  }
  return undefined;
}

export function getRosterRevisionHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    const revisionId = parameter(request.params, "revision_id");
    // Read only, and the server's instant first: the revision is one statement, so one snapshot (T1).
    const body = await deps.sql.begin("read only", async (tx) => {
      const now = await deps.clock.sample(tx);
      const revision = await readRevision(tx, account.id, revisionId, now);
      return revision === null ? null : rosterRevisionBody(revision);
    });
    return body === null ? problem(reply, "NOT_FOUND") : ok(reply, body);
  };
}

export function proposeRosterHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    // The key is judged before the body's fields, the contract's order; nothing here echoes a value.
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {
      return problem(reply, "INVALID_REQUEST", { field: "Idempotency-Key" });
    }
    const parsed = ProposeRosterRequest.safeParse(request.body);
    if (!parsed.success) {
      const field = firstBadField(["expected_roster_version", "add"], parsed.error.issues);
      return problem(reply, "INVALID_REQUEST", field === undefined ? {} : { field });
    }
    const input: ProposeRosterInput = {
      userId: account.id,
      key,
      clubId: parameter(request.params, "club_id"),
      expectedRosterVersion: parsed.data.expected_roster_version,
      add: parsed.data.add.map(({ label }) => ({ label })),
    };
    let response: Json;
    try {
      response = await deps.sql.begin((tx) => proposeRoster(tx, deps.clock, input, rosterRevisionBody));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    return created(reply, response);
  };
}

/** `approveRoster` and `declineRoster`: the same request and answer, and the domain's own command each. */
function decisionHandler(deps: Deps, decide: typeof approveRoster): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {
      return problem(reply, "INVALID_REQUEST", { field: "Idempotency-Key" });
    }
    const parsed = RosterDecisionRequest.safeParse(request.body);
    if (!parsed.success) {
      const field = firstBadField(["expected_version"], parsed.error.issues);
      return problem(reply, "INVALID_REQUEST", field === undefined ? {} : { field });
    }
    const input: RosterDecisionInput = {
      userId: account.id,
      key,
      revisionId: parameter(request.params, "revision_id"),
      expectedVersion: parsed.data.expected_version,
    };
    let response: Json;
    try {
      response = await deps.sql.begin((tx) => decide(tx, deps.clock, input, rosterRevisionBody));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    return ok(reply, response);
  };
}

export const approveRosterHandler = (deps: Deps): Handler => decisionHandler(deps, approveRoster);
export const declineRosterHandler = (deps: Deps): Handler => decisionHandler(deps, declineRoster);

export function createInvitationHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {
      return problem(reply, "INVALID_REQUEST", { field: "Idempotency-Key" });
    }
    const parsed = CreateInvitationRequest.safeParse(request.body);
    if (!parsed.success) {
      const field = firstBadField(["candidate_id"], parsed.error.issues);
      return problem(reply, "INVALID_REQUEST", field === undefined ? {} : { field });
    }
    const input: CreateInvitationInput = {
      userId: account.id,
      key,
      clubId: parameter(request.params, "club_id"),
      candidateId: parsed.data.candidate_id,
    };
    let made: MadeInvitation;
    try {
      made = await deps.sql.begin((tx) => createInvitation(tx, deps.clock, input, invitationLinkBody));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    const { answer, token } = made;
    if (typeof answer !== "object" || answer === null || Array.isArray(answer)) {
      throw new Error("clubs: a link's stored answer isn't an object");
    }
    const stored = answer as Readonly<Record<string, Json>>;
    // The first answer alone carries the link; a replay is the stored answer, which never held it (FQ77).
    return created(reply, token === null ? stored : { ...stored, url: invitationUrl(token) });
  };
}

export function revokeInvitationHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    const input = { userId: account.id, invitationId: parameter(request.params, "invitation_id") };
    let revoked: { readonly invitationId: string };
    try {
      revoked = await deps.sql.begin((tx) => revokeInvitation(tx, deps.clock, input));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    return ok(reply, { invitation_id: revoked.invitationId, state: "revoked" });
  };
}

export function removeCandidateHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    const input = { userId: account.id, candidateId: parameter(request.params, "candidate_id") };
    let removed: { readonly candidateId: string };
    try {
      removed = await deps.sql.begin((tx) => removeCandidate(tx, deps.clock, input));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    return ok(reply, { candidate_id: removed.candidateId, state: "removed" });
  };
}
