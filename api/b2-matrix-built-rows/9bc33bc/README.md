# api/b2-matrix-built-rows at 9bc33bc (PR #128): the outside audit's A4

## tests-first/

- `hole-on-main.patch`, `hole_on_main.py`: on `main` at `f2ed830`, the audit's two leaking handlers (`deleteComment`
  answering a comment's body to any signed-in caller; `getEmbed` answering a video drop's source with no audience or
  reveal), their rows left `NONE`, added to the hand-written `BUILT` lists of `app.test.ts` and `session.test.ts`, the
  unbuilt pin moved from 39 to 37. Each answers the neutral not-found for an id of the wrong shape, as the built
  handlers do.
- `hole-on-main-app.txt`: `app.test.ts` and `session.test.ts`, 47 of 47 passed.
- `hole-on-main-harness.txt`: `harness.test.ts`, 84 of 84 passed.
- `hole-on-main-matrix.txt`: the whole `matrix.test.ts`, 24 of 24 passed in 585 s. The hole, as the audit found it.
- `new-tests-on-main.txt`: this branch's `harness.test.ts` on `main`'s code: 8 of 88 failed (the new tests,
  `bindingProblems` missing, `rowProblems` without its built parameter, one request for each operation that takes a
  drop).

## breakages/

`breakages_a4.py`, run in a detached scratch worktree of `9bc33bc`. Each entry changes the places its patch shows, runs
the suite named, and counts as caught only when a test whose name holds the pre-registered words fails. 8 of 8 caught:

| Code | Breakage | Suite | Caught by |
|---|---|---|---|
| B1 | the audit's `deleteComment`, built with its row left `NONE` | matrix, row test | "gives every operation of the contract a row, and the app a route for each, the preflight, and no other" (`deleteComment is built but its row is NONE`) |
| B2 | B1 with the row check undone | matrix, row test | the same test, through `bindingProblems` (`deleteComment is built and takes comment_id, which names no object of the matrix's world`) |
| B3 | the audit's `getEmbed`, built with its row left `NONE` | matrix, row test | the same test (`getEmbed is built but its row is NONE`) |
| B4 | B3 with the row check undone | matrix, the author's cells | "answers the author as its account and its row say, and leaks nothing the scanner can find": 1,743 problems, `getEmbed: status 200` with the video's provider and URL for the request that names Cleo's video link |
| B5 | `BUILT_OPERATIONS` leaves `getHome` out | `app.test.ts` | "answers every operation nobody has built yet with the neutral not-found, and nothing else" |
| B5m | B5 | matrix, row test | the row test (`getHome isn't built but its row isn't NONE`) |
| B6 | `upload_id`, which two built routes take, back to `"missing"` | `harness.test.ts` | "binds every Id parameter of every built route to an object of the world", and "refuses a built route that takes a parameter still marked missing…" |
| B7 | `specsFor` sends a parameter's first value only | `harness.test.ts` | "names each drop once as Ben's photo and once as Cleo's video link (the outside audit's A4)" |

Each `<code>.patch` is the change, each `<code>.txt` the run's whole output.
