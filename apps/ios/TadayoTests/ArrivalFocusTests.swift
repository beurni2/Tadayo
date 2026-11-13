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
    /// 43331873714). What is then typed goes into the name.
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

    /// A probe for this commit's `ios` run only, which fails nothing: which ways of asking for
    /// the focus a field takes as its navigation stack replaces another in a key window, and
    /// whether A02-email takes it after Leave sign-in on A03. It prints what it finds to the
    /// host's standard error, which the run's `test.log` holds.
    func testProbeHowTheFocusIsTakenAfterARootSwap() throws {
        for way in ProbeField.Way.allCases {
            for swapped in [false, true] {
                let flag = ProbeFlag(on: !swapped)
                let seen = ProbeSeen()
                let shown = Shown(ProbeSwap(flag: flag, way: way, seen: seen))
                _ = spin(for: 0.5)
                flag.on = true
                let took = spin(for: 2) { shown.focusedField != nil }
                report("way \(way) swapped \(swapped): took \(took), focus state \(seen.values)")
                shown.close()
            }
        }
        let root = UITestLaunch.fakeGraph().root
        let shown = Shown(RoutedView(root: root))
        defer { shown.close() }
        try signInToTheAge(root)
        let profile = try XCTUnwrap(root.profile)
        drive({ await profile.confirmAge() }, until: { root.route == .profile })
        let onProfile = spin(for: 3) { shown.focusedField != nil }
        drive({ await root.leave() }, until: { root.route == .signIn })
        let onEmail = spin(for: 3) { shown.focusedField != nil }
        report("A03 took \(onProfile); A02-email after Leave sign-in took \(onEmail)")
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

    private func report(_ line: String) {
        FileHandle.standardError.write(Data("ARRIVAL-FOCUS-PROBE \(line)\n".utf8))
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

@MainActor @Observable
private final class ProbeFlag {
    var on: Bool
    init(on: Bool) { self.on = on }
}

@MainActor
private final class ProbeSeen {
    var values: [Bool] = []
}

/// A navigation stack with a button, as A02-age's, until the flag shows the field's in its place.
private struct ProbeSwap: View {
    let flag: ProbeFlag
    let way: ProbeField.Way
    let seen: ProbeSeen

    var body: some View {
        if flag.on {
            ProbeField(way: way, seen: seen)
        } else {
            NavigationStack { Button(String("Next")) {} }
        }
    }
}

private struct ProbeField: View {
    enum Way: CaseIterable { case onAppear, task, delayed }

    let way: Way
    let seen: ProbeSeen
    @FocusState private var focused: Bool
    @State private var text = ""

    var body: some View {
        NavigationStack {
            TextField(String("Probe"), text: $text)
                .focused($focused)
                .onAppear { if way == .onAppear { focused = true } }
                .task {
                    if way == .task { focused = true }
                    if way == .delayed {
                        try? await Task.sleep(for: .milliseconds(300))
                        focused = true
                    }
                }
                .onChange(of: focused) { _, now in seen.values.append(now) }
        }
    }
}
