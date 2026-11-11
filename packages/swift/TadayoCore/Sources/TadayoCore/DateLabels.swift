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

    /// "November 13" (en-US), "13 November" (en-GB): the day and the month in words, where the
    /// weekday is already said beside it, as in an upload's "For Debby’s Friday" over
    /// "November 13 · 7 AM" (2.1's `C07-uploading` and `F02-added`, in the phone's own form).
    /// With the year when the screen asks for it.
    public func dayMonth(_ date: LocalDate, includingYear: Bool = false) -> String {
        format(date, template: includingYear ? "dMMMMy" : "dMMMM")
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

    /// The person's day, as spec 03 names it: "Debby’s Friday", with the book's curly apostrophe.
    /// The name is never replaced by a pronoun (T42).
    public func personDay(name: String, date: LocalDate) -> String {
        "\(name)’s \(weekday(date))"
    }

    /// The time of an instant in the club's zone: "7 AM" on a 12-hour phone, with the minutes only
    /// when they aren't zero ("1:30 AM"); "07:00" on a 24-hour phone.
    public func time(_ instant: Date, in zone: TimeZone) -> String {
        let formatter = makeFormatter(template: timeTemplate(instant, in: zone))
        formatter.timeZone = zone
        return formatter.string(from: instant)
    }

    /// An instant's full date and time in the club's zone, with the year, as handoff 5's
    /// `{fullDateTime}` reads in every spoken template (`card.status.vo`: "Opens Friday,
    /// November 13, 2026 at 7 AM, New York. Hidden content."; FQ44: every spoken full date has
    /// its year). The region writes the whole form, its joining word included: "Friday,
    /// November 13, 2026 at 7 AM" (en-US), "Friday 13 November 2026 at 07:00" (en-GB). The time
    /// follows `time(_:in:)`'s rule. The date is the instant's in that zone, so for an opening
    /// it is the occurrence's own date: `reveal_at` is 7 AM on `local_date` there (T1, T2).
    public func fullDateTime(_ instant: Date, in zone: TimeZone) -> String {
        let formatter = makeFormatter(template: "EEEEdMMMMy" + timeTemplate(instant, in: zone))
        formatter.timeZone = zone
        return formatter.string(from: instant)
    }

    /// The name a zone goes by, as handoff 5's `{clubZoneName}` reads: "New York" for
    /// America/New_York, "London" for Europe/London. It is ICU's exemplar city, in the phone's
    /// language. A zone that names no city, such as UTC, goes by its generic name instead.
    public func zoneName(_ zone: TimeZone) -> String {
        let id = zone.identifier
        guard id.contains("/"), !id.hasPrefix("Etc/") else {
            return zone.localizedName(for: .generic, locale: locale) ?? id
        }
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = zone
        formatter.dateFormat = "VVV"
        return formatter.string(from: Date(timeIntervalSince1970: 0))
    }

    /// "j" for "7 AM", "jmm" for "1:30 AM" or a 24-hour phone's "07:00": the minutes are written
    /// only when they aren't zero, or when the clock is 24-hour ("j" alone writes "07" there).
    private func timeTemplate(_ instant: Date, in zone: TimeZone) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let minute = calendar.component(.minute, from: instant)
        return (uses24HourClock || minute != 0) ? "jmm" : "j"
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
