# A02-code: the scroll under the pinned Verify code, a turn later

Branch `ios/b0-pin-scroll-turn`, from `main` at `05fc191`. One app fix for an intermittent failure, with nothing loosened in any test.

## 1. What failed

`SignInUITests.testVerifyCodeIsPinnedAboveTheKeyboardAtTheLargestText` failed now and then on iOS 26.5, never on iOS 27.2, always the same way: the code field's accessibility frame read 399 to 482, under Verify code's top at 476, for the test's whole 2 seconds, while the screen drew the field at 209 to 292, where it belongs (`ios` run 44644318346: the focus ring's reading on the failing screen). So the screen was right and the accessibility tree was stale: a person looking saw nothing wrong, and an assistive technology that reads frames (Switch Control, Full Keyboard Access, Voice Control) was told the field sat 190 points lower than it did, behind the pinned button.

## 2. What the probe found

`ios/b0-pin-tree-probe` (never to merge) ran the test's first part again and again on CI, with a Debug-only launch argument choosing how `CodeScreen` scrolls once Verify code is pinned. Its PROBE lines are in `logs/test-26.5.log` under `ios/b0-pin-tree-probe/<sha>/ios/` on `evidence`.

| Run | Way | Stuck of launches (iOS 26.5) |
|---|---|---|
| `d95a1dc`, `ios` 44683814340 | as it was | 4 of 42 |
| | `layoutChanged` a turn after the scroll | 7 of 41 |
| `233ca61`, `ios` 44688897798 | as it was | 2 of 33 |
| | `layoutChanged` 0.6 seconds after the scroll | 3 of 33 |
| | the scroll a turn of the run loop later | 0 of 33 |
| | the scroll, and again 0.4 seconds later | 0 of 33 |

On iOS 27.2: 0 of 20, as it was. Also seen: the frame is stale from the first read, before the digits are typed, so the test's own waits don't cause it (reading the frame in a tight loop as the screen arrived changed nothing); and after each of the second run's five stuck reads, a 12-point drag of the column brought the frame back to the screen.

So with the scroll as it was, the tree was stale in 16 of 149 launches, about one in nine, and a notification doesn't help. A scroll made after the update that pins the button keeps the tree right.

## 3. The fix

`CodeScreen` (`apps/ios/Tadayo/SignIn/SignInFlow.swift`) scrolls the field to the top in `onChange(of: pinsVerify)`, in the same update that puts Verify code in the bottom safe area. The fix makes that one scroll in the main queue's next turn (`DispatchQueue.main.async`), exactly as the probe's `async` way did: the pinned footer is laid out first, and the scroll follows it. One scroll, no timer, no notification.

Why this and not the scroll twice: both freed the tree in the probe; one scroll after the layout is the smaller change and names its reason, where a second scroll 0.4 seconds later is a timer with no reason behind its length.

What could change for the person: the scroll lands a turn of the run loop after the button is pinned, so for at most a frame the button could stand over the field's foot before the field moves. T48 (the pin has no motion of its own) still holds: the scroll isn't animated.

## 4. Tests

- Nothing in `SignInUITests` is loosened: `testVerifyCodeIsPinnedAboveTheKeyboardAtTheLargestText` keeps its 2-second bound, its ring check and its diagnostics, and is the check that the tree follows the screen. Its comments gain what the probe found.
- Not provable by one green run: the failure was one launch in nine. The evidence is the probe's 0 of 33 against 16 of 149, and a third probe run of the two ways alone; after the merge, every `ios` run on `main` is another launch.

## 5. Not verified here

VoiceOver doesn't reach this path (Verify code stays in the column while it runs). Switch Control and Full Keyboard Access on an iPhone are in the founder's device checks (`docs/plans/ios-b0-device-checks.md`).
