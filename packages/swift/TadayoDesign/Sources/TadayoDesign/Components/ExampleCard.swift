import SwiftUI

/// Welcome's example of a friend's caption (`A01-welcome`; handoff 8's
/// `welcome.defaultExampleGeometry`, handoff 9's frames 18 to 20): the folded card in miniature, as
/// "Caption now" shows it beside the photograph on the day. It's a labelled example, not a drop
/// (spec 04), so it has no status line, lock or date of its own: Welcome writes the target above
/// it.
///
/// - **Geometry:** 172 high at the default size, growing with its text; radius 16, the fold 18
///   with its 0.75 line, on the sender's cover. The words 16 in from the sides, the caption 20
///   under the top and the sender 24 above the foot, as frame 18 draws them (the caption's line
///   box at 21, the avatar's foot 23 above the card's), at book p35's nearest steps.
/// - **The caption** in `row` 17/22 (handoff 8: "The miniature uses the existing row role for its
///   caption and metadata for the sender").
/// - **The sender:** the avatar at 28, which keeps its size, 8 before the name in `metadata`
///   13/18, centred on it, pinned to the card's foot and at least 16 under the caption. Their
///   photo shows when there is one; otherwise their initial on the cover's avatar colours.
/// - **VoiceOver** reads one element, the sender then the caption ("Maya. Your future living
///   room."), as the folded card reads its sender first.
public struct ExampleCard: View {
    let caption: String
    let sender: String
    let photo: Image?
    let cover: Cover

    /// The caption and the sender as the example writes them, the sender's photo if there is one,
    /// and the sender's cover.
    public init(caption: String, sender: String, photo: Image?, cover: Cover) {
        self.caption = caption
        self.sender = sender
        self.photo = photo
        self.cover = cover
    }

    public var body: some View {
        PinnedFooterLayout(
            minHeight: Size.exampleHeight - Spacing.xl - Spacing.xxl, spacing: Spacing.l
        ) {
            Text(verbatim: caption)
                .textRole(.row)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(alignment: .center, spacing: Spacing.s) {
                Avatar(name: sender, photo: photo, size: .card, on: .cover)
                Text(verbatim: sender)
                    .textRole(.metadata)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .foregroundStyle(cover.ink)
        .padding(.horizontal, Spacing.l)
        .padding(.top, Spacing.xl)
        .padding(.bottom, Spacing.xxl)
        .frame(maxWidth: .infinity, alignment: .leading)
        .foldedBackground(cover, radius: Radius.card)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: Spoken.sentences([sender, caption])))
    }
}
