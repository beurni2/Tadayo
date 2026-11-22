/// <reference lib="esnext.temporal" />
// The reservations' judges, judged (./reservation.ts): each branch of what a cell must get from
// createReservation and releaseReservation, and of what the rows after either must hold, is shown to refuse an
// answer or a set of rows that breaks it, on a world written out here by hand, with no database (T3, T4, T14,
// T15, T17, T18, T19, T20; addendum 2; FQ50, FQ63).

import { STATUS_CODES } from "node:http";
import { describe, expect, it } from "vitest";
import { NEUTRAL } from "./harness.ts";
import {
  adderOf,
  allowanceIn,
  heldProblems,
  MEMBERSHIP_CHANGED,
  RESERVATION_JUDGED,
  RESERVE_NO_BODY,
  RESERVE_TABLE,
  releasedProblems,
  releaseExpected,
  releaseOutcome,
  reserveExpected,
  reserveOutcome,
  takes,
  type ReserveOutcome,
} from "./reservation.ts";
import type {
  Answer,
  WorldAccount,
  WorldClub,
  WorldDay,
  WorldDrop,
  WorldFacts,
  WorldMember,
  WorldReservation,
} from "./scanner.ts";

const at = (text: string) => Temporal.Instant.from(text);
const CLUB = "clb_here";
/** Ana's Saturday 7 November 2026: 7 AM in New York, closing at 1 AM. */
const SAT = "occ_sat";
const REVEAL = at("2026-11-07T12:00:00Z");
const CLOSE = at("2026-11-08T06:00:00Z");
/** Ana's next Saturday. */
const NEXT = "occ_next";
/** Friday 6 November 2026, 9:41 AM in New York, with a fraction the contract rounds down. */
const NOW = at("2026-11-06T14:41:00.5Z");

const account = (more: Partial<WorldAccount> = {}): WorldAccount => ({
  state: "active",
  deletionRequestedAt: null,
  name: "someone",
  avatar: null,
  ageConfirmed: true,
  version: 1,
  ...more,
});

const member = (who: string, more: Partial<WorldMember> = {}): WorldMember => ({
  club: CLUB,
  account: `usr_${who}`,
  name: who,
  joinedAt: at("2026-10-01T00:00:00Z"),
  leftAt: null,
  ...more,
});

const day = (more: Partial<WorldDay> = {}): WorldDay => ({
  club: CLUB,
  star: "itv_ana",
  localDate: "2026-11-07",
  revealAt: REVEAL,
  closeAt: CLOSE,
  collectingFrom: at("2026-10-31T06:00:00Z"),
  status: "scheduled",
  ...more,
});

const drop = (author: string, media: WorldDrop["media"], more: Partial<WorldDrop> = {}): WorldDrop => ({
  author,
  day: SAT,
  media,
  state: "active",
  endedAt: null,
  caption: null,
  audience: new Set(),
  comments: [],
  ...more,
});

const slot = (interval: string, media: WorldReservation["media"], more: Partial<WorldReservation> = {}) => ({
  interval,
  day: SAT,
  media,
  state: "live" as WorldReservation["state"],
  expiresAt: NOW.add({ minutes: 20 }),
  drop: null,
  ...more,
});

/** Ana, Ben and Cleo's club, Ana's Saturday and the next, and Zed, who is in no club; changed by `over`. */
function world(
  over: {
    drops?: Record<string, WorldDrop>;
    reservations?: Record<string, WorldReservation>;
    members?: Record<string, Partial<WorldMember>>;
    accounts?: Record<string, Partial<WorldAccount>>;
    club?: Partial<WorldClub>;
    sat?: Partial<WorldDay>;
  } = {},
): WorldFacts {
  const members = new Map<string, WorldMember>(
    ["ana", "ben", "cleo"].map((who) => [`itv_${who}`, member(who, over.members?.[`itv_${who}`])]),
  );
  for (const [id, more] of Object.entries(over.members ?? {}))
    if (!members.has(id)) members.set(id, member(id.slice(4), more));
  return {
    drops: new Map(Object.entries(over.drops ?? {})),
    days: new Map([
      [SAT, day(over.sat)],
      [
        NEXT,
        day({
          localDate: "2026-11-14",
          revealAt: at("2026-11-14T12:00:00Z"),
          closeAt: at("2026-11-15T06:00:00Z"),
        }),
      ],
    ]),
    members,
    clubs: new Map([[CLUB, { name: "The Saturdays", suspendedAt: null, labels: new Map(), ...over.club }]]),
    reservations: new Map(Object.entries(over.reservations ?? {})),
    canaries: new Map(),
    accounts: new Map(
      ["ana", "ben", "cleo", "zed"].map((who) => [`usr_${who}`, account(over.accounts?.[`usr_${who}`])] as const),
    ),
    invitations: new Map(),
  };
}

