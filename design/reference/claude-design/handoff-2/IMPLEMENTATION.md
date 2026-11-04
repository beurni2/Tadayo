# Tadayo implementation handoff 2

Corrections to sign-in and clubs. Issued 2 November 2026.

## Frame order

1. `A02-code-error`
2. `G02-changed`
3. `G03-waiting`
4. `G03-approve`
5. `M01-no-club`
6. `F01-no-club`
7. `G05-members-two-days`
8. `G01-invite-people-add`
9. `G01-invite-name`
10. `G01-invite-people-xl`
11. `G02-link-entry`
12. `G02-web-dark` — supplemental web proof
13. `G02-web-xl` — supplemental web proof
14. `brand-components` — complete replacement component frame

## Scope and files

The first eleven frames exactly follow the requested state names and order. Two supplemental web proofs follow, then the complete replacement brand-components frame. All frames have 2x PNG exports; screen SVGs are 393 × 852 logical points.

brand-tokens.json remains byte-for-byte revision 1.1. Its colour values, existing typography, radii, cover assignments and icon geometry are unchanged. New names and component contracts live in component-contracts.json. The full corrected brand-components is reissued under its existing name. The retained transparent brand-icon-dark master is included unchanged.

The SVG frames outline Arimo glyphs for portable rendering. Arimo and its OFL licence are included. Use iOS system typography, native keyboard, share sheet, paste control, menus and alerts in the app; the drawings are schematics, not OS screenshots.


## Roster and invitations

One invitationRosterRow is shared by G02-changed and book 2.1 G02-invitation: 36 pt avatar with avatar36 initial, 17/22 bold name, 52 pt minimum growing row, 49 pt text inset, candidate shown once with · You. There are no day labels in invitation review. Sunday people stays Ben, Maya, Alex, Sam, Debby, Nina. Debby invites Ben in G02-changed.

Keep the club, inviter and displayed roster revision together in authenticated review. Acceptance always names that revision. Leila may accept before or after the five current Kitchen table members approve; activation still requires the exact same roster and all required approvals. Pending status grants no history, media or upload access.

G01-invite-people-add captures the More menu for Alex. The row’s More button has a 44 × 44 target and the accessible label More options for Alex’s invitation. Revoke link leads to the native confirmation below. Cancel keeps the link. A confirmed revoke changes only that invitation token; it never removes an accepted member or silently edits the roster.

After a successful revoke, keep Alex’s row marked Link revoked and offer Create new link. Do not include a full secret URL in a snackbar, log, accessibility label or roster payload. If the response is lost, recheck token status rather than declaring the link still active or definitely revoked.


## Focus and code errors

For a text field, the ring means editing focus: show it whenever the field is first responder, whether focus began by touch or keyboard. The handoff 1 A02-email and A02-code rings are correct. A02-code-error was missing the ring while the keyboard remained open; that is corrected here.

A focused invalid field has both a 1 pt destructive inner border and the 2 pt focusRing outside a 2 pt gap. Keep the icon and literal error. Do not replace the ring with red, clear the digits, dismiss the keyboard or move focus after inline failure. An unfocused invalid field keeps its red border and no outer ring.

Buttons retain the existing rule: the extra outer ring is for visible keyboard focus, not ordinary touch. Native VoiceOver and Full Keyboard Access indicators remain system-owned. Verification does not claim wrong or expired when the server cannot distinguish them. Six digits make Verify code available, subject to in-flight and server rate-limit states.


## Shared utility controls

I have an invite is always one secondary button: 353 wide at the reference width, 50 pt minimum high, radius 13, surface fill, 1 pt inputBorder and primaryText label in the existing button role, 16/22 bold. Apply it to A01-welcome, G06-no-club and F01-no-club. It opens G02-link-entry everywhere.

Private drafts is always one rounded row: 353 wide, 76 pt minimum high, radius 12, surface fill, leading folder, title Private drafts in row 17/22 bold, subtitle Only you can see these. in metadata 13/18, and trailing chevron. Apply it to active/no-club Friends, no-club Home and pending setup. The route is the author’s account-private collection.

