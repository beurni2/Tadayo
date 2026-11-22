/// <reference lib="esnext.temporal" />
// The uploads' judges, judged (./upload.ts): each branch of what a cell must get from createUpload, getUpload and
// completeUpload, and of what the rows after each must hold, is shown to refuse an answer or a set of rows that
// breaks it, on a world written out here by hand, with no database (T3, T4, T9, T12, T14, T18, T19; spec 32, 33;
// FQ63; docs/plans/api-b2-spike-uploads.md).

import { STATUS_CODES } from "node:http";
import { describe, expect, it } from "vitest";
import { NEUTRAL } from "./harness.ts";
import { MEMBERSHIP_CHANGED, takes } from "./reservation.ts";
import type {
  Answer,
  WorldAccount,
  WorldDay,
  WorldFacts,
  WorldMember,
  WorldReservation,
  WorldUpload,
} from "./scanner.ts";
import {
  completedProblems,
  completeExpected,
  completeOutcome,
  MEDIA_NOT_READY,
  madeProblems,
  PHOTO_BODY,
  PROFILE_INCOMPLETE,
  readExpected,
  replayOutcome,
  replayProblems,
  SIGNED_SECONDS,
  signedProblems,
  UPLOAD_JUDGED,
  UPLOAD_NO_BODY,
  uploadExpected,
  uploadOutcome,
  type UploadOutcome,
  without,
} from "./upload.ts";

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
/** The fake Storage's URLs (services/api/src/testing.ts). */
const PROJECT = "https://tadayotestprojectref.supabase.co";
const BENS_OBJECT = "BenObjectKey0123456789abcdefghij";
const CLEOS_OBJECT = "CleoObjectKey123456789abcdefghij";

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

const slot = (interval: string, more: Partial<WorldReservation> = {}): WorldReservation => ({
  interval,
  day: SAT,
  media: "photo",
  state: "live",
  expiresAt: NOW.add({ minutes: 20 }),
  drop: null,
  ...more,
});

/** `owner`'s upload made at NOW, under the slot of theirs world() holds, as the matrix's body declares it. */
const upload = (owner: string, objectKey: string, more: Partial<WorldUpload> = {}): WorldUpload => ({
  owner,
  purpose: "drop_photo",
  reservation: `rsv_${owner.slice(4)}`,
  state: "pending",
  rejection: null,
  expiresAt: NOW.add({ hours: 24 }),
  objectKey,
  contentType: "image/jpeg",
  byteSize: 2_500_000,
  ...more,
});

