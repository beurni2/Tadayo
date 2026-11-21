import SwiftUI

/// One member in a club's members list (G05-members, G05-members-two-days; handoff 1's and 2's
/// frames), from `invitationRosterRow`'s contract: the 36-point avatar with the initial, the name
/// in `row` 17/22 `primaryText` ("Ben · You" for the viewer, handoff 5's `calendar.person.self`),
/// and under it, 4 apart, their weekdays in `metadata` 13/18 `secondaryText` ("Monday", "Monday
/// and Thursday"), the words 49 from the leading edge, with a 1-point `separator` under the row
/// from 49 to the trailing edge. At least 52 high, growing with the text; a member with no day in
/// force shows the name alone, as a Friends row with no day does (`friendsRow.noOccurrence`).
///
/// What the contract doesn't name is the frames': 12 above the words and 16 under them, the
/// scale's steps nearest the 12.5 and 17 the frames draw (rows 72 apart where they draw 73), and
/// the avatar centred on the words, as drawn, until the accessibility sizes, where it keeps level
/// with the name's first line (`friendsRow.AX5`: "Avatar aligns to first line"). The avatar keeps
/// its size (`dynamicTypePolicy.avatarMarks`).
///
/// It is not a button: nothing in the frames opens from a row. VoiceOver reads one element, the
/// name then the weekdays, as sentences: "Ben, you. Monday and Thursday." (`person.self.vo`).
public struct RosterRow: View {
    let name: String
    let photo: Image?
    let isViewer: Bool
    let days: String?
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var nameSize = TypeRole.row.size

    /// - Parameters:
    ///   - days: the member's weekdays as the screen words them, or nil while they have none.
    public init(name: String, photo: Image? = nil, isViewer: Bool, days: String?) {
        self.name = name
        self.photo = photo
        self.isViewer = isViewer
        self.days = days
    }

    public var body: some View {
        HStack(alignment: typeSize.isAccessibilitySize ? .top : .center, spacing: 0) {
            Avatar(name: name, photo: photo, size: .row)
                .alignmentGuide(.top) {
                    $0[VerticalAlignment.center] - TypeRole.row.firstLineMiddle(atSize: nameSize)
                }
                .padding(.trailing, Size.personRowTextInset - AvatarSize.row.rawValue)
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text(verbatim: visibleName)
                    .textRole(.row)
                    .foregroundStyle(Palette.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
                if let days {
                    Text(verbatim: days)
                        .textRole(.metadata)
                        .foregroundStyle(Palette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.top, Spacing.m)
        .padding(.bottom, Spacing.l)
        .frame(maxWidth: .infinity, minHeight: Size.personRowNoDateMinHeight)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Palette.separator)
                .frame(height: Size.separatorWidth)
                .padding(.leading, Size.personRowTextInset)
                .accessibilityHidden(true)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: spoken))
    }

    private var visibleName: String {
        isViewer ? String(format: String(localized: "person.self", bundle: .module), name) : name
    }

    private var personSpeech: String {
        isViewer ? String(format: String(localized: "person.self.vo", bundle: .module), name) : name
    }

    /// The name, then the weekdays, as sentences; the name alone with none.
    var spoken: String {
        guard let days else {
            return String(
                format: String(localized: "friends.row.noDate.vo", bundle: .module), personSpeech)
        }
        return String(
            format: String(localized: "roster.row.vo", bundle: .module), personSpeech, days)
    }
}
