/// <reference lib="esnext.temporal" />
// Accepting, approving, declining and the roster applied, against Postgres as `tadayo_app` (spec 04, 32;
// G02, G03, book p9, p30; T1, T6, T7, T8, T14, T19, T27, T33, T52; A01; FQ47, FQ54, FQ59, FQ60, FQ65, FQ66,
// FQ71, FQ84, FQ100, FQ112, FQ119, FQ120; docs/plans/api-b1-clubs.md, section 4;
// packages/domain/src/clubs/invitation-preview.ts, accept-invitation.ts, decide-roster.ts, apply-roster.ts):
// what a link shows the person holding it, the exact roster accepted and approved in either order, the
// club's start with its first days, the people who join and the candidates carried on, a revision made for
// another name, a decline, and every refusal.
//
// These tests were written after the code, from the plan's section 4, so none was seen to fail before its
// rule existed. The tests of the last four describes came from the review, each for a change the reviewers
// showed no test would catch.

import { createHash, randomUUID } from "node:crypto";
import { invitationAcceptanceBody, rosterRevisionBody } from "@tadayo/api";
import {
  acceptInvitation,
  approveRoster,
  declineRoster,
  listClubs,
  listMembers,
  revokeInvitation,
  type ServerNow,
} from "@tadayo/domain";
import { fakeClock, type FakeClock } from "@tadayo/domain/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rolledBack, worldSql, type WorldTx } from "./harness.ts";
import {
  accept,
  acceptWith,
  approve,
  decide,
  decline,
  founded,
  linkFor,
  plain,
  preview,
  propose,
  read,
  refusal,
  revoke,
  rosterVersion,
  webPreview,
  type RevisionBody,
} from "./roster-world.ts";
import { clubOf, holding, waitingOn, type WeekClub } from "./week-world.ts";
import { checkAsAtCommit, leave, newId, newUser } from "./world.ts";

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
/** Seven days after the first instant, cut to the whole second (FQ71). */
const EXPIRES = "2026-11-18T05:00:00Z";
const NONE = { code: "NOT_FOUND", facts: {} };

const user = (w: WeekClub, index: number): string => w.users[index] ?? "";
const member = (w: WeekClub, index: number): string => w.members[index] ?? "";
const candidate = (revision: RevisionBody, index: number): string => revision.candidates[index]?.id ?? "";

/** A clock that reads a second later at every sample, from the first instant. */
function ticking(): FakeClock {
  const base = fakeClock(AT_FIRST);
  return {
    ...base,
    async sample(sql) {
      const at = await base.sample(sql);
      base.advance({ seconds: 1 });
      return at;
    },
  };
}

interface First {
  ben: { user: string; club: string; interval: string };
  open: RevisionBody;
  /** Maya's and Alex's candidates and links, both Ben's. */
  maya: { candidate: string; link: string; token: string };
  alex: { candidate: string; link: string; token: string };
}

/** Ben's new club, proposed, with Maya and Alex proposed and a link made for each. */
async function firstRoster(tx: WorldTx, labels: readonly [string, string] = ["Maya", "Alex"]): Promise<First> {
  const ben = await founded(tx, clock);
  const open = await propose(tx, clock, ben.user, ben.club, labels);
  const [mayaLink, alexLink] = [
    await linkFor(tx, clock, ben.user, ben.club, candidate(open, 0)),
    await linkFor(tx, clock, ben.user, ben.club, candidate(open, 1)),
  ];
  return {
    ben,
    open,
    maya: { candidate: candidate(open, 0), link: mayaLink.id, token: mayaLink.token },
    alex: { candidate: candidate(open, 1), link: alexLink.id, token: alexLink.token },
  };
}

interface Later {
  w: WeekClub;
  open: RevisionBody;
  /** Sam, whom Ben proposed. */
  sam: { candidate: string; link: string; token: string };
}

/** Ben, Maya and Alex in a club that has started; Ben proposes Sam and makes Sam's link. */
async function laterRoster(tx: WorldTx, labels: readonly string[] = ["Sam"]): Promise<Later> {
  const w = await clubOf(tx, 3);
  const open = await propose(tx, clock, user(w, 0), w.club, labels);
  const made = await linkFor(tx, clock, user(w, 0), w.club, candidate(open, 0));
  return { w, open, sam: { candidate: candidate(open, 0), link: made.id, token: made.token } };
}

const revisionRow = async (tx: WorldTx, id: string) =>
  (
    await tx<
      {
        state: string;
        version: number;
        origin: string;
        proposed_by_interval_id: string;
        superseded_by_id: string | null;
        ended_at: Temporal.Instant | null;
      }[]
    >`SELECT state, version, origin, proposed_by_interval_id, superseded_by_id, ended_at
        FROM app.roster_revisions WHERE id = ${id}`
  )[0];

const openRevision = async (tx: WorldTx, club: string): Promise<string | null> =>
  (await tx<{ id: string }[]>`SELECT id FROM app.roster_revisions WHERE club_id = ${club} AND state = 'open'`)[0]?.id ??
  null;

const membersOf = (tx: WorldTx, club: string) =>
  tx<
    {
      interval_id: string;
      user_id: string;
      origin: string;
      joined_at: Temporal.Instant;
      joined_via_revision_id: string | null;
      joined_via_candidate_id: string | null;
    }[]
  >`SELECT interval_id, user_id, origin, joined_at, joined_via_revision_id, joined_via_candidate_id
      FROM app.memberships WHERE club_id = ${club} AND state = 'active' ORDER BY joined_at, interval_id COLLATE "C"`;

const candidateState = async (tx: WorldTx, id: string): Promise<string | undefined> =>
  (await tx<{ state: string }[]>`SELECT state FROM app.candidates WHERE id = ${id}`)[0]?.state;

// In the order of the ids' bytes, whatever the database's collation, so a test can sort what it expects the same way.
const approvalsOf = (tx: WorldTx, revision: string) =>
  tx<{ interval_id: string; decision: string; implicit: boolean }[]>`
    SELECT interval_id, decision, implicit FROM app.roster_approvals
    WHERE revision_id = ${revision} ORDER BY interval_id COLLATE "C"`;

const clubRow = async (tx: WorldTx, club: string) =>
  (
    await tx<{ roster_version: number; activated_at: Temporal.Instant | null }[]>`
      SELECT roster_version, activated_at FROM app.clubs WHERE id = ${club}`
  )[0];

describe("a first roster: the club starts as soon as one person accepts (FQ54)", () => {
  it("shows the signed-out page the inviter's name, and the person signed in the exact roster, names only (T7, FQ47)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await firstRoster(tx);
      const maya = await newUser(plain(tx), "Maya");
      expect(await webPreview(tx, s.maya.token, NOW)).toEqual({ inviter_name: "Ben" });
      expect(await preview(tx, maya, s.maya.token, NOW)).toEqual({
        state: "open",
        invitation_id: s.maya.link,
        inviter_name: "Ben",
        club_name: "Sunday people",
        revision_id: s.open.id,
        revision_version: 1,
        roster: [
          { name: "Ben", kind: "member", is_you: false },
          { name: "Maya", kind: "candidate", is_you: true },
          { name: "Alex", kind: "candidate", is_you: false },
        ],
        expires_at: EXPIRES,
      });
      // Previewing binds nothing and uses nothing up.
      const [row] = await tx<{ bound_user_id: string | null }[]>`
        SELECT bound_user_id FROM app.invitations WHERE id = ${s.maya.link}`;
      expect(row?.bound_user_id).toBeNull();
      expect(await membersOf(tx, s.ben.club)).toHaveLength(1);
    });
  });

  it("joins the person who accepts, starts the club, opens its first days and carries the other candidate into a new revision (FQ54, FQ120)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await firstRoster(tx);
      const maya = await newUser(plain(tx), "Maya");
      const before = await rosterVersion(tx, s.ben.club);
      const at = FIRST.add({ hours: 1 });
      clock.set(at);
      const now = (): ServerNow => at as ServerNow;
      const answer = await acceptWith(tx, clock, maya, s.maya.token, s.open.id, 1);
      await checkAsAtCommit(plain(tx));
      const members = await membersOf(tx, s.ben.club);
      expect(members).toHaveLength(2);
      const joined = members[1];
      expect(joined).toMatchObject({
        user_id: maya,
        origin: "roster",
        joined_via_revision_id: s.open.id,
        joined_via_candidate_id: s.maya.candidate,
      });
      expect(joined?.joined_at.equals(at)).toBe(true);
      expect(joined?.interval_id).toMatch(/^mem_[A-Za-z0-9_-]{22}$/);
      expect(answer).toEqual({
        invitation_id: s.maya.link,
        state: "joined",
        club: {
          id: s.ben.club,
          name: "Sunday people",
          timezone: "America/New_York",
          my_membership_id: joined?.interval_id,
        },
      });
      // The revision is applied, its version moved with its state; Maya's candidate joined.
      expect(await revisionRow(tx, s.open.id)).toMatchObject({ state: "applied", version: 2 });
      expect(await candidateState(tx, s.maya.candidate)).toBe("joined");
      // The club started at the same instant, its roster's version moved once, and its first days are open.
      const club = await clubRow(tx, s.ben.club);
      expect(club?.activated_at?.equals(at)).toBe(true);
      expect(club?.roster_version).toBe(before + 1);
      const proposals = await tx<{ reason: string; state: string; members: number }[]>`
        SELECT p.reason, p.state,
               (SELECT pg_catalog.count(*)::int4 FROM app.schedule_proposal_members m WHERE m.proposal_id = p.id) AS members
          FROM app.schedule_proposals p WHERE p.club_id = ${s.ben.club}`;
      expect(proposals).toEqual([{ reason: "activation", state: "open", members: 2 }]);

      // Alex, who hadn't accepted, is carried into a new revision: Ben's, approved by Ben as before, for
      // Ben and Maya to hold, and Maya, who has just joined, is asked.
      expect(await candidateState(tx, s.alex.candidate)).toBe("open");
      const carried = (await openRevision(tx, s.ben.club)) ?? "";
      expect(carried).not.toBe(s.open.id);
      expect(await revisionRow(tx, carried)).toMatchObject({
        state: "open",
        version: 1,
        origin: "proposal",
        proposed_by_interval_id: s.ben.interval,
      });
      expect(await approvalsOf(tx, carried)).toEqual([
        { interval_id: s.ben.interval, decision: "approved", implicit: true },
      ]);
      const forMaya = await read(tx, maya, carried, now());
      expect(forMaya?.members.map((one) => one.display_name)).toEqual(["Ben", "Maya"]);
      expect(forMaya?.candidates.map((one) => [one.id, one.name])).toEqual([[s.alex.candidate, "Alex"]]);
      expect(forMaya?.my_decision).toBe("pending");
      expect((await read(tx, s.ben.user, carried, now()))?.my_decision).toBe("approved");
      // The applied revision didn't list Maya as a member, so it isn't Maya's to read (FQ119).
      expect(await read(tx, maya, s.open.id, now())).toBeNull();

      // Alex's link still works, and now shows the roster with Maya in it.
      const alex = await newUser(plain(tx), "Alex");
      expect(await preview(tx, alex, s.alex.token, now())).toMatchObject({
        state: "open",
        revision_id: carried,
        revision_version: 1,
        roster: [
          { name: "Ben", kind: "member", is_you: false },
          { name: "Maya", kind: "member", is_you: false },
          { name: "Alex", kind: "candidate", is_you: true },
        ],
      });
      // Alex accepts and waits: Maya hasn't approved. Then Maya approves, and Alex is in.
      clock.advance({ minutes: 5 });
      expect(await acceptWith(tx, clock, alex, s.alex.token, carried, 1)).toEqual({
        invitation_id: s.alex.link,
        state: "waiting",
      });
      expect(await membersOf(tx, s.ben.club)).toHaveLength(2);
      const approved = await approve(tx, clock, maya, carried, 1);
      await checkAsAtCommit(plain(tx));
      expect(approved).toMatchObject({ id: carried, state: "applied", version: 2, my_decision: "approved" });
      expect((await membersOf(tx, s.ben.club)).map((one) => one.user_id)).toEqual([s.ben.user, maya, alex]);
      expect(await openRevision(tx, s.ben.club)).toBeNull();
      // The first days were opened once, for the two who started the club (FQ100): Alex has no day yet.
      expect(await tx`SELECT FROM app.schedule_proposals WHERE club_id = ${s.ben.club}`).toHaveLength(1);
      expect((await clubRow(tx, s.ben.club))?.roster_version).toBe(before + 2);
    });
  });
});

