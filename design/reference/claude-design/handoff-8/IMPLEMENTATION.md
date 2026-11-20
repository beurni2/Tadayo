# Tadayo handoff 8 implementation guide

Stage B1 clubs and invitations

20 November 2026

This handoff supplies the 15 requested states in the requested order and one supporting active Club details frame. The supporting frame is number 16, G05-club-details-active. Frames use 393 × 852 points, with 786 × 1704 PNG exports. SVGs outline Arimo so their appearance travels with the files. Arimo fonts and the licence are included.

Use frame-manifest.json for order, exact titles, text roles, control targets, viewport notes and export paths. Use copy-contracts.json under handoff8 for production templates, error variants and announcement rules. Its earlier entries and component-contracts.json’s earlier entries are retained as structured values. New contracts live under handoff8. The repository’s adopted corrections described in INVENTORY.md continue to determine how earlier keys are used.

The native controls in the frames are design references. Implement the native iOS navigation bar, fields, activity indicators, menus and share sheet, using system typography and safe areas. Static export checks do not establish on-device VoiceOver, keyboard or Dynamic Type behavior.

## Frame order

| Order | Exact state | Fixture and visible moment |
| --- | --- | --- |
| 1 | A01-welcome | New brand line, explanation, labelled two-stage chair example and both routes |
| 2 | A01-welcome-dark | Same Welcome with revision 1.1 dark tokens |
| 3 | A01-welcome-xl | Largest accessibility size, first viewport of scrolling content |
| 4 | G02-web | Signed-out Ben invitation and public brand line |
| 5 | G02-web-dark | Same page, prefers-color-scheme dark |
| 6 | G02-web-xl | Same page at 200% browser text zoom |
| 7 | G01-create-failed | Sunday people name kept after network failure |
| 8 | G02-checking | Ben signed in, invitation lookup unresolved |
| 9 | G02-invitation-failed | Ben accepting Debby’s Sunday people roster failed on the network |
| 10 | G03-approve-failed | Maya approving Leila for Kitchen table failed on the network |
| 11 | G05-club-details-failed | Pushed details load failed, Retry available |
| 12 | G01-invite-people-accept-again | Sam needs to accept this roster again, Share again available |
| 13 | G01-pending-approve | Ben must approve the server-created first-roster revision |
| 14 | G05-members-invite | Active Sunday people, Nina’s per-person invitation manager |
| 15 | G02-changed-name | Debby sees the name revision that replaced Leila with Debby · You |
| 16 | G05-club-details-active | Supporting entry to Invite someone with five active members |

No additional G02-invitation redraw is needed. The in-app explanation already covers the joining boundary and the exact roster. Its current wording remains applicable to the founder’s new direction. Frame 9 adds failure treatment to that existing explanation.

## Welcome and invitation introduction

The brand line is exactly “Your day. Your story. A thought from your friends.” Welcome uses dayTitle, 31/34 bold, primaryText. It sits below the existing 144-point vector wordmark and above the explanation. The explanation uses body, 17/23 regular, secondaryText, and says “Take turns sharing what you’ve been up to. Friends can add something that reminded them of you.”

Keep Maya’s friend contribution in the example. Its caption is “Your future living room.” The recipient is Debby, and the date is Friday 6 November 2026. The example demonstrates the optional addition a friend can make, while the new headline and explanation introduce the star’s own sharing. Its label is exactly “An example · before and on the day”. The two stage labels are Caption now and Photo on the day. The chair remains the book’s stand-in under FQ23. A founder-owned photograph is required before the trial’s production gate. The example never creates a real drop, audience, count, notification or scheduled occurrence.

At the default size the example is a paired miniature, with two 170-point columns and a 13-point gap filling the existing 353-point content width. The cover is 172 points tall with the existing fold and colors. The miniature uses the existing row role for its caption and metadata for the sender. At the largest accessibility size it becomes one stage after the other in the same scrolling column. The photograph keeps its original color. Both Create a club and I have an invite follow in the scroll and remain reachable without a text cap or a footer laid over the explanation. Frame 3 shows the top viewport, so the example and actions continue below it.

