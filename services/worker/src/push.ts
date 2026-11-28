/// <reference lib="esnext.temporal" />
// The reveal push's plan and dispatch (spec 21; T1, T9, T36, T37, T52; FQ30; docs/plans/api-b2-spike-push.md,
// sections 2.1 to 2.3; db/migrations/0021_push.sql). The rules are the domain's (packages/domain/src/push/reveal.ts):
// who is told, when, in what words, and whether a delivery still goes. Here are the transactions, their locks, the
// clock's samples and the rows they write, and the sender's answer.
//
// A pass, after generation's in the worker's minute loop (main.ts):
// 1. The purge: each day closed more than KEEP_AFTER_CLOSE_HOURS ago loses its `push_days` row, and its deliveries
//    with it.
// 2. The plan: each day open at the clock's sample (its reveal passed, its close not) with no `push_days` row, in a
//    transaction of its own: the row (`ON CONFLICT DO NOTHING`, so a second plan, or a second worker's, writes nothing,
//    Q17), then the day's readers by the read predicate (`dayReaders`, T9, T36), then each reader's registrations
//    `FOR KEY SHARE` (a removal deleting one is waited out, and that one left out) and a delivery for each, due at the
//    reveal or the end of that device's quiet hours (`plannedDueAt`, T37). A day planned once is never planned again:
//    its readers only shrink after the reveal, which closes every add (T3), and the dispatch rechecks each.
// 3. The dispatch, one delivery at a time until none is due or the worker is told to stop, each in three short
//    transactions, so none is held open across APNs:
//    - the claim: the clock's sample, then the earliest due delivery (`pending` and unleased, or `sending` whose lease
//      has passed: a send that never reported back), `FOR UPDATE SKIP LOCKED`, leased for CLAIM_LEASE_SECONDS;
//    - the decision: the recipient's `app.users` row `FOR NO KEY UPDATE`, then the delivery's row, still under this
//      claim's lease, then the clock's sample (T1), the facts (`loadReveal`) and the domain's `decideReveal`; a skip
//      ends the row, a hold puts it back to `pending` at the end of the device's quiet hours, and a send makes it
//      `sending`, `sent_at` the sample (kept from an earlier decision that never reported back, so it counts once),
//      leased for SEND_LEASE_SECONDS;
//    - the answer, written only over that decision (the row still `sending` with its lease): `sent`; a dead token
//      `failed` with Apple's reason, its registration deleted if it still holds that token (`forgetDeadToken`); a retry
//      `pending` again after the outbox's backoff, or Apple's wait after a `5xx`, or `failed` as `closed` when that is
//      past the day's close; anything else `failed` with its reason. A failure that is no dead token is counted in
//      `app.failure_counts` as `push.<reason>`, in the transaction that writes it, so the founder's alert names it (B7).
//
// The locks: the decision takes the account's row, then the delivery's; a dead token's answer takes the sign-in's
// advisory lock, then the account's row, then the registration (whose deliveries the foreign key then sets null), then
// the delivery: 0017's order, which 0021's header gives in full. Each transaction has generation's limits on lock waits
// and statements (`limited`). A delivery whose decision fails is reported and left leased, so the pass goes on to the
// next and the lease brings it back later; the pass visits each delivery once at most.
//
// What the pass reports holds counts, opaque delivery ids and codes, never a name, a body, a token or a message (T52).

import {
  countFailures,
  dayReaders,
  decideReveal,
  forgetDeadToken,
  loadReveal,
  newId,
  plannedDueAt,
  revealPayload,
  type Clock,
  type ServerNow,
} from "@tadayo/domain";
import { Fault } from "@tadayo/domain/fault";
import type { ApnsEnvironment, ApnsOutcome, ApnsSender } from "./apns.ts";
import type { WorkerSql, WorkerTx } from "./connection.ts";
import { describeFailure } from "./generation.ts";
import { backoffSeconds, limited } from "./outbox.ts";

