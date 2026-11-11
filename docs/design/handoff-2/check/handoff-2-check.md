# Design handoff 2: the check

*3 November 2026. This is the check of Claude Design's corrections to handoff 1. Three independent reviews read the delivery: one against the brief, one against the copy, privacy and product rules, and one for the brand, visuals and native iOS. A second reviewer then tried to refute each finding. None was refuted: 40 were confirmed and 6 corrected.*

## The answer

**Handoff 2 did everything the brief asked:**
- all 11 frames, titled and in order, at 393 × 852 points;
- all 11 written answers;
- two extra proofs of the web invitation page, one in dark mode and one at 200% text zoom;
- a corrected brand-components sheet.

The brand is untouched: tokens, icon, wordmark and font are byte-identical to revision 1.1, which you adopted.

**It closes most of what handoff 1 left open.** Of the 12 places where the app was going to follow the rules instead of handoff 1's frames:
- 7 can now be built as drawn;
- 2 are settled in writing;
- 3 stay as the app's own rules, and handoff 2 agrees with them.

**Nothing blocks the build, and nothing needs you now.** A few small things are left, listed below. They can go into the ios thread's next design brief (handoff 3) rather than another round now.

## 1. What arrived, and where it is kept

- **The files:** `Tadayo_Handoff_2_Pack.zip` (45 files) and `Tadayo_Handoff_2_Corrections.pdf` (9 pages), in the project files at `design/handoff-2/export/`. Their checksums match what you attached. The PDF you attached is a newer render of the one in the zip.
- **The checks on the files:**
    - They hold no scripts and no external links.
    - The only image is the book's own chair photograph, byte-identical to the one in handoff 0's Home frames. It sits only on the brand sheet, under the new photo label.
    - The only email address is ben@example.com.
- **When it enters the repository:** with handoff 1, after slice 12, by the ios thread.

## 2. What it fixed

| Asked for | What came back |
|---|---|
| A02-code-error | The message is now the honest one: "This code couldn't be verified. Try again or send a new one." The typed code is kept. |
| G02-changed | It now names the inviter: "Debby invited you to Sunday people." Its roster rows match the other member lists (36-point avatars). |
| G03-waiting | Leila is spoken to as "you" throughout. |
| G03-approve | "Leila must accept the exact roster. Every existing member must approve the same roster. Either can happen first." |
| M01-no-club | "Days shared after you join a club will appear here after they open." |
| F01-no-club | The Private drafts row is back at the top of Friends. |
| Two-day club | Ben (Monday and Thursday) and Debby (Tuesday and Friday), from the book's own pair, with "Two reveal days each." |
| Inviting | The list with fewer people and Create an invitation; the name step ("Who is it for?"); revoking a link through a More menu; and the list at the largest text size. |
| "I have an invite" | A new paste screen. It reads the clipboard only when the person taps Paste, and shows nothing about any club before sign-in. |
| Failure messages | Exact words for every failure the brief listed. Each names what failed and keeps what was typed. |
| Accessibility labels | "Share link for Alex", "More options for Alex's invitation", and so on, by name. |
| Focus ring | A field shows the ring whenever it's being typed in. So handoff 1's A02 frames were right, and the app builds them as drawn. |
| Photo label, fold line, five text styles | All named. The Highlight label gets its star and has no outline. |
| One shape each | "I have an invite" is always a secondary button. Private drafts is always one rounded row. Every no-club tab has the wordmark and + Add. |
| Line length | No cap: text wraps at the full width, and rows grow. |
| Web page, dark and zoomed | Proofs for both. Zoom is allowed, and the page scrolls. |

## 3. What's left (all small, none blocking)

Where a frame and a rule disagree, the app follows the rule until Claude Design or you decide.

1. **A lock on G03-approve.** The note "We don't identify who declined" now has a padlock where 2.1 drew a shield. In the book a lock means "hidden until 7 AM" (book p6), so this gives it a second meaning. The app keeps 2.1's shield.
2. **"Sign in before you can see the club or its people."** This line on the new paste screen is wrong for someone already signed in, who can reach that screen from the empty Home or Friends tab. The app shows the line only to someone who is signed out.
3. **Screens changed only in words.** The new "one shape" rules change five screens that weren't redrawn: the empty Home, Welcome, the waiting-to-start screen, Friends with a club, and the invitation. Four can be built from the written rules. The waiting-to-start screen (G01-pending) loses its Drafts card and its main button, and the words don't say what replaces them. It needs a redraw; until then it's marked "built from spec".
4. **Revoked links.** Revoking is described only in words. Two states have no frame:
    - the row after a link is revoked;
    - what the person holding the revoked link sees.

    The app never tells that person the link "expired".
5. **Who approves on G03-approve.** The frame's viewer is Ben, who also proposed Leila, so Ben would approve Ben's own proposal. This joins product question 1 from handoff 1 (when a club starts) as one question: does proposing count as approving? The app's test pictures use another Kitchen table member as the viewer, which is true either way.
6. **A pending member sees nothing.** The delivery says Leila, while waiting for approval, gets "no history, media or upload access". The app follows T7: no captions or club activity either.
7. **Native controls.** The Paste button and the More menu will look like iOS's own, not like the drawings.
8. **Minor:**
    - The 28-point name on G03-approve has no named style.
    - The two-day members list ends with the opening hours where the six-person list ends with the member count.
    - The copy mixes straight and curly apostrophes; the app uses curly ones.

Handoff 1's six product questions are unchanged, each with its default. Claude Design's G03-approve sentence is true under question 2's default (either order). You haven't answered that question, so it stays open.

## 4. For the next brief

When the ios thread writes handoff 3, it should carry:
- G03-approve with a glyph other than the lock, and a named style for the name;
- the paste screen for someone already signed in;
- redraws of G01-pending and G06-no-club under the new rules, and a confirmation of Welcome's outlined button;
- the revoked-link row, and what a revoked link shows its holder;
- whether the members list ends the same way at every club size.

The open asks that handoff 1's check listed and the brief didn't carry also stay for a later brief: the star on a pick cover, a Kitchen table members frame, and something from the book on the empty Home, if you want one.

Every verified finding, with its evidence, is in `handoff-2-findings.md` beside this file, for the thread that brings handoffs 1 and 2 in.
