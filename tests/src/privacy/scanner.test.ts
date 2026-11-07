/// <reference lib="esnext.temporal" />
// The leak scanner's own tests (TECH-DESIGN section 8; T10, T12, T16; Q07): clean answers pass, and
// each planted leak is caught by the check meant to catch it, so a check removed or loosened fails
// here. No database: the world is written out below, as the matrix reads it from its rows.

import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { answerOf } from "./harness.ts";
import { contractOperations, readDocument } from "./operations.ts";
import { scan, type Answer, type Check, type ScanContext, type WorldFacts } from "./scanner.ts";

const document = readDocument();
const operations = new Map(contractOperations(document).map((operation) => [operation.id, operation]));

function operation(id: string) {
  const found = operations.get(id);
  if (!found) throw new Error(id);
  return found;
}

const REVEAL = Temporal.Instant.from("2026-11-07T07:00:00Z");
const COLLECTING = REVEAL.subtract({ microseconds: 1 });

const ana = "itv_ana";
const ben = "itv_ben";
const cleo = "itv_cleo";
const eve = "itv_eve";
const world: WorldFacts = {
  drops: new Map([
    ["drp_ben", { author: ben, day: "occ_sat", caption: "From Ben", audience: new Set([ana, ben, cleo]) }],
    [
      "drp_cleo",
      { author: cleo, day: "occ_sat", caption: "See https://example.org/x", audience: new Set([ana, ben, cleo]) },
    ],
    ["drp_old", { author: ben, day: "occ_old", caption: null, audience: new Set([ana, ben, cleo]) }],
  ]),
  days: new Map([
    ["occ_sat", REVEAL],
    ["occ_old", Temporal.Instant.from("2026-10-31T07:00:00Z")],
    ["occ_next", Temporal.Instant.from("2026-11-14T07:00:00Z")],
  ]),
  names: new Map([
    [ana, "Ana"],
    [ben, "Ben"],
    [cleo, "Cleo"],
  ]),
  texts: new Set(["From Ben", "See https://example.org/x", "Ana", "Ben", "Cleo", "Saturday People"]),
  canaries: new Set([
    "https://www.tiktok.com/@ana/video/7312345678901234567",
    "7312345678901234567",
    "uploads/raw_q1w2e3",
    "v_q1w2e3",
  ]),
};

function context(id: string, viewer: string, overrides: Partial<ScanContext> = {}): ScanContext {
  return {
    document,
    operation: operation(id),
    skeleton: false,
    viewer: new Set([viewer]),
    world,
    now: COLLECTING,
    ...overrides,
  };
}

const person = (interval: string, name: string) => ({ membership_id: interval, display_name: name });
const club = { id: "clb_sat", name: "Saturday People", timezone: "Europe/London", my_membership_id: cleo };
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

function upcomingDay(drops: unknown[], viewer = cleo) {
  return {
    stage: "upcoming",
    server_now: "2026-11-07T06:59:59Z",
    occurrence: saturday,
    club: { ...club, my_membership_id: viewer },
    viewer: { is_star: false, joined_later: false },
    drops,
  };
}

const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" };

function answer(body: unknown, status = 200, headers: Record<string, string> = {}): Answer {
  return { status, headers: { ...HEADERS, ...headers }, body: JSON.stringify(body) };
}

