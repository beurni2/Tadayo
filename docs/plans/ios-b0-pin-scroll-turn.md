# A02-code: the scroll under the pinned Verify code, made again a turn later

Branch `ios/b0-pin-scroll-turn`, from `main` at `05fc191`. One app fix for an intermittent failure, with nothing loosened in any test.

## 1. What failed

`SignInUITests.testVerifyCodeIsPinnedAboveTheKeyboardAtTheLargestText` failed now and then on iOS 26.5, never on iOS 27.2, always the same way: the code field's accessibility frame read 399 to 482, under Verify code's top at 476, for the test's whole 2 seconds, while the screen drew the field at 209 to 292, where it belongs (`ios` run 44644318346: the focus ring's reading on the failing screen). So the screen was right and the accessibility tree was stale: a person looking saw nothing wrong, and an assistive technology that reads frames (Switch Control, Full Keyboard Access, Voice Control) was told the field sat 190 points lower than it did, behind the pinned button.

## 2. What the probe found

`ios/b0-pin-tree-probe` (never to merge) ran the test's first part again and again on CI, with a Debug-only launch argument choosing how `CodeScreen` scrolls once Verify code is pinned. Its PROBE lines are in `logs/test-26.5.log` and `logs/test-27.2.log` (and the `test-summary` files beside them) under `ios/b0-pin-tree-probe/<sha>/ios/` on `evidence`. Stuck launches of launches made:

| Way | iOS 26.5 | iOS 27.2 |
|---|---|---|
| As it was: one scroll, inside the update that pins the button | 4 of 42, 2 of 33, 6 of 28, 3 of 28 | 0 of 10, 0 of 14, 0 of 16 |
| The same, with `layoutChanged` posted a turn later, or 0.6 seconds later | 7 of 41, 3 of 33 | 0 of 10 |
| One scroll, a turn of the run loop later | 0 of 33, 0 of 28 | 10 of 13 |
| The scroll, and again 0.4 seconds later | 0 of 33, 0 of 28 | 0 of 14 |
| **The scroll, and again a turn later (the fix)** | 0 of 28, 0 of 81 | 0 of 14, 0 of 45 |

The runs, in the order of each cell's counts: `d95a1dc` (`ios` 44683814340), `233ca61` (`ios` 44688897798, iOS 26.5 alone), `69920aa` (`ios` 44699395514), `b428f59` (`ios` 44706682053); a run at `2f1d690` was cancelled by the next push.

Also seen:

- The frame is stale from the first read, before the digits are typed, so the test's own waits don't cause it (reading the frame in a tight loop as the screen arrived changed nothing).
- On iOS 26.5, after each stuck read a 12-point drag of the column brought the frame back to the screen.
- One scroll a turn later is no fix: on iOS 27.2 it moved nothing in 10 launches of 13, on the screen as well as in the tree (this branch's first commit, `c9968e9`, did that, and `ios` 44696006195 failed the pin test on iOS 27.2 with Verify code drawn over the field's foot: `ios/b0-pin-scroll-turn/c9968e9/ios/snapshots/stuck-frame.png` on `evidence`). The second probe run had tried it on iOS 26.5 alone.

So with one scroll inside the update, the tree was stale in 25 of 205 launches on iOS 26.5 (15 of 131 with nothing else, 10 of 74 with a notification), about one in eight, and a notification doesn't help; with the fix's way, in 0 of 109 there and 0 of 59 on iOS 27.2. As measured, iOS 27.2 needs the scroll inside the update and iOS 26.5 needs one after it.

## 3. The fix

`CodeScreen` (`apps/ios/Tadayo/SignIn/SignInFlow.swift`) scrolls the field to the top in `onChange(of: pinsVerify)`, in the same update that puts Verify code in the bottom safe area. The fix keeps that scroll and makes it again in the main queue's next turn (`DispatchQueue.main.async`), statement for statement as the probe's `both` way did. No timer, no notification.

Why it works isn't known. The probe measured which ways leave the tree right and which don't; it didn't show what iOS 26.5 does with the first scroll, why a second one for the same place brings the tree up to date, or why iOS 27.2 ignores a scroll made only a turn later. This is a measured workaround for two behaviours of the system, and the pin test is what holds it.

Why this and not the second scroll 0.4 seconds later: both held in the probe on both iOS versions; the next turn is the soonest a second scroll can be made, where 0.4 seconds is a length nothing chose. The probe's last run gave the chosen way the most launches of any (109 on iOS 26.5, 59 on iOS 27.2, none stuck).

What changes for the person: nothing that can be seen. The first scroll lands where it did, and the second asks for the same place. T48 (the pin has no motion of its own) still holds: neither scroll is animated.

The second scroll isn't held back if Verify code is unpinned again within that one turn (the keyboard going as it comes). It would then put the field at the top of a column with nothing pinned over it, which covers nothing; the probe didn't make that case, and reading the screen's state from the queued block would be a different fix from the one measured.

## 4. Tests

- Nothing in `SignInUITests` is loosened: `testVerifyCodeIsPinnedAboveTheKeyboardAtTheLargestText` keeps its 2-second bound, its ring check and its diagnostics, and is the check that the tree follows the screen, on both iOS versions. Its comment gains what the probe found.
- Not provable by one green run: the failure was one launch in eight. The evidence is the probe's counts: were the fix no better than the scroll as it was (25 of 205), 109 launches with none stuck would be a chance of about one in a million, taking launches as independent at that one rate. They aren't quite (stuck launches came in neighbours, a run's rate ranged from 2 of 33 to 6 of 28, and this way was chosen after its first 28), so more carefully: the 81 launches made after it was chosen, at the lowest rate any run showed, would be a chance of about 6 in a thousand. After the merge, every `ios` run on `main` is another launch.
- The iOS 26.5 build: every probe launch, and the wrong first commit's run, was on build 23F77; this branch's run of the fix at `2f98fe2` was on build 23F73, which some runs get (`runtime-build-26.5` in each run's `run.json` on `evidence`). So on 23F73 the fix has test passes and no probe launches, and whether the stale tree shows on 23F73 at all wasn't measured.
- This branch's own runs: `2f98fe2` (the fix), `ci` 44706932719 and `ios` 44706932703 green, 216 tests on iOS 27.2 and 136 on iOS 26.5, no snapshot changed.

## 5. Not verified here

VoiceOver doesn't reach this path (Verify code stays in the column while it runs). Switch Control and Full Keyboard Access on an iPhone are in the founder's device checks (`docs/plans/ios-b0-device-checks.md`). The probe ran Debug builds in the simulator at the largest text size, where Verify code is pinned; a Release build runs the same two statements.

## 6. The review

One fresh reviewer of the whole branch at `f11ee9b` (PR #83), who recomputed every count from the PROBE lines and compared the fix with the probe's `both` way. No must-fix; three should-fix, all taken:

1. The second scroll isn't held back if Verify code is unpinned within the turn: said in the code's comment and in section 3, and left so, since guarding it would be a fix the probe didn't measure.
2. The comment and this plan gave a cause nobody measured ("once that update has been laid out"): reworded to what was measured, with the cause said to be unknown (section 3).
3. The fix's own iOS 26.5 run was on build 23F73 and every probe launch on 23F77: said in section 4.

Notes taken: the chance in section 4 names what it assumes; two stray colons in the journal's table 4.2. Answered: `ProfileForm` (`apps/ios/Tadayo/SignIn/ProfileScreens.swift`) also scrolls inside `onChange`, but adds no inset in that update and no stale tree has been seen there, so it is left; the row in `docs/LIMITATIONS.md` is the note for later screens.
