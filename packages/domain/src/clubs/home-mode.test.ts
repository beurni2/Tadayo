import { describe, expect, it } from "vitest";
import { homeMode, type HomeMode, type HomeModeFacts } from "./home.ts";

describe("Home's mode (the contract's Home; spec 06, 08, 22; T5; FQ16, FQ50, FQ54, FQ80, FQ134)", () => {
  // Every combination of the five facts, up to the most a club holds (six, A01), with the contract's order
  // written out a second way: unavailable, awaiting_activation, day, waiting, paused, no_days.
  const table: [HomeModeFacts, HomeMode][] = [];
  for (const suspended of [false, true]) {
    for (const activated of [false, true]) {
      for (const activeMembers of [1, 2, 6]) {
        for (const open of [false, true]) {
          for (const next of [false, true]) {
            let mode: HomeMode = "no_days";
            if (activeMembers < 2) mode = "paused";
            if (next) mode = "waiting";
            if (open) mode = "day";
            if (!activated) mode = "awaiting_activation";
            if (suspended) mode = "unavailable";
            table.push([{ suspended, activated, activeMembers, open, next }, mode]);
          }
        }
      }
    }
  }

  it.each(table)("%j is %s", (facts, mode) => {
    expect(homeMode(facts)).toBe(mode);
  });

  it("reaches each of the contract's six modes", () => {
    expect(new Set(table.map(([, mode]) => mode))).toEqual(
      new Set(["unavailable", "awaiting_activation", "day", "waiting", "paused", "no_days"]),
    );
  });

  it("holds the readings the sources give", () => {
    // A suspension beats everything, a day open included (spec 22, FQ80).
    expect(homeMode({ suspended: true, activated: true, activeMembers: 3, open: true, next: true })).toBe(
      "unavailable",
    );
    // A paused club's own announced day shows as usual until it closes, then the pause (FQ50).
    expect(homeMode({ suspended: false, activated: true, activeMembers: 1, open: true, next: false })).toBe("day");
    expect(homeMode({ suspended: false, activated: true, activeMembers: 1, open: false, next: true })).toBe("waiting");
    expect(homeMode({ suspended: false, activated: true, activeMembers: 1, open: false, next: false })).toBe("paused");
    // An active club with no day to open never invents one (T49, FQ134).
    expect(homeMode({ suspended: false, activated: true, activeMembers: 4, open: false, next: false })).toBe("no_days");
  });

  it("refuses facts outside their schema rather than answer", () => {
    expect(() => homeMode({ suspended: false, activated: true, activeMembers: 0, open: false, next: false })).toThrow();
    expect(() =>
      homeMode({ suspended: false, activated: true, activeMembers: 1.5, open: false, next: false }),
    ).toThrow();
  });
});
