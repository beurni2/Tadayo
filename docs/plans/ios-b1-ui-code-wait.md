# The UI tests' wait for the code screen (`ios/b1-ui-code-wait`)

Tests only: no app code, no snapshot, no check loosened.

## 1. What failed

Every UI test signs in on the stand-in services before it reaches what it tests: it types an address, taps Send a code (or presses Return), and waits for the code screen's field, "Six-digit code", for 5 seconds. Twice on iOS 26.5 that wait ran out:

- 2026-11-20, `ios` 44696252066's first attempt on `api/b2-contract-restart` at `61f8f36` (no app change): `SignInUITests.testAProfileFailureStaysInViewAndTheNameIsReadOnlyWhileSaved`, in `signInToTheAge` (journal block 1.3, Next 1). Its re-run passed, and its log on `evidence` is the re-run's.
- 2026-11-23, `main`'s `ios` 45142323495's first attempt at `4404ff1` (#112): `ClubDetailsUITests.testAClubNoLongerTheCallersClosesItsDetails`, line 84, in `signedIn()`. The log (`main/4404ff1/ios/logs/test-26.5.log` on `evidence`, lines 1231 to 1278): Send a code tapped at 12.31 seconds, the app idle at 12.63, the field still absent at 17.70; the runner's load averages 389, 207 and 175 on its 3 CPUs at 09:48:53, 09:49:55 and 09:50:59 UTC (`logs/runner.txt`), with the test from 09:50:28 to 09:50:46.

Block 1.3's watch list says what to do when this recurs: read how long the step took and fix the wait at its cause, waiting for the state, not a time, and loosening no check.

## 2. The cause, as far as the logs show

The stand-in's `sendCode` answers at once (`UITestLaunch.FakeAuth`), so the code screen comes in the app's next turns: the model's state, SwiftUI's push and the accessibility tree's update. On a runner that saturated, those turns took more than 5 seconds. No product rule bounds this step's time; the 5 seconds were the test's guess. The logs can't rule out the other reading, a tap that didn't send: XCTest captured the app's tree at each check but the log doesn't hold it.

## 3. The change

- `apps/ios/TadayoUITests/SignInSteps.swift` (new): `XCUIApplication.codeFieldCame()`, which waits for the field up to 30 seconds, as the hosted tests' `drive` does since #93; prints `SignInSteps: the code field came <s> s after the send` when it took more than 5, so a run says when the old bound would have failed; and, on a miss, prints the app's tree, so the next failure says which reading is right (the address screen still up, or a push in flight).
- Its seven waits, each right after Send a code or Return in the address: `SignInUITests` (`testSignInGoesToTheEndOnStandInServices` twice, `testVerifyCodeIsPinnedAboveTheKeyboardAtTheLargestText`, `signInToTheAge`), `ClubDetailsUITests.signedIn`, `ClubCreateUITests.signedIn` and `InvitationUITests.signedIn`.

Every assertion stays: the field must come, and each test checks what it checked before. The other 5-second waits in these helpers haven't failed, so they stay as they are.

## 4. Verification

- swift-format lint (`apps/ios/.swift-format`) on the four files and the new one; the UI tests compile only on CI.
- The branch's `ios` run: every test passes on both runtimes, with the known intermittents (block 1.3, Next 1) read as before; `grep "SignInSteps:" logs/test-*.log` on `evidence` lists any wait that took more than 5 seconds.
- Not provable in one run: that the failure is gone. The log lines say, run by run, how often the old bound would have failed.
