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

    /// The open day's header draws its date in capitals, in the phone's region (FQ44).
    @Test func fullDateInCapitalsIsTheFullDateUpperCased() {
        let sixth = LocalDate(iso: "2026-11-06")!
        #expect(us.fullDateInCapitals(sixth) == "FRIDAY, NOVEMBER 6")
        #expect(uk.fullDateInCapitals(sixth) == "FRIDAY 6 NOVEMBER")
        #expect(us.fullDateInCapitals(sixth, includingYear: true) == "FRIDAY, NOVEMBER 6, 2026")
    }

    /// The date an instant falls on in a zone: Ben's Monday opens at 7 AM in New York (12:00
    /// UTC on 9 November 2026), which is 1 AM on Tuesday in Auckland and noon on Monday in
    /// London; Nina's Saturday is Sunday in Auckland (handoff 6's travelling frames).
    @Test func fullDateOfAnInstantIsItsDateInThatZone() throws {
        let monday = Date(timeIntervalSince1970: 1_794_225_600)
        let saturday = Date(timeIntervalSince1970: 1_794_052_800)
        let auckland = try #require(TimeZone(identifier: "Pacific/Auckland"))
        #expect(us.fullDate(of: monday, in: auckland) == "Tuesday, November 10")
        #expect(us.fullDate(of: monday, in: london) == "Monday, November 9")
        #expect(us.fullDate(of: monday, in: newYork) == "Monday, November 9")
        #expect(us.fullDate(of: saturday, in: auckland) == "Sunday, November 8")
        #expect(uk.fullDate(of: monday, in: auckland) == "Tuesday 10 November")
        #expect(
            us.fullDate(of: monday, in: auckland, includingYear: true)
                == "Tuesday, November 10, 2026")
        // As with fullDate, CLDR's en-GB pattern with a year has changed between ICU releases.
        let ukYear = uk.fullDate(of: monday, in: auckland, includingYear: true)
        #expect(ukYear.hasPrefix("Tuesday") && ukYear.hasSuffix("10 November 2026"))
    }

    /// Midnight belongs to the day it starts, in the zone's own clock across a change of
    /// offset: New York left daylight time at 2 AM on 1 November 2026, London on 25 October.
    @Test func fullDateOfAnInstantReadsMidnightInTheZonesOwnClock() {
        // Midnight starting 1 November in New York is 04:00 UTC (still daylight time, UTC-4);
        // midnight starting 2 November is 05:00 UTC (standard time, UTC-5).
        let first = Date(timeIntervalSince1970: 1_793_505_600)
        #expect(us.fullDate(of: first, in: newYork) == "Sunday, November 1")
        #expect(
            us.fullDate(of: first.addingTimeInterval(-1), in: newYork) == "Saturday, October 31")
        let second = Date(timeIntervalSince1970: 1_793_595_600)
        #expect(us.fullDate(of: second, in: newYork) == "Monday, November 2")
        #expect(us.fullDate(of: second.addingTimeInterval(-1), in: newYork) == "Sunday, November 1")
        // Midnight starting 26 October in London is 00:00 UTC (GMT after the change).
        let october = Date(timeIntervalSince1970: 1_792_972_800)
        #expect(us.fullDate(of: october, in: london) == "Monday, October 26")
        #expect(us.fullDate(of: october.addingTimeInterval(-1), in: london) == "Sunday, October 25")
    }

    /// A day at the year's end opens in the next year where the phone is: 7 AM on Thursday 31
    /// December 2026 in New York is 1 AM on Friday 1 January 2027 in Auckland, so the screen
    /// must write the year on both lines (FQ44: "when the dates shown cross a year … Both zones'
    /// times follow the same rule").
    @Test func fullDateOfAnInstantCanCrossTheYear() throws {
        let auckland = try #require(TimeZone(identifier: "Pacific/Auckland"))
        let lastDay = Date(timeIntervalSince1970: 1_798_718_400)
        #expect(
            us.fullDate(of: lastDay, in: newYork, includingYear: true)
                == "Thursday, December 31, 2026")
        #expect(
            us.fullDate(of: lastDay, in: auckland, includingYear: true) == "Friday, January 1, 2027"
        )
    }

    @Test func dayMonthKeepsTheMonthInWords() {
        #expect(us.dayMonth(friday) == "November 13")
        #expect(uk.dayMonth(friday) == "13 November")
        #expect(us.dayMonth(friday, includingYear: true) == "November 13, 2026")
        #expect(uk.dayMonth(friday, includingYear: true) == "13 November 2026")
    }

    @Test func zoneNameIsTheCity() {
        #expect(us.zoneName(newYork) == "New York")
        #expect(us.zoneName(london) == "London")
        #expect(us.zoneName(TimeZone(identifier: "Pacific/Auckland")!) == "Auckland")
        #expect(
            us.zoneName(TimeZone(identifier: "America/Argentina/Buenos_Aires")!) == "Buenos Aires")
        // A zone with no city goes by its generic name, never ICU's "Unknown City": one with no
        // region in its id, and one of the Etc/ zones. Linux tests use canonical ids only: its
        // Foundation traps on a legacy alias such as US/Eastern (docs/LIMITATIONS.md).
        for id in ["UTC", "Etc/GMT+5"] {
            let name = us.zoneName(TimeZone(identifier: id)!)
            #expect(!name.isEmpty && !name.contains("Unknown"), "\(id): \(name)")
        }
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

    /// The club's hours, as the phone writes times (`ClubHours`, Club details' Schedule row and
    /// the members list's footer): no date and no zone of their own.
    @Test func clockHourIsAWholeHourAsThePhoneWritesTimes() {
        #expect(us.clockHour(ClubHours.opening) == "7\(space)AM")
        #expect(us.clockHour(ClubHours.closing) == "1\(space)AM")
        #expect(uk.clockHour(ClubHours.opening) == "07:00")
        #expect(uk.clockHour(ClubHours.closing) == "01:00")
    }

    /// A member's weekday in the members list: the day's own name, in the phone's language.
    @Test func weekdayIsTheDaysStandaloneName() {
        #expect(
            Weekday.allCases.map(us.weekday) == [
                "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
            ])
        #expect(DateLabels(locale: Locale(identifier: "fr_FR")).weekday(.monday) == "lundi")
    }

    @Test func fullDateTimeIsTheRegionsOwnForm() {
        let seven = Date(timeIntervalSince1970: 1_794_571_200)
        #expect(us.fullDateTime(seven, in: newYork) == "Friday, November 13, 2026 at 7\(space)AM")
        let half = seven.addingTimeInterval(-5.5 * 3600)  // 1:30 AM in New York, the same day
        #expect(us.fullDateTime(half, in: newYork) == "Friday, November 13, 2026 at 1:30\(space)AM")
        // The date is the instant's in the club's zone: 7 AM in New York is noon in London, and
        // 1:30 AM on the 13th in New York is still the 12th in Los Angeles.
        #expect(us.fullDateTime(seven, in: london) == "Friday, November 13, 2026 at 12\(space)PM")
        let losAngeles = TimeZone(identifier: "America/Los_Angeles")!
        #expect(us.fullDateTime(half, in: losAngeles).hasPrefix("Thursday, November 12, 2026 at"))
        // CLDR's en-GB date-and-time pattern has changed between ICU releases, so only its parts
        // are checked: the words, the year, and the time on a 24-hour clock with its minutes.
        let ukSeven = uk.fullDateTime(seven, in: newYork)
        #expect(ukSeven.hasPrefix("Friday") && ukSeven.contains("13 November 2026"))
        #expect(ukSeven.hasSuffix("07:00"))
    }
}

