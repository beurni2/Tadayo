/// <reference lib="esnext.temporal" />
// The leak scanner's own tests (TECH-DESIGN section 8; T10, T12, T14, T16; Q07): clean answers
// pass, and each planted leak is caught by the check meant to catch it, so a check removed or
// loosened fails here. No database: the world is written out below, as the matrix reads it from its
// rows.

import { Buffer } from "node:buffer";
import { STATUS_CODES } from "node:http";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { answerOf } from "./harness.ts";
import { contractOperations, readDocument } from "./operations.ts";
import {
  scan,
  type Answer,
  type Check,
  type MediaClass,
  type ScanContext,
  type WorldDrop,
  type WorldFacts,
} from "./scanner.ts";

const document = readDocument();
const operations = new Map(contractOperations(document).map((operation) => [operation.id, operation]));

function operation(id: string) {
  const found = operations.get(id);
  if (!found) throw new Error(id);
  return found;
}

const REVEAL = Temporal.Instant.from("2026-11-07T07:00:00Z");
const COLLECTING = REVEAL.subtract({ microseconds: 1 });
const OPEN = REVEAL.add({ hours: 2 });

// Ana's club: Ana, Ben and Cleo; Fay, who left it after the drops were committed; Eve, who joined
// after them; and Gus, who joined after Fay left. Stan is in another club, with a day and a drop of
// his own.
const ana = "itv_ana";
const ben = "itv_ben";
const cleo = "itv_cleo";
const eve = "itv_eve";
const fay = "itv_fay";
const gus = "itv_gus";
const stan = "itv_stan";

const instant = (text: string) => Temporal.Instant.from(text);

function drop(
  author: string,
  day: string,
  media: MediaClass,
  caption: string | null,
  audience: string[],
  comments: string[] = [],
) {
  return { author, day, media, caption, audience: new Set(audience), comments } satisfies WorldDrop;
}

function member(club: string, name: string, joined: string, left: string | null = null) {
  return { club, name, joinedAt: instant(joined), leftAt: left === null ? null : instant(left) };
}

function day(club: string, star: string, reveal: string, close: string, collecting: string) {
  return { club, star, revealAt: instant(reveal), closeAt: instant(close), collectingFrom: instant(collecting) };
}

const world: WorldFacts = {
  drops: new Map([
    ["drp_ben", drop(ben, "occ_sat", "photo", "From Ben", [ana, ben, cleo])],
    ["drp_cleo", drop(cleo, "occ_sat", "external_video", "See https://example.org/x", [ana, ben, cleo])],
    ["drp_secret", drop(ana, "occ_sat", "photo", "Only for Ben", [ana, ben])],
    [
      "drp_quote",
      drop(ben, "occ_sat", "photo", "Like https://www.tiktok.com/@cleo/video/7312345678901234567", [ana, ben, cleo]),
    ],
    ["drp_old", drop(ben, "occ_old", "photo", null, [ana, ben, cleo], ["Lovely light"])],
    // Fay's own, on the day before she left; her interval has ended, so it is in no audience of hers.
    ["drp_fay", drop(fay, "occ_old", "photo", "From Fay", [ana, ben, cleo], ["Nice one"])],
    ["drp_stan", drop(stan, "occ_far", "photo", "Far away", [stan])],
  ]),
  days: new Map([
    ["occ_sat", day("clb_sat", ana, "2026-11-07T07:00:00Z", "2026-11-08T01:00:00Z", "2026-11-02T08:00:00Z")],
    ["occ_old", day("clb_sat", ana, "2026-10-31T07:00:00Z", "2026-11-01T01:00:00Z", "2026-10-26T08:00:00Z")],
    ["occ_next", day("clb_sat", ana, "2026-11-14T07:00:00Z", "2026-11-15T01:00:00Z", "2026-11-09T08:00:00Z")],
    ["occ_far", day("clb_far", stan, "2026-11-07T07:00:00Z", "2026-11-08T01:00:00Z", "2026-11-02T08:00:00Z")],
  ]),
  members: new Map([
    [ana, member("clb_sat", "Ana", "2026-10-01T10:00:00Z")],
    [ben, member("clb_sat", "Ben", "2026-10-01T12:00:00Z")],
    [cleo, member("clb_sat", "Cleo", "2026-10-01T12:00:00Z")],
    [eve, member("clb_sat", "Eve", "2026-11-06T20:10:00Z")],
    [fay, member("clb_sat", "Fay", "2026-10-01T12:00:00Z", "2026-11-06T21:00:00Z")],
    [gus, member("clb_sat", "Gus", "2026-11-06T22:00:00Z")],
    [stan, member("clb_far", "Stan", "2026-10-01T10:00:00Z")],
  ]),
  clubs: new Map([
    ["clb_sat", { name: "Saturday People", labels: new Set(["Mo"]) }],
    ["clb_far", { name: "Far Club", labels: new Set<string>() }],
  ]),
  reservations: new Map([
    ["rsv_cleo", { interval: cleo, day: "occ_sat", media: "photo" as const }],
    ["rsv_ana", { interval: ana, day: "occ_sat", media: "photo" as const }],
  ]),
  canaries: new Map([
    ["https://www.tiktok.com/@cleo/video/7312345678901234567", ["drp_cleo"]],
    ["7312345678901234567", ["drp_cleo"]],
    ["v_q1w2e3", ["drp_ben"]],
    ["v_old", ["drp_old"]],
    ["uploads/raw_q1w2e3", []],
    ["v_pending", []],
  ]),
};

