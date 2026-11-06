/// <reference lib="esnext.temporal" />
// The server's clock (T1, T3; ADR-013; TECH-DESIGN section 5). These tests give the clock a
// stand-in for the transaction; tests/src/db/clock.test.ts runs it against Postgres.

import { describe, expect, it } from "vitest";
import * as domain from "../index.ts";
import { prepareClock, type ClockSql } from "./clock.ts";
import { contractInstant, databaseInstant, INSTANT_TYPE } from "./instant.ts";
import { fakeClock } from "./testing.ts";

/**
 * A transaction that answers the dev clock's check with `devClock`, the dev table's read with
 * `tableRead` (a refusal when it's an error), and every sample with `nowMicroseconds` under
 * `isolation`; it records every query.
 */
function stub(
  devClock: boolean,
  nowMicroseconds = "1793948400123456",
  isolation = "read committed",
  tableRead?: Error,
) {
  const queries: string[] = [];
  const sql: ClockSql = (template) => {
    const text = template.join("?");
    queries.push(text);
    if (text.includes("pg_class")) return Promise.resolve([{ present: devClock }]);
    if (!text.includes("clock_timestamp")) {
      return tableRead ? Promise.reject(tableRead) : Promise.resolve([{ offset_microseconds: "0" }]);
    }
    return Promise.resolve([{ now_us: nowMicroseconds, isolation }]);
  };
  return { sql, queries };
}

const at = (text: string) => Temporal.Instant.from(text);

