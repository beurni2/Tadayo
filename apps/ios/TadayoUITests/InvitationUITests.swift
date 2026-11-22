import XCTest

/// Opening an invitation from I have an invite, as the tabs push it (`TabsView`), on the stand-in
/// services' invitation (`UITestLaunch.invite`): I have an invite pushes the paste step with the
/// tab bar hidden and Continue waiting for a link; a link Debby shared shows Sunday people's
/// roster with Ben first, proposed by Debby; Back returns to the field as it was; Accept this roster ends at
/// `G03-waiting`, whose Done returns to Home, which still shows no club; and a link the server
/// doesn't know shows `G02-revoked`, whose Close invitation returns to Home too. The paste
/// control, which the snapshots can't draw, is checked here.
final class InvitationUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testBenOpensDebbysInvitationAcceptsAndWaits() {
        let app = signedIn()
        app.buttons["I have an invite"].tap()

        XCTAssertTrue(app.staticTexts["Have an invitation?"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.navigationBars["Invitation"].exists)
        XCTAssertTrue(eventually { !tabBarShows(app) }, "the tab bar hidden")
        let check = app.buttons["Check the invitation link."]
        XCTAssertFalse(check.isEnabled, "Continue waits for a link")
        let field = app.textFields["Invitation link"]
        field.tap()
        field.typeText(Self.debbysLink)
        XCTAssertTrue(eventually { check.isEnabled }, "Continue takes the link")
        check.tap()

        // The roster, pushed over the paste step: Ben first, as "you".
        XCTAssertTrue(app.staticTexts["Join Sunday people"].waitForExistence(timeout: 10))
        XCTAssertTrue(element("Debby invited you.", in: app).exists)
        let ben = element("Ben. You. Proposed by Debby. Proposed.", in: app)
        let maya = element("Maya.", in: app)
        XCTAssertTrue(ben.exists && maya.exists)
        XCTAssertLessThan(ben.frame.minY, maya.frame.minY, "the viewer first")

        // Back: the paste step, its field as it was, and Continue where a tap reaches it, with no
        // keyboard over it.
        back(in: app)
        XCTAssertTrue(app.staticTexts["Have an invitation?"].waitForExistence(timeout: 5))
        XCTAssertTrue(eventually { check.isEnabled }, "the link still in the field")
        XCTAssertTrue(eventually { shows(check) }, "Continue reachable after Back")
        check.tap()
        XCTAssertTrue(app.staticTexts["Join Sunday people"].waitForExistence(timeout: 10))

        // Accept this roster: waiting on the members, with no count or names.
        app.buttons["Accept this roster"].tap()
        XCTAssertTrue(app.staticTexts["Your acceptance is saved."].waitForExistence(timeout: 10))
        XCTAssertTrue(element("Waiting for club approval", in: app).exists)
        XCTAssertFalse(tabBarShows(app), "no tab bar while waiting")

        // Done: back on Home, which still shows no club.
        app.buttons["Done"].tap()
        XCTAssertTrue(
            eventually(10) { shows(app.buttons["Create a club."]) && tabBarShows(app) },
            "Home, with no club")
        XCTAssertFalse(app.staticTexts["Your acceptance is saved."].exists)
    }

    @MainActor func testALinkTheServerDoesntKnowIsNotAvailable() {
        let app = signedIn()
        app.buttons["I have an invite"].tap()
        let field = app.textFields["Invitation link"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        // The system's paste control, which no snapshot can draw, is on the step with its label.
        XCTAssertTrue(app.buttons["Paste an invitation link."].exists, "the paste control")
        field.tap()
        field.typeText("https://tadayo.app/i#" + String(repeating: "R", count: 43))
        app.buttons["Check the invitation link."].tap()

        XCTAssertTrue(
            app.staticTexts["This invitation isn’t available."].waitForExistence(timeout: 10))
        XCTAssertTrue(element("Ask for a new invitation link.", in: app).exists)
        app.buttons["Close invitation"].tap()
        XCTAssertTrue(
            eventually(10) { shows(app.buttons["Create a club."]) && tabBarShows(app) },
            "Home, with no club")
    }

    // MARK: Helpers

    /// The link the stand-in services know (`UITestLaunch.invitedLink`).
    private static let debbysLink = "https://tadayo.app/i#" + String(repeating: "D", count: 43)

    /// Signed in on the stand-in services' named account with no club, at Home's Start your
    /// club.
    @MainActor private func signedIn() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-TadayoUITestInvite"]
        app.launch()
        XCTAssertTrue(app.textFields["Email address"].waitForExistence(timeout: 10))
        app.typeText("ben@example.com")
        app.buttons["Send a code"].tap()
        XCTAssertTrue(app.textFields["Six-digit code"].waitForExistence(timeout: 5))
        app.typeText("123456")
        app.buttons["Verify code"].tap()
        XCTAssertTrue(app.buttons["I have an invite"].waitForExistence(timeout: 10))
        return app
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

    /// On screen and where a tap reaches it: not under a pushed screen or a sheet.
    @MainActor private func shows(_ element: XCUIElement) -> Bool {
        element.exists && element.isHittable
    }

    @MainActor private func tabBarShows(_ app: XCUIApplication) -> Bool {
        shows(app.tabBars.buttons["Home"])
    }

    /// The system's Back, the pushed screen's bar's first button.
    @MainActor private func back(in app: XCUIApplication) {
        let back = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 5))
        back.tap()
    }

    /// Any element VoiceOver reads as `label`, whatever its kind.
    @MainActor private func element(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label))
            .firstMatch
    }
}
