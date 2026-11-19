/// <reference lib="esnext.temporal" />
// `proposeRoster` and the read of a roster revision against Postgres as `tadayo_app` (spec 04, 32; book
// p30; T1, T6, T7, T9, T14, T15, T19, T33; FQ60, FQ112, FQ119; docs/plans/api-b1-clubs.md, section 3;
// packages/domain/src/clubs/propose-roster.ts and roster-revision.ts): the exact, sealed roster a
// proposal writes; the earlier revision it supersedes; six, with the candidates still open counted; the
// receipt; and who reads a revision, and what of it.
//
// These tests were written before the code they test.

import { randomUUID } from "node:crypto";
import { rosterRevisionBody } from "@tadayo/api";
import { proposeRoster, readClub, type ServerNow } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { worldSql, rolledBack, type WorldTx } from "./harness.ts";
import {
  accept,
  decide,
  link,
  plain,
  propose,
  read,
  refusal,
  rosterVersion,
  type RevisionBody,
} from "./roster-world.ts";
import { clubOf, NAMES, type WeekClub } from "./week-world.ts";
import { AT, leave, newId, newUser } from "./world.ts";

const db = worldSql(8);
afterAll(async () => {
  await db.end();
});

/** A whole number of microseconds, the finest Postgres keeps, after every instant the worlds are built at. */
const AT_FIRST = "2026-11-11T05:00:00.123456Z";
const FIRST = Temporal.Instant.from(AT_FIRST);
const clock = fakeClock(AT_FIRST);
beforeEach(() => {
  clock.set(FIRST);
});
const NOW = FIRST as ServerNow;
const LATER = new Date("2026-11-11T06:00:00Z");

const person = (w: WeekClub, index: number) => ({ membership_id: w.members[index], display_name: NAMES[index] });
const user = (w: WeekClub, index: number): string => w.users[index] ?? "";
const member = (w: WeekClub, index: number): string => w.members[index] ?? "";

const receipts = (tx: WorldTx, userId: string) =>
  tx<{ response_status: number | null; response_body: unknown }[]>`
    SELECT response_status, response_body FROM app.idempotency_receipts
     WHERE actor_user_id = ${userId} AND operation = 'proposeRoster'`;

const revisionsOf = (tx: WorldTx, club: string) =>
  tx<{ id: string; state: string; version: number }[]>`
    SELECT id, state, version FROM app.roster_revisions
     WHERE club_id = ${club} AND origin = 'proposal' AND state <> 'applied' ORDER BY created_at, id`;

