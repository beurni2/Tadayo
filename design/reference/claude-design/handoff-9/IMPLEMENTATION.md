# Tadayo · Design handoff 9

Stage B1 · 22 November 2026

This handoff supplies the 20 requested states, in the brief’s order, and the written decisions below. It continues design book 2.1, build spec v3, new direction addendum r1, and handoffs 1–8. Brand revision 1.1 and handoff 7’s whole component sheet remain unchanged. There are no new product features in this pack.

## Read and implement

Open index.html to browse the frames. The PDF includes the same proofs and this guide. SVGs are 393 × 852 points with Arimo outlined; PNGs are 786 × 1704. Arimo files and the licence are included. Native navigation, tabs, paste controls, fields, activity indicators and sheets are schematic references: implement with iOS controls and the system font.

copy-contracts.json and component-contracts.json retain all earlier structured entries. Their handoff9 sections are the current authority only for the explicitly named replacement scopes. New strings, including written-only variants and VoiceOver hints, have individual keys. screen-copy.json records each drawing’s text and controls; it is an inspection export, not a source of hardcoded fixture names for production.

No brand asset changed. brand-tokens.json is byte-identical revision 1.1. Existing wordmarks and supplied photographs are copied without alteration. Component shapes use the adopted sheet; the folded edge continues the existing supplemental foldCornerLine token. Kitchen table’s unnamed existing members are not invented: frame 6 shows supplied names in a scrolling roster; production renders the complete authorized server roster.

## Frame index

| Order | Exact frame title | What the proof shows |
|---|---|---|
| 01 | G02-checking-failed | Unanswered link check, no identities; Retry. |
| 02 | G02-opening | Confirmed membership; opening Sunday people. |
| 03 | G02-link-entry-signed-in-checking | Pasted value retained, Continue busy. |
| 04 | G02-link-entry-signed-in-invalid | Malformed value retained and explained. |
| 05 | G02-link-entry-signed-in-cannot-check | Request failure; value remains editable. |
| 06 | G02-changed-name-relaunch | Debby reviews the current name revision without the old label. |
| 07 | G06-no-club-invitation | Leila’s waiting invitation on Home. |
| 08 | G06-no-club-invitation-xl | Same Home at accessibility 5; one scrolling column. |
| 09 | G06-no-club-invitation-changed | Updated roster, with the link missing on this phone. |
| 10 | G06-no-club-invitation-declined | Neutral ended invitation row. |
| 11 | G06-switcher-invitation | Ben’s waiting invitation below active clubs. |
| 12 | G02-web-checking | Retry in progress; same Retry control retained. |
| 13 | G02-web-failed | Network failure; Retry and Get Tadayo. |
| 14 | G01-invite-people-empty | First setup-list state. |
| 15 | G01-invite-people-live-not-held | Alex’s live link is missing from this phone. |
| 16 | G01-invite-people-expired | Alex’s unused link has expired. |
| 17 | G01-invite-people-action-failed | Maya’s Revoke operation could not be confirmed. |
| 18 | A01-welcome | Existing-account sign-in route restored. |
| 19 | A01-welcome-dark | Same Welcome with adopted dark tokens. |
| 20 | A01-welcome-xl | Same single column, scrolled to its three routes. |

## 1. Checking an invitation in the app

Frames 1 and 3–5 disclose no inviter, club or roster. Opening a link is not proof that it is valid. A connection problem, timeout, rate limit or ordinary server error never becomes “This invitation isn’t available.” Only the established authoritative unavailable response uses G02-revoked; a genuinely expired link keeps the distinct expired route.

Frame 1 uses utilityTitle 32/35 bold and body 17/23 regular, both primaryText, with the existing safe-area primary Retry button, 50 points minimum. It repeats the retained account-bound link check. Frame 5 uses the existing inline warning/message below the link field, metadata 13/18, destructive. A request failure does not mark the field invalid: its border remains inputBorder.

