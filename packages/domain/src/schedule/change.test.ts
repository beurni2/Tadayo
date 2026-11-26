/// <reference lib="esnext.temporal" />
// A new member's days once a club's first days have applied (spec 05; FQ16, FQ79, FQ100, FQ125 to FQ127,
// FQ129 to FQ131; docs/plans/api-b2-new-member-day.md, sections 1 and 4).

import { describe, expect, it } from "vitest";
import type { ServerNow } from "../time/clock.ts";
import {
  newMemberFirstDate,
  nextMonday,
  nextWeekStart,
  pickAfter,
  type PickFacts,
  type PickMember,
  type WeekDay,
} from "./change.ts";
import type { Weekday } from "./propose.ts";

const D = (date: string): Temporal.PlainDate => Temporal.PlainDate.from(date);
const NEW_YORK = "America/New_York";
/** A confirmation's time, as the clock samples it, from the club's own wall time in New York. */
const at = (wall: string) => Temporal.PlainDateTime.from(wall).toZonedDateTime(NEW_YORK).toInstant() as ServerNow;

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
/** Two days each for two. */
const TWO = week(["monday", "ben"], ["tuesday", "debby"], ["thursday", "ben"], ["friday", "debby"]);

function facts(over: Partial<PickFacts>): PickFacts {
  return { active: ["ben", "debby", "maya", "alex"], firstDaysOpen: false, week: FOUR, open: null, ...over };
}

const member = (id: string, held: readonly Weekday[], confirmed = false): PickMember => ({ id, held, confirmed });

describe("pickAfter: who is asked, and nothing else (FQ125, FQ126)", () => {
  it("asks nothing while the first days are open or never applied: their own rule decides (FQ102)", () => {
    expect(pickAfter(facts({ active: ["ben", "debby", "maya", "alex", "sam"], firstDaysOpen: true }))).toEqual({
      freed: [],
      proposal: { kind: "nothing" },
    });
    expect(pickAfter(facts({ active: ["ben", "debby", "maya", "alex", "sam"], week: null }))).toEqual({
      freed: [],
      proposal: { kind: "nothing" },
    });
  });

  it("asks nothing when every active member has a day in the week, after a leave too (FQ125, FQ131)", () => {
    expect(pickAfter(facts({}))).toEqual({ freed: [], proposal: { kind: "nothing" } });
    // Alex left: Thursday is free, and the three who stay keep one day each, though spec 05 gives three two.
    expect(pickAfter(facts({ active: ["ben", "debby", "maya"] }))).toEqual({
      freed: [],
      proposal: { kind: "nothing" },
    });
    // Debby left a club of three: Ben and Maya keep their two days each, and Debby's are free.
    expect(pickAfter(facts({ active: ["ben", "maya"], week: THREE }))).toEqual({
      freed: [],
      proposal: { kind: "nothing" },
    });
  });

  it("opens a pick for a new member alone, with spec 05's number of free days for the club's size (FQ127, FQ131)", () => {
    // A fifth member: one day, the table's day for their place (Friday), which is free.
    expect(pickAfter(facts({ active: ["ben", "debby", "maya", "alex", "sam"] }))).toEqual({
      freed: [],
      proposal: { kind: "open", replaces: false, daysPerMember: 1, proposed: [{ id: "sam", days: ["friday"] }] },
    });
    // A third member of a club of two: two days, the two the others don't have.
    expect(pickAfter(facts({ active: ["ben", "debby", "maya"], week: TWO }))).toEqual({
      freed: [],
      proposal: {
        kind: "open",
        replaces: false,
        daysPerMember: 2,
        proposed: [{ id: "maya", days: ["wednesday", "saturday"] }],
      },
    });
  });

  it("gives a new member the first free days from Monday when the table's day for their place is someone's", () => {
    // Five members whose days aren't the table's: the sixth's place is Saturday, which Sam has, and Monday
    // is Ben's, so the first free day is Tuesday.
    const five = week(
      ["monday", "ben"],
      ["wednesday", "debby"],
      ["thursday", "maya"],
      ["friday", "alex"],
      ["saturday", "sam"],
    );
    expect(pickAfter(facts({ active: ["ben", "debby", "maya", "alex", "sam", "nina"], week: five }))).toEqual({
      freed: [],
      proposal: { kind: "open", replaces: false, daysPerMember: 1, proposed: [{ id: "nina", days: ["tuesday"] }] },
    });
  });

  it("gives two who join at once different free days, in the order they joined", () => {
    expect(pickAfter(facts({ active: ["ben", "debby", "maya", "alex", "sam", "nina"] }))).toEqual({
      freed: [],
      proposal: {
        kind: "open",
        replaces: false,
        daysPerMember: 1,
        proposed: [
          { id: "sam", days: ["friday"] },
          { id: "nina", days: ["saturday"] },
        ],
      },
    });
  });

  it("includes a member of the first days' late joiners with no day, and a leaver's day is free (FQ100, FQ102)", () => {
    // Maya confirmed Wednesday in the first days and left; Alex joined after the first confirmation.
    const withLeaver = week(["monday", "ben"], ["tuesday", "debby"], ["wednesday", "maya"]);
    expect(pickAfter(facts({ active: ["ben", "debby", "alex", "sam"], week: withLeaver }))).toEqual({
      freed: [],
      proposal: {
        kind: "open",
        replaces: false,
        daysPerMember: 1,
        proposed: [
          { id: "alex", days: ["wednesday"] },
          { id: "sam", days: ["thursday"] },
        ],
      },
    });
  });
});

