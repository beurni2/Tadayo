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
    /// The file kept, or nil when there's none, or when what's kept can't be decoded by this build
    /// (it's then deleted, so the next write starts afresh). It throws only when the file can't be read now,
    /// a locked iPhone's keychain above all, and may be read later.
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
/// for this launch only. One that can't load (a locked iPhone, since the item is readable only
/// while it's unlocked) reads as nothing kept, has nothing written over it, and is read again at
/// the next access, where what this launch kept meanwhile joins its links. Either way the screens
/// then offer what the contract says for a link the app doesn't hold.
@MainActor public final class InvitationLinkBook {
    /// When a read was requested, against when each link was kept.
    public struct Stamp: Sendable, Equatable {
        let value: UInt64
    }

    private let vault: any InvitationLinkVault
    /// This launch's links: the vault's, once read, with what this launch kept.
    private var file: InvitationLinkFile?
    /// The vault's file has been read into `file`, or forgotten. Until then nothing is written to
    /// the vault, so links it holds but couldn't give are never written over.
    private var loaded = false
    /// A forget that could neither delete the vault's file nor leave an empty one in its place:
    /// the next access tries again before anything else.
    private var forgetPending = false
    /// What keeps, reads and revokes decided while the vault couldn't be read, for its links once
    /// it is: the account, the stamp, and the links it drops.
    private var unread: [(account: String, stamp: UInt64, drop: (KeptInvitationLink) -> Bool)] = []
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
        if !loaded {
            // The vault's link for this candidate, or of this invitation, is replaced too, even if
            // this one has gone by the time the vault is read.
            let (candidateID, invitationID) = (link.candidateID, link.invitationID)
            unread.append(
                (
                    accountID, clock,
                    {
                        ($0.clubID == clubID && $0.candidateID == candidateID)
                            || $0.invitationID == invitationID
                    }
                ))
        }
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

    /// The server answered a revoke of the link: it no longer works, so it goes at once
    /// (ADR-037), whatever a read says later.
    public func drop(_ invitationID: String, account accountID: String) {
        purge(accountID, stamp: Stamp(value: .max)) { $0.invitationID == invitationID }
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
    /// empty one for no account, which no account reads; one that can do neither is tried again at
    /// the next access.
    public func forget() {
        file = nil
        loaded = true
        keptAt = [:]
        unread = []
        forgetVault()
    }

    /// This account's file, with the vault read once it can be.
    private func linksFile(for accountID: String) -> InvitationLinkFile? {
        readVault()
        guard let file, file.accountID == accountID, !accountID.isEmpty else { return nil }
        return file
    }

    /// Finishes a forget that couldn't, then reads the vault if it hasn't been read: what this
    /// launch kept before then joins the vault's links and is written back.
    private func readVault() {
        if forgetPending { forgetVault() }
        guard !loaded else { return }
        let stored: InvitationLinkFile?
        do {
            stored = try vault.load()
        } catch {
            return
        }
        loaded = true
        var merged = Self.merge(stored, file)
        // What a read or a revoke decided meanwhile holds for the vault's links too.
        if var applied = merged {
            for decision in unread where decision.account == applied.accountID {
                applied.links.removeAll {
                    (keptAt[$0.invitationID] ?? 0) < decision.stamp && decision.drop($0)
                }
            }
            merged = applied
        }
        unread = []
        file = merged
        if let merged, merged != stored { persist(merged) }
    }

    /// The vault's file with what this launch kept before it was read: one account's links at a
    /// time, this launch's account's, and this launch's link in place of the vault's for the same
    /// candidate or invitation.
    private static func merge(_ stored: InvitationLinkFile?, _ kept: InvitationLinkFile?)
        -> InvitationLinkFile?
    {
        guard let kept else { return stored }
        guard var merged = stored, merged.accountID == kept.accountID else { return kept }
        merged.links.removeAll { old in
            kept.links.contains {
                ($0.clubID == old.clubID && $0.candidateID == old.candidateID)
                    || $0.invitationID == old.invitationID
            }
        }
        merged.links += kept.links
        return merged
    }

    private func forgetVault() {
        let deleted = (try? vault.delete()) != nil
        let blanked =
            deleted || (try? vault.save(InvitationLinkFile(accountID: "", links: []))) != nil
        forgetPending = !blanked
    }

    /// Drops this account's links that `drop` picks and that were kept before `stamp`; while the
    /// vault is unread, the decision is kept for its links too.
    private func purge(
        _ accountID: String, stamp: Stamp, where drop: @escaping (KeptInvitationLink) -> Bool
    ) {
        let found = linksFile(for: accountID)
        if !loaded, !accountID.isEmpty { unread.append((accountID, stamp.value, drop)) }
        guard var kept = found else { return }
        let before = kept.links.count
        kept.links.removeAll { (keptAt[$0.invitationID] ?? 0) < stamp.value && drop($0) }
        guard kept.links.count != before else { return }
        for invitationID in Set(keptAt.keys).subtracting(kept.links.map(\.invitationID)) {
            keptAt[invitationID] = nil
        }
        write(kept)
    }

    /// Keeps `kept` in memory, then in the vault once it has been read.
    private func write(_ kept: InvitationLinkFile) {
        file = kept
        guard loaded else { return }
        persist(kept)
    }

    /// Writes `kept` to the vault; an empty file is no file. Either replaces what a forget couldn't
    /// delete.
    private func persist(_ kept: InvitationLinkFile) {
        let written: Bool
        if kept.links.isEmpty {
            written = (try? vault.delete()) != nil || (try? vault.save(kept)) != nil
        } else {
            written = (try? vault.save(kept)) != nil
        }
        if written { forgetPending = false }
    }
}
