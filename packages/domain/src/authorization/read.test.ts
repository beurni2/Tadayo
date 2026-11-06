/// <reference lib="esnext.temporal" />
// The read predicate on its own (TECH-DESIGN section 8, "Domain": the read predicate): each
// condition alone, the reveal's edge, the held day's edge, and facts that are missing or strange.
// Every role of the privacy matrix, built from rows, runs through it and through the SQL filter in
// tests/src/db/authorization.test.ts.

import { describe, expect, it } from "vitest";
import type { ServerNow } from "../time/clock.ts";
import { mayRead, READS, type DropReadFacts, type ReadWhat } from "./read.ts";

/** The server's time, as only a clock makes it; here the tests stand in for one. */
const serverNow = (instant: Temporal.Instant) => instant as ServerNow;

const REVEAL = Temporal.Instant.from("2026-11-07T07:00:00Z");
const CLOSE = Temporal.Instant.from("2026-11-08T01:00:00Z");

/** Collecting (a microsecond before the reveal), open (the reveal itself), past (the close, and later). */
const INSTANTS = {
  collecting: REVEAL.subtract({ microseconds: 1 }),
  open: REVEAL,
  past: CLOSE,
  later: CLOSE.add({ hours: 24 * 400 }),
} as const;

/** A member in the drop's audience, with nothing denying. */
const READER: DropReadFacts = {
  viewerAccount: "active",
  viewerInterval: "active",
  drop: "active",
  day: "scheduled",
  clubSuspendedAt: null,
  revealAt: REVEAL,
  starLeftAt: null,
  authorAccount: "active",
  blocked: false,
};

function reads(facts: DropReadFacts | null, at: Temporal.Instant): Record<ReadWhat, boolean> {
  const now = serverNow(at);
  return {
    caption: mayRead(facts, "caption", now),
    media: mayRead(facts, "media", now),
    reactions: mayRead(facts, "reactions", now),
  };
}

const NOTHING = { caption: false, media: false, reactions: false };

describe("T9: a member in the audience, with nothing denying", () => {
  // The author and the star read through it as members of the audience (T8); each other role of
  // the privacy matrix is a denial below, and tests/src/db/authorization.test.ts builds every role
  // from rows.
  it("reads the caption while collecting, and everything once the day opens, for good", () => {
    expect(reads(READER, INSTANTS.collecting)).toEqual({ caption: true, media: false, reactions: false });
    for (const now of [INSTANTS.open, INSTANTS.past, INSTANTS.later]) {
      expect(reads(READER, now)).toEqual({ caption: true, media: true, reactions: true });
    }
  });
});

describe("T23: each denial beats every grant", () => {
  const denials: [string, Partial<DropReadFacts>][] = [
    ["the viewer's account deleting (T27)", { viewerAccount: "deleting" }],
    ["the viewer's account deleted", { viewerAccount: "deleted" }],
    ["no account with the viewer's id", { viewerAccount: null }],
    ["no interval of the viewer's in the audience (T8)", { viewerInterval: null }],
    ["the viewer's interval left", { viewerInterval: "left" }],
    ["the viewer's interval ended by a block", { viewerInterval: "left_by_block" }],
    ["the viewer's interval ended by a deletion", { viewerInterval: "account_deleted" }],
    ["the drop held (T29)", { drop: "held" }],
    ["the drop withdrawn", { drop: "withdrawn" }],
    ["the drop removed, as pictured or by moderation", { drop: "removed" }],
    ["the day suspended", { day: "suspended" }],
    ["the day cancelled", { day: "cancelled" }],
    ["the club suspended", { clubSuspendedAt: Temporal.Instant.from("2026-11-06T21:00:00Z") }],
    ["the club suspended, at an instant after now", { clubSuspendedAt: CLOSE.add({ hours: 24 * 800 }) }],
    ["the star left before the day opened (FQ63)", { starLeftAt: REVEAL.subtract({ microseconds: 1 }) }],
    ["the author's account deleting (T27, spec 23)", { authorAccount: "deleting" }],
    ["the author's account deleted", { authorAccount: "deleted" }],
    ["a block between the viewer and the author (FQ88)", { blocked: true }],
  ];
  for (const [denial, change] of denials) {
    it(`denies everything with ${denial}`, () => {
      for (const now of Object.values(INSTANTS)) expect(reads({ ...READER, ...change }, now)).toEqual(NOTHING);
    });
  }
});

