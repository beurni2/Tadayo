import SwiftUI
import TadayoCore

/// The weekday and date plaque (book p6, p34; handoff 0: 45 by 55 points): the short weekday and
/// the day of the month on the day accent. It grows with the text rather than clipping it.
public struct WeekdayPlaque: View {
    let weekday: String
    let day: String
    let spoken: String

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
        .padding(.horizontal, Spacing.s)
        .padding(.vertical, Spacing.s - 2)
        .frame(
            minWidth: Size.plaque.width, minHeight: Size.plaque.height, alignment: .topLeading
        )
        .background(Palette.accent, in: RoundedRectangle(cornerRadius: Radius.plaque))
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }
}
