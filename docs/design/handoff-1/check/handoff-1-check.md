# Design handoff 1: the check

*3 November 2026. I checked the export against the brief, the spec, the book, the invariants and handoff 0's brand. Five independent reviews looked at it: completeness, copy, privacy and product rules, the brand, and the visuals with native iOS. A second reviewer then tried to refute each finding.*

## The answer

**Handoff 1 is complete and usable.**
- All 17 frames came back, titled and in order, at 393 × 852 points.
- Claude Design answered all 12 of the brief's questions.
- It also sent brand revision 1.1, which replaces handoff 0's tokens, the avatar fills and the dark icon.

**Your decision on the brand: adopt revision 1.1** (FQ45, answered on 3 November 2026). The app builds from revision 1.1. An ADR and a change to `docs/DESIGN-HANDOFF.md` record it in the repository.

**Nothing blocks the build.**
- Where a frame differs from the rules, the app follows the rules until you or Claude Design decide otherwise. There are 12 such places, in section 4.
- Six product questions came up (section 5). Each has a default, which stands until you answer.
- Every verified finding, with its evidence, is in `handoff-1-findings.md` beside this file, for the lane that brings handoff 1 in.
- A ready-to-paste brief for Claude Design is at the end, with what it should redraw or answer. It covers 11 frames and 11 written answers, and it is ready to send as written.

## 1. What arrived, and where it is kept

- **The files:**
    - `Tadayo_Handoff_1_Pack.zip`, with 56 files;
    - `Tadayo_Handoff_1_Implementation.pdf`, 32 pages.

    Both are in the project files, in `design/handoff-1/export/`, and their checksums match what you attached. The PDF you attached is a newer render of the one inside the zip, and its text is identical.
- **The contents:**
    - the 17 screens as SVGs, with the text outlined in Arimo, and as 2× PNGs, which match the SVGs;
    - three whole replacement brand frames: brand-tokens, brand-components and brand-icon-dark;
    - `brand-tokens.json` (revision 1.1), 58 contrast checks, and the exact copy of every screen.
- **What I checked in the files:**
    - They hold no scripts, external links or embedded images.
    - The wordmark and the Arimo font are byte-identical to handoff 0's.
    - The only email address in them is ben@example.com.
- **When it enters the repository:** only on the branch `ios/b1-handoff-1`, after slice 12 has merged (B0 plan, section 5.2). By then that's the ios thread's job.

## 2. What is right

- **Every state does what the brief asked:**
    - one email field and one 50-point button;
    - one native one-time-code field, with the address shown;
    - the typed code kept after an error;
    - a single "I'm 18 or older" step, with no birthdate;
    - Continue works without a photo.
- **Privacy before sign-in holds:**
    - The web page shows only "Ben invited you", the wordmark and Get Tadayo.
    - The expired page names only Ben.
    - The declined page never says who declined.
    - The creator's link states are the creator's alone, with no counts or progress.
- **The copy:**
    - It has no pronouns, no exclamation marks, and none of the banned words except one "Sent" (section 5).
    - Colour is never the only signal of a state.
- **Nothing is invented.** Sunday people's days match the book.
- **Contrast:** all 58 checks give the same ratios when recomputed, and the lowest text pair is 4.64:1.

## 3. The brief's questions, answered

