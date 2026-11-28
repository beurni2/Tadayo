import Foundation
import OpenAPIRuntime
import TadayoCore

/// Stage B1's club calls (docs/plans/ios-b1-clubs.md section 3). Each answer the contract
/// documents becomes `TadayoCore`'s type or an `APIFailure`. An error answer it doesn't is
/// refused: an undocumented error status, an error code the operation doesn't document for that
/// status (as `clubs()` and `update()` refuse one), or an error status whose body this build
/// can't read (`TadayoAPIClient.failure(_:)`); a 401, a 429 and a 5xx keep their own meanings. A
/// success it doesn't is unreadable, since the server may have carried the command out (audit
/// A8): an undocumented 2xx, or content that breaks it (a value this build doesn't know, a date
/// that isn't one, a link that isn't exactly an invitation link, an answer for another candidate
/// or invitation).
extension TadayoAPIClient: ClubService {
    public func createClub(name: String, timezone: TimeZone, key: IdempotencyKey)
        async throws(APIFailure) -> ClubDetail
    {
        try await call { client in
            switch try await client.createClub(
                headers: .init(idempotencyKey: key.description),
                body: .json(.init(name: name, timezone: timezone.identifier)))
            {
            case .created(let answer): return try ClubDetail(answer.body.json, receivedAt: now())
            case .unauthorized: throw APIFailure.signedOut
            case .forbidden(let answer):
                throw Self.failure(try answer.body.json.code, among: [.profileIncomplete])
            case .conflict(let answer):
                throw Self.failure(try answer.body.json.code, among: [])
            case .tooManyRequests: throw APIFailure.unavailable
            case .badRequest: throw APIFailure.refused
            case .undocumented(let status, _): throw Self.failure(status: status)
            }
        }
    }

