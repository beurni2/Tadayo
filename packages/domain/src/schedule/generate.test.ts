/// <reference lib="esnext.temporal" />
import { describe, expect, it } from "vitest";
import { daysToMake, WEEKS_AHEAD, windowEnd, type GenerationFacts, type WeekVersion } from "./generate.ts";
import type { Weekday } from "./propose.ts";

const at = (text: string) => Temporal.Instant.from(text);
const NY = "America/New_York";

/** A version from `effectiveFrom` whose days are `[weekday, star, firstDate]`, every star active unless named in `gone`. */
function version(
  id: string,
  effectiveFrom: string,
  days: readonly (readonly [Weekday, string, string])[],
  gone: readonly string[] = [],
): WeekVersion {
  return {
    id,
    effectiveFrom,
    assignments: days.map(([weekday, starInterval, firstDate]) => ({
      weekday,
      starInterval,
      firstDate,
      starActive: !gone.includes(starInterval),
    })),
  };
}

/** Sunday people's week (spec 05's six member club), every day from Monday 2 November 2026. */
const SIX = version("ver_1", "2026-11-02", [
  ["monday", "ben", "2026-11-02"],
  ["tuesday", "maya", "2026-11-03"],
  ["wednesday", "alex", "2026-11-04"],
  ["thursday", "sam", "2026-11-05"],
  ["friday", "debby", "2026-11-06"],
  ["saturday", "nina", "2026-11-07"],
]);

function club(over: Partial<GenerationFacts> = {}): GenerationFacts {
  return {
    zone: NY,
    activated: true,
    suspended: false,
    activeMembers: 6,
    versions: [SIX],
    made: new Set(),
    changeFrom: null,
    ...over,
  };
}

const dates = (facts: GenerationFacts, now: string) => daysToMake(facts, at(now)).map((day) => day.localDate);

