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
///   the caption. The lock scales with its text. The line keeps one date in the phone's region
///   form, with the year where FQ44 asks, rather than handoff 7's `drop.collecting.opening`
///   ("Opens {weekday}, {monthDay} · {time}"), which fixes the US order and has no year; its
///   en-US output is the same (the check of handoff 7, D-02 and X-10).
/// - **The caption** in `caption` 21/28. With none, book p13's neutral "Photo for Debby" in
///   `body`, with no placeholder joke (book p34); only a photo has such words yet. Handoff 7
///   draws no blank caption and says to omit it from VoiceOver; the book's visible words stay
///   until the B4 brief draws it (DM-01).
/// - **The author's own Highlight** (FQ21: before the reveal, only on the viewer's own drops)
///   follows the labelled star (book p6): `star.fill` at 12, 4 before the word in `highlight`
///   12/14, on its own line 12 clear under the caption (handoff 7's
///   `dropShapes.collectingCard.ownHighlight`: "Highlight on a separate line below caption with 12
///   clear gap"). The star scales with its word; the gap keeps its 4 points at every size, as
///   handoff 7's largest-text specimen draws it.
/// - **The sender:** their avatar at 28, which keeps its size, 12 before the name in `row`, level
///   with its first line (handoff 7 draws it higher at the largest size, and the check keeps the
///   first line's centre until Claude Design says: D-24). Their photo shows when they have one. To
///   its author the card reads "Ben · You" (`handoff5.calendar.person.self`). The sender row is
///   at least 16 below the block above it (handoff 7's specimens) and pinned to the card's foot
///   at the minimum height, as handoff 6's sheet draws it.
/// - **VoiceOver** reads one element: the sender, the caption, then `handoff5.card.status.vo`,
///   "Opens Friday, November 13, 2026 at 7 AM, New York. Hidden content." (INVENTORY.md's Known
///   differences, handoff 5's C-05), with the author's own Highlight after the caption, word for
///   word handoff 7's `vo.drop.collecting.other`, `.own` and `.ownHighlight`.
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
            spacing: Spacing.l
        ) {
            VStack(alignment: .leading, spacing: Spacing.l) {
                HStack(alignment: .firstTextBaseline, spacing: Spacing.s) {
                    lock
                    Text(verbatim: status).textRole(.cardStatus)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.trailing, Size.fold)
                VStack(alignment: .leading, spacing: Spacing.m) {
                    Text(verbatim: captionWords)
                        .textRole(drop.caption == nil ? .body : .caption)
                        .fixedSize(horizontal: false, vertical: true)
                    if isHighlight {
                        highlightTag.fixedSize(horizontal: false, vertical: true)
                    }
                }
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
        HStack(alignment: .firstTextBaseline, spacing: Size.highlightStarGap) {
            Image(systemName: "star.fill")
                .font(.system(size: starSize))
                .accessibilityHidden(true)
            Text(String(localized: "highlight.label", bundle: .module)).textRole(.highlight)
        }
    }
}
