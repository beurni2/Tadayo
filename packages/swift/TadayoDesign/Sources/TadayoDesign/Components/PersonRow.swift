import SwiftUI
import TadayoCore

/// One member in a club's roster (spec 09: "Each row has an avatar, name and next reveal date";
/// book p7, p13), as handoff 6's `friendsRow` draws it: the 36-point avatar, the name in `row`
/// 17/22 `primaryText` ("Ben · You" for the viewer, handoff 3's `youLabel`), the next day's date
/// and time in `metadata` 13/18 `secondaryText`, "Next up" in `nextUp` 13/18 when the server marks
/// it (`Member.next_up`, "the member whose day opens first": never a rank or an activity), and a
/// chevron, the whole row one button to that occurrence (`navigationAndTargets.friendsRow`).
///
/// A member with no day yet shows the name and the avatar alone, at least 52 high, with no date,
/// status, placeholder, chevron or tap action (`friendsRow.noOccurrence`; FQ48). Away from the
/// club's zone, the row reads the opening in the phone's zone first and the club's beneath, with
/// the club's date too when the two dates differ (`friendsRow.travelling`; T2).
///
/// Its geometry is the contract's: at least 68 high (a travelling row at least 100, as the
/// contract's fixture), the words 49 from the leading edge, a 1-point `separator` under the row
/// from 49 to the trailing edge, drawn by the row on every row as the frames draw it, and the
/// chevron's 20-point box. What it doesn't name is built from handoff 6's frames and sheet (the
/// ios lane's needs list): 12 above the words (8 on a row with no day, whose 36-point avatar and
/// padding then make its 52), the lines 4 apart; the chevron's box 4 in from the
/// trailing edge (the sheet draws 2) and 12 after the words (the sheet draws about 14), its glyph
/// growing with the text as the Private drafts row's does; the avatar's top meeting the name's,
/// as the frames draw it, until the name's first line outgrows it and from then level with that
/// line (`friendsRow.AX5`: "Avatar aligns to first line"), and the chevron keeping the avatar's
/// middle. A row with no date centres its avatar on the name's first line (`noOccurrence`:
/// "vertically centered"). Next up sits beside the name while both fit on one line, and under
/// it otherwise and at every accessibility size (`nextUpLabel.largeText`: "Own leading-aligned
/// line, before the date"). The avatar keeps its size (`dynamicTypePolicy.avatarMarks`). No
/// delivery draws the row pressed: it looks the same.
///
/// VoiceOver finds one element (handoff 5's `friends.row.vo`, handoff 6's `friends.row.hint`):
/// "Nina. Next up. Saturday, November 7, 2026 at 7 AM, New York.", hinted "Open Nina’s
/// Saturday.", a button; a member with no day reads "Debby." alone, with no hint and no trait.
public struct PersonRow: View {
    /// The member's next collecting occurrence, from the server (`Member.next_day`): its date
    /// and its opening in the club's zone (T1).
    public struct Day: Sendable {
        public let date: LocalDate
        public let opensAt: Date
        public let zone: TimeZone
        /// Whether visible dates show the year: the screen decides (FQ44; handoff 6's
        /// `travellingRows.targetYear`). Spoken dates always carry it.
        public let includingYear: Bool

        public init(date: LocalDate, opensAt: Date, zone: TimeZone, includingYear: Bool) {
            self.date = date
            self.opensAt = opensAt
            self.zone = zone
            self.includingYear = includingYear
        }
    }

    /// A member as the roster lists them: the bare display name, their own profile photo, if any,
    /// whether they are the viewer, whether the server marks them Next up, and their next day.
    /// Nothing else: no position (the screen keeps the server's order), no cover, no counts, and
    /// nothing of any drop.
    public struct Member: Sendable {
        public let name: String
        public let photo: Image?
        public let isViewer: Bool
        public let isNextUp: Bool
        public let day: Day?

