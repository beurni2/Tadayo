import Foundation
import Testing

@testable import TadayoCore

/// A `ClubService` whose club details, roster revisions, members and club weeks come from a
/// script, recording every call in order. The calls B1's root and Club details don't make fail,
/// so a test notices if one is made.
final class FakeClubs: ClubService, @unchecked Sendable {
    private let lock = NSLock()
    private var clubAnswers: [Result<ClubDetail, APIFailure>]
    private var revisionAnswers: [Result<RosterRevision, APIFailure>]
    private var memberAnswers: [Result<MemberList, APIFailure>]
    private var scheduleAnswers: [Result<ClubWeek, APIFailure>]
    private var createAnswers: [Result<ClubDetail, APIFailure>]
    private(set) var calls: [String] = []
    private var clubReads = 0
    private var memberReads = 0
    /// Run inside each read of a club's details or its members, given which read it is (1 for
    /// the first), or of a roster revision or the club's week, before it answers: a slow
    /// network, say.
    var duringClub: @Sendable (Int) async -> Void = { _ in }
    var duringRevision: @Sendable () async -> Void = {}
    var duringMembers: @Sendable (Int) async -> Void = { _ in }
    var duringSchedule: @Sendable () async -> Void = {}
    /// Run inside each club made, before it answers.
    var duringCreate: @Sendable () async -> Void = {}

    /// `create` answers each club made, in order; with none left, a club made is refused.
    init(
        club: [Result<ClubDetail, APIFailure>] = [],
        revision: [Result<RosterRevision, APIFailure>] = [],
        members: [Result<MemberList, APIFailure>] = [],
        schedule: [Result<ClubWeek, APIFailure>] = [],
        create: [Result<ClubDetail, APIFailure>] = []
    ) {
        clubAnswers = club
        revisionAnswers = revision
        memberAnswers = members
        scheduleAnswers = schedule
        createAnswers = create
    }

    private func next<T>(_ answers: inout [Result<T, APIFailure>]) -> Result<T, APIFailure> {
        answers.isEmpty ? .failure(.network) : answers.removeFirst()
    }

    private func record(_ call: String) {
        lock.withLock { calls.append(call) }
    }

    func club(_ clubID: String) async throws(APIFailure) -> ClubDetail {
        let read = lock.withLock {
            clubReads += 1
            return clubReads
        }
        await duringClub(read)
        return try lock.withLock {
            calls.append("club \(clubID)")
            return next(&clubAnswers)
        }.get()
    }

    func rosterRevision(_ revisionID: String) async throws(APIFailure) -> RosterRevision {
        await duringRevision()
        return try lock.withLock {
            calls.append("revision \(revisionID)")
            return next(&revisionAnswers)
        }.get()
    }

    func createClub(name: String, timezone: TimeZone, key: IdempotencyKey)
        async throws(APIFailure) -> ClubDetail
    {
        await duringCreate()
        return try lock.withLock {
            calls.append("createClub \(name)")
            return createAnswers.isEmpty ? .failure(.refused) : createAnswers.removeFirst()
        }.get()
    }

    func members(of clubID: String) async throws(APIFailure) -> MemberList {
        let read = lock.withLock {
            memberReads += 1
            return memberReads
        }
        await duringMembers(read)
        return try lock.withLock {
            calls.append("members \(clubID)")
            return next(&memberAnswers)
        }.get()
    }

    func schedule(of clubID: String) async throws(APIFailure) -> ClubWeek {
        await duringSchedule()
        return try lock.withLock {
            calls.append("schedule \(clubID)")
            return next(&scheduleAnswers)
        }.get()
    }

    func propose(
        _ names: [String], in clubID: String, expectedRosterVersion: Int, key: IdempotencyKey
    ) async throws(APIFailure) -> RosterRevision {
        record("propose")
        throw .refused
    }

    func createInvitation(for candidateID: String, in clubID: String, key: IdempotencyKey)
        async throws(APIFailure) -> InvitationLink
    {
        record("createInvitation")
        throw .refused
    }

    func revokeInvitation(_ invitationID: String) async throws(APIFailure) {
        record("revokeInvitation")
        throw .refused
    }

