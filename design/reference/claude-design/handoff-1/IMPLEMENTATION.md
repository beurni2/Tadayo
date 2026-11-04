# Tadayo implementation handoff 1

Build the seventeen screens in the frame manifest. Screen dimensions are 393 × 852 logical points. Use brand-tokens.json revision 1.1 for colours, type and geometry. SVGs are portable outlined design frames, not native iOS controls.

## Exact screen order

1. `A02-email`
2. `A02-code`
3. `A02-code-error`
4. `A02-age`
5. `A03-profile`
6. `G01-invite-people`
7. `G01-pending`
8. `G02-expired`
9. `G02-changed`
10. `G02-full`
11. `G02-web`
12. `G03-waiting`
13. `G03-declined`
14. `G05-members`
15. `G06-no-club`
16. `F01-no-club`
17. `M01-no-club`

## A02-email

Ben enters ben@example.com in one native email field. The address is a reserved example, not an account to contact. Send a code becomes enabled when the address has a plausible email format. The frame shows an entered, focused field and an enabled button.
Send a code submits once, preserves the address during a network failure and moves to A02-code only after the server accepts the request. Keep the invitation intent through sign-in. Use the email keyboard, no autocorrection and no automatic capitalization. The field is 54 pt high; the only primary button is 50 pt.

## A02-code

One native text field accepts all six digits, paste and system code AutoFill. Set textContentType to oneTimeCode and use the number pad. There are no six separate focusable boxes. The shown address stays visible. Verify code is disabled until six digits are present; verification starts on an explicit tap.
The frame is before resend availability. The fixed 44 pt resend region sits below Verify code and above Change email address. It shows the static one-minute sentence; after 60 seconds it shows Send a new code in the same place. There is no ticking label or disabled link. Change email address returns to A02-email with the address intact.

## A02-code-error

This frame shows a server-confirmed expired code after resend becomes available. The six entered digits stay visible. The field border, error icon and literal message identify the failure without relying on red alone. Verify code remains disabled for this known expired challenge.
For a wrong code, use That code wasn’t correct. Try again or send a new one. Allow up to two metadata lines without moving the resend region. Keep the typed digits until Ben edits or explicitly sends a new code. Successful resend clears the old digits, starts the new challenge and returns to the waiting treatment in A02-code. Server rate limits still apply.

## A02-age

Show this after the email code is accepted and before a new profile is completed. The single primary action is I’m 18 or older. The explanatory sentence gives the reason. Do not add a checkbox, date picker, birthday field or second confirmation screen.
The confirmation records eligibility before profile and club access. Leave sign-in exits the restricted setup session and returns to Welcome; it does not mean the person confirmed being under 18. Going back also cannot bypass eligibility. Returning accounts with eligibility already recorded do not repeat this step unnecessarily.

## A03-profile

Ben’s name is required; the photo is optional. The 68 pt initial fallback uses the same neutral canvas tokens as the smaller brand avatars, with a 28/34 bold initial. The utility title stays 32/35 and wraps instead of shrinking. Continue is enabled with Ben and no photo.
Add photo opens the native limited photo picker; do not request full library or contacts access for setup. Canceling the picker preserves the name. A photo upload failure must still allow continuing with the initial. Reject only an empty or whitespace-only name here, and explain a failed save without discarding the name or photo selection.

## G01-invite-people

Ben is the creator. The five fixture invitees stay in the Sunday people order. Every person has a separate revocable link. The example shows Maya as Shared, Alex, Sam and Nina as Not shared, and Debby as Accepted. These are creator-only link states, not an approval tracker.
Share link and Share again open the native system share sheet for that person’s link. Keep Not shared when the sheet is canceled. Shared means a sharing activity completed, not delivery or reading. Accepted requires server-confirmed acceptance of the current roster revision. There are no totals, progress meters or missing-approval lists. Done for now leaves setup safely.

## G01-pending

The named club has not activated. The screen explains that people agree to the same roster and that prepared drops remain private. Open Drafts opens account-private work; Review invitations returns the creator to G01-invite-people. No caption, photograph or draft is submitted from this screen.
Activation requires at least two people to mutually approve the same active roster. Invitees who have not accepted cannot become active members through that threshold. Any broader roster still needs the required approvals. On activation, continue to the existing schedule confirmation flow. Do not automatically send saved Drafts or silently change their audience.