describe("the days a club is owed (spec 05; T2, T6; FQ16, FQ61, FQ63, FQ79, FQ115)", () => {
  // Friday 6 November 2026, 9:41 AM in New York.
  const NOW = "2026-11-06T14:41:00Z";

  it("looks four whole weeks past the club's current week (FQ115)", () => {
    expect(WEEKS_AHEAD).toBe(4);
    const end = (date: string) => windowEnd(Temporal.PlainDate.from(date)).toString();
    // Every date of the week of Monday 2 November ends at Sunday 6 December.
    for (const date of ["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-07", "2026-11-08"]) {
      expect(end(date)).toBe("2026-12-06");
    }
    // The next Monday moves it a week.
    expect(end("2026-11-09")).toBe("2026-12-13");
    // Across the year's end: Thursday 31 December 2026 is in the week that ends Sunday 3 January 2027.
    expect(end("2026-12-31")).toBe("2027-01-31");
  });

  it("owes every assigned date from today to the window's end, in date order, and no Sunday", () => {
    const owed = dates(club(), NOW);
    // Today's own 7 AM has passed, so the first is Saturday the 7th; the last is Saturday 5 December.
    expect(owed[0]).toBe("2026-11-07");
    expect(owed.at(-1)).toBe("2026-12-05");
    expect(owed).toHaveLength(25);
    expect(owed).toEqual([...owed].sort());
    for (const date of owed) expect(Temporal.PlainDate.from(date).dayOfWeek).not.toBe(7);
    expect(owed).not.toContain("2026-12-07");
  });

  it("owes, seen from Friday 6 November at 9:41 AM, every date to Saturday 5 December, where the contract's example ends", () => {
    // packages/contracts/src/fixtures/examples-clubs.ts, `ktAnnounced`, runs from Saturday 7 November to
    // Saturday 5 December, and the change it shows starts on Monday 7 December (world.ts, `changeFrom`),
    // the day after the window's end. For a week of six days that span is these 25 dates, written out by
    // hand; the example's own club has no Friday, and its 21 are below.
    expect(dates(club(), "2026-11-06T14:41:00Z")).toEqual([
      "2026-11-07",
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
    ]);
    // Kitchen table's week (world.ts, `rosters.kitchenTable`): every day but Friday, so 21 dates.
    const noFriday = version("ver_1", "2026-10-05", [
      ["monday", "ben", "2026-10-05"],
      ["tuesday", "maya", "2026-10-06"],
      ["wednesday", "alex", "2026-10-07"],
      ["thursday", "sam", "2026-10-08"],
      ["saturday", "nina", "2026-10-10"],
    ]);
    expect(dates(club({ activeMembers: 5, versions: [noFriday] }), "2026-11-06T14:41:00Z")).toEqual([
      "2026-11-07",
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-14",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-21",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-28",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-05",
    ]);
  });

  it("names each day's star, its version and its two instants, each resolved in the club's zone", () => {
    const [first] = daysToMake(club(), at(NOW));
    expect(first).toEqual({
      localDate: "2026-11-07",
      versionId: "ver_1",
      starInterval: "nina",
      revealAt: at("2026-11-07T12:00:00Z"),
      closeAt: at("2026-11-08T06:00:00Z"),
    });
  });

  it("takes today and the horizon from the club's zone, not from UTC", () => {
    // 04:30Z on Monday the 9th is still Sunday the 8th, 11:30 PM, in New York: the week of 2 November.
    expect(dates(club(), "2026-11-09T04:30:00Z").at(-1)).toBe("2026-12-05");
    // 05:00Z is Monday the 9th at midnight there: the window moves on a week, to Saturday 12 December.
    expect(dates(club(), "2026-11-09T05:00:00Z").at(-1)).toBe("2026-12-12");
    // In Auckland 04:30Z on Sunday the 8th is already 5:30 PM that Sunday; by 11:00Z it is Monday the 9th.
    expect(dates(club({ zone: "Pacific/Auckland" }), "2026-11-08T04:30:00Z").at(-1)).toBe("2026-12-05");
    expect(dates(club({ zone: "Pacific/Auckland" }), "2026-11-08T11:00:00Z").at(-1)).toBe("2026-12-12");
    // Today is the club's too: at New York's Friday 9:41 AM it is Saturday the 7th, 3:41 AM, in Auckland,
    // whose Saturday hasn't opened; in New York Friday has, and Saturday is the first.
    expect(dates(club({ zone: "Pacific/Auckland" }), NOW)[0]).toBe("2026-11-07");
    expect(dates(club({ zone: "Pacific/Auckland" }), "2026-11-06T18:00:00Z")[0]).toBe("2026-11-09");
    expect(dates(club(), "2026-11-06T18:00:00Z")[0]).toBe("2026-11-07");
  });

  it("never makes a day late: one whose 7 AM is now or past isn't owed, one a microsecond ahead is", () => {
    // Saturday the 7th opens at 12:00Z.
    expect(dates(club(), "2026-11-07T12:00:00Z")).not.toContain("2026-11-07");
    expect(dates(club(), "2026-11-07T11:59:59.999999Z")).toContain("2026-11-07");
    expect(dates(club(), "2026-11-07T12:00:00.000001Z")).not.toContain("2026-11-07");
  });

  it("owes nothing before a day's first date (FQ79)", () => {
    const late = version("ver_1", "2026-11-02", [
      ["thursday", "sam", "2026-11-12"],
      ["saturday", "nina", "2026-11-07"],
    ]);
    const owed = dates(club({ versions: [late] }), "2026-11-04T14:00:00Z");
    expect(owed).toEqual([
      "2026-11-07",
      "2026-11-12",
      "2026-11-14",
      "2026-11-19",
      "2026-11-21",
      "2026-11-26",
      "2026-11-28",
      "2026-12-03",
      "2026-12-05",
    ]);
  });

  it("owes no day to a star who has left, and still owes everyone else's (FQ63)", () => {
    const owed = daysToMake(
      club({
        activeMembers: 5,
        versions: [
          version(
            "ver_1",
            "2026-11-02",
            [
              ["saturday", "nina", "2026-11-07"],
              ["monday", "ben", "2026-11-02"],
            ],
            ["nina"],
          ),
        ],
      }),
      at(NOW),
    );
    expect(owed.map((day) => day.starInterval)).toEqual(["ben", "ben", "ben", "ben"]);
  });

  it("owes nothing to a club under two members, one not started, or a suspended one (FQ16; spec 04, 22)", () => {
    expect(dates(club({ activeMembers: 1 }), NOW)).toEqual([]);
    expect(dates(club({ activeMembers: 2 }), NOW)).toHaveLength(25);
    expect(dates(club({ activated: false }), NOW)).toEqual([]);
    expect(dates(club({ suspended: true }), NOW)).toEqual([]);
  });

  it("owes nothing to a club with no week, or a week nobody has confirmed a day in", () => {
    expect(dates(club({ versions: [] }), NOW)).toEqual([]);
    expect(dates(club({ versions: [version("ver_1", "2026-11-02", [])] }), NOW)).toEqual([]);
  });

  it("doesn't owe a date already made, whoever's it was", () => {
    const owed = dates(club({ made: new Set(["2026-11-07", "2026-11-10"]) }), NOW);
    expect(owed).toHaveLength(23);
    expect(owed).not.toContain("2026-11-07");
    expect(owed).not.toContain("2026-11-10");
    // The window's own last date too.
    expect(dates(club({ made: new Set(["2026-12-05"]) }), NOW).at(-1)).toBe("2026-12-04");
  });

  it("gives a club of three its six days a week", () => {
    const three = version("ver_1", "2026-11-02", [
      ["monday", "ben", "2026-11-02"],
      ["tuesday", "debby", "2026-11-03"],
      ["wednesday", "maya", "2026-11-04"],
      ["thursday", "ben", "2026-11-05"],
      ["friday", "debby", "2026-11-06"],
      ["saturday", "maya", "2026-11-07"],
    ]);
    const owed = daysToMake(club({ activeMembers: 3, versions: [three] }), at("2026-11-08T14:00:00Z"));
    // Sunday the 8th: Monday the 9th to Saturday 5 December are four whole weeks, and the 6th is a Sunday.
    expect(owed).toHaveLength(24);
    expect(owed.slice(0, 6).map((day) => day.starInterval)).toEqual(["ben", "debby", "maya", "ben", "debby", "maya"]);
  });

  it("makes each date under the version in force on it: the latest that started on or before it (FQ61)", () => {
    const next = version("ver_2", "2026-11-16", [
      ["monday", "leila", "2026-11-16"],
      ["tuesday", "ben", "2026-11-17"],
    ]);
    // Given in any order.
    const owed = daysToMake(club({ versions: [next, SIX] }), at(NOW));
    const before = owed.filter((day) => day.localDate < "2026-11-16");
    const after = owed.filter((day) => day.localDate >= "2026-11-16");
    expect(new Set(before.map((day) => day.versionId))).toEqual(new Set(["ver_1"]));
    expect(before.map((day) => day.localDate)).toEqual([
      "2026-11-07",
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
    ]);
    // From its start only the new week's days: nothing of the old one's Wednesday to Saturday.
    expect(after.map((day) => [day.localDate, day.versionId, day.starInterval])).toEqual([
      ["2026-11-16", "ver_2", "leila"],
      ["2026-11-17", "ver_2", "ben"],
      ["2026-11-23", "ver_2", "leila"],
      ["2026-11-24", "ver_2", "ben"],
      ["2026-11-30", "ver_2", "leila"],
      ["2026-12-01", "ver_2", "ben"],
    ]);
  });

  it("finds the version in force among three given in any order (FQ61)", () => {
    const second = version("ver_2", "2026-11-16", [["monday", "leila", "2026-11-16"]]);
    const third = version("ver_3", "2026-11-30", [["tuesday", "maya", "2026-12-01"]]);
    const expected = [
      ["2026-11-09", "ver_1"],
      ["2026-11-16", "ver_2"],
      ["2026-11-23", "ver_2"],
      ["2026-12-01", "ver_3"],
    ];
    const first = version("ver_1", "2026-11-02", [["monday", "ben", "2026-11-02"]]);
    for (const versions of [
      [first, second, third],
      [third, first, second],
      [second, third, first],
      [third, second, first],
    ]) {
      const owed = daysToMake(club({ versions }), at(NOW));
      expect(owed.map((day) => [day.localDate, day.versionId])).toEqual(expected);
    }
  });

  it("goes on across the year's end", () => {
    // Monday 28 December 2026, 9 AM in New York: the window ends on Sunday 31 January 2027.
    const owed = dates(club(), "2026-12-28T14:00:00Z");
    expect(owed[0]).toBe("2026-12-29");
    expect(owed).toContain("2026-12-31");
    expect(owed).toContain("2027-01-01");
    expect(owed.at(-1)).toBe("2027-01-30");
    expect(owed).toHaveLength(29);
  });

  it("owes nothing before the first version starts", () => {
    const later = version("ver_1", "2026-11-16", [["monday", "ben", "2026-11-16"]]);
    expect(dates(club({ versions: [later] }), NOW)).toEqual(["2026-11-16", "2026-11-23", "2026-11-30"]);
  });
});

