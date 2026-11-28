import XCTest

/// Club details and the members list as the tabs push them (`TabsView`), on the stand-in
/// services' two clubs (`UITestLaunch.clubs`): the switcher's Club details pushes Club details
/// over the tab, with the tab bar hidden; its Members pushes the members list; Back returns one
/// screen at a time, to the tab as it was. And a club whose details answer not found, while its
/// Club details is on screen loading, closes them, back to the tab, with no failure and nothing
/// of the club shown, the list read again choosing the club still listed (T9, T14).
final class ClubDetailsUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testClubDetailsAndMembersPushFromTheSwitcherAndBackReturns() {
        let app = signedIn()
        let selector = app.buttons["Switch club. Sunday people selected."]
        openClubDetails(app)

        XCTAssertTrue(app.staticTexts["Sunday people"].waitForExistence(timeout: 5))
        let members = button(beginning: "Members,", in: app)
        XCTAssertTrue(members.waitForExistence(timeout: 5))
        XCTAssertTrue(button(beginning: "Leave club", in: app).exists)
        XCTAssertTrue(eventually { !shows(selector) }, "the tab's header under the push")
        XCTAssertTrue(eventually { !tabBarShows(app) }, "the tab bar hidden")

        members.tap()
        XCTAssertTrue(element("Ben, you. Monday.", in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(element("Nina. Saturday.", in: app).exists)
        XCTAssertTrue(element("Each person has a day.", in: app).exists)
        XCTAssertFalse(tabBarShows(app), "the tab bar hidden")

        back(in: app)
        XCTAssertTrue(members.waitForExistence(timeout: 5))
        XCTAssertTrue(element("Ben, you. Monday.", in: app).waitForNonExistence(timeout: 5))

        back(in: app)
        XCTAssertTrue(eventually { shows(selector) && tabBarShows(app) }, "the tab as it was")
        XCTAssertTrue(app.tabBars.buttons["Home"].isSelected)

        // Opened again, the members list reads the roster again and shows it.
        openClubDetails(app)
        let again = button(beginning: "Members,", in: app)
        XCTAssertTrue(again.waitForExistence(timeout: 5))
        again.tap()
        XCTAssertTrue(element("Ben, you. Monday.", in: app).waitForExistence(timeout: 5))
    }

    @MainActor func testAClubNoLongerTheCallersClosesItsDetails() {
        let app = signedIn()
        app.buttons["Switch club. Sunday people selected."].tap()
        let kitchen = button(beginning: "Kitchen table.", in: app)
        XCTAssertTrue(kitchen.waitForExistence(timeout: 5))
        kitchen.tap()
        let selector = app.buttons["Switch club. Kitchen table selected."]
        XCTAssertTrue(selector.waitForExistence(timeout: 5))

        openClubDetails(app)
        // Club details is pushed and loading: Kitchen table's details answer not found only
        // after 20 seconds (`UITestLaunch.TwoClubs.notFoundAfter`).
        XCTAssertTrue(element("Loading club details…", in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(eventually { !tabBarShows(app) }, "the tab bar hidden under the push")

        // The not found closes the screen and the list, read again, no longer holds Kitchen
        // table: Sunday people is selected, and nothing of Kitchen table or of a failure stays.
        let sunday = app.buttons["Switch club. Sunday people selected."]
        // The answer comes 20 seconds after the push, so the wait for the tab is longer than that.
        XCTAssertTrue(
            eventually(30) { shows(sunday) && tabBarShows(app) }, "back to the tab, Sunday people")
        XCTAssertFalse(element("Loading club details…", in: app).exists)
        XCTAssertFalse(app.staticTexts["Couldn’t load club details."].exists)
        XCTAssertFalse(selector.exists)
    }

    // MARK: Helpers

    /// Signed in on the stand-in services' named account, at the tabs with Sunday people
    /// selected.
    @MainActor private func signedIn() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-TadayoUITestClubs"]
        app.launch()
        app.leaveWelcome()
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

    /// The switcher from the tab's header, then its Club details.
    @MainActor private func openClubDetails(_ app: XCUIApplication) {
        let selector = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Switch club.")
        ).firstMatch
        XCTAssertTrue(selector.waitForExistence(timeout: 5))
        selector.tap()
        XCTAssertTrue(app.staticTexts["Your clubs"].waitForExistence(timeout: 5))
        app.buttons["Club details"].tap()
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

    @MainActor private func button(beginning label: String, in app: XCUIApplication) -> XCUIElement
    {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
    }

    /// Any element VoiceOver reads as `label`, whatever its kind.
    @MainActor private func element(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label))
            .firstMatch
    }
}
