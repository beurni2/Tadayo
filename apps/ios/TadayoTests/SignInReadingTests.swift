import SwiftUI
import TadayoCore
import TadayoDesign
import XCTest

@testable import Tadayo

/// What VoiceOver finds on A02-email, A02-code, A02-age and A03, read in the hosted tests so it is read
/// on iOS 17.5 and 18.6 too (the snapshot tests, which hold the sign-in readings from before
/// handoff 7, are skipped there): the busy button's value and the field that is read-only, not
/// disabled (handoff 7's `busyPrimary`), the empty field's one reading of its label, and
/// A02-code's resend row and its failure's own block. A hosted test can't speak, so what the
/// person hears is a device check in the TestFlight notes.
@MainActor
final class SignInReadingTests: XCTestCase {
    private let clock = StillClock()

    private func signIn(_ auth: ScriptedAuth, ended: Bool = false) -> SignInModel {
        let clock = clock
        return SignInModel(
            auth: auth, verified: { _ in }, signInEnded: ended, now: { clock.now },
            sleep: { try await clock.sleep(until: $0) })
    }

    /// A02-code, after a code went to ben@example.com.
    private func onCode(
        sends: [Outcome<AuthFailure>] = [.answer], verifies: [Outcome<AuthFailure>] = []
    ) -> SignInModel {
        let model = signIn(ScriptedAuth(sends: sends, verifies: verifies))
        model.email = "ben@example.com"
        drive({ await model.sendCode() }, until: { model.step == .code })
        return model
    }

    private func letTheMinutePass(_ model: SignInModel) {
        clock.letTheMinutePass()
        drive({ await model.waitForResend() }, until: { model.canResend })
    }

    private func age(updates: [Outcome<APIFailure>] = []) -> ProfileModel {
        ProfileModel(
            account: Account(
                id: "ben", displayName: nil, avatarVersion: nil, ageConfirmed: false, version: 0),
            accounts: ScriptedAccounts(updates: updates), saved: { _ in }, signedOut: {})
    }

    /// The placeholder repeats the label's words (frame 1), so the field must not say them twice
    /// (W-08): "Email address" is read once across every element's label, value and hint. The
    /// screen draws the placeholder over a field that has none of its own (an empty title), since
    /// a prompt, a title or a label view is what UIKit says as an empty field's value, and an empty
    /// accessibility value doesn't replace it (`ios` runs 43091597765 and 43094144185).
    func testTheEmptyAddressFieldIsReadOnce() {
        let elements = AccessibilityElements.of(
            EmailScreen(model: signIn(ScriptedAuth()), focus: true))
        let field = elements.first { $0.label == "Email address" }
        XCTAssertNotNil(field, "\(elements)")
        XCTAssertEqual(field?.value, "", "\(elements)")
        let said = elements.flatMap { [$0.label, $0.value, $0.hint] }
            .filter { $0 == "Email address" }
        XCTAssertEqual(said, ["Email address"], "\(elements)")
    }

    /// While a code is on its way Send a code keeps its label and says "In progress", dimmed as the
    /// screen disables it; the field is read-only, not disabled (handoff 7: "Do not disable the
    /// whole form in a way that unexpectedly resigns first responder"), so it isn't dimmed and
    /// keeps its value; and nothing else says "In progress".
    func testWhileACodeIsOnItsWayTheButtonIsBusyAndTheFieldOnlyReadOnly() {
        let model = signIn(ScriptedAuth(sends: [.hang]))
        model.email = "ben@example.com"
        drive({ await model.sendCode() }, until: { model.isSending })
        let elements = AccessibilityElements.of(EmailScreen(model: model, focus: true))

        let send = elements.first { $0.label == "Send a code" }
        XCTAssertEqual(send?.value, "In progress", "\(elements)")
        XCTAssertTrue(send?.traits.contains(.button) ?? false, "\(elements)")
        XCTAssertTrue(send?.traits.contains(.notEnabled) ?? false, "\(elements)")

        let field = elements.first { $0.label == "Email address" }
        XCTAssertEqual(field?.value, "ben@example.com", "\(elements)")
        XCTAssertFalse(field?.traits.contains(.notEnabled) ?? true, "\(elements)")

        let said = elements.flatMap { [$0.label, $0.value, $0.hint] }
            .filter { $0.contains("In progress") }
        XCTAssertEqual(said, ["In progress"], "\(elements)")
    }

    /// Idle, Send a code has no value, and is dimmed only until the address is plausible.
    func testIdleSendACodeHasNoValue() {
        let model = signIn(ScriptedAuth())
        model.email = "ben@example.com"
        let elements = AccessibilityElements.of(EmailScreen(model: model, focus: true))
        let send = elements.first { $0.label == "Send a code" }
        XCTAssertEqual(send?.value, "", "\(elements)")
        XCTAssertFalse(send?.traits.contains(.notEnabled) ?? true, "\(elements)")
        let empty = AccessibilityElements.of(
            EmailScreen(model: signIn(ScriptedAuth()), focus: true))
        XCTAssertTrue(
            empty.first { $0.label == "Send a code" }?.traits.contains(.notEnabled) ?? false,
            "\(empty)")
    }

