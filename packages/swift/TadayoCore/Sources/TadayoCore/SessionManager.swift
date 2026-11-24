import Foundation

/// Where the signed-in session is kept between launches. The app's store is the keychain, shared
/// with the share extension (docs/TECH-DESIGN.md section 4: the app group holds "the session
/// credential"); tests use `InMemorySessionStore`.
public protocol SessionStore: Sendable {
    /// The session kept, or nil. Throws `UnusableSession` for one it holds but can never use, and
    /// anything else when it couldn't be read just now.
    func load() throws -> AuthSession?
    func save(_ session: AuthSession) throws
    /// Forgets the session. Deleting when nothing is stored succeeds (a keychain store reads
    /// `errSecItemNotFound` as done).
    func delete() throws
}

/// What a `SessionStore`'s load throws for a session it holds but can never use: the keychain
/// item's bytes don't decode. That never changes, so it reads as no session, where any other
/// failure of a load is a moment's refusal that ends nothing (FQ89).
public struct UnusableSession: Error, Sendable, Equatable {
    public init() {}
}

/// A `SessionStore` that keeps the session in memory only.
public final class InMemorySessionStore: SessionStore, @unchecked Sendable {
    private let lock = NSLock()
    private var session: AuthSession?

    public init(_ session: AuthSession? = nil) {
        self.session = session
    }

    public func load() throws -> AuthSession? { lock.withLock { session } }
    public func save(_ session: AuthSession) throws { lock.withLock { self.session = session } }
    public func delete() throws { lock.withLock { session = nil } }
}

/// The sign-in calls, as `SupabaseAuth` makes them.
public protocol AuthService: Sendable {
    func sendCode(to email: String) async throws(AuthFailure)
    func verify(email: String, code: String) async throws(AuthFailure) -> AuthSession
    func refresh(_ session: AuthSession) async throws(AuthFailure) -> AuthSession
    func signOut(_ session: AuthSession) async throws(AuthFailure)
}

extension SupabaseAuth: AuthService {}

/// Why there is no access token to send.
public enum SessionError: Error, Sendable, Equatable {
    /// Nobody is signed in, or the session has ended: sign in again.
    case signedOut
    /// The session is kept, but no answer came back to its refresh.
    case network
    /// The session is kept, but couldn't be used just now: the keychain refused its read, or its
    /// refresh found the server busy or failing, or got an answer that didn't say it had ended.
    /// Nothing is signed out for it (FQ89).
    case unavailable
}

