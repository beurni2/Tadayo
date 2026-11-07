/// <reference lib="esnext.temporal" />
// The leak scanner's own tests (TECH-DESIGN section 8; T10, T12, T14, T16; Q07): clean answers
// pass, and each planted leak is caught by the check meant to catch it, so a check removed or
// loosened fails here. No database: the world is written out below, as the matrix reads it from its
// rows.

import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { answerOf } from "./harness.ts";
import { contractOperations, readDocument } from "./operations.ts";
import { scan, type Answer, type Check, type ScanContext, type WorldDrop, type WorldFacts } from "./scanner.ts";

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

// Ana's club: Ana, Ben and Cleo, and Eve, who joined after the drops were committed. Stan is in
// another club, with a day and a drop of his own.
const ana = "itv_ana";
const ben = "itv_ben";
const cleo = "itv_cleo";
const eve = "itv_eve";
const stan = "itv_stan";

function drop(author: string, day: string, caption: string | null, audience: string[], comments: string[] = []) {
  return { author, day, caption, audience: new Set(audience), comments } satisfies WorldDrop;
}

const world: WorldFacts = {
  drops: new Map([
    ["drp_ben", drop(ben, "occ_sat", "From Ben", [ana, ben, cleo])],
    ["drp_cleo", drop(cleo, "occ_sat", "See https://example.org/x", [ana, ben, cleo])],
    ["drp_secret", drop(ana, "occ_sat", "Only for Ben", [ana, ben])],
    ["drp_old", drop(ben, "occ_old", null, [ana, ben, cleo], ["Lovely light"])],
    ["drp_stan", drop(stan, "occ_far", "Far away", [stan])],
  ]),
  days: new Map([
    ["occ_sat", { club: "clb_sat", revealAt: REVEAL }],
    ["occ_old", { club: "clb_sat", revealAt: Temporal.Instant.from("2026-10-31T07:00:00Z") }],
    ["occ_next", { club: "clb_sat", revealAt: Temporal.Instant.from("2026-11-14T07:00:00Z") }],
    ["occ_far", { club: "clb_far", revealAt: REVEAL }],
  ]),
  members: new Map([
    [ana, { club: "clb_sat", name: "Ana" }],
    [ben, { club: "clb_sat", name: "Ben" }],
    [cleo, { club: "clb_sat", name: "Cleo" }],
    [eve, { club: "clb_sat", name: "Eve" }],
    [stan, { club: "clb_far", name: "Stan" }],
  ]),
  clubs: new Map([
    ["clb_sat", { name: "Saturday People", labels: new Set(["Mo"]) }],
    ["clb_far", { name: "Far Club", labels: new Set<string>() }],
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

function upcomingDay(drops: unknown[], viewer = cleo) {
  return {
    stage: "upcoming",
    server_now: "2026-11-07T06:59:59Z",
    occurrence: saturday,
    club: club(viewer),
    viewer: { is_star: false, joined_later: false },
    drops,
  };
}

function revealedDay(drops: unknown[], highlights: unknown[], viewer = cleo) {
  return {
    stage: "revealed",
    server_now: "2026-11-07T09:00:00Z",
    occurrence: { ...saturday, phase: "open" },
    club: club(viewer),
    viewer: { is_star: false, joined_later: false },
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

const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" };

function answer(body: unknown, status = 200, headers: Record<string, string> = {}): Answer {
  return { status, headers: { ...HEADERS, ...headers }, body: JSON.stringify(body) };
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
    expect(scan({ status: 204, headers: {}, body: "" }, context("removeFavourite", cleo))).toEqual([]);
    const limited = answer({ code: "RATE_LIMITED", retry_after_seconds: 30 }, 429, { "retry-after": "30" });
    expect(scan(limited, context("getOccurrence", cleo))).toEqual([]);
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
    expect(at(scan(answer(waiting), context("getHome", eve, { now: OPEN })), "world")).toEqual([
      "$.recent_days[0].cover_drop_id",
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
    expect(at(scan(answer(stranger), context("getOccurrence", cleo)), "world")).toEqual([
      "$.occurrence.star",
      "$.occurrence.star",
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
    // In a header too: one every answer may carry, so only the values check can see it.
    const inHeader = scan(answer(upcomingDay([bensCard()]), 200, { date: "v_q1w2e3" }), context("getOccurrence", cleo));
    expect(inHeader.map((finding) => `${finding.check} ${finding.at}`)).toEqual(["values header date"]);
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
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(upcomingDay([])),
      },
    ]) {
      const cachedFound = scan(cached, context("getOccurrence", cleo));
      expect(cachedFound.map((finding) => `${finding.check} ${finding.at}`)).toEqual(["shape header cache-control"]);
    }
    const bare = scan(
      { status: 204, headers: { "cache-control": "max-age=60" }, body: "" },
      context("removeFavourite", cleo),
    );
    expect(bare.map((finding) => `${finding.check} ${finding.at}`)).toEqual(["shape header cache-control"]);
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
