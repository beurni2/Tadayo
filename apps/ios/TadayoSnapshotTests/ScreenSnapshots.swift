import CryptoKit
import ObjectiveC
import SnapshotTesting
import SwiftUI
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
/// The `-xl` snapshot is a phone 2,200 points tall, enough to hold the whole screen at that size,
/// since at AX5 the content scrolls: what would scroll is laid out down the image, with the
/// pinned action at its foot (a known difference in INVENTORY.md). No taller: a window 2,800
/// points tall came out empty, the render server returning an error (`docs/LIMITATIONS.md`).
///
/// Each image is drawn until two draws in a row come out the same, byte for byte, and that image
/// is compared with its reference once, at the same precision as ever. Each draw is a fresh
/// host's first, as before, so no screen is given longer to draw; the reference plays no part in
/// when the drawing stops. On iOS 27.2 a draw of the system's glass, a bar's button or the tab
/// bar, now and then comes out a little different, within 17 of 255, and the next draw as usual;
/// what decides it isn't known (`docs/LIMITATIONS.md`, 2026-11-14). A one-off difference anywhere
/// in a screen is drawn again the same way, so each extra draw is logged by name. A screen that
/// hasn't drawn the same twice in a row in `maximumDraws` draws fails: an element that moves has
/// to be made still, as the spinner is (`Spinners`), not left to the drawing.
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
        func config(width: CGFloat) -> ViewImageConfig {
            ViewImageConfig(
                safeArea: UIEdgeInsets(top: 59, left: 0, bottom: 34, right: 0),
                size: CGSize(width: width, height: self == .xl ? 2200 : 852),
                traits: traits)
        }
    }

    /// Snapshots `view` as `state`, `state-dark` and `state-xl`, named so the contact sheets
    /// pair each with its render (`tools/ci/ios_steps.py`). A `busy` state must hold an indicator
    /// (`Spinners.check`); the comparison with its reference shows it drawn. `variants` and
    /// `width` draw some of them at another width, 320 points say, named for it
    /// (`A02-code-error-320-xl`), as docs/TECH-DESIGN.md section 2 asks of the representative
    /// `-dark` and `-xl` states.
    static func assert(
        _ view: some View, named state: String, busy: Bool = false,
        variants: [Variant] = Variant.allCases, width: CGFloat = 393,
        file: StaticString = #filePath, testName: String = #function, line: UInt = #line
    ) {
        for variant in variants {
            let name = state + variant.suffix
            let shown =
                view
                .environment(\.colorScheme, variant == .dark ? .dark : .light)
                .environment(\.dynamicTypeSize, variant == .xl ? .accessibility5 : .large)
                .environment(\.locale, Locale(identifier: "en_US"))
            let (drawn, problem) = settled(
                { FramedHost(rootView: shown) }, variant: variant, width: width, name: name)
            if let problem { XCTFail("\(name): \(problem)", file: file, line: line) }
            guard let drawn else { continue }
            assertSnapshot(
                of: drawn.image,
                as: .image(
                    precision: 1, perceptualPrecision: 0.98, scale: variant.traits.displayScale),
                named: name, file: file, testName: testName, line: line)
            Spinners.check(drawn.host.view, busy: busy, name, file: file, line: line)
        }
    }

    /// The most draws made for one image: one that hasn't come out the same twice in a row by
    /// then fails.
    static let maximumDraws = 5

    /// How long one draw may take, SnapshotTesting's own `assertSnapshot` timeout.
    static let drawTimeout: TimeInterval = 5

    /// An image to compare with its reference, and the host that drew it.
    private struct Drawn {
        let image: UIImage
        let host: UIViewController
    }

    /// Draws a fresh host from `make` again and again, each as SnapshotTesting draws a view
    /// controller in the key window, until two draws in a row are the same, byte for byte as
    /// PNGs, or `maximumDraws` have been made, and gives the last draw. The problem, if any, is
    /// for the test to fail with: no settling, or a draw that gave no image or no PNG, which ends
    /// the drawing there. When it takes more than two draws, or doesn't settle, it logs a
    /// `warning:` line naming the image, with the start of each draw's SHA-256, in order.
    private static func settled(
        _ make: () -> UIViewController, variant: Variant, width: CGFloat, name: String
    ) -> (drawn: Drawn?, problem: String?) {
        var last: Data?
        var digests: [String] = []
        for number in 1...maximumDraws {
            let host = make()
            guard let image = draw(host, variant: variant, width: width) else {
                return (nil, "draw \(number) gave no image within \(drawTimeout) seconds")
            }
            guard let data = image.pngData() else {
                return (nil, "draw \(number) couldn't be made a PNG")
            }
            digests.append(
                SHA256.hash(data: data).prefix(4).map { String(format: "%02x", $0) }.joined())
            let same = data == last
            last = data
            guard same || number == maximumDraws else { continue }
            if number > 2 || !same {
                let what = same ? "settled after" : "didn't settle in"
                print(
                    "warning: ScreenSnapshot \(name): \(what) \(number) draws, SHA-256 "
                        + digests.joined(separator: " "))
            }
            let problem =
                same ? nil : "no two draws in a row were the same in \(maximumDraws) draws"
            return (Drawn(image: image, host: host), problem)
        }
        return (nil, "no draw was made")
    }

    /// One draw, as `assertSnapshot(of:as: .image(on:drawHierarchyInKeyWindow:…))` makes it:
    /// nil if it gave no image in `drawTimeout`. It only draws; the comparison is
    /// `assertSnapshot`'s, after `settled`.
    private static func draw(
        _ host: UIViewController, variant: Variant, width: CGFloat
    ) -> UIImage? {
        let strategy = Snapshotting<UIViewController, UIImage>.image(
            on: variant.config(width: width), drawHierarchyInKeyWindow: true,
            traits: variant.traits)
        var image: UIImage?
        let drawn = XCTestExpectation(description: "drawn")
        strategy.snapshot(host).run {
            image = $0
            drawn.fulfill()
        }
        guard XCTWaiter.wait(for: [drawn], timeout: drawTimeout) == .completed else { return nil }
        return image
    }
}

/// A hosting controller in which the system's activity indicator, the busy button's spinner,
/// never turns, so every snapshot draws it the same (`Spinners`).
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
/// this test process `startAnimating` only keeps the indicator shown, never starting its frames.
/// One that never turned drew the same image after every wait, light and dark, in a layer render
/// and in a window's draw alike (`docs/LIMITATIONS.md`). Sentry's SnapshotPreviews swaps
/// `startAnimating` too (its v0.19.0), there to hide the indicator; here it stays shown, as the
/// busy button shows it.
@MainActor
enum Spinners {
    /// Swaps `UIActivityIndicatorView.startAnimating` for `tadayoKeepStill`, once.
    static func neverTurn() { _ = swapped }

    /// Fails if the swap didn't happen, if an indicator in `view` turned, or, in a busy state,
    /// if `view` holds no indicator at all, so the check can't pass by finding none (if SwiftUI
    /// stopped drawing `ProgressView` with a `UIActivityIndicatorView`, say).
    static func check(
        _ view: UIView, busy: Bool, _ name: String, file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertTrue(swapped, "\(name): startAnimating wasn't swapped", file: file, line: line)
        XCTAssertEqual(moving(in: view), [], "\(name): a spinner moved", file: file, line: line)
        if busy {
            XCTAssertFalse(all(in: view).isEmpty, "\(name): no spinner", file: file, line: line)
        }
    }

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
