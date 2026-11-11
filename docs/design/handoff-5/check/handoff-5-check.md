# Design handoff 5: the check

*4 November 2026. This checks Claude Design's answer to handoff 5. Five independent reviews read the delivery:*
- *against the brief's 13 frames;*
- *against its written questions and its return rules;*
- *against the copy, privacy and product rules;*
- *for the brand, the visuals, native iOS and accessibility;*
- *for consistency with handoffs 3 and 4, the files, the inventory and the open questions.*

*A second reviewer then tried to refute each of the 97 findings. None was refuted: 69 were confirmed and 28 corrected. The second reviewers found 20 more, and a last reviewer looked for anything missed and found 11. Many describe the same issue from different sides. Two more reviewers then checked this report. Every finding, with its evidence, is in `handoff-5-findings.md` beside this file.*

## The answer

**Claude Design did almost everything the brief asked:**
- all 13 frames, titled and in order, plus a replacement component sheet;
- every question answered in writing;
- every interim reading followed as the brief set it, including a clash as the people who chose the day see it and as everyone else sees it;
- the made-up fixtures used exactly, with the dates and times right (London is five hours ahead of New York that week);
- a template for every string the brief listed.

It missed three things:
- the redraws of the book's two day-picking screens changed some lines the brief said to keep (section 3);
- its list of which earlier lines it replaces is incomplete (section 4, item 11);
- the spacing is named for most screens, not all.

It fixed what the check of handoffs 3 and 4 raised:
- the clash is no longer in error red;
- one day-picking design now covers the one-day, two-day and clash screens;
- VoiceOver labels start with the button's own words;
- the card's status line and lock are settled.

The brand is untouched. Tokens, icon, wordmark and font are byte-identical to revision 1.1. Every colour is a 1.1 token, apart from the drawn phone's camera cut-out. The only photographs are the book's own. The copy lint finds nothing: no "Sent", no inferred pronoun, no exclamation mark. A few lines still aren't plain or exact, such as "Revisit Your Monday" and "New York and New York" (section 4).

**Your call, now made (section 3):** handoff 5's day-picking screens replace the book's two. You chose this on 4 November 2026 at 00:22 UTC.

**Three things the app won't build as written (section 4):**
- **The countdown in VoiceOver.** VoiceOver would read it as "5 hours 59 minutes until opening", a number that changes every minute. The rules say a countdown announces the opening's date and time (T47), so the app says that.
- **The waiting card in dark mode.** Its date plaque and the friend's initial would be dark on dark: 1.2:1 and 1.5:1, where text needs at least 4.5:1. The app uses the readable pairings.
- **The two-person club's name.** Its line reads "Ben and Debby · New York". The app shows the club's own name, as decided after handoff 4.

Section 4 lists the smaller ones.

**One line must change before its screen reaches TestFlight.** The Home shown before any day is confirmed says "The club's week will appear here after a day is confirmed." It won't: Home will show the next confirmed day. The next brief rewords it.

**Nothing else blocks the build.** About 15 states exist only in words (section 6). The app builds them from the rules and marks them "built from spec". A later brief can draw them and settle the smaller points (section 7).

## 1. What arrived, and where it is kept

- **The files:** `Tadayo_Handoff_5_Pack.zip` (44 files) and `Tadayo_Handoff_5_Days_and_Home.pdf` (12 pages), in `design/handoff-5/export/`.
- **The checks on the files:**
    - The PDF you attached is byte-identical to the one in the zip, and the pack's own checksum list verifies.
    - The manifest's checksums match all 28 frame files.
    - There are no scripts.
    - Apart from the font licence's links to its own sites, the only links are to the repository's own pages. Claude Design read the repository at commit bd3bd80, before ADR-027 and the open design PR #13.
- **Its files include handoff 4's.** The copy and component files keep every entry from handoff 4 unchanged, and add new ones only under `handoff5`. So they replace handoff 4's files.
    - The component sheet keeps everything on handoff 4's sheet, except the two card samples whose status line and lock the brief asked to fix.
    - It adds the day-picking rows.
- **When it enters the repository:** through the ios thread, in a design PR after #13.

## 2. What came back

