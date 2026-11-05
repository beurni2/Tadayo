import Foundation
import Testing

@testable import TadayoCore

/// An `AuthService` whose refresh answers come from a script, recording every call in order.
final class FakeAuth: AuthService, @unchecked Sendable {
    private let lock = NSLock()
    private var sendAnswers: [AuthFailure?]
    private var verifyAnswers: [Result<AuthSession, AuthFailure>]
    private var refreshAnswers: [Result<AuthSession, AuthFailure>]
    private var signOutAnswers: [AuthFailure?]
    private(set) var calls: [String] = []
    /// Runs inside each send and verify, before it answers: a second tap, say.
    var duringSignIn: @Sendable () async -> Void = {}
    /// Runs inside each refresh, before it answers: another process writing the store, say.
    var duringRefresh: @Sendable () async -> Void = {}

    /// Each send answers from `send` (nil: the server accepted), then succeeds; each verify
    /// from `verify`, then refuses the code.
    init(
        send: [AuthFailure?] = [], verify: [Result<AuthSession, AuthFailure>] = [],
        refresh: [Result<AuthSession, AuthFailure>] = [], signOut: [AuthFailure?] = []
    ) {
        sendAnswers = send
        verifyAnswers = verify
        refreshAnswers = refresh
        signOutAnswers = signOut
    }

    private func record(_ call: String) { lock.withLock { calls.append(call) } }

    func sendCode(to email: String) async throws(AuthFailure) {
        record("sendCode \(email)")
        await duringSignIn()
        let answer = lock.withLock { sendAnswers.isEmpty ? nil : sendAnswers.removeFirst() }
        if let answer { throw answer }
    }

    func verify(email: String, code: String) async throws(AuthFailure) -> AuthSession {
        record("verify \(email) \(code)")
        await duringSignIn()
        let answer = lock.withLock {
            verifyAnswers.isEmpty ? .failure(.codeNotVerified) : verifyAnswers.removeFirst()
        }
        return try answer.get()
    }

    func refresh(_ session: AuthSession) async throws(AuthFailure) -> AuthSession {
        record("refresh \(session.refreshToken)")
        await duringRefresh()
        let answer = lock.withLock {
            refreshAnswers.isEmpty ? .failure(.network) : refreshAnswers.removeFirst()
        }
        return try answer.get()
    }

    func signOut(_ session: AuthSession) async throws(AuthFailure) {
        record("signOut \(session.accessToken)")
        let answer = lock.withLock { signOutAnswers.isEmpty ? nil : signOutAnswers.removeFirst() }
        if let answer { throw answer }
    }
}

/// A clock the test moves by hand.
final class ManualClock: @unchecked Sendable {
    private let lock = NSLock()
    private var current: Date
    init(_ date: Date) { current = date }
    var now: Date { lock.withLock { current } }
    func advance(_ seconds: TimeInterval) { lock.withLock { current += seconds } }
}

@Suite struct SessionManagerTests {
    let start = Date(timeIntervalSince1970: 1_793_847_600)

    func session(_ n: Int, expiresIn seconds: TimeInterval = 3600) -> AuthSession {
        AuthSession(
            accessToken: "access-\(n)", refreshToken: "refresh-\(n)",
            expiresAt: start.addingTimeInterval(seconds))
    }

    func manager(
        _ auth: FakeAuth, _ store: InMemorySessionStore, _ clock: ManualClock
    ) -> SessionManager {
        SessionManager(auth: auth, store: store, now: { clock.now })
    }

    @Test func withNoSessionThereIsNoToken() async {
        let manager = manager(FakeAuth(), InMemorySessionStore(), ManualClock(start))
        await #expect(throws: SessionError.signedOut) { try await manager.accessToken() }
        #expect(await manager.isSignedIn == false)
    }

    @Test func beginningASessionStoresIt() async throws {
        let store = InMemorySessionStore()
        let manager = manager(FakeAuth(), store, ManualClock(start))
        try await manager.begin(session(1))
        #expect(try store.load() == session(1))
        #expect(await manager.isSignedIn)
    }

    @Test func aFreshTokenIsUsedAsItIs() async throws {
        let auth = FakeAuth()
        let store = InMemorySessionStore(session(1))
        let clock = ManualClock(start)
        clock.advance(3600 - 31)
        #expect(try await manager(auth, store, clock).accessToken() == "access-1")
        #expect(auth.calls.isEmpty)
    }

    @Test func refreshesThirtySecondsBeforeTheTokenRunsOut() async throws {
        let auth = FakeAuth(refresh: [.success(session(2, expiresIn: 7200))])
        let store = InMemorySessionStore(session(1))
        let clock = ManualClock(start)
        clock.advance(3600 - 30)
        #expect(try await manager(auth, store, clock).accessToken() == "access-2")
        #expect(auth.calls == ["refresh refresh-1"])
        #expect(try store.load() == session(2, expiresIn: 7200))
    }

