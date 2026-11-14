import UIKit
import XCTest

/// `ScreenSnapshot.settled`, which decides how many times a screen's image is drawn before it's
/// compared with its reference, and when the drawing alone fails the test. Each test draws plain
/// view controllers it paints draw by draw, black and white so a pixel that differs differs by
/// 255 in sRGB, and reads what `settled` gives, how many hosts it made and the line it logged:
/// every way the drawing can end, the failures among them (but "no draw was made", which a
/// `maximumDraws` of 1 or more can't reach). Three stand in for the draw itself: to give no
/// image, an image with no PNG, and images drawn pixel by pixel, for where a difference is.
@MainActor
final class ScreenSnapshotSettleTests: XCTestCase {
    private struct Settled {
        let drawn: ScreenSnapshot.Drawn?
        let problem: String?
        let hosts: [UIViewController]
        let logged: [String]

        var made: Int { hosts.count }

        /// The settled image's size in pixels.
        var pixels: (width: Int, height: Int) {
            let image = drawn?.image
            return (
                Int((image?.size.width ?? 0) * (image?.scale ?? 0)),
                Int((image?.size.height ?? 0) * (image?.scale ?? 0))
            )
        }
    }

    private typealias Paint = (UIView) -> Void

    private func plain(_ colour: UIColor) -> Paint {
        { $0.backgroundColor = colour }
    }

