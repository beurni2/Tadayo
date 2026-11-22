# Deliberate breakages of `api/b2-reservations` (the plan's section 5)

Each breakage is one small change in place, run against the suites named for it, then restored byte for byte. "Caught" means at least one named suite exits non-zero; the first failing test of each suite is in the logs. `breakages.py` holds every change (its anchor, its replacement and its suites):

- `U`: `packages/domain`'s `src/drops` and `src/authorization/add-target.test.ts`;
- `R`: `services/api`'s `src/drops/reservations.test.ts`;
- `D`: `tests/src/db/reservations.test.ts` on Postgres 16, made as `ci.yml`'s service is;
- `J`: `tests/src/privacy/reservation.test.ts`, the matrix judge's own tests;
- `M`: `tests/src/privacy/matrix.test.ts`, the whole privacy matrix.

## Runs

- `breakages.log`, `breakages-all-first.json`: the first run of C01 to C22 and J01 to J12, 33 of 34 caught. J02 survived: it drops the judge's `outcome.kind === "held"` check on a settled slot, and a refusal's outcome has no interval, so the next check already excludes it; it changes nothing at runtime (an equivalent change). J13 drops both checks and is caught (`breakages-J13.json`). In that run C19's `D` failure was only the test file's cleanup failing on counters other runs had left in the database; C19 was caught by `U`.
- `breakages-c.log`, `breakages-C-clean.json`: C01 to C22 again on a freshly made cluster, 22 of 22 caught (C19 by `U` alone: its `D` run passes because before the reveal `placeable`'s own check of the star's leaving still holds the day, so the change shows only from the reveal on, which `add-target.test.ts` covers and the database test doesn't).
- `breakages-m.log`, `breakages-M1-M2-M3.json`: three changes run against the whole matrix, 3 of 3 caught: a lapse at `<` (M1), a refusal without its allowance (M2), and the reservations' table cut to its first step (M3, caught by the describe that checks each role's counts).

In all: 22 of 22 in the code, 12 of 13 in the judge with J02 equivalent and J13 caught, 3 of 3 in the matrix.

## At the PR's head, `b251f11`

The runs above were made on the tree before `prettier --write` and three lint fixes that change no rule. All of them ran again at the head, in a scratch worktree detached at `b251f11` (`BREAK_ROOT`), on a freshly made cluster:

- `breakages-head-cj.log`, `breakages-head-all.json`: C01 to C22 and J01 to J13, 34 of 35 caught, J02 the one equivalent change as before;
- `breakages-head-m.log`, `breakages-head-M1-M2-M3.json`: M1 to M3, 3 of 3 caught.

`breakages.py` here is the script as it ran at this head. Round 1 of the review changed several anchors and added breakages; that script and its runs are under the round 1 commit's own folder.
