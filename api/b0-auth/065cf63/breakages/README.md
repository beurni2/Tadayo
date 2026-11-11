# Slice 8's breakage run at `065cf63`: the 143 of `510dbbc` again, and the 21 the review's fixes added

Each breakage is one exact change of text in one file of `api/b0-auth` (the files and how many each: `services/api/src/identity/token.ts` (30), `packages/domain/src/identity/update-me.ts` (21), `tests/src/privacy/account.ts` (20), `tests/src/privacy/scanner.ts` (20), `services/api/src/session.ts` (17), `packages/domain/src/clubs/club-list.ts` (14), `services/api/src/logging.ts` (10), `services/api/src/app.ts` (8), `services/api/src/identity/me.ts` (7), `packages/domain/src/identity/account.ts` (3), `services/api/src/answers.ts` (3), `services/api/src/start.ts` (3), `packages/domain/src/clubs/club-state.ts` (2), `services/api/src/clubs/list.ts` (2), `tests/src/privacy/harness.ts` (2), `packages/domain/src/clubs/invitation-state.ts` (1), `packages/domain/src/ids.ts` (1)). For each, the tests meant to catch it run, and the breakage counts as **CAUGHT** only if they fail (a non-zero exit) **and** their output holds the words expected for that breakage (`expected words` in its file): the name of the test meant to catch it, a count, or the words of an error or a finding that only the check in question writes, so a failure for another reason doesn't count. Each file is restored after its breakage; at the end, the worktree's whole diff and every untracked file matched their SHA-256 from before the run (`worktree restored` in `summary.txt`).

- **Commit:** `065cf6308537c0c5d85af5d6f49ea66a897cae31` on `api/b0-auth`, the commit that fixes what the independent review of PR #32 found. The run was made in a scratch worktree, a detached copy of that commit, apart from the branch's own worktree, so nothing else read or changed it while the files were being edited in place.
- **Server:** the session's PostgreSQL 16, made like `ci`'s service (ADR-026) by `pgci.sh`, with `tools/ci/ci_steps.py db-bootstrap`. `ci`'s Postgres 17 is the authority for the suites themselves.
- **Result:** 164 breakages: 164 caught, 0 missed. The run took 10 minutes 20 seconds (10:47:48 to 10:58:08 UTC on 2026-11-11).
- **Expected words:** 150 of the 164 patterns are a part of a test's own title (found among the titles of `services/api`, `packages/domain` and `tests/src`); the other 14 match the words of an error, a finding or a count that only the check in question writes (the scanner's findings, the harness's own messages, the verifier's `KeysUnavailable` troubles).
- **The 143 and the 21:** the first 143 are the changes of `api/b0-auth/510dbbc/breakages/` (all 143 caught there), here run again against the fixes' commit, whose changes touch some of the code and the tests they guard. The 21 marked `new` below are the ones the review's fixes added (21 caught): the body limits and the matrix's pin of the refusal made before a body is read, the harness's header order for it, a name that isn't well formed, the key set's three numbers, the invitation list's order and bound, `LOG_LEVEL`, and a rename's effect on an accepted roster. Their numbers sit among the old ones, from 105 on, since `breakages.py` keeps them with the code they change, so a file here is `NNN-<name>.txt` by its place in this script, not by its place in the earlier run.
- **Not run, equivalent:** the two changes that the run at `510dbbc` already left out as equivalent (`header.kid === ""` in the verifier's key check, and `up.state = 'ready'` in each of `findAccount`'s and `accountById`'s queries); their patches and the reasons are in `api/b0-auth/510dbbc/breakages/first-run/` and its README. One more change of the fixes has no breakage: `tests/src/db/identity.test.ts`'s new test of a deleted account's subject documents what the code does today (a shell with no subject is never found by its old one), and no line of the code is there for it to guard.

The 21 new:

- `105 body-limit-of-a-route-ignored`: caught
- `106 body-limit-raised-to-a-megabyte`: caught
- `107 body-limit-of-update-me-raised`: caught
- `108 matrix-updateMe-body-limit-raised`: caught
- `109 harness-unread-order-ignored`: caught
- `110 harness-pinned-always-keeps-the-connection`: caught
- `111 account-unread-form-not-closed`: caught
- `112 update-name-not-well-formed-taken`: caught
- `113 update-name-ascii-only`: caught
- `114 matrix-updateMe-a-lone-surrogate-is-taken`: caught
- `115 keys-cache-default-a-minute`: caught
- `116 keys-cache-default-a-day`: caught
- `117 keys-timeout-default-thirty-seconds`: caught
- `118 keys-pause-default-fifty-milliseconds`: caught
- `119 keys-cooldown-default-five-seconds`: caught
- `120 keys-cooldown-default-a-day`: caught
- `121 invitations-oldest-first`: caught
- `122 invitations-the-oldest-fifty`: caught
- `123 invitations-no-limit`: caught
- `124 start-log-level-always-info`: caught
- `125 update-a-rename-forgets-the-acceptance`: caught

## How to run them again

1. Check out the commit above in a working tree, with Node 26 and pnpm 12.16.1 (`docs/JOURNAL.md`, block 1.1, "How to run and check everything"), and run `pnpm install`.
2. Make a server like `ci`'s on port 5432 (`pgci.sh`, as root: it stops and deletes the cluster at `/var/lib/postgresql/pgci`, then `initdb --username=supabase_admin` with the password `postgres`, `ci`'s throwaway one, and starts it), then `python3 tools/ci/ci_steps.py db-bootstrap`. `FRESH=1 bash privtest.sh` does both.
3. Edit the paths at the top of `breakages.py`, `privtest.sh` and `dbtest.sh` (`ROOT`, `S`, the `cd`) to your working tree and this folder, or set `BREAK_ROOT`, `BREAK_OUT`, `BREAK_PRIV` and `BREAK_DB`; `python3 breakages.py --check` only counts the anchors (each text to change must occur the number of times stated), `python3 breakages.py` runs all, `--only NAME …` picks some (it has no other flag: an unknown one runs everything). Nothing else may read or change the working tree, or use the database, while it runs, since it edits files in place.

