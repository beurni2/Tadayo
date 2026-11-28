# Stage B2, the calendar: the ios lane's plan

Branch `ios/b2-plan`, from `main` at `96b1fa9`. Written on 28 November 2026, after the api lane's B2 schedule and Home routes reached `main` and `dev` (#68 the first days, #70 generation and `listMembers`, #80 a join or a leave in the first days, #84 the membership change, #87 a new member's free day, #103 `getHome`) and after B1's ios PRs (#95 to #155; the removal, #158, waits for the founder).

## 1. What is asked

`docs/MILESTONES.md`, B2, the ios lane:

- G04 (`G04-one-day`, `G04-two-days`, the conflict state).
- H01's waiting states (`H01-waiting`, `H01-after-close`, `H01-sunday`, awaiting activation, the club paused), with countdowns from `server_now` and a VoiceOver label giving the target date.
- F01 (`F01-friends`, `F01-long-names`, `F01-friends-xl`) with the next dates; the F02 header with the exact date; C01 (`C01-picker`).
- Spikes S1, S2 and S4, once B1 and B2 are on `dev`, before Gate A. "The B2 plan schedules them" (section 6).

`design/reference/INVENTORY.md` stages 56 states at B2: 38 received, 16 missing, 2 built from spec. B1 built 8 of them ahead of their stage, because the club list already answered them (`G06-switcher-status`, `G06-switcher-unavailable`, `H01-awaiting-activation`, `H01-unavailable`, `H01-loading`, `H01-error`, `F01-unavailable`, `M01-unavailable`). Five describe a membership change everyone confirms, which the founder's answers to FQ125 to FQ127 replaced, so the server never reaches them (section 4, PR 4). B2 builds the other 43, the three new states this plan names (`H01-no-days`, `G04-confirm-failed`, `C01-picker-first-days`), and `H01-quiet`, a B5 state its routes already answer (section 4, PR 3).

Gate A, for which the founder checks (MILESTONES): two accounts form a club through an invitation link, approve the same roster, confirm their days and see the same next dates; a third person needs everyone's approval; Home counts down to the next person's exact date; the dev clock moves a day open and shut with workers stopped; and the reports of spikes S1, S2 and S4.

The rules B2 is held to:

