# Deliberate breakages of `api/b2-first-days-roster` at `f541d31`

The schedule's third PR, #80: what a join or a leave does to a club's first days (`docs/plans/api-b2-first-days-roster.md`; FQ102, FQ123, FQ124), and migration 0013. Each rule the slice adds is broken once, on purpose, to see the test that should catch it fail.

**Result: 75 changes at `f541d31`, the PR's last commit. All 75 are caught by the test registered for them. None went uncaught, and none was caught only by another test.**

`f541d31` changes records only; the code and the tests are those of `c9c6b3c`, where the same 75 were caught too (`trial/run-c9c6b3c.log`).

## What is here

- `breakages.py`: the 75 entries. Each names its file, the exact text, its broken form, the suite to run, and words a failing test's name must hold, written down before its run. It changes one place in a scratch worktree (never the branch's own), runs the suite, and restores the file. The database suites run on a local Postgres 16 made like `ci`'s, with nothing else using it. A breakage of the migration makes that database again from the changed file first, and the database is made again from the true file after the last of them.
- `run.log`: the run at `f541d31`, all 75. A line reads `CAUGHT` only when the suite failed and a failing test's name holds the registered words.
- `out/`: for each entry, its patch (`<code>.patch`) and the suite's whole output (`<code>.txt`).
- `trial/`: two earlier runs, kept as logs only. `trial-551694b.log` is the first run, 72 entries on the second commit. `run-c9c6b3c.log` is the run of all 75 on the third commit with `main` merged in.

## The entries

| Entries | What is broken | Suite |
|---|---|---|
| C01 to C13 | The rule, `packages/domain/src/schedule/roster-change.ts` `firstDaysAfter`: when new first days open, when they end, apply or stay, when the week is proposed again, and which days a new member is given | `roster-change.test.ts` |
| S01 to S09 | The write, `settle.ts` `settleFirstDays`: the facts it reads (the current week's holds, who is active, which first days ended with no successor), and each thing it writes | `tests/src/db/first-days-roster.test.ts` |
| A01 to A04 | The callers, `apply-roster.ts` and `leave-club.ts`: a join and a leave settle the first days | the same, and the privacy matrix's applied-roster test |
| O01 to O05, F01, F02 | The restart, `open.ts`, `first-date.ts`, `confirm-days.ts`: which week new first days use, the three dates it starts after (FQ124), and that a day confirmed in it opens no earlier | the same, `schedule-commands.test.ts`, `first-date.test.ts` |
| W01, W02 | The reads and the choice, `week.ts` and `choose-days.ts`: only the current week's rows | `first-days-roster.test.ts` |
| M01 to M11 | Migration 0013's guards: how a week moves, and that every guard of 0012 reads the current week only | `tests/src/db/schedule-proposals.test.ts` |
| J01 to J27 | The matrix's judges of a leave's and a join's first days, `tests/src/privacy/leave.ts` | `tests/src/privacy/leave.test.ts` |
| P01, P02 | The matrix world's reader of the weeks, `tests/src/privacy/schedule.ts` | the privacy matrix's applied-roster test |

## What the first run found

The first run, 72 entries at `551694b`, caught 62 by the registered test.

- **Four went uncaught, and each was a real gap in the tests.** C11 (a leaver's days stay held), C13 (a new member's place in spec 05's table is ignored), S01 (the facts read every week's holds) and W02 (a choice writes its day into the first week). Tests were changed or added for each in the third commit, and all four are caught now.
- **Six were caught by another test than the one registered** (C12, A03, A04, O05, P01, P02). The rule was held each time; the registered words were wrong, mostly a test name the runner cuts short. They were registered again with the right words.
- Three entries were added (J25 to J27) for what the check of the second commit asked of the judge.

## What the breakages don't reach

- The three interleavings the review named (a join against a leave, two leaves, a join against a confirmation) are tested one after the other, not on two connections: each takes the club's row first, and the two-connection tests cover a confirmation against a leave.
- In the privacy matrix's own world a day is confirmed and two unconfirmed members stay, so a leave there shows only that nothing moves. The other branches are held by the judge's own tests (J01 to J27) and the database tests.
- Nothing here ran on `dev`: `deploy-dev` applies migration 0013 there on the merge.
