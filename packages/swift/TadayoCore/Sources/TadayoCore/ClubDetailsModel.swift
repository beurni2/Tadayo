import Foundation
import Observation

/// Club details and its members list, for one club (G05-club-details, G05-members and
/// G05-members-two-days; `docs/plans/ios-b1-club-details.md` section 1). `RootModel.clubDetails()`
/// makes one for the selected club.
///
/// The two screens load and fail apart, each with its own words (handoff 8's
/// `loadStates.details` and `loadStates.members`), so each has its own state:
/// - `details`, from `GET /v1/clubs/{club_id}`; a suspended club is `.unavailable` with no call
///   (FQ80's default: the same "Club unavailable" as Home, with nothing of the club; T9);
/// - `members`, from `GET /v1/clubs/{club_id}/members` and `GET /v1/clubs/{club_id}/schedule`
///   together: the roster, and each member's weekday or two, which `listMembers` doesn't hold
///   (its `next_day` is one day).
///
/// An answer counts only while `current` says so (the session it was asked in hasn't ended and
/// the club is still the selected one) and while the read wasn't cancelled: a screen that went
/// away before its answer came gets none, and a read cancelled on the way, which the client
/// gives as a network failure, shows no failure. A later read of the same screen drops an earlier
/// one's answer. A not found means the club is no longer the caller's to read (left, suspended
/// or gone: T9, T14): the model is `closed`, which closes the screens showing it, and `gone` has
/// the list read again, which decides. A `signedOut` answer ends the session (`signedOut`), as
/// everywhere else. Nothing is written anywhere: the answers live in this model, in memory, until
/// the tabs let it go (the next Club details opened, or the session's end). The one exception is
/// the account's kept invitation links (`links`): each members answer settles them, as the setup
/// list's does, so a candidate who joined has their link purged even when the setup list isn't
/// opened again (ADR-037).
@MainActor @Observable public final class ClubDetailsModel {
    /// Why a read failed, which picks the line under the failure's title: the network's ("Check
    /// your connection and try again.") or a refusal's ("Try again."; handoff 8's
    /// `networkBodyKey` and `refusalBodyKey`).
    public enum Failure: Sendable, Equatable {
        case network
        case refused
    }

    public enum Details: Sendable, Equatable {
        case loading
        case loaded(ClubDetail)
        case failed(Failure)
        /// A suspended club: nothing of it, and no call (T9, FQ80).
        case unavailable
    }

    public enum Members: Sendable, Equatable {
        case loading
        case loaded(Roster)
        case failed(Failure)
    }

    /// The club as the list had it when the model was made.
    public let club: ClubSummary
    public private(set) var details: Details
    public private(set) var members = Members.loading
    /// A read answered not found: the club is no longer the caller's to read, so nothing of it
    /// stays on screen (T9). The screens close on it, whenever the list's own read answers.
    public private(set) var closed = false
    /// The person whose removal from Members is on its way (handoff 11's sections 5 and 8): their
    /// row says "Removing…", and its More and its route wait. One at a time.
    public private(set) var removing: String?
    /// Why the last removal from Members failed, under that person's row, until another removal
    /// starts, a read no longer offers the removal for them, or Members shows again.
    public private(set) var removalFailure: RemovalFailure?
    /// The last thing a removal from Members has VoiceOver say.
    public private(set) var notice: RemovalNotice?

    /// "Couldn’t remove {name}’s invitation to {clubName}. Try again.", or, `uncertain`,
    /// "Couldn’t confirm that {name}’s invitation to {clubName} was removed. Check your
    /// connection and try again." (handoff 11's section 5), under the person's row; or,
    /// `unavailable`, "This invitation is no longer available." for a not found while Members
    /// still lists them, so the server's last word isn't an endless "Try again" (handoff 11's
    /// section 4: `handoff11.remove.unavailable`).
    public struct RemovalFailure: Sendable, Equatable {
        public let candidateID: String
        public let name: String
        public let club: String
        public let uncertain: Bool
        public let unavailable: Bool

