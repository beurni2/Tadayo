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
            accounts: ScriptedAccounts(updates: [], me: me), clubs: UITestLaunch.NoClubs(),
            selection: InMemoryClubSelection())
    }

    private func reading() -> RootModel {
        let root = root()
        XCTAssertEqual(root.route, .starting)
        drive({ await root.start() }, until: { root.route == .reading })
        return root
    }

    private func leaving() -> RootModel {
        let root = root(signOut: .hang)
        drive({ await root.leave() }, until: { root.route == .leaving })
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

    func testBeforeASignInIsFoundTheRootReadsNothing() {
        // What must be found goes with what mustn't (the reader's rule: a tree that can't be read
        // fails rather than passes): once a sign-in is found the same view reads the wait.
        let read = AccessibilityElements.of(RoutedView(root: reading()))
        XCTAssertEqual(read.map(\.label), ["Loading your account…"], "\(read)")
        // FQ96's default: until a kept sign-in is found the root says nothing, and draws the
        // canvas alone as the launch screen did (no snapshot holds that: the reference that once
        // did is the wait now). A root that hasn't read the keychain is in that state, so a view
        // that drew the wait for `.starting` would read its words here.
        let fresh = root()
        XCTAssertEqual(fresh.route, .starting)
        let elements = AccessibilityElements.of(RoutedView(root: fresh))
        XCTAssertEqual(elements.map(\.label), [], "\(elements)")
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
