/// <reference lib="esnext.temporal" />
// The leave's judges, judged (./leave.ts): each branch of what a cell must get from leaveClub, and of what
// a leave must change, is shown to refuse an answer or a set of rows that breaks it, on a world written
// out here by hand, with no database.

import { describe, expect, it } from "vitest";
import type { ClubRows } from "./club.ts";
import { NEUTRAL, pinned } from "./harness.ts";
import {
  LEAVE_JUDGED,
  LEAVE_NO_BODY,
  leaveOutcome,
  leaveProblems,
  leftExpected,
  type LeaveRows,
  type MembershipRow,
} from "./leave.ts";
import type { RevisionRows, RosterWorld } from "./roster.ts";
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

/** A club of three, Ana, Ben and Cleo, that has started; `gone` have left. */
function schedule(gone: readonly string[] = [], suspended = false): ScheduleWorld {
  const one = (interval: string, account: string): [string, ScheduleMember] => [
    interval,
    member(account, { active: !gone.includes(interval) }),
  ];
  return {
    clubs: new Map([[CLUB, { name: "The Saturdays", timezone: "America/New_York", suspended }]]),
    members: new Map([one("itv_ana", "usr_ana"), one("itv_ben", "usr_ben"), one("itv_cleo", "usr_cleo")]),
    activeAccounts: new Set(["usr_ana", "usr_ben", "usr_cleo", "usr_zed"]),
    versions: [],
    proposals: new Map(),
  };
}

const clubRows = (rosterVersion: number, openRevision: string | null, openCandidates = 0): ClubRows =>
  new Map([[CLUB, { activated: true, rosterVersion, openCandidates, openRevision }]]);

const revision = (over: Partial<RevisionRows>): RevisionRows => ({
  club: CLUB,
  state: "open",
  version: 1,
  proposer: "itv_ana",
  sealed: true,
  supersededBy: null,
  members: ["itv_ana", "itv_ben", "itv_cleo"],
  candidates: [],
  decisions: new Map([["itv_ana", "approved"]]),
  ...over,
});

const roster = (
  revisions: [string, RevisionRows][],
  candidates: [string, { proposer: string; state: string }][],
): RosterWorld => ({
  revisions: new Map(revisions),
  links: new Map(),
  candidates: new Map(candidates.map(([id, row]) => [id, { club: CLUB, ...row }])),
});

const left = (over: Partial<MembershipRow> = {}): MembershipRow => ({
  state: "left",
  leftAt: NOW,
  contributions: "keep",
  endedName: "usr_ben",
  ...over,
});

