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
    /// Runs inside each sign-out, before it answers.
    var duringSignOut: @Sendable () async -> Void = {}

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
        await duringSignOut()
        let answer = lock.withLock { signOutAnswers.isEmpty ? nil : signOutAnswers.removeFirst() }
        if let answer { throw answer }
    }
}

/// Holds each call that waits on it until the test opens it, and tells the test when a call has
/// reached it, so a test can put two calls in a chosen order.
final class Gate: @unchecked Sendable {
    private let lock = NSLock()
    private var opened = false
    private var arrived = 0
    private var held: [CheckedContinuation<Void, Never>] = []
    private var watchers: [(count: Int, continuation: CheckedContinuation<Void, Never>)] = []

    func wait() async {
        await withCheckedContinuation { continuation in
            let ready: [CheckedContinuation<Void, Never>] = lock.withLock {
                arrived += 1
                let due = watchers.filter { $0.count <= arrived }.map(\.continuation)
                watchers.removeAll { $0.count <= arrived }
                if opened { return due + [continuation] }
                held.append(continuation)
                return due
            }
            for waiting in ready { waiting.resume() }
        }
    }

    /// Returns once `count` calls have reached the gate.
    func reached(_ count: Int = 1) async {
        await withCheckedContinuation { continuation in
            let now = lock.withLock {
                if arrived >= count { return true }
                watchers.append((count, continuation))
                return false
            }
            if now { continuation.resume() }
        }
    }

    func open() {
        let ready = lock.withLock {
            opened = true
            defer { held = [] }
            return held
        }
        for waiting in ready { waiting.resume() }
    }
}

/// A store whose delete fails its first `failures` times, and whose load its first
/// `loadFailures` times, as a keychain can; with `refusesEmptyDelete`, deleting nothing fails too.
final class StubbornStore: SessionStore, @unchecked Sendable {
    struct Refused: Error {}
    private let lock = NSLock()
    private let inner: InMemorySessionStore
    private var failures: Int
    private var loadFailures: Int
    private let refusesEmptyDelete: Bool
    private(set) var deletes = 0

    init(
        _ session: AuthSession?, failures: Int = 0, loadFailures: Int = 0,
        refusesEmptyDelete: Bool = false
    ) {
        inner = InMemorySessionStore(session)
        self.failures = failures
        self.loadFailures = loadFailures
        self.refusesEmptyDelete = refusesEmptyDelete
    }

    func load() throws -> AuthSession? {
        let refuse = lock.withLock {
            guard loadFailures > 0 else { return false }
            loadFailures -= 1
            return true
        }
        if refuse { throw Refused() }
        return try inner.load()
    }

    func save(_ session: AuthSession) throws { try inner.save(session) }

    /// Makes the next load throw, as a keychain read can once.
    func refuseNextLoad() { lock.withLock { loadFailures += 1 } }

    func delete() throws {
        let empty = (try? inner.load()) == nil
        let refuse = lock.withLock {
            deletes += 1
            if empty && refusesEmptyDelete { return true }
            guard failures > 0 else { return false }
            failures -= 1
            return true
        }
        if refuse { throw Refused() }
        try inner.delete()
    }
}

/// A store holding a session that can never be used, as a keychain item whose bytes don't decode
/// is: its load throws `UnusableSession` until a sign-in writes over it or a sign-out deletes it.
final class UnusableStore: SessionStore, @unchecked Sendable {
    private let lock = NSLock()
    private var session: AuthSession?
    private var unusable = true

    func load() throws -> AuthSession? {
        try lock.withLock {
            if unusable { throw UnusableSession() }
            return session
        }
    }

    func save(_ session: AuthSession) throws {
        lock.withLock {
            unusable = false
            self.session = session
        }
    }

    func delete() throws {
        lock.withLock {
            unusable = false
            session = nil
        }
    }
}