describe("pickAfter: a fourth member frees a day now (FQ131, the founder's answer)", () => {
  it("keeps each member's first day from Monday and frees the others, for a fourth member to pick from", () => {
    expect(pickAfter(facts({ active: ["ben", "debby", "maya", "alex"], week: THREE }))).toEqual({
      freed: week(["thursday", "ben"], ["friday", "debby"], ["saturday", "maya"]),
      proposal: { kind: "open", replaces: false, daysPerMember: 1, proposed: [{ id: "alex", days: ["thursday"] }] },
    });
  });

  it("frees by the days each has, not the table's: the earlier day from Monday stays", () => {
    const chosen = week(
      ["tuesday", "ben"],
      ["saturday", "ben"],
      ["monday", "debby"],
      ["wednesday", "debby"],
      ["thursday", "maya"],
      ["friday", "maya"],
    );
    expect(pickAfter(facts({ active: ["ben", "debby", "maya", "alex"], week: chosen })).freed).toEqual(
      week(["saturday", "ben"], ["wednesday", "debby"], ["friday", "maya"]),
    );
  });

  it("frees nothing where the free days are enough for the new members, and nothing in a club of three or fewer", () => {
    // Two joined by two at once: four members, and Wednesday and Saturday are free for the two of them,
    // so Ben and Debby keep both their days (FQ125).
    expect(pickAfter(facts({ active: ["ben", "debby", "alex", "sam"], week: TWO }))).toEqual({
      freed: [],
      proposal: {
        kind: "open",
        replaces: false,
        daysPerMember: 1,
        proposed: [
          { id: "alex", days: ["wednesday"] },
          { id: "sam", days: ["saturday"] },
        ],
      },
    });
    expect(pickAfter(facts({ active: ["ben", "debby", "maya"], week: TWO })).freed).toEqual([]);
    // Debby and Maya left: their four days are free for three new members, and Ben keeps both days.
    expect(pickAfter(facts({ active: ["ben", "alex", "sam", "nina"], week: THREE })).freed).toEqual([]);
  });

  it("frees the days beyond each member's first wherever the free days are too few, as two joined by three", () => {
    // Two free days for three new members: Ben and Debby keep their first days, Thursday and Friday are freed.
    expect(pickAfter(facts({ active: ["ben", "debby", "alex", "sam", "nina"], week: TWO })).freed).toEqual(
      week(["thursday", "ben"], ["friday", "debby"]),
    );
  });

  it("frees nothing in a paused club, which asks nobody anything (FQ16)", () => {
    expect(pickAfter(facts({ active: ["ben"], week: THREE }))).toEqual({ freed: [], proposal: { kind: "nothing" } });
  });
});

