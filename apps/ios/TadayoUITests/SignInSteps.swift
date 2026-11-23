import Foundation
import XCTest

extension XCUIApplication {
    /// Whether the code screen's field came after Send a code (or Return in the address). The
    /// stand-in services' send answers at once (`UITestLaunch.FakeAuth`), so the screen comes in
    /// the app's next turns; on a saturated runner those have taken more than 5 seconds, which
    /// was this wait's bound (iOS 26.5: `SignInUITests` on 2026-11-20, and `ClubDetailsUITests` on
    /// 2026-11-23, the app idle 0.3 seconds after the tap, at a load of about 200 to 390 on 3
    /// CPUs). Like the hosted tests' `drive` (#93), it waits for the state up to 30 seconds. The
    /// log says when it took more than 5, and, on a miss, holds the app's tree, so a failure shows
    /// what was on screen.
    @MainActor func codeFieldCame() -> Bool {
        let started = Date()
        if textFields["Six-digit code"].waitForExistence(timeout: 30) {
            let waited = Date().timeIntervalSince(started)
            if waited > 5 {
                let seconds = String(format: "%.1f", waited)
                print("SignInSteps: the code field came \(seconds) s after the send")
            }
            return true
        }
        print("SignInSteps: no code field 30 s after the send; the app's tree:")
        print(debugDescription)
        return false
    }
}
