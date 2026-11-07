import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// The root's own states (design/reference/INVENTORY.md), built from spec until handoff 7 draws
/// or words them (its item 12): the launch, the canvas alone while the account is read or Leave
/// sign-in runs, and the four failures, with no header and no tabs. iOS draws the launch screen
/// itself before the app runs, so no snapshot can hold it: `LaunchScreenTests` checks its colour
/// is the canvas, and the device check judges it (docs/LIMITATIONS.md).
@MainActor
final class RootSnapshotTests: XCTestCase {
    func testGlobalLaunch() {
        // A root model that hasn't started yet is starting, as one reading the account is.
        let auth = ScriptedAuth()
        let root = RootModel(
            session: SessionManager(auth: auth, store: InMemorySessionStore()), auth: auth,
            accounts: ScriptedAccounts(updates: []))
        XCTAssertEqual(root.route, .starting)
        ScreenSnapshot.assert(RoutedView(root: root), named: "global-launch")
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

    func testEachFailureNamesWhatFailedAsAHeadingWithRetry() {
        let titles: [(RootFailure.Kind, String)] = [
            (.account(.network), "Couldn’t load your account."),
            (.account(.other), "Couldn’t load your account."),
            (.leave, "Couldn’t remove your sign-in from this iPhone."),
            (.keep, "Couldn’t keep you signed in."),
        ]
        for (kind, title) in titles {
            let elements = AccessibilityElements.of(RootFailure(kind: kind, retry: {}))
            XCTAssertTrue(
                elements.contains { $0.label == title && $0.isHeader }, "\(kind): \(elements)")
            XCTAssertTrue(
                elements.contains { $0.label == "Retry" && $0.traits.contains(.button) },
                "\(kind): \(elements)")
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
