import XCTest

@testable import Tadayo

/// Spike S6's record in the Lab (`OpenedLinks`): what kind of link opened the app and which way
/// it came, and never the link or its token (T7, T52).
@MainActor
final class LabLinkSpikeTests: XCTestCase {
    /// 43 base64url characters, the shortest token the contract allows.
    private let token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE"

    private func url(_ text: String) -> URL { URL(string: text)! }

    func testAnInvitationLinkIsAnInvitationWhoseTokenWasRead() {
        XCTAssertEqual(OpenedLinks.Kind(url: url("https://tadayo.app/i#\(token)")), .invitation)
        XCTAssertEqual(OpenedLinks.Kind(url: url("HTTPS://Tadayo.App/i#\(token)")), .invitation)
    }

    func testATadayoLinkWithNoTokenIsNotAnInvitation() {
        XCTAssertEqual(OpenedLinks.Kind(url: url("https://tadayo.app/i")), .otherTadayo)
        XCTAssertEqual(OpenedLinks.Kind(url: url("https://tadayo.app/i#short")), .otherTadayo)
        XCTAssertEqual(OpenedLinks.Kind(url: url("https://tadayo.app/i?t=\(token)")), .otherTadayo)
        XCTAssertEqual(OpenedLinks.Kind(url: url("https://tadayo.app/privacy")), .otherTadayo)
    }

    func testALinkElsewhereIsElsewhere() {
        XCTAssertEqual(OpenedLinks.Kind(url: url("https://example.com/i#\(token)")), .elsewhere)
        XCTAssertEqual(
            OpenedLinks.Kind(url: url("https://tadayo.app.example.com/i#\(token)")), .elsewhere)
        XCTAssertEqual(OpenedLinks.Kind(url: url("tadayo:/i#\(token)")), .elsewhere)
    }

    func testEachReceiptKeepsItsKindAndWayAndNeverTheTokenOrTheLink() {
        let links = OpenedLinks()
        XCTAssertEqual(links.receipts, [])
        links.received(url("https://tadayo.app/i#\(token)"), way: .browsingActivity)
        links.received(url("https://tadayo.app/i#\(token)"), way: .openURL)
        XCTAssertEqual(
            links.receipts,
            [
                .init(kind: .invitation, way: .browsingActivity),
                .init(kind: .invitation, way: .openURL),
            ])
        XCTAssertEqual(
            links.receipts.map(\.summary),
            [
                "The browsing activity: an invitation link, its token read and not kept.",
                "onOpenURL: an invitation link, its token read and not kept.",
            ])
        for receipt in links.receipts {
            let held = [receipt.summary, String(describing: receipt), String(reflecting: receipt)]
            for text in held {
                XCTAssertFalse(text.contains(token), text)
                XCTAssertFalse(text.contains("tadayo.app/i"), text)
            }
        }
    }

    func testTheOtherKindsSayWhatTheyWere() {
        let links = OpenedLinks()
        links.received(url("https://tadayo.app/i"), way: .openURL)
        links.received(url("https://example.com/"), way: .browsingActivity)
        XCTAssertEqual(
            links.receipts.map(\.summary),
            [
                "onOpenURL: a tadayo.app link with no invitation token.",
                "The browsing activity: a link to another address.",
            ])
    }

    func testOnlyTheLastTenAreKept() {
        let links = OpenedLinks()
        links.received(url("https://example.com/"), way: .openURL)
        for _ in 0..<OpenedLinks.kept {
            links.received(url("https://tadayo.app/i#\(token)"), way: .openURL)
        }
        XCTAssertEqual(links.receipts.count, 10)
        XCTAssertEqual(Set(links.receipts.map(\.kind)), [.invitation])
    }
}
