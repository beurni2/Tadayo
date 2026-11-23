import Foundation

// A club, its people and its invitations, as the API answers them (spec 04, 31, 32; the contract's
// `ClubList`, `ClubDetail`, `Members`, `RosterRevision` and the invitation schemas). These are
// the app's own types: `TadayoAPI` maps the generated ones into them, so no screen depends on the
// generator. They hold what the contract sends and nothing it doesn't: no count of approvals and
// no record of who decided (book p30, T15, T33).

/// Where a club stands (`ClubState`).
public enum ClubState: String, Sendable, Equatable {
    /// Waiting for two people to approve the same roster (spec 04, T7).
    case proposed
    /// Started, though its days may not be confirmed yet.
    case active
    /// Fewer than two members, so no new days (FQ16).
    case paused
    /// Stopped by moderation (spec 22).
    case suspended
}

/// A person in a club, as its members see them, by their membership interval's id: a rejoin is a
/// new id (spec 31, Q06). Never an email address.
public struct Person: Sendable, Equatable, Identifiable {
    public let membershipID: String
    public let displayName: String
    /// The avatar's version, when they have one (FQ74); the image comes from its own route.
    public let avatarVersion: String?

    public var id: String { membershipID }

    public init(membershipID: String, displayName: String, avatarVersion: String?) {
        self.membershipID = membershipID
        self.displayName = displayName
        self.avatarVersion = avatarVersion
    }
}

/// Where a day is, from the server's clock when it answered (`OccurrencePhase`, T1, T5).
public enum OccurrencePhase: String, Sendable, Equatable {
    case collecting
    case open
    case past
    /// Cancelled or suspended, with no reason and nothing in it (T9).
    case unavailable
}

/// One person's day: the star, the exact date in the club's zone, and the two instants the server
/// resolved for it (T2). The app targets its id, never a weekday (spec 05).
public struct Occurrence: Sendable, Equatable, Identifiable {
    public let id: String
    public let clubID: String
    public let star: Person
    public let localDate: LocalDate
    public let revealAt: Date
    public let closeAt: Date
    public let phase: OccurrencePhase

    public init(
        id: String, clubID: String, star: Person, localDate: LocalDate, revealAt: Date,
        closeAt: Date, phase: OccurrencePhase
    ) {
        self.id = id
        self.clubID = clubID
        self.star = star
        self.localDate = localDate
        self.revealAt = revealAt
        self.closeAt = closeAt
        self.phase = phase
    }
}

/// A club by name, with its zone and the caller's own membership in it, so the app knows which
/// person is You (`ClubRef`).
public struct ClubRef: Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    /// The club's IANA zone, fixed when it was made (spec 05, FQ19).
    public let timezone: String
    public let myMembershipID: String

    public init(id: String, name: String, timezone: String, myMembershipID: String) {
        self.id = id
        self.name = name
        self.timezone = timezone
        self.myMembershipID = myMembershipID
    }
}

/// A club the caller is an active member of, for the switcher and the top bar (book p32).
public struct ClubSummary: Sendable, Equatable, Identifiable {
    public let ref: ClubRef
    public let state: ClubState
    /// Active members only, the same number the roster shows (book p24).
    public let memberCount: Int
    /// Present only while a day is open (T5).
    public let openDay: Occurrence?
    public let nextDay: Occurrence?

    public var id: String { ref.id }
    public var name: String { ref.name }

    public init(
        ref: ClubRef, state: ClubState, memberCount: Int, openDay: Occurrence?,
        nextDay: Occurrence?
    ) {
        self.ref = ref
        self.state = state
        self.memberCount = memberCount
        self.openDay = openDay
        self.nextDay = nextDay
    }
}

/// Where an invitation the caller accepted stands (`MyInvitationState`).
public enum MyInvitationState: String, Sendable, Equatable {
    /// Waiting for the members (G03-waiting).
    case waiting
    /// The roster changed and needs accepting again (G02-changed).
    case rosterChanged = "roster_changed"
    /// It didn't go ahead, which never says who declined (G03-declined, book p30).
    case didNotGoAhead = "did_not_go_ahead"
}

