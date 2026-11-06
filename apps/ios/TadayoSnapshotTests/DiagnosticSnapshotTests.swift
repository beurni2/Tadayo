import SnapshotTesting
import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// TEMPORARY, removed before the PR opens: draws A02-code and A02-email-sending twice in each of
/// four ways of holding the window, to see which draws iOS 26's bar where it lays out and the
/// spinner the same each time.
@MainActor
final class DiagnosticSnapshotTests: XCTestCase {
    private let clock = StillClock()

    func testWaysOfHoldingTheWindow() {
        let modes: [(String, Bool, Bool)] = [
            ("freeze", true, true), ("freeze-noanim", true, false),
            ("plain", false, true), ("noanim", false, false),
        ]
        for (name, freeze, animations) in modes {
            for draw in 1...2 {
                let code = signIn(ScriptedAuth())
                code.email = "ben@example.com"
                ScreenSnapshot.drive({ await code.sendCode() }, until: { code.step == .code })
                shoot(
                    SignInFlow(model: code, focus: true), "Diag-\(name)-code-\(draw)", freeze,
                    animations)
                let sending = signIn(ScriptedAuth(sends: [.hang]))
                sending.email = "ben@example.com"
                ScreenSnapshot.drive({ await sending.sendCode() }, until: { sending.isSending })
                shoot(
                    SignInFlow(model: sending, focus: true), "Diag-\(name)-sending-\(draw)", freeze,
                    animations)
            }
        }
    }

    private func shoot(_ view: some View, _ name: String, _ freeze: Bool, _ animations: Bool) {
        guard let window = ScreenSnapshot.keyWindow else { return XCTFail("no key window") }
        let still = StillWindow(window, freeze: freeze, animations: animations)
        defer { still.restore() }
        let shown = view.environment(\.colorScheme, .light).environment(
            \.locale, Locale(identifier: "en_US"))
        assertSnapshot(
            of: FramedHost(rootView: shown) as UIViewController,
            as: .image(
                on: ScreenSnapshot.Variant.light.config(xlHeight: 2200),
                drawHierarchyInKeyWindow: true, perceptualPrecision: 0.98,
                traits: ScreenSnapshot.Variant.light.traits),
            named: name)
    }

    private func signIn(_ auth: ScriptedAuth) -> SignInModel {
        let clock = clock
        return SignInModel(
            auth: auth, verified: { _ in }, now: { clock.now },
            sleep: { try await clock.sleep(until: $0) })
    }
}
