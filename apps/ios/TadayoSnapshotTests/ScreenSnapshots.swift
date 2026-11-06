import ObjectiveC
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
/// made the frames' 34 (`FramedHost`). The busy button's spinner never turns (`StillHost`).
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

        /// The safe areas are the window's own and `FramedHost`'s (above). The frames' are given
        /// all the same: with none, SnapshotTesting moves the view off the screen, and the key
        /// window then drew the bar 52 points above where it laid it out.
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
            let host = FramedHost(rootView: shown)
            assertSnapshot(
                of: host as UIViewController,
                as: .image(
                    on: variant.config(xlHeight: xlHeight),
                    drawHierarchyInKeyWindow: true,
                    perceptualPrecision: 0.98,
                    traits: variant.traits),
                named: state + variant.suffix, file: file, testName: testName, line: line)
            XCTAssertEqual(
                Spinners.moving(in: host.view), [], "\(state)\(variant.suffix): a spinner moved",
                file: file, line: line)
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

/// A hosting controller in which the system's activity indicator, the busy button's spinner,
/// never turns, so every snapshot draws it at its first frame (`Spinners`).
class StillHost<Content: View>: UIHostingController<Content> {
    override init(rootView: Content) {
        Spinners.neverTurn()
        super.init(rootView: rootView)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("not used")
    }
}

/// A still hosting controller whose bottom safe area is the frames' 34 points, whatever its
/// window gives it: a 393 by 852 window on the iPhone 17 simulator's 874-point screen gets 12,
/// and the tall `-xl` window none.
final class FramedHost<Content: View>: StillHost<Content> {
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

/// The system's activity indicators in the snapshot tests. On iOS 26 one turns by an image view
/// stepping through 16 frames in 0.8 seconds, and stopping it keeps the frame it had reached, so
/// a stopped one comes out differently from one run to the next (`docs/LIMITATIONS.md`). So in
/// this test process `startAnimating` only keeps the indicator shown, never starting its frames,
/// and UIKit draws it at its first, the same every time, in a layer render and a window's draw
/// alike. Sentry's SnapshotPreviews does the same (its v0.19.0).
@MainActor
enum Spinners {
    /// Swaps `UIActivityIndicatorView.startAnimating` for `tadayoKeepStill`, once.
    static func neverTurn() { _ = swapped }

    private static let swapped: Bool = {
        let indicator: AnyClass = UIActivityIndicatorView.self
        guard
            let start = class_getInstanceMethod(
                indicator, #selector(UIActivityIndicatorView.startAnimating)),
            let still = class_getInstanceMethod(
                indicator, #selector(UIActivityIndicatorView.tadayoKeepStill))
        else { return false }
        method_exchangeImplementations(start, still)
        return true
    }()

    /// The indicators turning or with an animation in their layers, by description: none once
    /// `neverTurn` has run.
    static func moving(in view: UIView) -> [String] {
        all(in: view).filter { $0.isAnimating || isAnimated($0.layer) }.map(\.description)
    }

    static func all(in view: UIView) -> [UIActivityIndicatorView] {
        view.subviews.flatMap { subview in
            (subview as? UIActivityIndicatorView).map { [$0] } ?? all(in: subview)
        }
    }

    private static func isAnimated(_ layer: CALayer) -> Bool {
        !(layer.animationKeys() ?? []).isEmpty
            || (layer.sublayers ?? []).contains(where: isAnimated)
    }
}

extension UIActivityIndicatorView {
    /// `startAnimating` in this test process, once `Spinners.neverTurn` has run: shown, not turning.
    @objc fileprivate func tadayoKeepStill() {
        hidesWhenStopped = false
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
