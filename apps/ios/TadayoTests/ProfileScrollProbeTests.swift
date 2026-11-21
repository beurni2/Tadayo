import SwiftUI
import TadayoCore
import TadayoDesign
import XCTest

@testable import Tadayo

/// The probe of `docs/plans/ios-b0-profile-scroll-turn.md` section 4, on
/// `ios/b0-profile-scroll-probe` (never merged): A03 read at the largest text with the 300-point
/// stand-in keyboard, as `SignInReadingTests.testContinueSits12AboveTheKeyboardOr44AboveTheSafeArea`
/// reads it, 200 times with the scroll made once (as before the fix) and 200 times made again a
/// turn later (the fix), in alternation, printing a PROBE line for every stale reading and a
/// count for each way. It asserts nothing, so the run's other tests read as they would.
@MainActor
final class ProfileScrollProbeTests: XCTestCase {
    func testProbeTheScrollBothWays() {
        defer { ProfileForm.probeScrollsAgain = true }
        let rounds = 200
        var stale = [false: 0, true: 0]
        var read = [false: 0, true: 0]
        for round in 0..<(rounds * 2) {
            let again = round.isMultiple(of: 2)
            ProfileForm.probeScrollsAgain = again
            let model = ProfileModel(
                account: Account(
                    id: "ben", displayName: nil, avatarVersion: nil, ageConfirmed: true,
                    version: 1),
                accounts: ScriptedAccounts(updates: []), saved: { _ in }, signedOut: {})
            model.name = "Ben"
            let layout = AccessibilityElements.layout(
                of: NavigationStack {
                    ProfileForm(model: model, leave: {}, focus: false, keyboard: true)
                        .safeAreaInset(edge: .bottom, spacing: 0) {
                            Color.clear.frame(height: 300)
                        }
                }
                .environment(\.dynamicTypeSize, .accessibility5))
            let next = layout.elements.first { $0.label == "Continue" }?.frame ?? .zero
            let field = layout.elements.first { $0.label == "Your name" }?.frame ?? .zero
            let gap = next.minY - field.maxY
            read[again, default: 0] += 1
            if abs(gap - Spacing.l) > 1 {
                stale[again, default: 0] += 1
                print("PROBE stale: round \(round), again \(again), gap \(gap), field \(field)")
            }
        }
        for again in [false, true] {
            print(
                "PROBE count: again \(again): \(stale[again] ?? 0) stale of \(read[again] ?? 0)")
        }
    }
}
