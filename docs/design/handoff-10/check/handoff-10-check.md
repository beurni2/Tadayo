# Design handoff 10: the check

*26 November 2026, by the ios lane, in `ios/b1-proposed-roster` (stage B1's PR 7b). This checks Claude Design's answer to handoff 10's brief (`docs/design/handoff-10/handoff-10-brief.md`, and the text pasted, `handoff-10-brief.txt`). The lane read every frame beside what `ios/b1-approve` (#139, PR 7a) built and beside the frames it builds on, and read the written answers (`IMPLEMENTATION.md`, and `component-contracts.json` and `copy-contracts.json` under `handoff10`) and the files' own checks, against the brief, the spec, the book, the addendum, the invariants and the open questions. The check is in 7b, not a design PR of its own, because 7b builds frame 7, as 6b checked handoff 9 beside the frames it built. A fresh reviewer reads it with the rest of the branch (section 7).*

## The answer

**Claude Design did what the brief asked.** All 11 frames came, titled and in the brief's order, and every written question has an answer. What matters most:
- **Nothing leaks.**
    - No frame or string counts approvals, acceptances or declines, or names who decided. The proposed rows in Members read the same to a member who approved, one who declined and one never asked (frames 5 and 6).
    - The neutral end (frame 2) says the same for a revision that ended, one that never was and one the caller can't see, and shows nothing of the old roster (T14).
    - The proposed roster with Ben's decision (frame 7) lists names only: no weekday, active count or acceptance mark.
    - None of the 68 new strings has an inferred pronoun or "Sent".
- **The brand is untouched.** The tokens are revision 1.1, byte for byte. Every photograph, font and wordmark in the export is a file the repository already holds.
- **Every written question is answered** (section 3): FQ143 to FQ146, Decline's label and busy form, the alerts' Cancel, and handoff 9's three row questions (the needs list's items 70 to 80).

**One decision for the founder, FQ146** (section 5), since answered: the founder chose handoff 10's alert. Handoff 10 replaces its default: when Approve or Decline is answered with the viewer's own earlier, opposite decision, a native alert says "You already approved this roster." (or declined), and the screen returns to the members, instead of the action's "Try again." line, which can't come true. FQ143, FQ144 and FQ145 confirm their defaults.

**Where the app keeps something other than the frames** (section 4):
- Frames 1, 8 and 9's club of five members and two candidates is seven people, one more than a club holds; the snapshots keep the brief's scene as a layout proof, as handoff 10 says, and no test sends it to a server.
- The viewer's row on the proposed roster reads "Ben, you.", as every roster row in the app does, where frame 7's manifest says "Ben. You."; handoff 10 doesn't list that among the things it replaces.

**Nothing blocks the build.** Section 6 lists which PR adopts what: 7b adopts frame 7, and the next PR, `ios/b1-approve-handoff-10`, adopts the rest on the approval screen and Members.

## 1. What arrived, and where it is kept

