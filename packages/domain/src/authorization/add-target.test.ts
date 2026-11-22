/// <reference lib="esnext.temporal" />
// Who may add to a day, on its own (./add-target.ts; spec 06, 07, 11; T3, T4, T9, T14, T17; FQ50, FQ63): each
// denying condition alone, the held day's edge, the cutoff a microsecond either side, the role, and the next
// day a refusal offers. The same facts are loaded from real rows in tests/src/db/reservations.test.ts.

import { describe, expect, it } from "vitest";
import type { ServerNow } from "../time/clock.ts";
import { addTargetOutcome, nextTargetOf, type AddTargetFacts } from "./add-target.ts";
import type { DayFacts } from "./days.ts";

const serverNow = (instant: Temporal.Instant) => instant as ServerNow;
const at = (text: string) => Temporal.Instant.from(text);
const µs = (instant: Temporal.Instant, n: number) => instant.add({ microseconds: n });

// Ana's Saturday in a London club, in November, when London is on UTC; Ben and Cleo are its other members.
const SAT = { reveal: at("2026-11-07T07:00:00Z"), close: at("2026-11-08T01:00:00Z") };
const BEFORE = at("2026-11-06T20:00:00Z");

const DAY: DayFacts = {
  id: "occ_sat",
  clubId: "club_1",
  status: "scheduled",
  localDate: "2026-11-07",
  revealAt: SAT.reveal,
  closeAt: SAT.close,
  starInterval: "mem_ana",
  starIntervalState: "active",
  starLeftAt: null,
  starEndedName: null,
  starAccount: "active",
  starName: "Ana",
  starDeletionRequestedAt: null,
  starAvatarVersion: "v_ana",
};

/** Ben, a member, adding to Ana's Saturday. */
const BEN: AddTargetFacts = { viewerAccount: "active", viewerInterval: "mem_ben", clubSuspendedAt: null, day: DAY };
/** Ana, adding to Ana's own day: the facts name the account and its interval, never a role. */
const ANA: AddTargetFacts = { ...BEN, viewerInterval: "mem_ana" };

const outcome = (facts: AddTargetFacts | null, instant: Temporal.Instant) =>
  addTargetOutcome(facts, serverNow(instant));

/** Ana's later days: Saturdays a week and two weeks on. */
const laterSaturday = (date: string, changes: Partial<DayFacts> = {}): DayFacts => {
  const reveal = at(`${date}T07:00:00Z`);
  return {
    ...DAY,
    id: `occ_${date}`,
    localDate: date,
    revealAt: reveal,
    closeAt: reveal.add({ hours: 18 }),
    ...changes,
  };
};
const SAT14 = laterSaturday("2026-11-14");
const SAT21 = laterSaturday("2026-11-21");

describe("nothing for anyone but a member of the day's club (T9, T14)", () => {
  it("gives the neutral not-found for a day nobody has, and for each denying fact alone", () => {
    expect(outcome(null, BEFORE)).toEqual({ kind: "not_found" });
    const denying: Partial<AddTargetFacts>[] = [
      { viewerAccount: null },
      { viewerAccount: "deleting" },
      { viewerAccount: "deleted" },
      { viewerInterval: null },
      { clubSuspendedAt: at("2026-11-06T10:00:00Z") },
      { day: { ...DAY, status: "suspended" } },
      { day: { ...DAY, status: "cancelled" } },
    ];
    for (const change of denying) {
      for (const instant of [BEFORE, SAT.reveal, SAT.close]) {
        expect(outcome({ ...BEN, ...change }, instant)).toEqual({ kind: "not_found" });
      }
    }
  });

  it("refuses a time that isn't a clock's sample", () => {
    expect(() => addTargetOutcome(BEN, "2026-11-06T20:00:00Z" as unknown as ServerNow)).toThrow(TypeError);
  });
});

describe("a day whose star has gone is held, whatever the time (FQ63, T27)", () => {
  it("holds the day when the star left, or asked to delete their account, before its reveal, and not at or after it", () => {
    const left = (when: Temporal.Instant): AddTargetFacts => ({
      ...BEN,
      day: { ...DAY, starIntervalState: "left", starLeftAt: when, starEndedName: "Ana" },
    });
    const deleting = (when: Temporal.Instant): AddTargetFacts => ({
      ...BEN,
      day: { ...DAY, starAccount: "deleting", starDeletionRequestedAt: when },
    });
    for (const gone of [left, deleting]) {
      expect(outcome(gone(µs(SAT.reveal, -1)), BEFORE)).toEqual({ kind: "held" });
      expect(outcome(gone(µs(SAT.reveal, -1)), SAT.reveal)).toEqual({ kind: "held" });
      expect(outcome(gone(µs(SAT.reveal, -1)), SAT.close)).toEqual({ kind: "held" });
      // Gone once the day had opened: the day opened, and its cutoff has passed.
      expect(outcome(gone(SAT.reveal), SAT.reveal)).toMatchObject({ kind: "closed" });
    }
  });
});

