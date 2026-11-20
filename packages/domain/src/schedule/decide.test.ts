import { describe, expect, it } from "vitest";
import { everyoneConfirmed, judgeChangeConfirmation, judgeChoice, judgeConfirmation } from "./decide.ts";
import type { Weekday } from "./propose.ts";
import type { ProposalMember, WeekFacts } from "./view.ts";

const member = (
  id: string,
  held: readonly Weekday[],
  extra: Partial<Pick<ProposalMember, "active" | "confirmed" | "suggested">> = {},
): ProposalMember => ({ id, active: true, confirmed: false, suggested: held, held, ...extra });

/** Four members, one day each: Ben and Debby both hold Friday, Maya has confirmed Tuesday. */
const FOUR: WeekFacts = {
  daysPerMember: 1,
  members: [
    member("ben", ["friday"], { suggested: ["monday"] }),
    member("maya", ["tuesday"], { confirmed: true }),
    member("sam", ["thursday"]),
    member("debby", ["friday"]),
  ],
  firstDates: { tuesday: "2026-11-10" },
};
/** A pair, two days each: Ben holds Monday and Thursday, Debby holds Thursday and Friday. */
const PAIR: WeekFacts = {
  daysPerMember: 2,
  members: [
    member("ben", ["monday", "thursday"]),
    member("debby", ["thursday", "friday"], { suggested: ["tuesday", "friday"] }),
  ],
  firstDates: {},
};

