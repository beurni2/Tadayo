// A club's state, which isn't stored (db/migrations/0003_people_and_clubs.sql; the contract's ClubState,
// spec 04, FQ16): suspended while moderation holds it (spec 22), else proposed until it has started,
// else paused with fewer than two active members, else active. So it always agrees with the roster
// (book p24), and one function says it for every route that lists clubs.

export type ClubState = "proposed" | "active" | "paused" | "suspended";

export interface ClubFacts {
  /** `suspended_at` is set. */
  readonly suspended: boolean;
  /** `activated_at` is set: a roster has been accepted and the club has started. */
  readonly activated: boolean;
  /** Members with an active interval. */
  readonly activeMembers: number;
}

export function clubState(facts: ClubFacts): ClubState {
  if (facts.suspended) return "suspended";
  if (!facts.activated) return "proposed";
  return facts.activeMembers < 2 ? "paused" : "active";
}
