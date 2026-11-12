import TadayoCore
import XCTest

/// The scripted services the sign-in tests drive their models with, and the helper that drives
/// them, in a file both test targets compile (`project.yml`: `TadayoSnapshotTests` has the whole
/// folder, `TadayoTests` names this file), so a reading of what VoiceOver finds on a screen can
/// run in the hosted tests, which the iOS 17.5 and 18.6 compatibility runs also run, and not
/// only in the snapshot tests, which they skip (`tools/ci/ios_steps.py`).

/// Runs `action` and turns the main run loop until `condition` holds, so a screen can be
/// snapshotted, or read, in the middle of a request that never answers.
@MainActor
func drive(
    _ action: @escaping @MainActor () async -> Void, until condition: () -> Bool,
    file: StaticString = #filePath, line: UInt = #line
) {
    Task { await action() }
    let deadline = Date().addingTimeInterval(5)
    while !condition(), Date() < deadline {
        RunLoop.main.run(until: Date().addingTimeInterval(0.01))
    }
    XCTAssertTrue(condition(), "the state wasn't reached", file: file, line: line)
}

/// What a fake call does: answers, fails, or never answers (a request still on its way).
enum Outcome<Failure: Error & Sendable>: Sendable {
    case answer
    case fail(Failure)
    case hang

    func play() async throws(Failure) {
        switch self {
        case .answer:
            return
        case .fail(let failure):
            throw failure
        case .hang:
            try? await Task.sleep(for: .seconds(3600))
        }
    }
}

/// Supabase Auth, answering each send and each verify as scripted, in order, and each sign-out
/// the same way: with an answer, or, to hold Leave sign-in on its wait, never.
final class ScriptedAuth: AuthService, @unchecked Sendable {
    private let lock = NSLock()
    private var sends: [Outcome<AuthFailure>]
    private var verifies: [Outcome<AuthFailure>]
    private let signOutOutcome: Outcome<AuthFailure>

    init(
        sends: [Outcome<AuthFailure>] = [.answer], verifies: [Outcome<AuthFailure>] = [],
        signOut: Outcome<AuthFailure> = .answer
    ) {
        self.sends = sends
        self.verifies = verifies
        self.signOutOutcome = signOut
    }

    func sendCode(to email: String) async throws(AuthFailure) {
        let outcome = lock.withLock { sends.isEmpty ? .hang : sends.removeFirst() }
        try await outcome.play()
    }

    func verify(email: String, code: String) async throws(AuthFailure) -> AuthSession {
        let outcome = lock.withLock { verifies.isEmpty ? .hang : verifies.removeFirst() }
        try await outcome.play()
        return AuthSession(accessToken: "a", refreshToken: "r", expiresAt: .distantFuture)
    }

    func refresh(_ session: AuthSession) async throws(AuthFailure) -> AuthSession { session }
    func signOut(_ session: AuthSession) async throws(AuthFailure) {
        try await signOutOutcome.play()
    }
}

/// The API, answering each account change as scripted, and each read of the account the same way
/// (by default with no answer from the network; `.hang` holds the root on its wait).
final class ScriptedAccounts: AccountService, @unchecked Sendable {
    private let lock = NSLock()
    private var updates: [Outcome<APIFailure>]
    private let meOutcome: Outcome<APIFailure>

    init(updates: [Outcome<APIFailure>], me: Outcome<APIFailure> = .fail(.network)) {
        self.updates = updates
        self.meOutcome = me
    }

    func me() async throws(APIFailure) -> Account {
        try await meOutcome.play()
        return Account(
            id: "ben", displayName: "Ben", avatarVersion: nil, ageConfirmed: true, version: 2)
    }

    func update(_ change: AccountChange, key: IdempotencyKey) async throws(APIFailure) -> Account {
        let outcome = lock.withLock { updates.isEmpty ? .hang : updates.removeFirst() }
        try await outcome.play()
        return Account(
            id: "ben", displayName: "Ben", avatarVersion: nil, ageConfirmed: true, version: 2)
    }

    func clubs() async throws(APIFailure) -> ClubList { throw .network }
}

/// The continuous clock for the resend wait: it stands still, and a wait on it never ends
/// unless the test lets the minute pass.
final class StillClock: @unchecked Sendable {
    private let lock = NSLock()
    private var instant = ContinuousClock.now
    private var minutePasses = false

    var now: ContinuousClock.Instant { lock.withLock { instant } }

    func letTheMinutePass() { lock.withLock { minutePasses = true } }

    func sleep(until due: ContinuousClock.Instant) async throws {
        if lock.withLock({ minutePasses }) {
            lock.withLock { instant = due }
        } else {
            try await Task.sleep(for: .seconds(3600))
        }
    }
}
