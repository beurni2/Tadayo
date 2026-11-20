import Foundation

/// One TikTok post, read from its link (docs/TECH-DESIGN.md section 5: `tiktok.com/@user/video/<id>`),
/// with the two addresses the viewer needs: the official Embed Player's (TECH-DESIGN section 1:
/// `https://www.tiktok.com/player/v1/{post_id}`) and the original's, for Open original (T39).
///
/// Spike S3 reads only the full form. The short forms (`vm.tiktok.com`, `vt.tiktok.com`,
/// `www.tiktok.com/t/`) redirect, and following a redirect is the server's work when a link is
/// added (B7), so a short link is no post here.
public struct TikTokPost: Sendable, Equatable {
    /// The host the player and the original are served from, and the only origin a player's
    /// message may come from (`PlayerMessage.read`).
    public static let host = "www.tiktok.com"
    public static let origin = "https://www.tiktok.com"

    /// The post's id: decimal digits only, so it can't change the player's path or add a query.
    public let id: String
    /// The author's name as the link gave it, without its "@".
    public let author: String

    /// Reads `https://www.tiktok.com/@<author>/video/<id>`, with or without `www.` or `m.`, a
    /// trailing slash, a query and a fragment. Anything else is no post: another scheme or host,
    /// a port, a user, more or fewer path parts, an id that isn't 1 to 32 ASCII digits, or an
    /// author with a character TikTok's names don't use (letters, digits, "." and "_").
    public init?(link: String) {
        let trimmed = link.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parts = URLComponents(string: trimmed), parts.scheme == "https",
            parts.user == nil, parts.password == nil, parts.port == nil,
            let host = parts.host?.lowercased(),
            ["www.tiktok.com", "tiktok.com", "m.tiktok.com"].contains(host)
        else { return nil }
        var path = parts.percentEncodedPath.split(separator: "/", omittingEmptySubsequences: false)
        guard path.first == "" else { return nil }
        path.removeFirst()
        if path.last == "" { path.removeLast() }
        guard path.count == 3, path[1] == "video", path[0].hasPrefix("@") else { return nil }
        let author = String(path[0].dropFirst())
        let id = String(path[2])
        guard (1...32).contains(id.utf8.count), id.utf8.allSatisfy({ (0x30...0x39).contains($0) }),
            (1...64).contains(author.utf8.count), author.utf8.allSatisfy(Self.isNameByte)
        else { return nil }
        self.id = id
        self.author = author
    }

    private static func isNameByte(_ byte: UInt8) -> Bool {
        switch byte {
        case 0x30...0x39, 0x41...0x5A, 0x61...0x7A, 0x2E, 0x5F: true
        default: false
        }
    }

    /// The Embed Player's address with TikTok's documented options (TECH-DESIGN section 5: "no
    /// autoplay, and `rel=0`, which limits suggestions to the author's videos without removing
    /// them"). Nothing else is asked of the player, and nothing is claimed about what it shows
    /// (T39).
    public var player: URL {
        URL(string: "\(Self.origin)/player/v1/\(id)?autoplay=0&rel=0")!
    }

    /// The original's address, rebuilt from the author and the id alone, so nothing a share
    /// sheet added to the link (its query) is carried along.
    public var original: URL {
        URL(string: "\(Self.origin)/@\(author)/video/\(id)")!
    }
}
