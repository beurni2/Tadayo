import SnapshotTesting
import SwiftUI
import TadayoCore
import TadayoDesign
import XCTest

/// A screen as the renders draw it: 393 by 852 points with the safe areas of the phone they're
/// drawn for (59 at the top, 34 at the bottom), at 2x like the renders, in sRGB, in light, in
/// dark, and at the largest accessibility text size (docs/TECH-DESIGN.md section 2). The
/// keyboard and the status bar aren't drawn (T45): a field shows its focus itself.
///
/// The `-xl` snapshot is a phone tall enough to hold the whole screen at that size, since at
/// AX5 the content scrolls: what would scroll is laid out down the image, with the pinned
/// action at its foot (a known difference in INVENTORY.md).
@MainActor
enum ScreenSnapshot {
    enum Variant: CaseIterable {
        case light, dark, xl

        var suffix: String {
            switch self {
            case .light: ""
            case .dark: "-dark"
            case .xl: "-xl"
            }
        }

        var traits: UITraitCollection {
            UITraitCollection(mutations: { traits in
                traits.userInterfaceStyle = self == .dark ? .dark : .light
                traits.preferredContentSizeCategory =
                    self == .xl ? .accessibilityExtraExtraExtraLarge : .large
                traits.displayGamut = .SRGB
                traits.displayScale = 2
            })
        }

        func config(xlHeight: CGFloat) -> ViewImageConfig {
            ViewImageConfig(
                safeArea: UIEdgeInsets(top: 59, left: 0, bottom: 34, right: 0),
                size: CGSize(width: 393, height: self == .xl ? xlHeight : 852),
                traits: traits)
        }
    }

    /// Snapshots `view` as `state`, `state-dark` and `state-xl`, named so the contact sheets
    /// pair each with its render (`tools/ci/ios_steps.py`).
    static func assert(
        _ view: some View, named state: String, xlHeight: CGFloat = 2200,
        file: StaticString = #filePath, testName: String = #function, line: UInt = #line
    ) {
        for variant in Variant.allCases {
            let shown =
                view
                .environment(\.colorScheme, variant == .dark ? .dark : .light)
                .environment(\.dynamicTypeSize, variant == .xl ? .accessibility5 : .large)
                .environment(\.locale, Locale(identifier: "en_US"))
            assertSnapshot(
                of: shown,
                as: .image(
                    perceptualPrecision: 0.98,
                    layout: .device(config: variant.config(xlHeight: xlHeight)),
                    traits: variant.traits),
                named: state + variant.suffix, file: file, testName: testName, line: line)
        }
    }

    /// Runs `action` and turns the main run loop until `condition` holds, so a screen can be
    /// snapshotted in the middle of a request that never answers.
    static func drive(
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

/// Supabase Auth, answering each send and each verify as scripted, in order.
final class ScriptedAuth: AuthService, @unchecked Sendable {
    private let lock = NSLock()
    private var sends: [Outcome<AuthFailure>]
    private var verifies: [Outcome<AuthFailure>]

    init(sends: [Outcome<AuthFailure>] = [.answer], verifies: [Outcome<AuthFailure>] = []) {
        self.sends = sends
        self.verifies = verifies
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
    func signOut(_ session: AuthSession) async throws(AuthFailure) {}
}

/// The API, answering each account change as scripted.
final class ScriptedAccounts: AccountService, @unchecked Sendable {
    private let lock = NSLock()
    private var updates: [Outcome<APIFailure>]

    init(updates: [Outcome<APIFailure>]) {
        self.updates = updates
    }

    func me() async throws(APIFailure) -> Account { throw .network }

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
