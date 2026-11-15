# Deliberate breakages and tests-first runs of `api/b0-new-direction-db` at `75a58c1`

PR #65's second commit fixes or answers review round 1. This folder holds its evidence (`docs/plans/api-b0-new-direction-db.md`, sections 4 and 7). The first commit's is in `../../9bfa059/breakages/`.

- `breakages2.py`: the 60 entries, the first commit's 47 and 13 for round 1's rules and tests (B48 to B60), with B10 registered against the new test of the limits' CHECK with the trigger off. Each entry names its file, the exact line, its broken form, the test file, and the registered prefix of the test that must fail. For each it changes the line in a scratch worktree (never the branch's own), remakes a local Postgres 16 cluster made like `ci`'s, runs `python3 tools/ci/ci_steps.py db-bootstrap`, runs the named test file (whose global setup applies every migration), and restores the file. Caught means the registered test fails. Paths are shortened to `$SCRATCH`, `<scratch worktree>` and `<branch worktree>`.
- `breakages2.log`: its output. 59 of 60 are caught by their registered test. The one not caught, B09, is equivalent: a friend's two photos and one link, and the star's old six, already bound the total. B10, called equivalent at the first commit, is now caught by the test with the trigger off.
- `r1-before-9bfa059.log`: the final five test files (`photo-messages`, `drops`, `kept`, `migrations`, `safety`) on the first commit's migrations: 4 failed (round 1's used-upload and never-deleted rules, and `kept.test.ts`'s list), 81 passed.
- `r1-before-main.log`: the same files on `main`'s schema at `0cf30f3`, without `0010` and `0011`: 27 failed, 58 passed.
- `before_r1.sh`: the script that made both.

The scratch worktree ran the second commit's migrations and tests byte for byte, except `tests/src/db/photo-messages.test.ts`, which Prettier then rewrapped in two places (a function's parameters onto one line, and a call onto six); no statement changed (`prettier.diff`).

The row locks (the upload guard's membership and drop, the photo guard's upload, the removal guard's member and message) aren't broken on purpose: a test on one connection can't see a lock. B2 to B6's commands test the races they close.
