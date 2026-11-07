# Slice 7's breakage run at the third review's fixes: the privacy matrix, the leak scanner and the API's skeleton

Each breakage is one exact change of text in one file of `api/b0-privacy`: the API's skeleton and entry (`services/api/src/app.ts`, `start.ts`), the matrix's rows, harness or test (`tests/src/privacy/rows.ts`, `harness.ts`, `matrix.test.ts`, and the test worlds' names in `tests/src/db/world.ts`), the leak scanner (`tests/src/privacy/scanner.ts`), or the services' startup and connection (`services/{api,worker}/src/start.ts`, `main.ts`, `connection.ts`). For each, the tests meant to catch it run, and the breakage counts as **CAUGHT** only if they fail (a non-zero exit) **and** their output holds the words expected for that breakage (`expected pattern` in its file): the name of the test meant to catch it, the count that must come out, or the finding's own words, so a failure for another reason doesn't count. Each file is restored after its breakage; at the end, the worktree's whole diff and every untracked file matched their SHA-256 from before the run ("worktree restored" in `summary.txt`).

- **Commit:** `31958b5` on `api/b0-privacy` (PR #27), the commit that records the PR's third fresh review, of `d015773`'s fixes, and the fixes of that review. The run was made on the working tree just before that commit, whose code and tests are the commit's; only `docs/` changed after it.
- **Server:** the session's PostgreSQL 16, made like `ci`'s service (ADR-026), with `tools/ci/ci_steps.py db-bootstrap`. `ci`'s Postgres 17 is the authority for the suites themselves.
- **Result:** 110 breakages: 110 caught, 0 missed.
- **What's new since `d015773`'s run** (`api/b0-privacy/d015773/breakages/`): its 92 breakages, 5 of them moved to the new code where their anchor changed (`51`, `68`, `81`, `83`, and `87`, whose pattern now names the harness test of a Date that isn't one); and 18 new for the third review's fixes (93 to 110): 15 on the scanner (a Date's time, Keep-Alive's value, six on a cursor's readable key: its length, readable text, a date, a long number, an id, text people wrote; three on the people a former member may know: a `Person`, an id anywhere else, a name anywhere else; two on the allowance's states, withdrawn drops and ended reservations; a caption holding its own drop's kept-back values; and hidden text inside another value), 2 on the harness (`Connection` compared as sent, and `Date`'s time), and 1 on the API's `Keep-Alive`.
- **Expected words:** 87 of the 110 patterns name the test meant to catch the breakage, or the count that must come out; the other 23 match a finding's or an error's own words, which the scanner and harness only write for the check in question.
- **Not here:** the matrix worlds' name suffixes, and the drops' and reservations' states the matrix now reads from the database, have no breakage, since under the skeleton every answer is the neutral one, so nothing they guard can show yet.

## The 23 changed or new ones, run first

The 5 re-pointed and the 18 new were first run on their own, on the tree before the scanner's header comment was rewritten to match its new checks, its code the same: all 23 caught. That run is in `first-run/`. A first try of the full run was then stopped after 5 breakages, all caught, to make that rewrite; the run below is on the final tree.

## Corrected after PR #27's fourth review

This README first said `87`'s pattern names the harness test of a Date that isn't the answer's time. That is `96`'s; `87`'s, as `run_breakages.py` and `87-harness-transport-forms-not-checked.txt` have it, names the test of a Date that isn't one (the fourth review's finding records 4). The run and its verdicts are unchanged.

## How to run them again

1. Check out the commit above in a working tree, with Node 26 and pnpm 12.16.1 (`docs/JOURNAL.md`, block 1.1, "How to run and check everything"), and run `pnpm install`.
2. Make a server like `ci`'s on port 5432 (`pgci.sh`, as root: it stops and deletes the cluster at `/var/lib/postgresql/pgci`, then `initdb --username=supabase_admin` with the password `postgres`, `ci`'s throwaway one, and starts it), then `python3 tools/ci/ci_steps.py db-bootstrap`. `FRESH=1 bash privtest.sh` does both.
3. Edit the paths at the top of `run_breakages.py`, `privtest.sh` and `dbtest.sh` (`ROOT`, `S`, the `cd`) to your working tree and this folder, then `python3 run_breakages.py`, with optional names to pick breakages. Nothing else may read or change the working tree while it runs, since it edits files in place.

The whole run takes about 20 minutes on the session's machine.

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
| 64 | `scanner-opened-forms-to-a-former-author` | CAUGHT | 1 | `64-scanner-opened-forms-to-a-former-author.txt` |
| 65 | `scanner-who-reacted-to-a-former-author` | CAUGHT | 1 | `65-scanner-who-reacted-to-a-former-author.txt` |
| 66 | `scanner-comments-to-a-former-author` | CAUGHT | 1 | `66-scanner-comments-to-a-former-author.txt` |
| 67 | `scanner-club-summary-to-a-former-member` | CAUGHT | 1 | `67-scanner-club-summary-to-a-former-member.txt` |
| 68 | `scanner-person-who-joined-after-the-viewer-left` | CAUGHT | 1 | `68-scanner-person-who-joined-after-the-viewer-left.txt` |
| 69 | `scanner-avatar-after-an-interval-ended` | CAUGHT | 1 | `69-scanner-avatar-after-an-interval-ended.txt` |
| 70 | `scanner-allowance-not-bounded` | CAUGHT | 1 | `70-scanner-allowance-not-bounded.txt` |
| 71 | `scanner-joined-later-not-checked` | CAUGHT | 1 | `71-scanner-joined-later-not-checked.txt` |
| 72 | `scanner-is-star-not-checked` | CAUGHT | 1 | `72-scanner-is-star-not-checked.txt` |
| 73 | `scanner-star-not-compared` | CAUGHT | 1 | `73-scanner-star-not-compared.txt` |
| 74 | `scanner-day-link-to-nothing-readable` | CAUGHT | 1 | `74-scanner-day-link-to-nothing-readable.txt` |
| 75 | `scanner-day-link-before-close` | CAUGHT | 1 | `75-scanner-day-link-before-close.txt` |
| 76 | `scanner-video-cover` | CAUGHT | 1 | `76-scanner-video-cover.txt` |
| 77 | `scanner-bare-ids-not-read` | CAUGHT | 1 | `77-scanner-bare-ids-not-read.txt` |
| 78 | `scanner-unseen-ids-not-looked-for` | CAUGHT | 1 | `78-scanner-unseen-ids-not-looked-for.txt` |
| 79 | `scanner-reservations-of-others-seen` | CAUGHT | 1 | `79-scanner-reservations-of-others-seen.txt` |
| 80 | `scanner-cursor-not-decoded` | CAUGHT | 1 | `80-scanner-cursor-not-decoded.txt` |
| 81 | `scanner-readable-people-text-checked-as-kept-back` | CAUGHT | 1 | `81-scanner-readable-people-text-checked-as-kept-back.txt` |
| 82 | `scanner-reason-not-checked` | CAUGHT | 1 | `82-scanner-reason-not-checked.txt` |
| 83 | `scanner-transport-forms-not-checked` | CAUGHT | 1 | `83-scanner-transport-forms-not-checked.txt` |
| 84 | `scanner-content-length-not-compared` | CAUGHT | 1 | `84-scanner-content-length-not-compared.txt` |
| 85 | `harness-reason-not-compared` | CAUGHT | 1 | `85-harness-reason-not-compared.txt` |
| 86 | `harness-reason-not-captured` | CAUGHT | 1 | `86-harness-reason-not-captured.txt` |
| 87 | `harness-transport-forms-not-checked` | CAUGHT | 1 | `87-harness-transport-forms-not-checked.txt` |
| 88 | `harness-cursor-not-sent-beside-ids` | CAUGHT | 1 | `88-harness-cursor-not-sent-beside-ids.txt` |
| 89 | `harness-signed-out-cursor-not-sent` | CAUGHT | 1 | `89-harness-signed-out-cursor-not-sent.txt` |
| 90 | `matrix-a-request-left-out-of-each-world` | CAUGHT | 1 | `90-matrix-a-request-left-out-of-each-world.txt` |
| 91 | `matrix-a-state-left-out` | CAUGHT | 1 | `91-matrix-a-state-left-out.txt` |
| 92 | `api-client-error-writes-into-an-answer-under-way` | CAUGHT | 1 | `92-api-client-error-writes-into-an-answer-under-way.txt` |
| 93 | `scanner-date-time-not-checked` | CAUGHT | 1 | `93-scanner-date-time-not-checked.txt` |
| 94 | `scanner-keep-alive-any-timeout` | CAUGHT | 1 | `94-scanner-keep-alive-any-timeout.txt` |
| 95 | `harness-connection-compared-by-form` | CAUGHT | 1 | `95-harness-connection-compared-by-form.txt` |
| 96 | `harness-date-time-not-compared` | CAUGHT | 1 | `96-harness-date-time-not-compared.txt` |
| 97 | `scanner-cursor-length-not-checked` | CAUGHT | 1 | `97-scanner-cursor-length-not-checked.txt` |
| 98 | `scanner-cursor-readable-text-not-checked` | CAUGHT | 1 | `98-scanner-cursor-readable-text-not-checked.txt` |
| 99 | `scanner-cursor-date-not-checked` | CAUGHT | 1 | `99-scanner-cursor-date-not-checked.txt` |
| 100 | `scanner-cursor-number-not-checked` | CAUGHT | 1 | `100-scanner-cursor-number-not-checked.txt` |
| 101 | `scanner-cursor-id-not-checked` | CAUGHT | 1 | `101-scanner-cursor-id-not-checked.txt` |
| 102 | `scanner-cursor-text-not-checked` | CAUGHT | 1 | `102-scanner-cursor-text-not-checked.txt` |
| 103 | `scanner-knows-everyone-of-a-club` | CAUGHT | 1 | `103-scanner-knows-everyone-of-a-club.txt` |
| 104 | `scanner-unseen-people-by-club-alone` | CAUGHT | 1 | `104-scanner-unseen-people-by-club-alone.txt` |
| 105 | `scanner-names-by-club-alone` | CAUGHT | 1 | `105-scanner-names-by-club-alone.txt` |
| 106 | `scanner-allowance-counts-withdrawn-drops` | CAUGHT | 1 | `106-scanner-allowance-counts-withdrawn-drops.txt` |
| 107 | `scanner-allowance-counts-ended-reservations` | CAUGHT | 1 | `107-scanner-allowance-counts-ended-reservations.txt` |
| 108 | `scanner-caption-own-values-not-checked` | CAUGHT | 1 | `108-scanner-caption-own-values-not-checked.txt` |
| 109 | `scanner-hidden-text-not-looked-for` | CAUGHT | 1 | `109-scanner-hidden-text-not-looked-for.txt` |
| 110 | `api-keep-alive-timeout-changed` | CAUGHT | 1 | `110-api-keep-alive-timeout-changed.txt` |
