# Slice 7's breakage run at the review's fixes: the privacy matrix, the leak scanner and the API's skeleton

Each breakage is one exact change of text in one file of `api/b0-privacy`: the API's skeleton and entry (`services/api/src/app.ts`, `start.ts`), the matrix's rows, harness or test (`tests/src/privacy/rows.ts`, `harness.ts`, `matrix.test.ts`), the leak scanner (`tests/src/privacy/scanner.ts`), or the services' startup and connection (`services/{api,worker}/src/start.ts`, `main.ts`, `connection.ts`). For each, the tests meant to catch it run, and the breakage counts as **CAUGHT** only if they fail (a non-zero exit) **and** their output holds the words expected for that breakage (`expected pattern` in its file): the name of the test meant to catch it, the count that must come out, or the finding's own words, so a failure for another reason doesn't count. Each file is restored after its breakage; at the end, the worktree's whole diff and every untracked file matched their SHA-256 from before the run ("worktree restored" in `summary.txt`).

- **Commit:** `247873d` on `api/b0-privacy` (PR #27), the commit that records the PR's independent review and its privacy and security review, and their fixes. The run was made on the working tree just before that commit, whose code and tests are the commit's; only `docs/` changed after it.
- **Server:** the session's PostgreSQL 16, made like `ci`'s service (ADR-026), with `tools/ci/ci_steps.py db-bootstrap`. `ci`'s Postgres 17 is the authority for the suites themselves.
- **Result:** 63 breakages: 63 caught, 0 missed.
- **What's new since `6df1310`'s run** (`api/b0-privacy/6df1310/breakages/`): its 36 breakages, each moved to the new code where its anchor changed (the error handler's body, the manipulation step's author, the scanner's checks now judged from the viewer's side), and 27 new for the review's fixes (37 to 63): 19 on the scanner (people, days and clubs of other clubs, names and captions, drop references by schema, who reacted, error fields, the 404 body, `Retry-After`, empty answers' `Cache-Control`, kept-back values by phase and viewer, day references, the highlight pointer's exception, the highlight entry's author), 5 on the harness (optional ids, cursors, malformed ids beside other ids, signed-out answers compared, the two new headers), the matrix's signed-out step, the API's client-error handler and its `PORT`.
- **Expected words:** every breakage's pattern now names the test meant to catch it, or the count that must come out, where 39 had asked only for `FAIL` or any assertion.

## The first run of these 63

A first run, on the tree before its last change, is in `first-run/`. It missed two, both closed before this run:

- `19 scanner-own-card-by-its-author-field`: the review's fixes check every card's author against the world's, so any card whose `author` field and the world's author disagree is already a finding, and the own-card test's loose assertion (some `world` finding) passed with or without the breakage. The scanner's verdict is the same either way; the test didn't prove what its name says. `scanner.test.ts` "judges an own card by the world's author, never by the card's own author field" now pins it: Cleo's drop as Ben's own card is named someone else's (`$.drops[0]`) and keeps no exception from the key check (`keys` and `world`).
- `59 harness-signed-out-answers-not-compared`: caught by its test, "reports a route that tells a signed-out caller which drops exist (T14)", but vitest cut the expected words ("another answer for fresh ids") short in its assertion message. The pattern now names the test.

## How to run them again

1. Check out the commit above in a working tree, with Node 26 and pnpm 12.16.1 (`docs/JOURNAL.md`, block 1.1, "How to run and check everything"), and run `pnpm install`.
2. Make a server like `ci`'s on port 5432 (`pgci.sh`, as root: it stops and deletes the cluster at `/var/lib/postgresql/pgci`, then `initdb --username=supabase_admin` with the password `postgres`, `ci`'s throwaway one, and starts it), then `python3 tools/ci/ci_steps.py db-bootstrap`. `FRESH=1 bash privtest.sh` does both.
3. Edit the paths at the top of `run_breakages.py`, `privtest.sh` and `dbtest.sh` (`ROOT`, `S`, the `cd`) to your working tree and this folder, then `python3 run_breakages.py`, with optional names to pick breakages. Nothing else may read or change the working tree while it runs, since it edits files in place.

