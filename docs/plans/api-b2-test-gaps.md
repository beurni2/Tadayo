# api/b2-test-gaps: the outside audit's B8: four gaps in the tests

B2 · api lane. The outside audit's B8 ("Test gaps") named four places where a test that should fail would not: a
receipt's lookup that forgot whose key it is, the database tests run after the privacy matrix on the same database,
two fields the leak scanner never compared with the world, and the 500 and 503 that no operation declares. This slice
closes the first three with tests and the matrix's own database. The fourth is part contract, which is its own PR
(`docs/GITHUB.md`, "A contract change … is its own PR"), and part the app's, which is the ios lane's (section 4).

Sources: T19 (one commit per idempotency key, its receipt the caller's own); T10 and T58 (the leak scanner and the
privacy matrix, never weakened); the contract's `Person` (a person's avatar version while their interval is active)
and FQ75 (none once it has ended), spec 23 (none while their account is being deleted); spec 08 (the privacy matrix); TECH-DESIGN section 8 (the `privacy` step); the founder's order of the
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
`app.idempotency_receipts_guard` refuses. Holds for the SELECTs. Round 1's review (section 5) found a third read:
`packages/domain/src/clubs/leave-club.ts` `leaveClub`'s check after a former member's replay (FQ112), which joins the
memberships of the receipt's own actor, so without its `r.actor_user_id = ${userId}` another account's receipt under
the same key, from someone who left and joined again, turns the caller's own retry into NOT_FOUND. A wrong refusal,
not another account's answer, but no test met it either (L1 in section 3).

0.2. **The database tests fail after the matrix on the same database.** The matrix commits its worlds (each cell's
club, its days, its drops) into the database `ci` gives, and leaves them. The database tests expect a database that
holds none. On a freshly made server, `privacy` and then `db-tests`, with `main`'s code and steps and this slice's two
receipt tests already in the tree (961 tests: `main`'s 959 and those two, which passed): 15 tests failed in 11 files
(946 passed; the audit counted 15 in 10). Among them `tests/src/db/ops-spike-time.test.ts`, "moves it forward in a
transaction of its own, says the offsets before and after, and won't move it back", whose check that "the test
database holds" no "committed occurrence" fails, since `dev`'s clock won't move past a committed day. `ci` passes only because
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
- `leave-club.test.ts`, "answers a former member's retry from their own receipt, though another account left with the
  same key and joined again (the outside audit's B8)" (round 1): Maya leaves under a key; Alex leaves under the same
  key and is proposed, accepts and joins again, so Alex's receipt is older than Alex's new interval; Maya's retry is
  still her first answer, byte for byte. `leaveClub`'s check joins the receipt's actor's memberships, not the caller's,
  so unlike `reservedSince` it holds the account only by its own WHERE (L1).

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
4. It points `DATABASE_URL` and `DATABASE_ADMIN_URL` at the copy, and leaves the original's name in
   `TADAYO_PRIVACY_SOURCE`. Vitest starts each test file's worker from the main process's environment, and every file
   of the matrix connects through those two URLs (`tests/src/db/harness.ts`), so every file connects there.

After round 1 (section 5), since a copy keeps what is in a database but not what Postgres holds about it:
5. Before copying, it refuses an original with settings of its own (`ALTER DATABASE … SET`, `ALTER ROLE … IN DATABASE
   … SET`: a row of `pg_db_role_setting` for its oid), which the copy wouldn't keep; 0018's limits are the role's
   everywhere only while none is the database's.
6. After the grant, it compares what PUBLIC and `tadayo_app` may do there (CONNECT, CREATE, TEMPORARY,
   `has_database_privilege`) on the original and on the copy, and refuses any difference, so the matrix never runs
   with more rights than the database it stands for (T59).
7. It refuses two URLs that name different servers (host, port or `?host=`), since the copy is made on the admin's
   server and the app connects to the app's.

Each refusal goes to stderr before it is thrown (`refuse`): Vitest 5.0.5 on vite 8.3.5 fails while printing an error
a global setup throws ("TypeError: code.charCodeAt is not a function"), so the reason never reached the log. The
breakage run found it (section 3.1), and `docs/LIMITATIONS.md` records it.

The last copy is left after the run, for a look; the next run drops it first. So whichever of the two steps runs first,
the database `ci` gives never holds a world of the matrix's. It refuses to run when the database `ci` gives is
already called `tadayo_privacy`. It drops the last copy first, so two runs on one server at once end each other's
connections: run one at a time.

`tests/src/privacy/own-database.test.ts`, "is a copy of the migrated database ci gives, reached as tadayo_app and as
the admin, with the rights PUBLIC and tadayo_app have on the original and tadayo_app's time limits there" (named so
after round 1, which found the first name, "is where every file of the matrix connects…", claimed more than its
checks), holds it from inside: as `tadayo_app` and as the admin, `current_database()` is `tadayo_privacy`; the
original's name is set and isn't `tadayo_privacy`; schema `app` is owned by `tadayo_app`; what PUBLIC and
`tadayo_app` may do there equals what they may do on the original, with `tadayo_app` able to connect and not to create;
and `tadayo_app`'s three time limits there equal those it has connected to the original, none of them off.

No workflow or `tools/ci/` change: the steps' order in `ci.yml` stays as it is, and needs no freeze.

### 1.3. The scanner compares avatar versions and media classes (`tests/src/privacy/scanner.ts`)

- **A person:** while both the person's interval and the viewer's are active and the person's account is, `avatar_version`
  must be the version of the person's own account (`world.accounts`), and absent when the account has none (the
  contract's `Person`); once either interval has ended, none, as before (FQ75); and none while the account is being
  deleted, as the server shows it (`packages/domain/src/schedule/week.ts` `person`,
  `packages/domain/src/authorization/days.ts`), which round 1 found the first rule missed (section 5).
- **A card:** `media_class` must be the drop's own.
- **A drop reference** (`REFERENCES`): where it gives a `media_class`, the drop's own (Your drops' rows).
- **A reservation:** `media_class` must be the reservation's own (`world.reservations`), and a reservation the world
  doesn't hold is a finding (round 1).