/** How long a claimed delivery is the claimer's alone before its decision, in seconds. */
export const CLAIM_LEASE_SECONDS = 60;
/** How long a decided delivery is the sender's alone, in seconds: past the sender's 10-second wait for Apple. */
export const SEND_LEASE_SECONDS = 60;
/** How long a day's rows are kept after it closes, in hours (the plan's section 2.1). */
export const KEEP_AFTER_CLOSE_HOURS = 48;

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
/** `push_deliveries.outcome`'s pattern (0021). */
const OUTCOME = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;

/** What the worker does with the reveal push, as TADAYO_PUSH names it: `none`, or `apns`, Apple's (the plan's 2.5). */
export type PushSetting = "none" | "apns";

/** TADAYO_PUSH's value, or a fault: unset, empty or a value the worker doesn't know (never echoed). */
export function pushSettingFor(value: string | undefined): PushSetting {
  if (value === undefined || value === "") {
    throw new Fault(
      "worker_push_1",
      "worker: TADAYO_PUSH isn't set: each environment says whether its worker sends the reveal push (none or apns)",
    );
  }
  if (value !== "none" && value !== "apns") throw new Fault("worker_push_2", "worker: TADAYO_PUSH is none or apns");
  return value;
}

export interface PushPassResult {
  /** Deliveries planned. */
  readonly planned: number;
  readonly sent: number;
  readonly skipped: number;
  /** Put back for quiet hours or a retry. */
  readonly later: number;
  /** Ended as failed, a dead token among them. */
  readonly failed: number;
  /** Each failure that isn't a dead token, and each delivery whose decision or answer threw: its id, then a code. */
  readonly failures: readonly string[];
}

/** A day's rows that closed long enough ago are deleted (the plan's section 2.1). */
async function purge(sql: WorkerSql, clock: Clock): Promise<void> {
  await limited(sql, async (tx) => {
    const at = await clock.sample(tx);
    await tx`
      DELETE FROM app.push_days d USING app.occurrences o
       WHERE o.id = d.occurrence_id AND o.close_at <= ${at.subtract({ hours: KEEP_AFTER_CLOSE_HOURS })}`;
  });
}

/** The days open at the sample whose push isn't planned yet, the earliest reveal first. */
async function unplannedDays(sql: WorkerSql, clock: Clock): Promise<string[]> {
  return limited(sql, async (tx) => {
    const at = await clock.sample(tx);
    const rows = await tx<{ id: string }[]>`
      SELECT o.id FROM app.occurrences o
       WHERE o.reveal_at <= ${at} AND o.close_at > ${at}
         AND NOT EXISTS (SELECT FROM app.push_days d WHERE d.occurrence_id = o.id)
       ORDER BY o.reveal_at, o.id`;
    return rows.map((row) => row.id);
  });
}

/** Plans the day `dayId`'s deliveries in one transaction: how many, or null when another plan has it. */
export async function planDay(sql: WorkerSql, clock: Clock, dayId: string): Promise<number | null> {
  return limited(sql, async (tx) => {
    const at = await clock.sample(tx);
    const [day] = await tx<{ reveal_at: Temporal.Instant; close_at: Temporal.Instant }[]>`
      SELECT reveal_at, close_at FROM app.occurrences WHERE id = ${dayId}`;
    if (day === undefined || Temporal.Instant.compare(day.reveal_at, at) > 0) return null;
    if (Temporal.Instant.compare(day.close_at, at) <= 0) return null;
    const claimed = await tx`
      INSERT INTO app.push_days (occurrence_id, planned_at) VALUES (${dayId}, ${at})
      ON CONFLICT (occurrence_id) DO NOTHING RETURNING 1 AS planned`;
    if (claimed.length === 0) return null;
    let planned = 0;
    for (const userId of await dayReaders(tx, dayId, at)) {
      const registrations = await tx<{ sign_in: Uint8Array; timezone: string }[]>`
        SELECT sign_in, timezone FROM app.device_registrations WHERE user_id = ${userId}
         ORDER BY sign_in FOR KEY SHARE`;
      for (const registration of registrations) {
        await tx`
          INSERT INTO app.push_deliveries (id, occurrence_id, user_id, sign_in, due_at, planned_at)
          VALUES (${newId("psh")}, ${dayId}, ${userId}, ${registration.sign_in},
                  ${plannedDueAt(day.reveal_at, registration.timezone)}, ${at})`;
        planned += 1;
      }
    }
    return planned;
  });
}

