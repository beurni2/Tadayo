import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// Club details and the members list (`ClubDetailsScreen`, `MembersScreen`) in each of their
/// states (design/reference/INVENTORY.md): 2.1's `G05-club-details`, handoff 8's
/// `G05-club-details-failed`, handoff 1's `G05-members` and handoff 2's `G05-members-two-days`,
/// and the states built from spec: each screen loading, the members list failing, and a suspended
/// club's details (FQ80). Each is pushed onto a stack, as the tab pushes it, so the system's Back
/// shows as the frames draw it; the fixtures are `ClubFixtures`'.
@MainActor
final class ClubDetailsSnapshotTests: XCTestCase {
    func testG05ClubDetails() {
        snap(details(.loaded(ClubFixtures.sundayDetail)), named: "G05-club-details")
    }

    func testG05ClubDetailsFailed() {
        snap(details(.failed(.network)), named: "G05-club-details-failed")
    }

    func testG05ClubDetailsLoading() {
        snap(details(.loading), named: "G05-club-details-loading", busy: true)
    }

    func testG05ClubDetailsUnavailable() {
        snap(
            details(.unavailable), named: "G05-club-details-unavailable")
    }

    func testG05Members() {
        snap(members(.loaded(ClubFixtures.sundayRoster)), named: "G05-members")
    }

    func testG05MembersTwoDays() {
        snap(members(.loaded(ClubFixtures.pairRoster)), named: "G05-members-two-days")
    }

    func testG05MembersFailed() {
        snap(members(.failed(.refused)), named: "G05-members-failed")
    }

    func testG05MembersLoading() {
        snap(members(.loading), named: "G05-members-loading", busy: true)
    }

    // MARK: What VoiceOver finds

    func testClubDetailsReadsTheClubThenEachRowWithItsHint() {
        let elements = AccessibilityElements.of(details(.loaded(ClubFixtures.sundayDetail)))
        let name = elements.first { $0.label == "Sunday people" }
        XCTAssertTrue(name?.isHeader ?? false, "\(elements)")
        XCTAssertTrue(
            elements.contains { $0.label == "6 members\u{00A0}· New York" }, "\(elements)")
        for (row, line) in [
            ("Members", "New members need everyone’s approval"),
            ("Schedule", "7\u{202F}AM to 1\u{202F}AM the next morning"),
            ("Notifications", "Preferences for this club"),
            ("Widget", "Preview and setup"),
        ] {
            let element = elements.first { $0.label.hasPrefix(row) }
            XCTAssertEqual(element?.label, "\(row), \(line)", "\(elements)")
            XCTAssertEqual(element?.hint, "Open \(row) for Sunday people.", "\(elements)")
            XCTAssertTrue(element?.traits.contains(.button) ?? false, "\(elements)")
        }
        let drafts = elements.first { $0.label == "Private drafts" }
        XCTAssertEqual(drafts?.hint, "Only you can see these.", "\(elements)")
        let leave = elements.first { $0.label == "Leave club" }
        XCTAssertEqual(leave?.hint, "Review leaving Sunday people.", "\(elements)")
        XCTAssertTrue(leave?.traits.contains(.button) ?? false, "\(elements)")
    }

    func testMembersOpensTheMembersList() {
        var opened = 0
        let view = NavigationStack {
            ClubDetailsScreen(
                details: .loaded(ClubFixtures.sundayDetail), retry: {},
                openMembers: { opened += 1 })
        }
        XCTAssertTrue(
            AccessibilityElements.activate(
                "Members, New members need everyone’s approval", in: view))
        XCTAssertEqual(opened, 1)
    }

    func testEachMemberIsOneElementWithTheirDaysAndNoneIsAButton() {
        let elements = AccessibilityElements.of(members(.loaded(ClubFixtures.pairRoster)))
        let title = elements.first { $0.label == "Sunday people" }
        XCTAssertTrue(title?.isHeader ?? false, "\(elements)")
        let ben = elements.first { $0.label == "Ben, you. Monday and Thursday." }
        let debby = elements.first { $0.label == "Debby. Tuesday and Friday." }
        XCTAssertNotNil(ben, "\(elements)")
        XCTAssertNotNil(debby, "\(elements)")
        XCTAssertFalse(ben?.traits.contains(.button) ?? true, "\(elements)")
        XCTAssertTrue(elements.contains { $0.label == "Two reveal days each." }, "\(elements)")
        XCTAssertTrue(
            elements.contains { $0.label == "2 members\u{00A0}· New York" }, "\(elements)")
        XCTAssertTrue(
            elements.contains { $0.label == "7\u{202F}AM to 1\u{202F}AM the next morning." },
            "\(elements)")
    }

