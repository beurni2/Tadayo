# Slice 4's breakage runs for the check of PR #17's fixes

Each breakage is one change to one migration in `db/migrations/`, or to the runner `tools/ops/src/migrate.ts`, that turns off one guard or one clause of one, or puts back `cc62976`'s version of a rule the check found too strict. For each, the database is made fresh (the cluster remade, `db/bootstrap.sql` run, every migration applied by the runner) and the whole database suite runs (`pnpm --filter @tadayo/tests test:db`); a change to the runner also runs its unit tests (`pnpm --filter @tadayo/ops exec vitest run`). The verdicts:

- **CAUGHT**: at least one test failed, named below. A test that fails is one written for that rule.
- **MISSED**: every test passed.
- **BROKEN**: the change stopped a migration applying or the runner loading, so no test could judge it. Never counted as caught.

The files are restored from a copy after each breakage and at the end; afterwards, `git diff` showed only the commit's own changes.

- **Commit:** `435c0e7` on `api/b0-db`, PR #17's third commit (the check of the review's fixes). The runs were made on its working tree just before it was committed.
- **Server:** the session's PostgreSQL 16, made like `ci`'s service (ADR-026): its first role `supabase_admin`, Supabase's roles made by `tools/ci/ci_steps.py db-bootstrap`. `ci`'s Postgres 17 is the authority for the suite itself.
- **Run 5:** 17 breakages: 17 caught. "T53 ledger recorded after the check" was missed in the full run, because the check of the ledger's triggers and rules covered every way the tests had to run code on the ledger's insert; a check constraint on the ledger is another, so the test `checks the schema after the file's deferred triggers have run and the ledger has recorded it (T53)` now adds one that grants to `anon`, and that breakage alone was run again and caught (its entry below is that run).

## How to run them again

1. Check out the commit above in a working tree, with Node 26 and pnpm 12.16.1 (`docs/JOURNAL.md`, block 1.1, "How to run and check everything"), and run `pnpm install`.
2. Make a server like `ci`'s on port 5432. `pgci.sh` does it for the session's PostgreSQL 16 (as root): it stops and deletes the cluster at `/var/lib/postgresql/pgci`, then `initdb --username=supabase_admin` with the password `postgres` and starts it. Any server made like `ci`'s does (`docs/LIMITATIONS.md`, the row on the session's own cluster).
3. `dbtest.sh` runs the database tests against it; with `FRESH=1` it remakes the server with `pgci.sh` beside it and runs `python3 tools/ci/ci_steps.py db-bootstrap` first. Change its `cd` to your working tree.
4. `python3 run5.py`, with optional words that pick breakages by name. Change `REPO` at its top to your working tree. It reads `run5-list.json` and runs `dbtest.sh` from the folder holding it, keeps its copies of the files it changes in `backup/` there, and writes `run5-results.json` there, over the published one.

Each run takes about ten seconds a breakage on the session's machine.

## Run 5: the check's fixes to the runner and the guards

### 1. T53 file run directly, not through EXECUTE: CAUGHT

In `tools/ops/src/migrate.ts`, this:

    await tx.unsafe("DO $run$ BEGIN EXECUTE pg_catalog.current_setting('tadayo.migration'); END $run$").simple();

became this:

    await tx.unsafe(file.text).simple();

Tests that failed:

- the runner (T57) > checks the schema after the file's deferred triggers have run and the ledger has recorded it (T53)
- the runner (T57) > rolls back a migration that begins, ends or splits its transaction, keeping nothing of it (T53)
- the runner (T57) > rolls back a migration that fails part way, with nothing of it left
- the runner (T57) > rolls back a migration that names a table without its schema
- the runner (T57) > runs a function whose body is BEGIN ATOMIC ... END, whatever its statements end with

### 2. T53 transaction commands not named: CAUGHT

