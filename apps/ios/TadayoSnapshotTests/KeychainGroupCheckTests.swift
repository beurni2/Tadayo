import Foundation
import Security
import XCTest

/// Check branch only (`ios/b0-keychain-check`, never merged): does an unsigned simulator build
/// carry the app group `group.app.tadayo`, and does the keychain take it as the access group the
/// app and the share extension share? The slice plan's section 8 asks for this run before
/// `ios/b0-sign-in`; its section 2 makes the app group the access group, so one entitlement
/// covers both targets ("You can use app group names as keychain access group names, without
/// adding them to the Keychain access groups entitlement": Apple, "Sharing access to keychain
/// items among a collection of apps").
///
/// A green build alone proves only that the declarations compile, so these run inside the host
/// app, under its entitlements, and print what they found for the run's log.
final class KeychainGroupCheckTests: XCTestCase {
    static let group = "group.app.tadayo"
    static let service = "app.tadayo.keychain-check"

    func testTheAppGroupsContainerExists() {
        let url = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: Self.group)
        print("keychain-check: containerURL(\(Self.group)) = \(url?.path ?? "nil")")
        XCTAssertNotNil(url, "the host app doesn't carry the app group \(Self.group)")
    }

    func testAnItemInTheGroupRoundTrips() {
        let account = "check-\(UUID().uuidString)"
        let item: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: Self.group,
        ]
        var add = item
        add[kSecValueData as String] = Data("check".utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        add[kSecAttrSynchronizable as String] = false
        let added = SecItemAdd(add as CFDictionary, nil)
        print("keychain-check: SecItemAdd in \(Self.group) = \(added) (\(Self.message(added)))")
        XCTAssertEqual(added, errSecSuccess, "SecItemAdd: \(Self.message(added))")
        guard added == errSecSuccess else { return }

        var read = item
        read[kSecReturnData as String] = true
        read[kSecReturnAttributes as String] = true
        read[kSecMatchLimit as String] = kSecMatchLimitOne
        var found: CFTypeRef?
        let copied = SecItemCopyMatching(read as CFDictionary, &found)
        let attributes = found as? [String: Any]
        let group = attributes?[kSecAttrAccessGroup as String] as? String
        print("keychain-check: SecItemCopyMatching = \(copied), access group \(group ?? "nil")")
        XCTAssertEqual(copied, errSecSuccess, "SecItemCopyMatching: \(Self.message(copied))")
        XCTAssertEqual(group, Self.group, "the item landed in another access group")
        XCTAssertEqual(attributes?[kSecValueData as String] as? Data, Data("check".utf8))

        let deleted = SecItemDelete(item as CFDictionary)
        print("keychain-check: SecItemDelete = \(deleted)")
        XCTAssertEqual(deleted, errSecSuccess, "SecItemDelete: \(Self.message(deleted))")
        let again = SecItemCopyMatching(item as CFDictionary, nil)
        XCTAssertEqual(again, errSecItemNotFound, "the item is still there after its delete")
    }

    /// The extension can't run under XCTest, so its executable is read instead: the simulator
    /// takes a target's entitlements from the plist its build embeds in the binary.
    func testTheShareExtensionCarriesTheGroup() throws {
        let plugins = try XCTUnwrap(Bundle.main.builtInPlugInsURL)
        let appex = try XCTUnwrap(Bundle(url: plugins.appendingPathComponent("TadayoShare.appex")))
        let binary = try Data(contentsOf: try XCTUnwrap(appex.executableURL))
        let key = Data("com.apple.security.application-groups".utf8)
        // The group as bytes, whether the build embeds the plist as XML or as DER.
        let value = Data(Self.group.utf8)
        print(
            "keychain-check: TadayoShare carries the key: \(binary.range(of: key) != nil), "
                + "the group: \(binary.range(of: value) != nil)")
        XCTAssertNotNil(binary.range(of: key), "TadayoShare's binary has no app-group entitlement")
        XCTAssertNotNil(binary.range(of: value), "TadayoShare's binary doesn't name \(Self.group)")
    }

    static func message(_ status: OSStatus) -> String {
        SecCopyErrorMessageString(status, nil) as String? ?? "no message"
    }
}