/** A claimed delivery: its id and the end of this claim's lease, which marks it. */
interface Claimed {
  readonly id: string;
  readonly leaseUntil: Temporal.Instant;
}

/** Claims the earliest due delivery, in its own transaction, or null when none is due. */
export async function claimDelivery(sql: WorkerSql, clock: Clock): Promise<Claimed | null> {
  return limited(sql, async (tx) => {
    const at = await clock.sample(tx);
    const [row] = await tx<{ id: string }[]>`
      SELECT id FROM app.push_deliveries
       WHERE (state = 'pending' AND due_at <= ${at} AND (lease_until IS NULL OR lease_until <= ${at}))
          OR (state = 'sending' AND lease_until <= ${at})
       ORDER BY due_at, id
       LIMIT 1
       FOR UPDATE SKIP LOCKED`;
    if (row === undefined) return null;
    if (!ID.test(row.id)) throw new Fault("worker_push_3", "push: a delivery came back with no id");
    const leaseUntil = at.add({ seconds: CLAIM_LEASE_SECONDS });
    await tx`UPDATE app.push_deliveries SET lease_until = ${leaseUntil} WHERE id = ${row.id}`;
    return { id: row.id, leaseUntil };
  });
}

/** What a decision hands the sender: the push, and the lease that marks the decision. */
interface Decided {
  readonly kind: "send";
  readonly userId: string;
  readonly signIn: Uint8Array;
  readonly token: string;
  readonly environment: ApnsEnvironment;
  readonly payload: string;
  readonly occurrenceId: string;
  readonly closeAt: Temporal.Instant;
  readonly attempts: number;
  readonly leaseUntil: Temporal.Instant;
}

type Decision = Decided | { readonly kind: "skipped" | "later" | "lost" };

/** The delivery's row as the decision reads it. */
interface DeliveryRow {
  readonly user_id: string;
  readonly occurrence_id: string;
  readonly sign_in: Uint8Array | null;
  readonly state: string;
  readonly lease_until: Temporal.Instant | null;
  readonly attempts: number;
}

/** Decides the claimed delivery, in its own transaction (the header's decision). */
export async function decideDelivery(sql: WorkerSql, clock: Clock, claimed: Claimed): Promise<Decision> {
  return limited(sql, async (tx) => {
    const [owner] = await tx<{ user_id: string }[]>`SELECT user_id FROM app.push_deliveries WHERE id = ${claimed.id}`;
    if (owner === undefined) return { kind: "lost" } as const;
    await tx`SELECT 1 FROM app.users WHERE id = ${owner.user_id} FOR NO KEY UPDATE`;
    const [row] = await tx<DeliveryRow[]>`
      SELECT user_id, occurrence_id, sign_in, state, lease_until, attempts FROM app.push_deliveries
       WHERE id = ${claimed.id} FOR UPDATE`;
    if (
      row === undefined ||
      (row.state !== "pending" && row.state !== "sending") ||
      row.lease_until === null ||
      !row.lease_until.equals(claimed.leaseUntil)
    ) {
      return { kind: "lost" } as const;
    }
    const now = await clock.sample(tx);
    const loaded = await loadReveal(
      tx,
      {
        dayId: row.occurrence_id,
        userId: row.user_id,
        signIn: row.sign_in,
        deliveryId: claimed.id,
        decidedBefore: row.state === "sending",
      },
      now,
    );
    if (loaded === null) return { kind: "lost" } as const;
    const decision = decideReveal(loaded.facts, now);
    if (decision.kind === "skip") {
      await tx`
        UPDATE app.push_deliveries
           SET state = 'skipped', outcome = ${decision.code}, finished_at = ${now}, lease_until = NULL, sent_at = NULL
         WHERE id = ${claimed.id}`;
      return { kind: "skipped" } as const;
    }
    if (decision.kind === "hold") {
      await tx`
        UPDATE app.push_deliveries SET state = 'pending', due_at = ${decision.until}, lease_until = NULL, sent_at = NULL
         WHERE id = ${claimed.id}`;
      return { kind: "later" } as const;
    }
    const device = loaded.device;
    if (device === null || row.sign_in === null) {
      // `decideReveal` sends only to a registered device, which `loadReveal` reads with the sign-in.
      throw new Fault("worker_push_4", "push: a send was decided with no registration");
    }
    const leaseUntil = now.add({ seconds: SEND_LEASE_SECONDS });
    const [sent] = await tx<{ attempts: number }[]>`
      UPDATE app.push_deliveries
         SET state = 'sending', sent_at = COALESCE(sent_at, ${now}), lease_until = ${leaseUntil}, attempts = attempts + 1
       WHERE id = ${claimed.id} RETURNING attempts`;
    if (sent === undefined) throw new Fault("worker_push_5", "push: a delivery went as it was decided");
    const day = loaded.facts.day;
    return {
      kind: "send",
      userId: row.user_id,
      signIn: row.sign_in,
      token: device.token,
      environment: device.environment,
      payload: JSON.stringify(revealPayload(decision.body, day.clubId, day.id)),
      occurrenceId: day.id,
      closeAt: day.closeAt,
      attempts: sent.attempts,
      leaseUntil,
    } as const;
  });
}

