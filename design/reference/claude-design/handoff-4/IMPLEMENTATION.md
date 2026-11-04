# Tadayo handoff 4 - sign-in and club corrections

Seven default frames, plus the complete replacement component sheet. Brand revision 1.1 remains unchanged.

## Frames in exact order

1. `G03-approve` - 393 × 852 points; SVG and 2× PNG.
2. `G01-pending` - 393 × 852 points; SVG and 2× PNG.
3. `G06-no-club` - 393 × 852 points; SVG and 2× PNG.
4. `G02-link-entry-signed-in` - 393 × 852 points; SVG and 2× PNG.
5. `G01-invite-people-revoked` - 393 × 852 points; SVG and 2× PNG.
6. `G02-revoked` - 393 × 852 points; SVG and 2× PNG.
7. `G02-web-revoked` - 393 × 852 points; SVG and 2× PNG.
8. `brand-components` - 1200 × 5780 points; SVG and 2× PNG.

## Delivery and precedence

The first seven frames are exactly G03-approve, G01-pending, G06-no-club, G02-link-entry-signed-in, G01-invite-people-revoked, G02-revoked and G02-web-revoked, in that order. Each is 393 × 852 logical points with an SVG and a 786 × 1704 PNG. The whole replacement brand-components follows, not a cropped correction. No dark or XL phone frames are added.

Brand revision 1.1 is byte-for-byte unchanged: brand-tokens.json, the wordmark, the dark wordmark and the transparent dark app-icon masters. The component sheet retains the complete handoff 2 sheet and handoff 3’s additive specimens, then appends the handoff 4 clarifications, including the optional dark collecting-card specimen. No values come from the repository’s older handoff 0 brand.

Handoff 4 overrides the named sign-in and club details from handoffs 1 and 2. Handoff 3’s Home and Friends additions remain valid and are retained under handoff3 in the cumulative component file. In particular, the new G01-pending agrees with H01-awaiting-activation about words, activation, privacy, primary action and route. Its pushed navigation and lower footer placement differ from a Home with tabs.

The SVGs outline Arimo glyphs for portable vector rendering; the font and its OFL licence are included. Implement the app with the iOS system font, native controls, navigation, tab bar, menus, paste control and share sheet. Static drawings are not native screenshots or a device-tested app.


## G03-approve: Maya reviews Leila

Maya is the viewer and a current Kitchen table member. Leila is proposed by Ben. The five current members do not include Leila. The frame remains true whether or not Ben’s act of proposing Leila also counts as Ben’s approval. That is undecided; the new-club creator default does not decide it. Approve Leila records Maya’s own approval of the displayed exact roster revision only.

The lock is replaced by a plain shield. A lock is reserved for hidden content before reveal. The privacy sentence remains “We don’t identify who declined. Nobody is asked to give a reason.”. The shield is decorative to that spoken sentence, not a second control, guarantee of absolute anonymity or extra approval state.

Leila uses the new named personDisplay role: 28 pt, 34 pt reference line height, bold, scaled relative to title1. It preserves handoff 2’s actual name size and weight. The avatar initial is the separate existing avatarProfile68 role; a display name is not an avatar-type alias.

The note hugs its text with spacing.16 on every side, a 20 pt shield and spacing.12 between the shield and text. At 353 pt wide, text width is 289. The English note has two 18 pt metadata lines, so the box is 68 pt high: 32 + max(20, 36). There is no 89 pt minimum. At larger text or in translation, grow naturally. Keep the note top at y532 and the existing action positions.

Handoff 2 did not explain its other differences from 2.1. This handoff explicitly retains the 13/18 metadata context line in secondaryText, the note in secondaryText, and no hairline above the buttons. The note’s contained surface and the existing spacing separate it from the actions. Other positions and controls remain as handoff 2 drew them.

Corrected access guidance: a pending candidate, whether accepted or not, can review only the permitted club name and exact proposed roster after the authenticated invitation check. No captions, photographs, membership activity or club upload destinations are available until all required approvals are complete and membership activates. Acceptance alone grants no content access. Roster review uses names and initials, not other members’ photograph avatars. Existing members’ access is governed by the existing membership, not this candidate review.


## G01-pending and G06-no-club

G01-pending uses “Waiting for club confirmation”, “The club starts when another person accepts the same roster.” and “Review members”. Review members is the primary action, not Review invitations. This resolves the remaining handoff 2 instruction in favour of handoff 3’s same-moment Home. It opens G05-members in the creator-only proposed-roster review variant; Manage invitations there opens G01-invite-people.

