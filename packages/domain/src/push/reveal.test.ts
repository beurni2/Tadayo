/// <reference lib="esnext.temporal" />
// The reveal push's rules on their own (./reveal.ts; spec 21; T36, T37, T42; FQ30; docs/plans/api-b2-spike-push.md,
// section 2): quiet hours in several zones and across a change of the clocks, the budget's day, the two bodies and
// the copy lint's rules on them, the payload's keys, and each step of the decision alone and in its order. The same
// decisions on rows, through the worker's transactions, are tests/src/db/worker-push.test.ts'.

import { describe, expect, it } from "vitest";
import type { DayFacts } from "../authorization/days.ts";
import { lintString } from "../copy/rules.ts";
import type { ServerNow } from "../time/clock.ts";
import {
  budgetDay,
  dayClosed,
  decideReveal,
  plannedDueAt,
  PUSH_BUDGET,
  quietFrom,
  quietUntil,
  revealBody,
  revealPayload,
  SKIP_CODES,
  STAR_BODY,
  type RevealFacts,
} from "./reveal.ts";

const serverNow = (instant: Temporal.Instant) => instant as ServerNow;
const at = (text: string) => Temporal.Instant.from(text);
const now = (text: string) => serverNow(at(text));

// Debby's Saturday in a New York club: 07:00 there is 12:00Z in November, and it closes at 01:00 there, 06:00Z.
const REVEAL = at("2026-11-07T12:00:00Z");
const CLOSE = at("2026-11-08T06:00:00Z");
const DAY: DayFacts = {
  id: "occ_sat",
  clubId: "club_ny",
  status: "scheduled",
  localDate: "2026-11-07",
  revealAt: REVEAL,
  closeAt: CLOSE,
  starInterval: "mem_debby",
  starIntervalState: "active",
  starLeftAt: null,
  starEndedName: null,
  starAccount: "active",
  starName: "Debby",
  starDeletionRequestedAt: null,
  starAvatarVersion: null,
};
const FACTS: RevealFacts = {
  day: DAY,
  account: "active",
  isStar: false,
  readsADrop: true,
  deviceZone: "Europe/London",
  counted: false,
  spent: 0,
};

