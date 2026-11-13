import SnapshotTesting
import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// A probe that never merges (`ios/b0-ios26-glassprobe`). On iOS 27.2, `H01-error-no-club` in
/// light came out two ways, byte for byte: X, the reference (`ios` run 43496781835), and Y, the
/// tab bar's glass a little different (the dispatch 43524874041 and the tab probe 43514132404).
/// Every other home tab bar in light is X's. Y came only as the first draw after
/// `testGoToHomeIsAButton`, which reads a screen in a window of its own
/// (`AccessibilityElements`), and after `testGlobalClubNotInBuild`'s three draws.
///
/// This draws that image again and again, as `ScreenSnapshot` draws it, after each of the steps
/// that might decide the way, and names each draw X, Y or o (neither). The test fails with the
/// counts, so the run's log carries them.
@MainActor
final class ZGlassProbeTests: XCTestCase {
    private typealias Variant = ScreenSnapshot.Variant

    private var x: [UInt8] = []
    private var y: [UInt8] = []
    private var others: [String] = []
    private var attached = 0

    func testGlassProbe() throws {
        let snapshots = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("__Snapshots__")
        x = try XCTUnwrap(
            raster(
                UIImage(
                    contentsOfFile: snapshots.appendingPathComponent(
                        "TabsSnapshotTests/testH01ErrorNoClub.H01-error-no-club.png"
                    ).path)?.cgImage), "X")
        y = try XCTUnwrap(
            raster(
                UIImage(
                    contentsOfFile: snapshots.appendingPathComponent(
                        "ZGlassProbeTests/H01-error-no-club-Y.png"
                    ).path)?.cgImage), "Y")
        XCTAssertNotEqual(x, y, "X and Y should differ")

        var seen: [String: String] = [:]
        func note(_ condition: String, _ way: String) { seen[condition, default: ""] += way }
        let order = [
            "seq", "seq again", "no window", "wait 0.5 s", "window, wait 0.3 s",
            "window alone", "in window t0", "in window t0.05", "in window t0.2",
            "in window t0.5", "in window t1",
        ]

        for round in 1...12 {
            // As the suite runs it: global-club-not-in-build's three, the window, H01 light.
            drawGlobal()
            readInWindow()
            note("seq", way(draw(.light), "seq", round))
            note("seq again", way(draw(.light), "seq again", round))

            // The same without the window.
            drawGlobal()
            note("no window", way(draw(.light), "no window", round))

            // The window's half second, without the window.
            drawGlobal()
            spin(0.5)
            note("wait 0.5 s", way(draw(.light), "wait 0.5 s", round))

            // The window, then a pause before the draw.
            drawGlobal()
            readInWindow()
            spin(0.3)
            note("window, wait 0.3 s", way(draw(.light), "window, wait 0.3 s", round))

            // The window after an H01 draw rather than global-club-not-in-build's.
            readInWindow()
            note("window alone", way(draw(.light), "window alone", round))

            // As the suite runs it, but drawn by hand at times after the screen is in the window.
            drawGlobal()
            readInWindow()
            let times: [(TimeInterval, String)] = [
                (0, "in window t0"), (0.05, "in window t0.05"), (0.2, "in window t0.2"),
                (0.5, "in window t0.5"), (1, "in window t1"),
            ]
            let images = timeline(at: times.map(\.0))
            for ((_, name), image) in zip(times, images) { note(name, way(image, name, round)) }
        }

        let counts = order.map { condition -> String in
            let ways = seen[condition] ?? ""
            let n = { (c: Character) in ways.filter { $0 == c }.count }
            return "\(condition): \(ways) (X \(n("X")), Y \(n("Y")), o \(n("o")))"
        }
        let report =
            "glass probe, H01-error-no-club light on iOS "
            + "\(UIDevice.current.systemVersion), 12 rounds:\n" + counts.joined(separator: "\n")
            + (others.isEmpty ? "" : "\nneither X nor Y:\n" + others.joined(separator: "\n"))
        print(report)
        XCTFail(report)
    }

    // MARK: Drawing

    private func host(
        _ clubs: RootModel.Clubs, on tab: TabsView.Selection, _ variant: Variant
    ) -> UIViewController {
        FramedHost(
            rootView: TabsView(
                clubs: clubs, name: "Ben", selection: tab, showsLab: false, retry: {},
                logOut: {}
            )
            .environment(\.colorScheme, variant == .dark ? .dark : .light)
            .environment(\.dynamicTypeSize, variant == .xl ? .accessibility5 : .large)
            .environment(\.locale, Locale(identifier: "en_US")))
    }

    /// One draw, as `ScreenSnapshot.assert` makes it.
    private func draw(
        _ variant: Variant, _ clubs: RootModel.Clubs = .failed(.network),
        on tab: TabsView.Selection = .home
    ) -> UIImage? {
        let strategy = Snapshotting<UIViewController, UIImage>.image(
            on: variant.config(width: 393), drawHierarchyInKeyWindow: true,
            perceptualPrecision: 0.98, traits: variant.traits)
        var image: UIImage?
        let drawn = expectation(description: "drawn")
        strategy.snapshot(host(clubs, on: tab, variant)).run {
            image = $0
            drawn.fulfill()
        }
        wait(for: [drawn], timeout: 20)
        return image
    }

