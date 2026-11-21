import Security
import TadayoCore
import XCTest

@testable import Tadayo

/// The invitation links' keychain item in the app's own process, on the simulator's keychain
/// (ADR-037; `docs/plans/ios-b1-create.md` section 1). Each test uses a service of its own, never
/// the app's, and deletes what it wrote.
final class KeychainInvitationLinkVaultTests: XCTestCase {
    private let service = "app.tadayo.invitations.tests"
    private var vault: KeychainInvitationLinkVault!

    /// A link of the contract's shape, made up for the tests.
    private func file(_ account: String = "acct_ben", shared: Bool = false) -> InvitationLinkFile {
        InvitationLinkFile(
            accountID: account,
            links: [
                KeptInvitationLink(
                    clubID: "club_sunday", candidateID: "cand_sam", invitationID: "inv_sam",
                    url: URL(string: "https://tadayo.app/i#" + String(repeating: "A", count: 43))!,
                    shared: shared)
            ])
    }

    override func setUpWithError() throws {
        vault = KeychainInvitationLinkVault(environment: "dev", service: service)
        try vault.delete()
    }

    override func tearDownWithError() throws {
        try vault.delete()
    }

    func testSavedLinksComeBack() throws {
        XCTAssertNil(try vault.load())
        try vault.save(file())
        XCTAssertEqual(try vault.load(), file())
    }

    func testSavingAgainWritesOverIt() throws {
        try vault.save(file())
        try vault.save(file("acct_maya", shared: true))
        XCTAssertEqual(try vault.load(), file("acct_maya", shared: true))
        XCTAssertEqual(try attributes().count, 1)
    }

    func testDeletingNothingSucceeds() throws {
        XCTAssertNoThrow(try vault.delete())
        try vault.save(file())
        try vault.delete()
        XCTAssertNil(try vault.load())
        XCTAssertNoThrow(try vault.delete())
    }

    func testAnItemItCantReadIsNoItemAndIsDeleted() throws {
        var added = query
        added[kSecAttrAccount as String] = "dev"
        added[kSecValueData as String] = Data("not a file of links".utf8)
        added[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        XCTAssertEqual(SecItemAdd(added as CFDictionary, nil), errSecSuccess)
        XCTAssertNil(try vault.load())
        XCTAssertEqual(try attributes().count, 0)
        try vault.save(file())
        XCTAssertEqual(try vault.load(), file())
    }

    func testTheItemIsThisDevicesOnlyAndReadOnlyWhileUnlocked() throws {
        try vault.save(file())
        let item = try XCTUnwrap(try attributes().first)
        XCTAssertEqual(item[kSecAttrAccessGroup as String] as? String, "group.app.tadayo")
        XCTAssertEqual(
            item[kSecAttrAccessible as String] as? String,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String)
        XCTAssertNotEqual((item[kSecAttrSynchronizable as String] as? NSNumber)?.boolValue, true)
        XCTAssertEqual(item[kSecAttrAccount as String] as? String, "dev")
        XCTAssertEqual(item[kSecAttrService as String] as? String, service)
    }

    func testEachEnvironmentKeepsItsOwn() throws {
        let prod = KeychainInvitationLinkVault(environment: "prod", service: service)
        defer { try? prod.delete() }
        try vault.save(file())
        XCTAssertNil(try prod.load())
        try prod.delete()
        XCTAssertEqual(try vault.load(), file())
    }

    func testTheItemHoldsTheAccountsIdAndItsLinksOnly() throws {
        try vault.save(file())
        let data = try XCTUnwrap(try storedData())
        let fields = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(Set(fields.keys), ["accountID", "links"])
        let link = try XCTUnwrap((fields["links"] as? [[String: Any]])?.first)
        XCTAssertEqual(
            Set(link.keys), ["clubID", "candidateID", "invitationID", "url", "shared"])
    }

    @MainActor func testTheBookForgetsTheItem() throws {
        try vault.save(file())
        let book = InvitationLinkBook(vault: vault)
        XCTAssertNotNil(book.link(for: "cand_sam", club: "club_sunday", account: "acct_ben"))
        book.forget()
        XCTAssertNil(try vault.load())
        XCTAssertEqual(try attributes().count, 0)
    }

    func testTheVaultIsTheBuildsEnvironments() {
        XCTAssertEqual(
            KeychainInvitationLinkVault(info: ["TadayoEnvironment": "dev"])?.environment, "dev")
        XCTAssertEqual(
            KeychainInvitationLinkVault(info: ["TadayoEnvironment": "dev"])?.service,
            "app.tadayo.invitations")
        XCTAssertNil(KeychainInvitationLinkVault(info: ["TadayoEnvironment": ""]))
        XCTAssertNil(KeychainInvitationLinkVault(info: [:]))
    }

    private var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
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
