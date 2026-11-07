# Slice 7's breakage run: the privacy matrix, the leak scanner and the API's skeleton

Each breakage is one exact change of text in one file of `api/b0-privacy`: the API's skeleton (`services/api/src/app.ts`), the matrix's rows, harness or test (`tests/src/privacy/rows.ts`, `matrix.test.ts`), the leak scanner (`tests/src/privacy/scanner.ts`), or the services' startup and connection (`services/{api,worker}/src/start.ts`, `main.ts`, `connection.ts`). For each, the tests meant to catch it run, and the breakage counts as **CAUGHT** only if they fail (a non-zero exit) **and** their output holds the words expected for that breakage (`expected pattern` in its file), so a failure for another reason doesn't count. Each file is restored after its breakage; at the end, the worktree's whole diff and every untracked file matched their SHA-256 from before the run ("worktree restored" in `summary.txt`).

- **Commit:** `6df1310` on `api/b0-privacy`, slice 7's first commit. The run was made on the working tree just before that commit, whose code and tests are the commit's; only `docs/` changed after it.
- **Server:** the session's PostgreSQL 16, made like `ci`'s service (ADR-026), with `tools/ci/ci_steps.py db-bootstrap`. `ci`'s Postgres 17 is the authority for the suites themselves.
- **Result:** 36 breakages: 36 caught, 0 missed.

## The first run

A first run, on the tree before its last changes, is in `first-run/`. It missed four. Two were real gaps, closed before the commit:

- `28 scanner-canaries-not-checked` (now `28 scanner-header-canaries-not-checked`): no test planted a value the world keeps back in a header's value, so taking the scanner's header check out passed. `scanner.test.ts`'s "catches a value the world keeps back, wherever it is (Q07)" now plants one in `date`, a header every answer may carry, and expects exactly `values header date`. `35 scanner-body-canaries-not-checked` proves the body's check the same way.
- `08 not-found-handler-left-as-fastify`: the matrix never reached the app's not-found handler, since every guessed id stayed on its operation's path (an empty id matches the route); only `services/api/src/app.test.ts` caught it. `tests/src/privacy/harness.ts` `MALFORMED` now holds a raw `/`, which leaves the operation's path, so the matrix's guessed-id step reaches the handler on every Id parameter; `harness.test.ts` "reports an app left with Fastify's own not-found answer, which a raw slash in an id reaches" proves the step. `08` now runs the matrix alone, and `36 not-found-handler-left-as-fastify-app-test` keeps `app.test.ts`'s catch.

The other two were the runner's own: `07` was caught (a `TypeError` on every role) but the expected words were wrong, and `11` was caught by a route count before the route list that names the missing route; `matrix.test.ts` now checks the list first, and both expected patterns were corrected. A breakage whose command has two parts now fails if either part fails.

## How to run them again

1. Check out the commit above in a working tree, with Node 26 and pnpm 12.16.1 (`docs/JOURNAL.md`, block 1.1, "How to run and check everything"), and run `pnpm install`.
2. Make a server like `ci`'s on port 5432 (`pgci.sh`, as root: it stops and deletes the cluster at `/var/lib/postgresql/pgci`, then `initdb --username=supabase_admin` with the password `postgres`, `ci`'s throwaway one, and starts it), then `python3 tools/ci/ci_steps.py db-bootstrap`. `FRESH=1 bash privtest.sh` does both.
3. Edit the paths at the top of `run_breakages.py`, `privtest.sh` and `dbtest.sh` (`ROOT`, `S`, the `cd`) to your working tree and this folder, then `python3 run_breakages.py`, with optional names to pick breakages. Nothing else may read or change the working tree while it runs, since it edits files in place.

Each breakage takes about a minute on the session's machine; the whole run about 40 minutes.

## The breakages

Each file holds the patch (file, old text, new text), the command, its exit code, the expected words, the verdict and the lines of the output that matter.

