// The outbox's rules that need no database (docs/plans/api-b2-spike-prepare.md section 1; T52, T54): the backoff,
// the wait out of a service the work needs (docs/plans/api-b2-worker-storage-retry.md section 1.2; the outside audit's
// B1), and the code a failure is recorded under, never its message. The claim, the lease, the retries and the dead
// letters run against Postgres in tests/src/db/worker-outbox.test.ts.

import { describe, expect, it } from "vitest";
import { ImageProcessFailed, ImageTimeout } from "./image-process.ts";
import {
  BACKOFF_SECONDS,
  backoffSeconds,
  FailedForGood,
  failureCode,
  LEASE_SECONDS,
  MAX_ATTEMPTS,
  OUTAGE_SECONDS,
  OUTAGE_WAIT_SECONDS,
  outageWaitSeconds,
  Unavailable,
} from "./outbox.ts";
import { StorageUnavailable } from "./storage.ts";

describe("the retries (T54)", () => {
  it("waits 30 seconds after the first failure, and twice as long after each later one", () => {
    expect(BACKOFF_SECONDS).toBe(30);
    expect([1, 2, 3, 4].map(backoffSeconds)).toEqual([30, 60, 120, 240]);
  });

  it("gives five attempts, each leased for longer than the slowest work", () => {
    expect(MAX_ATTEMPTS).toBe(5);
    // Read, two decodes of at most a minute each, two puts of at most 30 seconds each, then the record.
    expect(LEASE_SECONDS).toBeGreaterThan(30 + 60 * 2 + 30 * 2 + 10);
  });

  it("counts attempts from 1", () => {
    expect(() => backoffSeconds(0)).toThrow(RangeError);
    expect(() => backoffSeconds(1.5)).toThrow(RangeError);
  });
});

describe("a service the work needs, waited out (the outside audit's B1)", () => {
  it("waits the event's age, at least 30 seconds and at most 15 minutes, so the waits double as the backoff's do", () => {
    expect(OUTAGE_WAIT_SECONDS).toBe(15 * 60);
    expect([0, 29, 30, 60, 120, 899, 900, 901, 86_400].map(outageWaitSeconds)).toEqual([
      30, 30, 30, 60, 120, 899, 900, 900, 900,
    ]);
    // An event's first tries, each at the age the last wait left it: 30, 30, 60, 120, 240, 480, then every 900.
    const ages = [0];
    while (ages.length < 9) ages.push((ages.at(-1) ?? 0) + outageWaitSeconds(ages.at(-1) ?? 0));
    expect(ages).toEqual([0, 30, 60, 120, 240, 480, 960, 1860, 2760]);
  });

  it("takes an age before the event was written, as a clock behind its row's, as no age at all", () => {
    expect(outageWaitSeconds(-5)).toBe(30);
    expect(outageWaitSeconds(0.5)).toBe(30);
    expect(outageWaitSeconds(100.4)).toBe(100);
  });

  it("is waited out for the event's first day, and counted after it", () => {
    expect(OUTAGE_SECONDS).toBe(24 * 60 * 60);
  });

  it("is what Storage away is, under its own code", () => {
    const away = new StorageUnavailable("reading an original answered 503");
    expect(away).toBeInstanceOf(Unavailable);
    expect(failureCode(away)).toBe("storage.unavailable");
    expect(new ImageTimeout()).not.toBeInstanceOf(Unavailable);
    expect(new FailedForGood("payload")).not.toBeInstanceOf(Unavailable);
  });
});

describe("a failure's code (T52)", () => {
  it("is the worker's own code for its own errors", () => {
    expect(failureCode(new StorageUnavailable("reading an original answered 500"))).toBe("storage.unavailable");
    expect(failureCode(new ImageTimeout())).toBe("image.timeout");
    expect(failureCode(new ImageProcessFailed())).toBe("image.process_failed");
    expect(failureCode(new FailedForGood("purpose.avatar"))).toBe("purpose.avatar");
    expect(failureCode(new FailedForGood("payload"))).toBe("payload");
  });

  it("is Postgres's SQLSTATE for a database error, and the system's code for a lost connection", () => {
    const postgres = Object.assign(new Error("duplicate key value violates unique constraint on acct_secret"), {
      name: "PostgresError",
      code: "23505",
    });
    expect(failureCode(postgres)).toBe("db.23505");
    expect(failureCode(Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:5432"), { code: "ECONNREFUSED" }))).toBe(
      "sys.econnrefused",
    );
    expect(failureCode(Object.assign(new Error("x"), { code: "CONNECTION_CLOSED" }))).toBe("sys.connection_closed");
  });

  it("is unknown for anything else, and never anything an error says", () => {
    expect(failureCode(new Error("postgres://tadayo_app:hunter2@db/tadayo"))).toBe("unknown");
    expect(failureCode(Object.assign(new Error("x"), { code: "postgres://u:p@h" }))).toBe("unknown");
    expect(failureCode(Object.assign(new Error("x"), { code: 42 }))).toBe("unknown");
    expect(failureCode(Object.assign(new Error("x"), { code: "a".repeat(65) }))).toBe("unknown");
    expect(failureCode("a thrown string")).toBe("unknown");
    expect(failureCode(null)).toBe("unknown");
    expect(failureCode(Object.assign(new Error("x"), { name: "PostgresError", code: "not-a-state" }))).toBe("unknown");
  });

  it("always fits the row's own check on last_error", () => {
    for (const code of [
      "storage.unavailable",
      "image.timeout",
      "db.55P03",
      "sys.econnreset",
      "unknown",
      "lease_lapsed",
    ]) {
      expect(code).toMatch(/^[A-Za-z0-9_.:-]{1,200}$/);
    }
  });
});