Create a club routes through sign-in and required setup to G01-create. I have an invite opens the established link-entry route. A received invitation continues to skip generic Welcome and preserves its intent through sign-in.

G02-web retains its 144-point wordmark and inviter heading. The public brand line follows the inviter heading at caption, 21/28 bold, primaryText, and precedes Get Tadayo. The heading uses utilityTitle, 32/35 bold. Get Tadayo keeps the existing text-link presentation and a target of at least 44 points. Wordmark clear space is measured from the lower straight vertical stem of the first t below the crossbar, 44 source units or 6.925 points at 144 wide.

The page shows only Ben’s inviter identity and public Tadayo branding. It contains no club name, member list, dates, photographs or source previews. Its content viewport is 393 points wide. Browser chrome is outside these frames. At 200% text zoom the text doubles and the document scrolls to Get Tadayo. The logo remains 144 CSS pixels wide. Respect prefers-color-scheme and the existing dark wordmark. Permit browser zoom and text wrapping without shrinking.

The revoked or unknown-link recovery page keeps its wordmark, neutral unavailable message and Get Tadayo. Omit the brand line there so recovery remains concise. Handoff 4’s dark and zoom behavior continues to cover that page.

## Mutation failure words and VoiceOver

The warning glyph is decorative to VoiceOver. Read the visible failure sentence once after the request fails and leave it reachable in reading order. Keep focus on the control that initiated the request. A network error or ordinary server refusal uses the normal field border. Typed values, the reviewed roster and both approval decisions remain available after an ordinary failure.

| Action | No connection | Refusal |
| --- | --- | --- |
| Create club | Couldn’t create the club. Check your connection and try again. | Couldn’t create the club. Try again. |
| Accept roster | Couldn’t accept this roster. Check your connection and try again. | Couldn’t accept this roster. Try again. |
| Approve Leila | Couldn’t approve Leila. Check your connection and try again. | Couldn’t approve Leila. Try again. |
| Decline | Couldn’t decline this invitation. Check your connection and try again. | Couldn’t decline this invitation. Try again. |

Each table entry is also that error’s complete VoiceOver announcement. Candidate names are template values. The copy file supplies separate keys for every variant. These are action failures. They do not assert who has joined or identify a decliner.

G01-create-failed keeps Sunday people in the existing 54-point name field and Continue to invitations as the action. The frame shows the keyboard dismissed. If the field is still first responder on a device, retain its value and use the existing keyboard-safe scroll/footer behavior. After a failure the name is editable. Reconcile an uncertain result and retry with the existing idempotency key before creating another operation with the same intent.

G02-invitation-failed keeps the exact roster, Ben · You, the inviter, the joining boundary and the token-backed intent. Retry with the reviewed revision only while it remains current. Do not turn a failed acceptance into a joined state or a new invitation. Not now remains available.

G03-approve-failed uses Maya as viewer. The candidate is Leila, proposed by Ben, and Kitchen table has five current members. Its note uses the existing shield and surface component. Approve Leila and Decline remain available after network or ordinary refusal. Their spoken names are “Approve Leila joining Kitchen table.” and “Decline this invitation for Kitchen table. No reason is required.”

### Changed roster and full club outcomes

For ROSTER_CHANGED after Approve, the native alert title is “Review the updated roster”. Its body is “The members have changed. Review the updated roster before approving.” For the same outcome after Decline, the body is “The members have changed. Review the updated roster before declining.” VoiceOver reads the title and the applicable body, followed by Review members. That action’s spoken name is “Review the updated members of Kitchen table.”

Review members fetches the current exact roster. Approve and Decline then apply to that newly reviewed revision and expected version. The prior action is never replayed onto the new revision automatically. A lookup failure uses the proposed-members loading/failure shell. If the proposal no longer exists, use “This invitation is no longer available.” and the established neutral recovery route. Nobody’s decisions or approval count appears.

For CLUB_FULL after Approve, the native alert says “Kitchen table is full.” and “Kitchen table already has six members.” Its action is See members, spoken “See members of Kitchen table.” Read the title and body once. The action fetches authoritative membership. The screen claims no successful approval and does not suggest removing a member. NOT_FOUND and other access denials keep the existing neutral recovery behavior.

