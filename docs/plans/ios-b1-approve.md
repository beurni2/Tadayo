# B1, PR 7: approving a proposed roster, and inviting someone later (`ios/b1-approve`)

Branch `ios/b1-approve`, from `main` at `ae506db`. Written on 26 November 2026. The seventh PR of `docs/plans/ios-b1-clubs.md` section 4, split in three, as PRs 3 and 4 were split in two:

- **7a, this branch:** approving from Members. An active club's proposed people in Members, and `G03-approve` and `G03-approve-failed` with the approval's own outcomes.
- **7b, `ios/b1-proposed-roster`, next:** the proposed roster Review members opens (`G05-members-proposed`), from `H01-awaiting-activation` and `G01-pending-approve`, for a club that hasn't started, with the creator's approval on it (FQ145).
- **7c, `ios/b1-invite-later`, after it:** inviting someone into an active club. Club details' Invite someone (`G05-club-details-active`), the name step for an active club, and the person's own invitation page (`G05-members-invite`), with its proposer's way back from the proposed row in Members.

The split keeps each review on one risk: 7a's, where a mistake counts approvals, names a decliner or replays a decision onto a roster nobody saw (book p30, T7, T15, T33); 7b's, where a proposed roster must not pass for an active member list (book p33); and 7c's, where the risk is a token (T7, T52, ADR-037). It changes no product decision. Section 2's descriptions of `G05-members-proposed` and FQ145 are 7b's, kept here so the three stay one plan.

## 1. The sources

- **Spec:** 04 (a club's roster: every active member approves the exact roster and each candidate accepts it, in either order), 32 (roster revisions, `expected_version`), T7 (nobody joins without the exact roster), T15 and T33 (no counts, nobody named who hasn't acted), T19 (one commit per key), T14 (a neutral not found).
- **Book:** p30 (`G03-approve`: never who declined, no reason asked), p33 (nothing in a proposed roster passes for an active member list).
- **The contract:** `approveRoster` and `declineRoster` (`POST /v1/rosters/{revision_id}/approvals` and `/declines`, each with `expected_version` and an idempotency key; 409 `VERSION_CONFLICT`, `ROSTER_CHANGED`, and for approving `CLUB_FULL`; 404 the neutral not found; 403 `PROFILE_INCOMPLETE`), `getRosterRevision`, and `listMembers`' `open_revision`. `RosterRevision`'s `version` moves only when its `state` does, never on an approval, so it counts nothing (T33). FQ60's default: the member who proposed counts as approving, so the server gives that member `my_decision: approved`.
- **Frames:** handoff 4's `G03-approve` (Maya the viewer, Leila proposed by Ben, Kitchen table with five members), handoff 8's frame 10 (`G03-approve-failed`), handoff 5's `G05-members-proposed` with handoff 6's words (X-09), handoff 8's frame 13 words (`G01-pending-approve`, already built by #104, and `H01-awaiting-activation`, by #95). Handoff 8's `IMPLEMENTATION.md`, "Changed roster and full club outcomes", gives the two alerts and what Review members does after one.
- **Handoff 1's proposed row** (its `IMPLEMENTATION.md`: "place Leila in one separate proposed row after the current roster: Leila, Proposed by Ben, Proposed"; the brand sheet's "Proposed member row"): an active club's Members has no frame with one, so the row is built from those words and the component sheet, and marked built from spec (section 5).

## 2. What 7a builds, and 7b after it

### The approval model (`TadayoCore`, `RosterApprovalModel.swift`)

For one open revision and the account, made from the members answer that listed it (`MemberList.openRevision`), so the screen shows exactly the roster the person reads and decides on that roster's `id` and `version`.

