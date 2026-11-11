import SwiftUI
import TadayoCore

/// Who a drop is for, before Add (book p8 and p15: "The target block names Debby, Friday 13
/// November, Sunday people and 7 AM"; T31: the club, the person and the exact date before Add):
/// a `surface` box at radius 12 with the star's 36-point avatar, "For Debby · Friday, November
/// 13" in `row` 17/22 `primaryText` over "Sunday people · Opens at 7 AM" in `metadata` 13/18
/// `secondaryText`, and `chevron.down` in `secondaryText`, since the person can change who it's
/// for (spec 10). As 2.1's `C02-photo`, `C02-keyboard` and `C04-link` draw it, the only drawings:
/// no handoff draws it yet. The date is written whole, as the handoffs write every date (handoff
/// 6's IMPLEMENTATION.md: "Native wide weekday/month formatting … in all cases"; book p15), where
/// book p8 and 2.1 shorten the month ("Friday 13 Nov").
///
/// It names only the occasion the server gave, never one worked out on the phone (T1, T4), and
/// takes the person's name from it alone; and it never says the allowance, which `AllowanceLine`
/// does (T33). Its other forms (no target yet, the star's own day, travelling, a target that
/// closed) are B4's.
///
/// Its geometry is 2.1's at the nearest steps (FQ40): 12 in on every side (2.1 draws 14 at the
/// leading edge; 12 is the Private drafts row's), the words 12 after the avatar and 4 between
/// their lines, the chevron in a 20-point box at the trailing inset, at the size whose glyph
/// matches 2.1's 8 by 5, growing with the text as the drafts row's does. The avatar keeps its
/// size (handoff 4's `dynamicTypePolicy.avatarMarks`); its top meets the title's until the
/// title's first line outgrows it, and from then it stays level with that line, as the compact
/// receipt's disc does; the chevron keeps the avatar's middle.
///
/// VoiceOver finds one button (FQ92): the person, the club, then the date and the time as one
/// opening, "For Debby. Sunday people. Opens Friday, November 13, 2026 at 7 AM, New York." No
/// hint is delivered.
public struct TargetBlock: View {
    let occasion: Occasion
    let photo: Image?
    let club: String
    let labels: DateLabels
    let action: () -> Void
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var titleSize = TypeRole.row.size
    @ScaledMetric(relativeTo: TypeRole.row.textStyle)
    private var chevronBox = Size.targetChevronBox
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var chevron = Size.targetChevron

    /// - Parameter photo: the star's own profile photo, if they have one, from the avatar route,
    ///   never anything of a drop (T12).
    public init(
        for occasion: Occasion, photo: Image?, club: String, labels: DateLabels,
        action: @escaping () -> Void
    ) {
        self.occasion = occasion
        self.photo = photo
        self.club = club
        self.labels = labels
        self.action = action
    }

    private var title: String {
        String(
            format: String(localized: "target.title", bundle: .module), occasion.star,
            labels.fullDate(occasion.date, includingYear: occasion.includingYear))
    }

    private var audience: String {
        String(
            format: String(localized: "target.audience", bundle: .module), club,
            labels.time(occasion.opensAt, in: occasion.zone))
    }

    private var spoken: String {
        Spoken.sentences([
            String(format: String(localized: "drop.for", bundle: .module), occasion.star), club,
            String(
                format: String(localized: "opens.vo", bundle: .module),
                Spoken.opening(occasion, labels)),
        ])
    }

    /// The avatar's middle, from the top of the words: its own middle while the title's first
    /// line is shorter, and that line's middle once it is taller.
    private var middle: CGFloat {
        max(AvatarSize.row.rawValue / 2, TypeRole.row.firstLineMiddle(atSize: titleSize))
    }

    public var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: Spacing.m) {
                Avatar(name: occasion.star, photo: photo, size: .row)
                    .alignmentGuide(.top) { $0[VerticalAlignment.center] - middle }
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text(verbatim: title)
                        .textRole(.row)
                        .foregroundStyle(Palette.primaryText)
                    Text(verbatim: audience)
                        .textRole(.metadata)
                        .foregroundStyle(Palette.secondaryText)
                }
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.down")
                    .font(.system(size: chevron))
                    .foregroundStyle(Palette.secondaryText)
                    .frame(width: chevronBox, height: chevronBox)
                    .alignmentGuide(.top) { $0[VerticalAlignment.center] - middle }
                    .accessibilityHidden(true)
            }
            .padding(Spacing.m)
            .frame(maxWidth: .infinity)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.surface))
            .contentShape(RoundedRectangle(cornerRadius: Radius.surface))
        }
        .buttonStyle(UnchangedWhenPressed())
        .accessibilityLabel(Text(verbatim: spoken))
    }
}
