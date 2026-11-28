/// <reference lib="esnext.temporal" />
// The roster's judges, judged (./roster.ts): each branch of what a cell must get from getRosterRevision,
// proposeRoster, createInvitation, revokeInvitation, approveRoster, declineRoster and removeCandidate is shown to refuse
// an answer that breaks it, on a world written out here by hand, with no database.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ClubRows } from "./club.ts";
import { NEUTRAL, pinned, type Expected } from "./harness.ts";
import {
  IDEMPOTENCY_CONFLICT,
  NO_SUCH_VERSION,
  ROSTER_JUDGED,
  candidateRemovalExpected,
  candidateRemovalOutcome,
  decisionOutcome,
  genericDecisionExpected,
  genericProposal,
  genericProposalExpected,
  invalidRequest,
  linkOutcome,
  madeLink,
  newestOf,
  proposalOutcome,
  proposeCases,
  replayedLink,
  revisionExpected,
  revisionFor,
  revokeExpected,
  revokeOutcome,
  revokedBody,
  removedCandidateBody,
  sameAnswer,
  type CandidateRows,
  type LinkRows,
  type RevisionRows,
  type RosterSeen,
  type RosterWorld,
} from "./roster.ts";
import type { Answer } from "./scanner.ts";
import type { ScheduleMember, ScheduleWorld } from "./schedule.ts";

const CLUB = "clb_here";
/** Friday 6 November 2026, 9:41 AM in New York, with a fraction the contract rounds down. */
const NOW = Temporal.Instant.from("2026-11-06T14:41:00.5Z");
const LATER = Temporal.Instant.from("2026-11-13T14:41:00Z");
const TOKEN = "t".repeat(43);
const sha256 = (token: string) => createHash("sha256").update(token).digest("hex");

function member(
  account: string,
  name: string | null,
  joined: string,
  more: Partial<ScheduleMember> = {},
): ScheduleMember {
  return { club: CLUB, account, active: true, joinedAt: Temporal.Instant.from(joined), name, avatar: null, ...more };
}

/** Ana, Ben and Cleo, in the order they joined; Dee joined after the revision was made; Eve left. */
function world(): ScheduleWorld {
  return {
    clubs: new Map([[CLUB, { name: "The Saturdays", timezone: "America/New_York", suspended: false }]]),
    members: new Map([
      ["itv_cleo", member("usr_cleo", "Cleo", "2026-10-03T00:00:00Z")],
      ["itv_ana", member("usr_ana", "Ana", "2026-10-01T00:00:00Z", { avatar: "v_ana" })],
      ["itv_ben", member("usr_ben", "Ben", "2026-10-02T00:00:00Z")],
      ["itv_dee", member("usr_dee", "Dee", "2026-11-01T00:00:00Z")],
      ["itv_eve", member("usr_eve", "Eve", "2026-10-04T00:00:00Z", { active: false })],
    ]),
    activeAccounts: new Set(["usr_ana", "usr_ben", "usr_cleo", "usr_dee", "usr_eve", "usr_zed"]),
    versions: [],
    proposals: new Map(),
  };
}

function link(more: Partial<LinkRows> = {}): LinkRows {
  return {
    id: "inv_mo",
    candidate: "cand_mo",
    club: CLUB,
    proposer: "itv_ben",
    expiresAt: LATER,
    revoked: false,
    replaced: false,
    bound: false,
    boundTo: null,
    boundName: null,
    hash: sha256(TOKEN),
    ...more,
  };
}

function revision(more: Partial<RevisionRows> = {}): RevisionRows {
  return {
    club: CLUB,
    state: "open",
    version: 1,
    origin: "proposal",
    proposer: "itv_ben",
    sealed: true,
    supersededBy: null,
    members: ["itv_cleo", "itv_ben", "itv_ana"],
    candidates: [
      { id: "cand_mo", label: "Mo", proposer: "itv_ben", acceptedWith: null },
      { id: "cand_lu", label: "Lu", proposer: "itv_ana", acceptedWith: null },
    ],
    decisions: new Map([
      ["itv_ben", "approved"],
      ["itv_cleo", "declined"],
    ]),
    ...more,
  };
}

const roster = (
  links: LinkRows[] = [link()],
  revisions: [string, RevisionRows][] = [["rev_1", revision()]],
): RosterWorld => ({
  revisions: new Map(revisions),
  links: new Map(links.map((one) => [one.id, one])),
  candidates: new Map(
    revisions.flatMap(([, rows]) =>
      rows.candidates.map((one): [string, CandidateRows] => [
        one.id,
        { club: rows.club, state: "open", proposer: one.proposer },
      ]),
    ),
  ),
});

