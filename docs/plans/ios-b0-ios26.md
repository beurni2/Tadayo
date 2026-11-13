# `ios/b0-ios26`: plan (ios lane, B0, the app's half of ADR-033)

Written on 13 November 2026 by the ios thread, from `main` at `beb2435`, where PR #50 (ADR-033's CI half) merged at 18:03 UTC. Three surveyors went through the code, the documents and the journal and listed every place that assumes iOS 17 or 18, each with its line at `beb2435`. For section 4 the ios thread also read C2's evidence on `evidence` (`ios/b0-xcode27-check/c7de4b7/ios/`): its `index.md`, its `logs/test-27.2.log`, its `logs/build.log`, and eight of its images beside their iOS 26.5 references. A fresh reader then checked the draft against the repository and made 20 corrections, each applied here. Line numbers below are the ones at `beb2435`. This plan is pasted into the PR's Plan section.

## 1. Scope and sources

ADR-033 records the founder's decision card of 05:06 UTC on 13 November 2026 ("iOS 26 and up; test 26.5 and 27.2"). It makes iOS 26 the minimum, and every `ios` run builds once on Xcode 27.2 and tests on iOS 27.2 (with the snapshot tests) and on iOS 26.5. PR #50 made the CI change. ADR-033 leaves the following to this PR, which the journal's block 1.3 lists as Next 3:

- the deployment target and the three packages' platforms at iOS 26;
- FQ4's answer in `docs/QUESTIONS.md`;
- `apps/ios/TadayoSnapshotTests/__Snapshots__/ios-version` holding `27.2`, so the snapshot tests run on iOS 27.2, with all 222 references taken again there and each one read against its iOS 26.5 reference;
- the swift-format key that Swift 6.4.2's swift-format needs;
- every current-state line that still says the app runs, or is tested, on iOS 17 or 18.

Sources:

- ADR-033 (all of it), FQ4, T45, T46, T47 and T58.
- `docs/LIMITATIONS.md`, the rows of 2026-11-01, 2026-11-03, 2026-11-07, 2026-11-11 and 2026-11-13.
- `docs/plans/ios-b0-adopt-handoff-7.md`, sections 3, 4.1, 5, 7, 8 and 9.
- The journal's block 1.3: C2 (`c7de4b7`, `ios` run 43397747470) and Next 3 and 4.
- `docs/MILESTONES.md`, "Lanes": who edits which lines of the journal's shared block, `docs/plans/B0.md` and `docs/PROGRESS.md`.

What it leaves alone:

- **CI configuration (T58).** No file under `.github/`, `.claude/` or `tools/ci/`, and not `.yamllint.yaml`. `toolchain.SNAPSHOT_RUNTIME_INTERIM` and `ios_steps.snapshot_runtime`'s fallback stay, and a later CI-configuration PR removes them. `python3 tools/ci/ci_config_guard.py` passes because the branch changes no CI file.
- **The rulebook.** `docs/TECH-DESIGN.md`, `docs/GITHUB.md` and `docs/MILESTONES.md` go in a separate rulebook PR. `CLAUDE.md` is the founder's file.
- **History.** The journal's log (section 3), old ADRs (ADR-001, ADR-018), gate records, check reports, briefs, and the plans and appendices of merged slices say what was true then, and stay as written. The exception is a line that states a current rule or a next step that is now false; section 2.12 lists what is left on purpose.
- **No new question or ADR.** ADR-033 is the decision, and FQ4 records its answer; FQ103 and ADR-035 stay unused. The one possible design question, the iOS 27 tab symbols (section 4.3), goes to the needs list, not to the founder.
- **Privacy.** No new text names the founder's phone model, location or iOS version. FQ4's present-tense clause about the founder's phone goes, and section 0.7's matching clause goes with it. FQ4 still asks, naming no model or version, whether the founder's own iPhone can run iOS 26.

Tests first: this PR adds no logic, so no new test. Existing tests hold the shape of each change, but none proves the raise:

- `tools/ci/ios_steps_test.py` `test_every_runtime_is_at_or_above_the_app_s_minimum` (lines 406–414) reads `project.yml`'s deployment target and checks 27.2 and 26.5 against it. It passes at 17.0 as at 26.0.
- `SnapshotRuntimeTest.test_the_repository_s_own_file` (lines 421–425) reads the real `ios-version`. It accepts the interim or the file.
- `test_the_inventory_s_states` reads the real `INVENTORY.md`.
- Nothing checks the packages' platforms.

All three tests run in `ci`'s `tools-tests`. Two checks outside the tests prove the raise:

