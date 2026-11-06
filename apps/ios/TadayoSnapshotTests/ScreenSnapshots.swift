import SnapshotTesting
import SwiftUI
import TadayoCore
import TadayoDesign
import XCTest

/// A screen as the renders draw it: 393 by 852 points, at 2x like the renders, in sRGB, in light,
/// in dark, and at the largest accessibility text size (docs/TECH-DESIGN.md section 2). The
/// keyboard and the status bar aren't drawn (T45): a field shows its focus itself.
///
/// It's drawn in the host app's key window, as the screen shows it (`drawHierarchy`), since
/// iOS 26's bars draw their title and buttons through effects a layer render leaves out: their
/// title came out white on the light canvas, and a toolbar button not at all. A window there
/// takes its safe areas from the screen: the top is the simulator iPhone 17's 62 (the frames'
/// phone has 59), and the bottom, which a window shorter than the 874-point screen loses, is
/// made the frames' 34 (`FramedHost`). A window the screen's own size drew the bar 52 points
/// above where it laid it out. The window's layer time stands still while it's drawn, so an
/// animation is drawn at its start.
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

        /// The safe areas are the window's own and `FramedHost`'s (above), so none is given here.
        func config(xlHeight: CGFloat) -> ViewImageConfig {
            ViewImageConfig(
                safeArea: .zero,
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
            guard let window = keyWindow else {
                XCTFail("no key window to draw in", file: file, line: line)
                return
            }
            let (speed, offset) = (window.layer.speed, window.layer.timeOffset)
            (window.layer.speed, window.layer.timeOffset) = (0, 0)
            defer { (window.layer.speed, window.layer.timeOffset) = (speed, offset) }
            assertSnapshot(
                of: FramedHost(rootView: shown) as UIViewController,
                as: .image(
                    on: variant.config(xlHeight: xlHeight),
                    drawHierarchyInKeyWindow: true,
                    perceptualPrecision: 0.98,
                    traits: variant.traits),
                named: state + variant.suffix, file: file, testName: testName, line: line)
        }
    }

    /// The host app's key window, which the snapshot draws in.
    private static var keyWindow: UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
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

/// A hosting controller whose bottom safe area is the frames' 34 points, whatever its window
/// gives it: a 393 by 852 window on the iPhone 17 simulator's 874-point screen gets 12, and the
/// tall `-xl` window none.
final class FramedHost<Content: View>: UIHostingController<Content> {
    private let bottom: CGFloat = 34

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        let given = view.safeAreaInsets.bottom - additionalSafeAreaInsets.bottom
        let added = max(0, bottom - given)
        if additionalSafeAreaInsets.bottom != added {
            additionalSafeAreaInsets.bottom = added
        }
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