The whole run takes about 15 minutes on the session's machine; `06` (the matrix with `frameworkErrors` removed) about 5 of them.

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
| 37 | `scanner-person-of-any-club` | CAUGHT | 1 | `37-scanner-person-of-any-club.txt` |
| 38 | `scanner-person-name-not-compared` | CAUGHT | 1 | `38-scanner-person-name-not-compared.txt` |
| 39 | `scanner-day-of-any-club` | CAUGHT | 1 | `39-scanner-day-of-any-club.txt` |
| 40 | `scanner-club-of-anyone` | CAUGHT | 1 | `40-scanner-club-of-anyone.txt` |
| 41 | `scanner-drop-references-not-read` | CAUGHT | 1 | `41-scanner-drop-references-not-read.txt` |
| 42 | `scanner-own-reference-taken-as-readable` | CAUGHT | 1 | `42-scanner-own-reference-taken-as-readable.txt` |
| 43 | `scanner-reference-before-the-reveal` | CAUGHT | 1 | `43-scanner-reference-before-the-reveal.txt` |
| 44 | `scanner-who-reacted-to-anyone` | CAUGHT | 1 | `44-scanner-who-reacted-to-anyone.txt` |
| 45 | `scanner-error-fields-not-checked` | CAUGHT | 1 | `45-scanner-error-fields-not-checked.txt` |
| 46 | `scanner-404-body-checked-only-on-the-skeleton` | CAUGHT | 1 | `46-scanner-404-body-checked-only-on-the-skeleton.txt` |
| 47 | `scanner-retry-after-not-required` | CAUGHT | 1 | `47-scanner-retry-after-not-required.txt` |
| 48 | `scanner-empty-answer-any-cache-control` | CAUGHT | 1 | `48-scanner-empty-answer-any-cache-control.txt` |
| 49 | `scanner-kept-back-values-always-shown` | CAUGHT | 1 | `49-scanner-kept-back-values-always-shown.txt` |
| 50 | `scanner-kept-back-values-to-any-viewer` | CAUGHT | 1 | `50-scanner-kept-back-values-to-any-viewer.txt` |
| 51 | `scanner-names-from-every-club` | CAUGHT | 1 | `51-scanner-names-from-every-club.txt` |
| 52 | `scanner-captions-whatever-the-audience` | CAUGHT | 1 | `52-scanner-captions-whatever-the-audience.txt` |
| 53 | `scanner-day-references-not-read` | CAUGHT | 1 | `53-scanner-day-references-not-read.txt` |
| 54 | `scanner-every-highlight-key-skipped` | CAUGHT | 1 | `54-scanner-every-highlight-key-skipped.txt` |
| 55 | `scanner-highlight-entry-author-not-compared` | CAUGHT | 1 | `55-scanner-highlight-entry-author-not-compared.txt` |
| 56 | `harness-optional-ids-not-sent` | CAUGHT | 1 | `56-harness-optional-ids-not-sent.txt` |
| 57 | `harness-cursor-not-guessed` | CAUGHT | 1 | `57-harness-cursor-not-guessed.txt` |
| 58 | `harness-malformed-not-sent-beside-other-ids` | CAUGHT | 1 | `58-harness-malformed-not-sent-beside-other-ids.txt` |
| 59 | `harness-signed-out-answers-not-compared` | CAUGHT | 1 | `59-harness-signed-out-answers-not-compared.txt` |
| 60 | `harness-media-headers-not-sent` | CAUGHT | 1 | `60-harness-media-headers-not-sent.txt` |
| 61 | `matrix-signed-out-step-not-run` | CAUGHT | 1 | `61-matrix-signed-out-step-not-run.txt` |
| 62 | `api-client-error-handler-left-as-fastify` | CAUGHT | 1 | `62-api-client-error-handler-left-as-fastify.txt` |
| 63 | `api-empty-port-taken-as-zero` | CAUGHT | 1 | `63-api-empty-port-taken-as-zero.txt` |
