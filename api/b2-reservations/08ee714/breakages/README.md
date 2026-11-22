# Deliberate breakages of `api/b2-reservations`, round 2 (the plan's section 5)

Each breakage is one small change in place, run against the suites named for it, then restored byte for byte. "Caught" means at least one named suite exits non-zero; the first failing test of each suite is in the logs. `breakages.py` holds every change (its anchor, its replacement and its suites):

- `U`: `packages/domain`'s `src/drops` and `src/authorization/add-target.test.ts`;
- `R`: `services/api`'s `src/drops/reservations.test.ts`;
- `D`: `tests/src/db/reservations.test.ts` on Postgres 16, made as `ci.yml`'s service is;
- `J`: `tests/src/privacy/reservation.test.ts`, the matrix judge's own tests;
- `M`: `tests/src/privacy/matrix.test.ts`, the whole privacy matrix.

They ran in a scratch worktree holding the round 2 commit's tree (`BREAK_ROOT`), each set on a freshly made cluster. Round 2 adds the reviewer's three suggestions, C27 to C29, and changes the lock-wait test's holder to the command's own mode (`FOR NO KEY UPDATE`), which C02 and C24 must still fail.

## Runs

- `breakages-r2-c27-c29-first.log`, `breakages-r2-c27-c29-first.json`: C27 to C29 alone, 3 of 3 caught by `D`: the caller's `joined_at` read from their first interval (the Q06 test), a settle that takes the interval's lapsed slots from every day (`settles only the day's own counter`), the counter locked `FOR SHARE` (ten requests at once).
- `breakages-r2-cj.log`, `breakages-r2-cj.json`: C01 to C29 and J01 to J16 on a fresh cluster, 44 of 45 caught. J02 survived as at every earlier run (an equivalent change: a refusal's outcome has no interval, so the next check already excludes it). C02 (the counter read without its row lock) and C24 (the clock sampled before the counter's lock) are caught by the lock-wait test with its holder in the new mode.
- M1 to M5 were not run again: this commit changes nothing the matrix runs but a comment in the judge. Their run at `f47283d` (`../../f47283d/breakages/`, 5 of 5) stands.

In all, at the round 2 commit: 29 of 29 in the code, 15 of 16 in the judge with J02 equivalent, and 5 of 5 against the matrix at `f47283d`.
