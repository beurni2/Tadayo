# Deliberate breakages of `api/b2-generation` at `4877ed9`

B2's generation slice, PR #70: the days a confirmed week makes, the worker's first job, and the roster (`docs/plans/api-b2-generation.md`, sections 6 and 11). Each rule the slice adds is broken once, on purpose, to see the test that should catch it fail. This is the third run: the first is under `api/b2-generation/8863191/breakages/`, and the second, at `65f6613`, is here under `at-65f6613/`.

**Result: 82 changes at `4877ed9`, the PR's third commit. 80 are caught by the test registered for them. 2 change no answer alone (M03 and M11, below).**

## What is here

- `breakages.py`: the 82 entries. Each names its file, the exact text, its broken form, the suite to run, and words a failing test's name must hold, written down before its run. It changes one place in a scratch worktree (never the branch's own), runs the suite, and restores the file. The database suites run on a local Postgres 16 made like `ci`'s, freshly made before the run. `python3 breakages.py --check` counts the anchors and changes nothing; `python3 breakages.py` runs all; `ROOT` and `OUT` at its top are the scratch worktree and the output folder. The database URLs in it are the local, CI-only ones of `tools/ci/ci_steps.py`.
- `run.log`: the run at `4877ed9`, all 82. A line reads `CAUGHT` only when the suite failed and a failing test's name holds the registered words.
- `out/`: for each entry, its patch (`<code>.patch`) and the suite's whole output (`<code>.txt`).
- `at-65f6613/`: the same three for the run at `65f6613` (the second commit with `main` merged in), 81 entries.

## The entries

| Entries | What is broken | Suite |
|---|---|---|
| G01 to G18 | The rule, `packages/domain/src/schedule/generate.ts`: the weeks ahead, the window by days as the first commit had it (G02), the window's last Saturday (G18), the club's own today, a day made at or after its 7 AM, the first date, a star who left, a club of one, one not started, a suspended one, a date already made, the version in force, the instants' zone, Sunday | `generate.test.ts` |
| O01 to O04 | The roster's order, `order.ts` | `order.test.ts` |
| M01 to M17 | The command, `make-days.ts`: the club's lock (M01, and M15 against the confirmation in flight), the clock before the lock, the week read before the lock (M14), `ON CONFLICT`, `collecting_from`, who counts as a member, a star who left, a suspended club, a club that hasn't started read from the rows (M16), a later week (M17), the id's check, the work list, the read of the made dates, a day made late | `tests/src/db/make-days.test.ts` |
| D01 to D06 | The day rule for one member, `authorization/days.ts`, in its SQL and its policy | `tests/src/db/members.test.ts`, `days-without-workers.test.ts` (Q18), `home-days.test.ts` |
| L01 to L11 | The roster, `clubs/members.ts`: who gets it, who is listed, who is next, the positions, the join order, the tie-break by id (L11), the first days, the week in force | `tests/src/db/members.test.ts`; L09 and L10 the privacy matrix |
| A01 to A05 | The route's serializer, `services/api/src/clubs/members.ts` | `services/api/src/clubs/members.test.ts`; A05 the privacy matrix |
| W01 to W21 | The worker: the loop's wait and its length (W20), a pass that throws, a wait of zero, the first pass, what a failure's line carries and where it goes (W18, W19), one club's failure, one transaction for all, SIGINT, the started line before the handlers, the lock limit (W13), the statement limit (W21), a stop between clubs (W14), the default work list (W15), a second signal (W16), Postgres's notices (W17) | `services/worker` tests; `tests/src/db/worker-generation.test.ts`; `tests/src/db/startup.test.ts` |

The matrix entries run three of its twelve roles: the author, the star, and the member who joined after.

## Two changes that alter no answer alone

A day is kept from being made twice by two things: the command reads the dates already made, under the club's row lock, and its insert says `ON CONFLICT (club_id, local_date) DO NOTHING`.

- **M03** removes `ON CONFLICT`. The read under the lock already leaves out every made date, so no insert meets one.
- **M11** removes the read. `ON CONFLICT` then drops every insert of a made date, and the count returned is still only the rows inserted.
- **M13** removes both, and two tests fail.

Both stay: the read keeps the rule's answer true to the rows, and `ON CONFLICT` is the last guard if a lock is ever missed (spec 34: a retry can't duplicate).

## What the run at `65f6613` found

Of its 81, 77 were caught, M03 and M11 changed no answer, and two were not caught. Both were weak tests, not wrong code, and both are caught here.

- **W16** (the signal handlers taken down after one signal): the test sent its signals together, and they all reached the process before the first handler was gone. The fresh reviewer of the second commit found the same. The test now holds a club's row, so the worker's pass waits, and sends the second signal while the stop is under way.
- **M17**, in its first form (every week read as starting on one date): which week wins then depends on the order the rows come back in, and the tests saw the right one. Its form here (only the weeks already in force are read) has one answer, and the test of a later week fails on it.

## Entries whose registered words are loose, and rules no entry breaks

- D03 and D06 are caught by the comparison of the SQL with the policy inside `home-days.test.ts`' helper, so the failing tests' names say less than the entries do.
- L09, L10 and A05 are registered to any matrix test ("answers the "); their outputs show `listMembers` lines.
- W01 and W03 are caught by a test's time limit, not an assertion.
- No entry breaks: the roster leaving out a member with no name; `listMembersHandler`'s read-only transaction; `next_day` in the serializer; "never two passes at once"; `PASS_EVERY_MS` (60 seconds, asserted by no test: `docs/LIMITATIONS.md`); `main.ts` ending its connection.