- **In the session:** `swift package dump-package` reads `ios 26.0` for all three manifests (section 5).
- **In run A:** in `logs/build.log`, every `-target` of a Tadayo module reads `arm64-apple-ios26.0-simulator`: `Tadayo`, `TadayoShare`, `TadayoTests`, `TadayoSnapshotTests`, `TadayoUITests`, `TadayoCore`, `TadayoAPI` and `TadayoDesign`. C2's log has `arm64-apple-ios17.0-simulator` for each of them (46 lines). The third-party modules' `arm64-apple-ios15.0-simulator` (35 lines in C2's log) stay as their packages declare.

## 2. Every file change

### 2.1 Targets

- **`apps/ios/project.yml` line 19.** `    iOS: "17.0"` becomes `    iOS: "26.0"`. Keep the two-line shape `  deploymentTarget:` / `    iOS: "…"`, because `ios_steps_test.py` line 410 reads it with `^  deploymentTarget:\n    iOS: "?([0-9.]+)"?\s*$`. `options.deploymentTarget` sets the minimum for every target, the share extension and the test bundles included. No Info.plist is committed (XcodeGen writes it). `SWIFT_VERSION: "6.0"` is the language mode, unrelated to this change.
- **`packages/swift/TadayoCore/Package.swift`.**
    - Line 1, `// swift-tools-version: 6.0`, becomes `// swift-tools-version: 6.2`. PackageDescription 6.0 refuses `.v26` ("'v26' is unavailable", checked on Swift 6.4.2).
    - Line 8 becomes `    platforms: [.iOS(.v26), .macOS(.v14)],`.
- **`packages/swift/TadayoAPI/Package.swift`.** Line 1 becomes 6.2, and line 10 becomes `    platforms: [.iOS(.v26), .macOS(.v14)],`.
- **`packages/swift/TadayoDesign/Package.swift`.** Line 1 becomes 6.2, and line 13 becomes `    platforms: [.iOS(.v26)],`.
- **`.macOS(.v14)` stays** in TadayoCore and TadayoAPI. It is Observation's floor on macOS. Linux ignores platforms, and no run builds the packages for macOS. Section 6 has what a macOS `swift test` would need.
- **Survey's trial run.** Scratch copies at tools 6.2 with `.iOS(.v26)` passed `swift test` on Swift 6.4.2: TadayoCore 195 tests, TadayoAPI 15. `swift package dump-package` reads `ios 26.0` for all three manifests. `ci`'s `swift` job runs the same two packages in `swift:6.4.2-noble`.

### 2.2 FQ4 and FQ97 (`docs/QUESTIONS.md`)

FQ4 stays where it is. As with FQ68 and FQ85, the answer becomes the first bullet. The minimum is answered. Two things stay open, because a build installs only on iOS 26 or later: whether the founder's own iPhone can run it, before slice 12's TestFlight build, and the trial members' phones, before any member is invited. That keeps section 0.7's "FQ4 for the trial members" true, and its bullet (journal line 192) gains the founder's iPhone. Lines 25 to 30 become:

```
- **FQ4. Your iPhone and iOS version, and the trial members'.** The app's minimum iOS decides which phones can install it, the founder's included.
    - Answered by the founder at 05:06 UTC on 13 November 2026, on a decision card in the ios thread ("Choose which iOS versions Tadayo supports and each run tests": "iOS 26 and up; test 26.5 and 27.2"): iOS 26 is the minimum, and every `ios` run builds once on Xcode 27.2 and tests on iOS 27.2 and 26.5 (ADR-033, which supersedes ADR-018). iOS 26 runs on the iPhone 11 and later, the same iPhones as iOS 27; the iPhone XS and XR stop at iOS 18, so no build from `ios/b0-ios26` on installs on them. Since `ios/b0-ios26` the app's deployment target is 26.0 and its three Swift packages declare iOS 26.
    - Answered in part by the founder on 1 November 2026, which kept the iOS 17 minimum until 13 November (ADR-018). The trial members' phones are still unknown.
    - Default until 13 November 2026: iOS 17 minimum, which runs on the iPhone XS, XR and later, built with the newest SDK so that newer iPhones get the current system look.
    - Default since 13 November 2026: every phone, yours and the trial members', is taken to run iOS 26 or later, and nothing changes until someone says one can't (ADR-033).
    - If your iPhone or a trial member's can't run iOS 26 (an iPhone XS, XR or older), tell Claude Code before slice 12's TestFlight build, or before that member is invited: no build installs on it, and a lower minimum would need a new decision, since Xcode 27 can't test on anything older than iOS 26.0 (ADR-033).
    - Needed by: B0 for the minimum (answered); your iPhone before slice 12's TestFlight build; the trial members' phones before any of them is invited.
```

This drops the heading's sentence about the founder's iPhone and Claude Docs, and the 1 November bullet's statement of the founder's iOS version. FQ97 (line 466): "which the app's iOS 17 floor covers" becomes "which the app's iOS 26 floor covers".

### 2.3 The snapshot runtime file

`printf '27.2\n' > apps/ios/TadayoSnapshotTests/__Snapshots__/ios-version`. It must be a regular file holding exactly the four ASCII bytes `27.2` and at most one LF: no CRLF, no space, no second line, not a link. `od -c` shows `2 7 . 2 \n`. Anything else fails `simulator` and `test` on `ios`, and `SnapshotRuntimeTest.test_the_repository_s_own_file` on `ci`. XcodeGen excludes `**/__Snapshots__` (`project.yml` line 154), and `collect` reads only PNGs, so the file is neither a source nor a snapshot. The repository has no `.gitattributes`, so git keeps the LF.

### 2.4 swift-format

In both `apps/ios/.swift-format` and `packages/swift/.swift-format` (byte-identical today), the key goes inside the `orderedImports` object:

```
  "orderedImports": {
    "includeConditionalImports": false,
    "shouldGroupImports": true
  },
```

A top-level key still gives "missing key `orderedImports.shouldGroupImports`" (tested). With `true`, `swift format lint --strict` passes over both trees with no findings on Swift 6.4.2. With `false` there are 31 `[OrderedImports]` findings, all on `@testable import` lines. Whether Swift 6.3.3's swift-format accepts the key isn't checked; the session uses 6.4.2, and block 1.1 now says so (section 2.11).

### 2.5 Comments and docstrings in code

Only the lines that become false change. Each is rewrapped to the 100-column limit `swift format lint --strict` holds. Nothing else in these files changes.

| File, line | Today | Becomes |
|---|---|---|
| `apps/ios/project.yml` 169–170 | "which also run on the iOS 17 and 18 compatibility runs: only targets ending in SnapshotTests are skipped there." | "which run on both iOS versions each `ios` run tests, 27.2 and 26.5; the targets ending in SnapshotTests run on iOS 27.2 alone (ADR-033; `TadayoSnapshotTests/__Snapshots__/ios-version`)." |
| `Tadayo/App/RootFailure.swift` 13–14 | "`RootFailureTests` compares the two, on each iOS the compatibility runs use." | "`RootFailureTests` compares the two, on both iOS versions each `ios` run tests, 27.2 and 26.5." |
| `TadayoTests/RootFailureTests.swift` 6–10 | "…so that it is measured on the iOS 17.5 and 18.6 compatibility runs as well as on the newest iOS: the snapshot tests run on the newest only, and…" | "…so that it is measured on iOS 26.5 as well as on iOS 27.2: the snapshot tests run on iOS 27.2 only, and…" (the rest kept) |
| `TadayoSnapshotTests/ScriptedServices.swift` 7–8 | "…which the iOS 17.5 and 18.6 compatibility runs also run, and not only in the snapshot tests, which they skip (`tools/ci/ios_steps.py`)." | "…which run on iOS 26.5 as well as on 27.2, and not only in the snapshot tests, which run on iOS 27.2 alone (`tools/ci/ios_steps.py`)." |
| `TadayoTests/ArrivalFocusTests.swift` 11 | "Hosted, so the iOS 17.5 and 18.6 runs read it too." | "A hosted test, not a snapshot test, so iOS 26.5 reads it too." |
| `TadayoTests/BusyButtonTests.swift` 7–8 | "on every iOS the compatibility runs cover, so what the snapshots show on the newest is held on the others too." | "on both iOS versions each run tests, so what the snapshots show on iOS 27.2 is held on iOS 26.5 too." |
| `TadayoTests/DropCardTests.swift` 18 | "so the iOS 17 and 18 compatibility runs read the labels too." | "so they read the labels on iOS 26.5 as well as on iOS 27.2." |
| `TadayoTests/SignInReadingTests.swift` 9–10 | "on iOS 17.5 and 18.6 too (the snapshot tests, …, are skipped there)" | "on iOS 26.5 too (the snapshot tests, …, run on iOS 27.2 alone)" |
| `TadayoTests/SignInReadingTests.swift` 683–684 | "read here so that iOS 17.5 and 18.6 read it too" | "read here so that iOS 26.5 reads it too" |
| `TadayoTests/AppIconTests.swift` 11 | "iOS 18's Home Screen draws the one the person has chosen." | "The Home Screen draws the one the person has chosen." |
| `TadayoTests/LaunchScreenTests.swift` 12–14 | "…colour scheme (iOS 17): on iOS 17, `UIColor(Palette.canvas)` doesn't keep the colour's dark value, so it resolved light in dark (…)" | "…colour scheme, never bridged through `UIColor(_:)`, which on iOS 17, no longer supported, resolved it light in dark (`docs/LIMITATIONS.md`, 2026-11-07)." |
| `Tadayo/SignIn/ProfileScreens.swift` 141–153 (the sentence ending on line 153) | "…was up reached the footer on all three either way." | The same, then: "iOS 17 and 18 are no longer supported (ADR-033); the padding stays, since it held on every version measured and the UI tests check it on iOS 27.2 and 26.5 (`docs/plans/ios-b0-ios26.md`, section 3)." |
| `Tadayo/Tabs/TabsView.swift` 5–8, only if section 4.3's tab finding stands as a Known difference (commit B) | "…the selected one filled and the others outlined, as handoff 0 names them and every frame draws them, so the symbol and not only its colour shows which is selected (T44)…" | What each iOS draws: the outline asked for, which iOS 26 draws, and iOS 27's tab bar filling every symbol, so there the glass selection and `action` show which is selected (`docs/LIMITATIONS.md`'s row, needs item 60) |

Kept as they are, because they stay true:

- `ProfileScreens.swift` 247, the run where the Return race was seen.
- `RootFailure.swift` 15 and `RootFailureTests.swift` 10, iOS 26's empty bar.
- `SignInUITests.swift` 458, an iOS 26.5 observation.
- `SignInFlow.swift` 316, Apple's documented default.
- `FoldedCard.swift` 12 ("17.5 below the top" is points).
- The "18 or older" strings.
- `ScreenSnapshots.swift` 11–20, 101–104 and 117–124. These keep their text unless run A contradicts them (section 3, row 5).

### 2.6 `docs/LIMITATIONS.md` statuses

The Limit, Evidence and Workaround cells stay as the record; only the Status cell changes.

| Row | Status becomes |
|---|---|
| 2026-11-01, "Snapshots run on the runner's newest iOS simulator…" (line 37) | The current text up to "…the row of 2026-11-03 below)", then: "The download was confirmed by the first runs with `ios_version`, iOS 18.6 and 17.5 (for example run 42347371192, iOS 18.6). Superseded on 2026-11-13 by ADR-033: every run tests iOS 27.2 and 26.5, and the `ios_version` input is gone. Since `ios/b0-ios26` iOS 26 is the minimum and the snapshot tests run on iOS 27.2, so no run on iOS 17 or 18 is wanted; a phone on iOS 26 may still draw the bars differently from the snapshots, and the iOS 26.5 pass runs the hosted and UI tests there." |
| 2026-11-03, `macos-26`'s runtimes (line 51) | "Confirmed for the newest iOS, and the downloads by the runs on iOS 18.6 and 17.5. Superseded on 2026-11-13 by ADR-033: `xcode-27`, Xcode 27.2, iOS 27.2 and 26.5; the pre-gate runs on iOS 17 and 18 ended with it, and iOS 26 is the minimum from `ios/b0-ios26`." |
| 2026-11-07, `UIColor(_:)` on iOS 17 (line 73) | The current text, then: ". Closed 2026-11-13 (`ios/b0-ios26`): iOS 26 is the minimum (ADR-033), and iOS 26.5 kept the dark value through `UIColor(_:)`, so no iOS the app runs on is known to have it (iOS 27.2 isn't checked that way, since no code bridges a `Palette` colour); `LaunchScreenTests` keeps `Color.resolve(in:)`, which reads the colour as SwiftUI draws it." |
| 2026-11-11, iOS 26's empty bar (line 87) | "Worked around 2026-11-11. Since PR #50 (`beb2435`, ADR-033) every `ios` run runs `RootFailureTests` on iOS 27.2 and 26.5, and the iOS 18.6 and 17.5 runs that also ran it have ended; since `ios/b0-ios26` iOS 26 is the minimum, so `toolbar(removing: .title)` (iOS 18 on) would need no version check, but the kept-visible bar stays (`docs/plans/ios-b0-ios26.md` section 3); whether iOS 27.2 also gives an empty bar no height isn't measured, and the hosted test holds the title's place on both." |
| 2026-11-11, one pending job per concurrency group (line 90) | "Seen 2026-11-11. The compatibility dispatches ended with ADR-033 (2026-11-13); a full run by hand still joins the `ios-evidence` group, so it is started only once a push's run's `evidence` job has started (`docs/GITHUB.md`'s dispatch note), and a run cancelled this way is re-run as the workaround says." |
| 2026-11-13, the ScrollView inset on iOS 17.5 and 18.6 (line 113) | "Worked around 2026-11-13, shown at `f23660a` (PR #47: `ios` 191 of 191 twice on iOS 26.5, and 119 of 119 on each of iOS 18.6 and 17.5). Closed 2026-11-13 (`ios/b0-ios26`): iOS 26 is the minimum (ADR-033), and on iOS 26.5 the scroll was exact as the keyboard rose (probe 43362003842), so no iOS the app runs on is known to have it; `ProfileForm` keeps the keyboard as Continue's footer's padding, exact on 26.5 too, and every `ios` run tests it on iOS 27.2 and 26.5. That Continue rises with the keyboard rather than ahead of it stays a device check for slice 12 (`docs/plans/ios-b0-adopt-handoff-7.md` section 9, item 3)." |
| 2026-11-13, two simulators (line 123) | "Open. The snapshot tests run on one runtime only (iOS 26.5 under the interim, iOS 27.2 since `ios/b0-ios26`), so only the unit, hosted and UI tests have two chances to fail a run; once `ios/b0-ios26`'s references are taken, `A02-age-dark` is compared on iOS 27.2 against a reference drawn there (the journal's block 1.3, Next 4)." |
| 2026-11-13, the interim (line 124), written in commit B once the references are drawn | "Open: since `ios/b0-ios26` (PR #<n>) the file holds `27.2` and the references are drawn on iOS 27.2, so the snapshot tests run there; the interim, and with it the path back to iOS 26.5 by deleting the file, goes in the next CI-configuration PR, which closes this row." |
| 2026-11-13, the session's Swift (line 125), written in commit A once the lint has run in the session | "Workaround in use: a session installs Swift 6.4.2 by hand. The format files' key is in since `ios/b0-ios26` (`"shouldGroupImports": true` in `orderedImports`, in `apps/ios/.swift-format` and `packages/swift/.swift-format`), and `swift format lint --strict` over `apps/ios` and `packages/swift` passes on Swift 6.4.2 there." |
| Lines 12, 38, 42 and 48 | The full stop PR #50 left out before "Since ADR-033" or "Since 2026-11-13" in each Status cell (lines 37 and 51 are rewritten above). The grep below the table then finds nothing. |


The full-stop check, with plain pipes:

```
grep -noE "[A-Za-z0-9)`'] (Since (ADR-033|2026-11-13)|Superseded on)" docs/LIMITATIONS.md
```

Also add one new row in commit B, only if section 4.3's tab-symbol finding is confirmed and no supported API keeps the outline: date, "On iOS 27.2 the system's tab bar draws every tab's SF Symbol filled, whatever `symbolVariants` the tab item asks for", run A as the evidence, and the Known difference as the workaround.

### 2.7 `design/reference/INVENTORY.md`

No state changes status, and every row keeps its shape (`tools-tests` reads at least 149 states). Six notes describe which runtime a check runs on; they go in commit A:

- **Line 274.** "(…a hosted test, so it is measured on iOS 17.5 and 18.6 as well as 26.5)" becomes "(…a hosted test, so every `ios` run measures it on iOS 27.2 and 26.5, as the runs on iOS 17.5 and 18.6 did until ADR-033)".
- **Line 407.** "the fonts differ across iOS 17.5, 18.6 and 26" becomes "the fonts can differ from one iOS version to another".
- **Line 427's first clause.** "so it would show on iOS 17 and 18 only" becomes "so it could show only on iOS 17 and 18, which the app no longer runs on (ADR-033)".
- **Line 431.** "Hosted tests (`TadayoTests`, which the iOS 18.6 and 17.5 runs run too)" becomes "Hosted tests (`TadayoTests`, which every `ios` run runs on iOS 27.2 and 26.5)". "In the snapshot bundle, which runs on the newest iOS only" becomes "In the snapshot bundle, which runs on iOS 27.2 alone".
- **Line 449.** "which the iOS 17.5 and 18.6 compatibility runs also run." becomes "which every `ios` run runs on iOS 27.2 and 26.5, where the snapshot tests run on iOS 27.2 alone."
- **Line 458.** "and run in the iOS 17.5 and 18.6 compatibility runs too." becomes "and run on iOS 27.2 and 26.5 in every `ios` run."

The notes that measure the 26.5 references are written in commit B, from the 27.2 references, as section 4.5 says:

- **Line 36, `A02-age`.** The read against frame 26, the glass capsule, "its bottom 78.5 points above the phone's", the bar at the largest text.
- **Line 55, `A03-profile`.**
    - "465 against 420" and the part due to "iOS 26's bar" are measured again.
    - The iOS 17.5 and 18.6 sentence becomes: "The column and footer ignore the keyboard and the footer is padded by its height, the same place drawn another way: on iOS 17.5 and 18.6, which the app ran on until `ios/b0-ios26` (ADR-033), that scroll moved nothing as the keyboard rose while the keyboard was a safe area the column gave way to (`docs/LIMITATIONS.md`, 2026-11-13)."
- **Line 274's last clause.** "(iOS 26's taller bar…)" becomes the snapshots' bar, iOS 27.2's, if the 13 points still hold.
- **Line 396, "The snapshots' phone".** The bar becomes the snapshot runtime's, iOS 27.2's since `ios/b0-ios26`; the 62 and the glass are measured again. "since a layer render left iOS 26's bar out" and "where the frames draw iOS 18's" stay: they say why, and what the frames draw.
- **Line 401, "The title's height".** "The snapshots' navigation bar (iOS 27.2's since `ios/b0-ios26`) … about <n> points lower than drawn."
- **Line 427, the rest.** "iOS 26's glass" is read again, and the filled and outlined sentence follows section 4.3's decision. "The first snapshots (`ios` run 42321690362, iOS 26.5) show it" stays as history.

Left: line 301 and line 424. Both stay true, and `ios/b0-adopt-header` builds line 424's band for iOS 26 and later.

### 2.8 The needs list (`docs/design/handoff-7/ios-lane-needs.md`)

- **Item 36, line 76.** Its ask becomes: "Built: the system's colour on every iOS, with the selected tab in `action` and its symbol filled. Since `ios/b0-ios26` the app runs only on iOS 26 and later (ADR-033), whose glass tab bar that setting doesn't fit, so no iOS the app runs on can take another colour: confirm the system's colour." (Commit A.)
- **Item 60, only if section 4.3's tab finding stands as a Known difference (commit B).** A new section 11, "From the move to iOS 26 and 27 (`ios/b0-ios26`)", with item 60: iOS 27's tab bar fills every tab's symbol. Confirm that the glass selection and `action` mark the selected tab there, or say what should.

### 2.9 `docs/PROGRESS.md` (the ios section only)

The thread's facts below were read from the journal, git and GitHub before they were written.

- **Done (line 21).** Append after #44's sentence:
    - PR #47: "PR #47 (`ios/b0-adopt-profile`, PR 5b: A03-profile as handoff 7's frames 10, 11, 20 and 27 draw it, with the keyboard as Continue's footer's padding, which the iOS 17.5 and 18.6 runs needed; 19 references) squash-merged as `7fb802a` on 2026-11-13 at 07:29 UTC at the founder's approval at `164449c`; `ci` 43386041829 and `ios` 43386041680 green on `main` there."
    - PR #50: "PR #50 (`ios/b0-ci-xcode27`, CI configuration only, ADR-033: the `ios` workflow on `xcode-27`, built once on Xcode 27.2 and tested on iOS 27.2 and 26.5; the `ios_version` input and the iOS 17.5 and 18.6 runs gone) squash-merged at `14dc69d` as `beb2435` on 2026-11-13 at 18:03 UTC at the founder's approval in this thread; `ci` 43478918451 and `ios` 43478948110 green on `main` there."
- **In progress (line 22).** Replaced with this PR: the branch from `main` at `beb2435`, this plan, and section 2's list in one sentence.
- **Next (line 23).** Replaced with block 1.3's new Next, in short (section 2.11).
- **Needs from the other lane (line 24).**
    - Drop the whole request for B2's contract PR of 6 November, and its addition of 11 November on `Member.position`. Each point was checked against `main` at `beb2435`: #51 (`1cd56f0`) replaced `clash_with` with `holders` (two to six members, a clash ending only when all but one have chosen another day, `packages/contracts/src/schemas/clubs.ts` lines 429–468), lets `ScheduleChoiceRequest` take a `no_reveal` day (lines 565–573), gives `first_date` FQ79's 24 elapsed hours with no "fixed for the proposal's life" left, and orders `Member.position` by joining in the first days, so no row moves (FQ98, lines 97–105); #23 (`edf0926`) made the `no_reveal` example cite `G04-contested-other` (`src/fixtures/examples-clubs.ts` line 533). One sentence says so, naming #51 and #23.
    - Add, for the parts of `docs/plans/B0.md` the api lane keeps (MILESTONES "Lanes"):
        - F3 (line 19) can drop "until then ADR-018 says iOS 17";
        - section 3's `ios.yml` row (line 109) has no input since ADR-033, and runs on `xcode-27`;
        - section 4's naming rule (line 131) names an iOS version a phone running the app can no longer have, and "your iPhone" alone keeps the rule of no model and no version;
        - section 6's Swift row (line 258) says `swiftly install` in the session, where a session now installs Swift 6.4.2 from swift.org's signed release by hand;
        - section 6 (line 259) and section 7 (line 265) describe `macos-26` and `ios.yml`'s input, where every `ios` run now tests iOS 27.2 and 26.5 and a gate's full run is a dispatch with no input.
    - Also add the api lane's own lines this PR leaves stale: its Needs clause (line 17) about block 1.1's pre-gate line and section 0's minimum-iOS lines, which `main` no longer has and this PR rewrites; and the Shared section's In progress (line 8), "while the ios lane's CI PR #50 waits on GitHub's Xcode 27 image", since #50 merged.

### 2.10 The active plans' lines

`docs/plans/ios-b0-adopt-handoff-7.md` is active, since PR 6 hasn't merged. ADR-033's Documents bullet names these lines:

- **Line 38 (C12).** "so they run on iOS 18.6 and 17.5; … in the snapshot target, which skip there" becomes "so they run on every runtime an `ios` run tests (iOS 27.2 and 26.5 since ADR-033; iOS 18.6 and 17.5 too until then); … in the snapshot target, which runs on the snapshot runtime alone".
- **Section 3's table.** A new row C13, after C12: "| C13 | The appendices' runs on iOS 18.6 and 17.5 and their `ios_version` input (`tests.md` sections 1, 2.1 to 2.3, 3.2, 3.4, 7.2, 7.5, 8, 9 and 10; `gaps.md`'s compatibility dispatches; `root.md`'s and `records.md`'s band on iOS 17/18; `signin.md`'s iOS 17.0 deployment target) | Ended by ADR-033 (13 November 2026, #50): iOS 26 is the minimum from `ios/b0-ios26`, and every `ios` run builds once and tests on iOS 27.2, with the snapshot tests, and on iOS 26.5; a run by hand is the full set in `ios-full/`. What the appendices say of those runs is how PRs 1 to 5b were checked; PR 6 and slice 12 follow this plan's sections 5, 7, 8 and 9 |". The appendices stay frozen.
- **Line 46.** "the answer is recorded as ADR-033 (the number held for this slice)" becomes "the answer is recorded as an ADR under the next free number, reserved through the coordinator (ADR-033, once held for this slice, went to the iOS 26 decision in #50)".
- **Line 62.** "run on iOS 18.6 and 17.5, which skip `*SnapshotTests`" becomes "run on every runtime an `ios` run tests (iOS 27.2 and 26.5 since ADR-033; iOS 18.6 and 17.5 too until then), where `*SnapshotTests` run on the snapshot runtime alone".
- **Line 86 (the common Done).**
    - "the iOS 18.6 and 17.5 runs green (code PRs only); " becomes "(since ADR-033 each `ios` run tests iOS 27.2 and 26.5; until then code PRs also needed the iOS 18.6 and 17.5 runs green); ".
    - "a by-hand full `ios` run (no `ios_version`)" becomes "a full `ios` run by hand (a dispatch, every snapshot in `ios-full/`)".
- **Line 110.**
    - "(it also runs on iOS 18.6 and 17.5)" becomes "(it runs on iOS 27.2 and 26.5, both runtimes an `ios` run tests)".
    - "(newest iOS only)" becomes "(iOS 27.2 only, the snapshot runtime)".
- **Line 115.** "**UI** (all three iOS versions)" becomes "**UI** (both iOS versions each `ios` run tests, 27.2 and 26.5)".
- **Line 120.**
    - The opening becomes "Each `ios` run was 8 to 9 macOS minutes (C2); since ADR-033 a run's build job takes 20 to 28, since it downloads iOS 26.5 and tests on iOS 27.2 and 26.5 (`docs/LIMITATIONS.md`, 2026-11-13)."
    - The dispatch clause becomes "Until ADR-033 code PRs also ran the iOS 18.6 and 17.5 dispatches once, at the final head; every run now tests both versions, so there are none."
    - "each of which moves the head and voids the dispatches" becomes "each of which moves the head".
- **Line 131 (section 9, item 6).** "on iOS 17 or 18 and on iOS 26" becomes "on iOS 26 or later (the minimum since ADR-033)".
- **Line 60 stays.** It is PR 5a's merged reasoning.

`docs/plans/B0.md` line 90, slice 11's row, is the ios lane's own row (MILESTONES "Lanes": each thread edits its own slices' rows): "iOS 17 as the minimum (F3, ADR-018)" becomes "iOS 26 as the minimum since `ios/b0-ios26` (F3, ADR-033; iOS 17 before it, ADR-018)". This file, `docs/plans/ios-b0-ios26.md`, is new.

### 2.11 The journal (`docs/JOURNAL.md`)

**Section 0** (the ios lane's lines):

- **0.2's iPhone row (line 71).** "(ADR-033; the deployment target moves from 17.0 in the app's PR `ios/b0-ios26`)" becomes "(ADR-033; `deploymentTarget` 26.0 in `apps/ios/project.yml`, and `.iOS(.v26)` with swift-tools-version 6.2 in the three `packages/swift/*/Package.swift`, since `ios/b0-ios26`)".
- **0.7's ADR-033 line (188).** "and supersedes ADR-018 (`ios/b0-ci-xcode27`)." becomes "and supersedes ADR-018: its CI half in `ios/b0-ci-xcode27` (PR #50, merged as `beb2435` at 18:03 UTC on 2026-11-13), its app half in `ios/b0-ios26`."
- **Line 190.**
    - FQ4's clause on the founder's phone and its iOS version becomes "FQ4 in part, which kept the iOS 17 minimum (ADR-018) until ADR-033;". This drops a present-tense statement of the founder's iOS version, as FQ4 itself does in this PR. ADR-018's line (173) drops its clause on the founder's iPhone the same way, as the api lane's PROGRESS clause (line 17) asks; ADR-018 in `docs/DECISIONS.md` stays as history.
    - "which answers FQ4 for the app (ADR-033)." gains ", recorded in `docs/QUESTIONS.md` by `ios/b0-ios26`".
- **Line 191** becomes "FQ4 for the founder's iPhone and the trial members'", as FQ4's open parts now are. **Line 192** becomes "the trial members' phones, and the founder's before slice 12's TestFlight build (FQ4), which matter only if one can't run iOS 26, the minimum since ADR-033;", as FQ4's new bullet asks, naming no model or version.

**Block 1.1, its ios lines.** `docs/MILESTONES.md` line 50 gives the ios thread the shared block's lines on the app, the design, TestFlight, the `ios` workflow and the Swift tests, and the api lane's PROGRESS (line 17) gives it the minimum-iOS lines. The api thread is told after the commit.

- **Line 293 (Swift in the session).** Becomes "Swift 6.4.2 in the session (`swift --version`), the version `ci` uses since ADR-033, installed by hand from swift.org's signed release tarball, since the environment has no setup script (`docs/LIMITATIONS.md`, 2026-11-13, the row on a session's Swift); sessions used Swift 6.3.3 from slice 11 until then (the ios thread's from swift.org's signed tarball, `docs/LIMITATIONS.md`'s row of 2026-11-03 for the ios thread)."
- **Line 295.** "What a run with tests, snapshots or `ios_version` does is still shown only in the session:" becomes "What the steps do now, tested in the session and run on GitHub by every `ios` run since (ADR-033; the ios lane's runs in block 1.3 and section 4.2):".
- **Line 296's snapshot sentence** gains "(`27.2` since `ios/b0-ios26`) … until the CI-configuration PR after `ios/b0-ios26` removes the interim".
- **Line 297's counts.** "`tools/ci/ios_steps_test.py`: 100 tests, all passing on Python 3.11, 3.12 and 3.13" becomes "`tools/ci/ios_steps_test.py`: 177 tests since PR #50 (100 at slice 9, all passing then on Python 3.11, 3.12 and 3.13)", and "149 deliberate breakages" gains "at slice 9", since line 295 now introduces the steps as they are.
- **Line 348.** Becomes "The trial members' iPhone models and iOS versions, and before slice 12's TestFlight build whether the founder's iPhone runs iOS 26 or later (FQ4), which matter only if one can't run iOS 26: the minimum since the founder's decision of 2026-11-13 (ADR-033), built since PR #50 (`beb2435`, CI) and `ios/b0-ios26` (`deploymentTarget` 26.0), which records the answer in `docs/QUESTIONS.md`."
- **Line 354's Swift sentence.** "Swift: `. /opt/swiftly/env.sh`, then once per session the install in `docs/LIMITATIONS.md`'s swiftly row (`swiftly install 6.3.3`, never the newest)." becomes "Swift: none on the image, since the environment has no setup script; once per session install Swift 6.4.2, `ci`'s, from swift.org's signed release as `docs/LIMITATIONS.md`'s row of 2026-11-13 on a session's Swift says (`swift-6.4.2-RELEASE-ubuntu24.04.tar.gz` and its `.sig`, checked with `gpg --verify` against `https://www.swift.org/keys/all-keys.asc`, extracted to `/opt/swift-6.4.2` and linked into `/usr/local/bin`)." The Node part is the api lane's and stays.
- **Line 362.** The swiftly clause ("where swiftly's configuration is missing, … `~/.local/share/swiftly/toolchains/6.3.3/usr/bin/swift`") goes, and "`swift-format lint --strict` with `packages/swift/.swift-format` for the packages and `apps/ios/.swift-format` for the app" becomes "`swift format lint --strict --configuration packages/swift/.swift-format --recursive packages/swift` and `swift format lint --strict --configuration apps/ios/.swift-format --recursive apps/ios`, each with no output (the format files need `orderedImports.shouldGroupImports` on Swift 6.4.2, in since `ios/b0-ios26`)".
- **Line 371's ios clause.** Becomes "every `ios` run downloads iOS 26.5, which GitHub's Xcode 27 image hasn't got, and runs its unit, hosted and UI tests on iOS 27.2 and 26.5, so an intermittent one has two chances to fail it, and its snapshot tests on iOS 27.2 alone since `ios/b0-ios26` (ADR-033); the ios lane's runs are in block 1.3." This drops the stale "first proven on the ios lane's first snapshot run".
- **Line 350 stays.** This PR adds nothing about the founder's phone, and `main` still says what that line quotes, in ADR-018 (`docs/DECISIONS.md`), as history.

**Block 1.3, rewritten whole, in each commit:**

- The Updated line.
- A new "This branch" item: what this PR changes, its commits and runs, the references read and taken, and the reading's counts by class (section 4.3).
- PR #50's long item (lines 435 to 458) condensed into a merged entry like #47's: head `14dc69d`, merged as `beb2435` at 18:03:49 UTC, the founder's approval, `ci` 43478918451 and `ios` 43478948110 on `main`, line 440's sentence kept, and the details pointed to section 3.3 and 4.2's #50 row.
- Line 439's snapshot sentence becomes: "The snapshot tests run on iOS 27.2 alone (`ios_steps.snapshot_runtime`): `ios-version` holds `27.2` since `ios/b0-ios26`, whose references are taken on iOS 27.2 with Xcode 27.2, each read against its 26.5 one; `toolchain.SNAPSHOT_RUNTIME_INTERIM` and the fallback stay until the next CI-configuration PR removes them." Until commit B, it says the references are still being taken.
- Line 459, the check branch's item, stays, with "where this PR's CI change ran" now "where #50's CI change ran".
- Next, in order:
    1. This PR: run A and its build-log check, the reading, any fix, the take-in, run B, the second green, the 26.5 check branch, the independent review, the founder's approval, the check that the api lane doesn't hold `dev` and that no `ops` or `deploy-dev` run is in progress or queued, the squash-merge, and `ios` dispatched on `main`.
    2. The CI-configuration PR, under a freeze (T58): it removes `toolchain.SNAPSHOT_RUNTIME_INTERIM` and `snapshot_runtime`'s fallback with `SnapshotRuntimeTest`'s interim cases, rewrites `toolchain.py` lines 45–46 ("SNAPSHOT_RUNTIME_INTERIM: the runtime the committed references were drawn on"), updates `ios_steps_test.py` lines 407–408's comment ("17.0 now, 26.0 once the app's PR raises it"), and closes the interim row.
    3. The rulebook PR: `docs/TECH-DESIGN.md` sections 1, 2, 8, 9 and 10; `docs/GITHUB.md` lines 87 and 129 to 137.
    4. The intermittent-failure fixes. Old Next 4, reworded: `A02-age-dark` is now a snapshot test on iOS 27.2 against a 27.2 reference, and A03's keyboard inset was "on the iOS 17.5 and 18.6 runs before ADR-033".
    5. Old Next 5: A02-email's Return flag, PR 6, slice 12. Slice 12's device checks need an iPhone on iOS 26 or later.
- Blocked or waiting: the founder's approval of this PR, asked once it is reviewed. No freeze applies.
- The Design line loses "; `docs/plans/ios-b0-adopt-handoff-7.md` line 46 still holds ADR-033 … and the app's PR corrects that line".

**Section 2** (rows edited in place, never deleted):

- **T10 (line 497).** "in the `ios` workflow and the iOS 17 and 18 compatibility runs" becomes "in the `ios` workflow on iOS 27.2 and 26.5 since ADR-033, and on the iOS 17.5 and 18.6 runs before it". (Commit A.)
- **T43 (line 530).** "(hosted, so the iOS 18.6 and 17.5 runs read it too)" becomes "(hosted, so it runs on iOS 27.2 and 26.5, as it ran on the iOS 18.6 and 17.5 runs before ADR-033)". (Commit A.)
- **T45 (line 532), only if section 4.3's tab finding stands as a Known difference (commit B).** "SF Symbols filled when selected and outlined otherwise (`symbolVariants`)" says what each iOS draws: outlined when unselected on iOS 26, every symbol filled by iOS 27's tab bar, the `docs/LIMITATIONS.md` row and needs item 60.
- **T47 (line 534).**
    - "(hosted, so the iOS 17.5 and 18.6 runs read them too)" becomes "(hosted, so they run on iOS 27.2 and 26.5, as they ran on the iOS 17.5 and 18.6 runs before ADR-033)". (Commit A.)
    - `ios/b0-adopt-avatar`'s "the iOS 18.6 and 17.5 runs are to come" becomes "and on iOS 18.6 and 17.5 at `ffea400` (43225187759 and 43226989422, 110 of 110 each) before ADR-033 ended those runs". (Commit A.)
    - `ios/b0-adopt-profile`'s "the iOS 18.6 and 17.5 runs, still to come, read them too" becomes "so they passed on iOS 18.6 and 17.5 at `f23660a` too (43364929640 and 43364932164, 119 of 119 each) before ADR-033 ended those runs, and run on iOS 27.2 beside 26.5 since PR #50". (Commit A.)
    - Plus one clause in commit B: the screens' references drawn on iOS 27.2 since `ios/b0-ios26`.
- **T58 (line 545).** (Commit A.)
    - "with `ci`'s tools test reading the real file, while deleting the file…" becomes "which the file has held since `ios/b0-ios26`, with `ci`'s tools test reading the real file (`SnapshotRuntimeTest.test_the_repository_s_own_file`), while deleting the file…".
    - "`IOS_VERSION` in both jobs" becomes "no `ios_version` input and no `IOS_VERSION` in either job since ADR-033 (`test_no_ios_version_is_asked_for_or_read`)".
- **Spec 29 (line 595).** "on iOS 17.5 and 18.6 too since the keyboard became…" becomes "on iOS 27.2 and 26.5, and on iOS 17.5 and 18.6 too before ADR-033 ended those runs, once the keyboard became…". (Commit A.)

**Section 3.3:** one log entry per commit, with all six fields.

**Section 4:**

- 4.2: this PR's row, "to open", in the last commit before the PR opens, and its number and review findings in the commit that records the review.
- 4.4's references row (commit A) becomes "`apps/ios/**/__Snapshots__/`, on `main`, drawn on the iOS version `apps/ios/TadayoSnapshotTests/__Snapshots__/ios-version` names, or iOS 26.5 while the file is absent (`toolchain.SNAPSHOT_RUNTIME_INTERIM`): iOS 26.5 until `ios/b0-ios26` merges, iOS 27.2 from then".
- 4.4 gains a row in commit B for the reading, a new kind of evidence: "A reading of each reference against the one it replaces | `<branch>/<short-sha>/reading/`, until the monthly reset, made in the session from that run's images: the panels as JPEGs (old, new and the mask of what differs) and `reading.md` (each state's class, bands, largest difference, note and the SHA-256 of the image read and taken); `ios/b0-ios26`'s at run A's short SHA".

### 2.12 Left as history, on purpose

- ADR-001 and ADR-018, and ADR-033 itself (accurate as written).
- Every log entry, and 4.1's and 4.2's rows of merged PRs.
- The handoff 7 appendices (C13 covers them), its brief, reviews and check.
- The needs list's answered item 17.
- The plans of merged slices (`ios-slice-11-second-part.md`, `ios-b0-lab-rows.md`).
- `docs/plans/B0.md`'s slice 9 row (line 79).
- `docs/LIMITATIONS.md` line 49's evidence, and the Limit, Evidence and Workaround cells of the rows in section 2.6.
- `design/reference/README.md` line 17.

## 3. The iOS 17 and 18 workarounds in code

Nothing in `apps/ios` or `packages/swift` checks the OS version: no `#available`, no `@available(iOS …)`. The one `@available(*, unavailable)` in `ScreenSnapshots.swift` is unrelated, and the `#if canImport` lines are for Linux. So raising the target removes no check. Three workarounds were made for behaviour seen on iOS 17 or 18, and one for iOS 26:

| Workaround | Where | Seen on | Decision | Why | How it is held on iOS 26.5 and 27.2 |
|---|---|---|---|---|---|
| The keyboard as Continue's footer's padding | `ProfileForm` in `ProfileScreens.swift`: `.ignoresSafeArea(.keyboard, edges: .bottom)` on the column and footer, `footerBottom` = 12 + `room.keyboard`, the scroll in the same update | Needed on 17.5 and 18.6. On 26.5 the probe (43362003842) found it exact either way | Keep the code; add one sentence to the comment (2.5) | It holds on every version measured. Removing it hands Continue back to the system's keyboard avoidance, which changes how Continue moves. That would need its own probe on 27.2, its own device check and its own LIMITATIONS record. It would also ride with 222 references, so a moved pixel couldn't be told from iOS 27's. Nobody gains from the change now ("Keep it simple") | `SignInUITests.testAProfileFailureStaysInViewAndTheNameIsReadOnlyWhileSaved`, `testSignInGoesToTheEndOnStandInServices` and `testLeavingSignInFromTheProfileStartsAgain` run on both passes of every run, and so do `SignInReadingTests`' Continue readings (hosted) |
| The Return count held 100 ms after a save | `ProfileForm`'s `onSubmit` (`returnSaves`, lines 242–255, its comment 243–247) | Seen on 17.5 (run 43358826308) | Keep the code and the comment | It guards an event order SwiftUI doesn't promise on any version: a save that fails at once ends before the lost focus reaches `onChange(of: focused)`. Block 1.3's Next 5 gives A02-email's `sendingFromReturn` the same fix | The A03 UI tests' Return steps, on both passes |
| `Color.resolve(in:)`, never `UIColor(Palette.canvas)` | `LaunchScreenTests` only | The bridging bug on 17.5 only | Keep the code; change the docstring (2.5); close the LIMITATIONS row (2.6) | Reading the colour as SwiftUI draws it is the right check on any iOS. The app hands no `Palette` colour to UIKit | `testTheLaunchScreenIsTheCanvasInLightAndDark` on both passes |
| The empty bar kept visible (an iOS 26 workaround) | `RootFailure`, `.toolbar(.visible, for: .navigationBar)` | iOS 26.5 (LIMITATIONS 2026-11-11) | Keep; change the docstring's runtimes | iOS 26 is now the minimum, so it is needed. `toolbar(removing: .title)` would need no version check now, but the bar works and a switch moves the layout | `RootFailureTests.testTheFailureTitleSitsWhereTheSignInTitlesSit` and `testRetryIs44PointsAboveTheSafeAreaAndTheLineIs16UnderTheTitle` on both passes; `RootSnapshotTests` on 27.2 |
| The snapshot harness's facts: `drawHierarchy`, the top's 62, `FramedHost`'s 34, the 2,200-point `-xl` window, `Spinners` | `ScreenSnapshots.swift` 11–20, 101–104, 117–124 | Measured on the 26.5 snapshot runtime | Keep the code. Change the text only where run A contradicts it | They are true of iOS 26, where they were measured, and they are why the harness draws as it does | Run A shows on 27.2 whether every bar's title and buttons are drawn, whether content sits where the 26.5 references put it (so 62 at the top and 34 at the foot), whether every `-xl` and 320-point image is whole, and whether `Spinners.check` passes. In C2 none of the 215 failures was the check's, and the two waits matched their 26.5 references within precision. The layer render and the 2,800-point window aren't tried again, and the log says so |

Not adopted: `Tab` and `toolbar(removing:)` (iOS 18), `onScrollGeometryChange` and `ScrollPosition` (iOS 18), `safeAreaBar` and `Observations` (iOS 26; `Observations` would need a version check on TadayoCore's macOS 14, though it builds on Linux with Swift 6.2 and later). No behaviour asks for them, and each would change working code. The exception is section 4.3's tab-symbol fix, if the documented way turns out to be one of these APIs.

Deprecations: raising the target makes the compiler report every API deprecated in iOS 18 to 26 that the app calls. Warnings don't fail the build; no setting treats them as errors. The PR lists every `warning:` line from `apps/ios` and `packages/swift` sources in run A's `logs/build.log` that `main`'s last `ios` log hasn't got. None is changed here, since each change would move behaviour beside the reference retake. A later PR takes those whose replacement behaves the same.

How a removal would be proven, for this PR's choices and for any later one:

- **Behaviour:** the hosted and UI tests, which every run passes on iOS 27.2 and 26.5.
- **Drawing on 27.2:** the snapshot tests.
- **Drawing on 26.5:** while the interim exists, a check branch that deletes `ios-version` and restores `main`'s 26.5 references (section 4.4).
- **Feel:** a device check (`docs/plans/ios-b0-adopt-handoff-7.md` section 9, item 3).

Nothing is loosened or skipped to make a removal pass.

## 4. The references

### 4.1 The commits and runs, in order

1. **Commit A.** Everything in section 2 that doesn't depend on a run, plus the `ios-version` file. It also deletes the eight references C2 didn't carry (`index.md`: "7 snapshot(s) not carried", and the one C2 deleted itself):
    - `__Snapshots__/LabSnapshotTests/testLabSections.Lab-photos.png`;
    - `__Snapshots__/RootSnapshotTests/testGlobalLaunch.global-launch.png`, `-dark` and `-xl`;
    - `__Snapshots__/RootSnapshotTests/testGlobalLeaving.global-leaving.png`, `-dark` and `-xl`;
    - `__Snapshots__/LabSnapshotTests/testLabSections.Lab-avatars-large.png`, which C2 deleted and drew as `new`, so it has never been compared with its 26.5 reference on 27.2.

    With record mode `never` a matching image is never exported. The first seven matched their 26.5 references within precision on 27.2; `Lab-avatars-large` might. Deleting all eight makes run A draw them as `new`, so every reference comes from iOS 27.2. A 26.5 image that passes on 27.2 within `perceptualPrecision: 0.98` sits nearer the threshold than one drawn there, and `index.md` labels every reference iOS 27.2's.

    **Run A** is red by design:
    - On iOS 27.2 every snapshot test that asserts a reference fails. C2 had 54 tests failing: 214 "does not match reference" and 1 "No reference was found on disk", and no failure from a VoiceOver reading, TS-13's geometry or `Spinners.check`. This run adds `testGlobalLaunch` and `testGlobalLeaving`.
    - iOS 26.5 should pass 119 of 119.
    - `logs/build.log`: every Tadayo module's `-target` is `arm64-apple-ios26.0-simulator` (section 1).
    - `collect` exports each 27.2 image that differs as `changed` (swift-snapshot-testing's artifacts) and each with no reference as `new` (`xcresulttool`).
    - The evidence job puts them, the contact sheets and `index.md` under `ios/b0-ios26/<A>/ios/`.

    Expected: 214 `changed` and 8 `new`, all 222 carried. Any further image `index.md` doesn't carry matched its 26.5 reference within precision: a commit before commit B deletes it, and that commit's run draws it as `new` and is read the same way. Run B never meets a reference deleted after run A.
2. **Fixes, if any.** If run A shows a defect (4.3), the fix comes in its own commit before anything is taken in. References come from the first run at which every image is final.
3. **Commit B.** Every image taken in (4.2), the INVENTORY notes that measure the references (2.7, 4.5), LIMITATIONS' interim row, the T47 clause, 4.4's reading row, the tab-symbol records if section 4.3's finding stands (`TabsView.swift`'s comment, the T45 row, the LIMITATIONS row, needs item 60), and the journal. **Run B** must be green: iOS 27.2 191 of 191 with the snapshot tests, iOS 26.5 119 of 119 without, and `index.md` with no `changed` or `new` row.
4. **The second green: a dispatch at B's head.** It lands in `ios-full/` and carries every state beside its render for the founder. It starts only once run B's `evidence` job has started (LIMITATIONS 2026-11-11, one pending job per group).
5. **The 26.5 check branch** (4.4).
6. **A records-only commit** with 4.2's row, then the PR, the review and its fixes. A commit that changes only `docs/` starts no `ios` run (`ios.yml` runs on `apps/ios/**`, `packages/swift/**`, `packages/contracts/**` and `design/reference/**`), so run B and the dispatch stand for the final head, as #50's records-only last commit had its runs at the commit before. A review fix that touches one of those paths gets its own run, read before the founder is asked.

INVENTORY edits trigger `ios` (`design/reference/**`), so they ride with commits that run anyway.

### 4.2 Taken in only when byte-identical to the images read

- The images are fetched from `evidence` once, from `ios/b0-ios26/<A>/ios/snapshots/`, mapped to their reference paths by `index.md`'s File column. A `new` row's File is `<test class>/<file>` under `apps/ios/TadayoSnapshotTests/__Snapshots__/`.
- Each image's SHA-256 goes in the reading table when it is read.
- A session script in the scratchpad, not committed (as `take_in.py` was for #37), copies each file to its reference path only if its SHA-256 is still the one read. It refuses any that differ, and those are read again.
- After the take-in:
    - `git ls-files 'apps/ios/**/__Snapshots__/*.png'` lists the same 222 names as `main`, so no state is renamed or lost;
    - each committed file's SHA-256 equals its read image's;
    - `git status` shows nothing else under `__Snapshots__`.
- If a redrawn image is byte-identical to its 26.5 reference, git shows no change for it, and the record says so.
- Run B, and then the dispatch, must match every reference.

### 4.3 Each image read against its iOS 26.5 reference

For each of the 222 states, made in the session (ImageMagick and Pillow, scripts in the scratchpad):

- the 26.5 reference (`git show beb2435:<path>`), the 27.2 image, and a mask of the pixels that differ;
- the bands of rows that differ, in points;
- the largest channel difference;
- the canvas pixel;
- each text line's ink box in both images, so a line moved by a pixel shows.

The run's own sheets add the render where there is one. They show the committed reference ("Before") only for rendered states; Lab and no-render states rely on the session's panels. Each image is read at full size by eye, with the mask as a guide only, and put in one class.

**Expected: the system's drawing on iOS 27 (T45).** These are recorded once, in INVENTORY's "The snapshots' phone", not row by row. C2's sample of eight shows each kind. The bands each class reaches, and S3's largest channel difference with the threshold the mask counts from, are measured from run A's 222 images and recorded in `reading.md`; C2's eight give the kinds, not the numbers.

- **S1, the navigation bar's own controls and their shadow.** The back button's and Leave sign-in's glass capsule, its edge and the soft shadow 26.5 drew around it, which reaches into the rows under the bar, the title's included (C2's `A02-age`, `A03-profile-empty` and `A02-age-xl`). Its words, and the title's, are in place.
- **S2, the tab bar's glass, edge, shadow and selection,** from above the bar's top to the phone's foot (C2's `G06-no-club`, `H01-error-no-club` and `M01-no-club`).
- **S3, glyph edges.** Text rasterized differently, with no glyph moved by a pixel and no line broken elsewhere (C2's `A02-email`, `Lab-avatars`, and the no-club header's + Add and avatar initial).
- **S4, the system's own colours and symbols where the app uses them unchanged.** For example the unselected tabs' label colour, or the indicator as `Spinners` stills it. No `Palette` colour moves; the canvas is (250, 251, 248) in both.

**Defect: the app's to fix in this PR, before any reference is taken.** It is never fixed by taking the image as drawn, by loosening `perceptualPrecision: 0.98`, or by skipping a test.

- **D1.** A `Palette` colour, or a shape the app draws (the folded card, the avatar, the plaque, the busy indicator's place), changed beyond glyph edges.
- **D2.** App content moved by a point or more. The exception is a measured change in the bar's height that moves everything under it alike: that is S1, and INVENTORY's measures (the title's height, A03's field) are written again from the 27.2 images.
- **D3.** A line broken elsewhere, a truncation or ellipsis, a clip, an overlap, a missing or extra element, a changed order, or a missing-glyph box where 26.5 drew a glyph.
- **D4.** An `-xl` or 320-point image cut short, empty, or with its pinned action off its foot (the 2,800-point window's failure).
- **D5.** The wrong appearance (light in dark), a `Spinners.check` failure, or a busy state without its indicator.
- **D6.** A hosted, UI or snapshot-bundle test (a VoiceOver reading, TS-13's geometry) that fails on 27.2 and not on 26.5.
- **D7.** A system change that undoes something the app sets explicitly. One bounded attempt follows: read Apple's documentation for the API, and if a documented SwiftUI way restores the contract on both runtimes with no version check and no UIKit appearance setting (T45), build it. Otherwise it is a Known difference, with a LIMITATIONS row and a needs-list item (T46), and the reference is taken as drawn.

**The one D7 candidate in C2's sample: the tab symbols.** On iOS 27.2 the unselected Friends and Memories (and Home on `M01-no-club`) are drawn filled. `TabsView.tab(_:label:symbol:)` sets `\.symbolVariants` to `.none` for them, and on 26.5 they are outlined. INVENTORY (line 427) says each tab's symbol "is filled when it is selected and outlined when it isn't, as handoff 0 names them and the frames draw them", so the shape, not only its colour, shows the selection. On 27.2 the glass selection and `action` still mark the selected tab, and VoiceOver says it.

- Run A confirms it on every Tabs state, light, dark and `-xl`.
- If a documented way keeps the outline, it goes in `TabsView`, is seen on 27.2 by the Tabs snapshots and on 26.5 by the check branch, and `TabsAnnouncementTests` stays green.
- If not, four current claims become false and are rewritten in commit B: INVENTORY's bullet (line 427) says what each iOS draws; `TabsView.swift`'s docstring (lines 5–8, "the selected one filled and the others outlined…") the same (2.5); the T45 audit row (journal line 532, "SF Symbols filled when selected and outlined otherwise") the same (2.11); and LIMITATIONS gets its row (2.6) and the needs list item 60 (2.8).

### 4.4 iOS 26.5's drawing at this head

Once this PR merges, no run draws iOS 26.5. While the interim exists, one check branch can still do it, against `main`'s 26.5 references, so that the test's own comparison says whether anything moved. `ios/b0-ios26-check` (never to merge) is built from commit B's head:

```
git switch -c ios/b0-ios26-check <B>
git rm apps/ios/TadayoSnapshotTests/__Snapshots__/ios-version
git checkout beb2435 -- apps/ios/TadayoSnapshotTests/__Snapshots__
```

plus its own log entry, as `ios/b0-xcode27-check`'s commits had. Its push run:

- tests the snapshot target on iOS 26.5 (the interim, since the file is gone), with the deployment target at 26.0, against all 222 of `main`'s 26.5 references;
- runs only the unit, hosted and UI tests on iOS 27.2;
- exports only the images that differ beyond precision, `changed`, and none `new`, since all 222 references are there.

Done: `run.json`'s `tests-27.2` passed, 119 of 119, and `tests-26.5` passed, 191 of 191, with `index.md` carrying no `changed` or `new` row. That shows the target raise changed nothing iOS 26.5 draws beyond the snapshot tests' precision. If section 4.3's tab fix went in, `tests-26.5` fails only on the Tabs states it redraws, each `changed` row read as the fix's 26.5 drawing; anything else `changed` is a defect (4.3). Evidence: `ios/b0-ios26-check/<sha>/ios/`. The CI-configuration PR that removes the interim waits until this has run.

### 4.5 Evidence and INVENTORY notes

- **Run A:** `ios/b0-ios26/<A>/ios/` (sheets, `snapshots/`, `index.md`, logs).
- **The reading:** pushed to `evidence` under `ios/b0-ios26/<A>/reading/`, never forced: the panels as JPEGs, and `reading.md`, a table with state, test, class, the differing bands, the largest difference, a note, and the SHA-256 of the image read and taken. The journal's section 4.4 gets its row in commit B (2.11).
- **Run B:** `ios/b0-ios26/<B>/ios/`. **The dispatch:** `…/<B>/ios-full/`. **The check branch:** 4.4.
- **The PR body:** the counts per class, the bands each class reached, every defect found and its fix (or none), the build log's targets and new warnings, and the tab-symbol decision.
- **INVENTORY:**
    - "The snapshots' phone" gets one sentence. Since `ios/b0-ios26` the snapshots are drawn on iOS 27.2, which draws the bar's controls (S1), the tab bar (S2), glyph edges (S3) and the system's own colours (S4) differently from the iOS 26.5 references they replaced. The reading at `<A>` found every text line's ink box, and every shape the app draws, where the 26.5 reference had it, so the measurements in the rows read from earlier runs still hold, except those rewritten from the 27.2 images (2.7). The "Read at run X" notes in the rows stay as they are, as history.
    - Each row's measurement that the 27.2 image contradicts is written again (2.7). No other row changes.

## 5. Verification

Local, in the session:

- **Packages.** On Swift 6.4.2, `swift test --package-path packages/swift/TadayoCore --scratch-path <scratch>/core` (195 tests) and `swift test --package-path packages/swift/TadayoAPI --scratch-path <scratch>/api` (15), each scratch path outside the repository. `swift package dump-package --package-path packages/swift/<each>` reads `ios 26.0` for all three; `TadayoDesign` builds only on CI.
- **swift-format.** `swift format lint --strict --configuration apps/ios/.swift-format --recursive apps/ios` and `swift format lint --strict --configuration packages/swift/.swift-format --recursive packages/swift`: exit 0, no output.
- **Copy lint and format.** After block 1.1's Node setup: `pnpm copy-lint`, exit 0, 0 findings (this PR changes no string file); and `pnpm format:check`, exit 0, since Prettier checks `apps/ios/project.yml` (`.prettierignore` leaves `apps/` in) and the Markdown this PR edits.
- **CI tools.** `python3 tools/ci/ci_steps.py tools-tests` reads the real `ios-version`, `project.yml` and `INVENTORY.md`: 427 tests, 2 skipped as on `main`. Delete `tools/ci/__pycache__` after.
- **T58.** `python3 tools/ci/ci_config_guard.py` passes, and `git diff --name-only origin/main...HEAD -- .github .claude tools/ci .yamllint.yaml` is empty.
- **Journal.** Before each commit, `python3 tools/ci/journal_check.py --branch` and `--all`, and the hook by hand (`echo '{"tool_input":{"command":"git commit"}}' | python3 -I tools/ci/journal_hook.py`, exit 0 with the journal staged).
- **Privacy.** `git diff origin/main...HEAD` is read for "iPhone" and "iOS 1" hits: simulator names and generic model ranges only, and nothing about the founder's phone.

On GitHub:

- **`ci`** green on every push: its `swift` job on `swift:6.4.2-noble`, `guards` (T58's guard and `journal_check.py --branch`), `tools-tests`.
- **`ios`** green on run B's terms at the last head that changes a path `ios.yml` runs on (run B, or a later fix's run), with the dispatch at the same head:
    - `run.json` has `snapshots` `27.2` from `file`, `tests-27.2` `passed` (191 of 191, the snapshot tests included) and `tests-26.5` `passed` (119 of 119);
    - `index.md` says "References: iOS `27.2` (the ios-version file)", with nothing changed or new;
    - the build log's targets read `ios26.0` for every Tadayo module, and its new warnings are listed.
- **The second green:** the dispatch at the same head, the full set in `ios-full/`.
- **The final head:** if it changes only `docs/`, no `ios` run starts there, and the PR says that run B and the dispatch stand for it (4.1, step 6).
- **Failures:** a failure is read and named, never re-run unread. A known intermittent one (block 1.3 Next 4) is re-run only after it has been read as that one.

Done looks like this:

- section 2's changes in;
- all 222 references drawn on iOS 27.2, each read against its 26.5 one and taken in byte-identical to the image read;
- no defect left, or each fixed in app code;
- the 26.5 check branch read, `tests-26.5` 191 of 191 against `main`'s references;
- `ci` green at the head, and `ios` green at the last head an `ios` run covers;
- the independent review (fresh subagents that haven't seen this work, by lens: the records and privacy; the references and the reading, re-reading a sample against the evidence; the code comments) with every finding fixed or answered in the PR;
- the founder's approval in the ios thread at that head;
- before the merge, `dev` checked as not held by the api lane, and no `ops` or `deploy-dev` run in progress or queued;
- the squash-merge through REST at the approved head;
- `ios` dispatched on `main` and read;
- the coordinator and the api thread told about block 1.1's lines and the Needs line.

## 6. Risks, and what is left for later PRs

Risks:

- **An iOS 27 difference the app can't keep.** The tab symbols are the likely one: a Known difference, a needs item and a LIMITATIONS row, said plainly in the PR. A defect the app can fix makes this PR bigger. It is fixed here, because the PR that moves the snapshots can't take a reference that shows a defect.
- **iOS 26's drawing goes unchecked.** From this merge no run checks how iOS 26 draws: snapshots run on 27.2, and 26.5 runs behaviour only. A phone on iOS 26 draws bars as iOS 26 does (LIMITATIONS 2026-11-01's new status). The check branch is the last look at iOS 26.5's drawing before the CI PR removes the interim.
- **Intermittent failures.** The pin test on 26.5, and `A02-age-dark` now against a 27.2 reference, can turn a run red. They are read and named, never loosened; their fixes are Next 4.
- **Time.** At least run A, run B, the dispatch, the check branch and the review's fixes: about 5 to 7 runs of 20 to 28 macOS minutes each.
- **Size.** The 222 references are about 60 MB today, and taking them again adds about as much to history.
- **Devices.** A build installs only on iOS 26 or later (ADR-033), so slice 12's device checks need an iPhone on iOS 26 or later, and FQ4 asks before slice 12's TestFlight build whether the founder's iPhone can run it. Slice 12's notes say so, naming no model or version.
- **Sessions.** `swift format lint` with the new key is verified on Swift 6.4.2 only, not on 6.3.3; block 1.1 tells a session to install 6.4.2.

Left for later PRs:

- **The CI-configuration PR**, under a freeze (T58), after this merge and after 4.4: it removes `toolchain.SNAPSHOT_RUNTIME_INTERIM` and `ios_steps.snapshot_runtime`'s fallback with `SnapshotRuntimeTest`'s interim cases, rewrites `tools/ci/toolchain.py` lines 45–46 ("SNAPSHOT_RUNTIME_INTERIM: the runtime the committed references were drawn on", false once this PR merges), updates `ios_steps_test.py` lines 407–408 ("17.0 now, 26.0 once the app's PR raises it"), and closes LIMITATIONS' interim row.
- **The rulebook PR:**
    - `docs/TECH-DESIGN.md`: line 16 (iOS 26 minimum, `xcode-27`, pins in `tools/ci/toolchain.py`), lines 48, 49 and 50 (the setup script, the Swift toolchain, `macos-26`), line 277 (snapshots on iOS 27.2, hosted and UI tests on 26.5 too, and no founder's version named), line 291, and lines 337, 339 and 342 (the setup script and swiftly);
    - `docs/GITHUB.md`: line 87 (`actionlint -config-file <the repository>/.github/actionlint.yaml`) and lines 129 to 137 (the dispatch with no `ios_version`, keeping the note on waiting for a push's `evidence` job);
    - `docs/MILESTONES.md` line 77 needs nothing.
    - `CLAUDE.md`'s lines on the setup script and swiftly are the founder's to change; the PR's report mentions them once.
- **The api lane's parts:** `docs/plans/B0.md` lines 19, 109, 131, 258, 259 and 265, its own PROGRESS clause (line 17), and the Shared section's In progress (line 8), asked for under "Needs from the other lane" (2.9). Block 1.1's Swift lines are the ios lane's and change here (2.11).
- **Block 1.3 Next 4.** The intermittent failures: A02-code's pin test on 26.5 and `A02-age-dark`, each fixed in app code, never skipped or loosened.
- **Block 1.3 Next 5.** A02-email's Return flag; PR 6 (`ios/b0-adopt-header`), whose band behind the status bar is built and checked on iOS 26 and later; slice 12.
- **Not planned:** removing `ProfileForm`'s keyboard padding; adopting `Tab`, `toolbar(removing:)`, `ScrollPosition` or `safeAreaBar`; `.macOS(.v26)` in the packages (a macOS `swift test` would need it for `RootModelTests`' `Task.immediate`, and no run does one); iOS 26's icon look and Icon Composer; the deprecations this PR lists.
