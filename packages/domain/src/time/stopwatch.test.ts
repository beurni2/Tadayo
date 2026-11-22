import { describe, expect, it } from "vitest";
import { stopwatch } from "./stopwatch.ts";

describe("the stopwatch", () => {
  it("gives whole milliseconds since it started, never going back", async () => {
    const elapsed = stopwatch();
    const first = elapsed();
    expect(Number.isInteger(first)).toBe(true);
    expect(first).toBeGreaterThanOrEqual(0);
    await new Promise((resolve) => setTimeout(resolve, 25));
    const second = elapsed();
    expect(second).toBeGreaterThanOrEqual(Math.max(first, 20));
    expect(elapsed()).toBeGreaterThanOrEqual(second);
  });

  it("keeps each stopwatch's own start", async () => {
    const early = stopwatch();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const late = stopwatch();
    expect(early()).toBeGreaterThan(late());
  });
});
