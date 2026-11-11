# Design handoff 7: every finding

*7 November 2026. Every finding from the check of handoff 7, with its evidence and what the app does meanwhile. Six reviewers each read the delivery through one lens; a second reviewer tried to refute each finding (verdict: confirmed, adjusted or refuted) and added what the first missed (ids with M); a last reviewer looked for gaps (ids C-). Severity: must, should or note. Who acts: app (the ios thread), claude-design (a later brief), founder, or none. Where two findings disagree, the critic's rulings at the end, and section 8 of `handoff-7-check.md`, say which one the app takes.*

*Where the cited files are: file names such as `IMPLEMENTATION.md`, `screen-copy.json`, `copy-contracts.json`, `component-contracts.json` and `frames/<name>.svg` are in Claude Design's pack, `Tadayo_Handoff_7_Pack.zip` (in the repository under `design/reference/claude-design/handoff-7/` once the ios lane adopts it). App files (`apps/ios/...`, `packages/swift/...`) are as of `main` at 4886165 and the branch `ios/b0-drop-card` at 870def9. Earlier handoffs are in `design/reference/claude-design/handoff-<n>/`, and the rules in `docs/`.*


## Frames 1 to 16, 18 to 22 and the eight redraws

*Reviewer's summary:* I checked the drawn phone frames of handoff 7 (frames 1-16, 18-22 and the 8 redraws 23-30) against the brief, the Defaults, the six points, the Closest frames and the app on main. Every requested state is delivered, with the fixtures as asked (Ben, ben@example.com, 529614, initial B, person fallback on 10/20, no avatar on 12) and the brief's words drawn exactly. The FQ86, FQ89 and FQ90 words, "Loading Home…", the 16-point button gap, the wordmark as an image labelled Tadayo and the + Add label and hint all hold.

Two musts:
- G06-no-club-xl (frame 22) leaves out "Create a club or open an invitation."
- The unrequested M01-no-club redraw changes the boundary line to "Days shared after you joined will appear here after they open.", with no replaces entry and no explanation.

The shoulds:
- Frames 4 and 7 draw Back as available while a request runs, against the delivery's own contract.
- The tab error frames (14 and 16) use a 32-point title and a primaryText line instead of the 25-point title and secondaryText line of H01-access-lost, the form the Default names.
- Body lines are switched from secondaryText to primaryText across most frames, unexplained.
- Every code frame tightens the field label under "Sent to" and left-aligns the rows below it, unexplained.
- The field-to-error gaps differ between frames and none matches fieldErrorGap 12.
- Verify code sits in the content flow at default size but is pinned above the keyboard at the largest text size.
- On A03, Add photo and Optional are left-aligned under a centred avatar, and the initials are off their type roles.
- The redraws carry many changes nobody explained (fixtures, alignments, gaps); each is listed below.

Six changes for the ios lane follow from frames that answer the brief:
- Leave sign-in as a leading text action on A02-age and A03.
- A03 focused on arrival, Continue 12 points above the keyboard, and its failure line under the field.
- The resend states: the failure in its own block, and the busy row with a spinner.
- The age-confirmation failure lines.
- The no-club header's target rectangles, with + Add leading on the second row when stacked.
- Page titles 32 points below the header.

