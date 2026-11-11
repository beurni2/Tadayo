# Design handoff 6: the check

*4 November 2026. This checks Claude Design's answer to handoff 6. Five independent reviews read the delivery:*
- *against the brief's 16 frames;*
- *against its written questions and its return rules;*
- *against the copy, privacy and product rules;*
- *for the brand, the visuals, native iOS and accessibility;*
- *for consistency with handoffs 3 to 5, the files, the inventory and the open questions.*

*A second reviewer then tried to refute each of the 73 findings: 48 were confirmed, 24 corrected and 1 refuted. The second reviewers found 14 more, and a last reviewer looked for anything missed and found 6. Many describe the same issue from different sides. Two more reviewers, each followed by a second reviewer, then checked this report. Every finding, with its evidence, is in `handoff-6-findings.md` beside this file.*

## The answer

**Claude Design did almost everything the brief asked.** Besides the defect and the redraws' extra changes below, it again left its list of replaced lines incomplete, didn't say how far seven of its replaced rules reach, and wrote no template for the club list's "5 people" (section 4, items 8 and 12; section 7). What it did:
- all 16 frames, titled and in order;
- 11 earlier screens that its answers changed, redrawn and sent after frame 16, as the brief told it to;
- every question answered in writing, with a template for each new line;
- every interim reading drawn as the brief set it: FQ46, FQ48, FQ55, FQ57, FQ79, FQ16 and the first days;
- the made-up fixtures used exactly, with every date and time right (Auckland is 18 hours ahead of New York that week, London 5);
- the six rules the brief set over handoff 5, all followed: "Next up", the club's own name, the countdown spoken as its date, a small "your" inside a sentence, "Selected" said once, and the View local times hint naming one zone when you're at home (VoiceOver still names it twice with the club's hours: section 7);
- dark samples of every new part, with the waiting card's date plaque and initial readable (16.2:1 and 9.4:1).

**The urgent item is done.** The Home shown before any day is confirmed now says "Your club's next scheduled day will appear here.", which is true, and keeps the Private drafts row. That was the one line handoff 5's check said had to change before TestFlight.

**One serious defect.** On four day-picking screens and on the component sheet, a day proposed for someone else has lost its empty selection circle. It can still be chosen, but it now looks as if it can't. One of the four is the redraw of the one-day screen you chose on 4 November (`one-day-h5-vs-h6.png`, beside this file). The delivery's own written rule keeps the circle, as handoff 5 drew it, so the app builds the circle.

**The redraws changed more than they say.** The brief said a redraw keeps everything else as it was. Several didn't:
- every screen's photographs lost their thin edge, and Friends also lost "New York" beside See schedule and its bold "Next up";
- the change screen's looser spacing pushes Maya's new days out of view;
- the waiting card and the screens for a suspended club or one you can no longer open have new type sizes, and on those screens Get help moved to the left.

Where a frame differs from the written rules or spacing values, the app mostly follows the written ones; section 4 says which, item by item.

The brand is untouched. Tokens, icon, wordmark and font are byte-identical to revision 1.1. The only photographs are the book's own. A check of every new string finds no "Sent", no inferred pronoun and no exclamation mark.

**Nothing blocks the build, and nothing needs your answer now.** Section 3 shows what changed on the two day-picking screens you chose; tell me only if you'd rather keep handoff 5's look. Section 5 has two things worth knowing and four new questions, each with a default the app builds meanwhile.

## 1. What arrived, and where it is kept

- **The files:** `Tadayo_Handoff_6_Pack.zip` (71 files) and the PDF inside it, `Tadayo_Handoff_6_Days_and_Home.pdf` (14 pages), both in `design/handoff-6/export/`.
- **The checks on the files:**
    - The pack's own checksum list verifies, and the manifest's checksums match all 54 frame files: 26 phone frames at 393x852 points and the component sheet, each as SVG and PNG.
    - There are no scripts.
    - Apart from the font licence's links to its own sites, the only links are to the repository's own pages. Claude Design read the repository at commit 17de7fd, today's `main`, which has ADR-027 but not the open design PR #13.
    - The pack's checksum for the brief it worked from matches the brief's text exactly, with Windows line endings, so Claude Design worked from the brief as sent.
- **Its files include handoff 5's.** The copy and component files keep every handoff 5 entry unchanged and add new ones only under `handoff6`, so they replace handoff 5's files. The component sheet's upper part is pixel-identical to handoff 5's; the new part below it holds light and dark samples of every new piece.
- **Colours:** every colour is a 1.1 token, apart from the drawn phone's camera cut-out and one grey that handoff 5's sheet already used.
- **Pictures beside this file:** `one-day-h5-vs-h6.png` (the defect), `contact-sheet-1-8.png` and `contact-sheet-9-15.png` (the new frames), and `redraws-before-after.png` (each redraw beside its earlier version).
- **When it enters the repository:** through the ios thread, in the design PR that brings handoff 5 in after #13 (section 8).

## 2. What came back

| Screen | What it shows |
|---|---|
| 1 H01-confirm-days | "The club's days", "Your club's next scheduled day will appear here.", Private drafts and Choose your day. |
| 2 G04-conflict-three | Ben's view: "The proposed days overlap on Friday." Friday reads "Contested", with "Ben · You, Alex and Debby", and Confirm Friday is greyed out. Monday, which Ben left, reads "Available" and "Proposed for you". |
| 3 G04-contested-other | Sam's view: Friday reads "Contested" and "No reveal scheduled", with no names or count. Its VoiceOver hint, which isn't shown on screen: "Choose Friday. You'll then see the people in this contested choice." Sam can confirm Thursday. |
| 4 G04-confirm-refused | Debby's view after a refused tap: "Couldn't confirm Friday. This day is contested. Your choice is kept.", in grey, not red. |
| 5 G04-two-days-one-chosen | Ben has chosen Monday. The button reads "Confirm two days" and stays greyed out until a second day is chosen. |
| 6 G04-confirmed-many | "Your days are confirmed." over the pair's week. Back and Done both return to where Ben started. |
| 7 G05-schedule-choose-own | The club's week in its first days, with Ben's own "Choose your day" row on top. Monday and Friday read "No reveal scheduled" and name nobody. |
| 8 F01-friends-first-days | Maya on Tuesday 10, Alex Wednesday 11, Sam Thursday 12 and Nina Saturday 7 November ("Next up"). Ben and Debby haven't confirmed: their rows show the name only, with no date and nothing to tap. |
| 9 G05-local-times-same-zone | At home: one "Club and your time · New York" block for each day, with its opening and closing. |
| 10 H01-travelling-dateline | Ben in Auckland: "Opens Sunday, November 8 · 1 AM · Auckland", then "Saturday, November 7 · 7 AM · New York", and the same 5h 59m countdown. The plaque keeps SAT 07, the club's date. |
| 11 F01-friends-travelling | Each row shows the Auckland date and time, then the New York date and time. |
| 12 F01-unavailable | "Club unavailable", with one Choose a club and Get help. The header shows the Tadayo wordmark and nothing of the club. |
| 13 M01-access-lost | "This club is no longer available." and "Choose a club to continue.", with no past day or photograph. |
| 14 G06-switcher-unavailable | Sunday people "Unavailable", Kitchen table "5 people · Next: Maya", then Club details, Create a club and Cancel. |
| 15 G05-club-details-paused | Kitchen table, "1 member", Invite someone, the schedule, Private drafts and Leave club. |
| 16 brand-components | Handoff 5's sheet unchanged, with light and dark samples of every new part. |

**The 11 redraws:** G04-conflict, G04-one-day, G04-two-days, G04-change, G05-schedule-review, G05-schedule, H01-travelling, H01-unavailable, H01-access-lost, F01-friends and G05-local-times. The local-times sheet now shows the moment Debby's Friday is open, listed first with "Open now".

**Also answered in writing:**
- **A newly confirmed day (FQ79):** it first opens on its first date whose 7 AM is at least 24 real hours after confirming; exactly 24 counts.
- **Words:** "Taken" is what VoiceOver says for someone else's confirmed day; a countdown of a day or more reads "1d 5h 59m".
- **The past-day card:** the book's card, on every Home.
- **Not now:** in the navigation bar on every day-picking screen.
- **Screens for a suspended club or one you can no longer open:** the wordmark replaces the club selector, so there is one Choose a club. Memories for a suspended club, and Friends for a club you can no longer open, take the same forms as frames 12 and 13.
- **Spacing:** values for every gap the brief asked about, on book p35's scale.

## 3. The screens you chose, redrawn

On 4 November you chose handoff 5's two day-picking screens over the book's (FQ2). Handoff 6 redraws both. The main changes:
- your own choice is a pale blue row, where it was pale grey;
- "Proposed" is a small tag, the same one used for proposed members, instead of a diamond;
- the one-day screen's instruction reads "Choose a day that works for you, then confirm.";
- the circles on proposed days are gone (the defect above).

The app builds handoff 6's version with the circles kept. The screens are still the ones you chose, with these changes, so I don't think it needs a new decision. Tell me if you'd rather keep handoff 5's look.

## 4. Where the app follows the rules instead of the delivery

1. **The circle on a proposed day** stays, as the delivery's own rule and handoff 5 have it.
2. **Friends:**
    - "New York" stays under the list on the left, with See schedule on the right, as handoff 3 put them;
    - photographs keep their thin edge, here and in every screen's header;
    - "Next up" stays bold;
    - the row's arrow keeps the size handoff 3 set (the frames draw it smaller);
    - the selected tab's icon stays filled, as iOS draws it.

   Handoff 3's rules for these still stand, and the redraw gives no reason for changing them.
3. **Kept dates on the change screen** carry the year and are joined by a middle dot, wrapping when they don't fit and stacked at the largest text sizes. The delivery's written rule says this. The frame stacks them, and the example leaves out the year.
4. **Spacing.** Several of the frames' gaps run 6 to 18 points looser than the spacing values the delivery writes down, and the refused confirmation's line sits tighter than its values. The app uses the values. On the change screen, that should bring Maya's new days back into view at the usual text size; the snapshots will show whether it does.
5. **Screens for a suspended club or one you can no longer open** take the smaller title and the left-aligned Get help, as drawn. The title starts 32 points under the header, the value the delivery writes down; the frames put it about twice as far down.
6. **The waiting card.** One card for every waiting Home, built from the book's own waiting Home with handoff 6's colours, dated time lines and dark pairings, so its plaque, photograph and type stay the same when you travel. Only its time lines change, and its date line shows only when the local and club dates match.
7. **A refused confirmation** is announced once to VoiceOver (T47). The frames give it no spoken form.
8. **The club list's count** reads "5 people", as the book draws it. The delivered template would say "5 members".
9. **Club details for a suspended club** stays in the club list and opens the same "Club unavailable" screen, showing nothing of the club (T9). This is new question A (FQ80) in section 5.
10. **Long screens:** the title and lines above a list scroll with it. Only the navigation bar, the Confirm button, Friends' See schedule and the tab bar stay put, so rows stay visible at the largest text size.
11. **"Your days are confirmed."** Back returns to where you started, as the written rule says, never to the editable list.
12. **The list of replaced lines** is still incomplete, and two entries point at lines no frame uses. The app takes each screen's words from its frame, and never uses the templates that exist only for the made-up fixtures.
13. **Native sheets and rows:** no tap areas overlap in the club list, and the paused club's Invite someone row is centred like the others.

## 5. Points for you, none urgent

- **Who hasn't confirmed can be seen.** This happens in two places:
    - **In a club's first days,** Friends and the club's week show every member who hasn't confirmed. Their Friends row has no date, and their day reads "No reveal scheduled" while every other day names its person. Handoff 5's check told you only the day-picking screens show this (its section 4, item 10). That was wrong. Any truthful screen shows it, because the app never shows a date that doesn't exist (T49). Nothing says "waiting for", counts or reminds.
    - **On a contested day,** the names FQ46 hides from everyone outside the clash can be worked out. Every other day still held names its person, and the days the choosers left read "Available", so the members missing from the week are the ones on the contested day. Joining the clash isn't private either: a member who chooses the contested day frees that member's own day, which then reads "Available" for everyone, and the others in the clash see that member's name. A VoiceOver hint on the contested day, not shown on screen, tells a member outside the clash that choosing the day shows the names.

  The app builds both as drawn. Tell me if either bothers you. Since the names can be worked out anyway, one simpler option is to show a contested day's choosers to everyone (FQ46).
- **FQ79, made exact.** Exactly 24 hours counts. A day confirmed less than 24 hours before its 7 AM waits a week. The 24 hours are real time, even across a clock change. The same rule applies to the new days a membership change brings in. Tell me if a day should be able to open sooner.
- **Four new questions, FQ80 to FQ83, each with a default the app builds meanwhile:**
    - **A (FQ80). Can a suspended club's members still open its Club details, or leave it?** The club list still offers Club details while the suspended club is selected. Default: Club details shows the same "Club unavailable" screen, with nothing of the club, so until you answer, its members can't leave it from Club details. Needed by B2.
    - **B (FQ81). When "Your confirmation is saved." goes away.** After you confirm a membership change, the club's week says so. If the line went away the moment everyone had confirmed, then in a two-person club it would tell you the other person had confirmed. Default: it stays until the change's start date, or until the proposal is replaced. Even so, the change starts only if everyone confirmed, so in a two-person club you still learn on that date whether the other person did. Needed by B2.
    - **C (FQ82). The last active member leaving.** Kitchen table's only active member is offered Leave club, and no rule says what then happens to the club, its Memories or an invitation still out. Default: leaving is allowed, the club stays paused with nobody active, and nothing is deleted. Needed by B6.
    - **D (FQ83). Should the local-times sheet also list the next day of the person whose day is open?** During an open day, it lists the open day first, then the next day of each other member, so that person's next day isn't in it, though Friends shows it. Default: as drawn, without it. Needed by B2.

## 6. Described in words only

These have rules but no frame. The ios thread adds each to the inventory and builds it, marked "built from spec":
- a day-picking screen reopened after your day is confirmed: read-only, with a check and "Confirmed";
- the club's week after you've confirmed a membership change ("Your confirmation is saved."), and the read-only change it opens;
- a countdown of a day or more ("1d 5h 59m");
- Memories for a suspended club, and Friends for a club you can no longer open;
- the local-times sheet at home during an open day;
- Friends while travelling when the local date matches the club's.

Three have no frame and no words of their own. For those, the app reuses the book's and the delivery's lines, writes none of its own, and the next brief asks for them:
- **Memories and Friends in a club's first days, before anyone has confirmed.** Memories uses the book's "Your first memories are ahead." without its "Next:" line until a day is confirmed. Friends shows name-only rows and the + Add for private drafts only.
- **Choosing who a drop is for, when a member has no day yet:** that member is shown by name and photograph and can't be chosen.
- **A club in the club list whose day is open,** or which has no confirmed day yet: "6 people · Debby's Friday", as the book draws it, or the count alone.

## 7. For a later brief (handoff 7)

None of this is urgent.
- **First:** the circle on proposed days, on four frames and the sheet.
- **The redraws:** explain or undo the changes section 4 lists, and say what the waiting card's type sizes and photograph size are.
- **Words:**
    - a line for a contested day that doesn't use "proposed" in a second sense: "The proposed days overlap on Friday." sits above Monday's "Proposed for you";
    - which lines a member outside a clash sees;
    - the Confirm hint on a contested day without "yet", since a clash may never resolve (FQ55);
    - a line under "Your days are confirmed." for when there was no clash, in place of "Confirmed days will go ahead.";
    - how you are marked in a list of names ("Ben and Debby · You");
    - VoiceOver naming New York once, not twice, when it reads the club line and its hours;
    - one order, local time first, everywhere you see times while travelling;
    - the club list's count, and its rows for an open day and for a club with no day yet.
- **States:**
    - section 6's three;
    - how VoiceOver hears a refused confirmation;
    - one hierarchy for the waiting card, with the date leading, whether or not the local date matches the club's: frame 10 drops its date line and leaves the countdown as the only strong text;
    - whether the lines above a list scroll;
    - in dark mode, a selection circle on your own row that can be seen against the row;
    - what the club list offers for a suspended club (question A).
- **Files:**
    - a complete list of replaced lines, without the two that point at nothing;
    - the fixture-only templates marked as examples;
    - a kept-dates example with the year, and one form;
    - what "no clear year context" means;
    - for seven replaced component rules, what each replacement covers;
    - the moment G05-local-times shows.

I can write handoff 7 from this list whenever you want it.

## 8. For the ios thread

`handoff-6-findings.md` has every finding, with its evidence and what the app does meanwhile. The main points:
- **Inventory (`design/reference/INVENTORY.md`, in the design PR that brings handoff 5 in after #13):**
    - First apply the handoff 5 check's section 8: its seven renames, added rows and note fixes (X-08). Then set these 14 rows to received at B2, with `screens/<name>.png`, the source "Handoff 6" and each one's fixture: G04-conflict-three, G04-contested-other, G04-confirm-refused, G04-two-days-one-chosen, G04-confirmed-many, G05-schedule-choose-own, F01-friends-first-days, G05-local-times-same-zone, H01-travelling-dateline, F01-friends-travelling, F01-unavailable, M01-access-lost, G06-switcher-unavailable, G05-club-details-paused. Update the Counts section.
    - Give G04-contested-other its own row. Keep the handoff 5 check's rename of G04-conflict-others to G04-confirmed-others, and cross-reference the two in their notes. Merge nothing (X-10).
    - H01-confirm-days: received from handoff 6; the redraw is done, so drop the "handoff 6 asks a redraw" note.
    - H01-confirm-days and the 11 redraws: move each row's source and render to handoff 6, with the earlier source in brackets (X-09):
        - H01-confirm-days, G04-change, G05-schedule-review, H01-travelling, H01-unavailable, H01-access-lost and G05-local-times: "Handoff 6 (5 before)";
        - G04-conflict: "Handoff 6 (5, 3 before)";
        - G04-one-day and G04-two-days: "Handoff 6 (5; 2.1 #03/#32 before)";
        - F01-friends: "Handoff 6 (3; 2.1 #07 before)";
        - G05-schedule: "Handoff 6 (3 before)".

      G04-confirmed-others, G05-members-proposed and G06-switcher-status keep handoff 5's frames, with handoff 6's words built. G04-confirmed takes its layout from G04-confirmed-many and G04-confirmed-others (X-09).
    - G05-local-times: handoff 6's frame is the open-day variant, and its moment isn't recorded. Keep handoff 5's frame as the reference for the sheet with no open day. Snapshot fixtures set `server_now` for both (X-07, WM-01).
    - Add rows at B2, built from spec:
        - G04-own-confirmed, G05-schedule-review-confirmed and G04-change-confirmed-review (X-11);
        - M01-first-days and F01-friends-unconfirmed (C-01).

      Mark M01-unavailable and F01-access-lost "built from spec, in the form of F01-unavailable / M01-access-lost (handoff 6)". Note the long countdown on H01-waiting and H01-sunday, the open-day variant on G05-local-times-same-zone, and the same-date variant on F01-friends-travelling. Note C01-picker's row for a member with no day (X-15).
    - From the handoff 6 brief's section 5, still to do:
        - add the open Home while travelling as its own row, B5;
        - put F02-upcoming-travelling at B4;
        - keep H01-paused-own-day built from spec;
        - make the handoff 5 check's notes on G04-conflict and G06-switcher-status point at G04-contested-other and G06-switcher-unavailable.
    - Record on each row the differences it keeps from its frame. Section 4's items come from these findings: 1, F-01, V-01 and X-01; 2, F-08, F-09, V-05 and V-14; 3, F-05, X-02 and R-06; 4, F-05, F-11, V-10, VM-02 and VM-03; 5, V-09, F-07 and X-06; 6, F-06, V-02, V-03, CM-02, FM-01 and X-21; 7, WM-02, V-11 and X-17; 8, W-05; 9, W-06, R-05 and V-08; 10, FM-02; 11, WM-04; 12, W-01 to W-03, X-03, X-04, X-18, X-19, R-10, RM-01 and WM-05; 13, F-04, W-11, V-07, CM-01 and VM-01. Also record what F-10, F-12, F-14, F-15, V-15 and C-04 note on their rows, and put R-01's two meanings of "proposed" and the year rule (W-07, X-20) in Known differences.
- **Questions (`docs/QUESTIONS.md`, same PR):**
    - FQ2: record the founder's answer of 4 November 2026 at 00:22 UTC. Handoff 6's redraws of G04-one-day and G04-two-days are now the reference, with the circle kept on proposed days (X-01, X-13).
    - First apply the handoff 5 check's section 8 for the questions too; FQ50 is only there. Leave out of FQ48 that check's sentence "Only the day-picking screens name who hasn't confirmed yet" (its section 4, item 10), which section 5's first point corrects. Then FQ46, FQ48 and FQ55: write them as the handoff 6 brief's section 2 states them. Add handoff 6's rules that three or more can share a day and nobody confirms while two or more hold it, and that a member outside a clash can join it and then sees the names (X-13). Add section 5's first point: who hasn't confirmed can be seen (R-03, R-04, WM-03).
    - FQ79: the brief's Default with handoff 6's exact reading: instants compared, at least 24 elapsed hours, exactly 24 qualifies, DST through the club's zone. It applies to days a confirmed membership change adds too. Needed by B2. Server tests with fake clocks: exactly 24 hours, one second short, the spring and autumn clock changes, and a membership change confirmed less than 24 hours before a new day's first 7 AM (X-12, X-14).
    - FQ53: note that the redrawn H01-confirm-days is still one of its plain screens (V-12). Leave the denial screens out: T9 and T24 allow nothing of the club there, so their plainness isn't the founder's call.
    - FQ57 and FQ16: as the brief's section 2 restates them; no new FQ.
    - FQ44's notes: the year rule (X-20).
    - Add section 5's A to D as FQ80 to FQ83, in that order (reserved by the coordinator).
- **Copy:**
    - Take each screen's words from handoff 6's `screen-copy.json` and the `handoff6` keys, falling back to `handoff5`.
    - Treat every earlier key that a later key takes over as historical, named in the replacement lists or not (W-01, X-03, RM-01).
    - Never use `calendar.assigned`, `calendar.hoursZone`, `calendar.context.zoneOnly`, `details.footer.zoneOmitted` or `friendsRow.allRowVoiceOverLabels` (W-02, X-04, R-10, W-03), in snapshots too: over WM-05, snapshot fixtures give the pair a club name and Kitchen table its zone, and the inventory records that difference from the frames. `handoff5.calendar.confirmed.title.many` is the one key for "Your days are confirmed." (X-18).
- **Rules kept:** treat the seven unscoped component replacements as whole replacements of their handoff 5 entries, and keep handoff 3's G04-change largest-text rule: no columns, no font shrinking, the footer grows and the body scrolls (W-08, X-19).
- **Where findings disagree,** take:
    - the critic's six rulings, at the end of the findings file: Club details kept and sent to the neutral denial (over F-03 and X-05); handoff 3's Friends footer (F-08, over X-06); kept dates with a middle dot (F-05 and X-02, over W-04); V-09's 32-point gap on the denial screens (over F-07); FM-02's scrolling header, with See schedule pinned on Friends; one waiting card from the book's geometry (over V-02 and CM-02);
    - X-21 for the waiting card's date line: drawn only when the local and club dates match;
    - X-17's corrected action: the wordmark is a non-interactive image labelled "Tadayo", with no header trait;
    - W-07 and X-20 for the year: every spoken full date and both local-times sheets carry it, kept dates, starts and boundaries always do, and visible Home and Friends dates in the current year don't.

  V-04 was refuted: the denial header's replacement is stated. R-01 and R-05 were downgraded from must: the app builds both as delivered, and R-05's route is item 9 of section 4.
