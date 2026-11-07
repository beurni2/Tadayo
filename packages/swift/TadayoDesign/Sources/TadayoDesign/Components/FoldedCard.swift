import SwiftUI
import TadayoCore

/// The folded card: a committed caption while the day is collecting (book p6, p13, p34), as
/// handoff 5 corrected it on handoff 6's sheet (`brand-components.png`). It shows what the
/// audience may read before the reveal and nothing else (T10): the lock and the status line with
/// the exact opening date, the caption and its sender (`HiddenDrop`).
///
/// - **Geometry** (handoff 4's `componentGeometry.collectingCard`, handoff 5's
///   `collectingCardStatus`): the content width less 2 × 20, at least 151 points high at the
///   default size and growing with the text, with no maximum; inset 18 on every side (the
///   contract's one inset; on the sheet the status line's box starts 17.5 below the top and the
///   avatar ends 18 above the bottom); radius 16; the fold 18 with its 0.75 line. A single line
///   of text is the system font's own height here, not the role's line height (TypeRole adds
///   leading only between lines: INVENTORY.md's Known differences), so the caption sits about 4
///   points higher than the sheet's 18/28 line boxes put it.
/// - **The status line:** `lock.fill` at 12 points, 8 before the text, in the cover's ink, before
///   the reveal only; never the word "Locked" (INVENTORY.md's Known differences). The words are
///   `handoff5.card.status`, "Opens Friday, November 13 · 7 AM", in `cardStatus` 13/18, 16 above
///   the caption. The lock scales with its text.
/// - **The caption** in `caption` 21/28. With none, book p13's neutral "Photo for Debby" in
///   `body`, with no placeholder joke (book p34); only a photo has such words yet.
/// - **The sender:** their avatar at 28, which keeps its size, 12 before the name in `row`, level
///   with its first line. Their photo shows when they have one. To its author the card reads
///   "Ben · You" (`handoff5.calendar.person.self`).
/// - **The author's own Highlight** (FQ21: before the reveal, only on the viewer's own drops)
///   follows the labelled star (book p6), `star.fill` at 12, 4 before the word in `highlight`
///   12/14, at the status line's end while both fit, and under it when they don't. No delivery
///   gives its size or place: handoff 7 asks. The star scales with its word.
/// - **VoiceOver** reads one element: the sender, the caption, then `handoff5.card.status.vo`,
///   "Opens Friday, November 13, 2026 at 7 AM, New York. Hidden content." (INVENTORY.md's Known
///   differences, handoff 5's C-05), with the author's own Highlight after the caption (FQ91).
public struct FoldedCard: View {
    let drop: HiddenDrop
    let labels: DateLabels

    public init(_ drop: HiddenDrop, labels: DateLabels) {
        self.drop = drop
        self.labels = labels
    }

    @ScaledMetric(relativeTo: TypeRole.cardStatus.textStyle) private var lockSize = Size.lockGlyph
    @ScaledMetric(relativeTo: TypeRole.highlight.textStyle)
    private var starSize = Size.highlightStar
    @ScaledMetric(relativeTo: TypeRole.highlight.textStyle)
    private var starGap = Size.highlightStarGap

    private var isHighlight: Bool {
        if case .author(let isHighlight) = drop.viewer { return isHighlight }
        return false
    }

    private var status: String {
        let occasion = drop.occasion
        return String(
            format: String(localized: "card.status", bundle: .module),
            labels.fullDate(occasion.date, includingYear: occasion.includingYear),
            labels.time(occasion.opensAt, in: occasion.zone))
    }

    private var sender: String {
        switch drop.viewer {
        case .member: drop.sender.name
        case .author:
            String(format: String(localized: "person.self", bundle: .module), drop.sender.name)
        }
    }

    private var captionWords: String {
        if let caption = drop.caption { return caption }
        switch drop.mediaClass {
        case .photo:
            return String(
                format: String(localized: "card.blank", bundle: .module), drop.occasion.star)
        }
    }

    private var spoken: String {
        let who =
            switch drop.viewer {
            case .member: drop.sender.name
            case .author:
                String(
                    format: String(localized: "person.self.vo", bundle: .module), drop.sender.name)
            }
        let opens = String(
            format: String(localized: "card.status.vo", bundle: .module),
            Spoken.fullDateTime(drop.occasion, labels), labels.zoneName(drop.occasion.zone))
        var parts = [who, captionWords]
        if isHighlight { parts.append(String(localized: "highlight.label", bundle: .module)) }
        parts.append(opens)
        return Spoken.sentences(parts)
    }

    public var body: some View {
        PinnedFooterLayout(
            minHeight: Size.foldedCardMinHeight - 2 * Size.foldedCardInset,
            spacing: Spacing.xxl
        ) {
            VStack(alignment: .leading, spacing: Spacing.l) {
                // The tag sits beside the status while both fit on one line, and under it when
                // they don't, so neither word is ever broken (book p26).
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: Spacing.s) {
                        lock
                        Text(verbatim: status).textRole(.cardStatus).fixedSize()
                        Spacer(minLength: 0)
                        if isHighlight {
                            highlightTag.fixedSize()
                        }
                    }
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        HStack(alignment: .firstTextBaseline, spacing: Spacing.s) {
                            lock
                            Text(verbatim: status).textRole(.cardStatus)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if isHighlight {
                            highlightTag.fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(.trailing, Size.fold)
                Text(verbatim: captionWords)
                    .textRole(drop.caption == nil ? .body : .caption)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(alignment: .firstLineCenter, spacing: Spacing.m) {
                Avatar(name: drop.sender.name, photo: drop.sender.photo, size: .card, on: .cover)
                Text(verbatim: sender).textRole(.row)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .foregroundStyle(drop.cover.ink)
        .padding(Size.foldedCardInset)
        .frame(maxWidth: .infinity, alignment: .leading)
        .foldedBackground(drop.cover, radius: Radius.card)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: spoken))
    }

    /// Decorative: the status line already says when the card opens.
    private var lock: some View {
        Image(systemName: "lock.fill")
            .font(.system(size: lockSize))
            .accessibilityHidden(true)
    }

    /// The star is decorative: the word says it.
    private var highlightTag: some View {
        HStack(alignment: .firstTextBaseline, spacing: starGap) {
            Image(systemName: "star.fill")
                .font(.system(size: starSize))
                .accessibilityHidden(true)
            Text(String(localized: "highlight.label", bundle: .module)).textRole(.highlight)
        }
    }
}
