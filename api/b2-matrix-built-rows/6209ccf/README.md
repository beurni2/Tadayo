# PR #128 at `6209ccf`: round 4's fixes, the breakages

Branch `api/b2-matrix-built-rows`, fifth commit `6209ccf` (the outside audit's A4, review round 4). The plan is
`docs/plans/api-b2-matrix-built-rows.md` on the branch. Section 3 lists each breakage, and section 8 lists round 4's
findings.

Everything was run in the session, in a detached scratch worktree of `6209ccf`, on a local Postgres 16 cluster made
like `ci`'s service, with Node 26.13.0. Nothing else used the database meanwhile, and each file was restored after its
entry (`restored: ''` at the end of the run).

## `breakages/`: B1 to B34 with B5m, B1c, B2c, B9c and B21m

`run.txt` is the run and `breakages_a4.py` is the script, as it was run: the fourth head's script given round 4's
entries (B31 to B34), B25's new anchor and the Home test's new name. Its docstring still says "at its fourth head"; the
entries are the fifth head's. Each entry has its patch (`<code>.patch`) and the suite's whole output (`<code>.txt`).

- "CAUGHT" means the registered test failed. Its name is registered with the entry.
- "CAUGHT IN THE FILE'S SETUP" means the matrix file failed before any test ran, with `checkBoundRows`'s own error,
  which names the binding and the value it registered.

All 39 entries are caught:

- 33 by their registered test.
- 6 in the file's setup: B1, B2, B9, B10, B11 and B30, as at the fourth head. B1c, B2c and B9c undo
  `checkBoundRows`'s throw, and each is caught by its row test.
- Round 4's four:
  - B31 (`ACTS_ON`'s entry for `getOccurrence` emptied, the reviewer's probe, R4-1) by the harness's walk test, "has
    every operation whose request or answer can name a comment take comment_id, act on it, or refuse one".
  - B32 (`hideThread` added to the contract, a comment only in its path, R4-3) by the walk test and the row tests.
  - B33 (a query parameter of `getClub` whose kinds hold `comment`, R4-3) by the walk test.
  - B34 (Home's refusal reading photos alone, R4-5) by the matrix's test "refuses the open page to each role that may
    see the commented drop, and gives every other role its own", on Ben's video link.
