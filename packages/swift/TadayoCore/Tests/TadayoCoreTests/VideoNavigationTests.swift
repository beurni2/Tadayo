import Foundation
import Testing

@testable import TadayoCore

/// What the viewer's web view may load (`VideoNavigation.decide`; T39; Q21: the web view
/// "cannot … navigate silently to arbitrary hosts").
@Suite struct VideoNavigationTests {
    private let shell = URL(string: "about:blank")!
    private var policy: VideoNavigation {
        VideoNavigation(
            shell: shell, post: TikTokPost(link: "https://www.tiktok.com/@a/video/123")!)
    }

    private func page(_ url: String) -> VideoNavigation.Decision {
        policy.decide(.init(url: URL(string: url), mainFrame: true))
    }

    private func frame(_ url: String) -> VideoNavigation.Decision {
        policy.decide(.init(url: URL(string: url), mainFrame: false))
    }

    @Test func thePageIsTheShellAlone() {
        #expect(page("about:blank") == .allow)
        let hosted = VideoNavigation(
            shell: URL(string: "https://tadayo.app/")!, post: policy.post)
        #expect(
            hosted.decide(.init(url: URL(string: "https://tadayo.app/"), mainFrame: true)) == .allow
        )
        #expect(
            hosted.decide(.init(url: URL(string: "https://tadayo.app/x"), mainFrame: true))
                == .ask(URL(string: "https://tadayo.app/x")!))
        #expect(hosted.decide(.init(url: URL(string: "about:blank"), mainFrame: true)) == .stop)
    }

    /// The player's own page, a login, the original: none replaces the shell; each is asked.
    @Test(arguments: [
        "https://www.tiktok.com/player/v1/123", "https://www.tiktok.com/login",
        "https://www.tiktok.com/@a/video/123", "https://example.com/",
        "https://apps.apple.com/app/id1",
    ])
    func anHTTPSAddressInThePageIsAsked(url: String) {
        #expect(page(url) == .ask(URL(string: url)!))
    }

    @Test(arguments: [
        "http://www.tiktok.com/@a/video/123", "snssdk1233://aweme/detail/123",
        "tiktok://video/123", "itms-apps://apps.apple.com/app/id1", "javascript:alert(1)",
        "data:text/html,<p>x</p>", "file:///etc/hosts", "about:srcdoc", "tel:5550100",
        "https:///nohost", "https://user@example.com/",
    ])
    func anyOtherSchemeInThePageIsStoppedWithNothingAsked(url: String) {
        #expect(page(url) == .stop)
    }

    @Test func aNewWindowIsNeverOpened() {
        let https = URL(string: "https://www.tiktok.com/@a/video/123")!
        #expect(policy.decide(.init(url: https, mainFrame: false, newWindow: true)) == .ask(https))
        #expect(policy.decide(.init(url: https, mainFrame: true, newWindow: true)) == .ask(https))
        // Even the shell's own address: a new window is never the shell.
        #expect(policy.decide(.init(url: shell, mainFrame: true, newWindow: true)) == .stop)
        #expect(
            policy.decide(
                .init(url: URL(string: "tiktok://video/123"), mainFrame: false, newWindow: true))
                == .stop)
        #expect(policy.decide(.init(url: nil, mainFrame: false, newWindow: true)) == .stop)
    }

    @Test func aFrameLoadsThisPostsPlayerOrAnEmptyDocument() {
        #expect(frame("https://www.tiktok.com/player/v1/123?autoplay=0&rel=0") == .allow)
        #expect(frame("https://www.tiktok.com/player/v1/123") == .allow)
        #expect(frame("about:blank") == .allow)
        #expect(frame("about:srcdoc") == .allow)
    }

    @Test(arguments: [
        "https://www.tiktok.com/player/v1/124", "https://www.tiktok.com/player/v1/123/x",
        "https://www.tiktok.com/player/v1/", "https://www.tiktok.com/login",
        "https://www.tiktok.com/embed/v2/123", "https://tiktok.com/player/v1/123",
        "https://m.tiktok.com/player/v1/123", "http://www.tiktok.com/player/v1/123",
        "https://www.tiktok.com:8443/player/v1/123", "https://u@www.tiktok.com/player/v1/123",
        "https://www.tiktok.com.example.com/player/v1/123", "https://example.com/player/v1/123",
        "https://www.tiktok.com/player/v1/%31%32%33", "about:config", "data:text/html,x",
        "javascript:1", "blob:https://www.tiktok.com/1", "file:///x",
    ])
    func anyOtherFrameIsStopped(url: String) {
        #expect(frame(url) == .stop)
    }

    @Test func aRequestWithNoAddressIsStopped() {
        #expect(policy.decide(.init(url: nil, mainFrame: true)) == .stop)
        #expect(policy.decide(.init(url: nil, mainFrame: false)) == .stop)
    }
}
