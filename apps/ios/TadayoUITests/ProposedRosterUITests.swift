import XCTest

/// The proposed roster from Home's Review members (`docs/plans/ios-b1-approve.md` section 2, 7b),
/// on the stand-in services' Sunday people (`UITestLaunch.Proposing`), which Ben created and
/// which hasn't started, where the server made a revision for Debby's own name that Ben hasn't
/// approved: Review members opens the roster with Approve and Decline under it; Manage
/// invitations opens the setup list, and Back the roster again; an Approve with no answer keeps
/// the line and every action, and Back and Review members again open the same decision, its line
/// still there; the next Approve, which the stand-in takes only with the same key (T19), starts
/// the club, and the roster closes onto Home read again. And Done for now on the setup list goes
/// back to Home.
final class ProposedRosterUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testBenApprovesDebbysNameAfterAFailureAndTheClubStarts() {
        let app = signedIn()
        openRoster(app)

        // The setup list over it, and Back to the roster, read again.
        app.buttons["Manage invitations"].tap()
        XCTAssertTrue(app.staticTexts["Invite your people"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let approve = app.buttons["Approve roster for Sunday people."]
        let decline = app.buttons["Decline roster for Sunday people."]
        XCTAssertTrue(approve.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Proposed roster"].exists)

        approve.tap()
        // No answer: the line, and every action kept.
        let line = "Couldn’t approve this roster. Check your connection and try again."
        XCTAssertTrue(element(line, in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(
            eventually {
                approve.isEnabled && decline.isEnabled
                    && app.buttons["Manage invitations"].isEnabled
            }, "every action kept")

        // Back, and Review members again: the same decision, as it stands.
        app.navigationBars.buttons.element(boundBy: 0).tap()
        openRoster(app)
        XCTAssertTrue(element(line, in: app).waitForExistence(timeout: 5), "the same decision")

        XCTAssertTrue(eventually { approve.isEnabled })
        approve.tap()
        // Approved with the same key: the club starts, the roster closes, and Home no longer
        // asks for a review.
        XCTAssertTrue(
            eventually(10) { !app.staticTexts["Proposed roster"].exists }, "the roster closed")
        XCTAssertTrue(
            eventually(10) {
                !app.buttons["Review Sunday people’s updated members."].exists
                    && !app.staticTexts["Review the updated members"].exists
            }, "Home read again")
        XCTAssertTrue(app.buttons["Switch club. Sunday people selected."].exists)
    }

    @MainActor func testDoneForNowOnTheSetupListGoesBackToHome() {
        let app = signedIn()
        openRoster(app)
        app.buttons["Manage invitations"].tap()
        XCTAssertTrue(app.staticTexts["Invite your people"].waitForExistence(timeout: 5))
        let done = app.buttons["Finish managing invitations for now."]
        XCTAssertTrue(done.waitForExistence(timeout: 5))
        done.tap()
        XCTAssertTrue(
            app.buttons["Review Sunday people’s updated members."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Proposed roster"].exists)
        XCTAssertFalse(app.staticTexts["Invite your people"].exists)
    }

    // MARK: Helpers

    /// Signed in on the stand-in services' named account, at the tabs with Sunday people
    /// selected and Home asking for Ben's review.
    @MainActor private func signedIn() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-TadayoUITestPropose"]
        app.launch()
        XCTAssertTrue(app.textFields["Email address"].waitForExistence(timeout: 10))
        app.typeText("ben@example.com")
        app.buttons["Send a code"].tap()
        XCTAssertTrue(app.codeFieldCame())
        app.typeText("123456")
        app.buttons["Verify code"].tap()
        XCTAssertTrue(
            app.buttons["Switch club. Sunday people selected."].waitForExistence(timeout: 10))
        return app
    }

    /// Home's Review members, then the roster: Ben and Debby by name, nothing counted.
    @MainActor private func openRoster(_ app: XCUIApplication) {
        let review = app.buttons["Review Sunday people’s updated members."]
        XCTAssertTrue(review.waitForExistence(timeout: 10))
        review.tap()
        XCTAssertTrue(app.staticTexts["Proposed roster"].waitForExistence(timeout: 5))
        XCTAssertTrue(element("Ben, you.", in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(element("Debby.", in: app).exists)
        XCTAssertTrue(app.buttons["Approve roster for Sunday people."].exists)
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
