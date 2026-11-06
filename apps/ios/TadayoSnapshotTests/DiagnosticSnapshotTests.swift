import SwiftUI
import TadayoDesign
import UIKit
import XCTest

/// TEMPORARY, removed before the PR opens: what the busy button's spinner is on iOS 26, and which
/// way of holding it draws the same whatever moment it's held at. It fails on purpose, with what
/// it found in its message (`logs/test-summary.json`) and in `DIAG` lines (`logs/test.log`).
@MainActor
final class DiagnosticSnapshotTests: XCTestCase {
    private enum Hold: String, CaseIterable {
        case none, stop, freeze
    }

    private struct Drawn {
        let drawn: Data
        let rendered: Data
    }

    func testWhatTheSpinnerIs() {
        let scene = UIApplication.shared.connectedScenes.lazy.compactMap { $0 as? UIWindowScene }
            .first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow()
        window.frame = CGRect(x: 0, y: 0, width: 393, height: 120)
        window.isHidden = false
        defer {
            window.isHidden = true
            window.rootViewController = nil
        }
        var lines: [String] = []
        let first = show(in: window, dark: false)
        lines.append("DIAG tree:\n" + Self.describe(first.view, depth: 0))
        for spinner in Spinners.all(in: first.view) {
            lines.append("DIAG layers:\n" + Self.layers(spinner.layer, depth: 0))
            for imageView in Self.imageViews(in: spinner) {
                lines.append("DIAG image view: " + Self.report(imageView))
            }
        }
        for dark in [false, true] {
            var atOnce: [Hold: Data] = [:]
            for hold in Hold.allCases {
                var early: [Data] = []
                var rendered: [Data] = []
                var still: [Bool] = []
                for delay in [0.0, 0.05, 0.3] {
                    let host = show(in: window, dark: dark)
                    turn(for: delay)
                    apply(hold, to: host.view)
                    let now = draw(host.view)
                    turn(for: 0.3)
                    let later = draw(host.view)
                    early.append(now.drawn)
                    rendered.append(now.rendered)
                    still.append(now.drawn == later.drawn && now.rendered == later.rendered)
                    if delay == 0 { atOnce[hold] = now.drawn }
                }
                lines.append(
                    "DIAG \(dark ? "dark" : "light") \(hold.rawValue): still \(still), the same "
                        + "whatever the delay: drawn \(Set(early).count == 1), "
                        + "rendered \(Set(rendered).count == 1)")
            }
            let held = Hold.allCases.filter { $0 != .none }
            let pairs = held.flatMap { a in
                held.filter { $0.rawValue > a.rawValue }.map { b in
                    "\(a.rawValue)=\(b.rawValue) \(atOnce[a] == atOnce[b])"
                }
            }
            lines.append("DIAG \(dark ? "dark" : "light") drawn alike at once: \(pairs)")
        }
        for hold in [Hold.none, .stop] {
            var rendered: [Data] = []
            for delay in [0.0, 0.05, 0.3] {
                rendered.append(renderedAsTheLabIs(after: delay, holding: hold, scene: scene))
            }
            lines.append(
                "DIAG the Lab's way, \(hold.rawValue): rendered the same whatever the delay "
                    + "\(Set(rendered).count == 1)")
        }
        // From here on, as in every snapshot after: `startAnimating` never starts the frames.
        Spinners.neverTurn()
        var drawnBy: [Bool: [Data]] = [:]
        for dark in [false, true] {
            var early: [Data] = []
            var rendered: [Data] = []
            var facts: [String] = []
            for delay in [0.0, 0.05, 0.3] {
                let host = show(in: window, dark: dark)
                turn(for: delay)
                let now = draw(host.view)
                turn(for: 0.3)
                let later = draw(host.view)
                early.append(now.drawn)
                rendered.append(now.rendered)
                facts.append(
                    "still \(now.drawn == later.drawn && now.rendered == later.rendered), "
                        + "drawn as rendered \(now.drawn == now.rendered), "
                        + "moving \(Spinners.moving(in: host.view)), shown "
                        + "\(Spinners.all(in: host.view).map { !$0.isHidden && $0.alpha > 0 })")
            }
            drawnBy[dark] = early
            lines.append(
                "DIAG \(dark ? "dark" : "light") never turning: \(facts); the same whatever the "
                    + "delay: drawn \(Set(early).count == 1), rendered \(Set(rendered).count == 1)")
        }
        let theLabs = [0.0, 0.05, 0.3].map {
            renderedAsTheLabIs(after: $0, holding: .none, scene: scene)
        }
        lines.append(
            "DIAG the Lab's way, never turning: rendered the same whatever the delay "
                + "\(Set(theLabs).count == 1)")
        lines.append("DIAG light and dark drawn apart: \(drawnBy[false] != drawnBy[true])")
        let report = lines.joined(separator: "\n")
        print(report)
        XCTFail("diagnostic:\n" + report)
    }

