/// <reference lib="esnext.temporal" />
// The roster's judge, judged (./members.ts): each branch of what a cell must get from listMembers is shown
// to refuse an answer that breaks it, on a world written out here by hand, with no database.

import { describe, expect, it } from "vitest";
import { NEUTRAL, pinned, type Expected } from "./harness.ts";
import { membersExpected, membersFor, MEMBERS_JUDGED, orderOf, type MembersSeen, type NextOf } from "./members.ts";
import type { Answer } from "./scanner.ts";
import type { ScheduleMember, ScheduleProposalRows, ScheduleWorld, Weekday } from "./schedule.ts";

const CLUB = "clb_here";
/** Friday 6 November 2026, 9:41 AM in New York, with a fraction the contract rounds down. */
const NOW = Temporal.Instant.from("2026-11-06T14:41:00.5Z");

function member(account: string, joined: string, name: string | null, more: Partial<ScheduleMember> = {}) {
  return { club: CLUB, account, active: true, joinedAt: Temporal.Instant.from(joined), name, avatar: null, ...more };
}

/** Three members who joined a day apart, Ana first; the week gives Cleo Monday, Ana Tuesday and Friday, Ben Wednesday. */
function world(over: { firstDays?: "open" | "applied" | "none"; effectiveFrom?: string } = {}): ScheduleWorld {
  const state = over.firstDays ?? "applied";
  const days: [Weekday, string][] = [
    ["tuesday", "itv_ana"],
    ["friday", "itv_ana"],
    ["monday", "itv_cleo"],
    ["wednesday", "itv_ben"],
  ];
  return {
    clubs: new Map([[CLUB, { name: "The Saturdays", timezone: "America/New_York", suspended: false }]]),
    members: new Map([
      ["itv_ana", member("usr_ana", "2026-10-01T00:00:00Z", "Ana", { avatar: "v1" })],
      ["itv_ben", member("usr_ben", "2026-10-02T00:00:00Z", "Ben")],
      ["itv_cleo", member("usr_cleo", "2026-10-03T00:00:00Z", "Cleo")],
    ]),
    activeAccounts: new Set(["usr_ana", "usr_ben", "usr_cleo", "usr_zed"]),
    versions: [
      {
        id: "sched_first",
        club: CLUB,
        effectiveFrom: over.effectiveFrom ?? "2026-11-02",
        assignments: days.map(([weekday, star]) => ({ weekday, star, firstDate: "2026-11-02" })),
      },
    ],
    proposals:
      state === "none"
        ? new Map<string, ScheduleProposalRows>()
        : new Map([
            [
              "spr_first",
              {
                club: CLUB,
                state,
                version: 1,
                reason: "activation",
                effectiveFrom: "2026-11-02",
                daysPerMember: 2,
                scheduleVersion: "sched_first",
                replacedBy: null,
                members: [],
                days: [],
              },
            ],
          ]),
  };
}

const occurrence = (star: string, date: string) => ({ id: `occ_${star}_${date}`, star: { membership_id: star } });
/** Cleo's Monday is the club's next day; Ana has one too; Ben has none. */
const NEXT: NextOf = (star) =>
  star === undefined || star === "itv_cleo"
    ? occurrence("itv_cleo", "2026-11-09")
    : star === "itv_ana"
      ? occurrence("itv_ana", "2026-11-10")
      : undefined;

/** An answer as the app sends it, with its Date where the app puts it (harness.ts, NEUTRAL_ORDER). */
function sent(answer: Answer, more: Record<string, string> = {}): Answer {
  const { connection, ...headers } = { ...answer.headers, ...more };
  return { ...answer, headers: { ...headers, date: new Date().toUTCString(), connection: connection ?? "keep-alive" } };
}

const ok = (body: unknown, headers: Record<string, string> = {}): Answer =>
  sent(pinned(200, "OK", JSON.stringify(body)), headers);
const NOT_FOUND = sent(NEUTRAL);

/** A judge that reads its cell, as the function it is. */
function judging(expected: Expected): (answer: Answer) => string[] {
  if (typeof expected !== "function") throw new Error("the roster's judge reads its cell: it is never a pinned answer");
  return expected;
}

const seen =
  (schedule: ScheduleWorld, account: string | null, nextOf: NextOf = NEXT) =>
  (): MembersSeen => ({
    schedule,
    account,
    now: NOW,
    nextOf,
    openRevision: () => undefined,
  });

