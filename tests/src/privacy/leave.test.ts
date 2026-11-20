/// <reference lib="esnext.temporal" />
// The leave's judges, judged (./leave.ts): each branch of what a cell must get from leaveClub, and of what
// a leave must change, is shown to refuse an answer or a set of rows that breaks it, on a world written
// out here by hand, with no database.

import { describe, expect, it } from "vitest";
import type { ClubRows } from "./club.ts";
import { NEUTRAL, pinned } from "./harness.ts";
import {
  firstDaysJoinProblems,
  firstDaysProblems,
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
import type { ScheduleMember, ScheduleProposalRows, ScheduleWorld, Weekday } from "./schedule.ts";

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
  origin: "proposal",
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

  it("asks a name's revision to stay one, with no approval, and a proposal to keep its proposer's alone (FQ84)", () => {
    const named = (): { before: LeaveRows; after: LeaveRows } => {
      const rows = carried();
      const open = rows.before.roster.revisions.get("rev_open");
      if (open === undefined) throw new Error("no open revision");
      open.origin = "rename";
      open.decisions = new Map([["itv_cleo", "approved"]]);
      ended(rows).origin = "rename";
      next(rows).origin = "rename";
      next(rows).decisions = new Map();
      return rows;
    };
    expect(judge(named())).toEqual([]);
    const approved = named();
    next(approved).decisions = new Map([["itv_ana", "approved"]]);
    expect(judge(approved)).toEqual(["the new revision of a name nobody approved starts with an approval (FQ84)"]);
    const relabelled = named();
    next(relabelled).origin = "proposal";
    next(relabelled).decisions = new Map([["itv_ana", "approved"]]);
    // What the first build did: the name's revision relabelled as its proposer's own proposal.
    expect(judge(relabelled)).toEqual([
      "the new revision is a proposal, not a rename",
      "the new revision of a name nobody approved starts with an approval (FQ84)",
    ]);
    const proposal = carried();
    next(proposal).origin = "rename";
    expect(judge(proposal)).toEqual(["the new revision is a rename, not a proposal"]);
  });

  it("carries nothing for a proposer who was no member before the leave, and none of the candidates ended before it", () => {
    // Ana, the proposer, had left already (by a block or a deletion, later): nothing is carried.
    const gone = carried();
    gone.before.schedule = schedule(["itv_ana"]);
    gone.after.schedule = schedule(["itv_ana", "itv_ben"]);
    expect(judge(gone)).toContain("the revision is superseded, not did_not_go_ahead");
    // Sam had ended before the leave: the new revision must not list Sam.
    const before = carried();
    before.before.roster.candidates.set("cnd_sam", { club: CLUB, proposer: "itv_ana", state: "ended" });
    expect(judge(before)).toContain("the revision is superseded, not did_not_go_ahead");
  });

  it("says so when the open revision's rows are gone", () => {
    const rows = carried();
    rows.after.roster.revisions.delete("rev_open");
    expect(judge(rows)).toEqual(["the open revision's rows are gone"]);
  });
});

