import XCTest

/// Probe only (`ios/b0-pin-tree-probe`, never to merge): the first part of
/// `SignInUITests.testVerifyCodeIsPinnedAboveTheKeyboardAtTheLargestText`, again and again for a
/// set time on each iOS, in four ways in turn (`-TadayoPinProbe`): as it is; the scroll again
/// 0.4 seconds later; the scroll and again a turn of the run loop later; the scroll a turn
/// later alone. It counts how often the field's accessibility frame stays under Verify code for 2
/// seconds, drags the column a little when it does and reads again, and fails on purpose with
/// the tally, so the log carries it.
final class PinProbeUITests: XCTestCase {

    @MainActor func testProbeTheStuckFrame() {
        continueAfterFailure = true
        let older = ProcessInfo.processInfo.operatingSystemVersion.majorVersion < 27
        let end = Date(timeIntervalSinceNow: older ? 18 * 60 : 12 * 60)
        let ways = ["plain", "both", "both", "both"]
        var runs: [String: Int] = [:]
        var stuck: [String: Int] = [:]
        var lines: [String] = []
        var count = 0
        while Date() < end {
            let way = ways[count % ways.count]
            count += 1
            let began = Date()
            let (said, wasStuck) = once(way)
            runs[way, default: 0] += 1
            if wasStuck { stuck[way, default: 0] += 1 }
            let took = String(format: "%.1f", Date().timeIntervalSince(began))
            lines.append("\(count) \(way) \(wasStuck ? "STUCK" : "ok") \(took)s \(said)")
        }
        let tally = ways.map {
            "\($0) \(stuck[$0, default: 0])/\(runs[$0, default: 0])"
        }
        let version = ProcessInfo.processInfo.operatingSystemVersionString
        XCTFail(
            "PROBE \(version): stuck/runs \(tally.joined(separator: ", ")) || "
                + lines.joined(separator: " || "))
    }

    /// One launch to the typed code: what was read, and whether the frame stayed stuck.
    @MainActor private func once(_ way: String) -> (String, Bool) {
        let app = XCUIApplication()
        app.launchArguments = [
            "-TadayoUITestFakes", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL", "-TadayoPinProbe", way,
        ]
        app.launch()
        defer { app.terminate() }
        guard app.textFields["Email address"].waitForExistence(timeout: 10) else {
            return ("no email field", false)
        }
        app.typeText("ben@example.com\n")
        let code = app.textFields["Six-digit code"]
        let verify = app.buttons["Verify code"]
        guard code.waitForExistence(timeout: 5) else { return ("no code field", false) }
        app.typeText("529614")
        guard app.keyboards.firstMatch.waitForExistence(timeout: 5) else {
            return ("no keyboard", false)
        }
        var read: [String] = []
        var settled = false
        let until = Date(timeIntervalSinceNow: 2)
        repeat {
            let foot = code.frame.maxY
            let top = verify.frame.minY
            read.append("\(Int(foot.rounded()))/\(Int(top.rounded()))")
            settled = foot <= top - 8 + 0.5
            if settled { break }
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.2))
        } while Date() < until
        var after = ""
        if !settled {
            // A small drag of the column, then the frames again: whether a scroll of the
            // person's own brings the tree back to the screen.
            let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
            from.press(forDuration: 0.1, thenDragTo: from.withOffset(CGVector(dx: 0, dy: -12)))
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.6))
            after =
                " after a drag \(Int(code.frame.maxY.rounded()))/"
                + "\(Int(verify.frame.minY.rounded()))"
        }
        return ("\(read.joined(separator: ","))\(after)", !settled)
    }
}
