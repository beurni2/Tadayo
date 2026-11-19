/// <reference lib="esnext.temporal" />
// The club's judges, judged (./club.ts): each branch of what a cell must get from getClub and createClub is
// shown to refuse an answer that breaks it, on a world written out here by hand, with no database.

import { describe, expect, it } from "vitest";
import {
  CLUB_JUDGED,
  CREATE_CLUB_NO_BODY,
  clubExpected,
  clubFor,
  createClubCases,
  createdClubId,
  newClubProblems,
  sameDetail,
  type ClubRows,
  type ClubSeen,
  type DaysOf,
} from "./club.ts";
import { NEUTRAL, pinned, pinnedProblems, type Expected } from "./harness.ts";
import type { Answer } from "./scanner.ts";
import type { ScheduleMember, ScheduleWorld } from "./schedule.ts";

const CLUB = "clb_here";
/** Friday 6 November 2026, 9:41 AM in New York, with a fraction the contract rounds down. */
const NOW = Temporal.Instant.from("2026-11-06T14:41:00.5Z");

function member(account: string, more: Partial<ScheduleMember> = {}): ScheduleMember {
  return {
    club: CLUB,
    account,
    active: true,
    joinedAt: Temporal.Instant.from("2026-10-01T00:00:00Z"),
    name: account,
    avatar: null,
    ...more,
  };
}

/** A club of three, Ana, Ben and Cleo, that has started. */
function world(): ScheduleWorld {
  return {
    clubs: new Map([[CLUB, { name: "The Saturdays", timezone: "America/New_York", suspended: false }]]),
    members: new Map([
      ["itv_ana", member("usr_ana")],
      ["itv_ben", member("usr_ben")],
      ["itv_cleo", member("usr_cleo")],
    ]),
    activeAccounts: new Set(["usr_ana", "usr_ben", "usr_cleo", "usr_zed"]),
    versions: [],
    proposals: new Map(),
  };
}

const rows = (over: Partial<ClubRows extends Map<string, infer R> ? R : never> = {}): ClubRows =>
  new Map([[CLUB, { activated: true, rosterVersion: 5, openCandidates: 0, openRevision: null, ...over }]]);

const occurrence = (id: string) => ({ id, star: { membership_id: "itv_cleo" } });
const DAYS: DaysOf = () => ({ next: occurrence("occ_next") });
const NO_DAYS: DaysOf = () => ({});

/** An answer as the app sends it, with its Date where the app puts it (harness.ts, NEUTRAL_ORDER). */
function sent(answer: Answer, more: Record<string, string> = {}): Answer {
  const { connection, ...headers } = { ...answer.headers, ...more };
  return { ...answer, headers: { ...headers, date: new Date().toUTCString(), connection: connection ?? "keep-alive" } };
}

const ok = (body: unknown, headers: Record<string, string> = {}): Answer =>
  sent(pinned(200, "OK", JSON.stringify(body)), headers);
const made = (body: unknown): Answer => sent(pinned(201, "Created", JSON.stringify(body)));
const NOT_FOUND = sent(NEUTRAL);

function judging(expected: Expected): (answer: Answer) => string[] {
  if (typeof expected !== "function") throw new Error("the club's judge reads its cell: it is never a pinned answer");
  return expected;
}

const seen =
  (schedule: ScheduleWorld, account: string | null, clubRows: ClubRows = rows(), daysOf: DaysOf = DAYS) =>
  (): ClubSeen => ({ schedule, account, now: NOW, rows: clubRows, daysOf });

const want = {
  server_now: "2026-11-06T14:41:00Z",
  club: {
    id: CLUB,
    name: "The Saturdays",
    timezone: "America/New_York",
    my_membership_id: "itv_ben",
    state: "active",
    member_count: 3,
    next_day: occurrence("occ_next"),
  },
  roster_version: 5,
  can_propose: true,
};

