# Slice 7's breakage run at the fresh review's fixes: the privacy matrix, the leak scanner and the API's skeleton

Each breakage is one exact change of text in one file of `api/b0-privacy`: the API's skeleton and entry (`services/api/src/app.ts`, `start.ts`), the matrix's rows, harness or test (`tests/src/privacy/rows.ts`, `harness.ts`, `matrix.test.ts`, and the test worlds' names in `tests/src/db/world.ts`), the leak scanner (`tests/src/privacy/scanner.ts`), or the services' startup and connection (`services/{api,worker}/src/start.ts`, `main.ts`, `connection.ts`). For each, the tests meant to catch it run, and the breakage counts as **CAUGHT** only if they fail (a non-zero exit) **and** their output holds the words expected for that breakage (`expected pattern` in its file): the name of the test meant to catch it, the count that must come out, or the finding's own words, so a failure for another reason doesn't count. Each file is restored after its breakage; at the end, the worktree's whole diff and every untracked file matched their SHA-256 from before the run ("worktree restored" in `summary.txt`).

- **Commit:** `d015773` on `api/b0-privacy` (PR #27), the commit that records the PR's fresh review of its first review's fixes, and the fixes of that fresh review. The run was made on the working tree just before that commit, whose code and tests are the commit's; only `docs/` changed after it.
- **Server:** the session's PostgreSQL 16, made like `ci`'s service (ADR-026), with `tools/ci/ci_steps.py db-bootstrap`. `ci`'s Postgres 17 is the authority for the suites themselves.
- **Result:** 92 breakages: 92 caught, 0 missed.
- **What's new since `247873d`'s run** (`api/b0-privacy/247873d/breakages/`): its 63 breakages, 12 of them moved to the new code where their anchor changed (`23`, `25` to `28`, `35`, `37`, `44`, `49`, `50`, `52` and `57`) and `61`'s count brought up to the new cells, and the patterns of `09`, `14` and `15` tightened to name their test or an exact count (at `247873d`, `14`'s and `15`'s accepted any count); and 29 new for the fresh review's fixes (64 to 92): 21 on the scanner (a former author's opened forms, who reacted and comments; a former member's club summary, a person who joined after the viewer left, an avatar after an interval ended; the allowance's bound, `joined_later`, `is_star`, an occurrence's star; a day link to nothing readable, before its close, with a video cover; bare ids, unseen ids, others' reservations, cursors decoded; readable text people wrote; the reason phrase, the transport's forms, `Content-Length`), 5 on the harness (the reason phrase compared and captured, the transport's forms, a cursor beside ids, a signed-out caller's forged cursor), 2 on the matrix's pinned cell count (a request left out of each world, a state left out), and 1 on the API's client-error handler inside an answer under way.
- **Expected words:** 69 of the 92 patterns name the test meant to catch the breakage, or the count that must come out; the other 23 match a finding's or an error's own words, which the scanner and harness only write for the check in question. `247873d`'s README said every pattern named its test; that was false (the fresh review's finding records 4).
- **Not here:** the matrix worlds' name suffixes have no breakage, since under the skeleton every answer is the neutral one, so nothing the suffixes guard can show yet.

## Corrected after PR #27's third review

This README first said 13 of `247873d`'s breakages were moved where their anchor changed. The script's own diff against `247873d`'s shows 12 moved and `61`'s count brought up to the new cells; and `14`'s and `15`'s patterns, which at `247873d` accepted any count, were given the exact one (the third review's finding records 5). The run and its verdicts are unchanged.

## The first run of these 92

A first run, on the tree before its last change, is in `first-run/`. It missed one, closed before this run:

- `37 scanner-person-of-any-club`: with the check of a person's club taken out, the fresh review's new check, a person who joined after the viewer's last interval in the club ended, fired at the same path instead, since the viewer has no interval in that club at all. The scanner's verdict was still a `world` finding at `$.occurrence.star`, but `scanner.test.ts` "catches a day, its club and its people shown to someone with no interval in the club (T14)" compared paths only, so it didn't prove the check its name says. The test now pins each finding with its words ("a person of a club the viewer has no interval in (T14)").

## How to run them again

1. Check out the commit above in a working tree, with Node 26 and pnpm 12.16.1 (`docs/JOURNAL.md`, block 1.1, "How to run and check everything"), and run `pnpm install`.
2. Make a server like `ci`'s on port 5432 (`pgci.sh`, as root: it stops and deletes the cluster at `/var/lib/postgresql/pgci`, then `initdb --username=supabase_admin` with the password `postgres`, `ci`'s throwaway one, and starts it), then `python3 tools/ci/ci_steps.py db-bootstrap`. `FRESH=1 bash privtest.sh` does both.
3. Edit the paths at the top of `run_breakages.py`, `privtest.sh` and `dbtest.sh` (`ROOT`, `S`, the `cd`) to your working tree and this folder, then `python3 run_breakages.py`, with optional names to pick breakages. Nothing else may read or change the working tree while it runs, since it edits files in place.

The whole run takes about 16 minutes on the session's machine; `06` (the matrix with `frameworkErrors` removed) about 6 of them.

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
