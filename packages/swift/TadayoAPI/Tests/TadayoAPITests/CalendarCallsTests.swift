import Foundation
import HTTPTypes
import OpenAPIRuntime
import TadayoCore
import Testing

@testable import TadayoAPI

/// Stage B2's calls for a club's days (docs/plans/ios-b2-calendar.md section 4, PR 2), each
/// against the contract's own examples: Home's six modes, the club's week with its proposal, and
/// the day picker's two commands, with every documented answer mapped, a not-found kept neutral
/// (T14), one key for every retry (T19), and nothing of a drop read into Home (T10's other side).
@Suite struct CalendarCallsTests {
    // Thursday 5 November 2026, 3:00 AM UTC, as the device's clock reads it.
    let start = Date(timeIntervalSince1970: 1_793_847_600)

    func api(_ transport: CannedTransport, auth: RefreshingAuth = RefreshingAuth())
        -> TadayoAPIClient
    {
        TadayoAPIClient.testing(transport, auth: auth, at: start)
    }

    func example(_ name: String) -> CannedTransport.Answer { .json(200, example: name) }

    func instant(_ text: String) -> Date { try! Date(text, strategy: .iso8601) }

    func date(_ year: Int, _ month: Int, _ day: Int) -> LocalDate {
        LocalDate(year: year, month: month, day: day)!
    }

    func home(_ name: String) async throws -> ClubHome {
        try await api(CannedTransport([example(name)])).home(of: "club_sunday_people")
    }

    func schedule(_ name: String) async throws -> ClubSchedule {
        try await api(CannedTransport([example(name)])).clubSchedule(of: "club_sunday_people")
    }

    /// Each slot as "weekday state", with its names, first date and suggestion when it has them.
    func lines(_ proposal: ScheduleProposal?) -> [String] {
        (proposal?.slots ?? []).map { slot in
            var line = "\(slot.weekday.rawValue) \(slot.state.rawValue)"
            if let owner = slot.owner { line += " owner \(owner.displayName)" }
            if !slot.holders.isEmpty {
                line += " holders " + slot.holders.map(\.displayName).joined(separator: "/")
            }
            if let heldBy = slot.heldBy { line += " held by \(heldBy.displayName)" }
            if let first = slot.firstDate { line += " from \(first)" }
            if slot.suggested { line += " suggested" }
            return line
        }
    }

    // MARK: Home

    @Test func anOpenDayIsHomeWithItsFrameAndNothingOfItsDrops() async throws {
        let transport = CannedTransport([example("getHome.open")])
        let home = try await api(transport).home(of: "club_sunday_people")
        #expect(transport.sent.first?.request.method == .get)
        #expect(transport.sent.first?.request.path == "/v1/clubs/club_sunday_people/home")
        #expect(home.serverClock.serverNow == instant("2026-11-06T14:41:00Z"))
        #expect(home.club.id == "club_sunday_people")
        #expect(home.club.timezone == "America/New_York")
        #expect(home.clubToday == date(2026, 11, 6))
        guard case .day(let day, let next, let recent) = home.mode else {
            Issue.record("\(home.mode)")
            return
        }
        #expect(day.occurrence.id == "occ_sp_debby_2026_11_06")
        #expect(day.occurrence.star.displayName == "Debby")
        #expect(day.occurrence.phase == .open)
        #expect(!day.isStar)
        #expect(!day.joinedLater)
        #expect(day.addTarget?.id == "occ_sp_debby_2026_11_13")
        #expect(day.addTarget?.localDate == date(2026, 11, 13))
        #expect(day.holdsCards)
        #expect(next?.id == "occ_sp_nina_2026_11_07")
        #expect(recent.map(\.id) == ["occ_sp_sam_2026_11_05", "occ_sp_debby_2026_10_30"])
        #expect(recent.map(\.phase) == [.past, .past])
    }

