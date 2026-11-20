/// <reference lib="esnext.temporal" />
// The membership change's rules (spec 05; FQ16, FQ56, FQ61, FQ100, FQ102, FQ115, FQ125 to FQ127;
// docs/plans/api-b2-membership-change.md, section 2).

import { describe, expect, it } from "vitest";
import { changeAfter, changeStart, changeWeek, type ChangeFacts, type WeekDay } from "./change.ts";
import type { Weekday } from "./propose.ts";

const D = (date: string): Temporal.PlainDate => Temporal.PlainDate.from(date);

function week(...days: readonly (readonly [Weekday, string])[]): WeekDay[] {
  return days.map(([weekday, star]) => ({ weekday, star }));
}

/** Spec 05's example week for three: two days each. */
const THREE = week(
  ["monday", "ben"],
  ["tuesday", "debby"],
  ["wednesday", "maya"],
  ["thursday", "ben"],
  ["friday", "debby"],
  ["saturday", "maya"],
);
/** One day each for four. */
const FOUR = week(["monday", "ben"], ["tuesday", "debby"], ["wednesday", "maya"], ["thursday", "alex"]);

function facts(over: Partial<ChangeFacts>): ChangeFacts {
  return { active: ["ben", "debby", "maya", "alex"], firstDaysOpen: false, week: FOUR, open: null, ...over };
}

describe("changeWeek: which week a change proposes (FQ125)", () => {
  it("keeps every member's day and gives a fifth member the table's day for their place, which is free", () => {
    expect(changeWeek(["ben", "debby", "maya", "alex", "sam"], FOUR)).toEqual({
      daysPerMember: 1,
      proposed: [
        { id: "ben", days: ["monday"] },
        { id: "debby", days: ["tuesday"] },
        { id: "maya", days: ["wednesday"] },
        { id: "alex", days: ["thursday"] },
        { id: "sam", days: ["friday"] },
      ],
    });
  });

  it("gives a new member the first free day from Monday when the day of their place is kept by someone", () => {
    // Five members whose days aren't the table's: the sixth member's place is Saturday, which Sam keeps,
    // and Monday is Ben's, so the first free day is Tuesday.
    const five = week(
      ["monday", "ben"],
      ["wednesday", "debby"],
      ["thursday", "maya"],
      ["friday", "alex"],
      ["saturday", "sam"],
    );
    const change = changeWeek(["ben", "debby", "maya", "alex", "sam", "nina"], five);
    expect(change.proposed.at(-1)).toEqual({ id: "nina", days: ["tuesday"] });
    expect(change.proposed.slice(0, 5).map((member) => member.days)).toEqual([
      ["monday"],
      ["wednesday"],
      ["thursday"],
      ["friday"],
      ["saturday"],
    ]);
  });

  it("frees the days of a member who left and moves nobody, where the table keeps the days each", () => {
    // Five to four: one day each before and after.
    const five = [...FOUR, { weekday: "friday" as const, star: "sam" }];
    expect(changeWeek(["ben", "debby", "alex", "sam"], five).proposed).toEqual([
      { id: "ben", days: ["monday"] },
      { id: "debby", days: ["tuesday"] },
      { id: "alex", days: ["thursday"] },
      { id: "sam", days: ["friday"] },
    ]);
    // Three to two: two days each before and after.
    expect(changeWeek(["ben", "maya"], THREE)).toEqual({
      daysPerMember: 2,
      proposed: [
        { id: "ben", days: ["monday", "thursday"] },
        { id: "maya", days: ["wednesday", "saturday"] },
      ],
    });
  });

  it("proposes the table's whole week when a fourth member joins three: one day each (spec 05)", () => {
    expect(changeWeek(["ben", "debby", "maya", "alex"], THREE)).toEqual({
      daysPerMember: 1,
      proposed: [
        { id: "ben", days: ["monday"] },
        { id: "debby", days: ["tuesday"] },
        { id: "maya", days: ["wednesday"] },
        { id: "alex", days: ["thursday"] },
      ],
    });
  });

  it("proposes the table's whole week when four become three: two days each (spec 05)", () => {
    expect(changeWeek(["ben", "maya", "alex"], FOUR)).toEqual({
      daysPerMember: 2,
      proposed: [
        { id: "ben", days: ["monday", "thursday"] },
        { id: "maya", days: ["tuesday", "friday"] },
        { id: "alex", days: ["wednesday", "saturday"] },
      ],
    });
  });

  it("gives a member with no day in the week the days they lack, as it does a new member (FQ100)", () => {
    // The first days applied for Ben and Debby, two days each; Maya joined after the first confirmation.
    const two = week(["monday", "ben"], ["tuesday", "debby"], ["thursday", "ben"], ["friday", "debby"]);
    expect(changeWeek(["ben", "debby", "maya"], two).proposed).toEqual([
      { id: "ben", days: ["monday", "thursday"] },
      { id: "debby", days: ["tuesday", "friday"] },
      { id: "maya", days: ["wednesday", "saturday"] },
    ]);
  });

  it("gives two who join at once different days, in the order they joined", () => {
    const change = changeWeek(["ben", "debby", "maya", "alex", "sam", "nina"], FOUR);
    expect(change.proposed.slice(4)).toEqual([
      { id: "sam", days: ["friday"] },
      { id: "nina", days: ["saturday"] },
    ]);
    // Neither place is free (Friday and Saturday are kept): the first free day each, never the same one.
    const four = week(["tuesday", "ben"], ["wednesday", "debby"], ["friday", "maya"], ["saturday", "alex"]);
    expect(changeWeek(["ben", "debby", "maya", "alex", "sam", "nina"], four).proposed.slice(4)).toEqual([
      { id: "sam", days: ["monday"] },
      { id: "nina", days: ["thursday"] },
    ]);
  });

  it("gives the table's days to members none of whom has a day in the week", () => {
    // Everyone who confirmed has left; the two who remain joined later.
    expect(changeWeek(["sam", "nina"], FOUR).proposed).toEqual([
      { id: "sam", days: ["monday", "thursday"] },
      { id: "nina", days: ["tuesday", "friday"] },
    ]);
  });

  it("proposes a day once and every member the table's number, for every size and every member who leaves", () => {
    for (let size = 3; size <= 6; size += 1) {
      const names = ["a", "b", "c", "d", "e", "f"].slice(0, size);
      const before = changeWeek(names, []).proposed.flatMap((member) =>
        member.days.map((weekday) => ({ weekday, star: member.id })),
      );
      for (const leaver of names) {
        const stay = names.filter((name) => name !== leaver);
        const change = changeWeek(stay, before);
        const days = change.proposed.flatMap((member) => member.days);
        expect(new Set(days).size).toBe(days.length);
        expect(change.proposed.map((member) => member.id)).toEqual(stay);
        for (const member of change.proposed) expect(member.days).toHaveLength(change.daysPerMember);
      }
    }
  });

  it("refuses a roster outside two to six (A01)", () => {
    expect(() => changeWeek(["ben"], FOUR)).toThrow(RangeError);
    expect(() => changeWeek(["a", "b", "c", "d", "e", "f", "g"], FOUR)).toThrow(RangeError);
  });
});

