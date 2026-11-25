# PR #128 at `aa3ba4a`: round 2's fixes, the breakages

Branch `api/b2-matrix-built-rows`, third commit `aa3ba4a` (the outside audit's A4, review round 2). The plan is
`docs/plans/api-b2-matrix-built-rows.md` on the branch. Section 3 lists each breakage, and section 6 lists round 2's
findings.

Everything was run in the session, in a detached scratch worktree of the commit, on a local Postgres 16 cluster made
like `ci`'s service, with Node 26.13.0. Nothing else used the database meanwhile, and each file was restored after
its entry (`restored: ''` at the end of the run).

## `breakages/`: B1 to B23 with B5m, B1c, B2c and B9c

`run.txt` is the run and `breakages_a4.py` is the script (round 2's, which the journal's step (z) names). Each entry
has its patch (`<code>.patch`) and the suite's whole output (`<code>.txt`).

- "CAUGHT" means the registered test failed. Its name is registered with the entry.
- "CAUGHT IN THE FILE'S SETUP" means the matrix file failed before any test ran, with `checkBoundRows`'s own error,
  which names the binding and the value it registered.

All 27 entries are caught:

- 22 by their registered test.
- 5 in the file's setup (B1, B2, B9, B10 and B11), as at the second head. B1c, B2c and B9c undo `checkBoundRows`'s
  throw, and each is caught by its row test.
- Round 2's seven: B17 (the old order of the reservations' table) and B18 (the uploads' request under a link's slot
  left out) by the whole matrix's pins; B19, B20 and B21 by the harness's walk of the contract; B22 (a role cell's
  upload from another club) by the author's cells; B23 by the harness's guess test.

Round 3 of the review then found that B21 deletes the very words the harness test reads, so it can't show that Home
is held by what it answers. The fourth commit adds the matrix's test of Home with a comment, and its breakages
include B21 on that test and B24, which keeps the words.