        public init(name: String, photo: Image?, isViewer: Bool, isNextUp: Bool, day: Day?) {
            self.name = name
            self.photo = photo
            self.isViewer = isViewer
            self.isNextUp = isNextUp
            self.day = day
        }

        /// Whether the row says "Next up": the server's mark, on a member whose day the row
        /// shows. A member with no day yet is the name and the avatar alone
        /// (`friendsRow.noOccurrence`: "no date, status, placeholder, chevron or tap action"), and
        /// VoiceOver reads that row as the name alone, so a word drawn there would be seen and
        /// never heard.
        public var showsNextUp: Bool { isNextUp && day != nil }
    }

    let member: Member
    let device: TimeZone
    let labels: DateLabels
    let action: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var nameSize = TypeRole.row.size
    @ScaledMetric(relativeTo: TypeRole.row.textStyle)
    private var chevronBox = Size.personRowChevronBox
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var chevron = Size.personRowChevron

    /// - Parameter device: the phone's zone, which decides whether the member's day is read
    ///   where the phone is as well as in the club's zone.
    public init(
        _ member: Member, device: TimeZone, labels: DateLabels, action: @escaping () -> Void
    ) {
        self.member = member
        self.device = device
        self.labels = labels
        self.action = action
    }

    public var body: some View {
        if let day = member.day {
            Button(action: action) {
                row(dated: true) { dateLines(day) }
            }
            .buttonStyle(UnchangedWhenPressed())
            .accessibilityLabel(Text(verbatim: spoken(day)))
            .accessibilityHint(Text(verbatim: hint(day)))
        } else {
            row(dated: false) { EmptyView() }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(
                    Text(
                        verbatim: String(
                            format: String(localized: "friends.row.noDate.vo", bundle: .module),
                            personSpeech)))
        }
    }