Both older explanations, “What you prepare stays only with you.” and “Nothing is shared while the club is waiting to start.”, are retired. The shared row already says “Only you can see these.”, and the specific line “Drafts stay private when the club starts.” explains the boundary at activation. The row opens account-private drafts, so the duplicate Open Drafts primary button is removed. Drafts never auto-submit when the club starts.

Nobody has accepted in the frame. Only Ben sees this constructed pending page. Under the explicit Default, Ben’s proposal counts as Ben’s approval, so one other person accepting that same roster can start the club. Unaccepted invitees do not become active members through that threshold. Do not say the club waits for everyone or show a count/list of missing acceptances.

The pushed screen uses Sunday people in its native navigation bar. It has no date, countdown, lock, media placeholder or invented drop. Its body and Drafts row match H3 Home; its primary button sits at y724 because it has no tab bar. H3 Home retains its selected-club bar and y696 primary above the native tabs.

G06-no-club applies the handoff 2 root header: unchanged 96 pt wordmark leading, + Add and the existing 28 pt Ben initial fallback trailing, each action with a 44 pt target. The main Create a club button remains at y321. I have an invite becomes the standard 50 pt secondary button at y388, preserving the prior text baseline. The Private drafts row at y492 replaces the old plain row and remains reachable with Home, Friends and Memories.

+ Add still works without a club. The destination picker offers Private draft first and Open my drafts; no invented roster, upload destination or club appears. I have an invite routes to the signed-in link entry while the session is valid.


## G02-link-entry-signed-in

Keep handoff 2’s entry geometry and controls. The viewer is already signed in and has no club. Replace only the signed-out instruction with “We’ll check the link before showing the club or its people.”. There is no sign-in prompt, email label or repeat authentication when the session remains valid.

The field, explicit Paste control, placeholder, empty-field disabled Continue, 54 pt minimum field and native Back remain unchanged. Paste reads the clipboard only after the person activates the native control. A plausible link enables Continue, which checks the link. Until the server authorizes a review, no inviter, club name, roster, photograph, membership activity or upload target is shown.

A valid authorized result reaches the current exact-roster review or the appropriate positive recovery state. A neutral not-found response reaches G02-revoked. On a connection failure keep the pasted text and entry context; show “Couldn’t check the invitation link. Check your connection and try again.”. Do not turn an unknown network outcome into a claim that the invitation is unavailable.


## G01-invite-people-revoked

The full five-invitee list stays in the handoff 1 order: Maya Shared; Alex Link revoked; Sam Not shared; Debby Accepted; Nina Not shared. Each state has words plus its own glyph: link, square.and.arrow.up, checkmark, and xmark.circle for Link revoked. Status ink stays secondaryText; there is no colour-only meaning or punitive red.

Every unaccepted row has the same More button and a 44 pt target. Debby has no More or Share control, because accepting is not reversible through link revocation. Maya’s, Sam’s and Nina’s More menu can offer Revoke link. Alex’s already-revoked row offers Create new link; it does not offer to revoke an absent valid token or remove a club member. No roster-changing Remove person action is added.

The accessible label is “Create new link for Alex”. Each Share and More label names its person; exact labels are in copy-contracts.json under handoff4.invite.*. Row name/status is one readable group; Share/Create and More are separate buttons. Decorative avatar, glyph and ellipsis marks are not separate focus stops.

Creating a replacement waits for the server and preserves Alex and every other row on failure. A failure says “Couldn’t create a new invitation link for Alex. Try again.”. Before success the row stays Link revoked. Once a new token exists, Alex shows Not shared with the link glyph, Share link and More. Open the native share sheet for that new token. Cancelled sharing leaves Not shared; a completed sharing activity changes it to Shared and Share again. Neither state claims delivery or reading. Server-confirmed acceptance changes it to Accepted and removes the Share/More controls.

The old token stays revoked permanently. Reusing a prepared replacement after a cancelled share sheet must not create another token; creation retries use the same idempotent request. The optional success announcement is “New invitation link created for Alex.”.

Replace the internal working phrase about link states throughout G01-invite-people, its add variant and XL guidance with “Only you can see this list.”. This refers to the creator’s invitation-management list, not to secrecy of the exact roster that a candidate legitimately reviews.


## G02-revoked and G02-web-revoked

Keep both exact frame names. The native frame serves the same neutral not-found classification for a revoked token, an unknown token and a token already used by another account. Its words are “This invitation isn’t available.” and “Ask for a new invitation link.”, with Close invitation. Alex is signed in but is not named on the screen. Ben, the club, the roster and the account that used a token are never revealed.

