/// <reference lib="esnext.temporal" />
// The schedule judges, judged (./schedule.ts): each branch of what a cell must get is shown to refuse an
// answer that breaks it, on a world written out here by hand, with no database. The world is the matrix's
// first days (schedule.ts's header): Ana confirmed Monday and Thursday; Ben holds Tuesday and Wednesday, with
// Friday proposed; Cleo holds Wednesday and Saturday; Dee joined after the proposal was made.

import { describe, expect, it } from "vitest";
import { NEUTRAL, pinned, type Expected } from "./harness.ts";
import type { Answer } from "./scanner.ts";
import {
  canonical,
  changeProblems,
  commandExpected,
  daysOfViewer,
  outcomeOf,
  proposalFor,
  sameBody,
  viewerIn,
  weekExpected,
  weekFor,
  type ScheduleMember,
  type ScheduleProposalRows,
  type ScheduleWorld,
  type Weekday,
} from "./schedule.ts";

const CLUB = "clb_here";
const PROPOSAL = "spr_first";
const NOW = Temporal.Instant.from("2026-11-10T15:00:00.5Z");

function member(account: string, joined: string, name: string | null, more: Partial<ScheduleMember> = {}) {
  return { club: CLUB, account, active: true, joinedAt: Temporal.Instant.from(joined), name, avatar: null, ...more };
}

function day(interval: string, weekday: Weekday, suggested: boolean, held: boolean) {
  return { interval, weekday, suggested, held };
}

function world(): ScheduleWorld {
  const proposal: ScheduleProposalRows = {
    club: CLUB,
    state: "open",
    version: 1,
    reason: "activation",
    effectiveFrom: "2026-11-08",
    daysPerMember: 2,
    weekRevision: 1,
    earlier: [],
    scheduleVersion: "sched_first",
    replacedBy: null,
    members: [
      { interval: "itv_cleo", confirmed: false },
      { interval: "itv_ana", confirmed: true },
      { interval: "itv_ben", confirmed: false },
    ],
    days: [
      day("itv_ana", "monday", true, true),
      day("itv_ana", "thursday", true, true),
      day("itv_ben", "tuesday", true, true),
      day("itv_ben", "friday", true, false),
      day("itv_ben", "wednesday", false, true),
      day("itv_cleo", "wednesday", true, true),
      day("itv_cleo", "saturday", true, true),
    ],
  };
  return {
    clubs: new Map([[CLUB, { name: "The Saturdays", timezone: "America/New_York", suspended: false }]]),
    members: new Map([
      ["itv_ana", member("usr_ana", "2026-10-01T00:00:00Z", "Ana", { avatar: "v1" })],
      ["itv_ben", member("usr_ben", "2026-10-02T00:00:00Z", "Ben")],
      ["itv_cleo", member("usr_cleo", "2026-10-03T00:00:00Z", "Cleo")],
      ["itv_dee", member("usr_dee", "2026-11-09T00:00:00Z", "Dee")],
    ]),
    activeAccounts: new Set(["usr_ana", "usr_ben", "usr_cleo", "usr_dee"]),
    versions: [
      {
        id: "sched_old",
        club: CLUB,
        effectiveFrom: "2026-10-05",
        assignments: [{ weekday: "saturday", star: "itv_ana", firstDate: "2026-10-10" }],
      },
      {
        id: "sched_first",
        club: CLUB,
        effectiveFrom: "2026-11-08",
        assignments: [
          { weekday: "thursday", star: "itv_ana", firstDate: "2026-11-12" },
          { weekday: "monday", star: "itv_ana", firstDate: "2026-11-09" },
        ],
      },
    ],
    proposals: new Map([[PROPOSAL, proposal]]),
  };
}

const rows = (w: ScheduleWorld): ScheduleProposalRows => {
  const found = w.proposals.get(PROPOSAL);
  if (found === undefined) throw new Error("the world lost its proposal");
  return found;
};

/** An answer as the app sends it, with its Date where the app puts it (harness.ts, NEUTRAL_ORDER). */
function sent(answer: Answer, more: Record<string, string> = {}): Answer {
  const { connection, ...headers } = { ...answer.headers, ...more };
  return { ...answer, headers: { ...headers, date: new Date().toUTCString(), connection: connection ?? "keep-alive" } };
}

