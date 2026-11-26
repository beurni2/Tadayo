# PR #137, round 3's breakages, control and runs (commit 49c3abf)

The plan, `docs/plans/api-b2-scanner-blind-spots.md` on the branch `api/b2-scanner-blind-spots`, registers these in
section 5.8 and records how they ran in section 5.9. `run.py` is the runner: each breakage is a text edit, applied,
run and undone; its `.patch` is the edit, its `.0.txt` the run's output.

- `branch/`: K13 to K20 (the scanner's and the log's unit tests) and N6 (the privacy matrix, the member in the
  audience's sweep), on the branch's tree with round 3's fixes before it was committed. `results.json` holds each
  verdict: all caught.
- `control-573967b/`: N6 again in a worktree at `573967b`, the third commit, with its own matrix (`control.json`):
  missed, as registered.
- `runs/`: `chain.sh` and `chain-status.txt` (what ran, in order, with exit codes and times); `unit`, `tools-tests`,
  `db-tests` (951 of 951, 123 s, on a fresh cluster) and `privacy` (542 of 542, 1,253 s, on another fresh cluster);
  `format`, `lint`, `typecheck` and `copy-lint`.
