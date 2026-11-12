import Foundation
import XCTest

#if canImport(CryptoKit)
    import CryptoKit
#endif

/// The app's icon (slice 11b): the brand's three 1024-point masters (`design/reference/brand/`,
/// brand revision 1.1; ADR-027), kept in `Tadayo/Assets.xcassets/AppIcon.appiconset` as one
/// universal icon with a dark and a tinted appearance, which are the catalog's Any, Dark and
/// Tinted wells. iOS 18's Home Screen draws the one the person has chosen. These read the
/// catalog's source beside this file, as `DesignCatalogTests` reads the package's, and check the
/// app as built.
final class AppIconTests: XCTestCase {
    private let repository = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()  // TadayoTests
        .deletingLastPathComponent()  // ios
        .deletingLastPathComponent()  // apps
        .deletingLastPathComponent()  // the repository

    private var iconSet: URL {
        repository.appendingPathComponent("apps/ios/Tadayo/Assets.xcassets/AppIcon.appiconset")
    }

    private var brand: URL {
        repository.appendingPathComponent("design/reference/brand")
    }

    private struct Icon {
        let file: String
        let master: String
        let hasAlpha: Bool
        let sha256: String
    }

    /// Each appearance (the key names its well in Xcode, Any, Dark or Tinted; for the dark and
    /// tinted ones it is also the luminosity value in `Contents.json`), its file in the catalog,
    /// the brand's master it must be byte for byte, whether the master has an alpha channel, and the
    /// master's SHA-256, which pins it: a replacement master fails until a person puts its digest
    /// here, in the PR that remakes `brand/` from an adopted revision (ADR-027). App Store Connect
    /// rejects an App Store icon (the Any image) with an alpha channel (ITMS-90717), so the Any
    /// master has none, nor has the tinted one, which is grayscale RGB; the dark master is the
    /// one revision 1.1 remade with a transparent background, as Apple's page "Configuring your
    /// app icon using an asset catalog" asks of a dark icon.
    private let icons: [String: Icon] = [
        "any": Icon(
            file: "AppIcon.png", master: "brand-icon-1024.png", hasAlpha: false,
            sha256: "b7e34509ac397afa50e05a200b02ec31cfb227f1405d93b217f989d0268491d9"),
        "dark": Icon(
            file: "AppIcon-Dark.png", master: "brand-icon-dark-1024.png", hasAlpha: true,
            sha256: "caf50bc57bbcbfc956686203eeba4ae0917a9e645c076b270572841d56aee5dc"),
        "tinted": Icon(
            file: "AppIcon-Tinted.png", master: "brand-icon-tinted-1024.png", hasAlpha: false,
            sha256: "22fca87c5484bbeed41c29829ee06d069d2ffea935b76527a732bb10392a1523"),
    ]

    /// The catalog holds one universal 1024-point icon in three appearances, and nothing else:
    /// `Contents.json` is exactly this document (any other key, such as a `scale`, fails), and
    /// nothing else rides along in the set.
    func testTheCatalogHoldsOneUniversalIconWithADarkAndATintedAppearance() throws {
        func image(_ icon: String, _ appearances: [[String: String]]? = nil) -> [String: Any] {
            var image: [String: Any] = [
                "filename": icons[icon]!.file, "idiom": "universal", "platform": "ios",
                "size": "1024x1024",
            ]
            if let appearances { image["appearances"] = appearances }
            return image
        }
        let expected: [String: Any] = [
            "images": [
                image("any"),
                image("dark", [["appearance": "luminosity", "value": "dark"]]),
                image("tinted", [["appearance": "luminosity", "value": "tinted"]]),
            ],
            "info": ["author": "xcode", "version": 1],
        ]
        let held = try JSONSerialization.jsonObject(
            with: Data(contentsOf: iconSet.appendingPathComponent("Contents.json")))
        XCTAssertEqual(try canonical(held), try canonical(expected))
        let files = try FileManager.default.contentsOfDirectory(atPath: iconSet.path).sorted()
        XCTAssertEqual(files, (icons.values.map(\.file) + ["Contents.json"]).sorted())
    }

