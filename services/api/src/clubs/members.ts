/// <reference lib="esnext.temporal" />
// `GET /v1/clubs/{club_id}/members` (the contract's `listMembers` and `Members`; spec 09, 32; T1, T9, T14,
// T15, T33, T55): the club's roster in its stable order, each member's next day and who is next, with
// the server's instant. Who is a member, which day is whose next and the order are the domain's
// (packages/domain/src/clubs/members.ts): the handler runs the read in one read-only transaction, the
// clock's sample first, and serializes what comes back by an explicit field list (T55).
//
// Anyone with nothing of the club gets the neutral not-found, the same answer as an id nobody has (T14).
// `open_revision` is the club's open roster revision as the caller reads it (FQ119), when there is one,
// read in the roster's own statement. `cover` (FQ41), optional in the contract, isn't sent yet: nothing
// stores it.

import { contractInstant, listMembers, type Json, type Roster } from "@tadayo/domain";
import { ok, problem } from "../answers.ts";
import type { Deps, Handler } from "../deps.ts";
import { signedIn } from "../deps.ts";
import { occurrenceBody } from "./list.ts";
import { rosterRevisionBody } from "./roster.ts";

/** The contract's `Members`: `now` is the clock's sample, whole seconds, rounded down. */
export function membersBody(now: Temporal.Instant, roster: Roster): Json {
  return {
    server_now: contractInstant(now),
    club: {
      id: roster.club.id,
      name: roster.club.name,
      timezone: roster.club.timezone,
      my_membership_id: roster.club.membershipId,
    },
    members: roster.members.map((member) => ({
      person: {
        membership_id: member.person.membershipId,
        display_name: member.person.displayName,
        ...(member.person.avatarVersion === null ? {} : { avatar_version: member.person.avatarVersion }),
      },
      position: member.position,
      ...(member.nextDay === null ? {} : { next_day: occurrenceBody(member.nextDay) }),
      next_up: member.nextUp,
    })),
    ...(roster.openRevision === null ? {} : { open_revision: rosterRevisionBody(roster.openRevision) }),
  };
}

export function listMembersHandler(deps: Deps): Handler {
  return async (request, reply) => {
    const account = signedIn(request);
    const params = request.params as Readonly<Record<string, unknown>> | null;
    const clubId = typeof params?.["club_id"] === "string" ? params["club_id"] : "";
    // Read only, and the server's instant first: the roster is one statement, so one snapshot (T1).
    const body = await deps.sql.begin("read only", async (tx) => {
      const now = await deps.clock.sample(tx);
      const roster = await listMembers(tx, account.id, clubId, now);
      return roster === null ? null : membersBody(now, roster);
    });
    return body === null ? problem(reply, "NOT_FOUND") : ok(reply, body);
  };
}
