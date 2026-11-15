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
  type Viewer,
  type WorldAccount,
  type WorldDay,
  type WorldDrop,
  type WorldFacts,
  type WorldInvitation,
  type WorldReservation,
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
// after them; and Gus and Hal, who joined after Fay left. Stan is in another club, with a day and a drop
// of Stan's own. Each has an account (`acct_ana`, and so on), and so have Dan, who is in no club and
// hasn't finished their profile, and Mo, who accepted an invitation to Ana's club and waits on the roster.
const ana = "itv_ana";
const ben = "itv_ben";
const cleo = "itv_cleo";
const eve = "itv_eve";
const fay = "itv_fay";
const gus = "itv_gus";
const hal = "itv_hal";
const stan = "itv_stan";

const instant = (text: string) => Temporal.Instant.from(text);

function drop(
  author: string,
  day: string,
  media: MediaClass,
  caption: string | null,
  audience: string[],
  comments: string[] = [],
): WorldDrop {
  return { author, day, media, state: "active", endedAt: null, caption, audience: new Set(audience), comments };
}

function member(club: string, name: string, joined: string, left: string | null = null) {
  return {
    club,
    account: `acct_${name.toLowerCase()}`,
    name,
    joinedAt: instant(joined),
    leftAt: left === null ? null : instant(left),
  };
}

function reservation(
  interval: string,
  state: WorldReservation["state"],
  expiresAt: Temporal.Instant,
): WorldReservation {
  return { interval, day: "occ_sat", media: "photo", state, expiresAt };
}

function day(club: string, star: string, reveal: string, close: string, collecting: string): WorldDay {
  return {
    club,
    star,
    localDate: reveal.slice(0, 10),
    revealAt: instant(reveal),
    closeAt: instant(close),
    collectingFrom: instant(collecting),
    status: "scheduled",
  };
}

/** The account of the person named `who`: `acct_cleo` for Cleo's interval `itv_cleo`. */
const acct = (who: string) => `acct_${who.replace(/^itv_/, "")}`;

function accountOf(name: string | null, version: number, over: Partial<WorldAccount> = {}): WorldAccount {
  return { state: "active", deletionRequestedAt: null, name, avatar: null, ageConfirmed: true, version, ...over };
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
    // Fay's own, on the day before Fay left; Fay's interval has ended, so it is in no audience of Fay's.
    ["drp_fay", drop(fay, "occ_old", "photo", "From Fay", [ana, ben, cleo], ["Nice one"])],
    ["drp_stan", drop(stan, "occ_far", "photo", "Far away", [stan])],
    // Cleo's photo, withdrawn while collecting: its slot is released (spec 11).
    [
      "drp_cleo_gone",
      {
        ...drop(cleo, "occ_sat", "photo", null, [ana, ben, cleo]),
        state: "withdrawn",
        endedAt: instant("2026-11-05T12:00:00Z"),
      },
    ],
    // Cleo's photo on last week's day, withdrawn after it opened: its slot stays taken (spec 11).
    [
      "drp_cleo_late",
      {
        ...drop(cleo, "occ_old", "photo", null, [ana, ben, cleo]),
        state: "withdrawn",
        endedAt: instant("2026-10-31T09:00:00Z"),
      },
    ],
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
    [hal, member("clb_sat", "Hal", "2026-11-06T23:00:00Z")],
    [stan, member("clb_far", "Stan", "2026-10-01T10:00:00Z")],
  ]),
  clubs: new Map([
    // Mo, a label from a revision long ago; and Gus's own name, the label of the revision that
    // brought Gus in, made after Fay left (FQ66: a joiner's label is their profile name).
    [
      "clb_sat",
      {
        name: "Saturday People",
        suspendedAt: null,
        labels: new Map([
          ["Mo", instant("2026-10-01T09:00:00Z")],
          ["Gus", instant("2026-11-06T21:30:00Z")],
        ]),
      },
    ],
    ["clb_far", { name: "Far Club", suspendedAt: null, labels: new Map<string, Temporal.Instant>() }],
  ]),
  // Cleo's live slot, one Cleo's photo used, and one past its expiry not yet marked; Ana's live slot.
  reservations: new Map([
    ["rsv_cleo", reservation(cleo, "live", REVEAL)],
    ["rsv_cleo_used", reservation(cleo, "consumed", REVEAL)],
    ["rsv_cleo_lapsed", reservation(cleo, "live", instant("2026-11-07T06:00:00Z"))],
    ["rsv_ana", reservation(ana, "live", REVEAL)],
  ]),
  canaries: new Map([
    ["https://www.tiktok.com/@cleo/video/7312345678901234567", ["drp_cleo"]],
    ["7312345678901234567", ["drp_cleo"]],
    ["v_q1w2e3", ["drp_ben"]],
    ["v_old", ["drp_old"]],
    ["uploads/raw_q1w2e3", []],
    ["v_pending", []],
  ]),
  // Each person's account, Dan's with no name yet and Mo's; Cleo's has an avatar.
  accounts: new Map([
    [acct(ana), accountOf("Ana", 1)],
    [acct(ben), accountOf("Ben", 3)],
    [acct(cleo), accountOf("Cleo", 4, { avatar: "v_avatar_cleo" })],
    [acct(eve), accountOf("Eve", 1)],
    [acct(fay), accountOf("Fay", 2)],
    [acct(gus), accountOf("Gus", 1)],
    [acct(hal), accountOf("Hal", 1)],
    [acct(stan), accountOf("Stan", 1)],
    ["acct_dan", accountOf(null, 0, { ageConfirmed: false })],
    ["acct_mo", accountOf("Mo", 1)],
  ]),
  // Mo's, from Ana, which waits on the roster; one Fay accepted, from Hal, who joined after Fay left; and Eve's.
  invitations: new Map<string, WorldInvitation>([
    ["inv_mo", { boundTo: "acct_mo", club: "clb_sat", joined: false, clubName: "Saturday People", inviterName: "Ana" }],
    [
      "inv_fay",
      { boundTo: acct(fay), club: "clb_sat", joined: false, clubName: "Saturday People", inviterName: "Hal" },
    ],
    // Eve's, which Eve used to join: a membership now.
    ["inv_eve", { boundTo: acct(eve), club: "clb_sat", joined: true, clubName: "Saturday People", inviterName: "Ana" }],
  ]),
};

/** A caller with a session whose account is `account` and who holds no interval. */
const alone = (account: string, texts: string[] = []): Viewer => ({
  account,
  intervals: new Set(),
  texts: new Set(texts),
});

