# api/b2-privacy-blind-spots at a43d484: round 1's suites and the breakages, second pass

The outside audit's A14, its first part (`docs/plans/api-b2-privacy-blind-spots.md` on the branch), after round 1 of
PR #136's review (the plan's section 6). Each breakage is an edit to a file the slice doesn't change
(`packages/domain/src/authorization/read-sql.ts` and `read.ts`, `packages/domain/src/clubs/home.ts`,
`services/api/src/clubs/home.ts`, `db/migrations/0018_role_time_limits.sql`, `tests/src/privacy/home.ts`), applied in
place, run against the suites registered for it beforehand, and restored with `git checkout` and checked after. Every
Postgres or matrix run starts on a freshly made database (`db-bootstrap`).

Caught means the run exits non-zero and its output holds every word registered for it (`run.py`'s `words`). A run
registered beforehand as a miss (`misses(...)` in `run.py`) is as registered when it passes: B10's and B12's matrix runs
(the plan's section 4: the matrix's block role names Ben's interval in its own club, and Home reads drops only from days
its day choice keeps).

- `run.py`: the 33 breakages and the runner (`run.py <worktree> <out> [NAME ...] [--check] [--control]`).
- `out/`: each breakage's patch (`<name>.patch`) and each run's output (`<name>.<i>.txt`) at this commit's tests.
- `b9-first/`: B9 as first written, binding the query's string, which the API's instant type refuses, so the route
  answered 500 and the matrix failed for that. B9 in `out/` binds a `Temporal.Instant`, and the matrix fails on the moved
  time itself (Home's `club_today`, `next`, `recent_days` and `server_now`).
- `control/`: B9 and B10 under `main`'s tests (a worktree at `4c0ef93`), each passing, so missed; `control.json` holds
  these and the first pass's controls of B1 to B8 (`../../24efb67/breakages/control/`).
- `results-final.json`: every run's verdict (`merge2.py`: `out/` with B9's runs from the rewrite); `brk.md`: the table in
  the PR's body (`brkmd.py`).
- `suites/`: the whole suites at this commit's tests, each on a freshly made database where it needs one: `unit`,
  `tools-tests`, `db-tests` (951), `privacy` (526, 1440 s), `format`, `lint`, `typecheck`, `copy-lint`, `guards`.
