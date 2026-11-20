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

`getMemberAvatar`, the one other clubs operation still unbuilt, is in none of the four: it serves an avatar's image, which needs the upload and the media route (spike S1's server part, then B3).

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
- `can_propose` is true while the active members and the candidates still open are under six (`CLUB_SIZE`; A01). It says the roster is full, never who has accepted (T33). The contract's other reason for false, "the club can't take proposals", is today only a suspended club, which nobody reads; PR 2's `proposeRoster` must answer `CLUB_FULL` exactly where this is false.
- One statement, so one snapshot.

**`createClub(tx, clock, input, render)`** (`packages/domain/src/clubs/create-club.ts`), in one READ COMMITTED transaction. A refusal rolls everything back, the receipt included.

1. The clock, once, first. Making a club has no time rule, so the one sample is the receipt's instant, the club's `created_at` and the membership's `joined_at` (T1).
2. The receipt (T19). The same request under its key gets the first club back and makes no second one. Another body under the key is `IDEMPOTENCY_CONFLICT`.
3. The account's row, locked `FOR NO KEY UPDATE`. A deletion that has begun is `UNAUTHENTICATED` (T27). An account with no name is `PROFILE_INCOMPLETE` (FQ69).
4. The zone, stored in the server's own spelling (`clubTimeZone`; T2, FQ19). One the server can't resolve is `INVALID_REQUEST` naming `timezone`.
5. The club, then its creator's membership (`origin` creator), with new opaque ids.
6. The answer: the club as its creator reads it (`readClub`), stored in the receipt and answered with 201.

**The route** (`services/api/src/clubs/club.ts`) checks the key, then the body by the contract's own `CreateClubRequest`, and names the first bad field among `name` and `timezone`, never a value and never an unknown key. Both routes serialize by one explicit field list, `clubDetailBody` (T55).

### 2.3 Decisions

- **`server_now` on a replay.** T19 says the same key and body get the original result. T1 says a countdown runs from `server_now`, so an old instant in a replayed answer would start a countdown in the past. The receipt therefore keeps the `ClubDetail` without `server_now`, and the route adds the instant of each request's own transaction. A replay is the first answer in every other field. A new club has no day, so nothing in the stored part depends on the clock.
- **A replay after the club has changed.** A retry under the same key gets the first answer even when its sender has since left the club or the club has been suspended. FQ112's default (the neutral not-found for someone who has lost the club) is for answers that name other people. This one names nobody else: it holds what its sender sent, the club's id, the sender's own membership id and the new club's first facts (proposed, one member, version 0, room to propose), and it reaches only its sender (`tests/src/db/create-club.test.ts`, "answers a retry with the first answer to its sender though the club is suspended or its creator has left: it names nobody else (FQ112)"). A replay doesn't read the account's state again either, as `updateMe`'s doesn't: the gate read it one request earlier. The founder is told under FQ112.
- **How many clubs one account may make: FQ118.** No source gives a number. The default is no cap in the closed trial: the list shows an account's first 50 clubs (`LIST_LIMIT`), and a cap, if the founder wants one, comes with a contract PR that gives its refusal a code; a rate limit needs none, since every operation already has `RATE_LIMITED`. A club past an account's fiftieth is made and then missing from the list.
- **The body limit.** As first pushed, `createClub` kept the app's general 128 KiB. After the review it takes `updateMe`'s 17 KiB (`services/api/src/app.ts` `ROUTE_BODY_LIMITS`): its largest valid body is under half of that.

### 2.4 Tests

The tests of this PR were written after its code, not before it, against the contract and the rules above. That departs from CLAUDE.md's "write the tests first" and is said here and in the PR.

- **Rules, on Postgres** (`tests/src/db/create-club.test.ts`): the rows a creation writes; the zone's spelling; the replay at a later clock; the conflict; eight requests at once under one key make one club; an account being deleted, and a request that waits for a deletion holding the account's row; an account with no name; `readClub` for a member, a former member, a stranger and a malformed id; a club under two members; a suspended club; six people with the open candidates counted.
- **Routes** (`services/api/src/clubs/club.test.ts`): the serializer against the contract's three examples; every refusal that comes before a transaction; the 201; the mapping of each refusal; `getClub`'s 404.
- **The privacy matrix** (`tests/src/privacy/club.ts`, `rows.ts`, `matrix.test.ts`): `getClub` judged for every role, state and phase from the world's rows, apart from the statements the route runs, with a field beyond the contract's failing the row. `createClub` sent eleven requests per role, state and phase: seven the contract refuses and one past the route's body limit, then one club made, its replay and a conflict. Then the new club read by its creator, listed, and refused to someone of another club; and the creator's clubs counted in the rows after each table, so that a refused body or a retry that made a club fails. `tests/src/privacy/club.test.ts` tests the judges themselves on answers that are wrong in one way each.
- **The leak scanner** reads the same answers.
- **Deliberate breakages**, run after the tests were written and again at the PR's last head: one-place changes of the rules, the routes and the judges, each of which a test must catch, published on the `evidence` branch under `api/b1-create-club/<short-sha>/breakages/`.

