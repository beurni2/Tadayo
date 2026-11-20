import XCTest

/// Probe only (`ios/b0-pin-tree-probe`, never to merge): the first part of
/// `SignInUITests.testVerifyCodeIsPinnedAboveTheKeyboardAtTheLargestText`, again and again for a
/// set time, in four ways in turn: with and without the candidate fix (the app posts
/// `layoutChanged` after its scroll), and with and without reading the code field's frame in a
/// tight loop while the screen arrives. It counts how often the field's accessibility frame stays
/// under Verify code for 2 seconds, and fails on purpose with the tally, so the log carries it.
final class PinProbeUITests: XCTestCase {
    private struct Way {
        let fix: Bool
        let poll: Bool
        var name: String { "\(fix ? "fix" : "plain")+\(poll ? "poll" : "quiet")" }
    }

    @MainActor func testProbeTheStuckFrame() {
        continueAfterFailure = true
        let older = ProcessInfo.processInfo.operatingSystemVersion.majorVersion < 27
        let end = Date(timeIntervalSinceNow: older ? 14 * 60 : 4 * 60)
        let ways = [
            Way(fix: false, poll: false), Way(fix: false, poll: true),
            Way(fix: true, poll: false), Way(fix: true, poll: true),
        ]
        var runs: [String: Int] = [:]
        var stuck: [String: Int] = [:]
        var lines: [String] = []
        var count = 0
        while Date() < end {
            let way = ways[count % ways.count]
            count += 1
            let began = Date()
            let (said, wasStuck) = once(way)
            runs[way.name, default: 0] += 1
            if wasStuck { stuck[way.name, default: 0] += 1 }
            let took = String(format: "%.1f", Date().timeIntervalSince(began))
            lines.append("\(count) \(way.name) \(wasStuck ? "STUCK" : "ok") \(took)s \(said)")
        }
        let tally = ways.map {
            "\($0.name) \(stuck[$0.name, default: 0])/\(runs[$0.name, default: 0])"
        }
        let version = ProcessInfo.processInfo.operatingSystemVersionString
        XCTFail(
            "PROBE \(version): stuck/runs \(tally.joined(separator: ", ")) || "
                + lines.joined(separator: " || "))
    }

    /// One launch to the typed code: what was read, and whether the frame stayed stuck.
    @MainActor private func once(_ way: Way) -> (String, Bool) {
        let app = XCUIApplication()
        app.launchArguments =
            [
                "-TadayoUITestFakes", "-UIPreferredContentSizeCategoryName",
                "UICTContentSizeCategoryAccessibilityXXXL",
            ] + (way.fix ? ["-TadayoPinProbeFix"] : [])
        app.launch()
        defer { app.terminate() }
        guard app.textFields["Email address"].waitForExistence(timeout: 10) else {
            return ("no email field", false)
        }
        app.typeText("ben@example.com\n")
        let code = app.textFields["Six-digit code"]
        let verify = app.buttons["Verify code"]
        var early: [String] = []
        if way.poll {
            let until = Date(timeIntervalSinceNow: 1.5)
            while Date() < until {
                early.append(code.exists ? "\(Int(code.frame.maxY.rounded()))" : "-")
            }
        }
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
        let before = early.isEmpty ? "" : " early \(early.joined(separator: ","))"
        return ("\(read.joined(separator: ","))\(before)", !settled)
    }
}
