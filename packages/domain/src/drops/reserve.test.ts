/// <reference lib="esnext.temporal" />
// When a held slot lapses (./reserve.ts' `reservationExpiry`; spec 11; T18; docs/plans/api-b2-reservations.md
// section 0.4): 30 minutes from the clock's sample, never past the day's reveal. The command around it, its
// locks, the cutoff and the receipt are on Postgres (tests/src/db/reservations.test.ts).

import { describe, expect, it } from "vitest";
import { RESERVATION_MINUTES, reservationExpiry } from "./reserve.ts";

const at = (text: string) => Temporal.Instant.from(text);
const REVEAL = at("2026-11-07T07:00:00Z");

describe("a slot lapses 30 minutes on, never past the day's reveal (T18)", () => {
  it("holds for 30 minutes when the reveal is further off", () => {
    expect(RESERVATION_MINUTES).toBe(30);
    expect(reservationExpiry(at("2026-11-06T20:00:00.123456Z"), REVEAL)).toEqual(at("2026-11-06T20:30:00.123456Z"));
    expect(reservationExpiry(at("2026-11-07T06:29:59.999999Z"), REVEAL)).toEqual(at("2026-11-07T06:59:59.999999Z"));
  });

  it("ends at the reveal when 30 minutes would pass it, and exactly at it when they would reach it", () => {
    expect(reservationExpiry(at("2026-11-07T06:30:00Z"), REVEAL)).toEqual(REVEAL);
    expect(reservationExpiry(at("2026-11-07T06:30:00.000001Z"), REVEAL)).toEqual(REVEAL);
    expect(reservationExpiry(at("2026-11-07T06:59:59.999999Z"), REVEAL)).toEqual(REVEAL);
  });
});
