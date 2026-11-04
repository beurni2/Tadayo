import SwiftUI

/// The folded card for a committed caption while the day is collecting (book p6, p13, p34;
/// handoff 0's brand-components and `F02-upcoming`: 353 wide at 393, 151 minimum height, growing
/// for text, 18 horizontal inset, caption 21/28). It shows what the audience may read before the
/// reveal and nothing else (T10): the lock and the status line with the exact opening date, the
/// caption and its sender. The lock is the glyph, never the word "Locked" (INVENTORY.md's Known
/// differences; book p6): `lock.fill` at 12 points, 8 before the text, in the cover's ink
/// (handoff 5's `collectingCardStatus.lock`). The author's own "Highlight" follows the labelled
/// star (book p6; INVENTORY.md's Known differences). The sender's avatar keeps its size beside
/// the name, level with its first line, at every text size (handoff 4's
/// `dynamicTypePolicy.avatarMarks`). A drop with no caption shows the neutral line book p13 names
/// ("Photo for Debby"), in smaller text, and no placeholder joke (book p34).
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
    ///   - status: the status line after the lock, such as "Opens Fri, Nov 13".
    ///   - tag: the author's own "Highlight" at the status line's end, after the star, or nil.
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

    @ScaledMetric(relativeTo: TypeRole.cardStatus.textStyle) private var lockSize = Size.lockGlyph
    @ScaledMetric(relativeTo: TypeRole.highlight.textStyle)
    private var starSize = Size.highlightStar
    @ScaledMetric(relativeTo: TypeRole.highlight.textStyle)
    private var starGap = Size.highlightStarGap

    public var body: some View {
        PinnedFooterLayout(
            minHeight: Size.foldedCardMinHeight - 2 * Spacing.l, spacing: Spacing.xxl
        ) {
            VStack(alignment: .leading, spacing: Spacing.l) {
                // The tag sits beside the status while both fit on one line, and under it when
                // they don't, so neither word is ever broken (book p26).
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: Spacing.s) {
                        lock
                        Text(status).textRole(.cardStatus).fixedSize()
                        Spacer(minLength: 0)
                        if let tag {
                            highlightTag(tag).fixedSize()
                        }
                    }
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        HStack(alignment: .firstTextBaseline, spacing: Spacing.s) {
                            lock
                            Text(status).textRole(.cardStatus)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if let tag {
                            highlightTag(tag).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(.trailing, Size.fold)
                captionText
            }
            HStack(alignment: .firstLineCenter, spacing: Spacing.m) {
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

    /// Decorative: the status line already says when the card opens.
    private var lock: some View {
        Image(systemName: "lock.fill")
            .font(.system(size: lockSize))
            .accessibilityHidden(true)
    }

    /// The star is decorative: the word says it.
    private func highlightTag(_ tag: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: starGap) {
            Image(systemName: "star.fill")
                .font(.system(size: starSize))
                .accessibilityHidden(true)
            Text(tag).textRole(.highlight)
        }
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
