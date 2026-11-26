import Foundation
import Observation

/// The proposed roster of a club that hasn't started (G05-members-proposed; handoff 5's frame,
/// with handoff 8's loading and failure words), which Review members opens from
/// H01-awaiting-activation and G01-pending (`docs/plans/ios-b1-approve.md` section 2, 7b), and the
/// creator's decision on it while that decision is pending (G05-members-proposed-approve, FQ145's
/// default: Approve and Decline under the list, with G03-approve's outcomes, failure lines and
/// alerts, built from spec until design handoff 10 draws it).
///
/// It reads the club and its members together (`GET /v1/clubs/{club_id}` and
/// `GET /v1/clubs/{club_id}/members`), so it shows exactly the roster the server holds: the open
/// revision's members and candidates in the server's order, or with no open revision the members
/// alone. Names only: nothing counts, and nothing says who has accepted or approved (book p30,
/// p33, T7, T15, T33). A club that the details answer as started, or that either read answers not
/// found (T9, T14), is no longer a proposal, so nothing of it stays here: the model is `closed`,
/// which closes the screen, and `gone` has the club list read again, which decides, as Home does
/// (`RootModel.loadHome`). A `signedOut` answer ends the session. An answer counts only while
/// `current` says the session it was asked in goes on, and a later read drops an earlier one's.
///
/// While the viewer's own `my_decision` on the open revision is `pending`, the roster holds an
/// approval (`RosterApprovalModel`) for exactly that revision and version, and the screen shows
/// Approve and Decline with its line and alerts; the approval's Review members shows the revision
/// it reads, in this screen's loading and failure forms. An answer holding the viewer's own other
/// decision (FQ146) keeps the roster under the alert that says so, both actions waiting, until its
/// Review roster. Once the approval is done with its revision (a decision, See members, Review
/// roster, or a revision that ended), the roster is read again and shows what is true now: a club
/// that started closes the screen. A read that lists the same
/// revision at the same version keeps the approval as it stands, its keys with it (T19), so a
/// decision still on its way is never sent twice.
@MainActor @Observable public final class ProposedRosterModel {
    /// The network's ("Check your connection and try again.") or a refusal's ("Try again.").
    public typealias Failure = ClubDetailsModel.Failure

    public enum State: Sendable, Equatable {
        case loading
        case loaded(ProposedRoster)
        case failed(Failure)
    }

    /// What the screen shows: the roster's own read or, while the viewer decides, the approval's
    /// revision, Review members' read and its failure.
    public enum Shown: Equatable {
        case loading
        case failed(Failure)
        case roster(ProposedRoster)
    }

    public let club: ClubRef
    public private(set) var state = State.loading
    /// The viewer's decision on the open revision, while it is pending.
    public private(set) var approval: RosterApprovalModel?
    /// The club is no longer a proposal the caller can read: the screen closes.
    public private(set) var closed = false

    let service: any ClubService
    let makeKey: @Sendable () -> IdempotencyKey
    let current: @MainActor () -> Bool
    let gone: @MainActor () async -> Void
    let signedOut: @MainActor () async -> Void
    private var reads = 0

    /// How many times a decision here may have changed what the screen under it shows (Home's or
    /// G01-pending's "Review the updated members"): an approval action that changed something,
    /// as the approval counts them. The tabs read it again once for each (`takeUnderRead`).
    public private(set) var changes = 0
    private var underRead = 0

    public init(
        club: ClubRef, service: any ClubService,
        makeKey: @escaping @Sendable () -> IdempotencyKey = { IdempotencyKey.make() },
        current: @escaping @MainActor () -> Bool = { true },
        gone: @escaping @MainActor () async -> Void = {},
        signedOut: @escaping @MainActor () async -> Void = {}
    ) {
        self.club = club
        self.service = service
        self.makeKey = makeKey
        self.current = current
        self.gone = gone
        self.signedOut = signedOut
    }

    public var shown: Shown {
        switch state {
        case .loading:
            return .loading
        case .failed(let failure):
            return .failed(failure)
        case .loaded(let roster):
            guard let approval else { return .roster(roster) }
            switch approval.state {
            case .deciding(let revision), .decided(let revision, _):
                // The roster to decide on or, under the alert saying the viewer's own decision
                // (FQ146), the one they decided on, both actions waiting.
                return .roster(ProposedRoster(revision, viewer: club.myMembershipID))
            case .reviewFailed(let failure):
                return .failed(failure == .network ? .network : .refused)
            case .reviewing, .unavailable, .finished:
                // Review members' read, or a read of the roster on its way.
                return .loading
            }
        }
    }

    /// Whether the viewer's decision on the open revision is pending, as the last answer said:
    /// what the screen under it should ask ("Review the updated members"), or nil before one.
    public var asksDecision: Bool? {
        guard case .loaded(let roster) = state else { return nil }
        return roster.revision?.myDecision == .pending
    }

    /// Whether the screen under it should read again now: true once for each change since it last
    /// did (`changes`).
    public func takeUnderRead() -> Bool {
        guard underRead < changes else { return false }
        underRead = changes
        return true
    }

