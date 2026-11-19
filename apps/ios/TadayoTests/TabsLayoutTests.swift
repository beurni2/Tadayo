import SwiftUI
import TadayoCore
import TadayoDesign
import XCTest

@testable import Tadayo

/// Where the header before a club and a tab's states sit, measured in the test host's own window
/// (`AccessibilityElements`) on both iOS versions each run tests: handoff 7's
/// `noClubRootHeader` rectangles across a 393-point screen, the stacked form at an accessibility
/// size, the 32 points from the header to what's under it, Retry 24 above the foot, and the
/// opaque band behind the status bar, which no snapshot shows because none scrolls.
///
/// The header's top is the safe area's, which differs from the frames' 56 by the simulator's
/// status bar, so everything is measured from the header's own top or across the screen.
@MainActor
final class TabsLayoutTests: XCTestCase {
    private typealias Element = AccessibilityElements.Element

    private struct Header {
        let wordmark: Element
        let add: Element
        let account: Element
        let layout: AccessibilityElements.Layout
    }

    private func content(
        _ clubs: RootModel.Clubs, on tab: ClubTab, size: DynamicTypeSize = .large
    ) -> some View {
        TabContent(tab: tab, clubs: clubs, name: "Ben", retry: {}, goHome: {})
            .environment(\.dynamicTypeSize, size)
    }

    private func measured(
        _ clubs: RootModel.Clubs = .noClub, on tab: ClubTab = .home,
        size: DynamicTypeSize = .large, file: StaticString = #filePath, line: UInt = #line
    ) throws -> Header {
        let layout = AccessibilityElements.layout(of: content(clubs, on: tab, size: size))
        let found = { (label: String) in layout.elements.first { $0.label == label } }
        return Header(
            wordmark: try XCTUnwrap(found("Tadayo"), "\(layout.elements)", file: file, line: line),
            add: try XCTUnwrap(found("+ Add"), "\(layout.elements)", file: file, line: line),
            account: try XCTUnwrap(found("Account"), "\(layout.elements)", file: file, line: line),
            layout: layout)
    }

    // MARK: The header

    func testTheHeadersRectanglesAreTheContractsAcrossA393PointScreen() throws {
        // `noClubRootHeader`: the wordmark [20, 64, 96, 30.43], + Add [241, 56, 80, 44],
        // Account [329, 56, 44, 44], in a header whose top is 56.
        let header = try measured()
        XCTAssertEqual(header.layout.size.width, 393)
        let top = header.add.frame.minY
        XCTAssertEqual(top, header.layout.safeArea.top, accuracy: 0.5, "\(header.add)")
        XCTAssertEqual(header.wordmark.frame.minX, 20, accuracy: 0.5, "\(header.wordmark)")
        XCTAssertEqual(header.wordmark.frame.width, 96, accuracy: 0.5, "\(header.wordmark)")
        XCTAssertEqual(header.wordmark.frame.minY - top, 8, accuracy: 0.5, "\(header.wordmark)")
        XCTAssertEqual(header.wordmark.frame.height, 30.43, accuracy: 0.5, "\(header.wordmark)")
        XCTAssertEqual(header.add.frame.minX, 241, accuracy: 0.5, "\(header.add)")
        XCTAssertEqual(header.add.frame.width, 80, accuracy: 0.5, "\(header.add)")
        XCTAssertEqual(header.add.frame.height, 44, accuracy: 0.5, "\(header.add)")
        XCTAssertEqual(header.account.frame.minX, 329, accuracy: 0.5, "\(header.account)")
        XCTAssertEqual(header.account.frame.minY, top, accuracy: 0.5, "\(header.account)")
        XCTAssertEqual(header.account.frame.width, 44, accuracy: 0.5, "\(header.account)")
        XCTAssertEqual(header.account.frame.height, 44, accuracy: 0.5, "\(header.account)")
    }

    func testTheHeaderIsTheSameInEveryStateOfATab() throws {
        let first = try measured()
        let states: [RootModel.Clubs] = [.loading, .failed(.network), .notInThisBuild]
        for tab in ClubTab.allCases {
            for clubs in [.noClub] + states {
                let other = try measured(clubs, on: tab)
                XCTAssertEqual(other.wordmark.frame, first.wordmark.frame, "\(tab), \(clubs)")
                XCTAssertEqual(other.add.frame, first.add.frame, "\(tab), \(clubs)")
                XCTAssertEqual(other.account.frame, first.account.frame, "\(tab), \(clubs)")
            }
        }
    }

