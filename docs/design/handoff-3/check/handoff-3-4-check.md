# Design handoffs 3 and 4: the check

*3 November 2026. This checks Claude Design's answers to handoffs 3 and 4. Four independent reviews read both deliveries:*
- *against the briefs;*
- *against the copy, privacy and product rules;*
- *for the brand, the visuals and native iOS;*
- *for consistency between the two deliveries, and what the build needs next.*

*A second reviewer then tried to refute each of the 60 findings. None was refuted: 44 were confirmed and 16 corrected. The second reviewers found 13 more, and I checked the ones that matter. Every finding, with its evidence, is in `handoff-3-4-findings.md` beside this file.*

## The answer

**Both deliveries did everything the briefs asked:**
- every frame, titled and in order: 7 in handoff 3, plus the light Friends screen redrawn because it changed too, and 7 in handoff 4;
- every question answered;
- every default drawn as stated;
- the made-up fixtures used exactly;
- every string that exists only in writing given its own key.

The brand is untouched. Tokens, icon, wordmark and font are byte-identical to revision 1.1. Every colour in every frame is a 1.1 token, apart from the drawn phone's camera cut-out, and every text passes 4.5:1 contrast. The only photographs are the book's own Ben, Maya and Debby, and the chair.

**One thing the app won't build as written.** During a clash over Friday, the other four members would see "Day choice conflict: Ben and Debby." That tells the club who hasn't confirmed, which the brief rules out. Until you decide otherwise:
- only Ben and Debby see the clash with names;
- everyone else sees only that Friday has no reveal scheduled.

**Nothing blocks the build, and nothing needs you now.** Where the sources are silent, Claude Design made a few product choices (section 4). Each has an interim reading, and goes into `docs/QUESTIONS.md` when the ios thread builds that part.

**A lot exists only in words.** About 20 more states have exact copy but no picture, for example a suspended club's Home, the proposed roster and the offline Home. The app builds them from that copy, marked "built from spec", and they go in a later brief (section 5).

## 1. What arrived, and where it is kept

- **Handoff 3:** `Tadayo_Handoff_3_Pack.zip` (34 files) and `Tadayo_Handoff_3_Club_Days_and_Home.pdf` (11 pages), in `design/handoff-3/export/`.
- **Handoff 4:** `Tadayo_Handoff_4_Pack.zip` (32 files) and `Tadayo_Handoff_4_Corrections.pdf` (9 pages), in `design/handoff-4/export/`.
- **The checks on the files:**
    - The PDFs you attached are byte-identical to the ones inside the zips, and each pack's own checksum list verifies.
    - There are no scripts.
    - The only links are to the repository's own pages; Claude Design read it at `main`'s latest commit.
    - The only email address is ben@example.com.
- **Handoff 4's files include handoff 3's.** Its copy and component files keep every entry from handoff 3 unchanged. They keep every entry from handoff 2 too, changed only where handoff 4 says: curly apostrophes, Maya as G03-approve's viewer, and pointers to the new lines. So they replace the earlier files. Its component sheet contains every earlier sheet.
- **When it enters the repository:** with handoffs 1 and 2, through the ios thread.

## 2. What came back

| Screen | What it shows |
|---|---|
| G04-conflict | "Friday is chosen by Ben and Debby. Either person can change a choice." Confirm Friday is greyed out; Monday is still free to choose. |
| G04-change | "Monday, November 16, 2026", with Ben's and Debby's announced dates kept and marked Unchanged. "Current days continue until the change is confirmed." |
| G05-schedule | The whole week, read-only. Unused days say "No reveal scheduled". "View local times" serves a member who is travelling. |
| H01-awaiting-activation | "Waiting for club confirmation" and "The club starts when another person accepts the same roster." The action is Review members. |
| H01-paused | "This club is paused." and "Kitchen table needs another member for new days." The action is View Memories. Nobody is named. |
| H01-loading | Only the club's name, your photo, the system's spinner and "Loading Home…". |
| F01-friends, light and dark | The Private drafts row, "Ben · You" and a plain "Next up". "See schedule" sits under the list. The ring around Ben's photo is gone. |
| G03-approve | Maya approves Leila. A shield replaces the lock. |
| G01-pending | It now matches the waiting Home, with the same words and Review members. |
| G06-no-club | Create a club, then I have an invite as the outlined button, then Private drafts. |
| G02-link-entry-signed-in | "We'll check the link before showing the club or its people." |
| G01-invite-people-revoked | Alex's row reads "Link revoked", with a glyph of its own and Create new link. Below the list: "Only you can see this list." |
| G02-revoked, and the web page | "This invitation isn't available. Ask for a new invitation link." No name, no club. |

**Also answered in writing:**
- A refused code now says "Couldn't send a new code. Try again." "Try again shortly" is retired, because the app can't know the wait.
- Every Members list ends the same way: "6 members · New York", then the hours.
- Club details uses the same Private drafts row as everywhere else.
- Leila's declined screen gains "We don't identify who declined."
- Every type style now scales with the iPhone's text size.

## 3. Where the app follows the rules instead of the delivery

