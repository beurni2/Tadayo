import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// Home, Friends and Memories for an account with no club, in every state of the club list
/// (design/reference/INVENTORY.md): the three with a render from handoffs 2 and 4, and the rest
/// built from spec until handoff 7 draws or words them. Each is the tab view the app shows, with
/// the system's tab bar, without the Lab's tab. The fixture is Ben, unphotographed, as handoff 4's
/// `G06-no-club` draws him.
@MainActor
final class TabsSnapshotTests: XCTestCase {
    // MARK: No club

    func testG06NoClub() {
        snap(.noClub, on: .home, named: "G06-no-club", xlHeight: 2800)
    }

    func testF01NoClub() {
        snap(.noClub, on: .friends, named: "F01-no-club", xlHeight: 2800)
    }

    func testM01NoClub() {
        snap(.noClub, on: .memories, named: "M01-no-club")
    }

    // MARK: While the club list loads

    func testH01LoadingNoClub() {
        snap(.loading, on: .home, named: "H01-loading-no-club")
    }

    func testF01LoadingNoClub() {
        snap(.loading, on: .friends, named: "F01-loading-no-club")
    }

    func testM01LoadingNoClub() {
        snap(.loading, on: .memories, named: "M01-loading-no-club")
    }

    // MARK: When the club list fails

    func testH01ErrorNoClub() {
        snap(.failed(.network), on: .home, named: "H01-error-no-club")
    }

    func testF01ErrorNoClub() {
        snap(.failed(.network), on: .friends, named: "F01-error-no-club")
    }

    func testM01ErrorNoClub() {
        snap(.failed(.network), on: .memories, named: "M01-error-no-club")
    }

    func testH01ErrorNoClubRefused() {
        snap(.failed(.other), on: .home, named: "H01-error-no-club-refused")
    }

    func testF01ErrorNoClubRefused() {
        snap(.failed(.other), on: .friends, named: "F01-error-no-club-refused")
    }

    func testM01ErrorNoClubRefused() {
        snap(.failed(.other), on: .memories, named: "M01-error-no-club-refused")
    }

    // MARK: A club this build has no screen for

    func testGlobalClubNotInBuild() {
        // Every tab draws it the same, so Home stands for the three.
        snap(.notInThisBuild, on: .home, named: "global-club-not-in-build")
    }

    // MARK: What VoiceOver finds

    func testTheHeadersWordmarkAddAndAccount() {
        let elements = AccessibilityElements.of(content(.noClub, on: .home))
        let wordmark = elements.first { $0.label == "Tadayo" }
        XCTAssertNotNil(wordmark, "\(elements)")
        XCTAssertFalse(wordmark?.isHeader ?? true, "\(elements)")
        XCTAssertEqual(
            elements.first { $0.label == "+ Add" }?.hint,
            "Save a private draft or open private drafts.", "\(elements)")
        XCTAssertTrue(
            elements.contains { $0.label == "Account" && $0.traits.contains(.button) },
            "\(elements)")
        // The avatar's initial isn't read: Account is.
        XCTAssertFalse(elements.contains { $0.label == "B" }, "\(elements)")
    }

    func testEachTitleIsAHeading() {
        heading("Start your club.", in: content(.noClub, on: .home))
        heading("Friends", in: content(.noClub, on: .friends))
        heading("Your friends will appear here.", in: content(.noClub, on: .friends))
        heading("Memories", in: content(.noClub, on: .memories))
        heading("Your shared days, kept together.", in: content(.noClub, on: .memories))
        heading(
            "Couldn’t load Home. Check your connection and try again.",
            in: content(.failed(.network), on: .home))
        heading("Couldn’t load Friends. Try again.", in: content(.failed(.other), on: .friends))
        heading(
            "This version of Tadayo can’t show clubs yet.",
            in: content(.notInThisBuild, on: .memories))
    }

    func testTheNoClubActionsSayWhatTheyDo() {
        let elements = AccessibilityElements.of(content(.noClub, on: .home))
        XCTAssertTrue(
            elements.contains { $0.label == "Create a club." && $0.traits.contains(.button) },
            "\(elements)")
        XCTAssertEqual(
            elements.first { $0.label == "I have an invite" }?.hint, "Open an invitation link.",
            "\(elements)")
        let drafts = elements.first { $0.label == "Private drafts" }
        XCTAssertEqual(drafts?.hint, "Only you can see these.", "\(elements)")
        XCTAssertTrue(drafts?.traits.contains(.button) ?? false, "\(elements)")
    }

    func testGoToHomeIsAButton() {
        let elements = AccessibilityElements.of(content(.noClub, on: .memories))
        XCTAssertTrue(
            elements.contains { $0.label == "Go to Home" && $0.traits.contains(.button) },
            "\(elements)")
    }

    func testWhileLoadingOnlyTheLabelIsReadNotTheIndicator() {
        // The header's three, then the label: the indicator is no element of its own.
        for tab in ClubTab.allCases {
            let labels = AccessibilityElements.of(content(.loading, on: tab)).map(\.label)
            XCTAssertEqual(
                labels, ["Tadayo", "+ Add", "Account", String(localized: tab.loading)], "\(tab)")
        }
    }

    func testAFailuresTitleAndLineAreOneSpokenGroup() {
        // handoff 6's `denied.group.vo`: the title, then the line, read together.
        let failed = AccessibilityElements.of(content(.failed(.network), on: .memories))
        XCTAssertTrue(
            failed.contains {
                $0.label == "Couldn’t load Memories. Check your connection and try again."
            }, "\(failed)")
        XCTAssertFalse(failed.contains { $0.label == "Couldn’t load Memories." }, "\(failed)")
        XCTAssertFalse(
            failed.contains { $0.label == "Check your connection and try again." }, "\(failed)")
    }

    func testAFailureOffersRetryAndAClubThisBuildCantShowDoesnt() {
        let failed = AccessibilityElements.of(content(.failed(.network), on: .friends))
        XCTAssertTrue(
            failed.contains { $0.label == "Retry" && $0.traits.contains(.button) }, "\(failed)")
        let other = AccessibilityElements.of(content(.notInThisBuild, on: .home))
        XCTAssertTrue(other.contains { $0.label == "Account" }, "\(other)")
        XCTAssertFalse(other.contains { $0.label == "Retry" }, "\(other)")
    }

    // MARK: Helpers

    private func content(_ clubs: RootModel.Clubs, on tab: ClubTab) -> some View {
        TabContent(tab: tab, clubs: clubs, name: "Ben", retry: {}, goHome: {})
    }

    private func heading(
        _ title: String, in view: some View, file: StaticString = #filePath, line: UInt = #line
    ) {
        let elements = AccessibilityElements.of(view)
        XCTAssertTrue(
            elements.contains { $0.label == title && $0.isHeader }, "\(elements)", file: file,
            line: line)
    }

    private func snap(
        _ clubs: RootModel.Clubs, on tab: TabsView.Selection, named state: String,
        xlHeight: CGFloat = 2200, testName: String = #function, line: UInt = #line
    ) {
        ScreenSnapshot.assert(
            TabsView(
                clubs: clubs, name: "Ben", selection: tab, showsLab: false, retry: {},
                logOut: {}),
            named: state, busy: clubs == .loading, xlHeight: xlHeight, testName: testName,
            line: line)
    }
}
