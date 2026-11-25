import SwiftUI
import TadayoCore
import UIKit
import XCTest

@testable import Tadayo

/// Where the keyboard's focus goes as one of the root's screens arrives, read in a key window of
/// the host's scene, as the app's own window is: through `RoutedView` over the UI tests' stand-in
/// services (`UITestLaunch.fakeGraph`), so the screens come and go as they do in the app, or a
/// screen alone in a fresh window. A hosted test, not a snapshot test, so iOS 26.5 reads it too.
@MainActor
final class ArrivalFocusTests: XCTestCase {
    /// Probe (never merged): each step's time and the runner's one-minute load average.
    private func probe(_ step: String) {
        var load = [Double](repeating: 0, count: 3)
        _ = getloadavg(&load, 3)
        let stamp = ISO8601DateFormatter().string(from: Date())
        print("probe: \(stamp) load \(Int(load[0])) \(name) \(step)")
    }

    /// A03 takes the focus as it replaces A02-age (IMPLEMENTATION.md: "A03-profile-empty is
    /// focused on arrival"; `authForm.profileArrivalFocus`). The root shows it in a navigation
    /// stack of its own in place of A02-age's, in a window already on screen, which is where the
    /// UI tests found no field focused while A03 asked for the focus as it appeared (`ios` run
    /// 43331873714) and from a task (43334901167, where this test failed too, as did the same
    /// request made from a task in a probe, which then found a request made 300 milliseconds
    /// later taken: `ProfileForm.takeFocusOnArrival`). The field then keeps it, its editing never
    /// ended, for 2.5 seconds, past the 2 seconds the asking can last, so the asking stops once
    /// the field has it and never takes it back. What is then typed goes into the name.
    func testA03TakesTheFocusAsItReplacesA02Age() throws {
        try arrive(paced: false)
    }

    /// Probe 3 (never merged): the same, with the sign-in driven at a person's pace: each next
    /// step only once the keyboard has come up for the screen's field, or gone for A02-age, and
    /// no keyboard notification has come for a second.
    func testA03TakesTheFocusAsItReplacesA02AgeAtAPersonsPace() throws {
        try arrive(paced: true)
    }

    private func arrive(paced: Bool) throws {
        let variant = paced ? "B" : "A"
        let began = Date()
        probe("start \(variant)")
        defer {
            probe("end \(variant) \(String(format: "%.1f", Date().timeIntervalSince(began)))s")
        }
        let watch = KeyboardWatch()
        let root = UITestLaunch.fakeGraph().root
        let shown = Shown(RoutedView(root: root))
        defer { shown.close() }
        drive({ await root.start() }, until: { root.route == .signIn })
        if paced { settle(watch, shown, up: true, after: nil, "email") }
        let signIn = try XCTUnwrap(root.signIn)
        signIn.email = "ben@example.com"
        let email = shown.focusedField
        drive({ await signIn.sendCode() }, until: { signIn.step == .code })
        if paced { settle(watch, shown, up: true, after: email, "code") }
        signIn.code = UITestLaunch.rightCode
        drive({ await signIn.verify() }, until: { root.route == .confirmAge })
        if paced { settle(watch, shown, up: false, after: nil, "age") }
        XCTAssertTrue(
            spin(for: 2) { shown.focusedField == nil }, "A02-age has no field to hold the focus")
        let profile = try XCTUnwrap(root.profile)
        drive({ await profile.confirmAge() }, until: { root.route == .profile })
        XCTAssertTrue(spin(for: 3) { shown.focusedField != nil }, "no field took the focus on A03")
        probe("focused \(variant)")
        let field = try XCTUnwrap(shown.focusedField)
        let ended = XCTNSNotificationExpectation(
            name: UITextField.textDidEndEditingNotification, object: field)
        ended.isInverted = true
        wait(for: [ended], timeout: 2.5)
        probe("held \(variant) \(field.isFirstResponder)")
        XCTAssertTrue(field.isFirstResponder, "the name's field lost the focus")
        field.insertText("Ben")
        XCTAssertTrue(spin(for: 1) { profile.name == "Ben" }, "the name is \"\(profile.name)\"")
    }

    /// Probe 3: turns the run loop until the keyboard is up (with a field focused other than
    /// `after`) or down (with none), and no keyboard notification has come for a second; 15
    /// seconds at most. Prints how long it took and whether it settled.
    private func settle(
        _ watch: KeyboardWatch, _ shown: Shown, up: Bool, after previous: UITextField?,
        _ step: String
    ) {
        let began = Date()
        let settled = spin(for: 15) {
            let field = shown.focusedField
            let focus = up ? (field != nil && field !== previous) : field == nil
            return focus && watch.up == up && Date().timeIntervalSince(watch.last) >= 1
        }
        probe(
            "settle \(step) \(settled) \(String(format: "%.1f", Date().timeIntervalSince(began)))s"
                + " notes \(watch.count)")
    }

    /// While VoiceOver runs, A03 asks for no focus on arrival, and VoiceOver's own is left to the
    /// system (`authForm.profileArrivalFocus`: "unless VoiceOver focus would be stolen"; the
    /// check's C-01), where the same screen with VoiceOver off takes it, in a fresh window, at
    /// once. VoiceOver can't run in a test: `ProfileScreen.voiceOver` stands in for it, as
    /// `CodeScreen.voiceOver` does. Whether VoiceOver then says the screen is a device check.
    func testA03AsksForNoFocusWhileVoiceOverRuns() {
        probe("start")
        defer { probe("end") }
        for voiceOver in [true, false] {
            let model = ProfileModel(
                account: Account(
                    id: "ben", displayName: nil, avatarVersion: nil, ageConfirmed: true,
                    version: 1),
                accounts: ScriptedAccounts(updates: []), saved: { _ in }, signedOut: {})
            let shown = Shown(ProfileScreen(model: model, leave: {}, voiceOver: voiceOver))
            let took = spin(for: 3) { shown.focusedField != nil }
            shown.close()
            XCTAssertEqual(took, !voiceOver, "VoiceOver \(voiceOver ? "on" : "off")")
        }
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

/// Probe 3 (never merged): the keyboard's own notifications, as they come: whether it was last
/// shown or hidden, when the last of them came, and how many have.
@MainActor
private final class KeyboardWatch {
    private(set) var up = false
    private(set) var last = Date.distantPast
    private(set) var count = 0
    private var tokens: [NSObjectProtocol] = []

    init() {
        let names: [(Notification.Name, Bool?)] = [
            (UIResponder.keyboardWillShowNotification, nil),
            (UIResponder.keyboardDidShowNotification, true),
            (UIResponder.keyboardWillHideNotification, nil),
            (UIResponder.keyboardDidHideNotification, false),
            (UIResponder.keyboardDidChangeFrameNotification, nil),
        ]
        for (name, shown) in names {
            tokens.append(
                NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) {
                    [weak self] _ in
                    MainActor.assumeIsolated {
                        guard let self else { return }
                        self.last = Date()
                        self.count += 1
                        if let shown { self.up = shown }
                    }
                })
        }
    }
}
