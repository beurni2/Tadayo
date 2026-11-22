import SwiftUI
import TadayoCore
import TadayoDesign

/// G05-members and G05-members-two-days (handoff 1's and 2's frames, with handoff 4's footer and
/// handoff 5's hours), pushed from Club details with the inline title "Members" and the system's
/// Back, and no tab bar:
/// - the club's own name in `utilityTitle` 32/35, as a heading, never the two-day frame's "Ben and
///   Debby", a stand-in (handoffs 3 and 4's R-05);
/// - 16 under it, in `body` `secondaryText`, "Each person has a day." when every member listed has
///   one weekday, "Two reveal days each." when every member has two, and nothing otherwise
///   (`Roster.days`: handoff 1's check found the first untrue in a pair, T43, T49);
/// - 24 under that, one row per member in the server's order (`RosterRow`): the initial, the name
///   ("Ben · You" for the viewer) and their weekdays ("Monday and Thursday"). Other members'
///   photographs need the avatar read, which comes after B3's media, so every row shows the
///   initial for now, as both frames draw them;
/// - 32 under the last row, two lines in `metadata` `secondaryText`: "6 members · New York",
///   counting the roster listed, and "7 AM to 1 AM the next morning." (handoff 4's
///   `membersFooter`: "updates from one authorized server snapshot"; never a proposed person).
///   They follow the rows, where handoff 2's frame draws its line low on the screen under two.
///
/// Nothing on a row opens anything, and nothing counts approvals or activity (T15, T33, T55).
/// While the list loads, the loading form; after it fails, frame 11's form with the members'
/// words (`handoff8.loadStates.members`).
struct MembersScreen: View {
    let members: ClubDetailsModel.Members
    let retry: @MainActor () async -> Void

    var body: some View {
        content
            .navigationTitle(Text("members.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .tabBar)
    }

    @ViewBuilder private var content: some View {
        switch members {
        case .loading:
            ClubLoading(label: "load.members.loading")
        case .failed(let failure):
            ClubLoadFailure(
                title: "load.members.title", failure: failure, retryHint: "load.members.retryHint",
                retry: retry)
        case .loaded(let roster):
            ClubColumn {
                loaded(roster)
            }
        }
    }

    private func loaded(_ roster: Roster) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ClubTitle(name: roster.club.name)
            if let subtitle = subtitle(roster.days) {
                Text(subtitle)
                    .textRole(.body)
                    .foregroundStyle(Palette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Spacing.l)
            }
            VStack(spacing: 0) {
                ForEach(roster.rows) { row in
                    RosterRow(
                        name: row.person.displayName, isViewer: row.isViewer,
                        days: ClubWords.days(row.weekdays))
                }
            }
            .padding(.top, Spacing.xxl)
            VStack(alignment: .leading, spacing: 0) {
                Text(
                    verbatim: ClubWords.footer(
                        count: roster.rows.count, timezone: roster.club.timezone))
                Text(verbatim: ClubWords.hours)
            }
            .textRole(.metadata)
            .foregroundStyle(Palette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Spacing.xxxl)
        }
    }

    private func subtitle(_ days: Roster.Days?) -> LocalizedStringResource? {
        switch days {
        case .one: "members.subtitle.one"
        case .two: "members.subtitle.two"
        case nil: nil
        }
    }
}
