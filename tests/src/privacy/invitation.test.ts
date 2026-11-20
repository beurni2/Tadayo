/// <reference lib="esnext.temporal" />
// The invitation's judges, judged (./invitation.ts): each branch of what a caller must get from
// previewInvitationWeb, previewInvitation and acceptInvitation is shown to refuse an answer that breaks it,
// on a world written out here by hand, with no database.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NEUTRAL, pinned, type Expected } from "./harness.ts";
import {
  INVITATION_JUDGED,
  acceptOutcome,
  freshToken,
  linkOf,
  previewExpected,
  previewFor,
  webPreviewExpected,
  webPreviewFor,
} from "./invitation.ts";
import type { CandidateRows, LinkRows, RevisionRows, RosterWorld } from "./roster.ts";
import type { Answer } from "./scanner.ts";
import type { ScheduleMember, ScheduleWorld } from "./schedule.ts";

const CLUB = "clb_here";
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

/** Ana, Ben and Cleo, in the order they joined; Eve left. Mo and Zed are accounts in no club. */
function world(more: [string, ScheduleMember][] = []): ScheduleWorld {
  return {
    clubs: new Map([[CLUB, { name: "The Saturdays", timezone: "America/New_York", suspended: false }]]),
    members: new Map([
      ["itv_cleo", member("usr_cleo", "Cleo", "2026-10-03T00:00:00Z")],
      ["itv_ana", member("usr_ana", "Ana", "2026-10-01T00:00:00Z", { avatar: "v_ana" })],
      ["itv_ben", member("usr_ben", "Ben", "2026-10-02T00:00:00Z")],
      ["itv_eve", member("usr_eve", "Eve", "2026-10-04T00:00:00Z", { active: false })],
      ...more,
    ]),
    activeAccounts: new Set(["usr_ana", "usr_ben", "usr_cleo", "usr_eve", "usr_mo", "usr_zed"]),
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

/** Mo's link once Mo's account accepted with it. */
const bound = (more: Partial<LinkRows> = {}) => link({ bound: true, boundTo: "usr_mo", boundName: "Mo", ...more });

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
    decisions: new Map([["itv_ben", "approved"]]),
    ...more,
  };
}

function roster(
  links: LinkRows[] = [link()],
  revisions: [string, RevisionRows][] = [["rev_1", revision()]],
  candidates: [string, Partial<CandidateRows>][] = [],
): RosterWorld {
  const all = new Map<string, CandidateRows>([
    ["cand_mo", { club: CLUB, state: "open", proposer: "itv_ben" }],
    ["cand_lu", { club: CLUB, state: "open", proposer: "itv_ana" }],
  ]);
  for (const [id, more] of candidates) all.set(id, { club: CLUB, state: "open", proposer: "itv_ben", ...more });
  return { revisions: new Map(revisions), links: new Map(links.map((one) => [one.id, one])), candidates: all };
}

/** The roster as Mo, who holds the link and hasn't used it, reads it. */
const open = {
  state: "open",
  invitation_id: "inv_mo",
  inviter_name: "Ben",
  club_name: "The Saturdays",
  revision_id: "rev_1",
  revision_version: 1,
  roster: [
    { name: "Ana", kind: "member", is_you: false },
    { name: "Ben", kind: "member", is_you: false },
    { name: "Cleo", kind: "member", is_you: false },
    { name: "Mo", kind: "candidate", is_you: true },
    { name: "Lu", kind: "candidate", is_you: false },
  ],
  expires_at: "2026-11-13T14:41:00Z",
};

function sent(answer: Answer, more: Record<string, string> = {}): Answer {
  const { connection, ...headers } = { ...answer.headers, ...more };
  return { ...answer, headers: { ...headers, date: new Date().toUTCString(), connection: connection ?? "keep-alive" } };
}
const ok = (body: unknown, headers: Record<string, string> = {}): Answer =>
  sent(pinned(200, "OK", JSON.stringify(body)), headers);
const NOT_FOUND = sent(NEUTRAL);

function judging(expected: Expected): (answer: Answer) => string[] {
  if (typeof expected !== "function") throw new Error("the invitation's judge reads its cell: it is never pinned");
  return expected;
}

const seen =
  (schedule = world(), rows = roster()) =>
  () => ({ schedule, roster: rows, now: NOW });
const preview = (account: string | null, rows = roster(), schedule = world(), now = NOW) =>
  previewFor(schedule, rows, TOKEN, account, now);
