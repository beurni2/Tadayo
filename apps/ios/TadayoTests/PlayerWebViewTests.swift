import Network
import TadayoCore
import WebKit
import XCTest

@testable import Tadayo

/// The viewer's web view (`PlayerWebView`; T39, Q21): isolated from the app's credentials, its
/// page the shell and nothing else, and the shell's messages read only from the shell's page.
///
/// Nothing here reaches TikTok: each web view's data store is given a proxy at a closed local
/// port before anything loads, so the player's frame is asked for and never arrives. How the
/// real player behaves is spike S3's question, answered on the iPhone and by the probe
/// (`docs/plans/ios-b0-spike-video.md`).
@MainActor
final class PlayerWebViewTests: XCTestCase {
    private let ready = #"{"x-tiktok-player":true,"type":"onPlayerReady"}"#

    private func viewer() -> VideoViewerModel {
        let model = VideoViewerModel(
            post: TikTokPost(link: "https://www.tiktok.com/@scout2015/video/6718335390845095173")!)
        model.open()
        return model
    }

    /// A web view for `model`, loaded under `base`, with its coordinator, which the web view
    /// doesn't keep alive.
    private func loaded(
        _ model: VideoViewerModel, base: URL? = nil
    ) async throws -> (WKWebView, PlayerWebView.Coordinator) {
        let coordinator = PlayerWebView.Coordinator(
            model: model, attempt: model.attempt, shell: PlayerWebView.shell(base: base))
        let webView = PlayerWebView.make(coordinator: coordinator, player: model.post.player)
        webView.configuration.websiteDataStore.proxyConfigurations = [
            ProxyConfiguration(httpCONNECTProxy: .hostPort(host: "127.0.0.1", port: 9))
        ]
        PlayerWebView.load(webView, base: base)
        // Every load waits up to 60 seconds for the frame, and returns as soon as it's made. The
        // process's first load waited 60 and every later one 10 until a later load stalled too:
        // in `ios` run 44842617958 (iOS 27.2, a saturated runner), the first load of
        // `testTheWebViewSharesNothingWithTheAppAndStartsNothingByItself`, not the process's
        // first, waited 8.7 seconds for its web process to launch, where the run's other
        // launches took 1.1 to 1.3, and the 10 ran out before the frame was made and decided
        // (its request failed at the closed port about 14 seconds into the test). Before that, in
        // `ios` run 44715668431, attempt 1 (iOS 26.5), the runner stalled during the process's
        // first load: WebKit's first line came 6.7 seconds after the suite began, the web process
        // was reported unresponsive for 7.4 seconds, and the frame wasn't made within the 10 it
        // had then; the same load took 1.0 second in the re-run. What is checked once the frame
        // is made is unchanged.
        //
        // The shell says "frame made" as soon as it has put the frame in the page; WebKit asks
        // the coordinator about the frame's address after that, on its own turn. So the load
        // ends once both are in the viewer's log, whatever the policy decided (a test that cares
        // checks the decision itself): in `ios` run 44819232458 (iOS 27.2, a saturated runner)
        // the decision came after `testTheShellIgnoresAMessageThatIsNotItsFramesOwn` had read
        // its baseline. Nothing of the frame's is logged after it: its request goes to the closed
        // port, and no failure of it reaches the viewer (the tests below that find the phase still
        // `.loading`).
        try await wait("the shell makes its frame, and its address is decided", seconds: 60) {
            model.log.contains("shell: frame made")
                && model.log.contains { $0.hasPrefix("frame ") }
        }
        return (webView, coordinator)
    }

