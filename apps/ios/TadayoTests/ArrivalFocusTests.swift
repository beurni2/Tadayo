import SwiftUI
import TadayoCore
import UIKit
import XCTest

@testable import Tadayo

/// Where the keyboard's focus goes as one of the root's screens arrives, read in a key window of
/// the host's scene, as the app's own window is, through `RoutedView` over the UI tests' stand-in
/// services (`UITestLaunch.fakeGraph`), so the screens come and go as they do in the app. Hosted,
/// so the iOS 17.5 and 18.6 runs read it too.
@MainActor
final class ArrivalFocusTests: XCTestCase {
    /// A03 takes the focus as it replaces A02-age (IMPLEMENTATION.md: "A03-profile-empty is
    /// focused on arrival"; `authForm.profileArrivalFocus`). The root shows it in a navigation
    /// stack of its own in place of A02-age's, in a window already on screen, which is where the
    /// UI tests found no field focused while A03 asked for the focus as it appeared (`ios` run
    /// 43331873714) and from a task (43334901167, where this test failed too, as did the same
    /// request made from a task in a probe, which then found a request made 300 milliseconds
    /// later taken: `ProfileForm.takeFocusOnArrival`). What is then typed goes into the name.
    func testA03TakesTheFocusAsItReplacesA02Age() throws {
        let root = UITestLaunch.fakeGraph().root
        let shown = Shown(RoutedView(root: root))
        defer { shown.close() }
        try signInToTheAge(root)
        XCTAssertTrue(
            spin(for: 2) { shown.focusedField == nil }, "A02-age has no field to hold the focus")
        let profile = try XCTUnwrap(root.profile)
        drive({ await profile.confirmAge() }, until: { root.route == .profile })
        XCTAssertTrue(spin(for: 3) { shown.focusedField != nil }, "no field took the focus on A03")
        shown.focusedField?.insertText("Ben")
        XCTAssertTrue(spin(for: 1) { profile.name == "Ben" }, "the name is \"\(profile.name)\"")
    }

    private func signInToTheAge(_ root: RootModel) throws {
        drive({ await root.start() }, until: { root.route == .signIn })
        let signIn = try XCTUnwrap(root.signIn)
        signIn.email = "ben@example.com"
        drive({ await signIn.sendCode() }, until: { signIn.step == .code })
        signIn.code = UITestLaunch.rightCode
        drive({ await signIn.verify() }, until: { root.route == .confirmAge })
    }

    /// Turns the main run loop until `done`, for `seconds` at most, and says whether it held.
    private func spin(for seconds: TimeInterval, until done: () -> Bool = { false }) -> Bool {
        let deadline = Date().addingTimeInterval(seconds)
        while !done(), Date() < deadline {
            RunLoop.main.run(until: Date().addingTimeInterval(0.02))
        }
        return done()
    }
}

/// A key window of the host's scene showing a view, 393 by 852 points; on `close`, the window
/// that was key before is key again.
@MainActor
private final class Shown {
    let window: UIWindow
    private let previous: UIWindow?

    init(_ view: some View) {
        let scene = UIApplication.shared.connectedScenes.lazy.compactMap { $0 as? UIWindowScene }
            .first
        previous = scene?.keyWindow
        window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow()
        window.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        window.rootViewController = UIHostingController(
            rootView: view.environment(\.locale, Locale(identifier: "en_US")))
        window.makeKeyAndVisible()
    }

    /// The text field that holds the keyboard's focus, if one does.
    var focusedField: UITextField? {
        Self.fields(in: window).first { $0.isFirstResponder }
    }

    /// Ends any editing and waits a second for the keyboard to go, so the hosted tests after
    /// this one lay their screens out with no keyboard, then hides the window.
    func close() {
        window.endEditing(true)
        let gone = Date().addingTimeInterval(1)
        while Date() < gone { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
        window.isHidden = true
        window.rootViewController = nil
        previous?.makeKey()
    }

    private static func fields(in view: UIView) -> [UITextField] {
        let own = view as? UITextField
        return (own.map { [$0] } ?? []) + view.subviews.flatMap { fields(in: $0) }
    }
}