    /// The roster, when the screen shows, on its Retry, and once the approval is done with its
    /// revision.
    public func load() async {
        reads += 1
        let asked = reads
        state = .loading
        let id = club.id
        async let detail = Self.result { [service] () async throws(APIFailure) in
            try await service.club(id)
        }
        async let list = Self.result { [service] () async throws(APIFailure) in
            try await service.members(of: id)
        }
        let answers = await (detail, list)
        guard !Task.isCancelled, current(), asked == reads else { return }
        switch answers {
        case (.success(let detail), .success(let list)):
            guard detail.club.state == .proposed else {
                // Started meanwhile: nothing here is a proposal any more.
                await close()
                return
            }
            let open = list.openRevision.flatMap { $0.state == .open ? $0 : nil }
            if let open, open.myDecision == .pending {
                if approval?.reopens(open) != true { approval = decision(on: open) }
            } else {
                approval = nil
            }
            state = .loaded(ProposedRoster(list, open: open))
        case (.failure(let failure), _), (_, .failure(let failure)):
            // A session ended, then a not found, from either, decides over any other failure.
            switch ClubDetailsModel.decisive(answers.0.failure, answers.1.failure) ?? failure {
            case .signedOut:
                await signedOut()
            case .notFound:
                await close()
            case .network:
                state = .failed(.network)
            default:
                state = .failed(.refused)
            }
        }
    }

    /// The failure form's Retry: Review members' read again after it failed, or the roster's.
    public func retry() async {
        if case .reviewFailed = approval?.state {
            await reviewMembers()
        } else {
            await load()
        }
    }

    public func approve() async { await act { await $0.approve() } }

    public func decline() async { await act { await $0.decline() } }

    /// The changed roster alert's Review members.
    public func reviewMembers() async { await act { await $0.reviewMembers() } }

    /// The full club alert's See members, and the already decided alert's Review roster (FQ146):
    /// the roster is read again, and shows the viewer's own decision as the server holds it,
    /// read-only, or closes for a club that started.
    public func seeMembers() async { await act { $0.seeMembers() } }

    /// One of the approval's actions, then, once the approval is done with its revision, the
    /// roster read again.
    private func act(_ action: (RosterApprovalModel) async -> Void) async {
        guard let approval else { return }
        let before = approval.changes
        await action(approval)
        guard current(), self.approval === approval else { return }
        if approval.changes != before { changes += 1 }
        switch approval.state {
        case .finished, .unavailable:
            await load()
        case .deciding, .reviewing, .reviewFailed, .decided:
            break
        }
    }

    /// The approval for `revision`. Its not found and its revision's end are this model's to
    /// read (`act`), so it reads nothing of its own.
    private func decision(on revision: RosterRevision) -> RosterApprovalModel {
        RosterApprovalModel(
            revision: revision, service: service, makeKey: makeKey, current: current,
            signedOut: signedOut)
    }

    private func close() async {
        approval = nil
        closed = true
        await gone()
    }

    private nonisolated static func result<T: Sendable>(
        _ call: @Sendable () async throws(APIFailure) -> T
    ) async -> Result<T, APIFailure> {
        do {
            return .success(try await call())
        } catch {
            return .failure(error)
        }
    }
}

/// A proposed roster as G05-members-proposed shows it: each person once, by name, in the server's
/// order, the viewer's own row marked. No weekday, status or count (handoff 5's brief, item 6).
public struct ProposedRoster: Sendable, Equatable {
    public struct Entry: Sendable, Equatable, Identifiable {
        /// The membership's id, or the candidate's.
        public let id: String
        public let name: String
        public let isYou: Bool

        public init(id: String, name: String, isYou: Bool) {
            self.id = id
            self.name = name
            self.isYou = isYou
        }
    }

    public let club: ClubRef
    public let entries: [Entry]
    /// The open revision the entries come from, if any.
    public let revision: RosterRevision?

    /// The open revision's members, then its candidates; with none open, the club's members.
    public init(_ list: MemberList, open: RosterRevision?) {
        guard let open else {
            let viewer = list.club.myMembershipID
            self.init(
                club: list.club,
                entries: list.members.map {
                    Entry(
                        id: $0.person.membershipID, name: $0.person.displayName,
                        isYou: $0.person.membershipID == viewer)
                },
                revision: nil)
            return
        }
        self.init(open, viewer: list.club.myMembershipID)
    }

    /// `revision`'s members, then its candidates, in the server's order.
    public init(_ revision: RosterRevision, viewer: String) {
        self.init(
            club: revision.club,
            entries: revision.members.map {
                Entry(id: $0.membershipID, name: $0.displayName, isYou: $0.membershipID == viewer)
            } + revision.candidates.map { Entry(id: $0.id, name: $0.name, isYou: false) },
            revision: revision)
    }

    private init(club: ClubRef, entries: [Entry], revision: RosterRevision?) {
        self.club = club
        self.entries = entries
        self.revision = revision
    }

    /// The revision Approve and Decline decide on: the open one, while the viewer's decision on
    /// it is pending.
    public var deciding: RosterRevision? {
        revision?.myDecision == .pending ? revision : nil
    }
}

extension Result {
    fileprivate var failure: Failure? {
        if case .failure(let failure) = self { return failure }
        return nil
    }
}
