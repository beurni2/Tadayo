/// <reference lib="esnext.temporal" />
// Home's day choice on its own (./days.ts; spec 06, 08; T1, T5, T9, T14; FQ50, FQ63, FQ75): each
// condition alone, both edges of the open window, the held day's edge, the star's name and avatar,
// and facts that are missing or strange. The same cases run through the SQL and this policy on the
// same rows in tests/src/db/home-days.test.ts.

import { describe, expect, it } from "vitest";
import type { ServerNow } from "../time/clock.ts";
import { chooseDays, chosenDay, type ClubDayFacts, type DayChoice, type DayFacts } from "./days.ts";

/** The server's time, as only a clock makes it; here the tests stand in for one. */
const serverNow = (instant: Temporal.Instant) => instant as ServerNow;
const at = (text: string) => Temporal.Instant.from(text);
const µs = (instant: Temporal.Instant, n: number) => instant.add({ microseconds: n });

// Ana's Saturday and Ben's Monday in a London club, in November, when London is on UTC.
const SAT = { reveal: at("2026-11-07T07:00:00Z"), close: at("2026-11-08T01:00:00Z") };
const MON = { reveal: at("2026-11-09T07:00:00Z"), close: at("2026-11-10T01:00:00Z") };

const ANA: DayFacts = {
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

const BEN: DayFacts = {
  ...ANA,
  id: "occ_mon",
  localDate: "2026-11-09",
  revealAt: MON.reveal,
  closeAt: MON.close,
  starInterval: "mem_ben",
  starName: "Ben",
  starAvatarVersion: null,
};

/** A member of the club, with nothing denying; Ben's day listed first, so order comes from the rule. */
const CLUB: ClubDayFacts = {
  viewerAccount: "active",
  viewerInterval: "active",
  clubSuspendedAt: null,
  days: [BEN, ANA],
};

const choose = (facts: ClubDayFacts | null, instant: Temporal.Instant): DayChoice =>
  chooseDays(facts, serverNow(instant));
const ids = (choice: DayChoice) => ({ open: choice.open?.id ?? null, next: choice.next?.id ?? null });

describe("which day is open and which is next, by the server's time alone (T1, T5; spec 06)", () => {
  it("opens the day at reveal_at exactly, not a microsecond before, and keeps it open until a microsecond before close_at", () => {
    expect(ids(choose(CLUB, µs(SAT.reveal, -1)))).toEqual({ open: null, next: "occ_sat" });
    expect(ids(choose(CLUB, SAT.reveal))).toEqual({ open: "occ_sat", next: "occ_mon" });
    expect(ids(choose(CLUB, µs(SAT.close, -1)))).toEqual({ open: "occ_sat", next: "occ_mon" });
    expect(ids(choose(CLUB, SAT.close))).toEqual({ open: null, next: "occ_mon" });
  });

  it("gives the earliest day to open as next: the day itself while it collects, the one after while it is open and after it closes", () => {
    expect(ids(choose(CLUB, at("2026-11-02T08:00:00Z")))).toEqual({ open: null, next: "occ_sat" });
    expect(ids(choose(CLUB, at("2026-11-07T12:00:00Z")))).toEqual({ open: "occ_sat", next: "occ_mon" });
    expect(ids(choose(CLUB, at("2026-11-08T12:00:00Z")))).toEqual({ open: null, next: "occ_mon" });
    expect(ids(choose(CLUB, MON.reveal))).toEqual({ open: "occ_mon", next: null });
    // After the last day there is no next: nothing is invented (T49).
    expect(ids(choose(CLUB, MON.close))).toEqual({ open: null, next: null });
    expect(ids(choose({ ...CLUB, days: [] }, SAT.reveal))).toEqual({ open: null, next: null });
  });

  it("says each chosen day's phase from its slot, and carries the day's own date, instants and club", () => {
    const choice = choose(CLUB, SAT.reveal);
    expect(choice.open).toEqual({
      id: "occ_sat",
      clubId: "club_1",
      star: { membershipId: "mem_ana", displayName: "Ana", avatarVersion: "v_ana" },
      localDate: "2026-11-07",
      revealAt: SAT.reveal,
      closeAt: SAT.close,
      phase: "open",
    });
    expect(choice.next).toEqual({
      id: "occ_mon",
      clubId: "club_1",
      star: { membershipId: "mem_ben", displayName: "Ben", avatarVersion: null },
      localDate: "2026-11-09",
      revealAt: MON.reveal,
      closeAt: MON.close,
      phase: "collecting",
    });
  });

  it("refuses a time that isn't an instant Postgres keeps exactly", () => {
    expect(() => choose(CLUB, at("2026-11-07T07:00:00.0000001Z"))).toThrow(RangeError);
    expect(() => chooseDays(CLUB, "2026-11-07T07:00:00Z" as unknown as ServerNow)).toThrow(TypeError);
    expect(() => chooseDays(null, new Date() as unknown as ServerNow)).toThrow(TypeError);
  });
});

describe("only the viewer's clubs, and only a scheduled day that isn't held (T9, T14, T27; FQ50, FQ63; spec 22)", () => {
  const PHASES = [µs(SAT.reveal, -1), SAT.reveal, µs(SAT.close, -1), SAT.close];

  it("gives nothing to a stranger, a former member, an account that isn't active, or for no club at all", () => {
    for (const instant of PHASES) {
      expect(choose(null, instant)).toEqual({ open: null, next: null });
      expect(choose({ ...CLUB, viewerInterval: null }, instant)).toEqual({ open: null, next: null });
      for (const ended of ["left", "left_by_block", "account_deleted"] as const)
        expect(choose({ ...CLUB, viewerInterval: ended }, instant), ended).toEqual({ open: null, next: null });
      for (const account of ["deleting", "deleted", null] as const)
        expect(choose({ ...CLUB, viewerAccount: account }, instant), String(account)).toEqual({
          open: null,
          next: null,
        });
    }
  });

  it("gives nothing in a suspended club, and keeps a club that isn't suspended to the days its rows hold (FQ50)", () => {
    for (const instant of PHASES)
      expect(choose({ ...CLUB, clubSuspendedAt: at("2026-11-06T20:30:00Z") }, instant)).toEqual({
        open: null,
        next: null,
      });
  });

  it("never chooses a suspended or cancelled day, open or next, and moves next on to the day after it", () => {
    for (const status of ["suspended", "cancelled"] as const) {
      const facts = { ...CLUB, days: [BEN, { ...ANA, status }] };
      expect(ids(choose(facts, µs(SAT.reveal, -1))), status).toEqual({ open: null, next: "occ_mon" });
      expect(ids(choose(facts, SAT.reveal)), status).toEqual({ open: null, next: "occ_mon" });
    }
  });

  it("holds a day whose star left before its reveal, by any ending: never open, never next (FQ63)", () => {
    for (const state of ["left", "left_by_block", "account_deleted"] as const) {
      const held = { ...ANA, starIntervalState: state, starLeftAt: µs(SAT.reveal, -1), starEndedName: "Ana" };
      for (const instant of PHASES)
        expect(choose({ ...CLUB, days: [held] }, instant), `${state} ${instant.toString()}`).toEqual({
          open: null,
          next: null,
        });
    }
  });

  it("holds a day whose star asked to delete their account a microsecond before its reveal, whether the interval has ended yet or not (T27)", () => {
    const asked = µs(SAT.reveal, -1);
    const deleting = { ...ANA, starAccount: "deleting" as const, starDeletionRequestedAt: asked };
    const cases: DayFacts[] = [
      // The worker hasn't ended the interval yet.
      deleting,
      // It ended it before the reveal, and after it: either way the request decides.
      { ...deleting, starIntervalState: "account_deleted", starLeftAt: asked, starEndedName: "Ana" },
      { ...deleting, starIntervalState: "account_deleted", starLeftAt: µs(SAT.close, 5), starEndedName: "Ana" },
    ];
    for (const day of cases)
      for (const instant of PHASES)
        expect(choose({ ...CLUB, days: [day] }, instant), instant.toString()).toEqual({ open: null, next: null });
  });

  it("keeps a day open to its close when its star leaves or asks to delete at its reveal or after", () => {
    for (const when of [SAT.reveal, µs(SAT.reveal, 1)]) {
      const left = { ...ANA, starIntervalState: "left" as const, starLeftAt: when, starEndedName: "Ana" };
      const deleting = { ...ANA, starAccount: "deleting" as const, starDeletionRequestedAt: when };
      for (const day of [left, deleting]) {
        expect(ids(choose({ ...CLUB, days: [day] }, µs(SAT.close, -1)))).toEqual({ open: "occ_sat", next: null });
        expect(ids(choose({ ...CLUB, days: [day] }, SAT.close))).toEqual({ open: null, next: null });
      }
    }
  });

  it("refuses a held day's facts it can't read: a leaving that isn't an instant denies", () => {
    const strange = { ...ANA, starLeftAt: "2026-11-01T00:00:00Z" as unknown as Temporal.Instant };
    expect(ids(choose({ ...CLUB, days: [strange] }, SAT.reveal))).toEqual({ open: null, next: null });
  });
});

describe("the star as the club sees them (FQ75)", () => {
  it("names an active star by their account's name now, with their avatar's version while their account is active", () => {
    expect(choose(CLUB, SAT.reveal).open?.star).toEqual({
      membershipId: "mem_ana",
      displayName: "Ana",
      avatarVersion: "v_ana",
    });
    const renamed = { ...ANA, starName: "Anna" };
    expect(choose({ ...CLUB, days: [renamed] }, SAT.reveal).open?.star.displayName).toBe("Anna");
  });

  it("keeps the name and drops the avatar while a deletion asked for during the open day hasn't ended the interval", () => {
    const deleting = { ...ANA, starAccount: "deleting" as const, starDeletionRequestedAt: at("2026-11-07T09:00:00Z") };
    expect(choose({ ...CLUB, days: [deleting] }, at("2026-11-07T10:00:00Z")).open?.star).toEqual({
      membershipId: "mem_ana",
      displayName: "Ana",
      avatarVersion: null,
    });
  });

  it("names a star whose interval ended during the open day by the name it ended with, with no avatar", () => {
    const left = {
      ...ANA,
      starIntervalState: "left" as const,
      starLeftAt: at("2026-11-07T09:00:00Z"),
      starEndedName: "Ana B",
      starName: "Someone else",
    };
    expect(choose({ ...CLUB, days: [left] }, at("2026-11-07T10:00:00Z")).open?.star).toEqual({
      membershipId: "mem_ana",
      displayName: "Ana B",
      avatarVersion: null,
    });
  });

  it("leaves out an open day whose star has no name to show, and still gives the next day (B6, docs/LIMITATIONS.md)", () => {
    const gone = {
      ...ANA,
      starIntervalState: "account_deleted" as const,
      starLeftAt: at("2026-11-07T09:00:00Z"),
      starEndedName: null,
      starAccount: "deleted" as const,
      starName: null,
      starDeletionRequestedAt: at("2026-11-07T08:00:00Z"),
      starAvatarVersion: null,
    };
    expect(ids(choose({ ...CLUB, days: [BEN, gone] }, at("2026-11-07T10:00:00Z")))).toEqual({
      open: null,
      next: "occ_mon",
    });
  });
});

describe("reading a day the SQL chose (chosenDay)", () => {
  const row = {
    id: "occ_sat",
    club_id: "club_1",
    local_date: "2026-11-07",
    reveal_at: "2026-11-07T07:00:00+00:00",
    close_at: "2026-11-08T01:00:00+00:00",
    star_membership_id: "mem_ana",
    star_name: "Ana",
    star_avatar_version: null,
  };

  it("reads jsonb's instants in any session offset, whole, with the phase of its column", () => {
    expect(chosenDay(row, "collecting")).toEqual({
      id: "occ_sat",
      clubId: "club_1",
      star: { membershipId: "mem_ana", displayName: "Ana", avatarVersion: null },
      localDate: "2026-11-07",
      revealAt: SAT.reveal,
      closeAt: SAT.close,
      phase: "collecting",
    });
    const elsewhere = { ...row, reveal_at: "2026-11-07T02:00:00-05:00", star_avatar_version: "v_ana" };
    expect(chosenDay(elsewhere, "open")?.revealAt).toEqual(SAT.reveal);
    expect(chosenDay(elsewhere, "open")?.star.avatarVersion).toBe("v_ana");
    expect(chosenDay({ ...row, reveal_at: "2026-11-07T06:59:59.999999+00:00" }, "open")?.revealAt).toEqual(
      µs(SAT.reveal, -1),
    );
    expect(chosenDay(null, "open")).toBeNull();
  });

  it("refuses anything outside the shape rather than show it", () => {
    const wrong: unknown[] = [
      [],
      "occ_sat",
      { ...row, id: "" },
      { ...row, club_id: 7 },
      { ...row, local_date: "7 November" },
      { ...row, reveal_at: "tomorrow" },
      { ...row, reveal_at: null },
      { ...row, close_at: row.reveal_at },
      { ...row, star_name: null },
      { ...row, star_avatar_version: "" },
      { ...row, star_avatar_version: undefined },
      { ...row, star_membership_id: undefined },
    ];
    for (const value of wrong) expect(() => chosenDay(value, "open"), JSON.stringify(value)).toThrow(/shape/);
  });
});