| Screen | What it shows |
|---|---|
| G04-conflict | Ben's view: "You and Debby chose Friday." Friday reads "Contested", with Ben and Debby named and Confirm Friday greyed out. Monday, which Ben left, reads "Available", with "Proposed for you" seen only by Ben. Confirmed days show a check and "Confirmed". |
| G04-confirmed-others | Maya after confirming: "Your day is confirmed." Friday reads "Contested" and "No reveal scheduled", with no names. Monday names nobody. |
| G04-change | Grouped by person, as drawn and as spoken: Ben's and Debby's kept dates to Sunday 15 November, then the proposed week from Monday 16 November 2026 with Maya on Wednesday and Saturday. |
| G05-schedule-review | Ben and Debby's current week, read-only, with "Review the club's days" at the top. Maya appears only in the proposed week. |
| G05-local-times | Every coming day, opening and closing, in New York and in London. |
| G05-members-proposed | "Proposed roster" and "These names are a proposal, not an active member list." Ben's photograph, the others' initials, no count. |
| H01-confirm-days | "The club's days" and Choose your day, with no person, date or countdown. |
| H01-travelling | Nina's Saturday: "Opens 12 PM · London", then "7 AM · New York", and the same countdown as in New York. |
| H01-unavailable | "Club unavailable" and "This club isn't available right now.", with Choose a club and Get help. The header says "Choose a club", not the club's name. |
| H01-access-lost | "This club is no longer available." and "Choose a club to continue." Nothing of the club is shown. |
| G06-switcher-status | Sunday people "Not started", Kitchen table "Paused", with no count. |
| G04-one-day | The one design: Monday is Ben's choice; the others' days read "Proposed" and can still be chosen. |
| G04-two-days | Ben chooses Monday and Thursday; Debby's confirmed Tuesday and Friday can't be chosen. |

**Also answered in writing:**
- **The date plaque** belongs on Home and the cards, not on the day-picking screens, because a day nobody has confirmed has no date yet.
- **Clashes:** words for three or more people choosing one day.
- **Sunday:** one form everywhere.
- **Times while travelling:** for Friends and the upcoming day.
- **A suspended club or one you can no longer open:**
    - Friends and Memories say the same as Home;
    - + Add offers only private drafts;
    - the switcher calls a suspended club "Unavailable", and leaves out a club you can no longer open.
- **A paused club:** Home shows your own announced day until it closes, as my interim reading for FQ50 has it.
- **Where Ben confirms in the first days:** if other days are confirmed and Ben's isn't, Ben confirms from the club's week. Home shows the next confirmed day, with no reminder.

**Claude Design's comments on two of my interim readings.** Both are drawn as the brief set them, and both are still yours to decide:
- a clash can last indefinitely (FQ55);
- the first-days reading, where each day goes ahead once its person confirms it, needs screens that clearly show whose days are confirmed.

## 3. Your call: the book's two day-picking screens

**Your answer (4 November 2026, 00:22 UTC): use handoff 5's screens.** Under FQ2, handoff 5's G04-one-day and G04-two-days now replace the book's two as the reference. What follows is what you weighed.

Sending the brief said yes to redrawing them in the one design (FQ2). Claude Design also changed these, which the brief didn't ask for:
- **The plaque:** "MON 09" is gone. The reason given: a day nobody has confirmed has no date yet.
- **The lines:** "A day for your friends to collect things for you." and "One shared opening time." are gone from both screens, with no reason given. The one-day screen also loses "THE CLUB'S WEEK", and the two-day screen "Sunday is for revisiting."
- **The titles:** "Your Monday." became "Choose your day", and "Choose your two days." became "Choose your days".

**The cost:** the screens lose one of the book's own objects, and the line that says what a day is for.

**Why I still recommend keeping handoff 5's version:** book p10 and p11's rules still hold: the week, the club's zone and hours, and whose day each one is. The plaque stays on Home and the cards, where a day has its date. The two-day screen is drawn only with two days chosen; the app keeps Confirm greyed out until two are chosen (book p11).

**The other choices:**
- the next brief brings back the plaque, the lines, or both;
- the app keeps the book's two screens, and uses handoff 5's design only for a clash.

**Until you answered,** the app was to build handoff 5's version and keep the book's renders as the reference. That no longer applies.

## 4. Where the app follows the rules instead of the delivery

