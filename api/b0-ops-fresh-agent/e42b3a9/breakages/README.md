# Deliberate breakages at e42b3a9 (api/b0-ops-fresh-agent, PR #53)

The commit that answers round 1 of PR #53's review. The fix for `deploy-dev`'s probe (runs
43467951472 and 43478918447): each SSH session gets a folder and a flyctl agent of its own
(`tools/ops/src/fly.ts` `ownAgent`, `tools/ops/src/on-machine.ts` `onMachine`;
`docs/plans/api-b0-ops-fresh-agent.md`, section 5).

Each breakage makes one or two exact changes of text in `fly.ts` or `on-machine.ts`, runs
`npx vitest run src/fly.test.ts src/on-machine.test.ts` in `tools/ops`, and puts the file back. It
counts as caught only when the run fails and a line vitest marks as failed (`×` or `FAIL`) names the
test registered for it (a prefix of the test's name). The temporary folders an entry's tests leave
(`tadayo-flyctl-*`, `tadayo-test-home-*`) are removed after it and counted in `summary.txt`.

Result: **22 caught, 1 pinned, 0 missed, of 23** (`summary.txt`).

- New since `4a6bb9b` (round 1's findings tests-1, tests-2 and security-1):
  `om-remove-during-session` (the folder removed while the session's call is still running),
  `om-no-finally` and `om-remove-only-with-result` (the folder removed only after a call that
  returned).
- `fly-isolated-true` is a pin, not a defect caught: flyctl 0.5.8 reads `FLY_AGENT_ISOLATED=true`
  as it reads `1` (`env.IsTruthy`), so the change is an equivalent mutant; the test only pins the
  literal (round 1's finding tests-3). At `4a6bb9b` it was counted among the 20 caught.
- `breakages.py`: the runner and the list, run as
  `python3 -B breakages.py <a worktree detached at e42b3a9> <out dir>` with Node 26.13.0.
- `<name>.patch`: the change, as `git diff` showed it.
- `<name>.txt`: the registered words, the exit code, the verdict, the folders left and vitest's
  whole output.
