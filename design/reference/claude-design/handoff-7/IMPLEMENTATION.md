# Tadayo · Design handoff 7

Stage B0 · Sign-in, profile, no-club tabs and drop-card contracts  
7 November 2026 · Brand revision 1.1 unchanged

## 1. Delivery and precedence

The manifest orders 30 frames: the sixteen requested B0 states, the whole brand-components sheet at position 17, the five requested dark/large-text states at 18–22, then eight consequent redraws. Phone frames are 393 × 852 points; PNGs are exactly 2×. SVG text is outlined from the included Arimo font; both the original variable font and static regular/bold instances ship with the licence. They are design references, not a replacement for native controls.

The eight consequent redraws, in order, are A02-email, A02-code, A02-code-error, A02-age, A03-profile, G06-no-club, F01-no-club and M01-no-club. They make B0 entry/exit, shared authentication spacing and the no-club header consistent with the answers below. They do not introduce another product flow. A02-code-error also uses ’. H01-open and F02-upcoming are not resent for the brief’s item 17e alone; its component specimens are their authoritative corrections.

Keep brand-tokens.json byte-for-byte revision 1.1. The entire H6 component sheet is preserved above the new H7 section. Earlier component and copy entries remain semantically unchanged. Read handoff7.replaces in each cumulative file for the narrower replacement scopes; do not globally rename an older key in an unrelated screen. Each new interface sentence and announcement has its own key under handoff7. Reusable copy uses parameters; real examples are in screen-copy.json and fixture-values.json. The source H1 screen-copy mapping identifies previously unkeyed strings. “Sent to {email}” remains the one approved exception to the ban on new Sent copy.

Everything is B0 or an explicitly requested future drop component. The guest-contribution/SMS proposal is not part of this handoff. Do not add it to the build from this pack.

## 2. Authentication: focus, busy and failures

### Email arrival and sending

A02-email-empty is the first screen in B0: no Welcome back chevron. Frames 1–3 have no chevron. A02-email’s consequent redraw follows the same rule. Show the native email keyboard immediately and focus the email field. Placeholder: **Email address**. Send a code is disabled until the address is plausible. The disabled state uses actionDisabled/onActionDisabled, not reduced opacity.

A02-email-sending keeps the exact Send a code label and button height. Use action/onAction with a native indeterminate 16-point indicator. Its right edge sits 8 points before the centered label. Reserve symmetric accessory space in idle/busy layout, so neither the label nor the height shifts. At large text a group that cannot fit moves the indicator into a reserved centered accessory row; both idle and busy reserve that row. Do not truncate or shrink the label. Repeated submission is disabled; the accessible label remains Send a code and the value becomes In progress. Announce Sending a code. once.

Keep the focused field and keyboard in place while the input becomes read-only. Do not disable the whole form in a way that unexpectedly resigns first responder. The same busy treatment applies to Verify code, I’m 18 or older and Continue, with their own action announcements. Busy is a request state, not the disabled/invalid colour state.

### Failures do not falsely invalidate input

A network failure and a generic server refusal get the exclamation-in-circle icon and literal message in metadata/destructive. They do **not** give an otherwise valid field a destructive border. A focused field keeps the normal inputBorder plus its focusRing. Only invalid address, invalid code and rejected name responses use the destructive field border. The outer focus ring remains 2 points wide with a 2-point gap even with an inner error border.

Email failures insert a growing error block below the field, moving Send a code and the helper down. Use the same email whenever you sign in. stays. Do not force an error into the old 26-point gap. Send a code retries the retained address. A server refusal reads Couldn’t send a code. Try again. An actual address-format rejection gets Enter a valid email address. and the invalid-field treatment. It is not a rate-limit or network message.

Every failure is announced once with its exact displayed words and without moving focus. The copy file includes individual vo.failure keys, not a generic error announcement. No failure clears typed text, selection or a chosen photo. No refusal promises a wait or starts a fabricated cooldown.

### Code verification

Use one native one-time-code text field, numeric keyboard, paste and AutoFill; not six independent fields. Verify only on explicit submission and only with six digits. During verification the field is read-only and Change email address is inactive. Send a new code is also inactive if its minute has elapsed. Keep Verify code busy until the account record resolves the next destination: age, profile, retained invitation or Home. A verified code followed by an account-read failure leads to the root account failure screen, with the sign-in kept, rather than showing a wrong-code error.

