/// <reference lib="esnext.temporal" />
// Spec 05's two civil times (T2, ADR-008; spec 05, 06; Q03). The zone table below is the one
// Spike S5's report quotes (docs/plans/B0.md section 4).
//
// Four wrong ways to get a day's instants, and which tests tell each from the rule:
//   - Temporal's `earlier` for a missing time (a whole gap early): London's missing 1 AM.
//   - Temporal's `later`, and Postgres's AT TIME ZONE, for a doubled time (the second of two): the
//     doubled 1 AMs in London, New York and Troll.
//   - Temporal's default, `compatible`, for a missing time (the gap's length later): only a time
//     inside a gap, never at its start: London 01:30, Troll 02:00, Lord Howe 02:15, the 1 AM
//     closes of St John's and Goose Bay in 2011 and Casey in 2022, and Samoa's missing day. In
//     ADR-008's six zones today, every missing 7 AM or 1 AM falls at a gap's start, where
//     `compatible` happens to be right.
//   - reveal_at plus 18 hours: Santiago's 17- and 19-hour days, and those inside-gap closes.

import { describe, expect, it } from "vitest";
import { clubTimeZone, dayInstants, resolveCivilTime } from "./civil.ts";

const date = (text: string) => Temporal.PlainDate.from(text);
const time = (text: string) => Temporal.PlainTime.from(text);
const at = (text: string) => Temporal.Instant.from(text);
const minutes = (from: Temporal.Instant, to: Temporal.Instant) => from.until(to).total("minutes");

/** Temporal's own default for a missing or doubled wall time: what the written-out rule replaces. */
const compatible = (day: string, wall: string, zone: string) =>
  date(day).toPlainDateTime(time(wall)).toZonedDateTime(zone).toInstant();

// ADR-008's six zones, the days each side of their 2026 transitions (all past, so a later tzdata
// release can't move them), each 7 AM and 1 AM in the zone, and how long the day lasts.
const ZONE_TABLE: readonly (readonly [
  zone: string,
  localDate: string,
  revealAt: string,
  closeAt: string,
  hours: number,
])[] = [
  // London: the clocks go forward at 01:00 on 29 March (01:00 is missing) and back at 02:00 on 25
  // October (01:00 happens twice), each the night of a Saturday's day.
  ["Europe/London", "2026-03-27", "2026-03-27T07:00:00Z", "2026-03-28T01:00:00Z", 18],
  ["Europe/London", "2026-03-28", "2026-03-28T07:00:00Z", "2026-03-29T01:00:00Z", 18],
  ["Europe/London", "2026-03-30", "2026-03-30T06:00:00Z", "2026-03-31T00:00:00Z", 18],
  ["Europe/London", "2026-10-24", "2026-10-24T06:00:00Z", "2026-10-25T00:00:00Z", 18],
  ["Europe/London", "2026-10-26", "2026-10-26T07:00:00Z", "2026-10-27T01:00:00Z", 18],
  // New York changes at 02:00: 01:00 happens twice on 1 November.
  ["America/New_York", "2026-03-07", "2026-03-07T12:00:00Z", "2026-03-08T06:00:00Z", 18],
  ["America/New_York", "2026-03-09", "2026-03-09T11:00:00Z", "2026-03-10T05:00:00Z", 18],
  ["America/New_York", "2026-10-31", "2026-10-31T11:00:00Z", "2026-11-01T05:00:00Z", 18],
  ["America/New_York", "2026-11-02", "2026-11-02T12:00:00Z", "2026-11-03T06:00:00Z", 18],
  // Lord Howe moves by 30 minutes, at 02:00, so its instants fall on the half hour.
  ["Australia/Lord_Howe", "2026-04-04", "2026-04-03T20:00:00Z", "2026-04-04T14:00:00Z", 18],
  ["Australia/Lord_Howe", "2026-04-06", "2026-04-05T20:30:00Z", "2026-04-06T14:30:00Z", 18],
  ["Australia/Lord_Howe", "2026-10-03", "2026-10-02T20:30:00Z", "2026-10-03T14:30:00Z", 18],
  ["Australia/Lord_Howe", "2026-10-05", "2026-10-04T20:00:00Z", "2026-10-05T14:00:00Z", 18],
  // Troll moves by two hours at 01:00 UTC: 01:00 and 02:00 are missing on 29 March and happen
  // twice on 25 October.
  ["Antarctica/Troll", "2026-03-28", "2026-03-28T07:00:00Z", "2026-03-29T01:00:00Z", 18],
  ["Antarctica/Troll", "2026-03-30", "2026-03-30T05:00:00Z", "2026-03-30T23:00:00Z", 18],
  ["Antarctica/Troll", "2026-10-24", "2026-10-24T05:00:00Z", "2026-10-24T23:00:00Z", 18],
  ["Antarctica/Troll", "2026-10-26", "2026-10-26T07:00:00Z", "2026-10-27T01:00:00Z", 18],
  // Santiago changes at midnight, between a Saturday's 7 AM and 1 AM: that day lasts 19 hours in
  // April and 17 in September, so no fixed duration gives close_at.
  ["America/Santiago", "2026-04-04", "2026-04-04T10:00:00Z", "2026-04-05T05:00:00Z", 19],
  ["America/Santiago", "2026-04-06", "2026-04-06T11:00:00Z", "2026-04-07T05:00:00Z", 18],
  ["America/Santiago", "2026-09-05", "2026-09-05T11:00:00Z", "2026-09-06T04:00:00Z", 17],
  ["America/Santiago", "2026-09-07", "2026-09-07T10:00:00Z", "2026-09-08T04:00:00Z", 18],
  // Ouagadougou keeps UTC all year.
  ["Africa/Ouagadougou", "2026-03-28", "2026-03-28T07:00:00Z", "2026-03-29T01:00:00Z", 18],
  ["Africa/Ouagadougou", "2026-10-24", "2026-10-24T07:00:00Z", "2026-10-25T01:00:00Z", 18],
];

