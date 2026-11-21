import Foundation
import TadayoAPI
import TadayoCore

/// How the app opened: with its services, with none because it's hosting a test bundle (the
/// snapshot and unit tests touch no keychain and no network, T53), or with none because the build
/// has no Supabase settings (Release, until it gets them: it fails closed).
enum AppLaunch {
    case live(AppGraph)
    case inert
    case unconfigured

    @MainActor static func make(
        info: [String: Any] = Bundle.main.infoDictionary ?? [:],
        process: ProcessInfo = .processInfo
    ) -> AppLaunch {
        #if DEBUG
            // The UI tests launch the app as a person would, with no session kept: a fresh
            // simulator's keychain is empty, but a run before may have left one.
            if process.arguments.contains(UITestLaunch.noSession) {
                let graph = AppGraph.make(info: info, store: InMemorySessionStore())
                return graph.map(AppLaunch.live) ?? .unconfigured
            }
            if process.arguments.contains(UITestLaunch.fakes) {
                return .live(UITestLaunch.fakeGraph())
            }
            if process.arguments.contains(UITestLaunch.hangingSend) {
                return .live(UITestLaunch.fakeGraph(hangingSend: true))
            }
            if process.arguments.contains(UITestLaunch.nameFailsThenHangs) {
                return .live(UITestLaunch.fakeGraph(nameFailsThenHangs: true))
            }
        #endif
        if isHostingTests(process) { return .inert }
        return configured(
            info: info,
            container: FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: KeychainSessionStore.accessGroup))
    }

    /// The app as the build's settings make it, with its session in the keychain: a session an
    /// earlier install left is forgotten first (FQ87), before anything reads the store. The
    /// tests pass a folder of their own and a service of their own.
    @MainActor static func configured(
        info: [String: Any], container: URL?, service: String = KeychainSessionStore.appService
    ) -> AppLaunch {
        guard let store = KeychainSessionStore(info: info, service: service) else {
            return .unconfigured
        }
        KeychainSessionStore.forgetEarlierInstall(markedIn: container, service: service)
        return AppGraph.make(info: info, store: store).map(AppLaunch.live) ?? .unconfigured
    }

    /// A hosted test bundle: XCTest is loaded into the app's own process.
    static func isHostingTests(_ process: ProcessInfo) -> Bool {
        process.environment["XCTestConfigurationFilePath"] != nil
            || process.environment["XCTestBundlePath"] != nil
            || NSClassFromString("XCTestCase") != nil
    }
}

/// The app's services, built once at launch: Supabase Auth and the API over one set of
/// connections, the session in the keychain, and the root model that routes by them.
@MainActor struct AppGraph {
    let root: RootModel
    let connections: Connections

    /// Nil when the settings are missing or aren't what they must be: the app then makes no call.
    static func make(
        info: [String: Any], store: any SessionStore, connections: Connections = Connections()
    ) -> AppGraph? {
        guard let supabase = SupabaseConfiguration(info: info),
            let api = (info["TadayoAPIBaseURL"] as? String).flatMap(URL.init(string:)),
            api.scheme == "https", api.host() != nil
        else { return nil }
        let auth = SupabaseAuth(configuration: supabase, transport: connections)
        let session = SessionManager(auth: auth, store: store)
        let accounts = Accounts(serverURL: api, session: session, connections: connections)
        let root = RootModel(
            session: session, auth: auth, accounts: accounts, clubs: accounts,
            selection: DefaultsClubSelection(), left: { connections.reset() })
        return AppGraph(root: root, connections: connections)
    }
}

extension KeychainSessionStore {
    /// The store for the build's environment (`TadayoEnvironment`, filled by `project.yml`); nil
    /// with none, and the app then builds nothing.
    init?(info: [String: Any], service: String = KeychainSessionStore.appService) {
        guard let environment = info["TadayoEnvironment"] as? String, !environment.isEmpty
        else { return nil }
        self.init(environment: environment, service: service)
    }
}