const answer = (body: unknown, status: number, more: Record<string, string> = {}): Answer => {
  const text = JSON.stringify(body);
  return {
    status,
    reason: STATUS_CODES[status] ?? "",
    headers: {
      "cache-control": "private, no-store",
      "content-type": "application/json; charset=utf-8",
      "content-length": String(Buffer.byteLength(text)),
      date: new Date().toUTCString(),
      connection: "keep-alive",
      ...more,
    },
    body: text,
  };
};

const occurrence = (id: string, phase: string, reveal: string, close: string, localDate: string) => ({
  id,
  club_id: CLUB,
  star: { membership_id: "itv_ana", display_name: "ana" },
  local_date: localDate,
  reveal_at: reveal,
  close_at: close,
  phase,
});
const SAT_AS = (phase: string) => occurrence(SAT, phase, "2026-11-07T12:00:00Z", "2026-11-08T06:00:00Z", "2026-11-07");
const NEXT_COLLECTING = occurrence(NEXT, "collecting", "2026-11-14T12:00:00Z", "2026-11-15T06:00:00Z", "2026-11-14");

const FRIEND = { limit: 3, photo_limit: 2, external_limit: 1, is_star: false };
const STAR = { limit: 6, photo_limit: 6, external_limit: 2, is_star: true };
const counts = (added: [number, number], reserved: [number, number]) => ({
  added: added[0] + added[1],
  reserved: reserved[0] + reserved[1],
  photo_added: added[0],
  photo_reserved: reserved[0],
  external_added: added[1],
  external_reserved: reserved[1],
});

describe("the operations this file judges, and its table", () => {
  it("judges the two reservation routes, and sends two photos, three links and three photos", () => {
    expect([...RESERVATION_JUDGED].sort()).toEqual(["createReservation", "releaseReservation"]);
    expect(RESERVE_TABLE).toEqual([
      "photo",
      "photo",
      "external_video",
      "external_video",
      "external_video",
      "photo",
      "photo",
      "photo",
    ]);
    expect(RESERVE_NO_BODY.body).toBe('{"code":"INVALID_REQUEST"}');
    expect(MEMBERSHIP_CHANGED.status).toBe(409);
  });
});