describe("the reveal is the cutoff, by the server's time alone (T3, D02)", () => {
  it("takes additions until a microsecond before reveal_at, and closes at reveal_at", () => {
    expect(outcome(BEN, µs(SAT.reveal, -1))).toMatchObject({ kind: "collecting" });
    expect(outcome(BEN, SAT.reveal)).toMatchObject({ kind: "closed" });
  });

  it("gives the closed day as the contract's Occurrence: open until close_at, past from it", () => {
    const target = {
      id: "occ_sat",
      clubId: "club_1",
      star: { membershipId: "mem_ana", displayName: "Ana", avatarVersion: "v_ana" },
      localDate: "2026-11-07",
      revealAt: SAT.reveal,
      closeAt: SAT.close,
    };
    expect(outcome(BEN, SAT.reveal)).toEqual({ kind: "closed", target: { ...target, phase: "open" } });
    expect(outcome(BEN, µs(SAT.close, -1))).toEqual({ kind: "closed", target: { ...target, phase: "open" } });
    expect(outcome(BEN, SAT.close)).toEqual({ kind: "closed", target: { ...target, phase: "past" } });
  });

  it("gives a closed day whose star left after it opened under the name the star ended with, and no avatar", () => {
    const left = {
      ...BEN,
      day: { ...DAY, starIntervalState: "left" as const, starLeftAt: SAT.reveal, starEndedName: "Ana B" },
    };
    expect(outcome(left, SAT.close)).toMatchObject({
      kind: "closed",
      target: { star: { membershipId: "mem_ana", displayName: "Ana B", avatarVersion: null }, phase: "past" },
    });
    const nameless = { ...left, day: { ...left.day, starEndedName: null } };
    expect(outcome(nameless, SAT.close)).toEqual({ kind: "closed", target: null });
  });
});

describe("before the reveal, the caller's interval and role, from the intervals alone (T17)", () => {
  it("gives a friend's interval and no star, and the star's own interval as the star", () => {
    const target = {
      id: "occ_sat",
      clubId: "club_1",
      star: { membershipId: "mem_ana", displayName: "Ana", avatarVersion: "v_ana" },
      localDate: "2026-11-07",
      revealAt: SAT.reveal,
      closeAt: SAT.close,
      phase: "collecting",
    };
    expect(outcome(BEN, BEFORE)).toEqual({ kind: "collecting", target, interval: "mem_ben", isStar: false });
    expect(outcome(ANA, BEFORE)).toEqual({ kind: "collecting", target, interval: "mem_ana", isStar: true });
  });

  it("takes additions to a paused club's day like any other's (FQ50)", () => {
    // A pause is the club's member count, not a fact the rule reads: the day is still scheduled.
    expect(outcome(BEN, BEFORE)).toMatchObject({ kind: "collecting" });
  });
});

describe("the same person's next day, for a refusal to offer (T4)", () => {
  const next = (facts: AddTargetFacts, later: readonly DayFacts[], instant: Temporal.Instant) =>
    nextTargetOf(facts, later, serverNow(instant))?.id ?? null;

  it("offers the star's earliest day after the target, never the target itself, and none when there is none", () => {
    expect(next(BEN, [SAT21, SAT14], BEFORE)).toBe("occ_2026-11-14");
    expect(next(BEN, [DAY, SAT14], BEFORE)).toBe("occ_2026-11-14");
    expect(next(BEN, [], BEFORE)).toBeNull();
    expect(nextTargetOf(BEN, [SAT14], serverNow(BEFORE))?.phase).toBe("collecting");
  });

  it("offers after a missed cutoff a day that hasn't opened, skipping one that has", () => {
    expect(next(BEN, [SAT14, SAT21], SAT.reveal)).toBe("occ_2026-11-14");
    expect(next(BEN, [SAT14, SAT21], at("2026-11-14T08:00:00Z"))).toBe("occ_2026-11-21");
  });

  it("skips a cancelled, suspended or held day, another star's, and another club's", () => {
    const skipped = [
      laterSaturday("2026-11-14", { status: "cancelled" }),
      laterSaturday("2026-11-14", { status: "suspended" }),
      laterSaturday("2026-11-14", { starInterval: "mem_ben", starName: "Ben" }),
      laterSaturday("2026-11-14", { clubId: "club_2" }),
    ];
    for (const day of skipped) expect(next(BEN, [day, SAT21], BEFORE)).toBe("occ_2026-11-21");
    const gone = { starIntervalState: "left" as const, starLeftAt: at("2026-11-10T00:00:00Z"), starEndedName: "Ana" };
    expect(next(BEN, [laterSaturday("2026-11-14", gone), laterSaturday("2026-11-21", gone)], BEFORE)).toBeNull();
  });

  it("offers nothing to a caller the rule gives nothing", () => {
    expect(next({ ...BEN, viewerInterval: null }, [SAT14], BEFORE)).toBeNull();
    expect(next({ ...BEN, clubSuspendedAt: BEFORE }, [SAT14], BEFORE)).toBeNull();
    expect(next({ ...BEN, viewerAccount: "deleting" }, [SAT14], BEFORE)).toBeNull();
  });
});