Below the code field reserve two metadata lines at default size. The region grows at larger text sizes. A connection failure uses Couldn’t verify the code. Check your connection and try again. A server limit/failure uses Couldn’t verify the code. Try again. (FQ86 confirmed). Both retain all digits and keep Verify code enabled for retry. A wrong or expired code uses the neutral This code couldn’t be verified. Try again or send a new one. It also retains digits. Do not claim the server distinguished wrong from expired. The corrected base error frame keeps Verify code available when six digits remain; a server-enforced cooldown can still refuse the request without an invented client timer.

The code screen’s Back has the same safe result as Change email address: return to email with the address retained. Those actions are unavailable while verification/resend is in flight.

### Resend row and its own failure

Before eligibility the same row shows only You can send a new code after one minute. After the minute, replace it with Send a new code. There is no ticking countdown and no disabled resend link. Announce Send a new code is available. once, without stealing focus. Derive eligibility from the successful send’s absolute timestamp and any genuine server-provided later eligibility; do not restart it on navigation or foregrounding.

During resend, use Sending a new code… in textAction, with a small native activity indicator, secondaryText. This key is now explicit. Input edits, Verify code and Change email address are inactive until the request completes, even if the old challenge has six digits. Announce Sending a new code… once.

Only success replaces the challenge, clears old digits and resets the minute. Return focus to the code field and show the waiting sentence again. Announce Check {email} for a new code. You can send a new code after one minute. This confirms the successful request without promising arrival time.

A failed resend restores Send a new code immediately without resetting the minute. Its message belongs in a separate growing block immediately **below the resend action**, not in the field’s validation slot. Network: Couldn’t send a new code. Check your connection and try again. Server: Couldn’t send a new code. Try again. If a wrong-code message already exists, it stays above Verify code; the resend failure appears in its own block. Both can coexist. The body scrolls instead of overlapping the keyboard. Announce the resend failure only, not another availability announcement in the same transition.

### Age confirmation and exit

Keep one step: Before you continue, the 18-and-older explanation, and I’m 18 or older at the bottom. No checkbox or birthdate. Failure wording is now specific: Couldn’t save your age confirmation. Check your connection and try again. or Couldn’t save your age confirmation. Try again. Place the growing message above the pinned button with at least 16 clear points. The busy announcement is Saving your age confirmation.

Use a native leading **Leave sign-in** text action on both A02-age and A03-profile. It replaces the misleading back chevron; A03 never navigates back to undo a recorded age. There is no extra confirmation alert: the explicit exit has no destructive account operation. Leaving removes the session from this iPhone and returns to A02-email in B0, with the address retained in memory. Recorded age remains on the server. While save is in flight, Leave sign-in is inactive. If leaving fails, show the root phone-removal failure; never show an apparently signed-out email screen over a retained session.

This adds the missing exit on A03 without turning setup into a general account-management screen. An incomplete account may finish setup or leave only. Do not infer an under-18 status from leaving.

## 3. Profile and large-text form behavior

A03-profile-empty is focused on arrival, with a native name keyboard, at default and largest text sizes. Continue stays keyboard-pinned with 12 clear points above the keyboard. One vertical scroll view holds title, helper, avatar, Add photo, Optional, label, field and validation. The default frame shows the 68-point non-photo person fallback. It never comes from the email address. As Ben types a name beginning with a readable letter/digit, the initial updates live.

Continue is disabled until a non-whitespace name is present. Do not add an error for an untouched empty field. Preserve an overlong name exactly as entered; disable Continue and show Use 40 characters or fewer for your name. below the field. Count grapheme clusters, trim outer spaces only before sending, and keep internal meaningful spaces/joiners. Do not silently cut the input at 40. A server-invalid name uses Choose a name with visible characters and no line breaks or hidden formatting. with the invalid-field treatment. The server rejects forbidden controls, direction controls, separators and invisible-only filler; it does not silently rewrite a name.

Saving a profile makes the name read-only and Add photo/Leave sign-in inactive; Continue gets the shared busy treatment and Saving your profile. announcement. On failure the name remains focused and the keyboard stays up. The body scrolls to keep the field and error reachable above Continue; it does not dismiss the keyboard. The failed-network frame shows that scrolled viewport, rather than shrinking the original title or overlaying it on the navigation bar. Connection and server save messages use the same growing block under the field, with no invalid border for either.

A photo upload failure belongs beside the photo controls. Keep the selected image and name, offer Retry photo upload, and allow Continue without a photo. The network and server forms have individual keys; neither makes the required-name field invalid.

