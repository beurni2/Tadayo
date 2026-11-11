/// <reference lib="esnext.temporal" />
// The account rows' judges, with no database (slice 8; spec 23; T14, T27, T53, T55; FQ13, FQ69; account.ts):
// what the gate, the viewer's `Me`, the viewer's clubs and the table of `updateMe` bodies expect of each
// session, and that each judge can fail: a wrong answer for each branch is refused, so a judge loosened to
// pass is seen here. The matrix runs the app against them (matrix.test.ts).

import { STATUS_CODES } from "node:http";
import { OPERATIONS } from "@tadayo/contracts";
import { describe, expect, it } from "vitest";
import {
  BEFORE_PROFILE,
  JUDGED,
  PUBLIC,
  cellExpected,
  clubsJudge,
  gateOf,
  sessionOf,
  updateMeCases,
  type Own,
  type Seen,
  type Session,
} from "./account.ts";
import { NEUTRAL, PROFILE_INCOMPLETE, UNAUTHENTICATED, pinned, pinnedProblems } from "./harness.ts";
import type { Answer, WorldFacts, WorldInvitation } from "./scanner.ts";

const answer = (body: unknown, status = 200): Answer => {
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
    },
    body: text,
  };
};

/** The problems `expected` finds in `sent`: a pinned answer's, or a judge's. */
const problems = (sent: Answer, expected: ReturnType<typeof cellExpected>) =>
  typeof expected === "function" ? expected(sent) : pinnedProblems(sent, expected);

describe("the gate's classes are this file's own copy of the contract's (T58)", () => {
  it("names the operations the contract marks public, and those it marks beforeProfile", () => {
    expect([...PUBLIC].sort()).toEqual(
      OPERATIONS.filter((one) => one.public === true)
        .map((one) => one.id)
        .sort(),
    );
    expect([...BEFORE_PROFILE].sort()).toEqual(
      OPERATIONS.filter((one) => one.beforeProfile === true)
        .map((one) => one.id)
        .sort(),
    );
    expect(PUBLIC.size).toBe(2);
    expect(BEFORE_PROFILE.size).toBe(9);
  });
});

describe("what the gate makes of an account, from its row", () => {
  it("lets an active account with a name and a confirmed age have a session, and tells the others apart", () => {
    expect(sessionOf({ state: "active", ageConfirmed: true, name: "Ana" })).toBe("active");
    expect(sessionOf({ state: "active", ageConfirmed: false, name: null })).toBe("unfinished");
    // A name needs the age (the schema keeps them so), but each missing part leaves the profile unfinished.
    expect(sessionOf({ state: "active", ageConfirmed: true, name: null })).toBe("unfinished");
    expect(sessionOf({ state: "active", ageConfirmed: false, name: "Ana" })).toBe("unfinished");
    expect(sessionOf({ state: "deleting", ageConfirmed: true, name: "Ana" })).toBe("deleting");
    expect(sessionOf({ state: "deleted", ageConfirmed: false, name: null })).toBe("deleting");
  });

  it("answers every route but the public ones with the one 401 to an account whose deletion has begun (T27)", () => {
    for (const operation of OPERATIONS) {
      expect(gateOf("deleting", operation), operation.id).toBe(operation.public === true ? undefined : UNAUTHENTICATED);
    }
  });

  it("answers an unfinished account with the 403 on every route that isn't public or beforeProfile (FQ13, FQ69)", () => {
    for (const operation of OPERATIONS) {
      const open = operation.public === true || operation.beforeProfile === true;
      expect(gateOf("unfinished", operation), operation.id).toBe(open ? undefined : PROFILE_INCOMPLETE);
    }
  });

  it("lets an active account through every route", () => {
    for (const operation of OPERATIONS) expect(gateOf("active", operation), operation.id).toBeUndefined();
  });
});

