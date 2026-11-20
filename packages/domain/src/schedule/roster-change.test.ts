// Written before ./roster-change.ts, from docs/plans/api-b2-first-days-roster.md, sections 0 and 3.
import { describe, expect, it } from "vitest";
import { daysPerMember, proposedWeek, WEEKDAYS, type Weekday } from "./propose.ts";
import { firstDaysAfter, type FirstDaysMember, type RosterChangeFacts } from "./roster-change.ts";

const NAMES = ["ben", "maya", "alex", "sam", "debby", "nina"] as const;

const member = (
  id: string,
  held: readonly Weekday[],
  extra: Partial<Pick<FirstDaysMember, "active" | "confirmed">> = {},
): FirstDaysMember => ({ id, active: true, confirmed: false, held, ...extra });

/** A club of `count` in its first days, as they were opened: each member holds the proposed days. */
const opened = (count: number): FirstDaysMember[] =>
  proposedWeek(count).map((days, index) => member(NAMES[index] ?? "zed", days));

const facts = (
  active: readonly string[],
  open: RosterChangeFacts["open"],
  endedWithoutSuccessor = false,
): RosterChangeFacts => ({ active, open, endedWithoutSuccessor });

const ids = (members: readonly FirstDaysMember[]) => members.filter((each) => each.active).map((each) => each.id);

describe("a join before any day is confirmed (FQ55, FQ102)", () => {
  it("includes the new member with spec 05's days for their place, which nobody holds, and moves nobody", () => {
    // Ben and Maya, two days each; Alex joins: three still have two days each.
    const members = opened(2);
    expect(firstDaysAfter(facts(["ben", "maya", "alex"], { daysPerMember: 2, members }))).toEqual({
      kind: "revise",
      daysPerMember: 2,
      newWeek: false,
      added: ["alex"],
      proposed: [{ id: "alex", days: ["wednesday", "saturday"] }],
    });
    // Four, one day each; Debby joins as the fifth: Friday.
    expect(firstDaysAfter(facts([...NAMES.slice(0, 5)], { daysPerMember: 1, members: opened(4) }))).toEqual({
      kind: "revise",
      daysPerMember: 1,
      newWeek: false,
      added: ["debby"],
      proposed: [{ id: "debby", days: ["friday"] }],
    });
  });

  it("gives the new member the first free days from Monday when someone holds the days of their place", () => {
    // Maya chose Wednesday and Saturday, the third member's days by the table. Ben holds Monday, Thursday.
    const members = [member("ben", ["monday", "thursday"]), member("maya", ["wednesday", "saturday"])];
    const change = firstDaysAfter(facts(["ben", "maya", "alex"], { daysPerMember: 2, members }));
    expect(change).toMatchObject({ kind: "revise", newWeek: false });
    expect(change.kind === "revise" && change.proposed).toEqual([{ id: "alex", days: ["tuesday", "friday"] }]);
    // One of the two is held: the free one is kept, the other is the first free from Monday.
    const one = [member("ben", ["monday", "thursday"]), member("maya", ["tuesday", "saturday"])];
    const kept = firstDaysAfter(facts(["ben", "maya", "alex"], { daysPerMember: 2, members: one }));
    expect(kept.kind === "revise" && kept.proposed).toEqual([{ id: "alex", days: ["wednesday", "friday"] }]);
  });

  it("counts a contested day as held, and a day only someone who left held as free", () => {
    // Ben and Maya both hold Monday; Sam held Thursday and left. Nina joins a club of five as its fifth.
    const members = [
      member("ben", ["monday"]),
      member("maya", ["monday"]),
      member("alex", ["wednesday"]),
      member("sam", ["thursday"], { active: false }),
      member("debby", ["friday"]),
    ];
    const change = firstDaysAfter(facts(["ben", "maya", "alex", "debby", "nina"], { daysPerMember: 1, members }));
    // The fifth place's day is Friday, which Debby holds: the first free day from Monday is Tuesday.
    expect(change.kind === "revise" && change.proposed).toEqual([{ id: "nina", days: ["tuesday"] }]);
  });

  it("gives two who join at once different days, in the order they joined", () => {
    const change = firstDaysAfter(facts([...NAMES], { daysPerMember: 1, members: opened(4) }));
    expect(change).toEqual({
      kind: "revise",
      daysPerMember: 1,
      newWeek: false,
      added: ["debby", "nina"],
      proposed: [
        { id: "debby", days: ["friday"] },
        { id: "nina", days: ["saturday"] },
      ],
    });
  });

  it("proposes the whole week again when a fourth member joins three: one day each (spec 05)", () => {
    // Ben had chosen other days, and Maya and Alex contested Friday: all set aside.
    const members = [
      member("ben", ["tuesday", "saturday"]),
      member("maya", ["wednesday", "friday"]),
      member("alex", ["friday", "saturday"]),
    ];
    expect(firstDaysAfter(facts(["ben", "maya", "alex", "sam"], { daysPerMember: 2, members }))).toEqual({
      kind: "revise",
      daysPerMember: 1,
      newWeek: true,
      added: ["sam"],
      proposed: [
        { id: "ben", days: ["monday"] },
        { id: "maya", days: ["tuesday"] },
        { id: "alex", days: ["wednesday"] },
        { id: "sam", days: ["thursday"] },
      ],
    });
  });
});

