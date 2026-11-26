import SwiftUI
import TadayoCore

/// Club details as a club tab's stack shows it, bound to the selected club's model
/// (`RootModel.clubDetails()`): it reads the details the first time it shows, and again on
/// Retry. Coming back from the members list reads nothing again. A read cancelled while the
/// screen stays (its task ended by the system, the answer dropped) is made again the next time it
/// shows, so loading never stays with no read behind it.
struct ClubDetailsDestination: View {
    let model: ClubDetailsModel
    let openMembers: () -> Void
    @State private var asked = false

    var body: some View {
        ClubDetailsScreen(
            details: model.details, retry: { await model.loadDetails() }, openMembers: openMembers
        )
        .task {
            guard !asked else { return }
            asked = true
            await model.loadDetails()
            if Task.isCancelled { asked = false }
        }
    }
}

/// The members list as a club tab's stack shows it: it reads the roster and the club's week each
/// time it's opened, and again on Retry. Until its own read has started it shows loading, never
/// what an earlier opening left in the model (an old roster, or the answer to a read Back
/// cancelled), so it slides in loading each time. A cancelled read is made again, as Club
/// details' is. A proposed row whose candidate the viewer has yet to decide on opens G03-approve
/// for the revision the list showed (`openApproval`).
struct MembersDestination: View {
    let model: ClubDetailsModel
    var openApproval: (RosterRevision) -> Void = { _ in }
    @State private var asked = false

    var body: some View {
        MembersScreen(
            members: asked ? model.members : .loading, retry: { await model.loadMembers() },
            openApproval: openApproval
        )
        .task {
            guard !asked else { return }
            asked = true
            await model.loadMembers()
            if Task.isCancelled { asked = false }
        }
    }
}

/// G01-create as a tab's stack shows it: once the model has made the club, the tabs are told,
/// once, so its setup list takes this screen's place (`TabsView`).
struct CreateClubDestination: View {
    let model: CreateClubModel
    let created: (ClubRef) -> Void

    var body: some View {
        CreateClubScreen(model: model)
            .onChange(of: model.club?.club.ref) { _, club in
                if let club { created(club) }
            }
    }
}

/// The setup list as a tab's stack shows it, bound to its model (`RootModel.invitations(for:)`):
/// it reads the list the first time it shows, and quietly again each time it shows again (back
/// from the name step, say), keeping what's on screen while it reads. A read cancelled while it
/// stays is made again, as Club details' is.
///
/// Share link and Share again get the link from the model, made first if the person has none,
/// then show the share sheet, one at a time, and tell the model whether a share completed.
/// Revoke link says "Revoking link…" as it starts, and "{name}’s invitation link was revoked."
/// once the server has said so; Create new link says "New invitation link created for {name}."
/// (handoff 4's `revokeLink` and `invite.createNew`). Done for now takes the waiting screen's
/// form from the list's last answer.
struct InvitationsDestination: View {
    let model: InvitationListModel
    let invite: () -> Void
    let done: (_ review: Bool) -> Void
    @Environment(\.shareLink) private var shareLink
    @State private var asked = false
    @State private var revoking: Set<String> = []
    @State private var sharing = false

    var body: some View {
        InvitationsScreen(
            state: model.state, busy: model.busy, revoking: revoking,
            failure: model.actionFailure, actions: actions
        )
        .task {
            guard !asked else { return await model.refresh() }
            asked = true
            await model.load()
            if Task.isCancelled { asked = false }
        }
    }

    private var actions: InvitationActions {
        InvitationActions(
            share: share,
            createNewLink: { row in Task { await createNewLink(row) } },
            revoke: { row in Task { await revoke(row) } },
            invite: { invite() },
            done: {
                guard case .loaded(let list) = model.state else { return }
                done(list.awaitingMyApproval)
            },
            retry: { await model.load() })
    }

    private func share(_ row: InvitationRow) {
        guard !sharing else { return }
        sharing = true
        Task {
            defer { sharing = false }
            guard let url = await model.linkToShare(for: row.candidateID) else { return }
            let completed = await shareLink(url)
            model.shareFinished(for: row.candidateID, completed: completed)
        }
    }

    private func revoke(_ row: InvitationRow) async {
        revoking.insert(row.candidateID)
        Announcement.post(String(localized: "revoke.pending"))
        await model.revoke(row.candidateID)
        revoking.remove(row.candidateID)
        if model.actionFailure == nil, self.row(row.candidateID)?.status == .revoked {
            Announcement.post(InvitationsScreen.words("revoke.success", row.name))
        }
    }

    private func createNewLink(_ row: InvitationRow) async {
        await model.createNewLink(for: row.candidateID)
        if model.actionFailure == nil, self.row(row.candidateID)?.action == .shareLink {
            Announcement.post(InvitationsScreen.words("invite.createNew.success", row.name))
        }
    }

    private func row(_ candidateID: String) -> InvitationRow? {
        guard case .loaded(let list) = model.state else { return nil }
        return list.rows.first { $0.candidateID == candidateID }
    }
}
