import Foundation
import Testing

@testable import TadayoCore

/// Welcome (A01) and the routes it starts, through sign-in (`docs/plans/ios-b1-welcome.md`
/// section 2; handoff 8's `welcome.routes`, handoff 9's `welcome`, book p9).
@MainActor @Suite struct RootModelWelcomeTests {
    // Thursday 5 November 2026, 3:00 AM UTC, as the device's clock reads it.
    let start = Date(timeIntervalSince1970: 1_793_847_600)
    var stored: AuthSession {
        AuthSession(
            accessToken: "access-1", refreshToken: "refresh-1",
            expiresAt: start.addingTimeInterval(3600))
    }
    let leila = account(name: "Leila", age: true, version: 2)
    let token = Kitchen.token(1)
    var link: String { "https://tadayo.app/i#" + token.secret }

    func list() -> ClubList {
        ClubList(
            serverClock: ServerClock(serverNow: start, receivedAt: .now), clubs: [],
            invitations: [])
    }

    func root(
        _ accounts: FakeAccounts, clubs: ScriptedClubs = ScriptedClubs(),
        auth: FakeAuth = FakeAuth(), signedIn: Bool = false
    ) -> RootModel {
        let clock = ManualContinuousClock()
        return RootModel(
            session: SessionManager(
                auth: auth, store: signedIn ? InMemorySessionStore(stored) : InMemorySessionStore(),
                now: { [start] in start }),
            auth: auth, accounts: accounts, clubs: clubs, selection: InMemoryClubSelection(),
            now: { clock.now }, sleep: { clock.sleep(until: $0) })
    }

    /// A02-email's code sent and verified, as the person does it.
    func signIn(_ signIn: SignInModel) async {
        signIn.email = "leila@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        await signIn.verify()
    }

    // MARK: Where the flow starts

    @Test func withNoSignInTheFlowStartsAtWelcomeWithNoWayChosen() async throws {
        let root = root(FakeAccounts())
        await root.start()
        #expect(root.route == .signIn)
        let signIn = try #require(root.signIn)
        #expect(signIn.showsWelcome)
        #expect(signIn.way == nil)
        #expect(signIn.linkEntry == nil)
    }

    @Test func aLinkHeldAtLaunchStartsTheFlowAtTheEmailScreen() async throws {
        // Book p9: a received invite skips the generic introduction.
        let clubs = ScriptedClubs()
        let root = root(FakeAccounts(), clubs: clubs)
        await root.open(token)
        await root.start()
        let signIn = try #require(root.signIn)
        #expect(!signIn.showsWelcome)
        #expect(clubs.calls.isEmpty)
    }

    @Test func aLinkOpenedWhileWelcomeShowsSkipsIt() async throws {
        let root = root(FakeAccounts())
        await root.start()
        let signIn = try #require(root.signIn)
        await root.open(token)
        #expect(root.signIn === signIn)
        #expect(!signIn.showsWelcome)
        #expect(signIn.way == nil)
    }

    @Test func welcomesRoutesAreChosenOnlyFromWelcome() async throws {
        let root = root(FakeAccounts())
        await root.open(token)
        await root.start()
        let signIn = try #require(root.signIn)
        // The flow starts at A02-email: Welcome isn't there to choose from.
        signIn.choose(.createClub)
        #expect(signIn.way == nil)
    }

    // MARK: Create a club