function checks(found: { check: Check }[]): Check[] {
  return [...new Set(found.map((finding) => finding.check))].sort();
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

  it("passes an opened day whose next day and add target haven't opened", () => {
    const body = {
      mode: "day",
      server_now: "2026-10-31T09:00:00Z",
      club,
      club_today: "2026-10-31",
      day: {
        stage: "revealed",
        server_now: "2026-10-31T09:00:00Z",
        occurrence: { ...lastSaturday, phase: "open" },
        club,
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

  it("passes the neutral not-found, and the skeleton's on an operation that declares no 404", () => {
    const neutral = answer({ code: "NOT_FOUND" }, 404);
    expect(scan(neutral, context("getOccurrence", cleo))).toEqual([]);
    expect(scan(neutral, context("getMe", cleo, { skeleton: true }))).toEqual([]);
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
      ["club", { club: { ...club, poster: "x" } }],
    ] as const) {
      const found = scan(answer({ ...upcomingDay([bensCard()]), ...plant }), context("getOccurrence", cleo));
      expect(
        found.filter((finding) => finding.check === "keys").map((finding) => finding.at),
        where,
      ).toHaveLength(1);
    }
  });

  it("catches a third media class with the whitelist's own pin", () => {
    const found = scan(
      answer(upcomingDay([{ ...bensCard(), media_class: "photo_portrait" }])),
      context("getOccurrence", cleo),
    );
    expect(found.filter((finding) => finding.check === "whitelist").map((finding) => finding.at)).toEqual([
      "$.drops[0].media_class",
    ]);
  });

  it("catches a key planted in the card's author, and a card that lacks one (T10, FQ74)", () => {
    const planted = { ...bensCard(), author: { ...person(ben, "Ben"), email: "ben@example.org" } };
    expect(checks(scan(answer(upcomingDay([planted])), context("getOccurrence", cleo)))).toContain("whitelist");
    const lacking = Object.fromEntries(Object.entries(bensCard()).filter(([key]) => key !== "media_class"));
    expect(checks(scan(answer(upcomingDay([lacking])), context("getOccurrence", cleo)))).toContain("whitelist");
  });

  it("catches a revealed card before its day opens (T10)", () => {
    const card = {
      view: "revealed",
      id: "drp_ben",
      author: person(ben, "Ben"),
      media_class: "photo",
      highlight: false,
      reactions: [],
      viewer_favourite: false,
    };
    const body = { server_now: "2026-11-07T06:59:59Z", occurrence: saturday, club, drop: card };
    // The key check also finds its highlight flag, since nothing about it has opened.
    expect(checks(scan(answer(body), context("getDrop", cleo)))).toEqual(["keys", "world"]);
  });

  it("catches a revealed day, its highlight entry and a day link to it, before the day opens", () => {
    const revealedDay = {
      stage: "revealed",
      server_now: "2026-11-07T06:59:59Z",
      occurrence: saturday,
      club,
      viewer: { is_star: false, joined_later: false },
      drops: [],
      highlights: [{ drop_id: "drp_ben", author: person(ben, "Ben"), star_pick: true }],
    };
    const day = scan(answer(revealedDay), context("getOccurrence", cleo));
    expect(day.filter((finding) => finding.check === "world").map((finding) => finding.at)).toEqual([
      "$",
      "$.highlights[0]",
    ]);
    // An empty rail is still a rail before the reveal (T10, FQ21): the key check finds it too.
    expect(checks(scan(answer({ ...revealedDay, highlights: [] }), context("getOccurrence", cleo)))).toEqual([
      "keys",
      "world",
    ]);

    const waiting = (recent: unknown[]) => ({
      mode: "waiting",
      server_now: "2026-11-07T06:59:59Z",
      club,
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

  it("judges an own card by the world's author, never by the card's own author field (TECH-DESIGN section 8)", () => {
    const cleosAsBens = { ...bensOwnCard(), id: "drp_cleo" };
    expect(checks(scan(answer(upcomingDay([cleosAsBens], ben)), context("getOccurrence", ben)))).toContain("world");
    const unknown = { ...bensOwnCard(), id: "drp_nobody" };
    expect(checks(scan(answer(upcomingDay([unknown], ben)), context("getOccurrence", ben)))).toContain("world");
    // And another's own card keeps no exception from the key check.
    expect(checks(scan(answer(upcomingDay([bensOwnCard()])), context("getOccurrence", cleo)))).toEqual([
      "keys",
      "world",
    ]);
  });

  it("catches a caption card for a viewer outside the drop's audience (T8, T9)", () => {
    const found = scan(answer(upcomingDay([bensCard()], eve)), context("getOccurrence", eve));
    expect(checks(found)).toEqual(["world"]);
  });

  it("catches a caption swapped from another drop, a wrong name and a wrong author", () => {
    for (const card of [
      { ...bensCard(), caption: "See https://example.org/x" },
      { ...bensCard(), author: person(ben, "Cleo") },
      { ...bensCard(), author: person(cleo, "Cleo") },
    ]) {
      expect(checks(scan(answer(upcomingDay([card])), context("getOccurrence", cleo))), JSON.stringify(card)).toEqual([
        "world",
      ]);
    }
  });

  it("catches text people wrote that the world didn't store: a storage path, a link, a made-up caption", () => {
    for (const caption of ["uploads/raw_q1w2e3", "https://www.tiktok.com/@ben/video/1", "From Ben "]) {
      const found = scan(answer(upcomingDay([{ ...bensCard(), caption }])), context("getOccurrence", cleo));
      expect(checks(found), caption).toContain("values");
    }
  });

  it("catches a value the world keeps back, wherever it is (Q07)", () => {
    const found = scan(
      answer({ ...upcomingDay([bensCard()]), next_cursor: "7312345678901234567" }),
      context("getOccurrence", cleo),
    );
    expect(found.filter((finding) => finding.check === "values").map((finding) => finding.at)).toEqual([
      "$.next_cursor",
    ]);
    // In a header too: one every answer may carry, so only the values check can see it.
    const inHeader = scan(answer(upcomingDay([bensCard()]), 200, { date: "v_q1w2e3" }), context("getOccurrence", cleo));
    expect(inHeader.map((finding) => `${finding.check} ${finding.at}`)).toEqual(["values header date"]);
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

  it("catches an image body, and an answer without private, no-store", () => {
    const image: Answer = {
      status: 200,
      headers: { "content-type": "image/jpeg", "cache-control": "private, no-store" },
      body: "ÿØÿ",
    };
    const found = scan(image, context("getDropMedia", cleo));
    expect(checks(found)).toEqual(["shape"]);
    expect(found.map((finding) => finding.at)).toEqual(expect.arrayContaining(["header content-type", "body"]));
    const cached = scan(
      answer(upcomingDay([bensCard()]), 200, { "cache-control": "public, max-age=60" }),
      context("getOccurrence", cleo),
    );
    expect(checks(cached)).toEqual(["shape"]);
    expect(cached.map((finding) => finding.at)).toEqual(["header cache-control"]);
  });

  it("catches a status or code the operation doesn't declare, and a not-found that isn't neutral", () => {
    expect(checks(scan(answer({ code: "NOT_FOUND" }, 404), context("getMe", cleo)))).toEqual(["shape"]);
    expect(checks(scan(answer({ code: "CLUB_FULL" }, 409), context("getOccurrence", cleo)))).toEqual(["shape"]);
    const notNeutral = answer({ code: "NOT_FOUND", field: "x" }, 404);
    expect(checks(scan(notNeutral, context("getMe", cleo, { skeleton: true })))).toEqual(["shape"]);
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
