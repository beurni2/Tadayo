# Records part of the handoff 7 adoption slice

> Appendix to `docs/plans/ios-b0-adopt-handoff-7.md`, written on 11 November 2026 for the ios thread's plan from `main` at `a569278` (the code its line numbers cite). **Where it and the plan disagree, the plan wins**: its section 3 lists the corrections. Its scratch scripts were throwaway and are not kept.

Part "records": `design/reference/INVENTORY.md`, `docs/QUESTIONS.md`, the needs list, the journal's audit rows, and the named files in `design/reference/screens/` and `design/reference/brand/`.

Checkout read: the repository, branch `ios/b0-source-files`, HEAD `6d9a05a`, code = main `a569278`. Nothing there was edited, committed or pushed. Line numbers below are HEAD's; they move as you edit, so edit by text, not by number.

Contents: 0 sources and limits; 1 at a glance; 2 (a) INVENTORY; 3 (b) QUESTIONS; 4 (c) needs list; 5 (d) audit rows; 6 (e) files in `screens/` and `brand/`; 7 where the sources are silent or disagree, and what to decide; 8 order of work and checks.

Citation keys: "check" = `docs/design/handoff-7/check/handoff-7-check.md` (section number); "finding X-33" = `docs/design/handoff-7/check/handoff-7-findings.md` (finding id; the critic's rulings, lines 1542 to 1552, win over earlier findings); "brief" = `docs/design/handoff-7/handoff-7-brief.md`; "frame N" = `design/reference/claude-design/handoff-7/frame-manifest.json` order N; "CC" = that folder's `copy-contracts.json`, key `handoff7.<key>`; "needs" = `docs/design/handoff-7/ios-lane-needs.md`; INV = `design/reference/INVENTORY.md`; Q = `docs/QUESTIONS.md`; J = `docs/JOURNAL.md`.

---

## 0. Sources and limits

Read in full: the check, the findings, the brief, the needs list, INV (425 lines), the parts of Q named below, `docs/DESIGN-HANDOFF.md`, ADR-020, 027, 029, 030, 032, the three READMEs under `design/reference/`, `frame-manifest.json`, the audit rows named in section 5, `tools/ci/ios_steps.py` (`read_inventory`, `render_for`, `no_render_note`), `copy-contracts.json` handoff7 (every key), the sibling reports `signin.md` and `profile.md`.

Not read, so not claimed: handoff 7's `IMPLEMENTATION.md`, `screen-copy.json` and `component-contracts.json` (only what the findings quote from them), `docs/INVARIANTS.md` (the rules are quoted as the findings and audit rows quote them), the audit rows T1, T10, T12, T24, T38, T52, T53 and journal section 0.9. The root and tabs part's report did not exist when this was written (only `signin.md` and `profile.md` existed), so each INVENTORY note that depends on what that part builds is marked "re-measure after the build".

Checked by running throwaway scripts: the INVENTORY counts before and after (a counter over its rows and a simulation of the edits); sha256 of every replaced `screens/` file against the handoff folders; sha256 of `brand-tokens.json` and the dark icon across handoffs; `sha256sum -c checksums.sha256` in handoff 7 (92 of 92 OK); the sheet PNG's size and mode; ImageMagick and Pillow on the sheet.

Not verified: that the build matches any note below (nothing was built), that the ios workflow accepts the new files (it only needs `screens/<state>.png` to exist: `render_for`), anything on a device.

---

## 1. At a glance

| Thing | Now (HEAD) | After the slice |
|---|---|---|
| INV trial states | 240 | 250 (251 if `A02-code-typed` is added, decision D1) |
| with a render | 109 (50 with a 2.1 render, 59 only in `screens/`) | 130 (50 and 80); 131 (50 and 81) with the typed row |
| built from spec | 36 | 25 (13 sign-in and profile, 12 tabs and root) |
| requested | 0 | 0 |
| missing | 95 | 95 |
| brand assets | 4, all received (handoffs 0, 1 and 6) | 4, all received (handoffs 0, 1 and 7) |
| files in `screens/` | 67 | 88 (89 with the typed row): 21 added, 7 replaced, `A02-code.png` kept |
| `brand/brand-components.png` | handoff 6's, 2400x19360 RGBA, 4,986,722 bytes | handoff 7's, 2400x51552 RGB, 10,320,871 bytes |
| Q | FQ93 reserved, not in the file; FQ94, FQ95 present | FQ93 added; FQ58, 69, 70, 86, 89, 90 gain bullets; tabs preface and line 431 reworded |
| needs list | items 39 to 46 annotated; 1 to 38 not | every item annotated; a new section for the check's section 7 |

Decisions to flag (section 7): D1 typed-code row; D2 sheet replacement and the PNG's size; D3 FQ69's address wording; D4 needs item 46; D5 the two refusal rows are not built separately; D6 the name of the code-error-plus-resend-failure state; D7 T41's one exception must not move.

Already done on main by #28 (do not redo): FQ44's handoff 7 bullet (Q line 227); FQ91's handoff 7 bullet with the grouping and (c) kept (Q line 426); the drop card's preface (Q line 419); FQ94 and FQ95 (Q lines 433 to 438, matching check section 5 B and C); the INV drop-card group, including the compact receipt's scaling disc (INV line 415), the label inset (line 413), the revealed item's B6 controls and FQ94 (line 412); J's design line already names the numbers FQ93 to FQ95.

---

## 2. (a) INVENTORY edits

### 2.1 The rule behind each edit

- Statuses: `received` for a state with a handoff frame, `built from spec` with no frame (INV line 3; `docs/DESIGN-HANDOFF.md`, "The inventory"). ADR-020: add rows, never delete one.
- A replaced `screens/` file: the row names the handoff it now comes from and the one before, in the form INV already uses ("Handoff 6 (3; 2.1 #07 before)", `F01-friends`). The earlier file stays in its handoff folder (ADR-027, second "Later" line; `docs/DESIGN-HANDOFF.md`, "Naming rule").
- A state that has no frame but has handoff 7's words: Source stays empty, Notes begins "Words only (handoff 7: `key`)", the form INV uses ("Words only (handoff 3)", `F01-not-started`).
- Every Render cell for the 16 rows already reads `screens/<state>.png`; leave it. `read_inventory` takes each row's second cell, one backticked name (`tools/ci/ios_steps.py`); a new row's second cell must be exactly `` `name` ``. `ios_steps_test.py` needs at least 149 states: the file has more.
- The snapshot test names must equal the row names (`docs/DESIGN-HANDOFF.md`; `SignInSnapshotTests.swift` already names its states so). Every new row below needs a snapshot of that name from the part that builds it, or a note that it is drawn as another state.

### 2.2 Brand lines

| INV line | Change |
|---|---|
| 13 (`brand/` bullet) | "...and the component sheet from handoff 6 since handoffs 5 and 6 entered the repository" becomes "...and the component sheet from handoff 7 since handoff 7 was adopted for the screens on `main`". |
| 15 (`## Brand (revision 1.1: handoffs 0, 1 and 6; ADR-027)`) | "handoffs 0, 1 and 7". |
| 20 (tokens row) | Handoff cell "1 (byte-identical in 1 to 6; 0 before)" becomes "1 (byte-identical in 1 to 7; 0 before)". Verified: `brand-tokens.json` is sha256 `e6d05848fe117702...` in handoffs 1 to 7. |
| 22 (component sheet row) | Shows: "...and the contracts handoffs 2 to 6 added, with light and dark samples of handoff 5's and 6's parts" becomes "...and the contracts handoffs 2 to 7 added, with light and dark samples of handoff 5's, 6's and 7's parts". Handoff cell becomes "7 (holds handoff 6's sheet whole, which holds every earlier one, with handoff 7's specimens appended; 6, 4 and 0 before)". Basis: manifest frame 17 note "Whole H6 sheet preserved, H7 current specimens appended"; finding D-01 (all 9,645 handoff 6 elements recur in order, identical); `brandRevision` 1.1 in the manifest. |
| 295 (Handoff 0's renders bullet) | In the parenthesis, "`brand/brand-components.png` is handoff 6's since handoffs 5 and 6 entered the repository, and was handoff 4's from revision 1.1 until then" becomes "`brand/brand-components.png` is handoff 7's since handoff 7 was adopted for the screens on `main`, handoff 6's from handoffs 5 and 6 until then, and handoff 4's from revision 1.1 until then", and after "handoff 6's keeps handoff 5's unchanged and adds ... (F-01 of handoff 6)" add "; handoff 7's keeps handoff 6's whole and adds the busy button, the fields and failure lines, the no-club header at the largest text, the avatar with no readable initial, the drop card's states, the highlight covers and the receipt, in light and dark". |
| 423 (Counts, last bullet group) | "Brand assets: 4, all received (revision 1.1: handoffs 0, 1 and 7)." |
| New Known differences bullet (put it with the handoffs 5 and 6 group beside INV line 381) | See 2.9, "the sheet". |

### 2.3 The 16 requested rows: Source `` to `Handoff 7`, Status `built from spec` to `received`

Shared: Stage B0 unchanged. Render cell unchanged. Replace the whole Notes cell with the text given (it drops "handoff 7 asks for its frame" and the stale readings). Differences marked "re-measure" depend on what the build does; the ids are the check's.

| INV line | State | Frame | Shows cell | New Notes cell |
|---|---|---|---|---|
| 34 | `A02-email-empty` | 1 | keep | Frame 1 of handoff 7: the field focused on arrival with the placeholder "Email address" (`auth.email.placeholder`) and the email keyboard up (the snapshot draws none, T45), Send a code unavailable (`actionDisabled`), no back button in B0, and "Use the same email whenever you sign in." kept. A sign-in the server ended is `A02-email-signed-out`. (Finding X-16, BM-02's pattern; frames review item 1.) |
| 35 | `A02-email-sending` | 2 | keep | Frame 2: the address stays in the field, read-only, keeping focus and the keyboard; Send a code keeps its fill and its centred label with a 16-point native indicator 8 points before it, in two 24-point slots, the label not moving (`busyPrimary`); the value "In progress" and "Sending a code." said once (`vo.email.busy`). The indicator was at the button's trailing edge and the field editable (X-15, D-13). |
| 36 | `A02-email-failed-network` | 3 | keep | Frame 3 (`auth.email.network`): the line with its icon under the field, in a block that pushes Send a code and the helper down; the field keeps its border and focus ring, since the address isn't at fault; Send a code available again. The frame draws the field-to-line gap about 2 points; the app builds the contract's 12 (X-05, F-08). |
| 38 | `A02-code-verifying` | 4 | keep | Frame 4: 529614 in the focused, read-only field, Verify code busy, the wait sentence kept, Change email address unavailable, busy until the account record arrives. The frame draws the back button active; the written rule makes it unavailable while a code is checked, and the app hides it (X-03, R-11; whether unavailable means hidden or dimmed is for the next brief). |
| 39 | `A02-code-verify-failed-network` | 5 | keep | Frame 5 (`auth.code.network`): the line fills the two reserved lines with its icon, the border normal, the digits kept, Verify code and Change email address available, the wait sentence kept. Field-to-line gap: the frame about 5, the app 12 (X-05). |
| 42 | `A02-code-resend` | 6 | keep | Frame 6: the field empty, Verify code unavailable, "Send a new code" in the wait sentence's row at the leading edge, the error region empty; "Send a new code is available." said once (`vo.resend.available`). The frame keeps Verify code in the flow where the contract pins it above the keyboard (X-04); the app pins it only where it would otherwise sit under the keyboard (V-02, the critic's ruling). |
| 43 | `A02-code-resending` | 7 | keep | Frame 7 (`auth.code.resending`): "Sending a new code…" in `textAction` `secondaryText` with a small native indicator before it, in the row's place; Verify code, the field and Change email address unavailable even with six digits typed (`vo.resend.busy`). The frame draws the back button active (X-03). |
| 44 | `A02-code-resend-failed-network` | 8 | keep | Frame 8 (`auth.code.resendNetwork`): Send a new code returns and the line sits in its own block below it (`resendToFailure` 8; the frame about 5, X-05), Change email address under the block; the field empty, no border; the minute not restarted. A code error already showing keeps its own block: `A02-code-error-resend-failed-network`. |
| 47 | `A02-age-failed-network` | 9 | Replace with: No answer to I’m 18 or older: "Couldn’t save your age confirmation. Check your connection and try again." | Frame 9 (`auth.age.network`, in place of the profile's interim line): a leading "Leave sign-in" in the navigation bar replaces the chevron; the line sits above the pinned I’m 18 or older with at least 16 points clear (the frame about 23). The frame's gap from the title to the body, about 60, is kept at 24 (BM-04, F-22). |
| 50 | `A03-profile-empty` | 10 | Replace with: The profile on arrival: no name typed, the field focused with "Your name", the avatar showing the outlined person symbol, Continue unavailable | Frame 10: a leading Leave sign-in; the 68-point avatar shows an outlined person symbol at 56 percent of its size until a name gives a readable initial (`avatarWithoutInitial`: the first grapheme a letter or a decimal digit); the name field focused on arrival with the placeholder "Your name" (`auth.profile.placeholder`, `secondaryText`; BM-02) and the keyboard up (the snapshot draws none), except under VoiceOver, where focus is left to the system so the screen is announced first (C-01); Continue unavailable, 12 above the keyboard; Add photo and Optional on the left. The photo circle isn't announced "No profile photo" until a contract names its element (WM-04). |
| 52 | `A03-profile-failed-network` | 11 | keep | Frame 11 (`auth.profile.network`): the content scrolled 128 points so the field and the line stay above the keyboard; "Ben" kept in the focused field with a normal border, B in the avatar; the line with its icon under the field; Continue available above the keyboard. The line was above Continue; it is under the field (X-19). The snapshot draws no keyboard or scrolled viewport, so frames 10, 11, 20 and 27 are compared by content order, gaps and colours. |
| 263 | `global-launch-failed-network` | 12 | keep | Frame 12 (FQ89): no navigation bar, header, tabs or avatar; "Couldn’t load your account." (32 points, two lines) over "Check your connection and try again.", Retry pinned 44 points above the safe area's bottom (the app had 8, X-22) with the hint "Load your account again." (`vo.retryAccount.hint`). Also shows when the account can't be read right after a verified code; Retry reads it again. The frame draws the line in `primaryText`; the app keeps `secondaryText` (X-07). |
| 131 | `H01-loading-no-club` | 13 | keep | Frame 13: the no-club header (the wordmark an image named Tadayo, + Add with its hint, Ben's initial), the system's indicator over "Loading Home…", said politely once, no Private drafts row, Home selected. The initial shows once Ben's own account record has arrived, and no avatar before it (`noClubRootHeader.accountInitial`; FQ58 stays the founder's). The frame draws the shell about 25 to 32 points higher than handoff 3 does; the app keeps handoff 3's place (F-17). |
| 132 | `H01-error-no-club` | 14 | keep | Frame 14: "Couldn’t load Home." over "Check your connection and try again.", Retry pinned 24 points above the tab bar with the hint "Load Home again." (`vo.retryHome.hint`), no Create a club, I have an invite or Private drafts row. The frame draws the title in `utilityTitle` 32/35 and the line in `primaryText`; the app keeps FQ90's form, `emptyTitle` 25/30 and `secondaryText` (F-04, X-07, X-24 and the critic's rulings on X-24 and WM-03). Retry shows `H01-loading-no-club` while it runs. |
| 142 | `F01-loading-no-club` | 15 | keep | Frame 15: as `H01-loading-no-club` with "Loading Friends…", Friends selected, no page title; Friends says nothing when the list comes back (`announcementPolicy.loading`). |
| 143 | `F01-error-no-club` | 16 | keep | Frame 16: as `H01-error-no-club` with "Couldn’t load Friends." and Friends selected; Retry's hint "Load Friends again." (`vo.retryFriends.hint`). Title size and line ink as on `H01-error-no-club`. |

Header geometry (X-23, F-14, D-15) belongs on rows 131, 132, 142, 143 and the G06, F01, M01 rows: + Add [241, 56, 80, 44], Account [329, 56, 44, 44], the avatar [337, 64, 28, 28] at 393 points; the header stacks at every accessibility size with + Add leading; an opaque canvas band behind the status bar on iOS 17, 18 and 26. Say it once, in the Known differences tabs bullet (2.9), not in every row.

### 2.4 Five new `received` rows (and the optional sixth), Source `Handoff 7`

Insert each directly after its parent row, as `F01-friends-dark` follows `F01-friends`. Stage B0.

| After INV line | Row |
|---|---|
| 32 (`A02-code-error`) | `| A02 Authentication | `A02-code-error-dark` | The wrong or expired code, dark | `screens/A02-code-error-dark.png` | Handoff 7 | received | B0 | Frame 18: the redraw in dark: focus ring `#AFBEFF`, destructive border `#FFB4A5`, icon and line in destructive, Verify code available with the digits kept |` |
| (same, after the row above) | `| A02 Authentication | `A02-code-error-xl` | The wrong or expired code at the largest text | `screens/A02-code-error-xl.png` | Handoff 7 | received | B0 | Frame 19: scrolled with the focused field under the navigation bar, the error (44 points a line) continuing behind Verify code, pinned 12 above the keyboard; the title and address above the viewport, the resend row and Change email address below it in the scroll. The snapshot draws the whole screen on a tall phone, so the viewport differs; and the address breaks "Sent to ben@" over "example.com" where the frame breaks "Sent to", "ben@example", ".com" (C-02) |` |
| 50 (`A03-profile-empty`) | `| A03 Profile | `A03-profile-empty-xl` | The profile on arrival at the largest text | `screens/A03-profile-empty-xl.png` | Handoff 7 | received | B0 | Frame 20: the focused field with its label; the title, avatar and Add photo above the viewport; Continue unavailable, pinned 12 above the keyboard; Leave sign-in in the navigation bar. The frame's empty band of about 166 points between Optional and the label isn't built: the content stays continuous (check section 4, item 12; FM-01) |` |
| 106 (`G06-no-club`) | `| G06 Club switcher | `G06-no-club-dark` | Signed in with no club, dark | `screens/G06-no-club-dark.png` | Handoff 7 | received | B0 | Frame 21: the redraw's header, buttons 16 apart and gaps, in the dark tokens |` |
| (same) | `| G06 Club switcher | `G06-no-club-xl` | Signed in with no club at the largest text | `screens/G06-no-club-xl.png` | Handoff 7 | received | B0 | Frame 22: the two-row header (the 96-point wordmark, then + Add leading and the avatar trailing), the body scrolling under the tab bar. The frame leaves out "Create a club or open an invitation." (`noClub.body2`), which the app keeps at every size (X-02, R-04, F-01) |` |
| 31 (`A02-code`), optional, D1 | `| A02 Authentication | `A02-code-typed` | Six-digit code typed: Verify code available | `screens/A02-code-typed.png` | Handoff 7 | received | B0 | Handoff 7's redraw of `A02-code` (frame 24): 529614 in the field, Verify code available, the label under "Sent to", the rows on the left. Handoff 1's frame stays for the moment the screen opens (`A02-code`; V-17, F-20); the label's gap (X-06) and the body ink (X-07) are kept as built |` |

The `-dark` and `-xl` snapshot names already exist (`SignInSnapshotTests` takes every state in light, dark and `-xl`; `G06-no-club` is in `TabsSnapshotTests`), so these rows pair with existing snapshots at once. The other `-dark` and `-xl` snapshots stay "judged against book p26's rules" (`no_render_note`).

### 2.5 The eight redrawn rows: Source moves to handoff 7, earlier source in brackets

| INV line | State | Source now | Source after | Status | Notes cell (replace) |
|---|---|---|---|---|---|
| 30 | `A02-email` | Handoff 1 | `Handoff 7 (1 before)` | received | Frame 23: no back button, the address typed, Send a code available. Kept as built, against the frame: `secondaryText` for the subtitle where the frame draws `primaryText` (X-07, F-05), and `SetupGap.field` where the frame's subtitle-to-field gap is about 39 (X-06, F-19). |
| 31 | `A02-code` | Handoff 1 | `Handoff 1` (kept, D1) | received | Shows becomes "Six-digit code on arrival: the field empty, Verify code unavailable" (V-17's second reviewer: the row said only "Six-digit code"). Notes: "ADR-011. Handoff 7's redraw (frame 24) draws a typed code with Verify code available instead: that is `A02-code-typed`. Handoff 1's frame stays for the moment the screen opens (V-17, F-20)." |
| 32 | `A02-code-error` | Handoff 2 (1 before) | `Handoff 7 (2; 1 before)` | received | Frame 25: the typographic apostrophe, the error as one wrapped paragraph, the label under "Sent to", the rows on the left, Verify code available with the digits kept. Kept as built: the gap under "Sent to" (X-06, F-21) and the body ink (X-07). |
| 33 | `A02-age` | Handoff 1 | `Handoff 7 (1 before)` | received | `FQ13. Frame 26: a leading "Leave sign-in" in the navigation bar in place of the chevron, no link under the button, the title on one line, I’m 18 or older 44 points above the safe area. Kept as built: the gap from title to body at 24 where the frame draws about 60 (BM-04, F-22).` |
| 49 | `A03-profile` | Handoff 1 | `Handoff 7 (1 before)` | received | Frame 27: a leading Leave sign-in, the name field focused with the keyboard up and Continue 12 above it, Add photo and Optional on the left under the centred circle, a larger initial. Kept as built: handoff 1's gaps apart from the label's 8 (F-23), the initial at its role's size (V-18, F-07), and no arrival focus under VoiceOver (C-01). |
| 106 | `G06-no-club` | Handoff 4 (1 before) | `Handoff 7 (4; 1 before)` | received | Replace the whole note with the build's, re-measured against frame 28 after the tabs part has built it. Known now: the title 32 under the header, as the frame draws it (the old note's "the frame about 45" no longer holds); the two lines kept as one text where the frame draws two paragraphs (F-24, F-25; the critic did not rule on V-13 and W-05's split); Create a club 72 under them and Private drafts 56 under I have an invite (`TabGap.homeActions`, `homeDrafts`), where the redraw tightens both with no stated value (F-24); the buttons 16 apart, as the frame draws them (the old note's "the frame 17" no longer holds); + Add's and Account's targets are the frame's rectangles (X-23), so the old note's "its words sit 7 points left of this frame's" goes; the Private drafts row's folder 16 in, as the frame and the sheet draw it (BM-01); body ink `secondaryText` where the frame draws `primaryText` (X-07); Create a club, I have an invite, + Add, Private drafts and Account show and do nothing yet (FQ85, ADR-029). |
| 141 | `F01-no-club` | Handoff 2 (1 before) | `Handoff 7 (2; 1 before)` | received | Replace the whole note, re-measured after the build. Known now: the page title 32 under the header, as frame 29 draws it (F-15; it was 24); the rest kept at handoff 2's positions where the redraw tightens the empty state with no stated value: Private drafts 24 under the title, the empty title 24 under that, the line 32 under it, Create a club 68 under the line, the buttons 16 apart (`noClubButtonGap`) (F-25, X-08); body ink as on `G06-no-club`; the header and the inert controls as on `G06-no-club`. |
| 233 | `M01-no-club` | Handoff 2 (1 before) | `Handoff 7 (2; 1 before)` | received | Replace the whole note, re-measured after the build. Known now: the page title 32 under the header (F-15; it was 24); the empty title, the line and Go to Home's row kept at handoff 2's positions, 92, 32 and 56 apart (frame 30 moves them with no stated value: X-08); Go to Home on the left at the 20-point inset, as the sheet's text-action specimen draws it (X-25), selecting the Home tab (handoff 1); the line stays "Days shared after you join a club will appear here after they open." where frame 30 reads "Days shared after you joined will appear here after they open." (X-01, R-03, F-02: the new line has no replaces entry and is untrue for someone with no club); the frame's changed boundary line is not followed. |

### 2.6 New `built from spec` rows (X-33), Source empty, Stage B0

Insert beside the related rows. Render cells name `screens/<state>.png` like every built-from-spec row (the file doesn't exist; `no_render_note` handles it).

| Insert after | Row |
|---|---|
| 34 (`A02-email-empty`) | `| A02 Authentication | `A02-email-invalid` | The server refuses the address: drawn as `A02-email-refused` | `screens/A02-email-invalid.png` |  | built from spec | B0 | Words only (handoff 7: `auth.email.invalid`, "Enter a valid email address.", with the field's invalid border). Not built: the line names no action (T43; check section 4 item 3, R-01, W-15) and the app can't tell a refused address from another refusal (the sign-in service's prose is never read: `signin.md`, F7), so it draws `A02-email-refused` until Claude Design rewords the line |` |
| same | `| A02 Authentication | `A02-email-signed-out` | A sign-in the server ended: "Your sign-in ended. Enter your email to sign in again." above the field | `screens/A02-email-signed-out.png` |  | built from spec | B0 | Words only (handoff 7: `auth.email.signedOut`; `IMPLEMENTATION.md` section 4): a neutral body notice between the subtitle and the field's label, with no error icon and no invalid border, shown only when the server ended the sign-in and never after Leave sign-in. No frame, ink, gaps or announcement is given (W-10), so those are the app's reading until a frame comes |` |
| 45 (`A02-code-resend-refused`) | `| A02 Authentication | `A02-code-error-resend-failed-network` | A wrong code showing when Send a new code fails: both blocks | `screens/A02-code-error-resend-failed-network.png` |  | built from spec | B0 | Words only (handoff 7: the wrong-code line `auth.code.invalid` stays in its block and `auth.code.resendNetwork` goes in its own block below the resend row, `authForm.resendFailure`: "Grow/scroll rather than overwrite"; X-17, check section 6). No frame. Built from `A02-code-error` and `A02-code-resend-failed-network` |` (state name proposed, D6) |
| 53 (`A03-profile-refused`) | `| A03 Profile | `A03-profile-name-refused` | A name the server refuses: drawn as `A03-profile-refused` | `screens/A03-profile-name-refused.png` |  | built from spec | B0 | Words only (handoff 7: `auth.profile.nameRefused`, "Choose a name with visible characters and no line breaks or hidden formatting.", with the invalid border). Not built: the line names no action (T43; R-01, W-15) and doesn't cover a name over 40, so the app draws `A03-profile-refused`, the name kept, with no invalid border, until Claude Design rewords it |` |
| 263 (`global-launch-failed-network`) or beside `global-launch` | `| Global | `global-leaving` | While Leave sign-in runs: the system's indicator over "Leaving sign-in…" | `screens/global-leaving.png` |  | built from spec | B0 | Words only (handoff 7: `root.leaving`; `launch.runtimeLeaving`): no header and no tabs, in the form of `global-launch` (the indicator over a `metadata` label in `secondaryText`, said politely once, shown as soon as the route starts, no invented delay: W-09). No frame draws it and nothing says whether the indicator waits a moment. It shows for every removal, including one the server ended and the person didn't start (R-10) |` |

### 2.7 Other rows whose words or notes change but stay `built from spec`

Status stays `built from spec`, Source stays empty. Replace the named clause; keep the rest of the cell.

| INV line | State | Replace this clause | With |
|---|---|---|---|
| 37 | `A02-email-refused` | "handoff 7 asks for its words. `handoff4.auth.firstSend.refused`; placed as" | "Words only (handoff 7: `auth.email.refused`, the same words as `handoff4.auth.firstSend.refused`, which it replaces); placed as" |
| 40 | `A02-code-verify-unavailable` | "handoff 7 asks for its words. FQ86's default words until handoff 7 gives them;" | "Words only (handoff 7: `auth.code.unavailable`, the same words as FQ86's answered default);" |
| 41 | `A02-code-error-waiting` | none | Unchanged (handoff 7 asked nothing of it). |
| 45 | `A02-code-resend-refused` | "handoff 7 asks for its words. `handoff4.auth.resend.refused`; placed as `A02-code-resend-failed-network`" | "Words only (handoff 7: `auth.code.resendRefused`, the same words as `handoff4.auth.resend.refused`, which it replaces); placed as `A02-code-resend-failed-network`, in its own block under the row" |
| 46 | `A02-age-saving` | Shows "busy; Leave sign-in stays available"; Notes "handoff 7 asks for its words. The busy button" | Shows "busy; Leave sign-in unavailable"; Notes "Words only (handoff 7: `vo.age.busy`, "Saving your age confirmation.", said once; Leave sign-in inactive while saving, X-18). The busy button" |
| 48 | `A02-age-refused` | Shows ""Couldn’t save your profile. Try again.""; Notes "handoff 7 asks for its words. Handoff 4's `failureStates` until handoff 7 gives A02-age its own line" | Shows ""Couldn’t save your age confirmation. Try again.""; Notes "Words only (handoff 7: `auth.age.refused`); above the button it names, as `A02-age-failed-network`" |
| 51 | `A03-profile-saving` | "handoff 7 asks for its words. The busy button" | "Words only (handoff 7: `vo.profile.busy`, "Saving your profile.", said once; the name read-only and Add photo and Leave sign-in inactive while saving, X-19). The busy button" |
| 53 | `A03-profile-refused` | "handoff 7 asks for its words. Handoff 4's `failureStates`. A name the server refuses (`A03-profile-name-refused` in handoff 7's brief) draws the same, as the app can't tell them apart yet" | "Words only (handoff 7: `auth.profile.refused`, the same words as `failureStates[action=Save profile]`, which it replaces), under the field with no invalid border, as frame 11 places `A03-profile-failed-network`'s line. A name the server refuses is `A03-profile-name-refused`, drawn the same" |
| 54 | `A03-profile-name-too-long` | Shows "kept as typed, Continue unavailable, no line"; Notes "Built from `A03-profile` ... handoff 7 asks for its words." | Shows "kept as typed, Continue unavailable, and "Use 40 characters or fewer for your name." under the field"; Notes "Built from `A03-profile-failed-network`'s place and the contracts (`ios/b0-sign-in`). Words only (handoff 7: `auth.profile.tooLong`, under the field, the name kept as typed and never cut, Continue unavailable; X-19, FQ70)." Keep "FQ70; the fixture is book p27's two long names together, 45 characters". |
| 133 | `H01-error-no-club-refused` | "handoff 7 asks for its words (item 14)." | "Words only (handoff 7: `tabs.error.refused`, "Try again.", confirmed by its item 14, with Retry's hint `vo.retryHome.hint`)." |
| 144 | `F01-error-no-club-refused` | "handoff 7 asks for its words (item 16)." | "Words only (handoff 7: `friends.error.title` over `tabs.error.refused`; Retry's hint `vo.retryFriends.hint`)." |
| 234 | `M01-loading-no-club` | "handoff 7 asks for its words (item 15)." | "Words only (handoff 7: `memories.loading`, "Loading Memories…", in writing; Memories says nothing when the list comes back)." |
| 235 | `M01-error-no-club` | "handoff 7 asks for its words (item 16)." | "Words only (handoff 7: `memories.error.title` over `tabs.error.network`; Retry's hint `vo.retryMemories.hint`, "Load Memories again.")." |
| 236 | `M01-error-no-club-refused` | "handoff 7 asks for its words (item 16)." | "Words only (handoff 7: `memories.error.title` over `tabs.error.refused`)." |
| 262 | `global-launch` | Shows ": the canvas alone", "While the account is read, at launch or on Retry, and while Leave sign-in runs"; Notes "handoff 7 asks what shows (item 12). Its reading: the launch screen unchanged, nothing drawn on the canvas." | Shows "While the account is read, at launch or on Retry: the system's indicator over "Loading your account…", no header or tabs" (Leave sign-in is `global-leaving`). Notes "Words only (handoff 7: `root.loading`; `launch.runtimeAccountLoading`, `launch.retryRead`: "Shows runtime account loading, sign-in retained"). No frame draws it and no ink, place or delay is given (W-09), so it takes the form of `H01-loading-no-club`'s body: the indicator over a `metadata` `secondaryText` label, said politely once, shown as soon as the route starts. Right after a verified code it doesn't show: `A02-code-verifying` stays until the account answers." Keep the "Built from Tadayo's launch screen..." opening only if still true; the OS launch screen stays the canvas alone (`global-launch-screen`). |
| 264 | `global-launch-refused` | "handoff 7 asks for its words (item 12)." | "Words only (handoff 7: `root.account.title` over `root.refused`; `vo.root.account.refused`)." |
| 265 | `global-leave-failed` | "handoff 7 asks for its words (item 12)." | "Words only (handoff 7: `root.leave.title` over `root.refused`; `vo.root.leave.refused`; Retry's hint `vo.retryLeave.hint`, "Remove the sign-in from this iPhone again."; a retried removal repeats the removal)." |
| 266 | `global-sign-in-not-kept` | "handoff 7 asks for its words (item 12)." | "Words only (handoff 7: `root.keep.title` over `root.refused`; `vo.root.keep.refused`; Retry's hint `vo.retryKeep.hint`, "Return to email sign-in. Your email address is kept.")." |
| 267 | `global-club-not-in-build` | "handoff 7 asks for its words (item 14)." | "Words only (handoff 7: `tabs.notInBuild`, confirmed: no Retry, said once, only the header and the tabs)." |
| 268 | `global-launch-screen` | "handoff 7 asks what it holds (item 12)." | "handoff 7 confirms it: the OS launch screen is the canvas only, light and dark; the runtime wait is `global-launch`." |

### 2.8 Rows whose Shows text changes

Collected from 2.3 to 2.7: line 31 (`A02-code`), 46, 47, 48, 50, 54, 262. No other Shows cell changes.

### 2.9 Known differences: bullet by bullet

Lines are HEAD's. "Drop" means the reading is answered by handoff 7 (X-33: "drop the answered readings"); keep a short pointer to the answer. Where the new text depends on the build it is marked.

Sign-in and profile group (INV line 382 to 396):

| Line | Bullet | Action |
|---|---|---|
| 382 | heading | "handoffs 1 and 2's five frames, with the 20 states above that have none until handoff 7 answers" becomes "handoffs 1, 2 and 7's frames, with the 13 states above that have none". |
| 383 | keyboard, status bar | Keep. |
| 384 | the snapshots' phone | Keep. |
| 385 | Back buttons | Rewrite: `A02-email` none in B0 (frames 1 to 3 and 23 agree); `A02-code`'s is the system back button, hidden while a code is checked or sent, where frames 4 and 7 draw it active against the written rule (X-03, R-11); `A02-age` and `A03-profile` each have handoff 7's leading "Leave sign-in" text action in the navigation bar, no confirmation, unavailable while a save runs, replacing A02-age's chevron and its link under the button (FQ69); it ends the session on the device and returns to `A02-email` with the typed address not kept until FQ93 is answered; A03 has no back button. Drop "handoff 7's brief asks for both screens' exits (its item 12)". |
| 386 | Wrapping | Keep; replace the last sentence with: at the largest text the code screen's line reads "Sent to ben@" over "example.com", which fills the 353-point width as `authForm.longEmail` asks, where `A02-code-error-xl` (frame 19) breaks it "Sent to", "ben@example", ".com"; the app keeps its breaks, a zero-width break after the "@" and after each dot (C-02). |
| 387 | The largest text (`-xl`) | Keep; add that frames 19 and 20 show a scrolled viewport with the keyboard up and the primary button pinned 12 points above it, where the snapshot shows the whole screen. |
| 388 | Spacing | Keep; add (build-dependent): the delivered named gaps (`fieldErrorGap` 12, `resendToFailure` 8, `formFooterToSafeAreaBottom` 44, Continue 12 above the keyboard) are built where the frames draw other values (X-05, F-08), and the 44 = 32 + 12 reading for A03's Continue to the safe area changes with WM-02. |
| 389 | The title's height | Keep; update for A02-age's title now on one line (BM-04) after the build. |
| 390 | A wrapped title's lines | Keep. |
| 391 | The busy button | Rewrite: handoff 7 draws it (frame 2 and the sheet's "Primary action · busy"): label, size and colours kept; a 16-point native indicator 8 points before the centred label in two 24-point slots that stay clear, busy or not; at accessibility sizes the indicator on its own row above the label (`busyPrimary.layout`, in writing only, X-14); the value "In progress"; the action said once; the field read-only, keeping focus and the keyboard; the button not tappable. Keep the sentence on the snapshots drawing the indicator still (`Spinners`). Drop "no handoff draws it yet" and the trailing-edge description. |
| 392 | An unavailable text action | Rewrite as confirmation: handoff 7 draws Change email address unavailable in `secondaryText` (#607067, frames 4 and 7), as built. Keep the hue-only observation about dark. Drop "Handoff 7's brief asks for both (its items 4 and 17c)". |
| 393 | A typed value longer than its field | Replace the last sentence ("Handoff 1 asks for Dynamic Type 'without truncating names'; the ios lane's needs list asks a later handoff for a field that wraps.") with: handoff 7 answers it: single-line native text fields scroll horizontally for a long value and do not wrap it into the border, while labels and the code screen's destination line wrap, with no ellipsis, at the available width (`IMPLEMENTATION.md` line 72; C-03; needs item 31); handoff 1's "without truncating names" holds for labels and that line. |
| 394 | Where a failure line sits | Rewrite (frames): `A02-email` in a growing block under the field that pushes Send a code and the helper down (frame 3); `A02-code` in the error region under the field, and a resend failure in its own block under the resend row (frames 5 and 8); `A02-age` above the pinned button with at least 16 points clear (frame 9); `A03-profile` under the field (frame 11). The field's border stays unmarked for a connection failure or a refusal; only a wrong code marks it. (Delivered but not built: an address or a name the server refuses marks it, R-01.) |
| 395 | `A03-profile-empty`'s avatar | Rewrite: the outlined person symbol at 56 percent of the circle (sizes 68, 36, 28, 18) until a name gives a readable initial: a letter in any script or a decimal digit (frame 10; the sheet's "Avatar with no readable initial"; D-14, X-20); the profile control isn't announced "No profile photo" until a contract names the element that says it (WM-04). |
| 396 | States drawn the same | Rewrite: `A02-email-invalid` as `A02-email-refused`, and `A03-profile-name-refused` as `A03-profile-refused`, until Claude Design rewords the two delivered lines so each names its action (R-01, W-15). `A02-email-signed-out` has its own row. |

New bullets for the same group (frame differences the app doesn't follow; X-33 asks for X-01 to X-08 and X-02's missing line):

- **Verify code's place** (X-04, V-02, F-09; the critic's ruling on V-02 and X-04): the frames at the usual size draw it in the flow, about 162 points above the keyboard, where the written rule pins it 12 above the keyboard at every size; frame 19 pins it. The app keeps it in the flow and pins it only where the keyboard would otherwise hide it.
- **The gap from a field to its failure line** (X-05, F-08): drawn about 2 points on `A02-email-failed-network`, 5 on `A02-code-error` and `A02-code-verify-failed-network`, 13 on `A03-profile-failed-network`, and the resend failure about 5 under its row; the contract's `fieldErrorGap` is 12 and `resendToFailure` 8, which the app builds.
- **The subtitle-to-field gap** (X-06, F-06, F-19): `A02-code`'s frames cut it from about 40 points to about 7 under "Sent to" while `A02-email`'s keep about 39; no contract states either; the app keeps `SetupGap.field` on both.
- **The body ink** (X-07, F-05, the critic's ruling on W-05): the redraws and new frames draw explanatory lines in `primaryText` while "Sent to", the email helper and "Optional" stay `secondaryText`; no contract or replaces entry states the change, and the app keeps `secondaryText`.
- **A02-age's title-to-body gap** (BM-04, F-22): the frame about 60 points, the other sign-in screens about 17, the app 24.
- **A03 at the largest text** (FM-01, check section 4 item 12): frame 20 has an empty band of about 166 points between Optional and the label; the app keeps the content continuous.
- **A03's gaps and glyphs** (F-23, F-07, V-18): the redraw tightens two gaps and moves Add photo, Optional and the initial; the app keeps handoff 1's gaps apart from the label's 8; the frames draw B at 30.6 on A03 and 12.6 in headers where the roles are `avatarProfile68` 28/34 and `avatar28` 13/18, and the app keeps the roles.
- **A03's arrival focus** (C-01): the name field takes focus on arrival except while VoiceOver is running; A02-email's is unconditional.
- **The refused address and name** (R-01, W-15; check section 4 item 3): kept as `A02-email-refused` and `A03-profile-refused`.
- **The keys** (D-25, W-14, X-11): the app keeps its built keys where a handoff 7 key repeats one word for word (`person.self`, `highlight.label`), the mapping in the strings' comments; the unnamed earlier keys (`handoff3.H01.error.network`, `handoff3.H01.error.retryVO`, `handoff5.loading.hint`, `failureStates[action=Send a code · server]` and `[action=Resend · server]`, `historyBoundary.display`) stay current outside the no-club context.
- **Announcements** (RM-01, R-12): each failure is spoken as its title then its line (`vo.root.account.*`, `vo.root.leave.refused`, `vo.root.keep.refused`, `vo.home.error.*` and the Friends and Memories ones), never `vo.failure.root.*` or `vo.failure.tabs.*` alone, which hold only the second line; Home says "Home updated." only when its list comes back empty and the not-in-build line alone otherwise.

Tabs and root group (INV line 397 to 408):

| Line | Bullet | Action |
|---|---|---|
| 397 | heading | "handoffs 2 and 4's three no-club frames, with the 16 states above that have none until handoff 7 answers" becomes "handoffs 2, 4 and 7's frames, with the 12 states above that have none". |
| 398 | The header is content | Rewrite as answered: handoff 7 confirms it (the header scrolls away, never in a navigation bar, no glass; an opaque canvas band stays behind the status bar on iOS 17, 18 and 26, content clipped below it: X-23). Drop "handoff 7's brief asks ... and the ios lane's needs list keeps it open (item 17)". |
| 399 | + Add's place | Rewrite as answered: the delivery gives + Add [241, 56, 80, 44], Account [329, 56, 44, 44] and the avatar [337, 64, 28, 28] at 393 points, the largest-size rectangles addTarget [20, 104, 249, 76] and accountTarget [329, 120, 44, 44] (D-15, X-23); built so. Keep the observation that the snapshots' top inset is the iPhone 17's 62 where the frames' targets start at 56. |
| 400 | The header at large text | Rewrite: it stacks at every accessibility size, the wordmark row first, + Add leading and the avatar trailing (frame 22; D-15), where it stacked only on overflow, actions trailing. Keep `Lab-header-320-xl`. |
| 401 | The tab bar | Keep (needs item 36 stays open). |
| 402 | The Lab | Keep. |
| 403 | Loading | Keep, plus: frames 13 and 15 draw the shell about 25 to 32 points higher than handoff 3 does, and the app keeps handoff 3's place (F-17); no Private drafts row and no hint while loading. |
| 404 | A tab's failure | Keep the form; add the kept difference: frames 14 and 16 draw the title in `utilityTitle` 32/35 and the line in `primaryText`, where FQ90's form is `emptyTitle` and `secondaryText` (F-04, X-24, the critic's rulings on X-24 and WM-03); replace "(the frames' 27, at the nearest step)" with "(frame 14's 24)"; replace the root sentence's "the title 20 points under the safe area, the line, and Retry pinned at the foot" with the frame's: the title where the sign-in screens' titles sit under their bar, Retry 44 above the safe area's bottom (frame 12, X-22). |
| 405 | What VoiceOver says | Rewrite for the delivered keys: loading label politely once; "Home updated." on Home only when its list comes back empty; Friends and Memories silent; each failure's title and line at once; each Retry with its hint (`vo.retryHome.hint`, `vo.retryFriends.hint`, `vo.retryMemories.hint`, `vo.retryAccount.hint`, `vo.retryLeave.hint`, `vo.retryKeep.hint`); Account with `header.accountHint` (X-13); "Loading your account…" and "Leaving sign-in…" politely once. Keep the TestFlight sentences about focus. |
| 406 | Pressed | Keep (needs items 33 and 34 stay open). |
| 407 | The Private drafts row's symbols | Add: the folder is centred in its 24-point box 16 in from the leading edge, where it was 12; frames 21, 22, 28, 29 and the sheet's "Secondary action, Private drafts and text action" specimen draw 16 (BM-01). The sheet specimen is current for its scope (`precedence.existingSheet`). |
| 408 | Line breaks | Keep (needs item 38 stays open). |

New bullets for the tabs group:

- **Memories before a club** (X-01, R-03, F-02; check section 4 item 1): the app keeps "Days shared after you join a club will appear here after they open." (`memories.noClub.body`); frame 30 reads "Days shared after you joined will appear here after they open.", which has no replaces entry and isn't true for someone with no club.
- **Home before a club at the largest text** (X-02, R-04, F-01; check section 4 item 2): frame 22 leaves out "Create a club or open an invitation."; the app shows both lines at every size.
- **The no-club tabs' body** (X-08, F-24, F-25; check section 3): frames 28 to 30 tighten gaps and move the empty title with no stated value; the app keeps handoff 2's and 4's positions (`TabGap`), takes the header (X-23), the leading text actions (X-25) and the page titles 32 under the header (F-15), and keeps G06's two lines as one text.
- **The header's initial** (V-18): the frames draw B at 12.6; the app keeps `avatar28`.

Drop-card group (INV line 409 to 419): nothing for this slice, except line 409's sentence "the slice that adopts handoff 7 for the screens on `main` makes the named files from them", which becomes past tense once the files exist.

Handoffs 5 and 6 group, line 381 (`brand/brand-components.png`: the proposed-day specimen without a selection circle): still true on handoff 7's sheet (it keeps handoff 6's whole). Add the sheet bullet below.

New bullet, the sheet (put beside line 381): **`brand/brand-components.png` is handoff 7's sheet** (ADR-027's second "Later" line; `docs/DESIGN-HANDOFF.md`, "Naming rule"): it keeps handoff 6's whole and appends handoff 7's specimens from sheet point 9,680 (D-01). Its PNG draws the sheet's one transparent band, sheet points 6,880 to 9,680 (pixels 13,760 to 19,360 at 2x), black where handoff 6's is transparent (probed at x 5: handoff 7 is (0, 0, 0), handoff 6 is (255, 255, 255, 0)); judge that band from `claude-design/handoff-7/frames/brand-components.svg`, or composite handoff 6's PNG (`claude-design/handoff-6/frames/brand-components.png`, RGBA, the same band transparent) on the canvas colour: handoff 7's PNG is RGB, so nothing shows through its black. The PNG is 2,400 by 51,552 pixels in RGB: ImageMagick 6 in the cloud session refuses it (`identify`: "Image height exceeds user limit"; the policy's height limit is 32KP, and `-limit` can't raise it); Pillow opens it with `Image.MAX_IMAGE_PIXELS = None`. A defect a replacement brings is listed here and isn't built.

### 2.10 Counts (INV line 423 to 425)

Computed from the file (`count_inv.py`, then `simulate.py` applying 2.3 to 2.6):

- Trial states: 240 now; 250 after (251 with `A02-code-typed`).
- With a render: 109 now; 130 after (131). Of these, 50 have a 2.1 render (unchanged: 43 rows whose Render cell is `2.1/` plus the 7 that also have a `screens/` render) and 80 have a render only in `screens/` (81): 59 now plus 16 requested, 5 dark and largest-text and, with the typed row, 1.
- Built from spec: 36 now; 25 after (36 minus the 16 delivered, plus the 5 new rows).
- Requested: 0. Missing: 95 (unchanged; 11 of them say "built from spec" in their notes).
- Later states: 6 (3 with 2.1 renders), unchanged. Brand assets: 4, all received.

Replacement text for the first Counts bullet (the earlier history kept; the two "20 built from spec" and "16 built from spec" clauses lose their "handoff 7 asks" tails):

"- Trial states: 250 (149 before handoffs 1 to 4 entered; 30 rows added with them, 11 delivered new states and 19 described only in words or in neither handoff; 25 added with handoffs 5 and 6, 15 delivered new states and 10 with no frame; 20 built from spec with sign-in and profile, `ios/b0-sign-in`, and 16 with the tabs and the root, `ios/b0-tabs`, of which handoff 7 drew 16 (11 sign-in and profile frames, the launch failure and four tab frames); 10 added with handoff 7, 5 delivered new frames (`A02-code-error-dark`, `A02-code-error-xl`, `A03-profile-empty-xl`, `G06-no-club-dark`, `G06-no-club-xl`) and 5 states with no frame (`A02-email-invalid`, `A02-email-signed-out`, `A03-profile-name-refused`, `global-leaving`, `A02-code-error-resend-failed-network`)). With a render: 130. 50 have a 2.1 render (one of them, `C03-system-picker`, ...unchanged...) ... 80 have a render only in `screens/`: `F02-upcoming-dark` (handoff 0), 35 from handoffs 1 to 4 (...unchanged...), 23 from handoffs 5 and 6 (...unchanged...) and 21 from handoff 7 (its 16 requested frames and 5 new ones; its 8 redraws replaced files already there). Built from spec: 25. Requested: 0. Missing: 95."

With D1's typed row: "11 added with handoff 7, 6 delivered new frames (those five and `A02-code-typed`, the redraw of `A02-code`) and 5 ...", "With a render: 131", "81 ... 22 from handoff 7", total 251.

J block 1.3's design line (J line 404) quotes these counts and must be rewritten in the same commit: "250 trial states, 130 with a render (50 from 2.1, 80 only in `screens/`), 25 `built from spec` (13 sign-in and profile, 12 tabs and root), 0 requested, 95 missing"; "handoffs 0 to 7 as reference files, handoff 7 adopted for the screens on `main`"; "brand assets 4 of 4 (revision 1.1)"; FQ93 now in the file.

---

## 3. (b) QUESTIONS edits

Q line numbers are HEAD's. None of these closes a question (X-34); each bullet states Claude Design's agreement or answer and leaves the founder's question open (RM-02).

### 3.1 Already in the file (check, do not redo)

- FQ44 (lines 224 to 228): the bullet at 227 records that `drop.collecting.opening` splits the date and isn't taken (X-10, D-02, R-05). Done.
- FQ91 (lines 421 to 427): line 426 records agreement with (a) and (b), the templates keeping (c), and the revealed item's grouping answered (X-32). Done.
- The drop card's preface (line 419): already "stands until the founder answers". Done.
- FQ94 (lines 433 to 435) and FQ95 (lines 436 to 438): match check section 5 B and C. FQ94: default every photo fills the frame, needed by B5. FQ95: default show them, doing nothing yet (FQ85's reading), needed by B5, Lab leaves them out. No edit.

### 3.2 To write

**Tabs preface (line 407).** Replace "Design handoff 7's brief asks for each (items 12 to 16, `docs/design/handoff-7/handoff-7-brief.md`); these defaults stand until its export is checked." with: "Design handoff 7's brief asked for each (items 12 to 16, `docs/design/handoff-7/handoff-7-brief.md`); its export, checked on 7 November 2026 (`docs/design/handoff-7/check/handoff-7-check.md`), words them all, draws the loading and failure states, and agrees with FQ89 and FQ90 by name, and these defaults stand until the founder answers." (The literal X-34 edit is only "until its export is checked" to "until the founder answers"; the rest keeps the sentence true.)

**FQ58 (after the Default at line 291).** Add: "Handoff 7 (checked on 7 November 2026, `docs/design/handoff-7/check/handoff-7-check.md`, section 5) answers its brief's question for an account with no club (item 13): Ben's initial may show in the header's photo place once his own account record has arrived, with no avatar before it (`noClubRootHeader.accountInitial`; frames 13 and 15), which is what the app builds while the club list loads (`H01-loading-no-club`). The Default is consistent with that. The question stays open, for a club's Home too."

**FQ69 (after the Default at line 323).** Add: "Handoff 7 (checked on 7 November 2026, ...) answers how a person leaves: a native "Leave sign-in" text action at the leading edge of the navigation bar on A02-age and A03-profile, replacing A02-age's chevron and its link under the button (A03 had no exit), with no confirmation and unavailable while a save runs (`ageExit`; frames 9, 10, 11, 20, 26 and 27). Nothing irreversible is lost: on A02-age nothing has been recorded, and on A03 the age stays recorded on the server while the unsaved name and chosen photo are dropped. It ends the session on the iPhone and returns to A02-email; whether the address typed there stays is FQ93. The retention this question asks to be proposed, how long such an account is kept, is still owed." (Do not write "address kept in memory": see D3.)

**FQ70 (after the Default at line 329).** Add: "Handoff 7 (checked on 7 November 2026, ...) words the too-long case: "Use 40 characters or fewer for your name." (`auth.profile.tooLong`), under the field, the name kept as typed and never cut, Continue unavailable; no request has failed, so there is no action to name. It also words a name the server refuses, "Choose a name with visible characters and no line breaks or hidden formatting." (`auth.profile.nameRefused`, with the invalid border), which names no action (T43) and doesn't cover a name over 40, so the app keeps "Couldn’t save your profile. Try again." for it until Claude Design rewords it (the check's R-01 and W-15; `A03-profile-name-refused`, drawn as `A03-profile-refused`)."

**FQ86 (after the Default at line 364).** Add: "Handoff 7 (checked on 7 November 2026, ...) words it the same: `auth.code.unavailable`, "Couldn’t verify the code. Try again.", with the digits kept and Verify code available, so the catalog's `auth.error.verifyUnavailable` doesn't change (the check's X-34)." Optional: in the Default's last sentence, "Handoff 7's line replaces it when it arrives; a string ... is all that changes" becomes "Handoff 7's line is the same."

**FQ89 (after the Default at line 410).** Add: "Handoff 7 (checked on 7 November 2026, ...) agrees with this default by name: the three titles (`root.account.title`, `root.leave.title`, `root.keep.title`) over `root.network` or `root.refused`, Retry pinned at the foot, no header and no tabs, VoiceOver saying the title and the line, and Retry after "Couldn’t keep you signed in." returning to A02-email with the address kept (frame 12 draws the first). It adds what the app now builds: a native spinner over "Loading your account…" (`root.loading`) while the account is read, at launch and on Retry, and over "Leaving sign-in…" (`root.leaving`) while the session is removed, in place of the launch screen's colour alone (no frame; the check's W-09, X-21); "Your sign-in ended. Enter your email to sign in again." (`auth.email.signedOut`), a plain notice on A02-email after the server ended a sign-in (no frame; W-10); and a hint for each Retry (`vo.retryAccount.hint`, `vo.retryLeave.hint`, `vo.retryKeep.hint`). "Leaving sign-in…" shows for every removal, including one the server ended and the person didn't start; the next brief asks whether other words fit (R-10). The app speaks each failure's title then its line, never `vo.failure.root.*` alone, whose lines name nothing that failed (RM-01). Agreement doesn't answer the question for the founder." Write "now builds" only in the commit that builds it.

**FQ90 (replace the stale bullet at line 414).** Replace the whole bullet ("Handoff 7's brief carries this default's loading words ... The brief hasn't gone to Claude Design yet.") with: "Handoff 7 (checked on 7 November 2026, ...) agrees with this default by name, and its brief stated these words (items 14 to 16): "Loading Friends…" and "Loading Memories…" (`friends.loading`, `memories.loading`); "Couldn’t load Friends." and "Couldn’t load Memories." (`friends.error.title`, `memories.error.title`) over "Check your connection and try again." or "Try again." (`tabs.error.network`, `tabs.error.refused`), each with Retry and its own hint (`vo.retryHome.hint` and the two like it); and "This version of Tadayo can’t show clubs yet." (`tabs.notInBuild`) with no Retry, said once, with only the header and the tabs. Friends and Memories say nothing when the list comes back; "Home updated." (`home.resolvedVO`) is Home's alone, said when its list comes back empty. No Private drafts row shows while the list loads or has failed (+ Add stays in the header). One difference is kept: frames 14 and 16 draw the failure title at 32 points (`utilityTitle`) with the line in `primaryText`, where this default takes `emptyTitle` (25) and `secondaryText`, as handoff 6's `H01-access-lost` does, so the app keeps this form and "Couldn’t load Memories." doesn't wrap (the check's section 4, item 5; F-04, X-24, and the critic's rulings on X-24 and WM-03). Agreement doesn't answer the question for the founder."

(X-34's second reviewer: more than the last sentence is stale; the brief's items 14 and 16 do state the three lines and item 15 the silence on return. Needs item 35 is answered, so the parenthetical about it goes.)

**Check header paragraph (line 431).** Replace with: "The design thread's check of handoff 7's export (7 November 2026, `docs/design/handoff-7/check/handoff-7-check.md`, section 5) raised three questions, numbered FQ93 to FQ95. FQ93, about sign-in, comes with the slice that adopts handoff 7 for the screens on `main`; the two about the revealed item came with the drop card that builds it (`ios/b0-drop-card`)." (Number FQ92 stays unused here: J line 404 reserves it for `ios/b0-lab-rows`.)

**FQ93 (insert before FQ94, line 433).**

"- **FQ93. Whether Leave sign-in keeps the address typed.** Leave sign-in, on A02-age and A03-profile, ends the session on the iPhone and returns to A02-email. Handoff 7 keeps the address the person typed there, held in the app's memory and never saved, so signing in again with the same address needs only a new code (`ageExit.return`: "A02-email in B0, address retained in memory"; its `IMPLEMENTATION.md`, section 2). The app opens an empty field, so nothing of the account just left stays on screen (`RootModel.endSession()` drops the sign-in, and `showSignIn()` makes a new one). Either way, the app keeps the address after "Couldn’t keep you signed in." (FQ89's Default) and, where it still has it, after the server ends a sign-in, as the delivery says. Raised by the check of handoff 7 (its R-06, WM-01 and BM-03; the critic's rulings on WM-01 and BM-03: a data-handling choice, not a design correction, and the delivery's own `ageExit.reason` purges the unsaved name and photo on exit).
    - Default: an empty field after Leave sign-in, as built.
    - Needed by: B0."

FQ94 and FQ95 follow unchanged.

---

## 4. (c) The needs list (`docs/design/handoff-7/ios-lane-needs.md`)

Its own file, edited in the repository; cite repository paths only (ADR-032: "The needs list's next edit, the first made in the repository, rewrites its own citations to repository paths", and "a copy goes to the folder for the design thread to read", a copy nobody cites).

### 4.1 Citation fixes

- Line 84 (item 39): `design/handoff-7/check/handoff-7-check.md` becomes `docs/design/handoff-7/check/handoff-7-check.md`. It is the only non-repository folder path in the file (grep of backticked paths: the rest are `design/reference/INVENTORY.md`, `docs/PROGRESS.md`, evidence-branch paths and `2.1/...` and `screens/...` names relative to `design/reference/`; optionally prefix those two with `design/reference/` in item 19's paragraph, line 39).
- The intro (line 3) says "Stage B0 items come first: slice 11 builds them now"; add one sentence after it: "Handoff 7 (checked 7 November 2026, adopted for the screens on `main` by <branch>) answers most of items 1 to 25; the status of each item is below."
- Section 6's heading says "after handoff 7's brief went out ... not handoff 7's"; keep the heading, annotate item 31 as answered.
- Section 8's introduction (line 82) and the paragraph before item 45 (line 90) are already correct apart from item 46 (see 4.3).

### 4.2 Status after the slice: what handoff 7 answers (check section 8, last bullet; finding "Consistency" list, lines 1685 to 1720)

Add "**Answered by handoff 7**" with the pointer, as items 39 to 46 already do:

| Item | Status | Pointer |
|---|---|---|
| 1 `A02-email-sending` | answered | frame 2; `busyPrimary`; X-15 |
| 2 failed and refused | answered | frame 3; the refused line in writing (`auth.email.refused`); X-16, X-05 |
| 3 `A02-code-verifying` | answered | frame 4; X-03 (the frame's active Back disagrees with the written rule) |
| 4 `A02-code-verify-failed` | answered | frame 5; X-05 |
| 5 `A02-code-resend` | answered | frame 6; `vo.resend.available` |
| 6 `A02-code-resending` | answered | frame 7; `auth.code.resending` confirmed |
| 7 resend failed and refused | answered | frame 8; `auth.code.resendRefused` in writing; X-17 |
| 8 `A02-age-saving` and failed | answered | frame 9 and writing: `auth.age.network`, `auth.age.refused`, `vo.age.busy`; X-18 |
| 9 `A03-profile-empty` | answered | frames 10 and 20; the sheet's "Avatar with no readable initial"; X-19, X-20 |
| 10 saving and failed | answered | frame 11 and writing; `vo.profile.busy` |
| 11 a refused name | answered in writing | `auth.profile.tooLong`; `auth.profile.nameRefused` (not adopted, R-01) |
| 12 back and leave | answered | `ageExit`; frames 9, 10, 11, 20, 26, 27; X-18, X-19; the address after Leave is FQ93 |
| 13 "Sent to" | answered | kept as the one approved Sent exception (FQ68, ADR-029) |
| 13a `A02-code-verify-unavailable` | answered | `auth.code.unavailable`, the same words as FQ86 |
| 13b Leave that couldn't finish | answered in part | the failure confirmed; the wait corrected to "Leaving sign-in…" (`root.leaving`), no frame (W-09, X-21) |
| 14 `H01-loading-no-club` | answered | frame 13; FQ58's initial allowed once the account record is in |
| 15 `H01-error-no-club` | answered | frame 14 (the title's size disagrees with FQ90; kept) |
| 16 Friends and Memories | answered | frames 15 and 16; Memories in writing |
| 17 header on iOS 26 | answered | `noClubRootHeader`; X-23 |
| 18 FQ85 greyed out | not needed | the founder chose "show, doing nothing yet" (FQ85, ADR-029) |
| 19 processing and pending | answered | the sheet's specimens, light, dark, AX5 |
| 20 removed | answered | `dropShapes.removedPlaceholder` |
| 21 one sheet, six states | answered in part | the busy button, fields, highlight covers and expanded row are drawn at the default size only (X-14) |
| 22 to 25 highlight rail, star, tile inset | answered | `highlightCover` (list from extraLarge; `star.tileOrigin` (55, 11) and row trailing 24; star fixed at 12; tile top inset 8) |
| 31 a typed value longer than its field | answered | `IMPLEMENTATION.md` line 72: the single-line field scrolls, it doesn't wrap; C-03 |
| 35 Friends and Memories when the list returns | answered | they say nothing (`announcementPolicy.loading`) |
| 39 compact receipt | answered in part | already annotated; still open: V-10's cap, D-06 and X-09 |
| 40, 41, 42, 44 | answered | already annotated |

### 4.3 Still open, with the reason

26 to 30 (the api lane's contract needs, not handoff 7's); 32 (book p5's question for the sign-in frames, not addressed); 33 and 34 (pressed and disabled forms, not drawn); 36 (the unselected tabs' colour); 37 (a tab's failure read as one group: the delivery's `vo.failure.root.*` and `vo.failure.tabs.*` hold only the second line, RM-01; the app speaks title then line); 38 (Private drafts at AX5 on a narrow screen); 43 (the star as the viewer); 45 (rows at accessibility sizes on a narrow screen); plus section 7 of the check (4.4).

Item 46: the check's section 8 lists it open; the ios lane's list says answered (the fixed padding shows "Highlight" whole at AX5 on a 320-point screen: `Lab-revealed-320-xl`; J line 404 says "46" answered). The sources disagree (D4): keep the ios lane's reading and say so on the item ("the check lists it open; the delivery's `revealedItem.photoHighlightLabel` fixes the padding").

### 4.4 New items for the check's section 7 (numbers 47 onwards, a new section 9 "Left over from handoff 7's check")

One item per group, each ending with its finding ids; nothing here needs a founder answer.

47. The two errors first: Memories' line "after you joined" (X-01, R-03, F-02) and G06's missing second line at the largest text (X-02, R-04, F-01).
48. Words: the refused address and the refused name, each naming its action, the name's line also covering a name over 40 (R-01, W-15); VoiceOver keys that hold only the second line (RM-01); whether "Leaving sign-in…" fits a removal the person didn't start (R-10); each highlight cover's VoiceOver name and hint within T47 (R-02, D-16); which part of the profile says "No profile photo" (WM-04); the folded card's date as one date with an optional year, and room for a year on the upload rows and the receipt (D-02, R-05, X-10, D-23).
49. The redraws: explain or undo what check section 3 keeps, name the gaps they use (X-06, X-07, X-08, F-19 to F-25, BM-04); confirm the two the app takes from the sheet alone, text buttons on the left (with the profile's Add photo and Optional on the left under a centred circle) and the Private drafts folder 16 in (X-25, BM-01), and list them under `replaces`.
50. Frames: 4 and 7 with Back unavailable, hidden or dimmed (X-03, R-11); 20 with continuous content (FM-01); the tabs' failure titles at FQ90's size, or why 14 and 16 draw them larger, and why 12, 14 and 16 draw the line black (F-04, X-07); one rule for Verify code above the keyboard (X-04, V-02); the two start-up waits and the signed-out notice, which have no frame (W-09, W-10); a corrected highlight sample with roster colours, folded corners and the long name's initial (D-10 and the sheet items); the receipt's spacing and its tick at the largest text (D-06, V-10, X-09); the draft row with or without its arrow (D-08).
51. Smaller points: the field-to-error gap (X-05, F-08); whether the leading text actions reach beyond B0 (X-25); Home's two announcements in a row (R-12); the loading shell's place (F-17); whether the start-up spinner waits a moment (W-09); the stretched coffee photograph and Maya's crop (V-23); the dark avatar sample's labels; the folded card's sender gap and its avatar at the largest text (D-19, D-24); the upload caption's darker ink (D-07); the samples' missing year (D-23).
52. Later stages: where the receipt shows on Home and in the share extension, and whether the failed row's Retry replaces the screen's (B4, D-20); a card with no caption and what VoiceOver reads for it (B4); whether a club's header moves as the header before a club now does (B2); the unsaved bookmark (B6).
53. Files: screen-copy's missing hints, `replaces` entries for the keys that repeat earlier ones, and a scope for each replaced component (X-11, X-13, W-14).

The closing paragraph of the file ("Also for the next brief ... the highlight cover's expanded row", D-10) stays and is already the leftover for the sheet.

---

## 5. (d) Audit-map rows in J section 2 the slice touches

Rows are in J's section 2 (audit map begins line 408). Each row has Rule, Enforced in, Tested by, Status, Notes. The slice's code is built by the other parts; this part rewrites the rows' text, in each commit that builds the change. Where a row names counts ("25 states", "13 states", "20 states built from spec") they go stale.

| Row (J line) | Enforced in today | Tested by today | Status | What the slice changes in the row |
|---|---|---|---|---|
| T41 One vocabulary (456) | `packages/domain/src/copy/rules.ts` `lintString`, over every string file by `cli.ts` (`pnpm copy-lint`), less `exceptions.ts` `EXCEPTIONS`: one, FQ68's "Sent to %@" under the key `auth.code.sentTo` in `apps/ios/Tadayo/Localizable.xcstrings`; exact dates: `TadayoCore` `DateLabels.swift` | `rules.test.ts`, `extract.test.ts`, `cli.test.ts`, `exceptions.test.ts`; `DateLabelsTests`, `DateLabelsDeviceZoneTests` | tested | New strings are linted (every handoff 7 value passes: only `auth.code.destination` "Sent to {email}" hits the banned-word rule, which is FQ68's line). Keep the key `auth.code.sentTo` and its value "Sent to %@": the exception matches file, key and value together, so renaming the key to handoff 7's `auth.code.destination` fails the lint (D7). The row's last sentence says "36 keys"; the catalog holds 72 today (and the package's 24): recount, and say the run still prints the exception, found 1 time, 0 findings. |
| T42 Names, not pronouns (457) | the same lint | the same | tested | No change in the row; no handoff 7 string has a pronoun (scanned). |
| T43 The voice is plain (458) | the lint (exclamation marks); the app's errors name what failed: tab and root failure titles, `Route.leaveFailed`, `Route.signInNotKept` (`ios/b0-tabs`) | `rules.test.ts`...; `RootSnapshotTests.testEachFailureNamesWhatFailedAsAHeadingWithRetry`, `TabsSnapshotTests.testEachTitleIsAHeading`, `TabsAnnouncementTests.testAFailureIsSaidAtOnceWithItsLine`, `RootSnapshotTests.testEachFailureIsSaidAsItShowsTitleThenLine`, `RootModelTests.aSessionTheDeviceCantKeepSaysSoAndSignsInAgain` | tested | Notes' "FQ89 and FQ90's interim words until handoff 7" becomes: handoff 7 agrees with both; A02-age has its own words naming the age confirmation (`auth.age.network`, `auth.age.refused`); the two delivered refusal lines that name no action (`auth.email.invalid`, `auth.profile.nameRefused`) are not built (R-01, W-15); add the new tests (the age words, the resend failure's own block) when they exist. |
| T44 Tokens, not values (459) | `TadayoDesign` `Palette`, `TypeRole`, `Metrics`; `SecondaryButtonStyle`, `PrivateDraftsEntry`, `NoClubHeader` use tokens and named sizes, each `Size` with its source | `LabSnapshotTests.testLabSections` (`Lab-colours`, `Lab-type`), `Lab-actions`, `Lab-header`, `LaunchScreenTests`, the drop-card Lab sections | built | Each new constant needs a `Size`/`Spacing` name with its source: the busy button's 16-point indicator and 24-point slots, the person symbol's 56 percent, the header's band and rectangles, the Private drafts folder's 16 inset (`draftsFolderInset`, BM-01: it was 12), `fieldErrorGap` 12, `resendToFailure` 8, `formFooterToSafeAreaBottom` 44 and the 12 above the keyboard. List them in the row. |
| T45 Native first (460) | `apps/ios/Tadayo/SignIn/` (system `NavigationStack`, back button, keyboards, content types, `ProgressView`), `apps/ios/Tadayo/Tabs/` (`TabView`, `symbolVariants`, `ProgressView`), the launch screen colour | `SignInSnapshotTests` (25 states, each light, dark and largest text; `Spinners.check`), `SignInUITests`, `TabsSnapshotTests` (13 states), `RootSnapshotTests` (5), `LabSnapshotTests` `Lab-drops` | built | Counts change (new states: `A02-email-signed-out`, the typed code if D1, the code error with a resend failure, `global-leaving`, the loading state of the root). Add: Leave sign-in is the system's navigation bar item; "Loading your account…" and "Leaving sign-in…" use the system's `ProgressView`; the single-line field scrolls (C-03). |
| T46 Claude Design designs; Claude Code never does (461) | fixtures and the Lab guards; the wordmark byte for byte; `INVENTORY.md` marks each state's source; the contact sheets (`ios_steps.py` `sheets`, `no_render_note`) | `SheetsTest...`, `StateTest.test_no_render_notes`, etc. (`ci`) | built | The last two sentences ("...20 states that have none ... handoff 7's brief asks for their frames", and the tabs' 16) become: handoff 7 came in as 16 requested frames, 5 dark and largest-text frames and 8 redraws, copied unchanged from `design/reference/claude-design/handoff-7/frames/` into `design/reference/screens/` (7 files replaced, the earlier ones staying in handoffs 1, 2 and 4), and its sheet replaced `design/reference/brand/brand-components.png` (ADR-027); 25 states remain `built from spec` (13 and 12), 5 of them new (X-33), each with its known differences. Add the check command (section 8) as the evidence. Nothing was redrawn. |
| T47 Accessibility is part of done (462) | the long row: `TypeRole` scaling, `Avatar` hidden, `FoldedCard`, `HighlightCover`, sign-in's `LabelledField`, `InlineError`, `announcing`, "each title a header, A02-age's chevron labelled 'Leave sign-in'", the busy button's indicator room, the tabs' `NoClubHeader` (stacks on overflow), `PrivateDraftsEntry`, loading focus, the drop card's templates | `SignInSnapshotTests` `testEachTitleIsAHeading`, `testTheAddressIsReadAsItIs`, `testACodeNotVerifiedIsTheFieldsHint`, `testA02EmailShowsOnlyItsOwnFailures`, `testTheAgeScreensBackIsLeaveSignIn`, `testTheAvatarIsntRead`; `SignInUITests`; `TabsSnapshotTests` and `RootSnapshotTests` VoiceOver tests; `TabsAnnouncementTests`; `DropCardTests` | built | Rewrite the sign-in and tabs clauses: Leave sign-in is a leading navigation bar text action on A02-age and A03 (so `testTheAgeScreensBackIsLeaveSignIn` expects one element on A02-age and gets an A03 twin, `profile.md`); busy states announced once with the value "In progress"; the resend row's availability and success announced; failures spoken as title then line; Retry hints; `header.accountHint`; the header stacks at every accessibility size; the person symbol and the unannounced circle (WM-04); A03's arrival focus skipped under VoiceOver (C-01: not testable in a hosted test, say so). Notes: the device checks still wait for the founder's iPhone (TestFlight): add the new announcements and the focus exception. |
| T48 Motion is one fold (463) | empty | empty | planned | No change. The slice adds only the system's indicators, drawn still in snapshots; no motion of Tadayo's own. |
| T49 Truthful states only (464) | `RootModel.leave()` ("the launch screen while it runs"), `RootModel.loadClubs()`, the tabs' states, the root's failures, the drop card | `RootModelTests` (the listed ones), `SignInModel` tests, `TabsSnapshotTests`, `DropCardTests` | planned | The leave clause becomes "'Leaving sign-in…' while it runs, for every removal (R-10)"; add the account read's "Loading your account…" state and the signed-out notice as true only when the server ended the sign-in (never after Leave); the last sentence "`verifyUnavailable`'s words are handoff 7's to give" becomes: handoff 7 gives the same words (FQ86). Status stays planned unless the row's owner moves it. |
| T50 Ask only when needed (465) | empty | empty | planned | No change; A03's Add photo stays inert (FQ85), and the keyboard on arrival is no permission. |
| T11 The author's preview stays with the author (426) | `RootModel.account` cleared in `endSession`, `showSignIn`; `left`/`Connections.reset()` at Leave | `RootModelTests` (`theTabsAccountIsForgottenOnLeaving`, ...) | (not re-read in full) | Only if the root part carries the typed address across a server-ended sign-in (check section 5: "if the app still has it"): add that it is held in memory only, never stored, and not the account, and that Leave sign-in doesn't carry it (FQ93's default). |
| Spec 23 account privacy (520) | `SessionManager.signOut()`, `RootModel.leave()` ("the launch screen meanwhile"), `KeychainSessionStore`, FQ87's purge | `SessionManagerTests`, `RootModelTests`, `KeychainSessionStoreTests`, `AppLaunchTests`, `SignInUITests.testTheLabsLogOutReturnsToSignIn` | tested | "the launch screen meanwhile" becomes "'Leaving sign-in…' meanwhile" if `RootModel` splits `.starting` (X-21); the same note for the address as T11. |
| Spec 29 (A02 and A03) (521) | `SignInFlow.swift` (`EmailScreen`, `CodeScreen`), `ProfileScreens.swift` (`AgeScreen`, `ProfileScreen`), `SetupLayout.swift`, `SignInModel`, `ProfileModel`, `TadayoApp.swift` `RoutedView`, `apps/ios/Tadayo/Localizable.xcstrings` | `SignInSnapshotTests` (25 states), `SignInUITests` (3 named tests) | built | The notes' "their 20 other states built from spec until handoff 7's frames" becomes: 14 frames from handoff 7 (frames 1 to 11 for A02 and A03, 18 to 20, 23 to 27, minus the code), the states with only words built from spec; new snapshot and UI tests listed; the new state count. |
| Spec 03 (the three tabs) (522) | `TabsView.swift` | `TabsSnapshotTests`; `SignInUITests.testTheTabsWithNoClub` | built | Only the header's new rectangles if the row names them; otherwise unchanged. |
| Spec 29 (G06, F01, M01 with no club; the root's states) (523) | `Tabs/` (`TabsView`, `TabContent`, `HomeNoClub`, ...), `RootFailure.swift`, `TadayoApp.swift` `RoutedView`, `NoClubHeader`, `PrivateDraftsEntry`, `SecondaryButtonStyle` | `TabsSnapshotTests` (13), `RootSnapshotTests` (5), `LaunchScreenTests`, `SignInUITests.testTheTabsWithNoClub` | built | "16 states built from spec until handoff 7" becomes: handoff 7's frames 12 to 16, 21, 22 and 28 to 30 are in; 12 states remain built from spec (11 plus `global-leaving`); new test names; counts. |
| Q30 Screen reader, large text, keyboard, reduced motion, error recovery (512) | empty | empty | planned (B9) | No change; the slice's VoiceOver evidence feeds B9 but the row waits for the device pass. |

Rows the slice does not touch: T1, T10, T12, T20, T24, T38, T52 (these were not read in full), Q07, Q09, Q26 (B6 planned; the Leave flow is covered by the T11 and Spec 23 rows), Spec 14, Spec 15 and Spec 24's app rows (531 to 533: already rewritten by #28 for the drop card). No row is deleted (J line 410).

The journal's state block 1.3 (J line 404) is not an audit row, but the counts there are quoted from INV: rewrite them in the same commit (2.10).

---

## 6. (e) Files in `design/reference/screens/` and `design/reference/brand/`

All copies are byte for byte from `design/reference/claude-design/handoff-7/frames/` (every PNG there is 786x1704; the sheet is 2400x51552). `screens/` holds PNGs only. Never edit pixels; handoff 7's folder stays as it arrived (`checksums.sha256`: 92 of 92 OK).

### 6.1 Added to `screens/` (21; 22 with D1)

Sixteen requested: `A02-email-empty.png`, `A02-email-sending.png`, `A02-email-failed-network.png`, `A02-code-verifying.png`, `A02-code-verify-failed-network.png`, `A02-code-resend.png`, `A02-code-resending.png`, `A02-code-resend-failed-network.png`, `A02-age-failed-network.png`, `A03-profile-empty.png`, `A03-profile-failed-network.png`, `global-launch-failed-network.png`, `H01-loading-no-club.png`, `H01-error-no-club.png`, `F01-loading-no-club.png`, `F01-error-no-club.png`.

Five dark and largest-text: `A02-code-error-dark.png`, `A02-code-error-xl.png`, `A03-profile-empty-xl.png`, `G06-no-club-dark.png`, `G06-no-club-xl.png`.

With D1: `A02-code-typed.png`, a copy of `frames/A02-code.png` under the new state name (the only file whose name differs from its frame's; say so in INV's row and the journal).

None of these 22 names exists in `screens/` today (checked).

### 6.2 Replaced in `screens/` (7), the older file stays in its handoff folder

| File | Now (by sha256) | Older file stays at | New source |
|---|---|---|---|
| `A02-email.png` | handoff 1 | `claude-design/handoff-1/frames/A02-email.png` | `handoff-7/frames/A02-email.png` (frame 23) |
| `A02-code-error.png` | handoff 2 | `claude-design/handoff-2/frames/A02-code-error.png` (handoff 1 also has one) | frame 25 |
| `A02-age.png` | handoff 1 | `claude-design/handoff-1/frames/A02-age.png` | frame 26 |
| `A03-profile.png` | handoff 1 | `claude-design/handoff-1/frames/A03-profile.png` | frame 27 |
| `G06-no-club.png` | handoff 4 | `claude-design/handoff-4/frames/G06-no-club.png` (handoffs 1 and 7 too) | frame 28 |
| `F01-no-club.png` | handoff 2 | `claude-design/handoff-2/frames/F01-no-club.png` | frame 29 |
| `M01-no-club.png` | handoff 2 | `claude-design/handoff-2/frames/M01-no-club.png` | frame 30 |

### 6.3 Not replaced

`A02-code.png` stays handoff 1's (arrival: "Enter code", Verify code unavailable); handoff 7's redraw of it (frame 24: 529614, Verify code available) is `A02-code-typed` (D1) or only a note. Every other file in `screens/` is untouched. Total after: 67 + 21 = 88 (89 with D1).

### 6.4 The brand sheet

Replace `design/reference/brand/brand-components.png` with `claude-design/handoff-7/frames/brand-components.png` (ADR-027: the sheet holds every earlier one, and handoff 7 brings no brand revision: `brandRevision` 1.1, `brand-tokens.json` byte-identical to handoffs 1 to 6, the dark icon's PNG and SVG byte-identical in handoffs 1, 6, 7). The current file equals `claude-design/handoff-6/frames/brand-components.png` (sha256 `714a548bf0b3d45b...`), which stays there. The new file's sha256 begins `0f843ea26a3b51df`. Nothing else in `brand/` changes: the wordmark PDFs, the three icons and `brand-tokens.md` stay.

`brand/README.md`: replace the `brand-components.png` row with: "Design handoff 7's component sheet (`../claude-design/handoff-7/frames/brand-components.png`). It keeps handoff 6's sheet whole (all 9,645 of its elements recur in order, unchanged) and appends handoff 7's specimens from sheet point 9,680: the busy button, the fields and failure lines, the no-club header at the largest text, the avatar with no readable initial, the drop card's states, the highlight covers and the receipt, each in light and dark. It holds every earlier sheet's components and the contracts handoffs 2 to 7 added. Its PNG draws the sheet's one transparent band (points 6,880 to 9,680) black, which handoff 6's leaves transparent, and is 2,400 by 51,552 pixels in RGB, taller than ImageMagick's default policy opens here (Pillow does); `INVENTORY.md`'s Known differences says how to read it". Also: "`brand-tokens.md`" row "(handoffs 1 to 6, byte-identical)" becomes "(handoffs 1 to 7, byte-identical)"; `brand-icon-dark-1024.png` row "byte-identical in handoffs 1 to 6" becomes "1 to 7"; last paragraph add "Handoff 6's `brand-components.png`, which handoff 7's replaces here, stays as it arrived in `../claude-design/handoff-6/frames/`."

Usage check: nothing in the repository reads `brand/brand-components.png` (grep: only doc comments in `FoldedCorner.swift` line 4 and `FoldedCard.swift` line 5, docs, and INV). `FoldedCard.swift`'s comment "handoff 5 corrected it on handoff 6's sheet (`brand-components.png`)" stays true.

`docs/LIMITATIONS.md` (not in this part's files but the project's rule): add a row for the ImageMagick height limit and the Pillow workaround, with the exact error text, dated; no existing row covers it (LIMITATIONS lines 44 and 337 mention ImageMagick only for the runner and the setup script).

---

## 7. Where the sources are silent or disagree, and what to decide

D1. **`A02-code`'s typed-code redraw.** Check section 8 says "A02-code's redraw shows a typed code; keep handoff 1's frame for the moment it opens (V-17)"; V-17's meanwhile says "Map the redraw to a typed-code state in INVENTORY.md, and keep handoff 1's render for arrival". The app's `A02-code` snapshot is the arrival (empty field: `testA02Code`); `A02-code-verifying` types 529614 but is busy; no snapshot has a typed code with Verify available. Recommended: add `A02-code-typed` (row 2.4, file 6.1) and add its snapshot in the sign-in part (`signin.md` E: "a new typed-code state (name to choose)"). Alternative: record frame 24 in the notes only, with no file and no row (251 becomes 250, 131 becomes 130). The name is this report's proposal; the sign-in part must use the same one, because the contact sheet pairs by name.

D2. **The sheet.** Rule: replace and list the defect (ADR-027's second "Later" line; `docs/DESIGN-HANDOFF.md`). The defect is the black band, plus a practical one the check doesn't mention: the file is 2400x51552 RGB, which ImageMagick 6 here refuses (height limit 32KP; `identify` and `convert` both fail, `-limit` doesn't help), so an engineer comparing a specimen must use Pillow or crop from the SVG. Nothing in CI reads the sheet. The file is 10.3 MB (the old one 5.0 MB); no repository size guard was found. Recommendation: replace, record both in Known differences (2.9) and LIMITATIONS.

D3. **FQ69 and the address.** X-34 says FQ69 should record "the address kept in memory (BM-03)". The critic's rulings on WM-01 and BM-03 send the address to the founder and keep an empty field until the answer; check section 8 says "FQ69: record the leading Leave sign-in with no alert" and adds FQ93. The FQ69 bullet above therefore omits the address and points to FQ93. Follow the critic and section 8, not X-34's wording.

D4. **Needs item 46.** The check's section 8 lists it open; the ios lane's list and J line 404 say answered (`revealedItem.photoHighlightLabel`: star grows, padding and gap fixed, no height cap; the label reads whole at AX5 on 320 points). Keep the lane's reading, say so on the item, and tell the design thread.

D5. **X-16 against R-01 and W-15.** X-16 says add an invalid-address failure with the invalid border; R-01, W-15 and check section 4 item 3 say keep "Couldn’t send a code. Try again." (and "Couldn’t save your profile. Try again." for a name), because the delivered lines name no action (T43), and the sign-in part's `signin.md` (F7) agrees and adds that the app can't detect the address case. So `A02-email-invalid` and `A03-profile-name-refused` are rows (X-33) that are drawn as `A02-email-refused` and `A03-profile-refused`: their notes say so, and the contact sheets will show no snapshot of their own unless a part draws one.

D6. **The state with a wrong code and a resend failure.** X-33 and check section 6 list it without a name. `A02-code-error-resend-failed-network` follows the existing pattern (`A02-code-error-waiting`, `A02-code-resend-failed-network`); the sign-in part must use the same name in `SignInSnapshotTests`.

D7. **T41's exception is tied to a key.** Check section 8 ("Keys") says keep built keys where handoff 7's repeat them word for word; do so for `auth.code.sentTo` (handoff 7's `auth.code.destination`). Renaming it breaks `EXCEPTIONS` (file + key + value).

D8. **Other disagreements already ruled** (nothing to decide, but each shows in a note above): the tabs' failure title size (F-04, X-24, WM-03: FQ90's form wins); body ink (X-07, the critic's ruling on W-05); Verify code's pin (V-02, X-04); the cover's VoiceOver name (D-16 against T47 and R-02: "Open {name}’s highlight"); resend and Change email rows lead (F-06's "keep centred" against X-25: they lead); X-20's "give the profile photo control 'No profile photo'" against WM-04 and check section 4 item 13: not announced yet.

D9. **FQ numbering.** FQ92 is reserved for `ios/b0-lab-rows`; adding FQ93 first leaves a gap in the file until that branch adds FQ92. Fine; say nothing in Q about FQ92.

D10. **Stale statements to fix in the same commit**: INV line 396 and line 393's "ios lane's needs list asks a later handoff for a field that wraps"; INV line 382's and 397's "20" and "16" states; INV line 409's future tense; J line 404's counts and "its frames not yet named in `screens/` or the inventory"; Q line 431; needs line 84.

---

## 8. Order of work and checks

1. Copy the files (6.1 to 6.4), one commit with INV and `brand/README.md` ("Keep this current in the same commit as the change", INV line 5). Commands, from the repository root:
   - For each name in 6.1 and 6.2: `cp design/reference/claude-design/handoff-7/frames/<name>.png design/reference/screens/<name>.png` (for D1: `cp .../frames/A02-code.png design/reference/screens/A02-code-typed.png`).
   - `cp design/reference/claude-design/handoff-7/frames/brand-components.png design/reference/brand/brand-components.png`.
2. Check: `cmp` each `screens/<name>.png` against its source frame (all equal; the D1 file against `frames/A02-code.png`); every file in `screens/` is 786x1704 (`file`); `ls design/reference/screens | wc -l` is 88 (89 with D1); `cd design/reference/claude-design/handoff-7 && sha256sum -c checksums.sha256` still 92 OK; each replaced file's old sha256 still matches its handoff folder copy (6.2); `git diff --stat` shows no change under `claude-design/`.
3. Edit INV (2.2 to 2.10), then run a counter over its rows on the result (a short script that reads the table); it must print 250 rows, received 130 incl. the reference-only row, built from spec 25, missing 95 (251, 131 with D1); and `python3 -I -m unittest tools/ci/ios_steps_test.py` (or the repository's usual runner for it) must pass: it reads the inventory's states.
4. Edit Q (3.2), then run the copy lint over the changed documents only if the repository's lint covers them (it reads string files, not Q).
5. Edit the needs list (4), then the journal's audit rows and design line (5, 2.10), then LIMITATIONS (6.4).
6. Run `python3 tools/ci/journal_check.py --branch` before pushing (CLAUDE.md, "The journal"): each commit needs a log entry, the state rewritten and no audit row deleted.
7. Open the contact sheets the `ios` workflow puts on the `evidence` branch for the new frames beside the snapshots: a 16 frame is judged against its snapshot by `<state>`, `<state>-dark`, `<state>-xl`; list every difference against the Known differences above.

The counter and the simulation were throwaway scripts and are not kept.
