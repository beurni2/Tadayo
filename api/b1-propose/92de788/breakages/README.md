# Deliberate breakages of `api/b1-propose` at `92de788`

B1's second clubs PR, #76: `proposeRoster` (`POST /v1/clubs/{club_id}/roster`), `getRosterRevision` (`GET /v1/rosters/{revision_id}`), `createInvitation` and `revokeInvitation` (`docs/plans/api-b1-clubs.md`, section 3). Each rule the slice adds is broken once, on purpose, to see the test that should catch it fail. The database tests of this slice were written before its code but first run after it, and passed on that first run, so this run is what shows they catch something.

**Result: 122 changes at `92de788`, the PR's third and last commit. 119 are caught by the test registered for them. 3 change no answer (R13, I05 and N06, below). None went uncaught.**

## What is here

- `breakages.py`: the 122 entries. Each names its file, the exact text, its broken form, the suite to run, and words a failing test's name must hold, written down before its run. It changes one place in a scratch worktree (never the branch's own), runs the suite, and restores the file. Six entries change two lines that only break together (the clock sampled before the lock; a lock taken out with the one behind it; who is asked again). The database suites run on a local Postgres 16 made like `ci`'s. `python3 breakages.py --check` counts every anchor and changes nothing.
- `run.log`: the run at `92de788`, all 122. A line reads `CAUGHT` only when the suite failed and a failing test's name holds the registered words.
- `out/`: for each entry, its patch (`<code>.patch`) and the suite's whole output (`<code>.txt`).
- `trial/`: the three logs of a trial on the third commit's tree before it was committed (the same entries, in three parts). Its patches aren't kept: they held the uncommitted work beside each change.

## The entries

| Entries | What is broken | Suite |
|---|---|---|
| R01 to R15 | The read, `packages/domain/src/clubs/roster-revision.ts` `readRevision`: an unsealed revision, a member who joined later, a former member, who is given a link, each of a link's states and their order, the latest link, whose decision, the members' and the candidates' order, a member or a proposer with no name | `tests/src/db/propose-roster.test.ts`, `invitation.test.ts` |
| P01 to P19 | `proposeRoster` (`propose-roster.ts`): the replay and who gets it, who is asked again under the club's row and that it is the same interval (P02, P19), the lock, the version, six from both sides, which candidates count and which are carried and in what order, the clock after the lock, what a superseded revision records, the implicit approval, the roster's version, the receipt's status and fingerprint | `tests/src/db/propose-roster.test.ts` |
| S01 to S04 | The receipt's rule for a club command, `packages/domain/src/idempotency/receipt.ts` `reservedSince` and `reserveAsMember`: the equal instant, an earlier interval's receipt, another request under an earlier interval's key | both database files |
| I01 to I17 | `createInvitation` (`invitation.ts`): the replay, who is asked again, whose candidate, a candidate ended or joined, a revision no longer open, a link after acceptance, the expiry's second and its seven days, the token's size and what is hashed, the earlier link replaced, no token on a retry, the clock after the lock, the locks, the receipt | `tests/src/db/invitation.test.ts` |
| V01 to V05 | `revokeInvitation`: who revokes, an accepted link, a repeat, the clock's sample, who is asked again | the same |
| A01 to A15 | The routes, `services/api/src/clubs/roster.ts` and `app.ts`: the neutral not-found, the key for each command, the 201, no URL on a replay, the token in the fragment, the field list, an absent link, whole seconds, a refusal's mapping, the two body limits, the revoke's answer, the body's check | `services/api/src/clubs/roster.test.ts`, `app.test.ts` |
| X01 to X10 | The same rules against the privacy matrix | `tests/src/privacy/matrix.test.ts` |
| J01 to J24 | The matrix's own judges, `tests/src/privacy/roster.ts` | `tests/src/privacy/roster.test.ts` |
| N01 to N13 | The leak scanner's rule for the proposer's link, `tests/src/privacy/scanner.ts`: who a link's id is passed to, a suspended club, an account that isn't active, a link beside another candidate, a URL in another answer, on another host or with another link's token | `tests/src/privacy/scanner.test.ts` |

The matrix entries run two of its twelve roles: the star and the former member.

## Three changes that alter no answer

- **R13** takes out the read's refusal of a revision whose proposer has no name to show. A proposal always adds at least one candidate, proposed by its proposer, and the check on each candidate's proposer (R15, caught) answers first for the same person. The line stays for a revision made another way, which PR 3 writes.
- **I05** lets `createInvitation` take a candidate of any club. The same statement asks that the caller's interval in the path's club proposed the candidate, and the schema ties a candidate's club to its proposer's membership (`db/migrations/0004_rosters.sql`: the foreign key on `(proposed_by_interval_id, club_id)`). So the club's own condition never decides.
- **N06** lets the scanner pass a link's URL in any operation and status. The contract has the link's shape (`InvitationLink`) only in `createInvitation`'s 201, and the scanner's world check runs only on a status the contract declares, so no answer reaches that condition: a URL elsewhere is caught earlier, as a key the answer's shape doesn't have (the scanner's own test of a 200 shows it).

## What the trial found

The trial ran on the third commit's tree before it was committed, so that a weak test could be fixed in that commit.

- **P12** (carried candidates in the other order) was caught only by another test, by chance: the test of superseding carried one candidate. It now carries two, and catches P12 here.
- **I17** (a link's receipt stored as 200) was registered to the retry's test, which doesn't read the receipt. It is registered here to the test that does.
- **X01** was registered to the matrix's former member. It is caught by the star in a suspended club instead: the matrix's former member is on no revision its cells read, so a former member's read of a revision that lists them is held by the database test (R03, caught). The plan gives PR 4, which makes former members by leaving, the matrix's side of it (`docs/plans/api-b1-clubs.md`, section 3.2).
- R13, I05 and N06 weren't caught, and were then shown to change nothing, as above.

## Rules no entry breaks

- The id pattern guards and the shape guards in the three files: defensive, and they change no answer the tests can see.
- The first membership check before the receipt, in both commands: with it gone, the later checks give the same answer (someone who isn't a member has no interval for the receipt's rule to pass, and is refused again under the lock).
- `getRosterRevisionHandler`'s read-only transaction.
- The matrix's own counts of its roster table (`matrix.test.ts`): breaking them means editing the test that holds them.