const rows = (rosterVersion = 5, openCandidates = 2): ClubRows =>
  new Map([[CLUB, { activated: true, rosterVersion, openCandidates, openRevision: "rev_1" }]]);

const person = (interval: string, name: string, avatar?: string) => ({
  membership_id: interval,
  display_name: name,
  ...(avatar === undefined ? {} : { avatar_version: avatar }),
});

/** The revision as Ben, who proposed it and Mo, reads it. */
const want = {
  id: "rev_1",
  version: 1,
  club: { id: CLUB, name: "The Saturdays", timezone: "America/New_York", my_membership_id: "itv_ben" },
  state: "open",
  proposed_by: person("itv_ben", "Ben"),
  members: [person("itv_ana", "Ana", "v_ana"), person("itv_ben", "Ben"), person("itv_cleo", "Cleo")],
  candidates: [
    {
      id: "cand_mo",
      name: "Mo",
      proposed_by: person("itv_ben", "Ben"),
      invitation: { id: "inv_mo", state: "live", expires_at: "2026-11-13T14:41:00Z" },
    },
    { id: "cand_lu", name: "Lu", proposed_by: person("itv_ana", "Ana", "v_ana") },
  ],
  my_decision: "approved",
};

/** An answer as the app sends it, with its Date where the app puts it (harness.ts, NEUTRAL_ORDER). */
function sent(answer: Answer, more: Record<string, string> = {}): Answer {
  const { connection, ...headers } = { ...answer.headers, ...more };
  return { ...answer, headers: { ...headers, date: new Date().toUTCString(), connection: connection ?? "keep-alive" } };
}
const ok = (body: unknown, headers: Record<string, string> = {}): Answer =>
  sent(pinned(200, "OK", JSON.stringify(body)), headers);
const made = (body: unknown, headers: Record<string, string> = {}): Answer =>
  sent(pinned(201, "Created", JSON.stringify(body)), headers);
const NOT_FOUND = sent(NEUTRAL);

function judging(expected: Expected): (answer: Answer) => string[] {
  if (typeof expected !== "function") throw new Error("the roster's judge reads its cell: it is never a pinned answer");
  return expected;
}

const seen =
  (account: string | null, schedule = world(), rosterRows = roster(), clubRows = rows()) =>
  (): RosterSeen => ({ schedule, account, now: NOW, roster: rosterRows, rows: clubRows });

/** `body` without its `key`. */
const without = (body: Record<string, unknown>, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(body).filter(([name]) => name !== key));

const stateOf = (found: Record<string, unknown> | undefined, index = 0) =>
  (
    (found?.["candidates"] as Record<string, unknown>[])[index]?.["invitation"] as Record<string, unknown> | undefined
  )?.["state"];