describe("a made day's instants across a clock change (T2; ADR-008)", () => {
  const hours = (day: { revealAt: Temporal.Instant; closeAt: Temporal.Instant }) =>
    Number(day.closeAt.epochNanoseconds - day.revealAt.epochNanoseconds) / 3_600_000_000_000;
  const saturday = (zone: string, date: string, now: string) => {
    const week = version("ver_1", "2026-01-05", [["saturday", "nina", "2026-01-10"]]);
    const day = daysToMake(club({ zone, versions: [week] }), at(now)).find((owed) => owed.localDate === date);
    if (day === undefined) throw new Error(`no day on ${date}`);
    return day;
  };

  it("New York's autumn change: Saturday 31 October 2026 closes at the first 01:00 of 1 November, still in EDT", () => {
    const day = saturday(NY, "2026-10-31", "2026-10-20T12:00:00Z");
    expect(day.revealAt).toEqual(at("2026-10-31T11:00:00Z"));
    // 01:00 on Sunday 1 November happens twice; the first is 05:00Z, still EDT: 18 hours.
    expect(day.closeAt).toEqual(at("2026-11-01T05:00:00Z"));
    expect(hours(day)).toBe(18);
  });

  it("New York's spring change: Saturday 7 March 2026 closes at 01:00 EST, before the clocks jump at 02:00", () => {
    const day = saturday(NY, "2026-03-07", "2026-03-01T12:00:00Z");
    expect(day.revealAt).toEqual(at("2026-03-07T12:00:00Z"));
    expect(day.closeAt).toEqual(at("2026-03-08T06:00:00Z"));
  });

  it("London's spring change: Saturday 28 March 2026 closes at the jump, since 01:00 on the 29th doesn't exist", () => {
    const day = saturday("Europe/London", "2026-03-28", "2026-03-20T12:00:00Z");
    expect(day.revealAt).toEqual(at("2026-03-28T07:00:00Z"));
    expect(day.closeAt).toEqual(at("2026-03-29T01:00:00Z"));
    expect(hours(day)).toBe(18);
  });

  it("London's autumn change: Saturday 24 October 2026 closes at the first 01:00 of the 25th, still in BST", () => {
    const day = saturday("Europe/London", "2026-10-24", "2026-10-20T12:00:00Z");
    expect(day.revealAt).toEqual(at("2026-10-24T06:00:00Z"));
    // 01:00 on the 25th happens twice (BST then GMT); the first is 00:00Z.
    expect(day.closeAt).toEqual(at("2026-10-25T00:00:00Z"));
    expect(hours(day)).toBe(18);
  });

  it("Santiago's changes: a day of 19 hours and one of 17, so a close is never the reveal plus 18 hours", () => {
    // Chile's clocks go back at midnight after Saturday 4 April 2026: 24:00 becomes 23:00, so Saturday
    // has 25 hours and 01:00 on Sunday the 5th comes 19 hours after Saturday's 07:00.
    const autumn = saturday("America/Santiago", "2026-04-04", "2026-03-30T12:00:00Z");
    expect(autumn.revealAt).toEqual(at("2026-04-04T10:00:00Z"));
    expect(autumn.closeAt).toEqual(at("2026-04-05T05:00:00Z"));
    expect(hours(autumn)).toBe(19);
    // They go forward at midnight after Saturday 5 September 2026: 24:00 becomes 01:00 on Sunday the
    // 6th, which is the close itself, 17 hours after Saturday's 07:00.
    const spring = saturday("America/Santiago", "2026-09-05", "2026-08-31T12:00:00Z");
    expect(spring.revealAt).toEqual(at("2026-09-05T11:00:00Z"));
    expect(spring.closeAt).toEqual(at("2026-09-06T04:00:00Z"));
    expect(hours(spring)).toBe(17);
  });

  it("Auckland's spring change, Kolkata's half hour and Cairo's change, each by the zone's own rules", () => {
    // Auckland: clocks go forward at 02:00 on Sunday 27 September 2026, after Saturday's 01:00 close.
    const auckland = saturday("Pacific/Auckland", "2026-09-26", "2026-09-21T00:00:00Z");
    expect(auckland.revealAt).toEqual(at("2026-09-25T19:00:00Z"));
    expect(auckland.closeAt).toEqual(at("2026-09-26T13:00:00Z"));
    // Kolkata is five and a half hours ahead all year.
    const kolkata = saturday("Asia/Kolkata", "2026-11-07", "2026-11-02T00:00:00Z");
    expect(kolkata.revealAt).toEqual(at("2026-11-07T01:30:00Z"));
    expect(kolkata.closeAt).toEqual(at("2026-11-07T19:30:00Z"));
    // Cairo: clocks go back at midnight after Thursday 29 October 2026, so Saturday the 31st is in
    // winter time, two hours ahead.
    const cairo = saturday("Africa/Cairo", "2026-10-31", "2026-10-26T00:00:00Z");
    expect(cairo.revealAt).toEqual(at("2026-10-31T05:00:00Z"));
    expect(cairo.closeAt).toEqual(at("2026-10-31T23:00:00Z"));
  });

  it("refuses a zone that isn't an IANA name, instead of guessing one (FQ19)", () => {
    expect(() => daysToMake(club({ zone: "+05:00" }), at("2026-11-06T14:41:00Z"))).toThrow(RangeError);
    // Whether or not the club is owed a day: the zone is checked before anything is read from it.
    expect(() => daysToMake(club({ zone: "+05:00", versions: [] }), at("2026-11-06T14:41:00Z"))).toThrow(RangeError);
    expect(() => daysToMake(club({ zone: "+05:00", activated: false }), at("2026-11-06T14:41:00Z"))).toThrow(
      RangeError,
    );
  });
});

