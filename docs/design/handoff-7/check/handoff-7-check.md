# Design handoff 7: the check

*7 November 2026. This checks Claude Design's answer to handoff 7. Six independent reviews read the delivery:*
- *its phone frames against the brief, and its eight redraws against the earlier frames;*
- *item 17: the component sheet, the drop card's states, the highlight covers and the "Added" receipt;*
- *its written answers and its return rules;*
- *against the copy, privacy and product rules;*
- *for the brand, the visuals, native iOS and accessibility;*
- *against what the app already builds, the inventory and the open questions.*

*A second reviewer then tried to refute each of the 138 findings: 100 were confirmed, 37 corrected and 1 refuted. The second reviewers found 20 more, and a last reviewer looked for anything missed and found 3. Many describe the same issue from different sides. Two more reviewers, each followed by a second reviewer, then checked this report. Every finding, with its evidence, is in `handoff-7-findings.md` beside this file.*

## The answer

**Claude Design did almost everything the brief asked.** Besides the errors, the two failure lines and the redraws' extra changes below, its drop card parts miss two of your Defaults: the folded card's new date line fixes the US order and has no room for a year (FQ44), and the highlight sample gives Debby's pick Ben's colour (FQ41). That sample also puts Debby's portrait on Deborah-Anne, though the brief kept it for Debby. The app keeps your Defaults and the brief's rule (section 4, items 7 and 8). What it did:
- all 22 frames, titled and in order, with Ben, ben@example.com and the code 529614 as asked;
- every written question answered, with a key for every sign-in and profile string, the earlier ones included;
- your answer and Defaults used as stated: "Couldn’t verify the code. Try again." (FQ86, which you answered on 6 November), the start-up failures (FQ89), the tabs' loading and failure words (FQ90) and the drop card's words (FQ91);
- the drop card in all eight states, in light, dark and the largest text, with the highlight covers and the "Added" receipt;
- nothing that leaks. A hidden card shows other members only its sender, caption, opening time and a lock. VoiceOver reads the sender, the caption and the full opening date and time with the club's time zone, then "Hidden content". A removed drop shows only "This drop is no longer available".

The brand is untouched: tokens, icon, wordmark and font are byte-identical to revision 1.1, and the only photographs are the book's own. A check of every new string finds no inferred pronoun, and no "Sent" apart from "Sent to {email}", which you approved (FQ68).

**It also redrew eight earlier screens,** which the brief asks for only where an answer changes one:
- the email, code and code-error screens;
- the 18-or-older step and the profile;
- Home, Friends and Memories before a club.

Some changes follow from its answers, such as a "Leave sign-in" button at the top left of the 18-or-older step and the profile. Many don't: grey explanatory text turned black, and gaps tightened. Section 3 shows them. The app takes the changes that an answer, a rule or the component sheet explains, such as text buttons moving from the centre to the left, and keeps the rest until Claude Design explains them.

**Two errors, neither urgent:**
- The Memories redraw changes "Days shared after you join a club will appear here after they open." to "Days shared after you joined will appear here after they open.". That isn't true for someone with no club, so the app keeps the earlier line.
- The largest-text Home before a club drops its second line, "Create a club or open an invitation.". The app keeps both lines.

Two new failure lines, "Enter a valid email address." and "Choose a name with visible characters and no line breaks or hidden formatting.", don't say what failed, which T43 requires. The app keeps lines that do until they're reworded.

**The app has a lot to change.** The answers correct many readings the ios lane built from the spec while it waited. On the screens already on `main`, these include where a failed resend shows, the busy buttons, the exit from setup, focus on the profile, the "Loading your account…" wait and the header before a club. On the drop card branch, still in progress, they include the revealed photo's VoiceOver, the author's Highlight line and the receipt's tick, which now grows with the text. Section 8 lists them for the ios thread.

**Nothing blocks the build.** Section 5 has three new questions, FQ93 to FQ95, each with a default the app builds meanwhile, and three of your Defaults that Claude Design agrees with, which you can keep in one answer. One more thing: the pack twice says it leaves out a "guest-contribution/SMS proposal". The brief never mentions one. If you raised it with Claude Design, it's outside the spec; tell me if you want it written up as a question.

## 1. What arrived, and where it is kept

