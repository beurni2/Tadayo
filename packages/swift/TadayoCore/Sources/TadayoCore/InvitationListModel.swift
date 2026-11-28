import Foundation
import Observation

/// One candidate's row in the setup list (`G01-invite-people` and its states;
/// `docs/plans/ios-b1-create.md` section 2): the status the row reads, its action, and its More
/// menu, from the server's `CandidateInvitation` and the link the app keeps (ADR-037).
public struct InvitationRow: Sendable, Equatable, Identifiable {
    public enum Status: Sendable, Equatable {
        /// "Not shared", with the link symbol (handoff 4).
        case notShared
        /// "Shared": a share of the kept link completed, a copy included (FQ67). Never
        /// delivered.
        case shared
        /// "Accepted": the candidate accepted this roster (handoff 4).
        case accepted
        /// "Needs to accept again": the candidate accepted an earlier roster with this link
        /// (handoff 8's `usedInvitationRow`).
        case needsToAcceptAgain
        /// "Link revoked" (handoff 4).
        case revoked
        /// "Link expired": it expired before anyone used it (FQ71; handoff 9's
        /// `setupLinks.expiredUnused`, frame 16).
        case expired
        /// "Link not on this phone": the link is live, but this phone doesn't hold it (a
        /// reinstall, another phone), and "A new link replaces the previous link." under the row
        /// (handoff 9's `setupLinks.missingLive`, frame 15).
        case notOnThisPhone
    }

    public enum Action: Sendable, Equatable {
        /// Share link: shares the kept link, or makes the candidate's first link and shares it.
        case shareLink
        /// Share again: shares the kept link.
        case shareAgain
        /// Create new link: a new link in place of the old one, which stops working.
        case createNewLink
    }

    /// The More menu's items (the system's own menu, T45).
    public enum MenuItem: Sendable, Equatable {
        case revokeLink
        case createNewLink
        /// Remove invitation: the person is no longer invited and their place is free (FQ148;
        /// handoff 11's section 1), on the setup list only.
        case removeInvitation
    }

    public let candidateID: String
    /// The one name the revision shows for them (FQ66).
    public let name: String
    /// Their proposer's name: "Proposed by {name}" on the person's invitation page (handoff 8's
    /// frame 14).
    public let proposedBy: String
    public let status: Status
    public let action: Action?
    public let menu: [MenuItem]
    /// A used link the app no longer holds: handoff 8's "This invitation link isn’t saved on
    /// this device." and "{name} can reopen the invitation already received.", and nothing to
    /// do, since the server neither replaces nor revokes a link used to accept.
    public let linkNotSaved: Bool

    public var id: String { candidateID }

    /// The row for a candidate the caller proposed, with the link kept for them, if any.
    /// `removable` adds Remove invitation to the end of More, on every row, as handoff 11's
    /// section 1 table offers it: the setup list's rows; the person's invitation page keeps to
    /// the link (`docs/design/handoff-7/ios-lane-needs.md` item 82). Each row's own action and
    /// link items stay as they are.
    public init(_ candidate: Candidate, kept: KeptInvitationLink?, removable: Bool) {
        candidateID = candidate.id
        name = candidate.name
        proposedBy = candidate.proposedBy.displayName
        let link = Self.linkParts(candidate, kept: kept)
        (status, action, linkNotSaved) = (link.status, link.action, link.linkNotSaved)
        menu = link.menu + (removable ? [.removeInvitation] : [])
    }

    private static func linkParts(_ candidate: Candidate, kept: KeptInvitationLink?) -> (
        status: Status, action: Action?, menu: [MenuItem], linkNotSaved: Bool
    ) {
        let status: Status
        let action: Action?
        let menu: [MenuItem]
        let linkNotSaved: Bool
        guard let invitation = candidate.invitation else {
            // No link yet: the app offers to make one (the contract's `Candidate`).
            return (.notShared, .shareLink, [], false)
        }
        let held = kept?.invitationID == invitation.id ? kept : nil
        switch invitation.state {
        case .live:
            if let held {
                (status, action) = held.shared ? (.shared, .shareAgain) : (.notShared, .shareLink)
            } else {
                // The app doesn't hold this live link (a reinstall, another phone): a new link
                // in its place (the contract's `InvitationLink`; handoff 9's `missingLive`).
                (status, action) = (.notOnThisPhone, .createNewLink)
            }
            (menu, linkNotSaved) = ([.revokeLink], false)
        case .accepted:
            (status, action, menu, linkNotSaved) = (.accepted, nil, [], false)
        case .used:
            (status, action, menu, linkNotSaved) =
                held == nil
                ? (.needsToAcceptAgain, nil, [], true)
                : (.needsToAcceptAgain, .shareAgain, [], false)
        case .revoked:
            (status, action, menu, linkNotSaved) = (
                .revoked, .createNewLink, [.createNewLink], false
            )
        case .expired:
            // Its action is the only link action: no link item in More (handoff 9's
            // `expiredUnused`).
            (status, action, menu, linkNotSaved) = (.expired, .createNewLink, [], false)
        }
        return (status, action, menu, linkNotSaved)
    }
}

