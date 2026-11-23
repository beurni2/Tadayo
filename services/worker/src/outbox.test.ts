// The outbox's rules that need no database (docs/plans/api-b2-spike-prepare.md section 1; T52, T54): the backoff,
// and the code a failure is recorded under, never its message. The claim, the lease, the retries and the dead
// letters run against Postgres in tests/src/db/worker-outbox.test.ts.

import { describe, expect, it } from "vitest";
import { ImageProcessFailed, ImageTimeout } from "./image-process.ts";
import { BACKOFF_SECONDS, backoffSeconds, FailedForGood, failureCode, LEASE_SECONDS, MAX_ATTEMPTS } from "./outbox.ts";
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