- **The file:** `Tadayo_Handoff_10_Pack.zip`, attached by the founder in the ios thread at 06:44 UTC on 2026-11-26, sha256 `1cc67287083828a7f34b938629bbe90ecc0eff8bf3246639bc573a9244028bbf`, 42 files. Its contents are in `design/reference/claude-design/handoff-10/` unchanged (this branch's first commit); the PDF inside is `Tadayo_Handoff_10_B1_Implementation.pdf` (13 pages).
- **The checks on the files:**
    - **Checksums:** `checksums.sha256` verifies for every file it lists.
    - **Scripts and links:** no file holds a script or an event handler. `index.html` links only to the export's own files.
    - **The brief:** `SOURCE_BRIEF.txt` is `handoff-10-brief.txt` word for word, once line endings are set aside.
    - **The frames:** 11, each an SVG at 393×852 points and a PNG at 786×1704, titled with the state's name (`frame-manifest.json`).
    - **The brand and the files it reuses:** `brand-tokens.json`, `assets/` (Ben's portrait and the two wordmarks) and `fonts/` (Arimo and its licence) are byte-identical to handoff 9's files.
    - **The contracts:** `copy-contracts.json` and `component-contracts.json` keep every earlier entry unchanged and add only `handoff10`.
    - **Its own checks:** `validation-report.json` lists 460 checks, all passed. It says the frames are static drawings, not iOS or VoiceOver results, and that the server's lost-answer behaviour is the app's to verify.
    - **What it read:** `source-provenance.json` says Claude Design read the repository's `main` on 2026-11-26. All 18 files it lists are at `main`'s version at `60770d5` (`git rev-parse origin/main:<path>` matches each blob), `ios/b1-approve`'s plan and the brief among them.
- **No new component sheet,** so `brand/brand-components.png` stays handoff 7's.
- **In the repository:** the frames are named in `design/reference/screens/` and the inventory says where each comes from (ADR-027): 11 new files, none replacing an older one.

## 2. What came back

| # | Frame | What it shows, against the brief and the build |
|---|---|---|
| 1 | G03-approve-two | "Invite Leila and Nina?", "To Kitchen table · 5 current members", a block for each, the body and boundary naming both, the note, Approve Leila and Nina, Decline. As FQ144's default and as #139 built it. |
| 2 | G03-approve-unavailable | "This invitation is no longer available." alone under the "New member" bar. As built. |
| 3 | G03-approve-reviewing | "Loading proposed members…" in `emptyTitle` 25/30 with the spinner beside it at the leading edge, as `G02-opening` draws its wait. #139 built the small centred loading form (`ClubLoading`); section 6 adopts the frame. |
| 4 | G03-approve-review-failed | "Couldn’t load proposed members." over "Check your connection and try again.", Retry pinned. As built. |
| 5 | G05-members-with-proposed | Kitchen table's five, Maya the viewer, then Leila's proposed row with a trailing chevron, and "5 members · New York". #139 built the row as a button with no chevron and no hint; section 6 adds both. |
| 6 | G05-members-with-proposed-decided | The same row with no chevron. As built. |
| 7 | G05-members-proposed-approve | "Proposed roster", "Sunday people", the line, Ben · You and Debby, Manage invitations as a text link, "Review and approve the updated roster before Sunday people can start.", the note, then Approve roster and Decline pinned. FQ145's default, with Manage invitations moved out of the primary's place and the actions' words for the whole roster. 7b builds it. |
| 8 | G03-approve-two-dark | Frame 1 in dark. |
| 9 | G03-approve-two-xl | Frame 1 at accessibility 5, scrolled to the two blocks. |
| 10 | G05-members-with-proposed-dark | Frame 5 in dark. |
| 11 | G05-members-with-proposed-xl | Frame 5 at accessibility 5, scrolled to Leila's row and the footer. |

## 3. The written answers

- **Several candidates (FQ144):** one block each, one decision for the whole revision, the names joined by the phone's list format in the title, body, boundary, Approve, the spoken names and Approve's failure line. The count is the members' alone. As built.
- **The proposed row (FQ143):** while the viewer's decision is pending, the whole row is a button with the system's disclosure chevron and the hint "Review the proposed roster for Kitchen table."; once decided, the same row with no chevron, hint or button trait, read "Leila. Proposed by Ben. Proposed." either way. The default, with the chevron and the hint added.
- **The creator's approval (FQ145):** Approve roster and Decline on the proposed roster itself (frame 7). Manage invitations becomes a leading text link under the rows, hinted as before, and "Review and approve the updated roster before {clubName} can start." (`handoff10.proposed.reviewRequired`) comes before the note. VoiceOver reads "Approve roster for Sunday people." and "Decline roster for Sunday people.", Decline hinted "No reason is required."; a failure says "Couldn’t approve this roster. …" or "Couldn’t decline this roster. …" with the network's or the refusal's ending. At the accessibility sizes the actions follow the note in the same column. After a decision the roster is read again and follows what is true: the club started, or the proposal read-only.
- **A decision that changed nothing (FQ146):** see section 5.
- **Decline's label:** handoff 5's "Decline {names} joining {clubName}." with its separate hint stands over handoff 8's frame 10. As built.
- **Decline's busy form:** the label and its ink stay, with a 16-point spinner 8 before the label in symmetric 24-point slots, so the word doesn't move; Approve keeps its idle look, unavailable, while Decline is out. The control that started gets the value "In progress", and one announcement, "Approving this roster." or "Declining this roster.", says it once. #139 built neither.
- **The alerts' Cancel:** none, on either alert: their one action reads or returns and decides nothing. As built.
- **Handoff 9's three row questions:** the accepted invitation's symbols grow with Dynamic Type as built; Private drafts' inset stays as built; no inviter line. Nothing changes.

## 4. Where the app keeps something else

`design/reference/INVENTORY.md`'s Known differences ("Handoff 10") lists each:
- **Seven people in frames 1, 8 and 9.** Five members and two candidates is one more than a club holds (the contract's `ProposeRosterRequest`). Handoff 10 keeps the brief's scene as a layout proof and asks that it never be used as a server fixture. The snapshots draw it from `ClubFixtures.kitchenRevision(nina:)`, which no test sends anywhere; `ApproveUITests` uses one candidate.
- **The viewer's row on the proposed roster** reads "Ben, you." (`person.self.vo`), as on every roster in the app, where frame 7's manifest reads "Ben. You." and `handoff10.members.active.own.vo` words an active member "{name}. You. {weekday}.". Handoff 10's `replaces` list doesn't name either, and its precedence applies only what it lists, so the built reading stays; whether the app should move to "Ben. You." everywhere goes in the next brief.
- **The viewer's photograph:** frame 7 draws Ben's portrait; the app shows the initial until avatars are read, as on Home and handoff 5's state.
- **A row with the name alone** is 64 high, where frame 7 and handoff 5's frame put the proposed roster's rows 52 apart: `RosterRow` sets 12 above and 16 under the 36-point avatar, the taller of the avatar and the name. The invitation's roster has done the same since 6a. Section 6 puts the fix in the next PR, on both screens at once.

## 5. FQ146: for the founder

FQ146 asks what a member sees when Approve or Decline is answered with their own earlier, opposite decision: after an Approve that went through with its answer lost, a Decline is answered with the approval in it, and nothing changed. Its default, built in #139, keeps the screen with the action's own refusal line, whose "Try again." can't come true. Handoff 10 gives the other reading: a native alert titled "You already approved this roster." (or "You already declined this roster."), no body and no Cancel, whose one action returns: "See members" on `G03-approve` (read "See members of Kitchen table."), "Review roster" on the proposed roster (read "Review the proposed roster for Sunday people."). Both decisions wait from the answer on; the old failure line goes. The words come only from the viewer's own decision in the answer, never anyone else's or a cache (T15, T33), and a not found or a version conflict keeps the neutral end.

The lane recommends adopting it: it says what is true where the default can't, and it tells the viewer only their own decision. It was put to the founder on a card in the ios thread, and the founder chose handoff 10's alert at 08:13 UTC on 26 November 2026 (`docs/QUESTIONS.md`, FQ146). The next PR builds it, and `ios/b1-approve-handoff-10` did, on both decision screens.

## 6. What changes in which PR

- **`ios/b1-proposed-roster` (7b, this branch):** frame 7 as drawn: Manage invitations as a leading text link under the rows while a decision is pending, the explanation, the note, a failure's line in this roster's words, Approve roster and Decline pinned as `G03-approve`'s are and in the column at the accessibility sizes, with handoff 10's spoken names. Handoff 5's state keeps Manage invitations as its primary.
- **`ios/b1-approve-handoff-10`** (the next PR, on both decision screens and Members):
    - The proposed row's chevron and hint (frame 5).
    - The proposed members' loading form as frame 3 draws it, on `G03-approve` and on the proposed roster.
    - Decline's busy form, the value "In progress" and the one progress announcement.
    - FQ146's alert, as the founder chose.
    - `G03-approve`'s actions in the column at the accessibility sizes (A1's "large" rule), as 7b's roster already does.
    - A row with the name alone 52 high, as handoff 5's frame and frame 7 draw the proposed roster's rows and handoff 2's `G02-changed` its own, where `RosterRow` makes it 64 (the 36-point avatar with the row's 12 and 16 around it), on the proposed roster and the invitation's roster together (the inventory's Known differences, handoff 10).
    - **Built** in `ios/b1-approve-handoff-10`, all six, as `docs/plans/ios-b1-approve.md` section 2 ("Handoff 10's rest") describes. Decline's busy form has no frame: it is built from `decisionBusy`'s words and the busy primary button's geometry, and its two states are marked built from spec in `design/reference/INVENTORY.md`.
- **Nothing else changes:** frames 1, 2, 4 and 6 are as built; the alerts keep no Cancel; handoff 9's rows stay as built.

## 7. The pictures, and the review

**The pictures:** the 11 frames are in `design/reference/screens/`, so the `ios` workflow's contact sheets put each beside its snapshot, under `ios/b1-proposed-roster/` on the `evidence` branch.

**The review:** the fresh reviewer of PR 7b reads this check with the rest of the branch. Its findings are recorded in the PR and the journal.
