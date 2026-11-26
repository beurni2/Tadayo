import XCTest

/// Approving a proposed member from Members (`docs/plans/ios-b1-approve.md` section 4), on the
/// stand-in services' Kitchen table (`UITestLaunch.Approving`), where Maya has proposed Leila and
/// Ben hasn't decided: Leila's proposed row opens G03-approve; an Approve with no answer keeps
/// the line and both actions, and Back and Leila's row again open the same approval, its line
/// still there (its key with it, T19); the next Approve approves and closes back to Members,
/// which reads again, Leila's row then opening nothing (FQ143). And a Decline into a changed
/// roster: the system's alert, whose Review members shows the newer roster, with nothing sent for
/// it.
final class ApproveUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testBenApprovesLeilaAfterAFailureAndIsBackOnMembers() {
        let app = signedIn()
        openApproval(app)

        let approve = app.buttons["Approve Leila joining Kitchen table."]
        let decline = app.buttons["Decline Leila joining Kitchen table."]
        XCTAssertTrue(approve.waitForExistence(timeout: 5))
        approve.tap()
        // No answer: the line, and both actions kept.
        XCTAssertTrue(
            element("Couldn’t approve Leila. Check your connection and try again.", in: app)
                .waitForExistence(timeout: 5))
        XCTAssertTrue(eventually { approve.isEnabled && decline.isEnabled }, "both actions kept")
        XCTAssertTrue(app.staticTexts["Invite Leila?"].exists)

        // Back, and Leila's row again: the same approval, as it stands.
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let leila = app.buttons["Leila. Proposed by Maya. Proposed."]
        XCTAssertTrue(leila.waitForExistence(timeout: 5))
        leila.tap()
        XCTAssertTrue(app.staticTexts["Invite Leila?"].waitForExistence(timeout: 5))
        XCTAssertTrue(
            element("Couldn’t approve Leila. Check your connection and try again.", in: app)
                .exists, "the same approval, its line with it")

        XCTAssertTrue(eventually { approve.isEnabled })
        approve.tap()
        // Approved: back on Members, read again, where Leila's row is no longer a button.
        XCTAssertTrue(
            eventually(10) { !app.staticTexts["Invite Leila?"].exists }, "the approval closed")
        let row = element("Leila. Proposed by Maya. Proposed.", in: app)
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        XCTAssertTrue(element("Ben, you. Monday.", in: app).exists)
        XCTAssertTrue(
            eventually { !app.buttons["Leila. Proposed by Maya. Proposed."].exists },
            "Leila's row opens nothing once Ben has decided")
    }

    @MainActor func testAChangedRosterLeadsToTheNewerRosterWithNeitherDecisionReplayed() {
        let app = signedIn()
        openApproval(app)

        let decline = app.buttons["Decline Leila joining Kitchen table."]
        XCTAssertTrue(decline.waitForExistence(timeout: 5))
        decline.tap()
        let alert = app.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        XCTAssertTrue(alert.staticTexts["Review the updated roster"].exists)
        XCTAssertTrue(
            alert.staticTexts[
                "The members have changed. Review the updated roster before declining."
            ].exists)
        // Its one action, Review members: what VoiceOver calls it goes in the log.
        let review = alert.buttons.firstMatch
        XCTAssertTrue(review.exists)
        print("ui: the changed roster alert's action reads \"\(review.label)\"")
        XCTAssertTrue(
            ["Review members", "Review the updated members of Kitchen table."].contains(
                review.label), review.label)
        review.tap()

        // The newer roster, both actions there, and nothing sent for it: had the Decline been
        // replayed onto it, the stand-in would answer that the roster changed again, and the
        // alert would be back.
        XCTAssertTrue(app.staticTexts["Invite Leila and Nina?"].waitForExistence(timeout: 10))
        let approveBoth = app.buttons["Approve Leila and Nina joining Kitchen table."]
        XCTAssertTrue(approveBoth.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Decline Leila and Nina joining Kitchen table."].exists)
        RunLoop.current.run(until: Date().addingTimeInterval(2))
        XCTAssertFalse(app.alerts.firstMatch.exists, "nothing sent for the newer roster")
        XCTAssertTrue(app.staticTexts["Invite Leila and Nina?"].exists, "still deciding")
        XCTAssertTrue(approveBoth.isEnabled)
    }

    // MARK: Helpers

    /// Signed in on the stand-in services' named account, at the tabs with Kitchen table
    /// selected.
    @MainActor private func signedIn() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-TadayoUITestApprove"]
        app.launch()
        XCTAssertTrue(app.textFields["Email address"].waitForExistence(timeout: 10))
        app.typeText("ben@example.com")
        app.buttons["Send a code"].tap()
        XCTAssertTrue(app.codeFieldCame())
        app.typeText("123456")
        app.buttons["Verify code"].tap()
        XCTAssertTrue(
            app.buttons["Switch club. Kitchen table selected."].waitForExistence(timeout: 10))
        return app
    }

    /// The switcher's Club details, its Members, then Leila's proposed row.
    @MainActor private func openApproval(_ app: XCUIApplication) {
        app.buttons["Switch club. Kitchen table selected."].tap()
        XCTAssertTrue(app.staticTexts["Your clubs"].waitForExistence(timeout: 5))
        app.buttons["Club details"].tap()
        let members = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Members,"))
            .firstMatch
        XCTAssertTrue(members.waitForExistence(timeout: 5))
        members.tap()
        let leila = app.buttons["Leila. Proposed by Maya. Proposed."]
        XCTAssertTrue(leila.waitForExistence(timeout: 5))
        XCTAssertTrue(element("Debby. Friday.", in: app).exists)
        leila.tap()
        XCTAssertTrue(app.staticTexts["Invite Leila?"].waitForExistence(timeout: 5))
        XCTAssertTrue(element("To Kitchen table\u{00A0}· 5 current members", in: app).exists)
    }

    /// Whether `condition` holds within `timeout` seconds, read every 0.2 s.
    @MainActor private func eventually(_ timeout: TimeInterval = 5, _ condition: () -> Bool)
        -> Bool
    {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if condition() { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        return condition()
    }

    /// Any element VoiceOver reads as `label`, whatever its kind.
    @MainActor private func element(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label))
            .firstMatch
    }
}