extension SupabaseConfiguration {
    /// From the Info.plist keys `project.yml` fills: an https project URL and a publishable key.
    /// Anything else, a secret key above all (T56), is no configuration.
    init?(info: [String: Any]) {
        guard let url = (info["TadayoSupabaseURL"] as? String).flatMap(URL.init(string:)),
            url.scheme == "https", let host = url.host(), !host.isEmpty,
            let key = info["TadayoSupabasePublishableKey"] as? String,
            key.hasPrefix("sb_publishable_"), key.count > "sb_publishable_".count
        else { return nil }
        self.init(projectURL: url, publishableKey: key)
    }
}

/// The connection every request goes through, to Supabase and to the API: one ephemeral
/// `URLSession` (TadayoNetwork's: no cache, no cookies, no credentials), invalidated and made
/// again each time an account is left, so nothing of one account's connections serves the next
/// (T11, Q26). Requests still on their way then are cancelled.
final class Connections: HTTPTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var session: URLSession
    private let makeSession: @Sendable () -> URLSession

    init(makeSession: @escaping @Sendable () -> URLSession = { TadayoNetwork.session() }) {
        self.makeSession = makeSession
        session = makeSession()
    }

    /// The session requests go through now.
    var current: URLSession { lock.withLock { session } }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        try await URLSessionHTTPTransport(session: current).send(request)
    }

    func reset() {
        let fresh = makeSession()
        let old = lock.withLock {
            let old = session
            session = fresh
            return old
        }
        old.invalidateAndCancel()
    }
}

/// The API, through whichever session `Connections` holds at the time of each call: the
/// account's calls and the club calls.
struct Accounts: AccountService, ClubService {
    let serverURL: URL
    let session: SessionManager
    let connections: Connections

    private var client: TadayoAPIClient {
        TadayoAPIClient(serverURL: serverURL, session: session, urlSession: connections.current)
    }

    func me() async throws(APIFailure) -> Account {
        try await client.me()
    }

    func update(_ change: AccountChange, key: IdempotencyKey) async throws(APIFailure) -> Account {
        try await client.update(change, key: key)
    }

    func clubs() async throws(APIFailure) -> ClubList {
        try await client.clubs()
    }

    func createClub(name: String, timezone: TimeZone, key: IdempotencyKey) async throws(APIFailure)
        -> ClubDetail
    {
        try await client.createClub(name: name, timezone: timezone, key: key)
    }

    func club(_ clubID: String) async throws(APIFailure) -> ClubDetail {
        try await client.club(clubID)
    }

    func members(of clubID: String) async throws(APIFailure) -> MemberList {
        try await client.members(of: clubID)
    }

    func schedule(of clubID: String) async throws(APIFailure) -> ClubWeek {
        try await client.schedule(of: clubID)
    }

    func propose(
        _ names: [String], in clubID: String, expectedRosterVersion: Int, key: IdempotencyKey
    ) async throws(APIFailure) -> RosterRevision {
        try await client.propose(
            names, in: clubID, expectedRosterVersion: expectedRosterVersion, key: key)
    }

    func createInvitation(for candidateID: String, in clubID: String, key: IdempotencyKey)
        async throws(APIFailure) -> InvitationLink
    {
        try await client.createInvitation(for: candidateID, in: clubID, key: key)
    }

    func revokeInvitation(_ invitationID: String) async throws(APIFailure) {
        try await client.revokeInvitation(invitationID)
    }

    func rosterRevision(_ revisionID: String) async throws(APIFailure) -> RosterRevision {
        try await client.rosterRevision(revisionID)
    }

    func approve(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
        async throws(APIFailure) -> RosterRevision
    {
        try await client.approve(revisionID, expectedVersion: expectedVersion, key: key)
    }

    func decline(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
        async throws(APIFailure) -> RosterRevision
    {
        try await client.decline(revisionID, expectedVersion: expectedVersion, key: key)
    }

    func preview(_ token: InvitationToken) async throws(APIFailure) -> InvitationPreview {
        try await client.preview(token)
    }

    func accept(
        _ token: InvitationToken, revisionID: String, expectedVersion: Int, key: IdempotencyKey
    ) async throws(APIFailure) -> InvitationAcceptance {
        try await client.accept(
            token, revisionID: revisionID, expectedVersion: expectedVersion, key: key)
    }
}