function context(id: string, viewer: string, overrides: Partial<ScanContext> = {}): ScanContext {
  return {
    document,
    operation: operation(id),
    skeleton: false,
    viewer: { account: acct(viewer), intervals: new Set([viewer]), texts: new Set() },
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

/** A revealed day's card carries its section: Ana's own drops are the star's, everyone else's friends' (T35). */
const inSaturday = (drop: unknown) => {
  const card = drop as { author: { membership_id: string } };
  return { ...card, section: card.author.membership_id === ana ? "star" : "friends" };
};

function revealedDay(drops: unknown[], highlights: unknown[], viewer = cleo) {
  return {
    stage: "revealed",
    server_now: "2026-11-07T09:00:00Z",
    occurrence: { ...saturday, phase: "open" },
    club: club(viewer),
    viewer: placeIn(viewer),
    drops: drops.map(inSaturday),
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
/** An allowance by role (T17): Cleo, a friend in Ana's Saturday, has three drops, two photos and one link. */
const allowance = (
  added: number,
  external: number,
  reserved: number,
  externalReserved: number,
  role: "star" | "friend" = "friend",
) => ({
  added,
  reserved,
  limit: role === "star" ? 6 : 3,
  photo_added: added - external,
  photo_reserved: reserved - externalReserved,
  photo_limit: role === "star" ? 6 : 2,
  external_added: external,
  external_reserved: externalReserved,
  external_limit: role === "star" ? 2 : 1,
  is_star: role === "star",
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
            section: "friends",
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
      date: new Date().toUTCString(),
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
    // Eve can read nothing in that day either, so the link itself is no link of Eve's (T15).
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
    // Every finding pinned with its check and its words, so each check must be the one that fails, not
    // another that happens to name the same path.
    const judged = (at: string, what: string) => ({ check: "world", at, what });
    const unread = (at: string) => ({ check: "values", at, what: "text people wrote that isn't the viewer's to read" });
    const ofAnotherClub = "a person of a club the viewer has no interval in (T14)";
    expect(scan(answer(upcomingDay([bensCard()], stan)), context("getOccurrence", stan))).toEqual([
      judged("$.occurrence", "a day of a club the viewer has no interval in (T14)"),
      judged("$.occurrence.star", ofAnotherClub),
      judged("$.club", "a club the viewer has no interval in (T14)"),
      judged("$.club.my_membership_id", "not the viewer's own interval in this club"),
      judged("$.drops[0]", "a drop whose audience holds no active interval of the viewer (T8, T9)"),
      judged("$.drops[0].author", ofAnotherClub),
      unread("$.occurrence.star.display_name"),
      unread("$.club.name"),
      unread("$.drops[0].author.display_name"),
      unread("$.drops[0].caption"),
    ]);
    // A person of another club inside the viewer's own day.
    const stranger = { ...upcomingDay([]), occurrence: { ...saturday, star: person(stan, "Stan") } };
    expect(scan(answer(stranger), context("getOccurrence", cleo))).toEqual([
      judged("$.occurrence.star", "not the day's star"),
      judged("$.occurrence.star", ofAnotherClub),
      unread("$.occurrence.star.display_name"),
    ]);
  });

  it("catches a caption holding its own drop's hidden link and post id before the reveal (T13, Q07)", () => {
    // T13 refuses such a caption when it is written; a read still serves the world's caption as
    // stored, so the scanner holds it to its own drop's kept-back values.
    const own = "Mine https://www.tiktok.com/@cleo/video/7312345678901234567";
    const drops = new Map(world.drops).set("drp_cleo", drop(cleo, "occ_sat", "external_video", own, [ana, ben, cleo]));
    const found = scan(
      answer(upcomingDay([{ ...cleosCard(), caption: own }], ben)),
      context("getOccurrence", ben, { world: { ...world, drops } }),
    );
    const held = {
      check: "values",
      at: "$.drops[0].caption",
      what: "a caption holding its own drop's kept-back value (T13, Q07)",
    };
    expect(found).toEqual([held, held]);
  });

  it("catches text people wrote that the viewer may not read inside another value: an error's field", () => {
    const found = scan(answer({ code: "INVALID_REQUEST", field: "Only for Ben" }, 400), context("getOccurrence", cleo));
    expect(found).toEqual([
      { check: "values", at: "$.field", what: "text people wrote that the viewer may not read, inside another value" },
    ]);
    const parameter = answer({ code: "INVALID_REQUEST", field: "occurrence_id" }, 400);
    expect(scan(parameter, context("getOccurrence", cleo))).toEqual([]);
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
    const marks = (id: string) =>
      scan(answer(upcomingDay([{ ...bensCard(), id }])), context("getOccurrence", cleo))
        .filter((finding) => finding.check === "values")
        .map((finding) => finding.what.split(":")[0]);
    // A storage path, a provider host, `www.` or `data:`, with no scheme and none of them the world's;
    // each mark in capitals; a scheme of one letter, or with a digit; and `www.`, `data:` or a storage
    // path after a byte that isn't a letter or digit, not at the start (NEVER_VALUE, which values and
    // headers use). Right after a letter or digit, those three pass, as do a host's dot as another
    // byte and a scheme with no letter in it (`3://x`).
    for (const id of [
      "uploads/k9",
      "renditions/k9",
      "tiktok.com/p",
      "instagram.com/p",
      "www.x.co",
      "data:x",
      "HTTPS://X/K",
      "UPLOADS/K9",
      "RENDITIONS/K9",
      "TIKTOK.COM/P",
      "INSTAGRAM.COM/P",
      "WWW.X.CO",
      "DATA:X",
      "a://x/k",
      "s3://b/k",
      "x/uploads/k9",
      "x/renditions/k9",
      "x/www.x.co",
      "x/data:x",
    ])
      expect(marks(id), id).toEqual(["a URL, storage path or provider host"]);
    for (const id of ["kuploads/k9", "7renditions/k9", "kwww.x.co", "kdata:x", "tiktokxcom", "3://x"])
      expect(marks(id), id).toEqual([]);
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
    // Gus, who joined after Fay left, is no one Fay may know: Gus's id outside a person, and Gus's
    // name in text people wrote outside one (an invitation that isn't Fay's: the one Fay accepted names
    // its inviter to Fay, below), though it is also the roster label of the revision that brought Gus
    // in, made after Fay left. Mo's label, from a revision made while Fay was there, Fay may read. In
    // any other string, a name shorter than SHORTEST_TEXT passes (Reader.hidden).
    const page = scan(answer({ items: [], next_cursor: gus }), context("listMyDrops", fay));
    expect(at(page, "values")).toEqual(["$.next_cursor"]);
    const invitation = {
      invitation_id: "inv_mo",
      club_name: "Saturday People",
      inviter_name: "Gus",
      state: "waiting",
    };
    const invited = { server_now: "2026-11-07T06:59:59Z", clubs: [], invitations: [invitation] };
    expect(at(scan(answer(invited), context("listClubs", fay)), "values")).toEqual(["$.invitations[0].inviter_name"]);
    const fromMo = { ...invited, invitations: [{ ...invitation, inviter_name: "Mo" }] };
    expect(at(scan(answer(fromMo), context("listClubs", fay)), "values")).toEqual([]);
  });

  it("catches counts the viewer may not see: an allowance past their own drops and reservations, and a wrong place in the day (T15)", () => {
    // Cleo's one live drop in Saturday is a video link and Cleo's one live slot a photo's, so a photo added
    // or a second slot is someone else's or a hidden one (T15).
    expect(at(scan(answer(ownDay(allowance(3, 2, 2, 1))), context("getOwnDay", cleo)), "world")).toEqual([
      "$.allowance.added",
      "$.allowance.photo_added",
      "$.allowance.external_added",
      "$.allowance.reserved",
      "$.allowance.external_reserved",
    ]);
    // Cleo's withdrawn photo has released its slot, and Cleo's used and lapsed slots hold none, so
    // each count over Cleo's one live drop and one live slot is someone else's or a hidden one.
    expect(at(scan(answer(ownDay(allowance(2, 1, 2, 0))), context("getOwnDay", cleo)), "world")).toEqual([
      "$.allowance.added",
      "$.allowance.photo_added",
      "$.allowance.reserved",
      "$.allowance.photo_reserved",
    ]);
    // A live slot for a video link isn't a photo's: with Cleo's one live slot a link's, a photo reserved is
    // someone else's or a hidden one (the count Cleo's own photo slots alone give).
    const reservations = new Map(world.reservations).set("rsv_cleo", {
      ...reservation(cleo, "live", REVEAL),
      media: "external_video",
    });
    const videoSlot = context("getOwnDay", cleo, { world: { ...world, reservations } });
    expect(at(scan(answer(ownDay(allowance(1, 1, 1, 0))), videoSlot), "world")).toEqual(["$.allowance.photo_reserved"]);
    const removed = { drop_id: "drp_cleo", state: "withdrawn", allowance: allowance(2, 1, 0, 0) };
    expect(at(scan(answer(removed), context("removeDrop", cleo)), "world")).toEqual([
      "$.allowance.added",
      "$.allowance.photo_added",
    ]);
    // A photo withdrawn after its day opened still holds its slot (spec 11): it counts, one more doesn't.
    const late = (added: number) => ({
      drop_id: "drp_cleo_late",
      state: "withdrawn",
      allowance: allowance(added, 0, 0, 0),
    });
    expect(at(scan(answer(late(1)), context("removeDrop", cleo, { now: AFTER_CLOSE })), "world")).toEqual([]);
    expect(at(scan(answer(late(2)), context("removeDrop", cleo, { now: AFTER_CLOSE })), "world")).toEqual([
      "$.allowance.added",
      "$.allowance.photo_added",
    ]);
    const lateFalse = { ...upcomingDay([], eve), viewer: { is_star: false, joined_later: false } };
    expect(at(scan(answer(lateFalse), context("getOccurrence", eve)), "world")).toEqual(["$.viewer.joined_later"]);
    const notStar = { ...upcomingDay([], ana), viewer: { is_star: false, joined_later: false } };
    expect(at(scan(answer(notStar), context("getOccurrence", ana)), "world")).toEqual(["$.viewer.is_star"]);
  });

  it("catches an allowance that isn't the viewer's own role in the day: the star's limits for a friend, a friend's for the star, or a wrong is_star (T17)", () => {
    // Cleo is a friend in Ana's Saturday: three drops, two photos and one link.
    expect(at(scan(answer(ownDay(allowance(1, 1, 1, 0))), context("getOwnDay", cleo)), "world")).toEqual([]);
    expect(at(scan(answer(ownDay(allowance(1, 1, 1, 0, "star"))), context("getOwnDay", cleo)), "world")).toEqual([
      "$.allowance.is_star",
      "$.allowance",
    ]);
    const friendsLimitsAsStar = { ...allowance(1, 1, 1, 0), is_star: true };
    expect(at(scan(answer(ownDay(friendsLimitsAsStar)), context("getOwnDay", cleo)), "world")).toEqual([
      "$.allowance.is_star",
    ]);
    const starsLimits = { ...allowance(1, 1, 1, 0), limit: 6, photo_limit: 6, external_limit: 2 };
    expect(at(scan(answer(ownDay(starsLimits)), context("getOwnDay", cleo)), "world")).toEqual(["$.allowance"]);
    // The same in a refusal, whose day is its target: PHOTO_LIMIT carries Cleo's own counts only.
    const refusal = (counts: ReturnType<typeof allowance>) =>
      answer({ code: "PHOTO_LIMIT", target: saturday, next_target: nextSaturday, allowance: counts }, 409);
    expect(scan(refusal(allowance(1, 1, 1, 0)), context("createReservation", cleo))).toEqual([]);
    expect(at(scan(refusal(allowance(3, 1, 0, 0)), context("createReservation", cleo)), "world")).toEqual([
      "$.allowance.added",
      "$.allowance.photo_added",
    ]);
    expect(at(scan(refusal(allowance(1, 1, 1, 0, "star")), context("createReservation", cleo)), "world")).toEqual([
      "$.allowance.is_star",
      "$.allowance",
    ]);
    // Ana is Saturday's star: six drops, six photos and two links, and is_star, with Ana's own photo and slot.
    const quota = (counts: ReturnType<typeof allowance>) =>
      answer({ code: "QUOTA_FULL", target: saturday, next_target: nextSaturday, allowance: counts }, 409);
    const asAna = context("createReservation", ana);
    expect(scan(quota(allowance(1, 0, 1, 0, "star")), asAna)).toEqual([]);
    expect(at(scan(quota(allowance(1, 0, 1, 0)), asAna), "world")).toEqual(["$.allowance.is_star", "$.allowance"]);
    expect(at(scan(quota({ ...allowance(1, 0, 1, 0, "star"), is_star: false }), asAna), "world")).toEqual([
      "$.allowance.is_star",
    ]);
    expect(at(scan(quota({ ...allowance(1, 0, 1, 0), is_star: true }), asAna), "world")).toEqual(["$.allowance"]);
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
    const page = (cursor: string, facts = world) =>
      scan(answer({ items: [], next_cursor: cursor }), context("listMyDrops", cleo, { world: facts }));
    expect(at(page("drp_secret"), "values")).toEqual(["$.next_cursor"]);
    const hidden = Buffer.concat([Buffer.from([0xff, 0x00, 0x9c]), Buffer.from("drp_secret")]).toString("base64url");
    expect(at(page(hidden), "values")).toEqual(["$.next_cursor (decoded)"]);
    // A cursor is a random handle or a sealed value: what it decodes to says why it is a readable
    // key instead, whatever bytes stand around it.
    const reasons = (cursor: string, facts = world) =>
      page(cursor, facts)
        .filter((finding) => finding.check === "shape")
        .map((finding) => finding.what.replace(/^a cursor that (.*): a readable key.*$/, "$1"));
    const key = (bytes: Buffer, facts = world) => reasons(bytes.toString("base64url"), facts);
    const noise = Buffer.from("8f1ce2a7b3d9046e5f7a1c3e9b2d4f60", "hex");
    const version = Buffer.from([0x01]);
    expect(key(Buffer.from("occ_sat|2026-11-07T07:00:00Z"))).toEqual([
      "is text from end to end",
      "holds readable text",
      "holds a date",
      "holds an id",
    ]);
    // Its newline is text too.
    expect(key(Buffer.from('{"after":"drp_ben","at":"2026-11-06T20:00:00Z"}\n'))).toEqual([
      "is text from end to end",
      "holds readable text",
      "holds a date",
      "holds an id",
    ]);
    // A binary tuple: a version byte, a commit time in microseconds, then the last card's id.
    const time = Buffer.alloc(8);
    time.writeBigUInt64BE(1_794_000_000_000_000n);
    expect(key(Buffer.concat([version, time, Buffer.from("drp_ben")]))).toEqual(["holds an id"]);
    // An account's id and an invitation's, as any other id of the world is (slice 8).
    expect(key(Buffer.concat([version, time, Buffer.from(acct(ben))]))).toEqual(["holds an id"]);
    expect(key(Buffer.concat([version, time, Buffer.from("inv_mo")]))).toEqual(["holds an id"]);
    expect(key(Buffer.concat([version, Buffer.from("1794000000000"), noise]))).toEqual([
      "holds a long number, such as a time or a count",
    ]);
    expect(key(Buffer.concat([noise, Buffer.from("Cleo"), version]))).toEqual(["holds text people wrote"]);
    // The bounds of these marks, which random bytes would meet if they were lower: a long number is
    // 10 digits, a time in seconds, and a name of three letters (Ben) isn't text people wrote that is
    // looked for, since it would turn up in random bytes.
    expect(key(Buffer.concat([version, Buffer.from("1794000000"), noise]))).toEqual([
      "holds a long number, such as a time or a count",
    ]);
    expect(key(Buffer.concat([version, Buffer.from("179400000"), noise]))).toEqual([]);
    expect(key(Buffer.concat([version, Buffer.from("Ben"), noise]))).toEqual([]);
    // A date among other bytes, with a dash or an underscore between its parts or as 20261106T2000
    // with a T of either case; a date in any other writing passes, as the header says: with no
    // separator and no T after it, with its day or month first, with a slash, a dot or a space
    // between its parts, or with a month or day of one digit.
    for (const date of ["2026-11-06", "2026_11_06", "20261106T2000", "20261106t2000"])
      expect(key(Buffer.concat([version, Buffer.from(date), noise])), date).toEqual(["holds a date"]);
    // Each digit of each form is tried as every value it may take, so that no class of BYTES_DATE
    // can be narrowed by one character, and forms one digit short pass.
    for (const template of ["1111-11-11", "1111_11_11", "11111111T1111", "11111111t1111"])
      for (let position = 0; position < template.length; position += 1) {
        if (template[position] !== "1") continue;
        for (const digit of "0123456789") {
          const date = `${template.slice(0, position)}${digit}${template.slice(position + 1)}`;
          expect(key(Buffer.concat([version, Buffer.from(date), noise])), date).toEqual(["holds a date"]);
        }
      }
    for (const date of [
      "026-11-06",
      "2026-1-06",
      "2026-11-6",
      "1234567T2000",
      "20261106T200",
      "20261106",
      "06-11-2026",
      "11-06-2026",
      "2026/11/06",
      "2026.11.06",
      "2026 11 06",
      "2026-1-6",
    ])
      expect(key(Buffer.concat([version, Buffer.from(date), noise])), date).toEqual([]);
    // A key written in base64url's own letters decodes to bytes that look random, so its own text is
    // read: a date (`2026-11-06` or `2026_11_06`, or `20261106T2000` with a T or a t), a run of 16
    // digits, an id. A count passes, as does a run of 15 digits; so do a date of another century, a
    // month whose first digit isn't 0 or 1, a day whose first digit is past 3, a date with no
    // separator and no T after it (`20201019`), one with its day or month first (`06-11-2026`), and
    // one with a month or day of one digit (`2026-11-6`).
    const own = {
      number: "holds a long number, such as a time, in its own text",
      date: "holds a date in its own text",
      id: "holds an id in its own text",
    };
    for (const [cursor, reason] of [
      ["1793995200000000", own.number],
      ["after_1793995200000000xx", own.number],
      ["2026-11-06T20-00-00Z", own.date],
      ["at_2026-09-30_xx", own.date],
      ["occ_2026_11_06_x", own.date],
      ["2026_11_06T20_00", own.date],
      ["20261106T2000000", own.date],
      ["20261106t2000000", own.date],
      ["20260930T2000xxx", own.date],
      ["at_2020-10-19_xx", own.date],
      ["20201019T1929xxx", own.date],
      ["after_drp_ben_xx", own.id],
      ["after_acct_ben_x", own.id],
      ["after_inv_mo_xxx", own.id],
    ] as const)
      expect(reasons(cursor), cursor).toEqual([reason]);
    // Each digit of a date is tried as every value it may take, so that no class of OWN_DATE can be
    // narrowed without a case failing: a year's last two digits, a month's and a day's, and a time's
    // four; a month's first digit is 0 or 1, and a day's 0 to 3.
    const dashed = (year: string, month: string, day: string) => `at_${year}-${month}-${day}_xx`;
    const compact = (year: string, month: string, day: string, time: string) => `${year}${month}${day}T${time}xxx`;
    const dates: string[] = [];
    for (const digit of "0123456789")
      dates.push(
        dashed(`20${digit}1`, "11", "11"),
        dashed(`202${digit}`, "11", "11"),
        dashed("2021", `1${digit}`, "11"),
        dashed("2021", "11", `1${digit}`),
        compact(`20${digit}1`, "11", "11", "1111"),
        compact(`202${digit}`, "11", "11", "1111"),
        compact("2021", `1${digit}`, "11", "1111"),
        compact("2021", "11", `1${digit}`, "1111"),
        compact("2021", "11", "11", `${digit}111`),
        compact("2021", "11", "11", `1${digit}11`),
        compact("2021", "11", "11", `11${digit}1`),
        compact("2021", "11", "11", `111${digit}`),
      );
    for (const digit of "01") dates.push(dashed("2021", `${digit}1`, "11"), compact("2021", `${digit}1`, "11", "1111"));
    for (const digit of "0123")
      dates.push(dashed("2021", "11", `${digit}1`), compact("2021", "11", `${digit}1`, "1111"));
    for (const cursor of dates) expect(reasons(cursor), cursor).toEqual([own.date]);
    for (const cursor of [
      "hidden_1_of_2_xx",
      "179399520000000x",
      "at_1026-11-06_xx",
      "2126-11-06T20-00",
      "2026-21-06T20-00",
      "2026-11-46T20-00",
      "20261106x2000000",
      "20261106T200xxxx",
      "20262106T2000xxx",
      "20261146T2000xxx",
      "at_20201019_xxxx",
      "202611062000xxxx",
      "06-11-2026_after",
      "11-06-2026_after",
      "2026-11-6_xxxxxx",
      "2026-1-06_xxxxxx",
      "at_2026-1-6_xxxx",
    ])
      expect(reasons(cursor), cursor).toEqual([]);
    // A run of 24 bytes of text is readable; a shorter one beside other bytes, with no other mark,
    // is the pager's row to judge, since random bytes make such runs: 23 random printable bytes
    // after a version byte pass, as a key of 23 bytes there would.
    expect(key(Buffer.concat([version, Buffer.from("after=7;order=desc;n=24!")]))).toEqual(["holds readable text"]);
    expect(key(Buffer.concat([version, Buffer.from("o~40~n~20~d~asc~order~xy"), noise]))).toEqual([
      "holds readable text",
    ]);
    expect(key(Buffer.concat([version, Buffer.from("k@7v#Q2p!x9Lm*4Tz8&Wc5R")]))).toEqual([]);
    // A cursor that is text from end to end is a key however short, whatever joins its parts, or none:
    // random bytes of 12 to 23 make one now and then, which is why the first pager's row is to hold its
    // handles to 24 to 32 bytes (rows.ts). Text that ends before the cursor does is not that.
    const whole = ["is text from end to end"];
    for (const text of [
      "o=40;n=20;de",
      '{"offset":20}',
      "left=3;order=asc;p=2",
      "after=7;order=desc;n=24",
      '["drp", 20, "asc"]',
      "o=40;n=20;desc",
      "page[offset]=20",
      "40|20|desc|0005",
      "o~40;n~20;d~asc",
      "offset 20 dir asc",
      "k@7v#Q2p!x9Lm*",
    ])
      expect(key(Buffer.from(text))).toEqual(whole);
    expect(key(Buffer.concat([Buffer.from("k@7v#Q2p!x9L"), noise]))).toEqual([]);
    // Tab, newline and CR are text too, as JSON and lines of key=value put them between parts.
    expect(key(Buffer.from("o=40\tn=20\tasc"))).toEqual(whole);
    expect(key(Buffer.from('{"o":20,\n"d":1}'))).toEqual(whole);
    const pretty = Buffer.from(JSON.stringify({ offset: 20, order: "desc", count: 24 }, null, 2));
    expect(key(pretty)).toEqual([...whole, "holds readable text"]);
    expect(key(Buffer.from("offset=20\r\norder=desc\r\ncount=24\r\n"))).toEqual([...whole, "holds readable text"]);
    expect(key(Buffer.concat([version, Buffer.from("offset=20\torder=desc\tcount=24"), version]))).toEqual([
      "holds readable text",
    ]);
    // A URL among a cursor's bytes, in any run of text of 12 bytes or more, wherever in the run (to
    // its 23rd byte: a run of 24 is readable text anyway), in either case, its space, tab, newline and
    // CR counted, whatever byte comes before `www.` or `data:`; random bytes make a letter and :// now
    // and then, and those pass, as do a URL in a run of 11 and `www.` or `data:` in a short run. A
    // storage path or a provider host, which random bytes don't make, fails anywhere in a cursor,
    // whatever byte comes before it.
    const encode = (...parts: (Buffer | string)[]) =>
      Buffer.concat(parts.map((part) => Buffer.from(part))).toString("base64url");
    const decoded = (...parts: (Buffer | string)[]) => at(page(encode(...parts)), "values");
    const found = ["$.next_cursor (decoded)"];
    for (const run of [
      "s3://b/k.jpg",
      "a://b/k.jpeg",
      "k7Qz2pLm9xWva://b",
      "k7Qz2pLm9xWvQ7Q7Q7Qa://",
      "k7Qz2pLm9xWvQ7Q7Q7Qwww.",
      " https://x/a",
      "\thttps://x/a",
      "\nhttps://x/a",
      "\rhttps://x/a",
      "www.h.io/p.jpg",
      "kwww.h.io/p.jpg",
      "data:image/png",
      "xdata:image/png",
      "HTTPS://H/P.JPG",
      "WWW.H.IO/P.JPG",
      "DATA:IMAGE/PNG",
      '{"u":"a://b"}',
      "~~~~~~~~a://b",
      "~~~~~~~~~~~~www.",
    ])
      expect(decoded(version, run, noise), JSON.stringify(run)).toEqual(found);
    expect(decoded(version, "k7Qz2pLm9xWv", version, "https://h/p.jpg", noise)).toEqual(found);
    expect(decoded(version, "https://h/p.jpg", version, "k7Qz2pLm9xWv", noise)).toEqual(found);
    for (const path of ["uploads/", "renditions/", "tiktok.com", "instagram.com", "UPLOADS/", "TIKTOK.COM"]) {
      expect(decoded(version, path, noise), path).toEqual(found);
      expect(decoded(version, "Q7", path, noise), path).toEqual(found);
    }
    expect(decoded("uploads/", noise)).toEqual(found);
    const space = Buffer.from([0xff]);
    for (const run of ["https://x/a", "www.k", "data:k", "tiktokxcom"])
      expect(page(encode(version, space, run, noise)), run).toEqual([]);
    expect(page(encode(noise, "a://", noise))).toEqual([]);
    // A key encoded in base64url behind a prefix decodes from the cursor's first character to bytes
    // that look random, unless the prefix is a whole number of groups of 4 characters long, and from
    // character p mod 4 + 1 to its own, where p is the prefix's length in characters: a prefix of 1
    // to 3 characters (`x` gives 2, `v1` gives 3, `abc` gives 4), a handle of 22 (16 bytes: 3), or one
    // of those after whole groups of 4 (`abcdef` gives 3). What a readable key shows there fails: a
    // date, a long number, an id, text people wrote, a storage path or a provider host. An id the
    // viewer may not see, and a value the world keeps back, are found in those bytes as in the first
    // ones.
    const sealed = (text: string) => Buffer.from(text).toString("base64url");
    const secret = "drp_secret|2026-11-07T07:00:00";
    for (const [cursor, from] of [
      [`x${sealed(`${secret}Z`)}`, 2],
      [`v1${sealed(`${secret}Z`)}`, 3],
      [`abc${sealed(secret)}`, 4],
      [`abcdef${sealed(`${secret}Z`)}`, 3],
    ] as const) {
      const where = `decoded from its character ${String(from)}`;
      expect(reasons(cursor), cursor).toEqual([`holds a date, ${where}`, `holds an id, ${where}`]);
      expect(at(page(cursor), "values"), cursor).toEqual([`$.next_cursor (${where})`]);
    }
    const second = "decoded from its character 2";
    expect(reasons(`c${sealed('{"after":"drp_ben","at":"2026-11-06T20:00:00Z"}')}`)).toEqual([
      `holds a date, ${second}`,
      `holds an id, ${second}`,
    ]);
    expect(reasons(`c${sealed("after=drp_ben;n=24x")}`)).toEqual([`holds an id, ${second}`]);
    expect(reasons(`c${sealed("after=1794000000000|n=24x")}`)).toEqual([
      `holds a long number, such as a time or a count, ${second}`,
    ]);
    expect(reasons(`c${sealed("Cleo;n=24;asc;xy")}`)).toEqual([`holds text people wrote, ${second}`]);
    for (const date of ["2026_11_06|n=24|asc", "20261106T2000|n=24|asc"])
      expect(reasons(`c${sealed(date)}`), date).toEqual([`holds a date, ${second}`]);
    const third = "decoded from its character 3";
    expect(reasons(noise.toString("base64url") + sealed("occ_sat|2026-11-07T07:00:00Z"))).toEqual([
      `holds a date, ${third}`,
      `holds an id, ${third}`,
    ]);
    expect(reasons(`c${sealed("k|v_pending|n=24x")}`)).toEqual([]);
    expect(at(page(`c${sealed("k|v_pending|n=24x")}`), "values")).toEqual([`$.next_cursor (${second})`]);
    // A storage path or a provider host behind a prefix, as anywhere else in a cursor.
    for (const path of ["k|uploads/zz_n7p4k2", "k|renditions/zz_n7p4k2", "k|instagram.com/p/x"]) {
      expect(reasons(`c${sealed(path)}`), path).toEqual([]);
      expect(at(page(`c${sealed(path)}`), "values"), path).toEqual([`$.next_cursor (${second})`]);
    }
    // Text with none of those marks passes behind a prefix, as the header says, a URL with a scheme
    // among it: the checks of whole-cursor text and of URLs in runs would fail random handles of 24
    // bytes about once in 370 million, more often than every other check together.
    for (const text of ["offset=20&order=desc&count=24", "https://h.io/k.jpg|n=24", "left=3;order=asc;p=2"])
      expect(page(`c${sealed(text)}`), text).toEqual([]);
    // The whole cursor must be base64url as the server writes it, which a prefix of text before a key's
    // encoding is only at some lengths: `c` before `offset=20&order=desc` passes, `v1` before it is
    // 29 characters, which no bytes encode to, and the cursor is refused as such.
    expect(page(`c${sealed("offset=20&order=desc")}`)).toEqual([]);
    expect(reasons(`v1${sealed("offset=20&order=desc")}`)).toEqual([
      "a cursor that isn't base64url (the contract's Cursor)",
    ]);
    // An id without its type tag, as a key built from a row's id might drop the tag: its 22
    // characters, or the 16 bytes they spell. The matrix's ids are 26 characters, which the short ids
    // of this world (`drp_ben`) aren't, so two drops of Ana's, held back from Cleo, have such ids: one
    // whose 22 characters are base64url as the server writes it, with a `_` and a `-` among them, which
    // the tag's own underscore must not be confused with, and one whose last character isn't (no id the
    // API made, which is looked for by its text only).
    const hiddenId = "drp_Q7yK2_mZ0vN-5cX8bLw3Rg";
    const oddId = "drp_Ng4tW7pLz1QcV9xKe2RbJh";
    const tagless = hiddenId.slice(4);
    const spelled = Buffer.from(tagless, "base64url");
    const heldBack = () => drop(ana, "occ_sat", "photo", null, [ana]);
    const longWorld = {
      ...world,
      drops: new Map(world.drops).set(hiddenId, heldBack()).set(oddId, heldBack()),
    };
    const ownId = "holds an id in its own text";
    // The id as it is, and the same text as a cursor: in its own text, and, since its 22 characters
    // are 16 bytes, in the bytes they decode to, at the one of the four decodings that lines up.
    expect(reasons(hiddenId, longWorld)).toEqual(["holds an id", ownId]);
    expect(at(page(hiddenId, longWorld), "values")).toEqual(["$.next_cursor"]);
    expect(reasons(tagless, longWorld)).toEqual(["holds an id", ownId]);
    expect(reasons(`after_${tagless}`, longWorld)).toEqual([ownId, "holds an id, decoded from its character 3"]);
    expect(reasons(`after_${oddId.slice(4)}`, longWorld)).toEqual([ownId]);
    expect(at(page(tagless, longWorld), "values")).toEqual([]);
    // In a key's bytes: the 22 characters as text among other bytes, and the 16 bytes they spell.
    for (const bytes of [
      Buffer.concat([version, Buffer.from(tagless), noise]),
      Buffer.concat([version, Buffer.from(oddId.slice(4)), noise]),
      Buffer.concat([version, spelled, noise]),
    ])
      expect(key(bytes, longWorld), bytes.toString("hex")).toEqual(["holds an id"]);
    // Behind a prefix of 1 to 3 characters, with the key's length picked for the whole to be base64url
    // as the server writes it: 2 mod 3 bytes behind one character, 1 mod 3 behind two, and behind three
    // a multiple of 3 whose last byte is a multiple of 4.
    const fourth = "decoded from its character 4";
    for (const [cursor, where] of [
      [`x${sealed(`${tagless}Z`)}`, second],
      [`v1${sealed(tagless)}`, third],
      [`abc${sealed(`${tagless}Z|`)}`, fourth],
      [`c${encode(spelled, noise)}`, second],
      [`v1${encode(spelled, noise.subarray(0, 15))}`, third],
      [`abc${encode(spelled, noise.subarray(0, 13), Buffer.from([0x60]))}`, fourth],
    ] as const)
      expect(reasons(cursor, longWorld), cursor).toEqual([`holds an id, ${where}`]);
    // An id that is short after its tag has no such forms, since a few characters turn up anywhere:
    // the tail of `drp_secret`. An id written another way, as the hex text of its 16 bytes, passes, as
    // the header says.
    expect(key(Buffer.concat([version, Buffer.from("secret"), noise]))).toEqual([]);
    expect(reasons(spelled.toString("hex"), longWorld)).toEqual([]);
    expect(key(Buffer.from("4f9a2c", "hex"))).toEqual(["decodes to fewer than 12 bytes"]);
    expect(key(noise)).toEqual([]);
    // The contract's own example, a random handle of 12 bytes.
    expect(key(Buffer.from("q8ZrT2vLm5XcW0nB", "base64url"))).toEqual([]);
    expect(at(page("abcdf"), "shape")).toEqual(["$.next_cursor", "$.next_cursor"]);
  });

  it("catches a reason phrase that isn't the status's, a transport header out of its form, a wrong length and a type on an empty answer", () => {
    const body = upcomingDay([bensCard()]);
    const shape = (sent: Answer, id = "getOccurrence") =>
      scan(sent, context(id, cleo)).map((finding) => `${finding.check} ${finding.at}`);
    expect(shape({ ...answer(body), reason: "Found It" })).toEqual(["shape reason"]);
    expect(shape(answer(body, 200, { "content-length": "3" }))).toEqual(["shape header content-length"]);
    expect(shape(answer(body, 200, { connection: "upgrade" }))).toEqual(["shape header connection"]);
    expect(shape(answer(body, 200, { "keep-alive": "timeout=5, drop=drp_ben" }))).toEqual(["shape header keep-alive"]);
    // In their forms, but carrying something: a Date that isn't the answer's time (a hidden drop's
    // commit time, say), and a Keep-Alive that isn't the server's own.
    const committed = new Date(Date.now() - 86_400_000).toUTCString();
    expect(scan(answer(body, 200, { date: committed }), context("getOccurrence", cleo))).toEqual([
      {
        check: "shape",
        at: "header date",
        what: "a Date that isn't the time of the answer: Node writes the clock's own",
      },
    ]);
    expect(shape(answer(body, 200, { "keep-alive": "timeout=5" }))).toEqual(["shape header keep-alive"]);
    // A Date in its form that no clock writes: a day 36 holding an instant, and today's second under
    // another weekday's name, which Date.parse alone would read as now.
    const now = new Date();
    const otherDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][(now.getUTCDay() + 1) % 7] ?? "";
    const unreal = "a Date that isn't a real instant written as Node writes it";
    for (const date of ["Fri, 36 Nov 2026 20:00:00 GMT", `${otherDay}${now.toUTCString().slice(3)}`])
      expect(scan(answer(body, 200, { date }), context("getOccurrence", cleo))).toEqual([
        { check: "shape", at: "header date", what: unreal },
      ]);
    // An answer with the harness's clock: a Date before its earliest or after its latest isn't its time.
    const second = Math.floor(Date.now() / 1000) * 1000;
    const clocked = (date: number, earliest: number, latest: number): Answer => ({
      ...answer(body, 200, { date: new Date(date).toUTCString() }),
      clock: { earliest, latest },
    });
    expect(scan(clocked(second, second - 1000, second + 500), context("getOccurrence", cleo))).toEqual([]);
    expect(shape(clocked(second - 2000, second - 1000, second + 500))).toEqual(["shape header date"]);
    expect(shape(clocked(second + 1000, second - 1000, second + 500))).toEqual(["shape header date"]);
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

describe("the leak scanner holds the account routes to the world's accounts and invitations (spec 23; T7, T14, T33, T55)", () => {
  /** `who`'s `Me`, as the row the world holds for their account says it. */
  const meOf = (who: string, over: Record<string, unknown> = {}) => {
    const row = world.accounts.get(acct(who));
    if (row === undefined) throw new Error(`the test world has no account for ${who}`);
    return {
      id: acct(who),
      ...(row.name === null ? {} : { display_name: row.name }),
      ...(row.avatar === null ? {} : { avatar_version: row.avatar }),
      age_confirmed: row.ageConfirmed,
      version: row.version,
      ...over,
    };
  };
  const waiting = { invitation_id: "inv_mo", club_name: "Saturday People", inviter_name: "Ana", state: "waiting" };
  const faysOwn = { invitation_id: "inv_fay", club_name: "Saturday People", inviter_name: "Hal", state: "waiting" };
  const listing = (invitations: unknown[], clubs: unknown[] = []) => ({
    server_now: "2026-11-07T06:59:59Z",
    clubs,
    invitations,
  });
  /** The context of a caller who holds an account and no interval, or any other viewer. */
  const as = (id: string, viewer: Viewer): ScanContext => ({ ...context(id, cleo), viewer });
  const nobody: Viewer = { account: null, intervals: new Set(), texts: new Set() };

  it("passes each caller's own account, with a name and an avatar or with neither, and the invitations they accepted", () => {
    expect(scan(answer(meOf("cleo")), context("getMe", cleo))).toEqual([]);
    expect(scan(answer(meOf("ana", { version: 1 })), context("updateMe", ana))).toEqual([]);
    expect(scan(answer(meOf("dan")), as("getMe", alone("acct_dan")))).toEqual([]);
    // Mo, in no club, is told the club's name and the inviter's, as the invitation they accepted holds them.
    expect(scan(answer(listing([waiting])), as("listClubs", alone("acct_mo")))).toEqual([]);
    // Fay left the club, and the invitation Fay accepted still names its inviter, whom Fay may not know.
    expect(scan(answer(listing([faysOwn])), context("listClubs", fay))).toEqual([]);
  });

  it("catches a Me whose id isn't the viewer's, and none of the viewer's own fields wrong (spec 23: the only place an account id appears)", () => {
    const ben2cleo = scan(answer(meOf("cleo", { id: acct(ben) })), context("getMe", cleo));
    expect(at(ben2cleo, "world")).toEqual(["$.id"]);
    // The id's position is judged by the world check alone, not read as an unseen id a second time.
    expect(at(ben2cleo, "values")).toEqual([]);
    expect(at(scan(answer(meOf("ben")), context("getMe", cleo)), "world")).toEqual([
      "$.id",
      "$.display_name",
      "$.avatar_version",
      "$.version",
    ]);
    const cleos = (over: Record<string, unknown>) =>
      at(scan(answer(meOf("cleo", over)), context("getMe", cleo)), "world");
    expect(cleos({ display_name: "Ben" })).toEqual(["$.display_name"]);
    expect(cleos({ avatar_version: "v_avatar_ben" })).toEqual(["$.avatar_version"]);
    expect(cleos({ age_confirmed: false })).toEqual(["$.age_confirmed"]);
    expect(cleos({ version: 5 })).toEqual(["$.version"]);
    // A name or an avatar the row doesn't have, and one it has that the answer leaves out.
    expect(
      at(scan(answer(meOf("dan", { display_name: "Dan" })), as("getMe", alone("acct_dan", ["Dan"]))), "world"),
    ).toEqual(["$.display_name"]);
    expect(at(scan(answer(meOf("dan", { avatar_version: "v_x" })), as("getMe", alone("acct_dan"))), "world")).toEqual([
      "$.avatar_version",
    ]);
    const unnamed = { id: acct(cleo), age_confirmed: true, version: 4 };
    expect(at(scan(answer(unnamed), context("getMe", cleo)), "world")).toEqual(["$.display_name", "$.avatar_version"]);
  });

  it("catches a Me for an account the world doesn't have, and one shown to a caller with no session", () => {
    const stranger = { id: "acct_nobody", age_confirmed: true, version: 1 };
    expect(at(scan(answer(stranger), as("getMe", alone("acct_nobody"))), "world")).toEqual(["$"]);
    expect(at(scan(answer(meOf("cleo")), as("getMe", nobody)), "world")).toEqual(["$"]);
  });

  it("catches a field of an account the contract doesn't name: an email address, a phone number, the sign-in subject (T55)", () => {
    for (const [key, value] of [
      ["email", "ana@example.invalid"],
      ["phone", "+10000000000"],
      ["subject", "5f1c9a1e-3b0a-4a54-9d0e-0a3a7d5f2c11"],
      ["state", "active"],
    ] as const)
      expect(at(scan(answer(meOf("cleo", { [key]: value })), context("getMe", cleo)), "shape"), key).toEqual([
        `$.${key}`,
      ]);
  });

  it("catches an account id anywhere but the viewer's own Me.id: someone else's, the viewer's own, in a cursor and in a header (T14)", () => {
    const page = (cursor: string) => scan(answer({ items: [], next_cursor: cursor }), context("listMyDrops", cleo));
    expect(at(page(acct(ben)), "values")).toEqual(["$.next_cursor"]);
    expect(at(page(acct(cleo)), "values")).toEqual(["$.next_cursor"]);
    expect(at(page("acct_dan"), "values")).toEqual(["$.next_cursor"]);
    const header = scan(answer(meOf("cleo"), 200, { "x-account": acct(cleo) }), context("getMe", cleo));
    expect(at(header, "values")).toEqual(["header x-account"]);
    // Hidden in a cursor's bytes, as an id of the world's other kinds is.
    const hidden = Buffer.concat([Buffer.from([0xff, 0x00, 0x9c]), Buffer.from(acct(ben))]).toString("base64url");
    expect(at(page(hidden), "values")).toEqual(["$.next_cursor (decoded)"]);
  });

  it("catches an invitation that isn't the viewer's, and each name it carries that the viewer may not read (T7, T33)", () => {
    // Mo's, shown to a member of the club: not Mo's to give, though the club's names are Cleo's to read.
    const toCleo = scan(answer(listing([waiting])), context("listClubs", cleo));
    expect(at(toCleo, "world")).toEqual(["$.invitations[0]"]);
    expect(at(toCleo, "values")).toEqual([]);
    // To someone in no club with it, the club's name and the inviter's name are text they may not read too.
    const toStan = scan(answer(listing([waiting])), context("listClubs", stan));
    expect(at(toStan, "world")).toEqual(["$.invitations[0]"]);
    expect(at(toStan, "values")).toEqual(["$.invitations[0].club_name", "$.invitations[0].inviter_name"]);
    expect(at(scan(answer(listing([waiting])), as("listClubs", nobody)), "world")).toEqual(["$.invitations[0]"]);
    // Fay's own, shown to Mo, who never accepted it.
    expect(at(scan(answer(listing([faysOwn])), as("listClubs", alone("acct_mo"))), "world")).toEqual([
      "$.invitations[0]",
    ]);
    // Eve's own, which brought Eve into the club: a membership now, so not an invitation any more.
    const used = { ...waiting, invitation_id: "inv_eve" };
    expect(at(scan(answer(listing([used])), context("listClubs", eve)), "world")).toEqual(["$.invitations[0]"]);
    // An invitation the world doesn't have.
    const made = { ...waiting, invitation_id: "inv_made_up" };
    expect(at(scan(answer(listing([made])), as("listClubs", alone("acct_mo"))), "world")).toEqual(["$.invitations[0]"]);
    // Mo's own, with another club's name and another person as its inviter.
    const mo = alone("acct_mo");
    const wrong = scan(
      answer(listing([{ ...waiting, club_name: "Far Club", inviter_name: "Ben" }])),
      as("listClubs", mo),
    );
    expect(at(wrong, "world")).toEqual(["$.invitations[0].club_name", "$.invitations[0].inviter_name"]);
    expect(at(wrong, "values")).toEqual(["$.invitations[0].club_name", "$.invitations[0].inviter_name"]);
  });

  it("catches an invitation's id anywhere but where the invitation is judged, to its own account too (T14)", () => {
    const page = (viewer: Viewer, cursor: string) =>
      scan(answer({ items: [], next_cursor: cursor }), as("listMyDrops", viewer));
    expect(at(page(alone("acct_mo"), "inv_mo"), "values")).toEqual(["$.next_cursor"]);
    expect(at(page(alone("acct_mo"), "inv_fay"), "values")).toEqual(["$.next_cursor"]);
    expect(at(scan(answer({ items: [], next_cursor: "inv_mo" }), context("listMyDrops", cleo)), "values")).toEqual([
      "$.next_cursor",
    ]);
    // A club's id is no one's but its members', so an invitation's club is as hidden from Mo as any other.
    expect(at(page(alone("acct_mo"), "clb_sat"), "values")).toEqual(["$.next_cursor"]);
  });
});