    func approve(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
        async throws(APIFailure) -> RosterRevision
    {
        record("approve")
        throw .refused
    }

    func decline(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
        async throws(APIFailure) -> RosterRevision
    {
        record("decline")
        throw .refused
    }

    func preview(_ token: InvitationToken) async throws(APIFailure) -> InvitationPreview {
        record("preview")
        throw .refused
    }

    func accept(
        _ token: InvitationToken, revisionID: String, expectedVersion: Int, key: IdempotencyKey
    ) async throws(APIFailure) -> InvitationAcceptance {
        record("accept")
        throw .refused
    }
}

/// The club list's clubs, the one selected and kept, and Home for it
/// (`docs/plans/ios-b1-clubs-root.md` section 2).
@MainActor @Suite struct RootModelClubsTests {
    // Thursday 5 November 2026, 3:00 AM UTC, as the device's clock reads it.
    let start = Date(timeIntervalSince1970: 1_793_847_600)
    var stored: AuthSession {
        AuthSession(
            accessToken: "access-1", refreshToken: "refresh-1",
            expiresAt: start.addingTimeInterval(3600))
    }
    let ben = account(name: "Ben", age: true, version: 3)

    func summary(_ id: String, _ name: String, _ state: ClubState) -> ClubSummary {
        ClubSummary(
            ref: ClubRef(
                id: id, name: name, timezone: "America/New_York", myMembershipID: "mem_\(id)_ben"),
            state: state, memberCount: state == .proposed ? 1 : 5, openDay: nil, nextDay: nil)
    }

    var sunday: ClubSummary { summary("club_sunday", "Sunday people", .proposed) }
    var kitchen: ClubSummary { summary("club_kitchen", "Kitchen table", .active) }

    func list(_ clubs: ClubSummary...) -> ClubList {
        ClubList(
            serverClock: ServerClock(serverNow: start, receivedAt: .now), clubs: clubs,
            invitations: [])
    }

    func detail(_ club: ClubSummary, openRevision: String?) -> ClubDetail {
        ClubDetail(
            serverClock: ServerClock(serverNow: start, receivedAt: .now), club: club,
            rosterVersion: 1, canPropose: true, openRevisionID: openRevision)
    }

    func revision(
        _ id: String, of club: ClubSummary, decision: RosterDecision,
        state: RosterRevisionState = .open
    ) -> RosterRevision {
        let benPerson = Person(
            membershipID: club.ref.myMembershipID, displayName: "Ben", avatarVersion: nil)
        return RosterRevision(
            id: id, version: 2, club: club.ref, state: state, proposedBy: benPerson,
            members: [benPerson], candidates: [], myDecision: decision, supersededBy: nil)
    }

    func root(
        _ accounts: FakeAccounts, clubs: FakeClubs = FakeClubs(),
        selection: any ClubSelectionStore = InMemoryClubSelection(),
        auth: FakeAuth = FakeAuth(), store: (any SessionStore)? = nil,
        links: InvitationLinkBook = InvitationLinkBook(vault: InMemoryInvitationLinkVault()),
        left: @escaping @MainActor () -> Void = {}
    ) -> RootModel {
        let clock = ManualContinuousClock()
        let auth = auth
        return RootModel(
            session: SessionManager(
                auth: auth, store: store ?? InMemorySessionStore(stored), now: { [start] in start }),
            auth: auth, accounts: accounts, clubs: clubs, selection: selection, links: links,
            now: { clock.now }, sleep: { clock.sleep(until: $0) }, left: left)
    }

    // MARK: The list and the selected club

    @Test func aListWithAClubIsListedWithItsFirstClubSelected() async {
        let selection = InMemoryClubSelection()
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen, sunday))]),
            selection: selection)
        await root.start()
        guard case .listed(let listed) = root.clubs else {
            Issue.record("\(root.clubs)")
            return
        }
        #expect(listed.clubs == [kitchen, sunday])
        #expect(root.selectedClubID == "club_kitchen")
        #expect(root.selectedClub == kitchen)
        // Kept, so a relaunch opens it.
        #expect(selection.club(for: "acct_ben") == "club_kitchen")
    }

    @Test func theKeptClubIsSelectedWhileTheListHoldsIt() async {
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen, sunday))]),
            clubs: FakeClubs(club: [.success(detail(sunday, openRevision: nil))]),
            selection: InMemoryClubSelection(account: "acct_ben", club: "club_sunday"))
        await root.start()
        #expect(root.selectedClubID == "club_sunday")
    }

    @Test func aKeptClubTheListNoLongerHoldsGivesWayToTheFirst() async {
        let selection = InMemoryClubSelection(account: "acct_ben", club: "club_left")
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen, sunday))]),
            selection: selection)
        await root.start()
        #expect(root.selectedClubID == "club_kitchen")
        #expect(selection.club(for: "acct_ben") == "club_kitchen")
    }

    @Test func anotherAccountsChoiceIsNeverRead() async {
        // An account switch: what Debby kept says nothing of Ben's clubs (T11).
        let selection = InMemoryClubSelection(account: "acct_debby", club: "club_sunday")
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen, sunday))]),
            selection: selection)
        await root.start()
        #expect(root.selectedClubID == "club_kitchen")
        #expect(selection.club(for: "acct_debby") == nil)
        #expect(selection.club(for: "acct_ben") == "club_kitchen")
    }

    @Test func choosingAClubKeepsItAndReadsItsHome() async {
        let selection = InMemoryClubSelection()
        let clubs = FakeClubs(club: [.success(detail(sunday, openRevision: nil))])
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen, sunday))]),
            clubs: clubs, selection: selection)
        await root.start()
        #expect(root.home == .notInThisBuild)
        #expect(clubs.calls.isEmpty)
        await root.select("club_sunday")
        #expect(root.selectedClubID == "club_sunday")
        #expect(selection.club(for: "acct_ben") == "club_sunday")
        #expect(root.home == .awaiting(review: false))
        #expect(clubs.calls == ["club club_sunday"])
    }

    @Test func aClubTheListDoesntHoldOrTheSelectedOneChangesNothing() async {
        let clubs = FakeClubs()
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen, sunday))]),
            clubs: clubs)
        await root.start()
        await root.select("club_elsewhere")
        await root.select("club_kitchen")
        #expect(root.selectedClubID == "club_kitchen")
        #expect(clubs.calls.isEmpty)
    }

    @Test func anAnswerForAClubLeftBehindIsDropped() async {
        // Sunday people's details are slow; Kitchen table is chosen meanwhile. Sunday people's
        // answer, when it lands, mustn't become Kitchen table's Home.
        let clubs = FakeClubs(club: [.success(detail(sunday, openRevision: nil))])
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(sunday, kitchen))]),
            clubs: clubs)
        let gate = Gate()
        clubs.duringClub = { _ in await gate.wait() }
        let started = Task { await root.start() }
        await gate.reached()
        #expect(root.selectedClubID == "club_sunday")
        #expect(root.home == .loading)
        await root.select("club_kitchen")
        #expect(root.home == .notInThisBuild)
        gate.open()
        await started.value
        #expect(root.selectedClubID == "club_kitchen")
        #expect(root.home == .notInThisBuild)
    }

    // MARK: Home before the club starts

    @Test func aClubThatHasntStartedWithNoOpenRevisionWaits() async {
        let clubs = FakeClubs(club: [.success(detail(sunday, openRevision: nil))])
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(sunday))]), clubs: clubs)
        await root.start()
        #expect(root.home == .awaiting(review: false))
        #expect(clubs.calls == ["club club_sunday"])
    }

    @Test func theCreatorsOwnPendingDecisionAsksForAReview() async {
        // FQ84: a revision the server made for a changed name waits on the creator, whose
        // proposing counted as approving only the first one (FQ60).
        for (decision, review) in [
            (RosterDecision.pending, true), (.approved, false), (.declined, false),
        ] {
            let clubs = FakeClubs(
                club: [.success(detail(sunday, openRevision: "rev_2"))],
                revision: [.success(revision("rev_2", of: sunday, decision: decision))])
            let root = root(
                FakeAccounts(me: [.success(ben)], clubs: [.success(list(sunday))]), clubs: clubs)
            await root.start()
            #expect(root.home == .awaiting(review: review), "\(decision)")
            #expect(clubs.calls == ["club club_sunday", "revision rev_2"])
        }
    }

    @Test func aDecisionInARevisionNoLongerOpenAsksForNoReview() async {
        // Superseded, applied or not gone ahead between the two reads: nothing waits on Ben.
        for state in [RosterRevisionState.superseded, .applied, .didNotGoAhead] {
            let clubs = FakeClubs(
                club: [.success(detail(sunday, openRevision: "rev_2"))],
                revision: [
                    .success(revision("rev_2", of: sunday, decision: .pending, state: state))
                ])
            let root = root(
                FakeAccounts(me: [.success(ben)], clubs: [.success(list(sunday))]), clubs: clubs)
            await root.start()
            #expect(root.home == .awaiting(review: false), "\(state)")
        }
    }

    @Test func aClubChangedSinceTheListReadsTheListAgain() async {
        // Suspended since the list was read: its details answer not found (T9), and the list,
        // read again, gives H01-unavailable, with no further call.
        let suspended = summary("club_sunday", "Sunday people", .suspended)
        var accounts = FakeAccounts(
            me: [.success(ben)], clubs: [.success(list(sunday)), .success(list(suspended))])
        var clubs = FakeClubs(club: [.failure(.notFound)])
        var root = root(accounts, clubs: clubs)
        await root.start()
        #expect(root.selectedClub == suspended)
        #expect(root.home == .unavailable)
        #expect(accounts.calls == ["me", "clubs", "clubs"])
        #expect(clubs.calls == ["club club_sunday"])

        // Started since: its details say so, and the list read again decides.
        let started = summary("club_sunday", "Sunday people", .active)
        accounts = FakeAccounts(
            me: [.success(ben)], clubs: [.success(list(sunday)), .success(list(started))])
        clubs = FakeClubs(club: [.success(detail(started, openRevision: nil))])
        root = self.root(accounts, clubs: clubs)
        await root.start()
        #expect(root.home == .notInThisBuild)
        #expect(accounts.calls == ["me", "clubs", "clubs"])

        // Still listed as it was, and still not found: Home fails after one more read of the
        // list, not round and round; its Retry starts over, the list read again once more.
        accounts = FakeAccounts(
            me: [.success(ben)],
            clubs: [.success(list(sunday)), .success(list(sunday)), .success(list(sunday))])
        clubs = FakeClubs(
            club: [
                .failure(.notFound), .failure(.notFound), .failure(.notFound),
                .success(detail(sunday, openRevision: nil)),
            ])
        root = self.root(accounts, clubs: clubs)
        await root.start()
        #expect(root.home == .failed(.other))
        #expect(accounts.calls == ["me", "clubs", "clubs"])
        await root.loadHome()
        #expect(root.home == .awaiting(review: false))
        #expect(accounts.calls == ["me", "clubs", "clubs", "clubs"])
        #expect(clubs.calls == Array(repeating: "club club_sunday", count: 4))
    }

    @Test func aRevisionNotFoundReadsTheListAgainToo() async {
        // The club named an open revision, which then answers not found: suspended between the
        // two reads, say. The list read again decides, as for the details' not found.
        let suspended = summary("club_sunday", "Sunday people", .suspended)
        var accounts = FakeAccounts(
            me: [.success(ben)], clubs: [.success(list(sunday)), .success(list(suspended))])
        var clubs = FakeClubs(
            club: [.success(detail(sunday, openRevision: "rev_2"))],
            revision: [.failure(.notFound)])
        var root = root(accounts, clubs: clubs)
        await root.start()
        #expect(root.home == .unavailable)
        #expect(accounts.calls == ["me", "clubs", "clubs"])
        #expect(clubs.calls == ["club club_sunday", "revision rev_2"])

        // Still listed as it was: its details and its open revision, a newer one, are read again.
        accounts = FakeAccounts(
            me: [.success(ben)], clubs: [.success(list(sunday)), .success(list(sunday))])
        clubs = FakeClubs(
            club: [
                .success(detail(sunday, openRevision: "rev_2")),
                .success(detail(sunday, openRevision: "rev_3")),
            ],
            revision: [
                .failure(.notFound), .success(revision("rev_3", of: sunday, decision: .pending)),
            ])
        root = self.root(accounts, clubs: clubs)
        await root.start()
        #expect(root.home == .awaiting(review: true))
        #expect(accounts.calls == ["me", "clubs", "clubs"])
        #expect(
            clubs.calls == [
                "club club_sunday", "revision rev_2", "club club_sunday", "revision rev_3",
            ])
    }

    @Test func anotherClubChosenWhileTheListIsReadAgainReadsItOnceForItself() async {
        // Sunday people answers not found and the list is read again; while Sunday people's
        // details are read once more, Ben chooses Porch, which answers not found too, suspended
        // since. Porch's own read of the list decides, rather than Porch failing because Sunday
        // people's chain was reading the list again.
        let porch = summary("club_porch", "Porch", .proposed)
        let porchSuspended = summary("club_porch", "Porch", .suspended)
        let accounts = FakeAccounts(
            me: [.success(ben)],
            clubs: [
                .success(list(sunday, porch)), .success(list(sunday, porch)),
                .success(list(sunday, porchSuspended)),
            ])
        let clubs = FakeClubs(
            club: [
                .failure(.notFound), .failure(.notFound),
                .success(detail(sunday, openRevision: nil)),
            ])
        let gate = Gate()
        clubs.duringClub = { read in if read == 2 { await gate.wait() } }
        let root = root(accounts, clubs: clubs)
        let started = Task { await root.start() }
        await gate.reached()
        #expect(accounts.calls == ["me", "clubs", "clubs"])
        #expect(root.selectedClubID == "club_sunday")
        await root.select("club_porch")
        #expect(root.selectedClubID == "club_porch")
        #expect(root.home == .unavailable)
        #expect(accounts.calls == ["me", "clubs", "clubs", "clubs"])
        gate.open()
        await started.value
        #expect(root.selectedClubID == "club_porch")
        #expect(root.home == .unavailable)
        #expect(clubs.calls == ["club club_sunday", "club club_porch", "club club_sunday"])
    }

    @Test func homeLoadsUntilItsReadsAnswer() async {
        let clubs = FakeClubs(club: [.success(detail(sunday, openRevision: nil))])
        let gate = Gate()
        clubs.duringClub = { _ in await gate.wait() }
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(sunday))]), clubs: clubs)
        let started = Task { await root.start() }
        await gate.reached()
        #expect(root.selectedClubID == "club_sunday")
        #expect(root.home == .loading)
        gate.open()
        await started.value
        #expect(root.home == .awaiting(review: false))
    }

    @Test func aFailedReadIsHomesFailureUntilRetried() async {
        // A not found reads the list again first (`aClubChangedSinceTheListReadsTheListAgain`).
        for (failure, shown) in [
            (APIFailure.network, RootModel.Failure.network), (.refused, .other),
        ] {
            // The details, then the revision, each fail once.
            let clubs = FakeClubs(
                club: [
                    .failure(failure), .success(detail(sunday, openRevision: "rev_2")),
                    .success(detail(sunday, openRevision: "rev_2")),
                ],
                revision: [
                    .failure(failure), .success(revision("rev_2", of: sunday, decision: .pending)),
                ])
            let root = root(
                FakeAccounts(me: [.success(ben)], clubs: [.success(list(sunday))]), clubs: clubs)
            await root.start()
            #expect(root.home == .failed(shown))
            await root.loadHome()
            #expect(root.home == .failed(shown))
            await root.loadHome()
            #expect(root.home == .awaiting(review: true))
            #expect(
                clubs.calls == [
                    "club club_sunday", "club club_sunday", "revision rev_2", "club club_sunday",
                    "revision rev_2",
                ])
        }
    }

    @Test func homeLoadsWhileTheRevisionIsRead() async {
        let clubs = FakeClubs(
            club: [.success(detail(sunday, openRevision: "rev_2"))],
            revision: [.success(revision("rev_2", of: sunday, decision: .pending))])
        let gate = Gate()
        clubs.duringRevision = { await gate.wait() }
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(sunday))]), clubs: clubs)
        let started = Task { await root.start() }
        await gate.reached()
        #expect(clubs.calls == ["club club_sunday"])
        #expect(root.home == .loading)
        gate.open()
        await started.value
        #expect(root.home == .awaiting(review: true))
    }

    @Test func anAnswerThatLandsAfterLeaveSignInIsDropped() async {
        // Sunday people's details are slow, and Ben leaves meanwhile: their answer, when it
        // lands, mustn't bring the club back, keep it, or read anything more (spec 23, T11).
        let selection = InMemoryClubSelection()
        let accounts = FakeAccounts(me: [.success(ben)], clubs: [.success(list(sunday))])
        let clubs = FakeClubs(
            club: [.success(detail(sunday, openRevision: "rev_2"))],
            revision: [.success(revision("rev_2", of: sunday, decision: .pending))])
        let root = root(accounts, clubs: clubs, selection: selection)
        let gate = Gate()
        clubs.duringClub = { _ in await gate.wait() }
        let started = Task { await root.start() }
        await gate.reached()
        await root.leave()
        #expect(root.route == .signIn)
        gate.open()
        await started.value
        #expect(root.route == .signIn)
        #expect(root.clubs == .loading)
        #expect(root.selectedClubID == nil)
        #expect(root.home == .loading)
        #expect(selection.club(for: "acct_ben") == nil)
        #expect(clubs.calls == ["club club_sunday"])
        #expect(accounts.calls == ["me", "clubs"])
    }

    @Test func aSignedOutAnswerToTheRevisionEndsTheSession() async throws {
        let store = InMemorySessionStore(stored)
        let selection = InMemoryClubSelection()
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(sunday))]),
            clubs: FakeClubs(
                club: [.success(detail(sunday, openRevision: "rev_2"))],
                revision: [.failure(.signedOut)]),
            selection: selection, store: store)
        await root.start()
        #expect(root.route == .signIn)
        #expect(root.signIn?.signInEnded == true)
        #expect(try store.load() == nil)
        #expect(selection.club(for: "acct_ben") == nil)
    }

    @Test func aSignedOutAnswerEndsTheSession() async throws {
        let store = InMemorySessionStore(stored)
        let selection = InMemoryClubSelection()
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(sunday))]),
            clubs: FakeClubs(club: [.failure(.signedOut)]), selection: selection, store: store)
        await root.start()
        #expect(root.route == .signIn)
        #expect(root.signIn?.signInEnded == true)
        #expect(try store.load() == nil)
        #expect(selection.club(for: "acct_ben") == nil)
        #expect(root.selectedClubID == nil)
    }

    @Test func aSuspendedActiveOrPausedClubNeedsNoCall() async {
        for (state, home) in [
            (ClubState.suspended, RootModel.Home.unavailable), (.active, .notInThisBuild),
            (.paused, .notInThisBuild),
        ] {
            let club = summary("club_x", "Sunday people", state)
            let clubs = FakeClubs()
            let root = root(
                FakeAccounts(me: [.success(ben)], clubs: [.success(list(club, kitchen))]),
                clubs: clubs)
            await root.start()
            // A suspended club stays selected: nothing takes its place.
            #expect(root.selectedClubID == "club_x", "\(state)")
            #expect(root.home == home, "\(state)")
            #expect(clubs.calls.isEmpty, "\(state)")
        }
    }

    // MARK: Leaving

    @Test func leavingForgetsTheChoiceBeforeThePurge() async {
        let selection = InMemoryClubSelection()
        var keptAtPurge: [String?] = []
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen))]),
            selection: selection,
            left: { keptAtPurge.append(selection.club(for: "acct_ben")) })
        await root.start()
        #expect(selection.club(for: "acct_ben") == "club_kitchen")
        await root.leave()
        #expect(keptAtPurge == [nil])
        #expect(selection.club(for: "acct_ben") == nil)
        #expect(root.clubs == .loading)
        #expect(root.selectedClubID == nil)
        #expect(root.home == .loading)
    }

    @Test func aLeaveThatCantForgetTheSessionStillForgetsTheChoice() async {
        let selection = InMemoryClubSelection()
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen))]),
            selection: selection, store: StubbornStore(stored, failures: 2))
        await root.start()
        await root.leave()
        #expect(root.route == .leaveFailed)
        #expect(selection.club(for: "acct_ben") == nil)
        #expect(root.selectedClubID == nil)
    }

    // MARK: The kept invitation links (ADR-037)

    /// A book holding one link for Sam in `club_sunday` and one for Leila in `club_left`, kept
    /// before any read.
    func keptLinks() -> InvitationLinkBook {
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: "club_sunday",
            account: "acct_ben")
        book.keep(
            Sunday.link("inv_leila", for: "cand_leila", url: Sunday.url(2)), club: "club_left",
            account: "acct_ben")
        return book
    }

    @Test func aLaunchWithNoSessionForgetsWhatTheLastAccountKept() async throws {
        // A session can end out of the app's sight: a refresh that found it ended deletes it,
        // and the app can be stopped before the root ends the account, leaving the account's
        // choice and kept links on the device. A launch with no session forgets them before
        // sign-in shows, so they never wait there for the next account (T11, ADR-037). The links
        // were kept by an earlier launch: this launch's book finds them in the vault.
        let selection = InMemoryClubSelection()
        selection.keep("club_sunday", for: "acct_ben")
        let vault = InMemoryInvitationLinkVault()
        let earlier = InvitationLinkBook(vault: vault)
        earlier.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: "club_sunday",
            account: "acct_ben")
        earlier.keepReceived(Kitchen.token(1), invitation: "inv_leila", account: "acct_ben")
        #expect(try vault.load() != nil)
        let book = InvitationLinkBook(vault: vault)
        let accounts = FakeAccounts()
        let root = root(
            accounts, selection: selection, store: InMemorySessionStore(), links: book)
        await root.start()
        #expect(root.route == .signIn)
        #expect(selection.club(for: "acct_ben") == nil)
        #expect(try vault.load() == nil)
        #expect(book.link(for: "cand_sam", club: "club_sunday", account: "acct_ben") == nil)
        #expect(book.received(Kitchen.token(1), account: "acct_ben") == nil)
        #expect(accounts.calls.isEmpty)
    }

    @Test func aLaunchWhoseKeychainCantBeReadIsAFailureThatKeepsEverything() async throws {
        // The keychain refused the read for a moment: neither sign-in nor a purge, but the
        // account's failure with Retry, "Couldn’t load your account." over "Try again." (FQ89),
        // and the session, the choice and the links all kept for the read that works.
        let selection = InMemoryClubSelection()
        selection.keep("club_sunday", for: "acct_ben")
        let book = keptLinks()
        let store = StubbornStore(stored, loadFailures: 1)
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen, sunday))]),
            clubs: FakeClubs(club: [.success(detail(sunday, openRevision: nil))]),
            selection: selection, store: store, links: book)
        await root.start()
        #expect(root.route == .failed(.other))
        #expect(root.signIn == nil)
        #expect(try store.load() == stored)
        #expect(selection.club(for: "acct_ben") == "club_sunday")
        #expect(book.link(for: "cand_sam", club: "club_sunday", account: "acct_ben") != nil)
        await root.retry()
        #expect(root.route == .tabs)
        #expect(root.selectedClubID == "club_sunday")
        #expect(book.link(for: "cand_sam", club: "club_sunday", account: "acct_ben") != nil)
    }

    @Test func eachListReadPurgesTheLinksOfAClubItNoLongerHolds() async {
        let book = keptLinks()
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen, sunday))]),
            clubs: FakeClubs(club: [.success(detail(sunday, openRevision: nil))]), links: book)
        await root.start()
        #expect(book.link(for: "cand_sam", club: "club_sunday", account: "acct_ben") != nil)
        #expect(book.link(for: "cand_leila", club: "club_left", account: "acct_ben") == nil)
    }

    @Test func aListWithNoClubPurgesEveryLink() async {
        let book = keptLinks()
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list())]), links: book)
        await root.start()
        #expect(root.clubs == .noClub)
        #expect(book.link(for: "cand_sam", club: "club_sunday", account: "acct_ben") == nil)
        #expect(book.link(for: "cand_leila", club: "club_left", account: "acct_ben") == nil)
    }

    @Test func aFailedListReadKeepsEveryLink() async {
        for failure in [APIFailure.network, .refused, .unavailable] {
            let book = keptLinks()
            let root = root(
                FakeAccounts(me: [.success(ben)], clubs: [.failure(failure)]), links: book)
            await root.start()
            #expect(book.link(for: "cand_sam", club: "club_sunday", account: "acct_ben") != nil)
            #expect(book.link(for: "cand_leila", club: "club_left", account: "acct_ben") != nil)
        }
    }

    @Test func aLinkKeptWhileTheListIsReadIsLeftByItsAnswer() async {
        // The list was asked for before the club and its link existed: its answer can't hold
        // them yet, so it purges nothing kept after it was asked.
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let accounts = FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen))])
        let gate = Gate()
        accounts.duringClubs = { await gate.wait() }
        let root = root(accounts, links: book)
        let started = Task { await root.start() }
        await gate.reached()
        book.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: "club_sunday",
            account: "acct_ben")
        gate.open()
        await started.value
        #expect(book.link(for: "cand_sam", club: "club_sunday", account: "acct_ben") != nil)
    }

    @Test func leaveSignInForgetsTheKeptLinks() async throws {
        // ADR-037, T11: Leave sign-in is both logout and the way to another account; the root
        // forgets the book itself, whatever its `left` does.
        let vault = InMemoryInvitationLinkVault()
        let book = InvitationLinkBook(vault: vault)
        book.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: "club_sunday",
            account: "acct_ben")
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen, sunday))]),
            clubs: FakeClubs(club: [.success(detail(sunday, openRevision: nil))]), links: book)
        await root.start()
        #expect(book.link(for: "cand_sam", club: "club_sunday", account: "acct_ben") != nil)
        await root.leave()
        #expect(book.link(for: "cand_sam", club: "club_sunday", account: "acct_ben") == nil)
        #expect(try vault.load() == nil)
    }

    @Test func aListAnswerAfterLeaveSignInChangesNothing() async {
        // The list was asked for in the session Leave sign-in ended. Its answer, coming after,
        // neither lists nor selects that account's clubs, and a link kept afterwards, as the next
        // sign-in would, isn't purged by it, though it doesn't hold that club.
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let accounts = FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen))])
        let gate = Gate()
        accounts.duringClubs = { await gate.wait() }
        let root = root(accounts, links: book)
        let started = Task { await root.start() }
        await gate.reached()
        await root.leave()
        book.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: "club_sunday",
            account: "acct_ben")
        gate.open()
        await started.value
        #expect(root.route == .signIn)
        #expect(root.clubs == .loading)
        #expect(root.selectedClubID == nil)
        #expect(book.link(for: "cand_sam", club: "club_sunday", account: "acct_ben") != nil)
    }

    // MARK: Creating a club

    @Test func aClubMadeIsSelectedAndKeptAndTheListIsReadAgain() async {
        let selection = InMemoryClubSelection()
        let made = ClubDetail(
            serverClock: ServerClock(serverNow: start, receivedAt: .now), club: sunday,
            rosterVersion: 0, canPropose: true, openRevisionID: nil)
        let clubs = FakeClubs(
            club: [.success(detail(sunday, openRevision: nil))], create: [.success(made)])
        let accounts = FakeAccounts(
            me: [.success(ben)],
            clubs: [.success(list(kitchen)), .success(list(kitchen, sunday))])
        let root = root(accounts, clubs: clubs, selection: selection)
        await root.start()
        #expect(root.selectedClubID == "club_kitchen")
        let create = root.createClub()
        create?.name = "  Sunday people "
        await create?.create()
        #expect(create?.club == made)
        #expect(clubs.calls == ["createClub Sunday people", "club club_sunday"])
        #expect(accounts.calls == ["me", "clubs", "clubs"])
        #expect(root.selectedClubID == "club_sunday")
        #expect(selection.club(for: "acct_ben") == "club_sunday")
        #expect(root.home == .awaiting(review: false))
    }

    @Test func aClubMadeAfterLeaveSignInChangesNothing() async {
        let selection = InMemoryClubSelection()
        let made = ClubDetail(
            serverClock: ServerClock(serverNow: start, receivedAt: .now), club: sunday,
            rosterVersion: 0, canPropose: true, openRevisionID: nil)
        let clubs = FakeClubs(create: [.success(made)])
        let gate = Gate()
        clubs.duringCreate = { await gate.wait() }
        let accounts = FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen))])
        let root = root(accounts, clubs: clubs, selection: selection)
        await root.start()
        let create = root.createClub()
        create?.name = "Sunday people"
        let creating = Task { await create?.create() }
        await gate.reached()
        await root.leave()
        gate.open()
        await creating.value
        #expect(create?.club == nil)
        #expect(create?.failure == nil)
        #expect(accounts.calls == ["me", "clubs"])
        #expect(selection.club(for: "acct_ben") == nil)
        #expect(root.route == .signIn)
    }

    @Test func noClubIsMadeOrListedOutsideTheTabs() async {
        let root = root(FakeAccounts(me: [.success(account(name: nil, age: true))]))
        #expect(root.createClub() == nil)
        #expect(root.invitations(for: sunday.ref) == nil)
        await root.start()
        #expect(root.route == .profile)
        #expect(root.createClub() == nil)
        #expect(root.invitations(for: sunday.ref) == nil)
    }

    @Test func aSetupListsClubNoLongerTheCallersReadsTheListAgain() async {
        let clubs = FakeClubs(
            club: [.failure(.notFound)], members: [.failure(.notFound)])
        let accounts = FakeAccounts(
            me: [.success(ben)], clubs: [.success(list(kitchen)), .success(list(kitchen))])
        let root = root(accounts, clubs: clubs)
        await root.start()
        let invitations = root.invitations(for: sunday.ref)
        await invitations?.load()
        #expect(invitations?.closed == true)
        #expect(accounts.calls == ["me", "clubs", "clubs"])
    }

    @Test func aSetupListsAnswerAfterLeaveSignInIsDropped() async {
        let clubs = FakeClubs(
            club: [.success(detail(sunday, openRevision: "rev_1"))],
            members: [.success(Sunday.members([Sunday.candidate("cand_sam", "Sam", nil)]))])
        let gate = Gate()
        clubs.duringMembers = { _ in await gate.wait() }
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen))]),
            clubs: clubs)
        await root.start()
        let invitations = root.invitations(for: sunday.ref)
        let loading = Task { await invitations?.load() }
        await gate.reached()
        await root.leave()
        gate.open()
        await loading.value
        #expect(invitations?.state == .loading)
    }

    // MARK: The proposed roster

    @Test func aProposedRosterIsKeptForItsClubInTheSession() async {
        let root = root(FakeAccounts(me: [.success(ben)], clubs: [.success(list(kitchen))]))
        #expect(root.proposedRoster(of: sunday.ref) == nil)
        await root.start()
        let first = root.proposedRoster(of: sunday.ref)
        #expect(first?.club == sunday.ref)
        // Review members again: the same roster, so a decision on it keeps its keys (T19).
        #expect(root.proposedRoster(of: sunday.ref) === first)
        let other = root.proposedRoster(of: kitchen.ref)
        #expect(other !== first && other?.club == kitchen.ref)
        await root.leave()
        #expect(root.proposedRoster(of: sunday.ref) == nil)
    }

    @Test func aProposedRosterNoLongerAProposalReadsTheListAgainAndIsNotKept() async {
        let clubs = FakeClubs(club: [.failure(.notFound)], members: [.failure(.notFound)])
        let accounts = FakeAccounts(
            me: [.success(ben)], clubs: [.success(list(kitchen)), .success(list(kitchen))])
        let root = root(accounts, clubs: clubs)
        await root.start()
        let roster = root.proposedRoster(of: sunday.ref)
        await roster?.load()
        #expect(roster?.closed == true)
        #expect(accounts.calls == ["me", "clubs", "clubs"])
        let again = root.proposedRoster(of: sunday.ref)
        #expect(again != nil && again !== roster)
    }

    // MARK: The switcher's lines

    @Test func eachClubsLineInTheSwitcher() throws {
        let maya = Person(membershipID: "mem_maya", displayName: "Maya", avatarVersion: nil)
        let debby = Person(membershipID: "mem_debby", displayName: "Debby", avatarVersion: nil)
        let friday = try #require(LocalDate(year: 2026, month: 11, day: 6))
        let monday = try #require(LocalDate(year: 2026, month: 11, day: 9))
        func day(_ star: Person, _ date: LocalDate, _ phase: OccurrencePhase) -> Occurrence {
            Occurrence(
                id: "occ_\(star.displayName)", clubID: "club_x", star: star, localDate: date,
                revealAt: start, closeAt: start, phase: phase)
        }
        func club(_ state: ClubState, open: Occurrence? = nil, next: Occurrence? = nil)
            -> ClubSummary
        {
            ClubSummary(
                ref: ClubRef(
                    id: "club_x", name: "Sunday people", timezone: "America/New_York",
                    myMembershipID: "mem_ben"),
                state: state, memberCount: 6, openDay: open, nextDay: next)
        }
        #expect(club(.proposed).switcherLine == .notStarted)
        #expect(club(.paused).switcherLine == .paused)
        // Nothing of a suspended club but its state, whatever the list held (T9).
        #expect(club(.suspended, next: day(maya, monday, .collecting)).switcherLine == .unavailable)
        #expect(
            club(.active, open: day(debby, friday, .open), next: day(maya, monday, .collecting))
                .switcherLine == .open(people: 6, star: "Debby", date: friday))
        #expect(
            club(.active, next: day(maya, monday, .collecting)).switcherLine
                == .next(people: 6, star: "Maya"))
        #expect(club(.active).switcherLine == .people(6))
    }

    @Test func theDefaultsStoreKeepsTwoIdsAndReadsNothingElse() throws {
        let name = "ClubSelectionTests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let store = DefaultsClubSelection(defaults: defaults)
        #expect(store.club(for: "acct_ben") == nil)
        store.keep("club_sunday", for: "acct_ben")
        #expect(store.club(for: "acct_ben") == "club_sunday")
        #expect(store.club(for: "acct_debby") == nil)
        #expect(
            defaults.dictionary(forKey: DefaultsClubSelection.key) as? [String: String]
                == ["account": "acct_ben", "club": "club_sunday"])
        store.keep("club_kitchen", for: "acct_debby")
        #expect(store.club(for: "acct_ben") == nil)
        store.forget()
        #expect(store.club(for: "acct_debby") == nil)
        #expect(defaults.object(forKey: DefaultsClubSelection.key) == nil)
        // Something of another shape there reads as nothing kept.
        defaults.set(
            ["account": "acct_ben", "club": "club_sunday", "name": "Sunday people"],
            forKey: DefaultsClubSelection.key)
        #expect(store.club(for: "acct_ben") == nil)
        defaults.set("club_sunday", forKey: DefaultsClubSelection.key)
        #expect(store.club(for: "acct_ben") == nil)
    }
}