describe("what each cell of each session must get from an ordinary request", () => {
  const seen = (): Seen => {
    throw new Error("a pinned answer reads no facts");
  };

  it("pins the neutral not-found for every route no slice has built, and the gate's answers", () => {
    for (const operation of OPERATIONS) {
      const active = cellExpected("active", operation, seen);
      expect(active === NEUTRAL, operation.id).toBe(!JUDGED.has(operation.id));
      const gate = gateOf("deleting", operation);
      expect(cellExpected("deleting", operation, seen), operation.id).toBe(gate ?? active);
    }
    expect([...JUDGED].sort()).toEqual(["getMe", "listClubs", "updateMe"]);
  });

  it("pins updateMe's 400 for an update with no body, and judges getMe by its status", () => {
    const noBody = cellExpected("active", { id: "updateMe" }, seen);
    expect(problems(answer({ code: "INVALID_REQUEST" }, 400), noBody)).toEqual([]);
    expect(problems(answer({ code: "INVALID_REQUEST", field: "expected_version" }, 400), noBody)).not.toEqual([]);
    expect(problems(answer({ code: "NOT_FOUND" }, 404), noBody)).not.toEqual([]);
    const getMe = cellExpected("unfinished", { id: "getMe" }, seen);
    expect(problems(answer({ id: "acct_x" }), getMe)).toEqual([]);
    expect(problems(answer({ code: "NOT_FOUND" }, 404), getMe)).not.toEqual([]);
    expect(cellExpected("unfinished", { id: "listClubs" }, seen)).toBe(PROFILE_INCOMPLETE);
  });
});

