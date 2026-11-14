# Spike S5 (`api/b0-spike-time`): deliberate breakages at 45a1713

`45a1713` is PR #55's third commit, which answers round 1 of its review. `breakages.py` makes each of the
73 breakages of `docs/plans/api-b0-spike-time.md` section 5 in a detached checkout of `api/b0-spike-time`
at `45a1713` (`BRK_ROOT`), runs the tests it names with vitest, and puts the files back. A breakage is
caught only when the test registered for it (a part of its name, written before the run) is among the
failures; a failure of another test alone is not a catch.

`go.sh` is the whole run: `pgci.sh` remakes the local Postgres 16 cluster the way `ci`'s service is made
(`pg_dropcluster` and `pg_createcluster` 16, UTF-8 and the C.UTF-8 locale, `supabase_admin` its
superuser), `python3 tools/ci/ci_steps.py db-bootstrap` bootstraps it, each suite runs unbroken (the
"baseline" in `run.log`, all exit 0), then `breakages.py`.

`run.log` is the run at `45a1713`, Node 26.13.0: **73 of 73 caught**. `results.json` holds each
breakage's edits and failing tests; `out/` each breakage's vitest output.

What changed since the run at `5cd3822` (`../5cd3822/breakages/`, 60 of 62):

- The 62 breakages of that run, each with the same edit, all caught. One registration changed: "serializer:
  instants not cut to the second" is now registered to the test written for that rule, renamed in
  `45a1713` to `gives a day's instants in the contract's whole seconds, rounded down as server_now is`
  (it was `cuts an instant to whole seconds downwards, never up`, the test it failed in at `5cd3822`; the
  registration then named `gives each day as the contract's Occurrence`, whose instants are whole seconds,
  where the two serializations agree). "club: the candidate left unjoined", the gap found at `5cd3822`,
  is caught by the fixed `goes in whole through the schema's guards`.
- 11 new, one for each rule round 1 of the review added (the plan's section 5, "Added by the PR's first
  review"): the judge skipping an absent expectation (`account.test.ts`); in the live run
  (`spike-time.test.ts`), `before > 0` dropped from the check that answers came from both sides, the poll's
  interval changed, the may-be-left record dropped, `shown` naming the day from the answer's own star, the
  close watched after a reveal window with no answer, and the club's write awaited without the run's limit
  (`untilAborted`); in the runner (`run-remote.test.ts`), the club's transaction's limits set after
  `prepareClock`'s check, and the connection's end without its 5-second bound; a day under another club's id
  served (`list.test.ts`); and `state = 'active'` dropped from `writeClub`'s check of the account
  (`ops-spike-time.test.ts`).
