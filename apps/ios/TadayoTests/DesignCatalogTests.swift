import Foundation
import XCTest

/// TadayoDesign's components read the words they own from the package's own string catalog
/// (`packages/swift/TadayoDesign/Sources/TadayoDesign/Localizable.xcstrings`, through
/// `bundle: .module`), never from the app's: in the share extension the main bundle is the
/// extension, which has no copy of the app's catalog, so a key looked up there would be shown as
/// itself ("receipt.added"). These read the catalog's source beside this file, as the snapshot
/// tests read their references, and check the app as built.
final class DesignCatalogTests: XCTestCase {
    private let sources = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()  // TadayoTests
        .deletingLastPathComponent()  // ios
        .deletingLastPathComponent()  // apps
        .deletingLastPathComponent()  // the repository
        .appendingPathComponent("packages/swift/TadayoDesign/Sources/TadayoDesign")

    /// Every key in the package's catalog resolves to its English words in the package's own
    /// resource bundle, which the app carries, and none is in the app's catalog.
    func testEveryKeyResolvesInTheDesignBundleAndNotTheApps() throws {
        let catalog = try catalogWords()
        XCTAssertFalse(catalog.isEmpty)
        let bundle = try XCTUnwrap(
            designBundle(), "TadayoDesign's resource bundle isn't in the app")
        for (key, words) in catalog {
            XCTAssertEqual(
                bundle.localizedString(forKey: key, value: "\u{FFFD}", table: nil), words, key)
            XCTAssertEqual(
                Bundle.main.localizedString(forKey: key, value: "\u{FFFD}", table: nil), "\u{FFFD}",
                "\(key) is in the app's catalog too")
        }
    }

    /// Every lookup in the package's sources names its own bundle; a bare `String(localized:)`
    /// or a `Text` with a literal would read the main bundle.
    func testEveryLookupInTheComponentsNamesTheDesignBundle() throws {
        let lookup = try NSRegularExpression(pattern: #"String\(\s*localized:"#)
        let named = try NSRegularExpression(
            pattern: #"String\(\s*localized:\s*"[^"]*",\s*bundle:\s*\.module\s*\)"#)
        let literalText = try NSRegularExpression(pattern: #"\bText\(\s*""#)
        let files = try XCTUnwrap(FileManager.default.enumerator(atPath: sources.path))
            .compactMap { $0 as? String }.filter { $0.hasSuffix(".swift") }
        XCTAssertFalse(files.isEmpty)
        var lookups = 0
        for file in files {
            let text = try String(contentsOf: sources.appendingPathComponent(file), encoding: .utf8)
            let range = NSRange(text.startIndex..., in: text)
            let all = lookup.numberOfMatches(in: text, range: range)
            lookups += all
            XCTAssertEqual(named.numberOfMatches(in: text, range: range), all, file)
            XCTAssertEqual(literalText.numberOfMatches(in: text, range: range), 0, file)
        }
        XCTAssertGreaterThan(lookups, 0)
    }

    /// The catalog's keys and their English words.
    private func catalogWords() throws -> [String: String] {
        let data = try Data(contentsOf: sources.appendingPathComponent("Localizable.xcstrings"))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(json["strings"] as? [String: [String: Any]])
        return try strings.mapValues { entry in
            let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any])
            let english = try XCTUnwrap(localizations["en"] as? [String: Any])
            let unit = try XCTUnwrap(english["stringUnit"] as? [String: Any])
            return try XCTUnwrap(unit["value"] as? String)
        }
    }

    /// The package's resource bundle, which Xcode names `TadayoDesign_TadayoDesign.bundle` and
    /// copies into the app (and into a test bundle that links the package).
    private func designBundle() -> Bundle? {
        let places = [Bundle.main.resourceURL, Bundle(for: Self.self).resourceURL].compactMap { $0 }
        for place in places {
            let names = (try? FileManager.default.contentsOfDirectory(atPath: place.path)) ?? []
            if let name = names.first(where: {
                $0.hasPrefix("TadayoDesign") && $0.hasSuffix(".bundle")
            }) {
                return Bundle(url: place.appendingPathComponent(name))
            }
        }
        return nil
    }
}
