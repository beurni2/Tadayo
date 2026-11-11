import SwiftUI
import TadayoCore

/// The thumbnail rows of the owner's own drops that aren't added: the private draft (2.1's
/// `C05-drafts`) and the upload, uploading or processing (2.1's `C07-uploading`), as handoff 7's
/// `dropShapes.thumbnailRow` draws them:
/// - the owner's photo at `Size.dropThumbnail`, 76 by 92, filled and clipped at the photo
///   radius, 14; it keeps its size and is hidden from VoiceOver, since the words say what it is;
/// - its text 12 points after it, the first line in `row` 17/22 and the others in `metadata`
///   13/18;
/// - the text centred on the photo while it is shorter, and the photo at the top once the text
///   is taller, so a row grows with the text and never clips it (handoff 7: "Center text block
///   against photo if shorter; otherwise align photo to first line and let row grow").
/// The list around them draws any separators.
struct ThumbnailRow<Lines: View, Trailing: View>: View {
    let photo: Image
    @ViewBuilder let lines: Lines
    @ViewBuilder let trailing: Trailing

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.m) {
            photo
                .resizable()
                .scaledToFill()
                .frame(width: Size.dropThumbnail.width, height: Size.dropThumbnail.height)
                .clipShape(RoundedRectangle(cornerRadius: Radius.photo))
                .accessibilityHidden(true)
            HStack(spacing: Spacing.m) {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    lines
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                trailing
            }
            .frame(minHeight: Size.dropThumbnail.height)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The private draft's row (2.1's `C05-drafts`; handoff 7's draft specimen): its photo, "Choose a
/// friend later", the owner's note and "Not shared with anyone" in `secondaryText`, with a
/// chevron, as `privateDraftsEntry` sets one (20-point box, `secondaryText`), since a tap opens
/// the draft: handoff 7's specimen leaves the chevron out without saying why, so it stays until
/// the next brief answers (the check of handoff 7, D-08). It is private preparation, not a drop
/// (book p41), so it never says Added, Pending or Sent, and names no person, club or date (book
/// p46). VoiceOver reads its words in order, as handoff 7's `vo.drop.draft` does.
struct DraftRow: View {
    let draft: PrivateDraft

    @ScaledMetric(relativeTo: TypeRole.row.textStyle)
    private var chevronBox = Size.draftsChevronBox
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var chevron = Size.draftsChevron

    private var words: [String] {
        [String(localized: "drop.draft.title", bundle: .module)] + (draft.note.map { [$0] } ?? [])
            + [String(localized: "drop.draft.private", bundle: .module)]
    }

    var body: some View {
        ThumbnailRow(photo: draft.photo) {
            Text(String(localized: "drop.draft.title", bundle: .module))
                .textRole(.row)
                .foregroundStyle(Palette.primaryText)
                .fixedSize(horizontal: false, vertical: true)
            if let note = draft.note {
                Text(verbatim: note).secondaryLine()
            }
            Text(String(localized: "drop.draft.private", bundle: .module)).secondaryLine()
        } trailing: {
            Image(systemName: "chevron.right")
                .font(.system(size: chevron))
                .foregroundStyle(Palette.secondaryText)
                .frame(width: chevronBox)
                .accessibilityHidden(true)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: Spoken.sentences(words)))
    }
}

/// The author's upload before it is added (book p16: "Uploading names the intended occurrence
/// and says Not added yet"; book p41: "Uploading/Processing = not confirmed"), as handoff 7's
/// thumbnail specimens draw it: its photo, "For Debby’s Friday" in `primaryText`, the date and
/// "Opens at" its time in `secondaryText` (`handoff7.drop.opening`, "{monthDay} · Opens at
/// {time}", with the year where FQ44 asks, which that key has no slot for: the check of handoff
/// 7, D-02), the caption in `primaryText` at `metadata` (the specimens' caption ink), then the
/// state in `secondaryText`. Uploading draws the transfer's real progress with the system bar in
/// `action` (T45, T49), 8 below the caption and 12 above the state, and says "Uploading · Not
/// added yet". Processing, once the photo has reached the server and is being checked, has no bar
/// and no spinner, since there is no progress to show, and says "Processing · Not added yet"
/// (FQ91 (a), which handoff 7 confirms). Neither can say Added (T20). VoiceOver reads the words
/// as handoff 7's `vo.drop.uploading` and `vo.drop.processing` do, with the progress as the value,
/// "57 percent" (`vo.drop.progress`).
struct UploadRow: View {
    enum Phase {
        case uploading(Double)
        case processing
    }

