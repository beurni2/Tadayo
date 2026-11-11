import Foundation

/// Whether a member is reading an occurrence's opening away from the club's zone (T2: "A member
/// who is travelling sees the local equivalent, with the club's zone available"; handoff 6's
/// `travellingRows`), and if so, whether the opening falls on another date where they are, which
/// decides whether the club's line carries its date too (`travellingRows.differentDates`). Both
/// come from the server's `reveal_at` and `local_date` and the two zones, never from the device's
/// clock (T1); the local date itself is written by `DateLabels.fullDate(of:in:includingYear:)`.
public struct LocalOpening: Sendable, Equatable {
    /// The device's zone.
    public let zone: TimeZone
    /// Whether the opening falls on another date in the device's zone than the occurrence's
    /// own date in the club's zone.
    public let datesDiffer: Bool

    /// Nil when the device is in the club's zone. Zones are compared by their IANA identifiers,
    /// never by their offsets (handoff 6's `localTimesSheet.selection`: "Compare IANA zone
    /// identifiers, not current UTC offsets; different zones may currently share an offset";
    /// IMPLEMENTATION.md: "Travelling changes the IANA device zone").
    public init?(opensAt: Date, clubDate: LocalDate, clubZone: TimeZone, device: TimeZone) {
        guard device.identifier != clubZone.identifier else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = device
        let local = calendar.dateComponents([.year, .month, .day], from: opensAt)
        zone = device
        datesDiffer =
            (local.year, local.month, local.day) != (clubDate.year, clubDate.month, clubDate.day)
    }
}