describe("a membership change waiting to start (FQ61, FQ127)", () => {
  // Friday 6 November 2026, 9:41 AM in New York.
  const NOW = "2026-11-06T14:41:00Z";

  it("makes no day from the start of a change waiting to start, and every day before it (FQ127)", () => {
    // Seen from Monday 9 November the window ends Sunday 13 December; the change starts Monday 7 December.
    const monday = "2026-11-09T14:41:00Z";
    const all = dates(club(), monday);
    expect(all.at(-1)).toBe("2026-12-12");
    const held = dates(club({ changeFrom: "2026-12-07" }), monday);
    expect(held.at(-1)).toBe("2026-12-05");
    expect(held).toEqual(all.filter((day) => day < "2026-12-07"));
  });

  it("makes nothing once a change's start is today or has passed, until the change ends (FQ127)", () => {
    expect(dates(club({ changeFrom: "2026-11-06" }), NOW)).toEqual([]);
    expect(dates(club({ changeFrom: "2026-11-02" }), NOW)).toEqual([]);
    // The day before the start is still made.
    expect(dates(club({ changeFrom: "2026-11-08" }), NOW)).toEqual(["2026-11-07"]);
  });

  it("is held by nothing when no change is open, and makes no day for a fact that is missing", () => {
    expect(dates(club({ changeFrom: null }), NOW)).toEqual(dates(club(), NOW));
    expect(dates({ ...club(), changeFrom: undefined } as unknown as GenerationFacts, NOW)).toEqual([]);
  });
});
