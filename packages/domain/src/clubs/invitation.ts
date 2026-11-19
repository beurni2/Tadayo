/// <reference lib="esnext.temporal" />
// A candidate's share link, made and revoked by the member who proposed the candidate (the contract's
// `createInvitation` and `revokeInvitation`; spec 04, 32; G01-invite-people; T1, T7, T14, T19, T33, T52;
// handoff 1, handoff 4; FQ59, FQ71, FQ77, FQ112; docs/plans/api-b1-clubs.md, section 3), each in one READ
// COMMITTED transaction the caller opens. A refusal throws `Refused`, which rolls it back.
//
// A link grants nothing by being held (T7): it is 256 random bits, returned to its proposer once, for the
// URL's fragment, and kept only as its SHA-256, so no row, receipt or log holds a usable token (FQ77,
// T52). The token never goes to the database, not even as a parameter: it is hashed here. The hash is of
// the token's base64url text as the URL carries it, not of the 32 bytes it spells: accepting hashes the
// same text.
//
// Only the candidate's proposer makes or revokes its link. Anyone else gets NOT_FOUND whatever the link's
// state, never NOT_ALLOWED, which would tell another member that the candidate accepted (T14, T33,
// handoff 1).
//
// `createInvitation`:
// 1. The caller's membership of the path's club (`activeMember`), before the receipt is looked at:
//    NOT_FOUND, for a first request and a retry alike (FQ112's default).
// 2. The receipt (T19): a replay is answered only to the interval that was a member when the receipt was
//    made; someone who left and joined again gets NOT_FOUND (FQ112; `reservedSince`). Then the club's row,
//    `FOR UPDATE`, as every command of a club's roster takes it, then who is asking again.
// 3. The candidate: of this club, still open, on the club's open revision, and proposed by the caller's
//    interval. Anything else is NOT_FOUND.
// 4. The candidate's latest link: NOT_ALLOWED when an account accepted with it, in this revision or an
//    earlier one (handoff 4).
// 5. The clock, after the lock (T1). The new link expires `INVITATION_DAYS` days after the sample's whole
//    second (FQ71), so the expiry the contract's whole-second Instant says is the expiry kept. The earlier
//    latest link, live, revoked or expired, is marked replaced by it: one link per candidate is the latest.
// 6. The answer, without the token, is what the receipt keeps and a replay returns (FQ77). The first
//    request alone also returns the token, for the route to put in the answer's `url`.
//
// `revokeInvitation` has no key: repeating it changes nothing and answers the same.
// 1. The link's candidate and club, by the link's id; the caller's membership of that club; the club's
//    row, `FOR UPDATE`; the caller again, whose interval proposed the candidate. NOT_FOUND otherwise.
// 2. NOT_ALLOWED when an account accepted with the link: accepting isn't undone by revoking (handoff 4).
// 3. `revoked_at`, set once, at the clock's sample after the lock. A link already replaced or expired is
//    revoked the same way: it didn't work before, and doesn't after. Only the link ends: the candidate
//    keeps their place, and nothing's version moves (T33).

import { createHash, randomBytes } from "node:crypto";
import { activeMember } from "../authorization/member.ts";
import type { QuerySql } from "../authorization/read-sql.ts";
import { completeReceipt, reserveReceipt, reservedSince, type ReceiptKey } from "../idempotency/receipt.ts";
import type { Json } from "../idempotency/request.ts";
import { newId } from "../ids.ts";
import { Refused } from "../refused.ts";
import type { Clock, ClockSql } from "../time/clock.ts";

/** How long a link lasts from when it's made: the one server setting (FQ71's default). */
export const INVITATION_DAYS = 7;

export interface CreateInvitationInput {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The `Idempotency-Key`, a UUID, created when the action started and reused on every retry. */
  readonly key: string;
  /** The path's club. */
  readonly clubId: string;
  /** The body's candidate. */
  readonly candidateId: string;
}

/** A link as it was made, without its token. */
export interface MadeLink {
  readonly invitationId: string;
  readonly candidateId: string;
  readonly expiresAt: Temporal.Instant;
}

export interface MadeInvitation {
  /** What `render` made of the link, as the receipt keeps it: the answer without the token. */
  readonly answer: Json;
  /** The token, for the first request alone; null on a replay, which has none to give (FQ77). */
  readonly token: string | null;
}

