# Deliberate breakages and the tests-first run of `api/b0-new-direction-db` at `826fa81`

PR #65's third commit fixes or answers review round 2. This folder holds its evidence (`docs/plans/api-b0-new-direction-db.md`, sections 4 and 7). The first commit's is in `../../9bfa059/breakages/`, the second's in `../../75a58c1/breakages/`.

- `breakages3.py`: the 78 entries, the second commit's 60 and 18 for round 2's rules and tests (B61 to B78). B57 now breaks the new AFTER INSERT trigger `comments_photo_used`, where the used mark moved. Each entry names its file, the exact line, its broken form, the test file, and the registered prefix of the test that must fail. For each it changes the line in a scratch worktree (never the branch's own), remakes a local Postgres 16 cluster made like `ci`'s, runs `python3 tools/ci/ci_steps.py db-bootstrap`, runs the named test file (whose global setup applies every migration), and restores the file. Caught means the registered test fails. Paths are shortened to `$SCRATCH`, `<scratch worktree>` and `<branch worktree>`.
- `breakages3.log`: its output. 77 of 78 are caught by their registered test. The one not caught, B09, is equivalent: a friend's two photos and one link, and the star's old six, already bound the total.
- `r2-before-75a58c1.log`: the third commit's five test files (`photo-messages`, `drops`, `kept`, `migrations`, `safety`) on the second commit's migrations: 1 failed (round 2's test of the used mark, which an `ON CONFLICT DO NOTHING` left set) and 85 passed. Round 2's other tests cover rules the schema already held, so they pass there; their breakages (B64 to B78) show each one catching its rule.
- `before_r2.sh`: the script that made it, and then put the third commit's migrations in the scratch worktree for the breakages.

The scratch worktree ran the third commit's migrations and tests byte for byte (compared with `cmp` before the run).

The row locks (the upload guard's membership and drop, the photo guard's upload, the removal guard's member and message) aren't broken on purpose: a test on one connection can't see a lock. B2 to B6's commands test the races they close.
