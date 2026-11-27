# api/b2-test-gaps: the outside audit's B8: four gaps in the tests

B2 · api lane. The outside audit's B8 ("Test gaps") named four places where a test that should fail would not: a
receipt's lookup that forgot whose key it is, the database tests run after the privacy matrix on the same database,
two fields the leak scanner never compared with the world, and the 500 and 503 that no operation declares. This slice
closes the first three with tests and the matrix's own database. The fourth is part contract, which is its own PR
(`docs/GITHUB.md`, "A contract change … is its own PR"), and part the app's, which is the ios lane's (section 4).

Sources: T19 (one commit per idempotency key, its receipt the caller's own); T10 and T58 (the leak scanner and the
privacy matrix, never weakened); FQ74 (a person's avatar version while their interval is active) and FQ75 (none once
it has ended); spec 08 (the privacy matrix); TECH-DESIGN section 8 (the `privacy` step); the founder's order of the
audit's items (the coordinator's relay of 10:02 UTC on 2026-11-24): B1, B7, B8, B6 after A10. Tests only: no route,
schema, migration or product file changes.

## 0. The gaps, re-checked on `main` at `954e47d`

0.1. **A receipt's lookup is held only by its key's owner.** Receipts are keyed by the account, the operation and the
key (`db/migrations/0009_platform.sql`, `app.idempotency_receipts`). Two lookups read them:
`packages/domain/src/idempotency/receipt.ts` (`reserveReceipt`'s SELECT, `completeReceipt`'s UPDATE) and the inline
copy in `packages/domain/src/identity/update-me.ts`, which came first. Tests send one key from two accounts once
each ("keeps a key the caller's own: the same key from another account makes that account's club", and its
`updateMe` twin), but none replays it, so the SELECT that only a replay runs is never met with another account's
receipt in the table: dropping `actor_user_id = ${userId} AND` from either SELECT passes every suite (the audit's
mutant of `receipt.ts`; both at once, `main`'s 959 database tests pass). Dropping it from either UPDATE is caught
already, by those two tests: the UPDATE would change the other account's completed receipt, which
`app.idempotency_receipts_guard` refuses. Holds for the SELECTs.

0.2. **The database tests fail after the matrix on the same database.** The matrix commits its worlds (each cell's
club, its days, its drops) into the database `ci` gives, and leaves them. The database tests expect a database that
holds none. On a freshly made server, `privacy` and then `db-tests`, as `main` has them: 15 tests failed in 11 files
(946 passed; the audit counted 15 in 10). Among them `tests/src/db/ops-spike-time.test.ts`, "the test database holds
a committed occurrence…", whose committed day `dev`'s clock won't move past. `ci` passes only because
`tools/ci/ci_steps.py` runs `db-tests` first. Holds.

0.3. **Two fields the scanner never compares with the world.** `tests/src/privacy/scanner.ts` judges a person's
`avatar_version` only for being absent once an interval has ended (FQ75): while both intervals are active, any
version passes, another person's included. And it never compares a `media_class` with the drop's or the
reservation's own: a card, a drop reference or a reservation that calls a photo a video link passes. Holds.

0.4. **The 500 and 503 no operation declares.** `packages/contracts/openapi.yaml` lists a 503 only for `getHealth`,
and no 500 anywhere, though every operation can answer either, bare, with `Cache-Control: private, no-store`
(`services/api/src/app.ts` `failed`, `services/api/src/answers.ts` `unavailable`). A7 agreed with the ios lane that the
contract declares no 503 but `getHealth`'s and that the app reads every 5xx as `.unavailable`, keeping its key
(`docs/plans/api-b2-db-limits.md`, `docs/plans/api-b2-health-check.md` section 0.3). Nothing in the contract's rules
says so, and nothing tests the generated Swift client's reading of an undeclared 500. Holds; section 4 says where each
half goes.

## 1. The change

### 1.1. Receipts from two accounts under one key (`tests/src/db/`)

- `create-club.test.ts`, "replays each account's own answer under a key both used, and never the other's (the outside
  audit's B8)": Ben and Ana each create a club under one key, with different names. Each one's retry of its own request
  is its own first answer; each one sending the other's request under the key is refused IDEMPOTENCY_CONFLICT; each
  has one club. Whichever receipt the table holds first, a lookup that forgot whose key it is finds the other
  account's for one of the two, so the test doesn't depend on the order rows come back in.
- `update-me.test.ts`, the same test for the inline copy: Ben and Cleo each set their name under one key; replays
  equal their first answers, the crossed requests are refused, and each row is at version 1 with its own name.
- The UPDATEs without the account were caught before this slice (section 0.1); the new tests catch them too
  (section 3).
- `reservedSince`'s lookup joins the caller's own interval on `m.user_id = r.actor_user_id`, so the account is named
  twice there; dropping its WHERE clause is equivalent and isn't registered.

### 1.2. The matrix in a database of its own (`tests/src/privacy/global-setup.ts`, `tests/vitest.privacy.config.ts`)

The audit's own fix: "Give the matrix its own database". The privacy config's global setup, which ran
`tests/src/db/global-setup.ts`, now runs `tests/src/privacy/global-setup.ts`:
1. It migrates the database `ci` gives, as `tadayo_app`, as before (`../db/global-setup.ts`).
2. As the admin, connected to `template1` (Postgres copies a database only while nobody is connected to it), it drops
   `tadayo_privacy` if an earlier run left one, and makes it again from the migrated database: `CREATE DATABASE
   tadayo_privacy TEMPLATE <source> OWNER <the source's owner>`. That copies the schemas, the extension and the rows
   whole. A role's settings, such as migration 0018's time limits, are the role's in every database.
3. It grants `tadayo_app` CONNECT on the copy, as `db/bootstrap.sql` does on the original. A new database also gives
   PUBLIC CONNECT, so on today's servers the grant changes nothing; it is kept so the copy doesn't depend on that.
4. It points `DATABASE_URL` and `DATABASE_ADMIN_URL` at the copy. Vitest starts each test file's worker from the main
   process's environment, so every file of the matrix connects there.

The last copy is left after the run, for a look; the next run drops it first. So whichever of the two steps runs first,
the database `ci` gives never holds a world of the matrix's. It refuses to run when the database `ci` gives is
already called `tadayo_privacy`.

`tests/src/privacy/own-database.test.ts`, "the matrix's own database (the outside audit's B8)", holds it: as
`tadayo_app` and as the admin, `current_database()` is `tadayo_privacy`; schema `app` is owned by `tadayo_app`; and
`tadayo_app` may connect there but not create.

No workflow or `tools/ci/` change: the steps' order in `ci.yml` stays as it is, and needs no freeze.

### 1.3. The scanner compares avatar versions and media classes (`tests/src/privacy/scanner.ts`)

- **A person:** while both the person's interval and the viewer's are active, `avatar_version` must be the version of
  the person's own account (`world.accounts`), and absent when the account has none (FQ74); once either has ended,
  none, as before (FQ75).
- **A card:** `media_class` must be the drop's own.
- **A drop reference** (`REFERENCES`): where it gives a `media_class`, the drop's own (Your drops' rows).
- **A reservation:** `media_class` must be the reservation's own (`world.reservations`).

