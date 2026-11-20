# api/b2-membership-change: the week of a club whose members changed

B2 · api · the schedule's fourth slice, in two PRs. The first days are built (PRs #68, #80): a club's first week, and what a join or a leave does to it while it is open. This slice builds what follows them: the **membership change**, the proposed week every active member confirms when the club's members change after its first days have applied (spec 05; FQ49, FQ56, FQ61, FQ62, FQ81, FQ100, FQ101, FQ102).

## 0. What each PR builds

**PR A, `api/b2-membership-change` (this branch): the change is proposed, read and confirmed.**

- The rule for which week a change proposes, and when one is proposed, replaced or dropped.
- Its rows, written by every command that starts or ends a membership and by the first days when they apply.
- Its read (`getSchedule`: `ScheduleProposal` with `reason: membership_change`, `announced`) and its confirmation (`confirmScheduleDays`), which moves no `version` and changes no answer for anyone else (FQ81, T33). `chooseScheduleDays` already answers `NOT_ALLOWED` for it.
- The days' generation makes no day from an open change's start on (FQ127), so the change still has a start it can take.
- Migration `0014_membership_change.sql`: the guards behind the commands. No row is dropped or rewritten (FQ39).

**PR B, `api/b2-change-start`: the change's start.** At the start, in the club's zone: the change applies if every member confirmed (a new week in force, its days made with their first dates, FQ101), and otherwise a new change from a week later replaces it and the current week's days are made (FQ49). The worker's generation job does it for every club, under the club's row. Until PR B is merged a change stays open past its start and no day is made from it on; no club can reach that on `dev` before B merges, and PR A's description says so.

**No contract change is planned.** The shapes are `api/b2-contract`'s. Where the build meets a description that is false, it is listed in the PR for a contract PR, as #80 did.

## 1. Sources

- Spec 05: the table of days by club size; "Changing membership from three to four requires the one day cadence next week; four to three requires two. Existing announced reveal times remain fixed. The schedule service first finds a future boundary with no submitted occurrence affected, then requests confirmation. Transition weeks can temporarily differ from the steady table to preserve promises. Do not silently move submitted drops."
- T1, T4, T6, T14, T33, T49, T55; A01.
- The contract: `ScheduleProposal`, `Schedule`, `ScheduleSlot`, `confirmScheduleDays`, `chooseScheduleDays` (`packages/contracts/src/schemas/clubs.ts`, `operations-clubs.ts`), and the fixture `ktChangeProposal` (`fixtures/examples-clubs.ts`): Kitchen table's change from Monday 7 December, seen from Friday 6 November.
- `docs/QUESTIONS.md`: FQ16, FQ49, FQ56, FQ61, FQ62, FQ63, FQ81, FQ98, FQ100, FQ101, FQ102, FQ115, FQ116.
- `docs/LIMITATIONS.md`, 2026-11-19: generation knows nothing of a change waiting to start.

## 2. The rules

### 2.1 When a change is proposed (`packages/domain/src/schedule/change.ts` `changeAfter`, pure)

Asked after every membership that starts or ends in a club that has started, and when the first days apply. Facts: the club's active members in join order; whether first days are open; the week in force's days (weekday and star, with whether the star is still a member); the open change, if any, with the members it includes.

