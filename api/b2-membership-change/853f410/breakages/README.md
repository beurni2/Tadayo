# Deliberate breakages of `api/b2-membership-change` at `853f410`

The schedule's membership change, first of two PRs, #84: the week every active member confirms when a club's members change after its first days have applied, proposed, read and confirmed (`docs/plans/api-b2-membership-change.md`; FQ125 to FQ127), and migration 0014. Each rule the PR adds is broken once, on purpose, to see the test that should catch it fail.

**Result: 68 changes at `853f410`, the PR's last commit. 67 are caught by the test registered for them. One, C04, is not caught: an equivalent change that no path through the app reaches (below).** Three of the 67 (R02, N02, C13) were first caught by another test than the one registered, and were registered again with the test that catches them and run again (below).

## What is here

- `breakages.py`: the 68 entries. Each names its file, the exact text, its broken form, the suite to run, and words a failing test's name must hold, written down before its run. It changes one place in a scratch worktree at `853f410` (never the branch's own), runs the suite, and restores the file. The database suites run on a local Postgres 16 made like `ci`'s, with nothing else using it. A breakage of the migration makes that database again from the changed file first, and the database is made again from the true file after the last of them.
- `run.log`: the run at `853f410`, all 68. A line reads `CAUGHT` only when the suite failed and a failing test's name holds the registered words.
- `run-reregistered.log`: R02, N02 and C13 run again at `853f410` with the words of the test that caught them.
- `out/`: for each entry, its patch (`<code>.patch`) and the suite's whole output (`<code>.txt`). R02, N02 and C13's outputs are those of the second run.
- `trial/`: earlier runs, kept as logs only. `trial-4062673.log` is the first run, 63 entries at the PR's first commit, before the review. `trial-853f410-new-entries.log` is the first run of the entries added or moved for the second commit.

## The entries

| Entries | What is broken | Suite |
|---|---|---|
| R01 to R18 | The rule, `packages/domain/src/schedule/change.ts`: when a change is proposed, replaced or dropped (`changeAfter`), which week it proposes (`changeWeek`, FQ125), and when it starts (`changeStart`; FQ61, FQ115, FQ127) | `change.test.ts` |
| N01, N02 | Generation, `generate.ts`: no day from an open change's start | `generate.test.ts` |
| V01 to V04 | The view and the confirmation's rule, `view.ts` `changeViewFor` and `decide.ts` `judgeChangeConfirmation` | `view.test.ts`, `decide.test.ts` |
| C01 to C25 | The writes and the commands: `settle-change.ts` `settleChange`, its callers in `apply-roster.ts`, `leave-club.ts` and `confirm-days.ts`, `command.ts` (`MEMBERSHIP_CHANGED` and `current_id`), `week.ts` and `view.ts` `seesAnnounced` (who gets `announced`), `authorization/days.ts` (which days are announced), `services/api/src/schedule/routes.ts` | `tests/src/db/membership-change.test.ts`, `home-days.test.ts`, `first-days-roster.test.ts`, `services/api` route tests, `view.test.ts`, and the privacy matrix's "a membership change through the app" |
| M01 to M09 | Migration 0014's guards: a change's start, its days, its end | `tests/src/db/schedule-proposals.test.ts` |
| J01 to J10 | The matrix's judges of a change, `tests/src/privacy/schedule.ts` (`weekChangeProblems`, `outcomeOf`) | `tests/src/privacy/schedule.test.ts` |

Added for the second commit, which answered the PR's review: R18 (a replacement keeps a start a day was made on or after), C23 (`seesAnnounced` gives the announced days to anyone), C24 (a replaced id names the change that replaced it, one hop, as the first commit did), C25 (a replaced id with no open change left answers `MEMBERSHIP_CHANGED`) and J10 (the judge names one hop). R16, R17, C11 and C17 were moved to the code as the second commit wrote it.

## What the runs found

- **At the first commit, `4062673`,** 63 entries: two went uncaught, R03 (a new member may take a day someone keeps) and R04 (two who join take the same day), and each was a real gap: the tests' weeks happened to give the same answer either way. Both tests were strengthened in the second commit (`change.test.ts`: "gives a new member the first free day from Monday when the day of their place is kept by someone" and "gives two who join at once different days, in the order they joined"), and both are caught at `853f410`. C15 was registered against the pure placement rule while it ran through the database's own query, and C21 and C22 were added for that query.
- **At `853f410`,** all 68: 64 caught by the registered test at once. R02, N02 and C13 were caught by another test, as at the first commit: the rule was held each time, and the words were those of a neighbouring test. R02 (a new member takes the first free day rather than the day of their place) is caught by "gives the table's days to members none of whom has a day in the week"; N02 (the day before the start isn't made) by "makes nothing once a change's start is today or has passed, until the change ends (FQ127)"; C13 (a change read with the first days' view) by "writes the member's confirmation at the clock's instant and nothing else: the same version, state and answer for everyone", since the two views differ only once a member has confirmed. Registered again with those words, all three are caught (`run-reregistered.log`).
- **C04, not caught: an equivalent change.** C04 hands `changeAfter` the club's week even when no proposal of its first days has applied. Through the app no such club reaches the rule with a week to change: with no applied proposal, either its first days are open (the rule says nothing) or it has fewer than two members (FQ16: nothing, or an open change dropped, and there is none). And migration 0014 refuses a change in a club whose first days haven't applied (M-entries, "is proposed only once the club's first days have applied"). So no test can tell the two apart.

## What the breakages don't reach

- The race of the days' generation against the join that proposes a change is not tested on two connections: both take the club's row, and the hold itself is tested on one (N01, N02, and "makes no day from the change's start on, whatever the date, and every day before it as before").
- Nothing here ran on `dev`: `deploy-dev` applies migration 0014 there on the merge.
- What happens at a change's start is the next PR's, `api/b2-change-start`.
