import Foundation
import Observation

/// Where the app opens, from the session and the account (handoff 1: "Email → code → age
/// confirmation when needed → profile when needed → … Home"). No session is sign-in; then
/// `GET /v1/me` decides: no age, A02-age; no name, A03-profile; else the tabs, where
/// `GET /v1/clubs` decides what they show: no club, or the clubs with one selected, whose Home
/// is read in turn (`home`). Nothing is assumed while a call is out or failed, and a list this
/// build can't draw is never shown as empty (T49).
@MainActor @Observable public final class RootModel {
    /// Why a read failed: "Check your connection" is said only when no answer came.
    public enum Failure: Sendable, Equatable {
        case network
        case other
    }

    public enum Route: Sendable, Equatable {
        /// The device's keychain is being read for a session: the launch screen's canvas alone,
        /// with nothing on it, until a session is found (handoff 7, FQ96's default). With none,
        /// sign-in follows at once and no wait was ever shown.
        case starting
        /// A kept session is found and its account is being read, at launch or on Retry: the
        /// canvas with the spinner and "Loading your account…" (`root.loading`).
        case reading
        /// The session is being ended on the server and here, whether the person asked (Leave
        /// sign-in, the Lab's Log out) or the server ended it: the canvas with the spinner and
        /// "Leaving sign-in…" (`root.leaving`, FQ89).
        case leaving
        /// A02-email and A02-code, in `signIn`.
        case signIn
        /// A02-age, in `profile`.
        case confirmAge
        /// A03-profile, in `profile`.
        case profile
        /// Home, Friends and Memories, showing `clubs` for `account`.
        case tabs
        /// The account couldn't be read: a launch failure with Retry, and no tabs.
        case failed(Failure)
        /// Leave sign-in ended the session but the device couldn't forget it: Retry leaves again,
        /// rather than show sign-in over a session still kept, in this launch. After a relaunch,
        /// `start()` decides from the keychain afresh.
        case leaveFailed
        /// A verified code's session couldn't be kept on the device: Retry starts again, which,
        /// with nothing kept, is sign-in, with the address that was typed still in its field.
        case signInNotKept
    }

    public enum Clubs: Sendable, Equatable {
        /// Every tab's loading state: H01-loading-no-club on Home.
        case loading
        /// G06-no-club, F01-no-club and M01-no-club.
        case noClub
        /// The account's clubs, one of them selected (`selectedClubID`), with any invitations it
        /// accepted.
        case listed(ClubList)
        /// The account has no club, only accepted invitations, which this build has no screen
        /// for until `G03-waiting` comes (`docs/plans/ios-b1-clubs.md` section 4, PR 6): neither
        /// empty nor a failure.
        case notInThisBuild
        /// Every tab's failure state, with Retry: H01-error-no-club on Home.
        case failed(Failure)
    }

    /// What Home shows for the selected club (`docs/plans/ios-b1-clubs-root.md` section 1).
    public enum Home: Sendable, Equatable {
        /// Its reads are out: H01-loading.
        case loading
        /// A club that hasn't started (`proposed`): H01-awaiting-activation, with frame 13's
        /// words when `review`, the creator's own decision on the open revision being pending
        /// (handoff 8's `creatorReviewRequired`, FQ84).
        case awaiting(review: Bool)
        /// A suspended club: H01-unavailable, with nothing of the club (T9, spec 22).
        case unavailable
        /// An active or paused club, whose Home is B2's: neither empty nor a failure.
        case notInThisBuild
        /// Its reads failed: H01-error, with Retry.
        case failed(Failure)
    }