## G02-expired

Show the expiry plainly and name only the inviter, Ben. There is no club name, roster, member count, image or activity. Ben can provide a new invitation link; the recipient cannot renew Ben’s link from this error screen.
Close invitation clears the unusable pending invitation and routes to Home when already signed in, otherwise Welcome. The signed-out web route remains G02-web; this native recovery state may be shown before sign-in because it reveals no additional club information.

## G02-changed

This state is available only after sign-in and eligibility. The server resolved a changed roster, so Ben reviews the full current exact Sunday people roster, including Ben once. The list order is Ben, Maya, Alex, Sam, Debby, Nina. No previous roster comparison or member activity is disclosed.
Accept this roster submits the displayed revision identifier. If it changed again, reload this state and require another explicit acceptance. Never accept a newer roster silently. Not now grants no membership. Candidate roster review is a narrow invitation permission; it never unlocks club captions, media, history or upload destinations.

## G02-full

Show this authenticated recovery state when acceptance cannot proceed because capacity is six. The count describes capacity, not how many people acted. Keep the club name, roster and photos out of this screen. Ask Ben for a new invitation if a place opens.
Close invitation returns to the signed-in root. Do not offer Join anyway, a seventh slot, a waitlist or a claim that a place is reserved. A new invitation and current roster approval are needed after a vacancy. The signed-out link still opens the minimal G02-web page.

## G02-web

The full web content is the 144 pt outlined wordmark, Ben invited you to a club on Tadayo, and Get Tadayo. There is no club name, roster, photo, preview, app-store rating, sample card or extra marketing sentence. The frame is a 393 × 852 browser viewport; browser chrome is owned by the browser.
Use the supplied SVG at 144 CSS px wide with its 915:290 aspect ratio. Clear space is one lower t stem width below the crossbar: 44 source units, or 6.925 pt at this width. Get Tadayo uses the configured store destination; preserve the opaque invitation intent when supported. The URL, social preview, HTML metadata and analytics must not expose roster or club details.

## G03-waiting

Leila is the viewer in this state. Leila has accepted the Kitchen table roster and waits for the existing members’ approval. Waiting for club approval is a clock plus literal text. There is no named approval list, total approved, percentage or notification aimed at chasing someone.
Leila will see only drops shared after joining. Until the membership activates, the candidate cannot browse club content or use club upload destinations. Done returns to Leila’s signed-in root. Reopening the invitation reloads its current server state. Repeated acceptance is idempotent; it must not create another proposal.

## G03-declined

Leila sees the neutral outcome This invitation didn’t go ahead. The screen does not name a person who declined, imply a reason or show a partial acceptance roster. Ben remains the only named person in the recovery copy.
Close invitation removes the inactive invitation from the active navigation task and returns to the signed-in root. A new proposal, if any, starts a new explicit approval process. Do not provide a Retry approval action or expose the earlier private decisions through a detail screen, push notification or accessibility label.

## G05-members

Sunday people is full. The current roster is Ben Monday, Maya Tuesday, Alex Wednesday, Sam Thursday, Debby Friday and Nina Saturday. Ben is marked You. Names and weekdays remain legible in stable order; there is no popularity sort and no invitation action at capacity.
The full-club screen has no proposed member. In a five-member Kitchen table list, place Leila in one separate proposed row after the current roster: Leila, Proposed by Ben, Proposed. The revised brand-components frame shows that row. Do not assign a reveal weekday or count Leila as active before activation.

## G06-no-club

Ben is signed in but has no active club. Home gives the two clear routes Create a club and I have an invite. The wordmark is 96 pt here; the profile fallback is 28 pt. Private Drafts is easy to find even before a club exists and reveals only Ben’s own unsent work.
Create a club opens G01 naming, then invitations. I have an invite opens the native link-entry or deep-link recovery route without revealing any club first. Home, Friends and Memories stay visible and usable. The selected tab uses its native selected symbol and label, with no custom capsule drawn in content.

## F01-no-club

Friends is selected. No example people, placeholder avatars, suggested contacts, activity or progress appear. Create a club and I have an invite lead to the same routes as Home. No contacts permission is requested.
The empty message explains what will appear here after joining. Switching tabs keeps the current setup context and any Drafts. Account remains available from the 28 pt avatar button. Give the avatar a 44 × 44 hit region and an accessible Account label.

