import Foundation
import Security
import TadayoCore

/// The invitation links the app keeps for their proposer (ADR-037; `docs/plans/ios-b1-create.md`
/// section 1), and the tokens of invitations the account accepted (the contract's
/// `MyInvitationState`; `docs/plans/ios-b1-invitation.md` section 1), in one keychain item: a
/// generic password whose service is `app.tadayo.invitations` and whose account is the build's
/// environment, in the access group `group.app.tadayo` that the session's item already proves on
/// an unsigned simulator build (`KeychainSessionStore`), readable only while the iPhone is
/// unlocked, on this device only, never synchronised. Its data is one account's id, its links and
/// its accepted invitations' tokens, as JSON: no address, no name. The share extension's code
/// never reads it, though the access group, which the extension shares for the session, would let
/// it. A read while the iPhone is locked fails, and the book reads it again at its next access,
/// writing nothing over it meanwhile.
///
/// `InvitationLinkBook` forgets it at Leave sign-in (`AppGraph`'s `left`), and
/// `KeychainSessionStore.forgetEarlierInstall` after a reinstall. A failure carries its status
/// and nothing else (`KeychainFailure`, T52).
struct KeychainInvitationLinkVault: InvitationLinkVault {
    /// The item's service; tests use their own.
    let service: String
    /// The environment (`dev`, `prod`) is the item's account, so a dev build's links are never
    /// read by a prod build on the same phone.
    let environment: String

    init(environment: String, service: String = KeychainSessionStore.invitationsService) {
        self.environment = environment
        self.service = service
    }

    /// The vault for the build's environment (`TadayoEnvironment`); nil with none.
    init?(info: [String: Any], service: String = KeychainSessionStore.invitationsService) {
        guard let environment = info["TadayoEnvironment"] as? String, !environment.isEmpty
        else { return nil }
        self.init(environment: environment, service: service)
    }

    /// The file kept; nil with none, or with one this build can't decode, which is deleted.
    func load() throws -> InvitationLinkFile? {
        var query = item
        query[kSecReturnData] = true
        query[kSecMatchLimit] = kSecMatchLimitOne
        var found: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &found)
        switch status {
        case errSecSuccess:
            // An item this build can't decode (bad data, or a shape it doesn't know, a later or an
            // earlier build's) is no item: it's deleted, so it holds no token and the next write
            // starts afresh, losing links, ADR-037's safe direction; so a later change to the
            // file's shape only adds optional fields. Only a failure to read it now, a locked
            // iPhone's, is thrown, to be tried again.
            guard let data = found as? Data,
                let file = try? JSONDecoder().decode(InvitationLinkFile.self, from: data)
            else {
                try delete()
                return nil
            }
            return file
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainFailure(status: status)
        }
    }

    /// Writes over the item, or adds it when there's none.
    func save(_ file: InvitationLinkFile) throws {
        guard let data = try? JSONEncoder().encode(file) else {
            throw KeychainFailure(status: errSecParam)
        }
        let update: [CFString: Any] = [
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
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

    /// Forgets the item. Nothing stored is already forgotten (`errSecItemNotFound`).
    func delete() throws {
        let status = SecItemDelete(item as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainFailure(status: status)
        }
    }

    private var item: [CFString: Any] {
        [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: environment,
            kSecAttrAccessGroup: KeychainSessionStore.accessGroup,
            kSecAttrSynchronizable: false,
        ]
    }
}