    public private(set) var route = Route.starting
    public private(set) var clubs = Clubs.loading
    /// The club the tabs show, while the list holds clubs: the one this account kept, if the
    /// list still holds it, and otherwise the first in the server's order. A suspended club
    /// stays selected: no other club is put in its place (handoff 5's `deniedHeader.selectedId`).
    public private(set) var selectedClubID: String?
    /// Home for the selected club, read each time a club is selected or the list comes back.
    public private(set) var home = Home.loading
    /// The complete account the tabs show (the header's initial), only while they show it:
    /// nothing of it outlives Leave sign-in (T11).
    public private(set) var account: Account?
    public private(set) var signIn: SignInModel?
    public private(set) var profile: ProfileModel?
    /// The invitation shown over the tabs, from a link opened or an accepted invitation the club
    /// list holds (`docs/plans/ios-b1-invitation.md` section 1), or nil.
    public private(set) var invitation: InvitationModel?

    /// Moves each time the app leaves an account. An answer to a call made before is dropped, so
    /// nothing that lands after Leave sign-in can route back into the account left (spec 23).
    private(set) var epoch = 0
    /// The Leave sign-in under way: a second one waits for it, and nothing starts meanwhile.
    private var leaving: Task<Void, Never>?
    /// What a Leave that couldn't forget the session was ending, so its Retry ends it the same
    /// way.
    private var unfinished: Ending?
    /// Moves each time Home is read: an answer to an earlier read, for a club since left
    /// behind, say, is dropped.
    private var homeReads = 0
    /// An invitation link opened before the tabs could show it, held in memory only until they do,
    /// and never written anywhere before an account exists (book p9, `linkEntry.retention`;
    /// FQ135's default). A newer link replaces it.
    private var pendingInvitation: InvitationToken?

    /// Why a session is being ended. Only the server's ending is said on A02-email ("Your sign-in
    /// ended. Enter your email to sign in again.", handoff 7's `auth.email.signedOut`), which then
    /// holds the address typed in this launch, if the sign-in model still has it (IMPL §4:
    /// "Retain the address if still available in the current flow; never reconstruct it from an
    /// account record"). A Leave the person asked for returns to an empty field (FQ93's default).
    /// The address is held in memory only, never kept or logged.
    private enum Ending: Equatable {
        case asked
        case byServer(address: String?)
    }

    let session: SessionManager
    let auth: any AuthService
    let accounts: any AccountService
    let clubService: any ClubService
    let selection: any ClubSelectionStore
    let makeKey: @Sendable () -> IdempotencyKey
    let now: @Sendable () -> ContinuousClock.Instant
    let sleep: @Sendable (ContinuousClock.Instant) async throws -> Void
    let left: @MainActor () -> Void
    /// The invitation links the account keeps (ADR-037): each club list read settles them, the
    /// setup lists and Club details made here share them, and Leave sign-in forgets them.
    let links: InvitationLinkBook

    /// `left` runs each time Leave sign-in has ended the session, on the server and here, whether
    /// or not the device could forget it, and before sign-in shows: the app purges there what the
    /// account left behind, its connections. `selection` keeps the selected club across
    /// relaunches, and is forgotten before `left` runs. `links` is the app's one book of kept
    /// links, also forgotten before `left` runs (ADR-037, T11).
    public init(
        session: SessionManager, auth: any AuthService, accounts: any AccountService,
        clubs: any ClubService, selection: any ClubSelectionStore,
        links: InvitationLinkBook = InvitationLinkBook(vault: InMemoryInvitationLinkVault()),
        makeKey: @escaping @Sendable () -> IdempotencyKey = { IdempotencyKey.make() },
        now: @escaping @Sendable () -> ContinuousClock.Instant = { .now },
        sleep: @escaping @Sendable (ContinuousClock.Instant) async throws -> Void = {
            try await Task.sleep(until: $0, clock: .continuous)
        },
        left: @escaping @MainActor () -> Void = {}
    ) {
        self.session = session
        self.auth = auth
        self.accounts = accounts
        self.clubService = clubs
        self.selection = selection
        self.links = links
        self.makeKey = makeKey
        self.now = now
        self.sleep = sleep
        self.left = left
    }