## M01-no-club

Memories is selected. There are no fabricated months, photos, history tiles or example dates. The text states that past reveal days appear after joining a club. Go to Home selects the existing Home tab.
A no-club account has no club history to query. This state differs from a newly joined club with no eligible history, which remains the existing M01-empty design. A saved favourite cannot bypass membership or content deletion. Keep Drafts under their account-private route, not in a fictional Memories archive.

## Authentication behaviour

### Flow

Email → code → age confirmation when needed → profile when needed → retained invitation or Home. An existing eligible profile returns directly to the retained destination after verification.

### Submission

Use one in-flight request per primary action. While sending or verifying, keep the button height and label stable, disable repeated submission and expose the busy state accessibly. Do not display a successful transition until the server responds.

### Resend timing

The server returns a resend eligibility time. The UI permits Send a new code no earlier than 60 seconds after a successful send and no earlier than any server cooldown. Derive the next availability from an absolute instant when the app returns from background; do not restart a local counter on navigation.

### Fixed resend region

Reserve one 353 × 44 pt row centered below Verify code, baseline 465 in the reference. Before availability: the static 13/18 sentence. After availability: the 16 pt action. Change email address stays in its own 44 pt row below. Announce availability once, politely, without moving accessibility focus.

### Error meaning

Show a specific wrong-code or expired-code response only when the server distinguishes it. If it cannot distinguish them, say This code couldn’t be verified. Try again or send a new one. Never turn a network failure into a wrong-code claim. Keep entered digits after failed verification.

### Resend result

On successful resend, clear the old code, replace the challenge identifier, return focus to the one-time-code field and show the static waiting sentence. On failure, retain input and show the service error without claiming a new email was sent. The expired error frame shows an elapsed cooldown; an earlier error keeps the static wait row until eligible.

### Age confirmation

One explicit action records only the 18-or-older confirmation and its necessary audit metadata. No birthdate field. A verified but unconfirmed session is restricted to setup and exit. An invitation is revalidated after eligibility; it never grants club access during this step.

### Field behavior

Preserve selection and editing with native text fields. Email allows pasting and editing; one-time code uses a numeric keyboard and oneTimeCode semantic type. Keep error text associated with its field. Do not disable paste, build six separate fields or make a timer the only available feedback.


## Invitation and membership behaviour

### Access boundary

The signed-out web page discloses only the inviter and wordmark. Sign-in and eligibility precede roster review. Candidate roster review grants only the current proposed roster, never captions, media, thumbnails, activity, history or upload credentials. Enforce this on the server.

### Exact roster

Bind acceptance and approvals to a revision identifier. The candidate appears exactly once. A changed revision invalidates stale acceptance and returns to review. Activating one mutually approved roster does not silently activate people who were merely invited to a broader proposal.

### Invitation link

One revocable invitation token per intended person; no contact import. Before the shown list is filled, Create an invitation asks only for the person’s display name, prepares a separate link and opens the native share sheet. At the shown five-invitee capacity, omit that add-person control. The token is a proposal, not a membership credential. Associate the accepted authenticated candidate with the roster revision. If the accepting identity differs from the reviewed candidate, require the roster process again. Do not place names or roster data in the token itself.

### Creator-only status

Not shared means the prepared link has no confirmed sharing activity. Shared means the native activity reported completion; it does not mean delivered, opened or read. Accepted means current-revision acceptance was confirmed by the server. These labels appear only to the creator; do not export them to other members.

### Native share sheet

Open UIActivityViewController with the current person’s link. A canceled sheet does not change status. A completed activity can mark Shared, including a copy activity; it cannot confirm the message reached anyone. If completion is unavailable, leave Not shared until an explicit creator acknowledgement. Do not add read receipts.

### Pending and activation

Require at least two mutually approving people on the same active roster, plus all approvals that roster requires. Proposed additions remain separate from active members. Preserve drafts and invitation intent through app backgrounding, sign-in and network retries; revalidate capacity and revision before acceptance.

### Proposed member row

In Kitchen table, show the five current members first, then a single row for Leila. Primary name Leila; subtitle Proposed by Ben; trailing outlined status Proposed. Use the regular row avatar and a minimum 76 pt growing row. It is not a switch or a checked member. No weekday, vote count, approver list or automatic enrolment.