| State / branch | Exact visible words | Exact VoiceOver failure announcement |
|---|---|---|
| Frame 1: no connection / no usable answer | Couldn’t check the invitation link. / Check your connection and try again. | Couldn’t check the invitation link. Check your connection and try again. |
| Frame 1: answered refusal, rate limit or server error | Couldn’t check the invitation link. / Try again. | Couldn’t check the invitation link. Try again. |
| Frame 5: no connection / no usable answer | Couldn’t check the invitation link. Check your connection and try again. | Couldn’t check the invitation link. Check your connection and try again. |
| Frame 5: answered refusal, rate limit or server error | Couldn’t check the invitation link. Try again. | Couldn’t check the invitation link. Try again. |

The slash in the frame 1 table separates the title and body; it is not displayed. Announce each new failure once, politely. The warning glyph is decorative. Do not reread a roster, read the token or add an invalid-link announcement. On Retry keep focus on its initiating control; title, body and actions remain separately reachable in normal traversal. Frame 1 Retry’s label is “Retry”; its hint is “Try checking this invitation link again.” No invented wait time or ticking countdown accompanies a server refusal.

Frame 3 retains the full pasted link. Continue keeps its label plus a native activity indicator; duplicate submission is unavailable. The field is read-only and Paste unavailable during this read. Back may cancel the read; late results must not apply to another account or a later link. Frame 4 keeps the malformed value, adds the existing destructive border and inline message, and makes Continue unavailable until the input is locally plausible. Its exact error is “That doesn’t look like a Tadayo invitation link. Check the link and try again.”

Frame 5 restores editing, Paste and Continue so the person can correct the link or retry. It does not clear or replace what was pasted. The frames show the keyboard dismissed; native first-responder behavior and existing field-focus rules still apply. The valid-link field is redacted as https://tadayo.app/i#… in the drawings only. Retain the real user input in production; never copy that ellipsis into a runnable test token.

## 2. Opening a joined club and reviewing a changed name

Frame 2 is shown only after the server has confirmed membership: either Accept this roster completed the join, or a checked link led to a club the person already belongs to. Use “Opening {clubName}…” at emptyTitle 25/30 bold, primaryText, with one decorative native spinner in secondaryText. If routing is immediate, open the club directly without an artificial loading dwell. Do not submit acceptance again. If Home subsequently fails, show that authorized destination’s existing loading/failure recovery, without undoing the confirmed membership.

Frame 6 keeps handoff 8’s changed-name layout and uses its relaunch explanation exactly: “The updated roster now shows your profile name. Review it before accepting again.” Ben is the inviter; Debby is the viewer in Kitchen table. Leila’s former label is not reconstructed or mentioned after it has been lost. Accept this roster always applies to the current exact revision/version; a previous acceptance does not authorize the replacement roster.

The Proposed tag appears on every candidate-kind entry in the exact roster: the viewer’s own candidate row, another proposed person’s row, and changed-name rows. It never appears on an existing active member. This corrects handoff 8 frame 9’s omission on “Ben · You.” Keep the existing Proposed pill and proposer line, including the original candidate.proposed_by value. The tag describes proposed membership, not approval progress. At accessibility sizes it sits below name and proposer, leading aligned, and grows without truncating. No additional 21st frame is required for this shared-component correction.

## 3. Accepted invitations on Home and in the switcher

Use only the current account’s ClubList.invitations / MyInvitation records. A waiting invitation is not an active club and has no selected-club checkmark, membership count, progress or approval list. These records authorize their own club name and invitation state, not captions, media, roster access, upload destinations, membership activity or history.

With no active club, put an Invitations section immediately below the existing Home header, before the existing Create a club, I have an invite and Private drafts content. Friends and Memories do not repeat this section. With active clubs, put the same section after the switcher’s active-club list and before Club details / Create a club. A tap opens the invitation’s state, not the club Home. Do not auto-select a waiting invitation.

The row uses surface, radius 12, 16-point padding, a decorative envelope in action and a secondaryText chevron. Club name is row 17/22 bold, status/helper metadata 13/18 regular in secondaryText, separated by 8. Its full 353-point width is one button, minimum 84 high at default, intrinsic at larger text. Whole target is at least 44 points. The envelope and words distinguish this from the active club list; colour is not a status signal. No badge or approval count is added.