    /// Polls `met` every 50 milliseconds, `seconds` × 20 times. A stalled runner makes the wait
    /// longer on the clock than `seconds`, never shorter.
    private func wait(
        _ what: String, seconds: Int = 10, file: StaticString = #filePath, line: UInt = #line,
        until met: () -> Bool
    ) async throws {
        for _ in 0..<(seconds * 20) {
            if met() { return }
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTFail("waited at least \(seconds) seconds for: \(what)", file: file, line: line)
    }

    private func post(_ body: String, to webView: WKWebView) async throws {
        _ = try await webView.evaluateJavaScript(
            "window.webkit.messageHandlers.player.postMessage(\(body)); true")
    }

    func testTheWebViewSharesNothingWithTheAppAndStartsNothingByItself() async throws {
        let cookie = try XCTUnwrap(
            HTTPCookie(properties: [
                .domain: "www.tiktok.com", .path: "/", .name: "app-side", .value: "1",
                .secure: "TRUE",
            ]))
        HTTPCookieStorage.shared.setCookie(cookie)
        addTeardownBlock { HTTPCookieStorage.shared.deleteCookie(cookie) }

        let first = viewer()
        let (webView, firstCoordinator) = try await loaded(first)
        let configuration = webView.configuration
        XCTAssertFalse(configuration.websiteDataStore.isPersistent)
        let cookies = await configuration.websiteDataStore.httpCookieStore.allCookies()
        XCTAssertEqual(cookies, [], "the web view starts with no cookie, the app's included")
        XCTAssertEqual(configuration.mediaTypesRequiringUserActionForPlayback, .all)
        XCTAssertFalse(configuration.allowsPictureInPictureMediaPlayback)
        XCTAssertFalse(configuration.allowsAirPlayForMediaPlayback)
        XCTAssertFalse(configuration.preferences.javaScriptCanOpenWindowsAutomatically)
        XCTAssertFalse(webView.allowsBackForwardNavigationGestures)
        XCTAssertFalse(webView.allowsLinkPreview)

        // Each viewing has its own store: nothing carries from one to the next.
        let second = viewer()
        let (other, secondCoordinator) = try await loaded(second)
        XCTAssertFalse(configuration.websiteDataStore === other.configuration.websiteDataStore)
        withExtendedLifetime((firstCoordinator, secondCoordinator)) {}
    }

    func testTheShellHoldsOneFrameWithThePostsPlayer() async throws {
        let model = viewer()
        let (webView, coordinator) = try await loaded(model)
        let frames = try await webView.evaluateJavaScript(
            "Array.from(document.querySelectorAll('iframe')).map(function (f) { return f.src; })")
        XCTAssertEqual(
            frames as? [String],
            ["https://www.tiktok.com/player/v1/6718335390845095173?autoplay=0&rel=0"])
        XCTAssertEqual(webView.url?.absoluteString, "about:blank")
        XCTAssertTrue(model.log.contains("page allowed: about"), "\(model.log)")
        XCTAssertTrue(model.log.contains("frame allowed: www.tiktok.com"), "\(model.log)")
        withExtendedLifetime(coordinator) {}
    }

    func testTheShellLoadsUnderTadayosOwnAddressToo() async throws {
        let model = viewer()
        let base = try XCTUnwrap(URL(string: "https://tadayo.app/"))
        let (webView, coordinator) = try await loaded(model, base: base)
        XCTAssertEqual(webView.url, base)
        let origin = try await webView.evaluateJavaScript("window.location.origin")
        XCTAssertEqual(origin as? String, "https://tadayo.app")
        XCTAssertTrue(model.log.contains("page allowed: tadayo.app"), "\(model.log)")
        withExtendedLifetime(coordinator) {}
    }

    /// The page can't be replaced: a script's navigation is stopped and the person is asked,
    /// and another app's scheme is stopped with nothing asked.
    func testThePageNeverNavigatesAway() async throws {
        let model = viewer()
        let (webView, coordinator) = try await loaded(model)
        _ = try await webView.evaluateJavaScript(
            "window.location.href = 'https://example.com/elsewhere?x=1'; true")
        try await wait("the person is asked") { model.leaving != nil }
        XCTAssertEqual(model.leaving?.absoluteString, "https://example.com/elsewhere?x=1")
        XCTAssertEqual(webView.url?.absoluteString, "about:blank")
        XCTAssertTrue(model.log.contains("page asked: example.com"), "\(model.log)")
        XCTAssertNil(model.answerLeaving(leave: false))

        _ = try await webView.evaluateJavaScript(
            "window.location.href = 'snssdk1233://aweme/detail/1'; true")
        try await wait("the scheme is stopped") {
            model.log.contains("page stopped: snssdk1233")
        }
        XCTAssertNil(model.leaving)
        XCTAssertEqual(webView.url?.absoluteString, "about:blank")
        XCTAssertEqual(model.phase, .loading, "a stopped load is no failure")
        withExtendedLifetime(coordinator) {}
    }

    /// The shell loads once: its own address a second time is stopped with nothing asked, and
    /// the shell's frame is still there. Under no address that is an empty page over the
    /// shell; under `https://tadayo.app/` it would be the real site.
    func testTheShellsOwnAddressNeverLoadsASecondTime() async throws {
        for base in [nil, URL(string: "https://tadayo.app/")] {
            let model = viewer()
            let (webView, coordinator) = try await loaded(model, base: base)
            let address = base?.absoluteString ?? "about:blank"
            let host = base?.host ?? "about"
            _ = try await webView.evaluateJavaScript("window.location.href = '\(address)'; true")
            try await wait("the second load is stopped (\(address))") {
                model.log.contains("page stopped: \(host)")
            }
            XCTAssertNil(model.leaving)
            let frames = try await webView.evaluateJavaScript(
                "document.querySelectorAll('iframe').length")
            XCTAssertEqual(frames as? Int, 1, "the shell is still the page (\(address))")
            XCTAssertEqual(model.log.filter { $0 == "page allowed: \(host)" }.count, 1)
            withExtendedLifetime(coordinator) {}
        }
    }

    /// WebKit asks these two of the web view's delegate only if it answers to them, and a
    /// method whose Swift name is a little off compiles and never does. Both refuse.
    func testTheDelegateAnswersWebKitsTwoPermissionQuestions() {
        let model = viewer()
        let coordinator = PlayerWebView.Coordinator(
            model: model, attempt: model.attempt, shell: PlayerWebView.shell(base: nil))
        for name in [
            "webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:",
            "webView:requestDeviceOrientationAndMotionPermissionForOrigin:initiatedByFrame:decisionHandler:",
        ] {
            XCTAssertTrue(coordinator.responds(to: NSSelectorFromString(name)), name)
        }
    }

    /// A frame inside the page can reach the app's handler too, the player's among them, and
    /// its word about its own origin is worth nothing: only the page's own messages are read.
    func testAFramesOwnWordToTheAppIsRefused() async throws {
        let model = viewer()
        let (webView, coordinator) = try await loaded(model)
        let text = PlayerWebView.literal(ready)
        _ = try await webView.evaluateJavaScript(
            """
            var frame = document.createElement('iframe');
            document.body.appendChild(frame);
            frame.contentWindow.webkit.messageHandlers.player.postMessage(
              { origin: 'https://www.tiktok.com', data: \(text) });
            true
            """)
        try await wait("the frame's word is refused") {
            model.log.contains("message refused: frame")
        }
        XCTAssertEqual(model.phase, .loading)
        withExtendedLifetime(coordinator) {}
    }

    /// The bridge passes on what the shell reports and `PlayerMessage` decides: a message with
    /// another origin, or one that isn't the bridge's shape, changes nothing.
    func testOnlyAPlayersMessageMovesTheViewer() async throws {
        let model = viewer()
        let (webView, coordinator) = try await loaded(model)
        let text = PlayerWebView.literal(ready)
        try await post("{ origin: 'https://example.com', data: \(text) }", to: webView)
        try await wait("the origin is refused") {
            model.log.contains("message refused: origin")
        }
        try await post("'onPlayerReady'", to: webView)
        try await post("{ origin: 7, data: \(text) }", to: webView)
        try await wait("the shapes are refused") {
            model.log.filter { $0 == "message refused: bridge" }.count == 2
        }
        XCTAssertEqual(model.phase, .loading)

        try await post("{ origin: 'https://www.tiktok.com', data: \(text) }", to: webView)
        try await wait("the player's word is taken") { model.phase == .ready(.initial) }
        withExtendedLifetime(coordinator) {}
    }

    /// The shell passes on only its own frame's messages, with the origin the browser gave:
    /// the page's own `postMessage` to itself never reaches the app.
    func testTheShellIgnoresAMessageThatIsNotItsFramesOwn() async throws {
        let model = viewer()
        let (webView, coordinator) = try await loaded(model)
        let before = model.log
        _ = try await webView.evaluateJavaScript(
            "window.postMessage({ 'x-tiktok-player': true, type: 'onPlayerReady' }, '*'); true")
        // Give the message a turn to arrive, then show nothing came of it.
        try await post("{ shell: 'marker' }", to: webView)
        try await wait("the marker arrives") { model.log.contains("shell: marker") }
        XCTAssertEqual(model.log, before + ["shell: marker"])
        XCTAssertEqual(model.phase, .loading)
        withExtendedLifetime(coordinator) {}
    }

    /// After `release`, the web view holds an empty page, and the app's handler is gone.
    func testReleaseLeavesNothingRunning() async throws {
        let model = viewer()
        let (webView, coordinator) = try await loaded(model)
        PlayerWebView.release(webView)
        XCTAssertNil(webView.navigationDelegate)
        XCTAssertNil(webView.uiDelegate)
        XCTAssertEqual(webView.configuration.userContentController.userScripts.count, 0)
        var frames: Any?
        for _ in 0..<200 {
            frames = try await webView.evaluateJavaScript(
                "document.querySelectorAll('iframe').length")
            if frames as? Int == 0 { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertEqual(frames as? Int, 0)
        let handler = try await webView.evaluateJavaScript(
            "typeof (window.webkit && window.webkit.messageHandlers"
                + " && window.webkit.messageHandlers.player)")
        XCTAssertNotEqual(handler as? String, "object")
        withExtendedLifetime(coordinator) {}
    }
}
