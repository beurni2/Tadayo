/// <reference lib="esnext.temporal" />
// An invitation for the person holding its link, over HTTP (the contract's `previewInvitationWeb`,
// `previewInvitation` and `acceptInvitation`; spec 04, 32; G02, G03-waiting, book p9, p30; T1, T7, T14,
// T19, T33, T52, T55). Where a link stands, the order of the refusals, the locks and what accepting
// changes are the domain's (packages/domain/src/clubs/invitation-preview.ts and accept-invitation.ts): a
// handler here parses the request by the contract's own schema, runs the read or the command in one
// transaction, and serializes what comes back, each serializer an explicit field list (T55).
//
// The token arrives in the body, never in a path or a query, and is never logged here: a refused body
// names its first bad field, never a value (T7, T52). A token that names nothing to the caller gets the
// neutral not-found, the same answer as one nobody made (T14, FQ59).

import { AcceptInvitationRequest, InvitationTokenRequest } from "@tadayo/contracts";
import {
  acceptInvitation,
  contractInstant,
  previewInvitation,
  previewInvitationWeb,
  Refused,
  type Acceptance,
  type AcceptInvitationInput,
  type InvitationSight,
  type Json,
} from "@tadayo/domain";
import { IDEMPOTENCY_KEY, ok, problem, refusal } from "../answers.ts";
import type { Deps, Handler } from "../deps.ts";
import { signedIn } from "../deps.ts";

/** The contract's `InvitationPreview`, by its state: names only, and nothing of anyone's decision. */
export function invitationPreviewBody(sight: InvitationSight): { readonly [key: string]: Json } {
  switch (sight.state) {
    case "expired":
    case "full":
    case "did_not_go_ahead":
      return { state: sight.state, inviter_name: sight.inviterName };
    case "joined":
      return {
        state: sight.state,
        club: {
          id: sight.club.id,
          name: sight.club.name,
          timezone: sight.club.timezone,
          my_membership_id: sight.club.membershipId,
        },
      };
    default:
      return {
        state: sight.state,
        invitation_id: sight.invitationId,
        inviter_name: sight.inviterName,
        club_name: sight.clubName,
        revision_id: sight.revisionId,
        revision_version: sight.revisionVersion,
        roster: sight.roster.map((entry) => ({ name: entry.name, kind: entry.kind, is_you: entry.isYou })),
        ...(sight.state === "waiting" ? {} : { expires_at: contractInstant(sight.expiresAt) }),
      };
  }
}

/** The contract's `InvitationAcceptance`: what `acceptInvitation`'s receipt keeps. */
export function invitationAcceptanceBody(acceptance: Acceptance): { readonly [key: string]: Json } {
  return {
    invitation_id: acceptance.invitationId,
    state: acceptance.state,
    ...(acceptance.club === null
      ? {}
      : {
          club: {
            id: acceptance.club.id,
            name: acceptance.club.name,
            timezone: acceptance.club.timezone,
            my_membership_id: acceptance.club.membershipId,
          },
        }),
  };
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

export function previewInvitationWebHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const parsed = InvitationTokenRequest.safeParse(request.body);
    if (!parsed.success) {
      const field = firstBadField(["token"], parsed.error.issues);
      return problem(reply, "INVALID_REQUEST", field === undefined ? {} : { field });
    }
    const { token } = parsed.data;
    // Read only, the server's instant first: a link is live by the server's clock (T1).
    const found = await deps.sql.begin("read only", async (tx) =>
      previewInvitationWeb(tx, token, await deps.clock.sample(tx)),
    );
    return found === null ? problem(reply, "NOT_FOUND") : ok(reply, { inviter_name: found.inviterName });
  };
}

export function previewInvitationHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    const parsed = InvitationTokenRequest.safeParse(request.body);
    if (!parsed.success) {
      const field = firstBadField(["token"], parsed.error.issues);
      return problem(reply, "INVALID_REQUEST", field === undefined ? {} : { field });
    }
    const { token } = parsed.data;
    // Read only, and one statement at the server's instant: one snapshot (T1).
    const sight = await deps.sql.begin("read only", async (tx) =>
      previewInvitation(tx, account.id, token, await deps.clock.sample(tx)),
    );
    return sight === null ? problem(reply, "NOT_FOUND") : ok(reply, invitationPreviewBody(sight));
  };
}

export function acceptInvitationHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    // The key is judged before the body's fields, the contract's order; nothing here echoes a value.
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {
      return problem(reply, "INVALID_REQUEST", { field: "Idempotency-Key" });
    }
    const parsed = AcceptInvitationRequest.safeParse(request.body);
    if (!parsed.success) {
      const field = firstBadField(["token", "revision_id", "expected_version"], parsed.error.issues);
      return problem(reply, "INVALID_REQUEST", field === undefined ? {} : { field });
    }
    const input: AcceptInvitationInput = {
      userId: account.id,
      key,
      token: parsed.data.token,
      revisionId: parsed.data.revision_id,
      expectedVersion: parsed.data.expected_version,
    };
    let response: Json;
    try {
      response = await deps.sql.begin((tx) => acceptInvitation(tx, deps.clock, input, invitationAcceptanceBody));
    } catch (error) {
      if (error instanceof Refused) return refusal(reply, error);
      throw error;
    }
    return ok(reply, response);
  };
}
