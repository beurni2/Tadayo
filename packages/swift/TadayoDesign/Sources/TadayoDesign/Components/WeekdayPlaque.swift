import SwiftUI
import TadayoCore

/// The weekday and date plaque (book p6, p34): the short weekday and the day of the month on the
/// day accent. It is 45 by 55 points at the default text size (handoff 4's
/// `componentGeometry.dayPlaque`) and grows with the day's text style, so every date gets the same
/// plaque; it is never narrower than its text. The two lines sit 8 points from its leading edge,
/// as the sheet draws them, and centred vertically.
public struct WeekdayPlaque: View {
    let weekday: String
    let day: String
    let spoken: String
    @ScaledMetric(relativeTo: TypeRole.plaqueDay.textStyle) private var width = Size.plaque.width
    @ScaledMetric(relativeTo: TypeRole.plaqueDay.textStyle) private var height = Size.plaque.height

    /// - Parameter spoken: the full date VoiceOver reads, such as "Friday, November 6": never
    ///   the plaque's abbreviations alone (T41, T47).
    public init(weekday: String, day: String, spoken: String) {
        self.weekday = weekday
        self.day = day
        self.spoken = spoken
    }

    public init(date: LocalDate, labels: DateLabels) {
        let plaque = labels.plaque(date)
        self.init(weekday: plaque.weekday, day: plaque.day, spoken: labels.fullDate(date))
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(weekday).textRole(.plaqueWeekday)
            Text(day).textRole(.plaqueDay)
        }
        .foregroundStyle(Palette.onAccent)
        .padding(.leading, Spacing.s)
        .frame(minWidth: width, minHeight: height, alignment: .leading)
        .background(Palette.accent, in: RoundedRectangle(cornerRadius: Radius.plaque))
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }
}
