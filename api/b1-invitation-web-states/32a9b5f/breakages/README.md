# PR #117, third commit (32a9b5f): the breakages

`breakages.py` plants each of Y01 to Y16 in `apps/web` (one at a time, restoring the file after), runs `npx vitest run` in `apps/web`, and prints whether a test caught it. Y01 to Y15 are round 1's fixes; Y16 is round 2's: the hold measuring the status block after the checking shows, which holds nothing.

- `run.log`: all 16 caught, at the third commit's tree.
- `before.sha`, `after.sha`: the hash of `apps/web/public` and `apps/web/src` before and after the run; their last lines are the same, so nothing was left planted.