describe("a day's two instants (T2, ADR-008)", () => {
  it.each(ZONE_TABLE)(
    "in %s, %s opens at %s and closes at %s, %d hours later",
    (zone, local, reveal, close, length) => {
      const day = dayInstants(date(local), zone);
      expect(day.revealAt.toString()).toBe(reveal);
      expect(day.closeAt.toString()).toBe(close);
      expect(minutes(day.revealAt, day.closeAt)).toBe(length * 60);
    },
  );

  it("opens at 7 AM on the date and closes at 1 AM on the next, in the club's zone", () => {
    const day = dayInstants(date("2026-11-13"), "America/New_York");
    expect(day.revealAt.toZonedDateTimeISO("America/New_York").toString()).toBe(
      "2026-11-13T07:00:00-05:00[America/New_York]",
    );
    expect(day.closeAt.toZonedDateTimeISO("America/New_York").toString()).toBe(
      "2026-11-14T01:00:00-05:00[America/New_York]",
    );
  });

  it("resolves 1 AM on its own, never as 7 AM plus a duration (Santiago, 4 April and 5 September 2026)", () => {
    for (const [local, hours] of [
      ["2026-04-04", 19],
      ["2026-09-05", 17],
    ] as const) {
      const day = dayInstants(date(local), "America/Santiago");
      expect(day.closeAt.equals(day.revealAt.add({ hours: 18 }))).toBe(false);
      expect(minutes(day.revealAt, day.closeAt)).toBe(hours * 60);
      expect(day.closeAt.toZonedDateTimeISO("America/Santiago").toPlainTime().toString()).toBe("01:00:00");
    }
  });

  it("gives every member the same two instants, whatever zone the server or the member is in (Q03)", () => {
    // Only the club's zone counts: the server's own zone (its TZ) changes nothing. A London club's
    // Friday opens on Friday afternoon in Tokyo and at 11 PM on Thursday in Los Angeles.
    const saved = process.env["TZ"];
    try {
      const seen = ["UTC", "Asia/Tokyo", "America/Los_Angeles"].map((zone) => {
        process.env["TZ"] = zone;
        const day = dayInstants(date("2026-11-13"), "Europe/London");
        return [day.revealAt.toString(), day.closeAt.toString()];
      });
      expect(new Date(2026, 10, 13, 7).toISOString()).toBe("2026-11-13T15:00:00.000Z");
      expect(seen).toEqual([
        ["2026-11-13T07:00:00Z", "2026-11-14T01:00:00Z"],
        ["2026-11-13T07:00:00Z", "2026-11-14T01:00:00Z"],
        ["2026-11-13T07:00:00Z", "2026-11-14T01:00:00Z"],
      ]);
    } finally {
      if (saved === undefined) delete process.env["TZ"];
      else process.env["TZ"] = saved;
    }
    const day = dayInstants(date("2026-11-13"), "Europe/London");
    expect(day.revealAt.toZonedDateTimeISO("Asia/Tokyo").toPlainDateTime().toString()).toBe("2026-11-13T16:00:00");
    expect(day.revealAt.toZonedDateTimeISO("America/Los_Angeles").toPlainDateTime().toString()).toBe(
      "2026-11-12T23:00:00",
    );
  });
});

