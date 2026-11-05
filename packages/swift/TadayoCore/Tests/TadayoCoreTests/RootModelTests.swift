import Foundation
import Testing

@testable import TadayoCore

@MainActor @Suite struct RootModelTests {
    // Thursday 5 November 2026, 3:00 AM UTC, as the device's clock reads it.
    let start = Date(timeIntervalSince1970: 1_793_847_600)
    var stored: AuthSession {
        AuthSession(
            accessToken: "access-1", refreshToken: "refresh-1",
            expiresAt: start.addingTimeInterval(3600))
    }
    let named = account(name: "Ben", age: true, version: 3)

    func clubs(empty: Bool) -> ClubList {
        ClubList(
            serverClock: ServerClock(serverNow: start, receivedAt: .now), isEmpty: empty)
    }

    func root(
        _ accounts: FakeAccounts, auth: FakeAuth = FakeAuth(),
        store: any SessionStore = InMemorySessionStore()
    ) -> RootModel {
        let clock = ManualContinuousClock()
        return RootModel(
            session: SessionManager(auth: auth, store: store, now: { [start] in start }),
            auth: auth, accounts: accounts, now: { clock.now }, sleep: { clock.sleep(until: $0) })
    }

    @Test func withNoSessionItOpensOnSignIn() async {
        let accounts = FakeAccounts()
        let root = root(accounts)
        #expect(root.route == .starting)
        await root.start()
        #expect(root.route == .signIn)
        #expect(root.signIn != nil)
        #expect(accounts.calls.isEmpty)
    }

    @Test func aNewAccountConfirmsItsAgeFirst() async {
        let root = root(
            FakeAccounts(me: [.success(account())]), store: InMemorySessionStore(stored))
        await root.start()
        #expect(root.route == .confirmAge)
        #expect(root.profile?.account == account())
    }

    @Test func anAccountWithItsAgeButNoNameGivesOne() async {
        let root = root(
            FakeAccounts(me: [.success(account(age: true, version: 1))]),
            store: InMemorySessionStore(stored))
        await root.start()
        #expect(root.route == .profile)
    }

    @Test func aCompleteAccountWithNoClubShowsTheNoClubTabs() async {
        let accounts = FakeAccounts(me: [.success(named)], clubs: [.success(clubs(empty: true))])
        let root = root(accounts, store: InMemorySessionStore(stored))
        await root.start()
        #expect(root.route == .tabs)
        #expect(root.clubs == .noClub)
        #expect(root.signIn == nil)
        #expect(root.profile == nil)
        #expect(accounts.calls == ["me", "clubs"])
    }

    @Test func clubsB0CantDrawAreNeitherEmptyNorAFailure() async {
        let root = root(
            FakeAccounts(me: [.success(named)], clubs: [.success(clubs(empty: false))]),
            store: InMemorySessionStore(stored))
        await root.start()
        #expect(root.clubs == .notInThisBuild)
    }

    @Test func aListThatDidntComeIsTheFailureUntilRetried() async {
        for (failure, shown) in [
            (APIFailure.network, RootModel.Failure.network), (.unavailable, .other),
            (.refused, .other),
        ] {
            let accounts = FakeAccounts(
                me: [.success(named)], clubs: [.failure(failure), .success(clubs(empty: true))])
            let root = root(accounts, store: InMemorySessionStore(stored))
            await root.start()
            #expect(root.route == .tabs)
            #expect(root.clubs == .failed(shown))
            await root.retry()
            #expect(root.clubs == .noClub)
            #expect(accounts.calls == ["me", "clubs", "clubs"])
        }
    }

    @Test func anAccountThatCantBeReadIsTheFailureUntilRetried() async {
        let accounts = FakeAccounts(
            me: [.failure(.network), .success(named)], clubs: [.success(clubs(empty: true))])
        let root = root(accounts, store: InMemorySessionStore(stored))
        await root.start()
        #expect(root.route == .failed(.network))
        await root.retry()
        #expect(root.route == .tabs)
        #expect(root.clubs == .noClub)
    }