describe("T1, T9: the reveal is reached at reveal_at, by the server's time", () => {
  it("holds media and reactions back until the very microsecond of reveal_at", () => {
    expect(reads(READER, REVEAL.subtract({ microseconds: 1 }))).toEqual({
      caption: true,
      media: false,
      reactions: false,
    });
    expect(reads(READER, REVEAL)).toEqual({ caption: true, media: true, reactions: true });
  });

  it("keeps a day open after its star leaves once it has opened (FQ63)", () => {
    for (const starLeftAt of [REVEAL, REVEAL.add({ hours: 2 }), CLOSE.add({ hours: 1 })]) {
      expect(reads({ ...READER, starLeftAt }, INSTANTS.later)).toEqual({ caption: true, media: true, reactions: true });
    }
  });
});

describe("T14: missing and unauthorized get the same answer", () => {
  it("answers false for a drop that doesn't exist, as for one the viewer may not read", () => {
    for (const now of Object.values(INSTANTS)) {
      expect(reads(null, now)).toEqual(NOTHING);
      expect(reads(null, now)).toEqual(reads({ ...READER, viewerInterval: null }, now));
    }
  });

  it("takes only the three reads and the server's time to the microsecond, and refuses anything else", () => {
    expect(READS).toEqual(["caption", "media", "reactions"]);
    expect(() => mayRead(READER, "comments" as ReadWhat, serverNow(INSTANTS.past))).toThrow(TypeError);
    expect(() => mayRead(READER, "media", new Date("2026-11-08T00:00:00Z") as unknown as ServerNow)).toThrow(TypeError);
    expect(() => mayRead(READER, "media", "2026-11-08T00:00:00Z" as unknown as ServerNow)).toThrow(TypeError);
    // A ZonedDateTime has whole microseconds and Temporal.Instant.compare takes it, so only the
    // type check refuses it.
    const zoned = INSTANTS.past.toZonedDateTimeISO("UTC");
    expect(() => mayRead(READER, "media", zoned as unknown as ServerNow)).toThrow(TypeError);
    // Finer than Postgres keeps: the SQL path would round it, so neither path takes it.
    expect(() => mayRead(READER, "media", serverNow(REVEAL.subtract({ nanoseconds: 1 })))).toThrow(RangeError);
  });
});

describe("fails closed: a fact that is missing, of the wrong type or unknown never grants", () => {
  const strange: unknown[] = [undefined, "pending", "", 0, 1, true, "ACTIVE", {}];
  for (const key of Object.keys(READER) as (keyof DropReadFacts)[]) {
    if (key === "revealAt") continue;
    it(`denies or throws, never grants, whatever ${key} holds that isn't a granting value`, () => {
      for (const value of strange) {
        if ((key === "clubSuspendedAt" || key === "starLeftAt") && value === null) continue;
        if (key === "blocked" && value === false) continue;
        const facts: DropReadFacts = { ...READER, [key]: value };
        for (const now of Object.values(INSTANTS)) {
          for (const what of READS) {
            let granted: boolean;
            try {
              granted = mayRead(facts, what, serverNow(now));
            } catch {
              granted = false;
            }
            expect(granted, `${key} = ${JSON.stringify(value)}, ${what}`).toBe(false);
          }
        }
      }
    });
  }

  it("never reveals media or reactions, or opens a held day, by an instant that isn't a Temporal.Instant", () => {
    for (const value of [undefined, null, "2026-11-07T07:00:00Z", 0, new Date("2026-11-07T07:00:00Z")]) {
      const revealAt = { ...READER, revealAt: value } as unknown as DropReadFacts;
      const starLeftAt = {
        ...READER,
        starLeftAt: value === null ? "2026-11-07T08:00:00Z" : value,
      } as unknown as DropReadFacts;
      for (const what of ["media", "reactions"] as const) {
        expect(mayRead(revealAt, what, serverNow(INSTANTS.later)), `reveal_at ${String(value)}`).toBe(false);
      }
      for (const what of READS) {
        expect(mayRead(starLeftAt, what, serverNow(INSTANTS.later)), `the star's left_at ${String(value)}`).toBe(false);
      }
    }
  });
});