/// The setup list as it shows: the club, the caller's candidates' rows in the server's order,
/// whether a place is free for another, and which waiting screen Done for now leads to.
public struct InvitationList: Sendable, Equatable {
    public let club: ClubRef
    public let state: ClubState
    /// The club's active members, as `getClub` counts them: "{count} current members" on the
    /// person's invitation page (frame 14). Candidates aren't counted.
    public let memberCount: Int
    public let rows: [InvitationRow]
    /// Create an invitation shows: the server allows a proposal and a place is free (A01, T6).
    public let canInvite: Bool
    /// The caller's own decision on the open revision is pending, so Done for now leads to
    /// `G01-pending-approve`, not `G01-pending` (handoff 8's `creatorReviewRequired`, FQ84).
    public let awaitingMyApproval: Bool
    /// Every candidate the open revision lists, whoever proposed them: whether anyone else is
    /// still invited picks Remove invitation's confirmation (handoff 11's section 2).
    public let invited: Set<String>

    /// The model makes it from the server's answers; a snapshot makes its own.
    public init(
        club: ClubRef, state: ClubState, memberCount: Int, rows: [InvitationRow], canInvite: Bool,
        awaitingMyApproval: Bool, invited: Set<String>? = nil
    ) {
        self.club = club
        self.state = state
        self.memberCount = memberCount
        self.rows = rows
        self.canInvite = canInvite
        self.awaitingMyApproval = awaitingMyApproval
        self.invited = invited ?? Set(rows.map(\.candidateID))
    }

    /// Anyone but `candidateID` is still invited, so removing them leaves a roster the others
    /// review and accept again (`handoff11.remove.confirm.body.withOthers`), never from that
    /// person's own answer.
    public func othersInvited(besides candidateID: String) -> Bool {
        !invited.subtracting([candidateID]).isEmpty
    }

    /// Where VoiceOver's focus goes once a removal's row has gone (handoff 11's section 3).
    public enum RemovalFocus: Sendable, Hashable {
        case createInvitation
        case row(String)
        case doneForNow
    }

    /// The list as it reads after a removal whose row stood at `position`: Create an invitation
    /// if it shows, else the row now in that place, else the one before it, else Done for now.
    public func focusAfterRemoval(at position: Int) -> RemovalFocus {
        if canInvite { return .createInvitation }
        if rows.indices.contains(position) { return .row(rows[position].candidateID) }
        return rows.last.map { .row($0.candidateID) } ?? .doneForNow
    }
}

/// The setup list (`G01-invite-people`; spec 04; book p33), for one club and the account: who
/// the caller proposed, each with their link's status and actions, Create an invitation, and Done
/// for now.
///
/// It reads `GET /v1/clubs/{club_id}` (the roster version a proposal sends, and `can_propose`)
/// and `GET /v1/clubs/{club_id}/members` (the open revision's candidates) together, and settles
/// the kept links by each successful members answer (`InvitationLinkBook`). Each link it makes
/// is kept before it's offered for sharing, so a cancelled share never makes a second one
/// (`createInvitation.retention`). Making a link is one action with one key, made when it starts
/// and sent again on every retry of it (T19); an answer without its link (the first answer lost
/// on the way) makes one more under a new key, since the lost one was never shared.
///
/// Made for one candidate (`candidate`), it's the person's invitation page (`G05-members-invite`,
/// handoff 8's `activeInvitationManagement`): the same reads, links and keys, with that one
/// person's row, and only while the caller proposed them, since only a candidate's proposer gets
/// their link's controls (handoff 8). It's `ended` once an answer no longer lists them as the
/// caller's open candidate: they joined, the revision ended, or they were never the caller's.
///
/// An answer counts only while `current` says so and while its read is the latest; a not found
/// closes the list and has the club list read again (`gone`), as Club details does; `signedOut`
/// ends the session. Nothing of an answer reaches a log (T52).
@MainActor @Observable public final class InvitationListModel {
    /// Why the list didn't load: the network's line or a refusal's (handoff 8's
    /// `B1LoadShell`, "Loading invitations…" and "Couldn’t load invitations.").
    public enum Failure: Sendable, Equatable {
        case network
        case refused
    }

    public enum State: Sendable, Equatable {
        case loading
        case loaded(InvitationList)
        case failed(Failure)
    }

