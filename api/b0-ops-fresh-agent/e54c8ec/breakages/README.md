# Deliberate breakages at e54c8ec (api/b0-ops-fresh-agent, PR #53)

The commit that answers round 2 of PR #53's review. The fix for `deploy-dev`'s probe (runs
43467951472 and 43478918447): each SSH session gets a folder and a flyctl agent of its own
(`tools/ops/src/fly.ts` `ownAgent`, `tools/ops/src/on-machine.ts` `onMachine`;
`docs/plans/api-b0-ops-fresh-agent.md`, section 5).

Each breakage makes one or two exact changes of text in `fly.ts` or `on-machine.ts`, runs
`npx vitest run src/fly.test.ts src/on-machine.test.ts` in `tools/ops`, and puts the file back. It
counts as caught only when the run fails and a line vitest marks as failed (`×` or `FAIL`) names the
test registered for it (a prefix of the test's name), or every one of them when an entry registers
several. The temporary folders an entry's tests leave (`tadayo-flyctl-*`, `tadayo-test-home-*`) are
removed after it and counted in `summary.txt`.

Result: **21 caught, 2 pinned, 0 missed, of 23** distinct changes (`summary.txt`).

- New since `e42b3a9` (round 2's finding tests-r2-1): `om-remove-after-one-tick`, the folder removed
  one awaited tick after the session's call starts, which the removal-order test now catches.
- `om-folder-not-given` is one change registered against the two tests it must fail; at `e42b3a9`
  and `4a6bb9b` it was run twice, under two names, and counted twice (round 2's tests-r2-2).
- Pins, not defects caught, since a real run can't tell them apart: `fly-isolated-true` (flyctl
  0.5.8 reads `FLY_AGENT_ISOLATED=true` as it reads `1`, `env.IsTruthy`) and `fly-option-spawned`
  (the real `spawnProcess` reads only `cwd`, `env`, `input` and `timeoutMs`). The tests that catch
  them pin the design's literal.
- `breakages.py`: the runner and the list, run as
  `python3 -B breakages.py <a worktree detached at e54c8ec> <out dir>` with Node 26.13.0.
- `<name>.patch`: the change, as `git diff` showed it.
- `<name>.txt`: the registered words, the exit code, the verdict, the folders left and vitest's
  whole output.
