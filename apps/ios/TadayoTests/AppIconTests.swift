import Foundation
import XCTest

/// The app's icon (slice 11b): the brand's three 1024-point masters (`design/reference/brand/`,
/// brand revision 1.1; ADR-027), kept in `Tadayo/Assets.xcassets/AppIcon.appiconset` as one
/// universal icon with a dark and a tinted appearance. iOS 18's Home Screen picks the appearance
/// the person has chosen; earlier systems draw the first. These read the catalog's source beside
/// this file, as `DesignCatalogTests` reads the package's, and check the app as built.
final class AppIconTests: XCTestCase {
    private let repository = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()  // TadayoTests
        .deletingLastPathComponent()  // ios
        .deletingLastPathComponent()  // apps
        .deletingLastPathComponent()  // the repository

    private var iconSet: URL {
        repository.appendingPathComponent("apps/ios/Tadayo/Assets.xcassets/AppIcon.appiconset")
    }

    /// Each appearance, its file in the catalog, the brand's master it must be byte for byte, and
    /// whether the master is transparent. App Store Connect rejects the 1024-point icon if it has
    /// an alpha channel, so the light and tinted masters have none; the dark master is the
    /// transparent one revision 1.1 remade, and the system draws its background.
    private let icons: [(appearance: String, file: String, master: String, hasAlpha: Bool)] = [
        ("any", "AppIcon.png", "brand-icon-1024.png", false),
        ("dark", "AppIcon-Dark.png", "brand-icon-dark-1024.png", true),
        ("tinted", "AppIcon-Tinted.png", "brand-icon-tinted-1024.png", false),
    ]

    /// The catalog holds one universal 1024-point icon in three appearances, and nothing else
    /// rides along in the set.
    func testTheCatalogHoldsOneUniversalIconWithADarkAndATintedAppearance() throws {
        let contents = try JSONDecoder().decode(
            Contents.self,
            from: Data(contentsOf: iconSet.appendingPathComponent("Contents.json")))
        XCTAssertEqual(contents.images.count, 3)
        var files: [String: String] = [:]
        for image in contents.images {
            XCTAssertEqual(image.idiom, "universal", image.filename)
            XCTAssertEqual(image.platform, "ios", image.filename)
            XCTAssertEqual(image.size, "1024x1024", image.filename)
            files[image.appearance] = image.filename
        }
        XCTAssertEqual(
            files, Dictionary(uniqueKeysWithValues: icons.map { ($0.appearance, $0.file) }))
        let held = try FileManager.default.contentsOfDirectory(atPath: iconSet.path).sorted()
        XCTAssertEqual(held, (icons.map(\.file) + ["Contents.json"]).sorted())
    }

    /// The app draws the brand's icon, not a copy that drifted (T46: nothing is drawn or
    /// borrowed here).
    func testEachIconIsTheBrandsMasterByteForByte() throws {
        let brand = repository.appendingPathComponent("design/reference/brand")
        for icon in icons {
            let held = try Data(contentsOf: iconSet.appendingPathComponent(icon.file))
            let master = try Data(contentsOf: brand.appendingPathComponent(icon.master))
            XCTAssertFalse(master.isEmpty, icon.master)
            XCTAssertEqual(held, master, "\(icon.file) differs from \(icon.master)")
        }
    }

    /// Each is a PNG of 1024 by 1024 points, and has an alpha channel only where its master does.
    func testEachIconIs1024By1024AndHasAlphaOnlyWhereItsMasterDoes() throws {
        for icon in icons {
            let png = try PNGHeader(Data(contentsOf: iconSet.appendingPathComponent(icon.file)))
            XCTAssertEqual(png.width, 1024, icon.file)
            XCTAssertEqual(png.height, 1024, icon.file)
            XCTAssertEqual(png.hasAlpha, icon.hasAlpha, icon.file)
        }
    }

    /// The build compiled the set and named it in the app's Info.plist, which App Store Connect
    /// reads (a missing icon is refused at upload).
    func testTheBuiltAppNamesItsIcon() throws {
        let info = try XCTUnwrap(Bundle.main.infoDictionary)
        let icons = try XCTUnwrap(info["CFBundleIcons"] as? [String: Any])
        let primary = try XCTUnwrap(icons["CFBundlePrimaryIcon"] as? [String: Any])
        XCTAssertEqual(primary["CFBundleIconName"] as? String, "AppIcon")
    }
}

/// `AppIcon.appiconset/Contents.json`, as far as these tests read it.
private struct Contents: Decodable {
    struct Image: Decodable {
        struct Appearance: Decodable {
            let appearance: String
            let value: String
        }

        let filename: String
        let idiom: String
        let platform: String
        let size: String
        let appearances: [Appearance]?

        /// "any" with no appearance, else the luminosity's value ("dark" or "tinted").
        var appearance: String {
            guard let appearances else { return "any" }
            guard appearances.count == 1, appearances[0].appearance == "luminosity" else {
                return "other"
            }
            return appearances[0].value
        }
    }

    let images: [Image]
}

/// What a PNG's chunks say about its size and transparency: its width and height, and whether it
/// has an alpha channel (colour type 4 or 6) or a `tRNS` chunk, which makes a colour transparent.
private struct PNGHeader {
    let width: Int
    let height: Int
    let hasAlpha: Bool

    struct NotAPNG: Error {}

    init(_ data: Data) throws {
        let signature: [UInt8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
        guard data.count > 33, Array(data.prefix(8)) == signature else { throw NotAPNG() }
        func number(at offset: Int) -> Int {
            (0..<4).reduce(0) { ($0 << 8) | Int(data[data.startIndex + offset + $1]) }
        }
        var width = 0
        var height = 0
        var colourType = -1
        var transparency = false
        var offset = 8
        while offset + 12 <= data.count {
            let length = number(at: offset)
            let name = String(
                decoding: data[(data.startIndex + offset + 4)..<(data.startIndex + offset + 8)],
                as: UTF8.self)
            switch name {
            case "IHDR":
                width = number(at: offset + 8)
                height = number(at: offset + 12)
                colourType = Int(data[data.startIndex + offset + 17])
            case "tRNS":
                transparency = true
            default:
                break
            }
            offset += 12 + length
        }
        guard colourType >= 0 else { throw NotAPNG() }
        self.width = width
        self.height = height
        self.hasAlpha = colourType == 4 || colourType == 6 || transparency
    }
}
