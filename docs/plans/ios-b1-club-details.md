# B1, PR 3b: Club details and the members list (`ios/b1-club-details`)

Branch `ios/b1-club-details`, from `main` at `b40850f`. Written on 21 November 2026. The second half of `docs/plans/ios-b1-clubs.md` section 4's PR 3, as `docs/plans/ios-b1-clubs-root.md` split it: `G05-club-details`, `G05-members`, `G05-members-two-days` and `G05-club-details-failed`'s form.

## 0. Sources

- spec 03 (Club information: "members, schedule, notification preferences and leave"), spec 05 (each member's weekday or two: A02), spec 09 (the roster's stable order), spec 29 (loading and recoverable errors), spec 32 (`listMembers`);
- book p7 (the club name opens switching and club details), p24 (Club details: "The displayed club, count and roster agree"), p46 (Private drafts is account-wide);
- the contract: `getClub` (`ClubDetail`), `listMembers` (`Members`, `Member.position`) and `getSchedule` (`Schedule`, `CurrentSchedule`, `ScheduleAssignment`, `Weekday`);
- frames: 2.1's `G05-club-details`, handoff 8's `G05-club-details-active` (frame 16) and `G05-club-details-failed` (frame 11), handoff 1's `G05-members`, handoff 2's `G05-members-two-days`;
- words: handoff 6's `details.*` (title, rows, subtitles, `details.footer`, `details.memberCount`, `details.row.hint`, `details.drafts.hint`, `details.leave.hint`), handoff 4's `members.footer.one` and `.other` and `membersFooter` contract, handoff 5's `members.footer.hours`, handoff 8's `loadStates.details` and `loadStates.members`, handoffs 1 and 2's subtitles, handoff 5's `calendar.person.self` and `.vo`;
- checks: handoffs 3 and 4's B-10 and R-05 (the written contracts win over the earlier frames; the club's own name as every Members title), handoff 6's X-09 and question A (FQ80), handoff 8's section 4 (Leave club stays at the leading edge);
- invariants: T9, T14, T33, T41 to T43, T45, T46, T49, T52, T55; FQ9, FQ80, FQ85 (ADR-029).

## 1. What it builds

### Where Club details opens

- From the switcher's Club details (`ClubSwitcher`), for the selected club: the sheet closes, then Club details is pushed onto the selected tab.
- Each club tab (Home, Friends, Memories) holds its own `NavigationStack`, its root's bar hidden, so the tab and its header look as they do now. Club details and Members are pushed onto it with their inline titles and the system's Back. They hide the tab bar, as every frame draws them with none.
- Back returns to the tab as it was (book p7: "Tab state and scroll position survive ordinary return navigation").
- The pushed screens close when the club they show is no longer the selected one: another club is chosen, the list is read again, or the session ends.
- H01-paused's Club details (`handoff6.paused.details`) is B2's. It will push the same screen.

### The model (`TadayoCore`)