const answer = (status: number, body: unknown): Answer => ({
  status,
  reason: status === 200 ? "OK" : "Not Found",
  headers: { "cache-control": "private, no-store", "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

describe("who leaves, and what they are told (leaveOutcome, leftExpected)", () => {
  it("judges leaveClub alone, and pins the answer to a request with no body", () => {
    expect([...LEAVE_JUDGED]).toEqual(["leaveClub"]);
    expect(LEAVE_NO_BODY).toEqual(pinned(400, "Bad Request", '{"code":"INVALID_REQUEST"}'));
  });

  it("gives a member the interval that ends, and everyone else the neutral not-found", () => {
    expect(leaveOutcome(schedule(), CLUB, "usr_ben")).toBe("itv_ben");
    // A stranger, a former member, nobody, another club, a suspended club (FQ122), an account being deleted.
    expect(leaveOutcome(schedule(), CLUB, "usr_zed")).toBe(NEUTRAL);
    expect(leaveOutcome(schedule(["itv_ben"]), CLUB, "usr_ben")).toBe(NEUTRAL);
    expect(leaveOutcome(schedule(), CLUB, null)).toBe(NEUTRAL);
    expect(leaveOutcome(schedule(), "clb_other", "usr_ben")).toBe(NEUTRAL);
    expect(leaveOutcome(schedule([], true), CLUB, "usr_ben")).toBe(NEUTRAL);
    const deleting = schedule();
    deleting.activeAccounts.delete("usr_ben");
    expect(leaveOutcome(deleting, CLUB, "usr_ben")).toBe(NEUTRAL);
  });

  it("takes the club, the instant in whole seconds rounded down and the choice, and refuses each that differs", () => {
    const expected = leftExpected(CLUB, NOW, "withdraw");
    const good = { club_id: CLUB, left_at: "2026-11-06T14:41:00Z", contributions: "withdraw" };
    expect(expected(answer(200, good))).toEqual([]);
    expect(expected(answer(200, { ...good, club_id: "clb_other" }))).toHaveLength(1);
    expect(expected(answer(200, { ...good, left_at: "2026-11-06T14:41:01Z" }))).toHaveLength(1);
    expect(expected(answer(200, { ...good, left_at: "2026-11-06T14:41:00.5Z" }))).toHaveLength(1);
    expect(expected(answer(200, { ...good, contributions: "keep" }))).toHaveLength(1);
    expect(expected(answer(200, { ...good, name: "usr_ben" }))).toHaveLength(1);
    expect(expected(answer(404, { code: "NOT_FOUND" }))).toHaveLength(1);
    const cached = answer(200, good);
    expect(expected({ ...cached, headers: { ...cached.headers, "cache-control": "public" } })).toHaveLength(1);
  });
});

describe("what a leave changes (leaveProblems)", () => {
  /** Ben leaves a club with no open proposal. */
  const plain = (): { before: LeaveRows; after: LeaveRows } => ({
    before: { schedule: schedule(), roster: roster([], []), clubs: clubRows(5, null) },
    after: { schedule: schedule(["itv_ben"]), roster: roster([], []), clubs: clubRows(6, null) },
  });
  /** `row` null is a membership whose row is gone. */
  const judge = (rows: { before: LeaveRows; after: LeaveRows }, row: MembershipRow | null = left()) =>
    leaveProblems(rows.before, rows.after, CLUB, "itv_ben", row ?? undefined, NOW, "keep");

  it("passes a leave that ends the interval and moves the roster's version, and nothing else", () => {
    expect(judge(plain())).toEqual([]);
  });

  it("catches each part of the membership's row that is wrong", () => {
    expect(judge(plain(), null)).toEqual(["the membership's row is gone"]);
    expect(judge(plain(), left({ state: "active" }))).toHaveLength(1);
    expect(judge(plain(), left({ leftAt: null }))).toHaveLength(1);
    expect(judge(plain(), left({ leftAt: NOW.add({ seconds: 1 }) }))).toHaveLength(1);
    // The instant itself, not its whole second.
    expect(judge(plain(), left({ leftAt: Temporal.Instant.from("2026-11-06T14:41:00Z") }))).toHaveLength(1);
    expect(judge(plain(), left({ contributions: "withdraw" }))).toHaveLength(1);
    expect(judge(plain(), left({ contributions: null }))).toHaveLength(1);
    expect(judge(plain(), left({ endedName: "Someone else" }))).toHaveLength(1);
    expect(judge(plain(), left({ endedName: null }))).toHaveLength(1);
  });

  it("catches another member's interval ended, the leaver's own left active, and a version that didn't move by one", () => {
    const both = plain();
    both.after.schedule = schedule(["itv_ben", "itv_cleo"]);
    expect(judge(both)).toEqual(["another member's interval changed"]);
    const none = plain();
    none.after.schedule = schedule();
    expect(judge(none)).toEqual(["another member's interval changed"]);
    for (const version of [5, 7]) {
      const stuck = plain();
      stuck.after.clubs = clubRows(version, null);
      expect(judge(stuck)).toEqual(["the club's roster version didn't move by one"]);
    }
  });

  it("catches a revision made in a club that had none open", () => {
    const made = plain();
    made.after.clubs = clubRows(6, "rev_new");
    expect(judge(made)).toEqual(["a leave made a revision in a club that had none open"]);
  });

  /** Ana's open proposal carries Ana's Sam and Ben's Debby; Sam has accepted, Cleo approved. Ben leaves. */
  const carried = (): { before: LeaveRows; after: LeaveRows } => {
    const open = revision({
      candidates: [
        { id: "cnd_sam", label: "Sam", proposer: "itv_ana", acceptedWith: "inv_sam" },
        { id: "cnd_debby", label: "Debby", proposer: "itv_ben", acceptedWith: null },
      ],
      decisions: new Map([
        ["itv_ana", "approved"],
        ["itv_cleo", "approved"],
      ]),
    });
    return {
      before: {
        schedule: schedule(),
        roster: roster(
          [["rev_open", open]],
          [
            ["cnd_sam", { proposer: "itv_ana", state: "open" }],
            ["cnd_debby", { proposer: "itv_ben", state: "open" }],
          ],
        ),
        clubs: clubRows(5, "rev_open", 2),
      },
      after: {
        schedule: schedule(["itv_ben"]),
        roster: roster(
          [
            ["rev_open", { ...open, state: "superseded", version: 2, supersededBy: "rev_next" }],
            [
              "rev_next",
              revision({
                members: ["itv_ana", "itv_cleo"],
                candidates: [{ id: "cnd_sam", label: "Sam", proposer: "itv_ana", acceptedWith: null }],
              }),
            ],
          ],
          [
            ["cnd_sam", { proposer: "itv_ana", state: "open" }],
            ["cnd_debby", { proposer: "itv_ben", state: "ended" }],
          ],
        ),
        clubs: clubRows(6, "rev_next", 1),
      },
    };
  };
  const next = (rows: { after: LeaveRows }): RevisionRows => {
    const found = rows.after.roster.revisions.get("rev_next");
    if (found === undefined) throw new Error("no next revision");
    return found;
  };
  const ended = (rows: { after: LeaveRows }): RevisionRows => {
    const found = rows.after.roster.revisions.get("rev_open");
    if (found === undefined) throw new Error("no ended revision");
    return found;
  };

  it("passes the leaver's candidate ended and the other carried into a revision of the members who stay (FQ121)", () => {
    expect(judge(carried())).toEqual([]);
  });

  it("catches the leaver's candidate left open", () => {
    const rows = carried();
    rows.after.roster.candidates.set("cnd_debby", { club: CLUB, proposer: "itv_ben", state: "open" });
    expect(judge(rows)).toEqual(["the leaver's candidate cnd_debby is still open (FQ121)"]);
  });

  it("catches each way the ended revision and the new one can be wrong", () => {
    const cases: [string, (rows: { before: LeaveRows; after: LeaveRows }) => void][] = [
      ["the ended revision's version didn't move by one", (rows) => (ended(rows).version = 1)],
      ["the revision is open, not superseded", (rows) => (ended(rows).state = "open")],
      ["the revision is did_not_go_ahead, not superseded", (rows) => (ended(rows).state = "did_not_go_ahead")],
      ["the ended revision doesn't name the new one", (rows) => (ended(rows).supersededBy = "rev_other")],
      ["no new revision carries the candidates", (rows) => (rows.after.clubs = clubRows(6, null, 1))],
      ["no new revision carries the candidates", (rows) => (rows.after.clubs = clubRows(6, "rev_open", 1))],
      ["the new revision's rows are missing", (rows) => rows.after.roster.revisions.delete("rev_next")],
      ["the new revision isn't open and sealed", (rows) => (next(rows).sealed = false)],
      ["the new revision isn't open and sealed", (rows) => (next(rows).state = "applied")],
      ["the new revision has another proposer", (rows) => (next(rows).proposer = "itv_cleo")],
      [
        "the new revision's members aren't exactly the members who stay (T7)",
        (rows) => (next(rows).members = ["itv_ana", "itv_ben", "itv_cleo"]),
      ],
      [
        "the new revision's members aren't exactly the members who stay (T7)",
        (rows) => (next(rows).members = ["itv_ana"]),
      ],
      [
        "the new revision's candidates aren't the ones carried, at their labels and in their order",
        (rows) => (next(rows).candidates = []),
      ],
      [
        "the new revision's candidates aren't the ones carried, at their labels and in their order",
        (rows) =>
          (next(rows).candidates = [{ id: "cnd_sam", label: "Samuel", proposer: "itv_ana", acceptedWith: null }]),
      ],
      [
        "the new revision's candidates aren't the ones carried, at their labels and in their order",
        (rows) =>
          next(rows).candidates.push({ id: "cnd_debby", label: "Debby", proposer: "itv_ben", acceptedWith: null }),
      ],
      [
        "the new revision carries an acceptance of another roster (T7)",
        (rows) =>
          (next(rows).candidates = [{ id: "cnd_sam", label: "Sam", proposer: "itv_ana", acceptedWith: "inv_sam" }]),
      ],
      [
        "the new revision's approvals aren't its proposer's alone (FQ60)",
        (rows) => next(rows).decisions.set("itv_cleo", "approved"),
      ],
      [
        "the new revision's approvals aren't its proposer's alone (FQ60)",
        (rows) => {
          next(rows).decisions.clear();
        },
      ],
      [
        "the new revision's approvals aren't its proposer's alone (FQ60)",
        (rows) => (next(rows).decisions = new Map([["itv_cleo", "approved"]])),
      ],
      [
        "the carried candidate cnd_sam was ended",
        (rows) => rows.after.roster.candidates.set("cnd_sam", { club: CLUB, proposer: "itv_ana", state: "ended" }),
      ],
    ];
    for (const [problem, change] of cases) {
      const rows = carried();
      change(rows);
      expect(judge(rows), problem).toContain(problem);
    }
  });

  /** As `carried`, but the proposal is Ben's own: it ends with every candidate. */
  const proposers = (): { before: LeaveRows; after: LeaveRows } => {
    const rows = carried();
    const open = rows.before.roster.revisions.get("rev_open");
    if (open === undefined) throw new Error("no open revision");
    open.proposer = "itv_ben";
    rows.after = {
      schedule: schedule(["itv_ben"]),
      roster: roster(
        [["rev_open", { ...open, state: "did_not_go_ahead", version: 2 }]],
        [
          ["cnd_sam", { proposer: "itv_ana", state: "ended" }],
          ["cnd_debby", { proposer: "itv_ben", state: "ended" }],
        ],
      ),
      clubs: clubRows(6, null),
    };
    return rows;
  };

  it("passes a proposal of the leaver's own ended with every candidate, and catches it carried or half ended", () => {
    expect(judge(proposers())).toEqual([]);
    const kept = proposers();
    ended(kept).state = "superseded";
    expect(judge(kept)).toEqual(["the revision is superseded, not did_not_go_ahead"]);
    const open = proposers();
    open.after.clubs = clubRows(6, "rev_next");
    expect(judge(open)).toEqual(["a revision is open though nothing could be carried (FQ121)"]);
    const held = proposers();
    held.after.roster.candidates.set("cnd_sam", { club: CLUB, proposer: "itv_ana", state: "open" });
    expect(judge(held)).toEqual(["the candidate cnd_sam is open on no revision"]);
    const version = proposers();
    ended(version).version = 1;
    expect(judge(version)).toEqual(["the ended revision's version didn't move by one"]);
  });

  it("asks the same of a proposal that held only the leaver's candidates", () => {
    const rows = carried();
    const open = rows.before.roster.revisions.get("rev_open");
    if (open === undefined) throw new Error("no open revision");
    open.candidates = [{ id: "cnd_debby", label: "Debby", proposer: "itv_ben", acceptedWith: null }];
    rows.before.roster.candidates.delete("cnd_sam");
    rows.after.roster = roster(
      [["rev_open", { ...open, state: "did_not_go_ahead", version: 2 }]],
      [["cnd_debby", { proposer: "itv_ben", state: "ended" }]],
    );
    rows.after.clubs = clubRows(6, null);
    expect(judge(rows)).toEqual([]);
    ended(rows).state = "superseded";
    expect(judge(rows)).toContain("the revision is superseded, not did_not_go_ahead");
  });

  it("says so when the open revision's rows are gone", () => {
    const rows = carried();
    rows.after.roster.revisions.delete("rev_open");
    expect(judge(rows)).toEqual(["the open revision's rows are gone"]);
  });
});