describe("quiet hours, 23:00 to 08:00 in the device's zone (T37)", () => {
  it("holds a 07:00 reveal in New York to 08:00 there, and sends at once where it is day", () => {
    expect(plannedDueAt(REVEAL, "America/New_York")).toEqual(at("2026-11-07T13:00:00Z"));
    // London is at 12:00, past its quiet hours; Tokyo at 21:00, before them.
    expect(plannedDueAt(REVEAL, "Europe/London")).toEqual(REVEAL);
    expect(plannedDueAt(REVEAL, "Asia/Tokyo")).toEqual(REVEAL);
    // Auckland is at 01:00 the next day: 08:00 there that morning.
    expect(plannedDueAt(REVEAL, "Pacific/Auckland")).toEqual(at("2026-11-07T19:00:00Z"));
  });

  it("counts 23:00 as quiet and 08:00 as not, and carries 23:00 over to the next morning", () => {
    expect(quietUntil(now("2026-11-07T23:00:00Z"), "Europe/London")).toEqual(at("2026-11-08T08:00:00Z"));
    expect(quietUntil(now("2026-11-07T22:59:59.999999Z"), "Europe/London")).toBeNull();
    expect(quietUntil(now("2026-11-07T07:59:59.999999Z"), "Europe/London")).toEqual(at("2026-11-07T08:00:00Z"));
    expect(quietUntil(now("2026-11-07T08:00:00Z"), "Europe/London")).toBeNull();
    expect(quietUntil(now("2026-11-08T03:00:00Z"), "Europe/London")).toEqual(at("2026-11-08T08:00:00Z"));
  });

  it("ends at 08:00 on the wall across a change of the clocks", () => {
    // London goes back an hour at 02:00 on 25 October 2026: 08:00 that morning is 08:00Z, not 07:00Z.
    expect(quietUntil(now("2026-10-24T23:30:00+01:00"), "Europe/London")).toEqual(at("2026-10-25T08:00:00Z"));
    // New York goes forward on 8 March 2026: 08:00 that morning is 12:00Z.
    expect(quietUntil(now("2026-03-08T05:00:00Z"), "America/New_York")).toEqual(at("2026-03-08T12:00:00Z"));
  });

  it("starts the next quiet hours at 23:00 that evening, or the next evening's from 23:00 on", () => {
    expect(quietFrom(now("2026-11-07T12:00:00Z"), "Europe/London")).toEqual(at("2026-11-07T23:00:00Z"));
    expect(quietFrom(now("2026-11-07T22:59:59.999999Z"), "Europe/London")).toEqual(at("2026-11-07T23:00:00Z"));
    expect(quietFrom(now("2026-11-07T23:00:00Z"), "Europe/London")).toEqual(at("2026-11-08T23:00:00Z"));
    // 12:00Z is 21:00 in Tokyo: 23:00 there is 14:00Z.
    expect(quietFrom(now("2026-11-07T12:00:00Z"), "Asia/Tokyo")).toEqual(at("2026-11-07T14:00:00Z"));
    // On the day London's clocks go back, 23:00 is 23:00Z, after a 25-hour day.
    expect(quietFrom(now("2026-10-25T12:00:00Z"), "Europe/London")).toEqual(at("2026-10-25T23:00:00Z"));
  });

  it("closes a day at its close and not a microsecond before", () => {
    expect(dayClosed(CLOSE, serverNow(CLOSE))).toBe(true);
    expect(dayClosed(CLOSE, serverNow(CLOSE.subtract({ microseconds: 1 })))).toBe(false);
  });

  it("refuses a zone the server doesn't resolve, and a time that isn't a clock's", () => {
    expect(() => plannedDueAt(REVEAL, "Mars/Olympus")).toThrow();
    expect(() => quietUntil(REVEAL.add({ nanoseconds: 1 }) as ServerNow, "Europe/London")).toThrow();
    expect(() => quietFrom(REVEAL as ServerNow, "Mars/Olympus")).toThrow();
    expect(() => quietFrom(REVEAL.add({ nanoseconds: 1 }) as ServerNow, "Europe/London")).toThrow();
    expect(() => dayClosed(CLOSE, REVEAL.add({ nanoseconds: 1 }) as ServerNow)).toThrow();
  });
});

describe("the budget's day, in the zone of the member's latest device (FQ30)", () => {
  it("runs from the local day's start to the next, in that zone", () => {
    expect(budgetDay(now("2026-11-07T12:00:00Z"), "America/New_York")).toEqual({
      from: at("2026-11-07T05:00:00Z"),
      until: at("2026-11-08T05:00:00Z"),
    });
    expect(budgetDay(now("2026-11-07T23:30:00Z"), "Asia/Tokyo")).toEqual({
      from: at("2026-11-07T15:00:00Z"),
      until: at("2026-11-08T15:00:00Z"),
    });
  });

  it("is 25 hours on the day the clocks go back", () => {
    const day = budgetDay(now("2026-10-25T12:00:00Z"), "Europe/London");
    expect(day.until.since(day.from).total("hours")).toBe(25);
  });
});

describe("the words (spec 21; T41 to T43)", () => {
  it("tells the star it's their day, and the others the star's name, with the app's apostrophe", () => {
    expect(revealBody(true, "Debby")).toBe("It’s your day. Your collection is ready");
    expect(STAR_BODY).toBe(revealBody(true, "Anyone"));
    expect(revealBody(false, "Debby")).toBe("Debby’s day is ready");
    expect(revealBody(false, "James")).toBe("James’s day is ready");
  });

  it("passes the copy lint's rules: no banned word, no pronoun, no straight apostrophe", () => {
    for (const body of [revealBody(true, "Debby"), revealBody(false, "Debby")]) expect(lintString(body)).toEqual([]);
  });

  it("refuses a ready message with no name to give", () => {
    expect(() => revealBody(false, "")).toThrow();
  });
});

