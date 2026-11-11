# Handoff 7 adoption, key `root`: the start-up route and its failures, the launch screen, the header before a club, the tabs with no club

> Appendix to `docs/plans/ios-b0-adopt-handoff-7.md`, written on 11 November 2026 for the ios thread's plan from `main` at `a569278` (the code its line numbers cite). **Where it and the plan disagree, the plan wins**: its section 3 lists the corrections. Its scratch scripts were throwaway and are not kept.

Written for the engineer who plans the slice "adopts handoff 7 for the screens on `main`" (journal block 1.3's Next, step 3; `docs/design/handoff-7/check/handoff-7-check.md` section 8). Nothing in the repository was edited. Each part has the same five headings: **Now**, **Delivery**, **Exact change**, **Tests and snapshots**, **Ambiguities**. Parts 0 to 2 say what the whole thing is and the numbers every part uses; parts 3 to 7 are the work; parts 8 to 13 are the lists (announcements, kept as built, strings, shared files, tests, documents); part 14 is every open point with the default taken.

Abbreviations. `check` = `docs/design/handoff-7/check/handoff-7-check.md` (cited by line). `findings` = `docs/design/handoff-7/check/handoff-7-findings.md` (cited by id, with its line when it carries the argument). `CC` = `design/reference/claude-design/handoff-7/component-contracts.json`, key path `handoff7.*`. `CP` = `.../copy-contracts.json`, `handoff7.*`. `IMPL` = `.../IMPLEMENTATION.md` (section 4 is lines 74 to 100). `frames/<name>` = `.../frames/<name>.svg` and `.png`. `SC` = `.../screen-copy.json`. `H6` = `component-contracts.json` `handoff6.*`.

---

## 0. Scope, sources and how the numbers were obtained

**My part (key `root`).** The root's start-up route and its failures (`apps/ios/Tadayo/App/*.swift`, `RootModel` in `TadayoCore`), the OS launch screen (`LaunchScreenTests`, `project.yml`), the header before a club (`NoClubHeader.swift`, `TabHeader`/`TabScroll` in `TabLayout.swift`), and the tabs with no club (`TabLayout.swift`, `TabsView.swift`, `NoClubTabs.swift`, `PrivateDraftsEntry.swift`).

**Findings covered.** X-21, W-09, R-09, V-14 (the wait); X-22 (root failure geometry and hints; V-11 for the root part); X-23, D-15, W-13, VM-05, F-14 (header); W-12, X-13, F-18 (hints); F-15 (page titles); BM-01 (Private drafts folder); F-04, X-24, WM-03, V-06 (failure title role, kept); F-24, F-25, X-08, V-13 (gaps, kept); F-01, X-02, W-03, R-04 and F-02, X-01, W-04, R-03, V-15 (two lines kept); F-05, X-07, V-05, W-05, FM-02 (body ink kept); F-16 (initial, FQ58); F-17 (loading placement, kept); R-10, R-12, W-11, RM-01, RM-02 (announcements and words); D-25, W-14 (keys); V-24, V-18 (kept); X-25 (shared, Go to Home); X-33, X-34 (documents).

**Order in which conflicting sources were weighed** (the check's own order): the founder's answers and Defaults (FQ58, FQ85, FQ89, FQ90 in `docs/QUESTIONS.md`); then the check's critic rulings (`findings` lines 1542 to 1552) and its section 8 "Kept as built" (check lines 240 to 250); then the delivery's written contracts (`CC`, `CP`, `IMPL`); then the frames; then each finding's own "Meanwhile". Where a finding's "Meanwhile" and a critic ruling disagree, the ruling wins (the body ink: W-05 says follow the frames, the critic says keep secondaryText; the failure title role: X-24 and WM-03 say 32, the critic says keep emptyTitle 25).

**How the delivery's numbers were read.** Frames are SVG on a 393 by 852 canvas. Rectangles come from `SC` `controls[].rect` and from the SVG (a throwaway script read each text run's origin, size and fill, each rect and path with its transform). A text's line box is baseline minus 0.82 times the size, with the role's line height below it (utilityTitle 35, emptyTitle 30, body 23, metadata 18). That is the measure `H6.spacing.basis` names ("Gaps measure line-box edges, not baselines or ink bounds") and the check uses. The frames draw Arimo, the app draws SF, and the frames put the status bar's safe-area top at 59 where the committed iPhone 17 snapshots have 62 (`ScreenSnapshot.assert` asks 59, the key window gives 62), so every app-versus-frame comparison carries a constant vertical offset of 3 and a few points of font difference. App positions below are layout constants from the code, or ink bands measured from the committed snapshots under `apps/ios/TadayoSnapshotTests/__Snapshots__/`, and are marked as such.

**Verification limits in a cloud session.** Only `TadayoCore` builds and tests on Linux (`swift test --package-path packages/swift/TadayoCore`); `TadayoDesign` and the app compile only on the `ios` workflow (CLAUDE.md, Environment). References are committed and CI never records (`docs/TECH-DESIGN.md` line 68 to 70): a changed picture is updated from the evidence branch only once it matches the render and the contracts, with before and after in the PR.

---

## 1. The whole slice for my part, in one table

| # | Change | Files | Source | Kind |
|---|---|---|---|---|
| 1 | Split the start-up route: add a leaving case; draw a native indicator over "Loading your account…" or "Leaving sign-in…", polite once, no header, no tabs | `RootModel.swift`, `TadayoApp.swift`, new `RootWait.swift` (name free), catalog | X-21, W-09, R-09, V-14 | adopt |
| 2 | Root failure: title where the sign-in titles sit, Retry's foot 44 above the safe area, one hint per failure | `RootFailure.swift` (+ `SetupLayout.swift`, shared) | X-22, V-11, W-12 | adopt |
| 3 | Header: + Add [241,56,80,44], Account [329,56,44,44], avatar [337,64,28,28]; stack at every accessibility size with + Add leading; Account hint | `NoClubHeader.swift`, `Metrics.swift`, `TabHeader`, `LabView.swift` | X-23, D-15, W-13, VM-05, F-14, X-13 | adopt |
| 4 | Opaque canvas band behind the status bar, no extra scroll-edge effect | `TabScroll` in `TabLayout.swift` | W-13, `CC handoff7.noClubRootHeader.scroll`, `IMPL` line 90 | adopt |
| 5 | Friends and Memories page titles 32 under the header | `TabGap.pageTitle` | F-15 | adopt |
| 6 | Retry hint per tab | `ClubTab`, `TabContent` | W-12, X-24 (hint half), F-18 | adopt |
| 7 | Private drafts row: folder box 16 in (title at x76) | `PrivateDraftsEntry.swift` | BM-01 | adopt (inset only) |
| 8 | Failure title stays emptyTitle 25; failure and empty lines stay secondaryText; every no-club gap except the page title stays; G06's two lines stay one text; M01 line stays; both G06 lines at every size | none | F-04, F-05, F-24, F-25, X-08, F-01, X-02, F-02, X-01 | keep |
| 9 | Launch screen stays canvas only; only comments change | `project.yml`, `LaunchScreenTests.swift` | X-21, `CC handoff7.launch.iOSLaunchScreen` | keep |
| 10 | Words: every delivered string for these screens already exists word for word; two wait strings, one hint and six Retry hints are new | `Localizable.xcstrings` | `CP` | add |
| 11 | INVENTORY and QUESTIONS updates for my states | documents | X-33, X-34, RM-02 | document |

Go to Home becomes leading through the sign-in lane's shared `TextActionStyle` change (X-25), which I only consume (part 11).

---

## 2. The delivery's rectangles, the stacking rule, the band and the announcements (the numbers every part uses)

### 2.1 The header's rectangles (393 points wide)

`CC handoff7.noClubRootHeader` (read in full), `SC` for G06-no-club, H01-error-no-club, H01-loading-no-club, G06-no-club-xl, and `IMPL` line 88.

| Piece | Default text size | At every accessibility size (the contract's `largest`, drawn at accessibility5 in `G06-no-club-xl`) |
|---|---|---|
| Header origin and height | y 56, height 44 (y56 to 100) | y 56, `headerHeight` 124 (y56 to 180) |
| Wordmark (96 wide, an image, not interactive) | `wordmarkRect` [20, 64, 96, 30.43]: 8 below the header's top | [20, 64, 96, 30.43]: the wordmark band is 48 high (the actions row starts at y104) |
| + Add target | `addTarget` [241, 56, 80, 44]; its label starts at x249 (8 inside), baseline 80.3, 15 pt, `action`; right edge 321, 8 before Account's | `addTarget` [20, 104, 249, 76]; the label starts at x20 (no inset), 49 pt, baseline 152.18 |
| Account target | `accountTarget` [329, 56, 44, 44]: right edge 373, 20 from the screen edge | [329, 120, 44, 44], centred in the 76-high actions row |
| Avatar (28 circle, initial "B" while an account record is loaded) | `accountAvatarRect` [337, 64, 28, 28]: 8 inside the target, ends 28 from the edge | [337, 128, 28, 28] |
| Content start | header bottom + `H6.spacing.homeContentTopAfterHeader` 32 (`contentStart`), measured line box to line box | same: the title's line box starts at y212 in the AX5 frame (baseline 257.92 at 56 pt) |

What the rectangles imply, so the plan can build without inventing a rule:
- Account's target ends 20 from the edge, so the screen's trailing inset is 20 and not today's 12 (`Spacing.inset - overhang`, `NoClubHeader.swift` line 63). The avatar therefore moves 8 left.
- The gap between the two targets is 8 (329 minus 321). Today's is 4 (`HStack(spacing: Spacing.xs)`, line 75).
- + Add's target is a fixed-looking 80 wide at the default size, where its words are about 41 to 43 wide (the SVG's last glyph is at 281.9; SF measures about 43, so today's target is 59 = words + 2 x 8). 80 is not words + 16 and the contract names no rule; the label sits 8 inside the target's leading edge.
- At accessibility5 the target is 249 wide and 76 high with the label (about 135 wide, 65.3 high at 49 pt) flush with the target's leading edge. 249 and 76 are not derived from the label by any stated rule (80/15 = 5.3 em, 249/49 = 5.1 em; 76 - 65.3 = 10.7). They are the only source for the target's size; the label's position (x20) and Account's rectangle are what a picture shows. See ambiguity A4.

### 2.2 The stacking rule at the accessibility sizes

`CC handoff7.noClubRootHeader.largest.layout`: "At all accessibility categories, wordmark row then actions row." `IMPL` line 88: "At accessibility sizes the header stacks: wordmark row, then + Add and Account. Wordmark remains 96 wide... No text cap is applied to content controls." Check line 103 and 224: "stack at every accessibility size, with + Add leading". D-15 (findings l.477): "Stack when `dynamicTypeSize.isAccessibilitySize`. In the stacked row, + Add goes at the leading inset and Account at the trailing edge." This replaces the built rule (stack only when the row overflows, actions trailing together: `ViewThatFits`, `NoClubHeader.swift` lines 51 to 61).

### 2.3 The opaque canvas band

`CC handoff7.noClubRootHeader.scroll`: "Header is content and scrolls with the single body; no custom navigation-bar copy. Status-bar safe area remains opaque canvas on iOS17/18/26; no custom glass or extra scroll-edge effect. Native bottom tab bar owns its version-specific system treatment." `IMPL` line 90: "On iOS17, 18 and 26 an opaque canvas safe-area band remains behind the status bar; content is clipped below it. Do not duplicate the header in a navigation bar or add a glass treatment to this content header." The frame shows it: `G06-no-club-xl.svg` clips the body to a rect (0, 56, 393, 717) and draws the status area above it. W-13 (findings l.696): "adds an opaque canvas band behind the status bar in TabScroll with no extra scroll-edge treatment." Band height is the status-bar safe area (the frames draw 56, the app's is the device's safe-area top).

### 2.4 The announcements, once only

Table in part 8. In one line: the root's two waits are said once each time they appear (polite, no focus move), the root failures and the tab failures keep being said once as title then line, "Home updated." once on Home only, the not-in-build line once, Friends and Memories say nothing when the list returns. The delivery's `vo.failure.root.*` and `vo.failure.tabs.error.*` (second line only) are never used (W-11, RM-01).

### 2.5 What must stay as built

Part 9 (the check's "Kept as built" list, section 4's items, and the smaller rulings, each with its finding).

---

## 3. Part A: the root's wait (start-up and Leave sign-in)

### Now

- `RootModel.Route` has one case, `starting`, for two different waits (`packages/swift/TadayoCore/Sources/TadayoCore/RootModel.swift` lines 16 to 19): reading the session and the account, and Leave sign-in ending the session. `start()` sets it (line 97), `endSession()` sets it (line 135), `readAccount()` keeps it through `accounts.me()` (lines 200 to 217), `retry()` reaches it through `start()` or `leave()` (lines 105 to 115). A verified code does not reach it: `signedIn(_:)` (lines 190 to 198) leaves the route at `.signIn` while the account is read, which is A02-code's busy Verify code, as R-09 wants. Both `.failure(.signedOut)` branches call `leave()` (lines 169 to 170 and 212 to 213), so a server-ended sign-in also passes through the wait (R-10).
- `RoutedView` draws the canvas alone for it: `apps/ios/Tadayo/App/TadayoApp.swift` lines 59 to 60 (`case .starting: Palette.canvas.ignoresSafeArea()`), documented on lines 32 to 35 as "the canvas alone, as Tadayo's launch screen shows it (`global-launch`)". `RootView` (lines 18 to 30) runs `graph.root.start()` in a `.task` on `RoutedView`; `.inert` and `.unconfigured` (hosting tests, a Release build with no Supabase settings) draw the canvas alone and stay so.
- The only consumer of `Route` is that one `switch` (a repository-wide search finds no other), so a new case is a compile error until handled.
- Tests: `RootSnapshotTests.testGlobalLaunch` (lines 14 to 22) snapshots `RoutedView(root:)` of a fresh root, asserting `root.route == .starting`, named `global-launch`. `RootModelTests` assert `.starting` at lines 37 (before `start()`), 249 (during `left`, i.e. during Leave), 389 and 395 (during a Leave held by a gate). INVENTORY row 262 reads "the canvas alone".

### Delivery

Written only; no frame draws either wait (`frame-manifest.json` has no `global-launch` or `global-leaving`; `SC` has none; check line 635 and findings W-09, V-14 say so).
- `CC handoff7.launch.runtimeAccountLoading`: "Native indeterminate spinner and root.loading. No header or tabs. Do not hold a static launch screen during a network wait."
- `CC handoff7.launch.runtimeLeaving`: "Native spinner and root.leaving; no header/tabs. A02-code instead keeps its busy Verify while the verified account read runs."
- `CC handoff7.launch.retryRead`: "Shows runtime account loading, sign-in retained." `launch.limits`: "Use actual request timeout/cancellation. No invented wait promise."
- `CC handoff7.launch.iOSLaunchScreen`: only the adaptive canvas, "no logo, wordmark, spinner or text".
- `CP handoff7.root.loading` "Loading your account…" and `root.leaving` "Leaving sign-in…" (U+2026 ellipsis); `announcementPolicy.loading`: "One polite announcement on state entry; no timer announcements." No `vo.*` key for either, so the visible words are the spoken words (W-09's second reviewer).
- `IMPL` lines 76 to 78: replace the static screen "with a real native spinner and Loading your account…; no header or tabs before the route is known. During session removal use Leaving sign-in… with the same form. The verified-code case keeps its existing busy Verify code instead of flashing a separate loading page... Never invent a completion percentage or a timeout promise."
- No type role, ink, position or delay is given (W-09, V-14). The check's meanwhile (W-09 l.669; V-14 l.1014): build the form of frame 13's loading body, indicator over a metadata label in secondaryText as `TabContent.loading` builds it, no header or tabs, said politely once, shown as soon as the route is starting, no invented delay; mark `global-launch` built from spec; the next brief asks for the frame and whether the indicator waits a moment (check line 176).

### Exact change

1. **`RootModel`.** Add `Route.leaving` ("Leave sign-in, or a session the server ended, is removing the session"). `endSession()` sets `.leaving` where it sets `.starting` now (line 135). `start()` keeps `.starting`, whose doc becomes "the session and the account are being read: launch, and Retry". Nothing else moves: `leave()`'s single-flight, the epoch, `retry()`'s three branches. (R-09 allows "or carries the reason with it"; a second case is the smaller change and keeps `RoutedView`'s switch exhaustive.)
2. **A new app view** (suggested `apps/ios/Tadayo/App/RootWait.swift`, a `Kind` of `.loading` and `.leaving`, each with its `words: LocalizedStringResource` and a `spoken` string like `RootFailure.Kind.spoken`). Form, from W-09's meanwhile:
   - the system's `ProgressView()` tinted `Palette.secondaryText`, hidden from VoiceOver, over `Text(words)` in `.metadata` and `Palette.secondaryText`, 20 apart (`Spacing.xl`), centred, wrapping naturally, two fifths of the way down the space between the safe areas (the same two-equal-spacers-above, three-below arrangement as `TabContent.loading`, `TabLayout.swift` lines 226 to 245; sharing that arrangement as one small view used by both is allowed and avoids two copies, but the tab snapshots must not change);
   - its own `Palette.canvas.ignoresSafeArea()` background, so no system background shows between the launch screen and this view;
   - no header, no tabs, no navigation bar, no Retry;
   - `.announcing(words, politely: true, initial: true)` (`SetupLayout.swift` lines 82 to 90) so the words are said once when the view appears, without moving focus; the label is the one VoiceOver element (as `TabsSnapshotTests.testWhileLoadingOnlyTheLabelIsReadNotTheIndicator` asserts for the tabs).
3. **`RoutedView`**: `.starting` draws the wait with `.loading`, `.leaving` with `.leaving`. Update the comments at `TadayoApp.swift` lines 5 to 6 and 32 to 35.
4. **Strings** (`apps/ios/Tadayo/Localizable.xcstrings`): add `root.loading` = "Loading your account…" and `root.leaving` = "Leaving sign-in…", comments naming `CP handoff7.root.loading` and `root.leaving` and FQ89. No other word in this part.
5. **Launch screen unchanged** (part 5).
6. **Comments to rewrite**: `RootFailure.swift` lines 5 to 9 ("Built from spec... until handoff 7 gives them"), `LaunchScreenTests.swift` line 8.

### Tests and snapshots

- `RootModelTests` (runs on Linux): change lines 249, 389 and 395 from `.starting` to `.leaving` (the first two are what a Leave looks like: `leavingPurgesOnceTheServerHasHeardAndBeforeSignInShows`, `twoLeavesAtOnceEndTheSessionOnce`); line 37 stays. Add: a Retry from `.failed` shows `.starting` until the account answers; a Retry from `.leaveFailed` shows `.leaving` again; a verified code's account read leaves the route at `.signIn` (R-09: "A02-code stays with Verify code busy"; no test names this today); a server-ended answer during an account read shows `.leaving` then sign-in. A gate (`Gate` and `auth.duringSignOut`, `RootModelTests` line 379 ff.) already exists for the held-Leave case; `FakeAccounts` may need a held `me()` for the read case.
- `RootSnapshotTests`: `testGlobalLaunch` keeps snapshotting `RoutedView` of a fresh root, now a spinner over the label, so it must pass `busy: true` (`ScreenSnapshot.assert(..., busy:)`: `Spinners.check` demands an indicator in a busy state and forbids a turning one, `ScreenSnapshots.swift` lines 58 to 80, 136 ff.). New `testGlobalLeaving` named `global-leaving` (snapshot the wait view directly with `.leaving`, as the failure tests snapshot `RootFailure(kind:)` directly, since a root held in `.leaving` needs a gated sign-out). Both in light, dark and xl (the harness gives the three: `state`, `state-dark`, `state-xl`).
- New accessibility tests: each wait's elements are exactly its label (no indicator, no button, no heading required); `Kind.spoken` equals the visible words; a wait holds no "Tadayo", "+ Add" or "Account" (no header).
- References that change or arrive: `RootSnapshotTests/testGlobalLaunch.global-launch{,-dark,-xl}.png` change; `testGlobalLeaving.global-leaving{,-dark,-xl}.png` are new.
- Not testable in the hosted tests (the TestFlight notes ask for them, as for the existing announcements): that VoiceOver says it once; the hand-over from the OS launch screen to the wait.

### Ambiguities

- **A1. Does the spinner show for a launch with no session?** The check's meanwhile is "as soon as the route is starting, no invented delay". That means a signed-out first launch (the keychain read takes milliseconds, then A02-email) draws the spinner and the label for a frame or a few, and says "Loading your account…" when there is no account to load. The same happens on Retry after "Couldn’t keep you signed in.", where nothing is kept and `start()` goes straight to sign-in. The delivery's own wording is "during a network wait" (`launch.runtimeAccountLoading`), which fits showing it only once an account read begins (after `session.isSignedIn` is true), with the canvas alone before. Both are reversible. Default taken: the check's literal reading (the simplest, and the snapshot test of a fresh root keeps working), with the refinement ready in one place (`start()` would set a loading case after the session check). The check puts "whether the start-up spinner waits a moment" in its next brief (check line 176). I recommend the coordinator note this in the PR and look at it on a device first.
- **A2. The wait's role, ink and position have no source** (W-09). Default: `.metadata`, `secondaryText`, 20 under the indicator, two fifths down, as the tabs' loading shell. The frames' loading shell sits about 25 to 32 points higher than the app's (F-17); the root has no frame at all.
- **A3. "Leaving sign-in…" also shows when the server ended the sign-in** and the person did nothing (R-10, findings l.852). Default: as written, for every removal; the question goes to the next brief.
- **A4 (Lab Log out).** The Lab's Log out (`LabView(logOut:)`, builds that point at dev) ends the session the same way and now shows the wait too. No source says otherwise.

---

## 4. Part B: the root's failures (`RootFailure.swift`)

### Now

`apps/ios/Tadayo/App/RootFailure.swift` (61 lines): `Kind` is `.account(Failure)`, `.leave`, `.keep` with titles `root.error.account`, `.leave`, `.keep` (lines 21 to 27), a line from `RootModel.Failure.line` (lines 29 to 34: "Check your connection and try again." only when no answer came, else "Try again."), and `spoken` = title, a space, line (lines 36 to 39). The body is `SetupScroll { SetupHeading(title:, subtitle:) }` with `.safeAreaInset(.bottom) { SetupFooter(bottom: Spacing.s) { Button Retry .tadayoPrimary } }` and `.announcing(kind.spoken, initial: true)` (lines 45 to 60). So the title starts 20 under the safe area (`SetupScroll`'s `.padding(.top, Spacing.xl)`, `SetupLayout.swift` line 19), Retry's footer ends 8 above the safe-area bottom, Retry has no hint, the subtitle is `secondaryText`, and the gap from title to line is `SetupHeading`'s default 16.

Measured from the committed snapshot `RootSnapshotTests/testGlobalLaunchFailedNetwork.global-launch-failed-network.png` (iPhone 17, safe-area top 62, bottom 34): the title's first line has its ink top at y89.5, the line is at y178 to 194, Retry is y759.5 to 810 (bottom 810 = 852 - 42). For comparison the app's A02-age title, which sits under a navigation bar, has its ink top at y142.5 (`SignInSnapshotTests/testA02Age.A02-age.png`).

### Delivery

- Frame 12, `frames/global-launch-failed-network.svg` (the only root failure frame; `global-launch-refused`, `global-leave-failed` and `global-sign-in-not-kept` are written only): no status-bar content except the clock, no navigation bar, header, tabs or avatar. Title "Couldn’t load your / account." in 32/35 (baselines 153.24 and 188.24, x20, `#182B25`); the line "Check your connection and try again." at 17 (baseline 238.94, `#182B25`, primaryText); Retry [20, 724, 353, 50], fill `#284CDB`, label baseline 751.12. SC controls: Retry [20,724,353,50] with an empty hint.
- The title's first baseline, 153.24, is the sign-in titles' baseline (A02-age's, V-24 l.1083). X-22 (findings l.1360): "The root failure frame sets the title where the sign-in screens' titles sit under their navigation bar, and puts Retry 44 above the bottom safe area." Retry's bottom 774 = 818 - 44 = `H7 spacing.formFooterToSafeAreaBottom` 44.
- The title-to-line gap is 28 line box to line box (title box ends 197, line box starts 225); no contract value names it (V-24: "The app keeps its values").
- Words confirmed in writing (`CP handoff7.root.account.title`, `root.network`, `root.refused`, `root.leave.title`, `root.keep.title`; `IMPL` line 80): identical to the built `root.error.*` and `common.error.*`. `FQ89` stays open (RM-02): Claude Design agreeing is not the founder answering.
- Hints (`CP`): `vo.retryAccount.hint` "Load your account again.", `vo.retryLeave.hint` "Remove the sign-in from this iPhone again.", `vo.retryKeep.hint` "Return to email sign-in. Your email address is kept." The label stays "Retry" (`root.retry`). `SC` leaves every hint empty; the contracts win (F-18, X-13, W-12).
- Spoken: title then line as shown, once (`CP vo.root.account.network/refused`, `vo.root.leave.refused`, `vo.root.keep.refused` equal title + space + line; `announcementPolicy.localRootFailures`). The four `vo.failure.root.*` and `vo.failure.tabs.error.*` hold only the line and are not used (W-11, RM-01).
- Kept (critic, W-05; F-05, X-07): the line stays `secondaryText` where frame 12 draws `primaryText`.

### Exact change

1. **Title position.** Put the title where the sign-in titles sit. A constant 44 (the iOS 17/18 inline bar) is not enough on the iOS 26 runner: the snapshots show the offset needed is about +53 (ink top 89.5 to 142.5), because the sign-in screens sit under a real bar and whatever the system adds with it. So do not hard-code the bar's height. Two ways, either is allowed; pick one in the plan: (a) hold `RootFailure` in the same container the sign-in screens use, a `NavigationStack` with an empty inline bar and a hidden bar background, so the system supplies the offset by construction; (b) take one measured value from the sign-in screens' own layout and share it. After the change the title's ink top in the snapshot must equal A02-age's (142.5 on the iPhone 17 run). Frame 12 has no visible bar, an empty bar draws nothing, and VoiceOver finds no bar element.
2. **Retry's foot 44 above the bottom safe area.** `SetupFooter(bottom: 44)`: `SetupGap.profileFooter` (`Spacing.xxxl + Spacing.m`, `SetupLayout.swift` line 35) is already 44 and named for A03; the sign-in lane needs the same 44 for A02-age (F-10, V-11). Use one shared constant, named for what it is (`formFooterToSafeAreaBottom`), and have both lanes use it (part 11).
3. **Hints.** `Kind.retryHint: LocalizedStringResource` (account, leave, keep) and `.accessibilityHint(Text(kind.retryHint))` on the Retry button. Three new keys (part 10).
4. **Unchanged:** the words, the order title then line, `spoken`, the `.announcing(kind.spoken, initial: true)` (once as it shows), secondaryText for the line, the gap from the title to the line.

### Tests and snapshots

- `RootSnapshotTests.testEachFailureNamesWhatFailedAsAHeadingWithRetry` (lines 42 to 57): add the hint per kind (exact strings above). `testEachFailureIsSaidAsItShowsTitleThenLine` stays and is the evidence that the built spoken strings equal `vo.root.*`.
- References that change: the four root failures in light, dark and xl (12 images): `testGlobalLaunchFailedNetwork`, `testGlobalLaunchRefused`, `testGlobalLeaveFailed`, `testGlobalSignInNotKept` (title lower, Retry 36 points higher).
- Compare `global-launch-failed-network` with frame 12: the title's two lines break differently (the frame's Arimo breaks "Couldn’t load your / account."; the committed snapshot breaks "Couldn’t load / your account."), the title-to-line gap is 16 against 28, the line's ink, and the 3-point offset; nothing else should differ.

### Ambiguities

- **B1.** The title's offset mechanism (a bar container or a measured value), above. The sign-in lane's A02-age moves under the same change (F-10), so check its report for the same decision.
- **B2.** The 28-point title-to-line gap is unnamed and is kept at 16 (V-24).
- **B3.** `FQ89` words stand as the founder's Default (RM-02); record Claude Design's agreement under FQ89 (part 13).

---

## 5. Part C: the launch screen

### Now
`apps/ios/project.yml` lines 88 to 92: `UILaunchScreen: UIColorName: LaunchBackground`, with the comment "Built from spec: handoff 7 asks what it holds." The colour set `LaunchBackground` in `Tadayo/Assets.xcassets` holds canvas's two values. `LaunchScreenTests.testTheLaunchScreenIsTheCanvasInLightAndDark` (`apps/ios/TadayoTests/LaunchScreenTests.swift`) checks the key, the colour set and that it equals `Palette.canvas` resolved in both schemes, and that light and dark differ. The screen itself cannot be snapshotted (`docs/LIMITATIONS.md`, 2026-11-07 row); INVENTORY row 268 `global-launch-screen`.

### Delivery
`CC handoff7.launch.iOSLaunchScreen`: "Only adaptive canvas background; no logo, wordmark, spinner or text. The OS owns status bar and initial launch." `IMPL` line 76: "The OS launch screen is only the adaptive canvas background, in light or dark. No logo, marketing, text or fake spinner." `CC handoff7.replaces.launch`: "Brief FQ89 static-launch-screen runtime reading, actual system launch unchanged." Check line 218: "the launch screen stays canvas only."

### Exact change
None to behaviour. Rewrite the comment in `project.yml` lines 88 to 90 (it still says "handoff 7 asks what it holds"; it is now answered: canvas only, `CC handoff7.launch.iOSLaunchScreen`), and the doc comment of `LaunchScreenTests` line 8, which says the colour is "as the root draws its starting state": the root now draws a spinner and a label on that canvas, so the colour is what the wait is drawn on. The test stays.

### Tests and snapshots
`LaunchScreenTests` unchanged. INVENTORY `global-launch-screen` stays "built from spec" with the delivery named as confirming it.

### Ambiguities
None. The device check stays the founder's (LIMITATIONS 2026-11-07): after a reinstall, the launch screen is canvas and hands over to the wait on the same canvas with no flash.

---

## 6. Part D: the header before a club (`NoClubHeader.swift`, `TabHeader`, `TabScroll`, the Lab)

### Now
- `packages/swift/TadayoDesign/Sources/TadayoDesign/Components/NoClubHeader.swift`: `ViewThatFits(in: .horizontal)` of an `HStack(spacing: Spacing.m)` of wordmark, spacer, actions, or a `VStack(alignment: .leading)` of wordmark over actions pushed trailing (lines 51 to 61); `.padding(.leading, Spacing.inset)`, `.padding(.trailing, Spacing.inset - overhang)` where `overhang` = (44 - 28) / 2 = 8, so 12 (lines 62 to 63, 48); the wordmark is `resizable().scaledToFit().frame(width: Size.headerWordmark)` (96) centred in the row; the actions are `HStack(spacing: Spacing.xs)` (4) of + Add (`HeaderAddStyle`: `headerAdd` 15/20 bold, `action`, `actionPressed` while pressed, `.padding(.horizontal, Spacing.s)`, `minHeight: 44`, hint = `addHint`) and Account (a `Avatar(size: .card)` in a 44 by 44 button labelled `account`, `UnchangedWhenPressed`, no hint).
- Resulting targets at 393: + Add [274, 56, 59, 44] (label from x282), Account [337, 56, 44, 44], avatar ends 20 from the edge (documented lines 3 to 17 and INVENTORY line 399).
- `TabLayout.swift`: `TabHeader` (lines 52 to 61) builds it with `Image("Wordmark")`, `brand.wordmark`, `header.add`, `header.add.hint`, `header.account`, `onAdd: {}`, `onAccount: {}` (FQ85: do nothing yet); `TabScroll` (lines 73 to 98) is a `GeometryReader` over a `ScrollView` of a `VStack { TabHeader; content.padding(.horizontal, 20) }` with `.background { Palette.canvas.ignoresSafeArea() }` behind it and `.scrollBounceBehavior(.basedOnSize)`. Nothing opaque sits above the scroll content, so scrolled content passes under the status bar.
- Other use: `LabView.swift` lines 449 to 456 (`LabHeader`), which also holds the Private drafts row.
- Header snapshots: every `TabsSnapshotTests` state (13) and the Lab's `Lab-header`, `-dark`, `-large`, `-xl` and `Lab-header-320-xl` (`LabSnapshotTests.testTheHeaderStacksWhenItsActionsDontFit`, the only way the stacked form was reached at all, since a 393-wide screen keeps one row even at accessibility5).

### Delivery
Part 2.1 to 2.3. Further:
- Scope: `CC handoff7.noClubRootHeader.scope` "All root tabs with no selected-club record, including loading/error/empty and unsupported B0 club list"; `CC handoff7.replaces.noClubRootHeader`: "noClubRootHeader + H6 denied header geometry and scroll behavior only; H6 denied access restrictions remain". So handoff 6's denied header (B2) takes the same rectangles when B2 builds it (check line 223; W-13).
- Labels and hints: `CP header.brand` "Tadayo" (the wordmark, VoiceOver "Tadayo", an image, not a heading), `header.add` "+ Add", `header.addHint` "Save a private draft or open private drafts.", `header.account` "Account", `header.accountHint` "Open your account." `SC` records an empty hint for Account; the contract's hint wins (X-13 l.1260, W-12), and FQ85's answer (show later-stage controls, doing nothing yet, label unchanged, listed in the TestFlight notes; `docs/QUESTIONS.md` line 358, ADR-029) is why Account gets its hint as + Add already has.
- Initial: `accountInitial` "Allowed after own account record is loaded; B is not club data. No avatar while account record itself is unavailable." The tabs only show once the account is read, so the built header shows the initial in every state, as before (F-16, findings l.167); FQ58 stays the founder's and open.
- The sheet's AX5 header specimen (component sheet 17c, D-15 evidence): wordmark at (20, 20) in the specimen's own frame, "+ Add" 49 pt at x20, avatar rect x337.

### Exact change
1. **Default size, 393 wide** (build the contract's rectangles):
   - trailing inset 20 (Account's target ends 20 from the edge; the avatar 8 inside it, so 28 from the edge);
   - Account target 44 by 44, the 28-point avatar centred in it;
   - + Add: target at least 80 wide and 44 high, the label leading-aligned with an 8-point inset (label at x249 when the target starts at 241); the width grows if the words need it (target = max(80, words + 16)); no cap with the text size (T47);
   - 8 between + Add's target and Account's;
   - the wordmark 96 wide, 8 below the header's top (the contract's `wordmarkRect` y64; today it is centred in the 44, about 1.2 points higher: not listed by the check, adopt because the contract states it, A5);
   - header height 44; the content starts 32 below it (already how `HomeNoClub` and `TabContent.title` pad, `NoClubTabs.swift` line 23, `TabLayout.swift` line 255).
2. **Accessibility sizes** (`@Environment(\.dynamicTypeSize)`, `isAccessibilitySize`): always the stacked form, wordmark band then actions row:
   - the wordmark band is 48 high with the wordmark 8 below its top (`largest`: actions row starts at y104 = header top 56 + 48);
   - the actions row: + Add leading with its label flush with the 20-point inset (no 8-point label inset here, the contract's `addTarget` x is 20 and the label is drawn at x20), Account at the trailing edge (target's right edge at 20 from the edge), Account vertically centred in the row; both targets at least 44 high; + Add's target grows with the text;
   - the AX5 contract is 124 high overall with a 76-high actions row (A4).
3. **Below the accessibility sizes**, keep the built overflow fallback (`ViewThatFits`) for a narrow screen at a big but non-accessibility size (320 points at xxxLarge, say); the sources are silent there (A6). In the fallback the stacked actions also put + Add leading.
4. **Account's hint.** Add `accountHint: Text` to `NoClubHeader.init` and `.accessibilityHint(accountHint)` on the Account button; new key `header.account.hint` = "Open your account."; update both call sites: `TabHeader` (`TabLayout.swift` lines 56 to 59) and `LabHeader` (`LabView.swift` lines 451 to 455).
5. **Tokens (T44).** The new numbers are named values in `Metrics.swift`, each with its source in the doc comment: header add minimum width 80, add label inset 8, gap between the actions 8, wordmark top 8, the wordmark band 48 (accessibility sizes). The trailing 20 is `Spacing.inset`.
6. **The opaque band.** In `TabScroll`, over the scroll content and under the status bar, canvas only, exactly the top safe area's height, no material, blur or glass (T44, T45; `CC` "no custom glass or extra scroll-edge effect"). Any technique that paints canvas there above the scroll view in z-order does it (for example a zero-height top safe-area inset whose background is canvas ignoring the top safe area). The header scrolls away under it, as the contract says ("Header is content and scrolls with the single body"), and the band is not a navigation bar and carries no copy. On iOS 26 the system may add its own soft scroll-edge effect under a bar; if the iOS 26 evidence images show one under the band, the system's own switch to turn it off (the iOS 26 `scrollEdgeEffectHidden`, behind `#available`) is the way, not a custom treatment. I did not verify that API's exact name here.
7. **Not now (B2).** Handoff 6's denied header and the selected-club header are built in B2. The two now differ: a selected-club header is + Add [274,56,59,44] and Account [337,56,44,44] (handoffs 5 and 6), so the header would jump by 33 points (+ Add) and 8 (avatar) when the first club arrives (F-14, findings l.153). The check puts "whether a club's header moves as the header before a club now does (B2)" in the next brief (check line 177). Record it; build nothing.

### Tests and snapshots
- `TabsSnapshotTests.testTheHeadersWordmarkAddAndAccount` (lines 77 to 90): add Account's hint "Open your account." (+ Add's hint stays "Save a private draft or open private drafts."; the wordmark stays a non-heading "Tadayo").
- Geometry: the reader behind `AccessibilityElements.of` returns label, hint, traits, value and actions only (`apps/ios/TadayoSnapshotTests/AccessibilityElements.swift` lines 23 to 33), no frame. To assert the rectangles (+ Add's x, width and height; Account's), either add the element's `accessibilityFrame` to that helper (it is shared with `TadayoTests`, compiled into both targets, and with the sign-in lane's tests; coordinate), or rely on the snapshots against the frames. Header origin y differs by construction (62 or the device's safe area against the frames' 56), so assert x, width and height, and the gap to the next element, not y.
- Snapshots that change: all 13 `TabsSnapshotTests` states in light, dark and xl (39 images) because the header moves (+ Add 33 left, avatar 8 left, and at xl the stacked form). The Lab's `Lab-header`, `-dark`, `-large`, `-xl` change; `Lab-header-320-xl` stays and is still the check's 320-point snapshot at the largest size; add `Lab-header-320` (default size at 320 wide, `snap(.header, .light, width: 320, named:)`) so the check's "default, AX5 and 320 points" (findings l.1372) is covered.
- The band: it cannot appear in a top-of-scroll snapshot. Either a snapshot after setting the hosted `UIScrollView`'s content offset (the harness already walks the hosted view tree in `Spinners.check`), or the device check; say which in the PR. The TestFlight notes should ask for it on iOS 17/18 and 26.
- Contact sheets: compare each state with its handoff 7 frame; expected remaining differences are in part 15.

### Ambiguities
- **A3 (the top edge).** The frames start the header at y56 (the clip rect and `wordmarkRect` agree) with a status area 56 high and the clock drawn for a 59-point safe area; the app can only start at the safe area's top (59 on a notch-less 16 Pro-sized frame, 62 in the iPhone 17 snapshots). Record it as a constant difference, as INVENTORY line 399 does today.
- **A4 (+ Add's size).** 80 wide at the default size, 249 by 76 at accessibility5, are not derivable (part 2.1). Default taken: the target is max(80, words + 16) at the default size; at accessibility sizes its label is flush with the inset and its target is the natural size (at least 44 high, as wide as the words need). At accessibility5 that makes the header about 11 points shorter than the contract's 124 (65.3 + 48 = 113.3), so everything below sits about 11 points higher than in frame 22, and the target is narrower than 249. The visible label and Account match; only the invisible target's width and the 11 points differ. If the coordinator wants the contract's 124 reproduced, the only way is a vertical padding of about 5.3 at accessibility5, which no source states; I would not add one. Ask Claude Design in the next brief (the check does not list it).
- **A5 (wordmark's vertical place).** Contract y64 (8 below the top); built centred in the 44. The check's list does not name it. Default: adopt the contract (1 point of movement, and the stacked form needs the 48 band anyway).
- **A6 (the overflow fallback below accessibility sizes).** Sources silent; keep `ViewThatFits`.
- **A7 (the band on iOS 26).** Whether the system adds a soft edge under it: unknown until the evidence images are read.
- **A8.** Account's hint says "Open your account." although Account does nothing in B0 (FQ85). Per FQ85 the TestFlight notes list the controls that do nothing yet; add Account to that list when the notes are written (not this slice).

---

## 7. Part E: the tabs with no club

### E1. Page titles 32 under the header (F-15)

**Now.** `TabGap.pageTitle = Spacing.xxl` (24), `TabLayout.swift` lines 104 to 105, used by `PageTitle` (`NoClubTabs.swift` line 121) for Friends and Memories. Home's title is already `Spacing.xxxl` (32) under the header (`NoClubTabs.swift` line 23).
**Delivery.** `F01-no-club.svg` and `M01-no-club.svg`: "Friends" and "Memories" 32/35, baseline 158.24 (line box top 132 = header bottom 100 + 32), the same as "Start your club." in `G06-no-club.svg`. `CC noClubRootHeader.contentStart`: header bottom + 32. F-15 (findings l.160) "Set TabGap.pageTitle to 32"; check line 104 (taken).
**Exact change.** `TabGap.pageTitle = Spacing.xxxl`; rewrite its comment ("22 in the frames" is stale: `handoff7.noClubRootHeader.contentStart`). The three titles then sit at the same y. In the committed snapshots Friends' ink top is 136.5 (title at 24); it becomes about 144.5, as G06's (145.5).
**Tests.** `F01-no-club` and `M01-no-club` (light, dark, xl): 6 images move. `testEachTitleIsAHeading` stays.
**Ambiguity.** None; X-08 says the app takes from the redraws only the header and the leading text actions, and F-15 and check line 104 explicitly take this one.

### E2. Retry hints per tab (W-12, X-24's hint half, F-18)

**Now.** `TabContent` pins `SetupFooter(bottom: TabGap.footer) { Button Retry .tadayoPrimary }` while `failed` (`TabLayout.swift` lines 156 to 167); no hint.
**Delivery.** `CP vo.retryHome.hint` "Load Home again.", `vo.retryFriends.hint` "Load Friends again.", `vo.retryMemories.hint` "Load Memories again."; `IMPL` line 98: "Its accessible label is Retry; the separate hint names the tab to reload. Retry returns to that tab's loading shell." `CC noClubTabStates.retry`: "Retry returns to the same tab loading shell; accessible label Retry; hints per tab." (As built: `RootModel.retry()` on `.tabs` calls `loadClubs()`, which sets `.loading` and keeps the tab: nothing to change.)
**Exact change.** `ClubTab.retryHint: LocalizedStringResource` and `.accessibilityHint(Text(tab.retryHint))` on Retry. Three new keys (part 10). The label stays "Retry" (`common.retry`).
**Tests.** Extend `TabsSnapshotTests.testAFailureOffersRetryAndAClubThisBuildCantShowDoesnt` (lines 148 to 157) to assert the hint on each tab's failure and none on the not-in-build tab. No picture changes.

### E3. Private drafts, folder 16 in (BM-01)

**Now.** `PrivateDraftsEntry.swift`: `HStack(spacing: Spacing.l)` of the folder (SF Symbol `folder` at 17, centred in a 24-wide box), the text column, and the chevron (SF `chevron.right` at 13, in a 20-wide box); `.padding(.horizontal, Spacing.m)` (12) and `.padding(.vertical, Spacing.m)`; at least 76 high, radius 12, `surface`. So the folder box is 12 in and the title starts at x72 (the frame of handoff 4 draws 71).
**Delivery.** `G06-no-club.svg`: row [20,433,353,76]; the folder path drawn in a 24-wide box translated to (36, 459), that is 16 in; "Private drafts" from x76.0 (baseline 462.94, 17, `#182B25`), "Only you can see these." from x76.0 (baseline 485.66, 13, `#607067`); the chevron path at (341, 461) scale 0.75. `F01-no-club.svg` the same (row [20,191,353,76]). The component sheet's specimen "Secondary action, Private drafts and text action" (y 11074) draws the same: folder box at 36, title at 76. Handoffs 4, 5 and 6 drew 12 in and x71. `CC precedence.existingSheet`: appended specimens are current for their named scope (BM-01, findings l.1481). The row's other contract fields are unchanged (`CC privateDraftsEntry`: folder `action`, chevron `secondaryText`, title `row` `primaryText`, subtitle `metadata` `secondaryText`, minimum height 76, radius 12).
**Exact change.** Leading padding 16 (`Spacing.l`) and trailing unchanged (12), so the folder box is 16 in and the title is 16 after the 24-wide box, at x76 (20 + 16 + 24 + 16). Update the doc comment (lines 9 to 13: "12 in from the leading edge" becomes 16, naming handoff 7's frames and sheet specimen). Only the inset is taken (check lines 106 and 229; BM-01): see E3's ambiguities for what the same specimen also draws.
**Tests.** References: `G06-no-club`, `F01-no-club` (6 images) and `Lab-header` (4 images, the Lab's Private drafts group). Check at the largest text on the 393 screen that "Private" still breaks between words: the committed `G06-no-club-xl` image has the word about 154 wide in a column that leaves only about 9 points, and the change takes 4 of them; if it breaks inside the word, that is the open needs item 38, not something to design around.
**Ambiguities.**
- Also drawn by the same frames and sheet, and not taken by the check: the chevron is smaller and further in (box 18, glyph about 5.3 by 10.5, 14 from the row's edge, against the app's 20-wide box, 12 in, glyph about 6 by 12); the folder is a different drawing (18 wide by 17 tall with a tab, against SF `folder` at 17 whose glyph is 20 by 15). F-24 lists the chevron as "not explained" and says the app keeps the row geometry from handoffs 4 and 6; BM-01 and the check's section 8 take only the inset. Default: only the inset; record the other two as known differences. Whether the specimen's "named scope" covers them is a question for the next brief.
- At accessibility5 `G06-no-club-xl.svg` draws the row (below the viewport, y856 to 1182, 326 high) stacked: the folder box at (36, 876), 20 below the row's top; "Private / drafts" (53 pt) and "Only you can / see these." (44 pt) below it at x36; no chevron. The check's open list keeps needs item 38 (the row's layout when its title cannot fit beside its symbols) open and does not mention this drawing. It looks like an answer to item 38 ("for example the folder above the text"), but only in a frame clipped out of the viewport, with the chevron absent where `CC privateDraftsEntry` says `trailingIcon: chevron.right`. Default: keep the row as built; note the drawing under item 38 and in INVENTORY's "Line breaks" difference.

### E4. The failure title stays emptyTitle 25 (F-04, X-24, WM-03, V-06)

**Now.** `TabContent.title` (`TabLayout.swift` lines 247 to 256): emptyTitle 25/30, primaryText, heading, 32 under the header; the line in `.body` `secondaryText` 24 under it (lines 202 to 209); title and line are one accessibility element with the header trait, labelled `tab.spoken(failure)` (lines 210 to 213); Retry pinned 24 above the tab bar (`TabGap.footer`).
**Delivery.** Frames 14 and 16 draw the title at utilityTitle 32/35 (baseline 158.24) over a `primaryText` 17 line (baseline 204.94: line box 24 below the title's), Retry [20,699,353,50] (749 = 773 - 24). `IMPL` line 98: "title 32 points below the header and supporting line 24 points below the title's line box... Retry is a primary 50-point minimum button, pinned above the native tab bar".
**Ruling.** Kept (check line 122 and 229; findings critic ruling lines 1547 and 1548): FQ90's Default says the tabs take "Home's form as handoff 6's `M01-access-lost` does" and brief item 14 says "in your `H01-access-lost`'s form", both emptyTitle 25, "When a frame conflicts with a Default, the Default wins meanwhile"; also "Couldn’t load Memories." at 32 would wrap. The gaps (32 and 24) and Retry's 24 already match the frames, so nothing changes except the hint (E2).
**Ambiguity.** The not-in-build title (no frame; `TabContent` line 215) keeps emptyTitle too (X-24: "stays as built until it is drawn"); handoff 6's denied titles' role goes to the next brief (WM-03).

### E5. Loading shell, not-in-build, resolved, drafts-in-empty (all as built)

- Loading: the shell under the header, indicator over label, 20 apart, two fifths down (`TabContent.loading`, lines 226 to 245), one polite announcement. Frames 13 and 15 place the indicator centre at (196.5, 332) and the label baseline at 370.66 (13 pt, `#607067`), about 25 to 32 points higher than handoff 3's and than the app's (committed snapshot: indicator y349 to 369, label y392 to 404.5 with a 62-point safe area). F-17: "None now... The app keeps TabContent.loading's two-fifths placement."
- Not in this build: title only, no Retry, header and tabs reachable (`IMPL` line 100; `CC noClubTabStates.notInBuild`), announced once. As built (`TabContent` lines 214 to 216, `TabsView.announcement`).
- Resolved: "Home updated." on Home only, Friends and Memories silent (`CC noClubTabStates.resolved`). As built (R-12).
- Drafts in the empty states: "Stable Private drafts component in Home and Friends; Memories remains history and does not add a second drafts entry" (`CC noClubTabStates.draftsInEmpty`). As built (`HomeNoClub`, `FriendsNoClub` carry it; `MemoriesNoClub` does not). No Private drafts row while loading or failed (`CC noClubTabStates.loading` and `.failure`): as built.

### E6. Go to Home leading (shared, X-25)

M01's "Go to Home" is drawn at x20, baseline 369.12 (`M01-no-club.svg`; the 44-point row is 24 under the line's box). `TextActionStyle` centres its words (`TextAction.swift` line 22 and 28); the sign-in lane changes it to leading while keeping the full-width 44-point target (X-25, check line 197). `MemoriesNoClub` takes no code change, only the changed reference (`M01-no-club` in three variants, together with E1's title move). Its gap above (`TabGap.goHome` 56, delivery 24) is kept (E7).

### E7. The no-club gaps and bodies that stay as built

Delivered gaps (line box to line box, from the SVGs) against what is built (constants in `TabLayout.swift` lines 100 to 124 and `NoClubTabs.swift`), all kept except the page title (check line 111 "the earlier gaps on the... tabs before a club"; section 8 "Kept as built" line 245; X-08, F-24, F-25, V-13 where the critic did not rule on splitting G06's lines):

| Place | Delivered | Built |
|---|---|---|
| Header bottom to title (G06, F01, M01, failure) | 32 | G06 and failure 32; F01 and M01 24 now, 32 after F-15 |
| G06 title to body1 | 24 | 24 (same) |
| G06 body1 to body2 | 16 (two paragraphs) | 0 (one `Text` with a newline, 23-point line) |
| G06 body2 to Create a club | 32 | 72 (`homeActions` 32+32+8) |
| Create a club to I have an invite | 16 | 16 (`noClubButtonGap`) |
| G06 invite to Private drafts | 32 | 56 (`homeDrafts` 32+24) |
| F01 title to Private drafts | 24 | 24 (`friendsSection`) |
| F01 Private drafts to empty title | 32 | 24 (`friendsSection`) |
| F01/M01 empty title to line | 16 | 32 (`emptyTitleToBody`) |
| F01 line to Create a club | 24 | 68 (`friendsActions` 32+32+4) |
| M01 page title to empty title | 32 | 92 (`memoriesEmpty`) |
| M01 line to Go to Home's row | 24 | 56 (`goHome`) |
| Failure title to line | 24 | 24 (same) |
| Retry to tab bar | 24 | 24 (same, `footer`) |

Body ink: the frames draw G06's two lines, the F01 and M01 lines and the failure lines in `primaryText` (`#182B25`, and `#F7F8F2` in `G06-no-club-dark`); built `secondaryText` (`SetupHeading`, `HomeNoClub`, `EmptyLine`, `TabContent`'s failure line, `RootFailure` through `SetupHeading`) stays (critic on W-05; F-05, X-07, V-05). The Private drafts subtitle stays `secondaryText` at every size (FM-02).

### Tests and snapshots for part 7 as a whole
See part 12. In short: hint assertions (E2); header hint (D); 39 tab images (header) with 6 more reasons to move (F01 and M01 title, G06/F01 inset) and the Lab's header images.

---

## 8. The announcements, once only

| Moment | Said | How | Source | Change |
|---|---|---|---|---|
| The root reads the account (launch, Retry) | "Loading your account…" | polite, once when the wait appears, focus not moved | `CP root.loading`, `announcementPolicy.loading` | new |
| The root removes the session (Leave sign-in, Lab Log out, server-ended) | "Leaving sign-in…" | polite, once when it appears | `CP root.leaving` | new |
| A root failure shows | title, a space, line ("Couldn’t load your account. Check your connection and try again."; "...Try again."; "Couldn’t remove your sign-in from this iPhone. Try again."; "Couldn’t keep you signed in. Try again.") | once as it shows, focus not moved (`.announcing(kind.spoken, initial: true)`) | `CP vo.root.account.*`, `vo.root.leave.refused`, `vo.root.keep.refused`; W-11, RM-01 | as built |
| A tab's loading shell appears (tabs first show, or Retry) | "Loading Home…", "Loading Friends…" or "Loading Memories…" | polite, once (`TabsView.announcement`) | `CP home/friends/memories.loading`, `announcementPolicy.loading` | as built |
| The club list comes back empty | "Home updated." on Home only | polite, once; Friends and Memories silent | `CP home.resolvedVO`, `CC noClubTabStates.resolved`; R-12 | as built |
| The list fails | "Couldn’t load Home. Check your connection and try again." (and the Friends, Memories and "Try again." forms) | at once, once | `CP vo.home/friends/memories.error.*`, `announcementPolicy.failures`; W-11 | as built |
| A club this build cannot show | "This version of Tadayo can’t show clubs yet." | at once, once, on entry | `CP tabs.notInBuild`; `IMPL` line 100 | as built |
| Retry, Account, + Add focused | hints only (no announcement) | | `CP vo.retry*.hint`, `header.accountHint` | new hints |

R-12 (findings l.866): the delivery's rule "Home resolved announces `home.resolvedVO` even when empty" and the not-in-build line "on entry" could both fire on Home for a club this build cannot show; the app keeps one announcement per resolve (`TabsView.announcement`, lines 107 to 121: "Home updated." only for `.noClub` on Home from `.loading`; the not-in-build line alone otherwise) and records the question. Never used: `vo.failure.root.network`, `vo.failure.root.refused`, `vo.failure.tabs.error.network`, `vo.failure.tabs.error.refused` (they hold only the second line; a build that followed `announcementPolicy.failures` "Full keys begin vo.failure." would announce "Try again." with no word of what failed, against T43 and FQ89's Default).

Hosted tests check the words each would say (`TabsAnnouncementTests`; `RootSnapshotTests.testEachFailureIsSaidAsItShowsTitleThenLine`; a new one for the waits), not that iOS says them once; the TestFlight notes ask for that on an iPhone, as they do today.

---

## 9. What must stay as built (the check's list, and the rulings behind it)

From check section 8 "Kept as built" (lines 240 to 250), section 4 (116 to 134), section 3's keeps (108 to 114) and the findings' notes, restricted to my part:

1. **The M01 line**: "Days shared after you join a club will appear here after they open." (`memories.noClub.body`; delivery's "after you joined" has no replaces entry and is untrue with no club) (F-02, X-01, W-04, R-03, V-15; check line 118).
2. **Both G06 lines at every text size** (`HomeNoClub` draws `noClub.body1` and `noClub.body2`; frame 22 omits "Create a club or open an invitation." although the default and dark frames carry it, `SC G06-no-club-xl visibleStrings`) (F-01, X-02, W-03, R-04; check line 119). Record frame 22's omission in INVENTORY.
3. **`secondaryText` for body lines** (SetupHeading's subtitle through `RootFailure`, `HomeNoClub`, `EmptyLine`, `TabContent`'s failure line, the Private drafts subtitle) (F-05, X-07, V-05, FM-02; the critic's ruling on W-05, findings l.1546).
4. **The no-club tabs' gaps, and G06's two lines as one text** (F-24, F-25, X-08; V-13 and W-05 would split them 16 apart and the critic did not rule), except the page title's 32 (F-15) (check line 245).
5. **The tabs' failure title at emptyTitle 25** (F-04, V-06; critic on X-24 and WM-03; check line 122).
6. **The title-then-line announcements** for the root and the tabs (W-11, RM-01; check lines 132 and 249).
7. **Home's one announcement per resolve** (R-12) and "Leaving sign-in…" for every removal as written (R-10).
8. **The initial in the header while the list loads** (F-16; FQ58 stays open).
9. **The loading shell's two-fifths placement** (F-17).
10. **The title-to-line gap of the root failure (16), the avatar initial's 13-point role** (V-24, V-18) and the header's initial keeping its type size (check line 134).
11. **Private drafts' chevron and folder drawing** (only the inset moves, E3).
12. **The launch screen** is canvas only (X-21), and the **earlier keys** the replaced list leaves out stay current outside the no-club context (D-25, W-14; part 10).
13. **An empty email field after Leave sign-in** (R-06) is the sign-in lane's; it matters here only because the wait ("Leaving sign-in…") sits between Leave and A02-email.

---

## 10. Strings and keys

All delivered words for my screens already exist in `apps/ios/Tadayo/Localizable.xcstrings` word for word (compared key by key: root, loading, error, header, drafts, noClub, friends, memories, tabs; the apostrophe is U+2019 in both). Keep the built keys (D-25, W-14) and note the mapping in each string's comment, replacing the stale "until handoff 7 gives the words" comments:

| Built key | Handoff 7 key (`CP handoff7.*`) |
|---|---|
| `root.error.account`, `root.error.leave`, `root.error.keep` | `root.account.title`, `root.leave.title`, `root.keep.title` |
| `common.error.network`, `common.error.tryAgain`, `common.retry` | `root.network` and `tabs.error.network`; `root.refused` and `tabs.error.refused`; `root.retry` |
| `tabs.loading.home` / `.friends` / `.memories` | `home.loading`, `friends.loading`, `memories.loading` |
| `tabs.error.home` / `.friends` / `.memories` | `home.error.title`, `friends.error.title`, `memories.error.title` |
| `tabs.notInThisBuild`, `tabs.updated.home` | `tabs.notInBuild`, `home.resolvedVO` |
| `brand.wordmark`, `header.add`, `header.add.hint`, `header.account` | `header.brand` (replaces `handoff6.header.denied.brand`), `header.add`, `header.addHint`, `header.account` |
| `friends.title`, `friends.noClub.title`, `friends.noClub.body` | `noClub.friends.title`, `noClub.friends.empty`, `noClub.friends.body` |
| `memories.title`, `memories.noClub.title`, `memories.goHome` | `noClub.memories.title`, `noClub.memories.empty`, `noClub.memories.home` |
| `memories.noClub.body` | **not** `noClub.memories.body` (kept, part 9 item 1) |
| `tabs.home` / `.friends` / `.memories`; `noClub.*`; `drafts.*` | the same names under `handoff7` |

New keys (names follow the catalog's own style; the words are exact):

| New key | Value | `CP` key |
|---|---|---|
| `root.loading` | Loading your account… | `root.loading` |
| `root.leaving` | Leaving sign-in… | `root.leaving` |
| `header.account.hint` | Open your account. | `header.accountHint` |
| Retry hints for the root, three keys | Load your account again. / Remove the sign-in from this iPhone again. / Return to email sign-in. Your email address is kept. | `vo.retryAccount.hint`, `vo.retryLeave.hint`, `vo.retryKeep.hint` |
| Retry hints for the tabs, three keys | Load Home again. / Load Friends again. / Load Memories again. | `vo.retryHome.hint`, `vo.retryFriends.hint`, `vo.retryMemories.hint` |

Not used: `vo.failure.root.*`, `vo.failure.tabs.error.*` (W-11), the `vo.root.*` and `vo.home/friends/memories.error.*` strings as keys (the spoken groups are composed from title and line and equal them; the tests assert the full strings), `vo.profile.emptyAvatar` (the profile lane's, WM-04). The sign-in lane edits the same catalog file; expect a merge to rebuild, not take either whole (part 11).

---

## 11. Shared files and cross-lane dependencies

- **`SetupLayout.swift`** (`SetupScroll`, `SetupGap`, `SetupHeading`, `SetupFooter`): `RootFailure` consumes it, and the sign-in lane changes footers to 44 above the safe area (F-10, V-11) and may change the top offset. One shared constant for "footer to the safe area's bottom" (44, `CC spacing.formFooterToSafeAreaBottom`), and one answer for "title under a bar". `SetupHeading`'s subtitle stays `secondaryText`.
- **`TextAction.swift`**: leading alignment (X-25) is the sign-in lane's; `MemoriesNoClub`'s Go to Home inherits it.
- **`PrimaryButton.swift`** (D-13, X-15): the busy treatment moves the indicator and, at large text, reserves its own row "when idle too". Retry and Create a club are primary buttons that never go busy. `G06-no-club-xl.svg` draws Create a club 85 high with one label line and no reserved row, so a button with no busy state must not reserve one. Check the sign-in lane's design keeps that.
- **`Avatar.swift`** (D-14, X-20): the header's avatar benefits; no change in my files.
- **`AccessibilityElements.swift`**: if a frame is added to its `Element`, it is shared with `TadayoTests`.
- **`Localizable.xcstrings`**: both lanes add keys.
- **INVENTORY.md, QUESTIONS.md**: the coordinator edits them once; my part's rows and notes are in parts 12 and 13.

---

## 12. Tests and snapshots, the master list for my part

**TadayoCore (Linux, `swift test --package-path packages/swift/TadayoCore`).** `RootModelTests`: lines 249, 389, 395 to `.leaving`; add the four route cases of part 3.

**Hosted unit tests (`TadayoTests`).** `LaunchScreenTests` unchanged. `TabsAnnouncementTests` unchanged.

**Snapshot tests, new or extended assertions.**
- `RootSnapshotTests`: `testGlobalLaunch` (busy true), new `testGlobalLeaving`; extend the failure test with the three hints; new wait-elements test.
- `TabsSnapshotTests`: Account's hint; Retry's hint per tab; no hint on the not-in-build tab; optionally the geometry assertion.
- `LabSnapshotTests`: add `Lab-header-320`; keep `Lab-header-320-xl`.

**References that change (committed under `apps/ios/TadayoSnapshotTests/__Snapshots__/`, to be updated from the evidence branch only once each matches the render and the contracts).**
- `TabsSnapshotTests`: all 13 states x 3 variants = 39 (header). Of them, `testG06NoClub`, `testF01NoClub` change for the Private drafts inset; `testF01NoClub`, `testM01NoClub` for the page title; `testM01NoClub` for Go to Home leading.
- `RootSnapshotTests`: `testGlobalLaunch` x 3; the four failure tests x 3 = 12; new `testGlobalLeaving` x 3.
- `LabSnapshotTests`: `testLabSections.Lab-header`, `-dark`, `-large`, `-xl`; `testTheHeaderStacksWhenItsActionsDontFit.Lab-header-320-xl`; new `Lab-header-320`.
- No change: the tab failures' and loading shells' content, except the header.

**Frames to pair in `design/reference/screens/`** (so the contact sheets show render beside snapshot; ADR-027 keeps the earlier file in its handoff's folder): replace `G06-no-club.png`, `F01-no-club.png`, `M01-no-club.png` with handoff 7's redraws; add `H01-loading-no-club`, `H01-error-no-club`, `F01-loading-no-club`, `F01-error-no-club`, `global-launch-failed-network`, `G06-no-club-dark`, `G06-no-club-xl` from `claude-design/handoff-7/frames/` (the frames are named as the states).

**Device and TestFlight checks (the cloud session cannot judge them).** The hand-over from the OS launch screen to the wait with no flash, and what a signed-out first launch shows (A1); VoiceOver says each wait once, each failure once as title then line, the Retry hints, Account's hint; the band behind the status bar while scrolling on iOS 17/18 and 26 and on an iPhone with and without the Dynamic Island; the header stacked at accessibility sizes on a real screen; a Leave from the tabs and from A02-age shows "Leaving sign-in…".

**Suggested order.** (1) `RootModel` and its tests on Linux. (2) `Metrics.swift` tokens, `NoClubHeader`, `PrivateDraftsEntry`, `LabView` (CI only). (3) App views and catalog. (4) Snapshot tests, push, read the evidence, update references. (5) INVENTORY, QUESTIONS, `screens/` files.

---

## 13. Documents

### INVENTORY.md (`design/reference/INVENTORY.md`; the rows are by their line today)
- Row 106 `G06-no-club`: re-source to "Handoff 7 (handoff 4, 1 before)"; text: title 32 under the header; header rectangles built to the delivery; Private drafts inset 16; the gaps kept; both body lines.
- Rows 131 and 132 (`H01-loading-no-club`, `H01-error-no-club`): received, source "Handoff 7"; row 133 (`H01-error-no-club-refused`) stays built from spec, its words' source handoff 7.
- Rows 141 (`F01-no-club`, re-source), 142 (`F01-loading-no-club`) and 143 (`F01-error-no-club`) received; row 144 stays built from spec.
- Row 233 (`M01-no-club`) re-sourced with the line difference recorded; rows 234 to 236 stay built from spec (Memories "given in writing", check line 152).
- Row 262 `global-launch`: text becomes the indicator over "Loading your account…", built from spec; new row `global-leaving` (the same over "Leaving sign-in…"), built from spec (X-33, findings l.1447); row 263 `global-launch-failed-network` received; rows 264 to 266 stay built from spec with their words' source handoff 7; row 267 `global-club-not-in-build` built from spec, line confirmed; row 268 `global-launch-screen` stays built from spec, confirmed canvas only.
- New received rows: `G06-no-club-dark` and `G06-no-club-xl` (the latter with the omission of body2 recorded).
- Known differences (lines 397 to 408 and the counts at line 423): rewrite "The header is content", "+ Add's place" (answered: [241,56,80,44], avatar and Account as in part 2.1; what remains is the 3 or 6 point top edge), "The header at large text" (answered: stacks at every accessibility size, + Add leading; and A4's size difference), add the band, "Loading" (frames 13 and 15 exist; the shell stays two fifths down, F-17), "A tab's failure" (frames 14 and 16; emptyTitle 25 kept; the line's ink; hints), "What VoiceOver says" (add the two waits and the hints), "The Private drafts row's symbols" (add the 16 inset (BM-01), the drawn chevron and folder differences and the accessibility5 stacked drawing), "Line breaks"; add X-01 to X-08's kept readings that concern these frames and frame 22's missing line (check line 258 for the notes handoff 7 answers). Never delete a row (ADR-020).

### QUESTIONS.md (`docs/QUESTIONS.md`)
- FQ58 (line 290): note Claude Design's answer (the initial is allowed once the account record is loaded; no avatar before it; frames 13 to 16 draw it) and leave it open (X-34, F-16).
- FQ85 (line 358): note that Account takes its hint, as + Add and I have an invite already do; the TestFlight notes list the controls doing nothing.
- FQ89 (lines 409 to 411): record the confirmation in writing, `root.loading` and `root.leaving`, the Retry hints, frame 12; note Claude Design's agreement is not the founder's answer (RM-02); open.
- FQ90 (lines 412 to 415): rewrite the stale bullet (line 414: "The brief hasn't gone to Claude Design yet" and "without stating this default's...", and nothing asks what Friends and Memories say when the list returns); record "Home updated." on Home only, no Private drafts row while loading or failed, the 32-point title in the frames against the Default's emptyTitle 25 (kept), Friends and Memories silent; open (X-34, RM-02).
- The tabs' preface (line 407): "these defaults stand until its export is checked" becomes "until the founder answers" (X-34, check line 267).
- FQ93 to FQ95 are the coordinator's (sign-in and drop card), none is mine.

---

## 14. Open points and the default taken for each

| # | Point | Default taken | Source | Who decides |
|---|---|---|---|---|
| A1 | Spinner and "Loading your account…" for a launch or Retry that finds no session | The check's literal reading (show at once, no delay); refinement ready | W-09, V-14, check line 176 | coordinator, then the founder via the next brief |
| A2 | The wait's role, ink, position | metadata, secondaryText, 20 under the indicator, two fifths down | W-09 | Claude Design (frame) |
| A3 | Header y: frames 56 against 59 or 62 | header at the safe area's top; a recorded constant difference | `CC noClubRootHeader.default.origin`; INVENTORY line 399 | none |
| A4 | + Add target 80 (default) and 249 by 76 (accessibility5) | max(80, words + 16); at accessibility sizes natural size; header about 11 points shorter than 124 at accessibility5 | `CC noClubRootHeader` | Claude Design |
| A5 | Wordmark 8 below the top | adopt | `CC wordmarkRect` | none (1 point) |
| A6 | Overflow below accessibility sizes | keep `ViewThatFits` | silent | none |
| A7 | iOS 26 scroll-edge effect under the band | off if the system adds one | `CC scroll` | read the evidence |
| A8 | Account's hint says it opens something | add it; TestFlight notes | FQ85, W-12 | none |
| B1 | Root failure title offset mechanism | a bar container or a measured shared value, never a hard-coded 44 | X-22 | plan |
| B2 | Title to line 28 against 16 | keep 16 | V-24 | Claude Design |
| E3a | Chevron and folder drawing in the Private drafts specimen | only the inset adopted | BM-01, F-24 | Claude Design |
| E3b | Private drafts row stacked at accessibility5 in frame 22 (folder above words, no chevron) | keep as built; note under needs item 38 | `G06-no-club-xl.svg` | Claude Design |
| E4 | Failure title 32 in frames 14 and 16 | emptyTitle 25 (the Default) | FQ90; critic | founder (FQ90) |
| E7 | Body ink and the no-club gaps | as built | F-05, X-08 | Claude Design |
| R10 | "Leaving sign-in…" for a removal the person did not start | as written | R-10 | next brief |
| R12 | Home's two announcements | one per resolve | R-12 | next brief |

---

## 15. Appendix: the delivery's frames, measured, and the app's, for the contact-sheet differences to expect

Frame numbers in points (393 by 852), line box = baseline - 0.82 x size.

**`global-launch-failed-network`** (frame 12): title "Couldn’t load your" / "account." 32/35, x20, baselines 153.24 and 188.24, `#182B25`; line 17, baseline 238.94, `#182B25`; Retry [20,724,353,50] r13 `#284CDB`, label baseline 751.12. Title bottom 197, line top 225 (28). App (committed snapshot, safe area 62): title ink top 89.5, Retry bottom 810.

**`H01-loading-no-club`** (13) and **`F01-loading-no-club`** (15): wordmark image (20,64) scale 0.1049 (96 wide); "+ Add" x249 baseline 80.3, 15 pt `#284CDB`; avatar [337,64,28,28] fill `#E1E5F6` with "B" 12.6 pt baseline 80.77 (the role is 13; V-18); spinner centre (196.5, 332), eight spokes, stroke 2, `#607067`; label "Loading Home…" / "Loading Friends…" 13 pt baseline 370.66 x147.72 / 143.39, `#607067`; tab bar rect y773 height 79 with a 1-point `#DCE2DA` line, a schematic flat bar (T45: the app uses the system's).

**`H01-error-no-club`** (14) and **`F01-error-no-club`** (16): the same header; title "Couldn’t load Home." / "Couldn’t load Friends." 32/35 baseline 158.24 `#182B25` (last glyph x322.2 / 348.9); line 17 baseline 204.94 `#182B25`; Retry [20,699,353,50], label baseline 726.12; no Create a club, I have an invite or Private drafts. App: title role 25, line `secondaryText`, Retry 24 above the bar.

**`G06-no-club`** (28) default: title baseline 158.24 (32); body1 baseline 204.94, body2 baseline 243.94 (17, `#182B25`; `#F7F8F2` dark); Create a club [20,285,353,50]; I have an invite [20,351,353,50] (`#F0F2EC`, 1-point `#778579` border); Private drafts [20,433,353,76]; folder box (36,459); title x76 baseline 462.94; subtitle baseline 485.66; chevron (341,461) scale 0.75. **`G06-no-club-dark`** (21): identical geometry, dark inks (`+ Add` `#AFBEFF`, avatar `#35463A` with `#F7F8F2`, Create a club `#AFBEFF`).

**`G06-no-club-xl`** (22, accessibility5, body clipped to (0,56,393,717)): wordmark (20,64); "+ Add" 49 pt baseline 152.18 at x20; avatar [337,128,28,28]; "Start your / club." 56 pt baselines 257.92 and 322.92; "A private place / for two to six / people." 53 pt baselines 409.46, 474.46, 539.46 (second sentence missing); Create a club [20,585,353,85] (one label line, 50 pt); I have an invite [20,686,353,146] (two lines); Private drafts [20,856,353,326]: folder (36,876), "Private / drafts" 53 pt at x36 (baselines 959.46, 1024.46), "Only you can / see these." 44 pt at x36 (baselines 1094.08, 1148.08), `#182B25` where the default draws `#607067` (FM-02); no chevron.

**`F01-no-club`** (29): title "Friends" 32 baseline 158.24; Private drafts [20,191,353,76]; "Your friends will appear here." 25 baseline 319.5; "Create a club or open an invitation to choose / your people." 17 baselines 358.94 and 381.94 (`#182B25`); Create a club [20,415,353,50]; I have an invite [20,481,353,50].

**`M01-no-club`** (30): "Memories" 32 baseline 158.24; "Your shared days, kept / together." 25 baselines 219.5 and 249.5; "Days shared after you joined will appear here / after they open." 17 baselines 288.94 and 311.94 (the line kept as built is the earlier one); "Go to Home" 16 at x20 baseline 369.12, `#284CDB`.

**App, committed iPhone 17 snapshots** (safe area top 62, bottom 34; ink bands in points): `G06-no-club` wordmark, + Add and avatar band y69.5 to 99; title ink 145.5 to 174.5; body lines 204 to 220 and 227 to 243; Create a club y316 to 366; invite y382 to 432. `F01-no-club` title ink 136.5 to 161; `M01-no-club` title ink 136.5 to 161, Go to Home ink 468 to 480; `H01-error-no-club` title ink 144 to 162.5, Retry y694.5 to 745; `H01-loading-no-club` indicator y349 to 369, label y392 to 404.5. The system tab bar is iOS 26's floating glass (T45; INVENTORY line 401). Expect on every comparison: a 3-point offset from the top edge, SF against Arimo, the tab bar, the body ink, and the kept gaps of part 7's table.