/** Ana, Ben and Cleo's club, Ana's Saturday and the next, and Zed, who is in no club; changed by `over`. */
function world(
  over: {
    reservations?: Record<string, WorldReservation>;
    uploads?: Record<string, WorldUpload>;
    members?: Record<string, Partial<WorldMember>>;
    accounts?: Record<string, Partial<WorldAccount>>;
    suspended?: Temporal.Instant;
    sat?: Partial<WorldDay>;
    next?: boolean;
  } = {},
): WorldFacts {
  const members = new Map<string, WorldMember>(
    ["ana", "ben", "cleo"].map((who) => [`itv_${who}`, member(who, over.members?.[`itv_${who}`])]),
  );
  for (const [id, more] of Object.entries(over.members ?? {}))
    if (!members.has(id)) members.set(id, member(id.slice(4), more));
  const days = new Map<string, WorldDay>([[SAT, day(over.sat)]]);
  if (over.next !== false)
    days.set(
      NEXT,
      day({ localDate: "2026-11-14", revealAt: at("2026-11-14T12:00:00Z"), closeAt: at("2026-11-15T06:00:00Z") }),
    );
  return {
    drops: new Map(),
    days,
    members,
    clubs: new Map([[CLUB, { name: "The Saturdays", suspendedAt: over.suspended ?? null, labels: new Map() }]]),
    reservations: new Map(
      Object.entries(over.reservations ?? { rsv_ben: slot("itv_ben"), rsv_cleo: slot("itv_cleo") }),
    ),
    uploads: new Map(Object.entries(over.uploads ?? {})),
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

/** The signed upload the fake Storage gives for `objectKey` at NOW. */
const signed = (objectKey: string, more: Record<string, unknown> = {}) => ({
  url: `${PROJECT}/storage/v1/object/upload/sign/uploads/${objectKey}?token=test.QmVu.unsigned`,
  method: "PUT",
  headers: { "Content-Type": "image/jpeg", "x-upsert": "false" },
  expires_at: "2026-11-06T16:41:00Z",
  ...more,
});

/** Ben's upload made at NOW, as createUpload answers it. */
const madeBody = (more: Record<string, unknown> = {}) => ({
  id: "upl_ben",
  purpose: "drop_photo",
  state: "pending",
  expires_at: "2026-11-07T14:41:00Z",
  signed_upload: signed(BENS_OBJECT),
  ...more,
});

describe("the operations this file judges, and what the table sends", () => {
  it("judges the three upload routes, with the contract's pinned refusals and a JPEG of 2.5 MB", () => {
    expect([...UPLOAD_JUDGED].sort()).toEqual(["completeUpload", "createUpload", "getUpload"]);
    expect([UPLOAD_NO_BODY.status, UPLOAD_NO_BODY.body]).toEqual([400, '{"code":"INVALID_REQUEST"}']);
    expect([PROFILE_INCOMPLETE.status, PROFILE_INCOMPLETE.body]).toEqual([403, '{"code":"PROFILE_INCOMPLETE"}']);
    expect([MEDIA_NOT_READY.status, MEDIA_NOT_READY.body]).toEqual([409, '{"code":"MEDIA_NOT_READY"}']);
    expect(PHOTO_BODY).toEqual({ purpose: "drop_photo", content_type: "image/jpeg", byte_size: 2_500_000 });
    expect(SIGNED_SECONDS).toBe(7200);
  });
});

describe("what createUpload must answer (uploadOutcome)", () => {
  const outcome = (w: WorldFacts, who: string | null, reservation: string, now = NOW) =>
    uploadOutcome(w, who, reservation, now);
  const neutral = { kind: "pinned", answer: NEUTRAL };

  it("answers PROFILE_INCOMPLETE to an account that hasn't finished its profile, before anything is read", () => {
    for (const unfinished of [{ ageConfirmed: false }, { name: null }]) {
      const w = world({ accounts: { usr_ben: unfinished } });
      expect(outcome(w, "usr_ben", "rsv_ben")).toEqual({ kind: "pinned", answer: PROFILE_INCOMPLETE });
      expect(outcome(w, "usr_ben", "rsv_nobody")).toEqual({ kind: "pinned", answer: PROFILE_INCOMPLETE });
    }
    expect(outcome(world(), "usr_nobody", "rsv_ben")).toEqual({ kind: "pinned", answer: PROFILE_INCOMPLETE });
  });

  it("gives the neutral not-found unless the slot is the caller's, of their active interval (T9, T14)", () => {
    expect(outcome(world(), "usr_ben", "rsv_nobody")).toEqual(neutral);
    expect(outcome(world(), "usr_ben", "rsv_cleo")).toEqual(neutral);
    expect(outcome(world(), "usr_zed", "rsv_ben")).toEqual(neutral);
    expect(outcome(world({ members: { itv_ben: { leftAt: NOW } } }), "usr_ben", "rsv_ben")).toEqual(neutral);
    // Rejoined: the slot is the interval that ended, never the one active now.
    const rejoined = world({
      members: { itv_ben: { leftAt: NOW.subtract({ hours: 1 }) }, itv_ben2: { account: "usr_ben" } },
    });
    expect(outcome(rejoined, "usr_ben", "rsv_ben")).toEqual(neutral);
    expect(outcome(world({ suspended: NOW }), "usr_ben", "rsv_ben")).toEqual(neutral);
    expect(outcome(world({ sat: { status: "suspended" } }), "usr_ben", "rsv_ben")).toEqual(neutral);
    expect(outcome(world({ sat: { status: "cancelled" } }), "usr_ben", "rsv_ben")).toEqual(neutral);
    expect(outcome(world({ accounts: { usr_ben: { state: "deleting" } } }), "usr_ben", "rsv_ben")).toEqual(neutral);
    expect(uploadExpected({ kind: "pinned", answer: NEUTRAL }, () => world())).toBe(NEUTRAL);
  });

  it("answers MEMBERSHIP_CHANGED to the slot's owner on a day whose star left or asked to delete before its reveal (FQ63)", () => {
    const left = world({ members: { itv_ana: { leftAt: NOW.subtract({ hours: 1 }) } } });
    expect(outcome(left, "usr_ben", "rsv_ben")).toEqual({ kind: "pinned", answer: MEMBERSHIP_CHANGED });
    const deleting = world({ accounts: { usr_ana: { deletionRequestedAt: NOW.subtract({ hours: 1 }) } } });
    expect(outcome(deleting, "usr_ben", "rsv_ben")).toEqual({ kind: "pinned", answer: MEMBERSHIP_CHANGED });
    // Anyone whose slot it isn't gets the neutral not-found, never the day's news (T14).
    expect(outcome(left, "usr_cleo", "rsv_ben")).toEqual(neutral);
    expect(outcome(left, "usr_zed", "rsv_ben")).toEqual(neutral);
    // The star leaving after the reveal changes nothing before it.
    const later = world({ members: { itv_ana: { leftAt: REVEAL.add({ hours: 1 }) } } });
    expect(outcome(later, "usr_ben", "rsv_ben").kind).toBe("made");
  });

  it("refuses from the reveal on with the day as it is then and the star's next day, whatever the slot's state (T3, T4)", () => {
    const open = outcome(world(), "usr_ben", "rsv_ben", REVEAL);
    expect(open).toEqual({
      kind: "refused",
      code: "OCCURRENCE_CLOSED",
      body: { code: "OCCURRENCE_CLOSED", target: SAT_AS("open"), next_target: NEXT_COLLECTING },
    });
    const past = outcome(world(), "usr_ben", "rsv_ben", CLOSE);
    expect(past.kind === "refused" && past.body.target).toEqual(SAT_AS("past"));
    // The day's cutoff comes before the slot's own state: a released or lapsed slot of the caller's is refused so.
    const released = world({ reservations: { rsv_ben: slot("itv_ben", { state: "released" }) } });
    expect(outcome(released, "usr_ben", "rsv_ben", REVEAL).kind).toBe("refused");
    expect(outcome(world({ next: false }), "usr_ben", "rsv_ben", REVEAL)).toEqual({
      kind: "refused",
      code: "OCCURRENCE_CLOSED",
      body: { code: "OCCURRENCE_CLOSED", target: SAT_AS("open") },
    });
    // A microsecond before the reveal, with the slot still live, still makes one.
    const last = world({ reservations: { rsv_ben: slot("itv_ben", { expiresAt: REVEAL }) } });
    expect(outcome(last, "usr_ben", "rsv_ben", REVEAL.subtract({ microseconds: 1 })).kind).toBe("made");
    const judge = uploadExpected(open, () => world());
    const refused = (body: Record<string, unknown>) => answer({ code: "OCCURRENCE_CLOSED", ...body }, 409);
    expect(takes(judge, refused({ target: SAT_AS("open"), next_target: NEXT_COLLECTING }))).toEqual([]);
    expect(takes(judge, refused({ target: SAT_AS("collecting"), next_target: NEXT_COLLECTING }))).not.toEqual([]);
    expect(takes(judge, refused({ target: SAT_AS("open") }))).not.toEqual([]);
    expect(
      takes(judge, answer({ code: "OCCURRENCE_CLOSED", target: SAT_AS("open"), next_target: NEXT_COLLECTING }, 404)),
    ).not.toEqual([]);
  });

  it("gives the neutral not-found for a slot that isn't a live photo's: a link's, released, used or lapsed (T18)", () => {
    for (const more of [
      { media: "external_video" as const },
      { state: "released" as const },
      { state: "consumed" as const, drop: "drp_ben" },
      { state: "expired" as const },
      { expiresAt: NOW },
      { expiresAt: NOW.subtract({ minutes: 1 }) },
    ]) {
      expect(outcome(world({ reservations: { rsv_ben: slot("itv_ben", more) } }), "usr_ben", "rsv_ben")).toEqual(
        neutral,
      );
    }
    const lastMicrosecond = world({
      reservations: { rsv_ben: slot("itv_ben", { expiresAt: NOW.add({ microseconds: 1 }) }) },
    });
    expect(outcome(lastMicrosecond, "usr_ben", "rsv_ben").kind).toBe("made");
  });

  it("gives the neutral not-found for a slot that holds an upload but rejected ones: one slot, one photo", () => {
    for (const state of ["pending", "preparing", "ready", "held"] as const) {
      const holding = world({ uploads: { upl_ben: upload("usr_ben", BENS_OBJECT, { state }) } });
      expect(outcome(holding, "usr_ben", "rsv_ben"), state).toEqual(neutral);
    }
    // A lapsed upload still holds its slot: the slot lapses long before it.
    const lapsed = world({ uploads: { upl_ben: upload("usr_ben", BENS_OBJECT, { expiresAt: NOW }) } });
    expect(outcome(lapsed, "usr_ben", "rsv_ben")).toEqual(neutral);
    const rejected = world({
      uploads: { upl_ben: upload("usr_ben", BENS_OBJECT, { state: "rejected", rejection: "unreadable" }) },
    });
    expect(outcome(rejected, "usr_ben", "rsv_ben").kind).toBe("made");
    // Another slot's upload, or another purpose's, holds nothing of this one.
    const elsewhere = world({
      reservations: { rsv_ben: slot("itv_ben"), rsv_ben2: slot("itv_ben") },
      uploads: {
        upl_two: upload("usr_ben", BENS_OBJECT, { reservation: "rsv_ben2" }),
        upl_avatar: upload("usr_ben", CLEOS_OBJECT, { purpose: "avatar", reservation: null }),
      },
    });
    expect(outcome(elsewhere, "usr_ben", "rsv_ben").kind).toBe("made");
    expect(outcome(elsewhere, "usr_ben", "rsv_ben2")).toEqual(neutral);
  });

  it("makes one for the owner of a live photo slot, the star's included", () => {
    expect(outcome(world(), "usr_ben", "rsv_ben")).toEqual({
      kind: "made",
      account: "usr_ben",
      reservation: "rsv_ben",
      now: NOW,
    });
    const star = world({ reservations: { rsv_ana: slot("itv_ana") } });
    expect(outcome(star, "usr_ana", "rsv_ana").kind).toBe("made");
  });
});

describe("the upload made, and its signed upload (uploadExpected, signedProblems; T12)", () => {
  const made: UploadOutcome = { kind: "made", account: "usr_ben", reservation: "rsv_ben", now: NOW };
  const after = world({ uploads: { upl_ben: upload("usr_ben", BENS_OBJECT) } });
  const judge = uploadExpected(made, () => after);

  it("takes the new pending upload, living 24 hours, with a PUT to its own object for Storage's lifetime", () => {
    expect(takes(judge, answer(madeBody(), 201))).toEqual([]);
  });

  it("refuses another status, a shared cache, an id the world doesn't have, and any other field or value", () => {
    expect(takes(judge, answer(madeBody(), 200))).not.toEqual([]);
    expect(takes(judge, answer(madeBody(), 201, { "cache-control": "no-store" }))).not.toEqual([]);
    expect(takes(judge, answer(madeBody({ id: "upl_nobody" }), 201))).not.toEqual([]);
    expect(takes(judge, answer(madeBody({ state: "preparing" }), 201))).not.toEqual([]);
    expect(takes(judge, answer(madeBody({ purpose: "avatar" }), 201))).not.toEqual([]);
    expect(takes(judge, answer(madeBody({ expires_at: "2026-11-07T14:41:01Z" }), 201))).not.toEqual([]);
    expect(takes(judge, answer(madeBody({ object_key: BENS_OBJECT }), 201))).not.toEqual([]);
    const rest = without(madeBody(), "signed_upload");
    expect(takes(judge, answer(rest, 201))).not.toEqual([]);
    // The receipt's order, as Postgres's jsonb keeps it, is taken as well as the route's own.
    const { id, state, purpose, expires_at: expires } = madeBody();
    expect(
      takes(judge, answer({ id, state, purpose, expires_at: expires, signed_upload: signed(BENS_OBJECT) }, 201)),
    ).toEqual([]);
  });

  it("gives the signed upload as good until the upload's own expiry at the latest", () => {
    // An upload an hour from its expiry: Storage's two hours end past it, so the upload's expiry it is.
    const ending = upload("usr_ben", BENS_OBJECT, { expiresAt: NOW.add({ hours: 1 }) });
    expect(signedProblems(signed(BENS_OBJECT, { expires_at: "2026-11-06T15:41:00Z" }), ending, NOW)).toEqual([]);
    for (const expires of ["2026-11-06T16:41:00Z", "2026-11-06T15:41:01Z", "2026-11-06T15:40:59Z"]) {
      expect(signedProblems(signed(BENS_OBJECT, { expires_at: expires }), ending, NOW), expires).not.toEqual([]);
    }
  });

  it("refuses a URL for another object or host, another method, other headers and another lifetime", () => {
    const own = upload("usr_ben", BENS_OBJECT);
    expect(signedProblems(signed(BENS_OBJECT), own, NOW)).toEqual([]);
    for (const bad of [
      signed(CLEOS_OBJECT),
      signed(BENS_OBJECT, {
        url: `https://elsewhere.example/storage/v1/object/upload/sign/uploads/${BENS_OBJECT}?token=t`,
      }),
      signed(BENS_OBJECT, { url: `${PROJECT}/storage/v1/object/sign/uploads/${BENS_OBJECT}?token=t` }),
      signed(BENS_OBJECT, { url: `${PROJECT}/storage/v1/object/upload/sign/uploads/${BENS_OBJECT}` }),
      signed(BENS_OBJECT, { method: "POST" }),
      signed(BENS_OBJECT, { headers: { "Content-Type": "image/jpeg", "x-upsert": "true" } }),
      signed(BENS_OBJECT, { headers: { "Content-Type": "image/png", "x-upsert": "false" } }),
      signed(BENS_OBJECT, { headers: { "Content-Type": "image/jpeg" } }),
      signed(BENS_OBJECT, { headers: { "Content-Type": "image/jpeg", "x-upsert": "false", authorization: "x" } }),
      signed(BENS_OBJECT, { expires_at: "2026-11-06T16:41:01Z" }),
      signed(BENS_OBJECT, { expires_at: "2026-11-07T14:41:00Z" }),
      "a URL",
      undefined,
    ]) {
      expect(signedProblems(bad, own, NOW)).not.toEqual([]);
      expect(takes(judge, answer(madeBody({ signed_upload: bad }), 201))).not.toEqual([]);
    }
  });
});

describe("the rows after createUpload (madeProblems; T19)", () => {
  const made: UploadOutcome = { kind: "made", account: "usr_ben", reservation: "rsv_ben", now: NOW };
  const before = world({ uploads: { upl_cleo: upload("usr_cleo", CLEOS_OBJECT) } });
  const withBen = (more: Partial<WorldUpload> = {}, others: Record<string, WorldUpload> = {}) =>
    world({
      uploads: { upl_cleo: upload("usr_cleo", CLEOS_OBJECT), upl_ben: upload("usr_ben", BENS_OBJECT, more), ...others },
    });
  const good = answer(madeBody(), 201);

  it("holds one new upload of the caller's, pending, a photo of the declared type, living 24 hours", () => {
    expect(madeProblems(before, withBen(), good, made)).toEqual([]);
    expect(madeProblems(before, before, good, made)).not.toEqual([]);
    expect(
      madeProblems(before, withBen({}, { upl_two: upload("usr_ben", "TwoObjectKey0123456789abcdefghij") }), good, made),
    ).not.toEqual([]);
    for (const more of [
      { owner: "usr_cleo" },
      { purpose: "avatar" },
      { reservation: "rsv_cleo" },
      { reservation: null },
      { state: "preparing" as const },
      { contentType: "image/png" },
      { byteSize: 2_500_001 },
      { expiresAt: NOW.add({ hours: 24, microseconds: 1 }) },
    ])
      expect(madeProblems(before, withBen(more), good, made), JSON.stringify(more)).not.toEqual([]);
  });

  it("holds that a refusal made nothing, and that no other upload and no reservation changed", () => {
    const refused: UploadOutcome = { kind: "pinned", answer: NEUTRAL };
    expect(madeProblems(before, before, NEUTRAL, refused)).toEqual([]);
    expect(madeProblems(before, withBen(), NEUTRAL, refused)).not.toEqual([]);
    const moved = world({
      uploads: { upl_cleo: upload("usr_cleo", CLEOS_OBJECT, { expiresAt: NOW.add({ hours: 25 }) }) },
    });
    expect(madeProblems(before, moved, NEUTRAL, refused)).not.toEqual([]);
    const settled = world({
      uploads: { upl_cleo: upload("usr_cleo", CLEOS_OBJECT) },
      reservations: { rsv_ben: slot("itv_ben", { state: "expired" }), rsv_cleo: slot("itv_cleo") },
    });
    expect(madeProblems(before, settled, NEUTRAL, refused)).not.toEqual([]);
  });
});

describe("createUpload again under its key (replayProblems; T12, T19; TECH-DESIGN sections 6 and 8)", () => {
  const first = answer(madeBody(), 201);
  const pending = world({ uploads: { upl_ben: upload("usr_ben", BENS_OBJECT) } });
  const preparing = world({ uploads: { upl_ben: upload("usr_ben", BENS_OBJECT, { state: "preparing" }) } });
  const later = NOW.add({ minutes: 5 });
  const resigned = (more: Record<string, unknown> = {}) =>
    madeBody({ signed_upload: signed(BENS_OBJECT, { expires_at: "2026-11-06T16:46:00Z", ...more }) });
  const stored = without(madeBody(), "signed_upload");

  it("signs a new URL for the same object while the upload is pending and lives, good from the retry", () => {
    expect(replayProblems(first, answer(resigned(), 201), pending, pending, later)).toEqual([]);
    expect(replayProblems(first, answer(stored, 201), pending, pending, later)).not.toEqual([]);
    expect(replayProblems(first, answer(madeBody(), 201), pending, pending, later)).not.toEqual([]);
    expect(
      replayProblems(first, answer(resigned({ url: signed(CLEOS_OBJECT).url }), 201), pending, pending, later),
    ).not.toEqual([]);
    expect(replayProblems(first, answer({ ...resigned(), id: "upl_other" }, 201), pending, pending, later)).not.toEqual(
      [],
    );
    expect(replayProblems(first, answer(resigned(), 200), pending, pending, later)).not.toEqual([]);
  });

  it("answers the stored answer alone, with no URL, once the upload is past pending or lapsed", () => {
    expect(replayProblems(first, answer(stored, 201), preparing, preparing, later)).toEqual([]);
    expect(replayProblems(first, answer(resigned(), 201), preparing, preparing, later)).not.toEqual([]);
    const lapsed = NOW.add({ hours: 24 });
    expect(replayProblems(first, answer(stored, 201), pending, pending, lapsed)).toEqual([]);
    expect(replayProblems(first, answer(madeBody(), 201), pending, pending, lapsed)).not.toEqual([]);
    expect(
      replayProblems(first, answer({ ...stored, state: "preparing" }, 201), preparing, preparing, later),
    ).not.toEqual([]);
  });

  it("refuses a retry that made or changed an upload or a reservation", () => {
    const two = world({
      uploads: {
        upl_ben: upload("usr_ben", BENS_OBJECT),
        upl_two: upload("usr_ben", "TwoObjectKey0123456789abcdefghij"),
      },
    });
    expect(replayProblems(first, answer(resigned(), 201), pending, two, later)).not.toEqual([]);
    const settled = world({
      uploads: { upl_ben: upload("usr_ben", BENS_OBJECT) },
      reservations: { rsv_ben: slot("itv_ben", { state: "expired" }), rsv_cleo: slot("itv_cleo") },
    });
    expect(replayProblems(first, answer(resigned(), 201), pending, settled, later)).not.toEqual([]);
    expect(
      replayProblems(answer({ code: "NOT_FOUND" }, 404), answer(resigned(), 201), pending, pending, later),
    ).not.toEqual([]);
  });
});

describe("who a replay answers from its receipt (replayOutcome; T14, T19; FQ112)", () => {
  it("answers the slot's owner from the receipt, whatever became of the slot or the day since", () => {
    for (const more of [{}, { state: "released" as const }, { state: "expired" as const }, { expiresAt: NOW }]) {
      const w = world({ reservations: { rsv_ben: slot("itv_ben", more) } });
      expect(replayOutcome(w, "usr_ben", "rsv_ben"), JSON.stringify(more)).toBeUndefined();
    }
    // Held, revealed and closed days alike: the receipt answers, and the stored answer says nothing new.
    const held = world({ members: { itv_ana: { leftAt: NOW.subtract({ hours: 1 }) } } });
    expect(replayOutcome(held, "usr_ben", "rsv_ben")).toBeUndefined();
  });

  it("answers PROFILE_INCOMPLETE to an unfinished account, and the neutral not-found to anyone the slot isn't still the caller's", () => {
    expect(replayOutcome(world({ accounts: { usr_ben: { name: null } } }), "usr_ben", "rsv_ben")).toBe(
      PROFILE_INCOMPLETE,
    );
    expect(replayOutcome(world(), "usr_cleo", "rsv_ben")).toBe(NEUTRAL);
    expect(replayOutcome(world(), "usr_zed", "rsv_ben")).toBe(NEUTRAL);
    expect(replayOutcome(world(), "usr_ben", "rsv_nobody")).toBe(NEUTRAL);
    for (const w of [
      world({ members: { itv_ben: { leftAt: NOW } } }),
      world({ members: { itv_ben: { leftAt: NOW.subtract({ hours: 1 }) }, itv_ben2: { account: "usr_ben" } } }),
      world({ suspended: NOW }),
      world({ sat: { status: "cancelled" } }),
      world({ accounts: { usr_ben: { state: "deleting" } } }),
    ]) {
      expect(replayOutcome(w, "usr_ben", "rsv_ben")).toBe(NEUTRAL);
    }
  });
});

describe("what getUpload must answer (readExpected; T12, T14)", () => {
  const w = world({
    uploads: {
      upl_ben: upload("usr_ben", BENS_OBJECT),
      upl_no: upload("usr_ben", "NoObjectKey0123456789abcdefghijk", { state: "rejected", rejection: "too_large" }),
    },
  });

  it("gives the owner their upload until its expires_at, as the contract's UploadStatus", () => {
    const judge = readExpected(w, "usr_ben", "upl_ben", NOW);
    const good = { id: "upl_ben", purpose: "drop_photo", state: "pending", expires_at: "2026-11-07T14:41:00Z" };
    expect(takes(judge, answer(good, 200))).toEqual([]);
    expect(takes(judge, answer(good, 202))).not.toEqual([]);
    expect(takes(judge, answer({ ...good, state: "ready" }, 200))).not.toEqual([]);
    expect(takes(judge, answer({ ...good, object_key: BENS_OBJECT }, 200))).not.toEqual([]);
    expect(takes(judge, answer({ ...good, signed_upload: signed(BENS_OBJECT) }, 200))).not.toEqual([]);
    const rejected = readExpected(w, "usr_ben", "upl_no", NOW);
    const no = {
      id: "upl_no",
      purpose: "drop_photo",
      state: "rejected",
      rejection: "too_large",
      expires_at: "2026-11-07T14:41:00Z",
    };
    expect(takes(rejected, answer(no, 200))).toEqual([]);
    const unexplained = without(no, "rejection");
    expect(takes(rejected, answer(unexplained, 200))).not.toEqual([]);
  });

  it("gives the neutral not-found for anyone else's, a lapsed one, and an id nobody has", () => {
    expect(readExpected(w, "usr_cleo", "upl_ben", NOW)).toBe(NEUTRAL);
    expect(readExpected(w, null, "upl_ben", NOW)).toBe(NEUTRAL);
    expect(readExpected(w, "usr_ben", "upl_nobody", NOW)).toBe(NEUTRAL);
    expect(readExpected(w, "usr_ben", "upl_ben", NOW.add({ hours: 24 }))).toBe(NEUTRAL);
    expect(readExpected(w, "usr_ben", "upl_ben", NOW.add({ hours: 24 }).subtract({ microseconds: 1 }))).not.toBe(
      NEUTRAL,
    );
  });
});

describe("what completeUpload must answer, and the rows after it (completeOutcome, completeExpected, completedProblems)", () => {
  const w = world({
    uploads: {
      upl_ben: upload("usr_ben", BENS_OBJECT),
      upl_cleo: upload("usr_cleo", CLEOS_OBJECT),
      upl_ready: upload("usr_ben", "ReadyObjectKey0123456789abcdefgh", { state: "ready" }),
    },
  });
  const there = new Set([BENS_OBJECT, CLEOS_OBJECT]);

  it("gives the neutral not-found for anyone else's, a lapsed one, and an id nobody has", () => {
    const neutral = { kind: "pinned", answer: NEUTRAL };
    expect(completeOutcome(w, "usr_cleo", "upl_ben", NOW, there)).toEqual(neutral);
    expect(completeOutcome(w, null, "upl_ben", NOW, there)).toEqual(neutral);
    expect(completeOutcome(w, "usr_ben", "upl_nobody", NOW, there)).toEqual(neutral);
    expect(completeOutcome(w, "usr_ben", "upl_ben", NOW.add({ hours: 24 }), there)).toEqual(neutral);
    expect(completeExpected({ kind: "pinned", answer: NEUTRAL })).toBe(NEUTRAL);
  });

  it("answers MEDIA_NOT_READY to a pending upload whose bytes aren't in, and preparing to one whose bytes are", () => {
    expect(completeOutcome(w, "usr_ben", "upl_ben", NOW, new Set())).toEqual({
      kind: "pinned",
      answer: MEDIA_NOT_READY,
    });
    const moves = completeOutcome(w, "usr_ben", "upl_ben", NOW, there);
    expect(moves).toEqual({
      kind: "status",
      id: "upl_ben",
      body: { id: "upl_ben", purpose: "drop_photo", state: "preparing", expires_at: "2026-11-07T14:41:00Z" },
      moves: true,
    });
    const judge = completeExpected(moves);
    const good = { id: "upl_ben", purpose: "drop_photo", state: "preparing", expires_at: "2026-11-07T14:41:00Z" };
    expect(takes(judge, answer(good, 202))).toEqual([]);
    expect(takes(judge, answer(good, 200))).not.toEqual([]);
    expect(takes(judge, answer({ ...good, state: "pending" }, 202))).not.toEqual([]);
  });

  it("answers an upload past pending as it is, without asking Storage", () => {
    expect(completeOutcome(w, "usr_ben", "upl_ready", NOW, new Set())).toEqual({
      kind: "status",
      id: "upl_ready",
      body: { id: "upl_ready", purpose: "drop_photo", state: "ready", expires_at: "2026-11-07T14:41:00Z" },
      moves: false,
    });
  });

  it("holds that only the pending upload whose bytes are in moved, to preparing, and nothing else changed", () => {
    const moves = completeOutcome(w, "usr_ben", "upl_ben", NOW, there);
    const moved = world({
      uploads: {
        upl_ben: upload("usr_ben", BENS_OBJECT, { state: "preparing" }),
        upl_cleo: upload("usr_cleo", CLEOS_OBJECT),
        upl_ready: upload("usr_ben", "ReadyObjectKey0123456789abcdefgh", { state: "ready" }),
      },
    });
    expect(completedProblems(w, moved, moves)).toEqual([]);
    expect(completedProblems(w, w, moves)).not.toEqual([]);
    const notReady = { kind: "pinned" as const, answer: MEDIA_NOT_READY };
    expect(completedProblems(w, w, notReady)).toEqual([]);
    expect(completedProblems(w, moved, notReady)).not.toEqual([]);
    const both = world({
      uploads: {
        upl_ben: upload("usr_ben", BENS_OBJECT, { state: "preparing" }),
        upl_cleo: upload("usr_cleo", CLEOS_OBJECT, { state: "preparing" }),
        upl_ready: upload("usr_ben", "ReadyObjectKey0123456789abcdefgh", { state: "ready" }),
      },
    });
    expect(completedProblems(w, both, moves)).not.toEqual([]);
    const later = world({
      uploads: {
        upl_ben: upload("usr_ben", BENS_OBJECT, { state: "preparing", expiresAt: NOW.add({ hours: 48 }) }),
        upl_cleo: upload("usr_cleo", CLEOS_OBJECT),
        upl_ready: upload("usr_ben", "ReadyObjectKey0123456789abcdefgh", { state: "ready" }),
      },
    });
    expect(completedProblems(w, later, moves)).not.toEqual([]);
    const gone = world({ uploads: { upl_ben: upload("usr_ben", BENS_OBJECT, { state: "preparing" }) } });
    expect(completedProblems(w, gone, moves)).not.toEqual([]);
    const settled = world({
      uploads: Object.fromEntries(moved.uploads),
      reservations: { rsv_ben: slot("itv_ben", { state: "expired" }), rsv_cleo: slot("itv_cleo") },
    });
    expect(completedProblems(w, settled, moves)).not.toEqual([]);
  });
});
