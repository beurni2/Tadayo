# api/b2-worker-crash-report at b734a9d: the deliberate breakages

`docs/plans/api-b2-worker-crash-report.md` section 3. Each of K01 to K21 changes one thing in
`tools/ops/src`, runs `vitest run src/worker-scale.test.ts src/deploy-branch.test.ts src/fly.test.ts`
in `tools/ops`, and puts the file back (its SHA-256 checked after). A breakage is caught when vitest fails.

Run in the session with Node 26.13.0, at the tree of `b734a9d`, the branch's second commit (round 1 of
its review, the plan's section 5):

    python3 -I breakages_wr.py <worktree>/tools/ops > run.txt

Result: 21 of 21 caught (`run.txt`, with the first failing tests of each).

Since `ae15c32` (`../../ae15c32/breakages/`): K18 to K21 are new, one for each of round 1's code fixes
(F1 rows read cell by cell, F2 unread events can't be judged, F3 a failed look passed over, F6 no log
line for a start that held). K02, K06 and K17 point at the code as it now reads (K02 the filter of the
events new since the start, K06 the report in `watchStart`'s failure, K17 the slice after the "Event
Logs" title, as prettier now lays it out); each still breaks the same thing.
