import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// What VoiceOver finds on A02-email, read in the hosted tests so it is read on iOS 17.5 and
/// 18.6 too (the snapshot tests, which hold the sign-in readings from before handoff 7, are
/// skipped there): the busy button's value and the field that is read-only, not disabled
/// (handoff 7's `busyPrimary`), and the empty field's one reading of its label. A hosted test
/// can't speak, so what the person hears is a device check in the TestFlight notes.
@MainActor
final class SignInReadingTests: XCTestCase {
    private let clock = StillClock()

    private func signIn(_ auth: ScriptedAuth) -> SignInModel {
        let clock = clock
        return SignInModel(
            auth: auth, verified: { _ in }, now: { clock.now },
            sleep: { try await clock.sleep(until: $0) })
    }

    /// The placeholder repeats the label's words (frame 1), so the field must not say them twice
    /// (W-08): "Email address" is read once across every element's label, value and hint. The
    /// screen draws the placeholder over a field with no prompt, since a prompt is what UIKit says
    /// as an empty field's value, and an empty accessibility value doesn't replace it (`ios` run
    /// 43091597765).
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
}
