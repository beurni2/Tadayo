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
/// `ios` workflow's simulator goes with its runner. Each test pairs what mustn't be found with
/// something that must, so a tree that can't be read fails rather than passes.
@MainActor
enum AccessibilityElements {
    struct Element: CustomStringConvertible {
        let label: String
        let hint: String
        let traits: UIAccessibilityTraits

        var isHeader: Bool { traits.contains(.header) }

        var description: String { "\"\(label)\" hint \"\(hint)\" traits \(traits.rawValue)" }
    }

    static func of(_ view: some View) -> [Element] {
        _ = automationIsOn
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
        return gather(window).map {
            Element(
                label: $0.accessibilityLabel ?? "", hint: $0.accessibilityHint ?? "",
                traits: $0.accessibilityTraits)
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
