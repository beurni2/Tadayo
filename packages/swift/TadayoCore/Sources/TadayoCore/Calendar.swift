import Foundation

// Stage B2's types for a club's days (docs/plans/ios-b2-calendar.md section 4, PR 2): Home, from
// `getHome`, and the club's week with its open proposal, from `getSchedule`, which the day picker
// changes through `chooseScheduleDays` and `confirmScheduleDays`. Each holds only what a B2 screen
// shows (T55's other side): nothing of a drop before the feed is built (B5; T10), and no cover
// before the media route reaches the app (B3; T12).

/// Home for one club (`getHome`; spec 08, 32): the server derives it at read time from its own
/// clock (T1, T5), so the app shows the mode it's given and decides nothing from the device's
/// clock. Lost access is a not-found, never a mode (T14).
public struct ClubHome: Sendable, Equatable {
    public let serverClock: ServerClock
    public let club: ClubRef
    /// The club's local date today, in its zone (`club_today`), for Sunday's Home (H01-sunday).
    public let clubToday: LocalDate
    public let mode: Mode

    /// The contract's six modes, chosen by the server in this order: unavailable,
    /// awaiting_activation, day, waiting, paused, no_days. Each past day is its occurrence alone
    /// (a `DayLink` without its cover), newest first, and only a day with something the caller
    /// can read is listed.
    public enum Mode: Sendable, Equatable {
        /// The club is suspended: neutral, with no reason (spec 22).
        case unavailable
        /// The club hasn't started (spec 04, 08).
        case awaitingActivation
        /// A day is open: Home is that day (T5). `next` is the club's next day to open, if any.
        case day(OpenDay, next: Occurrence?, recentDays: [Occurrence])
        /// No day is open: the next one, its exact date and its countdown from `server_now`.
        case waiting(next: Occurrence, recentDays: [Occurrence])
        /// Fewer than two members: no new days until someone joins (FQ16).
        case paused(recentDays: [Occurrence])
        /// Active, with no confirmed day yet; it never invents a date (T49).
        case noDays
    }

    public init(serverClock: ServerClock, club: ClubRef, clubToday: LocalDate, mode: Mode) {
        self.serverClock = serverClock
        self.club = club
        self.clubToday = clubToday
        self.mode = mode
    }
}

/// The open day on Home (`HomeDay.day`, a `RevealedDay`), as far as B2 reads it: which day, the
/// caller's place in it, where an add from it goes, and whether its page holds any card. No field
/// of a drop is read into it: the feed is B5's (T10's other side).
public struct OpenDay: Sendable, Equatable {
    public let occurrence: Occurrence
    /// `viewer.is_star`: the caller's own day ("Your Monday").
    public let isStar: Bool
    /// `viewer.joined_later`: the caller's membership began after the day started collecting, so
    /// the day may be partly visible to them (spec 07), said without any number.
    public let joinedLater: Bool
    /// `add_target`: the occurrence an add from this page goes to, if any (T4).
    public let addTarget: Occurrence?
    /// Whether the page holds any card: a drop on its first page, or a page after it. An empty
    /// page is the quiet day (H01-quiet).
    public let holdsCards: Bool

    public init(
        occurrence: Occurrence, isStar: Bool, joinedLater: Bool, addTarget: Occurrence?,
        holdsCards: Bool
    ) {
        self.occurrence = occurrence
        self.isStar = isStar
        self.joinedLater = joinedLater
        self.addTarget = addTarget
        self.holdsCards = holdsCards
    }
}

/// `getSchedule` whole: the club's week in force today (`current`, which Members reads as it did
/// in B1) and the open proposal that includes the caller, if any (spec 05; G04, G05-schedule).
public struct ClubSchedule: Sendable, Equatable {
    public let week: ClubWeek
    public let proposal: ScheduleProposal?

    public init(week: ClubWeek, proposal: ScheduleProposal?) {
        self.week = week
        self.proposal = proposal
    }
}

/// A proposed week each member it includes confirms (`ScheduleProposal`; spec 05, G04): the
/// club's first days (`activation`), or a new member's days (`membership_change`, FQ125 to
/// FQ127). It names a day's owner, and who holds a day nobody has confirmed only where the
/// contract gives that viewer a name (FQ46, FQ48); nothing in it counts anyone or says who hasn't
/// confirmed (T15, T33).
public struct ScheduleProposal: Sendable, Equatable, Identifiable {
    public enum Reason: String, Sendable, Equatable {
        case activation
        case membershipChange = "membership_change"
    }

