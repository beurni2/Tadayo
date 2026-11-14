# Spike S5 (`api/b0-spike-time`): deliberate breakages at 9f661e8

`9f661e8` is PR #55's sixth commit (merges aside), which answers a last check of its fifth (`c860ef5`):
a run refused outside its start window (06:45 to 06:57 in New York on a weekday by `dev`'s clock,
`tools/ops/src/spike-time.ts` `startDay`) writes no club and moves nothing, while the account it made at
sign-in stays, as after any run; the refusal now reads the clock to the microsecond when the sample has a
fraction. `breakages.py` makes each of the 78 breakages of `docs/plans/api-b0-spike-time.md` section 5 in
a detached checkout of `api/b0-spike-time` at `9f661e8` (`BRK_ROOT`), runs the tests it names with
vitest, and puts the files back. A breakage is caught only when the test registered for it (a part of its
name, written before the run) is among the failures; a failure of another test alone is not a catch.

`go.sh` is the whole run: `pgci.sh` remakes the local Postgres 16 cluster the way `ci`'s service is made
(`pg_dropcluster` and `pg_createcluster` 16, UTF-8 and the C.UTF-8 locale, `supabase_admin` its
superuser), `python3 tools/ci/ci_steps.py db-bootstrap` bootstraps it, each suite runs unbroken (the
"baseline" in `run.log`, all exit 0), then `breakages.py`.

`run.log` is the run at `9f661e8`, Node 26.13.0: **78 of 78 caught**. `results.json` holds each breakage's edits
and failing tests; `out/` each breakage's vitest output.

Since the run at `c860ef5` (`../c860ef5/breakages/`, 78 of 78): the same 78, each with the same edit and
registered to the same test. The sixth commit changes only `startDay`'s error message and its reading of
the clock, comments, and the records; none of the 78 edits touches a changed line.