describe("London's missing and doubled 1 AM (TECH-DESIGN section 8)", () => {
  it("closes Saturday 28 March 2026 at 2 AM summer time, since 1 AM doesn't exist, not a whole gap early", () => {
    // Rules out `earlier`, which gives 00:00Z, before the clocks jumped. The gap starts at 1 AM,
    // so `compatible` gives the same instant here; the tests of times inside a gap tell them apart.
    const day = dayInstants(date("2026-03-28"), "Europe/London");
    expect(day.closeAt.toString()).toBe("2026-03-29T01:00:00Z");
    expect(day.closeAt.toZonedDateTimeISO("Europe/London").toString()).toBe("2026-03-29T02:00:00+01:00[Europe/London]");
    const early = date("2026-03-29").toPlainDateTime(time("01:00")).toZonedDateTime("Europe/London", {
      disambiguation: "earlier",
    });
    expect(early.toInstant().toString()).toBe("2026-03-29T00:00:00Z");
  });

  it("closes Saturday 24 October 2026 at the first of its two 1 AMs, not the later one AT TIME ZONE would give", () => {
    const day = dayInstants(date("2026-10-24"), "Europe/London");
    expect(day.closeAt.toString()).toBe("2026-10-25T00:00:00Z");
    // The second 1 AM, an hour later, is what Postgres's AT TIME ZONE and Temporal's `later` give.
    expect(day.closeAt.equals(at("2026-10-25T01:00:00Z"))).toBe(false);
    expect(minutes(day.revealAt, day.closeAt)).toBe(18 * 60);
  });
});

describe("a wall time that doesn't exist takes the next valid instant (spec 05)", () => {
  // The next valid instant is the moment the clocks jump: the first instant after the missing
  // wall time. Temporal's default, like its `later`, moves the wall time on by the gap's length,
  // which lands later than that whenever the time falls inside the gap, not at its start.
  it.each([
    ["Europe/London", "2026-03-29", "01:30", "2026-03-29T01:00:00Z", "2026-03-29T01:30:00Z"],
    ["Antarctica/Troll", "2026-03-29", "02:00", "2026-03-29T01:00:00Z", "2026-03-29T02:00:00Z"],
    ["Australia/Lord_Howe", "2026-10-04", "02:15", "2026-10-03T15:30:00Z", "2026-10-03T15:45:00Z"],
    // The clocks went from 00:01 to 01:01, so a Saturday's 1 AM close fell inside the gap.
    ["America/St_Johns", "2011-03-13", "01:00", "2011-03-13T03:31:00Z", "2011-03-13T04:30:00Z"],
    ["America/Goose_Bay", "2011-03-13", "01:00", "2011-03-13T04:01:00Z", "2011-03-13T05:00:00Z"],
    ["Antarctica/Casey", "2022-10-02", "01:00", "2022-10-01T16:01:00Z", "2022-10-01T17:00:00Z"],
    // Samoa skipped 30 December 2011 whole.
    ["Pacific/Apia", "2011-12-30", "07:00", "2011-12-30T10:00:00Z", "2011-12-30T17:00:00Z"],
    ["Pacific/Apia", "2011-12-30", "01:00", "2011-12-30T10:00:00Z", "2011-12-30T11:00:00Z"],
  ])("in %s, %s %s is %s, not %s", (zone, day, wall, next, shifted) => {
    expect(resolveCivilTime(date(day), time(wall), zone).toString()).toBe(next);
    expect(compatible(day, wall, zone).toString()).toBe(shifted);
  });

  it("closes St John's Saturday 12 March 2011 at 1:01 AM, when the clocks jumped there", () => {
    // Rules out all four wrong answers at once: `compatible`, AT TIME ZONE and 18 hours give
    // 04:30Z, `earlier` 03:30Z.
    const day = dayInstants(date("2011-03-12"), "America/St_Johns");
    expect(day.revealAt.toString()).toBe("2011-03-12T10:30:00Z");
    expect(day.closeAt.toString()).toBe("2011-03-13T03:31:00Z");
    expect(day.closeAt.toZonedDateTimeISO("America/St_Johns").toString()).toBe(
      "2011-03-13T01:01:00-02:30[America/St_Johns]",
    );
  });

  it("keeps the days around a date its zone skipped in order: each opens once the one before has closed", () => {
    // Samoa's Thursday 29 December 2011 closes as its missing Friday begins, and that Friday
    // opens then too, for an hour. Shifting 7 AM by the 24-hour gap would open the Friday after
    // its own 1 AM close.
    const thursday = dayInstants(date("2011-12-29"), "Pacific/Apia");
    const friday = dayInstants(date("2011-12-30"), "Pacific/Apia");
    const saturday = dayInstants(date("2011-12-31"), "Pacific/Apia");
    expect(thursday.closeAt.toString()).toBe("2011-12-30T10:00:00Z");
    expect(friday.revealAt.toString()).toBe("2011-12-30T10:00:00Z");
    expect(friday.closeAt.toString()).toBe("2011-12-30T11:00:00Z");
    expect(saturday.revealAt.toString()).toBe("2011-12-30T17:00:00Z");
    expect(Temporal.Instant.compare(compatible("2011-12-30", "07:00", "Pacific/Apia"), friday.closeAt)).toBe(1);
  });
});