describe("a later addition: every member approves, the candidate accepts, in either order (FQ65)", () => {
  it("joins the candidate on their acceptance once every member has approved, and not before", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      // Ben approved by proposing (FQ60). Maya approves: nothing else changes, and the answer says nothing
      // of anyone else's decision, with the version where it was (T33).
      const maya = await approve(tx, clock, user(s.w, 1), s.open.id, 1);
      expect(maya).toEqual({
        ...s.open,
        club: { ...s.open.club, my_membership_id: member(s.w, 1) },
        my_decision: "approved",
        candidates: [{ id: s.sam.candidate, name: "Sam", proposed_by: s.open.candidates[0]?.proposed_by }],
      });
      expect(await membersOf(tx, s.w.club)).toHaveLength(3);
      const alex = await approve(tx, clock, user(s.w, 2), s.open.id, 1);
      expect(alex).toMatchObject({ state: "open", version: 1, my_decision: "approved" });
      expect(await approvalsOf(tx, s.open.id)).toEqual(
        [
          { interval_id: member(s.w, 0), decision: "approved", implicit: true },
          { interval_id: member(s.w, 1), decision: "approved", implicit: false },
          { interval_id: member(s.w, 2), decision: "approved", implicit: false },
        ].sort((a, b) => (a.interval_id < b.interval_id ? -1 : 1)),
      );
      // Nobody has accepted, so nobody has joined.
      expect(await revisionRow(tx, s.open.id)).toMatchObject({ state: "open", version: 1 });
      const before = await rosterVersion(tx, s.w.club);
      clock.advance({ minutes: 1 });
      const answer = await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      await checkAsAtCommit(plain(tx));
      expect(answer.state).toBe("joined");
      const members = await membersOf(tx, s.w.club);
      expect(members.map((one) => one.user_id)).toEqual([...s.w.users, sam]);
      expect(answer.club?.my_membership_id).toBe(members[3]?.interval_id);
      expect(await revisionRow(tx, s.open.id)).toMatchObject({ state: "applied", version: 2 });
      expect(await rosterVersion(tx, s.w.club)).toBe(before + 1);
      // Nobody was left to carry, so no revision is open; and a club that had started opens no first days.
      expect(await openRevision(tx, s.w.club)).toBeNull();
      expect(await tx`SELECT FROM app.schedule_proposals WHERE club_id = ${s.w.club}`).toHaveLength(0);
    });
  });

  it("keeps a candidate who accepted first waiting, with no progress shown, until the last member approves", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      expect(await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1)).toEqual({
        invitation_id: s.sam.link,
        state: "waiting",
      });
      const waiting = await preview(tx, sam, s.sam.token, NOW);
      expect(waiting).toEqual({
        state: "waiting",
        invitation_id: s.sam.link,
        inviter_name: "Ben",
        club_name: "Sunday people",
        revision_id: s.open.id,
        revision_version: 1,
        roster: [
          { name: "Ben", kind: "member", is_you: false },
          { name: "Maya", kind: "member", is_you: false },
          { name: "Alex", kind: "member", is_you: false },
          { name: "Sam", kind: "candidate", is_you: true },
        ],
      });
      // The signed-out page no longer names anyone for it: the link is used (FQ59).
      expect(await webPreview(tx, s.sam.token, NOW)).toBeNull();
      // One approval of two changes nothing Sam can see (T33).
      await approve(tx, clock, user(s.w, 1), s.open.id, 1);
      expect(await preview(tx, sam, s.sam.token, NOW)).toEqual(waiting);
      expect((await listClubs(tx, sam, NOW)).invitations).toEqual([
        { id: s.sam.link, clubName: "Sunday people", inviterName: "Ben", state: "waiting" },
      ]);
      expect(await membersOf(tx, s.w.club)).toHaveLength(3);
      // The last approval applies the roster: its answer is the revision, applied.
      clock.advance({ minutes: 2 });
      const last = await approve(tx, clock, user(s.w, 2), s.open.id, 1);
      await checkAsAtCommit(plain(tx));
      expect(last).toMatchObject({ state: "applied", version: 2, my_decision: "approved" });
      const members = await membersOf(tx, s.w.club);
      expect(members[3]).toMatchObject({ user_id: sam, joined_via_revision_id: s.open.id });
      expect(members[3]?.joined_at.equals(FIRST.add({ minutes: 2 }))).toBe(true);
      // Sam's link now opens the club, and the list holds the club, not the invitation.
      expect(await preview(tx, sam, s.sam.token, NOW)).toEqual({
        state: "joined",
        club: {
          id: s.w.club,
          name: "Sunday people",
          timezone: "America/New_York",
          my_membership_id: members[3]?.interval_id,
        },
      });
      const listed = await listClubs(tx, sam, NOW);
      expect(listed.invitations).toEqual([]);
      expect(listed.clubs.map((one) => one.id)).toEqual([s.w.club]);
    });
  });

  it("joins everyone who accepted together, and carries the one who hadn't", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 2);
      const open = await propose(tx, clock, user(w, 0), w.club, ["Alex", "Sam", "Debby"]);
      const links = [];
      for (const index of [0, 1, 2]) links.push(await linkFor(tx, clock, user(w, 0), w.club, candidate(open, index)));
      const sam = await newUser(plain(tx), "Sam");
      const alex = await newUser(plain(tx), "Alex");
      // Sam accepts before Alex; both join on the last approval.
      await acceptWith(tx, clock, sam, links[1]?.token ?? "", open.id, 1);
      await acceptWith(tx, clock, alex, links[0]?.token ?? "", open.id, 1);
      await approve(tx, clock, user(w, 1), open.id, 1);
      await checkAsAtCommit(plain(tx));
      const joined = await tx<{ user_id: string; joined_via_candidate_id: string }[]>`
        SELECT user_id, joined_via_candidate_id FROM app.memberships
         WHERE club_id = ${w.club} AND joined_via_revision_id = ${open.id}`;
      expect(new Set(joined.map((one) => one.user_id))).toEqual(new Set([alex, sam]));
      expect(await candidateState(tx, candidate(open, 0))).toBe("joined");
      expect(await candidateState(tx, candidate(open, 1))).toBe("joined");
      // Debby is carried at Debby's own label, first now, with no acceptance; all four members hold the new roster.
      const carried = (await openRevision(tx, w.club)) ?? "";
      const rows = await tx<{ candidate_id: string; label: string; position: number; accepted_at: unknown }[]>`
        SELECT candidate_id, label, position, accepted_at FROM app.roster_revision_candidates WHERE revision_id = ${carried}`;
      expect(rows).toEqual([{ candidate_id: candidate(open, 2), label: "Debby", position: 1, accepted_at: null }]);
      expect(await tx`SELECT FROM app.roster_revision_members WHERE revision_id = ${carried}`).toHaveLength(4);
      // Six still counts Debby: five members and candidates, so one more can be proposed and not two.
      expect(await refusal(propose(tx, clock, user(w, 0), w.club, ["Nina", "Zed"]))).toMatchObject({
        code: "CLUB_FULL",
      });
    });
  });

  it("dates the membership from the sample taken after the lock, not the receipt's (T1)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await firstRoster(tx);
      const maya = await newUser(plain(tx), "Maya");
      await acceptWith(tx, ticking(), maya, s.maya.token, s.open.id, 1);
      const members = await membersOf(tx, s.ben.club);
      // The samples: the facts before the receipt, the receipt, then the one after the lock, two seconds on.
      expect(members[1]?.joined_at.equals(FIRST.add({ seconds: 2 }))).toBe(true);
      expect((await clubRow(tx, s.ben.club))?.activated_at?.equals(FIRST.add({ seconds: 2 }))).toBe(true);
      const [receipt] = await tx<{ created_at: Temporal.Instant }[]>`
        SELECT created_at FROM app.idempotency_receipts WHERE actor_user_id = ${maya} AND operation = 'acceptInvitation'`;
      expect(receipt?.created_at.equals(FIRST.add({ seconds: 1 }))).toBe(true);
    });
  });
});