const codeOf = (outcome: unknown) =>
  typeof outcome === "string" ? outcome : (JSON.parse((outcome as Answer).body) as Record<string, unknown>);

describe("what a link's token names (invitation.ts)", () => {
  it("judges the invitation's three routes", () => {
    expect([...INVITATION_JUDGED].sort()).toEqual(["acceptInvitation", "previewInvitation", "previewInvitationWeb"]);
  });

  it("finds a link by the hash of its token, and nothing for a token nobody made", () => {
    expect(linkOf(roster(), TOKEN)?.id).toBe("inv_mo");
    const fresh = freshToken();
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(linkOf(roster(), fresh)).toBeUndefined();
    expect(preview("usr_mo", roster([link({ hash: sha256(fresh) })]))).toBeUndefined();
  });

  it.each([
    ["revoked", link({ revoked: true })],
    ["replaced by a newer link", link({ replaced: true })],
    ["used by another account", link({ bound: true, boundTo: "usr_zed" })],
  ])("names nothing once the link is %s, to its holder and to a member alike (T14, FQ59)", (_what, dead) => {
    expect(preview("usr_mo", roster([dead]))).toBeUndefined();
    expect(preview("usr_ana", roster([dead]))).toBeUndefined();
    expect(webPreviewFor(world(), roster([dead]), TOKEN, NOW)).toBeUndefined();
    expect(acceptOutcome(world(), roster([dead]), TOKEN, "usr_mo", "Mo", "rev_1", 1, NOW)).toBe(NEUTRAL);
  });

  it("names nothing of a suspended club (FQ80), and nothing to a caller with no account", () => {
    const suspended = world();
    suspended.clubs.set(CLUB, { name: "The Saturdays", timezone: "America/New_York", suspended: true });
    expect(preview("usr_mo", roster(), suspended)).toBeUndefined();
    expect(webPreviewFor(suspended, roster(), TOKEN, NOW)).toBeUndefined();
    expect(acceptOutcome(suspended, roster(), TOKEN, "usr_mo", "Mo", "rev_1", 1, NOW)).toBe(NEUTRAL);
    expect(preview(null)).toBeUndefined();
  });
});

describe("the signed-out page (previewInvitationWeb)", () => {
  it("is the inviter's name, and only that, for a live link", () => {
    expect(webPreviewFor(world(), roster(), TOKEN, NOW)).toEqual({ inviter_name: "Ben" });
  });

  it("is nothing for a link an account has used, at its expiry, or whose candidate ended or joined", () => {
    expect(webPreviewFor(world(), roster([bound()]), TOKEN, NOW)).toBeUndefined();
    expect(webPreviewFor(world(), roster(), TOKEN, LATER)).toBeUndefined();
    expect(webPreviewFor(world(), roster(), TOKEN, LATER.subtract({ microseconds: 1 }))).toBeDefined();
    for (const state of ["ended", "joined"])
      expect(webPreviewFor(world(), roster([link()], undefined, [["cand_mo", { state }]]), TOKEN, NOW)).toBeUndefined();
  });

  it("is nothing when the inviter has no name to show (FQ75)", () => {
    const nameless = world([["itv_ben", member("usr_ben", null, "2026-10-02T00:00:00Z")]]);
    expect(webPreviewFor(nameless, roster(), TOKEN, NOW)).toBeUndefined();
  });

  it("passes the name, and refuses another name, a field more, the neutral answer and an answer that may be stored", () => {
    const judge = judging(webPreviewExpected(seen(), TOKEN));
    expect(judge(ok({ inviter_name: "Ben" }))).toEqual([]);
    expect(judge(ok({ inviter_name: "Ana" }))).not.toEqual([]);
    expect(judge(ok({ inviter_name: "Ben", club_name: "The Saturdays" }))).not.toEqual([]);
    expect(judge(NOT_FOUND)).not.toEqual([]);
    expect(judge(ok({ inviter_name: "Ben" }, { "cache-control": "public" }))).not.toEqual([]);
    const used = judging(webPreviewExpected(seen(world(), roster([bound()])), TOKEN));
    expect(used(NOT_FOUND)).toEqual([]);
    expect(used(ok({ inviter_name: "Ben" }))).not.toEqual([]);
  });
});

