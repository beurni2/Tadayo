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
        static let rightCode = "123456"

        @MainActor static func fakeGraph(
            hangingSend: Bool = false, nameFailsThenHangs: Bool = false
        ) -> AppGraph {
            let auth = FakeAuth(hangsOnSend: hangingSend)
            let accounts = FakeAccounts(nameFailsThenHangs: nameFailsThenHangs)
            let session = SessionManager(auth: auth, store: InMemorySessionStore())
            let root = RootModel(
                session: session, auth: auth, accounts: accounts, clubs: NoClubs(),
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
            private var namesTried = 0
            private var account = Account(
                id: "ui-test", displayName: nil, avatarVersion: nil, ageConfirmed: false,
                version: 0)

            init(nameFailsThenHangs: Bool = false) {
                self.nameFailsThenHangs = nameFailsThenHangs
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
                ClubList(
                    serverClock: ServerClock(serverNow: Date(), receivedAt: .now), clubs: [],
                    invitations: [])
            }
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
