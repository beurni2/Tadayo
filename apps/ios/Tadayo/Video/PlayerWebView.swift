import SwiftUI
import TadayoCore
import WebKit

/// The viewer's web view (screen E01; T39, "The player is a guest"; docs/TECH-DESIGN.md
/// section 4): made for one load of one post and let go after it.
///
/// - **Isolated.** Its data store is `WKWebsiteDataStore.nonPersistent()`, new for each web
///   view: it starts with no cookie, shares nothing with the app, with Safari or with the
///   viewing before it, and keeps nothing once it is let go (Q21).
/// - **Its page is the bundled shell** (`PlayerShell.html`) and never anything else: every
///   frame's load is asked of `VideoNavigation`, a new window is never made, and the person is
///   asked before leaving.
/// - **Messages** reach the model only from the shell's own page, as text with the origin the
///   browser gave the message; `PlayerMessage` decides whether it is the player's.
/// - **Nothing plays by itself:** media needs the person's tap in the player, and the only
///   word the app sends the player is "pause".
struct PlayerWebView: UIViewRepresentable {
    let model: VideoViewerModel
    /// The model's attempt this web view is for.
    let attempt: Int
    /// The address the shell is loaded under: none, which the web view reports as
    /// `about:blank`, or a page of Tadayo's own site. Spike S3 tries both (TECH-DESIGN
    /// section 4, "Embedding origin").
    let base: URL?
    let handle: PlayerHandle

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model, attempt: attempt, shell: Self.shell(base: base))
    }

    func makeUIView(context: Context) -> WKWebView {
        let webView = Self.make(coordinator: context.coordinator, player: model.post.player)
        handle.webView = webView
        Self.load(webView, base: base)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        release(webView)
    }

    /// The address the web view reports for the shell.
    static func shell(base: URL?) -> URL {
        base ?? URL(string: "about:blank")!
    }

    /// The name the shell posts to (`window.webkit.messageHandlers.player`).
    static let handler = "player"

    /// A web view for `player`, not yet loading anything.
    @MainActor static func make(coordinator: Coordinator, player: URL) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.mediaTypesRequiringUserActionForPlayback = .all
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsPictureInPictureMediaPlayback = false
        configuration.allowsAirPlayForMediaPlayback = false
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: "window.tadayoPlayer = \(Self.literal(player.absoluteString));",
                injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.add(coordinator, name: handler)
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = coordinator
        webView.uiDelegate = coordinator
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = true
        webView.backgroundColor = .black
        return webView
    }

    /// Loads the bundled shell under `base`.
    @MainActor static func load(_ webView: WKWebView, base: URL?) {
        guard let file = Bundle.main.url(forResource: "PlayerShell", withExtension: "html"),
            let shell = try? String(contentsOf: file, encoding: .utf8)
        else { return }
        webView.loadHTMLString(shell, baseURL: base)
    }

    /// Pauses the player, stops every load and takes the app's handler away, so the web view
    /// can be let go with nothing still running in it (T39: "paused on close, backgrounding
    /// and navigation, then released").
    @MainActor static func release(_ webView: WKWebView) {
        webView.evaluateJavaScript(PlayerHandle.pause, completionHandler: nil)
        webView.pauseAllMediaPlayback(completionHandler: nil)
        webView.stopLoading()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: handler)
        webView.configuration.userContentController.removeAllUserScripts()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        webView.loadHTMLString("", baseURL: nil)
    }

    /// `text` as a JavaScript string literal.
    static func literal(_ text: String) -> String {
        guard let data = try? JSONEncoder().encode(text),
            let literal = String(data: data, encoding: .utf8)
        else { return "\"\"" }
        return literal
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate,
        WKScriptMessageHandler
    {
        let model: VideoViewerModel
        let attempt: Int
        let policy: VideoNavigation
        /// The page has been given the shell, which loads once (`VideoNavigation`).
        private var shellLoaded = false

        init(model: VideoViewerModel, attempt: Int, shell: URL) {
            self.model = model
            self.attempt = attempt
            policy = VideoNavigation(shell: shell, post: model.post)
        }

        func webView(
            _ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction
        ) async -> WKNavigationActionPolicy {
            let request = VideoNavigation.Request(
                url: navigationAction.request.url,
                mainFrame: navigationAction.targetFrame?.isMainFrame ?? false,
                newWindow: navigationAction.targetFrame == nil, shellLoaded: shellLoaded)
            let decision = policy.decide(request)
            model.decided(decision, for: request)
            if decision == .allow && request.mainFrame && !request.newWindow {
                shellLoaded = true
            }
            return decision == .allow ? .allow : .cancel
        }

        /// A new window is never made. Whether WebKit asks `decidePolicyFor` first for a
        /// script's `window.open` isn't relied on: the request is decided here too, so the
        /// person is asked before leaving either way (T39). The model keeps one question at a
        /// time, so being asked twice about one window shows one.
        func webView(
            _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            let request = VideoNavigation.Request(
                url: navigationAction.request.url, mainFrame: false, newWindow: true,
                shellLoaded: shellLoaded)
            model.decided(policy.decide(request), for: request)
            return nil
        }

        /// The camera, the microphone and the device's motion are never the player's to ask
        /// for, whatever the shell's frame allows. The first method's name is WebKit's own
        /// for the async form (`WKUIDelegate.h`: `decideMediaCapturePermissionsFor`); a hosted
        /// test holds both to their selectors, since a misnamed one compiles and is never
        /// called.
        func webView(
            _ webView: WKWebView, decideMediaCapturePermissionsFor origin: WKSecurityOrigin,
            initiatedBy frame: WKFrameInfo, type: WKMediaCaptureType
        ) async -> WKPermissionDecision {
            .deny
        }

        /// WebKit gives this one no async form (its handler is a `decisionHandler` with no
        /// async name in `WKUIDelegate.h`), so an `async` method here answered to nothing.
        func webView(
            _ webView: WKWebView,
            requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void
        ) {
            decisionHandler(.deny)
        }

        func webView(
            _ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error
        ) {
            failed(error)
        }

        func webView(
            _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: any Error
        ) {
            failed(error)
        }

        private func failed(_ error: any Error) {
            let error = error as NSError
            // A load the policy stopped ends as "cancelled", which is no failure.
            if error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled { return }
            if error.domain == "WebKitErrorDomain" && error.code == 102 { return }
            let offline =
                error.domain == NSURLErrorDomain
                && [
                    NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost,
                    NSURLErrorDataNotAllowed, NSURLErrorInternationalRoamingOff,
                ].contains(error.code)
            model.loadFailed(offline: offline, attempt: attempt)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            model.playerEnded(attempt: attempt)
        }

        /// The shell's word. Only the web view's own page may speak here: the handler is also
        /// reachable from the frames inside it, the player's included, and a frame's word about
        /// its own origin is worth nothing.
        func userContentController(
            _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
        ) {
            guard message.frameInfo.isMainFrame else {
                model.note("message refused: frame")
                return
            }
            guard let body = message.body as? [String: Any] else {
                model.note("message refused: bridge")
                return
            }
            if let shell = body["shell"] as? String {
                model.note("shell: \(shell.prefix(40))")
                return
            }
            guard let origin = body["origin"] as? String, let data = body["data"] as? String
            else {
                model.note("message refused: bridge")
                return
            }
            model.received(origin: origin, json: data, attempt: attempt)
        }
    }
}

/// The viewer's hold on its web view, to pause the player when the app leaves the foreground
/// and before Close. It never keeps the web view alive.
@MainActor final class PlayerHandle {
    weak var webView: WKWebView?

    /// Calls the shell's `tadayoPause`, where the shell has made it.
    static let pause = "if (typeof window.tadayoPause === 'function') { window.tadayoPause(); }"

    /// Asks the player to pause, in its own words, and pauses the web view's media whatever
    /// the page does with that: a wall or a changed player may not listen. Neither puts
    /// anything in TikTok's frame.
    func pause() {
        webView?.evaluateJavaScript(Self.pause, completionHandler: nil)
        webView?.pauseAllMediaPlayback(completionHandler: nil)
    }
}