function ok(body: unknown, headers: Record<string, string> = {}): Answer {
  return sent(pinned(200, "OK", JSON.stringify(body)), headers);
}

const NOT_FOUND = sent(NEUTRAL);

/** A judge that reads its cell, as the function it is. */
function judging(expected: Expected): (answer: Answer) => string[] {
  if (typeof expected !== "function") throw new Error("a schedule judge reads its cell: it is never a pinned answer");
  return expected;
}

type Slot = Record<string, unknown>;
const slots = (w: ScheduleWorld, viewer: string) => proposalFor(w, PROPOSAL, viewer)["slots"] as Slot[];
const slot = (w: ScheduleWorld, viewer: string, weekday: Weekday) => {
  const found = slots(w, viewer).find((each) => each["weekday"] === weekday);
  if (found === undefined) throw new Error(`no ${weekday}`);
  return found;
};

const ANA = { membership_id: "itv_ana", display_name: "Ana", avatar_version: "v1" };
const BEN = { membership_id: "itv_ben", display_name: "Ben" };
const CLEO = { membership_id: "itv_cleo", display_name: "Cleo" };

describe("who the schedule is for (T9, T14)", () => {
  it("is nobody signed out, an account that isn't active, a member who left, or a suspended club", () => {
    expect(viewerIn(world(), CLUB, "usr_ben")).toBe("itv_ben");
    expect(viewerIn(world(), CLUB, null)).toBeUndefined();
    expect(viewerIn(world(), CLUB, "usr_stranger")).toBeUndefined();
    expect(viewerIn(world(), "clb_elsewhere", "usr_ben")).toBeUndefined();
    const inactive = world();
    inactive.activeAccounts.delete("usr_ben");
    expect(viewerIn(inactive, CLUB, "usr_ben")).toBeUndefined();
    const left = world();
    left.members.set("itv_ben", member("usr_ben", "2026-10-02T00:00:00Z", "Ben", { active: false }));
    expect(viewerIn(left, CLUB, "usr_ben")).toBeUndefined();
    const suspended = world();
    suspended.clubs.set(CLUB, { name: "The Saturdays", timezone: "America/New_York", suspended: true });
    expect(viewerIn(suspended, CLUB, "usr_ben")).toBeUndefined();
  });
});

describe("a proposal as one member sees it", () => {
  it("gives a member still choosing every kind of slot, from Monday", () => {
    expect(proposalFor(world(), PROPOSAL, "itv_ben")).toEqual({
      id: PROPOSAL,
      version: 1,
      reason: "activation",
      effective_from: "2026-11-08",
      days_per_member: 2,
      slots: [
        { weekday: "monday", state: "taken", owner: ANA, first_date: "2026-11-09", suggested: false },
        { weekday: "tuesday", state: "yours", suggested: true },
        { weekday: "wednesday", state: "clash", holders: [BEN, CLEO], suggested: false },
        { weekday: "thursday", state: "taken", owner: ANA, first_date: "2026-11-12", suggested: false },
        { weekday: "friday", state: "available", suggested: true },
        { weekday: "saturday", state: "available", held_by: CLEO, suggested: false },
      ],
      my_days: ["tuesday", "wednesday"],
      my_state: "choosing",
      state: "open",
    });
  });

  it("gives the member who confirmed their own days as theirs, and nobody's hold or contest", () => {
    expect(slots(world(), "itv_ana")).toEqual([
      { weekday: "monday", state: "yours", first_date: "2026-11-09", suggested: true },
      { weekday: "tuesday", state: "available", suggested: false },
      { weekday: "wednesday", state: "no_reveal", suggested: false },
      { weekday: "thursday", state: "yours", first_date: "2026-11-12", suggested: true },
      { weekday: "friday", state: "available", suggested: false },
      { weekday: "saturday", state: "available", suggested: false },
    ]);
    expect(proposalFor(world(), PROPOSAL, "itv_ana")["my_state"]).toBe("confirmed");
  });

  it("never names a viewer as the holder of a day they don't hold, and names holders in the order they joined", () => {
    expect(slot(world(), "itv_cleo", "tuesday")).toEqual({
      weekday: "tuesday",
      state: "available",
      held_by: BEN,
      suggested: false,
    });
    expect(slot(world(), "itv_cleo", "wednesday")["holders"]).toEqual([BEN, CLEO]);
    const tied = world();
    tied.members.set("itv_ben", member("usr_ben", "2026-10-03T00:00:00Z", "Ben"));
    expect(slot(tied, "itv_cleo", "wednesday")["holders"]).toEqual([BEN, CLEO]);
    tied.members.set("itv_ben", member("usr_ben", "2026-10-03T00:00:00.001Z", "Ben"));
    expect(slot(tied, "itv_cleo", "wednesday")["holders"]).toEqual([CLEO, BEN]);
  });

  it("drops the hold of a member who left, and the date and name of a confirmed member who left (FQ63, FQ75)", () => {
    const left = world();
    left.members.set("itv_cleo", member("usr_cleo", "2026-10-03T00:00:00Z", "Cleo", { active: false }));
    expect(slot(left, "itv_ben", "wednesday")).toEqual({ weekday: "wednesday", state: "yours", suggested: false });
    expect(slot(left, "itv_ben", "saturday")).toEqual({ weekday: "saturday", state: "available", suggested: false });
    left.members.set("itv_ana", member("usr_ana", "2026-10-01T00:00:00Z", null, { active: false }));
    expect(slot(left, "itv_ben", "monday")).toEqual({ weekday: "monday", state: "taken", suggested: false });
  });

  it("refuses a viewer the proposal doesn't include, and a proposal the world doesn't hold", () => {
    expect(() => proposalFor(world(), PROPOSAL, "itv_dee")).toThrow("doesn't include");
    expect(() => proposalFor(world(), "spr_none", "itv_ben")).toThrow("doesn't hold");
  });
});