/** How an answer ended the delivery, if it was still the decision's to end. */
type Answered = "sent" | "later" | "dead" | "failed" | "lost";

/** Ends `id` as failed with `outcome` at `now`, over the decision marked by `leaseUntil`: whether it was. */
async function fail(
  tx: WorkerTx,
  id: string,
  leaseUntil: Temporal.Instant,
  outcome: string,
  now: ServerNow,
): Promise<boolean> {
  const failed = await tx`
    UPDATE app.push_deliveries
       SET state = 'failed', outcome = ${outcome}, finished_at = ${now}, lease_until = NULL
     WHERE id = ${id} AND state = 'sending' AND lease_until = ${leaseUntil}`;
  return failed.count > 0;
}

/** A reason as a row and a count may hold it: Apple's word or the sender's code, else `unknown`. */
function outcomeOf(reason: string): string {
  return OUTCOME.test(reason) ? reason : "unknown";
}

/** Writes Apple's answer to the decided delivery `id`, in its own transaction (the header's answer). */
export async function answerDelivery(
  sql: WorkerSql,
  clock: Clock,
  id: string,
  decided: Decided,
  outcome: ApnsOutcome,
): Promise<{ readonly answered: Answered; readonly reason: string }> {
  return limited(sql, async (tx) => {
    if (outcome.kind === "dead") {
      // The sign-in's lock and the account's row come first (0017's order), so the sample is after them too.
      await forgetDeadToken(tx, decided.userId, Buffer.from(decided.signIn).toString("hex"), decided.token);
    }
    const now = await clock.sample(tx);
    const lease = decided.leaseUntil;
    if (outcome.kind === "sent") {
      const sent = await tx`
        UPDATE app.push_deliveries SET state = 'sent', finished_at = ${now}, lease_until = NULL
         WHERE id = ${id} AND state = 'sending' AND lease_until = ${lease}`;
      return { answered: sent.count > 0 ? "sent" : "lost", reason: "" } as const;
    }
    const reason = outcomeOf(outcome.reason);
    if (outcome.kind === "dead") {
      return { answered: (await fail(tx, id, lease, reason, now)) ? "dead" : "lost", reason } as const;
    }
    if (outcome.kind === "retry") {
      const due = now.add({ seconds: Math.max(backoffSeconds(decided.attempts), outcome.waitSeconds) });
      if (Temporal.Instant.compare(due, decided.closeAt) < 0) {
        const later = await tx`
          UPDATE app.push_deliveries SET state = 'pending', due_at = ${due}, lease_until = NULL, sent_at = NULL
           WHERE id = ${id} AND state = 'sending' AND lease_until = ${lease}`;
        return { answered: later.count > 0 ? "later" : "lost", reason } as const;
      }
      // Its next try would come once the day has closed, when Apple drops it anyway (`apns-expiration`).
      if (!(await fail(tx, id, lease, "closed", now))) return { answered: "lost", reason: "closed" } as const;
      await countFailures(tx, "worker", new Map([["push.closed", 1]]));
      return { answered: "failed", reason: "closed" } as const;
    }
    if (!(await fail(tx, id, lease, reason, now))) return { answered: "lost", reason } as const;
    await countFailures(tx, "worker", new Map([[`push.${reason}`, 1]]));
    return { answered: "failed", reason } as const;
  });
}

