import { describe, expect, it } from "vitest";
import { invitationState, type InvitationFacts, type InvitationState } from "./invitation-state.ts";

describe("where an accepted invitation stands (spec 04, 32; book p30; T7, T33)", () => {
  const table: [InvitationFacts, InvitationState][] = [
    [{ candidateEnded: false, acceptedOnOpenRevision: true }, "waiting"],
    [{ candidateEnded: false, acceptedOnOpenRevision: false }, "roster_changed"],
    [{ candidateEnded: true, acceptedOnOpenRevision: false }, "did_not_go_ahead"],
    [{ candidateEnded: true, acceptedOnOpenRevision: true }, "did_not_go_ahead"],
  ];

  it.each(table)("%j is %s", (facts, state) => {
    expect(invitationState(facts)).toBe(state);
  });

  it("names the three states the contract has, each reached", () => {
    expect(new Set(table.map(([, state]) => state))).toEqual(
      new Set(["waiting", "roster_changed", "did_not_go_ahead"]),
    );
  });
});
