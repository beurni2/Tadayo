# Design handoff 9: the brief

*22 November 2026, by the ios lane, during stage B1 (`docs/DESIGN-HANDOFF.md`, "When to write a handoff": states the inventory lacks; `docs/plans/ios-b1-invitation.md` section 5). The text to paste is `handoff-9-brief.txt` beside this file, whole and unchanged.*

## The answer

- **Handoff 9 asks for 20 frames,** all for stage B1:
    - frames 1 to 6, the in-app invitation's moments with no frame: its check failing (`G02-checking-failed`), the wait while a joined club opens (`G02-opening`), the paste step checking, refusing a link and failing (`G02-link-entry-signed-in-checking`, `-invalid`, `-cannot-check`), and handoff 8's frame 15 after a relaunch (`G02-changed-name-relaunch`). PR 6b builds them from spec meanwhile, marked "built from spec";
    - frames 7 to 11, where the club list's accepted invitations show, which no frame places: on Home with no club (waiting, changed, declined, and the largest text) and in the switcher. PR 6d (`ios/b1-invitation-list`) waits for them, so it's built once;
    - frames 12 and 13, the signed-out invitation page's checking and failure states (`G02-web-checking`, `G02-web-failed`), which the api lane built from the book in #94, with the api lane's request as it stands (`docs/design/handoff-7/ios-lane-needs.md` item 63);
    - frames 14 to 17, the setup list's states that #104 built from spec (`G01-invite-people-empty`, `-live-not-held`, `-expired`, `-action-failed`: the needs list's items 64, 65, 68 and 69);
    - frames 18 to 20, Welcome with 2.1's "Already here? Sign in", which handoff 8's redraw left out (`A01-welcome`, `-dark`, `-xl`: item 61), before `ios/b1-welcome` builds it.
- **It also asks for written answers:** each failure's words for a refusal or a server error (today only "no answer" has words), Retry's hint, whether the Proposed tag shows on another proposed person's row, what accepted invitations' rows say and what VoiceOver reads, whether the signed-out page's dark and 200% forms change, the signed-out page's Retry and focus, `G01-create`'s words (item 66), the line for a name over 40 characters on a club and an invited person (item 67), and Leave club's place on Club details (item 62). With it, the needs list's sections 12 to 14 are all asked.

## 1. How to send it

1. Paste `handoff-9-brief.txt` into the Claude Design project that made handoffs 1 to 8, with the repository linked.
2. If that project no longer has the earlier work, attach the two PDFs (`Tadayo_UI_UX_Design_Book.pdf`, `Tadayo_v3_Build_and_Design.pdf`), the addendum's PDF (`docs/tadayo-new-direction-addendum-r1.pdf`), `design/reference/brand/brand-tokens.md` and `brand-components.png`.
3. When the export is ready, attach it as a .zip in the ios thread with the message "Design handoff 9", as handoffs 0 to 8 came (`docs/LIMITATIONS.md`, 2 November 2026). The lane unpacks it into `design/reference/claude-design/handoff-9/` and checks it against this brief. The founder attached it at 18:41 UTC on 22 November 2026, and the lane checked it in PR 6b (`ios/b1-invitation-screens`), which holds this brief and the rows it answers, rather than in a design PR of its own: `docs/design/handoff-9/check/handoff-9-check.md`.

## 2. The readings the lane builds until the answer

- **A check answered with a refusal, a rate limit or a server error** says "Couldn’t check the invitation link. Try again." under the paste field, and "Couldn’t check the invitation link." over "Try again." on `G02-checking-failed`: handoff 8's rule that "Check your connection and try again." is said only when no answer came (`failureStates`), applied to handoff 4's `linkEntry.cannotCheck`.
- **`G02-opening`** is `G02-checking`'s form with "Opening {clubName}…" alone (handoff 8's `joined.loading`).
- **The Proposed tag** shows on another candidate's row with no "Proposed by", since the contract's roster entry names no proposer, and on the viewer's own row only on `G02-changed-name`, as frames 9 and 15 draw them.
- **Accepted invitations on the root:** until 6d, an account with no club and an accepted invitation sees "This version of Tadayo can't show clubs yet." (FQ90), as it does on `main` today.

## 3. What came back

All 20 frames and every written answer (`docs/design/handoff-9/check/handoff-9-check.md`). Section 2's readings were built until then; the check's section 6 says what changes in which PR.
