import Foundation

// The invitation links the app keeps for their proposer (ADR-037; the contract's `InvitationLink`
// and `CandidateLinkState`; `docs/plans/ios-b1-create.md` section 1). The server returns a link
// once and keeps only its token's hash, so Share again shares the app's own copy. The copy is
// kept while its candidate's proposal is open, through `live`, `accepted` and `used`, in the
// account's own store on the device, and purged when the candidate joins, when the invitation
// ends, when the server says the link no longer works, and at Leave sign-in (T11). Nothing here
// prints, reflects or dumps a link (T7, T52).

/// One link the app made, for one candidate of one club.
public struct KeptInvitationLink: Sendable, Equatable, Codable, CustomStringConvertible,
    CustomDebugStringConvertible, CustomReflectable
{
    public let clubID: String
    public let candidateID: String
    public let invitationID: String
    /// The link, its token in the fragment, for the share sheet alone.
    public let url: URL
    /// A share of it completed, a copy included (FQ67): the app's own record, which never means
    /// delivered and which the server never knows.
    public internal(set) var shared: Bool

    public init(clubID: String, candidateID: String, invitationID: String, url: URL, shared: Bool) {
        self.clubID = clubID
        self.candidateID = candidateID
        self.invitationID = invitationID
        self.url = url
        self.shared = shared
    }

    public var description: String { "KeptInvitationLink(\(invitationID))" }
    public var debugDescription: String { description }
    public var customMirror: Mirror {
        Mirror(
            self,
            children: [
                "clubID": clubID, "candidateID": candidateID, "invitationID": invitationID,
                "shared": shared,
            ])
    }
}

/// One account's kept links, as the vault holds them: the account's id and its links, nothing
/// else.
public struct InvitationLinkFile: Sendable, Equatable, Codable, CustomStringConvertible,
    CustomDebugStringConvertible, CustomReflectable
{
    public let accountID: String
    public var links: [KeptInvitationLink]

    public init(accountID: String, links: [KeptInvitationLink]) {
        self.accountID = accountID
        self.links = links
    }

    public var description: String { "InvitationLinkFile(\(links.count))" }
    public var debugDescription: String { description }
    public var customMirror: Mirror { Mirror(self, children: ["links": links]) }
}

/// Where the kept links live between launches: the app's keychain item, or memory in the tests.
/// It holds one account's file at a time.
public protocol InvitationLinkVault: Sendable {
    /// The file kept, or nil when there's none.
    func load() throws -> InvitationLinkFile?
    /// Keeps `file` in place of anything kept before.
    func save(_ file: InvitationLinkFile) throws
    /// Forgets the file. Nothing kept is already forgotten.
    func delete() throws
}

/// A vault in memory: the tests', and the UI tests' stand-in services'.
public final class InMemoryInvitationLinkVault: InvitationLinkVault, @unchecked Sendable {
    private let lock = NSLock()
    private var file: InvitationLinkFile?

    public init(_ file: InvitationLinkFile? = nil) {
        self.file = file
    }

    public func load() throws -> InvitationLinkFile? {
        lock.withLock { file }
    }

    public func save(_ file: InvitationLinkFile) throws {
        lock.withLock { self.file = file }
    }

    public func delete() throws {
        lock.withLock { file = nil }
    }
}

/// The rules for the kept links, over a vault. The app makes one at launch and the setup list's
/// models share it.
///
/// Only a successful answer to a read requested after a link was kept decides on it: a read takes
/// a stamp first (`beginRead()`), and a link kept after that stamp is left alone by its answer,
/// which can't list it yet. Links found in the vault at launch count as kept before any read of
/// that launch. A failed or offline read is never settled, so it changes nothing.
///
/// What's kept is in memory first and then in the vault: a vault that can't save leaves the link
/// for this launch only, and one that can't load reads as nothing kept. Either way the screens
/// then offer what the contract says for a link the app doesn't hold.
@MainActor public final class InvitationLinkBook {
    /// When a read was requested, against when each link was kept.
    public struct Stamp: Sendable, Equatable {
        let value: UInt64
    }

    private let vault: any InvitationLinkVault
    private var file: InvitationLinkFile?
    private var loaded = false
    /// When each link was kept in this launch, by invitation id.
    private var keptAt: [String: UInt64] = [:]
    private var clock: UInt64 = 0

    public init(vault: any InvitationLinkVault) {
        self.vault = vault
    }