describe("another name: a revision the server makes, which everyone accepts and approves again (FQ66, FQ84)", () => {
  it("makes a revision under the account's own name, binds the link, and starts a first roster only once its creator has approved it and a candidate has accepted it", async () => {
    await rolledBack(db, async (tx) => {
      const s = await firstRoster(tx, ["Leila", "Alex"]);
      const debby = await newUser(plain(tx), "Debby");
      const before = await rosterVersion(tx, s.ben.club);
      const answer = await acceptWith(tx, clock, debby, s.maya.token, s.open.id, 1);
      await checkAsAtCommit(plain(tx));
      expect(answer).toEqual({ invitation_id: s.maya.link, state: "changed" });
      // Nobody joined and the club hasn't started: the acceptance was under a name nobody approved.
      expect(await membersOf(tx, s.ben.club)).toHaveLength(1);
      expect((await clubRow(tx, s.ben.club))?.activated_at).toBeNull();
      expect(await rosterVersion(tx, s.ben.club)).toBe(before + 1);
      const next = (await openRevision(tx, s.ben.club)) ?? "";
      expect(await revisionRow(tx, s.open.id)).toMatchObject({
        state: "superseded",
        version: 2,
        superseded_by_id: next,
      });
      // The new revision: the server's, naming Ben, whose link was used; nobody has approved it, Ben included.
      expect(await revisionRow(tx, next)).toMatchObject({
        state: "open",
        version: 1,
        origin: "rename",
        proposed_by_interval_id: s.ben.interval,
      });
      expect(await approvalsOf(tx, next)).toEqual([]);
      const rows = await tx<{ candidate_id: string; label: string; position: number; accepted_at: unknown }[]>`
        SELECT candidate_id, label, position, accepted_at FROM app.roster_revision_candidates
         WHERE revision_id = ${next} ORDER BY position`;
      expect(rows).toEqual([
        { candidate_id: s.maya.candidate, label: "Debby", position: 1, accepted_at: null },
        { candidate_id: s.alex.candidate, label: "Alex", position: 2, accepted_at: null },
      ]);
      const [bound] = await tx<{ bound_user_id: string | null; bound_at: Temporal.Instant | null }[]>`
        SELECT bound_user_id, bound_at FROM app.invitations WHERE id = ${s.maya.link}`;
      expect(bound?.bound_user_id).toBe(debby);
      expect(bound?.bound_at?.equals(FIRST)).toBe(true);
      // Ben reads the link as used, and is asked like anyone (FQ84).
      const forBen = await read(tx, s.ben.user, next, NOW);
      expect(forBen).toMatchObject({ my_decision: "pending", proposed_by: { membership_id: s.ben.interval } });
      expect(forBen?.candidates[0]).toMatchObject({ name: "Debby", invitation: { id: s.maya.link, state: "used" } });
      // Debby reviews the new roster, under Debby's own name.
      expect(await preview(tx, debby, s.maya.token, NOW)).toEqual({
        state: "changed",
        invitation_id: s.maya.link,
        inviter_name: "Ben",
        club_name: "Sunday people",
        revision_id: next,
        revision_version: 1,
        roster: [
          { name: "Ben", kind: "member", is_you: false },
          { name: "Debby", kind: "candidate", is_you: true },
          { name: "Alex", kind: "candidate", is_you: false },
        ],
        expires_at: EXPIRES,
      });
      expect((await listClubs(tx, debby, NOW)).invitations.map((one) => one.state)).toEqual(["roster_changed"]);
      // The old revision is no longer the one to accept.
      expect(await refusal(acceptWith(tx, clock, debby, s.maya.token, s.open.id, 2))).toEqual({
        code: "ROSTER_CHANGED",
        facts: { current_id: next },
      });
      // Debby accepts again and waits: Ben hasn't approved that name. Ben approves, and the club starts.
      expect((await acceptWith(tx, clock, debby, s.maya.token, next, 1)).state).toBe("waiting");
      expect((await clubRow(tx, s.ben.club))?.activated_at).toBeNull();
      clock.advance({ minutes: 1 });
      const approved = await approve(tx, clock, s.ben.user, next, 1);
      await checkAsAtCommit(plain(tx));
      expect(approved).toMatchObject({ state: "applied", version: 2, my_decision: "approved" });
      expect((await membersOf(tx, s.ben.club)).map((one) => one.user_id)).toEqual([s.ben.user, debby]);
      expect((await clubRow(tx, s.ben.club))?.activated_at).not.toBeNull();
      // Alex goes on in a member's proposal again: Ben's, approved by Ben as it was.
      const carried = (await openRevision(tx, s.ben.club)) ?? "";
      expect(await revisionRow(tx, carried)).toMatchObject({
        origin: "proposal",
        proposed_by_interval_id: s.ben.interval,
      });
      expect(await approvalsOf(tx, carried)).toEqual([
        { interval_id: s.ben.interval, decision: "approved", implicit: true },
      ]);
    });
  });

  it("starts the club on the acceptance when the creator approved the new revision first", async () => {
    await rolledBack(db, async (tx) => {
      const s = await firstRoster(tx, ["Leila", "Alex"]);
      const debby = await newUser(plain(tx), "Debby");
      await acceptWith(tx, clock, debby, s.maya.token, s.open.id, 1);
      const next = (await openRevision(tx, s.ben.club)) ?? "";
      expect(await approve(tx, clock, s.ben.user, next, 1)).toMatchObject({ state: "open", my_decision: "approved" });
      expect((await acceptWith(tx, clock, debby, s.maya.token, next, 1)).state).toBe("joined");
      expect((await clubRow(tx, s.ben.club))?.activated_at).not.toBeNull();
    });
  });

  it("compares names as they are stored: another case is another name", async () => {
    await rolledBack(db, async (tx) => {
      const s = await firstRoster(tx);
      const maya = await newUser(plain(tx), "maya");
      expect((await acceptWith(tx, clock, maya, s.maya.token, s.open.id, 1)).state).toBe("changed");
    });
  });

  it("drops the other candidates' acceptances with the old revision: they accept the new one again", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx, ["Sam", "Leila"]);
      const leilaLink = await linkFor(tx, clock, user(s.w, 0), s.w.club, candidate(s.open, 1));
      const sam = await newUser(plain(tx), "Sam");
      const debby = await newUser(plain(tx), "Debby");
      await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      await approve(tx, clock, user(s.w, 1), s.open.id, 1);
      await acceptWith(tx, clock, debby, leilaLink.token, s.open.id, 1);
      const next = (await openRevision(tx, s.w.club)) ?? "";
      // Sam accepted the old roster, so Sam's invitation has changed; Maya's approval is gone with it.
      expect(await preview(tx, sam, s.sam.token, NOW)).toMatchObject({ state: "changed", revision_id: next });
      expect((await read(tx, user(s.w, 1), next, NOW))?.my_decision).toBe("pending");
      expect(await approvalsOf(tx, next)).toEqual([]);
    });
  });
});

describe("declining: the revision ends for every candidate, and nobody is told who (book p30, T33)", () => {
  it("ends the revision and its candidates, moves the versions once, and tells an accepted candidate only that it didn't go ahead", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx, ["Sam", "Debby"]);
      const debbyLink = await linkFor(tx, clock, user(s.w, 0), s.w.club, candidate(s.open, 1));
      const sam = await newUser(plain(tx), "Sam");
      const debby = await newUser(plain(tx), "Debby");
      await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      const before = await rosterVersion(tx, s.w.club);
      clock.advance({ minutes: 3 });
      const answer = await decline(tx, clock, user(s.w, 1), s.open.id, 1);
      await checkAsAtCommit(plain(tx));
      expect(answer).toMatchObject({ id: s.open.id, state: "did_not_go_ahead", version: 2, my_decision: "declined" });
      const row = await revisionRow(tx, s.open.id);
      expect(row).toMatchObject({ state: "did_not_go_ahead", version: 2, superseded_by_id: null });
      expect(row?.ended_at?.equals(FIRST.add({ minutes: 3 }))).toBe(true);
      expect(await candidateState(tx, s.sam.candidate)).toBe("ended");
      expect(await candidateState(tx, candidate(s.open, 1))).toBe("ended");
      expect(await rosterVersion(tx, s.w.club)).toBe(before + 1);
      expect(await membersOf(tx, s.w.club)).toHaveLength(3);
      // The other members read the same ended revision, with only their own decision.
      expect(await read(tx, user(s.w, 2), s.open.id, NOW)).toMatchObject({
        state: "did_not_go_ahead",
        my_decision: "pending",
      });
      expect(await read(tx, user(s.w, 0), s.open.id, NOW)).toMatchObject({
        state: "did_not_go_ahead",
        my_decision: "approved",
      });
      // Sam, who accepted, learns only that it didn't go ahead, and who can invite again; Debby, who never
      // did, gets nothing at all.
      expect(await preview(tx, sam, s.sam.token, NOW)).toEqual({ state: "did_not_go_ahead", inviter_name: "Ben" });
      expect((await listClubs(tx, sam, NOW)).invitations.map((one) => one.state)).toEqual(["did_not_go_ahead"]);
      expect(await preview(tx, debby, debbyLink.token, NOW)).toBeNull();
      expect(await webPreview(tx, debbyLink.token, NOW)).toBeNull();
      expect(await refusal(acceptWith(tx, clock, debby, debbyLink.token, s.open.id, 2))).toEqual(NONE);
      expect(await refusal(acceptWith(tx, clock, sam, s.sam.token, s.open.id, 2))).toEqual(NONE);
      expect(await refusal(acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1))).toEqual({
        code: "VERSION_CONFLICT",
        facts: { current_version: 2 },
      });
      // The six places are free again: five more can be proposed... three members, so three.
      const again = await propose(tx, clock, user(s.w, 0), s.w.club, ["Nina", "Zed", "Sam"]);
      expect(again.candidates).toHaveLength(3);
    });
  });
});

describe("a decision that can change nothing is answered with the revision as it stands", () => {
  it("leaves a proposer's own proposal, a second approval, a decline after approving and a decision on an ended revision as they were", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      // Ben approved by proposing: approving again, or declining, writes nothing.
      const ben = await read(tx, user(s.w, 0), s.open.id, NOW);
      expect(ben?.my_decision).toBe("approved");
      expect(await approve(tx, clock, user(s.w, 0), s.open.id, 1)).toEqual(ben);
      expect(await decline(tx, clock, user(s.w, 0), s.open.id, 1)).toEqual(ben);
      const maya = await approve(tx, clock, user(s.w, 1), s.open.id, 1);
      expect(await approve(tx, clock, user(s.w, 1), s.open.id, 1)).toEqual(maya);
      expect(await decline(tx, clock, user(s.w, 1), s.open.id, 1)).toEqual(maya);
      expect(await revisionRow(tx, s.open.id)).toMatchObject({ state: "open", version: 1 });
      expect(await approvalsOf(tx, s.open.id)).toHaveLength(2);
      // Alex declines; then nothing more is decided, by Alex or anyone.
      const ended = await decline(tx, clock, user(s.w, 2), s.open.id, 1);
      expect(await approve(tx, clock, user(s.w, 2), s.open.id, 2)).toEqual(ended);
      expect(await decline(tx, clock, user(s.w, 2), s.open.id, 2)).toEqual(ended);
      expect(await approvalsOf(tx, s.open.id)).toHaveLength(3);
      expect(await revisionRow(tx, s.open.id)).toMatchObject({ state: "did_not_go_ahead", version: 2 });
    });
  });
});

