import SwiftUI
import TadayoCore
import TadayoDesign

/// G06-switcher, G06-switcher-status and G06-switcher-unavailable: the account's clubs, in the
/// system's sheet, opened from the header's selector or a suspended club's Choose a club.
///
/// "Your clubs" in `emptyTitle` 25/30, as a heading; one row per club in the list's order, its
/// name in `row` 17/22 `primaryText` over its line in `metadata` 13/18 `secondaryText`, 4 apart
/// as in Private drafts and the roster's rows, 12 above and below, so rows are about 64 apart
/// with 20 between a name's baseline and its line's, where the frames draw 64 and 22; a
/// separator under each, and the selected row's `checkmark` in `action` (handoff 6's
/// `switcherStatus`: "Native checkmark + spoken selected trait; no cover colour, lock, next date
/// or countdown"); then Club details, Create a club and Cancel as text actions, 16 under the last
/// separator so no target overlaps another (INVENTORY.md, handoff 6's W-11), 8 apart, as the
/// frames draw them 52 apart. The gaps the frames draw and `handoff6.spacing` doesn't name take
/// the scale's nearest step: "Your clubs" 32 under the sheet's top (29 drawn), the first row 12
/// under it (13 drawn).
///
/// A row's line (`SwitcherLine`) is the state's word for a club that isn't active ("Not started",
/// "Paused", "Unavailable", and nothing else of a suspended club: T9), and for an active one its
/// members, "5 people", with its next day's star ("5 people · Next: Maya",
/// `handoff6.switcher.active.row`) or, while a day is open, the star's day as `G06-switcher`
/// draws it ("6 people · Debby’s Friday", the weekday the server's date for it). VoiceOver reads
/// a row as its name then its line, as sentences (`handoff5.switcher.row.vo`,
/// `handoff6.switcher.active.row.vo`), and the selected row's native Selected trait says
/// Selected once (`handoff6.switcher.row.selected.vo`).
///
/// Choosing a row selects that club and closes the sheet; Cancel closes it. Club details closes
/// it and opens the selected club's details (`TabsView`; for a suspended club, the same "Club
/// unavailable" as Home, FQ80). Create a club shows and does nothing until plan PR 4 (FQ85). The
/// content scrolls when it is taller than the sheet can be, at the largest text sizes.
struct ClubSwitcher: View {
    let clubs: [ClubSummary]
    let selectedID: String?
    let select: (String) -> Void
    var openDetails: () -> Void = {}
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("switcher.title")
                    .textRole(.emptyTitle)
                    .foregroundStyle(Palette.primaryText)
                    .accessibilityAddTraits(.isHeader)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Spacing.xxxl)
                    .padding(.bottom, Spacing.m)
                ForEach(clubs) { club in
                    SwitcherRow(club: club, selected: club.id == selectedID) {
                        select(club.id)
                        dismiss()
                    }
                }
                VStack(spacing: Spacing.s) {
                    Button("switcher.clubDetails") {
                        openDetails()
                        dismiss()
                    }
                    Button("switcher.createClub") {}
                    Button("common.cancel") { dismiss() }
                }
                .buttonStyle(.tadayoText)
                .padding(.top, Spacing.l)
            }
            .padding(.horizontal, Spacing.inset)
            .padding(.bottom, Spacing.l)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background { Palette.canvas.ignoresSafeArea() }
    }
}

/// One club in the switcher: a button the width of the sheet's content, its name over its line,
/// and the checkmark when it's the selected club. No delivery draws it pressed: it looks the
/// same.
private struct SwitcherRow: View {
    let club: ClubSummary
    let selected: Bool
    let choose: () -> Void

    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var check = Size.switcherCheck

    var body: some View {
        Button(action: choose) {
            HStack(spacing: Spacing.m) {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text(verbatim: club.name)
                        .textRole(.row)
                        .foregroundStyle(Palette.primaryText)
                    Text(verbatim: Self.line(club.switcherLine))
                        .textRole(.metadata)
                        .foregroundStyle(Palette.secondaryText)
                }
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: check))
                        .foregroundStyle(Palette.action)
                }
            }
            .padding(.vertical, Spacing.m)
            .frame(minHeight: Size.touchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.unchangedWhenPressed)
        .accessibilityLabel(Text(verbatim: Self.spoken(club)))
        .accessibilityAddTraits(selected ? .isSelected : [])
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Palette.separator)
                .frame(height: Size.separatorWidth)
                .accessibilityHidden(true)
        }
    }

    private static let labels = DateLabels()

    private static func people(_ count: Int) -> String {
        String(format: String(localized: "switcher.people"), count)
    }

    /// The line under the club's name.
    static func line(_ line: SwitcherLine) -> String {
        switch line {
        case .notStarted: String(localized: "switcher.notStarted")
        case .paused: String(localized: "switcher.paused")
        case .unavailable: String(localized: "switcher.unavailable")
        case .open(let count, let star, let date):
            String(
                format: String(localized: "switcher.open"), people(count),
                labels.personDay(name: star, date: date))
        case .next(let count, let star):
            String(format: String(localized: "switcher.next"), people(count), star)
        case .people(let count): people(count)
        }
    }

    /// What VoiceOver reads for the row: the name, then the line, as sentences.
    static func spoken(_ club: ClubSummary) -> String {
        switch club.switcherLine {
        case .open(let count, let star, let date):
            String(
                format: String(localized: "switcher.open.label"), club.name, people(count),
                labels.personDay(name: star, date: date))
        case .next(let count, let star):
            String(format: String(localized: "switcher.next.label"), club.name, people(count), star)
        case let other:
            String(format: String(localized: "switcher.row.label"), club.name, line(other))
        }
    }
}
