import Foundation
import Observation

extension InvitationRoster {
    /// Every entry the server sent, once each, the viewer first and then the rest in the server's
    /// order: presentation only (handoff 8's `invitationRoster`). Accept this roster still sends the
    /// whole revision.
    public var viewerFirst: [InvitationRosterEntry] {
        roster.filter(\.isYou) + roster.filter { !$0.isYou }
    }

    /// The viewer's name on this roster, if it lists the viewer.
    var viewerName: String? { roster.first(where: \.isYou)?.name }
}

/// One invitation, for the signed-in account holding its token (`G02` and `G03`; spec 04; book p9;
/// `docs/plans/ios-b1-invitation.md` section 1). It checks the token (`previewInvitation`), shows
/// what the server answers and nothing more (T7), and accepts the exact roster shown
/// (`acceptInvitation`), with one key for each revision, made when its Accept starts and sent again
/// on every retry of it (T19). It keeps the token for the account once the server has bound it to
/// the account, and drops it when the invitation joins or ends or the link no longer works (the
/// contract's `MyInvitationState`). An answer counts only while `current` says the session it was
/// asked in goes on.
@MainActor @Observable public final class InvitationModel {
    /// "Check your connection and try again." is said only when no answer came.
    public enum Failure: Sendable, Equatable {
        case network
        case other
    }

    /// How a changed roster came about, as far as the app knows (handoff 8's
    /// `invitationRoster.changedName`).
    public enum NameChange: Sendable, Equatable {
        /// This model showed the earlier roster, with the viewer under this name, and the server
        /// then made a revision for the account's name: `nameChanged.explanation`.
        case from(String)
        /// The kept token says the server made the revision for the account's name, and the earlier
        /// name isn't held: `nameChanged.explanationAfterRelaunch`.
        case notHeld
    }

    public enum State: Sendable, Equatable {
        /// `G02-checking`: nothing of the club, the inviter or the roster.
        case checking
        /// The check got no answer (`network`) or failed otherwise, with Retry; never that the link
        /// no longer works (handoff 4).
        case checkFailed(Failure)
        /// `G02-invitation`.
        case open(InvitationRoster)
        /// `G02-changed`, or `G02-changed-name` with a name change.
        case changed(InvitationRoster, NameChange?)
        /// `G03-waiting`.
        case waiting(clubName: String)
        /// `G02-expired`: only who to ask.
        case expired(inviterName: String)
        /// `G02-full`, naming the inviter only if this model showed the roster.
        case full(inviterName: String?)
        /// `G03-declined`, never who declined (book p30).
        case didNotGoAhead(inviterName: String?)
        /// `G02-revoked`: the same for an unknown, revoked, replaced or used link (T14, FQ59).
        case unavailable
        /// The account is a member: the club opens ("Opening {clubName}…" while it waits,
        /// `handoff8.joinedLink`).
        case opening(ClubRef)
        /// An accepted invitation whose roster changed, when the app no longer holds its link: the
        /// person opens or pastes it again (FQ136).
        case reopenLink(clubName: String, inviterName: String)
    }

    public private(set) var state: State
    /// Accept this roster is on its way: a second tap does nothing.
    public private(set) var isAccepting = false
    /// Accept this roster failed: the roster stays, with this line (`G02-invitation-failed`).
    public private(set) var acceptFailure: Failure?

    /// The invitation's token, or nil when the app doesn't hold it: the root holds it again if
    /// this model is set aside before the account can see it.
    let token: InvitationToken?
    private var isChecking = false
    /// The root no longer shows this model: it starts nothing, and an answer still on its way can
    /// drop the token, never keep it.
    private var closed = false
    /// The viewer's name on the roster whose acceptance the server answered `changed`.
    private var earlierName: String?
    /// The inviter this model has shown.
    private var inviterName: String?
    /// The Accept on its way or failed, with its key, for a retry of the same revision.
    private var pending: (revisionID: String, version: Int, key: IdempotencyKey)?

    let service: any ClubService
    let book: InvitationLinkBook
    let accountID: String
    let makeKey: @Sendable () -> IdempotencyKey
    let current: @MainActor () -> Bool
    let joined: @MainActor (ClubRef) async -> Void
    let signedOut: @MainActor () async -> Void

    /// `token` is the invitation's, or nil when the app doesn't hold it; `state` is where it starts:
    /// checking, for a token to check, or what the club list already says. `book` keeps the token
    /// for `accountID`; `current` says the session the model was made in goes on; `joined` opens
    /// the club; `signedOut` ends the session.
    public init(
        token: InvitationToken?, state: State = .checking, service: any ClubService,
        book: InvitationLinkBook, account accountID: String,
        makeKey: @escaping @Sendable () -> IdempotencyKey = { IdempotencyKey.make() },
        current: @escaping @MainActor () -> Bool,
        joined: @escaping @MainActor (ClubRef) async -> Void,
        signedOut: @escaping @MainActor () async -> Void
    ) {
        self.token = token
        self.state = state
        self.service = service
        self.book = book
        self.accountID = accountID
        self.makeKey = makeKey
        self.current = current
        self.joined = joined
        self.signedOut = signedOut
    }

