# api/b2-worker-crash-report at ae15c32: the deliberate breakages

`docs/plans/api-b2-worker-crash-report.md` section 3. Each of K01 to K17 changes one thing in
`tools/ops/src`, runs `vitest run src/worker-scale.test.ts src/deploy-branch.test.ts src/fly.test.ts`
in `tools/ops`, and puts the file back (its SHA-256 checked after). A breakage is caught when vitest fails.

Run in the session with Node 26.13.0, at the tree of `ae15c32`:

    python3 -I breakages_wr.py <worktree>/tools/ops > run.txt

Result: 17 of 17 caught (`run.txt`, with the first failing tests of each). A first form of K08, which
changed the regular expression of `exitOf` without changing what it reads, was an equivalent change and
was replaced by the one here (`requested` always false).
