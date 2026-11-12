import SwiftUI
import UIKit
import XCTest

@testable import Tadayo

/// `ModelText` kept on screen while its model changes: the field shows what the model holds, a
/// change the model makes itself included, such as A02-code's digits cleared when a new code is
/// sent (`SignInModel.resend`; handoff 7: "clears old digits"). The snapshots and the readings draw
/// a new screen for each state, which starts from the model's text whatever `ModelText` passes on,
/// so only a field that stays on screen shows the change reaching it.
@MainActor
final class ModelTextTests: XCTestCase {
    func testAChangeTheModelMakesReachesTheFieldOnScreen() {
        let held = HeldText()
        let window = show(
            ModelText(held: { held.text }, offer: { held.text = $0 }) { text in
                TextField(String(), text: text)
            })
        defer {
            window.isHidden = true
            window.rootViewController = nil
        }
        let field = textField(in: window)
        XCTAssertEqual(field?.text, "529614")

        held.text = ""
        turn(for: 0.3)
        XCTAssertEqual(field?.text, "")
    }

    /// Shows `view` in a window of the host's scene, as `AccessibilityElements` does, and turns the
    /// run loop until it is laid out.
    private func show(_ view: some View) -> UIWindow {
        let scene = UIApplication.shared.connectedScenes.lazy.compactMap { $0 as? UIWindowScene }
            .first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow()
        window.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        window.rootViewController = UIHostingController(rootView: view)
        window.isHidden = false
        turn(for: 0.5)
        window.layoutIfNeeded()
        return window
    }

    private func turn(for seconds: TimeInterval) {
        let settled = Date().addingTimeInterval(seconds)
        while Date() < settled { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
    }

    /// The first `UITextField` below `view`: what a SwiftUI `TextField` is drawn with.
    private func textField(in view: UIView) -> UITextField? {
        for subview in view.subviews {
            if let field = subview as? UITextField { return field }
            if let field = textField(in: subview) { return field }
        }
        return nil
    }
}

/// The model under the field: a text the test changes as `SignInModel` changes its code. At file
/// scope, since `@Observable` extends the class outside its declaration, where a type private to
/// the test class can't be seen (`ios` run 43114302747: "'Held' is inaccessible due to 'private'
/// protection level").
@Observable
private final class HeldText {
    var text = "529614"
}