/** The sender's answer, or a retry when the sender itself threw (it shouldn't: apns.ts resolves every failure). */
async function sendOnce(sender: ApnsSender, decided: Decided): Promise<ApnsOutcome> {
  try {
    return await sender.send({
      token: decided.token,
      environment: decided.environment,
      payload: decided.payload,
      collapseId: decided.occurrenceId,
      expiresAt: Math.floor(decided.closeAt.epochMilliseconds / 1000),
    });
  } catch {
    return { kind: "retry", status: null, reason: "sender.failed", waitSeconds: 0 };
  }
}

/**
 * One pass: the purge, the plan, then the dispatch until no delivery is due, each one visited at most once, or until
 * `stopping` answers true. Throws only when the purge, the work list or a claim can't be read; a day's plan, a
 * decision or an answer that throws is reported in `failures` and the pass goes on.
 */
export async function pushPass(
  sql: WorkerSql,
  clock: Clock,
  sender: ApnsSender,
  stopping: () => boolean = () => false,
): Promise<PushPassResult> {
  const failures: string[] = [];
  let planned = 0;
  let sent = 0;
  let skipped = 0;
  let later = 0;
  let failed = 0;
  await purge(sql, clock);
  for (const dayId of await unplannedDays(sql, clock)) {
    if (stopping()) break;
    try {
      planned += (await planDay(sql, clock, dayId)) ?? 0;
    } catch (error) {
      failures.push(`${ID.test(dayId) ? dayId : "a day with no id"}: plan: ${describeFailure(error)}`);
    }
  }
  const visited = new Set<string>();
  while (!stopping()) {
    const claimed = await claimDelivery(sql, clock);
    if (claimed === null || visited.has(claimed.id)) break;
    visited.add(claimed.id);
    try {
      const decision = await decideDelivery(sql, clock, claimed);
      if (decision.kind === "skipped") skipped += 1;
      else if (decision.kind === "later") later += 1;
      if (decision.kind !== "send") continue;
      const { answered, reason } = await answerDelivery(
        sql,
        clock,
        claimed.id,
        decision,
        await sendOnce(sender, decision),
      );
      if (answered === "sent") sent += 1;
      else if (answered === "later") later += 1;
      else if (answered === "dead") failed += 1;
      else if (answered === "failed") {
        failed += 1;
        failures.push(`${claimed.id}: ${reason}`);
      }
    } catch (error) {
      failures.push(`${claimed.id}: ${describeFailure(error)}`);
    }
  }
  return { planned, sent, skipped, later, failed, failures };
}

/** The lines a pass writes, by where each goes: nothing when nothing happened. */
export function pushLines(result: PushPassResult): { readonly out: string[]; readonly err: string[] } {
  const out: string[] = [];
  if (result.planned > 0)
    out.push(`worker: planned ${String(result.planned)} reveal ${result.planned === 1 ? "push" : "pushes"}`);
  if (result.sent + result.skipped + result.failed > 0) {
    out.push(
      `worker: reveal pushes: ${String(result.sent)} sent, ${String(result.skipped)} skipped, ${String(result.failed)} failed`,
    );
  }
  return { out, err: result.failures.map((failure) => `worker: a reveal push failed: ${failure}`) };
}
