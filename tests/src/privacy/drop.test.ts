/// <reference lib="esnext.temporal" />
// The commit's judge, judged (./drop.ts): each branch of what a cell must get from createDrop, and of what the rows
// after it must hold, is shown to refuse an answer or a set of rows that breaks it, on a world written out here by
// hand, with no database (T3, T4, T8, T9, T14, T17, T18, T19, T20, T21; FQ63; docs/plans/api-b2-spike-commit.md).

import { STATUS_CODES } from "node:http";
import { describe, expect, it } from "vitest";
import {
  commitExpected,
  committedProblems,
  commitOutcome,
  DROP_JUDGED,
  DROP_NO_BODY,
  MEDIA_NOT_READY,
  replayExpected,
  unchangedProblems,
  type CommitAsk,
  type CommitOutcome,
  type DropRows,
  type DropWorld,
} from "./drop.ts";
import { NEUTRAL, said } from "./harness.ts";
import { MEMBERSHIP_CHANGED, takes } from "./reservation.ts";
import type {
  Answer,
  WorldAccount,
  WorldDay,
  WorldDrop,
  WorldMember,
  WorldReservation,
  WorldUpload,
} from "./scanner.ts";

const at = (text: string) => Temporal.Instant.from(text);
const CLUB = "clb_here";
/** Ana's Saturday 7 November 2026: 7 AM in New York, closing at 1 AM. */
const SAT = "occ_sat";
const REVEAL = at("2026-11-07T12:00:00Z");
const CLOSE = at("2026-11-08T06:00:00Z");
/** Ana's next Saturday. */
const NEXT = "occ_next";
/** Friday 6 November 2026, 9:41 AM in New York. */
const NOW = at("2026-11-06T14:41:00.5Z");
const HASH = "ab".repeat(32);
const OTHER_HASH = "cd".repeat(32);

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

/** `owner`'s photo upload under `reservation`, ready, living a day from an hour ago. */
const upload = (owner: string, reservation: string | null, more: Partial<WorldUpload> = {}): WorldUpload => ({
  owner,
  purpose: "drop_photo",
  reservation,
  state: "ready",
  rejection: null,
  expiresAt: NOW.add({ hours: 23 }),
  objectKey: `obj_${reservation ?? owner}`,
  contentType: "image/jpeg",
  byteSize: 2_500_000,
  ...more,
});

/** One drop of `author`'s in Ana's Saturday, active, with Ana, Ben and Cleo in its audience. */
const drop = (author: string, more: Partial<WorldDrop> = {}): WorldDrop => ({
  author,
  day: SAT,
  media: "photo",
  state: "active",
  endedAt: null,
  caption: null,
  audience: new Set(["itv_ana", "itv_ben", "itv_cleo"]),
  comments: [],
  ...more,
});

interface DropRowOver {
  upload?: string | null;
  dedupe?: string;
  submittedAt?: Temporal.Instant;
}

/** A drop as the scanner's facts hold it, without the rows this file adds. */
function bare(one: WorldDrop & { row?: DropRowOver }): WorldDrop {
  const copy = { ...one };
  delete copy.row;
  return copy;
}

/**
 * Ana, Ben and Cleo's club, Ana's Saturday and the next, and Zed, who is in no club; Ben's live photo slot and Ben's
 * ready upload under it, upl_ben, whose hash is HASH; changed by `over`.
 */
