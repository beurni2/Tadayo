import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// The root's own states (design/reference/INVENTORY.md): the wait while a kept sign-in's account
/// is read (`global-launch`) and the wait while Leave sign-in runs (`global-leaving`), which
/// handoff 7 words and describes but draws no frame for (built from spec), and the four
/// failures, with no header and no tabs, the first of which handoff 7 draws (its frame 12). iOS
/// draws the launch screen itself before the app runs, so no snapshot can hold it:
/// `LaunchScreenTests` checks its colour is the canvas, and the device check judges it
/// (docs/LIMITATIONS.md).
@MainActor
final class RootSnapshotTests: XCTestCase {
    /// A root with a sign-in kept on the device, as `start()` finds one at launch: by default its
    /// account read never answers, and `signOut: .hang` holds Leave sign-in on its wait.
    private func root(
        me: Outcome<APIFailure> = .hang, signOut: Outcome<AuthFailure> = .answer
    ) -> RootModel {
        let auth = ScriptedAuth(signOut: signOut)
        let store = InMemorySessionStore(
            AuthSession(accessToken: "a", refreshToken: "r", expiresAt: .distantFuture))
        return RootModel(
            session: SessionManager(auth: auth, store: store), auth: auth,
            accounts: ScriptedAccounts(updates: [], me: me))
    }

    private func reading() -> RootModel {
        let root = root()
        XCTAssertEqual(root.route, .starting)
        ScreenSnapshot.drive({ await root.start() }, until: { root.route == .reading })
        return root
    }

    private func leaving() -> RootModel {
        let root = root(signOut: .hang)
        ScreenSnapshot.drive({ await root.leave() }, until: { root.route == .leaving })
        return root
    }

    func testGlobalLaunch() {
        ScreenSnapshot.assert(RoutedView(root: reading()), named: "global-launch", busy: true)
    }

    func testGlobalLeaving() {
        ScreenSnapshot.assert(RoutedView(root: leaving()), named: "global-leaving", busy: true)
    }

    func testGlobalLaunchFailedNetwork() {
        snap(.account(.network), named: "global-launch-failed-network")
    }

    func testGlobalLaunchRefused() {
        snap(.account(.other), named: "global-launch-refused")
    }

    func testGlobalLeaveFailed() {
        snap(.leave, named: "global-leave-failed")
    }

    func testGlobalSignInNotKept() {
        snap(.keep, named: "global-sign-in-not-kept")
    }

    // MARK: What VoiceOver finds

    func testEachWaitReadsOnlyItsWords() {
        // The words alone: no indicator, no header ("Tadayo", "+ Add", "Account"), no Retry.
        let waits: [(RootWait.Kind, String)] = [
            (.loading, "Loading your account…"), (.leaving, "Leaving sign-in…"),
        ]
        for (kind, words) in waits {
            let elements = AccessibilityElements.of(RootWait(kind: kind))
            XCTAssertEqual(elements.map(\.label), [words], "\(kind): \(elements)")
        }
        // And the root draws them for the routes that wait.
        let read = AccessibilityElements.of(RoutedView(root: reading()))
        XCTAssertEqual(read.map(\.label), ["Loading your account…"], "\(read)")
        let left = AccessibilityElements.of(RoutedView(root: leaving()))
        XCTAssertEqual(left.map(\.label), ["Leaving sign-in…"], "\(left)")
    }

    func testEachFailureNamesWhatFailedAsAHeadingWithRetry() {
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

    func testCheckYourConnectionOnlyWhenNoAnswerCame() {
        let network = AccessibilityElements.of(RootFailure(kind: .account(.network), retry: {}))
        XCTAssertTrue(
            network.contains { $0.label == "Check your connection and try again." }, "\(network)")
        for kind in [RootFailure.Kind.account(.other), .leave, .keep] {
            let elements = AccessibilityElements.of(RootFailure(kind: kind, retry: {}))
            XCTAssertTrue(elements.contains { $0.label == "Try again." }, "\(kind): \(elements)")
        }
    }

    func testEachFailureIsSaidAsItShowsTitleThenLine() {
        let said: [(RootFailure.Kind, String)] = [
            (
                .account(.network),
                "Couldn’t load your account. Check your connection and try again."
            ),
            (.account(.other), "Couldn’t load your account. Try again."),
            (.leave, "Couldn’t remove your sign-in from this iPhone. Try again."),
            (.keep, "Couldn’t keep you signed in. Try again."),
        ]
        for (kind, words) in said {
            XCTAssertEqual(kind.spoken, words, "\(kind)")
        }
    }

    private func snap(
        _ kind: RootFailure.Kind, named state: String, testName: String = #function,
        line: UInt = #line
    ) {
        ScreenSnapshot.assert(
            RootFailure(kind: kind, retry: {}), named: state, testName: testName, line: line)
    }
}
