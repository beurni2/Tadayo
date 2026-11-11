# signin: adopting handoff 7 for A02-email, A02-code and A02-age

> Appendix to `docs/plans/ios-b0-adopt-handoff-7.md`, written on 11 November 2026 for the ios thread's plan from `main` at `a569278` (the code its line numbers cite). **Where it and the plan disagree, the plan wins**: its section 3 lists the corrections. Its scratch scripts were throwaway and are not kept.

Part `signin` of the map for the slice that adopts handoff 7 on `main` (journal block 1.3, Next step 3; check section 8). Read-only: nothing in the repository was edited, committed or pushed. Code is as of `main` a569278 (branch `ios/b0-source-files`, same code). Lane ios.

## 0. How to read this

- `file:line` is the repository at a569278. "Check §n" is `docs/design/handoff-7/check/handoff-7-check.md`; finding ids are in `handoff-7-findings.md` beside it. "Delivery" is `design/reference/claude-design/handoff-7/`: "IMPL §n" is `IMPLEMENTATION.md`, `handoff7.<key>` is `component-contracts.json` or `copy-contracts.json`, "frame N" is the order in `frame-manifest.json`, and `frames/*.svg` are the sources of every measure.
- Frame measures use the delivery's own rule: line-box top = baseline - 0.82 x size (`handoff6.spacing.basis`). They are computed from the SVGs, in points at 393 x 852. Appendix 1 lists them.
- Where the sources disagree, the order is: the written contract over the frames (check §4 item 6); a founder Default over a frame (critic, X-24); `replaces` scopes limit what handoff 7 wins (`precedence.brand`: "H7 wins only for scopes listed under replaces"); a critic's ruling over a finding.
- The code never designs (T46) and never invents copy. Where the delivery draws no frame the report says "no frame": the plan must mark that state "built from spec" in `design/reference/INVENTORY.md`.
- Every number or word below traces to a cited source. Where the sources are silent the report says so (section F) and gives the smallest reversible reading, as a suggestion for the plan.

## A. Index of changes

| ID | Change | Findings | Main files |
|---|---|---|---|
| C1 | Busy primary button | D-13, X-15, W-06 (X-14 note) | `PrimaryButton.swift`, `Metrics.swift`, Lab specimen |
| C2 | Fields read-only (not disabled) while busy | X-15, W-06 | `SignInModel.swift`, `SignInFlow.swift` |
| C3 | A02-email: placeholder, signed-out notice, refusal line kept | X-16, W-10, W-08, R-01, R-06, W-15 | `SignInFlow.swift` (EmailScreen), `SignInModel.swift`, `RootModel.swift` |
| C4 | A02-code: separate resend failure, resending row, gaps, announcements, Verify pin | X-17, W-07, F-12, VM-04, V-03, F-09, W-02, R-08 | `SignInModel.swift`, `SignInFlow.swift` (CodeScreen) |
| C5 | Text actions leading, 44-point target kept | X-25, F-06 (critic), VM-03 | `TextAction.swift`, `SignInFlow.swift` |
| C6 | A02-age: Leave sign-in in the bar, own words, 16 above, 44 below | F-10, F-13, X-18, R-07, WM-02, W-06, W-08 | `ProfileScreens.swift` (AgeScreen), `SetupLayout.swift` |
| C7 | Leaving, the address and the signed-out cause (FQ93) | R-06, WM-01, BM-03, W-10, X-16 | `RootModel.swift`, `SignInModel.swift`, `TadayoApp.swift` |
| D | Strings: catalog keys, additions, mapping (D-25, W-14) | D-25, W-14, R-08, X-34 | both `Localizable.xcstrings` |
| E | Tests, snapshots, frames | all | `SignInSnapshotTests.swift`, `SignInModelTests.swift`, `RootModelTests.swift`, `SignInUITests.swift` |
| F | Ambiguities and conflicts | | |
| G | Dependencies on other parts; INVENTORY and QUESTIONS notes | X-33, X-34 | |

Components with no change in this part: `InlineError.swift` (icon 14 + 8 + text at x42 matches the sheet's "Icon 14" and frames 3, 5, 8, 9), `LabelledField.swift` (label-to-field 8 = `fieldLabelGap`, invalid border only for `.codeNotVerified`, focus ring kept while busy as frames 2, 4, 7 draw it), `SecondaryButton.swift` (no sign-in use; the delivery's `busyPrimary` scope excludes it), `PinnedFooterLayout.swift` (used only by `FoldedCard.swift:105`; the sign-in pins are `SetupFooter` in `safeAreaInset`).

## B. What binds this part

### B1. Check section 4 (the app follows the rules instead of the delivery)
- Item 3: failure lines name what failed (T43). Keep "Couldn’t send a code. Try again." for a refused address.
- Item 4: Back can't be used while a code is checked or a new code is requested. Frames 4 and 7 draw it active (screen-copy `Back enabled: true`); the app hides it as today.
- Item 6: delivery-written gaps win over the frames (12 from field to error line, which frames draw at 5, 8, 16 and 18). Verify code: the written rule pins it above the keyboard at every size, every frame at the usual size draws it in flow; the app keeps it in flow and pins it 12 above the keyboard only where the keyboard would hide it, as frame 19 does.
- Item 13: "at the largest text the app's line reads 'Sent to ben@' over 'example.com'" (frame 19 breaks 'Sent to' / 'ben@example' / '.com').

### B2. Critic's rulings that touch this part
- WM-01 and BM-03 (keep the typed address after a deliberate Leave): founder decision (FQ93); until then Leave returns to an empty A02-email.
- W-05, ink part (F-05, V-05, X-07): keep `secondaryText` for body lines. "Sent to {email}" is `secondaryText` in every frame, and the sign-in subtitle stays on the shared `SetupHeading`.
- V-02 and X-04: the meanwhile of F-09 and W-02 stands: pin Verify code at the largest text, or wherever the in-flow button would sit under the keyboard; not at every size.
- F-06, alignment part: the resend row and Change email follow the sheet's leading text-action specimen (centred rows are wrong).

### B3. Named spacing the delivery gives (`handoff7.spacing`, all line-box to line-box)
`formInset 20`, `fieldLabelGap 8`, `fieldErrorGap 12`, `errorToActionMinimum 16`, `resendToFailure 8`, `formFooterToKeyboard 12`, `formFooterToSafeAreaBottom 44`; scale 4, 8, 12, 16, 20, 24, 32 (`handoff6.spacing`).