function world(
  over: {
    reservations?: Record<string, WorldReservation>;
    uploads?: Record<string, WorldUpload>;
    hashes?: Record<string, string | null>;
    drops?: Record<string, WorldDrop & { row?: DropRowOver }>;
    highlights?: Record<string, { drop: string | null; version: number }>;
    members?: Record<string, Partial<WorldMember>>;
    accounts?: Record<string, Partial<WorldAccount>>;
    suspended?: Temporal.Instant;
    sat?: Partial<WorldDay>;
    next?: boolean;
  } = {},
): DropWorld {
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
  const drops = Object.entries(over.drops ?? {});
  const rows: DropRows = {
    hashes: new Map(Object.entries({ upl_ben: HASH, ...over.hashes })),
    drops: new Map(
      drops.map(([id, one]) => [
        id,
        {
          upload: one.row?.upload === undefined ? `upl_${id.slice(4)}` : one.row.upload,
          dedupe: one.row?.dedupe ?? OTHER_HASH,
          submittedAt: one.row?.submittedAt ?? NOW.subtract({ hours: 2 }),
        },
      ]),
    ),
    highlights: new Map(Object.entries(over.highlights ?? {})),
  };
  return {
    world: {
      drops: new Map(drops.map(([id, one]) => [id, bare(one)])),
      days,
      members,
      clubs: new Map([[CLUB, { name: "The Saturdays", suspendedAt: over.suspended ?? null, labels: new Map() }]]),
      reservations: new Map(Object.entries(over.reservations ?? { rsv_ben: slot("itv_ben") })),
      uploads: new Map(Object.entries(over.uploads ?? { upl_ben: upload("usr_ben", "rsv_ben") })),
      canaries: new Map(),
      accounts: new Map(
        ["ana", "ben", "cleo", "zed"].map((who) => [`usr_${who}`, account(over.accounts?.[`usr_${who}`])] as const),
      ),
      invitations: new Map(),
    },
    rows,
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

/** Ben's ordinary ask: Ben's upload, in Ana's Saturday. */
const BENS: CommitAsk = { day: SAT, media: { kind: "photo", upload: "upl_ben" } };
const outcome = (w: DropWorld, who: string | null, ask: CommitAsk = BENS, now = NOW) => commitOutcome(w, who, ask, now);
const neutral = { kind: "pinned", answer: NEUTRAL };
const added = (more: Partial<Extract<CommitOutcome, { kind: "added" }>> = {}) => ({
  kind: "added",
  interval: "itv_ben",
  day: SAT,
  upload: "upl_ben",
  slot: "rsv_ben",
  live: true,
  target: SAT_AS("collecting"),
  now: NOW,
  ...more,
});

/** A friend's allowance in the day. */
const friend = (more: Record<string, number> = {}) => ({
  added: 0,
  reserved: 0,
  limit: 3,
  photo_added: 0,
  photo_reserved: 0,
  photo_limit: 2,
  external_added: 0,
  external_reserved: 0,
  external_limit: 1,
  is_star: false,
  ...more,
});

describe("the operations this file judges", () => {
  it("judges createDrop, with the contract's pinned refusals", () => {
    expect([...DROP_JUDGED]).toEqual(["createDrop"]);
    expect([DROP_NO_BODY.status, DROP_NO_BODY.body]).toEqual([400, '{"code":"INVALID_REQUEST"}']);
    expect([MEDIA_NOT_READY.status, MEDIA_NOT_READY.body]).toEqual([409, '{"code":"MEDIA_NOT_READY"}']);
  });
});

describe("what createDrop must answer (commitOutcome)", () => {
  it("gives the neutral not-found to anyone who may not add to the day, before anything else (T9, T14; Q06)", () => {
    expect(outcome(world(), "usr_zed")).toEqual(neutral);
    expect(outcome(world(), null)).toEqual(neutral);
    expect(outcome(world(), "usr_ben", { ...BENS, day: "occ_nobody" })).toEqual(neutral);
    expect(outcome(world(), "usr_ben", { ...BENS, day: "occ.sat" })).toEqual(neutral);
    expect(outcome(world(), "usr_ben", { ...BENS, day: "" })).toEqual(neutral);
    expect(outcome(world({ members: { itv_ben: { leftAt: NOW } } }), "usr_ben")).toEqual(neutral);
    expect(outcome(world({ suspended: NOW }), "usr_ben")).toEqual(neutral);
    expect(outcome(world({ sat: { status: "suspended" } }), "usr_ben")).toEqual(neutral);
    expect(outcome(world({ sat: { status: "cancelled" } }), "usr_ben")).toEqual(neutral);
    expect(outcome(world({ accounts: { usr_ben: { state: "deleting" } } }), "usr_ben")).toEqual(neutral);
    // Q06: an interval that began after the day closed may not add to it, even after the day.
    expect(outcome(world({ members: { itv_ben: { joinedAt: CLOSE } } }), "usr_ben", BENS, CLOSE)).toEqual(neutral);
    // The nobody's-day answer comes before the cutoff's: a day that revealed tells a stranger nothing.
    expect(outcome(world(), "usr_zed", BENS, REVEAL)).toEqual(neutral);
    expect(commitExpected({ kind: "pinned", answer: NEUTRAL }, () => world())).toBe(NEUTRAL);
  });

  it("answers MEMBERSHIP_CHANGED on a day whose star left or asked to delete before its reveal (FQ63)", () => {
    const left = world({ members: { itv_ana: { leftAt: NOW.subtract({ hours: 1 }) } } });
    expect(outcome(left, "usr_ben")).toEqual({ kind: "pinned", answer: MEMBERSHIP_CHANGED });
    const deleting = world({ accounts: { usr_ana: { deletionRequestedAt: NOW.subtract({ hours: 1 }) } } });
    expect(outcome(deleting, "usr_ben")).toEqual({ kind: "pinned", answer: MEMBERSHIP_CHANGED });
    // Whatever the body names: the day's news comes before the upload's.
    expect(outcome(left, "usr_ben", { day: SAT, media: { kind: "photo", upload: "upl_nobody" } })).toEqual({
      kind: "pinned",
      answer: MEMBERSHIP_CHANGED,
    });
    expect(outcome(left, "usr_zed")).toEqual(neutral);
    // The star leaving after the reveal changes nothing before it.
    const later = world({ members: { itv_ana: { leftAt: REVEAL.add({ hours: 1 }) } } });
    expect(outcome(later, "usr_ben").kind).toBe("added");
  });

  it("refuses from the reveal on with the day as it is then and the star's next day, whatever the body names (T3, T4)", () => {
    const open = outcome(world(), "usr_ben", BENS, REVEAL);
    expect(open).toEqual({
      kind: "refused",
      code: "OCCURRENCE_CLOSED",
      body: { code: "OCCURRENCE_CLOSED", target: SAT_AS("open"), next_target: NEXT_COLLECTING },
    });
    const past = outcome(world(), "usr_ben", BENS, CLOSE);
    expect(past.kind === "refused" && past.body.target).toEqual(SAT_AS("past"));
    for (const ask of [
      { day: SAT, media: { kind: "photo", upload: "upl_nobody" } },
      { day: SAT, media: { kind: "external_video", source: "src_x" } },
      { ...BENS, reservation: "rsv_other" },
    ] as const)
      expect(outcome(world(), "usr_ben", ask, REVEAL)).toEqual(open);
    expect(outcome(world({ next: false }), "usr_ben", BENS, REVEAL)).toEqual({
      kind: "refused",
      code: "OCCURRENCE_CLOSED",
      body: { code: "OCCURRENCE_CLOSED", target: SAT_AS("open") },
    });
    // A microsecond before the reveal, with the slot still live, adds it.
    const last = world({ reservations: { rsv_ben: slot("itv_ben", { expiresAt: REVEAL }) } });
    expect(outcome(last, "usr_ben", BENS, REVEAL.subtract({ microseconds: 1 })).kind).toBe("added");
    const judge = commitExpected(open, () => world());
    const refused = (body: Record<string, unknown>, status = 409) =>
      answer({ code: "OCCURRENCE_CLOSED", ...body }, status);
    expect(takes(judge, refused({ target: SAT_AS("open"), next_target: NEXT_COLLECTING }))).toEqual([]);
    expect(takes(judge, refused({ target: SAT_AS("collecting"), next_target: NEXT_COLLECTING }))).not.toEqual([]);
    expect(takes(judge, refused({ target: SAT_AS("open") }))).not.toEqual([]);
    expect(takes(judge, refused({ target: SAT_AS("open"), next_target: NEXT_COLLECTING }, 404))).not.toEqual([]);
    expect(
      takes(
        judge,
        answer({ code: "OCCURRENCE_CLOSED", target: SAT_AS("open"), next_target: NEXT_COLLECTING }, 409, {
          "cache-control": "no-store",
        }),
      ),
    ).not.toEqual([]);
  });

  it("gives the neutral not-found for a link, which no source can name yet (the plan's section 0.2)", () => {
    expect(outcome(world(), "usr_ben", { day: SAT, media: { kind: "external_video", source: "src_ben" } })).toEqual(
      neutral,
    );
  });

  it("gives the neutral not-found unless the upload is the caller's own live photo, under their slot in this day (T4, T12, T14)", () => {
    const cases: [string, ReturnType<typeof world>, CommitAsk?][] = [
      ["nobody's id", world(), { day: SAT, media: { kind: "photo", upload: "upl_nobody" } }],
      ["another member's upload", world({ uploads: { upl_ben: upload("usr_cleo", "rsv_ben") } })],
      ["a lapsed upload", world({ uploads: { upl_ben: upload("usr_ben", "rsv_ben", { expiresAt: NOW }) } })],
      ["an avatar", world({ uploads: { upl_ben: upload("usr_ben", null, { purpose: "avatar" }) } })],
      ["a replacement", world({ uploads: { upl_ben: upload("usr_ben", "rsv_ben", { purpose: "replacement" }) } })],
      ["no slot", world({ uploads: { upl_ben: upload("usr_ben", null) } })],
      ["a slot nobody has", world({ uploads: { upl_ben: upload("usr_ben", "rsv_gone") } })],
      ["a slot in another day", world({ reservations: { rsv_ben: slot("itv_ben", { day: NEXT }) } })],
      ["another member's slot", world({ reservations: { rsv_ben: slot("itv_cleo") } })],
      ["reservation_id naming another slot", world(), { ...BENS, reservation: "rsv_other" }],
    ];
    for (const [name, w, ask] of cases) expect(outcome(w, "usr_ben", ask), name).toEqual(neutral);
    // A rejoined account's earlier upload is under the interval that ended, never the one active now.
    const rejoined = world({
      members: { itv_ben: { leftAt: NOW.subtract({ hours: 1 }) }, itv_ben2: { account: "usr_ben" } },
    });
    expect(outcome(rejoined, "usr_ben")).toEqual(neutral);
    // The slot it names, and an upload a microsecond from lapsing, are added.
    expect(outcome(world(), "usr_ben", { ...BENS, reservation: "rsv_ben" })).toEqual(added());
    const lastMicrosecond = world({
      uploads: { upl_ben: upload("usr_ben", "rsv_ben", { expiresAt: NOW.add({ microseconds: 1 }) }) },
    });
    expect(outcome(lastMicrosecond, "usr_ben").kind).toBe("added");
  });

  it("answers MEDIA_NOT_READY to the caller's own upload until it is ready", () => {
    for (const state of ["pending", "preparing", "held", "rejected"] as const) {
      const w = world({ uploads: { upl_ben: upload("usr_ben", "rsv_ben", { state }) } });
      expect(outcome(w, "usr_ben"), state).toEqual({ kind: "pinned", answer: MEDIA_NOT_READY });
    }
    expect(outcome(world(), "usr_ben")).toEqual(added());
  });

  it("answers DUPLICATE_DROP with the caller's earliest active or held drop of the same photo in the day (T21)", () => {
    const duplicate = (existing: string) => ({
      kind: "refused",
      code: "DUPLICATE_DROP",
      body: { code: "DUPLICATE_DROP", existing_drop_id: existing },
    });
    const same = { dedupe: HASH, upload: "upl_first" };
    expect(outcome(world({ drops: { drp_first: { ...drop("itv_ben"), row: same } } }), "usr_ben")).toEqual(
      duplicate("drp_first"),
    );
    expect(
      outcome(world({ drops: { drp_first: { ...drop("itv_ben", { state: "held" }), row: same } } }), "usr_ben"),
    ).toEqual(duplicate("drp_first"));
    // The earliest by commit time, then by id byte by byte.
    const two = world({
      drops: {
        drp_b: { ...drop("itv_ben"), row: { ...same, submittedAt: NOW.subtract({ hours: 3 }) } },
        drp_a: { ...drop("itv_ben"), row: { ...same, upload: "upl_a", submittedAt: NOW.subtract({ hours: 1 }) } },
      },
    });
    expect(outcome(two, "usr_ben")).toEqual(duplicate("drp_b"));
    const tied = world({
      drops: {
        drp_b: { ...drop("itv_ben"), row: same },
        drp_B: { ...drop("itv_ben"), row: { ...same, upload: "upl_B" } },
      },
    });
    expect(outcome(tied, "usr_ben")).toEqual(duplicate("drp_B"));
    // Not a duplicate: withdrawn or removed, another member's, another day's, another photo.
    for (const [name, one] of [
      ["withdrawn", { ...drop("itv_ben", { state: "withdrawn", endedAt: NOW }), row: same }],
      ["removed", { ...drop("itv_ben", { state: "removed", endedAt: NOW }), row: same }],
      ["Cleo's", { ...drop("itv_cleo"), row: same }],
      ["another day's", { ...drop("itv_ben", { day: NEXT }), row: same }],
      ["another photo", { ...drop("itv_ben"), row: { upload: "upl_first" } }],
    ] as const)
      expect(outcome(world({ drops: { drp_first: one } }), "usr_ben"), name).toEqual(added());
    const judge = commitExpected(duplicate("drp_first") as CommitOutcome, () => world());
    expect(takes(judge, answer({ code: "DUPLICATE_DROP", existing_drop_id: "drp_first" }, 409))).toEqual([]);
    expect(takes(judge, answer({ code: "DUPLICATE_DROP", existing_drop_id: "drp_other" }, 409))).not.toEqual([]);
    expect(takes(judge, answer({ code: "DUPLICATE_DROP" }, 409))).not.toEqual([]);
  });

  it("gives the neutral not-found for an upload another drop already used, the withdrawn one's included", () => {
    const used = world({
      drops: { drp_first: { ...drop("itv_ben", { state: "withdrawn", endedAt: NOW }), row: { upload: "upl_ben" } } },
    });
    expect(outcome(used, "usr_ben")).toEqual(neutral);
  });

  it("takes a free slot for an ended one, or refuses QUOTA_FULL, then PHOTO_LIMIT, with the allowance (T17, T18)", () => {
    for (const more of [
      { state: "released" as const },
      { state: "expired" as const },
      { expiresAt: NOW },
      { expiresAt: NOW.subtract({ minutes: 1 }) },
    ]) {
      const ended = world({ reservations: { rsv_ben: slot("itv_ben", more) } });
      expect(outcome(ended, "usr_ben"), JSON.stringify(more)).toEqual(added({ live: false }));
    }
    const photos = (n: number, links = 0) =>
      Object.fromEntries([
        ...Array.from({ length: n }, (_, i) => [`drp_p${String(i)}`, drop("itv_ben")] as const),
        ...Array.from(
          { length: links },
          (_, i) => [`drp_l${String(i)}`, drop("itv_ben", { media: "external_video" })] as const,
        ),
      ]);
    const released = { rsv_ben: slot("itv_ben", { state: "released" }) };
    expect(outcome(world({ reservations: released, drops: photos(2) }), "usr_ben")).toEqual({
      kind: "refused",
      code: "PHOTO_LIMIT",
      body: {
        code: "PHOTO_LIMIT",
        target: SAT_AS("collecting"),
        next_target: NEXT_COLLECTING,
        allowance: friend({ added: 2, photo_added: 2 }),
      },
    });
    expect(outcome(world({ reservations: released, drops: photos(2, 1) }), "usr_ben")).toEqual({
      kind: "refused",
      code: "QUOTA_FULL",
      body: {
        code: "QUOTA_FULL",
        target: SAT_AS("collecting"),
        next_target: NEXT_COLLECTING,
        allowance: friend({ added: 3, photo_added: 2, external_added: 1 }),
      },
    });
    // A live slot of the caller's counts against the free ones; a lapsed one doesn't.
    const holding = {
      ...released,
      rsv_two: slot("itv_ben"),
    };
    expect(outcome(world({ reservations: holding, drops: photos(1) }), "usr_ben").kind).toBe("refused");
    const lapsed = { ...released, rsv_two: slot("itv_ben", { expiresAt: NOW }) };
    expect(outcome(world({ reservations: lapsed, drops: photos(1) }), "usr_ben")).toEqual(added({ live: false }));
    // A drop withdrawn before the reveal gives its place back.
    const withdrawn = { ...photos(1), drp_w: drop("itv_ben", { state: "withdrawn", endedAt: NOW }) };
    expect(outcome(world({ reservations: released, drops: withdrawn }), "usr_ben")).toEqual(added({ live: false }));
    // A live slot is consumed whatever the counts: the slot was the place.
    expect(outcome(world({ drops: photos(2, 1) }), "usr_ben")).toEqual(added());
    // The star's six: QUOTA_FULL first at six photos.
    const star = world({
      reservations: { rsv_ana: slot("itv_ana", { state: "released" }) },
      uploads: { upl_ana: upload("usr_ana", "rsv_ana") },
      hashes: { upl_ana: HASH },
      drops: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`drp_s${String(i)}`, drop("itv_ana")])),
    });
    const full = outcome(star, "usr_ana", { day: SAT, media: { kind: "photo", upload: "upl_ana" } });
    expect(full.kind === "refused" && full.code).toBe("QUOTA_FULL");
  });
});

