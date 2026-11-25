/// <reference lib="esnext.temporal" />
// Home's judge, judged (./home.ts; the outside audit's A14): each condition of its statement of the read predicate
// is shown to refuse alone, and its page, its recent days and its modes to follow their rules, on a world written out
// here by hand, with no database. The matrix runs the judge against the route; this file runs it against the rules,
// so a judge that lost a condition can't pass the matrix by agreeing with a route that lost the same one.

import { describe, expect, it } from "vitest";
import type { ClubRows } from "./club.ts";
import { homeFor, mayView, pageFor, recentFor, type HomeRows, type HomeSeen } from "./home.ts";
import type { WorldAccount, WorldDay, WorldDrop, WorldFacts, WorldMember } from "./scanner.ts";
import type { ScheduleWorld } from "./schedule.ts";

const CLUB = "clb_here";
const at = (iso: string) => Temporal.Instant.from(iso);
/** Saturday 7 November 2026 at 7 AM in New York, and 1 AM after it. */
const REVEAL = at("2026-11-07T12:00:00Z");
const CLOSE = at("2026-11-08T06:00:00Z");
/** The day open, mid-morning. */
const OPEN = at("2026-11-07T14:30:00Z");
const JOINED = at("2026-10-01T00:00:00Z");

function member(account: string, name: string, more: Partial<WorldMember> = {}): WorldMember {
  return { club: CLUB, account, name, joinedAt: JOINED, leftAt: null, ...more };
}

function account(name: string, more: Partial<WorldAccount> = {}): WorldAccount {
  return { state: "active", deletionRequestedAt: null, name, avatar: null, ageConfirmed: true, version: 1, ...more };
}

function day(star: string, localDate: string, revealAt: Temporal.Instant, more: Partial<WorldDay> = {}): WorldDay {
  return {
    club: CLUB,
    star,
    localDate,
    revealAt,
    closeAt: revealAt.add({ hours: 18 }),
    collectingFrom: revealAt.subtract({ hours: 24 * 6 }),
    status: "scheduled",
    ...more,
  };
}

const EVERYONE = new Set(["itv_ana", "itv_ben", "itv_cleo"]);

function drop(author: string, dayId: string, more: Partial<WorldDrop> = {}): WorldDrop {
  return {
    author,
    day: dayId,
    media: "photo",
    state: "active",
    endedAt: null,
    caption: null,
    audience: EVERYONE,
    comments: [],
    ...more,
  };
}

/** Ana's Saturday, with Ben's photo, committed first, and Ana's own photo, committed after it. */
function world(): WorldFacts {
  return {
    drops: new Map([
      ["drp_ben", drop("itv_ben", "occ_sat")],
      ["drp_ana", drop("itv_ana", "occ_sat")],
    ]),
    days: new Map([["occ_sat", day("itv_ana", "2026-11-07", REVEAL)]]),
    members: new Map([
      ["itv_ana", member("usr_ana", "Ana")],
      ["itv_ben", member("usr_ben", "Ben")],
      ["itv_cleo", member("usr_cleo", "Cleo")],
    ]),
    clubs: new Map([[CLUB, { name: "The Saturdays", suspendedAt: null, labels: new Map() }]]),
    reservations: new Map(),
    uploads: new Map(),
    canaries: new Map(),
    accounts: new Map([
      ["usr_ana", account("Ana")],
      ["usr_ben", account("Ben")],
      ["usr_cleo", account("Cleo")],
    ]),
    invitations: new Map(),
  };
}