describe("who may add to a day (adderOf)", () => {
  it("is an active account's active interval in the day's club, while the club and the day allow it", () => {
    expect(adderOf(world(), "usr_ben", SAT)).toBe("itv_ben");
    expect(adderOf(world(), "usr_ana", SAT)).toBe("itv_ana");
    expect(adderOf(world(), "usr_zed", SAT)).toBeUndefined();
    expect(adderOf(world(), null, SAT)).toBeUndefined();
    expect(adderOf(world(), "usr_ben", "occ_nobody")).toBeUndefined();
    expect(adderOf(world({ members: { itv_ben: { leftAt: NOW } } }), "usr_ben", SAT)).toBeUndefined();
    expect(adderOf(world({ accounts: { usr_ben: { state: "deleting" } } }), "usr_ben", SAT)).toBeUndefined();
    expect(adderOf(world({ club: { suspendedAt: NOW } }), "usr_ben", SAT)).toBeUndefined();
    expect(adderOf(world({ sat: { status: "suspended" } }), "usr_ben", SAT)).toBeUndefined();
    expect(adderOf(world({ sat: { status: "cancelled" } }), "usr_ben", SAT)).toBeUndefined();
    // A rejoined member adds by the interval that is active now, never the one that ended.
    const rejoined = world({
      members: { itv_ben: { leftAt: NOW.subtract({ hours: 1 }) }, itv_ben2: { account: "usr_ben" } },
    });
    expect(adderOf(rejoined, "usr_ben", SAT)).toBe("itv_ben2");
  });

  it("is nobody's for a day that closed before the caller's interval began, and the interval's while it was open (Q06)", () => {
    const joined = (when: Temporal.Instant) =>
      world({
        members: { itv_ben: { leftAt: NOW.subtract({ hours: 1 }) }, itv_ben2: { account: "usr_ben", joinedAt: when } },
      });
    expect(adderOf(joined(CLOSE), "usr_ben", SAT)).toBeUndefined();
    expect(adderOf(joined(CLOSE.add({ hours: 1 })), "usr_ben", SAT)).toBeUndefined();
    expect(adderOf(joined(CLOSE.subtract({ microseconds: 1 })), "usr_ben", SAT)).toBe("itv_ben2");
    expect(adderOf(joined(CLOSE.add({ hours: 1 })), "usr_ben", NEXT)).toBe("itv_ben2");
  });
});

describe("the allowance in a day, by role (allowanceIn; T15, T17, T18; addendum 2)", () => {
  it("counts the interval's own drops and live slots, with the limits of its role there", () => {
    const w = world({
      drops: {
        d1: drop("itv_ben", "photo"),
        d2: drop("itv_ben", "external_video", { state: "removed", endedAt: NOW }),
        d3: drop("itv_ben", "photo", { state: "withdrawn", endedAt: NOW }),
        d4: drop("itv_ben", "photo", { state: "withdrawn", endedAt: REVEAL.add({ minutes: 1 }) }),
        d5: drop("itv_cleo", "photo"),
        d6: drop("itv_ben", "photo", { day: NEXT }),
      },
      reservations: {
        r1: slot("itv_ben", "photo"),
        r2: slot("itv_ben", "photo", { expiresAt: NOW }),
        r3: slot("itv_ben", "external_video", { state: "released" }),
        r4: slot("itv_cleo", "photo"),
      },
    });
    // d3 was withdrawn before the reveal, so its slot came back; d4 after, so it still counts. r2 has lapsed.
    expect(allowanceIn(w, SAT, "itv_ben", NOW)).toEqual({ ...counts([2, 1], [1, 0]), ...FRIEND });
    expect(allowanceIn(w, SAT, "itv_ana", NOW)).toEqual({ ...counts([0, 0], [0, 0]), ...STAR });
    expect(allowanceIn(w, SAT, "itv_ben", NOW, { media: "external_video", by: 1 })).toEqual({
      ...counts([2, 1], [1, 1]),
      ...FRIEND,
    });
    expect(allowanceIn(w, SAT, "itv_ben", NOW, { media: "photo", by: -1 })).toEqual({
      ...counts([2, 1], [0, 0]),
      ...FRIEND,
    });
    expect(() => allowanceIn(w, "occ_nobody", "itv_ben", NOW)).toThrow();
  });
});