    /// Checks the token: when the model is made with one, on Retry, and after an Accept the server
    /// answered with a newer roster. One check at a time, and none while Accept is on its way.
    public func check() async {
        guard let token, !closed, !isChecking, !isAccepting else { return }
        isChecking = true
        state = .checking
        acceptFailure = nil
        let answer: Result<InvitationPreview, APIFailure>
        do {
            answer = .success(try await service.preview(token))
        } catch {
            answer = .failure(error)
        }
        isChecking = false
        guard current() else { return }
        switch answer {
        case .success(.open(let roster)):
            inviterName = roster.inviterName
            state =
                earlierName == nil ? .open(roster) : .changed(roster, nameChange(roster, nil))
        case .success(.changed(let roster)):
            inviterName = roster.inviterName
            let kept = keep(token, invitation: roster.invitationID)
            state = .changed(roster, nameChange(roster, kept))
        case .success(.waiting(let roster)):
            inviterName = roster.inviterName
            keep(token, invitation: roster.invitationID)
            state = .waiting(clubName: roster.clubName)
        case .success(.expired(let name)):
            book.dropReceived(token, account: accountID)
            state = .expired(inviterName: name)
        case .success(.full):
            state = .full(inviterName: inviterName)
        case .success(.didNotGoAhead):
            book.dropReceived(token, account: accountID)
            state = .didNotGoAhead(inviterName: inviterName)
        case .success(.joined(let club)):
            book.dropReceived(token, account: accountID)
            state = .opening(club)
            await joined(club)
        case .failure(.notFound):
            book.dropReceived(token, account: accountID)
            state = .unavailable
        case .failure(.signedOut):
            await signedOut()
        case .failure(.network):
            state = .checkFailed(.network)
        case .failure:
            state = .checkFailed(.other)
        }
    }

    /// What follows an Accept's answer, once the Accept is no longer on its way.
    private enum Then {
        case nothing
        case check
        case open(ClubRef)
        case endSession
    }

    /// Accept this roster: the exact revision shown, open or changed.
    public func accept() async {
        guard let token, !closed, !isAccepting, !isChecking else { return }
        let roster: InvitationRoster
        switch state {
        case .open(let shown), .changed(let shown, _): roster = shown
        default: return
        }
        isAccepting = true
        acceptFailure = nil
        let attempt: (revisionID: String, version: Int, key: IdempotencyKey)
        if let pending, pending.revisionID == roster.revisionID,
            pending.version == roster.revisionVersion
        {
            attempt = pending
        } else {
            attempt = (roster.revisionID, roster.revisionVersion, makeKey())
        }
        pending = attempt
        let answer: Result<InvitationAcceptance, APIFailure>
        do {
            answer = .success(
                try await service.accept(
                    token, revisionID: attempt.revisionID, expectedVersion: attempt.version,
                    key: attempt.key))
        } catch {
            answer = .failure(error)
        }
        guard current() else {
            isAccepting = false
            return
        }
        let then: Then
        switch answer {
        case .success(.joined(let club)):
            pending = nil
            book.dropReceived(token, account: accountID)
            if let club {
                state = .opening(club)
                then = .open(club)
            } else {
                then = .check
            }
        case .success(.waiting):
            pending = nil
            keep(token, invitation: roster.invitationID, nameChanged: false)
            earlierName = nil
            state = .waiting(clubName: roster.clubName)
            then = .nothing
        case .success(.changed):
            // The server made a revision with the account's name (FQ66): the name on the roster
            // just shown is the earlier one, the only source for it (handoff 8).
            pending = nil
            keep(token, invitation: roster.invitationID, nameChanged: true)
            earlierName = roster.viewerName
            then = .check
        case .failure(.versionConflict), .failure(.rosterChanged):
            pending = nil
            then = .check
        case .failure(.clubFull):
            pending = nil
            state = .full(inviterName: roster.inviterName)
            then = .nothing
        case .failure(.invitationExpired):
            pending = nil
            book.dropReceived(token, account: accountID)
            state = .expired(inviterName: roster.inviterName)
            then = .nothing
        case .failure(.notFound):
            pending = nil
            book.dropReceived(token, account: accountID)
            state = .unavailable
            then = .nothing
        case .failure(.signedOut):
            pending = nil
            then = .endSession
        case .failure(.network):
            // No answer: the server may have accepted, so the retry sends the same key.
            acceptFailure = .network
            then = .nothing
        case .failure(.unavailable):
            acceptFailure = .other
            then = .nothing
        case .failure:
            // Refused, `profileIncomplete` among them: the root shows invitations only to a
            // complete account. The next tap is a new action.
            pending = nil
            acceptFailure = .other
            then = .nothing
        }
        isAccepting = false
        switch then {
        case .nothing: break
        case .check: await check()
        case .open(let club): await joined(club)
        case .endSession: await signedOut()
        }
    }

    /// The root no longer shows this model (it was replaced, closed or set aside): it checks and
    /// accepts nothing more, and an answer still on its way can drop the token but never keeps it,
    /// so a late answer can't keep a token a newer one dropped.
    func close() {
        closed = true
    }

    /// Keeps the token for the account, once the server has bound it to the account, unless the
    /// model is closed; gives what's kept.
    @discardableResult private func keep(
        _ token: InvitationToken, invitation invitationID: String, nameChanged: Bool? = nil
    ) -> KeptReceivedInvitation? {
        guard !closed else { return book.received(token, account: accountID) }
        return book.keepReceived(
            token, invitation: invitationID, account: accountID, nameChanged: nameChanged)
    }

    /// `G02-changed-name`'s explanation, if the roster changed for the account's name.
    private func nameChange(_ roster: InvitationRoster, _ kept: KeptReceivedInvitation?)
        -> NameChange?
    {
        if let earlierName, earlierName != roster.viewerName { return .from(earlierName) }
        return kept?.nameChanged == true ? .notHeld : nil
    }
}
