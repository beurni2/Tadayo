import Foundation
import Testing

@testable import TadayoCore

/// Club details and its members list (`docs/plans/ios-b1-club-details.md` section 2): what each
/// screen shows while it loads, when it fails and when it answers; what a club no longer the
/// caller's and an ended session lead to; and the roster's order, viewer and days.
@MainActor @Suite struct ClubDetailsModelTests {
    // Thursday 5 November 2026, 3:00 AM UTC, as the device's clock reads it.
    let start = Date(timeIntervalSince1970: 1_793_847_600)
    var stored: AuthSession {
        AuthSession(
            accessToken: "access-1", refreshToken: "refresh-1",
            expiresAt: start.addingTimeInterval(3600))
    }
    let ben = account(name: "Ben", age: true, version: 3)
    /// When every answer arrived, so two answers built alike are equal.
    let received = ContinuousClock.now

    func summary(_ id: String, _ name: String, _ state: ClubState, members: Int = 6)
        -> ClubSummary
    {
        ClubSummary(
            ref: ref(id, name), state: state, memberCount: members, openDay: nil, nextDay: nil)
    }

    func ref(_ id: String, _ name: String) -> ClubRef {
        ClubRef(id: id, name: name, timezone: "America/New_York", myMembershipID: "mem_ben")
    }

    var sunday: ClubSummary { summary("club_sunday", "Sunday people", .active) }
    var kitchen: ClubSummary { summary("club_kitchen", "Kitchen table", .active, members: 5) }

    func detail(_ club: ClubSummary) -> ClubDetail {
        ClubDetail(
            serverClock: ServerClock(serverNow: start, receivedAt: received), club: club,
            rosterVersion: 3, canPropose: false, openRevisionID: nil)
    }

    func person(_ name: String) -> Person {
        Person(membershipID: "mem_\(name.lowercased())", displayName: name, avatarVersion: nil)
    }

    /// The roster as `listMembers` answers it: each name at the position given.
    func members(_ named: [(String, Int)], of club: ClubSummary? = nil) -> MemberList {
        MemberList(
            serverClock: ServerClock(serverNow: start, receivedAt: received),
            club: (club ?? sunday).ref,
            members: named.map { name, position in
                Member(
                    person: person(name), position: position, cover: nil, nextDay: nil,
                    nextUp: false)
            },
            openRevision: nil)
    }

    /// The club's week: each name with its weekdays, in the order given.
    func week(_ days: [(String, [Weekday])], of club: ClubSummary? = nil) -> ClubWeek {
        ClubWeek(
            serverClock: ServerClock(serverNow: start, receivedAt: received),
            club: (club ?? sunday).ref,
            assignments: days.flatMap { name, weekdays in
                weekdays.map { WeekdayAssignment(weekday: $0, person: person(name)) }
            })
    }

    var sixMembers: MemberList {
        members([
            ("Ben", 1), ("Maya", 2), ("Alex", 3), ("Sam", 4), ("Debby", 5), ("Nina", 6),
        ])
    }

    var sixDays: ClubWeek {
        week([
            ("Ben", [.monday]), ("Maya", [.tuesday]), ("Alex", [.wednesday]),
            ("Sam", [.thursday]), ("Debby", [.friday]), ("Nina", [.saturday]),
        ])
    }

    func root(
        _ accounts: FakeAccounts, clubs: FakeClubs, store: (any SessionStore)? = nil,
        auth: FakeAuth = FakeAuth()
    ) -> RootModel {
        let clock = ManualContinuousClock()
        return RootModel(
            session: SessionManager(
                auth: auth, store: store ?? InMemorySessionStore(stored), now: { [start] in start }),
            auth: auth, accounts: accounts, clubs: clubs, selection: InMemoryClubSelection(),
            now: { clock.now }, sleep: { clock.sleep(until: $0) })
    }

    func listed(_ clubs: ClubSummary...) -> ClubList {
        ClubList(
            serverClock: ServerClock(serverNow: start, receivedAt: received), clubs: clubs,
            invitations: [])
    }

    // MARK: Club details