describe("a revision's RosterRevision from the world's rows (getRosterRevision)", () => {
  it("judges the seven routes of the roster", () => {
    expect([...ROSTER_JUDGED].sort()).toEqual([
      "approveRoster",
      "createInvitation",
      "declineRoster",
      "getRosterRevision",
      "proposeRoster",
      "removeCandidate",
      "revokeInvitation",
    ]);
  });

  it("is the revision for its proposer: members in the order they joined, candidates by position, the viewer's own link and decision", () => {
    expect(revisionFor(world(), roster(), "rev_1", "usr_ben", NOW)).toEqual(want);
  });

  it("shows each member only the link of a candidate that member proposed, and that member's own decision (handoff 1, T15)", () => {
    const anas = link({ id: "inv_lu", candidate: "cand_lu", proposer: "itv_ana" });
    const both = roster([link(), anas]);
    const toAna = revisionFor(world(), both, "rev_1", "usr_ana", NOW);
    expect(stateOf(toAna, 0)).toBeUndefined();
    expect(stateOf(toAna, 1)).toBe("live");
    expect(toAna?.["my_decision"]).toBe("pending");
    const toCleo = revisionFor(world(), both, "rev_1", "usr_cleo", NOW);
    expect(stateOf(toCleo, 0)).toBeUndefined();
    expect(stateOf(toCleo, 1)).toBeUndefined();
    expect(toCleo?.["my_decision"]).toBe("declined");
    expect((toCleo?.["club"] as Record<string, unknown>)["my_membership_id"]).toBe("itv_cleo");
  });

  it("is nothing to anyone the revision doesn't list as an active member (FQ119), or of a revision not sealed", () => {
    // Dee joined after it; Eve left; Zed is in no club; nobody is signed in; the club is suspended; the account isn't active.
    for (const account of ["usr_dee", "usr_eve", "usr_zed", null]) {
      expect(revisionFor(world(), roster(), "rev_1", account, NOW)).toBeUndefined();
    }
    const listed = roster([link()], [["rev_1", revision({ members: ["itv_ana", "itv_ben", "itv_cleo", "itv_eve"] })]]);
    expect(revisionFor(world(), listed, "rev_1", "usr_eve", NOW)).toBeUndefined();
    const suspended = world();
    suspended.clubs.set(CLUB, { name: "The Saturdays", timezone: "America/New_York", suspended: true });
    expect(revisionFor(suspended, roster(), "rev_1", "usr_ben", NOW)).toBeUndefined();
    const deleting = world();
    deleting.activeAccounts.delete("usr_ben");
    expect(revisionFor(deleting, roster(), "rev_1", "usr_ben", NOW)).toBeUndefined();
    expect(
      revisionFor(world(), roster([link()], [["rev_1", revision({ sealed: false })]]), "rev_1", "usr_ben", NOW),
    ).toBeUndefined();
    expect(revisionFor(world(), roster(), "rev_none", "usr_ben", NOW)).toBeUndefined();
  });

  it("leaves a member with no name out, and serves no revision whose proposer or a candidate's proposer has none (FQ75)", () => {
    const nameless = (interval: string) => {
      const w = world();
      const one = w.members.get(interval);
      if (one === undefined) throw new Error(interval);
      w.members.set(interval, { ...one, name: null });
      return w;
    };
    expect(revisionFor(nameless("itv_cleo"), roster(), "rev_1", "usr_ben", NOW)?.["members"]).toEqual([
      person("itv_ana", "Ana", "v_ana"),
      person("itv_ben", "Ben"),
    ]);
    expect(revisionFor(nameless("itv_ben"), roster(), "rev_1", "usr_ana", NOW)).toBeUndefined();
    expect(revisionFor(nameless("itv_ana"), roster(), "rev_1", "usr_ben", NOW)).toBeUndefined();
  });

  it("says where the candidate's latest link stands: accepted, used, revoked, expired at its instant, live before it", () => {
    const state = (one: LinkRows, acceptedWith: string | null = null, now = NOW) =>
      stateOf(
        revisionFor(
          world(),
          roster(
            [one],
            [["rev_1", revision({ candidates: [{ id: "cand_mo", label: "Mo", proposer: "itv_ben", acceptedWith }] })]],
          ),
          "rev_1",
          "usr_ben",
          now,
        ),
      );
    expect(state(link({ bound: true, revoked: true }), "inv_mo")).toBe("accepted");
    expect(state(link({ bound: true, revoked: true }))).toBe("used");
    expect(state(link({ bound: true }), "inv_other")).toBe("used");
    expect(state(link({ revoked: true }), null, LATER)).toBe("revoked");
    expect(state(link(), null, LATER)).toBe("expired");
    expect(state(link(), null, LATER.subtract({ nanoseconds: 1 }))).toBe("live");
    // A replaced link is never the one shown.
    expect(state(link({ replaced: true }))).toBeUndefined();
  });

  it("names the revision that superseded it", () => {
    const old = roster([link()], [["rev_1", revision({ state: "superseded", version: 2, supersededBy: "rev_2" })]]);
    expect(revisionFor(world(), old, "rev_1", "usr_ben", NOW)).toEqual({
      ...want,
      state: "superseded",
      version: 2,
      superseded_by: "rev_2",
    });
  });
});

