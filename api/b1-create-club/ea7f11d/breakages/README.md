# Deliberate breakages of `api/b1-create-club` at `ea7f11d`

B1's first clubs PR, #73: `createClub` (`POST /v1/clubs`) and `getClub` (`GET /v1/clubs/{club_id}`) (`docs/plans/api-b1-clubs.md`, section 2). Each rule the slice adds is broken once, on purpose, to see the test that should catch it fail. The tests of this slice were written after its code, so this run is what shows they catch something.

**Result: 58 changes at `ea7f11d`, the PR's third and last commit. 57 are caught by the test registered for them. 1 changes no answer (A04, below).**

## What is here

- `breakages.py`: the 58 entries. Each names its file, the exact text, its broken form, the suite to run, and words a failing test's name must begin with, written down before its run. It changes one place in a scratch worktree (never the branch's own), runs the suite, and restores the file. The database suites run on a local Postgres 16 made like `ci`'s. `python3 breakages.py --check` counts every anchor and changes nothing.
- `run.log`: the run at `ea7f11d`, all 58. A line reads `CAUGHT` only when the suite failed and a failing test's name holds the registered words.
- `out/`: for each entry, its patch (`<code>.patch`) and the suite's whole output (`<code>.txt`).
- `at-7281ec2/run.log`: the run at the second commit, the same 58 entries. `at-7281ec2/run-before-second-commit.log`: the first run, 56 entries, on the first commit with the new lock test, before the review's fixes.

## The entries

| Entries | What is broken | Suite |
|---|---|---|
| R01 to R10 | The read, `packages/domain/src/clubs/club.ts` `readClub`: who gets a club, the members counted, the open candidates, six, the open revision, the club asked for, the instant asked, the roster's version | `tests/src/db/create-club.test.ts` |
| C01 to C14 | The command, `packages/domain/src/clubs/create-club.ts` `createClub`: the receipt and its replay, an account being deleted, one with no name, the account's row lock (C05), the zone's spelling, the stored status, the two timestamps, the request's fingerprint, a retry once its sender has lost the club (C14) | the same |
| A01 to A13 | The routes, `services/api/src/clubs/club.ts` and `app.ts`: `server_now`, the 201, the key, the body's fields, the neutral not-found, the field list, the instant's seconds, a refusal's mapping, the body limit (A13); A11 through the privacy matrix | `services/api/src/clubs/club.test.ts`, `app.test.ts` |
| X01 to X05, X07 | The same rules against the whole privacy matrix: a former member reads the club, a field beyond the contract's, a retry that makes a second club, a 200, the zone as sent, anyone reads any club (X07, seen by the outsider's request and by other roles) | `tests/src/privacy/matrix.test.ts` |
| J01 to J15 | The matrix's own judges, `tests/src/privacy/club.ts` | `tests/src/privacy/club.test.ts` |

The matrix entries run two of its twelve roles: the star and the former member.

## One change that alters no answer

- **A04** lets `firstBadField` name any key of the body, not only `name` and `timezone`. The contract's parser reports an unknown key with an empty path, never under its own name, and every other issue's path starts with `name` or `timezone`. So the list never decides. It stays as a guard: if the contract's request ever grows a nested field, an unknown name can't be echoed.

## What the earlier runs found

- Before the second commit (56 entries): 54 caught, A04 as above, and X06 not caught. X06 was a bad entry: it changed a condition that `activeMemberships`, which this PR doesn't touch, already decides, so it changed nothing. It was dropped.
- The first run registered C05 (the account's row read without its lock) only after a test for it was written: before that, no test ran a deletion beside a creation. The review found the same.
- At `7281ec2` (58 entries): 56 caught by their registered test, A04 as above, and R07 caught by another test than the one registered. R07 names the lowest-id revision of the club as open; with random ids, whether the registered test saw a wrong id was chance. It is registered here to the test that fails on it every time (a club with no open revision must name none).

## Rules no entry breaks

- The id pattern guard in `readClub` and the shape guards in both files: defensive, and they change no answer the tests can see.
- `getClubHandler`'s read-only transaction.
- The input guards of `createClub` (`check`), which have a test of their own and no entry.
- Whether a refused body makes a club, in the matrix: the matrix counts the creator's memberships in the rows after each table, and no one-place change of the route makes a club on a refusal.