        public init(
            candidateID: String, name: String, club: String, uncertain: Bool,
            unavailable: Bool = false
        ) {
            self.candidateID = candidateID
            self.name = name
            self.club = club
            self.uncertain = uncertain
            self.unavailable = unavailable
        }
    }

    let service: any ClubService
    /// The account's kept invitation links, which each members answer settles (ADR-037).
    let links: (book: InvitationLinkBook, accountID: String)?
    let current: @MainActor () -> Bool
    let gone: @MainActor () async -> Void
    let signedOut: @MainActor () async -> Void
    private var detailReads = 0
    /// The person's invitation page opened last, kept while it goes on (`invitation(for:)`).
    private var keptInvitation: InvitationListModel?
    private var keptNaming: InviteNameModel?
    private var memberReads = 0
    private var notices = 0

    public init(
        club: ClubSummary, service: any ClubService,
        links: (book: InvitationLinkBook, accountID: String)? = nil,
        current: @escaping @MainActor () -> Bool = { true },
        gone: @escaping @MainActor () async -> Void = {},
        signedOut: @escaping @MainActor () async -> Void = {}
    ) {
        self.club = club
        self.service = service
        self.links = links
        self.current = current
        self.gone = gone
        self.signedOut = signedOut
        details = club.state == .suspended ? .unavailable : .loading
    }

    /// Club details, when it shows and on its Retry.
    public func loadDetails() async {
        await readDetails(quiet: false)
    }

    /// Club details read again as it shows again after Invite someone, whose proposal may have
    /// taken the club's last place: the details on screen stay while the read is out, and stay if
    /// it fails. Details not loaded yet load as on Retry.
    public func refreshDetails() async {
        guard case .loaded = details else { return await readDetails(quiet: false) }
        await readDetails(quiet: true)
    }

    private func readDetails(quiet: Bool) async {
        guard club.state != .suspended else {
            details = .unavailable
            return
        }
        detailReads += 1
        let asked = detailReads
        if !quiet { details = .loading }
        let answer = await Self.result { [service, club] () async throws(APIFailure) in
            try await service.club(club.id)
        }
        guard !Task.isCancelled, current(), asked == detailReads else { return }
        switch answer {
        case .success(let detail):
            details = .loaded(detail)
        case .failure(let failure):
            if let failed = await settle(failure), !quiet { details = .failed(failed) }
        }
    }

    /// The members list, when it shows and on its Retry: the roster and the club's week, read
    /// together, since the list needs both. Members shown again takes a removal's line.
    public func loadMembers() async {
        removalFailure = nil
        await readMembers(quiet: false)
    }

    /// The members read again after a removal: what's shown stays while the reads are out, and
    /// stays if they fail (a not found still closes the club's screens, and a session ended still
    /// ends it).
    public func refreshMembers() async {
        await readMembers(quiet: true)
    }

    private func readMembers(quiet: Bool) async {
        guard club.state != .suspended else { return }
        memberReads += 1
        let asked = memberReads
        if !quiet { members = .loading }
        let stamp = links?.book.beginRead()
        let id = club.id
        async let list = Self.result { [service] () async throws(APIFailure) in
            try await service.members(of: id)
        }
        async let week = Self.result { [service] () async throws(APIFailure) in
            try await service.schedule(of: id)
        }
        let answers = await (list, week)
        guard !Task.isCancelled, current() else { return }
        // The members answer settles the kept links whichever read is latest: it's the server's
        // word on them as of its request (ADR-037), whatever the week's read answered.
        if let links, let stamp {
            switch answers.0 {
            case .success(let roster):
                links.book.settle(roster, stamp: stamp, account: links.accountID)
            case .failure(.notFound):
                links.book.settleGone(club: id, stamp: stamp, account: links.accountID)
            case .failure:
                break
            }
        }
        guard asked == memberReads else { return }
        switch answers {
        case (.success(let list), .success(let week)):
            members = .loaded(Roster(list, week: week))
            // The line goes once that person's row no longer offers the removal.
            if let failed = removalFailure, !removable(failed.candidateID) {
                removalFailure = nil
            }
        case (.failure(let failure), _), (_, .failure(let failure)):
            // Either failing fails the list. A session ended, then a not found, from either,
            // decides over any other failure, in whichever order the two answered: each says the
            // same of the club or the session.
            let worst = Self.decisive(answers.0.failure, answers.1.failure) ?? failure
            if let failed = await settle(worst), !quiet { members = .failed(failed) }
        }
    }