function context(id: string, viewer: string, overrides: Partial<ScanContext> = {}): ScanContext {
  return {
    document,
    operation: operation(id),
    skeleton: false,
    viewer: { intervals: new Set([viewer]), texts: new Set() },
    world,
    now: COLLECTING,
    ...overrides,
  };
}

const person = (interval: string, name: string) => ({ membership_id: interval, display_name: name });
const club = (viewer = cleo) => ({
  id: "clb_sat",
  name: "Saturday People",
  timezone: "Europe/London",
  my_membership_id: viewer,
});
const occurrence = (id: string, date: string, reveal: string, close: string, phase: string) => ({
  id,
  club_id: "clb_sat",
  star: person(ana, "Ana"),
  local_date: date,
  reveal_at: reveal,
  close_at: close,
  phase,
});
const saturday = occurrence("occ_sat", "2026-11-07", "2026-11-07T07:00:00Z", "2026-11-08T01:00:00Z", "collecting");
const lastSaturday = occurrence("occ_old", "2026-10-31", "2026-10-31T07:00:00Z", "2026-11-01T01:00:00Z", "past");
const nextSaturday = occurrence("occ_next", "2026-11-14", "2026-11-14T07:00:00Z", "2026-11-15T01:00:00Z", "collecting");

const bensCard = () => ({
  view: "caption",
  id: "drp_ben",
  author: person(ben, "Ben"),
  media_class: "photo",
  caption: "From Ben",
});
const cleosCard = () => ({
  view: "caption",
  id: "drp_cleo",
  author: person(cleo, "Cleo"),
  media_class: "external_video",
  caption: "See https://example.org/x",
});
const bensOwnCard = () => ({
  view: "own",
  id: "drp_ben",
  author: person(ben, "Ben"),
  media_class: "photo",
  caption: "From Ben",
  highlight: true,
  state: "added",
  version: 1,
});
const bensRevealedCard = (reactions: unknown[] = []) => ({
  view: "revealed",
  id: "drp_ben",
  author: person(ben, "Ben"),
  media_class: "photo",
  caption: "From Ben",
  highlight: true,
  photo: { width: 1200, height: 900, media_version: "v_q1w2e3" },
  reactions,
  viewer_favourite: false,
});

/** The viewer's own place in Saturday: Ana's day, which Eve and Gus joined after it started collecting. */
const placeIn = (viewer: string) => ({ is_star: viewer === ana, joined_later: viewer === eve || viewer === gus });

function upcomingDay(drops: unknown[], viewer = cleo) {
  return {
    stage: "upcoming",
    server_now: "2026-11-07T06:59:59Z",
    occurrence: saturday,
    club: club(viewer),
    viewer: placeIn(viewer),
    drops,
  };
}

function revealedDay(drops: unknown[], highlights: unknown[], viewer = cleo) {
  return {
    stage: "revealed",
    server_now: "2026-11-07T09:00:00Z",
    occurrence: { ...saturday, phase: "open" },
    club: club(viewer),
    viewer: placeIn(viewer),
    drops,
    highlights,
  };
}

function ownContribution(id: string, caption: string, viewer = cleo) {
  return {
    drop_id: id,
    club: club(viewer),
    occurrence: saturday,
    media_class: "photo",
    caption,
    state: "added",
    version: 1,
  };
}

const AFTER_CLOSE = Temporal.Instant.from("2026-11-08T02:00:00Z");
const pastSaturday = { ...saturday, phase: "past" };
const allowance = (added: number, external: number, reserved: number, externalReserved: number) => ({
  added,
  reserved,
  limit: 6,
  external_added: external,
  external_reserved: externalReserved,
  external_limit: 2,
});
const cleosOwnCard = () => ({
  view: "own",
  id: "drp_cleo",
  author: person(cleo, "Cleo"),
  media_class: "external_video",
  caption: "See https://example.org/x",
  highlight: false,
  state: "added",
  version: 1,
});
const ownDay = (counts: ReturnType<typeof allowance>) => ({
  server_now: "2026-11-07T06:59:59Z",
  occurrence: saturday,
  club: club(),
  allowance: counts,
  highlight: { version: 1 },
  drops: [cleosOwnCard()],
});
const waitingHome = (now: string, recent: unknown[], viewer = cleo) => ({
  mode: "waiting",
  server_now: now,
  club: club(viewer),
  club_today: now.slice(0, 10),
  next: nextSaturday,
  recent_days: recent,
});
const comments = (author: unknown, text: string) => ({
  items: [{ id: "cmt_1", author, text, edited: false }],
  thread_muted: false,
});
const clubSummary = (viewer: string) => ({ ...club(viewer), state: "active", member_count: 5 });

const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" };

function answer(body: unknown, status = 200, headers: Record<string, string> = {}): Answer {
  return {
    status,
    reason: STATUS_CODES[status] ?? "",
    headers: { ...HEADERS, ...headers },
    body: JSON.stringify(body),
  };
}

/** An answer with no body. */
function bare(status: number, headers: Record<string, string> = {}): Answer {
  return { status, reason: STATUS_CODES[status] ?? "", headers, body: "" };
}

function checks(found: { check: Check }[]): Check[] {
  return [...new Set(found.map((finding) => finding.check))].sort();
}