describe("the viewer's clubs and invitations (clubsJudge)", () => {
  const at = Temporal.Instant.from("2026-11-07T06:59:59.999999Z");
  const member = (club: string, left: string | null = null) => ({
    club,
    name: null,
    joinedAt: Temporal.Instant.from("2026-10-01T10:00:00Z"),
    leftAt: left === null ? null : Temporal.Instant.from(left),
  });
  const invitation = (over: Partial<WorldInvitation> = {}): WorldInvitation => ({
    boundTo: "acct_me",
    club: "clb_two",
    joined: false,
    clubName: "Two",
    inviterName: "Ana",
    ...over,
  });
  const world: WorldFacts = {
    drops: new Map(),
    days: new Map(),
    // The viewer is in club one, with two others, and left club three; club two has the invitation.
    members: new Map([
      ["itv_me", member("clb_one")],
      ["itv_a", member("clb_one")],
      ["itv_b", member("clb_one")],
      ["itv_gone", member("clb_one", "2026-10-02T10:00:00Z")],
      ["itv_old", member("clb_three", "2026-10-05T10:00:00Z")],
      ["itv_c", member("clb_three")],
    ]),
    clubs: new Map(),
    reservations: new Map(),
    canaries: new Map(),
    accounts: new Map(),
    invitations: new Map([
      ["inv_mine", invitation()],
      ["inv_used", invitation({ joined: true })],
      ["inv_other", invitation({ boundTo: "acct_them" })],
      ["inv_nameless", invitation({ inviterName: null })],
    ]),
  };
  const judge = clubsJudge(() => ({
    world,
    viewer: { account: "acct_me", intervals: new Set(["itv_me", "itv_old"]), texts: new Set() },
    now: at,
  }));
  const club = (id: string, count: number) => ({ id, member_count: count });
  const listing = (clubs: unknown[], invitations: unknown[], instant = "2026-11-07T06:59:59Z") => ({
    server_now: instant,
    clubs,
    invitations,
  });
  const right = listing([club("clb_one", 3)], [{ invitation_id: "inv_mine" }]);

  it("passes the clubs of the viewer's active intervals, counted by their active members, and the invitations they accepted", () => {
    expect(judge(answer(right))).toEqual([]);
    expect(
      judge(answer(listing([club("clb_one", 3)], [{ invitation_id: "inv_mine" }], "2026-11-07T06:59:59Z"))),
    ).toEqual([]);
  });

  it("refuses a missing club, another's, a club the viewer left and a count that isn't the active members' (T7, T14)", () => {
    expect(judge(answer(listing([], [{ invitation_id: "inv_mine" }])))).toEqual(["the clubs lacks clb_one"]);
    expect(judge(answer(listing([club("clb_one", 3), club("clb_two", 1)], [{ invitation_id: "inv_mine" }])))).toEqual([
      "the clubs holds clb_two, which aren't the viewer's",
    ]);
    expect(judge(answer(listing([club("clb_one", 3), club("clb_three", 1)], [{ invitation_id: "inv_mine" }])))).toEqual(
      ["the clubs holds clb_three, which aren't the viewer's"],
    );
    expect(judge(answer(listing([club("clb_one", 4)], [{ invitation_id: "inv_mine" }])))).toEqual([
      "a club says 4 members, not 3",
    ]);
    expect(judge(answer(listing([club("clb_one", 3), club("clb_one", 3)], [{ invitation_id: "inv_mine" }])))).toEqual([
      "the clubs lists one twice",
    ]);
  });

  it("refuses an invitation that is missing, another account's, used already or with no one to name, and a repeated one", () => {
    const clubs = [club("clb_one", 3)];
    expect(judge(answer(listing(clubs, [])))).toEqual(["the invitations lacks inv_mine"]);
    for (const wrong of ["inv_other", "inv_used", "inv_nameless", "inv_nowhere"])
      expect(judge(answer(listing(clubs, [{ invitation_id: "inv_mine" }, { invitation_id: wrong }]))), wrong).toEqual([
        `the invitations holds ${wrong}, which aren't the viewer's`,
      ]);
    expect(judge(answer(listing(clubs, [{ invitation_id: "inv_mine" }, { invitation_id: "inv_mine" }])))).toEqual([
      "the invitations lists one twice",
    ]);
  });

  it("refuses an instant that isn't the server's, in whole seconds, and an answer that isn't the lists", () => {
    expect(
      judge(answer(listing([club("clb_one", 3)], [{ invitation_id: "inv_mine" }], "2026-11-07T07:00:00Z"))),
    ).toEqual(["server_now is 2026-11-07T07:00:00Z, not the server's 2026-11-07T06:59:59Z"]);
    expect(judge(answer({ clubs: [], invitations: [] }))).toEqual([
      "server_now is nothing, not the server's 2026-11-07T06:59:59Z",
      "the clubs lacks clb_one",
      "the invitations lacks inv_mine",
    ]);
    expect(judge(answer({ code: "NOT_FOUND" }, 404))).toEqual(["status 404, not the viewer's clubs"]);
    expect(judge(answer({ clubs: "all" }))).toEqual(["not the viewer's clubs and invitations"]);
    expect(judge({ ...right_(), body: "{bad" })).toEqual(["not the viewer's clubs and invitations"]);
  });

  function right_(): Answer {
    return answer(right);
  }

  it("expects nothing for a caller with no account, whatever the world holds", () => {
    const stranger = clubsJudge(() => ({
      world,
      viewer: { account: null, intervals: new Set(), texts: new Set() },
      now: at,
    }));
    expect(stranger(answer(listing([], [])))).toEqual([]);
    expect(stranger(answer(listing([], [{ invitation_id: "inv_mine" }])))).toEqual([
      "the invitations holds inv_mine, which aren't the viewer's",
    ]);
  });
});

