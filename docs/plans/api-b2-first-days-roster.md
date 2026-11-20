# Plan: `api/b2-first-days-roster`, a join or a leave in a club's first days

The third of B2's four schedule PRs (`docs/plans/api-b2-schedule.md`, section 0). Lane: api. It starts from `main` at `4bf2f8d` (PR #78, `leaveClub`), written before the code. It is pasted into the PR's Plan section.

## 0. What this PR builds, and what it leaves

Since B1, a roster that applies makes members (`packages/domain/src/clubs/apply-roster.ts` `applyIfReady`) and a leave ends a membership (`packages/domain/src/clubs/leave-club.ts` `leaveClub`). Neither touches the club's first days once they are open, so today:

- someone who joins a started club before any day is confirmed is left out of the first days, which FQ55 and FQ102 say include them;
- a leave leaves the first days naming someone who left: nothing revises them, nothing applies them when only confirmed members stay, and in a club of two the member who stays can confirm a day the paused club won't make (`docs/plans/api-b1-clubs.md`, section 5.5).

This PR builds the one rule that says what a change of the club's members does to its first days, and calls it from both commands, in their transaction, under the club's row:

| The first days | A join | A leave |
|---|---|---|
| Open, no day confirmed | A revision: the new member is included (FQ55, FQ102) | A revision without the leaver (FQ102); with one member left, the first days end with no successor |
| Open, a day confirmed | Nothing: the new member joins with no day (FQ100) | No revision. They apply when only confirmed members stay among those they include; they end with no successor when the one member left in the club hasn't confirmed, or when nobody they include is left (FQ102, FQ123) |
| Ended with no successor, none open | New first days, once the club has two members again (FQ102: "the join that restarts the club opens new first days") | Nothing |
| Applied | Nothing here: the week for the new roster is a membership change (PR 4) | Nothing here (PR 4) |

**One migration, `0013_first_days_revision.sql`,** which adds a column to two tables and replaces five guard functions (section 2). No row is dropped or rewritten (FQ39). `deploy-dev` applies it on the merge; `dev` holds no first days that anyone made through the app.

**No contract change.** The shapes and the refusals are `api/b2-contract`'s: a revision keeps the proposal's id and moves its `version`, so a member who read the earlier week gets `VERSION_CONFLICT` with `current_version` (`G04.error.revision`).

**Left to PR 4, `api/b2-membership-change`:** the week of a club whose first days have applied and whose members changed (a late joiner's day, FQ100; the week for the new size after a leave, FQ102; the restart of a paused club whose remaining member had confirmed). **Left to B6:** an account deletion, which ends memberships and must call the same rule (section 3's last line).

## 1. Sources