describe("what createReservation must answer (reserveOutcome, reserveExpected)", () => {
  const outcome = (w: WorldFacts, who: string, media: "photo" | "external_video", now = NOW) =>
    reserveOutcome(w, who, SAT, media, now);
  const refused = (code: string, body: Record<string, unknown>) => answer({ code, ...body }, 409);

  it("gives the neutral not-found to anyone who may not add to the day, the same bytes (T14)", () => {
    for (const w of [world(), world({ club: { suspendedAt: NOW } }), world({ sat: { status: "cancelled" } })]) {
      expect(outcome(w, "usr_zed", "photo")).toEqual({ kind: "pinned", answer: NEUTRAL });
    }
    expect(outcome(world({ members: { itv_ben: { leftAt: NOW } } }), "usr_ben", "photo")).toEqual({
      kind: "pinned",
      answer: NEUTRAL,
    });
    expect(reserveExpected({ kind: "pinned", answer: NEUTRAL })).toBe(NEUTRAL);
  });

  it("answers MEMBERSHIP_CHANGED, with no fact, for a day whose star left or asked to delete before its reveal (FQ63)", () => {
    const left = world({ members: { itv_ana: { leftAt: NOW.subtract({ hours: 1 }) } } });
    expect(outcome(left, "usr_ben", "photo")).toEqual({ kind: "pinned", answer: MEMBERSHIP_CHANGED });
    const deleting = world({ accounts: { usr_ana: { deletionRequestedAt: NOW.subtract({ hours: 1 }) } } });
    expect(outcome(deleting, "usr_ben", "photo")).toEqual({ kind: "pinned", answer: MEMBERSHIP_CHANGED });
    // The star leaving after the reveal changes nothing before it.
    const later = world({ members: { itv_ana: { leftAt: REVEAL.add({ hours: 1 }) } } });
    expect(outcome(later, "usr_ben", "photo").kind).toBe("held");
  });

  it("gives the neutral not-found, never MEMBERSHIP_CHANGED, on a held day to anyone who may not add to it (T14)", () => {
    const gone = { itv_ana: { leftAt: NOW.subtract({ hours: 1 }) } };
    expect(outcome(world({ members: gone }), "usr_zed", "photo")).toEqual({ kind: "pinned", answer: NEUTRAL });
    for (const w of [
      world({ members: gone, club: { suspendedAt: NOW } }),
      world({ members: gone, sat: { status: "suspended" } }),
      world({ members: gone, sat: { status: "cancelled" } }),
      world({ members: gone, accounts: { usr_ben: { state: "deleting" } } }),
      world({ members: { ...gone, itv_ben: { leftAt: NOW.subtract({ hours: 2 }) } } }),
    ])
      expect(outcome(w, "usr_ben", "photo")).toEqual({ kind: "pinned", answer: NEUTRAL });
  });

  it("gives the neutral not-found for a day that closed before the caller's interval began, held or run (Q06, T14)", () => {
    const rejoined = (more: Record<string, Partial<WorldMember>> = {}) =>
      world({
        members: {
          itv_ben: { leftAt: NOW.subtract({ hours: 1 }) },
          itv_ben2: { account: "usr_ben", joinedAt: CLOSE.add({ hours: 1 }) },
          ...more,
        },
      });
    const after = CLOSE.add({ hours: 2 });
    expect(outcome(rejoined(), "usr_ben", "photo", after)).toEqual({ kind: "pinned", answer: NEUTRAL });
    expect(outcome(rejoined({ itv_ana: { leftAt: NOW } }), "usr_ben", "photo", after)).toEqual({
      kind: "pinned",
      answer: NEUTRAL,
    });
    // Cleo, a member all along, is told the day is past, with the star's next day.
    expect(outcome(rejoined(), "usr_cleo", "photo", after).kind).toBe("refused");
  });

  it("refuses from the reveal on with the day as it is then and the star's next day (T3, T4)", () => {
    const open = outcome(world(), "usr_ben", "photo", REVEAL);
    expect(open).toEqual({
      kind: "refused",
      code: "OCCURRENCE_CLOSED",
      body: { code: "OCCURRENCE_CLOSED", target: SAT_AS("open"), next_target: NEXT_COLLECTING },
    });
    const past = outcome(world(), "usr_ben", "photo", CLOSE);
    expect(past.kind === "refused" && past.body.target).toEqual(SAT_AS("past"));
    // With no next day, no next_target; a microsecond before the reveal still holds a slot.
    const last = world();
    (last.days as Map<string, WorldDay>).delete(NEXT);
    expect(outcome(last, "usr_ben", "photo", REVEAL)).toEqual({
      kind: "refused",
      code: "OCCURRENCE_CLOSED",
      body: { code: "OCCURRENCE_CLOSED", target: SAT_AS("open") },
    });
    expect(outcome(world(), "usr_ben", "photo", REVEAL.subtract({ microseconds: 1 })).kind).toBe("held");
    const judge = reserveExpected(open);
    expect(
      takes(judge, refused("OCCURRENCE_CLOSED", { target: SAT_AS("open"), next_target: NEXT_COLLECTING })),
    ).toEqual([]);
    expect(takes(judge, refused("OCCURRENCE_CLOSED", { target: SAT_AS("collecting") })).length).toBeGreaterThan(0);
    expect(takes(judge, refused("QUOTA_FULL", { target: SAT_AS("open"), next_target: NEXT_COLLECTING }))).not.toEqual(
      [],
    );
  });

  it("refuses QUOTA_FULL first, then EXTERNAL_LIMIT or PHOTO_LIMIT, each with the day, the allowance and the next day (T17)", () => {
    const facts = (code: string, allowance: Record<string, unknown>) => ({
      kind: "refused",
      code,
      body: { code, target: SAT_AS("collecting"), next_target: NEXT_COLLECTING, allowance },
    });
    // Ben, a friend: a photo added and a link held leave one photo; a second link is EXTERNAL_LIMIT.
    const one = world({
      drops: { d1: drop("itv_ben", "photo") },
      reservations: { r1: slot("itv_ben", "external_video") },
    });
    expect(outcome(one, "usr_ben", "external_video")).toEqual(
      facts("EXTERNAL_LIMIT", { ...counts([1, 0], [0, 1]), ...FRIEND }),
    );
    expect(outcome(one, "usr_ben", "photo").kind).toBe("held");
    // Two photos: PHOTO_LIMIT for a photo, a link still holds.
    const two = world({ drops: { d1: drop("itv_ben", "photo") }, reservations: { r1: slot("itv_ben", "photo") } });
    expect(outcome(two, "usr_ben", "photo")).toEqual(facts("PHOTO_LIMIT", { ...counts([1, 0], [1, 0]), ...FRIEND }));
    expect(outcome(two, "usr_ben", "external_video").kind).toBe("held");
    // Three in all: QUOTA_FULL, whichever the media.
    const full = world({
      drops: { d1: drop("itv_ben", "photo"), d2: drop("itv_ben", "external_video") },
      reservations: { r1: slot("itv_ben", "photo") },
    });
    for (const media of ["photo", "external_video"] as const)
      expect(outcome(full, "usr_ben", media)).toEqual(facts("QUOTA_FULL", { ...counts([1, 1], [1, 0]), ...FRIEND }));
    // A lapsed slot holds nothing (T18), and a drop withdrawn before the reveal gave its slot back.
    const freed = world({
      drops: {
        d1: drop("itv_ben", "photo"),
        d2: drop("itv_ben", "external_video", { state: "withdrawn", endedAt: NOW }),
      },
      reservations: { r1: slot("itv_ben", "photo", { expiresAt: NOW }) },
    });
    expect(outcome(freed, "usr_ben", "external_video").kind).toBe("held");
    // Ana, the star: six in all, two of them links.
    const star = world({
      drops: { d1: drop("itv_ana", "external_video"), d2: drop("itv_ana", "photo") },
      reservations: { r1: slot("itv_ana", "external_video"), r2: slot("itv_ana", "photo") },
    });
    expect(outcome(star, "usr_ana", "external_video")).toEqual(
      facts("EXTERNAL_LIMIT", { ...counts([1, 1], [1, 1]), ...STAR }),
    );
    expect(outcome(star, "usr_ana", "photo").kind).toBe("held");
    const starFull = world({
      drops: Object.fromEntries([0, 1, 2, 3, 4, 5].map((n) => [`d${String(n)}`, drop("itv_ana", "photo")])),
    });
    expect(outcome(starFull, "usr_ana", "photo")).toEqual(facts("QUOTA_FULL", { ...counts([6, 0], [0, 0]), ...STAR }));
  });

  it("holds a slot of the caller's for 30 minutes, or until the reveal if it comes first, in whole seconds (T18)", () => {
    const held = outcome(world(), "usr_ben", "photo");
    expect(held).toEqual({
      kind: "held",
      interval: "itv_ben",
      body: {
        occurrence_id: SAT,
        media_class: "photo",
        expires_at: "2026-11-06T15:11:00Z",
        allowance: { ...counts([0, 0], [1, 0]), ...FRIEND },
      },
    });
    const late = outcome(world(), "usr_cleo", "external_video", REVEAL.subtract({ minutes: 10 }));
    expect(late.kind === "held" && late.body.expires_at).toBe("2026-11-07T12:00:00Z");
    const judge = reserveExpected(held);
    const good = { id: "rsv_new", ...(held.kind === "held" ? held.body : {}) };
    expect(takes(judge, answer(good, 201))).toEqual([]);
    expect(takes(judge, answer(good, 200))).not.toEqual([]);
    expect(takes(judge, answer(good, 201, { "cache-control": "no-store" }))).not.toEqual([]);
    expect(takes(judge, answer({ ...good, id: undefined }, 201))).not.toEqual([]);
    expect(takes(judge, answer({ ...good, id: "rsv new" }, 201))).not.toEqual([]);
    expect(takes(judge, answer({ ...good, expires_at: "2026-11-06T15:11:01Z" }, 201))).not.toEqual([]);
    expect(takes(judge, answer({ ...good, allowance: { ...counts([0, 0], [0, 0]), ...FRIEND } }, 201))).not.toEqual([]);
    expect(takes(judge, answer({ ...good, author_interval_id: "itv_ben" }, 201))).not.toEqual([]);
    expect(takes(judge, { ...answer(good, 201), body: "not json" })).not.toEqual([]);
  });
});

