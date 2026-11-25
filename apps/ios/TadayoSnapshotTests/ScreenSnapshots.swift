import CryptoKit
import ObjectiveC
import SnapshotTesting
import SwiftUI
import TadayoDesign
import XCTest

/// A screen as the renders draw it: 393 by 852 points, at 2x like the renders, in sRGB, in light,
/// in dark, and at the largest accessibility text size (docs/TECH-DESIGN.md section 2). The
/// keyboard and the status bar aren't drawn (T45): a field shows its focus itself. It's the app
/// in the foreground, `scenePhase` `.active`, as a person sees it: a hosting controller outside
/// the app's own scene isn't told the app is active (`docs/LIMITATIONS.md`, 2026-11-23), and a
/// state of the app gone to the background says so itself (`G02-link-entry-signed-in-inactive`).
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
/// Each image is drawn until two draws in a row come out the same, byte for byte, and that image is
/// compared with its reference once, at the same precision as ever. Each draw is a fresh host's
/// first, as before, so no screen is given longer to draw; the reference plays no part in when the
/// drawing stops. On iOS 27.2 a draw of the system's glass, a bar's button or the tab bar, now and
/// then comes out a little different, and the next draw as usual; what decides it isn't known, and
/// `docs/LIMITATIONS.md` (2026-11-14) keeps the most it has differed by in a run. So one draw that
/// differs from the image the drawing settles on passes, wherever in the screen it differs, and is
/// logged by name with where and by how much, to be read; a second such draw fails the test, and so
/// does a screen that hasn't drawn the same twice in a row in `maximumDraws` draws. The hosts are
/// fresh, but the view and its models are the same objects in every draw, so a screen that changes
/// them as it appears would log its first draw as the odd one. An element that moves, or a model
/// that changes as it's drawn, has to be made still, as the spinner is (`Spinners`), not left to
/// the drawing.
///
/// The system's glass buttons, the bars' back button and Leave sign-in, draw two ways on iOS 27.2,
/// a few levels apart, now and then even twice in a row. So, as the founder answered on
/// 2026-11-25 (`docs/plans/ios-b1-intermittents.md`, row 2), two images that differ only inside
/// the glass buttons (`glassButtons`), by at most `glassTolerance` in any channel, count as the
/// same: for the drawing, and against the reference, where such an image is compared as its
/// reference. Each time, a `warning: glass` line says so, with where and by how much. Every other
/// pixel is compared as before, and a difference anywhere outside the glass, or larger inside it,
/// counts in full.
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
            let screen = shown(view, in: variant)
            let (drawn, problem) = settled(
                { FramedHost(rootView: screen) }, variant: variant, width: width, name: name)
            if let problem { XCTFail("\(name): \(problem)", file: file, line: line) }
            guard let drawn else { continue }
            let reference = referenceURL(file: "\(file)", testName: testName, name: name)
            assertSnapshot(
                of: glassMatched(
                    drawn, reference: try? Data(contentsOf: reference),
                    scale: variant.traits.displayScale, name: name),
                as: .image(
                    precision: 1, perceptualPrecision: 0.98, scale: variant.traits.displayScale),
                named: name, file: file, testName: testName, line: line)
            Spinners.check(drawn.host.view, busy: busy, name, file: file, line: line)
        }
    }

    /// `view` as `assert` draws it in `variant`: its colour scheme and text size, in English, the
    /// app in the foreground.
    static func shown(_ view: some View, in variant: Variant) -> some View {
        view
            .environment(\.colorScheme, variant == .dark ? .dark : .light)
            .environment(\.dynamicTypeSize, variant == .xl ? .accessibility5 : .large)
            .environment(\.locale, Locale(identifier: "en_US"))
            .environment(\.scenePhase, .active)
    }

    /// The most draws made for one image. With at most one odd draw (above), four is enough for
    /// the worst case, an odd second draw: the first, the odd one, then two the same.
    static let maximumDraws = 4

    /// How long one draw may take, SnapshotTesting's own `assertSnapshot` timeout.
    static let drawTimeout: TimeInterval = 5

    /// The most a draw may differ from another inside the system's glass buttons, in any channel
    /// out of 255, and still count as the same: the founder's answers of 2026-11-25, 21 and then
    /// 26. The logs on `evidence` to that day hold the glass buttons' two drawings 2 to 21 apart,
    /// and at the largest text, Leave sign-in's, 20 and twice 26.
    static let glassTolerance = 26

    /// How far past a glass button's frame its two drawings differ, in pixels at 2x: up to 2 to
    /// each side and above, and 3 below, in the logs (the back button's glass at x 32 to 119, y
    /// 124 to 211, differing in x 30 to 121, y 123 to 212; Leave sign-in's at x 32 to 303, in x
    /// 30 to 305, y 123 to 214, and at the largest text in y 122 to 213), the edge the glass
    /// softens and its shadow.
    static let glassMargin = 4

    /// The name of the filter iOS 27.2 draws a glass button's glass with, on a backdrop layer in
    /// the bar's platter (the probe `ios/b1-glass-probe`, `14bc1fc`): the bars' buttons have it,
    /// and the tab bar, which draws its glass otherwise, doesn't.
    static let glassFilter = "glassBackground"

    /// A rectangle of an image in pixels from its top left, its edges included.
    struct PixelRect: Equatable {
        let left: Int
        let top: Int
        let right: Int
        let bottom: Int

        /// `frame`, in points, in pixels at `scale`, grown by `margin` pixels on each side.
        init(_ frame: CGRect, scale: CGFloat, margin: Int) {
            left = Int((frame.minX * scale).rounded(.down)) - margin
            top = Int((frame.minY * scale).rounded(.down)) - margin
            right = Int((frame.maxX * scale).rounded(.up)) - 1 + margin
            bottom = Int((frame.maxY * scale).rounded(.up)) - 1 + margin
        }

        init(left: Int, top: Int, right: Int, bottom: Int) {
            self.left = left
            self.top = top
            self.right = right
            self.bottom = bottom
        }

        func contains(x: Int, y: Int) -> Bool {
            x >= left && x <= right && y >= top && y <= bottom
        }
    }

    /// An image to compare with its reference, the host that drew it, the image as a PNG, and
    /// where that host drew the system's glass buttons.
    struct Drawn {
        let image: UIImage
        let host: UIViewController
        let png: Data
        let glass: [PixelRect]
    }

    /// Draws a fresh host from `make` again and again, each as SnapshotTesting draws a view
    /// controller in the key window, until two draws in a row are the same, byte for byte as
    /// PNGs, or `maximumDraws` have been made, and gives the last draw. The problem, if any, is
    /// for the test to fail with: no two draws in a row the same; more than one draw that differs
    /// from the image it settled on; or a draw that gave no image or no PNG, which ends the
    /// drawing there. When it takes more than two draws, or doesn't settle, it logs, through
    /// `log`, one `warning:` line naming the image, with the start of each draw's SHA-256 in
    /// order and, for each draw that differs from the last, how (`difference`). `drawing` stands
    /// in for `draw` in `ScreenSnapshotSettleTests`, to make a draw give no image or no PNG.
    ///
    /// Two draws that differ only inside the system's glass buttons, as the later one's host drew
    /// them, by at most `glassTolerance` (`glassDrift`), count as the same, both for two in a row
    /// and for a draw against the image it settled on, so such a draw isn't odd; each is logged
    /// as a `warning: glass` line. `glass` stands in for `glassButtons` in the tests.
    static func settled(
        _ make: () -> UIViewController, variant: Variant, width: CGFloat, name: String,
        log: (String) -> Void = { print($0) }, drawing: ((UIViewController) -> UIImage?)? = nil,
        glass: ((UIViewController) -> [PixelRect])? = nil
    ) -> (drawn: Drawn?, problem: String?) {
        var draws: [Data] = []
        for number in 1...maximumDraws {
            let host = make()
            let drawn: UIImage?
            if let drawing {
                drawn = drawing(host)
            } else {
                drawn = draw(host, variant: variant, width: width)
            }
            guard let image = drawn else {
                return (nil, "draw \(number) gave no image within \(drawTimeout) seconds")
            }
            guard let data = image.pngData() else {
                return (nil, "draw \(number) couldn't be made a PNG")
            }
            let rects =
                glass?(host) ?? glassButtons(in: host.view, scale: variant.traits.displayScale)
            let same =
                data == draws.last
                || draws.last.map { glassDrift($0, data, glass: rects) != nil } ?? false
            draws.append(data)
            guard same || number == maximumDraws else { continue }
            let differing = draws.indices.filter { draws[$0] != data }
            var odd: [Int] = []
            for index in differing {
                if let drift = glassDrift(draws[index], data, glass: rects) {
                    log(
                        "warning: glass \(name): draw \(index + 1) differs from the last "
                            + "only inside the system's glass buttons, \(drift), so it counts "
                            + "as the same")
                } else {
                    odd.append(index)
                }
            }
            if number > 2 || !same {
                log(warning(name, draws: draws, odd: differing, settled: same))
            }
            var problem: String?
            if !same {
                problem = "no two draws in a row were the same in \(maximumDraws) draws"
            } else if odd.count > 1 {
                problem = "\(odd.count) draws differed from the image it settled on, where one may"
            }
            return (Drawn(image: image, host: host, png: data, glass: rects), problem)
        }
        return (nil, "no draw was made")
    }

    /// The line `settled` logs: "warning: ScreenSnapshot <image>: settled after 3 draws, SHA-256
    /// <each draw's first 4 bytes>; against the last draw, draw 1: <its difference>".
    private static func warning(
        _ name: String, draws: [Data], odd: [Int], settled: Bool
    ) -> String {
        let digests = draws.map { data in
            SHA256.hash(data: data).prefix(4).map { String(format: "%02x", $0) }.joined()
        }
        let what = settled ? "settled after" : "didn't settle in"
        let last = draws[draws.count - 1]
        let differences = odd.map { "draw \($0 + 1): " + difference(draws[$0], last) }
        return "warning: ScreenSnapshot \(name): \(what) \(draws.count) draws, SHA-256 "
            + digests.joined(separator: " ") + "; against the last draw, "
            + differences.joined(separator: "; ")
    }

    /// How two PNGs differ, decoded in sRGB: how many pixels differ, the rectangle that holds
    /// them, in pixels of the image from its top left, and the largest difference in any channel,
    /// out of 255. Enough to tell the glass, a bar's button or the tab bar, from the app's own
    /// content.
    static func difference(_ first: Data, _ second: Data) -> String {
        switch measure(first, second, glass: []) {
        case .failure(let why): why.description
        case .success(let measured): measured.text
        }
    }

    /// How two PNGs differ, if they differ only inside `glass` and by at most `glassTolerance` in
    /// any channel, said as `difference` says it: what the founder's allowance passes. Nil if a
    /// pixel outside `glass` differs, or one inside it by more, or the two can't be compared; two
    /// PNGs whose pixels are the same give "no pixel differs".
    static func glassDrift(_ first: Data, _ second: Data, glass: [PixelRect]) -> String? {
        guard !glass.isEmpty, case .success(let measured) = measure(first, second, glass: glass),
            measured.outside == 0, measured.largest <= glassTolerance
        else { return nil }
        return measured.text
    }

    /// What `measure` finds: how many pixels differ, the rectangle that holds them, the largest
    /// difference in any channel, and how many of those pixels lie outside the glass it's given.
    private struct Measured {
        var pixels = 0
        var largest = 0
        var left = Int.max
        var top = Int.max
        var right = -1
        var bottom = -1
        var outside = 0

        var text: String {
            guard pixels > 0 else { return "no pixel differs" }
            return "\(pixels) pixels in x \(left) to \(right), y \(top) to \(bottom), "
                + "by at most \(largest)/255"
        }
    }

    /// Compares two PNGs pixel by pixel, decoded in sRGB, or says why it can't.
    private static func measure(
        _ first: Data, _ second: Data, glass: [PixelRect]
    ) -> Result<Measured, MeasureFailure> {
        guard let a = raster(first), let b = raster(second) else {
            return .failure(MeasureFailure("not readable"))
        }
        guard a.width == b.width, a.height == b.height else {
            return .failure(
                MeasureFailure(
                    "sizes differ, \(a.width) by \(a.height) and \(b.width) by \(b.height)"))
        }
        var measured = Measured()
        a.bytes.withUnsafeBufferPointer { a8 in
            b.bytes.withUnsafeBufferPointer { b8 in
                for y in 0..<a.height {
                    for x in 0..<a.width {
                        let start = (y * a.width + x) * 4
                        var gap = 0
                        for channel in start..<start + 4 {
                            gap = max(gap, abs(Int(a8[channel]) - Int(b8[channel])))
                        }
                        guard gap > 0 else { continue }
                        measured.pixels += 1
                        measured.largest = max(measured.largest, gap)
                        measured.left = min(measured.left, x)
                        measured.right = max(measured.right, x)
                        measured.top = min(measured.top, y)
                        measured.bottom = max(measured.bottom, y)
                        if !glass.contains(where: { $0.contains(x: x, y: y) }) {
                            measured.outside += 1
                        }
                    }
                }
            }
        }
        return .success(measured)
    }

    /// Why two PNGs couldn't be compared, as `difference` says it.
    private struct MeasureFailure: Error, CustomStringConvertible {
        let description: String
        init(_ description: String) { self.description = description }
    }

    /// Where `view` draws the system's glass buttons, in pixels of its image at `scale`: the frame
    /// of each layer drawn with `glassFilter`, grown by `glassMargin`. A hidden layer, and what it
    /// holds, draws nothing, so it's left out.
    static func glassButtons(in view: UIView, scale: CGFloat) -> [PixelRect] {
        var found: [PixelRect] = []
        func walk(_ layer: CALayer) {
            guard !layer.isHidden, layer.opacity > 0 else { return }
            if (layer.filters ?? []).contains(where: { String(describing: $0) == glassFilter }) {
                let frame = layer.convert(layer.bounds, to: view.layer)
                if !frame.isEmpty {
                    found.append(PixelRect(frame, scale: scale, margin: glassMargin))
                }
            }
            for sublayer in layer.sublayers ?? [] { walk(sublayer) }
        }
        walk(view.layer)
        return found
    }

    /// The image to compare with the reference: the reference's own, when the drawn image differs
    /// from it only inside the glass buttons its host drew, by at most `glassTolerance`, which is
    /// logged as a `warning: glass` line; otherwise the drawn image, compared as ever. With no
    /// reference, or one that can't be read, it's the drawn image, for `assertSnapshot` to say so.
    static func glassMatched(
        _ drawn: Drawn, reference: Data?, scale: CGFloat, name: String,
        log: (String) -> Void = { print($0) }
    ) -> UIImage {
        guard let reference, reference != drawn.png,
            let drift = glassDrift(reference, drawn.png, glass: drawn.glass),
            let image = UIImage(data: reference, scale: scale)
        else { return drawn.image }
        log(
            "warning: glass \(name): differs from its reference only inside the system's glass "
                + "buttons, \(drift), so it's compared as its reference")
        return image
    }

    /// Where SnapshotTesting 1.19.7 keeps the reference `assertSnapshot(…, named: name, file:
    /// file, testName: testName)` compares with: beside the test's file, in `__Snapshots__/<its
    /// name>/<test>.<name>.png`, each part made a path's part as the library makes it
    /// (`sanitizePathComponent`: every run of non-word characters a hyphen, none at either end).
    static func referenceURL(file: String, testName: String, name: String) -> URL {
        func part(_ string: String) -> String {
            string
                .replacingOccurrences(of: "\\W+", with: "-", options: .regularExpression)
                .replacingOccurrences(of: "^-|-$", with: "", options: .regularExpression)
        }
        let fileURL = URL(fileURLWithPath: file, isDirectory: false)
        return fileURL.deletingLastPathComponent()
            .appendingPathComponent("__Snapshots__")
            .appendingPathComponent(fileURL.deletingPathExtension().lastPathComponent)
            .appendingPathComponent("\(part(testName)).\(part(name)).png")
    }

    /// A PNG's pixels as 8-bit RGBA in sRGB, row by row from the top.
    private static func raster(_ png: Data) -> (bytes: [UInt8], width: Int, height: Int)? {
        guard let image = UIImage(data: png)?.cgImage,
            let space = CGColorSpace(name: CGColorSpace.sRGB)
        else { return nil }
        let width = image.width
        let height = image.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard
                let context = CGContext(
                    data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                    bytesPerRow: width * 4, space: space,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        return drawn ? (bytes: bytes, width: width, height: height) : nil
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
