import Foundation
import XCTest

extension XCUIApplication {
    /// Whether the code screen's field came within 5 seconds of Send a code (or Return in the
    /// address), as each of these waits asked before. The stand-in services' send answers at once
    /// (`UITestLaunch.FakeAuth`); where the field came, it came within about 2 seconds, and twice
    /// on iOS 26.5 (`SignInUITests` on 2026-11-20, `ClubDetailsUITests` on 2026-11-23) it hadn't
    /// come after 5. Whether it came late or not at all, and why, the log couldn't say. So on a
    /// miss this prints what was on screen: the app's tree first, with any link's fragment hidden
    /// (T7, T52), then Send a code's state and frame and the keyboard's frame, each read from a
    /// snapshot, which throws where a query would fail the test, so a screen that changes while
    /// it's read still prints and fails at the caller's line. Then it waits 15 seconds more only
    /// to say whether the field came late, and still fails. The check is unchanged.
    @MainActor func codeFieldCame() -> Bool {
        let code = textFields["Six-digit code"]
        if code.waitForExistence(timeout: 5) { return true }
        let tree = debugDescription.replacingOccurrences(
            of: "#[A-Za-z0-9_-]+", with: "#…", options: .regularExpression)
        print("SignInSteps: no code field 5 s after the send.")
        print("SignInSteps: the app's tree:\n\(tree)")
        let send =
            (try? buttons["Send a code"].snapshot()).map {
                "enabled \($0.isEnabled), frame \($0.frame)"
            } ?? "not there"
        let keyboard = (try? keyboards.firstMatch.snapshot()).map { "frame \($0.frame)" }
        print("SignInSteps: Send a code \(send); the keyboard \(keyboard ?? "not there").")
        let late = Date()
        let came = code.waitForExistence(timeout: 15)
        let seconds = String(format: "%.1f", Date().timeIntervalSince(late))
        print(
            came
                ? "SignInSteps: the code field came \(seconds) s later."
                : "SignInSteps: still no code field \(seconds) s later.")
        return false
    }
}