const LATER = new Date("2026-11-11T06:00:00Z");

const linkRow = async (tx: WorldTx, id: string) =>
  (
    await tx<
      { bound_user_id: string | null; bound_at: Temporal.Instant | null; revoked_at: Temporal.Instant | null }[]
    >`
      SELECT bound_user_id, bound_at, revoked_at FROM app.invitations WHERE id = ${id}`
  )[0];

const receiptsOf = (tx: WorldTx, userId: string, operation: string) =>
  tx<{ whole: string; response_body: unknown }[]>`
    SELECT pg_catalog.row_to_json(r)::text AS whole, response_body
      FROM app.idempotency_receipts r WHERE actor_user_id = ${userId} AND operation = ${operation}`;

describe("who may approve or decline (T9, T14, FQ119)", () => {
  it("gives the neutral not-found to everyone the revision doesn't ask, and leaves nothing", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const stranger = await newUser(plain(tx), "Zed");
      const other = await clubOf(tx, 2);
      const sam = await newUser(plain(tx), "Sam");
      await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      for (const who of [stranger, user(other, 0), sam]) {
        expect(await refusal(approve(tx, clock, who, s.open.id, 1))).toEqual(NONE);
        expect(await refusal(decline(tx, clock, who, s.open.id, 1))).toEqual(NONE);
        expect(await receiptsOf(tx, who, "approveRoster")).toEqual([]);
        expect(await receiptsOf(tx, who, "declineRoster")).toEqual([]);
      }
      // An id nobody has, and one that can't be an id.
      expect(await refusal(approve(tx, clock, user(s.w, 1), newId("rev"), 1))).toEqual(NONE);
      expect(await refusal(decline(tx, clock, user(s.w, 1), "not an id", 1))).toEqual(NONE);
      // Sam joins by it; the applied revision never listed Sam, so it isn't Sam's to decide either.
      await approve(tx, clock, user(s.w, 1), s.open.id, 1);
      await approve(tx, clock, user(s.w, 2), s.open.id, 1);
      expect(await membersOf(tx, s.w.club)).toHaveLength(4);
      expect(await refusal(approve(tx, clock, sam, s.open.id, 2))).toEqual(NONE);
      expect(await approvalsOf(tx, s.open.id)).toHaveLength(3);
    });
  });

  it("gives it to a former member, an account being deleted and a member of a suspended club", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${LATER} WHERE id = ${user(s.w, 1)}`;
      expect(await refusal(approve(tx, clock, user(s.w, 1), s.open.id, 1))).toEqual(NONE);
      await leave(plain(tx), { user: user(s.w, 2), interval: member(s.w, 2) }, "Alex", LATER);
      expect(await refusal(decline(tx, clock, user(s.w, 2), s.open.id, 1))).toEqual(NONE);
      await tx`UPDATE app.clubs SET suspended_at = ${LATER} WHERE id = ${s.w.club}`;
      expect(await refusal(approve(tx, clock, user(s.w, 0), s.open.id, 1))).toEqual(NONE);
      expect(await revisionRow(tx, s.open.id)).toMatchObject({ state: "open", version: 1 });
      expect(await approvalsOf(tx, s.open.id)).toHaveLength(1);
    });
  });

  it("names the candidate's own proposer by their name now while a member, never the creator or the decliner (FQ75)", async () => {
    await rolledBack(db, async (tx) => {
      // Maya proposes Sam; Alex declines. Ben, the creator and first member, has no part in it.
      const w = await clubOf(tx, 3);
      const open = await propose(tx, clock, user(w, 1), w.club, ["Sam"]);
      const made = await linkFor(tx, clock, user(w, 1), w.club, candidate(open, 0));
      const sam = await newUser(plain(tx), "Sam");
      await acceptWith(tx, clock, sam, made.token, open.id, 1);
      await decline(tx, clock, user(w, 2), open.id, 1);
      expect(await preview(tx, sam, made.token, NOW)).toEqual({ state: "did_not_go_ahead", inviter_name: "Maya" });
      // While Maya is a member, the name shown is hers now, in the preview as in the list of invitations.
      await tx`UPDATE app.users SET display_name = 'May' WHERE id = ${user(w, 1)}`;
      expect(await preview(tx, sam, made.token, NOW)).toEqual({ state: "did_not_go_ahead", inviter_name: "May" });
      expect((await listClubs(tx, sam, NOW)).invitations.map((one) => one.inviterName)).toEqual(["May"]);
    });
  });

  it("tells an accepted candidate nothing once the revision ended, when the inviter has no name to show, and lists no such invitation (FQ75)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      await decline(tx, clock, user(s.w, 1), s.open.id, 1);
      expect(await preview(tx, sam, s.sam.token, NOW)).toEqual({ state: "did_not_go_ahead", inviter_name: "Ben" });
      await tx`
        UPDATE app.memberships
           SET state = 'account_deleted', left_at = ${LATER}, contributions = 'withdraw', ended_display_name = NULL
         WHERE interval_id = ${member(s.w, 0)}`;
      expect(await preview(tx, sam, s.sam.token, NOW)).toBeNull();
      expect((await listClubs(tx, sam, NOW)).invitations).toEqual([]);
    });
  });

  it("gives it for a revision nobody can read, whose proposer has no name to show (FQ75)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      await tx`
        UPDATE app.memberships
           SET state = 'account_deleted', left_at = ${LATER}, contributions = 'withdraw', ended_display_name = NULL
         WHERE interval_id = ${member(s.w, 0)}`;
      expect(await read(tx, user(s.w, 1), s.open.id, NOW)).toBeNull();
      expect(await refusal(approve(tx, clock, user(s.w, 1), s.open.id, 1))).toEqual(NONE);
      expect(await refusal(decline(tx, clock, user(s.w, 1), s.open.id, 1))).toEqual(NONE);
      expect(await revisionRow(tx, s.open.id)).toMatchObject({ state: "open", version: 1 });
    });
  });

  it("refuses a stale version with the version now, and a replaced revision with the newest one's id, leaving nothing", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      expect(await refusal(approve(tx, clock, user(s.w, 1), s.open.id, 2))).toEqual({
        code: "VERSION_CONFLICT",
        facts: { current_version: 1 },
      });
      expect(await refusal(decline(tx, clock, user(s.w, 1), s.open.id, 0))).toEqual({
        code: "VERSION_CONFLICT",
        facts: { current_version: 1 },
      });
      // Maya proposes Debby, then Alex proposes Nina: two revisions on, the first names the newest.
      const second = await propose(tx, clock, user(s.w, 1), s.w.club, ["Debby"]);
      const third = await propose(tx, clock, user(s.w, 2), s.w.club, ["Nina"]);
      for (const sent of [1, 2]) {
        expect(await refusal(approve(tx, clock, user(s.w, 1), s.open.id, sent))).toEqual({
          code: "ROSTER_CHANGED",
          facts: { current_id: third.id },
        });
      }
      expect(await refusal(decline(tx, clock, user(s.w, 0), second.id, 2))).toEqual({
        code: "ROSTER_CHANGED",
        facts: { current_id: third.id },
      });
      expect(await approvalsOf(tx, s.open.id)).toHaveLength(1);
      expect(await receiptsOf(tx, user(s.w, 1), "approveRoster")).toEqual([]);
    });
  });

  it("answers a retry with the first answer, though the roster has moved on, and another request under the key with a conflict (T19)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      const key = randomUUID();
      const first = await approve(tx, clock, user(s.w, 1), s.open.id, 1, key);
      expect(first.state).toBe("open");
      await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      await approve(tx, clock, user(s.w, 2), s.open.id, 1);
      clock.advance({ hours: 4 });
      // The revision is applied now; the retry is still the first answer, byte for byte.
      expect(await approve(tx, clock, user(s.w, 1), s.open.id, 1, key)).toEqual(first);
      expect(await refusal(approve(tx, clock, user(s.w, 1), s.open.id, 2, key))).toEqual({
        code: "IDEMPOTENCY_CONFLICT",
        facts: {},
      });
      // The key is the operation's own: a decline under it is a first request.
      expect(await decline(tx, clock, user(s.w, 1), s.open.id, 2, key)).toMatchObject({ state: "applied" });
      const receipts = await receiptsOf(tx, user(s.w, 1), "approveRoster");
      expect(receipts).toHaveLength(1);
      expect(receipts[0]?.response_body).toEqual(first);
    });
  });
});

describe("what a token names, and to whom (T7, T14, FQ59, FQ71)", () => {
  it("names nothing when it is unknown, revoked, replaced or used by another account, on the page, in the app and on accepting", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx, ["Sam", "Debby", "Nina"]);
      const zed = await newUser(plain(tx), "Zed");
      const nothing = async (token: string): Promise<void> => {
        expect(await webPreview(tx, token, NOW)).toBeNull();
        expect(await preview(tx, zed, token, NOW)).toBeNull();
        expect(await refusal(acceptWith(tx, clock, zed, token, s.open.id, 1))).toEqual(NONE);
      };
      // A token nobody made, and texts that can't be tokens.
      await nothing("A".repeat(43));
      await nothing("short");
      await nothing(`${"A".repeat(42)}=`);
      // Revoked.
      const debby = await linkFor(tx, clock, user(s.w, 0), s.w.club, candidate(s.open, 1));
      await revoke(tx, clock, user(s.w, 0), debby.id);
      await nothing(debby.token);
      // Replaced by a newer link, which works.
      const nina = await linkFor(tx, clock, user(s.w, 0), s.w.club, candidate(s.open, 2));
      const newer = await linkFor(tx, clock, user(s.w, 0), s.w.club, candidate(s.open, 2));
      await nothing(nina.token);
      expect((await preview(tx, zed, newer.token, NOW))?.state).toBe("open");
      // Used by another account: Sam's, and it stays so past its expiry (FQ59).
      const sam = await newUser(plain(tx), "Sam");
      await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      await nothing(s.sam.token);
      const past = FIRST.add({ hours: 24 * 8 }) as ServerNow;
      expect(await preview(tx, zed, s.sam.token, past)).toBeNull();
      // Nothing was bound to Zed, and no receipt of Zed's was kept.
      expect(await tx`SELECT FROM app.invitations WHERE bound_user_id = ${zed}`).toHaveLength(0);
      expect(await receiptsOf(tx, zed, "acceptInvitation")).toEqual([]);
      expect((await linkRow(tx, s.sam.link))?.bound_user_id).toBe(sam);
    });
  });

  it("is live until the instant it expires, and expired from then, by the server's clock: the app names the inviter, the page nobody, and accepting is INVITATION_EXPIRED (FQ71)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      const expiry = Temporal.Instant.from(EXPIRES);
      const before = expiry.subtract({ nanoseconds: 1000 }) as ServerNow;
      expect((await preview(tx, sam, s.sam.token, before))?.state).toBe("open");
      expect(await webPreview(tx, s.sam.token, before)).toEqual({ inviter_name: "Ben" });
      expect(await preview(tx, sam, s.sam.token, expiry as ServerNow)).toEqual({
        state: "expired",
        inviter_name: "Ben",
      });
      expect(await webPreview(tx, s.sam.token, expiry as ServerNow)).toBeNull();
      clock.set(expiry);
      expect(await refusal(acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1))).toEqual({
        code: "INVITATION_EXPIRED",
        facts: {},
      });
      expect((await linkRow(tx, s.sam.link))?.bound_user_id).toBeNull();
      expect(await receiptsOf(tx, sam, "acceptInvitation")).toEqual([]);
      // A microsecond earlier it is accepted, and bound before its expiry.
      clock.set(before);
      expect((await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1)).state).toBe("waiting");
    });
  });

  it("doesn't expire for the account that used it: past the expiry it still shows and accepts a changed roster", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      const next = await propose(tx, clock, user(s.w, 1), s.w.club, ["Debby"]);
      const past = FIRST.add({ hours: 24 * 9 });
      clock.set(past);
      expect(await preview(tx, sam, s.sam.token, past as ServerNow)).toMatchObject({
        state: "changed",
        revision_id: next.id,
        expires_at: EXPIRES,
      });
      expect(await refusal(acceptWith(tx, clock, sam, s.sam.token, s.open.id, 2))).toEqual({
        code: "ROSTER_CHANGED",
        facts: { current_id: next.id },
      });
      expect(await acceptWith(tx, clock, sam, s.sam.token, next.id, 1)).toEqual({
        invitation_id: s.sam.link,
        state: "waiting",
      });
      expect((await preview(tx, sam, s.sam.token, past as ServerNow))?.state).toBe("waiting");
    });
  });

  it("opens the club for a member, whoever the link was for, and binds nothing; a member can't accept with it", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      for (const index of [0, 1]) {
        expect(await preview(tx, user(s.w, index), s.sam.token, NOW)).toEqual({
          state: "joined",
          club: {
            id: s.w.club,
            name: "Sunday people",
            timezone: "America/New_York",
            my_membership_id: member(s.w, index),
          },
        });
        expect(await refusal(acceptWith(tx, clock, user(s.w, index), s.sam.token, s.open.id, 1))).toEqual(NONE);
      }
      expect((await linkRow(tx, s.sam.link))?.bound_user_id).toBeNull();
      // The link is still Sam's to use.
      const sam = await newUser(plain(tx), "Sam");
      expect((await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1)).state).toBe("waiting");
    });
  });

  it("gives nothing of a suspended club, and nothing to an account that left after joining with the link", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      await approve(tx, clock, user(s.w, 1), s.open.id, 1);
      await approve(tx, clock, user(s.w, 2), s.open.id, 1);
      const joined = await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      await leave(plain(tx), { user: sam, interval: joined.club?.my_membership_id ?? "" }, "Sam", LATER);
      expect(await preview(tx, sam, s.sam.token, NOW)).toBeNull();
      expect(await refusal(acceptWith(tx, clock, sam, s.sam.token, s.open.id, 2))).toEqual(NONE);

      const t = await laterRoster(tx);
      const other = await newUser(plain(tx), "Sam");
      await tx`UPDATE app.clubs SET suspended_at = ${LATER} WHERE id = ${t.w.club}`;
      expect(await webPreview(tx, t.sam.token, NOW)).toBeNull();
      expect(await preview(tx, other, t.sam.token, NOW)).toBeNull();
      expect(await preview(tx, user(t.w, 0), t.sam.token, NOW)).toBeNull();
      expect(await refusal(acceptWith(tx, clock, other, t.sam.token, t.open.id, 1))).toEqual(NONE);
    });
  });

  it("gives nothing when the inviter has no name to show (FQ75)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      await tx`
        UPDATE app.memberships
           SET state = 'account_deleted', left_at = ${LATER}, contributions = 'withdraw', ended_display_name = NULL
         WHERE interval_id = ${member(s.w, 0)}`;
      expect(await webPreview(tx, s.sam.token, NOW)).toBeNull();
      expect(await preview(tx, sam, s.sam.token, NOW)).toBeNull();
      expect(await preview(tx, sam, s.sam.token, FIRST.add({ hours: 24 * 8 }) as ServerNow)).toBeNull();
    });
  });

  it("says full when the club has six members, with only the inviter's name, and refuses the acceptance (A01)", async () => {
    await rolledBack(db, async (tx) => {
      // No command leads here, since the six count every open candidate: a seventh person, by rows.
      const w = await clubOf(tx, 6);
      const open = { id: newId("rev") };
      const seventh = newId("cand");
      const made = { id: newId("inv"), token: "N".repeat(43) };
      await tx`
        INSERT INTO app.roster_revisions (id, club_id, origin, proposed_by_interval_id, created_at)
        VALUES (${open.id}, ${w.club}, 'proposal', ${member(w, 0)}, ${LATER})`;
      await tx`
        INSERT INTO app.roster_revision_members (revision_id, club_id, interval_id)
        SELECT ${open.id}, club_id, interval_id FROM app.memberships WHERE club_id = ${w.club} AND state = 'active'`;
      await tx`
        INSERT INTO app.candidates (id, club_id, proposed_by_interval_id, created_at)
        VALUES (${seventh}, ${w.club}, ${member(w, 0)}, ${LATER})`;
      await tx`
        INSERT INTO app.roster_revision_candidates (revision_id, club_id, candidate_id, label, position)
        VALUES (${open.id}, ${w.club}, ${seventh}, 'Nina', 1)`;
      await tx`UPDATE app.roster_revisions SET roster_sealed_at = ${LATER} WHERE id = ${open.id}`;
      await tx`
        INSERT INTO app.invitations (id, candidate_id, token_sha256, created_at, expires_at)
        VALUES (${made.id}, ${seventh}, ${createHash("sha256").update(made.token).digest()}, ${LATER},
                ${new Date(LATER.getTime() + 7 * 864e5)})`;
      const nina = await newUser(plain(tx), "Nina");
      expect(await preview(tx, nina, made.token, NOW)).toEqual({ state: "full", inviter_name: "Ben" });
      expect(await refusal(acceptWith(tx, clock, nina, made.token, open.id, 1))).toEqual({
        code: "CLUB_FULL",
        facts: {},
      });
    });
  });
});

describe("accepting the exact roster the caller saw (T7, T19, T52)", () => {
  it("refuses a revision that isn't the invitation's, a stale version, and a second place in the same club", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx, ["Sam", "Debby"]);
      const debby = await linkFor(tx, clock, user(s.w, 0), s.w.club, candidate(s.open, 1));
      const other = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      // Another club's revision, an id nobody has, and one that can't be an id.
      for (const revision of [other.open.id, newId("rev"), "not an id"]) {
        expect(await refusal(acceptWith(tx, clock, sam, s.sam.token, revision, 1))).toEqual(NONE);
      }
      for (const sent of [0, 2]) {
        expect(await refusal(acceptWith(tx, clock, sam, s.sam.token, s.open.id, sent))).toEqual({
          code: "VERSION_CONFLICT",
          facts: { current_version: 1 },
        });
      }
      expect((await linkRow(tx, s.sam.link))?.bound_user_id).toBeNull();
      expect(await receiptsOf(tx, sam, "acceptInvitation")).toEqual([]);
      // Sam accepts as Sam; Debby's link is then nothing to Sam, who holds a place already.
      await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      expect(await preview(tx, sam, debby.token, NOW)).toBeNull();
      expect(await refusal(acceptWith(tx, clock, sam, debby.token, s.open.id, 1))).toEqual(NONE);
      expect((await linkRow(tx, debby.id))?.bound_user_id).toBeNull();
      // It is still live for anyone else.
      expect(await webPreview(tx, debby.token, NOW)).toEqual({ inviter_name: "Ben" });
    });
  });

  it("keeps the token out of every row, answers a retry with the first answer though the token is used, and another request under the key with a conflict", async () => {
    await rolledBack(db, async (tx) => {
      const s = await firstRoster(tx);
      const maya = await newUser(plain(tx), "Maya");
      const key = randomUUID();
      const first = await acceptWith(tx, clock, maya, s.maya.token, s.open.id, 1, key);
      expect(first.state).toBe("joined");
      const receipts = await receiptsOf(tx, maya, "acceptInvitation");
      expect(receipts).toHaveLength(1);
      expect(receipts[0]?.response_body).toEqual(first);
      expect(receipts[0]?.whole).not.toContain(s.maya.token);
      const [row] = await tx<{ whole: string; token_sha256: Uint8Array }[]>`
        SELECT pg_catalog.row_to_json(i)::text AS whole, token_sha256 FROM app.invitations i WHERE id = ${s.maya.link}`;
      expect(row?.whole).not.toContain(s.maya.token);
      // The link is found by the SHA-256 of the token's text, as it was stored when it was made.
      expect(Buffer.from(row?.token_sha256 ?? []).equals(createHash("sha256").update(s.maya.token).digest())).toBe(
        true,
      );
      clock.advance({ hours: 30 });
      expect(await acceptWith(tx, clock, maya, s.maya.token, s.open.id, 1, key)).toEqual(first);
      expect(await refusal(acceptWith(tx, clock, maya, s.maya.token, s.open.id, 2, key))).toEqual({
        code: "IDEMPOTENCY_CONFLICT",
        facts: {},
      });
      // Another link under the key, one that names nothing to Maya (a member now, holding Alex's link): the
      // neutral not-found, as under a new key and as for a token nobody made, never a conflict (T14).
      expect(await refusal(acceptWith(tx, clock, maya, s.alex.token, s.open.id, 1, key))).toEqual(NONE);
      expect(await refusal(acceptWith(tx, clock, maya, s.alex.token, s.open.id, 1))).toEqual(NONE);
      expect(await refusal(acceptWith(tx, clock, maya, "A".repeat(43), s.open.id, 1, key))).toEqual(NONE);
      expect(await membersOf(tx, s.ben.club)).toHaveLength(2);
    });
  });

  it("accepts once: again under a new key it answers where the invitation stands and changes nothing", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      const waiting = await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      const acceptedAt = async () =>
        (
          await tx<{ accepted_at: Temporal.Instant | null }[]>`
            SELECT accepted_at FROM app.roster_revision_candidates
             WHERE revision_id = ${s.open.id} AND candidate_id = ${s.sam.candidate}`
        )[0]?.accepted_at;
      expect((await acceptedAt())?.equals(FIRST)).toBe(true);
      clock.advance({ hours: 2 });
      expect(await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1)).toEqual(waiting);
      expect((await acceptedAt())?.equals(FIRST)).toBe(true);
      expect((await linkRow(tx, s.sam.link))?.bound_at?.equals(FIRST)).toBe(true);
      await approve(tx, clock, user(s.w, 1), s.open.id, 1);
      await approve(tx, clock, user(s.w, 2), s.open.id, 1);
      const members = await membersOf(tx, s.w.club);
      expect(members).toHaveLength(4);
      // Joined: the version Sam read is stale; at the applied version the answer is joined, and nothing new is made.
      expect(await refusal(acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1))).toEqual({
        code: "VERSION_CONFLICT",
        facts: { current_version: 2 },
      });
      expect(await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 2)).toEqual({
        invitation_id: s.sam.link,
        state: "joined",
        club: {
          id: s.w.club,
          name: "Sunday people",
          timezone: "America/New_York",
          my_membership_id: members[3]?.interval_id,
        },
      });
      expect(await membersOf(tx, s.w.club)).toHaveLength(4);
    });
  });

  it("refuses an account whose deletion has begun, and leaves the link unused (T27)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${LATER} WHERE id = ${sam}`;
      expect(await refusal(acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1))).toEqual({
        code: "UNAUTHENTICATED",
        facts: {},
      });
      expect((await linkRow(tx, s.sam.link))?.bound_user_id).toBeNull();
    });
  });
});

