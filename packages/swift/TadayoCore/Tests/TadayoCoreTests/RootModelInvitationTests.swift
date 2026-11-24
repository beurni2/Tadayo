import Foundation
import Testing

@testable import TadayoCore

/// The root's invitations: a link opened, held through sign-in, the club list's accepted
/// invitations, and the paste step (`docs/plans/ios-b1-invitation.md` section 1).
@MainActor @Suite struct RootModelInvitationTests {
    // Thursday 5 November 2026, 3:00 AM UTC, as the device's clock reads it.
    let start = Date(timeIntervalSince1970: 1_793_847_600)
    var stored: AuthSession {
        AuthSession(
            accessToken: "access-1", refreshToken: "refresh-1",
            expiresAt: start.addingTimeInterval(3600))
    }
    let leila = account(name: "Leila", age: true, version: 2)
    let maya = Account(
        id: "acct_maya", displayName: "Maya", avatarVersion: nil, ageConfirmed: true, version: 1)
    let token = Kitchen.token(1)
    var link: String { "https://tadayo.app/i#" + token.secret }

    func list(_ clubs: [ClubSummary] = [], invitations: [MyInvitation] = []) -> ClubList {
        ClubList(
            serverClock: ServerClock(serverNow: start, receivedAt: .now), clubs: clubs,
            invitations: invitations)
    }

    var kitchen: ClubSummary {
        ClubSummary(ref: Kitchen.ref, state: .active, memberCount: 5, openDay: nil, nextDay: nil)
    }

    func accepted(_ state: MyInvitationState, id: String = "inv_leila") -> MyInvitation {
        MyInvitation(invitationID: id, clubName: "Kitchen table", inviterName: "Ben", state: state)
    }

    func root(
        _ accounts: FakeAccounts, clubs: ScriptedClubs = ScriptedClubs(),
        auth: FakeAuth = FakeAuth(), signedIn: Bool = true,
        selection: any ClubSelectionStore = InMemoryClubSelection(),
        links: InvitationLinkBook = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
    ) -> RootModel {
        let clock = ManualContinuousClock()
        return RootModel(
            session: SessionManager(
                auth: auth, store: signedIn ? InMemorySessionStore(stored) : InMemorySessionStore(),
                now: { [start] in start }),
            auth: auth, accounts: accounts, clubs: clubs, selection: selection, links: links,
            now: { clock.now }, sleep: { clock.sleep(until: $0) })
    }

    // MARK: A link opened