This is not every kind of failed invitation. Keep G02-expired for a positively authorized expired response, G02-changed for a valid changed roster, and G02-full for a legitimate capacity response. A raw neutral not-found must never be upgraded to an expiry explanation. Network/server failures stay recoverable errors, with input retained; they do not claim the link no longer works.

Close invitation clears the unusable pending invitation intent and returns to G06-no-club in this signed-in fixture. Native Back returns to link entry with the typed link preserved so it can be replaced. Neither action revokes anything or changes membership.

The signed-out web page shows only the unchanged 144 CSS px wordmark, the same neutral title, the generic request for a new link and Get Tadayo. It shows no inviter name because the Default provides none. Get Tadayo stays as an independent generic App Store destination, not a claim that installation will repair the invitation. Do not forward the unusable token to the store or a deferred invitation route.

The existing G02-web-dark and G02-web-xl rules apply unchanged: prefers-color-scheme uses revision 1.1 canvas, primaryText, secondaryText and action; a 144 CSS px vector wordmark keeps its clear space; text uses relative sizes and natural wrapping; allow browser text zoom, pinch zoom and vertical scroll. At 200% text zoom the title becomes 64/76, this new body 34/46 and the link 32/44. Do not force the content into a fixed 852 px panel or overlay it with a fixed footer.

The web page has no status bar or fabricated browser chrome. Its default content width is 353 px at a 393 px viewport. The lower straight stem of the initial t remains the clear-space reference: 44/915 source width units, or about 6.925 px at 144 px. The store link has a 44 px minimum target and a keyed accessible label.

Default assessment: neutral recovery gives less diagnostic help, but avoids revealing the existence, inviter or use of a hidden invitation. Asking for a new link remains a clear action. The no-inviter web page is less personal, but a guessed inviter would be false; keep the Tadayo wordmark and generic download route rather than inventing identity.


## Members, Club details and a declined invitation

Use one footer contract for every active club size. The title names the resolved club; the first metadata line is a localized active member count plus the club zone, and the second line is “7 AM to 1 AM the next morning.”. For Sunday people use “6 members · New York”; for the unnamed pair use “2 members · New York”. Do not invent a pair club name. Kitchen table’s count remains five while Leila is proposed, and its zone comes from the resolved club, not an assumed New York fixture.

The footer excludes proposed people, uses the same club identity as the roster and updates from one authorized server snapshot. A paused one-person club uses the singular formatter. The before-start Proposed roster review is a separate variant and never labels proposed people as active members. The footer is 13/18 metadata in secondaryText and grows/wraps naturally; it is not an approval count.

Club details should not have a different Drafts component. The missing G05-club-details entry in handoff 2’s usedBy list is corrected. Use the same 76 pt minimum rounded row, Private drafts title, folder, chevron and “Only you can see these.” subtitle as Friends, no-club Home and pending setup. The row routes to the same account-private collection, not a club-owned archive.

Adopt the optional clarification on Leila’s G03-declined page: “We don’t identify who declined. Nobody is asked to give a reason.”. Place it with the neutral outcome before Close invitation; let the body grow and scroll at large text. It does not identify a person, imply why the invitation failed or promise that friends cannot infer anything outside Tadayo. No extra G03-declined frame is added in this handoff.


## Brand components, token aliases and geometry

The Private drafts folder uses action, its chevron secondaryText, its title primaryText and its subtitle secondaryText. Eyebrow uses secondaryText; fieldLabel uses primaryText. invitationRosterRow’s separator uses separator, starts 49 pt from the row’s leading edge and ends at the trailing edge, with 1 pt thickness. The name and separator align after the 36 pt avatar plus 13 pt gap.

Each alias resolves through the unchanged light/dark brand values. Light action is #284CDB and dark action #AFBEFF. Light secondaryText is #607067 and dark #B6C3B7. Light primaryText is #182B25 and dark #F7F8F2. Light separator is #DCE2DA and dark #35463A. No new colour value is introduced.

All revision 1.1 type roles now have an explicit Dynamic Type style in typeRoleMetrics, with the exact existing base size, reference line height and weight. The five prior supplemental roles retain their mappings. personDisplay adds 28/34 bold relative to title1; highlightExpanded names the existing 20/26 bold relative to title3. This labels delivered sizes; it does not change the brand’s base type file.

Use UIFontMetrics for the named style with each role’s actual custom base size, without a maximumPointSize cap. Reference line heights are not clipping boxes. Native UIKit tab labels and selection remain native; caption2 is the reference mapping rather than a reason to replace the system tab font. Fallback initials rendered as decorative images beside a visible name keep image semantics; meaningful names and labels always scale.