    /// An action that failed, with the row kept as it was. The line stays through scrolling, the
    /// system's menus and a share sheet; another link action starting clears it, as does a read
    /// whose answer shows the action no longer applies, and a new failure takes its place
    /// (handoff 9's `setupLinks.mutationFailure.lifetime`). Leaving clears it too: each visit
    /// to the setup list makes a new list, and the person's invitation page, kept while it goes on
    /// so its keys survive Back (T19), clears it when it's opened again (`reopened()`).
    public enum ActionFailure: Sendable, Equatable {
        /// "Couldn’t create the invitation link for {name}." with the network's or a refusal's
        /// line (`createInvitation.createFailure`): the candidate's first link.
        case createLink(name: String, network: Bool)
        /// "Couldn’t create a new invitation link for {name}." with the network's or a refusal's
        /// line (handoff 4's `invite.createNew.failure`): a link in place of the one the row
        /// shows.
        case createNewLink(name: String, network: Bool)
        /// "Couldn’t revoke {name}’s invitation link. Try again.", or, with no answer, "Couldn’t
        /// confirm that {name}’s invitation link was revoked. Check your connection and try
        /// again." (handoff 4's `revokeLink`).
        case revoke(name: String, uncertain: Bool)
        /// "Couldn’t remove {name}’s invitation to {clubName}. Try again.", or, with no answer or
        /// one this build can't read, "Couldn’t confirm that {name}’s invitation to {clubName}
        /// was removed. Check your connection and try again." (handoff 11's
        /// `handoff11.remove.failed`).
        case remove(name: String, club: String, uncertain: Bool)
        /// "This invitation is no longer available." (`handoff11.remove.unavailable`): a not
        /// found, the server's last word on the person, while the list still shows their row,
        /// so it never asks to try again (handoff 11's section 4).
        case removeUnavailable
    }

    public let club: ClubRef
    public let accountID: String
    /// The one candidate the person's invitation page is for; nil for the setup list.
    public let candidateID: String?
    public private(set) var state = State.loading
    /// A read answered not found: the club is no longer the caller's (T9, T14).
    public private(set) var closed = false
    /// The person's invitation page only: the last answer doesn't list its candidate as the
    /// caller's open candidate, so the page closes back to what's under it.
    public private(set) var ended = false
    /// The candidates whose action is on its way: their row's controls wait.
    public private(set) var busy: Set<String> = []
    public private(set) var actionFailure: ActionFailure?
    /// The person whose removal is on its way: their row says "Removing…", and every other link
    /// action and Create an invitation wait for it, one change of the roster at a time (handoff
    /// 11's section 8). Done for now and Back don't.
    public private(set) var removing: String?
    /// The last thing a removal has VoiceOver say.
    public private(set) var notice: RemovalNotice?

    /// What failed, for whom: what a read checks the failure line against.
    private enum FailedAction {
        case firstLink
        case newLink
        case revoke
        case remove
    }
    private var failedFor: (candidateID: String, action: FailedAction)?

    private var answer: (detail: ClubDetail, members: MemberList)?
    private var reads = 0
    /// What this list's own actions learned of a candidate's link since its reads were requested:
    /// a link made (live) or revoked, by candidate id, with the read count then, so the row says
    /// so even when the read again fails, until an answer to a read requested after it comes.
    private var learned: [String: (invitation: CandidateInvitation, at: Int)] = [:]
    /// The people this list removed since its reads were requested, by candidate id, with the
    /// read count then: their rows stay gone until an answer to a read requested after the
    /// removal comes, which decides.
    private var removed: [String: Int] = [:]
    private var notices = 0
    /// Each candidate's link being made, by candidate id: the invitation it replaces (nil for the
    /// first) and the key its action started with, sent again on every retry of that action.
    private var linkKeys: [String: (replacing: String?, key: IdempotencyKey)] = [:]

    let service: any ClubService
    let book: InvitationLinkBook
    let makeKey: @Sendable () -> IdempotencyKey
    let current: @MainActor () -> Bool
    let gone: @MainActor () async -> Void
    let signedOut: @MainActor () async -> Void

    public init(
        club: ClubRef, accountID: String, service: any ClubService, book: InvitationLinkBook,
        candidate: String? = nil,
        makeKey: @escaping @Sendable () -> IdempotencyKey = { IdempotencyKey.make() },
        current: @escaping @MainActor () -> Bool,
        gone: @escaping @MainActor () async -> Void = {},
        signedOut: @escaping @MainActor () async -> Void = {}
    ) {
        self.club = club
        self.accountID = accountID
        candidateID = candidate
        self.service = service
        self.book = book
        self.makeKey = makeKey
        self.current = current
        self.gone = gone
        self.signedOut = signedOut
    }

    /// When the list shows, and on its Retry: its loading form until both reads answer.
    public func load() async {
        await read(quiet: false)
    }

    /// The list read again after an action, or when it shows again: what's on screen stays
    /// while the reads are out, and stays if they fail.
    public func refresh() async {
        await read(quiet: true)
    }

