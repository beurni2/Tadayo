import XCTest

/// Welcome (`A01-welcome`) as a person launches into it, on the stand-in services
/// (`docs/plans/ios-b1-welcome.md` section 6): each of its three routes and Back from each; Create
/// a club through sign-in to `G01-create` on Home; and I have an invite, a link, sign-in, then the
/// invitation, with nothing of the club shown before sign-in (book p9).
final class WelcomeUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    /// Create a club and Already here? Sign in push A02-email, I have an invite the paste step,
    /// signed out (`G02-link-entry`: "Sign in before you can see the club or its people.", the
    /// system's paste control, Continue waiting for a link); the system's back on each returns to
    /// Welcome.
    @MainActor func testEachRouteAndBackFromIt() {
        let app = launch("-TadayoUITestFakes")
        let signIn = app.buttons["Already here? Sign in"]
        XCTAssertTrue(signIn.waitForExistence(timeout: 10))

        app.buttons["Create a club"].tap()
        XCTAssertTrue(app.textFields["Email address"].waitForExistence(timeout: 5))
        back(in: app)
        XCTAssertTrue(eventually { shows(signIn) }, "Welcome after Create a club")

        app.buttons["I have an invite"].tap()
        XCTAssertTrue(app.staticTexts["Have an invitation?"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.navigationBars["Invitation"].exists)
        XCTAssertTrue(
            app.staticTexts["Sign in before you can see the club or its people."].exists)
        XCTAssertTrue(app.buttons["Paste an invitation link."].exists, "the system's paste control")
        let next = app.buttons["Continue"]
        XCTAssertTrue(next.exists)
        XCTAssertFalse(next.isEnabled, "Continue waits for a link")
        back(in: app)
        XCTAssertTrue(eventually { shows(signIn) }, "Welcome after I have an invite")

        signIn.tap()
        XCTAssertTrue(app.textFields["Email address"].waitForExistence(timeout: 5))
        back(in: app)
        XCTAssertTrue(eventually { shows(signIn) }, "Welcome after Already here? Sign in")
    }

    /// Create a club, then sign-in with an account already named and in no club: the tabs open
    /// on Home with `G01-create` pushed (handoff 8: "A02-email, then age/profile if needed, then
    /// G01-create"), and Back returns to Home, with no club.
    @MainActor func testCreateAClubSignsInThenOpensCreate() {
        let app = launch("-TadayoUITestCreate")
        let create = app.buttons["Create a club"]
        XCTAssertTrue(create.waitForExistence(timeout: 10))
        create.tap()
        // A02-email takes the focus as it's pushed over Welcome (`A02-email-from-welcome`).
        let email = app.textFields["Email address"]
        XCTAssertTrue(email.waitForExistence(timeout: 10))
        XCTAssertTrue(
            eventually { (email.value(forKey: "hasKeyboardFocus") as? Bool) ?? false },
            "the email field focused on arrival")
        signIn(app)
        XCTAssertTrue(app.staticTexts["Your people, together."].waitForExistence(timeout: 10))
        XCTAssertTrue(app.textFields["Club name"].exists)
        back(in: app)
        XCTAssertTrue(
            eventually(10) { shows(app.buttons["Create a club."]) }, "Home, with no club")
        XCTAssertTrue(app.tabBars.buttons["Home"].isSelected)
    }

    /// I have an invite: Continue holds Debby's link and pushes A02-email, with nothing of the
    /// club shown; Back to the paste step finds the link in the field, which Continue holds again;
    /// after sign-in, once the club list has answered, Sunday people's roster shows.
    @MainActor func testIHaveAnInviteHoldsTheLinkThroughSignIn() {
        let app = launch("-TadayoUITestInvite")
        let invite = app.buttons["I have an invite"]
        XCTAssertTrue(invite.waitForExistence(timeout: 10))
        invite.tap()
        let field = app.textFields["Invitation link"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText(Self.debbysLink)
        let next = app.buttons["Continue"]
        XCTAssertTrue(eventually { next.isEnabled }, "Continue takes the link")
        next.tap()

        let email = app.textFields["Email address"]
        XCTAssertTrue(email.waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Join Sunday people"].exists, "nothing of the club yet")
        back(in: app)
        XCTAssertTrue(app.staticTexts["Have an invitation?"].waitForExistence(timeout: 5))
        XCTAssertTrue(eventually { next.isEnabled }, "the link still in the field")
        XCTAssertTrue(eventually { shows(next) }, "Continue reachable after Back")
        next.tap()

        signIn(app)
        XCTAssertTrue(app.staticTexts["Join Sunday people"].waitForExistence(timeout: 10))
        XCTAssertTrue(element("Debby invited you.", in: app).exists)
    }

    // MARK: Helpers

    /// Debby's link the stand-in services know (`UITestLaunch.invitedLink`).
    private static let debbysLink = "https://tadayo.app/i#" + String(repeating: "D", count: 43)

    /// A02-email to the right code, from A02-email pushed over Welcome or the paste step. The
    /// field is tapped first: it takes the focus as it's pushed, and the tap makes sure of it
    /// after the paste step's field had it.
    @MainActor private func signIn(_ app: XCUIApplication) {
        let email = app.textFields["Email address"]
        XCTAssertTrue(email.waitForExistence(timeout: 10))
        email.tap()
        email.typeText("ben@example.com")
        app.buttons["Send a code"].tap()
        XCTAssertTrue(app.codeFieldCame())
        app.typeText("123456")
        app.buttons["Verify code"].tap()
    }

    @MainActor private func launch(_ arguments: String...) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = arguments
        app.launch()
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

    /// On screen and where a tap reaches it: not under a pushed screen.
    @MainActor private func shows(_ element: XCUIElement) -> Bool {
        element.exists && element.isHittable
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
