# gaps: completeness critique of the five reports on adopting handoff 7 for the screens on `main`

> Appendix to `docs/plans/ios-b0-adopt-handoff-7.md`, written on 11 November 2026 for the ios thread's plan from `main` at `a569278` (the code its line numbers cite). **Where it and the plan disagree, the plan wins**: its section 3 lists the corrections. Its scratch scripts were throwaway and are not kept.

Key `gaps`. Read-only: nothing in the repository was edited, committed or pushed (branch `ios/b0-source-files`, HEAD `6d9a05a`, code = `main` `a569278`). I read `signin.md`, `profile.md`, `root.md`, `records.md` and `tests.md` in full, the check (`docs/design/handoff-7/check/handoff-7-check.md`, all) and the findings (`.../handoff-7-findings.md`, nearly all), and re-checked the doubtful claims against the files, the committed snapshots, a Swift 6.3.3 toolchain (the CI pin) and the repository's Actions runs over REST. Cites: `report:line` is a line of that report in this folder; `check:n` a line of the check; finding ids as in the findings file; code as `path:line` at `a569278`.

## 0. Answer first

- The five reports agree on what to build and on every ruling of the check. **No bullet of the check's section 8 for the screens on `main` is left unmapped** (section 2). The drop card group is already shipped by #28.
- **Two numbers that drive the plan are wrong.** (1) PR 3 and PR 4's reference counts leave out the idle largest-text buttons (about 12 more files in PR 3, 9 of them taken again in PR 4; C1). (2) The macOS cost paragraph in `tests.md` takes 15 minutes a run; the runs measure 8 to 9 (C2).
- **One default says something untrue to a person with no account** (`root.md` A1): a signed-out launch shows a spinner and, with VoiceOver, speaks "Loading your account…". It needs a question to the founder (FQ96, section 4) and a gate on "a sign-in was found".
- **Three things nobody planned:** the plan document ADR-032 asks for (a file in PR 1); the 320 and 430 snapshots `docs/TECH-DESIGN.md:66` asks for the five new `-dark` and `-xl` rows; V-16's behaviour for a long code error at the largest text.
- **The split is right in kind** (records first, then vertical, sequential), with these changes: PR 1 carries the plan and every edit that is not build-dependent; the 44-point constant lands in PR 2 and the keyboard-awareness once, in PR 4; PR 3 is split by default (it is 600 lines) and PR 5 is checked against 400 as well. **The first PR is the records PR** (section 5).

## 1. Contradictions between the reports (and inside one)

**C1. The idle largest-text buttons move in PR 3 (signin.md against tests.md). Numbers.**
- `signin.md:252` says the `A02-email` snapshot changes ("idle button slot") and `signin.md:82` says to read "every idle `-xl` of the four screens". `tests.md:234` and `:254` say `A02-email-failed-network` and `A02-email` are "none expected"; `tests.md:208` and `:383` count PR 3 as 18 changed, 3 new and 10 collateral (the busy states only).
- Measured in the committed references (`apps/ios/TadayoSnapshotTests/__Snapshots__/SignInSnapshotTests/`, Pillow, blue-band scan): the primary button is **140 points high with the label on two lines** in `A02-email-xl`, `A02-email-failed-network-xl`, `A02-code-error-xl` and `A02-age-xl` ("Send / a code", "Verify / code"), 80.5 on one line in `A03-profile-xl`; the delivery draws 85 on one line (frame 19). Cause: `PrimaryButton.swift:76-88` reserves a hidden system-size indicator on each side of the label (about 56 points at the largest size by its own doc comment), so the label gets about 193 points. Two fixed 24-point slots leave 273 (`signin.md:68`: 353, less 2 x 16, less 48).
- One-line widths, from the wrapped lines plus one estimated 13-point space: "Send a code" about 249, "Verify code" about 232, "I’m 18 or older" about 284, "Continue" 186. So Send a code and Verify code drop to one line (140 to about 85), I’m 18 or older takes the stacked reserved row (`tests.md` TS-12 guessed this; its tables did not carry it), and Continue stays.
- Consequence: PR 3 also changes `A02-email-xl`, `A02-email-failed-network-xl`, `A02-email-refused-xl` (3) and the `-xl` of the nine A02-code states other than `A02-code-verifying` (9): about **43 references, not 31**; the nine A02-code ones are taken again in PR 4, so repeats are about **40, not 31**, and writes about 189, not 177 (`tests.md:212`). Light and dark idle states do not move (the label is centred either way).
- Ruling: `signin.md` is right, `tests.md`'s counts and its "none expected" rows are wrong at `-xl`. Plan PR 3's `-xl` references as busy-button collateral, judged only for that.

