# Slice 7's breakage run at the twelfth review's fixes: the privacy matrix, the leak scanner and the API's skeleton

Each breakage is one exact change of text in one file of `api/b0-privacy`: the API's skeleton and entry (`services/api/src/app.ts`, `start.ts`), the matrix's rows, harness or test (`tests/src/privacy/rows.ts`, `harness.ts`, `matrix.test.ts`, and the test worlds' names in `tests/src/db/world.ts`), the leak scanner (`tests/src/privacy/scanner.ts`), or the services' startup and connection (`services/{api,worker}/src/start.ts`, `main.ts`, `connection.ts`). For each, the tests meant to catch it run, and the breakage counts as **CAUGHT** only if they fail (a non-zero exit) **and** their output holds the words expected for that breakage (`expected pattern` in its file): the name of the test meant to catch it, the count that must come out, or the finding's own words, so a failure for another reason doesn't count. Each file is restored after its breakage; at the end, the worktree's whole diff and every untracked file matched their SHA-256 from before the run ("worktree restored" in `summary.txt`).

- **Commit:** `15fcf88` on `api/b0-privacy` (PR #27), the commit that records the PR's twelfth fresh review, of `a4fca79`'s fixes, and the fixes of that review. The run was made in a scratch worktree, a detached copy of the branch's head `06aeed2` (`a4fca79` with `main` at `a569278` merged in), holding the commit's changed code: `tests/src/privacy/scanner.ts`, `scanner.test.ts` and `rows.ts`, the only code files the commit changes (it changes `docs/` too). The branch's own worktree was being read by the review's readers while the run went on, which is why the run was not made in it. `tree-of-the-run/` holds those three files as they were in the run, and the committed ones differ from them as the hashes below say.
- **Server:** the session's PostgreSQL 16, made like `ci`'s service (ADR-026), with `tools/ci/ci_steps.py db-bootstrap`. `ci`'s Postgres 17 is the authority for the suites themselves.
- **Result:** 257 breakages: 257 caught, 0 missed.
- **What's new since `a4fca79`'s run** (`api/b0-privacy/a4fca79/breakages/`): its 228 breakages, one of them re-pointed at the lines the commit changed (`175`, `scanner-own-id-not-checked`: the own-text id check, which now also looks for an id's body), and 29 new on the scanner (229 to 257): the own-text id check without its whole-id form, and without its body form (two); the bytes' id check without its whole-id text, its body as text, its 16 raw bytes, and the guard on those bytes (four); the body taken from any length from 1 and from 23, its bytes of any body, and its cut at the last underscore (four); the canonical check of a cursor let through; `BYTES_DATE` with its year without the digit 9, and of three digits, its month without 9, and without 0, its day without 9, and of one digit, its form without separators without 9, and of seven digits, its time without 9, and of three digits, and its separators optional (eleven); `/`, `.` and a space as its separators, and its month and day of one or two digits (two); `OWN_DATE`'s month and day of one or two digits; the long number from 11 digits and from 9, and the text people wrote from 3 characters and from 5 (four).
- **Expected words:** 234 of the 257 patterns name the test meant to catch the breakage, or the count that must come out; the other 23 match a finding's or an error's own words, which the scanner and harness only write for the check in question.
- **Not here:** the matrix worlds' name suffixes, the drops' and reservations' states, and the drops' end times and the labels' revision times the matrix now reads from the database, have no breakage of the matrix, since under the skeleton every answer is the neutral one, so nothing they guard can show yet; the scanner's use of the last two has `117` and `118`.
- **Rates:** `rates13.py` and its output `rates13.out` compute exactly, over each pattern's states, the chance that random base64url text of 24, 32 and 48 bytes holds each date form the scanner's header names as looked for or as left out.

## First run of the 29 new breakages

The 29 new ones ran first on their own, on the tree before its last test change (`trial/first-run.log`): 28 caught and one missed, `238` (`scanner-untagged-cut-at-the-last-underscore`): the test's id had its underscore at the fourth character of its 22-character body, so the 18 characters after it started a group of 4 and spelled the first 13 of the id's 16 bytes, which the bytes' check still found when the body was cut at the last underscore instead of the first, and the breakage's change stayed invisible. That was a real gap in the test, closed before the commit by an id whose underscore is its sixth character, where the text after it spells bytes that are no part of the id's (`drp_Q7yK2_mZ0vN-5cX8bLw3Rg`). The 11 on ids and the canonical check, `229` to `239`, then ran again on the changed test, all caught (`trial/rerun.log`); `trial/` holds the results of both, the first run's for `240` to `257` and the second's for `229` to `239`. The run below is on the final tree, with the 29 among its 257.

## The tree of the run

`tree-of-the-run/` holds `scanner.ts`, `scanner.test.ts` and `rows.ts` as they were in the run. The committed copies' SHA-256 hashes, and the run's:

```
committed (tests/src/privacy/):
ba4052f12e047455595a3d4663d3c3d85950e016ec7b1fb6467da89f7818468e  scanner.ts
17f86ad256bd0281d70d58f1c663a61398e714d694fad8c0c1f09432eb052fc8  scanner.test.ts
f694a59d715f4021f97e9a6ed764ff3d86045e1283a2fc376da337e0d9c3a1af  rows.ts
of the run (tree-of-the-run/):
b70d37a60a975f05f4babc1e1060da1a0765568c561eab7847821577b5a53979  scanner.ts
17f86ad256bd0281d70d58f1c663a61398e714d694fad8c0c1f09432eb052fc8  scanner.test.ts
f694a59d715f4021f97e9a6ed764ff3d86045e1283a2fc376da337e0d9c3a1af  rows.ts
scanner.test.ts and rows.ts are the run's, byte for byte. scanner.ts differs by one comment (OWN_DATE's rate for a month or day of one digit, corrected after the run to "about once in 170 million handles of 32 bytes (245 million of 24)"): the diff is tree-of-the-run/scanner.ts.run-to-committed.diff, and no line of code differs.
```

## How to run them again

1. Check out the commit above in a working tree, with Node 26 and pnpm 12.16.1 (`docs/JOURNAL.md`, block 1.1, "How to run and check everything"), and run `pnpm install`.
2. Make a server like `ci`'s on port 5432 (`pgci.sh`, as root: it stops and deletes the cluster at `/var/lib/postgresql/pgci`, then `initdb --username=supabase_admin` with the password `postgres`, `ci`'s throwaway one, and starts it), then `python3 tools/ci/ci_steps.py db-bootstrap`. `FRESH=1 bash privtest.sh` does both.
3. Edit the paths at the top of `run_breakages.py`, `privtest.sh` and `dbtest.sh` (`ROOT`, `S`, the `cd`) to your working tree and this folder, or set `BREAK_ROOT`, `BREAK_OUT`, `BREAK_PRIV` and `BREAK_DB` (this run used `BREAK_ROOT=/home/user/tadayo-fixes BREAK_PRIV=privtest-fixes.sh BREAK_DB=dbtest-fixes.sh`: `privtest-fixes.sh` and `dbtest-fixes.sh` are `privtest.sh` and `dbtest.sh` with the scratch worktree's path in their `cd`), then `python3 run_breakages.py`, with optional names to pick breakages. Nothing else may read or change the working tree while it runs, since it edits files in place.

The whole run takes about 22 minutes on the session's machine.

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
| 111 | `scanner-date-not-round-tripped` | CAUGHT | 1 | `111-scanner-date-not-round-tripped.txt` |
| 112 | `scanner-date-clock-ignored` | CAUGHT | 1 | `112-scanner-date-clock-ignored.txt` |
| 113 | `harness-date-order-not-kept` | CAUGHT | 1 | `113-harness-date-order-not-kept.txt` |
| 114 | `harness-date-lag-unbounded` | CAUGHT | 1 | `114-harness-date-lag-unbounded.txt` |
| 115 | `harness-header-order-not-compared` | CAUGHT | 1 | `115-harness-header-order-not-compared.txt` |
| 116 | `harness-said-sorts-headers` | CAUGHT | 1 | `116-harness-said-sorts-headers.txt` |
| 117 | `scanner-labels-from-any-revision` | CAUGHT | 1 | `117-scanner-labels-from-any-revision.txt` |
| 118 | `scanner-allowance-releases-every-withdrawal` | CAUGHT | 1 | `118-scanner-allowance-releases-every-withdrawal.txt` |
| 119 | `scanner-cursor-floor-above-the-contract` | CAUGHT | 1 | `119-scanner-cursor-floor-above-the-contract.txt` |
| 120 | `scanner-readable-run-shorter` | CAUGHT | 1 | `120-scanner-readable-run-shorter.txt` |
| 121 | `scanner-whole-key-not-checked` | CAUGHT | 1 | `121-scanner-whole-key-not-checked.txt` |
| 122 | `scanner-url-run-not-checked` | CAUGHT | 1 | `122-scanner-url-run-not-checked.txt` |
| 123 | `harness-no-turn-before-request` | CAUGHT | 1 | `123-harness-no-turn-before-request.txt` |
| 124 | `harness-date-ahead-allowed` | CAUGHT | 1 | `124-harness-date-ahead-allowed.txt` |
| 125 | `harness-date-lag-an-hour` | CAUGHT | 1 | `125-harness-date-lag-an-hour.txt` |
| 126 | `scanner-url-run-longer` | CAUGHT | 1 | `126-scanner-url-run-longer.txt` |
| 127 | `scanner-url-on-every-byte` | CAUGHT | 1 | `127-scanner-url-on-every-byte.txt` |
| 128 | `scanner-readable-text-without-whitespace` | CAUGHT | 1 | `128-scanner-readable-text-without-whitespace.txt` |
| 129 | `scanner-whole-key-without-whitespace` | CAUGHT | 1 | `129-scanner-whole-key-without-whitespace.txt` |
| 130 | `scanner-whole-key-without-tab` | CAUGHT | 1 | `130-scanner-whole-key-without-tab.txt` |
| 131 | `scanner-url-run-first-only` | CAUGHT | 1 | `131-scanner-url-run-first-only.txt` |
| 132 | `scanner-url-run-last-only` | CAUGHT | 1 | `132-scanner-url-run-last-only.txt` |
| 133 | `scanner-url-run-without-tab` | CAUGHT | 1 | `133-scanner-url-run-without-tab.txt` |
| 134 | `scanner-url-run-without-newline` | CAUGHT | 1 | `134-scanner-url-run-without-newline.txt` |
| 135 | `scanner-url-run-without-cr` | CAUGHT | 1 | `135-scanner-url-run-without-cr.txt` |
| 136 | `scanner-url-run-shorter` | CAUGHT | 1 | `136-scanner-url-run-shorter.txt` |
| 137 | `scanner-link-marks-scheme-only` | CAUGHT | 1 | `137-scanner-link-marks-scheme-only.txt` |
| 138 | `scanner-link-marks-without-data` | CAUGHT | 1 | `138-scanner-link-marks-without-data.txt` |
| 139 | `scanner-path-marks-in-runs-only` | CAUGHT | 1 | `139-scanner-path-marks-in-runs-only.txt` |
| 140 | `scanner-path-marks-not-checked-in-cursors` | CAUGHT | 1 | `140-scanner-path-marks-not-checked-in-cursors.txt` |
| 141 | `scanner-whole-key-longer` | CAUGHT | 1 | `141-scanner-whole-key-longer.txt` |
| 142 | `scanner-whole-key-unanchored` | CAUGHT | 1 | `142-scanner-whole-key-unanchored.txt` |
| 143 | `scanner-url-run-exactly-12` | CAUGHT | 1 | `143-scanner-url-run-exactly-12.txt` |
| 144 | `scanner-url-run-without-space` | CAUGHT | 1 | `144-scanner-url-run-without-space.txt` |
| 145 | `scanner-link-marks-www-anchored` | CAUGHT | 1 | `145-scanner-link-marks-www-anchored.txt` |
| 146 | `scanner-link-marks-data-anchored` | CAUGHT | 1 | `146-scanner-link-marks-data-anchored.txt` |
| 147 | `scanner-path-marks-anchored` | CAUGHT | 1 | `147-scanner-path-marks-anchored.txt` |
| 148 | `scanner-www-on-every-byte` | CAUGHT | 1 | `148-scanner-www-on-every-byte.txt` |
| 149 | `scanner-data-on-every-byte` | CAUGHT | 1 | `149-scanner-data-on-every-byte.txt` |
| 150 | `scanner-link-marks-case-sensitive` | CAUGHT | 1 | `150-scanner-link-marks-case-sensitive.txt` |
| 151 | `scanner-path-marks-case-sensitive` | CAUGHT | 1 | `151-scanner-path-marks-case-sensitive.txt` |
| 152 | `scanner-host-dot-any-byte` | CAUGHT | 1 | `152-scanner-host-dot-any-byte.txt` |
| 153 | `scanner-scheme-two-letters` | CAUGHT | 1 | `153-scanner-scheme-two-letters.txt` |
| 154 | `scanner-values-without-path-marks` | CAUGHT | 1 | `154-scanner-values-without-path-marks.txt` |
| 155 | `scanner-values-scheme-case-sensitive` | CAUGHT | 1 | `155-scanner-values-scheme-case-sensitive.txt` |
| 156 | `scanner-values-www-case-sensitive` | CAUGHT | 1 | `156-scanner-values-www-case-sensitive.txt` |
| 157 | `scanner-values-data-case-sensitive` | CAUGHT | 1 | `157-scanner-values-data-case-sensitive.txt` |
| 158 | `scanner-values-path-case-sensitive` | CAUGHT | 1 | `158-scanner-values-path-case-sensitive.txt` |
| 159 | `scanner-values-host-case-sensitive` | CAUGHT | 1 | `159-scanner-values-host-case-sensitive.txt` |
| 160 | `scanner-values-scheme-two-letters` | CAUGHT | 1 | `160-scanner-values-scheme-two-letters.txt` |
| 161 | `scanner-values-scheme-without-digits` | CAUGHT | 1 | `161-scanner-values-scheme-without-digits.txt` |
| 162 | `scanner-values-scheme-from-a-digit` | CAUGHT | 1 | `162-scanner-values-scheme-from-a-digit.txt` |
| 163 | `scanner-values-path-anchor-not-negated` | CAUGHT | 1 | `163-scanner-values-path-anchor-not-negated.txt` |
| 164 | `scanner-values-www-anchor-not-negated` | CAUGHT | 1 | `164-scanner-values-www-anchor-not-negated.txt` |
| 165 | `scanner-values-data-anchor-not-negated` | CAUGHT | 1 | `165-scanner-values-data-anchor-not-negated.txt` |
| 166 | `scanner-values-path-anchor-dropped` | CAUGHT | 1 | `166-scanner-values-path-anchor-dropped.txt` |
| 167 | `scanner-values-www-anchor-dropped` | CAUGHT | 1 | `167-scanner-values-www-anchor-dropped.txt` |
| 168 | `scanner-values-data-anchor-dropped` | CAUGHT | 1 | `168-scanner-values-data-anchor-dropped.txt` |
| 169 | `scanner-values-path-at-start-only` | CAUGHT | 1 | `169-scanner-values-path-at-start-only.txt` |
| 170 | `scanner-values-host-dot-any-byte` | CAUGHT | 1 | `170-scanner-values-host-dot-any-byte.txt` |
| 171 | `scanner-url-run-capped-at-22` | CAUGHT | 1 | `171-scanner-url-run-capped-at-22.txt` |
| 172 | `scanner-own-text-not-checked` | CAUGHT | 1 | `172-scanner-own-text-not-checked.txt` |
| 173 | `scanner-own-date-not-checked` | CAUGHT | 1 | `173-scanner-own-date-not-checked.txt` |
| 174 | `scanner-own-number-not-checked` | CAUGHT | 1 | `174-scanner-own-number-not-checked.txt` |
| 175 | `scanner-own-id-not-checked` | CAUGHT | 1 | `175-scanner-own-id-not-checked.txt` |
| 176 | `scanner-own-number-of-17` | CAUGHT | 1 | `176-scanner-own-number-of-17.txt` |
| 177 | `scanner-own-number-of-15` | CAUGHT | 1 | `177-scanner-own-number-of-15.txt` |
| 178 | `scanner-own-date-month-tens-one` | CAUGHT | 1 | `178-scanner-own-date-month-tens-one.txt` |
| 179 | `scanner-own-date-month-tens-zero` | CAUGHT | 1 | `179-scanner-own-date-month-tens-zero.txt` |
| 180 | `scanner-own-date-day-to-29` | CAUGHT | 1 | `180-scanner-own-date-day-to-29.txt` |
| 181 | `scanner-own-date-any-month` | CAUGHT | 1 | `181-scanner-own-date-any-month.txt` |
| 182 | `scanner-own-date-any-day` | CAUGHT | 1 | `182-scanner-own-date-any-day.txt` |
| 183 | `scanner-own-date-any-century` | CAUGHT | 1 | `183-scanner-own-date-any-century.txt` |
| 184 | `scanner-own-date-compact-removed` | CAUGHT | 1 | `184-scanner-own-date-compact-removed.txt` |
| 185 | `scanner-own-date-compact-any-letter` | CAUGHT | 1 | `185-scanner-own-date-compact-any-letter.txt` |
| 186 | `scanner-own-date-compact-three-digits` | CAUGHT | 1 | `186-scanner-own-date-compact-three-digits.txt` |
| 187 | `scanner-own-date-compact-month-tens-one` | CAUGHT | 1 | `187-scanner-own-date-compact-month-tens-one.txt` |
| 188 | `scanner-own-date-compact-month-tens-zero` | CAUGHT | 1 | `188-scanner-own-date-compact-month-tens-zero.txt` |
| 189 | `scanner-own-date-compact-day-to-29` | CAUGHT | 1 | `189-scanner-own-date-compact-day-to-29.txt` |
| 190 | `scanner-own-date-compact-any-month` | CAUGHT | 1 | `190-scanner-own-date-compact-any-month.txt` |
| 191 | `scanner-own-date-compact-any-day` | CAUGHT | 1 | `191-scanner-own-date-compact-any-day.txt` |
| 192 | `scanner-own-date-underscore-removed` | CAUGHT | 1 | `192-scanner-own-date-underscore-removed.txt` |
| 193 | `scanner-own-date-first-separator-dash-only` | CAUGHT | 1 | `193-scanner-own-date-first-separator-dash-only.txt` |
| 194 | `scanner-own-date-second-separator-dash-only` | CAUGHT | 1 | `194-scanner-own-date-second-separator-dash-only.txt` |
| 195 | `scanner-own-date-lowercase-t-removed` | CAUGHT | 1 | `195-scanner-own-date-lowercase-t-removed.txt` |
| 196 | `scanner-own-date-uppercase-t-removed` | CAUGHT | 1 | `196-scanner-own-date-uppercase-t-removed.txt` |
| 197 | `scanner-own-date-century-first-digit-any` | CAUGHT | 1 | `197-scanner-own-date-century-first-digit-any.txt` |
| 198 | `scanner-own-date-century-second-digit-any` | CAUGHT | 1 | `198-scanner-own-date-century-second-digit-any.txt` |
| 199 | `scanner-own-date-year-third-digit-without-9` | CAUGHT | 1 | `199-scanner-own-date-year-third-digit-without-9.txt` |
| 200 | `scanner-own-date-year-fourth-digit-without-0` | CAUGHT | 1 | `200-scanner-own-date-year-fourth-digit-without-0.txt` |
| 201 | `scanner-own-date-month-ones-without-0` | CAUGHT | 1 | `201-scanner-own-date-month-ones-without-0.txt` |
| 202 | `scanner-own-date-day-ones-without-9` | CAUGHT | 1 | `202-scanner-own-date-day-ones-without-9.txt` |
| 203 | `scanner-own-date-compact-month-ones-without-0` | CAUGHT | 1 | `203-scanner-own-date-compact-month-ones-without-0.txt` |
| 204 | `scanner-own-date-compact-day-ones-without-9` | CAUGHT | 1 | `204-scanner-own-date-compact-day-ones-without-9.txt` |
| 205 | `scanner-own-date-compact-time-first-without-0` | CAUGHT | 1 | `205-scanner-own-date-compact-time-first-without-0.txt` |
| 206 | `scanner-own-date-compact-time-second-without-9` | CAUGHT | 1 | `206-scanner-own-date-compact-time-second-without-9.txt` |
| 207 | `scanner-own-date-compact-time-third-without-0` | CAUGHT | 1 | `207-scanner-own-date-compact-time-third-without-0.txt` |
| 208 | `scanner-own-date-compact-time-fourth-without-9` | CAUGHT | 1 | `208-scanner-own-date-compact-time-fourth-without-9.txt` |
| 209 | `scanner-own-date-separators-optional` | CAUGHT | 1 | `209-scanner-own-date-separators-optional.txt` |
| 210 | `scanner-own-date-compact-t-optional` | CAUGHT | 1 | `210-scanner-own-date-compact-t-optional.txt` |
| 211 | `scanner-own-number-anchored` | CAUGHT | 1 | `211-scanner-own-number-anchored.txt` |
| 212 | `scanner-bytes-date-underscore-removed` | CAUGHT | 1 | `212-scanner-bytes-date-underscore-removed.txt` |
| 213 | `scanner-bytes-date-dash-removed` | CAUGHT | 1 | `213-scanner-bytes-date-dash-removed.txt` |
| 214 | `scanner-bytes-date-compact-removed` | CAUGHT | 1 | `214-scanner-bytes-date-compact-removed.txt` |
| 215 | `scanner-bytes-date-lowercase-t-removed` | CAUGHT | 1 | `215-scanner-bytes-date-lowercase-t-removed.txt` |
| 216 | `scanner-bytes-date-uppercase-t-removed` | CAUGHT | 1 | `216-scanner-bytes-date-uppercase-t-removed.txt` |
| 217 | `scanner-shifted-not-checked` | CAUGHT | 1 | `217-scanner-shifted-not-checked.txt` |
| 218 | `scanner-shifted-first-shift-missing` | CAUGHT | 1 | `218-scanner-shifted-first-shift-missing.txt` |
| 219 | `scanner-shifted-second-shift-missing` | CAUGHT | 1 | `219-scanner-shifted-second-shift-missing.txt` |
| 220 | `scanner-shifted-third-shift-missing` | CAUGHT | 1 | `220-scanner-shifted-third-shift-missing.txt` |
| 221 | `scanner-shifted-marks-not-checked` | CAUGHT | 1 | `221-scanner-shifted-marks-not-checked.txt` |
| 222 | `scanner-shifted-paths-not-checked` | CAUGHT | 1 | `222-scanner-shifted-paths-not-checked.txt` |
| 223 | `scanner-shifted-kept-back-not-checked` | CAUGHT | 1 | `223-scanner-shifted-kept-back-not-checked.txt` |
| 224 | `scanner-shifted-label-off-by-one` | CAUGHT | 1 | `224-scanner-shifted-label-off-by-one.txt` |
| 225 | `scanner-url-run-without-tilde` | CAUGHT | 1 | `225-scanner-url-run-without-tilde.txt` |
| 226 | `scanner-url-run-bound-backslash-deleted` | CAUGHT | 1 | `226-scanner-url-run-bound-backslash-deleted.txt` |
| 227 | `scanner-readable-text-without-tilde` | CAUGHT | 1 | `227-scanner-readable-text-without-tilde.txt` |
| 228 | `scanner-whole-key-without-tilde` | CAUGHT | 1 | `228-scanner-whole-key-without-tilde.txt` |
| 229 | `scanner-own-id-tagged-not-checked` | CAUGHT | 1 | `229-scanner-own-id-tagged-not-checked.txt` |
| 230 | `scanner-own-id-without-tag-not-checked` | CAUGHT | 1 | `230-scanner-own-id-without-tag-not-checked.txt` |
| 231 | `scanner-bytes-id-tagged-not-checked` | CAUGHT | 1 | `231-scanner-bytes-id-tagged-not-checked.txt` |
| 232 | `scanner-bytes-id-text-without-tag-not-checked` | CAUGHT | 1 | `232-scanner-bytes-id-text-without-tag-not-checked.txt` |
| 233 | `scanner-bytes-id-raw-not-checked` | CAUGHT | 1 | `233-scanner-bytes-id-raw-not-checked.txt` |
| 234 | `scanner-bytes-id-raw-without-its-guard` | CAUGHT | 1 | `234-scanner-bytes-id-raw-without-its-guard.txt` |
| 235 | `scanner-untagged-of-any-length` | CAUGHT | 1 | `235-scanner-untagged-of-any-length.txt` |
| 236 | `scanner-untagged-of-23-or-more` | CAUGHT | 1 | `236-scanner-untagged-of-23-or-more.txt` |
| 237 | `scanner-untagged-bytes-of-any-body` | CAUGHT | 1 | `237-scanner-untagged-bytes-of-any-body.txt` |
| 238 | `scanner-untagged-cut-at-the-last-underscore` | CAUGHT | 1 | `238-scanner-untagged-cut-at-the-last-underscore.txt` |
| 239 | `scanner-cursor-not-canonical-let-through` | CAUGHT | 1 | `239-scanner-cursor-not-canonical-let-through.txt` |
| 240 | `scanner-bytes-date-year-without-9` | CAUGHT | 1 | `240-scanner-bytes-date-year-without-9.txt` |
| 241 | `scanner-bytes-date-year-of-three-digits` | CAUGHT | 1 | `241-scanner-bytes-date-year-of-three-digits.txt` |
| 242 | `scanner-bytes-date-month-without-9` | CAUGHT | 1 | `242-scanner-bytes-date-month-without-9.txt` |
| 243 | `scanner-bytes-date-month-without-0` | CAUGHT | 1 | `243-scanner-bytes-date-month-without-0.txt` |
| 244 | `scanner-bytes-date-day-without-9` | CAUGHT | 1 | `244-scanner-bytes-date-day-without-9.txt` |
| 245 | `scanner-bytes-date-day-of-one-digit` | CAUGHT | 1 | `245-scanner-bytes-date-day-of-one-digit.txt` |
| 246 | `scanner-bytes-date-compact-without-9` | CAUGHT | 1 | `246-scanner-bytes-date-compact-without-9.txt` |
| 247 | `scanner-bytes-date-compact-of-seven-digits` | CAUGHT | 1 | `247-scanner-bytes-date-compact-of-seven-digits.txt` |
| 248 | `scanner-bytes-date-time-without-9` | CAUGHT | 1 | `248-scanner-bytes-date-time-without-9.txt` |
| 249 | `scanner-bytes-date-time-of-three-digits` | CAUGHT | 1 | `249-scanner-bytes-date-time-of-three-digits.txt` |
| 250 | `scanner-bytes-date-separators-optional` | CAUGHT | 1 | `250-scanner-bytes-date-separators-optional.txt` |
| 251 | `scanner-bytes-date-slash-dot-and-space-as-separators` | CAUGHT | 1 | `251-scanner-bytes-date-slash-dot-and-space-as-separators.txt` |
| 252 | `scanner-bytes-date-parts-of-one-or-two-digits` | CAUGHT | 1 | `252-scanner-bytes-date-parts-of-one-or-two-digits.txt` |
| 253 | `scanner-own-date-parts-of-one-or-two-digits` | CAUGHT | 1 | `253-scanner-own-date-parts-of-one-or-two-digits.txt` |
| 254 | `scanner-long-number-of-11` | CAUGHT | 1 | `254-scanner-long-number-of-11.txt` |
| 255 | `scanner-long-number-of-9` | CAUGHT | 1 | `255-scanner-long-number-of-9.txt` |
| 256 | `scanner-written-text-from-3` | CAUGHT | 1 | `256-scanner-written-text-from-3.txt` |
| 257 | `scanner-written-text-from-5` | CAUGHT | 1 | `257-scanner-written-text-from-5.txt` |
