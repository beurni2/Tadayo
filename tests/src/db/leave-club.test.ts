/// <reference lib="esnext.temporal" />
// Leaving a club, against Postgres as `tadayo_app` (spec 04, 18, 22, 32; G05-leave, book p30; T1, T7, T8,
// T9, T14, T19, T26, T36; FQ16, FQ60, FQ63, FQ75, FQ80, FQ112, FQ120, FQ121, FQ122;
// docs/plans/api-b1-clubs.md, section 5; packages/domain/src/clubs/leave-club.ts): the row a leave writes,
// what the person who left can read afterwards, the club's proposals, the receipt, and every refusal.
//
// These tests were written after the command, from the plan's section 5, so none was seen to fail before
// its rule existed. The deliberate breakages, run at the PR's last head, are what shows they can fail. The
// last describe holds the tests the review of PR #78 asked for.

import { randomUUID } from "node:crypto";
import { invitationAcceptanceBody, leftClubBody } from "@tadayo/api";
import {
  acceptInvitation,
  leaveClub,
  listClubs,
  listMembers,
  readClub,
  type Json,
  type ServerNow,
} from "@tadayo/domain";
import { fakeClock, type FakeClock } from "@tadayo/domain/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rolledBack, worldSql, type WorldTx } from "./harness.ts";
import {
  acceptWith,
  approve,
  founded,
  linkFor,
  plain,
  preview,
  propose,
  read,
  refusal,
  rosterVersion,
  type RevisionBody,
} from "./roster-world.ts";
import { clubOf, holding, waitingOn, type WeekClub } from "./week-world.ts";
import { joinByRoster, newUser } from "./world.ts";

const db = worldSql(6);
afterAll(async () => {
  await db.end();
});

const AT_FIRST = "2026-11-11T05:00:00.123456Z";
const FIRST = Temporal.Instant.from(AT_FIRST);
const clock = fakeClock(AT_FIRST);
beforeEach(() => {
  clock.set(FIRST);
});
const NOW = FIRST as ServerNow;
const LATER = new Date("2026-11-11T06:00:00Z");
const NONE = { code: "NOT_FOUND", facts: {} };

const user = (w: WeekClub, index: number): string => w.users[index] ?? "";
const member = (w: WeekClub, index: number): string => w.members[index] ?? "";
const candidate = (revision: RevisionBody, index: number): string => revision.candidates[index]?.id ?? "";

type Choice = "keep" | "withdraw";

/** `leaveClub` as its route runs it. */
const leaving = (
  tx: WorldTx,
  userId: string,
  clubId: string,
  contributions: Choice = "keep",
  key: string = randomUUID(),
  with_: FakeClock = clock,
): Promise<Json> => tx.savepoint((sp) => leaveClub(sp, with_, { userId, key, clubId, contributions }, leftClubBody));

interface MemberRow {
  interval_id: string;
  state: string;
  left_at: Temporal.Instant | null;
  contributions: string | null;
  ended_display_name: string | null;
}

const membership = async (tx: WorldTx, interval: string): Promise<MemberRow | undefined> =>
  (
    await plain(tx)<MemberRow[]>`
      SELECT interval_id, state, left_at, contributions, ended_display_name
        FROM app.memberships WHERE interval_id = ${interval}`
  )[0];

interface RevisionRow {
  id: string;
  state: string;
  version: number;
  superseded_by_id: string | null;
  proposed_by_interval_id: string;
  ended_at: Temporal.Instant | null;
}

const revisionsOf = (tx: WorldTx, club: string): Promise<RevisionRow[]> =>
  plain(tx)<RevisionRow[]>`
    SELECT id, state, version, superseded_by_id, proposed_by_interval_id, ended_at
      FROM app.roster_revisions WHERE club_id = ${club} ORDER BY created_at, id COLLATE "C"`;

const revisionRow = async (tx: WorldTx, id: string): Promise<RevisionRow | undefined> =>
  (
    await plain(tx)<RevisionRow[]>`
      SELECT id, state, version, superseded_by_id, proposed_by_interval_id, ended_at
        FROM app.roster_revisions WHERE id = ${id}`
  )[0];

const candidateState = async (
  tx: WorldTx,
  id: string,
): Promise<{ state: string; ended_at: Temporal.Instant | null } | undefined> =>
  (
    await plain(tx)<
      { state: string; ended_at: Temporal.Instant | null }[]
    >`SELECT state, ended_at FROM app.candidates WHERE id = ${id}`
  )[0];

const receiptsOf = (tx: WorldTx, account: string): Promise<{ state: string }[]> =>
  plain(tx)<{ state: string }[]>`
    SELECT state FROM app.idempotency_receipts WHERE actor_user_id = ${account} AND operation = 'leaveClub'`;

