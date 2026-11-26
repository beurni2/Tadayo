# Design handoff 10: the brief

*26 November 2026, by the ios lane, during stage B1 (`docs/DESIGN-HANDOFF.md`, "When to write a handoff": states the inventory lacks; `docs/plans/ios-b1-approve.md` sections 5 and 6). The text to paste is `handoff-10-brief.txt` beside this file, whole and unchanged.*

## The answer

- **Handoff 10 asks for 11 frames,** all for stage B1:
    - frames 1 to 6, approving a proposed member, which B1 PR 7a (`ios/b1-approve`) builds from spec meanwhile, marked "built from spec": two candidates in one revision (`G03-approve-two`, FQ144), the approval's neutral end (`G03-approve-unavailable`), Review members' read and its failure (`G03-approve-reviewing`, `G03-approve-review-failed`), and an active club's Members with a proposed row, before and after the viewer decides (`G05-members-with-proposed`, `G05-members-with-proposed-decided`, FQ143);
    - frame 7, the creator's approval on the proposed roster (`G05-members-proposed-approve`, FQ145), which B1 PR 7b (`ios/b1-proposed-roster`) builds;
    - the dark and largest-text forms of frames 1 and 5.
- **It also asks for written answers:** which Decline label stands (handoff 5's, which the app builds, or handoff 8's frame 10's), whether Decline needs a busy form, and whether the two alerts need a Cancel; and the ios lane's needs list's items 70 to 72 (`docs/design/handoff-7/ios-lane-needs.md` section 15: the accepted invitation row's symbols at the largest text, Private drafts' inset under the invitations, and whether the row names the inviter), which waited for handoff 10. Section 16 of the needs list holds this handoff's own items, 73 to 79.
- **Not in it:** the audit's A10 (taking back a proposal, the api lane's) and `G04-change`'s new-member pick (FQ125 to FQ127) have their own handoffs when their lanes reach them.

## 1. How to send it

1. Paste `handoff-10-brief.txt` into the Claude Design project that made handoffs 1 to 9, with the repository linked.
2. If that project no longer has the earlier work, attach the two PDFs (`Tadayo_UI_UX_Design_Book.pdf`, `Tadayo_v3_Build_and_Design.pdf`), the addendum's PDF (`docs/tadayo-new-direction-addendum-r1.pdf`), `design/reference/brand/brand-tokens.md` and `brand-components.png`.
3. When the export is ready, attach it as a .zip in the ios thread with the message "Design handoff 10", as handoffs 0 to 9 came (`docs/LIMITATIONS.md`, 2 November 2026). The lane unpacks it into `design/reference/claude-design/handoff-10/` and checks it against this brief.

## 2. The readings the lane builds until the answer

- **Two candidates** (FQ144): one block each, the names joined as the phone's list format words them, the count the members'.
- **The neutral end:** "This invitation is no longer available." as the title of an otherwise empty screen, with Back.
- **Review members' read:** handoff 8's proposed members' loading and failure forms under the "New member" bar.
- **The proposed row:** handoff 9's proposed row, a button only for a viewer whose decision is pending, with no chevron and no hint; a decided viewer's row opens nothing (FQ143).
- **Decline's label:** handoff 5's, "Decline {name} joining {clubName}.", hinted "No reason is required.".
- **The creator's approval** (FQ145, 7b): Approve and Decline under the proposed roster while the creator's decision is pending.

## 3. What came back

Nothing yet.