describe("the payload (the plan's section 2.4)", () => {
  it("holds the body, the sound, the club's thread and the deep link, and nothing else", () => {
    const payload = revealPayload("Debby’s day is ready", "club_ny", "occ_sat");
    expect(JSON.parse(JSON.stringify(payload))).toEqual({
      aps: { alert: { body: "Debby’s day is ready" }, sound: "default", "thread-id": "club_ny" },
      tadayo: { open: "day", club_id: "club_ny", occurrence_id: "occ_sat" },
    });
  });

  it("refuses an id that isn't one", () => {
    expect(() => revealPayload("x", "club ny", "occ_sat")).toThrow();
    expect(() => revealPayload("x", "club_ny", "o".repeat(65))).toThrow();
  });
});

describe("the decision at dispatch (the plan's section 2.3)", () => {
  const LONDON_NOON = now("2026-11-07T12:00:00Z");

  // London's 23:00, when Apple stops trying to deliver a push sent at its noon.
  const LONDON_NIGHT = at("2026-11-07T23:00:00Z");

  it("sends the others' words to a reader, and the star's to the star", () => {
    expect(decideReveal(FACTS, LONDON_NOON)).toEqual({
      kind: "send",
      body: "Debby’s day is ready",
      expiresAt: LONDON_NIGHT,
    });
    expect(decideReveal({ ...FACTS, isStar: true }, LONDON_NOON)).toEqual({
      kind: "send",
      body: STAR_BODY,
      expiresAt: LONDON_NIGHT,
    });
  });

  it("lets Apple deliver it until the device's next 23:00 or the day's close, whichever comes first (T37)", () => {
    // A send's expiry as text: vitest's toMatchObject compares no Temporal value, so it would check nothing.
    const expiryOf = (decision: ReturnType<typeof decideReveal>): string => {
      if (decision.kind !== "send") throw new Error(`not a send: ${decision.kind}`);
      return decision.expiresAt.toString();
    };
    // 12:00Z is 21:00 in Tokyo: a phone that is off then isn't woken at 23:00 there, 14:00Z, or after.
    expect(expiryOf(decideReveal({ ...FACTS, deviceZone: "Asia/Tokyo" }, LONDON_NOON))).toBe("2026-11-07T14:00:00Z");
    // At 22:00Z London is an hour from its 23:00; at 05:00Z, 21:00 in Los Angeles, its 23:00 comes after the close.
    expect(expiryOf(decideReveal(FACTS, now("2026-11-07T22:00:00Z")))).toBe(LONDON_NIGHT.toString());
    expect(expiryOf(decideReveal({ ...FACTS, deviceZone: "America/Los_Angeles" }, now("2026-11-08T05:00:00Z")))).toBe(
      CLOSE.toString(),
    );
  });

  it("names a star who left after the reveal by the name they left with (FQ75)", () => {
    const left: DayFacts = {
      ...DAY,
      starIntervalState: "left",
      starLeftAt: at("2026-11-07T12:30:00Z"),
      starEndedName: "Debs",
    };
    expect(decideReveal({ ...FACTS, day: left }, now("2026-11-07T13:00:00Z"))).toEqual({
      kind: "send",
      body: "Debs’s day is ready",
      expiresAt: LONDON_NIGHT,
    });
  });

  it("skips each recheck alone, with its code", () => {
    const cases: [Partial<RevealFacts>, string][] = [
      [{ day: { ...DAY, status: "suspended" } }, "held"],
      [{ day: { ...DAY, status: "cancelled" } }, "held"],
      [
        { day: { ...DAY, starLeftAt: at("2026-11-07T11:00:00Z"), starIntervalState: "left", starEndedName: "Debby" } },
        "held",
      ],
      [{ day: { ...DAY, starDeletionRequestedAt: at("2026-11-07T11:00:00Z"), starAccount: "deleting" } }, "held"],
      [{ day: { ...DAY, starName: null } }, "held"],
      [{ account: "deleting" }, "account"],
      [{ account: "deleted" }, "account"],
      [{ readsADrop: false }, "unreadable"],
      [{ deviceZone: null }, "unregistered"],
      [{ spent: PUSH_BUDGET }, "budget"],
    ];
    for (const [change, code] of cases) {
      expect(decideReveal({ ...FACTS, ...change }, LONDON_NOON), code).toEqual({ kind: "skip", code });
    }
  });

  it("skips a day that has closed, at its close and after, before anything else", () => {
    expect(decideReveal({ ...FACTS, readsADrop: false }, serverNow(CLOSE))).toEqual({ kind: "skip", code: "closed" });
    // A microsecond before the close is 14:59 in Tokyo, outside its quiet hours.
    expect(
      decideReveal({ ...FACTS, deviceZone: "Asia/Tokyo" }, serverNow(CLOSE.subtract({ microseconds: 1 }))),
    ).toEqual({
      kind: "send",
      body: "Debby’s day is ready",
      expiresAt: CLOSE,
    });
  });

  it("takes the rechecks in their order: held, then the account, the read, the registration", () => {
    expect(decideReveal({ ...FACTS, day: { ...DAY, status: "suspended" }, account: "deleting" }, LONDON_NOON)).toEqual({
      kind: "skip",
      code: "held",
    });
    expect(decideReveal({ ...FACTS, account: "deleting", readsADrop: false }, LONDON_NOON)).toEqual({
      kind: "skip",
      code: "account",
    });
    expect(decideReveal({ ...FACTS, readsADrop: false, deviceZone: null }, LONDON_NOON)).toEqual({
      kind: "skip",
      code: "unreadable",
    });
    expect(decideReveal({ ...FACTS, deviceZone: null, spent: 9 }, LONDON_NOON)).toEqual({
      kind: "skip",
      code: "unregistered",
    });
  });

  it("holds a device in its quiet hours to their end, in the zone it holds now, before the budget", () => {
    // 12:00Z is 07:00 in New York.
    expect(decideReveal({ ...FACTS, deviceZone: "America/New_York", spent: 9 }, LONDON_NOON)).toEqual({
      kind: "hold",
      until: at("2026-11-07T13:00:00Z"),
    });
  });

  it("skips as quiet a device whose quiet hours outlast the day", () => {
    // At 05:30Z, 00:30 in New York, a device in London is at 05:30: its quiet hours end at 08:00Z, after the close.
    expect(decideReveal(FACTS, now("2026-11-08T05:30:00Z"))).toEqual({ kind: "skip", code: "quiet" });
  });

  it("keeps two a day: a third is skipped, and a day already counted goes again", () => {
    expect(decideReveal({ ...FACTS, spent: PUSH_BUDGET - 1 }, LONDON_NOON).kind).toBe("send");
    expect(decideReveal({ ...FACTS, spent: PUSH_BUDGET }, LONDON_NOON)).toEqual({ kind: "skip", code: "budget" });
    expect(decideReveal({ ...FACTS, spent: PUSH_BUDGET, counted: true }, LONDON_NOON).kind).toBe("send");
    expect(PUSH_BUDGET).toBe(2);
  });

  it("refuses to decide before the day has opened", () => {
    expect(() => decideReveal(FACTS, serverNow(REVEAL.subtract({ microseconds: 1 })))).toThrow();
  });

  it("names each code it can skip with", () => {
    expect([...SKIP_CODES]).toEqual(["closed", "held", "account", "unreadable", "unregistered", "quiet", "budget"]);
  });
});
