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
  rowsSeen,
  sameBody,
  viewerIn,
  weekChangeProblems,
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
    // The proposal that replaced it, open: the id the refusal names.
    replaced.proposals.set("spr_next", { ...rows(world()), version: 1 });
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

  it("compares a table of rows whatever order its query gave them in, and tells a moved instant from none", () => {
    const at = (iso = "2026-11-02T08:30:00.123456Z") => Temporal.Instant.from(iso);
    const one = () => ({ state: "live", expiresAt: at(), drop: null });
    const two = () => ({ state: "released", expiresAt: at(), drop: null });
    const rows = new Map<string, object>([
      ["res_b", two()],
      ["res_a", one()],
    ]);
    // The same rows read again, as from the database: new objects, new instants, another order. `canonical` of
    // the entries tells them apart; `rowsSeen` doesn't.
    const reread = new Map<string, object>([
      ["res_a", one()],
      ["res_b", two()],
    ]);
    expect(canonical([...rows])).not.toBe(canonical([...reread]));
    expect(rowsSeen(rows)).toBe(rowsSeen(reread));
    // An instant that moved, by a millisecond or by a microsecond: `canonical` writes both as `{}`, `rowsSeen`
    // tells them apart.
    for (const later of ["2026-11-02T08:30:00.124456Z", "2026-11-02T08:30:00.123457Z"]) {
      const moved = new Map<string, object>([...rows, ["res_a", { ...one(), expiresAt: at(later) }]]);
      expect(canonical([...moved].sort())).toBe(canonical([...rows].sort()));
      expect(rowsSeen(moved)).not.toBe(rowsSeen(rows));
    }
    // A row's state, a row gone and a row more each count.
    expect(rowsSeen(new Map([...rows, ["res_a", { ...one(), state: "expired" }]]))).not.toBe(rowsSeen(rows));
    expect(rowsSeen(new Map([["res_a", one()]]))).not.toBe(rowsSeen(rows));
    expect(rowsSeen(new Map([...rows, ["res_c", one()]]))).not.toBe(rowsSeen(rows));
    expect(rowsSeen(rows)).toBe(
      '[["res_a",{"drop":null,"expiresAt":"2026-11-02T08:30:00.123456Z","state":"live"}],' +
        '["res_b",{"drop":null,"expiresAt":"2026-11-02T08:30:00.123456Z","state":"released"}]]',
    );
    // The memberships' rows (a `ScheduleMember`), the other table the matrix compares this way.
    const member = (active: boolean, joinedAt = "2026-10-01T00:00:00Z") => ({
      club: CLUB,
      account: "usr_ana",
      active,
      joinedAt: at(joinedAt),
      name: "Ana",
      avatar: null,
    });
    const members = new Map<string, object>([
      ["itv_ben", { ...member(true), account: "usr_ben", name: "Ben" }],
      ["itv_ana", member(true)],
    ]);
    expect(rowsSeen(new Map([...members].reverse()))).toBe(rowsSeen(members));
    expect(rowsSeen(new Map([...members, ["itv_ana", member(false)]]))).not.toBe(rowsSeen(members));
    expect(rowsSeen(new Map([...members, ["itv_ana", member(true, "2026-10-01T00:00:01Z")]]))).not.toBe(
      rowsSeen(members),
    );
    // A row holding any other object is refused, not written `{}` and compared blind.
    expect(() => rowsSeen(new Map([["res_a", { ...one(), audience: new Set(["itv_ana"]) }]]))).toThrow(TypeError);
    expect(() => rowsSeen(new Map([["res_a", { ...one(), labels: new Map() }]]))).toThrow(TypeError);
    expect(() => rowsSeen(new Map([["res_a", { ...one(), at: new Date(0) }]]))).toThrow(TypeError);
  });
});

// A new member's pick, on a world written out by hand: Ana and Ben have the club's week, two days each
// (Ana's Monday and Thursday, Ben's Tuesday and Friday), and Cleo joined after it. The pick includes Cleo
// alone, holding Wednesday and Saturday, spec 05's days for the third of three.
const PICK = "spr_pick";
const TODAY = "2026-11-11";

function pickRows(more: Partial<ScheduleProposalRows> = {}): ScheduleProposalRows {
  return {
    club: CLUB,
    state: "open",
    version: 1,
    reason: "membership_change",
    effectiveFrom: TODAY,
    daysPerMember: 2,
    weekRevision: 1,
    earlier: [],
    scheduleVersion: null,
    replacedBy: null,
    members: [{ interval: "itv_cleo", confirmed: false }],
    days: [day("itv_cleo", "wednesday", true, true), day("itv_cleo", "saturday", true, true)],
    ...more,
  };
}

