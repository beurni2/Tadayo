/// <reference lib="esnext.temporal" />
// The receipt of one command (T19; db/migrations/0009_platform.sql), as `updateMe` first wrote it inline
// (../identity/update-me.ts): reserved in the command's own transaction before anything is changed, and
// completed last, so it exists only with the effect it records, and a refusal, which rolls the transaction
// back, leaves none. A command whose answer names other people first checks that its caller may have one
// (../schedule/command.ts, step 1; FQ112).

import type { QuerySql } from "../authorization/read-sql.ts";
import { Refused } from "../refused.ts";
import type { ServerNow } from "../time/clock.ts";
import { replayOutcome, requestHash, type IdempotentRequest, type Json } from "./request.ts";

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

export interface ReceiptKey {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The `Idempotency-Key`, a UUID. */
  readonly key: string;
  /** The request as the receipt knows it; its `operation` is the contract's operation id. */
  readonly request: IdempotentRequest;
}

/**
 * Reserves the receipt at `at`, the clock's sample. Null when this request is the first under its key.
 * Otherwise the stored answer of the same request, as a replay; another request under the key throws
 * `Refused` IDEMPOTENCY_CONFLICT. A send that arrives while the first is still at work waits here for it.
 */
export async function reserveReceipt(
  tx: QuerySql,
  { userId, key, request }: ReceiptKey,
  at: ServerNow,
): Promise<{ readonly replay: Json } | null> {
  const reserved = await bound(tx)`
    INSERT INTO app.idempotency_receipts (actor_user_id, operation, idempotency_key, request_hash, created_at)
    VALUES (${userId}, ${request.operation}, ${key}::pg_catalog.uuid, ${requestHash(request)},
            ${at}::pg_catalog.timestamptz)
    ON CONFLICT (actor_user_id, operation, idempotency_key) DO NOTHING
    RETURNING 1 AS reserved`;
  if (reserved.length > 0) return null;
  const [receipt] = await bound(tx)`
    SELECT request_hash, state, response_body FROM app.idempotency_receipts
     WHERE actor_user_id = ${userId} AND operation = ${request.operation}
       AND idempotency_key = ${key}::pg_catalog.uuid`;
  // A receipt commits only completed (0009), so one that conflicted is whole, unless a purge took it
  // between the two statements, which the caller answers with an error and its retry reserves anew.
  if (receipt === undefined || receipt["state"] !== "completed" || typeof receipt["request_hash"] !== "string") {
    throw new Error("idempotency: the receipt of a replayed key is gone");
  }
  if (replayOutcome(receipt["request_hash"], request) !== "replay") throw new Refused("IDEMPOTENCY_CONFLICT");
  return { replay: receipt["response_body"] as Json };
}

/**
 * Whether the receipt was reserved once the membership interval `interval` had begun. A club command asks
 * before it answers a replay: an answer stored for an earlier interval of the same account, which has
 * since left and joined again, isn't the new interval's to read (FQ112's default), since it names what
 * that earlier interval could see. The receipt's `created_at` and the interval's `joined_at` are both the
 * server clock's samples.
 */
export async function reservedSince(
  tx: QuerySql,
  { userId, key, request }: ReceiptKey,
  interval: string,
): Promise<boolean> {
  const [found] = await bound(tx)`
    SELECT 1 AS found
      FROM app.idempotency_receipts r
      JOIN app.memberships m ON m.interval_id = ${interval} AND m.user_id = r.actor_user_id
     WHERE r.actor_user_id = ${userId} AND r.operation = ${request.operation}
       AND r.idempotency_key = ${key}::pg_catalog.uuid AND r.created_at >= m.joined_at`;
  return found !== undefined;
}

/**
 * Reserves the receipt for a club command whose caller's present membership interval is `interval`: as
 * `reserveReceipt` does, but a key whose receipt an earlier interval of the account made names nothing to
 * this one, for the same request and for another alike (FQ112): `Refused` NOT_FOUND, never the stored
 * answer and never IDEMPOTENCY_CONFLICT, which would say the key was used.
 */
export async function reserveAsMember(
  tx: QuerySql,
  receipt: ReceiptKey,
  at: ServerNow,
  interval: string,
): Promise<{ readonly replay: Json } | null> {
  let first: { readonly replay: Json } | null;
  try {
    first = await reserveReceipt(tx, receipt, at);
  } catch (error) {
    if (error instanceof Refused && error.code === "IDEMPOTENCY_CONFLICT") {
      if (!(await reservedSince(tx, receipt, interval))) throw new Refused("NOT_FOUND");
    }
    throw error;
  }
  if (first !== null && !(await reservedSince(tx, receipt, interval))) throw new Refused("NOT_FOUND");
  return first;
}

/**
 * Completes the receipt with `body` and returns the answer as the receipt keeps it (jsonb orders a body's
 * keys its own way), so a replay is the first answer byte for byte, not only the same fields. `status` is
 * the contract's success status of the operation, 201 where it makes something.
 */
export async function completeReceipt(
  tx: QuerySql,
  { userId, key, request }: ReceiptKey,
  body: Json,
  status: 200 | 201 = 200,
): Promise<Json> {
  const [completed] = await bound(tx)`
    UPDATE app.idempotency_receipts
       SET state = 'completed', response_status = ${String(status)}::pg_catalog.int2,
           response_body = ${JSON.stringify(body)}::pg_catalog.text::pg_catalog.jsonb
     WHERE actor_user_id = ${userId} AND operation = ${request.operation}
       AND idempotency_key = ${key}::pg_catalog.uuid
    RETURNING response_body`;
  if (completed === undefined) throw new Error("idempotency: the receipt this request reserved is gone");
  return completed["response_body"] as Json;
}