| # | Breakage | Verdict | Exit | File |
|---|---|---|---|---|
| 01 | `route-403-everyone` | CAUGHT | 1 | `01-route-403-everyone.txt` |
| 02 | `route-200-everyone` | CAUGHT | 1 | `02-route-200-everyone.txt` |
| 03 | `route-not-found-with-field` | CAUGHT | 1 | `03-route-not-found-with-field.txt` |
| 04 | `route-extra-header` | CAUGHT | 1 | `04-route-extra-header.txt` |
| 05 | `route-answers-the-audience-differently` | CAUGHT | 1 | `05-route-answers-the-audience-differently.txt` |
| 06 | `framework-errors-removed` | CAUGHT | 1 | `06-framework-errors-removed.txt` |
| 07 | `framework-errors-given-the-handler` | CAUGHT | 1 | `07-framework-errors-given-the-handler.txt` |
| 08 | `not-found-handler-left-as-fastify` | CAUGHT | 1 | `08-not-found-handler-left-as-fastify.txt` |
| 09 | `error-handler-echoes-the-message` | CAUGHT | 1 | `09-error-handler-echoes-the-message.txt` |
| 10 | `route-added-to-the-app` | CAUGHT | 1 | `10-route-added-to-the-app.txt` |
| 11 | `route-left-out-of-the-app` | CAUGHT | 1 | `11-route-left-out-of-the-app.txt` |
| 12 | `row-removed` | CAUGHT | 1 | `12-row-removed.txt` |
| 13 | `row-not-none` | CAUGHT | 1 | `13-row-not-none.txt` |
| 14 | `manipulation-step-not-run` | CAUGHT | 1 | `14-manipulation-step-not-run.txt` |
| 15 | `guess-step-not-run` | CAUGHT | 1 | `15-guess-step-not-run.txt` |
| 16 | `scanner-token-off-the-key-list` | CAUGHT | 1 | `16-scanner-token-off-the-key-list.txt` |
| 17 | `scanner-whitelist-widened` | CAUGHT | 1 | `17-scanner-whitelist-widened.txt` |
| 18 | `scanner-media-class-pin-removed` | CAUGHT | 1 | `18-scanner-media-class-pin-removed.txt` |
| 19 | `scanner-own-card-by-its-author-field` | CAUGHT | 1 | `19-scanner-own-card-by-its-author-field.txt` |
| 20 | `scanner-revealed-card-let-through` | CAUGHT | 1 | `20-scanner-revealed-card-let-through.txt` |
| 21 | `scanner-revealed-day-let-through` | CAUGHT | 1 | `21-scanner-revealed-day-let-through.txt` |
| 22 | `scanner-audience-check-removed` | CAUGHT | 1 | `22-scanner-audience-check-removed.txt` |
| 23 | `scanner-people-text-not-compared` | CAUGHT | 1 | `23-scanner-people-text-not-compared.txt` |
| 24 | `scanner-caption-not-compared` | CAUGHT | 1 | `24-scanner-caption-not-compared.txt` |
| 25 | `scanner-header-list-widened` | CAUGHT | 1 | `25-scanner-header-list-widened.txt` |
| 26 | `scanner-image-let-through` | CAUGHT | 1 | `26-scanner-image-let-through.txt` |
| 27 | `scanner-content-type-check-removed` | CAUGHT | 1 | `27-scanner-content-type-check-removed.txt` |
| 28 | `scanner-header-canaries-not-checked` | CAUGHT | 1 | `28-scanner-header-canaries-not-checked.txt` |
| 29 | `api-environment-defaults-to-prod` | CAUGHT | 1 | `29-api-environment-defaults-to-prod.txt` |
| 30 | `worker-environment-defaults-to-prod` | CAUGHT | 1 | `30-worker-environment-defaults-to-prod.txt` |
| 31 | `api-entry-prints-the-error-object` | CAUGHT | 1 | `31-api-entry-prints-the-error-object.txt` |
| 32 | `worker-entry-prints-the-error-object` | CAUGHT | 1 | `32-worker-entry-prints-the-error-object.txt` |
| 33 | `api-connection-without-instant-type` | CAUGHT | 1 | `33-api-connection-without-instant-type.txt` |
| 34 | `worker-connection-without-instant-type` | CAUGHT | 1 | `34-worker-connection-without-instant-type.txt` |
| 35 | `scanner-body-canaries-not-checked` | CAUGHT | 1 | `35-scanner-body-canaries-not-checked.txt` |
| 36 | `not-found-handler-left-as-fastify-app-test` | CAUGHT | 1 | `36-not-found-handler-left-as-fastify-app-test.txt` |
