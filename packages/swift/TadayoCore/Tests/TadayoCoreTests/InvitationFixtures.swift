import Foundation

@testable import TadayoCore

/// A `ClubService` for creating a club and its invitations: each call's answers come from a
/// script, in order, and each call is recorded with what it sent, its key included. A call with
/// no answer left fails as the network does.
final class ScriptedClubs: ClubService, @unchecked Sendable {
    private let lock = NSLock()
    var createAnswers: [Result<ClubDetail, APIFailure>] = []
    var clubAnswers: [Result<ClubDetail, APIFailure>] = []
    var memberAnswers: [Result<MemberList, APIFailure>] = []
    var proposeAnswers: [Result<RosterRevision, APIFailure>] = []
    var linkAnswers: [Result<InvitationLink, APIFailure>] = []
    var revokeAnswers: [Result<Void, APIFailure>] = []
    private(set) var calls: [String] = []
    /// Run inside each members read, given which read it is (1 for the first), before it
    /// answers: a slow network, say.
    var duringMembers: @Sendable (Int) async -> Void = { _ in }
    /// Run inside each link's making, before it answers.
    var duringLink: @Sendable () async -> Void = {}
    private var memberReads = 0

    private func answer<T>(_ call: String, _ answers: inout [Result<T, APIFailure>]) -> Result<
        T, APIFailure
    > {
        calls.append(call)
        return answers.isEmpty ? .failure(.network) : answers.removeFirst()
    }

    func createClub(name: String, timezone: TimeZone, key: IdempotencyKey)
        async throws(APIFailure) -> ClubDetail
    {
        try lock.withLock {
            answer("createClub \(name) \(timezone.identifier) \(key)", &createAnswers)
        }.get()
    }

    func club(_ clubID: String) async throws(APIFailure) -> ClubDetail {
        try lock.withLock { answer("club \(clubID)", &clubAnswers) }.get()
    }

    func members(of clubID: String) async throws(APIFailure) -> MemberList {
        let read = lock.withLock {
            memberReads += 1
            return memberReads
        }
        await duringMembers(read)
        return try lock.withLock { answer("members \(clubID)", &memberAnswers) }.get()
    }

    func propose(
        _ names: [String], in clubID: String, expectedRosterVersion: Int, key: IdempotencyKey
    ) async throws(APIFailure) -> RosterRevision {
        try lock.withLock {
            answer(
                "propose \(names.joined(separator: ",")) \(clubID) v\(expectedRosterVersion) \(key)",
                &proposeAnswers)
        }.get()
    }

    func createInvitation(for candidateID: String, in clubID: String, key: IdempotencyKey)
        async throws(APIFailure) -> InvitationLink
    {
        await duringLink()
        return try lock.withLock {
            answer("createInvitation \(candidateID) \(clubID) \(key)", &linkAnswers)
        }.get()
    }

    func revokeInvitation(_ invitationID: String) async throws(APIFailure) {
        try lock.withLock { answer("revokeInvitation \(invitationID)", &revokeAnswers) }.get()
    }

    func rosterRevision(_ revisionID: String) async throws(APIFailure) -> RosterRevision {
        lock.withLock { calls.append("revision \(revisionID)") }
        throw .refused
    }

