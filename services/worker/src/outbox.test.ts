// The outbox's rules that need no database (docs/plans/api-b2-spike-prepare.md section 1; T52, T54): the backoff,
// the wait out of a service the work needs (docs/plans/api-b2-worker-storage-retry.md section 1.2; the outside audit's
// B1), and the code a failure is recorded under, never its message. The claim, the lease, the retries and the dead
// letters run against Postgres in tests/src/db/worker-outbox.test.ts.

import { UPLOAD_HOURS } from "@tadayo/domain";
import { describe, expect, it } from "vitest";
import { Fault, InputFault, RangeFault } from "@tadayo/domain/fault";
import { ImageProcessFailed, ImageTimeout } from "./image-process.ts";
import {
  deadCode,
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
import { PrivilegeFault } from "./privileges.ts";
import { StorageRefused, StorageUnavailable } from "./storage.ts";

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

  it("lasts a day, no shorter than an upload lives, so a photo's preparation waits out Storage until its upload lapses", () => {
    expect(OUTAGE_SECONDS).toBe(24 * 60 * 60);
    expect(OUTAGE_SECONDS).toBeGreaterThanOrEqual(UPLOAD_HOURS * 60 * 60);
  });

  it("is what Storage away is, under its own code", () => {
    const away = new StorageUnavailable("reading an original answered 503");
    expect(away).toBeInstanceOf(Unavailable);
    expect(failureCode(away)).toBe("storage.unavailable");
    expect(failureCode(new StorageUnavailable("reading an original answered 403", "storage.refused"))).toBe(
      "storage.refused",
    );
    expect(new ImageTimeout()).not.toBeInstanceOf(Unavailable);
    expect(new FailedForGood("payload")).not.toBeInstanceOf(Unavailable);
    // A put Storage refuses is counted as any failure (storage.ts).
    expect(new StorageRefused("putting a rendition answered 413")).not.toBeInstanceOf(Unavailable);
    expect(failureCode(new StorageRefused("putting a rendition answered 413"))).toBe("storage.refused");
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

  it("is a fault's site code, which names where the code's own failure came from (the outside audit's B7)", () => {
    // Before B7 such an error had no code, and its event was recorded as `unknown`.
    expect(failureCode(new Fault("prepare_3", "media: upl_secret came back in a shape"))).toBe("prepare_3");
    expect(failureCode(new InputFault("prepare_2", "media: the upload is an id"))).toBe("prepare_2");
    expect(failureCode(new RangeFault("worker_outbox_1", "outbox: attempts count from 1"))).toBe("worker_outbox_1");
    expect(failureCode(new PrivilegeFault("worker_privileges_9", "worker: the sweep said x"))).toBe(
      "worker_privileges_9",
    );
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
      "worker_privileges_20",
      `${"a".repeat(29)}_99`,
    ]) {
      expect(code).toMatch(/^[A-Za-z0-9_.:-]{1,200}$/);
    }
  });
});

describe("a dead event's count (the outside audit's B7)", () => {
  it("is its topic and its code, the code alone past the count's pattern, else unknown", () => {
    expect(deadCode("upload.prepare", "lease_lapsed")).toBe("upload.prepare:lease_lapsed");
    expect(deadCode("upload.prepare", "db.57014")).toBe("upload.prepare:db.57014");
    expect(deadCode(`a.${"b".repeat(200)}`, "payload")).toBe("payload");
    expect(deadCode(`a.${"b".repeat(200)}`, "a b")).toBe("unknown");
    expect(deadCode("upload.prepare", "x".repeat(200))).toBe("x".repeat(200));
  });
});