describe("the roster applied (T7, A01, T27, FQ120)", () => {
  it("doesn't join an accepted account whose deletion has begun: alone it applies nothing, and with others its candidate ends", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx, ["Sam", "Debby"]);
      const debbyLink = await linkFor(tx, clock, user(s.w, 0), s.w.club, candidate(s.open, 1));
      const sam = await newUser(plain(tx), "Sam");
      const debby = await newUser(plain(tx), "Debby");
      await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${LATER} WHERE id = ${sam}`;
      await approve(tx, clock, user(s.w, 1), s.open.id, 1);
      expect(await approve(tx, clock, user(s.w, 2), s.open.id, 1)).toMatchObject({ state: "open", version: 1 });
      expect(await membersOf(tx, s.w.club)).toHaveLength(3);
      expect((await acceptWith(tx, clock, debby, debbyLink.token, s.open.id, 1)).state).toBe("joined");
      await checkAsAtCommit(plain(tx));
      expect((await membersOf(tx, s.w.club)).map((one) => one.user_id)).toEqual([...s.w.users, debby]);
      expect(await candidateState(tx, s.sam.candidate)).toBe("ended");
      expect(await openRevision(tx, s.w.club)).toBeNull();
    });
  });

  it("refuses the approval that would bring a seventh member, and keeps nothing of it (CLUB_FULL)", async () => {
    await rolledBack(db, async (tx) => {
      // No command leads here: six members and a candidate who accepted, by rows.
      const w = await clubOf(tx, 6);
      const revision = newId("rev");
      const seventh = newId("cand");
      const invitation = newId("inv");
      await tx`
        INSERT INTO app.roster_revisions (id, club_id, origin, proposed_by_interval_id, created_at)
        VALUES (${revision}, ${w.club}, 'proposal', ${member(w, 0)}, ${LATER})`;
      await tx`
        INSERT INTO app.roster_revision_members (revision_id, club_id, interval_id)
        SELECT ${revision}, club_id, interval_id FROM app.memberships WHERE club_id = ${w.club} AND state = 'active'`;
      await tx`
        INSERT INTO app.candidates (id, club_id, proposed_by_interval_id, created_at)
        VALUES (${seventh}, ${w.club}, ${member(w, 0)}, ${LATER})`;
      await tx`
        INSERT INTO app.roster_revision_candidates (revision_id, club_id, candidate_id, label, position)
        VALUES (${revision}, ${w.club}, ${seventh}, 'Zed', 1)`;
      await tx`UPDATE app.roster_revisions SET roster_sealed_at = ${LATER} WHERE id = ${revision}`;
      await tx`
        INSERT INTO app.invitations (id, candidate_id, token_sha256, created_at, expires_at)
        VALUES (${invitation}, ${seventh}, ${createHash("sha256").update("Z".repeat(43)).digest()}, ${LATER},
                ${new Date(LATER.getTime() + 7 * 864e5)})`;
      await accept(tx, revision, seventh, invitation, LATER, "Zed");
      for (const index of [0, 1, 2, 3, 4]) await decide(tx, revision, member(w, index), "approved", LATER);
      expect(await refusal(approve(tx, clock, user(w, 5), revision, 1))).toEqual({ code: "CLUB_FULL", facts: {} });
      expect(await approvalsOf(tx, revision)).toHaveLength(5);
      expect(await revisionRow(tx, revision)).toMatchObject({ state: "open", version: 1 });
      expect(await membersOf(tx, w.club)).toHaveLength(6);
    });
  });

  it("ends the candidates who hadn't accepted when the revision's proposer is no longer a member", async () => {
    await rolledBack(db, async (tx) => {
      // By rows: Ben leaves with candidates still open, which leaving will end (B1's next PR).
      const s = await laterRoster(tx, ["Leila", "Sam"]);
      await leave(plain(tx), { user: user(s.w, 0), interval: member(s.w, 0) }, "Ben", LATER);
      const second = await propose(tx, clock, user(s.w, 1), s.w.club, ["Nina"]);
      const debby = await newUser(plain(tx), "Debby");
      // Debby accepts Ben's link for Leila: the revision made for the name names Ben, whose link it was.
      expect((await acceptWith(tx, clock, debby, s.sam.token, second.id, 1)).state).toBe("changed");
      const third = (await openRevision(tx, s.w.club)) ?? "";
      expect(await revisionRow(tx, third)).toMatchObject({ origin: "rename", proposed_by_interval_id: member(s.w, 0) });
      await approve(tx, clock, user(s.w, 1), third, 1);
      await approve(tx, clock, user(s.w, 2), third, 1);
      expect((await acceptWith(tx, clock, debby, s.sam.token, third, 1)).state).toBe("joined");
      await checkAsAtCommit(plain(tx));
      expect(await openRevision(tx, s.w.club)).toBeNull();
      expect(await candidateState(tx, candidate(s.open, 1))).toBe("ended");
      expect(await candidateState(tx, candidate(second, 2))).toBe("ended");
      expect(await tx`SELECT FROM app.candidates WHERE club_id = ${s.w.club} AND state = 'open'`).toHaveLength(0);
    });
  });

  it("gives each member the club's open revision with the roster, as that member reads it", async () => {
    await rolledBack(db, async (tx) => {
      const s = await firstRoster(tx);
      const ben = await listMembers(tx, s.ben.user, s.ben.club, NOW);
      expect(ben?.openRevision === null ? null : rosterRevisionBody(ben?.openRevision as never)).toEqual(
        await read(tx, s.ben.user, s.open.id, NOW),
      );
      const maya = await newUser(plain(tx), "Maya");
      clock.advance({ minutes: 1 });
      await acceptWith(tx, clock, maya, s.maya.token, s.open.id, 1);
      const carried = (await openRevision(tx, s.ben.club)) ?? "";
      const forMaya = await listMembers(tx, maya, s.ben.club, NOW);
      expect(forMaya?.members.map((one) => one.person.displayName)).toEqual(["Ben", "Maya"]);
      expect(forMaya?.openRevision?.id).toBe(carried);
      expect(forMaya?.openRevision?.myDecision).toBe("pending");
      // No link shows for Maya: Alex is Ben's candidate.
      expect(forMaya?.openRevision?.candidates.map((one) => one.invitation)).toEqual([null]);
      expect((await listMembers(tx, s.ben.user, s.ben.club, NOW))?.openRevision?.candidates[0]?.invitation?.id).toBe(
        s.alex.link,
      );
      // With no open revision there is none.
      await decline(tx, clock, maya, carried, 1);
      expect((await listMembers(tx, maya, s.ben.club, NOW))?.openRevision).toBeNull();
    });
  });
});

describe("the club's row (T1, T7)", () => {
  const accepting = (userId: string, token: string, revisionId: string, key: string = randomUUID()) =>
    db.begin((tx) =>
      acceptInvitation(tx, clock, { userId, key, token, revisionId, expectedVersion: 1 }, invitationAcceptanceBody),
    );
  const approving = (userId: string, revisionId: string) =>
    db.begin((tx) =>
      approveRoster(tx, clock, { userId, key: randomUUID(), revisionId, expectedVersion: 1 }, rosterRevisionBody),
    );
  const outcome = async (done: Promise<unknown>): Promise<unknown> => {
    try {
      return await done;
    } catch (error) {
      return (error as { code?: string }).code;
    }
  };

  it(
    "binds a link to one account when two accept with it at once, and answers eight sends under one key the same",
    { timeout: 30_000 },
    async () => {
      const s = await db.begin((tx) => laterRoster(tx));
      const [one, two] = await db.begin(async (tx) => [
        await newUser(plain(tx), "Sam"),
        await newUser(plain(tx), "Sam"),
      ]);
      const hold = await holding(db, s.w.club);
      const both = Promise.all([
        outcome(accepting(one, s.sam.token, s.open.id)),
        outcome(accepting(two, s.sam.token, s.open.id)),
      ]);
      try {
        await waitingOn(db, hold.pid, 2);
      } finally {
        await hold.release();
      }
      const answers = await both;
      expect(answers.filter((answer) => answer === "NOT_FOUND")).toHaveLength(1);
      const won = answers.find((answer) => answer !== "NOT_FOUND");
      expect(won).toEqual({ invitation_id: s.sam.link, state: "waiting" });
      const bound = (await linkRow(db as unknown as WorldTx, s.sam.link))?.bound_user_id;
      expect([one, two]).toContain(bound);
      // The loser kept no receipt.
      const loser = bound === one ? two : one;
      expect(await receiptsOf(db as unknown as WorldTx, loser, "acceptInvitation")).toEqual([]);

      const key = randomUUID();
      const eight = await Promise.all(
        Array.from({ length: 8 }, () => accepting(bound ?? "", s.sam.token, s.open.id, key)),
      );
      for (const answer of eight) expect(answer).toEqual(won);
      expect(await receiptsOf(db as unknown as WorldTx, bound ?? "", "acceptInvitation")).toHaveLength(2);
    },
  );

  it(
    "joins the candidate once when the last approval and the acceptance arrive at once, in either order",
    { timeout: 30_000 },
    async () => {
      for (const acceptFirst of [true, false]) {
        const s = await db.begin(async (tx) => {
          const made = await laterRoster(tx);
          await approve(tx, clock, user(made.w, 1), made.open.id, 1);
          return { ...made, account: await newUser(plain(tx), "Sam") };
        });
        const hold = await holding(db, s.w.club);
        const accept1 = () => outcome(accepting(s.account, s.sam.token, s.open.id));
        const approve1 = () => outcome(approving(user(s.w, 2), s.open.id));
        let first: Promise<unknown>;
        let second: Promise<unknown>;
        try {
          first = acceptFirst ? accept1() : approve1();
          await waitingOn(db, hold.pid, 1);
          second = acceptFirst ? approve1() : accept1();
          await waitingOn(db, hold.pid, 2);
        } finally {
          await hold.release();
        }
        const [a, b] = [await first, await second];
        const accepted = (acceptFirst ? a : b) as { state: string };
        const approved = (acceptFirst ? b : a) as { state: string };
        // Whichever comes second applies the roster.
        expect(accepted.state).toBe(acceptFirst ? "waiting" : "joined");
        expect(approved.state).toBe(acceptFirst ? "applied" : "open");
        const members = await membersOf(db as unknown as WorldTx, s.w.club);
        expect(members.map((one) => one.user_id)).toEqual([...s.w.users, s.account]);
        expect(await revisionRow(db as unknown as WorldTx, s.open.id)).toMatchObject({ state: "applied", version: 2 });
      }
    },
  );

  it(
    "lets a revoke and an acceptance of one link each wait for the other: the link is revoked or used, never both",
    { timeout: 30_000 },
    async () => {
      for (const acceptFirst of [true, false]) {
        const s = await db.begin(async (tx) => ({
          ...(await laterRoster(tx)),
          account: await newUser(plain(tx), "Sam"),
        }));
        const hold = await holding(db, s.w.club);
        const accept1 = () => outcome(accepting(s.account, s.sam.token, s.open.id));
        const revoke1 = () =>
          outcome(db.begin((tx) => revokeInvitation(tx, clock, { userId: user(s.w, 0), invitationId: s.sam.link })));
        let first: Promise<unknown>;
        let second: Promise<unknown>;
        try {
          first = acceptFirst ? accept1() : revoke1();
          await waitingOn(db, hold.pid, 1);
          second = acceptFirst ? revoke1() : accept1();
          await waitingOn(db, hold.pid, 2);
        } finally {
          await hold.release();
        }
        const [a, b] = [await first, await second];
        const row = await linkRow(db as unknown as WorldTx, s.sam.link);
        if (acceptFirst) {
          expect(a).toEqual({ invitation_id: s.sam.link, state: "waiting" });
          expect(b).toBe("NOT_ALLOWED");
          expect(row).toMatchObject({ bound_user_id: s.account, revoked_at: null });
        } else {
          expect(a).toEqual({ invitationId: s.sam.link });
          expect(b).toBe("NOT_FOUND");
          expect(row?.bound_user_id).toBeNull();
          expect(row?.revoked_at).not.toBeNull();
        }
      }
    },
  );

  it(
    "asks who is deciding again once it holds the club's row: a member who left while it waited decides nothing",
    { timeout: 20_000 },
    async () => {
      const s = await db.begin((tx) => laterRoster(tx));
      const hold = await holding(db, s.w.club);
      const waiting = outcome(approving(user(s.w, 1), s.open.id));
      try {
        await waitingOn(db, hold.pid);
        await db.begin((tx) => leave(plain(tx), { user: user(s.w, 1), interval: member(s.w, 1) }, "Maya", LATER));
      } finally {
        await hold.release();
      }
      expect(await waiting).toBe("NOT_FOUND");
      expect(await approvalsOf(db as unknown as WorldTx, s.open.id)).toHaveLength(1);
      expect(await receiptsOf(db as unknown as WorldTx, user(s.w, 1), "approveRoster")).toEqual([]);
    },
  );
});

describe("found in review: an acceptance stands for the name the members read (FQ66, FQ84)", () => {
  const rename = (tx: WorldTx, userId: string, name: string) =>
    tx`UPDATE app.users SET display_name = ${name} WHERE id = ${userId}`;

  it("joins nobody under a name changed after accepting: the account accepts again, and everyone approves the new name", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const account = await newUser(plain(tx), "Sam");
      expect((await acceptWith(tx, clock, account, s.sam.token, s.open.id, 1)).state).toBe("waiting");
      await rename(tx, account, "Mallory");
      // The members still read Sam; the holder is shown the roster to accept again, not `waiting`.
      const shown = await preview(tx, account, s.sam.token, NOW);
      expect(shown?.state).toBe("changed");
      expect(shown?.roster?.at(-1)).toEqual({ name: "Sam", kind: "candidate", is_you: true });
      await approve(tx, clock, user(s.w, 1), s.open.id, 1);
      const last = await approve(tx, clock, user(s.w, 2), s.open.id, 1);
      expect(last.state).toBe("open");
      expect(await revisionRow(tx, s.open.id)).toMatchObject({ state: "open", version: 1 });
      expect(await membersOf(tx, s.w.club)).toHaveLength(3);
      // Accepting again makes the rename's revision, with no approval and no acceptance.
      expect((await acceptWith(tx, clock, account, s.sam.token, s.open.id, 1)).state).toBe("changed");
      const next = (await openRevision(tx, s.w.club)) ?? "";
      expect(next).not.toBe(s.open.id);
      expect(await revisionRow(tx, next)).toMatchObject({ origin: "rename", version: 1 });
      expect(await approvalsOf(tx, next)).toEqual([]);
      expect((await read(tx, user(s.w, 1), next, NOW))?.candidates.map((one) => one.name)).toEqual(["Mallory"]);
      for (const index of [0, 1, 2]) await approve(tx, clock, user(s.w, index), next, 1);
      expect(await membersOf(tx, s.w.club)).toHaveLength(3);
      expect((await acceptWith(tx, clock, account, s.sam.token, next, 1)).state).toBe("joined");
      await checkAsAtCommit(plain(tx));
      expect((await membersOf(tx, s.w.club)).map((one) => one.user_id)).toEqual([...s.w.users, account]);
    });
  });

  it("joins the others and carries the renamed account as someone who hasn't accepted", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx, ["Sam", "Debby"]);
      const debbyLink = await linkFor(tx, clock, user(s.w, 0), s.w.club, candidate(s.open, 1));
      const [sam, debby] = [await newUser(plain(tx), "Sam"), await newUser(plain(tx), "Debby")];
      await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      await acceptWith(tx, clock, debby, debbyLink.token, s.open.id, 1);
      await rename(tx, sam, "Mallory");
      await approve(tx, clock, user(s.w, 1), s.open.id, 1);
      expect((await approve(tx, clock, user(s.w, 2), s.open.id, 1)).state).toBe("applied");
      await checkAsAtCommit(plain(tx));
      expect((await membersOf(tx, s.w.club)).map((one) => one.user_id)).toEqual([...s.w.users, debby]);
      expect(await candidateState(tx, s.sam.candidate)).toBe("open");
      const carried = (await openRevision(tx, s.w.club)) ?? "";
      const rows = await tx<{ candidate_id: string; label: string; accepted_at: unknown }[]>`
        SELECT candidate_id, label, accepted_at FROM app.roster_revision_candidates WHERE revision_id = ${carried}`;
      expect(rows).toEqual([{ candidate_id: s.sam.candidate, label: "Sam", accepted_at: null }]);
      expect((await preview(tx, sam, s.sam.token, NOW))?.state).toBe("changed");
    });
  });

  it("shows the roster to accept again, and joins on that, when the name was changed back after the last approval applied nothing", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const account = await newUser(plain(tx), "Sam");
      await acceptWith(tx, clock, account, s.sam.token, s.open.id, 1);
      await rename(tx, account, "Mallory");
      await approve(tx, clock, user(s.w, 1), s.open.id, 1);
      expect((await approve(tx, clock, user(s.w, 2), s.open.id, 1)).state).toBe("open");
      await rename(tx, account, "Sam");
      // Every member has approved and the acceptance stands, so nobody is left to act but the account:
      // never `waiting`, which would wait for nothing.
      expect((await preview(tx, account, s.sam.token, NOW))?.state).toBe("changed");
      expect((await acceptWith(tx, clock, account, s.sam.token, s.open.id, 1)).state).toBe("joined");
      await checkAsAtCommit(plain(tx));
      expect(await membersOf(tx, s.w.club)).toHaveLength(4);
    });
  });

  it("ends an accepted candidate whose account is being deleted when the roster is applied, whatever its name now", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx, ["Sam", "Debby"]);
      const debbyLink = await linkFor(tx, clock, user(s.w, 0), s.w.club, candidate(s.open, 1));
      const [sam, debby] = [await newUser(plain(tx), "Sam"), await newUser(plain(tx), "Debby")];
      await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      await rename(tx, sam, "Samuel");
      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${LATER} WHERE id = ${sam}`;
      await acceptWith(tx, clock, debby, debbyLink.token, s.open.id, 1);
      await approve(tx, clock, user(s.w, 1), s.open.id, 1);
      expect((await approve(tx, clock, user(s.w, 2), s.open.id, 1)).state).toBe("applied");
      expect(await candidateState(tx, s.sam.candidate)).toBe("ended");
      // Nobody is carried: no revision is open, and no place of the six is held for an account that is going.
      expect(await openRevision(tx, s.w.club)).toBeNull();
      expect(await membersOf(tx, s.w.club)).toHaveLength(4);
    });
  });

  it("stands again when the name is changed back before the last approval", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const account = await newUser(plain(tx), "Sam");
      await acceptWith(tx, clock, account, s.sam.token, s.open.id, 1);
      await rename(tx, account, "Mallory");
      await approve(tx, clock, user(s.w, 1), s.open.id, 1);
      await rename(tx, account, "Sam");
      expect((await preview(tx, account, s.sam.token, NOW))?.state).toBe("waiting");
      expect((await approve(tx, clock, user(s.w, 2), s.open.id, 1)).state).toBe("applied");
      expect(await membersOf(tx, s.w.club)).toHaveLength(4);
    });
  });
});