/// A local_date is the club's date, written as that date wherever the phone is (T41). These run
/// one at a time, each with the process's default zone set to one far ahead of UTC and restored
/// after: in ci's UTC container a formatter that followed the device's zone would still pass.
/// Zones behind UTC add nothing, since the date is formatted at noon UTC. Kolkata is half an hour
/// off New York's minutes, so a time whose minutes were read in the phone's zone fails there.
@Suite(.serialized) struct DateLabelsDeviceZoneTests {
    let us = DateLabels(locale: Locale(identifier: "en_US"))

    @Test(arguments: ["Pacific/Kiritimati", "Pacific/Auckland", "Asia/Kolkata"])
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
        #expect(us.dayMonth(friday) == "November 13")
        #expect(us.fullDateInCapitals(friday) == "FRIDAY, NOVEMBER 13")
        // An opening is written in the club's zone, whatever the phone's.
        let seven = Date(timeIntervalSince1970: 1_794_571_200)
        let newYork = try #require(TimeZone(identifier: "America/New_York"))
        // A date of an instant is the instant's in the zone given, never the phone's.
        let mondaySeven = Date(timeIntervalSince1970: 1_794_225_600)
        #expect(us.fullDate(of: mondaySeven, in: newYork) == "Monday, November 9")
        #expect(us.fullDateTime(seven, in: newYork) == "Friday, November 13, 2026 at 7\u{202F}AM")
        #expect(us.time(seven, in: newYork) == "7\u{202F}AM")
        let half = seven.addingTimeInterval(-5.5 * 3600)  // 1:30 AM in New York
        #expect(us.time(half, in: newYork) == "1:30\u{202F}AM")
        #expect(
            us.fullDateTime(half, in: newYork) == "Friday, November 13, 2026 at 1:30\u{202F}AM")
    }
}