function rows(world: WorldFacts, more: Partial<HomeRows> = {}): HomeRows {
  const ids = [...world.drops.keys()];
  return {
    submitted: new Map(ids.map((id, index) => [id, at("2026-11-06T20:00:00Z").add({ minutes: index })])),
    highlighted: new Set(),
    blocks: [],
    frames: new Map(
      ids
        .filter((id) => world.drops.get(id)?.media === "photo")
        .map((id) => [id, { width: 1080, height: 1350, version: `v_${id}` }]),
    ),
    providers: new Map(ids.filter((id) => world.drops.get(id)?.media !== "photo").map((id) => [id, "tiktok"])),
    shared: new Set(),
    favoured: new Map(),
    weeks: new Map([...world.days.keys()].map((id) => [id, "ver_1"])),
    confirmed: new Map([["ver_1 saturday", JOINED]]),
    ...more,
  };
}

function schedule(): ScheduleWorld {
  return {
    clubs: new Map([[CLUB, { name: "The Saturdays", timezone: "America/New_York", suspended: false }]]),
    members: new Map(),
    activeAccounts: new Set(["usr_ana", "usr_ben", "usr_cleo"]),
    versions: [
      {
        id: "ver_1",
        club: CLUB,
        effectiveFrom: "2026-10-05",
        assignments: [{ weekday: "saturday", star: "itv_ana", firstDate: "2026-10-10" }],
      },
    ],
    proposals: new Map(),
  };
}

const clubRows = (activated = true): ClubRows =>
  new Map([[CLUB, { activated, rosterVersion: 3, openCandidates: 0, openRevision: null }]]);

function seen(
  w: WorldFacts = world(),
  viewer: string | null = "usr_cleo",
  now: Temporal.Instant = OPEN,
  home: Partial<HomeRows> = {},
): HomeSeen {
  return { world: w, schedule: schedule(), rows: clubRows(), home: rows(w, home), account: viewer, now };
}

/** `w` with one fact changed by `change`, which edits the copies it is given. */
function changed(change: (parts: { [K in keyof WorldFacts]: Map<string, unknown> }) => void): WorldFacts {
  const w = world();
  const parts = Object.fromEntries(
    Object.entries(w).map(([key, value]) => [key, new Map(value as Map<string, unknown>)]),
  );
  change(parts as { [K in keyof WorldFacts]: Map<string, unknown> });
  return parts as unknown as WorldFacts;
}

const withDrop = (id: string, more: Partial<WorldDrop>) =>
  changed((w) => w.drops.set(id, { ...(w.drops.get(id) as WorldDrop), ...more }));
const withMember = (id: string, more: Partial<WorldMember>) =>
  changed((w) => w.members.set(id, { ...(w.members.get(id) as WorldMember), ...more }));
const withAccount = (id: string, more: Partial<WorldAccount>) =>
  changed((w) => w.accounts.set(id, { ...(w.accounts.get(id) as WorldAccount), ...more }));
const withDay = (id: string, more: Partial<WorldDay>) =>
  changed((w) => w.days.set(id, { ...(w.days.get(id) as WorldDay), ...more }));