describe("a leave before any day is confirmed (FQ102)", () => {
  it("frees the leaver's days and moves nobody where the days each member has stay", () => {
    const members = opened(6).map((each) => (each.id === "alex" ? { ...each, active: false } : each));
    expect(firstDaysAfter(facts(ids(members), { daysPerMember: 1, members }))).toEqual({
      kind: "revise",
      daysPerMember: 1,
      newWeek: false,
      added: [],
      proposed: [],
    });
    const three = opened(3).map((each) => (each.id === "ben" ? { ...each, active: false } : each));
    expect(firstDaysAfter(facts(ids(three), { daysPerMember: 2, members: three }))).toMatchObject({
      kind: "revise",
      newWeek: false,
      proposed: [],
    });
  });

  it("proposes the whole week again when a club of four loses a member: two days each", () => {
    const members = opened(4).map((each) => (each.id === "maya" ? { ...each, active: false } : each));
    expect(firstDaysAfter(facts(ids(members), { daysPerMember: 1, members }))).toEqual({
      kind: "revise",
      daysPerMember: 2,
      newWeek: true,
      added: [],
      proposed: [
        { id: "ben", days: ["monday", "thursday"] },
        { id: "alex", days: ["tuesday", "friday"] },
        { id: "sam", days: ["wednesday", "saturday"] },
      ],
    });
  });

  it("ends the first days with no successor when one member is left, or none", () => {
    const pair = opened(2).map((each) => (each.id === "ben" ? { ...each, active: false } : each));
    expect(firstDaysAfter(facts(["maya"], { daysPerMember: 2, members: pair }))).toEqual({
      kind: "end",
      reopen: false,
    });
    const nobody = opened(2).map((each) => ({ ...each, active: false }));
    expect(firstDaysAfter(facts([], { daysPerMember: 2, members: nobody }))).toEqual({ kind: "end", reopen: false });
  });
});

describe("every club size, through a join and a leave with nobody confirmed", () => {
  for (let count = 2; count <= 6; count += 1) {
    it(`leaves a club of ${String(count)} with each member holding the right number of days, none proposed twice`, () => {
      const before = opened(count);
      const changes: [string, RosterChangeFacts][] = [];
      if (count < 6) {
        changes.push([
          "join",
          facts([...ids(before), "new"], { daysPerMember: daysPerMember(count), members: before }),
        ]);
      }
      if (count > 2) {
        const left = before.map((each, index) => (index === 1 ? { ...each, active: false } : each));
        changes.push(["leave", facts(ids(left), { daysPerMember: daysPerMember(count), members: left })]);
      }
      for (const [, given] of changes) {
        const change = firstDaysAfter(given);
        if (change.kind !== "revise") throw new Error("not a revision");
        const per = daysPerMember(given.active.length);
        expect(change.daysPerMember).toBe(per);
        expect(change.newWeek).toBe(per !== given.open?.daysPerMember);
        // What each active member holds afterwards.
        const held = new Map<string, readonly Weekday[]>();
        if (!change.newWeek) {
          for (const each of given.open?.members ?? []) if (each.active) held.set(each.id, each.held);
        }
        for (const each of change.proposed) held.set(each.id, each.days);
        expect([...held.keys()].sort()).toEqual([...given.active].sort());
        const all = [...held.values()].flat();
        for (const days of held.values()) expect(days).toHaveLength(per);
        expect(new Set(all).size).toBe(all.length);
        for (const day of all) expect(WEEKDAYS).toContain(day);
      }
    });
  }
});