- spec 04 (on activation, the calendar is proposed and each member confirms), 05 (fixed weekdays, one or two days by club size, conflicts visible and never swapped, the club's zone, full dates where ambiguity is possible, targets by occurrence id), 06 (a day's instants), 08 (Home), 09 (Friends and the upcoming day), 29 (every screen's loading and recoverable errors), 32; book p10, p11, p12, p13, p29, p30 and p41;
- T1 and T5 (server time; countdowns from `server_now`; the device decides nothing), T2 (both civil times resolved in the club's zone), T4 (no silent retargeting), T6 (no Sunday day; a contest shown, never swapped), T9 and T14 (a neutral not-found), T15 and T33 (no counts, nobody chased: nothing says who hasn't confirmed beyond what the contract gives), T19 (one key per action, reused on its retries), T41 to T43 (copy, exact dates, names), T45 and T46 (native first, no design of our own), T49 (no invented date), T52 (nothing of an answer in a log);
- FQ16 and FQ50 (paused, and a remaining member's announced day), FQ20, FQ46 and FQ48 (who sees names on a day), FQ55 and FQ99 (a contested day, and confirming), FQ57, FQ63 (a leaver's held days), FQ79 and FQ130 (first dates), FQ80 (a suspended club), FQ83 (local times), FQ100 to FQ102, FQ124 to FQ127, FQ131, FQ134.

## 2. What B1 left

- **`RootModel`** (`packages/swift/TadayoCore/Sources/TadayoCore/RootModel.swift`) reads Home for a club that hasn't started (`getClub`, then its open revision), shows `H01-unavailable` for a suspended one with no call, and `.notInThisBuild` for an active or paused one (`loadHome(relisting:)`). Friends and Memories show the same form for an active or paused club (`apps/ios/Tadayo/Tabs/TabLayout.swift`, `tabs.notInThisBuild`).
- **`ClubService.schedule(of:)`** reads `getSchedule`'s `current` alone (`ClubWeek`), for the weekdays on `G05-members`. `Member` already carries `nextDay` and `nextUp` from `listMembers`.
- **Club details** draws its Schedule row, doing nothing until B2 (FQ85; `apps/ios/Tadayo/Club/ClubDetailsScreen.swift`).
- **`TadayoCore`'s time pieces:** `ServerClock`, `Countdown` (whole minutes, a part minute counted up, one refresh a minute), `LocalOpening`, `DateLabels`, `LocalDate`.
- **`TadayoDesign`'s components:** `DayHeader`, `WeekdayPlaque`, `PersonRow`, `TargetBlock`, `SelectedClubHeader`, `PrivateDraftsEntry`, `RosterRow`, the buttons, `InlineError`; the Lab's fixtures hold the book's week (`apps/ios/Tadayo/Lab/FixtureCast.swift`).

## 3. The API B2 calls

All on `dev` since the api lane's PRs above. Each goes through `TadayoAPIClient`, which keeps the generated client internal and gives `TadayoCore` types.

| Call | Operation | Screens |
|---|---|---|
| `GET /v1/clubs/{club_id}/home` | `getHome`: `server_now`, `club`, `club_today` and one mode, taken in the contract's order: `unavailable`, `awaiting_activation`, `day` (the open day's frame and first page, `next`, `recent_days`), `waiting` (`next`, `recent_days`), `paused` (`recent_days`), `no_days`; the neutral not-found for anyone without an active membership | H01 |
| `GET /v1/clubs/{club_id}/schedule` | `getSchedule`, whole: `current` and the open `proposal` that includes the caller (`ScheduleProposal`: `reason` `activation` or `membership_change`, `effective_from`, `days_per_member`, six `slots` each `yours`, `taken` with `owner` and maybe `first_date`, `available` with maybe `held_by`, `clash` with `holders`, or `no_reveal`, and `suggested`; `my_days`, `my_state`, `state`) | G04, G05-schedule, Home's `no_days` |
| `PUT /v1/schedule-proposals/{proposal_id}/choice` | `chooseScheduleDays`: `expected_version` and the weekdays the caller holds from now on; refused in the contract's order with `NOT_FOUND`, `MEMBERSHIP_CHANGED`, `VERSION_CONFLICT`, `NOT_ALLOWED` and `IDEMPOTENCY_CONFLICT` | G04 |
| `POST /v1/schedule-proposals/{proposal_id}/confirmation` | `confirmScheduleDays`: `expected_version` and exactly the days the caller holds, `days_per_member` of them, none held by anyone else (FQ55, FQ99); the same refusals | G04 |
| `GET /v1/clubs/{club_id}/members` | `listMembers`, as B1 reads it: each member's `next_day` and who is `next_up` | F01, C01, G05-local-times |

`APIFailure` carries nothing of an answer (T52), so `MEMBERSHIP_CHANGED`'s `current_id` and `VERSION_CONFLICT`'s `current_version` are never read: the app reads the schedule again, as `InvitationModel.accept` reads the roster again after a `VERSION_CONFLICT`.

Not in B2: `getOccurrence` and the feed's paging (B5), drops, reservations and uploads (B4, apart from the spikes), the media route (B3).

**On `dev`, days are made only by the worker, and `dev`'s worker stays stopped** (`packages/domain/src/schedule/make-days.ts` `makeDays` is called by the worker alone). Until the founder says yes to starting it, every active club on `dev` answers `no_days`, and every member's `next_day` is absent, even after everyone has confirmed: true, and never an invented date (FQ134, T49). B2's device check and the spikes need it running (sections 5 and 6); starting it is the founder's call, through the api lane's `ops` workflow.

## 4. The PRs, in order

