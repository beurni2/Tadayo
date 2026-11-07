import Security
import TadayoCore
import XCTest

@testable import Tadayo

/// The keychain store in the app's own process, on the simulator's keychain (docs/TECH-DESIGN.md
/// section 4). Each test uses a service of its own, never the app's, and deletes what it wrote,
/// so no session is left for the UI tests to find.
final class KeychainSessionStoreTests: XCTestCase {
    private let session = AuthSession(
        accessToken: "access-1", refreshToken: "refresh-1",
        expiresAt: Date(timeIntervalSince1970: 1_793_847_600))
    private var store: KeychainSessionStore!

    override func setUpWithError() throws {
        store = KeychainSessionStore(environment: "dev", service: "app.tadayo.session.tests")
        try store.delete()
    }

    override func tearDownWithError() throws {
        try store.delete()
    }

    func testASavedSessionComesBack() throws {
        XCTAssertNil(try store.load())
        try store.save(session)
        XCTAssertEqual(try store.load(), session)
    }

    func testSavingAgainWritesOverIt() throws {
        try store.save(session)
        let fresh = AuthSession(
            accessToken: "access-2", refreshToken: "refresh-2",
            expiresAt: session.expiresAt.addingTimeInterval(3600))
        try store.save(fresh)
        XCTAssertEqual(try store.load(), fresh)
        XCTAssertEqual(try attributes().count, 1)
    }

    func testDeletingNothingSucceeds() throws {
        // SessionManager reads a store that refuses to delete as a session still kept (SEC-5):
        // an empty store has to say it's done.
        XCTAssertNoThrow(try store.delete())
        try store.save(session)
        try store.delete()
        XCTAssertNil(try store.load())
        XCTAssertNoThrow(try store.delete())
    }

    func testTheItemIsTheSharedGroupsOnThisDeviceOnly() throws {
        try store.save(session)
        let item = try XCTUnwrap(try attributes().first)
        XCTAssertEqual(item[kSecAttrAccessGroup as String] as? String, "group.app.tadayo")
        XCTAssertEqual(
            item[kSecAttrAccessible as String] as? String,
            kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
        XCTAssertNotEqual((item[kSecAttrSynchronizable as String] as? NSNumber)?.boolValue, true)
        XCTAssertEqual(item[kSecAttrAccount as String] as? String, "dev")
        XCTAssertEqual(item[kSecAttrService as String] as? String, "app.tadayo.session.tests")
    }

    func testEachEnvironmentKeepsItsOwn() throws {
        let prod = KeychainSessionStore(environment: "prod", service: "app.tadayo.session.tests")
        defer { try? prod.delete() }
        try store.save(session)
        XCTAssertNil(try prod.load())
        try prod.delete()
        XCTAssertEqual(try store.load(), session)
    }

    func testTheItemHoldsTheTokensAndTheirExpiryOnly() throws {
        try store.save(session)
        let data = try XCTUnwrap(try storedData())
        let fields = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(Set(fields.keys), ["accessToken", "refreshToken", "expiresAt"])
    }

    func testAFailureCarriesItsStatusOnly() {
        // T52: nothing of the session reaches a log through an error.
        let failure = KeychainFailure(status: errSecInteractionNotAllowed)
        XCTAssertEqual("\(failure)", "Keychain status \(errSecInteractionNotAllowed)")
    }

    func testAFirstLaunchAfterAnInstallForgetsEverySession() throws {
        // FQ87: iOS keeps the item when the app is deleted; the app group's container goes.
        let prod = KeychainSessionStore(environment: "prod", service: "app.tadayo.session.tests")
        defer { try? prod.delete() }
        try store.save(session)
        try prod.save(session)
        let container = try emptyContainer()
        defer { try? FileManager.default.removeItem(at: container) }
        forgetEarlierInstall(markedIn: container)
        XCTAssertNil(try store.load())
        XCTAssertNil(try prod.load())
        let mark = container.appending(path: KeychainSessionStore.installMark)
        XCTAssertTrue(FileManager.default.fileExists(atPath: mark.path(percentEncoded: false)))
        // Every launch after it keeps the session.
        try store.save(session)
        forgetEarlierInstall(markedIn: container)
        XCTAssertEqual(try store.load(), session)
    }

    func testWithNoContainerNoSessionIsKept() throws {
        try store.save(session)
        forgetEarlierInstall(markedIn: nil)
        XCTAssertNil(try store.load())
    }

    func testTheAppGroupsContainerIsThere() {
        // The mark lives there, so the app (and from B4 the share extension) never fails closed
        // for want of it.
        XCTAssertNotNil(
            FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: KeychainSessionStore.accessGroup))
    }

    func testTheStoreIsTheBuildsEnvironments() {
        XCTAssertEqual(KeychainSessionStore(info: ["TadayoEnvironment": "dev"])?.environment, "dev")
        XCTAssertEqual(
            KeychainSessionStore(info: ["TadayoEnvironment": "dev"])?.service,
            KeychainSessionStore.appService)
        XCTAssertNil(KeychainSessionStore(info: ["TadayoEnvironment": ""]))
        XCTAssertNil(KeychainSessionStore(info: [:]))
    }

    private func forgetEarlierInstall(markedIn container: URL?) {
        KeychainSessionStore.forgetEarlierInstall(
            markedIn: container, service: "app.tadayo.session.tests")
    }

    private func emptyContainer() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appending(
            path: UUID().uuidString, directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "app.tadayo.session.tests",
            kSecAttrAccessGroup as String: "group.app.tadayo",
        ]
    }

    private func attributes() throws -> [[String: Any]] {
        var query = query
        query[kSecReturnAttributes as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitAll
        var found: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &found)
        if status == errSecItemNotFound { return [] }
        XCTAssertEqual(status, errSecSuccess)
        return found as? [[String: Any]] ?? []
    }

    private func storedData() throws -> Data? {
        var query = query
        query[kSecAttrAccount as String] = "dev"
        query[kSecReturnData as String] = true
        var found: CFTypeRef?
        XCTAssertEqual(SecItemCopyMatching(query as CFDictionary, &found), errSecSuccess)
        return found as? Data
    }
}
