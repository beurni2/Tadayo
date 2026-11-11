import XCTest

@testable import Tadayo

/// What VoiceOver says as the root's two waits show (`RootWait.Kind.announcement`): the words as
/// they're drawn, politely, once. A hosted test can't hear VoiceOver, so the TestFlight notes ask
/// for the hearing on the iPhone too: the hand-over from the launch screen, and that nothing is
/// said when no sign-in is kept (FQ96's default).
@MainActor
final class RootWaitTests: XCTestCase {
    func testEachWaitSaysItsVisibleWordsPolitely() {
        let waits: [(RootWait.Kind, String)] = [
            (.loading, "Loading your account…"), (.leaving, "Leaving sign-in…"),
        ]
        for (kind, words) in waits {
            XCTAssertEqual(String(localized: kind.words), words, "\(kind)")
            let said = kind.announcement
            XCTAssertEqual(said.words, words, "\(kind)")
            XCTAssertTrue(said.politely, "\(kind)")
        }
    }
}
