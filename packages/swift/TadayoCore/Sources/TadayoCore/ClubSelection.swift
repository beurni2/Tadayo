import Foundation

/// Where the app keeps the selected club across relaunches, for one account at a time (spec 03:
/// "The selected club persists across ordinary relaunches"). It holds the account's id and the
/// club's id and nothing else: no name, no token, nothing of the club's content. `RootModel`
/// forgets it whenever it ends a session, and a choice kept for another account is never read
/// for this one (T11).
public protocol ClubSelectionStore: Sendable {
    /// The club `accountID` chose last, or nil when nothing is kept for that account.
    func club(for accountID: String) -> String?
    /// Keeps `clubID` as `accountID`'s choice, in place of anything kept before, for any account.
    func keep(_ clubID: String, for accountID: String)
    /// Forgets whatever is kept.
    func forget()
}

/// The choice kept in memory only: the tests', and the UI tests' stand-in services'.
public final class InMemoryClubSelection: ClubSelectionStore, @unchecked Sendable {
    private let lock = NSLock()
    private var kept: (account: String, club: String)?

    public init(account: String? = nil, club: String? = nil) {
        if let account, let club { kept = (account, club) }
    }

    public func club(for accountID: String) -> String? {
        lock.withLock { kept?.account == accountID ? kept?.club : nil }
    }

    public func keep(_ clubID: String, for accountID: String) {
        lock.withLock { kept = (accountID, clubID) }
    }

    public func forget() {
        lock.withLock { kept = nil }
    }
}

/// The choice kept in the app's own `UserDefaults`, under one key: a dictionary of the account's
/// id and the club's id. Anything else found there, a value of another shape say, reads as
/// nothing kept.
public final class DefaultsClubSelection: ClubSelectionStore, @unchecked Sendable {
    /// The key, in the app's standard defaults.
    public static let key = "selectedClub"

    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func club(for accountID: String) -> String? {
        guard let kept = defaults.dictionary(forKey: Self.key) as? [String: String],
            kept.count == 2, kept["account"] == accountID, let club = kept["club"]
        else { return nil }
        return club
    }

    public func keep(_ clubID: String, for accountID: String) {
        defaults.set(["account": accountID, "club": clubID], forKey: Self.key)
    }

    public func forget() {
        defaults.removeObject(forKey: Self.key)
    }
}
