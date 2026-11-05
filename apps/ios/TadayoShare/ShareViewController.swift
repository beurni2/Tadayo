import UIKit

/// The share extension's entry point (screen C04, spec 10). The compact composer arrives in B4;
/// until then it closes at once, adding nothing, so nothing shared is ever reported as added
/// (T20). No build with it goes to TestFlight before then without saying so.
final class ShareViewController: UIViewController {
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        extensionContext?.cancelRequest(
            withError: NSError(domain: "app.tadayo.share", code: NSUserCancelledError))
    }
}