/** Ben's drop, as the command leaves the world after it from world(). */
function afterAdding(
  more: {
    id?: string;
    caption?: string | null;
    audience?: string[];
    row?: DropRowOver;
    slot?: Partial<WorldReservation>;
    highlights?: Record<string, { drop: string | null; version: number }>;
  } = {},
): DropWorld {
  const id = more.id ?? "drp_new";
  return world({
    drops: {
      [id]: {
        ...drop("itv_ben", {
          caption: more.caption === undefined ? "The ferry" : more.caption,
          audience: new Set(more.audience ?? ["itv_ana", "itv_ben", "itv_cleo"]),
        }),
        row: { upload: "upl_ben", dedupe: HASH, submittedAt: NOW, ...more.row },
      },
    },
    reservations: { rsv_ben: slot("itv_ben", { state: "consumed", drop: "drp_new", ...more.slot }) },
    ...(more.highlights === undefined ? {} : { highlights: more.highlights }),
  });
}

describe("the DropReceipt and the rows after it (commitExpected, committedProblems)", () => {
  const receipt = (more: Record<string, unknown> = {}) => ({
    drop_id: "drp_new",
    occurrence: SAT_AS("collecting"),
    media_class: "photo",
    state: "added",
    version: 1,
    allowance: friend({ added: 1, photo_added: 1 }),
    highlight: { version: 0 },
    ...more,
  });
  const judge = (after: DropWorld = afterAdding()) => commitExpected(outcome(world(), "usr_ben"), () => after);

  it("takes the receipt of the drop added, with the caller's allowance and highlight as they stand", () => {
    expect(takes(judge(), answer(receipt(), 201))).toEqual([]);
    const pointed = afterAdding({ highlights: { [`${SAT} itv_ben`]: { drop: "drp_old", version: 3 } } });
    expect(takes(judge(pointed), answer(receipt({ highlight: { drop_id: "drp_old", version: 3 } }), 201))).toEqual([]);
    const cleared = afterAdding({ highlights: { [`${SAT} itv_ben`]: { drop: null, version: 4 } } });
    expect(takes(judge(cleared), answer(receipt({ highlight: { version: 4 } }), 201))).toEqual([]);
    // Another member's highlight is not the caller's.
    const cleos = afterAdding({ highlights: { [`${SAT} itv_cleo`]: { drop: "drp_c", version: 1 } } });
    expect(takes(judge(cleos), answer(receipt(), 201))).toEqual([]);
  });

  it("refuses a receipt that differs in any field, has another, or isn't the caller's alone", () => {
    for (const wrong of [
      receipt({ occurrence: SAT_AS("open") }),
      receipt({ media_class: "external_video" }),
      receipt({ state: "active" }),
      receipt({ version: 2 }),
      receipt({ allowance: friend({ added: 1, photo_added: 1, reserved: 1, photo_reserved: 1 }) }),
      receipt({ highlight: { drop_id: "drp_new", version: 1 } }),
      receipt({ caption: "The ferry" }),
      receipt({ drop_id: "drp_nobody" }),
      receipt({ drop_id: "drp new" }),
      receipt({ drop_id: undefined }),
    ])
      expect(takes(judge(), answer(wrong, 201)), JSON.stringify(wrong)).not.toEqual([]);
    expect(takes(judge(), answer(receipt(), 200))).not.toEqual([]);
    expect(takes(judge(), answer(receipt(), 201, { "cache-control": "no-store" }))).not.toEqual([]);
  });

  const added_ = outcome(world(), "usr_ben");
  const problems = (after: DropWorld, caption: string | undefined = "The ferry", previous = world()) =>
    committedProblems(previous, after, answer(receipt(), 201), added_, caption);

  it("holds the rows of a drop added: one drop of the caller's, its caption, upload, hash, instant and audience (T8)", () => {
    expect(problems(afterAdding())).toEqual([]);
    // An empty caption is none; an absent one too.
    expect(problems(afterAdding({ caption: null }), "")).toEqual([]);
    expect(
      committedProblems(world(), afterAdding({ caption: null }), answer(receipt(), 201), added_, undefined),
    ).toEqual([]);
    expect(problems(afterAdding({ caption: "" }), "")).not.toEqual([]);
    expect(problems(afterAdding({ caption: "Another" }))).not.toEqual([]);
    expect(problems(afterAdding({ audience: ["itv_ana", "itv_ben"] }))).not.toEqual([]);
    expect(problems(afterAdding({ audience: ["itv_ana", "itv_ben", "itv_cleo", "itv_dan"] }))).not.toEqual([]);
    expect(problems(afterAdding({ row: { dedupe: OTHER_HASH } }))).not.toEqual([]);
    expect(problems(afterAdding({ row: { upload: "upl_other" } }))).not.toEqual([]);
    expect(problems(afterAdding({ row: { submittedAt: NOW.add({ microseconds: 1 }) } }))).not.toEqual([]);
    expect(problems(afterAdding({ id: "drp_other" }))).not.toEqual([]);
    expect(problems(world())).not.toEqual([]);
    // A member who left before the commit is out of its audience; one still active is in it.
    const leftBefore = world({ members: { itv_cleo: { leftAt: NOW.subtract({ hours: 1 }) } } });
    const without = afterAdding({ audience: ["itv_ana", "itv_ben"] });
    expect(problems(without, "The ferry", leftBefore)).toEqual([]);
    expect(problems(afterAdding(), "The ferry", leftBefore)).not.toEqual([]);
  });

  it("holds the slot consumed by the drop when live, and nothing else changed but the caller's own lapsed slots (T18, T20)", () => {
    expect(problems(afterAdding({ slot: { state: "live", drop: null } }))).not.toEqual([]);
    expect(problems(afterAdding({ slot: { drop: "drp_other" } }))).not.toEqual([]);
    // Settling the caller's own lapsed slot in the day is the command's; anyone else's isn't.
    const previous = world({
      reservations: {
        rsv_ben: slot("itv_ben"),
        rsv_lapsed: slot("itv_ben", { expiresAt: NOW }),
        rsv_cleo: slot("itv_cleo", { expiresAt: NOW }),
        rsv_next: slot("itv_ben", { day: NEXT, expiresAt: NOW }),
      },
    });
    const after = (states: Record<string, WorldReservation["state"]>) => {
      const base = afterAdding();
      const reservations = new Map(base.world.reservations);
      for (const [id, was] of previous.world.reservations)
        if (id !== "rsv_ben") reservations.set(id, { ...was, state: states[id] ?? was.state });
      return { ...base, world: { ...base.world, reservations } };
    };
    expect(problems(after({}), "The ferry", previous)).toEqual([]);
    expect(problems(after({ rsv_lapsed: "expired" }), "The ferry", previous)).toEqual([]);
    expect(problems(after({ rsv_cleo: "expired" }), "The ferry", previous)).not.toEqual([]);
    expect(problems(after({ rsv_next: "expired" }), "The ferry", previous)).not.toEqual([]);
    expect(problems(after({ rsv_lapsed: "released" }), "The ferry", previous)).not.toEqual([]);
    // An ended slot is left as it was: the drop takes a free place, not that slot.
    const ended = world({ reservations: { rsv_ben: slot("itv_ben", { state: "released" }) } });
    const free = commitOutcome(ended, "usr_ben", BENS, NOW);
    expect(free.kind === "added" && free.live).toBe(false);
    const keptReleased = afterAdding({ slot: { state: "released", drop: null } });
    expect(committedProblems(ended, keptReleased, answer(receipt(), 201), free, "The ferry")).toEqual([]);
    expect(committedProblems(ended, afterAdding(), answer(receipt(), 201), free, "The ferry")).not.toEqual([]);
  });

  it("holds every other drop, upload and highlight as it was", () => {
    const withOld = (more: Partial<WorldDrop> = {}, hl?: { drop: string | null; version: number }) => {
      const base = afterAdding();
      return {
        world: { ...base.world, drops: new Map(base.world.drops).set("drp_old", drop("itv_cleo", more)) },
        rows: {
          ...base.rows,
          drops: new Map(base.rows.drops).set("drp_old", {
            upload: "upl_old",
            dedupe: OTHER_HASH,
            submittedAt: NOW.subtract({ hours: 2 }),
          }),
          highlights: hl === undefined ? base.rows.highlights : new Map([[`${SAT} itv_cleo`, hl]]),
        },
      };
    };
    const previous = world({ drops: { drp_old: drop("itv_cleo") } });
    expect(problems(withOld(), "The ferry", previous)).toEqual([]);
    expect(problems(withOld({ caption: "changed" }), "The ferry", previous)).not.toEqual([]);
    expect(problems(withOld({ audience: new Set(["itv_ana"]) }), "The ferry", previous)).not.toEqual([]);
    expect(problems(withOld({}, { drop: "drp_old", version: 1 }), "The ferry", previous)).not.toEqual([]);
    const base = afterAdding();
    const changedUpload = {
      ...base,
      world: {
        ...base.world,
        uploads: new Map([["upl_ben", upload("usr_ben", "rsv_ben", { state: "held" })]]),
      },
    };
    expect(problems(changedUpload)).not.toEqual([]);
  });

  it("holds that a refusal, a retry and another body under a key make and change nothing (T19)", () => {
    const refusal: CommitOutcome = { kind: "pinned", answer: NEUTRAL };
    expect(committedProblems(world(), world(), NEUTRAL, refusal, "The ferry")).toEqual([]);
    expect(committedProblems(world(), afterAdding(), NEUTRAL, refusal, "The ferry")).not.toEqual([]);
    expect(unchangedProblems(afterAdding(), afterAdding())).toEqual([]);
    expect(unchangedProblems(world(), afterAdding())).toHaveLength(2);
    expect(unchangedProblems(afterAdding(), afterAdding({ caption: "again" }))).toEqual(["a drop was made or changed"]);
    expect(
      unchangedProblems(afterAdding(), afterAdding({ highlights: { [`${SAT} itv_ben`]: { drop: null, version: 1 } } })),
    ).toEqual(["a highlight changed"]);
    const base = afterAdding();
    expect(
      unchangedProblems(base, {
        ...base,
        world: { ...base.world, uploads: new Map([["upl_ben", upload("usr_ben", "rsv_ben", { state: "held" })]]) },
      }),
    ).toEqual(["an upload changed"]);
  });
});