The scanner's tests (`tests/src/privacy/scanner.test.ts`) gain two planted tests, and three fixtures are made true to
the world they're judged in (the stricter checks found them): Cleo's person carries her account's avatar version
(`cleosPerson`, in place of each `person(cleo, "Cleo")`), an own contribution carries its drop's media class, and the
caption-swapped card's own planted card carries the media class of the drop it names.
- "catches an avatar version that isn't the person's own account's, or none where the account has one (FQ74; the
  outside audit's B8)": Ben with Cleo's version, Cleo with none, Cleo with an older version, and the same in a
  reaction's people.
- "catches a media class that isn't its drop's or its reservation's own: on a card, in Your drops and on a reservation
  (the outside audit's B8)".

## 2. Tests first

On `main`'s code at `954e47d`, with only the new tests (`git show 954e47d:<file>` over this slice's scanner and
config, then each restored from its own copy):
- the two receipt tests pass, since `main`'s lookups name the account; section 3's breakages show they catch each
  lookup without it;
- the two new scanner tests fail (`main`'s scanner finds none of the planted fields), and the 112 others pass;
- `own-database.test.ts` fails: `current_database()` is `postgres`.

Then, with the slice, on a freshly made server: `privacy` first, then `db-tests`, each green (section 4 of the PR's
evidence; the journal's entry has the counts).

## 3. Breakages, registered before they are run

Each is planted alone in a copy of the slice, run against the suites named, and restored from its own copy. "Caught"
means the named test fails with the words given.

| # | Planted | Suite | Caught by, with its words |
| --- | --- | --- | --- |
| R1 | `receipt.ts` `reserveReceipt`'s SELECT without `actor_user_id = ${userId} AND` | `db/create-club.test.ts` | "replays each account's own answer under a key both used" |
| R2 | `receipt.ts` `completeReceipt`'s UPDATE without it | `db/create-club.test.ts` | the same test |
| R3 | `update-me.ts`'s SELECT of the receipt without it | `db/update-me.test.ts` | "replays each account's own answer under a key both used" |
| R4 | `update-me.ts`'s UPDATE of the receipt without it | `db/update-me.test.ts` | the same test |
| S1 | `scanner.ts`: the card's `media_class` compare removed | `privacy/scanner.test.ts` | "catches a media class that isn't its drop's" |
| S2 | `scanner.ts`: the reference's `media_class` compare removed | `privacy/scanner.test.ts` | the same test |
| S3 | `scanner.ts`: the reservation's `media_class` compare removed | `privacy/scanner.test.ts` | the same test |
| S4 | `scanner.ts`: the active person's `avatar_version` compare removed | `privacy/scanner.test.ts` | "catches an avatar version that isn't the person's own account's" |
| D1 | `global-setup.ts` without the two `process.env` lines | `privacy/own-database.test.ts` | "is where every file of the matrix connects" |
| D2 | `vitest.privacy.config.ts` back to `src/db/global-setup.ts` | `privacy/own-database.test.ts` | the same test |

D3, shown by the step order itself: `privacy` and then `db-tests` on one server fails on `main` as section 0.2 says,
and with the slice it passes.

### 3.1. As run

At 04:38 UTC on 2026-11-27, on the slice's files (`breakages.py`, each planted alone, run, restored from its own copy
and compared after): all ten caught, each by the test and words registered, and no other test but where named here.
- R1 and R3: the new test alone.
- R2 and R4: the new test and the one that caught them before ("keeps a key the caller's own: the same key from another
  account makes that account's club"; "belongs to the account: another account's use of the same key is its own
  request").
- S1 to S3: "catches a media class that isn't its drop's…"; S4: "catches an avatar version that isn't the person's own
  account's…".
- D1 and D2: "is where every file of the matrix connects…".

Under `main`'s tests (the two database test files as `main` has them): R1 and R3 each missed by their file, and both
planted at once missed by the whole `db-tests` step, 959 of 959 passing.

D3: on `main` at `954e47d`, `privacy` then `db-tests` on one server, 15 failed in 11 files; with the slice, on a
freshly made server, on `main` at `bb95dc9`, `privacy` 551 of 551 (04:17 to 04:34 UTC), then `db-tests` 961 of 961 (04:34 to
04:36 UTC); and again on `main` at `bbd2291` (B1's #147), which the branch is made from: `privacy` first, 551 of 551 in 17 files (05:00 to 05:17 UTC), then `db-tests` on the same server, 969 of 969 in 50 files (05:17 to 05:19 UTC).

## 4. What it leaves to others

- **The contract's half of 0.4** is its own PR, `api/b2-contract-5xx`, from `main`: one rule line in the document's
  description that any operation may answer a bare 500 or 503 (`packages/contracts/src/document.ts`), with
  `openapi.yaml` written again and a contract test, as `docs/GITHUB.md` asks of a contract change.
- **The app's half of 0.4** is the ios lane's: a test that `TadayoAPI`'s generated client reads an undeclared 500
  and 503 as `.unavailable` (`packages/swift/TadayoAPI`), told to the ios lane.
- **B7's second part,** the alert, comes next: a GitHub issue that GitHub emails, the founder's answer to FQ150
  (`api/b2-failure-alerts`, once B7's first part, PR #148, has merged).
- **B6** (the supply chain and the evidence branch) after it, the api lane's parts in their own `tools/ci/` and workflow
  PRs, under a freeze where a workflow changes.

## 5. Review

To come: two fresh subagents at full depth, since the slice changes the leak scanner and the matrix's database (privacy
and security; the tests and the records).
