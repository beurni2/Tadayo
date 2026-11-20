# Deliberate breakages of `api/b1-accept` at `7c11b42`

B1's third clubs PR, #77: `previewInvitationWeb`, `previewInvitation`, `acceptInvitation`, `approveRoster` and `declineRoster`, the roster applied, and `listMembers`' `open_revision` (`docs/plans/api-b1-clubs.md`, section 4). Each rule the slice adds is broken once, on purpose, to see the test that should catch it fail. The tests of this slice were written after its code, so this run is what shows they catch something.

**Result: 96 changes at `7c11b42`, the PR's fourth and last commit. 94 are caught by the test registered for them. 2 change no answer (A17 and D01, below). None went uncaught, and none was caught only by another test.**

## What is here

- `breakages.py`: the 96 entries. Each names its file, the exact text, its broken form, the suite to run, and words a failing test's name must hold, written down before its run. It changes one place in a scratch worktree (never the branch's own), runs the suite, and restores the file. A few entries change two places that only break together. The database suite runs on a local Postgres 16 made like `ci`'s. `python3 breakages.py --check` counts every anchor and changes nothing.
- `run.log`: the run at `7c11b42`, all 96. A line reads `CAUGHT` only when the suite failed and a failing test's name holds the registered words.
- `out/`: for each entry, its patch (`<code>.patch`) and the suite's whole output (`<code>.txt`).
- `trial/trial.log`: a trial of 92 entries on the third commit's tree before it was committed. Its patches aren't kept: they held the uncommitted work beside each change.

## The entries

| Entries | What is broken | Suite |
|---|---|---|
| F01 to F10 | What a token names, `packages/domain/src/clubs/invitation-facts.ts` `linkFacts` and `namesNothing`: a revoked, replaced or used link, the expiry's instant, a suspended club, the roster's order and names | `tests/src/db/accept-roster.test.ts` |
| V01 to V13 | The preview, `invitation-preview.ts` `invitationStanding`: each state and their order, `waiting` and `changed`, a member's own club | the same |
| A01 to A19 | `acceptInvitation` (`accept-invitation.ts`): what names nothing before the receipt, the expiry, a second place, the revision and the version, the locks and the clock after them, an account being deleted, the rename's revision, the token never stored | the same |
| D01 to D11 | `approveRoster` and `declineRoster` (`decide-roster.ts`): who decides, a decision that changes nothing, the version, a decline's ending, the clock | the same |
| Y01 to Y12 | The roster applied (`apply-roster.ts` `applyIfReady`): every member approved, the exact members, who joins and under which name, an account being deleted, the club's start and first days, the carry (FQ120), the roster's version | the same |
| H01 to H05 | The routes, `services/api/src/clubs/invitation.ts` and `roster.ts` | `services/api/src/clubs/invitation.test.ts`, `roster.test.ts` |
| J01 to J08 | The matrix's own judges, `tests/src/privacy/invitation.ts` and `roster.ts` | `tests/src/privacy/invitation.test.ts`, `roster.test.ts` |
| S01 to S08 | The leak scanner's rule for a link's holder, `tests/src/privacy/scanner.ts` `heldLink` | `tests/src/privacy/scanner.test.ts` |
| M01 to M06 | The same rules against the privacy matrix | `tests/src/privacy/matrix.test.ts` |
| R01 to R04 | The second review's four fixes: `waiting` said of a roster every member approved (the rule and its judge), an accepted, renamed account being deleted carried instead of ended, an acceptance's link id passed through a dead link | the database file, the judge's and the scanner's tests |

The matrix entries run two of its roles, the star and the former member, and the test "a roster applied through the app".

## Two changes that alter no answer

- **A17** makes the acceptance's receipt keep the request with its token. The receipt stores only a hash of the request, never the request, so the token reaches no row either way; the test that reads every row for the token stays green because nothing changed in what is stored.
- **D01** takes out asking again, under the club's row, whether the caller is still a member. The revision is read again under the same lock, and that read answers nothing to a member who left, so the command refuses the same way one statement later.

## What the trial found

The trial ran on the third commit's tree before it was committed, so that a weak test could be fixed in that commit.

- Seven entries (F08, A02, A08, Y01, H01, H02, J01) were caught, but by a test other than the one registered. Each was registered again with the test that holds its rule, and is caught by it here.
- **M04** as first written ("an ended proposal is told to anyone") passed the matrix: no cell reaches that answer. It was replaced by "an ended proposal is never told to its own account", which the matrix catches.
- A17 and D01 passed, and were shown to be the equivalent changes above.
