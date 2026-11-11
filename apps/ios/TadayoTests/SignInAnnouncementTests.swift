import XCTest

@testable import Tadayo

/// What VoiceOver says as a sign-in request begins (`SignInAnnouncement`; handoff 7's
/// `announcementPolicy.busy`: "Announce the action once, keep focus; ... Do not repeat on
/// renders."). A hosted test can't hear VoiceOver, so the TestFlight notes ask for it on the
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
}