    @Test func detailsLoadUntilTheyAnswer() async {
        let clubs = FakeClubs(club: [.success(detail(sunday))])
        let gate = Gate()
        clubs.duringClub = { _ in await gate.wait() }
        let model = ClubDetailsModel(club: sunday, service: clubs)
        #expect(model.details == .loading)
        let loading = Task { await model.loadDetails() }
        await gate.reached()
        #expect(model.details == .loading)
        gate.open()
        await loading.value
        #expect(model.details == .loaded(detail(sunday)))
        #expect(clubs.calls == ["club club_sunday"])
    }

    @Test func aFailedReadShowsItsLineUntilRetried() async {
        for (failure, shown) in [
            (APIFailure.network, ClubDetailsModel.Failure.network), (.refused, .refused),
            (.unavailable, .refused), (.profileIncomplete, .refused),
        ] {
            let clubs = FakeClubs(club: [.failure(failure), .success(detail(sunday))])
            let model = ClubDetailsModel(club: sunday, service: clubs)
            await model.loadDetails()
            #expect(model.details == .failed(shown), "\(failure)")
            await model.loadDetails()
            #expect(model.details == .loaded(detail(sunday)), "\(failure)")
            #expect(clubs.calls == ["club club_sunday", "club club_sunday"], "\(failure)")
        }
    }

    @Test func aSuspendedClubShowsNothingOfItAndIsNeverRead() async {
        let suspended = summary("club_sunday", "Sunday people", .suspended)
        let clubs = FakeClubs()
        let model = ClubDetailsModel(club: suspended, service: clubs)
        #expect(model.details == .unavailable)
        await model.loadDetails()
        await model.loadMembers()
        #expect(model.details == .unavailable)
        #expect(model.members == .loading)
        #expect(clubs.calls.isEmpty)
    }

    @Test func aLaterReadDropsAnEarlierOnesAnswer() async {
        // The fake hands out answers in the order the reads reach it: the retry, which isn't
        // held, takes the details, and the first read, held until after it, the failure.
        let clubs = FakeClubs(club: [.success(detail(sunday)), .failure(.network)])
        let gate = Gate()
        clubs.duringClub = { read in if read == 1 { await gate.wait() } }
        let model = ClubDetailsModel(club: sunday, service: clubs)
        let first = Task { await model.loadDetails() }
        await gate.reached()
        await model.loadDetails()
        #expect(model.details == .loaded(detail(sunday)))
        gate.open()
        await first.value
        // The first read's failure, landing after the retry's answer, changes nothing.
        #expect(model.details == .loaded(detail(sunday)))
        #expect(clubs.calls.count == 2)
    }

    @Test func aCancelledReadShowsNothing() async {
        // Back while Club details loads cancels its read, which the client answers as a network
        // failure: nobody is there to see it, and it isn't one.
        for answer in [
            Result<ClubDetail, APIFailure>.failure(.network), .failure(.notFound),
            .success(detail(sunday)),
        ] {
            let accounts = FakeAccounts(me: [.success(ben)], clubs: [.success(listed(sunday))])
            let clubs = FakeClubs(club: [answer])
            let gate = Gate()
            clubs.duringClub = { _ in await gate.wait() }
            let root = root(accounts, clubs: clubs)
            await root.start()
            let model = root.clubDetails()!
            let loading = Task { await model.loadDetails() }
            await gate.reached()
            loading.cancel()
            gate.open()
            await loading.value
            #expect(model.details == .loading, "\(answer)")
            #expect(!model.closed, "\(answer)")
            #expect(accounts.calls == ["me", "clubs"], "\(answer)")
        }
    }

    // MARK: From the root