describe("found in review: what names nothing is refused before the receipt and before the version (T14)", () => {
  it("gives the neutral not-found for an ended proposal's unused link under a key the account has used", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx, ["Sam", "Debby"]);
      const debbyLink = await linkFor(tx, clock, user(s.w, 0), s.w.club, candidate(s.open, 1));
      const debby = await newUser(plain(tx), "Debby");
      // Debby completes an acceptance in another club under the key.
      const other = await laterRoster(tx, ["Debby"]);
      const key = randomUUID();
      expect((await acceptWith(tx, clock, debby, other.sam.token, other.open.id, 1, key)).state).toBe("waiting");
      // The first club's proposal is declined: Debby's link there, never used, names nothing now.
      await decline(tx, clock, user(s.w, 1), s.open.id, 1);
      expect(await preview(tx, debby, debbyLink.token, NOW)).toBeNull();
      for (const version of [1, 2, 7]) {
        expect(await refusal(acceptWith(tx, clock, debby, debbyLink.token, s.open.id, version, key))).toEqual(NONE);
        expect(await refusal(acceptWith(tx, clock, debby, debbyLink.token, s.open.id, version))).toEqual(NONE);
        expect(await refusal(acceptWith(tx, clock, debby, "A".repeat(43), s.open.id, version, key))).toEqual(NONE);
      }
      expect(await receiptsOf(tx, debby, "acceptInvitation")).toHaveLength(1);
    });
  });

  it("gives it for a second place in the club whatever version or revision the request names", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx, ["Sam", "Debby"]);
      const debbyLink = await linkFor(tx, clock, user(s.w, 0), s.w.club, candidate(s.open, 1));
      const sam = await newUser(plain(tx), "Sam");
      await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      for (const version of [0, 1, 7]) {
        expect(await refusal(acceptWith(tx, clock, sam, debbyLink.token, s.open.id, version))).toEqual(NONE);
      }
      // And for a revision a newer one replaced: not ROSTER_CHANGED with the newest one's id.
      const next = await propose(tx, clock, user(s.w, 1), s.w.club, ["Nina"]);
      expect(next.id).not.toBe(s.open.id);
      expect(await refusal(acceptWith(tx, clock, sam, debbyLink.token, s.open.id, 2))).toEqual(NONE);
      expect((await linkRow(tx, debbyLink.id))?.bound_user_id).toBeNull();
    });
  });

  it("holds another place only while the first candidate is open: after a decline, another link is the account's to accept", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1);
      await decline(tx, clock, user(s.w, 1), s.open.id, 1);
      const again = await propose(tx, clock, user(s.w, 0), s.w.club, ["Sam"]);
      const made = await linkFor(tx, clock, user(s.w, 0), s.w.club, candidate(again, 0));
      expect((await preview(tx, sam, made.token, NOW))?.state).toBe("open");
      expect((await acceptWith(tx, clock, sam, made.token, again.id, 1)).state).toBe("waiting");
    });
  });

  it("answers a retry with the neutral not-found once the link names nothing, not with the stored answer", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      const key = randomUUID();
      const first = await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1, key);
      expect(await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1, key)).toEqual(first);
      await tx`UPDATE app.clubs SET suspended_at = ${LATER} WHERE id = ${s.w.club}`;
      expect(await refusal(acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1, key))).toEqual(NONE);
    });
  });

  it("answers a decision's retry with the neutral not-found once its member has left", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const key = randomUUID();
      const first = await approve(tx, clock, user(s.w, 1), s.open.id, 1, key);
      expect(await approve(tx, clock, user(s.w, 1), s.open.id, 1, key)).toEqual(first);
      await leave(plain(tx), { user: user(s.w, 1), interval: member(s.w, 1) }, "Maya", LATER);
      expect(await refusal(approve(tx, clock, user(s.w, 1), s.open.id, 1, key))).toEqual(NONE);
    });
  });

  it("says a link nobody used has expired before it says anything of the revision's state or its version", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      const next = await propose(tx, clock, user(s.w, 1), s.w.club, ["Nina"]);
      clock.set(Temporal.Instant.from(EXPIRES));
      const expired = { code: "INVITATION_EXPIRED", facts: {} };
      // A replaced revision, and the open one at a stale version.
      expect(await refusal(acceptWith(tx, clock, sam, s.sam.token, s.open.id, 2))).toEqual(expired);
      expect(await refusal(acceptWith(tx, clock, sam, s.sam.token, next.id, 7))).toEqual(expired);
    });
  });
});

