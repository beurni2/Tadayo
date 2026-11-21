import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// The club switcher (`ClubSwitcher`) in its three states (design/reference/INVENTORY.md): 2.1's
/// `G06-switcher`, an active club with its day open and another with its next day; handoff 5's
/// `G06-switcher-status`, a club that hasn't started and a paused one; and handoff 6's
/// `G06-switcher-unavailable`, a suspended club, selected, beside an active one.
///
/// Each draws the sheet's content on its own, from the sheet's top: `ScreenSnapshot` draws the
/// host's own view, which a presented sheet isn't part of. So the dimmed tab behind the sheet,
/// which the renders draw, and the sheet's grabber, corners and height, which the system draws,
/// are a known difference (handoff 6's note on `G06-switcher-status`).
@MainActor
final class ClubSwitcherSnapshotTests: XCTestCase {
    func testG06Switcher() {
        snap([ClubFixtures.sundayOpen, ClubFixtures.kitchen], named: "G06-switcher")
    }

    func testG06SwitcherStatus() {
        snap([ClubFixtures.sunday, ClubFixtures.kitchenPaused], named: "G06-switcher-status")
    }

    func testG06SwitcherUnavailable() {
        snap(
            [ClubFixtures.sundaySuspended, ClubFixtures.kitchen],
            named: "G06-switcher-unavailable")
    }

    // MARK: What VoiceOver finds

    func testEachRowReadsTheClubThenItsLineAndTheSelectedOneIsSelected() {
        let rows: [([ClubSummary], [String])] = [
            (
                [ClubFixtures.sundayOpen, ClubFixtures.kitchen],
                [
                    "Sunday people. 6 people. Debby’s Friday.",
                    "Kitchen table. 5 people. Next: Maya.",
                ]
            ),
            (
                [ClubFixtures.sunday, ClubFixtures.kitchenPaused],
                ["Sunday people. Not started.", "Kitchen table. Paused."]
            ),
            (
                [ClubFixtures.sundaySuspended, ClubFixtures.kitchen],
                ["Sunday people. Unavailable.", "Kitchen table. 5 people. Next: Maya."]
            ),
        ]
        for (clubs, labels) in rows {
            let elements = AccessibilityElements.of(switcher(clubs))
            let selected = elements.first { $0.label == labels[0] }
            XCTAssertTrue(selected?.traits.contains(.button) ?? false, "\(elements)")
            XCTAssertTrue(selected?.traits.contains(.selected) ?? false, "\(elements)")
            let other = elements.first { $0.label == labels[1] }
            XCTAssertTrue(other?.traits.contains(.button) ?? false, "\(elements)")
            XCTAssertFalse(other?.traits.contains(.selected) ?? true, "\(elements)")
        }
    }

    func testTheTitleIsAHeadingAndTheActionsFollowTheRows() {
        let elements = AccessibilityElements.of(
            switcher([ClubFixtures.sunday, ClubFixtures.kitchenPaused]))
        XCTAssertEqual(
            elements.map(\.label),
            [
                "Your clubs", "Sunday people. Not started.", "Kitchen table. Paused.",
                "Club details", "Create a club", "Cancel",
            ])
        XCTAssertTrue(elements.first?.isHeader ?? false, "\(elements)")
        XCTAssertTrue(elements.dropFirst().allSatisfy { $0.traits.contains(.button) })
    }

    func testChoosingARowSelectsThatClub() {
        var chosen: [String] = []
        let view = ClubSwitcher(
            clubs: [ClubFixtures.sunday, ClubFixtures.kitchenPaused], selectedID: "club_sunday"
        ) { chosen.append($0) }
        XCTAssertTrue(AccessibilityElements.activate("Kitchen table. Paused.", in: view))
        XCTAssertEqual(chosen, ["club_kitchen"])
    }

    // MARK: Helpers

    private func switcher(_ clubs: [ClubSummary]) -> some View {
        ClubSwitcher(clubs: clubs, selectedID: clubs.first?.id, select: { _ in })
    }

    private func snap(
        _ clubs: [ClubSummary], named state: String, testName: String = #function,
        line: UInt = #line
    ) {
        ScreenSnapshot.assert(switcher(clubs), named: state, testName: testName, line: line)
    }
}