    /// The app draws the brand's icon, not a copy that drifted (T46: nothing is drawn or
    /// borrowed here).
    func testEachIconIsTheBrandsMasterByteForByte() throws {
        for icon in icons.values {
            let held = try Data(contentsOf: iconSet.appendingPathComponent(icon.file))
            let master = try Data(contentsOf: brand.appendingPathComponent(icon.master))
            XCTAssertFalse(master.isEmpty, icon.master)
            XCTAssertEqual(held, master, "\(icon.file) differs from \(icon.master)")
        }
    }

    #if canImport(CryptoKit)
        /// The masters are the ones this table pins, so a master replaced together with its copy
        /// in the catalog, which the test above can't see, fails here.
        func testTheMastersAreThePinnedOnes() throws {
            for icon in icons.values {
                let master = try Data(contentsOf: brand.appendingPathComponent(icon.master))
                let digest = SHA256.hash(data: master).map { String(format: "%02x", $0) }
                XCTAssertEqual(digest.joined(), icon.sha256, icon.master)
            }
        }
    #endif

    /// Each file's header says 1024 by 1024 pixels, and whether it has an alpha channel (colour
    /// type 4 or 6, or a `tRNS` chunk), where the table says it should.
    func testEachIconIs1024By1024PixelsWithAnAlphaChannelWhereTheTableSaysSo() throws {
        for icon in icons.values {
            let png = try PNGHeader(Data(contentsOf: iconSet.appendingPathComponent(icon.file)))
            XCTAssertEqual(png.width, 1024, icon.file)
            XCTAssertEqual(png.height, 1024, icon.file)
            XCTAssertEqual(png.hasAlpha, icon.hasAlpha, icon.file)
        }
    }

    /// The build named the set in the app's Info.plist (`CFBundleIconName`, which App Store
    /// Connect reads: ITMS-90713). That asset compilation put the icon files in the app, at the
    /// size an iPhone needs, is for the archive check in slice 12.
    func testTheBuiltAppNamesItsIcon() throws {
        let info = try XCTUnwrap(Bundle.main.infoDictionary)
        let icons = try XCTUnwrap(info["CFBundleIcons"] as? [String: Any])
        let primary = try XCTUnwrap(icons["CFBundlePrimaryIcon"] as? [String: Any])
        XCTAssertEqual(primary["CFBundleIconName"] as? String, "AppIcon")
    }

    /// A JSON document with its keys in order, for comparing two of them.
    private func canonical(_ json: Any) throws -> String {
        String(
            decoding: try JSONSerialization.data(
                withJSONObject: json, options: [.sortedKeys, .prettyPrinted]),
            as: UTF8.self)
    }
}

/// What a PNG's chunks say about its size and transparency: its width and height, and whether it
/// has an alpha channel (colour type 4 or 6) or a `tRNS` chunk, which makes a colour transparent.
/// The first chunk must be a whole `IHDR`, the last must be `IEND`, and the chunks must end
/// exactly where the data does, so a file cut short, or with bytes after its end, is not a PNG.
private struct PNGHeader {
    let width: Int
    let height: Int
    let hasAlpha: Bool

    struct NotAPNG: Error {}

    init(_ data: Data) throws {
        let signature: [UInt8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
        guard Array(data.prefix(8)) == signature else { throw NotAPNG() }
        func number(at offset: Int) -> Int {
            (0..<4).reduce(0) { ($0 << 8) | Int(data[data.startIndex + offset + $1]) }
        }
        var width = 0
        var height = 0
        var colourType = -1
        var transparency = false
        var offset = 8
        var last = ""
        while offset + 12 <= data.count {
            let length = number(at: offset)
            let name = String(
                decoding: data[(data.startIndex + offset + 4)..<(data.startIndex + offset + 8)],
                as: UTF8.self)
            guard offset + 12 + length <= data.count, (name == "IHDR") == (offset == 8) else {
                throw NotAPNG()
            }
            switch name {
            case "IHDR":
                guard length == 13 else { throw NotAPNG() }
                width = number(at: offset + 8)
                height = number(at: offset + 12)
                colourType = Int(data[data.startIndex + offset + 17])
            case "tRNS":
                transparency = true
            default:
                break
            }
            last = name
            offset += 12 + length
        }
        guard colourType >= 0, offset == data.count, last == "IEND" else { throw NotAPNG() }
        self.width = width
        self.height = height
        self.hasAlpha = colourType == 4 || colourType == 6 || transparency
    }
}
