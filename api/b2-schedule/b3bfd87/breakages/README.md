# Deliberate breakages of `api/b2-schedule` at `b3bfd87`

B2's schedule slice: a club's first days (`docs/plans/api-b2-schedule.md`, section 6). Each rule and guard the slice adds is broken once, on purpose, to see the test that should catch it fail.

**Result: 72 changes. 71 are caught by the test registered for them. 1 is an equivalent change, which changes no answer (B74, below).**

## What is here

- `breakages.py`: the 72 entries. Each names its file, the exact text, its broken form, the suite to run, and the words a failing test's name must begin with, written down before the run. It changes one place in a scratch worktree (never the branch's own), runs the suite, and restores the file. A change to migration `0012` runs on a freshly made local Postgres 16 made like `ci`'s.
- `run.log`: the run at `b3bfd87`, all 72. A line reads `CAUGHT` only when the suite failed and a failing test's name begins with the registered words.
- `out/`: for each entry, its patch (`Bnn.patch`) and the suite's whole output (`Bnn.txt`).
- `migrate-once.mts`: the database tests' own setup, run alone (B41). vitest 5 prints a failing global setup only as "No test files found", so this shows what the migration runner said.
- `zod-paths.mts`: the check behind B74.
- `first-run/`: the first run's log, at `e0993fc`, and the outputs of the entries it didn't catch.

## The entries

| Entries | What is broken | Suite |
|---|---|---|
| B01 to B18 | The pure rules: the proposed week, the 24 hours before a first date, what each member sees, what a choice and a confirmation get, when the first days apply | `packages/domain/src/schedule/*.test.ts` |
| B20 to B41 | Migration `0012`: each check, trigger and guard, the two row locks, and row-level security | `tests/src/db/schedule-proposals.test.ts`; B41 the setup's migration |
| B42 to B66 | The commands, the read, the membership check and the receipt: the club's lock, the clock after the lock, the order of the refusals, who is a member, the order members are read in, names by FQ75 | `tests/src/db/schedule-commands.test.ts`; B52 and B61 the privacy matrix |
| B70 to B79 | The routes: each serializer, the key, the bad field, the body limit, the refusal, the read-only transaction | `services/api/src/schedule/routes.test.ts`; B76 and B79 the privacy matrix |

The matrix entries run three of its twelve roles: the author, the star, and the member who joined after.

## The first run found six gaps in the tests

The first run, 71 entries at `e0993fc` (`first-run/run.log`), caught 63 as registered. Of the other eight:

- **Six passed every test. Each was a gap in the tests; the code was right. Commit `b3bfd87` adds a test for each**, and this run catches all six:
    - B26, a successor named on a proposal that is still open. The test tried only a proposal naming itself; it now tries another proposal's id.
    - B58, a choice of the days already held, written again. The tests compared the rows' values, which a rewrite leaves the same; they now compare each row's `ctid` too.
    - B59, a confirmed day's first date counted in UTC. New test with a club in Pacific/Auckland.
    - B64, a contest's holders ordered by their ids. It was caught in four runs of six, whenever the random ids happened to disagree with the order of joining. The new test picks three members whose ids run neither up nor down, and B63 (ascending ids) joins B64 (descending).
    - B65, a member who left read as still active, and B66, a former member shown by their account's name. One new test: the hold of a member who left is freed, and a confirmed member who left is shown by the name they left with.
- **B41, a table without row-level security, was caught, but the run couldn't show it.** The migration runner refuses the file in the tests' setup (`would leave the schema app open (T53)`), and vitest hides that. The entry now runs the setup alone.
- **B74 is an equivalent change.** `firstBadField` would name any string that comes first in an issue's path. The contract's two request schemas are strict objects of `expected_version` and `weekdays`, so nothing else can come first: an unknown key's issue has an empty path. `zod-paths.mts` puts twelve malformed bodies through both schemas and prints every first path element seen: those two fields, or none.

A check on the runner itself: a change that breaks the statement outright failed 45 of 47 tests six times in six, so no run tested a stale copy.

## What isn't broken here

A membership change's paths (nothing can make one before `api/b2-membership-change`), and the key share the receipt takes on the caller's account row, which is `updateMe`'s code moved, tested there.
