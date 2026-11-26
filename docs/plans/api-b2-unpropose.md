# api/b2-unpropose: the outside audit's A10: removing someone invited who hasn't joined

The outside audit's A10 (medium): nothing ends one proposed person, and a proposed person never expires, so someone who
never answers holds a place in the club for good. This slice lets the member who proposed someone remove them while they
haven't joined (FQ148), and asks Claude Design where that action lives (design handoff 11).

Sources: spec 04 (an invitee understands the roster before accepting; changing the people a creator selected never
bypasses acceptance); A01 (six people); T7 (a link is single-use; two people approve the same roster); T14 (someone
without the right to know gets the neutral NOT_FOUND); T33 (nothing counted); FQ51, FQ54, FQ59, FQ60, FQ65, FQ66,
FQ71, FQ84, FQ120, FQ121, FQ143; handoff 4's and handoff 9's `revokeLink`; the founder's order of the audit's items (the
coordinator's relay of 10:02 UTC on 2026-11-24): A10 after A11.

## 0. The finding, re-checked on `main` at `900e897`

- Six counts members and open candidates together: `packages/domain/src/clubs/propose-roster.ts` line 155 (CLUB_FULL)
  and `packages/domain/src/clubs/club.ts` line 87 (`canPropose`).
- A candidate ends only when a member declines the revision (`decide-roster.ts`), when the candidate's proposer leaves
  (FQ121, `leave-club.ts`), or when the revision is applied without them and their proposer has gone (FQ120).
- The proposer can't decline: proposing is their approval (FQ60), so `decide-roster.ts` line 123 changes nothing for a
  decision already made.
- Revoking ends the link, not the candidate (`invitation.ts` line 221), as the contract says ("the candidate keeps their
  place", `revokeInvitation`) and as handoff 9 words it ("You can create a new link for Alex later.").
- A link expires after 7 days (FQ71), but the candidate stays open, and Create new link makes another.
- So a creator who invites five people, one of whom never answers, can never invite anyone else; a creator still alone
  can only abandon the club; and with two members, the only way out is the other member declining the whole roster,
  which ends every pending invitation. The audit's reproduction is a reviewer's test; this slice's first test makes it
  again on `main`'s code before anything changes.

## 1. The question (FQ148) and its default

How the place of someone invited who never joins is freed. Asked on a card in the api thread on 26 November 2026, with
three options; the founder chose the first at 21:25 UTC ("Remove them from the invitation"):
1. **Remove them from the invitation** (the default, recommended, and the founder's answer): the member who proposed them removes them while they
   haven't joined. Needs design handoff 11.
2. **Revoking their link frees the place**: no new action, but Revoke link would end the candidate, so Create new link
   would go from a revoked row, against the contract and handoff 4's design.
3. **Free the place after 7 days**: a candidate whose link expired unused ends by itself; the proposer can't end it
   sooner, and Create new link would go from an expired row.

## 2. The server

- **A new operation, `removeCandidate`:** `DELETE /v1/candidates/{candidate_id}`, as `revokeInvitation` is a `DELETE`.
  It ends the candidate and answers `{ candidate_id, state: "removed" }`. Repeating it returns the same answer, as a
  revoke does: the state makes it idempotent, so it takes no key (T19 is about commits a retry could repeat).
- **Who:** only the candidate's own proposer (the candidate's `proposed_by`, never the revision's, as for links), while
  an active member. Anyone else gets NOT_FOUND, whatever the candidate's state (T14), so the answer never tells another
  member anything about the candidate.
- **Which candidates:** any open one, whether or not they've accepted the open revision: they haven't joined. A
  candidate who has joined is a member, and the operation answers NOT_FOUND for them (the proposer's list no longer
  shows them). One already ended, by an earlier removal or by anything else (a decline, FQ120, FQ121), is answered as
  removed again and nothing moves, so a retry after a lost answer gets the first answer.
- **Its links:** every link of the candidate stops working at once. An unused link answers as a revoked one (NOT_FOUND,
  G02-revoked, FQ59). An account that had accepted sees its invitation as `did_not_go_ahead` (G03-declined), which never
  says who or why.
- **The open revision:** if other candidates are still open in it, a server-made revision replaces it without the
  removed candidate, as FQ121 carries a leaver's: the club's members now, the same proposer, whose approval stands
  (FQ60), the remaining candidates at their labels and in their order, with no acceptance; every other member approves
  again (handoff 8's "Review the updated roster") and each remaining candidate accepts again (G02-changed), their links
  still good. A remover who isn't the revision's proposer approves again like any other member: removing one person
  isn't approving the others, whom someone else may have proposed. If no other candidate is open, the revision ends as
  `did_not_go_ahead`. Either way `roster_version` moves.
- **What an account that accepted is told by `acceptInvitation`** (since the review, G4 and P2): a revision superseded
  by one that doesn't list the candidate answers as any roster that ended, VERSION_CONFLICT at a stale version and
  NOT_FOUND at the current one (`packages/domain/src/clubs/accept-invitation.ts`, step d.), so a decline, a removal
  alone and a removal that carried others answer alike, never who or why.
- **Locks and order:** as `proposeRoster`: the club's row `FOR UPDATE`, the caller's interval again, the candidate's
  row `FOR UPDATE`, then the clock. Every roster command takes the club's row first, so a removal and an acceptance, an
  approval or a leave of the same club run one after the other, never interleaved.
- **The privacy matrix:** a row for `removeCandidate` (`tests/src/privacy/rows.ts` `REMOVE_CANDIDATE`), judged by
  `tests/src/privacy/roster.ts` `candidateRemovalOutcome` from the world's rows apart from the route's statements. In
  every cell, every role asks to remove the world's joined candidate (Ben, whom Ana proposed: the new `candidate_id`
  binding), and gets the neutral NOT_FOUND, Ana included. In every cell where the role proposed someone, the proposer's
  removal of that candidate is judged after the invitation's table: by someone of another club and by another member
  (NOT_FOUND), then by the proposer (the 200 answer, byte for byte), then again (the same bytes); the candidate's row,
  the club's roster version and the revisions are checked after it, and the revision and the club are read again.
  Where the table ran, its decline had already ended the candidate, so the removal finds them removed and moves
  nothing; where nobody else could run it, the proposer's removal isn't asked, and the revision stays open for the
  last phase's leave to meet, as on `main` (review G3). The rows read after the refused removals must be as before
  them (review G1). The counts are pinned (`removals` equals the invitations run, `leftOpen` the cells with nobody
  else). Since the review (P1), a sweep of its own asks every role, in every state and phase, to remove an open
  candidate, Mo, whom Ana invited and who accepted (section 6). The answer carries the candidate's id and `removed`,
  no name. The leak scanner has no candidates in its world (a candidate's id is shown to every member
  the revision lists, so it keeps none back); the row's judge holds the answer exactly.

## 3. Tests first

In `tests/src/db/remove-candidate.test.ts`, on `main`'s code, before the change:
- the audit's reproduction: five proposed, Nina's link revoked, the proposer's decline changing nothing, `canPropose`
  false and CLUB_FULL, still so a year on;
- then, written before the operation existed and failing for that reason (9 of the 10 tests failed on `main`, the
  reproduction passed: run log in the PR): the removal frees the place (`canPropose` true, a new proposal accepted); the
  revision ends `did_not_go_ahead` when nobody else is invited, and the club's version moves; the remaining candidates
  are carried into a server-made revision, same proposer, approving, their labels and order, nobody's acceptance; only
  the revision's proposer's approval stands, a remover who isn't them asked again; an unused link previews as nothing,
  an account that accepted sees `did_not_go_ahead`, and acceptance names nothing; another member, an outsider and
  someone who left get NOT_FOUND and nothing moves; a repeat returns the same answer and moves nothing; a joined
  candidate is NOT_FOUND; an id that can't be one, or one nobody has, is NOT_FOUND.

Then, with the operation built, a removal against the commands it can meet at the club's row, each way round, on
committed worlds held at the club's row (`holding`, `waitingOn`): the acceptance that completes a roster (joined, then
NOT_FOUND to the removal; or removed, then NOT_FOUND to the acceptance and the revision ended); the last approval of a
roster the candidate accepted (applied, then NOT_FOUND; or removed, then VERSION_CONFLICT and nothing applied); and
the proposer's leave (left, then NOT_FOUND, FQ121 having ended the candidate; or removed, then left). The route's
answers and refusals are in `services/api/src/clubs/roster.test.ts`.

The review added five more (section 6): a suspended club's proposer, a proposer whose account's deletion has begun and
a proposer who left and came back get NOT_FOUND; a name's revision carries as a name's; and an account that accepted
is told alike whatever ended the roster. With them the file has 18 tests.

## 4. Design handoff 11

The ios lane owns the design handoffs and the inventory (`docs/MILESTONES.md`, "Lanes"), so the brief is here, in this
lane's plan, as the founder's instructions allow ("in the stage plan or the PR, as one block"), and the ios lane checks
what comes back, adds the states to `design/reference/INVENTORY.md` and builds the screens. It asks for 9 frames: the
removal on the setup list's More menu, its confirmation, the list after it and its failure (G01), the removal of a later
addition from an active club's Members by its proposer (G05), and the dark and largest-text forms of the first and the
fifth, with three written questions. Until it comes back, the app's states are "built from spec" from the brief's
readings; the operation needs no frame.

How to send it: paste the block below, whole, into the Claude Design project that made handoffs 1 to 10, with the
repository linked (if that project no longer has the earlier work, attach what the block's Sources line names), and
attach the export as a .zip in the ios thread with the message "Design handoff 11", as handoffs 0 to 10 came.

```text
Design handoff 11: stage B1, removing someone invited who hasn't joined

Sources: the linked Tadayo repository: docs/tadayo-design-book-2.1.md, docs/tadayo-build-spec-v3.md, docs/tadayo-new-direction-addendum-r1.md (the founder's new direction, revision 1), and design/reference/, with the 2.1 renders, handoffs 1 to 10 in design/reference/claude-design/, the named frames in design/reference/screens/, and the brand in design/reference/brand/ (brand-tokens.md, brand-components.png, the wordmark and the icon; its README.md says which revision and which handoff each comes from). design/reference/INVENTORY.md lists every state. If the repository isn't linked: the attached Tadayo_UI_UX_Design_Book.pdf (design revision 2.1), Tadayo_v3_Build_and_Design.pdf, the new direction addendum (PDF), brand-tokens.md, brand-components.png, and the exports of handoffs 1 to 10. Use the brand's tokens, cover colours and components as they are (revision 1.1, with handoff 7's component sheet); if you have Tadayo's design system, it holds the same brand.

What to design: one frame per state, 393×852 points, each titled with the state's exact name, in the order listed below (if an export loses the titles, the order identifies the frames).

Why: today a person who is invited keeps their place until they join or a member declines the whole roster. Revoke link stops only the link (handoff 9's revokeLink: "You can create a new link for Alex later."), and a club has six places, members and invited people together. So someone who never answers holds a place for good: a creator who invited five people, one of whom never answers, can never invite anyone else, and a creator still alone can only abandon the club. The founder chose (FQ148): whoever invited a person can remove them while they haven't joined. The server then ends that person's invitation. If anyone else is still invited, the roster without the removed person goes to every other member to approve again and to each person still invited to accept again, as when a member leaves (FQ121); if nobody else is, the proposal ends and the place is free.

A. Removing someone from the setup list (handoff 1's G01-invite-people, handoff 2's G01-invite-people-add, handoff 4's More menu and G01-invite-people-revoked, handoff 9's G01-invite-people-action-failed)

1. G01-invite-people-remove: Ben's invitation list for Sunday people during setup, with handoff 4's fixture (Maya shared, Alex, Sam and Nina not shared, Debby accepted), and the system's More menu open on Nina's row: Revoke link as today, and the new action that removes Nina from the invitation. Draw the menu and name the action. Say whether it is offered on every row of someone who hasn't joined (shared, not shared, revoked, expired, accepted, needs to accept again) or only on some, and why.
2. G01-invite-people-remove-confirm: the system's alert before the removal, in the form handoff 9 gives Revoke link (a title naming Nina, a body, a destructive action and a cancel). The body says what happens: Nina's links stop working and Nina can't join from this invitation; Ben can invite Nina again later as a new invitation; and, when anyone else is still invited, they review the updated roster again. It never says anything about Nina's answers.
3. G01-invite-people-removed: the list after the removal: say whether Nina's row goes at once or shows a short state first, and what VoiceOver announces once ("Nina was removed from the invitation." or your words). Create an invitation appears again when a place is free.
4. G01-invite-people-remove-failed: the removal got no answer, or was refused, in handoff 9's G01-invite-people-action-failed form: the rows as they were, the line above Done for now. Give both lines: no connection, and refused.

B. Removing a later addition (handoff 10's G05-members-with-proposed)

5. G05-members-with-proposed-remove: Kitchen table's Members (handoff 10's frame 5): Ben, Maya, Alex, Sam and Debby with one day each, and Leila's proposed row after them, but seen by Ben, who proposed Leila. Proposing counts as Ben's approval (FQ60), so for Ben the row opens nothing today (FQ143's default). Draw where Ben removes Leila: for example a menu on the row, a swipe action, or a screen the row opens; other members never get the action, and it never shows on a member's row. The confirmation and failures are frames 2 and 4's, with Leila's name and the club's.

C. Dark and largest text

6. G01-invite-people-remove-dark: frame 1 in the adopted dark tokens.
7. G01-invite-people-remove-xl: frame 1 at accessibility 5.
8. G05-members-with-proposed-remove-dark: frame 5 in the adopted dark tokens.
9. G05-members-with-proposed-remove-xl: frame 5 at accessibility 5.

Answer in words, with a frame only if your answer changes a screen:
- What the others see, which the app builds from existing states unless you say otherwise: the removed person's link answers as a revoked link (G02-revoked: neutral, never "removed", no name, FQ59); if the removed person had accepted, their invitation shows G03-declined (it didn't go ahead, never who or why); each person still invited sees G02-changed; each other member sees handoff 8's "Review the updated roster". Say whether any of them needs different words.
- Whether Revoke link's alert body (handoff 9: "Alex won’t be able to use this link. You can create a new link for Alex later.") needs to change now that removing exists beside it, so nobody revokes when they mean to remove, or the reverse.
- Whether the removal needs a busy form while it's out ("Removing…"), as Revoke link has "Revoking link…".

Content: the book's fixture clubs. Sunday people during setup: Ben (the creator and viewer in frames 1 to 4, 6 and 7), Maya shared, Alex, Sam and Nina not shared, Debby accepted. Kitchen table: Ben (the viewer in frames 5, 8 and 9), Maya, Alex, Sam, Debby, one day each; Leila proposed by Ben. Nothing invented.

Rules that apply: book p24 (club details), p30 (member approval: never who declined, no reason asked), p33 (a proposed roster never passes for an active member list), p34 (components), p35 (tokens), p41 (routes and labels); spec 04 (an invitee understands the roster before accepting; changing the people a creator selected never bypasses acceptance) and spec 32; T7, T14, T15, T33, T41 to T43. Only the person who invited someone sees or uses the removal; nobody is told who removed whom, and nothing is counted, seen or spoken. Names, not inferred pronouns. Native iOS controls. The type is the iOS system font at the book's sizes; in the frames, Arimo stands in for it, included in the export.

Questions I need answered in the design:
- Where the removal lives on the setup list, on which rows, and its words (frames 1 to 4).
- Where the person who proposed a later addition removes them in an active club (frame 5).
- The three written questions above.

Dark and large-text frames: frames 6 to 9, titled <state>-dark and <state>-xl. 9 frames in all.
```

## 5. Not in this slice

- Expiring candidates on their own (FQ148's third option, not the default).
- Changing Revoke link (FQ148's second option, not the default).
- Where a later addition's link is shared and managed, which has no render yet (`createInvitation`'s description).

## 6. Review, round 1

Two fresh subagents reviewed the first commit, `526ffc2`, one general (correctness and the tests) and one for privacy
and security. Neither found a blocker. Their 12 findings are each fixed or answered in the second commit.

- **P1 (should-fix): nothing asked who may remove an open candidate, nor in a suspended club.** The cells ask every
  role to remove Ben, who has joined, and remove an open candidate only where the viewer proposed someone, which no
  viewer can in a suspended club. A planted `activeMember` without its suspended-club condition passed every test.
  Fixed:
  - `tests/src/db/remove-candidate.test.ts`, "who the club and the account let remove, and a name's revision carried":
    a suspended club's proposer and a proposer whose account's deletion has begun get NOT_FOUND, and nothing moves.
    The links test also reads `previewInvitationWeb` for the removed candidate's live link, which names nothing.
  - `tests/src/privacy/matrix.test.ts`, "who removes someone invited who hasn't joined, as each role in each state".
    Every role, in every state and phase, asks to remove Mo, whom Ana invited and who accepted (`tests/src/matrix.ts`
    `invite`, which now lists the club's active members and keeps Mo's token in `INVITE_TOKENS`). The gate, then
    `candidateRemovalOutcome`, judges each answer; the rows show what moved; Mo previews the link after each request.
    Pinned by hand: Ana removes Mo in seven states, the first time in the first phase and alike in the three after it.
    In a suspended club and once gone, Ana gets the neutral not-found, and once deleting the gate's 401. Mo's preview
    waits in every world Mo isn't removed from but a suspended club's, where it is the neutral not-found (FQ80).
  - The T14 audit row says what the matrix asks.
- **P2 and G4 (one finding, low): an account that had accepted could tell a removal that carried others from a
  decline,** by sending `acceptInvitation` again: NOT_FOUND against VERSION_CONFLICT at its old version. Fixed in
  `packages/domain/src/clubs/accept-invitation.ts`, step d. (section 2). `remove-candidate.test.ts`, "what an account
  that accepted is told, whatever ended the roster", pins the three cases. FQ121's leave answers the same way now,
  and `tests/src/db/leave-club.test.ts`, `tests/src/privacy/invitation.ts` `acceptOutcome` and its test changed with it.
- **G1: the matrix couldn't see a write made by a refused removal.** Fixed: the rows are read again after the refused
  removals and must be as before them.
- **G2: no test carried a name's revision.** Fixed: "carries a name's revision as a name's: nobody's approval, the
  proposer's included (FQ84)".
- **G3: the matrix's leave no longer met an open revision.** Fixed (section 2): `leftOpen` is pinned to the cells where
  nobody else could run the table, and "the leave ran" pins the leaves that met an open revision (the FQ88 role, in its
  two states with nobody else).
- **G5: no test for a proposer who left and came back.** Fixed: "names nothing to a proposer who left and came back:
  the candidate was another interval's".
- **G6: the approvals test couldn't see approvals carried over.** Fixed: a third member approves before the removal and
  is asked again after it.
- **G7: a comment said the caller is read again as "the same interval".** Fixed: it says what the code reads, an active
  membership under the lock, as `revokeInvitation` reads it, the candidate then matched to that interval.
- **G8: comments out of date.** Fixed in the headers of `services/api/src/clubs/roster.ts`, `roster.test.ts` and
  `remove-candidate.test.ts`. The matrix's "the link stays live, and its revision open, for the rest of the cell" is
  true again with G3's fix.
- **G9: the records' wording.** Fixed: the spec 04 row's count, table 4.1's "where the role proposed someone", `swift`
  named in "Not verified" (`ci`'s `swift` job builds `TadayoAPI` from `openapi.yaml`), and FQ148 in the journal's
  section 0.7. FQ146 is the ios lane's line there.
- **G10: design handoffs are the ios lane's by the Lanes table.** Answered: the api lane wrote handoff 11's brief
  because the founder chose the operation on the api lane's card, and the coordinator reserved the number with FQ148.
  `design/reference/INVENTORY.md` stays the ios lane's. `docs/PROGRESS.md`'s api section asks the ios lane to add the 9
  states as `requested 11`, and the ios lane was told at 23:03 UTC on 2026-11-26.