describe("a change of members once a day is confirmed (FQ100, FQ102)", () => {
  const confirmed = (id: string, held: readonly Weekday[], active = true) =>
    member(id, held, { confirmed: true, active });

  it("includes no new member and changes nothing on a join", () => {
    const members = [confirmed("ben", ["monday", "thursday"]), member("maya", ["tuesday", "friday"])];
    expect(firstDaysAfter(facts(["ben", "maya", "alex"], { daysPerMember: 2, members }))).toEqual({ kind: "nothing" });
  });

  it("applies the first days when a leave leaves only confirmed members among those they include", () => {
    const members = [
      confirmed("ben", ["monday", "thursday"]),
      member("maya", ["tuesday", "friday"], { active: false }),
      confirmed("alex", ["wednesday", "saturday"]),
    ];
    expect(firstDaysAfter(facts(["ben", "alex"], { daysPerMember: 2, members }))).toEqual({ kind: "apply" });
    // One confirmed member left: the first days apply first, and the club is paused (FQ16).
    const pair = [confirmed("ben", ["monday", "thursday"]), member("maya", ["tuesday", "friday"], { active: false })];
    expect(firstDaysAfter(facts(["ben"], { daysPerMember: 2, members: pair }))).toEqual({ kind: "apply" });
    // A late joiner is never one of them: Sam hasn't confirmed anything and doesn't hold the first days back.
    expect(firstDaysAfter(facts(["ben", "alex", "sam"], { daysPerMember: 2, members }))).toEqual({ kind: "apply" });
  });

  it("changes nothing when a leave leaves a member who hasn't confirmed, in a club of two or more", () => {
    const members = [
      confirmed("ben", ["monday", "thursday"]),
      member("maya", ["tuesday", "friday"]),
      member("alex", ["wednesday", "saturday"], { active: false }),
    ];
    expect(firstDaysAfter(facts(["ben", "maya"], { daysPerMember: 2, members }))).toEqual({ kind: "nothing" });
    // The confirmed member is the one who left: Maya and Alex go on, and Ben's day stays taken.
    const left = [
      confirmed("ben", ["monday", "thursday"], false),
      member("maya", ["tuesday", "friday"]),
      member("alex", ["wednesday", "saturday"]),
    ];
    expect(firstDaysAfter(facts(["maya", "alex"], { daysPerMember: 2, members: left }))).toEqual({ kind: "nothing" });
    // One included member left unconfirmed, beside a late joiner: the club isn't paused, and Maya can confirm.
    const late = [confirmed("ben", ["monday", "thursday"], false), member("maya", ["tuesday", "friday"])];
    expect(firstDaysAfter(facts(["maya", "sam"], { daysPerMember: 2, members: late }))).toEqual({ kind: "nothing" });
  });

  it("ends the first days when the club's one member left hasn't confirmed", () => {
    const pair = [confirmed("ben", ["monday", "thursday"], false), member("maya", ["tuesday", "friday"])];
    expect(firstDaysAfter(facts(["maya"], { daysPerMember: 2, members: pair }))).toEqual({
      kind: "end",
      reopen: false,
    });
  });

  it("ends them when nobody they include is left, and opens new ones at once for two or more (FQ123)", () => {
    const gone = [
      confirmed("ben", ["monday", "thursday"], false),
      member("maya", ["tuesday", "friday"], { active: false }),
    ];
    expect(firstDaysAfter(facts(["sam", "debby"], { daysPerMember: 2, members: gone }))).toEqual({
      kind: "end",
      reopen: true,
    });
    expect(firstDaysAfter(facts(["sam"], { daysPerMember: 2, members: gone }))).toEqual({ kind: "end", reopen: false });
    expect(firstDaysAfter(facts([], { daysPerMember: 2, members: gone }))).toEqual({ kind: "end", reopen: false });
  });
});

describe("a club with no open first days", () => {
  it("opens new first days when all before them ended with no successor and the club has two members again", () => {
    expect(firstDaysAfter(facts(["maya", "sam"], null, true))).toEqual({ kind: "open" });
    expect(firstDaysAfter(facts(["maya"], null, true))).toEqual({ kind: "nothing" });
    expect(firstDaysAfter(facts([], null, true))).toEqual({ kind: "nothing" });
  });

  it("does nothing once the first days have applied, or before any were opened", () => {
    expect(firstDaysAfter(facts(["ben", "maya", "sam"], null))).toEqual({ kind: "nothing" });
    expect(firstDaysAfter(facts(["ben"], null))).toEqual({ kind: "nothing" });
  });
});

describe("what the rule refuses", () => {
  it("throws for more than six members (A01), a member twice, and a proposal that includes nobody", () => {
    const seven = [...NAMES, "zed"];
    expect(() => firstDaysAfter(facts(seven, { daysPerMember: 1, members: opened(6) }))).toThrow(RangeError);
    expect(() => firstDaysAfter(facts(seven, null, true))).toThrow(RangeError);
    expect(() => firstDaysAfter(facts(["ben", "ben"], { daysPerMember: 2, members: opened(2) }))).toThrow(/once/);
    expect(() => firstDaysAfter(facts(["ben", "maya"], { daysPerMember: 2, members: [] }))).toThrow(/includes/);
  });

  it("throws when an active member the proposal includes isn't among the club's active members", () => {
    expect(() => firstDaysAfter(facts(["ben"], { daysPerMember: 2, members: opened(2) }))).toThrow(/active/);
  });
});