## Loading and failure words

Use handoff 7’s noClubTabStates anatomy on B1’s pushed read screens. The native Back control stays available. While unresolved, show one indeterminate native indicator in secondaryText and the loading label. The indicator adds no second accessible element. Announce the loading label once, with no ticking updates. Do not synthesize a roster, member count or invitation state.

| Screen | Loading words | Failure title |
| --- | --- | --- |
| G05-club-details | Loading club details… | Couldn’t load club details. |
| G05-members | Loading members… | Couldn’t load members. |
| G05-members-proposed | Loading proposed members… | Couldn’t load proposed members. |
| G03-approve | Loading invitation… | Couldn’t load this invitation. |
| G01-invite-people | Loading invitations… | Couldn’t load invitations. |

Every network failure adds “Check your connection and try again.” Every ordinary server refusal adds “Try again.” Retry is the primary 50-point minimum action in the safe-area footer. VoiceOver reads the failure title, the applicable body and then Retry. Announce the title and body once on failure. The Retry hint names the destination, such as “Try loading club details again.” Each loading, failure, body and hint has its own key in copy-contracts.json.

Retry returns to that same destination’s loading shell. Discard a late response for another account, club or revision. An authoritative denial clears prohibited data and goes through the established unavailable route. A previously authorized parent-club navigation title may remain while a read is unresolved, but no roster rows are inferred from it.

G02-checking uses “Checking invitation…” and “We’ll check the link before showing the club or its people.” The first sentence is the one loading announcement. After the server answers joined, open the returned club directly. There is no intervening success sentence or Accept action. If routing genuinely needs another read, the authorized loading line may say “Opening Sunday people…”. The club name is used only after authorization. Opening a joined link does not consume it.

## A used link and the proposed row

Sam’s row says Needs to accept again, with an arrow.clockwise glyph and Share again. The glyph and words give the same meaning without color dependence. The row’s combined spoken label is “Sam. Needs to accept again.” The button is spoken “Share again for Sam”. It opens the native share sheet with the existing invitation link. Sam’s row has no More control, Create new link or Revoke link. It grows when its status wraps.

A completed share keeps Needs to accept again until the server confirms acceptance of this exact revision. Shared is a record of a completed system sharing activity and never a delivery, open or acceptance receipt. Accepted has its existing checkmark and no sharing or revoke action.

The client’s FQ77 cleanup rule needs a narrow change for this screen to work. Retain the encrypted per-account raw invitation link through live, accepted and used while its candidate proposal remains open. Accepted alone is not terminal while another revision can still require acceptance. Purge the stored secret after the candidate joins, the invitation ends, the server declares the token invalid, or the person logs out or switches account. The server continues to keep its hash and supplies no recovered token.

If a used link is already absent on this device, keep the status and show “This invitation link isn’t saved on this device.” with “Sam can reopen the invitation already received.” Share again is unavailable without a payload. Creating or revoking a replacement is still prohibited. This recovery has keys in the copy file.

The proposed-member row keeps the candidate’s original proposer. A server-created revision replacing Leila with Debby shows Debby · You, Proposed by Ben and the existing Proposed tag. It does not substitute the person who last opened the screen as proposer. A candidate uses the 36-point initial fallback, with the name beside it. A candidate photograph is not fetched before joining. At the largest text size, the proposer line and growing tag sit below the name, leading aligned. The tag keeps its existing surface fill, inputBorder outline, primaryText ink, 13/18 bold role, 8-point horizontal and 5-point optical vertical insets and 28-point minimum height.

## Creator approval and the changed name

G01-pending-approve says “Review the updated members” and “Review and approve the updated roster before Sunday people can start.” Review members is its primary action and opens the current exact proposed roster. The existing Private drafts row and “Drafts stay private when the club starts.” remain applicable to that preparation state.

Use the same conditional title, sentence and action on H01-awaiting-activation when Ben must approve the server-created name revision. The ordinary waiting sentence about another person accepting applies only when Ben already approved the exact current revision. Select the copy from authoritative club/revision state and my_decision. Neither screen lists or counts missing approvals or acceptances.

