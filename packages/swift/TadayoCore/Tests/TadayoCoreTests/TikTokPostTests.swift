import Foundation
import Testing

@testable import TadayoCore

/// A TikTok link read as a post (`TikTokPost`; TECH-DESIGN sections 1 and 5): only the full form
/// on TikTok's own hosts, with an id that can't change the player's address.
@Suite struct TikTokPostTests {
    @Test func theFullLinkGivesThePlayerAndTheOriginal() throws {
        let post = try #require(
            TikTokPost(link: "https://www.tiktok.com/@scout2015/video/6718335390845095173"))
        #expect(post.id == "6718335390845095173")
        #expect(post.author == "scout2015")
        #expect(
            post.player.absoluteString
                == "https://www.tiktok.com/player/v1/6718335390845095173?autoplay=0&rel=0")
        #expect(
            post.original.absoluteString
                == "https://www.tiktok.com/@scout2015/video/6718335390845095173")
    }

    /// What a share sheet adds is dropped, and the host's other spellings are the same post.
    @Test func aSharedLinkLosesItsQuery() throws {
        let links = [
            "  https://www.tiktok.com/@a.b_c/video/123?is_from_webapp=1&sender_device=pc#x \n",
            "https://tiktok.com/@a.b_c/video/123/",
            "https://m.tiktok.com/@a.b_c/video/123",
            "https://WWW.TIKTOK.COM/@a.b_c/video/123",
        ]
        for link in links {
            let post = try #require(TikTokPost(link: link), "\(link)")
            #expect(post.original.absoluteString == "https://www.tiktok.com/@a.b_c/video/123")
            #expect(
                post.player.absoluteString
                    == "https://www.tiktok.com/player/v1/123?autoplay=0&rel=0")
        }
    }

    @Test(arguments: [
        "",
        "6718335390845095173",
        "http://www.tiktok.com/@a/video/1",
        "tiktok://www.tiktok.com/@a/video/1",
        "https://www.tiktok.com.example.com/@a/video/1",
        "https://example.com/@a/video/1",
        "https://www.tiktok.com@example.com/@a/video/1",
        "https://user:pw@www.tiktok.com/@a/video/1",
        "https://www.tiktok.com:8443/@a/video/1",
        "https://vm.tiktok.com/ZMabc123/",
        "https://vt.tiktok.com/ZSabc123/",
        "https://www.tiktok.com/t/ZTabc123/",
        "https://www.tiktok.com/@a/video/",
        "https://www.tiktok.com/@a/video/12a",
        "https://www.tiktok.com/@a/video/1%32",
        "https://www.tiktok.com/@a/video/1/extra",
        "https://www.tiktok.com/@a/video/1?x=1/../../login",
        "https://www.tiktok.com/a/video/1",
        "https://www.tiktok.com/@/video/1",
        "https://www.tiktok.com/@a%2Fb/video/1",
        "https://www.tiktok.com/@a/photo/1",
        "https://www.tiktok.com//@a/video/1",
        "https://www.tiktok.com/@a/video/123456789012345678901234567890123",
        "https://www.tiktok.com/@a/video/١٢٣",
    ])
    func anythingElseIsNoPost(link: String) {
        if link == "https://www.tiktok.com/@a/video/1?x=1/../../login" {
            // A query is dropped, whatever it holds: the post is still post 1.
            #expect(TikTokPost(link: link)?.player.path == "/player/v1/1")
        } else {
            #expect(TikTokPost(link: link) == nil, "\(link)")
        }
    }
}