    /// Remove invitation from Members, after its confirmation (FQ148; handoff 11's sections 5 and
    /// 8): only for a proposed row whose candidate the viewer proposed (`Roster.Proposed.removable`),
    /// whatever the viewer's decision on the revision, and only while nothing else changing the
    /// club is on its way (`removalCanStart`). On the server's answer every link kept for the
    /// person goes, the row goes at once, Members is read again quietly, and then "{name}’s
    /// invitation was removed." is said. A failure keeps the row with its line and reads Members
    /// again; a not found reads them again, and says Members was updated once the row has gone,
    /// or, while they're still listed, that the invitation is no longer available. The details
    /// are read again after every answer. The removal takes no key (`removeCandidate`).
    public func remove(_ candidateID: String) async {
        guard current(), canRemove(candidateID), case .loaded(let roster) = members,
            let position = roster.proposed.firstIndex(where: { $0.id == candidateID })
        else { return }
        let name = roster.proposed[position].candidate.name
        let clubName = roster.club.name
        removing = candidateID
        removalFailure = nil
        let outcome = await Self.result { [service] () async throws(APIFailure) in
            try await service.removeCandidate(candidateID)
        }
        removing = nil
        // The person's links stop working on the server's answer, whatever this screen does
        // next: the book is the account's, so after a sign-out or a switch this drops nothing.
        if case .success = outcome, let links {
            links.book.dropCandidate(candidateID, club: club.id, account: links.accountID)
        }
        guard current() else { return }
        if case .failure(.signedOut) = outcome { return await signedOut() }
        await settleRemoval(
            outcome, of: candidateID, named: name, in: clubName, at: position)
        // The details read again too, whose Invite someone shows again when the removal freed
        // the club's last place (FQ148): after any answer, since one that never came may have
        // removed them.
        guard current(), !closed else { return }
        await refreshDetails()
    }

    /// Members after a removal's answer, but a session ended: read again quietly, then what
    /// VoiceOver is told, or the line under the person's row.
    private func settleRemoval(
        _ outcome: Result<Void, APIFailure>, of candidateID: String, named name: String,
        in clubName: String, at position: Int
    ) async {
        switch outcome {
        case .success:
            // A read asked before the answer is dropped as the read again starts, which
            // decides; until it answers, and if it fails, the row stays gone.
            if case .loaded(let shown) = members {
                members = .loaded(shown.without(candidateID))
            }
            await refreshMembers()
            guard current(), !closed else { return }
            say(.removed(name: name, position: position))
        case .failure(.notFound):
            await refreshMembers()
            // Members loading again decides for itself, and says nothing.
            guard current(), !closed, let listed = listing(candidateID) else { return }
            if listed {
                removalFailure = RemovalFailure(
                    candidateID: candidateID, name: name, club: clubName, uncertain: false,
                    unavailable: true)
            } else {
                say(.updated)
            }
        case .failure(let failure):
            removalFailure = RemovalFailure(
                candidateID: candidateID, name: name, club: clubName,
                uncertain: failure.leavesRemovalUncertain)
            await refreshMembers()
            guard current(), !closed else { return }
            // Only a roster that no longer lists them says Members changed: the line also goes
            // when Members shows again or another removal starts.
            if removalFailure == nil, listing(candidateID) == false { say(.updated) }
        }
    }

