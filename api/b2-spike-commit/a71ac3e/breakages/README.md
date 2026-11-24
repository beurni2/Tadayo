# PR #116, third commit `a71ac3e`: the slot's ownership, broken again

Round 2 of the review moved the slot's lock decision in `packages/domain/src/drops/commit.ts` to `ownsReservation`
(`packages/domain/src/authorization/add-target.ts`). The two breakages of the slot's ownership were run again on this
commit's tree, with `breakages.py C03 C04` (the runner of the second commit, `api/b2-spike-commit/c40ce4b/breakages/`,
unchanged), each against `tests/src/db/create-drop.test.ts` on a local Postgres 16 made as `ci`'s:

- C03, the slot's day not checked in `ownsReservation` (now both the lock's decision and the check): caught by
  "moves nothing: an upload made for another day, or a reservation_id naming another slot, is not found (T4)".
- C04, `reservation_id` not compared: caught by the same test.

`run.log` is the run; `out/` holds each change as a patch and its suite's output. `tree-before.txt` and
`tree-after.txt` hash every tracked file's content before and after: the same.