/// Yields until `condition` holds, and records a failure after 10,000 tries rather than spin
/// forever when a change breaks it.
func eventually(_ condition: () async -> Bool) async {
    for _ in 0..<10_000 {
        if await condition() { return }
        await Task.yield()
    }
    Issue.record("the condition never held")
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
        _ auth: FakeAuth, _ store: any SessionStore, _ clock: ManualClock
    ) -> SessionManager {
        SessionManager(auth: auth, store: store, now: { clock.now })
    }

    @Test func withNoSessionThereIsNoToken() async throws {
        let manager = manager(FakeAuth(), InMemorySessionStore(), ManualClock(start))
        await #expect(throws: SessionError.signedOut) { try await manager.accessToken() }
        #expect(try await manager.isSignedIn == false)
    }

    @Test func aKeychainReadThatFailsEndsNothing() async throws {
        // A read the keychain refuses for a moment (before the first unlock after a restart,
        // say) isn't "nothing stored": no token is handed out, the session stays kept, and
        // neither says signed out (FQ89: a hiccup never signs anyone out). The next read that
        // works uses it.
        let auth = FakeAuth()
        let store = StubbornStore(session(1), loadFailures: 2)
        let manager = manager(auth, store, ManualClock(start))
        await #expect(throws: SessionError.unavailable) { try await manager.accessToken() }
        await #expect(throws: SessionError.unavailable) { try await manager.isSignedIn }
        #expect(try await manager.accessToken() == "access-1")
        #expect(try await manager.isSignedIn)
        store.refuseNextLoad()
        await #expect(throws: SessionError.unavailable) {
            try await manager.accessToken(afterRejecting: "access-1")
        }
        #expect(try store.load() == session(1))
        #expect(store.deletes == 0)
        #expect(auth.calls.isEmpty)
    }

    @Test func aSessionThatCanNeverBeReadIsNoSession() async throws {
        // Bytes that don't decode never will: that reads as signed out, so sign-in can start
        // and write over them, where waiting would show Retry forever.
        let store = UnusableStore()
        let manager = manager(FakeAuth(), store, ManualClock(start))
        await #expect(throws: SessionError.signedOut) { try await manager.accessToken() }
        await #expect(throws: SessionError.signedOut) {
            try await manager.accessToken(afterRejecting: "access-1")
        }
        #expect(try await manager.isSignedIn == false)
        try await manager.begin(session(2))
        #expect(try await manager.accessToken() == "access-2")
    }

    @Test func beginningASessionStoresIt() async throws {
        let store = InMemorySessionStore()
        let manager = manager(FakeAuth(), store, ManualClock(start))
        try await manager.begin(session(1))
        #expect(try store.load() == session(1))
        #expect(try await manager.isSignedIn)
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

    @Test func signingOutOfflineWithAnExpiredTokenStillForgetsIt() async throws {
        let store = InMemorySessionStore(session(1))
        let auth = FakeAuth(refresh: [.failure(.network)])
        #expect(await manager(auth, store, ManualClock(start + 3600)).signOut())
        #expect(auth.calls == ["refresh refresh-1"])
        #expect(try store.load() == nil)
    }

    @Test func signingOutWithNoAnswerFromTheServerStillForgetsIt() async throws {
        let store = InMemorySessionStore(session(1))
        let auth = FakeAuth(signOut: [.network])
        #expect(await manager(auth, store, ManualClock(start)).signOut())
        #expect(auth.calls == ["signOut access-1"])
        #expect(try store.load() == nil)
    }

    @Test func aRefreshOnItsWayAtSignOutIsEndedAndNotKept() async throws {
        // Spec 23: Log out leaves nothing for the next launch. The refresh lands first, so the
        // session ended on the server is the newest one, and then it is forgotten.
        let gate = Gate()
        let auth = FakeAuth(refresh: [.success(session(2, expiresIn: 7200))])
        auth.duringRefresh = { await gate.wait() }
        let store = InMemorySessionStore(session(1, expiresIn: 20))
        let manager = manager(auth, store, ManualClock(start))
        let token = Task { try await manager.accessToken() }
        await gate.reached()
        let signOut = Task { await manager.signOut() }
        await eventually { (try? await manager.isSignedIn) == false }
        gate.open()
        #expect(await signOut.value)
        #expect(try await token.value == "access-2")
        #expect(auth.calls == ["refresh refresh-1", "signOut access-2"])
        #expect(try store.load() == nil)
        #expect(try await manager.isSignedIn == false)
    }

    @Test func aRefreshThatLandsAfterASignInLeavesTheNewSession() async throws {
        // An account switch: the old session's late answer never replaces the new one.
        let gate = Gate()
        let auth = FakeAuth(refresh: [.success(session(2, expiresIn: 7200))])
        auth.duringRefresh = { await gate.wait() }
        let store = InMemorySessionStore(session(1, expiresIn: 20))
        let manager = manager(auth, store, ManualClock(start))
        let token = Task { try await manager.accessToken() }
        await gate.reached()
        try await manager.begin(session(9))
        gate.open()
        await #expect(throws: SessionError.signedOut) { try await token.value }
        #expect(try store.load() == session(9))
    }

    @Test func aRefusedRefreshThatLandsAfterASignInForgetsNothing() async throws {
        let gate = Gate()
        let auth = FakeAuth(refresh: [.failure(.sessionEnded)])
        auth.duringRefresh = { await gate.wait() }
        let store = InMemorySessionStore(session(1, expiresIn: 20))
        let manager = manager(auth, store, ManualClock(start))
        let token = Task { try await manager.accessToken() }
        await gate.reached()
        try await manager.begin(session(9))
        gate.open()
        _ = try? await token.value
        #expect(try store.load() == session(9))
    }

    @Test func noTokenIsHandedOutWhileSigningOut() async throws {
        let gate = Gate()
        let auth = FakeAuth()
        auth.duringSignOut = { await gate.wait() }
        let store = InMemorySessionStore(session(1))
        let manager = manager(auth, store, ManualClock(start))
        let signOut = Task { await manager.signOut() }
        await gate.reached()
        await #expect(throws: SessionError.signedOut) { try await manager.accessToken() }
        await #expect(throws: SessionError.signedOut) {
            try await manager.accessToken(afterRejecting: "access-1")
        }
        #expect(try await manager.isSignedIn == false)
        gate.open()
        #expect(await signOut.value)
        #expect(try store.load() == nil)
    }

    @Test func aSignInWhileSigningOutIsKept() async throws {
        let gate = Gate()
        let auth = FakeAuth()
        auth.duringSignOut = { await gate.wait() }
        let store = InMemorySessionStore(session(1))
        let manager = manager(auth, store, ManualClock(start))
        let signOut = Task { await manager.signOut() }
        await gate.reached()
        try await manager.begin(session(9))
        gate.open()
        #expect(await signOut.value)
        #expect(try store.load() == session(9))
    }

    @Test func twoSignOutsAtOnceEndTheSessionOnce() async throws {
        let gate = Gate()
        let auth = FakeAuth()
        auth.duringSignOut = { await gate.wait() }
        let store = InMemorySessionStore(session(1))
        let manager = manager(auth, store, ManualClock(start))
        let first = Task { await manager.signOut() }
        await gate.reached()
        let second = Task { await manager.signOut() }
        await Task.yield()
        await #expect(throws: SessionError.signedOut) { try await manager.accessToken() }
        gate.open()
        #expect(await first.value)
        #expect(await second.value)
        #expect(auth.calls == ["signOut access-1"])
        #expect(try store.load() == nil)
    }

    @Test func anotherProcessesRefreshThatLandsAfterSignOutIsNotStored() async throws {
        // The share extension's own manager, on the same keychain session: its late answer
        // finds the store empty and stores nothing (spec 23).
        let gate = Gate()
        let store = InMemorySessionStore(session(1, expiresIn: 20))
        let extensionAuth = FakeAuth(refresh: [.success(session(2, expiresIn: 7200))])
        extensionAuth.duringRefresh = { await gate.wait() }
        let app = manager(FakeAuth(), store, ManualClock(start))
        let shareExtension = manager(extensionAuth, store, ManualClock(start))
        let token = Task { try await shareExtension.accessToken() }
        await gate.reached()
        #expect(await app.signOut())
        gate.open()
        await #expect(throws: SessionError.signedOut) { try await token.value }
        #expect(try store.load() == nil)
        #expect(try await app.isSignedIn == false)
    }

    @Test func aRefreshThatFindsAnotherProcessesNewerSessionKeepsIt() async throws {
        let gate = Gate()
        let store = InMemorySessionStore(session(1, expiresIn: 20))
        let auth = FakeAuth(refresh: [.success(session(2, expiresIn: 7200))])
        auth.duringRefresh = { await gate.wait() }
        let manager = manager(auth, store, ManualClock(start))
        let token = Task { try await manager.accessToken() }
        await gate.reached()
        try store.save(session(3, expiresIn: 7200))
        gate.open()
        #expect(try await token.value == "access-3")
        #expect(try store.load() == session(3, expiresIn: 7200))
    }

    @Test func aSignInWhileSignOutWaitsForARefreshIsKept() async throws {
        let gate = Gate()
        let auth = FakeAuth(refresh: [.success(session(2, expiresIn: 7200))])
        auth.duringRefresh = { await gate.wait() }
        let store = InMemorySessionStore(session(1, expiresIn: 20))
        let manager = manager(auth, store, ManualClock(start))
        let token = Task { try await manager.accessToken() }
        await gate.reached()
        let signOut = Task { await manager.signOut() }
        await eventually { (try? await manager.isSignedIn) == false }
        try await manager.begin(session(9))
        gate.open()
        _ = try? await token.value
        #expect(await signOut.value)
        #expect(auth.calls == ["refresh refresh-1"])
        #expect(try store.load() == session(9))
    }

    @Test func aRefreshWhoseStoreCantBeReadKeepsTheServersAnswer() async throws {
        // A keychain read that fails once after Supabase answers isn't a sign-out: a busy
        // server stays busy, and a fresh session is kept.
        for (answer, expected) in [
            (Result<AuthSession, AuthFailure>.failure(.unavailable), SessionError.unavailable),
            (.failure(.network), .network),
        ] {
            let gate = Gate()
            let auth = FakeAuth(refresh: [answer])
            auth.duringRefresh = { await gate.wait() }
            let store = StubbornStore(session(1, expiresIn: 20))
            let manager = manager(auth, store, ManualClock(start))
            let token = Task { try await manager.accessToken() }
            await gate.reached()
            store.refuseNextLoad()
            gate.open()
            await #expect(throws: expected) { try await token.value }
            #expect(try store.load() == session(1, expiresIn: 20))
        }
        let gate = Gate()
        let auth = FakeAuth(refresh: [.success(session(2, expiresIn: 7200))])
        auth.duringRefresh = { await gate.wait() }
        let store = StubbornStore(session(1, expiresIn: 20))
        let manager = manager(auth, store, ManualClock(start))
        let token = Task { try await manager.accessToken() }
        await gate.reached()
        store.refuseNextLoad()
        gate.open()
        #expect(try await token.value == "access-2")
        #expect(try store.load() == session(2, expiresIn: 7200))
    }

    @Test func aRefreshTokenAlreadyUsedWithAStoreThatCantBeReadEndsNothing() async throws {
        // "Already used" ends the session only when the store, read again, still holds the
        // token sent: the share extension may have refreshed it first. A read the keychain
        // refuses can't say, so nothing is deleted, and the next read finds what it holds (FQ89).
        let gate = Gate()
        let auth = FakeAuth(refresh: [.failure(.refreshTokenAlreadyUsed)])
        auth.duringRefresh = { await gate.wait() }
        let store = StubbornStore(session(1, expiresIn: 20))
        let manager = manager(auth, store, ManualClock(start))
        let token = Task { try await manager.accessToken() }
        await gate.reached()
        store.refuseNextLoad()
        gate.open()
        await #expect(throws: SessionError.unavailable) { try await token.value }
        #expect(try store.load() == session(1, expiresIn: 20))
        #expect(store.deletes == 0)
        #expect(try await manager.isSignedIn)
    }

    @Test func aSignOutAskedForAfterANewerSignInEndsThatOneToo() async throws {
        // A sign-out that began before a sign-in can't stand in for one asked for after it.
        let gate = Gate()
        let auth = FakeAuth(refresh: [.success(session(2, expiresIn: 7200))])
        auth.duringRefresh = { await gate.wait() }
        let store = InMemorySessionStore(session(1, expiresIn: 20))
        let manager = manager(auth, store, ManualClock(start))
        let token = Task { try await manager.accessToken() }
        await gate.reached()
        let first = Task { await manager.signOut() }
        await eventually { (try? await manager.isSignedIn) == false }
        try await manager.begin(session(9))
        let second = Task { await manager.signOut() }
        for _ in 0..<50 { await Task.yield() }
        gate.open()
        _ = try? await token.value
        #expect(await first.value)
        #expect(await second.value)
        #expect(auth.calls == ["refresh refresh-1", "signOut access-9"])
        #expect(try store.load() == nil)
        #expect(try await manager.isSignedIn == false)
    }

    @Test func aStoreThatCantBeReadIsStillForgotten() async throws {
        // A load that throws isn't "nothing stored": the session is deleted all the same.
        let store = StubbornStore(session(1), loadFailures: 1)
        #expect(await manager(FakeAuth(), store, ManualClock(start)).signOut())
        #expect(store.deletes == 1)
        #expect(try store.load() == nil)
    }

    @Test func aStoreThatRefusesToDeleteNothingHasForgotten() async throws {
        // An ended session is deleted by the refresh, then again by the sign-out; a store that
        // refuses to delete what isn't there has still forgotten it.
        let store = StubbornStore(session(1), refusesEmptyDelete: true)
        let auth = FakeAuth(refresh: [.failure(.sessionEnded)])
        #expect(await manager(auth, store, ManualClock(start + 3600)).signOut())
        #expect(try store.load() == nil)
    }

    @Test func aStoreThatRefusesOnceIsAskedAgain() async throws {
        let store = StubbornStore(session(1), failures: 1)
        #expect(await manager(FakeAuth(), store, ManualClock(start)).signOut())
        #expect(store.deletes == 2)
        #expect(try store.load() == nil)
    }

    @Test func aStoreThatWontForgetIsSaidSo() async throws {
        // SEC-5: the caller mustn't show sign-in over a session the device still keeps.
        let store = StubbornStore(session(1), failures: 2)
        #expect(await manager(FakeAuth(), store, ManualClock(start)).signOut() == false)
        #expect(try store.load() == session(1))
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
