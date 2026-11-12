/// <reference lib="esnext.temporal" />
// The dev clock's arithmetic without a database: where a target puts the offset, and what it
// refuses (T3). The database side, with Postgres and the real table, is
// tests/src/db/ops-dev-clock.test.ts.

import { describe, expect, it } from "vitest";
import { LONGEST_OFFSET_DAYS, moveOffset } from "./dev-clock.ts";

// Postgres's own clock, in epoch microseconds, as some moment in 2027 reads.
const NOW = 1_800_000_000_000_000n;
const DAY = 86_400_000_000n;
const at = (microseconds: bigint) => Temporal.Instant.fromEpochNanoseconds(microseconds * 1000n);

describe("moveOffset", () => {
  it("is the target less Postgres's own clock, in whole microseconds", () => {
    expect(moveOffset(0n, NOW, at(NOW + 3n * DAY))).toBe(3n * DAY);
    expect(moveOffset(0n, NOW, at(NOW))).toBe(0n);
  });

  it("drops what is finer than a microsecond, Postgres's own precision", () => {
    const target = Temporal.Instant.fromEpochNanoseconds((NOW + 5n) * 1000n + 999n);
    expect(moveOffset(0n, NOW, target)).toBe(5n);
  });

  it("takes a target equal to what the clock reads now, and refuses one a microsecond before it (T3)", () => {
    const current = 2n * DAY;
    expect(moveOffset(current, NOW, at(NOW + current))).toBe(current);
    expect(() => moveOffset(current, NOW, at(NOW + current - 1n))).toThrow(/only moves forward/);
  });

  it("says what the clock reads and what it was asked for, as instants", () => {
    const current = 2n * DAY;
    expect.assertions(2);
    try {
      moveOffset(current, NOW, at(NOW + DAY));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).toContain(at(NOW + current).toString());
      expect(message).toContain(at(NOW + DAY).toString());
    }
  });

  it("refuses a target before Postgres's own clock, which no offset reaches", () => {
    expect(() => moveOffset(0n, NOW, at(NOW - 1n))).toThrow(/only moves forward/);
  });

  it("goes as far as the longest offset, to the microsecond, and no further", () => {
    const longest = BigInt(LONGEST_OFFSET_DAYS) * DAY;
    expect(LONGEST_OFFSET_DAYS).toBe(366);
    expect(moveOffset(0n, NOW, at(NOW + longest))).toBe(longest);
    expect(() => moveOffset(0n, NOW, at(NOW + longest + 1n))).toThrow(/366 days/);
  });

  it("measures the longest offset from Postgres's clock, not from the clock's own reading", () => {
    // An offset already at the longest stays refused for a target that is later still.
    const longest = BigInt(LONGEST_OFFSET_DAYS) * DAY;
    expect(() => moveOffset(longest, NOW, at(NOW + longest + DAY))).toThrow(/366 days/);
  });
});
