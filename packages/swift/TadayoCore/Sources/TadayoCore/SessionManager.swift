import Foundation

/// Where the signed-in session is kept between launches. The app's store is the keychain, shared
/// with the share extension (docs/TECH-DESIGN.md section 4: the app group holds "the session
/// credential"); tests use `InMemorySessionStore`.
public protocol SessionStore: Sendable {
    func load() throws -> AuthSession?
    func save(_ session: AuthSession) throws
    func delete() throws
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
    /// The session is kept, but the server was busy or failing when it was refreshed.
    case unavailable
}

/// Keeps the session's access token fresh for the API's requests: refreshed 30 seconds before it
/// runs out and once after the API rejects it (401 `UNAUTHENTICATED`), one refresh at a time. The
/// store is read before each refresh, since the share extension can refresh the same session.
/// Only the codes that end a session forget it; a server that is busy or out of reach keeps it.
public actor SessionManager {
    static let refreshMargin: TimeInterval = 30

    let auth: any AuthService
    let store: any SessionStore
    let now: @Sendable () -> Date
    private var inFlight: Task<Result<AuthSession, SessionError>, Never>?

    public init(
        auth: any AuthService, store: any SessionStore,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.auth = auth
        self.store = store
        self.now = now
    }

    public var isSignedIn: Bool { (try? store.load()) != nil }

    /// Keeps the session a verified code gave.
    public func begin(_ session: AuthSession) throws {
        try store.save(session)
    }

    /// An access token to send, refreshed first if it runs out within 30 seconds.
    public func accessToken() async throws(SessionError) -> String {
        guard let session = try? store.load() else { throw .signedOut }
        if now() < session.expiresAt.addingTimeInterval(-Self.refreshMargin) {
            return session.accessToken
        }
        return try await refreshed(session).get().accessToken
    }

    /// A token to send again after the API rejected `token`: the stored one if it has changed
    /// since, else a refreshed one.
    public func accessToken(afterRejecting token: String) async throws(SessionError) -> String {
        guard let session = try? store.load() else { throw .signedOut }
        if session.accessToken != token { return session.accessToken }
        return try await refreshed(session).get().accessToken
    }

    /// Signs out: refreshes an expired token first, ends this session on the server
    /// (`scope=local`), then forgets it, even offline. The device's clock only guesses when the
    /// token runs out, so a token the server refuses is refreshed once and sent again. The caller
    /// purges every cache next (T11).
    public func signOut() async {
        guard var session = try? store.load() else { return }
        if now() >= session.expiresAt {
            guard case .success(let fresh) = await refreshed(session) else {
                try? store.delete()
                return
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
        try? store.delete()
    }

    private func refreshed(_ session: AuthSession) async -> Result<AuthSession, SessionError> {
        if let inFlight { return await inFlight.value }
        let task = Task { await self.refresh(session) }
        inFlight = task
        let result = await task.value
        inFlight = nil
        return result
    }

    private func refresh(_ session: AuthSession) async -> Result<AuthSession, SessionError> {
        do {
            let fresh = try await auth.refresh(session)
            try? store.save(fresh)
            return .success(fresh)
        } catch .refreshTokenAlreadyUsed {
            if let stored = try? store.load(), stored.refreshToken != session.refreshToken {
                return .success(stored)
            }
            try? store.delete()
            return .failure(.signedOut)
        } catch .sessionEnded, .codeNotVerified, .refused, .accessTokenRejected {
            try? store.delete()
            return .failure(.signedOut)
        } catch .network {
            return .failure(.network)
        } catch {
            return .failure(.unavailable)
        }
    }
}
