/// <reference lib="esnext.temporal" />
import { describe, expect, it } from "vitest";
import { REVEAL_TIME, resolveCivilTime } from "../time/civil.ts";
import { firstDate } from "./first-date.ts";
import { WEEKDAYS, type Weekday } from "./propose.ts";

const at = (text: string) => Temporal.Instant.from(text);
const first = (weekday: Weekday, confirmedAt: string, zone: string) =>
  firstDate(weekday, at(confirmedAt), zone).toString();
const DAY_NS = 24n * 3_600_000_000_000n;
/** The elapsed nanoseconds from `from` to 7 AM on `date` in `zone`. */
const until7 = (from: Temporal.Instant, date: Temporal.PlainDate, zone: string) =>
  resolveCivilTime(date, REVEAL_TIME, zone).epochNanoseconds - from.epochNanoseconds;

describe("a confirmed day's first date (FQ79)", () => {
  const NY = "America/New_York";

  it("is handoff 6's fixture: confirmed at 9 AM on Wednesday 4 November 2026 in New York", () => {
    // 9 AM EST is 14:00Z. Thursday's 7 AM was 22 hours later, so Sam's first Thursday is the 12th.
    const confirmed = "2026-11-04T14:00:00Z";
    expect(first("thursday", confirmed, NY)).toBe("2026-11-12");
    expect(first("friday", confirmed, NY)).toBe("2026-11-06");
    expect(first("saturday", confirmed, NY)).toBe("2026-11-07");
    expect(first("monday", confirmed, NY)).toBe("2026-11-09");
    expect(first("tuesday", confirmed, NY)).toBe("2026-11-10");
    // That Wednesday's own 7 AM had passed.
    expect(first("wednesday", confirmed, NY)).toBe("2026-11-11");
  });

  it("opens on a date whose 7 AM is exactly 24 hours after the confirmation", () => {
    // Sunday 8 November 2026, 7 AM in New York.
    expect(first("monday", "2026-11-08T12:00:00Z", NY)).toBe("2026-11-09");
  });

  it("waits a week when the 7 AM is one second, or one nanosecond, short of 24 hours", () => {
    expect(first("monday", "2026-11-08T12:00:01Z", NY)).toBe("2026-11-16");
    expect(first("monday", "2026-11-08T12:00:00.000000001Z", NY)).toBe("2026-11-16");
  });

  it("opens the same day a week on when confirmed on the day itself, before or after 7 AM", () => {
    expect(first("monday", "2026-11-09T11:00:00Z", NY)).toBe("2026-11-16");
    expect(first("monday", "2026-11-09T13:00:00Z", NY)).toBe("2026-11-16");
  });

  describe("across a clock change in the 24 hours before a reveal day's 7 AM (Africa/Cairo)", () => {
    const CAIRO = "Africa/Cairo";
    // Egypt's clocks go forward at 00:00 on the last Friday of April and back at 24:00 on the last
    // Thursday of October, so a Friday's 7 AM is 23 or 25 hours after Thursday's.
    const thursdaySpring = resolveCivilTime(Temporal.PlainDate.from("2026-04-23"), REVEAL_TIME, CAIRO);
    const thursdayAutumn = resolveCivilTime(Temporal.PlainDate.from("2026-10-29"), REVEAL_TIME, CAIRO);

    it("has a 23-hour day in spring and a 25-hour day in autumn, as this test assumes", () => {
      expect(until7(thursdaySpring, Temporal.PlainDate.from("2026-04-24"), CAIRO)).toBe(23n * 3_600_000_000_000n);
      expect(until7(thursdayAutumn, Temporal.PlainDate.from("2026-10-30"), CAIRO)).toBe(25n * 3_600_000_000_000n);
    });

    it("waits a week when the clocks go forward: 7 AM to 7 AM is 23 hours", () => {
      expect(firstDate("friday", thursdaySpring, CAIRO).toString()).toBe("2026-05-01");
    });

    it("opens when the clocks go back: 7 AM to 7 AM is 25 hours, and 8 AM to 7 AM exactly 24", () => {
      expect(firstDate("friday", thursdayAutumn, CAIRO).toString()).toBe("2026-10-30");
      expect(firstDate("friday", thursdayAutumn.add({ hours: 1 }), CAIRO).toString()).toBe("2026-10-30");
      expect(firstDate("friday", thursdayAutumn.add({ hours: 1, seconds: 1 }), CAIRO).toString()).toBe("2026-11-06");
    });
  });

  it("reads the date in the club's zone, east and west of the date line", () => {
    // 00:00Z on 1 July 2026 is noon on Wednesday 1 July in Auckland and 2 PM on Tuesday 30 June in Honolulu.
    expect(first("thursday", "2026-07-01T00:00:00Z", "Pacific/Auckland")).toBe("2026-07-09");
    expect(first("friday", "2026-07-01T00:00:00Z", "Pacific/Auckland")).toBe("2026-07-03");
    expect(first("wednesday", "2026-07-01T00:00:00Z", "Pacific/Honolulu")).toBe("2026-07-08");
    expect(first("thursday", "2026-07-01T00:00:00Z", "Pacific/Honolulu")).toBe("2026-07-02");
  });

  it("is always the first such weekday with its 24 hours, for every hour of two weeks in four zones", () => {
    const zones = [NY, "Africa/Cairo", "Pacific/Auckland", "Europe/London"];
    const starts = [at("2026-03-05T00:30:00Z"), at("2026-10-22T00:30:00Z")];
    for (const zone of zones) {
      for (const start of starts) {
        for (let hour = 0; hour < 14 * 24; hour += 1) {
          const confirmed = start.add({ hours: hour });
          for (const weekday of WEEKDAYS) {
            const date = firstDate(weekday, confirmed, zone);
            expect(date.dayOfWeek).toBe(WEEKDAYS.indexOf(weekday) + 1);
            expect(until7(confirmed, date, zone) >= DAY_NS).toBe(true);
            expect(until7(confirmed, date.subtract({ days: 7 }), zone) < DAY_NS).toBe(true);
          }
        }
      }
    }
  });

  it("refuses a weekday that can't be someone's day, and a zone that isn't one", () => {
    expect(() => firstDate("sunday" as Weekday, at("2026-11-04T14:00:00Z"), NY)).toThrow(RangeError);
    expect(() => firstDate("monday", at("2026-11-04T14:00:00Z"), "+05:00")).toThrow(RangeError);
  });
});

