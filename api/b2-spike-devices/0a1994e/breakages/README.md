# Deliberate breakages of PR #120's first commit (0a1994e)

PR #120, `api/b2-spike-devices`: spike S4's server part, device registration and its removal
(`docs/plans/api-b2-spike-push.md` section 1; `docs/TECH-DESIGN.md` section 6, (a) to (e)).

Each breakage changes one place in the code, runs the suite registered for it on the session's local Postgres 16,
and counts as caught only when a test whose name holds the registered words fails (`breakages.py`, its `B` list).
The file is restored after each; the run's last line is `git status --short` of the worktree, empty. A breakage of
the migration runs on a cluster made again before it and after it (`fresh()`), since the migration runner refuses
an applied migration whose file changed. `boot.log` is the database's bootstrap before the run.

## The run (`breakages.py`, `run.log`, `out/`)

41 breakages, 41 caught. Each one's change is `out/<id>.patch` and its suite's output `out/<id>.txt`.


### The commands (`packages/domain/src/identity/devices.ts`)

| Id | The change | Suite | Result | Tests |
| --- | --- | --- | --- | --- |
| D01 | the token's lock dropped | db | caught | 1 failed, 21 passed (22) |
| D02 | the sign-ins' locks in no fixed order | db | caught | 1 failed, 21 passed (22) |
| D03 | the account's state not read again | db | caught | 2 failed, 20 passed (22) |
| D04 | the profile not checked | db | caught | 1 failed, 21 passed (22) |
| D05 | the registration's purge dropped | db | caught | 1 failed, 21 passed (22) |
| D06 | the removal's purge dropped | db | caught | 2 failed, 20 passed (22) |
| D07 | the keep an hour short | db | caught | 1 failed, 21 passed (22) |
| D08 | the purge with no limit | db | caught | 1 failed, 21 passed (22) |
| D09 | the purge newest first | db | caught | 1 failed, 21 passed (22) |
| D10 | an ended sign-in not refused by the command | db | caught | 6 failed, 16 passed (22) |
| D11 | another account's secret not refused | db | caught | 1 failed, 21 passed (22) |
| D12 | the move leaves the earlier registration | db | caught | 5 failed, 17 passed (22) |
| D13 | the move doesn't end the earlier sign-in | db | caught | 4 failed, 18 passed (22) |
| D14 | a new token not written over the old | db | caught | 1 failed, 21 passed (22) |
| D15 | the zone kept as sent | db | caught | 2 failed, 20 passed (22) |
| D16 | a removal that finds nothing ends nothing | db | caught | 3 failed, 19 passed (22) |
| D17 | the removal's lock dropped | db | caught | 1 failed, 21 passed (22) |
| D18 | every removal said removed | db | caught | 3 failed, 19 passed (22) |
| D19 | the secret kept, not hashed | pure | caught | 1 failed, 4 passed (5) |
| D20 | the token kept in its case | pure | caught | 1 failed, 4 passed (5) |

### The migration's guards (`db/migrations/0017_devices.sql`)

| Id | The change | Suite | Result | Tests |
| --- | --- | --- | --- | --- |
| M01 | the guard's ended sign-in dropped | db | caught | 1 failed, 21 passed (22) |
| M02 | a deleting account registered | db | caught | 1 failed, 21 passed (22) |
| M03 | a token in uppercase kept | db | caught | 1 failed, 21 passed (22) |
| M04 | a token held by two sign-ins | db | caught | 1 failed, 21 passed (22) |
| M05 | a sign-in ended with its registration kept | db | caught | 1 failed, 21 passed (22) |
| M06 | an account deleted with a registration | db | caught | 1 failed, 21 passed (22) |

### The routes (`services/api/src/identity/devices.ts`, `answers.ts`, `app.ts`)

| Id | The change | Suite | Result | Tests |
| --- | --- | --- | --- | --- |
| R01 | the time not in whole seconds | route | caught | 1 failed, 15 passed (16) |
| R02 | a removal that found nothing answered 204 | route | caught | 2 failed, 14 passed (16) |
| R03 | the 204 cacheable | route | caught | 1 failed, 15 passed (16) |
| R04 | a refusal answered as a bad request | route | caught | 2 failed, 14 passed (16) |
| R05 | the registration's body limit the default | route | caught | 1 failed, 15 passed (16) |
| R06 | the removal's body limit the default | route | caught | 1 failed, 15 passed (16) |

### The matrix's judge (`tests/src/privacy/device.ts`)

| Id | The change | Suite | Result | Tests |
| --- | --- | --- | --- | --- |
| J01 | the judge lets an ended sign-in register | judge | caught | 1 failed, 13 passed (14) |
| J02 | the judge lets another account's secret register | judge | caught | 1 failed, 13 passed (14) |
| J03 | the judge sees no move | judge | caught | 2 failed, 12 passed (14) |
| J04 | the judge lets the earlier sign-in keep its registration | judge | caught | 1 failed, 13 passed (14) |
| J05 | the judge lets another sign-in end | judge | caught | 2 failed, 12 passed (14) |
| J06 | the judge takes a cacheable 204 | judge | caught | 1 failed, 13 passed (14) |
| J07 | the judge ends a removal again | judge | caught | 2 failed, 12 passed (14) |
| J08 | the judge's registration in microseconds | judge | caught | 1 failed, 13 passed (14) |

### Through the privacy matrix (`tests/src/privacy/matrix.test.ts`)

| Id | The change | Suite | Result | Tests |
| --- | --- | --- | --- | --- |
| X01 | another account's secret not refused, through the matrix | matrix | caught | 17 failed, 7 passed (24) |

## Not caught

None.