    /// Keeps the link the server just returned for a candidate of `clubID`, in place of any link
    /// kept for that candidate before: a new link replaces the old one on the server too (FQ71).
    /// An answer without its link (a retry's replay, T19), or with anything but an invitation link
    /// in its place, keeps nothing. Keeping for another account than the one whose links are kept
    /// starts that account's file in their place: one account's links are never read for another
    /// (T11). An empty account id is nobody's, so it keeps nothing.
    @discardableResult
    public func keep(_ link: InvitationLink, club clubID: String, account accountID: String)
        -> KeptInvitationLink?
    {
        guard !accountID.isEmpty, let url = link.url, InvitationToken(url: url) != nil else {
            return nil
        }
        var kept = linksFile(for: accountID) ?? InvitationLinkFile(accountID: accountID, links: [])
        kept.links.removeAll {
            ($0.clubID == clubID && $0.candidateID == link.candidateID)
                || $0.invitationID == link.invitationID
        }
        let made = KeptInvitationLink(
            clubID: clubID, candidateID: link.candidateID, invitationID: link.invitationID,
            url: url, shared: false)
        kept.links.append(made)
        clock += 1
        keptAt[link.invitationID] = clock
        write(kept)
        return made
    }

    /// The link kept for a candidate of `clubID`, if this account's file holds one.
    public func link(for candidateID: String, club clubID: String, account accountID: String)
        -> KeptInvitationLink?
    {
        linksFile(for: accountID)?.links.first {
            $0.clubID == clubID && $0.candidateID == candidateID
        }
    }

    /// A share of the link completed (FQ67).
    public func markShared(_ invitationID: String, account accountID: String) {
        guard var kept = linksFile(for: accountID),
            let index = kept.links.firstIndex(where: { $0.invitationID == invitationID }),
            !kept.links[index].shared
        else { return }
        kept.links[index].shared = true
        write(kept)
    }

    /// The stamp to take just before requesting a read that will settle the links.
    public func beginRead() -> Stamp {
        clock += 1
        return Stamp(value: clock)
    }

    /// A successful `listMembers` answer, requested at `stamp`: each of its club's links kept
    /// before then stays while the answer's open revision lists a candidate with the link's
    /// candidate id and invitation id, in the state `live`, `accepted` or `used`, and goes
    /// otherwise: the candidate joined, the proposal ended, or the link was revoked, expired or
    /// replaced (the contract's `InvitationLink`).
    public func settle(_ list: MemberList, stamp: Stamp, account accountID: String) {
        let clubID = list.club.id
        var held: Set<String> = []
        for candidate in list.openRevision?.candidates ?? [] {
            guard let invitation = candidate.invitation else { continue }
            switch invitation.state {
            case .live, .accepted, .used:
                held.insert("\(candidate.id) \(invitation.id)")
            case .revoked, .expired:
                break
            }
        }
        purge(accountID, stamp: stamp) {
            $0.clubID == clubID && !held.contains("\($0.candidateID) \($0.invitationID)")
        }
    }

    /// A not found from `listMembers`, requested at `stamp`: the club is no longer the caller's,
    /// so its links go.
    public func settleGone(club clubID: String, stamp: Stamp, account accountID: String) {
        purge(accountID, stamp: stamp) { $0.clubID == clubID }
    }

    /// A successful `listClubs` answer, requested at `stamp`: the links of a club it no longer
    /// holds go.
    public func settle(_ list: ClubList, stamp: Stamp, account accountID: String) {
        let clubs = Set(list.clubs.map(\.id))
        purge(accountID, stamp: stamp) { !clubs.contains($0.clubID) }
    }

    /// Forgets every link, in memory and in the vault: at Leave sign-in, which is both logout and
    /// the way to another account (ADR-037, T11). A vault that can't delete its file is given an
    /// empty one for no account, which no account reads.
    public func forget() {
        file = nil
        loaded = true
        keptAt = [:]
        do {
            try vault.delete()
        } catch {
            try? vault.save(InvitationLinkFile(accountID: "", links: []))
        }
    }

    /// This account's file, loaded from the vault the first time it's needed.
    private func linksFile(for accountID: String) -> InvitationLinkFile? {
        if !loaded {
            file = try? vault.load()
            loaded = true
        }
        guard let file, file.accountID == accountID, !accountID.isEmpty else { return nil }
        return file
    }

    /// Drops this account's links that `drop` picks and that were kept before `stamp`.
    private func purge(
        _ accountID: String, stamp: Stamp, where drop: (KeptInvitationLink) -> Bool
    ) {
        guard var kept = linksFile(for: accountID) else { return }
        let before = kept.links.count
        kept.links.removeAll { (keptAt[$0.invitationID] ?? 0) < stamp.value && drop($0) }
        guard kept.links.count != before else { return }
        for invitationID in Set(keptAt.keys).subtracting(kept.links.map(\.invitationID)) {
            keptAt[invitationID] = nil
        }
        write(kept)
    }

    /// Keeps `kept` in memory, then in the vault; an empty file is no file.
    private func write(_ kept: InvitationLinkFile) {
        file = kept
        loaded = true
        if kept.links.isEmpty {
            do {
                try vault.delete()
            } catch {
                try? vault.save(kept)
            }
        } else {
            try? vault.save(kept)
        }
    }
}