    /// Where the caller stands in it.
    public enum MyState: String, Sendable, Equatable {
        case choosing
        case confirmed
    }

    /// Where the proposal stands: once it isn't `open`, the picker leaves it.
    public enum State: String, Sendable, Equatable {
        case open
        case applied
        case superseded
    }

    public let id: String
    /// The version a choice or confirmation names (`expected_version`); it moves only with
    /// `state` or a new revision of the proposed week, never on a choice (T33).
    public let version: Int
    public let reason: Reason
    /// How many days each member holds: one or two (spec 05's table).
    public let daysPerMember: Int
    /// Monday to Saturday, one each, in that order; never Sunday (T6).
    public let slots: [ScheduleSlot]
    /// The weekdays the caller holds now, Monday first.
    public let myDays: [Weekday]
    public let myState: MyState
    public let state: State

    public init(
        id: String, version: Int, reason: Reason, daysPerMember: Int, slots: [ScheduleSlot],
        myDays: [Weekday], myState: MyState, state: State
    ) {
        self.id = id
        self.version = version
        self.reason = reason
        self.daysPerMember = daysPerMember
        self.slots = slots
        self.myDays = myDays
        self.myState = myState
        self.state = state
    }
}

/// One weekday of a proposal as the caller sees it (`ScheduleSlot`).
public struct ScheduleSlot: Sendable, Equatable, Identifiable {
    /// `ScheduleSlotState`: the caller's alone or confirmed (`yours`), another member's confirmed
    /// day (`taken`), nobody's or one other member's (`available`), held by the caller with others
    /// (`clash`), or held by others with no reveal until all but one choose another (`no_reveal`).
    public enum State: String, Sendable, Equatable {
        case yours
        case taken
        case available
        case clash
        case noReveal = "no_reveal"
    }

    public let weekday: Weekday
    public let state: State
    /// The member who confirmed a taken day (book p11; FQ78).
    public let owner: Person?
    /// On a clash only, everyone who holds the day, the caller included, in roster order (FQ46);
    /// empty otherwise.
    public let holders: [Person]
    /// On an available day, to a caller still choosing, the one other member who holds it (FQ48).
    public let heldBy: Person?
    /// A confirmed day's first date, only where the server sends one (FQ79, FQ130); the app never
    /// works one out (T49).
    public let firstDate: LocalDate?
    /// Proposed for the caller (spec 05), and still so marked once set aside (FQ48).
    public let suggested: Bool

    public var id: Weekday { weekday }

    public init(
        weekday: Weekday, state: State, owner: Person?, holders: [Person], heldBy: Person?,
        firstDate: LocalDate?, suggested: Bool
    ) {
        self.weekday = weekday
        self.state = state
        self.owner = owner
        self.holders = holders
        self.heldBy = heldBy
        self.firstDate = firstDate
        self.suggested = suggested
    }
}

/// Stage B2's calls for a club's days, as `TadayoAPI` makes them. Apart from `ClubService`, so its
/// stand-ins in the app and the UI tests stay as they are until a screen calls these.
public protocol CalendarService: Sendable {
    /// `GET /v1/clubs/{club_id}/home`.
    func home(of clubID: String) async throws(APIFailure) -> ClubHome
    /// `GET /v1/clubs/{club_id}/schedule`, whole.
    func clubSchedule(of clubID: String) async throws(APIFailure) -> ClubSchedule
    /// `PUT /v1/schedule-proposals/{proposal_id}/choice`: the weekdays the caller holds from now
    /// on, in the version they saw, with the key their tap made (T19).
    func choose(
        _ weekdays: [Weekday], in proposalID: String, expectedVersion: Int, key: IdempotencyKey
    )
        async throws(APIFailure) -> ScheduleProposal
    /// `POST /v1/schedule-proposals/{proposal_id}/confirmation`: exactly the days the caller
    /// holds, named, so a confirmation never confirms a day they didn't see.
    func confirm(
        _ weekdays: [Weekday], in proposalID: String, expectedVersion: Int, key: IdempotencyKey
    ) async throws(APIFailure) -> ScheduleProposal
}