    public func club(_ clubID: String) async throws(APIFailure) -> ClubDetail {
        try await call { client in
            switch try await client.getClub(path: .init(clubId: clubID)) {
            case .ok(let answer): return try ClubDetail(answer.body.json, receivedAt: now())
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

    public func members(of clubID: String) async throws(APIFailure) -> MemberList {
        try await call { client in
            switch try await client.listMembers(path: .init(clubId: clubID)) {
            case .ok(let answer): return try MemberList(answer.body.json, receivedAt: now())
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

    public func schedule(of clubID: String) async throws(APIFailure) -> ClubWeek {
        let (schedule, receivedAt) = try await scheduleAnswer(of: clubID)
        return try ClubWeek(schedule, receivedAt: receivedAt)
    }

    /// `getSchedule`'s answer and when it came, which `schedule(of:)` reads for the week alone and
    /// `clubSchedule(of:)` whole.
    func scheduleAnswer(of clubID: String) async throws(APIFailure)
        -> (Components.Schemas.Schedule, ContinuousClock.Instant)
    {
        try await call { client in
            switch try await client.getSchedule(path: .init(clubId: clubID)) {
            case .ok(let answer):
                let schedule = try answer.body.json
                // The week of the club asked for, and no other.
                guard schedule.club.id == clubID else { throw APIFailure.unreadable }
                return (schedule, now())
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

    public func propose(
        _ names: [String], in clubID: String, expectedRosterVersion: Int, key: IdempotencyKey
    ) async throws(APIFailure) -> RosterRevision {
        try await call { client in
            switch try await client.proposeRoster(
                path: .init(clubId: clubID), headers: .init(idempotencyKey: key.description),
                body: .json(
                    .init(
                        expectedRosterVersion: expectedRosterVersion,
                        add: names.map { .init(label: $0) })))
            {
            case .created(let answer): return try RosterRevision(answer.body.json)
            case .unauthorized: throw APIFailure.signedOut
            case .forbidden(let answer):
                throw Self.failure(try answer.body.json.code, among: [.profileIncomplete])
            case .notFound: throw APIFailure.notFound
            case .conflict(let answer):
                throw Self.failure(try answer.body.json.code, among: [.versionConflict, .clubFull])
            case .tooManyRequests: throw APIFailure.unavailable
            case .badRequest: throw APIFailure.refused
            case .undocumented(let status, _): throw Self.failure(status: status)
            }
        }
    }

    public func createInvitation(for candidateID: String, in clubID: String, key: IdempotencyKey)
        async throws(APIFailure) -> InvitationLink
    {
        try await call { client in
            switch try await client.createInvitation(
                path: .init(clubId: clubID), headers: .init(idempotencyKey: key.description),
                body: .json(.init(candidateId: candidateID)))
            {
            case .created(let answer):
                let link = try InvitationLink(answer.body.json)
                guard link.candidateID == candidateID else { throw APIFailure.unreadable }
                return link
            case .unauthorized: throw APIFailure.signedOut
            case .forbidden(let answer):
                throw Self.failure(
                    try answer.body.json.code, among: [.profileIncomplete, .notAllowed])
            case .notFound: throw APIFailure.notFound
            case .conflict(let answer):
                throw Self.failure(try answer.body.json.code, among: [])
            case .tooManyRequests: throw APIFailure.unavailable
            case .badRequest: throw APIFailure.refused
            case .undocumented(let status, _): throw Self.failure(status: status)
            }
        }
    }

    public func revokeInvitation(_ invitationID: String) async throws(APIFailure) {
        try await call { client in
            switch try await client.revokeInvitation(path: .init(invitationId: invitationID)) {
            case .ok(let answer):
                guard try answer.body.json.invitationId == invitationID else {
                    throw APIFailure.unreadable
                }
            case .unauthorized: throw APIFailure.signedOut
            case .forbidden(let answer):
                throw Self.failure(
                    try answer.body.json.code, among: [.profileIncomplete, .notAllowed])
            case .notFound: throw APIFailure.notFound
            case .tooManyRequests: throw APIFailure.unavailable
            case .badRequest: throw APIFailure.refused
            case .undocumented(let status, _): throw Self.failure(status: status)
            }
        }
    }

    public func rosterRevision(_ revisionID: String) async throws(APIFailure) -> RosterRevision {
        try await call { client in
            switch try await client.getRosterRevision(path: .init(revisionId: revisionID)) {
            case .ok(let answer): return try RosterRevision(answer.body.json)
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

    public func approve(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
        async throws(APIFailure) -> RosterRevision
    {
        try await call { client in
            switch try await client.approveRoster(
                path: .init(revisionId: revisionID),
                headers: .init(idempotencyKey: key.description),
                body: .json(.init(expectedVersion: expectedVersion)))
            {
            case .ok(let answer): return try RosterRevision(answer.body.json)
            case .unauthorized: throw APIFailure.signedOut
            case .forbidden(let answer):
                throw Self.failure(try answer.body.json.code, among: [.profileIncomplete])
            case .notFound: throw APIFailure.notFound
            case .conflict(let answer):
                throw Self.failure(
                    try answer.body.json.code, among: [.versionConflict, .rosterChanged, .clubFull])
            case .tooManyRequests: throw APIFailure.unavailable
            case .badRequest: throw APIFailure.refused
            case .undocumented(let status, _): throw Self.failure(status: status)
            }
        }
    }

    public func decline(_ revisionID: String, expectedVersion: Int, key: IdempotencyKey)
        async throws(APIFailure) -> RosterRevision
    {
        try await call { client in
            switch try await client.declineRoster(
                path: .init(revisionId: revisionID),
                headers: .init(idempotencyKey: key.description),
                body: .json(.init(expectedVersion: expectedVersion)))
            {
            case .ok(let answer): return try RosterRevision(answer.body.json)
            case .unauthorized: throw APIFailure.signedOut
            case .forbidden(let answer):
                throw Self.failure(try answer.body.json.code, among: [.profileIncomplete])
            case .notFound: throw APIFailure.notFound
            case .conflict(let answer):
                throw Self.failure(
                    try answer.body.json.code, among: [.versionConflict, .rosterChanged])
            case .tooManyRequests: throw APIFailure.unavailable
            case .badRequest: throw APIFailure.refused
            case .undocumented(let status, _): throw Self.failure(status: status)
            }
        }
    }

    public func preview(_ token: InvitationToken) async throws(APIFailure) -> InvitationPreview {
        try await call { client in
            switch try await client.previewInvitation(body: .json(.init(token: token.secret))) {
            case .ok(let answer): return InvitationPreview(try answer.body.json)
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

    public func accept(
        _ token: InvitationToken, revisionID: String, expectedVersion: Int, key: IdempotencyKey
    ) async throws(APIFailure) -> InvitationAcceptance {
        try await call { client in
            switch try await client.acceptInvitation(
                headers: .init(idempotencyKey: key.description),
                body: .json(
                    .init(
                        token: token.secret, revisionId: revisionID,
                        expectedVersion: expectedVersion)))
            {
            case .ok(let answer): return InvitationAcceptance(try answer.body.json)
            case .unauthorized: throw APIFailure.signedOut
            case .forbidden(let answer):
                throw Self.failure(try answer.body.json.code, among: [.profileIncomplete])
            case .notFound: throw APIFailure.notFound
            case .conflict(let answer):
                throw Self.failure(
                    try answer.body.json.code, among: [.versionConflict, .rosterChanged, .clubFull])
            case .gone: throw APIFailure.invitationExpired
            case .tooManyRequests: throw APIFailure.unavailable
            case .badRequest: throw APIFailure.refused
            case .undocumented(let status, _): throw Self.failure(status: status)
            }
        }
    }

    /// The failure an error body's code names, when the operation documents that code for the
    /// answer's status (`packages/contracts/src/operations-clubs.ts`, and `standardErrors` in
    /// `operation.ts`); any other code is refused. `IDEMPOTENCY_CONFLICT`, which every command
    /// documents for a 409 and which means this key went with another body, is never in `codes`,
    /// so it is refused too.
    static func failure(
        _ code: Components.Schemas.ErrorCode, among codes: Set<Components.Schemas.ErrorCode>
    ) -> APIFailure {
        guard codes.contains(code) else { return .refused }
        return switch code {
        case .profileIncomplete: .profileIncomplete
        case .notAllowed: .notAllowed
        case .versionConflict: .versionConflict
        case .rosterChanged: .rosterChanged
        case .membershipChanged: .membershipChanged
        case .clubFull: .clubFull
        default: .refused
        }
    }
}

// MARK: The generated types, as TadayoCore's

extension Person {
    init(_ person: Components.Schemas.Person) {
        self.init(
            membershipID: person.membershipId, displayName: person.displayName,
            avatarVersion: person.avatarVersion)
    }
}

extension Occurrence {
    /// Unreadable when `local_date` isn't a date: the app never guesses a day (T41).
    init(_ day: Components.Schemas.Occurrence) throws(APIFailure) {
        guard let date = LocalDate(iso: day.localDate), let phase = OccurrencePhase(day.phase)
        else { throw .unreadable }
        self.init(
            id: day.id, clubID: day.clubId, star: Person(day.star), localDate: date,
            revealAt: day.revealAt, closeAt: day.closeAt, phase: phase)
    }
}

extension ClubRef {
    init(_ club: Components.Schemas.ClubRef) {
        self.init(
            id: club.id, name: club.name, timezone: club.timezone,
            myMembershipID: club.myMembershipId)
    }
}

extension ClubSummary {
    init(_ club: Components.Schemas.ClubSummary) throws(APIFailure) {
        guard let state = ClubState(club.state) else { throw .unreadable }
        self.init(
            ref: ClubRef(
                id: club.id, name: club.name, timezone: club.timezone,
                myMembershipID: club.myMembershipId),
            state: state, memberCount: club.memberCount,
            openDay: try club.openDay.map { day throws(APIFailure) in try Occurrence(day) },
            nextDay: try club.nextDay.map { day throws(APIFailure) in try Occurrence(day) })
    }
}

extension MyInvitation {
    init(_ invitation: Components.Schemas.MyInvitation) throws(APIFailure) {
        guard let state = MyInvitationState(invitation.state) else { throw .unreadable }
        self.init(
            invitationID: invitation.invitationId, clubName: invitation.clubName,
            inviterName: invitation.inviterName, state: state)
    }
}

extension ClubList {
    init(_ list: Components.Schemas.ClubList, receivedAt: ContinuousClock.Instant)
        throws(APIFailure)
    {
        var clubs: [ClubSummary] = []
        for club in list.clubs { clubs.append(try ClubSummary(club)) }
        var invitations: [MyInvitation] = []
        for invitation in list.invitations { invitations.append(try MyInvitation(invitation)) }
        self.init(
            serverClock: ServerClock(serverNow: list.serverNow, receivedAt: receivedAt),
            clubs: clubs, invitations: invitations)
    }
}

extension ClubDetail {
    init(_ detail: Components.Schemas.ClubDetail, receivedAt: ContinuousClock.Instant)
        throws(APIFailure)
    {
        self.init(
            serverClock: ServerClock(serverNow: detail.serverNow, receivedAt: receivedAt),
            club: try ClubSummary(detail.club), rosterVersion: detail.rosterVersion,
            canPropose: detail.canPropose, openRevisionID: detail.openRevisionId)
    }
}

extension MemberList {
    init(_ list: Components.Schemas.Members, receivedAt: ContinuousClock.Instant)
        throws(APIFailure)
    {
        var members: [Member] = []
        for member in list.members {
            members.append(
                Member(
                    person: Person(member.person), position: member.position, cover: member.cover,
                    nextDay: try member.nextDay.map { day throws(APIFailure) in
                        try Occurrence(day)
                    },
                    nextUp: member.nextUp))
        }
        self.init(
            serverClock: ServerClock(serverNow: list.serverNow, receivedAt: receivedAt),
            club: ClubRef(list.club), members: members.sorted { $0.position < $1.position },
            openRevision: try list.openRevision.map { revision throws(APIFailure) in
                try RosterRevision(revision)
            })
    }
}

extension ClubWeek {
    /// The week in force today, `current`, alone: the open proposal is B2's. No `current`, no
    /// assignment.
    init(_ schedule: Components.Schemas.Schedule, receivedAt: ContinuousClock.Instant)
        throws(APIFailure)
    {
        var assignments: [WeekdayAssignment] = []
        for assignment in schedule.current?.assignments ?? [] {
            guard let weekday = Weekday(rawValue: assignment.weekday.rawValue) else {
                throw .unreadable
            }
            assignments.append(
                WeekdayAssignment(weekday: weekday, person: Person(assignment.person)))
        }
        self.init(
            serverClock: ServerClock(serverNow: schedule.serverNow, receivedAt: receivedAt),
            club: ClubRef(schedule.club), assignments: assignments)
    }
}

extension RosterRevision {
    init(_ revision: Components.Schemas.RosterRevision) throws(APIFailure) {
        guard let state = RosterRevisionState(revision.state),
            let decision = RosterDecision(revision.myDecision)
        else { throw .unreadable }
        var candidates: [Candidate] = []
        for candidate in revision.candidates {
            var invitation: CandidateInvitation?
            if let link = candidate.invitation {
                guard let linkState = CandidateLinkState(link.state) else { throw .unreadable }
                invitation = CandidateInvitation(
                    id: link.id, state: linkState, expiresAt: link.expiresAt)
            }
            candidates.append(
                Candidate(
                    id: candidate.id, name: candidate.name,
                    proposedBy: Person(candidate.proposedBy),
                    invitation: invitation))
        }
        self.init(
            id: revision.id, version: revision.version, club: ClubRef(revision.club),
            state: state, proposedBy: Person(revision.proposedBy),
            members: revision.members.map(Person.init), candidates: candidates,
            myDecision: decision, supersededBy: revision.supersededBy)
    }
}

extension InvitationLink {
    /// Unreadable when the URL isn't exactly an invitation link with a token, character for
    /// character as the contract's pattern has it (`^https://tadayo\.app/i#[A-Za-z0-9_-]{43,128}$`):
    /// the app never stores or shares anything else, not even the leniencies `InvitationToken`
    /// allows a pasted link.
    init(_ link: Components.Schemas.InvitationLink) throws(APIFailure) {
        var url: URL?
        if let text = link.url {
            guard let token = InvitationToken(link: text),
                text == "https://tadayo.app/i#\(token.secret)", let parsed = URL(string: text)
            else { throw .unreadable }
            url = parsed
        }
        self.init(
            invitationID: link.invitationId, candidateID: link.candidateId, url: url,
            expiresAt: link.expiresAt)
    }
}

extension InvitationRosterEntry {
    init(_ entry: Components.Schemas.InvitationRosterEntry) {
        let kind: InvitationRosterEntry.Kind =
            switch entry.kind {
            case .member: .member
            case .candidate: .candidate
            }
        self.init(name: entry.name, kind: kind, isYou: entry.isYou)
    }
}

extension InvitationPreview {
    init(_ preview: Components.Schemas.InvitationPreview) {
        switch preview {
        case .open(let open):
            self = .open(
                InvitationRoster(
                    invitationID: open.invitationId, inviterName: open.inviterName,
                    clubName: open.clubName, revisionID: open.revisionId,
                    revisionVersion: open.revisionVersion,
                    roster: open.roster.map(InvitationRosterEntry.init),
                    expiresAt: open.expiresAt))
        case .changed(let changed):
            self = .changed(
                InvitationRoster(
                    invitationID: changed.invitationId, inviterName: changed.inviterName,
                    clubName: changed.clubName, revisionID: changed.revisionId,
                    revisionVersion: changed.revisionVersion,
                    roster: changed.roster.map(InvitationRosterEntry.init),
                    expiresAt: changed.expiresAt))
        case .waiting(let waiting):
            self = .waiting(
                InvitationRoster(
                    invitationID: waiting.invitationId, inviterName: waiting.inviterName,
                    clubName: waiting.clubName, revisionID: waiting.revisionId,
                    revisionVersion: waiting.revisionVersion,
                    roster: waiting.roster.map(InvitationRosterEntry.init), expiresAt: nil))
        case .expired(let expired): self = .expired(inviterName: expired.inviterName)
        case .full(let full): self = .full(inviterName: full.inviterName)
        case .didNotGoAhead(let ended): self = .didNotGoAhead(inviterName: ended.inviterName)
        case .joined(let joined): self = .joined(ClubRef(joined.club))
        }
    }
}

extension InvitationAcceptance {
    init(_ acceptance: Components.Schemas.InvitationAcceptance) {
        switch acceptance.state {
        case .joined: self = .joined(acceptance.club.map(ClubRef.init))
        case .waiting: self = .waiting
        case .changed: self = .changed
        }
    }
}

// MARK: The contract's enumerations, by their values

// Each maps a generated value to `TadayoCore`'s by its raw value, nil for one `TadayoCore` doesn't
// know yet (the lanes' agreement: the app learns a value before the server sends it).
// `ClubCallsTests.everyValueTheContractNamesHasItsOwnCase` maps every case of each, so a contract
// that adds a value fails the Swift tests until `TadayoCore` learns it.

extension ClubState {
    init?(_ state: Components.Schemas.ClubState) { self.init(rawValue: state.rawValue) }
}

extension OccurrencePhase {
    init?(_ phase: Components.Schemas.OccurrencePhase) { self.init(rawValue: phase.rawValue) }
}

extension MyInvitationState {
    init?(_ state: Components.Schemas.MyInvitationState) { self.init(rawValue: state.rawValue) }
}

extension RosterRevisionState {
    init?(_ state: Components.Schemas.RosterRevisionState) {
        self.init(rawValue: state.rawValue)
    }
}

extension RosterDecision {
    init?(_ decision: Components.Schemas.RosterDecision) { self.init(rawValue: decision.rawValue) }
}

extension CandidateLinkState {
    init?(_ state: Components.Schemas.CandidateLinkState) { self.init(rawValue: state.rawValue) }
}
