import SwiftUI
import TadayoCore

/// A drop as one viewer may see it, in each of the separate variants book p34 names: "Private
/// draft, uploading, processing, committed collecting caption, revealed media and
/// removed/unavailable are separate variants" (TECH-DESIGN section 4).
///
/// Each state's input has room only for what its viewer may know. The component can't decide
/// who that viewer is: the screen maps the server's answer onto these states, and B4 adds that
/// one mapping, from the contract's `DropCard` union, with its tests.
/// - **T10.** Before the reveal, a committed drop is a `HiddenDrop`: its caption, its media class,
///   its sender's name, photo and cover, and the occasion, which is what the contract's
///   `DropCaption` carries. It has no field for the photograph or anything taken from it (an
///   image, its size, a colour, a URL, a provider, a description). The component shows a
///   Highlight only when told the viewer is the author (`Viewer.author`; FQ21); which case
///   applies comes from the contract's `view` (`caption` is a member's, `own` the author's, as
///   only `DropOwn` carries the highlight), never from a clock (T1). The spoken label is made
///   here from those fields, so no caller can pass words that describe the media (T16).
/// - **T20.** No state takes its status words from the caller: the draft says "Not shared with
///   anyone", uploading and processing say "Not added yet", from `TadayoDesign`'s own string
///   catalog. None can read Added or Sent. Only `CompactReceipt` says "Added for", and it takes
///   an `AddedDrop`, which only the server's commit response may make (B4). That last part is a
///   rule for the caller, not something the type proves: `AddedDrop` holds an `Occasion`, as an
///   upload does, so B4's one mapping from the contract's `DropReceipt`, with its test, is what
///   keeps an upload from being shown as added.
/// - **T11.** The author's own card before the reveal shows the caption, never the photograph:
///   the preview lives in the author's tools.
/// - **T12.** Photographs arrive as `Image`, never as a URL or a token.
///
/// People's words (captions, names) are drawn verbatim, never read as Markdown or links (T13,
/// spec 14). Dates come from the server's occurrence in the club's zone (T1), written as the
/// phone's region writes them (FQ44, `DateLabels`).
///
/// Not variants yet, each with its stage: pending, failed, held and a committed drop's
/// replacement being checked (B4); a draft's intended target (B4); the star's own view of their
/// day, in handoff 5's `selfName` forms (B4); the travelling card (B4);
/// the author's own revealed drop, "Ben · You" (B5: `H01-your-day`, `R02-own`); a video (B7); the
/// revealed card's ··· control and actions (B6).
///
/// These are a view's inputs, not the upload queue's states: B4's queue in `TadayoCore` (pending,
/// uploading, processing, added, failed) maps onto them, as the screen's mapping of the contract
/// does.
public struct DropCard: View {
    public enum State: Sendable {
        /// Private preparation on the owner's device, not a drop (book p41, p46; T30).
        case privateDraft(PrivateDraft)
        /// The author's own transfer, with its real progress from 0 to 1, never simulated (T49).
        case uploading(OwnUpload, progress: Double)
        /// A new drop's photo has reached the server and is being checked, before the commit (the
        /// upload's `preparing`, and `ready` until the commit answers; FQ91). Never a committed
        /// drop's replacement (`OwnDropState.preparing`), which stays Added.
        case processing(OwnUpload)
        /// A committed caption while the day is collecting: the folded card.
        case collecting(HiddenDrop)
        /// The day is open.
        case revealed(RevealedDrop)
        /// Withdrawn or removed: nothing of the drop, the same whoever removed it and why (T25).
        case removed
    }

    let state: State
    let labels: DateLabels

    public init(_ state: State, labels: DateLabels) {
        self.state = state
        self.labels = labels
    }

    public var body: some View {
        switch state {
        case .privateDraft(let draft):
            DraftRow(draft: draft)
        case .uploading(let upload, let progress):
            UploadRow(upload: upload, phase: .uploading(progress), labels: labels)
        case .processing(let upload):
            UploadRow(upload: upload, phase: .processing, labels: labels)
        case .collecting(let drop):
            FoldedCard(drop, labels: labels)
        case .revealed(let drop):
            RevealedDropView(drop: drop)
        case .removed:
            RemovedDropView()
        }
    }
}

/// The occasion a drop is for: the star, the occurrence's date and the instant it opens, in the
/// club's zone, all from the server (T1, T41). The star is named, never the viewer: the star's
/// own view of their day takes handoff 5's `selfName` forms ("Your {weekday}", "you" for the
/// person), which come with B4. Its date and its opening are the same day: `reveal_at` is 7 AM on
/// `local_date` in the club's zone.
public struct Occasion: Sendable {
    public let star: String
    public let date: LocalDate
    public let opensAt: Date
    public let zone: TimeZone
    /// Whether a visible date shows its year: the screen decides (FQ44: not on Home or Friends in
    /// the current year; handoff 6's `travellingRows.targetYear`: a standalone specimen does).
    /// Spoken dates always carry it.
    public let includingYear: Bool

    public init(star: String, date: LocalDate, opensAt: Date, zone: TimeZone, includingYear: Bool) {
        self.star = star
        self.date = date
        self.opensAt = opensAt
        self.zone = zone
        self.includingYear = includingYear
    }
}

/// A drop's sender as members know them: the bare display name, never with "· You" (a component
/// adds the self form from its viewer, as `FoldedCard` does), and their own profile photo, if they
/// have one, from the avatar route, never anything of the drop. The type can't tell a profile
/// photo from the drop's photograph: B4's mapping from the contract's `Person` proves where it
/// comes from.
public struct Sender: Sendable {
    public let name: String
    public let photo: Image?