    func approve(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
        async throws(APIFailure) -> RosterRevision
    {
        lock.withLock { calls.append("approve") }
        throw .refused
    }

    func decline(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
        async throws(APIFailure) -> RosterRevision
    {
        lock.withLock { calls.append("decline") }
        throw .refused
    }

    func preview(_ token: InvitationToken) async throws(APIFailure) -> InvitationPreview {
        lock.withLock { calls.append("preview") }
        throw .refused
    }

    func accept(
        _ token: InvitationToken, revisionID: String, expectedVersion: Int, key: IdempotencyKey
    ) async throws(APIFailure) -> InvitationAcceptance {
        lock.withLock { calls.append("accept") }
        throw .refused
    }
}

/// Whether the session a model was made in goes on, for its `current`: a test ends it from inside
/// a call, to see what an answer that lands after Leave sign-in does.
@MainActor final class SessionFlag {
    var current = true
    /// The calls that have reached the hook that ends it.
    var calls = 0
}

/// A vault whose saves, loads and deletes can be made to fail, counting each.
final class FailingVault: InvitationLinkVault, @unchecked Sendable {
    private let lock = NSLock()
    private var file: InvitationLinkFile?
    var failSaves = false
    var failLoads = false
    var failDeletes = false
    private(set) var saves = 0
    private(set) var deletes = 0

    init(_ file: InvitationLinkFile? = nil) {
        self.file = file
    }

    var kept: InvitationLinkFile? { lock.withLock { file } }

    func load() throws -> InvitationLinkFile? {
        try lock.withLock {
            if failLoads { throw VaultFailure() }
            return file
        }
    }

    func save(_ file: InvitationLinkFile) throws {
        try lock.withLock {
            saves += 1
            if failSaves { throw VaultFailure() }
            self.file = file
        }
    }

    func delete() throws {
        try lock.withLock {
            deletes += 1
            if failDeletes { throw VaultFailure() }
            file = nil
        }
    }

    struct VaultFailure: Error {}
}

/// Sunday people before it starts: Ben made it, and proposes Maya, Alex, Sam, Debby and Nina
/// (`G01-invite-people`, handoffs 1, 4 and 8).
enum Sunday {
    // Thursday 5 November 2026, 3:00 AM UTC.
    static let now = Date(timeIntervalSince1970: 1_793_847_600)
    static let clock = ServerClock(serverNow: now, receivedAt: .now)
    static let ref = ClubRef(
        id: "club_sunday", name: "Sunday people", timezone: "America/New_York",
        myMembershipID: "mem_ben")
    static let ben = Person(membershipID: "mem_ben", displayName: "Ben", avatarVersion: nil)
    static let leila = Person(membershipID: "mem_leila", displayName: "Leila", avatarVersion: nil)
    static let account = "acct_ben"
    static let summary = ClubSummary(
        ref: ref, state: .proposed, memberCount: 1, openDay: nil, nextDay: nil)

    static func detail(version: Int = 0, canPropose: Bool = true, revision: String? = "rev_1")
        -> ClubDetail
    {
        ClubDetail(
            serverClock: clock, club: summary, rosterVersion: version, canPropose: canPropose,
            openRevisionID: revision)
    }

    /// A token of the contract's shape, made up for the tests: 43 base64url characters.
    static func url(_ n: Int) -> URL {
        URL(string: "https://tadayo.app/i#" + String(format: "tok%040d", n))!
    }

    static func link(_ invitation: String, for candidate: String, url: URL?) -> InvitationLink {
        InvitationLink(
            invitationID: invitation, candidateID: candidate, url: url,
            expiresAt: now.addingTimeInterval(7 * 86_400))
    }

    static func candidate(
        _ id: String, _ name: String, _ state: CandidateLinkState?, invitation: String? = nil,
        by proposer: Person = ben
    ) -> Candidate {
        Candidate(
            id: id, name: name, proposedBy: proposer,
            invitation: state.map {
                CandidateInvitation(
                    id: invitation ?? "inv_" + id.replacingOccurrences(of: "cand_", with: ""),
                    state: $0,
                    expiresAt: now.addingTimeInterval(7 * 86_400))
            })
    }

    static func revision(
        _ candidates: [Candidate], id: String = "rev_1", decision: RosterDecision = .approved
    ) -> RosterRevision {
        RosterRevision(
            id: id, version: 1, club: ref, state: .open, proposedBy: ben, members: [ben],
            candidates: candidates, myDecision: decision, supersededBy: nil)
    }

    static func members(_ candidates: [Candidate]?, decision: RosterDecision = .approved)
        -> MemberList
    {
        MemberList(
            serverClock: clock, club: ref,
            members: [Member(person: ben, position: 1, cover: nil, nextDay: nil, nextUp: false)],
            openRevision: candidates.map { revision($0, decision: decision) })
    }
}