    /// Share link or Share again: the link to give the share sheet. A candidate with no link yet
    /// gets one first, kept before it's returned. Nil when nothing can be shared, with
    /// `actionFailure` saying why when a link couldn't be made.
    public func linkToShare(for candidateID: String) async -> URL? {
        guard removing == nil, let candidate = mine(candidateID), !busy.contains(candidateID),
            let row = row(for: candidate)
        else { return nil }
        // The row on screen offered a link the book no longer holds (another read purged it
        // since, from a newer answer): show the row as it is now, which offers Create new link
        // or nothing, and read the list again for what changed on the server.
        guard row.action == .shareLink || row.action == .shareAgain else {
            relist()
            await refresh()
            return nil
        }
        // A share changes no link, so the failure line stays (handoff 9's `lifetime`).
        if let kept = book.link(for: candidateID, club: club.id, account: accountID),
            candidate.invitation == nil || candidate.invitation?.id == kept.invitationID
        {
            return kept.url
        }
        guard candidate.invitation == nil else { return nil }
        busy.insert(candidateID)
        defer { busy.remove(candidateID) }
        return await make(for: candidate)?.url
    }

    /// The share sheet closed: a completed share marks the kept link Shared (FQ67); a cancelled
    /// one changes nothing.
    /// The person's invitation page opened again after Back: the line goes, as navigation left
    /// (handoff 9's `lifetime`), and each link action's key stays for its retry (T19).
    public func reopened() {
        fail(nil)
    }

    public func shareFinished(for candidateID: String, completed: Bool) {
        guard completed,
            let kept = book.link(for: candidateID, club: club.id, account: accountID)
        else { return }
        book.markShared(kept.invitationID, account: accountID)
        relist()
    }

    /// Create new link, from the row or its More menu: a link in place of the old one, then the
    /// list read again, where the row reads Not shared with Share link.
    public func createNewLink(for candidateID: String) async {
        guard removing == nil, let candidate = mine(candidateID), !busy.contains(candidateID),
            let row = row(for: candidate),
            row.action == .createNewLink || row.menu.contains(.createNewLink)
        else { return }
        // Once the link is made the row shows it, held, so a second tap finds nothing to make,
        // while the list is read again.
        busy.insert(candidateID)
        let made = await make(for: candidate)
        busy.remove(candidateID)
        guard made != nil, current() else { return }
        await refresh()
    }

    /// Revoke link, after its confirmation: only a live link (handoff 4's `revokeLink`), then
    /// the list read again. Once the server confirms it, the kept link goes and the row reads Link
    /// revoked, even if the read again fails. A failure keeps the row as it was; with no answer
    /// the revoke may have reached the server, so the read again says.
    public func revoke(_ candidateID: String) async {
        guard removing == nil, let candidate = mine(candidateID), !busy.contains(candidateID),
            let invitation = candidate.invitation, invitation.state == .live
        else { return }
        busy.insert(candidateID)
        fail(nil)
        defer { busy.remove(candidateID) }
        do {
            try await service.revokeInvitation(invitation.id)
            guard current() else { return }
            book.drop(invitation.id, account: accountID)
            learn(
                CandidateInvitation(
                    id: invitation.id, state: .revoked, expiresAt: invitation.expiresAt),
                for: candidateID)
        } catch .signedOut {
            guard current() else { return }
            await signedOut()
            return
        } catch {
            guard current() else { return }
            fail(.revoke(name: candidate.name, uncertain: error == .network), candidateID, .revoke)
        }
        guard current() else { return }
        await refresh()
    }

    /// Remove invitation, after its confirmation (FQ148; handoff 11's sections 3, 4 and 8): only
    /// for a row whose More offers it, and only while nothing else of the list is on its way. On
    /// the server's answer the row goes at once, every link kept for the person goes, the list is
    /// read again (whether a place is free, and how the others' rows read now), and then
    /// "{name}’s invitation was removed." is said. A failure keeps the row as it was, with its
    /// line, and reads the list again; a not found (the person joined, or isn't the caller's to
    /// remove) reads it again with no line, and says the list was updated once the row has gone.
    /// The removal takes no key: a repeat returns the same answer (`removeCandidate`).
    public func remove(_ candidateID: String) async {
        guard canRemove(candidateID), let candidate = mine(candidateID) else { return }
        let clubName = answer?.members.club.name ?? club.name
        let position: Int =
            if case .loaded(let list) = state {
                list.rows.firstIndex { $0.candidateID == candidateID } ?? 0
            } else { 0 }
        removing = candidateID
        busy.insert(candidateID)
        fail(nil)
        let outcome = await Self.result { [service] () async throws(APIFailure) in
            try await service.removeCandidate(candidateID)
        }
        removing = nil
        busy.remove(candidateID)
        // The person's links stop working on the server's answer, whatever this screen does
        // next: the book is the account's, so after a sign-out or a switch this drops nothing.
        if case .success = outcome {
            book.dropCandidate(candidateID, club: club.id, account: accountID)
        }
        guard current() else { return }
        switch outcome {
        case .success:
            removed[candidateID] = reads
            relist()
            await refresh()
            guard current(), !closed else { return }
            say(.removed(name: candidate.name, position: position))
        case .failure(.signedOut):
            await signedOut()
        case .failure(.notFound):
            await refresh()
            guard current(), !closed else { return }
            if mine(candidateID) == nil {
                say(.updated)
            } else {
                fail(.removeUnavailable, candidateID, .remove)
            }
        case .failure(let failure):
            fail(
                .remove(
                    name: candidate.name, club: clubName,
                    uncertain: failure.leavesRemovalUncertain), candidateID, .remove)
            await refresh()
            guard current(), !closed else { return }
            // The read again settled the line: the person's row no longer offers the removal.
            if actionFailure == nil, mine(candidateID) == nil { say(.updated) }
        }
    }

