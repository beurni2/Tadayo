/// <reference lib="esnext.temporal" />
// `createInvitation` and `revokeInvitation` against Postgres as `tadayo_app` (spec 04, 32; G01-invite-people;
// T7, T14, T19, T33, T52; handoff 1, handoff 4; FQ59, FQ71, FQ77, FQ112; docs/plans/api-b1-clubs.md,
// section 3; packages/domain/src/clubs/invitation.ts): a link's token, returned once and kept only as its
// hash; one latest link per candidate; the five states its proposer reads, and nobody else; and a revoke.
//
// These tests were written before the code they test.

import { createHash, randomUUID } from "node:crypto";
import type { ServerNow } from "@tadayo/domain";
import { fakeClock } from "@tadayo/domain/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rolledBack, worldSql, type WorldTx } from "./harness.ts";
import { accept, link, plain, propose, read, refusal, revoke, type RevisionBody } from "./roster-world.ts";
import { clubOf, type WeekClub } from "./week-world.ts";
import { leave, newId, newUser } from "./world.ts";

const db = worldSql(4);
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
/** Seven days after the first instant, cut to the whole second the contract's Instant holds (FQ71). */
const EXPIRES = "2026-11-18T05:00:00Z";
const LATER = new Date("2026-11-11T06:00:00Z");

const user = (w: WeekClub, index: number): string => w.users[index] ?? "";
const member = (w: WeekClub, index: number): string => w.members[index] ?? "";

interface LinkAnswer {
  invitation_id: string;
  candidate_id: string;
  expires_at: string;
}

interface World {
  w: WeekClub;
  open: RevisionBody;
  /** Sam, whom Ben proposed, and Debby, whom Maya proposed. */
  sam: string;
  debby: string;
}

/** Ben, Maya and Alex; the open revision holds Sam (Ben's) and Debby (Maya's). */
async function world(tx: WorldTx): Promise<World> {
  const w = await clubOf(tx, 3);
  await propose(tx, clock, user(w, 0), w.club, ["Sam"]);
  const open = await propose(tx, clock, user(w, 1), w.club, ["Debby"]);
  return { w, open, sam: open.candidates[0]?.id ?? "", debby: open.candidates[1]?.id ?? "" };
}

const linksOf = (tx: WorldTx, candidate: string) =>
  tx<
    {
      id: string;
      token_sha256: Uint8Array;
      created_at: Temporal.Instant;
      expires_at: Temporal.Instant;
      revoked_at: Temporal.Instant | null;
      replaced_by_id: string | null;
      bound_user_id: string | null;
    }[]
  >`SELECT id, token_sha256, created_at, expires_at, revoked_at, replaced_by_id, bound_user_id
      FROM app.invitations WHERE candidate_id = ${candidate} ORDER BY created_at, id`;

/** The link's state as Ben, who proposed Sam, reads it on the open revision. */
async function stateFor(tx: WorldTx, s: World, now: ServerNow = NOW): Promise<unknown> {
  return (await read(tx, user(s.w, 0), s.open.id, now))?.candidates[0]?.invitation;
}