| Question | Answer |
|---|---|
| A proposed member in the members list | One row after the current members: Leila, "Proposed by Ben", and an outlined "Proposed" tag. It has no weekday, no vote count and no list of approvers. |
| Send a new code, before and after 60 seconds | It sits in one fixed row under Verify code. Before 60 seconds the row says "You can send a new code after one minute."; after 60 seconds it holds the action. There's no ticking countdown. |
| The 18-or-older step | "Before you continue", one line, one button "I'm 18 or older", and "Leave sign-in". |
| Link states without colour alone | A glyph and a word for each: link with "Not shared", share arrow with "Shared", check with "Accepted". |
| The wordmark on the web page | 144 points wide and centred. Its clear space is set by the first t's lower stem, below the crossbar. |
| The avatar fallback on every cover | A dark circle (#182B25) with a light initial on all six covers, in light and dark, so it never disappears. On the page it stays the pale circle. Sizes: 36, 28, 18 and 68 points. |
| The button's pressed, disabled and focus states | All three are given, with no opacity tricks. The focus ring is 2 points, outside a 2-point gap. |
| The unnamed sizes and the card radius | Every size is now named. The card radius is 16 and the card's status line 13/18, which is what the app was already going to build. |
| A label on a photograph | An opaque light chip with dark text, the same in light and dark mode. |
| The input border on a surface | A darker border, #778579, everywhere: 3.44:1 on a surface (it was 2.92:1). |
| cover1 and the plaque's yellow | cover1 becomes cream (#EEDFC4), and the plaque keeps its yellow. |
| The dark icon | A transparent master, as Apple asks. |

## 4. Where the app follows the rules instead of the frame

These go in the inventory's "Known differences" when handoff 1 is brought in. Each holds until you or Claude Design decide otherwise.

1. **A02-code-error.** "This code has expired." can never show, because Supabase returns the same error for a wrong code and an expired one. The app shows the delivery's own fallback instead: "This code couldn't be verified. Try again or send a new one."
2. **G02-changed.** Book p9 and spec 04 say an invitation names the inviter, and this frame doesn't. The app adds the inviter line from 2.1's G02-invitation.
3. **F01-no-club.** Book p7 puts the Private drafts row at the top of Friends, and this frame leaves it out. The app keeps the row as 2.1's F01-friends draws it.
4. **M01-no-club.** "Past reveal days will appear here after you join a club." reads as if a club's earlier days would appear, but a newcomer never sees them (T8). The app uses 2.1's own line: "Days shared after you joined will appear here after they open."
5. **The resend wait.** Supabase gives no "send again after" time. So the app counts the 60 seconds from its own successful send, and keeps counting when the app is in the background. If Supabase refuses a send, the app shows the delivery's "A new code isn't available yet. Try again shortly."
6. **Get Tadayo.** The link carries no invitation token, and the invitation page sends no analytics, so the token never reaches a server (T7).
7. **Drafts across a sign-in.** Drafts stay with the account that made them (T30). Only the invitation carries over a sign-in.
8. **The Highlight label.** It keeps its star beside the word (book p6). Where the brand sheet's example differs from the written values (it has an outline and a fixed width), the app takes the written values.
9. **Text wrapping.** Titles and text wrap at the screen's width. The frames' line breaks aren't fixed breaks.
10. **Five text styles the tokens don't name.** These are:
    - the 16-point regular text actions, such as "Not now";
    - the 15-point "Share link";
    - the 13-point bold field labels;
    - the "Kitchen table" heading above G03-waiting's title;
    - the "Proposed" tag.

    The app gives each a provisional name at the drawn size, and each grows with the text size.
11. **The focus ring on a field.** A02-email and A02-code draw the focus ring around a field typed in by touch. The delivery's own rule shows the ring only for keyboard focus. The app follows the rule: the system's own caret for touch, and the ring only for keyboard focus.
12. **Leila's own waiting screen (G03-waiting).** It is built as drawn, including "Leila will see only drops shared after joining." on Leila's own screen, until Claude Design rewords that line.

## 5. Product questions, with defaults

Each of these goes into `docs/QUESTIONS.md` when its lane builds that part, and the default stands until you answer.

1. **When a club starts.** In G01-invite-people, Debby has accepted, but G01-pending still says the club hasn't started. Under T7 and spec 04, Ben and Debby have both approved the same roster, so the club would start.
    - Default: T7 as written. The club starts once two people have accepted the same roster. Everyone else on it stays proposed until they accept and the members approve them.
    - Effect: G01-pending shows only while nobody has accepted.
2. **The order of accepting and approving.** In G03-waiting, Leila accepts first. In 2.1's G03-approve, which this stage keeps, Leila accepts after the members approve ("Leila then accepts").
    - Default: either order works, on one roster revision (no rule fixes the order).
    - Effect: Claude Design rewords G03-approve's sentence.
3. **Whose name the roster shows.** Ben types a name for each link. If the link is forwarded and someone else accepts, the roster could show the wrong person.
    - Default: once someone accepts, the roster shows their own profile name. A changed name is a new roster revision, which everyone accepts again.
4. **Copy counts as Shared.** If Ben copies the link instead of sending it, the delivery still marks it Shared, which never means "delivered".
    - Default: yes, as the delivery says.
5. **"Sent to ben@example.com".** T41 bans the word Sent, and the ban comes from book p41, which is about drop states.
    - Default: the ban covers drop states, so this sign-in line stays. The copy lint says so openly.
6. **An account that stops at the 18-or-older step.** By then Supabase has already created the account with its email.
    - Default: such an account can only finish setup or leave.
    - How long it's kept is proposed, with a default, when sign-in is built (slice 8).

## 6. For Claude Design: design handoff 2, corrections to handoff 1

**It's ready to send as written.** It keeps revision 1.1, which you adopted.
- Paste the block below into the Claude Design project that made handoff 1. If that project doesn't have handoff 1 any more, attach `Tadayo_Handoff_1_Implementation.pdf` and `Tadayo_Handoff_1_Pack.zip` from the project files.
- When it's done, attach the export as a .zip in the project's thread, with the message "Design handoff 2".

**Optional, your call:** book p5 asks every screen to carry one of the book's own objects. The empty Home before a club has none. If you want one, for example 2.1 Welcome's labelled Example, add a line asking for it.

```
Design handoff 2: corrections to handoff 1 (sign-in and clubs)

Sources: your handoff 1 (Tadayo_Handoff_1_Implementation.pdf and its pack), the Tadayo design book 2.1 and the v3 build spec. Keep the brand exactly as handoff 1 delivered it: brand-tokens.json revision 1.1, brand-components and brand-icon-dark. Same fixtures: Sunday people (Ben Monday, the viewer unless stated; Maya Tuesday; Alex Wednesday; Sam Thursday; Debby Friday; Nina Saturday) and Kitchen table (five members, Leila proposed by Ben). Nothing invented, names not pronouns, exact dates, plain voice. Native iOS controls; Arimo stands in for the system font in frames.

What to design: one frame per state, 393x852 points, titled with the exact name, in this order. Redraws keep everything else in the handoff 1 frame as it was.

1. A02-code-error (redraw): the server can't tell a wrong code from an expired one, so the message is your own fallback: "This code couldn't be verified. Try again or send a new one." Keep the typed digits and Send a new code.
2. G02-changed (redraw): an invitation must name the inviter, the club and the exact roster (book p9, spec 04). Add the inviter; Debby is the inviter here and Ben is the candidate ("Ben · You"). Use one roster component for this state and for 2.1's G02-invitation, and say which avatar size it takes (your table gives member rows 36 points; this frame draws 28).
3. G03-waiting (redraw): Leila is the viewer, so speak to Leila as "you" throughout, as G02-changed does ("You'll see only drops shared after joining.").
4. G03-approve (redraw of 2.1 state 30): the candidate may accept before or after the members approve, so the sentence "Every existing member must approve. Leila then accepts the exact roster." must be true in either order. Keep "Leila will see only drops shared after joining" and "We don't identify who declined. Nobody is asked to give a reason."
5. M01-no-club (redraw): say the joining boundary. A new member never sees days from before they joined (book p9, p23). 2.1's M01-empty says "Days shared after you joined will appear here after they open."
6. F01-no-club (redraw): book p7 puts a Private drafts row at the top of Friends, and drafts can exist with no club. Draw it, or say in writing why the no-club Friends tab leaves it out.
7. G05-members-two-days: the two-person club from 2.1's G04-two-days, Ben (Monday and Thursday) and Debby (Tuesday and Friday). In a club of two or three, each person has two days (spec A02, book p11), so "Each person has a day." isn't true here.
8. G01-invite-people-add: Sunday people with two invitees so far, showing your "Create an invitation" control, and how Ben revokes one person's link.
9. G01-invite-name: the step behind "Create an invitation", where Ben types the person's name before the share sheet.
10. G01-invite-people-xl: G01-invite-people at the largest accessibility text size. In writing, say how the proposed member row's Proposed tag sits at that size.
11. G02-link-entry: what "I have an invite" opens: pasting or opening an invitation link, revealing no club before sign-in.

Answer in writing, with the export:
- The exact words for the states you described but didn't draw: Send a code fails (network, or server); Verify code fails on the network; a resend fails; saving the profile fails; the profile photo upload fails; revoking a link. Each names the action that failed and keeps what the person typed.
- The accessibility label of each person's Share link and Share again control. Name the person; no pronouns.
- A02-email and A02-code draw the focus ring around a field typed in by touch; your rule shows it only for keyboard focus; A02-code-error draws none. Which is right for a field, and how does the ring combine with the error border?
- The folded corner's line on brand-components is #8C8F84, which isn't a token. Name its token, light and dark.
- The Highlight label on a photograph: your sheet draws it with an outline at a fixed 100-point width, and your text says no outline with 6/8 padding. Which is right? Book p6 puts a star beside the word: draw it. Show one label on a photograph, light and dark.
- Name these text styles as type roles (size, line height, weight): the 16-point regular text actions ("Not now", "Send a new code", "I have an invite"); the 15-point row actions ("Share link"); the 13-point bold field labels; the 13-point bold eyebrow ("Kitchen table" on G03-waiting); the "Proposed" tag. 2.1 draws some text actions in bold and some in regular: say which weight text actions take.
- "I have an invite" is a 50-point secondary button on 2.1's Welcome and a text link on G06-no-club and F01-no-club. Give it one shape.
- The Private Drafts entry has three shapes (a row on G06-no-club, a card on G01-pending, 2.1's card on Friends). Give it one.
- The no-club tabs have no "+ Add" in the header, and the top left is the wordmark on Home and empty on Friends and Memories. Does Add stay (it can still start a private draft, book p44), and what goes top left?
- Do titles and short texts have a maximum line length, or should they wrap at the full 353-point width?
- G02-web in dark mode and with the browser's text zoom.

Return: a .zip with the SVG frames, 2x PNGs, screen-copy.json, a frame manifest, and a short PDF, as for handoff 1. If an answer changes a brand asset, send the whole asset again under its handoff 1 name.
```
