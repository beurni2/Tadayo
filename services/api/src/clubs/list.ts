// `GET /v1/clubs` (spec 04, 05; T1, T14, T33; FQ16): the caller's clubs and the invitations they have
// accepted, with the server's instant. A new account gets two empty lists, which is Home's G06-no-club.
// The serializer is an explicit field list (T55). `open_day` and `next_day`, which need Home's day logic,
// are left out until B2: the contract makes them optional, and no club can exist through the API before B1.

import { contractInstant, listClubs, type ClubListing, type Json } from "@tadayo/domain";
import { ok } from "../answers.ts";
import type { Deps, Handler } from "../deps.ts";
import { signedIn } from "../deps.ts";

/** The contract's `ClubList`: `now` is the clock's sample, whole seconds, rounded down. */
export function clubListBody(now: Temporal.Instant, listing: ClubListing): Json {
  return {
    server_now: contractInstant(now),
    clubs: listing.clubs.map((club) => ({
      id: club.id,
      name: club.name,
      timezone: club.timezone,
      my_membership_id: club.membershipId,
      state: club.state,
      member_count: club.memberCount,
    })),
    invitations: listing.invitations.map((invitation) => ({
      invitation_id: invitation.id,
      club_name: invitation.clubName,
      inviter_name: invitation.inviterName,
      state: invitation.state,
    })),
  };
}

export function listClubsHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    // Read only, and the server's instant first: both lists are one statement, so one snapshot.
    const body = await deps.sql.begin("read only", async (tx) => {
      const now = await deps.clock.sample(tx);
      return clubListBody(now, await listClubs(tx, account.id));
    });
    return ok(reply, body);
  };
}