describe("pickAfter: an open pick through joins and leaves", () => {
  const open = (members: readonly PickMember[], daysPerMember: 1 | 2 = 1) => ({ daysPerMember, members });

  it("adds a member who joins while it is open, with free days nobody it includes holds", () => {
    const five = ["ben", "debby", "maya", "alex", "sam"];
    // Sam holds Friday; Nina's place is Saturday, free and unheld.
    expect(pickAfter(facts({ active: [...five, "nina"], open: open([member("sam", ["friday"])]) }))).toEqual({
      freed: [],
      proposal: { kind: "add", members: [{ id: "nina", days: ["saturday"] }] },
    });
    // Sam chose Saturday: Nina gets the first free day nobody holds, Friday.
    expect(pickAfter(facts({ active: [...five, "nina"], open: open([member("sam", ["saturday"])]) }))).toEqual({
      freed: [],
      proposal: { kind: "add", members: [{ id: "nina", days: ["friday"] }] },
    });
  });

  it("changes nothing while those it includes are still choosing, and no version moves (T33)", () => {
    const five = ["ben", "debby", "maya", "alex", "sam"];
    expect(pickAfter(facts({ active: five, open: open([member("sam", ["friday"])]) }))).toEqual({
      freed: [],
      proposal: { kind: "nothing" },
    });
    // A member already in the week leaves: their day is free in the pick, and nothing is written.
    expect(
      pickAfter(facts({ active: ["ben", "debby", "alex", "sam"], open: open([member("sam", ["friday"])]) })),
    ).toEqual({ freed: [], proposal: { kind: "nothing" } });
  });

  it("applies when everyone it includes who is still a member has confirmed, as on a leave", () => {
    // Sam confirmed Friday, so Friday is Sam's in the week; Nina left without confirming.
    const sams = [...FOUR, { weekday: "friday" as const, star: "sam" }];
    expect(
      pickAfter(
        facts({
          active: ["ben", "debby", "maya", "alex", "sam"],
          week: sams,
          open: open([member("sam", ["friday"], true), member("nina", ["saturday"])]),
        }),
      ),
    ).toEqual({ freed: [], proposal: { kind: "apply" } });
  });

  it("ends with no successor when nobody it includes is still a member, or the club is paused (FQ16)", () => {
    expect(
      pickAfter(facts({ active: ["ben", "debby", "maya", "alex"], open: open([member("sam", ["friday"])]) })),
    ).toEqual({ freed: [], proposal: { kind: "drop" } });
    expect(pickAfter(facts({ active: ["ben"], open: open([member("sam", ["friday"])]) }))).toEqual({
      freed: [],
      proposal: { kind: "drop" },
    });
  });

  it("opens a new pick in its place when the club's size changes the days each takes (FQ131)", () => {
    // Maya picks two days in a club of three, and Alex joins before Maya confirms: one day each now, for
    // both of them, from the two free days, so nobody's day is freed (FQ125).
    expect(
      pickAfter(
        facts({
          active: ["ben", "debby", "maya", "alex"],
          week: TWO,
          open: open([member("maya", ["wednesday", "saturday"])], 2),
        }),
      ),
    ).toEqual({
      freed: [],
      proposal: {
        kind: "open",
        replaces: true,
        daysPerMember: 1,
        proposed: [
          { id: "maya", days: ["wednesday"] },
          { id: "alex", days: ["saturday"] },
        ],
      },
    });
    // Alex picks one day in a club of four, where Ben and Debby kept one day each, and Maya leaves: two
    // days each for three, so two for Alex, and Ben and Debby keep theirs (FQ125).
    const kept = week(["monday", "ben"], ["tuesday", "debby"]);
    expect(
      pickAfter(facts({ active: ["ben", "debby", "alex"], week: kept, open: open([member("alex", ["wednesday"])]) })),
    ).toEqual({
      freed: [],
      proposal: {
        kind: "open",
        replaces: true,
        daysPerMember: 2,
        proposed: [{ id: "alex", days: ["wednesday", "saturday"] }],
      },
    });
  });

  it("keeps what each member held when a new pick takes the place of theirs, as far as the new number allows (FQ125, FQ126)", () => {
    // Maya chose only Saturday of Maya's two in a club of three, and Alex joins: one day each, and Maya's is
    // the Saturday Maya chose, never the newcomer's; Alex gets the other free day.
    expect(
      pickAfter(
        facts({ active: ["ben", "debby", "maya", "alex"], week: TWO, open: open([member("maya", ["saturday"])], 2) }),
      ),
    ).toEqual({
      freed: [],
      proposal: {
        kind: "open",
        replaces: true,
        daysPerMember: 1,
        proposed: [
          { id: "maya", days: ["saturday"] },
          { id: "alex", days: ["wednesday"] },
        ],
      },
    });
    // Ben leaves a club of four where Debby kept Tuesday, and Alex and Sam were picking a day each: two days
    // each for three. Each keeps the day they held and gets one more, the table's for their place if free.
    const debbys = week(["monday", "ben"], ["tuesday", "debby"]);
    const three = ["debby", "alex", "sam"];
    expect(
      pickAfter(
        facts({ active: three, week: debbys, open: open([member("alex", ["friday"]), member("sam", ["thursday"])]) }),
      ),
    ).toEqual({
      freed: [],
      proposal: {
        kind: "open",
        replaces: true,
        daysPerMember: 2,
        proposed: [
          { id: "alex", days: ["monday", "friday"] },
          { id: "sam", days: ["wednesday", "thursday"] },
        ],
      },
    });
    // Both held Saturday, a contest (FQ55): Alex, who joined first, keeps it, and Sam's two are other days.
    expect(
      pickAfter(
        facts({ active: three, week: debbys, open: open([member("alex", ["saturday"]), member("sam", ["saturday"])]) }),
      ),
    ).toEqual({
      freed: [],
      proposal: {
        kind: "open",
        replaces: true,
        daysPerMember: 2,
        proposed: [
          { id: "alex", days: ["friday", "saturday"] },
          { id: "sam", days: ["monday", "wednesday"] },
        ],
      },
    });
    // Maya held Wednesday and Saturday, and Alex joins: one day each, so Maya keeps the first from Monday,
    // and Saturday is free for Alex.
    expect(
      pickAfter(
        facts({
          active: ["ben", "debby", "maya", "alex"],
          week: TWO,
          open: open([member("maya", ["wednesday", "saturday"])], 2),
        }),
      ),
    ).toEqual({
      freed: [],
      proposal: {
        kind: "open",
        replaces: true,
        daysPerMember: 1,
        proposed: [
          { id: "maya", days: ["wednesday"] },
          { id: "alex", days: ["saturday"] },
        ],
      },
    });
  });

  it("applies in place of a new pick when those it includes have all confirmed and the size changes", () => {
    const sams = [...FOUR, { weekday: "friday" as const, star: "sam" }];
    // Sam confirmed Friday, Nina hadn't and left, and Maya and Alex left too: three members, two days each
    // by the table, but each keeps the one they have (FQ131), and nobody has none.
    expect(
      pickAfter(
        facts({
          active: ["ben", "debby", "sam"],
          week: sams,
          open: open([member("sam", ["friday"], true), member("nina", ["saturday"])]),
        }),
      ),
    ).toEqual({ freed: [], proposal: { kind: "apply" } });
  });

  it("throws for a club of more than six, or a member listed twice", () => {
    expect(() => pickAfter(facts({ active: ["a", "b", "c", "d", "e", "f", "g"] }))).toThrow(RangeError);
    expect(() => pickAfter(facts({ active: ["ben", "ben"] }))).toThrow();
  });
});

