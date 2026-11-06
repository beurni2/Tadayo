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

    func testEveryRequestGoesThroughASessionThatKeepsNothing() {
        let configuration = Connections().current.configuration
        XCTAssertNil(configuration.urlCache)
        XCTAssertNil(configuration.httpCookieStorage)
        XCTAssertFalse(configuration.httpShouldSetCookies)
        XCTAssertNil(configuration.urlCredentialStorage)
        XCTAssertEqual(configuration.requestCachePolicy, .reloadIgnoringLocalCacheData)
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