/** The club's open revision: its members' intervals, its candidates with what each starts with, its approvals. */
async function openOf(tx: WorldTx, club: string) {
  const [revision] = await plain(tx)<{ id: string; proposed_by_interval_id: string; version: number }[]>`
    SELECT id, proposed_by_interval_id, version FROM app.roster_revisions WHERE club_id = ${club} AND state = 'open'`;
  if (revision === undefined) return null;
  const members = await plain(tx)<{ interval_id: string }[]>`
    SELECT rm.interval_id FROM app.roster_revision_members rm JOIN app.memberships m USING (interval_id)
     WHERE rm.revision_id = ${revision.id} ORDER BY m.joined_at`;
  const candidates = await plain(tx)<{ candidate_id: string; label: string; accepted: boolean }[]>`
    SELECT candidate_id, label, accepted_invitation_id IS NOT NULL AS accepted
      FROM app.roster_revision_candidates WHERE revision_id = ${revision.id} ORDER BY position`;
  const approvals = await plain(tx)<{ interval_id: string; decision: string; implicit: boolean }[]>`
    SELECT interval_id, decision, implicit FROM app.roster_approvals WHERE revision_id = ${revision.id}`;
  return {
    id: revision.id,
    proposer: revision.proposed_by_interval_id,
    version: revision.version,
    members: members.map((row) => row.interval_id),
    candidates: candidates.map((row) => ({ id: row.candidate_id, label: row.label, accepted: row.accepted })),
    approvals: approvals.map((row) => ({ interval: row.interval_id, decision: row.decision, implicit: row.implicit })),
  };
}

const outcome = (done: Promise<unknown>): Promise<unknown> =>
  done.catch((error: unknown) => (error as { code?: string }).code ?? String(error));

describe("leaving a club (leaveClub)", () => {
  it.each(["keep", "withdraw"] as const)(
    "ends the member's interval at the clock's sample, with the choice %s and the name the person has now",
    async (choice) => {
      await rolledBack(db, async (tx) => {
        const w = await clubOf(tx, 3);
        await plain(tx)`UPDATE app.users SET display_name = 'Maya R' WHERE id = ${user(w, 1)}`;
        const before = await rosterVersion(tx, w.club);
        const at = FIRST.add({ hours: 2 });
        clock.set(at);
        const answer = await leaving(tx, user(w, 1), w.club, choice);
        // Whole seconds in the answer; the row keeps the sample.
        expect(answer).toEqual({ club_id: w.club, left_at: "2026-11-11T07:00:00Z", contributions: choice });
        const row = await membership(tx, member(w, 1));
        expect(row).toMatchObject({ state: "left", contributions: choice, ended_display_name: "Maya R" });
        expect(String(row?.left_at)).toBe("2026-11-11T07:00:00.123456Z");
        expect(await rosterVersion(tx, w.club)).toBe(before + 1);
        // Nobody else's row moved.
        expect(await membership(tx, member(w, 0))).toMatchObject({ state: "active", left_at: null });
        expect(await membership(tx, member(w, 2))).toMatchObject({ state: "active", left_at: null });
        expect(await receiptsOf(tx, user(w, 1))).toEqual([{ state: "completed" }]);
      });
    },
  );

  it("gives the person who left nothing of the club, and the others a club without them", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const open = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
      await leaving(tx, user(w, 1), w.club);
      expect(await readClub(tx, user(w, 1), w.club, NOW)).toBeNull();
      expect(await listMembers(tx, user(w, 1), w.club, NOW)).toBeNull();
      expect((await listClubs(tx, user(w, 1), NOW)).clubs).toEqual([]);
      // The revision that listed them, and the one made without them.
      expect(await read(tx, user(w, 1), open.id, NOW)).toBeNull();
      const next = await openOf(tx, w.club);
      expect(next).not.toBeNull();
      expect(await read(tx, user(w, 1), next?.id ?? "", NOW)).toBeNull();
      const [club] = (await listClubs(tx, user(w, 0), NOW)).clubs;
      expect(club).toMatchObject({ id: w.club, state: "active", memberCount: 2 });
      const roster = JSON.stringify(await listMembers(tx, user(w, 0), w.club, NOW));
      expect(roster).toContain(member(w, 0));
      expect(roster).toContain(member(w, 2));
      expect(roster).not.toContain(member(w, 1));
    });
  });

  it("pauses a club left with one member, and lets the last member leave too (FQ16)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 2);
      await leaving(tx, user(w, 1), w.club);
      const [club] = (await listClubs(tx, user(w, 0), NOW)).clubs;
      expect(club).toMatchObject({ id: w.club, state: "paused", memberCount: 1 });
      await leaving(tx, user(w, 0), w.club);
      expect((await listClubs(tx, user(w, 0), NOW)).clubs).toEqual([]);
      const [row] = await plain(tx)<{ activated: boolean; members: number }[]>`
        SELECT c.activated_at IS NOT NULL AS activated,
               (SELECT count(*)::int4 FROM app.memberships m WHERE m.club_id = c.id AND m.state = 'active') AS members
          FROM app.clubs c WHERE c.id = ${w.club}`;
      expect(row).toEqual({ activated: true, members: 0 });
    });
  });

  it("lets the creator leave a club that hasn't started, ending its proposal and its candidates", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await founded(tx, clock);
      const open = await propose(tx, clock, ben.user, ben.club, ["Maya", "Alex"]);
      const made = await linkFor(tx, clock, ben.user, ben.club, candidate(open, 0));
      await leaving(tx, ben.user, ben.club);
      expect(await revisionRow(tx, open.id)).toMatchObject({
        state: "did_not_go_ahead",
        version: 2,
        superseded_by_id: null,
      });
      expect((await candidateState(tx, candidate(open, 0)))?.state).toBe("ended");
      expect((await candidateState(tx, candidate(open, 1)))?.state).toBe("ended");
      expect(await openOf(tx, ben.club)).toBeNull();
      // The club stays as it was, proposed and never started, with nobody in it.
      expect(await membership(tx, ben.interval)).toMatchObject({ state: "left", contributions: "keep" });
      const [club] = await plain(tx)<{ activated: boolean }[]>`
        SELECT activated_at IS NOT NULL AS activated FROM app.clubs WHERE id = ${ben.club}`;
      expect(club).toEqual({ activated: false });
      // The unused link of an ended proposal names nothing to anyone.
      const maya = await newUser(plain(tx), "Maya");
      expect(await preview(tx, maya, made.token, NOW)).toBeNull();
    });
  });
});