export interface RevokeInvitationInput {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The path's link. */
  readonly invitationId: string;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkCaller(userId: unknown): void {
  if (typeof userId !== "string" || !ID.test(userId)) throw new TypeError("clubs: the caller is an account id");
}

/** The start of `instant`'s second. */
function wholeSecond(instant: Temporal.Instant): Temporal.Instant {
  const nanoseconds = instant.epochNanoseconds;
  const within = ((nanoseconds % 1_000_000_000n) + 1_000_000_000n) % 1_000_000_000n;
  return Temporal.Instant.fromEpochNanoseconds(nanoseconds - within);
}

/**
 * Makes a link for the candidate in `tx`, and returns what `render` makes of it, which is also what the
 * receipt stores and a replay returns, with the token on the first request alone. Throws `Refused`.
 */
export async function createInvitation(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: CreateInvitationInput,
  render: (made: MadeLink) => Json,
): Promise<MadeInvitation> {
  checkCaller(input.userId);
  if (typeof input.key !== "string" || !UUID.test(input.key)) {
    throw new TypeError("clubs: the idempotency key is a UUID");
  }
  const { userId, clubId, candidateId } = input;
  // An id that can't be one names nothing, as one nobody has.
  if (typeof clubId !== "string" || !ID.test(clubId)) throw new Refused("NOT_FOUND");
  if (typeof candidateId !== "string" || !ID.test(candidateId)) throw new Refused("NOT_FOUND");
  const receipt: ReceiptKey = {
    userId,
    key: input.key,
    request: {
      operation: "createInvitation",
      path: { club_id: clubId },
      query: {},
      body: { candidate_id: candidateId },
    },
  };

  // 1. The caller's membership of the club.
  const asking = await activeMember(tx, userId, clubId);
  if (asking === null) throw new Refused("NOT_FOUND");

  // 2. The receipt, the club's row, and who is asking. A stored answer is its own interval's (FQ112).
  const first = await reserveReceipt(tx, receipt, await clock.sample(tx));
  if (first !== null) {
    if (!(await reservedSince(tx, receipt, asking))) throw new Refused("NOT_FOUND");
    return { answer: first.replay, token: null };
  }
  await bound(tx)`SELECT id FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;
  const proposer = await activeMember(tx, userId, clubId);
  if (proposer === null) throw new Refused("NOT_FOUND");

  // 3. The candidate: the caller's own, still open, on the open revision.
  const [candidate] = await bound(tx)`
    SELECT k.id
      FROM app.candidates k
      JOIN app.roster_revision_candidates rc ON rc.candidate_id = k.id
      JOIN app.roster_revisions r ON r.id = rc.revision_id AND r.state = 'open'
     WHERE k.id = ${candidateId} AND k.club_id = ${clubId} AND k.state = 'open'
       AND k.proposed_by_interval_id = ${proposer}`;
  if (candidate === undefined) throw new Refused("NOT_FOUND");

  // 4. The latest link.
  const [latest] = await bound(tx)`
    SELECT id, bound_user_id FROM app.invitations
     WHERE candidate_id = ${candidateId} AND replaced_by_id IS NULL FOR UPDATE`;
  if (latest !== undefined && latest["bound_user_id"] !== null) throw new Refused("NOT_ALLOWED");

  // 5. The clock, after the lock, and the new link.
  const at = await clock.sample(tx);
  const expiresAt = wholeSecond(at).add({ hours: 24 * INVITATION_DAYS });
  const invitationId = newId("inv");
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  if (latest !== undefined) {
    const earlier = latest["id"];
    if (typeof earlier !== "string") throw new Error("clubs: a link came back without its id");
    // Before the new one is written: one link per candidate is the latest (the reference is checked at commit).
    await bound(tx)`UPDATE app.invitations SET replaced_by_id = ${invitationId} WHERE id = ${earlier}`;
  }
  await bound(tx)`
    INSERT INTO app.invitations (id, candidate_id, token_sha256, created_at, expires_at)
    VALUES (${invitationId}, ${candidateId}, pg_catalog.decode(${hash}, 'hex'),
            ${at}::pg_catalog.timestamptz, ${expiresAt}::pg_catalog.timestamptz)`;

  // 6. The answer.
  const answer = await completeReceipt(tx, receipt, render({ invitationId, candidateId, expiresAt }), 201);
  return { answer, token };
}

/** Revokes the link in `tx`, or leaves it revoked, and returns its id. Throws `Refused`. */
export async function revokeInvitation(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: RevokeInvitationInput,
): Promise<{ readonly invitationId: string }> {
  checkCaller(input.userId);
  const { userId, invitationId } = input;
  // An id that can't be one names no link, as one nobody has.
  if (typeof invitationId !== "string" || !ID.test(invitationId)) throw new Refused("NOT_FOUND");

  // 1. The link's club, the caller's membership of it, the club's row, and the caller again.
  const [named] = await bound(tx)`
    SELECT k.club_id FROM app.invitations i JOIN app.candidates k ON k.id = i.candidate_id
     WHERE i.id = ${invitationId}`;
  const clubId = named?.["club_id"];
  if (typeof clubId !== "string") throw new Refused("NOT_FOUND");
  if ((await activeMember(tx, userId, clubId)) === null) throw new Refused("NOT_FOUND");
  await bound(tx)`SELECT id FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;
  const proposer = await activeMember(tx, userId, clubId);
  if (proposer === null) throw new Refused("NOT_FOUND");
  const [link] = await bound(tx)`
    SELECT i.bound_user_id, i.revoked_at
      FROM app.invitations i JOIN app.candidates k ON k.id = i.candidate_id
     WHERE i.id = ${invitationId} AND k.proposed_by_interval_id = ${proposer}
       FOR UPDATE OF i`;
  if (link === undefined) throw new Refused("NOT_FOUND");

  // 2. A link used to accept.
  if (link["bound_user_id"] !== null) throw new Refused("NOT_ALLOWED");

  // 3. Revoked once.
  if (link["revoked_at"] === null) {
    const at = await clock.sample(tx);
    await bound(tx)`UPDATE app.invitations SET revoked_at = ${at}::pg_catalog.timestamptz WHERE id = ${invitationId}`;
  }
  return { invitationId };
}
