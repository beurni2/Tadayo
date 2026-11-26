# A14's third part, after the first review: breakages and controls (commit 9ce4321)

The plan, `docs/plans/api-b2-server-time-types.md` on the branch `api/b2-server-time-types`, registers these in
section 3 (after the first review: T0 and C0 again, B15 now with the matrix, B16, P1 to P13) and records how they ran
in section 3.1. `run2.py` is the runner: each breakage is a text edit, applied to a detached worktree at `f5000a3`
holding a copy of this commit's code and tests (made before the commit, which holds them unchanged), run against the
suites registered for it, and undone; each edited file is copied before, restored from that copy after, and checked
equal to the tree's own. Each matrix run starts on a fresh Postgres 16 cluster in the session. A breakage's `.patch` is
its edit and its `.N.txt` the output of its Nth run; caught means the run failed, its output held every pattern
registered for it and none registered as absent. Each run's verdict is one line of a log below; `results.json` and
`control.json` hold only the last invocation's.

- `run-unit.log`: P1 to P13 on the slice's tree, each caught, naming its own (P13 in `harness.test.ts`, every other in
  `one-clock.test.ts`); then the controls on `main`'s tree: T0 (the slice's `one-clock.test.ts` on `main`'s code:
  caught, its list exactly the 25 found and not kept, and only `notBeforeReveal(at)` and `notBeforeReveal(revealAt)`
  kept and not found) and C0 (`main`'s `one-clock.test.ts`: passed, missed, as registered).
- `run-matrix.log`: B15 and B16 on the slice's tree. B15 (Home's `server_now` from `?since=`, with no cast): caught by
  `one-clock.test.ts`'s compile test (`branch/B15.0.txt`) and by the matrix as the member in the audience, on the
  request that sends the time names (`branch/B15.1.txt`). B16 (Home's `server_now` replaced by `?since=`'s text after
  `homeBody`): `one-clock.test.ts` passing, the miss registered beforehand (`branch/B16.0.txt`), and caught by the
  matrix the same way (`branch/B16.1.txt`).
- `run-matrix-first.log`: B15 and B16's first run on the slice's tree, and their controls on `main`'s tree (`main`'s
  compile test and matrix: passed, missed, as registered). On the slice both failed in the matrix as registered, but
  the runner's words had the request's quotes bare where vitest prints them escaped, so it judged them missing
  (`branch/first-run-B15-B16/`, kept as it ran). The words were corrected, and nothing else, and both run again
  (section 3.1).
- `branch/`: the slice's outputs and patches. `main/`: the controls' outputs and patches.
