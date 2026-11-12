import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// A02 and A03 in every state (design/reference/INVENTORY.md): the five with a render from
/// handoffs 1 and 2, and the rest built from spec until handoff 7 draws them. Each is driven
/// through its model with scripted services, as the app drives it; a request still on its way
/// is one that never answers. The fixture is Ben, unphotographed, at ben@example.com (FQ36).
@MainActor
final class SignInSnapshotTests: XCTestCase {
    private let clock = StillClock()

    // MARK: A02-email

    func testA02Email() {
        let model = signIn(ScriptedAuth())
        model.email = "ben@example.com"
        snap(model, named: "A02-email")
    }

    func testA02EmailEmpty() {
        snap(signIn(ScriptedAuth()), named: "A02-email-empty")
    }

    func testA02EmailSending() {
        let model = signIn(ScriptedAuth(sends: [.hang]))
        model.email = "ben@example.com"
        drive({ await model.sendCode() }, until: { model.isSending })
        snap(model, named: "A02-email-sending")
    }

    func testA02EmailFailedNetwork() {
        let model = signIn(ScriptedAuth(sends: [.fail(.network)]))
        model.email = "ben@example.com"
        drive({ await model.sendCode() }, until: { model.failure == .sendNetwork })
        snap(model, named: "A02-email-failed-network")
    }

    func testA02EmailRefused() {
        let model = signIn(ScriptedAuth(sends: [.fail(.refused)]))
        model.email = "ben@example.com"
        drive({ await model.sendCode() }, until: { model.failure == .sendRefused })
        snap(model, named: "A02-email-refused")
    }

    /// After a sign-in the server ended, at launch, with no address left in memory (built from
    /// spec: handoff 7's `auth.email.signedOut`, with no frame).
    func testA02EmailSignedOut() {
        snap(signIn(ScriptedAuth(), ended: true), named: "A02-email-signed-out")
    }

    // MARK: A02-code

    func testA02Code() {
        snap(onCode(), named: "A02-code")
    }

    /// Handoff 7's frame 24: six digits typed, Verify code available.
    func testA02CodeTyped() {
        let model = onCode()
        model.code = "529614"
        XCTAssertTrue(model.canVerify)
        snap(model, named: "A02-code-typed")
    }

    func testA02CodeVerifying() {
        let model = onCode(verifies: [.hang])
        model.code = "529614"
        drive({ await model.verify() }, until: { model.isVerifying })
        snap(model, named: "A02-code-verifying")
    }

    func testA02CodeVerifyFailedNetwork() {
        let model = refused(.network, until: .verifyNetwork)
        snap(model, named: "A02-code-verify-failed-network")
    }

    func testA02CodeVerifyUnavailable() {
        let model = refused(.unavailable, until: .verifyUnavailable)
        snap(model, named: "A02-code-verify-unavailable")
    }

    func testA02CodeError() {
        let model = refused(.codeNotVerified, until: .codeNotVerified)
        letTheMinutePass(model)
        snap(model, named: "A02-code-error")
        // At the largest text on a 320-point screen, the width of a 375-point iPhone with Display
        // Zoom on (docs/TECH-DESIGN.md section 2: the representative `-xl` states at 320 points).
        ScreenSnapshot.assert(
            SignInFlow(model: model, focus: true), named: "A02-code-error-320", variants: [.xl],
            width: 320)
    }

    /// A code not verified, then a new code that didn't go: each line in its own block, the
    /// code's under the field and the new code's under the row (handoff 7's
    /// `authForm.resendFailure`: "Keep an existing wrong-code message in its original block
    /// too"; built from spec, as no frame draws the two together).
    func testA02CodeErrorResendFailedNetwork() {
        let model = refused(
            .codeNotVerified, until: .codeNotVerified, sends: [.answer, .fail(.network)])
        letTheMinutePass(model)
        drive({ await model.resend() }, until: { model.resendFailure == .network })
        XCTAssertEqual(model.failure, .codeNotVerified)
        snap(model, named: "A02-code-error-resend-failed-network")
    }

    func testA02CodeErrorWaiting() {
        let model = refused(.codeNotVerified, until: .codeNotVerified)
        snap(model, named: "A02-code-error-waiting")
    }

    func testA02CodeResend() {
        let model = onCode()
        letTheMinutePass(model)
        snap(model, named: "A02-code-resend")
    }

