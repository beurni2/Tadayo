# A03: the column's scroll for the keyboard, made again a turn later

Branch `ios/b0-profile-scroll-turn`, from `main` at `c1fbdd3`. One app fix for an intermittent failure on iOS 26.5, with nothing loosened in any test. It does for A03-profile what `ios/b0-pin-scroll-turn` (#83, `docs/plans/ios-b0-pin-scroll-turn.md`) did for A02-code.

## 1. What failed

`SignInReadingTests.testContinueSits12AboveTheKeyboardOr44AboveTheSafeArea` (`apps/ios/TadayoTests/SignInReadingTests.swift`) reads A03-profile's form (`ProfileForm`) at the default and the largest text, with a 300-point stand-in keyboard and without, and checks that the name's field ends 16 above Continue with the keyboard up. Now and then, on iOS 26.5 only, at the largest text with the keyboard, it reads the field in its unscrolled place: `"Your name"` at y 689, 75 high, under Continue at y 450 (line 629: -314 against 16). Always the same figures:

| Branch and commit | `ios` run | Date (UTC) | Runner |
|---|---|---|---|
| `ios/b0-ci-runtime-import` at `349117a` | the `ios-full` run of that commit | 2026-11-20, about 00:08 | not sampled then |
| `ios/b1-clubs-root` at `584c8a5` | 44857451832 | 2026-11-21, 03:21 | one-minute load about 400 on 3 CPUs, no idle time |
| `ios/b1-clubs-root` at `b532620` | 44863253175 | 2026-11-21, 04:17 | load 151 then 86, the CPUs 27% then 52% idle |

Three in about 124 iOS 26.5 runs whose `logs/test-26.5.log` is on `evidence` (`git grep` of `origin/evidence` for the test's `failed` and `passed` lines: 3 and 121). None of the three branches changes A03. The test passes in 2.13 to 2.21 seconds in the six green runs read; the failing runs took 2.255 and 4.598.

## 2. What it reads as

The behaviour `ios/b0-pin-scroll-turn`'s probe measured on A02-code (`docs/LIMITATIONS.md`, 2026-11-20): on iOS 26.5, a `ScrollViewReader` scroll made inside the update that gives the column a bottom inset can leave the screen right and the accessibility tree stale, the field's frame where it was before the scroll, until the column is dragged; never on iOS 27.2. `ProfileForm` (`apps/ios/Tadayo/SignIn/ProfileScreens.swift`) makes its scroll the same way: inside `onChange(of: keyboardRise, initial: true)`, in the update where the keyboard's room (here the stand-in) reaches the footer, and inside `onChange(of: line)` as a failure's line shows. `CodeScreen` answers it by making the scroll again in the main queue's next turn; `ProfileForm` doesn't yet.

That this is the cause is inferred: from the iOS version, the figures (the unscrolled place, each time), the runner not being saturated in the last run, and A02-code's probe. It wasn't a screen still moving at the reader's half second: `ios/b0-player-frame-wait` tried a wait for the reading to hold still (`d9cb3e1`, `72cf0ff`) and took it out again (`4ff4ce3`), since a stale tree holds still. The probe in section 4 is to show it on A03.

## 3. The fix

`ProfileForm`'s two scrolls go through `scrollToFoot(_:)`, which scrolls the column's foot to its visible bottom inside the update, as before, and again in the main queue's next turn (`DispatchQueue.main.async`), as `CodeScreen` does. The second asks for the place the first reached, so nothing can be seen to change: the first lands where it did, neither is animated, and the column still moves only as far as it must (the foot to the bottom of the room above Continue).

The line's scroll is made twice too: it is the same kind of scroll, made in the update where the line shows, and the reader can meet it in `testAFailureWithTheKeyboardUpIsScrolledIntoViewAboveContinue`. No failure of that test is recorded, so for it this is the same answer by kind, not a measured one.

Why a second scroll brings the tree up to date isn't known (`docs/plans/ios-b0-pin-scroll-turn.md`, section 3). This is the measured workaround from A02-code, applied where the same scroll is made.

## 4. The probe

`ios/b0-profile-scroll-probe` (never to merge), from this branch's first commit: a Debug-only switch in `ProfileForm` chooses whether the second scroll is made, and a probe test reads A03 at the largest text with the stand-in keyboard 200 times each way, printing `PROBE` lines with how many readings found the field under Continue. Its counts go here once its run is read.

## 5. Tests

- Nothing is loosened: `testContinueSits12AboveTheKeyboardOr44AboveTheSafeArea` and `testAFailureWithTheKeyboardUpIsScrolledIntoViewAboveContinue` keep their bounds, on both iOS versions.
- One green run can't show the fix: the failure came about once in 40 runs. The probe's counts are the evidence.
- This branch's own `ios` run checks that nothing else moved: every snapshot of A03, and the sign-in UI tests that bring the keyboard up on A03.

## 6. Not verified here

VoiceOver on an iPhone with A03's keyboard up is a device check (`docs/plans/ios-b0-device-checks.md`). The probe reads the tree in a hosted test with a stand-in keyboard, as the failing test does, not the system keyboard.
