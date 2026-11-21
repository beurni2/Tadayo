import SwiftUI
import TadayoCore
import TadayoDesign

/// Where a club tab's stack goes from the tab: Club details, then its members list
/// (`docs/plans/ios-b1-club-details.md` section 1).
enum ClubRoute: Hashable {
    case details
    case members
}

/// G05-club-details (2.1's frame and handoff 8's frame 16, with handoff 6's words), pushed onto
/// the selected tab with the inline title "Club details" and the system's Back, and with no tab
/// bar, as every frame draws it:
/// - the club's name in `utilityTitle` 32/35, as a heading, 20 under the bar as a setup screen's
///   title sits (`SetupScroll`), and its count and zone under it in `body` `secondaryText`, 12
///   apart ("6 members · New York": `details.footer`, never the zone-omitted form; the count is
///   `getClub`'s, active members only, book p24);
/// - 28 under that (the frames' glyphs sit 29 lower), the rows (`DetailsRow`): Members, Schedule,
///   Notifications and Widget, each a title over its line with a chevron and a full-width
///   separator under it;
/// - 16 under the last, Private drafts, the same row as Home's (handoff 4: "Club details should
///   not have a different Drafts component"; book p46);
/// - 20 under that, Leave club, a text action in `destructive` at the leading edge (handoff 8's
///   check, section 4, keeps it there where frame 16 centres it).
///
/// Members opens the members list. Schedule (B2), Notifications (B8), Widget (M1, FQ9), Private
/// drafts (B3 and B4) and Leave club (B6) show and do nothing until their stages (FQ85,
/// ADR-029). Invite someone, which frame 16 draws for a club with a place free, is plan PR 7's.
///
/// While the details load, the loading form (`ClubLoading`); after they fail, frame 11's form
/// (`ClubLoadFailure`); for a suspended club, the same "Club unavailable" as Home, with nothing
/// of the club and no call (FQ80).
struct ClubDetailsScreen: View {
    let details: ClubDetailsModel.Details
    let retry: @MainActor () async -> Void
    let openMembers: () -> Void

    var body: some View {
        content
            .navigationTitle(Text("details.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .tabBar)
    }

    @ViewBuilder private var content: some View {
        switch details {
        case .loading:
            ClubLoading(label: "load.details.loading")
        case .failed(let failure):
            ClubLoadFailure(
                title: "load.details.title", failure: failure, retryHint: "load.details.retryHint",
                retry: retry)
        case .unavailable:
            ClubColumn {
                ClubUnavailableWords()
            }
        case .loaded(let detail):
            ClubColumn {
                loaded(detail.club)
            }
        }
    }

    private func loaded(_ club: ClubSummary) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ClubTitle(name: club.name)
            Text(verbatim: ClubWords.footer(count: club.memberCount, timezone: club.ref.timezone))
                .textRole(.body)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.m)
            VStack(spacing: 0) {
                DetailsRow(
                    title: "details.members", line: Text("details.members.subtitle"),
                    club: club.name, action: openMembers)
                DetailsRow(
                    title: "details.schedule", line: Text(verbatim: ClubWords.scheduleLine),
                    club: club.name, action: {})
                DetailsRow(
                    title: "details.notifications", line: Text("details.notifications.subtitle"),
                    club: club.name, action: {})
                DetailsRow(
                    title: "details.widget", line: Text("details.widget.subtitle"),
                    club: club.name, action: {})
            }
            .padding(.top, Spacing.xxl + Spacing.xs)
            PrivateDraftsEntry(
                title: Text("drafts.title"), subtitle: Text("drafts.subtitle"), action: {}
            )
            .padding(.top, Spacing.l)
            Button {
            } label: {
                Text("details.leave")
            }
            .buttonStyle(.tadayoText(ink: .destructive))
            .accessibilityHint(
                Text(verbatim: String(format: String(localized: "details.leave.hint"), club.name))
            )
            .padding(.top, Spacing.xl)
        }
    }
}

/// One of Club details' rows: its title in `row` 17/22 `primaryText` over its line in `metadata`
/// 13/18 `secondaryText`, 4 apart, 12 above and below, and `chevron.right` in `secondaryText` in
/// the Friends row's box, 4 in from the trailing edge; a full-width `separator` under it. The
/// whole row is one button, at least 44 high. No delivery draws it pressed: it looks the same.
/// The rows are about 64.5 apart where 2.1's frame draws 66: the two lines take their fonts' own
/// line heights, which the contract's 22 and 18 only stand for (`dynamicTypePolicy.lineHeight`).
///
/// The chevron grows with the text up to the largest size below the accessibility sizes and no
/// further (`RowChevron`): grown with it, its box took so much of the row at the largest text
/// that "Notifications", one word, broke in the middle, where book p26 has rows grow and words
/// wrap whole. It is a mark VoiceOver doesn't read, as the avatar's initial is, which keeps its
/// size (`dynamicTypePolicy.avatarMarks`).
///
/// VoiceOver reads the title and the line, and the hint names the section and the club
/// (`details.row.hint`: "Open Members for Sunday people.").
struct DetailsRow: View {
    let title: LocalizedStringResource
    let line: Text
    let club: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.m) {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text(title)
                        .textRole(.row)
                        .foregroundStyle(Palette.primaryText)
                    line
                        .textRole(.metadata)
                        .foregroundStyle(Palette.secondaryText)
                }
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                RowChevron()
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            }
            .padding(.vertical, Spacing.m)
            .frame(maxWidth: .infinity, minHeight: Size.touchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.unchangedWhenPressed)
        .accessibilityHint(
            Text(
                verbatim: String(
                    format: String(localized: "details.row.hint"), String(localized: title), club)
            )
        )
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Palette.separator)
                .frame(height: Size.separatorWidth)
                .accessibilityHidden(true)
        }
    }
}

