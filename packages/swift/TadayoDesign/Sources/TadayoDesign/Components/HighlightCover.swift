import SwiftUI

/// A selected highlight's cover (book p6, p19, p34; handoff 4's sheet): a 91 by 69-point button
/// with the sender's avatar, a concise label such as "Debby's pick" at `highlight` (12/14), an
/// 8-point inset, and the folded corner. Above the default text size it becomes a full-width row,
/// at least 96 high, with the label at `highlightExpanded` (20/26) beside the avatar, wrapping
/// rather than shrinking (book p26, T47; handoff 4's `highlightLargeText`: "Full-width vertical
/// list"); see `usesList(at:)`. The star's own pick carries the labelled star (book p6;
/// INVENTORY.md's Known differences). Its colour is the sender's cover, never a hint of the hidden
/// photo (book p34).
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
    /// drawn for the default size, where a label of two lines fills its 69 points and its 75-point
    /// text width holds "Debby's pick" on one line. The label never shrinks (handoff 4's sheet: "No
    /// smaller type"), so at any larger size the tile would grow past the sheet's 69 points, and
    /// from `.xxxLarge` a word such as "Deborah-" no longer fits the width and breaks; the list takes
    /// over above the default (book p26 and p34: "At large sizes the rail becomes a labelled list";
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

    /// Decorative: the label and the button's name say whose pick it is. Like the avatar, it keeps
    /// its size at every text size (handoff 4's `dynamicTypePolicy.avatarMarks`), so the label
    /// keeps the room beside it and a name such as "Debby's" isn't broken at `.accessibility5`.
    private var star: some View {
        Image(systemName: "star.fill")
            .font(.system(size: Size.highlightStar))
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
        // The star sits level with the avatar, left of the fold, as 2.1 draws the star's pick.
        .overlay(alignment: .topTrailing) {
            if isStarPick {
                star
                    .foregroundStyle(cover.ink)
                    .frame(height: AvatarSize.rail.rawValue)
                    .padding(.top, Spacing.s)
                    .padding(.trailing, Size.fold + Spacing.xs)
            }
        }
        .foldedBackground(cover, radius: Radius.card)
        .contentShape(Rectangle())
    }

    private var row: some View {
        // The avatar keeps its size beside the label, level with its first line, at every size
        // (handoff 4's `dynamicTypePolicy.avatarMarks`).
        HStack(alignment: .firstLineCenter, spacing: Spacing.l) {
            Avatar(name: sender, photo: senderPhoto, size: .row, on: .cover)
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