describe("a choice of days in the first days (the contract's ScheduleChoiceRequest; FQ48, FQ55, FQ57)", () => {
  it("takes any day nobody has confirmed: free, held by one other, contested, or the caller's own", () => {
    expect(judgeChoice("sam", FOUR, ["monday"])).toEqual({ held: ["monday"] });
    expect(judgeChoice("sam", FOUR, ["thursday"])).toEqual({ held: ["thursday"] });
    // Joining a contested day, and keeping one: nobody is asked to give way (FQ55).
    expect(judgeChoice("sam", FOUR, ["friday"])).toEqual({ held: ["friday"] });
    expect(judgeChoice("ben", FOUR, ["friday"])).toEqual({ held: ["friday"] });
  });

  it("takes none, the two-day picker's last removal (handoff 6), and fewer than days_per_member", () => {
    expect(judgeChoice("sam", FOUR, [])).toEqual({ held: [] });
    expect(judgeChoice("ben", PAIR, [])).toEqual({ held: [] });
    expect(judgeChoice("ben", PAIR, ["monday"])).toEqual({ held: ["monday"] });
  });

  it("answers the days from Monday, whatever order they came in", () => {
    expect(judgeChoice("ben", PAIR, ["saturday", "tuesday"])).toEqual({ held: ["tuesday", "saturday"] });
  });

  it("refuses a day another member has confirmed (G04.error.chooseTaken)", () => {
    expect(judgeChoice("sam", FOUR, ["tuesday"])).toBe("NOT_ALLOWED");
    const pairTaken: WeekFacts = {
      ...PAIR,
      members: [member("ben", ["monday", "thursday"], { confirmed: true }), member("debby", ["tuesday", "friday"])],
    };
    expect(judgeChoice("debby", pairTaken, ["tuesday", "thursday"])).toBe("NOT_ALLOWED");
  });

  it("refuses more days than days_per_member", () => {
    expect(judgeChoice("sam", FOUR, ["monday", "wednesday"])).toBe("NOT_ALLOWED");
  });

  it("refuses any choice after the caller confirmed, their own day too (FQ57)", () => {
    expect(judgeChoice("maya", FOUR, ["tuesday"])).toBe("NOT_ALLOWED");
    expect(judgeChoice("maya", FOUR, ["monday"])).toBe("NOT_ALLOWED");
    expect(judgeChoice("maya", FOUR, [])).toBe("NOT_ALLOWED");
  });

  it("refuses a day a member who left had confirmed: it stays that member's (FQ102)", () => {
    const left: WeekFacts = {
      ...FOUR,
      members: FOUR.members.map((one) => (one.id === "maya" ? { ...one, active: false } : one)),
      firstDates: {},
    };
    expect(judgeChoice("sam", left, ["tuesday"])).toBe("NOT_ALLOWED");
  });

  it("throws on what the contract refuses first, and for a caller the proposal doesn't include", () => {
    expect(() => judgeChoice("sam", FOUR, ["monday", "monday"] as Weekday[])).toThrow(/once/);
    expect(() => judgeChoice("sam", FOUR, ["sunday" as Weekday])).toThrow(/weekday/);
    expect(() => judgeChoice("ben", PAIR, ["monday", "tuesday", "friday"])).toThrow(/two/);
    expect(() => judgeChoice("leila", FOUR, ["monday"])).toThrow(/doesn't include/);
  });
});

describe("a confirmation in the first days (the contract's ScheduleConfirmRequest; book p11; FQ55, FQ99)", () => {
  it("confirms exactly the days the caller holds, when nobody else holds them", () => {
    expect(judgeConfirmation("sam", FOUR, ["thursday"])).toEqual({ days: ["thursday"] });
    const pair: WeekFacts = {
      ...PAIR,
      members: [member("ben", ["monday", "thursday"]), member("debby", ["tuesday", "friday"])],
    };
    expect(judgeConfirmation("ben", pair, ["thursday", "monday"])).toEqual({ days: ["monday", "thursday"] });
  });

  it("refuses a day another member holds too, even by proposal alone (FQ55; G04-confirm-refused)", () => {
    expect(judgeConfirmation("ben", FOUR, ["friday"])).toBe("NOT_ALLOWED");
    expect(judgeConfirmation("debby", FOUR, ["friday"])).toBe("NOT_ALLOWED");
  });

  it("refuses both days when one is contested: nobody confirms one day alone (FQ99)", () => {
    expect(judgeConfirmation("ben", PAIR, ["monday", "thursday"])).toBe("NOT_ALLOWED");
    expect(judgeConfirmation("ben", PAIR, ["monday"])).toBe("NOT_ALLOWED");
    expect(judgeConfirmation("debby", PAIR, ["thursday", "friday"])).toBe("NOT_ALLOWED");
  });

  it("refuses days that aren't exactly what the caller holds: the caller saw another choice", () => {
    expect(judgeConfirmation("sam", FOUR, ["monday"])).toBe("NOT_ALLOWED");
    const pair: WeekFacts = {
      ...PAIR,
      members: [member("ben", ["monday", "thursday"]), member("debby", ["tuesday", "friday"])],
    };
    expect(judgeConfirmation("ben", pair, ["monday"])).toBe("NOT_ALLOWED");
    expect(judgeConfirmation("ben", pair, ["monday", "wednesday"])).toBe("NOT_ALLOWED");
  });

  it("refuses fewer days than days_per_member, held and named alike (book p11: only for two choices)", () => {
    const one: WeekFacts = { ...PAIR, members: [member("ben", ["monday"]), member("debby", ["tuesday", "friday"])] };
    expect(judgeConfirmation("ben", one, ["monday"])).toBe("NOT_ALLOWED");
  });

  it("refuses a second confirmation, and a day another member confirmed meanwhile (G04.error.confirmTaken)", () => {
    expect(judgeConfirmation("maya", FOUR, ["tuesday"])).toBe("NOT_ALLOWED");
    // Sam's own choice moved to Tuesday on another device, which Maya then confirmed: the commands can't
    // make this, and the rule refuses it all the same.
    const taken: WeekFacts = {
      ...FOUR,
      members: FOUR.members.map((one) => (one.id === "sam" ? { ...one, held: ["tuesday"] } : one)),
    };
    expect(judgeConfirmation("sam", taken, ["tuesday"])).toBe("NOT_ALLOWED");
  });

  it("lets the one holder left confirm once a member who left no longer holds the day (FQ102)", () => {
    const left: WeekFacts = {
      ...FOUR,
      members: FOUR.members.map((one) => (one.id === "debby" ? { ...one, active: false } : one)),
    };
    expect(judgeConfirmation("ben", left, ["friday"])).toEqual({ days: ["friday"] });
  });

  it("throws on what the contract refuses first, and for a caller the proposal doesn't include", () => {
    expect(() => judgeConfirmation("sam", FOUR, [])).toThrow(/one or two/);
    expect(() => judgeConfirmation("sam", FOUR, ["thursday", "thursday"] as Weekday[])).toThrow(/once/);
    expect(() => judgeConfirmation("leila", FOUR, ["monday"])).toThrow(/doesn't include/);
  });
});

describe("when the first days apply (the contract's ScheduleProposal; FQ100, FQ102)", () => {
  it("is when every member they include who is still active has confirmed", () => {
    expect(everyoneConfirmed(FOUR)).toBe(false);
    const all: WeekFacts = {
      ...FOUR,
      members: FOUR.members.map((one, index) => ({
        ...one,
        confirmed: true,
        held: [(["monday", "tuesday", "thursday", "friday"] as const)[index] ?? "monday"],
      })),
    };
    expect(everyoneConfirmed(all)).toBe(true);
  });

  it("doesn't wait for a member who left, and never applies with nobody left to have confirmed", () => {
    const leftUnconfirmed: WeekFacts = {
      daysPerMember: 1,
      members: [member("ben", ["monday"], { confirmed: true }), member("sam", ["thursday"], { active: false })],
      firstDates: {},
    };
    expect(everyoneConfirmed(leftUnconfirmed)).toBe(true);
    const nobody: WeekFacts = {
      daysPerMember: 1,
      members: [member("ben", ["monday"], { confirmed: true, active: false })],
      firstDates: {},
    };
    expect(everyoneConfirmed(nobody)).toBe(false);
  });
});

describe("a membership change's confirmation (the contract's ScheduleConfirmRequest; FQ56, FQ81)", () => {
  /** A change for three, two days each, proposed and held; Maya has confirmed. */
  const CHANGE: WeekFacts = {
    daysPerMember: 2,
    members: [
      member("ben", ["monday", "thursday"]),
      member("debby", ["tuesday", "friday"]),
      member("maya", ["wednesday", "saturday"], { confirmed: true }),
    ],
    firstDates: {},
  };

  it("takes exactly the days the change proposes for the caller, in any order", () => {
    expect(judgeChangeConfirmation("ben", CHANGE, ["monday", "thursday"])).toBeNull();
    expect(judgeChangeConfirmation("ben", CHANGE, ["thursday", "monday"])).toBeNull();
    expect(judgeChangeConfirmation("debby", CHANGE, ["tuesday", "friday"])).toBeNull();
  });

  it("refuses any other days: another member's, one of each, too few", () => {
    expect(judgeChangeConfirmation("ben", CHANGE, ["tuesday", "friday"])).toBe("NOT_ALLOWED");
    expect(judgeChangeConfirmation("ben", CHANGE, ["monday", "friday"])).toBe("NOT_ALLOWED");
    expect(judgeChangeConfirmation("ben", CHANGE, ["monday"])).toBe("NOT_ALLOWED");
  });

  it("throws on what the contract's schema refuses before any rule: none, three, a day twice", () => {
    expect(() => judgeChangeConfirmation("ben", CHANGE, [])).toThrow(RangeError);
    expect(() => judgeChangeConfirmation("ben", CHANGE, ["monday", "tuesday", "thursday"])).toThrow(RangeError);
    expect(() => judgeChangeConfirmation("ben", CHANGE, ["monday", "monday"])).toThrow(RangeError);
  });

  it("refuses a second confirmation, though the days are the caller's own", () => {
    expect(judgeChangeConfirmation("maya", CHANGE, ["wednesday", "saturday"])).toBe("NOT_ALLOWED");
  });

  it("refuses a caller the change doesn't include, as the first days do", () => {
    expect(() => judgeChangeConfirmation("alex", CHANGE, ["monday", "thursday"])).toThrow();
  });
});