    @Test func createAClubOpensCreateOnceTheTabsShow() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(me: [.success(leila)], clubs: [.success(list())])
        let root = root(accounts, auth: auth)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.choose(.createClub)
        #expect(signIn.way == .createClub)
        await self.signIn(signIn)
        #expect(root.route == .tabs)
        #expect(root.createsClubOnArrival)
        // Once: the tabs take it as they first show.
        #expect(root.arrivalCreate() != nil)
        #expect(!root.createsClubOnArrival)
        #expect(root.arrivalCreate() == nil)
    }

    @Test func createAClubWaitsForTheAgeAndTheName() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(
            me: [.success(account())],
            update: [
                .success(account(age: true, version: 1)),
                .success(account(name: "Leila", age: true, version: 2)),
            ],
            clubs: [.success(list())])
        let root = root(accounts, auth: auth)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.choose(.createClub)
        await self.signIn(signIn)
        #expect(root.route == .confirmAge)
        #expect(!root.createsClubOnArrival)
        let profile = try #require(root.profile)
        await profile.confirmAge()
        #expect(root.route == .profile)
        #expect(!root.createsClubOnArrival)
        profile.name = "Leila"
        await profile.saveName()
        #expect(root.route == .tabs)
        #expect(root.createsClubOnArrival)
    }

    @Test func alreadyHereSignsInWithNoCreate() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), auth: auth)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.choose(.signIn)
        #expect(signIn.way == .signIn)
        await self.signIn(signIn)
        #expect(root.route == .tabs)
        #expect(!root.createsClubOnArrival)
        #expect(root.arrivalCreate() == nil)
    }

    @Test func backToWelcomeForgetsCreateAClubAndKeepsTheAddress() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), auth: auth)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.choose(.createClub)
        signIn.email = "leila@example.com"
        signIn.returnToWelcome()
        #expect(signIn.way == nil)
        #expect(signIn.email == "leila@example.com")
        signIn.choose(.signIn)
        await self.signIn(signIn)
        #expect(root.route == .tabs)
        #expect(!root.createsClubOnArrival)
    }

    @Test func leavingSignInFromTheAgeForgetsCreateAClub() async throws {
        let auth = FakeAuth(verify: [.success(stored), .success(stored)])
        let accounts = FakeAccounts(
            me: [.success(account()), .success(leila)], clubs: [.success(list())])
        let root = root(accounts, auth: auth)
        await root.start()
        let first = try #require(root.signIn)
        first.choose(.createClub)
        await signIn(first)
        #expect(root.route == .confirmAge)
        await root.leave()
        // Handoff 1: Leave sign-in returns to Welcome, with nothing chosen.
        let second = try #require(root.signIn)
        #expect(second !== first)
        #expect(second.showsWelcome)
        #expect(second.way == nil)
        second.choose(.signIn)
        await signIn(second)
        #expect(root.route == .tabs)
        #expect(!root.createsClubOnArrival)
    }

    @Test func aLinkOpenedAfterCreateAClubReplacesIt() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs,
            auth: auth)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.choose(.createClub)
        await root.open(token)
        // A02-email stays where it is; the newer intent replaces Create a club's.
        #expect(signIn.way == .signIn)
        #expect(signIn.showsWelcome)
        await self.signIn(signIn)
        #expect(root.route == .tabs)
        #expect(!root.createsClubOnArrival)
        #expect(root.invitation?.state == .open(Kitchen.roster()))
    }

    // MARK: I have an invite

    @Test func iHaveAnInviteHoldsTheLinkThroughSignInAndChecksNothingBefore() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(me: [.success(leila)], clubs: [.success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(accounts, clubs: clubs, auth: auth)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.choose(.invitation)
        let entry = try #require(signIn.linkEntry)
        #expect(!entry.checks)
        entry.text = link
        await entry.proceed()
        #expect(entry.isHeld)
        // Nothing checked, nothing of the club, before sign-in (book p9; handoff 2).
        #expect(clubs.calls.isEmpty)
        #expect(entry.invitation == nil)
        await self.signIn(signIn)
        #expect(root.route == .tabs)
        #expect(accounts.calls == ["me", "clubs"])
        #expect(root.invitation?.state == .open(Kitchen.roster()))
        #expect(clubs.calls == ["preview 01"])
        #expect(!root.createsClubOnArrival)
    }

    @Test func backFromTheEmailScreenToThePasteStepLetsTheLinkGoAndKeepsTheText() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let clubs = ScriptedClubs()
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs,
            auth: auth)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.choose(.invitation)
        let entry = try #require(signIn.linkEntry)
        entry.text = link
        await entry.proceed()
        signIn.returnToLinkEntry()
        #expect(!entry.isHeld)
        #expect(entry.text == link)
        #expect(entry.canContinue)
        #expect(signIn.way == .invitation)
        signIn.returnToWelcome()
        #expect(signIn.linkEntry == nil)
        signIn.choose(.signIn)
        await self.signIn(signIn)
        #expect(root.route == .tabs)
        #expect(root.invitation == nil)
        #expect(clubs.calls.isEmpty)
    }

    @Test func backToWelcomeFromAHeldLinkLetsItGo() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let clubs = ScriptedClubs()
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs,
            auth: auth)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.choose(.invitation)
        let entry = try #require(signIn.linkEntry)
        entry.text = link
        await entry.proceed()
        // Back past the paste step at once (the back button's menu): the link goes with it.
        signIn.returnToWelcome()
        #expect(!entry.isHeld)
        #expect(!entry.canContinue)
        signIn.choose(.createClub)
        await self.signIn(signIn)
        #expect(root.invitation == nil)
        #expect(clubs.calls.isEmpty)
        #expect(root.createsClubOnArrival)
    }

    @Test func backToWelcomeLetsALinkReceivedSinceGo() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let clubs = ScriptedClubs()
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs,
            auth: auth)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.choose(.signIn)
        await root.open(token)
        signIn.returnToWelcome()
        signIn.choose(.signIn)
        await self.signIn(signIn)
        #expect(root.route == .tabs)
        #expect(root.invitation == nil)
        #expect(clubs.calls.isEmpty)
    }

    @Test func aPasteStepsBackLetsOnlyItsOwnLinkGo() async throws {
        // A link received while A02-email is over the paste step replaces the pasted one, and
        // Back to the paste step lets go of the pasted one alone, which no longer holds.
        let auth = FakeAuth(verify: [.success(stored)])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs,
            auth: auth)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.choose(.invitation)
        let entry = try #require(signIn.linkEntry)
        entry.text = "https://tadayo.app/i#" + Kitchen.token(2).secret
        await entry.proceed()
        await root.open(token)
        signIn.returnToLinkEntry()
        await self.signIn(signIn)
        #expect(root.invitation?.state == .open(Kitchen.roster()))
        #expect(clubs.calls == ["preview 01"])
    }

    @Test func welcomeIsntShownAgainWhileACodeIsOnItsWay() async throws {
        let gate = Gate()
        let auth = FakeAuth()
        auth.duringSignIn = { await gate.wait() }
        let root = root(FakeAccounts(), auth: auth)
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.choose(.signIn)
        signIn.email = "leila@example.com"
        async let sent: Void = signIn.sendCode()
        await gate.reached()
        #expect(signIn.isSending)
        signIn.returnToWelcome()
        #expect(signIn.way == .signIn)
        gate.open()
        await sent
        #expect(signIn.step == .code)
    }

    @Test func backFromTheCodeToWelcomeChangesTheAddressFirst() async throws {
        let root = root(FakeAccounts())
        await root.start()
        let signIn = try #require(root.signIn)
        signIn.choose(.signIn)
        signIn.email = "leila@example.com"
        await signIn.sendCode()
        #expect(signIn.step == .code)
        signIn.returnToWelcome()
        #expect(signIn.step == .email)
        #expect(signIn.way == nil)
        #expect(signIn.email == "leila@example.com")
    }
}
