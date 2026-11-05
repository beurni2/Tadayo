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
// keeps it safe behind a pooler. The ledger records the file before it runs, so no code the file
// installs runs on the runner's own insert. A file never ends that transaction itself: it runs
// as the body of one PL/pgSQL EXECUTE, where Postgres refuses BEGIN, COMMIT, ROLLBACK, SAVEPOINT
// and a procedure that commits, so such a file fails and nothing of it is kept. Then its
// deferred checks fire, a cursor it holds is closed and its temporary objects dropped, and the
// schema is checked (`applyMigration`). Code a file installs can still run at the commit (a
// deferred trigger that defers itself again), so after each commit the runner checks the schema
// again and, if it is open, stops and says so: a commit can't be undone (`migrate`). The check
// guards against mistakes in files the project writes and reviews; it isn't a sandbox.

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
const UTF8 = new TextDecoder("utf-8", { fatal: true });

/** The migrations in `dir`, in order. Any other file there, a gap or a repeated number fails. */
export async function readMigrations(dir: string): Promise<MigrationFile[]> {
  const files: MigrationFile[] = [];
  for (const entry of (await readdir(dir)).sort()) {
    const match = FILE_NAME.exec(entry);
    if (!match?.[1] || !match[2]) {
      throw new Error(`migrate: ${entry} isn't a migration; name it NNNN_words.sql (lower case)`);
    }
    const bytes = await readFile(join(dir, entry));
    // Applied exactly as hashed: bytes that aren't UTF-8 would otherwise run as U+FFFD (T57).
    let text: string;
    try {
      text = UTF8.decode(bytes);
    } catch {
      throw new Error(`migrate: ${entry} isn't UTF-8 text; save it as UTF-8`);
    }
    if (text.includes("\0")) throw new Error(`migrate: ${entry} holds a NUL character, which Postgres can't take`);
    files.push({
      version: Number(match[1]),
      name: match[2],
      sha256: createHash("sha256").update(bytes).digest("hex"),
      text,
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
 * row-level security, or with it forced, or with a policy; a relation, a column, a function or
 * procedure, or a type or domain that another role, PUBLIC included, has any privilege on;
 * anything in it owned by another role; a privilege on the schema itself; a default privilege
 * that would give another role what the owner makes later; or a trigger or rule on the ledger,
 * which would run a file's code when the runner records the next one. Empty when it's closed.
 * Every type it names carries its schema, since the session's temporary schema comes first for
 * type names even with the search path empty.
 */
export async function closedProblems(sql: postgres.Sql | postgres.TransactionSql): Promise<string[]> {
  const rows = await sql<{ problem: string }[]>`
    WITH app AS (
      SELECT oid, nspowner FROM pg_catalog.pg_namespace WHERE nspname = 'app'
    ), relations AS (
      SELECT c.oid, c.relname, c.relkind, c.relowner, c.relrowsecurity, c.relforcerowsecurity,
             COALESCE(c.relacl, pg_catalog.acldefault(
               CASE WHEN c.relkind = 'S' THEN 's'::pg_catalog."char" ELSE 'r'::pg_catalog."char" END, c.relowner)) AS acl
        FROM pg_catalog.pg_class c, app
       WHERE c.relnamespace = app.oid AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    ), routines AS (
      SELECT p.oid, p.proname, p.proowner,
             COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner)) AS acl
        FROM pg_catalog.pg_proc p, app
       WHERE p.pronamespace = app.oid
    ), types AS (
      -- Domains, enums and composite types made on their own; a table's row type and an array
      -- type follow the table's and the element's privileges.
      SELECT t.oid, t.typname, t.typowner,
             COALESCE(t.typacl, pg_catalog.acldefault('T', t.typowner)) AS acl
        FROM pg_catalog.pg_type t, app
       WHERE t.typnamespace = app.oid
         AND NOT EXISTS (SELECT FROM pg_catalog.pg_type e WHERE e.typarray = t.oid)
         AND (t.typrelid = 0 OR EXISTS (SELECT FROM pg_catalog.pg_class c WHERE c.oid = t.typrelid AND c.relkind = 'c'))
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
    SELECT 'app.' || relname || ' belongs to ' || relowner::pg_catalog.regrole::pg_catalog.text
      FROM relations, app WHERE relowner <> app.nspowner
    UNION ALL
    SELECT 'app.' || proname || ' belongs to ' || proowner::pg_catalog.regrole::pg_catalog.text
      FROM routines, app WHERE proowner <> app.nspowner
    UNION ALL
    SELECT 'app.' || relname || ' grants ' || a.privilege_type || ' to '
           || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::pg_catalog.regrole::pg_catalog.text END
      FROM relations, app, pg_catalog.aclexplode(relations.acl) a
     WHERE a.grantee NOT IN (relations.relowner, app.nspowner)
    UNION ALL
    SELECT 'app.' || proname || ' grants ' || a.privilege_type || ' to '
           || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::pg_catalog.regrole::pg_catalog.text END
      FROM routines, app, pg_catalog.aclexplode(routines.acl) a
     WHERE a.grantee NOT IN (routines.proowner, app.nspowner)
    UNION ALL
    SELECT 'app.' || relations.relname || '.' || att.attname || ' grants ' || a.privilege_type || ' to '
           || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::pg_catalog.regrole::pg_catalog.text END
      FROM relations, app, pg_catalog.pg_attribute att, pg_catalog.aclexplode(att.attacl) a
     WHERE att.attrelid = relations.oid AND att.attnum <> 0 AND NOT att.attisdropped
       AND a.grantee NOT IN (relations.relowner, app.nspowner)
    UNION ALL
    SELECT 'the type app.' || typname || ' belongs to ' || typowner::pg_catalog.regrole::pg_catalog.text
      FROM types, app WHERE typowner <> app.nspowner
    UNION ALL
    SELECT 'the type app.' || typname || ' grants ' || a.privilege_type || ' to '
           || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::pg_catalog.regrole::pg_catalog.text END
      FROM types, app, pg_catalog.aclexplode(types.acl) a
     WHERE a.grantee NOT IN (types.typowner, app.nspowner)
    UNION ALL
    SELECT 'the default privileges of ' || d.defaclrole::pg_catalog.regrole::pg_catalog.text || ' grant ' || a.privilege_type || ' on '
           || CASE d.defaclobjtype WHEN 'r' THEN 'tables' WHEN 'S' THEN 'sequences' WHEN 'f' THEN 'functions'
                                   WHEN 'T' THEN 'types' WHEN 'n' THEN 'schemas' ELSE 'objects' END
           || ' to ' || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::pg_catalog.regrole::pg_catalog.text END
      FROM pg_catalog.pg_default_acl d, app, pg_catalog.aclexplode(d.defaclacl) a
     WHERE (d.defaclnamespace = app.oid OR (d.defaclrole = app.nspowner AND d.defaclnamespace = 0))
       AND a.grantee <> d.defaclrole
    UNION ALL
    SELECT 'the schema app grants ' || a.privilege_type || ' to '
           || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::pg_catalog.regrole::pg_catalog.text END
      FROM pg_catalog.pg_namespace n, app, pg_catalog.aclexplode(
             COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
     WHERE n.oid = app.oid AND a.grantee <> app.nspowner
    UNION ALL
    SELECT 'the ledger app.schema_migrations has the trigger ' || t.tgname
      FROM pg_catalog.pg_trigger t JOIN relations r ON r.oid = t.tgrelid
     WHERE r.relname = 'schema_migrations' AND NOT t.tgisinternal
    UNION ALL
    SELECT 'the ledger app.schema_migrations has the rule ' || w.rulename
      FROM pg_catalog.pg_rewrite w JOIN relations r ON r.oid = w.ev_class
     WHERE r.relname = 'schema_migrations'
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

function fileName(file: MigrationFile): string {
  return `${String(file.version).padStart(4, "0")}_${file.name}.sql`;
}

/**
 * Runs one migration in `tx`, the transaction `migrate` opened for it under the lock, and records
 * it, or throws and leaves the transaction to roll back. The ledger records it first, so no code
 * the file installs runs on that insert. The file runs as the body of one PL/pgSQL EXECUTE, so
 * Postgres refuses any statement in it that would begin, end or split the transaction ("EXECUTE
 * of transaction commands is not implemented", or "invalid transaction termination" for a
 * procedure or DO block that commits). Then its deferred checks fire, any cursor it holds is
 * closed, so its query never runs at the commit, its temporary objects are dropped, the search
 * path is emptied again, and the schema is checked (T53). Any failure names the file.
 */
export async function applyMigration(tx: postgres.TransactionSql, file: MigrationFile): Promise<void> {
  await tx`SELECT pg_catalog.set_config('search_path', '', true)`;
  try {
    await tx`
      INSERT INTO app.schema_migrations (version, name, sha256)
      VALUES (${file.version}, ${file.name}, ${file.sha256})
    `;
    await tx`SELECT pg_catalog.set_config('tadayo.migration', ${file.text}, true)`;
    await tx.unsafe("DO $run$ BEGIN EXECUTE pg_catalog.current_setting('tadayo.migration'); END $run$").simple();
    await tx`SELECT pg_catalog.set_config('tadayo.migration', '', true)`;
    await tx.unsafe("SET CONSTRAINTS ALL IMMEDIATE; CLOSE ALL; DISCARD TEMP").simple();
    // Last, since the file or a deferred trigger may have set it: an operator the path finds
    // ahead of pg_catalog's would run inside the check.
    await tx`SELECT pg_catalog.set_config('search_path', '', true)`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/EXECUTE of transaction commands is not implemented|invalid transaction termination/.test(message)) {
      throw new Error(
        `migrate: ${fileName(file)} begins, ends or splits its transaction (${message}); the runner runs each ` +
          "file in one transaction of its own, and keeps nothing of this one (T53)",
        { cause: error },
      );
    }
    throw new Error(`migrate: ${fileName(file)} failed: ${message}`, { cause: error });
  }
  const problems = await closedProblems(tx);
  if (problems.length > 0) {
    throw new Error(`migrate: ${fileName(file)} would leave the schema app open (T53): ` + problems.join("; "));
  }
}

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
           (SELECT nspowner::pg_catalog.regrole::pg_catalog.text FROM pg_catalog.pg_namespace WHERE nspname = 'app') AS owner,
           (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user) AS superuser
  `;
  if (!who?.owner) throw new Error("migrate: there is no schema app; run db/bootstrap.sql first");
  if (who.superuser || who.me !== who.owner) {
    throw new Error(`migrate: run as ${who.owner}, the owner of the schema app, not as ${who.me} (ADR-015)`);
  }
  const done: MigrationFile[] = [];
  for (;;) {
    const next = await sql.begin(async (tx) => {
      await tx`SELECT pg_catalog.pg_advisory_xact_lock(${LOCK_KEY.toString()}::pg_catalog.int8)`;
      await tx.unsafe(LEDGER).simple();
      const applied = await tx<AppliedMigration[]>`
        SELECT version, name, sha256 FROM app.schema_migrations ORDER BY version
      `;
      const file = pendingMigrations(files, applied)[0];
      if (!file) return null;
      await applyMigration(tx, file);
      return file;
    });
    if (!next) return done;
    log(`migrate: applied ${fileName(next)}`);
    done.push(next);
    // Whatever ran at the commit, after the check (a deferred trigger that deferred itself
    // again), shows now. The commit can't be undone, so the runner stops (T53).
    const after = await sql.begin(async (tx) => {
      await tx`SELECT pg_catalog.set_config('search_path', '', true)`;
      return closedProblems(tx);
    });
    if (after.length > 0) {
      throw new Error(
        `migrate: ${fileName(next)} committed, and the schema app was open after its commit (T53): ` +
          `${after.join("; ")}; nothing more is applied: inspect the database, and close it with a migration of its own`,
      );
    }
  }
}