    /// Whether nothing else that changes the club's roster or its links is on its way: a
    /// removal, or the person's invitation page's or the name step's action, which may have
    /// been left by Back while it goes on (handoff 11's `busy.concurrency`: one change in flight
    /// per club). Every More on Members waits while it's false, and so does every proposed
    /// row's route while a removal is out.
    public var removalCanStart: Bool {
        removing == nil && (keptInvitation.map { $0.busy.isEmpty && $0.removing == nil } ?? true)
            && keptNaming?.isCreating != true
    }

    /// Whether Remove invitation can start for this person now: nothing else on its way, and
    /// Members as shown offering it (`Roster.Proposed.removable`).
    public func canRemove(_ candidateID: String) -> Bool {
        guard removalCanStart, case .loaded(let roster) = members else { return false }
        return roster.proposed.contains { $0.id == candidateID && $0.removable }
    }

    /// Whether Members as shown offers the removal for this person.
    private func removable(_ candidateID: String) -> Bool {
        guard case .loaded(let roster) = members else { return false }
        return roster.proposed.contains { $0.id == candidateID && $0.removable }
    }

    /// Whether Members as shown lists this person among the proposed; nil while it isn't shown.
    private func listing(_ candidateID: String) -> Bool? {
        guard case .loaded(let roster) = members else { return nil }
        return roster.proposed.contains { $0.id == candidateID }
    }

    private func say(_ kind: RemovalNotice.Kind) {
        notices += 1
        notice = RemovalNotice(kind: kind, sequence: notices)
    }

    /// G03-approve for the open revision Members lists (`Roster.openRevision`), asked in the same
    /// session and for the same club as this model's reads (`docs/plans/ios-b1-approve.md`
    /// section 2). Its not found reads the members again, whose own not found closes the club's
    /// screens (`closed`), so the members list, not the approval, decides whether the club is
    /// still the caller's.
    public func approval(
        of revision: RosterRevision,
        makeKey: @escaping @Sendable () -> IdempotencyKey = { IdempotencyKey.make() }
    ) -> RosterApprovalModel {
        RosterApprovalModel(
            revision: revision, service: service, makeKey: makeKey, current: current,
            gone: { [weak self] in await self?.loadMembers() }, signedOut: signedOut)
    }

    /// Club details' Invite someone (handoff 8's `activeInvitationManagement`, frame 16): an
    /// active club whose details say the server takes a proposal (`can_propose`: a place is free
    /// and the caller may propose; A01, T6), on a phone that keeps the account's links. A club
    /// that hasn't started keeps its setup list instead (`G01-invite-people`).
    public var canInvite: Bool {
        guard links != nil, case .loaded(let detail) = details else { return false }
        return detail.club.state == .active && detail.canPropose
    }

    /// The name step for Invite someone, from the details' roster version. Club details doesn't
    /// read the open revision's candidates, so the name step reads them before its first
    /// proposal (`known` nil). One left by Back while unfinished (`InviteNameModel.isUnfinished`:
    /// its action on its way, or a proposal or link that may have gone through without its
    /// answer) is the one opened again, its line cleared: its retry sends the same keys, so the
    /// person isn't proposed twice (T19). Nil when Invite someone isn't offered.
    public func makeInvite(
        makeKey: @escaping @Sendable () -> IdempotencyKey = { IdempotencyKey.make() }
    ) -> InviteNameModel? {
        guard canInvite, let links, case .loaded(let detail) = details, current() else {
            return nil
        }
        if let kept = keptNaming, kept.isUnfinished {
            kept.reopened()
            return kept
        }
        let model = InviteNameModel(
            club: club.ref, accountID: links.accountID, rosterVersion: detail.rosterVersion,
            known: nil, service: service, book: links.book, makeKey: makeKey, current: current,
            signedOut: signedOut)
        keptNaming = model
        return model
    }

    /// Whether the person's invitation page opens here: for an active club, on a phone that
    /// keeps the account's links (handoff 8's `activeInvitationManagement`). A club in setup keeps
    /// its setup list (`G01-invite-people`, "remains a setup destination"), and a paused club's
    /// waits for B2's paused states. The club's state is the details' once read.
    public var opensInvitations: Bool {
        guard links != nil else { return false }
        if case .loaded(let detail) = details { return detail.club.state == .active }
        return club.state == .active
    }

