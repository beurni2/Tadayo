/// <reference lib="esnext.temporal" />
// A sign-in's device registration for pushes, and its removal (the contract's `registerDevice` and
// `removeDevice`; spec 21, 23; T1, T14, T27, T37, T52, T55; TECH-DESIGN section 6, device registration (a) to
// (e); db/migrations/0017_devices.sql; docs/plans/api-b2-spike-push.md, section 1). Each is one command in one
// READ COMMITTED transaction the caller opens.
//
// A sign-in is named by the SHA-256 of the removal secret its app made at that sign-in (`signInOf`): the same
// secret is the same sign-in, a new secret a new one. The server keeps the hash and nothing else of the secret,
// so nothing it keeps can authorize a removal ((a)).
//
// The locks, in one order for every writer of the two tables, each taking only those it needs
// (db/migrations/0017_devices.sql names each writer's): transaction-scoped advisory locks first, then the
// account's row, then the registrations' rows. A registration
// takes its token's lock, then reads which sign-in holds the token and takes that sign-in's and its own in one
// order (the hashes', ascending), and reads the holder again under them; a removal takes its sign-in's alone.
// While a registration holds a token's lock, no other sign-in can come to hold that token (only a registration
// of the token gives it to a sign-in, and each takes its lock), so the holder it read can only have let it go
// since. Two registrations that each move the other's token so wait on one another's sign-in lock in the same
// order, and never deadlock; a registration and a removal of one sign-in never interleave, so a removal can't
// land between a registration's check of the sign-in and its write. The account's row comes after them,
// `FOR NO KEY UPDATE`, as every command of the account takes it: only the registering account's, even when the
// token moves from another account's sign-in. A removal locks no account's row. The schema's guards take the
// sign-in's lock too, which a command already holds.
//
// `registerDevice`, after the locks and the clock (T1):
// 1. The account is active (T27: a deletion may have begun since the gate read it) with a finished profile
//    (FQ69).
// 2. A sign-in that has ended, by a removal or by its token moving to a later sign-in, changes nothing: the
//    neutral NOT_FOUND ((e); T14). A secret whose registration is another account's answers the same, and
//    changes nothing ((a): the secret can do nothing else).
// 3. Another sign-in holding the token loses its registration and is ended, whichever account it was: the token
//    moves ((a), the move; (e): a late registration of that earlier sign-in now changes nothing).
// 4. This sign-in's registration is written, or its token, environment and zone replaced (each new token from
//    iOS replaces the old), with `registered_at` the clock's sample.
//
// `removeDevice`: the sign-in's registration is deleted, if it has one, and the sign-in is ended either way, so a
// registration still on its way changes nothing ((e)). "removed" when there was one; "none" otherwise, which the
// route answers with the neutral NOT_FOUND that also ends the app's removal ((d)).
//
// Each also deletes ended sign-ins older than `ENDED_KEEP`, at most `PURGE_BATCH` and only rows no other
// transaction holds, so two purges never wait on each other; and a sign-in is ended only when no row of it is
// there, a row another command's purge is deleting among them, so ending one never waits on a purge either
// (`endSignIn`).
//
// The server can't tell which of two sign-ins on one phone came first: a sign-in is a secret, and nothing it
// sends says when it began. So the app sends no registration for a new sign-in until every earlier sign-in's
// removal has ended (docs/plans/api-b2-spike-push.md, section 0): that removal ends the earlier sign-in here, and
// a registration of it that lands late then changes nothing. Without that order, an earlier sign-in's first
// registration landing after a later sign-in's would move the token back (docs/LIMITATIONS.md).
//
// The token is a device's address: it is never in a log, an error or an answer (T52, T55), and the secret never
// leaves this function but as its hash.

import { createHash } from "node:crypto";
import type { QuerySql } from "../authorization/read-sql.ts";
import { Refused } from "../refused.ts";
import { clubTimeZone } from "../time/civil.ts";
import type { Clock, ClockSql, ServerNow } from "../time/clock.ts";
import { Fault, InputFault } from "../fault.ts";

/**
 * How long an ended sign-in is kept: longer than the longest life Supabase gives an access token (one week),
 * since only a request carrying one of that sign-in's tokens can register it, so a registration that lands later
 * can't be of an ended sign-in whose row was deleted.
 */
export const ENDED_KEEP = Temporal.Duration.from({ hours: 8 * 24 });

/** The most ended sign-ins one command deletes. */
export const PURGE_BATCH = 100;

