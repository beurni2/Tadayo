import Foundation
import Security
import TadayoCore

/// The signed-in session, in the keychain item the app and its share extension share
/// (docs/TECH-DESIGN.md section 4): one generic password per environment, in the access group
/// `group.app.tadayo`, readable after the first unlock, on this device only, never synchronised.
/// It holds the tokens and their expiry, nothing else: no address, ever (spec 23).
///
/// The app group is also the keychain access group, with no keychain-access-groups entitlement
/// (Apple, "Sharing access to keychain items among a collection of apps"), but it's never the
/// default access group, so every query names it. The check branch `ios/b0-keychain-check`
/// proved this on an unsigned simulator build (run 42168818665).
///
/// Both targets compile this file; the share extension reads the session from B4.
struct KeychainSessionStore: SessionStore {
    static let accessGroup = "group.app.tadayo"

    /// The item's service; the environment (`dev`, `prod`) is its account, so a dev session is
    /// never read by a prod build on the same phone.
    let service: String
    let environment: String

    init(environment: String, service: String = "app.tadayo.session") {
        self.environment = environment
        self.service = service
    }

    func load() throws -> AuthSession? {
        var query = item
        query[kSecReturnData] = true
        query[kSecMatchLimit] = kSecMatchLimitOne
        var found: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &found)
        switch status {
        case errSecSuccess:
            guard let data = found as? Data,
                let session = try? JSONDecoder().decode(AuthSession.self, from: data)
            else { throw KeychainFailure(status: errSecDecode) }
            return session
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainFailure(status: status)
        }
    }

    /// Writes over the item, or adds it when there's none: never a delete then an add, so there's
    /// no moment with no session.
    func save(_ session: AuthSession) throws {
        guard let data = try? JSONEncoder().encode(session) else {
            throw KeychainFailure(status: errSecParam)
        }
        let update: [CFString: Any] = [
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemUpdate(item as CFDictionary, update as CFDictionary)
        switch status {
        case errSecSuccess:
            return
        case errSecItemNotFound:
            var added = item
            added.merge(update) { $1 }
            let addStatus = SecItemAdd(added as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw KeychainFailure(status: addStatus) }
        default:
            throw KeychainFailure(status: status)
        }
    }

    /// Forgets the session. Nothing stored is already forgotten (`errSecItemNotFound`).
    func delete() throws {
        let status = SecItemDelete(item as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainFailure(status: status)
        }
    }

    /// What finds the item: its class, service, account and access group, never synchronised.
    private var item: [CFString: Any] {
        [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: environment,
            kSecAttrAccessGroup: Self.accessGroup,
            kSecAttrSynchronizable: false,
        ]
    }
}

/// A keychain call that failed: its status and nothing else, so no token reaches a log (T52).
struct KeychainFailure: Error, Equatable, CustomStringConvertible {
    let status: OSStatus

    var description: String { "Keychain status \(status)" }
}
