import Foundation
import Observation

/// A member's decision on one open roster revision (G03-approve, G03-approve-failed;
/// `docs/plans/ios-b1-approve.md` section 2): Approve or Decline the exact roster on screen, with
/// its `version` as `expected_version` (spec 32, T7).
///
/// Nothing here counts anything: the screen never says how many approved, who else decided, or who
/// hasn't (book p30, T15, T33), and a decline names nobody.
///
/// Each action has its own key, made when it starts (T19). While the server may have carried an
/// action out (no answer, a busy server, an answer this build couldn't read), the action's retry
/// sends the same key; a refusal carried nothing out, so its next tap is a new action with a new
/// key, as `InvitationModel`'s Accept (audit A8). A newer revision starts with no keys at all, so
/// no decision is replayed onto a roster the person didn't see (handoff 8).
///
/// The approval's own outcomes are alerts (handoff 8, "Changed roster and full club outcomes"):
/// - the roster changed (`ROSTER_CHANGED`: a newer revision replaced this one), with Review
///   members, which reads the members again and shows the revision they now list;
/// - the club full (`CLUB_FULL`, approving only), with See members.
///
/// A `VERSION_CONFLICT` says the revision moved without a newer one replacing it (a member
/// declined, say), so "The members have changed." would be untrue (T43): the members are read at
/// once, as Review members reads them, with no alert, as `InvitationModel`'s Accept checks again.
///
/// A decision is done only when the answer holds it: the server answers a request that changes
/// nothing (the viewer had decided already, an earlier answer lost) with the revision as it stands
/// (spec 32). An answer holding the other decision keeps the screen, with the action's own failure
/// line (FQ146's default); one where the revision ended without the viewer's decision is "no
/// longer available".
///
/// A not found, from either call or from Review members' read, is the same answer for a revision
/// that ended, one that never was and one the caller can't see (T14): "This invitation is no longer
/// available.", and `gone` has the club's members read again, which decides whether the club is
/// still the caller's. An answer counts only while `current` says the session it was asked in
/// goes on and the club is still the selected one.
@MainActor @Observable public final class RosterApprovalModel {
    public enum Action: Sendable, Equatable, Hashable {
        case approve
        case decline
    }

    /// Why an action or a read failed, which picks the line's second sentence: the network's
    /// ("Check your connection and try again.") or any other's ("Try again."; handoff 8's failure
    /// words).
    public enum Failure: Sendable, Equatable {
        case network
        case other
    }

    public struct Failed: Sendable, Equatable {
        public let action: Action
        public let failure: Failure

        public init(action: Action, failure: Failure) {
            self.action = action
            self.failure = failure
        }
    }

    public enum Alert: Sendable, Equatable {
        /// "Review the updated roster", with the action's own body, and Review members.
        case rosterChanged(Action)
        /// "{clubName} is full.", "{clubName} already has six members.", and See members.
        case clubFull
    }

    public enum State: Sendable, Equatable {
        /// The roster on screen, with Approve and Decline.
        case deciding(RosterRevision)
        /// Review members is reading the members for the revision now open.
        case reviewing
        /// Review members' read failed: the proposed members' failure form, with Retry.
        case reviewFailed(Failure)
        /// "This invitation is no longer available.", with Back.
        case unavailable
        /// Decided, or See members: the screen closes back to Members, which reads again.
        case finished
    }

    public let club: ClubRef
    /// The revision Members listed when the screen opened.
    public let opened: RosterRevision
    public private(set) var state: State
    /// The action out, if any: both buttons wait while one is.
    public private(set) var busy: Action?
    /// The last action's failure, shown under the note with both actions kept.
    public private(set) var failed: Failed?
    /// The alert showing, if any; the screen clears it as the alert goes.
    public var alert: Alert?

    let service: any ClubService
    let makeKey: @Sendable () -> IdempotencyKey
    let current: @MainActor () -> Bool
    let gone: @MainActor () async -> Void
    let signedOut: @MainActor () async -> Void
    /// Each action's key while the server may have carried it out, for the revision and version
    /// it was sent for.
    private var pending: [Action: (revisionID: String, version: Int, key: IdempotencyKey)] = [:]
    private var reviews = 0

    /// How many times the approval has learned, or may have caused, something the members list
    /// under it doesn't show: a decision, an outcome, a newer roster, or an action the server may
    /// have carried out with no answer. The tabs read the members again once for each
    /// (`takeMembersRead`), whenever the screen closes or, closed, whenever it changes.
    public private(set) var changes = 0
    private var membersRead = 0

    public init(
        revision: RosterRevision, service: any ClubService,
        makeKey: @escaping @Sendable () -> IdempotencyKey = { IdempotencyKey.make() },
        current: @escaping @MainActor () -> Bool = { true },
        gone: @escaping @MainActor () async -> Void = {},
        signedOut: @escaping @MainActor () async -> Void = {}
    ) {
        club = revision.club
        opened = revision
        state = .deciding(revision)
        self.service = service
        self.makeKey = makeKey
        self.current = current
        self.gone = gone
        self.signedOut = signedOut
    }

    /// The revision on screen, while there is one.
    public var revision: RosterRevision? {
        if case .deciding(let revision) = state { revision } else { nil }
    }

    /// Whether Members, under the screen, should read again now: true once for each change since
    /// it last did (`changes`). A refusal changes nothing, so Back after one reads nothing; a not
    /// found's own read (`gone`) is the only one it gets.
    public func takeMembersRead() -> Bool {
        guard membersRead < changes else { return false }
        membersRead = changes
        return true
    }