    func testTheHeaderStaysInOneRowBelowTheAccessibilitySizesWhereItFits() throws {
        // The largest size that isn't an accessibility size: + Add has grown, and still ends 8
        // before Account, which hasn't moved.
        let header = try measured(size: .xxxLarge)
        XCTAssertEqual(header.account.frame.minX, 329, accuracy: 0.5, "\(header.account)")
        XCTAssertEqual(header.add.frame.maxX, 321, accuracy: 0.5, "\(header.add)")
        XCTAssertEqual(header.add.frame.minY, header.account.frame.minY, accuracy: 0.5)
        XCTAssertGreaterThanOrEqual(header.add.frame.width, 80 - 0.5, "\(header.add)")
    }

    func testTheHeaderStacksAtEveryAccessibilitySizeWithAddLeading() throws {
        // `noClubRootHeader.largest`: "At all accessibility categories, wordmark row then actions
        // row"; the actions' row starts 48 under the header's top, + Add's words at the leading
        // inset, Account [329, y, 44, 44] centred in the row. A 393-point screen has room for
        // one row even at the largest size, so only the rule stacks it.
        let sizes: [DynamicTypeSize] = [
            .accessibility1, .accessibility2, .accessibility3, .accessibility4, .accessibility5,
        ]
        for size in sizes {
            let header = try measured(size: size)
            let top = header.wordmark.frame.minY - 8
            XCTAssertEqual(top, header.layout.safeArea.top, accuracy: 0.5, "\(size)")
            XCTAssertEqual(header.wordmark.frame.minX, 20, accuracy: 0.5, "\(size)")
            XCTAssertEqual(header.wordmark.frame.width, 96, accuracy: 0.5, "\(size)")
            XCTAssertEqual(header.add.frame.minY - top, 48, accuracy: 0.5, "\(size): \(header.add)")
            XCTAssertEqual(header.add.frame.minX, 20, accuracy: 0.5, "\(size): \(header.add)")
            XCTAssertGreaterThanOrEqual(header.add.frame.height, 44 - 0.5, "\(size)")
            XCTAssertGreaterThanOrEqual(header.add.frame.width, 44 - 0.5, "\(size)")
            // What the header measures at each size, for the records: no source gives a rule
            // for + Add's target here (the needs list, item 59). A passing hosted test's
            // activities aren't in the log, so the measures are an attachment's name, which the
            // run's attachments manifest on `evidence` lists.
            let target = header.add.frame
            let measures = XCTAttachment(string: "\(header)")
            measures.name =
                "stacked-header \(size): add \(rounded(target.width)) by "
                + "\(rounded(target.height)), header \(rounded(target.maxY - top)) high"
            measures.lifetime = .keepAlways
            add(measures)
            XCTAssertEqual(
                header.account.frame.minX, 329, accuracy: 0.5, "\(size): \(header.account)")
            XCTAssertEqual(header.account.frame.width, 44, accuracy: 0.5, "\(size)")
            XCTAssertEqual(header.account.frame.height, 44, accuracy: 0.5, "\(size)")
            XCTAssertEqual(
                header.account.frame.midY, header.add.frame.midY, accuracy: 0.5,
                "\(size): \(header.account), \(header.add)")
            XCTAssertLessThanOrEqual(
                header.add.frame.maxX, header.account.frame.minX - 8 + 0.5, "\(size)")
        }
    }

    // MARK: Under the header

    func testEachTabsTitleStarts32UnderTheHeader() throws {
        // `noClubRootHeader.contentStart`: the header's bottom + 32, for Home's title and, since
        // handoff 7, Friends' and Memories' page titles too.
        let titles: [(ClubTab, String)] = [
            (.home, "Start your club."), (.friends, "Friends"), (.memories, "Memories"),
        ]
        for (tab, words) in titles {
            let header = try measured(on: tab)
            let title = try XCTUnwrap(
                header.layout.elements.first { $0.label == words && $0.isHeader },
                "\(header.layout.elements)")
            XCTAssertEqual(
                title.frame.minY - header.add.frame.maxY, 32, accuracy: 0.5, "\(tab): \(title)")
            XCTAssertEqual(title.frame.minX, 20, accuracy: 0.5, "\(tab): \(title)")
        }
    }

