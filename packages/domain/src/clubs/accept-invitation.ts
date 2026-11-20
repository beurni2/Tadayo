/// <reference lib="esnext.temporal" />
// Accept an invitation (the contract's `acceptInvitation`; spec 04, 32; G02, G03-waiting, book p9, p30;
// T1, T7, T8, T14, T19, T27, T52; A01; FQ54, FQ59, FQ65, FQ66, FQ71, FQ84, FQ120;
// docs/plans/api-b1-clubs.md, section 4): the candidate accepts the exact roster revision they saw, in one
// READ COMMITTED transaction the caller opens. A refusal throws `Refused`, which rolls it back, so a
// refused request leaves nothing, its receipt included, and binds no link.
//
// The token is hashed in the process and never sent to the database; the receipt's request holds the hash,
// not the token (T52).
//
// `standingOf` says where a request stands, from one read of the link's facts, the revision it names and
// the caller's own membership, in this order:
// a. Nothing, the neutral NOT_FOUND (T14, FQ59): no link, one revoked, replaced or used by another
//    account, or a suspended club's; a member of the club holding a link that isn't the one they joined
//    with; a candidate who has ended and never accepted; someone who joined by the link and has left; a
//    revision that doesn't list the link's candidate.
// b. INVITATION_EXPIRED for a link nobody has used whose expiry isn't after the sample (FQ71). A link its
//    account has used doesn't expire for that account: it can't be replaced (handoff 4), so an expiry
//    would leave the candidate no way to accept a changed roster.
// c. Nothing when the account already holds another place in this club's roster, as the preview has it,
//    whatever revision or version the request names.
// d. The revision the request names: ROSTER_CHANGED with the newest revision's id when a newer one
//    replaced it and still lists the candidate, and nothing when it doesn't (a leave ended the candidate
//    and carried the others on); VERSION_CONFLICT with its version when `expected_version` isn't it, as when it ended or
//    was applied since the caller read it. A revision that has ended, named at its last version, takes no
//    acceptance: the account that joined by it is answered `joined`, which changes nothing; anything else
//    is nothing.
// e. CLUB_FULL when the club has six members.
//
// 1. Where the request stands, with no lock. Every request that names nothing is NOT_FOUND here, before
//    the receipt is looked at, for a first request and a retry alike: a key the account has used tells
//    such a token from one nobody made no more than a new key does (T14).
// 2. The receipt (T19): the same request under the same key gets the first answer back, though the token
//    is used; another request under the key is IDEMPOTENCY_CONFLICT. Then the account's row, as
//    `createClub` takes it, so a deletion that has begun is seen (UNAUTHENTICATED, T27); then the club's
//    row, `FOR UPDATE`, as every roster command takes it, and the link's row, so accepting can't race a
//    replace or a revoke of the same link.
// 3. The clock, after the lock (T1), and where the request stands again at it, now that nothing of the
//    roster can change: each refusal of a. to e., in that order.
// 4. The name (FQ66, FQ84). When the account's profile name isn't the label the revision shows for the
//    candidate, the server makes a new revision: the open one ends as superseded by it; the new one
//    (`origin` rename) names the candidate's proposer, lists the club's members and carries every
//    candidate at their own label, this one under the account's name, with no acceptance and no approval:
//    everyone accepts and approves again, the proposer too. The link binds to the account. The answer is
//    `changed`. Names are compared as they are stored, code point for code point.
// 5. Otherwise the link binds to the account, if it hasn't, and the candidate's row on the revision is
//    accepted with it, once. Then the roster is applied if it is ready (./apply-roster.ts): the answer is
//    `joined`, with the club as its new member holds it, or `waiting`.
// 6. The answer is what the receipt keeps.

import type { QuerySql } from "../authorization/read-sql.ts";
import { completeReceipt, reserveReceipt, type ReceiptKey } from "../idempotency/receipt.ts";
import type { Json } from "../idempotency/request.ts";
import { newId } from "../ids.ts";
import { Refused } from "../refused.ts";
import type { Clock, ClockSql, ServerNow } from "../time/clock.ts";
import { applyIfReady, writeRevision } from "./apply-roster.ts";
import { CLUB_SIZE } from "./club.ts";
import { linkFacts, namesNothing, tokenHash, type LinkFacts } from "./invitation-facts.ts";

export interface AcceptInvitationInput {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The `Idempotency-Key`, a UUID, created when the action started and reused on every retry. */
  readonly key: string;
  /** The link's token, as the URL's fragment carried it. */
  readonly token: string;
  /** The revision the caller saw. */
  readonly revisionId: string;
  /** Its version, as the caller read it. */
  readonly expectedVersion: number;
}

