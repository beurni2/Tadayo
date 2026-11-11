import SwiftUI
import TadayoCore
import TadayoDesign
import XCTest

@testable import Tadayo

/// What VoiceOver reads for the day header and the weekday plaque: every spoken full date has
/// its year (FQ44; handoff 6's `travellingRows.targetYear`: "exact VO targets always include
/// year"), and the header is one heading whose plaque isn't read again (FQ92's default).
@MainActor
final class DayHeaderTests: XCTestCase {
    private var opening: String { "Opens Friday, November 13, 2026 at \(seven), New York." }
    private var debbysOpenDay: String {
        "Friday, November 6, 2026. Debby’s Friday. Until Saturday, November 7, 2026 at "
            + "1\u{202F}AM, New York. Kept in Memories."
    }

    func testThePlaqueReadsItsFullDateWithTheYear() {
        assertReads(
            WeekdayPlaque(date: FixtureCast.open, labels: FixtureCast.labels),
            [Read("Friday, November 6, 2026")])
    }

    func testTheCollectingHeaderIsOneHeadingReadAsItsOpening() {
        let header = DayHeader(collecting: FixtureCast.collectingDay, labels: FixtureCast.labels)
        assertReads(header, [Read(opening)])
        XCTAssertEqual(AccessibilityElements.of(header).map(\.isHeader), [true])
    }

    /// A screen in the current year writes the date without its year; VoiceOver still reads it.
    func testTheCurrentYearsFormStillSpeaksTheYear() {
        assertReads(
            DayHeader(collecting: FixtureCast.collectingDayThisYear, labels: FixtureCast.labels),
            [Read(opening)])
        assertReads(
            DayHeader(open: FixtureCast.openDayThisYear, labels: FixtureCast.labels),
            [Read(debbysOpenDay)])
    }

    /// At the largest size the plaque goes above the words, and the header still reads once.
    func testTheStackedHeaderReadsTheSame() {
        assertReads(
            DayHeader(collecting: FixtureCast.collectingDay, labels: FixtureCast.labels)
                .environment(\.dynamicTypeSize, .accessibility5),
            [Read(opening)])
    }

    /// The open day reads its words in order, its closing in full with the year and the club's
    /// city.
    func testTheOpenHeaderIsOneHeadingReadInOrder() {
        let header = DayHeader(open: FixtureCast.openDay, labels: FixtureCast.labels)
        assertReads(header, [Read(debbysOpenDay)])
        XCTAssertEqual(AccessibilityElements.of(header).map(\.isHeader), [true])
    }

    /// The star's own open day is "Your Monday" (handoff 6's `selfName`), never a pronoun or
    /// their name.
    func testTheStarsOwnOpenDayIsYourDay() {
        assertReads(
            DayHeader(open: FixtureCast.bensOpenDay, labels: FixtureCast.labels),
            [
                Read(
                    "Monday, November 9, 2026. Your Monday. Until Tuesday, November 10, 2026 at "
                        + "1\u{202F}AM, New York. Kept in Memories.")
            ])
    }

    /// The open day's input is its star, whether that is the viewer, its date, its closing and
    /// the club's zone, and nothing counted.
    func testTheOpenDaysInputHoldsNothingElse() {
        XCTAssertEqual(
            fields(FixtureCast.openDay),
            [
                "star: String", "isViewer: Bool", "date: LocalDate", "closesAt: Date",
                "zone: TimeZone", "includingYear: Bool",
            ])
    }
}
