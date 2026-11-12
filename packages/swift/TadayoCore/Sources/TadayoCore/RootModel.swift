import Foundation
import Observation

/// Where the app opens, from the session and the account (handoff 1: "Email → code → age
/// confirmation when needed → profile when needed → … Home"). No session is sign-in; then
/// `GET /v1/me` decides: no age, A02-age; no name, A03-profile; else the tabs, where
/// `GET /v1/clubs` decides what they show. Nothing is assumed while a call is out or failed, and
/// a list B0 can't draw is never shown as empty (T49).
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
        /// The account has a club or an accepted invitation, which B0 has no screen for: neither
        /// empty nor a failure.
        case notInThisBuild
        /// Every tab's failure state, with Retry: H01-error-no-club on Home.
        case failed(Failure)
    }

    public private(set) var route = Route.starting
    public private(set) var clubs = Clubs.loading
    /// The complete account the tabs show (the header's initial), only while they show it:
    /// nothing of it outlives Leave sign-in (T11).
    public private(set) var account: Account?
    public private(set) var signIn: SignInModel?
    public private(set) var profile: ProfileModel?

    /// Moves each time the app leaves an account. An answer to a call made before is dropped, so
    /// nothing that lands after Leave sign-in can route back into the account left (spec 23).
    private(set) var epoch = 0
    /// The Leave sign-in under way: a second one waits for it, and nothing starts meanwhile.
    private var leaving: Task<Void, Never>?
    /// What a Leave that couldn't forget the session was ending, so its Retry ends it the same
    /// way.
    private var unfinished: Ending?

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
    let makeKey: @Sendable () -> IdempotencyKey
    let now: @Sendable () -> ContinuousClock.Instant
    let sleep: @Sendable (ContinuousClock.Instant) async throws -> Void
    let left: @MainActor () -> Void

    /// `left` runs each time Leave sign-in has ended the session, on the server and here, whether
    /// or not the device could forget it, and before sign-in shows: the app purges there what the
    /// account left behind, its connections first (T11).
    public init(
        session: SessionManager, auth: any AuthService, accounts: any AccountService,
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
        clubs = .loading
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
        let asked = epoch
        clubs = .loading
        let answer: Result<ClubList, APIFailure>
        do {
            answer = .success(try await accounts.clubs())
        } catch {
            answer = .failure(error)
        }
        guard epoch == asked else { return }
        switch answer {
        case .success(let list):
            clubs = list.isEmpty ? .noClub : .notInThisBuild
        case .failure(.profileIncomplete):
            // The account changed since it was read. If it still reads as complete, the two
            // answers disagree: a failure, not a loop.
            let account = try? await accounts.me()
            guard epoch == asked else { return }
            if let account, !Self.isComplete(account) {
                await show(account)
            } else {
                clubs = .failed(.other)
            }
        case .failure(.signedOut):
            await endedByServer()
        case .failure(let failure):
            clubs = .failed(failure == .network ? .network : .other)
        }
    }

    /// A02-email, empty unless the server ended the sign-in before while the address was still
    /// in memory (`Ending`).
    private func showSignIn(after ending: Ending? = nil) {
        profile = nil
        account = nil
        clubs = .loading
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
        await loadClubs()
    }
}