describe("a share link for one candidate (T7, FQ71, FQ77)", () => {
  it("returns the token once, 256 random bits for the URL's fragment, and keeps only its SHA-256, with seven days from the clock's sample", async () => {
    await rolledBack(db, async (tx) => {
      const s = await world(tx);
      const made = await link(tx, clock, user(s.w, 0), s.w.club, s.sam);
      const answer = made.answer as unknown as LinkAnswer;
      expect(answer).toEqual({ invitation_id: answer.invitation_id, candidate_id: s.sam, expires_at: EXPIRES });
      expect(answer.invitation_id).toMatch(/^inv_[A-Za-z0-9_-]{22}$/);
      const token = made.token ?? "";
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const rows = await linksOf(tx, s.sam);
      expect(rows).toHaveLength(1);
      const [row] = rows;
      expect(row?.id).toBe(answer.invitation_id);
      expect(Buffer.from(row?.token_sha256 ?? []).equals(createHash("sha256").update(token).digest())).toBe(true);
      expect(row?.created_at.equals(FIRST)).toBe(true);
      expect(row?.expires_at.equals(Temporal.Instant.from(EXPIRES))).toBe(true);
      expect(row).toMatchObject({ revoked_at: null, replaced_by_id: null, bound_user_id: null });

      // The token is in no row: not in the link's, and not in the receipt, which keeps the answer without it.
      const [receipt] = await tx<{ response_status: number; response_body: unknown; whole: string }[]>`
        SELECT response_status, response_body, pg_catalog.row_to_json(r)::text AS whole
          FROM app.idempotency_receipts r WHERE actor_user_id = ${user(s.w, 0)} AND operation = 'createInvitation'`;
      expect(receipt?.response_status).toBe(201);
      expect(receipt?.response_body).toEqual(answer);
      expect(receipt?.whole).not.toContain(token);
      const [linkRow] = await tx<{ whole: string }[]>`
        SELECT pg_catalog.row_to_json(i)::text AS whole FROM app.invitations i WHERE id = ${answer.invitation_id}`;
      expect(linkRow?.whole).not.toContain(token);

      // Its proposer now reads it as live; nobody else reads it at all (handoff 1).
      expect(await stateFor(tx, s)).toEqual({ id: answer.invitation_id, state: "live", expires_at: EXPIRES });
      for (const index of [1, 2]) {
        const seen = await read(tx, user(s.w, index), s.open.id, NOW);
        expect(seen?.candidates[0]).toEqual({ id: s.sam, name: "Sam", proposed_by: s.open.candidates[0]?.proposed_by });
      }
    });
  });

  it("makes a different token each time", async () => {
    await rolledBack(db, async (tx) => {
      const s = await world(tx);
      const tokens = new Set<string>();
      for (let made = 0; made < 4; made += 1) {
        tokens.add((await link(tx, clock, user(s.w, 0), s.w.club, s.sam)).token ?? "");
      }
      expect(tokens.size).toBe(4);
    });
  });

  it("answers a retry under the same key with the first answer and no token, and makes nothing (T19, FQ77)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await world(tx);
      const key = randomUUID();
      const first = await link(tx, clock, user(s.w, 0), s.w.club, s.sam, key);
      clock.advance({ hours: 5 });
      const again = await link(tx, clock, user(s.w, 0), s.w.club, s.sam, key);
      expect(again.answer).toEqual(first.answer);
      expect(again.token).toBeNull();
      expect(await linksOf(tx, s.sam)).toHaveLength(1);
      // Another candidate under the same key is another request.
      const ben2 = await propose(tx, clock, user(s.w, 0), s.w.club, ["Nina"]);
      const nina = ben2.candidates[2]?.id ?? "";
      expect(await refusal(link(tx, clock, user(s.w, 0), s.w.club, nina, key))).toEqual({
        code: "IDEMPOTENCY_CONFLICT",
        facts: {},
      });
    });
  });

  it("replaces the candidate's earlier link with a new one, so one is the latest (FQ71)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await world(tx);
      const first = (await link(tx, clock, user(s.w, 0), s.w.club, s.sam)).answer as unknown as LinkAnswer;
      clock.advance({ hours: 1 });
      const second = (await link(tx, clock, user(s.w, 0), s.w.club, s.sam)).answer as unknown as LinkAnswer;
      expect(second.invitation_id).not.toBe(first.invitation_id);
      expect(second.expires_at).toBe("2026-11-18T06:00:00Z");
      const rows = await linksOf(tx, s.sam);
      expect(rows.map((row) => [row.id, row.replaced_by_id])).toEqual([
        [first.invitation_id, second.invitation_id],
        [second.invitation_id, null],
      ]);
      expect(await stateFor(tx, s)).toMatchObject({ id: second.invitation_id, state: "live" });
    });
  });

  it("refuses a new link once the candidate has accepted with the latest one, in this revision or an earlier one (NOT_ALLOWED, handoff 4)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await world(tx);
      const first = (await link(tx, clock, user(s.w, 0), s.w.club, s.sam)).answer as unknown as LinkAnswer;
      await accept(tx, s.open.id, s.sam, first.invitation_id, LATER, "Sam");
      expect(await refusal(link(tx, clock, user(s.w, 0), s.w.club, s.sam))).toEqual({ code: "NOT_ALLOWED", facts: {} });
      // A newer revision carries Sam, who hasn't accepted it: the link is used, and still can't be replaced.
      await propose(tx, clock, user(s.w, 2), s.w.club, ["Nina"]);
      expect(await refusal(link(tx, clock, user(s.w, 0), s.w.club, s.sam))).toEqual({ code: "NOT_ALLOWED", facts: {} });
      expect(await linksOf(tx, s.sam)).toHaveLength(1);
    });
  });

  it("gives anyone but the candidate's proposer the neutral not-found, whatever the link's state, and leaves nothing (T14, handoff 1)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await world(tx);
      const other = await clubOf(tx, 2);
      const stranger = await newUser(plain(tx), "Zed");
      const none = { code: "NOT_FOUND", facts: {} };
      const attempts = async () => {
        // Maya and Alex are members, and didn't propose Sam.
        expect(await refusal(link(tx, clock, user(s.w, 1), s.w.club, s.sam))).toEqual(none);
        expect(await refusal(link(tx, clock, user(s.w, 2), s.w.club, s.sam))).toEqual(none);
        expect(await refusal(link(tx, clock, stranger, s.w.club, s.sam))).toEqual(none);
        expect(await refusal(link(tx, clock, user(other, 0), s.w.club, s.sam))).toEqual(none);
        // The candidate is of another club than the path's.
        expect(await refusal(link(tx, clock, user(other, 0), other.club, s.sam))).toEqual(none);
      };
      await attempts();
      const made = (await link(tx, clock, user(s.w, 0), s.w.club, s.sam)).answer as unknown as LinkAnswer;
      await attempts();
      await accept(tx, s.open.id, s.sam, made.invitation_id, LATER, "Sam");
      // Still the same answer, never NOT_ALLOWED, which would say Sam accepted (T33).
      await attempts();
      expect(await refusal(link(tx, clock, user(s.w, 0), s.w.club, newId("cand")))).toEqual(none);
      expect(await refusal(link(tx, clock, user(s.w, 0), s.w.club, "not an id"))).toEqual(none);
      expect(await refusal(link(tx, clock, user(s.w, 0), "not an id", s.sam))).toEqual(none);
      expect(await linksOf(tx, s.sam)).toHaveLength(1);
    });
  });

  it("gives the proposer the neutral not-found for a candidate who has ended or joined, once the proposer has left, and in a suspended club", async () => {
    await rolledBack(db, async (tx) => {
      const none = { code: "NOT_FOUND", facts: {} };
      const s = await world(tx);
      // A candidate who joined: Maya came in as Ben's candidate.
      const [joined] = await tx<{ id: string }[]>`
        SELECT joined_via_candidate_id AS id FROM app.memberships WHERE interval_id = ${member(s.w, 1)}`;
      expect(await refusal(link(tx, clock, user(s.w, 0), s.w.club, joined?.id ?? ""))).toEqual(none);
      // A candidate whose proposal ended.
      await tx`UPDATE app.roster_revisions SET state = 'did_not_go_ahead', version = 2, ended_at = ${LATER} WHERE id = ${s.open.id}`;
      await tx`UPDATE app.candidates SET state = 'ended', ended_at = ${LATER} WHERE id = ${s.sam}`;
      expect(await refusal(link(tx, clock, user(s.w, 0), s.w.club, s.sam))).toEqual(none);

      const t = await world(tx);
      await leave(plain(tx), { user: user(t.w, 0), interval: member(t.w, 0) }, "Ben", LATER);
      expect(await refusal(link(tx, clock, user(t.w, 0), t.w.club, t.sam))).toEqual(none);

      const u = await world(tx);
      await tx`UPDATE app.clubs SET suspended_at = ${LATER} WHERE id = ${u.w.club}`;
      expect(await refusal(link(tx, clock, user(u.w, 0), u.w.club, u.sam))).toEqual(none);
      expect(await linksOf(tx, u.sam)).toHaveLength(0);
    });
  });

  it("gives a retry by a proposer who has since left the neutral not-found (FQ112)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await world(tx);
      const key = randomUUID();
      await link(tx, clock, user(s.w, 0), s.w.club, s.sam, key);
      await leave(plain(tx), { user: user(s.w, 0), interval: member(s.w, 0) }, "Ben", LATER);
      expect(await refusal(link(tx, clock, user(s.w, 0), s.w.club, s.sam, key))).toEqual({
        code: "NOT_FOUND",
        facts: {},
      });
    });
  });
});

