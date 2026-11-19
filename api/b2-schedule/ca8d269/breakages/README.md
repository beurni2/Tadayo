# Deliberate breakages of `api/b2-schedule` at `ca8d269` (PR #68, after its review)

B2's schedule slice: a club's first days (`docs/plans/api-b2-schedule.md`, section 6). Each rule and guard the slice adds is broken once, on purpose, to see the test that should catch it fail. This is the run after the review's two rounds of fixes. The run before the review is in `../../b3bfd87/breakages/`.

**Result: 88 changes at `ca8d269`. 85 are caught by the test registered for them. 2 change no answer (B74 and B83, below). 1 passed every test (B52): a gap in the tests, closed by a new test in the next commit, `fe64191`, where B52 is caught (`rerun-B52/`).**

## What is here

- `breakages.py`: the 88 entries. Each names its file, the exact text, its broken form, the suite to run, and the words a failing test's name must begin with, written down before its run. It changes one place in a scratch worktree (never the branch's own), runs the suite, and restores the file. A change to migration `0012` runs on a freshly made local Postgres 16 made like `ci`'s. The file is as it stood after B52's second run: B52's suite and words are the new test's. For the run in `run.log`, B52 was registered against the privacy matrix (`"matrix", "answers the member who joined after the commit (T8) as its account"`), as `run.log` shows.
- `run.log`: the run at `ca8d269`, all 88. A line reads `CAUGHT` only when the suite failed and a failing test's name begins with the registered words.
- `out/`: for each entry, its patch (`Bnn.patch`) and the suite's whole output (`Bnn.txt`).
- `rerun-B52/`: B52 alone at `fe64191`: its log, patch and output.
- `migrate-once.mts` (B41) and `zod-paths.mts` (B74): as in the earlier run's folder.

## The entries

| Entries | What is broken | Suite |
|---|---|---|
| B01 to B18 | The pure rules: the proposed week, the 24 hours before a first date, what each member sees, what a choice and a confirmation get, when the first days apply | `packages/domain/src/schedule/*.test.ts` |
| B20 to B41 | Migration `0012` as first written: each check, trigger and guard, the two row locks, and row-level security | `tests/src/db/schedule-proposals.test.ts`; B41 the setup's migration |
| B42 to B66 | The commands, the read, the membership check and the receipt | `tests/src/db/schedule-commands.test.ts`; B61 the privacy matrix |
| B70 to B79 | The routes: each serializer, the key, the bad field, the body limit, the refusal, the read-only transaction | `services/api/src/schedule/routes.test.ts`; B76 and B79 the privacy matrix |
| B80 to B82 | Round 1's fixes in the commands: the receipt read before the caller's membership is looked at; the clock sampled before the club's row is held, in the confirmation and in the opening of the first days | `schedule-commands.test.ts` |
| B83 to B93 | Round 1's fixes in the migration: each condition of the guard on the week's rows, and the guard itself; each clause of the apply rule and of the `days_per_member` rule; a member who left confirming or changing a hold; the member row's lock | `schedule-proposals.test.ts` |
| B94, B95 | Round 2's fixes: a retry answered to a member the proposal doesn't include; a member who left counted among those who hold more | `schedule-commands.test.ts`, `schedule-proposals.test.ts` |

The matrix entries run three of its twelve roles: the author, the star, and the member who joined after.

## The one gap: B52

B52 removes the command's second look at who is calling, under the club's lock: that the proposal includes the caller's membership (`packages/domain/src/schedule/command.ts`, step 3). Before the review, the privacy matrix caught it with the member who joined after the proposal. Round 2's fix made step 1 answer that member before the receipt is read, so the matrix no longer reaches step 3, and B52 passed every test at `ca8d269`.

The check still decides one case: a member who left and joined again between step 1 and the lock. `fe64191` adds a test that makes exactly that happen (`asks who is calling again under the club's lock: …`), and B52 run again there is caught by it alone (`rerun-B52/run.log`: 1 failed, 53 passed). The code was right; the tests had a gap.

`fe64191` changes that test file, one comment and the records. The other 87 entries weren't run again there.

## Two changes that alter no answer

- **B74**, as in the earlier run: `firstBadField` would name any string that comes first in an issue's path. The contract's two request schemas are strict objects of `expected_version` and `weekdays`, so nothing else can come first (`zod-paths.mts`).
- **B83**, new: the guard on the week's rows (`app.schedule_assignment_confirmed_guard`) asking only that the row's star has confirmed, not that the row carries the confirmation's own instant. The older guard on the member's side (`app.schedule_confirmation_guard`) already requires, at the confirmation's commit, that the days written with the confirmation's instant are exactly the days held, and the week's key (version, weekday) leaves no second row for a day. So a row at another instant is refused either way, and no test can tell the two forms apart. The stricter form stays.

## What isn't broken here

A membership change's paths (nothing can make one before `api/b2-membership-change`), and the key share the receipt takes on the caller's account row, which is `updateMe`'s code moved, tested there.
