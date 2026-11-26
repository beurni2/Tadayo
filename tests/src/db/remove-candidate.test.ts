/// <reference lib="esnext.temporal" />
// Removing someone invited who hasn't joined, against Postgres as `tadayo_app` (the outside audit's A10; FQ148,
// answered by the founder on 26 November 2026; spec 04; A01; T7, T14; FQ59, FQ60, FQ121;
// docs/plans/api-b2-unpropose.md, sections 0 to 3; packages/domain/src/clubs/remove-candidate.ts): the place it
// frees, the revision it ends or replaces, the links it stops, and who may do it.
//
// These tests were written before the code they test. The first describe holds the audit's finding as it stands on
// `main`: revoking and the proposer's own decline free nothing, and still don't once removing exists. The last describe
// holds a removal to the club's row against the commands it can meet there: an acceptance that joins, the approval that
// applies the roster, and the proposer's leave, each way round.

import { randomUUID } from "node:crypto";
import { invitationAcceptanceBody, leftClubBody, rosterRevisionBody } from "@tadayo/api";
import { acceptInvitation, approveRoster, leaveClub, readClub, removeCandidate, type ServerNow } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { worldSql, rolledBack, type WorldTx } from "./harness.ts";
import {
  accept,
  acceptWith,
  approve,
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
} from "./roster-world.ts";
import { clubOf, holding, waitingOn, type WeekClub } from "./week-world.ts";
import { leave, newUser } from "./world.ts";

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

const user = (w: WeekClub, index: number): string => w.users[index] ?? "";

/** `removeCandidate` as its route runs it. */
const remove = (tx: WorldTx, userId: string, candidateId: string) =>
  tx.savepoint((sp) => removeCandidate(sp, clock, { userId, candidateId }));

const candidateState = async (tx: WorldTx, candidateId: string): Promise<string | undefined> =>
  (await tx<{ state: string }[]>`SELECT state FROM app.candidates WHERE id = ${candidateId}`)[0]?.state;

const revisionState = async (tx: WorldTx, revisionId: string) =>
  (
    await tx<{ state: string; version: number; superseded_by_id: string | null }[]>`
      SELECT state, version, superseded_by_id FROM app.roster_revisions WHERE id = ${revisionId}`
  )[0];

const canPropose = async (tx: WorldTx, userId: string, clubId: string): Promise<boolean | undefined> =>
  (await readClub(plain(tx), userId, clubId, NOW))?.canPropose;

const FIVE = ["Maya", "Alex", "Sam", "Debby", "Nina"] as const;

describe("the outside audit's A10: someone invited who never answers holds their place (spec 04, A01)", () => {
  it("is held for good by revoking their link and by the proposer's own decline, a year on too", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await founded(tx, clock);
      const open = await propose(tx, clock, ben.user, ben.club, FIVE);
      const nina = open.candidates[4]?.id ?? "";
      const link = await linkFor(tx, clock, ben.user, ben.club, nina);
      await revoke(tx, clock, ben.user, link.id);
      // Proposing was Ben's approval (FQ60), so Ben's decline decides nothing.
      expect((await decline(tx, clock, ben.user, open.id, open.version)).state).toBe("open");
      expect(await candidateState(tx, nina)).toBe("open");
      expect(await canPropose(tx, ben.user, ben.club)).toBe(false);
      expect((await refusal(propose(tx, clock, ben.user, ben.club, ["Zed"]))).code).toBe("CLUB_FULL");
      clock.set(Temporal.Instant.from("2027-11-11T14:00:00Z"));
      expect((await refusal(propose(tx, clock, ben.user, ben.club, ["Zed"]))).code).toBe("CLUB_FULL");
    });
  });
});