    /// After a sign-in the server ended, A02-email says so in a plain line under the subtitle and
    /// above the field (handoff 7's `auth.email.signedOut`; IMPL §4: "a neutral body notice above
    /// the field, not as an invalid-email error"): not a button, with no hint, and the field
    /// unmarked with no hint; when the address typed in this launch is still held, the field's
    /// value is that address (IMPL §4: "Retain the address if still available").
    func testASignInTheServerEndedIsSaidInAPlainLineAboveTheField() {
        let words = "Your sign-in ended. Enter your email to sign in again."
        let elements = AccessibilityElements.of(
            EmailScreen(model: signIn(ScriptedAuth(), ended: true), focus: true))
        let labels = elements.map(\.label)
        let notice = elements.first { $0.label == words }
        XCTAssertNotNil(notice, "\(elements)")
        XCTAssertEqual(notice?.hint, "", "\(elements)")
        XCTAssertEqual(notice?.value, "", "\(elements)")
        XCTAssertFalse(notice?.traits.contains(.button) ?? true, "\(elements)")
        let subtitle = labels.firstIndex(of: "We’ll send a six-digit code to sign in.")
        let at = labels.firstIndex(of: words)
        let field = labels.firstIndex(of: "Email address")
        XCTAssertNotNil(subtitle, "\(elements)")
        XCTAssertNotNil(field, "\(elements)")
        XCTAssertLessThan(subtitle ?? .max, at ?? .min, "\(elements)")
        XCTAssertLessThan(at ?? .max, field ?? .min, "\(elements)")
        XCTAssertEqual(elements.first { $0.label == "Email address" }?.hint, "", "\(elements)")
        // After a Leave the person asked for, or with no sign-in before, there is no notice.
        let none = AccessibilityElements.of(
            EmailScreen(model: signIn(ScriptedAuth()), focus: true))
        XCTAssertFalse(none.contains { $0.label == words }, "\(none)")
        // As `RootModel` builds it after a server ending: the notice, and the address kept.
        let kept = signIn(ScriptedAuth(), ended: true)
        kept.email = "ben@example.com"
        let held = AccessibilityElements.of(EmailScreen(model: kept, focus: true))
        XCTAssertTrue(held.contains { $0.label == words }, "\(held)")
        XCTAssertEqual(
            held.first { $0.label == "Email address" }?.value, "ben@example.com", "\(held)")
    }

    /// A02-age's Leave sign-in is one button, the bar's leading text action, with no chevron or
    /// link under the button (handoff 7's `ageExit`), and it is dimmed while I’m 18 or older is
    /// saved, which says "In progress" (X-18; `busyPrimary`); a failure makes it available again.
    func testA02AgesLeaveSignInIsOneButtonInactiveWhileTheAgeIsSaved() {
        let idle = AccessibilityElements.of(AgeScreen(model: age(), leave: {}))
        let leave = idle.filter { $0.label == "Leave sign-in" }
        XCTAssertEqual(leave.count, 1, "\(idle)")
        XCTAssertTrue(leave.first?.traits.contains(.button) ?? false, "\(idle)")
        XCTAssertFalse(leave.first?.traits.contains(.notEnabled) ?? true, "\(idle)")
        // The screen's only buttons are Leave sign-in and I’m 18 or older, so no back button,
        // whatever its label, can skip the age; and Leave sign-in is in the bar, above the title.
        let buttons = Set(idle.filter { $0.traits.contains(.button) }.map(\.label))
        XCTAssertEqual(buttons, ["Leave sign-in", "I’m 18 or older"], "\(idle)")
        let title = idle.first { $0.label == "Before you continue" }
        XCTAssertNotNil(title, "\(idle)")
        XCTAssertLessThanOrEqual(
            leave.first?.frame.maxY ?? .infinity, title?.frame.minY ?? -.infinity, "\(idle)")

        let saving = age(updates: [.hang])
        drive({ await saving.confirmAge() }, until: { saving.isSaving })
        let busy = AccessibilityElements.of(AgeScreen(model: saving, leave: {}))
        let inactive = busy.filter { $0.label == "Leave sign-in" }
        XCTAssertEqual(inactive.count, 1, "\(busy)")
        XCTAssertTrue(inactive.first?.traits.contains(.notEnabled) ?? false, "\(busy)")
        let confirm = busy.first { $0.label == "I’m 18 or older" }
        XCTAssertEqual(confirm?.value, "In progress", "\(busy)")

        let failed = age(updates: [.fail(.network)])
        drive({ await failed.confirmAge() }, until: { failed.failure == .network })
        let after = AccessibilityElements.of(AgeScreen(model: failed, leave: {}))
        XCTAssertFalse(
            after.first { $0.label == "Leave sign-in" }?.traits.contains(.notEnabled) ?? true,
            "\(after)")
        XCTAssertTrue(
            after.contains {
                $0.label
                    == "Couldn’t save your age confirmation. Check your connection and try again."
            }, "\(after)")
    }

    // MARK: A02-code

