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
    let token = Kitchen.token(1)

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

    @Test func aLinkWhileTheProfileIsIncompleteWaitsForTheTabs() async {
        let clubs = ScriptedClubs()
        let root = root(FakeAccounts(me: [.success(account())]), clubs: clubs)
        await root.start()
        #expect(root.route == .confirmAge)
        await root.open(token)
        #expect(root.invitation == nil)
        #expect(clubs.calls.isEmpty)
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
            me: [.success(leila), .success(leila)], clubs: [.success(list()), .success(list())])
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
        #expect(root.invitation == nil)
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

    @Test func aSignedOutAnswerEndsTheSession() async {
        let clubs = ScriptedClubs()
        clubs.previewAnswers = [.failure(.signedOut)]
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list())]), clubs: clubs)
        await root.start()
        await root.open(token)
        #expect(root.route == .signIn)
        #expect(root.invitation == nil)
        #expect(root.signIn?.signInEnded == true)
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

    @Test func anInvitationThatDidntGoAheadNamesOnlyTheInviter() async {
        let clubs = ScriptedClubs()
        let invitations = [accepted(.didNotGoAhead)]
        let root = root(
            FakeAccounts(me: [.success(leila)], clubs: [.success(list(invitations: invitations))]),
            clubs: clubs)
        await root.start()
        await root.openAccepted(invitations[0])
        #expect(root.invitation?.state == .didNotGoAhead(inviterName: "Ben"))
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
}