- **The files:** `Tadayo_Handoff_7_Pack.zip` (93 files) and the PDF inside it, `Tadayo_Handoff_7_B0_and_Drop_Cards.pdf` (18 pages). In the repository they go under `design/reference/claude-design/handoff-7/`, and this report and its findings under `docs/design/handoff-7/`, when the ios thread adopts them.
- **The checks on the files:**
    - The pack's own checksum list verifies for all 92 files it lists. The frames are 29 phone frames at 393x852 points and the component sheet, each as SVG and PNG, titled and in the brief's order.
    - There are no scripts.
    - Claude Design read the repository at today's `main`.
    - The brief copy inside the pack is the latest version of the brief, the one with the drop card's later points and the receipt.
- **Its files include handoff 6's.** The copy and component files keep every handoff 6 entry unchanged and add new ones only under `handoff7`, so they replace handoff 6's files. The component sheet keeps all of handoff 6's sheet element for element, with handoff 7's parts added below it. Its PNG draws the sheet's one transparent band black, so use the SVG there.
- **Two new font files,** fixed regular and bold versions of the same Arimo font, under its licence. Arimo only stands in for the iPhone's own font in the frames; the app doesn't use it, so nothing changes.
- **Pictures beside this file:**
    - `contact-sheet-1-11.png` and `contact-sheet-12-22.png`: the new frames;
    - `redraws-before-after.png`: each redraw to the right of its earlier version;
    - `sheet-b0-components.png`, `sheet-drop-card-states.png` and `sheet-highlight-and-receipt.png`: the new parts of the component sheet.
- **When it enters the repository:** through the ios thread, in the design PR that adopts handoff 7 (section 8).

## 2. What came back

