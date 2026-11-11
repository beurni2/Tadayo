# tests: the test and snapshot surface for adopting handoff 7, and how to split the slice into pull requests

> Appendix to `docs/plans/ios-b0-adopt-handoff-7.md`, written on 11 November 2026 for the ios thread's plan from `main` at `a569278` (the code its line numbers cite). **Where it and the plan disagree, the plan wins**: its section 3 lists the corrections. Its scratch scripts were throwaway and are not kept.

Key `tests` of the map for the slice that adopts handoff 7 for the screens on `main` (journal block 1.3, Next step 3; check section 8, first list; INVENTORY X-33; QUESTIONS X-34). Read-only: nothing under the repository was edited, committed or pushed. Code as of `main` a569278 (branch `ios/b0-source-files`, same code). Lane ios.

## 0. Scope, sources and how to read this

- **What this report covers:** every test and snapshot reference these screens touch (sign-in A02, the profile A03, the root's start-up, wait and failures, the header before a club, the tabs with no club, and the Lab specimens they share); how the `ios` workflow runs and records them; how handoff 7's 30 frames pair with snapshots; the tests the slice has to add or change; and a split into pull requests.
- **Cite forms.** `path:line` is the repository at a569278. "Check section n" is `docs/design/handoff-7/check/handoff-7-check.md`; finding ids (F-, W-, R-, X-, V-, D-, C-, BM-, FM-, RM-, VM-, WM-) are in `docs/design/handoff-7/check/handoff-7-findings.md`. "CC" and "CP" are `component-contracts.json` and `copy-contracts.json` in `design/reference/claude-design/handoff-7/` (CP's `handoff7` keys are flat, dotted: `auth.email.placeholder`). "Frame n" is the order in that folder's `frame-manifest.json`. "Peer parts" are `signin.md`, `profile.md`, `root.md` and `records.md` in this folder; I skimmed them (read-only) so the names of new states and tests below match theirs, because contact sheets pair by name.
- **Ground truth for the existing counts** is CI's own record of `main` at a569278, on the unmerged `evidence` branch: `main/a569278/ios/logs/test.log`, `test-summary.json` and `run.json` (Xcode 26.6, Swift 6.3.3, iOS 26.5, iPhone 17). It ran 113 tests, all passing: 65 in `TadayoSnapshotTests` (43 s), 43 in `TadayoTests` (14 s), 5 in `TadayoUITests` (106 s). My greps of the source give the same numbers.
- **Predictions are predictions.** Nothing here compiled or ran (no Xcode in this session). "Predicted to change" says what the written contracts imply; CI's `changed` list is the authority, and a reference that changes without a reason named here is a regression to explain, not to bless.
- **The code never designs (T46) and never invents copy.** Where a source is silent or two disagree, section 9 says so and gives the smallest reversible reading, as a suggestion for the plan.

## 1. Answer first

- **The surface today:** 113 tests on the `ios` workflow (65 + 43 + 5); 187 snapshot references (SignIn 75, Root 15, Tabs 39, Lab 58; 43.8 MB); `TadayoCore`'s Swift Testing suites, which run on Linux in `ci` (SignInModelTests 16, ProfileModelTests 12, RootModelTests 28, and the unaffected rest).
- **The 30 frames:** 29 are screens and 1 is the component sheet (frame 17, 2400 by 51552 px). 28 of the 29 screens pair with a snapshot state that exists today (counting its `-dark` and `-xl`); frame 24 (`A02-code` with 529614 typed) pairs with none and needs a new state, `A02-code-typed` (records D1). Three more states have no frame and need a new test and a `built from spec` row: `A02-email-signed-out`, `A02-code-error-resend-failed-network`, `global-leaving`.
- **References:** about 133 of the 187 are predicted to change and about 13 are new (about 146 distinct files, section 4.3); 31 of the 177 writes re-write a file an earlier PR already wrote, because a shared component (the busy button, the text action) changes in one PR and its other consumers in a later one. No other reference is expected to move: the Lab's cards, drops, revealed, highlights, receipt, plaque, type, colours, photos and fields.
- **Where each proof can live:** the models, the Avatar's initial rule and every "which words, once" decision can be pure and tested on Linux (fast, no macOS minutes); layout, ink and order only in snapshots; announcements, focus, the keyboard gaps, the Verify pin and the launch hand-over only on a device (section 10). Every new VoiceOver check placed in a `*SnapshotTests` target skips on the iOS 18.6 and 17.5 runs (`ios_steps.py:143`); the UI tests and `TadayoTests` do not.
- **Split (section 8), six PRs, sequential:** (1) records and frames, no code; (2) the root's wait, leaving and failures; (3) A02-email and A02-age with the busy button, the read-only fields and Leave in the bar (and the shared test seams); (4) A02-code with the leading text actions; (5) A03 and the Avatar; (6) the header and the tabs, closing the slice. Sizes about 0, 300, 600, 540, 460 and 330 hand-written lines (tests included, about 45 percent of them), with 0, 18, 31, 61, 22 and 45 reference PNGs (PR 1 carries 29 frames and the sheet instead). PRs 3 and 4 are over the 400-line target (`docs/GITHUB.md:154`, "ideally"); a named fallback split for PR 3 is in section 8.
- **Cost:** each `ios` run is about 15 macOS minutes of the roughly 300 a month included (`docs/TECH-DESIGN.md`, "Batch pushes"). At 5 runs a PR (code, references, a re-run, iOS 18.6, iOS 17.5) the slice is about 30 runs, 350 to 450 minutes: over the month's allowance by about 150 minutes at $0.06 (about $9), unless pushes are batched.
- **Needs a decision before the plan is written (section 9):** where the new VoiceOver tests live (compat coverage); `A02-code-typed` or notes only; whether to build a DEBUG launch mode that hangs a request (the only automated proof of read-only fields); whether pure layout decisions (the Verify pin, the busy group's fit, the footer's 12 or 44) go in `TadayoCore`; whether to stage the text action's alignment to avoid the 21 double-taken references.

## 2. CI facts that shape the tests

### 2.1 `ci` (required, Linux)

- Runs on every push except to `evidence`, with no `pull_request` trigger (`docs/TECH-DESIGN.md:291`). Jobs (`.github/workflows/ci.yml`): `node` (line 24; its steps include `copy-lint`, line 43), `postgres` (48), `swift` (86), `tools` (98), `guards` (110), and the `ci` verdict (123).
- **`swift` job** runs `python3 tools/ci/ci_steps.py swift`, which for each Swift package whose manifest exists does `docker run --rm -v <root>:/work -w /work <pinned swift image> swift test --package-path <package>` (`tools/ci/ci_steps.py:477-488`). So `TadayoCore`'s and `TadayoAPI`'s tests run on Linux on every push. `TadayoDesign` has no test target and, like the app, compiles only on the `ios` workflow (`CLAUDE.md`, "Environment").
- **`tools` job** runs the Python tests of `tools/ci/`, including `ios_steps_test.py`, whose `test_the_inventory_s_states` (`tools/ci/ios_steps_test.py:843-848`) reads the real `design/reference/INVENTORY.md` and fails if `F02-upcoming` or `H01-open-dark` stop being states, if `brand-tokens` becomes one, or if there are fewer than 149. A row whose second cell is not one backticked name is not a state (`ios_steps.py:331-343`), so every inventory edit has to keep that shape.
- **`guards` job** (skipped on `main`): `ci_config_guard.py` (T58), `journal_check.py --branch`, and the ratchet (`ci_steps.py:490-495`). This slice needs no change to `tools/ci/`, `.github/` or `.claude/`, so no CI-configuration PR (T58): the contact sheets, the inventory reader and the compatibility skip all work for the new states as they are.
- **Copy lint** (`node` job) reads every `.xcstrings` file; `auth.code.sentTo` is the one named exception to T41's ban on "sent" (`packages/domain/src/copy/cli.test.ts:33`, `exceptions.test.ts`; the exception is tied to file, key and value). New keys must avoid the word "sent", since the lint reads keys too (`docs/plans/ios-slice-11-second-part.md`, "Copy"), and the app keeps `auth.code.sentTo` where the delivery's `auth.code.destination` repeats its words (check section 8, "Keys"; records D7).

### 2.2 `ios` (macOS, not a required check)

- **Triggers** (`.github/workflows/ios.yml:8-17`): a push to any branch but `evidence` that changes `apps/ios/**`, `packages/swift/**`, `packages/contracts/**` or `design/reference/**`, and `workflow_dispatch` with an optional `ios_version`. So a records-only PR (frames, `INVENTORY.md`) starts a full macOS run, and so does a `TadayoCore`-only PR. A newer push cancels the branch's running one (`cancel-in-progress` is true off `main`, `ios.yml:33-35`).
- **Jobs:** `gate` (Linux), `build` (`macos-26`: toolchain pin, XcodeGen, simulator, build, test, collect), `evidence` (Linux: ImageMagick, sheets, publish). Pinned Xcode 26.6 and Swift 6.3.3; the simulator is the newest installed iOS no newer than the Xcode's SDK, on `iPhone 17` (main's run: iOS 26.5). `xcodebuild build-for-testing`, then `test-without-building` of scheme `Tadayo` (Debug), whose tests are `TadayoSnapshotTests`, `TadayoTests` and `TadayoUITests` (`apps/ios/project.yml:196-209`).
- **Record mode is `never`** (swift-snapshot-testing 1.19.7, `exactVersion` at `project.yml:56-58`): a snapshot with no committed reference fails. The `test` step fails first if a Swift file under `apps/ios` sets a record mode, and after the tests if the run wrote a reference all the same (`ios_steps.py` docstring, "test"). CI never records (`docs/TECH-DESIGN.md:69`).
- **Evidence:** `<branch>/<short-sha>/ios/` on the unmerged `evidence` branch (`ios-full/` for a run by hand with no `ios_version`, `ios-<version>/` for a compatibility run): `index.md`, `run.json`, `logs/` (`test.log`, `test-summary.json`, `build.log`), `snapshots/` and `sheets/`. `snapshots.json` gives each snapshot a `state` (the text after the file name's first dot) and a status: `committed` (matches), `changed` (drawn and different from its reference), `new` (drawn, no reference; swift-snapshot-testing attaches it and `collect` exports it) (`ios_steps.py:106-114`).
- **Contact sheets** (`docs/DESIGN-HANDOFF.md`, "Snapshot comparison"): per state, the render on the left (`design/reference/screens/<state>.png` wins over `2.1/<state>.png`: `render_for`, `ios_steps.py:346-356`), the committed reference in the middle when this run's differs, this run's snapshot on the right. A state with no render shows the snapshot alone with a note: "built from spec, awaiting render" for an inventory state, "judged against book p26" for a `-dark` or `-xl` whose base state is in the inventory and which has no file of its own, "not a state in INVENTORY.md" otherwise (`no_render_note`, `ios_steps.py:358-364`). A push carries only the states it touches: `select()` (`ios_steps.py:458-475`) takes an entry that is `changed` or `new`, whose reference changed in the branch, or whose `screens/<state>.png` or `2.1/<state>.png` changed in the branch. A run by hand with no `ios_version` carries all of them (for gates).
- **Practice, not a written rule:** the lane's PRs end with two green `ios` runs at the final head (the second a re-run, to show the references are stable), `ci`, and the iOS 18.6 and 17.5 dispatches, then the founder's approval (journal entries of 2026-11-07, for example the 12:14 UTC one on `ios/b0-drop-card`).

### 2.3 The iOS 18.6 and 17.5 dispatches

- `workflow_dispatch` with `ios_version` set to `18.6` or `17.5` downloads that runtime if the runner lacks it and runs the scheme's tests **except every target whose name ends `SnapshotTests`** (`SNAPSHOT_TARGET_SUFFIX = "SnapshotTests"`, `ios_steps.py:143`; the `-skip-testing` at `ios_steps.py:889`), because snapshots are taken on the newest iOS (`docs/TECH-DESIGN.md`, section 8). They carry no sheets, only logs (`ios-18.6/`, `ios-17.5/`). The device is the newest "iPhone <n>" the runtime supports: the last pair of runs on `ios/b0-drop-card` at `57bc29c` used an iPhone 15 on 17.5 and an iPhone 16 on 18.6 (evidence `ios/b0-drop-card/57bc29c/ios-17.5/run.json`, `ios-18.6/run.json`), against the iPhone 17 of the newest run.
- **So on 18.6 and 17.5 only `TadayoTests` (43) and `TadayoUITests` (5) run:** 48 tests, passing, in 101 s (17.5) and 110 s (18.6) of test time in that pair (`logs/test-summary.json`). `project.yml:163-168` says so: the hosted unit tests "also run on the iOS 17 and 18 compatibility runs". Anything the slice wants proven on older iOS must be in one of those two targets. `LaunchScreenTests` already carries an iOS 17 workaround (`Color.resolve(in:)` where `UIColor(Palette.canvas)` kept the light value in dark on iOS 17: `LaunchScreenTests.swift:6-12`).
- **The compat runs already cover** the keychain, launch, the drop card's spoken labels (via the in-process reader), `DesignCatalogTests` and the five UI tests. **They do not cover** any of the 59 snapshot and VoiceOver tests of the three screen families (SignIn 31, Tabs 20, Root 8; 16 of them VoiceOver readings), which sit in `TadayoSnapshotTests` (section 5).

### 2.4 How a reference is taken

1. Push the code. The `ios` run goes red: each changed or new snapshot fails (record mode never) and its image is exported to `evidence`.
2. Read each image beside its frame and the contracts (the contact sheet). A reference is taken **only when the screen matches its render and the contracts**, and the PR shows the before and after (`docs/TECH-DESIGN.md:70`; `CLAUDE.md`, "How you work" 3). A difference from the render that the check keeps on purpose (a "Known difference") is recorded in `INVENTORY.md` and the PR.
3. Copy the PNG from `evidence` into `apps/ios/TadayoSnapshotTests/__Snapshots__/<Class>/<test>.<state>.png` (names in section 4), commit it with the code that moves it (`docs/GITHUB.md:156`), push; the next run is green when every reference matches. Each commit carries its journal entry.

### 2.5 What a snapshot can tell

- Tolerance: `perceptualPrecision: 0.98` with the library's default `precision` of 1.0 (`ScreenSnapshots.swift:76`). Every pixel must be within 2 percent perceptual difference, so a one-point shift of any element fails and a colour change under that threshold passes. Ink choices the check keeps against a frame (for example `secondaryText` where a frame draws `primaryText`, X-07, F-05) are therefore pinned by the rulings and the inventory, not by a snapshot.
- Frame: 393 by 852 points at 2x in sRGB, safe areas 59 top and 34 bottom (`FramedHost`), drawn in the host's key window (`drawHierarchy`) because iOS 26's bars draw through effects a layer render leaves out. **No keyboard and no status bar** (T45). `-xl` is a 393 by 2200 phone at accessibility 5 with the whole screen laid out down the image and the pinned action at its foot (a taller window rendered empty: `docs/LIMITATIONS.md`). So a frame drawn with the keyboard up or scrolled (1, 10, 11, 19, 20, 22, 27) is compared by content, order, gaps and colours, never pixel for pixel (`ScreenSnapshots.swift:8-22`).
- The busy button's `UIActivityIndicatorView` is held still by swizzling `startAnimating` (`Spinners`, `ScreenSnapshots.swift:138-190`). `Spinners.check` fails if an indicator turned, and **fails a state flagged `busy: true` that holds no indicator**; a state flagged `busy: false` is not required to hold none. So a busy state is only proven if its test passes `busy: true`.

### 2.6 Cost

About 15 macOS minutes a run; roughly 300 included a month (`docs/TECH-DESIGN.md`, "Batch pushes"); about $0.06 a minute over. The estimate at the end of section 1 is from this figure, not measured as a whole: the evidence records only the test phase (about 185 s for the newest run, 101 to 110 s for a compat run: sections 1 and 2.3), not the job's total including the simulator, XcodeGen and build.

## 3. What exists today

### 3.1 `TadayoCore` (Linux; Swift Testing; `swift test --package-path packages/swift/TadayoCore`)

Files in `packages/swift/TadayoCore/Tests/TadayoCoreTests/`.

**`SignInModelTests.swift`** (16; `@MainActor @Suite`; fixtures `FakeAuth`, `ManualContinuousClock`, `Gate`, `onCode(...)`)

| Test (line) | Pins | Disposition |
|---|---|---|
| `sendIsOfferedForAPlausibleAddressOnly` (56) | `canSend` | keep |
| `theCodeScreenComesOnlyOnceTheServerAccepts` (73) | step moves to `.code` after the answer | keep |
| `aFailedSendKeepsTheAddressOnTheEmailScreen` (84) | `.sendNetwork`, address kept | keep |
| `oneSendAtATime` (101) | single flight | keep |
| `theCodeTakesSixDigitsAndNothingElse` (114) | `code` setter | keep |
| `verifyingWaitsForSixDigitsAndATap` (129) | `canVerify` | keep (already excludes `isResending`) |
| `aRefusedCodeKeepsItsDigitsAndVerifyCode` (146) | `.codeNotVerified` | keep |
| `noAnswerIsNeverAWrongCode` (173) | `.verifyNetwork` | keep |
| `aBusyServerIsNeverAWrongCode` (186) | `.verifyUnavailable` | keep |
| `theAddressCantChangeWhileACodeIsOnItsWay` (204) | `canChangeEmail` false and `changeEmail()` a no-op while verifying (T49) | keep. It is the Change email action, not the field: the field-edit guard of C2 is a new test with a different name |
| `theAddressCantChangeWhileANewCodeIsOnItsWay` (223) | same while resending; ends on `failure == .resendNetwork` (line 239) | edit if `failure` splits (below) |
| `changingTheAddressKeepsIt` (244) | address kept on Change email | keep |
| `aNewCodeIsOfferedAMinuteAfterTheSend` (253) | the 60 s wait | keep |
| `theWaitCountsFromTheSendNotFromTheScreen` (266) | wait from the send | keep |
| `aNewCodeClearsTheDigitsAndWaitsAgain` (276) | after a resend: digits cleared, `failure == nil` (line 288) | edit if `failure` splits |
| `aRefusedNewCodeKeepsTheDigitsAndTheRow` (295) | resend refusal sets `failure == .resendNetwork or .resendRefused` | edit: becomes the resend failure's own state (X-17, W-07, F-12) |

**`ProfileModelTests.swift`** (12; fixtures from line 82): `theAgeIsRecordedAloneAndFirst` (97), `theNameIsTrimmedAndSentWithTheVersionRead` (108), `anEmptyNameIsRefusedHere` (118), `aNameOverFortyCharactersWaitsAndIsNotCut` (131), `aRetryAfterNoAnswerSendsTheSameKeyAndBody` (149), `aChangedNameIsANewActionWithANewKey` (168), `aRefusedSaveEndsItsActionAndKeepsTheName` (180), `aConflictReadsTheAccountAgainAndTriesWithItsVersion` (194), `theNameAlreadySavedMovesOn` (212), `anotherNameSavedFirstKeepsWhatWasTyped` (225), `anAgeAnotherDeviceRecordedMovesOn` (248), `anEndedSessionSignsOut` (258). All stay valid (profile.md section 5): a refused name is `.other` and keeps the name (T19, T43); over 40 waits and is not cut (FQ70). New only for a new model surface (`canLeave`, a `nameRefused` case; the peers recommend neither).

**`RootModelTests.swift`** (28; `@MainActor @Suite`; fixtures `FakeAuth`, `FakeAccounts`, `Gate`)

| Test (line) | Pins | Disposition |
|---|---|---|
| `withNoSessionItOpensOnSignIn` (33) | `.starting` before `start()` (37) | keep: `start()` keeps `.starting` |
| `aNewAccountConfirmsItsAgeFirst` (45), `anAccountWithItsAgeButNoNameGivesOne` (53), `aCompleteAccountWithNoClubShowsTheNoClubTabs` (61), `theTabsAccountIsForgottenOnLeaving` (73), `noAccountIsShownWhileTheProfileIsUnfinished` (85), `anUnfinishedProfileFromTheClubsForgetsTheTabsAccount` (94) | routing by account | keep |
| `aSessionTheDeviceCantKeepSaysSoAndSignsInAgain` (104) | `.signInNotKept`; Retry keeps the typed address (116-121) | keep (FQ89's default) |
| `clubsB0CantDrawAreNeitherEmptyNorAFailure` (124), `aListThatDidntComeIsTheFailureUntilRetried` (132), `anAccountThatCantBeReadIsTheFailureUntilRetried` (149), `anUnfinishedProfileFromTheClubsGoesBackToSetUp` (160), `twoAnswersThatDisagreeAreAFailureNotALoop` (169) | tab failures, T49 | keep |
| `aRejectedSessionIsForgottenAndSignsIn` (178) | server-ended session routes to sign-in | extend: the cause reaches sign-in for the notice (W-10, R-06) |
| `aVerifiedCodeKeepsTheSessionAndRoutesByTheAccount` (186), `theAgeThenTheNameThenTheTabs` (200) | verified-code read | extend: route stays `.signIn` while the account is read (R-09) |
| `leavingSignInEndsTheSessionAndStartsAgain` (221) | `root.signIn?.email == ""` (232): the FQ93 default | keep; it is the test that pins FQ93's default |
| `leavingPurgesOnceTheServerHasHeardAndBeforeSignInShows` (235) | `.starting` during `left` (249) | edit: `.leaving` (R-09, X-21) |
| `aSessionTheServerEndedIsPurgedToo` (254), `aSaveThatLandsAfterLeavingIsDropped` (264), `aListThatLandsAfterLeavingIsDropped` (285), `aReadThatLandsAfterLeavingIsDropped` (305), `aRereadThatLandsAfterLeavingIsDropped` (320), `aSignedOutAnswerAfterLeavingSignsOutOnce` (339), `aCodeVerifiedAfterLeavingIsDropped` (358) | the leave races (T11, T24) | keep |
| `twoLeavesAtOnceEndTheSessionOnce` (379) | `.starting` held at a gate (389, 395) | edit: `.leaving` |
| `aLeaveThatCantForgetTheSessionSaysSoAndRetries` (405), `aLeaveFromTheTabsThatCantForgetTheSessionForgetsTheAccount` (424) | `.leaveFailed` and Retry | extend: Retry shows `.leaving` again |

**Unaffected suites** (they must stay green; no auth protocol or session change in this slice): `SessionManagerTests` (31), `SupabaseAuthTests` (20), `DateLabelsTests` (7 plus 1 parametrized, in two suites), `CountdownTests` (5), `IdempotencyKeyTests` (5), `LocalDateTests` (5, one parametrized), `ServerClockTests` (4), and `TadayoAPIClientTests` in `TadayoAPI` (the façade; no screen of this slice changes it).

### 3.2 `TadayoTests` (hosted in the app; 43 tests; also run on iOS 18.6 and 17.5)

| Class (tests) | Pins | Disposition |
|---|---|---|
| `AppLaunchTests` (8; lines 28-111) | the inert host builds nothing; Debug can never send a code; missing settings build nothing; first launch after install forgets the session before reading it; a later launch keeps it; every request goes through a session that keeps nothing; `testLeavingRemakesTheConnections` (111) | keep (Leave still remakes the connections) |
| `DesignCatalogTests` (3; lines 20, 44, 79) | every key of `TadayoDesign`'s catalog resolves in the package bundle and none in the app's; every `String(localized:)` in the package names `bundle: .module`, no main-bundle form appears, and the keys looked up equal the catalog's keys; every middle dot in both catalogs is bound by U+00A0 | keep; it is the guard on every new package key (the busy button's value belongs here, read with `bundle: .module`) |
| `DropCardTests` (15) | the drop card's spoken labels, values, hints, actions and traits, via `AccessibilityElements` (3 reads) | keep; unaffected (fixture names begin with letters, so the Avatar's new rule does not change them) |
| `KeychainSessionStoreTests` (11) | the keychain item, its group, environment, attributes | keep |
| `LaunchScreenTests` (1; line 14) | `UILaunchScreen.UIColorName == "LaunchBackground"` and its two values equal the canvas in light and dark, and differ | keep; only the file comment (line 8) changes (root part C) |
| `TabsAnnouncementTests` (5; lines 19-50) | `TabsView.announcement`: loading label polite, "Home updated." only on Home, a failure at once with its line, Retry says loading again, the Lab says nothing | keep (root part: unchanged) |

### 3.3 `TadayoSnapshotTests` (65 tests; newest iOS only)

**`SignInSnapshotTests.swift`** (31 = 25 snapshot + 6 VoiceOver; 75 references). The fixture is Ben at ben@example.com (FQ36); each state is driven through its model with `ScriptedAuth` and `ScriptedAccounts`, a request on its way is one that never answers (`.hang`), `StillClock` stands in for the minute. Helpers at lines 230-312: `signIn`, `onCode`, `refused`, `letTheMinutePass`, `profile`, and `snap` (line 285-293: `busy: model.isSending || model.isVerifying`), `snapAge` (`busy: model.isSaving`), `snapProfile` (`ProfileScreen(model:, focus: false)`, `busy: model.isSaving`).

| Test (line) | State named | Drives | Predicted reference change (peer parts) |
|---|---|---|---|
| `testA02Email` (17) | `A02-email` | typed address | none expected (3 stay) |
| `testA02EmailEmpty` (23) | `A02-email-empty` | field empty | placeholder "Email address" (`auth.email.placeholder`, W-08) |
| `testA02EmailSending` (27) | `A02-email-sending` | `.hang` send | busy button: leading 16-pt indicator, field read-only (D-13, X-15) |
| `testA02EmailFailedNetwork` (34) | `A02-email-failed-network` | `.sendNetwork` | none expected |
| `testA02EmailRefused` (41) | `A02-email-refused` | `.sendRefused` | none expected |
| `testA02Code` (50) | `A02-code` | arrival | region 64 not 60 (V-03), resend row, leading Change email (X-25) |
| `testA02CodeVerifying` (54) | `A02-code-verifying` | `.hang` verify | busy Verify, Change email unavailable, back hidden |
| `testA02CodeVerifyFailedNetwork` (61) | `A02-code-verify-failed-network` | `.verifyNetwork` | region and rows |
| `testA02CodeVerifyUnavailable` (66) | `A02-code-verify-unavailable` | `.verifyUnavailable` | layout |
| `testA02CodeError` (71) | `A02-code-error` | wrong code, minute passed | region 16 below, leading rows |
| `testA02CodeErrorWaiting` (77) | `A02-code-error-waiting` | wrong code, minute not passed | layout |
| `testA02CodeResend` (82) | `A02-code-resend` | minute passed | Send a new code leading, 8 below Verify |
| `testA02CodeResending` (88) | `A02-code-resending` | `.hang` resend | indicator plus text action row; the `snap` call must flag busy for `isResending` |
| `testA02CodeResendFailedNetwork` (95) | `A02-code-resend-failed-network` | `.resendNetwork` | own block under the row |
| `testA02CodeResendRefused` (102) | `A02-code-resend-refused` | `.resendRefused` | own block |
| `testA02Age` (111) | `A02-age` | profile `ageConfirmed: false` | Leave in the bar, no chevron or footer link, button 44 above the bottom |
| `testA02AgeSaving` (115) | `A02-age-saving` | `.hang` update | busy |
| `testA02AgeFailedNetwork` (121) | `A02-age-failed-network` | `.network` | the age words (`auth.age.network`), 16 above the button |
| `testA02AgeRefused` (127) | `A02-age-refused` | `.other` | the age words (`auth.age.refused`) |
| `testA03Profile` (135) | `A03-profile` | name typed | Leave in the bar, leading Add photo and Optional, focus |
| `testA03ProfileEmpty` (141) | `A03-profile-empty` | no name | person glyph for the avatar, placeholder |
| `testA03ProfileSaving` (145) | `A03-profile-saving` | `.hang` update | busy value, Add photo and Leave dimmed |
| `testA03ProfileFailedNetwork` (152) | `A03-profile-failed-network` | `.network` | failure under the field |
| `testA03ProfileRefused` (159) | `A03-profile-refused` | `.other` | failure under the field |
| `testA03ProfileNameTooLong` (166) | `A03-profile-name-too-long` | 45 characters | line under the field |

VoiceOver tests (lines 176-231, all through `AccessibilityElements`): `testEachTitleIsAHeading` (176: "What’s your email?", "Enter your code", "Before you continue", "What should we call you?"), `testTheAddressIsReadAsItIs` (186: the label "Sent to ben@example.com", no zero-width spaces), `testACodeNotVerifiedIsTheFieldsHint` (192: the "Six-digit code" field's hint is `Failure.codeNotVerified.words`, and "" for a network failure), `testA02EmailShowsOnlyItsOwnFailures` (204), `testTheAgeScreensBackIsLeaveSignIn` (218: **2** elements labelled "Leave sign-in"; becomes 1), `testTheAvatarIsntRead` (224: the label "B" is not an element; "Your name" is).

**`RootSnapshotTests.swift`** (8 = 5 + 3; 15 references): `testGlobalLaunch` (14: a fresh `RootModel`, asserts `root.route == .starting`, snapshots `RoutedView(root:)` as `global-launch`; today the canvas alone, passes no `busy`), `testGlobalLaunchFailedNetwork` (24), `testGlobalLaunchRefused` (28), `testGlobalLeaveFailed` (32), `testGlobalSignInNotKept` (36) (each `RootFailure(kind:retry:)` via `snap`, line 85-91); VoiceOver: `testEachFailureNamesWhatFailedAsAHeadingWithRetry` (42), `testCheckYourConnectionOnlyWhenNoAnswerCame` (59), `testEachFailureIsSaidAsItShowsTitleThenLine` (69: `Kind.spoken`).

**`TabsSnapshotTests.swift`** (20 = 13 + 7; 39 references): snapshots `testG06NoClub` (16), `testF01NoClub` (20), `testM01NoClub` (24), the three `...LoadingNoClub` (30, 34, 38, `busy: clubs == .loading`), the three `...ErrorNoClub` (44, 48, 52), the three `...ErrorNoClubRefused` (56, 60, 64) and `testGlobalClubNotInBuild` (70). VoiceOver (lines 77-148): `testTheHeadersWordmarkAddAndAccount` (77: the wordmark "Tadayo" is no heading, "+ Add" has the hint "Save a private draft or open private drafts.", "Account" is a button, "B" is not read), `testEachTitleIsAHeading` (92: eight titles including "Friends" and "Memories"), `testTheNoClubActionsSayWhatTheyDo` (107), `testGoToHomeIsAButton` (120), `testWhileLoadingOnlyTheLabelIsReadNotTheIndicator` (127), `testAFailuresTitleAndLineAreOneSpokenGroup` (136), `testAFailureOffersRetryAndAClubThisBuildCantShowDoesnt` (148).

**`LabSnapshotTests.swift`** (6; 58 references): `testLabSections` (74: 13 `LabSection`s times `Variant.sections` (light, dark, `large` = xxxLarge, `xl` = accessibility 5), `photos` in light only: 12 x 4 + 1 = 49), `testTheHeaderStacksWhenItsActionsDontFit` (87: `Lab-header-320-xl`), `testTheDropCardKeepsInsideA320PointScreenAtTheLargestSize` (98: four 320-xl references), `testTheReceiptKeeps12UnderAWrappedAction` (107: `Lab-receipt-320-ax1`), `testTheAuthorsHighlightTakesItsOwnLineInACurrentYearCard` (117: 393 and 430), `testTheFeedFramesALandscapePhotoTheSameWay` (136). Only `actions`, `avatars` and `header` (and the 320 header) are touched by this slice. `snap` passes `busy: section == .actions` (line 156), so the Lab's busy specimen must keep a `UIActivityIndicatorView` or `Spinners.check` fails.

### 3.4 `TadayoUITests` (5; `SignInUITests.swift`; all also run on 17.5 and 18.6)

Launch modes (DEBUG only, `Tadayo/App/UITestLaunch.swift`): `-TadayoUITestNoSession` (real services, no session) and `-TadayoUITestFakes` (`FakeAuth`: any address takes a code, `123456` verifies, anything else is `.codeNotVerified`; `FakeAccounts`: `update` always succeeds, the account is new until it gives its age and its name; `clubs()` is empty). The fakes answer at once, so **no UI test can see a busy, saving or failed state**.

| Test (line) | Pins | Disposition |
|---|---|---|
| `testWithNoSessionItOpensOnTheEmailScreen` (13) | A02-email opens with the field focused (typed with no tap), Send a code waits for a plausible address, no back on the first screen | keep; add the placeholder only if cheap |
| `testSignInGoesToTheEndOnStandInServices` (37) | the whole walk: Change email keeps the address, a wrong code keeps its digits, the age then the name then the tabs; line 86: `leaveButtons(in: app).count == 2` on A02-age (chevron and footer link); `name.tap()` before typing on A03 | edit: the count becomes 1 (the bar's button); `name.tap()` is no longer needed (A03 focuses on arrival with VoiceOver off, C-01) |
| `testTheTabsWithNoClub` (106) | each tab's screen and Go to Home | keep; re-check the queries against the new header (labels unchanged) |
| `testTheLabsLogOutReturnsToSignIn` (128) | Lab Log out returns to sign-in | keep; it now passes through "Leaving sign-in…" (root part A4) |
| `testLeavingSignInFromTheAgeScreenStartsAgain` (144-159) | Leave from A02-age: the footer button and the bar button; the email field is empty | edit: the footer half goes, the bar's `navigationBars["Sign in"].buttons["Leave sign-in"]` stays; the empty field stays (FQ93 default) |

### 3.5 Tests that pin what the check says stays as built (regression guards)

These must not be edited to fit a frame: `testA02EmailRefused` and `testA03ProfileRefused` (R-01, W-15: "Couldn’t send a code. Try again." and "Couldn’t save your profile. Try again." name an action, T43; no invalid-address or name-refused line); `RootModelTests` 116-121 (the address kept after "Couldn’t keep you signed in.") and 232 (empty after Leave: FQ93's default); `TabsAnnouncementTests` (one announcement per resolve, R-12); `testTheAvatarIsntRead` and the Tabs header test's "B is not read" (the avatar stays decorative, WM-04, check 4.13); `DesignCatalogTests` (T41-T43 words live where the component reads them); the copy lint's `auth.code.sentTo` exception; the failure title at `emptyTitle` 25 (FQ90; frames 14 and 16 draw 32: judged by eye on the `*-error-no-club` sheets, no test pins the size).

## 4. Snapshot references

### 4.1 Counts, names, pixel sizes

Root: `apps/ios/TadayoSnapshotTests/__Snapshots__/<Class>/<test>.<state>.png`, where `<state>` is the `named:` argument plus `-dark` or `-xl` for a screen.

| Class | Files | Size | Average | Largest |
|---|---|---|---|---|
| `SignInSnapshotTests` | 75 (25 states x 3) | 14.0 MB | 184 KB (light 126, xl 300) | 386 KB |
| `RootSnapshotTests` | 15 (5 x 3) | 1.5 MB | 97 KB | 190 KB |
| `TabsSnapshotTests` | 39 (13 x 3) | 6.8 MB | 170 KB | 377 KB |
| `LabSnapshotTests` | 58 | 21.5 MB | 368 KB | 1.4 MB |
| Total | 187 | 43.8 MB | | |

Pixel sizes (measured with `identify`): screen states 786 x 1704 (light, dark) and 786 x 4400 (`-xl`: 393 x 2200 points at 2x); Lab sections 1179 px wide (393 points at 3x; heights vary, for example `Lab-actions` 2547, `-large` 2728, `-xl` 5017, `Lab-avatars` 1409, `Lab-fields` 1884, `Lab-header` 766); `Lab-revealed*` and `Lab-revealed-landscape` 786 wide (2x); `Lab-photos` 393 x 1987 (1x); the 320-point specimens 960 wide and `Lab-card-highlight-430` 1290 wide (3x).

### 4.2 How they are generated

- Screens: `ScreenSnapshot.assert(view, named:, busy:)` (`ScreenSnapshots.swift:60-84`) draws `state`, `state-dark` and `state-xl` (`Variant.allCases`) in a `FramedHost` with the environment's colour scheme, `dynamicTypeSize` (`.large`, or `.accessibility5` for `-xl`) and `en_US`. Every new state therefore brings three references. The 320 and 430-point variants exist only for the representative states the inventory marks (`docs/TECH-DESIGN.md:66`); this slice adds one, the header at 320.
- Lab: its own `snap` with `Variant` light, dark, `large` (xxxLarge), `xl` (accessibility 5), `ax1` (accessibility 1) and widths 320 and 430 (`LabSnapshotTests.swift:26-70, 145-175`).
- **What the harness cannot draw:** the keyboard, the status bar, a scrolled viewport, a pinned footer riding a keyboard, the launch screen (iOS draws it before the app runs; `LaunchScreenTests` and a device check stand in: `docs/LIMITATIONS.md`), a spinner turning, focus movement, announcements.

### 4.3 Predicted churn, by PR

Predictions from the peer parts' lists (`signin.md` E, `profile.md` 5, `root.md` 12) and the shared components' consumers; CI's `changed` list decides.

| PR | Changed | New | Written again later | Notes |
|---|---|---|---|---|
| 1 records | 0 | 0 | 0 | 29 frames in `screens/`, the sheet replaced |
| 2 root | 15 (`global-launch` 3, four failures 12) | 3 (`global-leaving`) | 0 | |
| 3 email and age | 18: `A02-email-empty` 3, `-sending` 3, `A02-age` 4 states x 3; plus collateral 10: `A02-code-verifying` 3, `A03-profile-saving` 3, `Lab-actions` 4 | 3 (`A02-email-signed-out`) | the collateral 10 are written again in PRs 4 and 5 | 31 writes |
| 4 code | 30 (ten existing A02-code states x 3); collateral 25: A03 x 6 states x 3 = 18 (Add photo moves left), `M01-no-club` 3, `Lab-actions` 4 | 6 (`A02-code-typed`, `A02-code-error-resend-failed-network`) | the collateral 25 are written again later (A03 in PR 5, M01 in PR 6); `Lab-actions` repeats PR 3's write | `A02-code-verifying` is counted in PR 3's collateral and again among the ten |
| 5 profile | 18 (A03 again) + 4 (`Lab-avatars`) | 0 | | |
| 6 header and tabs | 39 Tabs + 5 Lab (`Lab-header` 4, `-320-xl`) | 1 (`Lab-header-320`) | `M01-no-club` 3 (again) | |
| **Total writes** | | | 177 | 146 distinct files, 31 repeat writes (`A03-profile-saving` is written three times, the other repeats twice) |

New binary in history: about 177 PNGs, 30 to 35 MB (the repository never forgets a blob), plus the 29 frames (2.4 MB) and the sheet (9.8 MB, replacing a 5.0 MB file). `docs/GITHUB.md:156` keeps binaries with the code that uses them.

## 5. The hosted VoiceOver reader (`AccessibilityElements`)

`apps/ios/TadayoSnapshotTests/AccessibilityElements.swift` (138 lines; compiled into `TadayoSnapshotTests` and, by `project.yml:173`, into `TadayoTests`).

- **How it works:** it shows the view in a window of the host's scene (393 x 852), waits about 0.5 s, gathers accessibility elements in the order UIKit hands them to VoiceOver, and returns `label`, `hint`, `traits`, `value` and the names of custom actions for each (`Element`, lines 23-34). `perform(_:on:in:)` (44-58) runs a custom action by name. SwiftUI builds a screen's elements only while an assistive technology or automation is on, so the first read turns the simulator's accessibility automation on (`_AXSSetAutomationEnabled` from `libAccessibility.dylib`) and waits up to 10 s until a probe in a scroll view reads (`prepare`, 62-74). Each test pairs what must not be found with something that must, so a tree that can't be read fails.
- **Where it is used:** `SignInSnapshotTests` (8 reads), `RootSnapshotTests` (3), `TabsSnapshotTests` (8), `DropCardTests` in `TadayoTests` (3). `TabsAnnouncementTests` and `RootFailure.Kind.spoken` are pure functions, not readers.
- **What it cannot do:** hear an announcement or see focus move (automation is not VoiceOver), so the C-01 condition on A03's arrival focus (focus on arrival unless VoiceOver is running; `profile.md` 6.1) can only be tested if the condition is injected (a screen parameter or closure); "said once" is a device check. The precedent: words as pure functions (`TabsView.announcement`, `RootFailure.Kind.spoken`, tested in `TabsAnnouncementTests` and `RootSnapshotTests.testEachFailureIsSaidAsItShowsTitleThenLine`) and the rest in the TestFlight notes.
- **Compat consequence:** the reader is compiled into both targets, but all the sign-in, root and tabs readings sit in the snapshot targets, so they run only on the newest iOS. The supporting fakes (`ScriptedAuth`, `ScriptedAccounts`, `StillClock`, `Outcome`, `ScreenSnapshot.drive`) are in `ScreenSnapshots.swift`, which imports SnapshotTesting and is not compiled into `TadayoTests`. Putting a new reading in `TadayoTests` means moving those non-snapshot pieces to a small file compiled into both targets (a one-line `project.yml` source addition beside line 173, no CI change).
- **What the slice adds to what VoiceOver reads** (all strings from `copy-contracts.json`, `handoff7`): the busy button's value `vo.busy.value` "In progress" with its label unchanged, not disabled-looking but `.notEnabled` (C1; the delivery's `repeatSubmission false`); fields read-only while busy, with no `.notEnabled` trait (read-only is not disabled); the placeholder not read twice (W-08); one "Leave sign-in" element on A02-age and on A03; A03's order (Leave sign-in, title as header, helper, Add photo, Optional, "Your name" field with its label once, Continue); no element for the avatar's initial or person glyph; Verify before Send a new code in the code screen (`codeAccessibilityOrder`; a pinned footer in `safeAreaInset` is read last unless forced, `signin.md` F1); "Account" with hint `header.accountHint` "Open your account."; Retry's hint per tab (`vo.retryHome.hint` and the two like it) and per root failure (`vo.retryAccount.hint`, `vo.retryLeave.hint`, `vo.retryKeep.hint`) and none on the not-in-build state; each wait view reads exactly its label (no indicator, no header).

## 6. The 30 frames against the snapshots

Frame order is `frame-manifest.json`'s. Every screen frame is 393 x 852 points (786 x 1704 px), light unless marked; frames 1-16 and 23-30 at text size `large`, 19, 20, 22 at `accessibility5`. "Existing" means a test named in section 3.3. "Compare" says what a like-for-like comparison cannot show.

| # | Frame (kind) | Pairs with | Test work | References | Compare |
|---|---|---|---|---|---|
| 1 | `A02-email-empty` (requested) | `testA02EmailEmpty`, `A02-email-empty` | edit: placeholder; read-only check of the field's value | 3 change | frame has the keyboard up; harness none |
| 2 | `A02-email-sending` | `testA02EmailSending` | edit: leading indicator, read-only, value "In progress" (VoiceOver test) | 3 change | spinner held still; frame's spokes white |
| 3 | `A02-email-failed-network` | `testA02EmailFailedNetwork` | none | 3, none expected to change | gaps 12 and 24 built against the frame's 5 and 18: the written values win (check 4, item 6) |
| 4 | `A02-code-verifying` | `testA02CodeVerifying` | edit: busy Verify, Change email unavailable; model guard test | 3 change | frame draws Back active; app hides it (signin.md F3) |
| 5 | `A02-code-verify-failed-network` | `testA02CodeVerifyFailedNetwork` | edit | 3 change | region 64 written against the frame's 60 (F2) |
| 6 | `A02-code-resend` | `testA02CodeResend` | edit | 3 change | |
| 7 | `A02-code-resending` | `testA02CodeResending` | edit: `snap` passes `busy` for `isResending` | 3 change | |
| 8 | `A02-code-resend-failed-network` | `testA02CodeResendFailedNetwork` | edit: its own block (new model state) | 3 change | |
| 9 | `A02-age-failed-network` | `testA02AgeFailedNetwork` | edit: the age words `auth.age.network`, 16 above the button | 3 change | frame 20's hole is not built |
| 10 | `A03-profile-empty` | `testA03ProfileEmpty` | edit: `focus: true`, `leave:`; glyph; placeholder | 3 change | frame has the keyboard and focus; harness none |
| 11 | `A03-profile-failed-network` | `testA03ProfileFailedNetwork` | edit | 3 change | frame scrolled with the keyboard; field-to-error gap 16 against the written 12 |
| 12 | `global-launch-failed-network` | `testGlobalLaunchFailedNetwork` | edit: title offset (X-22), Retry hint | 3 change | no header and no tabs |
| 13 | `H01-loading-no-club` | `testH01LoadingNoClub` | edit (header) | 3 change | |
| 14 | `H01-error-no-club` | `testH01ErrorNoClub` | edit (header, Retry hint) | 3 change | frame's title 32, built `emptyTitle` 25 (FQ90) |
| 15 | `F01-loading-no-club` | `testF01LoadingNoClub` | edit (header) | 3 change | |
| 16 | `F01-error-no-club` | `testF01ErrorNoClub` | edit | 3 change | title size as 14 |
| 17 | `brand-components` (component sheet, 2400 x 51552 px) | no snapshot; the Lab sections `Lab-actions` (busy specimen at sheet y 9924, the text-action specimen), `Lab-avatars` (the no-initial specimen), `Lab-header` and `-320` (the AX header) | Lab specimens extended (below) | Lab refs change (section 4.3) | ImageMagick 6 refuses the file (height over its 32 KP limit: `records.md` D2); use Pillow or crop the SVG with `component-sample-index.json`; one transparent band drawn black |
| 18 | `A02-code-error-dark` | `testA02CodeError`, `A02-code-error-dark` | none beyond 25 | in 30 | |
| 19 | `A02-code-error-xl` | `A02-code-error-xl` | none beyond 25; the pin decision is a unit test | in 30 | viewport at AX5 with the keyboard and a pinned Verify against a 2200-point whole screen; the address breaks "Sent to ben@" over "example.com" where the frame breaks "ben@example" over ".com" (C-02) |
| 20 | `A03-profile-empty-xl` | `A03-profile-empty-xl` | none beyond 10 | in 18 | scrolled with the keyboard; the 166-point hole between Optional and the label is schematic (FM-01) and not built |
| 21 | `G06-no-club-dark` | `G06-no-club-dark` | none beyond 28 | in 39 | |
| 22 | `G06-no-club-xl` | `G06-no-club-xl` | none beyond 28; optional geometry assertion for the stacked header | in 39 | viewport; the two-row header; `noClub.body2` kept at every size (X-02, F-01) |
| 23 | `A02-email` (redraw) | `testA02Email` | none | 3, none expected | subtitle ink and field gap kept as built (X-06, X-07) |
| 24 | `A02-code` (redraw, 529614 typed) | **no snapshot today**: new `testA02CodeTyped`, state `A02-code-typed` (records D1) | new | 3 new | handoff 1's frame stays for `A02-code` (arrival: empty field, Verify unavailable) |
| 25 | `A02-code-error` (redraw) | `testA02CodeError` | edit | 3 change | |
| 26 | `A02-age` (redraw) | `testA02Age` | edit: Leave in the bar; VoiceOver count 1 | 3 change | |
| 27 | `A03-profile` (redraw) | `testA03Profile` | edit | 3 change | keyboard and focus |
| 28 | `G06-no-club` (redraw) | `testG06NoClub` | edit (header) | 3 change | title 32 under the header |
| 29 | `F01-no-club` (redraw) | `testF01NoClub` | edit (header, page title 32 under it, Private drafts inset) | 3 change | |
| 30 | `M01-no-club` (redraw) | `testM01NoClub` | edit (header, page title, Go to Home leading) | 3 change | |

**Counts:** frames 1-16 (16 requested) and 18-22 (5 dark or largest-text) are new files in `screens/` (21); frames 23 and 25-30 replace seven files (the older ones stay in their handoff folders: ADR-027); frame 24 is not a replacement (`A02-code.png` stays handoff 1's) and, with D1, copies to `A02-code-typed.png`. Frame 17 replaces `brand/brand-components.png` (`records.md` 6.4).

**States with no frame, built from spec** (each needs the test shown and a `built from spec` row, T46; their handoff goes to the next brief, handoff 8, or into the PR's Design handoff block):

| State | Test | Row |
|---|---|---|
| `A02-email-signed-out` | new `testA02EmailSignedOut` (a sign-in the server ended: the notice above the field) | new `built from spec` (X-33) |
| `A02-code-error-resend-failed-network` | new `testA02CodeErrorResendFailedNetwork` (wrong code, then a resend that gets no answer: both blocks) | new (X-33) |
| `global-leaving` | new `testGlobalLeaving` (snapshot the wait view with `.leaving` directly, as the failure tests snapshot `RootFailure(kind:)`) | new (X-33) |
| `global-launch` | `testGlobalLaunch`, now `busy: true` (a spinner over "Loading your account…") | notes rewritten (it was "the canvas alone") |
| `A02-email-refused`, `A02-code-verify-unavailable`, `A02-code-error-waiting`, `A02-code-resend-refused`, `A02-age-saving`, `A02-age-refused`, `A03-profile-saving`, `A03-profile-refused`, `A03-profile-name-too-long`, `global-launch-refused`, `global-leave-failed`, `global-sign-in-not-kept`, the three `*-error-no-club-refused`, `M01-loading-no-club`, `M01-error-no-club`, `global-club-not-in-build` | existing | stay `built from spec`; layout moves only |
| `A02-email-invalid`, `A03-profile-name-refused` | none: drawn as `A02-email-refused`, `A03-profile-refused` (R-01, W-15; records D5) | rows only (X-33) |

Every `-dark` and `-xl` without a frame of its own is "judged against book p26's rules" on its sheet.

## 7. Master list of tests to add or change

IDs are mine (TL Linux, TH hosted, TS snapshot, TV VoiceOver in a snapshot target, TU UI, TD device). Names are proposals; those marked (peer) follow a peer part. "PR" is the section 8 PR.

### 7.1 Linux (`TadayoCore`, Swift Testing)

| ID | Test | Source | PR |
|---|---|---|---|
| TL-01 | `SignInModel`: the address field ignores edits while a code is being sent and editing returns after each failure (new name, not `theAddressCantChange...`, which is the Change email action) | C2: X-15, W-06 (peer) | 3 |
| TL-02 | `SignInModel`: the code field ignores edits while verifying or resending; editing returns after each failure; `canVerify` stays false while resending | C2 (peer) | 4 |
| TL-03 | `SignInModel`: a resend failure is its own state and leaves a showing code error in place (both blocks); lifetimes pinned: cleared at the next resend, on success and on Change email; typing does not clear it (signin.md F4 suggests these; no source gives them) | X-17, W-07, F-12 | 4 |
| TL-04 | edit `aNewCodeClearsTheDigitsAndWaitsAgain` (276) and `aRefusedNewCodeKeepsTheDigitsAndTheRow` (295), and the snapshot drive conditions that read `model.failure == .resendNetwork` | same | 4 |
| TL-05 | `SignInModel`/`RootModel`: a server-ended sign-in carries the cause to A02-email, shown once and cleared once a code is sent; Leave sign-in carries none (`vo`/notice words `auth.email.signedOut`); Retry after "Couldn’t keep you signed in." keeps the address (existing 116-121) | W-10, R-06, FQ93 | 3 |
| TL-06 | `RootModel`: `.leaving` replaces `.starting` at 249, 389, 395; Retry from `.failed` shows `.starting` until the account answers; Retry from `.leaveFailed` shows `.leaving` again; a verified code's account read leaves the route at `.signIn` (R-09); a server-ended answer during a read shows `.leaving` then `.signIn` (R-10) | root.md part A | 2 |
| TL-07 | `ProfileModel`: `canLeave` (inactive while a save runs, active after a failure) only if the plan adds it | X-19, F-10 | 3 or 5 |
| TL-08 | `AvatarInitial` table test if the pure rule lives in `TadayoCore`: "Ben" gives B; "élodie" and decomposed e + U+0301 give É; "3D" gives 3; an Arabic-Indic digit gives itself; "日本" gives 日; "Ørjan" gives Ø; emoji (U+1F600), keycap 1 + U+FE0F + U+20E3, a flag, a joined family, "-", "(", "@", "", "   " and a lone U+0301 give none; "ß" once for the uppercasing; values the sources do not fix (superscript, roman numeral, a leading U+200B) marked as defaults | D-14, X-20; CC `avatarWithoutInitial.initialRule` (peer, `profile.md` 5, 6.7) | 5 |
| TL-09 | pure decisions, if built in `TadayoCore`: the Verify pin (pinned only where it would otherwise sit under the keyboard: V-02, X-04, F-09, W-02, signin.md F1), the busy group's fit (label width + 2 x 24 at most the 321 available: C1, F9), the footer's bottom (12 with the keyboard, 44 without: VM-02, WM-02) | decision in section 9 | 3, 4, 5 |

### 7.2 Hosted (`TadayoTests`; runs on the newest iOS, 18.6 and 17.5)

| ID | Test | Source | PR |
|---|---|---|---|
| TH-01 | `SignInAnnouncementTests` (peer name): the words and once-only rule for busy (`vo.email.busy`, `vo.code.busy`, `vo.age.busy`, `vo.profile.busy`), the resend row (`vo.resend.busy`, `.available`, `.wait`, `.success` with the address, never logged: T52) and failures; a pure function in the app, like `TabsView.announcement` | VM-04, R-08 | 3, extended in 4 and 5 |
| TH-02 | `RootWait.Kind.spoken` equals the visible words ("Loading your account…", "Leaving sign-in…"); polite, once | W-09, V-14 | 2 |
| TH-03 | VoiceOver readings that should run on 18.6 and 17.5 (busy value and traits, field not `.notEnabled`, Leave count, A03 order): placed here only if the Scripted fakes are made shared (section 9, decision 1) | | 3, 4, 5, 6 |
| TH-04 | `DesignCatalogTests` and `LaunchScreenTests` unchanged; they guard the new package keys (the busy value: key, lookup with `bundle: .module`, no "sent") and the launch colour | | all |
| TH-05 | an Avatar glyph-coverage test for "a letter whose glyph the font cannot draw" (CoreText, iOS only; font coverage can differ across 17.5, 18.6 and 26: do not add unless a source names the font) | `profile.md` 6.7 | 5 |

### 7.3 Snapshot tests (newest iOS only)

| ID | Test | PR |
|---|---|---|
| TS-01 | `testGlobalLaunch` passes `busy: true`; new `testGlobalLeaving` (`global-leaving`) | 2 |
| TS-02 | `testGlobalLaunchFailedNetwork`, `...Refused`, `testGlobalLeaveFailed`, `testGlobalSignInNotKept`: unchanged code, references change | 2 |
| TS-03 | `testA02EmailEmpty`, `...Sending`: references change; new `testA02EmailSignedOut` | 3 |
| TS-04 | `testA02Age`, `...Saving`, `...FailedNetwork`, `...Refused`: references change (age words, Leave in the bar) | 3 |
| TS-05 | `snap(_:named:)` flags `busy` for `isResending` too; `testA02CodeResending` | 4 |
| TS-06 | new `testA02CodeTyped` (`onCode()` then `model.code = "529614"`, Verify available; `A02-code-typed`) and `testA02CodeErrorResendFailedNetwork` | 4 |
| TS-07 | the ten other A02-code tests: references change | 4 |
| TS-08 | A03: `snapProfile` passes `focus: true` and `leave: {}`; six tests' references change | 5 |
| TS-09 | Lab: `Lab-actions*` (PR 3 busy, PR 4 text actions), `Lab-avatars*` (PR 5, the no-initial specimens on canvas and on a cover at 68, 36, 28 and 18, light and dark), `Lab-header*` and `Lab-header-320-xl` (PR 6) and the new `Lab-header-320` | 3, 4, 5, 6 |
| TS-10 | Tabs: all 13 states' references change; optional geometry assertion for the header's rectangles | 6 |
| TS-11 | optional: a test host that adds a bottom inset standing for the keyboard, to snapshot the pinned Verify and Continue's 12-above; flagged as risk of false confidence (section 9) | 4, 5 |
| TS-12 | every idle `-xl` of the four busy-capable screens (A02-email, A02-code, A02-age, A03) is read for the busy button's reserved row: it appears only where the label does not fit between the two 24-point slots (frame 19's "Verify code" fits, so does "Send a code"; "I’m 18 or older" is the likeliest to stack). A move there is the busy button's change, to be judged in PR 3, not its screen's (`signin.md` C1 tests) | 3 |

### 7.4 VoiceOver readings in snapshot targets (or TH-03)

| ID | Reading | PR |
|---|---|---|
| TV-01 | each wait reads exactly its label: no indicator, no header ("Tadayo", "+ Add", "Account"), no Retry | 2 |
| TV-02 | each root failure's Retry has its hint (`vo.retryAccount.hint`, `vo.retryLeave.hint`, `vo.retryKeep.hint`); extend `testEachFailureNamesWhatFailedAsAHeadingWithRetry` | 2 |
| TV-03 | busy Send a code: label unchanged, value "In progress", `.notEnabled`; idle value ""; nothing else labelled "In progress"; the email field has no `.notEnabled` while busy; empty field: placeholder not read twice | 3 |
| TV-04 | `testTheAgeScreensBackIsLeaveSignIn`: 1 element (was 2); busy I’m 18 or older likewise | 3 |
| TV-05 | busy Verify code and the resend row; Verify before Send a new code in the reading order; Change email address `.notEnabled` while a request runs | 4 |
| TV-06 | A03 order and names; one Leave; Add photo and Leave `.notEnabled` while saving; Continue value; no avatar element; an empty-name and an emoji-name case added to `testTheAvatarIsntRead` | 5 |
| TV-07 | Account's hint; Retry's hint per tab; none on `global-club-not-in-build` | 6 |

### 7.5 UI tests (run on all three iOS versions)

| ID | Test | PR |
|---|---|---|
| TU-01 | `testSignInGoesToTheEndOnStandInServices`: line 86 count 1; `name.tap()` removed (focus on arrival; type without a tap, as 24 and 64 do) | 3, 5 |
| TU-02 | `testLeavingSignInFromTheAgeScreenStartsAgain`: the footer half removed, the bar's button kept, the empty field kept; an A03 twin (reach the profile, tap Leave sign-in, the email field is empty) | 3, 5 |
| TU-03 | optional, needs a DEBUG launch mode that hangs a request (for example `-TadayoUITestHang`, a new `FakeAuth`/`FakeAccounts` behaviour): type while a request runs and see the field ignore it with the keyboard still up; the failure line stays reachable with the keyboard up; the busy button's `value` reads "In progress". Without it these are device checks | 3, 4, 5 |
| TU-04 | optional: Continue's gap above the software keyboard; needs a software keyboard on the CI simulator (unverified; a hardware keyboard hides it) | 5 |

### 7.6 Device and TestFlight checks (TD): section 10.

## 8. The split into six pull requests

**Shape.** Sequential, each branch started from `main` after the previous PR merged (`CLAUDE.md`, "Git"; `docs/GITHUB.md`): every PR edits the string catalogs, `Metrics.swift`, `INVENTORY.md`, the journal and `PROGRESS.md`, so parallel PRs would meet in the journal's lane block and have to be rebuilt from two whole versions. PRs 2 and 6 touch disjoint code and could run in parallel at that price; not recommended. Branch names follow `<lane>/<stage>-<slice>` (`ios/b0-adopt-...`). Size is hand-written lines including tests, rough, from the peers' "Exact change" lists; the journal's per-commit entries add to docs lines and are not counted. Each PR's body fills `.github/pull_request_template.md` (Plan, How verified, Evidence, Design handoff, Risks, Review).

**Why vertical.** A shared component's change redraws every consumer's references. The busy button is opt-in already (`canBeBusy`, `PrimaryButton.swift:77, 85, 125-127`), so only busy-capable uses move (A02 x3, A03, the Lab); the text action is used by `SignInFlow.swift:137, 194`, `ProfileScreens.swift:33, 85`, `NoClubTabs.swift:83` and `LabView.swift:381, 385`, so it moves A02-code, A02-age's footer link, A03's Add photo, `M01-no-club` and the Lab. A "components first" PR would redraw about 70 references for 15 lines of code and then redraw most of them again; the vertical order below bounds the double-taking to 31 writes. A reference taken in a PR where its screen is half-adopted is judged against the written contract for the one thing that changed (alignment, an indicator) and says so in the PR.

**Dependencies by file and finding**

```
PR1 records ─┬─ PR2 root wait (RootModel .leaving, RootFailure, SetupLayout)
             └─ PR3 email + age (PrimaryButton busy, Leave in the bar, RootModel cause) ── needs PR2's RootModel edit
                  └─ PR4 code (TextAction leading, SignInModel resend split)        ── needs PR3's PrimaryButton, field guard
                       └─ PR5 profile + Avatar (Leave button from PR3, TextAction from PR4)
                            └─ PR6 header + tabs (TextAction from PR4 for Go to Home; closes the slice)
```

### PR 1: `ios/b0-adopt-records` (handoff 7's frames and rows in; no code, no references)

- **What:** copy the 29 frames of handoff 7 into `design/reference/screens/` (21 new, 7 replaced, with D1 `A02-code-typed.png` copied from frame 24, which makes 22 new) and replace `brand/brand-components.png` with frame 17 (byte for byte; ADR-027; the older files stay in their handoff folders); `INVENTORY.md`: the 16 requested rows from `built from spec` to `received` (Source `Handoff 7`), the five new `received` rows (`A02-code-error-dark`, `A02-code-error-xl`, `A03-profile-empty-xl`, `G06-no-club-dark`, `G06-no-club-xl`) and `A02-code-typed`, the eight redrawn rows' Source moved (earlier source in brackets), and a one-line "Frame n" description in each Notes cell only, because the build still differs (each later PR rewrites its rows' Notes and the Known differences bullets for what it makes true: INV line 5, "same commit as the change"); the counts line; `QUESTIONS.md`: FQ93 (default: an empty field after Leave sign-in), the check header paragraph (line 431) and the tabs preface (line 407); `brand/README.md` and a `docs/LIMITATIONS.md` row for the sheet (`records.md` 6.4).
- **Files:** 6 text (`INVENTORY.md`, `QUESTIONS.md`, `brand/README.md`, `LIMITATIONS.md`, `JOURNAL.md`, `PROGRESS.md`), about 100 edited lines of documents, 0 code; 30 binaries (29 frames 2.4 MB, the sheet 9.8 MB).
- **Why first:** the PR's own `ios` run (it touches `design/reference/**`) draws no change but `select()` carries a sheet for each of the 29 states whose render changed (`ios_steps.py:458-475`): the baseline of every frame beside today's snapshot, before any code. Read it and put the per-state difference list in the PR; PRs 2 to 6 then show their references against renders already in place.
- **Done:** `cmp` of each `screens/` file against its frame; every file 786 x 1704 (`file`); `ls design/reference/screens | wc -l` is 88 (89 with D1); `sha256sum -c checksums.sha256` in `handoff-7/` still 92 OK; the sheet's sha256 begins `0f843ea26a3b51df`; `ci` green (its `tools` job reads the inventory: at least 149 states, shape kept); the PR's `ios` run green with zero `changed` or `new`; the 29 baseline sheets read; INV counts consistent (246 states, 131 with a render, 20 built from spec after this PR; final 251 / 131 / 25); the founder approves.
- **Alternative:** spread the frames over PRs 2 to 6, each PR copying the frames of its own states. That loses the baseline and splits `records.md`'s one commit, for no saving in references.

### PR 2: `ios/b0-adopt-root` (the root's wait, leaving and failures)

- **What:** `RootModel.Route.leaving` (`endSession()` sets it where it sets `.starting` now, `RootModel.swift:135`; `start()` keeps `.starting`); a new `RootWait` view (a native `ProgressView` over `root.loading` "Loading your account…" or `root.leaving` "Leaving sign-in…", polite once, no header, no tabs); `RoutedView` draws it (`TadayoApp.swift:59-60`); `RootFailure` takes the title offset (a measured shared value or a bar container, never a hard-coded 44: X-22, B1), the foot of Retry 44 above the safe area, and a hint per failure (V-11, W-12); both catalogs' keys; the root states' notes. Findings: X-21, W-09, V-14, R-09, R-10, X-22, V-11, W-12, W-11, RM-01 (peer `root.md` parts A, B, C).
- **Tests:** TL-06, TH-02, TS-01, TS-02, TV-01, TV-02; `LaunchScreenTests.swift` comment only.
- **Files and size:** about 14 text files (`RootModel.swift`, `RootModelTests.swift`, new `RootWait.swift`, `TadayoApp.swift`, `RootFailure.swift`, `SetupLayout.swift`, the app catalog, `RootSnapshotTests.swift`, a hosted test, `LaunchScreenTests.swift`, `INVENTORY.md`, `QUESTIONS.md`, `JOURNAL.md`, `PROGRESS.md`), about 300 lines; 18 references (about 1.8 MB).
- **Inventory:** `global-launch` notes (now an indicator over the words; no frame), `global-launch-failed-network` Known differences against frame 12, `global-launch-refused`, `global-leave-failed`, `global-sign-in-not-kept` notes, new `global-leaving` (`built from spec`), `global-launch-screen` note (unchanged launch screen). **Questions:** FQ89 gains its handoff 7 bullet (the agreement by name and the two waits).
- **Done:** `RootModelTests` green on Linux in `ci`; on `ios` the five root snapshot tests match (with `global-launch` busy and holding an indicator); the three VoiceOver tests and the wait test pass; every changed failure image read against frame 12 and the contracts; `LaunchScreenTests` and `AppLaunchTests` unchanged and green; iOS 18.6 and 17.5 green; the PR notes A1 (the spinner shows for a launch with no session: `root.md` A1) for the founder.

### PR 3: `ios/b0-adopt-email-age` (the busy button, the read-only fields, A02-email and A02-age)

- **What:** `PrimaryButton`'s busy form (a 16-point native indicator at its leading side in 24-point slots with the label centred where it is idle, stacked on its own row where the group cannot fit, the value "In progress" with the label unchanged: D-13, X-15, W-06, CC `busyPrimary`; opt-in as today), its `Metrics` tokens and the package catalog key (read with `bundle: .module`); the email and code fields read-only, not disabled (C2); A02-email: placeholder (W-08), the signed-out notice (W-10, R-06, built from spec), the refusal line kept (R-01); `RootModel` carries the cause of a leave (FQ93's default stays an empty field); A02-age: a leading "Leave sign-in" in the bar in place of the chevron and the footer link, its own words (`auth.age.network`, `auth.age.refused`), 16 above the button, 44 below (F-10, F-13, X-18, R-07, WM-02); the shared `LeaveSignInButton`; the Lab's busy specimen; the test seams (below). Findings: `signin.md` C1, C2, C3, C6, C7.
- **Test seams (fold into this PR unless the plan declines them):** move `ScriptedAuth`, `ScriptedAccounts`, `StillClock`, `Outcome` and `drive` out of `ScreenSnapshots.swift` into a file compiled into both `TadayoSnapshotTests` and `TadayoTests` (one source line in `project.yml` beside line 173), so VoiceOver readings can run on 18.6 and 17.5; and, optionally, the DEBUG launch mode that hangs a request (TU-03). Not CI configuration (T58 covers `.github/`, `.claude/`, `tools/ci/`, `.yamllint.yaml`).
- **Tests:** TL-01, TL-05, TH-01 (created), TS-03, TS-04, TV-03, TV-04, TU-01 (line 86), TU-02, the Lab's `Lab-actions` busy specimen; `testA02AgeSaving` now gets its value check.
- **Files and size:** about 22 text files, about 600 lines (about 100 of them moved test support); 31 references (18 changed, 3 new, 10 collateral that land again).
- **Inventory:** the A02-email and A02-age rows' Notes and the Known differences bullets "Back buttons", "The busy button", "Where a failure line sits", "A typed value longer than its field" (C-03), "States drawn the same"; new `built from spec` rows `A02-email-signed-out` and `A02-email-invalid` (drawn as `A02-email-refused`); the frame differences the app does not follow (written gaps against frames 3 and 9, ink X-07). **Questions:** FQ69 gains its bullet (the leading Leave, no alert; the address is FQ93, not X-34's wording: records D3).
- **Done:** the Linux model tests green; the five A02-email and four A02-age references match their frames and contracts (frames 1, 2, 3, 9, 23, 26); the busy states hold an indicator (`Spinners.check`); the VoiceOver tests pass; the UI tests green on all three iOS versions; the new keys pass `DesignCatalogTests` and the copy lint; `A02-code-verifying`, `A03-profile-saving` and `Lab-actions` changes are listed in the PR as collateral and judged only for the busy button. Size over the target: **fallback split** into 3a (the busy button, the field guard, A02-email and the notice: about 390 lines) and 3b (A02-age and the Leave button: about 180 lines, 12 references).

### PR 4: `ios/b0-adopt-code` (A02-code and the leading text actions)

- **What:** `TextActionStyle` leading, with its 44-point target kept (X-25, F-06, VM-03: Change email address, Send a new code, and the consumers in A03 and M01 move with it); A02-code: the resend failure as its own block under the row and the code error in its own (X-17, W-07, F-12), the resending row (indicator plus text action, frame 7), region and gaps as written (V-03: 12 + 36 + 16, against the frames' 60), the announcements (`vo.*`), Verify pinned only where it would otherwise sit under the keyboard (V-02, X-04, F-09, W-02, VM-04, R-08). Findings: `signin.md` C4, C5.
- **Tests:** TL-02, TL-03, TL-04, TL-09 (the pin), TH-01 (extended), TS-05, TS-06, TS-07, TV-05, TU-03 (if built); `Lab-actions` text-action specimens.
- **Files and size:** about 16 text files, about 540 lines; 61 references (36 for A02-code including the new `A02-code-typed` and `A02-code-error-resend-failed-network`, 25 collateral: A03 x 18, `M01-no-club` 3, `Lab-actions` 4).
- **Inventory:** the A02-code rows' Notes, new `built from spec` row `A02-code-error-resend-failed-network`, the row `A02-code-typed` (received since PR 1) gains its snapshot note; the Known differences "An unavailable text action", "Wrapping" (C-02). **Questions:** FQ86 gains its bullet (same words as `auth.code.unavailable`).
- **Done:** Linux tests green; the 12 A02-code states match frames 4-8, 18, 19, 24, 25 as far as the harness can show them (no keyboard, whole-screen `-xl`: the PR lists what is compared by order and content only); `A02-code` itself keeps handoff 1's render; the pin decision proven as a pure test, with the layout itself left to the device check; the A03, M01 and Lab collateral listed as alignment-only.

### PR 5: `ios/b0-adopt-profile` (A03 and the Avatar)

- **What:** `Avatar`'s rule (the first visible grapheme cluster if it is a letter or a decimal digit; otherwise a person symbol at 56 percent on the fills the avatar already picks, never read by VoiceOver: D-14, X-20, WM-04; CC `avatarWithoutInitial`), possibly with the pure rule in `TadayoCore` for a Linux table test; A03: Leave in the bar (`LeaveSignInButton` from PR 3), arrival focus unless VoiceOver is running (C-01; the condition injected for tests), the failure under the field (VM-01), Continue 12 above the keyboard and 44 above the safe area otherwise (VM-02, WM-02; keyboard-aware `SetupFooter`), the placeholder (BM-02), the busy value and read-only name while saving, the too-long line, Add photo and Optional leading (from PR 4). Findings: `profile.md` 3.4 (C-01, X-19, F-11, VM-01, VM-02, WM-02, BM-02, D-14, X-20, W-06, X-15, D-13, W-08, R-07, F-10).
- **Tests:** TL-07 (if), TL-08, TL-09 (the footer), TH-01 (extended), TH-05 (no), TS-08, TS-09 (`Lab-avatars*`), TV-06, TU-01 (`name.tap()`), TU-02 (twin), TU-04 (optional).
- **Files and size:** about 15 text files, about 460 lines; 22 references (A03 x 18, `Lab-avatars` 4).
- **Inventory:** the A03 rows' Notes (including the stale "the field isn't focused on arrival" and "no account-safe fallback" claims at INV lines 50, 395, 396), new `built from spec` row `A03-profile-name-refused` (drawn as `A03-profile-refused`); the Known differences for Avatar, text alignment, focus, keyboard. **Questions:** FQ70 gains its bullet (the too-long and name-refused words).
- **Done:** the six A03 states match frames 10, 11, 20, 27 as far as the harness shows them; the Avatar table test green on Linux; `Lab-avatars` shows the new specimens against the sheet's; the person glyph's centring and stroke judged against the sheet and logged as a difference if it differs (`profile.md` 6.16); the keyboard-dependent behaviours listed as device checks.

### PR 6: `ios/b0-adopt-header` (the header before a club and the tabs; closes the slice)

- **What:** `NoClubHeader` rectangles (+ Add [241, 56, 80, 44], Account [329, 56, 44, 44], avatar [337, 64, 28, 28]; stacked at every accessibility size with + Add leading; the wordmark 8 below the top), the opaque canvas band behind the status bar, the page titles 32 under the header on Friends and Memories (F-15), Retry's hint per tab and Account's hint (W-12, X-24 hint half, F-18), Private drafts' folder 16 in (BM-01), Go to Home leading (PR 4's change, now consumed), the Lab header specimens. Kept as built (no code): the failure title at `emptyTitle` 25, the body ink, the no-club gaps, G06's two lines as one text. Findings: `root.md` parts D and E (X-23, D-15, W-13, VM-05, F-14, X-13, F-15, W-12, X-24, F-18, BM-01).
- **Tests:** TS-09 (`Lab-header*`, new `Lab-header-320`), TS-10, TV-07; `TabsAnnouncementTests` unchanged.
- **Files and size:** about 17 text files, about 330 lines; 45 references (Tabs 39, Lab 6) plus the 9 frames' sheets.
- **Inventory:** the tabs' rows rewritten after the build (`G06-no-club`, `F01-no-club`, `M01-no-club`, the loading and error rows: records 2.5, 2.7); the final counts line (251 states, 131 with a render, 25 built from spec) and the brand line; the needs list (`docs/design/handoff-7/ios-lane-needs.md`: items annotated, a section for check section 7's open points, new numbers 47 onwards, `records.md` 4); the journal's design line and audit rows (T43, T46, T47, T49, spec 29). **Questions:** FQ58 and FQ90 gain their bullets and the stale one at line 414 is replaced.
- **Done:** all 39 Tabs references match frames 13-16, 21, 22, 28-30 and the contracts, with the header's rectangles asserted if the plan adds TS-10's geometry check; the Lab header specimens at 320 and AX match the sheet; the TestFlight notes (section 10) written; the by-hand full `ios` run (no `ios_version`) for the slice's last head, `ios-full/`, read as the gate's picture; the founder approves, and the slice closes with the journal's Next pointing at slice 12.