describe("the roster's order (FQ98, FQ114)", () => {
  it("is the week in force from Monday once the first days have applied, two days by the earlier", () => {
    expect(orderOf(world(), CLUB, NOW)).toEqual(["itv_cleo", "itv_ana", "itv_ben"]);
    expect(orderOf(world({ firstDays: "none" }), CLUB, NOW)).toEqual(["itv_cleo", "itv_ana", "itv_ben"]);
  });

  it("is the order they joined while the first days are open, and before the week is in force", () => {
    expect(orderOf(world({ firstDays: "open" }), CLUB, NOW)).toEqual(["itv_ana", "itv_ben", "itv_cleo"]);
    // The week starts on Saturday the 7th in New York; it is Friday the 6th there.
    expect(orderOf(world({ effectiveFrom: "2026-11-07" }), CLUB, NOW)).toEqual(["itv_ana", "itv_ben", "itv_cleo"]);
    expect(orderOf(world({ effectiveFrom: "2026-11-06" }), CLUB, NOW)).toEqual(["itv_cleo", "itv_ana", "itv_ben"]);
  });

  it("orders members who joined at one instant by their ids, byte by byte", () => {
    const w = world({ firstDays: "open" });
    w.members.set("itv_Zoe", member("usr_zoe", "2026-10-02T00:00:00Z", "Zoe"));
    // An upper-case letter comes before a lower-case one in bytes.
    expect(orderOf(w, CLUB, NOW)).toEqual(["itv_ana", "itv_Zoe", "itv_ben", "itv_cleo"]);
  });

  it("leaves out a member who left, one of another club and one with no name, and puts a member with no day last", () => {
    const w = world();
    w.members.set("itv_gone", member("usr_gone", "2026-09-01T00:00:00Z", "Gone", { active: false }));
    w.members.set("itv_else", { ...member("usr_else", "2026-09-01T00:00:00Z", "Else"), club: "clb_other" });
    w.members.set("itv_null", member("usr_null", "2026-09-01T00:00:00Z", null));
    w.members.set("itv_new", member("usr_new", "2026-09-15T00:00:00Z", "New"));
    expect(orderOf(w, CLUB, NOW)).toEqual(["itv_cleo", "itv_ana", "itv_ben", "itv_new"]);
  });
});

