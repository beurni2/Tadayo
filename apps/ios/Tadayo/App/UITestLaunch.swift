#if DEBUG
    import Foundation
    import TadayoCore

    /// How the UI tests launch the app (`TadayoUITests`), in Debug builds only, which run in the
    /// simulator and on CI and whose Supabase URL never resolves (`project.yml`).
    enum UITestLaunch {
        /// The real services with no session kept: the app opens on A02-email.
        static let noSession = "-TadayoUITestNoSession"
        /// Stand-in services that answer at once, so a test can walk sign-in to its end with no
        /// network at all: any address takes a code, 123456 is the right one, and the account
        /// is new until it gives its age and its name.
        static let fakes = "-TadayoUITestFakes"
        /// The same, except that sending a code never answers, so a test can look at A02-email
        /// while its request is on its way: the address read-only with the keyboard still up,
        /// and Send a code saying "In progress". A test seam, not product.
        static let hangingSend = "-TadayoUITestHangingSend"
        /// The stand-in services, except that the first name saved on A03 gets no answer and
        /// every later one never answers, so a test can look at A03's failure with the keyboard
        /// up, and then at the name read-only while it is saved. A test seam, not product.
        static let nameFailsThenHangs = "-TadayoUITestNameFailsThenHangs"
        /// The stand-in services with an account already named, in two active clubs (`TwoClubs`):
        /// signing in goes straight to the tabs, so a test can open Club details and the
        /// members list from the switcher. A test seam, not product.
        static let clubs = "-TadayoUITestClubs"
        /// The stand-in services with an account already named and in no club, where Create a club
        /// makes one in memory (`NewClub`): a test can walk naming the club, its setup list, the
        /// name step and the waiting screen. A test seam, not product.
        static let create = "-TadayoUITestCreate"
        /// The stand-in services with an account already named and in no club, where I have an
        /// invite checks a pasted link (`Invited`): Debby's link to Sunday people shows its
        /// roster, which Accept this roster leaves waiting on the members, and the club list then
        /// lists; Maya's link to Kitchen table shows its roster, which Accept this roster joins;
        /// and any other link is one the server doesn't know. A test seam, not product.
        static let invite = "-TadayoUITestInvite"
        /// The same, except that the club list already lists Kitchen table's invitation from
        /// Maya as accepted with its roster changed, and this phone holds no link for it: Home's
        /// row asks for the link (FQ136), and Maya's link then shows the changed roster, which
        /// Accept this roster joins. A test seam, not product.
        static let inviteChanged = "-TadayoUITestInviteChanged"
        /// Debby's link `Invited` knows: made up, no server made it.
        static let invitedLink = "https://tadayo.app/i#" + String(repeating: "D", count: 43)
        /// Maya's link `Invited` knows, whose Accept joins: made up, no server made it.
        static let joiningLink = "https://tadayo.app/i#" + String(repeating: "J", count: 43)
        static let rightCode = "123456"

        @MainActor static func fakeGraph(
            hangingSend: Bool = false, nameFailsThenHangs: Bool = false, inClubs: Bool = false,
            creating: Bool = false, invited: Bool = false, changedListed: Bool = false
        ) -> AppGraph {
            Probe.note = { ProbeTrace.shared.note($0) }
            let auth = FakeAuth(hangsOnSend: hangingSend)
            let made = creating ? NewClub() : nil
            let invitations = invited || changedListed ? Invited(changedListed: changedListed) : nil
            let accounts = FakeAccounts(
                nameFailsThenHangs: nameFailsThenHangs, clubs: inClubs ? TwoClubs.listed : [],
                thenClubs: inClubs ? TwoClubs.relisted : nil,
                named: creating || invitations != nil, made: made, joined: invitations)
            let session = SessionManager(auth: auth, store: InMemorySessionStore())
            let clubs: any ClubService
            if inClubs {
                clubs = TwoClubs()
            } else if let made {
                clubs = made
            } else if let invitations {
                clubs = invitations
            } else {
                clubs = NoClubs()
            }
            let root = RootModel(
                session: session, auth: auth, accounts: accounts, clubs: clubs,
                selection: InMemoryClubSelection())
            return AppGraph(root: root, connections: Connections())
        }

        struct FakeAuth: AuthService {
            var hangsOnSend = false

            func sendCode(to email: String) async throws(AuthFailure) {
                if hangsOnSend { try? await Task.sleep(for: .seconds(3600)) }
            }

            func verify(email: String, code: String) async throws(AuthFailure) -> AuthSession {
                guard code == UITestLaunch.rightCode else { throw .codeNotVerified }
                return AuthSession(
                    accessToken: "ui-test", refreshToken: "ui-test", expiresAt: .distantFuture)
            }

            func refresh(_ session: AuthSession) async throws(AuthFailure) -> AuthSession {
                session
            }

            func signOut(_ session: AuthSession) async throws(AuthFailure) {}
        }

        final class FakeAccounts: AccountService, @unchecked Sendable {
            private let lock = NSLock()
            private let nameFailsThenHangs: Bool
            private let listed: [ClubSummary]
            private let relisted: [ClubSummary]?
            private let made: NewClub?
            private let joined: Invited?
            private var listReads = 0
            private var namesTried = 0
            private var account: Account

            /// A new account with no club, or, given `clubs` or `named`, Ben's, named and in them,
            /// the list read again giving `thenClubs` when there are some, and listing the club
            /// `made` holds once it's made, and any club `joined` has joined.
            init(
                nameFailsThenHangs: Bool = false, clubs: [ClubSummary] = [],
                thenClubs: [ClubSummary]? = nil, named: Bool = false, made: NewClub? = nil,
                joined: Invited? = nil
            ) {
                self.nameFailsThenHangs = nameFailsThenHangs
                listed = clubs
                relisted = thenClubs
                self.made = made
                self.joined = joined
                account =
                    clubs.isEmpty && !named
                    ? Account(
                        id: "ui-test", displayName: nil, avatarVersion: nil, ageConfirmed: false,
                        version: 0)
                    : Account(
                        id: "ui-test", displayName: "Ben", avatarVersion: nil, ageConfirmed: true,
                        version: 2)
            }

            func me() async throws(APIFailure) -> Account {
                lock.withLock { account }
            }

            func update(_ change: AccountChange, key: IdempotencyKey) async throws(APIFailure)
                -> Account
            {
                if nameFailsThenHangs, case .name = change {
                    let tried = lock.withLock {
                        namesTried += 1
                        return namesTried
                    }
                    if tried == 1 { throw .network }
                    try? await Task.sleep(for: .seconds(3600))
                }
                return lock.withLock {
                    switch change {
                    case .confirmAge:
                        account = Account(
                            id: account.id, displayName: account.displayName,
                            avatarVersion: nil, ageConfirmed: true, version: account.version + 1)
                    case .name(let name, _):
                        account = Account(
                            id: account.id, displayName: name, avatarVersion: nil,
                            ageConfirmed: account.ageConfirmed, version: account.version + 1)
                    }
                    return account
                }
            }

            func clubs() async throws(APIFailure) -> ClubList {
                let clubs = lock.withLock {
                    listReads += 1
                    return listReads > 1 ? relisted ?? listed : listed
                }
                return ClubList(
                    serverClock: ServerClock(serverNow: Date(), receivedAt: .now),
                    clubs: clubs + (made?.listed ?? []) + (joined?.listed ?? []),
                    invitations: joined?.invitations ?? [])
            }
        }

        /// One club Ben makes, held in memory as the club calls answer it: made with the name
        /// given, then each person proposed joins its open revision, with a link made for them
        /// on asking, which a revoke revokes. Its links are made up for the tests: no server ever
        /// made them. Every other call is `NoClubs`'.
        final class NewClub: ClubService, @unchecked Sendable {
            private let lock = NSLock()
            private var club: ClubRef?
            private var candidates: [Candidate] = []
            private let none = NoClubs()
            private static let ben = Person(
                membershipID: "mem_ben", displayName: "Ben", avatarVersion: nil)

            private var clock: ServerClock { ServerClock(serverNow: Date(), receivedAt: .now) }

            /// The club once it's made, as the club list holds it.
            var listed: [ClubSummary] {
                lock.withLock { club.map { [summary($0)] } ?? [] }
            }

            private func summary(_ club: ClubRef) -> ClubSummary {
                ClubSummary(ref: club, state: .proposed, memberCount: 1, openDay: nil, nextDay: nil)
            }

            private func detail(_ club: ClubRef) -> ClubDetail {
                ClubDetail(
                    serverClock: clock, club: summary(club), rosterVersion: candidates.count,
                    canPropose: candidates.count < 5,
                    openRevisionID: candidates.isEmpty ? nil : "rev_new")
            }

            private func revision(_ club: ClubRef) -> RosterRevision {
                RosterRevision(
                    id: "rev_new", version: candidates.count, club: club, state: .open,
                    proposedBy: Self.ben, members: [Self.ben], candidates: candidates,
                    myDecision: .approved, supersededBy: nil)
            }

            /// The club made, if it's the one asked for. Callers read it under the lock and throw
            /// outside it, as `NSLock.withLock` keeps no typed error.
            private func held(_ clubID: String) -> ClubRef? {
                club?.id == clubID ? club : nil
            }

            func createClub(name: String, timezone: TimeZone, key: IdempotencyKey)
                async throws(APIFailure) -> ClubDetail
            {
                lock.withLock {
                    let made = ClubRef(
                        id: "club_new", name: name, timezone: timezone.identifier,
                        myMembershipID: "mem_ben")
                    club = made
                    return detail(made)
                }
            }

            func club(_ clubID: String) async throws(APIFailure) -> ClubDetail {
                guard let answer = lock.withLock({ held(clubID).map(detail) }) else {
                    throw .notFound
                }
                return answer
            }

            func members(of clubID: String) async throws(APIFailure) -> MemberList {
                let answer: MemberList? = lock.withLock {
                    held(clubID).map { club in
                        MemberList(
                            serverClock: clock, club: club,
                            members: [
                                Member(
                                    person: Self.ben, position: 1, cover: nil, nextDay: nil,
                                    nextUp: false)
                            ],
                            openRevision: candidates.isEmpty ? nil : revision(club))
                    }
                }
                guard let answer else { throw .notFound }
                return answer
            }

            func propose(
                _ names: [String], in clubID: String, expectedRosterVersion: Int,
                key: IdempotencyKey
            ) async throws(APIFailure) -> RosterRevision {
                let answer: Result<RosterRevision, APIFailure> = lock.withLock {
                    guard let club = held(clubID) else { return .failure(.notFound) }
                    guard expectedRosterVersion == candidates.count else {
                        return .failure(.versionConflict)
                    }
                    for name in names {
                        candidates.append(
                            Candidate(
                                id: "cand_\(candidates.count + 1)", name: name,
                                proposedBy: Self.ben, invitation: nil))
                    }
                    return .success(revision(club))
                }
                return try answer.get()
            }

            func createInvitation(for candidateID: String, in clubID: String, key: IdempotencyKey)
                async throws(APIFailure) -> InvitationLink
            {
                let answer: InvitationLink? = lock.withLock {
                    guard held(clubID) != nil,
                        let index = candidates.firstIndex(where: { $0.id == candidateID })
                    else { return nil }
                    let invitation = CandidateInvitation(
                        id: "inv_\(candidateID)", state: .live,
                        expiresAt: Date().addingTimeInterval(7 * 86_400))
                    let candidate = candidates[index]
                    candidates[index] = Candidate(
                        id: candidate.id, name: candidate.name, proposedBy: candidate.proposedBy,
                        invitation: invitation)
                    return InvitationLink(
                        invitationID: invitation.id, candidateID: candidateID,
                        url: Self.link(index), expiresAt: invitation.expiresAt)
                }
                guard let answer else { throw .notFound }
                return answer
            }

            /// A made-up link in the shape the server's take, with no token any server made.
            private static func link(_ index: Int) -> URL? {
                URL(string: "https://tadayo.app/i#" + String(format: "uitest%037d", index))
            }

            func schedule(of clubID: String) async throws(APIFailure) -> ClubWeek {
                try await none.schedule(of: clubID)
            }

            func revokeInvitation(_ invitationID: String) async throws(APIFailure) {
                let revoked: Bool = lock.withLock {
                    guard
                        let index = candidates.firstIndex(where: {
                            $0.invitation?.id == invitationID && $0.invitation?.state == .live
                        }), let live = candidates[index].invitation
                    else { return false }
                    let candidate = candidates[index]
                    candidates[index] = Candidate(
                        id: candidate.id, name: candidate.name, proposedBy: candidate.proposedBy,
                        invitation: CandidateInvitation(
                            id: live.id, state: .revoked, expiresAt: live.expiresAt))
                    return true
                }
                guard revoked else { throw .notFound }
            }

            func rosterRevision(_ revisionID: String) async throws(APIFailure) -> RosterRevision {
                try await none.rosterRevision(revisionID)
            }

            func approve(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
                async throws(APIFailure) -> RosterRevision
            { try await none.approve(revisionID, expectedVersion: expectedVersion, key: key) }

            func decline(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
                async throws(APIFailure) -> RosterRevision
            { try await none.decline(revisionID, expectedVersion: expectedVersion, key: key) }

            func preview(_ token: InvitationToken) async throws(APIFailure) -> InvitationPreview {
                try await none.preview(token)
            }

            func accept(
                _ token: InvitationToken, revisionID: String, expectedVersion: Int,
                key: IdempotencyKey
            ) async throws(APIFailure) -> InvitationAcceptance {
                try await none.accept(
                    token, revisionID: revisionID, expectedVersion: expectedVersion, key: key)
            }
        }

        /// Ben's two active clubs, as the club calls answer them: Sunday people, whose details,
        /// six members and their days answer, and Kitchen table, whose details answer not found
        /// after 3 seconds, as for a club the caller is no longer in (T9, T14), so a test sees
        /// its Club details loading first; the list read again then holds Sunday people alone
        /// (`relisted`). Every other call is `NoClubs`'.
        struct TwoClubs: ClubService {
            private static let sunday = ClubRef(
                id: "club_sunday", name: "Sunday people", timezone: "America/New_York",
                myMembershipID: "mem_ben")
            private static let kitchen = ClubRef(
                id: "club_kitchen", name: "Kitchen table", timezone: "America/New_York",
                myMembershipID: "mem_ben_kitchen")
            private static let six: [(name: String, day: Weekday)] = [
                ("Ben", .monday), ("Maya", .tuesday), ("Alex", .wednesday), ("Sam", .thursday),
                ("Debby", .friday), ("Nina", .saturday),
            ]

            static let listed = [
                ClubSummary(
                    ref: sunday, state: .active, memberCount: 6, openDay: nil, nextDay: nil),
                ClubSummary(
                    ref: kitchen, state: .active, memberCount: 5, openDay: nil, nextDay: nil),
            ]
            /// The list read again, once Kitchen table's details have answered not found.
            static let relisted = [listed[0]]

            private let none = NoClubs()

            private var clock: ServerClock { ServerClock(serverNow: Date(), receivedAt: .now) }

            private static func person(_ name: String) -> Person {
                Person(
                    membershipID: name == "Ben" ? "mem_ben" : "mem_\(name.lowercased())",
                    displayName: name, avatarVersion: nil)
            }

            func club(_ clubID: String) async throws(APIFailure) -> ClubDetail {
                guard clubID == Self.sunday.id else {
                    try? await Task.sleep(for: .seconds(3))
                    throw .notFound
                }
                return ClubDetail(
                    serverClock: clock, club: Self.listed[0], rosterVersion: 6, canPropose: false,
                    openRevisionID: nil)
            }

            func members(of clubID: String) async throws(APIFailure) -> MemberList {
                guard clubID == Self.sunday.id else { throw .notFound }
                return MemberList(
                    serverClock: clock, club: Self.sunday,
                    members: Self.six.enumerated().map { index, member in
                        Member(
                            person: Self.person(member.name), position: index + 1, cover: nil,
                            nextDay: nil, nextUp: false)
                    },
                    openRevision: nil)
            }

            func schedule(of clubID: String) async throws(APIFailure) -> ClubWeek {
                guard clubID == Self.sunday.id else { throw .notFound }
                return ClubWeek(
                    serverClock: clock, club: Self.sunday,
                    assignments: Self.six.map {
                        WeekdayAssignment(weekday: $0.day, person: Self.person($0.name))
                    })
            }

            func createClub(name: String, timezone: TimeZone, key: IdempotencyKey)
                async throws(APIFailure) -> ClubDetail
            { try await none.createClub(name: name, timezone: timezone, key: key) }

            func propose(
                _ names: [String], in clubID: String, expectedRosterVersion: Int,
                key: IdempotencyKey
            ) async throws(APIFailure) -> RosterRevision {
                try await none.propose(
                    names, in: clubID, expectedRosterVersion: expectedRosterVersion, key: key)
            }

            func createInvitation(for candidateID: String, in clubID: String, key: IdempotencyKey)
                async throws(APIFailure) -> InvitationLink
            { try await none.createInvitation(for: candidateID, in: clubID, key: key) }

            func revokeInvitation(_ invitationID: String) async throws(APIFailure) {
                try await none.revokeInvitation(invitationID)
            }

            func rosterRevision(_ revisionID: String) async throws(APIFailure) -> RosterRevision {
                try await none.rosterRevision(revisionID)
            }

            func approve(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
                async throws(APIFailure) -> RosterRevision
            { try await none.approve(revisionID, expectedVersion: expectedVersion, key: key) }

            func decline(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
                async throws(APIFailure) -> RosterRevision
            { try await none.decline(revisionID, expectedVersion: expectedVersion, key: key) }

            func preview(_ token: InvitationToken) async throws(APIFailure) -> InvitationPreview {
                try await none.preview(token)
            }

            func accept(
                _ token: InvitationToken, revisionID: String, expectedVersion: Int,
                key: IdempotencyKey
            ) async throws(APIFailure) -> InvitationAcceptance {
                try await none.accept(
                    token, revisionID: revisionID, expectedVersion: expectedVersion, key: key)
            }
        }

        /// The club calls for Ben, in no club, holding two invitations. Debby's to Sunday people:
        /// its link (`invitedLink`) shows the frames' roster, Ben first, and Accept this roster
        /// leaves it waiting on the members, so the club list then lists it (`invitations`).
        /// Maya's to Kitchen table: its link (`joiningLink`) shows its roster, or, when the list
        /// already lists it as accepted with its roster changed (`changedListed`), the changed
        /// roster; Accept this roster joins it, so the club list then holds the club (`listed`)
        /// and no longer the invitation. Any other link is one the server doesn't know
        /// (`NOT_FOUND`). Every other call is `NoClubs`'.
        final class Invited: ClubService, @unchecked Sendable {
            private let lock = NSLock()
            private var hasJoined = false
            private var debbyWaits = false
            private let changedListed: Bool
            private let none = NoClubs()

            init(changedListed: Bool = false) {
                self.changedListed = changedListed
            }

            /// The accepted invitations the club list lists, in the server's order.
            var invitations: [MyInvitation] {
                lock.withLock {
                    var listed: [MyInvitation] = []
                    if debbyWaits {
                        listed.append(
                            MyInvitation(
                                invitationID: "inv_debby", clubName: "Sunday people",
                                inviterName: "Debby", state: .waiting))
                    }
                    if changedListed, !hasJoined {
                        listed.append(
                            MyInvitation(
                                invitationID: "inv_maya", clubName: "Kitchen table",
                                inviterName: "Maya", state: .rosterChanged))
                    }
                    return listed
                }
            }
            private static let kitchen = ClubRef(
                id: "club_kitchen", name: "Kitchen table", timezone: "America/New_York",
                myMembershipID: "mem_ben_kitchen")
            private static let kitchenRoster = InvitationRoster(
                invitationID: "inv_maya", inviterName: "Maya", clubName: "Kitchen table",
                revisionID: "rev_kitchen", revisionVersion: 1,
                roster: [
                    InvitationRosterEntry(name: "Maya", kind: .member, isYou: false),
                    InvitationRosterEntry(name: "Alex", kind: .member, isYou: false),
                    InvitationRosterEntry(name: "Sam", kind: .member, isYou: false),
                    InvitationRosterEntry(name: "Debby", kind: .member, isYou: false),
                    InvitationRosterEntry(name: "Ben", kind: .candidate, isYou: true),
                ], expiresAt: nil)

            /// The clubs Ben is in: Kitchen table, once its Accept has joined it.
            var listed: [ClubSummary] {
                guard lock.withLock({ hasJoined }) else { return [] }
                return [
                    ClubSummary(
                        ref: Self.kitchen, state: .active, memberCount: 5, openDay: nil,
                        nextDay: nil)
                ]
            }
            private static let roster = InvitationRoster(
                invitationID: "inv_debby", inviterName: "Debby", clubName: "Sunday people",
                revisionID: "rev_sunday", revisionVersion: 1,
                roster: [
                    InvitationRosterEntry(name: "Maya", kind: .member, isYou: false),
                    InvitationRosterEntry(name: "Alex", kind: .member, isYou: false),
                    InvitationRosterEntry(name: "Sam", kind: .member, isYou: false),
                    InvitationRosterEntry(name: "Debby", kind: .member, isYou: false),
                    InvitationRosterEntry(name: "Nina", kind: .member, isYou: false),
                    InvitationRosterEntry(name: "Ben", kind: .candidate, isYou: true),
                ], expiresAt: nil)

            private static func isDebbys(_ token: InvitationToken) -> Bool {
                InvitationToken(link: UITestLaunch.invitedLink) == token
            }

            private static func isMayas(_ token: InvitationToken) -> Bool {
                InvitationToken(link: UITestLaunch.joiningLink) == token
            }

            func preview(_ token: InvitationToken) async throws(APIFailure) -> InvitationPreview {
                if Self.isDebbys(token) { return .open(Self.roster) }
                if Self.isMayas(token) {
                    return changedListed ? .changed(Self.kitchenRoster) : .open(Self.kitchenRoster)
                }
                throw .notFound
            }

            func accept(
                _ token: InvitationToken, revisionID: String, expectedVersion: Int,
                key: IdempotencyKey
            ) async throws(APIFailure) -> InvitationAcceptance {
                if Self.isDebbys(token) {
                    lock.withLock { debbyWaits = true }
                    return .waiting
                }
                guard Self.isMayas(token) else { throw .notFound }
                lock.withLock { hasJoined = true }
                return .joined(Self.kitchen)
            }

            func createClub(name: String, timezone: TimeZone, key: IdempotencyKey)
                async throws(APIFailure) -> ClubDetail
            { try await none.createClub(name: name, timezone: timezone, key: key) }

            func club(_ clubID: String) async throws(APIFailure) -> ClubDetail {
                try await none.club(clubID)
            }

            func members(of clubID: String) async throws(APIFailure) -> MemberList {
                try await none.members(of: clubID)
            }

            func schedule(of clubID: String) async throws(APIFailure) -> ClubWeek {
                try await none.schedule(of: clubID)
            }

            func propose(
                _ names: [String], in clubID: String, expectedRosterVersion: Int,
                key: IdempotencyKey
            ) async throws(APIFailure) -> RosterRevision {
                try await none.propose(
                    names, in: clubID, expectedRosterVersion: expectedRosterVersion, key: key)
            }

            func createInvitation(for candidateID: String, in clubID: String, key: IdempotencyKey)
                async throws(APIFailure) -> InvitationLink
            { try await none.createInvitation(for: candidateID, in: clubID, key: key) }

            func revokeInvitation(_ invitationID: String) async throws(APIFailure) {
                try await none.revokeInvitation(invitationID)
            }

            func rosterRevision(_ revisionID: String) async throws(APIFailure) -> RosterRevision {
                try await none.rosterRevision(revisionID)
            }

            func approve(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
                async throws(APIFailure) -> RosterRevision
            { try await none.approve(revisionID, expectedVersion: expectedVersion, key: key) }

            func decline(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
                async throws(APIFailure) -> RosterRevision
            { try await none.decline(revisionID, expectedVersion: expectedVersion, key: key) }
        }

        /// The club calls for an account with no club, which makes none: each fails as if no
        /// answer came. The root snapshot tests' roots take it too.
        struct NoClubs: ClubService {
            func createClub(name: String, timezone: TimeZone, key: IdempotencyKey)
                async throws(APIFailure) -> ClubDetail
            { throw .network }

            func club(_ clubID: String) async throws(APIFailure) -> ClubDetail { throw .network }

            func members(of clubID: String) async throws(APIFailure) -> MemberList {
                throw .network
            }

            func schedule(of clubID: String) async throws(APIFailure) -> ClubWeek {
                throw .network
            }

            func propose(
                _ names: [String], in clubID: String, expectedRosterVersion: Int,
                key: IdempotencyKey
            ) async throws(APIFailure) -> RosterRevision { throw .network }

            func createInvitation(for candidateID: String, in clubID: String, key: IdempotencyKey)
                async throws(APIFailure) -> InvitationLink
            { throw .network }

            func revokeInvitation(_ invitationID: String) async throws(APIFailure) {
                throw .network
            }

            func rosterRevision(_ revisionID: String) async throws(APIFailure) -> RosterRevision {
                throw .network
            }

            func approve(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
                async throws(APIFailure) -> RosterRevision
            { throw .network }

            func decline(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
                async throws(APIFailure) -> RosterRevision
            { throw .network }

            func preview(_ token: InvitationToken) async throws(APIFailure) -> InvitationPreview {
                throw .network
            }

            func accept(
                _ token: InvitationToken, revisionID: String, expectedVersion: Int,
                key: IdempotencyKey
            ) async throws(APIFailure) -> InvitationAcceptance { throw .network }
        }
    }
#endif