describe("a first date in a week that starts later (FQ61, FQ124)", () => {
  const NY = "America/New_York";
  const from = (date: string) => Temporal.PlainDate.from(date);
  // Confirmed at 9 AM on Wednesday 4 November 2026 in New York: Friday first opens on the 6th by the 24 hours.
  const confirmed = at("2026-11-04T14:00:00Z");

  it("changes nothing when the week started on or before the date the 24 hours give", () => {
    expect(firstDate("friday", confirmed, NY, from("2026-11-01")).toString()).toBe("2026-11-06");
    expect(firstDate("friday", confirmed, NY, from("2026-11-06")).toString()).toBe("2026-11-06");
  });

  it("is the first such weekday on or after the week's start when that is later", () => {
    expect(firstDate("friday", confirmed, NY, from("2026-11-07")).toString()).toBe("2026-11-13");
    // Four weeks on, the day after the last day already made: a Friday itself, then a Thursday.
    expect(firstDate("friday", confirmed, NY, from("2026-12-04")).toString()).toBe("2026-12-04");
    expect(firstDate("thursday", confirmed, NY, from("2026-12-04")).toString()).toBe("2026-12-10");
  });

  it("still waits the 24 hours when the week starts on the day itself", () => {
    // Thursday the 5th's 7 AM is 22 hours after the confirmation: the 12th, though the week starts on the 5th.
    expect(firstDate("thursday", confirmed, NY, from("2026-11-05")).toString()).toBe("2026-11-12");
  });
});
