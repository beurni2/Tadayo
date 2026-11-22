import XCTest

/// Creating a club from the tab with no club, as the tabs push it (`TabsView`), on the stand-in
/// services' club made in memory (`UITestLaunch.create`): Create a club pushes the naming screen
/// with the tab bar hidden; Continue to invitations puts the setup list in its place, empty;
/// Create an invitation pushes the name step, whose Create link and share makes Sam's link and
/// opens the system's share sheet; closed unshared, the screen returns to the list, where Sam's
/// row reads Not shared with Share link (`createInvitation.retention`); Revoke link from More asks
/// the system's alert first and then reads Link revoked; Done for now puts the waiting screen in
/// the list's place, with the club's name in the bar; and Back returns to Home, which now shows
/// the club made.
final class ClubCreateUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testACreatorNamesTheClubInvitesSamAndWaits() {
        let app = signedIn()
        app.buttons["Create a club."].tap()

        XCTAssertTrue(app.staticTexts["Your people, together."].waitForExistence(timeout: 5))
        XCTAssertTrue(eventually { !tabBarShows(app) }, "the tab bar hidden")
        let continueButton = app.buttons["Continue to invitations"]
        XCTAssertFalse(continueButton.isEnabled, "Continue waits for a name")
        let name = app.textFields["Club name"]
        name.tap()
        name.typeText("Sunday people")
        XCTAssertTrue(eventually { continueButton.isEnabled }, "Continue takes the name")
        continueButton.tap()

        // The setup list, in the naming screen's place, before anyone is invited.
        XCTAssertTrue(app.staticTexts["Invite your people"].waitForExistence(timeout: 10))
        XCTAssertTrue(element("Only you can see this list.", in: app).exists)
        XCTAssertFalse(app.staticTexts["Your people, together."].exists)
        app.buttons["Create an invitation"].tap()

        // The name step takes the focus on arrival, as handoff 2's frame draws the keyboard.
        XCTAssertTrue(app.staticTexts["Who is it for?"].waitForExistence(timeout: 5))
        let person = app.textFields["Person’s name"]
        XCTAssertTrue(
            eventually { (person.value(forKey: "hasKeyboardFocus") as? Bool) ?? false },
            "the name field focused on arrival")
        person.typeText("Sam")
        app.buttons["Create link and share"].tap()

        closeShareSheet(app)

        // Back on the list: Sam's link kept, not shared, and Share link shares the same one.
        let sam = element("Sam. Not shared.", in: app)
        XCTAssertTrue(sam.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Share link for Sam"].exists)
        XCTAssertFalse(app.staticTexts["Who is it for?"].exists)

        // Revoke link asks first, then the row says so.
        app.buttons["More options for Sam’s invitation"].tap()
        // The system's menu item, read by its words or by the label naming Sam.
        let revoke = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Revoke link"))
            .firstMatch
        XCTAssertTrue(revoke.waitForExistence(timeout: 5))
        revoke.tap()
        let alert = app.alerts["Revoke Sam’s invitation link?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        XCTAssertTrue(alert.buttons["Keep link"].exists)
        alert.buttons["Revoke link"].tap()
        XCTAssertTrue(element("Sam. Link revoked.", in: app).waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Create new link for Sam"].exists)

        // Done for now: the waiting screen, with the club's name in the bar.
        app.buttons["Finish managing invitations for now."].tap()
        XCTAssertTrue(
            app.staticTexts["Waiting for club confirmation"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.navigationBars["Sunday people"].exists)
        XCTAssertFalse(tabBarShows(app), "no tab bar on the waiting screen")

        // Back returns to Home, which shows the club made.
        back(in: app)
        let selector = app.buttons["Switch club. Sunday people selected."]
        XCTAssertTrue(eventually(10) { shows(selector) && tabBarShows(app) }, "Home, the club")
        XCTAssertTrue(app.tabBars.buttons["Home"].isSelected)
    }

    // MARK: Helpers

    /// Signed in on the stand-in services' named account with no club, at Home's Start your
    /// club.
    @MainActor private func signedIn() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-TadayoUITestCreate"]
        app.launch()
        XCTAssertTrue(app.textFields["Email address"].waitForExistence(timeout: 10))
        app.typeText("ben@example.com")
        app.buttons["Send a code"].tap()
        XCTAssertTrue(app.textFields["Six-digit code"].waitForExistence(timeout: 5))
        app.typeText("123456")
        app.buttons["Verify code"].tap()
        XCTAssertTrue(app.buttons["Create a club."].waitForExistence(timeout: 10))
        return app
    }

    /// The system's share sheet, shown with the link and closed without sharing: its Close
    /// button, or a swipe down where it has none.
    @MainActor private func closeShareSheet(_ app: XCUIApplication) {
        let sheet = app.otherElements["ActivityListView"]
        let close = app.buttons["Close"]
        XCTAssertTrue(
            eventually(10) { sheet.exists || close.exists }, "the system's share sheet")
        if close.waitForExistence(timeout: 2) {
            close.tap()
        } else {
            sheet.swipeDown(velocity: .fast)
        }
        XCTAssertTrue(
            eventually(10) { !sheet.exists && !close.exists }, "the share sheet closed")
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