describe("proposing people (spec 04, 32; T7)", () => {
  it("writes an exact, sealed roster at the clock's sample: the club's members, the candidates in order, and its proposer's approval alone (FQ60)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 2);
      const before = await rosterVersion(tx, w.club);
      const answer = await propose(tx, clock, user(w, 0), w.club, ["Alex", "Sam"]);
      expect(answer).toEqual({
        id: answer.id,
        version: 1,
        club: { id: w.club, name: "Sunday people", timezone: "America/New_York", my_membership_id: member(w, 0) },
        state: "open",
        proposed_by: person(w, 0),
        members: [person(w, 0), person(w, 1)],
        candidates: [
          { id: answer.candidates[0]?.id, name: "Alex", proposed_by: person(w, 0) },
          { id: answer.candidates[1]?.id, name: "Sam", proposed_by: person(w, 0) },
        ],
        my_decision: "approved",
      });
      // New ids that say nothing (T15).
      expect(answer.id).toMatch(/^rev_[A-Za-z0-9_-]{22}$/);
      for (const candidate of answer.candidates) expect(candidate.id).toMatch(/^cand_[A-Za-z0-9_-]{22}$/);

      const [revision] = await tx<
        {
          origin: string;
          proposed_by_interval_id: string;
          state: string;
          version: number;
          roster_sealed_at: Temporal.Instant;
          created_at: Temporal.Instant;
        }[]
      >`SELECT origin, proposed_by_interval_id, state, version, roster_sealed_at, created_at
          FROM app.roster_revisions WHERE id = ${answer.id}`;
      expect(revision).toMatchObject({
        origin: "proposal",
        proposed_by_interval_id: member(w, 0),
        state: "open",
        version: 1,
      });
      expect(revision?.created_at.equals(FIRST)).toBe(true);
      expect(revision?.roster_sealed_at.equals(FIRST)).toBe(true);

      const members = await tx<{ interval_id: string }[]>`
        SELECT interval_id FROM app.roster_revision_members WHERE revision_id = ${answer.id}`;
      expect(members.map((row) => row.interval_id).sort()).toEqual([...w.members].sort());

      const candidates = await tx<
        {
          candidate_id: string;
          label: string;
          position: number;
          accepted_at: unknown;
          state: string;
          proposer: string;
        }[]
      >`SELECT rc.candidate_id, rc.label, rc.position, rc.accepted_at, k.state, k.proposed_by_interval_id AS proposer
          FROM app.roster_revision_candidates rc JOIN app.candidates k ON k.id = rc.candidate_id
         WHERE rc.revision_id = ${answer.id} ORDER BY rc.position`;
      expect(candidates).toEqual([
        {
          candidate_id: answer.candidates[0]?.id,
          label: "Alex",
          position: 1,
          accepted_at: null,
          state: "open",
          proposer: member(w, 0),
        },
        {
          candidate_id: answer.candidates[1]?.id,
          label: "Sam",
          position: 2,
          accepted_at: null,
          state: "open",
          proposer: member(w, 0),
        },
      ]);

      const approvals = await tx<
        { interval_id: string; decision: string; implicit: boolean; decided_at: Temporal.Instant }[]
      >`
        SELECT interval_id, decision, implicit, decided_at FROM app.roster_approvals WHERE revision_id = ${answer.id}`;
      expect(approvals).toHaveLength(1);
      expect(approvals[0]).toMatchObject({ interval_id: member(w, 0), decision: "approved", implicit: true });
      expect(approvals[0]?.decided_at.equals(FIRST)).toBe(true);

      // The club's version moves by one, and the club names its open revision.
      expect(await rosterVersion(tx, w.club)).toBe(before + 1);
      const club = await readClub(tx, user(w, 0), w.club, NOW);
      expect(club).toMatchObject({ rosterVersion: before + 1, openRevisionId: answer.id, canPropose: true });
      // No link is made by proposing, and nobody is added: the club still has its two members.
      const links = await tx`SELECT i.id FROM app.invitations i JOIN app.candidates k ON k.id = i.candidate_id
                              WHERE k.club_id = ${w.club} AND k.state = 'open'`;
      expect(links).toHaveLength(0);
      const [counted] = await tx<{ n: number }[]>`
        SELECT pg_catalog.count(*)::int4 AS n FROM app.memberships WHERE club_id = ${w.club} AND state = 'active'`;
      expect(counted?.n).toBe(2);
    });
  });

  it("stores the answer in its receipt with 201", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 1);
      const answer = await propose(tx, clock, user(w, 0), w.club, ["Maya"]);
      expect(await receipts(tx, user(w, 0))).toEqual([{ response_status: 201, response_body: answer }]);
    });
  });

  it("supersedes the open revision: its candidates carry over at their labels and in their order, their acceptances don't, and its approvals no longer count (T7)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const first = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
      const sam = first.candidates[0]?.id ?? "";
      const made = await link(tx, clock, user(w, 0), w.club, sam);
      const invitation = (made.answer as { invitation_id: string }).invitation_id;
      await accept(tx, first.id, sam, invitation, LATER, "Sam");
      await decide(tx, first.id, member(w, 1), "approved", LATER);

      clock.advance({ hours: 2 });
      const at = FIRST.add({ hours: 2 });
      const second = await propose(tx, clock, user(w, 1), w.club, ["Debby"]);
      expect(second.id).not.toBe(first.id);
      expect(second).toEqual({
        id: second.id,
        version: 1,
        club: { id: w.club, name: "Sunday people", timezone: "America/New_York", my_membership_id: member(w, 1) },
        state: "open",
        proposed_by: person(w, 1),
        members: [person(w, 0), person(w, 1), person(w, 2)],
        candidates: [
          // Maya didn't propose Sam, so Maya's answer has no link of Sam's (handoff 1).
          { id: sam, name: "Sam", proposed_by: person(w, 0) },
          { id: second.candidates[1]?.id, name: "Debby", proposed_by: person(w, 1) },
        ],
        my_decision: "approved",
      });

      const [old] = await tx<
        { state: string; version: number; superseded_by_id: string; ended_at: Temporal.Instant }[]
      >`SELECT state, version, superseded_by_id, ended_at FROM app.roster_revisions WHERE id = ${first.id}`;
      expect(old).toMatchObject({ state: "superseded", version: 2, superseded_by_id: second.id });
      expect(old?.ended_at.equals(at)).toBe(true);

      // Sam accepts again: the new revision's row holds no acceptance.
      const carried = await tx<{ accepted_at: unknown; accepted_invitation_id: unknown; position: number }[]>`
        SELECT accepted_at, accepted_invitation_id, position FROM app.roster_revision_candidates
         WHERE revision_id = ${second.id} AND candidate_id = ${sam}`;
      expect(carried).toEqual([{ accepted_at: null, accepted_invitation_id: null, position: 1 }]);
      // Only the new proposer has approved the new revision: Maya's earlier approval was of another roster.
      const approvals = await tx<{ interval_id: string; implicit: boolean }[]>`
        SELECT interval_id, implicit FROM app.roster_approvals WHERE revision_id = ${second.id}`;
      expect(approvals).toEqual([{ interval_id: member(w, 1), implicit: true }]);
      // One open revision, one candidate row each: nobody is proposed twice.
      const open = await tx`SELECT id FROM app.candidates WHERE club_id = ${w.club} AND state = 'open'`;
      expect(open).toHaveLength(2);

      // Ben, who proposed Sam, is asked again, and sees that Sam's link was used on an earlier roster.
      const bens = await read(tx, user(w, 0), second.id, at as ServerNow);
      expect(bens?.my_decision).toBe("pending");
      expect(bens?.candidates[0]?.invitation).toMatchObject({ id: invitation, state: "used" });
      expect(bens?.candidates[1]).not.toHaveProperty("invitation");
      // The earlier revision, as a member it lists reads it now.
      const earlier = await read(tx, user(w, 1), first.id, at as ServerNow);
      expect(earlier).toMatchObject({
        state: "superseded",
        version: 2,
        superseded_by: second.id,
        my_decision: "approved",
      });
    });
  });

  it("refuses a proposal made on another roster version with the version now, and leaves nothing (VERSION_CONFLICT)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 2);
      const now = await rosterVersion(tx, w.club);
      for (const expected of [now + 1, now - 1 < 0 ? now + 2 : now - 1]) {
        expect(await refusal(propose(tx, clock, user(w, 0), w.club, ["Alex"], { expected }))).toEqual({
          code: "VERSION_CONFLICT",
          facts: { current_version: now },
        });
      }
      expect(await revisionsOf(tx, w.club)).toEqual([]);
      expect(await receipts(tx, user(w, 0))).toEqual([]);
      expect(await rosterVersion(tx, w.club)).toBe(now);
    });
  });

  it("refuses a second member's proposal made on the version the first one moved", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 2);
      const seen = await rosterVersion(tx, w.club);
      await propose(tx, clock, user(w, 0), w.club, ["Alex"], { expected: seen });
      expect(await refusal(propose(tx, clock, user(w, 1), w.club, ["Sam"], { expected: seen }))).toEqual({
        code: "VERSION_CONFLICT",
        facts: { current_version: seen + 1 },
      });
    });
  });
});