describe("removing someone invited who hasn't joined (FQ148; the outside audit's A10)", () => {
  it("frees their place: the proposer can propose again, and the club can be six", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await founded(tx, clock);
      const open = await propose(tx, clock, ben.user, ben.club, FIVE);
      const nina = open.candidates[4]?.id ?? "";
      expect(await remove(tx, ben.user, nina)).toEqual({ candidateId: nina });
      expect(await candidateState(tx, nina)).toBe("ended");
      expect(await canPropose(tx, ben.user, ben.club)).toBe(true);
      const next = await propose(tx, clock, ben.user, ben.club, ["Zed"]);
      expect(next.candidates.map(({ name }) => name)).toEqual(["Maya", "Alex", "Sam", "Debby", "Zed"]);
    });
  });

  it("ends the revision when nobody else is invited, and moves the club's version", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await founded(tx, clock);
      const open = await propose(tx, clock, ben.user, ben.club, ["Nina"]);
      const before = await rosterVersion(tx, ben.club);
      await remove(tx, ben.user, open.candidates[0]?.id ?? "");
      expect(await revisionState(tx, open.id)).toEqual({
        state: "did_not_go_ahead",
        version: open.version + 1,
        superseded_by_id: null,
      });
      expect(await rosterVersion(tx, ben.club)).toBe(before + 1);
      expect((await read(tx, ben.user, open.id, NOW))?.state).toBe("did_not_go_ahead");
    });
  });

  it("carries everyone else into a revision the server makes: the same proposer, approving, their labels and order, nobody's acceptance", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await founded(tx, clock);
      const open = await propose(tx, clock, ben.user, ben.club, ["Maya", "Nina", "Alex"]);
      const [maya, nina, alex] = open.candidates.map(({ id }) => id);
      // Maya accepted this revision; the removal changes the roster Maya accepted, so Maya accepts again (spec 04).
      const mayaLink = await linkFor(tx, clock, ben.user, ben.club, maya ?? "");
      await accept(tx, open.id, maya ?? "", mayaLink.id, LATER, "Maya");
      await remove(tx, ben.user, nina ?? "");
      const ended = await revisionState(tx, open.id);
      expect(ended?.state).toBe("superseded");
      const carried = await read(tx, ben.user, ended?.superseded_by_id ?? "", NOW);
      expect(carried).toMatchObject({
        state: "open",
        version: 1,
        proposed_by: { membership_id: ben.interval },
        candidates: [
          { id: maya, name: "Maya" },
          { id: alex, name: "Alex" },
        ],
        my_decision: "approved",
      });
      const [acceptance] = await tx<{ accepted: number }[]>`
        SELECT pg_catalog.count(*)::pg_catalog.int4 AS accepted FROM app.roster_revision_candidates
         WHERE revision_id = ${ended?.superseded_by_id ?? ""} AND accepted_at IS NOT NULL`;
      expect(acceptance?.accepted).toBe(0);
      expect(await candidateState(tx, maya ?? "")).toBe("open");
      expect(await candidateState(tx, alex ?? "")).toBe("open");
    });
  });

  it("asks the other members again, the remover too when someone else proposed the revision", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 2);
      const first = await propose(tx, clock, user(w, 0), w.club, ["Nina"]);
      const nina = first.candidates[0]?.id ?? "";
      // Maya's proposal carries Nina, Ben's, and is Maya's alone to have approved (FQ60).
      const second = await propose(tx, clock, user(w, 1), w.club, ["Zed"]);
      await remove(tx, user(w, 0), nina);
      const next = (await revisionState(tx, second.id))?.superseded_by_id ?? "";
      expect(await read(tx, user(w, 1), next, NOW)).toMatchObject({
        proposed_by: { membership_id: w.members[1] },
        candidates: [{ name: "Zed" }],
        my_decision: "approved",
      });
      expect((await read(tx, user(w, 0), next, NOW))?.my_decision).toBe("pending");
    });
  });

  it("stops every link of theirs: an unused one names nothing, and an account that accepted sees only that it didn't go ahead", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await founded(tx, clock);
      const open = await propose(tx, clock, ben.user, ben.club, ["Maya", "Nina"]);
      const [maya, nina] = open.candidates.map(({ id }) => id);
      const ninaLink = await linkFor(tx, clock, ben.user, ben.club, nina ?? "");
      const mayaLink = await linkFor(tx, clock, ben.user, ben.club, maya ?? "");
      const mayaUser = await accept(tx, open.id, maya ?? "", mayaLink.id, LATER, "Maya");
      await remove(tx, ben.user, nina ?? "");
      await remove(tx, ben.user, maya ?? "");
      const stranger = await newUser(plain(tx), "Nina");
      // As a revoked link answers (FQ59): the neutral not-found, for any account.
      expect(await preview(tx, stranger, ninaLink.token, NOW)).toBeNull();
      expect(await preview(tx, mayaUser, mayaLink.token, NOW)).toEqual({
        state: "did_not_go_ahead",
        inviter_name: "Ben",
      });
      expect((await refusal(acceptWith(tx, clock, stranger, ninaLink.token, open.id, open.version))).code).toBe(
        "NOT_FOUND",
      );
    });
  });

  it("is the proposer's alone: another member, an outsider and someone who left get the neutral not-found, and nothing moves", async () => {
    await rolledBack(db, async (tx) => {
      const w = await clubOf(tx, 3);
      const open = await propose(tx, clock, user(w, 0), w.club, ["Nina"]);
      const nina = open.candidates[0]?.id ?? "";
      const outsider = await newUser(plain(tx), "Zed");
      await leave(plain(tx), { user: user(w, 2), interval: w.members[2] ?? "" }, "Alex", LATER);
      const before = await rosterVersion(tx, w.club);
      for (const someone of [user(w, 1), outsider, user(w, 2)]) {
        expect((await refusal(remove(tx, someone, nina))).code, someone).toBe("NOT_FOUND");
      }
      expect(await candidateState(tx, nina)).toBe("open");
      expect(await rosterVersion(tx, w.club)).toBe(before);
    });
  });

  it("answers a repeat as it answered the first, and moves nothing more", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await founded(tx, clock);
      const open = await propose(tx, clock, ben.user, ben.club, ["Maya", "Nina"]);
      const nina = open.candidates[1]?.id ?? "";
      await remove(tx, ben.user, nina);
      const after = await rosterVersion(tx, ben.club);
      expect(await remove(tx, ben.user, nina)).toEqual({ candidateId: nina });
      expect(await rosterVersion(tx, ben.club)).toBe(after);
    });
  });

  it("leaves someone who joined alone: a member is no candidate to remove, so the neutral not-found", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await founded(tx, clock);
      const open = await propose(tx, clock, ben.user, ben.club, ["Maya"]);
      const maya = open.candidates[0]?.id ?? "";
      const link = await linkFor(tx, clock, ben.user, ben.club, maya);
      const mayaUser = await newUser(plain(tx), "Maya");
      expect((await acceptWith(tx, clock, mayaUser, link.token, open.id, open.version)).state).toBe("joined");
      expect((await refusal(remove(tx, ben.user, maya))).code).toBe("NOT_FOUND");
      expect(await candidateState(tx, maya)).toBe("joined");
    });
  });

  it("names nothing for an id that can't be one, or one nobody has", async () => {
    await rolledBack(db, async (tx) => {
      const ben = await founded(tx, clock);
      for (const id of ["", "cand_nobody", "x".repeat(65), "cand_' OR 1=1"]) {
        expect((await refusal(remove(tx, ben.user, id))).code, id).toBe("NOT_FOUND");
      }
    });
  });
});

