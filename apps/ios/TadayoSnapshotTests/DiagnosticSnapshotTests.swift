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
        case none, stop, restart, settle, freeze, holdStill
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
        let first = show(in: window)
        lines.append("DIAG tree:\n" + Self.describe(first.view, depth: 0))
        for spinner in Spinners.all(in: first.view) {
            lines.append("DIAG layers:\n" + Self.layers(spinner.layer, depth: 0))
        }
        for hold in Hold.allCases {
            var early: [Data] = []
            var rendered: [Data] = []
            for delay in [0.0, 0.05, 0.3] {
                let host = show(in: window)
                turn(for: delay)
                apply(hold, to: host.view)
                let now = draw(host.view)
                turn(for: 0.3)
                let later = draw(host.view)
                early.append(now.drawn)
                rendered.append(now.rendered)
                let state = Spinners.all(in: host.view).map {
                    "animating \($0.isAnimating) keys \(Self.keys($0.layer))"
                }
                lines.append(
                    "DIAG \(hold.rawValue) delay \(delay): drawn still \(now.drawn == later.drawn), "
                        + "rendered still \(now.rendered == later.rendered), spinners \(state)")
            }
            lines.append(
                "DIAG \(hold.rawValue): the same whatever the delay: drawn \(Set(early).count == 1), "
                    + "rendered \(Set(rendered).count == 1)")
        }
        let report = lines.joined(separator: "\n")
        print(report)
        XCTFail("diagnostic:\n" + report)
    }

    private func show(in window: UIWindow) -> UIViewController {
        let host = UIHostingController(
            rootView: Button("Send a code") {}
                .buttonStyle(.tadayoPrimary(isBusy: true))
                .padding(20)
                .background(Palette.canvas)
                .environment(\.colorScheme, .light))
        window.rootViewController = host
        host.view.frame = window.bounds
        window.layoutIfNeeded()
        return host
    }

    private func turn(for seconds: TimeInterval) {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end { RunLoop.main.run(until: Date().addingTimeInterval(0.01)) }
    }

    private func apply(_ hold: Hold, to view: UIView) {
        if hold == .holdStill { return Spinners.holdStill(in: view) }
        for spinner in Spinners.all(in: view) {
            switch hold {
            case .none, .holdStill:
                break
            case .stop:
                spinner.hidesWhenStopped = false
                spinner.stopAnimating()
            case .restart:
                spinner.hidesWhenStopped = false
                spinner.stopAnimating()
                spinner.startAnimating()
                spinner.stopAnimating()
            case .settle:
                CATransaction.begin()
                CATransaction.setDisableActions(true)
                spinner.hidesWhenStopped = false
                spinner.stopAnimating()
                Self.settle(spinner.layer)
                CATransaction.commit()
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

    private static func settle(_ layer: CALayer) {
        layer.removeAllAnimations()
        layer.sublayers?.forEach(settle)
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