    @Test func anUnfinishedProfileFromTheClubsGoesBackToSetUp() async {
        let accounts = FakeAccounts(
            me: [.success(named), .success(account(age: true, version: 4))],
            clubs: [.failure(.profileIncomplete)])
        let root = root(accounts, store: InMemorySessionStore(stored))
        await root.start()
        #expect(root.route == .profile)
    }

    @Test func twoAnswersThatDisagreeAreAFailureNotALoop() async {
        let accounts = FakeAccounts(
            me: [.success(named), .success(named)], clubs: [.failure(.profileIncomplete)])
        let root = root(accounts, store: InMemorySessionStore(stored))
        await root.start()
        #expect(root.clubs == .failed(.other))
        #expect(accounts.calls == ["me", "clubs", "me"])
    }

    @Test func aRejectedSessionIsForgottenAndSignsIn() async throws {
        let store = InMemorySessionStore(stored)
        let root = root(FakeAccounts(me: [.failure(.signedOut)]), store: store)
        await root.start()
        #expect(root.route == .signIn)
        #expect(try store.load() == nil)
    }

    @Test func aVerifiedCodeKeepsTheSessionAndRoutesByTheAccount() async throws {
        let store = InMemorySessionStore()
        let auth = FakeAuth(verify: [.success(stored)])
        let root = root(FakeAccounts(me: [.success(account())]), auth: auth, store: store)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.email = "ben@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        await signIn.verify()
        #expect(try store.load() == stored)
        #expect(root.route == .confirmAge)
    }

