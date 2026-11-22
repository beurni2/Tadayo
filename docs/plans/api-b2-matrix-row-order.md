# api lane: the privacy matrix compares a table of rows whatever order it was read in (`api/b2-matrix-row-order`)

`main`'s `ci` on `6a6f0b0` (PR #107's merge, 17:27 UTC on 2026-11-22), run 45049511272, first attempt: the `postgres` job's `privacy` step failed 5 of 418 tests, all from one cell. In the author's role, in the drop's state "removed by moderation" and the phase "collecting", the reservations' table (step 11 (r), PR #105) flagged `createReservation: a request under a key that kept a slot changed a reservation (T19) (another body under the first one's key)`. The other four failures follow from that one: the author's role stopped before it stored its counts, so the roster's, the leave's and the reservations' tables each counted 11 roles of 12. The tree is the one PR #107's `ci` passed at `8cf461c` (run 45046584263), with no difference (`git diff 8cf461c 6a6f0b0` is empty), and PR #105's own runs passed it.

## 0. Why it failed, and why no reservation changed

- **The request wrote nothing.** Its answer was right: `IDEMPOTENCY_CONFLICT`, since the matrix judged it and found no other problem. `createReservation` throws it from `reserveAsMember` (`packages/domain/src/idempotency/receipt.ts`) before any lock or write. The route runs the command in `deps.sql.begin` (`services/api/src/drops/reservations.ts`), so a `Refused` rolls the whole transaction back.
- **The check compared the rows in the order they were read.** `tests/src/privacy/matrix.test.ts`' `replayStep` compared `canonical([...facts.world.reservations])` before and after. That map is built from `worldOf`'s query `SELECT … FROM app.reservations r JOIN app.occurrences o … WHERE o.club_id IN …`, which has no `ORDER BY`. SQL gives such a query's rows in no set order. Postgres gives them in whatever order the plan it picks produces, and the plan can change between two reads of the same rows: after an automatic `ANALYZE` of a table the matrix keeps writing, or when a prepared statement moves to a generic plan. Two reads of the same rows in another order make two different texts, so the check saw a change that wasn't there.
- **The check also missed a real change of one kind.** `canonical` (`tests/src/privacy/schedule.ts`) writes an object by its own keys, and a `Temporal.Instant` has none, so every `expiresAt` was written `{}`. A retry that moved a slot's expiry would have passed.
- **The same pattern, once more:** the leave's check that a refused leave changed no membership compared `canonical([...after.schedule.members])`, read by `scheduleWorldOf`'s query on `app.memberships` with no `ORDER BY`, whose `joinedAt` is an instant too.

## 1. What changes

- **`tests/src/privacy/schedule.ts`**, a new `rowsSeen(rows)`: a table of the world's rows keyed by id, as one text, the rows by id byte by byte and each instant written out in full (`Temporal.Instant.prototype.toString`).
- **`tests/src/privacy/matrix.test.ts`**: `replayStep`'s reservations check and the refused leave's memberships check compare `rowsSeen` of the rows before and after. Nothing else in either check changes; no cell, route or role leaves the matrix (T58).
- **`tests/src/privacy/schedule.test.ts`**, a new test, "compares a table of rows whatever order its query gave them in, and tells a moved instant from none": the same rows in another order compare equal, where `canonical` of the entries tells them apart; an instant that moved, a state, a row gone and a row more each compare unequal, where `canonical` wrote both instants `{}`; and the text itself, written out.
- No code that runs in the API, the worker or the database changes. No workflow file (T58: `tests/` isn't CI configuration).

## 2. How it's verified

- The new test passes, and its expectations on `canonical` show what the old check did: another order compared unequal, a moved instant equal.
- The world's reservations query, run on a database the privacy run filled, gives the same rows in two different orders under two plans (`enable_hashjoin` on and off, `enable_nestloop` on and off), so the order the old check depended on was the planner's.
- `privacy` on a fresh cluster, and `format`, `lint`, `typecheck`, `copy-lint`, `guards` and `unit`.
- `ci` on the branch, and on `main` after the merge.

## 3. Review

One fresh reviewer of the diff (the matrix is privacy's proof, so it gets one even for a tests-only change; at most two rounds, the founder's rule of 11 November 2026).
