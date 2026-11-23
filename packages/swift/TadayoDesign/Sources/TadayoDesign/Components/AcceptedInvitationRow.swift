import SwiftUI

/// An invitation the account accepted that hasn't become a membership, as handoff 9 draws it on
/// Home with no club and in the switcher (`acceptedInvitations.row`, frames 7 to 11): a `surface`
/// row the width of the column, radius 12, padded 16 and at least 84 points high, growing with
/// its words; SF Symbol `envelope` in `action` in a 24-point box, the club's name in `row`
/// `primaryText`, its state 8 under it in `metadata` `secondaryText`, and a helper line 8 under
/// that when there is one, in the same role and ink; `chevron.right` in `secondaryText`. The
/// envelope and the chevron are centred on the name's first line (`TypeRole.firstLineMiddle`), as
/// the frames draw them whatever the row's height (frames 7 and 9), and the words start 12 after
/// the envelope's box, 72 points from the screen's edge. The symbols take Private drafts' sizes
/// (`PrivateDraftsEntry`), whose drawn glyphs match these within a point, and grow with the text;
/// the chevron's box ends 8 in from the trailing edge, its glyph about 2 points left of frame 7's.
/// The lines take their fonts' own line heights, which the contract's 22 and 18 only stand for
/// (`dynamicTypePolicy.lineHeight`): the row with a helper line is about 99 high where frame 9
/// draws 106, and the rest keep the 84-point minimum.
///
/// VoiceOver finds one button, with the club, its state and any helper line as its label and the
/// state's hint, the symbols hidden and no selected trait (`acceptedInvitations.row.a11y`): the
/// button's own element, its label in place of its words, as Private drafts'. No delivery draws
/// it pressed: it looks the same.
public struct AcceptedInvitationRow: View {
    let name: String
    let status: Text
    let helper: Text?
    let label: Text
    let hint: Text
    let action: () -> Void

    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var envelopeBox = Size.draftsFolderBox
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var envelope = Size.draftsFolder
    @ScaledMetric(relativeTo: TypeRole.row.textStyle)
    private var chevronBox = Size.draftsChevronBox
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var chevron = Size.draftsChevron
    /// The name's size, whose first line the symbols are centred on.
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var nameSize = TypeRole.row.size

    /// `name` is the club's, drawn as it is; `label` is what VoiceOver reads for the whole row.
    public init(
        name: String, status: Text, helper: Text? = nil, label: Text, hint: Text,
        action: @escaping () -> Void
    ) {
        self.name = name
        self.status = status
        self.helper = helper
        self.label = label
        self.hint = hint
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: Spacing.m) {
                Image(systemName: "envelope")
                    .font(.system(size: envelope))
                    .foregroundStyle(Palette.action)
                    .frame(width: envelopeBox, height: markHeight)
                VStack(alignment: .leading, spacing: Spacing.s) {
                    Text(verbatim: name)
                        .textRole(.row)
                        .foregroundStyle(Palette.primaryText)
                    status
                        .textRole(.metadata)
                        .foregroundStyle(Palette.secondaryText)
                    if let helper {
                        helper
                            .textRole(.metadata)
                            .foregroundStyle(Palette.secondaryText)
                    }
                }
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.system(size: chevron))
                    .foregroundStyle(Palette.secondaryText)
                    .frame(width: chevronBox, height: markHeight)
            }
            .padding(.leading, Spacing.l)
            .padding(.trailing, Spacing.s)
            .padding(.vertical, Spacing.l)
            .frame(
                maxWidth: .infinity, minHeight: Size.invitationRowMinHeight, alignment: .topLeading
            )
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.surface))
            .contentShape(RoundedRectangle(cornerRadius: Radius.surface))
        }
        .buttonStyle(UnchangedWhenPressed())
        .accessibilityLabel(label)
        .accessibilityHint(hint)
    }

    /// A box from the top of the name whose middle is its first line's.
    private var markHeight: CGFloat {
        2 * TypeRole.row.firstLineMiddle(atSize: nameSize)
    }
}
