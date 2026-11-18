import { describe, expect, it } from "vitest";
import { daysPerMember, proposedWeek, WEEKDAYS, type Weekday } from "./propose.ts";

/** A proposed week as spec 05 writes its examples: each weekday and whose it is. */
function byDay(names: readonly string[]): Record<string, string> {
  const week = proposedWeek(names.length);
  const out: Record<string, string> = {};
  week.forEach((days, member) => {
    for (const day of days) out[day] = names[member] ?? "?";
  });
  return out;
}

describe("the week proposed for a club's first days (spec 05)", () => {
  it("has six weekdays from Monday, never Sunday (T6)", () => {
    expect(WEEKDAYS).toEqual(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]);
  });

  it("gives two days each to two or three members and one to four, five or six (spec 05's table)", () => {
    expect([2, 3, 4, 5, 6].map(daysPerMember)).toEqual([2, 2, 1, 1, 1]);
  });

  it("proposes Monday and Thursday for Ben, Tuesday and Friday for Debby (spec 05's pair)", () => {
    expect(byDay(["Ben", "Debby"])).toEqual({ monday: "Ben", thursday: "Ben", tuesday: "Debby", friday: "Debby" });
  });

  it("proposes spec 05's example week for three members", () => {
    expect(byDay(["Ben", "Debby", "Maya"])).toEqual({
      monday: "Ben",
      tuesday: "Debby",
      wednesday: "Maya",
      thursday: "Ben",
      friday: "Debby",
      saturday: "Maya",
    });
  });

  it("proposes spec 05's example week for six members, in the order they joined (FQ98)", () => {
    expect(byDay(["Ben", "Maya", "Alex", "Sam", "Debby", "Nina"])).toEqual({
      monday: "Ben",
      tuesday: "Maya",
      wednesday: "Alex",
      thursday: "Sam",
      friday: "Debby",
      saturday: "Nina",
    });
  });

  it.each([2, 3, 4, 5, 6])("gives each of %i members their days, each weekday to one member at most", (count) => {
    const week = proposedWeek(count);
    expect(week).toHaveLength(count);
    const seen = new Set<Weekday>();
    for (const days of week) {
      expect(days).toHaveLength(daysPerMember(count));
      for (const day of days) {
        expect(WEEKDAYS).toContain(day);
        expect(seen.has(day)).toBe(false);
        seen.add(day);
      }
      // A member's two days are three apart: spaced, as spec 05 encourages.
      if (days.length === 2)
        expect(WEEKDAYS.indexOf(days[1] as Weekday) - WEEKDAYS.indexOf(days[0] as Weekday)).toBe(3);
    }
    expect(seen.size).toBe(count * daysPerMember(count));
  });

  it.each([0, 1, 7, 2.5, Number.NaN, -2])("refuses a club of %s", (count) => {
    expect(() => proposedWeek(count)).toThrow(RangeError);
    expect(() => daysPerMember(count)).toThrow(RangeError);
  });
});