describe("six people, the candidates still open counted (A01, T6)", () => {
  // [members, candidates already open, proposed now, refused]
  const cases: readonly (readonly [number, number, number, boolean])[] = [
    [1, 0, 5, false],
    [1, 5, 1, true],
    [2, 0, 5, true],
    [2, 0, 4, false],
    [4, 1, 1, false],
    [4, 1, 2, true],
    [5, 0, 1, false],
    [5, 1, 1, true],
    [6, 0, 1, true],
  ];
  for (const [members, open, add, refused] of cases) {
    it(`${String(members)} members and ${String(open)} open candidates, ${String(add)} proposed: ${refused ? "CLUB_FULL" : "proposed"}`, async () => {
      await rolledBack(db, async (tx) => {
        const w = await clubOf(tx, members);
        if (open > 0) {
          await propose(
            tx,
            clock,
            user(w, 0),
            w.club,
            Array.from({ length: open }, (_, index) => `Open ${String(index)}`),
          );
        }
        const before = await revisionsOf(tx, w.club);
        const version = await rosterVersion(tx, w.club);
        const club = await readClub(tx, user(w, 0), w.club, NOW);
        const labels = Array.from({ length: add }, (_, index) => `New ${String(index)}`);
        if (refused) {
          expect(await refusal(propose(tx, clock, user(w, 0), w.club, labels))).toEqual({
            code: "CLUB_FULL",
            facts: {},
          });
          expect(await revisionsOf(tx, w.club)).toEqual(before);
          expect(await rosterVersion(tx, w.club)).toBe(version);
        } else {
          const answer = await propose(tx, clock, user(w, 0), w.club, labels);
          expect(answer.candidates).toHaveLength(open + add);
          expect(answer.candidates.map((candidate) => candidate.name)).toEqual([
            ...Array.from({ length: open }, (_, index) => `Open ${String(index)}`),
            ...labels,
          ]);
        }
        // `can_propose` is false exactly where one more person is refused.
        expect(club?.canPropose).toBe(members + open < 6);
        if (add === 1) expect(club?.canPropose).toBe(!refused);
      });
    });
  }

  it("counts a candidate who has ended or joined no longer", async () => {
    await rolledBack(db, async (tx) => {
      // Five members, each of the four after Ben joined as a candidate; those candidates aren't open.
      const w = await clubOf(tx, 5);
      const answer = await propose(tx, clock, user(w, 0), w.club, ["Nina"]);
      expect(answer.candidates).toHaveLength(1);
    });
  });
});

