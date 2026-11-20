/// <reference lib="esnext.temporal" />
// A contract example's `RosterRevision` as the domain's read would hold it: the input of the serializer
// the route tests hold against the contract's examples (roster.test.ts, members.test.ts). Only tests
// import it.

import type { RevisionSight, SchedulePerson } from "@tadayo/domain";

type Body = Record<string, unknown>;
interface PersonBody {
  membership_id: string;
  display_name: string;
  avatar_version?: string;
}

const personOf = (body: PersonBody): SchedulePerson => ({
  membershipId: body.membership_id,
  displayName: body.display_name,
  avatarVersion: body.avatar_version ?? null,
});

/** A contract example's RosterRevision as the domain's read would hold it: the serializer's input. */
export function revisionSight(value: Body): RevisionSight {
  const club = value["club"] as Body;
  const candidates = value["candidates"] as (Body & { proposed_by: PersonBody; invitation?: Body })[];
  return {
    id: value["id"] as string,
    version: value["version"] as number,
    club: {
      id: club["id"] as string,
      name: club["name"] as string,
      timezone: club["timezone"] as string,
      membershipId: club["my_membership_id"] as string,
    },
    state: value["state"] as RevisionSight["state"],
    proposedBy: personOf(value["proposed_by"] as PersonBody),
    members: (value["members"] as PersonBody[]).map(personOf),
    candidates: candidates.map((candidate) => ({
      id: candidate["id"] as string,
      name: candidate["name"] as string,
      proposedBy: personOf(candidate.proposed_by),
      invitation:
        candidate.invitation === undefined
          ? null
          : {
              id: candidate.invitation["id"] as string,
              state: candidate.invitation["state"] as "live",
              expiresAt: Temporal.Instant.from(candidate.invitation["expires_at"] as string),
            },
    })),
    myDecision: value["my_decision"] as RevisionSight["myDecision"],
    supersededBy: (value["superseded_by"] as string | undefined) ?? null,
  };
}