describe("where a link stands, for its proposer alone (CandidateLinkState)", () => {
  it("is live until the instant it expires, and expired from then (FQ71), by the server's clock (T1)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await world(tx);
      await link(tx, clock, user(s.w, 0), s.w.club, s.sam);
      const expires = Temporal.Instant.from(EXPIRES);
      expect(await stateFor(tx, s, expires.subtract({ microseconds: 1 }) as ServerNow)).toMatchObject({
        state: "live",
      });
      expect(await stateFor(tx, s, expires as ServerNow)).toMatchObject({ state: "expired", expires_at: EXPIRES });
      expect(await stateFor(tx, s, expires.add({ hours: 400 }) as ServerNow)).toMatchObject({ state: "expired" });
    });
  });

  it("is accepted once the candidate accepted this revision with it, used on a newer revision, and stays so past its expiry", async () => {
    await rolledBack(db, async (tx) => {
      const s = await world(tx);
      const made = (await link(tx, clock, user(s.w, 0), s.w.club, s.sam)).answer as unknown as LinkAnswer;
      await accept(tx, s.open.id, s.sam, made.invitation_id, LATER, "Sam");
      const long = Temporal.Instant.from(EXPIRES).add({ hours: 1 }) as ServerNow;
      expect(await stateFor(tx, s)).toEqual({ id: made.invitation_id, state: "accepted", expires_at: EXPIRES });
      expect(await stateFor(tx, s, long)).toMatchObject({ state: "accepted" });
      const newer = await propose(tx, clock, user(s.w, 2), s.w.club, ["Nina"]);
      const seen = await read(tx, user(s.w, 0), newer.id, long);
      expect(seen?.candidates[0]?.invitation).toEqual({ id: made.invitation_id, state: "used", expires_at: EXPIRES });
    });
  });

  it("is revoked once revoked, and stays revoked past its expiry", async () => {
    await rolledBack(db, async (tx) => {
      const s = await world(tx);
      const made = (await link(tx, clock, user(s.w, 0), s.w.club, s.sam)).answer as unknown as LinkAnswer;
      await revoke(tx, clock, user(s.w, 0), made.invitation_id);
      expect(await stateFor(tx, s)).toEqual({ id: made.invitation_id, state: "revoked", expires_at: EXPIRES });
      expect(await stateFor(tx, s, Temporal.Instant.from(EXPIRES).add({ hours: 1 }) as ServerNow)).toMatchObject({
        state: "revoked",
      });
    });
  });
});

