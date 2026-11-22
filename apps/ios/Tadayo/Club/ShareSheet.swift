import SwiftUI
import UIKit

/// Shares an invitation link with the system's share sheet (`UIActivityViewController`; spec 04:
/// no contacts permission, T45), and says when it closes whether a share completed: a copy counts
/// (FQ67), a dismissal doesn't. No channel is preselected and none is left out; the link is the
/// one item, and nothing here keeps, logs or describes it (T7, T52).
///
/// The screens take it from the environment, so a test can put one there that records what it was
/// asked to share instead of showing the sheet.
struct ShareLinkAction: Sendable {
    let share: @MainActor @Sendable (URL) async -> Bool

    /// Shows the sheet over the frontmost screen and returns once it has closed: true when a share
    /// completed.
    @MainActor func callAsFunction(_ url: URL) async -> Bool {
        await share(url)
    }

    /// The system's sheet.
    static let system = ShareLinkAction { url in
        await withCheckedContinuation { finished in
            guard let presenter = UIApplication.shared.frontmostController else {
                finished.resume(returning: false)
                return
            }
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            // Answered once, whatever the sheet calls back.
            var answered = false
            sheet.completionWithItemsHandler = { _, completed, _, _ in
                guard !answered else { return }
                answered = true
                finished.resume(returning: completed)
            }
            presenter.present(sheet, animated: true)
        }
    }
}

extension EnvironmentValues {
    @Entry var shareLink = ShareLinkAction.system
}

extension UIApplication {
    /// The controller showing on top in the foreground scene's key window, where a sheet is
    /// presented: a sheet already shown presents over itself.
    @MainActor fileprivate var frontmostController: UIViewController? {
        let window =
            connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
        var top = window?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}