    func testA02CodeResending() {
        let model = onCode(sends: [.answer, .hang])
        letTheMinutePass(model)
        drive({ await model.resend() }, until: { model.isResending })
        snap(model, named: "A02-code-resending")
    }

    func testA02CodeResendFailedNetwork() {
        let model = onCode(sends: [.answer, .fail(.network)])
        letTheMinutePass(model)
        drive({ await model.resend() }, until: { model.resendFailure == .network })
        snap(model, named: "A02-code-resend-failed-network")
    }

    func testA02CodeResendRefused() {
        let model = onCode(sends: [.answer, .fail(.refused)])
        letTheMinutePass(model)
        drive({ await model.resend() }, until: { model.resendFailure == .refused })
        snap(model, named: "A02-code-resend-refused")
    }

    // MARK: A02-age

    func testA02Age() {
        snapAge(profile(ageConfirmed: false), named: "A02-age")
    }

    func testA02AgeSaving() {
        let model = profile(ageConfirmed: false, updates: [.hang])
        drive({ await model.confirmAge() }, until: { model.isSaving })
        snapAge(model, named: "A02-age-saving")
    }

    func testA02AgeFailedNetwork() {
        let model = profile(ageConfirmed: false, updates: [.fail(.network)])
        drive({ await model.confirmAge() }, until: { model.failure == .network })
        snapAge(model, named: "A02-age-failed-network")
    }

    func testA02AgeRefused() {
        let model = profile(ageConfirmed: false, updates: [.fail(.refused)])
        drive({ await model.confirmAge() }, until: { model.failure == .other })
        snapAge(model, named: "A02-age-refused")
    }

    // MARK: A03-profile

    func testA03Profile() {
        let model = profile(ageConfirmed: true)
        model.name = "Ben"
        snapProfile(model, named: "A03-profile")
    }

    func testA03ProfileEmpty() {
        snapProfile(profile(ageConfirmed: true), named: "A03-profile-empty")
    }

    func testA03ProfileSaving() {
        let model = profile(ageConfirmed: true, updates: [.hang])
        model.name = "Ben"
        drive({ await model.saveName() }, until: { model.isSaving })
        snapProfile(model, named: "A03-profile-saving")
    }

    func testA03ProfileFailedNetwork() {
        let model = profile(ageConfirmed: true, updates: [.fail(.network)])
        model.name = "Ben"
        drive({ await model.saveName() }, until: { model.failure == .network })
        snapProfile(model, named: "A03-profile-failed-network")
    }

    func testA03ProfileRefused() {
        let model = profile(ageConfirmed: true, updates: [.fail(.refused)])
        model.name = "Ben"
        drive({ await model.saveName() }, until: { model.failure == .other })
        snapProfile(model, named: "A03-profile-refused")
    }

    func testA03ProfileNameTooLong() {
        // Book p27's two long names together: 45 characters, over FQ70's 40.
        let model = profile(ageConfirmed: true)
        model.name = "Alexandria-Rose Mensah Deborah-Anne Ouédraogo"
        XCTAssertTrue(model.nameIsTooLong)
        snapProfile(model, named: "A03-profile-name-too-long")
    }

    // MARK: What VoiceOver finds

    func testEachTitleIsAHeading() {
        heading("What’s your email?", in: SignInFlow(model: signIn(ScriptedAuth()), focus: true))
        heading("Enter your code", in: SignInFlow(model: onCode(), focus: true))
        heading(
            "Before you continue", in: AgeScreen(model: profile(ageConfirmed: false), leave: {}))
        heading(
            "What should we call you?",
            in: ProfileScreen(model: profile(ageConfirmed: true), focus: false))
    }

    func testTheAddressIsReadAsItIs() {
        // The zero-width spaces that let it wrap aren't read.
        let elements = AccessibilityElements.of(SignInFlow(model: onCode(), focus: true))
        XCTAssertTrue(elements.contains { $0.label == "Sent to ben@example.com" }, "\(elements)")
    }

    func testACodeNotVerifiedIsTheFieldsHint() {
        // Coming back to the field, VoiceOver says why it's marked (handoff 1).
        let refusedCode = refused(.codeNotVerified, until: .codeNotVerified)
        let elements = AccessibilityElements.of(SignInFlow(model: refusedCode, focus: true))
        let field = elements.first { $0.label == "Six-digit code" }
        XCTAssertEqual(field?.hint, SignInModel.Failure.codeNotVerified.words, "\(elements)")
        // A failure that doesn't mark the field isn't its hint.
        let network = refused(.network, until: .verifyNetwork)
        let others = AccessibilityElements.of(SignInFlow(model: network, focus: true))
        XCTAssertEqual(others.first { $0.label == "Six-digit code" }?.hint, "", "\(others)")
    }

