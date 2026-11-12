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
            let shown =
                view
                .environment(\.colorScheme, variant == .dark ? .dark : .light)
                .environment(\.dynamicTypeSize, variant == .xl ? .accessibility5 : .large)
                .environment(\.locale, Locale(identifier: "en_US"))
            let host = FramedHost(rootView: shown)
            assertSnapshot(
                of: host as UIViewController,
                as: .image(
                    on: variant.config(width: width),
                    drawHierarchyInKeyWindow: true,
                    perceptualPrecision: 0.98,
                    traits: variant.traits),
                named: state + variant.suffix, file: file, testName: testName, line: line)
            Spinners.check(
                host.view, busy: busy, "\(state)\(variant.suffix)", file: file, line: line)
        }
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