/** The contract's `RemovalSecret`: base64url, 43 to 128 characters. */
const SECRET = /^[A-Za-z0-9_-]{43,128}$/;
/** The contract's `apns_token`: hex, 16 to 512 characters, in any case. */
const TOKEN = /^[0-9a-fA-F]{16,512}$/;
/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
/** The two APNs environments a registration names (the contract's `apns_environment`). */
const ENVIRONMENTS: ReadonlySet<string> = new Set(["sandbox", "production"]);

export type ApnsEnvironment = "sandbox" | "production";

/** The sign-in a removal secret names: its SHA-256, as hex. Throws on anything but the contract's secret. */
export function signInOf(secret: string): string {
  if (typeof secret !== "string" || !SECRET.test(secret)) {
    throw new InputFault("devices_1", "devices: a removal secret is base64url, 43 to 128 characters");
  }
  return createHash("sha256").update(secret, "ascii").digest("hex");
}

/** The token as the database keeps it: lowercase hex, so one device's token is one key whatever its case. */
export function apnsTokenOf(token: string): string {
  if (typeof token !== "string" || !TOKEN.test(token)) {
    throw new InputFault("devices_2", "devices: an APNs token is hex, 16 to 512 characters");
  }
  return token.toLowerCase();
}

export interface RegisterDeviceInput {
  /** The account the gate loaded. */
  readonly userId: string;
  readonly apnsToken: string;
  readonly apnsEnvironment: ApnsEnvironment;
  /** The device's IANA zone, for its quiet hours (T37). */
  readonly timezone: string;
  readonly removalSecret: string;
}

