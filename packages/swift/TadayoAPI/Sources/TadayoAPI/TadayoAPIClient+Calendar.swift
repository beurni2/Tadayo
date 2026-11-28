import Foundation
import OpenAPIRuntime
import TadayoCore

/// Stage B2's calls for a club's days (docs/plans/ios-b2-calendar.md section 4, PR 2), read as
/// B1's club calls are (`TadayoAPIClient+Clubs.swift`): each answer the contract documents becomes
/// `TadayoCore`'s type or an `APIFailure`; an error answer it doesn't is refused, and a success it
/// doesn't is unreadable, since the server may have carried a choice or a confirmation out (audit
/// A8): an undocumented 2xx, or content that breaks it (a value this build doesn't know, a date
/// that isn't one, a proposal without its six weekdays, a name on a day the contract gives none,
/// the caller's days other than the days the slots say they hold), or that doesn't answer what was
/// asked (another club, another proposal, other days than those sent).
extension TadayoAPIClient: CalendarService {
    public func home(of clubID: String) async throws(APIFailure) -> ClubHome {
        try await call { client in
            switch try await client.getHome(path: .init(clubId: clubID)) {
            case .ok(let answer):
                let home = try ClubHome(answer.body.json, receivedAt: now())
                guard home.club.id == clubID else { throw APIFailure.unreadable }
                return home
            case .unauthorized: throw APIFailure.signedOut
            case .forbidden(let answer):
                throw Self.failure(try answer.body.json.code, among: [.profileIncomplete])
            case .notFound: throw APIFailure.notFound
            case .tooManyRequests: throw APIFailure.unavailable
            case .badRequest: throw APIFailure.refused
            case .undocumented(let status, _): throw Self.failure(status: status)
            }
        }
    }

    public func clubSchedule(of clubID: String) async throws(APIFailure) -> ClubSchedule {
        let (schedule, receivedAt) = try await scheduleAnswer(of: clubID)
        return ClubSchedule(
            week: try ClubWeek(schedule, receivedAt: receivedAt),
            proposal: try schedule.proposal.map { proposal throws(APIFailure) in
                try ScheduleProposal(proposal)
            })
    }

    public func choose(
        _ weekdays: [Weekday], in proposalID: String, expectedVersion: Int, key: IdempotencyKey
    ) async throws(APIFailure) -> ScheduleProposal {
        try await call { client in
            switch try await client.chooseScheduleDays(
                path: .init(proposalId: proposalID),
                headers: .init(idempotencyKey: key.description),
                body: .json(
                    .init(expectedVersion: expectedVersion, weekdays: weekdays.map(\.contract))))
            {
            case .ok(let answer):
                return try ScheduleProposal(
                    answer.body.json, answering: proposalID, holding: weekdays, as: .choosing)
            case .unauthorized: throw APIFailure.signedOut
            case .forbidden(let answer):
                throw Self.failure(
                    try answer.body.json.code, among: [.profileIncomplete, .notAllowed])
            case .notFound: throw APIFailure.notFound
            case .conflict(let answer):
                throw Self.failure(
                    try answer.body.json.code, among: [.versionConflict, .membershipChanged])
            case .tooManyRequests: throw APIFailure.unavailable
            case .badRequest: throw APIFailure.refused
            case .undocumented(let status, _): throw Self.failure(status: status)
            }
        }
    }

    public func confirm(
        _ weekdays: [Weekday], in proposalID: String, expectedVersion: Int, key: IdempotencyKey
    ) async throws(APIFailure) -> ScheduleProposal {
        try await call { client in
            switch try await client.confirmScheduleDays(
                path: .init(proposalId: proposalID),
                headers: .init(idempotencyKey: key.description),
                body: .json(
                    .init(expectedVersion: expectedVersion, weekdays: weekdays.map(\.contract))))
            {
            case .ok(let answer):
                return try ScheduleProposal(
                    answer.body.json, answering: proposalID, holding: weekdays, as: .confirmed)
            case .unauthorized: throw APIFailure.signedOut
            case .forbidden(let answer):
                throw Self.failure(
                    try answer.body.json.code, among: [.profileIncomplete, .notAllowed])
            case .notFound: throw APIFailure.notFound
            case .conflict(let answer):
                throw Self.failure(
                    try answer.body.json.code, among: [.versionConflict, .membershipChanged])
            case .tooManyRequests: throw APIFailure.unavailable
            case .badRequest: throw APIFailure.refused
            case .undocumented(let status, _): throw Self.failure(status: status)
            }
        }
    }
}

// MARK: The generated types, as TadayoCore's

