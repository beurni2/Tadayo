import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// Where Club details and the members list put things, measured in the test host's own window
/// (`AccessibilityElements`) on both iOS versions each run tests: the club's name where frame
/// 11's failure title sits, under the same inline bar; rows the column's width and at least 44
/// high, in order; Leave club at the leading edge under Private drafts; each member a row at
/// least 52 high, the column's width; and the footer under the last member.
@MainActor
final class ClubDetailsLayoutTests: XCTestCase {
    private typealias Element = AccessibilityElements.Element

    private func pushed(_ screen: some View, size: DynamicTypeSize = .large) -> some View {
        NavigationStack(path: .constant([ClubRoute.details])) {
            Color.clear
                .navigationDestination(for: ClubRoute.self) { _ in screen }
        }
        .environment(\.dynamicTypeSize, size)
    }

    private func details(_ state: ClubDetailsModel.Details) -> some View {
        pushed(
            ClubDetailsScreen(
                club: ClubFixtures.sundayOpen, details: state, retry: {}, openMembers: {}))
    }

    private func element(
        _ label: String, in layout: AccessibilityElements.Layout, file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> Element {
        try XCTUnwrap(
            layout.elements.first { $0.label == label || $0.label.hasPrefix(label + ",") },
            "\(layout.elements)", file: file, line: line)
    }

    func testTheClubsNameSitsWhereTheFailuresTitleDoes() throws {
        let loaded = AccessibilityElements.layout(of: details(.loaded(ClubFixtures.sundayDetail)))
        let failed = AccessibilityElements.layout(of: details(.failed(.network)))
        let name = try element("Sunday people", in: loaded)
        let title = try element("Couldn’t load club details.", in: failed)
        XCTAssertEqual(name.frame.minY, title.frame.minY, accuracy: 0.5, "\(name) \(title)")
        XCTAssertEqual(name.frame.minX, 20, accuracy: 0.5, "\(name)")
    }

    func testTheRowsAreTheColumnsWidthAtLeast44HighInOrder() throws {
        let layout = AccessibilityElements.layout(of: details(.loaded(ClubFixtures.sundayDetail)))
        let rows = try ["Members", "Schedule", "Notifications", "Widget"].map {
            try element($0, in: layout)
        }
        for row in rows {
            XCTAssertEqual(row.frame.minX, 20, accuracy: 0.5, "\(row)")
            XCTAssertEqual(row.frame.width, 353, accuracy: 0.5, "\(row)")
            XCTAssertGreaterThanOrEqual(row.frame.height, 44, "\(row)")
        }
        for (upper, lower) in zip(rows, rows.dropFirst()) {
            XCTAssertEqual(upper.frame.maxY, lower.frame.minY, accuracy: 1.5, "\(upper) \(lower)")
        }
        let footer = try element("6 members\u{00A0}· New York", in: layout)
        XCTAssertLessThan(footer.frame.maxY, rows[0].frame.minY, "\(footer)")
    }

    func testLeaveClubIsAtTheLeadingEdgeUnderPrivateDrafts() throws {
        let layout = AccessibilityElements.layout(of: details(.loaded(ClubFixtures.sundayDetail)))
        let widget = try element("Widget", in: layout)
        let drafts = try element("Private drafts", in: layout)
        let leave = try element("Leave club", in: layout)
        XCTAssertEqual(drafts.frame.minY - widget.frame.maxY, 16, accuracy: 0.5, "\(drafts)")
        XCTAssertEqual(leave.frame.minX, 20, accuracy: 0.5, "\(leave)")
        XCTAssertEqual(leave.frame.minY - drafts.frame.maxY, 20, accuracy: 0.5, "\(leave)")
        XCTAssertGreaterThanOrEqual(leave.frame.height, 44, "\(leave)")
    }

    func testEachMemberIsARowAtLeast52HighWithTheFooterUnderTheLast() throws {
        for size in [DynamicTypeSize.large, .accessibility5] {
            let layout = AccessibilityElements.layout(
                of: pushed(
                    MembersScreen(members: .loaded(ClubFixtures.sundayRoster), retry: {}),
                    size: size))
            let ben = try element("Ben, you. Monday.", in: layout)
            let nina = try element("Nina. Saturday.", in: layout)
            for row in [ben, nina] {
                XCTAssertEqual(row.frame.minX, 20, accuracy: 0.5, "\(size) \(row)")
                XCTAssertEqual(row.frame.width, 353, accuracy: 0.5, "\(size) \(row)")
                XCTAssertGreaterThanOrEqual(row.frame.height, 52, "\(size) \(row)")
            }
            let count = try element("6 members\u{00A0}· New York", in: layout)
            XCTAssertEqual(count.frame.minY - nina.frame.maxY, 32, accuracy: 0.5, "\(size)")
        }
    }
}
