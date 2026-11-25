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
    /// The app's item's service; tests use their own.
    static let appService = "app.tadayo.session"
    /// The service of the app's item of invitation links (`KeychainInvitationLinkVault`, ADR-037),
    /// which an earlier install's forgetting deletes too.
    static let invitationsService = "app.tadayo.invitations"

    /// The item's service; the environment (`dev`, `prod`) is its account, so a dev session is
    /// never read by a prod build on the same phone.
    let service: String
    let environment: String

    init(environment: String, service: String = appService) {
        self.environment = environment
        self.service = service
    }

    /// The session kept, or nil. Bytes that don't decode never will, so they throw
    /// `UnusableSession`, which reads as no session; any other refusal (`KeychainFailure`: before
    /// the first unlock after a restart, since the item is readable only after it, or a signing
    /// fault's -34018) ends nothing (FQ89).
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
            else { throw UnusableSession() }
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
        var item = Self.items(of: service)
        item[kSecAttrAccount] = environment
        return item
    }

    /// Every environment's item of `service`.
    private static func items(of service: String) -> [CFString: Any] {
        [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccessGroup: accessGroup,
            kSecAttrSynchronizable: false,
        ]
    }

    /// Forgets the session an earlier install left (FQ87), and the invitation links it kept
    /// (ADR-037 counts a reinstall as a phone that no longer holds them). iOS keeps keychain
    /// items when an app is deleted, but deletes the app group's container once the last app of
    /// the group goes, so a mark in that container tells a first launch after an install from any
    /// other. With no mark, every environment's item of `service` and of `invitationsService` is
    /// deleted, and the mark is then written: the next person to install Tadayo on a phone isn't
    /// signed in as the last, and holds none of the last one's links. Whatever reads the session
    /// calls this first: the app at launch, and the share extension from B4.
    ///
    /// With no container (an app group missing from the build), the items are deleted and no
    /// mark is written, so a session is never kept: it fails closed. A delete that fails writes
    /// no mark either, so the next launch tries again.
    static func forgetEarlierInstall(
        markedIn container: URL?, service: String = appService,
        invitationsService: String = KeychainSessionStore.invitationsService
    ) {
        let mark = container?.appending(path: installMark, directoryHint: .notDirectory)
        if let mark, FileManager.default.fileExists(atPath: mark.path(percentEncoded: false)) {
            return
        }
        // Every service's delete is tried, even after one fails.
        let statuses = [service, invitationsService].map {
            SecItemDelete(items(of: $0) as CFDictionary)
        }
        let forgotten = statuses.allSatisfy { $0 == errSecSuccess || $0 == errSecItemNotFound }
        guard forgotten, let mark else { return }
        try? Data().write(
            to: mark, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    /// The mark's file name in the app group's container.
    static let installMark = "installed"
}

/// A keychain call that failed: its status and nothing else, so no token reaches a log (T52).
struct KeychainFailure: Error, Equatable, CustomStringConvertible {
    let status: OSStatus

    var description: String { "Keychain status \(status)" }
}
