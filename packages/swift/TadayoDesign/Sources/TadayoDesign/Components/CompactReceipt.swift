import SwiftUI
import TadayoCore

/// The compact receipt after a drop is added (book p15: "Only the ready server commit becomes
/// Added… The compact receipt appears in the originating context, naming person and full date";
/// book p8: "Added for Debby’s Friday is enough"). Show it only for the server's commit response,
/// the contract's `DropReceipt`, whose state is `added`: never for a draft, a pending, uploading
/// or processing drop (T20), and the same receipt again for a retried commit (T19). No
/// celebration and no sound (T48), and no allowance: that stays quiet and private in the
/// composer (book p15).
///
/// Handoff 7's `compactReceipt` draws it in the brand, on 2.1's `F02-added` anatomy:
/// - `canvas` with a 1-point `separator` border at the surface radius, 12, padded 16 at the sides
///   and 12 above and below, where the action's target stands in for the bottom padding as far as
///   it reaches past the action's words, and the full 12 returns once the words fill it
///   (`actionInsets`: "Action target can consume bottom inset at default; at wrapped sizes full 12
///   below target content"). Handoff 7's specimens draw 16 at the top and keep the 12 under the
///   target; the written values win, as the check of handoff 7 reads them (D-06, X-09);
/// - the check in a `surface` disc, in `secondaryText`, hidden from VoiceOver, 12 before the
///   text: 28 points with a 12-point check at the default size, both growing with `row` text
///   (`checkDisc`: "default 28 … scalesWith row"), the disc's top level with the title's. At AX5
///   that is about 87 points, where the largest-text specimen draws 64 (the check asks Claude
///   Design whether 64 is a cap: V-10);
/// - the title in `row` 17/22, 4 above the date line in `metadata` `secondaryText` ("November 13 ·
///   Opens at 7 AM": `handoff7.receipt.opening`, with the year where FQ44 asks, which that key has
///   no slot for: D-02);
/// - "Make my highlight" (book p8, p15: optional, never forced) in `textAction` 16/22 and
///   `action` ink, leading, in a 44-point target, offered only while this drop isn't already the
///   highlight, so it never offers what is done (T49). B4 adds the server's permission before the
///   cutoff (`highlightAction`).
/// VoiceOver reads the receipt as one element, "Added for Debby’s Friday. Opens Friday, November
/// 13, 2026 at 7 AM, New York." (handoff 7's `vo.receipt`), and the action as a button with the
/// hint "Choose this drop as your highlight for Debby’s Friday." (`vo.receipt.highlightHint`). B4
/// announces the receipt once after a commit, never again on a replay (`compactReceipt.announce`).
public struct CompactReceipt: View {
    let drop: AddedDrop
    let labels: DateLabels
    let makeHighlight: () -> Void

    @ScaledMetric(relativeTo: TypeRole.textAction.textStyle)
    private var actionLine = TypeRole.textAction.lineHeight

    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var disc = Size.receiptDisc
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var check = Size.receiptCheck

    public init(
        _ drop: AddedDrop, labels: DateLabels, makeHighlight: @escaping () -> Void
    ) {
        self.drop = drop
        self.labels = labels
        self.makeHighlight = makeHighlight
    }

    private var occasion: Occasion { drop.occasion }
    private var offersHighlight: Bool { !drop.isHighlight }

    /// The padding under the last line: 12, less the part of the action's 44-point target that
    /// reaches below its words (half of what the target has beyond the action's line), which is
    /// all of it at the default size and none once the words fill the target.
    private var bottomPadding: CGFloat {
        guard offersHighlight else { return Spacing.m }
        return max(0, Spacing.m - max(0, (Size.touchTarget - actionLine) / 2))
    }

    private var title: String {
        String(
            format: String(localized: "receipt.added", bundle: .module),
            labels.personDay(name: occasion.star, date: occasion.date))
    }

    private var when: String {
        String(
            format: String(localized: "receipt.opens", bundle: .module),
            labels.dayMonth(occasion.date, includingYear: occasion.includingYear),
            labels.time(occasion.opensAt, in: occasion.zone))
    }

    private var highlightHint: String {
        String(
            format: String(localized: "receipt.makeHighlight.hint", bundle: .module),
            labels.personDay(name: occasion.star, date: occasion.date))
    }

    private var spoken: String {
        Spoken.sentences([
            title,
            String(
                format: String(localized: "opens.vo", bundle: .module),
                Spoken.opening(occasion, labels)),
        ])
    }

    public var body: some View {
        HStack(alignment: .top, spacing: Spacing.m) {
            Image(systemName: "checkmark")
                .font(.system(size: check, weight: .semibold))
                .foregroundStyle(Palette.secondaryText)
                .frame(width: disc, height: disc)
                .background(Palette.surface, in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text(verbatim: title)
                        .textRole(.row)
                        .foregroundStyle(Palette.primaryText)
                    Text(verbatim: when)
                        .textRole(.metadata)
                        .foregroundStyle(Palette.secondaryText)
                }
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(verbatim: spoken))
                if offersHighlight {
                    Button(
                        String(localized: "receipt.makeHighlight", bundle: .module),
                        action: makeHighlight
                    )
                    .buttonStyle(ReceiptActionStyle())
                    .accessibilityHint(Text(verbatim: highlightHint))
                }
            }
        }
        .padding(.horizontal, Spacing.l)
        .padding(.top, Spacing.m)
        .padding(.bottom, bottomPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.canvas, in: RoundedRectangle(cornerRadius: Radius.surface))
        .overlay {
            RoundedRectangle(cornerRadius: Radius.surface)
                .strokeBorder(Palette.separator, lineWidth: Size.secondaryBorder)
        }
    }
}

/// The receipt's action: the text action's role and inks, leading, in a 44-point target.
private struct ReceiptActionStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .textRole(.textAction)
            .foregroundStyle(configuration.isPressed ? Palette.actionPressed : Palette.action)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, minHeight: Size.touchTarget, alignment: .leading)
            .contentShape(Rectangle())
    }
}