describe("what the rows after createReservation must hold (heldProblems)", () => {
  const before = world({
    reservations: {
      mine: slot("itv_ben", "photo", { expiresAt: NOW.subtract({ minutes: 1 }) }),
      cleos: slot("itv_cleo", "photo", { expiresAt: NOW.subtract({ minutes: 1 }) }),
    },
  });
  const held = reserveOutcome(before, "usr_ben", SAT, "photo", NOW);
  const said = answer({ id: "rsv_new" }, 201);
  const after = (changes: Record<string, WorldReservation | undefined>) => {
    const reservations = new Map(before.reservations);
    for (const [id, row] of Object.entries(changes)) {
      if (row === undefined) reservations.delete(id);
      else reservations.set(id, row);
    }
    return { ...before, reservations };
  };
  const made = slot("itv_ben", "photo", { expiresAt: at("2026-11-06T15:11:00.5Z") });

  it("takes one new live slot of the caller's, as the answer says, and the caller's own lapsed slots settled", () => {
    expect(held.kind).toBe("held");
    const settled = { ...before.reservations.get("mine"), state: "expired" } as WorldReservation;
    expect(heldProblems(before, after({ rsv_new: made }), said, held, NOW)).toEqual([]);
    expect(heldProblems(before, after({ rsv_new: made, mine: settled }), said, held, NOW)).toEqual([]);
  });

  it("refuses a slot not the answer's, of someone else, of another media or lapsing at another time, and two slots", () => {
    expect(heldProblems(before, after({}), said, held, NOW)).not.toEqual([]);
    expect(heldProblems(before, after({ rsv_other: made }), said, held, NOW)).not.toEqual([]);
    expect(heldProblems(before, after({ rsv_new: made, rsv_two: made }), said, held, NOW)).not.toEqual([]);
    for (const wrong of [
      { ...made, interval: "itv_cleo" },
      { ...made, media: "external_video" as const },
      { ...made, state: "released" as const },
      { ...made, expiresAt: at("2026-11-06T15:12:00Z") },
      { ...made, day: NEXT },
    ])
      expect(heldProblems(before, after({ rsv_new: wrong }), said, held, NOW)).not.toEqual([]);
  });

  it("refuses another's slot settled, a slot gone, and anything a refusal changed (T19)", () => {
    const cleos = { ...before.reservations.get("cleos"), state: "expired" } as WorldReservation;
    const mine = { ...before.reservations.get("mine"), state: "expired" } as WorldReservation;
    expect(heldProblems(before, after({ rsv_new: made, cleos }), said, held, NOW)).not.toEqual([]);
    // The caller's own lapsed slot in another day is another counter's, which this command never settles.
    const elsewhere = { ...before, reservations: new Map(before.reservations) };
    elsewhere.reservations.set(
      "next",
      slot("itv_ben", "photo", { day: NEXT, expiresAt: NOW.subtract({ minutes: 1 }) }),
    );
    const settledThere = new Map(elsewhere.reservations);
    settledThere.set("rsv_new", made);
    settledThere.set("next", {
      ...slot("itv_ben", "photo", { day: NEXT, expiresAt: NOW.subtract({ minutes: 1 }) }),
      state: "expired",
    });
    expect(heldProblems(elsewhere, { ...elsewhere, reservations: settledThere }, said, held, NOW)).not.toEqual([]);
    expect(heldProblems(before, after({ rsv_new: made, mine: undefined }), said, held, NOW)).not.toEqual([]);
    const refusal: ReserveOutcome = { kind: "pinned", answer: NEUTRAL };
    expect(heldProblems(before, after({}), NEUTRAL, refusal, NOW)).toEqual([]);
    expect(heldProblems(before, after({ rsv_new: made }), NEUTRAL, refusal, NOW)).not.toEqual([]);
    // A refusal rolls back whatever it settled under the lock.
    expect(heldProblems(before, after({ mine }), NEUTRAL, refusal, NOW)).not.toEqual([]);
  });
});