    /// At launch.
    public func start() async {
        guard leaving == nil else { return }
        route = .starting
        guard await session.isSignedIn else { return showSignIn() }
        route = .reading
        await readAccount()
    }

    /// Retry, on the failure line: the account, the clubs, a Leave sign-in that couldn't finish,
    /// or a session the device couldn't keep, where sign-in starts again with the address typed,
    /// so only the code is asked for again.
    public func retry() async {
        if route == .leaveFailed { return await end(unfinished ?? .asked) }
        if route == .tabs { return await loadClubs() }
        if route == .signInNotKept {
            let typed = signIn?.email ?? ""
            await start()
            if route == .signIn { signIn?.email = typed }
            return
        }
        await start()
    }

    /// Leave sign-in, on A02-age and the Lab's Log out: "Leaving sign-in…" while it ends the
    /// session on the server and here, then A02-email, empty (Welcome, A01, comes in B1). If the
    /// device couldn't forget the session, the failure line says so, with Retry, rather than show
    /// sign-in over a session still kept. One Leave runs at a time, and the first one's reason
    /// stands. `left` purges what the account left behind (T11).
    public func leave() async {
        await end(.asked)
    }

    /// An answer of "signed out" from the server ends the session as Leave sign-in does, and
    /// A02-email says the sign-in ended, with the address typed if the sign-in model still has it.
    private func endedByServer() async {
        await end(.byServer(address: signIn?.email))
    }

    private func end(_ ending: Ending) async {
        if let leaving { return await leaving.value }
        let task = Task { await self.endSession(ending) }
        leaving = task
        await task.value
        leaving = nil
    }

    private func endSession(_ ending: Ending) async {
        unfinished = nil
        epoch += 1
        signIn = nil
        profile = nil
        account = nil
        pendingInvitation = nil
        invitation = nil
        forgetClubs()
        selection.forget()
        links.forget()
        route = .leaving
        let forgotten = await session.signOut()
        left()
        guard forgotten else {
            unfinished = ending
            route = .leaveFailed
            return
        }
        showSignIn(after: ending)
    }

    /// Home, Friends and Memories, each time the tabs show or Retry is tapped.
    public func loadClubs() async {
        await loadClubs(relisting: false)
    }

    /// The list, read again with `relisting` when Home found the selected club no longer as the
    /// list had it (`loadHome(relisting:)`), which the selected club's Home is told. A successful
    /// answer settles the kept links: a club it no longer holds has its links purged (ADR-037). A
    /// failed read changes none of them.
    private func loadClubs(relisting: Bool) async {
        let asked = epoch
        clubs = .loading
        selectedClubID = nil
        home = .loading
        let stamp = links.beginRead()
        let answer: Result<ClubList, APIFailure>
        do {
            answer = .success(try await accounts.clubs())
        } catch {
            answer = .failure(error)
        }
        guard epoch == asked else { return }
        if case .success(let list) = answer, let account {
            links.settle(list, stamp: stamp, account: account.id)
        }
        switch answer {
        case .success(let list) where !list.clubs.isEmpty:
            clubs = .listed(list)
            let kept = account.flatMap { selection.club(for: $0.id) }
            let chosen = list.clubs.first { $0.id == kept } ?? list.clubs[0]
            await choose(chosen.id, relisting: relisting)
        case .success(let list):
            clubs = list.isEmpty ? .noClub : .notInThisBuild
        case .failure(.profileIncomplete):
            // The account changed since it was read. If it still reads as complete, the two
            // answers disagree: a failure, not a loop. If the read says the session ended, the
            // server ended it.
            let reread: Result<Account, APIFailure>
            do {
                reread = .success(try await accounts.me())
            } catch {
                reread = .failure(error)
            }
            guard epoch == asked else { return }
            switch reread {
            case .success(let account) where !Self.isComplete(account):
                await show(account)
            case .failure(.signedOut):
                await endedByServer()
            default:
                clubs = .failed(.other)
            }
        case .failure(.signedOut):
            await endedByServer()
        case .failure(let failure):
            clubs = .failed(failure == .network ? .network : .other)
        }
    }