    /// The person's invitation page (`G05-members-invite`) for a candidate, asked in the same
    /// session and for the same club as this model's reads: the setup list's model made for that
    /// one candidate, which shows them only while the caller proposed them (handoff 8: "Only
    /// candidate.proposed_by gets link-management controls"). Its not found reads the members
    /// again, as the approval's does. Opened again for the same person while it goes on, it's the
    /// same model, its line cleared, so a link action's key survives Back (T19). Nil where the
    /// page doesn't open (`opensInvitations`) and once the session has ended.
    public func invitation(
        for candidateID: String,
        makeKey: @escaping @Sendable () -> IdempotencyKey = { IdempotencyKey.make() }
    ) -> InvitationListModel? {
        guard opensInvitations, let links, current() else { return nil }
        if let kept = keptInvitation, kept.candidateID == candidateID, !kept.ended, !kept.closed {
            kept.reopened()
            return kept
        }
        let model = InvitationListModel(
            club: club.ref, accountID: links.accountID, service: service, book: links.book,
            candidate: candidateID, makeKey: makeKey, current: current,
            gone: { [weak self] in await self?.loadMembers() }, signedOut: signedOut)
        keptInvitation = model
        return model
    }

    /// What a failed read leads to: the model closed and the list read again for a club no
    /// longer the caller's, the session ended for a `signedOut` answer (neither shows a
    /// failure), or the failure the screen shows.
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

    /// Of two reads' failures, the one that decides more than the screen: a session ended, then
    /// a club no longer the caller's.
    static func decisive(_ first: APIFailure?, _ second: APIFailure?) -> APIFailure? {
        let both = [first, second].compactMap { $0 }
        return both.first { $0 == .signedOut } ?? both.first { $0 == .notFound }
    }

    private nonisolated static func result<T: Sendable>(
        _ body: @Sendable () async throws(APIFailure) -> T
    ) async -> Result<T, APIFailure> {
        do {
            return .success(try await body())
        } catch {
            return .failure(error)
        }
    }
}

/// The members list as Members shows it (G05-members): the roster in the server's stable order
/// (spec 09: never re-sorted by anything else), each member with whether they're the viewer and
/// their weekdays, Monday first, from the club's week in force today.
///
/// The roster and the week are two reads, so a member's days are matched by membership id: a
/// member the week gives none shows the name alone (T49), and a day of someone the roster
/// doesn't list is dropped. The roster, its count and its club are the one `listMembers` answer
/// (handoff 4's `membersFooter`: "updates from one authorized server snapshot"). Nothing in it
/// comes from drops (T55). The days are the week's `current` as the server gives it to this
/// caller (the contract's `Schedule`): in first days opened again with a week of their own, a
/// member's own confirmed days are in the proposal only, which this list doesn't read, until the
/// new week starts (FQ124).
public struct Roster: Sendable, Equatable {
    public struct Row: Sendable, Equatable, Identifiable {
        public let person: Person
        public let isViewer: Bool
        /// Monday first; empty while they have no day in force.
        public let weekdays: [Weekday]

        public var id: String { person.membershipID }

        public init(person: Person, isViewer: Bool, weekdays: [Weekday]) {
            self.person = person
            self.isViewer = isViewer
            self.weekdays = weekdays
        }
    }

    /// How many days each member has, when every member listed has the same: the subtitle
    /// Members shows ("Each person has a day.", "Two reveal days each.").
    public enum Days: Sendable, Equatable {
        case one
        case two
    }