### Every PR's common done

`ci` green at the head (including `journal_check.py --branch`); `ios` green at the head with every reference matching, and a second green run (a re-run); iOS 18.6 and 17.5 dispatches green; the contact sheets read and the PR body listing each state's differences against its frame and the contracts, with before and after for each changed reference; the independent review (a fresh subagent) with every finding fixed or answered; the INVENTORY, QUESTIONS and journal edits above; the founder's approval at the head; squash-merge through REST at that head.

## 9. Risks, ambiguities and disagreements

**Decisions for the plan-writer (each with a default)**

1. **Where the new VoiceOver tests live.** In `*SnapshotTests` they skip on 18.6 and 17.5 (`ios_steps.py:143`), as the existing 16 sign-in, root and tabs readings do; the UI tests (all iOS versions) can read labels, enabled state and `value`, but not hints. Default: move the fakes to a shared file (PR 3, one source line) and put new semantic readings in `TadayoTests`; keep the existing ones where they are.
2. **`A02-code-typed` (records D1).** Frame 24 draws a typed code with Verify available; `A02-code` the app snapshots is the arrival; no snapshot has a typed code with Verify available (`A02-code-verifying` types 529614 but is busy). Default: add the state, its test and its row (a name the peers share). Alternative: note frame 24 only (251 states become 250).
3. **A hanging DEBUG launch mode (TU-03).** The only automated proof that a field is read-only while busy with the keyboard still up, and that a failure stays reachable, is a UI test that hangs or fails a request; `FakeAccounts.update` always succeeds today. Default: build it in PR 3 as a small DEBUG-only mode and extend it in PRs 4 and 5, since the alternative is device checks only. It is a test seam, not product; say so in the PR.
4. **Pure layout decisions in `TadayoCore`.** The Verify pin's rule, the busy group's fit and the footer's 12 or 44 can be unit tested on Linux if written as plain functions; `TadayoDesign` cannot be tested on Linux at all. Default: yes, small functions with their tests, each used by exactly one view (not speculative); the decision of what "would sit under the keyboard" means is signin.md F1's open threshold.
5. **Staging the text action.** The text action's alignment is a shared change with 21 references taken twice (A03 18, `M01-no-club` 3). A temporary `alignment` parameter would avoid them and be removed in PR 6. Default: no parameter (a second code path for one PR cycle), accept the 21, and call each of them alignment-only in the PR.
6. **A test host standing in for the keyboard (TS-11).** It would let the pinned Verify and Continue's 12-above be snapshotted, at the price of a fake inset that real keyboards do not behave like (hardware keyboards, the predictive bar). Default: no; unit-test the decision (TL-09) and check the layout on a device.

