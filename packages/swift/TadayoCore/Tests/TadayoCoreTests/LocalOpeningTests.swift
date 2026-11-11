import Foundation
import Testing

@testable import TadayoCore

/// A travelling member's opening (T2; handoff 6's `friendsRow.travelling` and
/// `travellingRows`), in the book's week: Ben's Monday and Nina's Saturday open at 7 AM in New
/// York.
@Suite struct LocalOpeningTests {
    let newYork = TimeZone(identifier: "America/New_York")!
    let monday = Date(timeIntervalSince1970: 1_794_225_600)
    let mondayDate = LocalDate(iso: "2026-11-09")!
    let saturday = Date(timeIntervalSince1970: 1_794_052_800)
    let saturdayDate = LocalDate(iso: "2026-11-07")!

    @Test func theClubsOwnZoneIsNotTravelling() {
        #expect(
            LocalOpening(opensAt: monday, clubDate: mondayDate, clubZone: newYork, device: newYork)
                == nil)
    }

    /// Auckland is a day ahead: Ben's Monday opens on Tuesday at 1 AM there, so both lines carry
    /// their own date (`travellingRows.differentDates`).
    @Test func aucklandIsTheNextDay() throws {
        let auckland = try #require(TimeZone(identifier: "Pacific/Auckland"))
        let ben = try #require(
            LocalOpening(opensAt: monday, clubDate: mondayDate, clubZone: newYork, device: auckland)
        )
        #expect(ben.zone.identifier == "Pacific/Auckland")
        #expect(ben.datesDiffer)
        let nina = try #require(
            LocalOpening(
                opensAt: saturday, clubDate: saturdayDate, clubZone: newYork, device: auckland))
        #expect(nina.datesDiffer)
    }

    /// London is the same date at noon, so the club's line carries no date
    /// (`handoff5.friends.date.club`; INVENTORY's X-11).
    @Test func londonIsTheSameDate() throws {
        let london = try #require(TimeZone(identifier: "Europe/London"))
        let nina = try #require(
            LocalOpening(
                opensAt: saturday, clubDate: saturdayDate, clubZone: newYork, device: london))
        #expect(!nina.datesDiffer)
    }

    /// Zones are compared by their IANA identifiers, never by their offsets: Toronto keeps New
    /// York's offset all year but is another zone (handoff 6's `localTimesSheet.selection`).
    @Test func anotherZoneWithTheSameOffsetIsTravelling() throws {
        let toronto = try #require(TimeZone(identifier: "America/Toronto"))
        #expect(toronto.secondsFromGMT(for: monday) == newYork.secondsFromGMT(for: monday))
        let ben = try #require(
            LocalOpening(opensAt: monday, clubDate: mondayDate, clubZone: newYork, device: toronto))
        #expect(!ben.datesDiffer)
    }

    /// The year's last day opens on New Year's Day in Auckland: the dates differ, and the screen
    /// gives both lines their year (FQ44; `DateLabelsTests`).
    @Test func theYearsEndIsAnotherDate() throws {
        let auckland = try #require(TimeZone(identifier: "Pacific/Auckland"))
        let lastDay = try #require(
            LocalOpening(
                opensAt: Date(timeIntervalSince1970: 1_798_718_400),
                clubDate: LocalDate(iso: "2026-12-31")!, clubZone: newYork, device: auckland))
        #expect(lastDay.datesDiffer)
    }

    /// Midnight in the device's zone decides: 8 PM on Monday in London is 1:30 AM on Tuesday in
    /// Kolkata, and a second before Kolkata's midnight is still Monday there.
    @Test func justAfterMidnightWhereThePhoneIsIsTheNextDate() throws {
        let kolkata = try #require(TimeZone(identifier: "Asia/Kolkata"))
        let london = try #require(TimeZone(identifier: "Europe/London"))
        // 20:00 UTC on 9 November 2026 is 8 PM in London and 1:30 AM on the 10th in Kolkata.
        let evening = Date(timeIntervalSince1970: 1_794_254_400)
        let kolkataNight = try #require(
            LocalOpening(opensAt: evening, clubDate: mondayDate, clubZone: london, device: kolkata))
        #expect(kolkataNight.datesDiffer)
        let justBefore = try #require(
            LocalOpening(
                opensAt: evening.addingTimeInterval(-5401), clubDate: mondayDate, clubZone: london,
                device: kolkata))
        #expect(!justBefore.datesDiffer)
    }
}
