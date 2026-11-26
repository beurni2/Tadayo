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
/// While a revision is open, its candidates follow the members, one proposed row each in the
/// revision's order (`Roster.proposed`; handoff 1: "place Leila in one separate proposed row after
/// the current roster: Leila, Proposed by Ben, Proposed"; no frame draws one in an active club,
/// so it's built from spec, `docs/plans/ios-b1-approve.md` section 2): `RosterRow`'s proposed form,
/// the name, "Proposed by {name}" and the Proposed tag, with no weekday, no status and nothing
/// about who has approved or accepted. The footer counts the members alone.
///
/// A member's row opens nothing. A proposed row opens G03-approve (`openApproval`) only for a
/// viewer whose decision on the revision is pending, and is then a button with the system's
/// disclosure chevron and the hint "Review the proposed roster for {clubName}." (handoff 10's
/// frame 5, `handoff10.members.proposed.hint`); for one who has decided it opens nothing and shows
/// no chevron, keeping its room so the words wrap the same, and nothing tells one decision from
/// another (FQ143, frame 6). For the candidate's proposer, once decided by proposing (FQ60), it
/// opens the person's invitation page in an active club (`openInvitation`, nil elsewhere;
/// `G05-members-invite`; handoff 8's `returnPath`: "Club details → Members → own proposed
/// candidate → G05-members-invite"), a button with the same chevron and no hint, since no
/// delivery words one; elsewhere it opens nothing, as a decided row does. VoiceOver reads
/// "Leila. Proposed by Ben. Proposed." on every proposed row. Nothing
/// counts approvals or activity (T15, T33, T55). While the list loads, the loading form; after it
/// fails, frame 11's form with the members' words (`handoff8.loadStates.members`).
struct MembersScreen: View {
    let members: ClubDetailsModel.Members
    let retry: @MainActor () async -> Void
    var openApproval: (RosterRevision) -> Void = { _ in }
    /// The person's invitation page, for the proposer's own candidate.
    /// The person's invitation page, for the proposer's own row: nil where it doesn't open.
    var openInvitation: ((String) -> Void)?

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
                ForEach(roster.proposed) { proposed in
                    proposedRow(proposed, in: roster)
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

    /// A candidate's proposed row: a button with the chevron and its hint that opens G03-approve
    /// when the viewer's decision is pending, a button with the chevron that opens the person's
    /// invitation page for their proposer, and otherwise the row alone, the chevron's room kept.
    @ViewBuilder private func proposedRow(_ proposed: Roster.Proposed, in roster: Roster)
        -> some View
    {
        let approves = proposed.opens == .approval && roster.openRevision != nil
        let invites = proposed.opens == .invitation && openInvitation != nil
        let row = RosterRow(
            name: proposed.candidate.name, isViewer: false, days: nil,
            proposal: .by(proposed.candidate.proposedBy.displayName),
            disclosure: approves || invites ? .shown : .reserved)
        if approves, let revision = roster.openRevision {
            Button {
                openApproval(revision)
            } label: {
                row.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(
                Text(verbatim: ApproveWords.words("members.proposed.hint", roster.club.name)))
        } else if invites {
            Button {
                openInvitation?(proposed.candidate.id)
            } label: {
                row.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            row
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