describe("the invitation for the account holding its link (previewInvitation)", () => {
  it("is the exact roster by names: members in the order they joined, candidates by position, the holder marked", () => {
    expect(preview("usr_mo")).toEqual(open);
  });

  it("tells a member of the club they are one, whoever the link was for, with their own interval", () => {
    expect(preview("usr_ana")).toEqual({
      state: "joined",
      club: { id: CLUB, name: "The Saturdays", timezone: "America/New_York", my_membership_id: "itv_ana" },
    });
    expect(preview("usr_eve")).toEqual(open);
  });

  it("is nothing once the candidate joined, to an account that is no member", () => {
    expect(preview("usr_mo", roster([bound()], undefined, [["cand_mo", { state: "joined" }]]))).toBeUndefined();
  });

  it("says did_not_go_ahead to the account that accepted with the link, and nothing to anyone else", () => {
    const ended = (one: LinkRows) =>
      roster(
        [one],
        [["rev_1", revision({ state: "did_not_go_ahead", version: 2 })]],
        [["cand_mo", { state: "ended" }]],
      );
    expect(preview("usr_mo", ended(bound()))).toEqual({ state: "did_not_go_ahead" });
    expect(preview("usr_mo", ended(link()))).toBeUndefined();
  });

  it("says expired, with the inviter's name, from the link's expiry while nobody has used it (FQ71)", () => {
    expect(preview("usr_mo", roster(), world(), LATER)).toEqual({ state: "expired", inviter_name: "Ben" });
    expect(preview("usr_mo", roster(), world(), LATER.subtract({ microseconds: 1 }))).toMatchObject({ state: "open" });
    // A link its account has used doesn't expire for that account (handoff 4).
    expect(preview("usr_mo", roster([bound()]), world(), LATER)).toMatchObject({ state: "changed" });
  });

  it("is nothing to an account that holds another place in the club's roster", () => {
    const other = link({
      id: "inv_lu",
      candidate: "cand_lu",
      hash: sha256("u".repeat(43)),
      bound: true,
      boundTo: "usr_mo",
    });
    expect(preview("usr_mo", roster([link(), other]))).toBeUndefined();
    // The other place ended: one account, one place, counts only an open candidate.
    expect(preview("usr_mo", roster([link(), other], undefined, [["cand_lu", { state: "ended" }]]))).toMatchObject({
      state: "open",
    });
  });

  it("is nothing when the inviter, or every member of the roster, has no name to show (FQ75)", () => {
    const nameless = world([["itv_ben", member("usr_ben", null, "2026-10-02T00:00:00Z")]]);
    expect(preview("usr_mo", roster(), nameless)).toBeUndefined();
    expect(preview("usr_mo", roster([link()], [["rev_1", revision({ members: [] })]]))).toBeUndefined();
  });

  it("leaves a member who left, or has no name, out of the roster", () => {
    const rows = roster([link()], [["rev_1", revision({ members: ["itv_cleo", "itv_ben", "itv_ana", "itv_eve"] })]]);
    expect(preview("usr_mo", rows)).toEqual(open);
  });

  it("says full at six members (A01)", () => {
    const six = world(
      ["d", "e", "f"].map((id): [string, ScheduleMember] => [
        `itv_${id}`,
        member(`usr_${id}`, id.toUpperCase(), "2026-10-05T00:00:00Z"),
      ]),
    );
    expect(preview("usr_mo", roster(), six)).toEqual({ state: "full" });
  });

  it("says waiting, with no expiry, once the candidate accepted this roster with the link; changed for an earlier one", () => {
    const accepted = revision({
      candidates: [
        { id: "cand_mo", label: "Mo", proposer: "itv_ben", acceptedWith: "inv_mo" },
        { id: "cand_lu", label: "Lu", proposer: "itv_ana", acceptedWith: null },
      ],
    });
    const waiting = Object.fromEntries(Object.entries(open).filter(([key]) => key !== "expires_at"));
    expect(preview("usr_mo", roster([bound()], [["rev_1", accepted]]))).toEqual({ ...waiting, state: "waiting" });
    // The account changed its name since: the acceptance no longer stands, and it is shown the roster again.
    expect(preview("usr_mo", roster([bound({ boundName: "Moe" })], [["rev_1", accepted]]))).toEqual({
      ...open,
      state: "changed",
    });
    expect(preview("usr_mo", roster([bound()]))).toEqual({ ...open, state: "changed" });
    // Every member has approved, and the acceptance joined nobody: nothing to wait for, so accept again.
    const approved = revision({
      candidates: accepted.candidates,
      decisions: new Map([
        ["itv_ana", "approved"],
        ["itv_ben", "approved"],
        ["itv_cleo", "approved"],
      ]),
    });
    expect(preview("usr_mo", roster([bound()], [["rev_1", approved]]))).toEqual({ ...open, state: "changed" });
  });

  it("passes the preview, and refuses each field that differs, a decision, an acceptance or a person's id", () => {
    const judge = judging(previewExpected(seen(), TOKEN, "usr_mo"));
    expect(judge(ok(open))).toEqual([]);
    for (const body of [
      { ...open, state: "waiting" },
      { ...open, inviter_name: "Ana" },
      { ...open, revision_version: 2 },
      { ...open, roster: open.roster.slice(1) },
      { ...open, roster: [...open.roster].reverse() },
      { ...open, roster: open.roster.map((entry) => ({ ...entry, is_you: false })) },
      { ...open, roster: open.roster.map((entry) => ({ ...entry, accepted: true })) },
      { ...open, roster: open.roster.map((entry) => ({ ...entry, membership_id: "itv_ana" })) },
      { ...open, approved: 1 },
      { ...open, expires_at: "2026-11-13T14:41:01Z" },
    ])
      expect(judge(ok(body))).not.toEqual([]);
    expect(judge(NOT_FOUND)).not.toEqual([]);
    expect(judge(ok(open, { "cache-control": "public" }))).not.toEqual([]);
  });

  it("holds a caller the token names nothing to, to the neutral not-found, byte for byte", () => {
    const judge = judging(previewExpected(seen(world(), roster([bound()])), TOKEN, "usr_zed"));
    expect(judge(NOT_FOUND)).toEqual([]);
    expect(judge(ok(open))).not.toEqual([]);
    expect(judge(sent(pinned(404, "Not Found", '{"code":"NOT_FOUND","state":"used"}')))).not.toEqual([]);
  });
});

