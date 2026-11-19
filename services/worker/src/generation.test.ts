// What the worker's lines may say of a pass (T52, T56), with no database. The pass itself runs against
// Postgres in tests/src/db/worker-generation.test.ts.

import { describe, expect, it } from "vitest";
import { describeFailure, passLines } from "./generation.ts";

describe("a failure as the worker reports it (T52, T56)", () => {
  it("is the error's class and its code, never what it says", () => {
    const refused = Object.assign(new Error("app.occurrences: 2026-11-10 isn't mem_secret's day"), { code: "23000" });
    expect(describeFailure(refused)).toBe("Error 23000");
    expect(describeFailure(new TypeError("postgres://tadayo_app:hunter2@db/tadayo"))).toBe("TypeError");
    expect(describeFailure(refused)).not.toMatch(/mem_secret|2026/);
  });

  it("drops a code that isn't a plain word, which could carry anything", () => {
    expect(describeFailure(Object.assign(new Error("x"), { code: "postgres://u:p@h" }))).toBe("Error");
    expect(describeFailure(Object.assign(new Error("x"), { code: 42 }))).toBe("Error");
    expect(describeFailure(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))).toBe("Error ECONNREFUSED");
  });

  it("names nothing of a value that isn't an error", () => {
    expect(describeFailure("mem_secret")).toBe("a thrown value");
    expect(describeFailure(null)).toBe("a thrown value");
    expect(describeFailure(undefined)).toBe("a thrown value");
  });
});

describe("the lines of a pass", () => {
  it("says nothing when nothing was made and nothing failed", () => {
    expect(passLines({ clubs: 3, made: 0, failures: [] })).toEqual({ out: [], err: [] });
    expect(passLines({ clubs: 0, made: 0, failures: [] })).toEqual({ out: [], err: [] });
  });

  it("says how many days were made, and nothing of which club or whose", () => {
    expect(passLines({ clubs: 2, made: 18, failures: [] })).toEqual({ out: ["worker: made 18 days"], err: [] });
    expect(passLines({ clubs: 2, made: 1, failures: [] })).toEqual({ out: ["worker: made 1 day"], err: [] });
  });

  it("gives each failed club one line, for the error stream, apart from the count", () => {
    expect(passLines({ clubs: 3, made: 4, failures: ["club_a: PostgresError 23000", "club_b: Error"] })).toEqual({
      out: ["worker: made 4 days"],
      err: ["worker: a club's days failed: club_a: PostgresError 23000", "worker: a club's days failed: club_b: Error"],
    });
    expect(passLines({ clubs: 1, made: 0, failures: ["club_a: PostgresError 55P03"] })).toEqual({
      out: [],
      err: ["worker: a club's days failed: club_a: PostgresError 55P03"],
    });
  });
});