describe("changeAfter: when a change is proposed, replaced or dropped", () => {
  it("leaves the first days to their own rule while they are open", () => {
    expect(changeAfter(facts({ firstDaysOpen: true, active: ["ben", "debby"] }))).toEqual({ kind: "nothing" });
  });

  it("proposes nothing for a club that never had a confirmed week", () => {
    expect(changeAfter(facts({ week: null, active: ["ben", "debby"] }))).toEqual({ kind: "nothing" });
  });

  it("proposes nothing when the active members are the week's stars, each with the table's days", () => {
    expect(changeAfter(facts({}))).toEqual({ kind: "nothing" });
    expect(changeAfter(facts({ active: ["ben", "debby", "maya"], week: THREE }))).toEqual({ kind: "nothing" });
  });

  it("proposes a change for a join, a leave, and a leaver's day still in the week", () => {
    const joined = changeAfter(facts({ active: ["ben", "debby", "maya", "alex", "sam"] }));
    expect(joined).toMatchObject({ kind: "propose", replaces: false, daysPerMember: 1 });
    // Five to four, one day each: nobody's day moves, and the change still takes the leaver's day out.
    const five = [...FOUR, { weekday: "friday" as const, star: "sam" }];
    const left = changeAfter(facts({ week: five }));
    expect(left).toMatchObject({ kind: "propose", replaces: false });
    if (left.kind !== "propose") throw new Error("unreachable");
    expect(left.proposed.flatMap((member) => member.days)).toEqual(["monday", "tuesday", "wednesday", "thursday"]);
  });

  it("proposes a change when a member has fewer days than the table's, though the stars are the members", () => {
    // Three members hold one day each, as the first days of four left them (FQ100, FQ102).
    const one = week(["monday", "ben"], ["tuesday", "debby"], ["wednesday", "maya"]);
    expect(changeAfter(facts({ active: ["ben", "debby", "maya"], week: one }))).toMatchObject({
      kind: "propose",
      daysPerMember: 2,
    });
  });

  it("replaces an open change when the members it includes are no longer the club's (FQ126)", () => {
    const open = { members: ["ben", "debby", "maya", "alex", "sam"] };
    const again = changeAfter(facts({ active: ["ben", "debby", "maya", "alex", "sam", "nina"], open }));
    expect(again).toMatchObject({ kind: "propose", replaces: true });
  });

  it("changes nothing when the open change already includes exactly the club's members", () => {
    const open = { members: ["sam", "ben", "debby", "maya", "alex"] };
    expect(changeAfter(facts({ active: ["ben", "debby", "maya", "alex", "sam"], open }))).toEqual({
      kind: "nothing",
    });
  });

  it("drops an open change when the club is back at the week's own members", () => {
    const open = { members: ["ben", "debby", "maya", "alex", "sam"] };
    expect(changeAfter(facts({ open }))).toEqual({ kind: "drop" });
  });

  it("drops an open change, and proposes none, with fewer than two members (FQ16)", () => {
    expect(changeAfter(facts({ active: ["ben"], open: { members: ["ben", "debby"] } }))).toEqual({ kind: "drop" });
    expect(changeAfter(facts({ active: ["ben"] }))).toEqual({ kind: "nothing" });
    expect(changeAfter(facts({ active: [] }))).toEqual({ kind: "nothing" });
  });

  it("refuses a member listed twice, and more than six (A01)", () => {
    expect(() => changeAfter(facts({ active: ["ben", "ben"] }))).toThrow();
    expect(() => changeAfter(facts({ active: ["a", "b", "c", "d", "e", "f", "g"] }))).toThrow(RangeError);
  });
});

