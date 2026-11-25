# api/b2-privacy-blind-spots: the breakages of the plan's section 3

The outside audit's A14, its first part (`docs/plans/api-b2-privacy-blind-spots.md` on the branch). Each breakage is
an edit to a file the slice doesn't change (`packages/domain/src/authorization/read-sql.ts` and `read.ts`,
`packages/domain/src/clubs/home.ts`, `services/api/src/clubs/home.ts`, `tests/src/privacy/home.ts`), applied in
place, run against the suites registered for it beforehand, and restored with `git checkout` and checked after.
Every Postgres or matrix run starts on a freshly made database (`db-bootstrap`).

Caught means the run exits non-zero and its output holds every word registered for it (`run.py`'s `words`).

- `run.py`: the breakages and the runner (`run.py <worktree> <out> [NAME ...] [--check] [--control]`).
- `first-pass/`: each breakage's patch (`<name>.patch`) and each run's output (`<name>.<i>.txt`), and
  `results.json`. B7's matrix run failed with the manipulation named, but its words had been registered without
  the backslash the matrix's output puts before a quote, so it was judged "words missing".
- `b7-second-pass/`: B7 again, its words written as the output has them: caught.
- `results-final.json`: the first pass with B7's runs from the second (`merge.py`).
- `control/`: the same breakages under `main`'s tests (a worktree at `4c0ef93`), with `control.json`: a pass there
  is a breakage `main` missed. B5, no block at all, failed there: FQ88's role already caught it.
- `brk.md`: the table in the PR's body (`brkmd.py`).