    let upload: OwnUpload
    let phase: Phase
    let labels: DateLabels

    private var occasion: Occasion { upload.occasion }

    private var title: String {
        String(
            format: String(localized: "drop.for", bundle: .module),
            labels.personDay(name: occasion.star, date: occasion.date))
    }

    private var when: String {
        String(
            format: String(localized: "drop.when", bundle: .module),
            labels.dayMonth(occasion.date, includingYear: occasion.includingYear),
            labels.time(occasion.opensAt, in: occasion.zone))
    }

    private var status: String {
        switch phase {
        case .uploading: String(localized: "drop.uploading", bundle: .module)
        case .processing: String(localized: "drop.processing", bundle: .module)
        }
    }

    private var spoken: String {
        let date = String(
            format: String(localized: "opens.vo", bundle: .module), Spoken.opening(occasion, labels)
        )
        let state =
            switch phase {
            case .uploading: String(localized: "drop.uploading.vo", bundle: .module)
            case .processing: String(localized: "drop.processing.vo", bundle: .module)
            }
        return Spoken.sentences([title, date] + (upload.caption.map { [$0] } ?? []) + [state])
    }

    var body: some View {
        ThumbnailRow(photo: upload.photo) {
            Text(verbatim: title)
                .textRole(.row)
                .foregroundStyle(Palette.primaryText)
                .fixedSize(horizontal: false, vertical: true)
            Text(verbatim: when).secondaryLine()
            if let caption = upload.caption {
                Text(verbatim: caption)
                    .textRole(.metadata)
                    .foregroundStyle(Palette.primaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if case .uploading(let progress) = phase {
                // With the column's 4 points: 8 above the bar and 12 below it.
                ProgressView(value: Transfer.fraction(progress))
                    .tint(Palette.action)
                    .padding(.top, Spacing.xs)
                    .padding(.bottom, Spacing.s)
            }
            Text(verbatim: status).secondaryLine()
        } trailing: {
            EmptyView()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: spoken))
        .modifier(ProgressValue(phase: phase))
    }
}

/// The transfer's progress as VoiceOver's value, "57 percent" (handoff 7's `vo.drop.progress`,
/// "{percentage} percent"), the whole percentage in the phone's own number form.
private struct ProgressValue: ViewModifier {
    let phase: UploadRow.Phase

    @ViewBuilder func body(content: Content) -> some View {
        if case .uploading(let progress) = phase {
            content.accessibilityValue(
                Text(
                    verbatim: String(
                        format: String(localized: "drop.progress.vo", bundle: .module),
                        Transfer.percent(progress).formatted())))
        } else {
            content
        }
    }
}

/// The transfer's progress as the bar and VoiceOver take it, so neither claims more than the
/// transfer has done (T49) and no value can stop the row: a value outside 0 to 1 is held at its
/// end, and one that isn't a number (a transfer of no known size) is 0.
private enum Transfer {
    static func fraction(_ progress: Double) -> Double {
        progress.isFinite ? min(max(progress, 0), 1) : 0
    }

    /// The whole percentage, to the nearest, and 100 only once the transfer is complete: 0.995 is
    /// still "99 percent" while the row says Uploading.
    static func percent(_ progress: Double) -> Int {
        let fraction = fraction(progress)
        return fraction < 1 ? min(99, Int((fraction * 100).rounded())) : 100
    }
}

extension View {
    /// A row's later line: `metadata` 13/18 in `secondaryText`, wrapping. On `View`, so it shares
    /// the protocol's main-actor isolation with `textRole` (an extension on `Text` alone doesn't).
    fileprivate func secondaryLine() -> some View {
        textRole(.metadata)
            .foregroundStyle(Palette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
    }
}
