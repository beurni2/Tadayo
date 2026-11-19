import Foundation

/// What the viewer's web view may load, frame by frame (T39: "allowlisted hosts"; "Unexpected
/// top-level navigation is stopped, and the person is asked before leaving"; Q21: the web view
/// "cannot … navigate silently to arbitrary hosts"). Pure, so every rule is tested on Linux; the
/// app's navigation delegate only asks it.
public struct VideoNavigation: Sendable, Equatable {
    public enum Decision: Sendable, Equatable {
        /// Load it.
        case allow
        /// Don't load it, and say nothing.
        case stop
        /// Don't load it; ask the person whether to leave Tadayo for this address.
        case ask(URL)
    }

    /// One request to load a frame, as WebKit describes it.
    public struct Request: Sendable, Equatable {
        public var url: URL?
        /// The request is for the web view's own page, not a frame inside it.
        public var mainFrame: Bool
        /// The request asks for a new window (`target="_blank"`, `window.open`).
        public var newWindow: Bool

        public init(url: URL?, mainFrame: Bool, newWindow: Bool = false) {
            self.url = url
            self.mainFrame = mainFrame
            self.newWindow = newWindow
        }
    }

    /// The bundled shell's address as the web view reports it.
    public let shell: URL
    public let post: TikTokPost

    public init(shell: URL, post: TikTokPost) {
        self.shell = shell
        self.post = post
    }

    /// - The web view's own page is the shell and nothing else, ever. Any other top-level load,
    ///   and any new window, is stopped; when it is an `https` address the person is asked
    ///   before leaving, and any other scheme (an app's own, `itms-apps`, `javascript`, `data`,
    ///   `file`) is stopped with nothing asked, so no page can open another app on its own.
    /// - A frame inside the shell loads only this post's player at `https://www.tiktok.com`, or
    ///   an empty document (`about:blank`, `about:srcdoc`), which a player may make for itself.
    ///   Every other frame is stopped: another host, another TikTok page (its login), another
    ///   post.
    public func decide(_ request: Request) -> Decision {
        guard let url = request.url else { return .stop }
        if request.mainFrame && !request.newWindow {
            if url == shell { return .allow }
            return Self.leaving(to: url)
        }
        if request.newWindow { return Self.leaving(to: url) }
        if url.scheme == "about" {
            return ["about:blank", "about:srcdoc"].contains(url.absoluteString) ? .allow : .stop
        }
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
            parts.scheme == "https", parts.host == TikTokPost.host, parts.port == nil,
            parts.user == nil, parts.password == nil,
            parts.percentEncodedPath == "/player/v1/\(post.id)"
        else { return .stop }
        return .allow
    }

    private static func leaving(to url: URL) -> Decision {
        guard url.scheme == "https", let host = url.host, !host.isEmpty, url.user == nil,
            url.password == nil
        else { return .stop }
        return .ask(url)
    }
}