describe("what accepting must get (acceptInvitation)", () => {
  const accept = (
    account: string,
    name: string,
    rows = roster(),
    more: { revision?: string; expected?: number; now?: Temporal.Instant; schedule?: ScheduleWorld } = {},
  ) =>
    acceptOutcome(
      more.schedule ?? world(),
      rows,
      TOKEN,
      account,
      name,
      more.revision ?? "rev_1",
      more.expected ?? 1,
      more.now ?? NOW,
    );

  it("waits while a member hasn't approved, and joins once every member the revision lists has (FQ65)", () => {
    expect(accept("usr_mo", "Mo")).toBe("waiting");
    const approved = revision({
      decisions: new Map([
        ["itv_ana", "approved"],
        ["itv_ben", "approved"],
        ["itv_cleo", "approved"],
      ]),
    });
    expect(accept("usr_mo", "Mo", roster([link()], [["rev_1", approved]]))).toBe("joined");
    const declined = revision({ decisions: new Map([...approved.decisions, ["itv_cleo", "declined"]]) });
    expect(accept("usr_mo", "Mo", roster([link()], [["rev_1", declined]]))).toBe("waiting");
  });

  it("says changed when the account's name isn't the label the revision shows, compared as stored (FQ66)", () => {
    expect(accept("usr_mo", "Maurice")).toBe("changed");
    expect(accept("usr_mo", "mo")).toBe("changed");
  });

  it("is the neutral not-found to a member holding a link they didn't join with, and for an ended candidate nobody of the account accepted", () => {
    expect(accept("usr_ana", "Ana")).toBe(NEUTRAL);
    expect(accept("usr_mo", "Mo", roster([link()], undefined, [["cand_mo", { state: "ended" }]]))).toBe(NEUTRAL);
  });

  it("is the neutral not-found for a revision that doesn't list the candidate, of another club, unsealed or unknown", () => {
    const without = revision({ candidates: [{ id: "cand_lu", label: "Lu", proposer: "itv_ana", acceptedWith: null }] });
    expect(accept("usr_mo", "Mo", roster([link()], [["rev_1", without]]))).toBe(NEUTRAL);
    expect(accept("usr_mo", "Mo", roster([link()], [["rev_1", revision({ club: "clb_other" })]]))).toBe(NEUTRAL);
    expect(accept("usr_mo", "Mo", roster([link()], [["rev_1", revision({ sealed: false })]]))).toBe(NEUTRAL);
    expect(accept("usr_mo", "Mo", roster(), { revision: "rev_none" })).toBe(NEUTRAL);
  });

  it("refuses in the contract's order: expired, then a newer revision, then the version", () => {
    const chain = roster(
      [link()],
      [
        ["rev_1", revision({ state: "superseded", version: 2, supersededBy: "rev_2" })],
        ["rev_2", revision({ state: "superseded", version: 2, supersededBy: "rev_3" })],
        ["rev_3", revision()],
      ],
    );
    expect(codeOf(accept("usr_mo", "Mo", chain, { now: LATER, expected: 9 }))).toEqual({ code: "INVITATION_EXPIRED" });
    expect(codeOf(accept("usr_mo", "Mo", chain, { expected: 9 }))).toEqual({
      code: "ROSTER_CHANGED",
      current_id: "rev_3",
    });
    expect(codeOf(accept("usr_mo", "Mo", roster(), { expected: 9 }))).toEqual({
      code: "VERSION_CONFLICT",
      current_version: 1,
    });
    // A link its account has used doesn't expire for that account.
    expect(accept("usr_mo", "Mo", roster([bound()]), { now: LATER })).toBe("waiting");
  });

  it("tells a candidate nothing of a newer revision that doesn't list them, and a person who left nothing at all", () => {
    // A leave ended Mo and carried Lu on: the chain's newest revision lists Lu alone.
    const carried = roster(
      [bound()],
      [
        ["rev_1", revision({ state: "superseded", version: 2, supersededBy: "rev_2" })],
        ["rev_2", revision({ candidates: [{ id: "cand_lu", label: "Lu", proposer: "itv_ana", acceptedWith: null }] })],
      ],
      [["cand_mo", { state: "ended" }]],
    );
    expect(accept("usr_mo", "Mo", carried)).toBe(NEUTRAL);
    expect(accept("usr_mo", "Mo", carried, { expected: 9 })).toBe(NEUTRAL);
    // Mo joined by the link and has left since: no interval of Mo's is active.
    const joined = roster(
      [bound()],
      [["rev_1", revision({ state: "applied", version: 2 })]],
      [["cand_mo", { state: "joined" }]],
    );
    expect(accept("usr_mo", "Mo", joined, { expected: 2 })).toBe(NEUTRAL);
    expect(accept("usr_mo", "Mo", joined, { expected: 9 })).toBe(NEUTRAL);
  });

  it("takes no acceptance of a revision that has ended, but tells the account that joined by it so", () => {
    const ended = roster(
      [bound()],
      [["rev_1", revision({ state: "did_not_go_ahead", version: 2 })]],
      [["cand_mo", { state: "ended" }]],
    );
    expect(accept("usr_mo", "Mo", ended, { expected: 2 })).toBe(NEUTRAL);
    expect(codeOf(accept("usr_mo", "Mo", ended))).toEqual({ code: "VERSION_CONFLICT", current_version: 2 });
    const applied = roster(
      [bound()],
      [["rev_1", revision({ state: "applied", version: 2 })]],
      [["cand_mo", { state: "joined" }]],
    );
    const joined = world([["itv_mo", member("usr_mo", "Mo", "2026-11-06T00:00:00Z")]]);
    expect(accept("usr_mo", "Mo", applied, { expected: 2, schedule: joined })).toBe("joined again");
    // Left since: the link's candidate joined, and the account is no member.
    expect(accept("usr_mo", "Mo", applied, { expected: 2 })).toBe(NEUTRAL);
  });

  it("gives one account one place, and no place in a club of six (A01)", () => {
    const other = link({
      id: "inv_lu",
      candidate: "cand_lu",
      hash: sha256("u".repeat(43)),
      bound: true,
      boundTo: "usr_mo",
    });
    expect(accept("usr_mo", "Mo", roster([link(), other]))).toBe(NEUTRAL);
    // Whatever version the request names: never VERSION_CONFLICT, which would tell the link from none.
    expect(accept("usr_mo", "Mo", roster([link(), other]), { expected: 9 })).toBe(NEUTRAL);
    const six = world(
      ["d", "e", "f"].map((id): [string, ScheduleMember] => [
        `itv_${id}`,
        member(`usr_${id}`, id.toUpperCase(), "2026-10-05T00:00:00Z"),
      ]),
    );
    expect(codeOf(accept("usr_mo", "Mo", roster(), { schedule: six }))).toEqual({ code: "CLUB_FULL" });
  });
});