describe("nextMonday and nextWeekStart", () => {
  it("gives the Monday after the date's week, weeks running Monday to Sunday", () => {
    expect(nextMonday(D("2026-11-06")).toString()).toBe("2026-11-09"); // Friday
    expect(nextMonday(D("2026-11-09")).toString()).toBe("2026-11-16"); // Monday
    expect(nextMonday(D("2026-11-08")).toString()).toBe("2026-11-09"); // Sunday
  });

  it("starts a new week today, or the day after the latest week's start when that is today or later", () => {
    expect(nextWeekStart(D("2026-11-06"), D("2026-11-02")).toString()).toBe("2026-11-06");
    expect(nextWeekStart(D("2026-11-06"), null).toString()).toBe("2026-11-06");
    expect(nextWeekStart(D("2026-11-06"), D("2026-11-06")).toString()).toBe("2026-11-07");
    expect(nextWeekStart(D("2026-11-06"), D("2026-12-07")).toString()).toBe("2026-12-08");
  });
});

describe("newMemberFirstDate: the picked day in the week after (FQ130)", () => {
  it("is that weekday in the week after the confirmation, never this week", () => {
    const friday = at("2026-11-06T10:00");
    expect(newMemberFirstDate("friday", friday, NEW_YORK, D("2026-11-06"), null).toString()).toBe("2026-11-13");
    expect(newMemberFirstDate("monday", friday, NEW_YORK, D("2026-11-06"), null).toString()).toBe("2026-11-09");
    // Tomorrow is a Saturday this week: the new member's first Saturday is the next one.
    expect(newMemberFirstDate("saturday", friday, NEW_YORK, D("2026-11-06"), null).toString()).toBe("2026-11-14");
    // Confirmed on a Monday morning, this week's Thursday is three days on, well past 24 hours: the first
    // Thursday is still next week's, never this week's.
    const monday = at("2026-11-09T09:00");
    expect(newMemberFirstDate("thursday", monday, NEW_YORK, D("2026-11-09"), null).toString()).toBe("2026-11-19");
  });

  it("takes this week and next from the club's own date, not UTC's (T1)", () => {
    // Sunday 8 November at 22:00 in New York is Monday the 9th by UTC: next week starts the next day, so
    // the first Tuesday is the 10th, not the 17th.
    const sunday = at("2026-11-08T22:00");
    expect(newMemberFirstDate("tuesday", sunday, NEW_YORK, D("2026-11-08"), null).toString()).toBe("2026-11-10");
    // Monday 9 November at 08:00 in Auckland is still Sunday the 8th by UTC: this week is the club's, so
    // the first Wednesday is the 18th, not the 11th.
    const auckland = Temporal.PlainDateTime.from("2026-11-09T08:00")
      .toZonedDateTime("Pacific/Auckland")
      .toInstant() as ServerNow;
    expect(auckland.toString()).toBe("2026-11-08T19:00:00Z");
    expect(newMemberFirstDate("wednesday", auckland, "Pacific/Auckland", D("2026-11-09"), null).toString()).toBe(
      "2026-11-18",
    );
  });

  it("waits a week where the week after's date is less than 24 hours on (FQ79)", () => {
    // Sunday afternoon: Monday's 7 AM is 16 hours on, so the first Monday is eight days later; Tuesday isn't.
    const sunday = at("2026-11-08T15:00");
    expect(newMemberFirstDate("monday", sunday, NEW_YORK, D("2026-11-08"), null).toString()).toBe("2026-11-16");
    expect(newMemberFirstDate("tuesday", sunday, NEW_YORK, D("2026-11-08"), null).toString()).toBe("2026-11-10");
    // Exactly 24 hours qualifies; a second less waits a week.
    expect(newMemberFirstDate("monday", at("2026-11-08T07:00"), NEW_YORK, D("2026-11-08"), null).toString()).toBe(
      "2026-11-09",
    );
    expect(newMemberFirstDate("monday", at("2026-11-08T07:00:01"), NEW_YORK, D("2026-11-08"), null).toString()).toBe(
      "2026-11-16",
    );
  });

  it("comes after the last day of that weekday announced for a member still in the club", () => {
    // A Thursday still announced for a member in the club, to 3 December, comes first: a backstop, since a
    // freed day or a leaver's on the picked weekday is cancelled and so never counts (FQ129, FQ131).
    const tuesday = at("2026-11-10T09:00");
    expect(newMemberFirstDate("thursday", tuesday, NEW_YORK, D("2026-11-10"), D("2026-12-03")).toString()).toBe(
      "2026-12-10",
    );
    // A day announced only this week leaves next week free.
    expect(newMemberFirstDate("thursday", tuesday, NEW_YORK, D("2026-11-10"), D("2026-11-12")).toString()).toBe(
      "2026-11-19",
    );
  });

  it("is on or after the start of the week it joins", () => {
    // The club's latest week starts on 7 December (first days opened again, FQ124): the day joins it.
    const friday = at("2026-11-06T10:00");
    expect(newMemberFirstDate("friday", friday, NEW_YORK, D("2026-12-08"), null).toString()).toBe("2026-12-11");
  });
});
