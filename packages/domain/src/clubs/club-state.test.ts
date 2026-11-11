import { describe, expect, it } from "vitest";
import { clubState, type ClubFacts, type ClubState } from "./club-state.ts";

describe("a club's state (FQ16, spec 04, spec 22)", () => {
  // Every combination of the three facts, up to the most a club holds (six, A01).
  const table: [ClubFacts, ClubState][] = [];
  for (const suspended of [false, true]) {
    for (const activated of [false, true]) {
      for (const activeMembers of [0, 1, 2, 3, 6]) {
        const state: ClubState = suspended
          ? "suspended"
          : !activated
            ? "proposed"
            : activeMembers < 2
              ? "paused"
              : "active";
        table.push([{ suspended, activated, activeMembers }, state]);
      }
    }
  }

  it.each(table)("%j is %s", (facts, state) => {
    expect(clubState(facts)).toBe(state);
  });

  it("names the four states the contract has, each reached", () => {
    expect(new Set(table.map(([, state]) => state))).toEqual(new Set(["proposed", "active", "paused", "suspended"]));
  });

  it("holds the readings the sources give: a suspension beats not having started, a start waits for two", () => {
    expect(clubState({ suspended: true, activated: false, activeMembers: 1 })).toBe("suspended");
    expect(clubState({ suspended: false, activated: false, activeMembers: 6 })).toBe("proposed");
    expect(clubState({ suspended: false, activated: true, activeMembers: 1 })).toBe("paused");
    expect(clubState({ suspended: false, activated: true, activeMembers: 2 })).toBe("active");
  });
});
