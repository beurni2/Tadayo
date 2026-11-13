/// <reference lib="esnext.temporal" />
// The account's profile (spec 23; T1, T14, T19, T27; FQ13, FQ69, FQ74; the contract's `updateMe`): the
// one confirmation that the person is 18 or older (FQ13: `true` only, never taken back, no birthdate),
// the name every club sees and the avatar. The first command, so it sets the pattern of TECH-DESIGN
// section 5, in one READ COMMITTED transaction the caller opens (a refusal throws `Refused`, which
// rolls it back, so a refused request leaves nothing, its receipt included). The name is one the contract
// has checked, a lone surrogate included (`DisplayName`; Postgres would keep one as U+FFFD), as every
// name rule is (FQ70). Then:
// 1. reserve the idempotency receipt: a key seen before replays its stored response when the request is
//    the same, and is IDEMPOTENCY_CONFLICT when it isn't (T19);
// 2. lock the account's row, `FOR NO KEY UPDATE`. The receipt's own insert has already taken `FOR KEY SHARE`
//    on it (its actor guard, db/migrations/0009_platform.sql), and two requests of one account that each
//    went on from KEY SHARE to `FOR UPDATE` would wait for each other for ever;
// 3. the clock is sampled once, first: `updateMe` has no time rule (the sample is the receipt's `created_at`
//    and the instant of the age confirmation), unlike the commands whose cutoffs it must read after their
//    locks (T3);
// 4. the version the caller read must be the account's now (VERSION_CONFLICT with the current one);
// 5. the changes, each judged against the account as it stands: a name or an avatar is taken only once the
//    age is confirmed, in this request or before (INVALID_REQUEST with that field); an avatar must be a
//    ready upload of the caller's own made as one: no such upload is NOT_FOUND, the same for a guessed id
//    and for another account's (T14), and one not ready yet is MEDIA_NOT_READY;
// 6. only a field that changes counts: no change writes nothing and moves no version, any change moves it
//    by one; the receipt is completed with the response, which is answered as the receipt keeps it (a replay
//    is then the first answer byte for byte), and the transaction commits.

import type { QuerySql } from "../authorization/read-sql.ts";
import { replayOutcome, requestHash, type IdempotentRequest, type Json } from "../idempotency/request.ts";
import { Refused } from "../refused.ts";
import type { Clock, ClockSql } from "../time/clock.ts";
import { accountById, type Account } from "./account.ts";

/** The request's fields, as the contract's `UpdateMeRequest` names them. Only the fields sent change. */
export interface ProfileEdit {
  /** The version the caller read. */
  readonly expected_version: number;
  /** A name the contract has checked (FQ70), well formed. */
  readonly display_name?: string;
  /** Only `true` means anything, and the contract refuses anything else. */
  readonly age_confirmed?: boolean;
  /** A ready upload of the caller's own, made as an avatar. */
  readonly avatar_upload_id?: string;
}

export interface UpdateMeInput {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The `Idempotency-Key`, a UUID, created when the action started and reused on every retry. */
  readonly key: string;
  readonly edit: ProfileEdit;
}

type Bound<R> = (
  template: TemplateStringsArray,
  ...values: readonly (string | boolean | null | Temporal.Instant)[]
) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function check(input: UpdateMeInput): void {
  const { userId, key, edit } = input;
  if (typeof userId !== "string" || !ID.test(userId)) throw new TypeError("identity: the caller is an account id");
  if (typeof key !== "string" || !UUID.test(key)) throw new TypeError("identity: the idempotency key is a UUID");
  if (!Number.isInteger(edit.expected_version) || edit.expected_version < 0) {
    throw new TypeError("identity: expected_version is a whole number from 0");
  }
  if (edit.avatar_upload_id !== undefined && !ID.test(edit.avatar_upload_id)) {
    throw new TypeError("identity: the avatar upload is an upload id");
  }
}

/**
 * Edits the caller's profile in `tx`, a READ COMMITTED transaction, and returns the response `render` makes
 * of the account afterwards, which is also what the receipt stores and a replay returns. Throws `Refused`.
 */
