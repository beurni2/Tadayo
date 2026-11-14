import SwiftUI
import TadayoDesign
import UIKit
import XCTest

/// Tadayo's launch screen, which iOS draws from the Info.plist before the app runs, so no
/// snapshot holds it (docs/LIMITATIONS.md): it names the colour set `LaunchBackground`, which is
/// the canvas in light and in dark: the canvas the root draws on while the keychain is read, and
/// the one its waits (`global-launch`, `global-leaving`) are drawn on after it. Handoff 7 keeps
/// the launch screen canvas alone: no logo, wordmark, spinner or text.
///
/// The canvas is resolved as SwiftUI draws it, through `Color.resolve(in:)` with the appearance's
/// colour scheme, never bridged through `UIColor(_:)`, which on iOS 17, no longer supported,
/// resolved it light in dark (`docs/LIMITATIONS.md`, 2026-11-07).
final class LaunchScreenTests: XCTestCase {
    func testTheLaunchScreenIsTheCanvasInLightAndDark() throws {
        let info = try XCTUnwrap(Bundle.main.infoDictionary)
        let launch = try XCTUnwrap(info["UILaunchScreen"] as? [String: Any])
        XCTAssertEqual(launch["UIColorName"] as? String, "LaunchBackground")
        let named = try XCTUnwrap(
            UIColor(named: "LaunchBackground", in: .main, compatibleWith: nil))
        for (style, scheme) in [(UIUserInterfaceStyle.light, ColorScheme.light), (.dark, .dark)] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            var environment = EnvironmentValues()
            environment.colorScheme = scheme
            XCTAssertEqual(
                bytes(named.resolvedColor(with: traits)),
                bytes(Palette.canvas.resolve(in: environment)), "\(style.rawValue)")
        }
        // The two differ, so the comparison can't pass on a colour that ignores the appearance.
        XCTAssertNotEqual(
            bytes(named.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))),
            bytes(named.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark))))
    }

    /// Red, green, blue and opacity in sRGB, each as a byte.
    private func bytes(_ colour: Color.Resolved) -> [Int] {
        [colour.red, colour.green, colour.blue, colour.opacity].map { Int(($0 * 255).rounded()) }
    }

    /// Red, green, blue and alpha in sRGB, each as a byte.
    private func bytes(_ colour: UIColor) -> [Int] {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        colour.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return [red, green, blue, alpha].map { Int(($0 * 255).rounded()) }
    }
}