describe("found in review: rules no test held", () => {
  it("applies no roster whose members aren't exactly the club's active members", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      await approve(tx, clock, user(s.w, 1), s.open.id, 1);
      await approve(tx, clock, user(s.w, 2), s.open.id, 1);
      // Alex's interval ends by rows: the revision still lists it, and every listed member has approved.
      await leave(plain(tx), { user: user(s.w, 2), interval: member(s.w, 2) }, "Alex", LATER);
      expect((await acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1)).state).toBe("waiting");
      expect(await revisionRow(tx, s.open.id)).toMatchObject({ state: "open", version: 1 });
      expect(await membersOf(tx, s.w.club)).toHaveLength(2);
    });
  });

  it("takes no decision on an ended revision from a member who hadn't decided", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      await decline(tx, clock, user(s.w, 1), s.open.id, 1);
      const before = await rosterVersion(tx, s.w.club);
      // Alex never decided, and reads the ended revision as pending.
      const alex = await read(tx, user(s.w, 2), s.open.id, NOW);
      expect(alex).toMatchObject({ state: "did_not_go_ahead", version: 2, my_decision: "pending" });
      expect(await approve(tx, clock, user(s.w, 2), s.open.id, 2)).toEqual(alex);
      expect(await decline(tx, clock, user(s.w, 2), s.open.id, 2)).toEqual(alex);
      expect(await approvalsOf(tx, s.open.id)).toHaveLength(2);
      expect(await revisionRow(tx, s.open.id)).toMatchObject({ state: "did_not_go_ahead", version: 2 });
      expect(await rosterVersion(tx, s.w.club)).toBe(before);
    });
  });

  it("shows nothing when no member of the roster has a name to show (FQ75)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      expect((await preview(tx, sam, s.sam.token, NOW))?.state).toBe("open");
      // Ben, the inviter, leaves, and is still named by the name Ben left with; Maya and Alex, the
      // roster's members now, lose their names by rows.
      await leave(plain(tx), { user: user(s.w, 0), interval: member(s.w, 0) }, "Ben", LATER);
      expect((await preview(tx, sam, s.sam.token, NOW))?.roster?.map((one) => one.name)).toEqual([
        "Maya",
        "Alex",
        "Sam",
      ]);
      await tx`UPDATE app.users SET display_name = NULL WHERE id IN ${tx([user(s.w, 1), user(s.w, 2)])}`;
      expect(await webPreview(tx, s.sam.token, NOW)).toEqual({ inviter_name: "Ben" });
      expect(await preview(tx, sam, s.sam.token, NOW)).toBeNull();
    });
  });

  it("refuses an account with no profile name: PROFILE_INCOMPLETE, and the link stays unused", async () => {
    await rolledBack(db, async (tx) => {
      const s = await laterRoster(tx);
      const sam = await newUser(plain(tx), "Sam");
      await tx`UPDATE app.users SET display_name = NULL WHERE id = ${sam}`;
      expect(await refusal(acceptWith(tx, clock, sam, s.sam.token, s.open.id, 1))).toEqual({
        code: "PROFILE_INCOMPLETE",
        facts: {},
      });
      expect((await linkRow(tx, s.sam.link))?.bound_user_id).toBeNull();
    });
  });

  it("dates a club's start, its members and its first days by one sample (T1)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await firstRoster(tx);
      const maya = await newUser(plain(tx), "Maya");
      await acceptWith(tx, ticking(), maya, s.maya.token, s.open.id, 1);
      const at = (await clubRow(tx, s.ben.club))?.activated_at;
      expect(at?.equals(FIRST.add({ seconds: 2 }))).toBe(true);
      const made = await tx<{ created_at: Temporal.Instant }[]>`
        SELECT created_at FROM app.schedule_versions WHERE club_id = ${s.ben.club}
        UNION ALL SELECT created_at FROM app.schedule_proposals WHERE club_id = ${s.ben.club}`;
      expect(made).toHaveLength(2);
      for (const row of made) expect(at !== undefined && at !== null && row.created_at.equals(at)).toBe(true);
    });
  });
});