    /// Whether Remove invitation can start for this person now: nothing else of the list on its
    /// way (a removal, or any row's link action: handoff 11's `busy.concurrency`), and their
    /// row's More offering it. Every row's Remove invitation waits while it's false.
    public func canRemove(_ candidateID: String) -> Bool {
        guard removalCanStart, let candidate = mine(candidateID), let row = row(for: candidate)
        else { return false }
        return row.menu.contains(.removeInvitation)
    }

    /// Whether nothing of the list is on its way, so a removal could start: `busy` holds every
    /// row whose action is out, a removal's included.
    public var removalCanStart: Bool { busy.isEmpty }

    private func say(_ kind: RemovalNotice.Kind) {
        notices += 1
        notice = RemovalNotice(kind: kind, sequence: notices)
    }

    /// The name step for one more person (`G01-invite-name`), while a place is free.
    public func makeInvite() -> InviteNameModel? {
        guard candidateID == nil, removing == nil, let answer, answer.detail.canPropose, current()
        else {
            return nil
        }
        // The name step makes a link: another link action (handoff 9's `lifetime`).
        fail(nil)
        return InviteNameModel(
            club: club, accountID: accountID, rosterVersion: answer.detail.rosterVersion,
            known: Set(answer.members.openRevision?.candidates.map(\.id) ?? []),
            service: service, book: book, makeKey: makeKey, current: current,
            signedOut: signedOut,
            changed: { [weak self] in await self?.refresh() })
    }

    // MARK: Reading

    private func read(quiet: Bool) async {
        reads += 1
        let asked = reads
        if !quiet { state = .loading }
        let stamp = book.beginRead()
        let id = club.id
        async let detail = Self.result { [service] () async throws(APIFailure) in
            try await service.club(id)
        }
        async let members = Self.result { [service] () async throws(APIFailure) in
            try await service.members(of: id)
        }
        let answers = await (detail, members)
        guard !Task.isCancelled, current() else { return }
        // A members answer settles the kept links whichever read is latest: it's the server's
        // word on them as of its request (the contract's `InvitationLink`).
        switch answers.1 {
        case .success(let list):
            book.settle(list, stamp: stamp, account: accountID)
        case .failure(.notFound):
            book.settleGone(club: id, stamp: stamp, account: accountID)
        case .failure:
            break
        }
        guard asked == reads else { return }
        switch answers {
        case (.success(let detail), .success(let list)):
            answer = (detail, list)
            learned = learned.filter { $0.value.at >= asked }
            removed = removed.filter { $0.value >= asked }
            relist()
            settleFailure()
            if let candidateID { ended = !myCandidates.contains { $0.id == candidateID } }
        case (.failure(let failure), _), (_, .failure(let failure)):
            let worst = Self.decisive(answers.0.failure, answers.1.failure) ?? failure
            if let failed = await settle(worst), !quiet {
                state = .failed(failed)
            }
        }
    }

    /// What a failed read leads to: the list closed and the club list read again for a club no
    /// longer the caller's, the session ended for `signedOut` (neither shows a failure), or the
    /// failure the list shows.
    private func settle(_ failure: APIFailure) async -> Failure? {
        switch failure {
        case .notFound:
            closed = true
            await gone()
            return nil
        case .signedOut:
            await signedOut()
            return nil
        case .network:
            return .network
        default:
            return .refused
        }
    }

    /// The list from the last answers and the links kept now.
    private func relist() {
        guard let answer else { return }
        let rows = myCandidates.compactMap(row(for:))
        state = .loaded(
            InvitationList(
                club: answer.members.club, state: answer.detail.club.state,
                memberCount: answer.detail.club.memberCount, rows: rows,
                canInvite: answer.detail.canPropose,
                awaitingMyApproval: answer.members.openRevision?.myDecision == .pending,
                invited: Set(
                    (answer.members.openRevision?.candidates ?? []).map(\.id).filter {
                        removed[$0] == nil
                    })))
    }

    /// The open revision's candidates the caller proposed, in the server's order, each with what
    /// this list's own actions learned of their link since; on the person's invitation page,
    /// only its candidate, if the caller proposed them.
    private var myCandidates: [Candidate] {
        guard let answer, let revision = answer.members.openRevision else { return [] }
        let me = answer.members.club.myMembershipID
        return revision.candidates.filter {
            $0.proposedBy.membershipID == me && (candidateID == nil || $0.id == candidateID)
                && removed[$0.id] == nil
        }.map { candidate in
            guard let invitation = learned[candidate.id]?.invitation else { return candidate }
            return Candidate(
                id: candidate.id, name: candidate.name, proposedBy: candidate.proposedBy,
                invitation: invitation)
        }
    }