In `tools/ops/src/migrate.ts`, this:

    if (/EXECUTE of transaction commands is not implemented|invalid transaction termination/.test(message)) {

became this:

    if (/a message Postgres never sends/.test(message)) {

Tests that failed:

- the runner (T57) > rolls back a migration that begins, ends or splits its transaction, keeping nothing of it (T53)

### 3. T53 deferred checks left to the commit: CAUGHT

In `tools/ops/src/migrate.ts`, this:

      await tx`SET CONSTRAINTS ALL IMMEDIATE`;
    

became this:

    (nothing: the lines were removed)

Tests that failed:

- T53: anon, authenticated and service_role read nothing > gives anon no privilege on the schema or anything in it
- T53: anon, authenticated and service_role read nothing > leaves the schema closed after every migration
- T53: the runner's check finds whatever would open the schema > a default privilege that would grant what the owner makes later
- T53: the runner's check finds whatever would open the schema > a function made after migration 0001 isn't PUBLIC's to execute
- T53: the runner's check finds whatever would open the schema > a grant on a column, which a grant on the table doesn't show (review finding privacy 3 of PR #17)
- T53: the runner's check finds whatever would open the schema > a grant on a system column, such as ctid, xmin or tableoid (review finding privacy 5 of PR #17's check)
- T53: the runner's check finds whatever would open the schema > a grant on a table, a sequence, a function or the schema, to an API role or PUBLIC
- T53: the runner's check finds whatever would open the schema > a grant on a type or domain
- T53: the runner's check finds whatever would open the schema > a policy
- T53: the runner's check finds whatever would open the schema > a table that forces it
- T53: the runner's check finds whatever would open the schema > a table without row-level security
- T53: the runner's check finds whatever would open the schema > a trigger or a rule on the ledger, which would run after the check
- T53: the runner's check finds whatever would open the schema > a type made after migration 0001 isn't PUBLIC's to use
- T53: the runner's check finds whatever would open the schema > an object another role owns
- the runner (T57) > checks the schema after the file's deferred triggers have run and the ledger has recorded it (T53)
- the runner (T57) > rolls back a migration that fails part way, with nothing of it left
- the runner (T57) > rolls back a migration that names a table without its schema

### 4. T53 schema checked before the deferred checks and the ledger: CAUGHT

In `tools/ops/src/migrate.ts`, this:

      await tx`SET CONSTRAINTS ALL IMMEDIATE`;
      await tx`
        INSERT INTO app.schema_migrations (version, name, sha256)
        VALUES (${file.version}, ${file.name}, ${file.sha256})
      `;
      const problems = await closedProblems(tx);
      if (problems.length > 0) {
        throw new Error(`migrate: ${fileName(file)} would leave the schema app open (T53): ` + problems.join("; "));
      }

became this:

      const problems = await closedProblems(tx);
      if (problems.length > 0) {
        throw new Error(`migrate: ${fileName(file)} would leave the schema app open (T53): ` + problems.join("; "));
      }
      await tx`SET CONSTRAINTS ALL IMMEDIATE`;
      await tx`
        INSERT INTO app.schema_migrations (version, name, sha256)
        VALUES (${file.version}, ${file.name}, ${file.sha256})
      `;

Tests that failed:

- the runner (T57) > checks the schema after the file's deferred triggers have run and the ledger has recorded it (T53)
- the runner (T57) > rolls back a migration that fails part way, with nothing of it left
- the runner (T57) > rolls back a migration that names a table without its schema

### 5. T53 ledger recorded after the check: CAUGHT

In `tools/ops/src/migrate.ts`, this:

      await tx`
        INSERT INTO app.schema_migrations (version, name, sha256)
        VALUES (${file.version}, ${file.name}, ${file.sha256})
      `;
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

Note: missed in the full run, because the ledger's trigger and rule check covers a trigger or rule; a check constraint on the ledger isn't one, so the test `checks the schema after the file's deferred triggers have run and the ledger has recorded it (T53)` now adds one that grants, and this breakage alone was run again and caught (this entry is that run).

Tests that failed:

- the runner (T57) > checks the schema after the file's deferred triggers have run and the ledger has recorded it (T53)
- the runner (T57) > rolls back a migration that fails part way, with nothing of it left
- the runner (T57) > rolls back a migration that names a table without its schema

### 6. T53 ledger trigger not checked: CAUGHT

In `tools/ops/src/migrate.ts`, this:

         WHERE r.relname = 'schema_migrations' AND NOT t.tgisinternal

became this:

         WHERE r.relname = 'schema_migrations' AND NOT t.tgisinternal AND false

Tests that failed:

- T53: the runner's check finds whatever would open the schema > a trigger or a rule on the ledger, which would run after the check
- the runner (T57) > checks the schema after the file's deferred triggers have run and the ledger has recorded it (T53)
- the runner (T57) > rolls back a migration that fails part way, with nothing of it left
- the runner (T57) > rolls back a migration that names a table without its schema

### 7. T53 ledger rule not checked: CAUGHT

In `tools/ops/src/migrate.ts`, this:

          FROM pg_catalog.pg_rewrite w JOIN relations r ON r.oid = w.ev_class
         WHERE r.relname = 'schema_migrations'

became this:

          FROM pg_catalog.pg_rewrite w JOIN relations r ON r.oid = w.ev_class
         WHERE r.relname = 'schema_migrations' AND false

Tests that failed:

- T53: the runner's check finds whatever would open the schema > a trigger or a rule on the ledger, which would run after the check

### 8. T53 system columns' grants not checked: CAUGHT

In `tools/ops/src/migrate.ts`, this:

         WHERE att.attrelid = relations.oid AND att.attnum <> 0 AND NOT att.attisdropped

became this:

         WHERE att.attrelid = relations.oid AND att.attnum > 0 AND NOT att.attisdropped

Tests that failed:

- T53: the runner's check finds whatever would open the schema > a grant on a system column, such as ctid, xmin or tableoid (review finding privacy 5 of PR #17's check)

### 9. T3 highlight change keeps its instant: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

        IF NEW.updated_at <= OLD.updated_at THEN
          RAISE EXCEPTION 'app.highlights: every change carries the instant it was made, later than the last (T1, T3)'

became this:

        IF false THEN
          RAISE EXCEPTION 'app.highlights: every change carries the instant it was made, later than the last (T1, T3)'

Tests that failed:

- T22: a highlight points to the contributor's own active drop, before the reveal > judges every change at its own instant, later than the last (T1, T3)

### 10. T3 highlight change at the same instant: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

        IF NEW.updated_at <= OLD.updated_at THEN

became this:

        IF NEW.updated_at < OLD.updated_at THEN

Tests that failed:

- T22: a highlight points to the contributor's own active drop, before the reveal > judges every change at its own instant, later than the last (T1, T3)

### 11. T3 drop's new replacement needs no instant: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

                OR (NEW.pending_upload_id IS NOT NULL AND NEW.pending_upload_id IS DISTINCT FROM OLD.pending_upload_id)) THEN
          RAISE EXCEPTION 'app.drops: a change to a drop''s content or state carries the instant it was made (T1, T3)'