describe("one commit per key (T19)", () => {
  it("answers a retry with the first answer, at a later clock and though the roster has changed since, and makes nothing", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 2);
      const key = randomUUID();
      const expected = await rosterVersion(tx, w.club);
      const first = await propose(tx, clock, user(w, 0), w.club, ["Alex"], { key, expected });
      clock.advance({ hours: 3 });
      await propose(tx, clock, user(w, 1), w.club, ["Sam"]);
      const version = await rosterVersion(tx, w.club);
      const again = await propose(tx, clock, user(w, 0), w.club, ["Alex"], { key, expected });
      expect(again).toEqual(first);
      expect(await rosterVersion(tx, w.club)).toBe(version);
      expect(await revisionsOf(tx, w.club)).toHaveLength(2);
      expect(await receipts(tx, user(w, 0))).toHaveLength(1);
    });
  });

  it("refuses another request under a used key: other people, another version, another club (IDEMPOTENCY_CONFLICT)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 2);
      const key = randomUUID();
      const expected = await rosterVersion(tx, w.club);
      await propose(tx, clock, user(w, 0), w.club, ["Alex"], { key, expected });
      for (const [labels, version] of [
        [["Sam"], expected],
        [["Alex", "Sam"], expected],
        [["Alex"], expected + 1],
      ] as const) {
        expect(await refusal(propose(tx, clock, user(w, 0), w.club, labels, { key, expected: version }))).toEqual({
          code: "IDEMPOTENCY_CONFLICT",
          facts: {},
        });
      }
      expect(await revisionsOf(tx, w.club)).toHaveLength(1);
    });
  });

  it("makes one revision when the same request arrives eight times at once, and answers each alike", async () => {
    const w = await db.begin((tx) => clubOf(tx, 2));
    const expected = await db.begin((tx) => rosterVersion(tx, w.club));
    const sent = {
      userId: user(w, 0),
      key: randomUUID(),
      clubId: w.club,
      expectedRosterVersion: expected,
      add: [{ label: "Alex" }],
    };
    const answers = await Promise.all(
      Array.from({ length: 8 }, () => db.begin((tx) => proposeRoster(tx, clock, sent, rosterRevisionBody))),
    );
    for (const one of answers) expect(one).toEqual(answers[0]);
    expect(await revisionsOf(db as unknown as WorldTx, w.club)).toHaveLength(1);
    expect(await rosterVersion(db as unknown as WorldTx, w.club)).toBe(expected + 1);
  });

  it("lets one of two members who propose at once on the same version through, and refuses the other with the version now", async () => {
    const w = await db.begin((tx) => clubOf(tx, 2));
    const expected = await db.begin((tx) => rosterVersion(tx, w.club));
    const send = (index: number, label: string) =>
      db
        .begin((tx) =>
          proposeRoster(
            tx,
            clock,
            {
              userId: user(w, index),
              key: randomUUID(),
              clubId: w.club,
              expectedRosterVersion: expected,
              add: [{ label }],
            },
            rosterRevisionBody,
          ),
        )
        .then(
          () => "proposed",
          (error: unknown) => refusal(Promise.reject(error instanceof Error ? error : new Error("unknown"))),
        );
    const outcomes = await Promise.all([send(0, "Alex"), send(1, "Sam")]);
    expect(outcomes.filter((outcome) => outcome === "proposed")).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome !== "proposed")).toEqual({
      code: "VERSION_CONFLICT",
      facts: { current_version: expected + 1 },
    });
    expect(await revisionsOf(db as unknown as WorldTx, w.club)).toHaveLength(1);
  });
});