1. **The clash names.** See above.
2. **The offline Home.** Handoff 3 lets an offline Home show only the last known opening time. Spec 34 lets days that have already opened stay readable offline. The app follows spec 34. Nothing hidden ever unlocks offline.
3. **Times and places.** Some copy writes "7 AM" and "New York" into the text. The app formats times by the phone's settings (FQ44), and uses each club's own zone.
4. **Names in the copy.** The copy keys spell out Ben, Kitchen table and so on. The app turns them into templates with the same words.
5. **VoiceOver labels.** Nine labels use different words from the button they belong to; for example, "Review members" is spoken as "Review Sunday people's proposed members." The app keeps the labels and also accepts the visible words for Voice Control.
6. **The two-person club's title.** Handoff 2 drew "Ben and Debby" as the club's name. Handoff 4 says to show the club's own name, so the app does.
7. **Earlier frames changed only in words.** These now carry old copy, so the app follows the new words:
    - the Members lists;
    - the invitation list;
    - Club details;
    - Leila's declined screen;
    - Friends at large text and with long names.
8. **Small spacing.** A 17-point gap is built as 16, the nearest step on the book's scale. The PR lists each case like this.

## 4. Product choices for you, none urgent

Each goes into `docs/QUESTIONS.md` with its interim reading, which holds until you answer. Their numbers are reserved: FQ46 to FQ53, in this order.

1. **FQ46. Who sees a clash over a day, and whether with names.** Interim: only the two people involved see the names.
2. **FQ47. Photos in an invitation's member list.** Handoff 4 shows the members as initials only, to someone who hasn't joined yet. The book's invitation screen shows their photos. Interim: initials, the stricter reading.
3. **FQ48. A day proposed for someone else.** G04-conflict shows Ben's proposed Monday as "Available", so Debby could take it. Interim: only confirmed days are taken.
4. **FQ49. A schedule change that isn't confirmed by its start date.** Claude Design proposes a new date, and everyone confirms again. Interim: as delivered.
5. **FQ50. A paused club that still has an announced day.** The day is kept, and nothing says what Home shows or whether you can still add for it. Interim: Home shows that day as usual until it passes, then shows the pause.
6. **FQ51. Invitations still out once a club has started.** G01-invite-people-revoked has Debby accepted. Under your default, the club has therefore started, but the screen still says "Create a club". Nothing says whether the others now need approval, or where Ben manages their links. Interim: the list is reached only during setup.
7. **FQ52. A pending schedule change is easy to miss.** There's no push, by the rules, and Home doesn't mention it. It shows only under Schedule and in Club details. Interim: as delivered.
8. **FQ53. Plain screens.** The waiting and paused Homes show none of the book's objects: no plaque, card or photographs. This is the same call you still have for the empty Home.

Claude Design also named a cost for five of the defaults:
- a clash can last indefinitely;
- needing every member can stall a change;
- the loading screen can feel slower;
- the revoked-link page is less personal;
- full dates make some lines longer.

Each is drawn as you set it.

## 5. Described in words only

These have exact copy and rules but no frame. The ios thread adds an inventory row for each, builds it from the copy, and marks it "built from spec":
- the proposed roster that Review members opens;
- the club-unavailable Home (suspended), the lost-access Home, and the Home that fails to load or is offline;
- Friends and Memories before a club starts and while it's paused;
- the club list's "Not started" and "Paused" labels;
- the Add menu with drafts only;
- around a schedule:
    - the screen after you confirm;
    - Maya's view of the change;
    - "this day was just taken";
    - the other members' view of a clash;
    - the three-to-four-member transition week;
    - the "Review the club's days" row;
    - the local-times sheet.

Two states the briefs mentioned appear in neither delivery: Home after a club starts but before its days are confirmed, and Home during a single suspended day.

## 6. For a later brief

- **Frames:**
    - the proposed roster;
    - the club-unavailable, lost-access and offline Homes, including offline during an open day;
    - the club list's labels;
    - the transition week;
    - the review row and the local-times sheet.
- **One day-picking design** across the one-day, two-day and clash screens, with free and taken days looking different. G04-conflict adds a third look, where a free day and a taken day look the same.
- **G04-conflict:**
    - the clash in a calmer colour than the red used for errors, as handoff 4 already does for revoked links;
    - the opening hours, which book p10 asks for;
    - "You" beside Ben;
    - one name for the clash;
    - words for three people.
- **Consistency:**
    - Sunday written one way;
    - G04-change's rows by weekday, matching what VoiceOver reads;
    - VoiceOver labels that start with the button's own words;
    - Decline's label naming Leila.
- **Travel:** what a member who is travelling sees on Friends and Home.
- **Spacing:** named spacing for the new screens.
- **The card:** its status line, and its lock.

Nothing here is urgent, because the app builds from the rules meanwhile. I can write handoff 5 from this list whenever you want it. Otherwise the ios thread writes it when B2 starts.

## 7. For the ios thread

`handoff-3-4-findings.md` has the rest. The main points:
- **Inventory rows** (`design/reference/INVENTORY.md`):
    - add handoff 2's 7 new states and handoff 4's 4, plus the states in section 5;
    - split `H01-paused` from the suspended club;
    - add Known-differences entries for the frames changed only in words.
- **Copy:**
    - keep the `handoff3` and `handoff4` namespaces when generating strings, because one short key has a different value in each;
    - never wire the Share or More labels to an accepted member's row;
    - never use the retired lines.
- **Fixtures:**
    - Kitchen table needs two data sets: five members for G03-approve, and Ben alone for H01-paused;
    - Ben has no photo in G06-no-club, and a photo elsewhere.