On G01-pending, the row replaces the old tall explanatory card and the duplicate Open Drafts primary button; retain Review invitations. On G06-no-club, replace the plain row with this rounded row. On Friends, put it first below the page title. A draft is not sent on activation and does not need a club.

All no-club root headers use the unchanged outlined wordmark at 96 pt on the left, + Add and Account on the right. Keep Add: it opens the normal Add destination picker with Private draft first and Open my drafts, with no invented club or member list. Once a club is active, the selected club switcher occupies the leading slot as before.


## Type and wrapping

All plain text actions use textAction 16/22 regular: Not now, Send a new code, Decline and Add photo. Row link actions use rowAction 15/20 regular. Contained primary and secondary button labels use the existing button 16/22 bold. Header + Add remains the existing headerAdd 15/20 bold; it is not a plain text-action variant.

Field labels use fieldLabel 13/18 bold. Kitchen table on G03-waiting uses eyebrow 13/18 bold. The Proposed status tag uses proposedTag 13/18 bold with intrinsic width, 8 pt horizontal and 5 pt vertical padding, a 6 pt radius and inputBorder outline on surface. Colour is not its meaning.

Titles and short texts have no extra character-width cap, maximum line count or fixed character count. At 393 wide they wrap in the full 353 pt content width. Inside a row, subtract only the real icon and padding insets. Use natural native wrapping, not hard-coded artistic line breaks from a static reference. Grow rows and buttons; never shrink the font to fit.

G01-invite-people-xl uses accessibilityExtraExtraExtraLarge / SwiftUI accessibility5, not the ordinary xxxLarge setting. The Arimo reference uses row 53/65, metadata 44/54, row actions 49/60 and button text 50/61. Production uses uncapped UIFontMetrics; native line metrics vary by OS and language. The native bar remains system-owned.

At AX5, stack a row’s status and action below its name. Keep a separately accessible More button with a 44 pt target. The proposed member’s Proposed tag moves below Leila and Proposed by Ben, leading aligned on its own line. It is never squeezed into a trailing column. Let a translated tag wrap and its row grow.


## Fold and photograph label

The folded corner line is now named foldCornerLine: #8C8F84 in light and #8C8F84 in dark. This preserves the existing delivered value. It is a 0.75 pt decorative edge, not text or a control boundary. The name is supplied in component-contracts.json without changing the base 1.1 palette.

The photograph label follows the text contract, not the erroneous fixed-width outline drawing: no outline, intrinsic width, 6 pt vertical and 8 pt horizontal padding, radius 6. Add a 12 pt star.fill before Highlight with a 4 pt gap; text stays photoLabel 11/14 bold. Default height is 26 pt. Use opaque photoLabel fill and onPhotoLabel ink in both themes: #FAFBF8 / #182B25.

The full replacement brand-components includes light and dark labels over the same existing chair photograph. The original embedded JPEG bytes are unchanged; no tint, filter or darkening is applied. The labels scale and grow with text, and no 100 pt width is fixed. A decorative star is not a second accessibility element.


## Link entry and browser text

G02-link-entry uses a native URL field and UIPasteControl. Do not read the clipboard before the user chooses Paste. Validate format against the app’s configured Universal Link domains; do not fetch an arbitrary pasted URL. A valid format stores an opaque invitation intent. If signed out, continue through authentication before fetching or displaying the club and roster; an eligible signed-in account goes to the current invite state. Opening a shared link uses the same route.

Before sign-in, never put a club name, roster, photograph or membership activity in the entry screen, web HTML, URL metadata, previews or analytics. Invalid, expired, changed and full recovery must preserve the entered link or its opaque intent; no submitted text is discarded on a network failure.

G02-web switches with prefers-color-scheme. Dark uses canvas #121D19, primaryText #F7F8F2 and action #AFBEFF, including the unchanged dark wordmark geometry. The only content remains the inviter sentence, wordmark and Get Tadayo link.

