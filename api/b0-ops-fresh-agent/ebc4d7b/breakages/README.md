# Deliberate breakages at ebc4d7b (api/b0-ops-fresh-agent, PR #53)

The commit that answers the fresh check of `e54c8ec`'s own diff, the last commit before the
founder is asked. The fix for `deploy-dev`'s probe (runs 43467951472 and 43478918447): each SSH
session gets a folder and a flyctl agent of its own (`tools/ops/src/fly.ts` `ownAgent`,
`tools/ops/src/on-machine.ts` `onMachine`; `docs/plans/api-b0-ops-fresh-agent.md`, section 5).

Each breakage makes one or two exact changes of text in `fly.ts` or `on-machine.ts`, runs
`npx vitest run src/fly.test.ts src/on-machine.test.ts` in `tools/ops`, and puts the file back. It
counts as caught only when the run fails and a line vitest marks as failed (`×` or `FAIL`) names the
test registered for it (a prefix of the test's name), or every one of them when an entry registers
several. The temporary folders an entry's tests leave (`tadayo-flyctl-*`, `tadayo-test-home-*`) are
removed after it and counted in `summary.txt`.

Result: **22 caught, 2 pinned, 0 missed, of 24** distinct changes (`summary.txt`).

- New since `e54c8ec` (the fresh check's finding e54-tests-1): `om-remove-after-a-timer`, the folder
  removed 2 ms into the session, before its call has ended. The removal-order test now holds the
  made-up session open for 25 ms and catches it, as it catches `om-remove-during-session` and
  `om-remove-after-one-tick`. A removal held back longer than 25 ms would pass that test; the code's
  own order (`await fly.run` inside the `try`) is what the other breakages pin.
- Pins, not defects caught, since a real run can't tell them apart: `fly-isolated-true` (flyctl
  0.5.8 reads `FLY_AGENT_ISOLATED=true` as it reads `1`, `env.IsTruthy`) and `fly-option-spawned`
  (the real `spawnProcess` reads only `cwd`, `env`, `input` and `timeoutMs`). The tests that catch
  them pin the design's literal.
- `breakages.py`: the runner and the list, run as
  `python3 -B breakages.py <a worktree detached at ebc4d7b> <out dir>` with Node 26.13.0.
- `<name>.patch`: the change, as `git diff` showed it.
- `<name>.txt`: the registered words, the exit code, the verdict, the folders left and vitest's
  whole output.
