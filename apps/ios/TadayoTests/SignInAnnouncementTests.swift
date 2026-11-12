import XCTest

@testable import Tadayo

/// What VoiceOver says as a sign-in request begins, and A02-email's notice (`SignInAnnouncement`;
/// handoff 7's `announcementPolicy.busy`: "Announce the action once, keep focus; ... Do not repeat
/// on renders."). A hosted test can't hear VoiceOver, so the TestFlight notes ask for it on the
/// iPhone too.
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

    /// A02-email's notice is shown and said only after a sign-in the server ended (handoff 7's
    /// `auth.email.signedOut`), never after a Leave the person asked for.
    func testTheSignedOutNoticeIsOnlyForASignInTheServerEnded() {
        XCTAssertEqual(
            SignInAnnouncement.signedOutNotice(signInEnded: true),
            "Your sign-in ended. Enter your email to sign in again.")
        XCTAssertNil(SignInAnnouncement.signedOutNotice(signInEnded: false))
    }
}