Named geometry now includes fold size 18, card inset 18, collecting card 353 × 151 minimum at the reference width, plaque 45 × 55, highlight cover 91 × 69, expanded full-width highlight row 96 minimum with 20/26 label, and field 54 minimum. Card width follows the container minus two 20 pt screen insets; heights and expanded rows grow, never cap text.

The 6 pt photo-label block inset and 5 pt Proposed-tag block inset are retained intentional optical exceptions inside those compact labels, now named under handoff4.opticalInsets. They preserve handoff 2’s 26 pt and 28 pt heights: 14 + 2×6 and 18 + 2×5. They are not new general layout spacing steps. Horizontal label padding remains spacing.8. General layout spacing remains 4, 8, 12, 16, 20, 24, 32; the existing card’s 18 pt inset remains its component-specific geometry token.

The whole replacement brand-components shows the shield note, personDisplay, four invitation status glyphs, named geometry/optical exceptions and a dark collecting card with Maya’s stable cover2 and dark ink. This is a component specimen, not an added dark phone screen. Existing photograph bytes in the retained sheet are unchanged and never tinted or filtered.

Action-as-text contrast is recorded against both canvas and surface, in light and dark, with a minimum of 4.5:1. The exact ratios and token/hex pairs are in handoff4.contrastActionAsText in component-contracts.json and in validation-report.json.


## A02-code refusal and canonical copy

Replace the old refused resend with “Couldn’t send a new code. Try again.”. Use “Couldn’t send a code. Try again.” for a refused first send. Both name the failed action and avoid a wait estimate. A refusal gives no known extra wait; do not read or display the server’s own message prose, infer a duration, or promise shortly.

Preserve the entered address, typed digits, current challenge and known successful-send resend interval. Only a successful new send starts a new 60-second interval and clears the previous challenge as the authentication flow requires. Refusal must not falsely reset that interval, show a successful-send state, erase the digits or remove Change email address. Keep one in-flight request and the existing stable resend region.

The historical lines “A code can’t be sent yet. Try again shortly.” and “A new code isn’t available yet. Try again shortly.” have standalone legacy keys because the request explicitly asks for them. Both are marked retired, never render. The active replacements have separate keys. The profile network failure is also standalone: “Couldn’t save your profile. Check your connection and try again.”. Keep the profile name and photo selection on that failure.

copy-contracts.json retains the handoff 2 catalogue and the handoff 3 additions, normalizes every string value to ’, and adds handoff4. Earlier retainedState prose now references the active refusal/profile keys rather than hiding product copy in guidance. Retired legacy messages have a separate copyStatus map, so a code generator should not accidentally select them as current UI.

All UI strings supplied only in writing, including errors, accessibility labels, member-footer templates, the optional declined disclosure and the old lines quoted for retirement, have their own handoff4 keys. Braced parameters are populated by authorized native formatters; never display the braces literally.


## Invitation tokens, logging and analytics

An invitation’s secret token travels only in the link fragment, never the path or query (T7). Browsers do not put that fragment in the HTTP request URL, so normal access logs cannot receive it from that URL. The native client or first-party page extracts it locally and passes it only to the authorized invitation exchange in a protected request body.

The token must never enter a server log. Fragment placement alone does not stop request-body, application or error logging, so the exchange and every logging layer must redact/disable credential logging. Exclude it from reverse-proxy, application, request/response, crash, debug and breadcrumb records, referrers, HTML metadata, social previews, App Store URLs and third-party requests. Any route or diagnostic uses a safe opaque identifier, not the link token or raw URL.

The token and raw invitation URL never go to analytics. Emit only spec 36’s allowlisted events with pseudonymous IDs (T51); no new invitation-state telemetry vocabulary is introduced by these drawings. Do not send a revoked/used-by-person explanation to the candidate through analytics properties, VoiceOver, hidden text or page metadata.

These are implementation contracts for the coding agent. No invitation was created, checked, revoked, accepted, shared or sent through this design task.


## Accessibility and verification boundary

Native controls own their normal selected, disabled and focus traits. Every drawn action has a keyed accessible name and a target of at least 44 pt. Entire Drafts rows act as one entry; Share/Create and More have separate non-overlapping targets. Invitee glyphs, the shield and chevrons are decorative beside their words, not separate elements.

At AX5, move invitation row actions below the name and status rather than shrinking them. Keep More as a separate 44 pt action. The note grows; no 89 pt minimum or fixed line cap remains. Titles, subtitle, member-footer lines and fields wrap within available width. Safe-area footers grow or enter the vertical scroll if the viewport cannot fit them. The no-club header can stack its wordmark and actions when necessary; native navigation and tabs remain reachable.

