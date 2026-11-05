# Slice 4's breakage run for the narrow check of the runner's rewrite

Each breakage undoes one piece of the fixes for the narrow check of `435c0e7` in the runner `tools/ops/src/migrate.ts`: a statement removed, a type left without its schema, a step moved. For each, the database is made fresh (the cluster remade, `db/bootstrap.sql` run, every migration applied by the runner), the whole database suite runs (`pnpm --filter @tadayo/tests test:db`), and the runner's unit tests run too (`pnpm --filter @tadayo/ops exec vitest run`). The verdicts:

- **CAUGHT**: at least one test failed, named below. A test that fails is one written for that rule.
- **MISSED**: every test passed.
- **BROKEN**: the change stopped a migration applying or the runner loading, so no test could judge it. Never counted as caught.

The files are restored from a copy after each breakage and at the end; afterwards each matched its SHA-256 from before the run.

- **Commit:** `f5f5e5e` on `api/b0-db`, PR #17's sixth commit (the narrow check of `435c0e7`, recorded and fixed). The run was made on its working tree just before it was committed; the journal's entry for `f5f5e5e` lists the breakages.
- **Server:** the session's PostgreSQL 16, made like `ci`'s service (ADR-026): its first role `supabase_admin`, Supabase's roles made by `tools/ci/ci_steps.py db-bootstrap`. `ci`'s Postgres 17 is the authority for the suite itself.
- **Run 6:** 11 breakages: 11 caught.

## How to run them again

1. Check out the commit above in a working tree, with Node 26 and pnpm 12.16.1 (`docs/JOURNAL.md`, block 1.1, "How to run and check everything"), and run `pnpm install`.
2. Make a server like `ci`'s on port 5432. `pgci.sh` does it for the session's PostgreSQL 16 (as root): it stops and deletes the cluster at `/var/lib/postgresql/pgci`, then `initdb --username=supabase_admin` with the password `postgres` and starts it. Any server made like `ci`'s does (`docs/LIMITATIONS.md`, the row on the session's own cluster).
3. `dbtest.sh` runs the database tests against it; with `FRESH=1` it remakes the server with `pgci.sh` beside it and runs `python3 tools/ci/ci_steps.py db-bootstrap` first. Change its `cd` to your working tree.
4. `REPO=<your working tree> python3 run6.py`, with optional words that pick breakages by name. It reads `run6-list.json` and runs `dbtest.sh` from the folder holding it, keeps its copies of the files it changes in `backup/` there, and writes `run6-results.json` there, over the published one. Each entry of the list is a name, a file and the pairs of text it replaces, every old text occurring once.

Each breakage takes about fifteen seconds on the session's machine.

## Run 6: the narrow check's fixes to the runner

### 1. T53 a cursor the file holds left open: CAUGHT

In `tools/ops/src/migrate.ts`, this:

    CLOSE ALL; DISCARD TEMP

became this:

    DISCARD TEMP

Tests that failed:

- the runner (T57) > closes a cursor the file holds and drops its temporary objects, so neither runs later (T53)

### 2. T53 the file's temporary objects kept: CAUGHT

In `tools/ops/src/migrate.ts`, this:

    CLOSE ALL; DISCARD TEMP

became this:

    CLOSE ALL

Tests that failed:

- the runner (T57) > closes a cursor the file holds and drops its temporary objects, so neither runs later (T53)

### 3. T53 the check's "char" written without its schema: CAUGHT

In `tools/ops/src/migrate.ts`, this:

    's'::pg_catalog."char" ELSE 'r'::pg_catalog."char"

became this:

    's'::"char" ELSE 'r'::"char"

Tests that failed:

