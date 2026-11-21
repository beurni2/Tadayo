import SwiftUI

/// The header every tab shares while the account has no club (handoff 7's `noClubRootHeader`,
/// which redraws handoff 2's): the outlined wordmark, 96 wide, leading, "+ Add" and the Account
/// avatar trailing. The wordmark is an image named Tadayo, neither a button nor a heading (X-17
/// of handoff 6's check). "+ Add" is `headerAdd` 15/20 bold in `action`, `actionPressed` while
/// pressed, as a text action is; the account's initial, or photograph, sits on a 28-point avatar
/// in a button labelled Account.
///
/// In one row, at 393 points, the rectangles are the contract's: the wordmark 8 under the
/// header's top; "+ Add"'s target [241, 56, 80, 44], at least 80 wide and wider when its words
/// with 8 either side need more, the words 8 inside its leading edge; 8 between it and Account's
/// [329, 56, 44, 44], which ends at the screen's 20-point inset, the avatar centred in it.
///
/// At every accessibility text size the header stacks (the contract's `largest.layout`: "At all
/// accessibility categories, wordmark row then actions row"): the wordmark in a 48-point band,
/// then "+ Add" with its words at the leading inset and Account at the trailing one, centred in
/// the row. "+ Add"'s target there is its words, at least 44 high: the contract's [20, 104, 249,
/// 76] at the largest size follows from no stated rule (the ios lane's needs list, item 59), so
/// the header measures 100 points high there, with a target of 120 by 52, where the contract
/// has 124 (`TabsLayoutTests`' stacked test attaches the measures). Below the accessibility
/// sizes the header stacks the same way only when the row doesn't fit (handoff 4: "can stack its
/// wordmark and actions when necessary"). The wordmark and the avatar keep their size; "+ Add"
/// grows with the text. The screen puts the header at the top of its scrolling content.
public struct NoClubHeader: View {
    let wordmark: Image
    let wordmarkLabel: Text
    let add: Text
    let addHint: Text
    let account: Text
    let accountHint: Text
    let name: String
    let photo: Image?
    let onAdd: () -> Void
    let onAccount: () -> Void

    /// `wordmark` is the brand's wordmark from the app's asset catalog, and the words come from
    /// the app's string catalog; `name` is the account's, whose initial the avatar shows.
    public init(
        wordmark: Image, wordmarkLabel: Text, add: Text, addHint: Text, account: Text,
        accountHint: Text, name: String, photo: Image? = nil, onAdd: @escaping () -> Void,
        onAccount: @escaping () -> Void
    ) {
        self.wordmark = wordmark
        self.wordmarkLabel = wordmarkLabel
        self.add = add
        self.addHint = addHint
        self.account = account
        self.accountHint = accountHint
        self.name = name
        self.photo = photo
        self.onAdd = onAdd
        self.onAccount = onAccount
    }

    @Environment(\.dynamicTypeSize) private var textSize

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
        .padding(.horizontal, Spacing.inset)
    }

    private var row: some View {
        HStack(alignment: .top, spacing: Size.headerActionGap) {
            mark
            Spacer(minLength: Spacing.xs)
            addButton(stacked: false)
            accountButton
        }
    }

    private var stacked: some View {
        VStack(alignment: .leading, spacing: 0) {
            mark.frame(height: Size.headerWordmarkBand, alignment: .top)
            HStack(spacing: Size.headerActionGap) {
                addButton(stacked: true)
                Spacer(minLength: 0)
                accountButton
            }
        }
    }

    private var mark: some View {
        wordmark
            .resizable()
            .scaledToFit()
            .frame(width: Size.headerWordmark)
            .accessibilityLabel(wordmarkLabel)
            .padding(.top, Size.headerWordmarkTop)
    }

    private func addButton(stacked: Bool) -> some View {
        Button(action: onAdd) {
            add
        }
        .buttonStyle(HeaderAddStyle(stacked: stacked))
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

/// "+ Add": `headerAdd` in `action`, `actionPressed` while pressed, at least 44 high. In a
/// header's one row its words are 8 inside the target's leading edge with 8 after them, and the
/// target is at least `rowMinWidth` wide: 80 in the no-club header, 59 in the selected club's;
/// stacked, its target is its words, which start at the screen's inset, and at least 44 wide.
struct HeaderAddStyle: ButtonStyle {
    let stacked: Bool
    var rowMinWidth = Size.headerAddMinWidth

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .textRole(.headerAdd)
            .foregroundStyle(configuration.isPressed ? Palette.actionPressed : Palette.action)
            .padding(.horizontal, stacked ? 0 : Size.headerAddLabelInset)
            .frame(
                minWidth: stacked ? Size.touchTarget : rowMinWidth,
                minHeight: Size.touchTarget,
                alignment: .leading
            )
            .contentShape(Rectangle())
    }
}
