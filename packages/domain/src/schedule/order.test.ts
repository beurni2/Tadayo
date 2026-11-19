import { describe, expect, it } from "vitest";
import { rosterOrder, type OrderFacts } from "./order.ts";
import type { Weekday } from "./propose.ts";

const days = (...pairs: readonly (readonly [Weekday, string])[]) =>
  pairs.map(([weekday, starInterval]) => ({ weekday, starInterval }));

describe("the roster's order (spec 09; FQ26, FQ98, FQ114)", () => {
  // The contract's Sunday people, in the order they joined (listMembers' `first_days` example).
  const JOINED = ["ben", "maya", "alex", "sam", "debby", "nina"];

  it("is the order they joined while the first days are open, whoever has confirmed (FQ98)", () => {
    const confirmed = days(["tuesday", "maya"], ["wednesday", "alex"], ["thursday", "sam"], ["saturday", "nina"]);
    expect(rosterOrder({ joined: JOINED, firstDaysOpen: true, inForce: confirmed })).toEqual(JOINED);
    // Even when the confirmed days would order them otherwise.
    const crossed = days(["monday", "nina"], ["tuesday", "debby"]);
    expect(rosterOrder({ joined: JOINED, firstDaysOpen: true, inForce: crossed })).toEqual(JOINED);
  });

  it("is the order they joined before any week is in force", () => {
    expect(rosterOrder({ joined: JOINED, firstDaysOpen: false, inForce: null })).toEqual(JOINED);
  });

  it("is the week in force from Monday once the first days have applied (the contract's F01-friends)", () => {
    const week = days(
      ["friday", "debby"],
      ["monday", "ben"],
      ["saturday", "nina"],
      ["tuesday", "maya"],
      ["thursday", "sam"],
      ["wednesday", "alex"],
    );
    // Joined in another order than their days.
    const joined = ["nina", "debby", "sam", "alex", "maya", "ben"];
    expect(rosterOrder({ joined, firstDaysOpen: false, inForce: week })).toEqual([
      "ben",
      "maya",
      "alex",
      "sam",
      "debby",
      "nina",
    ]);
  });

  it("places a member with two days by the earlier (FQ26)", () => {
    const week = days(
      ["monday", "ben"],
      ["tuesday", "debby"],
      ["wednesday", "maya"],
      ["thursday", "ben"],
      ["friday", "debby"],
      ["saturday", "maya"],
    );
    expect(rosterOrder({ joined: ["maya", "debby", "ben"], firstDaysOpen: false, inForce: week })).toEqual([
      "ben",
      "debby",
      "maya",
    ]);
    // Whichever of the two days is listed first.
    const pair = days(["thursday", "ben"], ["friday", "debby"], ["tuesday", "debby"], ["monday", "ben"]);
    expect(rosterOrder({ joined: ["debby", "ben"], firstDaysOpen: false, inForce: pair })).toEqual(["ben", "debby"]);
    // By the earlier day, not the later: Ben's Monday is before Debby's Tuesday, though Ben's Saturday is last.
    const apart = days(["monday", "ben"], ["tuesday", "debby"], ["wednesday", "debby"], ["saturday", "ben"]);
    expect(rosterOrder({ joined: ["debby", "ben"], firstDaysOpen: false, inForce: apart })).toEqual(["ben", "debby"]);
    expect(rosterOrder({ joined: ["debby", "ben"], firstDaysOpen: false, inForce: [...apart].reverse() })).toEqual([
      "ben",
      "debby",
    ]);
  });

  it("puts anyone with no day in force last, in the order they joined", () => {
    const week = days(["wednesday", "alex"], ["monday", "sam"]);
    const facts: OrderFacts = { joined: ["leila", "alex", "omar", "sam"], firstDaysOpen: false, inForce: week };
    expect(rosterOrder(facts)).toEqual(["sam", "alex", "leila", "omar"]);
  });

  it("ignores a day whose star is no longer in the roster", () => {
    const week = days(["monday", "gone"], ["tuesday", "ben"], ["wednesday", "maya"]);
    expect(rosterOrder({ joined: ["maya", "ben"], firstDaysOpen: false, inForce: week })).toEqual(["ben", "maya"]);
  });

  it("keeps the order it is given for members who joined at one instant (FQ114: the caller sorts by id)", () => {
    expect(rosterOrder({ joined: ["mem_B", "mem_a"], firstDaysOpen: true, inForce: null })).toEqual(["mem_B", "mem_a"]);
  });

  it("lists every member once, and refuses a roster that names one twice", () => {
    expect(rosterOrder({ joined: [], firstDaysOpen: false, inForce: [] })).toEqual([]);
    expect(() => rosterOrder({ joined: ["ben", "ben"], firstDaysOpen: true, inForce: null })).toThrow();
  });
});
