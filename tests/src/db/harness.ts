/// <reference lib="esnext.temporal" />
// What the database tests share: their two connections, the migrations' folder, and a way to
// run a test's writes in a transaction that never commits.
//
// The ci step `db-tests` gives DATABASE_URL, which connects as `tadayo_app`, the role the API
// uses, and DATABASE_ADMIN_URL, which connects as `supabase_admin`, the superuser, only to act
// as Supabase's `anon`, `authenticated` and `service_role` (ADR-015, ADR-026).

import { join } from "node:path";
import { INSTANT_TYPE } from "@tadayo/domain";
import postgres from "postgres";
import { expect } from "vitest";

export const MIGRATIONS = join(import.meta.dirname, "..", "..", "..", "db", "migrations");

function url(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`set ${name}, as the ci step db-tests does (tools/ci/ci_steps.py)`);
  return value;
}

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

export function appSql(): Sql {
  return postgres(url("DATABASE_URL"), { max: 2, onnotice: () => undefined });
}

export function adminSql(): Sql {
  return postgres(url("DATABASE_ADMIN_URL"), { max: 2, onnotice: () => undefined });
}

/**
 * A connection as the commands will have it (slice 7 makes the API's): `tadayo_app`, with the
 * time module's INSTANT_TYPE for `timestamptz`, so an instant crosses whole, to the microsecond.
 */
export function commandSql() {
  return postgres(url("DATABASE_URL"), { max: 2, onnotice: () => undefined, types: { instant: INSTANT_TYPE } });
}

/**
 * commandSql's connection, which also takes world.ts's Dates for the rows a test builds, each a
 * whole second: for a test that builds a world and then runs the code under test on it, in one
 * transaction. An instant the code under test binds still goes through INSTANT_TYPE, and every
 * timestamptz still comes back as a Temporal.Instant.
 */
// world.ts's helpers take the plain transaction's type, so a test hands them this one cast.
export type WorldTypes = { instant: Temporal.Instant };
export type WorldTx = postgres.TransactionSql<WorldTypes>;

export function worldSql(max = 2): postgres.Sql<WorldTypes> {
  const instant = {
    ...INSTANT_TYPE,
    serialize: (value: Temporal.Instant | Date) =>
      value instanceof Date ? value.toISOString() : INSTANT_TYPE.serialize(value),
  };
  return postgres(url("DATABASE_URL"), { max, onnotice: () => undefined, types: { instant } });
}

/**
 * A connection set up halfway, for the tests that it fails loudly: instants sent through
 * INSTANT_TYPE, but each timestamptz read back with postgres.js's own type, as a Date.
 */
export function halfInstantSql() {
  return postgres(url("DATABASE_URL"), {
    max: 2,
    onnotice: () => undefined,
    types: { instant: { ...INSTANT_TYPE, from: [] } },
  });
}

class RolledBack extends Error {}

/** Runs `body` in a transaction that is always rolled back, and returns what it returned. */
export async function rolledBack<T, Types extends Record<string, unknown>>(
  sql: postgres.Sql<Types>,
  body: (tx: postgres.TransactionSql<Types>) => Promise<T>,
): Promise<T> {
  let result: { value: T } | undefined;
  try {
    await sql.begin(async (tx) => {
      result = { value: await body(tx) };
      throw new RolledBack();
    });
  } catch (error) {
    if (!(error instanceof RolledBack)) throw error;
  }
  if (!result) throw new Error("rolledBack: the body didn't finish");
  return result.value;
}

/**
 * Runs `statement` in a savepoint and expects Postgres to refuse it with `code` (and, when
 * given, a message matching `message`). The transaction goes on after it.
 */
export async function expectRefused(
  tx: Tx,
  code: string,
  statement: (sp: Tx) => Promise<unknown>,
  message?: RegExp,
): Promise<void> {
  let caught: unknown;
  try {
    await tx.savepoint(async (sp) => {
      await statement(sp);
    });
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected Postgres to refuse with ${code}`).toBeInstanceOf(postgres.PostgresError);
  const error = caught as postgres.PostgresError;
  expect(error.code, error.message).toBe(code);
  if (message) expect(error.message).toMatch(message);
}

/** Postgres's error codes the tests expect. */
export const REFUSED = {
  privilege: "42501",
  unique: "23505",
  foreignKey: "23503",
  check: "23514",
  notNull: "23502",
  exclusion: "23P01",
  raised: "P0001",
  /** What the schema's own triggers raise (db/migrations/0002_shared_rules.sql). */
  integrity: "23000",
} as const;