/// The Friends row's chevron (`PersonRow`): `chevron.right` in `secondaryText`, 13 in a 20-point
/// box 4 in from the trailing edge, both growing with the row's text, and hidden from VoiceOver.
private struct RowChevron: View {
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var box = Size.personRowChevronBox
    @ScaledMetric(relativeTo: TypeRole.row.textStyle) private var size = Size.personRowChevron

    var body: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: size))
            .foregroundStyle(Palette.secondaryText)
            .frame(width: box, height: box)
            .padding(.trailing, Size.personRowChevronInset)
            .accessibilityHidden(true)
    }
}

/// The column Club details and the members list scroll in: a setup screen's (`SetupScroll`),
/// from 20 under the inline bar, 20 in from each edge, on `canvas`.
struct ClubColumn<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        SetupScroll {
            content
        }
    }
}

/// A pushed club screen's title: the club's own name in `utilityTitle` 32/35, as a heading,
/// wrapping naturally.
struct ClubTitle: View {
    let name: String

    var body: some View {
        Text(verbatim: name)
            .textRole(.utilityTitle)
            .foregroundStyle(Palette.primaryText)
            .accessibilityAddTraits(.isHeader)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A suspended club's Club details: Home's "Club unavailable" and its line, 25/30 and `body`,
/// read together as one heading (handoff 6's `denied.group.vo`), with nothing of the club (T9,
/// FQ80). Choose a club stays on the tab, one Back away.
struct ClubUnavailableWords: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("unavailable.title")
                .textRole(.emptyTitle)
                .foregroundStyle(Palette.primaryText)
                .fixedSize(horizontal: false, vertical: true)
            Text("unavailable.body")
                .textRole(.body)
                .foregroundStyle(Palette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xxl)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: ClubUnavailable.spoken))
        .accessibilityAddTraits(.isHeader)
    }
}

/// A pushed club screen while it loads: the native indeterminate indicator in `secondaryText`
/// over the screen's label in `metadata`, 20 apart, two fifths of the way down, as Home's loading
/// shell has them (handoff 3's `loadingHome`, handoff 8's `loadStates`). The indicator isn't an
/// element of its own: the label is what VoiceOver reads.
struct ClubLoading: View {
    let label: LocalizedStringResource

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: Spacing.xxxl)
            Spacer(minLength: 0)
            ProgressView()
                .tint(Palette.secondaryText)
                .accessibilityHidden(true)
            Text(label)
                .textRole(.metadata)
                .foregroundStyle(Palette.secondaryText)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Spacing.xl)
            Spacer(minLength: Spacing.xxxl)
            Spacer(minLength: 0)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, Spacing.inset)
        .background { Palette.canvas.ignoresSafeArea() }
    }
}

/// Frame 11 of handoff 8 (`G05-club-details-failed`), the form for every pushed club screen that
/// loads, each with its own words (`handoff8.loadStates`): the title naming what failed, its line
/// (the network's, or a refusal's), no rows and no count, and Retry pinned at the foot, 44 above
/// the safe area, as the root's failures have it (`RootFailure`). VoiceOver says the title and the
/// line as it shows, without moving its focus, and Retry's hint says what it reads again.
struct ClubLoadFailure: View {
    let title: LocalizedStringResource
    let failure: ClubDetailsModel.Failure
    let retryHint: LocalizedStringResource
    let retry: @MainActor () async -> Void

    var body: some View {
        SetupScroll {
            SetupHeading(title: LocalizedStringKey(title.key), subtitle: Text(line))
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            SetupFooter(bottom: SetupGap.formFooterToSafeAreaBottom) {
                Button {
                    Task { await retry() }
                } label: {
                    Text("common.retry")
                }
                .buttonStyle(.tadayoPrimary)
                .accessibilityHint(Text(retryHint))
            }
        }
        .announcing(spoken, initial: true)
    }

    var line: LocalizedStringResource {
        switch failure {
        case .network: "load.network"
        case .refused: "load.refused"
        }
    }

    /// What VoiceOver says as the failure shows: the title, then the line.
    var spoken: String {
        "\(String(localized: title)) \(String(localized: line))"
    }
}

/// The words Club details and the members list build from the club.
enum ClubWords {
    private static let labels = DateLabels()

    /// "6 members · New York" (`details.footer`, `details.memberCount`).
    static func footer(count: Int, timezone: String) -> String {
        let zone = TimeZone(identifier: timezone).map(labels.zoneName) ?? timezone
        return String(
            format: String(localized: "details.footer"),
            String(localized: "details.memberCount \(count)"), zone)
    }

    /// "7 AM to 1 AM the next morning", Club details' Schedule line.
    static var scheduleLine: String {
        String(
            format: String(localized: "details.schedule.subtitle"),
            labels.clockHour(ClubHours.opening), labels.clockHour(ClubHours.closing))
    }

    /// "7 AM to 1 AM the next morning.", the members list's last line.
    static var hours: String {
        String(
            format: String(localized: "members.footer.hours"),
            labels.clockHour(ClubHours.opening), labels.clockHour(ClubHours.closing))
    }

    /// A member's weekdays: "Monday", or "Monday and Thursday"; nil with none.
    static func days(_ weekdays: [Weekday]) -> String? {
        let names = weekdays.map(labels.weekday)
        switch names.count {
        case 0: return nil
        case 1: return names[0]
        default:
            return String(format: String(localized: "members.days.two"), names[0], names[1])
        }
    }
}