describe("a removal behind the club's row (T1, T7; FQ121)", () => {
  // Committed worlds, so each command is a transaction of its own that waits for the club's row as its route's does.
  const asWorld = (sql: unknown) => sql as WorldTx;
  const removing = (userId: string, candidateId: string) =>
    db.begin((tx) => removeCandidate(tx, clock, { userId, candidateId }));
  const accepting = (userId: string, token: string, revisionId: string) =>
    db.begin((tx) =>
      acceptInvitation(
        tx,
        clock,
        { userId, key: randomUUID(), token, revisionId, expectedVersion: 1 },
        invitationAcceptanceBody,
      ),
    );
  const approving = (userId: string, revisionId: string) =>
    db.begin((tx) =>
      approveRoster(tx, clock, { userId, key: randomUUID(), revisionId, expectedVersion: 1 }, rosterRevisionBody),
    );
  const leaving = (userId: string, clubId: string) =>
    db.begin((tx) =>
      leaveClub(asWorld(tx), clock, { userId, key: randomUUID(), clubId, contributions: "keep" }, leftClubBody),
    );
  const outcome = async (done: Promise<unknown>): Promise<unknown> => {
    try {
      return await done;
    } catch (error) {
      return (error as { code?: string }).code;
    }
  };
  /** Sends `first`, then `second` once `first` waits for the club's row, then lets both through in that order. */
  const inTurn = async (
    club: string,
    first: () => Promise<unknown>,
    second: () => Promise<unknown>,
  ): Promise<[unknown, unknown]> => {
    const hold = await holding(db, club);
    let one: Promise<unknown>;
    let two: Promise<unknown>;
    try {
      one = outcome(first());
      await waitingOn(db, hold.pid, 1);
      two = outcome(second());
      await waitingOn(db, hold.pid, 2);
    } finally {
      await hold.release();
    }
    return [await one, await two];
  };
  const memberAccounts = async (club: string): Promise<string[]> =>
    (
      await db<{ user_id: string }[]>`
        SELECT user_id FROM app.memberships WHERE club_id = ${club} AND state = 'active'`
    ).map(({ user_id }) => user_id);

  it(
    "joins the candidate or removes them, never both, when the acceptance that completes the roster and the removal arrive at once",
    { timeout: 30_000 },
    async () => {
      for (const acceptFirst of [true, false]) {
        const s = await db.begin(async (sql) => {
          const tx = asWorld(sql);
          const w = await clubOf(tx, 2);
          const open = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
          const sam = open.candidates[0]?.id ?? "";
          const link = await linkFor(tx, clock, user(w, 0), w.club, sam);
          await approve(tx, clock, user(w, 1), open.id, open.version);
          return { w, open, sam, link, account: await newUser(plain(tx), "Sam") };
        });
        const accept1 = () => accepting(s.account, s.link.token, s.open.id);
        const remove1 = () => removing(user(s.w, 0), s.sam);
        const [a, b] = await inTurn(s.w.club, acceptFirst ? accept1 : remove1, acceptFirst ? remove1 : accept1);
        const accepted = acceptFirst ? a : b;
        const removed = acceptFirst ? b : a;
        const members = await memberAccounts(s.w.club);
        if (acceptFirst) {
          expect((accepted as { state: string }).state).toBe("joined");
          expect(removed).toBe("NOT_FOUND");
          expect(await candidateState(asWorld(db), s.sam)).toBe("joined");
          expect(members).toContain(s.account);
        } else {
          expect(removed).toEqual({ candidateId: s.sam });
          expect(accepted).toBe("NOT_FOUND");
          expect(await candidateState(asWorld(db), s.sam)).toBe("ended");
          expect(members).not.toContain(s.account);
          expect((await revisionState(asWorld(db), s.open.id))?.state).toBe("did_not_go_ahead");
        }
      }
    },
  );

  it(
    "applies the roster or removes the candidate who accepted it, never both, when the last approval and the removal arrive at once",
    { timeout: 30_000 },
    async () => {
      for (const approveFirst of [true, false]) {
        const s = await db.begin(async (sql) => {
          const tx = asWorld(sql);
          const w = await clubOf(tx, 2);
          const open = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
          const sam = open.candidates[0]?.id ?? "";
          const link = await linkFor(tx, clock, user(w, 0), w.club, sam);
          const account = await newUser(plain(tx), "Sam");
          expect((await acceptWith(tx, clock, account, link.token, open.id, open.version)).state).toBe("waiting");
          return { w, open, sam, account };
        });
        const approve1 = () => approving(user(s.w, 1), s.open.id);
        const remove1 = () => removing(user(s.w, 0), s.sam);
        const [a, b] = await inTurn(s.w.club, approveFirst ? approve1 : remove1, approveFirst ? remove1 : approve1);
        const approved = approveFirst ? a : b;
        const removed = approveFirst ? b : a;
        const members = await memberAccounts(s.w.club);
        if (approveFirst) {
          expect((approved as { state: string }).state).toBe("applied");
          expect(removed).toBe("NOT_FOUND");
          expect(members).toContain(s.account);
        } else {
          expect(removed).toEqual({ candidateId: s.sam });
          // The revision ended at its next version, so the approval names the one it read: nothing is applied.
          expect(approved).toBe("VERSION_CONFLICT");
          expect(members).not.toContain(s.account);
          expect(await revisionState(asWorld(db), s.open.id)).toMatchObject({ state: "did_not_go_ahead", version: 2 });
        }
      }
    },
  );

  it(
    "ends the candidate once when their proposer leaves and removes them at once: a removal after the leave names nothing",
    { timeout: 30_000 },
    async () => {
      for (const leaveFirst of [true, false]) {
        const s = await db.begin(async (sql) => {
          const tx = asWorld(sql);
          const w = await clubOf(tx, 3);
          const open = await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
          return { w, open, sam: open.candidates[0]?.id ?? "" };
        });
        const before = await rosterVersion(asWorld(db), s.w.club);
        const leave1 = () => leaving(user(s.w, 0), s.w.club);
        const remove1 = () => removing(user(s.w, 0), s.sam);
        const [a, b] = await inTurn(s.w.club, leaveFirst ? leave1 : remove1, leaveFirst ? remove1 : leave1);
        const left = leaveFirst ? a : b;
        const removed = leaveFirst ? b : a;
        expect(typeof left).toBe("object");
        expect(await memberAccounts(s.w.club)).not.toContain(user(s.w, 0));
        if (leaveFirst) expect(removed).toBe("NOT_FOUND");
        else expect(removed).toEqual({ candidateId: s.sam });
        expect(await candidateState(asWorld(db), s.sam)).toBe("ended");
        expect((await revisionState(asWorld(db), s.open.id))?.state).toBe("did_not_go_ahead");
        // The leave moves the roster version once, and a removal before it once more.
        expect(await rosterVersion(asWorld(db), s.w.club)).toBe(before + (leaveFirst ? 1 : 2));
      }
    },
  );
});