At AX5, A03’s title wraps naturally across several lines at full 353-point width. The title and helper come first; the avatar, Add photo and Optional follow above the name label in document order. With first responder active, those elements are above the displayed scrolled viewport. They remain in the scroll view and accessibility order. The frame shows the name field with Continue above the keyboard; it does not try to squeeze all content above the keyboard. A02-code-error-xl similarly leaves title/address above the viewport; error continues below the visible portion, followed by resend and Change email address. All are reachable by scrolling. The default native nav bar remains platform-owned; do not implement a custom oversized navigation title in the form body.

Single-line native text fields scroll horizontally for a long value; they do not wrap the typed address/name into the border. Labels and the code destination line do wrap, without ellipsis, at available width. The long-address Sent to line may break within the address and push subsequent content down. Never shrink it.

## 4. Launch, account failures and no-club tabs

The **OS launch screen** is only the adaptive canvas background, in light or dark. No logo, marketing, text or fake spinner. Once the app can draw, do not hold that static launch screen for a minute-long account read. Replace it with a real native spinner and Loading your account…; no header or tabs before the route is known. During session removal use Leaving sign-in… with the same form. The verified-code case keeps its existing busy Verify code instead of flashing a separate loading page.

This deliberately corrects the brief’s static-runtime-launch default: a static screen for a long request looks stalled. Apple’s Loading guidance recommends an indicator for waits beyond a brief moment, and Branding discourages using launch as branding. Runtime labels have individual VoiceOver keys. Never invent a completion percentage or a timeout promise.

Confirm FQ89’s root failures: Couldn’t load your account. over Check your connection and try again. when no answer came, or Try again. when the server answered but the account could not be read. No header, tabs or guessed avatar. Retry is pinned at the foot and preserves the sign-in. The phone-only failures are Couldn’t remove your sign-in from this iPhone. and Couldn’t keep you signed in., each over Try again. No connection claim. Retry removal repeats removal; retry keep returns to A02-email with the address retained so Ben requests a fresh code. The title/body shown are exactly the VoiceOver announcement. These words fit launch and the moment immediately after verification.

When a server-ended sign-in returns Ben to email, show Your sign-in ended. Enter your email to sign in again. in a neutral body notice above the field, not as an invalid-email error. Retain the address if still available in the current flow; never reconstruct it from an account record that does not contain it.

### Neutral root header

Once Ben’s own account record is known, B is allowed in the header while the **club list** loads: it is Ben’s own identity, not club metadata. Before the account record arrives there is no avatar. Use the non-interactive 96-point wordmark, with VoiceOver Tadayo, on every no-selected-club root tab. Its leading position is the same in Home, Friends and Memories.

Default rectangles at 393 points: header y56–100; + Add x241 y56 width80 height44; Account x329 y56 width44 height44; avatar x337 y64 size28. These targets do not overlap. The wordmark starts x20 y64. + Add keeps its visible label and separate private-draft hint. At accessibility sizes the header stacks: wordmark row, then + Add and Account. Wordmark remains 96 wide. AX5 Add target x20 y104 width249 height76; Account x329 y120 size44. No text cap is applied to content controls.

The header is content in the same vertical scroll view. It scrolls away. On iOS17, 18 and 26 an opaque canvas safe-area band remains behind the status bar; content is clipped below it. Do not duplicate the header in a navigation bar or add a glass treatment to this content header. The real bottom UITabBar uses the system’s version-appropriate rendering and selected trait; no custom selected pill. The frames show neutral system geometry schematically.

### Loading and failure

H01-loading-no-club uses Loading Home…; Friends and Memories use their own corresponding labels. Native spinner, one polite announcement on entry, no shimmer, roster placeholders or fabricated club. No club-name hint is provided when no club is selected. Header and tabs remain reachable. There is no body Private drafts row while the result is unknown; + Add still provides private preparation.

When Home resolves empty, announce Home updated. once and show G06-no-club. Friends and Memories resolve without that announcement. Empty states require an authoritative empty result, never a failed request.

The three error tabs share the same anatomy, with the title 32 points below the header and supporting line 24 points below the title’s line box. Use Couldn’t load Home./Friends./Memories. over the network sentence or Try again. Retry is a primary 50-point minimum button, pinned above the native tab bar. Its accessible label is Retry; the separate hint names the tab to reload. Retry returns to that tab’s loading shell. No Create a club or I have an invite appears while membership is unknown. Private preparation is through + Add, without a redundant body row.