The scanner's tests (`tests/src/privacy/scanner.test.ts`) gain two planted tests, and fixtures are made true to the
world they're judged in (the stricter checks found them): Cleo's person carries her account's avatar version
(`cleosPerson`, in place of each `person(cleo, "Cleo")`), an own contribution carries its drop's media class, the
caption-swapped card's own planted card carries the media class of the drop it names, and (round 1) the reservation
planted for a day outside Cleo's clubs is her own slot, `rsv_cleo`, in place of `rsv_new`, which the world doesn't
hold. One passing test was rewritten, which round 1 asked to name: "passes a caption card whose author carries their
avatar version (FQ74, ADR-031)" judged Ben's card carrying `v_avatar_ben`, seen by Cleo, but Ben's account has no
avatar in the test world, so it asserted that a wrong version passes; it now judges Cleo's card, `cleosCard()`,
carrying her account's own version, seen by Ben, and keeps its positive case.
- "catches an avatar version that isn't the person's own account's, or none where the account has one, or one while
  the account is being deleted (the contract's Person; the outside audit's B8)": Ben with Cleo's version, Cleo with
  none, Cleo with an older version, the same in a reaction's people, and (round 1) Cleo's account being deleted: her
  version is caught and none passes.
- "catches a media class that isn't its drop's or its reservation's own: on a card, in Your drops and on a
  reservation, and a reservation the world doesn't have (the outside audit's B8)".

## 2. Tests first

On `main`'s code at `954e47d`, with only the new tests (`git show 954e47d:<file>` over this slice's scanner and
config, then each restored from its own copy):
- the two receipt tests pass, since `main`'s lookups name the account; section 3's breakages show they catch each
  lookup without it;