    /// While the code is checked (handoff 7's frame 4): Verify code keeps its label and says "In
    /// progress", dimmed; Change email address is dimmed (`authForm.codeBack`: "only while
    /// idle"); the field is read-only, not disabled, and keeps its digits.
    func testWhileTheCodeIsCheckedVerifyCodeIsBusyAndChangeEmailWaits() {
        let model = onCode(verifies: [.hang])
        model.code = "529614"
        drive({ await model.verify() }, until: { model.isVerifying })
        let elements = AccessibilityElements.of(CodeScreen(model: model, focus: true))

        let verify = elements.first { $0.label == "Verify code" }
        XCTAssertEqual(verify?.value, "In progress", "\(elements)")
        XCTAssertTrue(verify?.traits.contains(.notEnabled) ?? false, "\(elements)")
        let change = elements.first { $0.label == "Change email address" }
        XCTAssertTrue(change?.traits.contains(.button) ?? false, "\(elements)")
        XCTAssertTrue(change?.traits.contains(.notEnabled) ?? false, "\(elements)")
        let field = elements.first { $0.label == "Six-digit code" }
        XCTAssertEqual(field?.value, "529614", "\(elements)")
        XCTAssertFalse(field?.traits.contains(.notEnabled) ?? true, "\(elements)")
        let said = elements.flatMap { [$0.label, $0.value, $0.hint] }
            .filter { $0.contains("In progress") }
        XCTAssertEqual(said, ["In progress"], "\(elements)")
    }

    /// While a new code is on its way (handoff 7's frame 7; `authForm.resendConcurrency`): the
    /// row reads "Sending a new code…" once, as words, not a button, its indicator unread;
    /// Verify code is dimmed though six digits are typed, and isn't busy, since the request
    /// isn't its own; Change email address is dimmed; the field keeps its digits, read-only.
    func testWhileANewCodeIsOnItsWayTheRowSaysSoAndTheRestWaits() {
        let model = onCode(sends: [.answer, .hang])
        model.code = "529614"
        letTheMinutePass(model)
        drive({ await model.resend() }, until: { model.isResending })
        let elements = AccessibilityElements.of(CodeScreen(model: model, focus: true))

        let row = elements.filter { $0.label == "Sending a new code…" }
        XCTAssertEqual(row.count, 1, "\(elements)")
        XCTAssertFalse(row.first?.traits.contains(.button) ?? true, "\(elements)")
        XCTAssertFalse(elements.contains { $0.label == "Send a new code" }, "\(elements)")
        let verify = elements.first { $0.label == "Verify code" }
        XCTAssertTrue(verify?.traits.contains(.notEnabled) ?? false, "\(elements)")
        XCTAssertEqual(verify?.value, "", "\(elements)")
        let change = elements.first { $0.label == "Change email address" }
        XCTAssertTrue(change?.traits.contains(.notEnabled) ?? false, "\(elements)")
        let field = elements.first { $0.label == "Six-digit code" }
        XCTAssertEqual(field?.value, "529614", "\(elements)")
        XCTAssertFalse(field?.traits.contains(.notEnabled) ?? true, "\(elements)")
        // The indicator says nothing: no "In progress" anywhere, since nothing is busy but the
        // row, whose words say so.
        let said = elements.flatMap { [$0.label, $0.value, $0.hint] }
            .filter { $0.contains("In progress") }
        XCTAssertEqual(said, [], "\(elements)")
    }

    /// Send a new code waits while the code is checked, even once its minute has passed
    /// (handoff 7's IMPLEMENTATION.md: "Send a new code is also inactive if its minute has
    /// elapsed"; `busyPrimary.leaveChangeResend`): it shows, dimmed, as a button.
    func testSendANewCodeWaitsWhileTheCodeIsChecked() {
        let model = onCode(verifies: [.hang])
        letTheMinutePass(model)
        model.code = "529614"
        drive({ await model.verify() }, until: { model.isVerifying })
        let elements = AccessibilityElements.of(CodeScreen(model: model, focus: true))

        let resend = elements.filter { $0.label == "Send a new code" }
        XCTAssertEqual(resend.count, 1, "\(elements)")
        XCTAssertTrue(resend.first?.traits.contains(.button) ?? false, "\(elements)")
        XCTAssertTrue(resend.first?.traits.contains(.notEnabled) ?? false, "\(elements)")
    }

