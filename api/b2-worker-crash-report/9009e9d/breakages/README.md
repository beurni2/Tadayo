# api/b2-worker-crash-report at 9009e9d: the deliberate breakages

`docs/plans/api-b2-worker-crash-report.md` section 3. Each of K01 to K24 changes one thing in
`tools/ops/src`, runs `vitest run src/worker-scale.test.ts src/deploy-branch.test.ts src/fly.test.ts`
in `tools/ops`, and puts the file back (its SHA-256 checked after). A breakage is caught when vitest fails.

Run in the session with Node 26.13.0, at the tree of `9009e9d`, the branch's third commit (round 2 of
its review, the plan's section 6):

    python3 -I breakages_wr.py <worktree>/tools/ops > run.txt

Result: 24 of 24 caught (`run.txt`, with the first failing tests of each).

Since `b734a9d` (`../../b734a9d/breakages/`): K19 now removes the refusal before the start (a start whose
events can't be read before it goes ahead, and old exits count as its own); K22 (no second read of the
events), K23 (a watch in which no look answered says the Machine stayed started) and K24 (a failure whose
events couldn't be read says its events are above) are new.

`round2-tests-on-b734a9d.txt`: `worker-scale.test.ts` at `9009e9d` run against `b734a9d`'s
`worker-scale.ts`: the three tests round 2 added or changed fail there.