describe("a wall time that happens twice takes the first (spec 05)", () => {
  it.each([
    ["Europe/London", "2026-10-25", "01:30", "2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z"],
    ["Antarctica/Troll", "2026-10-25", "02:00", "2026-10-25T00:00:00Z", "2026-10-25T02:00:00Z"],
    ["Australia/Lord_Howe", "2026-04-05", "01:45", "2026-04-04T14:45:00Z", "2026-04-04T15:15:00Z"],
    ["America/New_York", "2026-11-01", "01:00", "2026-11-01T05:00:00Z", "2026-11-01T06:00:00Z"],
  ])("in %s, %s %s is %s, not %s", (zone, day, wall, first, second) => {
    expect(resolveCivilTime(date(day), time(wall), zone).toString()).toBe(first);
    const later = date(day).toPlainDateTime(time(wall)).toZonedDateTime(zone, { disambiguation: "later" });
    expect(later.toInstant().toString()).toBe(second);
  });
});

interface Sweep {
  /** Missing 7 AMs and 1 AMs; of them, those inside a gap, where `compatible` is wrong; doubled ones. */
  missing: number;
  inside: number;
  doubled: number;
  /** The shortest and longest day, in minutes. */
  shortest: number;
  longest: number;
}

/** Every date from `from` until `until` in `zone`: what it met, each instant checked by the rules. */
function sweep(zone: string, from: string, until: string): Sweep {
  const found: Sweep = { missing: 0, inside: 0, doubled: 0, shortest: Infinity, longest: 0 };
  for (let day = date(from); Temporal.PlainDate.compare(day, date(until)) < 0; day = day.add({ days: 1 })) {
    const { revealAt, closeAt } = dayInstants(day, zone);
    const length = minutes(revealAt, closeAt);
    found.shortest = Math.min(found.shortest, length);
    found.longest = Math.max(found.longest, length);
    // The database's CHECK (db/migrations/0005_schedules_and_days.sql, app.occurrences).
    expect(length, day.toString()).toBeGreaterThan(0);
    expect(length, day.toString()).toBeLessThan(24 * 60);
    for (const [instant, wall] of [
      [revealAt, day.toPlainDateTime(time("07:00"))],
      [closeAt, day.add({ days: 1 }).toPlainDateTime(time("01:00"))],
    ] as const) {
      const local = instant.toZonedDateTimeISO(zone);
      if (Temporal.PlainDateTime.compare(local.toPlainDateTime(), wall) === 0) {
        // On its wall time, and the first time the wall shows it: a nanosecond earlier the wall
        // is before it. If the wall time comes round again later, that is a doubled time.
        const again = wall.toZonedDateTime(zone, { disambiguation: "later" }).toInstant();
        if (!again.equals(instant)) found.doubled += 1;
        expect(Temporal.Instant.compare(instant, again), wall.toString()).toBeLessThanOrEqual(0);
        const justBefore = instant.subtract({ nanoseconds: 1 }).toZonedDateTimeISO(zone);
        expect(Temporal.PlainDateTime.compare(justBefore.toPlainDateTime(), wall), wall.toString()).toBe(-1);
      } else {
        // Missing: the instant the clocks jumped over it, the first after it on the wall.
        found.missing += 1;
        if (!wall.toZonedDateTime(zone).toInstant().equals(instant)) found.inside += 1;
        const before = local.subtract({ nanoseconds: 1 });
        expect(Temporal.PlainDateTime.compare(before.toPlainDateTime(), wall), wall.toString()).toBe(-1);
        expect(Temporal.PlainDateTime.compare(local.toPlainDateTime(), wall), wall.toString()).toBe(1);
        expect(before.offset, wall.toString()).not.toBe(local.offset);
      }
    }
  }
  return found;
}