- Made by Club details' model (`ClubDetailsModel.approval(of:)`), so it answers only in that model's session and while its club is selected, and its not found reads the members again, whose own not found closes the club's screens.
- **Approve and Decline** call `approve` and `decline` with the revision's `version` as `expected_version`. Each action has its own key, made when it starts and sent again on every retry of the same action on the same revision (T19, as `ProfileModel` does). Approving after a failed Decline is a new action with a new key. One action at a time; both buttons wait while one is out.
- **Success** of either, when the answer holds the person's decision (`my_decision` `approved` after Approve, `declined` after Decline): the screen closes back to Members, which reads again. Nothing on screen says how many approved, who else did, or that the club is now waiting on anyone (T15, T33). A decline names nobody (book p30).
- **An answer that changed nothing.** The server answers a decision that can change nothing with the revision as it stands, and a 200 (spec 32; `packages/domain/src/clubs/decide-roster.ts` step 7). When it holds the other decision (an earlier one of the person's, whose answer was lost, went through), the screen doesn't claim the action and doesn't close: FQ146's default is the action's own refusal line ("Couldn’t decline this invitation. Try again."), with both actions kept, this action's key dropped and the other's kept, so its retry is answered with the decision it made. When the revision ended without the person's decision, it is "This invitation is no longer available.".
- **A failure keeps the screen** and both actions (handoff 8, frame 10): the network's "Couldn’t approve {name}. Check your connection and try again." or "Couldn’t decline this invitation. Check your connection and try again.", or a refusal's "Try again." in place of the second sentence (handoff 8's failure words). VoiceOver reads the line once, politely, with the focus left on the button.
- **`ROSTER_CHANGED`** (a newer revision replaced this one): the native alert "Review the updated roster" with "The members have changed. Review the updated roster before approving." (or "declining"), and Review members. Review members reads the members again and shows the open revision they now list, with no keys; neither decision is replayed onto it (handoff 8). If no revision is open any more, the screen says "This invitation is no longer available." (handoff 8's neutral recovery words) with Back.
- **`VERSION_CONFLICT`** (the revision's state moved with no newer one: a member declined, or the person's own earlier Decline went through): "The members have changed." would be untrue (T43), so the members are read at once, as Review members reads them, with no alert, as `InvitationModel`'s Accept checks again on the same answer.
- **`CLUB_FULL`** (approving only): the native alert "{clubName} is full." with "{clubName} already has six members.", and See members, which closes the screen back to Members, which reads again. It claims no approval and suggests removing nobody (handoff 8).
- **Not found:** the revision, or the club, is no longer the caller's to see (T14): "This invitation is no longer available." with Back, and Members reads again, whose own not found closes the club's screens as today (`ClubDetailsModel.closed`).
- **Signed out** ends the session, as everywhere. **`PROFILE_INCOMPLETE`** is a refusal's line: the root already holds an account without a name or an age to finishing its profile, so it can't reach this screen.
- An answer counts only while the session it was asked in hasn't ended and the club is still the selected one, and a cancelled call shows no failure, as `ClubDetailsModel`'s reads.
- **Members under it reads again** as it closes, once for each change the approval has learned of or may have caused (`changes`, `takeMembersRead`): a decision, an outcome, a newer roster after Review members, or an action with no answer (the server may have carried it out). A decision still out at Back reads it once it answers. Back after a refusal, or with nothing done, reads nothing, and a not found's own read is the only one it gets.
- **The same roster opened again** from Members is the approval as it stands (`reopens`: the same revision at the same `version`, still on screen), so its keys (T19), its failure's line and any decision still out stay with it, and no second decision goes out beside one on its way. Any other revision, or one Club details' model made earlier, opens a new approval.

### Who opens what from a proposed row

`listMembers`' `open_revision` gives the proposed people. Members shows each candidate in a proposed row after the current members, in the revision's order: the name, "Proposed by {name}" from the candidate's `proposed_by`, and the Proposed tag. No count, no status, nothing about who has approved or accepted (T15, T33); the members footer counts active members only, as today.

| The viewer | `my_decision` | The row | Source |
|---|---|---|---|
| Any member, the candidate's proposer among them | `pending` | Opens `G03-approve` for the revision. The proposer's decision is pending on a revision the server made for the candidate's own name (FQ84), which could never go ahead without it. | handoff 4, book p30 |
| The candidate's proposer | `approved` (FQ60) | Opens the person's invitation page, 7c (`G05-members-invite`). In 7a it opens nothing. | handoff 8 (`activeInvitationManagement`) |
| Another member | `approved` or `declined` | Opens nothing (FQ143's default) | none drawn |

### `G03-approve` and `G03-approve-failed` (`apps/ios/Tadayo/Club/ApproveScreen.swift`)

Handoff 4's frame and handoff 8's frame 10, pushed in the club's stack with the inline title "New member" and Back:

- "Invite {name}?" as the title;
- "To {clubName} · {n} current members", where `n` counts the revision's members, the active ones (the frame's "5 current members"; `proposedMemberCounted: false`);
- the candidate's avatar (initials: a candidate has no photograph before joining, FQ47) with the name and "Proposed by {name}";
- "{name} must accept the exact roster. Every existing member must approve the same roster. Either can happen first.";
- "{name} will see only drops shared after joining." (FQ20);
- the shield's note "We don’t identify who declined. Nobody is asked to give a reason.";
- the failure line under it (frame 10);
- Approve {name} and Decline. Approve's spoken name is "Approve {name} joining {clubName}." (handoff 8's `approve.vo`, handoff 5's `a11y.approve`). Decline's is "Decline {name} joining {clubName}." with the hint "No reason is required." (handoff 5's `a11y.decline` and its hint, which replaced handoff 4's at the founder's brief, so the label starts with the button's word and names the candidate as Approve's does; handoffs 6 and 8 still list the replacement). Handoff 8's frame 10 gives Decline handoff 4's older words, "Decline this invitation for {clubName}. No reason is required.", as `handoff8.decline.vo`; the build keeps handoff 5's, and handoff 10 asks which stands (section 6). Both keep Voice Control answering to the visible words (`accessibilityInputLabels`).

The spacings are frame 10's on the scale: 20 from the title to the context, 32 to the candidate, 32 to the body, 40 to the boundary, 56 to the note, 20 to the failure line. Handoff 4's frame draws the boundary 12 lower and the note 21 lower (its `approvalNote.frameTop` 532 against frame 10's 511); one layout serves both, so a failure's line moves nothing above it. The candidate's name sits 16 after the 68-point avatar, the proposer 8 under the name, the two centred on the avatar until the accessibility sizes, where they keep level with its top. While an action is out both buttons wait, Approve with its busy form; Decline, a text action, has none. As the screen slides away after a decision it keeps drawing the roster it showed, both actions waiting.

Review members' read uses the proposed members' loading and failure forms (`ClubLoading`, `ClubLoadFailure` with handoff 8's `load.proposed` words), and the newer roster, when it shows, takes VoiceOver's focus to its title. "This invitation is no longer available." is the title of an otherwise empty screen, with Back; it's said once as it shows.

The words come from handoff 4's, 5's and 8's copy keys. A revision with two or more candidates has no frame: FQ144's default lists each candidate's block in the revision's order under a title and actions that name them all, and marks the state built from spec, until handoff 10 draws it (section 6).

### `G05-members-proposed` (Review members): 7b

Handoff 5's frame, from Review members on `H01-awaiting-activation` and `G01-pending-approve`, both of which today do nothing (FQ85): "Proposed roster", the club's name, "These names are a proposal, not an active member list.", the proposed people (the viewer's row "{name} · You" with the viewer's photograph, the others' initials; no weekday, status or count), and Manage invitations, which opens the setup list (`G01-invite-people`), only for the creator (handoff 5's brief, item 6). It reads `getRosterRevision` for the club's open revision with handoff 8's loading and failure form ("Loading proposed members…", "Couldn’t load proposed members." and Retry).

Frame 13 asks the creator to "Review and approve the updated roster" when the server made a revision for a candidate's own name (FQ84) and the creator's decision on it is pending. Handoff 5's frame has no approval action, and nothing says where it is. FQ145's default: the proposed roster shows Approve and Decline under the list when the viewer's `my_decision` is `pending`, with `G03-approve`'s outcomes, failure lines and alerts, and the state is built from spec until handoff 10 draws it.

## 3. Tests first, on Linux (`swift test --package-path packages/swift/TadayoCore`)

The approval model's tests, and the proposed rows' (`RosterProposedRowsTests`, the name the file has: `Roster`'s proposed rows live in `ClubDetailsModel.swift`), and `ClubDetailsModel.approval(of:)`'s session and not found.

- **`RosterApprovalModelTests`:**
    - approving and declining send the revision's id and `version`;
    - one key per action, reused on a retry of it; a new key for the other action and for a new revision;
    - one action at a time;
    - success closes, with nothing counted, only when the answer holds the decision: one holding the other decision keeps the screen with the action's line (FQ146), one where the revision ended is "no longer available";
    - the network's and a refusal's lines, per action, both actions kept;
    - `ROSTER_CHANGED` gives the alert with its action's body; `VERSION_CONFLICT` reads the members with no alert;
    - Review members reads the members and opens the newly listed revision with new keys, replaying nothing, or "no longer available" when none is open;
    - `CLUB_FULL` gives the full alert;
    - not found gives "no longer available";
    - signed out ends the session;
    - an answer after the session or the club changed, or a cancelled call, changes nothing;
    - Members reads again once for each change it doesn't show, never after a refusal, and only `gone`'s read after a not found;
    - the same roster opened again is the same approval, while a decision is out too, and not after Review members moved on.
- **`RosterProposedRowsTests`** (the roster's proposed rows): the candidates after the members in the revision's order, "Proposed by" from each candidate's own proposer, the footer's count of active members only, and each row's destination by the table in section 2.

## 4. The states to snapshot (`TadayoSnapshotTests`, iOS 27.2)

7a (`ApproveSnapshotTests`), each at the default size, dark and the largest text: `G03-approve`, `G03-approve-failed` (the network's line after Approve), and, built from spec, `G03-approve-two` (FQ144), `G03-approve-unavailable`, `G03-approve-reviewing` and `G03-approve-review-failed` (Review members' read and its failure), and `G05-members-with-proposed` (Kitchen table's Members with Leila's proposed row). Decline's failure lines and the refusal's are read, not drawn: the line is the only change. The two alerts are the system's; hosted tests read their words. Each new state gets its inventory row.

7b's: `G05-members-proposed` (default, dark, largest text), `-loading`, `-failed` and `-approve` (FQ145, built from spec).

Hosted readings (7a): the screen's words, the candidate as one element, both actions' spoken names and Decline's hint, nothing counted; each failure's line with both actions kept; both waiting while one is out; Approve and Decline calling their actions; two candidates named together, the count the members'; the neutral end and Review members' forms; the alerts' words; and in Members, the proposed row after the members, the footer counting five, a pending decision's row a button that opens the approval for the revision listed, and a decided member's row, approved or declined alike, not a button.

UI tests (iOS 26.5 and 27.2; `ApproveUITests`, on `UITestLaunch.Approving`, where Ben stands in for the frames' Maya and Maya for Ben, since the UI tests sign in as Ben): Ben opens Members, taps Leila's proposed row, approves into no answer, which keeps the line and both actions, goes Back and taps the row again, which opens the same approval with its line, approves again and is back on Members, read again, where Leila's row is no longer a button; and a Decline into a changed roster, whose alert's Review members shows the newer roster, still to decide, with nothing sent for it (no alert comes back).

## 5. What isn't drawn, and the defaults meanwhile

Built from the spec and the frames' components, marked built from spec in `design/reference/INVENTORY.md`, and asked of Claude Design in handoff 10 (section 6):

- **FQ143.** What a member who has already decided sees from a proposed row. Default: the row opens nothing, and nothing shows the decision, so nothing on the screen differs between members who approved, declined or haven't been asked (T15, T33).
- **FQ144.** `G03-approve` for a revision with two or more candidates. Default: one block per candidate, in the revision's order, with the title "Invite {name} and {name}?" and Approve {name} and {name}, the names joined by the locale's list format.
- **FQ145.** Where the creator approves the revision the server made for a name (frame 13). Default: Approve and Decline under the proposed roster, when the creator's decision is pending.
- **FQ146.** What a member sees when an Approve or Decline changes nothing because an earlier decision of theirs, whose answer was lost, went through. Default: the screen stays, with the action's own refusal line ("Couldn’t decline this invitation. Try again.") and both actions; Back reads the members again, where the decided row opens nothing (FQ143).
- **The proposed row in an active club's Members.** Default: handoff 1's words and the brand sheet's proposed member row, after the current members. A row that opens the approval is a button with no chevron and no hint: no frame draws its affordance, and handoff 10 asks for one.
- **The approval's neutral end, and Review members' read on it** (`G03-approve-unavailable`, `G03-approve-reviewing`, `G03-approve-review-failed`): handoff 8 gives the words and the forms they reuse, and no frame.

## 6. Design handoff 10

Written with this plan's PR, in `docs/design/handoff-10/handoff-10-brief.txt` (the text to paste, whole) and `handoff-10-brief.md` (how to send it), as one block for the founder to paste into Claude Design. It names the 11 frames it expects back, in order: `G03-approve-two`, `G03-approve-unavailable`, `G03-approve-reviewing`, `G03-approve-review-failed`, `G05-members-with-proposed`, `G05-members-with-proposed-decided` and `G05-members-proposed-approve` at the default size, and `G03-approve-two` and `G05-members-with-proposed` dark and at accessibility 5. It asks in words which Decline label stands (section 2), whether Decline needs a busy form, whether either alert needs a Cancel, what an Approve or Decline that changed nothing says (FQ146), and the needs list's items 70 to 72, which waited for a handoff. The needs list's section 16 (`docs/design/handoff-7/ios-lane-needs.md`, items 73 to 80) records this handoff's items. The app builds the defaults above until it comes back.

## 7. Privacy checks for the review

- No count of approvals, acceptances or members still to decide, anywhere on these screens or in their spoken words (T15, T33).
- Nobody named as having declined or not decided (book p30).
- No decision is replayed onto a newer revision; each decision carries the `version` of the roster on screen (T7).
- A not found reads the same for a revision that ended, one that never existed and one the caller can't see (T14).
- A candidate shows no photograph before joining (FQ47), and the link controls show only to the candidate's proposer (7c).
- The approval is made for the revision Members listed and decides on exactly that `id` and `version`; a newer one shows only after Review members, with no keys.
- A decision is shown as done only when the server's answer holds it (FQ146); opening the same roster again keeps its keys and lets no second decision out beside one on its way (T19).
