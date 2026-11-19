# Deliberate breakages of `api/b2-generation` at `8863191`

B2's generation slice: the days a confirmed week makes, the worker's first job, and the roster (`docs/plans/api-b2-generation.md`, section 6). Each rule the slice adds is broken once, on purpose, to see the test that should catch it fail.

**Result: 67 changes at `8863191`. 65 are caught by the test registered for them. 2 change no answer alone (M03 and M11, below).**

## What is here

- `breakages.py`: the 67 entries. Each names its file, the exact text, its broken form, the suite to run, and words a failing test's name must hold, written down before its run. It changes one place in a scratch worktree (never the branch's own), runs the suite, and restores the file. The database suites run on a local Postgres 16 made like `ci`'s. `python3 breakages.py --check` counts the anchors; `python3 breakages.py M03 L07` runs only those.
- `run.log`: the run at `8863191`, all 67. A line reads `CAUGHT` only when the suite failed and a failing test's name holds the registered words.
- `out/`: for each entry, its patch (`<code>.patch`) and the suite's whole output (`<code>.txt`).
- `first-run/`: what the run before the commit found (below).

## The entries

| Entries | What is broken | Suite |
|---|---|---|
| G01 to G17 | The rule, `packages/domain/src/schedule/generate.ts`: the horizon and its two ends, the club's own today, a day made at or after its 7 AM, the first date, a star who left, a club of one, one not started, a suspended one, a date already made, the version in force, the instants' zone, Sunday | `generate.test.ts` |
| O01 to O04 | The roster's order, `order.ts`: the first days, two days by the earlier, a member with no day, a member twice | `order.test.ts` |
| M01 to M13 | The command, `make-days.ts`: the club's lock, the clock before the lock, `ON CONFLICT`, `collecting_from`, who counts as a member, a star who left, a suspended club, the id's check, the work list, the read of the made dates, a day made late | `tests/src/db/make-days.test.ts` |
| D01 to D06 | The day rule for one member, `authorization/days.ts`, in its SQL and its policy: whose day, a former member's, a suspended club's, who may read | `tests/src/db/members.test.ts`, `days-without-workers.test.ts` (Q18), `home-days.test.ts` |
| L01 to L10 | The roster, `clubs/members.ts`: who gets it, who is listed, who is next, the positions, the join order, the first days, the week in force | `tests/src/db/members.test.ts`; L09 and L10 the privacy matrix |
| A01 to A05 | The route's serializer, `services/api/src/clubs/members.ts`: `next_up`, the instant, a null avatar, a field outside the list | `services/api/src/clubs/members.test.ts`; A05 the privacy matrix |
| W01 to W12 | The worker: the loop's wait, a pass that throws, a wait of zero, the first pass, what a failure's line carries, a line for nothing, one club's failure, one transaction for all, the line's words, SIGINT, the started line before the handlers | `services/worker` tests; `tests/src/db/worker-generation.test.ts`; `tests/src/db/startup.test.ts` |

The matrix entries run three of its twelve roles: the author, the star, and the member who joined after.

## Two changes that alter no answer alone

A day is kept from being made twice by two things: the command reads the dates already made, under the club's row lock, and its insert says `ON CONFLICT (club_id, local_date) DO NOTHING`.

- **M03** removes `ON CONFLICT`. The read under the lock already leaves out every made date, so no insert meets one.
- **M11** removes the read. `ON CONFLICT` then drops every insert of a made date, and the count returned is still only the rows inserted.
- **M13** removes both, and two tests fail (`makes nothing a second time, …` and `makes each day once when two runs meet, …`).

Both stay: the read keeps the rule's answer true to the rows, and `ON CONFLICT` is the last guard if a lock is ever missed (spec 34: a retry can't duplicate).

## What the first run found

The entries were first run before the commit, on the working tree. Four passed every test: gaps in the tests, not in the code. Each was closed by a new assertion before the commit, and each is caught at `8863191`.

- **G16** (the rule takes any zone Temporal takes): the only test gave a club that was owed days, where `dayInstants` refuses the zone anyway. `generate.test.ts` now also gives a club owed nothing.
- **O02** (two days placed by the later): the test's week had the same order either way. `order.test.ts` now has a week where the two differ.
- **L07 and L08** (the week in force chosen without its start date, or the earliest kept): no test had two weeks. `tests/src/db/members.test.ts` now writes a second week and reads the roster a microsecond before its first local midnight and at it.

`first-run/run-database.log` is that run's database half, with L07 and L08 not caught; M11 reads `NOT CAUGHT` there because it wasn't yet marked as changing no answer. The log of its other half (G, O, A and most W entries, with G16 and O02 not caught) wasn't kept; `first-run/` holds the four patches.