    /// The row while a new code is on its way (frame 7): the system's indicator, 16 points at
    /// every text size (VM-04), at the leading edge, 8 before the words and level with their
    /// first line: with the words at the default size, and above the middle of the words where
    /// they wrap at the largest (no frame draws that size; a mark beside wrapped words keeps to
    /// their first line, as `InlineError`'s icon does).
    func testTheNewCodesIndicatorIs16PointsAndLeadsItsWords() {
        for size: DynamicTypeSize in [.large, .accessibility5] {
            let model = onCode(sends: [.answer, .hang])
            letTheMinutePass(model)
            drive({ await model.resend() }, until: { model.isResending })
            let layout = AccessibilityElements.layout(
                of: CodeScreen(model: model, focus: true).environment(\.dynamicTypeSize, size))
            XCTAssertEqual(layout.indicators.count, 1, "\(size)")
            let spinner = layout.indicators.first ?? .zero
            let words = layout.elements.first { $0.label == "Sending a new code…" }?.frame ?? .zero
            XCTAssertEqual(spinner.width, Size.busyIndicator, accuracy: 0.5, "\(size): \(spinner)")
            XCTAssertEqual(spinner.height, Size.busyIndicator, accuracy: 0.5, "\(size): \(spinner)")
            XCTAssertEqual(spinner.minX, Spacing.inset, accuracy: 0.5, "\(size): \(spinner)")
            XCTAssertEqual(
                words.minX - spinner.maxX, Spacing.s, accuracy: 0.5, "\(size): \(words)")
            if size == .large {
                XCTAssertEqual(spinner.midY, words.midY, accuracy: 1, "\(size): \(words)")
            } else {
                // One line of the words, as `TypeRole` sets `textAction` at this size: the
                // system font at 16 points, scaled with body.
                let traits = UITraitCollection(
                    preferredContentSizeCategory: .accessibilityExtraExtraExtraLarge)
                let oneLine = UIFont.systemFont(
                    ofSize: UIFontMetrics(forTextStyle: .body).scaledValue(
                        for: TypeRole.textAction.size, compatibleWith: traits)
                ).lineHeight
                XCTAssertGreaterThan(
                    words.height, 1.5 * oneLine, "wraps: \(words), one line \(oneLine)")
                XCTAssertGreaterThanOrEqual(spinner.minY, words.minY, "\(spinner) in \(words)")
                XCTAssertLessThan(
                    spinner.midY, words.midY - Size.busyIndicator, "\(spinner) in \(words)")
            }
        }
    }

    /// A code not verified, then a new code that didn't go (handoff 7's `authForm.resendFailure`;
    /// built from spec): the code's line stays under the field and stays the field's hint; the
    /// new code's line is its own element, under Send a new code and above Change email address,
    /// read in that order (`codeAccessibilityOrder`: resend, resendFailure, changeEmail), 8 from
    /// each (`resendToFailure`; frame 8); and Send a new code is offered again.
    func testANewCodesFailureIsItsOwnLineUnderTheRow() {
        let model = onCode(sends: [.answer, .fail(.network)], verifies: [.fail(.codeNotVerified)])
        model.code = "529614"
        drive({ await model.verify() }, until: { model.failure == .codeNotVerified })
        letTheMinutePass(model)
        drive({ await model.resend() }, until: { model.resendFailure == .network })
        let elements = AccessibilityElements.of(CodeScreen(model: model, focus: true))
        let labels = elements.map(\.label)

        let codeLine = "This code couldn’t be verified. Try again or send a new one."
        let resendLine = "Couldn’t send a new code. Check your connection and try again."
        XCTAssertEqual(
            elements.first { $0.label == "Six-digit code" }?.hint, codeLine, "\(elements)")
        let code = labels.firstIndex(of: codeLine)
        let verify = labels.firstIndex(of: "Verify code")
        let resend = labels.firstIndex(of: "Send a new code")
        let failure = labels.firstIndex(of: resendLine)
        let change = labels.firstIndex(of: "Change email address")
        XCTAssertLessThan(code ?? .max, verify ?? .min, "\(elements)")
        XCTAssertLessThan(resend ?? .max, failure ?? .min, "\(elements)")
        XCTAssertLessThan(failure ?? .max, change ?? .min, "\(elements)")
        XCTAssertFalse(
            elements.first { $0.label == "Send a new code" }?.traits.contains(.notEnabled)
                ?? true, "\(elements)")

        let row = elements.first { $0.label == "Send a new code" }?.frame ?? .zero
        let line = elements.first { $0.label == resendLine }?.frame ?? .zero
        let below = elements.first { $0.label == "Change email address" }?.frame ?? .zero
        XCTAssertEqual(row.height, Size.touchTarget, accuracy: 0.5, "\(row)")
        XCTAssertEqual(line.minY - row.maxY, Spacing.s, accuracy: 2, "\(line) under \(row)")
        XCTAssertEqual(below.minY - line.maxY, Spacing.s, accuracy: 2, "\(below) under \(line)")
    }

    /// With no new code's failure, Change email address is right under the 44-point row, which is
    /// 8 under Verify code (frames 6 and 24), whatever the row holds: the wait sentence, Send a
    /// new code, or the words while one is on its way. Each is read before the test's clock lets
    /// a minute pass for the next, since the clock is the test's own and a passed minute would
    /// turn the wait sentence into Send a new code.
    func testChangeEmailIsRightUnderTheRow() {
        checkChangeEmail(under: onCode(), showing: "You can send a new code after one minute.")
        let offered = onCode()
        letTheMinutePass(offered)
        checkChangeEmail(under: offered, showing: "Send a new code")
        let sending = onCode(sends: [.answer, .hang])
        letTheMinutePass(sending)
        drive({ await sending.resend() }, until: { sending.isResending })
        checkChangeEmail(under: sending, showing: "Sending a new code…")
    }

