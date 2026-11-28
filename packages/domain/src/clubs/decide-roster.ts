/// <reference lib="esnext.temporal" />
// Approve or decline a proposed roster (the contract's `approveRoster` and `declineRoster`; spec 04, 32;
// G03-approve, book p30; T1, T7, T9, T14, T15, T19, T33; A01; FQ54, FQ60, FQ65, FQ84, FQ112, FQ113, FQ119,
// FQ120; docs/plans/api-b1-clubs.md, section 4), in one READ COMMITTED transaction the caller opens. A
// refusal throws `Refused`, which rolls it back, so a refused request leaves nothing, its receipt included.
//
// 1. The revision as the caller reads it (./roster-revision.ts `readRevision`, FQ119): a member the
//    revision lists, still an active member of its club. Anyone else, and a revision nobody can read (its
//    proposer has no name to show), is NOT_FOUND before the receipt is looked at, for a first request and
//    a retry alike (T14; FQ112): what can't be read can't be decided.
// 2. The receipt (T19), with the rule for a used key every roster command has (`reserveAsMember`). Then
//    the club's row, `FOR UPDATE`.
// 3. Who is asking, again, under the lock: the same interval, reading the same revision, or NOT_FOUND.
// 4. ROSTER_CHANGED with the newest revision's id when a newer one replaced this one.
// 5. VERSION_CONFLICT with `current_version` when `expected_version` isn't the revision's.
// 6. The clock, after the lock (T1).
// 7. The decision. A member decides once (the schema writes a decision once), and only an open revision
//    takes one. A request that can change nothing, on a revision that has ended, or by a member who has
//    decided already (by proposing, FQ60, or before), is answered with the revision as it stands and
//    changes nothing: the contract gives these two commands no refusal for it.
//    - Approving: the member's approval, then the roster is applied if it is ready (./apply-roster.ts):
//      every member has approved and a candidate has accepted (FQ65). CLUB_FULL should the club not hold
//      the people joining.
//    - Declining: the member's decision, then the revision ends as did-not-go-ahead, its `version` up by
//      one, and every candidate of it still open ends with it, so none holds a place on no revision. The
//      club's `roster_version` moves by one. Nothing says who declined (T33).
// 8. The answer: the revision as the caller now reads it, stored in the receipt and answered as the
//    receipt keeps it (FQ113).

import { activeMember } from "../authorization/member.ts";
import type { QuerySql } from "../authorization/read-sql.ts";
import { completeReceipt, reserveAsMember, type ReceiptKey } from "../idempotency/receipt.ts";
import type { Json } from "../idempotency/request.ts";
import { Refused } from "../refused.ts";
import type { Clock, ClockSql } from "../time/clock.ts";
import { newestRevision } from "./accept-invitation.ts";
import { applyIfReady } from "./apply-roster.ts";
import { readRevision, type RevisionSight } from "./roster-revision.ts";
import { Fault, InputFault } from "../fault.ts";

export interface RosterDecisionInput {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The `Idempotency-Key`, a UUID, created when the action started and reused on every retry. */
  readonly key: string;
  /** The path's revision. */
  readonly revisionId: string;
  /** Its version, as the caller read it. */
  readonly expectedVersion: number;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function check(input: RosterDecisionInput): void {
  if (typeof input.userId !== "string" || !ID.test(input.userId)) {
    throw new InputFault("decide_roster_1", "clubs: the caller is an account id");
  }
  if (typeof input.key !== "string" || !UUID.test(input.key)) {
    throw new InputFault("decide_roster_2", "clubs: the idempotency key is a UUID");
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new InputFault("decide_roster_3", "clubs: expected_version is a whole number from 0");
  }
}

async function decideRoster(
  tx: QuerySql & ClockSql,
  clock: Clock,
  operation: "approveRoster" | "declineRoster",
  input: RosterDecisionInput,
  render: (revision: RevisionSight) => Json,
): Promise<Json> {
  check(input);
  const { userId, revisionId } = input;
  // An id that can't be one names no revision, as one nobody has.
  if (typeof revisionId !== "string" || !ID.test(revisionId)) throw new Refused("NOT_FOUND");
  const receipt: ReceiptKey = {
    userId,
    key: input.key,
    request: {
      operation,
      path: { revision_id: revisionId },
      query: {},
      body: { expected_version: input.expectedVersion },
    },
  };

  // 1. The revision as the caller reads it.
  const seen = await readRevision(tx, userId, revisionId, await clock.sample(tx));
  if (seen === null) throw new Refused("NOT_FOUND");
  const clubId = seen.club.id;
  const asking = seen.club.membershipId;

  // 2. The receipt, then the club's row.
  const first = await reserveAsMember(tx, receipt, await clock.sample(tx), asking);
  if (first !== null) return first.replay;
  await bound(tx)`SELECT id FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;

  // 3. Who is asking: the same interval still, reading the same revision.
  if ((await activeMember(tx, userId, clubId)) !== asking) throw new Refused("NOT_FOUND");
  const before = await readRevision(tx, userId, revisionId, await clock.sample(tx));
  if (before === null) throw new Refused("NOT_FOUND");

  // 4. A newer revision. 5. The version.
  if (before.state === "superseded") {
    throw new Refused("ROSTER_CHANGED", { current_id: await newestRevision(tx, revisionId) });
  }
  if (before.version !== input.expectedVersion) {
    throw new Refused("VERSION_CONFLICT", { current_version: before.version });
  }

  // 6. The clock, after the lock.
  const at = await clock.sample(tx);

  // 7. The decision, once, and only of an open revision.
  if (before.state === "open" && before.myDecision === "pending") {
    const decision = operation === "approveRoster" ? "approved" : "declined";
    await bound(tx)`
      INSERT INTO app.roster_approvals (revision_id, interval_id, decision, implicit, decided_at)
      VALUES (${revisionId}, ${asking}, ${decision}, false, ${at}::pg_catalog.timestamptz)`;
    if (operation === "approveRoster") {
      await applyIfReady(tx, at, clubId, revisionId);
    } else {
      await bound(tx)`
        UPDATE app.candidates k SET state = 'ended', ended_at = ${at}::pg_catalog.timestamptz
          FROM app.roster_revision_candidates rc
         WHERE rc.revision_id = ${revisionId} AND rc.candidate_id = k.id AND k.state = 'open'`;
      await bound(tx)`
        UPDATE app.roster_revisions
           SET state = 'did_not_go_ahead', version = version + 1, ended_at = ${at}::pg_catalog.timestamptz
         WHERE id = ${revisionId}`;
      await bound(tx)`UPDATE app.clubs SET roster_version = roster_version + 1 WHERE id = ${clubId}`;
    }
  }

  // 8. The answer.
  const after = await readRevision(tx, userId, revisionId, at);
  if (after === null) throw new Fault("decide_roster_4", "clubs: the revision its member just decided can't be read");
  return completeReceipt(tx, receipt, render(after));
}

/**
 * Approves the revision for the account `input.userId` in `tx`, and returns what `render` makes of the
 * revision afterwards, which is also what the receipt stores and a replay returns. Throws `Refused`.
 */
export function approveRoster(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: RosterDecisionInput,
  render: (revision: RevisionSight) => Json,
): Promise<Json> {
  return decideRoster(tx, clock, "approveRoster", input, render);
}

/** Declines the revision, as `approveRoster` approves it: one decline ends it for every candidate. */
export function declineRoster(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: RosterDecisionInput,
  render: (revision: RevisionSight) => Json,
): Promise<Json> {
  return decideRoster(tx, clock, "declineRoster", input, render);
}
