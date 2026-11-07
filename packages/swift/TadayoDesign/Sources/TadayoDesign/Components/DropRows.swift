import SwiftUI
import TadayoCore

/// The thumbnail rows of the owner's own drops that aren't added: the private draft (2.1's
/// `C05-drafts`) and the upload, uploading or processing (2.1's `C07-uploading`; processing has
/// no render). Built from 2.1's rows in the brand's tokens, since no handoff draws them yet
/// (handoff 7 asks):
/// - the owner's photo at `Size.dropThumbnail`, 76 by 92, filled and clipped at the photo
///   radius, 14, where 2.1 draws about 8; it keeps its size and is hidden from VoiceOver, since
///   the words say what it is;
/// - its text 12 points after it, the first line in `row` 17/22 and the others in `metadata`
///   13/18 `secondaryText`, as the brand's rows set them (2.1 draws 16 and 13);
/// - the text centred on the photo while it is shorter, and the photo at the top once the text
///   is taller, so a row grows with the text and never clips it (book p26).
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

/// The private draft's row (2.1's `C05-drafts`): its photo, "Choose a friend later", the owner's
/// note and "Not shared with anyone", with a chevron, as `privateDraftsEntry` sets one (20-point
/// box, `secondaryText`). It is private preparation, not a drop (book p41), so it never says
/// Added, Pending or Sent, and names no person, club or date (book p46).
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
/// and says Not added yet"; book p41: "Uploading/Processing = not confirmed"): its photo, "For
/// Debby’s Friday", the date and time it opens, the caption, then the state. Uploading draws the
/// transfer's real progress with the system bar in `action` (T45, T49) and says "Uploading · Not
/// added yet" (2.1's `C07-uploading`). Processing, once the photo has reached the server and is
/// being checked, has no bar, since there is no progress to show, and says "Processing · Not
/// added yet" (FQ91; no render). Neither can say Added (T20).
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
                Text(verbatim: caption).secondaryLine()
            }
            if case .uploading(let progress) = phase {
                ProgressView(value: progress)
                    .tint(Palette.action)
                    .padding(.vertical, Spacing.xs)
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

/// The transfer's progress as VoiceOver's value, "57%", as the system bar would say it.
private struct ProgressValue: ViewModifier {
    let phase: UploadRow.Phase

    @ViewBuilder func body(content: Content) -> some View {
        if case .uploading(let progress) = phase {
            content.accessibilityValue(
                Text(verbatim: progress.formatted(.percent.precision(.fractionLength(0)))))
        } else {
            content
        }
    }
}

extension Text {
    /// A row's later line: `metadata` 13/18 in `secondaryText`, wrapping.
    fileprivate func secondaryLine() -> some View {
        textRole(.metadata)
            .foregroundStyle(Palette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
    }
}