describe("Home's statement of the read predicate (mayView; T9, T27; FQ63)", () => {
  it("lets a member in the audience see a drop's media once its day has opened", () => {
    expect(mayView(seen(), "drp_ben")).toBe(true);
    expect(mayView(seen(world(), "usr_cleo", REVEAL), "drp_ben")).toBe(true);
    expect(mayView(seen(world(), "usr_ben"), "drp_ben")).toBe(true);
  });

  it("refuses on each of its conditions alone", () => {
    const refusing: [string, HomeSeen, string?][] = [
      ["a caller without a session", seen(world(), null)],
      ["a drop that isn't the world's", seen(), "drp_none"],
      ["the viewer's account being deleted", seen(withAccount("usr_cleo", { state: "deleting" }))],
      ["the viewer's account deleted", seen(withAccount("usr_cleo", { state: "deleted" }))],
      ["the viewer outside the audience", seen(withDrop("drp_ben", { audience: new Set(["itv_ana", "itv_ben"]) }))],
      ["the viewer's interval ended", seen(withMember("itv_cleo", { leftAt: at("2026-11-06T21:00:00Z") }))],
      ["the drop held", seen(withDrop("drp_ben", { state: "held" }))],
      ["the drop withdrawn", seen(withDrop("drp_ben", { state: "withdrawn", endedAt: REVEAL }))],
      ["the drop removed", seen(withDrop("drp_ben", { state: "removed", endedAt: REVEAL }))],
      ["the day suspended", seen(withDay("occ_sat", { status: "suspended" }))],
      ["the day cancelled", seen(withDay("occ_sat", { status: "cancelled" }))],
      [
        "the club suspended",
        seen(changed((w) => w.clubs.set(CLUB, { name: "The Saturdays", suspendedAt: REVEAL, labels: new Map() }))),
      ],
      ["the star gone before the reveal", seen(withMember("itv_ana", { leftAt: REVEAL.subtract({ seconds: 1 }) }))],
      [
        "the star's deletion asked before the reveal",
        seen(withAccount("usr_ana", { deletionRequestedAt: REVEAL.subtract({ seconds: 1 }) })),
      ],
      ["the author's account being deleted", seen(withAccount("usr_ben", { state: "deleting" }))],
      ["the author's account deleted", seen(withAccount("usr_ben", { state: "deleted" }))],
      ["the viewer's block of the author", seen(world(), "usr_cleo", OPEN, { blocks: [["usr_cleo", "usr_ben"]] })],
      ["the author's block of the viewer", seen(world(), "usr_cleo", OPEN, { blocks: [["usr_ben", "usr_cleo"]] })],
      ["the reveal not reached", seen(world(), "usr_cleo", REVEAL.subtract({ nanoseconds: 1 }))],
    ];
    for (const [name, one, id = "drp_ben"] of refusing) expect(mayView(one, id), name).toBe(false);
  });

  it("holds the star's leaving and deletion to the reveal, and a block to its two people", () => {
    expect(mayView(seen(withMember("itv_ana", { leftAt: REVEAL })), "drp_ben")).toBe(true);
    expect(mayView(seen(withAccount("usr_ana", { deletionRequestedAt: REVEAL })), "drp_ben")).toBe(true);
    expect(mayView(seen(world(), "usr_cleo", OPEN, { blocks: [["usr_ana", "usr_ben"]] }), "drp_ben")).toBe(true);
    expect(mayView(seen(world(), "usr_cleo", OPEN, { blocks: [["usr_cleo", "usr_ana"]] }), "drp_ben")).toBe(true);
    // Someone else's block of the author, the viewer's block of someone else, and the deletion of an account neither
    // the star's nor the author's change nothing.
    const bens = { state: "deleting", deletionRequestedAt: REVEAL.subtract({ hours: 1 }) } as const;
    expect(mayView(seen(withAccount("usr_ben", bens)), "drp_ana")).toBe(true);
  });
});