describe("who may propose (T9, T14; FQ80, FQ112)", () => {
  it("gives a stranger, a member of another club, a former member, an account being deleted, a member of a suspended club and an id that can't be one the neutral not-found, and leaves nothing", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const other = await clubOf(tx, 2);
      const stranger = await newUser(plain(tx), "Zed");
      const version = await rosterVersion(tx, w.club);
      const none = { code: "NOT_FOUND", facts: {} };

      expect(await refusal(propose(tx, clock, stranger, w.club, ["Sam"], { expected: version }))).toEqual(none);
      expect(await refusal(propose(tx, clock, user(other, 0), w.club, ["Sam"], { expected: version }))).toEqual(none);
      expect(await refusal(propose(tx, clock, user(w, 0), "not an id", ["Sam"], { expected: version }))).toEqual(none);
      expect(await refusal(propose(tx, clock, user(w, 0), newId("club"), ["Sam"], { expected: version }))).toEqual(
        none,
      );

      await leave(plain(tx), { user: user(w, 2), interval: member(w, 2) }, "Alex", LATER);
      expect(await refusal(propose(tx, clock, user(w, 2), w.club, ["Sam"], { expected: version }))).toEqual(none);

      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${LATER} WHERE id = ${user(w, 1)}`;
      expect(await refusal(propose(tx, clock, user(w, 1), w.club, ["Sam"], { expected: version }))).toEqual(none);

      await tx`UPDATE app.clubs SET suspended_at = ${LATER} WHERE id = ${w.club}`;
      expect(await refusal(propose(tx, clock, user(w, 0), w.club, ["Sam"], { expected: version }))).toEqual(none);

      expect(await revisionsOf(tx, w.club)).toEqual([]);
      for (const who of [stranger, user(other, 0), ...w.users]) expect(await receipts(tx, who)).toEqual([]);
    });
  });

  it("gives a retry by someone who has since left the club the neutral not-found, not the stored answer, which names other people (FQ112)", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const key = randomUUID();
      const expected = await rosterVersion(tx, w.club);
      await propose(tx, clock, user(w, 2), w.club, ["Sam"], { key, expected });
      await leave(plain(tx), { user: user(w, 2), interval: member(w, 2) }, "Alex", LATER);
      expect(await refusal(propose(tx, clock, user(w, 2), w.club, ["Sam"], { key, expected }))).toEqual({
        code: "NOT_FOUND",
        facts: {},
      });
    });
  });

  it("lets a member propose in a club that hasn't started and in one paused under two members (FQ16, FQ51)", async () => {
    await rolledBack(db, async (tx) => {
      // Not started: a creator alone, never activated.
      const ben = await newUser(plain(tx), "Ben");
      const [club, interval] = [newId("club"), newId("mem")];
      await plain(tx)`
        INSERT INTO app.clubs (id, name, timezone, creator_interval_id, created_at)
        VALUES (${club}, 'Kitchen table', 'America/New_York', ${interval}, ${AT.created})`;
      await plain(tx)`
        INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_at)
        VALUES (${interval}, ${club}, ${ben}, 'creator', ${AT.created})`;
      const first = await propose(tx, clock, ben, club, ["Maya"], { expected: 0 });
      expect(first).toMatchObject({ state: "open", members: [{ membership_id: interval, display_name: "Ben" }] });

      // Paused: two members, one of whom left.
      const w = await clubOf(tx, 2);
      await leave(plain(tx), { user: user(w, 1), interval: member(w, 1) }, "Maya", LATER);
      const paused = await propose(tx, clock, user(w, 0), w.club, ["Leila"]);
      expect(paused.members).toEqual([person(w, 0)]);
    });
  });
});

describe("who reads a revision, and what of it (T9, T14, T15, T33; FQ119)", () => {
  /** Ben, Maya and Alex; Ben proposed Sam and Maya then proposed Debby, so the open revision holds both. */
  async function world(tx: WorldTx): Promise<{ w: WeekClub; first: RevisionBody; open: RevisionBody }> {
    const w = await clubOf(tx, 3);
    const first = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
    const open = await propose(tx, clock, user(w, 1), w.club, ["Debby"]);
    return { w, first, open };
  }

  it("gives each member the revision lists the same roster, with their own decision and their own membership", async () => {
    await rolledBack(db, async (tx) => {
      const { w, open } = await world(tx);
      for (const index of [0, 1, 2]) {
        const mine = await read(tx, user(w, index), open.id, NOW);
        expect(mine).toEqual({
          ...open,
          club: { ...open.club, my_membership_id: member(w, index) },
          my_decision: index === 1 ? "approved" : "pending",
        });
      }
    });
  });

  it("gives the neutral not-found to a stranger, a member of another club, a former member, a member who joined after it was made, an account being deleted, a candidate who accepted it, and for an id nobody has or that can't be one", async () => {
    await rolledBack(db, async (tx) => {
      const { w, first, open } = await world(tx);
      const other = await clubOf(tx, 2);
      const stranger = await newUser(plain(tx), "Zed");
      expect(await read(tx, stranger, open.id, NOW)).toBeNull();
      expect(await read(tx, user(other, 0), open.id, NOW)).toBeNull();
      expect(await read(tx, user(w, 0), newId("rev"), NOW)).toBeNull();
      expect(await read(tx, user(w, 0), "not an id", NOW)).toBeNull();

      // Sam accepts the open revision with Sam's link: holding it gives nothing of the club (T7).
      const sam = open.candidates[0]?.id ?? "";
      const made = await link(tx, clock, user(w, 0), w.club, sam);
      const samsAccount = await accept(
        tx,
        open.id,
        sam,
        (made.answer as { invitation_id: string }).invitation_id,
        LATER,
        "Sam",
      );
      expect(await read(tx, samsAccount, open.id, NOW)).toBeNull();

      await leave(plain(tx), { user: user(w, 2), interval: member(w, 2) }, "Alex", LATER);
      expect(await read(tx, user(w, 2), open.id, NOW)).toBeNull();
      expect(await read(tx, user(w, 2), first.id, NOW)).toBeNull();

      await tx`UPDATE app.users SET state = 'deleting', deletion_requested_at = ${LATER} WHERE id = ${user(w, 1)}`;
      expect(await read(tx, user(w, 1), open.id, NOW)).toBeNull();

      // Ben still reads both.
      expect(await read(tx, user(w, 0), open.id, NOW)).not.toBeNull();
      expect(await read(tx, user(w, 0), first.id, NOW)).not.toBeNull();
    });
  });

  it("gives a member who joined after a revision was made nothing of it (FQ119)", async () => {
    await rolledBack(db, async (tx) => {
      // The revisions that brought Maya and Alex in list only the members before them.
      const w = await clubOf(tx, 3);
      const [alexs] = await tx<{ id: string }[]>`
        SELECT joined_via_revision_id AS id FROM app.memberships WHERE interval_id = ${member(w, 2)}`;
      const revision = alexs?.id ?? "";
      expect(await read(tx, user(w, 2), revision, NOW)).toBeNull();
      expect(await read(tx, user(w, 1), revision, NOW)).toMatchObject({ id: revision, state: "applied" });
    });
  });

  it("gives nobody anything of a suspended club's revision (FQ80)", async () => {
    await rolledBack(db, async (tx) => {
      const { w, open } = await world(tx);
      await tx`UPDATE app.clubs SET suspended_at = ${LATER} WHERE id = ${w.club}`;
      for (const index of [0, 1, 2]) expect(await read(tx, user(w, index), open.id, NOW)).toBeNull();
    });
  });

  it("says nothing of another member's decision or of an acceptance to a member who didn't propose the candidate (T15, T33)", async () => {
    await rolledBack(db, async (tx) => {
      const { w, open } = await world(tx);
      const sam = open.candidates[0]?.id ?? "";
      const made = await link(tx, clock, user(w, 0), w.club, sam);
      const before = [await read(tx, user(w, 1), open.id, NOW), await read(tx, user(w, 2), open.id, NOW)];
      const version = await rosterVersion(tx, w.club);

      await accept(tx, open.id, sam, (made.answer as { invitation_id: string }).invitation_id, LATER, "Sam");
      await decide(tx, open.id, member(w, 0), "approved", LATER);
      // Maya's and Alex's answers are the same, byte for byte, and no version moved.
      expect([await read(tx, user(w, 1), open.id, NOW), await read(tx, user(w, 2), open.id, NOW)]).toEqual(before);
      expect(JSON.stringify(await read(tx, user(w, 2), open.id, NOW))).toBe(JSON.stringify(before[1]));
      expect(await rosterVersion(tx, w.club)).toBe(version);
      const [revision] = await tx<
        { version: number }[]
      >`SELECT version FROM app.roster_revisions WHERE id = ${open.id}`;
      expect(revision?.version).toBe(1);

      // Alex's own decision shows to Alex alone.
      await decide(tx, open.id, member(w, 2), "declined", LATER);
      expect((await read(tx, user(w, 2), open.id, NOW))?.my_decision).toBe("declined");
      expect(await read(tx, user(w, 1), open.id, NOW)).toEqual(before[0]);
    });
  });

  it("names a member who has since left by the name the membership ended with, with no avatar (FQ75)", async () => {
    await rolledBack(db, async (tx) => {
      const { w, first } = await world(tx);
      await leave(plain(tx), { user: user(w, 2), interval: member(w, 2) }, "Alex then", LATER);
      const seen = await read(tx, user(w, 0), first.id, NOW);
      expect(seen?.members).toEqual([
        person(w, 0),
        person(w, 1),
        { membership_id: member(w, 2), display_name: "Alex then" },
      ]);
    });
  });
});
