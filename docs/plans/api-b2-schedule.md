# B2's schedule slice: `api/b2-schedule`: the first days, stored, read, chosen and confirmed

The api lane's plan for the first PR that builds what B2's contract describes (`docs/plans/api-b2-contract.md`; `docs/JOURNAL.md` block 1.2, "Next, in order", step 2), written before the code. It is pasted into the PR's Plan section. The PR adds one migration, the schedule's rules in `packages/domain`, three routes and their tests. No contract shape changes, no workflow file changes, and nothing runs on `dev` but the migration that `deploy-dev` applies on the merge.

## 0. What this PR builds, and what it leaves to the next ones

B2's schedule work is too large for one reviewable PR, so it goes in four, in this order. Each starts from `main` once the one before has merged.

| PR | Branch | What it builds |
|---|---|---|
| 1, this one | `api/b2-schedule` | The proposals' tables (both kinds). The club's first days: opened, read by each viewer, chosen and confirmed, and applied on the last confirmation. `getSchedule`, `chooseScheduleDays`, `confirmScheduleDays`. |
| 2 | `api/b2-generation` | The worker's rolling generation of days several weeks ahead (spec 05), from each confirmed day's first date, with Q18's workers-stopped check; `Member.next_day`, `Member.position` (FQ98) and `listMembers`. |
| 3 | `api/b2-first-days-roster` | A join or a leave in the first days: the revision (FQ102), the late join (FQ100), the leave once a day is confirmed, the club paused under two members (FQ16). It needs B1's join and leave commands, so it follows B1's. |
| 4 | `api/b2-membership-change` | The membership change: its boundary after every generated day (FQ61), everyone's confirmation (FQ56), nothing shown before its start (FQ81, FQ101), its replacement when the start passes (FQ49), and how generation meets a pending change's start (the one gap `Schedule`'s description still lists). |

Home's route, reservations and the allowance transaction are B2's other half and have their own plans.

**What nothing in production calls yet.** B1's activation opens a club's first days (spec 04: "On activation, propose the appropriate calendar and let each member confirm their days"). B1 isn't built, so this PR's `openFirstDays` is called only by its tests and by the privacy matrix's world; B1's activation command calls it in the same transaction that starts the club. Until then no club on `dev` has a proposal, and the three routes answer the neutral not-found or a schedule with neither `current` nor `proposal`.

**What a confirmed day does here.** It writes its row in `app.schedule_assignments` with its first date (FQ79). No day is made from it until PR 2's generation, so nothing opens on `dev` from this PR alone.

## 1. Sources

- **The contract** (`packages/contracts/src/schemas/clubs.ts`: `Schedule`, `CurrentSchedule`, `ScheduleProposal`, `ScheduleSlot`, `ScheduleSlotState`, `ScheduleChoiceRequest`, `ScheduleConfirmRequest`; `operations-clubs.ts`: the three operations and the order of their refusals) and its plan, `docs/plans/api-b2-contract.md`, sections 1.1 to 1.8. They bind this slice.
- **The questions**, all at their defaults: FQ46, FQ48, FQ55, FQ57, FQ78, FQ79, FQ98 to FQ100 and FQ102 (`docs/QUESTIONS.md`).
- **The spec:** 04 (activation proposes the calendar; no instant first reveal), 05 (the table of days by club size, its examples, "unresolved conflicts are visible rather than silently swapping dates").
- **The invariants:** T1 (the server's clock), T2 (7 AM resolved in the club's zone), T6 (one star per day, never Sunday, a clash shown and never swapped), T9 and T14 (the authorization module; the neutral not-found), T15 and T33 (nothing says who hasn't acted), T19 (one commit per idempotency key), T49 (no date that doesn't exist), T55 (an explicit field list per viewer).
- **The schema it builds on:** `db/migrations/0003_people_and_clubs.sql` (clubs, membership intervals), `0005_schedules_and_days.sql` (`schedule_versions`, `schedule_assignments`, both written once; "The proposals every member confirms come with B2"), `0009_platform.sql` (the receipts).
- **The code it follows:** `packages/domain/src/identity/update-me.ts` (a command with its receipt), `services/api/src/clubs/list.ts` (a read in one snapshot with the clock's sample first), `packages/domain/src/time/civil.ts` (`resolveCivilTime`, `REVEAL_TIME`).

## 2. The migration, `db/migrations/0012_schedule_proposals.sql`

It adds three tables and changes none. Nothing is dropped or rewritten (FQ39).

- **`app.schedule_proposals`**: one proposed week.
    - `id`, `club_id`, `reason` (`activation` or `membership_change`), `version` (`app.version`, from 1), `state` (`open`, `applied`, `superseded`), `effective_from` (a date), `days_per_member` (1 or 2), `schedule_version_id` (the version its confirmed days join; set for the first days, where the version is made with the proposal, from the club's first local date), `replaced_by` (its successor, when one replaced it), `created_at`, `closed_at`.
    - One open proposal per club (a partial unique index), which is the contract's one `Schedule.proposal`.
    - A guard keeps `id`, `club_id`, `reason`, `effective_from`, `schedule_version_id` and `created_at`; lets `state` go only from `open` to `applied` or `superseded`, with `closed_at` set exactly then; and lets `version` only rise. `days_per_member` changes only while the proposal is open (PR 3's revision).
- **`app.schedule_proposal_members`**: the members a proposal includes, by membership interval.
    - `proposal_id`, `interval_id`, `club_id`, `confirmed_at`. As built, there is no `chose_at`: the day rows already say what a member holds, whether by proposal or by choice, and no rule reads when they first chose.
    - `confirmed_at` is set once and never cleared (FQ57).
- **`app.schedule_proposal_days`**: who is proposed and who holds which weekday.
    - `proposal_id`, `interval_id`, `weekday`, `suggested` (the proposal gave it to this member), `held` (the member holds it now). A row has one or both; a row with neither is deleted.
    - A member holds at most `days_per_member` days: a deferred constraint trigger counts them at commit.
    - A member who has confirmed changes no row (the guard reads `confirmed_at`), and no hold lands on a day already confirmed.
    - As built, a confirmation is checked at commit by `app.schedule_confirmation_guard`: the member holds exactly `days_per_member` days, no other member holds any of them (a member who left aside), and each is in the proposal's week for them with the confirmation's instant. A change of holds takes the proposal's row `FOR SHARE` and a confirmation takes it `FOR UPDATE`, so neither passes the other's check unseen, whatever the commands do.
    - No uniqueness on a weekday across members: two members may hold one day, which is the clash (FQ55). A day is confirmed once by `schedule_assignments`' own key.
- Row level security on, no policy, as every table (T53). No delete of a proposal or a member row; truncation refused.

**Why holds are rows and not a column on the assignment.** `schedule_assignments` is written once and holds only confirmed days. A hold changes with every choice, so it lives in its own table and never touches an announced week.

## 3. The rules, `packages/domain/src/schedule/`

Pure functions first, with no clock and no database, so every rule is tested as a table.

- **`propose.ts` `proposedWeek(memberCount)`**: spec 05's table and examples. Members in the order they joined (FQ98's fixture order). Four to six: one day each, Monday to the first. Two: Monday and Thursday, Tuesday and Friday. Three: Monday and Thursday, Tuesday and Friday, Wednesday and Saturday. Refuses a count outside two to six.
- **`first-date.ts` `firstDate(weekday, confirmedAt, zone)`**: FQ79. The first date on that weekday whose 7 AM, resolved through `resolveCivilTime` in the club's zone, is at least 24 elapsed hours after `confirmedAt`. It compares instants, never dates; exactly 24 hours qualifies.
- **`view.ts` `viewFor(viewer, facts)`**: the six slots as one viewer sees them (the contract plan's sections 1.2 and 1.8). Its input is every member's holds and confirmations; its output carries a name only where the contract gives that viewer one:
    - `yours`, `taken` with `owner` and `first_date`, `available` with `held_by` only for a viewer still choosing, `clash` with `holders` (the viewer included) in the order members joined, `no_reveal` with nothing else;
    - `suggested` on the viewer's own proposed days only;
    - no `first_date` on a day whose owner's membership has ended (FQ102), which PR 3 produces and this function already answers.
- **`decide.ts` `judgeChoice`, `judgeConfirmation`** and **`everyoneConfirmed`** (one file, since the two rules share their checks): what a request gets from the facts, as the contract orders it: `NOT_ALLOWED` after the caller confirmed, for more days than `days_per_member`, for a day another member has confirmed; a confirmation only of exactly the days the caller holds, `days_per_member` of them, none held by anyone else (FQ55, FQ99).

Then the commands and the read, in SQL through the `postgres` driver, each in one READ COMMITTED transaction:

- **`open.ts` `openFirstDays(tx, clock, clubId)`**: for B1's activation. Under the club's row lock: makes the schedule version from the club's first local date (the local date of the clock's sample in the club's zone), the proposal at version 1 with spec 05's `days_per_member`, a member row for each active member and their proposed days as `suggested` and `held`. Refuses a club with an open proposal, with any schedule version, or with fewer than two or more than six active members.
- **`read.ts` `readSchedule(tx, viewer, clubId, now)`**: one snapshot. `current` is the version in force on the club's local date at `now`, with its assignments, absent while it has none. `proposal` is the open one when it includes the viewer's membership.
- As built, **`week.ts` `loadWeek`** is the one statement the read and the commands load a club's week with, and **`answerOf`** makes a viewer's proposal from `viewFor`; **`command.ts` `scheduleCommand`** holds section 4's steps for both commands; and the receipt is `packages/domain/src/idempotency/receipt.ts`.
- **`choose-days.ts` `chooseScheduleDays`** and **`confirm-days.ts` `confirmScheduleDays`**, in this order (section 4).

## 4. A command's steps

1. **The receipt** (T19), as `updateMe` reserves it: the same request under the same key gets the first answer back; another request under it gets `IDEMPOTENCY_CONFLICT`.
2. **The proposal's club**, read by the proposal's id with no lock, then **the club's row `FOR UPDATE`**. Every schedule command of a club takes this lock first, so a choice and a confirmation of the same day are in one order, and `schedule_versions_insert_guard` and `memberships_guard` take the same row.
3. **Who is asking** (T9, T14), through the authorization module's new `activeMember(tx, userId, clubId)` (`packages/domain/src/authorization/member.ts`), the one place the schedule's read and commands ask whether a caller is an active member of a club that isn't suspended. As built, Home's days (`daysByClub`) and the club list state the same three conditions in their own statements, and `tests/src/db/schedule-commands.test.ts` runs `activeMember` and `daysByClub` on the same rows. The command checks it once before it locks the club's row, so someone with nothing of the club never holds that row, and again under the lock. No membership, a suspended club (FQ80's default: nothing of the club), or a membership the proposal doesn't include: `NOT_FOUND`, the same answer as a proposal id that doesn't exist.
4. **`MEMBERSHIP_CHANGED`** with `current_id` when the proposal was replaced. Nothing in this PR replaces one; the branch is built and tested from rows the test writes, since the contract orders it here.
5. **`VERSION_CONFLICT`** with `current_version` when `expected_version` isn't the proposal's.
6. **The clock**, sampled now, after the lock (T1; T3's order).
7. **The rule** (section 3): `NOT_ALLOWED`, or the change.
    - A choice replaces the caller's `held` rows, keeps their `suggested` ones, and moves no `version` (T33).
    - A confirmation sets `confirmed_at` to the sample and writes one `schedule_assignments` row per day with `firstDate`. When every member the proposal includes who is still active has then confirmed, it sets `state` to `applied`, `closed_at`, and `version` plus 1.
8. **The answer**: the proposal as the caller now sees it, made by the same `viewFor` the read uses, stored in the receipt.

A choice of the days the caller already holds changes nothing and still answers. A confirmation by a member who has already confirmed is `NOT_ALLOWED` unless it is the replay of its own key.

## 5. The routes, `services/api/src/schedule/`

`getSchedule`, `chooseScheduleDays` and `confirmScheduleDays`, registered in `services/api/src/app.ts` `handlersOf`. Each serializer is an explicit field list (T55). Each body is parsed by the contract's own schema; a bad one gets `INVALID_REQUEST`. The bodies fit the limits the contract PR measured (`tests/src/privacy/body-limits.test.ts`).

## 6. Tests first

Written before the code they test, and seen to fail.

- **`propose.test.ts`**: spec 05's two examples and the pair, name for name; every count from two to six gives each member `days_per_member` days, each weekday at most once, never Sunday; a count of one or seven is refused.
- **`first-date.test.ts`** (FQ79's list, with fixed instants): exactly 24 hours opens on that date; one second short waits a week; a 23-hour day waits a week and a 25-hour day opens, in a zone whose clock changes in the 24 hours before a reveal day's 7 AM; handoff 6's fixture (confirmed at 9 AM in New York on Wednesday 4 November 2026: Thursday first opens on 12 November); a zone east of the date line and one west of it.
- **`view.test.ts`**: one case for each frame the contract's examples draw (`G04-one-day`, `G04-conflict`, `G04-conflict-three`, `G04-contested-other`, `G04-confirm-refused`, `G04-two-days-one-chosen`, `G04-confirmed-others`, `G04-confirmed-many`), and a property over every small world: no viewer gets a name on a `no_reveal` day; `holders` only goes to a holder; `held_by` never goes to a confirmed viewer and never names the viewer; `first_date` only on a confirmed day; the six weekdays, each once, Monday first.
- **`decide.test.ts`**: each refusal and each allowed change, FQ99's contested second day among them.
- **`tests/src/db/schedule-proposals.test.ts`**: the migration's guards, each shown to refuse (a second open proposal, a third held day in a one-day club, a change after confirming, a state going back, a deleted row).
- **`tests/src/db/schedule-commands.test.ts`**, on Postgres with the clock's test double:
    - open, choose and confirm for clubs of two, three, four and six; the last confirmation applies and moves `version`; no other confirmation or choice moves it;
    - the refusals in the contract's order, each from a state that would also earn a later one;
    - a replay returns the first answer byte for byte after the world has changed; another body under the same key conflicts;
    - two members confirming the same day at once: neither is confirmed, and both see the clash;
    - a choice and a confirmation of the same day at once, in both orders the lock can give;
    - `first_date` from the clock's sample taken after the lock.
- **`services/api/src/schedule/*.test.ts`**: each answer parses under the contract's schema; the serializers carry no field the contract doesn't name.
- **The privacy matrix** (`tests/src/privacy/rows.ts`, a new `schedule.ts` beside `account.ts`): the three routes leave `NONE`. For every role, each gets what section 1.8 of the contract's plan lists: a member choosing, a member who has confirmed, a member the proposal doesn't include, a former member, an invited person, a stranger, a blocked pair, an account being deleted, a suspended club. The judge reads the world's rows, not the route's code, and each of its branches is shown to fail. `rows.ts`' header loses the lines this PR pays.
- **The breakages**: each rule and each guard broken on purpose, one at a time, in a scratch worktree, with the test that catches it (the lane's method since slice 8). The run goes on `evidence` under `api/b2-schedule/<short SHA>/breakages/`.

## 7. Verify

- `python3 tools/ci/ci_steps.py` `guards`, `lint`, `typecheck`, `format`, `copy-lint`, `unit`, `openapi`, `db-bootstrap`, `db-tests` and `privacy`, on a Postgres made like `ci`'s; `journal_check.py --branch` and `--all`.
- The routes exercised by hand as each role, against a local server, before and after each confirmation.
- `ci` green on the last push. `ci`'s `swift` step shows the contract unchanged for the Swift client.

## 8. Review

Full depth, since the PR decides who sees whose name on which day (T55, T33): fresh reviewers by lens (privacy, the rules against the contract, the database and its races, the records), each finding put to a refuter, then a check of the fixes.

## 9. Records

`docs/JOURNAL.md` (block 1.2, the audit map's rows for T6, T9, T14, T19, T33, T49, T55 and Q-rows it touches, section 0's lines on the schedule, the log, table 4.1), `docs/PROGRESS.md`, `docs/LIMITATIONS.md` if a limit appears. Its first commit also records PR #66's second approval, its merge as `83d6221` and the two runs on `main`.

## 10. Risks and open points

- **Nothing calls `openFirstDays` until B1.** The risk is a rule that fits the tests and not B1's activation. The plan keeps its inputs to what activation has: the club's id, inside activation's own transaction and lock.
- **A clash can last for ever** (FQ55, noted by Claude Design). The slice builds it as decided and adds nothing to end it.
- **A confirmed day opens nothing until PR 2.** A club that confirms its days on `dev` between the two merges would see no dates. No club can start on `dev` before B1, so nobody can meet it.
- **No new question for the founder so far.** If the code meets a case the contract's plan doesn't settle, it is raised as a new FQ with a default (the next free number is FQ112), not decided silently.