1. **The countdown in VoiceOver.** It speaks the opening's date, time and zone, both zones while travelling, and isn't re-read every minute (T47).
2. **The waiting card in dark mode.** The plaque and the initial use their own readable colours.
3. **The two-person club's line.** It shows the club's own name.
4. **"Up next".** Home's label says "Up next", as the book's Home renders do. Friends, spec 08 and the book's text say "Next up". The app says "Next up" everywhere (spec 03: one noun).
5. **"New York and New York".** When you're not travelling, VoiceOver's extra line on View local times names the same zone twice. The app leaves that line out then.
6. **"Revisit Your Monday".** The capital Y is written small inside a sentence.
7. **"Selected, selected".** VoiceOver would say "Selected" twice in the club list. The app says it once.
8. **Travelling across a date line.** Far east of New York, Nina's Saturday at 7 AM in New York is already Sunday. The app writes a full date on each time line whenever the two dates differ.
9. **"The club's week will appear here".** Home will show the next confirmed day, not the week. The app builds that, and the line is reworded before it reaches TestFlight (T43, T49).
10. **The first days' week and Friends.** Nothing says how they show a member whose day is only proposed. In the club's week, that day reads "No reveal scheduled" with no name. In Friends, that member's row shows no date. Only the day-picking screens name who hasn't confirmed yet (FQ48).
11. **The copy file's list of replacements.** Maya's new days point at "Unchanged", and dozens of earlier lines aren't marked as replaced. The app takes each screen's words from handoff 5's frames, with this section's changes.
12. **The past-day card.** It's restyled on the travelling Home only. The app keeps the book's card on every Home until a later brief settles it (FQ2), with handoff 5's words.
13. **Spacing and native controls.** The app uses the named spacing, the nearest step on the book's scale where none is named, and iOS's own sheets, lists and toolbars. Where a frame differs by a few points, the inventory says why.
14. **Drafts for a club you can no longer open.** A draft marked for that club is shown without the club's name, person or date, and nothing in it is lost.

## 5. Points for you, none urgent

- **FQ46 can't always hide a clash.** Once everyone outside a clash has confirmed, the names in the week leave only the people in the clash unnamed, as in the six-member fixture. So hiding the names on the contested day doesn't then hide who is in it, in any form. This is worth knowing when you answer FQ46. The app builds it as drawn.
- **A new question: how soon a newly confirmed day can open.** No rule sets a lead time. A day confirmed at 6:59 AM could open a minute later, with nothing in it. Spec 04 forbids silently providing "an instant first reveal", which points the same way. My interim reading: a newly confirmed day first opens on the first of its dates whose 7 AM is at least 24 hours away. So a Monday confirmed on Saturday afternoon first opens two days later, and one confirmed on Sunday afternoon eight days later. Tell me if a day should be able to open sooner. It is FQ79.
- **"You and Ben chose Friday".** Under my interim reading of FQ48, a day proposed for someone counts as that person's choice. So someone who never opened the screen can be told they "chose" Friday. A later brief asks for wording that stays true.

## 6. Described in words only

These have rules but no frame. The ios thread adds each to the inventory and builds it, marked "built from spec". Most have their own words. Four have none yet: a refused confirmation, the two-day screen with one day chosen, a contested day seen by someone who didn't choose it, and the open day's closing time while travelling. For those, the app reuses delivered lines, writes none of its own, and the next brief asks for the words.
- **The day-picking screens:**
    - a clash between three people;
    - "Your days are confirmed.";
    - a contested day seen by a member who hasn't chosen it;
    - the two-day screen with only one day chosen;
    - a confirmation refused because the day became contested a moment earlier.
- **The club's week:**
    - Ben's own "Choose your day" row in the week;
    - the local-times sheet when you're not travelling;
    - the week and Friends during the first days, for a member whose day isn't confirmed (section 4, item 10).
- **Travelling:**
    - Friends and the upcoming day while travelling;
    - Home during an open day while travelling, whose "Until 1 AM" needs its zone.
- **A suspended club or one you can no longer open:**
    - Friends and Memories for that club;
    - the switcher's "Unavailable" row.
- **A paused club:**
    - Home with your own announced day;
    - Club details with its new "Invite someone" row, which FQ16's "an invitation restarts it" already allows.

## 7. For a later brief (handoff 6)

- **First, before H01-confirm-days reaches TestFlight:** a true line for that screen.
- **Frames:** the states in section 6.
- **VoiceOver:**
    - the countdown's label, and the travelling card as one spoken group;
    - a travelling Add hint;
    - a hint for a day you've already chosen;
    - the card's spoken label, with its author.
- **Dark mode:** the waiting card's plaque and initial, with dark samples of the new parts on the component sheet.
- **Words:**
    - one zone when both are the same;
    - full dates when the local date differs;
    - "your" inside a sentence;
    - one of "Up next" and "Next up";
    - G04-change's own Not now hint;
    - plainer "accessible days";
    - the clash line's template and wording;
    - how a draft for a club you can no longer open is shown.
- **Shape:**
    - one place for Not now;
    - Sunday's left edge on the change screen;
    - how filled day rows meet;
    - a one-line day row's height;
    - the club's hours and zone in one arrangement;
    - which past-day card is current;
    - a countdown longer than a day;
    - the unnamed gaps, on book p35's scale.
- **Files:**
    - a complete list of replacements;
    - a rule for when a date shows the year;
    - lists of kept dates of any length.

