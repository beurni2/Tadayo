# api/b2-health-check at 6f431f6: deliberate breakages

PR #127, the outside audit's A7, its second part: the contract's public `getHealth` (`GET /v1/health`), its handler
(`services/api/src/health.ts`: one `SELECT 1` through the API's pool, bounded at 2 s by its own timer, one probe at a
time and let go by a check that gives up on it; 204 or the bare 503), `fly.toml`'s HTTP service check on it, and the
privacy matrix's row. The breakages are the plan's section 3 (`docs/plans/api-b2-health-check.md`).

Run on 2026-11-24 in a detached scratch worktree of the PR's fourth commit, `6f431f62`, with Node 26.13.0 and a local
Postgres 16 cluster made like `ci`'s, by `breakages_a7h.py` (here; its output is `brk.out`). Each entry changes one
place, runs the suite registered for it with `--fsModuleCache=false`, and counts as caught only when a test whose name
holds the pre-registered words fails. Each file was restored after its entry (`git status` empty at the end). The
matrix entries ran `matrix.test.ts` filtered to one test (`-t`); their output names `getHealth` in every failure, and
B18's names `removeDevice`'s 500.

23 of 23 caught, each by the test it names:

| Breakage | Change | Caught by |
|---|---|---|
| B01 | the handler answers 204 without asking the database | health.test.ts, "answers the bare 503 when the query fails, and logs one warning by the error's class and code (T52)" |
| B01d | B01 on Postgres | db/health.test.ts, "answers the bare 503 within its bound while every connection of the pool is held, and 204 once they're free" |
| B02 | no bound: the handler awaits the query alone | health.test.ts, "answers the bare 503 at its bound when the query never comes back, and logs that it was slow" |
| B02d | B02 on Postgres | db/health.test.ts, the pool-held test |
| B03 | a failed query answered with the 500 | health.test.ts, the failed-query test |
| B04 | the 503 with a body | the same |
| B05 | the warning carries the error's message (T52) | the same |
| B06 | the bound 5 s, longer than Fly's 3 s timeout | health.test.ts, "gives up before Fly's own check timeout, so the API's answer is the one Fly reads" |
| B07 | `getHealth` behind the gate, not public | contract.test.ts, "needs no session for exactly the signed-out page, a logged-out device's removal and the health check" |
| B07m | B07, seen by the matrix | matrix.test.ts, "callers without a session…" (`getHealth`: 401, not 204) |
| B08 | `getHealth`'s 503 left out of the document | contract.test.ts, "documents a 503 only for the health check, with nothing in it, and no 404 where nothing is named…" |
| B09 | `NOT_FOUND` back on every public operation | the same |
| B10 | the handler queries a table | health.test.ts, "asks the database `SELECT 1` once, with nothing else: no table, no value, no transaction" |
| B11 | `fly.toml` keeps the TCP check | deploy-files.test.ts, "…asks the health route, not the port" |
| B12 | `fly.toml`'s check on another path | the same |
| B13 | `fly.toml`'s method in lower case | the same |
| B14 | the warning logged where the query fails, not by each check | health.test.ts, "logs nothing more when a query it gave up on fails later" |
| B15 | the timer left running after a 204 | health.test.ts, "leaves no timer behind once it has answered" |
| B16 | the signed-out callers' row judged as the neutral not-found | matrix.test.ts, "callers without a session…" |
| B16r | a role's row judged as the neutral not-found | matrix.test.ts, "answers the author as its account and its row say…" |
| B17 | every check sends its own query | health.test.ts, "shares one query among the checks that come while it is out, and sends a new one once it has come back" |
| B18 | `removeDevice` reads the database before it refuses a body | session.test.ts, "never ask who is calling, whatever the header says, and make no account" (`removeDevice`: 500, not 400) |
| B19 | a check that gives up keeps the probe | health.test.ts, "sends a new query once the checks gave up on the one that is out, so one stuck query fails no check after them" |

`tests-first-probe.txt`: the two probe tests run against the third commit's handler (`4657b290`: the stuck-query test
fails) and the first commit's (`82695087`: both fail).