### Neutral outcomes

Decline copy never reveals who declined. Expired copy names only Ben and how to obtain a new link. A full-club recovery appears after sign-in. Closing recovery clears only the active invite task; it does not sign out the account or remove another active membership.

### Private drafts

Drafts are account-private and can exist with no club. A proposed club or recipient is an editing hint, not an audience grant. Activation never submits a draft. Resuming one must require an explicit eligible club, person and exact occurrence before Add can commit it.


## Complete brand corrections

Use the full replacement frames brand-tokens, brand-components and brand-icon-dark. Do not merge old and new token values. Primary text values and wordmark geometry are retained. Revised light inputBorder is #778579; cover1 is #EEDFC4 light / #DFCFB3 dark; day plaque accent is unchanged.

| Role | Light | Dark |
|---|---|---|
| canvas | #FAFBF8 | #121D19 |
| surface | #F0F2EC | #203027 |
| primaryText | #182B25 | #F7F8F2 |
| secondaryText | #607067 | #B6C3B7 |
| action | #284CDB | #AFBEFF |
| onAction | #FFFFFF | #18233B |
| separator | #DCE2DA | #35463A |
| accent | #F0E4A8 | #E4D8A2 |
| onAccent | #182B25 | #182B25 |
| destructive | #AD3529 | #FFB4A5 |
| inputBorder | #778579 | #8C9B90 |
| actionPressed | #203FB7 | #96A9F2 |
| onActionPressed | #FFFFFF | #18233B |
| actionDisabled | #E2E6DF | #35463A |
| onActionDisabled | #4F5E55 | #BAC6BD |
| focusRing | #284CDB | #AFBEFF |
| avatarCanvas | #E1E5F6 | #35463A |
| onAvatarCanvas | #182B25 | #F7F8F2 |
| avatarOnCover | #182B25 | #182B25 |
| onAvatarOnCover | #FAFBF8 | #FAFBF8 |
| photoLabel | #FAFBF8 | #FAFBF8 |
| onPhotoLabel | #182B25 | #182B25 |
| cover1 / ink | #EEDFC4 / #182B25 | #DFCFB3 / #182B25 |
| cover2 / ink | #E1E5F6 / #182B25 | #D4D9EC / #182B25 |
| cover3 / ink | #DFE7D9 / #182B25 | #D0DCC9 / #182B25 |
| cover4 / ink | #F1DFD6 / #182B25 | #E5D2C8 / #182B25 |
| cover5 / ink | #DCE9EB / #182B25 | #CCDEE1 / #182B25 |
| cover6 / ink | #EADFED / #182B25 | #DDCFE2 / #182B25 |

### Avatar placement

| Placement | Light fill / ink | Dark fill / ink |
|---|---|---|
| Canvas or surface | #E1E5F6 / #182B25 | #35463A / #F7F8F2 |
| cover1 | #182B25 / #FAFBF8 | #182B25 / #FAFBF8 |
| cover2 | #182B25 / #FAFBF8 | #182B25 / #FAFBF8 |
| cover3 | #182B25 / #FAFBF8 | #182B25 / #FAFBF8 |
| cover4 | #182B25 / #FAFBF8 | #182B25 / #FAFBF8 |
| cover5 | #182B25 / #FAFBF8 | #182B25 / #FAFBF8 |
| cover6 | #182B25 / #FAFBF8 | #182B25 / #FAFBF8 |

Circle and initial sizes: 36 pt with 16/20 bold; 28 pt with 13/18 bold; 18 pt with 9/11 bold; profile 68 pt with 28/34 bold. Header avatars use a 44 pt touch target.

### Buttons and fields

Button default = action/onAction; pressed = actionPressed/onActionPressed; disabled = actionDisabled/onActionDisabled, with no opacity multiplier. Minimum height 50, label 16/22 bold, radius 13. Keyboard focus = 2 pt ring outside a 2 pt canvas gap, extending 4 pt beyond the control. Inputs have a 1 pt inputBorder on canvas or surface; use an independent destructive border and literal error for errors.

### Type and geometry

