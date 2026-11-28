# Tadayo · Design handoff 11

Stage B1 · 26 November 2026

This handoff adds the founder’s FQ148 decision: the person who invited someone may remove that invitation before the person joins. It supplies nine requested frames and the implementation contracts, including confirmation, uncertain failure, later additions, accessibility and the other audiences’ existing states.

The distinction is explicit: Revoke link stops a link while keeping the invited person’s place. Remove invitation ends that invitation and frees its place. Neither action removes an active member.

## Deliverables and precedence

Open index.html for the ordered inspection gallery. The implementation PDF includes the same screen proofs and this complete guide. SVG frames are 393 × 852 points with Arimo outlined; PNGs are 786 × 1704. Arimo regular, bold, variable and its licence are included. Use native iOS controls and the system font in production.

Brand revision 1.1, its cover colours, wordmarks and handoff 7’s whole component sheet remain unchanged. Menus and alerts in these exports are schematic native controls; iOS owns their actual placement, material, size and motion. Do not implement them as custom floating app cards.

component-contracts.json and copy-contracts.json preserve all earlier handoff 10 structured entries. Their handoff11 sections supersede only the stated scopes. In particular, accepted/used/expired rows gain inviter-only removal; that does not make their links revocable or replaceable. screen-copy.json records each proof’s text, native controls, semantic groups and modal state. frame-manifest.json records exact order, dimensions, geometry and scroll offsets. source-provenance.json records the repository source hashes and the supplied brief’s FQ148 authority.

| Order | Exact frame title | What the proof shows |
|---|---|---|
| 01 | G01-invite-people-remove | Ben’s setup list, with Nina’s native More menu open. |
| 02 | G01-invite-people-remove-confirm | Named destructive alert and Keep invitation. |
| 03 | G01-invite-people-removed | Confirmed Nina removal, updated Debby state, Create an invitation available. |
| 04 | G01-invite-people-remove-failed | Last verified rows retained, network/uncertain-outcome error above Done for now. |
| 05 | G05-members-with-proposed-remove | Ben’s separate More control on Leila’s proposed row in Kitchen table. |
| 06 | G01-invite-people-remove-dark | Frame 1 in the adopted dark tokens. |
| 07 | G01-invite-people-remove-xl | Frame 1 at accessibility 5, one legal scrolling document and a native menu. |
| 08 | G05-members-with-proposed-remove-dark | Frame 5 in dark tokens. |
| 09 | G05-members-with-proposed-remove-xl | Frame 5 at accessibility 5, scrolled to Leila and the member footer. |

## 1. Where removal lives and who gets it

Use the existing More control on the invited person’s setup-list row. The action is “Remove invitation”, with a destructive role and the system’s trash symbol. Its accessible label is “Remove invitation for Nina”; the More control is “More options for Nina’s invitation”. Substitute the row’s actual name. The native menu’s context is “Nina’s invitation”. Every control has at least a 44-point target, and symbols have no duplicate accessibility focus.

Only the member whose current membership id matches the invited person’s proposed_by gets the action. Being the club creator is not a general permission to remove someone another member invited. The server rechecks ownership and that the person has not joined at commit. A name match is not authorization.

Offer it in every still-invited state, including accepted. Accepting a roster does not necessarily mean joining: the proposal can still await member approval or a newer exact-roster review. A revoked or expired link also does not end the person’s proposed place. Removing must work without a saved raw link or even a successfully created first link.

| State of the inviter’s own row | More menu | Existing row action / restriction |
|---|---|---|
| Shared or Not shared, live link | Revoke link; Remove invitation | Share again / Share link stays as appropriate. |
| Live link not held on this phone | Revoke link; Remove invitation | Existing Create new link and replacement explanation stay. |
| Link revoked | Create new link; Remove invitation | Do not reintroduce Revoke link. |
| Link expired unused | Remove invitation | Existing Create new link stays; expired link is not revoked again. |
| Accepted, not joined | Remove invitation | No Share, Create new link or Revoke link. |
| Needs to accept again / used | Remove invitation | Share again only if the existing payload is held; otherwise the adopted missing-link words. No replacement or revocation. |
| Invited place exists, first link not yet made | Remove invitation | Existing first-link creation stays; no unusable Revoke entry. |

An ended, joined or inaccessible target is not a removal destination. Other members never receive the action or its accessibility metadata. Do not add it as a swipe action, to G03’s whole-roster approval controls, or to any active member’s row.

