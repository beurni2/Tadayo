import SwiftUI

/// A selected highlight's cover (book p6, p19, p34; handoff 0): a 91 by 69-point button with the
/// sender's initial, a concise label such as "Debby's pick" and the folded corner. At the
/// accessibility text sizes it becomes a full-width row, at least 96 high, and the label wraps
/// rather than shrinks (book p26, T47). Its colour is the sender's cover, never a hint of the
/// hidden photo (book p34).
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

    public var body: some View {
        Button(action: action) {
            if dynamicTypeSize.isAccessibilitySize {
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
        HStack(spacing: Spacing.l) {
            Avatar(name: sender, photo: senderPhoto, size: .row, on: .cover)
            Text(label).textRole(.caption)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .foregroundStyle(cover.ink)
        .padding(.horizontal, Spacing.xxl)
        .padding(.vertical, Spacing.l)
        .frame(maxWidth: .infinity, minHeight: Size.highlightRowMinHeight)
        .foldedBackground(cover, radius: Radius.card)
        .contentShape(Rectangle())
    }
}
