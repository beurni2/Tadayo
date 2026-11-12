import XCTest

@testable import Tadayo

/// What VoiceOver says as a sign-in request begins, along A02-code's resend row, and A02-email's
/// notice (`SignInAnnouncement`; handoff 7's `announcementPolicy.busy`: "Announce the action once,
/// keep focus; ... Do not repeat on renders."). A hosted test can't hear VoiceOver, so the
/// TestFlight notes ask for it on the iPhone too.
final class SignInAnnouncementTests: XCTestCase {
    func testSendingIsSaidOnceAsTheRequestBegins() {
        XCTAssertEqual(SignInAnnouncement.sending(from: false, to: true), "Sending a code.")
    }

    func testNothingIsSaidWhenTheRequestEndsGoesOnOrTheScreenRedraws() {
        XCTAssertNil(SignInAnnouncement.sending(from: true, to: false))
        XCTAssertNil(SignInAnnouncement.sending(from: true, to: true))
        XCTAssertNil(SignInAnnouncement.sending(from: false, to: false))
    }

    /// A02-age's confirmation (handoff 7's `vo.age.busy`), by the same rule.
    func testSavingTheAgeIsSaidOnceAsTheRequestBegins() {
        XCTAssertEqual(
            SignInAnnouncement.savingAge(from: false, to: true), "Saving your age confirmation.")
        XCTAssertNil(SignInAnnouncement.savingAge(from: true, to: false))
        XCTAssertNil(SignInAnnouncement.savingAge(from: true, to: true))
        XCTAssertNil(SignInAnnouncement.savingAge(from: false, to: false))
    }

    /// A02-code's Verify code (handoff 7's `vo.code.busy`), by the same rule.
    func testVerifyingIsSaidOnceAsTheRequestBegins() {
        XCTAssertEqual(SignInAnnouncement.verifying(from: false, to: true), "Verifying code.")
        XCTAssertNil(SignInAnnouncement.verifying(from: true, to: false))
        XCTAssertNil(SignInAnnouncement.verifying(from: true, to: true))
        XCTAssertNil(SignInAnnouncement.verifying(from: false, to: false))
    }

    /// Send a new code (handoff 7's `vo.resend.busy`: the row's own words), by the same rule.
    func testANewCodeOnItsWayIsSaidOnceAsTheRequestBegins() {
        XCTAssertEqual(
            SignInAnnouncement.resending(from: false, to: true), "Sending a new code…")
        XCTAssertNil(SignInAnnouncement.resending(from: true, to: false))
        XCTAssertNil(SignInAnnouncement.resending(from: true, to: true))
        XCTAssertNil(SignInAnnouncement.resending(from: false, to: false))
    }

    /// Once the minute has passed (handoff 7's `vo.resend.available`; IMPLEMENTATION.md:
    /// "Announce Send a new code is available. once"), and nothing while it runs or when the
    /// screen redraws.
    func testANewCodeBeingAvailableIsSaidOnceWhenTheMinuteHasPassed() {
        var availability = SignInAnnouncement.ResendAvailability()
        XCTAssertNil(availability.words(canResend: false, isVerifying: false))
        XCTAssertEqual(
            availability.words(canResend: true, isVerifying: false),
            "Send a new code is available.")
        XCTAssertNil(availability.words(canResend: true, isVerifying: false))
    }

    /// A minute that passes while the code is checked, when Send a new code is inactive
    /// (IMPLEMENTATION.md: "Send a new code is also inactive if its minute has elapsed"), says
    /// nothing then. If the code verifies, the screen has moved on before the check ends
    /// (`RootModel.signedIn`), so the words never come; if it doesn't, they are said as the check
    /// ends, once, and a second failed check says nothing more.
    func testAMinuteThatPassesWhileTheCodeIsCheckedIsSaidOnlyOnceTheCheckFails() {
        var availability = SignInAnnouncement.ResendAvailability()
        // The check begins within the minute, which then passes: Send a new code shows, inactive.
        XCTAssertNil(availability.words(canResend: false, isVerifying: true))
        XCTAssertNil(availability.words(canResend: true, isVerifying: true))
        // The check ends without a sign-in: Send a new code is active.
        XCTAssertEqual(
            availability.words(canResend: true, isVerifying: false),
            "Send a new code is available.")
        // Another code is checked, and isn't verified either.
        XCTAssertNil(availability.words(canResend: true, isVerifying: true))
        XCTAssertNil(availability.words(canResend: true, isVerifying: false))
    }

    /// Once said, a failed check or a failed new code says its failure and nothing more (handoff
    /// 7's `announcementPolicy.resend`: "restores resend action without a second availability
    /// announcement"); a new code that went begins a new minute, said once more as it passes.
    func testTheWordsComeOnceAMinute() {
        var availability = SignInAnnouncement.ResendAvailability()
        XCTAssertEqual(
            availability.words(canResend: true, isVerifying: false),
            "Send a new code is available.")
        XCTAssertNil(availability.words(canResend: true, isVerifying: true))
        XCTAssertNil(availability.words(canResend: true, isVerifying: false))
        availability.newMinute()
        XCTAssertNil(availability.words(canResend: false, isVerifying: false))
        XCTAssertEqual(
            availability.words(canResend: true, isVerifying: false),
            "Send a new code is available.")
    }

    /// A new code that went (handoff 7's `vo.resend.success`, which "includes waiting state"):
    /// said as its new minute begins, with the address it went to, and nothing as the minute
    /// ends. The address is said on the device only, never logged (T52).
    func testANewCodeThatWentSaysWhereAndThatTheMinuteBeganAgain() {
        XCTAssertEqual(
            SignInAnnouncement.newCode(
                to: "ben@example.com", due: ContinuousClock.now.advanced(by: .seconds(60))),
            "Check ben@example.com for a new code. You can send a new code after one minute.")
        XCTAssertNil(SignInAnnouncement.newCode(to: "ben@example.com", due: nil))
    }

    /// A02-email's notice is shown and said only after a sign-in the server ended (handoff 7's
    /// `auth.email.signedOut`), never after a Leave the person asked for.
    func testTheSignedOutNoticeIsOnlyForASignInTheServerEnded() {
        XCTAssertEqual(
            SignInAnnouncement.signedOutNotice(signInEnded: true),
            "Your sign-in ended. Enter your email to sign in again.")
        XCTAssertNil(SignInAnnouncement.signedOutNotice(signInEnded: false))
    }
}