| API state / condition | Row words and exact VoiceOver label | Tap and VoiceOver hint |
|---|---|---|
| waiting | Kitchen table · Waiting for members. VO: Kitchen table. Waiting for members. | G03-waiting. Hint: Open this invitation to see its current state. |
| roster_changed, link held | Kitchen table · Review updated members. VO: Kitchen table. Review updated members. | Check retained link, then G02-changed. Hint: Review and accept the updated roster. |
| roster_changed, link missing (frame 9) | Kitchen table · Review updated members. Helper: Open the invitation link to continue. VO combines all three lines in that order. | G02-link-entry-signed-in. Hint: Open or paste the invitation link to continue. |
| did_not_go_ahead | Kitchen table · Invitation didn’t go ahead. VO: Kitchen table. Invitation didn’t go ahead. | G03-declined. Hint: Open this invitation for details. |

For the missing-link row, the exact combined label is “Kitchen table. Review updated members. Open the invitation link to continue.” The held-link condition has no helper. Frame 9 deliberately shows the missing-link condition; both use the same component. FQ136 requires reopening or pasting the link before showing or accepting a changed roster. The account-owned record alone cannot reconstruct it. Waiting and ended states may open their status-only screens from the account-owned record without a raw token.

Leila is addressed as “you” on the opened waiting/changed screens. Never identify a decliner or infer a cause from did_not_go_ahead. Keep the neutral declined title/privacy note. For its closing line use “You can close this invitation.” This follows current FQ137 and removes the old promise that Ben can start another invitation, which is not guaranteed.

At accessibility 5 the row, heading and controls grow in one root-body scroll with the existing two-row no-club header. Native tabs remain available. The proof shows the top of that scroll; create/join and drafts are below. Frame 11’s switcher uses native modal focus containment: its dimmed Home controls are not accessible while the sheet is open. Utility actions in the sheet keep the adopted leading alignment.

## 4. Signed-out web checking and failure

No inviter, club, photo or date is rendered until the lookup has authorized its public result. Checking and failure carry neither the brand line nor a guessed inviter. Keep Get Tadayo on both. A completed valid lookup returns the existing G02-web; an authoritative unavailable result returns G02-web-revoked. Network failures remain retryable.

| Element | Role / treatment | Default 393-pixel viewport geometry |
|---|---|---|
| Wordmark | Unchanged vector, 144 CSS pixels wide | x124.5, y124; existing clear space. |
| Checking invitation… | utilityTitle 32/35 bold, primaryText | x20, y260, width 353; intrinsic lines. |
| Couldn’t check the invitation link. | utilityTitle 32/35 bold, primaryText | x20, y260, width 353; two lines in proof. |
| Failure body | body 17/23 regular, secondaryText | 16 below title; y346 in proof. Network: Check your connection and try again. Answered refusal/rate limit/server error: Try again. |
| Retry | Primary button, button 16/22 bold, action/onAction | x20, y424, 353 × 50 minimum. Hint: Try checking this invitation link again. |
| Get Tadayo | textAction 16/22 regular, action; semantic link | x20, y490, 353 × 50 target, 16 after Retry. |

The wordmark’s bottom is y169.64, about 90.36 before the status top. At default reserve a 134-point status block from y260 and a 32-point gap before Retry. This keeps the two controls steady between checking and failure. It is a minimum, not a clipped fixed-height container. The status text wraps and pushes everything down when needed.

Show “Checking invitation…” immediately when checking actually begins; do not add a delay or a minimum display time. On the first lookup there is no Retry because no failure has occurred; Get Tadayo stays in its downstream slot. Frame 12 shows the retry-in-progress variant to answer the focus question: the same Retry control remains in place, with its label and a decorative spinner, rather than disappearing during the check.

Keep Retry in the DOM and focusable after a tap, with aria-disabled=true and a guarded handler preventing repeat requests while busy. Keep the status live region active: role=status, aria-live=polite, aria-atomic=true, created before changes, containing only status heading/body. Do not also focus the heading or send a second alert. The page’s proposed “focus the first line, then turn off the live region” behavior is replaced.

Initial loading never steals focus. After Retry, keep focus on that same Retry control through checking and another failure unless the person has moved elsewhere. If a terminal result removes the still-focused Retry, move focus to Get Tadayo so focus is not lost. Do not move focus if the person already moved it. The status region announces each result once; Get Tadayo remains outside that region. This is a design contract to test with actual browser/screen-reader pairs, not a claim of verified assistive-technology behavior.

