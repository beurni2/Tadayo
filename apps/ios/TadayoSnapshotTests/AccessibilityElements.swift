import Darwin
import SwiftUI
import UIKit

/// What VoiceOver finds on a screen, read in the test host's own process (the slice plan's
/// hosted accessibility checks): the screen is shown in a window of the host's scene, laid out,
/// and its accessibility elements gathered in the order UIKit hands them to VoiceOver.
///
/// SwiftUI builds a screen's accessibility elements only while an assistive technology or
/// automation is on, and a hosted unit test has neither, so the first read turns the simulator's
/// accessibility automation on for this process, as KIF's `KIFEnableAccessibility` and
/// AccessibilitySnapshot's `ASAccessibilityEnabler` do: `_AXSSetAutomationEnabled` from the
/// simulator's `libAccessibility.dylib`. It's left on: the UI tests turn it on anyway, and the
/// `ios` workflow's simulator goes with its runner. iOS then loads its accessibility bundles in
/// the background, and until they're in, a scroll view's content has no elements though a button
/// beside it has: in `ios` run 42331130562 the first read of `RootFailure` found Retry alone,
/// the log saying the bundles had loaded only during the next test. So the first read waits, up
/// to 10 seconds, until a probe, a line of text in a scroll view, can be read. Each test pairs
/// what mustn't be found with something that must, so a tree that can't be read fails rather
/// than passes.
@MainActor
enum AccessibilityElements {
    struct Element: CustomStringConvertible {
        let label: String
        let hint: String
        let traits: UIAccessibilityTraits
        var value = ""
        /// The names of its custom actions, such as "Copy caption", in order.
        var actions: [String] = []
        /// Where it is, in points from the window's top left corner, as the window lays it out.
        var frame = CGRect.zero

        var isHeader: Bool { traits.contains(.header) }

        var description: String {
            "\"\(label)\" value \"\(value)\" hint \"\(hint)\" traits \(traits.rawValue) at \(frame)"
        }
    }

    /// The elements of a screen and the window it was read in, to measure them against: the
    /// window's size and the safe areas it was given, and where each activity indicator the
    /// screen draws is, as drawn, with any scale it has (they aren't elements: a screen hides
    /// them from VoiceOver).
    struct Layout {
        let elements: [Element]
        let size: CGSize
        let safeArea: UIEdgeInsets
        var indicators: [CGRect] = []
    }

    static func of(_ view: some View) -> [Element] {
        layout(of: view).elements
    }

    /// The elements with their frames, and the window's size and safe areas: for a screen's
    /// geometry, such as where a title sits or how far a button is above the safe area. `ready`
    /// is the test's own scripted state, such as a save that has failed, which the read waits
    /// for first, up to 30 seconds, as `drive` does; what is asserted once it holds is the test's.
    static func layout(of view: some View, until ready: () -> Bool = { true }) -> Layout {
        prepare()
        return read(view, until: ready)
    }

