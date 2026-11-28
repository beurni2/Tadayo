# ios/b1-remove-invitation: removing someone invited who hasn't joined

Stage B1, after the api lane's `removeCandidate` (PR #145, merged as `d95bbbc`: `DELETE /v1/candidates/{candidate_id}`,
`docs/plans/api-b2-unpropose.md` section 2) and design handoff 11 (the founder's export of 27 November 2026, checked in
`docs/design/handoff-11/check/handoff-11-check.md` on PR #149, whose section 6 lists what this PR builds). FQ148, the
founder's answer: whoever proposed a person can remove them while they haven't joined, which frees their place of the
club's six.

## 1. The sources

- Spec 04 (an invitee understands the roster before accepting; a change never bypasses acceptance), spec 32 (the
  API), A01 (six people); T7, T14, T15, T19, T33, T41 to T43, T45, T47, T52; ADR-037 (the kept links); FQ59, FQ60,
  FQ77, FQ120, FQ121, FQ143, FQ147, FQ148, FQ149.
- Handoff 11: `IMPLEMENTATION.md` sections 1 to 9, `component-contracts.json` and `copy-contracts.json` under
  `handoff11`, its nine frames (`design/reference/screens/G01-invite-people-remove*.png`, `-removed`,
  `G05-members-with-proposed-remove*.png`).
- Handoff 4's More menu and revoke alert, handoff 8's `usedInvitationRow`, handoff 9's `setupLinks` (the row states
  and `mutationFailure`), handoff 10's frame 5 (the proposed row's chevron).
- `docs/design/handoff-7/ios-lane-needs.md` items 81 to 83: where this PR keeps something else until the next brief.

## 2. What it builds

### The client (`TadayoAPI`)

`TadayoAPIClient.removeCandidate(_:)` from the contract: `.ok` whose `candidate_id` is the one asked for (any other
answer is `unreadable`), `.unauthorized` signs out, `.forbidden` reads `PROFILE_INCOMPLETE` alone, `.notFound` is
`notFound`, `.tooManyRequests` is `unavailable`, `.badRequest` is `refused`, any other status as `failure(status:)`
reads it. No key: repeating the removal returns the same answer and changes nothing, so the server takes none
(`removeCandidate`'s description; T19 is about commits a retry could repeat).

### The setup list (`G01-invite-people`; `InvitationListModel`, `InvitationRow`)

- **The More menu on every row of the caller's own candidates** (handoff 11's section 1 table). `InvitationRow` takes
  `removable:`; the setup list passes true, the person's invitation page false (it stays link-only: item 82).

  | Row | More |
  |---|---|
  | No link yet | Remove invitation |
  | Live, held (Shared or Not shared) | Revoke link, Remove invitation |
  | Live, not on this phone | Revoke link, Remove invitation |
  | Revoked | Create new link, Remove invitation |
  | Expired | Remove invitation |
  | Accepted | Remove invitation |
  | Needs to accept again (held or not) | Remove invitation |

  Each row's own action stays as it is. Revoke link becomes the menu's ordinary item with the `link` symbol; Remove
  invitation is the destructive one, with `trash` (frame 1).
- **The confirmation** (frame 2): the system's alert, "Remove {name}’s invitation?", Remove invitation (destructive,
  never the default) and Keep invitation (cancel). Its body: `withOthers` when the open revision lists anyone else,
  whoever proposed them, `last` otherwise (`InvitationList.othersInvited(besides:)`), never from the target's answer.
  Keep invitation changes nothing. If the row goes while the alert is open, the alert goes with it.
- **Revoke link's new body** (section 7): "{name} won’t be able to use this link. {name} stays in the proposed roster
  for {clubName}, so this won’t free a place. You can create a new link for {name} later." Title, Keep link and
  "Revoking link…" stay.
- **The removal** (`InvitationListModel.remove(_:)`), only for a row whose menu offers it, and only while nothing else
  of the list is on its way: one roster or link change at a time (section 8). While it's out (`removing`), the row
  says "Removing…" with the system's indicator, its value "In progress", announced once, politely, as "Removing
  {name}’s invitation." only once the model starts it (`canRemove`); every row's controls and Create an invitation
  wait; Done for now and Back don't. While any row's link action is out, every row's Remove invitation waits too.
- **On the server's answer** (section 3): the row goes at once, every link kept for that person goes from the book
  (`InvitationLinkBook.dropCandidate`, even when the session or the selected club changed meanwhile: the book is the
  account's, and after a sign-out or a switch it holds nothing to drop), and the list is read again, which says whether Create an invitation is back and
  what the others' rows read now (Debby's Needs to accept again in frame 3). A read requested before the answer can't
  bring the row back; one requested after it decides. Then "{name}’s invitation was removed." is said once
  (`removal`), and VoiceOver's focus goes to Create an invitation if it shows, else the row now in the removed one's
  place, else the one before, else Done for now.
