import UIKit
import XCTest

/// `ScreenSnapshot.settled`, which decides how many times a screen's image is drawn before it's
/// compared with its reference, and when the drawing alone fails the test. Each test draws plain
/// view controllers whose colour it chooses draw by draw, black and white so every pixel differs
/// by 255 in sRGB, and reads what `settled` gives, how many hosts it made and the line it logged:
/// every way the drawing can end, the failures among them.
@MainActor
final class ScreenSnapshotSettleTests: XCTestCase {
    private struct Settled {
        let drawn: ScreenSnapshot.Drawn?
        let problem: String?
        let made: Int
        let logged: [String]

        /// The settled image's size in pixels.
        var pixels: (width: Int, height: Int) {
            let image = drawn?.image
            return (
                Int((image?.size.width ?? 0) * (image?.scale ?? 0)),
                Int((image?.size.height ?? 0) * (image?.scale ?? 0))
            )
        }
    }

    /// Draws a host of `colours[n]` the nth time, the last colour once they run out.
    private func settle(_ name: String, _ colours: [UIColor]) -> Settled {
        var made = 0
        var logged: [String] = []
        let (drawn, problem) = ScreenSnapshot.settled(
            {
                let host = UIViewController()
                host.view.backgroundColor = colours[min(made, colours.count - 1)]
                made += 1
                return host
            }, variant: .light, width: 393, name: name, log: { logged.append($0) })
        return Settled(drawn: drawn, problem: problem, made: made, logged: logged)
    }

    /// What `difference` says of a draw in black against the last one in white, or the reverse:
    /// every pixel, by 255.
    private func everyPixel(_ settled: Settled) -> String {
        let (width, height) = settled.pixels
        return "\(width * height) pixels in x 0 to \(width - 1), y 0 to \(height - 1), "
            + "by at most 255/255"
    }

    func testTwoDrawsTheSameSettleAtTheSecondAndLogNothing() {
        let settled = settle("settle-same", [.black])
        XCTAssertNotNil(settled.drawn)
        XCTAssertNil(settled.problem)
        XCTAssertEqual(settled.made, 2)
        XCTAssertEqual(settled.logged, [])
        XCTAssertEqual(settled.pixels.width, 786)
        XCTAssertEqual(settled.pixels.height, 1704)
    }

    func testAnOddFirstDrawPassesAtTheThirdAndIsLoggedWithItsDifference() {
        let settled = settle("settle-odd-first", [.white, .black])
        XCTAssertNotNil(settled.drawn)
        XCTAssertNil(settled.problem)
        XCTAssertEqual(settled.made, 3)
        XCTAssertEqual(settled.logged.count, 1)
        let line = settled.logged.first ?? ""
        XCTAssertTrue(
            line.hasPrefix(
                "warning: ScreenSnapshot settle-odd-first: settled after 3 draws, SHA-256 "),
            line)
        XCTAssertTrue(
            line.hasSuffix("; against the last draw, draw 1: \(everyPixel(settled))"), line)
    }

    /// The worst case one odd draw can make, the odd one second: settled at the fourth, the most.
    func testAnOddSecondDrawPassesAtTheFourth() {
        let settled = settle("settle-odd-second", [.black, .white, .black])
        XCTAssertNotNil(settled.drawn)
        XCTAssertNil(settled.problem)
        XCTAssertEqual(settled.made, 4)
        XCTAssertEqual(settled.logged.count, 1)
        let line = settled.logged.first ?? ""
        XCTAssertTrue(
            line.hasPrefix("warning: ScreenSnapshot settle-odd-second: settled after 4 draws, "),
            line)
        XCTAssertTrue(
            line.hasSuffix("; against the last draw, draw 2: \(everyPixel(settled))"), line)
    }

    func testTwoOddDrawsFail() {
        let settled = settle("settle-two-odd", [.white, .gray, .black])
        XCTAssertEqual(
            settled.problem, "2 draws differed from the image it settled on, where one may")
        XCTAssertEqual(settled.made, 4)
        XCTAssertEqual(settled.logged.count, 1)
        let line = settled.logged.first ?? ""
        XCTAssertTrue(
            line.hasPrefix("warning: ScreenSnapshot settle-two-odd: settled after 4 draws, "), line)
        XCTAssertTrue(
            line.contains("; against the last draw, draw 1: \(everyPixel(settled)); draw 2: "),
            line)
    }

    func testAScreenThatNeverDrawsTheSameTwiceInARowFails() {
        let settled = settle("settle-never", [.black, .white, .black, .white])
        XCTAssertEqual(settled.problem, "no two draws in a row were the same in 4 draws")
        XCTAssertEqual(settled.made, ScreenSnapshot.maximumDraws)
        XCTAssertEqual(settled.logged.count, 1)
        let line = settled.logged.first ?? ""
        XCTAssertTrue(
            line.hasPrefix("warning: ScreenSnapshot settle-never: didn't settle in 4 draws, "),
            line)
        XCTAssertTrue(
            line.hasSuffix(
                "; against the last draw, draw 1: \(everyPixel(settled)); draw 3: "
                    + everyPixel(settled)),
            line)
    }
}