    /// An image the size a draw gives, 393 by 852 points at 2x, in black, with `patch` in white:
    /// filled pixel by pixel, in sRGB.
    private func image(patch: CGRect? = nil) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        format.preferredRange = .standard
        let size = CGSize(width: 393, height: 852)
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.black.setFill()
            context.fill(CGRect(origin: .zero, size: size))
            if let patch {
                UIColor.white.setFill()
                context.fill(patch)
            }
        }
    }

    /// Settles hosts painted by `paints[n]` the nth time, the last once they run out.
    private func settle(
        _ name: String, _ paints: [Paint], drawing: ((UIViewController) -> UIImage?)? = nil
    ) -> Settled {
        var hosts: [UIViewController] = []
        var logged: [String] = []
        let (drawn, problem) = ScreenSnapshot.settled(
            {
                let host = UIViewController()
                paints[min(hosts.count, paints.count - 1)](host.view)
                hosts.append(host)
                return host
            }, variant: .light, width: 393, name: name, log: { logged.append($0) },
            drawing: drawing)
        return Settled(drawn: drawn, problem: problem, hosts: hosts, logged: logged)
    }

    /// What `difference` says of a draw in black against the last one in white, or the reverse:
    /// every pixel, by 255.
    private func everyPixel(_ settled: Settled) -> String {
        let (width, height) = settled.pixels
        return "\(width * height) pixels in x 0 to \(width - 1), y 0 to \(height - 1), "
            + "by at most 255/255"
    }

    /// The settled image's middle pixel, RGBA in sRGB.
    private func middle(_ settled: Settled) -> [UInt8] {
        guard let image = settled.drawn?.image.cgImage,
            let space = CGColorSpace(name: CGColorSpace.sRGB)
        else { return [] }
        var pixel = [UInt8](repeating: 0, count: 4)
        pixel.withUnsafeMutableBytes { buffer in
            guard
                let context = CGContext(
                    data: buffer.baseAddress, width: 1, height: 1, bitsPerComponent: 8,
                    bytesPerRow: 4, space: space,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return }
            context.draw(
                image,
                in: CGRect(
                    x: -(image.width / 2), y: -(image.height / 2), width: image.width,
                    height: image.height))
        }
        return pixel
    }

    /// The image given is the last host's, drawn black.
    private func assertTheLastBlackHostsImage(
        _ settled: Settled, file: StaticString = #filePath, line: UInt = #line
    ) {
        XCTAssertTrue(settled.drawn?.host === settled.hosts.last, file: file, line: line)
        XCTAssertEqual(middle(settled), [0, 0, 0, 255], file: file, line: line)
    }

    func testTwoDrawsTheSameSettleAtTheSecondAndLogNothing() {
        let settled = settle("settle-same", [plain(.black)])
        XCTAssertNil(settled.problem)
        XCTAssertEqual(settled.made, 2)
        XCTAssertEqual(settled.logged, [])
        XCTAssertEqual(settled.pixels.width, 786)
        XCTAssertEqual(settled.pixels.height, 1704)
        assertTheLastBlackHostsImage(settled)
    }

    func testAnOddFirstDrawPassesAtTheThirdAndIsLoggedWithItsDifference() {
        let settled = settle("settle-odd-first", [plain(.white), plain(.black)])
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
        assertTheLastBlackHostsImage(settled)
    }

    /// The worst case one odd draw can make, the odd one second: settled at the fourth, the most.
    func testAnOddSecondDrawPassesAtTheFourth() {
        let settled = settle("settle-odd-second", [plain(.black), plain(.white), plain(.black)])
        XCTAssertNil(settled.problem)
        XCTAssertEqual(settled.made, 4)
        XCTAssertEqual(settled.logged.count, 1)
        let line = settled.logged.first ?? ""
        XCTAssertTrue(
            line.hasPrefix("warning: ScreenSnapshot settle-odd-second: settled after 4 draws, "),
            line)
        XCTAssertTrue(
            line.hasSuffix("; against the last draw, draw 2: \(everyPixel(settled))"), line)
        assertTheLastBlackHostsImage(settled)
    }

    /// The line says where an odd draw differs, to the pixel: here a patch 10 by 20 points at
    /// (100, 200), 20 by 40 pixels at (200, 400), as a glass's bar would be. The images are
    /// filled pixel by pixel, through `drawing`, because a host's own draw on iOS 27.2 softens
    /// each edge of such a patch by a pixel: there the line said, rightly, 921 pixels in x 199
    /// to 220, y 399 to 440 (commit E's run, `ios` 43547875236).
    func testAnOddDrawsDifferenceIsMeasuredWhereItIs() {
        let patched = image(patch: CGRect(x: 100, y: 200, width: 10, height: 20))
        let black = image()
        var draws = 0
        let settled = settle("settle-patch", [plain(.black)]) { _ in
            draws += 1
            return draws == 1 ? patched : black
        }
        XCTAssertNil(settled.problem)
        XCTAssertEqual(settled.made, 3)
        XCTAssertEqual(settled.logged.count, 1)
        let line = settled.logged.first ?? ""
        XCTAssertTrue(
            line.hasSuffix(
                "; against the last draw, draw 1: 800 pixels in x 200 to 219, y 400 to 439, "
                    + "by at most 255/255"),
            line)
        assertTheLastBlackHostsImage(settled)
    }

    func testTwoOddDrawsFail() {
        let settled = settle("settle-two-odd", [plain(.white), plain(.gray), plain(.black)])
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
        let settled = settle(
            "settle-never", [plain(.black), plain(.white), plain(.black), plain(.white)])
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

    func testADrawThatGivesNoImageFailsThere() {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1)).image { context in
            UIColor.black.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
        }
        var draws = 0
        let settled = settle("settle-no-image", [plain(.black)]) { _ in
            draws += 1
            return draws == 1 ? image : nil
        }
        XCTAssertEqual(settled.problem, "draw 2 gave no image within 5.0 seconds")
        XCTAssertNil(settled.drawn)
        XCTAssertEqual(settled.made, 2)
        XCTAssertEqual(settled.logged, [])
    }

    func testADrawWithNoPNGFailsThere() {
        let settled = settle("settle-no-png", [plain(.black)]) { _ in UIImage() }
        XCTAssertEqual(settled.problem, "draw 1 couldn't be made a PNG")
        XCTAssertNil(settled.drawn)
        XCTAssertEqual(settled.made, 1)
        XCTAssertEqual(settled.logged, [])
    }
}