    @Test func theOpenDayKeepsItsFrameAlone() {
        // T10's other side and T55's: before B5 builds the feed, no field of a drop, its
        // highlights or its covers is read into the day, only whether the page holds a card.
        let day = OpenDay(
            occurrence: Occurrence(
                id: "occ", clubID: "club",
                star: Person(membershipID: "mem", displayName: "Debby", avatarVersion: nil),
                localDate: date(2026, 11, 6), revealAt: start, closeAt: start, phase: .open),
            isStar: false, joinedLater: false, addTarget: nil, holdsCards: false)
        #expect(
            Mirror(reflecting: day).children.compactMap(\.label) == [
                "occurrence", "isStar", "joinedLater", "addTarget", "holdsCards",
            ])
    }

    @Test func aDayWithNoCardIsQuiet() async throws {
        let quiet = try await home("getHome.quiet")
        guard case .day(let day, let next, let recent) = quiet.mode else {
            Issue.record("\(quiet.mode)")
            return
        }
        #expect(!day.holdsCards)
        #expect(next?.star.displayName == "Nina")
        #expect(recent.count == 2)

        let joined = try await home("getHome.first_drop")
        guard case .day(let day, _, let recent) = joined.mode else {
            Issue.record("\(joined.mode)")
            return
        }
        #expect(day.joinedLater)
        #expect(!day.isStar)
        #expect(!day.holdsCards)
        #expect(recent.isEmpty)
    }

    @Test func aPageWhoseCardsComeLaterHoldsCards() async throws {
        let answer = ContractExample.json("getHome.quiet").replacingOccurrences(
            of: #""drops":[]"#, with: #""drops":[],"next_cursor":"cur_later""#)
        #expect(answer != ContractExample.json("getHome.quiet"))
        let home = try await api(CannedTransport([.json(200, answer)]))
            .home(of: "club_sunday_people")
        guard case .day(let day, _, _) = home.mode else {
            Issue.record("\(home.mode)")
            return
        }
        #expect(day.holdsCards)
    }

    @Test func theStarsOwnDaySaysSo() async throws {
        let home = try await home("getHome.your_day")
        guard case .day(let day, let next, _) = home.mode else {
            Issue.record("\(home.mode)")
            return
        }
        #expect(day.isStar)
        #expect(day.occurrence.star.displayName == "Ben")
        #expect(day.addTarget?.id == "occ_sp_ben_2026_11_16")
        #expect(next?.star.displayName == "Maya")
    }

    @Test func waitingHasTheNextDayAndThePastOnes() async throws {
        let waiting = try await home("getHome.waiting")
        #expect(waiting.serverClock.serverNow == instant("2026-11-06T06:41:00Z"))
        guard case .waiting(let next, let recent) = waiting.mode else {
            Issue.record("\(waiting.mode)")
            return
        }
        #expect(next.id == "occ_sp_debby_2026_11_06")
        #expect(next.phase == .collecting)
        #expect(next.revealAt == instant("2026-11-06T12:00:00Z"))
        #expect(recent.map(\.star.displayName) == ["Sam", "Debby"])

        let afterClose = try await home("getHome.after_close")
        guard case .waiting(let next, let recent) = afterClose.mode else {
            Issue.record("\(afterClose.mode)")
            return
        }
        #expect(afterClose.clubToday == date(2026, 11, 7))
        #expect(next.star.displayName == "Nina")
        #expect(recent.first?.id == "occ_sp_debby_2026_11_06")

        let sunday = try await home("getHome.sunday")
        guard case .waiting(let next, let recent) = sunday.mode else {
            Issue.record("\(sunday.mode)")
            return
        }
        #expect(sunday.clubToday == date(2026, 11, 8))
        #expect(next.localDate == date(2026, 11, 9))
        #expect(
            recent.map(\.star.displayName) == ["Nina", "Debby", "Sam", "Alex", "Maya", "Ben"])
    }

    @Test func eachOtherModeIsItsOwn() async throws {
        #expect(try await home("getHome.awaiting_activation").mode == .awaitingActivation)
        #expect(try await home("getHome.no_days").mode == .noDays)
        #expect(try await home("getHome.unavailable").mode == .unavailable)
        let paused = try await home("getHome.paused")
        guard case .paused(let recent) = paused.mode else {
            Issue.record("\(paused.mode)")
            return
        }
        #expect(paused.club.name == "Kitchen table")
        #expect(recent.map(\.id) == ["occ_kt_ben_2026_11_02"])
    }

    // MARK: The club's week and its proposal

    @Test func aNewMembersWeekCarriesTheClubsDaysAndTheirPick() async throws {
        // The contract's Kitchen table (Ben, Alex, Sam, Nina and Maya, with Leila new) isn't the
        // book's, which handoffs 10 and 11 draw; the screens' fixtures keep the book's.
        let transport = CannedTransport([example("getSchedule.new_member")])
        let schedule = try await api(transport).clubSchedule(of: "club_kitchen_table")
        #expect(transport.sent.first?.request.method == .get)
        #expect(transport.sent.first?.request.path == "/v1/clubs/club_kitchen_table/schedule")
        #expect(schedule.week.serverClock.serverNow == instant("2026-11-06T14:41:00Z"))
        #expect(
            schedule.week.assignments.map(\.weekday) == [
                .monday, .tuesday, .wednesday, .thursday, .saturday,
            ])
        let proposal = try #require(schedule.proposal)
        #expect(proposal.id == "spr_kt_2")
        #expect(proposal.version == 1)
        #expect(proposal.reason == .membershipChange)
        #expect(proposal.daysPerMember == 1)
        #expect(proposal.myDays == [.friday])
        #expect(proposal.myState == .choosing)
        #expect(proposal.state == .open)
        // Nothing has a date until the new member confirms (T49; FQ130).
        #expect(
            lines(proposal) == [
                "monday taken owner Ben", "tuesday taken owner Alex",
                "wednesday taken owner Sam", "thursday taken owner Nina",
                "friday yours suggested", "saturday taken owner Maya",
            ])
    }

    @Test func aContestNamesItsHoldersToThemAlone() async throws {
        let three = try await schedule("getSchedule.conflict_three")
        #expect(three.week.assignments.isEmpty)
        let proposal = try #require(three.proposal)
        #expect(proposal.reason == .activation)
        #expect(
            lines(proposal) == [
                "monday available suggested", "tuesday available held by Maya",
                "wednesday available", "thursday available held by Sam",
                "friday clash holders Ben/Alex/Debby", "saturday available held by Nina",
            ])
        #expect(
            lines(try await schedule("getSchedule.confirm_refused").proposal) == [
                "monday available", "tuesday available held by Maya",
                "wednesday available held by Alex", "thursday available held by Sam",
                "friday clash holders Ben/Debby suggested", "saturday available held by Nina",
            ])
        // A contest the caller isn't in names nobody (FQ46).
        #expect(
            lines(try await schedule("getSchedule.contested_other").proposal) == [
                "monday available", "tuesday available held by Maya", "wednesday available",
                "thursday yours suggested", "friday no_reveal", "saturday available held by Nina",
            ])
    }

    @Test func theFirstDaysShowEachConfirmedDayFromItsFirstDate() async throws {
        let choosing = try await schedule("getSchedule.first_days")
        #expect(
            choosing.week.assignments.map(\.person.displayName) == ["Maya", "Alex", "Sam", "Nina"])
        #expect(
            lines(choosing.proposal) == [
                "monday yours suggested", "tuesday taken owner Maya from 2026-11-10",
                "wednesday taken owner Alex from 2026-11-11",
                "thursday taken owner Sam from 2026-11-12", "friday available held by Debby",
                "saturday taken owner Nina from 2026-11-07",
            ])
        let confirmed = try await schedule("getSchedule.first_days_confirmed")
        #expect(confirmed.proposal?.myState == .confirmed)
        #expect(confirmed.proposal?.myDays == [.tuesday])
        // A member who has confirmed sees no name on a day nobody has confirmed (FQ48).
        #expect(
            lines(confirmed.proposal) == [
                "monday available", "tuesday yours from 2026-11-10 suggested",
                "wednesday taken owner Alex from 2026-11-11",
                "thursday taken owner Sam from 2026-11-12", "friday available",
                "saturday taken owner Nina from 2026-11-07",
            ])
    }

    @Test func theWeekAloneIsStillReadAsBefore() async throws {
        // Members (G05-members) reads `current` alone, as in B1, from the same call.
        let week = try await api(CannedTransport([example("getSchedule.first_days")]))
            .schedule(of: "club_sunday_people")
        let whole = try await schedule("getSchedule.first_days")
        #expect(week.assignments == whole.week.assignments)
        #expect(week.club == whole.week.club)
    }

    // MARK: Choosing and confirming

    @Test func choosingSendsTheDaysHeldFromNowOnAndTheVersionSeen() async throws {
        let transport = CannedTransport([example("chooseScheduleDays.chosen")])
        let key = IdempotencyKey.make(at: start)
        let proposal = try await api(transport).choose(
            [.monday], in: "spr_sp_1", expectedVersion: 1, key: key)
        let sent = try #require(transport.sent.first)
        #expect(sent.request.method == .put)
        #expect(sent.request.path == "/v1/schedule-proposals/spr_sp_1/choice")
        #expect(sent.request.headerFields[HTTPField.Name("Idempotency-Key")!] == key.description)
        #expect(sent.json.keys.sorted() == ["expected_version", "weekdays"])
        #expect(sent.json["expected_version"] as? Int == 1)
        #expect(sent.json["weekdays"] as? [String] == ["monday"])
        #expect(proposal.myDays == [.monday])
        #expect(proposal.version == 1)
        #expect(lines(proposal)[4] == "friday no_reveal")

        let contest = try await api(CannedTransport([example("chooseScheduleDays.joined_contest")]))
            .choose([.friday], in: "spr_sp_1", expectedVersion: 1, key: key)
        #expect(lines(contest)[4] == "friday clash holders Ben/Alex/Sam/Debby")
    }

    @Test func choosingNoDaySendsNone() async throws {
        let transport = CannedTransport([example("chooseScheduleDays.chosen")])
        _ = try await api(transport).choose(
            [], in: "spr_sp_1", expectedVersion: 1, key: IdempotencyKey.make(at: start))
        #expect(transport.sent.first?.json["weekdays"] as? [String] == [])
    }

    @Test func confirmingNamesTheDaysConfirmed() async throws {
        let transport = CannedTransport([example("confirmScheduleDays.confirmed")])
        let key = IdempotencyKey.make(at: start)
        let proposal = try await api(transport).confirm(
            [.friday], in: "spr_kt_2", expectedVersion: 1, key: key)
        let sent = try #require(transport.sent.first)
        #expect(sent.request.method == .post)
        #expect(sent.request.path == "/v1/schedule-proposals/spr_kt_2/confirmation")
        #expect(sent.request.headerFields[HTTPField.Name("Idempotency-Key")!] == key.description)
        #expect(sent.json.keys.sorted() == ["expected_version", "weekdays"])
        #expect(sent.json["weekdays"] as? [String] == ["friday"])
        // The last confirmation applies it, with the next version.
        #expect(proposal.state == .applied)
        #expect(proposal.version == 2)
        #expect(proposal.myState == .confirmed)
        #expect(lines(proposal)[4] == "friday yours from 2026-11-13 suggested")

        let first = try await api(
            CannedTransport([example("confirmScheduleDays.first_day_confirmed")])
        )
        .confirm([.monday], in: "spr_sp_1", expectedVersion: 1, key: key)
        #expect(first.state == .open)
        #expect(lines(first)[0] == "monday yours from 2026-11-09 suggested")
    }

    @Test func twoDaysGoMondayFirst() async throws {
        let transport = CannedTransport([example("chooseScheduleDays.chosen")])
        _ = try await api(transport).choose(
            [.saturday, .tuesday], in: "spr_sp_1", expectedVersion: 1,
            key: IdempotencyKey.make(at: start))
        // Sent as the person chose them; the server reads them as a set.
        #expect(transport.sent.first?.json["weekdays"] as? [String] == ["saturday", "tuesday"])
        let answer = ContractExample.json("chooseScheduleDays.chosen")
            .replacingOccurrences(of: #""days_per_member":1"#, with: #""days_per_member":2"#)
            .replacingOccurrences(
                of: #""my_days":["monday"]"#, with: #""my_days":["saturday","monday"]"#)
        let proposal = try await api(CannedTransport([.json(200, answer)])).choose(
            [.monday, .saturday], in: "spr_sp_1", expectedVersion: 1,
            key: IdempotencyKey.make(at: start))
        #expect(proposal.myDays == [.monday, .saturday])
        #expect(proposal.daysPerMember == 2)
    }

    // MARK: What breaks the contract

    @Test func everyValueTheContractNamesHasItsOwnCase() {
        for state in Components.Schemas.ScheduleSlotState.allCases {
            #expect(ScheduleSlot.State(rawValue: state.rawValue) != nil, "\(state)")
        }
        for reason in Components.Schemas.ScheduleProposal.ReasonPayload.allCases {
            #expect(ScheduleProposal.Reason(rawValue: reason.rawValue) != nil, "\(reason)")
        }
        for state in Components.Schemas.ScheduleProposal.MyStatePayload.allCases {
            #expect(ScheduleProposal.MyState(rawValue: state.rawValue) != nil, "\(state)")
        }
        for state in Components.Schemas.ScheduleProposal.StatePayload.allCases {
            #expect(ScheduleProposal.State(rawValue: state.rawValue) != nil, "\(state)")
        }
        for weekday in Components.Schemas.Weekday.allCases {
            #expect(Weekday(rawValue: weekday.rawValue)?.contract == weekday, "\(weekday)")
        }
    }

    @Test func anAnswerThatBreaksTheContractIsUnreadable() async {
        let open = ContractExample.json("getHome.open")
        let edited = [
            // A club date that isn't a date, a mode this build doesn't know, a next day on 31
            // November.
            open.replacingOccurrences(
                of: #""club_today":"2026-11-06""#, with: #""club_today":"6 November""#),
            open.replacingOccurrences(of: #""mode":"day""#, with: #""mode":"archived""#),
            open.replacingOccurrences(
                of: #""local_date":"2026-11-07""#, with: #""local_date":"2026-11-31""#),
        ]
        for answer in edited { #expect(answer != open) }
        let homes = edited + [#"{"mode":"waiting","server_now":"2026-11-06T06:41:00Z"}"#]
        for answer in homes {
            await #expect(throws: APIFailure.unreadable, "\(answer.prefix(60))") {
                try await api(CannedTransport([.json(200, answer)])).home(of: "club_sunday_people")
            }
        }

        let chosen = ContractExample.json("chooseScheduleDays.chosen")
        let proposals = [
            // Five weekdays, or Saturday twice.
            chosen.replacingOccurrences(
                of: #"{"weekday":"saturday","state":"available","#,
                with: #"{"weekday":"friday","state":"available","#),
            // More days held than a member holds, or the same day twice.
            chosen.replacingOccurrences(
                of: #""my_days":["monday"]"#, with: #""my_days":["monday","tuesday"]"#),
            chosen.replacingOccurrences(
                of: #""days_per_member":1"#, with: #""days_per_member":3"#),
            chosen.replacingOccurrences(of: #""state":"open""#, with: #""state":"withdrawn""#),
            chosen.replacingOccurrences(of: #""state":"no_reveal""#, with: #""state":"hidden""#),
        ]
        for answer in proposals {
            #expect(answer != chosen)
            await #expect(throws: APIFailure.unreadable, "\(answer)") {
                try await api(CannedTransport([.json(200, answer)])).choose(
                    [.monday], in: "spr_sp_1", expectedVersion: 1,
                    key: IdempotencyKey.make(at: start))
            }
        }
        // An answer for another proposal than the one the choice was sent to.
        await #expect(throws: APIFailure.unreadable) {
            try await api(CannedTransport([example("chooseScheduleDays.chosen")])).choose(
                [.monday], in: "spr_sp_2", expectedVersion: 1, key: IdempotencyKey.make(at: start))
        }
        await #expect(throws: APIFailure.unreadable) {
            try await api(CannedTransport([example("confirmScheduleDays.confirmed")])).confirm(
                [.friday], in: "spr_sp_1", expectedVersion: 1, key: IdempotencyKey.make(at: start))
        }
        // A first date that isn't a date, in the week's read.
        let firstDays = ContractExample.json("getSchedule.first_days")
        let broken = firstDays.replacingOccurrences(
            of: #""first_date":"2026-11-10""#, with: #""first_date":"10/11/2026""#)
        #expect(broken != firstDays)
        await #expect(throws: APIFailure.unreadable) {
            try await api(CannedTransport([.json(200, broken)])).clubSchedule(
                of: "club_sunday_people")
        }
    }

    // MARK: Failures

    @Test func aNotFoundIsTheSameWhateverItWasFor() async {
        // T14: one answer for a club or proposal the caller can't see, whatever the reason.
        let notFound = CannedTransport.Answer.json(404, #"{"code":"NOT_FOUND"}"#)
        for operation in CalendarOperation.allCases {
            await #expect(throws: APIFailure.notFound, "\(operation)") {
                try await operation.call(on: api(CannedTransport([notFound])), self)
            }
        }
    }

    @Test func eachAnswerBecomesItsFailure() async {
        let conflict = { (body: String) in CannedTransport.Answer.json(409, body) }
        let forbidden = { (code: String) in
            CannedTransport.Answer.json(403, #"{"code":"\#(code)"}"#)
        }
        var cases: [(CalendarOperation, CannedTransport.Answer, APIFailure)] = []
        for command in [CalendarOperation.choose, .confirm] {
            cases += [
                (command, forbidden("NOT_ALLOWED"), .notAllowed),
                (command, forbidden("PROFILE_INCOMPLETE"), .profileIncomplete),
                (
                    command, conflict(#"{"code":"VERSION_CONFLICT","current_version":2}"#),
                    .versionConflict
                ),
                (
                    command, conflict(#"{"code":"MEMBERSHIP_CHANGED","current_id":"spr_sp_2"}"#),
                    .membershipChanged
                ),
                // This key went with another body: nothing was carried out.
                (command, conflict(#"{"code":"IDEMPOTENCY_CONFLICT"}"#), .refused),
                (command, conflict(#"{"code":"ROSTER_CHANGED"}"#), .refused),
                (command, forbidden("UNAUTHENTICATED"), .refused),
                (command, .json(400, #"{"code":"INVALID_REQUEST","field":"weekdays"}"#), .refused),
                (
                    command, .json(429, #"{"code":"RATE_LIMITED"}"#, ["Retry-After": "30"]),
                    .unavailable
                ),
                (command, .response(status: 418, body: "", headers: [:]), .refused),
                (command, .failure, .network),
            ]
        }
        for read in [CalendarOperation.home, .clubSchedule] {
            cases += [
                (read, forbidden("PROFILE_INCOMPLETE"), .profileIncomplete),
                (read, forbidden("NOT_ALLOWED"), .refused),
                // A read lists no 409.
                (
                    read, conflict(#"{"code":"MEMBERSHIP_CHANGED","current_id":"spr_sp_2"}"#),
                    .refused
                ),
                (read, .json(400, #"{"code":"INVALID_REQUEST","field":"club_id"}"#), .refused),
                (
                    read, .json(429, #"{"code":"RATE_LIMITED"}"#, ["Retry-After": "30"]),
                    .unavailable
                ),
                (read, .failure, .network),
            ]
        }
        for (operation, answer, failure) in cases {
            await #expect(throws: failure, "\(operation) \(answer)") {
                try await operation.call(on: api(CannedTransport([answer])), self)
            }
        }
    }

    @Test func everyCallReadsAnyFiveHundredAsUnavailableUnread() async {
        for operation in CalendarOperation.allCases {
            for (status, body, headers) in TadayoAPIClientTests.fiveHundreds {
                let watch = BodyWatch()
                let transport = CannedTransport([
                    .watched(status: status, body: body, headers: headers, watch)
                ])
                await #expect(throws: APIFailure.unavailable, "\(operation) \(status) \(body)") {
                    try await operation.call(on: api(transport), self)
                }
                #expect(!watch.wasRead, "\(operation) \(status) \(body)")
                #expect(transport.sent.count == 1, "\(operation) \(status): not sent again")
            }
        }
    }

    @Test func aRetriedCommandSendsTheSameKeyAndBody() async throws {
        let unauthenticated = CannedTransport.Answer.json(401, #"{"code":"UNAUTHENTICATED"}"#)
        for operation in CalendarOperation.allCases where operation.isCommand {
            let auth = RefreshingAuth([
                .success(
                    AuthSession(
                        accessToken: "access-2", refreshToken: "refresh-2",
                        expiresAt: start.addingTimeInterval(7200)))
            ])
            let transport = CannedTransport([unauthenticated, example(operation.example)])
            // A key the tap made a minute before the call, so no key the call could make for
            // itself matches it.
            let key = IdempotencyKey.make(at: start.addingTimeInterval(-60))
            try await operation.call(on: api(transport, auth: auth), self, key: key)
            let header = HTTPField.Name("Idempotency-Key")!
            #expect(transport.sent.count == 2, "\(operation)")
            #expect(transport.sent.map(\.bearer) == ["Bearer access-1", "Bearer access-2"])
            #expect(
                transport.sent.map { $0.request.headerFields[header] }
                    == [key.description, key.description], "\(operation)")
            #expect(transport.sent.first?.body == transport.sent.last?.body, "\(operation)")
        }
    }

    @Test func aReadRejectedAgainAfterTheRefreshSignsOutAndCarriesNoKey() async throws {
        let unauthenticated = CannedTransport.Answer.json(401, #"{"code":"UNAUTHENTICATED"}"#)
        for operation in CalendarOperation.allCases where !operation.isCommand {
            let auth = RefreshingAuth([
                .success(
                    AuthSession(
                        accessToken: "access-2", refreshToken: "refresh-2",
                        expiresAt: start.addingTimeInterval(7200)))
            ])
            let transport = CannedTransport([unauthenticated, unauthenticated])
            await #expect(throws: APIFailure.signedOut, "\(operation)") {
                try await operation.call(on: api(transport, auth: auth), self)
            }
            #expect(auth.refreshes == 1, "\(operation)")

            let read = CannedTransport([example(operation.example)])
            try await operation.call(on: api(read), self)
            #expect(
                read.sent.first?.request.headerFields[HTTPField.Name("Idempotency-Key")!] == nil,
                "\(operation)")
        }
    }

    /// Each call once, with the arguments the tests use, so a failure table can name them.
    enum CalendarOperation: CaseIterable, CustomStringConvertible {
        case home, clubSchedule, choose, confirm

        var description: String { example }

        /// The contract example that answers it.
        var example: String {
            switch self {
            case .home: "getHome.waiting"
            case .clubSchedule: "getSchedule.conflict_three"
            case .choose: "chooseScheduleDays.chosen"
            case .confirm: "confirmScheduleDays.first_day_confirmed"
            }
        }

        var isCommand: Bool { self == .choose || self == .confirm }

        func call(on api: TadayoAPIClient, _ test: CalendarCallsTests, key: IdempotencyKey? = nil)
            async throws
        {
            let key = key ?? IdempotencyKey.make(at: test.start)
            switch self {
            case .home: _ = try await api.home(of: "club_sunday_people")
            case .clubSchedule: _ = try await api.clubSchedule(of: "club_sunday_people")
            case .choose:
                _ = try await api.choose([.monday], in: "spr_sp_1", expectedVersion: 1, key: key)
            case .confirm:
                _ = try await api.confirm([.monday], in: "spr_sp_1", expectedVersion: 1, key: key)
            }
        }
    }
}
