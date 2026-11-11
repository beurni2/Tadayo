import SwiftUI
import TadayoCore
import TadayoDesign
import XCTest

@testable import Tadayo

/// What VoiceOver reads for each roster row, exactly as handoff 6's `screen-copy.json` gives it
/// (handoff 5's `friends.row.vo` and `friends.row.travelling.vo`, handoff 6's `friends.row.hint`
/// and `friends.row.noDate.vo`), with ICU's narrow space before AM; and what a row's input can
/// hold. The rows are the live roster's, in the current year, so their visible dates have no
/// year: each spoken date still has it (FQ44). The avatar and the chevron are never read. A
/// member with no day is read by name alone, with no hint and nothing to tap (FQ48: nothing says
/// whether they've confirmed).
@MainActor
final class PersonRowTests: XCTestCase {
    func testTheViewersRowSaysYouAndHintsTheirOwnDay() {
        assertReads(
            row(FixtureCast.member(FixtureCast.ben)),
            [
                Read(
                    "Ben, you. Monday, November 9, 2026 at \(seven), New York.",
                    hint: "Open your Monday.", isButton: true)
            ])
    }

    func testNextUpIsReadBeforeTheDate() {
        assertReads(
            row(FixtureCast.member(FixtureCast.nina)),
            [
                Read(
                    "Nina. Next up. Saturday, November 7, 2026 at \(seven), New York.",
                    hint: "Open Nina’s Saturday.", isButton: true)
            ])
    }

    func testAnotherMembersRowNamesThem() {
        assertReads(
            row(FixtureCast.member(FixtureCast.maya)),
            [
                Read(
                    "Maya. Tuesday, November 10, 2026 at \(seven), New York.",
                    hint: "Open Maya’s Tuesday.", isButton: true)
            ])
    }

    /// In Auckland, Ben's Monday opens on Tuesday at 1 AM: read there first, then in the club's
    /// zone, and the hint keeps the club's weekday (handoff 6's `F01-friends-travelling`).
    func testTravellingReadsThePhonesZoneThenTheClubs() {
        assertReads(
            row(FixtureCast.member(FixtureCast.ben), device: FixtureCast.auckland),
            [
                Read(
                    "Ben, you. Tuesday, November 10, 2026 at 1\u{202F}AM, Auckland; Monday, "
                        + "November 9, 2026 at \(seven), New York.",
                    hint: "Open your Monday.", isButton: true)
            ])
        assertReads(
            row(FixtureCast.member(FixtureCast.nina), device: FixtureCast.london),
            [
                Read(
                    "Nina. Next up. Saturday, November 7, 2026 at 12\u{202F}PM, London; Saturday, "
                        + "November 7, 2026 at \(seven), New York.",
                    hint: "Open Nina’s Saturday.", isButton: true)
            ])
    }

    func testAMemberWithNoDayIsTheirNameAlone() {
        assertReads(row(FixtureCast.member(FixtureCast.ben, dated: false)), [Read("Ben, you.")])
        assertReads(row(FixtureCast.member(FixtureCast.debby, dated: false)), [Read("Debby.")])
    }

    /// A row with no day says nothing but the name, and VoiceOver reads it as the name alone,
    /// so "Next up" is drawn only where there is a day for it to stand beside, whatever the
    /// server's mark says (`friendsRow.noOccurrence`; the accessibility reading can't see a
    /// drawn word on that row, so the rule is tested where the row decides it).
    func testNextUpIsShownOnlyWithADay() {
        let marked = FixtureCast.member(FixtureCast.nina, dated: false)
        XCTAssertTrue(marked.isNextUp, "the fixture marks Nina Next up")
        XCTAssertNil(marked.day)
        XCTAssertFalse(marked.showsNextUp)
        assertReads(row(marked), [Read("Nina.")])
        XCTAssertTrue(FixtureCast.member(FixtureCast.nina).showsNextUp)
        XCTAssertFalse(FixtureCast.member(FixtureCast.ben).showsNextUp)
        XCTAssertFalse(FixtureCast.member(FixtureCast.ben, dated: false).showsNextUp)
    }

    /// The year is visible only where the screen asks; it is always spoken.
    func testTheStandingAloneRowReadsTheSame() {
        assertReads(
            row(FixtureCast.member(FixtureCast.nina, includingYear: true)),
            [
                Read(
                    "Nina. Next up. Saturday, November 7, 2026 at \(seven), New York.",
                    hint: "Open Nina’s Saturday.", isButton: true)
            ])
    }

    /// A row's input is the member as the roster lists them and nothing else: no position,
    /// cover, count, status or anything of a drop (T33, T55).
    func testItsInputHoldsNothingElse() {
        let member = FixtureCast.member(FixtureCast.ben)
        XCTAssertEqual(
            fields(member),
            [
                "name: String", "photo: Optional<Image>", "isViewer: Bool", "isNextUp: Bool",
                "day: Optional<Day>",
            ])
        XCTAssertEqual(
            fields(member.day!),
            ["date: LocalDate", "opensAt: Date", "zone: TimeZone", "includingYear: Bool"])
        // The view holds the member, the phone's zone, the date labels and the action, and no
        // field of its own (the underscored ones are its environment and scaled metrics).
        let view = PersonRow(
            member, device: FixtureCast.zone, labels: FixtureCast.labels, action: {})
        XCTAssertEqual(
            fields(view).filter { !$0.hasPrefix("_") },
            ["member: Member", "device: TimeZone", "labels: DateLabels", "action: () -> ()"])
    }

    private func row(
        _ member: PersonRow.Member, device: TimeZone = FixtureCast.zone
    ) -> some View {
        PersonRow(member, device: device, labels: FixtureCast.labels, action: {})
            .padding(.horizontal, 20)
    }
}
