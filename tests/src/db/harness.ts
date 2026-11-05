// What the database tests share: their two connections, the migrations' folder, and a way to
// run a test's writes in a transaction that never commits.
//
// The ci step `db-tests` gives DATABASE_URL, which connects as `tadayo_app`, the role the API
// uses, and DATABASE_ADMIN_URL, which connects as `supabase_admin`, the superuser, only to act
// as Supabase's `anon`, `authenticated` and `service_role` (ADR-015, ADR-026).

import { join } from "node:path";
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

class RolledBack extends Error {}

/** Runs `body` in a transaction that is always rolled back, and returns what it returned. */
export async function rolledBack<T>(sql: Sql, body: (tx: Tx) => Promise<T>): Promise<T> {
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