The H01-confirm-days line is the only urgent item. I can write handoff 6 from this list whenever you want it.

## 8. For the ios thread

`handoff-5-findings.md` has every finding, with its evidence and what the app does meanwhile. The main points:
- **Inventory (`design/reference/INVENTORY.md`, after PR #13):**
    - **Correction to the brief's section 5.** Seven of its nine "new" states already have rows in PR #13 under other names. Don't add duplicates. Rename those rows to the delivered titles, keep the old names in Notes, and delete nothing (X-01):
        - G04-conflict-others is G04-confirmed-others;
        - G05-proposed-roster is G05-members-proposed;
        - G05-review-days is G05-schedule-review;
        - G06-labels is G06-switcher-status;
        - H01-suspended is H01-unavailable, and moves from B6 to B2;
        - H01-lost-access is H01-access-lost;
        - H01-days-unconfirmed is H01-confirm-days.

      G05-local-times matches. Add a row for H01-travelling at B2. Then set all nine to received, with `screens/<title>.png` and the source "Handoff 5".
    - Fix three row notes (CM-04):
        - G04-conflict's "Names only to the two members involved" becomes "names only to the members who chose the day (FQ46)";
        - G04-confirmed gets "layout from G04-confirmed-others";
        - H01-paused points at H01-unavailable.
    - Point G04-conflict, G04-change, G04-one-day and G04-two-days at handoff 5's renders (X-02). The founder chose handoff 5's day-picking screens over the book's on 4 November 2026 at 00:22 UTC (section 3, FQ2), so the book's two are no longer the reference. Record that answer under FQ2 and in INVENTORY's notes for both rows.
    - Rewrite the Known-differences entries that handoff 5 replaces (X-03).
    - Add these rows at B2, built from spec (X-14, X-22 to X-26): G04-conflict-three, G04-confirmed-many, G05-schedule-choose-own, G05-local-times-same-zone, F01-friends-travelling, F02-upcoming-travelling, F01-unavailable, M01-unavailable, F01-access-lost, M01-access-lost, H01-paused-own-day and G05-club-details-paused.
    - Name rows in the design PR for the two-day screen with one day chosen (CM-05), the refused confirmation (C-03), the open Home while travelling (C-04) and the first days' week and Friends (X-27).
    - Add notes on G04-conflict (the contested day seen by someone who didn't choose it) and on G06-switcher-status (its "Unavailable" row).
    - Annotate G05-schedule, H01-awaiting-activation, H01-paused, H01-loading and G01-pending: their layout and spacing now follow handoff 5's contracts (X-28).
- **Questions (`docs/QUESTIONS.md`, after PR #13):**
    - Record FQ46, FQ48, FQ50 and FQ55 as the handoff 5 brief's section 2 states them, not as PR #13 records them from the handoffs 3 and 4 check and briefs (X-04 to X-07). FQ46 matters most: PR #13's text would show everyone else only "No reveal scheduled", and only two people the names.
    - Add frame 7's first-days reading beside FQ55 and FQ56.
    - Add to FQ48 the reading in section 4, item 10 (X-27).
    - Add H01-confirm-days to FQ53's plain screens (X-08).
    - Add section 5's new question as FQ79 (reserved by the coordinator), with its interim reading, needed by B2. Use section 5's reading, not C-06's.
- **Copy:**
    - Take each screen's words from handoff 5's `screen-copy.json` and the `handoff5` keys, except where section 4 changes them: "Next up", a small "your" inside a sentence, the club's own name, no zone hint when the zones match, "Selected" spoken once, and the countdown's label.
    - Treat the earlier keys they take over as historical, even where the replacement list doesn't name them (W-02 to W-04, X-09 to X-11, RM-01).
    - Map Maya's new days to `change.proposedRow.new.vo`, not "Unchanged".
- **Rules kept from handoff 3:** the day row's largest-text stacking and no lock; and the week's "no next dates, no Next up, no content signals" (W-07, X-12).
- **Where findings disagree,** take:
    - R-06 for travelling dates;
    - X-16 for start dates with the year;
    - FM-02 for "Next up";
    - F-10 for the past-day card;
    - VM-02 for G05's hours and zone on one line;
    - WM-05 for G04-change's Not now: no hint until one is written;
    - W-02 for H01-paused's Club details: no hint, not X-11's template;
    - V-17 for unnamed gaps: the nearest step on book p35's scale;
    - X-02 for G04-one-day and G04-two-days, now that the founder has answered section 3;
    - section 5's first-day reading (FQ79), not C-06's.

  F-14 isn't a defect: the status bar is presentation.
