# Design handoff 8: the brief

*20 November 2026, by the ios lane, at the start of stage B1 (`docs/DESIGN-HANDOFF.md`, "When to write a handoff"; `docs/plans/ios-b1-clubs.md` section 5). The text to paste is `handoff-8-brief.txt` beside this file, whole and unchanged.*

## The answer

- **Handoff 8 asks for 15 frames,** all for stage B1:
    - frames 1 to 6, the new direction's redraws: Welcome (`A01-welcome`) with its dark and largest-text frames, and the signed-out invitation page on tadayo.app (`G02-web`) with its dark and 200% frames, each with the brand line "Your day. Your story. A thought from your friends." (addendum 1 and 3; FQ106's default; `docs/plans/new-direction-r1.md` section 7.2; the inventory's Known differences, "The new direction, revision 1");
    - frames 7 to 11, moments B1's screens have no words or frame for: creating the club failed, checking an opened link, accepting failed, approving or declining failed, and Club details loading or failing;
    - frames 12 to 15, the four points handoff 7's brief kept for this stage (its section 4; `docs/design/handoff-7/ios-lane-needs.md`, items 27 to 30).
- **It also asks for written answers:** Welcome's example (a friend's drop, or the star's own), where the brand line sits, whether the in-app invitation's explanation changes, the failure words and what VoiceOver reads, and what an invitation already accepted on another device shows.
- **Every other B1 state already has a render** (`design/reference/INVENTORY.md`, the B1 rows: 27 states, all `received`), so the lane builds them while this brief is out, and builds the 15 from the spec meanwhile, marked "built from spec".

## 1. How to send it

1. Paste `handoff-8-brief.txt` into the Claude Design project that made handoffs 1 to 7, with the repository linked.
2. If that project no longer has the earlier work, attach the two PDFs (`Tadayo_UI_UX_Design_Book.pdf`, `Tadayo_v3_Build_and_Design.pdf`), the addendum's PDF (`docs/tadayo-new-direction-addendum-r1.pdf`), `design/reference/brand/brand-tokens.md` and `brand-components.png`.
3. When the export is ready, attach it as a .zip in the ios thread with the message "Design handoff 8", as handoffs 0 to 7 came (`docs/LIMITATIONS.md`, 2 November 2026). The lane unpacks it into `design/reference/claude-design/handoff-8/` and checks it against this brief in a design PR of its own.

The protocol point is met: the brand files the brief builds on (revision 1.1 and handoff 7's component sheet) are on `main`.

## 2. The readings the brief draws until you decide

- **FQ106. Where the brand line appears:** on Welcome and on the invitation page's introduction, which this repository reads as the signed-out page `G02-web` (`docs/TECH-DESIGN.md`'s Web row), and in the App Store text in B9. Not in the in-app `G02-invitation`, unless the design changes its explanation.
- **FQ23. The Welcome example photograph:** the chair stays as a stand-in; your own photograph replaces it before Gate D.
- **FQ20. Inferred pronouns:** the example's label names the person ("Debby's day"), never "her day".
- **FQ51. A later addition's link:** the invitation list stays a setup screen; frame 14 asks where Invite someone lives for an active club. With your answers to FQ125 to FQ127 (20 November 2026), a later member joins with everyone's approval and then picks a free day; the day picker is stage B2's (G04-change), after the api lane's contract PR, so it isn't in this brief.
- **FQ84. A revision a changed name made:** the creator approves it before the first roster starts; frame 13 shows that.

## 3. Made-up fixtures

- Frames 8 and 15 are moments no design has drawn: an invitation link opened from Messages while the app checks it, and Ben accepting under the name "Benjamin". "Benjamin" is the one name the brief adds, as the account's own profile name, to show the difference.
- Everything else uses the book's clubs and people.

## 4. Left out on purpose

- **Stage B2:** G04-change after your FQ125 to FQ127 answers, `G05-schedule-review-confirmed` (missing), and the leftovers from handoff 6's check.
- **Later stages:** `G05-leave` (B6), `G05-notifications` (B8), and the ios lane's items 26 and 31 onwards in `docs/design/handoff-7/ios-lane-needs.md`, which go with the stages that build them.