    func testAFailureStarts32UnderTheHeaderAndRetryIs24AboveTheFoot() throws {
        // Kept as built (the check's "Kept as built"; FQ90's default): the title 32 under the
        // header, Retry 24 above the safe area's foot, where the tab bar starts in the app. The
        // title and its line are one element, so the 24 between them isn't measured here: the
        // snapshots show it.
        for tab in ClubTab.allCases {
            let header = try measured(.failed(.network), on: tab)
            let layout = header.layout
            let group = try XCTUnwrap(layout.elements.first { $0.isHeader }, "\(layout.elements)")
            let retry = try XCTUnwrap(
                layout.elements.first { $0.label == "Retry" }, "\(layout.elements)")
            XCTAssertEqual(
                group.frame.minY - header.add.frame.maxY, 32, accuracy: 0.5, "\(tab): \(group)")
            let above = layout.size.height - layout.safeArea.bottom - retry.frame.maxY
            XCTAssertEqual(above, 24, accuracy: 0.5, "\(tab): \(retry), \(layout.safeArea)")
            XCTAssertEqual(retry.frame.minX, 20, accuracy: 0.5, "\(tab): \(retry)")
            XCTAssertEqual(retry.frame.width, 353, accuracy: 0.5, "\(tab): \(retry)")
        }
        let other = try measured(.notInThisBuild)
        let title = try XCTUnwrap(
            other.layout.elements.first { $0.isHeader }, "\(other.layout.elements)")
        XCTAssertEqual(title.frame.minY - other.add.frame.maxY, 32, accuracy: 0.5, "\(title)")
    }

    // MARK: The band behind the status bar

    func testTheStatusBarsSafeAreaStaysCanvasOverWhatScrolls() throws {
        // `noClubRootHeader.scroll`: "Status-bar safe area remains opaque canvas"; "no custom
        // glass or extra scroll-edge effect". Home with no club, at the largest size so it
        // scrolls, scrolled until + Add's words are half under the status bar: the status bar's
        // area is then one flat colour, the canvas's, and the words show just under it.
        let scene = UIApplication.shared.connectedScenes.lazy.compactMap { $0 as? UIWindowScene }
            .first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow()
        window.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
        let controller = UIHostingController(
            rootView: content(.noClub, on: .home, size: .accessibility5)
                .environment(\.locale, Locale(identifier: "en_US")))
        controller.overrideUserInterfaceStyle = .light
        window.rootViewController = controller
        window.isHidden = false
        defer {
            window.isHidden = true
            window.rootViewController = nil
        }
        turn(0.5)
        window.layoutIfNeeded()
        let top = window.safeAreaInsets.top
        XCTAssertGreaterThanOrEqual(top, 40, "the window has no status bar to stay clear of")
        let scroll = try XCTUnwrap(scrollView(in: window), "no scroll view in the tab")
        // + Add's row starts 48 under the header's top, and its words are more than 40 high at
        // this size: 68 further up, 20 points of them are under the status bar's area and the
        // rest just below it.
        let rest = scroll.contentOffset
        scroll.setContentOffset(CGPoint(x: rest.x, y: rest.y + 68), animated: false)
        turn(0.3)
        XCTAssertEqual(scroll.contentOffset.y, rest.y + 68, accuracy: 0.5, "the tab didn't scroll")

        // Read pixel for pixel at the window's own scale: scaled down to a pixel a point, the
        // words' edge just under the band rings into its last row (`ios` 44464008020: row 61 of
        // 62 came out lighter than the canvas beside the words, on both runtimes).
        let band = 20.0
        let pixels = try XCTUnwrap(drawn(window, points: top + band), "the window wasn't drawn")
        let edge = Int((top * pixels.scale).rounded(.down))
        keep(pixels.image, as: "tabs-scrolled-under-the-status-bar")
        // `Palette.canvas` in light, 0xFAFBF8: a drawing tinted all over can't pass for it.
        let canvas: [UInt8] = [250, 251, 248]
        var odd: [String] = []
        for y in 0..<edge {
            for x in 0..<pixels.width where pixels.differs(pixels.at(x, y), canvas) {
                if odd.count < 5 { odd.append("(\(x), \(y)) \(pixels.at(x, y))") }
            }
        }
        XCTAssertEqual(
            odd, [],
            "the status bar's area, \(edge) rows of pixels, isn't the canvas \(canvas) throughout")
        // Under the band nothing is laid over the content either ("no … extra scroll-edge
        // effect"): the screen's inset, where no content is, is the canvas there too.
        var tinted: [String] = []
        let inset = Int(20 * pixels.scale) - 1
        for y in edge..<pixels.height {
            for x in 0..<inset where pixels.differs(pixels.at(x, y), canvas) {
                if tinted.count < 5 { tinted.append("(\(x), \(y)) \(pixels.at(x, y))") }
            }
        }
        XCTAssertEqual(tinted, [], "the inset just under the status bar's area isn't the canvas")
        // The same rows without the band would hold + Add's words: they are there just below,
        // so the scroll moved them and the drawing shows what's on the screen. Counted past
        // the wordmark's width, where only + Add's words can be.
        var ink = 0
        let left = Int(120 * pixels.scale)
        let right = Int(200 * pixels.scale)
        for y in edge..<pixels.height {
            for x in left..<right where pixels.differs(pixels.at(x, y), canvas) { ink += 1 }
        }
        XCTAssertGreaterThan(
            ink, Int(50 * pixels.scale * pixels.scale),
            "+ Add's words aren't just under the status bar's area")
        XCTFail("On purpose, on a check branch that never merges: keeps the scrolled drawing")
    }

