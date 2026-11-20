import { describe, expect, it } from "vitest";
import { WEEKDAYS, type Weekday } from "./propose.ts";
import {
  pickViewFor,
  pickWeekFacts,
  viewFor,
  type LatestDay,
  type ProposalMember,
  type SlotView,
  type WeekFacts,
} from "./view.ts";

// Sunday people, in the order they joined, each with the weekday the first days proposed for them
// (the contract's fixture, packages/contracts/src/fixtures/world.ts; F01-friends-first-days).
const SUNDAY_PEOPLE: readonly (readonly [string, Weekday])[] = [
  ["ben", "monday"],
  ["maya", "tuesday"],
  ["alex", "wednesday"],
  ["sam", "thursday"],
  ["debby", "friday"],
  ["nina", "saturday"],
];

/** Sunday people's first days: each member holds their proposed day unless `held` says otherwise. */
function sundayPeople(
  held: Partial<Record<string, readonly Weekday[]>> = {},
  confirmed: Partial<Record<string, string>> = {},
  left: readonly string[] = [],
): WeekFacts {
  const firstDates: Partial<Record<Weekday, string>> = {};
  const members: ProposalMember[] = SUNDAY_PEOPLE.map(([id, proposed]) => {
    const days = held[id] ?? [proposed];
    const date = confirmed[id];
    if (date !== undefined) for (const day of days) firstDates[day] = date;
    return { id, active: !left.includes(id), confirmed: date !== undefined, suggested: [proposed], held: days };
  });
  return { daysPerMember: 1, members, firstDates };
}

type Spec = readonly [state: SlotView["state"], who?: string | readonly string[] | undefined, date?: string];
/** The six slots written as the contract's examples write them. */
function slots(viewerSuggested: readonly Weekday[], week: Record<Weekday, Spec>): SlotView[] {
  return WEEKDAYS.map((weekday) => {
    const [state, who, date] = week[weekday];
    return {
      weekday,
      state,
      ...(state === "taken" && typeof who === "string" ? { owner: who } : {}),
      ...(state === "clash" && Array.isArray(who) ? { holders: [...(who as readonly string[])] } : {}),
      ...(state === "available" && typeof who === "string" ? { heldBy: who } : {}),
      ...(date === undefined ? {} : { firstDate: date }),
      suggested: viewerSuggested.includes(weekday),
    };
  });
}

// Tuesday 3 November: Ben and Alex chose Friday, which was proposed for Debby (G04-conflict-three).
const CONFLICT_THREE = sundayPeople({ ben: ["friday"], alex: ["friday"] });
// Thursday 5 November: Maya, Alex, Sam and Nina confirmed on Wednesday at 9 AM (FQ79's fixture).
const FOUR_CONFIRMED = { maya: "2026-11-10", alex: "2026-11-11", sam: "2026-11-12", nina: "2026-11-07" };
const TAKEN_FOUR = {
  tuesday: ["taken", "maya", "2026-11-10"],
  wednesday: ["taken", "alex", "2026-11-11"],
  thursday: ["taken", "sam", "2026-11-12"],
  saturday: ["taken", "nina", "2026-11-07"],
} as const;

