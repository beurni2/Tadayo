# Deliberate breakages of `api/b0-new-direction-db` at `9bfa059`

The database PR's two migrations, `db/migrations/0010_allowance_by_role.sql` and `db/migrations/0011_photo_messages.sql`, each broken one line at a time, to show that the test written for each rule catches it (`docs/plans/api-b0-new-direction-db.md`, section 7).

- `breakages.py`: the 47 entries (name, file, the exact line, its broken form, the test file, and the registered prefix of the test that must fail). For each it changes the line in a scratch worktree of the branch (never the branch's own), remakes a local Postgres 16 cluster made like `ci`'s, runs `python3 tools/ci/ci_steps.py db-bootstrap`, runs the named test file (whose global setup applies every migration), and restores the file. Caught means the registered test fails. Paths are shortened to `$SCRATCH` and `<scratch worktree>`.
- `breakages.log`: its output. 45 caught by their registered test; 2 not caught, both equivalent: B09 widens `contribution_counters_total_within_limit`, which a friend's two photos and one link, and the star's old six, already bound; B10 widens `contribution_counters_limits_by_role`, which only the trigger's two sets ever reach, since a caller can't name or change the limits.
- `before.log`: the tests written first, run against `main`'s schema (without `0010` and `0011`): 22 failed, 41 passed.
- `after.log`: the same files with the migrations: all passed.
