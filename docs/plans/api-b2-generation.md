# Plan: `api/b2-generation`, the days a confirmed week makes, and the club's roster

The second of B2's four schedule PRs (`docs/plans/api-b2-schedule.md`, section 0). Lane: api. It starts from `main` at `f1592d3` (PR #68).

## 0. What this PR builds, and what it leaves

- **The generation of days** (spec 05: "Generate upcoming occurrences several weeks ahead"): a rule in the domain, a command that makes one club's days under the club's lock, and the worker's first job, a loop that runs it for every club.
- **`listMembers`** (`GET /v1/clubs/{club_id}/members`, the contract's `Members`): the roster in its stable order (`Member.position`, FQ98, FQ114), each member's next day (`Member.next_day`) and who is next (`next_up`).
- **Q18's check with the workers stopped**, for what exists: the club list's `open_day` and `next_day` (Home's day choice, FQ103) and `listMembers` move from a day to the next by the clock alone, with no worker running.

Left to later PRs, as the schedule plan's section 0 says: a join or a leave in the first days and the pause under two members as a command (PR 3; this PR only declines to make days for a club with fewer than two members, FQ16); the membership change and how generation meets a pending change's start (PR 4); `getHome`, reservations and the allowance (B2's other half). `Member.cover` (FQ41) needs a colour stored on each membership, which no migration has and FQ41 dates to B4, so the field, optional in the contract, is left out. `Members.open_revision` is B1's roster revision, which no command opens yet; it is read from `app.roster_revisions` only when B1 builds it, and left out here.

**No migration and no contract change.** `app.occurrences` and its guards are migration 0005's; `Members`, `Member` and `listMembers` are in the contract since `api/b2-contract`. So nothing moves for the Swift client.

## 1. Sources

- Spec 05 (the rule, the instants, "several weeks ahead", "Existing announced reveal times remain fixed"), 06 (collecting begins when generated; reads derive status from the instants), 09 and 32 (the roster and next dates), 34 (jobs: retries can't duplicate; reads independent of worker completion), 37 (Q18).
- T1, T2, T5, T6, T9, T14, T15, T33, T49, T52, T55, T56, T58.
- FQ16 (no day for a club under two members), FQ50, FQ61 (every made day is announced), FQ63 (a leaver's days are held; none is made for them), FQ75, FQ79 (a day's first date), FQ98 and FQ114 (the order), FQ103, and a new one, FQ115 (section 2).
- The contract: `packages/contracts/openapi.yaml`, `Members`, `Member`, `Occurrence`, and `listMembers`' three examples (`sunday_people`, the pending roster, `first_days`).
- `db/migrations/0005_schedules_and_days.sql` (`app.occurrences`, `occurrences_insert_guard`), `0012_schedule_proposals.sql`.
- `packages/domain/src/authorization/days.ts` (Home's day choice, the one place a day is placed: T9), `packages/domain/src/time/civil.ts` (`dayInstants`).

## 2. The rule, `packages/domain/src/schedule/generate.ts`

Pure, no clock, no database. `daysToMake(facts, now)` returns the days a club is owed at the instant `now`:

- The window is the club's local date at `now` (its today) through today plus `HORIZON_DAYS`, both in the club's zone. **`HORIZON_DAYS` is 28 (FQ115, new).** Spec 05 gives no number. Under FQ61 a membership change starts only after every day already made, so the number is also the shortest wait for a change. The contract's fixtures already take four weeks (`packages/contracts/src/fixtures/world.ts`, `changeFrom`: a change proposed on Friday 6 November starts on Monday 7 December), so four weeks is the default, and the founder can shorten it. It also bounds how long the worker can be stopped before a member has no next date.
- For each date in the window that isn't a Sunday (T6): the version in force on it (the latest `effective_from` on or before it), that version's assignment for the date's weekday, if any; the date is owed when it is on or after the assignment's `first_date` (FQ79) and the star's interval is active (FQ63).
- Its instants come from `dayInstants(date, zone)` (T2), each civil time resolved on its own.
- **A day is never made late.** A date whose `reveal_at` is at or before `now` is not owed: a day made after its 7 AM would be born open, with nobody having been able to add (spec 04: no instant reveal; the table's `collecting_from < reveal_at`). A worker stopped for longer than the horizon therefore skips days, visibly (no date shows), and never invents one.
- Nothing is owed when the club isn't activated, is suspended (spec 22), or has fewer than two active members (FQ16). A suspended club's days already made stay as they are.
- Dates already made (by `local_date`) are not owed again.

## 3. The command, `packages/domain/src/schedule/make-days.ts`

`makeDays(tx, clock, clubId)` in one transaction:

1. Takes the club's row `FOR UPDATE`, the lock every schedule command takes and a new version needs (`schedule_versions_insert_guard`), so a version can't start between the read and the insert (FQ61).
2. Samples the clock after the lock (T1, T3's order), then reads the club's facts in one statement: zone, activation, suspension, active members, versions with their assignments and each star's state, and the dates already made in the window.
3. Inserts what `daysToMake` returns, `collecting_from` the sample, `ON CONFLICT (club_id, local_date) DO NOTHING`, so a retry or a second worker makes nothing twice (spec 34). The database's own guard (`occurrences_insert_guard`) judges every row again: the version in force, the star's weekday, the first date, the active star.
4. Returns the number made. It writes nothing else: no outbox event and no push in this PR (the opening's and the closing's events are B5's and B7's).

`clubsWithAWeek(sql)` lists the ids of the clubs that have a schedule version, in id order: the worker's work list. At the trial's size (a handful of clubs) every club is visited each pass; a due index is a later optimisation and is noted in `docs/LIMITATIONS.md`.

## 4. The worker, `services/worker/src/`

- `generation.ts`: `generationPass(sql, clock)` runs `makeDays` for each club in its own transaction. One club's failure is caught, counted and reported by its message alone (T52, T56: never the error object), and the pass goes on to the next club.
- `loop.ts`: `runLoop({ pass, everyMs, stopped, wait })`: a pass at start, then one every 60 seconds (`PASS_EVERY_MS`), never two at once; a stop ends the wait at once and lets a running pass finish. The timer decides only when the worker looks again; what a day is comes from the clock's sample inside `makeDays` (T1). The loop's wait is the one place the worker reads a timer, and `one-clock.test.ts` (T1's scan) is run against it and extended only if it must be, with the line that decides nothing named.
- `main.ts`: keeps its connection, installs its handlers before its started line (as today), writes `worker: started, making days every 60 s`, runs the loop, and on SIGTERM or SIGINT ends the connection and exits 0 with `worker: stopped on <signal>`. A pass that fails entirely (the database is away) is reported and retried at the next tick, so the Machine stays up.
- A pass that makes days writes one line with the count, and nothing about which club or whose day (T56).

**On `dev`** the worker is stopped until `ops` `worker-scale` starts it (`fly.toml`), and each ops run needs the founder's yes. No club on `dev` has a schedule before B1, so nothing is owed there yet; the PR asks for no run.

## 5. `listMembers`

`packages/domain/src/clubs/members.ts`, `listMembers(tx, userId, clubId, now)`, one statement, so one snapshot, or null for anyone the authorization module gives nothing of the club (`activeMember`'s rule: T14, the neutral not-found).

- **Members:** the club's active intervals, each as the contract's `Person` by FQ75's rule. Every active member gets the same list (T55); nothing in it comes from drops (T15, T33).
- **`next_day`:** the member's next day to open, placed by the authorization module's day rule (T9): scheduled, not held, the club not suspended, the earliest `reveal_at` after `now` among the days whose star is that member. `days.ts` gains `nextDayByStar`, the same conditions as `daysByClub`'s next, per star, and its policy twin on loaded facts, run together on the same rows as the two existing forms are (`tests/src/db/home-days.test.ts`).
- **`next_up`:** true for the star of the club's next day (the day `listClubs` gives as `next_day`), false for everyone else, and false for all when there is none.
- **`position`** (FQ98, FQ114), a pure function `rosterOrder(facts)` in `packages/domain/src/schedule/order.ts`: while the club's first days are open (a first-days proposal not yet applied, or no version at all), join order (`joined_at`, then interval id in byte order); afterwards, the version in force today from Monday, a member with two days by the earlier, then anyone with no day in force in join order. Positions are 1 to n with no gap.
- The route: `services/api/src/clubs/members.ts`, `listMembersHandler`, read only, the clock's sample first, an explicit field list (T55), registered in `app.ts` with the contract's operation.

## 6. Tests first

Written before the code, from the sources; timed ones with the fake clock.

- **`generate.test.ts` (domain, pure):** the window's two ends (today and today plus 28, in the club's zone, across midnight in the zone and in UTC); no Sunday; nothing before a `first_date`; a star who left; under two members; not activated; suspended; a date already made; a day whose 7 AM is exactly `now` (not owed) and one microsecond later (owed); the instants across New York's, London's and Auckland's clock changes and ADR-008's zones (close never reveal plus 18 hours by arithmetic); a club of three's six days and a club of six's; a later version taking over on its `effective_from`.
- **`order.test.ts` (domain, pure):** the contract's three examples' orders; first days in join order whatever is confirmed; after they apply, Monday first, two days by the earlier; same-instant joiners by id (FQ114); a member with no day in force last.
- **`make-days.test.ts` (db):** makes exactly the rule's days; a second run makes none; two runs at once make each day once; the clock sampled after the lock (a run waiting on the lock dates its days from its own sample); a version started meanwhile isn't crossed; the guard still refuses a wrong row; a day is never made at or after its reveal; `collecting_from` is the sample.
- **Q18 (db), `days-without-workers.test.ts`:** days made once, then no worker: with the fake clock stepped through a Friday 06:59:59, 07:00, Saturday 00:59:59, 01:00, the club list's `open_day` and `next_day` and `listMembers`' `next_day` and `next_up` change at those instants and name the right star and date.
- **`members.test.ts` (db) and the route's tests (services/api):** each of the contract's examples reproduced from rows (without `cover` and `open_revision`); the body valid against the contract's schema; a stranger, a former member and a guessed id get the neutral not-found; a held day isn't a next day.
- **The worker:** `loop.test.ts` (a pass at start, one per tick, never overlapping, a stop during a wait and during a pass); `generation.test.ts` (one club's failure doesn't stop the others; the line says a count and no id); `tests/src/db/startup.test.ts` updated for the new started line, and one test that a started worker makes a seeded club's days and stops cleanly.
- **Privacy matrix and leak scanner (T58):** `listMembers` judged for every role, before, during and after a day, from the world's rows (`tests/src/privacy/rows.ts`), with the world's club given made days; the scanner reads its bodies.
- **Breakages:** deliberate breakages of the rule, the command, the order, the read and the loop, each caught by a named test, run in a scratch worktree, the record on the `evidence` branch under `api/b2-generation/<sha>/breakages/`.

## 7. Verify

`python3 tools/ci/ci_steps.py lint typecheck format copy-lint unit guards`, then `db-bootstrap`, `db-tests` and `privacy` on a fresh local Postgres 16 (ci's Postgres 17 is the authority); the route exercised as each role; `journal_check.py --branch`; `ci` green on the last push.

## 8. Review

The schedule and its days decide who is the star and on which date, and `listMembers` is a new route, so the review is at full depth: fresh reviewers on the rule and the time handling, the command's locks, the roster's privacy, the worker, and the tests and records; every finding fixed or answered in the PR; then the founder is asked once.

## 9. Records

`docs/JOURNAL.md` (state, audit map rows for T2, T5, T6, T9, T14, Q18 and spec 05, the log, table 4.1; its first entry records PR #68's approval, merge and `main`'s runs), `docs/PROGRESS.md`, `docs/QUESTIONS.md` (FQ115), `docs/LIMITATIONS.md` (every club visited each pass; `cover` and `open_revision` not yet sent), this plan's as-built notes.

## 10. Risks and open points

- **The horizon is a product number in disguise** (FQ115): it sets a membership change's shortest wait.
- **A member sees no next date for up to a minute after confirming**, until the worker's next pass; the schedule already shows the day's first date. Making the days inside the confirmation would close the gap and is left out to keep one writer of days.
- **On `dev` the worker is stopped by default.** Before Gate A's club is formed it must be started with `ops` `worker-scale`, on the founder's yes.
- **`dev`'s clock leads real time** (S5's runs). The worker reads the same clock as the API, so its days agree with what the API serves.

## 11. As built

- **Four weeks, not three** (section 2): the first draft of this plan took three weeks. The contract's fixtures already take four (`packages/contracts/src/fixtures/world.ts`, `changeFrom`), and the contract changes only in its own PR, so `HORIZON_DAYS` is 28 and FQ115 offers three weeks as the other reading.
- **The rule's tests** were written before the rule, as section 6 says, but first run once the rule was written.
- **The day rule** (section 5): `nextDaysByStar` and `chooseNextDayOf`, the plural form for the SQL since it lists every member of every club of the viewer's.
- **The started line** is `worker: started, making days every minute`, and a failure is reported by the error's class and code alone, never its message, which Postgres fills with row values (section 4).
- **The pass's work list is an argument** (`generationPass(sql, clock, clubs = clubsWithAWeek)`), so that a database test's pass visits its own clubs; the worker gives none.
- **Tests that commit days remove them** (`tests/src/db/week-world.ts`, `forgetCommittedDays`): the runs that must meet over a club's row, and the worker's process, commit what they make, and the ops scripts' tests need a database with no committed day. The helper deletes as the test database's superuser, with the table's guards set aside for that statement; nothing outside the tests can.
- **The privacy matrix's world** has the days its rows already made; `listMembers` is judged in every cell, and again after each schedule command (`tests/src/privacy/members.ts`).
- **Two test gaps the first breakages found** are closed: the order by the earlier of two days (a week whose order differs by the later), and the zone's check for a club that is owed nothing.

