# Spike S5 (`api/b0-spike-time`): deliberate breakages at 8504409

`8504409` is PR #55's fourth commit, which answers round 2 of its review. `breakages.py` makes each of the
75 breakages of `docs/plans/api-b0-spike-time.md` section 5 in a detached checkout of `api/b0-spike-time`
at `8504409` (`BRK_ROOT`), runs the tests it names with vitest, and puts the files back. A breakage is
caught only when the test registered for it (a part of its name, written before the run) is among the
failures; a failure of another test alone is not a catch.

`go.sh` is the whole run: `pgci.sh` remakes the local Postgres 16 cluster the way `ci`'s service is made
(`pg_dropcluster` and `pg_createcluster` 16, UTF-8 and the C.UTF-8 locale, `supabase_admin` its
superuser), `python3 tools/ci/ci_steps.py db-bootstrap` bootstraps it, each suite runs unbroken (the
"baseline" in `run.log`, all exit 0), then `breakages.py`.

`run.log` is the run at `8504409`, Node 26.13.0: **75 of 75 caught**. `results.json` holds each
breakage's edits and failing tests; `out/` each breakage's vitest output.

Since the run at `45a1713` (`../45a1713/breakages/`, 73 of 73): the same 73, each with the same edit, all
caught, and round 2's two (the plan's section 5, "Added by its second"): a 200 without the user's id taken
as no user made (`mayBeMade` without `made.status === 200`), caught by `names the address it may leave`;
and the Cache-Control header's value printed (`judge`'s old message), caught by `fails an answer with
another cache header`.
