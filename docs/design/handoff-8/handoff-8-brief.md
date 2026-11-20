# Design handoff 8: the brief

*20 November 2026, by the ios lane, at the start of stage B1 (`docs/DESIGN-HANDOFF.md`, "When to write a handoff"; `docs/plans/ios-b1-clubs.md` section 5). The text to paste is `handoff-8-brief.txt` beside this file, whole and unchanged.*

## The answer

- **Handoff 8 asks for 15 frames,** all for stage B1:
    - frames 1 to 6, the new direction's redraws: Welcome (`A01-welcome`) with its dark and largest-text frames, and the signed-out invitation page on tadayo.app (`G02-web`) with its dark and 200% frames, each with the brand line "Your day. Your story. A thought from your friends." (addendum 1 and 3; FQ106's default; `docs/plans/new-direction-r1.md` section 7.2; the inventory's Known differences, "The new direction, revision 1");
    - frames 7 to 11, moments B1's screens have no words or frame for: creating the club failed, checking an opened link, accepting failed, approving or declining failed (with the approval's own outcomes: the roster changed, the club full), and Club details loading or failing, a form that serves every B1 screen that loads;
    - frames 12 to 15, the four points handoff 7's brief kept for this stage (its section 4; `docs/design/handoff-7/ios-lane-needs.md`, items 27 to 30), with FQ84's "Proposed by" question and Home's waiting words (`H01-awaiting-activation`) added.
- **It also asks for written answers:** Welcome's example (a friend's drop, or the star's own), where the brand line sits and whether the revoked link's web page carries it, whether the in-app invitation's explanation changes, the failure words and what VoiceOver reads, what a link for a club you're already in shows, and two of the needs list's points whose stage this is: whether sign-in carries one of the book's objects (item 32) and whether a club's header changes as the no-club header did (item 55).
- **Every other B1 state already has a render** (`design/reference/INVENTORY.md`, the B1 rows: 27 states, all `received`), so the lane builds them while this brief is out, and builds the 15 from the spec meanwhile, marked "built from spec".

## 1. How to send it

1. Paste `handoff-8-brief.txt` into the Claude Design project that made handoffs 1 to 7, with the repository linked.
2. If that project no longer has the earlier work, attach the two PDFs (`Tadayo_UI_UX_Design_Book.pdf`, `Tadayo_v3_Build_and_Design.pdf`), the addendum's PDF (`docs/tadayo-new-direction-addendum-r1.pdf`), `design/reference/brand/brand-tokens.md` and `brand-components.png`.
3. When the export is ready, attach it as a .zip in the ios thread with the message "Design handoff 8", as handoffs 0 to 7 came (`docs/LIMITATIONS.md`, 2 November 2026). The lane unpacks it into `design/reference/claude-design/handoff-8/` and checks it against this brief in a design PR of its own.

The protocol point is met: the brand files the brief builds on (revision 1.1 and handoff 7's component sheet) are on `main`.

## 2. The readings the brief draws until you decide

- **FQ106. Where the brand line appears:** on Welcome and on the invitation page's introduction, which this repository reads as the signed-out page `G02-web` (`docs/TECH-DESIGN.md`'s Web row), and in the App Store text in B9. Not in the in-app `G02-invitation`, unless the design changes its explanation.
- **FQ23. The Welcome example photograph:** the chair stays as a stand-in; your own photograph replaces it before Gate D.
- **FQ20. Inferred pronouns:** the example's label is the default's "An example · before and on the day", never "her day".
- **FQ51. A later addition's link:** the invitation list stays a setup screen; frame 14 asks where Invite someone and the new person's link live for an active club, citing handoff 3's `detailsRoute` and handoff 5's `invitationControl`. You answered FQ125 to FQ127 in the api lane's thread at 12:06 UTC on 2026-11-20: a new approved member picks a free day, theirs from its next week, and nobody else moves or confirms again. The day picker for that is stage B2's (G04-change), after the api lane records the answers and makes its contract PR, so it isn't in this brief.
- **FQ84. A revision a changed name made:** the creator approves it before the first roster starts; frame 13 shows that on `G01-pending` and asks whether Home's waiting words change too, and frame 12 asks how its row reads "Proposed by".

## 3. Made-up fixtures

- Frame 8 is a moment no design has drawn: an invitation link opened from Messages while the app checks it. Frame 15 uses the API contract's own example for a changed name (`previewInvitation`, `another_name`): Debby accepts the link Ben made for Leila in Kitchen table. No name is added.
- Everything else uses the book's clubs and people.

## 4. Left out on purpose

- **Stage B2:** G04-change after your FQ125 to FQ127 answers, `G05-schedule-review-confirmed` (missing), and the leftovers from handoff 6's check.
- **Later stages:** `G05-leave` (B6), `G05-notifications` (B8), and the ios lane's items 26, 31, 33 onwards except 55's header question in `docs/design/handoff-7/ios-lane-needs.md`, which go with the stages that build them.
