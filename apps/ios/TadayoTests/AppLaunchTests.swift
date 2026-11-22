import TadayoCore
import XCTest

@testable import Tadayo

/// How the app opens and what it builds (T11, T53, T56).
@MainActor
final class AppLaunchTests: XCTestCase {
    private let settings: [String: Any] = [
        "TadayoEnvironment": "dev",
        "TadayoAPIBaseURL": "https://api-dev.tadayo.app",
        "TadayoSupabaseURL": "https://supabase.invalid",
        "TadayoSupabasePublishableKey": "sb_publishable_none",
    ]

    private let testService = "app.tadayo.session.tests.launch"
    private let testLinks = "app.tadayo.invitations.tests.launch"
    private let earlierSession = AuthSession(
        accessToken: "access-earlier", refreshToken: "refresh-earlier",
        expiresAt: Date(timeIntervalSince1970: 1_793_847_600))

    private func emptyContainer() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appending(
            path: UUID().uuidString, directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    func testHostingTheseTestsTheAppBuildsNothing() {
        // The snapshot and unit tests run inside the app: it reads no keychain and makes no call.
        XCTAssertTrue(AppLaunch.isHostingTests(.processInfo))
        guard case .inert = AppLaunch.make(info: settings) else {
            return XCTFail("the app built its services under XCTest")
        }
    }

    func testDebugBuildsCanNeverSendACode() throws {
        // Debug runs only in the simulator and on CI, which never send a sign-in code: its URL
        // is under .invalid, which never resolves (RFC 6761). The tests run on Debug.
        let info = try XCTUnwrap(Bundle.main.infoDictionary)
        let url = try XCTUnwrap(SupabaseConfiguration(info: info)?.projectURL)
        XCTAssertEqual(url.host(), "supabase.invalid")
    }

    func testMissingOrWrongSettingsBuildNothing() {
        var noURL = settings
        noURL["TadayoSupabaseURL"] = ""
        var unexpanded = settings
        unexpanded["TadayoSupabaseURL"] = "$(TADAYO_SUPABASE_URL)"
        var plainHTTP = settings
        plainHTTP["TadayoSupabaseURL"] = "http://supabase.invalid"
        var secretKey = settings
        secretKey["TadayoSupabasePublishableKey"] = "sb_secret_abc"
        var noKey = settings
        noKey["TadayoSupabasePublishableKey"] = "sb_publishable_"
        var noAPI = settings
        noAPI["TadayoAPIBaseURL"] = ""
        for info in [noURL, unexpanded, plainHTTP, secretKey, noKey, noAPI] {
            XCTAssertNil(AppGraph.make(info: info, store: InMemorySessionStore()))
        }
        XCTAssertNotNil(AppGraph.make(info: settings, store: InMemorySessionStore()))
    }

    func testTheFirstLaunchAfterAnInstallForgetsTheSessionBeforeReadingIt() async throws {
        // FQ87: an earlier install's session, and no mark in the app group's container.
        let store = KeychainSessionStore(environment: "dev", service: testService)
        try store.save(earlierSession)
        defer { try? store.delete() }
        let container = try emptyContainer()
        defer { try? FileManager.default.removeItem(at: container) }
        guard
            case .live(let graph) = AppLaunch.configured(
                info: settings, container: container, service: testService,
                invitationsService: testLinks)
        else { return XCTFail("the app built nothing from good settings") }
        XCTAssertNil(try store.load())
        await graph.root.start()
        XCTAssertEqual(graph.root.route, .signIn)
    }

    func testALaterLaunchKeepsTheSession() throws {
        let store = KeychainSessionStore(environment: "dev", service: testService)
        defer { try? store.delete() }
        let container = try emptyContainer()
        defer { try? FileManager.default.removeItem(at: container) }
        _ = AppLaunch.configured(
            info: settings, container: container, service: testService,
            invitationsService: testLinks)
        try store.save(earlierSession)
        guard
            case .live = AppLaunch.configured(
                info: settings, container: container, service: testService,
                invitationsService: testLinks)
        else { return XCTFail("the app built nothing from good settings") }
        XCTAssertEqual(try store.load(), earlierSession)
    }

    func testABuildWithNoEnvironmentBuildsNothing() {
        var noEnvironment = settings
        noEnvironment["TadayoEnvironment"] = ""
        guard
            case .unconfigured = AppLaunch.configured(
                info: noEnvironment, container: nil, service: testService,
                invitationsService: testLinks)
        else { return XCTFail("the app built its services with no environment") }
    }

    func testEveryRequestGoesThroughASessionThatKeepsNothing() {
        let configuration = Connections().current.configuration
        XCTAssertNil(configuration.urlCache)
        XCTAssertNil(configuration.httpCookieStorage)
        XCTAssertFalse(configuration.httpShouldSetCookies)
        XCTAssertNil(configuration.urlCredentialStorage)
        XCTAssertEqual(configuration.requestCachePolicy, .reloadIgnoringLocalCacheData)
    }

    func testLeavingForgetsTheInvitationLinks() async throws {
        // ADR-037, T11: Leave sign-in is both logout and the way to another account.
        let vault = InMemoryInvitationLinkVault(
            InvitationLinkFile(
                accountID: "acct_ben",
                links: [
                    KeptInvitationLink(
                        clubID: "club_sunday", candidateID: "cand_sam", invitationID: "inv_sam",
                        url: URL(
                            string: "https://tadayo.app/i#" + String(repeating: "A", count: 43))!,
                        shared: false)
                ]))
        let graph = try XCTUnwrap(
            AppGraph.make(info: settings, store: InMemorySessionStore(), links: vault))
        XCTAssertNotNil(graph.links.link(for: "cand_sam", club: "club_sunday", account: "acct_ben"))
        await graph.root.start()
        await graph.root.leave()
        XCTAssertNil(try vault.load())
        XCTAssertNil(graph.links.link(for: "cand_sam", club: "club_sunday", account: "acct_ben"))
    }

    func testLeavingRemakesTheConnections() async throws {
        // T11: once an account is left, nothing of its connections serves the next one.
        let connections = Connections()
        let graph = try XCTUnwrap(
            AppGraph.make(info: settings, store: InMemorySessionStore(), connections: connections))
        let before = connections.current
        await graph.root.start()
        XCTAssertEqual(graph.root.route, .signIn)
        XCTAssertTrue(connections.current === before)
        await graph.root.leave()
        XCTAssertFalse(connections.current === before)
        XCTAssertEqual(graph.root.route, .signIn)
        XCTAssertTrue(connections.current.configuration.urlCache == nil)
    }
}