describe("a club's ClubDetail from the world's rows (getClub)", () => {
  it("is the club for each member, with the viewer's own interval and the instant rounded down", () => {
    expect(clubFor(world(), rows(), CLUB, "usr_ben", NOW, DAYS)).toEqual(want);
    expect(clubFor(world(), rows(), CLUB, "usr_ana", NOW, DAYS)).toEqual({
      ...want,
      club: { ...want.club, my_membership_id: "itv_ana" },
    });
  });

  it("says proposed until the club has started, paused under two active members, and active otherwise (FQ16)", () => {
    const state = (w: ScheduleWorld, r: ClubRows) =>
      (clubFor(w, r, CLUB, "usr_ana", NOW, NO_DAYS)?.["club"] as Record<string, unknown>)["state"];
    expect(state(world(), rows({ activated: false }))).toBe("proposed");
    expect(state(world(), rows())).toBe("active");
    const two = world();
    two.members.set("itv_cleo", member("usr_cleo", { active: false }));
    expect(state(two, rows())).toBe("active");
    two.members.set("itv_ben", member("usr_ben", { active: false }));
    expect(state(two, rows())).toBe("paused");
    // A club of one that never started is still proposed, not paused.
    expect(state(two, rows({ activated: false }))).toBe("proposed");
    expect(clubFor(two, rows(), CLUB, "usr_ana", NOW, NO_DAYS)).toMatchObject({ club: { member_count: 1 } });
  });

  it("has room to propose only under six, the candidates still open counted, and names the open revision", () => {
    const detail = (r: ClubRows) => clubFor(world(), r, CLUB, "usr_ana", NOW, NO_DAYS);
    expect(detail(rows({ openCandidates: 2 }))).toMatchObject({ can_propose: true });
    expect(detail(rows({ openCandidates: 3 }))).toMatchObject({ can_propose: false });
    expect(detail(rows({ openRevision: "rev_1" }))).toMatchObject({ open_revision_id: "rev_1" });
    expect(detail(rows())).not.toHaveProperty("open_revision_id");
    expect((detail(rows()) as { club: object }).club).not.toHaveProperty("next_day");
  });

  it("is nothing for a stranger, a caller with no account, a former member, a deleting account, a suspended club and a club with no rows", () => {
    expect(clubFor(world(), rows(), CLUB, "usr_zed", NOW, DAYS)).toBeUndefined();
    expect(clubFor(world(), rows(), CLUB, null, NOW, DAYS)).toBeUndefined();
    expect(clubFor(world(), rows(), "clb_other", "usr_ben", NOW, DAYS)).toBeUndefined();
    expect(clubFor(world(), new Map(), CLUB, "usr_ben", NOW, DAYS)).toBeUndefined();
    const left = world();
    left.members.set("itv_ben", member("usr_ben", { active: false }));
    expect(clubFor(left, rows(), CLUB, "usr_ben", NOW, DAYS)).toBeUndefined();
    const deleting = world();
    deleting.activeAccounts.delete("usr_ben");
    expect(clubFor(deleting, rows(), CLUB, "usr_ben", NOW, DAYS)).toBeUndefined();
    const suspended = world();
    suspended.clubs.set(CLUB, { name: "The Saturdays", timezone: "America/New_York", suspended: true });
    expect(clubFor(suspended, rows(), CLUB, "usr_ben", NOW, DAYS)).toBeUndefined();
  });

  it("accepts the right answer whatever the order of its keys, and only with private, no-store", () => {
    const judge = judging(clubExpected(seen(world(), "usr_ben"), CLUB));
    expect(judge(ok(want))).toEqual([]);
    expect(judge(ok(Object.fromEntries(Object.entries(want).reverse())))).toEqual([]);
    expect(judge(ok(want, { "cache-control": "no-cache" }))).not.toEqual([]);
    expect(judge(made(want))).not.toEqual([]);
  });

  it.each([
    ["another member's own interval", { ...want, club: { ...want.club, my_membership_id: "itv_ana" } }],
    ["another state", { ...want, club: { ...want.club, state: "paused" } }],
    ["members miscounted", { ...want, club: { ...want.club, member_count: 4 } }],
    ["no next day where there is one", { ...want, club: { ...want.club, next_day: undefined } }],
    ["an open day where there is none", { ...want, club: { ...want.club, open_day: occurrence("occ_open") } }],
    ["another day as the next", { ...want, club: { ...want.club, next_day: occurrence("occ_other") } }],
    ["another version of the roster", { ...want, roster_version: 6 }],
    ["no room where there is room", { ...want, can_propose: false }],
    ["an open revision where there is none", { ...want, open_revision_id: "rev_1" }],
    ["a wrong instant", { ...want, server_now: "2026-11-06T14:41:01Z" }],
    ["a count of approvals", { ...want, approvals: 2 }],
    ["the members' names", { ...want, club: { ...want.club, members: ["Ana"] } }],
  ])("refuses %s", (_what, body) => {
    expect(judging(clubExpected(seen(world(), "usr_ben"), CLUB))(ok(body))).not.toEqual([]);
  });

  it("holds anyone the club isn't for to the neutral not-found, byte for byte", () => {
    const judge = judging(clubExpected(seen(world(), "usr_zed"), CLUB));
    expect(judge(NOT_FOUND)).toEqual([]);
    expect(judging(clubExpected(seen(world(), null), CLUB))(NOT_FOUND)).toEqual([]);
    expect(judge(ok(want))).not.toEqual([]);
    expect(judge(sent(pinned(404, "Not Found", '{"code":"NOT_FOUND","club":"clb_here"}')))).not.toEqual([]);
  });
});