    @Test func theAgeThenTheNameThenTheTabs() async throws {
        let accounts = FakeAccounts(
            me: [.success(account())],
            update: [.success(account(age: true, version: 1)), .success(named)],
            clubs: [.success(clubs(empty: true))])
        let root = root(accounts, store: InMemorySessionStore(stored))
        await root.start()
        let profile = try #require(root.profile)
        await profile.confirmAge()
        #expect(root.route == .profile)
        #expect(root.profile === profile)
        profile.name = "Ben"
        await profile.saveName()
        #expect(root.route == .tabs)
        #expect(root.clubs == .noClub)
        #expect(
            accounts.updates.map(\.change) == [
                .confirmAge(expectedVersion: 0), .name("Ben", expectedVersion: 1),
            ])
    }

    @Test func leavingSignInEndsTheSessionAndStartsAgain() async throws {
        let store = InMemorySessionStore(stored)
        let auth = FakeAuth()
        let root = root(FakeAccounts(me: [.success(account())]), auth: auth, store: store)
        await root.start()
        #expect(root.route == .confirmAge)
        await root.leave()
        #expect(auth.calls == ["signOut access-1"])
        #expect(try store.load() == nil)
        #expect(root.route == .signIn)
        #expect(root.profile == nil)
        #expect(root.signIn?.email == "")
    }

    @Test func aSaveThatLandsAfterLeavingIsDropped() async throws {
        // Spec 23: after Leave sign-in, nothing routes back into the account left.
        let gate = Gate()
        let store = InMemorySessionStore(stored)
        let accounts = FakeAccounts(
            me: [.success(account())], update: [.success(account(age: true, version: 1))])
        let root = root(accounts, store: store)
        await root.start()
        let profile = try #require(root.profile)
        accounts.duringUpdate = { await gate.wait() }
        let saving = Task { await profile.confirmAge() }
        await gate.reached()
        await root.leave()
        gate.open()
        await saving.value
        #expect(root.route == .signIn)
        #expect(root.profile == nil)
        #expect(try store.load() == nil)
        #expect(accounts.calls == ["me", "update"])
    }

    @Test func aListThatLandsAfterLeavingIsDropped() async throws {
        let gate = Gate()
        let store = InMemorySessionStore(stored)
        let accounts = FakeAccounts(me: [.success(named)], clubs: [.success(clubs(empty: true))])
        accounts.duringClubs = { await gate.wait() }
        let root = root(accounts, store: store)
        let starting = Task { await root.start() }
        await gate.reached()
        await root.leave()
        gate.open()
        await starting.value
        #expect(root.route == .signIn)
        #expect(root.clubs == .loading)
        #expect(try store.load() == nil)
    }

    @Test func aReadThatLandsAfterLeavingIsDropped() async throws {
        let gate = Gate()
        let store = InMemorySessionStore(stored)
        let accounts = FakeAccounts(me: [.success(account())])
        accounts.duringMe = { await gate.wait() }
        let root = root(accounts, store: store)
        let starting = Task { await root.start() }
        await gate.reached()
        await root.leave()
        gate.open()
        await starting.value
        #expect(root.route == .signIn)
        #expect(root.profile == nil)
    }

    @Test func aRereadThatLandsAfterLeavingIsDropped() async throws {
        let gate = Gate()
        let store = InMemorySessionStore(stored)
        let accounts = FakeAccounts(
            me: [.success(named), .success(account())],
            clubs: [.success(clubs(empty: true)), .failure(.profileIncomplete)])
        let root = root(accounts, store: store)
        await root.start()
        #expect(root.route == .tabs)
        accounts.duringMe = { await gate.wait() }
        let loading = Task { await root.loadClubs() }
        await gate.reached()
        await root.leave()
        gate.open()
        await loading.value
        #expect(root.route == .signIn)
        #expect(root.profile == nil)
    }

    @Test func aSignedOutAnswerAfterLeavingSignsOutOnce() async throws {
        let gate = Gate()
        let auth = FakeAuth()
        let accounts = FakeAccounts(me: [.success(account())], update: [.failure(.signedOut)])
        let root = root(accounts, auth: auth, store: InMemorySessionStore(stored))
        await root.start()
        let profile = try #require(root.profile)
        accounts.duringUpdate = { await gate.wait() }
        let saving = Task { await profile.confirmAge() }
        await gate.reached()
        await root.leave()
        let signIn = root.signIn
        gate.open()
        await saving.value
        #expect(auth.calls == ["signOut access-1"])
        #expect(root.route == .signIn)
        #expect(root.signIn === signIn)
    }

    @Test func aCodeVerifiedAfterLeavingIsDropped() async throws {
        let gate = Gate()
        let store = InMemorySessionStore()
        let auth = FakeAuth(verify: [.success(stored)])
        let root = root(FakeAccounts(me: [.success(account())]), auth: auth, store: store)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.email = "ben@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        auth.duringSignIn = { await gate.wait() }
        let verifying = Task { await signIn.verify() }
        await gate.reached()
        await root.leave()
        gate.open()
        await verifying.value
        #expect(try store.load() == nil)
        #expect(root.route == .signIn)
        #expect(root.signIn !== signIn)
    }

    @Test func twoLeavesAtOnceEndTheSessionOnce() async throws {
        let gate = Gate()
        let auth = FakeAuth()
        auth.duringSignOut = { await gate.wait() }
        let root = root(
            FakeAccounts(me: [.success(account())]), auth: auth,
            store: InMemorySessionStore(stored))
        await root.start()
        let first = Task { await root.leave() }
        await gate.reached()
        #expect(root.route == .starting)
        #expect(root.profile == nil)
        let second = Task { await root.leave() }
        await Task.yield()
        await root.retry()
        await root.start()
        #expect(root.route == .starting)
        #expect(root.signIn == nil)
        gate.open()
        await first.value
        await second.value
        #expect(auth.calls == ["signOut access-1"])
        #expect(root.route == .signIn)
        #expect(root.epoch == 1)
    }

    @Test func aLeaveThatCantForgetTheSessionSaysSoAndRetries() async throws {
        // SEC-5: sign-in isn't shown over a session the device still keeps.
        let store = StubbornStore(stored, failures: 2)
        let root = root(FakeAccounts(me: [.success(account())]), store: store)
        await root.start()
        await root.leave()
        #expect(root.route == .failed(.other))
        #expect(root.profile == nil)
        #expect(try store.load() == stored)
        await root.retry()
        #expect(root.route == .signIn)
        #expect(try store.load() == nil)
    }
}
