import SwiftUI

/// The header every tab shares while the account has no club (handoff 2's `noClubRootHeader`:
/// "outlined wordmark, width 96" leading, "+ Add" and the Account avatar trailing; handoff 6 keeps
/// it). The wordmark is an image named Tadayo, neither a button nor a heading (X-17 of handoff
/// 6's check). "+ Add" is `headerAdd` 15/20 bold in `action`, `actionPressed` while pressed, as a
/// text action is; the account's initial, or photograph, sits on a 28-point avatar in a button
/// labelled Account. Each is a 44-point target (handoff 4: "each action with a 44 pt target";
/// handoff 1: "Give the avatar a 44 × 44 hit region and an accessible Account label"), and the two
/// don't overlap: "+ Add"'s is its words with 8 points either side, 4 before Account's, as handoffs
/// 5 and 6 draw it ([274, 56, 59, 44] beside [337, 56, 44, 44]), and the avatar ends 20 points in
/// from the edge.
///
/// When the actions don't fit beside the wordmark (at large text), they go on a second row under
/// it, still trailing (handoff 4: "The no-club header can stack its wordmark and actions when
/// necessary"). The wordmark and the avatar keep their size; "+ Add" grows with the text. The
/// screen puts the header at the top of its scrolling content (handoff 6's FM-02).
public struct NoClubHeader: View {
    let wordmark: Image
    let wordmarkLabel: Text
    let add: Text
    let addHint: Text
    let account: Text
    let name: String
    let photo: Image?
    let onAdd: () -> Void
    let onAccount: () -> Void

    /// `wordmark` is the brand's wordmark from the app's asset catalog, and the words come from
    /// the app's string catalog; `name` is the account's, whose initial the avatar shows.
    public init(
        wordmark: Image, wordmarkLabel: Text, add: Text, addHint: Text, account: Text,
        name: String, photo: Image? = nil, onAdd: @escaping () -> Void,
        onAccount: @escaping () -> Void
    ) {
        self.wordmark = wordmark
        self.wordmarkLabel = wordmarkLabel
        self.add = add
        self.addHint = addHint
        self.account = account
        self.name = name
        self.photo = photo
        self.onAdd = onAdd
        self.onAccount = onAccount
    }

    /// How far Account's target reaches past its avatar, beyond the screen's inset.
    private var overhang: CGFloat { (Size.touchTarget - AvatarSize.card.rawValue) / 2 }

    public var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Spacing.m) {
                mark
                Spacer(minLength: 0)
                actions
            }
            VStack(alignment: .leading, spacing: 0) {
                mark
                actions.frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .padding(.leading, Spacing.inset)
        .padding(.trailing, Spacing.inset - overhang)
    }

    private var mark: some View {
        wordmark
            .resizable()
            .scaledToFit()
            .frame(width: Size.headerWordmark)
            .accessibilityLabel(wordmarkLabel)
    }

    private var actions: some View {
        HStack(spacing: Spacing.xs) {
            Button(action: onAdd) {
                add
            }
            .buttonStyle(HeaderAddStyle())
            .accessibilityHint(addHint)
            Button(action: onAccount) {
                Avatar(name: name, photo: photo, size: .card)
                    .frame(width: Size.touchTarget, height: Size.touchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(UnchangedWhenPressed())
            .accessibilityLabel(account)
        }
    }
}

/// "+ Add": `headerAdd` in `action`, `actionPressed` while pressed, its target its words with 8
/// points either side, at least 44 high.
private struct HeaderAddStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .textRole(.headerAdd)
            .foregroundStyle(configuration.isPressed ? Palette.actionPressed : Palette.action)
            .padding(.horizontal, Spacing.s)
            .frame(minHeight: Size.touchTarget)
            .contentShape(Rectangle())
    }
}
