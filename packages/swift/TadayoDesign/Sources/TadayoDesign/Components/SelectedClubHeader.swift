import SwiftUI

/// The header every tab shares while a club is selected (handoff 3's `selectedClubHeader`, with
/// handoff 8's): the club's name and `chevron.down` as one button, the club selector, leading;
/// "+ Add" and the Account avatar trailing, as the no-club header draws them. The name is
/// `clubHeader` 16/20 bold in `primaryText`, growing with the text without a cap (handoff 8:
/// "UIFontMetrics headline, no maximumPointSize"), and the chevron is in `secondaryText`, 4 after
/// the name, 10 by 5 at the default size, as handoff 5's `G06-switcher-status` draws it. No
/// delivery draws the selector pressed: it looks the same, as Account does.
///
/// In one row, at 393 points, the rectangles are the contract's
/// (`navigationAndTargets.selectedClubHeader`): the selector [20, 56, 230, 44], from the screen's
/// inset to 24 before "+ Add"; "+ Add" [274, 56, 59, 44], at least 59 wide and wider when its
/// words with 8 either side need more, the words 8 inside its leading edge; 4 between
/// it and Account's [337, 56, 44, 44], which ends 12 from the screen's edge, the avatar centred in
/// it. The selector takes the width "+ Add" and Account leave, its words at its leading edge.
///
/// At every accessibility text size the header takes two rows (handoff 8's `largest`): the
/// selector at full width, its name wrapping, then "+ Add" with its words at the leading inset and
/// Account where the one row has it. Its height is the name's. Below the accessibility sizes it
/// takes the same two rows only when the name doesn't fit the one row, so a name is never cut
/// short. The screen puts the header at the top of its scrolling content (handoff 8's `scroll`,
/// handoff 7's treatment).
public struct SelectedClubHeader: View {
    let clubName: String
    let selectorLabel: Text
    let add: Text
    let addHint: Text
    let account: Text
    let accountHint: Text
    let name: String
    let photo: Image?
    let onSelector: () -> Void
    let onAdd: () -> Void
    let onAccount: () -> Void

    /// `clubName` is the selected club's, as the server sends it; `selectorLabel` is what
    /// VoiceOver reads for the selector, and the rest of the words come from the app's string
    /// catalog. `name` is the account's, whose initial the avatar shows.
    public init(
        clubName: String, selectorLabel: Text, add: Text, addHint: Text, account: Text,
        accountHint: Text, name: String, photo: Image? = nil,
        onSelector: @escaping () -> Void, onAdd: @escaping () -> Void,
        onAccount: @escaping () -> Void
    ) {
        self.clubName = clubName
        self.selectorLabel = selectorLabel
        self.add = add
        self.addHint = addHint
        self.account = account
        self.accountHint = accountHint
        self.name = name
        self.photo = photo
        self.onSelector = onSelector
        self.onAdd = onAdd
        self.onAccount = onAccount
    }

    @Environment(\.dynamicTypeSize) private var textSize
    @ScaledMetric(relativeTo: TypeRole.clubHeader.textStyle)
    private var chevron = Size.clubHeaderChevron

    public var body: some View {
        Group {
            if textSize.isAccessibilitySize {
                stacked
            } else {
                ViewThatFits(in: .horizontal) {
                    row
                    stacked
                }
            }
        }
        .padding(.leading, Spacing.inset)
        .padding(.trailing, Size.clubHeaderTrailingInset)
    }

    private var row: some View {
        HStack(spacing: 0) {
            selector(wraps: false)
                .padding(.trailing, Size.clubHeaderSelectorGap)
            addButton(stacked: false)
                .padding(.trailing, Size.clubHeaderActionGap)
            accountButton
        }
    }

    private var stacked: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Its words end at the screen's inset, as the content's do.
            selector(wraps: true)
                .padding(.trailing, Spacing.inset - Size.clubHeaderTrailingInset)
            HStack(spacing: 0) {
                addButton(stacked: true)
                Spacer(minLength: Size.clubHeaderActionGap)
                accountButton
            }
        }
    }

    private func selector(wraps: Bool) -> some View {
        Button(action: onSelector) {
            HStack(spacing: Spacing.xs) {
                Text(verbatim: clubName)
                    .textRole(.clubHeader)
                    .foregroundStyle(Palette.primaryText)
                    .multilineTextAlignment(.leading)
                    .lineLimit(wraps ? nil : 1)
                    .fixedSize(horizontal: !wraps, vertical: wraps)
                Image(systemName: "chevron.down")
                    .font(.system(size: chevron))
                    .foregroundStyle(Palette.secondaryText)
            }
            .frame(maxWidth: .infinity, minHeight: Size.touchTarget, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(UnchangedWhenPressed())
        .accessibilityLabel(selectorLabel)
    }

    private func addButton(stacked: Bool) -> some View {
        Button(action: onAdd) {
            add
        }
        .buttonStyle(HeaderAddStyle(stacked: stacked, rowMinWidth: Size.clubHeaderAddMinWidth))
        .accessibilityHint(addHint)
    }

    private var accountButton: some View {
        Button(action: onAccount) {
            Avatar(name: name, photo: photo, size: .card)
                .frame(width: Size.touchTarget, height: Size.touchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(UnchangedWhenPressed())
        .accessibilityLabel(account)
        .accessibilityHint(accountHint)
    }
}
