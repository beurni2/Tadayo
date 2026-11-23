# Deliberate breakages of `api/b2-spike-commit` at `69c3d2c`

createDrop for a photo, spike S1's commit (`docs/plans/api-b2-spike-commit.md`). The breakages were run with
`breakages.py` on a detached copy of the slice's commit `27bdf992`, before `main` (`6cd94fd`, PR #115) was merged into
it. That merge changed only `.github/workflows/ios.yml`, `tools/ci/ios_steps_test.py`, `docs/JOURNAL.md` and
`docs/LIMITATIONS.md` (`git diff --stat 27bdf992 69c3d2c`), none of which these suites run, so the code each breakage
changes is the pushed head's.

39 breakages, each planted alone in one file of the slice, against the suite registered for it in `breakages.py`: the
Postgres tests (`tests/src/db/create-drop.test.ts`, codes C), the route tests (R), the pure rules (P), the privacy
matrix's judge (J) and the matrix itself through the route (M). A breakage is caught when its suite fails and a failing
test's name holds the words registered for it. All 39 were caught (`run1.log`, one `==` line each). There is no C15:
it was dropped as an equivalent mutation, one the code behaves the same under (the journal's entry of `27bdf992`).

For each: the change alone (`out/<code>.patch`) and the suite's output (`out/<code>.txt`). The file is restored after
each breakage, and the run's last line, `restored: ''`, is `git status --short` of the copy after the last one: nothing
left changed.

The local database is PostgreSQL 16 (the session's); `ci`'s Postgres 17 is the authority.