| Role | Size / line height | Weight |
|---|---|---|
| utilityTitle | 32 / 35 | bold |
| dayTitle | 31 / 34 | bold |
| dateTitle | 25 / 29 | bold |
| emptyTitle | 25 / 30 | bold |
| body | 17 / 23 | regular |
| row | 17 / 22 | bold |
| metadata | 13 / 18 | regular |
| cardStatus | 13 / 18 | regular |
| caption | 21 / 28 | bold |
| highlight | 12 / 14 | bold |
| plaqueWeekday | 10 / 12 | bold |
| plaqueDay | 25 / 28 | bold |
| clubHeader | 16 / 20 | bold |
| headerAdd | 15 / 20 | bold |
| button | 16 / 22 | bold |
| tab | 11 / 14 | regular |
| allowance | 12 / 17 | regular |
| photoLabel | 11 / 14 | bold |
| avatar36 | 16 / 20 | bold |
| avatar28 | 13 / 18 | bold |
| avatar18 | 9 / 11 | bold |
| avatarProfile68 | 28 / 34 | bold |

Folded card radius 16; ticket 18; photo 14; surface 12; input 10; plaque 9. Insets 20 at 393 wide. Collecting cards are 353 × 151 minimum and grow. Photo chip is opaque #FAFBF8 / #182B25 in both themes, 11/14 bold, radius 6 and padding 6 vertical / 8 horizontal.

A 91 × 69 highlight cover uses 12/14 bold. Deborah-Anne’s pick wraps after the hyphen. At large text, use full-width vertical rows 353 wide and 96 minimum height; grow them, using 20/26 label text in the reference. Never shrink the name. Before reveal, only the viewer’s own cards show Highlight.

### Dark icon and wordmark

The full 1024 × 1024 brand-icon-dark SVG and PNG have transparent backgrounds with the retained #F0D968 monogram. The opaque handoff 0 square is superseded. iOS supplies the background and mask. In Icon Composer use the same foreground as a layer and verify supported appearances.

Wordmark uses its existing outlined geometry. G02-web and Welcome width 144; minimum 96. Clear-space unit u is 44 of the 915 source viewBox units, measured across the lower straight vertical stem of the first t below the crossbar near source y=160. At 144 width u=6.925 pt. Keep at least u clear on every side of the viewBox.

## Existing screen copy changes

- A01-welcome: “An example · before and on the day”; wordmark width 144 pt.
- G03-approve: “Leila will see only drops shared after joining”.
- G06-switcher backdrop: “Debby’s pick”.

## Native implementation and access

Use the system keyboard, a native oneTimeCode field, UIActivityViewController, and native TabView/UITabBarController. Selected tab uses the selected/filled system symbol plus its persistent label and action tint; no custom content pill. The system supplies OS-specific material. Support VoiceOver, large text, Reduce Motion and 44 pt targets. The screenshots are schematic, not actual OS captures.

Do not ship the diagrams as UI images. Auth and invite privacy must be enforced by server authorization. No invitation token grants content or upload access. Full-club and changed-roster screens require sign-in. Pending, accepted and proposed states do not establish active membership or historical access.

All 58 specified contrast checks pass: 38 text pairs ≥4.5:1, 8 field/focus checks ≥3:1, 12 avatar-on-cover boundary checks ≥3:1. Native device testing remains required.

## References

- Product authority: Tadayo UI UX Design Book 2.1, pages 7, 8, 9, 23, 24, 30, 32, 33, 34, 35 and 41; Tadayo v3 Build and Design, sections 04, 07, 09, 18, 23, 24 and 29. The current handoff instructions supersede earlier magic-link, invitation-disclosure and brand examples where they conflict.
- Brand reference: Supplied brand-components.png and brand-tokens.md; original Tadayo Brand Implementation Handoff assets. Revision 1.1 in this pack replaces the token, component and dark-icon definitions; the outlined wordmark geometry is retained.
- Apple one-time code: https://developer.apple.com/documentation/uikit/uitextcontenttype/onetimecode
- Apple sharing completion: https://developer.apple.com/documentation/uikit/uiactivityviewcontroller/completionwithitemshandler-swift.typealias
- Apple dark icon background: https://developer.apple.com/documentation/xcode/configuring-your-app-icon
- Apple native tab bars: https://developer.apple.com/design/human-interface-guidelines/tab-bars
