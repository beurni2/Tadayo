import SwiftUI
import TadayoCore

/// The day header (book p34: "The day header combines person, exact date and availability"), in
/// its two forms.
///
/// **Collecting** (`collecting`), as F02 draws it (handoff 0's and 2.1's `F02-upcoming`, 2.1's
/// `F02-added`): the weekday plaque, then the date in `dateTitle` 25/29 `primaryText` over the
/// opening line in `metadata` 13/18 `secondaryText`, "Opens at 7 AM, New York". The person is the
/// screen's navigation title, "Debby’s Friday" (INVENTORY's F02 note), so the header doesn't
/// repeat them. No handoff gives its geometry, so it is 2.1's at the nearest steps (FQ40): the
/// words 12 after the plaque (handoff 0 draws 15), the title's top level with the plaque's, the
/// opening line 4 under the title. At the accessibility sizes the plaque, which grows with the
/// text, sits 8 above the words, so the date keeps the whole width rather than breaking inside a
/// word: built from spec, by analogy with handoff 3's `largeTextHeader`.
///
/// **Open** (`open`), as Home draws the day while it is open (handoff 0's `H01-open`, 2.1's
/// `H01-open` and `H01-your-day`): the date in capitals, the day's title in `dayTitle` 31/34
/// `primaryText`, "Debby’s Friday", or "Your Monday" for the star themselves (handoff 6's
/// `selfName`, where 2.1 draws "It’s your Monday."), and "Until 1 AM · Kept in Memories" in
/// `metadata` `secondaryText`, 4 between each. The capitals take `eyebrow` 13/18 bold
/// `secondaryText`, the brand's line above a title (handoff 2), where handoff 0 draws 11: no role
/// is delivered for them. 2.1's 44-point photo of the star is left out, as handoff 0 draws it,
/// until a size and an initial for it are delivered (revision 1.1's avatars are 68, 36, 28 and
/// 18). Each is the ios lane's reading, on its needs list.
///
/// VoiceOver finds one heading (FQ92): the collecting form reads its date and opening as one
/// opening, "Opens Friday, November 13, 2026 at 7 AM, New York."; the open form reads its words
/// in order, each date in full: "Friday, November 6, 2026. Debby’s Friday. Until Saturday,
/// November 7, 2026 at 1 AM, New York. Kept in Memories." The plaque isn't read again.
public struct DayHeader: View {
    /// A day that is open now, from the server: its star, its date, and the instant it closes in
    /// the club's zone (`close_at`; T1).
    public struct OpenDay: Sendable {
        public let star: String
        /// Whether the star is the viewer, whose day reads "Your Monday" (handoff 6's `selfName`).
        public let isViewer: Bool
        public let date: LocalDate
        public let closesAt: Date
        public let zone: TimeZone
        /// Whether the visible date shows its year: the screen decides (FQ44). Spoken dates
        /// always carry it.
        public let includingYear: Bool

        public init(
            star: String, isViewer: Bool, date: LocalDate, closesAt: Date, zone: TimeZone,
            includingYear: Bool
        ) {
            self.star = star
            self.isViewer = isViewer
            self.date = date
            self.closesAt = closesAt
            self.zone = zone
            self.includingYear = includingYear
        }
    }

    enum Form {
        case collecting(Occasion)
        case open(OpenDay)
    }

    let form: Form
    let labels: DateLabels
    @Environment(\.dynamicTypeSize) private var typeSize

    /// The collecting day's header, on F02.
    public init(collecting occasion: Occasion, labels: DateLabels) {
        form = .collecting(occasion)
        self.labels = labels
    }

    /// The open day's header, on Home.
    public init(open day: OpenDay, labels: DateLabels) {
        form = .open(day)
        self.labels = labels
    }

    public var body: some View {
        Group {
            switch form {
            case .collecting(let occasion): collecting(occasion)
            case .open(let day): open(day)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: spoken))
        .accessibilityAddTraits(.isHeader)
    }

    private func collecting(_ occasion: Occasion) -> some View {
        let layout =
            typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.s))
            : AnyLayout(HStackLayout(alignment: .top, spacing: Spacing.m))
        return layout {
            WeekdayPlaque(date: occasion.date, labels: labels)
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text(
                    verbatim: labels.fullDate(occasion.date, includingYear: occasion.includingYear)
                )
                .textRole(.dateTitle)
                .foregroundStyle(Palette.primaryText)
                Text(
                    verbatim: String(
                        format: String(localized: "day.opens", bundle: .module),
                        labels.time(occasion.opensAt, in: occasion.zone),
                        labels.zoneName(occasion.zone))
                )
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func open(_ day: OpenDay) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(verbatim: labels.fullDateInCapitals(day.date, includingYear: day.includingYear))
                .textRole(.eyebrow)
                .foregroundStyle(Palette.secondaryText)
            Text(verbatim: title(day))
                .textRole(.dayTitle)
                .foregroundStyle(Palette.primaryText)
            Text(
                verbatim: String(
                    format: String(localized: "day.until", bundle: .module),
                    labels.time(day.closesAt, in: day.zone))
            )
            .textRole(.metadata)
            .foregroundStyle(Palette.secondaryText)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func title(_ day: OpenDay) -> String {
        day.isViewer
            ? String(
                format: String(localized: "occasion.self", bundle: .module),
                labels.weekday(day.date))
            : labels.personDay(name: day.star, date: day.date)
    }

    private var spoken: String {
        switch form {
        case .collecting(let occasion):
            return String(
                format: String(localized: "opens.vo", bundle: .module),
                Spoken.opening(occasion, labels))
        case .open(let day):
            return Spoken.sentences([
                labels.fullDate(day.date, includingYear: true), title(day),
                String(
                    format: String(localized: "day.until.vo", bundle: .module),
                    labels.fullDateTime(day.closesAt, in: day.zone), labels.zoneName(day.zone)),
            ])
        }
    }
}