describe("the club's Schedule (getSchedule)", () => {
  const seen = (w: ScheduleWorld, account: string | null) => () => ({ schedule: w, account, now: NOW });
  const judge = (w: ScheduleWorld, account: string | null) => judging(weekExpected(seen(w, account), CLUB));
  const want = (w: ScheduleWorld, account: string): Record<string, unknown> => {
    const found = weekFor(w, CLUB, account, NOW);
    if (found === undefined) throw new Error("no week");
    return found;
  };

  it("is the week in force today, in the club's zone, with the open proposal for a member it includes", () => {
    expect(want(world(), "usr_ben")).toEqual({
      server_now: "2026-11-10T15:00:00Z",
      club: { id: CLUB, name: "The Saturdays", timezone: "America/New_York", my_membership_id: "itv_ben" },
      current: {
        effective_from: "2026-11-08",
        assignments: [
          { weekday: "monday", person: ANA },
          { weekday: "thursday", person: ANA },
        ],
      },
      proposal: proposalFor(world(), PROPOSAL, "itv_ben"),
    });
    // Sunday 8 November begins at 05:00Z in New York: an hour before, the earlier version is in force.
    const before = weekFor(world(), CLUB, "usr_ben", Temporal.Instant.from("2026-11-08T04:59:59Z"));
    expect(before?.["current"]).toEqual({
      effective_from: "2026-10-05",
      assignments: [{ weekday: "saturday", person: ANA }],
    });
  });

  it("gives a member who joined after the proposal `current` alone (FQ100)", () => {
    const week = want(world(), "usr_dee");
    expect(Object.keys(week).sort()).toEqual(["club", "current", "server_now"]);
  });

  it("gives no `current` when no day in force has a star with a name, and none of an applied proposal", () => {
    const nameless = world();
    nameless.members.set("itv_ana", member("usr_ana", "2026-10-01T00:00:00Z", null, { active: false }));
    expect(Object.keys(want(nameless, "usr_ben")).sort()).toEqual(["club", "proposal", "server_now"]);
    const applied = world();
    rows(applied).state = "applied";
    expect(Object.keys(want(applied, "usr_ben")).sort()).toEqual(["club", "current", "server_now"]);
  });

  it("accepts the right answer whatever the order of its keys, and only with private, no-store", () => {
    const body = want(world(), "usr_ben");
    expect(judge(world(), "usr_ben")(ok(body))).toEqual([]);
    const reversed = Object.fromEntries(Object.entries(body).reverse());
    expect(judge(world(), "usr_ben")(ok(reversed))).toEqual([]);
    expect(judge(world(), "usr_ben")(ok(body, { "cache-control": "no-cache" }))).toEqual([
      "the club's Schedule without private, no-store",
    ]);
  });

  it("refuses another member's view, a name on someone else's hold, a wrong instant and a missing part", () => {
    const body = want(world(), "usr_ben");
    const asCleo = { ...body, proposal: proposalFor(world(), PROPOSAL, "itv_cleo") };
    expect(judge(world(), "usr_ben")(ok(asCleo))[0]).toMatch(/^the club's Schedule's proposal is /);
    const confirmed = want(world(), "usr_ana");
    const proposal = confirmed["proposal"] as Record<string, unknown>;
    const leaked = (proposal["slots"] as Slot[]).map((each) =>
      each["weekday"] === "saturday" ? { ...each, held_by: CLEO } : each,
    );
    const problems = judge(world(), "usr_ana")(ok({ ...confirmed, proposal: { ...proposal, slots: leaked } }));
    expect(problems).toHaveLength(1);
    expect(judge(world(), "usr_ben")(ok({ ...body, server_now: "2026-11-10T15:00:01Z" }))).toHaveLength(1);
    const without = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "current"));
    expect(judge(world(), "usr_ben")(ok(without))).toEqual([
      expect.stringMatching(/^the club's Schedule's current is undefined, not /),
    ]);
    expect(judge(world(), "usr_ben")(NOT_FOUND)).toEqual(["status 404, not the club's Schedule"]);
    expect(sameBody("a body", {})({ ...ok({}), body: "not json" })).toEqual(["not a body"]);
  });

  it("holds anyone the club isn't for to the neutral not-found, byte for byte", () => {
    expect(judge(world(), "usr_stranger")(NOT_FOUND)).toEqual([]);
    expect(judge(world(), null)(NOT_FOUND)).toEqual([]);
    expect(judge(world(), "usr_stranger")(ok(want(world(), "usr_ben"))).length).toBeGreaterThan(0);
    const told = sent(pinned(404, "Not Found", '{"code":"NOT_FOUND","club":"clb_here"}'));
    expect(judge(world(), "usr_stranger")(told).length).toBeGreaterThan(0);
  });
});