G02-changed-name speaks directly to Debby. It says “Ben invited you to Kitchen table.” and “The invitation was made for Leila. The updated roster now shows your name.” The roster shows Debby · You in Leila’s place, with Ben retained as proposer. Debby must explicitly accept the new revision too.

The previous name can come only from the authorized roster the app retained. After relaunch without it, use “The updated roster now shows your profile name. Review it before accepting again.” A raw link or a guess about another account is not a source for the previous name.

The shared invitation roster component puts the viewer first, then preserves the remaining server entries’ order. This presentation choice keeps the changed place visible. The complete server roster is rendered once per entry in the scrolling roster, with 36-point initials and growing rows. In frame 15, Debby, Ben and Maya are visible. The brief gives no names for Kitchen table’s other three existing members, so the static viewport leaves them offscreen instead of assigning fictional identities. The native implementation must render all three actual server entries as well. Accept this roster always submits the complete reviewed revision, not the visible subset.

## Managing an invitation after activation

Frame 16 shows Sunday people active with Ben, Maya, Alex, Sam and Debby, before Nina is proposed. Club details offers Invite someone directly below Members and above Schedule when the server authorizes proposing and capacity permits it. The full six-member Sunday people fixture has no additional invitation control.

Invite someone opens the established name-entry step. After Ben confirms Nina, commit the proposal against the expected roster version, then open Nina’s per-person invitation page, G05-members-invite. Share or Share again uses the native share sheet. No channel is preselected. Frame 14 shows the resulting Shared link. Its More options menu contains Revoke link. A revoked link uses the existing Link revoked and Create new link recovery. A used link uses the restricted state described above.

After returning later, Ben reaches the page through Club details, Members, then Nina’s proposed row. Only Nina’s proposer sees and operates Nina’s link controls. Other members can review the proposed roster and their own decision without seeing Ben’s private sharing states. G01-invite-people remains a setup list.

Frame 16 and frame 14 represent successive valid capacity states. Before the proposal, five current members leave one place. After Nina is proposed, that place is reserved. The server’s capacity and authorization response determines whether another proposal control can appear. Proposed members are not counted as already joined, and this state exposes no approval progress.

## Authentication objects and the club header

Keep A02-email and A02-code focused on their native field and action. A02-age remains its existing single confirmation. A03-profile already has the truthful object, the person’s own optional photograph or brand fallback. Welcome now carries the chair example, so the sign-in screens need no additional decorative photograph, folded card or mascot. The reference wordmark stays where its existing contract places it.

Apply handoff 7’s content-scrolling header and opaque status-safe-area behavior to selected-club root screens too. The selected club’s name and chevron remain the leading native selector, followed by Add and the own-account avatar. The default row remains 44 points high when its contents fit. At all accessibility categories use two rows consistently. The full-width growing club selector occupies the first row, with Add and Account in the second row. The header’s height follows the actual wrapped club name. Use clubHeader with system headline scaling, without a size cap or shrinking. The body starts below the expanded header, and the header scrolls with it. The native tab bar keeps its own platform appearance.

Use the wordmark-based noClubRootHeader only when there is no selected-club record. A denial continues through its established neutral header behavior.

## Export and implementation checks

The ZIP contains SVG and 2x PNG frames, the PDF, this guide, a frame browser, frame-manifest.json, screen-copy.json, cumulative copy-contracts.json and component-contracts.json, immutable brand-tokens.json, original wordmarks, the chair fixture, Arimo fonts and licence, source-provenance.json and validation-report.json.

All 15 requested state names retain their exact order. Only the requested Welcome and web dark/large-text frames are included. The sole supporting phone state follows them all as frame 16. Every visible failure variant, written-only recovery sentence and required loading sentence has a copy key. Templates use typographic apostrophes and source names as parameters.

Static checks cover dimensions, filenames, outlined vector text, font inclusion, preservation of baseline contract entries and tokens, copy coverage, control target sizes, used-link action restrictions, image/roster disclosure before sign-in, role metrics and selected error/footer spacing. The exported phone references and PDF pages receive visual review. These checks cover the export and its contracts. Native iOS tests, live server races, actual VoiceOver announcements and the system share sheet remain implementation validation.
