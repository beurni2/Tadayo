import XCTest

/// Inviting someone into an active club (`docs/plans/ios-b1-approve.md` section 2, 7c), on the
/// stand-in services' Sunday people, active with five members and a place free
/// (`UITestLaunch.InvitingLater`): Club details' Invite someone opens the name step, whose Create
/// link and share proposes Nina, makes Nina's link and opens the system's share sheet; closed
/// unshared, Nina's invitation page takes the name step's place, Nina's link Not shared and
/// offered again by Share link (`createInvitation.retention`). Back is Club details, read again,
/// where Invite someone has gone, since Nina took the last place; its Members lists Nina's
/// proposed row, which opens the same page.
final class InviteLaterUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor func testBenInvitesNinaFromClubDetailsAndComesBackToHerPageFromMembers() {
        let app = signedIn()
        app.buttons["Switch club. Sunday people selected."].tap()
        XCTAssertTrue(app.staticTexts["Your clubs"].waitForExistence(timeout: 5))
        app.buttons["Club details"].tap()

        // Invite someone, between Members and Schedule.
        let invite = app.buttons["Invite someone"]
        XCTAssertTrue(invite.waitForExistence(timeout: 5))
        invite.tap()

        XCTAssertTrue(app.staticTexts["Who is it for?"].waitForExistence(timeout: 5))
        let person = app.textFields["Person’s name"]
        XCTAssertTrue(
            eventually { (person.value(forKey: "hasKeyboardFocus") as? Bool) ?? false },
            "the name field focused on arrival")
        person.typeText("Nina")
        app.buttons["Create link and share"].tap()

        closeShareSheet(app)

        // Nina's invitation page, in the name step's place: the link kept and not shared.
        XCTAssertTrue(app.staticTexts["Nina’s invitation"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["Who is it for?"].exists)
        XCTAssertTrue(element("Not shared. Each person gets a separate link.", in: app).exists)
        XCTAssertTrue(element("5 current members", in: app).exists)
        XCTAssertTrue(app.buttons["Share link for Nina"].exists)
        XCTAssertTrue(app.buttons["More options for Nina’s invitation"].exists)

        // Back: Club details, read again, with no place free for anyone else.
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let members = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Members,"))
            .firstMatch
        XCTAssertTrue(members.waitForExistence(timeout: 5))
        XCTAssertTrue(
            eventually { !app.buttons["Invite someone"].exists },
            "Invite someone gone at six")

        // Members: Nina's proposed row opens Nina's page again.
        members.tap()
        let nina = app.buttons["Nina. Proposed by Ben. Proposed."]
        XCTAssertTrue(nina.waitForExistence(timeout: 5))
        XCTAssertTrue(element("Debby. Friday.", in: app).exists)
        nina.tap()
        XCTAssertTrue(app.staticTexts["Nina’s invitation"].waitForExistence(timeout: 5))
        XCTAssertTrue(
            element("Not shared. Each person gets a separate link.", in: app)
                .waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Share link for Nina"].exists)
    }

    // MARK: Helpers

    /// Signed in on the stand-in services' named account, at the tabs with Sunday people
    /// selected.
    @MainActor private func signedIn() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-TadayoUITestInviteLater"]
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

    /// The system's share sheet, shown with the link and closed without sharing, as
    /// `ClubCreateUITests` closes it: its Close button where a system shows one, else a tap on the
    /// region around the popover, else a drag down. The log says which way closed it; only when
    /// the first way didn't does it also hold the tree, any link's fragment hidden (T7).
    @MainActor private func closeShareSheet(_ app: XCUIApplication) {
        let sheet = app.otherElements["ActivityListView"]
        let close = app.buttons["Close"]
        XCTAssertTrue(
            eventually(10) { sheet.exists || close.exists }, "the system's share sheet")
        let up = { sheet.exists || close.exists }
        let region = app.otherElements["PopoverDismissRegion"]
        let way: String
        if close.waitForExistence(timeout: 2), close.isHittable {
            close.tap()
            way = "its Close button"
        } else if region.exists {
            region.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2)).tap()
            way = "a tap on the region around it"
        } else {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.55))
                .press(
                    forDuration: 0.05,
                    thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 1)))
            way = "a drag down"
        }
        if eventually(5, { !up() }) {
            print("InviteLaterUITests: the share sheet closed by \(way)")
        } else {
            let tree = app.debugDescription.replacingOccurrences(
                of: "#[A-Za-z0-9_-]+", with: "#…", options: .regularExpression)
            print(
                "InviteLaterUITests: the share sheet is still up after \(way); tapping above it:\n"
                    + tree)
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2)).tap()
        }
        XCTAssertTrue(eventually(10) { !up() }, "the share sheet closed")
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