- the two new scanner tests fail (`main`'s scanner finds none of the planted fields), and the 112 others pass;
- `own-database.test.ts` fails: `current_database()` is `postgres`.

Then, with the slice, on a freshly made server: `privacy` first, then `db-tests`, each green (the counts are in
section 3.1 and in section 3.2's entries of the journal).

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

Registered after round 1 (section 5), with D1 and D2's words now the test's new name, "is a copy of the migrated
database ci gives":

| # | Planted | Suite | Caught by, with its words |
| --- | --- | --- | --- |
| L1 | `leave-club.ts`: the former member's receipt read without `r.actor_user_id = ${userId} AND` | `db/leave-club.test.ts` | "answers a former member's retry from their own receipt" |
| S5 | `scanner.ts`: the avatar compare back to the first commit's, blind to the account's state | `privacy/scanner.test.ts` | "catches an avatar version that isn't the person's own account's" |
| S6 | `scanner.ts`: a reservation the world doesn't have let through | `privacy/scanner.test.ts` | "catches a media class that isn't its drop's" |
| D3 | `global-setup.ts`: the copy also given CREATE for `tadayo_app`, which the original doesn't give | `privacy/own-database.test.ts` | the setup refuses: "gives other rights than" |
| D4 | D3, with the setup's compare removed | `privacy/own-database.test.ts` | "is a copy of the migrated database ci gives" |
| D5 | `global-setup.ts`: `tadayo_app`'s `lock_timeout` turned off on the copy alone (`ALTER ROLE … IN DATABASE`) | `privacy/own-database.test.ts` | the same test |
| D6 | `global-setup.ts`: a setting of the original's own (`ALTER ROLE tadayo_app IN DATABASE <original> SET lock_timeout`), reset after | `privacy/own-database.test.ts` | the setup refuses: "has settings of its own" |
| D7 | `DATABASE_ADMIN_URL` naming the server as `127.0.0.1` while `DATABASE_URL` names `localhost` | `privacy/own-database.test.ts` | the setup refuses: "name different servers" |

D8 (named D3 before round 1), shown by the step order itself: `privacy` and then `db-tests` on one server fails on `main` as section 0.2 says,
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

D8: on `main` at `954e47d`, `privacy` then `db-tests` on one server, 15 failed in 11 files; with the slice, on a
freshly made server, `privacy` 551 of 551 (04:17 to 04:34 UTC; the run began on `954e47d`'s base and the worktree moved
onto `bb95dc9` at 04:23, which changed only iOS files), then `db-tests` 961 of 961 on `bb95dc9` (04:34 to 04:36 UTC);
and again on `main` at `bbd2291` (B1's #147), which the branch is made from: `privacy` first, 551 of 551 in 17 files
(05:00 to 05:17 UTC), then `db-tests` on the same server, 969 of 969 in 50 files (05:17 to 05:19 UTC).

The ten above ran at 04:38 on `bb95dc9`'s base; `bbd2291`'s #147 changes none of the files they plant into, nor the
tests registered for them. After round 1, at the second commit's files (`breakages2.py`, from 06:07:47 to 06:08:16 UTC): all
eighteen, the ten again and L1, S5, S6 and D3 to D7, caught, each by the test or the refusal and words registered. R2
and R4 again also by the tests that caught them before; S1 to S3 and S6 by the media-class test alone; S4 and S5 by
the avatar test alone; D1, D2, D4 and D5 by the own-database test; D3, D6 and D7 by the setup's refusal, before any
test ran, its words in the log. The first run of the eighteen (06:01 UTC) reported those three missed: the setup had
refused each, but Vitest printed only its own TypeError in place of the reason (section 1.2), so the runner found
no words. With each refusal written to stderr first, the eighteen ran again. Under `main`'s `leave-club.test.ts`, L1 was missed: the file passed whole (06:07 UTC). The runner, its registered list and its
output are on the `evidence` branch under `api/b2-test-gaps/<the second commit>/breakages/`.

With round 1's fixes, on `main` at `bbd2291`, on a freshly made cluster: `privacy` first, 551 of 551 in 17 files (06:08 to 06:27 UTC), then `db-tests` on the same server, 970 of 970 in 50 files (06:27 to 06:29 UTC).

## 4. What it leaves to others

- **The contract's half of 0.4** is its own PR, `api/b2-contract-5xx`, from `main`: one rule line in the document's
  description that any operation may answer a 500 or a 503 (`packages/contracts/src/document.ts`), with
  `openapi.yaml` written again and a contract test, as `docs/GITHUB.md` asks of a contract change
  (`docs/plans/api-b2-contract-5xx.md`, on that branch).
- **The app's half of 0.4** is the ios lane's: a test that `TadayoAPI`'s generated client reads an undeclared 500,
  and a 503 with a body, as `.unavailable` (`packages/swift/TadayoAPI`), told to the ios lane.
- **The stored receipts that hold a `Person`** (the roster's revisions, `createClub`'s and `acceptInvitation`'s
  answers) replay as stored until B6 (FQ139's last bullet). The stricter avatar compare would find a replay whose
  person's avatar version has changed since; no replay in the matrix crosses an avatar change today. B6 brings the
  receipts in line, not the scanner (round 1, P5; noted in FQ139).
- **B7's second part,** the alert, comes next: a GitHub issue that GitHub emails, the founder's answer to FQ150
  (`api/b2-failure-alerts`, once B7's first part, PR #148, has merged).
- **B6** (the supply chain and the evidence branch) after it, the api lane's parts in their own `tools/ci/` and workflow
  PRs, under a freeze where a workflow changes.

## 5. Review

Round 1, two fresh subagents at full depth on the first commit (`56cbecc`), since the slice changes the leak scanner
and the matrix's database: no blocker. Each finding is fixed in the second commit, or answered here.

Privacy and security:
- **P1 (should-fix):** the avatar compare ignored the account's state; the server shows no avatar while an account is
  being deleted. Fixed: section 1.3, S5.
- **P2:** the copy's database-level rights and settings weren't checked against the original. Fixed: section 1.2,
  steps 5 and 6, the test's new checks, D3 to D6.
- **P3:** the two URLs weren't checked to name one server. Fixed: step 7, D7. Answered: no host guard is added; the
  step only runs where `ci` or a developer points it, as the database tests' migrate step always has, and a TEMPLATE
  copy of a database others are connected to fails on its own.
- **P4:** a rewritten passing test the records didn't name, and a loose citation. Fixed: section 1.3; the scanner cites
  the contract's `Person`.
- **P5:** stored receipts that carry a `Person`. Answered: section 4, and FQ139.
- **P6:** a reservation the world doesn't hold passed silently. Fixed: section 1.3, S6.
- **P7:** `leaveClub`'s read of a former member's receipt. Fixed: sections 0.1 and 1.1, L1.

Tests and records:
- **G1:** the re-check's 961 tests held this slice's two receipt tests. Fixed: section 0.2.
- **G2:** a run credited to `bb95dc9` began before it existed, and the breakages named no base. Fixed: section 3.1.
- **G3, G6, G11, G12:** stale or unqualified lines in the journal's state and `docs/PROGRESS.md`. Fixed in the second
  commit's records.
- **G4:** as P4.
- **G5:** as P7.
- **G7:** the journal's "How to run" and a line on the `postgres` job's order. Fixed in the second commit's records.
- **G8:** the setup's comment gave the audit's file count. Fixed: 11, the audit's 10 named.
- **G9:** the own-database test's name claimed more than it checked. Fixed: section 1.2.
- **G10:** an assertion's message quoted as a test. Fixed: section 0.2.
- **G13:** a vague pointer, and the runner kept nowhere. Fixed: section 2, and the runner on the `evidence` branch.