describe("what a leave does to the club's open proposal (FQ121)", () => {
  /** Ben, Maya and Alex; Ben proposes Sam and Debby, Maya then proposes Nina beside them. */
  async function proposals(tx: WorldTx) {
    const w = await clubOf(tx, 3);
    const first = await propose(tx, clock, user(w, 0), w.club, ["Sam", "Debby"]);
    const open = await propose(tx, clock, user(w, 1), w.club, ["Nina"]);
    return { w, first, open, sam: candidate(open, 0), debby: candidate(open, 1), nina: candidate(open, 2) };
  }

  it("ends the leaver's own candidates and carries the others into a revision of the members who stay", async () => {
    await rolledBack(db, async (tx) => {
      const s = await proposals(tx);
      expect(s.open.candidates.map((one) => one.name)).toEqual(["Sam", "Debby", "Nina"]);
      const samLink = await linkFor(tx, clock, user(s.w, 0), s.w.club, s.sam);
      const sam = await newUser(plain(tx), "Sam");
      await acceptWith(tx, clock, sam, samLink.token, s.open.id, 1);
      await approve(tx, clock, user(s.w, 2), s.open.id, 1);
      const before = await rosterVersion(tx, s.w.club);
      const at = FIRST.add({ minutes: 30 });
      clock.set(at);

      // Ben leaves: Sam and Debby were Ben's to invite; Nina is Maya's, and Maya proposed the revision.
      await leaving(tx, user(s.w, 0), s.w.club);
      for (const one of [s.sam, s.debby]) {
        const ended = await candidateState(tx, one);
        expect(ended?.state).toBe("ended");
        expect(String(ended?.ended_at)).toBe("2026-11-11T05:30:00.123456Z");
      }
      expect(await candidateState(tx, s.nina)).toMatchObject({ state: "open", ended_at: null });
      const next = await openOf(tx, s.w.club);
      expect(next).toEqual({
        id: expect.any(String) as string,
        proposer: member(s.w, 1),
        version: 1,
        members: [member(s.w, 1), member(s.w, 2)],
        candidates: [{ id: s.nina, label: "Nina", accepted: false }],
        // Only the proposer's approval, by proposing (FQ60): Alex approves again.
        approvals: [{ interval: member(s.w, 1), decision: "approved", implicit: true }],
      });
      const ended = await revisionRow(tx, s.open.id);
      expect(ended).toMatchObject({ state: "superseded", version: 2, superseded_by_id: next?.id });
      expect(String(ended?.ended_at)).toBe("2026-11-11T05:30:00.123456Z");
      expect(await rosterVersion(tx, s.w.club)).toBe(before + 1);
      // A request that names the ended revision is told the new one.
      expect(await refusal(approve(tx, clock, user(s.w, 2), s.open.id, 1))).toEqual({
        code: "ROSTER_CHANGED",
        facts: { current_id: next?.id },
      });
      // Sam's link shows only that it didn't go ahead, and accepting with it is told nothing of the roster
      // that went on without Sam: not its id, not a version.
      expect(await preview(tx, sam, samLink.token, NOW)).toEqual({ state: "did_not_go_ahead" });
      expect(await refusal(acceptWith(tx, clock, sam, samLink.token, s.open.id, 1))).toEqual(NONE);
      expect(await refusal(acceptWith(tx, clock, sam, samLink.token, s.open.id, 7))).toEqual(NONE);
      expect(await refusal(acceptWith(tx, clock, sam, samLink.token, next?.id ?? "", 1))).toEqual(NONE);
    });
  });

  it("keeps a carried candidate's link good, to accept the new roster with", async () => {
    await rolledBack(db, async (tx) => {
      const s = await proposals(tx);
      const ninaLink = await linkFor(tx, clock, user(s.w, 1), s.w.club, s.nina);
      const nina = await newUser(plain(tx), "Nina");
      await acceptWith(tx, clock, nina, ninaLink.token, s.open.id, 1);
      await leaving(tx, user(s.w, 2), s.w.club);
      const next = await openOf(tx, s.w.club);
      expect(next?.candidates).toEqual([
        { id: s.sam, label: "Sam", accepted: false },
        { id: s.debby, label: "Debby", accepted: false },
        { id: s.nina, label: "Nina", accepted: false },
      ]);
      expect(next?.members).toEqual([member(s.w, 0), member(s.w, 1)]);
      // Nina accepted a roster that named Alex: the roster to accept again.
      expect(await preview(tx, nina, ninaLink.token, NOW)).toMatchObject({
        state: "changed",
        revision_id: next?.id,
        revision_version: 1,
      });
      const answer = await acceptWith(tx, clock, nina, ninaLink.token, next?.id ?? "", 1);
      expect(answer).toMatchObject({ state: "waiting" });
      // Ben approves, and Nina joins: Maya's approval stands by proposing.
      const applied = await approve(tx, clock, user(s.w, 0), next?.id ?? "", 1);
      expect(applied.state).toBe("applied");
      expect((await candidateState(tx, s.nina))?.state).toBe("joined");
    });
  });

  it("ends the whole proposal when its proposer is the one leaving", async () => {
    await rolledBack(db, async (tx) => {
      const s = await proposals(tx);
      const before = await rosterVersion(tx, s.w.club);
      // Maya proposed the open revision, which carries Ben's candidates too.
      await leaving(tx, user(s.w, 1), s.w.club);
      expect(await revisionRow(tx, s.open.id)).toMatchObject({
        state: "did_not_go_ahead",
        version: 2,
        superseded_by_id: null,
      });
      // Ben stays, and Ben's Sam and Debby end too: they were on Maya's proposal.
      for (const one of [s.sam, s.debby, s.nina]) {
        const ended = await candidateState(tx, one);
        expect(ended?.state).toBe("ended");
        expect(String(ended?.ended_at)).toBe(AT_FIRST);
      }
      expect(String((await revisionRow(tx, s.open.id))?.ended_at)).toBe(AT_FIRST);
      expect(await openOf(tx, s.w.club)).toBeNull();
      expect(await rosterVersion(tx, s.w.club)).toBe(before + 1);
      // Nobody holds a place on no revision: Ben can propose five people again.
      const again = await propose(tx, clock, user(s.w, 0), s.w.club, ["Sam", "Debby", "Nina"]);
      expect(again.candidates).toHaveLength(3);
    });
  });

  it("ends a proposal of the leaver's own with its one candidate, and leaves the earlier ones as they ended", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const open = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
      await leaving(tx, user(w, 0), w.club);
      expect(await revisionRow(tx, open.id)).toMatchObject({ state: "did_not_go_ahead", version: 2 });
      expect(await openOf(tx, w.club)).toBeNull();
      // The two the club's members joined by are as they were.
      expect((await revisionsOf(tx, w.club)).map((row) => row.state)).toEqual([
        "applied",
        "applied",
        "did_not_go_ahead",
      ]);
    });
  });

  it("writes no revision when the club has no open proposal", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const before = await rosterVersion(tx, w.club);
      const revisions = await revisionsOf(tx, w.club);
      await leaving(tx, user(w, 2), w.club);
      expect(await revisionsOf(tx, w.club)).toEqual(revisions);
      expect(await rosterVersion(tx, w.club)).toBe(before + 1);
    });
  });
});

