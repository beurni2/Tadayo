# api/b2-scanner-blind-spots at 6459ad3: breakages, controls and timings

The outside audit's A14, its second part. The breakages are registered in
`docs/plans/api-b2-scanner-blind-spots.md` section 3 on the branch, and section 3.1 says how they ran.

- `run.py`: the runner as run on `270c3db` (S6 in `getMe`'s handler alone). `run-first.py`: as run on
  `1a416e2` (S6 in `meBody`, which made `updateMe` answer 500). Usage: `run.py <worktree> <out> [NAME...] [--control]`.
  Caught means the run exits non-zero and its output holds every registered pattern; in a control run, "failed"
  means `main`'s test failed (caught it) and "passed (missed)" means it did not.
- `1a416e2-branch/`, `270c3db-branch/`: each breakage's patch (`<name>.patch`), each run's output
  (`<name>.<n>.txt`) and `results.json`, on the branch's tree with the slice applied. All 19 runs caught at both.
- `1a416e2-main-control/`, `270c3db-main-control/`: the same edits on `main` with `main`'s tests (`control.json`).
  `main`'s matrix caught S1, S2, S3, S5 and S7 through its judges (they compare those answers whole), and its
  `contract.test.ts` caught the same five because the example answers lack the new required key. Missed by both:
  S4; S6 as moved; L1 and L3 by `main`'s matrix. S6 at `1a416e2` failed on `updateMe`'s 500s.
- `270c3db-branch-privacy.log` (537 of 537, 1,262 s) and `270c3db-main-privacy.log` (`main`'s 526 of 526,
  1,068 s), the same machine, one after the other: the log scan adds about 18%.
- `270c3db-branch-db-tests.log`: 951 of 951.
- `tests-first-*.log`: the new tests on `main`'s scanner and logger before the change (`scanner.test.ts` 10 of 106
  failed; `logging.test.ts` 3 of 11, then 5 of 12 with section 1.5's test).