describe("found in review: the clock is read after the club's row is held (T1)", () => {
  const MOVED = FIRST.add({ hours: 3 });
  const run = <T>(command: (tx: WorldTx) => Promise<T>): Promise<T> => db.begin((tx) => command(tx)) as Promise<T>;
  /** Runs `command` behind the club's row, moves the clock while it waits, then lets it through. */
  async function behind<T>(club: string, command: () => Promise<T>): Promise<T> {
    const hold = await holding(db, club);
    const waiting = command();
    try {
      await waitingOn(db, hold.pid);
      clock.set(MOVED);
    } finally {
      await hold.release();
    }
    return waiting;
  }

  it("dates a membership by the clock as it reads once the row is the acceptance's", { timeout: 30_000 }, async () => {
    const s = await db.begin(async (tx) => ({ ...(await firstRoster(tx)), account: await newUser(plain(tx), "Maya") }));
    await behind(s.ben.club, () =>
      run((tx) =>
        acceptInvitation(
          tx,
          clock,
          { userId: s.account, key: randomUUID(), token: s.maya.token, revisionId: s.open.id, expectedVersion: 1 },
          invitationAcceptanceBody,
        ),
      ),
    );
    const members = await membersOf(db as unknown as WorldTx, s.ben.club);
    expect(members[1]?.joined_at.equals(MOVED)).toBe(true);
    expect((await clubRow(db as unknown as WorldTx, s.ben.club))?.activated_at?.equals(MOVED)).toBe(true);
  });

  it(
    "dates a membership by the clock as it reads once the row is the last approval's",
    { timeout: 30_000 },
    async () => {
      const s = await db.begin(async (tx) => {
        const made = await laterRoster(tx);
        const account = await newUser(plain(tx), "Sam");
        await approve(tx, clock, user(made.w, 1), made.open.id, 1);
        await acceptWith(tx, clock, account, made.sam.token, made.open.id, 1);
        return made;
      });
      await behind(s.w.club, () =>
        run((tx) =>
          approveRoster(
            tx,
            clock,
            { userId: user(s.w, 2), key: randomUUID(), revisionId: s.open.id, expectedVersion: 1 },
            rosterRevisionBody,
          ),
        ),
      );
      const members = await membersOf(db as unknown as WorldTx, s.w.club);
      expect(members).toHaveLength(4);
      expect(members[3]?.joined_at.equals(MOVED)).toBe(true);
    },
  );

  it("dates a decline by the clock as it reads once the row is the decline's", { timeout: 30_000 }, async () => {
    const s = await db.begin((tx) => laterRoster(tx));
    await behind(s.w.club, () =>
      run((tx) =>
        declineRoster(
          tx,
          clock,
          { userId: user(s.w, 1), key: randomUUID(), revisionId: s.open.id, expectedVersion: 1 },
          rosterRevisionBody,
        ),
      ),
    );
    expect((await revisionRow(db as unknown as WorldTx, s.open.id))?.ended_at?.equals(MOVED)).toBe(true);
  });
});