    /// The server's answer to this list's own action: the row says it at once.
    private func learn(_ invitation: CandidateInvitation, for candidateID: String) {
        learned[candidateID] = (invitation, reads)
        relist()
    }

    private func mine(_ candidateID: String) -> Candidate? {
        myCandidates.first { $0.id == candidateID }
    }

    /// A candidate's row: on the setup list with Remove invitation in More, on the person's
    /// invitation page without it (it stays link-only: `docs/design/handoff-7/ios-lane-needs.md`
    /// item 82).
    private func row(for candidate: Candidate) -> InvitationRow? {
        InvitationRow(
            candidate, kept: book.link(for: candidate.id, club: club.id, account: accountID),
            removable: candidateID == nil)
    }

    // MARK: Making a link

    /// Makes and keeps a link for `candidate`, under the key its action started with; nil, with
    /// the failure, when it couldn't. Its action is the candidate's first link, or a link in
    /// place of the one the row shows: a retry of the same action sends the same key, and another
    /// action a new one. The caller holds the row busy.
    private func make(for candidate: Candidate) async -> KeptInvitationLink? {
        fail(nil)
        let replacing = candidate.invitation?.id
        let key =
            linkKeys[candidate.id].flatMap { $0.replacing == replacing ? $0.key : nil }
            ?? makeKey()
        linkKeys[candidate.id] = (replacing, key)
        do {
            var answer = try await service.createInvitation(
                for: candidate.id, in: club.id, key: key)
            guard current() else { return nil }
            if answer.url == nil {
                // A replay of an answer lost on the way, with no link: that link was never
                // shared, so one more replaces it.
                let fresh = makeKey()
                linkKeys[candidate.id] = (replacing, fresh)
                answer = try await service.createInvitation(
                    for: candidate.id, in: club.id, key: fresh)
                guard current() else { return nil }
            }
            linkKeys[candidate.id] = nil
            guard let kept = book.keep(answer, club: club.id, account: accountID) else {
                failLink(candidate, replacing: replacing, network: false)
                return nil
            }
            learn(
                CandidateInvitation(
                    id: kept.invitationID, state: .live, expiresAt: answer.expiresAt),
                for: candidate.id)
            return kept
        } catch .network {
            guard current() else { return nil }
            failLink(candidate, replacing: replacing, network: true)
        } catch .unavailable, .unreadable {
            // The server may have made it: the retry sends the same key, and its replay, with
            // no link, makes one more under a new one.
            guard current() else { return nil }
            failLink(candidate, replacing: replacing, network: false)
        } catch .signedOut {
            linkKeys[candidate.id] = nil
            guard current() else { return nil }
            await signedOut()
        } catch {
            linkKeys[candidate.id] = nil
            guard current() else { return nil }
            failLink(candidate, replacing: replacing, network: false)
            await refresh()
        }
        return nil
    }

    /// A link that couldn't be made, in the first link's words or a new link's in place of the
    /// one the row shows.
    private func failLink(_ candidate: Candidate, replacing: String?, network: Bool) {
        if replacing == nil {
            fail(.createLink(name: candidate.name, network: network), candidate.id, .firstLink)
        } else {
            fail(.createNewLink(name: candidate.name, network: network), candidate.id, .newLink)
        }
    }

    // MARK: The failure line

    /// Shows `failure` for that person's action in place of any line before, or clears the line.
    private func fail(
        _ failure: ActionFailure?, _ candidateID: String? = nil, _ action: FailedAction? = nil
    ) {
        actionFailure = failure
        failedFor = candidateID.flatMap { id in action.map { (id, $0) } }
    }

    /// A read answered: the line goes once that person's row no longer offers the action that
    /// failed, since its Try again has nothing left to try and the row shows where things stand
    /// (handoff 9's `lifetime`, "authoritative reconciliation resolves it"). Their row gone;
    /// Remove invitation no longer in More; Revoke link no longer in More; Create new link
    /// neither the action nor in More; a first link, once they have one.
    private func settleFailure() {
        guard let failedFor else { return }
        let candidate = mine(failedFor.candidateID)
        let stillOffered: Bool =
            switch (failedFor.action, candidate.flatMap(row(for:))) {
            case (_, nil): false
            case (.revoke, let row?): row.menu.contains(.revokeLink)
            case (.remove, let row?): row.menu.contains(.removeInvitation)
            case (.newLink, let row?):
                row.action == .createNewLink || row.menu.contains(.createNewLink)
            case (.firstLink, _): candidate?.invitation == nil
            }
        if !stillOffered { fail(nil) }
    }

    static func decisive(_ first: APIFailure?, _ second: APIFailure?) -> APIFailure? {
        let both = [first, second].compactMap { $0 }
        return both.first { $0 == .signedOut } ?? both.first { $0 == .notFound }
    }