describe("a new club's answer (createClub)", () => {
  const fresh = {
    server_now: "2026-11-06T14:41:00Z",
    club: {
      id: "club_new",
      name: "Made 0",
      timezone: "America/New_York",
      my_membership_id: "mem_new",
      state: "proposed",
      member_count: 1,
    },
    roster_version: 0,
    can_propose: true,
  };

  it("reads the new club's id from a 201 and from nothing else", () => {
    expect(createdClubId(made(fresh))).toBe("club_new");
    expect(createdClubId(ok(fresh))).toBeUndefined();
    expect(createdClubId(made({ club: {} }))).toBeUndefined();
    expect(createdClubId(sent(pinned(201, "Created", "{bad")))).toBeUndefined();
  });

  it("holds a 201 to the club's rows, value for value, and refuses a 200 with the same body", () => {
    expect(sameDetail(201, fresh)(made(fresh))).toEqual([]);
    expect(sameDetail(201, fresh)(ok(fresh))).not.toEqual([]);
    expect(sameDetail(201, fresh)(made({ ...fresh, roster_version: 1 }))).not.toEqual([]);
    expect(sameDetail(201, fresh)(made({ ...fresh, creator: "Ben" }))).not.toEqual([]);
  });

  it("accepts a new club as G01-create has it", () => {
    expect(newClubProblems(made(fresh), "Made 0")).toEqual([]);
  });

  it.each([
    ["another name", { ...fresh, club: { ...fresh.club, name: "Made 1" } }],
    ["the zone as it was sent", { ...fresh, club: { ...fresh.club, timezone: "america/new_york" } }],
    ["a club already started", { ...fresh, club: { ...fresh.club, state: "active" } }],
    ["two members", { ...fresh, club: { ...fresh.club, member_count: 2 } }],
    ["a version past 0", { ...fresh, roster_version: 1 }],
    ["no room to propose", { ...fresh, can_propose: false }],
    ["an open revision", { ...fresh, open_revision_id: "rev_1" }],
    ["a day", { ...fresh, club: { ...fresh.club, next_day: occurrence("occ_1") } }],
    ["no club at all", { server_now: fresh.server_now }],
  ])("refuses %s", (_what, body) => {
    expect(newClubProblems(made(body), "Made 0")).not.toEqual([]);
  });
});

describe("the table of createClub bodies (createClubCases)", () => {
  const cases = createClubCases("Made 0");

  it("sends what the contract refuses first, then one club, its retry under the same key and another body under it", () => {
    expect(cases.map((one) => one.name)).toEqual([
      "no Idempotency-Key",
      "a key that isn't a UUID",
      "a name the contract refuses",
      "a zone nobody keeps",
      "an offset where a zone goes",
      "no zone",
      "a field the contract doesn't have",
      "a body past the limit",
      "a club",
      "the same request again under its key",
      "another body under that key",
    ]);
    const [club, retry, other] = cases.slice(-3);
    expect(club?.expected).toBe("created");
    expect(retry?.expected).toBe("replay");
    expect(retry?.body).toBe(club?.body);
    expect(new Set([club?.key, retry?.key, other?.key]).size).toBe(1);
    expect(other?.body).not.toBe(club?.body);
    // Every refused body has a key of its own, so none meets the club's receipt.
    const keys = cases.slice(2, 8).map((one) => one.key);
    expect(new Set([...keys, club?.key]).size).toBe(7);
    expect(cases.filter((one) => one.expected === "created")).toHaveLength(1);
  });

  it("pins each refusal byte for byte, the unread body with its connection closed", () => {
    const pins = cases.filter((one) => typeof one.expected !== "string").map((one) => one.expected as Answer);
    expect(pins.map((pin) => pin.body)).toEqual([
      '{"code":"INVALID_REQUEST","field":"Idempotency-Key"}',
      '{"code":"INVALID_REQUEST","field":"Idempotency-Key"}',
      '{"code":"INVALID_REQUEST","field":"name"}',
      '{"code":"INVALID_REQUEST","field":"timezone"}',
      '{"code":"INVALID_REQUEST","field":"timezone"}',
      '{"code":"INVALID_REQUEST","field":"timezone"}',
      '{"code":"INVALID_REQUEST"}',
      '{"code":"INVALID_REQUEST"}',
      '{"code":"IDEMPOTENCY_CONFLICT"}',
    ]);
    expect(pins.map((pin) => pin.headers.connection)).toEqual([
      ...Array.from({ length: 7 }, () => "keep-alive"),
      "close",
      "keep-alive",
    ]);
    expect(pins.at(-1)?.status).toBe(409);
    const past = cases.find((one) => one.name === "a body past the limit");
    expect(Buffer.byteLength(past?.body ?? "")).toBeGreaterThan(128 * 1024);
  });

  it("makes a new key for the club in each table, so each phase makes its own", () => {
    expect(createClubCases("Made 1").at(-1)?.key).not.toBe(cases.at(-1)?.key);
  });

  it("holds the ordinary request, a key and no body, to the contract's refusal with no field", () => {
    expect(pinnedProblems(sent(CREATE_CLUB_NO_BODY), CREATE_CLUB_NO_BODY)).toEqual([]);
    expect(CREATE_CLUB_NO_BODY.body).toBe('{"code":"INVALID_REQUEST"}');
  });

  it("judges getClub and createClub and nothing else", () => {
    expect([...CLUB_JUDGED]).toEqual(["getClub", "createClub"]);
  });
});
