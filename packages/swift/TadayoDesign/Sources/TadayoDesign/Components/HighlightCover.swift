import SwiftUI

/// A selected highlight's cover (book p6, p19, p34; handoff 7's `highlightCover`, which keeps
/// handoff 4's): a 91 by 69-point button with the sender's avatar at 18, 4 above a concise label
/// such as "Debby’s pick" at `highlight` (12/14), an 8-point inset, and the folded corner. Above
/// the default text size it becomes a full-width row, at least 96 high, with the avatar at 28, 12
/// before the label at `highlightExpanded` (20/26), wrapping rather than shrinking (book p26, T47;
/// handoff 7: "a full-width vertical list starting at extraLarge"); see `usesList(at:)`. The star's
/// own pick carries the labelled star (book p6), and the other covers are labelled with their
/// sender's name alone (handoff 7's `highlight.contributor`, as 2.1's `H01-open` draws them). Its
/// colour is the sender's cover, never a hint of the hidden photo (book p34). VoiceOver names
/// each cover "Open Maya’s highlight" (T47, book p8), which handoff 7's own labels ("Debby’s
/// pick", "Your pick") don't say: the check of handoff 7 keeps T47's name (R-02 and the critic's
/// ruling on D-16).
public struct HighlightCover: View {
    let label: String
    let sender: String
    let senderPhoto: Image?
    let cover: Cover
    let isStarPick: Bool
    let accessibilityName: String
    let action: () -> Void

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// - Parameters:
    ///   - isStarPick: whether this is the star's own pick, which carries the star.
    ///   - accessibilityName: the button's name, such as "Open Maya's highlight" (book p8, T47).
    public init(
        label: String, sender: String, senderPhoto: Image? = nil, cover: Cover,
        isStarPick: Bool = false, accessibilityName: String, action: @escaping () -> Void
    ) {
        self.label = label
        self.sender = sender
        self.senderPhoto = senderPhoto
        self.cover = cover
        self.isStarPick = isStarPick
        self.accessibilityName = accessibilityName
        self.action = action
    }

    /// Whether covers at this text size are full-width rows in a vertical list rather than tiles in
    /// a rail; the rail that holds them asks the same question. The tile and its 12/14 label are
    /// drawn for the default size, where the label takes at most two lines of its 75-point text
    /// width and two lines fill its 69 points: "Debby's pick" takes both in SF Pro, where the
    /// sheet's font keeps it on one. The label never shrinks (handoff 4's sheet: "No smaller
    /// type"), so at any larger size the tile would grow past the sheet's 69 points, and from
    /// `.xxxLarge` a word such as "Deborah-" no longer fits the width and breaks; the list takes over
    /// above the default (book p26 and p34: "At large sizes the rail becomes a labelled list";
    /// handoff 4's sheet: "Large text uses a vertical list").
    public static func usesList(at size: DynamicTypeSize) -> Bool {
        size > .large
    }

    public var body: some View {
        Button(action: action) {
            if Self.usesList(at: dynamicTypeSize) {
                row
            } else {
                tile
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityName)
    }

    /// Decorative: the label and the button's name say whose pick it is. It keeps its 12 points at
    /// every text size (handoff 7's `highlightCover.star`, "scaleWithText false"), so the label
    /// keeps its room, in a 12-point box, so the tile's origin and the row's "12+12" are the
    /// contract's whatever the symbol's own image width (the check of handoff 7, D-09).
    private var star: some View {
        Image(systemName: "star.fill")
            .font(.system(size: Size.highlightStar))
            .frame(width: Size.highlightStar)
            .accessibilityHidden(true)
    }

    private var tile: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Avatar(name: sender, photo: senderPhoto, size: .rail, on: .cover)
            Text(label).textRole(.highlight)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(cover.ink)
        .padding(Spacing.s)
        .frame(
            minWidth: Size.highlightCover.width, minHeight: Size.highlightCover.height,
            alignment: .topLeading
        )
        .frame(width: Size.highlightCover.width)
        // A label that wraps past two lines makes the tile taller, never spills out of it.
        .fixedSize(horizontal: false, vertical: true)
        // The star sits level with the avatar, left of the fold, 55 from the leading edge and 11
        // from the top (handoff 7's `star.tileOrigin`): its 12-point box 24 from the trailing edge.
        .overlay(alignment: .topTrailing) {
            if isStarPick {
                star
                    .foregroundStyle(cover.ink)
                    .frame(height: AvatarSize.rail.rawValue)
                    .padding(.top, Spacing.s)
                    .padding(.trailing, Spacing.xxl)
            }
        }
        .foldedBackground(cover, radius: Radius.card)
        .contentShape(Rectangle())
    }

    private var row: some View {
        // The avatar at 28 keeps its size beside the label, level with its first line, 12 before
        // it, and the star 12 after it at the 24-point trailing inset, first-line aligned
        // (handoff 7's `highlightCover.row` and `star.rowOrigin`, "reserve 12+12 before star").
        HStack(alignment: .firstLineCenter, spacing: Spacing.m) {
            Avatar(name: sender, photo: senderPhoto, size: .card, on: .cover)
            Text(label).textRole(.highlightExpanded)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            if isStarPick {
                star
            }
        }
        .foregroundStyle(cover.ink)
        .padding(.horizontal, Spacing.xxl)
        .padding(.vertical, Spacing.l)
        .frame(maxWidth: .infinity, minHeight: Size.highlightRowMinHeight, alignment: .leading)
        .foldedBackground(cover, radius: Radius.card)
        .contentShape(Rectangle())
    }
}