describe("the receipt of a leave (T19)", () => {
  it("answers a retry after leaving with the first answer, byte for byte, and changes nothing", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const key = randomUUID();
      const first = await leaving(tx, user(w, 1), w.club, "withdraw", key);
      const before = await rosterVersion(tx, w.club);
      clock.set(FIRST.add({ hours: 5 }));
      const again = await leaving(tx, user(w, 1), w.club, "withdraw", key);
      expect(JSON.stringify(again)).toBe(JSON.stringify(first));
      expect(await rosterVersion(tx, w.club)).toBe(before);
      expect(await receiptsOf(tx, user(w, 1))).toHaveLength(1);
    });
  });

  it("gives the neutral not-found to another choice under the key of a leave, and keeps the first", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const key = randomUUID();
      const first = await leaving(tx, user(w, 1), w.club, "keep", key);
      // Not a conflict: to someone who isn't a member, a used key says no more than a new one (T14).
      expect(await refusal(leaving(tx, user(w, 1), w.club, "withdraw", key))).toEqual(NONE);
      expect((await membership(tx, member(w, 1)))?.contributions).toBe("keep");
      expect(await leaving(tx, user(w, 1), w.club, "keep", key)).toEqual(first);
    });
  });

  it("gives the neutral not-found to a new key after leaving, and keeps no receipt of it", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      await leaving(tx, user(w, 1), w.club);
      expect(await refusal(leaving(tx, user(w, 1), w.club))).toEqual(NONE);
      expect(await receiptsOf(tx, user(w, 1))).toHaveLength(1);
    });
  });

  it("gives a member who joined again the neutral not-found for the key they left with (FQ112)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const key = randomUUID();
      await leaving(tx, user(w, 1), w.club, "keep", key);
      // Maya is proposed, accepts and joins again: a new interval.
      clock.set(FIRST.add({ hours: 1 }));
      const open = await propose(tx, clock, user(w, 0), w.club, ["Maya"]);
      const made = await linkFor(tx, clock, user(w, 0), w.club, candidate(open, 0));
      await acceptWith(tx, clock, user(w, 1), made.token, open.id, 1);
      await approve(tx, clock, user(w, 2), open.id, 1);
      const [again] = await plain(tx)<{ interval_id: string }[]>`
        SELECT interval_id FROM app.memberships WHERE club_id = ${w.club} AND user_id = ${user(w, 1)} AND state = 'active'`;
      expect(again?.interval_id).not.toBe(member(w, 1));
      clock.set(FIRST.add({ hours: 2 }));
      expect(await refusal(leaving(tx, user(w, 1), w.club, "keep", key))).toEqual(NONE);
      expect(await refusal(leaving(tx, user(w, 1), w.club, "withdraw", key))).toEqual(NONE);
      expect(await membership(tx, again?.interval_id ?? "")).toMatchObject({ state: "active" });
      // A new key leaves the new interval, and the first interval's row is as it ended.
      const second = randomUUID();
      const left = await leaving(tx, user(w, 1), w.club, "withdraw", second);
      // The first leave's key stays unanswered now that both intervals have ended; the second's is answered.
      expect(await refusal(leaving(tx, user(w, 1), w.club, "keep", key))).toEqual(NONE);
      expect(await leaving(tx, user(w, 1), w.club, "withdraw", second)).toEqual(left);
      expect(await membership(tx, again?.interval_id ?? "")).toMatchObject({
        state: "left",
        contributions: "withdraw",
      });
      expect(await membership(tx, member(w, 1))).toMatchObject({ state: "left", contributions: "keep" });
    });
  });
});