describe("the open day's page (pageFor; T35; addendum 4)", () => {
  it("puts the star's drops first, then friends', each by commit time and then id", () => {
    const w = changed((parts) => {
      parts.drops.set("drp_cleo", drop("itv_cleo", "occ_sat"));
      parts.drops.set("drp_ana_b", drop("itv_ana", "occ_sat"));
    });
    const same = at("2026-11-06T20:00:00Z");
    const page = pageFor(
      seen(w, "usr_ben", OPEN, {
        submitted: new Map([
          ["drp_ben", same.add({ minutes: 2 })],
          ["drp_cleo", same],
          ["drp_ana", same.add({ minutes: 5 })],
          ["drp_ana_b", same.add({ minutes: 5 })],
        ]),
      }),
      "occ_sat",
      "itv_ben",
    );
    if (page === "refused") throw new Error("refused");
    expect(page.drops.map((one) => [one.id, one.section])).toEqual([
      ["drp_ana", "star"],
      ["drp_ana_b", "star"],
      ["drp_cleo", "friends"],
      ["drp_ben", "friends"],
    ]);
  });

  it("leaves out what the viewer may not see", () => {
    const page = pageFor(seen(withDrop("drp_ben", { state: "held" })), "occ_sat", "itv_cleo");
    if (page === "refused") throw new Error("refused");
    expect(page.drops.map((one) => one.id)).toEqual(["drp_ana"]);
    const blocked = pageFor(
      seen(world(), "usr_cleo", OPEN, { blocks: [["usr_cleo", "usr_ben"]] }),
      "occ_sat",
      "itv_cleo",
    );
    if (blocked === "refused") throw new Error("refused");
    expect(blocked.drops.map((one) => one.id)).toEqual(["drp_ana"]);
  });

  it("refuses a page with a reaction or a comment, the viewer's own favourite, or more than 36 drops", () => {
    expect(pageFor(seen(world(), "usr_cleo", OPEN, { shared: new Set(["drp_ben"]) }), "occ_sat", "itv_cleo")).toBe(
      "refused",
    );
    const favoured = (who: string) => ({ favoured: new Map([["drp_ben", new Set([who])]]) });
    expect(pageFor(seen(world(), "usr_cleo", OPEN, favoured("itv_cleo")), "occ_sat", "itv_cleo")).toBe("refused");
    expect(pageFor(seen(world(), "usr_cleo", OPEN, favoured("itv_ana")), "occ_sat", "itv_cleo")).not.toBe("refused");
    // A shared drop the viewer can't see doesn't refuse their page.
    expect(
      pageFor(
        seen(withDrop("drp_ben", { state: "held" }), "usr_cleo", OPEN, { shared: new Set(["drp_ben"]) }),
        "occ_sat",
        "itv_cleo",
      ),
    ).not.toBe("refused");
    const many = (count: number) =>
      changed((parts) => {
        parts.drops.clear();
        for (let index = 0; index < count; index += 1)
          parts.drops.set(`drp_${String(index).padStart(2, "0")}`, drop("itv_ben", "occ_sat"));
      });
    expect(pageFor(seen(many(36)), "occ_sat", "itv_cleo")).not.toBe("refused");
    expect(pageFor(seen(many(37)), "occ_sat", "itv_cleo")).toBe("refused");
  });
});

describe("the recent days (recentFor; D08)", () => {
  /** Seven closed Saturdays of Ana's before this one, each with Ben's photo; the newest has more. */
  function past(): WorldFacts {
    return changed((parts) => {
      for (let week = 1; week <= 7; week += 1) {
        const reveal = REVEAL.subtract({ hours: 24 * 7 * week });
        const id = `occ_${String(week)}`;
        parts.days.set(
          id,
          day("itv_ana", reveal.toZonedDateTimeISO("America/New_York").toPlainDate().toString(), reveal),
        );
        parts.drops.set(`drp_${String(week)}`, drop("itv_ben", id));
      }
    });
  }

  it("lists the six newest closed days that hold a drop the viewer may see, newest first", () => {
    const days = recentFor(seen(past(), "usr_cleo", OPEN), CLUB);
    expect(days.map((one) => (one.occurrence as { id: string }).id)).toEqual([
      "occ_1",
      "occ_2",
      "occ_3",
      "occ_4",
      "occ_5",
      "occ_6",
    ]);
    // The open day isn't closed yet; once it has, it leads.
    expect(
      recentFor(seen(past(), "usr_cleo", CLOSE), CLUB).map((one) => (one.occurrence as { id: string }).id)[0],
    ).toBe("occ_sat");
    // A day whose only drop the viewer can't see isn't listed.
    const blocked = recentFor(seen(past(), "usr_cleo", OPEN, { blocks: [["usr_ben", "usr_cleo"]] }), CLUB);
    expect(blocked).toEqual([]);
  });

  it("covers a day with the star's highlighted photo, then the star's earliest, then the earliest, never a video", () => {
    const w = changed((parts) => {
      parts.drops.set("drp_ana_late", drop("itv_ana", "occ_sat"));
      parts.drops.set("drp_cleo_video", drop("itv_cleo", "occ_sat", { media: "external_video" }));
    });
    const times = new Map([
      ["drp_cleo_video", at("2026-11-06T19:00:00Z")],
      ["drp_ben", at("2026-11-06T19:30:00Z")],
      ["drp_ana", at("2026-11-06T20:00:00Z")],
      ["drp_ana_late", at("2026-11-06T21:00:00Z")],
    ]);
    const cover = (more: Partial<HomeRows>, w2: WorldFacts = w) =>
      recentFor(seen(w2, "usr_cleo", CLOSE, { submitted: times, ...more }), CLUB)[0]?.cover_drop_id;
    expect(cover({ highlighted: new Set(["drp_ana_late"]) })).toBe("drp_ana_late");
    expect(cover({ highlighted: new Set(["drp_ben"]) })).toBe("drp_ana");
    expect(cover({})).toBe("drp_ana");
    // Without the star's photos, the earliest photo, not the earlier video.
    const friends = changed((parts) => {
      parts.drops.delete("drp_ana");
      parts.drops.set("drp_cleo_video", drop("itv_cleo", "occ_sat", { media: "external_video" }));
    });
    expect(cover({}, friends)).toBe("drp_ben");
  });
});

