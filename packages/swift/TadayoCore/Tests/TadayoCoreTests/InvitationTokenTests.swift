import Foundation
import Testing

@testable import TadayoCore

/// An invitation link is `https://tadayo.app/i#<token>` (the contract's `InvitationLink`), and its
/// token never shows in anything printed (T7, T52).
@Suite struct InvitationTokenTests {
    // The contract's own link (createInvitation's `link` example).
    let token = "q7Vb2xKp9LmN4wRt6YsA1cDe8FgH3jZu5oIi0nQvXkM"
    var link: String { "https://tadayo.app/i#\(token)" }

    @Test func theTokenIsTheLinksFragment() throws {
        #expect(try #require(InvitationToken(link: link)).secret == token)
        #expect(try #require(InvitationToken(url: URL(string: link)!)).secret == token)
    }

    @Test func aPastedLinkMayHaveSpacesAndLineBreaksAround() {
        #expect(InvitationToken(link: "  \(link)\n")?.secret == token)
        #expect(InvitationToken(link: "\t\(link) \r\n")?.secret == token)
    }

    @Test func theHostAndSchemeAreReadInAnyCase() {
        #expect(InvitationToken(link: "HTTPS://Tadayo.App/i#\(token)")?.secret == token)
    }

    @Test func anythingElseIsNoInvitation() {
        let others = [
            "http://tadayo.app/i#\(token)",
            "https://www.tadayo.app/i#\(token)",
            "https://tadayo.app.example.com/i#\(token)",
            "https://example.com/i#\(token)",
            "https://tadayo.app:443/i#\(token)",
            "https://someone@tadayo.app/i#\(token)",
            "https://tadayo.app/I#\(token)",
            "https://tadayo.app/i/#\(token)",
            "https://tadayo.app/x#\(token)",
            "https://tadayo.app/#\(token)",
            "https://tadayo.app/i?t=\(token)",
            "https://tadayo.app/i?#\(token)",
            "https://tadayo.app/i?t=1#\(token)",
            "https://tadayo.app/i",
            "https://tadayo.app/i#",
            "https://tadayo.app/i#\(token.dropLast(token.count - 42))",
            "https://tadayo.app/i#\(String(repeating: "a", count: 129))",
            "https://tadayo.app/i#\(token.dropLast())=",
            "https://tadayo.app/i#\(token.dropLast())+",
            "https://tadayo.app/i#\(token.dropLast())/",
            "https://tadayo.app/i#\(token.dropLast())%41",
            "tadayo.app/i#\(token)",
            "\(token)",
            "Join me: \(link)",
            "",
        ]
        for other in others {
            #expect(InvitationToken(link: other) == nil, "\(other)")
        }
    }

    @Test func aTokenIsFortyThreeToOneHundredTwentyEightBase64URLCharacters() {
        #expect(InvitationToken(secret: String(repeating: "a", count: 43)) != nil)
        #expect(InvitationToken(secret: String(repeating: "-", count: 128)) != nil)
        #expect(InvitationToken(secret: String(repeating: "_", count: 42)) == nil)
        #expect(InvitationToken(secret: String(repeating: "a", count: 129)) == nil)
        #expect(InvitationToken(secret: String(repeating: "é", count: 43)) == nil)
    }

    @Test func nothingPrintedHoldsTheToken() throws {
        let invitation = try #require(InvitationToken(link: link))
        let shared = InvitationLink(
            invitationID: "inv_kt_leila", candidateID: "cnd_kt_leila", url: URL(string: link),
            expiresAt: Date(timeIntervalSince1970: 1_794_580_860))
        for value in [
            invitation as Any, shared as Any, [invitation] as Any, Optional(shared) as Any,
        ] {
            var dumped = ""
            dump(value, to: &dumped)
            for text in [
                String(describing: value), String(reflecting: value), "\(value)", dumped,
            ] {
                #expect(!text.contains(token), "\(text)")
                #expect(!text.contains(token.prefix(8)), "\(text)")
            }
        }
    }
}
