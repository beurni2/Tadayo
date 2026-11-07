# Slice 7's breakage run at the eighth review's fixes: the privacy matrix, the leak scanner and the API's skeleton

Each breakage is one exact change of text in one file of `api/b0-privacy`: the API's skeleton and entry (`services/api/src/app.ts`, `start.ts`), the matrix's rows, harness or test (`tests/src/privacy/rows.ts`, `harness.ts`, `matrix.test.ts`, and the test worlds' names in `tests/src/db/world.ts`), the leak scanner (`tests/src/privacy/scanner.ts`), or the services' startup and connection (`services/{api,worker}/src/start.ts`, `main.ts`, `connection.ts`). For each, the tests meant to catch it run, and the breakage counts as **CAUGHT** only if they fail (a non-zero exit) **and** their output holds the words expected for that breakage (`expected pattern` in its file): the name of the test meant to catch it, the count that must come out, or the finding's own words, so a failure for another reason doesn't count. Each file is restored after its breakage; at the end, the worktree's whole diff and every untracked file matched their SHA-256 from before the run ("worktree restored" in `summary.txt`).

- **Commit:** `dddd521` on `api/b0-privacy` (PR #27), the commit that records the PR's eighth fresh review, of `a37f36f`'s fixes, and the fixes of that review. The run was made on the working tree just before that commit, whose code and tests are the commit's; only `docs/` changed after it.
- **Server:** the session's PostgreSQL 16, made like `ci`'s service (ADR-026), with `tools/ci/ci_steps.py db-bootstrap`. `ci`'s Postgres 17 is the authority for the suites themselves.
- **Result:** 142 breakages: 142 caught, 0 missed.
- **What's new since `a37f36f`'s run** (`api/b0-privacy/a37f36f/breakages/`): its 130 breakages, 2 re-pointed at the line the eighth review's fixes changed (`122`, the URL check on a cursor's runs of text turned off, and `127`, that check run on every byte again, now on the line that looks for a URL's marks, `LINK_MARKS`, in those runs), the rest unmoved; and 12 new on the scanner (131 to 142): `URL_RUN` without its `g`, so only a cursor's first run of text is read; only its last run read; `URL_RUN` without its tab, its newline or its CR (three); its 12 bytes made 11; the URL's marks in a cursor cut to the scheme's, and without `data:`; a storage path's and a provider host's marks (`PATH_MARKS`) looked for only in runs of 12 bytes or more again, as at `a37f36f`, and not looked for in cursors at all; `ALL_TEXT` from 13 bytes, and without its end.
- **Expected words:** 119 of the 142 patterns name the test meant to catch the breakage, or the count that must come out; the other 23 match a finding's or an error's own words, which the scanner and harness only write for the check in question.
- **Not here:** the matrix worlds' name suffixes, the drops' and reservations' states, and the drops' end times and the labels' revision times the matrix now reads from the database, have no breakage of the matrix, since under the skeleton every answer is the neutral one, so nothing they guard can show yet; the scanner's use of the last two has `117` and `118`.

## The 20 new or near ones, run first

The 12 new ones, the 2 re-pointed ones (`122`, `127`), and 6 more on the cursor checks whose test the eighth review's fixes changed (`80`, `120`, `121`, `126`, `129`, `130`) were first run on their own, on the final tree: all 20 caught. That run is in `first-run/`. The full run below is on the same tree.

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