**Ambiguities and disagreements that bear on tests**

- **A02-code arrival vs frame 24** (above); the typed-code state's name is the peers' and the contact sheet pairs by name.
- **Verify pin:** the written rule pins at every size; frame 19 pins; the critic's ruling pins only where it would otherwise sit under the keyboard (V-02, X-04). The harness has no keyboard, so no snapshot proves it. `safeAreaInset` is read last by VoiceOver, which breaks `codeAccessibilityOrder` unless the order is forced and checked (TV-05).
- **Back on A02-code:** frames 4 and 7 draw it enabled in action ink; `codeBack` "only while idle" and IMPL line 40 make it unavailable; the app hides it. Whether unavailable means hidden or dimmed is unanswered (check section 7). The snapshot will differ from frames 4 and 7 there.
- **Arrival focus on A03 (C-01):** focus unless VoiceOver is running; not testable in a hosted test without an injected condition; the UI tests run with VoiceOver off and so prove only the "on" side.
- **Region arithmetic (F2):** written gaps 12 + 36 + 16 = 64; frames 8 + 36 + 16 = 60; today 12 + 36 + 12 = 60. The written values win (check 4, item 6), so the snapshots will be 4 points off frames 5 and 8 by design.
- **Frame 20's 166-point hole** and frame 11's 128-point reveal offset are schematic and not built (FM-01, `profile.md` 6.5, 6.11).
- **`-xl` vs the frames at accessibility 5:** frames 19, 20 and 22 are scrolled viewports with a keyboard; the app's `-xl` is a whole 393 x 2200 screen. The address breaks differ (C-02). Compared by order and content.
- **Frame 17 (the sheet) cannot be opened by ImageMagick here** (`records.md` D2); Lab comparisons use Pillow or the sheet's SVG and `component-sample-index.json`.
- **VoiceOver naming of the cover:** D-16 against T47 and R-02 is the drop card's, already built; unaffected.
- **R-12:** Home's two announcements; the app keeps one per resolve (`TabsAnnouncementTests`); the question goes to the next brief.
- **Placeholder equal to label (W-08):** what a SwiftUI field with a label and a prompt exposes cannot be known on Linux; TV-03 reads `value` on an empty field and the fix follows.
- **State naming shared with the peers:** `A02-code-typed`, `A02-code-error-resend-failed-network`, `A02-email-signed-out`, `global-leaving`, `Lab-header-320`. A mismatch silently loses the render beside the snapshot (`no_render_note`).

