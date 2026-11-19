import TadayoCore
import WebKit
import XCTest

@testable import Tadayo

/// Spike S3's probe (docs/plans/ios-b0-spike-video.md, section 5), on a branch that never
/// merges: the real player, from CI's simulator, under each shell address. It fails on purpose
/// with what it saw. The resource reader below is put into every frame by this test alone; the
/// app never puts a script into TikTok's frame.
@MainActor
final class ZPlayerProbeTests: XCTestCase {
    private final class Reader: NSObject, WKScriptMessageHandler {
        var lines: [String] = []

        func userContentController(
            _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
        ) {
            let frame = message.frameInfo.isMainFrame ? "page" : "frame"
            lines.append("\(frame): \(String(describing: message.body).prefix(300))")
        }
    }

    private static let reader = """
        (function () {
          var probe = window.webkit && window.webkit.messageHandlers
            && window.webkit.messageHandlers.probe;
          if (!probe) { return; }
          var seen = {};
          function send(entries) {
            entries.forEach(function (entry) {
              try {
                var key = "res " + location.host + " <- " + new URL(entry.name).host
                  + " " + entry.initiatorType;
                if (!seen[key]) { seen[key] = true; probe.postMessage(key); }
              } catch (error) {}
            });
          }
          try {
            send(performance.getEntriesByType("resource"));
            new PerformanceObserver(function (list) { send(list.getEntries()); })
              .observe({ type: "resource", buffered: true });
          } catch (error) { probe.postMessage("no observer: " + error); }
          var ancestors = location.ancestorOrigins
            ? Array.prototype.slice.call(location.ancestorOrigins).join(",") : "?";
          probe.postMessage("doc " + location.protocol + "//" + location.host
            + location.pathname.slice(0, 24) + " referrer=[" + document.referrer
            + "] ancestors=[" + ancestors + "]");
          if (window.top === window) {
            window.addEventListener("message", function (event) {
              var text;
              try { text = JSON.stringify(event.data); } catch (error) { text = "?"; }
              if (text && text.indexOf("onCurrentTime") < 0) {
                probe.postMessage("msg " + event.origin + " " + String(text).slice(0, 200));
              }
            });
          } else {
            setTimeout(function () {
              var text = document.body ? document.body.innerText : "";
              probe.postMessage("text " + location.host + ": "
                + text.replace(/\\s+/g, " ").slice(0, 240)
                + " | videos=" + document.querySelectorAll("video").length
                + " frames=" + document.querySelectorAll("iframe").length);
            }, 12000);
          }
        }());
        """

    private func pause(_ seconds: Double) async {
        try? await Task.sleep(for: .milliseconds(Int(seconds * 1000)))
    }

    private func run(link: String, base: URL?) async -> [String] {
        var report = ["=== \(link) under \(base?.absoluteString ?? "no address")"]
        guard let post = TikTokPost(link: link) else { return report + ["no post"] }
        let model = VideoViewerModel(post: post)
        model.open()
        let coordinator = PlayerWebView.Coordinator(
            model: model, attempt: model.attempt, shell: PlayerWebView.shell(base: base))
        let webView = PlayerWebView.make(coordinator: coordinator, player: post.player)
        let reader = Reader()
        webView.configuration.userContentController.add(reader, name: "probe")
        webView.configuration.userContentController.addUserScript(
            WKUserScript(
                source: Self.reader, injectionTime: .atDocumentEnd, forMainFrameOnly: false))
        webView.frame = CGRect(x: 0, y: 0, width: 320, height: 568)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 568))
        window.addSubview(webView)
        window.isHidden = false

        let started = ContinuousClock.now
        PlayerWebView.load(webView, base: base)
        var settled: Duration?
        for _ in 0..<300 {
            if model.phase != .loading {
                settled = ContinuousClock.now - started
                break
            }
            await pause(0.1)
        }
        report.append("phase after \(settled.map { "\($0)" } ?? "30 s, none"): \(model.phase)")
        await pause(14)
        report.append("phase at +14 s: \(model.phase)")

        // Ask the player to play without a tap, to see what it answers, then pause it the way
        // the app does.
        _ = try? await webView.evaluateJavaScript(
            "document.querySelector('iframe').contentWindow.postMessage("
                + "{ 'x-tiktok-player': true, type: 'play' }, 'https://www.tiktok.com'); true")
        await pause(5)
        report.append("phase after play: \(model.phase)")
        _ = try? await webView.evaluateJavaScript("\(PlayerHandle.pause); true")
        await pause(3)
        report.append("phase after pause: \(model.phase)")

        let cookies = await webView.configuration.websiteDataStore.httpCookieStore.allCookies()
        report.append(
            "cookies in the web view's store: "
                + cookies.map { "\($0.domain):\($0.name)" }.sorted().joined(separator: " "))
        report.append("--- the viewer's log")
        report += model.log
        report.append("--- the reader")
        report += reader.lines
        PlayerWebView.release(webView)
        window.isHidden = true
        withExtendedLifetime(coordinator) {}
        return report
    }

    func testProbe() async {
        var report: [String] = []
        let example = "https://www.tiktok.com/@scout2015/video/6718335390845095173"
        report += await run(link: example, base: nil)
        report += await run(link: example, base: URL(string: "https://tadayo.app/"))
        report += await run(link: "https://www.tiktok.com/@scout2015/video/1", base: nil)
        XCTFail("S3-PROBE\n" + report.joined(separator: "\n"))
    }
}