    @Test func callersWaitingTogetherShareOneRefresh() async throws {
        let auth = FakeAuth(refresh: [.success(session(2, expiresIn: 7200))])
        auth.duringRefresh = { try? await Task.sleep(for: .milliseconds(50)) }
        let manager = manager(auth, InMemorySessionStore(session(1)), ManualClock(start + 3600))
        async let first = manager.accessToken()
        async let second = manager.accessToken()
        async let third = manager.accessToken()
        let tokens = try await [first, second, third]
        #expect(tokens == ["access-2", "access-2", "access-2"])
        #expect(auth.calls == ["refresh refresh-1"])
    }

    @Test func aRejectedTokenIsRefreshedOnce() async throws {
        let auth = FakeAuth(refresh: [.success(session(2, expiresIn: 7200))])
        let manager = manager(auth, InMemorySessionStore(session(1)), ManualClock(start))
        #expect(try await manager.accessToken(afterRejecting: "access-1") == "access-2")
        #expect(auth.calls == ["refresh refresh-1"])
    }

    @Test func anOlderRejectedTokenUsesTheNewerOne() async throws {
        // Another caller, or the share extension, refreshed after this token was sent.
        let auth = FakeAuth()
        let manager = manager(auth, InMemorySessionStore(session(2)), ManualClock(start))
        #expect(try await manager.accessToken(afterRejecting: "access-1") == "access-2")
        #expect(auth.calls.isEmpty)
    }

    @Test func anEndedSessionIsForgotten() async throws {
        let store = InMemorySessionStore(session(1))
        let auth = FakeAuth(refresh: [.failure(.sessionEnded)])
        let manager = manager(auth, store, ManualClock(start + 3600))
        await #expect(throws: SessionError.signedOut) { try await manager.accessToken() }
        #expect(try store.load() == nil)
    }

    @Test func aRefreshTokenTheOtherProcessUsedFirstGivesWayToItsSession() async throws {
        let store = InMemorySessionStore(session(1))
        let auth = FakeAuth(refresh: [.failure(.refreshTokenAlreadyUsed)])
        auth.duringRefresh = { try? store.save(session(5, expiresIn: 7200)) }
        let manager = manager(auth, store, ManualClock(start + 3600))
        #expect(try await manager.accessToken() == "access-5")
        #expect(try store.load() == session(5, expiresIn: 7200))
    }

    @Test func aRefreshTokenUsedWithNoNewerSessionEndsIt() async throws {
        let store = InMemorySessionStore(session(1))
        let auth = FakeAuth(refresh: [.failure(.refreshTokenAlreadyUsed)])
        let manager = manager(auth, store, ManualClock(start + 3600))
        await #expect(throws: SessionError.signedOut) { try await manager.accessToken() }
        #expect(try store.load() == nil)
    }

    @Test func aBusyOrUnreachableServerKeepsTheSession() async throws {
        for (failure, error) in [
            (AuthFailure.network, SessionError.network), (.unavailable, .unavailable),
        ] {
            let store = InMemorySessionStore(session(1))
            let manager = manager(
                FakeAuth(refresh: [.failure(failure)]), store, ManualClock(start + 3600))
            await #expect(throws: error) { try await manager.accessToken() }
            #expect(try store.load() == session(1))
        }
    }

    @Test func signingOutEndsTheSessionOnTheServerThenForgetsIt() async throws {
        let store = InMemorySessionStore(session(1))
        let auth = FakeAuth()
        await manager(auth, store, ManualClock(start)).signOut()
        #expect(auth.calls == ["signOut access-1"])
        #expect(try store.load() == nil)
    }

    @Test func signingOutWithAnExpiredTokenRefreshesItFirst() async throws {
        let store = InMemorySessionStore(session(1))
        let auth = FakeAuth(refresh: [.success(session(2, expiresIn: 7200))])
        await manager(auth, store, ManualClock(start + 3600)).signOut()
        #expect(auth.calls == ["refresh refresh-1", "signOut access-2"])
        #expect(try store.load() == nil)
    }

    @Test func signingOutOfflineStillForgetsTheSession() async throws {
        let store = InMemorySessionStore(session(1))
        let auth = FakeAuth(refresh: [.failure(.network)], signOut: [.network])
        await manager(auth, store, ManualClock(start + 3600)).signOut()
        #expect(try store.load() == nil)
        await manager(auth, InMemorySessionStore(session(1)), ManualClock(start)).signOut()
        #expect(auth.calls.last == "signOut access-1")
    }

    @Test func aTokenTheServerRefusesAtSignOutIsRefreshedAndSentOnce() async throws {
        // The device's clock said the token was good; the server's didn't.
        let store = InMemorySessionStore(session(1))
        let auth = FakeAuth(
            refresh: [.success(session(2, expiresIn: 7200))],
            signOut: [.accessTokenRejected, .accessTokenRejected])
        await manager(auth, store, ManualClock(start)).signOut()
        #expect(auth.calls == ["signOut access-1", "refresh refresh-1", "signOut access-2"])
        #expect(try store.load() == nil)
    }
}