Add noscript copy because the address-fragment lookup requires JavaScript: “Turn on JavaScript to check this invitation.” Without JavaScript show the wordmark, that body-role line and Get Tadayo. Hide the script-only checking/Retry UI until script starts; never leave a nonfunctional browser saying Checking invitation forever. This is the only new dependency explanation, and it discloses nothing about the link.

Get Tadayo’s visible label stays unchanged. Its accessible hint follows its actual configured destination. Current FQ133 trial URL points to TestFlight, so use “Open TestFlight in the App Store.” Once it points to Tadayo’s production listing, use “Open Tadayo in the App Store.” Do not attach the token to either destination.

Both web frames follow G02-web’s existing dark and 200% text-zoom rules without extra frames: dark tokens and dark wordmark via prefers-color-scheme; at 200%, text sizes/line heights double, wordmark remains 144 wide, horizontal inset 20, blocks and controls grow and flow in document order with vertical scrolling. Remove fixed positional constraints at zoom; never clip, shrink text or prevent browser scaling. The order remains wordmark, status, Retry when relevant, Get Tadayo. Native browser chrome is outside these 393  × 852 page proofs.

## 5. Setup invitation list

Frame 14 needs no additional empty-state sentence. “Each person gets a separate link.” already explains the task. Keep title, Sunday people, that line, Create an invitation 32 points below it, “Only you can see this list.”, and Done for now pinned. Create an invitation uses the existing 50-point secondary button and opens the existing person-name step. No sample rows or progress indicators appear before anyone is invited.

Frame 15 uses “Link not on this phone”, not Not shared, for a server-live link without its local payload. A reinstall does not prove it was never shared. Pair the words with iphone.slash; retain Create new link and More → Revoke link, which can act by the authorized link id without the raw token. Under this affected row show “A new link replaces the previous link.” before the person acts; the row grows. No additional confirmation step is introduced.

Frame 16 uses “Link expired” with clock, distinct from Link revoked’s xmark.circle. The link expired unused after the server’s seven-day rule. Offer Create new link; omit More/Revoke for that already expired link. Do not infer expiration from a local countdown. Successful new-link creation stores the new payload under this account and returns to the existing share flow: Not shared / Share link before sharing, Shared / Share again after the native share action, never a claim of delivery. The server’s accepted/used restrictions remain unchanged: those links cannot be replaced or revoked.

Exact action accessibility labels are “Create new link for Alex”, “More options for Alex’s invitation”, “Revoke link for Alex”, “Share link for Alex” and “Share again for Alex”; substitute each row’s actual name. A combined status element reads “Alex. Link not on this phone.” or “Alex. Link expired.” The replacement helper remains separately reachable. Decorative status glyphs do not add duplicate speech.

### Link operation failure

Keep the built footer location: one warning/message block ending 24 above Done for now, with the scrolling list ending 24 above the block. Metadata/destructive text wraps intrinsically; footer/action grow at large text. Nothing overlays rows. Frame 17 shows Maya’s Revoke request without confirmation, keeping the last verified rows unchanged. Alex remains Link revoked because that was the earlier verified state, not because Maya’s operation failed.

| Operation / branch | Exact visible words and identical VoiceOver announcement | Retained state |
|---|---|---|
| Revoke: no usable answer | Couldn’t confirm that {name}’s invitation link was revoked. Check your connection and try again. | Last verified row, pending outcome reconciled. |
| Revoke: answered refusal | Couldn’t revoke {name}’s invitation link. Try again. | Last verified row. |
| Create new: no usable answer | Couldn’t create a new invitation link for {name}. Check your connection and try again. | Last verified row; do not make another replacement blindly. |
| Create new: answered refusal | Couldn’t create a new invitation link for {name}. Try again. | Last verified row. |

The error appears once in a polite announcement. Preserve focus on the initiating row action, or return it to that row’s More control when its native menu closes. Do not add an error badge, a synthetic revoked status or another Retry button to the row. Existing row actions retry the operation after reconciliation using the existing idempotency policy. A server refresh may update the row to the true completed outcome.