became this:

                OR false) THEN
          RAISE EXCEPTION 'app.drops: a change to a drop''s content or state carries the instant it was made (T1, T3)'

Tests that failed:

- T3: the reveal is the cutoff > lets a replacement nobody committed go at any instant, and takes no new one from the reveal on (spec 09, T3)

### 12. T3 drop takes a new replacement after the reveal: CAUGHT

In `db/migrations/0006_contributions.sql`, this:

                OR (NEW.pending_upload_id IS NOT NULL AND NEW.pending_upload_id IS DISTINCT FROM OLD.pending_upload_id)) THEN
          RAISE EXCEPTION 'app.drops: the day opened at %, so the drop is frozen (T3)', reveal

became this:

                OR false) THEN
          RAISE EXCEPTION 'app.drops: the day opened at %, so the drop is frozen (T3)', reveal

Tests that failed:

- T3: the reveal is the cutoff > lets a replacement nobody committed go at any instant, and takes no new one from the reveal on (spec 09, T3)

### 13. spec 09 replacement can't be let go after the reveal (cc62976's freeze): CAUGHT

In `db/migrations/0006_contributions.sql`, this:

                OR (NEW.pending_upload_id IS NOT NULL AND NEW.pending_upload_id IS DISTINCT FROM OLD.pending_upload_id)) THEN
          RAISE EXCEPTION 'app.drops: the day opened at %, so the drop is frozen (T3)', reveal

became this:

                OR NEW.pending_upload_id IS DISTINCT FROM OLD.pending_upload_id) THEN
          RAISE EXCEPTION 'app.drops: the day opened at %, so the drop is frozen (T3)', reveal

Tests that failed:

- T3: the reveal is the cutoff > lets a replacement nobody committed go at any instant, and takes no new one from the reveal on (spec 09, T3)

### 14. spec 09 letting a replacement go needs an instant (cc62976's rule): CAUGHT

In `db/migrations/0006_contributions.sql`, this:

                OR (NEW.pending_upload_id IS NOT NULL AND NEW.pending_upload_id IS DISTINCT FROM OLD.pending_upload_id)) THEN
          RAISE EXCEPTION 'app.drops: a change to a drop''s content or state carries the instant it was made (T1, T3)'

became this:

                OR NEW.pending_upload_id IS DISTINCT FROM OLD.pending_upload_id) THEN
          RAISE EXCEPTION 'app.drops: a change to a drop''s content or state carries the instant it was made (T1, T3)'

Tests that failed:

- T3: the reveal is the cutoff > lets a replacement nobody committed go at any instant, and takes no new one from the reveal on (spec 09, T3)

### 15. T7 revision member row updated: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

      IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'roster_revision_members') THEN

became this:

      IF TG_OP = 'DELETE' THEN

Tests that failed:

- T7: an exact roster, sealed when it is made > never changes a revision's member rows, sealed or not (T7)

### 16. FQ84 rename revision needs its departed proposer (cc62976's seal): CAUGHT

In `db/migrations/0004_rosters.sql`, this:

      IF revision.origin = 'proposal'
         AND NOT EXISTS

became this:

      IF NOT EXISTS

Tests that failed:

- T7: an exact roster, sealed when it is made > seals a revision the server made for a name though the candidate's proposer has left, and a member's proposal only with its proposer (FQ84)

### 17. T7 proposal sealed without its proposer: CAUGHT

In `db/migrations/0004_rosters.sql`, this:

      IF revision.origin = 'proposal'
         AND NOT EXISTS

became this:

      IF false
         AND NOT EXISTS

Tests that failed:

- T7: an exact roster, sealed when it is made > refuses a revision made without its seal, its proposer or a candidate
- T7: an exact roster, sealed when it is made > seals a revision the server made for a name though the candidate's proposer has left, and a member's proposal only with its proposer (FQ84)

