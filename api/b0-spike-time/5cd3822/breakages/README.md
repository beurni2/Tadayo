# Spike S5 (`api/b0-spike-time`): deliberate breakages at 5cd3822

`breakages.py` makes each of the 62 breakages of `docs/plans/api-b0-spike-time.md` section 5 in a detached
checkout of `api/b0-spike-time` at `5cd3822` (`BRK_ROOT`), runs the tests it names with vitest (the
database ones against a local Postgres 16 made like `ci`'s, freshly made and bootstrapped first), and puts
the files back. A breakage is caught only when the test registered for it (a part of its name, written
before the run) is among the failures; a failure of another test alone is not a catch.

Before the breakages, each suite ran unbroken and passed (`run.log`, "baseline").

`run.log` is the run at `5cd3822`, Node 26.13.0: **60 of 62 caught**. `results.json` holds each
breakage's edits and failing tests; `out/` each breakage's vitest output.

The two misses:

- **"serializer: instants not cut to the second"** (`reveal_at` serialized with `toString()` instead of
  `contractInstant`): it failed, but in `cuts an instant to whole seconds downwards, never up`, not in the
  test registered for it, `gives each day as the contract's Occurrence`, whose days open and close on whole
  seconds, where the two serializations agree. The registration was wrong, not the tests: the test that
  failed is the one written for that rule. Not a gap.
- **"club: the candidate left unjoined"** (`writeClub` without `UPDATE app.candidates SET state =
  'joined'`): no test failed. The schema has no guard tying a roster membership to a joined candidate, and
  `goes in whole through the schema's guards` didn't read the candidate. A real test gap: with the
  candidate left open, Ben's own club list would still show Ben's invitation (listClubs leaves one out only
  once its candidate has joined). The next commit makes the test read the candidate's state and end, and
  `rerun.log` is that breakage run again at `5cd3822` with the fixed test file copied in: caught
  (`rerun-results.json`). The re-run ran the serializer's breakage again too, with the same result, so both breakages' `out/` files are the re-run's, replacing the first run's (the candidate's first run had no failure, as `results.json` records).

The breakages run again, all of them, at the PR's last head.
