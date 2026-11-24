# PR #128 at `7b39998`: round 1's fixes, the breakages

Branch `api/b2-matrix-built-rows`, second commit `7b39998` (the outside audit's A4, review round 1). The plan is
`docs/plans/api-b2-matrix-built-rows.md` on the branch. Section 3 lists each breakage, and section 5 lists round 1's
findings.

Everything was run in the session, in a detached scratch worktree of the commit, on a local Postgres 16 cluster made
like `ci`'s service, with Node 26.13.0. Nothing else used the database meanwhile, and each file was restored after
its entry (`restored: ''` at the end of each run).

## `breakages/`: B1 to B16 with B5m, and B1c, B2c and B9c

`run.txt` is the run and `breakages_a4.py` is the script. Each entry has its patch (`<code>.patch`) and the suite's
whole output (`<code>.txt`).

- "CAUGHT" means the registered test failed. Its name is registered with the entry.
- "CAUGHT IN THE FILE'S SETUP" means the matrix file failed before any test ran, with `checkBoundRows`'s own error. That
  error names the binding and the value it registered: `comment_id's value guess_` (B1, B2 and B9), `upload_id's
  value rsv_` (B10) or `comment_id's value drp_` (B11).

All 20 entries are caught:

- 15 by their registered test.
- 5 in the file's setup (B1, B2, B9, B10 and B11). `checkBoundRows` runs in the `beforeAll` that makes the other club's
  world, so it fails the whole file before the row test or the cells run.
  - B1, B2 and B9 name `comment_id` through a built comment route, and its value is a fresh id.
  - B10 binds `upload_id` to a reservation.
  - B11 binds `comment_id` to Ben's photo.
- B1c, B2c and B9c repeat B1, B2 and B9 with `checkBoundRows`'s throw undone. Each is caught by the row test it was
  first registered with, so each layer catches the leak on its own.

## `breakages/first-run/`: the first run at this head

This is the same entries with the script as it stood (`first-run/breakages_a4.py`). That script judged only the
failed tests' names. So B1, B2, B9, B10 and B11 were printed "NOT CAUGHT", with every test skipped and the run exiting
1. Their outputs show the setup error quoted above. The script was then changed to read a failed file's `Error:` lines
against the words registered for each entry, and B1c, B2c and B9c were added. Nothing in the branch changed between
the two runs.

## `first-head/`: B8 and B9 on the first head `9bc33bc`

Round 1 said these would pass there. Both did, which confirms the review's two main gaps on the code it read.
`old_head.sh` ran them and `old_head.log` is its log.

- B8: the read predicate lets a video link through in any drop state. It passed the author's cells (`Tests  1 passed`).
- B9: a `listComments` that leaks comments, built with its row left `NONE` and the row check undone. It passed the
  matrix's row check and the author's cells (`Tests  2 passed`).
