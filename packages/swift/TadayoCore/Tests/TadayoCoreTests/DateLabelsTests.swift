import Foundation
import Testing

@testable import TadayoCore

@Suite struct DateLabelsTests {
    let us = DateLabels(locale: Locale(identifier: "en_US"))
    let uk = DateLabels(locale: Locale(identifier: "en_GB"))
    let friday = LocalDate(iso: "2026-11-13")!
    let newYork = TimeZone(identifier: "America/New_York")!
    let london = TimeZone(identifier: "Europe/London")!

    @Test func fullDateFollowsTheRegionWithWords() {
        #expect(us.fullDate(friday) == "Friday, November 13")
        #expect(uk.fullDate(friday) == "Friday 13 November")
        #expect(us.fullDate(friday, includingYear: true) == "Friday, November 13, 2026")
        // CLDR's en-GB pattern with a year has changed between ICU releases ("Friday 13 November
        // 2026", "Friday, 13 November 2026"), so only its words are checked.
        let ukYear = uk.fullDate(friday, includingYear: true)
        #expect(ukYear.hasPrefix("Friday") && ukYear.hasSuffix("13 November 2026"))
    }

    @Test func shortDateKeepsWords() {
        #expect(us.shortDate(friday) == "Fri, Nov 13")
        #expect(uk.shortDate(friday) == "Fri 13 Nov")
    }

    @Test func plaqueAndPersonDay() {
        let sixth = LocalDate(iso: "2026-11-06")!
        #expect(us.plaque(sixth) == ("FRI", "06"))
        #expect(us.personDay(name: "Debby", date: friday) == "Debby’s Friday")
    }

    // ICU, on iOS and on Linux, puts a narrow no-break space before AM and PM.
    let space = "\u{202F}"

    @Test func timeFollowsTheClockSetting() {
        // 7 AM in New York on Friday 13 November 2026 is 12:00 UTC.
        let seven = Date(timeIntervalSince1970: 1_794_571_200)
        #expect(us.time(seven, in: newYork) == "7\(space)AM")
        #expect(uk.time(seven, in: newYork) == "07:00")
        #expect(us.time(seven, in: london) == "12\(space)PM")
        let half = seven.addingTimeInterval(-5.5 * 3600)  // 1:30 AM in New York
        #expect(us.time(half, in: newYork) == "1:30\(space)AM")
        #expect(!us.uses24HourClock)
        #expect(uk.uses24HourClock)
    }
}

/// A local_date is the club's date, written as that date wherever the phone is (T41). These run
/// one at a time, each with the process's default zone set to one far ahead of UTC and restored
/// after: in ci's UTC container a formatter that followed the device's zone would still pass.
/// Zones behind UTC add nothing, since the date is formatted at noon UTC.
@Suite(.serialized) struct DateLabelsDeviceZoneTests {
    let us = DateLabels(locale: Locale(identifier: "en_US"))

    @Test(arguments: ["Pacific/Kiritimati", "Pacific/Auckland"])
    func datesNeverMoveWithTheDevicesZone(zone: String) throws {
        let saved = NSTimeZone.default
        NSTimeZone.default = try #require(TimeZone(identifier: zone))
        defer { NSTimeZone.default = saved }

        #expect(us.fullDate(LocalDate(iso: "2026-01-01")!) == "Thursday, January 1")
        let friday = LocalDate(iso: "2026-11-13")!
        #expect(us.fullDate(friday) == "Friday, November 13")
        #expect(us.shortDate(friday) == "Fri, Nov 13")
        #expect(us.plaque(LocalDate(iso: "2026-11-06")!) == ("FRI", "06"))
        #expect(us.personDay(name: "Debby", date: friday) == "Debby’s Friday")
    }
}