    /// The switcher's choice: the club becomes the selected one, is kept for this account, and
    /// its Home is read. A club the list doesn't hold, or the one already selected, changes
    /// nothing.
    public func select(_ clubID: String) async {
        guard case .listed(let list) = clubs, clubID != selectedClubID,
            list.clubs.contains(where: { $0.id == clubID })
        else { return }
        await choose(clubID)
    }

    /// The selected club, from the list, while it holds clubs.
    public var selectedClub: ClubSummary? {
        guard case .listed(let list) = clubs else { return nil }
        return list.clubs.first { $0.id == selectedClubID }
    }

    /// Club details and its members list for the selected club (`ClubDetailsModel`), or nil
    /// while none is selected. Its answers count only while the session it was made in lasts and
    /// the club is still the selected one; a club no longer the caller's to read has the list
    /// read again, which decides, as Home's does (`loadHome`); a `signedOut` answer ends the
    /// session. Its members answers settle the account's kept links (ADR-037).
    public func clubDetails() -> ClubDetailsModel? {
        guard let club = selectedClub else { return nil }
        let made = epoch
        return ClubDetailsModel(
            club: club, service: clubService, links: account.map { (links, $0.id) },
            current: { [weak self] in
                guard let self else { return false }
                return epoch == made && selectedClubID == club.id
            },
            gone: { [weak self] in await self?.loadClubs() },
            signedOut: { [weak self] in await self?.endedByServer() })
    }

    /// Naming a new club (`G01-create`), while the tabs show an account. Its answers count only in
    /// the session it was made in. Once the club is made it becomes this account's selected club
    /// and the list is read again, so the tabs show it; a `signedOut` answer ends the session.
    public func createClub() -> CreateClubModel? {
        guard route == .tabs, let account else { return nil }
        let made = epoch
        return CreateClubModel(
            service: clubService, makeKey: makeKey,
            current: { [weak self] in self?.epoch == made },
            created: { [weak self] detail in
                guard let self, self.epoch == made else { return }
                self.selection.keep(detail.club.id, for: account.id)
                await self.loadClubs()
            },
            signedOut: { [weak self] in await self?.endedByServer() })
    }

    /// The setup list for `club`, which the account made or proposes people in
    /// (`G01-invite-people`), with the account's kept links. Its answers count only in the session
    /// it was made in, whichever club is selected; a club no longer the caller's to read has the
    /// list read again, which decides, as Club details does; a `signedOut` answer ends the session.
    public func invitations(for club: ClubRef) -> InvitationListModel? {
        guard route == .tabs, let account else { return nil }
        let made = epoch
        return InvitationListModel(
            club: club, accountID: account.id, service: clubService, book: links,
            makeKey: makeKey,
            current: { [weak self] in self?.epoch == made },
            gone: { [weak self] in await self?.loadClubs() },
            signedOut: { [weak self] in await self?.endedByServer() })
    }

    /// An invitation link, from the link handler. While the tabs show an account it's presented at
    /// once, checking, in place of any shown before: a newer link wins. Otherwise it's held in
    /// memory and presented once the tabs show, after the club list's read, so nothing of the
    /// club shows before sign-in (book p9; FQ135).
    public func open(_ token: InvitationToken) async {
        guard route == .tabs, let account else {
            pendingInvitation = token
            return
        }
        pendingInvitation = nil
        await present(token, for: account)
    }