    // MARK: Helpers

    /// Keeps the drawing for a failure's evidence: named as `tools/ci/ios_steps.py` collects a
    /// snapshot, and kept only if the test fails, as the UI tests keep theirs.
    private func keep(_ image: UIImage, as name: String, test: String = #function) {
        let attachment = XCTAttachment(image: image)
        attachment.name = "\(test.prefix { $0 != "(" }).\(name).png"
        attachment.lifetime = .deleteOnSuccess
        add(attachment)
    }

    /// To a tenth of a point.
    private func rounded(_ value: CGFloat) -> String {
        String(format: "%.1f", value)
    }

    private func turn(_ seconds: TimeInterval) {
        let until = Date().addingTimeInterval(seconds)
        while Date() < until { RunLoop.main.run(until: Date().addingTimeInterval(0.02)) }
    }

    private func scrollView(in view: UIView) -> UIScrollView? {
        if let scroll = view as? UIScrollView { return scroll }
        for subview in view.subviews {
            if let found = scrollView(in: subview) { return found }
        }
        return nil
    }

    private struct Pixels {
        let bytes: [UInt8]
        let width: Int
        let height: Int
        /// Pixels to a point.
        let scale: CGFloat
        let image: UIImage

        func at(_ x: Int, _ y: Int) -> [UInt8] {
            let start = (y * width + x) * 4
            return Array(bytes[start..<start + 3])
        }

        /// More than rounding apart, in any of red, green and blue.
        func differs(_ one: [UInt8], _ other: [UInt8]) -> Bool {
            zip(one, other).contains { abs(Int($0) - Int($1)) > 2 }
        }
    }

    /// The window's top `points` as drawn, pixel for pixel at the window's scale, in sRGB.
    private func drawn(_ window: UIWindow, points: CGFloat) -> Pixels? {
        let scale = window.traitCollection.displayScale
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = true
        format.preferredRange = .standard
        let size = CGSize(width: window.bounds.width, height: points)
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        guard let cgImage = image.cgImage, let space = CGColorSpace(name: CGColorSpace.sRGB)
        else { return nil }
        let width = cgImage.width
        let height = cgImage.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let made = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard
                let context = CGContext(
                    data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                    bytesPerRow: width * 4, space: space,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }
            context.interpolationQuality = .none
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard made else { return nil }
        return Pixels(bytes: bytes, width: width, height: height, scale: scale, image: image)
    }
}
