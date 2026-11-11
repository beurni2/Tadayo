import TadayoCore
import XCTest

@testable import Tadayo

/// Where the root's failure sits, and what VoiceOver finds in it, measured in the test host's own
/// window (`AccessibilityElements`), so that it is measured on the iOS 17.5 and 18.6
/// compatibility runs as well as on the newest iOS: the snapshot tests run on the newest only, and
/// the bar a failure sits under is the part of its layout that differs by iOS version (an empty
/// inline bar has no height at all on iOS 26 unless it is kept visible: docs/LIMITATIONS.md).
@MainActor
final class RootFailureTests: XCTestCase {
    func testTheFailureTitleSitsWhereTheSignInTitlesSit() {
        // Handoff 7's frame 12 sets the title where A02-age's sits under its bar (the same
        // baseline), with no bar drawn: the screen's own bar is empty. The two are compared, not
        // measured against a number, which the bar's height changes with the iOS version.
        let failure = AccessibilityElements.layout(
            of: RootFailure(kind: .account(.network), retry: {}))
        let age = AccessibilityElements.layout(of: AgeScreen(model: ageModel(), leave: {}))
        let title = failure.elements.first {
            $0.isHeader && $0.label == "Couldn’t load your account."
        }
        let signIn = age.elements.first { $0.isHeader && $0.label == "Before you continue" }
        XCTAssertNotNil(title, "\(failure.elements)")
        XCTAssertNotNil(signIn, "\(age.elements)")
        XCTAssertEqual(title?.frame.minY ?? 0, signIn?.frame.minY ?? -1, accuracy: 0.5)
        XCTAssertGreaterThan(title?.frame.height ?? 0, 0)
    }

    func testRetryIs44PointsAboveTheSafeAreaAndTheLineIs16UnderTheTitle() {
        // `formFooterToSafeAreaBottom` 44 (handoff 7, frame 12: Retry ends at 774 of a 818-point
        // safe area), and the title-to-line gap the app keeps at 16 (V-24).
        let failure = AccessibilityElements.layout(
            of: RootFailure(kind: .account(.network), retry: {}))
        let retry = failure.elements.first { $0.label == "Retry" }
        let title = failure.elements.first { $0.isHeader }
        let line = failure.elements.first { $0.label == "Check your connection and try again." }
        XCTAssertNotNil(retry, "\(failure.elements)")
        XCTAssertNotNil(title, "\(failure.elements)")
        XCTAssertNotNil(line, "\(failure.elements)")
        let above = failure.size.height - failure.safeArea.bottom - (retry?.frame.maxY ?? 0)
        XCTAssertEqual(above, 44, accuracy: 0.5, "\(failure)")
        XCTAssertEqual(
            (line?.frame.minY ?? 0) - (title?.frame.maxY ?? 0), 16, accuracy: 0.5,
            "\(failure.elements)")
    }

    func testEachFailureNamesWhatFailedAsAHeadingWithRetry() {
        // The empty bar the failure sits under is kept visible (`RootFailure`), and what a bar
        // adds for VoiceOver is part of the same iOS-dependent layout: the title, the line and
        // Retry, and nothing of the bar, is checked here for the same reason.
        let failures: [(RootFailure.Kind, String, String)] = [
            (.account(.network), "Couldn’t load your account.", "Load your account again."),
            (.account(.other), "Couldn’t load your account.", "Load your account again."),
            (
                .leave, "Couldn’t remove your sign-in from this iPhone.",
                "Remove the sign-in from this iPhone again."
            ),
            (
                .keep, "Couldn’t keep you signed in.",
                "Return to email sign-in. Your email address is kept."
            ),
        ]
        for (kind, title, hint) in failures {
            let elements = AccessibilityElements.of(RootFailure(kind: kind, retry: {}))
            XCTAssertTrue(
                elements.contains { $0.label == title && $0.isHeader }, "\(kind): \(elements)")
            let retry = elements.first { $0.label == "Retry" && $0.traits.contains(.button) }
            XCTAssertEqual(retry?.hint, hint, "\(kind): \(elements)")
            // The title, the line and Retry, and nothing of the bar they sit under.
            XCTAssertEqual(elements.count, 3, "\(kind): \(elements)")
        }
    }

    private func ageModel() -> ProfileModel {
        ProfileModel(
            account: Account(
                id: "ben", displayName: nil, avatarVersion: nil, ageConfirmed: false, version: 0),
            accounts: NoAnswer(), saved: { _ in }, signedOut: {})
    }
}

/// An account service that never has an answer: the age screen is laid out here, never driven.
private struct NoAnswer: AccountService {
    func me() async throws(APIFailure) -> Account { throw .network }
    func update(_ change: AccountChange, key: IdempotencyKey) async throws(APIFailure) -> Account {
        throw .network
    }
    func clubs() async throws(APIFailure) -> ClubList { throw .network }
}
