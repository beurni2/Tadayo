# B1's clubs on the API, and its first PR: `api/b1-create-club`

The api lane's plan for B1's clubs (`docs/MILESTONES.md`, B1; spec 04 and 32; `docs/JOURNAL.md` block 1.2, "Next, in order"). Its section 2 is pasted into the first PR's Plan section. The first PR adds no migration, changes no contract shape and no workflow file, and nothing runs on `dev` but the release `deploy-dev` makes on the merge.

## 0. Why B1's clubs come now

B2's schedule goes in four PRs (`docs/plans/api-b2-schedule.md`, section 0). Its first two merged (#68, #70). Its third, `api/b2-first-days-roster`, is a join or a leave in a club's first days, and "needs B1's join and leave commands, so it follows B1's". B1's contract merged in B0 (`packages/contracts/src/operations-clubs.ts`), and its tables too (`db/migrations/0003_people_and_clubs.sql`, `0004_rosters.sql`), but no B1 command is built: no club can be made on `dev` except by a test's own rows. So B1's clubs are built first, then the schedule's last two PRs.

## 1. The four PRs

Each starts from `main` once the one before has merged.

| PR | Branch | What it builds |
|---|---|---|
| 1, this one | `api/b1-create-club` | `createClub` and `getClub`: a proposed club with its creator's membership, and the club's information for one of its members. |
| 2 | `api/b1-propose` | People proposed and links made: `proposeRoster`, `getRosterRevision`, `createInvitation`, `revokeInvitation`. The candidates, the roster revision and its seal, six people counted with the candidates still open (A01). |
| 3 | `api/b1-accept` | Invitations and approvals: `previewInvitation`, `previewInvitationWeb`, `acceptInvitation` (with the rename revision, FQ66 and FQ84), `approveRoster`, `declineRoster`. The roster applied when everyone has said yes: the club starts, its first days open (`openFirstDays`, in the same transaction; `docs/plans/api-b2-schedule.md`, section 0), and later people join. |
| 4 | `api/b1-leave` | `leaveClub`, keeping the leaver's drops. Withdrawing them is B6's. |

Then `api/b2-first-days-roster` and `api/b2-membership-change`, as the schedule's plan has them.

## 2. This PR: `createClub` and `getClub`

### 2.1 Sources

- **The contract:** `packages/contracts/src/schemas/clubs.ts` (`ClubDetail`, `ClubSummary`, `CreateClubRequest`, `ClubName`, `Timezone`), `operations-clubs.ts` (`createClub`: 201, `Idempotency-Key`; `getClub`: 200 or the neutral not-found) and its examples (`sunday_people`, `kitchen_table`, `created`).
- **The spec:** 03 (a club of two to six), 04 (a club is proposed until its first roster is accepted; no instant reveal), 32 (the routes).
- **The book:** G01-create (name and time zone), G05-club-details (book p24).
- **The invariants:** T1 (the server's clock; `server_now`), T2 (the club's zone, fixed), T7 (the creator's membership is the one a roster doesn't make), T9 and T14 (the authorization module; the neutral not-found), T19 (one commit per idempotency key), T27 (an account being deleted), T33 (nothing says who has accepted or approved), T55 (an explicit field list).
- **The questions, at their defaults:** FQ16 (a club's states), FQ17 and FQ19 (the zone), FQ54 and FQ84 (a club starts when its first roster is accepted), FQ69 (an account with no name), FQ70 (a club's name), FQ80 (nothing of a suspended club). One new: FQ118, below.
- **The code it follows:** `packages/domain/src/identity/update-me.ts` and `schedule/command.ts` (a command with its receipt), `clubs/club-list.ts` (the club as the list gives it), `authorization/member.ts` (`activeMemberships`).

### 2.2 The rules

**`readClub(sql, userId, clubId, now)`** (`packages/domain/src/clubs/club.ts`), which `getClub` runs.

