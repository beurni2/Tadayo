import XCTest

/// Opening an invitation from I have an invite, as the tabs push it (`TabsView`), on the stand-in
/// services' invitation (`UITestLaunch.invite`): I have an invite pushes the paste step with the
/// tab bar hidden and Continue waiting for a link; a link Debby shared shows Sunday people's
/// roster with Ben first, proposed by Debby; Back returns to the field as it was; Accept this roster ends at
/// `G03-waiting`, whose Done returns to Home, which still shows no club and now shows the
/// invitation's row (`G06-no-club-invitation`), which opens `G03-waiting` again; a link Maya
/// shared, whose Accept this roster joins Kitchen table, closes the invitation and the paste step,
/// and Home shows the club; and a link the server doesn't know shows `G02-revoked`, whose Close
/// invitation returns to Home too. On `UITestLaunch.inviteChanged`, Home's row for an accepted
/// invitation whose roster changed, with no link held, opens the paste step (FQ136), and Maya's
/// link then shows the changed roster, which joins; or Not now there leaves the row holding the
/// link, so it no longer asks for it and opens the changed roster itself. With a club joined,
/// the switcher's row for the invitation still waiting opens `G03-waiting`. The paste control,
/// which the snapshots can't draw, is checked here.
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
        XCTAssertTrue(
            eventually { shows(check) },
            "Continue reachable after Back: Continue at \(check.frame), keyboard "
                + (app.keyboards.firstMatch.exists
                    ? "at \(app.keyboards.firstMatch.frame)" : "none")
                + ", the window \(app.windows.firstMatch.frame)")
        check.tap()
        XCTAssertTrue(app.staticTexts["Join Sunday people"].waitForExistence(timeout: 10))

        // Accept this roster: waiting on the members, with no count or names.
        app.buttons["Accept this roster"].tap()
        XCTAssertTrue(app.staticTexts["Your acceptance is saved."].waitForExistence(timeout: 10))
        XCTAssertTrue(element("Waiting for club approval", in: app).exists)
        XCTAssertFalse(tabBarShows(app), "no tab bar while waiting")

        // Done: back on Home, which still shows no club, with the invitation's row, the list
        // having been read again while it waited.
        app.buttons["Done"].tap()
        let row = app.buttons["Sunday people. Waiting for members."]
        XCTAssertTrue(
            eventually(10) {
                shows(row) && shows(app.buttons["Create a club."]) && tabBarShows(app)
            },
            "Home, with no club and the invitation's row")
        XCTAssertFalse(app.staticTexts["Your acceptance is saved."].exists)
        XCTAssertTrue(element("Invitations", in: app).exists)

        // The row opens G03-waiting again, from the list's words, and Done returns to Home.
        row.tap()
        XCTAssertTrue(app.staticTexts["Your acceptance is saved."].waitForExistence(timeout: 10))
        XCTAssertTrue(eventually { !tabBarShows(app) }, "the tab bar hidden")
        app.buttons["Done"].tap()
        XCTAssertTrue(
            eventually(10) { shows(row) && tabBarShows(app) }, "Home, with the row still there")
    }

    @MainActor func testAChangedInvitationWithNoLinkAsksForItAndThenJoins() {
        let app = signedIn(as: "-TadayoUITestInviteChanged")
        let row = app.buttons[
            "Kitchen table. Review updated members. Open the invitation link to continue."]
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        XCTAssertTrue(element("Invitations", in: app).exists)

        // No link held: the paste step, nothing accepted (FQ136).
        row.tap()
        XCTAssertTrue(app.staticTexts["Have an invitation?"].waitForExistence(timeout: 5))
        XCTAssertTrue(eventually { !tabBarShows(app) }, "the tab bar hidden")
        let field = app.textFields["Invitation link"]
        field.tap()
        field.typeText(Self.mayasLink)
        app.buttons["Check the invitation link."].tap()

        // The changed roster, which Accept this roster joins: Home shows Kitchen table, and the
        // row is gone with the invitation.
        XCTAssertTrue(app.staticTexts["Review the new roster"].waitForExistence(timeout: 10))
        acceptJoinsKitchenTable(in: app)
        XCTAssertFalse(row.exists)
    }

    @MainActor func testNotNowOnAChangedRosterLeavesItsRowHoldingTheLinkWhichOpensItAgain() {
        let app = signedIn(as: "-TadayoUITestInviteChanged")
        let asks = app.buttons[
            "Kitchen table. Review updated members. Open the invitation link to continue."]
        XCTAssertTrue(asks.waitForExistence(timeout: 10))
        asks.tap()
        let field = app.textFields["Invitation link"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText(Self.mayasLink)
        app.buttons["Check the invitation link."].tap()
        XCTAssertTrue(app.staticTexts["Review the new roster"].waitForExistence(timeout: 10))

        // Not now: Home, where the row, its link now held, no longer asks for it.
        app.buttons["Not now"].tap()
        let row = app.buttons["Kitchen table. Review updated members."]
        XCTAssertTrue(
            eventually(10) { shows(row) && tabBarShows(app) }, "Home, the row holding the link")
        XCTAssertFalse(asks.exists)

        // The row opens the changed roster from the link held, with no paste step, and Accept
        // this roster joins.
        row.tap()
        XCTAssertTrue(app.staticTexts["Review the new roster"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["Have an invitation?"].exists, "no paste step")
        XCTAssertTrue(eventually { !tabBarShows(app) }, "the tab bar hidden")
        acceptJoinsKitchenTable(in: app)
        XCTAssertFalse(row.exists)
    }

    @MainActor func testTheSwitchersRowOpensAnInvitationStillWaitingOnceAClubIsJoined() {
        let app = signedIn()
        // Debby's invitation, accepted, waits on the members.
        app.buttons["I have an invite"].tap()
        let field = app.textFields["Invitation link"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText(Self.debbysLink)
        app.buttons["Check the invitation link."].tap()
        XCTAssertTrue(app.staticTexts["Join Sunday people"].waitForExistence(timeout: 10))
        app.buttons["Accept this roster"].tap()
        XCTAssertTrue(app.staticTexts["Your acceptance is saved."].waitForExistence(timeout: 10))
        app.buttons["Done"].tap()
        let waiting = app.buttons["Sunday people. Waiting for members."]
        XCTAssertTrue(
            eventually(10) { shows(waiting) && tabBarShows(app) }, "Home, with the waiting row")

        // Maya's joins Kitchen table, and Home shows the club.
        app.buttons["I have an invite"].tap()
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText(Self.mayasLink)
        app.buttons["Check the invitation link."].tap()
        XCTAssertTrue(app.staticTexts["Join Kitchen table"].waitForExistence(timeout: 10))
        acceptJoinsKitchenTable(in: app)
        let selector = app.buttons["Switch club. Kitchen table selected."]

        // The switcher lists Debby's invitation, whose row opens G03-waiting on the tab once the
        // sheet has closed; Done returns to Home with Kitchen table.
        selector.tap()
        XCTAssertTrue(waiting.waitForExistence(timeout: 5))
        waiting.tap()
        XCTAssertTrue(app.staticTexts["Your acceptance is saved."].waitForExistence(timeout: 10))
        XCTAssertTrue(eventually { !tabBarShows(app) }, "the tab bar hidden")
        app.buttons["Done"].tap()
        XCTAssertTrue(
            eventually(10) { shows(selector) && tabBarShows(app) }, "Home, with Kitchen table")
        XCTAssertFalse(app.staticTexts["Your acceptance is saved."].exists)
    }

    @MainActor func testBackFromThePasteStepAChangedRowOpenedReturnsToHomeAndItsRow() {
        let app = signedIn(as: "-TadayoUITestInviteChanged")
        let row = app.buttons[
            "Kitchen table. Review updated members. Open the invitation link to continue."]
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.tap()
        XCTAssertTrue(app.staticTexts["Have an invitation?"].waitForExistence(timeout: 5))
        back(in: app)
        XCTAssertTrue(
            eventually(10) { shows(row) && tabBarShows(app) }, "Home, with the row still there")
    }

    @MainActor func testBenAcceptsALinkThatJoinsAndHomeShowsTheClub() {
        let app = signedIn()
        app.buttons["I have an invite"].tap()
        let field = app.textFields["Invitation link"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText(Self.mayasLink)
        app.buttons["Check the invitation link."].tap()
        XCTAssertTrue(app.staticTexts["Join Kitchen table"].waitForExistence(timeout: 10))
        XCTAssertTrue(element("Maya invited you.", in: app).exists)

        // Accept this roster joins: the invitation and the paste step close, the list is read
        // again, and Home shows Kitchen table.
        acceptJoinsKitchenTable(in: app)
        XCTAssertFalse(app.staticTexts["Join Kitchen table"].exists)
        XCTAssertFalse(app.staticTexts["Have an invitation?"].exists)
        XCTAssertFalse(app.buttons["Create a club."].exists)
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

    /// The links the stand-in services know (`UITestLaunch.invitedLink` and `.joiningLink`).
    private static let debbysLink = "https://tadayo.app/i#" + String(repeating: "D", count: 43)
    private static let mayasLink = "https://tadayo.app/i#" + String(repeating: "J", count: 43)

    /// Signed in on the stand-in services' named account with no club, at Home's Start your
    /// club, launched with `launch` (`UITestLaunch.invite` or `.inviteChanged`).
    @MainActor private func signedIn(as launch: String = "-TadayoUITestInvite") -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [launch]
        app.launch()
        app.leaveWelcome()
        XCTAssertTrue(app.textFields["Email address"].waitForExistence(timeout: 10))
        app.typeText("ben@example.com")
        app.buttons["Send a code"].tap()
        XCTAssertTrue(app.codeFieldCame())
        app.typeText("123456")
        app.buttons["Verify code"].tap()
        XCTAssertTrue(app.buttons["I have an invite"].waitForExistence(timeout: 10))
        return app
    }

    /// Accept this roster, on an invitation that joins Kitchen table: Home shows the club, with
    /// the tab bar, within 10 s. When it doesn't, what's on screen goes into the test's log, then
    /// whether a second Accept joins (the first tap reached nothing) or does nothing too (the
    /// invitation shown no longer accepts), because the run's result bundle can't be read from a
    /// cloud session. The test fails at the first Accept either way.
    @MainActor private func acceptJoinsKitchenTable(
        in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line
    ) {
        let accept = app.buttons["Accept this roster"]
        let selector = app.buttons["Switch club. Kitchen table selected."]
        accept.tap()
        let joined = eventually(10) { shows(selector) && tabBarShows(app) }
        if !joined {
            printScreen(app, "no Home with Kitchen table 10 s after Accept this roster")
            if shows(accept) {
                accept.tap()
                let again = eventually(10) { shows(selector) && tabBarShows(app) }
                print(
                    "InvitationUITests: a second Accept this roster "
                        + (again ? "joined" : "did nothing either"))
                if !again { printScreen(app, "10 s after the second Accept this roster") }
            }
        }
        XCTAssertTrue(joined, "Home, with Kitchen table", file: file, line: line)
    }

    /// What's on screen, as the accessibility tree with its element ids masked, into the log.
    @MainActor private func printScreen(_ app: XCUIApplication, _ why: String) {
        let tree = app.debugDescription.replacingOccurrences(
            of: "#[A-Za-z0-9_-]+", with: "#…", options: .regularExpression)
        print("InvitationUITests: \(why):\n\(tree)")
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