    private func row(dated: Bool, @ViewBuilder dates: () -> some View) -> some View {
        HStack(alignment: .top, spacing: 0) {
            Avatar(name: member.name, photo: member.photo, size: .row)
                .alignmentGuide(.top) { $0[VerticalAlignment.center] - middle(dated: dated) }
                .padding(.trailing, Size.personRowTextInset - AvatarSize.row.rawValue)
            VStack(alignment: .leading, spacing: Spacing.xs) {
                nameAndNextUp
                dates()
            }
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            if dated {
                Image(systemName: "chevron.right")
                    .font(.system(size: chevron))
                    .foregroundStyle(Palette.secondaryText)
                    .frame(width: chevronBox, height: chevronBox)
                    .alignmentGuide(.top) { $0[VerticalAlignment.center] - middle(dated: true) }
                    .padding(.leading, Spacing.m)
                    .padding(.trailing, Size.personRowChevronInset)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, dated ? Spacing.m : Spacing.s)
        .frame(
            maxWidth: .infinity, minHeight: minHeight(dated: dated),
            alignment: dated ? .top : .center
        )
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Palette.separator)
                .frame(height: Size.separatorWidth)
                .padding(.leading, Size.personRowTextInset)
        }
        .contentShape(Rectangle())
    }

    /// The avatar's middle, from the top of the words: a dated row's avatar meets the name's top
    /// until the name's first line is taller than it, then keeps level with that line; a row with
    /// no date centres it on that line.
    private func middle(dated: Bool) -> CGFloat {
        let line = TypeRole.row.firstLineMiddle(atSize: nameSize)
        return dated ? max(AvatarSize.row.rawValue / 2, line) : line
    }

    private func minHeight(dated: Bool) -> CGFloat {
        guard let day = member.day, dated else { return Size.personRowNoDateMinHeight }
        return local(day) == nil ? Size.personRowMinHeight : Size.personRowTravellingMinHeight
    }

    /// The name, and Next up beside it while both fit on one line, or under it, never breaking
    /// either. At the accessibility sizes Next up always has its own line (`friendsRow.AX5`), and
    /// the name comes first in the stack, so the avatar finds its first line.
    @ViewBuilder private var nameAndNextUp: some View {
        if member.showsNextUp, !typeSize.isAccessibilitySize {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: Spacing.s) {
                    name.fixedSize()
                    Spacer(minLength: 0)
                    nextUp.fixedSize()
                }
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    name.fixedSize(horizontal: false, vertical: true)
                    nextUp.fixedSize(horizontal: false, vertical: true)
                }
            }
        } else {
            name.fixedSize(horizontal: false, vertical: true)
            if member.showsNextUp {
                nextUp.fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var name: some View {
        Text(verbatim: visibleName)
            .textRole(.row)
            .foregroundStyle(Palette.primaryText)
    }

    private var nextUp: some View {
        Text(String(localized: "friends.nextUp", bundle: .module))
            .textRole(.nextUp)
            .foregroundStyle(Palette.secondaryText)
    }

    @ViewBuilder private func dateLines(_ day: Day) -> some View {
        ForEach(Array(lines(day).enumerated()), id: \.offset) { _, line in
            Text(verbatim: line)
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var visibleName: String {
        member.isViewer
            ? String(format: String(localized: "person.self", bundle: .module), member.name)
            : member.name
    }

    private var personSpeech: String {
        member.isViewer
            ? String(format: String(localized: "person.self.vo", bundle: .module), member.name)
            : member.name
    }

    private func local(_ day: Day) -> LocalOpening? {
        LocalOpening(opensAt: day.opensAt, clubDate: day.date, clubZone: day.zone, device: device)
    }

    /// One line in the club's zone; or, away from it, the phone's zone first and the club's
    /// beneath, with the club's date when the two dates differ.
    private func lines(_ day: Day) -> [String] {
        let clubTime = labels.time(day.opensAt, in: day.zone)
        let clubZone = labels.zoneName(day.zone)
        guard let local = local(day) else {
            return [
                String(
                    format: String(localized: "friends.date", bundle: .module),
                    labels.fullDate(day.date, includingYear: day.includingYear), clubTime)
            ]
        }
        let first = String(
            format: String(localized: "friends.date.travelling", bundle: .module),
            labels.fullDate(of: day.opensAt, in: local.zone, includingYear: day.includingYear),
            labels.time(day.opensAt, in: local.zone), labels.zoneName(local.zone))
        let second =
            local.datesDiffer
            ? String(
                format: String(localized: "friends.date.club.dated", bundle: .module),
                labels.fullDate(day.date, includingYear: day.includingYear), clubTime, clubZone)
            : String(
                format: String(localized: "friends.date.club", bundle: .module), clubTime, clubZone)
        return [first, second]
    }

    private func spoken(_ day: Day) -> String {
        let nextUp =
            member.isNextUp ? String(localized: "friends.nextUp.vo", bundle: .module) : ""
        let club = labels.fullDateTime(day.opensAt, in: day.zone)
        let clubZone = labels.zoneName(day.zone)
        guard let local = local(day) else {
            return String(
                format: String(localized: "friends.row.vo", bundle: .module), personSpeech, nextUp,
                club, clubZone)
        }
        return String(
            format: String(localized: "friends.row.travelling.vo", bundle: .module), personSpeech,
            nextUp, labels.fullDateTime(day.opensAt, in: local.zone), labels.zoneName(local.zone),
            club, clubZone)
    }

    /// "Open your Monday." or "Open Nina’s Saturday.": the occurrence's own weekday, in the
    /// club's zone, wherever the phone is (handoff 6's `selfName`, `friends.row.hint`).
    private func hint(_ day: Day) -> String {
        let occasion =
            member.isViewer
            ? String(
                format: String(localized: "occasion.self.inSentence", bundle: .module),
                labels.weekday(day.date))
            : labels.personDay(name: member.name, date: day.date)
        return String(format: String(localized: "friends.row.hint", bundle: .module), occasion)
    }
}