    /// Whether Members' row for `revision` opens this approval as it stands, and not a new one:
    /// the same revision at the same version is still on screen, so its keys (T19), its failure's
    /// line and any action still out stay with it, and no second decision goes out beside one
    /// still on its way.
    public func reopens(_ revision: RosterRevision) -> Bool {
        guard let shown = self.revision else { return false }
        return shown.id == revision.id && shown.version == revision.version
    }

    public func approve() async { await decide(.approve) }

    public func decline() async { await decide(.decline) }

    private enum Then {
        case nothing
        case gone
        case review
        case endSession
    }

    /// What the decision `action` records for the viewer.
    private static func decision(_ action: Action) -> RosterDecision {
        switch action {
        case .approve: .approved
        case .decline: .declined
        }
    }

    private func decide(_ action: Action) async {
        guard busy == nil, alert == nil, let revision else { return }
        busy = action
        failed = nil
        let attempt: (revisionID: String, version: Int, key: IdempotencyKey)
        if let kept = pending[action], kept.revisionID == revision.id,
            kept.version == revision.version
        {
            attempt = kept
        } else {
            attempt = (revision.id, revision.version, makeKey())
        }
        pending[action] = attempt
        let answer: Result<RosterRevision, APIFailure>
        do {
            switch action {
            case .approve:
                answer = .success(
                    try await service.approve(
                        attempt.revisionID, expectedVersion: attempt.version, key: attempt.key))
            case .decline:
                answer = .success(
                    try await service.decline(
                        attempt.revisionID, expectedVersion: attempt.version, key: attempt.key))
            }
        } catch {
            answer = .failure(error)
        }
        busy = nil
        guard current(), !Task.isCancelled || answer != .failure(.network) else { return }
        guard case .deciding(let shown) = state, shown.id == attempt.revisionID else { return }
        var then = Then.nothing
        switch answer {
        case .success(let answered) where answered.myDecision == Self.decision(action):
            pending = [:]
            state = .finished
            changes += 1
        case .success(let answered)
        where answered.myDecision == .pending && answered.state != .open:
            // The revision ended before the viewer decided: nothing to decide any more.
            pending = [:]
            state = .unavailable
            changes += 1
        case .success:
            // The request changed nothing: an earlier decision of the viewer's, its answer lost,
            // went through (FQ146), or an answer the contract never gives. This action wasn't
            // carried out, so its next tap is a new one; the other's key stays, and its retry is
            // answered with the decision it made.
            pending[action] = nil
            failed = Failed(action: action, failure: .other)
            changes += 1
        case .failure(.rosterChanged):
            pending = [:]
            alert = .rosterChanged(action)
            changes += 1
        case .failure(.versionConflict):
            pending = [:]
            then = .review
        case .failure(.clubFull) where action == .approve:
            pending = [:]
            alert = .clubFull
            changes += 1
        case .failure(.notFound):
            pending = [:]
            state = .unavailable
            then = .gone
        case .failure(.signedOut):
            pending = [:]
            then = .endSession
        case .failure(.network):
            // No answer: the server may have carried it out, so the retry sends the same key.
            failed = Failed(action: action, failure: .network)
            changes += 1
        case .failure(.unavailable), .failure(.unreadable):
            // A busy server, or an answer this build couldn't read: the server may have carried
            // it out too, so the retry sends the same key.
            failed = Failed(action: action, failure: .other)
            changes += 1
        case .failure:
            // A refusal carried nothing out: the next tap is a new action.
            pending[action] = nil
            failed = Failed(action: action, failure: .other)
        }
        switch then {
        case .nothing: break
        case .gone: await membersGone()
        case .review: await reviewMembers()
        case .endSession: await signedOut()
        }
    }

    /// A not found: the club's members read again (`gone`), the one read Members gets for it.
    private func membersGone() async {
        await gone()
        membersRead = changes
    }

    /// The roster changed alert's Review members, a version conflict, and Retry after its read
    /// failed: the club's members read again, and the revision they list now shown with no keys,
    /// so neither decision is replayed onto it. No revision open any more is "no longer
    /// available"; one the caller has already decided on (the caller's own proposal, FQ60, or an
    /// earlier decision whose answer was lost) closes the screen back to Members.
    public func reviewMembers() async {
        switch state {
        case .deciding, .reviewFailed: break
        default: return
        }
        guard busy == nil else { return }
        alert = nil
        failed = nil
        pending = [:]
        reviews += 1
        let asked = reviews
        state = .reviewing
        // Members lists the roster this screen has moved on from.
        changes += 1
        let answer: Result<MemberList, APIFailure>
        do {
            answer = .success(try await service.members(of: club.id))
        } catch {
            answer = .failure(error)
        }
        guard current(), asked == reviews, state == .reviewing else { return }
        if Task.isCancelled, answer == .failure(.network) { return }
        switch answer {
        case .success(let list):
            if let open = list.openRevision, open.state == .open {
                state = open.myDecision == .pending ? .deciding(open) : .finished
            } else {
                state = .unavailable
            }
        case .failure(.notFound):
            state = .unavailable
            await membersGone()
        case .failure(.signedOut):
            await signedOut()
        case .failure(.network):
            state = .reviewFailed(.network)
        case .failure:
            state = .reviewFailed(.other)
        }
    }

    /// The full club alert's See members: the screen closes back to Members, which reads again.
    public func seeMembers() {
        alert = nil
        state = .finished
    }
}