function at(found: { check: Check; at: string }[], check: Check): string[] {
  return found.filter((finding) => finding.check === check).map((finding) => finding.at);
}

describe("the leak scanner passes what may be shown", () => {
  it("passes a day before the reveal with Ben's and Cleo's caption cards, to Cleo", () => {
    expect(scan(answer(upcomingDay([bensCard(), cleosCard()])), context("getOccurrence", cleo))).toEqual([]);
  });

  it("passes the author's own card beside another's caption card, to the author (TECH-DESIGN section 8)", () => {
    const body = upcomingDay([bensOwnCard(), cleosCard()], ben);
    expect(scan(answer(body), context("getOccurrence", ben))).toEqual([]);
  });

  it("passes a caption that holds a link of its own, as the world stored it (T13)", () => {
    expect(scan(answer(upcomingDay([cleosCard()])), context("getOccurrence", cleo))).toEqual([]);
  });

  it("passes a caption card whose author carries their avatar version (FQ74, ADR-031)", () => {
    const card = { ...bensCard(), author: { ...person(ben, "Ben"), avatar_version: "v_avatar_ben" } };
    expect(scan(answer(upcomingDay([card])), context("getOccurrence", cleo))).toEqual([]);
  });

  it("passes an opened day whose next day and add target haven't opened, with the photo's own content version", () => {
    const body = {
      mode: "day",
      server_now: "2026-10-31T09:00:00Z",
      club: club(),
      club_today: "2026-10-31",
      day: {
        stage: "revealed",
        server_now: "2026-10-31T09:00:00Z",
        occurrence: { ...lastSaturday, phase: "open" },
        club: club(),
        viewer: { is_star: false, joined_later: false },
        add_target: nextSaturday,
        drops: [
          {
            view: "revealed",
            id: "drp_old",
            author: person(ben, "Ben"),
            media_class: "photo",
            highlight: false,
            photo: { width: 1200, height: 900, media_version: "v_old" },
            reactions: [],
            viewer_favourite: false,
          },
        ],
        highlights: [],
      },
      next: nextSaturday,
      recent_days: [],
    };
    const now = Temporal.Instant.from("2026-10-31T09:00:00Z");
    expect(scan(answer(body), context("getHome", cleo, { now }))).toEqual([]);
  });

  it("passes a revealed day with its highlight, and who reacted only to the drop's author (FQ73)", () => {
    const heart = { reaction: "heart" };
    const toCleo = revealedDay(
      [bensRevealedCard([heart])],
      [{ drop_id: "drp_ben", author: person(ben, "Ben"), star_pick: true }],
    );
    expect(scan(answer(toCleo), context("getOccurrence", cleo, { now: OPEN }))).toEqual([]);
    const withPeople = { ...heart, people: [person(cleo, "Cleo")] };
    const toBen = revealedDay([bensRevealedCard([withPeople])], [], ben);
    expect(scan(answer(toBen), context("getOccurrence", ben, { now: OPEN }))).toEqual([]);
  });

  it("passes the viewer's own drop in Your drops, and their own drop in DUPLICATE_DROP", () => {
    const mine = { items: [ownContribution("drp_cleo", "See https://example.org/x")] };
    expect(scan(answer(mine), context("listMyDrops", cleo))).toEqual([]);
    const duplicate = answer({ code: "DUPLICATE_DROP", existing_drop_id: "drp_cleo" }, 409);
    expect(scan(duplicate, context("createDrop", cleo))).toEqual([]);
  });

  it("passes the neutral not-found, the skeleton's on an operation that declares no 404, a bare 204 and a 429 that says when", () => {
    const neutral = answer({ code: "NOT_FOUND" }, 404);
    expect(scan(neutral, context("getOccurrence", cleo))).toEqual([]);
    expect(scan(neutral, context("getMe", cleo, { skeleton: true }))).toEqual([]);
    expect(scan(bare(204), context("removeFavourite", cleo))).toEqual([]);
    const limited = answer({ code: "RATE_LIMITED", retry_after_seconds: 30 }, 429, { "retry-after": "30" });
    expect(scan(limited, context("getOccurrence", cleo))).toEqual([]);
  });

  it("passes the transport's headers in their own forms, and a Content-Length that is the body's", () => {
    const body = upcomingDay([bensCard()]);
    const headers = {
      "content-length": String(Buffer.byteLength(JSON.stringify(body))),
      date: "Sat, 07 Nov 2026 06:59:59 GMT",
      connection: "keep-alive",
      "keep-alive": "timeout=72",
    };
    expect(scan(answer(body, 200, headers), context("getOccurrence", cleo))).toEqual([]);
  });

  it("passes a caption that holds another drop's link, as its author wrote it, to its readers (T13)", () => {
    const quote = {
      view: "caption",
      id: "drp_quote",
      author: person(ben, "Ben"),
      media_class: "photo",
      caption: "Like https://www.tiktok.com/@cleo/video/7312345678901234567",
    };
    expect(scan(answer(upcomingDay([quote])), context("getOccurrence", cleo))).toEqual([]);
  });

  it("passes a former author's own drop in Your drops and its withdrawal, and the people they knew, without avatars", () => {
    const theirs = {
      items: [{ ...ownContribution("drp_fay", "From Fay", fay), occurrence: lastSaturday }],
    };
    expect(scan(answer(theirs), context("listMyDrops", fay))).toEqual([]);
    expect(scan(answer({ drop_id: "drp_fay", state: "withdrawn" }), context("removeDrop", fay))).toEqual([]);
    const known = {
      server_now: "2026-11-07T06:59:59Z",
      club: club(fay),
      members: [
        { person: person(ana, "Ana"), position: 1, next_up: false },
        { person: person(ben, "Ben"), position: 2, next_up: false },
      ],
    };
    expect(scan(answer(known), context("listMembers", fay))).toEqual([]);
  });

  it("passes the viewer's own allowance and clubs, a closed day's link with a photo cover, and a random cursor", () => {
    expect(scan(answer(ownDay(allowance(1, 1, 1, 0))), context("getOwnDay", cleo))).toEqual([]);
    const clubs = { server_now: "2026-11-07T06:59:59Z", clubs: [clubSummary(cleo)], invitations: [] };
    expect(scan(answer(clubs), context("listClubs", cleo))).toEqual([]);
    const home = waitingHome("2026-11-08T02:00:00Z", [{ occurrence: pastSaturday, cover_drop_id: "drp_ben" }]);
    expect(scan(answer(home), context("getHome", cleo, { now: AFTER_CLOSE }))).toEqual([]);
    const page = { items: [], next_cursor: "4RtIK5F6Cyxq3sqS_6pIVvN1uCTTw7SG" };
    expect(scan(answer(page), context("listMyDrops", cleo))).toEqual([]);
  });
});