describe("every date of a year, each instant checked by the two rules", () => {
  it.each([
    // ADR-008's six zones in 2026, all past: London and Troll each miss one 1 AM, at a gap's start,
    // and double one; New York doubles one; Santiago's days run from 17 to 19 hours.
    ["Europe/London", 1, 0, 1, 18 * 60, 18 * 60],
    ["America/New_York", 0, 0, 1, 18 * 60, 18 * 60],
    ["Australia/Lord_Howe", 0, 0, 0, 18 * 60, 18 * 60],
    ["Antarctica/Troll", 1, 0, 1, 18 * 60, 18 * 60],
    ["America/Santiago", 0, 0, 0, 17 * 60, 19 * 60],
    ["Africa/Ouagadougou", 0, 0, 0, 18 * 60, 18 * 60],
  ] as const)(
    "in %s in 2026: %d missing (%d inside a gap) and %d doubled, days of %d to %d minutes",
    (zone, missing, inside, doubled, shortest, longest) => {
      expect(sweep(zone, "2026-01-01", "2027-01-01")).toEqual({ missing, inside, doubled, shortest, longest });
    },
  );

  it.each([
    "Europe/London",
    "America/New_York",
    "Australia/Lord_Howe",
    "Antarctica/Troll",
    "America/Santiago",
    "Africa/Ouagadougou",
  ])("in %s in 2027, whatever the tzdata says then", (zone) => {
    // 2027's clock changes haven't happened, so a later tzdata release may move them: only the
    // rules are checked, not how often each case comes up.
    sweep(zone, "2027-01-01", "2028-01-01");
  });

  it.each([
    // Years when a 1 AM close fell inside a gap, where `compatible` and 18 hours are wrong.
    ["America/St_Johns", "2011", 1, 1, 1, 17 * 60 + 1, 18 * 60],
    ["America/Goose_Bay", "2011", 1, 1, 1, 17 * 60 + 1, 18 * 60],
    ["Antarctica/Casey", "2022", 1, 1, 0, 17 * 60 + 1, 21 * 60],
    ["Pacific/Apia", "2011", 2, 2, 0, 60, 18 * 60],
  ] as const)(
    "in %s in %s: %d missing (%d inside a gap) and %d doubled, days of %d to %d minutes",
    (zone, year, missing, inside, doubled, shortest, longest) => {
      expect(sweep(zone, `${year}-01-01`, `${String(Number(year) + 1)}-01-01`)).toEqual({
        missing,
        inside,
        doubled,
        shortest,
        longest,
      });
    },
  );
});

describe("the club's zone (T2, FQ19)", () => {
  it("is an IANA name: never a bare offset, which has no clock changes and which the contract refuses", () => {
    // Temporal reads a string that starts with T as an ISO time: an offset or a bracketed zone in it
    // isn't a zone's name.
    for (const zone of [
      "+05:00",
      "-03:30",
      "+0530",
      "T07+05",
      "T07:00+05:00",
      "t0000-0330",
      "T07-00",
      "T07:00[Europe/London]",
    ]) {
      expect(() => clubTimeZone(zone), zone).toThrow(/IANA/);
      expect(() => dayInstants(date("2026-11-13"), zone), zone).toThrow(/IANA/);
    }
  });

  it("is one Temporal resolves, so a club never has a zone its days can't be found in", () => {
    // Intl.DateTimeFormat takes these old abbreviations; Temporal doesn't, nor does the contract's Timezone.
    for (const zone of ["BST", "PST", "IST", "SystemV/AST4", "UTC+5", "Mars/Olympus_Mons"]) {
      expect(() => clubTimeZone(zone), zone).toThrow(RangeError);
    }
  });

  it("comes back in Temporal's one spelling, which the club keeps", () => {
    expect(clubTimeZone("europe/london")).toBe("Europe/London");
    expect(clubTimeZone("AMERICA/NEW_YORK")).toBe("America/New_York");
    expect(clubTimeZone("Africa/Ouagadougou")).toBe("Africa/Ouagadougou");
    expect(clubTimeZone("Etc/GMT+5")).toBe("Etc/GMT+5");
  });
});