**`ClubDetailsModel`** (new, `packages/swift/TadayoCore/Sources/TadayoCore/ClubDetailsModel.swift`). `RootModel.clubDetails()` makes it for the selected club, and `nil` while none is selected. It reads two things, each with its own state, since the two screens load and fail apart (handoff 8's `loadStates.details` and `loadStates.members`):

- **`details`:** `.loading`, `.loaded(ClubDetail)`, `.failed(Failure)` or `.unavailable`.
    - `loadDetails()` calls `GET /v1/clubs/{club_id}`.
    - A suspended club is `.unavailable` with no call (FQ80's default: Club details shows the same "Club unavailable" as Home, with nothing of the club; T9).
- **`members`:** `.loading`, `.loaded(Roster)` or `.failed(Failure)`.
    - `loadMembers()` calls `GET /v1/clubs/{club_id}/members` and `GET /v1/clubs/{club_id}/schedule`, together. The roster needs both.
- **`Roster`:** the members in the server's `position` order (spec 09: never re-sorted here), each with:
    - their `Person`;
    - whether they're the viewer (`membership_id` is the club's `my_membership_id`);
    - their weekdays, from `current.assignments`, Monday first.

  It also holds the club's `ClubRef` and how many days each member has: `.one` when every member listed has one weekday, `.two` when every member has two, and nothing otherwise.
- **`Failure`:** `.network` gives handoff 8's network line ("Check your connection and try again."); anything else gives its refusal line ("Try again.").
- **What answers do:**
    - `signedOut` ends the session, as everywhere else;
    - `notFound` means the club is no longer the caller's to read: left, suspended (T9), or gone. The model is `closed`, which closes the pushed screens at once, and the root reads the list again, which decides (as `loadHome` does);
    - an answer that lands after the session ended, or after another club was chosen, is dropped (the root's `epoch`, and the selected club's id when the model was made);
    - so is the answer to a read whose screen went away (Back cancels its task): a cancelled request comes back from the client as a network failure, which nobody would see, and which Members, opened again, mustn't show.

**Where the weekdays come from.** `listMembers` gives each member one `next_day`, so a two-day member's second weekday isn't in it. `getSchedule`'s `current` holds each member's weekday or two, in force today (`CurrentSchedule`). So this PR adds `getSchedule` to `ClubService` and `TadayoAPIClient`, reading `current` alone:

- `ClubWeek`, with `assignments: [WeekdayAssignment]` (weekday and person), empty when `current` is absent;
- `Weekday` (Monday to Saturday; Sunday never is: T6);
- the proposal, B2's, isn't kept: the generated decoder still reads and checks it, so a proposal the contract doesn't allow refuses the whole answer, as any other field would;
- an answer the contract doesn't document is refused, as the other club calls do.

The two reads are separate snapshots, so a member's days are matched by membership id:

- a member with no assignment shows the name alone, as the Friends row does for a member with no day (`friendsRow.noOccurrence`; T49);
- an assignment for someone the roster doesn't list is dropped.

So a member who left between the two reads is in neither list. The roster, its count and its title are from the one `listMembers` answer (handoff 4's `membersFooter`: "updates from one authorized server snapshot").

**`DateLabels`** gains:

- `weekday(_ day: Weekday)`: the weekday's standalone name, in the phone's language;
- `clockHour(_:)`: a whole hour as the phone writes times ("7 AM", or "07:00" on a 24-hour phone), by `time(_:in:)`'s rule.

**`ClubHours`** holds the opening and closing hours the screens name: 7 AM and 1 AM the next morning (spec 06). No call gives them.

### The screens (`apps/ios`)

**`G05-club-details`** (`ClubDetailsScreen`, from 2.1's frame and handoff 8's frame 16, with handoff 6's words):

- The inline title "Club details" and Back.
- The club's name in `utilityTitle` 32/35, as a heading, 20 under the bar, where frame 11's failure title sits (a setup screen's column).
- 12 under it, in `body` `secondaryText`, `details.footer`: "6 members · New York" (`details.memberCount.one`/`.other`, then the club's zone, `DateLabels.zoneName`). The count is `getClub`'s `member_count`. Never the zone-omitted form.
- The rows, in `row` 17/22 over `metadata` 13/18, each with a chevron and a full-width `separator` under it:
    - Members, "New members need everyone’s approval";
    - Schedule, "7 AM to 1 AM the next morning";
    - Notifications, "Preferences for this club";
    - Widget, "Preview and setup".
- 16 under the rows, Private drafts, the same `PrivateDraftsEntry` as Home's (handoff 4: "Club details should not have a different Drafts component"; book p46).
- 20 under that, Leave club, a text action in `destructive` (a new ink for `TextActionStyle`), at the leading edge (handoff 8's check, section 4).
- Members opens `G05-members`. Schedule (B2's `G05-schedule`), Notifications (B8), Widget (M1, FQ9), Private drafts (B3 and B4) and Leave club (B6) are drawn and do nothing until their stages (FQ85, ADR-029; `docs/plans/ios-b1-clubs.md` PR 3).
- VoiceOver: each row's label is its title and subtitle, and its hint is `details.row.hint`, "Open Members for Sunday people.". Private drafts takes `details.drafts.hint`; Leave club takes `details.leave.hint`, "Review leaving Sunday people.".
- Invite someone (`G05-club-details-active`) is plan PR 7's, and the paused club's (`G05-club-details-paused`) is B2's.

**The Schedule row's line.** No delivery words the Schedule row's line. Both frames draw "7 AM to 1 AM the next morning" with no full stop, as every row's line is drawn. It is built from handoff 5's `members.footer.hours` without its full stop (`details.schedule.subtitle`, "{openTime} to {closeTime} the next morning"). The times are `DateLabels.clockHour`'s. Noted in INVENTORY.md as built from spec.

**`G05-members`** and **`G05-members-two-days`** (`MembersScreen`):

- The inline title "Members" and Back.
- The club's own name in `utilityTitle`, as a heading. Never "Ben and Debby", the two-day frame's stand-in (R-05).
- The subtitle, in `body` `secondaryText`:
    - "Each person has a day." when every member has one weekday (handoff 1);
    - "Two reveal days each." when every member has two (handoff 2);
    - none otherwise, as in a club's first days before everyone has confirmed, or a club of one. Handoff 1's check showed "Each person has a day." is untrue in a pair, so the line is shown only when the roster bears it out (T43, T49).
- One row per member (`RosterRow`, in `TadayoDesign`), from `invitationRosterRow`'s contract and the frames:
    - the 36-point avatar with the initial;
    - the name in `row`, "Ben · You" for the viewer (`person.self`);
    - their weekdays in `metadata` `secondaryText`: "Monday", or "Monday and Thursday" (`members.days.two`);
    - a separator from 49 points to the trailing edge;
    - at least 52 high, growing with the text.

  It is not a button: nothing in the frame opens from a row. VoiceOver reads one element per row: "Ben, you. Monday and Thursday." (`person.self.vo`).
- Photographs: other members' photographs need the avatar read, which no stage before B3's media has, so every row shows the initial for now. Handoff 1's and 2's frames draw initials too.
- The footer, two lines in `metadata` `secondaryText` (handoff 4's `membersFooter`, handoff 5's `members.footer.hours`):
    - "6 members · New York" (`members.footer.one` and `.other`), counting the roster listed;
    - "7 AM to 1 AM the next morning.".

  This replaces handoff 1's "Sunday people has six members." and handoff 2's "New York · 7 AM to 1 AM the next morning." (B-10).

**Loading and failure** (handoff 8's frame 11 and `loadStates`):

- While each screen loads, the indeterminate indicator over "Loading club details…" or "Loading members…", under the inline bar, as Home's loading shell has it.
- On a failure, frame 11's form, as `RootFailure` draws it:
    - the title, "Couldn’t load club details." or "Couldn’t load members.";
    - the line (network or refusal);
    - Retry pinned at the foot, hinted "Try loading club details again." or "Try loading members again.";
    - no rows and no count.
- VoiceOver says the title and the line when the failure shows, as the root's failures do.

**A suspended club's Club details** shows `ClubUnavailable`'s title and line under the inline bar, with nothing of the club and no call (FQ80). Back returns to the tab, whose Choose a club is there.

## 2. Tests first

On Linux (`swift test --package-path packages/swift/TadayoCore`):

1. **`ClubDetailsModelTests`:**
    - details: `.loading` while the call is out, then `.loaded`;
    - a network failure gives `.failed(.network)`, any other gives `.failed(.refused)`, and Retry reads it again;
    - a suspended club gives `.unavailable` with no call;
    - `notFound` closes the model (`closed`, which closes the screens) and asks the root to read the list again, once;
    - `signedOut` ends the session;
    - an answer after the session ended, after another club was chosen, or after a later read of the same screen, changes nothing;
    - a cancelled read (its screen went away: Back) changes nothing, whatever it answers, though the client gives a cancelled request as a network failure.
2. **The members:** both calls are made; either failing fails the screen; `notFound` and `signedOut` from either behave as above, a session ended deciding whichever of the two answered first; and the same three late answers and a cancelled read change nothing.
3. **The roster:**
    - kept in `position` order, even when the answer lists members out of it;
    - the viewer marked by `my_membership_id`;
    - each member's weekdays from `current`, Monday first, with "monday" and "thursday" answered in either order;
    - a member with none gets an empty list;
    - an assignment for someone not listed is dropped;
    - `.one`, `.two` and nothing (mixed, someone with none, no `current`).
4. **`ClubCallsTests`** (`packages/swift/TadayoAPI`, `swift test --package-path packages/swift/TadayoAPI`):
    - `schedule(of:)` decodes the contract's `sunday_people` example's `current`;
    - an answer with no `current` gives no assignments;
    - 404 gives `notFound`; 401, refreshed once and sent again, gives `signedOut` when it comes again (every club read: `aReadRejectedAgainAfterTheRefreshSignsOut`);
    - an undocumented status, or a code the read doesn't document, is refused.
5. **`DateLabelsTests`:** `weekday(.monday)` is "Monday" in en-US and "lundi" in fr-FR; `clockHour(7)` is "7 AM" in en-US and "07:00" in en-GB.

Hosted tests (`apps/ios/TadayoTests` and `apps/ios/TadayoSnapshotTests`):

- `ClubDetailsLayoutTests`, measured from the elements VoiceOver finds:
    - the name where frame 11's failure title sits, under the same inline bar, 20 from the leading edge;
    - the four rows the column's width, at least 44 high, one under the other, under the footer;
    - Private drafts 16 under the rows, and Leave club at the leading edge, 20 under it, at least 44 high;
    - each roster row the column's width and at least 52 high, at the default size and the largest, with the footer 32 under the last.
- `ClubDetailsSnapshotTests`' "What VoiceOver finds": each row's label and hint and that it's a button; Members opening the members list; the club's name and the list's title as headings; the roster rows one element each, none a button; a member with no day read by name alone, and the list then with no subtitle; the failure's title and line, and Retry's hint; nothing of a suspended club; and the loading labels.

The words 49 points in and the separators, which VoiceOver doesn't see, are read from the snapshots.

UI tests (`apps/ios/TadayoUITests/ClubDetailsUITests.swift`, on the stand-in services' two clubs, `UITestLaunch.clubs`), for what only the tabs do:

- the switcher's Club details pushes Club details over the tab with the tab bar hidden; Members pushes the members list; Back returns one screen at a time, to the tab as it was; and opened again, the members list reads and shows the roster again;
- a club whose details answer not found closes them, back to the tab, with no failure and nothing of the club.

**Members opened again** starts from loading, never from what an earlier opening left in the model (`MembersDestination`), and a second tap while it slides in pushes nothing more (`TabsView`).

## 3. States snapshotted

Each in light, dark and the largest text (`ScreenSnapshot`), paired with its render by name:

- `G05-club-details` (Sunday people, six members);
- `G05-club-details-failed` (the network line), and the members list's failure as `G05-members-failed` (built from spec, a new row: the same form with handoff 8's members words);
- `G05-club-details-loading` and `G05-members-loading` (built from spec, new rows: handoff 8 words them and draws neither);
- `G05-members` (Sunday people, one day each, Ben the viewer);
- `G05-members-two-days` (a pair, Ben and Debby, two days each, titled with the pair's own fixture name);
- `G05-club-details-unavailable` (built from spec, a new row: FQ80's default).

Each new row is added to INVENTORY.md as built from spec, with its source.

## 4. Privacy and the review's checks

- **Nothing of a suspended club:** no call, no name, no count (T9, FQ80).
- **Every member sees the same list (T55):**
    - the roster, its days and its count come from the server's answers alone;
    - nothing on either screen comes from drops, and nothing counts approvals, acceptances or activity (T15, T33);
    - Members is not an approval count (handoff 4's `membersFooter`).
- **No proposed person is shown as a member:** `listMembers`' `open_revision` isn't drawn here. The proposed roster's review is plan PR 7's (`G05-members-proposed`).
- **Neutral when it's gone:** a club the caller can no longer read shows nothing of it. The list is read again (T14).
- **Nothing kept:** neither screen caches an answer. Each read is for the screen showing it (T11).
- **No log line or analytics event** carries a club's name, a member's name or an id (T52).

## 5. Not here

- Invite someone and the proposed roster (plan PR 7).
- The paused club's details (`G05-club-details-paused`, B2).
- Schedule's screen (`G05-schedule`, B2).
- Notifications (B8), the widget (M1, FQ9), Private drafts (B3 and B4) and Leave club (B6).
- Other members' photographs (after B3's media).