describe("changeStart: the first week after every day already made (FQ61, FQ115)", () => {
  it("is Monday 7 December 2026 seen from Friday 6 November, the contract's own example", () => {
    expect(changeStart(D("2026-11-06"), D("2026-12-05"), null).toString()).toBe("2026-12-07");
    expect(changeStart(D("2026-11-06"), null, null).toString()).toBe("2026-12-07");
  });

  it("is the same Monday from every day of a week, and a week later from the next Monday", () => {
    for (const day of ["2026-11-02", "2026-11-04", "2026-11-07", "2026-11-08"]) {
      expect(changeStart(D(day), null, null).toString()).toBe("2026-12-07");
    }
    expect(changeStart(D("2026-11-09"), null, null).toString()).toBe("2026-12-14");
  });

  it("is the Monday after the last day made when a day was made beyond the window", () => {
    expect(changeStart(D("2026-11-06"), D("2026-12-09"), null).toString()).toBe("2026-12-14");
    // A day made on a Saturday: the Monday two days on.
    expect(changeStart(D("2026-11-06"), D("2026-12-12"), null).toString()).toBe("2026-12-14");
  });

  it("keeps the start of the change it replaces while that start is still ahead (FQ126, FQ127)", () => {
    expect(changeStart(D("2026-11-20"), D("2026-12-05"), D("2026-12-07")).toString()).toBe("2026-12-07");
  });

  it("takes a new start when the replaced change's start is today or has passed", () => {
    expect(changeStart(D("2026-12-07"), D("2026-12-05"), D("2026-12-07")).toString()).toBe("2027-01-11");
    expect(changeStart(D("2026-12-09"), D("2026-12-05"), D("2026-12-07")).toString()).toBe("2027-01-11");
  });

  it("takes a new start when a day was made on or after the replaced change's start", () => {
    // Generation makes no such day while the change is open (FQ127); the rule holds without it.
    expect(changeStart(D("2026-11-20"), D("2026-12-07"), D("2026-12-07")).toString()).toBe("2026-12-21");
    expect(changeStart(D("2026-11-20"), D("2026-12-09"), D("2026-12-07")).toString()).toBe("2026-12-21");
  });

  it("is always a Monday after today and after the last day made, whichever branch decides", () => {
    let beyond = 0;
    for (let offset = 0; offset < 40; offset += 1) {
      const today = D("2026-10-25").add({ days: offset });
      // Days made from none to well past the window, so both branches decide in turn.
      for (const ahead of [null, 0, 9, 28, 29, 34, 35, 36, 41, 60]) {
        const lastMade = ahead === null ? null : today.add({ days: ahead });
        const start = changeStart(today, lastMade, null);
        expect(start.dayOfWeek).toBe(1);
        expect(Temporal.PlainDate.compare(start, today)).toBeGreaterThan(0);
        if (lastMade !== null) {
          expect(Temporal.PlainDate.compare(start, lastMade)).toBeGreaterThan(0);
          expect(start.since(lastMade).days <= 7 || start.equals(changeStart(today, null, null))).toBe(true);
          if (!start.equals(changeStart(today, null, null))) beyond += 1;
        }
      }
    }
    expect(beyond).toBeGreaterThan(40);
  });
});
