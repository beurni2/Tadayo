import XCTest

/// The app launched as a person launches it (TECH-DESIGN section 8's accessibility row): what
/// VoiceOver finds on each sign-in screen, by its label, and whether each action is available.
/// Debug builds' Supabase URL never resolves, so nothing here can send a code.
final class SignInUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    /// With no session, the app opens on A02-email (handoff 1), and Send a code waits for a
    /// plausible address.
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
        field.tap()
        field.typeText("ben@example")
        XCTAssertFalse(send.isEnabled)
        field.typeText(".com")
        XCTAssertTrue(send.isEnabled)
        // No back on the first screen in B0: Welcome (A01) comes in B1.
        XCTAssertFalse(app.navigationBars["Sign in"].buttons.firstMatch.exists)
    }

    /// Sign-in to its end on stand-in services: a code the server doesn't verify keeps its digits
    /// and Verify code, the right one goes on, the age then the name, then the tabs.
    @MainActor func testSignInGoesToTheEndOnStandInServices() {
        let app = launch("-TadayoUITestFakes")
        let email = app.textFields["Email address"]
        XCTAssertTrue(email.waitForExistence(timeout: 10))
        email.tap()
        email.typeText("ben@example.com")
        app.buttons["Send a code"].tap()

        XCTAssertTrue(app.staticTexts["Enter your code"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Sent to ben@example.com"].exists)
        XCTAssertTrue(app.staticTexts["You can send a new code after one minute."].exists)
        XCTAssertTrue(app.buttons["Change email address"].isEnabled)
        let code = app.textFields["Six-digit code"]
        let verify = app.buttons["Verify code"]
        XCTAssertTrue(code.exists)
        XCTAssertFalse(verify.isEnabled)
        code.tap()
        code.typeText("529614")
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

        // The tabs are the next PR's; until then a Debug build opens the Lab there.
        XCTAssertTrue(app.navigationBars["Lab"].waitForExistence(timeout: 5))
    }

    @MainActor private func launch(_ mode: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [mode]
        app.launch()
        return app
    }
}