## The breakages

Each file holds the patch (file, old text, new text, count), the command, its exit code, the expected words, the verdict and the lines of the output that matter.

| # | Breakage | Verdict | Exit | | File |
|---|---|---|---|---|---|
| 001 | `verifier-algorithm-list-removed` | CAUGHT | 1 |  | `001-verifier-algorithm-list-removed.txt` |
| 002 | `verifier-accepts-a-keyed-hash-too` | CAUGHT | 1 |  | `002-verifier-accepts-a-keyed-hash-too.txt` |
| 003 | `verifier-any-audience` | CAUGHT | 1 |  | `003-verifier-any-audience.txt` |
| 004 | `verifier-any-issuer` | CAUGHT | 1 |  | `004-verifier-any-issuer.txt` |
| 005 | `verifier-any-role` | CAUGHT | 1 |  | `005-verifier-any-role.txt` |
| 006 | `verifier-anonymous-person-accepted` | CAUGHT | 1 |  | `006-verifier-anonymous-person-accepted.txt` |
| 007 | `verifier-subject-not-a-uuid` | CAUGHT | 1 |  | `007-verifier-subject-not-a-uuid.txt` |
| 008 | `verifier-subject-not-lowercased` | CAUGHT | 1 |  | `008-verifier-subject-not-lowercased.txt` |
| 009 | `verifier-no-key-id-accepted` | CAUGHT | 1 |  | `009-verifier-no-key-id-accepted.txt` |
| 010 | `verifier-expiry-not-required` | CAUGHT | 1 |  | `010-verifier-expiry-not-required.txt` |
| 011 | `verifier-oversize-token-accepted` | CAUGHT | 1 |  | `011-verifier-oversize-token-accepted.txt` |
| 012 | `verifier-accepts-every-token` | CAUGHT | 1 |  | `012-verifier-accepts-every-token.txt` |
| 013 | `verifier-key-trouble-is-no-session` | CAUGHT | 1 |  | `013-verifier-key-trouble-is-no-session.txt` |
| 014 | `verifier-empty-key-set-is-no-session` | CAUGHT | 1 |  | `014-verifier-empty-key-set-is-no-session.txt` |
| 015 | `verifier-unknown-key-id-is-can't-tell` | CAUGHT | 1 |  | `015-verifier-unknown-key-id-is-can't-tell.txt` |
| 016 | `keys-never-paused` | CAUGHT | 1 |  | `016-keys-never-paused.txt` |
| 017 | `keys-never-kept` | CAUGHT | 1 |  | `017-keys-never-kept.txt` |
| 018 | `keys-no-cooldown` | CAUGHT | 1 |  | `018-keys-no-cooldown.txt` |
| 019 | `project-any-host` | CAUGHT | 1 |  | `019-project-any-host.txt` |
| 020 | `project-plain-http` | CAUGHT | 1 |  | `020-project-plain-http.txt` |
| 021 | `project-issuer-without-the-auth-path` | CAUGHT | 1 |  | `021-project-issuer-without-the-auth-path.txt` |
| 022 | `project-key-set-at-the-wrong-path` | CAUGHT | 1 |  | `022-project-key-set-at-the-wrong-path.txt` |
| 023 | `gate-asks-for-public-routes` | CAUGHT | 1 |  | `023-gate-asks-for-public-routes.txt` |
| 024 | `gate-after-the-body` | CAUGHT | 1 |  | `024-gate-after-the-body.txt` |
| 025 | `gate-no-session-is-403` | CAUGHT | 1 |  | `025-gate-no-session-is-403.txt` |
| 026 | `gate-answers-by-cause` | CAUGHT | 1 |  | `026-gate-answers-by-cause.txt` |
| 027 | `gate-profile-never-checked` | CAUGHT | 1 |  | `027-gate-profile-never-checked.txt` |
| 028 | `gate-profile-checked-on-before-profile-routes` | CAUGHT | 1 |  | `028-gate-profile-checked-on-before-profile-routes.txt` |
| 029 | `profile-needs-only-the-age` | CAUGHT | 1 |  | `029-profile-needs-only-the-age.txt` |
| 030 | `profile-needs-only-a-name` | CAUGHT | 1 |  | `030-profile-needs-only-a-name.txt` |
| 031 | `gate-keys-unavailable-is-a-401` | CAUGHT | 1 |  | `031-gate-keys-unavailable-is-a-401.txt` |
| 032 | `gate-other-errors-are-a-401` | CAUGHT | 1 |  | `032-gate-other-errors-are-a-401.txt` |
| 033 | `authenticate-lets-a-deleting-account-in` | CAUGHT | 1 |  | `033-authenticate-lets-a-deleting-account-in.txt` |
| 034 | `authenticate-makes-no-account` | CAUGHT | 1 |  | `034-authenticate-makes-no-account.txt` |
| 035 | `bearer-any-scheme` | CAUGHT | 1 |  | `035-bearer-any-scheme.txt` |
| 036 | `bearer-case-sensitive` | CAUGHT | 1 |  | `036-bearer-case-sensitive.txt` |
| 037 | `bearer-token-with-spaces` | CAUGHT | 1 |  | `037-bearer-token-with-spaces.txt` |
| 038 | `app-gate-not-installed` | CAUGHT | 1 |  | `038-app-gate-not-installed.txt` |
| 039 | `app-500-echoes-the-error` | CAUGHT | 1 |  | `039-app-500-echoes-the-error.txt` |
| 040 | `app-request-line-not-logged` | CAUGHT | 1 |  | `040-app-request-line-not-logged.txt` |
| 041 | `answers-store-allowed` | CAUGHT | 1 |  | `041-answers-store-allowed.txt` |
| 042 | `answers-503-with-a-body` | CAUGHT | 1 |  | `042-answers-503-with-a-body.txt` |
| 043 | `answers-error-with-a-message` | CAUGHT | 1 |  | `043-answers-error-with-a-message.txt` |
| 044 | `me-serves-another-id` | CAUGHT | 1 |  | `044-me-serves-another-id.txt` |
| 045 | `me-serves-an-email` | CAUGHT | 1 |  | `045-me-serves-an-email.txt` |
| 046 | `me-says-null-for-no-name` | CAUGHT | 1 |  | `046-me-says-null-for-no-name.txt` |
| 047 | `update-key-not-checked` | CAUGHT | 1 |  | `047-update-key-not-checked.txt` |
| 048 | `update-key-uuid-v4-only` | CAUGHT | 1 |  | `048-update-key-uuid-v4-only.txt` |
| 049 | `update-unknown-field-named` | CAUGHT | 1 |  | `049-update-unknown-field-named.txt` |
| 050 | `update-version-ignored` | CAUGHT | 1 |  | `050-update-version-ignored.txt` |
| 051 | `update-conflict-hides-the-version` | CAUGHT | 1 |  | `051-update-conflict-hides-the-version.txt` |
| 052 | `update-bumps-the-version-on-no-change` | CAUGHT | 1 |  | `052-update-bumps-the-version-on-no-change.txt` |
| 053 | `update-age-overwritten` | CAUGHT | 1 |  | `053-update-age-overwritten.txt` |
| 054 | `update-receipt-not-replayed` | CAUGHT | 1 |  | `054-update-receipt-not-replayed.txt` |
| 055 | `update-conflicting-key-replays` | CAUGHT | 1 |  | `055-update-conflicting-key-replays.txt` |
| 056 | `update-name-before-the-age` | CAUGHT | 1 |  | `056-update-name-before-the-age.txt` |
| 057 | `update-avatar-before-the-age` | CAUGHT | 1 |  | `057-update-avatar-before-the-age.txt` |
| 058 | `update-avatar-of-anyone` | CAUGHT | 1 |  | `058-update-avatar-of-anyone.txt` |
| 059 | `update-avatar-of-any-purpose` | CAUGHT | 1 |  | `059-update-avatar-of-any-purpose.txt` |
| 060 | `update-avatar-not-ready-taken` | CAUGHT | 1 |  | `060-update-avatar-not-ready-taken.txt` |
| 061 | `update-locks-for-update` | CAUGHT | 1 |  | `061-update-locks-for-update.txt` |
| 062 | `update-no-lock` | CAUGHT | 1 |  | `062-update-no-lock.txt` |
| 063 | `update-a-deleting-account-edits` | CAUGHT | 1 |  | `063-update-a-deleting-account-edits.txt` |
| 064 | `update-answer-not-read-from-the-receipt` | CAUGHT | 1 |  | `064-update-answer-not-read-from-the-receipt.txt` |
| 065 | `update-input-not-checked` | CAUGHT | 1 |  | `065-update-input-not-checked.txt` |
| 066 | `account-insert-not-idempotent` | CAUGHT | 1 |  | `066-account-insert-not-idempotent.txt` |
| 067 | `account-made-at-the-wrong-clock` | CAUGHT | 1 |  | `067-account-made-at-the-wrong-clock.txt` |
| 068 | `account-subject-not-checked` | CAUGHT | 1 |  | `068-account-subject-not-checked.txt` |
| 069 | `clubs-a-left-club-is-listed` | CAUGHT | 1 |  | `069-clubs-a-left-club-is-listed.txt` |
| 070 | `clubs-the-count-includes-those-who-left` | CAUGHT | 1 |  | `070-clubs-the-count-includes-those-who-left.txt` |
| 071 | `clubs-newest-first` | CAUGHT | 1 |  | `071-clubs-newest-first.txt` |
| 072 | `clubs-no-limit` | CAUGHT | 1 |  | `072-clubs-no-limit.txt` |
| 073 | `invitations-of-anyone` | CAUGHT | 1 |  | `073-invitations-of-anyone.txt` |
| 074 | `invitations-of-joined-candidates` | CAUGHT | 1 |  | `074-invitations-of-joined-candidates.txt` |
| 075 | `invitations-without-an-inviter-name` | CAUGHT | 1 |  | `075-invitations-without-an-inviter-name.txt` |
| 076 | `invitations-live-name-only` | CAUGHT | 1 |  | `076-invitations-live-name-only.txt` |
| 077 | `invitation-never-did-not-go-ahead` | CAUGHT | 1 |  | `077-invitation-never-did-not-go-ahead.txt` |
| 078 | `club-never-suspended` | CAUGHT | 1 |  | `078-club-never-suspended.txt` |
| 079 | `club-state-suspended-ignored` | CAUGHT | 1 |  | `079-club-state-suspended-ignored.txt` |
| 080 | `club-state-paused-below-one` | CAUGHT | 1 |  | `080-club-state-paused-below-one.txt` |
| 081 | `invitation-state-ended-ignored` | CAUGHT | 1 |  | `081-invitation-state-ended-ignored.txt` |
| 082 | `clubs-server-now-with-a-fraction` | CAUGHT | 1 |  | `082-clubs-server-now-with-a-fraction.txt` |
| 083 | `clubs-open-day-listed` | CAUGHT | 1 |  | `083-clubs-open-day-listed.txt` |
| 084 | `new-id-not-random` | CAUGHT | 1 |  | `084-new-id-not-random.txt` |
| 085 | `log-fastify-lines-on` | CAUGHT | 1 |  | `085-log-fastify-lines-on.txt` |
| 086 | `log-request-id-from-the-header` | CAUGHT | 1 |  | `086-log-request-id-from-the-header.txt` |
| 087 | `log-request-id-a-counter` | CAUGHT | 1 |  | `087-log-request-id-a-counter.txt` |
| 088 | `log-redaction-off` | CAUGHT | 1 |  | `088-log-redaction-off.txt` |
| 089 | `log-redaction-email-unlisted` | CAUGHT | 1 |  | `089-log-redaction-email-unlisted.txt` |
| 090 | `log-redaction-top-level-only` | CAUGHT | 1 |  | `090-log-redaction-top-level-only.txt` |
| 091 | `log-error-message-kept` | CAUGHT | 1 |  | `091-log-error-message-kept.txt` |
| 092 | `log-request-line-with-the-url` | CAUGHT | 1 |  | `092-log-request-line-with-the-url.txt` |
| 093 | `log-request-and-answer-objects-kept` | CAUGHT | 1 |  | `093-log-request-and-answer-objects-kept.txt` |
| 094 | `log-level-ignored` | CAUGHT | 1 |  | `094-log-level-ignored.txt` |
| 095 | `start-no-supabase-url-check` | CAUGHT | 1 |  | `095-start-no-supabase-url-check.txt` |
| 096 | `start-log-level-unchecked` | CAUGHT | 1 |  | `096-start-log-level-unchecked.txt` |
| 097 | `matrix-token-with-no-key-id-accepted` | CAUGHT | 1 |  | `097-matrix-token-with-no-key-id-accepted.txt` |
| 098 | `matrix-gate-not-installed` | CAUGHT | 1 |  | `098-matrix-gate-not-installed.txt` |
| 099 | `matrix-a-deleting-account-is-let-in` | CAUGHT | 1 |  | `099-matrix-a-deleting-account-is-let-in.txt` |
| 100 | `matrix-getMe-serves-another-account` | CAUGHT | 1 |  | `100-matrix-getMe-serves-another-account.txt` |
| 101 | `matrix-listClubs-lists-a-club-that-was-left` | CAUGHT | 1 |  | `101-matrix-listClubs-lists-a-club-that-was-left.txt` |
| 102 | `matrix-updateMe-ignores-the-version` | CAUGHT | 1 |  | `102-matrix-updateMe-ignores-the-version.txt` |
| 103 | `matrix-an-unfinished-account-passes-the-gate` | CAUGHT | 1 |  | `103-matrix-an-unfinished-account-passes-the-gate.txt` |
| 104 | `matrix-another-issuer-accepted` | CAUGHT | 1 |  | `104-matrix-another-issuer-accepted.txt` |
| 105 | `body-limit-of-a-route-ignored` | CAUGHT | 1 | new | `105-body-limit-of-a-route-ignored.txt` |
| 106 | `body-limit-raised-to-a-megabyte` | CAUGHT | 1 | new | `106-body-limit-raised-to-a-megabyte.txt` |
| 107 | `body-limit-of-update-me-raised` | CAUGHT | 1 | new | `107-body-limit-of-update-me-raised.txt` |
| 108 | `matrix-updateMe-body-limit-raised` | CAUGHT | 1 | new | `108-matrix-updateMe-body-limit-raised.txt` |
| 109 | `harness-unread-order-ignored` | CAUGHT | 1 | new | `109-harness-unread-order-ignored.txt` |
| 110 | `harness-pinned-always-keeps-the-connection` | CAUGHT | 1 | new | `110-harness-pinned-always-keeps-the-connection.txt` |
| 111 | `account-unread-form-not-closed` | CAUGHT | 1 | new | `111-account-unread-form-not-closed.txt` |
| 112 | `update-name-not-well-formed-taken` | CAUGHT | 1 | new | `112-update-name-not-well-formed-taken.txt` |
| 113 | `update-name-ascii-only` | CAUGHT | 1 | new | `113-update-name-ascii-only.txt` |
| 114 | `matrix-updateMe-a-lone-surrogate-is-taken` | CAUGHT | 1 | new | `114-matrix-updateMe-a-lone-surrogate-is-taken.txt` |
| 115 | `keys-cache-default-a-minute` | CAUGHT | 1 | new | `115-keys-cache-default-a-minute.txt` |
| 116 | `keys-cache-default-a-day` | CAUGHT | 1 | new | `116-keys-cache-default-a-day.txt` |
| 117 | `keys-timeout-default-thirty-seconds` | CAUGHT | 1 | new | `117-keys-timeout-default-thirty-seconds.txt` |
| 118 | `keys-pause-default-fifty-milliseconds` | CAUGHT | 1 | new | `118-keys-pause-default-fifty-milliseconds.txt` |
| 119 | `keys-cooldown-default-five-seconds` | CAUGHT | 1 | new | `119-keys-cooldown-default-five-seconds.txt` |
| 120 | `keys-cooldown-default-a-day` | CAUGHT | 1 | new | `120-keys-cooldown-default-a-day.txt` |
| 121 | `invitations-oldest-first` | CAUGHT | 1 | new | `121-invitations-oldest-first.txt` |
| 122 | `invitations-the-oldest-fifty` | CAUGHT | 1 | new | `122-invitations-the-oldest-fifty.txt` |
| 123 | `invitations-no-limit` | CAUGHT | 1 | new | `123-invitations-no-limit.txt` |
| 124 | `start-log-level-always-info` | CAUGHT | 1 | new | `124-start-log-level-always-info.txt` |
| 125 | `update-a-rename-forgets-the-acceptance` | CAUGHT | 1 | new | `125-update-a-rename-forgets-the-acceptance.txt` |
| 126 | `scanner-me-id-not-judged` | CAUGHT | 1 |  | `126-scanner-me-id-not-judged.txt` |
| 127 | `scanner-me-any-id` | CAUGHT | 1 |  | `127-scanner-me-any-id.txt` |
| 128 | `scanner-me-any-name` | CAUGHT | 1 |  | `128-scanner-me-any-name.txt` |
| 129 | `scanner-me-any-avatar-version` | CAUGHT | 1 |  | `129-scanner-me-any-avatar-version.txt` |
| 130 | `scanner-me-any-age-confirmation` | CAUGHT | 1 |  | `130-scanner-me-any-age-confirmation.txt` |
| 131 | `scanner-me-any-version` | CAUGHT | 1 |  | `131-scanner-me-any-version.txt` |
| 132 | `scanner-me-of-an-account-the-world-lacks` | CAUGHT | 1 |  | `132-scanner-me-of-an-account-the-world-lacks.txt` |
| 133 | `scanner-me-for-a-caller-with-no-session` | CAUGHT | 1 |  | `133-scanner-me-for-a-caller-with-no-session.txt` |
| 134 | `scanner-invitation-id-not-judged` | CAUGHT | 1 |  | `134-scanner-invitation-id-not-judged.txt` |
| 135 | `scanner-invitation-the-world-lacks` | CAUGHT | 1 |  | `135-scanner-invitation-the-world-lacks.txt` |
| 136 | `scanner-invitation-of-anyone` | CAUGHT | 1 |  | `136-scanner-invitation-of-anyone.txt` |
| 137 | `scanner-invitation-any-club-name` | CAUGHT | 1 |  | `137-scanner-invitation-any-club-name.txt` |
| 138 | `scanner-invitation-any-inviter-name` | CAUGHT | 1 |  | `138-scanner-invitation-any-inviter-name.txt` |
| 139 | `scanner-invitation-already-a-membership` | CAUGHT | 1 |  | `139-scanner-invitation-already-a-membership.txt` |
| 140 | `scanner-accepted-invitation-names-not-the-viewers-text` | CAUGHT | 1 |  | `140-scanner-accepted-invitation-names-not-the-viewers-text.txt` |
| 141 | `scanner-every-invitation-names-are-the-viewers-text` | CAUGHT | 1 |  | `141-scanner-every-invitation-names-are-the-viewers-text.txt` |
| 142 | `scanner-accounts-not-unseen-ids` | CAUGHT | 1 |  | `142-scanner-accounts-not-unseen-ids.txt` |
| 143 | `scanner-invitations-not-unseen-ids` | CAUGHT | 1 |  | `143-scanner-invitations-not-unseen-ids.txt` |
| 144 | `scanner-cursor-may-hold-an-account-id` | CAUGHT | 1 |  | `144-scanner-cursor-may-hold-an-account-id.txt` |
| 145 | `scanner-cursor-may-hold-an-invitation-id` | CAUGHT | 1 |  | `145-scanner-cursor-may-hold-an-invitation-id.txt` |
| 146 | `judge-a-public-route-is-gated` | CAUGHT | 1 |  | `146-judge-a-public-route-is-gated.txt` |
| 147 | `judge-a-deleting-account-gets-the-403` | CAUGHT | 1 |  | `147-judge-a-deleting-account-gets-the-403.txt` |
| 148 | `judge-an-unfinished-account-is-gated-on-before-profile-routes` | CAUGHT | 1 |  | `148-judge-an-unfinished-account-is-gated-on-before-profile-routes.txt` |
| 149 | `judge-an-unfinished-account-passes-every-route` | CAUGHT | 1 |  | `149-judge-an-unfinished-account-passes-every-route.txt` |
| 150 | `judge-a-name-without-the-age-is-finished` | CAUGHT | 1 |  | `150-judge-a-name-without-the-age-is-finished.txt` |
| 151 | `judge-a-deleted-account-has-a-session` | CAUGHT | 1 |  | `151-judge-a-deleted-account-has-a-session.txt` |
| 152 | `judge-the-public-set-gains-a-route` | CAUGHT | 1 |  | `152-judge-the-public-set-gains-a-route.txt` |
| 153 | `judge-updateMe-expects-the-neutral` | CAUGHT | 1 |  | `153-judge-updateMe-expects-the-neutral.txt` |
| 154 | `judge-server-now-not-read` | CAUGHT | 1 |  | `154-judge-server-now-not-read.txt` |
| 155 | `judge-member-count-not-read` | CAUGHT | 1 |  | `155-judge-member-count-not-read.txt` |
| 156 | `judge-a-left-interval-is-a-club` | CAUGHT | 1 |  | `156-judge-a-left-interval-is-a-club.txt` |
| 157 | `judge-anothers-invitation-is-the-viewers` | CAUGHT | 1 |  | `157-judge-anothers-invitation-is-the-viewers.txt` |
| 158 | `judge-a-used-invitation-is-listed` | CAUGHT | 1 |  | `158-judge-a-used-invitation-is-listed.txt` |
| 159 | `judge-an-invitation-with-no-inviter-is-listed` | CAUGHT | 1 |  | `159-judge-an-invitation-with-no-inviter-is-listed.txt` |
| 160 | `judge-a-repeated-id-passes` | CAUGHT | 1 |  | `160-judge-a-repeated-id-passes.txt` |
| 161 | `judge-the-stale-version-is-not-the-current` | CAUGHT | 1 |  | `161-judge-the-stale-version-is-not-the-current.txt` |
| 162 | `judge-the-foreign-avatar-may-answer-anything` | CAUGHT | 1 |  | `162-judge-the-foreign-avatar-may-answer-anything.txt` |
| 163 | `judge-an-unfinished-accounts-avatar-names-another-field` | CAUGHT | 1 |  | `163-judge-an-unfinished-accounts-avatar-names-another-field.txt` |
| 164 | `judge-a-deleting-accounts-bodies-are-not-the-gates` | CAUGHT | 1 |  | `164-judge-a-deleting-accounts-bodies-are-not-the-gates.txt` |