    public init(name: String, photo: Image?) {
        self.name = name
        self.photo = photo
    }
}

/// A private draft: the owner's photo and their note (book p22, p46). A draft with an intended
/// target has no delivered words yet (B4, C05).
public struct PrivateDraft: Sendable {
    public let photo: Image
    public let note: String?

    public init(photo: Image, note: String?) {
        self.photo = photo
        self.note = note
    }
}

/// The author's own drop on its way: their photo, converted on the device, their caption and
/// the occasion it is for (book p16: "Uploading names the intended occurrence"). Never another
/// member's.
public struct OwnUpload: Sendable {
    public let photo: Image
    public let caption: String?
    public let occasion: Occasion

    public init(photo: Image, caption: String?, occasion: Occasion) {
        self.photo = photo
        self.caption = caption
        self.occasion = occasion
    }
}

/// What a viewer may know of a committed drop before its day opens, and nothing else (T10;
/// the contract's `DropCaption` and `DropOwn`).
public struct HiddenDrop: Sendable {
    /// Whose card it is to the viewer, from the contract's `view`: another member's (`caption`)
    /// or their own (`own`).
    public enum Viewer: Sendable {
        case member
        /// The author's own drop, which alone can carry its Highlight before the reveal (FQ21).
        case author(isHighlight: Bool)
    }

    /// The contract's `media_class`, which T10 lets the audience know. Only photos have words
    /// yet ("Photo for Debby", book p13); a video link's comes with B7, which adds its case here.
    public enum MediaClass: Sendable {
        case photo
    }

    public let caption: String?
    public let mediaClass: MediaClass
    public let sender: Sender
    /// The sender's cover, from their membership's slot, never from the media (FQ41; book p13).
    public let cover: Cover
    public let occasion: Occasion
    public let viewer: Viewer

    public init(
        caption: String?, mediaClass: MediaClass, sender: Sender, cover: Cover,
        occasion: Occasion, viewer: Viewer
    ) {
        self.caption = caption
        self.mediaClass = mediaClass
        self.sender = sender
        self.cover = cover
        self.occasion = occasion
        self.viewer = viewer
    }
}

/// A drop once its day is open: the sender, the caption and the photograph from the media
/// route (`photo` is nil while it loads), and whether it is its sender's Highlight.
public struct RevealedDrop: Sendable {
    public let caption: String?
    public let sender: Sender
    public let photo: Image?
    public let isHighlight: Bool

    public init(caption: String?, sender: Sender, photo: Image?, isHighlight: Bool) {
        self.caption = caption
        self.sender = sender
        self.photo = photo
        self.isHighlight = isHighlight
    }
}

/// A drop the server has committed: what `CompactReceipt` shows. Make one only from the commit
/// response, the contract's `DropReceipt`, whose one state is `added` (T20); B4 adds that single
/// mapping, with its tests. Never from an upload's or a draft's occasion: the type can't tell,
/// since it holds nothing of the commit, so until that mapping and its test exist this is a
/// convention.
public struct AddedDrop: Sendable {
    public let occasion: Occasion
    /// Whether this drop is now its author's highlight for the occasion (the receipt's
    /// `highlight` pointer names it).
    public let isHighlight: Bool

    public init(occasion: Occasion, isHighlight: Bool) {
        self.occasion = occasion
        self.isHighlight = isHighlight
    }
}

/// The removed or withdrawn drop's neutral placeholder, kept only where it holds a place in an
/// open conversation (spec 15). It says spec 21's "This drop is no longer available" and nothing
/// of the drop: no sender, caption, time or reason (FQ91; T25; spec 22). No delivery draws it, so
/// it takes the brand's delivered surface box of secondary text, handoff 4's `approvalNote`
/// without its shield: `metadata` 13/18 in `secondaryText`, inset 16, `surface` at the surface
/// radius, at its own height, so nothing hints at what was there (handoff 7 asks).
struct RemovedDropView: View {
    var body: some View {
        Text(String(localized: "drop.removed", bundle: .module))
            .textRole(.metadata)
            .foregroundStyle(Palette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
            .padding(Spacing.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.surface))
            .accessibilityElement(children: .combine)
    }
}

/// Spoken labels where no template is delivered (FQ91): the visible parts in order, each read as
/// a sentence, and every opening read as the delivered templates read it.
enum Spoken {
    static func sentences(_ parts: [String]) -> String {
        parts.map { part in
            guard let last = part.last, !".!?…".contains(last) else { return part }
            return part + "."
        }
        .joined(separator: " ")
    }

    /// "Friday, November 13, 2026 at 7 AM": handoff 5's `{fullDateTime}`, with the year, in the
    /// club's zone (`DateLabels.fullDateTime`).
    static func fullDateTime(_ occasion: Occasion, _ labels: DateLabels) -> String {
        labels.fullDateTime(occasion.opensAt, in: occasion.zone)
    }

    /// "Friday, November 13, 2026 at 7 AM, New York": `{fullDateTime}, {clubZoneName}`, as every
    /// delivered spoken opening reads (handoff 5's `card.status.vo`, `friends.row.vo`).
    static func opening(_ occasion: Occasion, _ labels: DateLabels) -> String {
        String(
            format: String(localized: "date.inZone", bundle: .module),
            fullDateTime(occasion, labels),
            labels.zoneName(occasion.zone))
    }
}