describe("what a retry under the key that added a drop must get (replayExpected; T19, Q12, FQ139)", () => {
  // The first receipt, with Ana's avatar as it was then, its fields in the order the route wrote them.
  const ana = { membership_id: "itv_ana", display_name: "ana", avatar_version: "v_then" };
  const receipt = (star: Record<string, unknown>) => ({
    drop_id: "drp_new",
    occurrence: { ...SAT_AS("collecting"), star },
    media_class: "photo",
    state: "added",
    version: 1,
    allowance: friend({ added: 1, photo_added: 1 }),
    highlight: { version: 0 },
  });
  const first = answer(receipt(ana), 201);
  const replay = (over: Parameters<typeof world>[0]) => replayExpected(world(over).world, SAT, first);
  const avatar = { usr_ana: { avatar: "v_then" } };

  it("is the first answer byte for byte while the star is as they were, after the reveal too", () => {
    expect(replay({ accounts: avatar })).toBe(said(first));
    expect(replay({ accounts: avatar, sat: { revealAt: NOW.subtract({ hours: 1 }) } })).toBe(said(first));
  });

  it("names a renamed star as members see them now, where the first answer had them, nothing else moved", () => {
    const now = replay({ accounts: { usr_ana: { avatar: "v_now" } }, members: { itv_ana: { name: "Annie" } } });
    expect(now).toBe(
      said({ ...first, body: JSON.stringify(receipt({ ...ana, display_name: "Annie", avatar_version: "v_now" })) }),
    );
    expect(now).not.toBe(said(first));
  });

  it("names a star who has left by the name they left with, and no avatar (FQ75)", () => {
    const gone = replay({ accounts: avatar, members: { itv_ana: { name: "Annie", leftAt: NOW } } });
    expect(gone).toBe(
      said({ ...first, body: JSON.stringify(receipt({ membership_id: "itv_ana", display_name: "Annie" })) }),
    );
    // An account being deleted keeps the name, and shows no avatar.
    const deleting = replay({ accounts: { usr_ana: { avatar: "v_then", state: "deleting" } } });
    expect(deleting).toBe(
      said({ ...first, body: JSON.stringify(receipt({ membership_id: "itv_ana", display_name: "ana" })) }),
    );
  });

  it("is MEMBERSHIP_CHANGED once the star has no name left to show", () => {
    expect(replay({ members: { itv_ana: { name: null, leftAt: NOW } } })).toEqual(MEMBERSHIP_CHANGED);
  });
});