    private func button(dark: Bool) -> some View {
        Button("Send a code") {}
            .buttonStyle(.tadayoPrimary(isBusy: true))
            .padding(20)
            .background(Palette.canvas)
            .environment(\.colorScheme, dark ? .dark : .light)
    }

    private func show(in window: UIWindow, dark: Bool) -> UIViewController {
        let host = UIHostingController(rootView: button(dark: dark))
        window.rootViewController = host
        host.view.frame = window.bounds
        window.layoutIfNeeded()
        return host
    }

    /// As SnapshotTesting draws a SwiftUI view: sized to fit, no safe area, in a window of its
    /// own that isn't shown, drawn by a layer render.
    private func renderedAsTheLabIs(
        after delay: TimeInterval, holding hold: Hold, scene: UIWindowScene?
    ) -> Data {
        let host = UIHostingController(rootView: button(dark: false))
        host.safeAreaRegions = []
        let size = host.sizeThatFits(in: .zero)
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow()
        window.frame = CGRect(origin: .zero, size: size)
        window.rootViewController = host
        host.view.frame = window.bounds
        host.view.layoutIfNeeded()
        defer { window.rootViewController = nil }
        turn(for: delay)
        apply(hold, to: host.view)
        return draw(host.view).rendered
    }

    private func turn(for seconds: TimeInterval) {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end { RunLoop.main.run(until: Date().addingTimeInterval(0.01)) }
    }

    private func apply(_ hold: Hold, to view: UIView) {
        for spinner in Spinners.all(in: view) {
            switch hold {
            case .none:
                break
            case .stop:
                spinner.hidesWhenStopped = false
                spinner.stopAnimating()
            case .freeze:
                spinner.layer.speed = 0
                spinner.layer.timeOffset = 0
            }
        }
    }

    private func draw(_ view: UIView) -> Drawn {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        let renderer = UIGraphicsImageRenderer(bounds: view.bounds, format: format)
        let drawn = renderer.pngData { _ in
            _ = view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
        }
        let rendered = renderer.pngData { context in view.layer.render(in: context.cgContext) }
        return Drawn(drawn: drawn, rendered: rendered)
    }

    private static func report(_ imageView: UIImageView) -> String {
        var parts = [
            "frames \(imageView.animationImages?.count ?? -1)",
            "duration \(imageView.animationDuration)",
            "animating \(imageView.isAnimating)",
            "image \(imageView.image.map { "\($0.size) \($0.renderingMode.rawValue)" } ?? "none")",
        ]
        for key in imageView.layer.animationKeys() ?? [] {
            guard let animation = imageView.layer.animation(forKey: key) else { continue }
            var part =
                "\(key): \(type(of: animation)) begin \(animation.beginTime) duration "
                + "\(animation.duration) repeat \(animation.repeatCount) "
                + "fill \(animation.fillMode.rawValue)"
            if let frames = animation as? CAKeyframeAnimation {
                part += " values \(frames.values?.count ?? -1)"
                part += " mode \(frames.calculationMode.rawValue)"
            }
            parts.append(part)
        }
        return parts.joined(separator: "; ")
    }

    private static func imageViews(in view: UIView) -> [UIImageView] {
        view.subviews.flatMap { subview in
            ((subview as? UIImageView).map { [$0] } ?? []) + imageViews(in: subview)
        }
    }

    private static func keys(_ layer: CALayer) -> [String] {
        (layer.animationKeys() ?? []) + (layer.sublayers ?? []).flatMap(keys)
    }

    private static func describe(_ view: UIView, depth: Int) -> String {
        let pad = String(repeating: "  ", count: depth)
        var line = "\(pad)\(type(of: view)) layer \(type(of: view.layer)) keys \(keys(view.layer))"
        if let spinner = view as? UIActivityIndicatorView {
            line += " animating \(spinner.isAnimating) style \(spinner.style.rawValue)"
        }
        return ([line] + view.subviews.map { describe($0, depth: depth + 1) })
            .joined(separator: "\n")
    }

    private static func layers(_ layer: CALayer, depth: Int) -> String {
        let pad = String(repeating: "  ", count: depth)
        let line =
            "\(pad)\(type(of: layer)) opacity \(layer.opacity) speed \(layer.speed) "
            + "contents \(layer.contents != nil) keys \(layer.animationKeys() ?? [])"
        return ([line] + (layer.sublayers ?? []).map { layers($0, depth: depth + 1) })
            .joined(separator: "\n")
    }
}