| Screen | What it shows |
|---|---|
| 1 A02-email-empty | The email field focused and empty, with the placeholder "Email address" and the keyboard up. Send a code is greyed out. There's no back arrow. |
| 2 A02-email-sending | ben@example.com stays in the field, which can't be edited while it sends. Send a code shows a small spinner before its words. |
| 3 A02-email-failed-network | "Couldn’t send a code. Check your connection and try again." under the field, with an icon and no red border, since the address isn't wrong. Send a code moves down and works again. |
| 4 A02-code-verifying | 529614 in the field, Verify code busy, Change email address greyed out. |
| 5 A02-code-verify-failed-network | "Couldn’t verify the code. Check your connection and try again." in the two lines kept for code errors. The digits stay, and Verify code works again. |
| 6 A02-code-resend | A minute later: Send a new code replaces the waiting sentence. |
| 7 A02-code-resending | "Sending a new code…" with a small spinner. Verify code and Change email address are greyed out. |
| 8 A02-code-resend-failed-network | "Couldn’t send a new code. Check your connection and try again." in its own block under Send a new code. |
| 9 A02-age-failed-network | "Couldn’t save your age confirmation. Check your connection and try again." above I’m 18 or older, with "Leave sign-in" at the top left. |
| 10 A03-profile-empty | "Leave sign-in" at the top left; an outline of a person in the photo circle, since no name is typed yet; the name field focused with the keyboard up; Continue greyed out just above the keyboard. |
| 11 A03-profile-failed-network | "Couldn’t save your profile. Check your connection and try again." under the field, with "Ben" kept. The screen is scrolled up so the field and the line stay above the keyboard. |
| 12 global-launch-failed-network | "Couldn’t load your account." and "Check your connection and try again." with Retry, and no header or tabs. |
| 13 H01-loading-no-club | The header (wordmark, + Add, Ben's initial), a spinner and "Loading Home…". No Private drafts row while it loads. |
| 14 H01-error-no-club | "Couldn’t load Home." and "Check your connection and try again." with Retry just above the tab bar. |
| 15 F01-loading-no-club | As frame 13, with "Loading Friends…". |
| 16 F01-error-no-club | As frame 14, with "Couldn’t load Friends.". |
| 17 brand-components | Handoff 6's sheet, then the busy button, fields and failure lines, the header at the largest text, the photo circle with no initial, the drop card's eight states, the highlight covers and the receipt, each in light and dark. |
| 18 A02-code-error-dark | The code error in dark. |
| 19 A02-code-error-xl | The code error at the largest text, scrolled with the field at the top and Verify code just above the keyboard. The rest of the error, Send a new code and Change email address continue below in the scroll. |
| 20 A03-profile-empty-xl | The profile at the largest text: the name field and Continue above the keyboard, the title and photo above them in the scroll. |
| 21 G06-no-club-dark | Home before a club, in dark. |
| 22 G06-no-club-xl | The same at the largest text. The header takes two rows, with + Add on the left. The second line is missing (section 4). |

**Also answered in writing:**
- **Server refusals:** each connection failure has a refusal line in the same place, such as "Couldn’t send a new code. Try again.". If a code error is showing when a resend fails, both stay, each in its own block.
- **Leaving setup:** "Leave sign-in" at the top left of the 18-or-older step and the profile, with no question before leaving. It is inactive while a save runs.
- **A sign-in that ends:** A02-email shows "Your sign-in ended. Enter your email to sign in again." as a plain notice, not as an error.
- **While Tadayo starts or leaves:** the launch screen itself shows only the background colour. Once the app can draw, it shows a spinner with "Loading your account…" or "Leaving sign-in…", which corrects the app's reading that the launch screen stays up.
- **The profile:** "Use 40 characters or fewer for your name." for a name that's too long.
- **The header before a club:** it scrolls with the content on iOS 17, 18 and 26, and a band of the background colour stays behind the status bar once it has scrolled up.
- **A long address in "Sent to {email}":** it wraps at the full width and may break inside the address.
- **VoiceOver:** words for every busy state, failure and change of the resend row, each said once. None moves focus, except that a successful resend returns focus to the code field, as the app already does.
- **The drop card:** the revealed photo is read as separate parts (the sender, the caption with a Copy caption action, then the photo), and the author's own Highlight goes on its own line under the caption.

## 3. The eight redraws

The brief asked for an earlier frame again only where an answer changes it. It said the app follows six points over the earlier frames, such as the curly apostrophe and the named spacing, and not to redraw a frame for those alone. Claude Design redrew eight, saying they make sign-in's entry and exit, its spacing and the header before a club consistent with its answers (`redraws-before-after.png`). No answer is behind the code screen's or the code error's redraw, and the others change more than their answers explain.

**What the app takes from them,** because an answer, a rule or the sheet's own current sample explains it:
- no back arrow on A02-email;
- "Leave sign-in" at the top left of the 18-or-older step and the profile, replacing the arrow and the lower link;
- the profile's name field focused on arrival, with Continue just above the keyboard;
- the header's new tap areas, with + Add on its own row at large text sizes;
- page titles 32 points under the header on Friends and Memories;
- text buttons such as Send a new code, Change email address, Go to Home and the profile's Add photo on the left, as the sheet's sample draws them, with Optional under Add photo as frames 10, 11 and 27 draw it;
- the Private drafts row's folder 16 points in, as the sheet's sample draws it.

**What it keeps until Claude Design explains it:**
- the grey of explanatory lines, such as "We’ll send a six-digit code to sign in." and the empty tabs' lines, which the redraws turn black while "Sent to {email}" and other grey lines stay grey;
- the gap under "Sent to {email}", which the code screens cut from about 40 points to about 7;
- the earlier gaps on the 18-or-older step and the tabs before a club;
- the profile's earlier gaps above the photo circle and between Optional and the name's label;
- the code screen showing an empty field when it opens. The A02-code redraw shows a typed code instead, so the inventory keeps handoff 1's frame for that moment;
- Memories' line "Days shared after you join a club will appear here after they open." (the error above).

## 4. Where the app follows the rules instead of the delivery

1. **Memories before a club** keeps "after you join a club". The new line has no entry in the list of replaced lines, and it isn't true for someone with no club.
2. **Home before a club at the largest text** keeps both lines. The frame drops the second; the default and dark frames keep it.
3. **Failure lines name what failed** (T43). For an address or a name the server refuses, the app keeps "Couldn’t send a code. Try again." and "Couldn’t save your profile. Try again." until Claude Design rewords its two lines. The name's line also doesn't cover a name over 40 characters.
4. **Back can't be used while a code is checked or a new code is requested.** The delivery's written rule says so, and the app hides Back then, as it does today. Frames 4 and 7 draw it active.
5. **The tabs' failure titles** keep the size of handoff 6's "This club is no longer available.", which your Default for these tabs names (FQ90). Frames 14 and 16 draw them larger, and "Couldn’t load Memories." would then wrap.
6. **Gaps the delivery writes down win over the frames,** where the frames differ: 12 points from a field to its error line, which the frames draw at about 5 to 18. Verify code is the other way round: the written rule pins it just above the keyboard at every size, but every frame at the usual text size draws it in place. The app keeps it in place, as those frames do, and pins it just above the keyboard only where the keyboard would otherwise hide it, as frame 19 does. Section 7 asks which holds.
7. **Dates on the folded card** keep one date that follows the phone's region, with the year where the year rule under FQ44 calls for one, such as a date outside this year (FQ44). The delivery's new template, "Opens {weekday}, {monthDay} · {time}", fixes the US order and has no room for a year.
8. **The highlight covers:**
    - each cover's VoiceOver name stays "Open {name}’s highlight", such as "Open Maya’s highlight", as T47 sets it. The delivery's own words for the covers ("Debby’s pick", "Your pick") don't say the cover opens anything;
    - the colours follow roster order, as your Default sets them (FQ41). The sample gives Debby's pick Ben's colour;
    - the long-name sample keeps an initial. The sample gives it Debby's portrait, which the brief kept for Debby alone;
    - every tile and row keeps its folded corner and the sizes the delivery writes down. The sample draws the tiles and the row with round corners and only a crease, Ben's tile with no fold at all, and the row taller.
9. **The receipt** keeps the spacing the delivery writes down (12 points at the top); the sample draws 16.
10. **A draft row** keeps its arrow, as 2.1's C05-drafts draws it, since tapping the row opens the draft. The sample leaves the arrow out without saying why, so section 7 asks.
11. **The start-up and tab failures** are announced as their title and line together. Some of the delivery's VoiceOver keys hold only "Check your connection and try again.", which says nothing about what failed.
12. **The profile at the largest text:** frame 20 has an empty band of about 166 points between Optional and the name field's label. The app keeps the content continuous.
13. **Smaller points:** the header's initial and the profile's initial keep their type sizes; the photo circle doesn't announce "No profile photo" until Claude Design says which part speaks it; at the largest text the app's line reads "Sent to ben@" over "example.com", which fills the width, where frame 19 has three lines: "Sent to", "ben@example" and ".com".

## 5. Points for you, none urgent

- **FQ58, Home while loading before a club.** Your Default shows only the club's name and your own photo until the server answers. With no club and no photo, the app shows your initial in the photo's place, as the frames do, and Claude Design says it may show once your own account has loaded. The question stays yours to answer.
- **Claude Design agrees with three of your Defaults by name:** the start-up failure words (FQ89), "This version of Tadayo can’t show clubs yet." (FQ90) and the drop card's words (FQ91). Its answers also fit FQ69 (finish setup or leave) and FQ70 (a name of 1 to 40 characters) without naming them. Agreement doesn't answer them for you. One difference: its tab failure frames draw a larger title than FQ90's form (section 4, item 5), and keeping FQ90 keeps your form. If you're happy with the three, say "keep FQ89 to FQ91" and I'll record it.
- **Three new questions, each with a default the app builds meanwhile:**
    - **A (FQ93). Does Leave sign-in keep the address you typed?** Leave sign-in, on the 18-or-older step and the profile, takes you back to the email screen. Claude Design keeps your address filled in there, held in the app's memory and never saved, so signing in again with the same address needs only a new code. The app opens an empty field, so nothing of the account you left stays on screen. Either way, the app keeps the address after "Couldn’t keep you signed in.", as your Default does, and after the server ends a sign-in, if the app still has it, as the delivery says. Default: an empty field after Leave sign-in. Needed by B0.
    - **B (FQ94). Who marks a photo as a text screenshot?** The book asks that a screenshot of text show whole, not cropped (book p27), and the delivery fits it inside the photo frame. But nothing says how the app knows a photo is a screenshot. There are two ways. The sender marks it when adding it, which adds a choice when adding a photo. Or the server decides from the photo itself, with no step for the sender. Either way, other members learn it only from 7 AM: before then, only whether it's a photo or a video may leave the server (T10). Default: every photo fills the frame, as built, so a screenshot loses its edges until you answer. Needed by B5.
    - **C (FQ95). Before B6, does the revealed photo show its later buttons?** The revealed photo arrives in B5. Its ··· menu, heart, comments and Save work only from B6. Showing them, doing nothing yet, keeps the photo as designed, as you chose for B0's screens (FQ85), but tapping them does nothing for one stage. Leaving them out, as Claude Design suggests, shows a plainer photo until B6. Default: show them, doing nothing yet. Needed by B5.

## 6. Described in words only

These have words or rules but no frame. Most already have a "built from spec" row and are built: the ios thread updates those rows' words and source to handoff 7, and adds rows, marked "built from spec", only for the new states X-33 lists, such as the "Leaving sign-in…" wait and a resend failure under a code error:
- **the start-up waits:** "Loading your account…" and "Leaving sign-in…";
- **failures with no frame:** Leave sign-in that couldn't finish and a sign-in the phone couldn't keep, with their lines (FQ89); the refused versions of each sending, saving and loading failure; the code check when the sign-in service can't answer (FQ86's line);
- **A02-email-signed-out:** "Your sign-in ended. Enter your email to sign in again.";
- **the profile's long-name line:** "Use 40 characters or fewer for your name.";
- **Memories while it loads or fails before a club,** in the same form as Home and Friends;
- **a resend failure while a code error shows:** both blocks at once.