    private func drawGlobal() {
        for variant in Variant.allCases { _ = draw(variant, .notInThisBuild, on: .home) }
    }

    /// `testGoToHomeIsAButton`'s read, in a window of its own.
    private func readInWindow() {
        _ = AccessibilityElements.of(
            TabContent(tab: .memories, clubs: .noClub, name: "Ben", retry: {}, goHome: {}))
    }

    private func spin(_ seconds: TimeInterval) {
        let until = Date().addingTimeInterval(seconds)
        while Date() < until { RunLoop.main.run(until: Date().addingTimeInterval(0.01)) }
    }

    /// H01 light put in the key window as SnapshotTesting puts it, then drawn as it draws, at
    /// each of `times` after it's in, the screen staying in the window between draws.
    private func timeline(at times: [TimeInterval]) -> [UIImage] {
        guard
            let window = UIApplication.shared.connectedScenes.lazy
                .compactMap({ $0 as? UIWindowScene }).flatMap(\.windows)
                .first(where: \.isKeyWindow)
        else { return [] }
        let variant = Variant.light
        let config = variant.config(width: 393)
        let size = config.size ?? CGSize(width: 393, height: 852)
        let controller = host(.failed(.network), on: .home, variant)
        let traits = UITraitCollection(traitsFrom: [config.traits, variant.traits])
        controller.view.frame.size = size
        window.frame.size = size
        let root = UIViewController()
        root.view.backgroundColor = .clear
        root.view.frame = window.frame
        root.view.translatesAutoresizingMaskIntoConstraints =
            controller.view.translatesAutoresizingMaskIntoConstraints
        root.preferredContentSize = root.view.frame.size
        controller.view.frame = root.view.frame
        root.view.addSubview(controller.view)
        controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        root.addChild(controller)
        root.setOverrideTraitCollection(traits, forChild: controller)
        controller.didMove(toParent: root)
        window.rootViewController = root
        root.beginAppearanceTransition(true, animated: false)
        root.endAppearanceTransition()
        root.view.setNeedsLayout()
        root.view.layoutIfNeeded()
        controller.view.setNeedsLayout()
        controller.view.layoutIfNeeded()

        let start = Date()
        var images: [UIImage] = []
        for time in times {
            let until = start.addingTimeInterval(time)
            while Date() < until { RunLoop.main.run(until: Date().addingTimeInterval(0.005)) }
            let view: UIView = controller.view
            images.append(
                UIGraphicsImageRenderer(bounds: view.bounds, format: .init(for: variant.traits))
                    .image { _ in view.drawHierarchy(in: view.bounds, afterScreenUpdates: true) })
        }

        root.beginAppearanceTransition(false, animated: false)
        controller.willMove(toParent: nil)
        controller.view.removeFromSuperview()
        controller.removeFromParent()
        controller.didMove(toParent: nil)
        root.endAppearanceTransition()
        window.rootViewController = nil
        return images
    }

    // MARK: Naming a draw

    /// X, Y or o, from the image as SnapshotTesting would write it (its PNG, decoded).
    private func way(_ image: UIImage?, _ condition: String, _ round: Int) -> String {
        guard let image, let data = image.pngData(),
            let pixels = raster(UIImage(data: data)?.cgImage)
        else {
            others.append("\(condition), round \(round): no image")
            return "o"
        }
        if pixels == x { return "X" }
        if pixels == y { return "Y" }
        others.append(
            "\(condition), round \(round): against X \(difference(pixels, x)), "
                + "against Y \(difference(pixels, y))")
        if attached < 6 {
            attached += 1
            let attachment = XCTAttachment(image: image)
            attachment.name = "glass-probe-\(condition)-round-\(round)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
        return "o"
    }

    private func difference(_ a: [UInt8], _ b: [UInt8]) -> String {
        guard a.count == b.count else { return "sizes differ (\(a.count), \(b.count))" }
        var pixels = 0
        var largest = 0
        for start in stride(from: 0, to: a.count, by: 4) {
            var differs = false
            for channel in 0..<4 {
                let gap = abs(Int(a[start + channel]) - Int(b[start + channel]))
                if gap > 0 { differs = true }
                largest = max(largest, gap)
            }
            if differs { pixels += 1 }
        }
        return "\(pixels) pixels, up to \(largest)"
    }

    private func raster(_ image: CGImage?) -> [UInt8]? {
        guard let image, let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        let width = image.width
        let height = image.height
        var data = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = data.withUnsafeMutableBytes { buffer -> Bool in
            guard
                let context = CGContext(
                    data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                    bytesPerRow: width * 4, space: space,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        return drawn ? data : nil
    }
}