The block persists through scrolling, opening a menu or canceling a share sheet. Clear it when another link mutation starts, reconciliation resolves the affected outcome, or the person leaves this list. A later failure replaces it. Ordinary scrolling/rerendering must not repeatedly announce it.

## 6. Resolve creation copy and name limits

Keep the built 2.1 G01-create introduction and Drafts note. Handoff 8 frame 7’s shortened title/explanation were an unintended copy divergence and are superseded. Keep its failure line under the name field and handoff 7’s error placement. No new frame is needed for this explicit correction.

| Existing element | Exact words to keep | Role |
|---|---|---|
| Title | Your people, together. | utilityTitle |
| Explanation | Start a private club with two to six people. | body, secondaryText |
| Roster explanation | Invite the people you want here. Everyone agrees to the same roster before the club starts. | body, secondaryText |
| Drafts note | Before activation, anything you prepare stays in your private Drafts. | Existing note component |

For an overlong club name show “Use 40 characters or fewer for the club name.” For an invited person’s overlong name show “Use 40 characters or fewer for this person’s name.” Both use the existing inline field-error component below the field, with destructive border, warning and metadata/destructive copy. Keep what was typed. Continue to invitations / Create link and share stay unavailable until the name is valid. Count extended grapheme clusters using the existing profile policy, not bytes or UTF-16 units; do not silently truncate. Clear the length error when corrected without clearing an unrelated request failure incorrectly. One polite announcement when the invalid condition first arises; no repeated announcements on every unchanged over-limit keystroke.

## 7. Restore sign-in and align Leave club

Frames 18–20 restore “Already here? Sign in” below I have an invite. It is the existing regular textAction in action, minimum 44 target. VoiceOver reads “Already here? Sign in”, button, with hint “Sign in to your existing account.” It opens A02-email and follows the existing server-driven account route; an already complete account is not asked to redo age/profile. Create a club and I have an invite keep their own distinct routes.

At default, the sign-in target is x20/y774/353 ×44, clear of the home indicator; both default themes show all three routes. At accessibility 5 all content stays in one column and scrolls. Frame 20 is deliberately scrolled to its action section so the restored route is visible. First arrival still starts at the top. Its recorded viewport offset distinguishes offscreen content coordinates from the proof viewport. Nothing is pinned over the large text. The brand line, explanation and clearly labelled two-stage chair example remain above in that same document.

Leave club stays leading aligned under Club details’ list, at the 20-point content inset, as the current build, 2.1 and handoff 6 draw it. Use the existing destructive text action with a 44-point minimum target. This supersedes only handoff 8 frame 16’s centered placement and agrees with handoff 7’s leading text-action convention; it does not introduce a new destructive flow.

## 8. Privacy, provenance and implementation checks

Invitation tokens travel only in the link fragment. Keep them out of server/access logs, referrers, metadata, analytics, export screenshots and App Store/TestFlight parameters. Unauthenticated pending intent is memory-only under FQ135. Bind retained links to the verified account, clear on logout/account switch, and follow the adopted terminal cleanup rules. FQ136’s missing-token route must never construct a roster from a MyInvitation row. Record only the existing spec 36 pseudonymous events.

source-provenance.json records the repository path and fetched Git blob SHA for the source documents/contracts. The attachment brief is included as SOURCE_BRIEF.txt for traceability. The W3C ARIA22 guidance supports a pre-existing polite status region that announces changes without taking focus: https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22.html. MDN describes noscript’s role when scripting is disabled: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/noscript. The exact retained-button focus policy is this handoff’s design choice, to validate in the implemented page.

Static checks cover exact 20-frame order/titles, point/pixel dimensions, vector text outlines, all recorded target sizes, unchanged brand/font/image bytes, earlier JSON entries preserved, failure variants and key references, privacy of unresolved frames, footer separation and the restored sign-in route. The PDF is rendered and visually reviewed. This does not certify actual iOS or browser accessibility behavior.

Before merging the implementation, check native iOS system-font/Dynamic Type layout and VoiceOver focus; browser dark/200% zoom, JavaScript off and Retry announcements; account-switch and late-response isolation; authoritative invalidity versus network/rate failures; the three MyInvitation states with and without a retained token; and idempotent mutation reconciliation. These are implementation checks on existing APIs, not a new approval flow or a request for further product decisions.