const assignment = (weekday: Weekday, star: string, firstDate: string) => ({ weekday, star, firstDate });
const ANA_BEN = [
  assignment("monday", "itv_ana", "2026-11-02"),
  assignment("tuesday", "itv_ben", "2026-11-03"),
  assignment("thursday", "itv_ana", "2026-11-05"),
  assignment("friday", "itv_ben", "2026-11-06"),
];

/** The club with its applied first days, the week of Ana and Ben, Cleo, Dee, Eve and Fay, and `proposals`. */
function pickWorld(proposals: [string, ScheduleProposalRows][] = [[PICK, pickRows()]]): ScheduleWorld {
  const first: ScheduleProposalRows = {
    ...pickRows(),
    reason: "activation",
    state: "applied",
    version: 2,
    effectiveFrom: "2026-11-02",
    scheduleVersion: "sched_week",
    members: [
      { interval: "itv_ana", confirmed: true },
      { interval: "itv_ben", confirmed: true },
    ],
    days: ANA_BEN.map((each) => day(each.star, each.weekday, true, true)),
  };
  return {
    clubs: new Map([[CLUB, { name: "The Saturdays", timezone: "America/New_York", suspended: false }]]),
    members: new Map([
      ["itv_ana", member("usr_ana", "2026-10-01T00:00:00Z", "Ana", { avatar: "v1" })],
      ["itv_ben", member("usr_ben", "2026-10-02T00:00:00Z", "Ben")],
      ["itv_cleo", member("usr_cleo", "2026-11-09T00:00:00Z", "Cleo")],
      ["itv_dee", member("usr_dee", "2026-11-10T00:00:00Z", "Dee", { active: false })],
      ["itv_eve", member("usr_eve", "2026-11-10T01:00:00Z", "Eve", { active: false })],
      ["itv_fay", member("usr_fay", "2026-11-10T02:00:00Z", "Fay", { active: false })],
    ]),
    activeAccounts: new Set(["usr_ana", "usr_ben", "usr_cleo", "usr_dee", "usr_eve", "usr_fay"]),
    versions: [{ id: "sched_week", club: CLUB, effectiveFrom: "2026-11-02", assignments: [...ANA_BEN] }],
    proposals: new Map([["spr_first", first], ...proposals]),
  };
}

const pickOf = (w: ScheduleWorld, id = PICK): ScheduleProposalRows => {
  const found = w.proposals.get(id);
  if (found === undefined) throw new Error("the world lost its pick");
  return found;
};
const setActive = (w: ScheduleWorld, interval: string, active: boolean): ScheduleWorld => {
  const found = w.members.get(interval);
  if (found !== undefined) found.active = active;
  return w;
};
/** `w` with a later week from `effectiveFrom` holding `assignments`. */
const withWeek = (
  w: ScheduleWorld,
  id: string,
  effectiveFrom: string,
  assignments: ReturnType<typeof assignment>[],
) => {
  w.versions.push({ id, club: CLUB, effectiveFrom, assignments });
  return w;
};
const pickSlots = (w: ScheduleWorld, viewer: string, id = PICK) => proposalFor(w, id, viewer)["slots"] as Slot[];
const DEE = { membership_id: "itv_dee", display_name: "Dee" };