describe("what a command must get, in the contract's order", () => {
  const body = (weekdays: readonly Weekday[], version = 1) => ({ expected_version: version, weekdays });
  const choose = (w: ScheduleWorld, account: string | null, weekdays: readonly Weekday[], version = 1) =>
    outcomeOf(w, "chooseScheduleDays", PROPOSAL, account, body(weekdays, version));
  const confirm = (w: ScheduleWorld, account: string | null, weekdays: readonly Weekday[], version = 1) =>
    outcomeOf(w, "confirmScheduleDays", PROPOSAL, account, body(weekdays, version));
  const code = (outcome: Answer | "ok") => (outcome === "ok" ? "ok" : outcome.body);

  it("is the neutral not-found for anyone the proposal doesn't include, whatever else is true", () => {
    const replaced = world();
    rows(replaced).replacedBy = "spr_next";
    for (const account of [null, "usr_stranger", "usr_dee"]) {
      expect(choose(world(), account, ["friday"], 9)).toBe(NEUTRAL);
      expect(confirm(replaced, account, ["monday"])).toBe(NEUTRAL);
    }
    expect(outcomeOf(world(), "chooseScheduleDays", "spr_none", "usr_ben", body(["friday"]))).toBe(NEUTRAL);
  });

  it("is MEMBERSHIP_CHANGED before the version, the version before NOT_ALLOWED", () => {
    const replaced = world();
    rows(replaced).replacedBy = "spr_next";
    rows(replaced).state = "superseded";
    expect(code(choose(replaced, "usr_ben", ["monday"], 9))).toBe(
      '{"code":"MEMBERSHIP_CHANGED","current_id":"spr_next"}',
    );
    expect(code(choose(world(), "usr_ben", ["monday"], 2))).toBe('{"code":"VERSION_CONFLICT","current_version":1}');
    expect(code(choose(world(), "usr_ana", ["friday"], 2))).toBe('{"code":"VERSION_CONFLICT","current_version":1}');
  });

  it("is NOT_ALLOWED for a closed proposal, a member who confirmed, a confirmed day and too many days", () => {
    const refused = '{"code":"NOT_ALLOWED"}';
    const applied = world();
    rows(applied).state = "applied";
    expect(code(choose(applied, "usr_ben", ["friday"]))).toBe(refused);
    expect(code(choose(world(), "usr_ana", ["friday"]))).toBe(refused);
    expect(code(choose(world(), "usr_ben", ["monday"]))).toBe(refused);
    expect(code(choose(world(), "usr_ben", ["tuesday", "friday", "saturday"]))).toBe(refused);
    expect(code(choose(world(), "usr_ben", ["tuesday", "friday"]))).toBe("ok");
    expect(code(choose(world(), "usr_ben", []))).toBe("ok");
    // A choice may name a day someone else holds: that is how a contest begins (FQ55).
    expect(code(choose(world(), "usr_ben", ["saturday"]))).toBe("ok");
  });

  it("confirms only exactly the days the viewer holds, all of them, none contested", () => {
    const refused = '{"code":"NOT_ALLOWED"}';
    expect(code(confirm(world(), "usr_ben", ["tuesday", "wednesday"]))).toBe(refused);
    expect(code(confirm(world(), "usr_cleo", ["saturday"]))).toBe(refused);
    const free = world();
    rows(free).days = rows(free).days.map((each) =>
      each.interval === "itv_ben" ? { ...each, held: each.weekday !== "wednesday" } : each,
    );
    expect(code(confirm(free, "usr_ben", ["friday", "tuesday"]))).toBe("ok");
    expect(code(confirm(free, "usr_ben", ["tuesday"]))).toBe(refused);
    expect(code(confirm(free, "usr_ben", ["tuesday", "saturday"]))).toBe(refused);
    expect(code(confirm(free, "usr_cleo", ["wednesday", "saturday"]))).toBe("ok");
    // The hold of a member who left contests nothing.
    const left = world();
    left.members.set("itv_cleo", member("usr_cleo", "2026-10-03T00:00:00Z", "Cleo", { active: false }));
    expect(code(confirm(left, "usr_ben", ["tuesday", "wednesday"]))).toBe("ok");
  });

  it("judges the matrix's generic request by the same rules, and never lets it change the world", () => {
    const seen = (account: string | null) => () => ({ schedule: world(), account, now: NOW });
    const judge = (account: string | null) =>
      judging(commandExpected(seen(account), "chooseScheduleDays", PROPOSAL, 1));
    const refused = sent(pinned(403, "Forbidden", '{"code":"NOT_ALLOWED"}'));
    expect(judge("usr_ben")(refused)).toEqual([]);
    expect(judge("usr_ben")(NOT_FOUND).length).toBeGreaterThan(0);
    expect(judge("usr_stranger")(NOT_FOUND)).toEqual([]);
    expect(judge("usr_stranger")(refused).length).toBeGreaterThan(0);
    const free = world();
    rows(free).members = rows(free).members.map((each) => ({ ...each, confirmed: false }));
    const loose = judging(
      commandExpected(() => ({ schedule: free, account: "usr_ben", now: NOW }), "chooseScheduleDays", PROPOSAL, 1),
    );
    expect(loose(ok({}))).toEqual(["the judge's own generic request would change the world"]);
  });
});

