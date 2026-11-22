import LinkPresentation
import SwiftUI
import UIKit

/// Shares an invitation link with the system's share sheet (`UIActivityViewController`; spec 04:
/// no contacts permission, T45), and says whether a share completed: a copy counts (FQ67), a
/// dismissal doesn't. No channel is preselected. Add to Reading List is left out: it would keep
/// the link in Safari's Reading List, on each of the person's devices through iCloud, and save its
/// page for reading offline, all beyond the app's purge (ADR-037). The link is the one item, with
/// its preview's metadata given (`InvitationLinkItem`), which keeps the sheet's header from
/// loading the page; nothing here keeps, logs or describes it (T7, T52).
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

    /// The system's sheet. It answers once: a share as soon as one completes; no share when the
    /// sheet closes without one, or can't be shown (no scene in the foreground, or UIKit refusing
    /// the presentation, which calls nothing back), so a screen waiting on it never waits for
    /// ever. An activity cancelled with the sheet still up (Messages, then Cancel) answers
    /// nothing yet: the person can still pick another. A sheet asked for while another screen is
    /// still going away is shown once that has gone.
    static let system = ShareLinkAction { url in
        await withCheckedContinuation { finished in
            let answer = ShareAnswer(finished)
            guard let presenter = UIApplication.shared.frontmostController else {
                answer.give(false)
                return
            }
            let sheet = UIActivityViewController(
                activityItems: [InvitationLinkItem(url: url)], applicationActivities: nil)
            sheet.excludedActivityTypes = [.addToReadingList]
            sheet.completionWithItemsHandler = { type, completed, _, _ in
                // No type: the sheet closed with nothing picked.
                if completed || type == nil { answer.give(completed) }
            }
            if let leaving = presenter.presentedViewController, leaving.isBeingDismissed,
                let transition = leaving.transitionCoordinator
            {
                let queued = transition.animate(alongsideTransition: nil) { _ in
                    MainActor.assumeIsolated {
                        ShareLinkAction.show(sheet, over: presenter, answer: answer)
                    }
                }
                if !queued { ShareLinkAction.show(sheet, over: presenter, answer: answer) }
            } else {
                ShareLinkAction.show(sheet, over: presenter, answer: answer)
            }
        }
    }

    /// Presents the sheet, then watches it: once it isn't showing (a second after `present`, as
    /// UIKit refuses a presentation it can't make without calling anything back, or later, once
    /// it has closed), and its completion hasn't answered within half a second, no share.
    @MainActor private static func show(
        _ sheet: UIActivityViewController, over presenter: UIViewController, answer: ShareAnswer
    ) {
        presenter.present(sheet, animated: true)
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1))
            while !answer.given, sheet.presentingViewController != nil {
                try? await Task.sleep(for: .seconds(0.5))
            }
            try? await Task.sleep(for: .seconds(0.5))
            answer.give(false)
        }
    }
}

/// The share's one answer, given once whatever calls it: the sheet's completion, or no share when
/// the sheet isn't showing.
@MainActor private final class ShareAnswer {
    private var finished: CheckedContinuation<Bool, Never>?

    init(_ finished: CheckedContinuation<Bool, Never>) {
        self.finished = finished
    }

    var given: Bool { finished == nil }

    func give(_ completed: Bool) {
        finished?.resume(returning: completed)
        finished = nil
    }
}

/// The invitation link as the sheet's item, with the metadata for its preview: the link itself
/// and no title, so the sheet's header shows the link without loading its page. An activity the
/// person picks may still load the page for its own preview, as for any link they share.
private final class InvitationLinkItem: NSObject, UIActivityItemSource {
    let url: URL

    init(url: URL) {
        self.url = url
    }

    func activityViewControllerPlaceholderItem(_ controller: UIActivityViewController) -> Any {
        url
    }

    func activityViewController(
        _ controller: UIActivityViewController, itemForActivityType type: UIActivity.ActivityType?
    ) -> Any? {
        url
    }

    func activityViewControllerLinkMetadata(_ controller: UIActivityViewController)
        -> LPLinkMetadata?
    {
        let metadata = LPLinkMetadata()
        metadata.originalURL = url
        metadata.url = url
        return metadata
    }

    override var description: String { "InvitationLinkItem" }
}

extension EnvironmentValues {
    @Entry var shareLink = ShareLinkAction.system
}

extension UIApplication {
    /// The controller showing on top in the foreground scene's key window, where a sheet is
    /// presented: a sheet already shown presents over itself. A scene in the foreground but
    /// inactive (Control Center or a call's banner over it) still shows the sheet.
    @MainActor fileprivate var frontmostController: UIViewController? {
        let scenes = connectedScenes.compactMap { $0 as? UIWindowScene }
        let window =
            (scenes.filter { $0.activationState == .foregroundActive }
            + scenes.filter { $0.activationState == .foregroundInactive })
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
        var top = window?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}
