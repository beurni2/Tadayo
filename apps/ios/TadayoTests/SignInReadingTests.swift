import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// What VoiceOver finds on A02-email and A02-age, read in the hosted tests so it is read on iOS 17.5 and
/// 18.6 too (the snapshot tests, which hold the sign-in readings from before handoff 7, are
/// skipped there): the busy button's value and the field that is read-only, not disabled
/// (handoff 7's `busyPrimary`), and the empty field's one reading of its label. A hosted test
/// can't speak, so what the person hears is a device check in the TestFlight notes.
@MainActor
final class SignInReadingTests: XCTestCase {
    private let clock = StillClock()

    private func signIn(_ auth: ScriptedAuth, ended: Bool = false) -> SignInModel {
        let clock = clock
        return SignInModel(
            auth: auth, verified: { _ in }, signInEnded: ended, now: { clock.now },
            sleep: { try await clock.sleep(until: $0) })
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
}
