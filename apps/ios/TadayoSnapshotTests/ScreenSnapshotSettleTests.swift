import SnapshotTesting
import SwiftUI
import TadayoCore
import UIKit
import XCTest

@testable import Tadayo

/// `ScreenSnapshot.settled`, which decides how many times a screen's image is drawn before it's
/// compared with its reference, and when the drawing alone fails the test. Each test draws plain
/// view controllers it paints draw by draw, black and white so a pixel that differs differs by
/// 255 in sRGB, and reads what `settled` gives, how many hosts it made and the line it logged:
/// every way the drawing can end, the failures among them (but "no draw was made", which a
/// `maximumDraws` of 1 or more can't reach). Three stand in for the draw itself: to give no
/// image, an image with no PNG, and images drawn pixel by pixel, for where a difference is.
///
/// The founder's glass allowance (`docs/plans/ios-b1-intermittents.md`, row 2) is tested the same
/// way, with where the glass buttons are given (`glass`) and images made from their bytes, grey
/// level by grey level, so its edges are exact: inside the glass and by at most 26, the same;
/// by 27, or by 1 a pixel outside it, odd as before. Then `glassMatched`, which compares such an
/// image as its reference; `referenceURL`, where that reference is; and, drawing real bars,
/// where `glassButtons` finds the glass: a pushed screen's back button, and not the bar's own
/// blur or the tab bar.
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

    /// Settles hosts painted by `paints[n]` the nth time, the last once they run out, with
    /// `glass` as where each host drew the glass buttons, if it's given.
    private func settle(
        _ name: String, _ paints: [Paint], drawing: ((UIViewController) -> UIImage?)? = nil,
        glass: [ScreenSnapshot.PixelRect]? = nil
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
            drawing: drawing, glass: glass.map { rects in { (_: UIViewController) in rects } })
        return Settled(drawn: drawn, problem: problem, hosts: hosts, logged: logged)
    }

    /// Settles draws that give `images[n]` the nth time, the last once they run out, with the
    /// glass buttons at `glass`.
    private func settle(
        _ name: String, images: [UIImage?], glass: [ScreenSnapshot.PixelRect]
    ) -> Settled {
        var draws = 0
        return settle(
            name, [plain(.black)],
            drawing: { _ in
                defer { draws += 1 }
                return images[min(draws, images.count - 1)]
            }, glass: glass)
    }

    /// A glass button, 40 by 20 pixels, and a pixel just beside it; and a patch elsewhere, away
    /// from the middle `assertTheLastBlackHostsImage` reads.
    private let button = ScreenSnapshot.PixelRect(left: 20, top: 20, right: 59, bottom: 39)
    private let besideButton = ScreenSnapshot.PixelRect(left: 60, top: 20, right: 60, bottom: 20)
    private let elsewhere = ScreenSnapshot.PixelRect(left: 120, top: 140, right: 139, bottom: 159)

    /// What the lines say of a difference all over `button`, by `level`.
    private func overButton(by level: Int) -> String {
        "800 pixels in x 20 to 59, y 20 to 39, by at most \(level)/255"
    }

    /// An image 200 by 200 pixels at 2x, black but for each patch, filled with its grey level,
    /// the later patch where two overlap: made from its bytes, in sRGB, so each pixel is exactly
    /// the level asked for. Nil only if Core Graphics can't make it, which the test then says.
    private func pixels(_ patches: [(ScreenSnapshot.PixelRect, UInt8)] = []) -> UIImage? {
        let side = 200
        var bytes = [UInt8](repeating: 0, count: side * side * 4)
        for y in 0..<side {
            for x in 0..<side {
                let level = patches.last(where: { $0.0.contains(x: x, y: y) })?.1 ?? 0
                let start = (y * side + x) * 4
                bytes[start] = level
                bytes[start + 1] = level
                bytes[start + 2] = level
                bytes[start + 3] = 255
            }
        }
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
            let provider = CGDataProvider(data: Data(bytes) as CFData),
            let image = CGImage(
                width: side, height: side, bitsPerComponent: 8, bitsPerPixel: 32,
                bytesPerRow: side * 4, space: space,
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
        else { return nil }
        return UIImage(cgImage: image, scale: 2, orientation: .up)
    }

    /// A drawn image as `settled` gives it, with the glass buttons at `glass`.
    private func asDrawn(
        _ image: UIImage?, glass: [ScreenSnapshot.PixelRect]
    ) -> ScreenSnapshot.Drawn? {
        guard let image, let png = image.pngData() else { return nil }
        return ScreenSnapshot.Drawn(image: image, host: UIViewController(), png: png, glass: glass)
    }

    /// What `settled` gives for `view` drawn for real in `variant`, as `assert` draws a screen.
    private func hosted(
        _ view: some View, in variant: ScreenSnapshot.Variant = .light, name: String
    ) -> Settled {
        var hosts: [UIViewController] = []
        var logged: [String] = []
        let screen = ScreenSnapshot.shown(view, in: variant)
        let (drawn, problem) = ScreenSnapshot.settled(
            {
                let host = FramedHost(rootView: screen)
                hosts.append(host)
                return host
            }, variant: variant, width: 393, name: name, log: { logged.append($0) })
        return Settled(drawn: drawn, problem: problem, hosts: hosts, logged: logged)
    }

    /// Whether one of `glass` holds the whole of `drift`.
    private func holds(_ glass: [ScreenSnapshot.PixelRect]?, _ drift: ScreenSnapshot.PixelRect)
        -> Bool
    {
        (glass ?? []).contains {
            $0.left <= drift.left && $0.top <= drift.top && $0.right >= drift.right
                && $0.bottom >= drift.bottom
        }
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
        guard let image = settled.drawn?.image.cgImage else { return [] }
        return pixel(of: image, x: image.width / 2, y: image.height / 2)
    }

    /// The pixel at `x`, `y` from the top left of `image`, RGBA in sRGB.
    private func pixel(of image: CGImage, x: Int, y: Int) -> [UInt8] {
        guard let space = CGColorSpace(name: CGColorSpace.sRGB) else { return [] }
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
                    x: -x, y: y + 1 - image.height, width: image.width, height: image.height))
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

    func testTheGlassAllowanceIsTheFoundersTwentySix() {
        XCTAssertEqual(ScreenSnapshot.glassTolerance, 26)
    }

    func testDrawsThatDifferOnlyInsideTheGlassByTwentySixSettleAtTheSecond() {
        let settled = settle(
            "settle-glass", images: [pixels([(button, 26)]), pixels()], glass: [button])
        XCTAssertNil(settled.problem)
        XCTAssertEqual(settled.made, 2)
        XCTAssertEqual(
            settled.logged,
            [
                "warning: glass settle-glass: draw 1 differs from the last only inside the "
                    + "system's glass buttons, \(overButton(by: 26)), so it counts as the same"
            ])
        XCTAssertEqual(settled.drawn?.glass, [button])
        assertTheLastBlackHostsImage(settled)
    }

    /// Two PNGs whose pixels are all the same aren't a glass drift: `settled` tells them apart by
    /// their bytes, with or without glass, as before.
    func testPixelsThatAreAllTheSameAreNoGlassDrift() {
        guard let png = pixels([(button, 26)])?.pngData() else {
            return XCTFail("the image couldn't be made")
        }
        XCTAssertNil(ScreenSnapshot.glassDrift(png, png, glass: [button]))
        XCTAssertEqual(ScreenSnapshot.difference(png, png), "no pixel differs")
    }

    func testAGlassDifferenceOfTwentySevenIsAnOddDraw() {
        let settled = settle(
            "settle-glass-27", images: [pixels([(button, 27)]), pixels()], glass: [button])
        XCTAssertNil(settled.problem)
        XCTAssertEqual(settled.made, 3)
        XCTAssertEqual(settled.logged.count, 1)
        let line = settled.logged.first ?? ""
        XCTAssertTrue(
            line.hasPrefix("warning: ScreenSnapshot settle-glass-27: settled after 3 draws, "),
            line)
        XCTAssertTrue(
            line.hasSuffix("; against the last draw, draw 1: \(overButton(by: 27))"), line)
        assertTheLastBlackHostsImage(settled)
    }

    func testOnePixelOutsideTheGlassMakesTheDrawOdd() {
        let settled = settle(
            "settle-glass-beside", images: [pixels([(button, 10), (besideButton, 1)]), pixels()],
            glass: [button])
        XCTAssertNil(settled.problem)
        XCTAssertEqual(settled.made, 3)
        XCTAssertEqual(settled.logged.count, 1)
        let line = settled.logged.first ?? ""
        XCTAssertTrue(
            line.hasPrefix("warning: ScreenSnapshot settle-glass-beside: settled after 3 draws, "),
            line)
        XCTAssertTrue(
            line.hasSuffix(
                "; against the last draw, draw 1: 801 pixels in x 20 to 60, y 20 to 39, "
                    + "by at most 10/255"),
            line)
    }

    /// An odd draw and then a glass one: with the glass where it is, the glass draw isn't odd and
    /// the drawing passes at the third; with no glass, both are odd, and it fails at the fourth.
    func testAnOddDrawBesideAGlassDrawPassesWhereTwoOddDrawsFail() {
        let images = [pixels([(elsewhere, 255)]), pixels([(button, 26)]), pixels()]
        let glass = settle("settle-glass-and-odd", images: images, glass: [button])
        XCTAssertNil(glass.problem)
        XCTAssertEqual(glass.made, 3)
        XCTAssertEqual(glass.logged.count, 2)
        XCTAssertEqual(
            glass.logged.first,
            "warning: glass settle-glass-and-odd: draw 2 differs from the last only inside the "
                + "system's glass buttons, \(overButton(by: 26)), so it counts as the same")
        let line = glass.logged.last ?? ""
        XCTAssertTrue(
            line.hasPrefix(
                "warning: ScreenSnapshot settle-glass-and-odd: settled after 3 draws, "),
            line)
        XCTAssertTrue(
            line.hasSuffix(
                "; against the last draw, draw 1: 400 pixels in x 120 to 139, y 140 to 159, "
                    + "by at most 255/255; draw 2: \(overButton(by: 26))"),
            line)
        assertTheLastBlackHostsImage(glass)

        let none = settle("settle-no-glass", images: images, glass: [])
        XCTAssertEqual(
            none.problem, "2 draws differed from the image it settled on, where one may")
        XCTAssertEqual(none.made, 4)
        XCTAssertEqual(none.logged.count, 1)
    }

    func testAnImageThatDiffersFromItsReferenceOnlyInTheGlassIsComparedAsItsReference() {
        guard let drawn = asDrawn(pixels(), glass: [button]),
            let reference = pixels([(button, 26)])?.pngData()
        else { return XCTFail("the images couldn't be made") }
        var logged: [String] = []
        let image = ScreenSnapshot.glassMatched(
            drawn, reference: reference, scale: 2, name: "glass-reference",
            log: { logged.append($0) })
        XCTAssertFalse(image === drawn.image)
        XCTAssertEqual(image.scale, 2)
        XCTAssertEqual(image.size, drawn.image.size)
        let inside = image.cgImage.map { pixel(of: $0, x: 20, y: 20) }
        let beside = image.cgImage.map { pixel(of: $0, x: 60, y: 20) }
        XCTAssertEqual(inside, [26, 26, 26, 255])
        XCTAssertEqual(beside, [0, 0, 0, 255])
        XCTAssertEqual(
            logged,
            [
                "warning: glass glass-reference: differs from its reference only inside the "
                    + "system's glass buttons, \(overButton(by: 26)), so it's compared as its "
                    + "reference"
            ])
    }

    /// Any other image is compared as drawn, and nothing is logged: with no reference, the same
    /// as it, by 27 inside the glass, by 1 a pixel outside it, or with no glass drawn.
    func testAnImageThatDiffersFromItsReferenceAnyOtherWayIsComparedAsDrawn() {
        let cases: [(String, Data?, [ScreenSnapshot.PixelRect])] = [
            ("none", nil, [button]),
            ("same", pixels()?.pngData(), [button]),
            ("27", pixels([(button, 27)])?.pngData(), [button]),
            ("beside", pixels([(button, 10), (besideButton, 1)])?.pngData(), [button]),
            ("no glass", pixels([(button, 10)])?.pngData(), []),
        ]
        for (label, reference, glass) in cases {
            guard let drawn = asDrawn(pixels(), glass: glass) else {
                return XCTFail("the image couldn't be made")
            }
            if label != "none" { XCTAssertNotNil(reference, label) }
            var logged: [String] = []
            let image = ScreenSnapshot.glassMatched(
                drawn, reference: reference, scale: 2, name: "glass-\(label)",
                log: { logged.append($0) })
            XCTAssertTrue(image === drawn.image, label)
            XCTAssertEqual(logged, [], label)
        }
    }

    /// Through SnapshotTesting's own comparison, as `assert` makes it, against a reference on
    /// disk: an image 26 apart from it inside the glass passes once `glassMatched` has given the
    /// reference's image, where the same image as drawn fails; 27 apart, `glassMatched` gives the
    /// drawn image, which fails.
    func testTheComparisonPassesTwentySixInsideTheGlassAndFailsTwentySeven() throws {
        let folder = FileManager.default.temporaryDirectory
            .appendingPathComponent("glass-comparison-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let reference = try XCTUnwrap(pixels()?.pngData())
        try reference.write(to: folder.appendingPathComponent("glassComparison.reference.png"))
        func compared(_ image: UIImage) -> String? {
            verifySnapshot(
                of: image, as: .image(precision: 1, perceptualPrecision: 0.98, scale: 2),
                named: "reference", record: .never, snapshotDirectory: folder.path,
                testName: "glassComparison")
        }
        let drawn26 = try XCTUnwrap(asDrawn(pixels([(button, 26)]), glass: [button]))
        let drawn27 = try XCTUnwrap(asDrawn(pixels([(button, 27)]), glass: [button]))
        let matched26 = ScreenSnapshot.glassMatched(
            drawn26, reference: reference, scale: 2, name: "glass-26", log: { _ in })
        let matched27 = ScreenSnapshot.glassMatched(
            drawn27, reference: reference, scale: 2, name: "glass-27", log: { _ in })
        XCTAssertNil(compared(matched26))
        XCTAssertNotNil(compared(drawn26.image))
        XCTAssertTrue(matched27 === drawn27.image)
        XCTAssertNotNil(compared(matched27))
    }

    /// The reference `glassMatched` reads is the one `assertSnapshot` compares with: A02-age's
    /// largest text, beside `SignInSnapshotTests`; and a name is made a path's part as the
    /// library makes it.
    func testTheReferenceIsTheOneSnapshotTestingComparesWith() {
        let here = URL(fileURLWithPath: "\(#filePath)", isDirectory: false)
        let signIn = here.deletingLastPathComponent()
            .appendingPathComponent("SignInSnapshotTests.swift").path
        let reference = ScreenSnapshot.referenceURL(
            file: signIn, testName: "testA02Age()", name: "A02-age-xl")
        XCTAssertEqual(
            Array(reference.pathComponents.suffix(3)),
            ["__Snapshots__", "SignInSnapshotTests", "testA02Age.A02-age-xl.png"])
        XCTAssertTrue(FileManager.default.fileExists(atPath: reference.path), reference.path)
        XCTAssertEqual(
            ScreenSnapshot.referenceURL(file: signIn, testName: "test (a) b()", name: ".x y.")
                .lastPathComponent,
            "test-a-b.x-y.png")
    }

    /// A pushed screen's back button is where the probe found its glass on iOS 27.2, at 16, 62
    /// points, 44 by 44 (`ios/b1-glass-probe`, `14bc1fc`: x 32, y 124, 88 by 88 pixels), grown by
    /// `glassMargin`; and it's the only glass.
    func testAPushedScreensBackButtonIsTheGlass() {
        let settled = hosted(
            NavigationStack(path: .constant([1])) {
                Color.white.navigationDestination(for: Int.self) { _ in Color.white }
            }, name: "glass-back")
        XCTAssertNil(settled.problem)
        XCTAssertEqual(
            settled.drawn?.glass,
            [ScreenSnapshot.PixelRect(left: 28, top: 120, right: 123, bottom: 215)])
    }

    /// A glass layer's frame in points becomes whole pixels at the scale, out to the pixels it
    /// touches, then grown by `glassMargin`: at 2x, 16.25 to 60.75 by 62.5 to 106.75 points is
    /// x 32 to 121, y 125 to 213 in pixels, and grown by 4, x 28 to 125, y 121 to 217.
    func testAGlassButtonIsItsFrameInWholePixelsGrownByTheMargin() {
        XCTAssertEqual(ScreenSnapshot.glassMargin, 4)
        XCTAssertEqual(
            ScreenSnapshot.glassButton(
                CGRect(x: 16.25, y: 62.5, width: 44.5, height: 44.25), scale: 2),
            ScreenSnapshot.PixelRect(left: 28, top: 121, right: 125, bottom: 217))
        XCTAssertEqual(
            ScreenSnapshot.glassButton(CGRect(x: 16, y: 62, width: 44, height: 44), scale: 3),
            ScreenSnapshot.PixelRect(left: 44, top: 182, right: 183, bottom: 321))
    }

    /// A glass layer larger than a bar's button, 200 by 60 points, or empty, isn't a glass button,
    /// so no allowance reaches it.
    func testAGlassLayerLargerThanABarsButtonIsNotAGlassButton() {
        XCTAssertEqual(ScreenSnapshot.glassButtonLargest, CGSize(width: 200, height: 60))
        XCTAssertNotNil(
            ScreenSnapshot.glassButton(CGRect(x: 0, y: 0, width: 200, height: 60), scale: 2))
        XCTAssertNil(
            ScreenSnapshot.glassButton(CGRect(x: 0, y: 0, width: 200.5, height: 44), scale: 2))
        XCTAssertNil(
            ScreenSnapshot.glassButton(CGRect(x: 0, y: 0, width: 44, height: 60.5), scale: 2))
        XCTAssertNil(ScreenSnapshot.glassButton(.zero, scale: 2))
    }

    /// The glass `glassButtons` finds holds every drift of the bars' glass buttons the logs show,
    /// up to 2026-11-25: the back button's (x 30 to 121, y 123 to 212, in `A02-code-error` and
    /// others), and Leave sign-in's on A02-age, the 26 the founder's answer allows at the largest
    /// text among them (x 30 to 305, y 123 to 214; and x 30 to 348, y 122 to 213 at the largest
    /// text, `A02-age-failed-network-xl` and `A02-age-refused-xl`).
    func testTheGlassHoldsEveryGlassButtonDriftTheLogsShow() {
        let back = hosted(
            NavigationStack(path: .constant([1])) {
                Color.white.navigationDestination(for: Int.self) { _ in Color.white }
            }, name: "glass-back-drift")
        XCTAssertTrue(
            holds(back.drawn?.glass, .init(left: 30, top: 123, right: 121, bottom: 212)),
            "\(String(describing: back.drawn?.glass))")
        let age = ProfileModel(
            account: Account(
                id: "ben", displayName: nil, avatarVersion: nil, ageConfirmed: false, version: 0),
            accounts: ScriptedAccounts(updates: []), saved: { _ in }, signedOut: {})
        let light = hosted(AgeScreen(model: age, leave: {}), name: "glass-age")
        XCTAssertNil(light.problem)
        XCTAssertEqual(
            light.drawn?.glass, [.init(left: 28, top: 120, right: 307, bottom: 215)],
            "Leave sign-in's glass, at x 32, y 124, 272 by 88 pixels in the probe, grown by 4")
        XCTAssertTrue(
            holds(light.drawn?.glass, .init(left: 30, top: 123, right: 305, bottom: 214)),
            "\(String(describing: light.drawn?.glass))")
        let largest = hosted(AgeScreen(model: age, leave: {}), in: .xl, name: "glass-age-xl")
        XCTAssertNil(largest.problem)
        print("glass: AgeScreen at the largest text: \(String(describing: largest.drawn?.glass))")
        XCTAssertEqual(largest.drawn?.glass.count, 1, "only Leave sign-in")
        XCTAssertTrue(
            holds(largest.drawn?.glass, .init(left: 30, top: 122, right: 348, bottom: 213)),
            "\(String(describing: largest.drawn?.glass))")
    }

    /// The bar's own blur, behind a screen with no buttons, and the tab bar, which draws its
    /// glass otherwise, aren't the glass buttons: a difference there counts in full.
    func testTheBarsBlurAndTheTabBarAreNotTheGlass() {
        let bar = hosted(NavigationStack { Color.white }, name: "glass-bar")
        XCTAssertNil(bar.problem)
        XCTAssertEqual(bar.drawn?.glass, [])
        let tabs = hosted(
            TabView {
                Color.white.tabItem { Label("One", systemImage: "circle") }
                Color.white.tabItem { Label("Two", systemImage: "square") }
            }, name: "glass-tabs")
        XCTAssertNil(tabs.problem)
        XCTAssertEqual(tabs.drawn?.glass, [])
    }
}
