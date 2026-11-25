import Foundation

/// The signed-in account, as `GET /v1/me` answers (spec 23). It never holds the address: the
/// account id comes from the API, never from the access token, which carries the address.
public struct Account: Sendable, Equatable {
    public let id: String
    public let displayName: String?
    public let avatarVersion: String?
    public let ageConfirmed: Bool
    /// What an edit sends as `expected_version` (T19).
    public let version: Int

    public init(
        id: String, displayName: String?, avatarVersion: String?, ageConfirmed: Bool,
        version: Int
    ) {
        self.id = id
        self.displayName = displayName
        self.avatarVersion = avatarVersion
        self.ageConfirmed = ageConfirmed
        self.version = version
    }
}

/// One change to the account, sent by `PATCH /v1/me`. Each is its own action with its own key
/// (T19): the age first, then the name (handoff 1: "records eligibility before profile").
public enum AccountChange: Sendable, Equatable {
    /// The one confirmation that the person is 18 or older (FQ13).
    case confirmAge(expectedVersion: Int)
    /// A name, already trimmed.
    case name(String, expectedVersion: Int)
}

/// Why an API call failed, in the terms the screens need. It carries no body, header or token,
/// so nothing it says can hold an address or a name (T52).
public enum APIFailure: Error, Sendable, Equatable {
    /// No answer came back.
    case network
    /// No valid session (`UNAUTHENTICATED` after the one refresh, or the session ended): sign in
    /// again.
    case signedOut
    /// `PROFILE_INCOMPLETE`: the account must confirm its age and give a name first.
    case profileIncomplete
    /// `VERSION_CONFLICT`: what the person saw changed first (the account, a club's roster or a
    /// roster revision); read it again.
    case versionConflict
    /// `NOT_FOUND`: the same answer whatever the reason, so it tells nobody whether the thing
    /// exists (T14). For an invitation link: unknown, revoked, replaced, or used by another
    /// account.
    case notFound
    /// `NOT_ALLOWED`: the caller may not do this, as making a new link for, or revoking, a link
    /// already used to accept.
    case notAllowed
    /// `ROSTER_CHANGED`: a newer roster replaced the one the person saw; read it again.
    case rosterChanged
    /// `CLUB_FULL`: the club already has six.
    case clubFull
    /// `INVITATION_EXPIRED`: the link expired before it was used.
    case invitationExpired
    /// The server is busy or failing (429, 5xx): try again later.
    case unavailable
    /// A refusal: an error status the caller has no case of its own for, whether the contract
    /// documents it, doesn't list it, or sends a body this build can't read with it. Nothing was
    /// carried out, so a command's next tap is a new action.
    case refused
    /// An answer this build couldn't read: a success the contract doesn't list, a body or header
    /// that doesn't match it (a value the contract added after this build, among them), or one
    /// that doesn't answer what was asked; or a call that ended with no answer the network's
    /// failure doesn't cover (the transport's `noResponse`, say), where whether the request
    /// reached the server can't be told. The server may have carried a command out, so, as for
    /// `unavailable`, its retry sends the same key (T19; audit A8).
    case unreadable
}

/// The account's calls to the API, as `TadayoAPI` makes them.
public protocol AccountService: Sendable {
    func me() async throws(APIFailure) -> Account
    func update(_ change: AccountChange, key: IdempotencyKey) async throws(APIFailure) -> Account
    func clubs() async throws(APIFailure) -> ClubList
}
