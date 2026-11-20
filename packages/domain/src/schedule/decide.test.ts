import { describe, expect, it } from "vitest";
import { everyoneConfirmed, judgeChoice, judgeConfirmation } from "./decide.ts";
import type { Weekday } from "./propose.ts";
import { pickWeekFacts, type ProposalMember, type WeekFacts } from "./view.ts";

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

describe("a new member's choice and confirmation in a membership change, on the pick's facts (FQ125, FQ127)", () => {
  // Three members already in the week, one day each after a fourth joined; Sam and Nina pick.
  const LATEST = [
    { weekday: "monday" as const, star: "ben", starActive: true, firstDate: "2026-09-07" },
    { weekday: "tuesday" as const, star: "debby", starActive: true, firstDate: "2026-09-08" },
    { weekday: "wednesday" as const, star: "maya", starActive: false, firstDate: "2026-09-09" },
  ];
  const PICK = pickWeekFacts(
    1,
    [member("sam", ["thursday"]), member("nina", ["thursday"], { suggested: ["friday"] })],
    LATEST,
  );

  it("never takes a day of the week in force, and takes a free one, a leaver's too", () => {
    expect(judgeChoice("sam", PICK, ["monday"])).toBe("NOT_ALLOWED");
    expect(judgeChoice("sam", PICK, ["tuesday"])).toBe("NOT_ALLOWED");
    expect(judgeChoice("sam", PICK, ["wednesday"])).toEqual({ held: ["wednesday"] });
    expect(judgeChoice("sam", PICK, ["saturday"])).toEqual({ held: ["saturday"] });
    expect(judgeChoice("sam", PICK, [])).toEqual({ held: [] });
    expect(judgeChoice("sam", PICK, ["friday", "saturday"])).toBe("NOT_ALLOWED");
  });

  it("confirms only exactly the days held, none contested, and nothing for a member already in the week", () => {
    expect(judgeConfirmation("sam", PICK, ["thursday"])).toBe("NOT_ALLOWED");
    const apart = pickWeekFacts(1, [member("sam", ["thursday"]), member("nina", ["friday"])], LATEST);
    expect(judgeConfirmation("sam", apart, ["thursday"])).toEqual({ days: ["thursday"] });
    expect(judgeConfirmation("sam", apart, ["friday"])).toBe("NOT_ALLOWED");
    expect(() => judgeConfirmation("ben", apart, ["monday"])).toThrow();
    expect(() => judgeChoice("debby", apart, ["friday"])).toThrow();
  });

  it("applies once every member it includes who is still a member has confirmed", () => {
    expect(everyoneConfirmed(pickWeekFacts(1, [member("sam", ["thursday"], { confirmed: true })], LATEST))).toBe(true);
    expect(
      everyoneConfirmed(
        pickWeekFacts(1, [member("sam", ["thursday"], { confirmed: true }), member("nina", ["friday"])], LATEST),
      ),
    ).toBe(false);
    // Nobody it includes is left: nothing applies, whoever is in the week.
    expect(everyoneConfirmed(pickWeekFacts(1, [member("sam", ["thursday"], { active: false })], LATEST))).toBe(false);
  });
});
