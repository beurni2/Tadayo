import Foundation

// The invitation links the app keeps for their proposer (ADR-037; the contract's `InvitationLink`
// and `CandidateLinkState`; `docs/plans/ios-b1-create.md` section 1). The server returns a link
// once and keeps only its token's hash, so Share again shares the app's own copy. The copy is
// kept while its candidate's proposal is open, through `live`, `accepted` and `used`, in the
// account's own store on the device, and purged when the candidate joins, when the invitation
// ends, when the server says the link no longer works, and at Leave sign-in (T11). The same file
// keeps the token of each invitation the account accepted, so it can be accepted again once its
// roster changes (the contract's `MyInvitationState`; `docs/plans/ios-b1-invitation.md` section
// 1): kept while the invitation waits on its members, and dropped when it joins or ends, when the
// server says the link no longer works, and at Leave sign-in. Nothing here prints, reflects or
// dumps a link or a token (T7, T52).

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

/// The token of an invitation the account accepted, kept so the account can accept it again after
/// its roster changes (the contract's `MyInvitationState`), with whether the server last made a
/// revision for the account's name (FQ66), which `G02-changed-name` says after a relaunch
/// (`handoff8.nameChanged.explanationAfterRelaunch`).
public struct KeptReceivedInvitation: Sendable, Equatable, Codable, CustomStringConvertible,
    CustomDebugStringConvertible, CustomReflectable
{
    public let invitationID: String
    /// The token itself, for the invitation's calls alone.
    let secret: String
    /// The server answered an acceptance with `changed`, and the account hasn't accepted since.
    public internal(set) var nameChanged: Bool

    init(invitationID: String, secret: String, nameChanged: Bool) {
        self.invitationID = invitationID
        self.secret = secret
        self.nameChanged = nameChanged
    }

    /// The token, or nil if what was kept is no token (a damaged item).
    public var token: InvitationToken? { InvitationToken(secret: secret) }

    public var description: String { "KeptReceivedInvitation(\(invitationID))" }
    public var debugDescription: String { description }
    public var customMirror: Mirror {
        Mirror(self, children: ["invitationID": invitationID, "nameChanged": nameChanged])
    }
}

/// One account's kept links and accepted invitations, as the vault holds them: the account's id,
/// its links and its tokens, nothing else.
public struct InvitationLinkFile: Sendable, Equatable, Codable, CustomStringConvertible,
    CustomDebugStringConvertible, CustomReflectable
{
    public let accountID: String
    public var links: [KeptInvitationLink]
    public var received: [KeptReceivedInvitation]

    public init(
        accountID: String, links: [KeptInvitationLink], received: [KeptReceivedInvitation] = []
    ) {
        self.accountID = accountID
        self.links = links
        self.received = received
    }

    private enum CodingKeys: String, CodingKey {
        case accountID, links, received
    }

    /// A file an earlier build wrote has no `received`: it holds none.
    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        accountID = try container.decode(String.self, forKey: .accountID)
        links = try container.decode([KeptInvitationLink].self, forKey: .links)
        received =
            try container.decodeIfPresent([KeptReceivedInvitation].self, forKey: .received) ?? []
    }

    /// Nothing kept: the vault holds no file for it.
    var isEmpty: Bool { links.isEmpty && received.isEmpty }

    public var description: String { "InvitationLinkFile(\(links.count), \(received.count))" }
    public var debugDescription: String { description }
    public var customMirror: Mirror {
        Mirror(self, children: ["links": links, "received": received])
    }
}

/// One thing the book keeps, for the rules that apply to both.
enum KeptEntry {
    case link(KeptInvitationLink)
    case received(KeptReceivedInvitation)

