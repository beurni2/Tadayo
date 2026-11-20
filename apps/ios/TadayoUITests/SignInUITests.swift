import UIKit
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
        // No sign-in ended, so A02-email says nothing of one.
        XCTAssertFalse(
            app.staticTexts["Your sign-in ended. Enter your email to sign in again."].exists)
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
        // Return after Send a code starts no send; the code on its way puts the focus back.
        app.typeText("\n")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        app.typeText("x")
        XCTAssertEqual(field.value as? String, "ben@example.com")
        XCTAssertTrue(app.keyboards.firstMatch.exists)
    }

    /// The keyboard's return key sends a code too, and the field keeps its focus and its keyboard
    /// while it goes, as it does when Send a code is tapped: Return ends a field's editing, and
    /// the screen puts the focus back, also when Return is pressed again while the code is on its
    /// way, which starts no send. `typeText` fails the test if no element has the focus.
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
        app.typeText("\n")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        app.typeText("x")
        XCTAssertEqual(field.value as? String, "ben@example.com")
        XCTAssertTrue(app.keyboards.firstMatch.exists)
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
        // At this size Verify code stays in the column with the keyboard up, 8 + 44 above Change
        // email address and at least 12 above the keyboard's top as the screen draws it, read
        // from under Change email address, where only the canvas is (frames 4 to 8, 24 and 25;
        // `KeyboardFooter`).
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        let change = app.buttons["Change email address"]
        XCTAssertEqual(change.frame.minY - verify.frame.maxY, 52, accuracy: 1)
        let edge = drawnEdge(below: change.frame.maxY, on: app.screenshot(), in: app)
        XCTAssertGreaterThanOrEqual(
            (edge.top ?? 0) - verify.frame.maxY, 12, "Verify code \(verify.frame), \(edge.said)")
        XCTAssertTrue(verify.isHittable)
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
        // Leave sign-in is one button, in the bar, as on A02-age (`ageExit`: "Same on A03.").
        XCTAssertEqual(leaveButtons(in: app).count, 1)
        let next = app.buttons["Continue"]
        XCTAssertFalse(next.isEnabled)
        // Typed with no tap: the name field took the focus as the screen appeared (frame 10).
        app.typeText("Ben")
        XCTAssertEqual(name.value as? String, "Ben")
        XCTAssertTrue(next.isEnabled)
        // Continue is pinned 12 above the keyboard's top as the screen draws it, read from under
        // Continue, where only the footer's canvas is (frame 27; `authForm.keyboardFooter`), and
        // the field ends above the footer, which starts 8 above Continue, so Continue covers
        // none of it ("controls are never overlaid on form text").
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        let typed = settle("the name field's foot over Continue's top") {
            "\(Int(name.frame.maxY.rounded())) over \(Int(next.frame.minY.rounded()))"
        } until: {
            name.frame.maxY <= next.frame.minY - 8 + 0.5
        }
        XCTAssertLessThanOrEqual(
            name.frame.maxY, next.frame.minY - 8 + 0.5,
            "the field \(name.frame), Continue \(next.frame); read \(typed)")
        let foot = drawnEdge(below: next.frame.maxY, on: app.screenshot(), in: app)
        XCTAssertEqual(
            (foot.top ?? 0) - next.frame.maxY, 12, accuracy: 1,
            "Continue \(next.frame), \(foot.said)")
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
        // The bar holds Leave sign-in and nothing else: no back button skips the age.
        XCTAssertEqual(app.navigationBars["Sign in"].buttons.count, 1)
        app.navigationBars["Sign in"].buttons["Leave sign-in"].tap()
        let email = app.textFields["Email address"]
        XCTAssertTrue(email.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["What’s your email?"].exists)
        XCTAssertNotEqual(email.value as? String, "ben@example.com")
        XCTAssertFalse(
            app.staticTexts["Your sign-in ended. Enter your email to sign in again."].exists)
    }

    /// Leave sign-in on A03-profile too, the bar's leading text action (handoff 7's `ageExit`:
    /// "Same on A03."), ends the session and opens A02-email again, empty (FQ93's default), with
    /// no notice that the sign-in ended; the bar holds nothing else, so going back can't undo the
    /// age, which stays recorded on the server.
    @MainActor func testLeavingSignInFromTheProfileStartsAgain() {
        let app = launch("-TadayoUITestFakes")
        signInToTheAge(app)
        app.buttons["I’m 18 or older"].tap()
        XCTAssertTrue(app.textFields["Your name"].waitForExistence(timeout: 5))
        let bar = app.navigationBars["Your profile"]
        XCTAssertEqual(bar.buttons.count, 1)
        bar.buttons["Leave sign-in"].tap()
        let email = app.textFields["Email address"]
        XCTAssertTrue(email.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["What’s your email?"].exists)
        XCTAssertNotEqual(email.value as? String, "ben@example.com")
        XCTAssertFalse(
            app.staticTexts["Your sign-in ended. Enter your email to sign in again."].exists)
    }

    /// A03's first save, from the keyboard's Return key, which ends the field's editing, gets no
    /// answer (`-TadayoUITestNameFailsThenHangs`): its line shows under the field and the column
    /// is scrolled so its frame ends at least 24 above Continue (its line box at least 16:
    /// `errorToActionMinimum`), the field above it under the bar, with the keyboard still up and
    /// the name still focused (IMPLEMENTATION.md: "On failure the name remains focused and the
    /// keyboard stays up. The body scrolls to keep the field and error reachable above Continue";
    /// frame 11), and editing is back. The next save, from Continue, never answers: the name is
    /// then read-only, not disabled, so typing goes nowhere and `typeText` fails the test if the
    /// field lost its focus, also after Return is pressed during that save, when no save starts
    /// and only the save going puts the focus back (`busyPrimary.field`); Continue keeps its
    /// label and says "In progress"; Add photo and Leave sign-in are inactive (`busyPrimary`).
    @MainActor func testAProfileFailureStaysInViewAndTheNameIsReadOnlyWhileSaved() {
        let app = launch("-TadayoUITestNameFailsThenHangs")
        signInToTheAge(app)
        app.buttons["I’m 18 or older"].tap()
        let name = app.textFields["Your name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        app.typeText("Ben")
        let next = app.buttons["Continue"]
        app.typeText("\n")

        let line = app.staticTexts[
            "Couldn’t save your profile. Check your connection and try again."]
        XCTAssertTrue(line.waitForExistence(timeout: 5))
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        XCTAssertEqual(name.value as? String, "Ben")
        let read = settle("the line's foot over Continue's top") {
            "\(Int(line.frame.maxY.rounded())) over \(Int(next.frame.minY.rounded()))"
        } until: {
            line.frame.maxY <= next.frame.minY - 24 + 1
        }
        let bar = app.navigationBars["Your profile"]
        XCTAssertLessThanOrEqual(
            line.frame.maxY, next.frame.minY - 24 + 1,
            "the line \(line.frame), Continue \(next.frame); read \(read)")
        XCTAssertGreaterThanOrEqual(
            name.frame.minY, bar.frame.maxY - 0.5, "the field \(name.frame), bar \(bar.frame)")
        app.typeText("ji")
        XCTAssertEqual(name.value as? String, "Benji")
        XCTAssertTrue(next.isEnabled)
        next.tap()

        let busy = expectation(
            for: NSPredicate(format: "value == %@", "In progress"), evaluatedWith: next)
        wait(for: [busy], timeout: 5)
        XCTAssertFalse(next.isEnabled)
        XCTAssertEqual(next.label, "Continue")
        XCTAssertFalse(bar.buttons["Leave sign-in"].isEnabled)
        XCTAssertFalse(app.buttons["Add photo"].isEnabled)
        app.typeText("x")
        XCTAssertEqual(name.value as? String, "Benji")
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        app.typeText("\n")
        app.typeText("x")
        XCTAssertEqual(name.value as? String, "Benji")
        XCTAssertTrue(app.keyboards.firstMatch.exists)
    }

    /// At the largest text size, Verify code on A02-code would sit under the keyboard, so it is
    /// pinned 12 points above it, where it can be tapped, before a code is checked and once one
    /// isn't verified (handoff 7's frame 19 and `authForm.keyboardFooter`; `KeyboardFooter`). The
    /// keyboard is the simulator's own, and the 12 is measured on the screen as drawn
    /// (`drawnEdge`). Scrolling then reaches Change email address with the keyboard still up and
    /// Verify code still pinned (`authForm.AX5`: "Scroll to access them without dismissing
    /// keyboard"). Each screen measured is attached before it is measured, kept only if the test
    /// fails (`deleteOnSuccess`), so a failure's evidence has it beside frame 19 and a passing run
    /// carries no image no reference could hold (the keyboard is the system's).
    @MainActor func testVerifyCodeIsPinnedAboveTheKeyboardAtTheLargestText() {
        let app = launch(
            "-TadayoUITestFakes", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        XCTAssertTrue(app.textFields["Email address"].waitForExistence(timeout: 10))
        app.typeText("ben@example.com\n")
        let code = app.textFields["Six-digit code"]
        XCTAssertTrue(code.waitForExistence(timeout: 5))
        app.typeText("529614")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        let verify = app.buttons["Verify code"]
        XCTAssertTrue(verify.isEnabled)
        let typed = settle(code, above: verify, in: app)
        assertPinned(
            verify, below: code, on: kept(app.screenshot(), as: "A02-code-typed-xl"), in: app,
            read: typed, ringDrawn: true)
        verify.tap()

        let refused = app.staticTexts[
            "This code couldn’t be verified. Try again or send a new one."]
        XCTAssertTrue(refused.waitForExistence(timeout: 5))
        XCTAssertEqual(code.value as? String, "529614")
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        let error = settle(code, above: verify, in: app)
        assertPinned(
            verify, below: code, on: kept(app.screenshot(), as: "A02-code-error-xl"), in: app,
            read: error, ringDrawn: true)

        // Dragged up from the middle of the screen, over the column's text, a few times at most,
        // until Change email address can be tapped; where it went each time is said if it can't,
        // and the screen is kept before that is checked, since a failure ends the test.
        let change = app.buttons["Change email address"]
        var went = ["\(change.frame)"]
        for _ in 0..<4 where !change.isHittable {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45))
                .press(
                    forDuration: 0.1,
                    thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.15)))
            went.append("\(change.frame)")
        }
        let read = settle(code, above: verify, in: app)
        let scrolled = kept(app.screenshot(), as: "A02-code-error-xl-scrolled")
        XCTAssertTrue(
            change.isHittable,
            "Change email address went \(went); keyboard \(app.keyboards.firstMatch.exists)")
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        assertPinned(verify, below: code, on: scrolled, in: app, read: read, ringDrawn: false)
    }

    /// Reads where the code field's frame ends against Verify code's top until the field ends 8
    /// above it, as the column puts it once Verify code is pinned, for 2 seconds at most, and logs
    /// what it read as an activity, so a passing run's log shows whether it had to wait; the
    /// screen is then taken and checked. What lagged on `main` was the field's accessibility
    /// frame, not the screen: `ios` run 43208004744 (at `1e3651c`) took the screen first, which
    /// drew the field scrolled to the top and Verify code from 476, then read the field's frame
    /// twice, about 0.2 seconds apart, at 399 to 482, its place before the scroll, while Verify
    /// code's frame matched the screen. So this waits for the field's frame to reach what is
    /// drawn. The wait has never been seen to help: in each of the six failures (iOS 26.5 only)
    /// the frame stayed at 399 to 482 for the whole 2 seconds, and `ios` run 44411795444 read
    /// once at each of its six settles. So a frame still under the button after 2 seconds is
    /// stuck, not late. What stuck it was the app's scroll, made inside the update that pinned
    /// Verify code: a probe found the tree stale in 16 of 149 launches on iOS 26.5, from the
    /// first read, until a drag of the column; `CodeScreen` now scrolls a turn of the run loop
    /// later, which left none of 33 stale (`docs/plans/ios-b0-pin-scroll-turn.md`). This check
    /// is unchanged and is what holds the tree to the screen. A field still under the button
    /// after 2 seconds fails the test, as it
    /// did, and now it is decided here, at the wait's last read, before the accessibility tree
    /// is read for `stuck`, since reading the whole tree might itself bring the frame up to
    /// date: stricter by that one read than `assertPinned`'s own, which comes after the
    /// screenshot. The tree is logged first and the test failed last, since a failure ends the
    /// test (`continueAfterFailure` is false).
    @MainActor private func settle(
        _ field: XCUIElement, above verify: XCUIElement, in app: XCUIApplication,
        line: UInt = #line
    ) -> [String] {
        var read: [String] = []
        var settled = false
        let until = Date(timeIntervalSinceNow: 2)
        repeat {
            let foot = field.frame.maxY
            let top = verify.frame.minY
            read.append("\(Int(foot.rounded())) over \(Int(top.rounded()))")
            settled = foot <= top - 8 + 0.5
            if settled { break }
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.2))
        } while Date() < until
        XCTContext.runActivity(
            named: "The code field's foot over Verify code's top, read \(read.count) "
                + "times: \(read.joined(separator: ", "))"
        ) { _ in }
        if !settled {
            let frames = "the field's frame \(field.frame) stayed under Verify code \(verify.frame)"
            stuck(app, field, after: read)
            XCTFail("\(frames) for 2 seconds: \(read)", line: line)
        }
        return read
    }

    /// Keeps the app's accessibility tree when the code field's frame never reached the screen,
    /// to say what holds it: the whole of `debugDescription`, 25 lines to an activity, which the
    /// test log on `evidence` carries, and as a text attachment in the run's result bundle,
    /// which `tools/ci/ios_steps.py` doesn't collect yet, so it goes with the runner. Diagnostics
    /// only: `settle(_:above:in:)` has decided the failure and records it once this returns.
    /// First, before the tree is read, the screen: the focus ring as drawn, logged as it is on a
    /// passing run, so the log says whether the screen or only the frame is where the frame says.
    /// `ios` run 44447546288 on `main` at `42b828e` kept the tree and no screenshot, the test
    /// ending before its first: in that tree the column's five elements are 190 points low,
    /// while their container and the scroll bar's value are a passing run's, so the tree points
    /// at stale frames; the ring as drawn would say so directly. On iOS 26.5, where every
    /// failure has been, the log's activity is what reaches `evidence`: the screenshot is
    /// collected from the snapshot runtime's result bundle alone (`tools/ci/ios_steps.py`).
    @MainActor private func stuck(
        _ app: XCUIApplication, _ field: XCUIElement, after read: [String]
    ) {
        let shot = kept(app.screenshot(), as: "stuck-frame")
        let ring = drawnRing(at: field.frame.midX, high: field.frame.height, on: shot, in: app)
        XCTContext.runActivity(
            named: "The code field's focus ring as drawn with its frame stuck at "
                + "\(field.frame): \(ring.said)"
        ) { _ in }
        let tree = app.debugDescription
        let whole = XCTAttachment(string: tree)
        whole.name = "testVerifyCodeIsPinnedAboveTheKeyboardAtTheLargestText.stuck-frame.txt"
        whole.lifetime = .keepAlways
        add(whole)
        let lines = tree.split(separator: "\n").map {
            $0.trimmingCharacters(in: .whitespaces)
        }
        let parts = stride(from: 0, to: lines.count, by: 25).map {
            lines[$0..<min($0 + 25, lines.count)].joined(separator: " | ")
        }
        for (index, part) in parts.enumerated() {
            XCTContext.runActivity(
                named: "The tree with the code field's frame stuck after \(read.count) reads, "
                    + "part \(index + 1) of \(parts.count): \(part)"
            ) { _ in }
        }
    }

    /// Reads `what` every 0.2 seconds until `done`, for 2 seconds at most, and logs the reads as
    /// an activity named for it, so a passing run's log shows whether it had to wait: an
    /// element's accessibility frame can lag the screen after a scroll (`settle(_:above:in:)`).
    @MainActor private func settle(
        _ what: String, read: () -> String, until done: () -> Bool
    ) -> [String] {
        var reads: [String] = []
        let until = Date(timeIntervalSinceNow: 2)
        repeat {
            reads.append(read())
            if done() { break }
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.2))
        } while Date() < until
        XCTContext.runActivity(
            named: "\(what), read \(reads.count) times: \(reads.joined(separator: ", "))"
        ) { _ in }
        return reads
    }

    /// `shot`, attached as `state` for a failure's evidence: named as `tools/ci/ios_steps.py`
    /// collects a snapshot, and kept only if the test fails.
    @MainActor private func kept(_ shot: XCUIScreenshot, as state: String) -> XCUIScreenshot {
        let screen = XCTAttachment(screenshot: shot)
        screen.name = "testVerifyCodeIsPinnedAboveTheKeyboardAtTheLargestText.\(state).png"
        screen.lifetime = .deleteOnSuccess
        add(screen)
        return shot
    }

    /// Verify code ends 12 points, within 1, above the keyboard's top as `shot` draws it, and
    /// can be tapped there; the code field ends above the pinned footer, which starts 8 above the
    /// button, so the button covers none of it (handoff 7: "controls are never overlaid on form
    /// text"; frame 19 scrolls the field under the navigation bar). The field is also checked
    /// where `shot` draws it, by its focus ring (`drawnRing`): the ring's drawn foot is held to
    /// the bound the frame's foot is, 8 above Verify code's top, since the ring's outer edge is
    /// where the frame ends (`ios` runs 44411795444 and 44418156518: ring to 292, frame to 292,
    /// on both runtimes); and where `ringDrawn`, before any drag, the ring must be found. The frame's
    /// check stays as it was, and its message now says where the ring is drawn, so a frame
    /// that disagrees with the screen shows as that.
    @MainActor private func assertPinned(
        _ verify: XCUIElement, below field: XCUIElement, on shot: XCUIScreenshot,
        in app: XCUIApplication, read: [String], ringDrawn: Bool, line: UInt = #line
    ) {
        let ring = drawnRing(
            at: field.frame.midX, high: field.frame.height, on: shot, in: app)
        XCTContext.runActivity(named: "The code field's focus ring as drawn: \(ring.said)") { _ in }
        XCTAssertLessThanOrEqual(
            field.frame.maxY, verify.frame.minY - 8 + 0.5,
            "the field \(field.frame) above Verify code \(verify.frame); its foot over Verify "
                + "code's top as it settled: \(read); its focus ring as drawn: \(ring.said)",
            line: line)
        if let drawn = ring.foot {
            XCTAssertLessThanOrEqual(
                drawn, verify.frame.minY - 8 + 0.5,
                "the focus ring is drawn to \(drawn), not 8 above Verify code's top "
                    + "\(verify.frame.minY): \(ring.said)", line: line)
        } else if ringDrawn {
            XCTFail("no focus ring found on the screen: \(ring.said)", line: line)
        }
        let foot = verify.frame.maxY
        let edge = drawnEdge(below: foot, on: shot, in: app)
        XCTAssertEqual(
            (edge.top ?? 0) - foot, 12, accuracy: 1,
            "Verify code \(verify.frame), \(edge.said); the keyboard's keys from "
                + "\(app.keyboards.firstMatch.frame.minY)",
            line: line)
        XCTAssertTrue(verify.isHittable, line: line)
    }

    /// Where `shot` draws the code field's focus ring, down the whole column at `x` (the field's
    /// middle, where the ring's top and foot cross it): two runs of the ring's blue, each 1 to 4
    /// points thick as a 2-point stroke is, that span `high`, the field's height, within 1 from
    /// the top of one to the foot of the other. `foot` is the end of the lower one, nil when no
    /// such pair is found, as when the field is scrolled under the navigation bar. The blue is
    /// `Palette.focusRing`'s in the light appearance, which the simulator runs in; it is also
    /// `Palette.action`'s, so the caret, a text action's letters and Verify code's fill match
    /// it too, which is why a pair of thin runs the field's height apart is asked for, not a
    /// run. `said` gives every run, for a message.
    @MainActor private func drawnRing(
        at x: CGFloat, high: CGFloat, on shot: XCUIScreenshot, in app: XCUIApplication
    ) -> (foot: CGFloat?, said: String) {
        guard let (pixels, width, height) = bitmap(shot), app.frame.height > 0 else {
            return (nil, "no screenshot")
        }
        let scale = CGFloat(height) / app.frame.height
        let column = min(max(Int((x * scale).rounded()), 0), width - 1)
        // 0x284CDB, with room for the screen's colour space.
        let blue = [40, 76, 219]
        func isRing(_ row: Int) -> Bool {
            let at = (row * width + column) * 4
            return (0..<3).map { abs(Int(pixels[at + $0]) - blue[$0]) }.reduce(0, +) <= 75
        }
        var runs: [(from: CGFloat, to: CGFloat)] = []
        var row = 0
        while row < height {
            guard isRing(row) else {
                row += 1
                continue
            }
            let from = row
            while row < height, isRing(row) { row += 1 }
            runs.append((CGFloat(from) / scale, CGFloat(row) / scale))
        }
        let said =
            "runs of ring blue at x \(x): "
            + runs.map { "\($0.from) to \($0.to)" }.joined(separator: ", ")
            + "; a field \(high) high (scale \(scale))"
        let strokes = runs.filter { $0.to - $0.from >= 1 && $0.to - $0.from <= 4 }
        for (index, top) in strokes.enumerated() {
            for foot in strokes[(index + 1)...] where abs(foot.to - top.from - high) <= 1 {
                return (foot.to, said)
            }
        }
        return (nil, said)
    }

    /// `shot`'s pixels as RGBA bytes, row by row from the top, with its size in pixels.
    @MainActor private func bitmap(_ shot: XCUIScreenshot) -> ([UInt8], Int, Int)? {
        guard let image = shot.image.cgImage else { return nil }
        let width = image.width
        let height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard
                let context = CGContext(
                    data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                    bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        return drawn ? (pixels, width, height) : nil
    }

    /// Where `shot` draws the keyboard's top below `y`: the first row of points, down the screen's
    /// middle, whose colour is no longer that of the row a point under `y`, the canvas of the
    /// pinned footer's last 12 points. The keyboard element's frame doesn't say: on iOS 26.5 it
    /// began 29 points under the foot of a Verify code the app had pinned 12 above the keyboard
    /// it was given (the first `ios` run of `ios/b0-adopt-pin`, 43178940741), its keys' top
    /// rather than the keyboard's. `said` gives the colours read, for a failure's message.
    @MainActor private func drawnEdge(
        below y: CGFloat, on shot: XCUIScreenshot, in app: XCUIApplication
    ) -> (top: CGFloat?, said: String) {
        guard let (pixels, width, height) = bitmap(shot), app.frame.height > 0 else {
            return (nil, "no screenshot")
        }
        let scale = CGFloat(height) / app.frame.height
        let start = Int(((y + 1) * scale).rounded(.up))
        guard start < height else { return (nil, "nothing read under \(y)") }
        let x = width / 2
        func colour(_ row: Int) -> [Int] {
            (0..<3).map { Int(pixels[(row * width + x) * 4 + $0]) }
        }
        let canvas = colour(start)
        for row in start..<height
        where zip(colour(row), canvas).map({ abs($0 - $1) }).reduce(0, +) > 9 {
            let top = CGFloat(row) / scale
            return (top, "canvas \(canvas) to \(colour(row)) at \(top) (scale \(scale))")
        }
        return (nil, "canvas \(canvas) to the screen's foot (scale \(scale))")
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
        XCTAssertTrue(app.textFields["Your name"].waitForExistence(timeout: 5))
        // The name field has the focus on arrival.
        app.typeText("Ben")
        app.buttons["Continue"].tap()
        XCTAssertTrue(app.staticTexts["Start your club."].waitForExistence(timeout: 5))
    }

    @MainActor private func leaveButtons(in app: XCUIApplication) -> [XCUIElement] {
        app.buttons.matching(NSPredicate(format: "label == %@", "Leave sign-in"))
            .allElementsBoundByIndex
    }

    @MainActor private func launch(_ arguments: String...) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = arguments
        app.launch()
        return app
    }
}