describe("prepareClock (ADR-013)", () => {
  it("refuses any environment but exactly dev or prod, so a typo can't pick the dev clock", async () => {
    for (const environment of ["production", "Prod", "PROD", "development", "", " prod", "test"]) {
      await expect(prepareClock(environment, stub(false).sql), environment).rejects.toThrow(/dev or prod/);
    }
  });

  it("refuses to start prod on a database that has a dev clock", async () => {
    await expect(prepareClock("prod", stub(true).sql)).rejects.toThrow(/prod refuses a dev clock/);
  });

  it("gives prod a clock whose query has no offset in it and never names the dev clock", async () => {
    const { sql, queries } = stub(false);
    const clock = await prepareClock("prod", sql);
    queries.length = 0;
    expect((await clock.sample(sql)).toString()).toBe("2026-11-06T07:00:00.123456Z");
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/clock_timestamp\(\)/);
    expect(queries[0]).not.toMatch(/dev_clock|offset|\+/i);
  });

  it("gives dev the clock that adds app.dev_clock's offset, and refuses to start dev without one", async () => {
    const { sql, queries } = stub(true);
    const clock = await prepareClock("dev", sql);
    queries.length = 0;
    await clock.sample(sql);
    expect(queries[0]).toMatch(/clock_timestamp\(\)/);
    expect(queries[0]).toMatch(/app\.dev_clock/);
    await expect(prepareClock("dev", stub(false).sql)).rejects.toThrow(/tools\/ops\/sql\/dev_clock\.sql/);
  });

  it("reads dev's table once at startup, so a table its role can't read stops dev there (T53)", async () => {
    const { sql, queries } = stub(true);
    await prepareClock("dev", sql);
    expect(queries.some((query) => /SELECT offset_microseconds FROM app\.dev_clock/.test(query))).toBe(true);
    const refused = stub(
      true,
      "1793948400123456",
      "read committed",
      new Error("permission denied for table dev_clock"),
    );
    await expect(prepareClock("dev", refused.sql)).rejects.toThrow(/can't read app\.dev_clock, which tadayo_app owns/);
  });

  it("samples only under READ COMMITTED, where dev's offset is the one after the locks, on prod as on dev", async () => {
    for (const environment of ["dev", "prod"] as const) {
      for (const isolation of ["repeatable read", "serializable", ""]) {
        const { sql } = stub(environment === "dev", "1793948400123456", isolation);
        const clock = await prepareClock(environment, sql);
        await expect(clock.sample(sql), `${environment} ${isolation}`).rejects.toThrow(/READ COMMITTED/);
      }
    }
  });

  it("reads clock_timestamp(), the moment it's asked, never now(), the transaction's start", async () => {
    for (const environment of ["dev", "prod"] as const) {
      const { sql, queries } = stub(environment === "dev");
      const clock = await prepareClock(environment, sql);
      queries.length = 0;
      await clock.sample(sql);
      expect(queries[0]).not.toMatch(/\bnow\(|current_timestamp|transaction_timestamp|statement_timestamp/i);
    }
  });

  it("refuses an answer that isn't a whole number of microseconds", async () => {
    for (const answer of ["", "1.5", "17939484001234560000000000000000", "abc", "1e6"]) {
      const { sql } = stub(false, answer);
      const clock = await prepareClock("prod", sql);
      await expect(clock.sample(sql), answer).rejects.toThrow(/microseconds/);
    }
  });
});

describe("fakeClock, the tests' clock (TECH-DESIGN section 8)", () => {
  const noQuery: ClockSql = () => Promise.reject(new Error("the fake clock never queries"));

  it("isn't in the package's main entry, only in @tadayo/domain/testing", () => {
    expect(Object.keys(domain)).toContain("prepareClock");
    expect(Object.keys(domain)).not.toContain("fakeClock");
  });

  it("stands still until it's told to move", async () => {
    const clock = fakeClock("2026-11-13T06:59:59.999999Z");
    expect((await clock.sample(noQuery)).toString()).toBe("2026-11-13T06:59:59.999999Z");
    expect((await clock.sample(noQuery)).toString()).toBe("2026-11-13T06:59:59.999999Z");
    clock.advance({ microseconds: 1 });
    expect((await clock.sample(noQuery)).toString()).toBe("2026-11-13T07:00:00Z");
    clock.set(at("2026-11-14T01:00:00Z"));
    expect((await clock.sample(noQuery)).toString()).toBe("2026-11-14T01:00:00Z");
  });

  it("keeps Postgres's precision, microseconds, so what a test compares is what the database stores", () => {
    expect(() => fakeClock("2026-11-13T07:00:00.0000001Z")).toThrow(/microsecond/);
    const clock = fakeClock("2026-11-13T07:00:00Z");
    expect(() => {
      clock.advance({ nanoseconds: 500 });
    }).toThrow(/microsecond/);
    expect(() => {
      clock.set(at("2026-11-13T07:00:00.000000001Z"));
    }).toThrow(/microsecond/);
  });
});

describe("an instant leaving the time module", () => {
  it("goes to the database whole, to the microsecond, as a command stores the clock's sample (T3, T22)", () => {
    expect(databaseInstant(at("2026-11-13T06:59:59.999999Z"))).toBe("2026-11-13T06:59:59.999999Z");
    expect(databaseInstant(at("2026-11-13T07:00:00Z"))).toBe("2026-11-13T07:00:00.000000Z");
    expect(() => databaseInstant(at("2026-11-13T06:59:59.9999995Z"))).toThrow(/microsecond/);
  });

  it("crosses postgres.js as a Temporal.Instant both ways, and as nothing else (T1)", () => {
    expect(INSTANT_TYPE.serialize(at("2026-11-13T06:59:59.999999Z"))).toBe("2026-11-13T06:59:59.999999Z");
    for (const value of [new Date("2026-11-13T07:00:00Z"), "2026-11-13T07:00:00Z", 1793948400000]) {
      // postgres.js hands the type every timestamptz parameter, whatever its type says.
      expect(() => INSTANT_TYPE.serialize(value as unknown as Temporal.Instant), String(value)).toThrow(
        /takes a Temporal\.Instant from the time module/,
      );
    }
    // Postgres's ISO output, in whatever zone the session is in.
    expect(INSTANT_TYPE.parse("2026-11-13 06:59:59.999999+00").toString()).toBe("2026-11-13T06:59:59.999999Z");
    expect(INSTANT_TYPE.parse("2026-11-13 12:29:59.999999+05:30").toString()).toBe("2026-11-13T06:59:59.999999Z");
    expect(INSTANT_TYPE.parse("2026-11-13 07:00:00+00").toString()).toBe("2026-11-13T07:00:00Z");
  });

  it("goes into the contract in whole seconds, rounded down, so server_now is never ahead of the server", () => {
    expect(contractInstant(at("2026-11-13T06:59:59.999999Z"))).toBe("2026-11-13T06:59:59Z");
    expect(contractInstant(at("2026-11-13T07:00:00Z"))).toBe("2026-11-13T07:00:00Z");
    expect(contractInstant(at("2026-11-13T07:00:00.5Z"))).toBe("2026-11-13T07:00:00Z");
    expect(contractInstant(at("1969-12-31T23:59:59.5Z"))).toBe("1969-12-31T23:59:59Z");
  });
});
