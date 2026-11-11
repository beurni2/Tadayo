# Profile (A03), Avatar and text actions: source map for the handoff 7 adoption slice

> Appendix to `docs/plans/ios-b0-adopt-handoff-7.md`, written on 11 November 2026 for the ios thread's plan from `main` at `a569278` (the code its line numbers cite). **Where it and the plan disagree, the plan wins**: its section 3 lists the corrections. Its scratch scripts were throwaway and are not kept.

Key: `profile`. Read-only map for "the slice that adopts handoff 7 for the screens on `main`" (journal block 1.3, Next step 3;
`docs/design/handoff-7/check/handoff-7-check.md` section 8). Checkout the repository, branch `ios/b0-source-files`, code = main
`a569278`. Nothing in the checkout was edited. Part: A03 (`ProfileScreen`), the `Avatar` component and its initial rule, A03's text
actions (Add photo, Optional, Leave sign-in) and the pieces A03 shares with sign-in.

Note on the task's file list: `PinnedFooterLayout.swift` is the folded card's internal layout (used only at `FoldedCard.swift:105`). It
is not A03's footer. A03's pinned footer is `SetupFooter` in `apps/ios/Tadayo/SignIn/SetupLayout.swift:62-75`.

## 0. How to read this

Short names (paths from the repository):

- H1, H7 = `design/reference/claude-design/handoff-1/` and `handoff-7/`.
- CHECK = `docs/design/handoff-7/check/handoff-7-check.md` (section numbers). FIND = `docs/design/handoff-7/check/handoff-7-findings.md`
  (finding ids). BRIEF = `docs/design/handoff-7/handoff-7-brief.md`. NEEDS = `docs/design/handoff-7/ios-lane-needs.md`.
- CC = H7 `component-contracts.json`, key `handoff7.<key>`. COPY = H7 `copy-contracts.json`, key `handoff7.<key>`.
  SC = H7 `screen-copy.json` entry. IMPL = H7 `IMPLEMENTATION.md` (section number). FM = H7 `frame-manifest.json`.
- INV = `design/reference/INVENTORY.md` (line numbers). FQ = `docs/QUESTIONS.md`.
- Frame numbers are H7's manifest order: 10 `A03-profile-empty`, 11 `A03-profile-failed-network`, 20 `A03-profile-empty-xl`, 27 `A03-profile`
  (a consequent redraw). Frame coordinates are the frames' 393 by 852 points. "Line box top = baseline minus 0.82 times the size" is the
  delivery's own convention (FIND F-08, second reviewer).

Precedence in force (so the planner does not re-derive it):

1. CC.precedence: "H7 wins only for scopes listed under replaces"; "appended H7 specimens are current only for their named scope";
   "Outlined Arimo reference frames are not UIKit screenshots. Use native system navigation, tab bar, keyboard, activity indicator,
   fields, alerts and Dynamic Type".
2. The check's "critic's rulings on disagreements" override the reviewers' per-finding actions (FIND, section "The critic's rulings").
3. Where a delivered line breaks T43 ("Errors name the action that failed and keep the person's input", `docs/INVARIANTS.md` T43; spec 24,
   `docs/tadayo-build-spec-v3.md:562`) the built line stands until Claude Design rewords it (R-01, W-15, CHECK section 4 item 3).
4. T46: the code never designs and never invents copy. Every value below traces to a source or is flagged as silent in section 6.

Rules and decisions in force for this part: T43 (errors name the action and keep input), T44 (tokens, no sizes of its own), T45 (native nav bar, keyboard, content types), T46, T47 (targets at least 44, every control has a VoiceOver name), T19 (one idempotency
key per save action, already built in `ProfileModel.save` `:71-97`: the new read-only and inactive states must not create a second action), T11 (`left()` purge on Leave, built), FQ70 (a name is 1 to 40 grapheme clusters), FQ85 (Add photo inert in B0),
FQ69 (an account at the age step can only finish setup or leave), FQ93 (reserved for this slice). Spec 29 lists A03 as "Name and optional avatar" (`docs/tadayo-build-spec-v3.md:602`); spec 24 (`:558`) asks for 44-point targets and names beside avatar colours, and
(`:562`) "error messages name the failed action, and every failed compose action retains input".

## 1. At a glance

| # | Item | On main | After the slice | Sources |
|---|---|---|---|---|
| 1 | Leave sign-in on A03 | none (A03 has no exit) | leading toolbar text action, inactive while saving, no alert, no chevron | F-10, R-07, X-19, V-11, W-08; CC.ageExit; IMPL 2 |
| 2 | Arrival focus | not focused (`ProfileScreens.swift:74`) | name field focused on appear, except when VoiceOver is running | F-11, X-19, V-11, VM-02, C-01; CC.authForm.profileArrivalFocus; IMPL 3 |
| 3 | Continue and the keyboard | 44 above whatever is below it (`SetupGap.profileFooter`) | 12 above the keyboard; 44 above the safe-area bottom with no keyboard | F-11, VM-02, WM-02; CC.spacing; CC.authForm.keyboardFooter |
| 4 | Where a save failure sits | in the pinned footer above Continue (`ProfileScreens.swift:106-108`) | in the scroll content, 12 under the field, no field border change | F-11, VM-01, X-19; CC.spacing.fieldErrorGap; IMPL 2, 3 |
| 5 | Name over 40 | Continue unavailable, no line | line "Use 40 characters or fewer for your name." under the field; name never cut | X-19; CC.authForm.profile; COPY auth.profile.tooLong; IMPL 3 |
| 6 | Name the server refuses | "Couldn’t save your profile. Try again." (no model case) | unchanged, no invalid border (the delivered line is not adopted) | R-01, W-15, CHECK 4.3 and 8 (A03 bullet) |
| 7 | Name field placeholder | none (`ProfileScreens.swift:94`) | prompt "Your name" in secondaryText | BM-02; COPY auth.profile.placeholder |
| 8 | While saving | Continue busy only | field read-only (keeps first responder and keyboard); Add photo and Leave inactive; Continue busy with value "In progress"; "Saving your profile." once | W-06, W-08, X-15, X-19, D-13; CC.busyPrimary; COPY vo.profile.busy, vo.busy.value |
| 9 | Add photo and Optional | centred under the avatar | leading at the 20-point inset, avatar stays centred | VM-03 over F-07, X-25; CHECK 3 and 8 |
| 10 | Avatar initial | any first character, uppercased; blank circle for none | initial only from a first letter or decimal digit; else outlined `person` at 56% | D-14, X-20, W-08; CC.avatarWithoutInitial; IMPL 5 |
| 11 | Avatar accessibility | hidden from VoiceOver | unchanged; "No profile photo" stays unused | WM-04, CHECK 4.13; CC.avatarWithoutInitial.a11y |
| 12 | Kept as built | | gaps above the field, subtitle ink secondaryText, initial at 28/34, single-line field, content continuous at AX5 | F-23, X-07/F-05/W-05 ruling, V-18/F-07, C-03, FM-01 |

## 2. Now: what main builds

### 2.1 A03 (`apps/ios/Tadayo/SignIn/ProfileScreens.swift`)

- Doc comment `:68-71`: avatar showing the name's initial as typed; Add photo "drawn and does nothing in B0 (FQ85; the picker is B3's)"; Continue
  waits for a name with more than spaces and at most 40 characters (FQ70); "There's no back once the age is recorded."