G02-web-revoked inherits dark and browser-zoom rules, without extra frames. Dark component aliases and action contrast are checked; a semantic colour is never inferred from hidden content. SVG text bounds, dimensions, exact titles/order, complete PNG decoding, font supply, key coverage, apostrophe normalization, retained brand hashes and PDF page rendering are verified in the pack.

These checks are design-time export checks, not iPhone Dynamic Type, VoiceOver, authentication, token-security or network-integration test results. The coding agent still needs device and service verification. The supplied fixture imagery remains development/reference material under the design book’s rules.


## Exact active messages

| Key under handoff4 | Value |
|---|---|
| `link.signedIn.helper` | We’ll check the link before showing the club or its people. |
| `link.checkFailure` | Couldn’t check the invitation link. Check your connection and try again. |
| `invite.private` | Only you can see this list. |
| `invite.createNew.Alex.vo` | Create new link for Alex |
| `invite.createNew.Alex.failure` | Couldn’t create a new invitation link for Alex. Try again. |
| `invite.createNew.Alex.success` | New invitation link created for Alex. |
| `unavailable.title` | This invitation isn’t available. |
| `unavailable.body` | Ask for a new invitation link. |
| `unavailable.primary` | Close invitation |
| `auth.firstSend.refused` | Couldn’t send a code. Try again. |
| `auth.resend.refused` | Couldn’t send a new code. Try again. |
| `auth.profile.networkFailure` | Couldn’t save your profile. Check your connection and try again. |

## Type role map

The base file is not rewritten. These exact values and style associations are in `typeRoleMetrics`.

| Role | Size / line height | Weight | Dynamic Type |
|---|---|---|---|
| utilityTitle | 32 / 35 | bold | largeTitle |
| dayTitle | 31 / 34 | bold | largeTitle |
| dateTitle | 25 / 29 | bold | title2 |
| emptyTitle | 25 / 30 | bold | title2 |
| body | 17 / 23 | regular | body |
| row | 17 / 22 | bold | body |
| metadata | 13 / 18 | regular | footnote |
| cardStatus | 13 / 18 | regular | footnote |
| caption | 21 / 28 | bold | title3 |
| highlight | 12 / 14 | bold | caption1 |
| plaqueWeekday | 10 / 12 | bold | caption2 |
| plaqueDay | 25 / 28 | bold | title2 |
| clubHeader | 16 / 20 | bold | headline |
| headerAdd | 15 / 20 | bold | subheadline |
| button | 16 / 22 | bold | body |
| tab | 11 / 14 | regular | caption2 |
| allowance | 12 / 17 | regular | caption1 |
| photoLabel | 11 / 14 | bold | caption2 |
| avatar36 | 16 / 20 | bold | body |
| avatar28 | 13 / 18 | bold | footnote |
| avatar18 | 9 / 11 | bold | caption2 |
| avatarProfile68 | 28 / 34 | bold | title1 |
| personDisplay | 28 / 34 | bold | title1 |
| highlightExpanded | 20 / 26 | bold | title3 |

## Aliases and token pairs

| Role | Alias | Light | Dark |
|---|---|---|---|
| Private drafts folder | action | #284CDB | #AFBEFF |
| Private drafts chevron | secondaryText | #607067 | #B6C3B7 |
| Eyebrow | secondaryText | #607067 | #B6C3B7 |
| Field label | primaryText | #182B25 | #F7F8F2 |
| Invitation separator | separator | #DCE2DA | #35463A |

## Sources and scope

- Tadayo_Handoff_1_Implementation.pdf and pack, current supplied version.
- Tadayo_Handoff_2_Corrections.pdf and pack, current supplied version; full corrected component sheet.
- Tadayo_Handoff_3_Club_Days_and_Home.pdf, for the same-moment Home alignment only.
- Tadayo_UI_UX_Design_Book.pdf, design revision 2.1, Library version 2: pages 6, 8, 9, 24, 30, 34, 35 and 41, plus the existing 2.1 visual fixtures.
- Tadayo_v3_Build_and_Design.pdf, Library version 2: sections 03, 04, 07, 24, 32 and 36.
- The handoff 4 brief supplies T7/T9/T45/T47/T51 requirements and its explicit Defaults. No newer repository brand is substituted.

No repository files or live accounts are changed. The source PDFs and historical packs remain unchanged; this is a separate correction pack. See frame-manifest.json and validation-report.json for filenames, exact export dimensions and preservation evidence.
