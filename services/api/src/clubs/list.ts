// `GET /v1/clubs` (spec 04, 05; T1, T14, T33; FQ16): the caller's clubs and the invitations they have
// accepted, with the server's instant. A new account gets two empty lists, which is Home's G06-no-club.
// The serializer is an explicit field list (T55). Each club's `open_day` and `next_day` are Home's day
// choice at the clock's sample (packages/domain/src/authorization/days.ts; T1, T5, T9), each left out when
// there is none, and carry the day's Occurrence and nothing else of it: no drop, no count, nothing about
// who has added (T15, T33).

import { contractInstant, listClubs, type ChosenDay, type ClubListing, type Json } from "@tadayo/domain";
import { ok } from "../answers.ts";
import type { Deps, Handler } from "../deps.ts";
import { signedIn } from "../deps.ts";

/** The contract's `Occurrence`: its instants in whole seconds, the star's avatar version only when there is one. */
export function occurrenceBody(day: ChosenDay): Json {
  return {
    id: day.id,
    club_id: day.clubId,
    star: {
      membership_id: day.star.membershipId,
      display_name: day.star.displayName,
      ...(day.star.avatarVersion === null ? {} : { avatar_version: day.star.avatarVersion }),
    },
    local_date: day.localDate,
    reveal_at: contractInstant(day.revealAt),
    close_at: contractInstant(day.closeAt),
    phase: day.phase,
  };
}

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
      ...(club.openDay === null ? {} : { open_day: occurrenceBody(club.openDay) }),
      ...(club.nextDay === null ? {} : { next_day: occurrenceBody(club.nextDay) }),
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
    // Read only, and the server's instant first: both lists and the days are one statement, so one
    // snapshot, and the days are chosen at that instant (T1).
    const body = await deps.sql.begin("read only", async (tx) => {
      const now = await deps.clock.sample(tx);
      return clubListBody(now, await listClubs(tx, account.id, now));
    });
    return ok(reply, body);
  };
}
