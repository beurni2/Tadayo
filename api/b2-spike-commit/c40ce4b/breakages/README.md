# Deliberate breakages of `api/b2-spike-commit` at `c40ce4b`

createDrop for a photo, spike S1's commit (`docs/plans/api-b2-spike-commit.md`), at the commit that records round 1
of PR #116's review. The breakages were run with `breakages.py` in the branch's own worktree at `c40ce4b`, nothing
else using the local database meanwhile, on a database made afresh as `ci`'s (`db-bootstrap` first).

42 breakages, each planted alone in one file of the slice, against the suite registered for it in `breakages.py`: the
Postgres tests (`tests/src/db/create-drop.test.ts`, codes C and K), the route tests (R), the pure rules (P), the
privacy matrix's judge (J) and the matrix itself through the route (M). A breakage is caught when its suite fails and a
failing test's name holds the words registered for it. All 42 were caught (`run2.log`, one `==` line each). There is
no C15: it was dropped as an equivalent mutation (the journal's entry of `27bdf992`).

New or changed since `69c3d2c` (round 1):

- C03 now removes `ownsReservation`'s check of the slot's day (P2: the commit no longer compares it itself).
- K01 reserves the receipt by a look and then an insert (C3's test: the same send arriving twice at once).
- K02 drops the lock on the day's own row (ADR-013's test: a commit held on the day across 07:00 is refused).
- K03 answers a retry from the stored receipt when the star can't be named (C1's test, after the reveal too).

For each: the change alone (`out/<code>.patch`) and the suite's output (`out/<code>.txt`). The file is restored after
each breakage, and the run's last line, `restored: ''`, is `git status --short` after the last one: nothing left
changed. `tree-before.txt` and `tree-after.txt` are `git write-tree` before the run and after it: the same.

The local database is PostgreSQL 16 (the session's); `ci`'s Postgres 17 is the authority.
