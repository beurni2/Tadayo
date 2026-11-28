/// <reference lib="esnext.temporal" />
// The reveal push's plan and dispatch (spec 21; T1, T9, T36, T37, T52; FQ30; docs/plans/api-b2-spike-push.md,
// sections 2.1 to 2.3; db/migrations/0021_push.sql). The rules are the domain's (packages/domain/src/push/reveal.ts):
// who is told, when, in what words, until when Apple may deliver it, and whether a delivery still goes. Here are the
// transactions, their locks, the clock's samples and the rows they write, and the sender's answer.
//
// Each minute, after generation's pass (main.ts), `pushMinute`: the purge, whatever TADAYO_PUSH says, so a day's rows
// go even once the push is turned off; then, with `apns`, the pass. Each in a try of its own, so neither stops the
// other or the days.
// 1. The purge: each day closed more than KEEP_AFTER_CLOSE_HOURS ago loses its `push_days` row, and its deliveries
//    with it.
// 2. The plan: each day open at the clock's sample (its reveal passed, its close not) with no `push_days` row, in a
//    transaction of its own: the row (`ON CONFLICT DO NOTHING`, so a second plan, or a second worker's, writes nothing,
//    Q17), then the day's readers by the read predicate (`dayReaders`, T9, T36), then their registrations, locked in
//    0017's order (`lockDevicesOf`: the sign-ins' locks, the accounts' rows, the registrations, so a registration, a
//    removal or a move waits for the plan or the plan for it, and none deadlocks it), and a delivery for each, due at
//    the reveal or the end of that device's quiet hours (`plannedDueAt`, T37). A registration whose zone the server no
//    longer resolves is left out, reported and counted as `push.zone`; the rest are planned. A day planned once is
//    never planned again: its readers only shrink after the reveal, which closes every add (T3), and the dispatch
//    rechecks each (docs/LIMITATIONS.md says what could add one).
// 3. The dispatch, one delivery at a time until none is due or the worker is told to stop, each in three short
//    transactions:
//    - the claim: the clock's sample, then the earliest due delivery (`pending` and unleased, or `sending` whose lease
//      has passed: a send that never reported back) not yet visited by this pass, `FOR UPDATE SKIP LOCKED`, leased for
//      CLAIM_LEASE_SECONDS;
//    - the decision: the recipient's `app.users` row `FOR NO KEY UPDATE`, then the delivery's row, still under this
//      claim's lease, then the clock's sample (T1); a day closed by then ends the delivery as `closed` before anything
//      else is read, so one whose decision keeps failing ends at its day's close; else the facts (`loadReveal`) and the
//      domain's `decideReveal`. A skip ends the row, a hold puts it back to `pending` at the end of the device's quiet
//      hours, and a send makes it `sending`, leased for SEND_LEASE_SECONDS, with `sent_at` the sample, or kept when an
//      earlier decision set it inside the same budget day, so a push counts once there;
//    - the send: the delivery's row `FOR UPDATE`, still under the decision's lease and still naming its sign-in. A
//      registration deleted since the decision (a removal, a move, a deletion) has set it null, and the delivery ends
//      as skipped, `unregistered`, with nothing sent. Else the registration's token is read under the row's lock, not
//      taken from the decision, and the push goes to Apple while the row is held, so a removal or a move of that
//      registration, whose foreign key sets the row's sign-in null, waits until Apple has answered and the answer is
//      written, and no push is handed to Apple once one has landed. The answer, in the same transaction after the
//      clock's sample: `sent`; a dead token `failed` with Apple's reason; a retry `pending` again after the outbox's
//      backoff, or Apple's wait after a `5xx`, or `failed` as `closed` when that is past the day's close; anything else
//      `failed` with its reason. A failure that is no `410` is counted in `app.failure_counts` as `push.<reason>`, in
//      the transaction that writes it, so the founder's alert names it (B7). Once the transaction has let the row go, a
//      dead token's registration is deleted if it still holds that token (`forgetDeadToken`, in a transaction of its
//      own, in 0017's order).
//
// The budget (the domain's header): `sent_at` stays when an answer leaves the push's fate unknown (no answer in time,
// a lost stream: Apple may have taken it, and Q17 may then show it twice), and is cleared only when Apple's answer
// says it took nothing and this decision set it, so a push that may have reached the phone counts.
//
// The locks: the decision takes the account's row, then the delivery's; the send takes the delivery's alone, across
// APNs, for at most the sender's REQUEST_TIMEOUT_MS, under the role's 15 seconds idle in a transaction (0018) and the
// SEND_LEASE_SECONDS lease; a registration or a removal of that sign-in in the API waits for it, and past the API's
// 5-second wait for a lock answers 503, which the app tries again. 0021's header gives every writer's order. Each
// transaction has generation's limits on lock waits and statements (`limited`). A delivery whose decision or send
// throws is reported, counted as `push.failed`, and left leased, so the pass goes on to the next and the lease brings
// it back later; the pass visits each delivery once at most.
//
// What the pass reports holds counts, opaque delivery ids and codes, never a name, a body, a token or a message (T52).