- Who: `activeMemberships`, the authorization module's one rule for something of a club that isn't a drop. The account is active, it has an active interval there, and the club isn't suspended. Anyone else, and an id that can't be one, gets null, which the route answers with the neutral not-found (T9, T14, FQ80).
- What: the club exactly as `listClubs` gives it (the same `clubRow`: its state, its members' number, Home's two days at `now`), `roster_version`, `can_propose` and the open roster revision's id when there is one.
- `can_propose` is true while the active members and the candidates still open are under six (`CLUB_SIZE`; A01). It says the roster is full, never who has accepted (T33).
- One statement, so one snapshot.

**`createClub(tx, clock, input, render)`** (`packages/domain/src/clubs/create-club.ts`), in one READ COMMITTED transaction. A refusal rolls everything back, the receipt included.

1. The clock, once, first. Making a club has no time rule, so the one sample is the receipt's instant, the club's `created_at` and the membership's `joined_at` (T1).
2. The receipt (T19). The same request under its key gets the first club back and makes no second one. Another body under the key is `IDEMPOTENCY_CONFLICT`.
3. The account's row, locked `FOR NO KEY UPDATE`. A deletion that has begun is `UNAUTHENTICATED` (T27). An account with no name is `PROFILE_INCOMPLETE` (FQ69).
4. The zone, stored in the server's own spelling (`clubTimeZone`; T2, FQ19). One the server can't resolve is `INVALID_REQUEST` naming `timezone`.
5. The club, then its creator's membership (`origin` creator), with new opaque ids.
6. The answer: the club as its creator reads it (`readClub`), stored in the receipt and answered with 201.

**The route** (`services/api/src/clubs/club.ts`) checks the key, then the body by the contract's own `CreateClubRequest`, and names the first bad field among `name` and `timezone`, never a value and never an unknown key. Both routes serialize by one explicit field list, `clubDetailBody` (T55).

### 2.3 Two decisions

- **`server_now` on a replay.** T19 says the same key and body get the original result. T1 says a countdown runs from `server_now`, so an old instant in a replayed answer would start a countdown in the past. The receipt therefore keeps the `ClubDetail` without `server_now`, and the route adds the instant of each request's own transaction. A replay is the first answer in every other field. A new club has no day, so nothing in the stored part depends on the clock.
- **How many clubs one account may make: FQ118.** No source gives a number. The default is no cap in the closed trial: the list shows an account's first 50 clubs (`LIST_LIMIT`), and a cap, if the founder wants one, comes with a contract PR that gives its refusal a code. `createClub` keeps the app's general 128 KiB body limit.

### 2.4 Tests

The tests of this PR were written after its code, not before it, against the contract and the rules above. That departs from CLAUDE.md's "write the tests first" and is said here and in the PR.

- **Rules, on Postgres** (`tests/src/db/create-club.test.ts`): the rows a creation writes; the zone's spelling; the replay at a later clock; the conflict; eight requests at once under one key make one club; an account being deleted; an account with no name; `readClub` for a member, a former member, a stranger and a malformed id; a club under two members; a suspended club; six people with the open candidates counted.
- **Routes** (`services/api/src/clubs/club.test.ts`): the serializer against the contract's three examples; every refusal that comes before a transaction; the 201; the mapping of each refusal; `getClub`'s 404.
- **The privacy matrix** (`tests/src/privacy/club.ts`, `rows.ts`, `matrix.test.ts`): `getClub` judged for every role in every phase from the world's rows, apart from the statements the route runs, with a field beyond the contract's failing the row. `createClub` sent eleven requests per role and phase: eight the contract refuses, one club made, its replay and a conflict. Then the new club read by its creator and listed. `tests/src/privacy/club.test.ts` tests the judges themselves on answers that are wrong in one way each.
- **The leak scanner** reads the same answers.
- **Deliberate breakages** of the rules, the routes and the judges, each of which a test must catch, published on the `evidence` branch under `api/b1-create-club/<short-sha>/breakages/`.

### 2.5 What this PR leaves

- Nothing proposes a person, so a club made on `dev` stays proposed with one member until PR 2 and PR 3.
- The ios lane can call both routes on `dev` after the merge. No contract shape changed, so the Swift client needs nothing new.