FQ58 (whether Ben's initial shows while the club list loads) stays the founder's decision; the frames draw B, and the app already shows it.


### F-01 (must, claude-design, confirmed)

- **Where:** The app keeps both body lines at every text size (HomeNoClub draws noClub.body1 and noClub.body2) and builds the stacked header from 17c; frame 22 is read as missing that line.
- **Finding:** G06-no-club-xl (frame 22) leaves out the second body line "Create a club or open an invitation." (handoff7.noClub.body2).
- **Evidence:** G06-no-club.svg and G06-no-club-dark.svg draw it at x20, baseline 243.94. G06-no-club-xl.svg has no group for it. Its aria-labels go from "people." straight to "Create a club", and so do its screen-copy visibleStrings. The manifest note only says "later invitation and Private drafts remain below viewport".
- **Meanwhile and who acts:** Note it in INVENTORY.md's known differences for G06-no-club-xl, and ask in a later brief for the frame again with both lines. The app keeps both lines at every size.

### F-02 (must, claude-design, adjusted)

- **Where:** The app keeps "Days shared after you join a club will appear here after they open." (memories.noClub.body, from handoff 2's historyBoundary.display) and its M01 layout (TabGap.memoriesEmpty, emptyTitleToBody, goHome).
- **Finding:** The unrequested M01-no-club redraw (frame 30) changes delivered copy with no explanation and no replaces entry. For Ben, who has no club, "after you joined" assumes a club Ben hasn't joined. The redraw also changes geometry nobody asked for.
- **Evidence:** Handoff 2 M01-no-club and copy-contracts historyBoundary.display: "Days shared after you join a club will appear here after they open." Frame 30 draws "Days shared after you joined will appear here after they open." (handoff7.noClub.memories.body). handoff7.replaces has no entry for noClub.memories.body, and IMPLEMENTATION.md is silent. Geometry changes on the delivery's own line-box measure:
- page title baseline 151 to 158.24 (accounted for by noClubRootHeader.contentStart);
- page title to empty title about 94 to 32;
- empty title to its line about 34 to 16;
- the line's ink #607067 to #182B25 (F-05);
- Go to Home moves from centred (x153.4) to x20, and from about 57 to 24 below the line.
- **Meanwhile and who acts:** Ask Claude Design in a later brief to keep historyBoundary.display, or to name the key it replaces and say why. The app keeps the handoff 2 string and its M01 gaps until then.
- **Second reviewer:** The copy change is exact. copy-contracts keeps historyBoundary.display "Days shared after you join a club will appear here after they open.", and handoff7.noClub.memories.body reads "Days shared after you joined will appear here after they open.". handoff7.replaces has no entry for it, and IMPLEMENTATION.md doesn't mention it. The app's xcstrings holds the handoff 2 wording. Two of the gap figures used Arimo's own ascent and descent. The delivery measures line boxes as baseline minus 0.82 times the size, which is the measure that gives its own fieldLabelGap 8 and contentStart 32. On that measure the new gaps are 32 and 24, both on the scale. Severity, action and who are unchanged.

### F-03 (should, claude-design, confirmed)

- **Where:** The app keeps hiding the system back button while a code is verified or a new one sent (CodeScreen .navigationBarBackButtonHidden(!model.canChangeEmail)), as the written contract says.
- **Finding:** Frames 4 and 7 draw Back as available while a request runs, against the delivery's own contract.
- **Evidence:** In frames 4 and 7 the chevron at translate(20 65) is stroked #284CDB (action), while "Change email address" is #607067. screen-copy for both frames: Back {rect [16,55,44,44], enabled: true}; Change email address enabled: false.
- **Meanwhile and who acts:** Ask Claude Design to correct frames 4 and 7 in a later brief. No app change.

### F-04 (should, claude-design, confirmed)

- **Where:** The app keeps H01-access-lost's form: the title in emptyTitle 25/30, 32 points under the header (TabContent.title), the line in secondaryText, and Retry pinned 24 points above the tab bar as drawn.
- **Finding:** Frames 14 and 16 draw the failure title in utilityTitle 32 and its line in primaryText. H01-access-lost uses emptyTitle 25 and a secondaryText line. IMPLEMENTATION.md doesn't mention the change. At 32 points, "Couldn’t load Memories." (not drawn) would wrap to two lines.
- **Evidence:** H01-error-no-club.svg: "Couldn’t load Home." at 32, baseline 158.24, #182B25; "Check your connection and try again." at 17, #182B25. F01-error-no-club.svg: "Couldn’t load Friends." at 32, last glyph at x348.9. Handoff 6 H01-access-lost.svg: "This club is no longer / available." at 25 (baselines 184 and 214); "Choose a club to continue." at 17, #607067.
- **Meanwhile and who acts:** Ask Claude Design in a later brief to confirm the tab failure title's role and the line's ink. The app keeps emptyTitle 25 and secondaryText meanwhile.

### F-05 (should, claude-design, confirmed)

- **Where:** The app keeps secondaryText for these lines (SetupHeading's subtitle, also used by RootFailure; HomeNoClub's body; EmptyLine; TabContent's failure line) until Claude Design says whether the change is intended.
- **Finding:** Body and subtitle lines move from secondaryText to primaryText across frames, unasked and unexplained. "Sent to {email}", the helper and "Optional" stay secondaryText, so A02-email's and A02-code's subtitles now differ.
- **Evidence:** #607067 in the earlier frames, #182B25 now:
- "We’ll send a six-digit code to sign in." (frames 1-3, 23);
- "Tadayo is for people aged 18 and older." (frames 9, 26);
- "A name your friends know." (frames 10, 11, 27);
- the G06 body lines (frames 22, 28; frame 21 uses #F7F8F2, not #B6C3B7);
- the F01 and M01 no-club lines (frames 29, 30);
- the failure lines of frames 12, 14 and 16 (H01-access-lost uses #607067).
"Sent to ben@example.com" stays #607067 in frames 4-8, 24 and 25.
- **Meanwhile and who acts:** Ask Claude Design to confirm or revert in a later brief. The app keeps secondaryText meanwhile.

### F-06 (should, claude-design, confirmed)

- **Where:** The app keeps its shared gap from subtitle to field (SetupGap.field, 44) on both A02-email and A02-code. It keeps the waiting sentence, Send a new code and Change email address centred, as handoffs 1 and 2 draw them.
- **Finding:** Every code frame changes the code screen's layout without asking or explaining:
- the field label moves up under "Sent to", so the two line boxes are about 7 points apart, against about 39 on A02-email in this same delivery;
- the rows below Verify code are left-aligned instead of centred.
- **Evidence:** Frames 4-8, 18, 19, 24 and 25: "Six-digit code" baseline 219.66, field at y235, Verify code at y349. Handoffs 1 and 2: label baseline 252, field at y263, Verify code at y376 ("Sent to" baseline 192). A02-email in this delivery: body baseline 193.94, label baseline 251.66. The wait sentence and Send a new code are at x20 (handoff 1 x71.1; handoff 2 x134.7), and Change email address at x20 (earlier x116.5).
- **Meanwhile and who acts:** Ask Claude Design to confirm the code screen's spacing and alignment in a later brief. The app keeps SetupGap.field and the centred rows.

### F-07 (should, claude-design, confirmed)

- **Where:** The app keeps Add photo and Optional centred under the avatar (ProfileScreen's VStack in .frame(maxWidth: .infinity)) and the initials in their roles (avatarProfile68 28/34, avatar28 13/18), centred in the circle.
- **Finding:** On A03, Add photo and Optional are left-aligned under an avatar that stays centred. The profile initial is drawn larger than its role and sits high in the circle. The header initial is also off its role. None of this is explained.
- **Evidence:** Frames 10, 11 and 27: avatar at x162.5-230.5, "Add photo" at x20, "Optional" at x20; handoff 1 has them centred at x160.0 and x172.3. Frames 11 and 27: "B" at 30.6 points, baseline 291.73, in a circle at y251-319, so the glyph's centre sits about 4 points above the circle's; handoff 1 draws B at 28. Header B at 12.6 points in frames 13-16, 21, 22 and 28-30 (avatar28 is 13).
- **Meanwhile and who acts:** Ask Claude Design to confirm in a later brief. The app keeps Add photo and Optional centred and the initials in their roles.

### F-08 (should, claude-design, adjusted)

- **Where:** The app keeps 12 points between the field and the failure line (EmailScreen's InlineError .padding(.top, Spacing.m); CodeScreen.errorRegion .padding(.top, Spacing.m)), and for A03 under the field once F-15 lands.
- **Finding:** The field-to-failure-line gap differs between frames, and none of the three gaps is fieldErrorGap 12.
- **Evidence:** Distance from the field's bottom to the line's first baseline:
- frame 3: field bottom 321, baseline 336.66, 15.66;
- frames 5, 18 and 25: field bottom 289, baseline 307.66, 18.66;
- frame 11: field bottom 346, baseline 372.66, 26.66.
On the delivery's own line-box measure these are gaps of 5, 8 and 16 points. handoff7.spacing.fieldErrorGap is 12 ("Gaps measure line-box edges").
- **Meanwhile and who acts:** Mention it in a later brief. No app change: the app builds the named 12.
- **Second reviewer:** The finding holds: one component, three gaps, none 12. Part of the evidence depended on Arimo's own ascent and descent. On the delivery's own line-box measure (baseline minus 0.82 times the size, which gives its fieldLabelGap 8 and contentStart 32), frame 3's line box starts at 326, just outside the focus ring, not inside it. The evidence is restated so it doesn't depend on the metric.

### F-09 (should, claude-design, confirmed)

- **Where:** The app builds what the frames draw: Verify code in the flow at the default size (as today), and pinned 12 points above the keyboard at accessibility sizes, as frame 19 draws (CodeScreen keeps it in SetupScroll at every size today). The conflict is recorded in the PR.
- **Finding:** The frames and the contract disagree on where Verify code sits. At the default size it is in the content flow; at the largest size it is pinned above the keyboard.
- **Evidence:** Frames 4-8, 18, 24 and 25: Verify code [20,349,353,50], 162 points above the keyboard top at 561, under the error region. Frame 19: [20,464,353,85], 12 points above the keyboard. Continue is pinned at every size ([20,499,353,50] in frames 10, 11 and 27). handoff7.authForm.keyboardFooter: "Continue and Verify code pinned above keyboard with 12-point clear gap."
- **Meanwhile and who acts:** Ask Claude Design which rule holds at the default size. Meanwhile the app keeps Verify code in the flow at the default size and pins it 12 points above the keyboard at accessibility sizes, as frame 19 draws, and records the conflict in the PR.

### F-10 (should, app, confirmed)

- **Where:** The app keeps today's exit until the change lands: on A02-age, a chevron labelled Leave sign-in plus a Leave sign-in link under the button; nothing on A03.
- **Finding:** Frames 9, 10, 11, 20, 26 and 27 answer the exit question with a leading "Leave sign-in" text action on both A02-age and A03, with no chevron, no lower link and no confirmation. The app must change.
- **Evidence:** "Leave sign-in" at x20, baseline 81.12, 16 points, #284CDB; control [20,55,116,44], enabled. Handoff 1's lower link (x148.9, baseline 794) is gone. In the app today, AgeScreen has a ToolbarItem(.topBarLeading) chevron.backward labelled auth.age.leave plus a footer Button("auth.age.leave"), and ProfileScreen has no exit.
- **Meanwhile and who acts:** In AgeScreen and ProfileScreen, put a leading text button "Leave sign-in" in the navigation bar, inactive while saving and with no alert. Remove A02-age's chevron and footer link, and put I’m 18 or older 44 points above the safe-area bottom (formFooterToSafeAreaBottom). Mark A02-age and A03-profile received 7 in INVENTORY.md.

### F-11 (should, app, confirmed)

- **Where:** The app keeps today's A03 until the change lands: not focused on arrival, Continue 44 points above whatever is below it, the failure line above Continue.
- **Finding:** Frames 10, 11, 20 and 27 change A03 in three ways the app must follow:
- the name field is focused on arrival;
- Continue sits 12 points above the keyboard;
- a save failure shows under the field, with the content scrolled so the field and line stay visible.
- **Evidence:** Continue's bottom is at 549, against the keyboard top at 561. Frame 11 puts the line under the field (icon at y364, field bottom 346). In the app, ProfileScreen's comment reads "The field isn't focused on arrival: the frame shows no keyboard"; SetupFooter(bottom: SetupGap.profileFooter, which is 44) puts Continue 44 above the keyboard when it is up; and InlineError sits inside SetupFooter above Continue.
- **Meanwhile and who acts:** Focus the name field on arrival. Put Continue 12 points above the keyboard, and 44 above the safe area without it. Move the failure under the field, 12 points below it.

### F-12 (should, app, confirmed)

- **Where:** The app keeps every failure in the field's two-line region and the resending words in metadata until the change lands.
- **Finding:** Frames 7 and 8 draw the resend states differently from the app:
- a failed resend shows in its own block below Send a new code, not in the field's region, and can sit alongside a wrong-code line;
- "Sending a new code…" is in textAction 16 with a leading native spinner.
- **Evidence:** Frame 8: icon at translate(20 461); text at x42, baselines 469.66 and 487.66; Send a new code [20,407,353,44]; Change email address [20,503,353,44]. Frame 7: spinner centred at (28,429) in #607067; "Sending a new code…" at 16 points, #607067, x44, baseline 432.12. In the app, CodeScreen.errorRegion shows resendNetwork and resendRefused under the field, and resendRow uses waiting("auth.code.resending") in metadata 13, centred, with no spinner.
- **Meanwhile and who acts:** In CodeScreen, move the resend failures into a block under the resend row. Draw the resending row as a spinner plus textAction in secondaryText.

### F-13 (should, app, confirmed)

- **Where:** The app shows the profile's interim lines on A02-age (ProfileModel.Failure.words), 8 points above the button, until the change lands.
- **Finding:** Frame 9 gives A02-age its own failure lines and at least 16 clear points above the pinned button.
- **Evidence:** "Couldn’t save your age confirmation. Check your connection and try again." (handoff7.auth.age.network), and "Couldn’t save your age confirmation. Try again." for a refusal. The line box ends at about 701 and the button starts at 724. In the app, auth.profile.networkFailure and saveFailed sit in SetupFooter's VStack with spacing Spacing.s (8).
- **Meanwhile and who acts:** Give A02-age its own strings and keep at least 16 points above I’m 18 or older.

### F-14 (should, app, confirmed)

- **Where:** The app keeps NoClubHeader's current geometry until the change lands.
- **Finding:** The no-club header in frames 13-16, 21, 22 and 28-30 uses new target rectangles, and when stacked it puts + Add at the leading edge. The app must adopt both. The visible + Add and avatar move away from handoff 6's selected-club header, which nothing explains, so the header would jump when the first club arrives.
- **Evidence:** Delivered: + Add [241,56,80,44] (label at x249, baseline 80.3), Account [329,56,44,44], avatar [337,64,28,28]. At the largest size: + Add [20,104,249,76] (49 points, x20), Account [329,120,44,44]. In the app, NoClubHeader has + Add [274,56,59,44] and Account [337,56,44,44] (the avatar ends 20 points from the edge), and the stacked actions sit trailing. Handoff 6's H01-access-lost draws + Add at x282, baseline 85, and the avatar circle at cx 359.
- **Meanwhile and who acts:** Build the delivered rectangles and the leading stacked + Add. Ask in a later brief whether the selected-club header moves the same way.

### F-15 (should, app, confirmed)

- **Where:** The app keeps its page-title gap of 24 until the change lands.
- **Finding:** Frames 29 and 30 put the Friends and Memories page titles 32 points under the header, where G06's and the error frames' titles sit.
- **Evidence:** "Friends" and "Memories" baselines are 158.24 (handoff 2: 151). In the app, TabGap.pageTitle = Spacing.xxl ("22 in the frames"). handoff7.noClubRootHeader.contentStart: "Header bottom + handoff6.spacing.homeContentTopAfterHeader (32)".
- **Meanwhile and who acts:** Set TabGap.pageTitle to 32.

### F-16 (note, founder, confirmed)

- **Where:** The app keeps showing Ben's initial in the no-club header while the list loads (TabScroll's TabHeader(name:) in every state), which matches the frames.
- **Finding:** Frames 13-16 draw B in the header while the club list loads, and handoff7.noClubRootHeader.accountInitial says it is "allowed after own account record is loaded". That answers the design question; it doesn't decide FQ58 for the no-club case.
- **Evidence:** H01-loading-no-club and F01-loading-no-club: avatar [337,64,28,28] with B. FQ58 Default: "only the club's name and your own photo, and nothing else until the server answers".
- **Meanwhile and who acts:** Leave FQ58 open in QUESTIONS.md, noting Claude Design's answer. The app keeps showing the initial.

### F-17 (note, none, confirmed)

- **Where:** The app keeps handoff 3's placement (TabContent.loading: two-fifths down, 20 points from indicator to label).
- **Finding:** The loading shell moves up about 25-32 points against handoff 3, unexplained.
- **Evidence:** Frames 13 and 15: spinner centre at y332, label baseline at 370.66. Handoff 3 H01-loading: spinner centre at y357, label baseline at 403.
- **Meanwhile and who acts:** None now. Mention it in a later brief. The app keeps TabContent.loading's two-fifths placement.

### F-18 (note, none, confirmed)

- **Where:** The app uses the contract keys: vo.retryHome.hint, vo.retryFriends.hint, vo.retryAccount.hint, header.accountHint and handoff5.a11y.haveInvite.hint.
- **Finding:** screen-copy.json leaves several control hints empty that the contracts supply.
- **Evidence:** Hints are empty for Retry (frames 12, 14, 16), Account (frames 13-16, 21, 22, 28-30) and I have an invite (frames 21, 22, 28, 29). The contracts give "Load Home again.", "Open your account." and "Open an invitation link.".
- **Meanwhile and who acts:** None. The app uses the contract keys.

### F-19 (note, claude-design, confirmed)

- **Where:** The app keeps its A02-email: no back, SetupGap.field, 24 points to Send a code, secondaryText subtitle.
- **Finding:** The A02-email redraw (frame 23) is justified by the chevron answer. Two of its changes aren't explained.
- **Evidence:** Changes against handoff 1:
- The chevron at translate(16 65) is removed. Explained by IMPLEMENTATION.md section 2 and authForm.emailBackInB0 false. The app already has no back.
- The subtitle ink changed (F-05). Not explained.
- The field moved from 263-317 to 267-321, which is fieldLabelGap 8.
- Field to Send a code went from 26 to 22 points, also in frames 1 and 2. Not explained, and 22 is not on book p35's scale.
- Title and body moved down about 2 points.
- The schematic keyboard and status bar were restyled. No action.
- **Meanwhile and who acts:** None now.

### F-20 (should, claude-design, confirmed)

- **Where:** The app keeps A02-code's arrival state (empty field, Verify code unavailable) and handoff 1's layout.
- **Finding:** The A02-code redraw (frame 24) changes the frame's state, fixture and layout, with no answer behind any of it.
- **Evidence:** Changes against handoff 1:
- The field holds "529614" (it was the placeholder "Enter code"), and Verify code is available (it was unavailable). The arrival state is now drawn only by A02-code-resend.
- Label, field and Verify code moved up (F-06).
- The rows are left-aligned (F-06).
- The chevron moved from x16 to x20 and is marked aria-hidden.
- The keypad's delete key is gone (schematic).
IMPLEMENTATION.md explains none of these, and none is a six point.
- **Meanwhile and who acts:** Ask Claude Design to confirm or withdraw it in a later brief. The app keeps the arrival state and handoff 1's layout.

### F-21 (note, none, adjusted)

- **Where:** The app keeps its A02-code-error (with ’ and Verify code available, as today).
- **Finding:** The A02-code-error redraw (frame 25) was resent for a six point. Its only unexplained change is the code-screen layout already reported in F-06.
- **Evidence:** Changes against handoff 2:
- "couldn't" becomes "couldn’t": a six point.
- The error becomes one wrapped paragraph: natural wrapping.
- The icon goes from 17 points (scale 0.708) to 14 (scale 0.583), as sheet 17b draws it.
- The label moves from baseline 252 to 219.66 and the field from y263 to y235; the rows are left-aligned (F-06).
- The error border, the focus ring and the available Verify code are kept.
- **Meanwhile and who acts:** None beyond F-06.
- **Second reviewer:** The changes are as listed, but only the F-06 geometry is unexplained. The 14-point icon at x20 with text at x42 matches sheet 17b ("Icon 14"). The one-paragraph error is natural wrapping, and ’ is a six point. So this restates F-06 and needs no separate action. Downgraded to note.

### F-22 (should, claude-design, confirmed)

- **Where:** The app keeps subtitleGap Spacing.xxl (24) on A02-age, and adopts the 44-point footer with F-10.
- **Finding:** The A02-age redraw (frame 26), like frame 9, sets the body much further below the title than before, unexplained.
- **Evidence:** Changes against handoff 1:
- The exit (F-10): explained.
- The title fits on one line, x20-311.6: natural wrapping.
- The body's ink (F-05): not explained.
- The body baseline goes from 246 to 236.94 under a one-line title at 153.24, so the gap between their line boxes grows from about 26 to about 60 points: not explained.
- The button moves from 708-758 to 724-774: formFooterToSafeAreaBottom 44.
- **Meanwhile and who acts:** Ask Claude Design to confirm the gap in a later brief. The app keeps subtitleGap 24 and adopts the 44-point footer with F-10.

### F-23 (should, claude-design, adjusted)

- **Where:** The app keeps handoff 1's A03 layout, apart from F-10 and F-11.
- **Finding:** The A03-profile redraw (frame 27) is justified by the exit and focus answers. It also tightens two gaps and moves Add photo, Optional and the initial, none of which is explained.
- **Evidence:** Changes against handoff 1:
- Leave sign-in and the focused field with the keyboard up: explained (F-10, F-11).
- The body's ink (F-05).
- Add photo and Optional left-aligned, and B at 30.6 points sitting high in the circle (F-07).
- Helper to avatar: helper line box ends about 230, avatar starts at 251, so 21 (handoff 1: about 30).
- Optional to label: Optional ends about 384, label starts about 394, so 10 (handoff 1: about 22).
- Label to field is 8, which is fieldLabelGap.
- **Meanwhile and who acts:** Ask Claude Design in a later brief to confirm the helper-to-avatar and Optional-to-label gaps, with F-07. The app keeps handoff 1's A03 gaps, apart from F-10, F-11 and fieldLabelGap.
- **Second reviewer:** The label-to-field change is explained. On the delivery's line-box measure the label (baseline 404.66, box 394-412) now sits fieldLabelGap 8 above the field at 420; handoff 1 had about 4. The unexplained tightenings are elsewhere: helper to avatar goes from about 30 to 21, and Optional to the label from about 22 to 10. So 'Covered by F-07' is an incomplete action.

### F-24 (should, claude-design, adjusted)

- **Where:** The app keeps TabGap.homeActions (72) and homeDrafts (56), the body as one text, and the row geometry from handoffs 4 and 6. It adopts the header rectangles (F-14).
- **Finding:** The G06-no-club redraw (frame 28), carried into frames 21 and 22, tightens two gaps and changes the Private drafts row, without explanation.
- **Evidence:** Changes against handoff 4, on the delivery's line-box measure:
- The header (F-14).
- The title baseline goes from 174 to 158.24, which is contentStart 32.
- The body ink (F-05).
- body1 and body2 become two paragraphs at baselines 204.94 and 243.94, which is homeBodyToSecondary 16; title to body is homeTitleToBody 24. Nothing says so.
- Body to Create a club goes from about 67 points to 32 (Create a club moves from y321 to y285): not explained.
- The buttons go from 17 to 16 points apart: a six point.
- I have an invite to Private drafts goes from 54 to 32 (y438 to y492, then y401 to y433): not explained.
- In the Private drafts row the folder moves from x32 to x36, the text from x71 to x76, and the chevron shrinks from 20 to 18 points: not explained.
- The tab icons are redrawn as outlines (schematic).
- **Meanwhile and who acts:** Ask Claude Design to name these gaps in a later brief. The app keeps TabGap.homeActions and homeDrafts, the body as one text, and the row geometry from handoffs 4 and 6, and adopts the header rectangles (F-14).
- **Second reviewer:** Every listed change checks out against handoff 4's SVG: Create a club at y321 then y285, I have an invite at y388 then y351, Private drafts at y492 then y433, the folder at translate(32 515) then (36 459), the chevron at scale 0.833 then 0.75, the text at x71 then x76. But the 35.5 figure used Arimo's own descent. On the delivery's line-box measure body2 now ends at 253, 32 above Create a club (handoff 4: about 67). Title to body (24) and body1 to body2 (16) match the named homeTitleToBody and homeBodyToSecondary. The 32s are on the scale but not named for these places.

### F-25 (should, claude-design, adjusted)

- **Where:** The app keeps TabGap.friendsSection, emptyTitleToBody (32) and friendsActions (68), apart from F-15.
- **Finding:** The F01-no-club redraw (frame 29) tightens the empty state without explanation.
- **Evidence:** Changes against handoff 2, on the delivery's line-box measure:
- The header (F-14) and the page title baseline at 158.24 (F-15).
- The Private drafts row moves from y184 to y191, staying 24 under the title; the folder, text and chevron change as in F-24.
- The empty title fits on one line: natural wrapping.
- Empty title to line goes from about 34 points to 16: not explained.
- The line's ink (F-05).
- Line to Create a club goes from about 63 to 24 (Create a club from y492 to y415): not explained.
- **Meanwhile and who acts:** Ask Claude Design to name these gaps in a later brief. The app keeps TabGap.friendsSection, emptyTitleToBody and friendsActions, apart from F-15.
- **Second reviewer:** The changes are verified: the row rect moves from y184 to y191, Create a club from y492 to y415, and the folder, text and chevron change as in F-24. The 27.5 figure used Arimo's own descent. On the delivery's line-box measure the line ends at 391, 24 above Create a club (handoff 2: about 63), and the empty title ends at 329, 16 above the line (handoff 2: about 34). Title to Private drafts stays 24.

### FM-01 (should, claude-design, missed)

- **Where:** The app keeps the default frames' gaps at every text size, since named gaps don't scale with the text: SetupScroll's VStack holds the title, helper, avatar, Add photo, Optional, label and field with the same paddings at accessibility sizes. Frame 20 is recorded as a known difference.
- **Finding:** The largest-text frames 19 and 20 don't keep the default frames' gaps. Frame 20 has a hole of about 166 points between Optional and the name label, where frame 10 has 10. It shows as an empty band under the navigation bar, where the scroll content above the field should be.
- **Evidence:** A03-profile-empty-xl.svg (delivery's line-box measure; xlReference metadata 44/54):
- Add photo target [20,-100,353,83];
- "Optional" at baseline 16.08, line box -20 to 34;
- "Your name" label at baseline 236.08, line box 200 to 254; field at 262.
That leaves 166 points of empty content. In frame 10, Optional ends at 384 and the label starts at 394. The PNG shows nothing between the navigation bar (104) and the label (about 200).
A02-code-error-xl.svg:
- ".com" line box ends at 75; the label starts at 111, so 36 (frames 18 and 25: 6);
- the field ends at 262; the first error line box starts at 280, so 18 (frames 18 and 25: 8).
Neither IMPLEMENTATION.md nor the manifest gives larger gaps at accessibility sizes.
- **Meanwhile and who acts:** Note it in INVENTORY.md's known differences for A03-profile-empty-xl and A02-code-error-xl, and ask in a later brief for frame 20 again with continuous content.

### FM-02 (note, none, missed)

- **Where:** The app keeps secondaryText for "Sent to {email}", "Optional" and the Private drafts subtitle at every text size.
- **Finding:** In the clipped parts of the largest-text frames, lines that are secondaryText at the default size are drawn in primaryText. Only the SVG fills show it; the PNG viewport hides these lines.
- **Evidence:** A02-code-error-xl.svg: "Sent to", "ben@example" and ".com" are #182B25; frames 4-8, 24 and 25 draw "Sent to ben@example.com" #607067. A03-profile-empty-xl.svg: "Optional" is #182B25; frame 10 draws it #607067. G06-no-club-xl.svg: "Only you can" and "see these." are #182B25; frames 28 and 29 draw "Only you can see these." #607067, and the privateDraftsEntry contract gives subtitleInkToken secondaryText.
- **Meanwhile and who acts:** None now. Record it beside F-05.

## Item 17: the component sheet, the drop card and the receipt

*Reviewer's summary:* Item 17 is delivered in full. The handoff 6 part of the sheet is preserved element for element: all 9,645 SVG elements recur unchanged, and the handoff 7 part starts at y 9680. Every specimen 17a to 17g is drawn in light and dark, with largest-text versions of all nine drop shapes and of the receipt. The written answers confirm most Built readings: the FQ91 words, "Processing · Not added yet" with no indicator, "This drop is no longer available" with no full stop (the build has none either), the folded card's spoken order, the extraLarge rail/list breakpoint, the fixed 12-point cover star and the symbol scaling.

Two musts, both going to Claude Design:
- D-02: the collecting card's new status template "Opens {weekday}, {monthDay} · {time}" fixes the US date order and loses the year slot, against FQ44. The app keeps {fullDate}.
- D-11: the highlight specimens break FQ41's cover colours and put Debby's portrait on Deborah-Anne, against the brief's content rule.

Changes the ios lane must now build (who: app):
- D-03: the author's Highlight moves to its own line, 12 below the caption.
- D-04: the revealed item becomes separate accessibility elements with a "Copy caption" action.
- D-05: the receipt's disc and check grow with row text, which reverses the fixed 28/12 built under handoff 4's avatarMarks policy. The receipt also gets a hint, a single announcement after commit, and the cutoff condition for its action (B4).
- D-07: the upload caption takes primaryText, and its date line reads "November 13 · Opens at 7 AM".
- D-09: the highlight row's avatar goes from 36 to 28, its gaps from 16 to 12, and the tile star moves to x 55.
- D-12: the photo label's padding and its star gap stay fixed while the star grows.
- D-13: the busy indicator moves to the leading side at 16 points, and the button's value becomes "In progress".
- D-14: a person glyph replaces the avatar when the name gives no readable initial.
- D-15: the no-club header stacks at every accessibility size, with + Add leading, and takes the new default rectangles.
- D-16: the cover's VoiceOver labels begin with the visible words.
- D-19: the gap above the folded card's sender row goes from 24 to 16.

For Claude Design: the receipt's and the highlight row's drawings contradict the delivery's own written values (D-06, D-10). Also the draft row is drawn without a chevron (D-08), plus four smaller notes.

For the founder: no contract field says when a photo is a text screenshot (D-17), and the delivery omits the B6 controls until B6 where FQ85 says to show them and do nothing (D-18).


### D-01 (note, none, confirmed)

- **Where:** brand-components, top 9680 points
- **Finding:** Nothing from handoff 6's sheet is removed or changed. The only differences are a duplicate <title>/<desc> at the root, and the PNG rendering the sheet's transparent band as black.
- **Evidence:** - SVG: all handoff 6 elements recur in order with identical tags, attributes and text. The root grows from 9680 to 25776 and gains a second <title>/<desc> pair.
- PNG at sheet y 7000, 8000, 9000 and 9600: handoff 7 is (0,0,0); handoff 6 is (255,255,255,0). The gutter around the handoff 6 light/dark panels is now black.
- **Meanwhile and who acts:** None. Crop that band from the SVG, or composite the PNG on canvas.

### D-02 (must, claude-design, confirmed)

- **Where:** Drop · collecting (copy key handoff7.drop.collecting.opening)
- **Finding:** The replacement status template fixes the US weekday-comma-month-day order and has no slot for a year. Built as written, it breaks FQ44 for other regions and for a card dated in another year.
- **Evidence:** - handoff7.drop.collecting.opening = "Opens {weekday}, {monthDay} · {time}", replacing handoff5.card.status = "Opens {fullDate} · {openTime}".
- handoff5.collectingCardStatus.fields: "wide weekday + month + day, with year when needed". handoff7.replaces.dropShapes: "H5 status preserved".
- FQ44 Default: "the phone's own region and clock settings, through iOS's date templates"; a visible date carries its year "when it falls outside the current year".
- handoff7.drop.opening and receipt.opening ("{monthDay} · Opens at {time}") have no year slot either.
- **Meanwhile and who acts:** The app keeps card.status "Opens %1$@ · %2$@" with DateLabels.fullDate(includingYear:) in FoldedCard.swift, and dayMonth(includingYear:) for the rows and the receipt. It treats the new template as the en-US output of {fullDate}. The next brief asks Claude Design to restore {fullDate} and a {monthDay} that can carry the year.

### D-03 (should, app, confirmed)

- **Where:** Drop · collecting, author’s Highlight
- **Finding:** The author's Highlight goes on its own line after the caption, 12 points below it. The build puts it at the end of the status line.
- **Evidence:** - Specimen: caption line ends about 92; star box x38 to 50, y104 to 116; "Highlight" at x54, baseline 113.84; sender avatar y134 to 162.
- handoff7.dropShapes.collectingCard.ownHighlight: "star.fill,12, gap4, Highlight on a separate line below caption with12 clear gap". Sheet note: "separate line below caption".
- Built: FoldedCard.swift places highlightTag after a Spacer at the trailing end of the lock and status HStack.
- **Meanwhile and who acts:** Take highlightTag out of the status ViewThatFits and place it after the caption in the top VStack, 12 points below the caption. The status line keeps only the lock and its text. The spoken order is already confirmed. Re-snapshot the Lab's cards.

### D-04 (should, app, confirmed)

- **Where:** Drop · revealed
- **Finding:** The revealed item becomes separate accessibility elements, with a Copy caption action. The build reads it as one element, so the caption can't be selected with VoiceOver or Switch Control.
- **Evidence:** - revealedItem.a11y: "Contain children, not a single combined element. Sender/name; More options; selectable caption with native selection + Copy caption action; photo (Photo, Highlight if applicable)… Before B6 omit future controls rather than disabled placeholders."
- Keys: vo.drop.photo "Photo.", vo.drop.photoHighlight "Photo. Highlight.", vo.drop.captionCopy "Copy caption".
- Built: RevealedDropView.swift, .accessibilityElement(children: .ignore) with one spoken label; DropCardTests line 163 pins it.
- **Meanwhile and who acts:** Make three elements: the sender's name, with the avatar hidden; the caption, keeping .textSelection, with an accessibility action "Copy caption" that copies the text verbatim; the photograph, read as "Photo" or "Photo. Highlight.", with PhotoHighlightLabel folded into it. Leave More options, React, Comment and Save out until B6. Update the test for the design change.

### D-05 (should, app, confirmed)

- **Where:** Compact receipt (all four specimens)
- **Finding:** The receipt's disc and check grow with row text. The delivery also adds a hint on Make my highlight, a single announcement after commit, and a server permission (before the cutoff) for showing the action.
- **Evidence:** - compactReceipt.checkDisc: default 28, scalesWith "row". IMPLEMENTATION: "default28 and grows with row text". AX5 specimens: disc rect x36 y28 w64, check scale 1.4933.
- vo.receipt.highlightHint: "Choose this drop as your highlight for {person}’s {weekday}."
- compactReceipt.announce: "One polite receipt summary after commit… Do not announce more than once on idempotent replay/re-render."
- compactReceipt.highlightAction: "Only before cutoff, while own drop is not already selected and server permits change."
- Built: Metrics.swift receiptDisc 28 and receiptCheck 12 "keep their size at every text size"; CompactReceipt.swift offersHighlight = !drop.isHighlight, no hint, no announcement.
- **Meanwhile and who acts:** In CompactReceipt.swift, scale the disc and check with @ScaledMetric relative to row from 28 and 12, keeping the disc's top level with the title's; add the hint. At B4, post vo.receipt once per commit and not on a replay, and add the server's permission to change the highlight to AddedDrop. Update DropCardTests' receipt test and INVENTORY.md's known difference.

### D-06 (should, claude-design, adjusted)

- **Where:** Compact receipt · action / no action / largest text
- **Finding:** The drawn receipts don't match the written insets and scaling.
- The top inset is drawn 16, not the written 12.
- With the action, the drawing keeps a full 12 below the 44-point target. The written rule only allows the target to stand in, so the default bottom is left open, and the words end about 28 points above the border.
- At AX5 the disc is drawn at 64, not at row's ratio.
- **Evidence:** - Default with action: border y12 to 128; disc y28 to 56; title baseline 41.94; opening baseline 64.66; "Make my highlight" baseline 96.12, so a target at about 72 to 116 plus 12 to the border.
- No action: border y12 to 84; disc top at 28.
- Sheet note: "horizontal inset 16, vertical 12". actionInsets: "Action target can consume bottom inset at default". IMPLEMENTATION: "it can stand in for bottom padding".
- 2.1 F02-added ends the action's ink about 17 above the border, the Lab about 13.
- AX5: disc 64 beside a 53-point title; 28 × 53/17 is about 87.
- **Meanwhile and who acts:** The app keeps the written contract, as built: 12 at the top, and the target standing in at the bottom. The disc scales with row (D-05). The next brief asks Claude Design to redraw or confirm the insets and the disc's AX5 size.
- **Second reviewer:** Measurements hold: border y12 to 128, disc y28 to 56, title baseline 41.94 (line top about 28.7), so the top inset is 16 while the sheet's own note and compactReceipt.insetVertical say 12. The bottom is not a contradiction: actionInsets says the target "can" consume the bottom inset, which permits but does not require it; the drawing keeps 12 below the target (72 to 116), so the ink ends about 28 above the border. The AX5 disc is 64 where row's ratio gives about 87.

### D-07 (should, app, confirmed)

- **Where:** Drop · pending / uploading / processing / failed
- **Finding:** The upload rows draw the caption in primaryText and the date line as "{monthDay} · Opens at {time}". The build uses secondaryText and "November 13 · 7 AM". The uploading bar is drawn with 12 below it, where the build has 8.
- **Evidence:** - Caption fill #182B25 / #F7F8F2 at 13 points in pending, uploading, processing and failed; draft note #607067; 2.1 C07-uploading caption about #565B57.
- Date line "November 13 · Opens at 7 AM", key handoff7.drop.opening.
- Bar y90 to 94; 8 above, 12 below; track #DCE2DA (separator).
- Built: UploadRow caption .secondaryLine(); TadayoDesign Localizable.xcstrings drop.when "%1$@ · %2$@"; ProgressView .padding(.vertical, 4) in a VStack with spacing 4.
- **Meanwhile and who acts:** In UploadRow: caption in Palette.primaryText, keeping the metadata role; drop.when becomes "%1$@ · Opens at %2$@"; 12 below the bar. Keep the system bar's own track (T45). Ask in the next brief whether the caption's primaryText, unlike the draft note's ink and 2.1's, is intended.

### D-08 (should, claude-design, confirmed)

- **Where:** Drop · draft (and its largest-text specimen)
- **Finding:** The draft row is drawn without the chevron that 2.1's C05-drafts and the build show, and no written answer says whether it is removed.
- **Evidence:** - Draft specimens: image plus "Choose a friend later", "He sat still for exactly one photo." and "Not shared with anyone"; nothing after.
- 2.1 C05-drafts: chevron at the trailing edge.
- Built: DraftRow trailing chevron.right (Size.draftsChevron 13 in a 20-point box).
- IMPLEMENTATION and dropShapes.thumbnailRow are silent.
- **Meanwhile and who acts:** The app keeps the chevron, since the row opens the draft. The next brief asks whether the thumbnail row drops it everywhere, or only in a component specimen.

### D-09 (should, app, confirmed)

- **Where:** Highlight covers and expanded row
- **Finding:** The highlight cover needs geometry changes: the row's avatar is 28 (built 36), the avatar-to-label and label-to-star gaps are 12 (built 16), and the tile star's origin is 55 from the left (built about 56).
- **Evidence:** - highlightCover.row.avatar 28; row specimen avatar x44 to 72, label at x84 (gap 12).
- star.rowOrigin: "Trailing24 inset, first-line aligned, reserve12+12 before star".
- star.tileOrigin [55, 11]; tile star box x75 to 87 in a tile at x20 to 111.
- Built: HighlightCover.swift row uses Avatar(size: .row) and HStack spacing Spacing.l; tile star .padding(.trailing, Size.fold + Spacing.xs).
- **Meanwhile and who acts:** Row: avatar .card (28), 12 from avatar to label, 12 from label to star. Tile star: trailing padding 24 with a 12-point frame, so its origin is 55.

### D-10 (should, claude-design, adjusted)

- **Where:** Highlight covers and expanded row (drawing)
- **Finding:** The highlight specimen contradicts the delivery's own written values:
- the corners aren't cut, and Ben's tile has no fold;
- the row is 110 high, neither the 96 minimum nor content plus padding;
- the row's avatar isn't level with the label's first line;
- the row's star sits 32 from the trailing edge, not 24.
- **Evidence:** - Tiles: rect rx=16 plus path "M93 12 V30 H111"; Ben's tile at x123 has no fold path. Handoff 6: "M48,415 H105 L123,433 …" and "M168,415 H225 L243,433 …" with fold lines on both.
- Row: rect y108 to 218 with one 20-point line; highlightCover.row.minimumHeight 96, verticalPadding 16.
- Row avatar y132 to 160 (centre 146); label baseline 144.40, cap centre about 137.
- Row star x329 to 341 against "Trailing24 inset".
- **Meanwhile and who acts:** The app builds the written values, which it already does: FoldedCorner on every tile and row, first-line alignment, trailing 24, minimum 96, padding 16. The next brief asks for a corrected specimen.
- **Second reviewer:** Most points hold: tiles are rect rx=16 with the fold line "M93 12 V30 H111" drawn over a rounded corner, Ben's tile has no fold, and handoff 6's tiles were cut-corner paths with folds. The row is 110 high (y108 to 218) where content plus 2 × 16 is about 60, so the 96 minimum should apply. The row avatar's centre is 146 against a first-line cap centre of about 137. The row star spans x329 to 341, 32 from the edge. The point about the row being drawn at the default size is dropped: handoff 6 drew the row at the role's base size too, which is a normal specimen convention.

### D-11 (must, claude-design, confirmed)

- **Where:** Highlight covers and expanded row (fixtures)
- **Finding:** The highlight specimens give Debby's pick Ben's cover colour and Ben the second colour, against FQ41's roster-slot rule. The Deborah-Anne row uses Debby's portrait, against the brief's content rule.
- **Evidence:** - Debby tile #EEDFC4 (cover1); Ben tile #E1E5F6 (cover2); row #EEDFC4. Ben's collecting card at sheet y14028 is #EEDFC4. Handoff 6's Debby's pick tile: #DCE9EB (cover5).
- FQ41 Default: founding members take colours in roster order (Ben 1, Maya 2, Sam 4, Debby 5).
- Deborah-Anne row avatar image matches the Debby tile portrait. Handoff 6: circle with "D" beside "Deborah-Anne’s pick".
- Brief Content: "the portraits of Ben, Maya and Debby, with initials for everyone else".
- **Meanwhile and who acts:** The app keeps Palette.cover(slot:) (Debby cover5) and FixtureCast.deborahAnne with no photo. The next brief asks Claude Design to redraw the specimen.

### D-12 (should, app, confirmed)

- **Where:** Drop · revealed · largest text; Drop · collecting, author · largest text
- **Finding:** At the largest text size the delivery keeps the photo label's padding and both star-to-word gaps fixed, and only the star and the word grow. The build scales the padding and the gaps too.
- **Evidence:** - AX5 photo label: rect x32 y462 w233.3 h60; star box 40 from x40; word at x84. Padding 8 and 6, gap 4, as at the default size.
- AX5 card tag: star box x38 to 74, word at x78 (gap 4).
- handoff7 revealedItem.photoHighlightLabel.scales: "Star scales with photoLabel, block height intrinsic".
- Built: PhotoHighlightLabel @ScaledMetric starGap, vertical, horizontal (about 14, 22 and 29 at AX5); FoldedCard @ScaledMetric starGap.
- **Meanwhile and who acts:** Keep the padding at 6 and 8 and the gaps at 4, and scale only the star, in RevealedDropView.swift (PhotoHighlightLabel) and FoldedCard.swift. Re-run the 320-point AX5 Lab snapshots.

### D-13 (should, app, confirmed)

- **Where:** Primary action · busy
- **Finding:** The busy indicator goes on the leading side at 16 points, in fixed 24-point slots, and moves to its own centred row when large text doesn't fit. The button's value becomes "In progress". The build puts the indicator on the trailing side at the system size, growing with the text, and sets no value.
- **Evidence:** - Specimen: indicator centre (133.38, 37); label from x149.38, centred at 196.5.
- busyPrimary.layout: "reserve symmetric leading/trailing 24-point accessory slots. Spinner sits 8 before measured label. At large text if that group cannot fit, spinner moves to centered own row"; valueKey handoff7.vo.busy.value "In progress".
- Built: PrimaryButton.swift leading indicator.hidden(), trailing indicator.opacity(isBusy ? 1 : 0).accessibilityHidden(!isBusy); no accessibilityValue.
- **Meanwhile and who acts:** Put the indicator on the leading side at 16 points, with fixed 24-point slots. At large sizes, move it to a reserved centred row in both the idle and busy states. Hide the indicator from VoiceOver and set .accessibilityValue("In progress") while busy.

### D-14 (should, app, confirmed)

- **Where:** Avatar with no readable initial
- **Finding:** When the name gives no readable initial, the avatar shows an outlined person glyph. The build shows any first character, emoji and symbols included, or a blank disc.
- **Evidence:** - avatarWithoutInitial: glyph "person (SF Symbol outline)", glyphSizeRatio 0.56, sizes [68, 36, 28, 18]; canvas avatarCanvas/onAvatarCanvas; covers avatarOnCover/onAvatarOnCover.
- initialRule: "a Unicode letter in any script or a decimal digit… Emoji, symbols, punctuation and unsupported/missing glyphs use person fallback".
- Built: Avatar.initial(of:) in Avatar.swift; no Image(systemName: "person") anywhere.
- **Meanwhile and who acts:** In Avatar.swift, show Image(systemName: "person") at 0.56 × the size when the first grapheme isn't a letter or a decimal digit, on the same fills. Add unit tests for a letter, a digit, an emoji, a symbol, a combining mark and a blank name.

### D-15 (should, app, confirmed)

- **Where:** No-club header · largest text (and its default rectangles)
- **Finding:** The no-club header stacks at every accessibility size, with + Add at the leading inset and Account at the trailing edge, and takes new default rectangles. The build stacks only when the row overflows, puts both actions on the trailing side, and keeps handoffs 5 and 6's positions.
- **Evidence:** - Sheet AX5 specimen: wordmark at (20, 20); "+ Add" 49-point at x20; avatar rect x337.
- largest: addTarget [20,104,249,76], accountTarget [329,120,44,44]. default: addTarget [241,56,80,44], accountTarget [329,56,44,44], avatar [337,64,28,28].
- screen-copy G06-no-club, F01-no-club, H01-loading-no-club: + Add [241,56,80,44], Account [329,56,44,44].
- Built: NoClubHeader.swift ViewThatFits; stacked actions .frame(maxWidth: .infinity, alignment: .trailing); .padding(.trailing, Spacing.inset - overhang).
- **Meanwhile and who acts:** Stack when dynamicTypeSize.isAccessibilitySize. In the stacked row, + Add goes at the leading inset and Account at the trailing edge. Use the delivery's default rectangles: Account 329 to 373 with the avatar at 337 to 365, + Add's target 80 wide and 8 before Account. Re-snapshot G06, F01 and M01 with no club.

### D-16 (should, app, confirmed)

- **Where:** Highlight covers (labels and VoiceOver)
- **Finding:** A contributor's cover is labelled with the name alone, and VoiceOver reads the visible words. The Lab labels a contributor "Maya’s highlight", and every cover's VoiceOver label is "Open {name}’s highlight", which doesn't begin with the visible words.
- **Evidence:** - Delivery: tile "Ben" (highlight.contributor "{person}"); vo.highlight.pick "{person}’s pick"; vo.highlight.own "Your pick".
- 2.1 H01-open: contributors "Maya", "Sam", "Ben".
- Built: LabView.swift label "Maya’s highlight"; accessibilityName "Open \(person.name)’s highlight".
- Book p8: "A highlight cover itself has the accessible action Open Maya’s highlight."
- **Meanwhile and who acts:** Set each cover's label to its visible words ("Debby’s pick", "Your pick", "Maya") and carry book p8's "Open Maya’s highlight" as the hint. Change the Lab's contributor label to "Maya". Ask Claude Design to confirm in the next brief.

### D-17 (should, founder, adjusted)

- **Where:** Drop · revealed (feed aspect)
- **Finding:** The delivery shows a text screenshot aspect-fit from an "explicit media kind", but no contract field carries such a kind, and no source says who marks a photo as a screenshot.
- **Evidence:** - revealedItem.photoAspect: "A text screenshot uses aspect-fit within same neutral canvas viewport… Explicit media kind from authorized revealed content only, never pre-reveal dimensions."
- Built: DropCard.swift HiddenDrop.MediaClass has only .photo; RevealedDropView fills every photo (scaledToFill).
- Book p27: a text screenshot "is presented with its complete frame… without a permanent feed crop"; book p34: "Portrait, landscape and text screenshot fixtures have distinct examples."
- **Meanwhile and who acts:** The app keeps aspect-fill for every photo; revealed items reach screens in B5. Add an FQ before B5: does the sender mark a screenshot when adding it, or does the server classify it after the reveal (T10)? Default meanwhile: aspect-fill. Read "neutral canvas" as the canvas token, and confirm it in the B5 brief.
- **Second reviewer:** The core gap holds: revealedItem.photoAspect relies on an "Explicit media kind" for a text screenshot, and no contract or spec field has one (HiddenDrop.MediaClass has only photo; spec 14's class is photo or video). Book p27 and p34 require screenshots to show uncropped, so the app must learn the kind somehow, which is a data decision. The claim that the viewport's fill isn't named is weak: the contract says "same neutral canvas viewport", which most likely names the canvas token.

### D-18 (note, founder, adjusted)

- **Where:** Drop · revealed (B6 controls)
- **Finding:** The delivery says to omit the revealed item's B6 controls until B6. FQ85 covers only B0, so it doesn't settle what B5, where the revealed item first ships, should show. The sheet draws only the saved bookmark and doesn't mark the controls as B6.
- **Evidence:** - IMPLEMENTATION: "Before B6 omit these future controls from the B0 product"; revealedItem.a11y: "Before B6 omit future controls rather than disabled placeholders".
- FQ85: "What a control for a later stage does in B0"; the answer: drawn as designed and does nothing yet.
- Brief 17e: "the ··· control and the actions come in a later stage, B6".
- Specimen: ···, heart, comment bubble and a filled bookmark (#284CDB); no unsaved state.
- **Meanwhile and who acts:** B0 is unaffected: the Lab omits them, as built. Before B5, ask the founder whether B5 shows the B6 controls doing nothing (as FQ85 does in B0) or omits them. Record them in INVENTORY.md as B6, and ask the B6 brief for the unsaved bookmark.
- **Second reviewer:** The delivery does say to omit the B6 controls before B6, and the specimen draws ···, heart, comment and a filled bookmark with no B6 marking. But FQ85 is scoped to B0 ("What a control for a later stage does in B0") and lists specific B0 controls, and the brief itself told Claude Design the ··· control and actions come in B6 and aren't built now. So there is no conflict with FQ85 today; the open question is what B5 shows, when the revealed item first ships.

### D-19 (should, app, confirmed)

- **Where:** Drop · collecting, another member / author’s Highlight
- **Finding:** The delivery puts the sender row 16 below the block above it on both cards. The build's minimum is 24. At the 151-point minimum, the delivery also leaves the spare space below the sender, where handoff 6's sheet and the build pin the sender 18 above the card's bottom edge.
- **Evidence:** - Maya's card: y12 to 163; caption ends about 92; avatar 108 to 136; 27 to the bottom edge.
- Ben's card: y12 to 180; Highlight line ends about 118; avatar 134 to 162.
- Handoff 6 top card: 215 to 366; avatar 320 to 348.
- handoff7.replaces.dropShapes: "H4 collecting geometry and H5 status preserved".
- Built: PinnedFooterLayout spacing Spacing.xxl (24). With D-03 applied, Ben's card would be 176 high against the drawn 168.
- **Meanwhile and who acts:** Set PinnedFooterLayout's spacing to Spacing.l (16). Keep the sender pinned at the minimum height, as handoff 6 drew it, and ask Claude Design to confirm.

### D-20 (note, claude-design, confirmed)

- **Where:** Compact receipt (placement)
- **Finding:** The delivery places the receipt only on the upcoming day, below its header, on return from the composer. That doesn't cover a global Add started from Home, or the share extension.
- **Evidence:** - compactReceipt.scope: "on return to the intended upcoming occurrence, directly below its header/context and before collecting cards".
- Book p15: "The compact receipt appears in the originating context". Book p36: "A repeated receipt returns to the originating context."
- **Meanwhile and who acts:** At B4, use the delivery's placement on F02 and follow book p15 elsewhere. Ask in the B4 brief where it goes on Home and in the share extension.

### D-21 (note, claude-design, confirmed)

- **Where:** Drop · failed / Drop · pending
- **Finding:** The failed row adds its own Retry, while 2.1's C07-failed screen already has a primary Retry below the row. Pending's words are new.
- **Evidence:** - Failed specimen: "Retry" textAction at baseline 136.12 inside the row.
- 2.1 C07-failed: row "Not added"; primary Retry and "Save as draft" below.
- New: handoff7.drop.pending "Pending on this iPhone · Not added yet"; vo.drop.failed ends "Not added.".
- **Meanwhile and who acts:** At B4, show one Retry and add the strings. Ask the B4 brief whether the row's Retry replaces the screen's button.

### D-22 (note, claude-design, confirmed)

- **Where:** Field · focused with invalid code (17b)
- **Finding:** The gap between the field and its error is drawn 8, on the sheet and in A02-code-error and its dark version, where the delivery's own spacing says 12.
- **Evidence:** - Sheet: field y38 to 92; error line about 100 to 118 (baseline 110.66, icon from y102).
- A02-code-error: field bottom 289; error baseline 307.66.
- handoff7.spacing.fieldErrorGap = 12.
- **Meanwhile and who acts:** The app builds the named 12. Ask which is right in the next brief.

### D-23 (note, claude-design, adjusted)

- **Where:** Lab vs handoff 7 specimens (dates)
- **Finding:** Handoff 7's drop specimens leave out the year that handoff 6's "standalone specimen" rule gives them. The Lab follows the rule, so a side-by-side comparison will differ by ", 2026".
- **Evidence:** - handoff6 travellingRows.targetYear: "include year if outside contextual current year, crossing a year, no clear year context, or standalone specimen".
- Handoff 6 sheet: "Opens Friday, November 13, 2026 · 7 AM". Handoff 7: "Opens Friday, November 13 · 7 AM" and "November 13 · Opens at 7 AM".
- Built: FixtureCast.collectingDay includingYear: true; collectingDayThisYear exists without it.
- **Meanwhile and who acts:** Compare against FixtureCast.collectingDayThisYear, or add those states to the Lab. No product change. The next brief asks whether the sheet's specimens follow the standalone-specimen rule.
- **Second reviewer:** The difference is real (FixtureCast.collectingDay has includingYear: true; handoff 7 draws no year). Its cause is in the delivery: handoff 6's preserved targetYear rule includes the year for a "standalone specimen", and FQ44's Default includes it "when nothing around it sets the year". Handoff 6's sheet drew "Opens Friday, November 13, 2026 · 7 AM"; handoff 7's specimens drop the year without saying why. The Lab follows the rule.

### D-24 (note, claude-design, confirmed)

- **Where:** Collecting and revealed, largest text (avatar alignment)
- **Finding:** At AX5 the delivery draws the 28-point avatar near the top of the name's line, about 14 points above the first line's centre, where the build centres it on the first line. No written rule covers these two components.
- **Evidence:** - Collecting AX5: avatar y494 to 522 (centre 508); "Maya" baseline 540.46, cap centre about 521.5.
- Revealed AX5: avatar centre 26; "Maya" baseline 58.46, cap centre about 39.5.
- Built: HStack(alignment: .firstLineCenter) in FoldedCard.swift and RevealedDropView.swift.
- **Meanwhile and who acts:** Keep first-line centring. Ask Claude Design to confirm.

### D-25 (note, app, confirmed)

- **Where:** copy-contracts handoff7 (drop keys)
- **Finding:** One new key duplicates an existing copy key without naming it, and one replacement points at a component-contracts path instead of the copy key.
- **Evidence:** - handoff7.drop.collecting.authorSelf "{author} · You" duplicates handoff5.calendar.person.self "{personName} · You".
- handoff7.replaces.drop.highlight = "photoHighlightLabel.word" (component-contracts), not copy key handoff4.highlight.label "Highlight", which the build's highlight.label uses.
- **Meanwhile and who acts:** Keep the built keys (person.self, highlight.label), whose strings are identical, and record the mapping in the strings' comments.

### DM-01 (should, claude-design, missed)

- **Where:** Drop · collecting with no caption (blank-caption card, spoken label)
- **Finding:** The delivery's spoken rule for the folded card leaves out a blank caption "without placeholder". Book p13 gives a blank-caption card the visible words "Photo for Debby", and the build shows and reads them. The delivery draws no blank-caption card, so its rule either drops a visible line from VoiceOver or drops book p13's visible words, and it doesn't say which.
- **Evidence:** - handoff7.dropShapes.collectingCard.a11y: "Combined nonauthor card in author/caption/opening/hidden order… Omit blank caption without placeholder."
- IMPLEMENTATION: "Empty captions omit the caption clause, not a generated placeholder."
- Book p13: "Blank captions use neutral Photo for Debby copy and smaller text."
- Built: FoldedCard.swift shows card.blank "Photo for %@" in body and speaks it; DropCardTests.testAHiddenDropWithNoCaptionNamesTheStar expects "Sam. Photo for Debby. Opens…".
- FQ91 Default (c): a state reads its visible words in order.
- **Meanwhile and who acts:** The app keeps book p13's visible "Photo for Debby" and keeps reading it, as built and tested. The B4 brief, where the blank-caption card belongs, asks Claude Design to draw it and to say whether VoiceOver reads its neutral line.

## Written asks and the Return rules

*Reviewer's summary:* Lens: the written asks of handoff 7, covering every item except 17, plus the Questions and the Return paragraph. The delivery answers every ask, in IMPLEMENTATION.md, copy-contracts.json and component-contracts.json. All 16 requested states and the 5 dark and large-text frames are present. Every string drawn on A02, A03 and the no-club tabs has a handoff7 key with ’. No handoff7 copy or component entry has a fixture written into it. Every key named in handoff7.replaces exists in the earlier files. Each component replacement states its scope. Every control is at least 44 pt, and every VoiceOver label begins with its visible words.

Claude Design confirmed every Default the brief stated: FQ86, FQ89, FQ90 (including "This version of Tadayo can’t show clubs yet."), FQ70 and FQ69 (Leave sign-in, with no confirmation). It also answered the FQ58 question (Ben's initial may show once the account record is in). These confirmations don't answer the founder's questions, so the Defaults stand. It confirmed these app readings: no chevron on A02-email in B0; Verify stays busy until the account record arrives; Change email address and Send a new code are inactive during a verify; the no-club header is content that scrolls. It corrected these readings: global-launch is no longer the static launch screen but a spinner with "Loading your account…" or "Leaving sign-in…"; A03 is focused on arrival; an over-long name gets a line; the busy indicator sits 8 pt before the centred label; resend failures get their own block; A02-age and A03 get a leading Leave sign-in.

There are 16 findings, none must. They fall into three groups.
- Inconsistencies inside the delivery: frames 4 and 7 draw Back active while the text says it is unavailable; "Verify code pinned above keyboard" doesn't match the default A02-code frames; G06-no-club-xl drops "Create a club or open an invitation."; announcementPolicy's "Full keys begin vo.failure." points at line-only keys; it claims runtime VoiceOver keys that don't exist; and screen-copy.json leaves out the hints the contracts give.
- Changes nobody announced: the Memories boundary line becomes "after you joined", with no replaces entry; and the redraws change ink and alignment (supporting lines from secondaryText to primaryText, text actions from centred to leading), with nothing in writing.
- Gaps: no frame or form for global-launch or A02-email-signed-out; the name-refused line doesn't cover length or name the action.

The rest are changes the ios lane must make: busy and in-flight states; resend failures and announcements; A02-age and A03 exit, focus and lines; header geometry and the status-bar band; Retry hints.


### W-01 (should, claude-design, confirmed)

- **Where:** A02-code-verifying (frame 4), A02-code-resending (frame 7)
- **Finding:** Both in-flight frames draw the Back chevron active, in action ink, and screen-copy marks it enabled while Change email address is disabled. The frames contradict the written rule they illustrate.
- **Evidence:** screen-copy.json A02-code-verifying: {"label": "Back", "rect": [16,55,44,44], "enabled": true} next to {"label": "Change email address", ..., "enabled": false}. A02-code-resending has the same pair. IMPLEMENTATION §2: "Those actions are unavailable while verification/resend is in flight."
- **Meanwhile and who acts:** The app keeps what it builds. CodeScreen hides Back while a verify or resend runs, which matches the written rule. The ios thread records that frames 4 and 7 differ, and a later brief asks Claude Design to correct them.

### W-02 (should, app, confirmed)

- **Where:** A02-code (frames 4 to 8, 18, 24, 25) vs A02-code-error-xl (frame 19)
- **Finding:** At the default size every A02-code frame draws Verify code in the content flow, 162 pt above the keyboard, with the resend row and Change email address below it. Only the AX5 frame pins it 12 pt above the keyboard. The written rule says it is pinned at every size, and nothing says when it switches.
- **Evidence:** A02-code-verifying: Verify [20,349,353,50]; Send a new code row [20,407,353,44]; Change email address [20,451,353,44]; keyboard top y561. A02-code-error-xl: Verify [20,464,353,85], bottom 549. A03-profile-empty: Continue [20,499,353,50], bottom 549.
- **Meanwhile and who acts:** Meanwhile the app keeps Verify in the flow at the default size, as frames 4 to 8, 18, 24 and 25 draw it. It pins Verify 12 pt above the keyboard once the in-flow button would sit under the keyboard, as frame 19 draws (a change: CodeScreen never pins today). The ios thread records that threshold as its own reading, and the next brief asks Claude Design for the rule.

### W-03 (should, claude-design, confirmed)

- **Where:** G06-no-club-xl (frame 22)
- **Finding:** The AX5 frame drops G06's second line, "Create a club or open an invitation.". Both other G06 frames in this delivery keep it.
- **Evidence:** screen-copy G06-no-club-xl visibleStrings: 'Start your club.', 'A private place for two to six people.', 'Create a club', 'I have an invite', ... with no 'Create a club or open an invitation.'. Create a club rect [20,585,353,85]. PDF p3: "nothing shrinks or disappears from the document order".
- **Meanwhile and who acts:** The app keeps both lines at every size and records frame 22's omission in INVENTORY.md's known differences. A later brief asks for the frame to be corrected.

### W-04 (should, claude-design, confirmed)

- **Where:** M01-no-club (redraw 30)
- **Finding:** The M01 redraw changes Memories' boundary line, and handoff7 does not name the earlier key it replaces. The new past tense speaks of a membership that Ben, who has no club, doesn't have. No written answer mentions the change.
- **Evidence:** handoff7.noClub.memories.body: "Days shared after you joined will appear here after they open." Against historyBoundary.display: "Days shared after you join a club will appear here after they open."
- **Meanwhile and who acts:** The app keeps historyBoundary.display (memories.noClub.body, as built), because the earlier key isn't replaced and its wording is true with no club. The ios thread records the difference, and a later brief asks whether the change was meant.

### W-05 (should, app, adjusted)

- **Where:** The eight redraws (A02-email, A02-code, A02-code-error, A02-age, A03-profile, G06-no-club, F01-no-club, M01-no-club) and the new frames 1 to 16
- **Finding:** The redraws and new frames make design changes that no written answer names. (a) Body lines change from secondaryText to primaryText: A02-email's "We’ll send a six-digit code to sign in.", A02-age's and A03's subtitles, G06's two lines, the F01 and M01 empty-state lines, and the failure lines on frames 12, 14 and 16. A02-code's "Sent to {email}", the helper, the wait sentence, Optional and the loading labels stay secondaryText. (b) Text actions and the resend row move from centred to leading: A02-code's wait sentence, Send a new code, Change email address, A03's Add photo and Optional (the avatar stays centred), and M01's Go to Home. (c) G06's two lines become two paragraphs.
- **Evidence:** Pixel samples: G06 lines, handoff 4 #607067 vs the redraw #182B25. A02-email subtitle #607067 → #182B25; A02-age body #607067 → #182B25; A03 subtitle #182B25 on the redraw. A02-code "Sent to" line #607067 on every A02-code frame. Each redraw's manifest note says only "B0 navigation, recovery spacing, exit or shared no-club header correction; scope in IMPLEMENTATION.md".
- **Meanwhile and who acts:** The app follows the frames, because these are design matters that break no rule. SetupHeading gets a primaryText subtitle on A02-email, A02-age, A03 and RootFailure, but A02-code's "Sent to {email}" stays secondaryText. EmptyLine, HomeNoClub's lines (as two paragraphs) and TabContent's failure line also go to primaryText. The resend row (CodeScreen.waiting, .center), the TextActionStyle label and A03's Add photo and Optional become leading on these screens. The ios thread lists each as a handoff 7 change. The next brief asks whether (a) and (b) also apply outside B0, for example to handoff 6's H01-access-lost, which keeps a secondaryText line.
- **Second reviewer:** The ink and alignment changes are real. Sampled: handoff 4's G06 lines, handoff 1's A02-email, A02-age and A03 subtitles, and handoff 2's F01 and M01 lines are #607067; the redraws are #182B25. On frames 12, 14 and 16 the line is #182B25, where handoff 6's H01-access-lost line is #607067. cmp-redraws.png shows the text actions moving from centred to leading, and no written answer names either change. But the change is not to every subtitle. "Sent to ben@example.com" stays #607067 on A02-code, A02-code-error and A02-code-verifying. A02-email's helper, the code screen's wait sentence, A03's Optional and the loading labels also stay secondaryText. So the suggested action, turning SetupHeading's subtitle to primaryText, would wrongly darken A02-code's destination line, which uses the same SetupHeading.

### W-06 (should, app, confirmed)

- **Where:** A02-email-sending, A02-code-verifying, A02-age-saving, A03-profile-saving (busy states)
- **Finding:** The delivery corrects four built readings of the busy state, and the ios lane must change each.
- **Evidence:** Built PrimaryButtonFace: HStack(hidden indicator, label.frame(maxWidth: .infinity), indicator). Delivered: indicator 16 pt, 8 pt before the centred label; vo.busy.value "In progress"; vo.email.busy "Sending a code.", vo.code.busy "Verifying code.", vo.age.busy "Saving your age confirmation.", vo.profile.busy "Saving your profile.". Built AgeScreen: chevron and footer "Leave sign-in" are enabled while model.isSaving.
- **Meanwhile and who acts:** The app moves the busy indicator to 8 pt before the centred label, keeping the symmetric reserved slots. It adds the "In progress" value and the one-time busy announcements, makes the fields read-only during requests without resigning focus, and disables Leave sign-in during saves.

### W-07 (should, app, confirmed)

- **Where:** A02-code-resend, A02-code-resending, A02-code-resend-failed-network
- **Finding:** The delivery corrects the built resend row: where its failure goes, that the failure is separate from a code error, its form while sending, and its announcements.
- **Evidence:** IMPLEMENTATION §2: "Its message belongs in a separate growing block immediately below the resend action... Both can coexist." handoff7.spacing.resendToFailure 8. vo.resend.available "Send a new code is available.", vo.resend.busy "Sending a new code…", vo.resend.success "Check {email} for a new code. You can send a new code after one minute."
- **Meanwhile and who acts:** The app gives a resend failure its own block below the resend action and keeps any code error in the field's region. This needs separate code-failure and resend-failure state in SignInModel. It draws "Sending a new code…" in textAction with a small native indicator, and uses the three delivered announcements.

### W-08 (should, app, confirmed)

- **Where:** A02-age, A02-age-failed-network, A03-profile, A03-profile-empty, A03-profile-failed-network, A02-email-empty
- **Finding:** The delivery's answers correct several built readings on the setup screens, and the ios lane must make each change.
- **Evidence:** Delivered: a native leading "Leave sign-in" [20,55,116,44] with no chevron and no footer link (A02-age, A02-age-failed-network), and the same on A03. A03 focused at every size. Failures go in the growing block under the field (frame 11). New keys auth.age.network and auth.age.refused, and auth.profile.tooLong below the field. A person symbol at 56% for an empty name or a non-letter, non-digit first grapheme. Placeholders "Email address" and "Your name".
- **Meanwhile and who acts:** The app makes each change. It keeps the placeholder from being spoken a second time after the identical label, and records it as built from the delivery.

### W-09 (should, app, adjusted)

- **Where:** global-launch (account loading, Retry, Leave sign-in)
- **Finding:** The delivery replaces the app's reading (the launch screen, unchanged) with a runtime screen: a native spinner with "Loading your account…", or "Leaving sign-in…" while leaving. It applies at launch, during Retry and during Leave. No frame draws it, and no type role, ink or position is given. The delivery also doesn't say whether the indicator appears at once or only after a moment.
- **Evidence:** copy-contracts handoff7.root.loading "Loading your account…" and root.leaving "Leaving sign-in…". component-contracts handoff7.launch.runtimeAccountLoading: "Native indeterminate spinner and root.loading. No header or tabs." launch.retryRead: "Shows runtime account loading, sign-in retained." PDF p3: "A longer account read shows a native spinner". Built: TadayoApp.swift RoutedView, case .starting: Palette.canvas.ignoresSafeArea().
- **Meanwhile and who acts:** The app replaces the canvas-only .starting route with the system indicator over root.loading or root.leaving. It uses the form of frame 13's loading body (indicator over a metadata label in secondaryText, as TabContent's loading builds it), with no header or tabs, and says the visible words politely once. It shows it as soon as the route is starting and adds no invented delay. It marks global-launch "built from spec" in INVENTORY.md, and the next brief asks for the frame and whether the indicator waits a moment.
- **Second reviewer:** The core is right. The delivery replaces the launch-screen reading with a spinner and root.loading or root.leaving. No frame draws it, and no role, ink or position is given. RoutedView shows Palette.canvas for .starting, during Leave and Retry too. But the claim that the VoiceOver keys are missing is weak. copy-contracts announcementPolicy.loading says "One polite announcement on state entry", and the tabs' loading labels are also seen and spoken from their visible keys with no vo.* key. So root.loading and root.leaving are the spoken words, and nothing is missing for VoiceOver. One thing the reviewer missed: the delivery doesn't say whether the indicator shows at once or only after a moment. PDF p3 says "A longer account read shows a native spinner".

### W-10 (should, app, adjusted)

- **Where:** A02-email-signed-out
- **Finding:** The delivery gives the line and says it is a neutral body notice above the field, never an invalid-email error. It gives no ink, no gaps, no frame and no announcement. Nothing is built.
- **Evidence:** copy-contracts handoff7.auth.email.signedOut: "Your sign-in ended. Enter your email to sign in again." IMPLEMENTATION §4: "show… in a neutral body notice above the field, not as an invalid-email error. Retain the address if still available". No frame in the manifest. No vo.* key, and announcementPolicy doesn't cover it.
- **Meanwhile and who acts:** The app shows it on A02-email only when the server ended the sign-in, not after Leave sign-in. It sits between the subtitle and the field label, in body, with no error icon or invalid border, and is spoken once. It is marked built from spec, and the next brief asks for the frame.
- **Second reviewer:** The brief's question asked only for the line ("Give the line A02-email shows then (A02-email-signed-out), or say there is none."). The delivery gives it, and also its place and role: IMPLEMENTATION §4 says "in a neutral body notice above the field, not as an invalid-email error". So the claim that no type role or container is given overstates it. What's missing is the ink, the gaps, a frame and a stated announcement. The app has no such string today (INVENTORY.md draws it as A02-email-empty), so it remains a build change.

### W-11 (should, claude-design, adjusted)

- **Where:** Announcement keys (root and tab failures)
- **Finding:** Some vo.failure.* keys hold only the line under the title, while other keys hold the full title and line. A build that follows the policy's "Full keys begin vo.failure." would announce "Check your connection and try again." without naming what failed (T43).
- **Evidence:** vo.failure.root.network "Check your connection and try again.", vo.failure.root.refused "Try again.", vo.failure.tabs.error.network and .refused are the same. Against them: vo.root.account.network "Couldn’t load your account. Check your connection and try again." and vo.home.error.network "Couldn’t load Home. Check your connection and try again.".
- **Meanwhile and who acts:** The app keeps announcing the title and the line (RootFailure.Kind.spoken; TabsView.announcement via tab.spoken), which matches vo.root.* and vo.home/friends/memories.error.*. It doesn't use vo.failure.root.* or vo.failure.tabs.*. A later brief asks Claude Design to retire or correct them.
- **Second reviewer:** The main point holds. vo.failure.root.network, vo.failure.root.refused and vo.failure.tabs.error.network/refused hold only the line. announcementPolicy.failures says "Full keys begin vo.failure.", while vo.root.* and vo.home/friends/memories.error.* hold the title and the line, as IMPLEMENTATION §4 says ("The title/body shown are exactly the VoiceOver announcement"). The sub-point about vo.resend.busy ending in "…" is refuted. IMPLEMENTATION §2 says "Announce Sending a new code… once", which is the exact visible words, as handoff 5's "Loading Home…" is seen and spoken. That ending is deliberate, not an inconsistency.

### W-12 (should, app, adjusted)

- **Where:** global-launch-failed-network, H01-error-no-club, F01-error-no-club, every no-club header
- **Finding:** The contracts give Retry a hint in each place and give Account a hint. But screen-copy.json records an empty hint on every control except + Add and Private drafts. The built app has no Retry hint and no Account hint.
- **Evidence:** vo.retryHome.hint "Load Home again.", vo.retryFriends.hint, vo.retryMemories.hint, vo.retryAccount.hint "Load your account again.", vo.retryLeave.hint "Remove the sign-in from this iPhone again.", vo.retryKeep.hint "Return to email sign-in. Your email address is kept.". screen-copy Retry "hint": "" on frames 12, 14 and 16. Account "hint": "" against header.accountHint "Open your account.". I have an invite "hint": "" against handoff5.a11y.haveInvite.hint.
- **Meanwhile and who acts:** The app adds the delivered Retry hints (TabLayout.swift TabContent per tab; RootFailure.swift per kind) and keeps handoff 5's I have an invite hint. Under FQ85 it also adds header.accountHint to Account, as it does for + Add, and the TestFlight notes list the controls that do nothing yet. The ios thread records that screen-copy's hints are incomplete.
- **Second reviewer:** The facts hold. screen-copy records hint "" for Retry on frames 12, 14 and 16, for Account, and for I have an invite. The contracts give vo.retry*.hint, header.accountHint "Open your account." and the unreplaced handoff5.a11y.haveInvite.hint. RootFailure and TabContent's Retry have no accessibilityHint. But the action to hold Account's hint until B6 is inconsistent. FQ85 (the founder's answer) says each later-stage control "is drawn as designed and does nothing yet, with its accessibility label unchanged". The app already gives the other do-nothing controls their designed hints: + Add ("Save a private draft or open private drafts.") and I have an invite ("Open an invitation link."). Account should be treated the same way.

### W-13 (should, app, confirmed)

- **Where:** No-club header (frames 13 to 16, 21, 22, 28 to 30) and its top edge
- **Finding:** The delivered header geometry and top edge differ from what is built, and the ios lane must change both.
- **Evidence:** Delivered: addTarget [241,56,80,44], accountTarget [329,56,44,44], avatar [337,64,28,28]. AX5: + Add [20,104,249,76] leading on the second row, Account [329,120,44,44]. Built: [274,56,59,44] beside [337,56,44,44]; stacked row .frame(maxWidth: .infinity, alignment: .trailing).
- **Meanwhile and who acts:** The app adopts the delivered targets and avatar position on every tab with no selected club, and on handoff 6's denied header, as the replaces scope says. It puts + Add leading on the stacked row, and adds an opaque canvas band behind the status bar in TabScroll with no extra scroll-edge treatment.

### W-14 (note, app, confirmed)

- **Where:** copy-contracts handoff7.replaces
- **Finding:** The copy file's replaces is a plain key-to-key map with no scopes, and it leaves some replaced keys unnamed.
- **Evidence:** Not named in handoff7.replaces: handoff3.H01.error.network, handoff3.H01.error.retryVO "Retry loading Home for {clubName}.", handoff5.loading.hint "For {clubName}.", failureStates[action=Send a code · server] and [action=Resend · server], historyBoundary.display. auth.email.placeholder → "handoff1.screen-copy.json[A02-email][4]" and auth.profile.placeholder → "[A03-profile][8]" are the label strings.
- **Meanwhile and who acts:** The ios thread records its reading: the unnamed earlier keys stay current outside the no-club context. That covers handoff3.H01.error.network and retryVO for a club's Home error (B2), and handoff5.loading.hint when a club is selected. It leaves drop.collecting.opening to the item-17 check.

### W-15 (must, claude-design, adjusted)

- **Where:** A03-profile-name-refused; A02-email server address rejection
- **Finding:** The two server-refusal lines don't name the action that failed, as T43, spec 24 and the brief's Failures rule require. The name line also doesn't cover a name over 40, which the server refuses under FQ70.
- **Evidence:** auth.profile.nameRefused "Choose a name with visible characters and no line breaks or hidden formatting." auth.email.invalid "Enter a valid email address." Compare handoff 2's "This code couldn’t be verified. Try again or send a new one.", which names the action. T43: "Errors name the action that failed". Spec 24: "error messages name the failed action".
- **Meanwhile and who acts:** Meanwhile the rule wins. The app keeps the lines it builds today, which name the action: "Couldn’t save your profile. Try again." for a refused name, as the brief states, and "Couldn’t send a code. Try again." for a refused address. It still keeps the input. It adopts the delivered lines once Claude Design rewords them to name the action (and to cover length), or the founder accepts them. The next brief asks for that.
- **Second reviewer:** The facts hold, but the severity is too low. T43 says "Errors name the action that failed and keep the person's input". Spec 24 (build spec line 562) says "error messages name the failed action". The brief's own Failures rule says "Every failure names the action that failed", and a server refusal is one of the failures it defines ("because the server refused or failed"). auth.profile.nameRefused and auth.email.invalid don't name sending a code or saving the profile. Under the given scale, breaking an invariant, the spec or the brief is must. The meanwhile also has to follow the rule over the delivery. The brief already states the app's interim for a refused name ("Meanwhile the app shows 'Couldn’t save your profile. Try again.'"), and the built app maps every non-network send refusal to auth.firstSend.refused. On length: under FQ70 the app and the API both count with Swift's String.count, so a length refusal can only come from a grapheme-segmentation difference.

### W-16 (note, none, adjusted)

- **Where:** IMPLEMENTATION.md §1 and §2, README.md, copy-contracts handoff7.stageScope
- **Finding:** The delivery names a guest-contribution/SMS proposal that no source mentions, only to exclude it from the build. Its "retained invitation" destination after a verified code is book p9's rule, and it belongs to B1.
- **Evidence:** IMPLEMENTATION §1: "The guest-contribution/SMS proposal is not part of this handoff. Do not add it to the build from this pack." stageScope: "No guest invitations, SMS, gifts or reward features are added by this handoff." Book p9: "Expired, changed or pending invitations retain their intent through authentication."
- **Meanwhile and who acts:** The app builds none of it. In B0, Verify's busy state resolves to the 18-or-older step, the profile or Home; an invitation kept across sign-in is B1's. The check's report may mention the guest/SMS reference in one line, and no decision is needed.
- **Second reviewer:** Half of this is refuted. The "retained invitation" destination is in the sources: book p9 ("08 Welcome and invitation") says "Expired, changed or pending invitations retain their intent through authentication." That's B1 scope, which the delivery names as a possible route, not new scope. The guest-contribution/SMS proposal has no source. But the delivery mentions it only to exclude it ("Do not add it to the build from this pack"; stageScope "No guest invitations, SMS, gifts or reward features are added"). No product choice is made, so there's nothing for the founder to decide.

### WM-01 (should, app, missed)

- **Where:** A02-age and A03 Leave sign-in → A02-email
- **Finding:** The delivery says Leave sign-in returns to A02-email with the typed address kept in memory. The built Leave throws the address away, so Ben finds an empty email field.
- **Evidence:** IMPLEMENTATION §2: "Leaving removes the session from this iPhone and returns to A02-email in B0, with the address retained in memory." component-contracts handoff7.ageExit.return: "A02-email in B0, address retained in memory." Built RootModel.endSession(): `signIn = nil` ... showSignIn(), which makes a new SignInModel whose email is "". retry() for .signInNotKept already carries `signIn?.email` over; leave() does not.
- **Meanwhile and who acts:** The app captures signIn?.email, if one is in memory, when Leave starts, and puts it in the new SignInModel after the session is removed, as retry() does for signInNotKept. That covers a Leave retried after global-leave-failed too. It never takes the address from the account record (IMPLEMENTATION §4).

### WM-02 (should, app, missed)

- **Where:** A03-profile, A03-profile-empty, A03-profile-failed-network, A02-age, A02-age-failed-network (footer gaps)
- **Finding:** The delivery names footer gaps the built setup screens don't use. Continue sits 12 pt above the keyboard; the built footer keeps 44 pt above it. A02-age's button sits 44 pt above the safe-area bottom with no footer link, and its failure line keeps at least 16 pt above the button; built, the line sits 8 pt above the button and the button 8 pt above a footer Leave sign-in.
- **Evidence:** component-contracts handoff7.spacing: formFooterToKeyboard 12, formFooterToSafeAreaBottom 44, errorToActionMinimum 16. A03-profile-empty and A03-profile: Continue [20,499,353,50], bottom 549 = keyboard top 561 − 12. A02-age: I’m 18 or older [20,724,353,50], bottom 774 = 818 − 44. A02-age-failed-network: error ink ends at y699, button at 724. IMPLEMENTATION §2: "Place the growing message above the pinned button with at least 16 clear points." Built: ProfileScreen SetupFooter(bottom: SetupGap.profileFooter = 44), which safeAreaInset also keeps above the keyboard. AgeScreen SetupFooter(bottom: Spacing.s) with the footer Leave sign-in. SetupFooter VStack(spacing: Spacing.s).
- **Meanwhile and who acts:** The app pins Continue (and Verify, where W-02's reading pins it) 12 pt above the keyboard and 44 pt above the safe-area bottom when there is no keyboard. On A02-age it removes the footer link (W-08), puts the button 44 pt above the safe-area bottom, and keeps at least 16 pt between the failure line and the button.

### WM-03 (should, app, missed)

- **Where:** H01-error-no-club (frame 14), F01-error-no-club (frame 16)
- **Finding:** The no-club error tabs draw their title in utilityTitle 32/35, the size of "Start your club." and the Friends page title, not in the emptyTitle 25/30 of handoff 6's H01-access-lost, which the brief named for the layout and the app builds. The written answer names the gaps but no role, so the change is unannounced.
- **Evidence:** frames/H01-error-no-club.png: "Couldn’t load Home." ink at 135.0 to 158.5 pt, 310 pt wide (Arimo Bold at 32 pt gives about 311; at 25 pt about 243). Same top and height as F01-no-club's "Friends" title; G06's "Start your club." also starts at 135. Handoff 6 H01-access-lost's two-line title is about 25 pt (166 to 189 incl. descender). IMPLEMENTATION §4: "the title 32 points below the header and supporting line 24 points below the title’s line box", with no role. Built: TabLayout.swift TabContent.title uses .textRole(.emptyTitle).
- **Meanwhile and who acts:** The app follows frames 14 and 16 and sets the failure title to utilityTitle 32/35, keeping the 32 and 24 gaps. The not-in-build line, which no frame draws, keeps what is built. The ios thread records the change, and the next brief asks which role the not-in-build line and handoff 6's denied titles take.

### WM-04 (note, claude-design, missed)

- **Where:** A03-profile-empty, A03-profile-empty-xl (avatar without an initial)
- **Finding:** The delivery adds vo.profile.emptyAvatar "No profile photo" for the profile photo control, but no frame or contract says which element speaks it. screen-copy lists no avatar element on A03, and Add photo's hint is empty.
- **Evidence:** copy-contracts handoff7.vo.profile.emptyAvatar "No profile photo". component-contracts handoff7.avatarWithoutInitial.a11y: "profile photo control uses No profile photo, not the glyph name." IMPLEMENTATION §5: "the profile control can say No profile photo." screen-copy A03-profile-empty controls: Leave sign-in, Add photo (hint ""), Your name, Continue. Built: Avatar is accessibilityHidden(true).
- **Meanwhile and who acts:** The app keeps the avatar hidden from VoiceOver, as built, and doesn't use the key until a contract names its element and whether it is a label or a value. The next brief asks.

## Copy, privacy and product rules

*Reviewer's summary:* I checked handoff 7 for copy, privacy, security and product rules. That covered every drawn string (screen-copy.json, the frames' SVG aria-labels, and the 436 labels in the sheet's handoff 7 section), all handoff7 copy and component entries, IMPLEMENTATION.md, source-provenance's newDecisions and the PDF text. I compared them with the invariants, the spec, the book, QUESTIONS.md and the app as built (main and ios/b0-drop-card).

Nothing breaks the privacy core:
- **Hidden card:** before the reveal it shows only the caption, the author's identity, the date and a lock. Highlight appears on the author's own card only (FQ21).
- **Removed placeholder:** it names no author, time, caption or reason.
- **Upload states:** Pending, Uploading and Processing each say "Not added yet". The receipt shows only after the server commits the drop.
- **Counting and chasing:** there are no counts, streaks or chasing anywhere.
- **Guest, SMS and reward:** nothing in the pack adds them.

**Two must findings, both for Claude Design:**
- R-01: two refusal lines don't name the action that failed (T43, spec 24): "Enter a valid email address." and "Choose a name with visible characters and no line breaks or hidden formatting.".
- R-02: the highlight cover's spoken label ("{person}’s pick") drops "Open Maya’s highlight", which T47 and book p8 require. A contributor's cover has no spoken label at all.

**Four should findings where the delivery is wrong or quietly changes something built:**
- R-03: M01-no-club's line changed to "Days shared after you joined…". It isn't listed as a replacement, and it is untrue for someone with no club.
- R-04: G06-no-club-xl drops "Create a club or open an invitation." at the largest text size.
- R-05: the folded card's date template is fixed to US order and has no place for the year (FQ44), and component-contracts.json says handoff 5's status line is kept.
- R-06 (for the founder): Leave sign-in keeps the email address on the email screen. The app clears it today.

**Three changes the app adopts (R-07 to R-09):**
- One leading "Leave sign-in" action on A02-age and A03-profile, unavailable while saving, with no alert.
- New words: the age-step failure lines, the signed-out notice, the 40-character line and the busy announcements.
- A spinner with "Loading your account…" or "Leaving sign-in…" in place of the static launch screen.

**Five notes (R-10 to R-14):**
- R-10: "Leaving sign-in…" also shows when the server ended the sign-in.
- R-11: the Back chevron is drawn active while a request runs.
- R-12: Home may announce twice when the list holds a club this build can't show.
- R-13: the undeclared name "Deborah-Anne" is shown with Debby's portrait.
- R-14: the guest/SMS lines answer a proposal the brief never mentions.


### R-01 (must, claude-design, confirmed)

- **Where:** A02-email (server address rejection), A03-profile-name-refused
- **Finding:** Two server-refusal lines don't name the action that failed: the invalid-address line and the refused-name line. Each says only what to fix, unlike every other sign-in failure in the pack.
- **Evidence:** copy-contracts.json handoff7: "auth.email.invalid": "Enter a valid email address."; "auth.profile.nameRefused": "Choose a name with visible characters and no line breaks or hidden formatting."; both repeated as vo.failure.auth.email.invalid and vo.failure.auth.profile.nameRefused. IMPLEMENTATION.md: "An actual address-format rejection gets Enter a valid email address. and the invalid-field treatment." and "A server-invalid name uses Choose a name with visible characters ... with the invalid-field treatment." T43: "Errors name the action that failed". Brief: "Every failure names the action that failed and keeps what Ben typed (T43)".
- **Meanwhile and who acts:** Meanwhile the app keeps its built lines, which name the action: "Couldn’t send a code. Try again." (auth.firstSend.refused) for any server refusal of Send a code, and "Couldn’t save your profile. Try again." (auth.profile.saveFailed) for a refused name, with no invalid-field border. The ios thread records the difference in INVENTORY.md. A later brief asks for both lines with the action first, then the reason, like the code error.

### R-02 (must, claude-design, confirmed)

- **Where:** brand-components: Highlight covers and expanded row
- **Finding:** The pack gives the cover's spoken name as its label alone ("Debby’s pick", "Your pick"). Nothing says the cover opens the highlight, and there is no spoken template for a contributor's cover such as "Ben".
- **Evidence:** component-contracts.json handoff7.highlightCover.star.spoken: "Do not announce decorative extra star; announce person’s pick / Your pick." copy-contracts.json handoff7: "vo.highlight.pick": "{person}’s pick", "vo.highlight.own": "Your pick", "highlight.contributor": "{person}" (no vo key). The sheet's tile is labelled "Ben". Book p8: "A highlight cover itself has the accessible action Open Maya’s highlight." The app builds accessibilityName "Open \(person.name)’s highlight" (ios/b0-drop-card LabView.swift:330; HighlightCover.swift:60).
- **Meanwhile and who acts:** Meanwhile the app keeps "Open {person}’s highlight" as every cover's name, as T47 and book p8 require, and doesn't use vo.highlight.pick or vo.highlight.own as the name. A later brief asks for the cover's label and its action or hint for the star's pick, "Your pick" and a contributor's cover. The answer must fit T47 and handoff 5's rule that a label begins with its visible words.

### R-03 (should, claude-design, confirmed)

- **Where:** M01-no-club (redraw)
- **Finding:** The M01-no-club redraw rewords the history line without saying so. The new words assume a joining that, on this screen, hasn't happened. The new key isn't in handoff7.replaces, so the pack contradicts itself.
- **Evidence:** M01-no-club.svg: "Days shared after you joined will appear here" / "after they open."; copy-contracts.json handoff7 "noClub.memories.body": "Days shared after you joined will appear here after they open." (not in handoff7.replaces). Earlier: historyBoundary.display "Days shared after you join a club will appear here after they open."; handoff 2 M01-no-club "Days shared after you join a club will appear" / "here after they open."
- **Meanwhile and who acts:** Meanwhile the app keeps "Days shared after you join a club will appear here after they open." (memories.noClub.body, already built). The ios thread records the difference in INVENTORY.md. A later brief asks Claude Design to keep that line or replace it explicitly with true wording.

### R-04 (should, claude-design, confirmed)

- **Where:** G06-no-club-xl
- **Finding:** The largest-text frame drops the empty Home's second sentence, which both the default and dark frames carry.
- **Evidence:** screen-copy.json G06-no-club-xl visibleStrings: "Start your club.", "A private place for two to six people.", "Create a club", ..., with no "Create a club or open an invitation."; G06-no-club.svg and G06-no-club-dark.svg both include it (noClub.body2). The delivery's PDF p3: "nothing shrinks or disappears from the document order".
- **Meanwhile and who acts:** Meanwhile the app keeps noClub.body1 and noClub.body2 at every text size (apps/ios/Tadayo/Tabs/NoClubTabs.swift, HomeNoClub), so the build doesn't change. The ios thread notes the frame's omission in INVENTORY.md, and a later brief asks for the corrected frame.

### R-05 (should, claude-design, confirmed)

- **Where:** brand-components: Drop · collecting (both views)
- **Finding:** The new folded-card status template fixes US order and a comma ("{weekday}, {monthDay}") and has no place for a year. In en-GB it would read "Friday, 13 November" where iOS writes "Friday 13 November", and it can't show a date outside the current year. copy-contracts.json says it replaces handoff 5's status, while component-contracts.json says handoff 5's status is kept. The travelling variant keeps handoff 5's full-date form.
- **Evidence:** copy-contracts.json handoff7 "drop.collecting.opening": "Opens {weekday}, {monthDay} · {time}"; handoff7.replaces "drop.collecting.opening": "handoff5.card.status" (= "Opens {fullDate} · {openTime}"). component-contracts.json handoff7.dropShapes.collectingCard.inherits "handoff5.collectingCardStatus + ..." (template handoff5.card.status, "with year when needed"); handoff7.replaces.dropShapes "H4 collecting geometry and H5 status preserved ...". The sheet draws "Opens Friday, November 13 · 7 AM".
- **Meanwhile and who acts:** Meanwhile the app keeps handoff5.card.status ("card.status" = "Opens %1$@ · %2$@", with DateLabels.fullDate(includingYear:) from the region's template, FoldedCard.swift) and doesn't adopt the split template. The ios thread records it. A later brief asks Claude Design to confirm handoff 5's template or give one that takes a single region-formatted date.

### R-06 (should, founder, confirmed)

- **Where:** A02-email after Leave sign-in
- **Finding:** The delivery makes a data-handling choice the sources don't settle: after a deliberate Leave sign-in, the address stays in the email field. The app does the opposite and opens an empty A02-email.
- **Evidence:** IMPLEMENTATION.md: "Leaving removes the session from this iPhone and returns to A02-email in B0, with the address retained in memory."; component-contracts.json handoff7.ageExit.return: "A02-email in B0, address retained in memory." (the same entry's reason: "purge them on successful exit/account switch" for name and photo). App: RootModel.endSession() sets signIn = nil and showSignIn() creates a new SignInModel (packages/swift/TadayoCore/Sources/TadayoCore/RootModel.swift).
- **Meanwhile and who acts:** Meanwhile the app keeps an empty email field after Leave sign-in (built). It keeps the address only where the founder's Default does (Retry after "Couldn’t keep you signed in."), and, where it is still in memory, for the server-ended notice. The founder decides whether a deliberate leave keeps the address.

### R-07 (should, app, confirmed)

- **Where:** A02-age, A02-age-failed-network, A03-profile, A03-profile-empty, A03-profile-failed-network
- **Finding:** The app must change its setup exit to the delivery's single leading "Leave sign-in" text action on both setup screens. It has no alert and is unavailable while a save runs. This adds the exit A03 lacks today.
- **Evidence:** IMPLEMENTATION.md: "Use a native leading Leave sign-in text action on both A02-age and A03-profile. It replaces the misleading back chevron ... There is no extra confirmation alert ... While save is in flight, Leave sign-in is inactive." screen-copy.json: "Leave sign-in" rect [20,55,116,44] on every A02-age and A03 frame. App: AgeScreen bottom Button("auth.age.leave") (ProfileScreens.swift:32) and chevron.backward toolbar item (lines 38-48), neither disabled while model.isSaving; ProfileScreen has no exit (line 71).
- **Meanwhile and who acts:** The app replaces A02-age's chevron and bottom button with one .topBarLeading text button "Leave sign-in" (auth.age.leave) that calls RootModel.leave(). It adds the same button to ProfileScreen, disables it while the age or profile save runs, and shows no alert. Snapshots are updated, and the INVENTORY.md rows move from built-from-spec to the delivery.

### R-08 (should, app, adjusted)

- **Where:** A02-age-failed-network/-refused/-saving, A02-email-signed-out, A03-profile-name-too-long, busy and resend states
- **Finding:** The delivery words several states the app shows with interim words or none. These are design matters, so the app follows the delivery.
- **Evidence:** copy-contracts.json handoff7: "auth.age.network" "Couldn’t save your age confirmation. Check your connection and try again."; "auth.age.refused" "Couldn’t save your age confirmation. Try again."; "vo.age.busy" "Saving your age confirmation."; "auth.email.signedOut" "Your sign-in ended. Enter your email to sign in again."; "auth.profile.tooLong" "Use 40 characters or fewer for your name."; "vo.email.busy" "Sending a code.", "vo.code.busy" "Verifying code.", "vo.profile.busy" "Saving your profile.", "vo.busy.value" "In progress"; "vo.resend.available" "Send a new code is available."; "vo.resend.success" "Check {email} for a new code. You can send a new code after one minute." IMPLEMENTATION.md: after a successful resend, "Return focus to the code field". App catalog (apps/ios/Tadayo/Localizable.xcstrings) has none of these keys. A02-age shows the profile's lines through ProfileModel.Failure.words. The resend row announces "Send a new code" (SignInFlow.swift:151-152).
- **Meanwhile and who acts:** The app adds these keys to its catalog. A02-age uses the age-confirmation lines and announcement. A02-email shows the signed-out notice only after a server-ended sign-in, without invalid styling. A03 shows the 40-character line under the field while Continue stays unavailable, and doesn't cut the name at 40. The busy, availability and resend announcements are each made once without moving focus. The one exception is a successful resend, which returns focus to the code field as built (SignInFlow.swift, onChange of resendDue) and announces vo.resend.success. INVENTORY.md rows are updated.
- **Second reviewer:** Every key exists in copy-contracts handoff7 and none is in the app catalog. AgeScreen shows ProfileModel.Failure.words, the profile's lines. One part of the action is wrong. The delivery says that after a successful resend the app should 'Return focus to the code field and show the waiting sentence again' and announce vo.resend.success. The app already does this (SignInFlow.swift: onChange(of: resendDue) sets focused = true). 'Each made once without moving focus' would tell the ios lane to remove that. Every other busy and resend announcement leaves focus where it is.

### R-09 (should, app, confirmed)

- **Where:** global-launch (account read and Leave sign-in waits)
- **Finding:** The delivery replaces the app's static screen with a native spinner and a label, both during the account read and during Leave sign-in. It cites Apple's Loading guidance.
- **Evidence:** IMPLEMENTATION.md: "Once the app can draw, do not hold that static launch screen for a minute-long account read. Replace it with a real native spinner and Loading your account…; no header or tabs before the route is known. During session removal use Leaving sign-in… with the same form." copy: "root.loading" "Loading your account…", "root.leaving" "Leaving sign-in…"; component-contracts.json handoff7.launch.runtimeAccountLoading / runtimeLeaving. App: RoutedView case .starting renders Palette.canvas.ignoresSafeArea() (apps/ios/Tadayo/App/TadayoApp.swift); RootModel.Route.starting covers both the read and the leave.
- **Meanwhile and who acts:** The app splits Route.starting into reading and leaving, or carries the reason with it. It shows the system's activity indicator over root.loading or root.leaving, each announced once, with no header or tabs. After a verified code, A02-code stays with Verify code busy. The OS launch screen stays canvas only.

### R-10 (note, claude-design, confirmed)

- **Where:** global-launch while the session is removed after the server ended it, or after the Lab's Log out
- **Finding:** "Leaving sign-in…" is prescribed for every session removal. That includes a sign-in the server ended, where the person took no action, just before A02-email says "Your sign-in ended."
- **Evidence:** IMPLEMENTATION.md: "During session removal use Leaving sign-in… with the same form." FQ89: removal is reached by "Leave sign-in on A02-age, the Lab's Log out in builds that point at dev, and a session the server ended, when the person did nothing". RootModel: case .failure(.signedOut): await leave().
- **Meanwhile and who acts:** Meanwhile the app shows "Leaving sign-in…" for every removal, as written. The ios thread records the question of whether a removal the person didn't start needs other words, for the next brief.

### R-11 (note, claude-design, confirmed)

- **Where:** A02-code-verifying, A02-code-resending
- **Finding:** Frames 4 and 7 draw the code screen's Back chevron active, and screen-copy marks it enabled. The written answer makes Back unavailable while a verify or resend runs.
- **Evidence:** screen-copy.json A02-code-verifying and A02-code-resending: {"label": "Back", "enabled": true} beside {"label": "Change email address", "enabled": false}; the chevron is drawn in action colour, identical to A02-code. IMPLEMENTATION.md: "The code screen’s Back has the same safe result as Change email address ... Those actions are unavailable while verification/resend is in flight."
- **Meanwhile and who acts:** Meanwhile the app keeps its built behaviour, which matches the written rule: the back button is hidden while !model.canChangeEmail (apps/ios/Tadayo/SignIn/SignInFlow.swift:143). Nothing changes. The frames' difference goes in a later brief.

### R-12 (note, claude-design, adjusted)

- **Where:** Home when the club list resolves to a club this build can't show
- **Finding:** Two of the delivery's rules could both fire on Home when the club list holds a club this build can't show: "Home updated." on every resolve, and the not-in-build line on entry. Two polite announcements in a row can cut each other off.
- **Evidence:** copy-contracts.json handoff7.announcementPolicy.loading: "Home resolved announces home.resolvedVO even when empty."; IMPLEMENTATION.md: "When Home resolves empty, announce Home updated. once and show G06-no-club." and "FQ90’s This version of Tadayo can’t show clubs yet. ... Announce the exact line once on entry." App: TabsView.announcement returns tabs.updated.home only for .noClub on Home, and tabs.notInThisBuild alone for .notInThisBuild.
- **Meanwhile and who acts:** Meanwhile the app keeps its built behaviour, one announcement per resolve: "Home updated." only when the list comes back empty on Home, and the not-in-build line alone otherwise (TabsView.announcement). The ios thread records the question for the next brief.
- **Second reviewer:** The ambiguity is real. announcementPolicy.loading says 'Home resolved announces home.resolvedVO even when empty', and IMPLEMENTATION.md says the not-in-build line is announced once on entry. The meanwhile action is wrong, though. It invents a new queued double announcement, and the app doesn't do that today. TabsView.announcement (apps/ios/Tadayo/Tabs/TabsView.swift:107-121) says "Home updated." only when the list comes back empty on Home (case .noClub, tab == .home, old == .loading), and only the not-in-build line for .notInThisBuild. That matches IMPLEMENTATION.md's own narrower sentence, "When Home resolves empty, announce Home updated. once", and avoids two polite announcements in a row.

### R-13 (note, claude-design, adjusted)

- **Where:** brand-components: Highlight covers and expanded row
- **Finding:** The handoff 7 highlight specimen puts Debby's portrait on "Deborah-Anne’s pick", the book's long-name fixture. Handoff 6 drew that name with an initial. The brief allows portraits only for Ben, Maya and Debby, with initials for everyone else.
- **Evidence:** brand-components.svg, handoff 7 section: aria-labels "Debby’s pick", "Ben", "Deborah-Anne’s pick"; the row's 28-point image is the same purple-backdrop portrait as the Debby tile's 18-point image. Handoff 6 brand-components.svg: "D", "Deborah-", "Anne’s pick" (initial, no image). Book p27: "The Friends specimen uses Alexandria-Rose Mensah and Deborah-Anne Ouédraogo." source-provenance.json photos.portraits: "Ben, Maya and Debby portrait crops ... no other people."
- **Meanwhile and who acts:** Nothing changes in the product. The Lab keeps Deborah-Anne Ouédraogo with an initial (FixtureCast.deborahAnne, photo nil) and doesn't copy the portrait. A later brief can ask that a long-name specimen use its own initial, not a book portrait.
- **Second reviewer:** The name isn't undeclared or invented. 'Deborah-Anne Ouédraogo' is book p27's long-name fixture. Handoffs 0 to 6 drew 'Deborah-Anne’s pick' (FQ20's answer), and the app's own Lab uses it (FixtureCast.deborahAnne, photo nil; LabView.swift:319). The real change is the portrait. Handoff 6's sheet drew Deborah-Anne with the initial D, and handoff 7's expanded row embeds the same purple-backdrop portrait as the 'Debby’s pick' tile (extracted from the SVG). source-provenance says the portraits are 'Ben, Maya and Debby ... no other people', and the brief says 'the portraits of Ben, Maya and Debby, with initials for everyone else'. So the sheet puts Debby's photograph on another person's name.

### R-14 (note, none, adjusted)

- **Where:** Pack-wide (README.md, IMPLEMENTATION.md section 1, copy-contracts.json handoff7.stageScope)
- **Finding:** The pack answers a guest-contribution/SMS proposal that the brief never mentions. Nothing in the pack adds guest, SMS, gift or reward behaviour.
- **Evidence:** README.md: "This pack adds no guest invitation, SMS or reward feature." IMPLEMENTATION.md: "The guest-contribution/SMS proposal is not part of this handoff. Do not add it to the build from this pack." copy-contracts.json handoff7.stageScope: "No guest invitations, SMS, gifts or reward features are added by this handoff." PDF p1: "No guest/SMS scope". Neither handoff-7-brief.md nor the pack's handoff-7-brief.txt mentions guest, SMS or reward.
- **Meanwhile and who acts:** The app builds nothing from it. The report can mention in one line that the Claude Design project refers to a guest-contribution/SMS proposal from outside this brief. No decision is asked.
- **Second reviewer:** The facts are right. README.md, IMPLEMENTATION.md section 1, copy-contracts handoff7.stageScope and PDF p1 all exclude a guest/SMS proposal, and neither copy of the brief mentions one. But no product decision is needed. The pack adds nothing, and the app builds nothing from it. 'founder' as the actor overstates it. It is a line of information in the report.

### RM-01 (should, claude-design, missed)

- **Where:** global-launch-failed-network / global-launch-refused, H01/F01/M01-error-no-club (VoiceOver)
- **Finding:** The pack says the full failure announcements are the keys that begin vo.failure. But vo.failure.root.* and vo.failure.tabs.error.* hold only the second line, "Check your connection and try again." or "Try again.". That names nothing that failed. The complete announcements (title then line) are under other keys, so a build that follows the stated policy would break T43 and FQ89's Default.
- **Evidence:** copy-contracts.json handoff7.announcementPolicy.failures: "Announce the exact visible failure once, without stealing focus. Full keys begin vo.failure."; "vo.failure.root.network": "Check your connection and try again.", "vo.failure.root.refused": "Try again.", "vo.failure.tabs.error.network": "Check your connection and try again.", "vo.failure.tabs.error.refused": "Try again."; versus "vo.root.account.network": "Couldn’t load your account. Check your connection and try again." and "vo.home.error.network": "Couldn’t load Home. Check your connection and try again.". IMPLEMENTATION.md: "The title/body shown are exactly the VoiceOver announcement." FQ89 Default: "VoiceOver says the title and the line as the screen shows." T43: "Errors name the action that failed".
- **Meanwhile and who acts:** Meanwhile the app keeps its built announcements, the title then the line (RootFailure.Kind.spoken; ClubTab.spoken(_:) in TabLayout.swift). Those match vo.root.account.*, vo.root.leave.refused, vo.root.keep.refused and vo.home/friends/memories.error.*. It never announces vo.failure.root.* or vo.failure.tabs.* alone. The ios thread records which keys it uses. A later brief asks Claude Design to remove or complete those four keys.

### RM-02 (note, app, missed)

- **Where:** Pack-wide (IMPLEMENTATION.md sections 4 and 5)
- **Finding:** The pack says it "confirms" three of the founder's open Defaults: FQ89's root failures, FQ90's not-in-build line and FQ91's processing state. That is Claude Design agreeing, not the founder answering, so the three questions stay open. (FQ86, which the pack also calls confirmed, was already answered by the founder.)
- **Evidence:** IMPLEMENTATION.md: "Confirm FQ89’s root failures: ..."; "FQ90’s This version of Tadayo can’t show clubs yet. is confirmed for a real club/accepted invitation B0 cannot display."; "Processing · Not added yet has no spinner or bar; this confirms FQ91’s restrained default." docs/QUESTIONS.md (ios/b0-drop-card): FQ89, FQ90 and FQ91 each carry a Default and no founder answer.
- **Meanwhile and who acts:** The Defaults stand, and the app builds them as it does today. The ios thread notes Claude Design's agreement under FQ89, FQ90 and FQ91 in docs/QUESTIONS.md and leaves each open for the founder.

### RM-03 (should, app, missed)

- **Where:** brand-components: Highlight covers (contributor tile); the Lab's highlight section
- **Finding:** The delivery labels a contributor's cover with the contributor's name alone, as 2.1's H01-open does. The app's Lab draws "Maya’s highlight" as the visible label, so the build has to change.
- **Evidence:** copy-contracts.json handoff7 "highlight.contributor": "{person}"; IMPLEMENTATION.md: "The visible label is Debby’s pick or Your pick for the star’s own view. Others retain their contributor names." The sheet's tile reads "Ben". 2.1 H01-open's rail reads "Maya", "Sam", "Ben". App: cover(FixtureCast.maya, label: "Maya’s highlight") (ios/b0-drop-card apps/ios/Tadayo/Lab/LabView.swift:318; main LabView.swift:219).
- **Meanwhile and who acts:** The app changes the Lab's contributor tile label to the contributor's name ("Maya"), keeps "Debby’s pick" on the star's pick, and keeps the spoken name under R-02's rule until a later brief settles it. It updates the Lab-highlights snapshots and the INVENTORY.md row.

## Brand, visuals, native iOS and accessibility

*Reviewer's summary:* Visual, brand, native-iOS and accessibility check of handoff 7 (the pack, Tadayo_Handoff_7_Pack.zip). Overall the basics pass. Every colour is a revision 1.1 token, apart from device chrome and the established foldCornerLine #8C8F84. All text contrast is at least 4.64:1, light and dark, and every target is at least 44 points. The dark frames use the theme pairings, and the XL frames use the AX5 sizes. All the photographs are book images. Nothing must block. There are 17 should findings and 7 notes. Where the frames disagree with the handoff's own contracts, they point to Claude Design: the back chevron is drawn enabled while busy; Verify code is drawn in the flow instead of pinned; the field-to-error gaps are 5, 8, 16 and 18 against fieldErrorGap 12; the code label sits 6 points under Sent to; body ink switched to primaryText without a word; the error-tab title switched to 32; and the highlight covers lost the cut fold. The redraws also carry spacing and alignment changes the app must build: Leave sign-in in the nav bar, buttons 44 above the safe area, a leading resend row, and new no-club gaps. Also for the app: the compact receipt's check disc now scales; the runtime loading screen is undrawn; and at XL the A02-code-error-xl frame and three qa probes cut the error mid-sentence at the pinned button. The qa review's claims are boilerplate, and nothing native has been checked yet.


### V-01 (should, claude-design, confirmed)

- **Where:** open
- **Finding:** A02-code-verifying and A02-code-resending draw the back chevron enabled, in action colour, while a request is in flight.
- **Evidence:** frames/A02-code-verifying.svg and A02-code-resending.svg draw the chevron in stroke #284CDB. screen-copy.json lists 'Back' [16,55,44,44] enabled:true in both, beside 'Change email address' enabled:false. Contract authForm.codeBack says 'Change email address, address retained, only while idle.' IMPLEMENTATION says 'Those actions are unavailable while verification/resend is in flight.'
- **Meanwhile and who acts:** Ask Claude Design to redraw both busy frames with Back hidden or unavailable. Meanwhile the app keeps .navigationBarBackButtonHidden(!model.canChangeEmail) in SignInFlow.swift CodeScreen.

### V-02 (should, claude-design, confirmed)

- **Where:** open
- **Finding:** Verify code is pinned above the keyboard only in the XL frame. Every default A02-code frame draws it in the flow.
- **Evidence:** authForm.keyboardFooter says 'Continue and Verify code pinned above keyboard with 12-point clear gap.' A02-code-error-xl pins Verify at 464-549, with the keyboard at 561. A02-code-verifying, -verify-failed-network, -resend, -resending, -resend-failed-network, -error-dark and the A02-code and A02-code-error redraws all draw Verify at 349-399. A pinned 50-point button would sit at 499-549.
- **Meanwhile and who acts:** Ask Claude Design which is meant: redraw the default frames, or amend the contract. Until it answers, the app keeps Verify in the flow, as built.

### V-03 (should, app, adjusted)

- **Where:** open
- **Finding:** No frame draws the field-to-error gap at the named 12. The app already builds 12 above the error. Only its code error region falls short of the 16-point minimum below the error.
- **Evidence:** Field bottom to error line top: email 321 to 326 (5); code 289 to 297 (8); profile 346 to 362 (16); XL code 262 to 280 (18). The contract says fieldErrorGap 12 and errorToActionMinimum 16. App, SignInFlow.swift: EmailScreen puts InlineError .padding(.top, Spacing.m) = 12 and the button .padding(.top, Spacing.xxl) = 24, which meets the minimum. CodeScreen.errorRegion has .padding(.top, Spacing.m) and .padding(.bottom, Spacing.m), so 12 below the error, which is under the minimum.
- **Meanwhile and who acts:** Change CodeScreen.errorRegion's bottom padding from Spacing.m (12) to Spacing.l (16). Keep 12 above the error on both screens, and keep the email screen's 24. Ask Claude Design in a later brief to redraw the frames at 12.
- **Second reviewer:** The frames' gaps are as measured. Line tops are baseline minus 0.82 × size, the convention that reproduces the contract's own 32 and 24. But the app already builds 12 above the error on both screens. errorToActionMinimum is a minimum, so the email screen's 24 after the error already complies. Only the code error region's bottom 12 falls below 16. Changing the email button's padding to 16 is not needed.

### V-04 (should, claude-design, confirmed)

- **Where:** open
- **Finding:** The 'Six-digit code' label sits 6 points under the 'Sent to' line. That is off the spacing scale and much tighter than on A02-email.
- **Evidence:** In the A02-code frames, the subtitle's baseline is 193.94 (line box 180-203) and the label's baseline is 219.66 (line box 209-227), so the gap is 6. On A02-email the gap from subtitle to label is about 38. Handoff 1's A02-code and handoff 2's A02-code-error put the label at baseline 252, with the field at 263. The book p35 scale is 4, 8, 12, 16, 20, 24 and 32.
- **Meanwhile and who acts:** Ask Claude Design to confirm or correct the gap. The app keeps SetupGap.field (44) as on A02-email, because 6 is off the scale.

### V-05 (should, claude-design, confirmed)

- **Where:** open
- **Finding:** The redraws and new frames switch body and subtitle lines from secondaryText to primaryText without saying so. The same role now has two inks within handoff 7.
- **Evidence:** In #182B25: 'We’ll send a six-digit code to sign in.', 'Tadayo is for people aged 18 and older.', 'A name your friends know.', both G06 body lines, the F01 and M01 bodies, and 'Check your connection and try again.' on global-launch-failed-network and on H01/F01-error-no-club. Handoffs 1, 2 and 4 drew these in #607067. Handoff 6's H01-access-lost 'Choose a club to continue.' is #607067. 'Sent to ben@example.com' stays #607067 in handoff 7.
- **Meanwhile and who acts:** Ask Claude Design whether the body role moved to primaryText. Until it answers, the app keeps secondaryText (SetupHeading subtitle, the TabContent failure line, NoClubTabs bodies).

### V-06 (should, claude-design, confirmed)

- **Where:** open
- **Finding:** The error tabs set their titles in utilityTitle 32. The brief asked for H01-access-lost's form, which is emptyTitle 25/30 over a secondaryText line.
- **Evidence:** 'Couldn’t load Home.' and 'Couldn’t load Friends.' are drawn at size 32, baseline 158.24, over a #182B25 body. The brief, item 14, says '…in your H01-access-lost's form without a page title'. Handoff 6's H01-access-lost draws 'This club is no longer available.' at 25, over 'Choose a club to continue.' in #607067. TabLayout.swift's title() uses .textRole(.emptyTitle).
- **Meanwhile and who acts:** Ask Claude Design to confirm whether the error tabs should differ from handoff 6's denial screens. Meanwhile the app keeps emptyTitle 25.

### V-07 (should, claude-design, confirmed)

- **Where:** open
- **Finding:** The handoff 7 highlight tiles and the expanded row are uncut rounded rectangles with only a crease line, and Ben's tile has no fold at all. That differs from handoff 6's tile, from handoff 7's own collecting card and from the row contract's fold 18.
- **Evidence:** Sheet y 23434: tiles 'rect x=20 y=12 width=91 height=69 rx=16' plus the crease 'M93 12 V30 H111'. The second tile at x=123 has no fold path. The row is 'rect x=20 y=108 width=353 height=110 rx=16' plus the crease 'M355 108 V126 H373'. Handoff 6's tile is 'M48,415 H105 L123,433 V468 …'. Handoff 7's collecting card is 'M36 12 H355 L373 30 …'. highlightCover.row.fold is 18. Book p34 says '…a button with a concise name and a folded corner.'
- **Meanwhile and who acts:** Ask Claude Design to redraw the tiles and the row with the cut fold. The app keeps the cut fold (foldedBackground) on every tile and row.

### V-08 (should, claude-design, confirmed)

- **Where:** open
- **Finding:** The expanded highlight row's geometry departs from its own contract.
- **Evidence:** The row rect is y 108, height 110, holding one line of label. The label's line top is 128 (20 below the row's top) and the avatar's top is 132 (24 below). The star is at translate(329 132), scale 0.5, so its right edge is 341, 32 from the row's edge at 373. The contract says highlightCover.row minimumHeight 96, verticalPadding 16 and star.rowOrigin 'Trailing24 inset'.
- **Meanwhile and who acts:** The app keeps 96 minimum, 16 padding and a 24 trailing inset, as HighlightCover.swift already builds them. Ask Claude Design to correct the specimen.

### V-09 (should, claude-design, confirmed)

- **Where:** open
- **Finding:** The compact receipt's top inset is drawn at 16, not 12. The space below the action matches neither the receipt's default rule nor its wrapped-size rule.
- **Evidence:** Sheet: receipt top 23810, title and disc tops 23826 (16). The contract says insetVertical 12. At default size, 'Make my highlight' has baseline 96.12 and its target is 72-116, with the border at 128, so the words end 23 above the border. At XL, the action's baselines are 506 and 567 (61-point lines), its text ends at 587, and the border is at 610, a gap of 23. Contract actionInsets says 'Action target can consume bottom inset at default; at wrapped sizes full12 below target content.'
- **Meanwhile and who acts:** Ask Claude Design to redraw the receipt with a 12 top inset and the stated bottom behaviour. The app keeps the contract values (12 top; the target stands in at default; 12 below once wrapped), as CompactReceipt.swift builds them.

### V-10 (should, app, confirmed)

- **Where:** open
- **Finding:** The contract makes the receipt's check disc scale with the row, which overrides the fixed 28 on the drop-card branch. The XL specimen's 64 is not proportional, so the app has no exact rule.
- **Evidence:** compactReceipt.checkDisc says {default 28, scalesWith 'row'}. The XL specimens draw 'rect x=36 y=28 width=64 height=64', with the check scaled 1.493, a factor of 2.29. The row grows from 17 to 53, a factor of 3.12, which would give a disc of 87. On ios/b0-drop-card, CompactReceipt.swift uses a fixed Size.receiptDisc and adds discDrop.
- **Meanwhile and who acts:** Change the disc and check to scale with the row (@ScaledMetric relative to TypeRole.row.textStyle) on ios/b0-drop-card, and record the reversal of 5858546. Ask Claude Design whether 64 at AX5 is a cap or an error.

### V-11 (should, app, confirmed)

- **Where:** open
- **Finding:** The sign-in redraws carry explained changes the app must build: a nav-bar Leave sign-in on A02-age and A03, footers 44 above the safe area, focus on arrival on A03, and 16 clear above the age button.
- **Evidence:** (1) ageExit.nav says 'Native leading Leave sign-in text action, no back chevron. Same on A03.' ProfileScreens.swift AgeScreen has both a chevron toolbar item and a bottom Leave sign-in, and ProfileScreen has no exit. (2) and (3): 'I’m 18 or older' and Retry are at 724-774 against the safe-area bottom at 818, matching spacing.formFooterToSafeAreaBottom 44. AgeScreen and RootFailure use SetupFooter(bottom: Spacing.s). (4) authForm.profileArrivalFocus says 'True at all sizes'. ProfileScreen focuses nothing on arrival. (5) The age failure line ends at 704 and the button starts at 724; IMPLEMENTATION asks for at least 16 clear. SetupFooter spacing is 8.
- **Meanwhile and who acts:** Build these in SignIn/ProfileScreens.swift, App/RootFailure.swift and SignIn/SetupLayout.swift (footer 44 above the safe-area bottom, 16 above the age button), and snapshot them.

### V-12 (should, app, confirmed)

- **Where:** open
- **Finding:** The resend row moves to the leading edge, and a resend failure gets its own block under 'Send a new code'. The app centres the row and puts every failure in the field's error region.
- **Evidence:** Redraw x positions: 'Send a new code' x=20, 'You can send a new code after one minute.' x=20, 'Change email address' x=20. Handoff 2 had x=134.7 and x=116.5. Resend target [20,407,353,44], directly after Verify ending at 399; Change email at [20,451]. authForm.resendFailure says 'Dedicated block below resend action, not the code validation block…'. SignInFlow.swift uses resendRow .padding(.top, Spacing.m), Change email .padding(.top, Spacing.xs), and errorRegion shows model.failure for every case.
- **Meanwhile and who acts:** Rebuild the code screen with a leading resend row 8 below Verify, Change email directly after it, and a separate resend-failure block (resendToFailure 8). Update INVENTORY.md's A02-code-resend-failed-network and A02-code-resend-refused rows and the known-differences line on failure placement.

### V-13 (should, app, adjusted)

- **Where:** open
- **Finding:** The no-club redraws replace the app's gaps from handoffs 2 and 4, make G06's body two paragraphs, set Go to Home leading and move + Add.
- **Evidence:** G06: body1 line box 191-214, body2 starts at 230 (16 apart); Create a club is 32 below the body (app TabGap.homeActions 72); Private drafts is 32 below I have an invite (app homeDrafts 56). F01: title 32 under the header (app pageTitle 24); empty title 32 below the drafts row (app friendsSection 24); body 16 below the empty title (app emptyTitleToBody 32); Create 24 below the body (app friendsActions 68). M01: title 32 under the header; empty title 32 below the title (app memoriesEmpty 92); body 16 (app 32); Go to Home 24 below (app goHome 56), at x=20 (handoff 2 x=153.4). Header + Add target [241,56,80,44], text at x=249 (handoff 6 x=282). HomeNoClub builds body1 and body2 as one Text with '\n'.
- **Meanwhile and who acts:** Update the TabGap constants in Tabs/TabLayout.swift (used by NoClubTabs.swift), split G06's body into two Texts 16 apart, set Go to Home leading, place + Add per noClubRootHeader.default, and re-snapshot G06, F01 and M01 in default, dark and XL.
- **Second reviewer:** The frame gaps are as stated. Line tops are baseline minus 0.82 × size, with utilityTitle 35, body 23 and emptyTitle 30. Three details are wrong. The app's Memories gap is TabGap.memoriesEmpty = 32+32+24+4 = 92, not 100. TabGap is defined in Tabs/TabLayout.swift, not NoClubTabs.swift. And G06's two lines are one Text joined by a newline in HomeNoClub, so the 16-point paragraph gap means splitting it into two Texts.

### V-14 (should, app, confirmed)

- **Where:** open
- **Finding:** The runtime 'Loading your account…' and 'Leaving sign-in…' screens are specified but not drawn. Nothing says how long to wait before showing them, to avoid a flash.
- **Evidence:** The contract says 'Native indeterminate spinner and root.loading. No header or tabs. Do not hold a static launch screen during a network wait.' IMPLEMENTATION line 76 says 'Replace it with a real native spinner and Loading your account…'. Copy keys: handoff7.root.loading and root.leaving. No frame in frames/ draws either screen. TadayoApp.swift RoutedView shows the canvas alone for .starting.
- **Meanwhile and who acts:** Build both from H01-loading-no-club's spinner and label form, without header or tabs, and mark them 'built from spec' in INVENTORY.md (global-launch row). Ask in the next handoff for the frame and for any delay before the spinner shows.

### V-15 (should, claude-design, confirmed)

- **Where:** open
- **Finding:** The M01 redraw changes the empty-state line to the past tense for an account with no club, with no replaces entry.
- **Evidence:** In handoff 7, M01-no-club and copy key noClub.memories.body read 'Days shared after you joined will appear here after they open.' historyBoundary.display (handoffs 2-6) reads 'Days shared after you join a club will appear here after they open.' handoff7.replaces lists noClub.title, body1, body2, create and invite, but nothing for the Memories line.
- **Meanwhile and who acts:** Ask Claude Design whether the change is intended. The app keeps the handoff 2 string until it confirms. This crosses into the copy lens.

### V-16 (note, none, refuted)

- **Where:** open
- **Finding:** At AX5 the XL frame and the qa probes show only the first part of a long error, by design. The rest is in the scroll content.
- **Evidence:** A02-code-error-xl: clip 104-436, Verify 464-549, error baselines 316, 370, 424, 478 and 532. authForm.AX5 says '…first part of long error…'. Brief item 19 says 'scrolled where iOS leaves it with the code field focused… Say in writing where the parts that don't fit sit.'
- **Meanwhile and who acts:** None beyond building the delivery's behaviour: keep the focused field in view, let the error continue in the scroll content, and announce the full words.
- **Second reviewer:** The brief's item 19 asked for A02-code-error-xl 'scrolled where iOS leaves it with the code field focused' and asked where the parts that don't fit sit. authForm.AX5 says the frame 'shows focused field and first part of long error… resend and Change email below error in scroll content', and IMPLEMENTATION says the error 'continues below the visible portion… reachable by scrolling'. The scroll clip ends at 436 and Verify starts at 464, so no text sits under the control. 'Grow/scroll rather than overwrite' is met, and the profile's rule only asks that the error be 'reachable'. Scrolling the whole error into view would push the focused field out, which is a design choice the app shouldn't make itself. VoiceOver announces the full words.

### V-17 (note, app, adjusted)

- **Where:** open
- **Finding:** The A02-code redraw changes the fixture from the empty arrival state to a typed code with Verify code available.
- **Evidence:** Handoff 1's A02-code: placeholder 'Enter code', Verify fill #E2E6DF. Handoff 7's redraw: '529614', Verify fill #284CDB. INVENTORY.md line 31 reads '| A02 Authentication | `A02-code` | Six-digit code | `screens/A02-code.png` | Handoff 1 | received |'.
- **Meanwhile and who acts:** Snapshot both states. Map the redraw to a typed-code state in INVENTORY.md, and keep handoff 1's render for arrival.
- **Second reviewer:** The fixture change is real. Handoff 1's A02-code has 'Enter code' and Verify in #E2E6DF. The redraw has '529614' and Verify in #284CDB. But INVENTORY line 31's description reads only 'Six-digit code'. It doesn't say 'on arrival'; it is the handoff 1 render that shows arrival.

### V-18 (note, claude-design, confirmed)

- **Where:** open
- **Finding:** Avatar initials are drawn off their type roles.
- **Evidence:** G06, F01, M01 and H01 headers draw 'B' at size 12.60. A03-profile and A03-profile-failed-network draw 'B' at 30.60. brand-tokens type: avatar28 13/18, avatarProfile68 28/34. Handoff 1's A03 'B' is 28.00 and handoff 2's F01 'B' is 13.00.
- **Meanwhile and who acts:** The app keeps the role sizes (TadayoDesign Avatar.swift). Ask Claude Design to correct the specimens.

### V-19 (note, app, confirmed)

- **Where:** open
- **Finding:** At XL, rows break the time across lines and start a line with a middle dot.
- **Evidence:** Sheet text lines '· Opens at 7' then 'AM', repeated in the XL upload rows, and '· 7 AM' in the XL collecting cards ('Opens / Friday, / November 13 / · 7 AM').
- **Meanwhile and who acts:** In the date and time format helpers, keep a no-break space between the number and AM/PM, and bind the middle dot to the word before it. Check at AX5 in the snapshots.

### V-20 (note, claude-design, confirmed)

- **Where:** open
- **Finding:** The size labels on the dark avatar-fallback specimen are unreadable.
- **Evidence:** Sheet group translate(644 11714): rect y 152-252 fill #D4D9EC, with labels filled #F7F8F2 at y 242.7. Contrast 1.32:1.
- **Meanwhile and who acts:** None for the app. Mention it to Claude Design.

### V-21 (note, none, adjusted)

- **Where:** open
- **Finding:** The tab bar, the nav-bar text action and the XL card symbols are drawn schematically, as the delivery says they are.
- **Evidence:** The tab bar uses outline icons. 'Leave sign-in' is size 16.00. The XL card lock and star use scale 1.5 (36 points), against a cardStatus of 44 and a Highlight of 42. precedence.native: 'Outlined Arimo reference frames are not UIKit screenshots… validate actual metrics on iOS.'
- **Meanwhile and who acts:** None needed. The app already uses native controls and @ScaledMetric. Confirm in the ios workflow snapshots, as usual.
- **Second reviewer:** The observations are true, but the delivery already answers them. Every SVG's desc says 'Native iOS chrome is schematic; use system controls in production', and precedence.native says to use native navigation, tab bar and Dynamic Type and validate metrics on iOS. The app already uses a native TabView (TabsView.swift) and scales the lock and star with @ScaledMetric (FoldedCard.swift lines 42-46). At XL the lock is drawn at 36 (proportional ≈ 41) and the star at 36 (its Highlight label is 42).

### V-22 (note, app, adjusted)

- **Where:** open
- **Finding:** The adaptive layout review's claims are boilerplate. Its probes depart from the contracts in places, including Verify code drawn as available with an empty field. Nothing native has been checked.
- **Evidence:** adaptive-layout-review.json: 16 entries with dark 'same geometry; revision1.1 dark roles; field errors and focus reviewed', largest 'adaptive scroll probe below' and nativeCheck 'pending iOS snapshots/device'. The JSON has no probe data. adaptive-probe-contact-sheet.jpg: the resending XL probe shows no indicator and dark text. The resend, resending and resend-failed XL probes show a blue Verify code over 'Enter code'. The email-empty XL probe shows 'Email addres' clipped. authForm.resendConcurrency says 'Verify remains unavailable even if the previous challenge has six digits.'
- **Meanwhile and who acts:** Treat the qa claims as unverified, and prove the states with the ios workflow's dark and AX5 snapshots. Keep Verify unavailable without six digits and during resend, and keep the indicator and secondaryText on the resend busy row at every size.
- **Second reviewer:** Confirmed. All 16 entries carry the same three strings, including six states with no field, and the JSON has only 'scope' and 'states'. The resending XL probe draws 'Sending a new code…' in dark text with no indicator. The email-empty XL probe clips 'Email address'. There is a further departure: the A02-code-resend, -resending and -resend-failed XL probes draw Verify code in the full action fill above an empty 'Enter code' field. That contradicts their own default frames (Verify #E2E6DF) and resendConcurrency.

### V-23 (note, claude-design, confirmed)

- **Where:** open
- **Finding:** The coffee thumbnail is stretched, and Maya's portrait is framed differently from handoffs 3 to 6.
- **Evidence:** Embedded coffee: 75x88 source, 152x184 image drawn at 76x92. The 2.1 C07-uploading thumbnail is about 75x88 at 1x. Maya's handoff 7 avatar images are 56x56 and 28x28, cropped from the render. Handoff 6's sheet images use preserveAspectRatio 'xMidYMid slice'. IMPLEMENTATION says 'Never distort, filter or tint.'
- **Meanwhile and who acts:** The app keeps its fixture images uniformly scaled (scaledToFill) with the earlier face-centred crop. Mention both to Claude Design.

### V-24 (note, claude-design, confirmed)

- **Where:** open
- **Finding:** The gaps from title to body are not named values and differ from handoff 1.
- **Evidence:** A02-age: title baseline 153.24 (box ending at 162), body baseline 236.94 (box starting at 223), a gap of 61. Handoff 1's A02-age: title baselines 161 and 196, body 246, about 27. global-launch-failed-network: 28. A02-email and A03: 18. SetupHeading uses subtitleGap Spacing.l by default, and AgeScreen passes Spacing.xxl.
- **Meanwhile and who acts:** The app keeps its values. Ask Claude Design to name the gap in the next handoff.

### VM-01 (should, app, missed)

- **Where:** open
- **Finding:** The profile's save failure goes under the name field in the scroll body. The app puts it in the pinned footer above Continue.
- **Evidence:** In A03-profile-failed-network, the field is at [20,292,353,54], with its bottom at 346. The error 'Couldn’t save your profile. Check your connection and try again.' starts its line box at 362, and Continue is pinned at 499. IMPLEMENTATION says 'Connection and server save messages use the same growing block under the field, with no invalid border for either.' In ProfileScreens.swift, ProfileScreen puts InlineError inside SetupFooter, above the Continue button (lines 105-108). INVENTORY.md line 394 says failures sit 'on A02-email, A02-age and A03-profile, above the button it names'.
- **Meanwhile and who acts:** Move the profile's save and refusal failures into the scroll content, 12 under the field, and keep them reachable above the pinned Continue. Update INVENTORY's known-differences line and snapshot the A03 failure states, default and AX5.

### VM-02 (should, app, missed)

- **Where:** open
- **Finding:** Continue must sit 12 above the keyboard, but the app's profile footer keeps 44 below it whether or not the keyboard is up. Once A03 is focused on arrival, the keyboard shows at once.
- **Evidence:** In A03-profile-empty and A03-profile, Continue is at 499-549 with the keyboard at 561, a gap of 12. The contract says spacing.formFooterToKeyboard 12 and formFooterToSafeAreaBottom 44, and authForm.keyboardFooter says 'pinned above keyboard with 12-point clear gap'. ProfileScreens.swift uses SetupFooter(bottom: SetupGap.profileFooter), which is 44, inside safeAreaInset(edge: .bottom), so it sits 44 above the keyboard once the field has focus.
- **Meanwhile and who acts:** Give SetupFooter two bottom values: 12 while the keyboard is shown, and 44 above the safe-area bottom otherwise. Apply them to Continue, and to Verify code if Claude Design confirms the pinned reading (V-02). Snapshot with and without the keyboard.

### VM-03 (should, app, missed)

- **Where:** open
- **Finding:** Every text action in the redraws is leading at x=20, including Add photo and Optional on A03, while the 68-point avatar stays centred. TadayoDesign's TextActionStyle centres every text action, and the change isn't written anywhere in the delivery.
- **Evidence:** Handoff 7: 'Change email address' x=20, 'Send a new code' x=20, 'Go to Home' x=20, 'Add photo' x=20 and 'Optional' x=20, with the avatar rect at 162.5-230.5. Handoffs 1 and 2: Change email x=116.5, Send a new code x=134.7, Go to Home x=153.4, Add photo x=160, Optional x=172.3 (all centred). TextAction.swift applies .multilineTextAlignment(.center) and .frame(maxWidth: .infinity, minHeight: 44), centred by default. ProfileScreens.swift centres the avatar, Add photo and Optional in one VStack with .frame(maxWidth: .infinity). Neither IMPLEMENTATION nor the handoff 7 contracts mention text-action alignment.
- **Meanwhile and who acts:** Make text actions leading in the sign-in, profile and no-club screens, for example through an alignment option on TextActionStyle. Keep the A03 avatar centred as drawn, and snapshot. Ask Claude Design in the next brief to confirm leading text actions and A03's mixed alignment.

### VM-04 (should, app, missed)

- **Where:** open
- **Finding:** The resending row is drawn in textAction 16 with a native indicator before the words. The app shows it in metadata 13, centred, with no indicator.
- **Evidence:** In A02-code-resending, 'Sending a new code…' is size 16.00, fill #607067, at x=44, with spinner strokes in #607067 starting at about x=20 (a 16-point indicator, then 8). IMPLEMENTATION line 46 says 'During resend, use Sending a new code… in textAction, with a small native activity indicator, secondaryText.' In SignInFlow.swift, resendRow uses waiting('auth.code.resending'), which is Text with .textRole(.metadata) and .multilineTextAlignment(.center), and no ProgressView.
- **Meanwhile and who acts:** Build the busy resend row as a native ProgressView (16, secondaryText), 8 before 'Sending a new code…' in textAction and secondaryText, leading, in the 44-point row. Keep it the same at every text size, and snapshot A02-code-resending at default and AX5.

### VM-05 (should, app, missed)

- **Where:** open
- **Finding:** At every accessibility size the no-club header now stacks, with + Add leading on its own row and Account trailing. The app's header stacks only when the row doesn't fit, and keeps + Add and Account together at the trailing edge.
- **Evidence:** noClubRootHeader.largest says 'At all accessibility categories, wordmark row then actions row', headerHeight 124, addTarget [20,104,249,76] and accountTarget [329,120,44,44]. G06-no-club-xl draws '+ Add' at the leading edge under the wordmark, with Account trailing. NoClubHeader.swift uses ViewThatFits(in: .horizontal), which stacks only when the row overflows, and its stacked row sets actions.frame(maxWidth: .infinity, alignment: .trailing), keeping + Add and Account side by side at the trailing edge.
- **Meanwhile and who acts:** Stack the header at every accessibility size (dynamicTypeSize.isAccessibilitySize), with + Add leading in its own target and Account trailing, as the contract's AX5 rectangles show. Snapshot G06, F01 and M01 at AX5.

## Consistency, the build, the inventory and the questions

*Reviewer's summary:* I checked handoff 7 for consistency and integrity, and for what the build, the inventory and QUESTIONS now need. Most of it holds together. Every key in handoff7.replaces resolves. The manifest's 30 entries (29 phone frames and the sheet) match the files. The written answers cover almost every item in the ios lane's needs list: 30 of the 32 items in scope are answered, 2 are partly answered (13b, 21), and item 18 doesn't apply.

**What Claude Design needs to fix in the delivery:**
- **Silent copy change.** noClub.memories.body rewords historyBoundary.display without a replaces entry, and the M01-no-club redraw draws the new words.
- **Missing line.** G06-no-club-xl leaves out "Create a club or open an invitation."
- **Back control.** The code screen's Back is drawn and listed as active while verifying and resending. The written answer says it is unavailable.
- **Verify code placement.** It is pinned above the keyboard only at AX5. The keyboardFooter contract asks for it pinned, but the default frames keep it in the flow.
- **Field-to-error gap.** It is drawn about 2, 5 and 13 points in different frames, against fieldErrorGap 12.
- **Subtitle-to-field gap.** On A02-code it is 32 points shorter than on A02-email, although the redraws were meant to share the spacing.
- **Receipt specimen.** It leaves about 30 points under Make my highlight; the contract says the target stands in for the bottom inset.
- **Body ink.** Body lines moved from secondaryText to primaryText, with no contract or replaces entry.
- **No-club tab bodies.** The F01 and M01 redraws move the body text beyond their declared scope, which is the header.
- **Date template.** drop.collecting.opening splits the date into a weekday and a month-day. That bakes en-US order into the string, against FQ44's Default.
- **Validation report.** It has no contrast check, no hash check beyond the brand bytes and no key-coverage check, so none of those is validated by the delivery.

**For the founder:** one correction to a Default. FQ91(c) reads the revealed item as one combined element; the delivery splits it into separate elements, which spec 15 favours.

**Changes the app must make,** where the delivery answers its "Built:" readings:
- sign-in busy states;
- email placeholder, invalid-address line and signed-out notice;
- resend failure in its own block, plus the resending spinner and the two announcements;
- Leave sign-in on A02-age and A03;
- A03 focused on arrival, with Continue pinned 12 above the keyboard and its errors under the field;
- the person fallback and initial rule;
- the runtime loading and leaving screen;
- root failure placement and Retry hints;
- header geometry and stacking;
- error tab titles;
- leading text actions;
- drop card: the scaling receipt disc, the own Highlight on its own line, the highlight cover metrics, and the upload row's date line and caption ink.

**INVENTORY.md:**
- move 16 rows to received;
- add the five dark and largest-text rows and five new states;
- re-source the eight redraws;
- correct six row texts;
- rewrite the Known differences.

**QUESTIONS.md:** update FQ44, FQ58, FQ69, FQ70, FQ86, FQ89, FQ90 and FQ91. Claude Design's confirmation closes none of them.


### X-01 (must, claude-design, confirmed)

- **Where:** M01-no-club
- **Finding:** handoff7.noClub.memories.body rewords historyBoundary.display without a replaces entry. The old line is "Days shared after you join a club will appear here after they open." The new line is "Days shared after you joined will appear here after they open." The M01-no-club redraw draws the new words. On a screen for someone with no club, "after you joined" reads as if a club had already been joined.
- **Evidence:** copy-contracts.json historyBoundary.display vs handoff7.noClub.memories.body; handoff7.replaces has no entry for it; screen-copy.json M01-no-club visibleStrings; handoff 2 screen-copy M01-no-club; apps/ios/Tadayo/Localizable.xcstrings line 587.
- **Meanwhile and who acts:** Claude Design withdraws the rewording, or lists it under replaces with a reason. Meanwhile the app keeps the earlier line (MemoriesNoClub, NoClubTabs.swift), and INVENTORY's M01-no-club row records the difference.

### X-02 (must, claude-design, confirmed)

- **Where:** G06-no-club-xl
- **Finding:** The largest-text G06 frame leaves out noClub.body2, "Create a club or open an invitation.". The default and dark frames keep it. This is not a scroll crop: Create a club follows "people." directly.
- **Evidence:** frames/G06-no-club-xl.svg aria-label order and PNG; frames/G06-no-club.svg and G06-no-club-dark.svg; screen-copy.json G06-no-club-xl visibleStrings and notes.
- **Meanwhile and who acts:** Claude Design redraws G06-no-club-xl with the line, or says in writing why it drops. The app shows both lines at every size (HomeNoClub, NoClubTabs.swift). INVENTORY's Known differences records the frame's omission.

### X-03 (should, claude-design, confirmed)

- **Where:** A02-code-verifying, A02-code-resending
- **Finding:** The verifying and resending frames draw the navigation Back at rest, and screen-copy lists it as enabled. The written answer and the contract say Back is unavailable while a request runs.
- **Evidence:** screen-copy.json controls for A02-code-verifying and A02-code-resending; chevron stroke #284CDB in both SVGs; IMPLEMENTATION.md section 2; component-contracts handoff7.authForm.codeBack.
- **Meanwhile and who acts:** Claude Design corrects the frames and screen-copy, and says whether an unavailable Back is hidden or dimmed. Meanwhile the app keeps Back hidden while a request runs (navigationBarBackButtonHidden(!model.canChangeEmail), SignInFlow.swift).

### X-04 (should, claude-design, confirmed)

- **Where:** A02-code, A02-code-error, A02-code-verifying, A02-code-resend*, A02-code-error-xl
- **Finding:** The keyboardFooter contract pins Verify code 12 above the keyboard. Only the AX5 frame does that. The default code frames keep it in the flow, about 162 above the keyboard. The contract also doesn't say where the resend row and Change email address go once Verify code is pinned.
- **Evidence:** A02-code, A02-code-error, A02-code-verifying, A02-code-resend frames (Verify code [20,349,353,50], keyboard top 561); A02-code-error-xl (Verify code [20,464,353,85]) and its note; A03-profile-empty; component-contracts handoff7.authForm.keyboardFooter.
- **Meanwhile and who acts:** Claude Design says whether Verify code is pinned at every size, and where the resend row and Change email address sit if so. Until then the app keeps Verify code in the flow (CodeScreen, SignInFlow.swift) and pins A03's Continue (X-19).

### X-05 (should, claude-design, adjusted)

- **Where:** A02-email-failed-network, A02-code-error, A02-code-verify-failed-network, A02-code-resend-failed-network, A03-profile-failed-network
- **Finding:** The gap from the field to its error line is drawn three ways: about 2 on A02-email, about 5 on A02-code and about 13 on A03. The contract's fieldErrorGap is 12. The resend failure sits about 5 under its row, against resendToFailure 8.
- **Evidence:** A02-email-failed-network (field bottom 321, error baseline 336.66, icon at y 328); A02-code-error and A02-code-verify-failed-network (289, 307.66); A03-profile-failed-network (Your name [20,292,353,54], baseline 372.66); A02-code-resend-failed-network (row ends 451, baseline 469.66); component-contracts handoff7.spacing.
- **Meanwhile and who acts:** Claude Design aligns the frames with the contract, or corrects the contract. The app builds the contract's values: 12 under the field on A02-email and A02-code (InlineError at Spacing.m today), and the same 12 under the field and 8 under the resend row when it makes the X-19 and X-17 changes.
- **Second reviewer:** The measurements hold. The gap from the field's bottom to the error's line box is about 2 on A02-email (field 321, baseline 336.66), about 5 on A02-code (289, 307.66) and about 13 on A03 (field at 292 to 346 in screen space, baseline 372.66). Measured to the error icon's top instead, the gaps are about 8, 11 and 19. Either way the three screens differ and none shows 12. The resend failure's line box starts about 5 under its 44-point row, against resendToFailure 8. The action, however, misdescribes the build. ProfileScreens.swift puts the profile error in the footer, 8 above Continue, not 12 under the field. The build has no separate resend-failure block yet: X-17 and X-19 add both.

### X-06 (should, claude-design, adjusted)

- **Where:** A02-code and its states
- **Finding:** The redraws were meant to share the sign-in spacing, but the gap from the subtitle to the field label differs. On A02-email it is about 39 (line box to line box). On A02-code, under "Sent to", it is about 7. Handoffs 1 and 2 drew about 41 on both. No contract value states it.
- **Evidence:** frames/A02-email.svg and A02-email-empty.svg (subtitle baseline 193.94, label 251.66, field 267); A02-code.svg (193.94, 219.66, field 235); handoff 1 A02-email and A02-code (192, 252, field 263); handoff6.spacing.basis.
- **Meanwhile and who acts:** Claude Design states the subtitle-to-label gap for both screens. Until then the app keeps SetupGap.field (SetupLayout.swift) on both.
- **Second reviewer:** The difference is real. Handoffs 1 and 2 put both fields at y 263, with the label's line box about 41 under the subtitle's. In handoff 7, A02-email keeps about 39 (subtitle line box ends 199.5, label line box starts 238.2). A02-code shrinks to about 7 (label line box starts 206.2), 32 less. The evidence is slightly off, though. 25.7 is a baseline-to-baseline distance, and the book's scale measures line-box gaps (handoff6.spacing.basis), so "25.7 isn't on the scale" isn't the right test. Both line-box gaps (about 7 and 39) are also unnamed.

### X-07 (should, claude-design, confirmed)

- **Where:** A02-email, A03-profile, G06-no-club, F01-no-club, M01-no-club, H01/F01-error-no-club, global-launch-failed-network
- **Finding:** The redraws and new frames move explanatory body lines from secondaryText #607067 to primaryText #182B25. No contract or replaces entry states this. "Sent to", the email helper and Optional stay #607067, so it isn't one uniform rule either.
- **Evidence:** Text fills in the handoff 7 frame SVGs vs the same strings in handoffs 1, 2 and 4, and handoff 6's H01-access-lost; component-contracts handoff7 (no body ink entry).
- **Meanwhile and who acts:** Claude Design states the body ink rule and lists it under replaces, or restores secondaryText. Until then the app keeps secondaryText: SetupHeading (SetupLayout.swift), EmptyLine and HomeNoClub (NoClubTabs.swift), TabContent's failure line (TabLayout.swift), and RootFailure through SetupHeading.

### X-08 (should, claude-design, confirmed)

- **Where:** F01-no-club, M01-no-club
- **Finding:** The F01 and M01 redraws also move the body, beyond the header scope IMPLEMENTATION section 1 declares. F01's empty title now ends about 16 above its line, where handoff 2 had about 33. M01's empty title moves up from baseline 274 to 219.5, and the line and Go to Home follow. No contract gives these values.
- **Evidence:** frames/F01-no-club.svg and M01-no-club.svg vs handoff 2's; component-contracts handoff7.replaces and noClubRootHeader.contentStart; handoff6.spacing.
- **Meanwhile and who acts:** Claude Design lists the body changes under replaces with values, or says they are unintended. Until then the app keeps handoff 2's positions (TabGap, TabLayout.swift). It takes from the redraws only the header (X-23) and the leading text actions (X-25).

### X-09 (note, none, adjusted)

- **Where:** Compact receipt with Make my highlight (sheet)
- **Finding:** The sheet's default receipt with Make my highlight keeps the full 12-point inset below the 44-point target: 116 high against 72 without the action. The contract and IMPLEMENTATION only say the target "can" stand in for the bottom inset at the default size. So the build's reading, with the words about 13 above the border, is allowed, and the specimen shows the other option.
- **Evidence:** Sheet specimen 'Compact receipt · action' (y 23798): box 12 to 128, action baseline 96.12; 'Compact receipt · no action' box height 72; component-contracts handoff7.compactReceipt.actionInsets; IMPLEMENTATION section 5; CompactReceipt.swift bottomPadding.
- **Meanwhile and who acts:** None now. The app keeps its padding, which the contract permits. A later brief can ask which option the specimen means.
- **Second reviewer:** The measurement is right. The action receipt box is 116 high, which is the 72-high no-action receipt plus exactly 44. So the target starts at the end of the metadata line and the full bottom inset stays below it: the words' line box ends about 26 above the border, and the ink about 28. But the contract doesn't require the other reading. It says the target "can consume bottom inset at default", and IMPLEMENTATION says it "can stand in for bottom padding". Both are permissive, so they allow the build's reading (CompactReceipt bottomPadding = max(0, 12 − max(0, (44 − 22)/2))), which sits closer to 2.1's F02-added (about 17). The specimen draws the other permitted option, so the delivery isn't in error and the build needs no change.

### X-10 (should, claude-design, confirmed)

- **Where:** Drop · collecting (folded card status line)
- **Finding:** drop.collecting.opening splits the date into {weekday} and {monthDay} with a fixed comma between them, so the string itself sets en-US order and punctuation instead of the date template. The drawn en-US result, "Opens Friday, November 13 · 7 AM", is what the app already shows.
- **Evidence:** copy-contracts.json handoff7.drop.collecting.opening and handoff7.replaces; handoff5.card.status (line 623); docs/QUESTIONS.md FQ44 Default.
- **Meanwhile and who acts:** Claude Design keeps the date as one template-formatted parameter, or says why not. The app keeps card.status with one {fullDate} (TadayoDesign's Localizable.xcstrings), and FQ44 records the point (X-34).

### X-11 (note, none, confirmed)

- **Where:** copy-contracts.json, component-contracts.json
- **Finding:** Several handoff 7 keys repeat earlier keys word for word without a replaces entry:
- root.retry and drop.retry;
- header.add and header.account;
- tabs.* and common.back;
- vo.home.error.network.
Nothing is overridden, but nothing says which key is authoritative. drop.highlight's replaces entry points at a component-contracts key. Component replaces scopes are prose that no check can resolve.
- **Evidence:** copy-contracts.json handoff7 vs handoffs 3 to 6 and failureStates; component-contracts.json handoff7.replaces.
- **Meanwhile and who acts:** None now. The app keeps the earlier keys wherever the words match. A later brief can ask for replaces entries for duplicates and for key-level component scopes.

### X-12 (note, none, confirmed)

- **Where:** validation-report.json
- **Finding:** All 611 checks pass, but none checks contrast, hashes anything beyond the brand bytes, or checks that screen strings are covered by keys, so the delivery doesn't validate those. A target check passes A03-profile-empty-xl's Add photo at [20,-100,353,83], which is off the frame. nativeAudit is "Not run".
- **Evidence:** validation-report.json checks, scope, nativeAudit and visualReview; screen-copy.json A03-profile-empty-xl.
- **Meanwhile and who acts:** None for the delivery. The app's own checks remain the proof: the copy lint, the snapshot route at 393, 320 and 430 points, and contrast checked for any new ink pairing in the slice that builds it.

### X-13 (note, app, adjusted)

- **Where:** screen-copy.json
- **Finding:** The frames give Account and Retry empty hints, while the copy has header.accountHint ("Open your account.") and a Retry hint for each tab and root failure. Leave sign-in has no hint key, so its empty hint is consistent. The sheet's screen-copy entry lists only annotations, so its specimen strings can't be checked against the copy.
- **Evidence:** screen-copy.json controls (H01-error-no-club Account and Retry; global-launch-failed-network Retry); copy-contracts handoff7.header.accountHint and vo.retry*.hint; NoClubHeader.swift (Account has no accessibilityHint).
- **Meanwhile and who acts:** The app adds header.accountHint to NoClubHeader's Account button and the key to the catalog, and takes the Retry hints as X-22 and X-24 say. Claude Design fills the hints and the sheet's strings next time.
- **Second reviewer:** screen-copy gives empty hints for Account and Retry in every frame, while the copy has header.accountHint "Open your account." and the vo.retry*.hint keys. That part holds. Leave sign-in, however, has no hint key in handoff7: vo.retryLeave.hint is Retry's hint on the leave failure screen, not a hint for the Leave sign-in button. So its empty hint matches the copy. The brand-components entry lists only the sheet's annotations. The action also misses one app change. X-22 and X-24 cover the Retry hints, but nothing covers header.accountHint, a new key that NoClubHeader doesn't set: its Account button has only accessibilityLabel.

### X-14 (note, none, adjusted)

- **Where:** brand-components (handoff 7 section)
- **Finding:** The busy button and the highlight covers' expanded row appear on the sheet at the default size only. The brief didn't ask for them at the largest size, and the busy spinner's large-text row is stated in writing. A field with an error at AX5 is drawn in A02-code-error-xl.
- **Evidence:** component-sample-index.json xl flags; frames/A02-code-error-xl.png; component-contracts handoff7.busyPrimary.layout and highlightCover.listStartsAt; ios-lane-needs.md items 21 and 22.
- **Meanwhile and who acts:** None now. The app builds the busy button's large-text row from busyPrimary.layout and snapshots it at AX5. A later brief may ask for these specimens at the largest size.
- **Second reviewer:** The sample index is right: 'Primary action · busy', the three 'Field · …' specimens and 'Highlight covers and expanded row' are xl: false. But the cited rule doesn't ask for them at the largest size. Needs item 21 asks for the drop card's states at the largest size, and the sheet has all of them. Needs item 22 asks when the rail becomes a list, which is answered in writing (extraLarge). Brief items 17a, 17b and 17f don't ask for the largest size. The field part is also wrong: frame 19, A02-code-error-xl, draws a focused field with the error icon, invalid border and wrapped lines at AX5. The busy spinner's own row at large text is given in writing only (busyPrimary.layout).

### X-15 (should, app, confirmed)

- **Where:** A02-email-sending, A02-code-verifying, A02-age-saving, A03-profile-saving
- **Finding:** The delivery's busy button:
- keeps action/onAction;
- puts a 16-point native spinner 8 before the centred label, in symmetric 24-point slots;
- moves the spinner to its own row at large text;
- gives the value "In progress";
- makes one announcement per action;
- makes the field read-only while keeping first responder.
The build puts the indicator at the trailing edge, in slots sized to the indicator. It has no value and no announcement, and leaves the email and code fields editable while busy.
- **Evidence:** frames/A02-email-sending.svg; component-contracts handoff7.busyPrimary; copy handoff7.announcementPolicy.busy and vo.*.busy; PrimaryButton.swift (PrimaryButtonFace); SignInFlow.swift; ProfileScreens.swift; SignInModel.swift.
- **Meanwhile and who acts:** In PrimaryButton.swift: show the indicator in the leading slot, make both slots 24, stack it above the label at accessibility sizes, and add the value. In SignInFlow.swift and ProfileScreens.swift: announce each action once, and make the field read-only, not disabled, while busy. Add the keys. Snapshot every busy state at default, dark and AX5.

### X-16 (should, app, confirmed)

- **Where:** A02-email-empty, A02-email-invalid (new), A02-email-signed-out
- **Finding:** The delivery adds three things:
- the placeholder "Email address";
- "Enter a valid email address." with the invalid border, for a real address-format rejection;
- "Your sign-in ended. Enter your email to sign in again." as a neutral notice above the field after a server-ended session.
The build has none of them.
- **Evidence:** frames/A02-email-empty.svg; copy-contracts handoff7.auth.email.placeholder/.invalid/.signedOut; EmailScreen in SignInFlow.swift; SignInModel.swift; INVENTORY.md line 396.
- **Meanwhile and who acts:** In EmailScreen: add the placeholder, and the notice when RootModel returns from a server-ended session. In SignInModel: add an invalid-address failure mapped from the sign-in service's format rejection, shown with LabelledField's invalid border. Add the keys.

### X-17 (should, app, confirmed)

- **Where:** A02-code-resend, A02-code-resending, A02-code-resend-failed-network, A02-code-resend-refused, A02-code with both errors (new)
- **Finding:** The delivery:
- puts a resend failure in its own block below the resend action, alongside any wrong-code line;
- shows resending as "Sending a new code…" in textAction secondaryText with a small spinner;
- announces availability and success with their own sentences;
- puts the resend row 8 below Verify code, with Change email address directly under it.
The build keeps one failure, clears a code error on resend, shows metadata text with no spinner, announces only "Send a new code", and uses gaps of 12 and 4.
- **Evidence:** frames A02-code-resend, A02-code-resending, A02-code-resend-failed-network; SignInModel.swift resend(); CodeScreen and resendRow in SignInFlow.swift.
- **Meanwhile and who acts:** In SignInModel.swift: add a separate resendFailure that resend() sets, and stop resend() clearing the code error. In CodeScreen: draw the resend failure block under resendRow, the spinner and textAction while resending, gaps of 8 and 0, and the two announcements. Add the keys.

### X-18 (should, app, confirmed)

- **Where:** A02-age, A02-age-saving, A02-age-failed-network, A02-age-refused
- **Finding:** The delivery:
- replaces the chevron with a native leading "Leave sign-in" text action;
- removes the bottom Leave sign-in;
- makes Leave inactive while saving;
- gives the failures their own age-confirmation words, at least 16 above the button;
- ends I’m 18 or older 44 above the bottom safe area.
The build has a toolbar chevron plus a bottom Leave sign-in that are never disabled. It reuses the profile's failure words, puts the error 8 above the button, and ends the footer 8 above the safe area.
- **Evidence:** screen-copy.json A02-age and A02-age-failed-network; component-contracts handoff7.ageExit and spacing.formFooterToSafeAreaBottom; AgeScreen in ProfileScreens.swift.
- **Meanwhile and who acts:** In AgeScreen: put a leading toolbar text action, remove the bottom one, disable Leave while model.isSaving, use the age-specific words, set the error gap to 16 and SetupFooter's bottom to 44. Add the keys. Update INVENTORY's A02-age rows (X-33).

### X-19 (should, app, confirmed)

- **Where:** A03-profile, A03-profile-empty, -saving, -failed-network, -refused, -name-too-long, -name-refused
- **Finding:** The delivery:
- gives A03 the same leading Leave sign-in;
- focuses the name field on arrival at every size, with Continue 12 above the keyboard;
- puts save failures under the field with no border;
- adds the too-long line, and the name-refused line with the invalid border;
- makes the field read-only and Add photo and Leave inactive while saving;
- draws Add photo and Optional leading.
The build has no exit and doesn't focus on arrival. It puts errors in the footer, keeps Continue 44 above the keyboard, shows no line for a long name, and centres Add photo and Optional.
- **Evidence:** frames/A03-profile-empty.svg, A03-profile-failed-network.svg, A03-profile-empty-xl.svg; component-contracts handoff7.authForm and ageExit; ProfileScreen in ProfileScreens.swift; SetupGap.profileFooter in SetupLayout.swift; ProfileModel.swift.
- **Meanwhile and who acts:** In ProfileScreen:
- add Leave sign-in;
- focus the field on arrival;
- put the footer 12 above the keyboard;
- move errors under the field and add the too-long line;
- make the field read-only, and Add photo and Leave inactive, while saving.
In ProfileModel.swift: add a nameRefused failure from the API's refusal. Add the keys. The name field's placeholder is BM-02.

### X-20 (should, app, confirmed)

- **Where:** A03-profile-empty; every avatar
- **Finding:** The delivery shows the native outlined person symbol at 56% of the avatar when there is no readable initial. It takes an initial only from a first grapheme that is a letter or a decimal digit, and keeps combining marks. The profile control says "No profile photo". The build's Avatar draws an empty circle for an empty name, and uses any first character, emoji and punctuation included.
- **Evidence:** frames/A03-profile-empty.svg; the sheet's 'Avatar with no readable initial'; component-contracts handoff7.avatarWithoutInitial; Avatar.swift initial(of:).
- **Meanwhile and who acts:** In Avatar.swift: apply the letter-or-digit rule and the person-symbol fallback at 56%. Add snapshot and unit tests for empty, emoji, combining-mark, digit and non-Latin names. Give ProfileScreen's photo control the "No profile photo" label.

### X-21 (should, app, confirmed)

- **Where:** global-launch, global-leaving (new)
- **Finding:** Once the app can draw, the delivery shows a native spinner with "Loading your account…" during the account read and "Leaving sign-in…" while the session is removed, with no header and no tabs. The OS launch screen stays canvas only. After a verified code, the busy Verify code covers the wait. The build shows the canvas alone in both cases.
- **Evidence:** IMPLEMENTATION section 4; component-contracts handoff7.launch; TadayoApp.swift (RoutedView, case .starting); RootModel.swift start() and endSession().
- **Meanwhile and who acts:** Split .starting into loading and leaving in RootModel, and draw the spinner with its label in RoutedView. Add the keys and snapshot both. Update INVENTORY's global-launch row and add global-leaving (X-33). No frame places them, so mark both built from spec.

### X-22 (should, app, confirmed)

- **Where:** global-launch-failed-network, global-launch-refused, global-leave-failed, global-sign-in-not-kept
- **Finding:** The root failure frame sets the title where the sign-in screens' titles sit under their navigation bar, and puts Retry 44 above the bottom safe area. The copy gives Retry a hint for each failure. The build starts the title 20 under the safe area, ends the footer 8 above it, and gives Retry no hint.
- **Evidence:** frames/global-launch-failed-network.svg; copy-contracts handoff7.vo.retryAccount/Leave/Keep.hint; RootFailure.swift.
- **Meanwhile and who acts:** In RootFailure.swift: offset the title to match the sign-in screens, set the footer's bottom to 44, and set Retry's accessibilityHint for each kind from the three hint keys.

### X-23 (should, app, confirmed)

- **Where:** G06-no-club, F01-no-club, M01-no-club, H01/F01-loading-no-club, H01/F01-error-no-club
- **Finding:** At 393 points the delivery puts + Add at [241,56,80,44] and Account at [329,56,44,44], with the avatar at [337,64,28,28]. At every accessibility size the header stacks, with + Add leading. The header scrolls away over an opaque canvas band behind the status bar on iOS 17, 18 and 26. The build sizes + Add to its words, ends the avatar 20 from the edge, stacks only when the row doesn't fit with the actions trailing, and has no band.
- **Evidence:** screen-copy.json G06-no-club, H01-error-no-club and G06-no-club-xl controls; component-contracts handoff7.noClubRootHeader; NoClubHeader.swift; TabScroll in TabLayout.swift.
- **Meanwhile and who acts:** In NoClubHeader.swift: set the target rectangles, and stack at every accessibility size with + Add leading. In TabScroll: add the canvas band. Snapshot at default, AX5 and 320 points. Drop the answered readings from INVENTORY's Known differences.

### X-24 (should, app, confirmed)

- **Where:** H01-error-no-club, F01-error-no-club, M01-error-no-club and their -refused rows
- **Finding:** The error tabs draw the title in utilityTitle 32/35, 32 below the header, with the line 24 below it and Retry pinned above the tab bar with a hint naming the tab. The build draws the title in emptyTitle 25/30, and Retry has no hint. The line's ink is X-07.
- **Evidence:** frames/H01-error-no-club.svg and F01-error-no-club.svg; copy-contracts handoff7.vo.retryHome/Friends/Memories.hint; TabContent in TabLayout.swift.
- **Meanwhile and who acts:** In TabContent: use utilityTitle for the failure title, and add Retry's accessibilityHint for each tab. The not-in-this-build title stays as built until it is drawn.

### X-25 (should, app, adjusted)

- **Where:** A02-code-resend, A02-code-error, A02-code-verifying, A03-profile, A03-profile-empty, M01-no-club
- **Finding:** Every handoff 7 frame, and the sheet's text-action specimen, draw text actions leading at the 20-point inset: the resend row (its waiting sentence included), Change email address, Add photo and Go to Home. The build's TextAction centres its words across the full width, and CodeScreen centres the resend row's sentences.
- **Evidence:** Frame SVGs (labels from x 20); sheet specimen at y 11074 ("Send a new code" x 20); component-contracts handoff7.precedence.existingSheet; TextAction.swift; CodeScreen.waiting in SignInFlow.swift.
- **Meanwhile and who acts:** Make TextAction leading-aligned, keeping its full-width 44-point target. Make CodeScreen's waiting and resending lines leading. Re-check every screen that uses them in the snapshots.
- **Second reviewer:** Every handoff 7 frame draws text actions leading at x 20. The finding holds, and the evidence is stronger than it says. The sheet's new specimen 'Secondary action, Private drafts and text action' draws "Send a new code" from x 20. component-contracts handoff7.precedence.existingSheet makes an H7 specimen current for its named scope. The action is incomplete, though. In the resend row, the waiting sentence and the resending line are not TextAction buttons. CodeScreen.waiting(_:) draws them centred (multilineTextAlignment(.center) in a centred frame), while the frames draw "You can send a new code after one minute." at x 20 and "Sending a new code…" at x 44, after its spinner.

### X-26 (should, app, confirmed)

- **Where:** Compact receipt (Lab-receipt)
- **Finding:** The delivery's check disc is 28 at the default size and grows with row text, about 64 at AX5. This corrects the build's fixed 28-point disc and 12-point check, which leaned on avatarMarks, a rule that doesn't cover the check. The copy also gives Make my highlight a hint, which the build lacks.
- **Evidence:** Sheet 'Compact receipt · largest text' specimens (disc 64); component-contracts handoff7.compactReceipt.checkDisc; handoff4.dynamicTypePolicy.avatarMarks; copy handoff7.vo.receipt.highlightHint; CompactReceipt.swift (ios/b0-drop-card).
- **Meanwhile and who acts:** In CompactReceipt.swift: scale the disc and the check with @ScaledMetric(relativeTo: row), and add the hint. Snapshot Lab-receipt at AX5 and 320 points. Update INVENTORY's Known differences ("The compact receipt").

### X-27 (should, app, confirmed)

- **Where:** Drop · collecting, author’s Highlight
- **Finding:** The delivery puts the author's own Highlight (star.fill 12, gap 4, Highlight) on its own line after the caption, before the sender row, at every width. The build puts it at the end of the status line while both fit, and under the status line otherwise.
- **Evidence:** Sheet 'Drop · collecting, author’s Highlight' specimens; component-contracts handoff7.dropShapes.collectingCard.ownHighlight; FoldedCard.swift (highlightTag in the status ViewThatFits).
- **Meanwhile and who acts:** In FoldedCard.swift: move highlightTag to its own line after the caption, 12 below it. The VoiceOver order already matches vo.drop.collecting.ownHighlight.

### X-28 (should, app, adjusted)

- **Where:** Highlight covers and expanded row
- **Finding:** The delivery's expanded row has a 28-point avatar aligned with the label's first line, with the label 12 after it. The tile's star starts 55 from the left and 11 from the top. The build uses a 36-point row avatar 16 before the label, and puts the tile star at x 57, 22 from the trailing edge. Both put rows 12 apart.
- **Evidence:** component-contracts handoff7.highlightCover.row and star.tileOrigin; sheet 'Highlight covers and expanded row' (row avatar 44 to 72, label x 84, tile star at translate(75 23) inside its group); HighlightCover.swift; LabHighlights in LabView.swift; AvatarSize.row = 36.
- **Meanwhile and who acts:** In HighlightCover.swift: set the row avatar to 28, the avatar-to-label gap to 12 as drawn, and the tile star's trailing offset to 24. Re-snapshot the rail and the list.
- **Second reviewer:** Part of the finding is wrong. The build's highlight rows are 12 apart, not 16: LabHighlights stacks them with VStackLayout(spacing: Spacing.m), INVENTORY records "rows 12 apart", and the brief itself says "built 12". The 16 in the build is the avatar-to-label spacing (HStack spacing Spacing.l). The specimen draws that gap as 12 (avatar 44 to 72, label from x 84), and no contract states it. The rest holds. The row avatar is 36 in the build (AvatarSize.row) against 28 in the delivery. The tile's star is at x 57 (trailing padding fold 18 + 4) against 55 (tileOrigin [55, 11]).

### X-29 (should, app, confirmed)

- **Where:** Drop · pending, uploading, processing, failed (thumbnail rows)
- **Finding:** The delivery's upload rows read "November 13 · Opens at 7 AM", draw the caption in primaryText, and give progress as "{percentage} percent". The build reads "November 13 · 7 AM", draws the caption in secondaryText, and gives "57%". The pending and failed rows aren't built yet (B4).
- **Evidence:** Sheet thumbnail specimens; copy handoff7.drop.opening and vo.drop.progress; TadayoDesign Localizable.xcstrings drop.when; DropRows.swift UploadRow.
- **Meanwhile and who acts:** Change drop.when to the delivered form, draw UploadRow's caption in primaryText, and take the progress value from the template. Add the pending and failed rows in B4.

### X-30 (note, app, confirmed)

- **Where:** Drop · draft
- **Finding:** The sheet's draft row has no chevron. The build adds one, borrowed from privateDraftsEntry.
- **Evidence:** Sheet 'Drop · draft' specimens; DraftRow in DropRows.swift.
- **Meanwhile and who acts:** Remove DraftRow's chevron, unless the drafts list becomes a native navigation list that adds its own. Record this in INVENTORY.

### X-31 (note, app, confirmed)

- **Where:** Drop · revealed
- **Finding:** Portrait and landscape photos fill the 353:304 viewport, and a text screenshot is fitted inside it. The build always fills, and the B0 model has no media kind to tell a screenshot apart.
- **Evidence:** component-contracts handoff7.dropShapes.revealedItem.photoAspect; IMPLEMENTATION section 5; RevealedDropView.swift.
- **Meanwhile and who acts:** Fit a text screenshot when the revealed item's media kind arrives (B5). Record it in INVENTORY meanwhile.

### X-32 (should, app, adjusted)

- **Where:** Drop · revealed (VoiceOver)
- **Finding:** The delivery makes the revealed item a container of separate accessibility elements: sender, More options (B6), selectable caption with a Copy caption action, photo ("Photo." or "Photo. Highlight."), and the B6 actions. This answers the brief's question and corrects the built single element (RevealedDropView, accessibilityElement(children: .ignore)). It keeps FQ91(c)'s words and order, so it doesn't touch the Default.
- **Evidence:** IMPLEMENTATION section 5; component-contracts handoff7.dropShapes.revealedItem.a11y; brief item 17e ("Built: the revealed item is one VoiceOver element … Say how VoiceOver should move through a revealed item"); QUESTIONS.md FQ91(c); RevealedDropView.swift.
- **Meanwhile and who acts:** The app makes RevealedDropView a container: the sender, the caption as selectable text with a Copy caption action, and the photo element. The decorative avatar is hidden. Do it in the drop-card slice, or at the latest before the revealed item ships in B5. Record in FQ91 that the grouping is answered.
- **Second reviewer:** This isn't a founder question. FQ91(c) sets the words and their order for states with no delivered template: "a revealed photograph as its sender, its caption, "Photo", then "Highlight"". It says nothing about grouping. The brief stated the grouping as a "Built:" reading and asked Claude Design to choose: "one element with actions, or the sender, the caption and the photograph apart". The delivery chooses separate elements, in the same order and words ("Photo." / "Photo. Highlight."). Before B6 there is no More options control, so B0's order is sender, caption, photo, exactly FQ91(c)'s. This is a design correction of a Built reading on VoiceOver that breaks no rule, and spec 15's "Captions remain selectable for accessibility" supports it. So the app follows it.

### X-33 (should, app, adjusted)

- **Where:** design/reference/INVENTORY.md
- **Finding:** The inventory needs these changes:
- **To received, Source "Handoff 7":** the 16 requested frames.
- **New received rows:** the five -dark and -xl frames.
- **Re-sourced redraws:** the eight redraws.
- **New built-from-spec rows:** A02-email-invalid, A02-email-signed-out, A03-profile-name-refused, global-leaving, and A02-code with a resend failure under a code error.
- **Row texts to correct:** A02-age-saving, A02-age-failed-network and -refused, A03-profile-name-too-long, A03-profile-empty (person glyph, focused, placeholder), A02-email-empty (placeholder) and global-launch.
- **Stay built from spec, with their words' source:** the written-only rows, including F01-error-no-club-refused and M01's loading and error rows.
- **Counts:** recount.
- **Known differences:** drop the answered readings. Add the frame differences the app doesn't follow: X-01 to X-08 where the app keeps its build, and X-02's missing line. Rewrite the compact receipt entry for the scaling disc.
- **Evidence:** dropcard/design/reference/INVENTORY.md rows 34, 41 to 54, 131 to 144, 233 to 236 and 262 to 268, line 396, and the counts at line 422; frame-manifest.json.
- **Meanwhile and who acts:** The ios lane updates INVENTORY.md in the slice that adopts handoff 7, with the screens/ files made from the delivery.
- **Second reviewer:** Most of the list holds against INVENTORY. The 16 requested rows exist as built from spec. The -dark and -xl rows don't exist yet. global-launch reads "the canvas alone". Line 396 lists the two "States drawn the same". Three corrections:
- "F01/M01 error and loading rows" is loose. F01-loading-no-club and F01-error-no-club are drawn and move to received. F01-error-no-club-refused and the three M01 loading and error rows stay built from spec.
- X-09 is not a frame difference the app departs from, since the contract permits the build's reading.
- The A03-profile-empty row also gains the placeholder "Your name" (BM-02), and Known differences should note the Private drafts inset change the app adopts (BM-01).

### X-34 (should, app, adjusted)

- **Where:** docs/QUESTIONS.md
- **Finding:** QUESTIONS.md needs these updates; none closes a question:
- **FQ44:** record that drop.collecting.opening splits the date (X-10).
- **FQ58:** record that the initial is allowed after the account record, with no avatar before it.
- **FQ69:** record Leave sign-in on A02-age and A03, with no confirmation, the age kept on the server, and the address kept in memory (BM-03). Retention is still to be proposed.
- **FQ70:** record the tooLong and nameRefused words.
- **FQ86:** record that auth.code.unavailable has the same words.
- **FQ89:** record the confirmation, root.loading and root.leaving, the signed-out notice and the Retry hints.
- **FQ90:** rewrite the stale bullet at line 413, which says the brief lacks the words and that it hasn't gone to Claude Design. Record "Home updated." on Home only, no Private drafts row while loading or failed, and the 32-point error title.
- **FQ91:** record that (a) and (b) are confirmed, the delivered templates keep (c), and the revealed-item grouping is answered (X-32). Update the drop-card preface's "until its export is checked".
- **Evidence:** dropcard/docs/QUESTIONS.md lines 224, 289, 321, 327, 361, 408, 411 to 413 and 418 to 424; brief items 14 to 16; IMPLEMENTATION sections 2 to 5; copy-contracts handoff7.
- **Meanwhile and who acts:** The ios lane edits QUESTIONS.md in the handoff 7 adoption slice. Nothing in this delivery needs a founder answer.
- **Second reviewer:** The list is mostly right, with two changes.
- FQ91: no founder question is needed. FQ91(c) sets words and order, and the delivery's revealed-item grouping keeps both (see X-32).
- FQ90: more than its last sentence is stale. The bullet at QUESTIONS.md line 413 also says the brief's items 14 and 16 ask "without stating this default's 'Couldn’t load Friends.', 'Couldn’t load Memories.' or 'This version of Tadayo can’t show clubs yet.'", and that nothing asks what Friends and Memories say when the list returns. The final brief states all three lines (items 14 and 16) and the silence on return (item 15).
The other points check out:
- FQ86 is answered (ADR-030), and auth.code.unavailable matches it.
- FQ58's Default (own photo only) is consistent with the initial being allowed after the account record.
- FQ69's Default still owes a retention proposal.

### BM-01 (should, app, missed)

- **Where:** G06-no-club, G06-no-club-dark, G06-no-club-xl, F01-no-club; sheet 'Secondary action, Private drafts and text action'
- **Finding:** Every handoff 7 frame, and the sheet's new Private drafts specimen, draw the row's folder box 16 in from the row's edge (x 36) and the title at x 76. Handoffs 4, 5 and 6 drew them 12 in (x 32) and at x 71. No replaces entry names privateDraftsEntry, and noClubTabStates.draftsInEmpty calls it the "stable Private drafts component". The build uses handoff 4's 12 (PrivateDraftsEntry.swift), and neither reviewer's list covers the change.
- **Evidence:** frames/G06-no-club.svg: folder translate(36 459), "Private drafts" from x 76.0. F01-no-club.svg: x 76.0. Sheet specimen at y 11074: folder translate(36 112), title x 76.0. Handoff 4 G06-no-club.svg: translate(32 515), x 71.0. Handoff 6 F01-friends.svg: translate(32 241), x 71.0. PrivateDraftsEntry.swift doc: "the folder centred in a 24-point box 12 in from the leading edge".
- **Meanwhile and who acts:** The sheet specimen is current for its named scope (component-contracts handoff7.precedence.existingSheet), so the app follows it. Set PrivateDraftsEntry's leading inset to 16, re-snapshot G06, F01 and Friends, and note it in the adoption PR. A later brief asks Claude Design to list it under replaces.

### BM-02 (should, app, missed)

- **Where:** A03-profile-empty, A03-profile-empty-xl
- **Finding:** The delivery adds a placeholder, "Your name" (auth.profile.placeholder), in secondaryText in the empty name field. The build's name field has none. Neither X-19's A03 changes nor X-33's A03-profile-empty row correction includes it.
- **Evidence:** frames/A03-profile-empty.svg: "Your name" at x 34, baseline 449.44, fill #607067, inside the field [20,420,353,54]. screen-copy.json A03-profile-empty and -xl list "Your name" twice. copy-contracts handoff7.auth.profile.placeholder. ProfileScreen in ProfileScreens.swift uses TextField(String(), text: $model.name).
- **Meanwhile and who acts:** Give ProfileScreen's field a prompt of "Your name" in secondaryText, as CodeScreen does for its field. Add the key and update INVENTORY's A03-profile-empty row.

### BM-03 (should, app, missed)

- **Where:** A02-age and A03-profile: Leave sign-in to A02-email
- **Finding:** The delivery returns Leave sign-in to A02-email "with the address retained in memory". The build drops the address. RootModel.endSession() sets signIn = nil, and showSignIn() creates a new SignInModel, so A02-email comes back empty. The build keeps the typed address only on Retry after "Couldn’t keep you signed in." (RootModel.retry). No Default covers Leave, and keeping a value in memory breaks no rule (T11's purge concerns the author's preview), so this is a flow correction the app follows.
- **Evidence:** component-contracts handoff7.ageExit.return: "A02-email in B0, address retained in memory." IMPLEMENTATION section 2: "Leaving removes the session from this iPhone and returns to A02-email in B0, with the address retained in memory." RootModel.swift endSession() (signIn = nil) and the SignInModel created at line 181.
- **Meanwhile and who acts:** In RootModel.leave and endSession: carry the typed email into the new SignInModel, in memory only and never persisted. Add a RootModelTests case, and record it under FQ69.

### BM-04 (should, claude-design, missed)

- **Where:** A02-age (redraw), A02-age-failed-network
- **Finding:** The A02-age redraw puts about 60 points between the title's line box and the body's line box. Handoff 1 drew about 26, the other handoff 7 sign-in screens about 17, and the build uses 24. No contract value gives it: ageExit's scope is navigation only, and authForm and spacing name no title-to-body gap. The title now fits on one line, so the body seems to have kept handoff 1's place rather than a stated gap.
- **Evidence:** frames/A02-age.svg and A02-age-failed-network.svg: title baseline 153.24 on one line, body baseline 236.94. Handoff 1 A02-age: title on two lines with the second baseline at 196, body at 246. Handoff 7 A02-email: 153.24 to 193.94. SetupHeading(subtitleGap: Spacing.xxl) in AgeScreen.
- **Meanwhile and who acts:** Claude Design states A02-age's title-to-body gap, or confirms it should match the other sign-in screens. Until then the app keeps 24 (AgeScreen's subtitleGap).

### BM-05 (note, claude-design, missed)

- **Where:** Highlight covers and expanded row (sheet)
- **Finding:** On the star's own pick, the contract puts the row's star at the trailing 24 inset. The specimen draws it about 32 from the row's trailing edge. The build follows the contract.
- **Evidence:** component-contracts handoff7.highlightCover.star.rowOrigin: "Trailing24 inset, first-line aligned, reserve12+12 before star; left of fold". The sheet specimen draws the star at translate(329 132) scale(0.5), spanning x 329.5 to 340.5, in a row spanning x 20 to 373. HighlightCover.swift row uses padding(.horizontal, Spacing.xxl).
- **Meanwhile and who acts:** The app keeps the contract's 24. A later brief asks Claude Design which value the specimen means.

## The completeness critic

*Critic's summary:* The completeness pass covered the written contracts (component-contracts and copy-contracts handoff7, IMPLEMENTATION.md, implementation-guide.html, frame-manifest, screen-copy, validation-report, source-provenance, fixture-values) and the build on main and ios/b0-drop-card (SignInFlow, ProfileScreens, SetupLayout, RootFailure, TadayoApp, NoClubTabs, TabLayout, the TadayoDesign components, SignInModel, RootModel, LaunchBackground, INVENTORY). I checked them against T10, T11, T38, T41, T43, T45 and T47, spec 14 and 23, and FQ21, FQ41, FQ44, FQ58, FQ69, FQ70, FQ85, FQ86 and FQ89 to FQ91. No new privacy leak turned up. The hidden card's VoiceOver words (vo.drop.collecting.other) say only the author, caption, opening time and "Hidden content". The receipt's words and the removed placeholder carry nothing outside the spec 14 whitelist. Sign-in shows only the address the person typed. The launch screen is the adaptive LaunchBackground colour, with no account data. These also match their contracts and the build: the sheet specimens (removed placeholder 353x50 r12 with text at x36, receipt text at x76 after its 28 disc, tile avatar 28,20 with star at 75,23, the revealed item), the Retry footer 24 above the tab bar, no drafts row while loading or failed, SignInModel's resend and verify availability, the fixture weekdays (Nov 6 and Nov 13 2026 are Fridays), the guide HTML (identical to the MD) and the provenance hashes (equal to main). Three verified gaps remain. The first is a VoiceOver condition on A03's arrival focus that no lens carried into the build change. The second is the address wrap: frame 19 breaks the line differently from the build's documented reading. The third is an INVENTORY line that IMPLEMENTATION.md has now answered. Several surviving findings conflict with each other or with a rule, and the disputes below say which reading should stand.


### C-01 (should, app)

- **Where:** new
- **Finding:** The delivery makes A03's arrival focus conditional on VoiceOver, and no lens carried that condition into the build change. F-11, X-19, V-11 and VM-02 tell the app to focus the name field on arrival without any condition. Today the build doesn't focus it at all. A02-email's arrival focus has no such condition.
- **Evidence:** Delivery: authForm.profileArrivalFocus = 'True at all sizes, unless VoiceOver focus would be stolen; announce screen then allow normal focus management. Drawn first-responder reference in both sizes.' By contrast, authForm.emailArrivalFocus = True has no condition. IMPLEMENTATION.md: 'A03-profile-empty is focused on arrival'. Build: apps/ios/Tadayo/SignIn/ProfileScreens.swift line 74, '/// As `SignInFlow.focus`. The field isn't focused on arrival: the frame shows no keyboard.' EmailScreen in SignInFlow.swift focuses on .onAppear without a VoiceOver check, which the contract allows for A02-email.
- **Meanwhile and who acts:** When the app makes the fix in F-11 and X-19, focus A03's name field on arrival only when UIAccessibility.isVoiceOverRunning is false. With VoiceOver on, leave focus to the system so the screen is announced first, with no programmatic first responder. Keep A02-email's unconditional arrival focus. Snapshot A03-profile-empty and -xl with the keyboard up, and note the VoiceOver exception in INVENTORY.

### C-02 (note, app)

- **Where:** new
- **Finding:** Frame 19 breaks the address in a different place from the build. Frame 19 has three lines: 'Sent to' / 'ben@example' / '.com'. The build and INVENTORY give 'Sent to ben@' / 'example.com'. The written rule only says the line may break inside an address, so both readings comply, but the snapshot won't match the frame and nobody recorded the difference.
- **Evidence:** frames/A02-code-error-xl.svg has aria-labels 'Sent to', 'ben@example' and '.com' on separate lines at 53 pt. 'Sent to ben@' measures about 325 pt in the frame's own glyph advances, so it fits on one 353-pt line, and the frame breaks earlier than it has to. authForm.longEmail = 'Destination label wraps at full 353-point width, no truncation or shrinking, break within a long address when necessary.' Build: SignInFlow.swift lines 163-165, breakable() inserts U+200B after '@' and after every '.'. INVENTORY line 386: 'at the largest text `A02-code`'s line reads "Sent to ben@" over "example.com".'
- **Meanwhile and who acts:** Keep the build's reading, since it fills the 353-pt width as the contract asks. Record A02-code-error-xl's line breaks as a known difference from frame 19 in INVENTORY. If the founder wants the frame's breaks instead, move the zero-width break to before each '.' and drop the one after '@'.

### C-03 (note, app)

- **Where:** new
- **Finding:** Handoff 7 answers the ios lane's need for a field that wraps a long typed value: it doesn't wrap. INVENTORY still says a later handoff has been asked for one, so the open need and the inventory line are now out of date.
- **Evidence:** IMPLEMENTATION.md line 72: 'Single-line native text fields scroll horizontally for a long value; they do not wrap the typed address/name into the border. Labels and the code destination line do wrap, without ellipsis, at available width.' INVENTORY line 393 ends: 'Handoff 1 asks for Dynamic Type "without truncating names"; the ios lane's needs list asks a later handoff for a field that wraps.'
- **Meanwhile and who acts:** Keep the system single-line field, which is already built. In INVENTORY line 393, cite handoff 7's answer in place of the pending request, mark needs item 31 answered, and keep 'without truncating names' for labels and the destination line only, which the build already wraps.

## The critic's rulings on disagreements

- **dispute WM-01:** It conflicts with R-06. Keeping the address in memory after a deliberate Leave is about data handling, not layout, words, VoiceOver or motion, so it isn't a design correction the app can simply adopt. No source or Default settles it, and the delivery's own ageExit.reason purges the unsaved name and photo 'on successful exit/account switch', which argues the other way. It is a founder decision, as R-06 says. Until the founder answers, the app keeps returning to an empty A02-email.
- **dispute BM-03:** Same reason as WM-01. ageExit.return = 'A02-email in B0, address retained in memory' is a product choice about keeping personal data after the person chose to leave. R-06 is right to send it to the founder, and the empty field stays until the founder answers.
- **dispute W-05 (ink part):** precedence.brand reads 'H7 wins only for scopes listed under replaces'. Body or subtitle ink isn't among the replaces scopes (busyPrimary, authForm, ageExit, launch, noClubRootHeader, noClubTabStates, avatarWithoutInitial, dropShapes, highlightCover, compactReceipt), and the frames disagree with each other: 'Sent to' stays #607067. The meanwhile in F-05, V-05 and X-07 is right: keep secondaryText.
- **dispute X-24:** FQ90's Default says every tab takes Home's form 'as handoff 6's M01-access-lost does', and brief item 14 says 'in your H01-access-lost's form'. Both name emptyTitle (25). When a frame conflicts with a Default, the Default wins meanwhile, so F-04 and V-06 (keep emptyTitle) are right, and moving the title to utilityTitle would break the founder's Default.
- **dispute WM-03 (title role):** Same reason as X-24: FQ90's Default and brief item 14 fix the failure title at M01/H01-access-lost's emptyTitle. Changing the role needs the founder, not an app change.
- **dispute V-02:** Frame 19 (A02-code-error-xl, Verify at [20,464,353,85]) and authForm.keyboardFooter both pin Verify code above the keyboard at AX5. Only the default-size frames are in conflict. The meanwhile in F-09 and W-02 fits both: pin at accessibility sizes, or wherever the button would otherwise sit under the keyboard. An unconditional change at every size overreaches.
- **dispute X-04 (meanwhile):** Same reason as V-02: at the largest text the frame and the contract agree. The narrower meanwhile in F-09 and W-02 is the right build change.
- **dispute F-06 (alignment meanwhile):** 'Keep centred rows' contradicts what X-25 verified: the sheet's current text-action specimen draws 'Send a new code' leading at x20, and precedence.existingSheet makes an appended H7 specimen current for its named scope. The resend and Change email rows should follow the specimen's leading alignment.
- **dispute D-16:** D-16's action makes each cover's visible words its label and 'Open Maya’s highlight' a hint. T47 reads 'Every control has a VoiceOver name. A cover is "Open Maya's highlight"', so the invariant fixes that phrase as the cover's name, and book line 160 calls it the cover's accessible action. R-02's meanwhile (keep 'Open {name}’s highlight' as the accessibility label, from HighlightCover.accessibilityName) follows T47 and should stand. D-16's action would break an invariant.

## What each reviewer found delivered


### Frames 1 to 16, 18 to 22 and the eight redraws

- **1 A02-email-empty:** No back chevron. The email field is focused on arrival and empty, with the placeholder "Email address", and the email keyboard is up. Send a code is unavailable (actionDisabled #E2E6DF). "Use the same email whenever you sign in." stays. As asked.
- **2 A02-email-sending:** ben@example.com stays in the focused, read-only field with the keyboard up. Send a code keeps the action fill and its centred label at the idle x149.4, with a white native spinner 8 points before it. As asked.
- **3 A02-email-failed-network:** "Couldn’t send a code. Check your connection and try again." appears with a 14-point icon under the field. The field keeps its normal inputBorder and focus ring, with no error border. Send a code is available and moves to y380, and the helper stays below it. The refused line and "Enter a valid email address." are given in writing.
- **4 A02-code-verifying:** 529614 sits in the focused field, Verify code is busy (spinner and label), the waiting sentence stays and Change email address is inactive. Back is drawn active (F-03).
- **5 A02-code-verify-failed-network:** The line fills the two reserved lines, with the icon. The border stays normal, the digits stay, Verify code and Change email address are available and the waiting sentence stays. The FQ86 line "Couldn’t verify the code. Try again." is confirmed in writing.
- **6 A02-code-resend:** The field is empty ("Enter code") and Verify code is unavailable. "Send a new code" takes the waiting sentence's row (baseline 431) and the error region is empty. As asked.
- **7 A02-code-resending:** "Sending a new code…" shows in 16-point secondaryText with a leading native spinner. Verify code and Change email address are inactive. Back is drawn active (F-03).
- **8 A02-code-resend-failed-network:** "Send a new code" comes back. "Couldn’t send a new code. Check your connection and try again." sits in its own block below it, and Change email address moves to y503. The field is empty with no error border.
- **9 A02-age-failed-network:** A leading "Leave sign-in" replaces the chevron. "Couldn’t save your age confirmation. Check your connection and try again." sits above the pinned I’m 18 or older (724-774), about 23 points clear.
- **10 A03-profile-empty:** Leading Leave sign-in. The 68-point avatar shows an outlined person glyph at 56%. The name field is focused with the placeholder "Your name" and the keyboard up. Continue is unavailable, 12 points above the keyboard. Add photo and Optional are left-aligned (F-07).
- **11 A03-profile-failed-network:** The content is scrolled 128 points up. The avatar shows B, "Ben" stays in the focused field with a normal border, and the line sits under the field. Continue is available above the keyboard.
- **12 global-launch-failed-network:** No navigation bar, header, tabs or avatar. "Couldn’t load your account." (32 points, two lines) sits over "Check your connection and try again.", with Retry pinned 44 points above the safe-area bottom. The FQ89 Default as stated.
- **13 H01-loading-no-club:** The no-club header: the wordmark as an image labelled Tadayo, + Add with the addPrivate hint, and the B avatar. A native spinner sits over "Loading Home…", with no hint and no Private drafts row in the body. Home is selected.
- **14 H01-error-no-club:** "Couldn’t load Home." over "Check your connection and try again.", with Retry pinned 24 points above the tab bar, and no Create a club, I have an invite or Private drafts row. The title is in utilityTitle 32 (F-04).
- **15 F01-loading-no-club:** As frame 13, with "Loading Friends…", Friends selected and no page title.
- **16 F01-error-no-club:** As frame 14, with "Couldn’t load Friends." and Friends selected.
- **18 A02-code-error-dark:** The A02-code-error redraw in dark: focus ring #AFBEFF, destructive border #FFB4A5, icon and line in destructive, Verify code available.
- **19 A02-code-error-xl:** At the largest size, scrolled with the focused field under the navigation bar: the error border and ring show, and the error (44 points) continues behind Verify code, which is pinned 12 points above the keyboard. The title and address are above the viewport; the resend row and Change email address are below it in the scroll.
- **20 A03-profile-empty-xl:** At the largest size: the focused field with its label, the title, avatar and Add photo above the viewport, and Continue unavailable, pinned 12 points above the keyboard. Leave sign-in is in the navigation bar.
- **21 G06-no-club-dark:** The G06-no-club redraw in dark tokens: buttons 16 apart, header with wordmark, + Add and B. It carries the redraw's changes (F-25).
- **22 G06-no-club-xl:** A two-row header: the 96-wide wordmark, then + Add at 49 points on the leading side and the 28-point avatar trailing. The body scrolls under the tab bar. The second body line is missing (F-01).
- **23 A02-email (redraw):** No chevron, the address typed, Send a code available, and the body ink and field gaps changed (F-20).
- **24 A02-code (redraw):** The field now holds 529614 and Verify code is available. The label moves up under "Sent to", and the rows are left-aligned (F-21).
- **25 A02-code-error (redraw):** Typographic apostrophe, one wrapped error paragraph, the label moved up, rows left-aligned, Verify code available (F-22).
- **26 A02-age (redraw):** Leading Leave sign-in, with no chevron and no lower link. The title fits on one line, the body sits lower, and the button is 44 points above the safe area (F-23).
- **27 A03-profile (redraw):** Leave sign-in, field focused with the keyboard up, Continue above the keyboard, Add photo and Optional left-aligned, a larger B (F-24).
- **28 G06-no-club (redraw):** New header rectangles, the title 32 points under the header, the body as two paragraphs, buttons 16 apart and tighter gaps (F-25).
- **29 F01-no-club (redraw):** New header, page title 32 points under the header, tighter gaps (F-26).
- **30 M01-no-club (redraw):** New header and page title position, a changed boundary line, tighter gaps, and Go to Home left-aligned (F-02).

### Item 17: the component sheet, the drop card and the receipt

- **17 · handoff 6 sheet kept:** Yes. All 9,645 handoff 6 SVG elements recur in order with identical attributes and text. Only the root size changes and a second title/desc pair is added; handoff 7 is appended from y 9680. In the PNG, the transparent band at y 6880 to 9680 now renders black (D-01).
- **17a · primary button busy:** Drawn in light and dark: 353×50, action/onAction, a native 16-point indicator 8 points before the centred label, which keeps its place. The value is "In progress". The build puts the indicator on the trailing side and differs at large text (D-13).
- **17b · labelled field in dark, failure line without a field:** Plain, focused, and focused with the invalid-code error (icon plus two lines) are drawn in light and dark, as is the failure line with no field (icon 14, gap 8, metadata in destructive). The field-to-error gap is drawn 8, where the contract says 12 (D-22).
- **17c · dark B0 controls, no-club header at largest text:** The secondary button, the Private drafts row and the text action are drawn in dark. The header stacks at every accessibility size, wordmark row first, with the wordmark 96 wide. New default rectangles are given. The build stacks only on overflow and puts + Add on the trailing side (D-15).
- **17d · avatar with no readable initial:** An outlined person glyph at 56% of 68, 36, 28 and 18, on canvas (avatarCanvas) and on a cover (avatarOnCover). A Unicode letter in any script or a decimal digit gives an initial; emoji, symbols and punctuation give the glyph. The app has not built this yet (D-14).
- **17e · drop card's states:** All eight states and the removed placeholder are drawn in light, dark and largest text, as one state model with three presentations (thumbnailRow, collectingCard, revealedItem) plus removedPlaceholder.
- FQ91's words and order are confirmed: Processing has no indicator; the removed line has no full stop, as built.
- Highlight shows only on the author's own card (FQ21); there is no Share item (FQ14); the heart is the only reaction (FQ22).
- The revealed item is 353×304 at radius 14, with avatar 28 and gap 8, caption 8 below, photo 12 below, and the label at the lower left 12 points in, all as built.
- Changes for the app: D-03, D-04, D-07, D-12, D-19. Template issue: D-02. Open questions: D-08, D-17, D-18, D-21.
- **17f · highlight cover:** Every reading is confirmed:
- the list starts at extraLarge, and two lines at the default size are right;
- the rail gap is 12;
- the row has inset 24, the avatar on the label's first line, the fold, padding 16 and 12 between rows;
- the tile's insets are 8 and 4;
- star.fill stays fixed at 12, only on the star's own pick: at (55, 11) on the tile and the trailing 24 inset on the row;
- the lock, the card's star and the photo label's star scale with their text.

New: the row avatar is 28, not the built 36 (D-09). The specimen drawing is inconsistent (D-10, D-11). VoiceOver labels: D-16.
- **17g · compact receipt:** Drawn with and without the action, in light and dark, at default and largest text.
- VoiceOver template confirmed: "Added for {person}’s {weekday}. Opens {fullDateTime}, {clubZoneName}.", with Make my highlight as a separate button and a new hint.
- It sits below the upcoming day's header and above its collecting cards, and is announced once after commit.
- The disc grows with row text, which contradicts the build's fixed 28/12 (D-05).
- The drawn insets contradict the written ones: the words end about 28 points above the border, against about 17 in 2.1's F02-added and about 13 in the Lab (D-06).
- Placement for Home and the share extension is open (D-20).

### Written asks and the Return rules

- **Busy rule (frame 2 sets it):** Drawn and written: the action/onAction fill and label stay. A native 16-pt indicator sits with its right edge 8 pt before the centred label (frame 2: spinner about x128 to 142, label x150 to 242.5), and the label doesn't move. Repeat submission is off, the accessibility value is "In progress" (vo.busy.value), and the action is announced once. This corrects the Built placement, which puts the indicator at the button's trailing edge.
- **Failures rule (the second failure's line in writing; it names the action and keeps input):** Every connection failure has a server-refusal line in the same place and form. Neither marks a valid field invalid. Nothing typed is cleared, and no wait is promised.
- **Announcements rule:** Individual keys: vo.email.busy, vo.code.busy, vo.age.busy, vo.profile.busy, vo.resend.busy, vo.resend.available, vo.resend.success, vo.failure.* and vo.root.* / vo.*.error.*. All are polite, said once and don't move focus. See W-11 for the key conflicts.
- **1 A02-email-empty:** Placeholder "Email address". Focused on arrival with the email keyboard. Send a code is unavailable until the address is plausible (actionDisabled). Frames 1 to 3 have no chevron, which confirms the app's reading. The A02-email redraw also drops it.
- **2 A02-email-sending:** Busy button drawn. The field becomes read-only and keeps focus and the keyboard. Verify code, I’m 18 or older and Continue take the same treatment, each with its own announcement.
- **3 A02-email-failed-network and A02-email-refused:** The line goes in a growing block under the field and pushes Send a code and the helper down. No error border, the helper stays, and a retry uses the same address. "Couldn’t send a code. Try again." is confirmed. An address the server rejects gets its own line, "Enter a valid email address.", with the invalid border.
- **4 A02-code-verifying:** The field is read-only. Change email address is inactive, and so is Send a new code once the minute has passed. Busy holds until the account record decides where Ben goes. All of this confirms the app's reading. Back is drawn active, which contradicts the written rule (W-01).
- **5 A02-code-verify-failed-network and A02-code-verify-unavailable:** The line fills the two reserved lines, with the icon and no error border. Verify code stays available. FQ86's "Couldn’t verify the code. Try again." is confirmed. The wrong-code line is unchanged.
- **6 A02-code-resend:** Drawn as asked: Send a new code sits in the row's place, the error region is empty and Verify is unavailable.
- **7 A02-code-resending:** "Sending a new code…" is confirmed (key auth.code.resending, role textAction, ink secondaryText, with a small native indicator). Verify, input and Change email address are inactive even with six digits typed. On success the digits clear, focus returns to the field, the waiting sentence comes back and vo.resend.success is announced.
- **8 A02-code-resend-failed-network and A02-code-resend-refused:** The line goes in its own block below the resend action. The row goes back to Send a new code, and the minute doesn't restart. "Couldn’t send a new code. Try again." is confirmed. When a code error is already showing, both messages stay, each in its own block.
- **9 A02-age-failed-network, A02-age-refused and A02-age-saving:** Lines: "Couldn’t save your age confirmation. Check your connection and try again." and "… Try again.". The line sits above the pinned button with at least 16 pt clear. Saving uses the busy treatment, Leave sign-in is inactive, and the announcement is "Saving your age confirmation."
- **10 A03-profile-empty:** Focused on arrival at every size, which corrects the Built reading that it isn't. The 68-pt avatar shows an outlined person glyph. Continue stays unavailable until a name is typed, with no line, which confirms the app's reading. The content is one scroll view. The initial updates live as Ben types.
- **11 A03-profile-failed-network, refused, saving, name-too-long, name-refused:** The line goes under the field, with the keyboard up and no error border. "Couldn’t save your profile. Try again." is confirmed. Saving makes the name read-only and makes Add photo and Leave sign-in inactive. Too long: "Use 40 characters or fewer for your name." below the field; the text is kept and not cut, which corrects the Built reading of no line. Name refused: "Choose a name with visible characters and no line breaks or hidden formatting." with the invalid border (see W-15). The FQ70 Default is restated and drawn.
- **12 global-launch-failed-network and global-launch-refused (FQ89):** Confirmed: the title "Couldn’t load your account." over "Check your connection and try again." or "Try again.", with Retry pinned at the foot. No header, tabs or avatar. VoiceOver says the title and line. The words fit both the launch and the moment after a verified code.
- **12 global-leave-failed and global-sign-in-not-kept (FQ89):** Both titles are confirmed over "Try again.", with VoiceOver vo.root.leave.refused and vo.root.keep.refused. A retried removal repeats the removal. Retrying the keep returns Ben to A02-email with the address kept, to ask for a fresh code.
- **12 global-launch and the launch screen:** Corrected. The OS launch screen is canvas only, light and dark, which confirms what is built. The runtime wait shows a native spinner with "Loading your account…", and Leave sign-in shows "Leaving sign-in…". No header or tabs. A02-code keeps its busy Verify. Neither screen has a frame (W-09).
- **13 H01-loading-no-club:** Ben's initial is allowed once Ben's own account record is in. That is Claude Design's view; FQ58 stays the founder's. Rectangles: + Add [241,56,80,44] and Account [329,56,44,44], with no overlap. handoff5.loading.hint is dropped when no club is selected. "Home updated." is announced when the list comes back empty.
- **14 H01-error-no-club, refused, global-club-not-in-build (FQ90):** The split is confirmed: "Couldn’t load Home." over the line. Retry is a primary button at least 50 pt high, pinned above the tab bar, labelled Retry with the hint "Load Home again.", and it returns to the loading shell. No Private drafts row (+ Add instead), no Create a club and no I have an invite. The refused line "Try again." is confirmed. "This version of Tadayo can’t show clubs yet." is confirmed: no Retry, announced once, and only the header and tabs.
- **15 F01-loading-no-club:** Each tab names itself ("Loading Friends…" and "Loading Memories…") with one polite announcement. No Private drafts row. Friends and Memories say nothing when the list comes back. M01 takes the same form.
- **16 F01-error-no-club and the M01 variants:** Same form as Home, with "Couldn’t load Friends." or "Couldn’t load Memories." over the network line or "Try again.", and a Retry hint for each tab.
- **19 A02-code-error-xl in writing:** The title and address sit above the viewport. The error continues below, then the resend row and Change email address, all in the scroll content. Verify is pinned above the keyboard.
- **20 A03-profile-empty-xl in writing:** The title wraps across the full 353-pt width. The avatar, Add photo and Optional sit above the viewport, in document order. The field is focused on arrival at AX5 too.
- **Question: back and leave (FQ69):** A02-age loses its chevron. A native leading "Leave sign-in" text action is used on both A02-age and A03, with no confirmation alert. It is inactive while a save runs and returns Ben to A02-email with the address kept in memory. A02-age and A03-profile are resent.
- **Question: A02-email-signed-out:** "Your sign-in ended. Enter your email to sign in again.", in a neutral body notice above the field, not as an invalid-email error. No frame (W-10).
- **Question: the no-club header on iOS 26 and the top edge:** Confirms the app's reading: the header is content and scrolls away, never in a navigation bar and with no glass. Answer: an opaque canvas band stays behind the status bar on iOS 17, 18 and 26, and content is clipped below it.
- **Question: a long address in "Sent to {email}":** It wraps at full width and may break inside the address. No truncation or shrinking. The single-line field scrolls horizontally.
- **Six points the app follows:** All followed: ’ (the A02-code-error redraw), the named spacing, buttons 16 pt apart (G06: 335 to 351), the wordmark spoken as "Tadayo" with + Add's private hint, "Loading Home…", and H01-open and F02-upcoming not resent.
- **Return: package, keys, templates, fixtures, replaces, scopes, brand:** Zip contents as asked. The files stay cumulative. Every drawn A02/A03 string matches a handoff7 value or template, including the delivered ones and "Sent to {email}". The failureStates lines are keyed by action. No name, address, code, weekday, date or time is written into a handoff7 key. Fixtures are in screen-copy.json and fixture-values.json. Every key named in replaces exists (photoHighlightLabel.word is in component-contracts.json). Component scopes are stated. Brand 1.1 is unchanged. The gaps in replaces are in W-14.
- **VoiceOver names and targets:** Every control in screen-copy.json has a label beginning with its visible words (Back and the avatar's Account aside, as before). Each target is at least 44 pt, and text fields are 54.

### Copy, privacy and product rules

- **Hidden (collecting) card, its VoiceOver label, and what it shows before the reveal (T10, FQ21):** Not a problem. The specimens show only the lock, "Opens Friday, November 13 · 7 AM", the caption, the author's name and avatar, and the decorative fold. Templates: vo.drop.collecting.other "{author}. {caption}. Opens {fullDateTime}, {clubZoneName}. Hidden content."; own card "{author}, you. …". Highlight appears only on the author's own card ("No Highlight disclosure to other viewers"; collectingCard.ownHighlight "Before reveal only author sees it"). The contract forbids deriving colour, geometry or spoken clues from media. Everything is inside T10's whitelist.
- **Compact receipt before the reveal (T10, T20, T33):** Not a problem. It shows "Added for Debby’s Friday", "November 13 · Opens at 7 AM" and Make my highlight, to the author only, and only after the server commits (compactReceipt.scope "Server-committed … Never for local uploads"). It has no thumbnail, no count and no read receipt. "Make my highlight" is book p8's optional action, not a reminder.
- **Removed placeholder (T24, T25, T38, FQ91b):** Not a problem. It reads "This drop is no longer available", with no author, time, caption or reason (removedPlaceholder.scope "Never author/time/caption/reason"). It reads the same whoever removed the drop, sits at its own height, and is kept only to hold the drop's place in an open conversation. A deep link uses the same line with "Back to club" (T38).
- **"Pending on this iPhone · Not added yet" and "Processing · Not added yet" against "Added means committed" (T20):** Not a problem. Both say the drop is not added yet. Pending makes no claim of server submission (spec 06: "Show Pending on device; never claim server submission"). Processing has no spinner or bar, as FQ91(a)'s Default says. No uncommitted state reads Added or Sent (book p16, p41).
- **Receipts, counts, streaks, reminders or chasing (T15, T33):** None found in any frame, specimen or string.
- **"Leave sign-in" with no confirmation:** Not a product decision for the founder, because nothing irreversible is lost. On A02-age nothing has been recorded yet. On A03 the age stays recorded on the server (ageExit.reason), and only the unsaved typed name and chosen photo are discarded, which can be typed or chosen again. The person signs back in with a code. The brief asked Claude Design whether leaving asks first, so this is the design answer under FQ69's Default (finish setup or leave). Keeping the email address after leaving is a separate question (R-06).
- **"Your sign-in ended. Enter your email to sign in again.":** Not a problem. It is plain and factual and blames nothing. It is a neutral notice for a moment the person did nothing, not an error, so it needs no failed action named. It is never built from the account record. The app adopts it (R-08).
- **"Use 40 characters or fewer for your name." against FQ70:** Not a problem. It matches FQ70: 40 grapheme clusters, the name kept as typed, no silent cut at 40, Continue unavailable. No request has failed at that point, so T43's rule about naming the action doesn't apply. The reasons in "Choose a name with visible characters and no line breaks or hidden formatting." match FQ70's refusal list, but that line has the T43 problem in R-01.
- **"Couldn’t save your age confirmation…" and its busy announcement:** Not a problem. It names the action (T43), promises no wait, and replaces the interim profile lines the brief flagged. The app adopts it (R-08).
- **No-club header's + Add and Account, and the initial B, while the club list loads (FQ58):** Not a problem. Handoff 3's H01-loading already keeps + Add ("Sunday people", "+ Add", "Loading Home…"). B is the fallback for Ben's own photo, shown only once Ben's account record has arrived (noClubRootHeader.accountInitial), and that is all FQ58's Default allows besides the club name. Claude Design's answer doesn't settle FQ58, which stays the founder's (needed by B2).
- **"This version of Tadayo can’t show clubs yet.":** Not a problem. It names no club or invitation, so nothing leaks. It is true (T49), it isn't an error, and it has no Retry. Claude Design confirming it doesn't settle FQ90, which stays the founder's.
- **"Home updated.":** Not a problem in itself. It is handoff 3's line, announced only after an authoritative empty result, and Friends and Memories stay silent. The possible double announcement is note R-12.
- **VoiceOver text: inferred pronouns, wrong names, Sent, plain voice:** Nothing found in the handoff7 strings. People are named ("Debby’s pick", "Your pick", "{author}, you", "{author} · You"), and "Sent to {email}" is the only Sent (FQ68). The one naming problem is the fixture in note R-13.
- **Guest, SMS or reward behaviour in the pack:** None. A search of the JSON, MD, HTML and PDF text finds only the disclaimers in README.md, IMPLEMENTATION.md, copy-contracts.json (handoff7.stageScope) and the PDF's first page ("No guest/SMS scope"). The proposal they refer to is note R-14.
- **Features no source asks for (Copy caption VoiceOver action, "retained invitation" destination, Back to club):** Not new features. Copy caption serves spec 15's "Captions remain selectable for accessibility". The retained invitation is book p9's "invitations retain their intent through authentication" (B1). Back to club is T38.
- **FQ86 "confirmed" by Claude Design:** No action needed. The founder already answered FQ86 on 6 November (ADR-030), and the app builds "Couldn’t verify the code. Try again." (auth.error.verifyUnavailable).
- **Verify code after a refused code:** Agrees with the app. The redrawn A02-code-error keeps Verify code enabled with the six digits kept, as ios commit 1eee2c5 does.

### Brand, visuals, native iOS and accessibility

- **Every colour is a revision 1.1 token:** Yes. Every fill and stroke in the 29 frames and the brand-components sheet is a 1.1 light or dark token. The only exceptions are device chrome (#090F0D island; #D4D7DD, #252B2A and #414845 keyboards; #FFFFFF keys) and supplementalTokens.foldCornerLine #8C8F84, which is the only non-role colour in the handoff 7 sheet sections.
- **Type sizes and weights match the named roles:** Mostly yes. The XL frames use the xlReference AX5 sizes: utilityTitle 56, body and row 53, metadata 44, button 50, headerAdd 49, photoLabel 40, caption 58. Weights cluster correctly. Exceptions are reported: avatar initials (V-18), the error-tab title (V-06), and the nav-bar Leave sign-in at 16 (V-21).
- **One shape per meaning:** Mostly consistent. The field is 353 wide, with the inputBorder and focus ring. The error block is a 14-point circle-exclamation with an 8 gap, scaling to 20 at XL, which matches the app's InlineError (exclamationmark.circle, metadata, destructive, Spacing.s). The busy indicator is 16, sits 8 before the label, and the label stays put (x 149.38 and 153.37). The no-club header geometry is stated. The exceptions are the enabled chevron while busy (V-01), the highlight-cover fold (V-07), the resend row moved to leading, and Leave sign-in replacing the chevron (V-13).
- **Spacing equals the named values:** Yes for most. The revealed item has an avatar gap of 8, the caption 8 below, the photo 12 below at 353x304, and the chip at a 12 inset. Thumbnails are 76x92 with a gap of 12. The collecting card is 353x151, with fold 18, lock 12 and gap 8, star 12 and gap 4, and Highlight 12 below. The removed placeholder has inset 16 and radius 12. The highlight tile is 91x69, with the star at (55,11), the avatar at an 8 inset and the label 4 below. The G06 button gap is 16. The departures are V-03, V-04, V-08, V-09 and V-24.
- **Text contrast at least 4.5:1, light and dark:** Yes. The lowest text pair is secondaryText on surface, at 4.64. Every dark pair passes. Non-text: inputBorder is 3.44 and 3.73 light, 4.76 and 5.93 dark. The one sub-threshold pair is an annotation on the specimen sheet (V-20).
- **Targets at least 44 points:** Yes. Every interactive rectangle in screen-copy.json is at least 44x44. The + Add target is [241,56,80,44].
- **Dark frames use the theme pairings:** Yes. A02-code-error-dark, G06-no-club-dark and the dark specimens use the 1.1 dark roles for canvas, surface, primary and secondary text, action and onAction, and destructive.
- **XL frames at the largest size, nothing clipped or truncated:** The sizes are AX5. No label is truncated with an ellipsis or shrunk. The A02-code-error-xl viewport cuts the error message mid-sentence (V-17), and XL rows break '7 AM' across lines (V-19).
- **Photographs: images or faces the book doesn't hold (T46); Maya's avatar crop:** No T46 violation. Every portrait is a 1x crop of 2.1 H01-open's rendered avatars, upscaled to 2x, so the portraits are soft. Deborah-Anne using Debby's portrait matches 2.1 F01-long-names. The fixtures (coffee, dog) are earlier book fixtures. Maya's crop does not match the earlier handoffs: handoffs 3 to 6 took an xMidYMid slice of the 900x1350 original, while handoff 7 shows the whole figure in a hoodie with the face at about 3 px (V-23).
- **The claims in qa/ and adaptive-layout-review.json:** Partly supported. The 32 probe tiles cover the 16 states, dark and XL. But the per-state claims are identical boilerplate, nativeCheck is 'pending' for all 16, and several probes contradict the contracts (V-22). The phone contact sheet's numbering skips 17, which is the brand-components sheet, not a missing frame.
- **Nothing generic (book p5): launch failure, loading and error tabs, removed placeholder:** The launch failure is generic by construction: a title, a line and Retry, with no header. That follows the FQ89 Default and is no finding here, but worth a later brief. The loading and error tabs keep the wordmark header, + Add, the avatar and the tabs, so they carry Tadayo's shell. The removed placeholder's neutrality is justified by T25 and book p6, because a fold would signal hidden content.

### Consistency, the build, the inventory and the questions

- **1 (A02-email-sending):** Answered (frame 2 and IMPLEMENTATION section 2). The button keeps action/onAction, with a 16-point native spinner 8 before the centred label in symmetric 24-point slots; at large text the spinner goes on its own row. Its value is "In progress" and vo.email.busy "Sending a code." is said once. The field turns read-only and keeps first responder. This corrects the build's trailing indicator (X-15).
- **2 (A02-email-failed and A02-email-refused):** Answered. Frame 3 draws the network line; the refused line is given in writing. Both sit in a growing block below the field that pushes Send a code and the helper down, with the icon and metadata/destructive text and no destructive border. Only a real address-format rejection gets "Enter a valid email address." and the invalid border (X-16).
- **3 (A02-code-verifying):** Answered (frame 4): busy Verify code, Change email address and Send a new code inactive, field read-only. The frame's Back is drawn and listed as active against the written answer (X-03).
- **4 (A02-code-verify-failed):** Answered (frame 5). The network line sits in the error block under the field, with no invalid border; only a wrong code gets the border. The drawn field-to-error gap differs from fieldErrorGap (X-05).
- **5 (A02-code-resend):** Answered (frame 6). Send a new code replaces the wait sentence in the same row, with no countdown and no disabled link. "Send a new code is available." (vo.resend.available) is said once without moving focus.
- **6 (A02-code-resending):** Answered (frame 7). "Sending a new code…" is confirmed (auth.code.resending), in textAction 16 secondaryText with a small native spinner; Verify code, edits and Change email address are inactive.
- **7 (A02-code-resend-failed and A02-code-resend-refused):** Answered. Frame 8 draws the network line; the refused line is given in writing. The failure goes in its own block below the resend action (resendToFailure 8) and can sit alongside a wrong-code line above Verify code. Only the failure is announced (X-17).
- **8 (A02-age-saving and A02-age-failed):** Answered (frame 9 and writing). New lines: "Couldn’t save your age confirmation. Check your connection and try again." and "Couldn’t save your age confirmation. Try again." (auth.age.network/refused). They sit above the pinned button with at least 16 clear. Leave sign-in is inactive while saving, and vo.age.busy is said (X-18).
- **9 (A03-profile-empty):** Answered (frame 10, A03-profile-empty-xl, sheet). The avatar shows the native outlined person symbol at 56% of its size, and an initial comes only from a first grapheme that is a Unicode letter or a decimal digit. The field is focused on arrival at every size, with Continue pinned 12 above the keyboard (X-19, X-20).
- **10 (A03-profile-saving, -failed, -failed-network):** Answered (frame 11, scrolled viewport, and writing). Save failures go in a block under the field with no invalid border. While saving, the name is read-only, Add photo and Leave sign-in are inactive, and "Saving your profile." is said.
- **11 (a refused name):** Answered in writing. "Use 40 characters or fewer for your name." (auth.profile.tooLong) goes below the field. "Choose a name with visible characters and no line breaks or hidden formatting." (auth.profile.nameRefused) gets the invalid border. Both are consistent with FQ70's Default.
- **12 (back and leave):** Answered, correcting both built readings. A02-age and A03 each get a native leading "Leave sign-in" text action, with no chevron and no confirmation alert, inactive while saving. It returns to A02-email with the address kept, and the recorded age stays on the server (component-contracts handoff7.ageExit).
- **13 (the sign-in code line):** Answered. "Sent to {email}" is kept as the one approved Sent exception (FQ68, ADR-029).
- **13a (A02-code-verify-unavailable):** Answered. auth.code.unavailable is "Couldn’t verify the code. Try again.", the same words as FQ86's answered Default (ADR-030). The digits stay and Verify code stays available.
- **13b (Leave sign-in that couldn't finish):** Partly answered, with a correction. The failure is confirmed: a failed leave shows the root's phone-removal failure, never a signed-out email screen over a kept session. The wait is corrected: instead of the static launch screen, a native spinner with "Leaving sign-in…" (root.leaving), and "Loading your account…" for the account read (X-21).
- **14 (H01-loading-no-club):** Answered (frame 13). Wordmark header, "Loading Home…", native spinner, one polite announcement, no Private drafts body row. The initial B is allowed once the account record is known; before that there is no avatar.
- **15 (H01-error-no-club):** Answered (frame 14). "Couldn’t load Home." over the network or refused line, with Retry pinned above the tab bar and a hint naming the tab. The title is utilityTitle 32, correcting the built emptyTitle 25 (X-24).
- **16 (Friends and Memories loading or failing):** Answered. Frames 15 and 16 cover Friends; Memories is given in writing. The words confirm FQ90's Default: "Loading Friends…", "Couldn’t load Friends." and the Memories equivalents. Friends and Memories resolve without an announcement.
- **17 (no-club header on iOS 26):** Answered. The header is content in the scroll view and scrolls away, with an opaque canvas band behind the status bar on iOS 17, 18 and 26; no glass, and no copy in a navigation bar. It adds exact targets and AX stacking (X-23).
- **18 (FQ85 greyed out):** Not applicable. The founder chose FQ85's "show and do nothing", so no greyed-out forms were asked for.
- **19 (processing and pending):** Answered (sheet specimens light, dark and AX5). "Processing · Not added yet" has no spinner or bar, confirming FQ91(a). "Pending on this iPhone · Not added yet" makes no server claim. Failed reads "Not added" with Retry.
- **20 (removed):** Answered. "This drop is no longer available", with no full stop, in metadata/secondaryText on surface, radius 12, inset 16, hugging its own text. The notification screen uses the same words with Back to club. This confirms FQ91(b) and the build.
- **21 (one sheet with the drop card's states):** Partly answered. Every drop state is drawn light and dark at default and largest text, and so are the receipts with and without the action. The busy button, the fields and the highlight covers and expanded row are drawn at the default size only (X-14).
- **22 (when the rail becomes a list):** Answered. The list starts at extraLarge, the first size above Large, which confirms the build's breakpoint. Two lines for "Debby’s pick" are allowed, with no shrink or ellipsis.
- **23 (the star on the star's own pick):** Answered. star.fill 12 at origin 55 from the left and 11 from the top on the tile, level with the avatar and left of the fold; on the row it sits at the trailing 24 inset. The build's x is 57 (X-28).
- **24 (the star's size at large text):** Answered, confirming the build. The cover star stays 12 at every size; the card's lock, the card's Highlight star and the photo label's star scale with their text.
- **25 (tile top inset):** Answered. Top inset 8 is confirmed, along with the avatar 18 and 4 before the label.
- **39 (compact receipt):** Partly answered. It is drawn light, dark and AX5, with and without the action. It sits below the upcoming day's header and above the cards, on return from the composer, and vo.receipt is said once after commit. The disc grows with row text, correcting the built fixed disc (X-26). The specimen's bottom inset contradicts the contract (X-09).
- **40 (thumbnail rows):** Answered. 76 by 92, radius 14, gap 12; row 17/22 for the first line and metadata 13/18 for details, with the centring rule as built. The caption is drawn in primaryText and the date line reads "November 13 · Opens at 7 AM" (X-29).
- **41 (revealed item frame and sender line):** Answered, matching the build: avatar 28 + 8, caption 8 below in body, photo 12 below (8 with no caption), 353 by 304 at radius 14, Highlight label 12 in. The feed aspect is answered too: aspect-fill for portrait and landscape, aspect-fit for a text screenshot (X-31).
- **42 (removed placeholder's form):** Answered, matching the build. It hugs its own text, with no author, caption, time or reason, and is kept only where an open conversation needs the place.
- **44 (revealed item for VoiceOver):** Answered. A container of separate elements (sender, More options, selectable caption, photo "Photo." / "Photo. Highlight.", React, Comment, Save to Favourites) with a Copy caption action. This corrects FQ91(c)'s one-element Default, so it goes to the founder (X-32).