## 7. For a later brief

None of this is urgent. It can go in a short follow-up brief for B0, which I can write whenever you want it.
- **First, the two errors:** the Memories line and the missing line at the largest text.
- **Words:**
    - the refused address and the refused name, each naming what failed, with the name's line also covering a name that's too long;
    - VoiceOver keys that hold only the second line;
    - whether "Leaving sign-in…" fits when the server ended the sign-in and you did nothing;
    - each highlight cover's VoiceOver name and hint, within T47;
    - which part of the profile says "No profile photo";
    - the folded card's date as one date with an optional year, and room for a year on the upload rows and the receipt.
- **The redraws:** explain or undo the changes section 3 keeps, and name the gaps they use; confirm the two the app takes from the sheet's sample alone, text buttons on the left (with the profile's Add photo and Optional on the left under a centred photo circle) and the Private drafts folder 16 in, and list them under replaces.
- **Frames:**
    - frames 4 and 7 with Back unavailable, and whether it is hidden or greyed out;
    - frame 20 with continuous content;
    - the tabs' failure titles at the size your Default names (FQ90), or why frames 14 and 16 draw them larger, and why frames 12, 14 and 16 draw the line under the title black where the earlier screens draw it grey;
    - one rule for Verify code above the keyboard;
    - the two start-up waits and the signed-out notice, which have no frame;
    - a corrected highlight sample, with roster colours, folded corners and the long name's initial;
    - the receipt's spacing, and its tick at the largest text (drawn 64 points, smaller than growing with the text would make it);
    - the draft row with or without its arrow.