describe("Home's modes (homeFor)", () => {
  it("gives the neutral not-found to anyone not an active member with an active account", () => {
    expect(homeFor(seen(world(), null), CLUB)).toBeUndefined();
    expect(homeFor(seen(world(), "usr_zed"), CLUB)).toBeUndefined();
    expect(homeFor(seen(withAccount("usr_cleo", { state: "deleting" })), CLUB)).toBeUndefined();
    expect(homeFor(seen(withMember("itv_cleo", { leftAt: REVEAL })), CLUB)).toBeUndefined();
    expect(homeFor(seen(), "clb_elsewhere")).toBeUndefined();
  });

  it("is unavailable in a suspended club, awaiting activation before it starts, and the open day's page while one is open", () => {
    const suspended = changed((w) =>
      w.clubs.set(CLUB, { name: "The Saturdays", suspendedAt: REVEAL, labels: new Map() }),
    );
    expect(homeFor(seen(suspended), CLUB)).toMatchObject({ mode: "unavailable" });
    expect(homeFor({ ...seen(), rows: clubRows(false) }, CLUB)).toMatchObject({ mode: "awaiting_activation" });
    const open = homeFor(seen(), CLUB);
    expect(open).toMatchObject({ mode: "day", day: { stage: "revealed", viewer: { is_star: false } } });
    expect((open as { day: { drops: { id: string }[] } }).day.drops.map((one) => one.id)).toEqual([
      "drp_ana",
      "drp_ben",
    ]);
  });

  it("waits for the next day before it opens, and pauses or has no days once none is coming", () => {
    expect(homeFor(seen(world(), "usr_cleo", REVEAL.subtract({ hours: 1 })), CLUB)).toMatchObject({ mode: "waiting" });
    // After the day has closed, no next day: with three active members, no days; with Ana and Ben gone, paused.
    expect(homeFor(seen(world(), "usr_cleo", CLOSE), CLUB)).toMatchObject({ mode: "no_days" });
    const alone = changed((w) => {
      w.members.set("itv_ana", member("usr_ana", "Ana", { leftAt: CLOSE }));
      w.members.set("itv_ben", member("usr_ben", "Ben", { leftAt: CLOSE }));
    });
    expect(homeFor(seen(alone, "usr_cleo", CLOSE.add({ hours: 1 })), CLUB)).toMatchObject({ mode: "paused" });
    // A day whose star left before it opened never opens, and isn't waited for (FQ63).
    const gone = withMember("itv_ana", { leftAt: REVEAL.subtract({ hours: 2 }) });
    expect(homeFor(seen(gone, "usr_cleo", REVEAL.subtract({ hours: 1 })), CLUB)).toMatchObject({ mode: "no_days" });
  });
});
