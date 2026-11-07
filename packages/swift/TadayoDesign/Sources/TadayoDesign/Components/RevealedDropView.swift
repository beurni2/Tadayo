import SwiftUI
import UIKit

/// A drop once its day is open (spec 15: "Regular drops are immediately readable once the
/// occurrence is available, without individual wrappers"), laid out as handoff 7's
/// `dropShapes.revealedItem` draws it (2.1's `H01-open` in the brand, which supersedes handoff 0's
/// anatomy):
/// - the sender: their avatar at 28 with their photo, 8 before the name in `row` 17/22, the
///   avatar level with the name's first line (handoff 7 draws it higher at the largest size, and
///   the check keeps the first line's centre until Claude Design says: D-24);
/// - the caption in `body` 17/23, 8 below the taller of the avatar and the name, selectable (spec
///   15: "Captions remain selectable for accessibility"); with none, no line at all (book p31),
///   and the photograph 8 below the sender (2.1's `R01-blank-caption`);
/// - the photograph 12 below the caption, the full width at 353 by 304 (`Size.feedPhotoAspect`),
///   filled and clipped at the photo radius, 14 (book p34: "Feed aspect treatment is
///   predictable; a full viewer preserves source framing"). Never tinted or filtered. While it
///   loads, the same frame in `surface`, so nothing moves when it arrives (book p34). A text
///   screenshot would be fitted, not filled, but nothing yet says which photo is one (FQ94);
/// - the sender's Highlight, when it is one, on the photograph's lower leading corner, 12 points
///   in (handoff 7's `revealedItem.photoHighlightLabel`).
///
/// VoiceOver reads it as a container of separate elements (handoff 7's `revealedItem.a11y`), in
/// FQ91 (c)'s words and order: the sender's name (the avatar is hidden); the caption, still
/// selectable, with a Copy caption action that puts it on the pasteboard word for word, for
/// VoiceOver and Switch Control; and the photograph with its label, "Photo." or "Photo.
/// Highlight." (`vo.drop.photo`, `vo.drop.photoHighlight`), with no description until the
/// contract carries spec 14's user-supplied one, which belongs to the revealed drop alone (T10).
/// The drop's ··· control and its actions (react, comment, save) work from B6, with its
/// reactions, comments, favourites and safety menu. This view leaves them out: whether B5's day
/// shows them doing nothing (FQ95's default, FQ85's reading) or leaves them out (handoff 7:
/// "Before B6 omit future controls rather than disabled placeholders") is FQ95's.
struct RevealedDropView: View {
    let drop: RevealedDrop

    private var photoSpoken: String {
        var parts = [String(localized: "drop.photo.vo", bundle: .module)]
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
                    .accessibilityAction(
                        named: Text(String(localized: "drop.captionCopy.vo", bundle: .module))
                    ) {
                        UIPasteboard.general.string = caption
                    }
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
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(verbatim: photoSpoken))
                .padding(.top, drop.caption == nil ? Spacing.s : Spacing.m)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }
}

/// The Highlight label on a photograph (handoff 2's `photoHighlightLabel`, as handoff 7's
/// `revealedItem.photoHighlightLabel` draws it at every size): `star.fill` at 12, 4 before
/// "Highlight" in `photoLabel` 11/14 bold, padded 6 above and below (handoff 4's optical inset
/// `photoHighlightBlock`) and 8 at the sides, 26 high at the default size, radius 6,
/// `photoLabel` with `onPhotoLabel` ink in both themes, no outline. The star and the word grow
/// with the text; the padding and the gap keep their size ("Star scales with photoLabel, block
/// height intrinsic, no 26-point height cap"), and the label never runs past the width it's given:
/// on a photograph, the photograph's less its inset. At AX5 on a 320-point screen it reads
/// "Highlight" whole on one line (`Lab-revealed-320-xl`); the width only keeps a longer word, in
/// another language, from running off the photo. After the reveal every highlight carries it in
/// the feed (spec 15; INVENTORY.md's Known differences); before the reveal nobody else sees a
/// photograph to carry it (T10). The star is decorative: VoiceOver reads "Highlight".
public struct PhotoHighlightLabel: View {
    @ScaledMetric(relativeTo: TypeRole.photoLabel.textStyle)
    private var starSize = Size.highlightStar

    public init() {}

    public var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Size.highlightStarGap) {
            Image(systemName: "star.fill")
                .font(.system(size: starSize))
                .accessibilityHidden(true)
            Text(String(localized: "highlight.label", bundle: .module))
                .textRole(.photoLabel)
        }
        .foregroundStyle(Palette.onPhotoLabel)
        .padding(.vertical, Size.photoLabelBlock)
        .padding(.horizontal, Spacing.s)
        .background(Palette.photoLabel, in: RoundedRectangle(cornerRadius: Radius.photoLabel))
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
    }
}