**C2. Cost (tests.md against the runs). Numbers.**
- `tests.md:20` and `:60-62` take "about 15 macOS minutes" a run from `docs/TECH-DESIGN.md:63` and say about 30 runs cost 350 to 450 minutes, 150 over the month.
- `gh api repos/beurni2/Tadayo/actions/runs/<id>/jobs` (the `build` job is the only macOS job; `gate` and `evidence` are Linux): 7.8 to 9.1 minutes on eight full runs (42345823761 to 42371579228), 8.6 to 11.5 on six compatibility dispatches (42347371192 to 42371589738). `main` at `a569278`: 42929113802, `build` 8 min 46 s.
- So the slice's runs are about 285 macOS minutes, not 350 to 450. But `ios.yml` has run **110 times since 1 November** (`workflows/ios.yml/runs?created>=2026-11-01`; 100 fetched, 615 wall minutes of gate + build + evidence), about 900 to 1,000 macOS minutes by the same measure, against the "roughly 300" the doc says the plan includes. The month is already past it; the slice's marginal cost is its own, and the lever is runs per PR, not the split (section 5). Not mine to decide; for the coordinator.

**C3. When the records are edited (records.md against tests.md). Timing, not content.**
- `records.md:458` (section 8, step 1) and sections 2.3 to 2.7 do INVENTORY, QUESTIONS and the needs list in one pass and add the five `built from spec` rows (X-33) at once (counts 251 / 131 / 25, `records.md:244-246`). `tests.md:364` and `:375-408` give PR 1 only the status, source and count edits plus FQ93, and spread the Known-differences rewrites, the five rows and the FQ89, FQ69, FQ86, FQ70, FQ58 and FQ90 bullets, and the needs list, over PRs 2 to 6 (after PR 1: 246 / 131 / 20).
- Ruling: `tests.md` is right for the build-dependent edits (a `built from spec` row for `global-leaving` says the app builds it; INVENTORY's own rule is "same commit as the change", `records.md:50`). It is wrong for the rest. The bullets for FQ58, FQ69, FQ70, FQ86, FQ90, the tabs preface and line 431 record what Claude Design drew or agreed to, and the code already matches what they say about the app (FQ90's emptyTitle 25 is built today; FQ86's key does not change). Only FQ89's second sentence ("what the app now builds") is build-dependent. Likewise the needs list (`records.md` section 4) records what handoff 7 answers. Leaving all of that to PR 6 keeps the design thread from seeing it for five PRs. Move them to PR 1.

**C4. PR size (tests.md inside itself).** `tests.md:19` says PRs 3 and 4 are over the 400-line target; its own PR 5 is about 460 (`tests.md:399`). `docs/GITHUB.md:154`: "ideally under 400 changed lines of hand-written code and under 40 files". PR 5 needs a stated split or a reason.

**C5. The wait with no sign-in (root.md, records.md, tests.md). Same default, three owners.** `root.md:125` and `:446` take the check's literal "as soon as the route is starting" and say "coordinator, then the founder via the next brief"; `records.md:153` writes it into the `global-launch` row; `tests.md:376` says PR 2 "notes A1 for the founder". Nobody turns it into a question, and `root.md:125` itself says the delivery's words ("during a network wait") fit a gated wait. The check's section 7 (`check:174`) asks the design thread only whether the spinner waits a moment. See C-note below and FQ96.
- It is worse than "a frame or a few". `RootModel.route` starts as `.starting` (`RootModel.swift:51`); `RootView` runs `start()` in a `.task` (`TadayoApp.swift:21-22`), after the first render; `start()` only then reads the session (`RootModel.swift:95-100`; `SessionManager` is an actor, `SessionManager.swift:54`, `isSignedIn` a synchronous keychain read, line 80). So **every signed-out cold launch and every first launch draws the wait view first**, and `announcing(..., initial: true)` (`root.md:109`) queues "Loading your account…" for someone with no account. T49 is about drops, offline and widgets, but its audit row (journal line 464) lists the root's start states under "Truthful states only", and the plain voice (T43) says what is happening.

**C6. PR 6's "Done" against root.md A4.** `tests.md:409` says the Lab header specimens at 320 and the largest size "match the sheet". `root.md:233` and `:449` say the header at accessibility 5 will be about 11 points shorter than the contract's 124 and the target narrower than 249. The Done line must read "except A4, recorded", and A4's default goes to the founder in the PR.

**C7. Small ones.**
- `tests.md:366` says PR 1's run carries "a sheet for each of the 29 states"; `tests.md:16` says 28 of the 29 frames pair with a snapshot (frame 24 pairs with none until PR 4), so 28.
- `tests.md:240` (row 9, A02-age-failed-network) says "frame 20's hole is not built". Frame 20 is `A03-profile-empty-xl` (the 166-point hole, its own row 20). The source is `signin.md:269` and `:290`, "(frame 20)", which means "the frame draws 20 points above the button" (`signin.md:162`).
- `profile.md:296` says do the text action and the Avatar first, `tests.md` puts them in PRs 4 and 5. `tests.md` stands (its reason, 21 repeats accepted, is stated at `tests.md:423`).
- `profile.md:533` says "the shared `RootModel` is unchanged"; `root.md:104` and `signin.md:190` both edit `RootModel.swift` 117-143 and 176-188. True of A03's Leave only; `tests.md` orders PR 2 before PR 3, which is what matters.
- `tests.md:29` puts the inventory test at `ios_steps_test.py:843-848`; the `>= 149` assertion is line 849.

**C8. Shared pieces assigned twice or to no one.**
- The 44-point footer: `root.md:153` (PR 2), `signin.md:170` and `:300` (PR 3), `profile.md:319` (PR 5) each define "the constant, once, shared"; none says which PR names it. Name it `formFooterToSafeAreaBottom` in PR 2, where it first has a user.
- Keyboard-awareness: `signin.md:278` (F1, Verify pin) and `profile.md:322` and `:524` (P3, "silent: how to know a keyboard is up") are the same mechanism; `tests.md` builds the pin in PR 4 and the footer's 12 or 44 in PR 5 (TL-09 twice). Build it once, in PR 4, as one small piece the footer and the pin both read.
- `LeaveSignInButton`: `profile.md:305` leaves it to "the planner"; `tests.md:380` makes it PR 3's. Keep that.

**C9. TL-09's value.** `tests.md:294` proposes pure functions for the Verify pin, the busy group's fit and the footer value in `TadayoCore`. The pin's real risks (flapping against the scroll view, `safeAreaInset` read last by VoiceOver, hardware keyboards, `signin.md:278`) are geometry the function never sees; its unit test proves a comparison. Count it as a guard, not as proof; the device check is the proof (it is already `tests.md` section 10, item 3).

## 2. Screens, states and findings the reports do not cover

### 2.1 The check's section 8, bullet by bullet

| Bullet (check:184-271) | Mapped in | Detail gap |
|---|---|---|
| Busy buttons | signin C1, C2; profile S3; tests PR 3; records 2.9 (391) | C1 above; no 320-point snapshot for the stacked fallback (3.4 below); the reserved row's height and place are unsourced (signin F9) and no frame draws any busy button at the largest size (X-14), so they go in a handoff ask |
| A02-email | signin C3; tests PR 3 | none (notice ink and lifetime are signin F5, built from spec) |
| A02-code, six sub-bullets | signin C4; tests PR 4 | **V-16** (below); **D-22** (below); the pin is device-only |
| Text actions | signin C5; profile S5; tests PR 4 | none |
| A02-age | signin C6; tests PR 3 | none |
| A03, seven sub-bullets | profile P1 to P12; tests PR 5 | reveal-on-failure scroll and keyboard detection have no technique (profile 6.9, 6.11): device checks, listed in tests section 10 |
| Avatar | profile A1 to A5; tests TL-08 | the rule's edge cases are now answerable (appendix B) |
| Root, three sub-bullets | root A, B, C; tests PR 2 | **C5 / FQ96** |
| Header before a club | root D; tests PR 6 | W-13: "handoff 6's denied header takes the same rectangles when B2 builds it" is in `check:223` and `root.md:201` but recorded nowhere (journal Next, needs list, B2's plan); F-14 (a club's header would move 33 points) is in records item 52 only as a question. Add one line to the needs list's new section and to B2's notes |
| Tabs | root E; tests PR 6 | none |
| Kept as built (10 bullets) | root 9; signin B1, B2, C4.9, C6.6, C7; profile P12 | none: all ten present |
| Keys | root 10; signin D; profile 4.4; records D7 | none |
| Inventory (6 sub-bullets) | records 2 | C3 (timing); the five X-33 rows wait for their PRs |
| Questions (9 sub-bullets) | records 3 | FQ44 and FQ91 are already done by #28 (`QUESTIONS.md` 227, 426; journal 395) |
| Needs list | records 4 | move to PR 1 (C3) |
| "Changes on `ios/b0-drop-card`" (9 sub-bullets) | none | shipped by #28 at `a569278` (journal 395 and 2529); spot-checked: the Lab's contributor label "Maya" (`LabView.swift:323`) and the draft row's chevron (`DropRows.swift:43-44, 71`) |

### 2.2 Findings no report cites by id (36 of 158; list in appendix A)

23 are the drop card or later stages (shipped by #28 or B4 to B6); 5 are pack notes with no action (W-16, R-14, X-12, V-20, V-21); 6 are about these screens and covered by topic under other ids (F-03, W-01, V-01: Back drawn active while busy, kept hidden; V-04: the code label's gap; V-12: the resend row; V-22: the qa probes). **Two are covered nowhere:**
- **V-16** (note, refuted as a finding, but it states behaviour): at the largest text a long code error continues in the scroll content; "keep the focused field in view, let the error continue ... and announce the full words"; scrolling the whole error into view would push the focused field out, "a design choice the app shouldn't make itself" (second reviewer, findings 1029). No report plans it and `tests.md` section 10 does not list it. Add a device step: A02-code with a long error, keyboard up, largest text: the field stays in view, the rest of the error is reached by scrolling, Verify code covers no text.
- **D-22** (note): the sheet draws the field-to-error gap at 8 where `fieldErrorGap` is 12; the app builds 12. `records.md:191` lists the frames' gaps (2, 5, 13) but not the sheet's 8. Add it to that bullet.

### 2.3 Not planned by anyone

1. **The plan document.** `CLAUDE.md` ("Plan") and ADR-032 (a plan "goes into the repository, in the PR of the lane that builds on it, before that lane builds on it"; the `ios/b0-lab-rows` precedent, journal 401). `tests.md:365` lists six files for PR 1 and none is `docs/plans/ios-b0-adopt-handoff-7.md`. The five reports are its raw material. Also add the slice as a row in `docs/plans/B0.md` (#28 did, journal 2529).
2. **320 and 430 points for the five new rows.** `docs/TECH-DESIGN.md:66`: "The representative states marked `-dark` and `-xl` in the inventory are also snapshotted at 320 and 430 points (book p27)"; INVENTORY line 13 defines that set as the rows named `-dark` and `-xl`. `A02-code-error-dark`, `A02-code-error-xl`, `A03-profile-empty-xl`, `G06-no-club-dark` and `G06-no-club-xl` join it as `received` rows. `tests.md:196` says the slice "adds one, the header at 320" and gives no reason; `ScreenSnapshot.assert` takes no width (the Lab's `snap` does). X-12 (finding, line 1255) names "the snapshot route at 393, 320 and 430" as the app's own proof. Decide in the plan and write it in the PR (default in section 4).
3. **Design handoff blocks.** The PR template has a "Design handoff" section (`tests.md:348`); `CLAUDE.md` asks for each handoff as one paste-ready block. The new no-frame states (the two waits, the signed-out notice, the code error with a resend failure) are only in records item 50 and `tests.md:265` ("handoff 8, or the PR's block"). Confirm who writes handoff 8 (the design thread wrote 7's brief) and give each PR a two-line block naming its states and the needs-list numbers.
4. **FQ69's owed proposal.** `QUESTIONS.md` FQ69 (line 322-325): "how long it's kept is proposed, with a default, when sign-in is built (slice 8)"; `records.md:269` says it is "still owed". This slice makes Leave sign-in a visible button on A02-age and A03. The proposal belongs to the api lane (retention is server-side); say so in PR 3 and do not invent a period.
5. **First-launch VoiceOver step** (if FQ96's default is taken): add to `tests.md` section 10, item 2: signed out, VoiceOver on, cold launch: nothing is spoken before the email screen's title.

## 3. Facts asserted without a citation, or that could not be confirmed

### 3.1 Checked, and what I found

| Claim (report:line) | Result | How |
|---|---|---|
| 113 tests = 65 + 43 + 5; 187 references (75, 15, 39, 58), 43.8 MB (`tests.md:9, 15, 190`) | confirmed | `grep -c func test`, `ls`, `du` (43M); evidence branch `main/a569278/ios/logs/test-summary.json`: 113 passed, iPhone 17, iOS 26.5, 185 s of tests |
| INVENTORY 240 states, 109 with a render (50 + 59), 36 built from spec, 95 missing; after: 250, 130 (50 + 80), 25, 95; 67 files in `screens/` now (`records.md:27-39`) | confirmed | `count_inv.py` and `simulate.py` (records' scripts) on the current file: 240 / 109 / 36 / 95 and 250 / 130 / 25 / 95; `ls`: 67; none of the 22 new names exist; 425 lines |
| Root failure title must move about +53 (`root.md:152`) | confirmed | ink top 89.5 (`global-launch-failed-network`) against 142.5 (`A02-age`, `A02-email`), 143.5 (`A02-code`, `A03-profile`) |
| "A frame or a few" for a signed-out launch (`root.md:125`) | understated | C5, with the lines cited there |
| `SupabaseAuth.swift:122-127` throws `.refused` for any non-2xx and never reads the body (`signin.md:98, 284`) | confirmed | line 126, `let (status, _, _) = ...`; `verify` at least tells 429 and 5xx from a wrong code |
| "No read-only `TextField` on iOS 17.0; `.disabled` resigns the first responder" (`signin.md:92`) | half | deployment target 17.0 confirmed (`project.yml:19`); the behaviour is unverifiable here (no simulator) |
| `Character.isLetter` follows Alphabetic, so it takes roman numerals and some marks (`profile.md:518`, author's "recollection") | confirmed, and worse | run on Swift 6.3.3: appendix B |
| `uppercased()` can turn one letter into several (`profile.md:523`) | confirmed | "ß" gives "SS", "ﬁ" gives "FI" |
| A leading U+200B (`profile.md:519`) | partly moot | `trimmingCharacters(in: .whitespacesAndNewlines)`, which `Avatar.initial(of:)` already calls (`Avatar.swift:68-72`), removed a leading U+200B (swift-corelibs-foundation; Apple's Foundation not run here). U+200D, U+2060 and U+FEFF stay: they are Cf, not a letter, so fallback |
| FQ69 bullet: "on A03 the age stays recorded on the server" (`records.md:269`, no citation) | plausible, consistent with the code | `ProfileModel.confirmAge()` saves `.confirmAge` (`ProfileModel.swift:54`); `Account.ageConfirmed` (`Account.swift:9`) |
| `select()` carries a sheet for a state whose render changed; compatibility runs skip `*SnapshotTests` (`tests.md:39, 44`) | confirmed | `ios_steps.py:458-474`, `:143, :873-889` |
| Nothing in CI reads `brand/brand-components.png` (`records.md:426`) | confirmed | grep: only two doc comments (`FoldedCorner.swift:4`, `FoldedCard.swift:5`); `RENDER_DIRS` is `screens`, `2.1` (`ios_steps.py:146`) |
| A row with no snapshot is allowed (`records.md` D5, rows `A02-email-invalid`, `A03-profile-name-refused`) | confirmed | no CI check requires one (`read_inventory`, `ios_steps.py:331-343`; 95 `missing` rows already have none) |
| Every consumer of the text action, busy-capable primary button and Avatar (`tests.md:350`, `profile.md:400`) | confirmed | grep: text action 7 uses, primary 10 (busy-capable 5), Avatar 8; the lists match |
| FQ93 absent; FQ94, FQ95 present; FQ92 reserved (`signin.md:187`, `records.md:42, 450`) | confirmed | `QUESTIONS.md` 431, 433, 436; journal 404 |
| Cost: 15 macOS minutes a run (`tests.md:20`) | corrected | C2 |

### 3.2 Not confirmable in a cloud session (the reports say so, or should)

- SwiftUI and UIKit behaviour: a read-only emulation that keeps first responder and keyboard (signin F10); what a field with a label and a prompt exposes (W-08); the busy indicator drawn at exactly 16 (`signin.md:73`); the person glyph's centring (profile 6.16); `.onAppear` focus under VoiceOver.
- iOS 26's toolbar item colour and glass for Leave sign-in (`signin.md:167`); the opaque band and any scroll-edge effect, and the exact name `scrollEdgeEffectHidden` (`root.md:221`, "not verified"); the "Private" word's width at the largest size on 320 points, "about 154 in a column that leaves about 9" (`root.md:263`; not measured by me either).
- Announcements, focus movement and the launch hand-over (all device checks).
- The cost of a whole run beyond the `build` job's own minutes (GitHub bills each job up to the next minute; I used the job durations).

### 3.3 Unsourced defaults the reports take (flag each in INVENTORY and the PR, as they say)

The signed-out notice's ink, gaps, lifetime and announcement (W-10; signin F5); a resend failure's lifetime (signin F4); the stacked busy row's height and place (F9); the busy announcement's priority (F11); the Leave button's inactive look; A03's too-long line border and announcement (profile 6.12); the wait's role, ink and place (root A2). None is a founder question (the code never designs: they go to handoff 8 through the needs list); each stays a `built from spec` note.

## 4. Questions that need an FQ, and defaults for the rest

| # | Question | Where it lands | Safe default (reversible) |
|---|---|---|---|
| 1 | **FQ96. Whether the start-up wait shows and speaks when there is nothing to load.** | New FQ, in PR 1, so it is answered before PR 2 builds the wait | Show and speak the wait only once a sign-in is found to read the account for; with none, the canvas goes straight to the email screen, as today. Needed by B0 (PR 2). The check's reading (always, at once) is the alternative; both are one line in `RootModel.start()` |
| 2 | FQ93, Leave sign-in and the typed address | Ready in `records.md:283-287`; PR 1 | An empty field after Leave sign-in, as built |
| 3 | FQ69's owed retention proposal | api lane; note in PR 3 | This build deletes nothing; someone who leaves and signs in again with the same address resumes at the first incomplete step (`RootModel.show()` does so today) |
| 4 | Whether the start-up spinner waits a moment | design (check:174), handoff 8 | No delay (the check builds none) |
| 5 | Back on A02-code while busy: hidden or dimmed | design (check:164), handoff 8 | Hidden, as built |
| 6 | The Avatar initial's edge cases | plan default, INVENTORY note, handoff 8 | By the contract's own words: first scalar's General_Category in Lu, Ll, Lt, Lm, Lo, or Nd with a single-scalar cluster; everything else, and every emoji cluster, falls back (appendix B) |
| 7 | 320 and 430 for the five new rows | plan decision, PR 1's plan, written in the PR | 320-point variants of the three `-xl` rows (add a width to `ScreenSnapshot.assert`, 3 references) and of `Lab-actions` at the largest size; 430 judged on the Lab. Record why in the PR, as `tests.md:196` did not |
| 8 | A03's arrival focus under Switch Control or other assistive technology (`profile.md:508`) | handoff 8 | VoiceOver only, as C-01 and the contract say |

No other new FQ: the remaining silences are layout or wording and go to the needs list.

## 5. The split, and the first PR

**The kind of split is right:** records first, then vertical slices, sequential. A components-first PR would redraw about 70 references for 15 lines (`tests.md:350`); with C1 it would redraw more. Parallel PRs would meet in the journal and the string catalogs.

**Changes I recommend**

1. **PR 1 carries more than `tests.md:364` gives it:** the plan file; the 29 frames and the sheet; the INVENTORY status, source and count edits and the `A02-code-typed` row (a `received` row, since its render exists); **not** the five X-33 rows (they land with their states); FQ93 and FQ96; every QUESTIONS bullet that records the delivery (C3); the needs-list edits (`records.md` section 4). Its run has no code change, so skip the iOS 18.6 and 17.5 dispatches and the re-run: about 20 macOS minutes saved.
2. **PR 2:** also names `formFooterToSafeAreaBottom` (C8) and builds the wait with FQ96's default (the route case is `reading`, set after the session is found, or an equivalent; `testGlobalLaunch` drives the root into it).
3. **PR 3 is split by default** (`tests.md:385` calls it a fallback): **3a** the busy button, the field guard, the Lab specimen, A02-email and the notice (about 390 lines, plus C1's 12 references); **3b** A02-age, `LeaveSignInButton` and the RootModel cause (about 180). It is 600 lines otherwise.
4. **PR 4:** the text action, A02-code, the resend failure, the pin, and the one keyboard-awareness piece that PR 5 reuses. Count its `-xl` rewrites (C1).
5. **PR 5:** A03 and the Avatar; if the Avatar's table test pushes it past about 450 lines, put the Avatar and `Lab-avatars` first as a small PR (profile.md already calls it independent).
6. **PR 6:** header and tabs, with C6 and the B2 note (2.1) added.
7. **Cost:** compatibility dispatches once per code PR, at the final head; the second "stable" run only where references were taken; batch the read of the evidence and the commit of the references into one push (C2).

**Sequence after these changes:** 1 records and plan; 2 root; 3a email; 3b age; 4 code; 5 profile (5a Avatar if needed); 6 header and tabs. Seven or eight PRs, each under about 450 lines, each approved by the founder in its thread.

**What PR 1's evidence is:** its own `ios` run carries 28 baseline sheets (frame 24 has no snapshot until PR 4): each new frame beside today's snapshot, before any code. Read them and put the per-state difference list in the PR; PRs 2 to 6 then show their references against renders already in place. One line in the body for the founder: the pack twice mentions a "guest-contribution/SMS proposal" the brief never made (W-16, R-14, check:39); no decision is asked.

**What must be decided before PR 2 starts:** FQ96's default (or the founder's answer); the constant's name; the 320 and 430 rule (so PR 3a's Lab specimen includes it); where the new hosted VoiceOver tests live (`tests.md:419`, default: shared fakes in PR 3a).

## Appendix A. Findings no report cites by id (36 of 158)

- **Drop card or later stages (23), shipped by #28 or for B4 to B6:** D-03, D-04, D-05, D-09, D-11, D-12, D-17, D-18, D-21, DM-01, R-13, RM-03, V-07, V-08, V-09, V-19, X-26, X-27, X-28, X-29, X-30, X-31, BM-05.
- **Pack notes with no action (5):** W-16, R-14 (guest/SMS mention), X-12 (validation report; see 2.3 item 2), V-20, V-21.
- **These screens, covered by topic under other ids (6):** F-03, W-01, V-01 (Back drawn active while busy; X-03 and R-11 in `records.md`, signin F3); V-04 (the code label's gap; X-06, F-19); V-12 (resend row; X-17, W-07, F-12); V-22 (qa probes: Verify unavailable, indicator at every size).
- **Covered nowhere (2):** V-16, D-22 (2.2).
- Cited by exactly one report (29): all by topic present in the others (`records.md` for F-19 to F-21, X-03, X-05, R-11; `root.md` for F-16, W-03, W-04, V-06, V-15, V-24); the rest are drop-card findings.

## Appendix B. What Swift says about the Avatar rule (Swift 6.3.3, Linux; the CI pin)

Contract: an initial only from the first visible grapheme if it is a Unicode letter or a decimal digit; emoji, symbols, punctuation, a bare mark give the person symbol (`profile.md:390-391`).

| Sample (one Character) | `isLetter` | `isNumber` | `isWholeNumber` | first scalar's category | Emoji property |
|---|---|---|---|---|---|
| B, 日, Ø, ß, é (or e + U+0301) | true | false | false | Lu, Lo, Lu, Ll, Ll | no |
| lone U+0301 | false | false | false | Mn | no |
| 3 | false | true | true | Nd | **yes** |
| U+0663 (Arabic-Indic 3) | false | true | true | Nd | no |
| ² (U+00B2) | false | true | **true** | No | no |
| Ⅷ (U+2167) | **true** | true | true | Nl | no |
| ⓐ (U+24D0) | **true** | false | false | So | no |
| ʰ (U+02B0) | true | false | false | Lm | no |
| 😀, flag, joined family | false | false | false | So | yes |
| 1 + U+FE0F + U+20E3 (keycap) | false | **true** | false | Nd + Mn + Me | yes |
| #, -, (, @ | false | false | false | Po, Pd, Ps, Po | `#` yes |
| U+200B | false | false | false | Cf | no |

- `isLetter` accepts Ⅷ (Nl) and ⓐ (a symbol with Other_Alphabetic); `isWholeNumber` accepts ² and Ⅷ; `isNumber` accepts the keycap. So the rule has to test the first scalar's `generalCategory` (Lu, Ll, Lt, Lm, Lo; Nd) and reject any cluster with U+FE0F or an enclosing mark. `isEmoji` alone is wrong ("3" and "#" have the property).
- Under that rule the values `tests.md` TL-08 marks as unfixed come out: ² and Ⅷ and ⓐ give the person symbol; a lone U+0301 gives it; "3D" gives 3; keycap, flag and joined family give it. "ß" gives "SS" (two letters in a 28-point circle; keep as built and test once, `profile.md:523`).
- The Swift check of the rule, the button measures and the finding audit were throwaway scripts and are not kept.