describe("getRosterRevision's judge in a cell", () => {
  const judge = judging(revisionExpected(seen("usr_ben"), "rev_1"));

  it("passes the revision, and refuses each field that differs, one more or one fewer", () => {
    expect(judge(ok(want))).toEqual([]);
    expect(judge(ok({ ...want, my_decision: "pending" }))).toHaveLength(1);
    expect(judge(ok({ ...want, approvals: 2 }))).toEqual(["the roster revision's approvals is 2, not undefined"]);
    expect(judge(ok({ ...want, superseded_by: "rev_2" }))).toHaveLength(1);
    expect(judge(ok({ ...want, members: [...want.members].reverse() }))).toHaveLength(1);
    expect(judge(ok({ ...want, candidates: [...want.candidates].reverse() }))).toHaveLength(1);
    const withoutLink = [{ id: "cand_mo", name: "Mo", proposed_by: person("itv_ben", "Ben") }, want.candidates[1]];
    expect(judge(ok({ ...want, candidates: withoutLink }))).toHaveLength(1);
    const accepted = [
      { ...want.candidates[0], invitation: { id: "inv_mo", state: "accepted", expires_at: "2026-11-13T14:41:00Z" } },
      want.candidates[1],
    ];
    expect(judge(ok({ ...want, candidates: accepted }))).toHaveLength(1);
    expect(judge(ok(without(want, "my_decision")))).toHaveLength(1);
  });

  it("refuses another status, a body that isn't the revision, and one that may be stored", () => {
    expect(judge(NOT_FOUND)).toEqual(["status 404, not 200 with the roster revision"]);
    expect(judge(made(want))).toEqual(["status 201, not 200 with the roster revision"]);
    expect(judge(ok("rev_1"))).toEqual(["not the roster revision"]);
    expect(judge({ ...ok(want), body: "{bad" })).toEqual(["not the roster revision"]);
    expect(judge(ok(want, { "cache-control": "private" }))).toEqual(["the roster revision without private, no-store"]);
  });

  it("holds everyone else to the neutral not-found, byte for byte: another member reads their own, never the proposer's", () => {
    const dee = judging(revisionExpected(seen("usr_dee"), "rev_1"));
    expect(dee(NOT_FOUND)).toEqual([]);
    expect(dee(ok(want))).not.toEqual([]);
    expect(dee(sent(pinned(403, "Forbidden", '{"code":"NOT_ALLOWED"}')))).not.toEqual([]);
    // Asked for by another account than the cell's viewer.
    const asCleo = judging(revisionExpected(seen("usr_ben"), "rev_1", "usr_cleo"));
    expect(asCleo(ok(want))).not.toEqual([]);
    expect(asCleo(ok(revisionFor(world(), roster(), "rev_1", "usr_cleo", NOW)))).toEqual([]);
    expect(judging(revisionExpected(seen("usr_ben"), "rev_1", "usr_zed"))(NOT_FOUND)).toEqual([]);
  });

  it("names each field that differs (sameAnswer)", () => {
    const same = sameAnswer("the thing", 201, { a: 1, b: [1, 2] });
    expect(same(made({ a: 1, b: [1, 2] }))).toEqual([]);
    expect(same(made({ a: 2, b: [1, 2], c: null }))).toEqual([
      "the thing's a is 2, not 1",
      "the thing's c is null, not undefined",
    ]);
    expect(same(ok({ a: 1, b: [1, 2] }))).toEqual(["status 200, not 201 with the thing"]);
  });
});