FQ90’s This version of Tadayo can’t show clubs yet. is confirmed for a real club/accepted invitation B0 cannot display. It is not an error or an empty account. Use the same wordmark/private Add/Account/tabs, no Retry or fabricated club controls. Announce the exact line once on entry. It names no club or invitation. The empty Home’s two buttons stay 16 points apart; Private drafts uses the one shared row, also on empty Friends. Empty Memories states the joining boundary and creates no history.

## 5. Component answers

### Person fallback

Use the existing circle tokens on canvas/surface: avatarCanvas/onAvatarCanvas; on all six covers: avatarOnCover/onAvatarOnCover, in both themes. Show the outlined person symbol when there is no readable initial, at 56% of 68, 36, 28 or 18 points. The production glyph is the native person symbol, not a downloaded illustration. A first visible grapheme that is a Unicode letter in any script or a decimal digit can supply an initial. Emoji, symbols, punctuation and unsupported glyphs use the person fallback. Never strip combining marks from their letter, and never use email. Decorative avatars are hidden from VoiceOver beside a name; the profile control can say No profile photo.

### Drop: shared state model, three presentations and a placeholder

Use thumbnailRow for private draft/pending/uploading/processing/failed; collectingCard for a committed caption cover; revealedItem after reveal; removedPlaceholder only for an open conversation’s retained place. One state model selects these shapes. Only server commit permits an Added receipt.

The private draft uses the dog fixture, Choose a friend later, the existing caption and Not shared with anyone. All four upload states use the same coffee fixture and intended occurrence; no new photograph is invented. Thumbnail 76 × 92, photo radius14, text gap12, row17/22 for first line and metadata13/18 for details. Center the text block if shorter than the photo; otherwise top-align the thumbnail with the first line and let the row grow. Pending on this iPhone · Not added yet makes no server-submission claim. Uploading · Not added yet has a genuine byte-progress bar and a percentage accessibility value. Processing · Not added yet has **no spinner or bar**; this confirms FQ91’s restrained default. Failed is Not added with Retry. No Added or Sent label appears on these uncommitted states.

Every queue specimen has a template in copy-contracts. Read visible words in order, with middle dots as sentence breaks and the exact full opening instant in the spoken version. Thumbnail images do not cause duplicate speech. Progress is a separate value, not a second reading of the whole row. A failed Retry preserves the target and idempotency key; a missed cutoff returns work to draft, never silently retargets.

Collecting cards keep width353 at this screen size, minimum151, inset18, radius16 and fold18. Status uses cardStatus13/18 with lock.fill12, gap8. Keep the sender below the prominent caption, avatar28 plus gap12, sender row17/22. On the author’s selected card only, put star.fill12, gap4, then Highlight on its own line after the caption. Both that star and the status lock scale with their own text. Other viewers get no Highlight flag. The fold is decorative, not an action or different opening animation.

Confirm the requested folded-card VoiceOver order: author, caption, own Highlight if applicable, exact opening, Hidden content. The own author reads {author}, you. Empty captions omit the caption clause, not a generated placeholder. Card-status/full-date parameters are distinct from localized fixture examples. Before reveal never derive colour, geometry or spoken clues from media.

The revealed specimen uses Maya’s book portrait and original chair photo. Sender avatar28 plus gap8; name row17/22. Place caption8 below the taller of sender name or avatar; photo12 below caption, or8 below sender when there is no caption. Photo353 × 304, radius14. Highlight chip is intrinsic width, no outline, photoLabel/onPhotoLabel in both themes, star.fill12 and gap4, padding6 vertical/8 horizontal. Lower-leading corner, inset12 from the photograph edges. The 6-point inset remains the established optical exception. The block grows with Dynamic Type; 26 is only its default height.

Use the 353:304 preview viewport for portrait/landscape photos with aspect-fill. A text screenshot uses aspect-fit inside that neutral viewport to avoid cropping its text. The full viewer preserves source framing. Never distort, filter or tint. The sheet does not introduce additional portrait/landscape/screenshot photos, because this brief restricts photographs to the book’s fixtures.

Future B6 controls are More options, heart React, Comment and bookmark Save to Favourites, each at least44. No Share item. The specimen shows a filled saved bookmark with native selected state; label still begins Save to Favourites, hint describes toggling. Before B6 omit these future controls from the B0 product; they are drawn here as the full component contract requested.

