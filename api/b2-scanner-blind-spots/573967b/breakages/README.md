# PR #137, round 2's breakages, controls and runs (commit 573967b)

The plan, `docs/plans/api-b2-scanner-blind-spots.md` on the branch `api/b2-scanner-blind-spots`, registers these in
section 5.5 and records how they ran in section 5.6. `run.py` is the runner: each breakage is a text edit, applied,
run and undone; its `.patch` is the edit, its `.0.txt` the run's output.

- `branch/`: K1 to K12 and K8a (the scanner's and the log's unit tests) and N1 to N5 (the privacy matrix, one role's
  sweep or the callers without a session), on the branch's tree with round 2's fixes before it was committed.
  `results-K1-K12.json`, `results-K8a.json` and `results.json` (N1 to N5) hold each verdict.
- `control-d76b977/`: N1 to N5 again in a worktree at `d76b977`, the second commit, with its own matrix
  (`control.json`).
- `runs-first/`: the first full runs on a fresh cluster: `db-tests` 951 of 951, and `privacy` 542 of 542 in 2,215 s,
  the time that found each step's line count walking the whole log.
- `runs-final/`: `privacy` 542 of 542 in 1,219 s after that fix, on a fresh cluster, and the unit, lint, format,
  typecheck, copy-lint and tools-tests logs.
- `timing/`: one role's sweep (`-t "answers the member in the audience as|wrote one request line for every request"`)
  before the fix (107 s), after it (93 s) and at `d76b977` (88 s).