Frame 1 retains the requested fixture: Maya Shared; Alex, Sam and Nina Not shared; Debby Accepted. Nina’s More contains Revoke link first and Remove invitation second. The stronger destructive menu emphasis belongs to Remove invitation; both operations still confirm before changing anything. Accepted rows now have a removal-only More for their own inviter.

## 2. Confirmation before removal

Use the system alert in frame 2, not a new sheet. The title is “Remove Nina’s invitation?” Its destructive action is “Remove invitation” and its cancel action is “Keep invitation”. The latter has the native cancel role; do not preselect the destructive action.

The exact body for this fixture is:

Any links for Nina will stop working. Nina won’t be able to join Sunday people from this invitation.

You can invite Nina again later with a new invitation.

Anyone else still invited will review and accept the updated roster again.

The body is identical regardless of Nina’s answer or link state. It never says Nina has not answered, has accepted, is waiting or has been approved. “Any links” is accurate when no link was made and when a previous link is already unusable.

When nobody else would remain invited, omit the final paragraph. For Leila, the sole proposed addition in Kitchen table, use:

Any links for Leila will stop working. Leila won’t be able to join Kitchen table from this invitation.

You can invite Leila again later with a new invitation.

Choose this variant from the current authorized roster, not from whether the target’s link says Accepted. The alert names the exact target and club under review. If those facts change while it is open, refresh/review them instead of silently applying the confirmation to another person or roster.

Keep invitation closes the alert without a mutation, key consumption or token purge, and restores focus to the originating More. Confirming dismisses the alert and starts the row’s busy state. Native alert speech announces its title/body once; all background rows and actions are inaccessible while it is open.

## 3. Successful removal in the setup list

Wait for an authoritative command acknowledgment. Then remove Nina’s row immediately; do not show a temporary Removed row, a countdown, an undo that cannot restore the old consent, or a shared tombstone.

Announce “Nina’s invitation was removed.” once, locally to the person who made the command. This is private action feedback in the affected visible context, not a push or club message saying who removed whom. If that view has been left, reconcile silently rather than showing a global toast. Visually, the missing row and the newly available creation control are sufficient feedback; no extra banner is added.

Move accessibility focus to Create an invitation if it appears. Otherwise use the next remaining row, the previous row when removal was at the end, or Done for now for an empty list. Do not leave focus on a disappeared More control.

Create an invitation reappears only after the server confirms proposal permission and available capacity. It opens the existing person-name step. There is no numerical place counter, progress indicator, automatic replacement invite or re-use of Nina’s old invitation.

Frame 3 also updates the remaining rows correctly. Debby accepted the earlier roster, so the newer roster needs Debby’s acceptance again. The status becomes “Needs to accept again”, with Share again and a removal-only More for Ben. Debby’s held link stays usable for that new exact-roster review. Maya’s Shared and Alex/Sam’s Not shared continue to describe their link-sharing state; none is an acceptance of the new revision. Do not keep Debby labelled Accepted from the old response.

If no invited person remains after removal, the proposal ends and the place is free. If others remain, the server makes the revised roster and requires their new acceptance and the required current-member approvals. The client reads the new revision and its own my_decision; it never carries a previous approval forward on its own.

## 4. Removal without an answer, or refused

Keep the last verified rows, including Nina. No optimistic deletion is drawn and no confirmed commit is rolled back locally. The exact messages are:

| Branch | Exact visible line and identical VoiceOver failure announcement |
|---|---|
| No connection / no usable command answer | Couldn’t confirm that Nina’s invitation to Sunday people was removed. Check your connection and try again. |
| Answered retryable refusal | Couldn’t remove Nina’s invitation to Sunday people. Try again. |

Frame 4 uses the adopted footer-error anatomy: the existing exclamationmark.circle plus metadata 13/18 destructive text, ending 24 points above Done for now. The scroll body ends 24 above the message, so nothing overlaps rows. The message and footer grow as needed at larger text. Rows and controls return to their last verified idle state while still eligible.

Read the failure once politely and restore the affected row/More focus. The glyph is decorative. Keep the message through scrolling, menus or canceled sharing; clear it on a fresh confirmed mutation attempt, authoritative reconciliation, or leaving this screen. Do not repeatedly announce it on re-render.