- `ProfileScreen` `:72-124`. Properties: `@Bindable var model` `:73`; `var focus: Bool?` `:75` (comment `:74`: "The field isn't focused on arrival: the
  frame shows no keyboard"); `@FocusState focused` `:76`. There is no `leave` parameter.
- Body, in order: `SetupScroll` `:80`; `SetupHeading(title: "auth.profile.title", subtitle: Text("auth.profile.subtitle"))` `:81`; a `VStack(spacing: 0)`
  `:82-92` holding `Avatar(name: model.name, size: .profile)` `:83`, `Button("auth.profile.addPhoto") {}` with `.tadayoText` and `.padding(.top, Spacing.s)`
  `:84-86`, `Text("auth.profile.optional")` in `.metadata` and `secondaryText` `:87-89`, framed `maxWidth: .infinity` (centres all three) with
  `.padding(.top, Spacing.xxxl)` `:91-92`; `LabelledField(Text("auth.profile.nameLabel"), isFocused: focus ?? focused)` `:93` around
  `TextField(String(), text: $model.name)` `:94` with `.textContentType(.givenName)`, `.textInputAutocapitalization(.words)`,
  `.autocorrectionDisabled()`, `.submitLabel(.continue)`, `.onSubmit { Task { await model.saveName() } }`, `.focused($focused)` `:95-100`, then
  `.padding(.top, Spacing.xxl)` `:102`.
- Footer `:104-117`: `.safeAreaInset(edge: .bottom, spacing: 0)` with `SetupFooter(bottom: SetupGap.profileFooter)` (44) holding the failure
  `InlineError(Text(verbatim: failure.words))` `:106-108` and Continue `:109-115` with `.buttonStyle(.tadayoPrimary(isBusy: model.isSaving))` and
  `.disabled(!model.canContinue)`.
- `.navigationTitle(Text("auth.profile.navTitle"))` inline `:118-119`; `.announcing(model.failure?.words)` `:120`; `.tint(Palette.action)` `:122`.
- `ProfileModel.Failure.words` `:126-135`: `.network` is `auth.profile.networkFailure`, `.other` is `auth.profile.saveFailed`. It is shared with
  `AgeScreen` (`:22-24`, `:49`); the extension's own comment `:127-128` says "A02-age has no line of its own yet: it uses the profile's until handoff 7 gives one."
- Routing: `apps/ios/Tadayo/App/TadayoApp.swift:47-48` builds `ProfileScreen(model: profile)` (no `leave`); `:41-45` builds `AgeScreen(..., leave: { await root.leave() })`.
  `.starting` is the canvas alone `:59-60`.
- AgeScreen today (the exit A03 lacks): chevron toolbar item `:38-48` labelled `auth.age.leave`, plus a footer `Button("auth.age.leave")` `:32-33`; neither is
  disabled while saving. `SystemBackColour` `:55-66` exists only to colour that chevron (`:45`).

### 2.2 Model and root (Foundation-only, Linux-testable)

- `packages/swift/TadayoCore/Sources/TadayoCore/ProfileModel.swift`: `Failure {network, other}` `:9-12`; `nameLimit = 40` `:16`; `isSaving` `:19`; `failure` `:20`;
  `name` `:44`; `nameIsTooLong` (trimmed count above 40) `:47`; `canContinue` `:51`; `saveName()` `:59-62`; `save` `:71-97` maps `.network` to `.network`, `.unavailable`
  to `.other`, `.signedOut` to `signedOut()`, `.versionConflict` to a re-read, anything else to `.other`.
- A name the server refuses arrives as `APIFailure.refused` (`packages/swift/TadayoAPI/Sources/TadayoAPI/TadayoAPIClient.swift:72`: `.badRequest, .notFound`
  throw `.refused`; `Account.swift:62`) and so shows as `.other`. No model case tells a refused name from any other refusal.
- `RootModel.swift`: `leave()` `:121-127`; `endSession()` `:129-143` sets `signIn = nil`, `profile = nil`, `account = nil`, `route = .starting`, signs out, calls `left()`
  (T11 purge), then `showSignIn()` `:176` (a new `SignInModel`, empty address) or `route = .leaveFailed`; `retry()` `:105-113` is the one place the typed address is carried over
  (`signIn?.email`, `:109-111`). `show(_:)` `:223-241` builds the `ProfileModel` with `saved` and `signedOut` closures guarded by `epoch == asked`, so a save that finishes after
  Leave is ignored; `route = account.ageConfirmed ? .profile : .confirmAge` `:241`.

### 2.3 Avatar (`packages/swift/TadayoDesign/Sources/TadayoDesign/Components/Avatar.swift`)

- Body `:30-56`: with no photo, `Text(Avatar.initial(of: name))` in `.system(size: role.size, weight: role.weight)` (role from `role(for:)` `:58-65`: `.avatarProfile` 28/34 bold,
  `.avatarRow` 16/20, `.avatarCard` 13/18, `.avatarRail` 9/11, `TypeRole.swift:20-56`), `lineLimit(1)`, fills `Palette.avatarOnCover` or `avatarCanvas` and inks `onAvatarOnCover` or
  `onAvatarCanvas`; clipped to a `Circle`; a photo gets a 1-point `separator` edge (`Size.photoAvatarEdge`); the whole view is `.accessibilityHidden(true)` `:55`.
- `initial(of:)` `:69-74`: trims `.whitespacesAndNewlines`, takes `.first` (a grapheme cluster), `uppercased()`. A blank name gives `""` (an empty circle, INV `:395`).
- Sizes: `AvatarSize` 68 profile, 36 row, 28 card, 18 rail (`Metrics.swift:103-108`). Tokens already exist: `avatarCanvas` and `onAvatarCanvas` (`Palette.swift:28-29`),
  `avatarOnCover` and `onAvatarOnCover` (`Palette.swift:31-32`).
- Used at `ProfileScreens.swift:83`, `NoClubHeader.swift:82`, `HighlightCover.swift:80` and `:113`, `FoldedCard.swift:126`, `RevealedDropView.swift:44`, and the Lab
  (`apps/ios/Tadayo/Lab/LabView.swift:164` for `FixtureCast.sundayPeople`, `:173` for the six covers). No `Image(systemName: "person")` exists anywhere (D-14).
- There is no test target in `TadayoDesign` (`Package.swift` has one target); the app's test targets `TadayoSnapshotTests` and `TadayoTests` import it (`apps/ios/project.yml:145-177`).

### 2.4 Pieces A03 shares with sign-in

- `SetupLayout.swift`: `SetupScroll` `:9-25` (20 in from each edge, top 20, bottom 16, `.scrollBounceBehavior(.basedOnSize)`, canvas background); `SetupGap.profileFooter` =
  `Spacing.xxxl + Spacing.m` = 44 `:35`; `SetupHeading` `:41-58` (title `utilityTitle` heading, subtitle `body` in `secondaryText` `:54`, gap 16 default);
  `SetupFooter` `:62-75` (`VStack(spacing: Spacing.s)`, top 8, bottom a parameter, canvas background); `announcing(_:politely:initial:)` `:82-89` and `Announcement.post` `:95-100`
  (`UIAccessibility.post(.announcement)` with default or low priority).
- `TadayoDesign/Components/TextAction.swift:7-35`: `textAction` 16/22 regular, `.multilineTextAlignment(.center)` `:22`, `.frame(maxWidth: .infinity, minHeight: Size.touchTarget)` `:28`;
  unavailable ink `secondaryText` ("no delivery draws it yet, so it's built from spec (handoff 7 asks)", `:5-6`). Users: `SignInFlow.swift:137` (Change email address), `:194` (Send a new code),
  `ProfileScreens.swift:33` (age footer link) and `:85` (Add photo), `NoClubTabs.swift:83` (Go to Home), `LabView.swift:381` and `:385`.
- `InlineError.swift`: `exclamationmark.circle` icon plus the literal words, `metadata` 13/18, `destructive`, leading, icon hidden from VoiceOver.
- `LabelledField.swift:17-69`: label `fieldLabel` 13/18 bold, 8 above the field (`:38`); field min 54, inset `Size.fieldInset` 16 (`:47-49`, `Metrics.swift:65`); `isInvalid` draws a 1-point
  `destructive` border and `error` becomes the field's hint (`:52-53`, `:66`); focus ring 2 wide, 2 gap (`:55-62`); `isFocused` is passed in so snapshots can draw focus without a keyboard.
- `PrimaryButton.swift:53-119` (`PrimaryButtonFace`): `HStack(spacing: Spacing.s)` of a hidden leading `ProgressView`, the centred label, and a trailing `ProgressView` (`:76-88`); no
  `accessibilityValue`; `isEnabled || isBusy` keeps the colours while the native button is disabled (`:42`).
- `SignInFlow.swift`: `EmailScreen` focuses on appear `.onAppear { if focus == nil { focused = true } }` `:78`; `CodeScreen` does the same `:144` and puts a `prompt:` with
  `secondaryText` on its field `:117`; failure under the email field is `.padding(.top, Spacing.m)`. `SignInModel.canChangeEmail` `:153` is the model-side pattern for an action that is
  inactive while a request runs.

### 2.5 Strings

- App catalog `apps/ios/Tadayo/Localizable.xcstrings`, A03 keys: `auth.profile.title` "What should we call you?", `.subtitle` "A name your friends know.", `.addPhoto` "Add photo", `.optional`
  "Optional", `.nameLabel` "Your name", `.continue` "Continue", `.navTitle` "Your profile", `.networkFailure` "Couldn’t save your profile. Check your connection and try again.", `.saveFailed`
  "Couldn’t save your profile. Try again." (comment: "A02-age's line until handoff 7"); `auth.age.leave` "Leave sign-in"; `auth.signIn.navTitle` "Sign in".
- Package catalog `packages/swift/TadayoDesign/Sources/TadayoDesign/Localizable.xcstrings`: 24 keys, none for the avatar or the busy button. `apps/ios/TadayoTests/DesignCatalogTests.swift`
  (`:20-30`, `:44-71`) requires that every package string is looked up as `String(localized:, bundle: .module)`, that the catalog's keys equal the looked-up keys exactly (no unused key), and that
  none is also in the app's catalog.

### 2.6 Tests and snapshots on main that touch A03

- `apps/ios/TadayoSnapshotTests/SignInSnapshotTests.swift`: `testA03Profile` `:135`, `testA03ProfileEmpty` `:141`, `testA03ProfileSaving` `:145`, `testA03ProfileFailedNetwork` `:152`,
  `testA03ProfileRefused` `:159`, `testA03ProfileNameTooLong` `:166` (book p27's two long names, 45 characters); `testEachTitleIsAHeading` `:176`; `testTheAgeScreensBackIsLeaveSignIn`
  `:218` (expects 2 "Leave sign-in" elements); `testTheAvatarIsntRead` `:224`; helper `snapProfile` draws `ProfileScreen(model:, focus: false)` `:309`.
- References: `apps/ios/TadayoSnapshotTests/__Snapshots__/SignInSnapshotTests/testA03*.png`, 6 states times light, `-dark`, `-xl` = 18 PNGs (plus 12 for A02-age).
- Harness `ScreenSnapshots.swift:8-10`: 393 by 852 at 2x; light, dark and `-xl` (AX5, a 2,200-point-tall phone so nothing scrolls); "The keyboard and the status bar aren't drawn"; `focus` is a
  parameter so a snapshot can draw the focus ring. `Spinners.check` demands a spinner in a `busy` state.
- `apps/ios/TadayoUITests/SignInUITests.swift`: `:144` `testLeavingSignInFromTheAgeScreenStartsAgain` (chevron, then the footer button; asserts the email field is not "ben@example.com"
  afterwards); `signInToTheTabs` types the name after `name.tap()`; the email and code tests type "with no tap" (comments at `:24`, `:64`).
- `packages/swift/TadayoCore/Tests/TadayoCoreTests/ProfileModelTests.swift`: `theAgeIsRecordedAloneAndFirst` `:97`, `theNameIsTrimmedAndSentWithTheVersionRead` `:108`, `anEmptyNameIsRefusedHere` `:118`,
  `aNameOverFortyCharactersWaitsAndIsNotCut` `:131`, `aRetryAfterNoAnswerSendsTheSameKeyAndBody` `:149`, `aChangedNameIsANewActionWithANewKey` `:168`, `aRefusedSaveEndsItsActionAndKeepsTheName` `:180`,
  `aConflictReadsTheAccountAgainAndTriesWithItsVersion` `:194`, `theNameAlreadySavedMovesOn` `:212`, `anotherNameSavedFirstKeepsWhatWasTyped` `:225`, `anAgeAnotherDeviceRecordedMovesOn` `:248`,
  `anEndedSessionSignsOut` `:258`.

### 2.7 Inventory rows on main

INV `:49` `A03-profile` received (handoff 1); `:50` `A03-profile-empty` built from spec ("No account-safe fallback is delivered for the avatar, so the circle is empty ...; the field isn't focused on
arrival"); `:51` `-saving`; `:52` `-failed-network` ("above Continue, the name kept"); `:53` `-refused` ("A name the server refuses ... draws the same"); `:54` `-name-too-long` ("no line").
Known differences: `:385` back buttons (A02-age chevron; "A03-profile has none"), `:388` spacing and `SetupGap` (44 = 32 + 12 from A03's Continue to the safe area), `:389` the title's height, `:390`
the wrapped title's 38-point line pitch, `:393` a typed value longer than its field ("the ios lane's needs list asks a later handoff for a field that wraps"), `:394` where a failure line sits
("above the button it names"), `:395` "A03-profile-empty's avatar", `:396` "States drawn the same". Avatar notes `:304` ("People appear only as initials"), `:305`, `:318`. `screens/` holds only
`A03-profile.png` (and `A02-age.png`).

## 3. What handoff 7 delivers

### 3.1 The four A03 frames against handoff 1 and main

Points in the frames' space. Main's values are from its source and its committed snapshots (the committed snapshots draw the nav bar about 15 points lower than the frames, INV `:389`).
"Derived" means computed by me from SVG baselines with the line-box convention; it is not in the check.

| Measure | H1 frame 5 `A03-profile` | H7 frames 10 and 27 (keyboard up, focus ring drawn) | H7 frame 11 (failed) | H7 frame 20 (AX5) | Main today |
|---|---|---|---|---|---|
| Exit | back chevron path at (16, 65), stroke #284CDB | "Leave sign-in" 16 pt #284CDB at x20, baseline 81.12; control [20,55,116,44] enabled (SC) | same | same | none on A03 |
| Nav title | "Your profile" 17 pt centred, baseline 84.0 | baseline 83.94 | same | same | inline `auth.profile.navTitle` |
| Title | baselines 143 and 178 ("What should we" / "call you?") | 145.24 and 180.24 ("What should we call" / "you?", Arimo wraps wider) | scrolled 128 up, hidden | above viewport | wraps "What should we / call you?" at a 38-point pitch (INV `:390`) |
| Helper line | #607067, baseline 220 | #182B25, baseline 220.94 | scrolled out | above viewport | `secondaryText` kept (`SetupLayout.swift:54`) |
| Avatar circle | [162.5,259,68,68] fill #E1E5F6 | [162.5,251,68,68] fill #E1E5F6 | [162.5,123,68,68] | y -190 (above) | 68, centred |
| Initial | "B" 28 pt, x186.39, baseline 305.92 | "B" 30.6 pt, x185.45, baseline 291.73 (frame 27); glyph centre about 4 above the circle's | same, baseline 163.73 | none | role `avatarProfile` 28/34 (kept: V-18, F-07) |
| Person fallback (no name) | none drawn (NEEDS 9; H1 PDF p21 asks for one) | frame 10: `person` outline, stroke #182B25 1.7, 24-unit glyph scaled 1.59 at (177.46, 263.24), a 38.2 box centred on x but 2.7 above the circle's centre | n/a | drawn above viewport at y -177.76 | blank circle (INV `:395`) |
| Add photo | centred, x160.02, baseline 364 | x20, baseline 349.12; control [20,325,353,44] | baseline 221.12; [20,197,353,44] | [20,-100,353,83] (above) | centred, target 8 below avatar |
| Optional | centred, x172.29, baseline 391, 13 pt #607067 | x20, baseline 376.66, #607067 | baseline 248.66 | baseline 16.08, 44 pt, #182B25 (FM-02: ink differs in the xl SVG only) | centred, metadata secondaryText |
| Label "Your name" | baseline 431, 13 pt bold #182B25 | baseline 404.66 | 276.66 | baseline 236.08 (44 pt), box 200 to 254 | `fieldLabel` 13/18 bold |
| Gap helper to avatar (F-23) | about 30 | 21 | n/a | n/a | 32 (`Spacing.xxxl`, `:92`) |
| Gap avatar to Add photo target (derived) | about 13 | 6 | n/a | n/a | 8 (`Spacing.s`, `:86`) |
| Gap Optional to label (F-23) | about 22 | 10 | n/a | 166 (FM-01) | 24 (`Spacing.xxl`, `:102`) |
| Gap label to field (F-23, second reviewer) | about 4 | 8 | 8 | 8 | 8 (`LabelledField.swift:38`) |
| Field | [20,442,353,54] r10 fill #F0F2EC stroke #778579, text at x34 | [20,420,353,54]; focus ring [17,417,359,60] r13 stroke #284CDB 2; text at x34 | field [20,292,353,54], ring [17,289,359,60], border stays #778579 | field [20,262,353,89], ring [17,259,359,95]; text 53 pt | min 54, inset 16 (`Size.fieldInset`, `Metrics.swift:62-65`: the frame draws 14) |
| Placeholder | none | frame 10: "Your name" 17 pt #607067 at x34, baseline 449.44 | n/a | 53 pt at baseline 317.46 | none |
| Failure | none | none | icon: an exclamation in a circle, 14 pt, stroke #AD3529, at (20,364); text x42, baselines 372.66 and 390.66, 13 pt #AD3529, wraps "...and try" / "again."; line box top 362, 16 under the field (contract: 12) | not drawn | above Continue in the footer, 8 above the button, 2 lines (committed `A03-profile-failed-network` snapshot) |
| Continue | [20,724,353,50] #284CDB, baseline 755 | [20,499,353,50]; frame 10 disabled (#E2E6DF, label #4F5E55), frame 27 enabled; bottom 549 = keyboard top 561 minus 12 | [20,499,353,50] enabled | [20,464,353,85] disabled; bottom 549 | bottom 44 above safe-area bottom, keyboard or not |
| Scroll viewport | n/a | none drawn | clip [0,104,393,383]: ends 12 above Continue; content shifted up 128 | clip [0,104,393,348]: ends 12 above Continue | `SetupFooter` top padding 8 (`SetupLayout.swift:71`) |
| Keyboard | none | top 561, 291 tall, schematic; return key reads "next" | same | same | `.submitLabel(.continue)`; the harness draws no keyboard |

Controls (SC, with `enabled`): Leave sign-in [20,55,116,44] true on all four; Add photo [20,325,353,44] / [20,197,353,44] / [20,-100,353,83] with hint ""; Your name [20,420,353,54] / [20,292,353,54] /
[20,262,353,89]; Continue [20,499,353,50] false (frame 10), true (frames 11 and 27), [20,464,353,85] false (frame 20). Frame 20's note: "Focused name field shown. Title/avatar/Add photo above viewport.
Continue pinned above keyboard." Frames 26 and 27 note: "B0 navigation, recovery spacing, exit or shared no-club header correction; scope in IMPLEMENTATION.md." (FM).

Frame 11's scroll offset (128) is not derivable from a stated rule: with the content ending about 16 under the failure block the maximum offset would be near 55. Treat it as illustrative (section 6.11).

The Avatar specimen (the sheet `frames/brand-components.svg`, "Avatar with no readable initial", light at x64 y11714 and dark at x644, 393 by 290; `component-sample-index.json` entries 14 and 15): on canvas, circles of 68,
36, 28, 18 with fill #E1E5F6 and the `person` glyph in #182B25; below, on a pale 353 by 100 panel, the same four with fill #182B25 and glyph #FAFBF8. Glyph box = 0.56 times the diameter (38.2, 20.2, 15.6,
10.1 drawn: scales 1.59, 0.84, 0.65, 0.42 of a 24-unit glyph), centred on x and 4% of the diameter above the circle's centre at every size (derived: 2.7, 1.4, 1.1, 0.7 points). Stroke 1.7 in glyph units.

### 3.2 Contract entries (verbatim)

CC.spacing: `formInset` 20, `fieldLabelGap` 8, `fieldErrorGap` 12, `errorToActionMinimum` 16, `resendToFailure` 8, `formFooterToKeyboard` 12, `formFooterToSafeAreaBottom` 44 (inherits handoff 6's spacing; "Gaps measure line-box edges").

CC.authForm:
- `profileArrivalFocus`: "True at all sizes, unless VoiceOver focus would be stolen; announce screen then allow normal focus management. Drawn first-responder reference in both sizes."
- `profile`: "Name required; optional photo. Continue disabled on empty/whitespace or >40 graphemes. Keep overlong input, show auth.profile.tooLong under field, no silent truncation. Server invalid-name response uses auth.profile.nameRefused and invalid border."
- `profilePhoto`: "Upload failure stays by photo controls, keeps typed name and chosen photo; Continue can save profile without photo." (B3's; not built here.)
- `keyboardFooter`: "Continue and Verify code pinned above keyboard with 12-point clear gap. Form body is one vertical scroll view; controls are never overlaid on form text."
- `AX5`: "... A03-profile-empty-xl shows focused name field; title/helper/avatar/photo controls above. Scroll to access them without dismissing keyboard." and "no font caps in production".
- `networkOrServer` (code error slot, same rule): "Error icon and error text; normal inputBorder and focus ring."

CC.busyPrimary: scope "Send a code", "Verify code", "I’m 18 or older", "Continue"; `minimumHeight` 50; fill `action`, ink `onAction`; `indicatorSize` 16, `indicatorGap` 8; `layout`: "Keep label centered at its idle
position; reserve symmetric leading/trailing 24-point accessory slots. Spinner sits 8 before measured label. At large text if that group cannot fit, spinner moves to centered own row; button grows by the same reserved row
in idle and busy."; `nativeButtonEnabled` false; `repeatSubmission` false; `valueKey` `handoff7.vo.busy.value`; `field`: "read-only, keep first responder and keyboard if already shown; restore editing after failure";
`leaveChangeResend`: "Inactive while primary request or routing account read runs; do not queue another action."

CC.ageExit: `nav` "Native leading Leave sign-in text action, no back chevron. Same on A03."; `confirmationAlert` false; `reason` "Explicit exit is reversible through sign-in; no extra question. Leaving preserves recorded age on server,
never resets or bypasses it. Unsaved name and photo remain only in the restricted setup view while exit fails; purge them on successful exit/account switch."; `inFlight` "Exit unavailable during save/verification/resend;
after a failure available again."; `return` "A02-email in B0, address retained in memory. No chevron from A03 to age."

CC.avatarWithoutInitial: `sizes` [68, 36, 28, 18]; `glyph` "person (SF Symbol outline, schematic reference in export)"; `glyphSizeRatio` 0.56; `canvasFill` `avatarCanvas`, `canvasInk` `onAvatarCanvas`; `anyCoverFill` `avatarOnCover`,
`anyCoverInk` `onAvatarOnCover`; `initialRule` "First visible grapheme after trimming: a Unicode letter in any script or a decimal digit can be shown. Emoji, symbols, punctuation and unsupported/missing glyphs use person
fallback; never derive from email. Combining marks stay attached. Meaningful full name remains visible and scales. Update initial live as name is typed."; `a11y` "Decorative when beside full name; profile photo control uses
No profile photo, not the glyph name." CC.replaces: `avatarWithoutInitial` replaces "Handoff1 account-safe non-photo fallback prose"; `busyPrimary` "Handoff1 submission prose; new visual contract for auth primary actions only";
`authForm` "fieldFocus remains; replaces conflicting auth error placement/timing and adds B0/AX5 rules"; `ageExit` "Handoff1 A02-age/A03-profile back chevrons and exit prose, B0 setup only".

COPY (words; app key where one already carries the same words):
- `auth.profile.nav` "Your profile" (= `auth.profile.navTitle`); `.title` "What should we call you?"; `.body` "A name your friends know." (= `.subtitle`); `.photo` "Add photo" (= `.addPhoto`); `.optional` "Optional";
  `.label` and `.placeholder` "Your name" (= `.nameLabel`); `.primary` "Continue" (= `.continue`).
- `auth.profile.network` "Couldn’t save your profile. Check your connection and try again." (= `.networkFailure`); `.refused` "Couldn’t save your profile. Try again." (= `.saveFailed`);
  `.tooLong` "Use 40 characters or fewer for your name." (new); `.nameRefused` "Choose a name with visible characters and no line breaks or hidden formatting." (not adopted, R-01);
  `.photoNetwork`, `.photoRefused`, `.retryPhoto` (B3).
- `auth.age.leave` "Leave sign-in" (= `auth.age.leave`); `auth.age.network` "Couldn’t save your age confirmation. Check your connection and try again."; `auth.age.refused` "Couldn’t save your age confirmation. Try again."
- `vo.profile.busy` "Saving your profile."; `vo.age.busy` "Saving your age confirmation."; `vo.busy.value` "In progress"; `vo.profile.emptyAvatar` "No profile photo" (unused, WM-04);
  `vo.failure.auth.profile.network`, `.refused`, `.tooLong`, `.nameRefused`, `.photoNetwork`, `.photoRefused` are the visible words, word for word.
- `announcementPolicy.busy`: "Announce the action once, keep focus; button label stable, value vo.busy.value. Do not repeat on renders." `.failures`: "Announce the exact visible failure once, without stealing focus.
  Full keys begin vo.failure." COPY.replaces maps `auth.profile.network`, `.refused`, `.photoRefused`, `.retryPhoto`, `.nav`, `.body`, `.photo`, `.optional`, `.label`, `.placeholder`, `.primary`, `.title` to earlier keys.

IMPL (prose) 2, "Age confirmation and exit": "Use a native leading Leave sign-in text action on both A02-age and A03-profile. It replaces the misleading back chevron; A03 never navigates back to undo a recorded age. There is no
extra confirmation alert ... Leaving removes the session from this iPhone and returns to A02-email in B0, with the address retained in memory. Recorded age remains on the server. While save is in flight, Leave sign-in is
inactive. If leaving fails, show the root phone-removal failure; never show an apparently signed-out email screen over a retained session."

IMPL 3, "Profile and large-text form behavior", the paragraph the A03 change is built from: "A03-profile-empty is focused on arrival, with a native name keyboard, at default and largest text sizes. Continue stays
keyboard-pinned with 12 clear points above the keyboard. One vertical scroll view holds title, helper, avatar, Add photo, Optional, label, field and validation. The default frame shows the 68-point non-photo person fallback.
It never comes from the email address. As Ben types a name beginning with a readable letter/digit, the initial updates live. Continue is disabled until a non-whitespace name is present. Do not add an error for an untouched empty
field. Preserve an overlong name exactly as entered; disable Continue and show Use 40 characters or fewer for your name. below the field. Count grapheme clusters, trim outer spaces only before sending, and keep internal
meaningful spaces/joiners. Do not silently cut the input at 40. ... Saving a profile makes the name read-only and Add photo/Leave sign-in inactive; Continue gets the shared busy treatment and Saving your profile.
announcement. On failure the name remains focused and the keyboard stays up. The body scrolls to keep the field and error reachable above Continue; it does not dismiss the keyboard. ... Connection and server save messages use
the same growing block under the field, with no invalid border for either. ... At AX5, A03’s title wraps naturally across several lines at full 353-point width. ... Single-line native text fields scroll horizontally for a long
value; they do not wrap the typed address/name into the border."

IMPL 5, "Person fallback": "Show the outlined person symbol when there is no readable initial, at 56% of 68, 36, 28 or 18 points. The production glyph is the native person symbol, not a downloaded illustration. A first visible grapheme
that is a Unicode letter in any script or a decimal digit can supply an initial. Emoji, symbols, punctuation and unsupported glyphs use the person fallback. Never strip combining marks from their letter, and never use email.
Decorative avatars are hidden from VoiceOver beside a name; the profile control can say No profile photo."

### 3.3 What the check (section 8) tells the ios thread, for this part

- A03 (the bullets joined with semicolons): "the same Leave sign-in; the field focused on arrival, but not when VoiceOver is running (C-01); Continue 12 above the keyboard and 44 above the safe area without it; failures in the scroll content 12 under the field; the
  too-long line, with the name never cut at 40; the placeholder "Your name"; the field read-only and Add photo and Leave inactive while saving. For a refused name keep "Couldn’t save your profile. Try again." (X-19, F-11, VM-01,
  VM-02, BM-02, R-01)."
- Avatar: "an initial only from a first letter or decimal digit; otherwise the outlined person symbol at 56% (D-14, X-20)."
- Text actions: "leading at the 20-point inset, keeping the full-width 44-point target ... A03's Add photo and Optional also go leading under the centred avatar (X-25, VM-03 over F-07; the critic's ruling names only the resend
  and Change email rows)."
- Kept as built: "A03's gaps from handoff 1, apart from the label's 8 (F-23)" (LabelledField already builds 8); "secondaryText for body lines (F-05, X-07, the critic's ruling on W-05)"; "an empty email field after Leave sign-in until
  FQ93 is answered (R-06, the critic's ruling over WM-01 and BM-03)".
- Section 4 items 12 and 13: "The profile at the largest text: frame 20 has an empty band of about 166 points ... The app keeps the content continuous." and "the header's initial and the profile's initial keep their type sizes;
  the photo circle doesn't announce "No profile photo" until Claude Design says which part speaks it".
- Keys: "keep the built keys where a handoff 7 key repeats one word for word (person.self, highlight.label), noting the mapping in the strings' comments" (D-25, W-14).
- Inventory and questions edits: section 4.5 below.

### 3.4 Findings index (this part)

| Id | Essence | Disposition |
|---|---|---|
| C-01 | profile arrival focus is conditional on VoiceOver; the other findings say unconditional | C-01 wins (P2) |
| X-19, F-11 | A03 exit, focus, footer, failure place, too-long, read-only, leading actions | adopt, except "add a nameRefused failure" (R-01 wins, P6) |
| VM-01 | failure goes under the field in the scroll body | adopt (P4) |
| VM-02, WM-02 | Continue 12 above keyboard, 44 above safe area otherwise | adopt (P3) |
| BM-02 | placeholder "Your name" in secondaryText | adopt (P7) |
| R-01, W-15 | refused-name and invalid-address lines do not name the action (T43) | keep built line (P6) |
| D-14, X-20 | person symbol at 56% unless first grapheme is a letter or decimal digit | adopt (A1 to A3) |
| WM-04, CHECK 4.13 | "No profile photo" has no named element | keep avatar hidden (A4) |
| VM-03, X-25 | text actions leading, avatar centred | adopt (P9, S5); F-07's "keep centred" is superseded |
| F-07, V-18 | initial drawn at 30.6 and high | keep role size (A5) |
| F-23 | A03 gaps tightened without explanation | keep handoff 1 gaps (P12) |
| FM-01 | frame 20 has a 166-point hole | keep continuous (P12) |
| F-08 | field-to-error gap 5, 8, 16 in frames; contract 12 | build 12 |
| F-05, X-07, W-05 (critic's ruling) | body ink moved to primaryText without a replaces entry | keep secondaryText |
| F-10, R-07, X-18, V-11 | Leave sign-in leading text action on A02-age and A03, no alert, inactive while saving | adopt (P1) |
| W-06, X-15, D-13 | busy button geometry, value, announcement, field read-only | adopt (P8, S3) |
| W-08 | A03 corrections, placeholder not spoken twice | adopt |
| C-03 | field that does not wrap is answered: keep the single-line field | keep (P10, D) |
| R-06, WM-01, BM-03 | address after Leave sign-in | founder (FQ93), default empty |
| X-33, X-34, V-17 | inventory and questions edits | section 4.5 |

## 4. Exact change

Order that keeps each step buildable: A1 to A3 (Avatar, independent) and S5 (text action alignment) first, since both change other screens' snapshots; S2 (footer) with the code and age parts; then P1 to P12; then K, then D.

### 4.1 A03 (`ProfileScreen`)

**P1. Leave sign-in.**
- Where: `ProfileScreens.swift` (`ProfileScreen` gains `let leave: @MainActor () async -> Void`), `TadayoApp.swift:47-48` (pass `leave: { await root.leave() }`, as `:45` does for `AgeScreen`).
- Change: one `ToolbarItem(placement: .topBarLeading)` holding `Button("auth.age.leave")` that runs `Task { await leave() }`, `.disabled(model.isSaving)`, no alert, no chevron. Key `auth.age.leave` ("Leave sign-in") already exists and is
  the delivered word for both screens (COPY has only `auth.age.leave`).
- Sources: F-10, R-07, X-19, V-11, W-08; CC.ageExit; IMPL 2; SC (rect [20,55,116,44], enabled on all four frames).
- Notes: the same item is needed on `AgeScreen` (the age part removes its chevron `:38-48`, its footer link `:32-33`, and `SystemBackColour` `:55-66`, which only coloured that chevron); a small shared helper in this file
  vs two copies is the planner's call. A failed leave already shows `RootFailure(kind: .leave)` (`TadayoApp.swift:51-52`); nothing to build. After a successful leave the email field is empty (FQ93 default); keep
  `RootModel.endSession` as is.

**P2. Arrival focus.**
- Change: `.onAppear { if focus == nil, !UIAccessibility.isVoiceOverRunning { focused = true } }` (the pattern at `SignInFlow.swift:78` and `:144`, plus the VoiceOver condition). With VoiceOver running, set no first responder: "announce screen
  then allow normal focus management" (CC.authForm.profileArrivalFocus), and C-01: "leave focus to the system so the screen is announced first". `focus` stays the snapshot override (nil in the app).
- Sources: F-11, X-19, V-11, VM-02, C-01; CC.authForm.profileArrivalFocus; IMPL 3; BRIEF item 10.
- Update the `focus` doc comment `:74` (it states the opposite). Snapshot calls must pass `focus: true` to draw frames 10, 11, 20 and 27 (all draw the focus ring); today `snapProfile` passes `false` (`SignInSnapshotTests.swift:309`).
- The same `ProfileModel` instance survives the age to profile route change (`RootModel.swift:223-241`), but the profile is a new view in `RoutedView`, so `onAppear` runs.
- On a failed save the field stays first responder and the keyboard stays up (IMPL 3; BRIEF item 11, `fieldFocus.errorDoesNotClearFocus`): do not reassign or resign focus in the failure path.

**P3. Footer: 12 above the keyboard, 44 above the safe area without it.**
- Where: `SetupLayout.swift` `SetupFooter` (`bottom:` is one value today, `:63`, `:72`) and `SetupGap.profileFooter` `:35`; `ProfileScreens.swift:105`.
- Change: `SetupFooter` takes the two values, `formFooterToKeyboard` 12 (= `Spacing.m`) while the keyboard is up and `formFooterToSafeAreaBottom` 44 (the existing `SetupGap.profileFooter`) otherwise. Only Continue stays in the footer (the failure
  leaves it, P4). The footer stays a `.safeAreaInset(edge: .bottom)`, which SwiftUI already lifts above the keyboard, so the keyboard case is the footer's own bottom padding.
- Sources: F-11, VM-02, WM-02; CC.spacing; CC.authForm.keyboardFooter; frames 10, 11, 20, 27 (Continue bottom 549, keyboard top 561). The same footer shape serves Verify code (the code part) and the age and root footers (44, V-11); coordinate one change.
- Silent: how to know a keyboard is up, and what a hardware keyboard means (section 6.9).

**P4. Failure block under the field.**
- Change: remove `InlineError` from the footer `:106-108`; after the `LabelledField` inside `SetupScroll`, when there is a line to show, `InlineError(Text(verbatim: ...)).padding(.top, Spacing.m)` (12, `fieldErrorGap`; `EmailScreen` does the
  same for its failure). The field keeps `inputBorder` and the focus ring for network, server and too-long: `isInvalid` is not set (CC.authForm: "Only invalid address, invalid code and rejected name responses use the destructive field border";
  IMPL 2 and 3: "no invalid border for either"). The block grows with the text; it is one block for the save failures (IMPL 3: "the same growing block under the field").
- At least 16 clear points between the block and Continue (CC.spacing.errorToActionMinimum): the scroll content's bottom padding 16 (`SetupLayout.swift:20`) plus the footer's top padding 8 meets it when scrolled to the end.
- The body must scroll so that the field and the block are reachable above Continue without dismissing the keyboard (IMPL 3). The sources give no mechanism or offset (section 6.11).
- Words (P5, P6 below). Announcement: exact visible words once, without moving focus: `.announcing(model.failure?.words)` `:120` already does it; the too-long line needs the same (COPY `vo.failure.auth.profile.tooLong` is the visible words).
- Sources: F-11, VM-01, X-19, F-08; CC.spacing.fieldErrorGap; IMPL 2, 3; frame 11. INV `:394` and `:395` change (section 4.5).

**P5. The failure lines and the too-long line.**

| Case | Visible words | App key | Shown when | Source |
|---|---|---|---|---|
| no answer came | Couldn’t save your profile. Check your connection and try again. | `auth.profile.networkFailure` | `model.failure == .network` | COPY auth.profile.network (= `.networkFailure`); `ProfileScreens.swift:127` ("Check your connection" only when no answer came) |
| answer came and failed (503/429/other refusal, including a refused name) | Couldn’t save your profile. Try again. | `auth.profile.saveFailed` | `model.failure == .other` | COPY auth.profile.refused; R-01; CHECK 4.3 |
| name over 40 graphemes | Use 40 characters or fewer for your name. | new `auth.profile.tooLong` | `model.nameIsTooLong` | COPY auth.profile.tooLong; CC.authForm.profile; IMPL 3 |

- The too-long rule uses the existing model: `nameIsTooLong` (trimmed count above 40, `ProfileModel.swift:47`) and `canContinue` (`:51`). The name is never cut: no `onChange` truncation, no length cap on the field (IMPL 3, CC.authForm.profile; FQ70).
  No line for an untouched empty field (IMPL 3).
- `ProfileModel.Failure.words` (`ProfileScreens.swift:126-135`) is shared with `AgeScreen`, which gets its own `auth.age.network` and `auth.age.refused` in the age part (F-13); the profile keeps its two. Plan the split once.

**P6. A refused name.**
- Keep "Couldn’t save your profile. Try again." with no invalid border and the input kept. The delivered `auth.profile.nameRefused` ("Choose a name with visible characters and no line breaks or hidden formatting.") and its invalid border are not
  adopted until Claude Design rewords it to name the action (R-01, W-15, CHECK 4.3 and 8).
- X-19 says "In ProfileModel.swift: add a nameRefused failure from the API's refusal". No visible behaviour depends on it now: the API client already maps a 400 to `APIFailure.refused` (`TadayoAPIClient.swift:72`) and the model shows `.other`. The planner decides whether to add
  the case as a hook; if added, it must render the same line.

**P7. Name field placeholder.**
- Change: give the `TextField` a `prompt` of "Your name" in `secondaryText` (BM-02: "as CodeScreen does for its field", `SignInFlow.swift:117`). Frame 10: 17 pt #607067 at x34.
- Key: the words equal `auth.profile.nameLabel`; W-14 notes `auth.profile.placeholder` maps to the same H1 string as the label. See K (reuse the built key, note the mapping, per CHECK 8 "Keys"; BM-02 says "Add the key": section 6.14).
- The label must not be spoken twice (W-08): `LabelledField` makes the label the field's accessibility label (`:63`); verify what an empty field exposes with the prompt present (section 5).
- Keep `.textContentType(.givenName)`, `.textInputAutocapitalization(.words)`, `.autocorrectionDisabled()` (IMPL 3: "native name keyboard"). The frames' keyboard reads "next" (schematic, CC.precedence.native); the build's `.submitLabel(.continue)` stays (the sources are silent).

**P8. While saving.**
- Name field: read-only, first responder and keyboard kept, editing restored after a failure (CC.busyPrimary.field; IMPL 2 and 3; W-06: "read-only during requests without resigning focus"). `.disabled(true)` is not it (it can resign first responder).
  SwiftUI has no read-only text field and the sources name no technique (section 6.10).
- Add photo: `.disabled(model.isSaving)`. Leave sign-in: P1. (IMPL 3: "Add photo/Leave sign-in inactive".) The inactive look of a text action: `secondaryText` per `TextAction.swift:5-6`; no delivery draws it (the sources are silent).
- Continue: `.buttonStyle(.tadayoPrimary(isBusy: model.isSaving))` and `.disabled(!model.canContinue)` stay (`:114-115`); label stays "Continue", value "In progress" (S3).
- Announcement: "Saving your profile." (`vo.profile.busy`) once when the save starts, no repeat on re-render, focus not moved (COPY.announcementPolicy.busy). A retry after a failure is a new action. Add an app-catalog key; the post goes through `Announcement.post`.
- Frame: none (built from spec; INV `:51` keeps "built from spec" with the words from handoff 7).

**P9. Add photo and Optional.**
- Add photo stays inert in B0 with its label unchanged (FQ85, answered 5 November 2026: "Show them, doing nothing yet", `docs/QUESTIONS.md:358-361`). H1's "opens the native limited photo picker" (H1 `IMPLEMENTATION.md:48`) is B3's.
- Both go leading at the 20-point inset: Add photo with the full-width 44-point target ([20,325,353,44] in frames 10 and 27), Optional (13/18, `secondaryText`) directly under it. The avatar stays centred (rect x162.5 to 230.5 in every H7 frame).
  The group's `VStack` today centres all three (`:82-92`); give it leading alignment and centre only the avatar.
- Sources: VM-03 over F-07, X-25; CHECK 3 ("with Optional under Add photo as frames 10, 11 and 27 draw it") and 8. The critic's ruling names only the resend and Change email rows (section 6.6).
- Vertical gaps stay as built (P12).

**P10. The field itself.**
- A typed value longer than the field: the system single-line field scrolls horizontally; nothing to build (IMPL 3 last paragraph; C-03; NEEDS 31 answered). INV `:393` is rewritten (section 4.5).
- Field text inset: the frames draw 14, the build 16 with a documented reason (`Metrics.swift:62-65`); no source changes it.

**P11. Order of elements for VoiceOver (document order, IMPL 3).** Leave sign-in (nav bar), title (heading), helper line, avatar (hidden), Add photo, Optional, Your name field, the failure or too-long line, Continue. The failure block sits after the field in
the scroll content, so it reads before Continue.

**P12. Kept as built (do not change).**
- Gaps above the field: helper to avatar 32, avatar to Add photo target 8, Optional to label 24 (`ProfileScreens.swift:92`, `:86`, `:102`), label to field 8 (`LabelledField.swift:38`). F-23: keep handoff 1's gaps apart from the label's 8, which is already built.
  The H7 frames draw 21, 6, 10 (section 3.1); the check kept the earlier ones.
- Subtitle ink `secondaryText` (`SetupLayout.swift:54`), though the frame draws #182B25 (F-05, X-07, critic's ruling on W-05). `SetupHeading` is shared with A02-code's "Sent to", which the frames keep grey.
- Title 32/35, nav title inline, field min height 54, button min height 50, the field's `fieldInset` 16.
- AX5: content continuous; no hole (FM-01). Snapshots at AX5 stay the tall single-screen render; the frame's keyboard and scrolled viewport are known differences.
- Initial role size 28/34 (V-18, F-07); the frame draws 30.6.

### 4.2 Avatar

**A1. The initial rule.** Replace `Avatar.initial(of:)` (`Avatar.swift:69-74`) with a rule that returns an initial or nothing:
- Take the first visible grapheme cluster of the name after trimming (CC.avatarWithoutInitial.initialRule). It is an initial only if it is a Unicode letter in any script or a decimal digit; combining marks stay attached to their letter (the cluster is kept whole, "Élodie" gives "É").
- Emoji (including keycap, flag and joined sequences), symbols, punctuation, a mark with no base, and a letter whose glyph the font cannot draw give the person fallback; never derive from the email (A02 has no name before the account record).
- The name is live: the initial updates as it is typed (`Avatar(name: model.name, ...)` already is).
- Where the rule lives and how it is tested: section 5. The "unsupported/missing glyph" test needs CoreText and so is iOS-only; the letter, digit and emoji classification is pure.

**A2. The fallback glyph.** When there is no initial and no photo, draw SF Symbol `person` (outline) at 56% of the avatar (38.08, 20.16, 15.68, 10.08 points for 68, 36, 28, 18), on the fills the avatar already picks: canvas `avatarCanvas` with `onAvatarCanvas`,
cover `avatarOnCover` with `onAvatarOnCover`, both themes (CC.avatarWithoutInitial; IMPL 5; tokens exist, `Palette.swift:28-32`). The ratio is a new constant in `Metrics.swift` with its source in the comment (T44), as the neighbouring glyph
constants do (`Metrics.swift:42-45`, `:71-78`, `:89-96`). Fixed size at every text size, like the initial (`Avatar.swift:7-8`; handoff 4 `dynamicTypePolicy.avatarMarks`). The frame's position (4% above centre), "56%" as point size or glyph box, and
stroke weight are not fixed by the contract (section 6.16).

**A3. Where it shows.** Every `Avatar` (section 2.3): the profile, the no-club header, the highlight covers and rail, the folded card, the revealed item, the Lab. Every fixture name begins with a letter (`apps/ios/Tadayo/Lab/FixtureCast.swift:21-31`), so beyond A03's empty state only the Lab needs a new specimen: "Avatar with no readable initial"
on canvas and on a cover at 68, 36, 28 and 18, light and dark, as the sheet draws it (`LabView.swift:150-180`, `LabSection.avatars` at `:38`; references `Lab-avatars`, `-dark`, `-large`, `-xl`).

**A4. Accessibility.** The avatar stays decorative and hidden (`Avatar.swift:55`), which covers the new glyph, so VoiceOver never says "person" (CC.avatarWithoutInitial.a11y: "not the glyph name"). `vo.profile.emptyAvatar` ("No profile photo") stays unused: no contract
names the element or whether it is a label or a value (WM-04, CHECK 4.13). `testTheAvatarIsntRead` (`SignInSnapshotTests.swift:224`) stays true and gains an empty-name case.

**A5. Kept.** `Avatar.role(for:)` sizes (28/34, 16/20, 13/18, 9/11); the 1-point photo edge; photos unchanged; capitals as built (the sources are silent on case, section 6.8).

### 4.3 Pieces shared with sign-in (changes that A03 depends on; other parts own the rest)

**S1. `SetupScroll`.** No source change. Check that scrolling does not dismiss the keyboard (CC.authForm.AX5 "without dismissing keyboard"; IMPL 3): `ScrollView`'s default `scrollDismissesKeyboard` was not verified here. If it can dismiss, set `.never`
on `SetupScroll`, which also serves A02-email and A02-code.

**S2. `SetupFooter` and `SetupGap`.** Two bottom values (P3). The footer's top padding is 8 (`:71`); frames 11 and 20 end the scroll viewport 12 above Continue (clip rects [0,104,393,383] and [0,104,393,348], Continue at 499 and 464). No finding or
contract names it (section 6.12).

**S3. `PrimaryButtonFace` busy.** A03's Continue is busy while saving (`ProfileScreens.swift:114`). The delivery changes the shared button (D-13, X-15, W-06, CC.busyPrimary): a 16-point indicator 8 before the centred label in two fixed 24-point slots (the specimen: indicator centre
(133.38, 37), label from x149.38 in a button x20 to x373, so the slot is 16 plus 8); at large text, where the group does not fit, the indicator in its own centred row that the button reserves when idle too; `accessibilityValue` "In progress" while busy; the indicator hidden from
VoiceOver. Today: hidden leading and visible trailing `ProgressView`, label `maxWidth: .infinity`, no value (`PrimaryButton.swift:76-88`, `:106-108`). `vo.busy.value` belongs in the package catalog (it is looked up inside `TadayoDesign`, `DesignCatalogTests`); the per-screen
announcements belong in the app catalog. Owned by the shared-components part; A03 only needs the value and the announcement.

**S4. `announcing`.** Unchanged for failures (`SetupLayout.swift:82-89`). The busy announcement is a different trigger (when `isSaving` turns true) and the too-long line is a change of visible words, not of `failure`; a single "line shown" value for the screen
(failure words, or the too-long words) would feed `announcing` once (section 6.12).

**S5. `TextActionStyle`.** Leading alignment keeping the full-width 44-point target (X-25, VM-03; the sheet's text-action specimen, `precedence.existingSheet`). `TextAction.swift:22` (`.center`) and `:28` change. Effects on other screens, all re-snapshotted: A02-code's Change email
address (`SignInFlow.swift:137`) and Send a new code (`:194`), M01's Go to Home (`NoClubTabs.swift:83`), the Lab's text-action specimens (`LabView.swift:381`, `:385`), and A03's Add photo. The resend row's waiting and resending sentences are not text actions and
are the code part's.

**S6. `InlineError`, `LabelledField`.** No change for A03 (`isInvalid` stays unused here).

**S7. `ProfileModel` and `RootModel`.**
- `canLeave` (`!isSaving`) is optional: `SignInModel.canChangeEmail` is the precedent for a model-side flag; a view-side `.disabled(model.isSaving)` is enough for the sources, and `RootModel`'s epoch guards (`RootModel.swift:233-238`) already ignore a save that finishes after Leave.
- No new `Failure` case is needed for the lines in P5.

**S8. Keys.** Section 4.4.

### 4.4 Strings (K)

| H7 key | Words | Action in the app catalog | Source |
|---|---|---|---|
| `auth.profile.nav` | Your profile | keep `auth.profile.navTitle`; comment the mapping | CHECK 8 "Keys" |
| `auth.profile.title` | What should we call you? | keep | same |
| `auth.profile.body` | A name your friends know. | keep `auth.profile.subtitle`; comment | same |
| `auth.profile.photo` | Add photo | keep `auth.profile.addPhoto` (comment says "inert in B0 (FQ85)") | same |
| `auth.profile.optional` | Optional | keep | same |
| `auth.profile.label`, `.placeholder` | Your name | keep `auth.profile.nameLabel` for both, or add `auth.profile.placeholder` (BM-02 "Add the key"); W-14: both map to H1 `[A03-profile][8]` | section 6.14 |
| `auth.profile.primary` | Continue | keep `auth.profile.continue` | CHECK 8 |
| `auth.profile.network` | Couldn’t save your profile. Check your connection and try again. | keep `auth.profile.networkFailure`; comment | same |
| `auth.profile.refused` | Couldn’t save your profile. Try again. | keep `auth.profile.saveFailed`; update its comment ("A02-age's line until handoff 7") | same |
| `auth.profile.tooLong` | Use 40 characters or fewer for your name. | add | X-19 |
| `auth.age.leave` | Leave sign-in | keep | R-07 |
| `vo.profile.busy` | Saving your profile. | add (app catalog) | W-06 |
| `vo.busy.value` | In progress | add to the package catalog with a `String(localized:, bundle: .module)` lookup in `PrimaryButtonFace` | `DesignCatalogTests` |
| `auth.profile.nameRefused`, `vo.profile.emptyAvatar` | | not used (R-01, WM-04) | |
| `auth.profile.photoNetwork`, `.photoRefused`, `.retryPhoto` | | not used: Add photo does nothing in B0 (FQ85); B3's | IMPL 3 |

Also: the copy lint runs on every string file (T41 to T43). The vo failure keys are the visible words (COPY.announcementPolicy), so no separate strings.

### 4.5 Docs, inventory and questions that this part touches (D)

- `design/reference/INVENTORY.md`: `:49` `A03-profile` becomes received, source "Handoff 7" with handoff 1 in brackets (frame 27 redraw; CHECK 8 "Inventory"); `:50` `A03-profile-empty` received 7 (frame 10; the row's words: person glyph, focused, placeholder, X-33); `:52`
  `A03-profile-failed-network` received 7 (frame 11; the line is under the field); add `A03-profile-empty-xl` received 7 (frame 20; one of the five new rows); `:51` `-saving` and `:53` `-refused` stay "built from spec" with their words now from handoff 7;
  `:54` `-name-too-long` gets its line and place; add `A03-profile-name-refused` as a new "built from spec" row (X-33; it draws as `-refused`); recount the header counts. `:304` ("People appear only as initials") gains the person symbol; `:305` and `:318` are about the fallback colours (1.1 answers them).
  Known differences: `:385` (A02-age chevron and "A03-profile has none" are replaced by the leading Leave sign-in on both), `:388` (the 44 and the new 12), `:393` (C-03: handoff 7 answers needs item 31; keep "without truncating names" for labels and the destination line), `:394` (A03's failure is now under the field), `:395` (delete: the fallback is delivered), `:396` (name-refused
  still drawn as refused until a reworded line). Add: frame 20's 166-point band (FM-01); body ink kept (X-07); the frame's glyph at 30.6 and high (V-18); the 16 versus 12 gap (F-08); the toolbar item against the frame's plain text at x20; the schematic "next" return key; A03's arrival focus skipped under VoiceOver (C-01); the refused-name line kept (R-01).
- `design/reference/screens/`: replace `A03-profile.png` with frame 27, add `A03-profile-empty.png` (10), `A03-profile-failed-network.png` (11), `A03-profile-empty-xl.png` (20), rendered from handoff 7 (ADR-027, "Repository layout" in `CLAUDE.md`); the earlier file stays in `handoff-1/frames/`. The contact sheets pair a snapshot with `screens/<state>.png`
  (`tools/ci/ios_steps.py:146`, `:346-363`), so the `-xl` snapshot pairs with the new file.
- `docs/QUESTIONS.md`: FQ69 (`:322`) record the leading Leave sign-in with no alert, the age kept on the server; retention is still to be proposed (X-34); FQ70 (`:328`) record the too-long words and that the refused-name line waits for a rewording (X-34);
  add FQ93, "Does Leave sign-in keep the address you typed?" (CHECK 5 A; default an empty field; needed by B0; its preface at `:431` says it comes with this slice). FQ85 (`:358`) unchanged.
- The next brief (not this slice, CHECK 7): which part of the profile says "No profile photo"; the text actions on the left with a centred photo circle; frame 20 with continuous content; the field-to-error gap the frames draw; the refused name's line with the action first; the person glyph's position.

## 5. Tests and snapshots

Verification reality: this session has no Xcode. `TadayoCore` tests run on Linux (`swift test --package-path packages/swift/TadayoCore`); everything in `TadayoDesign` and the app compiles and is judged only on the `ios` workflow (snapshots, hosted VoiceOver checks, UI tests).

**Linux (`TadayoCoreTests`)**
- `ProfileModelTests`: existing tests stay valid (a refused name is `.other` and keeps the name, `:180`; over-40 waits and is not cut, `:131`). Add only for a new model surface: `canLeave` if added (inactive while a save runs, active after a failure), a `nameRefused` case if added (same visible line).
- The Avatar rule, if its pure part is in `TadayoCore` (section 6.7): a table test. Fixtures from the contract's own words: "Ben" gives B; "élodie" and the decomposed "e" plus U+0301 give É; "3D" gives 3; an Arabic-Indic digit gives that digit; "日本" gives 日; "Ørjan" gives Ø; an emoji (U+1F600), keycap "1" plus U+FE0F plus U+20E3, a flag, a joined family, "-", "(", "@", "", "   ", a lone U+0301 give no initial. Expected values the sources do not fix are marked in section 6.7 (superscript "²", roman numeral "Ⅷ", a leading U+200B).
- `RootModelTests`: no A03 change unless FQ93 is answered the other way.

**Snapshots (`SignInSnapshotTests`, harness `ScreenSnapshot.assert`; every state light, dark, `-xl`)**
- Change: `snapProfile` passes `focus: true` and `leave: {}`; `testEachTitleIsAHeading` (`:176-184`) builds `ProfileScreen` with `leave`.
- References to re-record: the 18 `testA03*` PNGs (6 states times 3). Contents: `A03-profile` (typed "Ben", focus ring, Leave in the bar, Add photo and Optional leading), `A03-profile-empty` (person glyph, placeholder, Continue unavailable), `-saving` (name kept; Add photo and Leave dimmed; busy
  Continue with value), `-failed-network`, `-refused` (line under the field, border normal), `-name-too-long` (line under the field, Continue unavailable). The `-xl` variants stay the tall single-screen render.
- New: `Lab-avatars*` (the fallback specimens), `Lab-actions*` (leading text actions), and every screen using `TextActionStyle` (A02-code, M01-no-club). The snapshot cannot draw the keyboard or a scrolled viewport (`ScreenSnapshots.swift:8-10`), so frames 10, 11, 20 and 27 compare
  by content order, gaps and colours only. A02-age references change in the age part.
- Record what differs from each frame in the PR (CLAUDE.md, "How you work" step 3) and in INV known differences.

**Hosted VoiceOver checks (`AccessibilityElements`, `SignInSnapshotTests`)**
- A03 element order and names: Leave sign-in (button), title (header), helper, Add photo (button), Optional, Your name (field, label once), Continue (button); no element for the avatar, the initial or the glyph (extend `testTheAvatarIsntRead`, add an empty-name and an emoji-name case). The tool exposes label,
  hint, traits, value, custom actions (`AccessibilityElements.swift:23-34`): use `value` for Continue's "In progress" and `traits` for `.notEnabled` on Add photo and Leave while saving.
- `testTheAgeScreensBackIsLeaveSignIn` (`:218`) expects 2 "Leave sign-in" elements; it becomes 1 on `AgeScreen` and gets an A03 twin.
- VoiceOver cannot be on in these tests (automation is not VoiceOver), so the arrival-focus exception is not testable here; see 6.1.

**UI tests (`SignInUITests`, DEBUG fakes in `apps/ios/Tadayo/App/UITestLaunch.swift`)**
- `testLeavingSignInFromTheAgeScreenStartsAgain` (`:144`): the footer-button half goes; the nav-bar button stays (`navigationBars["Sign in"].buttons["Leave sign-in"]`). Add an A03 twin: reach the profile, tap Leave sign-in, the email field is empty (FQ93 default).
- Arrival focus: on A03 type without a tap (as `:24` and `:64` do for email and code); `signInToTheTabs`'s `name.tap()` becomes unnecessary.
- Keyboard gaps: Continue's bottom 12 above the keyboard's top, and 44 above the safe-area bottom with no keyboard. Needs a software keyboard on the CI simulator (unverified; a hardware keyboard hides it).
- Failure and saving states need fakes that fail or hang: `FakeAccounts.update` always succeeds (`UITestLaunch.swift`), so a new launch mode (DEBUG only) is needed to assert that the failure line stays reachable above Continue with the keyboard up and that the field ignores typing while saving.
- Device-only checks to list for the founder (CLAUDE.md "Environment"): VoiceOver on A03 (no focus steal, one "Saving your profile." announcement, the failure read once, the too-long line, Add photo and Leave dimmed), Switch Control, the keyboard gap with and without a hardware keyboard.

**Catalogs:** `DesignCatalogTests` must still pass: `vo.busy.value` only in the package catalog and looked up with `bundle: .module`; the new app keys only in the app catalog.

## 6. Ambiguities, silences and disagreements

Where the sources are silent, the proposed default is the safest reversible reading; flag each in the PR (CLAUDE.md, "When the sources are silent or disagree").

1. **VoiceOver and arrival focus.** C-01 conditions A03's focus on VoiceOver; F-11, X-19, V-11 and VM-02 say unconditional; IMPL 3 says "focused on arrival ... at default and largest text sizes"; CC.authForm.profileArrivalFocus has the condition. C-01 reconciles them (the check relied on it). Only
   VoiceOver is named; Switch Control and other assistive technologies are not (`UIAccessibility.isSwitchControlRunning`): silent. The condition cannot be injected in a hosted test, so a screen parameter or a closure is needed to test it (planner's choice). "Announce screen" has no key; the title heading and the
   navigation title are what VoiceOver finds.
2. **X-19 against R-01.** X-19 says add a `nameRefused` failure; R-01, W-15, CHECK 4.3 and 8 say keep "Couldn’t save your profile. Try again." with no invalid border. Net visible behaviour equals `.other`. The sources do not say whether the hook is wanted (P6).
3. **Body ink.** Frames draw the helper in #182B25; the app keeps `secondaryText` (X-07, F-05, critic's ruling on W-05: the redraws disagree with each other and "Sent to" stays grey). Optional stays `secondaryText` (frames agree).
4. **Field-to-error gap.** Frame 11 draws 16 (line box top 362 under a field ending 346); FIND F-08 lists 5, 8 and 16 across frames; CC.spacing.fieldErrorGap is 12. The app builds 12 (CHECK 4.6).
5. **Frame 20's 166-point band** (FM-01) against "keep content continuous" (CHECK 4.12): the frame is schematic (xlReference: label 44, field text 53, Continue label 50, "no font caps in production", CC.authForm.AX5). Asked of Claude Design in the next brief.
6. **Text-action alignment on A03.** F-07 recommended keeping Add photo and Optional centred; VM-03, X-25 and CHECK 3 and 8 say leading with the avatar centred, "VM-03 over F-07", while "the critic's ruling names only the resend and Change email rows". The sheet's text-action specimen is the
   current source (CC.precedence.existingSheet). Also silent: the avatar-to-Add-photo gap (frame 6, handoff 1 about 13, main 8) is not named by any contract; the check keeps main's. Toolbar text role: the frame draws Leave sign-in at 16 pt (`textAction`) at x20 in #284CDB (the `action` token, which the stack's
   `.tint(Palette.action)` gives bar buttons, `ProfileScreens.swift:122`); whether to apply `.textRole(.textAction)` to a native toolbar label, and how iOS 26's glass capsule looks against the plain frame, are not specified (CC.precedence.native: platform-owned) and not verified here. Disabled bar button look: system.
7. **Initial rule edge cases** (CC.avatarWithoutInitial.initialRule):
   - "Unicode letter": General_Category L* (Lu, Ll, Lt, Lm, Lo), or Swift's `Character.isLetter` (my recollection is that it follows the Alphabetic property, which also takes roman numerals and some marks; not verified on a toolchain). "Decimal digit": Nd, not `isNumber` or `isWholeNumber` (superscript digits, fractions, circled numbers).
   - "First visible grapheme after trimming": trimming is whitespace and newlines today (`Avatar.swift:70`); whether leading invisible format characters (U+200B and the like, which FQ70 lets sit between visible characters) are skipped or end the rule is not stated.
   - Digits and `#` and `*` carry the Unicode Emoji property and start keycap sequences ("1" plus U+FE0F plus U+20E3): the intent ("emoji ... use person fallback") implies the whole cluster is judged, not the first scalar; the mechanism is not stated.
   - "Unsupported/missing glyphs": needs a glyph-coverage test (CoreText, iOS only); the sources do not say which font (the system font with cascade) or what counts as missing.
   - A lone combining mark, a letter-number (Nl) and other-number (No) have no stated outcome; the default above is fallback for all three.
8. **Capitals.** Neither the book, the spec nor the contract says initials are capitals; the build uppercases (`Avatar.swift:73`) and the frames show "B" from "Ben". `uppercased()` can turn one letter into several ("ß" to "SS", ligatures); handoff 7 does not touch this. Keep as built and test "ß" once.
9. **Keyboard detection for 12 versus 44.** The sources give two gaps and no signal. Focus alone is wrong with a hardware keyboard; keyboard notifications or the safe-area inset are options. The snapshot harness draws no keyboard (so 12 is not snapshot-testable without an injected value), and the UI route needs a software keyboard. SwiftUI's `safeAreaInset` already sits above the keyboard.
10. **Read-only while saving.** Required behaviour: read-only, first responder and keyboard kept, editing restored after failure (CC.busyPrimary.field). Technique not given. Candidates (unverified on a device): a `Binding` whose setter ignores input while `isSaving`; `.disabled` (may resign first responder, which the contract forbids); `.allowsHitTesting(false)` (does not stop the keyboard). Pick by a UI test that types while saving.
11. **Reveal on failure.** "The body scrolls to keep the field and error reachable above Continue; it does not dismiss the keyboard" (IMPL 3). No offset or algorithm; frame 11's 128 is not derivable (section 3.1). Candidates: an explicit scroll to the block (`ScrollViewReader`) or the system's keyboard scrolling; unverified here. The block is below the fold at the default size with the keyboard up (the content is taller than the visible area above Continue).
12. **Small unspecified points on this screen.**
    - Too-long line: the border (the contract's list of destructive-border cases omits it, so the default is normal border plus ring), how it is announced as the 41st character is typed (priority; `announcing(politely:)` exists), and which line shows when a stored save failure is still on screen and the name then becomes too long (default: one block, the too-long line while it is true).
    - Footer: the scroll viewport ends 12 above Continue in frames 11 and 20; main's footer top padding is 8.
    - The failure icon is 14 pt in the frame; `InlineError` draws `exclamationmark.circle` at the metadata size (handoff 2's reading).
13. **Leave sign-in and unsaved input** (CC.ageExit.reason: "Unsaved name and photo remain only in the restricted setup view while exit fails; purge them on successful exit/account switch"). `RootModel.endSession` drops the profile at the start of Leave (`:129-134`), which is stricter, and the failure screen has no way back to the profile, so there is no visible difference.
14. **Key naming.** BM-02 says "Add the key" for the placeholder; CHECK 8 "Keys" says keep the built key where the words repeat; W-14 says the placeholder maps to the label's H1 string. Proposed: reuse `auth.profile.nameLabel`, comment the mapping.
15. **Address after Leave sign-in.** IMPL 2 and CC.ageExit.return keep the address; WM-01 and BM-03 adopt it; R-06 and the critic's rulings send it to the founder (FQ93); the app keeps an empty field and the UI test asserts it (`SignInUITests.swift:144`). The shared `RootModel` is unchanged.
16. **Glyph geometry.** "56% of 68, 36, 28 or 18 points" can mean the symbol's point size or its drawn box; the specimen draws a 24-unit glyph scaled to 0.56 times the diameter and 4% of the diameter above the circle's centre (section 3.1); the native symbol's ink at the same point size differs and was not measured here. Prior glyphs were sized to "the size whose glyph matches the drawn one"
    (`Metrics.swift:71-78`, `:89-96`) and lock/star at a stated point size (`:42-50`). Centring, position and stroke weight (regular, as every symbol here) are the planner's to settle against the sheet on CI; log it as a difference.
17. **Return key.** Frames draw the keyboard's return key as "next" (SC visibleStrings), schematic; the build's `.submitLabel(.continue)` matches the action. Silent.
18. **Age failures share `Failure.words` today.** The age part must split them; the profile part must not change the profile's two lines.
19. **Inventory wording to watch.** INV `:395` ("as no account-safe fallback is delivered") and `:396` become false once the slice lands; INV `:50`'s "the field isn't focused on arrival" also.

## 7. Cross-references to other parts of the slice (not mapped here)

A02-age (the same Leave sign-in, its own failure lines, footer 44, subtitle gap 24: F-10, F-13, X-18, WM-02, BM-04, F-22); A02-email and A02-code (placeholder "Email address", signed-out notice, resend block, Verify code above the keyboard only where hidden, leading rows: X-16, W-10, X-17, W-07, F-12, V-02, V-03, F-09); the busy button (S3); root loading and leaving screens (X-21, W-09); `RootFailure` (X-22); the no-club header and tabs.

## 8. Files read

Code: `apps/ios/Tadayo/SignIn/ProfileScreens.swift`, `SetupLayout.swift`, `SignInFlow.swift`; `apps/ios/Tadayo/App/TadayoApp.swift`, `UITestLaunch.swift`; `apps/ios/Tadayo/Lab/LabView.swift`; `apps/ios/Tadayo/Tabs/NoClubTabs.swift`; `apps/ios/Tadayo/Localizable.xcstrings`;
`packages/swift/TadayoDesign/Sources/TadayoDesign/{Metrics,TypeRole,Palette}.swift`, `Components/{Avatar,TextAction,InlineError,LabelledField,PrimaryButton,PinnedFooterLayout}.swift`, `Localizable.xcstrings`; `packages/swift/TadayoCore/Sources/TadayoCore/{ProfileModel,Account,RootModel,SignInModel}.swift`;
`packages/swift/TadayoAPI/Sources/TadayoAPI/TadayoAPIClient.swift`; tests `apps/ios/TadayoSnapshotTests/{SignInSnapshotTests,ScreenSnapshots,AccessibilityElements}.swift` and `__Snapshots__/SignInSnapshotTests/testA03*.png`, `apps/ios/TadayoTests/DesignCatalogTests.swift`,
`apps/ios/TadayoUITests/SignInUITests.swift`, `packages/swift/TadayoCore/Tests/TadayoCoreTests/ProfileModelTests.swift`.
Sources: `docs/design/handoff-7/check/handoff-7-check.md` and `handoff-7-findings.md`, `docs/design/handoff-7/handoff-7-brief.md`, `ios-lane-needs.md`; H7 `IMPLEMENTATION.md`, `component-contracts.json`, `copy-contracts.json`, `screen-copy.json`, `frame-manifest.json`,
`component-sample-index.json`, `fixture-values.json`, `frames/A03-*.svg` and `.png`, `frames/brand-components.svg`; H1 `IMPLEMENTATION.md` and `frames/A03-profile.svg` and `.png`; `design/reference/INVENTORY.md`; `docs/QUESTIONS.md`; `docs/INVARIANTS.md` T43, T46, T47; `docs/tadayo-build-spec-v3.md` lines 558, 562, 602;
`tools/ci/ios_steps.py`. SVG measurements were taken with a throwaway parser kept outside the repository.
