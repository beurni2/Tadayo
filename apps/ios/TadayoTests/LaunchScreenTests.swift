import SwiftUI
import TadayoDesign
import UIKit
import XCTest

/// Tadayo's launch screen, which iOS draws from the Info.plist before the app runs, so no
/// snapshot holds it (docs/LIMITATIONS.md): it names the colour set `LaunchBackground`, which is
/// the canvas in light and in dark, as the root draws its starting state (`global-launch`).
final class LaunchScreenTests: XCTestCase {
    func testTheLaunchScreenIsTheCanvasInLightAndDark() throws {
        let info = try XCTUnwrap(Bundle.main.infoDictionary)
        let launch = try XCTUnwrap(info["UILaunchScreen"] as? [String: Any])
        XCTAssertEqual(launch["UIColorName"] as? String, "LaunchBackground")
        let named = try XCTUnwrap(
            UIColor(named: "LaunchBackground", in: .main, compatibleWith: nil))
        let canvas = UIColor(Palette.canvas)
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            XCTAssertEqual(
                bytes(named.resolvedColor(with: traits)), bytes(canvas.resolvedColor(with: traits)),
                "\(style.rawValue)")
        }
        // The two differ, so the comparison can't pass on a colour that ignores the appearance.
        XCTAssertNotEqual(
            bytes(named.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))),
            bytes(named.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark))))
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
