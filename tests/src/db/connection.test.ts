/// <reference lib="esnext.temporal" />
// The API's and the worker's connections to Postgres (TECH-DESIGN section 5; T1, T3): each sends
// and reads every `timestamptz` through the time module's INSTANT_TYPE, so an instant crosses whole,
// to the microsecond, as a Temporal.Instant both ways, and a Date, which keeps milliseconds, is
// refused rather than sent.

import { connect as apiConnect } from "@tadayo/api";
import { connect as workerConnect } from "@tadayo/worker";
import { describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL ?? "";

describe("the services' connections: INSTANT_TYPE for every timestamptz (T1, T3)", () => {
  for (const [name, connect] of [
    ["the API's", apiConnect],
    ["the worker's", workerConnect],
  ] as const) {
    it(`stores a microsecond instant and reads it back whole, through ${name}, and refuses a Date`, async () => {
      expect(url, "set DATABASE_URL, as the ci step db-tests does").not.toBe("");
      const sql = connect(url);
      try {
        await sql.begin(async (tx) => {
          await tx`CREATE TEMPORARY TABLE instants (at timestamptz NOT NULL) ON COMMIT DROP`;
          const at = Temporal.Instant.from("2026-11-07T06:59:59.999999Z");
          await tx`INSERT INTO instants (at) VALUES (${at})`;
          const [row] = await tx<{ at: unknown; text: string }[]>`
            SELECT at, to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS text FROM instants`;
          expect(row?.at).toBeInstanceOf(Temporal.Instant);
          expect((row?.at as Temporal.Instant).equals(at)).toBe(true);
          expect(row?.text).toBe("2026-11-07T06:59:59.999999");
          const date = new Date("2026-11-07T06:59:59.999Z") as unknown as Temporal.Instant;
          await expect(tx.savepoint((sp) => sp`INSERT INTO instants (at) VALUES (${date})`)).rejects.toThrow(TypeError);
        });
      } finally {
        await sql.end();
      }
    });
  }
});