Each is one branch from `main`, built tests first, reviewed by a fresh subagent and approved by the founder in this thread. Every state is snapshotted in light, dark and the largest text size; a state with no frame is "built from spec" in the inventory until handoff 12 draws it. Every screen that loads has the loading form and the failure form with Retry (spec 29), in the forms B1 built (`H01-loading`, `H01-error`, handoff 8's `G05-club-details-failed`).

1. **`ios/b2-plan` (this branch):** this plan; design handoff 12's brief (`docs/design/handoff-12/handoff-12-brief.md`, and `.txt` to paste); the inventory's rows for the states the brief asks for that have none, and notes on the five rows FQ125 to FQ127 replaced and on `G04-change`. Documents only, though the inventory's change starts `ios`.

2. **`ios/b2-calendar-client`:** `TadayoCore`'s types and `TadayoAPIClient`'s calls, no screen.
    - `Home`, with its six modes. The open day's frame (`occurrence`, `viewer.is_star`, `viewer.joined_later`, `add_target`) is mapped; its page only as whether it holds any card, since the feed is B5's and nothing of a drop is kept before then. `DayLink` for `recent_days`, without its cover (the media route is B3's).
    - `Schedule` whole: `ScheduleProposal`, `ScheduleSlot`, the five slot states. `ClubWeek` becomes the `current` half of it, so `G05-members` reads as it does.
    - `chooseScheduleDays` and `confirmScheduleDays`, each with a key made when its action starts.
    - Tests first, on Linux (`swift test --package-path packages/swift/TadayoAPI` and `TadayoCore`), with the existing `CannedTransport`: every example the contract gives these four operations, each refusal mapped to its `APIFailure`, an undocumented answer `unreadable`, the key in the header and the same key on a retry (T19), the neutral not-found kept neutral (T14), and no field read past what the app shows (T55's other side).

3. **`ios/b2-home`:** Home for an active or paused club, from `getHome`, replacing `.notInThisBuild`.
    - **`waiting`:** the one waiting card (handoff 6's `waitingHero` tokens on 2.1's geometry, as the inventory's Known differences settle it), with "Next up", the occasion ("Nina's Saturday"), the exact date, the opening in the club's zone and the countdown; `H01-travelling` and `H01-travelling-dateline` when the phone's zone isn't the club's (local opening first, each line dated when the dates differ); `H01-sunday` when `club_today` is a Sunday. Add for {name} and See captions keep their targets (`next`'s id) and do nothing until B4 and PR 6 (FQ85). `H01-after-close`'s past day card (handoff 6's `pastDayCard`) for the newest of `recent_days`, "{occasion} is in Memories" with its date and Revisit, which does nothing until the past day's screen exists (B5); a day nothing readable was added to has no card, since `recent_days` lists only days with something the caller can read. 2.1's tiles under "Earlier days" and "This week" need covers through the media route and open past days, so they wait for B3 and B5, and handoff 12 asks which past days a waiting Home shows.
    - **`day`:** the routes answer it now, so it can't be left blank. An empty page is `H01-quiet` (2.1, a B5 row built here), with "Next:" from `next`; for the star, the header of 2.1's `H01-your-day` over the same quiet body, built from spec. A page with cards shows the day's header and "This version of Tadayo can't show this day yet." (FQ90's form) until B5 builds the feed: nothing in B2 commits a drop through the app, and the spikes' drops come after (section 6).
    - **`paused`:** `H01-paused`. A paused club's `waiting` or `day` (FQ50) is `H01-paused-own-day`, in the waiting and day forms, built from spec.
    - **`no_days`:** Home reads the schedule too. A proposal that includes the caller with `my_state` `choosing` gives `H01-confirm-days` with "Choose your day" or "Choose your days" (`days_per_member`), which opens G04. Anything else gives `H01-no-days`, new: the same title and line, which handoff 6 made true ("Your club's next scheduled day will appear here."), with no button (FQ134's default).
    - **`awaiting_activation` and `unavailable`:** as B1 built them; a club the list calls active whose Home says otherwise sends the list to be read again, B1's one chain.
    - **Lost access:** a not-found sends the list to be read again (B1's chain). If the club is no longer listed, Home shows `H01-access-lost` ("This club is no longer available." over "Choose a club to continue.", which opens the switcher), and Friends and Memories take its form, rather than putting another club in its place unannounced (handoffs 5 and 6, `deniedHeader`); with no club left, the no-club root. This PR builds the lost form on all three tabs (`F01-access-lost` and `M01-access-lost` in `H01-access-lost`'s, as handoff 6 says).
    - **Time (T1, T5):** the countdown runs from `server_now` through `ServerClock`, refreshed once a minute; when it reaches the next `reveal_at`, or an open day's `close_at`, Home asks the server again rather than deciding anything, and again when the app returns to the foreground. VoiceOver reads the waiting card as one group with its target date (`handoff6.home.waiting.group.vo`: "{occasion}. Opens {fullDateTime}, {clubZoneName}.", and the travelling form).
    - **Tests first:** each mode from a scripted service; `no_days` with each proposal state; a not-found, the list read again, and the lost club; an answer that lands after another club was chosen or Leave sign-in is dropped (the root's `epoch` and `homeReads`); the next read's instant, with a fake clock, at a reveal, a close and a minute's change, both sides of a clock change in the club's zone; the travelling labels when the dates match and when they don't; no date shown when none is sent (T49).
    - **States:** `H01-waiting`, `H01-travelling`, `H01-travelling-dateline`, `H01-after-close`, `H01-sunday`, `H01-paused`, `H01-paused-own-day`, `H01-confirm-days`, `H01-no-days`, `H01-access-lost`, `F01-access-lost`, `M01-access-lost`, `H01-quiet`, and a waiting card with a wait of a day or more ("1d 5h 59m").

4. **`ios/b2-choose-days`:** G04, for the first days and for a new member's days.
    - **Opened from** `H01-confirm-days` and from the club's week (`G05-schedule-choose-own`, PR 5). Back and Done return to where it was opened (handoff 6's WM-04).
    - **Each choice is a command** (`chooseScheduleDays`), since a choice holds a day and can make it contested at once (FQ48, FQ55): a tap sends the weekdays the person now holds and shows the server's answer, with one key per tap reused on its retry (T19), and one command at a time. Confirm names exactly the days held, and is available only with `days_per_member` of them and none contested (FQ55, FQ99).
    - **Refusals:** no answer keeps what was chosen, with the failure line and the same key on Retry (`G04-confirm-failed`); `VERSION_CONFLICT`, `MEMBERSHIP_CHANGED` and `NOT_FOUND` read the schedule again; `NOT_ALLOWED` reads it again and says why from what it shows: the day is now someone's (`G04-day-taken`, handoff 3's `G04.error.chooseTaken` and `confirmTaken`), or it became contested (`G04-confirm-refused`, said once to VoiceOver). A proposal no longer open returns to where the picker was opened, and Home reads again.
    - **After confirming:** the read-only week (`G04-confirmed`, `G04-confirmed-many`, `G04-confirmed-others`), each confirmed day with its first date as the server sends it (FQ79, FQ130; never one the app works out, T49); reopened, `G04-own-confirmed`.
    - **A new member's days** (FQ125 to FQ127, FQ131): the same picker, the club's days taken by their members, the free days to choose, from a `membership_change` proposal. Handoff 6's `G04-change` draws the week everyone confirmed before the founder's answers, so this state is built from spec in the picker's form, keeping its name, and handoff 12 asks for its redraw. Since nobody already in the week is asked anything (FQ126), `G04-change-member`, `G04-transition-week`, `G04-change-confirmed-review`, `G05-schedule-review` and `G05-schedule-review-confirmed` are never reached and aren't built; handoff 12 asks the design to retire them, and their rows say so.
    - **Nothing counts anyone:** a name on a day only where the contract gives one (`owner`, `holders` to those who hold it, `held_by` to a member still choosing, FQ46 and FQ48), and nothing that says who hasn't confirmed or how many have (T15, T33).
    - **Tests first:** the model over the contract's examples (`conflict_three` and the others); every refusal and what follows; the key reused on a retry and new for a new tap; no second command while one is out; an answer after the picker was left changes nothing; Confirm's availability for one and two days, with a contested day.
    - **States:** `G04-one-day`, `G04-two-days`, `G04-two-days-one-chosen`, `G04-conflict`, `G04-conflict-three`, `G04-contested-other`, `G04-confirm-refused`, `G04-confirmed`, `G04-confirmed-many`, `G04-confirmed-others`, `G04-own-confirmed`, `G04-day-taken`, `G04-change` (the new member's pick), `G04-confirm-failed`.

5. **`ios/b2-club-week`:** the club's week and local times.
    - Club details' Schedule row opens `G05-schedule`: each member's weekday or two from `current`, the hours in the club's zone, and the Sunday row; in the first days, the person's own "Choose your day" row while they choose (`G05-schedule-choose-own`), which opens G04; "New days are paused." for a paused club.
    - View local times opens the sheet (`G05-local-times` while travelling, with an open day first; `G05-local-times-same-zone`), each next date from `listMembers` (FQ83).
    - `G05-club-details-paused`: "1 member", Invite someone, the Private drafts card.
    - **Tests first:** the week's rows from `current` with and without a proposal, the Sunday row, paused; the local-times blocks in both zones and on both sides of a date line.
    - **States:** `G05-schedule`, `G05-schedule-choose-own`, `G05-local-times`, `G05-local-times-same-zone`, `G05-club-details-paused`.

6. **`ios/b2-friends`:** Friends with the next dates, the upcoming day's header, and Friends' and Memories' other B2 states.
    - `F01-friends` from `listMembers`: the stable order (`position`), each row's avatar, name, "· You" on the person's own, the next date in the phone's form and "Next up" from `next_up`; a member with no next day by name only, and nothing that says why (T15, T49). See schedule opens `G05-schedule`. `F01-friends-travelling` and `F01-friends-first-days`.
    - A row with a next day opens F02 for that occurrence: the header with its exact date ("For Debby", the full date, the opening in the club's zone), Add a drop (nothing until B4, FQ85) and the line that captions show now and photos on the day. The captions under it come with B4 and B5 (`getOccurrence`), so B2 shows no list and says nothing about one. See captions on Home opens the same screen.
    - `F01-friends-unconfirmed`, `F01-not-started`, `F01-paused`; `M01-not-started`, `M01-first-days`, `M01-paused`.
    - **Tests first:** the rows' order and lines from the contract's `sunday_people` and `first_days` examples; a member with no day; the row's target is the occurrence's id (T4).
    - **States:** `F01-friends`, `F01-friends-dark`, `F01-friends-xl`, `F01-long-names`, `F01-friends-travelling`, `F01-friends-first-days`, `F01-friends-unconfirmed`, `F01-not-started`, `F01-paused`, `M01-not-started`, `M01-first-days`, `M01-paused`, and F02's header in its own snapshot (F02's rows stay B4's).

7. **`ios/b2-add-picker`:** + Add in the selected club's header.
    - `C01-picker`: Private draft and Open my drafts, the club, then its members with their next dates; "You" on the person's own row; a member with no day by name and photograph and not choosable (handoff 6's X-15). A choice keeps its target (the occurrence's id, T4) and does nothing more until B4 builds the composer (FQ85).
    - `C01-drafts-only` while no member has a day (a club that hasn't started, the first days before anyone confirms, paused, `no_days`).
    - **Tests first:** which form + Add opens in each club state; the members' order and dates; a member with no day isn't choosable.
    - **States:** `C01-picker`, `C01-picker-first-days`, `C01-drafts-only`.

**Privacy checks for each PR's review** (`docs/GITHUB.md`, step 3): nothing names who hasn't confirmed or counts anyone (T15, T33); a name on a day only where the contract gives that viewer one (FQ46, FQ48); a lost or suspended club shows nothing of itself (T9, T14); no date the server didn't send (T49); nothing of an answer in a log (T52); in the `day` mode, no field of a drop is mapped or kept before B5 (T10's other side).

## 5. B2's device checks for the founder

Once PRs 3 and 4 are on `main`, a TestFlight build, uploaded only on the founder's yes, with exact steps asked once:

- with the dev worker running (the founder's yes, through the api lane): two accounts, the founder's and a second, form a club through an invitation link, approve the same roster, each confirms days, and both phones show the same next dates (Gate A's first check, rehearsed);
- Home's countdown to the next person's exact date, and VoiceOver reading the target date;
- the phone's zone changed in Settings, to see the travelling forms;
- a contested day, chosen on both phones at once.

## 6. Spikes S1, S2 and S4

They need the founder's account in an active club on `dev` with the founder's day in its calendar, which only the app can do (ADR-021: no script or seed touches the founder's account). So each runs after section 5's club exists, and before Gate A and before B3 and B4 build on them (ADR-024). Each has a one-page report in `docs/spikes/`, merges only if it's clean enough to keep, and reaches the founder's iPhone through TestFlight on the founder's yes.

| Order | Spike | Branch | What the app builds | Needs first |
|---|---|---|---|---|
| 1 | **S1, the share extension** | `ios/b2-spike-share` | `TadayoShare`'s compact composer, showing the club, the person and the exact date from a roster cache the app writes to the app group (the selected club's `listMembers` answer: names, next days, no token), timed from the share sheet to the date shown; the photo's upload through a background `URLSession` to its signed upload URL (#109); the commit (`createDrop`, #116), and the receipt only after it (T20) | section 5's club with the founder's day made (the dev worker running) |
| 2 | **S2, the photo pipeline** | `ios/b2-spike-photo`, from S1's branch or from `main` once S1 merges | the device's conversion (ADR-014): a JPEG of at most 4096 pixels on its long edge with no GPS, timed; the worker's preparation on `dev` is the api lane's (#111) | S1's build; the 48-megapixel photo (`docs/plans/B0.md`, F9) |
| 3 | **S4, push** | `ios/b2-spike-push` | asking for permission, `registerDevice` with the secret agreed with the api lane (`docs/plans/api-b2-spike-push.md` section 0), its removal at logout, and opening the payload's club and day | S1's drop in the founder's day; the api lane's `api/b2-spike-push` on `main` |

If one shows a native assumption failing, the stages that build on it (B3 and B4 for S1, B3 for S2, B8 for S4) are planned again before they start (MILESTONES).

## 7. Design handoff 12

The brief is `docs/design/handoff-12/handoff-12-brief.md`, with the text to paste in `handoff-12-brief.txt`. It asks for the B2 states with no frame, the new member's pick in place of handoff 6's `G04-change`, Home with no day to wait for (FQ134), and, in words, the points handoff 6's check left for "the next stage B2 brief" (its section 7, moved there by handoff 7's brief) and the ios lane's needs 81 to 84 (`docs/design/handoff-7/ios-lane-needs.md`), with 85 once #158 merges. Until it comes back, each state is built from the spec and the delivered words and marked so; the brief changes no rule and blocks no PR.

## 8. Questions

No new FQ. FQ134's default (`no_days` as built) decides `H01-no-days`. The design questions are the brief's. Two readings this plan takes, for the founder to see in the PRs that build them: a club lost mid-session shows `H01-access-lost` rather than another club put in its place (PR 3), and Home's `day` mode is built from `H01-quiet` ahead of B5 because the routes already answer it (PR 3).

## 9. Not in B2

- The feed and the reveal (B5: `H01-open`, `H01-your-day` with drops, R01), past days and Memories' content (B5 and B7), the captions on F02 (B4 and B5), the composer and drafts (B4), covers through the media route (B3).
- `G05-leave` and what leaving does (B6), notifications beyond S4 (B8).
- The five G04 and G05 states FQ125 to FQ127 replaced (PR 4).