    /// When it was kept is recorded under this.
    var key: String {
        switch self {
        case .link(let link): "link \(link.invitationID)"
        case .received(let received): "received \(received.invitationID)"
        }
    }
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

/// The rules for the kept links and tokens, over a vault. The app makes one at launch and the
/// setup list's and the invitation's models share it.
///
/// Only a successful answer to a read requested after a link or a token was kept decides on it: a
/// read takes a stamp first (`beginRead()`), and what's kept after that stamp is left alone by its
/// answer, which can't list it yet. What's found in the vault at launch counts as kept before any
/// read of that launch. A failed or offline read is never settled, so it changes nothing.
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
    /// What keeps, reads and revokes decided while the vault couldn't be read, for what it holds
    /// once it is: the account, the stamp, and what it drops.
    private var unread: [(account: String, stamp: UInt64, drop: (KeptEntry) -> Bool)] = []
    /// When each link and token was kept in this launch, by its entry's key.
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
        keptAt[KeptEntry.link(made).key] = clock
        if !loaded {
            // The vault's link for this candidate, or of this invitation, is replaced too, even if
            // this one has gone by the time the vault is read.
            let (candidateID, invitationID) = (link.candidateID, link.invitationID)
            unread.append(
                (
                    accountID, clock,
                    {
                        guard case .link(let old) = $0 else { return false }
                        return (old.clubID == clubID && old.candidateID == candidateID)
                            || old.invitationID == invitationID
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
        purgeLinks(accountID, stamp: Stamp(value: .max)) { $0.invitationID == invitationID }
    }

    /// The server answered a removal of the candidate (FQ148): every link of theirs stops
    /// working, so each kept for them in that club goes at once, whatever a read says later.
    public func dropCandidate(_ candidateID: String, club clubID: String, account accountID: String)
    {
        purgeLinks(accountID, stamp: Stamp(value: .max)) {
            $0.clubID == clubID && $0.candidateID == candidateID
        }
    }

    /// Keeps the token of an invitation this account has accepted, once the server has shown the
    /// token is the account's: a preview's `waiting` or `changed`, or an acceptance's (the
    /// contract's `MyInvitationState`). It replaces a token kept for the same invitation, and the
    /// same token kept under another invitation. `nameChanged` is set by an acceptance's
    /// `changed`, cleared by its `waiting`, and left as it was when nil (a preview). Keeping for
    /// another account than the one whose file is kept starts that account's file in its place
    /// (T11); an empty account or invitation id keeps nothing.
    @discardableResult
    public func keepReceived(
        _ token: InvitationToken, invitation invitationID: String, account accountID: String,
        nameChanged: Bool? = nil
    ) -> KeptReceivedInvitation? {
        guard !accountID.isEmpty, !invitationID.isEmpty else { return nil }
        var kept = linksFile(for: accountID) ?? InvitationLinkFile(accountID: accountID, links: [])
        let secret = token.secret
        let same: (KeptReceivedInvitation) -> Bool = {
            $0.invitationID == invitationID || $0.secret == secret
        }
        let earlier = kept.received.last(where: same)
        kept.received.removeAll(where: same)
        let made = KeptReceivedInvitation(
            invitationID: invitationID, secret: secret,
            nameChanged: nameChanged ?? earlier?.nameChanged ?? false)
        kept.received.append(made)
        clock += 1
        keptAt[KeptEntry.received(made).key] = clock
        if !loaded {
            // The vault's token of this invitation, or this token under another, is replaced too.
            unread.append(
                (
                    accountID, clock,
                    {
                        guard case .received(let old) = $0 else { return false }
                        return same(old)
                    }
                ))
        }
        write(kept)
        return made
    }

    /// The kept invitation whose token this is, if this account's file holds it.
    public func received(_ token: InvitationToken, account accountID: String)
        -> KeptReceivedInvitation?
    {
        linksFile(for: accountID)?.received.first { $0.secret == token.secret }
    }

    /// The kept invitation with this id, if this account's file holds it.
    public func received(invitation invitationID: String, account accountID: String)
        -> KeptReceivedInvitation?
    {
        linksFile(for: accountID)?.received.first { $0.invitationID == invitationID }
    }

    /// The server said the invitation joined or ended, or that its link no longer works
    /// (`joined`, `did_not_go_ahead`, `expired`, `NOT_FOUND`): its token goes at once.
    public func dropReceived(_ token: InvitationToken, account accountID: String) {
        let secret = token.secret
        purgeReceived(accountID, stamp: Stamp(value: .max)) { $0.secret == secret }
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
        purgeLinks(accountID, stamp: stamp) {
            $0.clubID == clubID && !held.contains("\($0.candidateID) \($0.invitationID)")
        }
    }

    /// A not found from `listMembers`, requested at `stamp`: the club is no longer the caller's,
    /// so its links go.
    public func settleGone(club clubID: String, stamp: Stamp, account accountID: String) {
        purgeLinks(accountID, stamp: stamp) { $0.clubID == clubID }
    }

    /// A successful `listClubs` answer, requested at `stamp`: the links of a club it no longer
    /// holds go, and so does the token of each accepted invitation it no longer holds as waiting
    /// on its members or changed (`waiting`, `roster_changed`): it joined, or it ended.
    public func settle(_ list: ClubList, stamp: Stamp, account accountID: String) {
        let clubs = Set(list.clubs.map(\.id))
        let open = Set(
            list.invitations.filter { $0.state == .waiting || $0.state == .rosterChanged }
                .map(\.invitationID))
        purge(accountID, stamp: stamp) {
            switch $0 {
            case .link(let link): !clubs.contains(link.clubID)
            case .received(let received): !open.contains(received.invitationID)
            }
        }
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
        // What a read or a revoke decided meanwhile holds for the vault's links and tokens too.
        if var applied = merged {
            for decision in unread where decision.account == applied.accountID {
                applied.links.removeAll { decides(decision.stamp, decision.drop, .link($0)) }
                applied.received.removeAll {
                    decides(decision.stamp, decision.drop, .received($0))
                }
            }
            merged = applied
        }
        unread = []
        file = merged
        if let merged, merged != stored { persist(merged) }
    }

    /// The vault's file with what this launch kept before it was read: one account's file at a
    /// time, this launch's account's, this launch's link in place of the vault's for the same
    /// candidate or invitation, and this launch's token in place of the vault's for the same
    /// invitation or token.
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
        merged.received.removeAll { old in
            kept.received.contains {
                $0.invitationID == old.invitationID || $0.secret == old.secret
            }
        }
        merged.received += kept.received
        return merged
    }

    private func forgetVault() {
        let deleted = (try? vault.delete()) != nil
        let blanked =
            deleted || (try? vault.save(InvitationLinkFile(accountID: "", links: []))) != nil
        forgetPending = !blanked
    }

    /// Whether `drop`, decided at `stamp`, takes `entry`: only what was kept before it.
    private func decides(
        _ stamp: UInt64, _ drop: (KeptEntry) -> Bool, _ entry: KeptEntry
    ) -> Bool {
        (keptAt[entry.key] ?? 0) < stamp && drop(entry)
    }

    private func purgeLinks(
        _ accountID: String, stamp: Stamp, where drop: @escaping (KeptInvitationLink) -> Bool
    ) {
        purge(accountID, stamp: stamp) {
            guard case .link(let link) = $0 else { return false }
            return drop(link)
        }
    }

    private func purgeReceived(
        _ accountID: String, stamp: Stamp, where drop: @escaping (KeptReceivedInvitation) -> Bool
    ) {
        purge(accountID, stamp: stamp) {
            guard case .received(let received) = $0 else { return false }
            return drop(received)
        }
    }

    /// Drops this account's links and tokens that `drop` picks and that were kept before `stamp`;
    /// while the vault is unread, the decision is kept for what it holds too.
    private func purge(
        _ accountID: String, stamp: Stamp, where drop: @escaping (KeptEntry) -> Bool
    ) {
        let found = linksFile(for: accountID)
        if !loaded, !accountID.isEmpty { unread.append((accountID, stamp.value, drop)) }
        guard var kept = found else { return }
        let before = (kept.links.count, kept.received.count)
        kept.links.removeAll { decides(stamp.value, drop, .link($0)) }
        kept.received.removeAll { decides(stamp.value, drop, .received($0)) }
        guard (kept.links.count, kept.received.count) != before else { return }
        let left = Set(kept.links.map { KeptEntry.link($0).key })
            .union(kept.received.map { KeptEntry.received($0).key })
        for key in Set(keptAt.keys).subtracting(left) {
            keptAt[key] = nil
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
        if kept.isEmpty {
            written = (try? vault.delete()) != nil || (try? vault.save(kept)) != nil
        } else {
            written = (try? vault.save(kept)) != nil
        }
        if written { forgetPending = false }
    }
}