export interface Acceptance {
  readonly invitationId: string;
  readonly state: "joined" | "waiting" | "changed";
  /** The club as its new member holds it, when `state` is joined. */
  readonly club: {
    readonly id: string;
    readonly name: string;
    readonly timezone: string;
    readonly membershipId: string;
  } | null;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function check(input: AcceptInvitationInput): void {
  if (typeof input.userId !== "string" || !ID.test(input.userId)) {
    throw new TypeError("clubs: the caller is an account id");
  }
  if (typeof input.key !== "string" || !UUID.test(input.key)) {
    throw new TypeError("clubs: the idempotency key is a UUID");
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new TypeError("clubs: expected_version is a whole number from 0");
  }
}

function shape(): Error {
  return new Error("clubs: the roster came back in a shape the schema doesn't allow");
}

/** The newest revision of the chain that replaced `revisionId`: the one nothing has superseded. */
export async function newestRevision(tx: QuerySql, revisionId: string): Promise<string> {
  const [row] = await bound(tx)`
    WITH RECURSIVE chain AS (
      SELECT r.id, r.superseded_by_id FROM app.roster_revisions r WHERE r.id = ${revisionId}
      UNION ALL
      SELECT n.id, n.superseded_by_id FROM chain c JOIN app.roster_revisions n ON n.id = c.superseded_by_id)
    SELECT id FROM chain WHERE superseded_by_id IS NULL`;
  const id = row?.["id"];
  if (typeof id !== "string") throw shape();
  return id;
}

type Standing =
  | { readonly kind: "nothing" }
  | { readonly kind: "refused"; readonly facts: LinkFacts; readonly refusal: Refused }
  /** The account joined by this very revision, named as it ended. */
  | { readonly kind: "joined"; readonly facts: LinkFacts; readonly intervalId: string }
  /** The revision is open and takes the acceptance; `label` is what it shows for the candidate. */
  | { readonly kind: "open"; readonly facts: LinkFacts; readonly label: string };

/** Where the request stands at `now` (the header's a. to e.). It reads and locks nothing. */
async function standingOf(tx: QuerySql, input: AcceptInvitationInput, hash: string, now: ServerNow): Promise<Standing> {
  const { userId, revisionId } = input;
  // a. What names nothing.
  const facts = await linkFacts(tx, userId, hash, now);
  if (facts === null || namesNothing(facts, userId)) return { kind: "nothing" };
  const mine = facts.boundUserId === userId;
  if (facts.membershipId !== null && !(mine && facts.candidateState === "joined")) return { kind: "nothing" };
  if (facts.candidateState === "ended" && !mine) return { kind: "nothing" };
  // Someone who joined and has left is a former member, told nothing of the club (T14).
  if (facts.candidateState === "joined" && facts.membershipId === null) return { kind: "nothing" };
  const [named] = await bound(tx)`
    SELECT r.state, r.version, rc.label
      FROM app.roster_revisions r
      JOIN app.roster_revision_candidates rc ON rc.revision_id = r.id AND rc.candidate_id = ${facts.candidateId}
     WHERE r.id = ${revisionId} AND r.club_id = ${facts.club.id} AND r.roster_sealed_at IS NOT NULL`;
  if (named === undefined) return { kind: "nothing" };

  // b. A link nobody has used, past its expiry.
  if (!mine && facts.pastExpiry) return { kind: "refused", facts, refusal: new Refused("INVITATION_EXPIRED") };

  // c. One account, one place.
  if (facts.holdsAnother) return { kind: "nothing" };

  // d. The revision the request names.
  const state = named["state"];
  const version = named["version"];
  const label = named["label"];
  if (typeof version !== "number" || typeof label !== "string") throw shape();
  if (state === "superseded") {
    // Only a candidate the newest revision still lists is told of it: one a leave ended while the others
    // were carried on (./leave-club.ts) is on no roster of the club now.
    const newest = await newestRevision(tx, revisionId);
    const [listed] = await bound(tx)`
      SELECT 1 AS found FROM app.roster_revision_candidates rc
       WHERE rc.revision_id = ${newest} AND rc.candidate_id = ${facts.candidateId}`;
    if (listed === undefined) return { kind: "nothing" };
    return { kind: "refused", facts, refusal: new Refused("ROSTER_CHANGED", { current_id: newest }) };
  }
  if (version !== input.expectedVersion) {
    return { kind: "refused", facts, refusal: new Refused("VERSION_CONFLICT", { current_version: version }) };
  }
  if (state !== "open") {
    // Ended, and named as it ended. The account that joined by it is told so; nothing else is accepted.
    const [joined] = await bound(tx)`
      SELECT m.interval_id FROM app.memberships m
       WHERE m.club_id = ${facts.club.id} AND m.user_id = ${userId} AND m.state = 'active'
         AND m.joined_via_revision_id = ${revisionId} AND m.joined_via_candidate_id = ${facts.candidateId}`;
    const intervalId = joined?.["interval_id"];
    if (state !== "applied" || typeof intervalId !== "string" || facts.membershipId !== intervalId) {
      return { kind: "nothing" };
    }
    return { kind: "joined", facts, intervalId };
  }
  // An open revision lists only open candidates, and a member's own link is one they joined with.
  if (facts.candidateState !== "open" || facts.membershipId !== null) return { kind: "nothing" };

  // e. Six.
  if (facts.members >= CLUB_SIZE) return { kind: "refused", facts, refusal: new Refused("CLUB_FULL") };
  return { kind: "open", facts, label };
}

/**
 * Accepts the revision for the account `input.userId` in `tx`, and returns what `render` makes of the
 * acceptance, which is also what the receipt stores and a replay returns. Throws `Refused`.
 */
export async function acceptInvitation(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: AcceptInvitationInput,
  render: (acceptance: Acceptance) => Json,
): Promise<Json> {
  check(input);
  const { userId, revisionId } = input;
  const hash = tokenHash(input.token);
  // A text that can't be a token, and an id that can't be one, name nothing, as ones nobody has.
  if (hash === null) throw new Refused("NOT_FOUND");
  if (typeof revisionId !== "string" || !ID.test(revisionId)) throw new Refused("NOT_FOUND");
  const receipt: ReceiptKey = {
    userId,
    key: input.key,
    request: {
      operation: "acceptInvitation",
      path: {},
      query: {},
      // The token's hash, never the token: the receipt's own hash is made of this (T52).
      body: { token_sha256: hash, revision_id: revisionId, expected_version: input.expectedVersion },
    },
  };

  // 1. Where the request stands, with no lock: what names nothing is refused before the receipt.
  const before = await standingOf(tx, input, hash, await clock.sample(tx));
  if (before.kind === "nothing") throw new Refused("NOT_FOUND");
  const clubId = before.facts.club.id;
  const invitationId = before.facts.invitationId;

  // 2. The receipt, the account's row, the club's row and the link's.
  const first = await reserveReceipt(tx, receipt, await clock.sample(tx));
  if (first !== null) return first.replay;
  const [account] = await bound(tx)`
    SELECT state, display_name FROM app.users WHERE id = ${userId} FOR NO KEY UPDATE`;
  if (account === undefined || account["state"] !== "active") throw new Refused("UNAUTHENTICATED");
  const profileName = account["display_name"];
  if (typeof profileName !== "string") throw new Refused("PROFILE_INCOMPLETE");
  await bound(tx)`SELECT id FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;
  await bound(tx)`SELECT id FROM app.invitations WHERE id = ${invitationId} FOR UPDATE`;

  // 3. The clock, after the lock, and where the request stands at it.
  const at = await clock.sample(tx);
  const standing = await standingOf(tx, input, hash, at);
  if (standing.kind === "nothing" || standing.facts.invitationId !== invitationId) throw new Refused("NOT_FOUND");
  if (standing.kind === "refused") throw standing.refusal;
  const facts = standing.facts;
  if (standing.kind === "joined") {
    const club = { ...facts.club, membershipId: standing.intervalId };
    return completeReceipt(tx, receipt, render({ invitationId, state: "joined", club }));
  }
  const label = standing.label;
  const mine = facts.boundUserId === userId;

  // The link binds to the first account that accepts, under either answer below.
  if (!mine) {
    await bound(tx)`
      UPDATE app.invitations SET bound_user_id = ${userId}, bound_at = ${at}::pg_catalog.timestamptz
       WHERE id = ${invitationId}`;
  }

  // 4. Another name: a new revision, which everyone accepts and approves again.
  if (profileName !== label) {
    const carried = await bound(tx)`
      SELECT rc.candidate_id, rc.label
        FROM app.roster_revision_candidates rc
        JOIN app.candidates k ON k.id = rc.candidate_id
       WHERE rc.revision_id = ${revisionId} AND k.state = 'open'
       ORDER BY rc.position`;
    const candidates = carried.map((row) => {
      const candidateId = row["candidate_id"];
      const shown = row["label"];
      if (typeof candidateId !== "string" || typeof shown !== "string") throw shape();
      return { candidateId, label: candidateId === facts.candidateId ? profileName : shown };
    });
    // The open revision ends first, naming the new one by an id made here: one revision is open per club,
    // and the schema checks the reference at commit (as `proposeRoster` does it).
    const next = newId("rev");
    await bound(tx)`
      UPDATE app.roster_revisions
         SET state = 'superseded', version = version + 1, superseded_by_id = ${next},
             ended_at = ${at}::pg_catalog.timestamptz
       WHERE id = ${revisionId}`;
    await writeRevision(tx, {
      id: next,
      clubId,
      origin: "rename",
      proposer: facts.proposerInterval,
      at,
      candidates,
      implicit: false,
    });
    await bound(tx)`UPDATE app.clubs SET roster_version = roster_version + 1 WHERE id = ${clubId}`;
    return completeReceipt(tx, receipt, render({ invitationId, state: "changed", club: null }));
  }

  // 5. Accepted, once; then the roster, if it is ready.
  await bound(tx)`
    UPDATE app.roster_revision_candidates
       SET accepted_at = ${at}::pg_catalog.timestamptz, accepted_invitation_id = ${invitationId}
     WHERE revision_id = ${revisionId} AND candidate_id = ${facts.candidateId} AND accepted_invitation_id IS NULL`;
  const applied = await applyIfReady(tx, at, clubId, revisionId);
  const me = applied?.joined.find((one) => one.userId === userId) ?? null;
  const acceptance: Acceptance =
    me === null
      ? { invitationId, state: "waiting", club: null }
      : { invitationId, state: "joined", club: { ...facts.club, membershipId: me.intervalId } };

  // 6. The answer.
  return completeReceipt(tx, receipt, render(acceptance));
}
