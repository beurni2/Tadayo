import SwiftUI

/// A selected highlight's cover (book p6, p19, p34; handoff 0): a 91 by 69-point button with the
/// sender's initial, a concise label such as "Debby's pick" and the folded corner. Above the
/// default text size it becomes a full-width row, at least 96 high, with the label at
/// `highlightExpanded` (20/26), wrapping rather than shrinking (book p26, T47; handoff 4's sheet:
/// "Large text uses a vertical list"); see `usesList(at:)`. Its colour is the sender's cover, never
/// a hint of the hidden photo (book p34).
public struct HighlightCover: View {
    let label: String
    let sender: String
    let senderPhoto: Image?
    let cover: Cover
    let accessibilityName: String
    let action: () -> Void

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// - Parameter accessibilityName: the button's name, such as "Open Maya's highlight"
    ///   (book p8, T47).
    public init(
        label: String, sender: String, senderPhoto: Image? = nil, cover: Cover,
        accessibilityName: String, action: @escaping () -> Void
    ) {
        self.label = label
        self.sender = sender
        self.senderPhoto = senderPhoto
        self.cover = cover
        self.accessibilityName = accessibilityName
        self.action = action
    }

    /// Whether covers at this text size are full-width rows in a vertical list rather than tiles in
    /// a rail; the rail that holds them asks the same question. The tile and its 12/14 label are
    /// drawn for the default size, and the label never shrinks (handoff 4's sheet: "No smaller
    /// type"). At any larger size a word such as "highlight" outgrows the tile's 63-point text
    /// width and breaks mid-word, so the list takes over there (book p26 and p34: "At large sizes
    /// the rail becomes a labelled list"; handoff 0: "at large text move to a vertical list").
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

    private var tile: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Avatar(name: sender, photo: senderPhoto, size: .rail, on: .cover)
            Text(label).textRole(.highlight)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(cover.ink)
        .padding(.horizontal, Spacing.m + 2)
        .padding(.vertical, Spacing.s + 2)
        .frame(
            minWidth: Size.highlightCover.width, minHeight: Size.highlightCover.height,
            alignment: .topLeading
        )
        .frame(width: Size.highlightCover.width)
        // A label that wraps past three lines makes the tile taller, never spills out of it.
        .fixedSize(horizontal: false, vertical: true)
        .foldedBackground(cover, radius: Radius.card)
        .contentShape(Rectangle())
    }

    private var row: some View {
        // At the accessibility sizes the avatar, which grows with the text, sits above the label,
        // so the label keeps the row's whole width and a word such as "Deborah-" fits its line.
        let stack =
            dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.m))
            : AnyLayout(HStackLayout(spacing: Spacing.l))
        return stack {
            Avatar(name: sender, photo: senderPhoto, size: .row, on: .cover)
            Text(label).textRole(.highlightExpanded)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(cover.ink)
        .padding(.horizontal, Spacing.xxl)
        .padding(.vertical, Spacing.l)
        .frame(maxWidth: .infinity, minHeight: Size.highlightRowMinHeight, alignment: .leading)
        .foldedBackground(cover, radius: Radius.card)
        .contentShape(Rectangle())
    }
}