    /// An accepted invitation the club list holds: `G03-waiting` from the list's words, with no
    /// call; `G03-declined`; or, for a changed roster, the kept token checked (`G02-changed`), or,
    /// with none kept, the link opened again (FQ136).
    public func openAccepted(_ accepted: MyInvitation) async {
        guard route == .tabs, let account else { return }
        let kept = links.received(invitation: accepted.invitationID, account: account.id)?.token
        switch accepted.state {
        case .waiting:
            invitation = makeInvitation(
                kept, state: .waiting(clubName: accepted.clubName), for: account)
        case .didNotGoAhead:
            invitation = makeInvitation(
                nil, state: .didNotGoAhead(inviterName: accepted.inviterName), for: account)
        case .rosterChanged:
            guard let kept else {
                invitation = makeInvitation(
                    nil,
                    state: .reopenLink(
                        clubName: accepted.clubName, inviterName: accepted.inviterName),
                    for: account)
                return
            }
            await present(kept, for: account)
        }
    }

    /// Not now, Done and Close invitation: nothing is granted or changed (handoff 1).
    public func closeInvitation() {
        invitation = nil
    }

    /// The paste step, `G02-link-entry-signed-in`, while the tabs show an account. It checks a
    /// link on its own screen and hands over the invitation it found (handoff 4); once the session
    /// it was made in has ended, it checks nothing.
    public func linkEntry() -> InvitationLinkEntryModel? {
        guard route == .tabs, let account else { return nil }
        let made = epoch
        return InvitationLinkEntryModel { [weak self] token in
            guard let self, self.epoch == made else { return nil }
            return self.makeInvitation(token, state: .checking, for: account)
        }
    }

    private func present(_ token: InvitationToken, for account: Account) async {
        let model = makeInvitation(token, state: .checking, for: account)
        invitation = model
        await model.check()
    }

    /// An invitation's model, for this session. Once the account has joined, the club is kept as
    /// its selected club and the list read again, so Home opens on it, and the invitation then
    /// closes; a `signedOut` answer ends the session.
    private func makeInvitation(
        _ token: InvitationToken?, state: InvitationModel.State, for account: Account
    ) -> InvitationModel {
        let made = epoch
        weak var created: InvitationModel?
        let model = InvitationModel(
            token: token, state: state, service: clubService, book: links, account: account.id,
            makeKey: makeKey,
            current: { [weak self] in self?.epoch == made },
            joined: { [weak self] club in
                guard let self, self.epoch == made else { return }
                self.selection.keep(club.id, for: account.id)
                await self.loadClubs()
                guard self.epoch == made, let created, self.invitation === created else {
                    return
                }
                self.invitation = nil
            },
            signedOut: { [weak self] in
                guard let self, self.epoch == made else { return }
                await self.endedByServer()
            })
        created = model
        return model
    }

    private func choose(_ clubID: String, relisting: Bool = false) async {
        selectedClubID = clubID
        if let account { selection.keep(clubID, for: account.id) }
        await loadHome(relisting: relisting)
    }

    /// Home for the selected club, each time it's selected and on Home's Retry. A club that
    /// hasn't started is read: its details, then its open revision, if it has one, for the
    /// caller's own decision (never anyone else's: book p30, T33), which asks for a review only
    /// while that revision is open. A suspended club, an active one and a paused one need no
    /// call.
    ///
    /// When the details or the revision answer not found, or the details say the club is no
    /// longer one that hasn't started, the club has changed since the list was read: suspended,
    /// say, which its reads answer as not found (T9, spec 22), or started. Then the list is read
    /// again, once, and decides, rather than Home failing under a club the server no longer
    /// shows as listed (handoffs 5 and 6, `deniedHeader`: "Avoid using a denied selected-club
    /// record or cache"). While it's read, the tabs show the list's loading form under the
    /// header with no club, and a switcher that was open closes. If the list read again still
    /// leads here, Home fails, and its Retry starts over. Only that one chain of reads is told
    /// it's reading the list again (`relisting`), so another club chosen meanwhile, or a new
    /// session, starts with its own one read of the list.
    ///
    /// A revision no longer open between the two reads asks for no review, though one that
    /// replaced it may wait on the caller: Home asks for it at its next read.
    public func loadHome() async {
        await loadHome(relisting: false)
    }