describe("what a proposal must get (proposeRoster)", () => {
  const outcome = (account: string | null, expected: number, count: number, clubRows = rows(), w = world()) =>
    proposalOutcome(w, clubRows, CLUB, account, expected, count);
  const body = (answer: Answer | "created") => (answer === "created" ? answer : answer.body);

  it("is the neutral not-found to anyone who isn't an active member, whatever the version", () => {
    for (const account of ["usr_eve", "usr_zed", null]) {
      expect(outcome(account, 5, 1)).toBe(NEUTRAL);
      expect(outcome(account, 4, 1)).toBe(NEUTRAL);
    }
    expect(proposalOutcome(world(), rows(), "clb_none", "usr_ben", 5, 1)).toBe(NEUTRAL);
  });

  it("holds the version to the club's first, then six to its members and open candidates (A01, T6)", () => {
    // Four active members and two open candidates: full.
    expect(body(outcome("usr_ben", 4, 1))).toBe('{"code":"VERSION_CONFLICT","current_version":5}');
    expect(body(outcome("usr_ben", 4, 9))).toBe('{"code":"VERSION_CONFLICT","current_version":5}');
    expect(body(outcome("usr_ben", 5, 1))).toBe('{"code":"CLUB_FULL"}');
    expect(outcome("usr_ben", 5, 1, rows(5, 1))).toBe("created");
    expect(body(outcome("usr_ben", 5, 2, rows(5, 1)))).toBe('{"code":"CLUB_FULL"}');
    expect(outcome("usr_ben", 5, 2, rows(5, 0))).toBe("created");
    // Someone who left isn't counted.
    const five = world();
    five.members.set("itv_fay", member("usr_fay", "Fay", "2026-10-05T00:00:00Z"));
    expect(body(outcome("usr_ben", 5, 1, rows(5, 1), five))).toBe('{"code":"CLUB_FULL"}');
  });

  it("judges the generic request at a version no club is at, and says so when it would change the world", () => {
    expect(genericProposal("Mo")).toEqual({ expected_roster_version: NO_SUCH_VERSION, add: [{ label: "Mo" }] });
    const conflict = sent(pinned(409, "Conflict", '{"code":"VERSION_CONFLICT","current_version":5}'));
    const judge = judging(genericProposalExpected(seen("usr_ben"), CLUB));
    expect(judge(conflict)).toEqual([]);
    expect(judge(NOT_FOUND)).not.toEqual([]);
    expect(judge(made(want))).not.toEqual([]);
    const outsider = judging(genericProposalExpected(seen("usr_zed"), CLUB));
    expect(outsider(NOT_FOUND)).toEqual([]);
    expect(outsider(conflict)).not.toEqual([]);
    const reached = judging(
      genericProposalExpected(seen("usr_ben", world(), roster(), rows(NO_SUCH_VERSION, 0)), CLUB),
    );
    expect(reached(conflict)).toEqual(["the judge's own generic request would change the world"]);
  });

  it("sends what the contract refuses, a stale version, the proposal, its retry and another body under its key", () => {
    const cases = proposeCases(5, "Mo");
    expect(cases.map((one) => (typeof one.expected === "string" ? one.expected : one.expected.body))).toEqual([
      '{"code":"INVALID_REQUEST","field":"Idempotency-Key"}',
      '{"code":"INVALID_REQUEST","field":"add"}',
      '{"code":"INVALID_REQUEST","field":"add"}',
      '{"code":"INVALID_REQUEST"}',
      "stale",
      "proposal",
      "replay",
      "other",
    ]);
    expect(cases[0]?.key).toBeNull();
    const [proposal, replay, other] = cases.slice(5);
    expect(replay?.key).toBe(proposal?.key);
    expect(other?.key).toBe(proposal?.key);
    expect(replay?.body).toBe(proposal?.body);
    expect(other?.body).not.toBe(proposal?.body);
    expect(new Set(cases.map((one) => one.key)).size).toBe(6);
    expect(JSON.parse(cases[4]?.body ?? "")).toEqual({ expected_roster_version: 6, add: [{ label: "Mo" }] });
    expect(JSON.parse(proposal?.body ?? "")).toEqual({ expected_roster_version: 5, add: [{ label: "Mo" }] });
    expect(IDEMPOTENCY_CONFLICT.body).toBe('{"code":"IDEMPOTENCY_CONFLICT"}');
    expect(invalidRequest().status).toBe(400);
  });
});

describe("who approves and who declines (approveRoster, declineRoster)", () => {
  const decide = (account: string | null, rosterRows = roster(), expected = 1) =>
    decisionOutcome(world(), rosterRows, "rev_1", account, NOW, expected);
  const code = (outcome: unknown) => JSON.parse((outcome as Answer).body) as Record<string, unknown>;

  it("is the neutral not-found to anyone who can't read the revision, whatever the version (FQ119, T14)", () => {
    for (const account of ["usr_dee", "usr_eve", "usr_zed", null]) {
      expect(decide(account)).toBe(NEUTRAL);
      expect(decide(account, roster(), 9)).toBe(NEUTRAL);
    }
    expect(decide("usr_ana", roster([link()], [["rev_1", revision({ sealed: false })]]))).toBe(NEUTRAL);
    expect(decisionOutcome(world(), roster(), "rev_none", "usr_ana", NOW, 1)).toBe(NEUTRAL);
  });

  it("names the newest revision once a newer one replaced it, before the version is looked at", () => {
    const chain = roster(
      [link()],
      [
        ["rev_1", revision({ state: "superseded", version: 2, supersededBy: "rev_2" })],
        ["rev_2", revision({ state: "superseded", version: 2, supersededBy: "rev_3" })],
        ["rev_3", revision()],
      ],
    );
    expect(newestOf(chain, "rev_1")).toBe("rev_3");
    expect(newestOf(chain, "rev_3")).toBe("rev_3");
    expect(code(decide("usr_ana", chain, 9))).toEqual({ code: "ROSTER_CHANGED", current_id: "rev_3" });
    expect(code(decide("usr_ana", chain, 2))).toEqual({ code: "ROSTER_CHANGED", current_id: "rev_3" });
  });

  it("holds the version to the revision's", () => {
    expect(code(decide("usr_ana", roster(), 2))).toEqual({ code: "VERSION_CONFLICT", current_version: 1 });
  });

  it("takes a member's own decision once, on an open revision, and answers anything else as it stands", () => {
    expect(decide("usr_ana")).toBe("decides");
    // Ben approved by proposing, Cleo declined.
    expect(decide("usr_ben")).toBe("stands");
    expect(decide("usr_cleo")).toBe("stands");
    const ended = roster([link()], [["rev_1", revision({ state: "did_not_go_ahead", version: 2 })]]);
    expect(decide("usr_ana", ended, 2)).toBe("stands");
    expect(decide("usr_ana", roster([link()], [["rev_1", revision({ state: "applied", version: 2 })]]), 2)).toBe(
      "stands",
    );
  });

  it("judges the generic request at a version no revision is at, and says so when it would decide", () => {
    const judge = judging(genericDecisionExpected(seen("usr_ana"), "rev_1"));
    expect(judge(sent(pinned(409, "Conflict", '{"code":"VERSION_CONFLICT","current_version":1}')))).toEqual([]);
    expect(judge(NOT_FOUND)).not.toEqual([]);
    expect(judge(ok(want))).not.toEqual([]);
    expect(judging(genericDecisionExpected(seen("usr_zed"), "rev_1"))(NOT_FOUND)).toEqual([]);
    const reached = roster([link()], [["rev_1", revision({ version: NO_SUCH_VERSION })]]);
    expect(judging(genericDecisionExpected(seen("usr_ana", world(), reached), "rev_1"))(NOT_FOUND)).toEqual([
      "the judge's own generic decision would be taken",
    ]);
  });
});