/// An invitation the caller accepted, while it waits on the members. No roster, count or progress
/// (book p30, T33).
public struct MyInvitation: Sendable, Equatable, Identifiable {
    public let invitationID: String
    public let clubName: String
    public let inviterName: String
    public let state: MyInvitationState

    public var id: String { invitationID }

    public init(
        invitationID: String, clubName: String, inviterName: String, state: MyInvitationState
    ) {
        self.invitationID = invitationID
        self.clubName = clubName
        self.inviterName = inviterName
        self.state = state
    }
}

/// An accepted invitation as the club list's rows show it (handoff 9's `acceptedInvitations`):
/// the list's record, and whether this phone holds its link for the account, which a changed
/// roster needs to be accepted again ("Open the invitation link to continue." when it doesn't,
/// FQ136). Nothing of the link itself: only that it's held.
public struct AcceptedInvitation: Sendable, Equatable, Identifiable {
    public let invitation: MyInvitation
    public let linkHeld: Bool

    public var id: String { invitation.id }

    public init(_ invitation: MyInvitation, linkHeld: Bool) {
        self.invitation = invitation
        self.linkHeld = linkHeld
    }
}

/// The caller's clubs and the invitations they accepted that haven't become a membership yet, as
/// `GET /v1/clubs` answers.
public struct ClubList: Sendable, Equatable {
    public let serverClock: ServerClock
    public let clubs: [ClubSummary]
    public let invitations: [MyInvitation]

    /// No club and no invitation waiting on its members (G06-no-club).
    public var isEmpty: Bool { clubs.isEmpty && invitations.isEmpty }

    public init(serverClock: ServerClock, clubs: [ClubSummary], invitations: [MyInvitation]) {
        self.serverClock = serverClock
        self.clubs = clubs
        self.invitations = invitations
    }
}

/// Club information (G05-club-details), as `GET /v1/clubs/{club_id}` and `POST /v1/clubs`
/// answer.
public struct ClubDetail: Sendable, Equatable {
    public let serverClock: ServerClock
    public let club: ClubSummary
    /// What a proposal sends as `expected_roster_version`. It never moves on an approval or an
    /// acceptance, so it counts neither (T33).
    public let rosterVersion: Int
    /// Whether the caller may propose people now: false at six, or when the club can't take one
    /// (A01, T6, book p24).
    public let canPropose: Bool
    public let openRevisionID: String?

    public init(
        serverClock: ServerClock, club: ClubSummary, rosterVersion: Int, canPropose: Bool,
        openRevisionID: String?
    ) {
        self.serverClock = serverClock
        self.club = club
        self.rosterVersion = rosterVersion
        self.canPropose = canPropose
        self.openRevisionID = openRevisionID
    }
}

/// One active member in Club information's members list (G05-members) and Friends (F01).
public struct Member: Sendable, Equatable, Identifiable {
    public let person: Person
    /// The server's stable roster order, never a ranking (spec 09).
    public let position: Int
    /// The colour of this member's folded cards, 1 to 6 (FQ41).
    public let cover: Int?
    /// The next day to open for them, absent while they have none (T49).
    public let nextDay: Occurrence?
    /// The member whose day opens first.
    public let nextUp: Bool

    public var id: String { person.membershipID }

    public init(person: Person, position: Int, cover: Int?, nextDay: Occurrence?, nextUp: Bool) {
        self.person = person
        self.position = position
        self.cover = cover
        self.nextDay = nextDay
        self.nextUp = nextUp
    }
}

/// The club's roster with each member's next day, and its open revision if there is one, as
/// `GET /v1/clubs/{club_id}/members` answers. Every member gets the same list (T55).
public struct MemberList: Sendable, Equatable {
    public let serverClock: ServerClock
    public let club: ClubRef
    /// In the server's `position` order.
    public let members: [Member]
    public let openRevision: RosterRevision?