import {
  countFailures,
  dayClosed,
  dayReaders,
  decideReveal,
  forgetDeadToken,
  loadReveal,
  lockDevicesOf,
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
  /** Each failure that isn't a `410`, and each day or delivery whose plan, decision or send threw: its id, a code. */
  readonly failures: readonly string[];
}

/** Counts `code` once for the founder's alert (B7), in a transaction of its own; a count that can't be written isn't. */
async function countOnce(sql: WorkerSql, code: string): Promise<void> {
  try {
    await limited(sql, (tx) => countFailures(tx, "worker", new Map([[code, 1]])));
  } catch {
    // The failure's line is written all the same.
  }
}

/** A day's rows that closed long enough ago are deleted (the plan's section 2.1). */
export async function purge(sql: WorkerSql, clock: Clock): Promise<void> {
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

/** A day's plan: the deliveries planned, and the registrations left out for a zone the server doesn't resolve. */
export interface PlannedDay {
  readonly planned: number;
  readonly unresolved: number;
}

/** Plans the day `dayId`'s deliveries in one transaction, or null when another plan has it or it isn't open. */
export async function planDay(sql: WorkerSql, clock: Clock, dayId: string): Promise<PlannedDay | null> {
  return limited(sql, async (tx) => {
    const at = await clock.sample(tx);
    const [day] = await tx<{ reveal_at: Temporal.Instant; close_at: Temporal.Instant }[]>`
      SELECT reveal_at, close_at FROM app.occurrences WHERE id = ${dayId}`;
    if (day === undefined || Temporal.Instant.compare(day.reveal_at, at) > 0) return null;
    if (dayClosed(day.close_at, at)) return null;
    const claimed = await tx`
      INSERT INTO app.push_days (occurrence_id, planned_at) VALUES (${dayId}, ${at})
      ON CONFLICT (occurrence_id) DO NOTHING RETURNING 1 AS planned`;
    if (claimed.length === 0) return null;
    let planned = 0;
    let unresolved = 0;
    for (const device of await lockDevicesOf(tx, await dayReaders(tx, dayId, at))) {
      let due: Temporal.Instant;
      try {
        due = plannedDueAt(day.reveal_at, device.timezone);
      } catch (error) {
        // registerDevice keeps only zones the server resolves; one it no longer does (a change of its zone data) is
        // left out, so the day's other devices are told.
        if (!(error instanceof RangeError)) throw error;
        unresolved += 1;
        continue;
      }
      await tx`
        INSERT INTO app.push_deliveries (id, occurrence_id, user_id, sign_in, due_at, planned_at)
        VALUES (${newId("psh")}, ${dayId}, ${device.userId}, ${device.signIn}, ${due}, ${at})`;
      planned += 1;
    }
    if (unresolved > 0) await countFailures(tx, "worker", new Map([["push.zone", unresolved]]));
    return { planned, unresolved };
  });
}

/** A claimed delivery: its id and the end of this claim's lease, which marks it. */
interface Claimed {
  readonly id: string;
  readonly leaseUntil: Temporal.Instant;
}

/** Claims the earliest due delivery that isn't one of `visited`, in its own transaction, or null when none is due. */
export async function claimDelivery(
  sql: WorkerSql,
  clock: Clock,
  visited: readonly string[] = [],
): Promise<Claimed | null> {
  return limited(sql, async (tx) => {
    const at = await clock.sample(tx);
    const [row] = await tx<{ id: string }[]>`
      SELECT id FROM app.push_deliveries
       WHERE ((state = 'pending' AND due_at <= ${at} AND (lease_until IS NULL OR lease_until <= ${at}))
              OR (state = 'sending' AND lease_until <= ${at}))
         AND id <> ALL(${tx.array([...visited])}::pg_catalog.text[])
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

/** What a decision hands the send: the push, and the lease that marks the decision. */
export interface DecidedPush {
  readonly kind: "send";
  readonly userId: string;
  readonly signIn: Uint8Array;
  readonly payload: string;
  readonly occurrenceId: string;
  readonly closeAt: Temporal.Instant;
  /** Until when Apple may deliver it: the domain's (the day's close, or the device's next 23:00). */
  readonly expiresAt: Temporal.Instant;
  readonly attempts: number;
  readonly leaseUntil: Temporal.Instant;
  /** Whether this decision set `sent_at`, so an answer that says Apple took nothing may clear it. */
  readonly ownSentAt: boolean;
}

type Decision = DecidedPush | { readonly kind: "skipped" | "later" | "lost" };

/** The delivery's row as the decision reads it, with its day's close. */
interface DeliveryRow {
  readonly user_id: string;
  readonly occurrence_id: string;
  readonly sign_in: Uint8Array | null;
  readonly state: string;
  readonly lease_until: Temporal.Instant | null;
  readonly attempts: number;
  readonly sent_at: Temporal.Instant | null;
  readonly close_at: Temporal.Instant;
}

/** Decides the claimed delivery, in its own transaction (the header's decision). */
export async function decideDelivery(sql: WorkerSql, clock: Clock, claimed: Claimed): Promise<Decision> {
  return limited(sql, async (tx) => {
    const [owner] = await tx<{ user_id: string }[]>`SELECT user_id FROM app.push_deliveries WHERE id = ${claimed.id}`;
    if (owner === undefined) return { kind: "lost" } as const;
    await tx`SELECT 1 FROM app.users WHERE id = ${owner.user_id} FOR NO KEY UPDATE`;
    const [row] = await tx<DeliveryRow[]>`
      SELECT d.user_id, d.occurrence_id, d.sign_in, d.state, d.lease_until, d.attempts, d.sent_at, o.close_at
        FROM app.push_deliveries d JOIN app.occurrences o ON o.id = d.occurrence_id
       WHERE d.id = ${claimed.id} FOR UPDATE OF d`;
    if (
      row === undefined ||
      (row.state !== "pending" && row.state !== "sending") ||
      row.lease_until === null ||
      !row.lease_until.equals(claimed.leaseUntil)
    ) {
      return { kind: "lost" } as const;
    }
    const now = await clock.sample(tx);
    const skip = async (code: string) => {
      await tx`
        UPDATE app.push_deliveries
           SET state = 'skipped', outcome = ${code}, finished_at = ${now}, lease_until = NULL
         WHERE id = ${claimed.id}`;
      return { kind: "skipped" } as const;
    };
    if (dayClosed(row.close_at, now)) return skip("closed");
    const loaded = await loadReveal(tx, { dayId: row.occurrence_id, userId: row.user_id, signIn: row.sign_in }, now);
    if (loaded === null) return { kind: "lost" } as const;
    const decision = decideReveal(loaded.facts, now);
    if (decision.kind === "skip") return skip(decision.code);
    if (decision.kind === "hold") {
      await tx`
        UPDATE app.push_deliveries SET state = 'pending', due_at = ${decision.until}, lease_until = NULL
         WHERE id = ${claimed.id}`;
      return { kind: "later" } as const;
    }
    const { device, budget } = loaded;
    if (device === null || budget === null || row.sign_in === null) {
      // `decideReveal` sends only to a registered device, which `loadReveal` reads with the sign-in, and a member with
      // a registered device has a budget day.
      throw new Fault("worker_push_4", "push: a send was decided with no registration");
    }
    // A `sent_at` an earlier decision set inside this budget day stays: the push it marks may have reached the phone,
    // and this one is the same push.
    const kept =
      row.sent_at !== null &&
      Temporal.Instant.compare(row.sent_at, budget.from) >= 0 &&
      Temporal.Instant.compare(row.sent_at, budget.until) < 0;
    const leaseUntil = now.add({ seconds: SEND_LEASE_SECONDS });
    const [sent] = await tx<{ attempts: number }[]>`
      UPDATE app.push_deliveries
         SET state = 'sending', sent_at = ${kept ? row.sent_at : now}, lease_until = ${leaseUntil},
             attempts = attempts + 1
       WHERE id = ${claimed.id} RETURNING attempts`;
    if (sent === undefined) throw new Fault("worker_push_5", "push: a delivery went as it was decided");
    const day = loaded.facts.day;
    return {
      kind: "send",
      userId: row.user_id,
      signIn: row.sign_in,
      payload: JSON.stringify(revealPayload(decision.body, day.clubId, day.id)),
      occurrenceId: day.id,
      closeAt: day.closeAt,
      expiresAt: decision.expiresAt,
      attempts: sent.attempts,
      leaseUntil,
      ownSentAt: !kept,
    } as const;
  });
}

/** How a send ended the delivery, if it was still the decision's to end. */
type Answered = "sent" | "later" | "dead" | "failed" | "skipped" | "lost";

/** A reason as a row and a count may hold it: Apple's word or the sender's code, else `unknown`. */
function outcomeOf(reason: string): string {
  return OUTCOME.test(reason) ? reason : "unknown";
}

/**
 * Whether Apple's answer says it took nothing: it answered with a status other than 200, or the request never left
 * (no connection, a token or payload refused before it). No answer in time and a lost stream leave it unknown.
 */
function tookNothing(outcome: ApnsOutcome): boolean {
  if (outcome.kind === "sent") return false;
  return outcome.status !== null || outcome.kind === "refused" || outcome.reason === "network.connection";
}

/** A registration's address, as the send reads it under the delivery's lock. */
interface Address {
  readonly apns_token: string;
  readonly apns_environment: ApnsEnvironment;
}

/** The sender's answer, or a lost stream when the sender itself threw (it shouldn't: apns.ts resolves every failure). */
async function sendOnce(sender: ApnsSender, decided: DecidedPush, to: Address): Promise<ApnsOutcome> {
  try {
    return await sender.send({
      token: to.apns_token,
      environment: to.apns_environment,
      payload: decided.payload,
      collapseId: decided.occurrenceId,
      expiresAt: Math.floor(decided.expiresAt.epochMilliseconds / 1000),
    });
  } catch {
    return { kind: "retry", status: null, reason: "sender.failed", waitSeconds: 0 };
  }
}

/**
 * Writes `outcome` over the delivery `id`, which `tx` holds under `decided`'s lease, at `now`: how it ended, and its
 * reason. A failure that is no `410` is counted (the header).
 */
async function writeAnswer(
  tx: WorkerTx,
  id: string,
  decided: DecidedPush,
  outcome: ApnsOutcome,
  now: ServerNow,
): Promise<{ readonly answered: Answered; readonly reason: string }> {
  if (outcome.kind === "sent") {
    await tx`UPDATE app.push_deliveries SET state = 'sent', finished_at = ${now}, lease_until = NULL WHERE id = ${id}`;
    return { answered: "sent", reason: "" };
  }
  // Apple took nothing: the push this decision marked never reached the phone, so it leaves the budget.
  const cleared = decided.ownSentAt && tookNothing(outcome);
  const fail = async (reason: string) => {
    await tx`
      UPDATE app.push_deliveries
         SET state = 'failed', outcome = ${reason}, finished_at = ${now}, lease_until = NULL,
             sent_at = CASE WHEN ${cleared} THEN NULL ELSE sent_at END
       WHERE id = ${id}`;
  };
  const reason = outcomeOf(outcome.reason);
  if (outcome.kind === "dead") {
    await fail(reason);
    // A `410` is the app gone from the phone, which is no fault; a `400` is a token the app sent for the wrong
    // environment or topic, which is one, so the founder hears of it.
    if (outcome.status !== 410) await countFailures(tx, "worker", new Map([[`push.${reason}`, 1]]));
    return { answered: "dead", reason };
  }
  if (outcome.kind === "retry") {
    const due = now.add({ seconds: Math.max(backoffSeconds(decided.attempts), outcome.waitSeconds) });
    if (Temporal.Instant.compare(due, decided.closeAt) < 0) {
      await tx`
        UPDATE app.push_deliveries
           SET state = 'pending', due_at = ${due}, lease_until = NULL,
               sent_at = CASE WHEN ${cleared} THEN NULL ELSE sent_at END
         WHERE id = ${id}`;
      return { answered: "later", reason };
    }
    // Its next try would come once the day has closed, when nothing more is sent for it.
    await fail("closed");
    await countFailures(tx, "worker", new Map([["push.closed", 1]]));
    return { answered: "failed", reason: "closed" };
  }
  await fail(reason);
  await countFailures(tx, "worker", new Map([[`push.${reason}`, 1]]));
  return { answered: "failed", reason };
}

/** Sends the decided delivery `id` and writes Apple's answer, holding its row across APNs (the header's send). */
export async function sendDelivery(
  sql: WorkerSql,
  clock: Clock,
  sender: ApnsSender,
  id: string,
  decided: DecidedPush,
): Promise<{ readonly answered: Answered; readonly reason: string }> {
  const { sentTo, ...answer } = await limited(sql, async (tx) => {
    const [row] = await tx<{ sign_in: Uint8Array | null; state: string; lease_until: Temporal.Instant | null }[]>`
      SELECT sign_in, state, lease_until FROM app.push_deliveries WHERE id = ${id} FOR UPDATE`;
    if (
      row === undefined ||
      row.state !== "sending" ||
      row.lease_until === null ||
      !row.lease_until.equals(decided.leaseUntil)
    ) {
      return { answered: "lost", reason: "", sentTo: null } as const;
    }
    // The token is read here, under the delivery's lock, not taken from the decision: a token that moved to another
    // sign-in since then deleted this registration first, which set the row's sign-in null, and a move that comes now
    // waits for this transaction, so the token read is this account's until Apple's answer is written (0021).
    const [to] =
      row.sign_in === null
        ? []
        : await tx<Address[]>`
            SELECT apns_token, apns_environment FROM app.device_registrations
             WHERE sign_in = ${row.sign_in} AND user_id = ${decided.userId}`;
    if (to === undefined) {
      // Its registration went after the decision: nothing goes to that device, and nothing went.
      const now = await clock.sample(tx);
      await tx`
        UPDATE app.push_deliveries
           SET state = 'skipped', outcome = 'unregistered', finished_at = ${now}, lease_until = NULL,
               sent_at = CASE WHEN ${decided.ownSentAt} THEN NULL ELSE sent_at END
         WHERE id = ${id}`;
      return { answered: "skipped", reason: "unregistered", sentTo: null } as const;
    }
    const outcome = await sendOnce(sender, decided, to);
    return { ...(await writeAnswer(tx, id, decided, outcome, await clock.sample(tx))), sentTo: to.apns_token };
  });
  if (answer.answered === "dead" && sentTo !== null) {
    // The sign-in's lock and the account's row come first (0017's order), once the delivery's row is let go.
    await limited(sql, (tx) =>
      forgetDeadToken(tx, decided.userId, Buffer.from(decided.signIn).toString("hex"), sentTo),
    );
  }
  return answer;
}

/**
 * One pass: the plan, then the dispatch until no delivery is due, each one visited at most once, or until `stopping`
 * answers true. Throws only when the work list or a claim can't be read; a day's plan, a decision or a send that
 * throws is reported in `failures`, and counted, and the pass goes on.
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
  for (const dayId of await unplannedDays(sql, clock)) {
    if (stopping()) break;
    const name = ID.test(dayId) ? dayId : "a day with no id";
    try {
      const day = await planDay(sql, clock, dayId);
      planned += day?.planned ?? 0;
      if (day !== null && day.unresolved > 0)
        failures.push(`${name}: plan: ${String(day.unresolved)} left out for a zone the server doesn't resolve`);
    } catch (error) {
      failures.push(`${name}: plan: ${describeFailure(error)}`);
      await countOnce(sql, "push.failed");
    }
  }
  const visited: string[] = [];
  while (!stopping()) {
    const claimed = await claimDelivery(sql, clock, visited);
    if (claimed === null) break;
    visited.push(claimed.id);
    try {
      const decision = await decideDelivery(sql, clock, claimed);
      if (decision.kind === "skipped") skipped += 1;
      else if (decision.kind === "later") later += 1;
      if (decision.kind !== "send") continue;
      const { answered, reason } = await sendDelivery(sql, clock, sender, claimed.id, decision);
      if (answered === "sent") sent += 1;
      else if (answered === "later") later += 1;
      else if (answered === "skipped") skipped += 1;
      else if (answered === "dead") failed += 1;
      else if (answered === "failed") {
        failed += 1;
        failures.push(`${claimed.id}: ${reason}`);
      }
    } catch (error) {
      failures.push(`${claimed.id}: ${describeFailure(error)}`);
      await countOnce(sql, "push.failed");
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

/**
 * The push's part of the worker's minute (main.ts; the header): the purge whatever the setting, then, with a sender,
 * the pass; each in a try of its own, so neither stops the other, and this never throws. Its lines, by where each goes.
 */
export async function pushMinute(
  sql: WorkerSql,
  clock: Clock,
  sender: ApnsSender | undefined,
  stopping: () => boolean = () => false,
): Promise<{ readonly out: string[]; readonly err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  try {
    await purge(sql, clock);
  } catch (error) {
    err.push(`worker: the push's purge failed: ${describeFailure(error)}`);
  }
  if (sender === undefined || stopping()) return { out, err };
  try {
    const lines = pushLines(await pushPass(sql, clock, sender, stopping));
    out.push(...lines.out);
    err.push(...lines.err);
  } catch (error) {
    err.push(`worker: a push pass failed: ${describeFailure(error)}`);
  }
  return { out, err };
}