    func testAMemberWithNoDayReadsTheirNameAloneAndTheListHasNoSubtitle() {
        let roster = ClubFixtures.roster(
            "club_sunday", "Sunday people", [("Ben", [.monday, .thursday]), ("Debby", [])])
        let elements = AccessibilityElements.of(members(.loaded(roster)))
        XCTAssertTrue(elements.contains { $0.label == "Debby." }, "\(elements)")
        XCTAssertFalse(elements.contains { $0.label.hasSuffix("each.") }, "\(elements)")
        XCTAssertFalse(elements.contains { $0.label == "Each person has a day." }, "\(elements)")
    }

    func testEveryWeekdayIsNamedEvenPastTwo() {
        XCTAssertNil(ClubWords.days([]))
        XCTAssertEqual(ClubWords.days([.monday]), "Monday")
        XCTAssertEqual(ClubWords.days([.monday, .thursday]), "Monday and Thursday")
        // A club gives one day or two (spec 05); a third, should it come, isn't dropped.
        let three = ClubWords.days([.monday, .wednesday, .friday]) ?? ""
        for name in ["Monday", "Wednesday", "Friday"] {
            XCTAssertTrue(three.contains(name), three)
        }
    }

    func testAFailureReadsItsTitleAndLineAndRetrySaysWhatItReads() {
        for (view, title, line, hint) in [
            (
                AnyView(details(.failed(.network))), "Couldn’t load club details.",
                "Check your connection and try again.", "Try loading club details again."
            ),
            (
                AnyView(members(.failed(.refused))), "Couldn’t load members.", "Try again.",
                "Try loading members again."
            ),
        ] {
            let elements = AccessibilityElements.of(view)
            XCTAssertTrue(elements.contains { $0.label == title && $0.isHeader }, "\(elements)")
            XCTAssertTrue(elements.contains { $0.label == line }, "\(elements)")
            XCTAssertEqual(elements.first { $0.label == "Retry" }?.hint, hint, "\(elements)")
            // No rows and no count.
            XCTAssertFalse(
                elements.contains { $0.label.contains("members\u{00A0}·") }, "\(elements)")
        }
    }

    func testASuspendedClubsDetailsShowNothingOfIt() {
        let elements = AccessibilityElements.of(details(.unavailable))
        XCTAssertTrue(
            elements.contains {
                $0.label == "Club unavailable. This club isn’t available right now." && $0.isHeader
            }, "\(elements)")
        XCTAssertFalse(elements.contains { $0.label.contains("Sunday people") }, "\(elements)")
        XCTAssertFalse(elements.contains { $0.label.contains("member") }, "\(elements)")
    }

    func testEachLoadingFormReadsItsLabel() {
        XCTAssertTrue(
            AccessibilityElements.of(details(.loading)).contains {
                $0.label == "Loading club details…"
            })
        XCTAssertTrue(
            AccessibilityElements.of(members(.loading)).contains { $0.label == "Loading members…" })
    }

    // MARK: Helpers

    /// `screen` pushed onto a stack, as the tab pushes it.
    private func pushed(_ screen: some View) -> some View {
        NavigationStack(path: .constant([ClubRoute.details])) {
            Color.clear
                .navigationDestination(for: ClubRoute.self) { _ in screen }
        }
    }

    private func details(_ state: ClubDetailsModel.Details) -> some View {
        pushed(ClubDetailsScreen(details: state, retry: {}, openMembers: {}))
    }

    private func members(_ state: ClubDetailsModel.Members) -> some View {
        pushed(MembersScreen(members: state, retry: {}))
    }

    private func snap(
        _ view: some View, named state: String, busy: Bool = false, testName: String = #function,
        line: UInt = #line
    ) {
        ScreenSnapshot.assert(view, named: state, busy: busy, testName: testName, line: line)
    }
}
