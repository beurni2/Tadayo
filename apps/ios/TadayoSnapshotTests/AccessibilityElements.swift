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

        var isHeader: Bool { traits.contains(.header) }

        var description: String { "\"\(label)\" hint \"\(hint)\" traits \(traits.rawValue)" }
    }

    static func of(_ view: some View) -> [Element] {
        prepare()
        return read(view)
    }

    /// Performs the custom action named `action` on the element labelled `label`, while the view
    /// is still on screen, as VoiceOver or Switch Control would; false when there is no such
    /// element or action, or its handler declines.
    static func perform(_ action: String, on label: String, in view: some View) -> Bool {
        prepare()
        return show(view) { objects in
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
            !read(ScrollView { Text(verbatim: probe) }).contains(where: { $0.label == probe })
        {}
    }

    /// Shows the view, gathers its elements in VoiceOver's order, and hands them to `use` before
    /// the window goes.
    private static func show<Result>(
        _ view: some View, _ use: ([NSObject]) -> Result
    ) -> Result {
        let scene = UIApplication.shared.connectedScenes.lazy.compactMap { $0 as? UIWindowScene }
            .first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow()
        window.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        window.rootViewController = UIHostingController(
            rootView: view.environment(\.locale, Locale(identifier: "en_US")))
        window.isHidden = false
        defer {
            window.isHidden = true
            window.rootViewController = nil
        }
        // A few turns of the run loop, so a navigation stack has put up its screen.
        let settled = Date().addingTimeInterval(0.5)
        while Date() < settled { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
        window.layoutIfNeeded()
        return use(gather(window))
    }

    private static func read(_ view: some View) -> [Element] {
        show(view) { objects in
            objects.map {
                Element(
                    label: $0.accessibilityLabel ?? "", hint: $0.accessibilityHint ?? "",
                    traits: $0.accessibilityTraits, value: $0.accessibilityValue ?? "",
                    actions: $0.accessibilityCustomActions?.map(\.name) ?? [])
            }
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