describe("the club's Members (listMembers)", () => {
  const want = {
    server_now: "2026-11-06T14:41:00Z",
    club: { id: CLUB, name: "The Saturdays", timezone: "America/New_York", my_membership_id: "itv_ben" },
    members: [
      {
        person: { membership_id: "itv_cleo", display_name: "Cleo" },
        position: 1,
        next_day: occurrence("itv_cleo", "2026-11-09"),
        next_up: true,
      },
      {
        person: { membership_id: "itv_ana", display_name: "Ana", avatar_version: "v1" },
        position: 2,
        next_day: occurrence("itv_ana", "2026-11-10"),
        next_up: false,
      },
      { person: { membership_id: "itv_ben", display_name: "Ben" }, position: 3, next_up: false },
    ],
  };

  it("is the same list for every member, with the viewer's own interval and the instant rounded down", () => {
    expect(membersFor(world(), CLUB, "usr_ben", NOW, NEXT)).toEqual(want);
    const asAna = membersFor(world(), CLUB, "usr_ana", NOW, NEXT);
    expect(asAna?.["members"]).toEqual(want.members);
    expect(asAna?.["club"]).toEqual({ ...want.club, my_membership_id: "itv_ana" });
  });

  it("marks nobody next when the club has no next day", () => {
    const none = membersFor(world(), CLUB, "usr_ben", NOW, () => undefined) as { members: Record<string, unknown>[] };
    expect(none.members.map((each) => [each["next_up"], "next_day" in each])).toEqual([
      [false, false],
      [false, false],
      [false, false],
    ]);
  });

  it("is for nobody signed out, a stranger, a member who left, an account that isn't active, or of a suspended club", () => {
    expect(membersFor(world(), CLUB, null, NOW, NEXT)).toBeUndefined();
    expect(membersFor(world(), CLUB, "usr_zed", NOW, NEXT)).toBeUndefined();
    expect(membersFor(world(), "clb_other", "usr_ben", NOW, NEXT)).toBeUndefined();
    const left = world();
    left.members.set("itv_ben", member("usr_ben", "2026-10-02T00:00:00Z", "Ben", { active: false }));
    expect(membersFor(left, CLUB, "usr_ben", NOW, NEXT)).toBeUndefined();
    const deleting = world();
    deleting.activeAccounts.delete("usr_ben");
    expect(membersFor(deleting, CLUB, "usr_ben", NOW, NEXT)).toBeUndefined();
    const suspended = world();
    suspended.clubs.set(CLUB, { name: "The Saturdays", timezone: "America/New_York", suspended: true });
    expect(membersFor(suspended, CLUB, "usr_ben", NOW, NEXT)).toBeUndefined();
  });

  it("accepts the right answer whatever the order of its keys, and only with private, no-store", () => {
    const judge = judging(membersExpected(seen(world(), "usr_ben"), CLUB));
    expect(judge(ok(want))).toEqual([]);
    const reversed = Object.fromEntries(Object.entries(want).reverse());
    expect(judge(ok(reversed))).toEqual([]);
    expect(judge(ok(want, { "cache-control": "no-cache" }))).not.toEqual([]);
  });

  it.each([
    ["another member's own interval", { ...want, club: { ...want.club, my_membership_id: "itv_ana" } }],
    [
      "the order they joined instead of the week's",
      { ...want, members: [want.members[1], want.members[2], want.members[0]] },
    ],
    ["a position that skips", { ...want, members: want.members.map((each, at) => ({ ...each, position: at + 2 })) }],
    ["a member left out", { ...want, members: want.members.slice(0, 2) }],
    [
      "a next day for a member who has none",
      { ...want, members: want.members.map((each) => ({ next_day: occurrence("itv_ben", "2026-11-11"), ...each })) },
    ],
    [
      "someone else's day as a member's next",
      {
        ...want,
        members: [{ ...want.members[0], next_day: occurrence("itv_ana", "2026-11-10") }, ...want.members.slice(1)],
      },
    ],
    ["two members next", { ...want, members: want.members.map((each) => ({ ...each, next_up: true })) }],
    ["nobody next", { ...want, members: want.members.map((each) => ({ ...each, next_up: false })) }],
    ["a wrong instant", { ...want, server_now: "2026-11-06T14:41:01Z" }],
    ["a cover nothing stores yet", { ...want, members: want.members.map((each, at) => ({ ...each, cover: at + 1 })) }],
    ["a field of its own", { ...want, open_revision: { id: "rev_1" } }],
    ["a count of anything", { ...want, members: want.members.map((each) => ({ ...each, drops: 2 })) }],
  ])("refuses %s", (_what, body) => {
    expect(judging(membersExpected(seen(world(), "usr_ben"), CLUB))(ok(body))).not.toEqual([]);
  });

  it("carries the club's open revision as the viewer reads it, when there is one, and refuses an answer without it or with another", () => {
    const revision = { id: "rev_1", version: 1, state: "open", my_decision: "pending" };
    const withOne = membersFor(world(), CLUB, "usr_ben", NOW, NEXT, revision);
    expect(withOne).toEqual({ ...want, open_revision: revision });
    const judge = judging(
      membersExpected(
        () => ({ ...seen(world(), "usr_ben")(), openRevision: (club) => (club === CLUB ? revision : undefined) }),
        CLUB,
      ),
    );
    expect(judge(ok({ ...want, open_revision: revision }))).toEqual([]);
    expect(judge(ok(want))).not.toEqual([]);
    expect(judge(ok({ ...want, open_revision: { ...revision, my_decision: "approved" } }))).not.toEqual([]);
  });

  it("holds anyone the club isn't for to the neutral not-found, byte for byte", () => {
    const judge = judging(membersExpected(seen(world(), "usr_zed"), CLUB));
    expect(judge(NOT_FOUND)).toEqual([]);
    expect(judging(membersExpected(seen(world(), null), CLUB))(NOT_FOUND)).toEqual([]);
    expect(judge(ok(want))).not.toEqual([]);
    const told = sent(pinned(404, "Not Found", '{"code":"NOT_FOUND","club":"clb_here"}'));
    expect(judge(told)).not.toEqual([]);
  });

  it("judges listMembers and nothing else", () => {
    expect([...MEMBERS_JUDGED]).toEqual(["listMembers"]);
  });
});
