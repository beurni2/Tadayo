import Foundation

/// The exact-date labels every screen uses (T41; book p8: "Never rely on a weekday alone").
///
/// FQ44's default: the phone's own region and 12- or 24-hour setting, through iOS's date
/// templates, with the weekday and the month always written as words, never numbers. So a US
/// iPhone writes "Friday, November 13" and "7 AM", and a UK one "Friday 13 November" and
/// "07:00". The snapshot tests fix one region, handoff 3's: en-US, 12-hour, America/New_York.
/// Changing the policy later touches only this type.
public struct DateLabels: Sendable {
    public let locale: Locale

    public init(locale: Locale = .autoupdatingCurrent) {
        self.locale = locale
    }

    /// "Friday, November 13" (en-US), "Friday 13 November" (en-GB). With the year, for a date
    /// that starts something, such as a schedule (handoff 3: "Exact start dates include year").
    public func fullDate(_ date: LocalDate, includingYear: Bool = false) -> String {
        format(date, template: includingYear ? "EEEEdMMMMy" : "EEEEdMMMM")
    }

    /// "Fri, Nov 13" (en-US), "Fri 13 Nov" (en-GB): where a full date doesn't fit, as in a card's
    /// "Opens Fri 13 Nov".
    public func shortDate(_ date: LocalDate) -> String {
        format(date, template: "EEEdMMM")
    }

    /// The weekday alone, "Friday", only beside a full date or in a name such as "Debby's
    /// Friday" (spec 03), never as the only date.
    public func weekday(_ date: LocalDate) -> String {
        format(date, template: "EEEE")
    }

    /// The two lines of the day plaque (book p6, p34): the short weekday in capitals and the day
    /// of the month, "FRI" and "06".
    public func plaque(_ date: LocalDate) -> (weekday: String, day: String) {
        (format(date, template: "EEE").uppercased(with: locale), format(date, template: "dd"))
    }

    /// The person's day, as spec 03 names it: "Debby's Friday". The name is never replaced by a
    /// pronoun (T42).
    public func personDay(name: String, date: LocalDate) -> String {
        "\(name)'s \(weekday(date))"
    }

    /// The time of an instant in the club's zone: "7 AM" on a 12-hour phone, with the minutes only
    /// when they aren't zero ("1:30 AM"); "07:00" on a 24-hour phone.
    public func time(_ instant: Date, in zone: TimeZone) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let minute = calendar.component(.minute, from: instant)
        let template = (uses24HourClock || minute != 0) ? "jmm" : "j"
        let formatter = makeFormatter(template: template)
        formatter.timeZone = zone
        return formatter.string(from: instant)
    }

    /// Whether the phone writes times on a 24-hour clock.
    public var uses24HourClock: Bool {
        let pattern = DateFormatter.dateFormat(fromTemplate: "j", options: 0, locale: locale) ?? ""
        return pattern.contains("H") || pattern.contains("k")
    }

    private func format(_ date: LocalDate, template: String) -> String {
        let formatter = makeFormatter(template: template)
        formatter.timeZone = TimeZone(identifier: "UTC")!
        return formatter.string(from: date.noonUTC)
    }

    private func makeFormatter(template: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter
    }
}
