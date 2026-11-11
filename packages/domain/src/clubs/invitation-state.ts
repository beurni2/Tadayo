// Where an invitation the caller accepted stands (the contract's MyInvitationState, spec 04, 32; book
// p30; T7, T33; FQ59, FQ66). Nothing is stored for it: it is read from the candidate and the club's open
// roster revision, so it always agrees with them, and one function says it for every route that lists
// invitations. It carries no roster, approval count or progress (T33), and never says who declined.

export type InvitationState = "waiting" | "roster_changed" | "did_not_go_ahead";

export interface InvitationFacts {
  /** The candidate's proposal ended, so the roster they accepted will never be applied. */
  readonly candidateEnded: boolean;
  /** The club's open revision lists the candidate as having accepted with this very link. */
  readonly acceptedOnOpenRevision: boolean;
}

export function invitationState(facts: InvitationFacts): InvitationState {
  if (facts.candidateEnded) return "did_not_go_ahead";
  return facts.acceptedOnOpenRevision ? "waiting" : "roster_changed";
}