    @Test func theRootMakesItForTheSelectedClubOnly() async {
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(listed(sunday, kitchen))]),
            clubs: FakeClubs())
        #expect(root.clubDetails() == nil)
        await root.start()
        #expect(root.clubDetails()?.club == sunday)
        await root.select("club_kitchen")
        #expect(root.clubDetails()?.club == kitchen)
    }

    @Test func aClubNoLongerTheCallersHasTheListReadAgain() async {
        let accounts = FakeAccounts(
            me: [.success(ben)],
            clubs: [.success(listed(sunday, kitchen)), .success(listed(kitchen))])
        let clubs = FakeClubs(club: [.failure(.notFound)])
        let root = root(accounts, clubs: clubs)
        await root.start()
        let model = root.clubDetails()!
        await model.loadDetails()
        #expect(accounts.calls == ["me", "clubs", "clubs"])
        #expect(root.selectedClubID == "club_kitchen")
        // The screen shows no failure: the model is closed, which closes it, whenever the list
        // answers.
        #expect(model.details == .loading)
        #expect(model.closed)
    }

    @Test func theMembersNotFoundHasTheListReadAgainToo() async {
        for answers in [
            (
                members: Result<MemberList, APIFailure>.failure(.notFound),
                week: Result<ClubWeek, APIFailure>.success(sixDays)
            ),
            (members: .success(sixMembers), week: .failure(.notFound)),
            (members: .failure(.network), week: .failure(.notFound)),
        ] {
            let accounts = FakeAccounts(
                me: [.success(ben)], clubs: [.success(listed(sunday)), .success(listed(kitchen))])
            let clubs = FakeClubs(members: [answers.members], schedule: [answers.week])
            let root = root(accounts, clubs: clubs)
            await root.start()
            let model = root.clubDetails()!
            await model.loadMembers()
            #expect(accounts.calls == ["me", "clubs", "clubs"], "\(answers)")
            #expect(model.members == .loading, "\(answers)")
            #expect(model.closed, "\(answers)")
        }
    }

    @Test func aSignedOutAnswerEndsTheSession() async throws {
        let store = InMemorySessionStore(stored)
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(listed(sunday))]),
            clubs: FakeClubs(club: [.failure(.signedOut)]),
            store: store)
        await root.start()
        let model = root.clubDetails()!
        await model.loadDetails()
        #expect(!model.closed)
        #expect(root.route == .signIn)
        #expect(root.signIn?.signInEnded == true)
        #expect(try store.load() == nil)
    }

    @Test func aSignedOutAnswerToTheMembersEndsTheSessionBeforeANotFound() async throws {
        let store = InMemorySessionStore(stored)
        let accounts = FakeAccounts(me: [.success(ben)], clubs: [.success(listed(sunday))])
        let root = root(
            accounts,
            clubs: FakeClubs(members: [.failure(.notFound)], schedule: [.failure(.signedOut)]),
            store: store)
        await root.start()
        let model = root.clubDetails()!
        await model.loadMembers()
        #expect(root.route == .signIn)
        #expect(try store.load() == nil)
        // The list isn't read again for a session that ended.
        #expect(accounts.calls == ["me", "clubs"])
        #expect(!model.closed)
    }

    @Test func aSignedOutAnswerToTheMembersEndsTheSessionWhicheverAnsweredFirst() async throws {
        // The not found answers before the session's end, then after it.
        for notFoundFirst in [true, false] {
            let store = InMemorySessionStore(stored)
            let accounts = FakeAccounts(me: [.success(ben)], clubs: [.success(listed(sunday))])
            let clubs = FakeClubs(members: [.failure(.notFound)], schedule: [.failure(.signedOut)])
            let gates = (members: Gate(), week: Gate())
            clubs.duringMembers = { _ in await gates.members.wait() }
            clubs.duringSchedule = { await gates.week.wait() }
            let root = root(accounts, clubs: clubs, store: store)
            await root.start()
            let model = root.clubDetails()!
            let loading = Task { await model.loadMembers() }
            await gates.members.reached()
            await gates.week.reached()
            (notFoundFirst ? gates.members : gates.week).open()
            (notFoundFirst ? gates.week : gates.members).open()
            await loading.value
            #expect(root.route == .signIn, "\(notFoundFirst)")
            #expect(accounts.calls == ["me", "clubs"], "\(notFoundFirst)")
            #expect(!model.closed, "\(notFoundFirst)")
        }
    }

    @Test func anAnswerAfterLeaveSignInChangesNothing() async {
        let clubs = FakeClubs(club: [.success(detail(sunday))])
        let gate = Gate()
        clubs.duringClub = { _ in await gate.wait() }
        let root = root(
            FakeAccounts(me: [.success(ben)], clubs: [.success(listed(sunday))]), clubs: clubs)
        await root.start()
        let model = root.clubDetails()!
        let loading = Task { await model.loadDetails() }
        await gate.reached()
        await root.leave()
        gate.open()
        await loading.value
        #expect(model.details == .loading)
    }

    @Test func anAnswerFromBeforeLeaveSignInChangesNothingAfterSigningInAgain() async throws {
        // Ben leaves and signs in again, the same club selected, before the first session's
        // read answers: the answer is that session's, so neither a session ended nor a club no
        // longer his reaches the new one.
        for answer in [Result<ClubDetail, APIFailure>.failure(.signedOut), .failure(.notFound)] {
            let clubs = FakeClubs(club: [answer])
            let gate = Gate()
            clubs.duringClub = { _ in await gate.wait() }
            let accounts = FakeAccounts(
                me: [.success(ben), .success(ben)],
                clubs: [.success(listed(sunday)), .success(listed(sunday))])
            let store = InMemorySessionStore(stored)
            let root = root(
                accounts, clubs: clubs, store: store, auth: FakeAuth(verify: [.success(stored)]))
            await root.start()
            let model = root.clubDetails()!
            let loading = Task { await model.loadDetails() }
            await gate.reached()
            await root.leave()
            let signIn = try #require(root.signIn)
            signIn.email = "ben@example.com"
            await signIn.sendCode()
            signIn.code = "529614"
            await signIn.verify()
            #expect(root.route == .tabs, "\(answer)")
            #expect(root.selectedClubID == "club_sunday", "\(answer)")
            gate.open()
            await loading.value
            #expect(model.details == .loading, "\(answer)")
            #expect(!model.closed, "\(answer)")
            #expect(root.route == .tabs, "\(answer)")
            #expect(try store.load() == stored, "\(answer)")
            #expect(accounts.calls == ["me", "clubs", "me", "clubs"], "\(answer)")
        }
    }

    @Test func anAnswerAfterAnotherClubIsChosenChangesNothing() async {
        let clubs = FakeClubs(club: [.failure(.notFound)])
        let gate = Gate()
        clubs.duringClub = { _ in await gate.wait() }
        let accounts = FakeAccounts(
            me: [.success(ben)], clubs: [.success(listed(sunday, kitchen))])
        let root = root(accounts, clubs: clubs)
        await root.start()
        let model = root.clubDetails()!
        let loading = Task { await model.loadDetails() }
        await gate.reached()
        await root.select("club_kitchen")
        gate.open()
        await loading.value
        // The not found is for a club left behind: the list isn't read again for it.
        #expect(model.details == .loading)
        #expect(!model.closed)
        #expect(accounts.calls == ["me", "clubs"])
        #expect(root.selectedClubID == "club_kitchen")
    }

    @Test func aMembersAnswerAfterAnotherClubIsChosenChangesNothing() async {
        let clubs = FakeClubs(members: [.failure(.notFound)], schedule: [.success(sixDays)])
        let gate = Gate()
        clubs.duringMembers = { _ in await gate.wait() }
        let accounts = FakeAccounts(
            me: [.success(ben)], clubs: [.success(listed(sunday, kitchen))])
        let root = root(accounts, clubs: clubs)
        await root.start()
        let model = root.clubDetails()!
        let loading = Task { await model.loadMembers() }
        await gate.reached()
        await root.select("club_kitchen")
        gate.open()
        await loading.value
        #expect(model.members == .loading)
        #expect(!model.closed)
        #expect(accounts.calls == ["me", "clubs"])
        #expect(root.selectedClubID == "club_kitchen")
    }

    // MARK: The members

    @Test func theMembersReadTheRosterAndTheWeekTogether() async {
        let clubs = FakeClubs(members: [.success(sixMembers)], schedule: [.success(sixDays)])
        let gates = (members: Gate(), week: Gate())
        clubs.duringMembers = { _ in await gates.members.wait() }
        clubs.duringSchedule = { await gates.week.wait() }
        let model = ClubDetailsModel(club: sunday, service: clubs)
        let loading = Task { await model.loadMembers() }
        // Both are out at once.
        await gates.members.reached()
        await gates.week.reached()
        #expect(model.members == .loading)
        gates.members.open()
        gates.week.open()
        await loading.value
        #expect(model.members == .loaded(Roster(sixMembers, week: sixDays)))
        #expect(Set(clubs.calls) == ["members club_sunday", "schedule club_sunday"])
    }

    // MARK: The kept invitation links (ADR-037)

    /// A book holding Sam's link in `club_sunday`, kept before any read.
    func keptSam() -> InvitationLinkBook {
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        book.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: "club_sunday",
            account: Sunday.account)
        return book
    }

    func samsLink(_ book: InvitationLinkBook) -> KeptInvitationLink? {
        book.link(for: "cand_sam", club: "club_sunday", account: Sunday.account)
    }

    @Test func aMembersAnswerSettlesTheKeptLinks() async {
        // Sam joined, so the open revision no longer lists Sam: the link goes, though the setup
        // list was never opened again.
        let joined = Sunday.members(nil)
        let book = keptSam()
        let model = ClubDetailsModel(
            club: sunday,
            service: FakeClubs(members: [.success(joined)], schedule: [.success(sixDays)]),
            links: (book, Sunday.account))
        await model.loadMembers()
        #expect(samsLink(book) == nil)
        // Still waiting on Sam's acceptance: the link stays.
        let waiting = Sunday.members([Sunday.candidate("cand_sam", "Sam", .live)])
        let kept = keptSam()
        let still = ClubDetailsModel(
            club: sunday,
            service: FakeClubs(members: [.success(waiting)], schedule: [.success(sixDays)]),
            links: (kept, Sunday.account))
        await still.loadMembers()
        #expect(samsLink(kept) != nil)
    }

    @Test func aMembersNotFoundPurgesTheClubsLinksAndAFailureKeepsThem() async {
        let book = keptSam()
        let gone = ClubDetailsModel(
            club: sunday,
            service: FakeClubs(members: [.failure(.notFound)], schedule: [.success(sixDays)]),
            links: (book, Sunday.account))
        await gone.loadMembers()
        #expect(samsLink(book) == nil)
        for failure in [APIFailure.network, .refused, .unavailable] {
            let kept = keptSam()
            let failed = ClubDetailsModel(
                club: sunday,
                service: FakeClubs(members: [.failure(failure)], schedule: [.success(sixDays)]),
                links: (kept, Sunday.account))
            await failed.loadMembers()
            #expect(samsLink(kept) != nil)
        }
    }

    @Test func aLinkKeptWhileTheMembersAreReadIsLeftByTheirAnswer() async {
        let book = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let clubs = FakeClubs(
            members: [.success(Sunday.members(nil))], schedule: [.success(sixDays)])
        let gate = Gate()
        clubs.duringMembers = { _ in await gate.wait() }
        let model = ClubDetailsModel(club: sunday, service: clubs, links: (book, Sunday.account))
        let loading = Task { await model.loadMembers() }
        await gate.reached()
        book.keep(
            Sunday.link("inv_sam", for: "cand_sam", url: Sunday.url(1)), club: "club_sunday",
            account: Sunday.account)
        gate.open()
        await loading.value
        #expect(samsLink(book) != nil)
    }

    @Test func theRootsClubDetailsSettleTheAccountsLinks() async {
        let book = keptSam()
        let accounts = FakeAccounts(me: [.success(ben)], clubs: [.success(listed(sunday))])
        let clubs = FakeClubs(
            club: [.success(detail(sunday))], members: [.success(Sunday.members(nil))],
            schedule: [.success(sixDays)])
        let clock = ManualContinuousClock()
        let root = RootModel(
            session: SessionManager(
                auth: FakeAuth(), store: InMemorySessionStore(stored), now: { [start] in start }),
            auth: FakeAuth(), accounts: accounts, clubs: clubs, selection: InMemoryClubSelection(),
            links: book, now: { clock.now }, sleep: { clock.sleep(until: $0) })
        await root.start()
        #expect(samsLink(book) != nil)
        await root.clubDetails()?.loadMembers()
        #expect(samsLink(book) == nil)
    }

    @Test func eitherReadFailingFailsTheList() async {
        for (list, week, shown) in [
            (
                Result<MemberList, APIFailure>.failure(.network),
                Result<ClubWeek, APIFailure>.success(sixDays), ClubDetailsModel.Failure.network
            ),
            (.success(sixMembers), .failure(.network), .network),
            (.success(sixMembers), .failure(.refused), .refused),
            (.failure(.refused), .failure(.network), .refused),
        ] {
            let clubs = FakeClubs(
                members: [list, .success(sixMembers)], schedule: [week, .success(sixDays)])
            let model = ClubDetailsModel(club: sunday, service: clubs)
            await model.loadMembers()
            #expect(model.members == .failed(shown))
            await model.loadMembers()
            #expect(model.members == .loaded(Roster(sixMembers, week: sixDays)))
            #expect(!model.closed)
        }
    }

    @Test func aLaterMembersReadDropsAnEarlierOnesAnswer() async {
        // As for the details: the retry, not held, takes the roster; the first read, held until
        // after it, the failure.
        let clubs = FakeClubs(
            members: [.success(sixMembers), .failure(.network)],
            schedule: [.success(sixDays), .success(sixDays)])
        let gate = Gate()
        clubs.duringMembers = { read in if read == 1 { await gate.wait() } }
        let model = ClubDetailsModel(club: sunday, service: clubs)
        let first = Task { await model.loadMembers() }
        await gate.reached()
        await model.loadMembers()
        #expect(model.members == .loaded(Roster(sixMembers, week: sixDays)))
        gate.open()
        await first.value
        #expect(model.members == .loaded(Roster(sixMembers, week: sixDays)))
        #expect(clubs.calls.filter { $0.hasPrefix("members") }.count == 2)
    }

    @Test func aCancelledMembersReadShowsNothing() async {
        // Back while Members loads: its read's answer, whatever it is, changes nothing, so
        // Members opened again starts from loading, not from a failure that never was.
        for list in [
            Result<MemberList, APIFailure>.failure(.network), .failure(.notFound),
            .success(sixMembers),
        ] {
            let accounts = FakeAccounts(me: [.success(ben)], clubs: [.success(listed(sunday))])
            let clubs = FakeClubs(members: [list], schedule: [.success(sixDays)])
            let gate = Gate()
            clubs.duringMembers = { _ in await gate.wait() }
            let root = root(accounts, clubs: clubs)
            await root.start()
            let model = root.clubDetails()!
            let loading = Task { await model.loadMembers() }
            await gate.reached()
            loading.cancel()
            gate.open()
            await loading.value
            #expect(model.members == .loading, "\(list)")
            #expect(!model.closed, "\(list)")
            #expect(accounts.calls == ["me", "clubs"], "\(list)")
        }
    }

    // MARK: The roster

    @Test func theRosterKeepsTheServersOrder() {
        let list = members([("Debby", 5), ("Ben", 1), ("Nina", 6), ("Maya", 2)])
        let roster = Roster(list, week: week([]))
        #expect(roster.rows.map(\.person.displayName) == ["Ben", "Maya", "Debby", "Nina"])
        #expect(roster.club == sunday.ref)
    }

    @Test func theViewerIsTheClubsOwnMembership() {
        let roster = Roster(members([("Ben", 1), ("Maya", 2)]), week: week([]))
        #expect(roster.rows.map(\.isViewer) == [true, false])
    }

    @Test func eachMembersWeekdaysComeFromTheWeekMondayFirst() {
        let pair = members([("Ben", 1), ("Debby", 2)])
        let roster = Roster(
            pair,
            week: week([
                ("Debby", [.friday]), ("Ben", [.thursday, .monday]), ("Debby", [.tuesday]),
            ]))
        #expect(roster.rows.map(\.weekdays) == [[.monday, .thursday], [.tuesday, .friday]])
        #expect(roster.days == .two)
    }

    @Test func aMemberWithNoDayHasNoneAndADayOfSomeoneUnlistedIsDropped() {
        let roster = Roster(
            members([("Ben", 1), ("Maya", 2)]),
            week: week([("Ben", [.monday]), ("Leila", [.friday])]))
        #expect(roster.rows.map(\.weekdays) == [[.monday], []])
        #expect(roster.rows.count == 2)
    }

    @Test func theSubtitleOnlyWhenTheRosterBearsItOut() {
        #expect(Roster(sixMembers, week: sixDays).days == .one)
        let pair = members([("Ben", 1), ("Debby", 2)])
        // Someone with no day yet, as in a club's first days.
        #expect(Roster(pair, week: week([("Ben", [.monday, .thursday])])).days == nil)
        // A mix.
        #expect(
            Roster(pair, week: week([("Ben", [.monday, .thursday]), ("Debby", [.friday])])).days
                == nil)
        // No week in force.
        #expect(Roster(pair, week: week([])).days == nil)
        // A club of one, with no day.
        #expect(Roster(members([("Ben", 1)]), week: week([])).days == nil)
    }

    @Test func weekdaysOrderMondayFirstAndCountAsTheCalendarDoes() {
        #expect(Weekday.allCases.sorted() == Weekday.allCases)
        #expect(Weekday.monday.calendarWeekday == 2)
        #expect(Weekday.saturday.calendarWeekday == 7)
        #expect([Weekday.friday, .monday].sorted() == [.monday, .friday])
    }
}
