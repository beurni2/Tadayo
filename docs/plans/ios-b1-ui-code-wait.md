# The UI tests' wait for the code screen (`ios/b1-ui-code-wait`)

Tests only: no app code, no snapshot, no check changed. What changes is what a failure prints.

## 1. What failed

Every UI test signs in on the stand-in services before it reaches what it tests: it types an address, taps Send a code (or presses Return), and waits 5 seconds for the code screen's field, "Six-digit code". Twice on iOS 26.5 that wait ran out:

- 2026-11-20, `ios` 44696252066's first attempt on `api/b2-contract-restart` at `61f8f36` (no app change): `SignInUITests.testAProfileFailureStaysInViewAndTheNameIsReadOnlyWhileSaved`, in `signInToTheAge`, line 642 there (journal block 1.3, Next 1). Its log is in `evidence`'s history at commit `a51ea5e3` (`api/b2-contract-restart/61f8f36/ios/logs/test-26.5.log`, lines 862 to 909; the file at `evidence`'s head is the passing re-run's): Send a code's tap synthesised at 15.16 seconds, the app idle at 15.52, no field at 20.64.
- 2026-11-23, `main`'s `ios` 45142323495's first attempt at `4404ff1` (#112): `ClubDetailsUITests.testAClubNoLongerTheCallersClosesItsDetails`, line 84, in `signedIn()` (`main/4404ff1/ios/logs/test-26.5.log` on `evidence`, lines 1231 to 1278): the tap synthesised at 12.31 seconds, the app idle at 12.63, no field at 17.70. The runner's load averages were 207 and 175 on its 3 CPUs at 09:49:55 and 09:50:59 UTC, either side of the test (09:50:28 to 09:50:46; `logs/runner.txt`).

Block 1.3's watch list says what to do when this recurs: read how long the step took and fix the wait at its cause, waiting for the state, not a time, and loosening no check.

## 2. What the logs show, and don't

The first commit read this as a slow runner and raised the wait to 30 seconds. The review (section 5) read the passing waits beside the failures, and they don't bear that reading out:

- In `main/4404ff1`'s iOS 26.5 log, the other 17 waits for the field each ended 1.1 to 2.1 seconds after they began, most at XCTest's first poll, among them `ClubCreateUITests`' shortly before the failure and the next `ClubDetailsUITests` test's 18 seconds after it, under the same load. The 2026-11-20 log's other 7 ended 1.1 to 1.6 seconds after they began. No wait in either log ended between 2.1 and 5 seconds.
- What the app did right after the tap doesn't tell them apart: XCTest's wait for the app to go idle after the tap took 0.0 seconds before each failure, and from 0.0 to 1.7 seconds before the waits that passed.

So the waits that pass are fast, and the two that failed were past 5 seconds, late or never: a field that never came (a tap that missed the button, a button not yet enabled, a send the app dropped) is at least as likely as a slow one, and a longer wait would only help the second, while letting a regression that makes the screen take 6 to 29 seconds pass. The logs can't say which: XCTest captures the app's tree at each check but doesn't print it.

## 3. The change

- `apps/ios/TadayoUITests/SignInSteps.swift` (new): `XCUIApplication.codeFieldCame()` waits 5 seconds for the field, as before. On a miss it prints, on lines starting `SignInSteps:`, Send a code's state (enabled, hittable, frame), the keyboard's frame and the app's tree, any link's `#` fragment hidden as the other UI tests' trees do (T7); then it waits 15 seconds more only to print whether the field came late, and returns false, so the test fails at the caller's line as before.
- The seven waits for the code field use it: `SignInUITests` (`testSignInGoesToTheEndOnStandInServices` twice, `testVerifyCodeIsPinnedAboveTheKeyboardAtTheLargestText`, `signInToTheAge`), `ClubDetailsUITests.signedIn`, `ClubCreateUITests.signedIn` and `InvitationUITests.signedIn`. `testSignInGoesToTheEndOnStandInServices`' third Send a code waits for the screen's title, "Enter your code", and keeps that wait.

## 4. Verification

- swift-format lint (`apps/ios/.swift-format`) on the four files and the new one; the UI tests compile only on CI.
- The branch's `ios` run: every test passes on both runtimes, with the known intermittents (block 1.3, Next 1) read as before, and no `SignInSteps:` line printed unless a wait missed.
- When the failure comes back, its `SignInSteps:` lines (`logs/test-26.5.log` on `evidence`) say what was on screen; the fix follows from them, in its own PR.

## 5. Review

Round 1 (one fresh reviewer of the first commit, `4f10fc9`): no must-fix. Should-fix, all taken in the second commit: the cause was stated as fact against the evidence (section 2: the change is now a diagnosis, the bound back at 5 seconds; the reviewer's own reading, that the app went idle at once as if nothing was sent, doesn't hold either, since passing taps' idle waits also took 0.0 seconds); the 2026-11-20 log was said to be lost where `evidence`'s history keeps it; the helper's comment gave the wrong loads; the claim that every wait after Send a code was covered (the third one waits for the title, section 3); and the founder to be told plainly of any timeout change (none now). Notes taken: the tree's fragments hidden as the other trees do; "after the send" measured from the tap's idle wait (the wording now says within 5 seconds of Send a code). The reviewer found the seven sites unchanged in what they check, a broken send still failing every test, and `print` from a UI test reaching the evidence logs.