### B4. Invariants this part must hold
T43 (errors name the action and keep input; every failure line below does), T44 (tokens: new sizes go into `Metrics.swift`, no loose numbers), T45 (native indicator, native toolbar button, native text field), T46 (no frame, built from spec), T47 (44-point targets, a VoiceOver name each, layouts grow), T48 (no custom motion: the pin must not animate), T11 and T52 (an address kept in memory is never persisted or logged), T41 ("Sent to %@" is the lint's one exception, keyed on `auth.code.sentTo`: do not rename that key).

## C. The changes

### C1. Busy primary button (D-13, X-15, W-06)

**What the code does now**
- `PrimaryButton.swift:76-88`: `HStack(spacing: Spacing.s)` of a hidden leading indicator (79), the label (81-84, `.frame(maxWidth: .infinity)`, centred) and a trailing indicator (86, `opacity(isBusy ? 1 : 0)`), only when `canBeBusy` (77, 85). Padding 16 / 12 (90-91), min height 50 (92).
- The indicator is `ProgressView().tint(ink)` (105-108) at the system size: 20 points at the default text size, about 56 at the largest, growing with the text and making the label wrap short of it (doc, 14-17).
- `isEnabled || isBusy` (42): busy keeps the action fill and onAction ink. No accessibility value anywhere in the file. `.tadayoPrimary(isBusy:)` (125-127) sets `canBeBusy`; plain `.tadayoPrimary` does not.
- The screens already disable the button natively while busy: `EmailScreen` 68-69 (`!canSend`, false while `isSending`, `SignInModel.swift:89`), `CodeScreen` 132-133 (`!canVerify`, `isVerifying`/`isResending`, `SignInModel.swift:94-96`), `AgeScreen` 30-31 (`.disabled(model.isSaving)`).
- Non-busy users, which must not change: `RootFailure.swift:56`, `TabLayout.swift:164`, `NoClubTabs.swift:99`, Lab `LabView.swift:347, 354`.

**What the delivery says**
- `handoff7.busyPrimary`: scope Send a code, Verify code, I’m 18 or older, Continue; `minimumHeight 50`; fill `action`, ink `onAction`; "native indeterminate activity indicator", `indicatorSize 16`, `indicatorGap 8`; `layout`: "Keep label centered at its idle position; reserve symmetric leading/trailing 24-point accessory slots. Spinner sits 8 before measured label. At large text if that group cannot fit, spinner moves to centered own row; button grows by the same reserved row in idle and busy."; `nativeButtonEnabled false`; `repeatSubmission false`; `valueKey handoff7.vo.busy.value`; `leaveChangeResend`: "Inactive while primary request or routing account read runs; do not queue another action."
- IMPL §2 lines 22 and 24: label and height unchanged, accessible label stays "Send a code", value "In progress"; "Busy is a request state, not the disabled/invalid colour state."
- Copy: `vo.busy.value` "In progress"; `vo.email.busy` "Sending a code."; `vo.code.busy` "Verifying code."; `vo.age.busy` "Saving your age confirmation."; `announcementPolicy.busy`: "Announce the action once, keep focus; button label stable, value vo.busy.value. Do not repeat on renders."
- Sheet specimen "Primary action · busy" (`component-sample-index.json` #0 light x64 y9924, #1 dark x644, 393 x 76, `xl: false`); its indicator centre is (133.38, 37) and its label starts at x149.38, centred at 196.5.
- Frame 2 (A02-email-sending): button [20,343,353,50], fill #284CDB, label #FFFFFF 16 pt from x149.38 (frame 1's idle label sits at the same x, so the label does not move), spinner spokes #FFFFFF, 2-pt round caps, centred (133.38, 368): right edge 8 before the label, outer diameter about 16. Frame 4 (A02-code-verifying): label from x153.37, spinner centre about (137.4, 374), button [20,349,353,50].
- Datum at the largest text: frame 19's idle Verify code is [20,464,353,85] with a single line; its label runs from x61.72 to about 331.3 (about 269.6 wide, centred on 196.5), against 273 available between two 24-point slots (353 - 2 x 16 padding = 321, minus 48). So the group fits and no extra row appears, which is consistent with "fits when label width + 2 x 24 <= 321". A wrapped or longer label (such as "I’m 18 or older") would not fit.
- No frame draws I’m 18 or older or Continue busy, or any busy button at the largest text (X-14: given in writing only). Built from spec.

**The exact change**
1. `Metrics.swift` (T44): name the sizes, for example `Size.busyIndicator = 16` and `Size.busySlot = 24`; the 8 gap is `Spacing.s`.
2. `PrimaryButton.swift`: draw the indicator at exactly 16 whatever the text size (it is 20 by default and scales today). `ProgressView` is a `UIActivityIndicatorView`, so pin it in a 16 x 16 frame and scale it so the glyph is 16; do not replace it with a drawn spinner (T45, and `Spinners.check` needs a `UIActivityIndicatorView` in a busy state, `ScreenSnapshots.swift:145-154`). Tint `ink` (white on action in frames 2 and 4).
3. Layout: label centred at its idle position between two 24-point slots (label limit 273 on a 353-wide button); when busy the indicator sits with its right edge 8 before the measured label. One way: `ViewThatFits(in: .horizontal)` of an inline layout (label at its ideal single-line width, slots 24 each side, indicator as an overlay at the label's leading edge minus 24) and a stacked layout. The same choice is made idle and busy, so nothing moves.
4. Stacked layout (the group can't fit): the indicator on its own centred row above the label, a row the button reserves idle and busy (button grows by it in both). The row's height and whether it sits above or below the label are not given: reading 16 high plus the 8 gap, above (section F9).
5. Accessibility: the indicator is `accessibilityHidden` in both states (SwiftUI's own indicator says "In progress", which would repeat the value); while busy the button's value is "In progress" and the label is unchanged; idle has no value. The words go in the TadayoDesign package catalog (`DesignCatalogTests` requires component-owned words there, read with `String(localized:bundle: .module)`, and every package key must be looked up that way). Suggested key `busy.value.vo`, comment "handoff 7 vo.busy.value".
6. Keep: the style draws busy with the action fill (`isEnabled || isBusy`, line 42); the screens keep disabling the button natively while busy, so VoiceOver reads it dimmed with the value.
7. Lab: the "Busy" specimen (`LabView.swift:361-367`) takes the change; the `Lab-actions` references (light, dark, large, xl) change.

**Tests and snapshots**
- New hosted check in `SignInSnapshotTests` (uses `AccessibilityElements.of`, which reads label, hint, traits, value): busy Send a code has label "Send a code", value "In progress", `.notEnabled`; idle has value ""; no element is labelled "In progress" other than the button's value. Same for Verify code and I’m 18 or older.
- Snapshots: `A02-email-sending` (frame 2), `A02-code-verifying` (frame 4), `A02-age-saving` (no frame), each light, dark, -xl; and every idle `-xl` of the four screens (the reserved row appears only where a label does not fit, so check each).
- `Spinners.check` stays satisfied only if a native indicator is in the tree when busy.
- Not verifiable on Linux: `TadayoDesign` and the app compile only on CI; the 16-point glyph and the stacked row are read from CI's snapshots.

### C2. Fields read-only (not disabled) while busy (X-15, W-06)

**Now:** `EmailScreen` 49 (`TextField(String(), text: $model.email)`) and `CodeScreen` 115-124 are editable while a request runs. `SignInModel.email` is a plain stored var (38); `code` has a setter (75-86) that clears code failures when the digits change.

**Delivery:** `busyPrimary.field`: "read-only, keep first responder and keyboard if already shown; restore editing after failure"; IMPL §2: line 24 ("Keep the focused field and keyboard in place while the input becomes read-only. Do not disable the whole form in a way that unexpectedly resigns first responder."), line 36 (verify), line 46 (resend: "Input edits, Verify code and Change email address are inactive until the request completes, even if the old challenge has six digits"), `authForm.resendConcurrency`. Frames 2, 4, 7 keep the focus ring (rect #284CDB, 2 pt, 2 pt outside) and the plain #778579 border.

**The change:** SwiftUI's `TextField` has no read-only mode on this deployment target (iOS 17.0), and `.disabled` resigns the first responder, which line 24 forbids. Suggested: a model-level guard (testable on Linux): `SignInModel.email` ignores writes while `isSending`; `code` ignores writes while `isVerifying || isResending`; editing returns after a failure. In the view keep `@FocusState` as is. A rejected write can leave the typed character on screen until SwiftUI next redraws the field; the plan must test that on the iPhone (section F10) and pick a refresh (for example a state read in the body so the field re-applies the model's value).

**Tests:** `SignInModelTests` (Linux): `theAddressCantBeEditedWhileACodeIsOnItsWay`, `theCodeCantBeEditedWhileItIsCheckedOrANewCodeIsOnItsWay`, and that edits work again after each failure. Hosted: while busy the field's element has no `.notEnabled` trait (read-only is not disabled). XCUITest cannot reach this: `UITestLaunch.swift` modes (`-TadayoUITestNoSession`, `-TadayoUITestFakes`) answer at once, so a hanging fake or a device check is needed.

### C3. A02-email (X-16, W-10, W-08, R-01, R-06, W-15)

**What the code does now** (`SignInFlow.swift`): field without a prompt (49); failure line 12 under the field (59-62), only for `.sendNetwork`/`.sendRefused` (84-91); button 24 below (70); helper 20 below (74); focus on appear (78); announces the failure (79); no notice; no busy value. `SignInModel.sendCode` (99-114) maps `.network` to `.sendNetwork`, every other failure to `.sendRefused`. `SupabaseAuth.swift:122-127` throws `.refused` for any non-2xx and never reads the server's words, so the app cannot tell an address-format rejection from any other refusal.

**What the delivery says**
- Placeholder "Email address" (`auth.email.placeholder`, replaces `handoff1 A02-email[4]`, so the same words as the label), frame 1: placeholder at x34, #607067 (secondaryText).
- Signed-out notice: `auth.email.signedOut` "Your sign-in ended. Enter your email to sign in again."; IMPL §4 line 82: "a neutral body notice above the field, not as an invalid-email error. Retain the address if still available in the current flow; never reconstruct it from an account record". No frame, no ink, no gaps, no announcement given (W-10).
- Invalid address: `auth.email.invalid` "Enter a valid email address." with the invalid border (IMPL §2 line 30; `authForm.validation`). Refusal: `auth.email.refused` "Couldn’t send a code. Try again." Network: `auth.email.network`.
- Failures never invalidate the field for network or refusal (IMPL line 28; frame 3 draws no red border).

**The exact change**
1. Placeholder: `TextField(text:prompt:)` with `Text("auth.email.label")` as a `secondaryText` prompt, as `CodeScreen` does at 115-120. Reuse `auth.email.label` (same words; D-25 and W-14 say keep the built key and note the mapping). The label above the field is hidden from VoiceOver and the field carries the label (`LabelledField.swift:42, 63`), so an identical placeholder can be spoken twice: W-08 says to prevent that. A hosted check must read the empty field's `value` and fix it if it equals the label (section F8).
2. Notice: shown only after a server-ended sign-in (C7), between the subtitle and the field, `body` role, no icon and no border, spoken once (`announcing(_, initial: true)` exists for words a view first shows with, `SetupLayout.swift:82-89`). Ink, gaps and lifetime are not given: nearest existing choices are `secondaryText` like the subtitle and `SetupHeading`'s gap above, cleared once a code is sent; mark "built from spec" (F5).
3. Refusal: keep `auth.firstSend.refused` for every refusal; do not add an invalid-address failure or use `auth.email.invalid` (R-01 and check §8: it does not name the action; and the app cannot detect the case). X-16's text asking for an invalid-address failure is superseded by R-01 and check §8.
4. Busy: C1 and C2; `vo.email.busy` once when `isSending` turns true.
5. Keep: 12 under the field (`fieldErrorGap`; frames draw 5), 24 to the button (frame draws 18; `errorToActionMinimum` 16 is a minimum, V-03), the helper stays (IMPL line 30), autofocus unconditional (`authForm.emailArrivalFocus true`), no back arrow.

**Tests:** existing `testA02Email` (frame 23), `testA02EmailEmpty` (frame 1), `testA02EmailSending` (frame 2), `testA02EmailFailedNetwork` (frame 3), `testA02EmailRefused` (no frame; words `auth.email.refused`). New: `testA02EmailSignedOut` (no frame; INVENTORY row `A02-email-signed-out`, built from spec). New hosted checks: the notice is plain text with no hint and no invalid border; the placeholder is not read twice. `testA02EmailShowsOnlyItsOwnFailures` stays.

### C4. A02-code (X-17, W-07, F-12, VM-04, V-03, F-09, W-02, R-08)

**What the code does now**
- Model: one `failure` for everything, including `.resendNetwork`/`.resendRefused` (`SignInModel.swift:14-30`); `resend()` clears it at the start (139) and sets it on failure (144, 146); `verify()` clears it at the start (120); `changeEmail()` (159) and `sendCode()` (102) clear it; the `code` setter clears `[.codeNotVerified, .verifyNetwork, .verifyUnavailable]` on edit (82). `verify()` already stays busy through `verified(session)`, which reads the account (123-124); `canVerify` already needs `!isResending` (95); `canChangeEmail` is `!isVerifying && !isResending` (153).
- View (`SignInFlow.swift`): `errorRegion` (170-183): a hidden two-line placeholder (172) plus the failure, top 12 (181), bottom 12 (182), so the region is 12 + 36 + 12 = 60; Verify code (127-133); `resendRow` 8... no: `.padding(.top, Spacing.m)` 12 (135); Change email address with `.padding(.top, Spacing.xs)` 4 (139). `resendRow` (188-201) is a 44-point row: while sending, `waiting("auth.code.resending")` in `metadata` 13, `secondaryText`, centred, with no indicator (190-191, 203-208); `Button("auth.code.resend")` with `.tadayoText` (192-195, `.disabled(model.isVerifying)`); else the wait sentence (196-198). Back hidden while busy (143). Focus returns to the field when `resendDue` becomes non-nil (147-149). Announcements: `model.failure?.words` (150) and the availability words `auth.code.resend` "Send a new code" politely (151-152). The field's `isInvalid` is only `.codeNotVerified` (112).

**What the delivery says**
- Separate resend failure: `authForm.resendFailure` ("Dedicated block below resend action, not the code validation block. Keep an existing wrong-code message in its original block too. Grow/scroll rather than overwrite."); IMPL line 50 ("Announce the resend failure only, not another availability announcement in the same transition"); `spacing.resendToFailure 8`.
- Resending row: IMPL line 46: "Sending a new code… in textAction, with a small native activity indicator, secondaryText" (frame 7: spinner #607067 centred (28,429), 16 across, text at x44, 16 pt #607067, baseline 432.12, row [20,407,353,44]). Verify, Change email address and edits inactive (`authForm.resendConcurrency`).
- Waiting row: leading at x20 (frames 4, 5, 24), `metadata` 13, `secondaryText`; "No countdown and no disabled resend link" (`authForm.resendStaticWait`).
- Order for VoiceOver: `authForm.codeAccessibilityOrder`: title, destination, field, fieldError, verify, resend, resendFailure, changeEmail.
- Success: `authForm.resendSuccess` (only success clears old code, updates challenge, starts a new 60-second interval and returns first responder to the code field; a failed resend keeps the old challenge and digits and does not restart the interval); announce `vo.resend.success` "Check {email} for a new code. You can send a new code after one minute." once (IMPL line 48); availability `vo.resend.available` "Send a new code is available." once (line 44); busy `vo.resend.busy` "Sending a new code…" once (line 46); `vo.code.busy` "Verifying code."
- Gaps drawn (frames, line-box): field to error 8 (contract 12); error block 2 lines = 36; error to Verify 16; Verify [20,349,353,50] to resend row 8; resend row 44 then Change email address directly (0); in frame 8 the failure block starts 8 under the resend row (459) and Change email address starts 8 after it (503). Appendix 1.
- Verify code at the usual size sits in the flow in frames 4 to 8, 18, 24, 25, 162 above the keyboard; at the largest text frame 19 pins it [20,464,353,85] 12 above the keyboard (561), with Send a new code [20,574,353,144] and Change email address [20,734,353,144] in the scroll below the error. `authForm.keyboardFooter`: "Continue and Verify code pinned above keyboard with 12-point clear gap. Form body is one vertical scroll view; controls are never overlaid on form text."

**The exact change**
1. `SignInModel`: add `resendFailure` (suggest `public private(set) var resendFailure: Failure?`, using the two existing cases, or a two-case enum). `resend()` sets it on failure and no longer clears the code failure at the start; it clears `resendFailure` when it starts. On success `codeWasSent` clears the code failure (the digits are cleared, so a line about the old code would be untrue) and `resendFailure`. `changeEmail()` and `sendCode()` clear both. The sources do not give the lifetimes (F4). Keep `isResending`, `canResend`, `canVerify`, `canChangeEmail` as they are.
2. `errorRegion`: top stays 12 (181); bottom 12 to 16 (182) so there are 16 between the error and Verify code (V-03, `errorToActionMinimum`). The region becomes 12 + 36 + 16 = 64, 4 more than the frames draw (60): the written values win (check §4 item 6); record the 4 in INVENTORY (F2).
3. `resendRow`: top padding 12 to 8 (line 135, `resendToFailure`-sized `Spacing.s`); Change email address `.padding(.top, Spacing.xs)` removed (line 139), so it sits directly under the 44-point row.
4. Resending row: `HStack(spacing: Spacing.s)` of the 16-point native indicator (C1's sizing) in `secondaryText` and `Text("auth.code.resending")` in `textAction` 16/22, `secondaryText`, leading, in the 44-point row, the same at every text size (VM-04). Replaces `waiting("auth.code.resending")` (191).
5. Waiting row: leading (remove `.multilineTextAlignment(.center)`, line 207, and the centring of the row) in `metadata` 13/18 `secondaryText`, vertically centred in the 44-point row.
6. Resend failure block: `InlineError(Text(verbatim: resendFailure.words))` directly after `resendRow`, 8 below it, then Change email address 8 below the block (frame 8); no block when nil, so the row-to-Change gap is 0 then. The field is not marked by a resend failure; `LabelledField`'s hint stays the code failure's.
7. Announcements: availability words become `vo.resend.available` (replaces 151-152's "Send a new code"); `isVerifying` and `isResending` each announce once when they turn true; a resend success announces `vo.resend.success` with the address, once, in the existing `onChange(of: model.resendDue)` (147-149), which already returns focus (R-08: keep the focus return; the check §8 and the second reviewer of R-08 say so); `resendFailure` announces its own words at once (as failures do today), and because `canResend` does not change on a failed resend there is no second availability announcement (the current `canResend`-keyed words behave that way). `Announcement.post` is not observable in hosted tests: put the choice in a pure function and test it (precedent `TabsView.announcement`, `TadayoTests/TabsAnnouncementTests.swift`, which runs on the iOS 17.5 and 18.6 jobs).
8. Verify pin (F1): while the keyboard would hide the in-flow button, Verify code is pinned 12 above the keyboard; otherwise in flow. Resend row, failure block and Change email stay in the scroll. The pin must not animate (T48).
9. Keep: back hidden while `!canChangeEmail` (143); `SetupGap.field` between "Sent to" and the field label (F-06, X-06: frames draw about 6 to 7, the app keeps 44); the address wrap `breakable` (163-166: C-02); the reserved two-line region (170-183); `secondaryText` for "Sent to {email}"; the field marked only for `.codeNotVerified`; unconditional autofocus (144).

**Tests and snapshots**
- `SignInModelTests` (Linux): update `theAddressCantChangeWhileANewCodeIsOnItsWay` (line 239: `failure == .resendNetwork` becomes `resendFailure`), `aRefusedNewCodeKeepsTheDigitsAndTheRow` (295-311: assert `resendFailure`), `aNewCodeClearsTheDigitsAndWaitsAgain` (276-293: `failure == nil` at 287 still holds, add `resendFailure == nil`). Add: `aFailedNewCodeLeavesAWrongCodeLineAlone`, `aNewCodeThatWentClearsTheOldCodesLine`, `aNewAttemptClearsTheLastResendFailure`, `changingTheAddressClearsBothLines`.
- Snapshots: `A02-code` (arrival, handoff 1's frame stays for it, V-17), a new typed-code state for frame 24, `A02-code-verifying` (4), `A02-code-verify-failed-network` (5), `A02-code-error` (25; `-dark` 18; `-xl` 19), `A02-code-resend` (6), `A02-code-resending` (7), `A02-code-resend-failed-network` (8), plus new `a code error with a resend failure` (no frame, X-33). `snap` must pass `busy:` for `isResending` too (`SignInSnapshotTests.swift:292` has `isSending || isVerifying`) so `Spinners.check` demands the new row's indicator.
- Hosted order check: `AccessibilityElements.of(SignInFlow(...))` lists title, "Sent to ben@example.com", "Six-digit code", the error, "Verify code", the resend element, the resend failure, "Change email address". `testTheAddressIsReadAsItIs` and `testACodeNotVerifiedIsTheFieldsHint` stay.

### C5. Text actions (X-25, F-06 critic, VM-03)

**Now:** `TextAction.swift:22` `.multilineTextAlignment(.center)`, 28 `.frame(maxWidth: .infinity, minHeight: Size.touchTarget)` (centred). Users: Send a new code (`SignInFlow.swift:193-194`), Change email address (136-137), A03's Add photo (`ProfileScreens.swift:84-86`, other part), `NoClubTabs.swift:83` (Go to Home, other part), A02-age's footer Leave (32-33, removed by C6), Lab 381 and 385. Unavailable is `secondaryText` (23-27).

**Delivery:** every handoff 7 frame draws text actions leading at x20 (frames 4 to 8, 18, 24, 25: Send a new code and Change email address at x20); the sheet's "Secondary action, Private drafts and text action" specimen (`component-sample-index.json` #10, y11074) draws "Send a new code" from x20; `precedence.existingSheet`: "appended H7 specimens are current only for their named scope". Targets stay 44.

**Change:** `TextActionFace`: `.multilineTextAlignment(.leading)` and `.frame(maxWidth: .infinity, minHeight: Size.touchTarget, alignment: .leading)`, keeping the full-width 44-point target. The resend row's waiting and resending lines are not text actions: make them leading in `CodeScreen` (C4). Rows: frames put the label's centre at the row's vertical centre (row [20,407,...,44], label line 418-440).

**Cross-impact:** the Lab specimens (`LabView.swift:381, 385`; `Lab-actions*` references), the tabs part (Go to Home), the profile part (Add photo; Optional is plain text, its leading alignment under the centred avatar is that part's, X-25 and VM-03 over F-07). Re-check every screen that uses `.tadayoText`.

### C6. A02-age (F-10, F-13, X-18, R-07, WM-02, W-06, W-08)

**What the code does now** (`ProfileScreens.swift`): toolbar chevron `chevron.backward` labelled "Leave sign-in" (38-48), colour via `SystemBackColour` (45, defined 55-66, used only here); footer `Button("auth.age.leave")` under the primary (32-33); both enabled while saving; failure `ProfileModel.Failure.words` (the profile's lines, 126-135) 8 above the button (`SetupFooter` `VStack(spacing: Spacing.s)`, `SetupLayout.swift:67`; failure at 22-24); `SetupFooter(bottom: Spacing.s)` (21): the button ends 8 above the safe area; subtitle gap `Spacing.xxl` (18); `.announcing(model.failure?.words)` (49); busy `.tadayoPrimary(isBusy: model.isSaving)` with `.disabled(model.isSaving)` (30-31).

**What the delivery says**
- `ageExit`: "Native leading Leave sign-in text action, no back chevron. Same on A03."; `confirmationAlert false`; "Exit unavailable during save/verification/resend; after a failure available again."; returns "A02-email in B0, address retained in memory" (see C7). IMPL §2 lines 54 to 58: failure above the pinned button "with at least 16 clear points", "Leave sign-in is inactive" while a save runs, "If leaving fails, show the root phone-removal failure", "An incomplete account may finish setup or leave only. Do not infer an under-18 status from leaving."
- Frames 9 and 26: "Leave sign-in" 16 pt #284CDB from x20, baseline 81.12, control [20,55,116,44]; button [20,724,353,50] (bottom 774 = 818 - 44, `formFooterToSafeAreaBottom`); failure lines at line-box tops 668 and 686 (frame 9), ending 704, so 20 above the button; title line top 127, body line top 223 (gap about 60: unexplained, F-22 and BM-04, kept as built).
- Copy: `auth.age.network` "Couldn’t save your age confirmation. Check your connection and try again."; `auth.age.refused` "Couldn’t save your age confirmation. Try again."; `vo.age.busy` "Saving your age confirmation."
- No frame: A02-age-saving, A02-age-refused.

**The exact change**
1. Toolbar: replace the chevron item with one `ToolbarItem(placement: .topBarLeading)` holding `Button("auth.age.leave") { Task { await leave() } }`, `.disabled(model.isSaving)`, no alert. Delete `SystemBackColour` (dead afterwards) and fix the doc comment (5-8). Ink: the frames draw action ink; the `NavigationStack` already has `.tint(Palette.action)` (51). On iOS 26 the bar draws toolbar items on glass and `SystemBackColour` records the lane found the system uses the label colour there: check the CI snapshot and do not invent a token (F13).
2. Delete the footer Leave button (32-33).
3. Failure: own words via a second property beside `ProfileModel.Failure.words` (the enum is shared with A03, so A03 keeps `auth.profile.*`): `.network` gives `auth.age.network`, `.other` gives `auth.age.refused`. No model change.
4. Footer: 16 between the failure line and the button (`errorToActionMinimum`, a minimum; the frame draws 20), and `SetupFooter(bottom: 44)` (`formFooterToSafeAreaBottom`). `SetupGap.profileFooter` is already 44 (`SetupLayout.swift:35`) but named for A03: name the constant once for both (shared with the profile part). `SetupFooter` also pads 8 above its content (71).
5. Busy: C1; announce `vo.age.busy` once when `isSaving` turns true; keep `.announcing(failure words)`.
6. Keep `subtitleGap: Spacing.xxl` (F-22, BM-04), the title and subtitle in `SetupHeading` (secondaryText).

**Tests and snapshots**
- Update `testTheAgeScreensBackIsLeaveSignIn` (`SignInSnapshotTests.swift:218-222`, expects 2): rename, expect one "Leave sign-in"; add a hosted check that its element has `.notEnabled` while `isSaving`.
- Snapshots: `A02-age` (frame 26), `A02-age-failed-network` (frame 9), `A02-age-saving` (no frame), `A02-age-refused` (no frame), each light, dark, -xl.
- UI tests: `SignInUITests.swift:85-86` (`leaveButtons(in: app).count == 2` becomes 1) and `testLeavingSignInFromTheAgeScreenStartsAgain` (141-159: the chevron-then-lowest-button second half goes; keep the empty-field assertions).
- No model test (the model is unchanged), unless C7 changes `ProfileModel`.

### C7. Leaving, the address and the signed-out notice (R-06, WM-01, BM-03, W-10, X-16)

**What the code does now** (`RootModel.swift`): `leave()` (121-127) takes no cause; `endSession()` (129-143) sets `signIn = nil` (131), signs out, then `showSignIn()` (176-188) builds an empty `SignInModel`. Callers: `TadayoApp.swift:45` (A02-age's Leave) and `:58` (the Lab's Log out), both by hand; `loadClubs` signedOut (169-170), `readAccount` signedOut (212-213) and the `ProfileModel.signedOut` closure (236-239), all server-ended; and `retry()` of `.leaveFailed` (106). `retry()` already carries the typed address for `.signInNotKept` (108-113: `signIn?.email`, set after `start()`). `show()` keeps `signIn` while the account is incomplete and clears it when complete (244). Existing test: `leavingSignInEndsTheSessionAndStartsAgain` asserts `signIn?.email == ""` (`RootModelTests.swift:232`); UI test `testTheLabsLogOutReturnsToSignIn` asserts the field is not "ben@example.com" (`SignInUITests.swift:138`).

**What the delivery and the rulings say**
- Delivery: leaving "returns to A02-email in B0, with the address retained in memory" (IMPL line 56; `ageExit.return`); after a server-ended sign-in "show Your sign-in ended… Retain the address if still available in the current flow" (IMPL line 82).
- Rulings: a deliberate Leave keeps the empty field until the founder answers FQ93 (critic's WM-01/BM-03 ruling; R-06; check §5 item A, §8 "Kept as built"). The address is kept only where the founder's Default already keeps it (Retry after "Couldn’t keep you signed in.") and, if still in memory, after a server-ended sign-in. Never from the account record.
- FQ93 is not in `docs/QUESTIONS.md` yet: line 431 says it "comes with the slice that adopts handoff 7 for the screens on `main`". Entry to add (check §5 A): "Does Leave sign-in keep the address you typed?"; Default: an empty field after Leave sign-in; the address is kept after "Couldn’t keep you signed in." and after the server ends a sign-in, if the app still has it. Needed by B0.

**The exact change**
1. `RootModel`: carry the cause into `endSession()` (for example `leave(serverEnded: Bool = false)`, or a small enum) and keep it with `.leaveFailed` so a Retry of a failed removal keeps it; the three server-ended callers pass it, the two by-hand callers do not. A second `leave()` while one runs waits for the first (122), so the first cause stands.
2. Before `signIn = nil` (131) capture `signIn?.email`; after `showSignIn()` set it on the new model only for a server-ended leave. In the by-hand case the field is empty, as built.
3. `SignInModel`/`EmailScreen`: a flag that the sign-in ended (set at creation for a server-ended leave), shown as the notice of C3 while on the email step; nothing persisted, nothing logged (T11, T52).
4. If a server-ended sign-in is found when `signIn` is already gone (Home, or a cold launch), the field is empty and the notice shows.

**Tests:** `RootModelTests`: extend `leavingSignInEndsTheSessionAndStartsAgain` (no notice, empty field) and `aSessionTheServerEndedIsPurgedToo` (254-262: notice, empty field at cold launch); add `aSignInTheServerEndedKeepsTheAddressIfItIsInMemory` (the profile closure while `signIn` lives), `aLeaveRetriedAfterAFailedRemovalKeepsItsCause`, and check `aSignedOutAnswerAfterLeavingSignsOutOnce` (339-356) keeps the by-hand cause. `aSessionTheDeviceCantKeepSaysSoAndSignsInAgain` (104-122) stays. Conflict hotspot with the root part, which splits `.starting` (R-09): `RootModel.swift` 117-143 and 176-188, `RootModelTests.swift` 221-262 and 339-356.

## D. Strings

### D1. Built keys for these screens (`apps/ios/Tadayo/Localizable.xcstrings`, 72 keys in all) and the delivery key each matches word for word (checked by script, 37 pairs)
| Built key | Delivery key |
|---|---|
| `auth.signIn.navTitle` | `auth.nav` |
| `auth.email.title`, `.label`, `.helper` | same names (`auth.email.placeholder` has the label's words) |
| `auth.email.subtitle` | `auth.email.body` |
| `auth.email.send` | `auth.email.primary` |
| `auth.error.sendNetwork` | `auth.email.network` (and `vo.failure.auth.email.network`) |
| `auth.firstSend.refused` | `auth.email.refused` |
| `auth.code.title`, `.label`, `.placeholder`, `.resend`, `.resending` | same names |
| `auth.code.sentTo` ("Sent to %@") | `auth.code.destination`; do not rename: the copy lint exception is keyed on this key and text (`packages/domain/src/copy/exceptions.ts`) |
| `auth.code.verify` | `auth.code.primary` |
| `auth.code.resendWait` | `auth.code.wait`, `vo.resend.wait` |
| `auth.changeEmail` | `auth.code.changeEmail` |
| `auth.error.verifyNetwork` | `auth.code.network` |
| `auth.error.verifyUnavailable` | `auth.code.unavailable` (same words as FQ86's answered default: note it in FQ86 and the key's comment) |
| `auth.code.notVerified` | `auth.code.invalid` |
| `auth.error.resendNetwork` | `auth.code.resendNetwork` |
| `auth.resend.refused` | `auth.code.resendRefused` |
| `auth.age.title`, `.body`, `.leave` | same names |
| `auth.age.confirm` | `auth.age.primary` |
| `auth.profile.*` | the profile part's (A03) |

### D2. Keys the delivery adds that this part needs (the lane's key names are suggestions)
| Delivery key | Words | Suggested built key |
|---|---|---|
| `auth.email.signedOut` | Your sign-in ended. Enter your email to sign in again. | `auth.email.signedOut` |
| `auth.age.network` | Couldn’t save your age confirmation. Check your connection and try again. | `auth.age.network` |
| `auth.age.refused` | Couldn’t save your age confirmation. Try again. | `auth.age.refused` |
| `vo.email.busy` | Sending a code. | `auth.email.busy.vo` |
| `vo.code.busy` | Verifying code. | `auth.code.busy.vo` |
| `vo.age.busy` | Saving your age confirmation. | `auth.age.busy.vo` |
| `vo.resend.available` | Send a new code is available. | `auth.code.resendAvailable.vo` |
| `vo.resend.success` | Check %@ for a new code. You can send a new code after one minute. | `auth.code.resent.vo` |
| `vo.busy.value` | In progress | in the package catalog (`packages/swift/TadayoDesign/Sources/TadayoDesign/Localizable.xcstrings`, 24 keys today), for example `busy.value.vo` |

Reused, no new key: `vo.resend.busy` ("Sending a new code…") is `auth.code.resending`; `auth.email.placeholder` is `auth.email.label`; the `vo.failure.auth.*` keys repeat the visible lines, and the app speaks `SignInModel.Failure.words`.

Not adopted: `auth.email.invalid` and `vo.failure.auth.email.invalid` (R-01, and the app cannot detect the case), `auth.profile.nameRefused` (profile part). Do not add unused keys.

### D3. Rules the strings must pass
- `DesignCatalogTests` (`apps/ios/TadayoTests/DesignCatalogTests.swift`): the package's words live only in the package catalog, are read with `String(localized:bundle: .module)`, and no literal is passed to `Text`, `Button`, `ProgressView`, `.accessibilityValue` and the like in the package's sources; every package key must be looked up.
- Copy lint (`packages/domain/src/copy/rules.ts`): bans `sent` (whole word), gendered pronouns, `!`. None of the new words does ("send" is fine).
- Update the comments of keys that say "until handoff 7": `auth.error.verifyUnavailable`, `auth.profile.saveFailed` ("A02-age's line until handoff 7"), `auth.code.resending` (cite handoff 7).

## E. Tests, snapshots and the frame each is compared with

The `ios` workflow records no new images (record mode never); changed or new images come from the evidence branch and are committed as references. Contact sheets pair each snapshot `<state>[-dark|-xl]` with `design/reference/screens/<state>.png` (`tools/ci/ios_steps.py`). The harness draws no keyboard and no status bar (T45), iOS 26's bar, the frames' 34-point bottom inset, and `-xl` as a 393 x 2200 phone at AX5 with the whole screen laid out down the image (`ScreenSnapshots.swift:8-22`).

`SignInSnapshotTests` has 25 snapshot tests, 75 references; 19 tests (57 references) are this part's (email 5, code 10, age 4); A03's 6 belong to the profile part.

| Snapshot (test) | Frame | What changes |
|---|---|---|
| `A02-email` (`testA02Email`) | 23 (redraw) | idle button slot; text unchanged; frame draws "We’ll send…" in primaryText, the app keeps secondaryText |
| `A02-email-empty` | 1 | placeholder; frame also has the keyboard |
| `A02-email-sending` | 2 | leading 16-point indicator, field read-only |
| `A02-email-failed-network` | 3 | none; gaps 12 and 24 against the frame's 5 and 18 |
| `A02-email-refused` | none | none |
| new `A02-email-signed-out` | none | the notice (built from spec) |
| `A02-code` | handoff 1 `A02-code` (arrival, kept, V-17) | region 64 not 60, resend row 8 / 0, leading rows |
| new typed-code state (name to choose) | 24 | the same with `529614` typed, Verify available |
| `A02-code-verifying` | 4 | busy Verify, Change email unavailable, back hidden (frame draws it active) |
| `A02-code-verify-failed-network` | 5 | as above |
| `A02-code-verify-unavailable`, `A02-code-error-waiting`, `A02-code-resend-refused` | none | layout changes only |
| `A02-code-error` (`-dark`, `-xl`) | 25 (18 dark, 19 xl) | region 16 below; the `-xl` snapshot lays the pinned Verify at the foot of a tall phone and breaks the address 'Sent to ben@' / 'example.com' where frame 19 breaks 'ben@example' / '.com' (C-02) |
| `A02-code-resend` | 6 | Send a new code leading, 8 below Verify |
| `A02-code-resending` | 7 | indicator plus textAction row; `snap` must flag busy |
| `A02-code-resend-failed-network` | 8 | own block under the row |
| new code error plus resend failure | none | both blocks (X-33, built from spec) |
| `A02-age` | 26 (redraw) | Leave in the bar, no chevron or footer link, button 44 above the bottom |
| `A02-age-failed-network` | 9 | age words, 16 above the button (frame 20) |
| `A02-age-saving`, `A02-age-refused` | none | busy; age words |

Other tests this part changes: `SignInModelTests.swift` (line 239, 276-293, 295-311, plus new), `RootModelTests.swift` (221-262, 339-356, plus new), `SignInUITests.swift` (85-86, 141-159), the Lab `Lab-actions*` references (`LabSnapshotTests.swift:156`), a new pure-function announcement test in `TadayoTests` (`SignInAnnouncementTests`), hosted VoiceOver checks listed in C1 to C6.

Verification limits: nothing under `apps/ios` or `TadayoDesign` builds on Linux; `SignInModel` and `RootModel` tests run there with `swift test --package-path packages/swift/TadayoCore`. Announcements cannot be heard in hosted tests: list the busy, availability, success and failure announcements in the TestFlight notes with exact steps.

## F. Ambiguities and conflicts

F1. Verify code pin. Frames at the usual size draw it in flow; the written rule pins it at every size; frame 19 pins it; the critic's ruling: pin only where it would otherwise sit under the keyboard. Open: the threshold (the sources say "would sit under"); the measure must be the unscrolled position against the height available without the pinned footer, or pinning shrinks the scroll view and flaps; the bottom (12 with the keyboard; without one the delivery names 44 above the safe area, `formFooterToSafeAreaBottom`, but only for pinned footers); `safeAreaInset` is read last by VoiceOver, which breaks `codeAccessibilityOrder` (verify before resend) unless the order is forced and checked; the harness has no keyboard, so the pinned state cannot be snapshotted unless a test host adds a bottom inset standing in for it. Suggest a pure decision function with its own unit test, the `-xl` snapshot, and a TestFlight check with exact steps. The profile part's Continue is always pinned (F-11) and shares `SetupFooter`.
F2. Region arithmetic. Written gaps give 12 + 36 + 16 = 64; the frames draw 8 + 36 + 16 = 60; the app today is 12 + 36 + 12 = 60. Adopting V-03 moves Verify 4 below the frames. Written values win (check §4 item 6).
F3. Back. Frames 4 and 7 and `screen-copy.json` draw Back enabled in action ink; `codeBack` ("only while idle") and IMPL line 40 make it unavailable. The app hides it. Whether unavailable means hidden or dimmed is unanswered (check §7).
F4. Lifetimes the sources do not give: a resend failure (suggested: until the next resend starts, a success, or Change email); a code error after a successful resend (suggested: cleared, since the digits are); whether typing clears a resend failure (suggested: no, it is not about the code).
F5. The signed-out notice has no ink, gaps, frame, announcement or lifetime (W-10). Smallest reading: `body`, `secondaryText`, between the subtitle and the label, announced once on first show, cleared once a code is sent. Mark built from spec.
F6. FQ93 and the shared `RootModel`: the cause of a leave is not carried today; the root part also edits these lines (R-09). "Leaving sign-in…" shows for every removal (R-10), including a server-ended one.
F7. X-16 says to add an invalid-address failure; R-01 and check §8 say keep "Couldn’t send a code. Try again."; the app cannot tell the cases apart (`SupabaseAuth.swift:122-127`, the server's prose is never read). R-01 and check §8 stand.
F8. A placeholder equal to the label may be spoken twice (W-08). What a SwiftUI field with an `accessibilityLabel` and a prompt exposes cannot be known on Linux; test `value` on an empty field and fix.
F9. Busy details with no source: whether the group "fits" is read as label width + 2 x 24 <= 321 (frame 19 is consistent); the reserved row's height (16 + 8) and position (above); the busy button at AX5 is drawn nowhere.
F10. Read-only emulation (C2): no read-only `TextField`; a rejected write can leave the typed character visible; no UI-test seam hangs a request.
F11. Announcement priority for the busy words is not given. As built: failures at default priority, availability polite. Suggested: busy at default, since it acknowledges the person's own tap.
F12. Leading text actions are a shared change: they reach the Lab, A03's Add photo and Go to Home (other parts).
F13. A02-age: failure to button 16 (frame 20); iOS 26 toolbar colour and glass; `ProfileModel.Failure` is shared with A03, so the words are chosen per screen; the 44-point constant is shared with A03.
F14. Frames draw "We’ll send a six-digit code to sign in." and "Tadayo is for people aged 18 and older." in primaryText; the critic keeps secondaryText. Record in INVENTORY.
F15. Unnamed gaps the app keeps: subtitle to field (frames 6 to 7 on A02-code, 38 to 39 on A02-email; built 44, `SetupGap.field`), title to subtitle (frames 18, built 16), A02-age title to body (60 against 24), field value inset (frames 14, built 16, `Metrics.swift:62-65`).
F16. States with no frame (built from spec): `A02-email-signed-out`, `A02-email-refused`, `A02-code-verify-unavailable`, `A02-code-error-waiting`, `A02-code-resend-refused`, a code error with a resend failure, `A02-age-saving`, `A02-age-refused`, every busy state at AX5, the `-dark` and `-xl` of every state except `A02-code-error`.
F17. Frame 19 versus the harness: its viewport is scrolled with the keyboard up; the app's `-xl` shows the whole screen; the address breaks differ (C-02).
F18. `vo.resend.success` speaks the address on the device only; it is never logged (T52).
No invariant (T1 to T62) is broken by the changes above as stated. FQ69 (finish or leave), FQ85, FQ86 and FQ87 are unaffected except as noted (FQ86 words equal `auth.code.unavailable`; FQ87 is not touched).

## G. Dependencies and notes

- Profile part (A03): shares `PrimaryButton` (C1), `SetupFooter` (keyboard-aware 12 / 44 bottom is theirs; A02-age only needs a fixed 44), `TextAction` (Add photo), the Leave sign-in toolbar button (define it once for both screens), `ProfileModel.Failure` (per-screen words) and the 44 constant.
- Root part: `RootModel.leave`, `endSession`, `.starting` (C7); `RootFailure.swift:46-50` uses `SetupHeading` and `SetupFooter(bottom: Spacing.s)`, so keep their signatures.
- Tabs part: `NoClubTabs.swift:83` takes the leading text action.
- Inventory (X-33): set the nine A02 frames 1 to 9, `A02-code-error-dark` and `-xl` to received (Handoff 7); re-source the four redraws (A02-email, A02-code, A02-code-error, A02-age, earlier source in brackets); keep handoff 1's frame for `A02-code` arrival and add the typed-code row; add `A02-email-signed-out` and the code-error-plus-resend-failure row as built from spec; correct `A02-email-empty` (placeholder), `A02-age-saving`, `A02-age-failed-network`, `A02-age-refused`; rewrite the Known differences bullets "Back buttons", "The busy button", "Where a failure line sits", "An unavailable text action", "A typed value longer than its field" (C-03), "Wrapping" (C-02), "States drawn the same"; add the frame differences the app does not follow (F2, F3, F14, F15, F17, the frames' field-to-error gaps).
- Questions (X-34): add FQ93; FQ69: record the leading Leave sign-in with no alert (the address kept in memory is not adopted, per the critic); FQ86: note `auth.code.unavailable` has the same words.

## Appendix 1. Frame measures (line-box tops, points)

| Frame | Measures |
|---|---|
| 23 `A02-email` | title top 127 (32 pt); subtitle 180 (17); label 241 (13); field [20,267,353,54]; button [20,343,353,50]; helper 417 |
| 3 `A02-email-failed-network` | field bottom 321; failure line boxes 326 and 344 (18 pitch, to 362; icon x20, text x42); button [20,380,353,50]; helper 454 |
| 24 `A02-code` | title 127; "Sent to" 180; label 209; field [20,235,353,54]; Verify [20,349,353,50]; wait sentence 421 at x20; Change email [20,451,353,44] (text 462) |
| 25 `A02-code-error` | field bottom 289; error boxes 297 and 315 (to 333); Verify [20,349]; Send a new code row [20,407,353,44] (text 418); Change email [20,451] |
| 7 `A02-code-resending` | spinner centre (28,429), text at x44, top 419, 16 pt, row [20,407,353,44]; Change email unavailable (#607067) |
| 8 `A02-code-resend-failed-network` | row ends 451; failure boxes 459 and 477 (to 495); Change email [20,503,353,44] |
| 26 `A02-age` | Leave sign-in top 68, [20,55,116,44]; title 127; body 223; button [20,724,353,50] |
| 9 `A02-age-failed-network` | failure boxes 668 and 686 (to 704); button [20,724,353,50] |
| 19 `A02-code-error-xl` | field [20,173,353,89]; error lines at 44 pt; Verify [20,464,353,85] (bottom 549, keyboard top 561); Send a new code [20,574,353,144]; Change email [20,734,353,144]; address broken 'Sent to' / 'ben@example' / '.com' |
