# api/b2-db-limits at 65ad531: deliberate breakages

PR #126, the outside audit's A7, its first part: `tadayo_app`'s own time limits (migration 0018), the same two waits'
limits set again at the start of every API transaction (`services/api/src/connection.ts` `TRANSACTION_LIMITS`), the
two waits' timeouts (`55P03`, `57014`) answered with the bare 503 (`services/api/src/app.ts` `failed`), and the pools
sized on purpose (the API 6, the worker 2). The breakages are the plan's section 3 (`docs/plans/api-b2-db-limits.md`).

Run on 2026-11-24 in a detached scratch worktree of the PR's third commit, `65ad5318`, with Node 26.13.0 and a local
Postgres 16 cluster made like `ci`'s, by `breakages_a7.py` (here). Each entry changes one place, runs the suite
registered for it with `--fsModuleCache=false`, and counts as caught only when a test whose name holds the
pre-registered words fails. B01 to B03 change the migration, so the cluster was made again before each and once more,
with the real migration, after the last. Every file was restored after its entry (`git status` empty at the end).

16 of 16 caught, each by the test it names:

| Breakage | Change | Caught by |
|---|---|---|
| B01 | migration 0018 sets no `lock_timeout` | time-limits.test.ts, "are the role's own session defaults, which a new session as `tadayo_app` starts with" |
| B02 | no `statement_timeout` | the same |
| B03 | no `idle_in_transaction_session_timeout` | the same |
| B04 | `55P03` not mapped to the 503 | app.test.ts, "answers a lock it waited for too long and a statement too slow with the bare 503" |
| B04r | B04 again, against the audit's reproduction | time-limits.test.ts, "end the waits on a held row with the bare 503, let another person read meanwhile, and leave the same request to commit once later" |
| B05 | `57014` not mapped | app.test.ts, the lock and statement test |
| B06 | `25P03` mapped to the 503 as well | app.test.ts, "still answers any other failure of the database with the 500 and nothing in it" |
| B07 | every `PostgresError` mapped to the 503 | the same |
| B08 | the API's `max` left at the driver's default | services/api connection.test.ts, "opens at most six connections, a size set on purpose for the session pooler" |
| B09 | the worker's `max` left at the default | services/worker connection.test.ts, "opens at most two connections, one for each of its loops, ..." |
| B10 | the warning carries the error's message (T52) | app.test.ts, the lock and statement test |
| B11 | a 503 of its own, without `private, no-store` | the same |
| B12 | the API's transactions set no limits of their own | time-limits.test.ts, "are set again by each of the API's transactions, so they hold though its session started without them" |
| B13 | only a `begin` without options sets them | the same |
| B14 | the API's transactions set only the lock limit | the same |
| B15 | the wrapper returns a body's array to postgres.js unrun | the same |

Files: `run.txt`, the run's summary; `Bnn.patch`, each change; `Bnn.txt`, each suite's whole output; `breakages_a7.py`,
the script (its database URLs are the local cluster's CI-only ones, as in `tools/ci/ci_steps.py`).