**Risks**

- **macOS minutes** (section 2.6): batch pushes; `ios` cancels the previous run on a push.
- **Binary growth:** about 177 PNG writes (30 to 35 MB) and 12 MB of frames and sheet.
- **Spinner scale:** a 16-point indicator is a `UIActivityIndicatorView` scaled or constrained (C1 step 2); `Spinners.check` needs one in the tree when `busy`; the stilling swizzle is on `startAnimating` (`LIMITATIONS`: the indicator's frame otherwise differs run to run). If the scaling draws differently from the frame, record a Known difference rather than replace the indicator (T45).
- **Flaky hosted VoiceOver:** the reader depends on `_AXSSetAutomationEnabled` and a 10 s probe (`AccessibilityElements.swift:62-74`); more readings mean more exposure; they already ran green on `main`.
- **`tools-tests` reads `INVENTORY.md`** (`ios_steps_test.py:843-848`): keep every row's shape; renaming a state drops it from the set.
- **The old frames' differences recorded in INV go stale** if a PR forgets to rewrite them: INV lines 50, 395, 396 and the "Known differences" bullets `records.md` 2.9 lists; PRs 3 to 6 each own theirs.
- **UI tests are slow** (about 21 s each); three more cost about a minute a run.

## 10. Device and TestFlight checks (for the notes of slice 12)

None of these can be judged in a cloud session or a hosted test (`CLAUDE.md`, "Environment"). Exact steps for the founder, one block per area; each is listed where it first becomes true.

1. **Hand-over from the OS launch screen to the wait (PR 2):** cold-launch signed in; the canvas and the wait appear with no flash; then with the account request failing (airplane mode): "Couldn’t load your account." over "Check your connection and try again." and Retry.
2. **VoiceOver on, each screen (PRs 2-6):** the wait says "Loading your account…" once, without moving focus; each failure says title then line once; Retry's hint; Account's hint "Open your account."; Send a code busy says "Sending a code." once and the button reads "In progress"; Verify code; the resend row ("Send a new code is available.", success with the address, never logged); A03: focus is not taken, "Saving your profile." once; the too-long line; Leave sign-in and Add photo dimmed while saving.
3. **Keyboard (PRs 4, 5):** Verify code stays reachable when the keyboard is up at the default and the largest text; Continue is 12 points above the keyboard, and 44 above the bottom with no keyboard (also with a hardware keyboard, which hides the software one); a failure line stays reachable above Continue with the keyboard up and the keyboard is not dismissed.
4. **Read-only while busy (PRs 3-5):** with the network slow or off, tap Send a code and try to type: nothing changes and the keyboard stays; after the failure, typing works again.
5. **Leave sign-in (PRs 3, 5):** from A02-age and A03 it shows "Leaving sign-in…" and returns to an empty email field (FQ93); from a sign-in the server ended it shows the notice once; from the Lab's Log out (builds that point at dev).
6. **The header (PR 6):** the opaque band behind the status bar while scrolling, on iOS 17 or 18 and on iOS 26, on an iPhone with and without the Dynamic Island; the header stacked at the accessibility sizes on a real screen; Switch Control reaching + Add and Account.
7. **A03's person glyph (PR 5):** type a name starting with an emoji, a symbol, a letter, a digit.

## Appendix A. Sources read

- `apps/ios/project.yml`; `apps/ios/TadayoTests/*.swift` (6), `TadayoSnapshotTests/*.swift` (6), `TadayoUITests/SignInUITests.swift`, `Tadayo/App/UITestLaunch.swift`, the `__Snapshots__` folders (187 files, measured with `ls`, `du`, `identify`).
- `packages/swift/TadayoCore/Tests/TadayoCoreTests/*.swift` (10 files), `TadayoCore/Sources` (SignInModel, ProfileModel, RootModel), `TadayoDesign` components (PrimaryButton, TextAction, NoClubHeader, Avatar, InlineError, LabelledField), `Metrics.swift`.
- `.github/workflows/ios.yml`, `ci.yml`; `tools/ci/ios_steps.py`, `ci_steps.py`, `ios_steps_test.py`; `docs/TECH-DESIGN.md`, `docs/GITHUB.md`, `docs/DESIGN-HANDOFF.md`, `docs/plans/ios-slice-11-second-part.md`, `docs/JOURNAL.md` (block 1.3, entries of 2026-11-07), `docs/QUESTIONS.md`, `design/reference/INVENTORY.md`, `.github/pull_request_template.md`.
- `docs/design/handoff-7/check/handoff-7-check.md` (section 8 above all) and `handoff-7-findings.md`; `design/reference/claude-design/handoff-7/` (`frame-manifest.json`, `copy-contracts.json`, `component-contracts.json`, `frames/`).
- Evidence branch (read-only, `git show origin/evidence:...`): `main/a569278/ios/run.json`, `index.md`, `logs/test-summary.json`, `logs/test.log`.
- Peer parts: `signin.md`, `profile.md`, `root.md`, `records.md` (skimmed for names and proposals; not edited).
