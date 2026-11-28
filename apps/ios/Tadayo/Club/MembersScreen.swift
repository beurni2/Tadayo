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
/// delivery words one (FQ149's default); elsewhere it opens nothing, as a decided row does.
/// VoiceOver reads "Leila. Proposed by Ben. Proposed." on every proposed row. Nothing counts
/// approvals or activity (T15, T33, T55). While the list loads, the loading form; after it
/// fails, frame 11's form with the members' words (`handoff8.loadStates.members`).
///
/// The viewer's own candidate's row has a More of its own (handoff 11's frame 5,
/// `G05-members-with-proposed-remove`; `Roster.Proposed.removable`), whatever the viewer's
/// decision: the setup list's ellipsis in a 44-point target, 12 after the row's words, or after
/// its chevron where the row opens something (item 81, built from spec), ending 4 past the
/// margin as the setup list's does, its top level with the avatar's, as frame 5 draws it. It
/// holds Remove invitation alone, under "{name}’s invitation", destructive with `trash`, read as
/// "More options for Leila’s invitation" and "Remove invitation for Leila"; the row's identity
/// and More are separate elements. Other members' candidates and members' rows get none. Remove
/// invitation asks first, in the setup list's alert with the club's name (`last` when nobody
/// else is proposed, `withOthers` otherwise), which closes if the row goes while it's open.
/// While the removal is out (`removing`), the row says "Removing…" 8 under the tag with the
/// system's indicator, its value "In progress", and every More and every proposed row's route
/// wait (handoff 11's `busy.concurrency`: one roster or link change in flight per club); every
/// More also waits while the person's invitation page, the name step or G03-approve has an action
/// out. On the answer the row goes and VoiceOver's focus leaves it at once, for the proposed row
/// now in its place, else the one before, else the last member's row
/// (`Roster.focusAfterRemoval`); once the read after it answers, "{name}’s invitation was
/// removed." is said once. A failure's line (`removalFailure`), handoff 11's words, sits
/// 24 under that row, the footer 32 under it, said once politely; "Members updated." is said
/// when a read after a failure no longer lists the person.
struct MembersScreen: View {
    let members: ClubDetailsModel.Members
    let retry: @MainActor () async -> Void
    var openApproval: (RosterRevision) -> Void = { _ in }
    /// The person's invitation page, for the proposer's own row: nil where it doesn't open.
    var openInvitation: ((String) -> Void)?
    /// The person whose removal is on its way.
    var removing: String?
    /// Whether a removal can start now: none is out, and neither the person's invitation page,
    /// the name step nor G03-approve has an action out (`ClubDetailsModel.removalCanStart`; one
    /// roster or link change in flight per club, handoff 11's `busy.concurrency`).
    var removalCanStart = true
    var removalFailure: ClubDetailsModel.RemovalFailure?
    /// The last thing a removal has VoiceOver say.
    var notice: RemovalNotice?
    /// The last row a removal took away, where VoiceOver's focus leaves from at once.
    var removedRow: RemovedRow?
    /// Remove invitation, once its confirmation says so.
    var remove: (Roster.Proposed) -> Void = { _ in }
    @State private var confirming: Roster.Proposed?
    @AccessibilityFocusState private var focus: Roster.RemovalFocus?

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
                        days: ClubWords.days(row.weekdays)
                    )
                    .accessibilityFocused($focus, equals: .member(row.id))
                }
                ForEach(roster.proposed) { proposed in
                    proposedRow(proposed, in: roster)
                    if let removalFailure, removalFailure.candidateID == proposed.id {
                        InlineError(Text(verbatim: removalFailure.words))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, Spacing.xxl)
                            .padding(
                                .bottom, proposed.id == roster.proposed.last?.id ? 0 : Spacing.xxl)
                    }
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
        // One polite announcement as the line shows, as the setup list's.
        .announcing(removalFailure?.words, politely: true)
        .onChange(of: notice) { _, notice in
            guard let notice else { return }
            said(notice)
        }
        .onChange(of: removedRow) { _, removed in
            // Never left on a More that has gone (handoff 11's section 4).
            guard let removed else { return }
            focus = roster.focusAfterRemoval(at: removed.position)
        }
        .onChange(of: roster.proposed.map(\.id)) { _, ids in
            // The person's row went while their confirmation was open: it goes with it.
            if let confirming, !ids.contains(confirming.id) { self.confirming = nil }
        }
        .alert(
            confirming.map { InvitationsScreen.words("remove.confirm.title", $0.candidate.name) }
                ?? "",
            isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }),
            presenting: confirming
        ) { proposed in
            Button(role: .destructive) {
                remove(proposed)
            } label: {
                Text("remove.action")
            }
            .accessibilityLabel(
                Text(
                    verbatim: InvitationsScreen.words(
                        "remove.action.label", proposed.candidate.name)))
            Button(role: .cancel) {
            } label: {
                Text("remove.confirm.cancel")
            }
        } message: { proposed in
            Text(
                verbatim: InvitationsScreen.removalBody(
                    proposed.candidate.name, club: roster.club.name,
                    others: roster.proposed.contains { $0.id != proposed.id }))
        }
    }

    /// What a removal has VoiceOver say, once, after the read that follows its answer: the
    /// person's name, or Members' neutral update.
    private func said(_ notice: RemovalNotice) {
        switch notice.kind {
        case .removed(let name, _):
            Announcement.post(InvitationsScreen.words("remove.success", name), politely: true)
        case .updated:
            Announcement.post(String(localized: "remove.membersUpdated"), politely: true)
        }
    }

    /// A candidate's proposed row, with its own More after it for the viewer's own candidate, and
    /// the separator under both.
    @ViewBuilder private func proposedRow(_ proposed: Roster.Proposed, in roster: Roster)
        -> some View
    {
        if proposed.removable {
            HStack(alignment: .top, spacing: 0) {
                identity(proposed, in: roster)
                more(proposed)
            }
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(Palette.separator)
                    .frame(height: Size.separatorWidth)
                    .padding(.leading, Size.personRowTextInset)
                    .accessibilityHidden(true)
            }
        } else {
            identity(proposed, in: roster)
        }
    }

    /// The row itself, as one element, "In progress" its value while the person's removal is out.
    private func identity(_ proposed: Roster.Proposed, in roster: Roster) -> some View {
        opening(proposed, in: roster)
            .accessibilityValue(
                removing == proposed.id ? Text("remove.busy.value") : Text(verbatim: "")
            )
            .accessibilityFocused($focus, equals: .proposed(proposed.id))
    }

    /// A button with the chevron and its hint that opens G03-approve when the viewer's decision is
    /// pending, a button with the chevron that opens the person's invitation page for their
    /// proposer, and otherwise the row alone, the chevron's room kept unless More takes the
    /// trailing edge (frame 5: the words end 12 before More's target). The route waits while any
    /// removal is out, so nothing else changes the roster or a link meanwhile.
    @ViewBuilder private func opening(_ proposed: Roster.Proposed, in roster: Roster)
        -> some View
    {
        let approves = proposed.opens == .approval && roster.openRevision != nil
        let invites = proposed.opens == .invitation && openInvitation != nil
        let busy = removing == proposed.id
        let row = RosterRow(
            name: proposed.candidate.name, isViewer: false, days: nil,
            proposal: .by(proposed.candidate.proposedBy.displayName),
            disclosure: approves || invites ? .shown : proposed.removable ? nil : .reserved,
            separated: !proposed.removable,
            progress: busy ? String(localized: "remove.busy") : nil)
        if approves, let revision = roster.openRevision {
            Button {
                openApproval(revision)
            } label: {
                row.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(removing != nil)
            .accessibilityHint(
                Text(verbatim: ApproveWords.words("members.proposed.hint", roster.club.name)))
        } else if invites {
            Button {
                openInvitation?(proposed.candidate.id)
            } label: {
                row.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(removing != nil)
        } else {
            row
        }
    }

    /// The viewer's own candidate's More (frame 5): Remove invitation alone, unavailable while a
    /// removal can't start (`removalCanStart`).
    private func more(_ proposed: Roster.Proposed) -> some View {
        let name = proposed.candidate.name
        return Menu {
            Section {
                Button(role: .destructive) {
                    confirming = proposed
                } label: {
                    Label {
                        Text("remove.action")
                    } icon: {
                        Image(systemName: "trash")
                    }
                }
                .accessibilityLabel(
                    Text(verbatim: InvitationsScreen.words("remove.action.label", name)))
            } header: {
                Text(verbatim: InvitationsScreen.words("remove.menu.heading", name))
            }
        } label: {
            Image(systemName: "ellipsis")
                .textRole(.rowAction)
                .foregroundStyle(Palette.secondaryText)
                .frame(width: Size.touchTarget, height: Size.touchTarget)
                .contentShape(Rectangle())
        }
        .disabled(removing != nil || !removalCanStart)
        .accessibilityLabel(Text(verbatim: InvitationsScreen.words("invite.more.label", name)))
        .padding(.top, Spacing.m)
        .padding(.leading, Spacing.m)
        .padding(.trailing, -InvitationRowView.moreOverhang)
    }

    private func subtitle(_ days: Roster.Days?) -> LocalizedStringResource? {
        switch days {
        case .one: "members.subtitle.one"
        case .two: "members.subtitle.two"
        case nil: nil
        }
    }
}

extension ClubDetailsModel.RemovalFailure {
    /// Handoff 11's words for the failure, with the person's name and the club's; a not found
    /// while the roster still lists the person says the invitation is no longer available, never
    /// "Try again" (`handoff11.remove.unavailable`).
    var words: String {
        if unavailable { return String(localized: "remove.unavailable") }
        return InvitationsScreen.words(
            uncertain ? "remove.failed.network" : "remove.failed.refused", name, club)
    }
}