    func testA02EmailShowsOnlyItsOwnFailures() {
        // A02-code's failure stays on A02-code, which is pushed over A02-email.
        let network = refused(.network, until: .verifyNetwork)
        let under = AccessibilityElements.of(EmailScreen(model: network, focus: true))
        XCTAssertFalse(
            under.contains { $0.label == SignInModel.Failure.verifyNetwork.words }, "\(under)")
        let sent = signIn(ScriptedAuth(sends: [.fail(.network)]))
        sent.email = "ben@example.com"
        drive({ await sent.sendCode() }, until: { sent.failure == .sendNetwork })
        let own = AccessibilityElements.of(EmailScreen(model: sent, focus: true))
        XCTAssertTrue(
            own.contains { $0.label == SignInModel.Failure.sendNetwork.words }, "\(own)")
    }

    func testTheAvatarIsntRead() {
        // Its initial repeats the name in the field below it.
        let model = profile(ageConfirmed: true)
        model.name = "Ben"
        let elements = AccessibilityElements.of(ProfileScreen(model: model, focus: false))
        XCTAssertTrue(elements.contains { $0.label == "Your name" }, "\(elements)")
        XCTAssertFalse(elements.contains { $0.label == "B" }, "\(elements)")
        // With no initial, nothing typed or an emoji, its person symbol isn't read either
        // (handoff 7's `avatarWithoutInitial`; the check's WM-04).
        for name in ["", "\u{1F600}"] {
            model.name = name
            let read = AccessibilityElements.of(ProfileScreen(model: model, focus: false))
            XCTAssertEqual(read.map(\.label), elements.map(\.label), "\(read)")
            XCTAssertFalse(
                read.contains { $0.label.lowercased().contains("person") }, "\(read)")
        }
    }

    // MARK: Helpers

    private func heading(
        _ title: String, in view: some View, file: StaticString = #filePath, line: UInt = #line
    ) {
        let elements = AccessibilityElements.of(view)
        XCTAssertTrue(
            elements.contains { $0.label == title && $0.isHeader }, "\(elements)", file: file,
            line: line)
    }

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

    /// A02-code after 529614 came back with `failure`; `sends` answers the first code and any new
    /// one.
    private func refused(
        _ failure: AuthFailure, until shown: SignInModel.Failure,
        sends: [Outcome<AuthFailure>] = [.answer]
    ) -> SignInModel {
        let model = onCode(sends: sends, verifies: [.fail(failure)])
        model.code = "529614"
        drive({ await model.verify() }, until: { model.failure == shown })
        return model
    }

    private func letTheMinutePass(_ model: SignInModel) {
        clock.letTheMinutePass()
        drive({ await model.waitForResend() }, until: { model.canResend })
    }

    private func profile(
        ageConfirmed: Bool, updates: [Outcome<APIFailure>] = []
    ) -> ProfileModel {
        ProfileModel(
            account: Account(
                id: "ben", displayName: nil, avatarVersion: nil, ageConfirmed: ageConfirmed,
                version: ageConfirmed ? 1 : 0),
            accounts: ScriptedAccounts(updates: updates), saved: { _ in }, signedOut: {})
    }

    private func snap(
        _ model: SignInModel, named state: String, testName: String = #function,
        line: UInt = #line
    ) {
        ScreenSnapshot.assert(
            SignInFlow(model: model, focus: true), named: state,
            busy: model.isSending || model.isVerifying || model.isResending, testName: testName,
            line: line)
    }

    private func snapAge(
        _ model: ProfileModel, named state: String, testName: String = #function,
        line: UInt = #line
    ) {
        ScreenSnapshot.assert(
            AgeScreen(model: model, leave: {}), named: state, busy: model.isSaving,
            testName: testName, line: line)
    }

    private func snapProfile(
        _ model: ProfileModel, named state: String, testName: String = #function,
        line: UInt = #line
    ) {
        ScreenSnapshot.assert(
            ProfileScreen(model: model, focus: false), named: state, busy: model.isSaving,
            testName: testName, line: line)
    }
}