describe("who makes and who revokes a link (createInvitation, revokeInvitation)", () => {
  it("lets only the member who proposed the candidate make its link, on the open revision (T14)", () => {
    const outcome = (account: string | null, candidate = "cand_mo", rosterRows = roster()) =>
      linkOutcome(world(), rosterRows, CLUB, candidate, account);
    expect(outcome("usr_ben")).toBe("made");
    for (const account of ["usr_ana", "usr_cleo", "usr_dee", "usr_eve", "usr_zed", null]) {
      expect(outcome(account)).toBe(NEUTRAL);
    }
    expect(outcome("usr_ben", "cand_lu")).toBe(NEUTRAL);
    expect(outcome("usr_ben", "cand_none")).toBe(NEUTRAL);
    // A revision no longer open has no candidate to make a link for.
    expect(outcome("usr_ben", "cand_mo", roster([link()], [["rev_1", revision({ state: "superseded" })]]))).toBe(
      NEUTRAL,
    );
    // A link an account accepted with can't be replaced (handoff 4); a revoked or expired one can.
    const used = outcome("usr_ben", "cand_mo", roster([link({ bound: true })]));
    expect(used === "made" ? used : used.body).toBe('{"code":"NOT_ALLOWED"}');
    expect(outcome("usr_ana", "cand_mo", roster([link({ bound: true })]))).toBe(NEUTRAL);
    expect(outcome("usr_ben", "cand_mo", roster([link({ revoked: true })]))).toBe("made");
    expect(outcome("usr_ben", "cand_mo", roster([link({ bound: true, replaced: true }), link({ id: "inv_2" })]))).toBe(
      "made",
    );
  });

  it("lets only that member revoke it, whatever its state, and never one an account accepted with", () => {
    const outcome = (account: string | null, rosterRows = roster(), id = "inv_mo") =>
      revokeOutcome(world(), rosterRows, id, account);
    expect(outcome("usr_ben")).toBe("revoked");
    expect(outcome("usr_ben", roster([link({ revoked: true, replaced: true })]))).toBe("revoked");
    for (const account of ["usr_ana", "usr_cleo", "usr_dee", "usr_eve", "usr_zed", null]) {
      expect(outcome(account)).toBe(NEUTRAL);
      expect(outcome(account, roster([link({ bound: true })]))).toBe(NEUTRAL);
    }
    expect(outcome("usr_ben", roster(), "inv_none")).toBe(NEUTRAL);
    const used = outcome("usr_ben", roster([link({ bound: true })]));
    expect(used === "revoked" ? used : used.body).toBe('{"code":"NOT_ALLOWED"}');
  });

  it("judges a revoke's answer in a cell: the revoked link, or the refusal, byte for byte", () => {
    const judge = judging(revokeExpected(seen("usr_ben"), "inv_mo"));
    expect(revokedBody("inv_mo")).toEqual({ invitation_id: "inv_mo", state: "revoked" });
    expect(judge(ok(revokedBody("inv_mo")))).toEqual([]);
    expect(judge(ok(revokedBody("inv_2")))).toHaveLength(1);
    expect(judge(ok({ ...revokedBody("inv_mo"), candidate_id: "cand_mo" }))).toHaveLength(1);
    expect(judge(NOT_FOUND)).not.toEqual([]);
    const other = judging(revokeExpected(seen("usr_ben"), "inv_mo", "usr_cleo"));
    expect(other(NOT_FOUND)).toEqual([]);
    expect(other(ok(revokedBody("inv_mo")))).not.toEqual([]);
    expect(other(sent(pinned(403, "Forbidden", '{"code":"NOT_ALLOWED"}')))).not.toEqual([]);
  });
});

