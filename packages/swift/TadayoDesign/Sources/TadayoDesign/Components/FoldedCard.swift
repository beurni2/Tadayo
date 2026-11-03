import SwiftUI

/// The folded card for a committed caption while the day is collecting (book p6, p13, p34;
/// handoff 0's brand-components and `F02-upcoming`: 353 wide at 393, 151 minimum height, growing
/// for text, 18 horizontal inset, caption 21/28). It shows what the audience may read before the
/// reveal and nothing else (T10): the status line with the exact opening date, the caption and
/// its sender. A drop with no caption shows the neutral line book p13 names ("Photo for Debby"),
/// in smaller text, and no placeholder joke (book p34).
public struct FoldedCard: View {
    public enum Caption: Sendable {
        /// The sender's caption.
        case text(String)
        /// No caption: the neutral line for the person, such as "Photo for Debby".
        case blank(String)
    }

    let status: String
    let tag: String?
    let caption: Caption
    let sender: String
    let senderPhoto: Image?
    let cover: Cover

    /// - Parameters:
    ///   - status: the status line, such as "Locked · Opens Fri, Nov 13".
    ///   - tag: a word at the status line's end, such as the author's own "Highlight", or nil.
    ///   - sender: the sender as the viewer reads them, such as "Maya" or "Ben · You".
    ///   - cover: the sender's cover (FQ41), never chosen from the hidden media.
    public init(
        status: String, tag: String? = nil, caption: Caption, sender: String,
        senderPhoto: Image? = nil, cover: Cover
    ) {
        self.status = status
        self.tag = tag
        self.caption = caption
        self.sender = sender
        self.senderPhoto = senderPhoto
        self.cover = cover
    }

    public var body: some View {
        PinnedFooterLayout(
            minHeight: Size.foldedCardMinHeight - 2 * Spacing.l, spacing: Spacing.xxl
        ) {
            VStack(alignment: .leading, spacing: Spacing.l) {
                // The tag sits beside the status while both fit on one line, and under it when
                // they don't, so neither word is ever broken (book p26).
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: Spacing.s) {
                        Text(status).textRole(.cardStatus).fixedSize()
                        Spacer(minLength: 0)
                        if let tag {
                            Text(tag).textRole(.highlight).fixedSize()
                        }
                    }
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text(status).textRole(.cardStatus)
                            .fixedSize(horizontal: false, vertical: true)
                        if let tag {
                            Text(tag).textRole(.highlight)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(.trailing, Size.fold)
                captionText
            }
            HStack(alignment: .top, spacing: Spacing.m) {
                Avatar(name: sender, photo: senderPhoto, size: .card, on: .cover)
                Text(sender).textRole(.row)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .foregroundStyle(cover.ink)
        .padding(.horizontal, Size.foldedCardInset)
        .padding(.vertical, Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .foldedBackground(cover, radius: Radius.card)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var captionText: some View {
        switch caption {
        case .text(let text):
            Text(text).textRole(.caption)
        case .blank(let line):
            Text(line).textRole(.body)
        }
    }
}