### 2.5 What this PR leaves

- Nothing proposes a person, so a club made on `dev` stays proposed with one member until PR 2 and PR 3.
- The ios lane can call both routes on `dev` after the merge. No contract shape changed, so the Swift client needs nothing new.

## 3. The second PR: `api/b1-propose`

`proposeRoster`, `getRosterRevision`, `createInvitation` and `revokeInvitation`. No migration (the tables are `db/migrations/0004_rosters.sql`), no contract shape and no workflow file changes. Nothing runs on `dev` but the release `deploy-dev` makes on the merge. Nobody can accept a link yet: that is PR 3, so on `dev` a link made here is only made, listed, replaced and revoked.

### 3.1 Sources

- **The contract:** `packages/contracts/src/schemas/clubs.ts` (`RosterRevision`, `Candidate`, `CandidateInvitation`, `CandidateLinkState`, `ProposeRosterRequest`, `CreateInvitationRequest`, `InvitationLink`, `RevokedInvitation`), `operations-clubs.ts` (the four operations) and their examples (`fixtures/examples-clubs.ts`: `leila`, `approve`, `link_revoked`, `link_expired`, `accepted`, `superseded`, `link`, `replayed`, `revoked`).
- **The spec:** 04 (a candidate accepts an exact roster; members approve every addition; an invitee gets nothing by holding a link), 32.
- **The book and the handoffs:** G01-invite-people, G03-approve, G05-members (book p30); handoff 1 (only a candidate's proposer makes or revokes its link, and only that member sees where it stands), handoff 4 (a link used to accept can't be revoked or replaced).
- **The invariants:** T1, T6 and A01 (six), T7 (an exact, sealed roster; a single-use link that grants nothing), T9 and T14, T15 and T33 (nothing says who has approved or accepted, and no count), T19, T52 (no token in a log), T55.
- **The questions, at their defaults:** FQ51, FQ54, FQ59, FQ60 (proposing is the proposer's approval), FQ65, FQ66 and FQ84 (PR 3's rename revision; here only that a revision's names never change), FQ71 (seven days; one latest link per candidate), FQ75 (a person's name), FQ77 (the token is returned once, only its hash is kept, a replay has no `url`), FQ112 and FQ113 (stored answers). One new, FQ119, in 3.3.
- **The schema's own guards** (0004): the seal (`roster_revisions_guard`, `roster_revision_rows_guard`, `roster_revisions_sealed`), one open revision per club, one latest link per candidate, a bound link never revoked or replaced.
- **The code it follows:** `packages/domain/src/schedule/command.ts` (who asks before the receipt, then the club's row, then the clock), `clubs/create-club.ts`, `clubs/club.ts` (`CLUB_SIZE`, `can_propose`), `schedule/week.ts` (`person`, FQ75).

### 3.2 The rules

**Who reads a revision** (`readRevision(sql, userId, revisionId, now)`, `packages/domain/src/clubs/roster-revision.ts`), which `getRosterRevision` runs and every command here answers with.

- The caller is a member of the revision's club by the authorization module's rule (`activeMemberships`), and the caller's interval is one of the revision's own members (`roster_revision_members`): the people it asks. Anyone else, and an id that can't be one, gets null, the neutral not-found (T14; FQ119).
- Only a sealed revision is served, and none whose proposer, or a candidate's proposer, has no name to show (FQ75): the contract's `proposed_by` is required, so there is no honest answer without it. A member with no name is left out of `members`, as `listMembers` leaves them out.
- `members`: the revision's member rows, each as a Person by FQ75's rule, in the order they joined (interval id, byte order, for a tie: FQ114). `candidates`: its candidate rows by `position`, each with the revision's own label and its candidate's proposer as a Person. `proposed_by`: the revision's proposer. `club`: the club as the caller holds it.
- `invitation` is on a candidate only when the caller's interval is that candidate's `proposed_by_interval_id` and a link exists: the candidate's latest link (`replaced_by_id IS NULL`) by id, expiry and state. The state is read, never stored: `accepted` when this revision's candidate row was accepted with it; else `used` when it is bound; else `revoked`; else `expired` when `expires_at` isn't after `now`; else `live`.
- `my_decision`: the caller's own approval row, or pending. Nothing else of `roster_approvals` is read, no acceptance but through the proposer's `invitation`, and no count (T15, T33).
- One statement, so one snapshot.

**`proposeRoster(tx, clock, input, render)`** (`clubs/propose-roster.ts`), in one READ COMMITTED transaction. A refusal rolls everything back, the receipt included.

1. The caller's membership of the path's club (`activeMember`), before the receipt is looked at: someone with nothing of the club gets NOT_FOUND on a first request and on a retry (FQ112).
2. The receipt (T19), 201. A key is answered only when its receipt was made once the caller's present interval had begun (`reserveAsMember` and `reservedSince`, `packages/domain/src/idempotency/receipt.ts`): someone who left and joined again gets NOT_FOUND under an earlier key, for the same request and for another, never what the earlier interval was answered and never IDEMPOTENCY_CONFLICT, which would say the key was used (FQ112; review rounds 1 and 2). The rule compares two instants, the receipt's `created_at` and the interval's `joined_at`, both samples of the server's clock; a receipt made at the very instant the interval began is the interval's own. Then the club's row, `FOR UPDATE`: every roster command of a club takes it first, as the schema's guards do.
3. Who is asking, again, under the lock: the same interval as in step 1, or NOT_FOUND. An interval that ended while the request waited, a new one begun since included, proposes nothing and keeps no receipt, so no receipt is older than the interval it answered, and that interval's own retry runs as a first request.
4. `expected_roster_version` against `clubs.roster_version`: VERSION_CONFLICT with `current_version`.
5. Six: the active members, the candidates still open and `add` together are at most `CLUB_SIZE`, else CLUB_FULL. This is `can_propose`'s rule, so CLUB_FULL is answered wherever `can_propose` is false.
6. The clock, sampled after the lock (T1).
7. The change, in the order the schema's guards ask: the open revision, if there is one, ends as superseded by the new one (its `version` moves by one); the new revision (`origin` proposal, proposed by the caller) with the club's active members exactly as its members; the earlier revision's open candidates carried at their own labels in their order, with no acceptance carried (they accept again; T7), then a candidate for each of `add`, proposed by the caller's interval, positions from 1; the seal; then the caller's implicit approval (FQ60), which the schema takes only of a sealed roster. `clubs.roster_version` moves by one.
8. The answer: the new revision as its proposer reads it (`readRevision`), stored in the receipt and answered as the receipt keeps it (FQ113: the names as answered).

**`createInvitation(tx, clock, input, render)`** (`clubs/invitation.ts`).

1. The caller's membership of the path's club, before the receipt: NOT_FOUND (FQ112).
2. The receipt, 201, with the same rule for a used key as `proposeRoster`'s (`reserveAsMember`), then the club's row `FOR UPDATE`, then who is asking again: the same interval, or NOT_FOUND.
3. The candidate: of this club, still open, on the club's open revision, and proposed by the caller's interval. Anything else is NOT_FOUND, the same for another member's candidate whatever its link's state (T14, handoff 1).
4. The latest link: when it is bound, NOT_ALLOWED (handoff 4).
5. The clock, then the new link: 32 random bytes as base64url (43 characters) for the URL's fragment, of which only the SHA-256 is stored; it expires `INVITATION_DAYS` (7) days after the sample's whole second (FQ71), so the expiry the contract's whole-second Instant says is the expiry kept; the token is hashed in the process and never sent to the database, not even as a parameter; the earlier latest link is marked replaced by it.
6. The answer `{ invitation_id, candidate_id, expires_at }` is what the receipt keeps. The first answer alone adds `url` (`https://tadayo.app/i#<token>`), which is never stored or logged; a replay is the stored answer, without it (FQ77, T52).

**`revokeInvitation(tx, clock, input)`**, with no key: repeating it changes nothing and answers the same.

1. The link's candidate and club, read by the link's id; the caller's membership of that club; the club's row `FOR UPDATE`; the caller again, and that the caller's interval proposed the candidate: NOT_FOUND otherwise.
2. A bound link: NOT_ALLOWED.
3. `revoked_at` is set once, at the clock's sample, if it isn't set. A link already replaced or expired is revoked the same way: it didn't work before and doesn't after. The answer is `{ invitation_id, state: "revoked" }`.

**The routes** (`services/api/src/clubs/roster.ts`) check the key, then the body by the contract's own schema, naming the first bad field and never a value, and serialize by explicit field lists (T55). Body limits (`ROUTE_BODY_LIMITS`, `services/api/src/app.ts`): 80 KiB for `proposeRoster` (five labels of at most 640 code points each, escaped) and 1 KiB for `createInvitation`.

**For PR 3 and PR 4** (from review round 1; none is reachable until those PRs, since nothing here ends a membership, a candidate or a revision but a newer proposal):

- `acceptInvitation` must take the club's row too, as `createInvitation` and `revokeInvitation` do, so that accepting can't race a replace or a revoke of the same link. It hashes the token's base64url text, as `createInvitation` does, not the bytes it spells.
- When a revision ends with no successor (declined, or applied with someone left out), every candidate of it still open must be ended or deliberately carried: six counts every open candidate of the club, while a proposal carries only the open revision's, and a link is made only on the open revision. An open candidate on no open revision would hold one of the six places for good.
- When a member leaves or an account is deleted, that member's open candidates must be ended in the same transaction: only a candidate's proposer makes its link, so a candidate whose proposer is gone could never be linked, and if the proposer's interval ends with no name to show (`account_deleted`, T27), the revision that carries the candidate can no longer be read by anyone, and the next proposal, which answers with its own new revision, would fail. `tests/src/db/propose-roster.test.ts` ("leaves out a member with no name to show...") pins the read's side of this on rows made by hand.
- Approving and declining need a rule for a revision nobody can read (its proposer has no name).
- The matrix's former member is on no revision its cells read (the role's membership was made by rows, not by a roster the world keeps as a target), so a former member's read of a revision that lists them is held by the database test alone (`tests/src/db/propose-roster.test.ts`, "gives the neutral not-found to a stranger..."; the deliberate breakages R03 and X01). PR 4, which makes former members by leaving, gives the matrix's former member a revision that lists the interval that left.
- A membership's `joined_at` must be a sample of the server's clock taken under the club's row, as every command's is, when PR 3 makes members: `reservedSince` is sound only then (a receipt of an earlier interval is made before that interval's leave, which is before the new `joined_at`). The exact alternative, should that ever not hold, is to keep the interval's id on the receipt, which is a migration.

### 3.3 Decisions

- **Who reads a revision: FQ119.** The contract says a revision is what every active member approves, and gives no reader. The default is the narrowest: a member the revision itself lists, while still an active member of the club. A member who joined later, a former member and a candidate get the neutral not-found; a candidate reads the roster through the invitation's preview (PR 3). It widens later without changing data.
- **`roster_version` moves by one per proposal,** though a proposal both ends a revision and makes one (0003's comment lists what moves it, not by how much).
- **Labels aren't compared.** No source refuses two candidates with one label, or a label equal to a member's name, so neither is refused.
- **A link for a candidate whose earlier link was only used in an earlier revision** is NOT_ALLOWED, as the contract says of a link the candidate accepted with "in this revision or an earlier one".
- **Proposing approves the whole new roster, carried candidates included.** When a member proposes while another revision is open, the new revision holds the earlier candidates too, and the proposer's implicit approval (FQ60) is of that whole roster, though `expected_roster_version` proves only that the proposer read the club after the earlier proposal, not each name. It follows from FQ60 and the contract's carry; no source says otherwise. Raised with the founder in the PR.
- **`used` on a superseded revision** can mean the candidate accepted the newer revision with the link, not an earlier one. The value is the contract's for "bound, and not accepted on this revision"; nothing shows it yet.
- **A proposal in any club its member can read:** proposed, active or paused (FQ16, FQ51). A suspended club gives its members nothing (FQ80).

### 3.4 Tests, written first

- **Rules, on Postgres** (`tests/src/db/propose-roster.test.ts`, `invitation.test.ts`, with their helpers in `roster-world.ts`): the rows a proposal writes and the seal; the proposer's implicit approval and no other; superseding with candidates carried and acceptances not; the version conflict; six with members and open candidates counted, at each size; a replay at a later clock and the conflict; eight proposals at once under one key, and two members proposing at once (one VERSION_CONFLICT); a stranger, a former member, a member of another club, a suspended club and a retry by someone who has left (FQ112); `readRevision` for each of those and for a member who isn't on the revision; `invitation` only for the candidate's proposer, in each of the five states by rows and by the clock; the link's token hashed and never stored; a new link replacing the old; NOT_ALLOWED for a bound link; another member's candidate NOT_FOUND; the replay without `url`; revoke, repeated, of a replaced link and of an expired one.
- **Routes** (`services/api/src/clubs/roster.test.ts`): the serializers against the contract's examples; every refusal before a transaction; the mapping of each refusal; no `url` and no token in any log line.
- **The privacy matrix** (`tests/src/privacy/roster.ts`, `rows.ts`, `matrix.test.ts`): the four routes for every role, state and phase, judged from the world's rows; `invitation` absent for everyone but the candidate's proposer; no answer with a count or another member's decision. The judges are themselves tested on answers wrong in one way each (`roster.test.ts`).
- **The leak scanner** (`tests/src/privacy/scanner.ts`, the allowance its header promised to B1): a link's id is shown only where the scanner judges it (`CandidateInvitation`, `InvitationLink`, `RevokedInvitation`) and only to a viewer whose active interval proposed the link's candidate; `url` is allowed only in `createInvitation`'s 201, only as `https://tadayo.app/i#` and the 43-character token whose SHA-256 the link's row holds. The matrix scans that one answer before the world keeps the token back and every later answer after, so a replay that carried it fails. Each allowance has a test that it can fail (`scanner.test.ts`, "the proposer's invitation link").
- **How the tests were written:** before the code, from this section, but first run after it: the database tests passed on their first run (43 of 43), so there is no red run to show for them. The deliberate breakages are the evidence that they can fail. After review round 1: 14 more database tests (57 in the two files), among them the two for someone who left and joined again, which were run and failed before `reservedSince` was called and pass with it; a clock that reads later at each sample, so the sample after the lock is the one that dates the change; a member who leaves while the proposal waits for the club's row; two link requests at once, and a link racing a revoke; an unsealed revision, a proposer with no name, members who joined at one instant. After the check of the second commit: four more database tests (61 in the two files): a request at the very instant its sender's membership began; a member who leaves and joins again while the proposal waits; a proposer who leaves while a link request waits, and while a revoke waits; and the two races are held behind a locked club's row until both requests wait for it.
- **Deliberate breakages** at the PR's last head, on the `evidence` branch under `api/b1-propose/<short-sha>/breakages/`.

### 3.5 What this PR leaves

- Accepting, approving and declining (PR 3), so no revision is applied and no club starts.
- `listMembers`' `open_revision` (the contract's `Members`): it comes with PR 3, where G05-members first has something to approve.

## 4. The third PR: `api/b1-accept`

`previewInvitationWeb`, `previewInvitation`, `acceptInvitation`, `approveRoster` and `declineRoster`; the roster applied; `listMembers`' `open_revision`. No migration (the tables are `db/migrations/0004_rosters.sql`), no contract change and no workflow file. Nothing runs on `dev` but the release `deploy-dev` makes on the merge. The web page that calls `previewInvitationWeb` (`apps/web`, with its CORS rule) comes with its own PR.

### 4.1 Sources

- **The contract:** `packages/contracts/src/schemas/clubs.ts` (`InvitationTokenRequest`, `WebInvitationPreview`, `InvitationPreview` and its seven states, `InvitationRosterEntry`, `AcceptInvitationRequest`, `InvitationAcceptance`, `RosterDecisionRequest`, `Members.open_revision`), `operations-clubs.ts` and the examples.
- **The spec:** 04 ("A candidate accepts the exact roster they saw"; "Existing members approve any additions, including initial people added after they accepted a smaller roster"; a link is single use and grants nothing by being held), 32.
- **The book and the handoffs:** G02 (open, changed, expired, full), G03-waiting, G03-approve, G05-members (book p9, p30); handoff 4 (a link an account accepted with can't be revoked or replaced).
- **The invariants:** T1, T6 and A01, T7, T8, T9, T14, T15, T19, T27, T33, T52, T55.
- **The questions, at their defaults:** FQ47 (names only), FQ54 and FQ84 (the club starts with its first applied roster), FQ59 (a revoked, replaced or used link is the neutral not-found), FQ60, FQ65 (approval and acceptance in either order), FQ66 (another name makes a new revision), FQ71, FQ75, FQ80, FQ100, FQ112, FQ113, FQ119. One new, FQ120, in 4.3.
- **What section 3.2 left to this PR:** accepting takes the club's row and hashes the token's text; no open candidate is left on no open revision; a rule for a revision nobody can read; `joined_at` is a sample taken under the club's row.

### 4.2 The rules

**What a token names** (`linkFacts` and `namesNothing`, `packages/domain/src/clubs/invitation-facts.ts`). The token is hashed in the process (SHA-256 of its base64url text) and only the hash goes to the database. One statement reads the link, its candidate, the club, the caller's own membership, the inviter's name (FQ75), whether the caller holds another place in the club's roster, and the club's open revision as it lists the candidate. A token names nothing, the neutral NOT_FOUND, when no link has its hash, when the link was revoked or replaced, when another account accepted with it, and in a suspended club (T14, FQ59, FQ80). The preview and the command read the same facts, so they can't disagree.

**`previewInvitationWeb`**, public: the inviter's name for a link nobody has used, not revoked, replaced or expired, whose candidate is still open, in a club that isn't suspended; anything else is NOT_FOUND. One statement, read only.

**`previewInvitation`** (`invitationStanding`, `clubs/invitation-preview.ts`), read only, never binding or using the token (T7). In order:

1. Nothing, as above.
2. `joined`, with the club, to a member of the club, whoever the link was for.
3. Nothing once the link's candidate has joined and the caller is no member (they left).
4. A candidate whose proposal ended: `did_not_go_ahead` to the account that accepted with the link, nothing to anyone else. Nothing says who declined (T33).
5. `expired`, with the inviter's name, for a link nobody used, from its expiry (FQ71). A link its account has used doesn't expire for that account: it can't be replaced (handoff 4), so an expiry would leave the candidate no way to accept a changed roster.
6. Nothing to an account that already holds another place in this club's roster (one account, one place).
7. Nothing when the inviter, or every member of the roster, has no name to show (FQ75).
8. `full` at six members. Six count every open candidate when they are proposed, so no command leads here; it is the answer should the rows say so.
9. The open revision's exact roster, names only (FQ47): its members who have a name, in the order they joined, then its candidates by position, each by the revision's label, the link's own marked `is_you`. `waiting` when the candidate accepted this revision with the link and the account's profile name is still the label it shows, while a member's approval is still to come; `changed` when the account accepted an earlier one, has changed its name since it accepted, or accepted a revision every member has since approved without it being applied (a name changed away and back around the last approval: accepting again joins); else `open`.

**`acceptInvitation(tx, clock, input, render)`** (`clubs/accept-invitation.ts`), one READ COMMITTED transaction; a refusal rolls everything back, the receipt and the binding included.

Where a request stands (`standingOf`), from one read of the link's facts, the revision it names and the caller's own membership, in this order:

- a. Nothing, the neutral NOT_FOUND: what the token names to nobody, as above; a member holding a link that isn't the one they joined with; an ended candidate the account never accepted; a revision that doesn't list the link's candidate.
- b. INVITATION_EXPIRED for a link nobody has used, from its expiry.
- c. Nothing when the account holds another place in the club's roster, whatever revision or version the request names, as the preview has it.
- d. ROSTER_CHANGED with the newest revision's id (the end of the `superseded_by` chain) when a newer revision replaced the one named; VERSION_CONFLICT with the revision's version. A revision that has ended, named at its last version, takes no acceptance: the account that joined by it is answered `joined`, which changes nothing; anything else is nothing.
- e. CLUB_FULL at six members.

Then the command:

1. Where the request stands, with no lock. Every request that names nothing is NOT_FOUND here, before the receipt is looked at, for a first request and a retry alike. So a key the account has used never answers IDEMPOTENCY_CONFLICT for a token that names nothing: a used key tells such a token from one nobody made no more than a new key does (T14).
2. The receipt (T19; its stored request holds the token's hash, never the token). Then the account's row (UNAUTHENTICATED once a deletion has begun, T27; PROFILE_INCOMPLETE), the club's row `FOR UPDATE`, as every roster command, and the link's row.
3. The clock, after the lock (T1), and where the request stands again at it: each refusal of a. to e., in that order.
4. The name (FQ66, FQ84). When the account's profile name isn't the label the revision shows, compared as stored, the server makes a new revision: `origin` rename, proposed by the candidate's proposer, with the club's members, every open candidate carried at their label and this one under the account's name, no acceptance and no approval, so everyone accepts and approves again. The link binds to the account. The answer is `changed`; `roster_version` moves by one.
5. Otherwise the link binds, the candidate's row on the revision is accepted with it, and the roster is applied if it is ready: `joined` with the club, or `waiting`.

**`approveRoster` and `declineRoster`** (`clubs/decide-roster.ts`).

1. The revision as the caller reads it (`readRevision`, FQ119), before the receipt: anyone else, and a revision nobody can read (its proposer has no name), is NOT_FOUND. This is the rule section 3.2 asked for: what can't be read can't be decided.
2. The receipt (`reserveAsMember`), the club's row, the caller again under the lock.
3. ROSTER_CHANGED with the newest revision's id; VERSION_CONFLICT with the revision's version; then the clock.
4. A member decides once, and only an open revision takes a decision. A request that can change nothing (the revision has ended; the member has decided, by proposing or before) is answered 200 with the revision as it stands: the contract gives these commands no refusal for it.
5. Approving writes the approval and applies the roster if it is ready. Declining writes the decision, ends the revision as `did_not_go_ahead` at its next version, ends every candidate of it still open, and moves `roster_version` by one.

**The roster applied** (`applyIfReady`, `clubs/apply-roster.ts`), called by `acceptInvitation` and `approveRoster` after their own change, so whichever comes second applies it (FQ65). Ready: open, sealed, its members exactly the club's active members, every one approved, and at least one candidate accepted with a link bound to an active account whose profile name is still the label the revision shows. An acceptance stands for the name the members read and approve (FQ66, FQ84): an account that changed its name after accepting joins nobody. Its preview says `changed`; when it accepts again the name's revision is made (`acceptInvitation`, step 4); until then it is carried like someone who hasn't accepted. Then, at the command's own sample taken under the club's row:

1. Members and joiners are at most six, else CLUB_FULL.
2. The revision ends as `applied`, its version up by one.
3. Each candidate whose acceptance stands joins: a new membership interval (`origin` roster, `joined_at` the command's sample) that inherits nothing (T8). A candidate who accepted with an account whose deletion has begun ends instead.
4. `roster_version` moves by one, once. A club that hadn't started starts, and its first days open in the same transaction (`openFirstDays`), dated by that same sample. A club that had started gains its members with no day yet: the schedule's own change is B2's next PRs (FQ100).
5. The candidates who hadn't accepted, or whose acceptance no longer stands, are carried into a new revision the server makes (FQ120), or end when their proposer is no longer a member.

**`listMembers`' `open_revision`**: the club's open revision as the caller reads it (FQ119), read in the roster's own statement (`readableRevisions`), so one snapshot. The clocks refuse any isolation but READ COMMITTED, so a second statement in a REPEATABLE READ transaction wasn't an option.

**The routes** (`services/api/src/clubs/invitation.ts`, `roster.ts`): the key, then the body by the contract's schema, naming the first bad field and never a value; the token only in a body, never in a path, a query or a log line. Body limits: 1 KiB for the two decisions, 2 KiB for the previews, 3 KiB for `acceptInvitation`.

### 4.3 Decisions

- **FQ120: the candidates who hadn't accepted when a roster is applied.** Spec 04 says existing members approve any additions, "including initial people added after they accepted a smaller roster". So the left candidates are carried into a new revision made by the server: the same proposer, whose approval stands as it did when they proposed (FQ60), the club's members now, the newly joined included, who each approve it. The other readings: end them (the proposer proposes again), or leave them open on no revision, which section 3.2 forbids. Raised with the founder in the PR.
- **No refusal for a decision that changes nothing.** The contract lists no NOT_ALLOWED for `approveRoster`, `declineRoster` or `acceptInvitation`, so a repeated or late decision is answered with the revision as it stands, and an acceptance of an applied revision by the account that joined by it is answered `joined`.
- **A used link doesn't expire for its account** (step 5 of the preview). FQ71's seven days are for a link nobody has used.
- **One account, one place.** An account that accepted for one candidate of a club gets nothing from another link of that club while the first candidate is open. No source says so in words; two places for one person can't be meant.
- **A member previewing any working link of their own club is told `joined`;** accepting with a link they didn't join with is NOT_FOUND.
- **Names are compared as stored,** so a difference of case makes the rename revision (FQ66 says "isn't the one the revision showed").
- **A rename's revision has no implicit approval** (FQ84: never for a name), the proposer approves again.
- **An acceptance stands for the name the members read** (review round 1). FQ66's default says a changed name is a new revision everyone accepts again. `updateMe` doesn't touch a roster, so the server makes that revision when the account next accepts, and until then an acceptance under the earlier name joins nobody: the roster isn't applied for that candidate, and the account's preview says `changed`. The other reading, making the revision at the moment of the rename, would have `updateMe` take every club's row the account is a candidate of; it can come later without changing data.
- **The matrix's cells apply no roster.** Another member declines at the end of each phase's table, so the club's members stay who the cell's other rows expect. The applied roster goes through the app in its own test, and through the commands on Postgres.

### 4.4 Tests

- **Rules, on Postgres** (`tests/src/db/accept-roster.test.ts`, 55 tests, helpers in `roster-world.ts`): the first roster and the club's start with its first days; FQ120's carry; approval and acceptance in either order; T33; the rename revision; a decline; decisions that change nothing; who may decide; the version and ROSTER_CHANGED with a chain; replays; what a token names; the expiry at its instant; `full` and CLUB_FULL by rows made by hand; the token never stored; an account being deleted; a proposer who is no longer a member; `listMembers`' open revision; four races held behind the club's row.
- **Routes** (`services/api/src/clubs/invitation.test.ts`, `roster.test.ts`, `members.test.ts`): the serializers against the contract's examples; every refusal before a transaction; the body limits; the mapping of each refusal; the token in no log line.
- **The privacy matrix** (`tests/src/privacy/invitation.ts`, `roster.ts`, `members.ts`, `rows.ts`, `matrix.test.ts`): the five routes in every cell with a body that changes nothing; in every phase, for the revision the roster's table made, the invitation's table (`rows.ts` describes each step), each step held to the outcome it names and each answer scanned with its own caller's facts; a roster applied through the app. The judges are tested on answers wrong in one way each (`invitation.test.ts`, `roster.test.ts`, `members.test.ts`).
- **The leak scanner** (`tests/src/privacy/scanner.ts`, the allowance its header promised to B1): a roster's names, the club's name and the inviter's name only to a caller who presented the link's own token, by the rule in its header; the link's id only in such an answer. Each allowance has a test that it can fail (`scanner.test.ts`, "what a link's holder reads through it").
- **How the tests were written:** after the code, from this section's rules, so none was seen to fail before its rule existed. Review round 1 showed, by changing the code, eight rules no test held; the 17 tests of `accept-roster.test.ts`'s last four describes came from it. The deliberate breakages, run at the PR's last head and published on the `evidence` branch under `api/b1-accept/<short-sha>/breakages/`, are the evidence of which changes the tests catch.

### 4.5 What this PR leaves

- **PR 4 (`api/b1-leave`):** a leaver's open candidates and open revision (section 3.2); the matrix's former member on a revision that lists the interval that left.
- **B2's next PRs:** a day for someone who joins a club that has started (FQ100), and the first days' roster when someone joins or leaves while they are open.
- **B6:** deleting an account must end its bound open candidates; until then such a candidate ends when its roster is applied, and holds a place meanwhile. The deletion must take the club's row of each such candidate after the account's row, in `acceptInvitation`'s order, and read the account's memberships again under it: `applyIfReady` reads a joiner's account state under the club's row without locking the account (the club's row then the account's would be the reverse of `acceptInvitation`'s order, a deadlock), so a deletion that didn't wait for the club's row could miss a membership made beside it (review round 1, R2-2).
- **The web page's PR:** `apps/web`'s invitation page and the CORS rule for `previewInvitationWeb`.
- **Not reachable through a cell of the matrix,** and held by the database tests and the judges' tests: `expired`, `full`, INVITATION_EXPIRED and CLUB_FULL of an acceptance; a revoked or a replaced link's token on the three routes; a suspended club's link; a second place in the same club; a link whose candidate joined and then left; ROSTER_CHANGED of an acceptance; an inviter with no name; an ended proposal's link nobody used; an account that changed its name after accepting. A club's start with its first days goes through the commands on Postgres, not through the app: the applied-roster test of the matrix uses a club that has started.
