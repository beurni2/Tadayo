import SwiftUI
import TadayoCore
import TadayoDesign
import UIKit
import XCTest

@testable import Tadayo

/// Throwaway probe on a check branch (never merged): which containers put a setup screen's title
/// where A02-age's sits under the system's navigation bar, on the newest iOS.
@MainActor
final class ZBarProbeTests: XCTestCase {
    private func ageModel() -> ProfileModel {
        ProfileModel(
            account: Account(
                id: "ben", displayName: nil, avatarVersion: nil, ageConfirmed: false, version: 0),
            accounts: ScriptedAccounts(updates: []), saved: { _ in }, signedOut: {})
    }

    private func page() -> some View {
        SetupScroll {
            SetupHeading(title: "root.error.account", subtitle: Text(verbatim: "Try again."))
        }
    }

    private func report(_ name: String, _ view: some View) -> String {
        let layout = AccessibilityElements.layout(of: view)
        let title = layout.elements.first { $0.isHeader }
        let labels = layout.elements.map { "[\($0.label)|\($0.isHeader ? "H" : "")]" }.joined()
        return
            "\(name): title minY \(title?.frame.minY ?? -1), safe top \(layout.safeArea.top), elements \(layout.elements.count) \(labels)"
    }

    func testProbeVariants() {
        var lines: [String] = []
        let age = AccessibilityElements.layout(of: AgeScreen(model: ageModel(), leave: {}))
        let ref = age.elements.first { $0.isHeader && $0.label == "Before you continue" }
        lines.append(
            "A02-age reference: title minY \(ref?.frame.minY ?? -1), safe top \(age.safeArea.top), elements \(age.elements.count)"
        )
        lines.append(
            report(
                "V0 empty inline bar",
                NavigationStack { page().navigationBarTitleDisplayMode(.inline) }))
        lines.append(
            report(
                "V1 title space",
                NavigationStack {
                    page().navigationTitle(Text(verbatim: " ")).navigationBarTitleDisplayMode(
                        .inline)
                }))
        lines.append(
            report(
                "V2 title zero-width space",
                NavigationStack {
                    page().navigationTitle(Text(verbatim: "\u{200B}"))
                        .navigationBarTitleDisplayMode(.inline)
                }))
        lines.append(
            report(
                "V3 toolbar visible",
                NavigationStack {
                    page().toolbar(.visible, for: .navigationBar)
                        .navigationBarTitleDisplayMode(.inline)
                }))
        lines.append(
            report(
                "V4 toolbar background visible",
                NavigationStack {
                    page().toolbarBackground(.visible, for: .navigationBar)
                        .toolbarBackground(Palette.canvas, for: .navigationBar)
                        .navigationBarTitleDisplayMode(.inline)
                }))
        lines.append(
            report(
                "V5 principal space",
                NavigationStack {
                    page().toolbar { ToolbarItem(placement: .principal) { Text(verbatim: " ") } }
                        .navigationBarTitleDisplayMode(.inline)
                }))
        if #available(iOS 18.0, *) {
            lines.append(
                report(
                    "V6 title removed from the toolbar",
                    NavigationStack {
                        page().navigationTitle(Text(verbatim: "Tadayo"))
                            .navigationBarTitleDisplayMode(.inline)
                            .toolbar(removing: .title)
                    }))
        }
        lines.append(
            report(
                "V7 real title (as the sign-in screens)",
                NavigationStack {
                    page().navigationTitle(Text("auth.signIn.navTitle"))
                        .navigationBarTitleDisplayMode(.inline)
                }))
        lines.append(
            report(
                "V8 leading clear item",
                NavigationStack {
                    page().toolbar {
                        ToolbarItem(placement: .topBarLeading) { Color.clear.frame(width: 1, height: 1) }
                    }
                    .navigationBarTitleDisplayMode(.inline)
                }))
        XCTFail("PROBE\n" + lines.joined(separator: "\n"))
    }

    func testProbeUIKitBar() {
        let scene = UIApplication.shared.connectedScenes.lazy.compactMap { $0 as? UIWindowScene }
            .first!
        var lines: [String] = []
        for (name, title) in [("empty title", nil), ("title x", "x")] as [(String, String?)] {
            let window = UIWindow(windowScene: scene)
            window.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
            let root = UIViewController()
            root.view.backgroundColor = .systemBackground
            root.title = title
            let nav = UINavigationController(rootViewController: root)
            nav.navigationBar.prefersLargeTitles = false
            window.rootViewController = nav
            window.isHidden = false
            nav.view.layoutIfNeeded()
            RunLoop.main.run(until: Date().addingTimeInterval(0.3))
            nav.view.layoutIfNeeded()
            lines.append(
                "UIKit \(name): bar frame \(nav.navigationBar.frame), bar hidden \(nav.isNavigationBarHidden), child safe top \(root.view.safeAreaInsets.top), window safe top \(window.safeAreaInsets.top)"
            )
            window.isHidden = true
        }
        let bare = UINavigationBar()
        lines.append(
            "UINavigationBar().sizeThatFits \(bare.sizeThatFits(CGSize(width: 393, height: 1000))), intrinsic \(bare.intrinsicContentSize)"
        )
        XCTFail("PROBE\n" + lines.joined(separator: "\n"))
    }
}
