import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// Welcome (`A01-welcome`, handoff 9's frames 18 to 20), the signed-out paste step
/// (`G02-link-entry`, handoff 2's frame 11) and A02-email pushed over Welcome, in the sign-in
/// stack, each driven through its model as the app drives it (`docs/plans/ios-b1-welcome.md`
/// section 6). The example's photographs are the Lab's fixtures, as the `ios` workflow builds
/// Debug (FQ23).
@MainActor
final class WelcomeSnapshotTests: XCTestCase {
    private let clock = StillClock()

    // MARK: A01-welcome

    /// Frames 18 and 19, and frame 20: at the largest text, the whole of the one column, whose
    /// end, the three routes, is what frame 20 draws scrolled to (handoff 9: "Frame20
    /// intentionally scrolled to actions"; the `.xl` window holds the column, top to foot).
    func testA01Welcome() {
        ScreenSnapshot.assert(SignInFlow(model: welcome()), named: "A01-welcome")
    }

    // MARK: G02-link-entry, signed out

    /// Handoff 2's frame 11: I have an invite's paste step, empty, Continue unavailable.
    func testG02LinkEntry() {
        let model = welcome()
        model.choose(.invitation)
        snap(model, named: "G02-link-entry")
    }

    /// Built from spec: text that isn't an invitation link, with handoff 4's `linkEntry.invalid`
    /// under the field and Continue unavailable until the field holds a plausible link.
    func testG02LinkEntryInvalid() throws {
        let model = welcome()
        model.choose(.invitation)
        let entry = try XCTUnwrap(model.linkEntry)
        entry.text = "https://example.com/i#not-a-link"
        drive({ await entry.proceed() }, until: { entry.problem == .invalid })
        XCTAssertFalse(entry.isHeld)
        snap(model, named: "G02-link-entry-invalid")
    }

    // MARK: A02-email over Welcome

    /// Built from spec: Already here? Sign in pushed A02-email over Welcome, with the system's
    /// back.
    func testA02EmailFromWelcome() {
        let model = welcome()
        model.choose(.signIn)
        snap(model, named: "A02-email-from-welcome")
    }

    // MARK: What VoiceOver finds

    func testWelcomesRoutesAreReadByTheirWordsAndOnlySignInHasAHint() {
        let elements = AccessibilityElements.of(SignInFlow(model: welcome()))
        let create = elements.first { $0.label == "Create a club" }
        let invite = elements.first { $0.label == "I have an invite" }
        let signIn = elements.first { $0.label == "Already here? Sign in" }
        XCTAssertEqual(create?.hint, "", "\(elements)")
        XCTAssertEqual(invite?.hint, "", "\(elements)")
        XCTAssertEqual(signIn?.hint, "Sign in to your existing account.", "\(elements)")
        XCTAssertTrue(create?.traits.contains(.button) ?? false, "\(elements)")
        XCTAssertTrue(signIn?.traits.contains(.button) ?? false, "\(elements)")
    }

    func testTheBrandLineIsTheHeadingAndTheWordmarkAnImage() {
        let elements = AccessibilityElements.of(SignInFlow(model: welcome()))
        XCTAssertTrue(
            elements.contains {
                $0.label == "Your day. Your story. A thought from your friends." && $0.isHeader
            }, "\(elements)")
        let wordmark = elements.first { $0.label == "Tadayo" }
        XCTAssertTrue(wordmark?.traits.contains(.image) ?? false, "\(elements)")
        XCTAssertFalse(wordmark?.isHeader ?? true, "\(elements)")
    }

    /// The example is read in its order, the card as one element, and the photograph isn't read:
    /// only its stage's label (spec 04: a labelled example, never a drop).
    func testTheExampleIsReadInOrderWithThePhotographHidden() {
        let elements = AccessibilityElements.of(SignInFlow(model: welcome()))
        let labels = elements.map(\.label)
        let order = [
            "An example\u{00A0}· before and on the day",
            "Debby’s Friday\u{00A0}· November 6, 2026",
            "Caption now",
            "Maya. Your future living room.",
            "Photo on the day",
        ]
        let found = order.compactMap { labels.firstIndex(of: $0) }
        XCTAssertEqual(found.count, order.count, "\(elements)")
        XCTAssertEqual(found, found.sorted(), "\(elements)")
        // Nothing between "Photo on the day" and Create a club: the photograph has no element.
        if let photoLabel = labels.firstIndex(of: "Photo on the day"),
            let create = labels.firstIndex(of: "Create a club")
        {
            XCTAssertEqual(create, photoLabel + 1, "\(elements)")
        }
    }

    /// Signed out, the paste step says sign-in comes first, and Continue is read by its word: it
    /// checks nothing, so it isn't "Check the invitation link.".
    func testTheSignedOutPasteStepSaysSignInComesFirst() {
        let model = welcome()
        model.choose(.invitation)
        let elements = AccessibilityElements.of(SignInFlow(model: model))
        XCTAssertTrue(
            elements.contains { $0.label == "Sign in before you can see the club or its people." },
            "\(elements)")
        XCTAssertFalse(
            elements.contains {
                $0.label == "We’ll check the link before showing the club or its people."
            }, "\(elements)")
        XCTAssertTrue(elements.contains { $0.label == "Continue" }, "\(elements)")
        XCTAssertFalse(
            elements.contains { $0.label == "Check the invitation link." }, "\(elements)")
    }

    // MARK: Helpers

    /// The sign-in flow at Welcome, as a launch with no sign-in starts it.
    private func welcome() -> SignInModel {
        let clock = clock
        return SignInModel(
            auth: ScriptedAuth(), verified: { _ in }, welcome: true, now: { clock.now },
            sleep: { try await clock.sleep(until: $0) })
    }

    private func snap(
        _ model: SignInModel, named state: String, testName: String = #function,
        line: UInt = #line
    ) {
        ScreenSnapshot.assert(
            SignInFlow(model: model, focus: false), named: state, testName: testName, line: line)
    }
}