    public init(
        serverClock: ServerClock, club: ClubRef, members: [Member], openRevision: RosterRevision?
    ) {
        self.serverClock = serverClock
        self.club = club
        self.members = members
        self.openRevision = openRevision
    }
}

/// A day that can be someone's day, Monday to Saturday: Sunday never is (spec 05, T6). Ordered
/// Monday first, as the club's week reads.
public enum Weekday: String, Sendable, Equatable, CaseIterable, Comparable {
    case monday, tuesday, wednesday, thursday, friday, saturday

    public static func < (lhs: Weekday, rhs: Weekday) -> Bool {
        lhs.calendarWeekday < rhs.calendarWeekday
    }

    /// The Gregorian calendar's number for it: Sunday is 1, so Monday is 2.
    public var calendarWeekday: Int {
        switch self {
        case .monday: 2
        case .tuesday: 3
        case .wednesday: 4
        case .thursday: 5
        case .friday: 6
        case .saturday: 7
        }
    }
}

/// One weekday and whose day it is (`ScheduleAssignment`).
public struct WeekdayAssignment: Sendable, Equatable {
    public let weekday: Weekday
    public let person: Person

    public init(weekday: Weekday, person: Person) {
        self.weekday = weekday
        self.person = person
    }
}

/// The club's week in force today, `getSchedule`'s `current`: each member's weekday or two
/// (spec 05's table). No assignment when the answer has no `current`: nobody's day is confirmed
/// yet, or nobody's is left. Only `current` is read here; the open proposal is B2's.
public struct ClubWeek: Sendable, Equatable {
    public let serverClock: ServerClock
    public let club: ClubRef
    public let assignments: [WeekdayAssignment]

    public init(serverClock: ServerClock, club: ClubRef, assignments: [WeekdayAssignment]) {
        self.serverClock = serverClock
        self.club = club
        self.assignments = assignments
    }
}

/// The hours a club's day opens and closes, which the screens name ("7 AM to 1 AM the next
/// morning"): 7 AM on the day, in the club's zone, to 1 AM the next morning (spec 06). The server
/// decides each day's `reveal_at` and `close_at` (T1); these are only the words.
public enum ClubHours {
    public static let opening = 7
    public static let closing = 1
}

/// Where a roster revision stands (`RosterRevisionState`).
public enum RosterRevisionState: String, Sendable, Equatable {
    /// Waiting for approvals and acceptances.
    case open
    /// Its candidates who accepted have joined.
    case applied
    /// A member declined (book p30).
    case didNotGoAhead = "did_not_go_ahead"
    /// A newer revision replaced it, and its approvals no longer count (T7).
    case superseded
}

/// The caller's own decision on a revision, never anyone else's (`RosterDecision`).
public enum RosterDecision: String, Sendable, Equatable {
    case pending
    case approved
    case declined
}

/// Where a candidate's latest link stands, for its proposer only (`CandidateLinkState`).
public enum CandidateLinkState: String, Sendable, Equatable {
    /// It works and hasn't been used.
    case live
    /// The candidate accepted this revision with it.
    case accepted
    /// The candidate accepted an earlier revision with it and hasn't accepted this one yet. The
    /// server refuses Revoke link and Create new link for it.
    case used
    /// Link revoked, with Create new link.
    case revoked
    /// It expired before anyone used it (FQ71).
    case expired
}

/// A candidate's latest link, by its id, state and expiry, never its token (T7, FQ77). Only for
/// the member who proposed the candidate.
public struct CandidateInvitation: Sendable, Equatable, Identifiable {
    public let id: String
    public let state: CandidateLinkState
    public let expiresAt: Date

    public init(id: String, state: CandidateLinkState, expiresAt: Date) {
        self.id = id
        self.state = state
        self.expiresAt = expiresAt
    }
}

