/// <reference lib="esnext.temporal" />
// The steps a choice and a confirmation share (docs/plans/api-b2-schedule.md, section 4; TECH-DESIGN
// section 5; T1, T3's order, T9, T14, T19, T33), in one READ COMMITTED transaction the caller opens. A
// refusal throws `Refused`, which rolls it back, so a refused request leaves nothing, its receipt included.
//
// 1. The proposal's club, read by the proposal's id with no lock; the caller's membership of it
//    (`activeMember`); and that the proposal includes that membership (FQ100). Someone with nothing of the
//    club or of the proposal never holds the club's row and never gets a stored answer: NOT_FOUND comes
//    before the receipt is looked at (T14; FQ112's default), for a first request and a retry alike.
// 2. The receipt (T19): the same request under the same key gets the first answer back, as it was, though
//    the week has changed since; another request under it is IDEMPOTENCY_CONFLICT. Then the club's row,
//    `FOR UPDATE`: every schedule command of a club takes it first, so a choice and a confirmation of the
//    same day are in one order, the one `schedule_versions_insert_guard` and `memberships_guard` take too.
// 3. Who is asking, again, now that nothing of the club's schedule can change under the lock: the week is
//    read through the authorization module (./week.ts). No proposal, no membership, a suspended club, or a
//    membership the proposal doesn't include (FQ100): NOT_FOUND, each the same answer (T14).
// 4. MEMBERSHIP_CHANGED with `current_id` when a newer proposal replaced this one.
// 5. VERSION_CONFLICT with `current_version` when `expected_version` isn't the proposal's.
// 6. The clock, sampled after the lock (T1; T3's order). The receipt's own `created_at` is an earlier
//    sample, which decides nothing.
// 7. The rule, which the command passes in: NOT_ALLOWED, or the change. A proposal that has ended with no
//    successor (applied, or superseded with the club paused) takes no change: NOT_ALLOWED.
// 8. The answer: the proposal as the caller now sees it, read again after the change and made by the same
//    `answerOf` the read uses, stored in the receipt and answered as the receipt keeps it.

import { activeMember } from "../authorization/member.ts";
import type { QuerySql } from "../authorization/read-sql.ts";
import { completeReceipt, reserveReceipt, type ReceiptKey } from "../idempotency/receipt.ts";
import type { Json } from "../idempotency/request.ts";
import { Refused } from "../refused.ts";
import type { Clock, ClockSql, ServerNow } from "../time/clock.ts";
import type { Weekday } from "./propose.ts";
import { answerOf, loadWeek, type LoadedProposal, type LoadedWeek, type ProposalAnswer } from "./week.ts";

export interface ScheduleCommandInput {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The `Idempotency-Key`, a UUID, created when the action started and reused on every retry. */
  readonly key: string;
  /** The path's proposal. */
  readonly proposalId: string;
  /** The version the caller read. */
  readonly expectedVersion: number;
  /** The request's weekdays, as sent. */
  readonly weekdays: readonly Weekday[];
}

/** What the rule of step 7 is given: the week under the club's lock, and the clock's sample after it. */
export interface ScheduleStep {
  readonly tx: QuerySql;
  readonly at: ServerNow;
  readonly week: LoadedWeek;
  readonly proposal: LoadedProposal;
  /** The caller's membership interval, which the proposal includes. */
  readonly callerId: string;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly string[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function check(input: ScheduleCommandInput): void {
  if (typeof input.userId !== "string" || !ID.test(input.userId)) {
    throw new TypeError("schedule: the caller is an account id");
  }
  if (typeof input.key !== "string" || !UUID.test(input.key)) {
    throw new TypeError("schedule: the idempotency key is a UUID");
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new TypeError("schedule: expected_version is a whole number from 0");
  }
  if (!Array.isArray(input.weekdays) || input.weekdays.some((weekday) => typeof weekday !== "string")) {
    throw new TypeError("schedule: the weekdays are a list of weekdays");
  }
}

/**
 * Runs one schedule command in `tx` and returns the response `render` makes of the proposal afterwards,
 * which is also what the receipt stores and a replay returns. Throws `Refused`.
 */
export async function scheduleCommand(
  tx: QuerySql & ClockSql,
  clock: Clock,
  operation: "chooseScheduleDays" | "confirmScheduleDays",
  input: ScheduleCommandInput,
  render: (proposal: ProposalAnswer) => Json,
  rule: (step: ScheduleStep) => Promise<void>,
): Promise<Json> {
  check(input);
  const { userId, proposalId } = input;
  // An id that can't be one names no proposal, as one nobody has.
  if (typeof proposalId !== "string" || !ID.test(proposalId)) throw new Refused("NOT_FOUND");
  const receipt: ReceiptKey = {
    userId,
    key: input.key,
    request: {
      operation,
      path: { proposal_id: proposalId },
      query: {},
      body: { expected_version: input.expectedVersion, weekdays: [...input.weekdays] },
    },
  };

  // 1. The proposal's club, and the caller's membership of it.
  const [named] = await bound(tx)`SELECT club_id FROM app.schedule_proposals WHERE id = ${proposalId}`;
  const clubId = named?.["club_id"];
  if (typeof clubId !== "string") throw new Refused("NOT_FOUND");
  const member = await activeMember(tx, userId, clubId);
  if (member === null) throw new Refused("NOT_FOUND");
  const [included] = await bound(tx)`
    SELECT 1 AS found FROM app.schedule_proposal_members WHERE proposal_id = ${proposalId} AND interval_id = ${member}`;
  if (included === undefined) throw new Refused("NOT_FOUND");

  // 2. The receipt, then the club's row.
  const first = await reserveReceipt(tx, receipt, await clock.sample(tx));
  if (first !== null) return first.replay;
  await bound(tx)`SELECT id FROM app.clubs WHERE id = ${clubId} FOR UPDATE`;

  // 3. Who is asking.
  const week = await loadWeek(tx, userId, clubId, { id: proposalId });
  const proposal = week?.proposal ?? null;
  if (week === null || proposal === null) throw new Refused("NOT_FOUND");
  const callerId = week.membershipId;
  if (!proposal.facts.members.some((member) => member.id === callerId)) throw new Refused("NOT_FOUND");

  // 4. A newer proposal.
  if (proposal.replacedBy !== null) throw new Refused("MEMBERSHIP_CHANGED", { current_id: proposal.replacedBy });

  // 5. The version.
  if (proposal.version !== input.expectedVersion) {
    throw new Refused("VERSION_CONFLICT", { current_version: proposal.version });
  }

  // 6. The clock, after the lock.
  const at = await clock.sample(tx);

  // 7. The rule.
  if (proposal.state !== "open") throw new Refused("NOT_ALLOWED");
  await rule({ tx, at, week, proposal, callerId });

  // 8. The answer.
  const after = (await loadWeek(tx, userId, clubId, { id: proposalId }))?.proposal ?? null;
  if (after === null) throw new Error("schedule: the proposal vanished under its club's lock");
  return completeReceipt(tx, receipt, render(answerOf(after, callerId)));
}
