# Deliberate breakages of `api/b2-reservations`, round 1 (the plan's section 5)

Each breakage is one small change in place, run against the suites named for it, then restored byte for byte. "Caught" means at least one named suite exits non-zero; the first failing test of each suite is in the logs. `breakages.py` holds every change (its anchor, its replacement and its suites):

- `U`: `packages/domain`'s `src/drops` and `src/authorization/add-target.test.ts`;
- `R`: `services/api`'s `src/drops/reservations.test.ts`;
- `D`: `tests/src/db/reservations.test.ts` on Postgres 16, made as `ci.yml`'s service is;
- `J`: `tests/src/privacy/reservation.test.ts`, the matrix judge's own tests;
- `M`: `tests/src/privacy/matrix.test.ts`, the whole privacy matrix.

They ran in a scratch worktree holding the round 1 commit's tree (`BREAK_ROOT`), each set on a freshly made cluster. Round 1 changed the anchors of C02 (the counter now `FOR NO KEY UPDATE`), C14 (the owner rule now `ownsReservation` in `add-target.ts`) and J13, and added C23 to C26, J14 to J16, M4 and M5 for the round's fixes and tests.

## Runs

- `breakages-r1-cj-first.log`: C01 to C26 and J01 to J16, 40 of 42 caught. J02 survived as at every earlier run (an equivalent change: a refusal's outcome has no interval, so the next check already excludes it). C23 survived: it sets a lapsed slot's `ended_at` to the clock's sample instead of its own `expires_at`, and the lapse test, though it settles a slot a quarter of an hour late, matched `ended_at` with `toMatchObject`, which takes any two `Temporal.Instant` values as equal (it sees no fields in one). `tests/src/db/reservations.test.ts` now matches a reservation's instants as strings (`slotRow`).
- `breakages-r1-cj.log`, `breakages-r1-cj.json`: C01 to C26 and J01 to J16 again after that change, 41 of 42 caught, J02 the one equivalent change; C23 caught by `D`.
- `breakages-r1-m.log`, `breakages-r1-m.json`: M1 to M5 against the whole matrix, 5 of 5 caught: a lapse at `<` (M1), a refusal without its allowance (M2), the table cut to its first step (M3), anyone may give back a slot (M4, caught by the per-request judge), and Cleo's slot never given back (M5, caught by the describe that counts who got it back). The change to the database test file came after this run and touches nothing the matrix runs.

In all, at the round 1 commit: 26 of 26 in the code, 15 of 16 in the judge with J02 equivalent, 5 of 5 in the matrix.