    nonisolated static func result<T: Sendable>(
        _ body: @Sendable () async throws(APIFailure) -> T
    ) async -> Result<T, APIFailure> {
        do {
            return .success(try await body())
        } catch {
            return .failure(error)
        }
    }
}

extension Result {
    fileprivate var failure: Failure? {
        if case .failure(let failure) = self { return failure }
        return nil
    }
}

/// The name step (`G01-invite-name`, "Who is it for?"): the person's name, then Create link and
/// share, which proposes them (`proposeRoster`, a new revision of the exact roster, spec 32) and
/// makes their link (`createInvitation`), kept before it's offered for sharing, so a cancelled
/// share never makes a second one (`createInvitation.retention`).
///
/// It's one action with two keys, each made when its step first runs and sent again on every
/// retry of that step (T19); a step already done isn't done again, and once the person is
/// proposed the name is theirs and stays. An answer without its link (the first lost on the way)
/// makes one more under a new key. A failure is "Couldn’t create the invitation link for
/// {name}." with the network's or a refusal's line, and keeps the name; a version conflict reads
/// the roster's version again, and the next tap is a new action from it.
///
/// From Club details' Invite someone (handoff 8's `activeInvitationManagement`), the open
/// revision's candidates aren't known (`known` nil): the first tap reads the club and its members
/// before it proposes, so the person this proposal adds is told apart from anyone proposed
/// earlier under the same name, and proposes at the version that read gave. A failed read fails
/// the action with nothing proposed, and the next tap reads again.
@MainActor @Observable public final class InviteNameModel {
    public enum Failure: Sendable, Equatable {
        case network
        case other
    }

    /// FQ70: a person's name is 1 to 40 grapheme clusters, as the API's `CandidateLabel`.
    public static let nameLimit = 40

    public let club: ClubRef
    public private(set) var isCreating = false
    public private(set) var failure: Failure?
    /// The person proposed, once the server answered.
    public private(set) var candidate: Candidate?
    /// Their link, kept, for the share sheet.
    public private(set) var link: KeptInvitationLink?

    private var rosterVersion: Int
    private var known: Set<String>?
    private var proposal: (name: String, version: Int, key: IdempotencyKey)?
    private var linkKey: IdempotencyKey?

    let accountID: String
    let service: any ClubService
    let book: InvitationLinkBook
    let makeKey: @Sendable () -> IdempotencyKey
    let current: @MainActor () -> Bool
    let signedOut: @MainActor () async -> Void
    let changed: @MainActor () async -> Void

    /// `known` holds the candidates the list already showed, so the one this proposal adds is
    /// told apart, or nil when they aren't known yet; `changed` reads the list again once a share
    /// sheet closes.
    public init(
        club: ClubRef, accountID: String, rosterVersion: Int, known: Set<String>?,
        service: any ClubService, book: InvitationLinkBook,
        makeKey: @escaping @Sendable () -> IdempotencyKey = { IdempotencyKey.make() },
        current: @escaping @MainActor () -> Bool,
        signedOut: @escaping @MainActor () async -> Void = {},
        changed: @escaping @MainActor () async -> Void = {}
    ) {
        self.club = club
        self.accountID = accountID
        self.rosterVersion = rosterVersion
        self.known = known
        self.service = service
        self.book = book
        self.makeKey = makeKey
        self.current = current
        self.signedOut = signedOut
        self.changed = changed
    }

    /// The name as typed: read-only while the action runs, and once the person is proposed.
    public var name: String {
        get { candidate?.name ?? typedName }
        set {
            guard !isCreating, candidate == nil else { return }
            typedName = newValue
        }
    }
    private var typedName = ""

    /// The name, trimmed, is longer than FQ70's 40 characters.
    public var nameIsTooLong: Bool { trimmedName.count > Self.nameLimit }

    /// Create link and share: a name with something in it besides spaces, no longer than 40
    /// characters, nothing on its way, and no link made yet.
    public var canCreate: Bool {
        (candidate != nil || (!trimmedName.isEmpty && !nameIsTooLong)) && !isCreating
            && link == nil
    }

    /// The name a failure names: the person proposed, or the name as typed.
    public var failureName: String { candidate?.name ?? trimmedName }

    /// Create link and share is on its way, or may have proposed the person or made the link
    /// without the answer reaching the phone: the next tap sends the same keys (T19), so a name
    /// step left this way is the one Club details' Invite someone opens again
    /// (`ClubDetailsModel.makeInvite`).
    public var isUnfinished: Bool {
        isCreating || (link == nil && (candidate != nil || proposal != nil))
    }

    /// The name step opened again after Back: the line goes, as navigation left (handoff 9's
    /// `lifetime`), and each command's key stays for its retry (T19).
    public func reopened() {
        failure = nil
    }

