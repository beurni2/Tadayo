# Deliberate breakages at 4a6bb9b (api/b0-ops-fresh-agent)

The fix for `deploy-dev`'s first run (run 43467951472): each SSH session gets a folder and a flyctl
agent of its own (`tools/ops/src/fly.ts` `ownAgent`, `tools/ops/src/on-machine.ts` `onMachine`;
`docs/plans/api-b0-ops-fresh-agent.md`, section 5).

Each breakage makes one or two exact changes of text in `fly.ts` or `on-machine.ts`, runs
`npx vitest run src/fly.test.ts src/on-machine.test.ts` in `tools/ops`, and puts the file back. It
counts as caught only when the run fails and a line vitest marks as failed (`×` or `FAIL`) names the
test registered for it (a prefix of the test's name).

Result: **20 caught, 0 missed, of 20** (`summary.txt`).

- `breakages.py`: the runner and the list, run as
  `python3 -B breakages.py <a worktree detached at 4a6bb9b> <out dir>` with Node 26.13.0.
- `<name>.patch`: the change, as `git diff` showed it.
- `<name>.txt`: the registered words, the exit code, the verdict and vitest's whole output.