    /// Someone the open revision proposes, in a proposed row after the members (handoff 1:
    /// "Leila, Proposed by Ben, Proposed"; `docs/plans/ios-b1-approve.md` section 2), with what
    /// the row opens for the viewer.
    public struct Proposed: Sendable, Equatable, Identifiable {
        public enum Opens: Sendable, Equatable {
            /// The candidate's proposer, once decided (by proposing, FQ60): the person's invitation
            /// page (`G05-members-invite`, plan PR 7c), where only the proposer sees the link's
            /// controls (handoff 8).
            case invitation
            /// A member whose decision on the revision is pending, the candidate's proposer among
            /// them when the server made the revision for the candidate's own name (FQ84):
            /// G03-approve, without which the revision could never go ahead.
            case approval
            /// A member who has decided: nothing, so no screen tells one decision from another
            /// (FQ143, T15, T33).
            case nothing
        }

        public let candidate: Candidate
        public let opens: Opens
        /// The viewer proposed them, so the row has a More of its own holding Remove invitation,
        /// whatever the viewer's decision on the revision (FQ148; handoff 11's section 5). Other
        /// people's candidates get none.
        public let removable: Bool

        public var id: String { candidate.id }
    }

    public let club: ClubRef
    public let rows: [Row]
    /// The open revision's candidates, in its order; empty when none is open.
    public let proposed: [Proposed]
    /// The open revision itself, which G03-approve decides on exactly as listed here.
    public let openRevision: RosterRevision?

    public init(_ list: MemberList, week: ClubWeek) {
        club = list.club
        rows = list.members.sorted { $0.position < $1.position }.map { member in
            let id = member.person.membershipID
            return Row(
                person: member.person, isViewer: id == list.club.myMembershipID,
                weekdays: week.assignments.filter { $0.person.membershipID == id }.map(\.weekday)
                    .sorted())
        }
        let open = list.openRevision.flatMap { $0.state == .open ? $0 : nil }
        openRevision = open
        proposed = (open?.candidates ?? []).map { candidate in
            let opens: Proposed.Opens =
                if open?.myDecision == .pending {
                    .approval
                } else if candidate.proposedBy.membershipID == list.club.myMembershipID {
                    .invitation
                } else {
                    .nothing
                }
            return Proposed(
                candidate: candidate, opens: opens,
                removable: candidate.proposedBy.membershipID == list.club.myMembershipID)
        }
    }

    private init(club: ClubRef, rows: [Row], proposed: [Proposed], openRevision: RosterRevision?) {
        self.club = club
        self.rows = rows
        self.proposed = proposed
        self.openRevision = openRevision
    }

    /// Where VoiceOver's focus goes once a removal's proposed row has gone from Members.
    public enum RemovalFocus: Sendable, Hashable {
        case proposed(String)
        case member(String)
    }

    /// Members as it reads after a removal whose proposed row stood at `position`: the proposed
    /// row now in that place, else the one before it, else the last member's row, as the setup
    /// list's focus goes to the row in its place or the one before (handoff 11's section 3).
    /// Members has no Create an invitation or Done for now to take it. Nil with no row at all.
    public func focusAfterRemoval(at position: Int) -> RemovalFocus? {
        if proposed.indices.contains(position) { return .proposed(proposed[position].id) }
        if let last = proposed.last { return .proposed(last.id) }
        return rows.last.map { .member($0.id) }
    }

    /// The roster with this person's proposed row gone, on their removal's answer.
    func without(_ candidateID: String) -> Roster {
        Roster(
            club: club, rows: rows, proposed: proposed.filter { $0.id != candidateID },
            openRevision: openRevision)
    }

    /// `.one` when every member has one weekday, `.two` when every member has two, and nil
    /// otherwise: someone with none (a club's first days before everyone has confirmed, say) or
    /// a mix. The subtitle is shown only when the roster bears it out (T43, T49): handoff 1's
    /// check found "Each person has a day." untrue in a pair.
    public var days: Days? {
        let counts = Set(rows.map(\.weekdays.count))
        guard counts.count == 1, let count = counts.first else { return nil }
        switch count {
        case 1: return .one
        case 2: return .two
        default: return nil
        }
    }
}

extension Result {
    fileprivate var failure: Failure? {
        if case .failure(let failure) = self { return failure }
        return nil
    }
}