describe("what an accepted command must leave in the rows (T6, T33, T49)", () => {
  /** Ben's choice of Tuesday and Friday, as the rows should then stand. */
  const chosen = () => {
    const after = world();
    rows(after).days = rows(after)
      .days.filter((each) => !(each.interval === "itv_ben" && each.weekday === "wednesday"))
      .map((each) => (each.interval === "itv_ben" ? { ...each, held: true } : each));
    return after;
  };
  /** Then Ben's confirmation of them. */
  const confirmed = () => {
    const after = chosen();
    rows(after).members = rows(after).members.map((each) =>
      each.interval === "itv_ben" ? { ...each, confirmed: true } : each,
    );
    after.versions[1]?.assignments.push(
      { weekday: "tuesday", star: "itv_ben", firstDate: "2026-11-17" },
      { weekday: "friday", star: "itv_ben", firstDate: "2026-11-13" },
    );
    return after;
  };
  const chose = (after: ScheduleWorld) =>
    changeProblems(world(), after, "chooseScheduleDays", PROPOSAL, "usr_ben", ["friday", "tuesday"]);
  const confirmedOf = (before: ScheduleWorld, after: ScheduleWorld, account = "usr_ben") =>
    changeProblems(before, after, "confirmScheduleDays", PROPOSAL, account, ["tuesday", "friday"]);

  it("accepts the choice as asked, and refuses each way it can go wrong", () => {
    expect(chose(chosen())).toEqual([]);
    expect(chose(world())).toEqual(["the viewer holds tuesday, wednesday, not tuesday, friday"]);
    const swapped = chosen();
    rows(swapped).days = rows(swapped).days.filter((each) => each.interval !== "itv_cleo");
    expect(chose(swapped)).toEqual(["another member's days changed"]);
    const moved = chosen();
    rows(moved).version = 2;
    expect(chose(moved)).toEqual(["a choice moved the version or the state (T33)"]);
    const early = chosen();
    rows(early).members = rows(early).members.map((each) => ({ ...each, confirmed: true }));
    expect(chose(early)).toEqual(["a choice confirmed the viewer"]);
    const gone = chosen();
    gone.proposals.clear();
    expect(chose(gone)).toEqual(["the proposal is gone from the rows"]);
    const left = chosen();
    left.activeAccounts.delete("usr_ben");
    expect(chose(left)).toEqual(["the viewer is no longer a member after their own request"]);
  });

  it("accepts a confirmation that leaves others choosing, and refuses one with no dated day or a moved version", () => {
    expect(confirmedOf(chosen(), confirmed())).toEqual([]);
    expect(confirmedOf(chosen(), chosen())).toEqual([
      "the viewer isn't confirmed after their confirmation",
      "tuesday has no dated day of the viewer's (T49)",
      "friday has no dated day of the viewer's (T49)",
    ]);
    const others = confirmed();
    const dated = others.versions[1]?.assignments ?? [];
    dated.splice(dated.length - 1, 1, { weekday: "friday", star: "itv_cleo", firstDate: "2026-11-13" });
    expect(confirmedOf(chosen(), others)).toEqual(["friday has no dated day of the viewer's (T49)"]);
    const moved = confirmed();
    rows(moved).version = 2;
    expect(confirmedOf(chosen(), moved)).toEqual(["the proposal is open at version 2, not open at 1 (T33)"]);
    const applied = confirmed();
    rows(applied).state = "applied";
    rows(applied).version = 2;
    expect(confirmedOf(chosen(), applied)).toEqual(["the proposal is applied at version 2, not open at 1 (T33)"]);
  });

  it("wants the proposal applied at its next version exactly when the last active member confirms", () => {
    const last = (state: ScheduleProposalRows["state"], version: number) => {
      const after = confirmed();
      // Cleo left, so Ben's confirmation is the last one.
      after.members.set("itv_cleo", member("usr_cleo", "2026-10-03T00:00:00Z", "Cleo", { active: false }));
      rows(after).state = state;
      rows(after).version = version;
      return after;
    };
    expect(confirmedOf(chosen(), last("applied", 2))).toEqual([]);
    expect(confirmedOf(chosen(), last("open", 1))).toEqual([
      "the proposal is open at version 1, not applied at 2 (T33)",
    ]);
    expect(confirmedOf(chosen(), last("applied", 1))).toEqual([
      "the proposal is applied at version 1, not applied at 2 (T33)",
    ]);
  });
});

describe("the judges' own helpers", () => {
  it("reads a viewer's held and proposed days, and none for a viewer the proposal isn't for", () => {
    expect(daysOfViewer(world(), PROPOSAL, "usr_ben")).toEqual({
      held: ["tuesday", "wednesday"],
      suggested: ["tuesday", "friday"],
    });
    expect(daysOfViewer(world(), PROPOSAL, "usr_stranger")).toEqual({ held: [], suggested: [] });
    expect(daysOfViewer(world(), "spr_none", "usr_ben")).toEqual({ held: [], suggested: [] });
  });

  it("compares values whatever the order of their keys, and tells a missing key from a null", () => {
    expect(canonical({ b: [1, { d: 2, c: 3 }], a: "x" })).toBe('{"a":"x","b":[1,{"c":3,"d":2}]}');
    expect(canonical({ a: null })).not.toBe(canonical({}));
    expect(canonical(undefined)).toBe("undefined");
  });
});