    private func loadHome(relisting: Bool) async {
        guard let club = selectedClub else { return }
        homeReads += 1
        let asked = (epoch, homeReads)
        switch club.state {
        case .suspended:
            home = .unavailable
            return
        case .active, .paused:
            home = .notInThisBuild
            return
        case .proposed:
            break
        }
        home = .loading
        // Whether Home asks for a review, or nil when the club is no longer one that hasn't
        // started.
        let answer: Result<Bool?, APIFailure>
        do {
            let detail = try await clubService.club(club.id)
            // Left behind meanwhile, by Leave sign-in or another club: nothing more is read.
            guard asked == (epoch, homeReads) else { return }
            if detail.club.state != .proposed {
                answer = .success(nil)
            } else if let revisionID = detail.openRevisionID {
                let revision = try await clubService.rosterRevision(revisionID)
                answer = .success(revision.state == .open && revision.myDecision == .pending)
            } else {
                answer = .success(false)
            }
        } catch {
            answer = .failure(error)
        }
        guard asked == (epoch, homeReads) else { return }
        switch answer {
        case .success(let review?):
            home = .awaiting(review: review)
        case .success(nil), .failure(.notFound):
            guard !relisting else {
                home = .failed(.other)
                return
            }
            await loadClubs(relisting: true)
        case .failure(.signedOut):
            await endedByServer()
        case .failure(let failure):
            home = .failed(failure == .network ? .network : .other)
        }
    }

    /// Nothing of a club outlives the account that read it (T11).
    private func forgetClubs() {
        clubs = .loading
        selectedClubID = nil
        home = .loading
        homeReads += 1
    }

    /// A02-email, empty unless the server ended the sign-in before while the address was still
    /// in memory (`Ending`).
    private func showSignIn(after ending: Ending? = nil) {
        profile = nil
        account = nil
        forgetClubs()
        let asked = epoch
        var endedByServer = false
        var address: String?
        if case .byServer(let typed) = ending {
            endedByServer = true
            address = typed
        }
        let model = SignInModel(
            auth: auth,
            verified: { [weak self] verified in
                guard let self, self.epoch == asked else { return }
                await self.signedIn(verified)
            }, signInEnded: endedByServer, now: now, sleep: sleep)
        if let address { model.email = address }
        signIn = model
        route = .signIn
    }

    private func signedIn(_ verified: AuthSession) async {
        do {
            try await session.begin(verified)
        } catch {
            route = .signInNotKept
            return
        }
        await readAccount()
    }

    private func readAccount() async {
        let asked = epoch
        let answer: Result<Account, APIFailure>
        do {
            answer = .success(try await accounts.me())
        } catch {
            answer = .failure(error)
        }
        guard epoch == asked else { return }
        switch answer {
        case .success(let account):
            await show(account)
        case .failure(.signedOut):
            await endedByServer()
        case .failure(let failure):
            route = .failed(failure == .network ? .network : .other)
        }
    }

    private static func isComplete(_ account: Account) -> Bool {
        account.ageConfirmed && account.displayName != nil
    }

    private func show(_ account: Account) async {
        guard Self.isComplete(account) else {
            self.account = nil
            if let profile {
                profile.refresh(account)
            } else {
                let asked = epoch
                profile = ProfileModel(
                    account: account, accounts: accounts, makeKey: makeKey,
                    saved: { [weak self] account in
                        guard let self, self.epoch == asked else { return }
                        await self.show(account)
                    },
                    signedOut: { [weak self] in
                        guard let self, self.epoch == asked else { return }
                        await self.endedByServer()
                    })
            }
            route = account.ageConfirmed ? .profile : .confirmAge
            return
        }
        signIn = nil
        profile = nil
        self.account = account
        route = .tabs
        let asked = epoch
        await loadClubs()
        // A link opened before the tabs showed, presented after the list's read.
        guard epoch == asked, route == .tabs, let token = pendingInvitation else { return }
        pendingInvitation = nil
        await present(token, for: account)
    }
}
