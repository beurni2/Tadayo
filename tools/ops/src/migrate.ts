// The migration runner (docs/TECH-DESIGN.md sections 1 and 3; T53, T57; ADR-015).
//
// `db/migrations/` holds numbered SQL files, `NNNN_words.sql`, numbered from 0001 with no gap.
// They run in order as `tadayo_app`, which `db/bootstrap.sql` made and which owns the schema
// `app`, so everything they make belongs to it. Each runs in its own transaction, with the
// search path empty so that every name is written with its schema, and commits only if the
// schema is still closed to everyone but its owner afterwards (`closedProblems`). The runner
// records each one in `app.schema_migrations` with its SHA-256, and refuses to go on if a file it
// has applied has changed, or if the files don't follow on from what it applied: a migration is
// never edited once applied, and a change is a new migration that expands, migrates or contracts
// (T57). Migrations only go forward; there are no down files.
//
// Each transaction first takes a transaction-scoped advisory lock and reads what is applied, so
// two runners never apply the same file, and the lock never outlives its transaction, which
// keeps it safe behind a pooler.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type postgres from "postgres";

export interface MigrationFile {
  readonly version: number;
  readonly name: string;
  readonly sha256: string;
  readonly text: string;
}

export interface AppliedMigration {
  readonly version: number;
  readonly name: string;
  readonly sha256: string;
}

const FILE_NAME = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
// pg_advisory_xact_lock's key: the bytes of "tadayo:m" read as a bigint, fixed so every runner
// takes the same lock.
const LOCK_KEY = 0x746164_61796f3a6dn;

/** The migrations in `dir`, in order. Any other file there, a gap or a repeated number fails. */
export async function readMigrations(dir: string): Promise<MigrationFile[]> {
  const files: MigrationFile[] = [];
  for (const entry of (await readdir(dir)).sort()) {
    const match = FILE_NAME.exec(entry);
    if (!match?.[1] || !match[2]) {
      throw new Error(`migrate: ${entry} isn't a migration; name it NNNN_words.sql (lower case)`);
    }
    const bytes = await readFile(join(dir, entry));
    files.push({
      version: Number(match[1]),
      name: match[2],
      sha256: createHash("sha256").update(bytes).digest("hex"),
      text: bytes.toString("utf8"),
    });
  }
  files.forEach((file, index) => {
    if (file.version !== index + 1) {
      throw new Error(
        `migrate: expected migration ${String(index + 1).padStart(4, "0")}, found ` +
          `${String(file.version).padStart(4, "0")}_${file.name}.sql: number them from 0001 with no gap or repeat`,
      );
    }
  });
  return files;
}

/**
 * The files still to apply, given what the database has applied. Every applied migration must
 * still be its file, unchanged, and the applied ones must be the first ones (T57).
 */
export function pendingMigrations(
  files: readonly MigrationFile[],
  applied: readonly AppliedMigration[],
): MigrationFile[] {
  applied.forEach((row, index) => {
    const file = files[index];
    if (row.version !== index + 1) {
      throw new Error(`migrate: the database's migrations don't run from 1 with no gap (at ${String(row.version)})`);
    }
    if (!file) {
      throw new Error(
        `migrate: the database has migration ${String(row.version)} (${row.name}), and db/migrations has no such file`,
      );
    }
    if (file.name !== row.name || file.sha256 !== row.sha256) {
      throw new Error(
        `migrate: migration ${String(row.version)} (${row.name}) has changed since it was applied; ` +
          "write a new migration instead (T57)",
      );
    }
  });
  return files.slice(applied.length);
}

/**
 * What would open the schema `app` to anyone but its owner (T53, ADR-015): a table without
 * row-level security, or with it forced, or with a policy; a relation, function or procedure that
 * another role, PUBLIC included, has any privilege on; anything in it owned by another role; or a
 * privilege on the schema itself. Empty when it's closed.
 */
