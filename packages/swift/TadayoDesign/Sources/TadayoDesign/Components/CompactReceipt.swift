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
/// 2.1's `F02-added` draws it with the same anatomy as its past-day block, which handoff 6 put in
/// the brand as `pastDayCard`; no handoff draws the receipt itself yet (handoff 7 asks, item 17g),
/// so it takes `pastDayCard`'s tokens on 2.1's anatomy, each gap at the nearest step of book p35's
/// scale:
/// - `canvas` with a 1-point `separator` border at the surface radius, 12, padded 16 at the sides
///   (2.1: 15) and 12 above and below, where the action's target stands in for the bottom padding
///   as far as it reaches past the action's words, so the words end about as far above the border
///   as the title starts below it (2.1 draws the action close to the bottom edge);
/// - the check in a 28-point `surface` disc, in `secondaryText`, hidden from VoiceOver, 12 before
///   the text (2.1: 11), which so starts 56 in where both drawings start it at 53; the disc grows
///   with the text as the check does, as the drafts row's folder box does, so the check stays in
///   it;
/// - the title in `row` 17/22 (2.1 draws 15 bold, the sheet's past-day block 16 bold; `row` is
///   the brand's role for a title line in a row), 4 above the date line in `metadata`
///   `secondaryText` ("November 13 · Opens at 7 AM"; the sheet's baselines 22 apart);
/// - "Make my highlight" (book p8, p15: optional, never forced) in `textAction` 16/22 and
///   `action` ink, leading, in a 44-point target (2.1 draws 13 bold), offered only while this drop
///   isn't already the highlight, so it never offers what is done (T49).
/// VoiceOver reads the receipt as one element, "Added for Debby’s Friday. Opens Friday, November
/// 13, 2026 at 7 AM, New York." (FQ91), and the action as a button.
public struct CompactReceipt: View {
    let drop: AddedDrop
    let labels: DateLabels
    let makeHighlight: () -> Void

    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var disc = Size.receiptDisc
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var check = Size.receiptCheck
    @ScaledMetric(relativeTo: TypeRole.textAction.textStyle)
    private var actionLine = TypeRole.textAction.lineHeight

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