    /// With the keyboard up, here a 300-point stand-in since a hosted test has none, Verify code
    /// stays in the column at the default size, 16 under the error region's line as frames 24 and
    /// 25 draw it; at the largest size, where the column would leave it under the keyboard, it is
    /// pinned 12 above it, 20 in from each edge, the column closes up under the line and the
    /// field is scrolled clear of the footer (frame 19; `authForm.keyboardFooter`); with no keyboard, or while VoiceOver runs (FQ97's
    /// default), it stays in the column whatever the size. It is drawn once each time. In the
    /// column it is read in its place, after the code's line and before the wait sentence and
    /// Change email address (`codeAccessibilityOrder`: field, error, verify, resend,
    /// changeEmail); pinned, it would be read after the whole column, which is why VoiceOver keeps
    /// it there (the first `ios` run of `ios/b0-adopt-pin`, 43178940741, read it last, past a
    /// sort priority that doesn't reach out of the scroll view).
    func testWithTheKeyboardUpVerifyCodeIsPinnedOnlyWhereItWouldBeHidden() {
        let stand: CGFloat = 300
        let cases: [(size: DynamicTypeSize, keyboard: Bool, voiceOver: Bool, pinned: Bool)] = [
            (.large, true, false, false), (.accessibility5, true, false, true),
            (.accessibility5, true, true, false), (.accessibility5, false, false, false),
        ]
        for (size, keyboard, voiceOver, pinned) in cases {
            let model = onCode(verifies: [.fail(.codeNotVerified)])
            model.code = "529614"
            drive({ await model.verify() }, until: { model.failure == .codeNotVerified })
            let layout = AccessibilityElements.layout(
                of: CodeScreen(model: model, focus: true, keyboard: keyboard, voiceOver: voiceOver)
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        Color.clear.frame(height: stand)
                    }
                    .environment(\.dynamicTypeSize, size))
            let elements = layout.elements
            let labels = elements.map(\.label)
            let named = "\(size), keyboard \(keyboard), VoiceOver \(voiceOver): \(elements)"

            let codeLine = "This code couldn’t be verified. Try again or send a new one."
            let wait = "You can send a new code after one minute."
            XCTAssertEqual(labels.filter { $0 == "Verify code" }.count, 1, named)
            let line = elements.first { $0.label == codeLine }?.frame ?? .zero
            let verify = elements.first { $0.label == "Verify code" }?.frame ?? .zero
            let row = elements.first { $0.label == wait }?.frame ?? .zero
            if pinned {
                let keyboardTop = layout.size.height - layout.safeArea.bottom - stand
                XCTAssertEqual(verify.maxY, keyboardTop - Spacing.m, accuracy: 0.5, named)
                XCTAssertEqual(verify.minX, Spacing.inset, accuracy: 0.5, named)
                XCTAssertEqual(
                    verify.width, layout.size.width - 2 * Spacing.inset, accuracy: 0.5, named)
                XCTAssertEqual(row.minY - line.maxY, Spacing.l + Spacing.s, accuracy: 1, named)
                // The field scrolled clear of the footer, which starts 8 above the button.
                let field = elements.first { $0.label == "Six-digit code" }?.frame ?? .zero
                XCTAssertGreaterThan(field.height, 0, named)
                XCTAssertLessThanOrEqual(field.maxY, verify.minY - Spacing.s + 0.5, named)
                // Pinned, the tree reads it after the whole column, which is why it stays in the
                // column while VoiceOver runs (FQ97).
                XCTAssertEqual(labels.last, "Verify code", named)
            } else {
                XCTAssertEqual(verify.minY - line.maxY, Spacing.l, accuracy: 1, named)
                let order = [
                    "Six-digit code", codeLine, "Verify code", wait, "Change email address",
                ]
                .map { labels.firstIndex(of: $0) }
                XCTAssertFalse(order.contains(nil), named)
                XCTAssertEqual(order.compactMap { $0 }, order.compactMap { $0 }.sorted(), named)
            }
        }
    }

    /// Where the column, scrolled to its top, would leave Verify code 11 points above the keyboard
    /// it is pinned 12 above it, and where it would leave 13 it stays (`KeyboardFooter`'s
    /// threshold), read as the app shows it, pushed onto a navigation stack (`SignInFlow`), so
    /// the column's foot and the screen's room above the keyboard are measured from the same
    /// top, below the bar. As the stack's root, the screen was first laid out under a taller bar
    /// and pinned Verify code for a moment, which scrolled the column to the field (`ios` run
    /// 43197232393). The keyboard is a stand-in whose height is set from where Verify code ends
    /// with none, on the screen inside the stack, where it reaches it: one outside the stack
    /// doesn't (`ios` run 43192475721), and a geometry reader behind a scroll view, placed the
    /// same way, checks that it ends where the stand-in begins, so neither case passes with a
    /// stand-in that changes nothing.
    func testVerifyCodeIsPinnedOnlyWhereTheColumnLeavesItNearerThan12() {
        func read(stand: CGFloat, keyboard: Bool) -> AccessibilityElements.Layout {
            let model = onCode()
            return AccessibilityElements.layout(
                of: pushed {
                    CodeScreen(model: model, focus: true, keyboard: keyboard, voiceOver: false)
                        .safeAreaInset(edge: .bottom, spacing: 0) {
                            Color.clear.frame(height: stand)
                        }
                })
        }
        let free = read(stand: 0, keyboard: false)
        let foot = free.elements.first { $0.label == "Verify code" }?.frame.maxY ?? 0
        XCTAssertGreaterThan(foot, 0, "\(free.elements)")
        for (clear, pinned) in [(CGFloat(11), true), (CGFloat(13), false)] {
            let stand = free.size.height - free.safeArea.bottom - foot - clear
            let layout = read(stand: stand, keyboard: true)
            let verify = layout.elements.first { $0.label == "Verify code" }?.frame ?? .zero
            let keyboardTop = layout.size.height - layout.safeArea.bottom - stand
            let probe = reader(stand: stand)
            XCTAssertEqual(
                probe?.frame.maxY ?? 0, keyboardTop, accuracy: 0.5,
                "\(clear) clear: \(probe?.description ?? "no reader")")
            XCTAssertEqual(
                keyboardTop - verify.maxY, pinned ? Spacing.m : clear, accuracy: 0.5,
                "\(clear) clear: \(layout.elements); \(probe?.description ?? "no reader")")
            XCTAssertEqual(
                layout.elements.filter { $0.label == "Verify code" }.count, 1,
                "\(clear) clear: \(layout.elements)")
        }
    }

    /// A geometry reader behind a scroll view pushed onto a navigation stack, as
    /// `readingKeyboardRoom` reads one, with a stand-in keyboard `stand` high placed as the
    /// threshold test places it: its frame, and its safe area in its label.
    private func reader(stand: CGFloat) -> AccessibilityElements.Element? {
        AccessibilityElements.layout(
            of: pushed {
                ScrollView { Color.clear.frame(height: 1) }
                    .background {
                        GeometryReader { reader in
                            Color.clear.accessibilityElement()
                                .accessibilityLabel(
                                    Text(verbatim: "reader safe area \(reader.safeAreaInsets)"))
                        }
                    }
                    .navigationTitle(Text(verbatim: "Probe"))
                    .navigationBarTitleDisplayMode(.inline)
                    .safeAreaInset(edge: .bottom, spacing: 0) { Color.clear.frame(height: stand) }
            }
        ).elements.first { $0.label.hasPrefix("reader") }
    }

    /// `screen` pushed onto a navigation stack from its first frame, as `SignInFlow` shows
    /// A02-code over A02-email.
    private func pushed<Screen: View>(_ screen: @escaping () -> Screen) -> some View {
        NavigationStack(path: .constant([1])) {
            Color.clear.navigationDestination(for: Int.self) { _ in screen() }
        }
    }

    /// `row` is shown once, and Change email address starts 8 + 44 under Verify code.
    private func checkChangeEmail(
        under model: SignInModel, showing row: String, line: UInt = #line
    ) {
        let elements = AccessibilityElements.of(CodeScreen(model: model, focus: true))
        XCTAssertEqual(
            elements.filter { $0.label == row }.count, 1, "\(row): \(elements)", line: line)
        let verify = elements.first { $0.label == "Verify code" }?.frame ?? .zero
        let change = elements.first { $0.label == "Change email address" }?.frame ?? .zero
        XCTAssertEqual(
            change.minY - verify.maxY, Spacing.s + Size.touchTarget, accuracy: 0.5,
            "\(row): \(elements)", line: line)
    }

    // MARK: A03

    private func profile(updates: [Outcome<APIFailure>] = []) -> ProfileModel {
        ProfileModel(
            account: Account(
                id: "ben", displayName: nil, avatarVersion: nil, ageConfirmed: true, version: 1),
            accounts: ScriptedAccounts(updates: updates), saved: { _ in }, signedOut: {})
    }

    /// The bar's two elements, which the hosted tree hands over after the column and the
    /// footer (`ios` run 43178940741 read A02-code's title last), though VoiceOver starts from
    /// the bar: they are matched apart from the rest.
    private let bar: Set = ["Leave sign-in", "Your profile"]

    /// A03 is read, in document order, as its title, the helper line, Add photo, Optional, the
    /// name's field, the name's one line if it shows, and Continue, with nothing else: the
    /// avatar, its initial and its person symbol aren't read (`Avatar`; handoff 7's
    /// `avatarWithoutInitial`; WM-04), nor the placeholder, so the empty field says "Your name"
    /// once (W-08, W-14); and the bar holds Leave sign-in, one button above the title, and the
    /// screen's name (IMPLEMENTATION.md's order; `ageExit`: "Same on A03."; the plan's TV-06).
    /// The line is a save's failure, or the too-long line in its place, under the field, never
    /// its hint, since neither marks it (X-19); Continue waits for a name of 1 to 40 characters.
    func testA03IsReadInOrderWithTheNamesOneLineUnderTheField() {
        let network = "Couldn’t save your profile. Check your connection and try again."
        let tooLong = "Use 40 characters or fewer for your name."
        // Book p27's two long names together: 45 characters, over FQ70's 40.
        let long = "Alexandria-Rose Mensah Deborah-Anne Ouédraogo"
        let ben = profile()
        ben.name = "Ben"
        let failed = profile(updates: [.fail(.network)])
        failed.name = "Ben"
        drive({ await failed.saveName() }, until: { failed.failure == .network })
        let longer = profile()
        longer.name = long
        let cases: [(model: ProfileModel, name: String, line: String?, continues: Bool)] = [
            (profile(), "", nil, false), (ben, "Ben", nil, true), (failed, "Ben", network, true),
            (longer, long, tooLong, false),
        ]
        for (model, name, line, continues) in cases {
            let elements = AccessibilityElements.of(
                ProfileScreen(model: model, leave: {}, focus: true))
            let read = elements.filter { !bar.contains($0.label) }.map {
                Read(
                    $0.label, value: $0.value, hint: $0.hint,
                    isButton: $0.traits.contains(.button), actions: $0.actions)
            }
            let expected =
                [
                    Read("What should we call you?"), Read("A name your friends know."),
                    Read("Add photo", isButton: true), Read("Optional"),
                    Read("Your name", value: name),
                ] + (line.map { [Read($0)] } ?? []) + [Read("Continue", isButton: true)]
            XCTAssertEqual(read, expected, "\(name): \(elements)")
            XCTAssertEqual(
                elements.filter { bar.contains($0.label) }.map(\.label).sorted(),
                bar.sorted(), "\(name): \(elements)")
            let leave = elements.first { $0.label == "Leave sign-in" }
            XCTAssertTrue(leave?.traits.contains(.button) ?? false, "\(name): \(elements)")
            XCTAssertFalse(leave?.traits.contains(.notEnabled) ?? true, "\(name): \(elements)")
            let title = elements.first { $0.label == "What should we call you?" }
            XCTAssertTrue(title?.isHeader ?? false, "\(name): \(elements)")
            XCTAssertLessThanOrEqual(
                leave?.frame.maxY ?? .infinity, title?.frame.minY ?? -.infinity,
                "\(name): \(elements)")
            XCTAssertEqual(
                elements.first { $0.label == "Continue" }?.traits.contains(.notEnabled),
                !continues, "\(name): \(elements)")
        }
    }

    /// While the name is saved (`busyPrimary`; X-19): Continue keeps its label and says "In
    /// progress", dimmed; Add photo and Leave sign-in are dimmed; the name is read-only, not
    /// disabled, so it isn't dimmed and keeps its value; and nothing else says "In progress".
    /// A failure makes Add photo, Leave sign-in and Continue available again.
    func testWhileTheNameIsSavedContinueIsBusyAndTheRestWaits() {
        let model = profile(updates: [.hang])
        model.name = "Ben"
        drive({ await model.saveName() }, until: { model.isSaving })
        let elements = AccessibilityElements.of(
            ProfileScreen(model: model, leave: {}, focus: true))
        let next = elements.first { $0.label == "Continue" }
        XCTAssertEqual(next?.value, "In progress", "\(elements)")
        XCTAssertTrue(next?.traits.contains(.button) ?? false, "\(elements)")
        XCTAssertTrue(next?.traits.contains(.notEnabled) ?? false, "\(elements)")
        for label in ["Add photo", "Leave sign-in"] {
            let inactive = elements.filter { $0.label == label }
            XCTAssertEqual(inactive.count, 1, "\(label): \(elements)")
            XCTAssertTrue(
                inactive.first?.traits.contains(.notEnabled) ?? false, "\(label): \(elements)")
        }
        let field = elements.first { $0.label == "Your name" }
        XCTAssertEqual(field?.value, "Ben", "\(elements)")
        XCTAssertFalse(field?.traits.contains(.notEnabled) ?? true, "\(elements)")
        let said = elements.flatMap { [$0.label, $0.value, $0.hint] }
            .filter { $0.contains("In progress") }
        XCTAssertEqual(said, ["In progress"], "\(elements)")

        let failed = profile(updates: [.fail(.refused)])
        failed.name = "Ben"
        drive({ await failed.saveName() }, until: { failed.failure == .other })
        let after = AccessibilityElements.of(
            ProfileScreen(model: failed, leave: {}, focus: true))
        for label in ["Add photo", "Leave sign-in", "Continue"] {
            XCTAssertFalse(
                after.first { $0.label == label }?.traits.contains(.notEnabled) ?? true,
                "\(label): \(after)")
        }
        XCTAssertTrue(
            after.contains { $0.label == "Couldn’t save your profile. Try again." }, "\(after)")
    }

    /// Continue is pinned 12 above the keyboard, here a 300-point stand-in since a hosted test
    /// has none, and 44 above the safe area's bottom with none (`authForm.keyboardFooter`;
    /// `formFooterToSafeAreaBottom`), 20 in from each edge, at the default and the largest text.
    /// With the keyboard up the column is scrolled so the field ends 16 above Continue, where at
    /// both sizes it would otherwise be under it ("controls are never overlaid on form text";
    /// `ios` run 43336877808). The stand-in is inside the navigation stack, where the screen
    /// meets it (`ProfileForm`).
    func testContinueSits12AboveTheKeyboardOr44AboveTheSafeArea() {
        let stand: CGFloat = 300
        for size in [DynamicTypeSize.large, .accessibility5] {
            for keyboard in [true, false] {
                let model = profile()
                model.name = "Ben"
                let layout = AccessibilityElements.layout(
                    of: NavigationStack {
                        ProfileForm(model: model, leave: {}, focus: false, keyboard: keyboard)
                            .safeAreaInset(edge: .bottom, spacing: 0) {
                                Color.clear.frame(height: keyboard ? stand : 0)
                            }
                    }
                    .environment(\.dynamicTypeSize, size))
                let named = "\(size), keyboard \(keyboard): \(layout.elements)"
                let next = layout.elements.first { $0.label == "Continue" }?.frame ?? .zero
                let field = layout.elements.first { $0.label == "Your name" }?.frame ?? .zero
                if keyboard {
                    XCTAssertGreaterThan(field.height, 0, named)
                    XCTAssertEqual(next.minY - field.maxY, Spacing.l, accuracy: 1, named)
                }
                let foot = layout.size.height - layout.safeArea.bottom - (keyboard ? stand : 0)
                XCTAssertEqual(
                    foot - next.maxY,
                    keyboard ? Spacing.m : SetupGap.formFooterToSafeAreaBottom, accuracy: 0.5,
                    named)
                XCTAssertEqual(next.minX, Spacing.inset, accuracy: 0.5, named)
                XCTAssertEqual(
                    next.width, layout.size.width - 2 * Spacing.inset, accuracy: 0.5, named)
            }
        }
    }

    /// A save that fails with the keyboard up (the stand-in again): the line shows 12 under the
    /// field, and the column is scrolled so the line's frame ends 24 above Continue, its line box,
    /// which reaches past the last line's frame, at least 16 (`errorToActionMinimum`, measured
    /// between line boxes, as on A02-age), with the field above it, below the bar (frame 11;
    /// IMPLEMENTATION.md: "The body scrolls to keep the field and error reachable above
    /// Continue"). At this size, with the column at its top, the field would be under
    /// Continue. The save starts a moment after the screen shows, so the line comes as it does
    /// in the app, after the column is laid out.
    func testAFailureWithTheKeyboardUpIsScrolledIntoViewAboveContinue() {
        let model = profile(updates: [.fail(.network)])
        model.name = "Ben"
        let layout = AccessibilityElements.layout(
            of: NavigationStack {
                ProfileForm(model: model, leave: {}, focus: false, keyboard: true)
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        Color.clear.frame(height: 300)
                    }
                    .task {
                        try? await Task.sleep(for: .milliseconds(100))
                        await model.saveName()
                    }
            })
        let elements = layout.elements
        let network = "Couldn’t save your profile. Check your connection and try again."
        XCTAssertEqual(model.failure, .network, "\(elements)")
        let line = elements.first { $0.label == network }?.frame ?? .zero
        let field = elements.first { $0.label == "Your name" }?.frame ?? .zero
        let next = elements.first { $0.label == "Continue" }?.frame ?? .zero
        let title = elements.first { $0.label == "Your profile" }?.frame ?? .zero
        XCTAssertGreaterThan(line.height, 0, "\(elements)")
        XCTAssertGreaterThan(title.height, 0, "\(elements)")
        XCTAssertEqual(line.minY - field.maxY, Spacing.m, accuracy: 1, "\(elements)")
        XCTAssertEqual(next.minY - line.maxY, Spacing.xxl, accuracy: 1, "\(elements)")
        XCTAssertGreaterThanOrEqual(field.minY, title.maxY, "\(elements)")
    }

    /// The avatar is decorative (`Avatar`): with no initial, its person symbol isn't read
    /// either, neither as the symbol's name nor as "No profile photo", which no contract gives an
    /// element yet (handoff 7's `avatarWithoutInitial`; the check's WM-04). So a name that gives no
    /// initial, nothing typed or an emoji, leaves A03 with the same elements in the same order as
    /// "Ben" does, whose "B" isn't read (the plan's TV-06, read here so that iOS 17.5 and 18.6
    /// read it too; `SignInSnapshotTests.testTheAvatarIsntRead` holds the same cases). The field's
    /// value, the name, is left out, as it differs.
    func testTheAvatarsPersonSymbolIsntRead() {
        func labels(_ name: String) -> [String] {
            let model = profile()
            model.name = name
            return AccessibilityElements.of(ProfileScreen(model: model, leave: {}, focus: true))
                .map(\.label)
        }
        let ben = labels("Ben")
        XCTAssertTrue(ben.contains("Your name"), "\(ben)")
        XCTAssertFalse(ben.contains("B"), "\(ben)")
        for name in ["", "\u{1F600}"] {
            let read = labels(name)
            XCTAssertEqual(read, ben, "\(name.unicodeScalars.map(\.value))")
            XCTAssertFalse(
                read.contains { $0.lowercased().contains("person") || $0 == "No profile photo" },
                "\(read)")
        }
    }
}