describe("what releaseReservation must answer, and the rows after it (releaseOutcome, releaseExpected, releasedProblems)", () => {
  const w = world({
    drops: { d1: drop("itv_ben", "photo") },
    reservations: {
      live: slot("itv_ben", "photo"),
      lapsed: slot("itv_ben", "external_video", { expiresAt: NOW }),
      used: slot("itv_ben", "photo", { state: "consumed", drop: "d1" }),
      back: slot("itv_ben", "photo", { state: "released" }),
      cleos: slot("itv_cleo", "photo"),
    },
  });

  it("gives the neutral not-found for a slot nobody has, someone else's, or one in a club or day that answers nobody (T14)", () => {
    for (const [facts, who, id] of [
      [w, "usr_ben", "rsv_nobody"],
      [w, "usr_ben", "cleos"],
      [w, "usr_zed", "live"],
      [w, null, "live"],
      [
        world({ ...{ reservations: { live: slot("itv_ben", "photo") } }, club: { suspendedAt: NOW } }),
        "usr_ben",
        "live",
      ],
      [world({ reservations: { live: slot("itv_ben", "photo") }, sat: { status: "cancelled" } }), "usr_ben", "live"],
      [
        world({ reservations: { live: slot("itv_ben", "photo") }, members: { itv_ben: { leftAt: NOW } } }),
        "usr_ben",
        "live",
      ],
    ] as const)
      expect(releaseOutcome(facts, who, id, NOW), `${String(who)} ${id}`).toEqual({ kind: "pinned", answer: NEUTRAL });
    expect(releaseExpected({ kind: "pinned", answer: NEUTRAL })).toBe(NEUTRAL);
  });

  it("answers a live slot released, a lapsed one expired, a used one with its drop (T20), and an ended one as it ended", () => {
    const allowance = (reserved: [number, number]) => ({ ...counts([1, 0], reserved), ...FRIEND });
    expect(releaseOutcome(w, "usr_ben", "live", NOW)).toEqual({
      kind: "released",
      interval: "itv_ben",
      body: { id: "live", state: "released", allowance: allowance([0, 0]) },
    });
    expect(releaseOutcome(w, "usr_ben", "lapsed", NOW)).toEqual({
      kind: "released",
      interval: "itv_ben",
      body: { id: "lapsed", state: "expired", allowance: allowance([1, 0]) },
    });
    expect(releaseOutcome(w, "usr_ben", "used", NOW)).toEqual({
      kind: "released",
      interval: "itv_ben",
      body: { id: "used", state: "consumed", drop_id: "d1", allowance: allowance([1, 0]) },
    });
    expect(releaseOutcome(w, "usr_ben", "back", NOW)).toEqual({
      kind: "released",
      interval: "itv_ben",
      body: { id: "back", state: "released", allowance: allowance([1, 0]) },
    });
    // A day whose star left still takes a slot back.
    const left = world({ reservations: { live: slot("itv_ben", "photo") }, members: { itv_ana: { leftAt: NOW } } });
    expect(releaseOutcome(left, "usr_ben", "live", NOW).kind).toBe("released");
    const judge = releaseExpected(releaseOutcome(w, "usr_ben", "used", NOW));
    const good = { id: "used", state: "consumed", drop_id: "d1", allowance: allowance([1, 0]) };
    expect(takes(judge, answer(good, 200))).toEqual([]);
    expect(takes(judge, answer({ ...good, drop_id: undefined }, 200))).not.toEqual([]);
    expect(takes(judge, answer({ ...good, state: "released" }, 200))).not.toEqual([]);
    expect(takes(judge, answer(good, 201))).not.toEqual([]);
  });

  it("takes the slot ended as the answer says and the caller's own lapsed slots settled, and refuses anything else", () => {
    const outcome = releaseOutcome(w, "usr_ben", "live", NOW);
    const after = (changes: Record<string, Partial<WorldReservation>>) => {
      const reservations = new Map(w.reservations);
      for (const [id, more] of Object.entries(changes)) {
        const was = reservations.get(id);
        if (was !== undefined) reservations.set(id, { ...was, ...more });
      }
      return { ...w, reservations };
    };
    expect(releasedProblems(w, after({ live: { state: "released" } }), "live", outcome, NOW)).toEqual([]);
    expect(
      releasedProblems(w, after({ live: { state: "released" }, lapsed: { state: "expired" } }), "live", outcome, NOW),
    ).toEqual([]);
    expect(releasedProblems(w, after({}), "live", outcome, NOW)).not.toEqual([]);
    expect(releasedProblems(w, after({ live: { state: "expired" } }), "live", outcome, NOW)).not.toEqual([]);
    expect(
      releasedProblems(w, after({ live: { state: "released" }, cleos: { state: "released" } }), "live", outcome, NOW),
    ).not.toEqual([]);
    const more = new Map(w.reservations);
    more.set("extra", slot("itv_ben", "photo"));
    more.set("live", { ...slot("itv_ben", "photo"), state: "released" });
    expect(releasedProblems(w, { ...w, reservations: more }, "live", outcome, NOW)).not.toEqual([]);
    // The caller's own lapsed slot in another day is another counter's: settling it is no release's doing.
    const twoDays = { ...w, reservations: new Map(w.reservations) };
    twoDays.reservations.set("nextLapsed", slot("itv_ben", "photo", { day: NEXT, expiresAt: NOW }));
    const settledBoth = new Map(twoDays.reservations);
    settledBoth.set("live", { ...slot("itv_ben", "photo"), state: "released" });
    settledBoth.set("nextLapsed", { ...slot("itv_ben", "photo", { day: NEXT, expiresAt: NOW }), state: "expired" });
    expect(
      releasedProblems(
        twoDays,
        { ...twoDays, reservations: settledBoth },
        "live",
        releaseOutcome(twoDays, "usr_ben", "live", NOW),
        NOW,
      ),
    ).not.toEqual([]);
    // A refused release changes nothing, not even the caller's lapsed slots.
    const refused = releaseOutcome(w, "usr_zed", "live", NOW);
    expect(releasedProblems(w, after({}), "live", refused, NOW)).toEqual([]);
    expect(releasedProblems(w, after({ lapsed: { state: "expired" } }), "live", refused, NOW)).not.toEqual([]);
    expect(releasedProblems(w, after({ live: { state: "released" } }), "live", refused, NOW)).not.toEqual([]);
  });
});
