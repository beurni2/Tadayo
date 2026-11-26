# A14's third part: breakages and controls (commit 2c701b3)

The plan, `docs/plans/api-b2-server-time-types.md` on the branch `api/b2-server-time-types`, registers these in
section 3 and records how they ran in section 3.1. `run.py` is the runner: each breakage is a text edit, applied to a
detached worktree holding a copy of the slice's code and tests (made before the commit, which holds them unchanged),
run against the suites registered for it, and undone; each edited file is copied before, restored from that copy
after, and checked equal to the tree's own. A breakage's `.patch` is its edit, its `.N.txt` the output of its Nth run,
and `results.json` (or `control.json`) each verdict: caught means the run failed, its output held every pattern
registered for it and none registered as absent.

- `f5000a3/`: the runs on `main` at `f5000a3` (PR #137 merged), the commit's own base.
  - `branch/`: B15 (Home's `server_now` from `?since=`, with no cast; `.0.txt` the unit run, caught by
    `one-clock.test.ts`'s compile test; `.1.txt` the matrix as the member in the audience, passing, the miss
    registered beforehand) and P1 to P7, each caught.
  - `main/`: the controls on `main`'s own tree: T0 (the slice's `one-clock.test.ts` on `main`'s code: caught, the
    list test naming exactly the 21), C0 (`main`'s `one-clock.test.ts`: passed, missed, as registered) and B15's
    control (`main`'s test with B15's edit: passed, missed).
- `60770d5/`: the second run on `main` at `60770d5`, where the slice began: T0, C0, B15's control and P1 to P7, as at
  `f5000a3`.
- `first-run/`: the first run at `60770d5`, kept as it ran. P2, P6 and P7 weren't as registered there, each for a
  reason of the run's own making (section 3.1): P2's edit left `home.ts`'s import of `ServerNow`, which
  `noUnusedLocals` refused; P6 and P7 stopped at the planted test's first failing case, which now compares every case
  at once.