Use relative text sizing: title 2rem with 1.1875 line height and link 1rem/1.375 at the normal root size. Keep the logo 144 CSS px wide, content width calc(100% - 40px) at phone widths, and minimum 44 px link target. Permit browser text zoom and pinch zoom; do not set maximum-scale=1, user-scalable=no, text-size-adjust:none or a fixed-height clipped content panel.

G02-web-xl is the 200% text-zoom proof. At larger zoom or a smaller viewport, allow vertical scrolling and natural word wrapping rather than reducing text size. Dark mode and text zoom compose independently. The SVGs are layout proofs; validate actual Safari text zoom and supported OS controls during implementation.

## Exact failure messages

| Failed action | Exact message | State retained |
|---|---|---|
| Send a code · network | Couldn't send a code. Check your connection and try again. | Keep the email; remain on A02-email. Retry uses the same address. |
| Send a code · server | Couldn't send a code. Try again. | Keep the email. A server cooldown says: A code can’t be sent yet. Try again shortly. |
| Verify code · network | Couldn't verify the code. Check your connection and try again. | Keep the email and all six digits. Do not label the code wrong or expired. |
| Resend · network | Couldn't send a new code. Check your connection and try again. | Keep the address, old challenge and typed digits. Do not reset the wait until a new send is confirmed. |
| Resend · server | Couldn't send a new code. Try again. | Same retained input. Respect a returned server cooldown; do not claim an email was sent. |
| Save profile | Couldn't save your profile. Try again. | Keep the name and selected photo. For a network failure: Couldn’t save your profile. Check your connection and try again. |
| Upload profile photo | Couldn't upload your profile photo. Try again or continue without a photo. | Keep the name and selected image. Offer Retry photo upload. Continue still works with the initial fallback. |
| Revoke link · server | Couldn't revoke Alex's invitation link. Try again. | Keep Alex’s row, prepared link and all other invitation state. Do not show Link revoked. |
| Revoke link · uncertain network | Couldn't confirm that Alex's invitation link was revoked. Check your connection and try again. | Keep the row and last known state. Recheck the token status; the request may have reached the server. |

## Revocation confirmation

- confirmationTitle: Revoke Alex's invitation link?
- confirmationBody: Alex won't be able to use this link. You can create a new link for Alex later.
- confirm: Revoke link
- cancel: Keep link
- pending: Revoking link…
- success: Alex's invitation link was revoked.
- rowStatus: Link revoked
- nextAction: Create new link
- knownFailure: Couldn't revoke Alex's invitation link. Try again.
- uncertainNetworkFailure: Couldn't confirm that Alex's invitation link was revoked. Check your connection and try again.
- scope: Only an unaccepted invitation token is revoked. Do not remove an accepted member or silently change a roster. Hide the revoke action after Accepted.

## Share action accessibility labels

| Person | Share link | Share again |
|---|---|---|
| Maya | Share link for Maya | Share again for Maya |
| Alex | Share link for Alex | Share again for Alex |
| Sam | Share link for Sam | Share again for Sam |
| Debby | Share link for Debby | Share again for Debby |
| Nina | Share link for Nina | Share again for Nina |

Debby currently has Accepted in the full-list fixture, so no share/revoke control is rendered for Debby there. The labels above apply if that control is legitimately available in a different unaccepted proposal; labels do not manufacture a control.

## References

- Tadayo Handoff 1 Implementation PDF and pack; Tadayo design book 2.1, pages 6, 7, 9, 11, 23, 30, 34, 35, 41 and 44; v3 build spec, sections 04, 07, 18, 23, 24 and 29.
- Apple largest accessibility category: https://developer.apple.com/documentation/uikit/uicontentsizecategory/accessibilityextraextraextralarge
- Apple font scaling: https://developer.apple.com/documentation/uikit/uifontmetrics
- Apple Dynamic Type overview: https://developer.apple.com/videos/play/wwdc2024/10074/

The current requested corrections govern conflicting handoff 1 copy and component rules. This is a design export; native authentication, sharing, link revocation and device accessibility are not live or device-tested in these files.