- Spec 04 (activation proposes the calendar; no instant first reveal), 05 (the table of days by club size; "unresolved conflicts are visible rather than silently swapping dates"; "Existing announced reveal times remain fixed").
- T1, T6, T14, T33, T49, T55; A01.
- FQ16 (the pause), FQ48, FQ54, FQ55, FQ56, FQ57, FQ61, FQ63, FQ79, FQ98, FQ100, FQ102 (the rule this PR builds, at its default), FQ114, FQ116, and two new ones, FQ123 and FQ124 (section 6).
- The contract: `packages/contracts/src/schemas/clubs.ts` (`ScheduleProposal`: "`version` moves only with `state` or a new revision of the proposed week"), `operations-clubs.ts` (the refusals' order), `docs/plans/api-b2-contract.md` sections 1.1 and 1.5.
- `docs/plans/api-b2-schedule.md`, "For `api/b2-first-days-roster` (PR 3)": the club's row and `everyoneConfirmed` on a leave; the supersession with one unconfirmed member; holds above the new number; FQ114's order.
- `db/migrations/0005_schedules_and_days.sql` (`schedule_versions_insert_guard`, FQ61), `0012_schedule_proposals.sql` (the guards this PR's migration replaces).

## 2. The migration, `db/migrations/0013_first_days_revision.sql`

**Why one is needed.** Where spec 05's table changes the days each member has (a club passing between three and four members), FQ102 has every member hold the days the revision proposes for them. Migration 0012 keeps `schedule_proposal_days.suggested` for good and refuses to delete a proposed day, so that no choice can erase what was proposed. A revision that proposes other days must therefore either weaken that guard or write its week beside the earlier one. This PR writes it beside: the earlier week's rows stay as they were, frozen, and nothing reads them.

- `app.schedule_proposals.week_revision smallint NOT NULL DEFAULT 1`: which proposed week the proposal is on. `app.schedule_proposal_days.week_revision smallint NOT NULL DEFAULT 1`: the week a row belongs to. The days' primary key gains it: `(proposal_id, interval_id, week_revision, weekday)`.
- `schedule_proposals_guard`: `week_revision` only rises, by one, with the next `version`, while the proposal stays open and nobody it includes has confirmed. `days_per_member` changes only together with it (0012's "nobody holds more than the new number" becomes "the new week has no row yet").
- `schedule_proposal_days_guard`: a row is inserted, changed or deleted only in the proposal's current week; `week_revision` joins the kept columns. So an earlier week's rows never change.
- `schedule_proposal_days_count`, `schedule_confirmation_guard`, `schedule_assignment_confirmed_guard`: each counts and reads the current week's rows only.

A revision that keeps `days_per_member` writes nothing but the new member's rows and the proposal's `version`: nobody is moved (FQ55, T6), so the week stays the one it was.

## 3. The rule, `packages/domain/src/schedule/roster-change.ts`

Pure, no clock, no database: `firstDaysAfter(facts)` says what a change of members does, from the club's active members in the order they joined (FQ98, FQ114), the open first-days proposal (its `days_per_member`, and each member it includes: active, confirmed, held days), and whether the club's last first days ended with no successor.

1. **No open first days.** `open` when the last first days ended with no successor and the club has two members or more; else `nothing`.
2. **Open, nobody has confirmed** (a leaver's confirmation counts: the day is in the week). Every active member is part of the first days.
    - Fewer than two active members: `end` (superseded, no successor).
    - `days_per_member` for the new count differs: `revise` with the whole week proposed again, `proposedWeek(count)` in the order the members joined, each member holding their proposed days.
    - It stays: `revise`, each new member given days nobody holds: the table's days for their place when they are free, else the first free days from Monday. Six weekdays always leave enough (FQ102).
3. **Open, a day is confirmed.** No revision, and a new member is not included (FQ100).
    - Nobody the first days include is still a member: `end`, and `open` again at once when the club has two members or more (FQ123).
    - Every included member still active has confirmed: `apply`.
    - The club has one member, who hasn't confirmed: `end`.
    - Else `nothing`, and no `version` moves (T33).

Then `settle.ts` `settleFirstDays(tx, at, clubId)`, in SQL, in the caller's transaction, which already holds the club's row: reads the facts in one statement, asks the rule, and writes what it says. `applyIfReady` calls it for a club that had started (a club that starts still calls `openFirstDays`); `leaveClub` calls it after the membership has ended. Both pass their own sample of the clock, taken after the lock (T1). An account deletion (B6) will call it the same way.

- **`revise`:** the new members' rows in `schedule_proposal_members`; for a new week, `week_revision` and `days_per_member` move and every active member's rows are written for it; `version` moves by one.
- **`apply`:** `state`, `closed_at`, `version` plus one, as the last confirmation does.
- **`end`:** `state = 'superseded'`, `closed_at`, `version` plus one, `replaced_by` null.
- **`open`:** `openFirstDays`, which gains the restart: with no open proposal and the last first days ended with no successor, it uses the club's schedule version again when no day was confirmed in it; otherwise it makes a new version from the later of the club's local date and the day after the last day already made (FQ61, FQ124). `confirmScheduleDays` then gives a day its first date no earlier than its version's start (`first-date.ts` `firstDate` gains that floor; for a club's first version it changes nothing).

`loadWeek` (`week.ts`) reads the current week's rows only.

## 4. Tests first

Written before the code they test and seen to fail; the journal says for each file whether that held.

- **`packages/domain/src/schedule/roster-change.test.ts`**: the table of section 0, case by case; every club size from two to six through a join and a leave with nobody confirmed (each active member ends with `days_per_member` days, no day proposed twice in a new week, a new member never given a held day); three to four and four to three propose the whole week again; a leave with a day confirmed applies, ends or does nothing by who is left; a late joiner is never included; the function throws for more than six.
- **`first-date.test.ts`**: the floor, on, before and after the 24 hours' date.
- **`tests/src/db/schedule-proposals.test.ts`** (the migration's guards, each shown to refuse): a row written into an earlier week or a later one; `week_revision` falling, jumping two, moving without `version`, moving after a confirmation, moving on an ended proposal; `days_per_member` changing without it; an earlier week's row changed or deleted; the count and the confirmation reading the current week alone.
- **`tests/src/db/first-days-roster.test.ts`**, through the commands as their routes run them (`createClub`, `proposeRoster`, `acceptInvitation`, `approveRoster`, `leaveClub`, `chooseScheduleDays`, `confirmScheduleDays`), with the checks kept for the commit:
    - a join before any confirmation: the member is in the proposal, sees it, chooses and confirms; `version` moved by one; the others' holds are as they were, a contest included; a request with the earlier version gets `VERSION_CONFLICT` and the new one;
    - three to four and back: everyone holds the newly proposed days, earlier choices set aside; the earlier week's rows are still there;
    - a join once a day is confirmed: not included, the first days answer the neutral not-found to them, no `version` moves;
    - a leave before any confirmation: the leaver's days free, `version` moved; in a club of two the first days end and the member who stays gets `NOT_ALLOWED` for a confirmation; the next join opens new first days for both;
    - a leave once a day is confirmed: applies when only confirmed members stay; nothing and no `version` when someone unconfirmed stays in a club of three; ends in a club of two when the one who stays hadn't confirmed; the leaver's confirmed day stays `taken` with no `first_date`;
    - the restart after a leaver's confirmed day: a new version after the last made day, and a first date no earlier;
    - a last confirmation held behind an uncommitted leave applies the first days once the leave commits, in either order the club's row can give.
- **The privacy matrix** (`tests/src/privacy/`): no route is added. Its world's leave step now revises or ends the first days; the judges read the world's rows, and each expectation that moves is listed in the PR.
- **The breakages**, at the PR's last head, on `evidence` under `api/b2-first-days-roster/<short SHA>/breakages/`.

## 5. Verify, review, records

- `python3 tools/ci/ci_steps.py` `guards`, `lint`, `typecheck`, `format`, `copy-lint`, `unit`, `openapi`, `db-bootstrap`, `db-tests`, `privacy`; `journal_check.py --branch`. `ci` green on the last push.
- Review at full depth: it decides who is in a proposal and whose name each member sees (T55, T33), and it changes guards. Fresh reviewers by lens (the rules against FQ102 and the contract; the database, its guards and races; privacy; the records), then a fresh check of the fixes.
- `docs/JOURNAL.md` (block 1.2, the audit map's rows for T6, T33, T49 and Q-rows it touches, the log, table 4.1; its first commit records PR #78's approval and merge as `4bf2f8d` and the runs on `main`), `docs/PROGRESS.md`, `docs/QUESTIONS.md` (FQ123, FQ124; a line under FQ102), `docs/plans/api-b1-clubs.md` section 5.5 (paid).

## 6. Questions for the founder, with their defaults

- **FQ123. The first days when nobody they include is left.** FQ102 settles a leave that leaves confirmed members, or one unconfirmed member. Members who joined after the first confirmed day aren't part of the first days (FQ100); when everyone who was has left, the proposal has nobody to confirm it and those who remain have no day. Default: the first days end with no successor, and new first days open at once for the members who remain when they are two or more; with one, at the next join, as FQ102 has it.
- **FQ124. When a restarted club's new first days start, if a member who left had confirmed a day.** That day's dates are made four weeks ahead (FQ115) and stay as they are (FQ63), and a new week starts only after every day already made (FQ61). Default: the new first days' week starts the day after the last day already made, or today if later, so a day confirmed in them first opens no earlier; with no confirmed day, the club's first week is used again and nothing waits.
- **Which days a new member is proposed in a revision that moves nobody** is FQ102's "the days the revision proposes for them, which nobody holds", read as: spec 05's days for their place when free, else the first free days from Monday. Noted under FQ102, not a new question.

## 7. Risks

- **A guard replaced.** Five functions of 0012 are rewritten in 0013. Each of 0012's refusals is run again against 0013 by `schedule-proposals.test.ts`, which already holds them, and each new line has its own breakage.
- **The restart's second version is rare** (a member confirms, leaves, the other hadn't confirmed, and someone joins later) and is the only path that makes a version outside a club's start before PR 4. It is tested through the commands and the generation's own rule (`daysToMake`).
- **The size of the first days after a late join.** A club of three with a day confirmed that gains a fourth member keeps two days each among the three until the first days apply (FQ100, FQ102); PR 4 proposes the week for four.
