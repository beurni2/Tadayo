# PR #128 at `6fbf183`: round 3's fixes, the breakages

Branch `api/b2-matrix-built-rows`, fourth commit `6fbf183` (the outside audit's A4, review round 3). The plan is
`docs/plans/api-b2-matrix-built-rows.md` on the branch. Section 3 lists each breakage, and section 7 lists round 3's
findings.

Everything was run in the session, in a detached scratch worktree, on a local Postgres 16 cluster made like `ci`'s
service, with Node 26.13.0. Nothing else used the database meanwhile, and each file was restored after its entry
(`restored: ''` at the end of each run).

## `breakages/`: B1 to B30 with B5m, B1c, B2c, B9c and B21m

`run.txt` is the run and `breakages_a4.py` is the script. Each entry has its patch (`<code>.patch`) and the suite's
whole output (`<code>.txt`).

- "CAUGHT" means the registered test failed. Its name is registered with the entry.
- "CAUGHT IN THE FILE'S SETUP" means the matrix file failed before any test ran, with `checkBoundRows`'s own error,
  which names the binding and the value it registered.

All 35 entries are caught:

- 29 by their registered test.
- 6 in the file's setup: B1, B2, B9, B10 and B11, as at the earlier heads, and B30, an `upload_id` bound to an avatar,
  with the words "is a row of app.uploads in no club". B1c, B2c and B9c undo `checkBoundRows`'s throw, and each is
  caught by its row test.
- Round 3's eight:
  - B21m (B21 on the matrix's test of Home with a comment) and B24 (Home's refusal without the comment, its words
    kept) by that test.
  - B25 (the walk without round 1's rule) and B26 (an operation `hideComments` added to the contract) by the
    harness's walk.
  - B27 (the server counting only slots against a friend's photos) by the author's cells, and B28 (the same against a
    friend's link) by the cells of the member in the audience.
  - B29 (the requests after the commit's table left out) by the whole matrix's pins.
  - B30 in the file's setup.

The script takes `BREAK_SUITE` to run an entry on another suite. It was used only for `third-head/whole-file/`.

## `third-head/`: B27 and B28 on the third commit, `aa3ba4a`

The same two patches, run in a detached worktree of `aa3ba4a`, where each passes:

- `cells/`: each on the cells that catch it at this head (the author's, and the member in the audience's). Neither
  is caught: `Tests 1 passed | 24 skipped (25)`.
- `whole-file/`: each with the whole matrix file (`BREAK_SUITE=matrix-all`). Neither is caught: `Tests 25 passed
  (25)`.

So at the third head a server that counted only slots against a friend's photos, or against a friend's link, passed
the whole matrix, as review round 3 said (F3, F4). At this head, each is caught.