describe("the table of updateMe bodies each session sends (updateMeCases)", () => {
  const own: Own = {
    pending: "upl_pending",
    ready: { id: "upl_ready", version: "v_ready" },
    foreign: "upl_foreign",
    photo: "upl_photo",
    guessed: "upl_guessed",
    name: "Renamed",
  };
  const sessions: Session[] = ["active", "unfinished", "deleting"];
  const cases = (session: Session, last = false) => updateMeCases(session, own, last);
  const asked = (session: Session, name: string, version = 4, last = false) => {
    const found = cases(session, last).find((one) => one.name === name);
    if (found === undefined) throw new Error(`${session} has no case ${name}`);
    return { ...found.request(version), found };
  };
  const body = (session: Session, name: string, version = 4, last = false) =>
    JSON.parse(asked(session, name, version, last).body) as unknown;

  it("sends the same bodies to each session, but the finish, and every body of the deleting one is the gate's 401 (T27)", () => {
    const names = (session: Session, last = false) => cases(session, last).map((one) => one.name);
    expect(names("active")).toEqual(names("deleting"));
    for (const one of cases("deleting")) {
      const { expected } = one.request(4);
      expect(expected, one.name).toBe(UNAUTHENTICATED);
      expect(one.mutates, one.name).toBe(false);
    }
    expect(names("unfinished")).not.toContain("the viewer's own avatar, ready");
    expect(names("unfinished")).not.toContain("the age and a name: the profile is finished");
    expect(names("unfinished", true)).toContain("the age and a name: the profile is finished");
    expect(names("active", true)).not.toContain("the age and a name: the profile is finished");
  });

  it("changes the account only in the cases that say so, and puts those last", () => {
    for (const session of sessions) {
      const all = cases(session, true);
      const flags = all.map((one) => one.mutates);
      expect(flags, session).toEqual([...flags].sort((a, b) => Number(a) - Number(b)));
    }
    expect(
      cases("active")
        .filter((one) => one.mutates)
        .map((one) => one.name),
    ).toEqual(["the viewer's own avatar, ready", "a new name"]);
    expect(
      cases("unfinished", true)
        .filter((one) => one.mutates)
        .map((one) => one.name),
    ).toEqual(["the age and a name: the profile is finished"]);
    expect(cases("unfinished").filter((one) => one.mutates)).toEqual([]);
  });

  it("sends each body with the account's version when it is sent: a stale one asks for the next", () => {
    expect(body("active", "a version that isn't the account's", 4)).toEqual({
      expected_version: 5,
      display_name: "Renamed",
    });
    expect(body("active", "a version that isn't the account's", 9)).toEqual({
      expected_version: 10,
      display_name: "Renamed",
    });
    expect(body("active", "a new name", 7)).toEqual({ expected_version: 7, display_name: "Renamed" });
    // A lone surrogate, as JSON.parse gives it back from its escape.
    expect(body("active", "a name that isn't well formed")).toEqual({ expected_version: 4, display_name: "A\ud800B" });
    // The route's limit is 8 KiB: a body past it, by a little, so every cell that sends one stays cheap.
    const long = asked("active", "a body past the route's limit").body;
    expect(Buffer.byteLength(long)).toBeGreaterThan(8 * 1024);
    expect(Buffer.byteLength(long)).toBeLessThan(9 * 1024);
    expect(body("active", "another account's avatar")).toEqual({
      expected_version: 4,
      avatar_upload_id: "upl_foreign",
    });
    expect(body("active", "an upload that names nothing")).toEqual({
      expected_version: 4,
      avatar_upload_id: "upl_guessed",
    });
    expect(body("active", "a drop's photo")).toEqual({ expected_version: 4, avatar_upload_id: "upl_photo" });
    expect(body("active", "the viewer's own avatar, not ready")).toEqual({
      expected_version: 4,
      avatar_upload_id: "upl_pending",
    });
    expect(body("active", "the viewer's own avatar, ready")).toEqual({
      expected_version: 4,
      avatar_upload_id: "upl_ready",
    });
    expect(body("unfinished", "the age and a name: the profile is finished", 0, true)).toEqual({
      expected_version: 0,
      age_confirmed: true,
      display_name: "Renamed",
    });
  });

  it("pins each refusal byte for byte: the code and the field, never a value (T55)", () => {
    const pin = (session: Session, name: string, version: number) => {
      const { expected } = asked(session, name, version);
      if (typeof expected === "function") throw new Error(`${name} isn't pinned`);
      return expected;
    };
    expect(pin("active", "a name the contract refuses", 4).body).toBe(
      '{"code":"INVALID_REQUEST","field":"display_name"}',
    );
    expect(pin("active", "a field the contract doesn't have", 4).body).toBe('{"code":"INVALID_REQUEST"}');
    expect(pin("active", "a name that isn't well formed", 4).body).toBe(
      '{"code":"INVALID_REQUEST","field":"display_name"}',
    );
    // Past the route's limit the body is never read: no field is named, and Fastify closes the connection.
    expect(pin("active", "a body past the route's limit", 4)).toEqual(
      pinned(400, "Bad Request", '{"code":"INVALID_REQUEST"}', "close"),
    );
    expect(pin("active", "a body past the route's limit", 4).headers.connection).toBe("close");
    expect(pin("active", "a field the contract doesn't have", 4).headers.connection).toBe("keep-alive");
    expect(pin("active", "a version that isn't the account's", 4)).toEqual(
      pinned(409, "Conflict", '{"code":"VERSION_CONFLICT","current_version":4}'),
    );
    expect(pin("active", "the viewer's own avatar, not ready", 4).body).toBe('{"code":"MEDIA_NOT_READY"}');
    for (const name of ["another account's avatar", "an upload that names nothing", "a drop's photo"])
      expect(pin("active", name, 4), name).toBe(NEUTRAL);
    // Before the age is confirmed a name or an avatar is refused by the field, whichever upload it names.
    expect(pin("unfinished", "a name before the age is confirmed", 0).body).toBe(
      '{"code":"INVALID_REQUEST","field":"display_name"}',
    );
    for (const name of [
      "another account's avatar",
      "an upload that names nothing",
      "a drop's photo",
      "the viewer's own avatar, not ready",
    ])
      expect(pin("unfinished", name, 0).body, name).toBe('{"code":"INVALID_REQUEST","field":"avatar_upload_id"}');
  });

  it("groups the bodies that must get the same bytes: an upload that isn't the viewer's avatar, whoever's it is (T14)", () => {
    const group = (session: Session, name: string) => cases(session).find((one) => one.name === name)?.group;
    const same = ["another account's avatar", "an upload that names nothing", "a drop's photo"];
    expect(new Set(same.map((name) => group("active", name))).size).toBe(1);
    expect(group("active", same[0] ?? "")).toBeDefined();
    expect(group("active", "the viewer's own avatar, not ready")).not.toBe(group("active", same[0] ?? ""));
    expect(new Set(same.map((name) => group("unfinished", name))).size).toBe(1);
  });

  it("judges a change by what it set, and refuses an answer that isn't the account's Me", () => {
    const judge = (name: string, sent: Answer) => problems(sent, asked("active", name).expected);
    expect(
      judge("a new name", answer({ id: "acct_x", display_name: "Renamed", age_confirmed: true, version: 5 })),
    ).toEqual([]);
    expect(
      judge("a new name", answer({ id: "acct_x", display_name: "Other", age_confirmed: true, version: 5 })),
    ).toEqual(["Me's display_name isn't what the request set"]);
    expect(judge("a new name", answer({ code: "VERSION_CONFLICT", current_version: 5 }, 409))).toEqual([
      "status 409, not the account's Me",
    ]);
    expect(
      judge(
        "the viewer's own avatar, ready",
        answer({ id: "acct_x", avatar_version: "v_ready", age_confirmed: true, version: 5 }),
      ),
    ).toEqual([]);
    expect(judge("the viewer's own avatar, ready", answer({ id: "acct_x", age_confirmed: true, version: 5 }))).toEqual([
      "Me's avatar_version isn't what the request set",
    ]);
    const finish = asked("unfinished", "the age and a name: the profile is finished", 0, true).expected;
    expect(
      problems(answer({ id: "acct_x", display_name: "Renamed", age_confirmed: true, version: 1 }), finish),
    ).toEqual([]);
    expect(
      problems(answer({ id: "acct_x", display_name: "Renamed", age_confirmed: false, version: 1 }), finish),
    ).toEqual(["Me's age_confirmed isn't what the request set"]);
  });
});