A revealed item is a **container of separate accessibility elements**, not one combined element: sender, More options, selectable caption, photograph, React, Comment and Save to Favourites. Hide the duplicate decorative avatar. Preserve native caption text selection and a Copy caption action for VoiceOver and Switch Control. The photo reads Photo. Highlight. when applicable; do not invent a scene description. The combined default phrase is retained only as documentation of the content order, not as an instruction to make selection impossible.

Removed: confirm This drop is no longer available. Render it without an appended full stop as the delivered visible label, no author/caption/time/reason, metadata/secondaryText, surface, radius12 and inset16. It hugs its own text; do not preserve the original photograph’s height. Only keep it where an already open conversation needs that place. Otherwise remove the list row. A notification/deep-link removed screen uses the same neutral wording and Back to club. Never disclose who removed it or why.

### Highlight cover and expanded list

Keep91 × 69, tile gap12, top inset8, avatar18, and4 between avatar and label. Debby’s pick may legitimately use two lines at default system-font metrics; Arimo may fit one. No shrink or ellipsis. Use a full-width vertical list starting at **extraLarge**, the first Dynamic Type category above default Large, including every accessibility size. This confirms the build’s conservative breakpoint; it uses more vertical space, but protects names and avoids a late clipping threshold.

Expanded row: width353, minimum96, left inset24, avatar28 aligned with the label’s first line, fold18 retained, vertical padding16 once content grows, gap12 between rows. Label uses highlightExpanded20/26 scaled through title3. Deborah-Anne’s pick wraps naturally; the row grows rather than losing the name.

Only the star’s own cover carries the extra star: star.fill12, fixed size. On the tile its origin is55 points from the left and11 from the top, level with the avatar and left of the18-point fold. On the row it sits at the trailing24 inset, aligned to the first line; reserve space so text cannot run beneath it. The visible label is Debby’s pick or Your pick for the star’s own view. Others retain their contributor names. This star distinguishes the day’s own pick; it is not a popularity or permission signal. It is decorative to the accessible label. The cover star stays12 while the card’s lock, card Highlight star and photograph-label star scale with their associated text.

### Compact receipt

Use only after server commit, immediately below the upcoming day’s header/context and above its collecting cards on return from the composer. For in-place repeated submissions preserve the current scroll anchor; do not jump a scrolled feed on a replay. No full-screen success ceremony.

Canvas fill, separator1 border, radius12, horizontal16 and vertical12 inset. Checkmark in a surface disc, secondaryText, default28 and grows with row text. Title row17/22; opening metadata13/18; Make my highlight textAction16/22 regular/action in a44 minimum target. When that target extends below the default text it can stand in for bottom padding; once wrapping fills it, restore a clear12 below. Show the action only when the drop is not already the highlight and the server still permits a change before cutoff.

Announce the keyed receipt template once after commit: Added for {person}’s {weekday}. Opens {fullDateTime}, {clubZoneName}. Make my highlight is a separate button. Do not repeat the announcement on every render or idempotent response. The sheet includes light/dark receipts with/without action at default and largest text sizes.

## 6. Verification and implementation boundary

Static checks cover frame dimensions/order, PNG decoding, source photographs, old-contract preservation, unchanged brand bytes, copy apostrophes/templates, control targets and targeted default/dark/AX5 layout review. qa/ contains a contact sheet and adaptive layout probes for states without requested exported variants. The reference type sizes approximate the existing xlReference; actual system-font metrics may differ.

This Linux-authored export is not a native accessibility audit. Before accepting the implementation, run the repository’s iOS snapshot route at393 points (and320/430 where required), then VoiceOver and Switch Control on device. Check: no duplicate busy submissions, no focus theft, long address wrapping, single-line field scrolling, two simultaneous code/resend errors, first-responder scroll with AX5, read-only input preserving keyboard, native tab selection and captions selectable after B6 controls arrive. Do not claim the pack ran those native tests.

Primary platform references used for the design decision: Apple Loading (https://developer.apple.com/design/human-interface-guidelines/loading), Branding (https://developer.apple.com/design/human-interface-guidelines/branding), Scroll views (https://developer.apple.com/design/human-interface-guidelines/scroll-views), Text fields (https://developer.apple.com/design/human-interface-guidelines/text-fields), and Get started with Dynamic Type, WWDC24 (https://developer.apple.com/videos/play/wwdc2024/10074/). Repository book/spec/invariants and the attached brief remain the product authority.