/// Someone proposed in a revision, by the one name the revision shows: the proposer's label, or
/// the candidate's own profile name in a revision the server made for it (FQ66).
public struct Candidate: Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let proposedBy: Person
    /// Present only for the member who proposed them.
    public let invitation: CandidateInvitation?

    public init(id: String, name: String, proposedBy: Person, invitation: CandidateInvitation?) {
        self.id = id
        self.name = name
        self.proposedBy = proposedBy
        self.invitation = invitation
    }
}

/// An exact proposed roster (G03-approve, G05-members-proposed, G01-invite-people): the members
/// and the candidates. It never says how others decided, how many approved, or who hasn't (book
/// p30, T15, T33): its `version` moves only when its own `state` does.
public struct RosterRevision: Sendable, Equatable, Identifiable {
    public let id: String
    /// What approving, declining and accepting send as `expected_version`.
    public let version: Int
    public let club: ClubRef
    public let state: RosterRevisionState
    /// The member who proposed it; in one the server made for a name, the candidate's proposer,
    /// whose link was used (FQ84).
    public let proposedBy: Person
    public let members: [Person]
    public let candidates: [Candidate]
    public let myDecision: RosterDecision
    public let supersededBy: String?

    public init(
        id: String, version: Int, club: ClubRef, state: RosterRevisionState, proposedBy: Person,
        members: [Person], candidates: [Candidate], myDecision: RosterDecision,
        supersededBy: String?
    ) {
        self.id = id
        self.version = version
        self.club = club
        self.state = state
        self.proposedBy = proposedBy
        self.members = members
        self.candidates = candidates
        self.myDecision = myDecision
        self.supersededBy = supersededBy
    }
}