- **A failure** (section 4), the rows kept as they were, read again after:
  - no answer, or one this build can't read (handoff 11's "no usable command answer"): "Couldn’t confirm that
    {name}’s invitation to {clubName} was removed. Check your connection and try again.";
  - any other failure but these two: "Couldn’t remove {name}’s invitation to {clubName}. Try again.";
  - not found (the person joined, or the club or the candidate is no longer the caller's): no line; the list is read
    again, and if the row has gone, "Invitation list updated." is said once; a row still there gets
    `handoff11.remove.unavailable`, "This invitation is no longer available.", never "Try again" (the check's
    section 4: no endless retry);
  - signed out: the session ends.

  The line sits above Done for now in handoff 9's form, said once, and goes as the other lines do: another action
  starting, a read whose answer no longer offers the removal for that person, or leaving. A read that no longer lists
  the person never says they were removed (section 4: joining also takes the row away).

### Members (`G05-members-with-proposed`; `ClubDetailsModel`, `Roster`)

- **A separate More on the viewer's own candidate's proposed row** (frame 5), holding Remove invitation alone,
  whatever the viewer's decision on the revision (`Roster.Proposed.removable`: the candidate's proposer is the viewer).
  Other members' rows and other people's candidates get none. Where #146's route opens the person's invitation page,
  or FQ147's opens G03-approve, the row keeps it and its chevron, and More comes after them (item 81, built from spec);
  the identity and More are separate elements.
- **The same confirmation and words**, with the person's name and the club's.
- **The removal** (`ClubDetailsModel.remove(_:)`): "Removing…" with the indicator 8 under the Proposed tag, every
  More and every proposed row's route waiting (section 8: one change in flight per club, so no approval or link
  action starts meanwhile); every More also waits while the person's invitation page or the name step, left by Back,
  has an action out (`removalCanStart`). Then the row goes at once, the members are read again quietly
  (`refreshMembers()`: what's shown stays while the read is out, and stays if it fails), and "{name}’s invitation was
  removed." is said once. The club's details are read again after any answer but a session's end, so Invite someone
  shows again in Club details once the removal freed a place (FQ148). The failure line, the same words, sits 24 under
  that row, the footer 32 under the line; it goes on another removal, a read that no longer offers the removal for
  that person, or Members shown again (`loadMembers()`). "Members updated." is said only when a read after a failure
  no longer lists the person; a not found with the person still listed gets the unavailable line, as the setup list's.
- **VoiceOver's focus after the row goes** (built from spec; handoff 11 says where it goes only on the setup list):
  the proposed row now in its place, else the one before, else the last member's row (`Roster.focusAfterRemoval`),
  as the setup list's goes to the row in its place or the one before; Members has no Create an invitation or Done for
  now to take it.

### What it leaves as the server answers it (the check's section 5)

- No idempotency key and no roster-version guard, which handoff 11 asks for: `removeCandidate` takes neither, by
  design. The alert's last paragraph can be stale if the roster changes while it's open; every answer is followed by a
  read.
- A candidate something else ended a moment before is answered as removed, so the app says "{name}’s invitation was
  removed." there too (item 83, a known difference in the inventory).

## 3. Tests first, on Linux

`swift test --package-path packages/swift/TadayoCore` and `--package-path packages/swift/TadayoAPI`.

- `InvitationRowTests.eachStateAndKeptLinkGivesItsStatusActionAndMenu`: every state's menu with removal, and
  `aPagesRowNeverOffersRemoval` for `removable: false`.
- `InvitationListModelTests` (new, in a `Removal` suite): the removal sends the candidate's id and nothing else; the
  row goes on the answer though the read again fails, its kept link with it, and the success is said once; a read
  asked before the answer doesn't bring the row back, one asked after it decides; Create an invitation comes back only
  from the read; the confirmation's body follows the open revision's other candidates, another member's included; no
  answer, a refusal and an unreadable answer each keep the row with their line; a not found reads again and says the
  list was updated when the row went, with no line; signed out ends the session; one change at a time (a removal
  waits for a link action and the reverse; Create an invitation waits); another member's candidate and a page's row
  are never removed; an answer after the session ended changes nothing; the line goes on a read that no longer offers
  the removal.
- `ClubDetailsModelTests` / `InviteLaterTests`: `Roster.Proposed.removable` for the viewer's own candidate only,
  whatever the decision; the removal from Members (row gone on the answer, quiet read, line under the row, the line
  cleared by `loadMembers()`); a quiet read that fails keeps the roster.
- `ClubCallsTests`: `removeCandidate` sends `DELETE /v1/candidates/{id}` with no key and no body; its answers become
  their failures; an answer naming another candidate is unreadable; `ClubOperation.removeCandidate` joins every table
  that loops over the club calls (404, 401 refresh, 5xx unread, no key).

## 4. The states to snapshot (`TadayoSnapshotTests`, iOS 27.2)

Changed, since every setup-list fixture holds Debby accepted and Debby's row gets a More (the check's section 6), each with
`-dark` and `-xl`: `G01-invite-people`, `-revoked`, `-accept-again`, `-used-missing`, `-live-not-held`, `-expired`,
`-action-failed`; and `G05-members-with-proposed-own` (More beside #146's chevron). New: `G01-invite-people-removed`
(frame 3's list), `G01-invite-people-remove-failed` (frame 4), `G01-invite-people-removing` (built from spec),
`G05-members-with-proposed-remove` (frame 5, the menu closed: a snapshot can't hold the system's menu or alert),
`G05-members-removing` and `G05-members-remove-failed` (built from spec), each with `-dark` and `-xl`. The menus and
the alert are proved by UI tests instead: the setup list's Nina through More, Remove invitation, the alert's words and
Keep invitation, then Remove invitation, the row gone; Members' Nina, in the invite-later flow, the same, with the
`last` body.

## 5. Not in this PR

- Removal on the person's invitation page (item 82) and a frame of Members' row with both the route and More (item 81).
- Anything for the other audiences: their states are as built (handoff 11's section 6).
- A device check of VoiceOver's focus and announcements after a removal: it goes into the next TestFlight build's
  steps.
