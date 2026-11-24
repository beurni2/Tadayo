# Deliberate breakages of PR #120's second commit (9152a8a)

PR #120, `api/b2-spike-devices`: spike S4's server part, device registration and its removal
(`docs/plans/api-b2-spike-push.md` section 1; `docs/TECH-DESIGN.md` section 6, (a) to (e)). The second commit
holds the fixes of rounds 1 and 2 of its review (`docs/JOURNAL.md`, section 3.2's entry stamped 2026-11-24 05:38 UTC,
and table 4.1's row #120).

Each breakage changes one place in the code, runs the suite registered for it on the session's local Postgres 16,
and counts as caught only when a test whose name holds the registered words fails (`breakages.py`, its `B` list).
The file is restored after each. A breakage of the migration runs on a cluster made again before it and after it,
since the migration runner refuses an applied migration whose file changed.

## Round 1's tree (`round1-tree/`)

The first commit, `0a1994e`, with `round1-tree/round1.diff` applied: round 1's fixes, before round 2 changed three
tests and some comments. 46 breakages, 46 caught: the first commit's 41
and five for round 1's fixes (D21, M07, M08, X02, R07). Each one's change is `out/<id>.patch` and its suite's
output `out/<id>.txt`.

| Id | The change | Suite | Result | Tests |
| --- | --- | --- | --- | --- |
| D01 | the token's lock dropped | db | caught | 1 failed, 25 passed (26) |
| D02 | the sign-ins' locks in no fixed order | db | caught | 1 failed, 25 passed (26) |
| D03 | the account's state not read again | db | caught | 2 failed, 24 passed (26) |
| D04 | the profile not checked | db | caught | 1 failed, 25 passed (26) |
| D05 | the registration's purge dropped | db | caught | 1 failed, 25 passed (26) |
| D06 | the removal's purge dropped | db | caught | 2 failed, 24 passed (26) |
| D07 | the keep an hour short | db | caught | 1 failed, 25 passed (26) |
| D08 | the purge with no limit | db | caught | 1 failed, 25 passed (26) |
| D09 | the purge newest first | db | caught | 1 failed, 25 passed (26) |
| D10 | an ended sign-in not refused by the command | db | caught | 7 failed, 19 passed (26) |
| D11 | another account's secret not refused | db | caught | 1 failed, 25 passed (26) |
| D12 | the move leaves the earlier registration | db | caught | 5 failed, 21 passed (26) |
| D13 | the move doesn't end the earlier sign-in | db | caught | 4 failed, 22 passed (26) |
| D14 | a new token not written over the old | db | caught | 1 failed, 25 passed (26) |
| D15 | the zone kept as sent | db | caught | 2 failed, 24 passed (26) |
| D16 | a removal that finds nothing ends nothing | db | caught | 4 failed, 22 passed (26) |
| D17 | the removal's lock dropped | db | caught | 1 failed, 25 passed (26) |
| D18 | every removal said removed | db | caught | 7 failed, 19 passed (26) |
| D19 | the secret kept, not hashed | pure | caught | 1 failed, 4 passed (5) |
| D20 | the token kept in its case | pure | caught | 1 failed, 4 passed (5) |
| M01 | the guard's ended sign-in dropped | db | caught | 1 failed, 25 passed (26) |
| M02 | a deleting account registered | db | caught | 1 failed, 25 passed (26) |
| M03 | a token in uppercase kept | db | caught | 1 failed, 25 passed (26) |
| M04 | a token held by two sign-ins | db | caught | 1 failed, 25 passed (26) |
| M05 | a sign-in ended with its registration kept | db | caught | 2 failed, 24 passed (26) |
| M06 | an account deleted with a registration | db | caught | 1 failed, 25 passed (26) |
| R01 | the time not in whole seconds | route | caught | 1 failed, 15 passed (16) |
| R02 | a removal that found nothing answered 204 | route | caught | 2 failed, 14 passed (16) |
| R03 | the 204 cacheable | route | caught | 1 failed, 15 passed (16) |
| R04 | a refusal answered as a bad request | route | caught | 2 failed, 14 passed (16) |
| R05 | the registration's body limit the default | route | caught | 1 failed, 15 passed (16) |
| R06 | the removal's body limit the default | route | caught | 1 failed, 15 passed (16) |
| J01 | the judge lets an ended sign-in register | judge | caught | 1 failed, 13 passed (14) |
| J02 | the judge lets another account's secret register | judge | caught | 1 failed, 13 passed (14) |
| J03 | the judge sees no move | judge | caught | 2 failed, 12 passed (14) |
| J04 | the judge lets the earlier sign-in keep its registration | judge | caught | 1 failed, 13 passed (14) |
| J05 | the judge lets another sign-in end | judge | caught | 2 failed, 12 passed (14) |
| J06 | the judge takes a cacheable 204 | judge | caught | 1 failed, 13 passed (14) |
| J07 | the judge ends a removal again | judge | caught | 2 failed, 12 passed (14) |
| J08 | the judge's registration in microseconds | judge | caught | 1 failed, 13 passed (14) |
| X01 | another account's secret not refused, through the matrix | matrix | caught | 17 failed, 7 passed (24) |
| D21 | ending a sign-in waits on another command's purge | db | caught | 2 failed, 24 passed (26) |
| M07 | the registration guard without the sign-in's lock | db | caught | 1 failed, 25 passed (26) |
| M08 | the ending guard without the sign-in's lock | db | caught | 1 failed, 25 passed (26) |
| X02 | a move from another account leaves its registration, through the matrix | matrix | caught | 17 failed, 7 passed (24) |
| R07 | the token's field not redacted | logging | caught | 1 failed, 9 passed (10) |

## This commit's tree (`final-tree/`)

The tree of `9152a8a` (`final.sh` applies the same diff to `0a1994e` and checks the test file matches). Round 2
changed the tests of five breakages: the deletion race (D03, D04), the two purges at once (D21) and the guards'
race (M07, M08). Those five were run again: 5 breakages, 5 caught.

| Id | The change | Suite | Result | Tests |
| --- | --- | --- | --- | --- |
| D03 | the account's state not read again | db | caught | 2 failed, 24 passed (26) |
| D04 | the profile not checked | db | caught | 1 failed, 25 passed (26) |
| D21 | ending a sign-in waits on another command's purge | db | caught | 2 failed, 24 passed (26) |
| M07 | the registration guard without the sign-in's lock | db | caught | 1 failed, 25 passed (26) |
| M08 | the ending guard without the sign-in's lock | db | caught | 1 failed, 25 passed (26) |

M07 and M08 now fail after five seconds: the guards' race waits until `pg_locks` shows the ending's commit waiting
on the sign-in's lock, and without either guard's lock nothing waits.

## The two purges at once, under D21 (`final-tree/two-purges-under-D21.log`)

Nothing a removal does between its purge and its ending can be held from outside, so the test "lets two removals of
long-ended sign-ins purge at once" lays its rows out in the order that deadlocked and can't force it. With D21's
breakage (the ending as round 1 found it, `ON CONFLICT` alone) it was run alone ten times: it failed in 7 of
10. In the D21 run above, its failure is Postgres's `deadlock detected` (`final-tree/out/D21.txt`). The test that
proves the wait itself, "ends a sign-in whose old row another command's purge is deleting", holds the purge open and
fails every time.