/// An invitation's single-use token (`InvitationToken`), read from a link's fragment,
/// `https://tadayo.app/i#<token>`, and sent only in a request body: never in a path, a query, a
/// log, an analytics event or a snapshot (T7, T52). Nothing it prints, reflects or dumps holds
/// the token.
public struct InvitationToken: Sendable, Hashable, CustomStringConvertible,
    CustomDebugStringConvertible, CustomReflectable
{
    /// The token itself, for a request body and the per-account store alone.
    public let secret: String

    /// Nil unless `secret` is 43 to 128 base64url characters, as the contract allows.
    public init?(secret: String) {
        guard (43...128).contains(secret.utf8.count),
            secret.utf8.allSatisfy({ Self.base64URL.contains($0) })
        else { return nil }
        self.secret = secret
    }

    /// The token of an invitation link, `https://tadayo.app/i#<token>` and nothing else, read as
    /// characters, not through a URL parser: no other host or spelling of it (no escape, no port,
    /// not even an empty one, no user), no other path or query, and the token alone after `#`.
    /// Two leniencies, both for a link a person pastes or a system hands over: the spaces and line
    /// breaks around it are ignored, and the scheme and host may be in any case, as URLs allow
    /// (`HTTPS://Tadayo.App`); the path `/i` and the token are exact.
    public init?(link: String) {
        let text = Array(link.trimmingCharacters(in: .whitespacesAndNewlines).utf8)
        let origin = Array("https://tadayo.app".utf8)
        let path = Array("/i#".utf8)
        guard text.count > origin.count + path.count,
            text[..<origin.count].map(Self.lowercased) == origin,
            Array(text[origin.count..<(origin.count + path.count)]) == path
        else { return nil }
        // A byte that isn't UTF-8 decodes to U+FFFD, which `init(secret:)` refuses.
        self.init(secret: String(decoding: text[(origin.count + path.count)...], as: UTF8.self))
    }

    /// The token of a link the system opened (a universal link) or a person pasted.
    public init?(url: URL) {
        self.init(link: url.absoluteString)
    }

    public var description: String { "InvitationToken" }
    public var debugDescription: String { "InvitationToken" }
    public var customMirror: Mirror { Mirror(self, children: [:]) }

    private static func lowercased(_ byte: UInt8) -> UInt8 {
        (UInt8(ascii: "A")...UInt8(ascii: "Z")).contains(byte) ? byte + 32 : byte
    }

    private static let base64URL: Set<UInt8> = Set(
        Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".utf8))
}

/// The link to share for one candidate, which reaches its proposer once (FQ77). A retry with the
/// same key answers the same link without its URL. Nothing it prints holds the URL, whose
/// fragment is the token (T7, T52).
public struct InvitationLink: Sendable, Equatable, CustomStringConvertible,
    CustomDebugStringConvertible, CustomReflectable
{
    public let invitationID: String
    public let candidateID: String
    /// The link with its token, absent on a retry's answer.
    public let url: URL?
    public let expiresAt: Date

    public init(invitationID: String, candidateID: String, url: URL?, expiresAt: Date) {
        self.invitationID = invitationID
        self.candidateID = candidateID
        self.url = url
        self.expiresAt = expiresAt
    }

    public var description: String { "InvitationLink(\(invitationID))" }
    public var debugDescription: String { description }
    public var customMirror: Mirror {
        Mirror(self, children: ["invitationID": invitationID, "candidateID": candidateID])
    }
}

/// One name on the roster an invitation proposes: a member's, another candidate's, or the caller
/// once as You. Names only, never a photograph before joining (FQ47, T7).
public struct InvitationRosterEntry: Sendable, Equatable {
    public enum Kind: String, Sendable, Equatable {
        case member
        case candidate
    }

    public let name: String
    public let kind: Kind
    public let isYou: Bool

    public init(name: String, kind: Kind, isYou: Bool) {
        self.name = name
        self.kind = kind
        self.isYou = isYou
    }
}

/// An invitation with its exact roster: what G02-invitation, G02-changed and G03-waiting show,
/// and what accepting sends back. It grants nothing: no captions, photographs, dates, schedule or
/// progress (T7, Q05).
public struct InvitationRoster: Sendable, Equatable {
    public let invitationID: String
    public let inviterName: String
    public let clubName: String
    public let revisionID: String
    /// What accepting sends as `expected_version`.
    public let revisionVersion: Int
    public let roster: [InvitationRosterEntry]
    /// Absent once the caller has accepted (G03-waiting).
    public let expiresAt: Date?

    public init(
        invitationID: String, inviterName: String, clubName: String, revisionID: String,
        revisionVersion: Int, roster: [InvitationRosterEntry], expiresAt: Date?
    ) {
        self.invitationID = invitationID
        self.inviterName = inviterName
        self.clubName = clubName
        self.revisionID = revisionID
        self.revisionVersion = revisionVersion
        self.roster = roster
        self.expiresAt = expiresAt
    }
}

/// What an invitation shows the signed-in person holding it (`InvitationPreview`, spec 04, T7).
/// A link that's unknown, revoked, replaced or used by another account is no preview at all but
/// `APIFailure.notFound`, the same for every one of those (T14).
public enum InvitationPreview: Sendable, Equatable {
    /// G02-invitation.
    case open(InvitationRoster)
    /// The caller accepted an earlier roster and a newer one replaced it, or the server made one
    /// for the caller's own name (G02-changed, FQ66).
    case changed(InvitationRoster)
    /// The caller has accepted and waits for the members (G03-waiting).
    case waiting(InvitationRoster)
    /// It expired while still live (G02-expired): only who to ask.
    case expired(inviterName: String)
    /// The club already has six (G02-full): only who to ask.
    case full(inviterName: String)
    /// For someone who accepted, it didn't go ahead (G03-declined): who invited them, as the club
    /// last knew them, and never which, or who declined.
    case didNotGoAhead(inviterName: String)
    /// The caller is already a member: the app opens the club.
    case joined(ClubRef)
}

/// What accepting the exact roster did (`InvitationAcceptance`).
public enum InvitationAcceptance: Sendable, Equatable {
    /// The membership started (T8, Q06).
    case joined(ClubRef?)
    /// The members haven't all approved yet (G03-waiting).
    case waiting
    /// The account's name isn't the one the revision showed, so the server made a new revision
    /// with it: preview the token again and accept that one (G02-changed, FQ66).
    case changed
}

/// The club calls, as `TadayoAPI` makes them. Each command takes the key made when its action
/// started, sent again with the same body on every retry (T19).
public protocol ClubService: Sendable {
    /// `POST /v1/clubs`: a club with its name and the device's zone, fixed from then on (FQ19).
    func createClub(name: String, timezone: TimeZone, key: IdempotencyKey) async throws(APIFailure)
        -> ClubDetail
    /// `GET /v1/clubs/{club_id}`.
    func club(_ clubID: String) async throws(APIFailure) -> ClubDetail
    /// `GET /v1/clubs/{club_id}/members`.
    func members(of clubID: String) async throws(APIFailure) -> MemberList
    /// `GET /v1/clubs/{club_id}/schedule`, its `current` alone.
    func schedule(of clubID: String) async throws(APIFailure) -> ClubWeek
    /// `POST /v1/clubs/{club_id}/roster`: a new revision with these names added.
    func propose(
        _ names: [String], in clubID: String, expectedRosterVersion: Int, key: IdempotencyKey
    ) async throws(APIFailure) -> RosterRevision
    /// `POST /v1/clubs/{club_id}/invitations`: a link for one candidate the caller proposed.
    func createInvitation(for candidateID: String, in clubID: String, key: IdempotencyKey)
        async throws(APIFailure) -> InvitationLink
    /// `DELETE /v1/invitations/{invitation_id}`.
    func revokeInvitation(_ invitationID: String) async throws(APIFailure)
    /// `GET /v1/rosters/{revision_id}`.
    func rosterRevision(_ revisionID: String) async throws(APIFailure) -> RosterRevision
    /// `POST /v1/rosters/{revision_id}/approvals`.
    func approve(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
        async throws(APIFailure) -> RosterRevision
    /// `POST /v1/rosters/{revision_id}/declines`.
    func decline(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
        async throws(APIFailure) -> RosterRevision
    /// `POST /v1/invitations/preview`, the token in the body.
    func preview(_ token: InvitationToken) async throws(APIFailure) -> InvitationPreview
    /// `POST /v1/invitations/accept`, the token in the body with the revision the caller saw.
    func accept(
        _ token: InvitationToken, revisionID: String, expectedVersion: Int, key: IdempotencyKey
    ) async throws(APIFailure) -> InvitationAcceptance
}

/// What a club's row in the switcher says under its name (G06-switcher, G06-switcher-status,
/// G06-switcher-unavailable; `docs/plans/ios-b1-clubs-root.md` section 1). The app puts it in
/// words.
public enum SwitcherLine: Sendable, Equatable {
    /// A club that hasn't started: "Not started" (`handoff5.switcher.notStarted`).
    case notStarted
    /// "Paused" (`handoff5.switcher.paused`).
    case paused
    /// A suspended club: "Unavailable" and nothing else of it (`handoff5.switcher.unavailable`,
    /// T9).
    case unavailable
    /// An active club whose day is open: "6 people · Debby’s Friday", as `G06-switcher` draws
    /// it, the date in the club's zone.
    case open(people: Int, star: String, date: LocalDate)
    /// An active club with a day to come: "5 people · Next: Maya"
    /// (`handoff6.switcher.active.row`).
    case next(people: Int, star: String)
    /// An active club with no confirmed day: the count alone (handoff 6's C-02).
    case people(Int)
}

extension ClubSummary {
    /// Its line in the switcher: its state's word, or for an active club its count of members
    /// and its open or next day.
    public var switcherLine: SwitcherLine {
        switch state {
        case .proposed: .notStarted
        case .paused: .paused
        case .suspended: .unavailable
        case .active:
            if let open = openDay {
                .open(people: memberCount, star: open.star.displayName, date: open.localDate)
            } else if let next = nextDay {
                .next(people: memberCount, star: next.star.displayName)
            } else {
                .people(memberCount)
            }
        }
    }
}