describe("who may leave (T9, T14)", () => {
  it("gives the neutral not-found to a stranger, a club nobody has and an id that can't be one, with no receipt", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const stranger = await newUser(plain(tx), "Zed");
      expect(await refusal(leaving(tx, stranger, w.club))).toEqual(NONE);
      expect(await refusal(leaving(tx, user(w, 0), "club_nobody_has"))).toEqual(NONE);
      expect(await refusal(leaving(tx, user(w, 0), "not an id"))).toEqual(NONE);
      expect(await receiptsOf(tx, stranger)).toEqual([]);
      expect(await receiptsOf(tx, user(w, 0))).toEqual([]);
      expect(await membership(tx, member(w, 0))).toMatchObject({ state: "active" });
    });
  });

  it("gives it to a member of a suspended club (FQ122) and to an account being deleted, and ends nothing", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${LATER} WHERE id = ${user(w, 1)}`;
      expect(await refusal(leaving(tx, user(w, 1), w.club))).toEqual(NONE);
      await tx`UPDATE app.clubs SET suspended_at = ${LATER} WHERE id = ${w.club}`;
      expect(await refusal(leaving(tx, user(w, 0), w.club))).toEqual(NONE);
      for (const index of [0, 1, 2]) expect(await membership(tx, member(w, index))).toMatchObject({ state: "active" });
      expect(await receiptsOf(tx, user(w, 0))).toEqual([]);
    });
  });

  it("still answers the retry of a leave once the club is suspended", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const key = randomUUID();
      const first = await leaving(tx, user(w, 1), w.club, "keep", key);
      await tx`UPDATE app.clubs SET suspended_at = ${LATER} WHERE id = ${w.club}`;
      expect(await leaving(tx, user(w, 1), w.club, "keep", key)).toEqual(first);
    });
  });
});

describe("a leave behind the club's row (T1)", () => {
  const leavingAlone = (account: string, club: string, key: string = randomUUID()) =>
    db.begin((tx) =>
      leaveClub(
        tx as unknown as WorldTx,
        clock,
        { userId: account, key, clubId: club, contributions: "keep" },
        leftClubBody,
      ),
    );

  it("dates the leave by the clock as it reads once the row is the leave's", { timeout: 30_000 }, async () => {
    const w = await db.begin((tx) => clubOf(tx as unknown as WorldTx, 3));
    const moved = FIRST.add({ hours: 3 });
    const hold = await holding(db, w.club);
    // The leave waits for the row, and the clock moves while it waits.
    const waiting = leavingAlone(user(w, 1), w.club);
    try {
      await waitingOn(db, hold.pid, 1);
      clock.set(moved);
    } finally {
      await hold.release();
    }
    const answer = (await waiting) as { left_at: string };
    expect(answer.left_at).toBe("2026-11-11T08:00:00Z");
    const row = await membership(db as unknown as WorldTx, member(w, 1));
    expect(String(row?.left_at)).toBe("2026-11-11T08:00:00.123456Z");
  });

  it("ends one interval once when eight sends of one leave arrive at once", { timeout: 30_000 }, async () => {
    const w = await db.begin((tx) => clubOf(tx as unknown as WorldTx, 3));
    const before = await rosterVersion(db as unknown as WorldTx, w.club);
    const key = randomUUID();
    const eight = await Promise.all(Array.from({ length: 8 }, () => leavingAlone(user(w, 2), w.club, key)));
    expect(new Set(eight.map((answer) => JSON.stringify(answer))).size).toBe(1);
    expect(await rosterVersion(db as unknown as WorldTx, w.club)).toBe(before + 1);
    expect(await receiptsOf(db as unknown as WorldTx, user(w, 2))).toHaveLength(1);
  });

  it(
    "refuses the approval of someone whose leave came first, and never applies a roster that lists them",
    { timeout: 30_000 },
    async () => {
      const s = await db.begin(async (raw) => {
        const tx = raw as unknown as WorldTx;
        const w = await clubOf(tx, 3);
        const open = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
        const made = await linkFor(tx, clock, user(w, 0), w.club, candidate(open, 0));
        const sam = await newUser(plain(tx), "Sam");
        await acceptWith(tx, clock, sam, made.token, open.id, 1);
        await approve(tx, clock, user(w, 1), open.id, 1);
        return { w, open, sam };
      });
      // Alex's approval is the last one; Alex's leave is first behind the row.
      const hold = await holding(db, s.w.club);
      let left: Promise<unknown>;
      let approved: Promise<unknown>;
      try {
        left = outcome(leavingAlone(user(s.w, 2), s.w.club));
        await waitingOn(db, hold.pid, 1);
        approved = outcome(db.begin((tx) => approve(tx as unknown as WorldTx, clock, user(s.w, 2), s.open.id, 1)));
        await waitingOn(db, hold.pid, 2);
      } finally {
        await hold.release();
      }
      expect(await left).toMatchObject({ club_id: s.w.club });
      expect(await approved).toBe("NOT_FOUND");
      const tx = db as unknown as WorldTx;
      expect(await revisionRow(tx, s.open.id)).toMatchObject({ state: "superseded" });
      expect((await candidateState(tx, candidate(s.open, 0)))?.state).toBe("open");
      const next = await openOf(tx, s.w.club);
      expect(next?.members).toEqual([member(s.w, 0), member(s.w, 1)]);
      expect(next?.candidates).toEqual([{ id: candidate(s.open, 0), label: "Sam", accepted: false }]);
    },
  );

  it(
    "leaves a club that the last approval has just grown, when the approval came first",
    { timeout: 30_000 },
    async () => {
      const s = await db.begin(async (raw) => {
        const tx = raw as unknown as WorldTx;
        const w = await clubOf(tx, 3);
        const open = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
        const made = await linkFor(tx, clock, user(w, 0), w.club, candidate(open, 0));
        const sam = await newUser(plain(tx), "Sam");
        await acceptWith(tx, clock, sam, made.token, open.id, 1);
        await approve(tx, clock, user(w, 1), open.id, 1);
        return { w, open, sam };
      });
      const hold = await holding(db, s.w.club);
      let left: Promise<unknown>;
      let approved: Promise<unknown>;
      try {
        approved = outcome(db.begin((tx) => approve(tx as unknown as WorldTx, clock, user(s.w, 2), s.open.id, 1)));
        await waitingOn(db, hold.pid, 1);
        left = outcome(leavingAlone(user(s.w, 1), s.w.club));
        await waitingOn(db, hold.pid, 2);
      } finally {
        await hold.release();
      }
      expect(await approved).toMatchObject({ state: "applied" });
      expect(await left).toMatchObject({ club_id: s.w.club });
      const tx = db as unknown as WorldTx;
      const active = await plain(tx)<{ user_id: string }[]>`
      SELECT user_id FROM app.memberships WHERE club_id = ${s.w.club} AND state = 'active' ORDER BY joined_at`;
      expect(active.map((row) => row.user_id)).toEqual([user(s.w, 0), user(s.w, 2), s.sam]);
      expect(await openOf(tx, s.w.club)).toBeNull();
    },
  );
});

describe("found in the review of PR #78", () => {
  const originOf = async (tx: WorldTx, id: string): Promise<string | undefined> =>
    (await plain(tx)<{ origin: string }[]>`SELECT origin FROM app.roster_revisions WHERE id = ${id}`)[0]?.origin;
  const alone = <T>(command: (tx: WorldTx) => Promise<T>): Promise<T> =>
    db.begin((tx) => command(tx as unknown as WorldTx)) as Promise<T>;
  const leavingAlone = (account: string, club: string, key: string = randomUUID()) =>
    alone((tx) => leaveClub(tx, clock, { userId: account, key, clubId: club, contributions: "keep" }, leftClubBody));

  it("carries a name nobody has approved as that, with no approval: every member who stays approves it (FQ84)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const first = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
      const made = await linkFor(tx, clock, user(w, 0), w.club, candidate(first, 0));
      // The account that accepts is named Samuel: a revision for the name, which nobody has approved.
      const samuel = await newUser(plain(tx), "Samuel");
      expect((await acceptWith(tx, clock, samuel, made.token, first.id, 1)).state).toBe("changed");
      const named = await openOf(tx, w.club);
      expect(await originOf(tx, named?.id ?? "")).toBe("rename");
      expect(named?.approvals).toEqual([]);

      // Alex leaves. Ben, who proposed Sam, has not approved Samuel, and the new revision doesn't say so.
      await leaving(tx, user(w, 2), w.club);
      const next = await openOf(tx, w.club);
      expect(next?.id).not.toBe(named?.id);
      expect(await originOf(tx, next?.id ?? "")).toBe("rename");
      expect(next).toMatchObject({
        proposer: member(w, 0),
        members: [member(w, 0), member(w, 1)],
        candidates: [{ id: candidate(first, 0), label: "Samuel", accepted: false }],
        approvals: [],
      });
      // Samuel accepts it and waits; Maya's approval alone joins nobody; Ben's, the last, does.
      expect((await acceptWith(tx, clock, samuel, made.token, next?.id ?? "", 1)).state).toBe("waiting");
      expect((await approve(tx, clock, user(w, 1), next?.id ?? "", 1)).state).toBe("open");
      expect((await candidateState(tx, candidate(first, 0)))?.state).toBe("open");
      expect((await approve(tx, clock, user(w, 0), next?.id ?? "", 1)).state).toBe("applied");
      expect((await candidateState(tx, candidate(first, 0)))?.state).toBe("joined");
    });
  });

  it("carries a name's revision as that when the leave is committed, with the checks kept for the commit", async () => {
    const s = await alone(async (tx) => {
      const w = await clubOf(tx, 3);
      const first = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
      const made = await linkFor(tx, clock, user(w, 0), w.club, candidate(first, 0));
      const samuel = await newUser(plain(tx), "Samuel");
      await acceptWith(tx, clock, samuel, made.token, first.id, 1);
      return { w, first };
    });
    await leavingAlone(user(s.w, 2), s.w.club);
    const tx = db as unknown as WorldTx;
    const next = await openOf(tx, s.w.club);
    expect(await originOf(tx, next?.id ?? "")).toBe("rename");
    expect(next).toMatchObject({
      members: [member(s.w, 0), member(s.w, 1)],
      candidates: [{ id: candidate(s.first, 0), label: "Samuel", accepted: false }],
      approvals: [],
    });
  });

  it("tells someone who joined by a link and left nothing through that link, and keeps no receipt (T14)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const open = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
      const made = await linkFor(tx, clock, user(w, 0), w.club, candidate(open, 0));
      const sam = await newUser(plain(tx), "Sam");
      await acceptWith(tx, clock, sam, made.token, open.id, 1);
      await approve(tx, clock, user(w, 1), open.id, 1);
      expect((await approve(tx, clock, user(w, 2), open.id, 1)).state).toBe("applied");
      await leaving(tx, sam, w.club);
      // The revision Sam joined by, at a version it never had, at its own, and one that isn't.
      const [applied] = await plain(tx)<{ version: number }[]>`
        SELECT version FROM app.roster_revisions WHERE id = ${open.id}`;
      for (const version of [0, applied?.version ?? -1, 9]) {
        expect(await refusal(acceptWith(tx, clock, sam, made.token, open.id, version))).toEqual(NONE);
      }
      expect(await preview(tx, sam, made.token, NOW)).toBeNull();
      const receipts = await plain(tx)<{ state: string }[]>`
        SELECT state FROM app.idempotency_receipts WHERE actor_user_id = ${sam} AND operation = 'acceptInvitation'`;
      expect(receipts).toEqual([{ state: "completed" }]);
    });
  });

  it("doesn't answer the key of an earlier leave to someone who joined again, once the club is suspended (FQ112)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const key = randomUUID();
      await leaving(tx, user(w, 1), w.club, "keep", key);
      clock.set(FIRST.add({ hours: 1 }));
      const open = await propose(tx, clock, user(w, 0), w.club, ["Maya"]);
      const made = await linkFor(tx, clock, user(w, 0), w.club, candidate(open, 0));
      await acceptWith(tx, clock, user(w, 1), made.token, open.id, 1);
      await approve(tx, clock, user(w, 2), open.id, 1);
      expect(await refusal(leaving(tx, user(w, 1), w.club, "keep", key))).toEqual(NONE);
      await tx`UPDATE app.clubs SET suspended_at = ${LATER} WHERE id = ${w.club}`;
      expect(await refusal(leaving(tx, user(w, 1), w.club, "keep", key))).toEqual(NONE);
      expect(await refusal(leaving(tx, user(w, 1), w.club, "withdraw", key))).toEqual(NONE);
    });
  });

  it("reads a used key alike for a club nobody has, a club left and a suspended one the account is in (T14)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const other = await clubOf(tx, 2);
      const [second] = await joinByRoster(
        plain(tx),
        other.club,
        { user: user(other, 0), interval: member(other, 0) },
        [{ user: user(w, 1), label: "Maya" }],
        new Date("2026-11-10T00:00:00Z"),
      );
      const gone = await clubOf(tx, 2);
      const key = randomUUID();
      // Maya leaves one club under the key, and then a second one under another.
      await leaving(tx, user(w, 1), w.club, "keep", key);
      await joinByRoster(
        plain(tx),
        gone.club,
        { user: user(gone, 0), interval: member(gone, 0) },
        [{ user: user(w, 1), label: "Maya" }],
        new Date("2026-11-10T00:00:00Z"),
      );
      await leaving(tx, user(w, 1), gone.club);
      await tx`UPDATE app.clubs SET suspended_at = ${LATER} WHERE id = ${other.club}`;
      for (const club of [other.club, gone.club, "club_nobody_has"]) {
        for (const choice of ["keep", "withdraw"] as const) {
          expect(await refusal(leaving(tx, user(w, 1), club, choice, key))).toEqual(NONE);
        }
      }
      expect(await membership(tx, second ?? "")).toMatchObject({ state: "active", left_at: null });
      expect(await receiptsOf(tx, user(w, 1))).toHaveLength(2);
    });
  });

  it("keeps the club in the receipt: the key of a leave leaves no other club", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const other = await clubOf(tx, 2);
      // Maya is in both clubs, and joined the second before leaving the first.
      const [second] = await joinByRoster(
        plain(tx),
        other.club,
        { user: user(other, 0), interval: member(other, 0) },
        [{ user: user(w, 1), label: "Maya" }],
        new Date("2026-11-10T00:00:00Z"),
      );
      const key = randomUUID();
      await leaving(tx, user(w, 1), w.club, "keep", key);
      expect(await refusal(leaving(tx, user(w, 1), other.club, "keep", key))).toEqual({
        code: "IDEMPOTENCY_CONFLICT",
        facts: {},
      });
      expect(await membership(tx, second ?? "")).toMatchObject({ state: "active", left_at: null });
    });
  });

  it("ends a proposal with nothing left to carry, though its proposer stays", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      // Ben proposes Sam; Maya proposes Nina beside Sam, and Nina then ends (by rows: no command ends a
      // candidate and leaves its revision open), so the open revision is Maya's and holds only Ben's Sam.
      const first = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
      const open = await propose(tx, clock, user(w, 1), w.club, ["Nina"]);
      await plain(tx)`
        UPDATE app.candidates SET state = 'ended', ended_at = ${LATER} WHERE id = ${candidate(open, 1)}`;
      await leaving(tx, user(w, 0), w.club);
      expect(await revisionRow(tx, open.id)).toMatchObject({ state: "did_not_go_ahead", superseded_by_id: null });
      expect((await candidateState(tx, candidate(first, 0)))?.state).toBe("ended");
      expect(await openOf(tx, w.club)).toBeNull();
    });
  });

  it(
    "gives the neutral not-found to a second leave behind the first, and keeps no receipt of it",
    { timeout: 30_000 },
    async () => {
      const w = await alone((tx) => clubOf(tx, 3));
      const before = await rosterVersion(db as unknown as WorldTx, w.club);
      const hold = await holding(db, w.club);
      let first: Promise<unknown>;
      let second: Promise<unknown>;
      try {
        first = outcome(leavingAlone(user(w, 1), w.club));
        await waitingOn(db, hold.pid, 1);
        second = outcome(leavingAlone(user(w, 1), w.club));
        await waitingOn(db, hold.pid, 2);
      } finally {
        await hold.release();
      }
      expect(await first).toMatchObject({ club_id: w.club });
      expect(await second).toBe("NOT_FOUND");
      expect(await rosterVersion(db as unknown as WorldTx, w.club)).toBe(before + 1);
      expect(await receiptsOf(db as unknown as WorldTx, user(w, 1))).toEqual([{ state: "completed" }]);
    },
  );

  it(
    "lets two members leave one after the other behind the row, each ending the proposal as it stands",
    { timeout: 30_000 },
    async () => {
      const s = await alone(async (tx) => {
        const w = await clubOf(tx, 4);
        const open = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
        return { w, open };
      });
      const before = await rosterVersion(db as unknown as WorldTx, s.w.club);
      const hold = await holding(db, s.w.club);
      let one: Promise<unknown>;
      let two: Promise<unknown>;
      try {
        one = outcome(leavingAlone(user(s.w, 2), s.w.club));
        await waitingOn(db, hold.pid, 1);
        two = outcome(leavingAlone(user(s.w, 3), s.w.club));
        await waitingOn(db, hold.pid, 2);
      } finally {
        await hold.release();
      }
      expect(await one).toMatchObject({ club_id: s.w.club });
      expect(await two).toMatchObject({ club_id: s.w.club });
      const tx = db as unknown as WorldTx;
      expect(await rosterVersion(tx, s.w.club)).toBe(before + 2);
      const next = await openOf(tx, s.w.club);
      expect(next?.members).toEqual([member(s.w, 0), member(s.w, 1)]);
      expect(next?.candidates).toEqual([{ id: candidate(s.open, 0), label: "Sam", accepted: false }]);
      expect((await revisionsOf(tx, s.w.club)).filter((row) => row.state === "superseded")).toHaveLength(2);
    },
  );

  it(
    "answers an acceptance behind a leave with the roster that replaced the one it named",
    { timeout: 30_000 },
    async () => {
      const s = await alone(async (tx) => {
        const w = await clubOf(tx, 3);
        const open = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
        const made = await linkFor(tx, clock, user(w, 0), w.club, candidate(open, 0));
        return { w, open, made, sam: await newUser(plain(tx), "Sam") };
      });
      const accepting = () =>
        alone((tx) =>
          acceptInvitation(
            tx,
            clock,
            { userId: s.sam, key: randomUUID(), token: s.made.token, revisionId: s.open.id, expectedVersion: 1 },
            invitationAcceptanceBody,
          ),
        );
      const hold = await holding(db, s.w.club);
      let left: Promise<unknown>;
      let accepted: Promise<unknown>;
      try {
        left = outcome(leavingAlone(user(s.w, 2), s.w.club));
        await waitingOn(db, hold.pid, 1);
        accepted = refusal(accepting());
        await waitingOn(db, hold.pid, 2);
      } finally {
        await hold.release();
      }
      expect(await left).toMatchObject({ club_id: s.w.club });
      const tx = db as unknown as WorldTx;
      const next = await openOf(tx, s.w.club);
      expect(await accepted).toEqual({ code: "ROSTER_CHANGED", facts: { current_id: next?.id } });
      expect(next?.candidates).toEqual([{ id: candidate(s.open, 0), label: "Sam", accepted: false }]);
    },
  );

  it("carries no acceptance that came just before the leave", { timeout: 30_000 }, async () => {
    const s = await alone(async (tx) => {
      const w = await clubOf(tx, 3);
      const open = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
      const made = await linkFor(tx, clock, user(w, 0), w.club, candidate(open, 0));
      return { w, open, made, sam: await newUser(plain(tx), "Sam") };
    });
    const hold = await holding(db, s.w.club);
    let left: Promise<unknown>;
    let accepted: Promise<unknown>;
    try {
      accepted = outcome(
        alone((tx) =>
          acceptInvitation(
            tx,
            clock,
            { userId: s.sam, key: randomUUID(), token: s.made.token, revisionId: s.open.id, expectedVersion: 1 },
            invitationAcceptanceBody,
          ),
        ),
      );
      await waitingOn(db, hold.pid, 1);
      left = outcome(leavingAlone(user(s.w, 2), s.w.club));
      await waitingOn(db, hold.pid, 2);
    } finally {
      await hold.release();
    }
    expect(await accepted).toMatchObject({ state: "waiting" });
    expect(await left).toMatchObject({ club_id: s.w.club });
    const tx = db as unknown as WorldTx;
    const next = await openOf(tx, s.w.club);
    expect(next?.members).toEqual([member(s.w, 0), member(s.w, 1)]);
    expect(next?.candidates).toEqual([{ id: candidate(s.open, 0), label: "Sam", accepted: false }]);
    expect((await candidateState(tx, candidate(s.open, 0)))?.state).toBe("open");
  });
});