describe("revoking a link (G01-invite-people-revoked; FQ59, handoff 4)", () => {
  it("ends the link at the clock's sample and nothing else: the candidate keeps their place, and a repeat answers the same and changes nothing", async () => {
    await rolledBack(db, async (tx) => {
      const s = await world(tx);
      const made = (await link(tx, clock, user(s.w, 0), s.w.club, s.sam)).answer as unknown as LinkAnswer;
      clock.advance({ minutes: 9 });
      const at = FIRST.add({ minutes: 9 });
      const answer = await revoke(tx, clock, user(s.w, 0), made.invitation_id);
      expect(answer).toEqual({ invitation_id: made.invitation_id, state: "revoked" });
      const [row] = await linksOf(tx, s.sam);
      expect(row?.revoked_at?.equals(at)).toBe(true);

      clock.advance({ minutes: 9 });
      expect(await revoke(tx, clock, user(s.w, 0), made.invitation_id)).toEqual(answer);
      const [again] = await linksOf(tx, s.sam);
      expect(again?.revoked_at?.equals(at)).toBe(true);

      // Sam is still proposed, on the same open revision, whose version hasn't moved (T33).
      const seen = await read(tx, user(s.w, 0), s.open.id, NOW);
      expect(seen).toMatchObject({ state: "open", version: 1 });
      expect(seen?.candidates.map((candidate) => candidate.name)).toEqual(["Sam", "Debby"]);
      // And Ben can make a new link, which is then the latest (Create new link).
      const next = (await link(tx, clock, user(s.w, 0), s.w.club, s.sam)).answer as unknown as LinkAnswer;
      expect(await stateFor(tx, s)).toMatchObject({ id: next.invitation_id, state: "live" });
    });
  });

  it("revokes a link that was replaced or has expired the same way", async () => {
    await rolledBack(db, async (tx) => {
      const s = await world(tx);
      const first = (await link(tx, clock, user(s.w, 0), s.w.club, s.sam)).answer as unknown as LinkAnswer;
      const second = (await link(tx, clock, user(s.w, 0), s.w.club, s.sam)).answer as unknown as LinkAnswer;
      expect(await revoke(tx, clock, user(s.w, 0), first.invitation_id)).toEqual({
        invitation_id: first.invitation_id,
        state: "revoked",
      });
      // The latest link is untouched.
      expect(await stateFor(tx, s)).toMatchObject({ id: second.invitation_id, state: "live" });
      clock.set(Temporal.Instant.from(EXPIRES).add({ hours: 2 }));
      expect(await revoke(tx, clock, user(s.w, 0), second.invitation_id)).toEqual({
        invitation_id: second.invitation_id,
        state: "revoked",
      });
    });
  });

  it("refuses to revoke a link the candidate accepted with (NOT_ALLOWED), and leaves it as it was", async () => {
    await rolledBack(db, async (tx) => {
      const s = await world(tx);
      const made = (await link(tx, clock, user(s.w, 0), s.w.club, s.sam)).answer as unknown as LinkAnswer;
      await accept(tx, s.open.id, s.sam, made.invitation_id, LATER, "Sam");
      expect(await refusal(revoke(tx, clock, user(s.w, 0), made.invitation_id))).toEqual({
        code: "NOT_ALLOWED",
        facts: {},
      });
      const [row] = await linksOf(tx, s.sam);
      expect(row?.revoked_at).toBeNull();
    });
  });

  it("gives anyone but the candidate's proposer the neutral not-found, whatever the link's state (T14)", async () => {
    await rolledBack(db, async (tx) => {
      const s = await world(tx);
      const other = await clubOf(tx, 2);
      const stranger = await newUser(plain(tx), "Zed");
      const none = { code: "NOT_FOUND", facts: {} };
      const made = (await link(tx, clock, user(s.w, 0), s.w.club, s.sam)).answer as unknown as LinkAnswer;
      const attempts = async () => {
        for (const who of [user(s.w, 1), user(s.w, 2), stranger, user(other, 0)]) {
          expect(await refusal(revoke(tx, clock, who, made.invitation_id))).toEqual(none);
        }
      };
      await attempts();
      await accept(tx, s.open.id, s.sam, made.invitation_id, LATER, "Sam");
      await attempts();
      expect(await refusal(revoke(tx, clock, user(s.w, 0), newId("inv")))).toEqual(none);
      expect(await refusal(revoke(tx, clock, user(s.w, 0), "not an id"))).toEqual(none);
      const [row] = await linksOf(tx, s.sam);
      expect(row?.revoked_at).toBeNull();

      // Once the proposer has left, or the club is suspended, the link is nobody's to revoke.
      const t = await world(tx);
      const theirs = (await link(tx, clock, user(t.w, 0), t.w.club, t.sam)).answer as unknown as LinkAnswer;
      await tx`UPDATE app.clubs SET suspended_at = ${LATER} WHERE id = ${t.w.club}`;
      expect(await refusal(revoke(tx, clock, user(t.w, 0), theirs.invitation_id))).toEqual(none);
    });
  });
});