export async function closedProblems(sql: postgres.Sql | postgres.TransactionSql): Promise<string[]> {
  const rows = await sql<{ problem: string }[]>`
    WITH app AS (
      SELECT oid, nspowner FROM pg_catalog.pg_namespace WHERE nspname = 'app'
    ), relations AS (
      SELECT c.oid, c.relname, c.relkind, c.relowner, c.relrowsecurity, c.relforcerowsecurity,
             COALESCE(c.relacl, pg_catalog.acldefault(
               CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner)) AS acl
        FROM pg_catalog.pg_class c, app
       WHERE c.relnamespace = app.oid AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    ), routines AS (
      SELECT p.oid, p.proname, p.proowner,
             COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner)) AS acl
        FROM pg_catalog.pg_proc p, app
       WHERE p.pronamespace = app.oid
    )
    SELECT 'the table app.' || relname || ' has no row-level security' AS problem
      FROM relations WHERE relkind IN ('r', 'p') AND NOT relrowsecurity
    UNION ALL
    SELECT 'the table app.' || relname || ' forces row-level security'
      FROM relations WHERE relkind IN ('r', 'p') AND relforcerowsecurity
    UNION ALL
    SELECT 'the table app.' || c.relname || ' has the policy ' || pol.polname
      FROM pg_catalog.pg_policy pol JOIN relations c ON c.oid = pol.polrelid
    UNION ALL
    SELECT 'app.' || relname || ' belongs to ' || relowner::regrole::text
      FROM relations, app WHERE relowner <> app.nspowner
    UNION ALL
    SELECT 'app.' || proname || ' belongs to ' || proowner::regrole::text
      FROM routines, app WHERE proowner <> app.nspowner
    UNION ALL
    SELECT 'app.' || relname || ' grants ' || a.privilege_type || ' to '
           || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END
      FROM relations, app, pg_catalog.aclexplode(relations.acl) a
     WHERE a.grantee NOT IN (relations.relowner, app.nspowner)
    UNION ALL
    SELECT 'app.' || proname || ' grants ' || a.privilege_type || ' to '
           || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END
      FROM routines, app, pg_catalog.aclexplode(routines.acl) a
     WHERE a.grantee NOT IN (routines.proowner, app.nspowner)
    UNION ALL
    SELECT 'the schema app grants ' || a.privilege_type || ' to '
           || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END
      FROM pg_catalog.pg_namespace n, app, pg_catalog.aclexplode(
             COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
     WHERE n.oid = app.oid AND a.grantee <> app.nspowner
    UNION ALL
    SELECT 'there is no schema app; run db/bootstrap.sql first' WHERE NOT EXISTS (SELECT FROM app)
    ORDER BY 1
  `;
  return rows.map((row) => row.problem);
}

const LEDGER = `
  CREATE TABLE IF NOT EXISTS app.schema_migrations (
    version integer PRIMARY KEY CHECK (version > 0),
    name text NOT NULL,
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    applied_at timestamptz NOT NULL DEFAULT pg_catalog.now()
  );
  ALTER TABLE app.schema_migrations ENABLE ROW LEVEL SECURITY;
`;

/**
 * Applies every pending migration in `dir`, one transaction each, and returns those it applied.
 * It must run as the owner of the schema `app` (`tadayo_app`), never as a superuser.
 */
export async function migrate(
  sql: postgres.Sql,
  dir: string,
  log: (line: string) => void = () => undefined,
): Promise<MigrationFile[]> {
  const files = await readMigrations(dir);
  const [who] = await sql<{ me: string; owner: string | null; superuser: boolean }[]>`
    SELECT current_user AS me,
           (SELECT nspowner::regrole::text FROM pg_catalog.pg_namespace WHERE nspname = 'app') AS owner,
           (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user) AS superuser
  `;
  if (!who?.owner) throw new Error("migrate: there is no schema app; run db/bootstrap.sql first");
  if (who.superuser || who.me !== who.owner) {
    throw new Error(`migrate: run as ${who.owner}, the owner of the schema app, not as ${who.me} (ADR-015)`);
  }
  const done: MigrationFile[] = [];
  for (;;) {
    const next = await sql.begin(async (tx) => {
      await tx`SELECT pg_catalog.pg_advisory_xact_lock(${LOCK_KEY.toString()}::bigint)`;
      await tx.unsafe(LEDGER).simple();
      const applied = await tx<AppliedMigration[]>`
        SELECT version, name, sha256 FROM app.schema_migrations ORDER BY version
      `;
      const file = pendingMigrations(files, applied)[0];
      if (!file) return null;
      await tx`SELECT pg_catalog.set_config('search_path', '', true)`;
      await tx.unsafe(file.text).simple();
      await tx`SELECT pg_catalog.set_config('search_path', '', true)`;
      const problems = await closedProblems(tx);
      if (problems.length > 0) {
        throw new Error(
          `migrate: ${String(file.version).padStart(4, "0")}_${file.name}.sql would leave the schema app open (T53): ` +
            problems.join("; "),
        );
      }
      await tx`
        INSERT INTO app.schema_migrations (version, name, sha256)
        VALUES (${file.version}, ${file.name}, ${file.sha256})
      `;
      return file;
    });
    if (!next) return done;
    log(`migrate: applied ${String(next.version).padStart(4, "0")}_${next.name}.sql`);
    done.push(next);
  }
}