/// Keeps the session's access token fresh for the API's requests: refreshed 30 seconds before it
/// runs out and once after the API rejects it (401 `UNAUTHENTICATED`), one refresh at a time. The
/// store is read before each refresh, since the share extension can refresh the same session.
/// Only the codes that end a session forget it; a server that is busy or out of reach keeps it,
/// and so does a keychain that refuses a read for a moment (FQ89).
/// Signing out and signing in win over a refresh still on its way: its answer is never stored
/// over what they did (spec 23). One sign-out runs at a time; a second joins it.
public actor SessionManager {
    static let refreshMargin: TimeInterval = 30

    let auth: any AuthService
    let store: any SessionStore
    let now: @Sendable () -> Date
    private var inFlight: Task<Result<AuthSession, SessionError>, Never>?
    /// Moves on each sign-in and sign-out. A refresh stores or forgets a session only while it
    /// hasn't moved since the refresh began.
    private var generation = 0
    /// The sign-out under way: while it is set, no token is handed out.
    private var ending: Task<Bool, Never>?
    /// Sign-ins so far, and how many there had been when `ending` began: a sign-out asked for
    /// after a newer sign-in runs on its own once `ending` is done, rather than join it.
    private var signIns = 0
    private var endingSignIns = 0

    public init(
        auth: any AuthService, store: any SessionStore,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.auth = auth
        self.store = store
        self.now = now
    }

    /// Whether a session is kept that a request can use: false while a sign-out is under way or
    /// when none is (or none that can ever be used), and `unavailable` when the keychain refused
    /// the read, which says neither.
    public var isSignedIn: Bool {
        get throws(SessionError) {
            guard ending == nil else { return false }
            return try stored() != nil
        }
    }

    /// Keeps the session a verified code gave.
    public func begin(_ session: AuthSession) throws {
        signIns += 1
        generation += 1
        try store.save(session)
    }

    /// An access token to send, refreshed first if it runs out within 30 seconds.
    public func accessToken() async throws(SessionError) -> String {
        guard ending == nil, let session = try stored() else { throw .signedOut }
        if now() < session.expiresAt.addingTimeInterval(-Self.refreshMargin) {
            return session.accessToken
        }
        return try await refreshed(session).get().accessToken
    }

    /// A token to send again after the API rejected `token`: the stored one if it has changed
    /// since, else a refreshed one.
    public func accessToken(afterRejecting token: String) async throws(SessionError) -> String {
        guard ending == nil, let session = try stored() else { throw .signedOut }
        if session.accessToken != token { return session.accessToken }
        return try await refreshed(session).get().accessToken
    }

    /// Signs out: waits for a refresh on its way, so the session it ends is the newest, refreshes
    /// an expired token first, ends this session on the server (`scope=local`), then forgets it,
    /// even offline. The device's clock only guesses when the token runs out, so a token the
    /// server refuses is refreshed once and sent again. While it runs, no token is handed out,
    /// and a second call waits for this one. A sign-in made while it waits for the refresh is
    /// newer, and is kept. False when the device couldn't forget the session (its store refused,
    /// twice): the caller says so rather than show sign-in over a session still kept. The caller
    /// purges every cache next (T11).
    @discardableResult public func signOut() async -> Bool {
        if let current = ending {
            if signIns == endingSignIns { return await current.value }
            _ = await current.value
            if ending == current { ending = nil }
            return await signOut()
        }
        endingSignIns = signIns
        let task = Task { await self.endSession() }
        ending = task
        let forgotten = await task.value
        if ending == task { ending = nil }
        return forgotten
    }

    private func endSession() async -> Bool {
        let entered = generation
        if let pending = inFlight {
            _ = await pending.value
            if inFlight == pending { inFlight = nil }
        }
        guard generation == entered else { return true }
        generation += 1
        let mine = generation
        let loaded: AuthSession?
        do {
            loaded = try store.load()
        } catch {
            return forget(mine)
        }
        guard var session = loaded else { return true }
        if now() >= session.expiresAt {
            guard case .success(let fresh) = await refreshed(session) else {
                return forget(mine)
            }
            session = fresh
        }
        do {
            try await auth.signOut(session)
        } catch .accessTokenRejected {
            if case .success(let fresh) = await refreshed(session) {
                try? await auth.signOut(fresh)
            }
        } catch {}
        return forget(mine)
    }

    /// Deletes the stored session, asking a second time if the store refuses, unless someone has
    /// signed in since `mine`. A store that refuses but holds nothing has forgotten it.
    private func forget(_ mine: Int) -> Bool {
        guard generation == mine else { return true }
        for _ in 0..<2 {
            if (try? store.delete()) != nil || holdsNothing() { return true }
        }
        return false
    }

    /// The session kept: nil for none, or for one that can never be used; `unavailable` when the
    /// keychain refused the read, which ends nothing.
    private func stored() throws(SessionError) -> AuthSession? {
        do {
            return try store.load()
        } catch is UnusableSession {
            return nil
        } catch {
            throw .unavailable
        }
    }

    private func holdsNothing() -> Bool {
        do {
            return try store.load() == nil
        } catch {
            return false
        }
    }

    private func refreshed(_ session: AuthSession) async -> Result<AuthSession, SessionError> {
        if let inFlight { return await inFlight.value }
        let began = generation
        let task = Task { await self.refresh(session, began: began) }
        inFlight = task
        let result = await task.value
        if inFlight == task { inFlight = nil }
        return result
    }

    /// One refresh. Its answer is stored, or the session forgotten, only if nobody has signed in
    /// or out here since it `began`, and only if the store still holds the session refreshed:
    /// another process (the share extension) may have refreshed it, or this app signed out, in
    /// the meantime. Between that read and the write, another process can still write: the
    /// keychain has no compare-and-set (`docs/LIMITATIONS.md`).
    private func refresh(
        _ session: AuthSession, began: Int
    ) async -> Result<AuthSession, SessionError> {
        let answer: Result<AuthSession, AuthFailure>
        do {
            answer = .success(try await auth.refresh(session))
        } catch {
            answer = .failure(error)
        }
        guard generation == began else { return .failure(.signedOut) }
        // A store that can't be read is taken to hold the session still, as sign-out takes it:
        // only an empty one means it was signed out of.
        let kept: AuthSession?
        do {
            kept = try store.load()
        } catch {
            kept = session
        }
        guard let stored = kept else { return .failure(.signedOut) }
        guard stored.refreshToken == session.refreshToken else { return .success(stored) }
        switch answer {
        case .success(let fresh):
            try? store.save(fresh)
            return .success(fresh)
        case .failure(.refreshTokenAlreadyUsed), .failure(.sessionEnded),
            .failure(.codeNotVerified), .failure(.refused), .failure(.accessTokenRejected):
            try? store.delete()
            return .failure(.signedOut)
        case .failure(.network):
            return .failure(.network)
        case .failure:
            return .failure(.unavailable)
        }
    }
}