describe("the leak scanner catches each planted leak with its own check", () => {
  // T10's never-list, each planted alone on a caption card: the key check catches each, whatever
  // the shape and whitelist checks also say.
  const neverList: Record<string, unknown> = {
    thumbnail_url: "https://cdn.example/t.jpg",
    width: 1200,
    height: 900,
    aspect_ratio: 1.33,
    dominant_colour: "#aabbcc",
    blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
    embed_html: "<iframe></iframe>",
    source_url: "https://www.tiktok.com/@ben/video/1",
    provider_post_id: "7312345678901234567",
    media_token: "abc",
    alt_text: "A dog",
    exif: {},
    captured_at: "2026-11-01T10:00:00Z",
    duration: 12,
    file_size: 1000,
    highlight: true,
    title: "My video",
    waveform: [1, 2],
  };
  for (const [key, value] of Object.entries(neverList)) {
    it(`catches ${key} on a caption card (T10)`, () => {
      const card = { ...bensCard(), [key]: value };
      const found = scan(answer(upcomingDay([card])), context("getOccurrence", cleo));
      expect(checks(found)).toContain("keys");
      expect(checks(found)).toContain("whitelist");
      expect(checks(found)).toContain("shape");
    });
  }

  it("catches a never-list key planted outside a caption card, on the day's occurrence and its club", () => {
    for (const [where, plant] of [
      ["occurrence", { occurrence: { ...saturday, cover_url: "x" } }],
      ["club", { club: { ...club(), poster: "x" } }],
    ] as const) {
      const found = scan(answer({ ...upcomingDay([bensCard()]), ...plant }), context("getOccurrence", cleo));
      expect(at(found, "keys"), where).toHaveLength(1);
    }
  });

  it("catches a third media class with the whitelist's own pin", () => {
    const found = scan(
      answer(upcomingDay([{ ...bensCard(), media_class: "photo_portrait" }])),
      context("getOccurrence", cleo),
    );
    expect(at(found, "whitelist")).toEqual(["$.drops[0].media_class"]);
  });

  it("catches a key planted in the card's author, and a card that lacks one (T10, FQ74)", () => {
    const planted = { ...bensCard(), author: { ...person(ben, "Ben"), email: "ben@example.org" } };
    expect(checks(scan(answer(upcomingDay([planted])), context("getOccurrence", cleo)))).toContain("whitelist");
    const lacking = Object.fromEntries(Object.entries(bensCard()).filter(([key]) => key !== "media_class"));
    expect(checks(scan(answer(upcomingDay([lacking])), context("getOccurrence", cleo)))).toContain("whitelist");
  });

  it("catches a revealed card before its day opens (T10)", () => {
    const body = { server_now: "2026-11-07T06:59:59Z", occurrence: saturday, club: club(), drop: bensRevealedCard() };
    const found = scan(answer(body), context("getDrop", cleo));
    // The key check also finds its highlight flag and photo, and the values check the photo's
    // content version, since nothing about it has opened.
    expect(checks(found)).toEqual(["keys", "values", "world"]);
    expect(at(found, "world")).toEqual(["$.drop"]);
    expect(at(found, "values")).toEqual(["$.drop.photo.media_version"]);
  });

  it("catches a revealed day, its highlight entry and a day link to it, before the day opens", () => {
    const early = { ...revealedDay([], [{ drop_id: "drp_ben", author: person(ben, "Ben"), star_pick: true }]) };
    const day = scan(answer(early), context("getOccurrence", cleo));
    expect(at(day, "world")).toEqual(["$", "$.highlights[0].drop_id"]);
    // An empty rail is still a rail before the reveal (T10, FQ21): the key check finds it too.
    expect(checks(scan(answer({ ...early, highlights: [] }), context("getOccurrence", cleo)))).toEqual([
      "keys",
      "world",
    ]);

    const waiting = (recent: unknown[]) => ({
      mode: "waiting",
      server_now: "2026-11-07T06:59:59Z",
      club: club(),
      club_today: "2026-11-07",
      next: saturday,
      recent_days: recent,
    });
    for (const link of [
      { occurrence: saturday },
      { occurrence: saturday, cover_drop_id: "drp_ben" },
      { occurrence: lastSaturday, cover_drop_id: "drp_ben" },
    ]) {
      const found = scan(answer(waiting([link])), context("getHome", cleo));
      expect(checks(found), JSON.stringify(link)).toEqual(["world"]);
    }
    expect(
      scan(answer(waiting([{ occurrence: lastSaturday, cover_drop_id: "drp_old" }])), context("getHome", cleo)),
    ).toEqual([]);
  });

  it("catches a highlight entry and a day link's cover for a viewer outside the drop's audience, after the reveal (T8, T22)", () => {
    const rail = revealedDay([], [{ drop_id: "drp_ben", author: person(ben, "Ben"), star_pick: true }], eve);
    expect(at(scan(answer(rail), context("getOccurrence", eve, { now: OPEN })), "world")).toEqual([
      "$.highlights[0].drop_id",
    ]);
    const wrongAuthor = revealedDay([], [{ drop_id: "drp_ben", author: person(cleo, "Cleo"), star_pick: true }]);
    expect(at(scan(answer(wrongAuthor), context("getOccurrence", cleo, { now: OPEN })), "world")).toEqual([
      "$.highlights[0].author",
    ]);
    const waiting = {
      mode: "waiting",
      server_now: "2026-11-07T09:00:00Z",
      club: club(eve),
      club_today: "2026-11-07",
      next: nextSaturday,
      recent_days: [{ occurrence: lastSaturday, cover_drop_id: "drp_old" }],
    };
    // Eve can read nothing in that day either, so the link itself is no link of hers (T15).
    expect(at(scan(answer(waiting), context("getHome", eve, { now: OPEN })), "world")).toEqual([
      "$.recent_days[0].cover_drop_id",
      "$.recent_days[0]",
    ]);
  });

  it("judges an own card by the world's author, never by the card's own author field (TECH-DESIGN section 8)", () => {
    // Cleo's drop as Ben's own card, its author field naming Ben: not Ben's own, so the card is
    // named as someone else's and keeps no exception from the key check, beside its wrong author.
    const cleosAsBens = { ...bensOwnCard(), id: "drp_cleo" };
    const found = scan(answer(upcomingDay([cleosAsBens], ben)), context("getOccurrence", ben));
    expect(checks(found)).toEqual(["keys", "world"]);
    expect(at(found, "world")).toContain("$.drops[0]");
    const unknown = { ...bensOwnCard(), id: "drp_nobody" };
    expect(checks(scan(answer(upcomingDay([unknown], ben)), context("getOccurrence", ben)))).toContain("world");
    // And another's own card keeps no exception from the key check.
    expect(checks(scan(answer(upcomingDay([bensOwnCard()])), context("getOccurrence", cleo)))).toEqual([
      "keys",
      "world",
    ]);
  });

  it("catches a caption card for a viewer outside the drop's audience, and its caption (T8, T9)", () => {
    const found = scan(answer(upcomingDay([bensCard()], eve)), context("getOccurrence", eve));
    expect(at(found, "world")).toEqual(["$.drops[0]"]);
    expect(at(found, "values")).toEqual(["$.drops[0].caption"]);
  });

  it("catches a caption swapped from another drop, a wrong name and a wrong author, on every card", () => {
    for (const card of [
      { ...bensCard(), caption: "See https://example.org/x" },
      { ...bensCard(), author: person(ben, "Cleo") },
      { ...bensCard(), author: person(cleo, "Cleo") },
    ]) {
      expect(checks(scan(answer(upcomingDay([card])), context("getOccurrence", cleo))), JSON.stringify(card)).toEqual([
        "world",
      ]);
    }
    // A caption the viewer can't read, from a drop whose audience is Ana and Ben: on a revealed card
    // after the reveal, on the viewer's own card, and in the viewer's own drop in Your drops.
    const revealed = revealedDay([{ ...bensRevealedCard(), caption: "Only for Ben" }], []);
    const own = upcomingDay([
      { ...bensOwnCard(), id: "drp_cleo", author: person(cleo, "Cleo"), caption: "Only for Ben" },
    ]);
    const mine = { items: [ownContribution("drp_cleo", "Only for Ben")] };
    for (const [name, found] of [
      ["revealed", scan(answer(revealed), context("getOccurrence", cleo, { now: OPEN }))],
      ["own", scan(answer(own), context("getOccurrence", cleo))],
      ["Your drops", scan(answer(mine), context("listMyDrops", cleo))],
    ] as const) {
      expect(checks(found), name).toEqual(["values", "world"]);
      expect(
        found.every((finding) => finding.at.endsWith(".caption")),
        name,
      ).toBe(true);
    }
  });

  it("catches someone else's drop where the schema says the viewer's own: Your drops, DUPLICATE_DROP, a receipt", () => {
    const bens = { items: [{ ...ownContribution("drp_ben", "From Ben"), state: "held" }] };
    expect(at(scan(answer(bens), context("listMyDrops", cleo)), "world")).toEqual(["$.items[0].drop_id"]);
    const duplicate = answer({ code: "DUPLICATE_DROP", existing_drop_id: "drp_ben" }, 409);
    expect(at(scan(duplicate, context("createDrop", cleo)), "world")).toEqual(["$.existing_drop_id"]);
    const removed = { drop_id: "drp_cleo", state: "withdrawn", highlight: { drop_id: "drp_ben", version: 2 } };
    expect(at(scan(answer(removed), context("removeDrop", cleo)), "world")).toEqual(["$.highlight.drop_id"]);
    // The viewer's own highlight pointer has no key finding: it is theirs.
    expect(checks(scan(answer({ ...removed, highlight: { version: 2 } }), context("removeDrop", cleo)))).toEqual([]);
  });

  it("catches who reacted shown to someone but the drop's author (FQ73)", () => {
    const state = { drop_id: "drp_ben", reactions: [{ reaction: "heart", people: [person(ana, "Ana")] }] };
    expect(at(scan(answer(state), context("setReaction", cleo, { now: OPEN })), "world")).toEqual([
      "$.reactions[0].people",
    ]);
    expect(scan(answer(state), context("setReaction", ben, { now: OPEN }))).toEqual([]);
  });

  it("catches a day, its club and its people shown to someone with no interval in the club (T14)", () => {
    const found = scan(answer(upcomingDay([bensCard()], stan)), context("getOccurrence", stan));
    expect(at(found, "world")).toEqual(
      expect.arrayContaining(["$.occurrence", "$.occurrence.star", "$.club", "$.club.my_membership_id", "$.drops[0]"]),
    );
    expect(at(found, "values")).toEqual(
      expect.arrayContaining(["$.occurrence.star.display_name", "$.club.name", "$.drops[0].caption"]),
    );
    // A person of another club inside the viewer's own day.
    const stranger = { ...upcomingDay([]), occurrence: { ...saturday, star: person(stan, "Stan") } };
    // Each finding pinned with its words: the check that judges a person's club must be the one that fails, not
    // another check that happens to name the same path.
    const ofAnotherClub = {
      check: "world",
      at: "$.occurrence.star",
      what: "a person of a club the viewer has no interval in (T14)",
    };
    expect(found).toContainEqual(ofAnotherClub);
    expect(scan(answer(stranger), context("getOccurrence", cleo))).toEqual([
      { check: "world", at: "$.occurrence.star", what: "not the day's star" },
      ofAnotherClub,
      {
        check: "values",
        at: "$.occurrence.star.display_name",
        what: "text people wrote that isn't the viewer's to read",
      },
    ]);
  });

  it("catches a drop of another day inside a day's object", () => {
    const found = scan(
      answer(upcomingDay([{ ...bensCard(), id: "drp_old", caption: null }])),
      context("getOccurrence", cleo),
    );
    expect(at(found, "world")).toContain("$.drops[0]");
  });

  it("catches text people wrote that the world didn't store: a storage path, a link, a made-up caption", () => {
    for (const caption of ["uploads/raw_q1w2e3", "https://www.tiktok.com/@ben/video/1", "From Ben "]) {
      const found = scan(answer(upcomingDay([{ ...bensCard(), caption }])), context("getOccurrence", cleo));
      expect(checks(found), caption).toContain("values");
    }
  });

  it("catches a value the world keeps back, wherever it is, until its drop opens to the viewer (Q07)", () => {
    const planted = { ...upcomingDay([bensCard()]), next_cursor: "7312345678901234567" };
    expect(at(scan(answer(planted), context("getOccurrence", cleo)), "values")).toEqual(["$.next_cursor"]);
    // In a header too: Date's form is the shape check's, and what it holds is the values check's.
    const inHeader = scan(answer(upcomingDay([bensCard()]), 200, { date: "v_q1w2e3" }), context("getOccurrence", cleo));
    expect(inHeader.map((finding) => `${finding.check} ${finding.at}`)).toEqual([
      "shape header date",
      "values header date",
    ]);
    // A photo's content version where an avatar version goes, before the reveal.
    const avatar = { ...bensCard(), author: { ...person(ben, "Ben"), avatar_version: "v_q1w2e3" } };
    expect(at(scan(answer(upcomingDay([avatar])), context("getOccurrence", cleo)), "values")).toEqual([
      "$.drops[0].author.avatar_version",
    ]);
    // After the reveal the video's post id is Cleo's to see, but not Eve's, outside its audience, and
    // a storage key or a pending upload's version is nobody's.
    const later = (value: string, viewer: string) =>
      at(scan(answer({ items: [], next_cursor: value }), context("listMyDrops", viewer, { now: OPEN })), "values");
    expect(later("7312345678901234567", cleo)).toEqual([]);
    expect(later("7312345678901234567", eve)).toEqual(["$.next_cursor"]);
    expect(later("v_pending", cleo)).toEqual(["$.next_cursor"]);
  });

  it("catches a URL in an id", () => {
    const found = scan(answer(upcomingDay([{ ...bensCard(), id: "https://x" }])), context("getOccurrence", cleo));
    expect(checks(found)).toContain("values");
  });

  it("catches a header no answer may carry yet, and a URL in a header's value", () => {
    const body = upcomingDay([bensCard()]);
    for (const header of [
      { location: "https://store.example/o" },
      { etag: '"v1"' },
      { "x-media-version": "v1" },
      { link: "<uploads/raw_q1w2e3>" },
    ]) {
      expect(checks(scan(answer(body, 200, header), context("getOccurrence", cleo))), JSON.stringify(header)).toContain(
        "shape",
      );
    }
    expect(
      checks(scan(answer(body, 200, { location: "https://store.example/o" }), context("getOccurrence", cleo))),
    ).toContain("values");
  });

  it("catches an image body, a body without private, no-store, a cacheable 204 and a 429 that doesn't say when", () => {
    const image: Answer = {
      status: 200,
      reason: "OK",
      headers: { "content-type": "image/jpeg", "cache-control": "private, no-store" },
      body: "ÿØÿ",
    };
    const found = scan(image, context("getDropMedia", cleo));
    expect(checks(found)).toEqual(["shape"]);
    expect(found.map((finding) => finding.at)).toEqual(expect.arrayContaining(["header content-type", "body"]));
    for (const cached of [
      answer(upcomingDay([bensCard()]), 200, { "cache-control": "public, max-age=60" }),
      {
        status: 200,
        reason: "OK",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(upcomingDay([])),
      },
    ]) {
      const cachedFound = scan(cached, context("getOccurrence", cleo));
      expect(cachedFound.map((finding) => `${finding.check} ${finding.at}`)).toEqual(["shape header cache-control"]);
    }
    const cacheable = scan(bare(204, { "cache-control": "max-age=60" }), context("removeFavourite", cleo));
    expect(cacheable.map((finding) => `${finding.check} ${finding.at}`)).toEqual(["shape header cache-control"]);
    for (const after of [undefined, "0", "soon", "86401"]) {
      const limited = answer(
        { code: "RATE_LIMITED", retry_after_seconds: 30 },
        429,
        after === undefined ? {} : { "retry-after": after },
      );
      expect(at(scan(limited, context("getOccurrence", cleo)), "shape"), String(after)).toEqual(["header retry-after"]);
    }
  });

  it("catches a status or code the operation doesn't declare, and a not-found that isn't neutral", () => {
    expect(checks(scan(answer({ code: "NOT_FOUND" }, 404), context("getMe", cleo)))).toEqual(["shape"]);
    expect(checks(scan(answer({ code: "CLUB_FULL" }, 409), context("getOccurrence", cleo)))).toEqual(["shape"]);
    const notNeutral = answer({ code: "NOT_FOUND", field: "x" }, 404);
    expect(checks(scan(notNeutral, context("getMe", cleo, { skeleton: true })))).toEqual(["shape"]);
  });

  it("catches an error body with a field its code doesn't carry: a not-found naming the day and a drop (T14)", () => {
    const named = answer({ code: "NOT_FOUND", target: saturday, existing_drop_id: "drp_ben" }, 404);
    expect(at(scan(named, context("getOccurrence", eve)), "shape")).toEqual(["body", "$.target", "$.existing_drop_id"]);
    const conflict = answer({ code: "VERSION_CONFLICT", current_version: 2, existing_drop_id: "drp_ben" }, 409);
    expect(at(scan(conflict, context("updateDrop", ben)), "shape")).toEqual(["$.existing_drop_id"]);
  });

  it("catches a former author's view of their drop's reactions, comments and highlight, once their interval has ended (FQ73)", () => {
    const reactions = { drop_id: "drp_fay", reactions: [{ reaction: "heart", people: [person(ana, "Ana")] }] };
    expect(at(scan(answer(reactions), context("setReaction", fay, { now: OPEN })), "world")).toEqual([
      "$.drop_id",
      "$.reactions[0].people",
    ]);
    expect(
      at(scan(answer(comments(person(ben, "Ben"), "Nice one")), context("listComments", fay, { now: OPEN })), "values"),
    ).toEqual(["$.items[0].text"]);
    const rail = {
      stage: "revealed",
      server_now: "2026-11-07T09:00:00Z",
      occurrence: lastSaturday,
      club: club(fay),
      viewer: { is_star: false, joined_later: false },
      drops: [],
      highlights: [{ drop_id: "drp_fay", author: person(fay, "Fay"), star_pick: false }],
    };
    expect(at(scan(answer(rail), context("getOccurrence", fay, { now: OPEN })), "world")).toEqual([
      "$.highlights[0].drop_id",
    ]);
  });

  it("catches a former member's club as one of theirs, a person who joined after they left, and avatars once an interval has ended (FQ75)", () => {
    const clubs = { server_now: "2026-11-07T06:59:59Z", clubs: [clubSummary(fay)], invitations: [] };
    expect(at(scan(answer(clubs), context("listClubs", fay)), "world")).toEqual([
      "$.clubs[0]",
      "$.clubs[0].my_membership_id",
    ]);
    const members = (people: unknown[]) => ({
      server_now: "2026-11-07T06:59:59Z",
      club: club(fay),
      members: people.map((who, index) => ({ person: who, position: index + 1, next_up: false })),
    });
    expect(
      at(scan(answer(members([person(ana, "Ana"), person(gus, "Gus")])), context("listMembers", fay)), "world"),
    ).toEqual(["$.members[1].person"]);
    const withAvatar = { ...person(ben, "Ben"), avatar_version: "v_avatar_ben" };
    expect(at(scan(answer(members([withAvatar])), context("listMembers", fay)), "world")).toEqual([
      "$.members[0].person.avatar_version",
    ]);
    const faysAvatar = { ...person(fay, "Fay"), avatar_version: "v_avatar_fay" };
    expect(
      at(scan(answer(comments(faysAvatar, "Lovely light")), context("listComments", cleo, { now: OPEN })), "world"),
    ).toEqual(["$.items[0].author.avatar_version"]);
  });

  it("catches counts the viewer may not see: an allowance past their own drops and reservations, and a wrong place in the day (T15)", () => {
    expect(at(scan(answer(ownDay(allowance(3, 2, 2, 1))), context("getOwnDay", cleo)), "world")).toEqual([
      "$.allowance.added",
      "$.allowance.external_added",
      "$.allowance.reserved",
      "$.allowance.external_reserved",
    ]);
    const removed = { drop_id: "drp_cleo", state: "withdrawn", allowance: allowance(2, 1, 0, 0) };
    expect(at(scan(answer(removed), context("removeDrop", cleo)), "world")).toEqual(["$.allowance.added"]);
    const lateFalse = { ...upcomingDay([], eve), viewer: { is_star: false, joined_later: false } };
    expect(at(scan(answer(lateFalse), context("getOccurrence", eve)), "world")).toEqual(["$.viewer.joined_later"]);
    const notStar = { ...upcomingDay([], ana), viewer: { is_star: false, joined_later: false } };
    expect(at(scan(answer(notStar), context("getOccurrence", ana)), "world")).toEqual(["$.viewer.is_star"]);
  });

  it("catches a day link to a day that hasn't closed, and a cover that isn't a photo", () => {
    const open = waitingHome("2026-11-07T09:00:00Z", [{ occurrence: { ...saturday, phase: "open" } }]);
    expect(at(scan(answer(open), context("getHome", cleo, { now: OPEN })), "world")).toEqual(["$.recent_days[0]"]);
    const video = waitingHome("2026-11-08T02:00:00Z", [{ occurrence: pastSaturday, cover_drop_id: "drp_cleo" }]);
    expect(at(scan(answer(video), context("getHome", cleo, { now: AFTER_CLOSE })), "world")).toEqual([
      "$.recent_days[0].cover_drop_id",
    ]);
  });

  it("catches a day or a club outside the viewer's clubs by its bare id: a reservation's day, a block's and a leaving's clubs (T14)", () => {
    const reservation = {
      id: "rsv_new",
      occurrence_id: "occ_far",
      media_class: "photo",
      expires_at: "2026-11-07T06:59:59Z",
      allowance: allowance(0, 0, 0, 0),
    };
    expect(at(scan(answer(reservation, 201), context("createReservation", cleo)), "world")).toEqual([
      "$.occurrence_id",
    ]);
    const blocked = { block_id: "blk_1", left_club_ids: ["clb_sat", "clb_far"], past_contributions: "keep" };
    expect(at(scan(answer(blocked, 201), context("blockMember", cleo)), "world")).toEqual(["$.left_club_ids[1]"]);
    const left = { club_id: "clb_nowhere", left_at: "2026-11-07T06:59:59Z", contributions: "keep" };
    expect(at(scan(answer(left), context("leaveClub", cleo)), "world")).toEqual(["$.club_id"]);
  });

  it("catches an id the viewer may not see anywhere else, and a cursor that is a readable key or hides one (T14; the contract's Cursor)", () => {
    expect(
      at(scan(answer({ id: "rsv_ana", state: "released" }), context("releaseReservation", cleo)), "values"),
    ).toEqual(["$.id"]);
    const page = (cursor: string) => scan(answer({ items: [], next_cursor: cursor }), context("listMyDrops", cleo));
    expect(at(page("drp_secret"), "values")).toEqual(["$.next_cursor"]);
    expect(at(page(Buffer.from("occ_sat|2026-11-07T07:00:00Z").toString("base64url")), "values")).toEqual([
      "$.next_cursor",
    ]);
    const hidden = Buffer.concat([Buffer.from([0xff, 0x00, 0x9c]), Buffer.from("drp_secret")]).toString("base64url");
    expect(at(page(hidden), "values")).toEqual(["$.next_cursor (decoded)"]);
    expect(at(page("abcdf"), "shape")).toEqual(["$.next_cursor"]);
  });

  it("catches a reason phrase that isn't the status's, a transport header out of its form, a wrong length and a type on an empty answer", () => {
    const body = upcomingDay([bensCard()]);
    const shape = (sent: Answer, id = "getOccurrence") =>
      scan(sent, context(id, cleo)).map((finding) => `${finding.check} ${finding.at}`);
    expect(shape({ ...answer(body), reason: "Found It" })).toEqual(["shape reason"]);
    expect(shape(answer(body, 200, { "content-length": "3" }))).toEqual(["shape header content-length"]);
    expect(shape(answer(body, 200, { connection: "upgrade" }))).toEqual(["shape header connection"]);
    expect(shape(answer(body, 200, { "keep-alive": "timeout=5, drop=drp_ben" }))).toEqual(["shape header keep-alive"]);
    expect(shape(bare(204, { "content-type": "text/plain" }), "removeFavourite")).toEqual([
      "shape header content-type",
    ]);
  });

  it("catches a planted extra field in an answer the app sends (the HTTP path)", async () => {
    const app = Fastify();
    app.get("/v1/occurrences/:occurrence_id", (_request, reply) =>
      reply
        .header("cache-control", "private, no-store")
        .send({ ...upcomingDay([bensCard()]), media_url: "https://store.example/o" }),
    );
    const sent = await answerOf(app, { method: "GET", url: "/v1/occurrences/occ_sat", headers: {} });
    await app.close();
    const found = scan(sent, context("getOccurrence", cleo));
    expect(checks(found)).toEqual(["keys", "shape", "values"]);
    expect(found.find((finding) => finding.check === "shape")?.at).toBe("$.media_url");
  });
});
