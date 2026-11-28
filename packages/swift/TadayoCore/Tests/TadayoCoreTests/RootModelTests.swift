import Foundation
import Observation
import Testing

@testable import TadayoCore

/// Every route a `RootModel` takes, in order, by observing it. A route held across one turn of
/// the main actor can be drawn and spoken, so a test that reads the route at two instants can't
/// say a route never showed: this one can.
@MainActor private final class RouteHistory {
    private let root: RootModel
    private var left: [RootModel.Route] = []

    /// The routes the model has held since this began, in order, the current one last.
    var routes: [RootModel.Route] { left + [root.route] }

    init(_ root: RootModel) {
        self.root = root
        track()
    }

    private func track() {
        withObservationTracking {
            _ = root.route
        } onChange: { [self] in
            // `onChange` runs just before the route changes, so `root.route` is still the one
            // being left, and the next change needs a new observation.
            MainActor.assumeIsolated {
                left.append(root.route)
                track()
            }
        }
    }
}

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
        let waiting = MyInvitation(
            invitationID: "inv_kt_leila", clubName: "Kitchen table", inviterName: "Ben",
            state: .waiting)
        return ClubList(
            serverClock: ServerClock(serverNow: start, receivedAt: .now), clubs: [],
            invitations: empty ? [] : [waiting])
    }

    func root(
        _ accounts: FakeAccounts, auth: FakeAuth = FakeAuth(),
        store: any SessionStore = InMemorySessionStore(),
        clubs: FakeClubs = FakeClubs(),
        selection: any ClubSelectionStore = InMemoryClubSelection(),
        left: @escaping @MainActor () -> Void = {}
    ) -> RootModel {
        let clock = ManualContinuousClock()
        return RootModel(
            session: SessionManager(auth: auth, store: store, now: { [start] in start }),
            auth: auth, accounts: accounts, clubs: clubs, selection: selection,
            now: { clock.now }, sleep: { clock.sleep(until: $0) }, left: left)
    }

    @Test func withNoSessionItOpensOnSignIn() async {
        let accounts = FakeAccounts()
        var purges = 0
        let root = root(accounts, left: { purges += 1 })
        #expect(root.route == .starting)
        await root.start()
        #expect(root.route == .signIn)
        #expect(root.signIn != nil)
        // No sign-in ended: A02-email says nothing of one (handoff 7's `auth.email.signedOut`).
        #expect(root.signIn?.signInEnded == false)
        // A phone with no sign-in starts at Welcome (A01; `docs/plans/ios-b1-welcome.md`).
        #expect(root.signIn?.showsWelcome == true)
        #expect(accounts.calls.isEmpty)
        #expect(purges == 0)
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
        #expect(root.account == named)
        #expect(root.signIn == nil)
        #expect(root.profile == nil)
        #expect(accounts.calls == ["me", "clubs"])
    }

    @Test func theTabsAccountIsForgottenOnLeaving() async {
        // T11: nothing of the account left outlives Leave, the header's initial included.
        let root = root(
            FakeAccounts(me: [.success(named)], clubs: [.success(clubs(empty: true))]),
            store: InMemorySessionStore(stored))
        await root.start()
        #expect(root.account == named)
        await root.leave()
        #expect(root.route == .signIn)
        #expect(root.account == nil)
    }

    @Test func noAccountIsShownWhileTheProfileIsUnfinished() async {
        let root = root(
            FakeAccounts(me: [.success(account(age: true, version: 1))]),
            store: InMemorySessionStore(stored))
        await root.start()
        #expect(root.route == .profile)
        #expect(root.account == nil)
    }

    @Test func anUnfinishedProfileFromTheClubsForgetsTheTabsAccount() async {
        let accounts = FakeAccounts(
            me: [.success(named), .success(account(age: true, version: 4))],
            clubs: [.failure(.profileIncomplete)])
        let root = root(accounts, store: InMemorySessionStore(stored))
        await root.start()
        #expect(root.route == .profile)
        #expect(root.account == nil)
    }

    @Test func aSessionTheDeviceCantKeepSaysSoAndSignsInAgain() async throws {
        // T43: the failure names what failed. Retry starts again, and with nothing kept that's
        // sign-in, at the address step with what was typed still there.
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(me: [.success(account())])
        let root = root(accounts, auth: auth, store: UnwritableStore())
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.email = "ben@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        await signIn.verify()
        #expect(root.route == .signInNotKept)
        #expect(accounts.calls.isEmpty)
        let history = RouteHistory(root)
        await root.retry()
        #expect(root.route == .signIn)
        #expect(root.signIn?.step == .email)
        #expect(root.signIn?.email == "ben@example.com")
        // The device couldn't keep the session, but nothing ended it: no notice. Only the code is
        // asked for again, so A02-email is the first screen, with no Welcome under it.
        #expect(root.signIn?.signInEnded == false)
        #expect(root.signIn?.showsWelcome == false)
        // Nothing is kept, so there was no account to read, and no wait to show, not for a turn
        // either (FQ96): the routes taken are the canvas alone, then sign-in, and nothing else. The
        // exact list is what shows the history was recorded at all: a recorder that saw nothing
        // would pass a check that a route is absent.
        #expect(accounts.calls.isEmpty)
        #expect(history.routes == [.signInNotKept, .starting, .signIn])
    }

    @Test func aRetryWhoseReadIsRefusedStillSaysTheSessionWasntKept() async throws {
        // A keychain that refuses the read on this Retry read no account, since none was kept:
        // the line stays "Couldn’t keep you signed in." (T43), not the account's, and the address
        // typed stays for the Retry after it (FQ89).
        let store = UnwritableStore()
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(me: [.success(account())])
        let root = root(accounts, auth: auth, store: store)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.email = "ben@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        await signIn.verify()
        #expect(root.route == .signInNotKept)
        store.refuseNextLoad()
        await root.retry()
        #expect(root.route == .signInNotKept)
        await root.retry()
        #expect(root.route == .signIn)
        #expect(root.signIn?.step == .email)
        #expect(root.signIn?.email == "ben@example.com")
        #expect(accounts.calls.isEmpty)
    }

    @Test func onlyAcceptedInvitationsAreNoClubWithTheirRows() async {
        // Handoff 9's `acceptedInvitations.noClub`: Home with no club, its invitations first. A
        // list with a club is `.listed` (`RootModelClubsTests`).
        let root = root(
            FakeAccounts(me: [.success(named)], clubs: [.success(clubs(empty: false))]),
            store: InMemorySessionStore(stored))
        await root.start()
        #expect(root.clubs == .noClub)
        #expect(root.selectedClubID == nil)
        #expect(root.acceptedInvitations.map(\.id) == ["inv_kt_leila"])
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
        // The person asked: A02-email doesn't say the sign-in ended, and Welcome shows again
        // (handoff 1: "Leave sign-in exits the restricted setup session and returns to Welcome").
        #expect(root.signIn?.signInEnded == false)
        #expect(root.signIn?.showsWelcome == true)
    }

    @Test func leavingPurgesOnceTheServerHasHeardAndBeforeSignInShows() async throws {
        // T11: the app remakes its connections in `left`, after the sign-out went out on them
        // and before a new sign-in could use them.
        let store = InMemorySessionStore(stored)
        let auth = FakeAuth()
        var seen: [(calls: [String], route: RootModel.Route, kept: AuthSession?)] = []
        var root: RootModel?
        root = self.root(
            FakeAccounts(me: [.success(account())]), auth: auth, store: store,
            left: { seen.append((auth.calls, root!.route, try? store.load())) })
        await root!.start()
        await root!.leave()
        #expect(seen.count == 1)
        #expect(seen.first?.calls == ["signOut access-1"])
        #expect(seen.first?.route == .leaving)
        #expect(seen.first?.kept == nil)
        #expect(root!.route == .signIn)
    }

    @Test func aSessionTheServerEndedIsPurgedToo() async throws {
        let store = InMemorySessionStore(stored)
        var purges = 0
        let root = root(
            FakeAccounts(me: [.failure(.signedOut)]), store: store, left: { purges += 1 })
        await root.start()
        #expect(root.route == .signIn)
        #expect(purges == 1)
        // The server ended it: A02-email says so (handoff 7's `auth.email.signedOut`), with an
        // empty field, since at launch no address was typed in this one (IMPL §4: "never
        // reconstruct it from an account record").
        #expect(root.signIn?.signInEnded == true)
        #expect(root.signIn?.email == "")
    }

    // MARK: Why a session ended (handoff 7's `auth.email.signedOut`; FQ93's default)

    /// A02-code to A02-age with ben@example.com typed: the sign-in model, holding the address,
    /// lives on while the account is unfinished.
    func onTheAge(
        _ accounts: FakeAccounts, auth: FakeAuth, store: any SessionStore = InMemorySessionStore()
    ) async throws -> RootModel {
        let root = root(accounts, auth: auth, store: store)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.email = "ben@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        await signIn.verify()
        #expect(root.route == .confirmAge)
        return root
    }

    @Test func aSignInTheServerEndedKeepsTheAddressIfItIsInMemory() async throws {
        // IMPL §4: "Retain the address if still available in the current flow."
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(me: [.success(account())], update: [.failure(.signedOut)])
        let root = try await onTheAge(accounts, auth: auth)
        let profile = try #require(root.profile)
        await profile.confirmAge()
        #expect(root.route == .signIn)
        #expect(auth.calls.last == "signOut access-1")
        #expect(root.signIn?.signInEnded == true)
        #expect(root.signIn?.email == "ben@example.com")
        #expect(root.signIn?.step == .email)
        // Its words are for someone already here: A02-email first, with no Welcome under it.
        #expect(root.signIn?.showsWelcome == false)
    }

    @Test func leavingSignInFromTheAgeLeavesTheFieldEmptyThoughTheAddressIsInMemory() async throws {
        // FQ93's default: Leave sign-in returns to an empty field and says nothing ended.
        let auth = FakeAuth(verify: [.success(stored)])
        let root = try await onTheAge(FakeAccounts(me: [.success(account())]), auth: auth)
        await root.leave()
        #expect(root.route == .signIn)
        #expect(root.signIn?.signInEnded == false)
        #expect(root.signIn?.email == "")
    }

    @Test func aSignInTheServerEndsAfterTheCodeKeepsTheAddress() async throws {
        // The account read after a verified code answers "signed out": A02-code's address is
        // still in memory.
        let auth = FakeAuth(verify: [.success(stored)])
        let root = root(FakeAccounts(me: [.failure(.signedOut)]), auth: auth)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.email = "ben@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        await signIn.verify()
        #expect(root.route == .signIn)
        #expect(root.signIn !== signIn)
        #expect(root.signIn?.signInEnded == true)
        #expect(root.signIn?.email == "ben@example.com")
    }

    @Test func aSessionTheServerEndsOnTheTabsSaysSoWithAnEmptyField() async throws {
        // A session kept from an earlier launch: no address was typed in this one.
        let root = root(
            FakeAccounts(me: [.success(named)], clubs: [.failure(.signedOut)]),
            store: InMemorySessionStore(stored))
        await root.start()
        #expect(root.route == .signIn)
        #expect(root.signIn?.signInEnded == true)
        #expect(root.signIn?.email == "")
        #expect(root.signIn?.showsWelcome == false)
    }

    @Test func aSignInMadeInThisLaunchLeavesNoAddressOnceTheTabsShow() async throws {
        // The tabs hold no sign-in (signin.md C7: "when signIn is already gone (Home, or a cold
        // launch), the field is empty and the notice shows"), though the address was typed in this
        // launch.
        let gate = Gate()
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(me: [.success(named)], clubs: [.failure(.signedOut)])
        accounts.duringClubs = { await gate.wait() }
        let root = root(accounts, auth: auth)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.email = "ben@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        let verifying = Task { await signIn.verify() }
        await gate.reached()
        #expect(root.route == .tabs)
        #expect(root.signIn == nil)
        gate.open()
        await verifying.value
        #expect(root.route == .signIn)
        #expect(auth.calls.last == "signOut access-1")
        #expect(root.signIn?.signInEnded == true)
        #expect(root.signIn?.email == "")
    }

    @Test func aSignedOutAnswerToTheClubsReReadEndsTheSignIn() async {
        // The clubs say the profile is unfinished and the account read that follows says the
        // session ended: that's the server's ending, not a failure of the clubs.
        let auth = FakeAuth()
        let accounts = FakeAccounts(
            me: [.success(named), .failure(.signedOut)], clubs: [.failure(.profileIncomplete)])
        let root = root(accounts, auth: auth, store: InMemorySessionStore(stored))
        await root.start()
        #expect(accounts.calls == ["me", "clubs", "me"])
        #expect(auth.calls == ["signOut access-1"])
        #expect(root.route == .signIn)
        #expect(root.signIn?.signInEnded == true)
    }

    @Test func aLeaveDuringTheServersEndingLeavesItsCause() async {
        // One ending runs at a time, and the first one's reason stands: Leave sign-in tapped while
        // the server's ending is being carried out waits for it, and A02-email still says the
        // sign-in ended.
        let gate = Gate()
        let auth = FakeAuth()
        auth.duringSignOut = { await gate.wait() }
        let root = root(
            FakeAccounts(me: [.failure(.signedOut)]), auth: auth,
            store: InMemorySessionStore(stored))
        let starting = Task { await root.start() }
        await gate.reached()
        #expect(root.route == .leaving)
        let leaving = Task { await root.leave() }
        await Task.yield()
        gate.open()
        await starting.value
        await leaving.value
        #expect(auth.calls == ["signOut access-1"])
        #expect(root.route == .signIn)
        #expect(root.signIn?.signInEnded == true)
        #expect(root.signIn?.email == "")
    }

    @Test func aLeaveRetriedAfterAFailedRemovalKeepsItsCause() async throws {
        // The server ended it and the device couldn't forget it at first: Retry removes it again
        // and A02-email still says the sign-in ended, with the address typed.
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(me: [.success(account())], update: [.failure(.signedOut)])
        let root = try await onTheAge(
            accounts, auth: auth, store: StubbornStore(nil, failures: 2))
        let profile = try #require(root.profile)
        await profile.confirmAge()
        #expect(root.route == .leaveFailed)
        #expect(root.signIn == nil)
        await root.retry()
        #expect(root.route == .signIn)
        #expect(root.signIn?.signInEnded == true)
        #expect(root.signIn?.email == "ben@example.com")
    }

    @Test func aLeaveThePersonAskedForRetriedSaysNothingEnded() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let root = try await onTheAge(
            FakeAccounts(me: [.success(account())]), auth: auth,
            store: StubbornStore(nil, failures: 2))
        await root.leave()
        #expect(root.route == .leaveFailed)
        await root.retry()
        #expect(root.route == .signIn)
        #expect(root.signIn?.signInEnded == false)
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
        // The tabs show the account while its list is out.
        #expect(root.route == .tabs)
        #expect(root.clubs == .loading)
        #expect(root.account == named)
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
        // The late "signed out" answered for the account left: the Leave moved the epoch, so it's
        // dropped, and A02-email says nothing ended.
        #expect(root.signIn?.signInEnded == false)
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
        #expect(root.route == .leaving)
        #expect(root.profile == nil)
        let second = Task { await root.leave() }
        await Task.yield()
        await root.retry()
        await root.start()
        #expect(root.route == .leaving)
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
        var purges = 0
        let root = root(
            FakeAccounts(me: [.success(account())]), store: store, left: { purges += 1 })
        await root.start()
        await root.leave()
        #expect(root.route == .leaveFailed)
        #expect(root.profile == nil)
        #expect(try store.load() == stored)
        // What the account left behind is purged even while the device still keeps its session.
        #expect(purges == 1)
        await root.retry()
        #expect(root.route == .signIn)
        #expect(try store.load() == nil)
        #expect(purges == 2)
    }

    @Test func aLeaveFromTheTabsThatCantForgetTheSessionForgetsTheAccount() async throws {
        // T11: nothing of the account outlives Leave sign-in, even while the device still keeps
        // its session.
        let root = root(
            FakeAccounts(me: [.success(named)], clubs: [.success(clubs(empty: true))]),
            store: StubbornStore(stored, failures: 2))
        await root.start()
        #expect(root.route == .tabs)
        #expect(root.account == named)
        await root.leave()
        #expect(root.route == .leaveFailed)
        #expect(root.account == nil)
        #expect(root.clubs == .loading)
    }

    // MARK: The two waits (handoff 7's `root.loading` and `root.leaving`; FQ96's default)

    @Test func whileTheKeychainIsReadTheRouteIsTheCanvasAloneThenTheWaitOnceASignInIsFound()
        async
    {
        // FQ96: nothing shows or is spoken before a sign-in is found. `Task.immediate` runs
        // `start()` as far as its first suspension, the read of the keychain, and gives this test
        // the main actor back before that read can answer: the route is the canvas alone. Once the
        // session is found the wait shows, and holds until the account answers.
        let gate = Gate()
        let accounts = FakeAccounts(me: [.success(named)], clubs: [.success(clubs(empty: true))])
        accounts.duringMe = { await gate.wait() }
        let root = root(accounts, store: InMemorySessionStore(stored))
        let starting = Task.immediate { await root.start() }
        #expect(root.route == .starting)
        await gate.reached()
        #expect(root.route == .reading)
        gate.open()
        await starting.value
        #expect(root.route == .tabs)
    }

    @Test func withNoSessionTheWaitNeverShows() async {
        // Nobody is signed in: the canvas alone while the keychain is read, then A02-email, and no
        // account was read for a wait to show (FQ96). The history is what makes "never" true: the
        // route read at two instants could miss a wait held for one turn. It is asserted as the
        // exact list, so a recorder that saw nothing fails it too.
        let accounts = FakeAccounts()
        let root = root(accounts)
        let history = RouteHistory(root)
        let starting = Task.immediate { await root.start() }
        #expect(root.route == .starting)
        await starting.value
        #expect(root.route == .signIn)
        #expect(accounts.calls.isEmpty)
        #expect(history.routes == [.starting, .signIn])
    }

    @Test func aRetryAfterAFailedReadShowsTheWaitAgainUntilTheAccountAnswers() async {
        let gate = Gate()
        let accounts = FakeAccounts(
            me: [.failure(.network), .success(named)], clubs: [.success(clubs(empty: true))])
        let root = root(accounts, store: InMemorySessionStore(stored))
        await root.start()
        #expect(root.route == .failed(.network))
        accounts.duringMe = { await gate.wait() }
        let retrying = Task { await root.retry() }
        await gate.reached()
        #expect(root.route == .reading)
        gate.open()
        await retrying.value
        #expect(root.route == .tabs)
    }

    @Test func aRetryAfterALeaveThatCouldntFinishShowsLeavingAgain() async {
        let gate = Gate()
        let auth = FakeAuth()
        let root = root(
            FakeAccounts(me: [.success(account())]), auth: auth,
            store: StubbornStore(stored, failures: 2))
        await root.start()
        await root.leave()
        #expect(root.route == .leaveFailed)
        auth.duringSignOut = { await gate.wait() }
        let retrying = Task { await root.retry() }
        await gate.reached()
        #expect(root.route == .leaving)
        gate.open()
        await retrying.value
        #expect(root.route == .signIn)
    }

    @Test func aVerifiedCodesAccountReadLeavesTheRouteOnSignInWhereVerifyCodeIsBusy() async throws {
        // R-09: the read after a verified code isn't a wait of its own, so A02-code keeps its
        // busy Verify code rather than flash the start-up wait.
        let gate = Gate()
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(me: [.success(account())])
        accounts.duringMe = { await gate.wait() }
        let root = root(accounts, auth: auth)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.email = "ben@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        let verifying = Task { await signIn.verify() }
        await gate.reached()
        #expect(root.route == .signIn)
        gate.open()
        await verifying.value
        #expect(root.route == .confirmAge)
    }

    @Test func aSessionTheServerEndsDuringTheReadShowsLeavingThenSignIn() async {
        // R-10: the removal of a session the person didn't end is the same wait as Leave sign-in.
        let gate = Gate()
        let auth = FakeAuth()
        auth.duringSignOut = { await gate.wait() }
        let root = root(
            FakeAccounts(me: [.failure(.signedOut)]), auth: auth,
            store: InMemorySessionStore(stored))
        let starting = Task { await root.start() }
        await gate.reached()
        #expect(root.route == .leaving)
        gate.open()
        await starting.value
        #expect(root.route == .signIn)
    }
}

/// A keychain that won't take a session: `save` throws, as a full or locked keychain can; and,
/// once told, its next load throws too.
final class UnwritableStore: SessionStore, @unchecked Sendable {
    struct Refused: Error {}
    private let lock = NSLock()
    private var loadFailures = 0

    func load() throws -> AuthSession? {
        let refuse = lock.withLock {
            guard loadFailures > 0 else { return false }
            loadFailures -= 1
            return true
        }
        if refuse { throw Refused() }
        return nil
    }

    func save(_ session: AuthSession) throws { throw Refused() }
    func delete() throws {}

    /// Makes the next load throw, as a keychain read can once.
    func refuseNextLoad() { lock.withLock { loadFailures += 1 } }
}
