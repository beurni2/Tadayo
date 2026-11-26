# api/b2-scanner-blind-spots at d76b977: round 1's breakages, controls and full runs

PR #137's second commit, the fixes for its first review round. The breakages are registered in
`docs/plans/api-b2-scanner-blind-spots.md` section 5.2 on the branch, and section 5.3 says how they ran. Every run
was on the branch's tree with round 1's fixes, uncommitted, whose code is `d76b977`'s (the commit added records only).

- `run.py`: the runner, with every breakage as finally registered (R2a and R2b after R2's run, M5 after M1's control
  run). Usage: `run.py <worktree> <out> [NAME...] [--control] [--check]`. Caught means the run exits non-zero and its
  output holds every registered pattern; in a control run, "failed" means the first commit's test caught it and
  "passed (missed)" means it did not. Each breakage's patch (`<name>.patch`) is its own change alone.
- `branch/` (`branch.log`, `results.json`): R1 to R9 and M1 to M4. All caught but R2, which failed its test on an
  assertion before its pattern (`R2.0.txt`: `keyWords("url2x")`).
- `branch-r2a-r2b/`: R2a and R2b, registered after R2's run: both caught.
- `branch-m5/`: M5, registered after M1's control run: caught, 518 problems in the cell as the member in the audience.
- `6459ad3-control/` (`6459ad3-control.log`, `control.json`): M1 to M4 in a worktree at `6459ad3` with its own
  matrix. M2, M3 and M4 missed; M1 caught, its 10 problems the branch's 10 (the refused commits that carry a caption
  repeat the caption of the drop just added, which the world stores).
- `6459ad3-control-m5/`: M5 at `6459ad3`: caught in 36 lines, each a label a world held; the branch's 518 against
  them are the lines that held a label no world held.
- `privacy.log`: `privacy` 540 of 540, 1,199 s, on a fresh cluster after `db-tests.log` (951 of 951).