    /// Create link and share: the link to give the share sheet, or nil with the failure.
    public func createLinkAndShare() async -> URL? {
        guard canCreate else { return nil }
        isCreating = true
        failure = nil
        defer { isCreating = false }
        do {
            let proposed: Candidate
            if let candidate {
                proposed = candidate
            } else {
                if known == nil {
                    try await readFirst()
                    guard current() else { return nil }
                }
                proposed = try await propose()
            }
            guard current() else { return nil }
            guard let kept = try await makeLink(for: proposed), current() else { return nil }
            link = kept
            return kept.url
        } catch .network {
            guard current() else { return nil }
            failure = .network
        } catch .unavailable, .unreadable {
            // The server may have proposed the person or made the link: each retry sends its
            // command's same key.
            guard current() else { return nil }
            failure = .other
        } catch .signedOut {
            (proposal, linkKey) = (nil, nil)
            guard current() else { return nil }
            await signedOut()
        } catch .versionConflict {
            proposal = nil
            guard current() else { return nil }
            failure = .other
            await reread()
        } catch {
            (proposal, linkKey) = (nil, nil)
            guard current() else { return nil }
            failure = .other
        }
        return nil
    }

    /// The share sheet closed: a completed share marks the link Shared (FQ67); either way the
    /// list is read again, where the person's row now is.
    public func shareFinished(completed: Bool) async {
        if completed, let link { book.markShared(link.invitationID, account: accountID) }
        await changed()
    }

    private var trimmedName: String { typedName.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Proposes the person: the one candidate the answer adds, with this name, proposed by the
    /// caller.
    private func propose() async throws(APIFailure) -> Candidate {
        let name = trimmedName
        let attempt =
            proposal.flatMap { $0.name == name && $0.version == rosterVersion ? $0 : nil }
            ?? (name: name, version: rosterVersion, key: makeKey())
        proposal = attempt
        let revision = try await service.propose(
            [attempt.name], in: club.id, expectedRosterVersion: attempt.version, key: attempt.key)
        let known = known ?? []
        let added = revision.candidates.filter {
            !known.contains($0.id) && $0.name == name
                && $0.proposedBy.membershipID == club.myMembershipID
        }
        // An answer that doesn't add exactly this person doesn't say what the server did with
        // the proposal: the retry sends the same key rather than propose them again.
        guard added.count == 1 else { throw .unreadable }
        proposal = nil
        candidate = added[0]
        return added[0]
    }

    /// Makes and keeps the person's link; nil, keeping nothing, when its answer comes after the
    /// session it was asked in ended (`current`): nothing is kept once Leave sign-in has
    /// forgotten the links (T11).
    private func makeLink(for candidate: Candidate) async throws(APIFailure) -> KeptInvitationLink?
    {
        let key = linkKey ?? makeKey()
        linkKey = key
        var answer = try await service.createInvitation(for: candidate.id, in: club.id, key: key)
        guard current() else { return nil }
        if answer.url == nil {
            let fresh = makeKey()
            linkKey = fresh
            answer = try await service.createInvitation(for: candidate.id, in: club.id, key: fresh)
            guard current() else { return nil }
        }
        linkKey = nil
        guard let kept = book.keep(answer, club: club.id, account: accountID) else {
            throw .refused
        }
        return kept
    }

    /// After a version conflict: the roster's version and candidates as they are now, so the
    /// next tap is a new action from them. A failed read leaves them, and the next tap's own
    /// conflict reads again.
    private func reread() async {
        guard let answers = await read() else { return }
        if case .success(let list) = answers.1 {
            known = Set(list.openRevision?.candidates.map(\.id) ?? [])
        }
        if case .success(let detail) = answers.0 { rosterVersion = detail.rosterVersion }
    }

    /// Before the first proposal of a name step whose candidates aren't known: the roster's
    /// version and candidates, both from the same read, or the read's failure, with nothing
    /// changed. Nothing happens once the session it was asked in has ended.
    private func readFirst() async throws(APIFailure) {
        guard let answers = await read() else { return }
        switch answers {
        case (.success(let detail), .success(let list)):
            rosterVersion = detail.rosterVersion
            known = Set(list.openRevision?.candidates.map(\.id) ?? [])
        case (.failure(let failure), _), (_, .failure(let failure)):
            throw InvitationListModel.decisive(answers.0.failure, answers.1.failure) ?? failure
        }
    }

    /// The club and its members, read together; a members answer settles the kept links. Nil
    /// once the session it was asked in has ended.
    private func read() async -> (Result<ClubDetail, APIFailure>, Result<MemberList, APIFailure>)? {
        let stamp = book.beginRead()
        let id = club.id
        async let detail = InvitationListModel.result { [service] () async throws(APIFailure) in
            try await service.club(id)
        }
        async let members = InvitationListModel.result { [service] () async throws(APIFailure) in
            try await service.members(of: id)
        }
        let answers = await (detail, members)
        guard current() else { return nil }
        if case .success(let list) = answers.1 {
            book.settle(list, stamp: stamp, account: accountID)
        }
        return answers
    }
}