describe("what each member sees of the first days (the contract's examples; FQ46, FQ48, FQ55, FQ78)", () => {
  it("G04-conflict-three: Ben, Alex and Debby hold Friday and see each other, in the order they joined", () => {
    expect(viewFor("ben", CONFLICT_THREE)).toEqual({
      slots: slots(["monday"], {
        monday: ["available"],
        tuesday: ["available", "maya"],
        wednesday: ["available"],
        thursday: ["available", "sam"],
        friday: ["clash", ["ben", "alex", "debby"]],
        saturday: ["available", "nina"],
      }),
      myDays: ["friday"],
      myState: "choosing",
    });
  });

  it("G04-contested-other: Sam sees Friday contested, with no names and no count", () => {
    expect(viewFor("sam", CONFLICT_THREE)).toEqual({
      slots: slots(["thursday"], {
        monday: ["available"],
        tuesday: ["available", "maya"],
        wednesday: ["available"],
        thursday: ["yours"],
        friday: ["no_reveal"],
        saturday: ["available", "nina"],
      }),
      myDays: ["thursday"],
      myState: "choosing",
    });
  });

  it("G04-confirm-refused: Alex went back to Wednesday, and Debby still shares Friday with Ben", () => {
    expect(viewFor("debby", sundayPeople({ ben: ["friday"] }))).toEqual({
      slots: slots(["friday"], {
        monday: ["available"],
        tuesday: ["available", "maya"],
        wednesday: ["available", "alex"],
        thursday: ["available", "sam"],
        friday: ["clash", ["ben", "debby"]],
        saturday: ["available", "nina"],
      }),
      myDays: ["friday"],
      myState: "choosing",
    });
  });

  it("chooseScheduleDays' `chosen`: Ben chose Monday, and Friday now has no names for Ben", () => {
    expect(viewFor("ben", sundayPeople({ alex: ["friday"] })).slots).toEqual(
      slots(["monday"], {
        monday: ["yours"],
        tuesday: ["available", "maya"],
        wednesday: ["available"],
        thursday: ["available", "sam"],
        friday: ["no_reveal"],
        saturday: ["available", "nina"],
      }),
    );
  });

  it("chooseScheduleDays' `joined_contest`: Sam chose Friday, sees its holders, and Thursday is free", () => {
    expect(viewFor("sam", sundayPeople({ ben: ["friday"], alex: ["friday"], sam: ["friday"] }))).toEqual({
      slots: slots(["thursday"], {
        monday: ["available"],
        tuesday: ["available", "maya"],
        wednesday: ["available"],
        thursday: ["available"],
        friday: ["clash", ["ben", "alex", "sam", "debby"]],
        saturday: ["available", "nina"],
      }),
      myDays: ["friday"],
      myState: "choosing",
    });
  });

  it("getSchedule's `first_days`: Ben, still choosing, sees four taken days with their dates, and Debby on Friday", () => {
    expect(viewFor("ben", sundayPeople({}, FOUR_CONFIRMED))).toEqual({
      slots: slots(["monday"], { ...TAKEN_FOUR, monday: ["yours"], friday: ["available", "debby"] }),
      myDays: ["monday"],
      myState: "choosing",
    });
  });

  it("getSchedule's `first_days_confirmed`: Maya, who confirmed, sees no name on a day nobody has confirmed", () => {
    expect(viewFor("maya", sundayPeople({}, FOUR_CONFIRMED))).toEqual({
      slots: slots(["tuesday"], {
        ...TAKEN_FOUR,
        tuesday: ["yours", undefined, "2026-11-10"],
        monday: ["available"],
        friday: ["available"],
      }),
      myDays: ["tuesday"],
      myState: "confirmed",
    });
  });

  it("confirmScheduleDays' `first_day_confirmed`: Ben's Monday has its date, and Friday names nobody", () => {
    expect(viewFor("ben", sundayPeople({}, { ...FOUR_CONFIRMED, ben: "2026-11-09" }))).toEqual({
      slots: slots(["monday"], { ...TAKEN_FOUR, monday: ["yours", undefined, "2026-11-09"], friday: ["available"] }),
      myDays: ["monday"],
      myState: "confirmed",
    });
  });

  it("G04-two-days-one-chosen: Ben keeps Monday, and Thursday is free and still proposed for Ben", () => {
    const pair: WeekFacts = {
      daysPerMember: 2,
      members: [
        { id: "ben", active: true, confirmed: false, suggested: ["monday", "thursday"], held: ["monday"] },
        { id: "debby", active: true, confirmed: false, suggested: ["tuesday", "friday"], held: ["tuesday", "friday"] },
      ],
      firstDates: {},
    };
    expect(viewFor("ben", pair)).toEqual({
      slots: slots(["monday", "thursday"], {
        monday: ["yours"],
        tuesday: ["available", "debby"],
        wednesday: ["available"],
        thursday: ["available"],
        friday: ["available", "debby"],
        saturday: ["available"],
      }),
      myDays: ["monday"],
      myState: "choosing",
    });
    // Debby sees Thursday free with no name: only Ben sees it was proposed for Ben (FQ48).
    expect(viewFor("debby", pair).slots[3]).toEqual({ weekday: "thursday", state: "available", suggested: false });
  });

  it("a choice of none holds nothing: every proposed day is free, and my_days is empty", () => {
    const view = viewFor("ben", sundayPeople({ ben: [] }));
    expect(view.myDays).toEqual([]);
    expect(view.slots[0]).toEqual({ weekday: "monday", state: "available", suggested: true });
    expect(viewFor("maya", sundayPeople({ ben: [] })).slots[0]).toEqual({
      weekday: "monday",
      state: "available",
      suggested: false,
    });
  });

  it("a member who left holds nothing; a day they confirmed stays taken by them, with no date (FQ102)", () => {
    // Debby left while holding Friday with Ben: the contest is over, and Ben alone holds it.
    expect(viewFor("ben", sundayPeople({ ben: ["friday"] }, {}, ["debby"])).slots[4]).toEqual({
      weekday: "friday",
      state: "yours",
      suggested: false,
    });
    // Maya confirmed Tuesday and left: it stays Maya's, and opens no more.
    const left = sundayPeople({}, FOUR_CONFIRMED, ["maya"]);
    expect(viewFor("ben", left).slots[1]).toEqual({
      weekday: "tuesday",
      state: "taken",
      owner: "maya",
      suggested: false,
    });
    expect(viewFor("alex", left).slots[1]).toEqual({
      weekday: "tuesday",
      state: "taken",
      owner: "maya",
      suggested: false,
    });
  });

  it("answers only a member the proposal includes who is still active (FQ100; T14)", () => {
    expect(() => viewFor("leila", CONFLICT_THREE)).toThrow(/doesn't include/);
    expect(() => viewFor("debby", sundayPeople({}, {}, ["debby"]))).toThrow(/doesn't include/);
  });
});

describe("what no view of the first days ever carries (T55, T33; FQ46, FQ48)", () => {
  // Every world of four members, each holding none or one of three weekdays, confirmed or not, active
  // or not: 4 holds x 3 states, to the fourth power, less the worlds the commands can't make.
  const DAYS: readonly Weekday[] = ["monday", "tuesday", "wednesday"];
  const IDS = ["a", "b", "c", "d"];
  type One = { held: readonly Weekday[]; confirmed: boolean; active: boolean };
  const options: One[] = [];
  for (const held of [[], ...DAYS.map((day) => [day])] as Weekday[][]) {
    options.push({ held, confirmed: false, active: true });
    options.push({ held, confirmed: false, active: false });
    if (held.length === 1) {
      options.push({ held, confirmed: true, active: true });
      options.push({ held, confirmed: true, active: false });
    }
  }
  const worlds: WeekFacts[] = [];
  const build = (chosen: One[]): void => {
    if (chosen.length === IDS.length) {
      // A confirmed day is confirmed once, and no active member still holds it (FQ55).
      for (const day of DAYS) {
        const confirmers = chosen.filter((one) => one.confirmed && one.held.includes(day));
        const holders = chosen.filter((one) => !one.confirmed && one.active && one.held.includes(day));
        if (confirmers.length > 1 || (confirmers.length === 1 && holders.length > 0)) return;
      }
      const firstDates: Partial<Record<Weekday, string>> = {};
      chosen.forEach((one) => {
        if (one.confirmed && one.active) for (const day of one.held) firstDates[day] = "2026-11-09";
      });
      worlds.push({
        daysPerMember: 1,
        members: chosen.map((one, index) => ({
          id: IDS[index] ?? "?",
          suggested: [DAYS[index % 3] ?? "monday"],
          ...one,
        })),
        firstDates,
      });
      return;
    }
    for (const option of options) build([...chosen, option]);
  };
  build([]);

  it("covers thousands of worlds", () => {
    expect(worlds.length).toBeGreaterThan(5_000);
  });

  it("holds in every world, for every viewer", () => {
    // Plain comparisons, gathered: millions of `expect` calls would take minutes.
    const problems: string[] = [];
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    let views = 0;
    for (const world of worlds) {
      for (const viewer of world.members) {
        if (!viewer.active) {
          expect(() => viewFor(viewer.id, world)).toThrow();
          continue;
        }
        views += 1;
        const view = viewFor(viewer.id, world);
        const wrong = (what: string) => {
          if (problems.length < 5) problems.push(`${what}: ${viewer.id} in ${JSON.stringify(world.members)}`);
        };
        if (
          !same(
            view.slots.map((slot) => slot.weekday),
            WEEKDAYS,
          )
        )
          wrong("the six weekdays");
        if (view.myState !== (viewer.confirmed ? "confirmed" : "choosing")) wrong("my_state");
        if (
          !same(
            view.myDays,
            WEEKDAYS.filter((day) => viewer.held.includes(day)),
          )
        )
          wrong("my_days");
        for (const slot of view.slots) {
          const others = world.members.filter((member) => member.id !== viewer.id);
          const confirmer = world.members.find((member) => member.confirmed && member.held.includes(slot.weekday));
          const holding = (member: ProposalMember) =>
            member.active && !member.confirmed && member.held.includes(slot.weekday);
          const otherHolders = others.filter(holding);
          // One state from the facts, and nothing else decides it.
          const state =
            confirmer !== undefined
              ? confirmer.id === viewer.id
                ? "yours"
                : "taken"
              : holding(viewer)
                ? otherHolders.length > 0
                  ? "clash"
                  : "yours"
                : otherHolders.length >= 2
                  ? "no_reveal"
                  : "available";
          if (slot.state !== state) wrong(`${slot.weekday}'s state`);
          // A name only where the contract gives this viewer one.
          if (slot.owner !== (state === "taken" ? confirmer?.id : undefined)) wrong("owner");
          const holders = state === "clash" ? world.members.filter(holding).map((member) => member.id) : undefined;
          if (!same(slot.holders, holders)) wrong("holders");
          const heldBy =
            state === "available" && !viewer.confirmed && otherHolders.length === 1 ? otherHolders[0]?.id : undefined;
          if (slot.heldBy !== heldBy) wrong("held_by");
          if (slot.heldBy === viewer.id) wrong("held_by names the viewer");
          if (state === "no_reveal" && !same(Object.keys(slot).sort(), ["state", "suggested", "weekday"])) {
            wrong("a contested day's fields");
          }
          // A date only on a confirmed day whose owner is still a member (T49, FQ102).
          if (slot.firstDate !== (confirmer?.active === true ? "2026-11-09" : undefined)) wrong("first_date");
          if (slot.suggested !== viewer.suggested.includes(slot.weekday)) wrong("suggested");
        }
      }
    }
    expect(problems).toEqual([]);
    expect(views).toBeGreaterThan(10_000);
  });
});

describe("a membership change's view: a new member's pick (FQ125 to FQ127, FQ130; the contract's `new_member` scene)", () => {
  // Kitchen table's week after Leila joins: five members with a day each, Friday free (world.ts, kitchenTable).
  const LATEST: readonly LatestDay[] = [
    { weekday: "monday", star: "ben", starActive: true, firstDate: "2026-09-07" },
    { weekday: "tuesday", star: "alex", starActive: true, firstDate: "2026-09-08" },
    { weekday: "wednesday", star: "sam", starActive: true, firstDate: "2026-09-09" },
    { weekday: "thursday", star: "nina", starActive: true, firstDate: "2026-09-10" },
    { weekday: "saturday", star: "maya", starActive: true, firstDate: "2026-09-12" },
  ];
  const leila = (over: Partial<ProposalMember> = {}): ProposalMember => ({
    id: "leila",
    active: true,
    confirmed: false,
    suggested: ["friday"],
    held: ["friday"],
    ...over,
  });

  it("makes every day of the week in force its member's, and leaves the free day to those the pick includes", () => {
    const facts = pickWeekFacts(1, [leila()], LATEST);
    expect(facts.members.map((member) => [member.id, member.confirmed, member.held])).toEqual([
      ["leila", false, ["friday"]],
      ["ben", true, ["monday"]],
      ["alex", true, ["tuesday"]],
      ["sam", true, ["wednesday"]],
      ["nina", true, ["thursday"]],
      ["maya", true, ["saturday"]],
    ]);
    expect(pickViewFor("leila", facts)).toEqual({
      slots: [
        { weekday: "monday", state: "taken", owner: "ben", suggested: false },
        { weekday: "tuesday", state: "taken", owner: "alex", suggested: false },
        { weekday: "wednesday", state: "taken", owner: "sam", suggested: false },
        { weekday: "thursday", state: "taken", owner: "nina", suggested: false },
        { weekday: "friday", state: "yours", suggested: true },
        { weekday: "saturday", state: "taken", owner: "maya", suggested: false },
      ],
      myDays: ["friday"],
      myState: "choosing",
    });
  });

  it("dates only the viewer's own confirmed day, from the latest week (FQ130)", () => {
    const confirmed = [
      ...LATEST,
      { weekday: "friday" as const, star: "leila", starActive: true, firstDate: "2026-11-13" },
    ];
    const facts = pickWeekFacts(1, [leila({ confirmed: true })], confirmed);
    const view = pickViewFor("leila", facts);
    expect(view.myState).toBe("confirmed");
    expect(view.slots.find((slot) => slot.weekday === "friday")).toEqual({
      weekday: "friday",
      state: "yours",
      firstDate: "2026-11-13",
      suggested: true,
    });
    expect(view.slots.filter((slot) => slot.firstDate !== undefined)).toHaveLength(1);
  });

  it("shows two new members' holds as the first days do: held_by while choosing, a contest by name (FQ46, FQ48)", () => {
    const pair = [
      { weekday: "monday" as const, star: "ben", starActive: true, firstDate: "2026-09-07" },
      { weekday: "tuesday" as const, star: "debby", starActive: true, firstDate: "2026-09-08" },
      { weekday: "wednesday" as const, star: "maya", starActive: true, firstDate: "2026-09-09" },
    ];
    const sam: ProposalMember = {
      id: "sam",
      active: true,
      confirmed: false,
      suggested: ["thursday"],
      held: ["thursday"],
    };
    const nina: ProposalMember = {
      id: "nina",
      active: true,
      confirmed: false,
      suggested: ["friday"],
      held: ["friday"],
    };
    const apart = pickWeekFacts(1, [sam, nina], pair);
    expect(pickViewFor("sam", apart).slots.find((slot) => slot.weekday === "friday")).toEqual({
      weekday: "friday",
      state: "available",
      heldBy: "nina",
      suggested: false,
    });
    const together = pickWeekFacts(1, [sam, { ...nina, held: ["thursday"] }], pair);
    expect(pickViewFor("sam", together).slots.find((slot) => slot.weekday === "thursday")).toEqual({
      weekday: "thursday",
      state: "clash",
      holders: ["sam", "nina"],
      suggested: true,
    });
    // Once Nina confirms Thursday, it is in the week: taken by Nina, undated, for Sam.
    const ninas = [...pair, { weekday: "thursday" as const, star: "nina", starActive: true, firstDate: "2026-11-19" }];
    const taken = pickWeekFacts(
      1,
      [
        { ...sam, held: ["friday"] },
        { ...nina, held: ["thursday"], confirmed: true },
      ],
      ninas,
    );
    expect(pickViewFor("sam", taken).slots.find((slot) => slot.weekday === "thursday")).toEqual({
      weekday: "thursday",
      state: "taken",
      owner: "nina",
      suggested: true,
    });
  });

  it("frees the days of a member who left, of the week or of the pick (FQ125, FQ129)", () => {
    const withLeaver = LATEST.map((day) => (day.star === "maya" ? { ...day, starActive: false } : day));
    const sam: ProposalMember = {
      id: "sam",
      active: false,
      confirmed: true,
      suggested: ["thursday"],
      held: ["thursday"],
    };
    const facts = pickWeekFacts(
      1,
      [leila(), sam],
      [
        ...withLeaver.filter((day) => day.star !== "nina"),
        { weekday: "thursday", star: "sam", starActive: false, firstDate: "2026-11-19" },
      ],
    );
    const view = pickViewFor("leila", facts);
    expect(view.slots.find((slot) => slot.weekday === "saturday")).toEqual({
      weekday: "saturday",
      state: "available",
      suggested: false,
    });
    expect(view.slots.find((slot) => slot.weekday === "thursday")).toEqual({
      weekday: "thursday",
      state: "available",
      suggested: false,
    });
    expect(facts.firstDates).toEqual({
      monday: "2026-09-07",
      tuesday: "2026-09-08",
      wednesday: "2026-09-09",
    });
  });

  it("refuses a viewer the pick doesn't include: a member already in the week, or one who left (T14)", () => {
    expect(() => pickViewFor("ben", pickWeekFacts(1, [leila()], LATEST))).toThrow();
    expect(() => pickViewFor("leila", pickWeekFacts(1, [leila({ active: false })], LATEST))).toThrow();
  });
});