| The club | What follows |
|---|---|
| First days are open | Nothing here: `firstDaysAfter` decides (PR #80) |
| No week was ever confirmed (every proposal ended with no successor) | Nothing here: new first days (FQ102, FQ123) |
| Fewer than two active members | An open change ends with no successor; nothing is proposed (FQ16: the club is paused) |
| The active members are exactly the stars of the week in force, each with the table's number of days | An open change ends with no successor (the roster is back where the week is); nothing is proposed |
| An open change already includes exactly the active members | Nothing: the open change stands, with its confirmations |
| Otherwise | A change is proposed for the active members. An open change is replaced by it (`replaced_by`; its id then answers `MEMBERSHIP_CHANGED` with `current_id`, the club's open change, however many replacements on; once none is open it answers as any ended proposal does) |

A change that is replaced or ended loses its confirmations: the new one is confirmed by everyone again (FQ126, new).

"The week in force" here is the latest week of the club, whether or not it has started (a restarted club's new week, FQ124, counts from the day its first days applied). A club has one only once a proposal of its first days has applied: until then `week` is null.

### 2.2 Which week it proposes (`changeWeek`, pure; FQ125, new)

For `n` active members, `per` is spec 05's days each (two for two or three members, one for four to six).

- **Where `per` is what the week in force gives:** every member who stays keeps their days. A member who left frees theirs. A new member is proposed days nobody keeps: the table's days for their place in join order when they are free, else the first free days from Monday. This is the first days' rule for a revision (`roster-change.ts`), and it moves nobody.
- **Where `per` changes (between three and four members):** the table's whole week for `n` members in join order (`proposedWeek`), as the first days' revision does (FQ102). Members move, which is why everyone confirms.
- A member who stays but holds fewer days than `per` in the week in force (a late joiner of FQ100 has none; a restarted club's member) is treated as a new member for the days they lack.

One week, no choosing, no contest (FQ56; G04-change). The other reading for the second case, keeping each member's day and adding or dropping one, is in FQ125.

### 2.3 Its start (`changeStart`, pure; FQ61, FQ115, FQ127)

The first Monday after every day already made for the club, and after today: the Monday after the generation window's end seen from the club's local date at the proposal (`windowEnd(today) + 1`), or the Monday after the last day made, whichever is later. Seen from Friday 6 November 2026 that is Monday 7 December, the fixture's `changeFrom`.

A change that replaces an open one keeps the open one's start while that is still ahead and no day was made on or after it: no day is made from it on while a change is open (2.5), so it is still the first free week. Otherwise it takes a new start by the rule above. Its week is worked out again from the week in force, not from the change it replaces, so a new member's proposed day can differ between the two.

### 2.4 Reading and confirming

- **`getSchedule`** (`week.ts` `answerOf`, `view.ts`): for a member the change includes, `proposal` is the change: `slots` are the member's own days (`yours`, `suggested`) and every other day `available`, with `held_by` naming the member the change proposes it for, for every caller, whoever has confirmed (FQ81); `my_days`; `my_state`; `announced`, the club's days not yet closed in date order, unless the caller has no day in the club's latest week (the new member; G04-change). `current` is the week in force as before. The change includes every active member, so nobody gets "current alone" from it.
- **`confirmScheduleDays`** (`confirm-days.ts`): the body's weekdays must be the days the change proposes for the caller (`NOT_ALLOWED` otherwise, as the request says). It writes the member's `confirmed_at` from the clock's sample taken under the club's row (T1) and nothing else: `state` and `version` stay, so the answer to every member is the same whoever has confirmed (FQ81, T33). A second confirmation is `NOT_ALLOWED` (as in the first days). Idempotent by its key (T19), through `scheduleCommand`.
- Refusals in the contract's order: `NOT_FOUND` (not a member, or not included), `MEMBERSHIP_CHANGED` (replaced; `current_id`), `VERSION_CONFLICT`, `NOT_ALLOWED`.

### 2.5 Generation (`generate.ts`; FQ127, new)

While a change is open, no day is owed on or after its start. The days before it are made as before, so the announced days are exactly those before the start, and the start stays the first free week whatever the date. What happens at the start is PR B's.

## 3. The writes (`packages/domain/src/schedule/settle-change.ts` `settleChange(tx, at, clubId)`)

In the caller's transaction, under the club's row, with the caller's clock sample (T1), like `settleFirstDays`:

- Called by `applyIfReady` (`clubs/apply-roster.ts`) and `leaveClub` after `settleFirstDays` (which covers a leave that applies the first days), and by the last confirmation of the first days (`confirm-days.ts`).
- Reads the facts in one statement, asks `changeAfter`, and writes: the ended change (`superseded`, `closed_at`, next `version`, `replaced_by` when one follows), and the new change: its row (`reason` `membership_change`, `effective_from`, `days_per_member`, no week yet), a row for each active member, and their proposed days, each `suggested` and `held`.
- Writes nothing when the rule says nothing (T33).
- B6's account deletion must call it as a leave does (noted with `settleFirstDays`' same debt).

## 4. The migration, `0014_membership_change.sql`

Guards only, replacing two functions of 0013 with the same rules plus a change's own:

- `app.schedule_proposal_days_guard` (replaced): a change's days are inserted only, never changed or deleted, each proposed and held for one member; no member's choice changes them (a change has no choosing). That they are written with the proposal, one weekday for one member, holds under the club's row, which every writer takes (section 3), not by the guard alone.
- `app.schedule_proposals_guard` (replaced): a change never ends `applied` until PR B, which replaces this guard with the start's rule and must remake `schedule_proposals_keep` with it; it can only end `superseded`, and its week is never proposed again.
- `app.schedule_change_start_guard` (new, before insert): a change starts open at version 1 with no week of its own, from a Monday, and only in a club whose first days have applied.
- A club has at most one open proposal (already so: `schedule_proposals_one_open`). A confirmation's own rules (an active member, `days_per_member` days held alone) are 0012's and apply to a change unchanged.

Each replaced rule keeps its tests from 0012 and 0013, which still pass.

## 5. Tests first

- **`first-days-roster.test.ts`**: the second restart PR #82's review found untested (new first days with a week of their own, nobody confirms in it, the club pauses and restarts: that week is used again).
- **`change.test.ts`** (pure): every row of 2.1's table; 2.2 for each size from two to six, a join and a leave at each, three to four and four to three; a late joiner with no day; two who join at once; 2.3 from the fixture's Friday (7 December), on a Monday, with a day made beyond the window, and for a replacement.
- **`generate.test.ts`**: no day from an open change's start; the days before it as before.
- **`tests/src/db/membership-change.test.ts`** (through the commands as the routes run them): the first days apply with a late joiner and a change is proposed in the same transaction; a join and a leave in a club with a week in force; a join then a leave back to the week (dropped); a join while a change is open (replaced, `MEMBERSHIP_CHANGED` for the old id); the club paused; the read for a member who stays, for the new member, before and after a confirmation by another member (identical answers, FQ81); the confirmation's refusals in order; a retry of a confirmation (T19); two confirmations at once on two connections.
- **`schedule-proposals.test.ts`**: migration 0014's guards, each failing first.
- **The privacy matrix** (`tests/src/privacy/`): the world gets a club with an open change; `getSchedule` and `confirmScheduleDays` are judged for each role (a member who stays, the new member, a former member, a member of another club, a stranger), and a judge of the change's rows (`weekChangeProblems`: the whole proposed week by 2.2's rule restated, the start by 2.3's) runs after every join and leave, as `firstDaysProblems` does.

## 6. Verify, review, records

- The full local run (`format`, `lint`, `typecheck`, `copy-lint`, `unit`, `openapi`, `guards`, `db-tests` on a fresh database, `privacy`), then `ci`.
- Deliberate breakages at the PR's last head, on `evidence`.
- Full-depth review by fresh reviewers (rules, database, privacy, records): this touches the database, time and the matrix.
- Journal, `docs/QUESTIONS.md` (FQ125 to FQ127), `docs/LIMITATIONS.md` (the 2026-11-19 row answered), `docs/PROGRESS.md`.

## 7. Risks and open points

- **FQ125, FQ126, FQ127 are product rules the sources leave open.** Each is built at the default above, which changes nothing stored before a change applies, and is raised with the PR.
- **A late joiner waits four to five weeks for a day** (FQ61's default with four weeks made ahead): the change starts after every day already made. This is FQ61's stated reading, not new, and is said again with the PR.
- **Between PR A and PR B a change can't apply.** Nobody can meet it on `dev` (no club made through the app; the worker there is stopped).
- **A club at the edge of the table.** A seventh member can't join (A01), so `changeWeek` never sees more than six.