describe("what a leave does to the club's first days (firstDaysProblems; FQ102, FQ123)", () => {
  const P = "spr_first";
  const days = (
    confirmed: readonly string[],
    over: Partial<ScheduleProposalRows> = {},
    included: readonly string[] = ["itv_ana", "itv_ben", "itv_cleo"],
  ): ScheduleProposalRows => ({
    club: CLUB,
    state: "open",
    version: 1,
    reason: "activation",
    effectiveFrom: "2026-11-01",
    daysPerMember: 2,
    scheduleVersion: "sched_first",
    replacedBy: null,
    weekRevision: 1,
    members: included.map((interval) => ({ interval, confirmed: confirmed.includes(interval) })),
    days: [],
    earlier: [],
    ...over,
  });
  /** The world with `proposals`, after `gone` left. */
  const world = (gone: readonly string[], proposals: [string, ScheduleProposalRows][]): ScheduleWorld => ({
    ...schedule(gone),
    proposals: new Map(proposals),
  });
  const judged = (
    was: ScheduleProposalRows,
    now: ScheduleProposalRows,
    leaver = "itv_ben",
    goneBefore: readonly string[] = [],
    more: [string, ScheduleProposalRows][] = [],
  ) =>
    firstDaysProblems(world(goneBefore, [[P, was]]), world([...goneBefore, leaver], [[P, now], ...more]), CLUB, leaver);

  it("passes a club with no first days, and catches a proposal that appears or changes there", () => {
    expect(firstDaysProblems(world([], []), world(["itv_ben"], []), CLUB, "itv_ben")).toEqual([]);
    const applied = days(["itv_ana", "itv_ben", "itv_cleo"], { state: "applied", version: 2 });
    expect(judged(applied, applied)).toEqual([]);
    expect(firstDaysProblems(world([], []), world(["itv_ben"], [[P, days([])]]), CLUB, "itv_ben")).toEqual([
      "a leave changed the club's first days though none were open",
    ]);
  });

  it("asks a revision at the next version when nobody had confirmed, and their end with one member left", () => {
    expect(judged(days([]), days([], { version: 2 }))).toEqual([]);
    expect(judged(days([]), days([]))).toEqual(["the first days are open at version 1, not open at version 2 (FQ102)"]);
    expect(judged(days([]), days([], { version: 2, state: "superseded" }))).toEqual([
      "the first days are superseded at version 2, not open at version 2 (FQ102)",
    ]);
    // Cleo had left already: Ben's leave leaves Ana alone.
    expect(judged(days([]), days([], { version: 2, state: "superseded" }), "itv_ben", ["itv_cleo"])).toEqual([]);
    expect(judged(days([]), days([], { version: 2 }), "itv_ben", ["itv_cleo"])).toEqual([
      "the first days are open at version 2, not superseded at version 2 (FQ102)",
    ]);
  });

  it("asks nothing to move once a day is confirmed and someone who hasn't confirmed stays (T33)", () => {
    expect(judged(days(["itv_ana"]), days(["itv_ana"]))).toEqual([]);
    expect(judged(days(["itv_ana"]), days(["itv_ana"], { version: 2 }))).toEqual([
      "the first days are open at version 2, not open at version 1 (FQ102)",
    ]);
    // The member who confirmed is the one leaving: the same.
    expect(judged(days(["itv_ben"]), days(["itv_ben"]))).toEqual([]);
  });

  it("asks them applied when only confirmed members stay, and ended when the one left hasn't confirmed", () => {
    const was = days(["itv_ana", "itv_cleo"]);
    expect(judged(was, { ...was, state: "applied", version: 2 })).toEqual([]);
    expect(judged(was, was)).toEqual(["the first days are open at version 1, not applied at version 2 (FQ102)"]);
    // Cleo had left; Ana confirmed and leaves; Ben, who hasn't, is alone.
    const pair = days(["itv_ana"]);
    expect(judged(pair, { ...pair, state: "superseded", version: 2 }, "itv_ana", ["itv_cleo"])).toEqual([]);
    expect(judged(pair, { ...pair, state: "applied", version: 2 }, "itv_ana", ["itv_cleo"])).toEqual([
      "the first days are applied at version 2, not superseded at version 2 (FQ102)",
    ]);
  });

  it("asks them ended when nobody they include is left, with new ones for two or more who remain (FQ123)", () => {
    // The first days include Ana and Ben only; Ana confirmed and left; Cleo joined later.
    const was = days(["itv_ana"], {}, ["itv_ana", "itv_ben"]);
    const ended = { ...was, state: "superseded" as const, version: 2 };
    // Ben leaves: only Cleo remains, so no new first days.
    expect(judged(was, ended, "itv_ben", ["itv_ana"])).toEqual([]);
    const next = days([], { version: 1 }, ["itv_cleo"]);
    expect(judged(was, ended, "itv_ben", ["itv_ana"], [["spr_next", next]])).toEqual([
      "new first days opened for fewer than two members",
    ]);
    // The first days include Ana alone, who confirmed and leaves; Ben and Cleo, who joined later, remain.
    const alone = days(["itv_ana"], {}, ["itv_ana"]);
    const over = { ...alone, state: "superseded" as const, version: 2 };
    const missing = ["no new first days are open for exactly the members who remain (FQ123)"];
    const pair = ["itv_ben", "itv_cleo"];
    expect(judged(alone, over, "itv_ana", [], [["spr_next", days([], {}, pair)]])).toEqual([]);
    expect(judged(alone, over, "itv_ana")).toEqual(missing);
    expect(judged(alone, over, "itv_ana", [], [["spr_next", days(["itv_ben"], {}, pair)]])).toEqual(missing);
    expect(judged(alone, over, "itv_ana", [], [["spr_next", days([], { reason: "membership" }, pair)]])).toEqual(
      missing,
    );
    expect(judged(alone, over, "itv_ana", [], [["spr_next", days([], {}, ["itv_ben"])]])).toEqual(missing);
  });

  it("catches an ended proposal given a successor, and one whose days per member moved without a revision", () => {
    const was = days(["itv_ana", "itv_cleo"]);
    expect(judged(was, { ...was, state: "applied", version: 2, replacedBy: "spr_other" })).toEqual([
      "the first days name a successor",
    ]);
    expect(judged(days(["itv_ana"]), days(["itv_ana"], { daysPerMember: 1 }))).toEqual([
      "each member has 1 days, not 2",
    ]);
  });

  const row = (interval: string, weekday: Weekday, suggested = true, held = true) => ({
    interval,
    weekday,
    suggested,
    held,
  });
  const WEEK_OF_THREE = [
    row("itv_ana", "monday"),
    row("itv_ana", "thursday"),
    row("itv_ben", "tuesday"),
    row("itv_ben", "friday", true, false),
    row("itv_ben", "wednesday", false, true),
    row("itv_cleo", "wednesday"),
    row("itv_cleo", "saturday"),
  ];

  it("catches a leave that adds a member, moves a confirmation or changes a day, whatever it does to the state", () => {
    // A day is confirmed and Ben leaves: nothing moves, row by row.
    const was = days(["itv_ana"], { days: WEEK_OF_THREE });
    expect(judged(was, was)).toEqual([]);
    expect(judged(was, { ...was, members: [...was.members, { interval: "itv_late", confirmed: false }] })).toEqual([
      "the first days' members aren't those they had, with exactly the members a revision adds (FQ100)",
    ]);
    expect(
      judged(was, {
        ...was,
        members: was.members.map((one) => (one.interval === "itv_cleo" ? { ...one, confirmed: true } : one)),
      }),
    ).toEqual(["the confirmation of itv_cleo moved"]);
    expect(judged(was, { ...was, days: was.days.filter((day) => day.interval !== "itv_cleo") })).toEqual([
      "a member's days changed though nobody is moved (T6)",
    ]);
    expect(judged(was, { ...was, days: was.days.filter((day) => day.interval !== "itv_ben") })).toEqual([
      "a member's days changed though nobody is moved (T6)",
    ]);
    // Nobody had confirmed: the revision for two keeps two days each, so it moves nobody either.
    const open = days([], { days: WEEK_OF_THREE });
    expect(judged(open, { ...open, version: 2 })).toEqual([]);
    expect(
      judged(open, {
        ...open,
        version: 2,
        days: open.days.map((day) => (day.weekday === "saturday" ? { ...day, held: false } : day)),
      }),
    ).toEqual(["a member's days changed though nobody is moved (T6)"]);
    expect(judged(open, { ...open, version: 2, weekRevision: 2 })).toEqual([
      "the first days are on week 2, not week 1",
    ]);
    // The first days end, or apply: their rows stay as they were.
    const pair = days(["itv_ana", "itv_cleo"], { days: WEEK_OF_THREE });
    expect(judged(pair, { ...pair, state: "applied", version: 2, days: [] })).toEqual([
      "a member's days changed though nobody is moved (T6)",
    ]);
  });

  it("catches an earlier week's row that changed, and a week before that isn't kept (0013)", () => {
    const earlier = [{ ...row("itv_ana", "monday"), weekRevision: 1 }];
    const was = days(["itv_ana"], { weekRevision: 2, days: WEEK_OF_THREE, earlier });
    expect(judged(was, was)).toEqual([]);
    expect(judged(was, { ...was, earlier: [] })).toEqual(["an earlier week's rows changed"]);
    expect(judged(was, { ...was, earlier: [{ ...row("itv_ana", "monday", true, false), weekRevision: 1 }] })).toEqual([
      "an earlier week's rows changed",
    ]);
  });

  describe("across four members and three, where the days each member has change (FQ102)", () => {
    const four = (gone: readonly string[], proposals: [string, ScheduleProposalRows][]): ScheduleWorld => {
      const base = world(gone, proposals);
      return {
        ...base,
        members: new Map([...base.members, ["itv_dan", member("usr_dan", { active: !gone.includes("itv_dan") })]]),
      };
    };
    const ALL = ["itv_ana", "itv_ben", "itv_cleo", "itv_dan"];
    const WEEK_OF_FOUR = [
      row("itv_ana", "monday"),
      row("itv_ben", "tuesday"),
      row("itv_cleo", "wednesday"),
      row("itv_dan", "thursday"),
    ];
    const NEW_WEEK_OF_THREE = [
      row("itv_ana", "monday"),
      row("itv_ana", "thursday"),
      row("itv_ben", "tuesday"),
      row("itv_ben", "friday"),
      row("itv_cleo", "wednesday"),
      row("itv_cleo", "saturday"),
    ];

    it("asks a leave for a new week for the three who stay, with the week of four kept whole", () => {
      const was = days([], { daysPerMember: 1, days: WEEK_OF_FOUR }, ALL);
      const kept = WEEK_OF_FOUR.map((day) => ({ ...day, weekRevision: 1 }));
      const now = { ...was, version: 2, daysPerMember: 2, weekRevision: 2, days: NEW_WEEK_OF_THREE, earlier: kept };
      const leave = (after: ScheduleProposalRows) =>
        firstDaysProblems(four([], [[P, was]]), four(["itv_dan"], [[P, after]]), CLUB, "itv_dan");
      expect(leave(now)).toEqual([]);
      expect(leave({ ...now, earlier: kept.slice(1) })).toEqual(["the week before isn't kept as it was"]);
      expect(leave({ ...now, days: [...NEW_WEEK_OF_THREE, row("itv_dan", "sunday" as Weekday)] })).toEqual([
        "the new week gives a day to someone who isn't an active member",
      ]);
      expect(leave({ ...now, days: NEW_WEEK_OF_THREE.slice(1) })).toEqual([
        "itv_ana doesn't hold 2 proposed days in the new week",
      ]);
      expect(
        leave({
          ...now,
          days: NEW_WEEK_OF_THREE.map((day) => (day.weekday === "saturday" ? { ...day, weekday: "monday" } : day)),
        }),
      ).toEqual(["the new week proposes a day twice"]);
      expect(leave({ ...was, version: 2 })).toEqual([
        "each member has 1 days, not 2",
        "the first days are on week 1, not week 2",
        "the week before isn't kept as it was",
        "the new week gives a day to someone who isn't an active member",
        "itv_ana doesn't hold 2 proposed days in the new week",
        "itv_ben doesn't hold 2 proposed days in the new week",
        "itv_cleo doesn't hold 2 proposed days in the new week",
      ]);
    });

    it("asks a join for the same, the other way, and for the new member in it (firstDaysJoinProblems)", () => {
      const was = days([], { days: NEW_WEEK_OF_THREE });
      const kept = NEW_WEEK_OF_THREE.map((day) => ({ ...day, weekRevision: 1 }));
      const now = { ...was, version: 2, daysPerMember: 1, weekRevision: 2, days: WEEK_OF_FOUR, earlier: kept };
      const join = (after: ScheduleProposalRows, before = was) =>
        firstDaysJoinProblems(four(["itv_dan"], [[P, before]]), four([], [[P, after]]), CLUB, ["itv_dan"]);
      const withDan = (rows: ScheduleProposalRows): ScheduleProposalRows => ({
        ...rows,
        members: [...rows.members, { interval: "itv_dan", confirmed: false }],
      });
      expect(join(withDan(now))).toEqual([]);
      expect(join(now)).toEqual([
        "the first days' members aren't those they had, with exactly the members a revision adds (FQ100)",
      ]);
      expect(join(withDan({ ...now, version: 1 }))).toEqual([
        "the first days are open at version 1, not open at version 2 (FQ100, FQ102)",
      ]);
      // Once a day is confirmed the new member isn't included and nothing moves (FQ100).
      const confirmed = days(["itv_ana"], { days: NEW_WEEK_OF_THREE });
      expect(join(confirmed, confirmed)).toEqual([]);
      expect(join(withDan(confirmed), confirmed)).toEqual([
        "the first days' members aren't those they had, with exactly the members a revision adds (FQ100)",
      ]);
      expect(join({ ...confirmed, version: 2 }, confirmed)).toEqual([
        "the first days are open at version 2, not open at version 1 (FQ100, FQ102)",
      ]);
    });
  });

  describe("a join that moves nobody (firstDaysJoinProblems; FQ55, FQ102)", () => {
    // Ana and Ben are the club; Cleo joins. Two days each before and after.
    const PAIR = [
      row("itv_ana", "monday"),
      row("itv_ana", "thursday"),
      row("itv_ben", "tuesday"),
      row("itv_ben", "friday"),
    ];
    const was = days([], { days: PAIR }, ["itv_ana", "itv_ben"]);
    const after = (mine: ReturnType<typeof row>[], over: Partial<ScheduleProposalRows> = {}): ScheduleProposalRows => ({
      ...was,
      version: 2,
      members: [...was.members, { interval: "itv_cleo", confirmed: false }],
      days: [...PAIR, ...mine],
      ...over,
    });
    const join = (now: ScheduleProposalRows, more: [string, ScheduleProposalRows][] = []) =>
      firstDaysJoinProblems(world(["itv_cleo"], [[P, was]]), world([], [[P, now], ...more]), CLUB, ["itv_cleo"]);

    it("asks the new member two proposed days nobody holds, and every other row as it was", () => {
      expect(join(after([row("itv_cleo", "wednesday"), row("itv_cleo", "saturday")]))).toEqual([]);
      expect(join(after([row("itv_cleo", "wednesday")]))).toEqual([
        "the new member itv_cleo doesn't hold 2 proposed days",
      ]);
      expect(join(after([row("itv_cleo", "wednesday"), row("itv_cleo", "saturday", false, true)]))).toEqual([
        "the new member itv_cleo doesn't hold 2 proposed days",
      ]);
      expect(join(after([row("itv_cleo", "monday"), row("itv_cleo", "saturday")]))).toEqual([
        "the new member itv_cleo was given monday, which is held",
      ]);
      expect(
        join(
          after([row("itv_cleo", "wednesday"), row("itv_cleo", "saturday")], {
            days: [...PAIR.slice(1), row("itv_cleo", "wednesday"), row("itv_cleo", "saturday")],
          }),
        ),
      ).toEqual(["a member's days changed though nobody is moved (T6)"]);
      expect(
        join(after([row("itv_cleo", "wednesday"), row("itv_cleo", "saturday")]), [
          ["spr_next", days([], {}, ["itv_cleo"])],
        ]),
      ).toEqual(["a join opened new first days beside the open ones"]);
    });

    it("asks new first days of the join that restarts a club whose first days ended, and of no other", () => {
      const ended = days([], { state: "superseded", version: 2 }, ["itv_ana", "itv_ben"]);
      const next = days([], {}, ["itv_ana", "itv_cleo"]);
      // Ben had left, so Ana was alone; Cleo joins.
      const restart = (proposals: [string, ScheduleProposalRows][], before = ended) =>
        firstDaysJoinProblems(world(["itv_ben", "itv_cleo"], [[P, before]]), world(["itv_ben"], proposals), CLUB, [
          "itv_cleo",
        ]);
      expect(
        restart([
          [P, ended],
          ["spr_next", next],
        ]),
      ).toEqual([]);
      expect(restart([[P, ended]])).toEqual([
        "the join that restarts the club opened no new first days for exactly its members (FQ102)",
      ]);
      expect(
        restart([
          [P, ended],
          ["spr_next", days([], {}, ["itv_ana", "itv_ben", "itv_cleo"])],
        ]),
      ).toEqual(["the join that restarts the club opened no new first days for exactly its members (FQ102)"]);
      expect(
        restart([
          [P, { ...ended, version: 3 }],
          ["spr_next", next],
        ]),
      ).toEqual(["a join changed a proposal that wasn't open first days"]);
      // First days that applied aren't restarted: the new member gets a pick of the free days.
      const applied = days(["itv_ana", "itv_ben"], { state: "applied", version: 2 }, ["itv_ana", "itv_ben"]);
      expect(restart([[P, applied]], applied)).toEqual([]);
      expect(
        restart(
          [
            [P, applied],
            ["spr_next", next],
          ],
          applied,
        ),
      ).toEqual(["a join opened first days the club has no call for"]);
      // A club with no proposal at all, as the matrix's is before its first days are added.
      expect(firstDaysJoinProblems(world(["itv_cleo"], []), world([], []), CLUB, ["itv_cleo"])).toEqual([]);
    });
  });
});