- T53: the runner's check finds whatever would open the schema > never runs a type in the session's temporary schema, which comes first for type names even with the search path empty (review finding runner 2 of PR #17's second check)

### 4. T53 regrole and text written without their schema in a relation's grants: CAUGHT

In `tools/ops/src/migrate.ts`, this:

        SELECT 'app.' || relname || ' grants ' || a.privilege_type || ' to '
               || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::pg_catalog.regrole::pg_catalog.text END
          FROM relations, app, pg_catalog.aclexplode(relations.acl) a

became this:

        SELECT 'app.' || relname || ' grants ' || a.privilege_type || ' to '
               || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END
          FROM relations, app, pg_catalog.aclexplode(relations.acl) a

Tests that failed:

- T53: the runner's check finds whatever would open the schema > never runs a type in the session's temporary schema, which comes first for type names even with the search path empty (review finding runner 2 of PR #17's second check)

### 5. T53 no check after each commit: CAUGHT

In `tools/ops/src/migrate.ts`, this:

    if (after.length > 0) {

became this:

    if (after.length < 0) {

Tests that failed:

- the runner (T57) > checks the schema again after each commit, and stops loudly if something that ran at the commit opened it (T53)

### 6. T53 the ledger records the file after it runs, before the check: CAUGHT

In `tools/ops/src/migrate.ts`, this:

        await tx`
          INSERT INTO app.schema_migrations (version, name, sha256)
          VALUES (${file.version}, ${file.name}, ${file.sha256})
        `;
        await tx`SELECT pg_catalog.set_config('tadayo.migration', ${file.text}, true)`;
        await tx.unsafe("DO $run$ BEGIN EXECUTE pg_catalog.current_setting('tadayo.migration'); END $run$").simple();

became this:

        await tx`SELECT pg_catalog.set_config('tadayo.migration', ${file.text}, true)`;
        await tx.unsafe("DO $run$ BEGIN EXECUTE pg_catalog.current_setting('tadayo.migration'); END $run$").simple();
        await tx`
          INSERT INTO app.schema_migrations (version, name, sha256)
          VALUES (${file.version}, ${file.name}, ${file.sha256})
        `;

Tests that failed:

- the runner (T57) > records the file before running it, so code the file puts on the ledger runs only when the next file is recorded, before that file's check (T53)

### 7. T53 the ledger records the file after the check: CAUGHT

In `tools/ops/src/migrate.ts`, this:

        await tx`
          INSERT INTO app.schema_migrations (version, name, sha256)
          VALUES (${file.version}, ${file.name}, ${file.sha256})
        `;

became this:

    (nothing)

In `tools/ops/src/migrate.ts`, this:

      const problems = await closedProblems(tx);
      if (problems.length > 0) {
        throw new Error(`migrate: ${fileName(file)} would leave the schema app open (T53): ` + problems.join("; "));
      }

became this:

      const problems = await closedProblems(tx);
      if (problems.length > 0) {
        throw new Error(`migrate: ${fileName(file)} would leave the schema app open (T53): ` + problems.join("; "));
      }
      await tx`
          INSERT INTO app.schema_migrations (version, name, sha256)
          VALUES (${file.version}, ${file.name}, ${file.sha256})
        `;

Tests that failed:

- the runner (T57) > records the file before running it, so code the file puts on the ledger runs only when the next file is recorded, before that file's check (T53)

### 8. T53 the search path not emptied again before the check: CAUGHT

In `tools/ops/src/migrate.ts`, this:

        // Last, since the file or a deferred trigger may have set it: an operator the path finds
        // ahead of pg_catalog's would run inside the check.
        await tx`SELECT pg_catalog.set_config('search_path', '', true)`;

became this:

    (nothing)

Tests that failed:

- the runner (T57) > checks the schema with the search path empty, whatever the file set it to (T53)

### 9. T57 the deferred checks fired outside the try, so a failure there doesn't name the file: CAUGHT

In `tools/ops/src/migrate.ts`, this:

        await tx.unsafe("SET CONSTRAINTS ALL IMMEDIATE; CLOSE ALL; DISCARD TEMP").simple();

became this:

    (nothing)

In `tools/ops/src/migrate.ts`, this:

      const problems = await closedProblems(tx);
      if (problems.length > 0) {
        throw new Error(`migrate: ${fileName(file)} would leave the schema app open (T53): ` + problems.join("; "));
      }

became this:

      await tx.unsafe("SET CONSTRAINTS ALL IMMEDIATE; CLOSE ALL; DISCARD TEMP").simple();
      const problems = await closedProblems(tx);
      if (problems.length > 0) {
        throw new Error(`migrate: ${fileName(file)} would leave the schema app open (T53): ` + problems.join("; "));
      }

Tests that failed:

- the runner (T57) > names the file when its deferred checks fail, and keeps nothing of it (T57)

### 10. T57 bytes that aren't UTF-8 decoded loosely: CAUGHT

In `tools/ops/src/migrate.ts`, this:

    new TextDecoder("utf-8", { fatal: true })

became this:

    new TextDecoder("utf-8")

Tests that failed:

- readMigrations > refuses a file that isn't UTF-8, or holds a NUL, rather than run other text than it hashed (T57)

### 11. T57 a NUL character not refused: CAUGHT

In `tools/ops/src/migrate.ts`, this:

    if (text.includes("\0"))

became this:

    if (text.includes("\0") && false)

Tests that failed:

- readMigrations > refuses a file that isn't UTF-8, or holds a NUL, rather than run other text than it hashed (T57)
