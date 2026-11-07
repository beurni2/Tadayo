import SwiftUI

/// The way to the account's private drafts, on the no-club tabs and Friends: a `surface` row,
/// radius 12, at least 76 points high and growing with the text, with SF Symbol `folder` in
/// `action`, its title in `row` 17/22 `primaryText` over its subtitle in `metadata` 13/18
/// `secondaryText`, and `chevron.right` in `secondaryText` (handoff 2's `privateDraftsEntry`, with
/// handoff 4's inks; handoff 6 keeps it).
///
/// Its geometry is handoff 4's `G06-no-club` frame's: the folder centred in a 24-point box 12 in
/// from the leading edge, the title 16 after it, the chevron centred in a 20-point box 12 in from
/// the trailing edge, each symbol at the size whose glyph matches the drawn one (the folder 20 by
/// 15, the chevron 6 by 12), growing with the text. No delivery draws it pressed: it looks the
/// same (the ios lane's needs list).
///
/// VoiceOver finds one button, its title as its label and its subtitle as its hint (handoff 5's
/// `a11y.drafts` and `a11y.drafts.hint`).
public struct PrivateDraftsEntry: View {
    let title: Text
    let subtitle: Text
    let action: () -> Void

    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var folderBox = Size.draftsFolderBox
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var folder = Size.draftsFolder
    @ScaledMetric(relativeTo: TypeRole.row.textStyle)
    private var chevronBox = Size.draftsChevronBox
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var chevron = Size.draftsChevron

    public init(title: Text, subtitle: Text, action: @escaping () -> Void) {
        self.title = title
        self.subtitle = subtitle
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.l) {
                Image(systemName: "folder")
                    .font(.system(size: folder))
                    .foregroundStyle(Palette.action)
                    .frame(width: folderBox)
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    title
                        .textRole(.row)
                        .foregroundStyle(Palette.primaryText)
                    subtitle
                        .textRole(.metadata)
                        .foregroundStyle(Palette.secondaryText)
                }
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.system(size: chevron))
                    .foregroundStyle(Palette.secondaryText)
                    .frame(width: chevronBox)
            }
            .padding(.horizontal, Spacing.m)
            .padding(.vertical, Spacing.m)
            .frame(maxWidth: .infinity, minHeight: Size.draftsRowMinHeight)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.surface))
            .contentShape(RoundedRectangle(cornerRadius: Radius.surface))
        }
        .buttonStyle(UnchangedWhenPressed())
        .accessibilityLabel(title)
        .accessibilityHint(subtitle)
    }
}

/// A button drawn the same pressed or not, for a control no delivery draws pressed.
struct UnchangedWhenPressed: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
    }
}