- **Smaller points:** the field-to-error gap the frames draw; whether the leading text actions reach beyond B0; Home's two announcements in a row; the loading shell's place, about 25 to 32 points higher than handoff 3's; whether the start-up spinner waits a moment before it shows; the stretched coffee photograph and Maya's crop; the dark avatar sample's labels; the folded card's sender gap and its avatar at the largest text; the upload caption's darker ink; and the samples' missing year.
- **Later stages:** where the receipt shows on Home and in the share extension, and whether the failed row's Retry replaces the screen's (B4); a card with no caption and what VoiceOver reads for it (B4); whether a club's header moves as the header before a club now does (B2); the unsaved bookmark (B6).
- **Files:** screen-copy's missing hints, entries in the replaced list for the keys that repeat earlier ones, and a scope for each replaced component.

## 8. For the ios thread

`handoff-7-findings.md` has every finding, with its evidence and what the app does meanwhile. The main points:

- **Changes to what's on `main`, in the slice that adopts handoff 7:**
    - **Busy buttons** (`PrimaryButton.swift`): a 16-point indicator 8 before the centred label in two fixed 24-point slots; at large text, where the indicator and the label don't fit on one line, the indicator moves to its own centred row, which the button reserves when idle too, so nothing moves when it turns busy; the value "In progress", one announcement per action, and the field read-only (not disabled) while busy (D-13, X-15, W-06).
    - **A02-email** (`SignInFlow.swift`): the placeholder "Email address"; the signed-out notice above the field after a server-ended sign-in only, with the address kept if the app still has it (X-16, W-10, R-06). For a refused address, keep "Couldn’t send a code. Try again." (R-01).
    - **A02-code:**
        - a separate resend failure in `SignInModel`, shown in its own block 8 under the resend row, which no longer clears a code error;
        - the resending row as a native indicator plus "Sending a new code…" in textAction and secondaryText;
        - the resend row 8 under Verify code, with Change email address straight after it;
        - the availability and success announcements;
        - the error region's bottom padding 16;
        - Back still hidden while busy;
        - Verify code pinned 12 above the keyboard only where it would otherwise sit under it.

      Sources: X-17, W-07, F-12, VM-04, V-03, F-09, W-02.
    - **Text actions** leading at the 20-point inset, keeping the full-width 44-point target, and the resend row's waiting and resending lines leading too, which aren't text actions (X-25, the critic's ruling on F-06). A03's Add photo and Optional also go leading under the centred avatar (X-25, VM-03 over F-07; the critic's ruling names only the resend and Change email rows).
    - **A02-age** (`AgeScreen`):
        - one leading toolbar text action "Leave sign-in", disabled while saving, with no alert;
        - remove the chevron and the footer link;
        - the age lines and "Saving your age confirmation." announcement;
        - at least 16 between the failure line and the button, which ends 44 above the safe area.

      Sources: F-10, F-13, X-18, R-07, WM-02.
    - **A03** (`ProfileScreen`):
        - the same Leave sign-in;
        - the field focused on arrival, but not when VoiceOver is running (C-01);
        - Continue 12 above the keyboard and 44 above the safe area without it;
        - failures in the scroll content 12 under the field;
        - the too-long line, with the name never cut at 40;
        - the placeholder "Your name";
        - the field read-only and Add photo and Leave inactive while saving.

      For a refused name keep "Couldn’t save your profile. Try again." (X-19, F-11, VM-01, VM-02, BM-02, R-01).
    - **Avatar** (`Avatar.swift`): an initial only from a first letter or decimal digit; otherwise the outlined person symbol at 56% (D-14, X-20).
    - **Root:**
        - split the start-up route into loading and leaving, each with the native indicator over "Loading your account…" or "Leaving sign-in…", announced once, with no header or tabs;
        - the launch screen stays canvas only;
        - in `RootFailure.swift`, the title where the sign-in titles sit, Retry 44 above the safe area, and its hints.

      Sources: X-21, W-09, R-09, V-14, X-22.
    - **The header before a club** (`NoClubHeader.swift`, `TabScroll`):
        - + Add at [241,56,80,44] and Account at [329,56,44,44], with the avatar at [337,64,28,28], on every tab with no club; the delivery's replaced scope also covers handoff 6's denied header, which takes the same rectangles when B2 builds it (W-13);
        - stack at every accessibility size, with + Add leading;
        - an opaque canvas band behind the status bar;
        - Account's hint header.accountHint (FQ85).

      Sources: X-23, D-15, W-13, VM-05, W-12.
    - **Tabs:** page titles 32 under the header (F-15); the Retry hints per tab (W-12); Private drafts' folder 16 in (BM-01). Keep emptyTitle 25 for the failure titles (F-04, the critic's ruling over X-24 and WM-03).
- **Changes on `ios/b0-drop-card`, before its PR:**
    - the author's Highlight on its own line 12 under the caption (D-03, X-27);
    - the revealed item as a container: the sender (avatar hidden), the caption as selectable text with a Copy caption action, and the photo read as "Photo." or "Photo. Highlight." (D-04, X-32);
    - the receipt's disc and check scaling with row from 28 and 12, the disc's top level with the title's, and the hint on Make my highlight; the announcement once per commit at B4 (D-05, X-26, V-10). The fixed 28 and 12 were the lane's own reading, so the delivery wins. Keep the receipt's written insets (D-06, X-09);
    - the upload rows: the caption in primaryText, "{date} · Opens at {time}" with the date from `DateLabels.dayMonth(includingYear:)`, "{percentage} percent", and 12 under the bar (D-07, X-29);
    - the highlight row's avatar 28 and its gaps 12, and the tile star's trailing 24 (D-09, X-28); the Lab's contributor label "Maya", with the VoiceOver name kept as "Open Maya’s highlight" (RM-03, R-02);
    - at the largest text, the photo label's padding and the star gaps fixed, with only the star and the word growing (D-12);
    - at the largest text, the date lines' middle dot kept with the word before it, so no line starts with "·" (V-19); the time already keeps "AM" with its number, through ICU's narrow no-break space;
    - the sender row 16 below the block above it, still pinned at the minimum height (D-19);
    - keep `card.status` with one region date (D-02, R-05, X-10), the draft row's chevron (D-08, over X-30) and first-line centring of avatars at the largest text (D-24).
- **Kept as built:**
    - the M01 line (F-02, X-01);
    - both G06 lines at every size (F-01, X-02);
    - secondaryText for body lines (F-05, X-07, the critic's ruling on W-05);
    - `SetupGap.field` on A02-code (F-06, X-06);
    - the no-club tabs' gaps, and G06's two lines as one text (F-24, F-25, X-08; V-13 and W-05 would split them 16 apart, and the critic didn't rule);
    - A02-age's subtitle gap 24 (F-22, BM-04);
    - A03's gaps from handoff 1, apart from the label's 8 (F-23);
    - an empty email field after Leave sign-in until FQ93 is answered (R-06, the critic's ruling over WM-01 and BM-03);
    - the title-then-line announcements (W-11, RM-01);
    - a successful resend returning focus to the code field (R-08).
- **Keys:** keep the built keys where a handoff 7 key repeats one word for word (person.self, highlight.label), noting the mapping in the strings' comments, and record that the earlier keys the replaced list leaves out stay current outside the no-club context (D-25, W-14).
- **Inventory (`design/reference/INVENTORY.md`, in the same PR):**
    - Set the 16 requested states to received with the source "Handoff 7".
    - Add the five dark and largest-text rows as received.
    - Move the eight redrawn rows to handoff 7, earlier source in brackets. A02-code's redraw shows a typed code; keep handoff 1's frame for the moment it opens (V-17).
    - Add the new states X-33 lists as built from spec, and update the existing built-from-spec rows for the rest of section 6.
    - Record each difference section 4 keeps on its row, the revealed item's later controls as B6 (D-18), the text screenshot's fit as waiting on FQ94 (X-31), and A03's arrival focus skipped under VoiceOver (C-01).
    - Update the notes that handoff 7 answers: the receipt's disc, the field that doesn't wrap (C-03, needs item 31), the label inset, and the address line breaks at the largest text (C-02).

  X-33 has the full list.
- **Questions (`docs/QUESTIONS.md`, same PR):**
    - add FQ93 to FQ95 from section 5 (numbers reserved by the coordinator);
    - FQ58: note Claude Design's answer and leave it open;
    - FQ89, FQ90 and FQ91: note Claude Design's agreement and leave them open unless the founder answers (RM-02);
    - FQ90: also rewrite the bullet that says the brief hasn't gone to Claude Design and doesn't state the failure words (X-34);
    - FQ91: also note that the revealed photo's VoiceOver grouping is answered and keeps (c)'s words and order (X-32);
    - both prefaces, the tabs' and the drop card's: their "these defaults stand until its export is checked" becomes "these defaults stand until the founder answers" (X-34);
    - FQ86: note that the delivery's line for a code the service couldn't answer matches the founder's answer (X-34);
    - FQ69: record the leading Leave sign-in with no alert;
    - FQ70: record the too-long line and that the refused-name line waits for a rewording;
    - FQ44: record the split template the app doesn't take (X-34).
- **The needs list:** handoff 7 answers items 1 to 17, 19 to 25, 13a, 13b, 31 (the field doesn't wrap), 35 (Friends and Memories say nothing when the list comes back), 39 to 42 and 44, with 13b, 21 and 39 only in part (section 7 has the rest). Item 18 isn't needed, since the founder's FQ85 answer shows the later buttons doing nothing yet. The open items are 26 to 30, 32 to 34, 36 to 38, 43, 45 and 46, plus section 7's leftovers.