    @Test func aLinkWhileTheTabsShowIsPresentedAndChecked() async throws {
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs)
        await root.start()
        #expect(root.invitation == nil)
        await root.open(token)
        let invitation = try #require(root.invitation)
        #expect(invitation.state == .open(Kitchen.roster()))
        #expect(clubs.calls == ["preview 01"])
    }

    @Test func aLinkBeforeSignInIsHeldAndShownOnlyOnceTheTabsShowAfterTheList() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(me: [.success(leila)], clubs: [.success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(accounts, clubs: clubs, auth: auth, signedIn: false)
        await root.start()
        #expect(root.route == .signIn)
        await root.open(token)
        // Nothing checked, nothing of the club, before sign-in (book p9).
        #expect(root.invitation == nil)
        #expect(clubs.calls.isEmpty)
        let signIn = try #require(root.signIn)
        signIn.email = "leila@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        await signIn.verify()
        #expect(root.route == .tabs)
        #expect(accounts.calls == ["me", "clubs"])
        #expect(root.invitation?.state == .open(Kitchen.roster()))
        #expect(clubs.calls == ["preview 01"])
    }

    @Test func aLinkWhileTheAccountIsReadIsHeldUntilTheTabsShow() async {
        let accounts = FakeAccounts(me: [.success(leila)], clubs: [.success(list())])
        let gate = Gate()
        accounts.duringMe = { await gate.wait() }
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(accounts, clubs: clubs)
        async let started: Void = root.start()
        await gate.reached()
        #expect(root.route == .reading)
        await root.open(token)
        #expect(root.invitation == nil)
        gate.open()
        await started
        #expect(root.invitation?.state == .open(Kitchen.roster()))
    }

    @Test func aLinkWhileTheProfileIsIncompleteWaitsForTheTabs() async throws {
        let accounts = FakeAccounts(
            me: [.success(account())],
            update: [
                .success(account(age: true, version: 1)),
                .success(account(name: "Leila", age: true, version: 2)),
            ],
            clubs: [.success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(accounts, clubs: clubs)
        await root.start()
        #expect(root.route == .confirmAge)
        await root.open(token)
        #expect(root.invitation == nil)
        #expect(clubs.calls.isEmpty)
        let profile = try #require(root.profile)
        await profile.confirmAge()
        #expect(root.route == .profile)
        #expect(root.invitation == nil)
        profile.name = "Leila"
        await profile.saveName()
        #expect(root.route == .tabs)
        #expect(root.invitation?.state == .open(Kitchen.roster()))
        #expect(clubs.calls == ["preview 01"])
        #expect(accounts.calls.last == "clubs")
    }

    @Test func anAccountFoundIncompleteHoldsTheShownInvitationUntilTheTabsShowAgain() async throws {
        let accounts = FakeAccounts(
            me: [.success(leila), .success(account(age: true, version: 3))],
            update: [.success(account(name: "Leila", age: true, version: 4))],
            clubs: [.success(list()), .failure(.profileIncomplete), .success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [
            .success(.open(Kitchen.roster())), .success(.open(Kitchen.roster())),
        ]
        let root = root(accounts, clubs: clubs)
        await root.start()
        let entry = try #require(root.linkEntry())
        await root.open(token)
        let shown = try #require(root.invitation)
        // The list says the profile is incomplete, and the account reads so.
        await root.retry()
        #expect(root.route == .profile)
        // Nothing of the club while the account is incomplete, and no Accept from it.
        #expect(root.invitation == nil)
        await shown.accept()
        // The paste step made on the tabs checks nothing while they don't show.
        entry.text = link
        await entry.proceed()
        #expect(entry.invitation == nil)
        #expect(!entry.isChecking)
        #expect(clubs.calls == ["preview 01"])
        let profile = try #require(root.profile)
        profile.name = "Leila"
        await profile.saveName()
        #expect(root.route == .tabs)
        #expect(root.invitation !== shown)
        #expect(root.invitation?.state == .open(Kitchen.roster()))
        #expect(clubs.calls == ["preview 01", "preview 01"])
    }

    @Test func aNewerLinkReplacesAHeldOne() async {
        let auth = FakeAuth(verify: [.success(stored)])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs,
            auth: auth, signedIn: false)
        await root.start()
        await root.open(Kitchen.token(1))
        await root.open(Kitchen.token(2))
        let signIn = root.signIn!
        signIn.email = "leila@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        await signIn.verify()
        #expect(clubs.calls == ["preview 02"])
    }

    @Test func aNewerLinkReplacesAPresentedOne() async {
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [
            .success(.open(Kitchen.roster())), .success(.expired(inviterName: "Ben")),
        ]
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs)
        await root.start()
        await root.open(Kitchen.token(1))
        let first = root.invitation
        await root.open(Kitchen.token(2))
        #expect(root.invitation !== first)
        #expect(root.invitation?.state == .expired(inviterName: "Ben"))
        #expect(clubs.calls == ["preview 01", "preview 02"])
    }

    @Test func aReplacedInvitationsLateAnswerKeepsNothing() async {
        let links = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let clubs = ScriptedClubs()
        // The second link's preview passes the gate first, so it takes the first answer.
        clubs.previewAnswers = [
            .success(.open(Kitchen.roster())), .success(.waiting(Kitchen.roster())),
        ]
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs,
            links: links)
        await root.start()
        let gate = Gate()
        clubs.duringPreview = { await gate.wait() }
        async let first: Void = root.open(Kitchen.token(1))
        await gate.reached()
        clubs.duringPreview = {}
        await root.open(Kitchen.token(2))
        gate.open()
        await first
        #expect(clubs.calls == ["preview 02", "preview 01"])
        #expect(root.invitation?.state == .open(Kitchen.roster()))
        #expect(links.received(Kitchen.token(1), account: leila.id) == nil)
    }

    @Test func aLinkSetAsideForAnAccountNeverReachesAnotherAccount() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(maya)],
            clubs: [
                .success(list(invitations: [accepted(.rosterChanged)])), .failure(.signedOut),
                .success(list()),
            ])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.changed(Kitchen.roster(you: "Leila", revision: "rev_2")))]
        let links = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        links.keepReceived(token, invitation: "inv_leila", account: leila.id)
        let root = root(accounts, clubs: clubs, auth: auth, links: links)
        await root.start()
        // Leila's kept token, checked from her changed row.
        await root.openAccepted(accepted(.rosterChanged))
        #expect(root.invitation?.token == token)
        #expect(clubs.calls == ["preview 01"])
        // The server ends the session: the token is purged from the book and held for Leila.
        await root.retry()
        #expect(root.route == .signIn)
        #expect(links.received(token, account: leila.id) == nil)
        #expect(root.acceptedInvitations.isEmpty)
        let signIn = try #require(root.signIn)
        signIn.email = "maya@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        await signIn.verify()
        // Maya's session sends nothing of it and shows nothing, Leila's row among it.
        #expect(root.account?.id == "acct_maya")
        #expect(root.invitation == nil)
        #expect(root.acceptedInvitations.isEmpty)
        #expect(clubs.calls == ["preview 01"])
    }

    @Test func aWaitingRowHoldsNoLinkThroughTheServersEnding() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(leila)],
            clubs: [
                .success(list(invitations: [accepted(.waiting)])), .failure(.signedOut),
                .success(list(invitations: [accepted(.waiting)])),
            ])
        let clubs = ScriptedClubs()
        let links = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        links.keepReceived(token, invitation: "inv_leila", account: leila.id)
        let root = root(accounts, clubs: clubs, auth: auth, links: links)
        await root.start()
        // Shown from the list's words: no call, and the model holds no token.
        await root.openAccepted(accepted(.waiting))
        #expect(root.invitation?.state == .waiting(clubName: "Kitchen table"))
        #expect(root.invitation?.token == nil)
        await root.retry()
        #expect(root.route == .signIn)
        let signIn = try #require(root.signIn)
        signIn.email = "leila@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        await signIn.verify()
        // Leila again: her row from the list, and nothing checked or shown that she didn't ask for.
        #expect(root.account?.id == leila.id)
        #expect(root.acceptedInvitations.map(\.id) == ["inv_leila"])
        #expect(root.invitation == nil)
        #expect(clubs.calls.isEmpty)
    }

    @Test func aLinkHeldWhileTheAccountIsReadWaitsThroughTheServersEnding() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(
            me: [.failure(.signedOut), .success(leila)], clubs: [.success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(accounts, clubs: clubs, auth: auth)
        let gate = Gate()
        accounts.duringMe = { await gate.wait() }
        async let started: Void = root.start()
        await gate.reached()
        await root.open(token)
        accounts.duringMe = {}
        gate.open()
        await started
        #expect(root.route == .signIn)
        #expect(root.signIn?.signInEnded == true)
        #expect(clubs.calls.isEmpty)
        let signIn = try #require(root.signIn)
        signIn.email = "leila@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        await signIn.verify()
        #expect(root.route == .tabs)
        #expect(root.invitation?.state == .open(Kitchen.roster()))
        #expect(clubs.calls == ["preview 01"])
    }

    @Test func aLinkHeldInALaterSessionWaitsForThatSessionsTabs() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(leila)], clubs: [.success(list()), .success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(accounts, clubs: clubs, auth: auth)
        let firstList = Gate()
        accounts.duringClubs = { await firstList.wait() }
        async let started: Void = root.start()
        await firstList.reached()
        accounts.duringClubs = {}
        await root.leave()
        let signIn = try #require(root.signIn)
        signIn.email = "leila@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        let read = Gate()
        accounts.duringMe = { await read.wait() }
        async let verified: Void = signIn.verify()
        await read.reached()
        #expect(root.route == .signIn)
        await root.open(token)
        firstList.open()
        await started
        // The earlier session's list, answered now, presents nothing of this session's link.
        #expect(root.invitation == nil)
        #expect(clubs.calls.isEmpty)
        read.open()
        await verified
        #expect(root.route == .tabs)
        #expect(root.invitation?.state == .open(Kitchen.roster()))
        #expect(clubs.calls == ["preview 01"])
        #expect(accounts.calls == ["me", "clubs", "me", "clubs"])
    }

    @Test func aLinkHeldForAnAccountIsLetGoOnceAnotherAccountShowsIncomplete() async throws {
        let auth = FakeAuth(verify: [.success(stored), .success(stored)])
        let incompleteMaya = Account(
            id: "acct_maya", displayName: nil, avatarVersion: nil, ageConfirmed: true, version: 1)
        let accounts = FakeAccounts(
            me: [.success(leila), .success(incompleteMaya), .success(leila)],
            update: [.failure(.signedOut)],
            clubs: [.success(list()), .failure(.signedOut), .success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(accounts, clubs: clubs, auth: auth)
        await root.start()
        await root.open(token)
        #expect(root.invitation?.state == .open(Kitchen.roster()))
        // The server ends Leila's session: the link is held for Leila.
        await root.retry()
        #expect(root.route == .signIn)
        try await signIn(root, as: "maya@example.com")
        // Maya's account shows, incomplete: Leila's link is let go.
        #expect(root.route == .profile)
        let profile = try #require(root.profile)
        profile.name = "Maya"
        await profile.saveName()
        // The server ends Maya's session before the tabs show, and Leila signs in again.
        #expect(root.route == .signIn)
        try await signIn(root, as: "leila@example.com")
        #expect(root.route == .tabs)
        #expect(root.account?.id == leila.id)
        #expect(root.invitation == nil)
        #expect(clubs.calls == ["preview 01"])
    }

    @Test func aLinkOpenedOnAnAccountsProfileStepNeverReachesAnotherAccount() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(
            me: [.success(account(age: true, version: 1)), .success(maya)],
            update: [.failure(.signedOut)],
            clubs: [.success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(accounts, clubs: clubs, auth: auth)
        await root.start()
        #expect(root.route == .profile)
        await root.open(token)
        let profile = try #require(root.profile)
        profile.name = "Leila"
        await profile.saveName()
        // The server ends Leila's session on A03-profile, and Maya signs in.
        #expect(root.route == .signIn)
        try await signIn(root, as: "maya@example.com")
        #expect(root.route == .tabs)
        #expect(root.account?.id == "acct_maya")
        #expect(root.invitation == nil)
        #expect(clubs.calls.isEmpty)
    }

    @Test func aLinkOpenedBeforeSignInIsTheFirstAccountsThatShows() async throws {
        let auth = FakeAuth(verify: [.success(stored), .success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(maya)],
            clubs: [.failure(.signedOut), .success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(accounts, clubs: clubs, auth: auth, signedIn: false)
        await root.start()
        await root.open(token)
        try await signIn(root, as: "leila@example.com")
        // Leila's tabs showed, and the server ended the session while the list was read.
        #expect(root.route == .signIn)
        try await signIn(root, as: "maya@example.com")
        #expect(root.route == .tabs)
        #expect(root.account?.id == "acct_maya")
        #expect(root.invitation == nil)
        #expect(clubs.calls.isEmpty)
    }

    @Test func aLinkOpenedBeforeSignInStaysWithAnAccountThatShowsIncomplete() async throws {
        let auth = FakeAuth(verify: [.success(stored), .success(stored)])
        let accounts = FakeAccounts(
            me: [.success(account()), .success(maya)],
            update: [.failure(.signedOut)],
            clubs: [.success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(accounts, clubs: clubs, auth: auth, signedIn: false)
        await root.start()
        await root.open(token)
        try await signIn(root, as: "leila@example.com")
        #expect(root.route == .confirmAge)
        // The server ends the session on A02-age, and Maya signs in.
        let profile = try #require(root.profile)
        await profile.confirmAge()
        #expect(root.route == .signIn)
        try await signIn(root, as: "maya@example.com")
        #expect(root.route == .tabs)
        #expect(root.account?.id == "acct_maya")
        #expect(root.invitation == nil)
        #expect(clubs.calls.isEmpty)
    }

    @Test func aLinkOpenedWhileAKeptSessionsAccountIsReadIsThatAccounts() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(maya)],
            clubs: [.failure(.signedOut), .success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(accounts, clubs: clubs, auth: auth)
        let gate = Gate()
        accounts.duringMe = { await gate.wait() }
        async let started: Void = root.start()
        await gate.reached()
        accounts.duringMe = {}
        // The link that launched the app, while the kept session's account is read.
        await root.open(token)
        gate.open()
        await started
        #expect(root.route == .signIn)
        try await signIn(root, as: "maya@example.com")
        #expect(root.route == .tabs)
        #expect(root.account?.id == "acct_maya")
        #expect(root.invitation == nil)
        #expect(clubs.calls.isEmpty)
    }

    @Test func aLinkOpenedBeforeSignInWaitsForTheSameAccountThroughTheServersEnding()
        async throws
    {
        let auth = FakeAuth(verify: [.success(stored), .success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(leila)],
            clubs: [.failure(.signedOut), .success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(accounts, clubs: clubs, auth: auth, signedIn: false)
        await root.start()
        await root.open(token)
        try await signIn(root, as: "leila@example.com")
        #expect(root.route == .signIn)
        try await signIn(root, as: "leila@example.com")
        #expect(root.route == .tabs)
        #expect(root.invitation?.state == .open(Kitchen.roster()))
        #expect(clubs.calls == ["preview 01"])
    }

    @Test func aLinkOpenedWhileTheListIsReadIsntReplacedByAnOlderHeldOne() async {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(me: [.success(leila)], clubs: [.success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(accounts, clubs: clubs, auth: auth, signedIn: false)
        await root.start()
        await root.open(Kitchen.token(1))
        let gate = Gate()
        accounts.duringClubs = { await gate.wait() }
        let signIn = root.signIn!
        signIn.email = "leila@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        async let verified: Void = signIn.verify()
        await gate.reached()
        #expect(root.route == .tabs)
        await root.open(Kitchen.token(2))
        gate.open()
        await verified
        #expect(clubs.calls == ["preview 02"])
    }

    @Test func leaveSignInForgetsTheHeldAndThePresentedInvitation() async throws {
        let auth = FakeAuth(verify: [.success(stored), .success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(maya)], clubs: [.success(list()), .success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.waiting(Kitchen.roster()))]
        let links = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let root = root(accounts, clubs: clubs, auth: auth, links: links)
        await root.start()
        await root.open(token)
        #expect(root.invitation != nil)
        #expect(links.received(token, account: leila.id) != nil)
        await root.leave()
        #expect(root.invitation == nil)
        // The kept token goes with the links (T11).
        #expect(links.received(token, account: leila.id) == nil)
        // A link held during sign-in goes too, so the next account never sees it.
        await root.open(Kitchen.token(2))
        await root.leave()
        let signIn = try #require(root.signIn)
        signIn.email = "maya@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        await signIn.verify()
        #expect(root.route == .tabs)
        #expect(root.account?.id == "acct_maya")
        #expect(root.invitation == nil)
        #expect(links.received(token, account: maya.id) == nil)
        #expect(links.received(token, account: leila.id) == nil)
        #expect(clubs.calls == ["preview 01"])
    }

    @Test func anInvitationMadeBeforeLeaveSignInChangesNothingAfterIt() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(me: [.success(leila)], clubs: [.success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        clubs.acceptAnswers = [.success(.joined(Kitchen.ref))]
        let selection = InMemoryClubSelection()
        let root = root(accounts, clubs: clubs, auth: auth, selection: selection)
        await root.start()
        await root.open(token)
        let invitation = try #require(root.invitation)
        let gate = Gate()
        clubs.duringAccept = { await gate.wait() }
        async let accepted: Void = invitation.accept()
        await gate.reached()
        await root.leave()
        gate.open()
        await accepted
        #expect(root.route == .signIn)
        #expect(selection.club(for: leila.id) == nil)
        #expect(accounts.calls == ["me", "clubs"])
    }

    // MARK: Joined

    @Test func joinedKeepsTheClubSelectedReadsTheListAndThenCloses() async throws {
        let accounts = FakeAccounts(
            me: [.success(leila)], clubs: [.success(list()), .success(list([kitchen]))])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        clubs.acceptAnswers = [.success(.joined(Kitchen.ref))]
        let selection = InMemoryClubSelection()
        let root = root(accounts, clubs: clubs, selection: selection)
        await root.start()
        await root.open(token)
        let invitation = try #require(root.invitation)
        let gate = Gate()
        accounts.duringClubs = { await gate.wait() }
        async let accepted: Void = invitation.accept()
        await gate.reached()
        // "Opening Kitchen table…" while the list is read again.
        #expect(root.invitation?.state == .opening(Kitchen.ref))
        #expect(selection.club(for: leila.id) == "club_kitchen")
        gate.open()
        await accepted
        #expect(root.invitation == nil)
        #expect(root.selectedClubID == "club_kitchen")
        #expect(accounts.calls == ["me", "clubs", "clubs"])
    }

    @Test func aJoinedLinkOpensTheClub() async {
        let accounts = FakeAccounts(
            me: [.success(leila)], clubs: [.success(list()), .success(list([kitchen]))])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.joined(Kitchen.ref))]
        let root = root(accounts, clubs: clubs)
        await root.start()
        await root.open(token)
        #expect(root.invitation == nil)
        #expect(root.selectedClubID == "club_kitchen")
    }

    @Test func closingGrantsNothing() async {
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs)
        await root.start()
        await root.open(token)
        root.closeInvitation()
        #expect(root.invitation == nil)
        #expect(clubs.calls == ["preview 01"])
    }

    @Test func aSignedOutAnswerEndsTheSessionAndTheLinkWaitsForTheNextSignIn() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(leila)], clubs: [.success(list()), .success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [
            .success(.waiting(Kitchen.roster())), .failure(.signedOut),
            .success(.open(Kitchen.roster())),
        ]
        let links = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let root = root(accounts, clubs: clubs, auth: auth, links: links)
        await root.start()
        await root.open(token)
        #expect(links.received(token, account: leila.id) != nil)
        await root.invitation?.check()
        #expect(root.route == .signIn)
        #expect(root.invitation == nil)
        #expect(root.signIn?.signInEnded == true)
        // The kept tokens go with the session (T11); the link is held, in memory only, through
        // the next sign-in (book p9).
        #expect(links.received(token, account: leila.id) == nil)
        let signIn = try #require(root.signIn)
        signIn.email = "leila@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        await signIn.verify()
        #expect(root.route == .tabs)
        #expect(root.invitation?.state == .open(Kitchen.roster()))
        #expect(clubs.calls == ["preview 01", "preview 01", "preview 01"])
    }

    // MARK: The club list's accepted invitations

    @Test func aWaitingInvitationShowsFromTheListsWordsWithNoCall() async {
        let clubs = ScriptedClubs()
        let invitations = [accepted(.waiting)]
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list(invitations: invitations))]),
            clubs: clubs)
        await root.start()
        await root.openAccepted(invitations[0])
        #expect(root.invitation?.state == .waiting(clubName: "Kitchen table"))
        #expect(clubs.calls.isEmpty)
    }

    @Test func anInvitationThatDidntGoAheadNamesOnlyTheInviterAndDropsItsToken() async {
        let clubs = ScriptedClubs()
        let invitations = [accepted(.didNotGoAhead)]
        let links = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list(invitations: invitations))]),
            clubs: clubs, links: links)
        await root.start()
        // Kept after the list's read (an Accept answered while it was out), so the list's settling
        // left it.
        links.keepReceived(token, invitation: "inv_leila", account: leila.id)
        await root.openAccepted(invitations[0])
        #expect(root.invitation?.state == .didNotGoAhead(inviterName: "Ben"))
        #expect(links.received(token, account: leila.id) == nil)
        #expect(clubs.calls.isEmpty)
    }

    @Test func aChangedInvitationWithItsTokenKeptIsChecked() async {
        let links = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        links.keepReceived(token, invitation: "inv_leila", account: leila.id, nameChanged: true)
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.changed(Kitchen.roster(you: "Debby", revision: "rev_2")))]
        let invitations = [accepted(.rosterChanged)]
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list(invitations: invitations))]),
            clubs: clubs, links: links)
        await root.start()
        // The list holds it as changed, so its token stays.
        #expect(links.received(token, account: leila.id) != nil)
        await root.openAccepted(invitations[0])
        #expect(
            root.invitation?.state
                == .changed(Kitchen.roster(you: "Debby", revision: "rev_2"), .notHeld))
        #expect(clubs.calls == ["preview 01"])
    }

    @Test func aLinkPastedForAChangedRowIsHeldOnceThePasteStepIsLeft() async throws {
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.changed(Kitchen.roster(revision: "rev_2")))]
        let root = root(
            FakeAccounts(
                me: [.success(leila)],
                clubs: [.success(list(invitations: [accepted(.rosterChanged)]))]),
            clubs: clubs)
        await root.start()
        #expect(root.acceptedInvitations.map(\.linkHeld) == [false])
        // The row's paste step: the link checked, its changed roster shown, then Not now.
        let entry = try #require(root.linkEntry())
        entry.pasted(link)
        await entry.proceed()
        #expect(entry.invitation?.state == .changed(Kitchen.roster(revision: "rev_2"), nil))
        entry.left()
        // The row now says the link is held, and opens the roster with no paste step.
        #expect(root.acceptedInvitations.map(\.linkHeld) == [true])
        clubs.previewAnswers = [.success(.changed(Kitchen.roster(revision: "rev_2")))]
        await root.openAccepted(accepted(.rosterChanged))
        #expect(root.invitation?.token == token)
        #expect(clubs.calls == ["preview 01", "preview 01"])
    }

    @Test func aHeldLinkTheCheckFindsGoneIsNoLongerHeldOnceClosed() async {
        let links = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        links.keepReceived(token, invitation: "inv_leila", account: leila.id)
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.failure(.notFound)]
        let root = root(
            FakeAccounts(
                me: [.success(leila)],
                clubs: [.success(list(invitations: [accepted(.rosterChanged)]))]),
            clubs: clubs, links: links)
        await root.start()
        #expect(root.acceptedInvitations.map(\.linkHeld) == [true])
        await root.openAccepted(accepted(.rosterChanged))
        #expect(root.invitation?.state == .unavailable)
        // Close invitation: the row asks for the link again.
        root.closeInvitation()
        #expect(root.acceptedInvitations.map(\.linkHeld) == [false])
        await root.openAccepted(accepted(.rosterChanged))
        #expect(
            root.invitation?.state == .reopenLink(clubName: "Kitchen table", inviterName: "Ben"))
    }

    @Test func aChangedRowWhoseKeptLinkHasJoinedGivesBackTheModelItOpened() async throws {
        // An Accept with no answer that the server made: the row's kept link, checked again,
        // answers joined. The root hands back the model it showed, now `opening`, so the tabs can
        // take its screen off in the same action (`TabsView.acceptedAnswered`), and lets it go.
        let links = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        links.keepReceived(token, invitation: "inv_leila", account: leila.id)
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.joined(Kitchen.ref))]
        let root = root(
            FakeAccounts(
                me: [.success(leila)],
                clubs: [
                    .success(list(invitations: [accepted(.rosterChanged)])),
                    .success(list([kitchen])),
                ]),
            clubs: clubs, links: links)
        await root.start()
        let opened = try #require(await root.openAccepted(accepted(.rosterChanged)))
        #expect(opened.state == .opening(Kitchen.ref))
        #expect(root.invitation == nil)
        #expect(root.selectedClubID == "club_kitchen")
        #expect(clubs.calls == ["preview 01"])
    }

    @Test func eachAcceptedRowGivesBackTheModelTheRootShows() async throws {
        let root = root(
            FakeAccounts(
                me: [.success(leila)],
                clubs: [.success(list(invitations: [accepted(.waiting)]))]))
        await root.start()
        let waiting = try #require(await root.openAccepted(accepted(.waiting)))
        #expect(waiting === root.invitation)
        let declined = try #require(await root.openAccepted(accepted(.didNotGoAhead)))
        #expect(declined === root.invitation)
        let reopen = try #require(await root.openAccepted(accepted(.rosterChanged)))
        #expect(reopen === root.invitation)
    }

    @Test func aChangedInvitationWithNoTokenKeptAsksForTheLinkAgain() async {
        let clubs = ScriptedClubs()
        let invitations = [accepted(.rosterChanged)]
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list(invitations: invitations))]),
            clubs: clubs)
        await root.start()
        await root.openAccepted(invitations[0])
        #expect(
            root.invitation?.state == .reopenLink(clubName: "Kitchen table", inviterName: "Ben"))
        #expect(clubs.calls.isEmpty)
    }

    @Test func theListDropsATokenWhoseInvitationEnded() async {
        let links = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        links.keepReceived(token, invitation: "inv_leila", account: leila.id)
        let root = root(
            FakeAccounts(
                me: [.success(leila)],
                clubs: [.success(list(invitations: [accepted(.didNotGoAhead)]))]),
            links: links)
        await root.start()
        #expect(links.received(token, account: leila.id) == nil)
    }

    /// Handoff 9's `acceptedInvitations`: the rows are the list's, in its order, with no club
    /// selected, and a changed one says whether this phone holds its link (FQ136).
    @Test func anAccountWithOnlyAcceptedInvitationsHasNoClubAndTheirRowsInTheListsOrder() async {
        let invitations = [
            accepted(.rosterChanged, id: "inv_b"), accepted(.waiting, id: "inv_a"),
            accepted(.didNotGoAhead, id: "inv_c"),
        ]
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list(invitations: invitations))]))
        await root.start()
        #expect(root.clubs == .noClub)
        #expect(root.selectedClubID == nil)
        #expect(root.acceptedInvitations.map(\.invitation) == invitations)
        #expect(root.acceptedInvitations.map(\.linkHeld) == [false, false, false])
    }

    @Test func aListWithClubsKeepsItsInvitationsBesideThem() async {
        let invitations = [accepted(.waiting)]
        let root = root(
            FakeAccounts(
                me: [.success(leila)],
                clubs: [.success(list([kitchen], invitations: invitations))]))
        await root.start()
        guard case .listed(let shown) = root.clubs else {
            Issue.record("\(root.clubs)")
            return
        }
        #expect(shown.clubs == [kitchen])
        #expect(root.selectedClubID == Kitchen.ref.id)
        #expect(root.acceptedInvitations.map(\.invitation) == invitations)
    }

    @Test func aChangedRowSaysWhetherThisPhoneHoldsItsLinkForThisAccountAlone() async {
        let links = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        links.keepReceived(token, invitation: "inv_leila", account: leila.id)
        let root = root(
            FakeAccounts(
                me: [.success(leila)],
                clubs: [
                    .success(
                        list(invitations: [
                            accepted(.rosterChanged), accepted(.rosterChanged, id: "inv_other"),
                        ]))
                ]),
            links: links)
        await root.start()
        #expect(root.acceptedInvitations.map(\.linkHeld) == [true, false])
        // Another account's token is never this account's (T11): the book starts Maya's file in
        // Leila's place, so Leila's next read holds no link at all.
        let mayas = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        mayas.keepReceived(token, invitation: "inv_leila", account: maya.id)
        let other = self.root(
            FakeAccounts(
                me: [.success(leila)],
                clubs: [.success(list(invitations: [accepted(.rosterChanged)]))]),
            links: mayas)
        await other.start()
        #expect(other.acceptedInvitations.map(\.linkHeld) == [false])
    }

    @Test func theRowsAreOnlyWhatTheLastReadSaid() async {
        let accounts = FakeAccounts(
            me: [.success(leila)],
            clubs: [
                .success(list(invitations: [accepted(.waiting)])), .failure(.network),
                .success(list(invitations: [accepted(.waiting)])), .success(list([kitchen])),
            ])
        let root = root(accounts)
        await root.start()
        #expect(root.acceptedInvitations.count == 1)
        // A read that failed shows none: the failure, with Retry.
        await root.loadClubs()
        #expect(root.clubs == .failed(.network))
        #expect(root.acceptedInvitations.isEmpty)
        await root.loadClubs()
        #expect(root.acceptedInvitations.count == 1)
        // Joined: the row goes with the list's next read, and the club is listed.
        await root.loadClubs()
        #expect(root.acceptedInvitations.isEmpty)
        #expect(root.selectedClubID == Kitchen.ref.id)
    }

    @Test func anAcceptThatWaitsReadsTheListAgainSoItsRowShows() async throws {
        let accounts = FakeAccounts(
            me: [.success(leila)],
            clubs: [.success(list()), .success(list(invitations: [accepted(.waiting)]))])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        clubs.acceptAnswers = [.success(.waiting)]
        let root = root(accounts, clubs: clubs)
        await root.start()
        #expect(root.acceptedInvitations.isEmpty)
        let entry = try #require(root.linkEntry())
        entry.text = link
        await entry.proceed()
        let invitation = try #require(entry.invitation)
        await invitation.accept()
        // G03-waiting stays shown over Home, whose row is there for Done.
        #expect(entry.invitation === invitation)
        #expect(invitation.state == .waiting(clubName: "Kitchen table"))
        #expect(accounts.calls == ["me", "clubs", "clubs"])
        #expect(root.clubs == .noClub)
        #expect(root.acceptedInvitations.map(\.id) == ["inv_leila"])
        #expect(root.acceptedInvitations.first?.linkHeld == true)
    }

    @Test func anAcceptThatWaitsInAnEndedSessionReadsNothing() async throws {
        let accounts = FakeAccounts(
            me: [.success(leila)], clubs: [.success(list()), .success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        clubs.acceptAnswers = [.success(.waiting)]
        let root = root(accounts, clubs: clubs)
        await root.start()
        await root.open(token)
        let invitation = try #require(root.invitation)
        let gate = Gate()
        clubs.duringAccept = { await gate.wait() }
        async let accepted: Void = invitation.accept()
        await gate.reached()
        await root.leave()
        gate.open()
        await accepted
        // The model's own `current()` drops the answer before it says it waits.
        #expect(accounts.calls == ["me", "clubs"])
    }

    @Test func anAcceptThatWaitsWhileTheTabsDontShowReadsNothing() async throws {
        let accounts = FakeAccounts(
            me: [.success(leila), .success(account(age: true, version: 3))],
            clubs: [.success(list()), .failure(.profileIncomplete)])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        clubs.acceptAnswers = [.success(.waiting)]
        let root = root(accounts, clubs: clubs)
        await root.start()
        await root.open(token)
        let invitation = try #require(root.invitation)
        let gate = Gate()
        clubs.duringAccept = { await gate.wait() }
        async let accepted: Void = invitation.accept()
        await gate.reached()
        // The list says the profile is incomplete, and the account reads so: the same session,
        // on the profile, the invitation set aside.
        await root.retry()
        #expect(root.route == .profile)
        gate.open()
        await accepted
        // The server leaves it waiting, and no list is read while the tabs don't show.
        #expect(accounts.calls == ["me", "clubs", "clubs", "me"])
    }

    @Test func theRowsGoWithTheAccountAtLeaveSignIn() async {
        let root = root(
            FakeAccounts(
                me: [.success(leila)], clubs: [.success(list(invitations: [accepted(.waiting)]))]))
        await root.start()
        #expect(root.acceptedInvitations.count == 1)
        await root.leave()
        #expect(root.route == .signIn)
        #expect(root.acceptedInvitations.isEmpty)
    }

    @Test func nothingOpensOutsideTheTabs() async {
        let root = root(FakeAccounts(me: [.success(account())]))
        await root.start()
        await root.openAccepted(accepted(.waiting))
        #expect(root.invitation == nil)
        #expect(root.linkEntry() == nil)
    }

    // MARK: The paste step

    @Test func thePasteStepChecksALinkOnItsOwnScreen() async throws {
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.failure(.network), .failure(.refused), .failure(.notFound)]
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs)
        await root.start()
        let entry = try #require(root.linkEntry())
        let link = "https://tadayo.app/i#" + token.secret
        entry.pasted(link)
        await entry.proceed()
        #expect(entry.problem == .cannotCheck(.network))
        #expect(entry.text == link)
        #expect(entry.invitation == nil)
        await entry.proceed()
        #expect(entry.problem == .cannotCheck(.other))
        await entry.proceed()
        #expect(entry.problem == nil)
        #expect(entry.invitation?.state == .unavailable)
        // Shown from the paste step, not over the tabs.
        #expect(root.invitation == nil)
        #expect(clubs.calls == ["preview 01", "preview 01", "preview 01"])
        // Back finds the text as it was.
        entry.returned()
        #expect(entry.invitation == nil)
        #expect(entry.text == link)
    }

    @Test func aPastedLinkToAClubTheAccountIsInOpensIt() async throws {
        let accounts = FakeAccounts(
            me: [.success(leila)], clubs: [.success(list()), .success(list([kitchen]))])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.joined(Kitchen.ref))]
        let selection = InMemoryClubSelection()
        let root = root(accounts, clubs: clubs, selection: selection)
        await root.start()
        let entry = try #require(root.linkEntry())
        entry.text = link
        await entry.proceed()
        // The club is kept as selected and the list read again while the link was checked;
        // nothing is left to show (handoff 8's joinedLink).
        #expect(entry.opened == Kitchen.ref)
        #expect(entry.invitation == nil)
        #expect(!entry.isChecking)
        #expect(root.invitation == nil)
        #expect(root.selectedClubID == "club_kitchen")
        #expect(selection.club(for: leila.id) == "club_kitchen")
        #expect(accounts.calls == ["me", "clubs", "clubs"])
    }

    @Test func aPasteStepWhoseSessionEndsDuringTheCheckShowsNothing() async throws {
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.waiting(Kitchen.roster()))]
        let links = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs,
            links: links)
        await root.start()
        let entry = try #require(root.linkEntry())
        entry.text = link
        let gate = Gate()
        clubs.duringPreview = { await gate.wait() }
        async let proceeded: Void = entry.proceed()
        await gate.reached()
        await root.leave()
        gate.open()
        await proceeded
        #expect(entry.invitation == nil)
        #expect(entry.problem == nil)
        #expect(!entry.isChecking)
        #expect(links.received(token, account: leila.id) == nil)
    }

    @Test func nothingTheRootOrItsInvitationPrintsHoldsALink() async throws {
        let secret = token.secret
        func printed(_ value: Any) -> [String] {
            var dumped = ""
            dump(value, to: &dumped)
            return [String(describing: value), String(reflecting: value), dumped]
        }
        // A link held before sign-in.
        let held = root(FakeAccounts(), signedIn: false)
        await held.start()
        await held.open(token)
        // A link presented, with its token kept.
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.waiting(Kitchen.roster()))]
        let links = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let shown = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs,
            links: links)
        await shown.start()
        await shown.open(token)
        let invitation = try #require(shown.invitation)
        #expect(links.received(token, account: leila.id) != nil)
        for value: Any in [held, shown, invitation, links] {
            for text in printed(value) {
                #expect(!text.contains(secret), "\(type(of: value))")
                #expect(!text.contains("tadayo.app/i"), "\(type(of: value))")
            }
        }
    }

    @Test func aPasteStepsCheckIsSetAsideWithAnAccountFoundIncomplete() async throws {
        let accounts = FakeAccounts(
            me: [.success(leila), .success(account(age: true, version: 3))],
            update: [.success(account(name: "Leila", age: true, version: 4))],
            clubs: [.success(list()), .failure(.profileIncomplete), .success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [
            .success(.waiting(Kitchen.roster())), .success(.waiting(Kitchen.roster())),
        ]
        let links = InvitationLinkBook(vault: InMemoryInvitationLinkVault())
        let root = root(accounts, clubs: clubs, links: links)
        await root.start()
        let entry = try #require(root.linkEntry())
        entry.text = link
        let gate = Gate()
        clubs.duringPreview = { await gate.wait() }
        async let proceeded: Void = entry.proceed()
        await gate.reached()
        clubs.duringPreview = {}
        await root.retry()
        #expect(root.route == .profile)
        gate.open()
        await proceeded
        // Its answer keeps nothing and hands nothing over while the account is incomplete.
        #expect(entry.invitation == nil)
        #expect(links.received(token, account: leila.id) == nil)
        let profile = try #require(root.profile)
        profile.name = "Leila"
        await profile.saveName()
        // The tabs show again, and the root presents the link the paste step was checking.
        #expect(root.route == .tabs)
        #expect(root.invitation?.state == .waiting(clubName: "Kitchen table"))
        #expect(links.received(token, account: leila.id) != nil)
        #expect(clubs.calls == ["preview 01", "preview 01"])
    }

    @Test func aPastedInvitationShownWhenTheServerEndsTheSessionWaitsForTheNextSignIn()
        async throws
    {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(leila)], clubs: [.success(list()), .success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [
            .success(.open(Kitchen.roster())), .success(.open(Kitchen.roster())),
        ]
        clubs.acceptAnswers = [.failure(.signedOut)]
        let root = root(accounts, clubs: clubs, auth: auth)
        await root.start()
        let entry = try #require(root.linkEntry())
        entry.text = link
        await entry.proceed()
        let pasted = try #require(entry.invitation)
        await pasted.accept()
        #expect(root.route == .signIn)
        let signIn = try #require(root.signIn)
        signIn.email = "leila@example.com"
        await signIn.sendCode()
        signIn.code = "529614"
        await signIn.verify()
        #expect(root.route == .tabs)
        #expect(root.invitation?.state == .open(Kitchen.roster()))
        #expect(clubs.calls.count == 3)
        #expect(clubs.calls.first == "preview 01")
        #expect(clubs.calls.dropFirst().first?.hasPrefix("accept 01 rev_1 v1 ") == true)
        #expect(clubs.calls.last == "preview 01")
    }

    @Test func aPasteStepMadeBeforeLeaveSignInChecksNothingAfterIt() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let clubs = ScriptedClubs()
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs,
            auth: auth)
        await root.start()
        let entry = try #require(root.linkEntry())
        await root.leave()
        entry.text = "https://tadayo.app/i#" + token.secret
        await entry.proceed()
        #expect(entry.invitation == nil)
        #expect(clubs.calls.isEmpty)
    }

    @Test func aSecondPasteStepLeavesTheFirstOnesInvitation() async throws {
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [
            .success(.open(Kitchen.roster())), .success(.open(Kitchen.roster())),
        ]
        clubs.acceptAnswers = [.success(.waiting)]
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs)
        await root.start()
        let first = try #require(root.linkEntry())
        let second = try #require(root.linkEntry())
        first.text = link
        let gate = Gate()
        clubs.duringPreview = { await gate.wait() }
        async let proceeded: Void = first.proceed()
        await gate.reached()
        clubs.duringPreview = {}
        second.text = "https://tadayo.app/i#" + Kitchen.token(2).secret
        await second.proceed()
        #expect(second.invitation?.state == .open(Kitchen.roster()))
        gate.open()
        await proceeded
        // The first step's invitation shows and accepts as if it were the only one.
        let invitation = try #require(first.invitation)
        #expect(invitation.state == .open(Kitchen.roster()))
        await invitation.accept()
        #expect(invitation.state == .waiting(clubName: "Kitchen table"))
        #expect(clubs.calls.count == 3)
        #expect(Array(clubs.calls.prefix(2)) == ["preview 02", "preview 01"])
        #expect(clubs.calls.last?.hasPrefix("accept 01 rev_1 v1 ") == true)
    }

    @Test func aPastedInvitationLeftWithBackIsClosedAndNeverHeld() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(leila)],
            clubs: [.success(list()), .failure(.signedOut), .success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        clubs.acceptAnswers = [.success(.waiting)]
        let root = root(accounts, clubs: clubs, auth: auth)
        await root.start()
        let entry = try #require(root.linkEntry())
        entry.text = link
        await entry.proceed()
        let left = try #require(entry.invitation)
        entry.returned()
        // Back closes it: no Accept from it.
        await left.accept()
        #expect(clubs.calls == ["preview 01"])
        // The server ends the session: nothing left with Back is held, though the model lives on.
        await root.retry()
        #expect(root.route == .signIn)
        try await signIn(root, as: "leila@example.com")
        #expect(root.route == .tabs)
        #expect(root.invitation == nil)
        #expect(clubs.calls == ["preview 01"])
        withExtendedLifetime(left) {}
    }

    @Test func aPasteStepLeftWhileItsLinkIsCheckedLetsWhatItFindsGoAndHoldsNothing() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(leila)],
            clubs: [.success(list()), .failure(.signedOut), .success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        let gate = Gate()
        clubs.duringPreview = { await gate.wait() }
        let root = root(accounts, clubs: clubs, auth: auth)
        await root.start()
        let entry = try #require(root.linkEntry())
        entry.text = link
        async let proceeded: Void = entry.proceed()
        await gate.reached()
        // A second check, if one were sent, would answer at once rather than wait at the gate.
        clubs.duringPreview = {}
        // Back from the paste step while its link is checked.
        entry.left()
        gate.open()
        await proceeded
        #expect(entry.invitation == nil)
        #expect(entry.opened == nil)
        // Nothing more is checked from it.
        await entry.proceed()
        #expect(clubs.calls == ["preview 01"])
        // The server ends the session: nothing found from the step left is held for the next.
        await root.retry()
        #expect(root.route == .signIn)
        try await signIn(root, as: "leila@example.com")
        #expect(root.route == .tabs)
        #expect(root.invitation == nil)
        #expect(clubs.calls == ["preview 01"])
        withExtendedLifetime(entry) {}
    }

    /// Handoff 9's `linkEntry.cancellation`: Back cancels the read, so a club the link would have
    /// opened isn't opened, selected or read again for a paste step the person left.
    @Test func aPasteStepLeftWhileItsLinkIsCheckedOpensNoClub() async throws {
        let accounts = FakeAccounts(
            me: [.success(leila)], clubs: [.success(list()), .success(list([kitchen]))])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.joined(Kitchen.ref))]
        let gate = Gate()
        clubs.duringPreview = { await gate.wait() }
        let selection = InMemoryClubSelection()
        let root = root(accounts, clubs: clubs, selection: selection)
        await root.start()
        let entry = try #require(root.linkEntry())
        entry.text = link
        async let proceeded: Void = entry.proceed()
        await gate.reached()
        entry.left()
        gate.open()
        await proceeded
        #expect(entry.opened == nil)
        #expect(entry.invitation == nil)
        #expect(!entry.isChecking)
        #expect(root.selectedClubID == nil)
        #expect(selection.club(for: leila.id) == nil)
        #expect(accounts.calls == ["me", "clubs"])
        withExtendedLifetime(entry) {}
    }

    /// Back while Accept is on its way: the invitation opens nothing, and when the server joined
    /// all the same, the list is read again so Home shows the club.
    @Test func anAcceptLeftWithBackThatTheServerJoinedReadsTheListAgain() async throws {
        let accounts = FakeAccounts(
            me: [.success(leila)], clubs: [.success(list()), .success(list([kitchen]))])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        clubs.acceptAnswers = [.success(.joined(Kitchen.ref))]
        let root = root(accounts, clubs: clubs)
        await root.start()
        let entry = try #require(root.linkEntry())
        entry.text = link
        await entry.proceed()
        let invitation = try #require(entry.invitation)
        let gate = Gate()
        clubs.duringAccept = { await gate.wait() }
        async let accepted: Void = invitation.accept()
        await gate.reached()
        // Back from the invitation.
        entry.returned()
        gate.open()
        await accepted
        #expect(entry.invitation == nil)
        #expect(root.invitation == nil)
        #expect(accounts.calls == ["me", "clubs", "clubs"])
        #expect(root.selectedClubID == "club_kitchen")
        withExtendedLifetime(entry) {}
    }

    @Test func theRootsInvitationIsHeldBeforeAPastedOne() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(leila)],
            clubs: [.success(list()), .failure(.signedOut), .success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = Array(repeating: .success(.open(Kitchen.roster())), count: 3)
        let root = root(accounts, clubs: clubs, auth: auth)
        await root.start()
        let entry = try #require(root.linkEntry())
        entry.text = link
        await entry.proceed()
        #expect(entry.invitation?.state == .open(Kitchen.roster()))
        // A link opened over the paste step.
        await root.open(Kitchen.token(2))
        await root.retry()
        #expect(root.route == .signIn)
        try await signIn(root, as: "leila@example.com")
        #expect(root.invitation?.state == .open(Kitchen.roster()))
        #expect(clubs.calls == ["preview 01", "preview 02", "preview 02"])
        withExtendedLifetime(entry) {}
    }

    @Test func theLatestPasteStepsInvitationIsHeld() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(leila)],
            clubs: [.success(list()), .failure(.signedOut), .success(list())])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = Array(repeating: .success(.open(Kitchen.roster())), count: 3)
        let root = root(accounts, clubs: clubs, auth: auth)
        await root.start()
        let first = try #require(root.linkEntry())
        first.text = link
        await first.proceed()
        let second = try #require(root.linkEntry())
        second.text = "https://tadayo.app/i#" + Kitchen.token(2).secret
        await second.proceed()
        #expect(first.invitation?.state == .open(Kitchen.roster()))
        #expect(second.invitation?.state == .open(Kitchen.roster()))
        await root.retry()
        #expect(root.route == .signIn)
        try await signIn(root, as: "leila@example.com")
        #expect(root.invitation?.state == .open(Kitchen.roster()))
        #expect(clubs.calls == ["preview 01", "preview 02", "preview 02"])
        withExtendedLifetime((first, second)) {}
    }

    @Test func aPastedInvitationIsHeldOnceAndNotAgainOnceClosed() async throws {
        let auth = FakeAuth(verify: [.success(stored), .success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(leila), .success(leila)],
            clubs: [
                .success(list()), .failure(.signedOut), .success(list()), .failure(.signedOut),
                .success(list()),
            ])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = Array(repeating: .success(.open(Kitchen.roster())), count: 3)
        let root = root(accounts, clubs: clubs, auth: auth)
        await root.start()
        let entry = try #require(root.linkEntry())
        entry.text = link
        await entry.proceed()
        #expect(entry.invitation?.state == .open(Kitchen.roster()))
        // The server ends the session: the pasted invitation is held and shown by the root.
        await root.retry()
        try await signIn(root, as: "leila@example.com")
        #expect(root.invitation?.state == .open(Kitchen.roster()))
        // Not now; then the server ends the session again, with nothing shown.
        root.closeInvitation()
        await root.retry()
        #expect(root.route == .signIn)
        try await signIn(root, as: "leila@example.com")
        #expect(root.route == .tabs)
        #expect(root.invitation == nil)
        #expect(clubs.calls == ["preview 01", "preview 01"])
        withExtendedLifetime(entry) {}
    }

    @Test func aPastedInvitationThatJoinedIsNeverHeld() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(leila)],
            clubs: [
                .success(list()), .success(list([kitchen])), .failure(.signedOut),
                .success(list([kitchen])),
            ])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        clubs.acceptAnswers = [.success(.joined(Kitchen.ref))]
        let root = root(accounts, clubs: clubs, auth: auth)
        await root.start()
        let entry = try #require(root.linkEntry())
        entry.text = link
        await entry.proceed()
        let pasted = try #require(entry.invitation)
        await pasted.accept()
        #expect(pasted.state == .opening(Kitchen.ref))
        #expect(root.selectedClubID == "club_kitchen")
        // The server ends the session with the paste step still there: its token was dropped at
        // the join, so nothing is held.
        await root.retry()
        #expect(root.route == .signIn)
        try await signIn(root, as: "leila@example.com")
        #expect(root.route == .tabs)
        #expect(root.invitation == nil)
        #expect(clubs.calls.count == 2)
        #expect(clubs.calls.last?.hasPrefix("accept 01 rev_1 v1 ") == true)
        withExtendedLifetime(entry) {}
    }

    @Test func anInvitationThatJoinedIsntHeldWhenItsListsReadEndsTheSession() async throws {
        let auth = FakeAuth(verify: [.success(stored)])
        let accounts = FakeAccounts(
            me: [.success(leila), .success(leila)],
            clubs: [.success(list()), .failure(.signedOut), .success(list([kitchen]))])
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.success(.open(Kitchen.roster()))]
        clubs.acceptAnswers = [.success(.joined(Kitchen.ref))]
        let root = root(accounts, clubs: clubs, auth: auth)
        await root.start()
        await root.open(token)
        let invitation = try #require(root.invitation)
        await invitation.accept()
        #expect(root.route == .signIn)
        try await signIn(root, as: "leila@example.com")
        #expect(root.route == .tabs)
        #expect(root.invitation == nil)
        #expect(clubs.calls.count == 2)
        #expect(clubs.calls.last?.hasPrefix("accept 01 rev_1 v1 ") == true)
    }

    @Test func anInvitationThatEndedIsntHeldAtTheServersEnding() async throws {
        let ended: [Result<InvitationPreview, APIFailure>] = [
            .success(.expired(inviterName: "Ben")), .success(.didNotGoAhead(inviterName: "Ben")),
            .failure(.notFound),
        ]
        for answer in ended {
            let auth = FakeAuth(verify: [.success(stored)])
            let accounts = FakeAccounts(
                me: [.success(leila), .success(leila)],
                clubs: [.success(list()), .failure(.signedOut), .success(list())])
            let clubs = ScriptedClubs()
            clubs.previewAnswers = [answer]
            let root = root(accounts, clubs: clubs, auth: auth)
            await root.start()
            await root.open(token)
            #expect(root.invitation != nil)
            // The server ends the session: the invitation ended and its token went, so nothing
            // is held for the next sign-in.
            await root.retry()
            #expect(root.route == .signIn)
            try await signIn(root, as: "leila@example.com")
            #expect(root.route == .tabs)
            #expect(root.invitation == nil, "\(answer)")
            #expect(clubs.calls == ["preview 01"], "\(answer)")
        }
    }

    /// Signs in on A02-email and A02-code, as the address given.
    func signIn(_ root: RootModel, as email: String) async throws {
        let signIn = try #require(root.signIn)
        signIn.email = email
        await signIn.sendCode()
        signIn.code = "529614"
        await signIn.verify()
    }
}