describe("who removes someone invited who hasn't joined (removeCandidate, FQ148)", () => {
  /** The roster with `candidate` in `state`. */
  const withState = (candidate: string, state: string): RosterWorld => {
    const rosterRows = roster();
    const rowsOf = rosterRows.candidates.get(candidate);
    if (rowsOf === undefined) throw new Error(candidate);
    rosterRows.candidates.set(candidate, { ...rowsOf, state });
    return rosterRows;
  };

  it("lets only the member who proposed them remove them, ended already or not, and nobody a candidate who joined", () => {
    const outcome = (account: string | null, id = "cand_mo", rosterRows = roster(), schedule = world()) =>
      candidateRemovalOutcome(schedule, rosterRows, id, account);
    expect(outcome("usr_ben")).toBe("removed");
    expect(outcome("usr_ana", "cand_lu")).toBe("removed");
    // A repeat, or a candidate a decline or a leave ended, is answered as removed again.
    expect(outcome("usr_ben", "cand_mo", withState("cand_mo", "ended"))).toBe("removed");
    for (const account of ["usr_ana", "usr_cleo", "usr_dee", "usr_eve", "usr_zed", null]) {
      expect(outcome(account)).toBe(NEUTRAL);
      expect(outcome(account, "cand_mo", withState("cand_mo", "ended"))).toBe(NEUTRAL);
    }
    // A candidate who joined is a member, no candidate to remove, for their proposer too.
    expect(outcome("usr_ben", "cand_mo", withState("cand_mo", "joined"))).toBe(NEUTRAL);
    expect(outcome("usr_ben", "cand_none")).toBe(NEUTRAL);
    expect(outcome("usr_ben", "cand_lu")).toBe(NEUTRAL);
    // Nothing of a suspended club, and nothing to an account that isn't active (FQ80).
    const suspended = world();
    suspended.clubs.set(CLUB, { name: "The Saturdays", timezone: "America/New_York", suspended: true });
    expect(outcome("usr_ben", "cand_mo", roster(), suspended)).toBe(NEUTRAL);
    const inactive = world();
    inactive.activeAccounts.delete("usr_ben");
    expect(outcome("usr_ben", "cand_mo", roster(), inactive)).toBe(NEUTRAL);
    // Ben left and came back: the candidate is the earlier membership's, not this one's (T14).
    const rejoined = world();
    rejoined.members.set("itv_ben", member("usr_ben", "Ben", "2026-10-02T00:00:00Z", { active: false }));
    rejoined.members.set("itv_ben_2", member("usr_ben", "Ben", "2026-11-02T00:00:00Z"));
    expect(outcome("usr_ben", "cand_mo", roster(), rejoined)).toBe(NEUTRAL);
  });

  it("judges a removal's answer in a cell: the removed candidate, or the neutral not-found, byte for byte", () => {
    const judge = judging(candidateRemovalExpected(seen("usr_ben"), "cand_mo"));
    expect(removedCandidateBody("cand_mo")).toEqual({ candidate_id: "cand_mo", state: "removed" });
    expect(judge(ok(removedCandidateBody("cand_mo")))).toEqual([]);
    expect(judge(ok(removedCandidateBody("cand_lu")))).toHaveLength(1);
    expect(judge(ok({ ...removedCandidateBody("cand_mo"), revision_id: "rev_1" }))).toHaveLength(1);
    expect(judge(ok({ candidate_id: "cand_mo", state: "revoked" }))).toHaveLength(1);
    expect(judge(ok(removedCandidateBody("cand_mo"), { "cache-control": "no-cache" }))).not.toEqual([]);
    expect(judge(made(removedCandidateBody("cand_mo")))).not.toEqual([]);
    expect(judge(NOT_FOUND)).not.toEqual([]);
    const other = judging(candidateRemovalExpected(seen("usr_ben"), "cand_mo", "usr_cleo"));
    expect(other(NOT_FOUND)).toEqual([]);
    expect(other(ok(removedCandidateBody("cand_mo")))).not.toEqual([]);
    expect(other(sent(pinned(403, "Forbidden", '{"code":"NOT_ALLOWED"}')))).not.toEqual([]);
    const joined = judging(
      candidateRemovalExpected(seen("usr_ben", world(), withState("cand_mo", "joined")), "cand_mo"),
    );
    expect(joined(NOT_FOUND)).toEqual([]);
    expect(joined(ok(removedCandidateBody("cand_mo")))).not.toEqual([]);
  });
});

