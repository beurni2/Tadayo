import SnapshotTesting
import SwiftUI
import TadayoCore
import XCTest

@testable import Tadayo

/// TEMPORARY, removed before the PR opens: draws A02-email-sending twice and A02-code once as
/// `ScreenSnapshot` does, to see the bar where it lays out and the spinner alike in both draws.
@MainActor
final class DiagnosticSnapshotTests: XCTestCase {
    private let clock = StillClock()

    func testTheSpinnerAtRest() {
        for draw in 1...2 {
            let sending = signIn(ScriptedAuth(sends: [.hang]))
            sending.email = "ben@example.com"
            ScreenSnapshot.drive({ await sending.sendCode() }, until: { sending.isSending })
            shoot(SignInFlow(model: sending, focus: true), "Diag-sending-\(draw)")
        }
        let code = signIn(ScriptedAuth())
        code.email = "ben@example.com"
        ScreenSnapshot.drive({ await code.sendCode() }, until: { code.step == .code })
        shoot(SignInFlow(model: code, focus: true), "Diag-code")
    }

    private func shoot(_ view: some View, _ name: String) {
        let shown = view.environment(\.colorScheme, .light)
            .environment(\.locale, Locale(identifier: "en_US"))
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
