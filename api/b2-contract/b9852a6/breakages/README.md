# B2's contract PR (#51): deliberate breakages at b9852a6

`breakages.py` makes each of the 30 breakages listed in `docs/plans/api-b2-contract.md` section 5 in a
checkout of `api/b2-contract` at `b9852a6` (set `TADAYO_ROOT`), runs the suites it names with vitest,
and puts the files back. A breakage is caught only when the test registered for it in `EXPECT` (the
start of its name) fails; a failure of another test alone, `openapi.yaml`'s check above all, is not a
catch, and a file that fails to load is a setup failure, not a catch.

`run.log` is the run at `b9852a6`, Node 26.13.0: 30 of 30 caught. `results.json` holds each breakage's
failing tests.
