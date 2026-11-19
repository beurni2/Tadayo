/// <reference lib="esnext.temporal" />
// Make a club (the contract's `createClub`; spec 04, 32; G01-create; T1, T2, T7, T19, T27; FQ17, FQ19,
// FQ54, FQ118): a proposed club with its creator's membership, in one READ COMMITTED transaction the
// caller opens. A refusal throws `Refused`, which rolls it back, so a refused request leaves nothing, its
// receipt included. Nobody is proposed here: people are proposed next (`proposeRoster`), and the club
// starts when its first roster is accepted (FQ54, FQ84).
//
// 1. The clock, once, first: making a club has no time rule, so one sample is the receipt's instant, the
//    club's `created_at` and the membership's `joined_at` (T1).
// 2. The receipt (T19): the same request under the same key gets the first club back, as it was answered,
//    and makes no second one; another request under the key is IDEMPOTENCY_CONFLICT.
// 3. The account's row, `FOR NO KEY UPDATE` (as `updateMe` takes it: the receipt's insert already holds
//    `FOR KEY SHARE` on it), so a deletion that has begun is seen: UNAUTHENTICATED (T27). An id nobody
//    has never reaches this step: the receipt's own guard has failed the request, which the gate rules out. An account with
//    no name yet is PROFILE_INCOMPLETE, as the gate answers it (FQ69): the gate has refused it already, so
//    this guards only a caller that didn't pass the gate.
// 4. The zone, in the one spelling the server resolves (`clubTimeZone`; T2, FQ19): fixed for the club's
//    life. The contract's `Timezone` has refused one the server can't resolve; one that reaches here
//    anyway is INVALID_REQUEST.
// 5. The club, then its creator's membership (`origin` creator: the one membership not made by a roster,
//    T7), with new ids that say nothing (../ids.ts). The club's `creator_interval_id` is checked at commit.
// 6. The answer: the club as its creator now reads it (./club.ts `readClub`, the read `getClub` runs), at
//    the sample of step 1, stored in the receipt without the server's instant and answered as the receipt
//    keeps it. The route adds `server_now` from the clock each time, so a replay's instant is never an old
//    one (T1), and everything else of a replay is the first answer.

import type { QuerySql } from "../authorization/read-sql.ts";
import { completeReceipt, reserveReceipt, type ReceiptKey } from "../idempotency/receipt.ts";
import type { Json } from "../idempotency/request.ts";
import { newId } from "../ids.ts";
import { Refused } from "../refused.ts";
import { clubTimeZone } from "../time/civil.ts";
import type { Clock, ClockSql, ServerNow } from "../time/clock.ts";
import { readClub, type ClubDetail } from "./club.ts";

export interface CreateClubInput {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The `Idempotency-Key`, a UUID, created when the action started and reused on every retry. */
  readonly key: string;
  /** A name the contract has checked (`ClubName`, FQ70). */
  readonly name: string;
  /** An IANA zone the contract has checked (`Timezone`), in any case. */
  readonly timezone: string;
}

export interface CreatedClub {
  /** What `render` made of the club, as the receipt keeps it: the answer without the server's instant. */
  readonly answer: Json;
  /** The clock's sample in this transaction, for the answer's `server_now`. */
  readonly at: ServerNow;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function check(input: CreateClubInput): void {
  if (typeof input.userId !== "string" || !ID.test(input.userId)) {
    throw new TypeError("clubs: the caller is an account id");
  }
  if (typeof input.key !== "string" || !UUID.test(input.key)) {
    throw new TypeError("clubs: the idempotency key is a UUID");
  }
  if (typeof input.name !== "string" || typeof input.timezone !== "string") {
    throw new TypeError("clubs: a club has a name and a time zone");
  }
}

/**
 * Makes a club for the account `input.userId` in `tx`, and returns what `render` makes of it, which is
 * also what the receipt stores and a replay returns, with the clock's sample. Throws `Refused`.
 */
export async function createClub(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: CreateClubInput,
  render: (detail: ClubDetail) => Json,
): Promise<CreatedClub> {
  check(input);
  const { userId } = input;
  const receipt: ReceiptKey = {
    userId,
    key: input.key,
    request: { operation: "createClub", path: {}, query: {}, body: { name: input.name, timezone: input.timezone } },
  };

  // 1. The clock.
  const at = await clock.sample(tx);

  // 2. The receipt.
  const first = await reserveReceipt(tx, receipt, at);
  if (first !== null) return { answer: first.replay, at };

  // 3. The account's row, which a deletion may have changed since the gate read it (T27).
  const [account] = await bound(tx)`
    SELECT state, display_name FROM app.users WHERE id = ${userId} FOR NO KEY UPDATE`;
  if (account === undefined || account["state"] !== "active") throw new Refused("UNAUTHENTICATED");
  if (typeof account["display_name"] !== "string") throw new Refused("PROFILE_INCOMPLETE");

  // 4. The zone.
  let timezone: string;
  try {
    timezone = clubTimeZone(input.timezone);
  } catch (error) {
    if (error instanceof RangeError) throw new Refused("INVALID_REQUEST", { field: "timezone" });
    throw error;
  }

  // 5. The club and its creator's membership.
  const clubId = newId("club");
  const intervalId = newId("mem");
  await bound(tx)`
    INSERT INTO app.clubs (id, name, timezone, creator_interval_id, created_at)
    VALUES (${clubId}, ${input.name}, ${timezone}, ${intervalId}, ${at}::pg_catalog.timestamptz)`;
  await bound(tx)`
    INSERT INTO app.memberships (interval_id, club_id, user_id, origin, joined_at)
    VALUES (${intervalId}, ${clubId}, ${userId}, 'creator', ${at}::pg_catalog.timestamptz)`;

  // 6. The answer.
  const detail = await readClub(tx, userId, clubId, at);
  if (detail === null) throw new Error("clubs: the club its creator just made can't be read");
  return { answer: await completeReceipt(tx, receipt, render(detail), 201), at };
}
