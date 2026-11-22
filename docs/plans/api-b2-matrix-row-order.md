# api lane: the privacy matrix compares a table of rows whatever order it was read in (`api/b2-matrix-row-order`)

`main`'s `ci` on `6a6f0b0` (PR #107's merge, 17:27 UTC on 2026-11-22), run 45049511272, first attempt: the `postgres` job's `privacy` step failed 5 of 418 tests, all from one cell. In the author's role, in the drop's state "removed by moderation" and the phase "collecting", the reservations' table (step 11 (r), PR #105) flagged `createReservation: a request under a key that kept a slot changed a reservation (T19) (another body under the first one's key)`. The other four failures follow from that one: the author's role stopped before it stored its counts, so the roster's, the leave's and the reservations' tables each counted 11 roles of 12. The tree is the one PR #107's `ci` passed at `8cf461c` (run 45046584263), with no difference (`git diff 8cf461c 6a6f0b0` is empty), and PR #105's own runs passed it.

## 0. Why it most likely failed, and why no reservation changed

- **The request wrote nothing.** Its answer was right: `IDEMPOTENCY_CONFLICT`, since the matrix judged it and found no other problem. `createReservation` throws it from `reserveAsMember` (`packages/domain/src/idempotency/receipt.ts`) before the day's locks; the only statement it runs first that could write is the receipt's `INSERT … ON CONFLICT DO NOTHING`, which inserts nothing on a conflict (its trigger takes `FOR KEY SHARE` on the caller's `app.users` row). The route runs the command in `deps.sql.begin` (`services/api/src/drops/reservations.ts`), so a `Refused` rolls the whole transaction back and keeps no write. No trigger writes `app.reservations`, no foreign key cascades into it, the API runs no background job, and the matrix's files run one at a time (`fileParallelism: false`), its requests one after another.
- **The check compared the rows in the order they were read.** `tests/src/privacy/matrix.test.ts`' `replayStep` compared `canonical([...facts.world.reservations])` before and after. That map is built from `worldOf`'s query `SELECT … FROM app.reservations r JOIN app.occurrences o … WHERE o.club_id IN …`, which has no `ORDER BY`. SQL gives such a query's rows in no set order. Postgres gives them in whatever order the plan it picks produces; with no write between two reads, a table's own scan order stays put, so only a change of plan reorders them: after an automatic `ANALYZE` of a table the matrix keeps writing (one privacy run on a fresh cluster in the session analyzed `app.reservations` 5 times, `app.occurrences` 3 times and `app.memberships` 6 times, by `pg_stat_user_tables`), or when a prepared statement moves to a generic plan. Two reads of the same rows in another order make two different texts, so the check saw a change that wasn't there. This is inferred, not seen: the run keeps no copy of the rows it compared. It is the one cause that fits a request that wrote nothing, and an automatic `ANALYZE`, whose timing differs from run to run, fits a failure that a rerun cleared.
- **The check also missed a real change of one kind.** `canonical` (`tests/src/privacy/schedule.ts`) writes an object by its own keys, and a `Temporal.Instant` has none, so every `expiresAt` was written `{}`. A retry that moved a slot's expiry would have passed.
- **The same pattern, once more:** the leave's check that a refused leave changed no membership compared `canonical([...after.schedule.members])`, read by `scheduleWorldOf`'s query on `app.memberships` with no `ORDER BY`, whose `joinedAt` is an instant too.
- **And twice in the schedule's judge** (`tests/src/privacy/schedule.ts` `weekChangeProblems`, found in review round 1): its check that no pick was made or moved before the first days apply compared a club's picks in the order `scheduleWorldOf`'s proposals query gave them, and its text of a pick sorted the members and the days but not `earlier`, the rows of its earlier weeks. Both rarely have rows to reorder today (no pick exists before the first days apply, and `earlier` is empty in the matrix), but both are the same fault.

## 1. What changes

- **`tests/src/privacy/schedule.ts`**, a new `rowsSeen(rows)`: a table of the world's flat rows keyed by id, as one text, the rows by id byte by byte and each instant written out in full (`Temporal.Instant.prototype.toString`). A field holding any other object (a Map, a Set, a Date, a nested row), which `canonical` would also write `{}`, throws a `TypeError` rather than compare blind (review round 1).
- **`tests/src/privacy/schedule.ts` `weekChangeProblems`** (review round 1): a club's picks by id, and a pick's `earlier` rows sorted, like its members and days.
- **`tests/src/privacy/matrix.test.ts`**: `replayStep`'s reservations check and the refused leave's memberships check compare `rowsSeen` of the rows before and after. Nothing else in either check changes; no cell, route or role leaves the matrix (T58).
- **`tests/src/privacy/schedule.test.ts`**, a new test, "compares a table of rows whatever order its query gave them in, and tells a moved instant from none": the same rows read again (new objects, new instants) in another order compare equal, where `canonical` of the entries tells them apart; an instant moved by a millisecond or a microsecond, a state, a row gone and a row more each compare unequal, where `canonical` wrote both instants `{}`; the text itself, written out; a membership's row, the other table compared this way; and a row holding a Set, a Map or a Date is refused. And a second (review round 1), "reads a club's picks, and an ended pick's earlier weeks, whatever order their queries gave them in".
- No code that runs in the API, the worker or the database changes. No workflow file (T58: `tests/` isn't CI configuration).

## 2. How it's verified

- The new test passes, and its expectations on `canonical` show what the old check did: another order compared unequal, a moved instant equal.
- The world's reservations query, run on a database the privacy run filled, for the three clubs with the most reservations, gives the same 27 rows in another order with `enable_hashjoin` off (a merge join) than by default (a hash join), so the order the old check depended on was the planner's.
- The second new test seen failing on the judge before round 1, once for each fault: `the ended pick spr_old moved` for `earlier` read in another order, then, with that fixed, `a pick was made or moved where none is due` for the picks read in another order.
- `privacy` on a fresh cluster, and `format`, `lint`, `typecheck`, `copy-lint`, `guards` and `unit`.
- `ci` on the branch, and on `main` after the merge.

## 3. Review

One fresh reviewer of the diff (the matrix is privacy's proof, so it gets one even for a tests-only change; at most two rounds, the founder's rule of 11 November 2026).

**Round 1** at `149b6e3`: the branch is sound, no blocker; it confirmed from the code that the second request could write nothing, reproduced the reordering under another plan, and found the fix strictly stronger for both callers. Two should-fix and five nits, each fixed or answered in the round 1 commit:
- S1: the records stated the cause as seen (table 4.1's row, this plan's section 0). **Fixed:** "most likely", inferred, with the analyze counts.
- S2: `rowsSeen` still wrote any other object `{}`, and is exported for "the world's rows". **Fixed:** it refuses one with a `TypeError`, tested with a Set, a Map and a Date.
- N3 and N4: the schedule judge's picks in query order, and a pick's `earlier` unsorted. **Fixed** (section 1), with the second new test, seen failing first.
- N5: "before any lock or write" is loose: the receipt's insert runs and its trigger takes a key-share lock. **Fixed** in this plan and block 1.2; the first log entry stays as written (the log is append-only) and the round 1 entry corrects it.
- N6: this plan's verification line named plans that weren't the ones run. **Fixed** (section 2).
- N7: the test reused one instant object. **Fixed:** the rows read again are new objects with new instants; a microsecond's move and a membership's row are added.
- The four failures after the first: "four summary tests", as the reviewer put it, now in block 1.2.

**Round 2** at `cc9e985`, one fresh reviewer of the round 1 commit alone (the last round): every round 1 finding verified fixed; `rowsSeen` can't throw on the matrix's two tables, which hold strings, booleans, nulls and instants; sorting the picks leaves `openIn` as it was, since a club has one open pick at most; and each new expectation failed for its own fault on the judge as it was. No blocker; one should-fix and four nits, all fixed in the third commit:
- block 1.2 still called the PR not opened, and the PRs lines "the next PR";
- the new test's ended pick was at its first week, though only another week's rows are `earlier`: now at its second;
- `rowsSeen`'s comment rewrapped;
- the T6, T33, spec 05 and T19 audit rows;
- one line in block 1.1 (and two more like it) now says "most likely" of the cause.
