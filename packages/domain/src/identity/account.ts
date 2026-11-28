/// <reference lib="esnext.temporal" />
// The account behind a sign-in (spec 23; T1, T27, T53; db/migrations/0003_people_and_clubs.sql).
// Supabase Auth owns sign-in, so there is no session table: the API maps a verified token's subject
// to `app.users` on every request and reads its state, which a deletion ends at once (T27). The
// account is made on the first request a new subject's token makes; it keeps no email address, no
// phone and nothing of the token (spec 23), and its subject is never logged.
//
// `findAccount` is the hot path, one query. `createAccount` is the first sign-in: the insert is
// `ON CONFLICT (auth_subject) DO NOTHING` and the account is read again after it, so a first request
// that arrives twice, or twenty times at once, finds one row (0003's comment); a request that waited
// on another's insert reads the row it committed. `created_at` is the server clock's sample (T1).

import type { AccountState } from "../authorization/read.ts";
import type { QuerySql } from "../authorization/read-sql.ts";
import { newId } from "../ids.ts";
import type { Clock, ClockSql } from "../time/clock.ts";
import { Fault, InputFault } from "../fault.ts";

export interface Account {
  readonly id: string;
  readonly state: AccountState;
  /** The name every club sees; null until the profile has one. */
  readonly displayName: string | null;
  /** The one 18-or-older confirmation (FQ13), never taken back. */
  readonly ageConfirmed: boolean;
  /** What an edit sends as `expected_version`. */
  readonly version: number;
  /** The random content version of a ready avatar upload; null when there is none. */
  readonly avatarVersion: string | null;
}

/** A subject is the token's `sub`, a UUID; one that isn't is the caller's mistake, and never reaches Postgres. */
const SUBJECT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function checkSubject(subject: unknown): string {
  if (typeof subject !== "string" || !SUBJECT.test(subject)) {
    throw new InputFault("account_1", "identity: the subject is a lowercase UUID");
  }
  return subject;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | boolean | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

function account(row: Record<string, unknown>): Account {
  const { id, state, display_name, age_confirmed, version, avatar_version } = row;
  if (
    typeof id !== "string" ||
    (state !== "active" && state !== "deleting" && state !== "deleted") ||
    (display_name !== null && typeof display_name !== "string") ||
    typeof age_confirmed !== "boolean" ||
    typeof version !== "number" ||
    (avatar_version !== null && typeof avatar_version !== "string")
  ) {
    throw new Fault("account_2", "identity: an account came back in a shape the schema doesn't allow");
  }
  return { id, state, displayName: display_name, ageConfirmed: age_confirmed, version, avatarVersion: avatar_version };
}

/** The account of `subject`, or null when there is none (yet). A deleted shell has no subject, so none is found by one. */
export async function findAccount(sql: QuerySql, subject: string): Promise<Account | null> {
  const rows = await bound(sql)`
    SELECT u.id, u.state, u.display_name, u.age_confirmed_at IS NOT NULL AS age_confirmed, u.version,
           (SELECT up.content_version FROM app.uploads up
             WHERE up.id = u.avatar_upload_id AND up.state = 'ready') AS avatar_version
      FROM app.users u
     WHERE u.auth_subject = ${checkSubject(subject)}::pg_catalog.uuid`;
  const row = rows[0];
  return row === undefined ? null : account(row);
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The account with id `id`, or null when there is none: what a command reads back after it has written. */
export async function accountById(sql: QuerySql, id: string): Promise<Account | null> {
  if (typeof id !== "string" || !ID.test(id))
    throw new InputFault("account_3", "identity: the account id is an app.id");
  const rows = await bound(sql)`
    SELECT u.id, u.state, u.display_name, u.age_confirmed_at IS NOT NULL AS age_confirmed, u.version,
           (SELECT up.content_version FROM app.uploads up
             WHERE up.id = u.avatar_upload_id AND up.state = 'ready') AS avatar_version
      FROM app.users u
     WHERE u.id = ${id}`;
  const row = rows[0];
  return row === undefined ? null : account(row);
}

/**
 * The first sign-in: makes the account of `subject` in `tx`, a READ COMMITTED transaction, unless one
 * is there, and returns the account either way (null only if it vanished between the two statements,
 * which only a finished deletion does, and the caller then has no session).
 */
export async function createAccount(tx: QuerySql & ClockSql, clock: Clock, subject: string): Promise<Account | null> {
  const at = await clock.sample(tx);
  await bound(tx)`
    INSERT INTO app.users (id, auth_subject, created_at)
    VALUES (${newId("acct")}, ${checkSubject(subject)}::pg_catalog.uuid, ${at}::pg_catalog.timestamptz)
    ON CONFLICT (auth_subject) DO NOTHING`;
  return findAccount(tx, subject);
}