describe("a link as it was made, and its replay (createInvitation)", () => {
  const first = {
    invitation_id: "inv_mo",
    candidate_id: "cand_mo",
    url: `https://tadayo.app/i#${TOKEN}`,
    expires_at: "2026-11-13T14:41:00Z",
  };
  const judge = (body: unknown, rosterRows = roster(), answer = made(body)) =>
    madeLink(answer, rosterRows, "cand_mo", NOW);

  it("passes the candidate's latest link, seven days from the second it was made in, with the token its row's hash is of", () => {
    expect(judge(first)).toEqual({ problems: [], token: TOKEN, id: "inv_mo" });
  });

  it("refuses another link, candidate or expiry, a row that expires at another instant, and an answer that may be stored", () => {
    expect(judge({ ...first, invitation_id: "inv_2" }).problems).toHaveLength(1);
    expect(judge({ ...first, candidate_id: "cand_lu" }).problems).toHaveLength(1);
    expect(judge({ ...first, expires_at: "2026-11-13T14:41:01Z" }).problems).toHaveLength(1);
    expect(judge({ ...first, token: TOKEN }).problems).toHaveLength(1);
    expect(judge(first, roster([link({ expiresAt: LATER.add({ seconds: 1 }) })])).problems).toEqual([
      "the link's row expires at another instant than its answer",
    ]);
    expect(judge(first, roster(), made(first, { "cache-control": "private" })).problems).toEqual([
      "a link without private, no-store",
    ]);
    // The latest link is the one that isn't replaced.
    expect(judge(first, roster([link({ replaced: true }), link({ id: "inv_2" })])).problems).toHaveLength(1);
  });

  it("refuses a URL that isn't the web page and a token of 43 characters, and a token its row's hash isn't of", () => {
    const none = without(first, "url");
    for (const url of [
      undefined,
      `https://tadayo.app/i#${TOKEN}x`,
      `https://tadayo.app/i#${TOKEN.slice(1)}`,
      `https://tadayo.app/i?t=${TOKEN}`,
      `https://example.org/i#${TOKEN}`,
      `http://tadayo.app/i#${TOKEN}`,
    ]) {
      const found = judge(url === undefined ? none : { ...first, url });
      expect(found.problems).toEqual(["the link's url isn't https://tadayo.app/i# and a token of 43 characters"]);
      expect(found.token).toBeUndefined();
    }
    expect(judge({ ...first, url: `https://tadayo.app/i#${"u".repeat(43)}` }).problems).toEqual([
      "the link's token doesn't hash to its row's hash",
    ]);
  });

  it("refuses another status, a body that isn't a link, and a link no row holds", () => {
    const none = { problems: ["status 200, not 201 with a link"], token: undefined, id: undefined };
    expect(judge(first, roster(), ok(first))).toEqual(none);
    expect(judge("inv_mo").problems).toEqual(["status 201, not 201 with a link"]);
    expect(judge(first, roster([])).problems).toEqual(["status 201, not 201 with a link"]);
    expect(judge(first, roster(), NOT_FOUND).problems).toEqual(["status 404, not 201 with a link"]);
  });

  it("holds a retry to the first answer without its url, and nothing else (FQ77)", () => {
    const rest = without(first, "url");
    const replay = judging(replayedLink(made(first)));
    expect(replay(made(rest))).toEqual([]);
    expect(replay(made(first))).toEqual(["a retry's answer carries a url (FQ77)"]);
    expect(replay(made({ ...rest, invitation_id: "inv_2" }))).toHaveLength(1);
    expect(replay(made({ ...rest, state: "live" }))).toHaveLength(1);
    expect(replay(ok(rest))).toEqual(["not the first link again"]);
    expect(replay(NOT_FOUND)).toEqual(["not the first link again"]);
  });
});
