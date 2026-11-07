import SwiftUI

/// A drop once its day is open (spec 15: "Regular drops are immediately readable once the
/// occurrence is available, without individual wrappers"), laid out as 2.1's `H01-open` draws
/// it, in the brand's colours and components (FQ40's default):
/// - the sender: their avatar at 28 with their photo, 8 before the name (2.1: 9) in `row` 17/22,
///   as on the folded card, where handoff 5 sets sender names in `row` (the frames draw 14, which
///   no role has);
/// - the caption in `body` 17/23, 8 below the avatar (2.1: 7.6), selectable (spec 15: "Captions
///   remain selectable for accessibility"); with none, no line at all (book p31), and the
///   photograph 8 below the avatar (2.1's `R01-blank-caption`);
/// - the photograph 12 below the caption (2.1: 12.4), the full width at 2.1's 353 by 304
///   (`Size.feedPhotoAspect`),
///   filled and clipped at the photo radius, 14 (book p34: "Feed aspect treatment is
///   predictable; a full viewer preserves source framing"). Never tinted or filtered. While it
///   loads, the same frame in `surface`, so nothing moves when it arrives (book p34);
/// - the sender's Highlight, when it is one, on the photograph's lower leading corner, 12 points
///   in (2.1's place; the sheet's specimen sits at the upper leading corner 14 in, and no
///   contract names one: handoff 7 asks).
///
/// VoiceOver reads one element: the sender, the caption, "Photo" and, for a highlight,
/// "Highlight" (FQ91), with no description until the contract carries spec 14's user-supplied
/// one, which belongs to the revealed drop alone (T10). The drop's ··· control and its
/// actions (react, comment, save) come with B6's reactions, comments, favourites and safety menu.
struct RevealedDropView: View {
    let drop: RevealedDrop

    private var spoken: String {
        var parts = [drop.sender.name]
        if let caption = drop.caption { parts.append(caption) }
        parts.append(String(localized: "drop.photo.vo", bundle: .module))
        if drop.isHighlight { parts.append(String(localized: "highlight.label", bundle: .module)) }
        return Spoken.sentences(parts)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstLineCenter, spacing: Spacing.s) {
                Avatar(name: drop.sender.name, photo: drop.sender.photo, size: .card)
                Text(verbatim: drop.sender.name)
                    .textRole(.row)
                    .foregroundStyle(Palette.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let caption = drop.caption {
                Text(verbatim: caption)
                    .textRole(.body)
                    .foregroundStyle(Palette.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                    .padding(.top, Spacing.s)
            }
            Color.clear
                .aspectRatio(Size.feedPhotoAspect, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .overlay {
                    if let photo = drop.photo {
                        photo.resizable().scaledToFill()
                    } else {
                        Palette.surface
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: Radius.photo))
                .overlay(alignment: .bottomLeading) {
                    if drop.isHighlight {
                        PhotoHighlightLabel().padding(Spacing.m)
                    }
                }
                .padding(.top, drop.caption == nil ? Spacing.s : Spacing.m)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: spoken))
    }
}

/// The Highlight label on a photograph (handoff 2's `photoHighlightLabel`, carried to handoff
/// 6): `star.fill` at 12, 4 before "Highlight" in `photoLabel` 11/14 bold, padded 6 above and
/// below (handoff 4's optical inset `photoHighlightBlock`) and 8 at the sides, 26 high at the
/// default size, radius 6, `photoLabel` with `onPhotoLabel` ink in both themes, no outline. "The
/// labels scale and grow with text" (handoff 2), star and padding included, but never past the
/// width it's given: on a photograph, the photograph's less its inset. At AX5 on a 320-point
/// screen the grown star and padding leave the word too little of that width, so it breaks
/// inside itself ("Highli" over "ght") rather than the label running off the photo; no delivery
/// draws the label at those sizes (INVENTORY.md's Known differences; the ios lane's needs list,
/// item 46). After the reveal every
/// highlight carries it in the feed (spec 15; INVENTORY.md's Known differences); before the
/// reveal nobody else sees a photograph to carry it (T10). The star is decorative: VoiceOver
/// reads "Highlight".
public struct PhotoHighlightLabel: View {
    @ScaledMetric(relativeTo: TypeRole.photoLabel.textStyle)
    private var starSize = Size.highlightStar
    @ScaledMetric(relativeTo: TypeRole.photoLabel.textStyle)
    private var starGap = Size.highlightStarGap
    @ScaledMetric(relativeTo: TypeRole.photoLabel.textStyle)
    private var vertical = Size.photoLabelBlock
    @ScaledMetric(relativeTo: TypeRole.photoLabel.textStyle)
    private var horizontal = Spacing.s

    public init() {}

    public var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: starGap) {
            Image(systemName: "star.fill")
                .font(.system(size: starSize))
                .accessibilityHidden(true)
            Text(String(localized: "highlight.label", bundle: .module))
                .textRole(.photoLabel)
        }
        .foregroundStyle(Palette.onPhotoLabel)
        .padding(.vertical, vertical)
        .padding(.horizontal, horizontal)
        .background(Palette.photoLabel, in: RoundedRectangle(cornerRadius: Radius.photoLabel))
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
    }
}
