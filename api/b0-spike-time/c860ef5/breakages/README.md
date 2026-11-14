# Spike S5 (`api/b0-spike-time`): deliberate breakages at c860ef5

`c860ef5` is PR #55's fifth commit (merges aside), which answers the fresh check of its fourth: the run
now refuses, writing and moving nothing, unless its club is written between 06:45 and 06:57 in New York on
a weekday by `dev`'s clock (`tools/ops/src/spike-time.ts` `startDay`). `breakages.py` makes each of the
78 breakages of `docs/plans/api-b0-spike-time.md` section 5 in a detached checkout of `api/b0-spike-time`
at `c860ef5` (`BRK_ROOT`), runs the tests it names with vitest, and puts the files back. A breakage is
caught only when the test registered for it (a part of its name, written before the run) is among the
failures; a failure of another test alone is not a catch.

`go.sh` is the whole run: `pgci.sh` remakes the local Postgres 16 cluster the way `ci`'s service is made
(`pg_dropcluster` and `pg_createcluster` 16, UTF-8 and the C.UTF-8 locale, `supabase_admin` its
superuser), `python3 tools/ci/ci_steps.py db-bootstrap` bootstraps it, each suite runs unbroken (the
"baseline" in `run.log`, all exit 0), then `breakages.py`.

`run.log` is the run at `c860ef5`, Node 26.13.0: **78 of 78 caught**. `results.json` holds each breakage's edits
and failing tests; `out/` each breakage's vitest output.

Since the run at `8504409` (`../8504409/breakages/`, 75 of 75): the same 75, each with the same edit, and
the fresh check's three (the plan's section 5, "Added by its fresh check"): the club written whatever
`dev`'s clock reads (`writeClub` calling `firstDate` in place of `startDay`), registered to `refuses a
clock outside the run's start window`; the start window an hour wide (`WITHIN_MINUTES` 60), registered to
`refuses, saying what dev's clock reads`; and a club written fifteen minutes ahead refused (`>=` for `>`
in `startDay`), registered to `is the first day only when the club is written`. `main` at `9757303`,
merged in as `6de3fa7`, changes none of the files they break or the tests that catch them.