Retry through the same More → Remove invitation → confirmation route, using the same unresolved command key and reviewed target/version. No new footer Retry control is introduced. A fresh roster or target is a new reviewed intent, not a blind replay of the old operation.

A reload that merely omits Nina does not prove removal: Nina could have joined while the command’s answer was lost. Apply the authorized data without guessing why. If a neutral refresh announcement is needed, use “Invitation list updated.” or “Members updated.” The named removal success announcement requires a committed-command acknowledgment or its successful idempotent replay.

An authoritative joined/ended/inaccessible target cannot remain an endlessly retryable removal. Refresh the authorized parent and remove the ineligible action. Use the existing neutral unavailable recovery where needed; never reveal an unauthorized reason or somebody else’s hidden activity. This qualification prevents a permanent “Try again” loop without adding a new refusal screen.

## 5. A later addition in active Members

Frame 5 is Kitchen table as Ben sees it: Ben · You, Maya, Alex, Sam and Debby, with one day each. Leila follows as a proposed person, with Proposed by Ben and the existing Proposed pill. The current-member footer still counts five and uses the existing New York/time lines. Leila is not counted.

Keep Leila’s identity/tag group static for Ben’s already-recorded decision. Add a separate trailing More control with the same 44-point minimum, accessible “More options for Leila’s invitation”. Its native menu contains “Remove invitation”, accessible “Remove invitation for Leila”. No unprovided link status for Leila is invented, and no approval chevron or new whole-row navigation is added for Ben. Link-only management remains in its existing own invitation manager.

Reserve the More target and a 12-point gap from the text. The name/proposer/tag content starts at 69 and ends at 321 in the 393-point reference. It grows and wraps without clipping. The combined identity element and More are separate accessible elements.

Maya and other members never get Leila’s removal control. Their own pending approval route stays handoff 10’s; current active members’ rows never get removal menus. If the inviter has a pending name-revision approval, the main row keeps that review route and the separate More remains available for the owned invitation. Removal eligibility never depends on approving first. This adds invitation ownership tools, not an admin role or a way to remove a friend who joined.

Use frame 2’s alert templates with Leila and Kitchen table. Leila is the last proposed addition in this fixture, so the re-review paragraph is absent. Use frame 4’s named error templates too; the complete network version is “Couldn’t confirm that Leila’s invitation to Kitchen table was removed. Check your connection and try again.” The refusal is “Couldn’t remove Leila’s invitation to Kitchen table. Try again.”

Members has no Done for now button. On this screen the same error component appears 24 after Leila’s proposed row, followed by the ordinary member footer 32 after the message, in the same scroll. Retain the roster and row actions when still eligible. Do not import the setup screen’s button to make the error placement work.

After confirmed removal, Leila’s proposed row disappears and the five current members remain. There is no replacement review prompt when no invited person remains. A later invitation goes through the existing authorized Invite someone flow in Club details.

## 6. What the other audiences see

No new words are needed for these audiences. Reuse the existing states, with the distinction between a raw link and an account-owned accepted invitation made explicit.

| Audience / entry | Existing state | Required boundary |
|---|---|---|
| Open a removed person’s raw link | G02-revoked; signed-out G02-web-revoked | Neutral unavailable response as for unknown/revoked links. No name, inviter, removed word, actor or cause. |
| The removed person’s own already-accepted invitation | G03-declined from their account-owned invitation record | Invitation didn’t go ahead; “You can close this invitation.” No who or why. |
| Another invited person, when a replacement revision exists | G02-changed exact-roster review | Accept the updated exact roster again. Their link stays usable; existing missing-token recovery remains. |
| Other members, when a replacement revision exists | Handoff 8 “Review the updated roster” where applicable | Review new id/version and own server-returned decision. Never replay an old decision or count approvals. |
| An old approval when the last invitation ended | Existing neutral approval-unavailable state / refreshed Members | No replacement roster exists, so do not send people to a nonexistent re-review. |

Do not add a removed-person notification, a shared “Ben removed Nina” receipt, a removed_by field in visible data, a reason label or a tombstone. The updated exact roster can necessarily show that a name is no longer present. This does not justify a promise that small-group inference is impossible; the product simply does not identify who removed whom.

## 7. Make Revoke link’s narrower effect clear

Change its body. Keep the existing named title, destructive confirmation, Keep link and Revoking link… behavior. For Nina the new body is:

Nina won’t be able to use this link. Nina stays in the proposed roster for Sunday people, so this won’t free a place. You can create a new link for Nina later.

That distinguishes the two operations at the final choice: revoking retains the invitation/place and can produce a replacement link; removing ends this invitation and requires a new invitation later. Accepted and used links remain nonrevocable and nonreplaceable. The new removal-only More on those rows does not widen their link permissions.

## 8. Busy state while removing

Yes, removal needs a visible busy form. After confirmation, dismiss the native alert and keep the affected row in place. In setup, show a native indeterminate spinner and “Removing…” in the row’s status line, retaining the last link state in the model for reconciliation. Its Share/Create/More controls are unavailable; do not show Removed or erase the row before confirmation.

In Members, keep Proposed by and the Proposed pill. Add the same “Removing…” metadata line 8 below the pill with an indicator; the row grows and More is unavailable. This is invitation work in progress, not approval progress.

Expose value “In progress” and announce “Removing Nina’s invitation.” or “Removing Leila’s invitation.” once politely, using one announcement source. Do not time it, invent a percentage, or claim a result. On failure restore the verified idle state and the named failure line.

Use one membership/proposal-changing command in flight per club; pause competing roster/link mutations rather than queuing an opposite intent. Native Back/Done may leave the screen, but leaving cannot undo a mutation that may already have committed. The model reconciles on return and ignores UI callbacks after an account/club change.

## 9. Native dark and accessibility behavior

Frames 6 and 8 use the adopted dark tokens. Frames 7 and 9 use the existing accessibility 5 role approximations and legal scroll offsets: every meaningful label grows and wraps. Menus use intrinsic rows, the existing body role and native destructive styling. They may cover lower row details; the selected identity and native source control remain recognizable. iOS owns final menu positioning and may reposition or scroll it.

The setup footer grows with Done for now and remains separate from its scroll body. Members remains one list scroll with its footer after the roster. Decorative avatars stay their established image sizes; names and statuses carry the scalable meaning. Background content is excluded from accessibility while a menu or alert is open, and native dismissal returns focus to its source. The destructive action is never the default selected control.

## 10. Required API integration

The founder’s supplied brief is the authority for FQ148. At the fetched main hashes, clubs.ts does not yet declare this removal command, and the handoff 11 brief is not present in the repository. This pack specifies the UI and the required command behavior, not an already shipped endpoint.

The API lane must add an owner-scoped operation for the still-invited target, with a stable candidate id, the authorized club/current membership, a current-roster concurrency guard and an idempotency key. It must atomically end the target, invalidate all target links and either create the required successor roster for the remaining invitees or end the proposal. Follow FQ148/FQ121 for review and acceptance; any implicit proposer approval is a server result, never a client assumption.

Do not approximate this by Revoke link, by Decline on the entire roster, by deleting a local row, or by ending an active membership. A person who joined while confirmation was open must not be removable through the stale invitation action. A changed identity/roster must be re-reviewed before a new command intent; never silently retarget by display name.

Retries of the same unresolved command reuse its key. Its successful replay must still be able to acknowledge that committed removal after the candidate has ended, while the caller remains authorized. A different reviewed target/version is a new intent. Parent lists and capacity come from the authoritative result or a follow-up read, not a guessed local decrement.

After confirmed removal/end purge that target’s saved link. Keep the other valid accepted/used link payloads needed for their updated review, particularly Debby’s in frame 3. Tokens stay in their adopted account-scoped store and link fragments, never logs, referrers or analytics. Add no actor-identifying removal telemetry; use only existing spec 36 pseudonymous events.

## Verification

The pack checks exact nine-frame order/names, point/pixel dimensions, Arimo outlines/fonts, unchanged brand bytes, cumulative handoff 10 JSON preservation, copy-key references and curly apostrophes, minimum 44-point targets, correct modal focus scope, removal-only menus on accepted/used rows, no removal on active-member rows, confirmed-only row disappearance, Debby’s renewed-acceptance status, error/footer separation and legal large-text scrolling. PDF pages and all frame proofs are rendered and visually reviewed.

These are static design/export checks. Native iOS font metrics, menu/alert behavior, VoiceOver focus and the new server command still require implementation verification, including lost responses, idempotent replay, joining or roster changes during confirmation, and account-switch isolation. No app, server, membership or invitation was changed while creating this handoff.
