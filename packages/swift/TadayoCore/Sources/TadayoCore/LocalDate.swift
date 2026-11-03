import Foundation

/// A calendar date with no time and no zone: an occurrence's `local_date` (spec 31), which the
/// server sends as `YYYY-MM-DD`. A person's day is a date in the club's zone, so it is never
/// converted through the device's zone (T1, T41).
public struct LocalDate: Hashable, Comparable, Sendable, Codable, CustomStringConvertible {
    public let year: Int
    public let month: Int
    public let day: Int

    /// Nil unless the three numbers name a real date in the Gregorian calendar.
    public init?(year: Int, month: Int, day: Int) {
        guard (1...9999).contains(year), (1...12).contains(month), day >= 1,
            day <= LocalDate.days(inMonth: month, year: year)
        else { return nil }
        self.year = year
        self.month = month
        self.day = day
    }

    /// Reads exactly `YYYY-MM-DD`, as the contract sends it; anything else is nil.
    public init?(iso: String) {
        let parts = iso.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
            parts.allSatisfy({ $0.allSatisfy(\.isASCII) && $0.allSatisfy(\.isNumber) }),
            let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2])
        else { return nil }
        self.init(year: y, month: m, day: d)
    }

    public var iso: String {
        String(format: "%04d-%02d-%02d", year, month, day)
    }

    public var description: String { iso }

    public static func < (lhs: LocalDate, rhs: LocalDate) -> Bool {
        (lhs.year, lhs.month, lhs.day) < (rhs.year, rhs.month, rhs.day)
    }

    /// Noon UTC on this date, so a formatter set to UTC writes this date and no other.
    var noonUTC: Date {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = 12
        return LocalDate.utcCalendar.date(from: components)!
    }

    static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    private static func days(inMonth month: Int, year: Int) -> Int {
        switch month {
        case 2:
            let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
            return leap ? 29 : 28
        case 4, 6, 9, 11: return 30
        default: return 31
        }
    }

    public init(from decoder: Decoder) throws {
        let text = try decoder.singleValueContainer().decode(String.self)
        guard let date = LocalDate(iso: text) else {
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Not a YYYY-MM-DD date"))
        }
        self = date
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(iso)
    }
}
