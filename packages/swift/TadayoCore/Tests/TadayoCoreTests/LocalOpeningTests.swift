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

    /// A phone behind the club reads the opening on an earlier date, and the club's line carries
    /// its date then too: Auckland's Tuesday 10 November opens at 7 AM NZDT, which is 1 PM on
    /// Monday in New York, and Kolkata's opens at 7 AM IST, which is 5:30 PM on Monday in Los
    /// Angeles. (A rule that only a phone ahead of the club differs from would pass every case
    /// above.)
    @Test func aPhoneBehindTheClubReadsAnEarlierDate() throws {
        let auckland = try #require(TimeZone(identifier: "Pacific/Auckland"))
        let aucklandOpening = try #require(
            LocalOpening(
                opensAt: Date(timeIntervalSince1970: 1_794_247_200),
                clubDate: LocalDate(iso: "2026-11-10")!, clubZone: auckland, device: newYork))
        #expect(aucklandOpening.datesDiffer)
        let kolkata = try #require(TimeZone(identifier: "Asia/Kolkata"))
        let losAngeles = try #require(TimeZone(identifier: "America/Los_Angeles"))
        let kolkataOpening = try #require(
            LocalOpening(
                opensAt: Date(timeIntervalSince1970: 1_794_274_200),
                clubDate: LocalDate(iso: "2026-11-10")!, clubZone: kolkata, device: losAngeles))
        #expect(kolkataOpening.datesDiffer)
    }

    /// The phone's zone is read at the instant of the opening, so its daylight saving decides,
    /// not the offset it has when the app runs. New York's Monday 14 June 2027 opens at 7 AM EDT,
    /// 11 PM that Monday in Auckland (NZST, UTC+12): the same date, though Auckland's clocks are
    /// an hour ahead of that for half the year. New York's Saturday 20 March 2027 opens at
    /// midnight on Sunday in Auckland (NZDT, UTC+13): another date.
    @Test func theOffsetAtTheOpeningDecidesNotTheOffsetNow() throws {
        let auckland = try #require(TimeZone(identifier: "Pacific/Auckland"))
        let winter = try #require(
            LocalOpening(
                opensAt: Date(timeIntervalSince1970: 1_812_970_800),
                clubDate: LocalDate(iso: "2027-06-14")!, clubZone: newYork, device: auckland))
        #expect(!winter.datesDiffer)
        let summer = try #require(
            LocalOpening(
                opensAt: Date(timeIntervalSince1970: 1_805_540_400),
                clubDate: LocalDate(iso: "2027-03-20")!, clubZone: newYork, device: auckland))
        #expect(summer.datesDiffer)
    }

    /// On the days Auckland changes its clocks, the clock at the opening decides. Its summer
    /// time ends at 3 AM on Sunday 4 April 2027 (14:00 UTC on the Saturday): New York's Saturday
    /// opens at 11:00 UTC, midnight on Sunday in Auckland, but its Sunday opens at 23:00 that
    /// Sunday there. Its summer time starts at 2 AM on Sunday 26 September 2027 (14:00 UTC on
    /// the Saturday): the Saturday opens at 11 PM that day, the Sunday at midnight on Monday.
    @Test func theDaysAucklandChangesItsClocksAreReadByTheClockAtTheOpening() throws {
        let auckland = try #require(TimeZone(identifier: "Pacific/Auckland"))
        func differs(_ seconds: TimeInterval, _ date: String) throws -> Bool {
            try #require(
                LocalOpening(
                    opensAt: Date(timeIntervalSince1970: seconds),
                    clubDate: LocalDate(iso: date)!, clubZone: newYork, device: auckland)
            ).datesDiffer
        }
        #expect(try differs(1_806_750_000, "2027-04-03"))
        #expect(try !differs(1_806_836_400, "2027-04-04"))
        #expect(try !differs(1_821_870_000, "2027-09-25"))
        #expect(try differs(1_821_956_400, "2027-09-26"))
    }
}