/** The registration as stored, without the token or the secret: the contract's `DeviceRegistration` (T55). */
export interface DeviceRegistration {
  readonly apnsEnvironment: ApnsEnvironment;
  readonly timezone: string;
  readonly registeredAt: ServerNow;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | number | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** The transaction-scoped advisory lock named `name`, one 64-bit key from its text. */
async function lock(tx: QuerySql, name: string): Promise<void> {
  await bound(tx)`SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${name}, 0))`;
}

/** The lock of one token, and of one sign-in: the two kinds never share a name. */
const tokenLock = (token: string) => `tadayo.device.token:${token}`;
const signInLock = (signIn: string) => `tadayo.device.sign-in:${signIn}`;

/** Deletes ended sign-ins older than `ENDED_KEEP` at `now`, skipping any row another transaction holds. */
async function purgeEnded(tx: QuerySql, now: ServerNow): Promise<void> {
  const cut = now.subtract(ENDED_KEEP);
  await bound(tx)`
    DELETE FROM app.device_sign_ins_ended
     WHERE sign_in IN (SELECT sign_in FROM app.device_sign_ins_ended
                        WHERE ended_at < ${cut}::pg_catalog.timestamptz
                        ORDER BY ended_at LIMIT ${PURGE_BATCH}
                        FOR UPDATE SKIP LOCKED)`;
}

/**
 * Ends `signIn` at `now`: a later registration of it changes nothing ((e)). Its registration must be gone. A
 * sign-in that has a row already keeps its first ending. That includes a row another command's purge is deleting
 * and hasn't committed: an insert that met it would wait for that purge (`ON CONFLICT` waits on a row deleted
 * but not committed), and two removals whose purges each took the other's row would deadlock. Such a row is
 * past `ENDED_KEEP`, so no token of its sign-in lives to register it once it is gone.
 */
async function endSignIn(tx: QuerySql, signIn: string, now: ServerNow): Promise<void> {
  await bound(tx)`
    INSERT INTO app.device_sign_ins_ended (sign_in, ended_at)
    SELECT pg_catalog.decode(${signIn}, 'hex'), ${now}::pg_catalog.timestamptz
     WHERE NOT EXISTS (SELECT FROM app.device_sign_ins_ended WHERE sign_in = pg_catalog.decode(${signIn}, 'hex'))
    ON CONFLICT (sign_in) DO NOTHING`;
}

/** The sign-in holding `token`, as hex, or null when none does. */
async function holderOf(tx: QuerySql, token: string): Promise<string | null> {
  const [row] = await bound(tx)`
    SELECT pg_catalog.encode(sign_in, 'hex') AS sign_in FROM app.device_registrations WHERE apns_token = ${token}`;
  const holder = row?.["sign_in"];
  if (row === undefined) return null;
  if (typeof holder !== "string")
    throw new Fault("devices_3", "devices: a sign-in came back in a shape the schema doesn't allow");
  return holder;
}

/** Registers this sign-in's device, or replaces its token, environment and zone. Throws `Refused` when it can't. */
export async function registerDevice(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: RegisterDeviceInput,
): Promise<DeviceRegistration> {
  if (typeof input.userId !== "string" || !ID.test(input.userId)) {
    throw new InputFault("devices_4", "devices: the account id is an app.id");
  }
  if (!ENVIRONMENTS.has(input.apnsEnvironment)) {
    throw new InputFault("devices_5", "devices: the APNs environment is sandbox or production");
  }
  const token = apnsTokenOf(input.apnsToken);
  const signIn = signInOf(input.removalSecret);
  // The zone in the one spelling the server resolves (T37; `clubTimeZone`'s rule), before anything is locked.
  let timezone: string;
  try {
    timezone = clubTimeZone(input.timezone);
  } catch (error) {
    if (error instanceof RangeError) throw new Refused("INVALID_REQUEST", { field: "timezone" });
    throw error;
  }

  // The locks: the token's, then the holder's and this sign-in's in the hashes' order.
  await lock(tx, tokenLock(token));
  const seen = await holderOf(tx, token);
  const signIns = [...new Set([signIn, ...(seen === null ? [] : [seen])])].sort();
  for (const one of signIns) await lock(tx, signInLock(one));
  const holder = await holderOf(tx, token);
  if (holder !== null && !signIns.includes(holder)) {
    // Only a registration of this token gives it to a sign-in, and that one would wait on the token's lock.
    throw new Fault("devices_6", "devices: the token's holder changed under its lock");
  }

  // 1. The account, which a deletion may have changed since the gate read it (T27).
  const [account] = await bound(tx)`
    SELECT state, display_name, age_confirmed_at IS NOT NULL AS age_confirmed
      FROM app.users WHERE id = ${input.userId} FOR NO KEY UPDATE`;
  if (account === undefined || account["state"] !== "active") throw new Refused("UNAUTHENTICATED");
  if (typeof account["display_name"] !== "string" || account["age_confirmed"] !== true) {
    throw new Refused("PROFILE_INCOMPLETE");
  }

  const now = await clock.sample(tx);
  await purgeEnded(tx, now);

  // 2. An ended sign-in, or another account's.
  const [ended] = await bound(tx)`
    SELECT 1 AS ended FROM app.device_sign_ins_ended WHERE sign_in = pg_catalog.decode(${signIn}, 'hex')`;
  if (ended !== undefined) throw new Refused("NOT_FOUND");
  const [own] = await bound(tx)`
    SELECT user_id FROM app.device_registrations WHERE sign_in = pg_catalog.decode(${signIn}, 'hex')`;
  if (own !== undefined && own["user_id"] !== input.userId) throw new Refused("NOT_FOUND");

  // 3. The move.
  if (holder !== null && holder !== signIn) {
    await bound(tx)`DELETE FROM app.device_registrations WHERE sign_in = pg_catalog.decode(${holder}, 'hex')`;
    await endSignIn(tx, holder, now);
  }

  // 4. This sign-in's registration.
  await bound(tx)`
    INSERT INTO app.device_registrations (sign_in, user_id, apns_token, apns_environment, timezone, registered_at)
    VALUES (pg_catalog.decode(${signIn}, 'hex'), ${input.userId}, ${token}, ${input.apnsEnvironment}, ${timezone},
            ${now}::pg_catalog.timestamptz)
    ON CONFLICT (sign_in) DO UPDATE
      SET apns_token = EXCLUDED.apns_token, apns_environment = EXCLUDED.apns_environment,
          timezone = EXCLUDED.timezone, registered_at = EXCLUDED.registered_at`;
  return { apnsEnvironment: input.apnsEnvironment, timezone, registeredAt: now };
}

/**
 * Removes the registration of the sign-in `removalSecret` names and ends that sign-in: "removed" when it had
 * one, "none" otherwise. Needs no account: the secret alone authorizes it ((a)).
 */
export async function removeDevice(
  tx: QuerySql & ClockSql,
  clock: Clock,
  removalSecret: string,
): Promise<"removed" | "none"> {
  const signIn = signInOf(removalSecret);
  await lock(tx, signInLock(signIn));
  const now = await clock.sample(tx);
  await purgeEnded(tx, now);
  const removed = await bound(tx)`
    DELETE FROM app.device_registrations WHERE sign_in = pg_catalog.decode(${signIn}, 'hex') RETURNING 1 AS removed`;
  await endSignIn(tx, signIn, now);
  return removed.length > 0 ? "removed" : "none";
}