describe("a new member's pick as one member sees it (FQ125, FQ127, FQ130)", () => {
  it("gives the new member each day of the week in force as its member's, with no first date, and the free days", () => {
    expect(proposalFor(pickWorld(), PICK, "itv_cleo")).toEqual({
      id: PICK,
      version: 1,
      reason: "membership_change",
      effective_from: TODAY,
      days_per_member: 2,
      slots: [
        { weekday: "monday", state: "taken", owner: ANA, suggested: false },
        { weekday: "tuesday", state: "taken", owner: BEN, suggested: false },
        { weekday: "wednesday", state: "yours", suggested: true },
        { weekday: "thursday", state: "taken", owner: ANA, suggested: false },
        { weekday: "friday", state: "taken", owner: BEN, suggested: false },
        { weekday: "saturday", state: "yours", suggested: true },
      ],
      my_days: ["wednesday", "saturday"],
      my_state: "choosing",
      state: "open",
    });
    // Ana is in the week, not in the pick.
    expect(() => proposalFor(pickWorld(), PICK, "itv_ana")).toThrow(/doesn't include/);
  });

  it("frees a leaver's days, and shows a choice, a contest and a confirmed new member as the first days do", () => {
    const gone = setActive(pickWorld(), "itv_ben", false);
    // Cleo has taken Ben's Tuesday in place of the proposed Wednesday, which stays marked as proposed.
    pickOf(gone).days = [
      day("itv_cleo", "tuesday", false, true),
      day("itv_cleo", "wednesday", true, false),
      day("itv_cleo", "saturday", true, true),
    ];
    expect(pickSlots(gone, "itv_cleo").slice(1, 3)).toEqual([
      { weekday: "tuesday", state: "yours", suggested: false },
      { weekday: "wednesday", state: "available", suggested: true },
    ]);
    expect(pickSlots(gone, "itv_cleo")[4]).toEqual({ weekday: "friday", state: "available", suggested: false });
    // Dee joined too, and holds Wednesday and Friday's... Wednesday: a contest for both, a name for one.
    const two = setActive(pickWorld(), "itv_dee", true);
    pickOf(two).members.push({ interval: "itv_dee", confirmed: false });
    pickOf(two).days.push(day("itv_dee", "wednesday", false, true));
    expect(pickSlots(two, "itv_cleo")[2]).toEqual({
      weekday: "wednesday",
      state: "clash",
      holders: [CLEO, DEE],
      suggested: true,
    });
    expect(pickSlots(two, "itv_dee")[5]).toEqual({
      weekday: "saturday",
      state: "available",
      held_by: CLEO,
      suggested: false,
    });
    // Cleo confirms, in a new week: Cleo's own days show their first dates, and to Dee they are taken, undated.
    pickOf(two).days = [
      day("itv_cleo", "wednesday", true, true),
      day("itv_cleo", "saturday", true, true),
      day("itv_dee", "friday", false, true),
    ];
    pickOf(two).members[0] = { interval: "itv_cleo", confirmed: true };
    withWeek(two, "sched_cleo", TODAY, [
      ...ANA_BEN,
      assignment("wednesday", "itv_cleo", "2026-11-18"),
      assignment("saturday", "itv_cleo", "2026-11-21"),
    ]);
    const cleo = proposalFor(two, PICK, "itv_cleo");
    expect(cleo["my_state"]).toBe("confirmed");
    expect((cleo["slots"] as Slot[]).map((each) => [each["state"], each["first_date"]])).toEqual([
      ["taken", undefined],
      ["taken", undefined],
      ["yours", "2026-11-18"],
      ["taken", undefined],
      ["taken", undefined],
      ["yours", "2026-11-21"],
    ]);
    expect(pickSlots(two, "itv_dee")[2]).toEqual({
      weekday: "wednesday",
      state: "taken",
      owner: CLEO,
      suggested: false,
    });
  });

  it("is in the club's Schedule of the members it includes alone (FQ126)", () => {
    expect(weekFor(pickWorld(), CLUB, "usr_ana", NOW)).not.toHaveProperty("proposal");
    const cleo = weekFor(pickWorld(), CLUB, "usr_cleo", NOW);
    expect(cleo?.["proposal"]).toEqual(proposalFor(pickWorld(), PICK, "itv_cleo"));
    const anaJudge = judging(weekExpected(() => ({ schedule: pickWorld(), account: "usr_ana", now: NOW }), CLUB));
    const ana = weekFor(pickWorld(), CLUB, "usr_ana", NOW);
    expect(anaJudge(ok(ana))).toEqual([]);
    expect(anaJudge(ok({ ...ana, proposal: cleo?.["proposal"] })).join(" ")).toMatch(/proposal/);
  });

  it("leaves a member who left out of the club's week, by day and by name, for every member (FQ102, FQ124)", () => {
    // Ben has left: Ben's Tuesday and Friday are in no member's `current`, and Ben's name with them.
    const w = setActive(pickWorld([]), "itv_ben", false);
    const cleos = weekFor(w, CLUB, "usr_cleo", NOW);
    expect(cleos?.["current"]).toEqual({
      effective_from: "2026-11-02",
      assignments: [
        { weekday: "monday", person: ANA },
        { weekday: "thursday", person: ANA },
      ],
    });
    expect(weekFor(w, CLUB, "usr_ana", NOW)?.["current"]).toEqual(cleos?.["current"]);
    const cleoJudge = judging(weekExpected(() => ({ schedule: w, account: "usr_cleo", now: NOW }), CLUB));
    expect(cleoJudge(ok(cleos))).toEqual([]);
    const named = {
      ...cleos,
      current: {
        effective_from: "2026-11-02",
        assignments: [
          { weekday: "monday", person: ANA },
          { weekday: "tuesday", person: { ...BEN, avatar_version: null } },
          { weekday: "thursday", person: ANA },
        ],
      },
    };
    expect(cleoJudge(ok(named))).not.toEqual([]);
  });
});

describe("what a command must get in a pick (FQ55, FQ99, FQ125, FQ127, FQ131)", () => {
  const ask = (
    w: ScheduleWorld,
    command: "chooseScheduleDays" | "confirmScheduleDays",
    weekdays: Weekday[],
    version = 1,
    account = "usr_cleo",
    id = PICK,
  ) => outcomeOf(w, command, id, account, { expected_version: version, weekdays });
  const code = (answer: Answer | "ok") => (answer === "ok" ? "ok" : answer.body);

  it("takes a choice of free days, never a day of the week in force or more than days_per_member", () => {
    for (const days of [["saturday"], [], ["wednesday", "saturday"]] as Weekday[][]) {
      expect(ask(pickWorld(), "chooseScheduleDays", days), days.join()).toBe("ok");
    }
    for (const days of [["monday"], ["tuesday", "wednesday"], ["wednesday", "saturday", "friday"]] as Weekday[][]) {
      expect(code(ask(pickWorld(), "chooseScheduleDays", days)), days.join()).toMatch(/NOT_ALLOWED/);
    }
    // Ben left: Tuesday and Friday are free.
    expect(ask(setActive(pickWorld(), "itv_ben", false), "chooseScheduleDays", ["tuesday", "friday"])).toBe("ok");
  });

  it("confirms exactly the days held, none contested, once", () => {
    expect(ask(pickWorld(), "confirmScheduleDays", ["saturday", "wednesday"])).toBe("ok");
    for (const days of [["wednesday"], ["monday", "thursday"], ["wednesday", "friday"]] as Weekday[][]) {
      expect(code(ask(pickWorld(), "confirmScheduleDays", days)), days.join()).toMatch(/NOT_ALLOWED/);
    }
    const two = setActive(pickWorld(), "itv_dee", true);
    pickOf(two).members.push({ interval: "itv_dee", confirmed: false });
    pickOf(two).days.push(day("itv_dee", "wednesday", false, true));
    expect(code(ask(two, "confirmScheduleDays", ["wednesday", "saturday"]))).toMatch(/NOT_ALLOWED/);
    // Dee leaves, holding nothing.
    expect(ask(setActive(two, "itv_dee", false), "confirmScheduleDays", ["wednesday", "saturday"])).toBe("ok");
    const once = pickWorld();
    pickOf(once).members[0] = { interval: "itv_cleo", confirmed: true };
    expect(code(ask(once, "confirmScheduleDays", ["wednesday", "saturday"]))).toMatch(/NOT_ALLOWED/);
  });

  it("keeps the contract's order: not found, MEMBERSHIP_CHANGED to whom the open pick includes, the version, NOT_ALLOWED", () => {
    expect(ask(pickWorld(), "confirmScheduleDays", ["monday", "thursday"], 1, "usr_ana")).toBe(NEUTRAL);
    const ended = pickRows({ state: "superseded", version: 2, replacedBy: "spr_next" });
    const withDee = (rows: ScheduleProposalRows) => ({
      ...rows,
      members: [...rows.members, { interval: "itv_dee", confirmed: false }],
    });
    const replaced = setActive(
      pickWorld([
        [PICK, ended],
        ["spr_next", withDee(pickRows({ daysPerMember: 1 }))],
      ]),
      "itv_dee",
      true,
    );
    expect(code(ask(replaced, "confirmScheduleDays", ["wednesday", "saturday"]))).toBe(
      '{"code":"MEMBERSHIP_CHANGED","current_id":"spr_next"}',
    );
    // Replaced twice: the open pick, never the ended one between.
    const twice = pickWorld([
      [PICK, ended],
      ["spr_next", pickRows({ state: "superseded", version: 2, replacedBy: "spr_last" })],
      ["spr_last", pickRows()],
    ]);
    expect(code(ask(twice, "confirmScheduleDays", ["wednesday"]))).toBe(
      '{"code":"MEMBERSHIP_CHANGED","current_id":"spr_last"}',
    );
    // An open pick that doesn't include the caller: the replaced one is an ended proposal to them.
    const notMine = setActive(
      pickWorld([
        [PICK, ended],
        ["spr_next", pickRows({ members: [{ interval: "itv_dee", confirmed: false }], days: [] })],
      ]),
      "itv_dee",
      true,
    );
    expect(code(ask(notMine, "confirmScheduleDays", ["wednesday", "saturday"], 1))).toMatch(/VERSION_CONFLICT.*2/);
    expect(code(ask(notMine, "confirmScheduleDays", ["wednesday", "saturday"], 2))).toMatch(/NOT_ALLOWED/);
    // Ended with no successor.
    const dropped = pickWorld([[PICK, pickRows({ state: "superseded", version: 2 })]]);
    expect(code(ask(dropped, "confirmScheduleDays", ["wednesday", "saturday"], 1))).toMatch(/VERSION_CONFLICT.*2/);
    expect(code(ask(dropped, "confirmScheduleDays", ["wednesday", "saturday"], 2))).toMatch(/NOT_ALLOWED/);
  });
});

describe("what a pick's confirmation must leave in the rows (FQ125, FQ126, FQ130; T33)", () => {
  /** Cleo's confirmation: a week from today, Ana's and Ben's days as they were, Cleo's from next week. */
  const confirmed = (more: ReturnType<typeof assignment>[] = []) => {
    const after = pickWorld([[PICK, pickRows({ state: "applied", version: 2 })]]);
    pickOf(after).members[0] = { interval: "itv_cleo", confirmed: true };
    return withWeek(after, "sched_cleo", TODAY, [
      ...ANA_BEN,
      assignment("wednesday", "itv_cleo", "2026-11-18"),
      assignment("saturday", "itv_cleo", "2026-11-21"),
      ...more,
    ]);
  };
  /** Wednesday 11 November, 10 AM in New York. */
  const AT_CONFIRMED = Temporal.Instant.from("2026-11-11T15:00:00Z");
  const judge = (after: ScheduleWorld, before = pickWorld(), at = AT_CONFIRMED) =>
    changeProblems(before, after, "confirmScheduleDays", PICK, "usr_cleo", ["wednesday", "saturday"], TODAY, at);

  it("accepts the new member's days in the club's next week, everyone else's as they were, and the pick applied", () => {
    expect(judge(confirmed())).toEqual([]);
  });

  it("refuses no new week, another start, a day moved or dropped, a day dated this week, and no version", () => {
    const none = confirmed();
    none.versions.pop();
    expect(judge(none).join(" ")).toMatch(/didn't write the club's next week/);
    const later = confirmed();
    const last = later.versions.at(-1);
    if (last !== undefined) last.effectiveFrom = "2026-11-12";
    expect(judge(later).join(" ")).toMatch(/starts on 2026-11-12, not 2026-11-11/);
    const moved = confirmed();
    const week = moved.versions.at(-1);
    if (week !== undefined) week.assignments = week.assignments.filter((each) => each.weekday !== "friday");
    expect(judge(moved).join(" ")).toMatch(/as they were/);
    const soon = confirmed();
    const dated = soon.versions.at(-1);
    if (dated !== undefined)
      dated.assignments = dated.assignments.map((each) =>
        each.weekday === "wednesday" ? { ...each, firstDate: TODAY } : each,
      );
    expect(judge(soon).join(" ")).toMatch(/wednesday first opens on 2026-11-11/);
    // A week late is no closer to FQ130 than a week early.
    const late = confirmed();
    const latest = late.versions.at(-1);
    if (latest !== undefined)
      latest.assignments = latest.assignments.map((each) =>
        each.weekday === "wednesday" ? { ...each, firstDate: "2026-11-25" } : each,
      );
    expect(judge(late).join(" ")).toMatch(/wednesday first opens on 2026-11-25, not 2026-11-18 \(FQ130\)/);
    const stuck = confirmed();
    Object.assign(pickOf(stuck), { state: "open", version: 1 });
    expect(judge(stuck).join(" ")).toMatch(/not applied at 2 \(T33\)/);
    // Ben left before: Ben's days stay out of the new week.
    expect(judge(setActive(confirmed(), "itv_ben", false), setActive(pickWorld(), "itv_ben", false)).join(" ")).toMatch(
      /as they were/,
    );
  });

  it("takes the day after the latest week's start, when that is today or later", () => {
    const before = withWeek(pickWorld(), "sched_today", TODAY, [...ANA_BEN]);
    const after = withWeek(
      withWeek(pickWorld([[PICK, pickRows({ state: "applied", version: 2 })]]), "sched_today", TODAY, [...ANA_BEN]),
      "sched_cleo",
      "2026-11-12",
      [...ANA_BEN, assignment("wednesday", "itv_cleo", "2026-11-18"), assignment("saturday", "itv_cleo", "2026-11-21")],
    );
    pickOf(after).members[0] = { interval: "itv_cleo", confirmed: true };
    expect(judge(after, before)).toEqual([]);
  });
});

describe("what a join or a leave must leave of the club's week and pick, row by row (weekChangeProblems; FQ125 to FQ131)", () => {
  const AT_DAY = { today: TODAY };
  const judge = (before: ScheduleWorld, after: ScheduleWorld, at = AT_DAY) =>
    weekChangeProblems(before, after, CLUB, at);
  /** Ana, Ben and Cleo in the week, two days each, and Dee's join to come. */
  const THREE = [
    ...ANA_BEN,
    assignment("wednesday", "itv_cleo", "2026-11-04"),
    assignment("saturday", "itv_cleo", "2026-11-07"),
  ];
  const three = () => withWeek(pickWorld([]), "sched_three", "2026-11-05", [...THREE]);
  /** Dee's join to `three`: Ana, Ben and Cleo keep their first day in a new week; Dee picks Thursday. */
  const fourth = (
    start = TODAY,
    kept = THREE.filter((each) => ["monday", "tuesday", "wednesday"].includes(each.weekday)),
    today = TODAY,
  ) => {
    const w = setActive(withWeek(three(), "sched_four", start, kept), "itv_dee", true);
    w.proposals.set(
      "spr_dee",
      pickRows({
        effectiveFrom: today,
        daysPerMember: 1,
        members: [{ interval: "itv_dee", confirmed: false }],
        days: [day("itv_dee", "thursday", true, true)],
      }),
    );
    return w;
  };

  it("wants a pick for a member who joins with no day, holding spec 05's days for their place when free", () => {
    const before = setActive(pickWorld([]), "itv_cleo", false);
    expect(judge(before, pickWorld())).toEqual([]);
    expect(judge(before, pickWorld([])).join(" ")).toMatch(/no pick is open though a member has no day/);
    const anaToo = pickWorld([
      [PICK, pickRows({ members: [...pickRows().members, { interval: "itv_ana", confirmed: false }] })],
    ]);
    expect(judge(before, anaToo).join(" ")).toMatch(/not the members with no day/);
    const monday = pickWorld([
      [PICK, pickRows({ days: [day("itv_cleo", "monday", true, true), day("itv_cleo", "saturday", true, true)] })],
    ]);
    expect(judge(before, monday).join(" ")).toMatch(/holds monday, saturday at first, not wednesday, saturday/);
    expect(judge(before, pickWorld([[PICK, pickRows({ daysPerMember: 1 })]])).join(" ")).toMatch(
      /gives 1 days each, not 2/,
    );
    expect(judge(before, pickWorld([[PICK, pickRows({ version: 2 })]])).join(" ")).toMatch(/isn't at version 1/);
    expect(judge(before, pickWorld([[PICK, pickRows({ effectiveFrom: "2026-11-16" })]])).join(" ")).toMatch(
      /is from 2026-11-16, not 2026-11-11/,
    );
    const confirmedAtFirst = pickWorld();
    pickOf(confirmedAtFirst).members[0] = { interval: "itv_cleo", confirmed: true };
    expect(judge(before, confirmedAtFirst).join(" ")).toMatch(/starts with a confirmation/);
    expect(judge(before, withWeek(pickWorld(), "sched_x", TODAY, [...ANA_BEN])).join(" ")).toMatch(/no day was freed/);
  });

  it("wants a fourth member's join to free the others' second days in a new week, and a pick for the fourth", () => {
    expect(judge(setActive(three(), "itv_dee", false), fourth())).toEqual([]);
    const none = fourth();
    none.versions.pop();
    expect(judge(three(), none).join(" ")).toMatch(/freed with no new week/);
    expect(judge(three(), fourth(TODAY, [...THREE])).join(" ")).toMatch(/isn't the days each member keeps/);
    expect(judge(three(), fourth("2026-11-12")).join(" ")).toMatch(/starts on 2026-11-12, not 2026-11-11/);
    const friday = fourth();
    pickOf(friday, "spr_dee").days = [day("itv_dee", "friday", true, true)];
    expect(judge(three(), friday).join(" ")).toMatch(/holds friday at first, not thursday/);
    // The latest week starts today: the new one the day after.
    const onTheWeeksStart = { today: "2026-11-05" };
    expect(judge(three(), fourth("2026-11-06", undefined, "2026-11-05"), onTheWeeksStart)).toEqual([]);
    expect(judge(three(), fourth("2026-11-05", undefined, "2026-11-05"), onTheWeeksStart).join(" ")).toMatch(
      /starts on 2026-11-05, not 2026-11-06/,
    );
  });

  it("asks nobody anything when a member leaves, or joins with everyone keeping their days", () => {
    const left = setActive(three(), "itv_cleo", false);
    expect(judge(three(), left)).toEqual([]);
    const opened = setActive(withWeek(pickWorld(), "sched_three", "2026-11-05", [...THREE]), "itv_cleo", false);
    expect(judge(three(), opened).join(" ")).toMatch(/a pick is open though every member has a day/);
  });

  it("reads a club's picks, and an ended pick's earlier weeks, whatever order their queries gave them in", () => {
    // An ended pick whose earlier weeks come back in another order is as it was; one that lost a row moved.
    const ended = (earlier: ScheduleProposalRows["earlier"]) => {
      const w = three();
      // On its second week, so the rows of its first are `earlier`, as `scheduleWorldOf` reads them.
      w.proposals.set("spr_old", pickRows({ state: "superseded", replacedBy: PICK, weekRevision: 2, earlier }));
      return w;
    };
    const rows = [
      { ...day("itv_cleo", "monday", true, true), weekRevision: 1 },
      { ...day("itv_cleo", "friday", false, false), weekRevision: 1 },
    ];
    expect(judge(ended(rows), ended([...rows].reverse()))).toEqual([]);
    expect(judge(ended(rows), ended(rows.slice(0, 1))).join(" ")).toMatch(/the ended pick spr_old moved/);
    // Before the first days apply, the same two picks read in another order are no pick made or moved.
    const unapplied = (ids: string[]) => {
      const w = pickWorld(ids.map((id): [string, ScheduleProposalRows] => [id, pickRows({ state: "superseded" })]));
      pickOf(w, "spr_first").state = "open";
      return w;
    };
    expect(judge(unapplied(["spr_a", "spr_b"]), unapplied(["spr_b", "spr_a"]))).toEqual([]);
    expect(judge(unapplied(["spr_a", "spr_b"]), unapplied(["spr_a"])).join(" ")).toMatch(
      /a pick was made or moved where none is due/,
    );
  });

  it("wants a member who joins an open pick added to it, holding a day nobody it includes holds, and nothing else moved (T33)", () => {
    // Ana, Ben, Cleo and Dee have a day each; Eve picks Friday; Fay joins.
    const four = () => {
      const w = setActive(setActive(pickWorld([]), "itv_dee", true), "itv_eve", true);
      withWeek(w, "sched_four", "2026-11-05", [
        assignment("monday", "itv_ana", "2026-11-09"),
        assignment("tuesday", "itv_ben", "2026-11-10"),
        assignment("wednesday", "itv_cleo", "2026-11-11"),
        assignment("thursday", "itv_dee", "2026-11-12"),
      ]);
      w.proposals.set(
        PICK,
        pickRows({
          daysPerMember: 1,
          members: [{ interval: "itv_eve", confirmed: false }],
          days: [day("itv_eve", "friday", true, true)],
        }),
      );
      return w;
    };
    const joined = (fays: Weekday, more: Partial<ScheduleProposalRows> = {}) => {
      const w = setActive(four(), "itv_fay", true);
      const rows = pickOf(w);
      Object.assign(rows, {
        members: [...rows.members, { interval: "itv_fay", confirmed: false }],
        days: [...rows.days, day("itv_fay", fays, true, true)],
        ...more,
      });
      return w;
    };
    expect(judge(four(), joined("saturday"))).toEqual([]);
    expect(judge(four(), joined("friday")).join(" ")).toMatch(/the open pick is/);
    // Eve set the proposed Friday aside and holds Saturday: Friday is free, so Fay is given it (FQ48).
    const aside = () => {
      const w = four();
      pickOf(w).days = [day("itv_eve", "friday", true, false), day("itv_eve", "saturday", false, true)];
      return w;
    };
    const asideJoined = (fays: Weekday) => {
      const w = setActive(aside(), "itv_fay", true);
      const rows = pickOf(w);
      Object.assign(rows, {
        members: [...rows.members, { interval: "itv_fay", confirmed: false }],
        days: [...rows.days, day("itv_fay", fays, true, true)],
      });
      return w;
    };
    expect(judge(aside(), asideJoined("friday"))).toEqual([]);
    expect(judge(aside(), asideJoined("saturday")).join(" ")).toMatch(/the open pick is/);
    expect(judge(four(), joined("saturday", { version: 2 })).join(" ")).toMatch(/the open pick is/);
    // Fay leaves again: Eve still picks. Eve confirmed and Fay leaves: it applies.
    expect(judge(joined("saturday"), setActive(joined("saturday"), "itv_fay", false))).toEqual([]);
    const eveConfirmed = () => {
      const w = joined("saturday");
      pickOf(w).members[0] = { interval: "itv_eve", confirmed: true };
      w.versions.at(-1)?.assignments.push(assignment("friday", "itv_eve", "2026-11-20"));
      return w;
    };
    const applied = setActive(eveConfirmed(), "itv_fay", false);
    Object.assign(pickOf(applied), { state: "applied", version: 2 });
    expect(judge(eveConfirmed(), applied)).toEqual([]);
    expect(judge(eveConfirmed(), setActive(eveConfirmed(), "itv_fay", false)).join(" ")).toMatch(
      /the one that was has ended|the pick that was open is/,
    );
  });

  it("wants an open pick replaced when the club's size changes the days each, naming its successor", () => {
    // Cleo picks two days; Dee joins before Cleo confirms: four take one day each, from Wednesday and
    // Saturday, the two nobody has, so Ana and Ben keep both their days and no week is made (FQ125).
    const replaced = (named: string | null, dees: Weekday = "saturday") => {
      const w = setActive(
        pickWorld([[PICK, pickRows({ state: "superseded", version: 2, replacedBy: named })]]),
        "itv_dee",
        true,
      );
      w.proposals.set(
        "spr_next",
        pickRows({
          daysPerMember: 1,
          members: [
            { interval: "itv_cleo", confirmed: false },
            { interval: "itv_dee", confirmed: false },
          ],
          days: [day("itv_cleo", "wednesday", true, true), day("itv_dee", dees, true, true)],
        }),
      );
      return w;
    };
    expect(judge(pickWorld(), replaced("spr_next"))).toEqual([]);
    expect(judge(pickWorld(), replaced(null)).join(" ")).toMatch(/the pick that was open is/);
    expect(judge(pickWorld(), replaced("spr_next", "thursday")).join(" ")).toMatch(
      /itv_dee holds thursday at first, not saturday/,
    );
    // Cleo chose only Saturday: the new pick keeps it Cleo's, and Dee is given Wednesday (FQ125, FQ126).
    const chose = [day("itv_cleo", "wednesday", true, false), day("itv_cleo", "saturday", true, true)];
    const choosing = pickWorld([[PICK, pickRows({ days: chose })]]);
    const kept = (cleos: Weekday, dees: Weekday) => {
      const w = setActive(
        pickWorld([[PICK, pickRows({ days: chose, state: "superseded", version: 2, replacedBy: "spr_next" })]]),
        "itv_dee",
        true,
      );
      w.proposals.set(
        "spr_next",
        pickRows({
          daysPerMember: 1,
          members: [
            { interval: "itv_cleo", confirmed: false },
            { interval: "itv_dee", confirmed: false },
          ],
          days: [day("itv_cleo", cleos, true, true), day("itv_dee", dees, true, true)],
        }),
      );
      return w;
    };
    expect(judge(choosing, kept("saturday", "wednesday"))).toEqual([]);
    expect(judge(choosing, kept("wednesday", "saturday")).join(" ")).toMatch(
      /itv_cleo holds wednesday at first, not saturday/,
    );
    const freedAnyway = replaced("spr_next");
    withWeek(freedAnyway, "sched_four", TODAY, [
      assignment("monday", "itv_ana", "2026-11-02"),
      assignment("tuesday", "itv_ben", "2026-11-03"),
    ]);
    expect(judge(pickWorld(), freedAnyway).join(" ")).toMatch(/no day was freed/);
  });

  it("wants an open pick ended with no successor when nobody it includes is left, or the club is paused", () => {
    const dropped = setActive(pickWorld([[PICK, pickRows({ state: "superseded", version: 2 })]]), "itv_cleo", false);
    expect(judge(pickWorld(), dropped)).toEqual([]);
    expect(judge(pickWorld(), setActive(pickWorld(), "itv_cleo", false)).join(" ")).toMatch(/has ended/);
    const paused = setActive(pickWorld([[PICK, pickRows({ state: "superseded", version: 2 })]]), "itv_ana", false);
    setActive(paused, "itv_ben", false);
    expect(judge(pickWorld(), paused)).toEqual([]);
    expect(judge(pickWorld(), setActive(setActive(pickWorld(), "itv_ana", false), "itv_ben", false)).join(" ")).toMatch(
      /open in a paused club/,
    );
  });

  it("wants nothing made or moved while the first days are open, or where none ever applied", () => {
    const open = (w: ScheduleWorld) => {
      const first = w.proposals.get("spr_first");
      if (first !== undefined) Object.assign(first, { state: "open", version: 1 });
      return w;
    };
    const before = setActive(open(pickWorld([])), "itv_cleo", false);
    expect(judge(before, open(pickWorld([])))).toEqual([]);
    expect(judge(before, open(pickWorld())).join(" ")).toMatch(/where none is due/);
    expect(judge(before, withWeek(open(pickWorld([])), "sched_x", TODAY, [])).join(" ")).toMatch(/where none is due/);
  });
});
