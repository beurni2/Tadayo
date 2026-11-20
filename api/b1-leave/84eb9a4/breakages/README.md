# Deliberate breakages of `api/b1-leave` at `84eb9a4`

B1's fourth clubs PR, #78: `leaveClub` (`POST /v1/clubs/{club_id}/leave`; `docs/plans/api-b1-clubs.md`, section 5), and what a leave asks of `acceptInvitation`. Each rule the slice adds is broken once, on purpose, to see the test that should catch it fail. The command was written before its tests, so this run is what shows that the tests can fail.

**Result: 48 changes at `84eb9a4`, the PR's last commit. All 48 are caught by the test registered for them. None went uncaught, and none was caught only by another test.**

## What is here

- `breakages.py`: the 48 entries. Each names its file, the exact text, its broken form, the suite to run, and words a failing test's name must hold, written down before its run. It changes one place in a scratch worktree (never the branch's own), runs the suite, and restores the file. Three entries change two places that only break together. The database suite runs on a local Postgres 16 made like `ci`'s, with nothing else using it.
- `run.log`: the run at `84eb9a4`, all 48. A line reads `CAUGHT` only when the suite failed and a failing test's name holds the registered words.
- `out/`: for each entry, its patch (`<code>.patch`) and the suite's whole output (`<code>.txt`).
- `trial/`: two earlier runs, kept as logs only. `trial.log` is a trial of 46 entries on the second commit's tree before it was committed. `run-528dbf3.log` is the run of those 46 at `528dbf3`, the second commit with `main` merged in, before the third commit changed the rule for a used key.

## The entries

| Entries | What is broken | Suite |
|---|---|---|
| L01 to L24 | The command, `packages/domain/src/clubs/leave-club.ts`: the retry's answer and who gets it, the receipt's request, the club's row and the second read under it, the clock after the lock, the row a leave writes, the leaver's candidates, the carry and its two conditions, a name's revision carried as that with no approval, the ended revision, the roster's version | `tests/src/db/leave-club.test.ts` |
| A01, A02 | What a leave asks of an acceptance, `accept-invitation.ts` `standingOf`: someone who joined by a link and left, and a candidate a leave ended | the same |
| H01 to H05 | The route, `services/api/src/clubs/leave.ts` | `services/api/src/clubs/leave.test.ts` |
| J01 to J09 | The matrix's judge of a leave, `tests/src/privacy/leave.ts` | `tests/src/privacy/leave.test.ts` |
| K01, K02 | The matrix's judge of an acceptance, `tests/src/privacy/invitation.ts` | `tests/src/privacy/invitation.test.ts` |
| M01 to M06 | The same rules against the privacy matrix | `tests/src/privacy/matrix.test.ts` |

The matrix entries run one of its roles, the star: the one role the world's revision lists, so its leave is the one that takes a read away.

## What the trial found

The trial ran on the second commit's tree before it was committed, so that a weak test could be fixed in that commit.

- 45 of its 46 entries were caught by the test registered for them.
- **M04** as first written ("the answer's instant keeps its fraction", against the matrix) passed: the matrix's clock reads whole seconds, so the two forms are the same there. The rule is held by the route's test (H01, caught). M04 was replaced by "the answer says keep whatever was chosen", which the matrix catches.

The run at `528dbf3` caught all 46. The third commit then changed what someone who isn't a member is told under a used key; L01, L02, M03 and M05 were rewritten for the new text, L23 and L24 were added for the new rule, and all 48 ran again here.

## What the breakages don't reach

- That a leave writes no day, no push and no event (T36): no test asserts an absence there; it is true by reading the command.
- The name a former member is shown by (FQ75) is tested as stored (L08): no built route shows a former member yet.
- FQ121's carry passes through no cell of the matrix, whose leave happens in a club with no open proposal; the database tests (L09 to L18) and the judge's own tests (J03 to J09) hold it.