extension ClubHome {
    /// The club is checked by `home(of:)`, which knows which club was asked for.
    init(_ home: Components.Schemas.Home, receivedAt: ContinuousClock.Instant) throws(APIFailure) {
        let serverNow: Date
        let club: Components.Schemas.ClubRef
        let clubToday: String
        let mode: Mode
        switch home {
        case .unavailable(let home):
            (serverNow, club, clubToday, mode) = (
                home.serverNow, home.club, home.clubToday, .unavailable
            )
        case .awaitingActivation(let home):
            (serverNow, club, clubToday, mode) = (
                home.serverNow, home.club, home.clubToday, .awaitingActivation
            )
        case .day(let home):
            (serverNow, club, clubToday) = (home.serverNow, home.club, home.clubToday)
            mode = .day(
                try ClubHome.OpenDay(home.day),
                next: try home.next.map { day throws(APIFailure) in try Occurrence(day) },
                recentDays: try Self.days(home.recentDays))
        case .waiting(let home):
            (serverNow, club, clubToday) = (home.serverNow, home.club, home.clubToday)
            mode = .waiting(
                next: try Occurrence(home.next), recentDays: try Self.days(home.recentDays))
        case .paused(let home):
            (serverNow, club, clubToday) = (home.serverNow, home.club, home.clubToday)
            mode = .paused(recentDays: try Self.days(home.recentDays))
        case .noDays(let home):
            (serverNow, club, clubToday, mode) = (
                home.serverNow, home.club, home.clubToday, .noDays
            )
        }
        guard let today = LocalDate(iso: clubToday) else { throw .unreadable }
        self.init(
            serverClock: ServerClock(serverNow: serverNow, receivedAt: receivedAt),
            club: ClubRef(club), clubToday: today, mode: mode)
    }

    /// Each past day's occurrence; its cover (`cover_drop_id`) waits for the media route (B3).
    private static func days(_ links: [Components.Schemas.DayLink]) throws(APIFailure)
        -> [Occurrence]
    {
        var days: [Occurrence] = []
        for link in links { days.append(try Occurrence(link.occurrence)) }
        return days
    }
}

extension ClubHome.OpenDay {
    /// The day's frame alone: its drops and highlights are read only for whether the page holds
    /// any card, and nothing of them is kept (B5 builds the feed).
    init(_ day: Components.Schemas.RevealedDay) throws(APIFailure) {
        self.init(
            occurrence: try Occurrence(day.occurrence), isStar: day.viewer.isStar,
            joinedLater: day.viewer.joinedLater,
            addTarget: try day.addTarget.map { day throws(APIFailure) in try Occurrence(day) },
            holdsCards: !day.drops.isEmpty || day.nextCursor != nil)
    }
}

extension ScheduleProposal {
    /// Unreadable unless it holds Monday to Saturday once each, with one or two days each, and the
    /// caller's days are exactly the slots they hold (`yours` or `clash`, `ScheduleSlotState`), no
    /// more of them than that; its slots and the caller's days come Monday first. A choice or a
    /// confirmation answers with the proposal it was sent to (`MEMBERSHIP_CHANGED` names a newer
    /// one), holding exactly the days sent, the caller choosing after a choice and confirmed after
    /// a confirmation; anything else is unreadable.
    init(
        _ proposal: Components.Schemas.ScheduleProposal,
        answering proposalID: String? = nil, holding sent: [Weekday]? = nil,
        as expected: MyState? = nil
    ) throws(APIFailure) {
        guard let reason = Reason(rawValue: proposal.reason.rawValue),
            let myState = MyState(rawValue: proposal.myState.rawValue),
            let state = State(rawValue: proposal.state.rawValue),
            (1...2).contains(proposal.daysPerMember)
        else { throw .unreadable }
        var slots: [ScheduleSlot] = []
        for slot in proposal.slots { slots.append(try ScheduleSlot(slot)) }
        slots.sort { $0.weekday < $1.weekday }
        guard slots.map(\.weekday) == Weekday.allCases else { throw .unreadable }
        var myDays: [Weekday] = []
        for day in proposal.myDays {
            guard let weekday = Weekday(rawValue: day.rawValue) else { throw .unreadable }
            myDays.append(weekday)
        }
        let held = slots.filter { $0.state == .yours || $0.state == .clash }.map(\.weekday)
        // The slots' weekdays are distinct, so this also refuses a day held twice.
        guard myDays.count <= proposal.daysPerMember, myDays.sorted() == held else {
            throw .unreadable
        }
        guard proposalID == nil || proposal.id == proposalID,
            sent == nil || Set(sent ?? []) == Set(myDays),
            expected == nil || expected == myState
        else { throw .unreadable }
        self.init(
            id: proposal.id, version: proposal.version, reason: reason,
            daysPerMember: proposal.daysPerMember, slots: slots, myDays: myDays.sorted(),
            myState: myState, state: state)
    }
}

extension ScheduleSlot {
    init(_ slot: Components.Schemas.ScheduleSlot) throws(APIFailure) {
        guard let weekday = Weekday(rawValue: slot.weekday.rawValue),
            let state = State(rawValue: slot.state.rawValue)
        else { throw .unreadable }
        // A name only where the contract gives one (FQ46, FQ48): the owner of a taken day, the
        // holders of a clash, the one other holder of an available day.
        guard slot.owner == nil || state == .taken,
            slot.holders == nil || state == .clash,
            slot.heldBy == nil || state == .available
        else { throw .unreadable }
        var firstDate: LocalDate?
        if let date = slot.firstDate {
            guard let read = LocalDate(iso: date) else { throw .unreadable }
            firstDate = read
        }
        self.init(
            weekday: weekday, state: state, owner: slot.owner.map(Person.init),
            holders: (slot.holders ?? []).map(Person.init), heldBy: slot.heldBy.map(Person.init),
            firstDate: firstDate, suggested: slot.suggested)
    }
}

extension Weekday {
    /// The contract's weekday, which has the same six values.
    var contract: Components.Schemas.Weekday {
        switch self {
        case .monday: .monday
        case .tuesday: .tuesday
        case .wednesday: .wednesday
        case .thursday: .thursday
        case .friday: .friday
        case .saturday: .saturday
        }
    }
}
