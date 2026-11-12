import XCTest

/// The app launched as a person launches it (TECH-DESIGN section 8's accessibility row): what
/// VoiceOver finds on each sign-in screen, by its label, and whether each action is available.
/// Debug builds' Supabase URL never resolves, so nothing here can send a code.
final class SignInUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    /// With no session, the app opens on A02-email (handoff 1) with its field focused, and Send a
    /// code waits for a plausible address.
    @MainActor func testWithNoSessionItOpensOnTheEmailScreen() {
        let app = launch("-TadayoUITestNoSession")
        XCTAssertTrue(app.navigationBars["Sign in"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["What’s your email?"].exists)
        XCTAssertTrue(app.staticTexts["We’ll send a six-digit code to sign in."].exists)
        XCTAssertTrue(app.staticTexts["Use the same email whenever you sign in."].exists)
        let field = app.textFields["Email address"]
        XCTAssertTrue(field.exists)
        let send = app.buttons["Send a code"]
        XCTAssertTrue(send.exists)
        XCTAssertFalse(send.isEnabled)
        // Typed with no tap: the field took the focus as the screen appeared.
        app.typeText("ben@example")
        XCTAssertEqual(field.value as? String, "ben@example")
        XCTAssertFalse(send.isEnabled)
        app.typeText(".com")
        XCTAssertTrue(send.isEnabled)
        // No back on the first screen in B0: Welcome (A01) comes in B1.
        XCTAssertFalse(app.navigationBars["Sign in"].buttons.firstMatch.exists)
    }

    /// While a code is on its way A02-email keeps its focus and its keyboard with the address
    /// read-only, not disabled (handoff 7's `busyPrimary`: "read-only, keep first responder and
    /// keyboard if already shown"): typing then goes nowhere, and `typeText` fails the test if
    /// the field had lost its focus. Send a code keeps its label, says "In progress" and is
    /// dimmed, as the screen disables it. The request never answers (`-TadayoUITestHangingSend`).
    @MainActor func testTheAddressIsReadOnlyWhileACodeIsOnItsWay() {
        let app = launch("-TadayoUITestHangingSend")
        let field = app.textFields["Email address"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        app.typeText("ben@example.com")
        let send = app.buttons["Send a code"]
        XCTAssertTrue(send.isEnabled)
        XCTAssertNotEqual(send.value as? String, "In progress")
        send.tap()

        let busy = expectation(
            for: NSPredicate(format: "value == %@", "In progress"), evaluatedWith: send)
        wait(for: [busy], timeout: 5)
        XCTAssertFalse(send.isEnabled)
        XCTAssertEqual(send.label, "Send a code")

        app.typeText("x")
        XCTAssertEqual(field.value as? String, "ben@example.com")
        XCTAssertTrue(app.staticTexts["What’s your email?"].exists)
    }

    /// The keyboard's return key sends a code too, and the field keeps its focus and its keyboard
    /// while it goes, as it does when Send a code is tapped: Return ends a field's editing, and
    /// the screen puts the focus back. `typeText` fails the test if no element has the focus.
    @MainActor func testSendingFromTheReturnKeyKeepsTheFocus() {
        let app = launch("-TadayoUITestHangingSend")
        let field = app.textFields["Email address"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        app.typeText("ben@example.com\n")
        let send = app.buttons["Send a code"]
        let busy = expectation(
            for: NSPredicate(format: "value == %@", "In progress"), evaluatedWith: send)
        wait(for: [busy], timeout: 5)

        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        app.typeText("x")
        XCTAssertEqual(field.value as? String, "ben@example.com")
    }

    /// Sign-in to its end on stand-in services. Back and Change email address return to A02-email
    /// with the address kept; a code the server doesn't verify keeps its digits and Verify code;
    /// the right one goes on, the age then the name, then the tabs, on Home with no club.
    @MainActor func testSignInGoesToTheEndOnStandInServices() {
        let app = launch("-TadayoUITestFakes")
        let email = app.textFields["Email address"]
        XCTAssertTrue(email.waitForExistence(timeout: 10))
        app.typeText("ben@example.com")
        app.buttons["Send a code"].tap()

        let code = app.textFields["Six-digit code"]
        XCTAssertTrue(code.waitForExistence(timeout: 5))
        // The system's back button is Change email address.
        app.navigationBars["Sign in"].buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.staticTexts["What’s your email?"].waitForExistence(timeout: 5))
        XCTAssertEqual(email.value as? String, "ben@example.com")
        app.buttons["Send a code"].tap()
        XCTAssertTrue(code.waitForExistence(timeout: 5))
        app.buttons["Change email address"].tap()
        XCTAssertTrue(app.staticTexts["What’s your email?"].waitForExistence(timeout: 5))
        XCTAssertEqual(email.value as? String, "ben@example.com")
        app.buttons["Send a code"].tap()

        XCTAssertTrue(app.staticTexts["Enter your code"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Sent to ben@example.com"].exists)
        XCTAssertTrue(app.staticTexts["You can send a new code after one minute."].exists)
        XCTAssertTrue(app.buttons["Change email address"].isEnabled)
        let verify = app.buttons["Verify code"]
        XCTAssertTrue(code.exists)
        XCTAssertFalse(verify.isEnabled)
        // Typed with no tap: the code field took the focus as the screen appeared.
        app.typeText("529614")
        XCTAssertEqual(code.value as? String, "529614")
        // A seventh digit is declined by the model, and the field takes it back (`ModelText`).
        app.typeText("7")
        XCTAssertEqual(code.value as? String, "529614")
        XCTAssertTrue(verify.isEnabled)
        verify.tap()

        let refused = app.staticTexts[
            "This code couldn’t be verified. Try again or send a new one."]
        XCTAssertTrue(refused.waitForExistence(timeout: 5))
        XCTAssertEqual(code.value as? String, "529614")
        XCTAssertTrue(verify.isEnabled)
        code.tap()
        code.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 6))
        XCTAssertFalse(refused.exists)
        code.typeText("123456")
        verify.tap()

        let confirm = app.buttons["I’m 18 or older"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Before you continue"].exists)
        XCTAssertTrue(app.staticTexts["Tadayo is for people aged 18 and older."].exists)
        // Leave sign-in is one button, in the bar, with no chevron or link under the button.
        XCTAssertEqual(leaveButtons(in: app).count, 1)
        confirm.tap()

        let name = app.textFields["Your name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["What should we call you?"].exists)
        XCTAssertTrue(app.buttons["Add photo"].exists)
        let next = app.buttons["Continue"]
        XCTAssertFalse(next.isEnabled)
        name.tap()
        name.typeText("Ben")
        XCTAssertTrue(next.isEnabled)
        next.tap()

        XCTAssertTrue(app.staticTexts["Start your club."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["Home"].isSelected)
    }

    /// The tabs with no club (G06, F01, M01): each tab's own screen, and Go to Home, on Memories,
    /// selects Home (handoff 1).
    @MainActor func testTheTabsWithNoClub() {
        let app = launch("-TadayoUITestFakes")
        signInToTheTabs(app)
        XCTAssertTrue(app.buttons["Create a club."].exists)
        XCTAssertTrue(app.buttons["I have an invite"].exists)
        XCTAssertTrue(app.buttons["Private drafts"].exists)

        app.tabBars.buttons["Friends"].tap()
        XCTAssertTrue(
            app.staticTexts["Your friends will appear here."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["Friends"].isSelected)

        app.tabBars.buttons["Memories"].tap()
        XCTAssertTrue(
            app.staticTexts["Your shared days, kept together."].waitForExistence(timeout: 5))
        app.buttons["Go to Home"].tap()
        XCTAssertTrue(app.staticTexts["Start your club."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["Home"].isSelected)
    }

    /// In builds with the Lab (Debug here), its tab's Log out ends the session and opens
    /// A02-email again, empty (spec 23), with no notice that the sign-in ended.
    @MainActor func testTheLabsLogOutReturnsToSignIn() {
        let app = launch("-TadayoUITestFakes")
        signInToTheTabs(app)
        app.tabBars.buttons["Lab"].tap()
        let logOut = app.navigationBars["Lab"].buttons["Log out"]
        XCTAssertTrue(logOut.waitForExistence(timeout: 5))
        logOut.tap()
        let email = app.textFields["Email address"]
        XCTAssertTrue(email.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["What’s your email?"].exists)
        XCTAssertNotEqual(email.value as? String, "ben@example.com")
        XCTAssertFalse(
            app.staticTexts["Your sign-in ended. Enter your email to sign in again."].exists)
    }

    /// Leave sign-in on A02-age, the bar's leading text action (handoff 7's `ageExit`), ends the
    /// session and opens A02-email again, empty (FQ93's default), with no notice that the sign-in
    /// ended, since the person ended it; going back can't skip the age.
    @MainActor func testLeavingSignInFromTheAgeScreenStartsAgain() {
        let app = launch("-TadayoUITestFakes")
        signInToTheAge(app)
        app.navigationBars["Sign in"].buttons["Leave sign-in"].tap()
        let email = app.textFields["Email address"]
        XCTAssertTrue(email.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["What’s your email?"].exists)
        XCTAssertNotEqual(email.value as? String, "ben@example.com")
        XCTAssertFalse(
            app.staticTexts["Your sign-in ended. Enter your email to sign in again."].exists)
    }

    @MainActor private func signInToTheAge(_ app: XCUIApplication) {
        XCTAssertTrue(app.textFields["Email address"].waitForExistence(timeout: 10))
        app.typeText("ben@example.com")
        app.buttons["Send a code"].tap()
        XCTAssertTrue(app.textFields["Six-digit code"].waitForExistence(timeout: 5))
        app.typeText("123456")
        app.buttons["Verify code"].tap()
        XCTAssertTrue(app.buttons["I’m 18 or older"].waitForExistence(timeout: 5))
    }

    /// Through the age and the name, to Home with no club.
    @MainActor private func signInToTheTabs(_ app: XCUIApplication) {
        signInToTheAge(app)
        app.buttons["I’m 18 or older"].tap()
        let name = app.textFields["Your name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.tap()
        name.typeText("Ben")
        app.buttons["Continue"].tap()
        XCTAssertTrue(app.staticTexts["Start your club."].waitForExistence(timeout: 5))
    }

    @MainActor private func leaveButtons(in app: XCUIApplication) -> [XCUIElement] {
        app.buttons.matching(NSPredicate(format: "label == %@", "Leave sign-in"))
            .allElementsBoundByIndex
    }

    @MainActor private func launch(_ mode: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [mode]
        app.launch()
        return app
    }
}