export async function updateMe(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: UpdateMeInput,
  render: (account: Account) => Json,
): Promise<Json> {
  check(input);
  const { userId, key, edit } = input;
  // The request as the receipt knows it: only what the contract names, in the body's own JSON.
  const body: { [field: string]: Json } = { expected_version: edit.expected_version };
  if (edit.display_name !== undefined) body["display_name"] = edit.display_name;
  if (edit.age_confirmed !== undefined) body["age_confirmed"] = edit.age_confirmed;
  if (edit.avatar_upload_id !== undefined) body["avatar_upload_id"] = edit.avatar_upload_id;
  const request: IdempotentRequest = { operation: "updateMe", path: {}, query: {}, body };

  // 1. The receipt.
  const at = await clock.sample(tx);
  const reserved = await bound(tx)`
    INSERT INTO app.idempotency_receipts (actor_user_id, operation, idempotency_key, request_hash, created_at)
    VALUES (${userId}, 'updateMe', ${key}::pg_catalog.uuid, ${requestHash(request)}, ${at}::pg_catalog.timestamptz)
    ON CONFLICT (actor_user_id, operation, idempotency_key) DO NOTHING
    RETURNING 1 AS reserved`;
  if (reserved.length === 0) {
    const [receipt] = await bound(tx)`
      SELECT request_hash, state, response_body FROM app.idempotency_receipts
       WHERE actor_user_id = ${userId} AND operation = 'updateMe' AND idempotency_key = ${key}::pg_catalog.uuid`;
    // A receipt commits only completed (0009), so one that conflicted is whole, unless a purge took it
    // between the two statements, which the caller answers with an error and its retry reserves anew.
    if (receipt === undefined || receipt["state"] !== "completed" || typeof receipt["request_hash"] !== "string") {
      throw new Error("identity: the receipt of a replayed key is gone");
    }
    if (replayOutcome(receipt["request_hash"], request) !== "replay") throw new Refused("IDEMPOTENCY_CONFLICT");
    return receipt["response_body"] as Json;
  }

  // 2. The account's row, which a deletion may have changed since the gate read it (T27).
  const [row] = await bound(tx)`
    SELECT state, version, age_confirmed_at IS NOT NULL AS age_confirmed, display_name, avatar_upload_id
      FROM app.users WHERE id = ${userId} FOR NO KEY UPDATE`;
  if (row === undefined || row["state"] !== "active") throw new Refused("UNAUTHENTICATED");

  // 4. The version.
  const version = row["version"];
  if (typeof version !== "number") throw new Error("identity: an account came back without its version");
  if (version !== edit.expected_version) throw new Refused("VERSION_CONFLICT", { current_version: version });

  // 5. The changes.
  const confirmsAge = edit.age_confirmed === true && row["age_confirmed"] !== true;
  const ageKnown = row["age_confirmed"] === true || confirmsAge;
  let name: string | null = null;
  if (edit.display_name !== undefined) {
    if (!ageKnown) throw new Refused("INVALID_REQUEST", { field: "display_name" });
    if (edit.display_name !== row["display_name"]) name = edit.display_name;
  }
  let avatar: string | null = null;
  if (edit.avatar_upload_id !== undefined) {
    if (!ageKnown) throw new Refused("INVALID_REQUEST", { field: "avatar_upload_id" });
    const [upload] = await bound(tx)`
      SELECT state FROM app.uploads
       WHERE id = ${edit.avatar_upload_id} AND owner_user_id = ${userId} AND purpose = 'avatar'`;
    if (upload === undefined) throw new Refused("NOT_FOUND");
    if (upload["state"] !== "ready") throw new Refused("MEDIA_NOT_READY");
    if (edit.avatar_upload_id !== row["avatar_upload_id"]) avatar = edit.avatar_upload_id;
  }

  // 6. Write only what changes, and answer.
  if (confirmsAge || name !== null || avatar !== null) {
    await bound(tx)`
      UPDATE app.users
         SET age_confirmed_at = CASE WHEN ${confirmsAge}::pg_catalog.bool THEN ${at}::pg_catalog.timestamptz
                                     ELSE age_confirmed_at END,
             display_name = CASE WHEN ${name !== null}::pg_catalog.bool THEN ${name}::pg_catalog.text
                                 ELSE display_name END,
             avatar_upload_id = CASE WHEN ${avatar !== null}::pg_catalog.bool THEN ${avatar}::pg_catalog.text
                                     ELSE avatar_upload_id END,
             version = version + 1
       WHERE id = ${userId}`;
  }
  const now = await accountById(tx, userId);
  if (now === null) throw new Error("identity: the account vanished under its own lock");
  // The answer is what the receipt keeps, read back from it (jsonb orders a body's keys its own way), so a
  // replay is the first answer byte for byte, not only the same fields.
  const [completed] = await bound(tx)`
    UPDATE app.idempotency_receipts
       SET state = 'completed', response_status = 200,
           response_body = ${JSON.stringify(render(now))}::pg_catalog.text::pg_catalog.jsonb
     WHERE actor_user_id = ${userId} AND operation = 'updateMe' AND idempotency_key = ${key}::pg_catalog.uuid
    RETURNING response_body`;
  if (completed === undefined) throw new Error("identity: the receipt this request reserved is gone");
  return completed["response_body"] as Json;
}