    /// Activates the element labelled `label`, while the view is still on screen, as a double tap
    /// with VoiceOver does; false when there is no such element or it declines.
    static func activate(_ label: String, in view: some View) -> Bool {
        prepare()
        return show(view) { objects, _ in
            guard let element = objects.first(where: { $0.accessibilityLabel == label }),
                element.accessibilityActivate()
            else { return false }
            // A few turns of the run loop, for an action SwiftUI runs on the next one.
            let ran = Date().addingTimeInterval(0.2)
            while Date() < ran { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
            return true
        }
    }

    /// Performs the custom action named `action` on the element labelled `label`, while the view
    /// is still on screen, as VoiceOver or Switch Control would; false when there is no such
    /// element or action, or its handler declines.
    static func perform(_ action: String, on label: String, in view: some View) -> Bool {
        prepare()
        return show(view) { objects, _ in
            guard
                let element = objects.first(where: { $0.accessibilityLabel == label }),
                let custom = element.accessibilityCustomActions?.first(where: {
                    $0.name == action
                })
            else { return false }
            if let handler = custom.actionHandler { return handler(custom) }
            guard let target = custom.target as? NSObject else { return false }
            _ = target.perform(custom.selector, with: custom)
            return true
        }
    }

    private static var prepared = false

    /// Turns automation on, once, and waits until a probe in a scroll view can be read, for up to
    /// 10 seconds; with no automation, or past that, the reads go ahead and the tests' own
    /// expectations fail.
    private static func prepare() {
        guard !prepared else { return }
        prepared = true
        guard automationIsOn else { return }
        let probe = "Accessibility probe"
        let deadline = Date().addingTimeInterval(10)
        while Date() < deadline,
            !read(ScrollView { Text(verbatim: probe) }).elements.contains(where: {
                $0.label == probe
            })
        {}
    }

    /// Shows the view, waits for `ready` and then for its elements to settle (`settle`), gathers
    /// them in VoiceOver's order, and hands them and the window to `use` before the window goes.
    private static func show<Result>(
        _ view: some View, until ready: () -> Bool = { true },
        _ use: ([NSObject], UIWindow) -> Result
    ) -> Result {
        let scene = UIApplication.shared.connectedScenes.lazy.compactMap { $0 as? UIWindowScene }
            .first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow()
        window.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        // The app in the foreground, as the snapshots draw it (`ScreenSnapshot`): a hosting
        // controller outside the app's own scene isn't told the app is active.
        let controller = UIHostingController(
            rootView: view.environment(\.locale, Locale(identifier: "en_US"))
                .environment(\.scenePhase, .active))
        // The snapshots' scale (`ScreenSnapshot.Variant.traits`), not the screen's 3x. In `ios`
        // run 42990527058 `RootWait` was read here before any snapshot drew its indicator, and
        // the light snapshots of the tabs' loading states, which draw the same indicator, came
        // out 203 pixels different from the references, the spokes' inner tips about 0.2 pixel
        // longer, though nothing of theirs had changed: the first window to show an indicator
        // seems to fix how the process draws it afterwards.
        controller.traitOverrides.displayScale = 2
        window.rootViewController = controller
        window.isHidden = false
        defer {
            window.isHidden = true
            window.rootViewController = nil
        }
        let scripted = Date().addingTimeInterval(30)
        while !ready(), Date() < scripted {
            RunLoop.main.run(until: Date().addingTimeInterval(0.02))
        }
        settle(window)
        window.layoutIfNeeded()
        return use(gather(window), window)
    }

    /// Turns the run loop until the window's elements, their labels, values and frames, have
    /// stayed the same through 10 turns of 0.05 seconds, half a second at the least, for up to 10
    /// seconds; past that the read goes ahead, and the test's own expectations decide. Counted in
    /// turns, not only in time, because SwiftUI makes each update of a screen on a turn of the
    /// main run loop, and a loaded runner can let a half second pass in a few turns. A navigation
    /// stack putting up its screen is waited for this way too. A fixed half second, which this
    /// replaced, wasn't always enough: `ProfileForm` scrolls its column above Continue only after
    /// the keyboard's room has been read and `onChange(of: keyboardRise, initial: true)` has
    /// asked for the scroll, a few updates later, and
    /// `SignInReadingTests.testContinueSits12AboveTheKeyboardOr44AboveTheSafeArea` read the
    /// column not yet scrolled (Continue's top 314 points above the field's bottom) in four runs
    /// on iOS 26.5, the last `main`'s `ios` 45523314156 at `12b3d8a`
    /// (`docs/plans/ios-b1-intermittents.md`, item 3). What is asserted is unchanged; a screen
    /// that never settles still fails as it did.
    private static func settle(_ window: UIWindow) {
        func state() -> [String] {
            window.layoutIfNeeded()
            return gather(window).map {
                "\($0.accessibilityLabel ?? "")|\($0.accessibilityValue ?? "")|\($0.accessibilityFrame)"
            }
        }
        var last = state()
        var still = 0
        let deadline = Date().addingTimeInterval(10)
        while still < 10, Date() < deadline {
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
            let now = state()
            if now == last {
                still += 1
            } else {
                last = now
                still = 0
            }
        }
    }

    private static func read(_ view: some View, until ready: () -> Bool = { true }) -> Layout {
        show(view, until: ready) { objects, window in
            Layout(
                elements: objects.map {
                    Element(
                        label: $0.accessibilityLabel ?? "", hint: $0.accessibilityHint ?? "",
                        traits: $0.accessibilityTraits, value: $0.accessibilityValue ?? "",
                        actions: $0.accessibilityCustomActions?.map(\.name) ?? [],
                        frame: $0.accessibilityFrame)
                },
                size: window.bounds.size, safeArea: window.safeAreaInsets,
                indicators: indicators(in: window))
        }
    }

    /// The frames, in the window's coordinates, of the activity indicators below `view`.
    private static func indicators(in view: UIView) -> [CGRect] {
        view.subviews.flatMap { subview -> [CGRect] in
            if let indicator = subview as? UIActivityIndicatorView {
                return [indicator.convert(indicator.bounds, to: nil)]
            }
            return indicators(in: subview)
        }
    }

    /// Turns accessibility automation on, once; false when the library or its call isn't there.
    private static let automationIsOn: Bool = {
        let environment = ProcessInfo.processInfo.environment
        let root = environment["IPHONE_SIMULATOR_ROOT"] ?? environment["SIMULATOR_ROOT"] ?? ""
        guard let library = dlopen(root + "/usr/lib/libAccessibility.dylib", RTLD_NOW),
            let call = dlsym(library, "_AXSSetAutomationEnabled")
        else { return false }
        typealias SetAutomationEnabled = @convention(c) (Int32) -> Void
        unsafeBitCast(call, to: SetAutomationEnabled.self)(1)
        return true
    }()

    private static func gather(_ object: NSObject) -> [NSObject] {
        if let view = object as? UIView, view.isHidden || view.accessibilityElementsHidden {
            return []
        }
        if object.isAccessibilityElement { return [object] }
        if let elements = object.accessibilityElements as? [NSObject] {
            return elements.flatMap(gather)
        }
        let count = object.accessibilityElementCount()
        if count != NSNotFound, count > 0 {
            return (0..<count).compactMap { object.accessibilityElement(at: $0) as? NSObject }
                .flatMap(gather)
        }
        if let view = object as? UIView { return view.subviews.flatMap(gather) }
        return []
    }
}
