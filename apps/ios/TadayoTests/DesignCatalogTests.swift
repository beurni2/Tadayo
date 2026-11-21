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

    /// Every `String(localized:)` in the package's sources names its own bundle, none of the forms
    /// below that read the main bundle appears, and every key of its catalog is looked up that
    /// way. A bare `String(localized:)`, `NSLocalizedString`,
    /// `LocalizedStringKey` or `LocalizedStringResource`, or a literal given to `Text`, `Button`,
    /// `Label`, `Toggle`, `Link`, `Menu`, `Picker`, `TextField`, `SecureField`, `Section`,
    /// `ProgressView`, an accessibility label, hint, value, action name, input label or custom
    /// content, a navigation title, an alert, a confirmation dialog or a help tag, would read the
    /// main bundle, which the share extension doesn't carry the catalog in; and a
    /// key no lookup names would leave a component showing words the catalog no longer holds, so
    /// an answer that changes the catalog's words wouldn't reach it.
    func testEveryLookupInTheComponentsNamesTheDesignBundle() throws {
        let lookup = try NSRegularExpression(pattern: #"String\(\s*localized:"#)
        let named = try NSRegularExpression(
            pattern: #"String\(\s*localized:\s*"([^"]*)",\s*bundle:\s*\.module\s*\)"#)
        let mainBundle = try NSRegularExpression(
            pattern: #"\b(Text|Button|Label|Toggle|Link|Menu|Picker|TextField|SecureField|"#
                + #"Section|ProgressView|LocalizedStringKey|LocalizedStringResource|"#
                + #"NSLocalizedString)\(\s*"|\.(accessibilityLabel|accessibilityHint|"#
                + #"accessibilityValue|accessibilityCustomContent|navigationTitle|alert|"#
                + #"confirmationDialog|help)\(\s*"|\.accessibilityAction\(\s*named:\s*"|"#
                + #"\.accessibilityInputLabels\(\s*\[\s*""#)
        let files = try XCTUnwrap(FileManager.default.enumerator(atPath: sources.path))
            .compactMap { $0 as? String }.filter { $0.hasSuffix(".swift") }
        XCTAssertFalse(files.isEmpty)
        var looked = Set<String>()
        for file in files {
            let text = try String(contentsOf: sources.appendingPathComponent(file), encoding: .utf8)
            let range = NSRange(text.startIndex..., in: text)
            let matches = named.matches(in: text, range: range)
            XCTAssertEqual(matches.count, lookup.numberOfMatches(in: text, range: range), file)
            XCTAssertEqual(mainBundle.numberOfMatches(in: text, range: range), 0, file)
            for match in matches {
                let key = try XCTUnwrap(Range(match.range(at: 1), in: text))
                looked.insert(String(text[key]))
            }
        }
        let keys = try Set(catalogWords().keys)
        XCTAssertEqual(looked, keys)
    }

    /// No line starts with a middle dot (the check of handoff 7, V-19, where its largest-text
    /// specimens draw "· Opens at 7" at a line's start): in every string of the package's catalog
    /// and the app's, a middle dot is bound to the word before it by a no-break space (U+00A0),
    /// never an ordinary space, so it ends that word's line. A string with none passes; the
    /// package's catalog has some, so the check can't pass by finding nothing. Each form of a
    /// plural string is checked as a string of its own.
    func testEveryMiddleDotIsBoundToTheWordBeforeIt() throws {
        let app =
            sources
            .deletingLastPathComponent()  // Sources
            .deletingLastPathComponent()  // TadayoDesign
            .deletingLastPathComponent()  // swift
            .deletingLastPathComponent()  // packages
            .deletingLastPathComponent()  // the repository
            .appendingPathComponent("apps/ios/Tadayo/Localizable.xcstrings")
        let design = try catalogForms()
        XCTAssertFalse(design.values.filter { $0.contains("·") }.isEmpty)
        for (key, words) in try design.merging(catalogForms(at: app)) { first, _ in first } {
            for index in words.indices where words[index] == "·" {
                let before = index == words.startIndex ? nil : words[words.index(before: index)]
                XCTAssertEqual(before, "\u{00A0}", "\(key): \"\(words)\"")
            }
        }
    }

    /// The keys and English words of the package's catalog, or of the one at `catalog`.
    private func catalogWords(at catalog: URL? = nil) throws -> [String: String] {
        let data = try Data(
            contentsOf: catalog ?? sources.appendingPathComponent("Localizable.xcstrings"))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(json["strings"] as? [String: [String: Any]])
        return try strings.mapValues { entry in
            let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any])
            let english = try XCTUnwrap(localizations["en"] as? [String: Any])
            let unit = try XCTUnwrap(english["stringUnit"] as? [String: Any])
            return try XCTUnwrap(unit["value"] as? String)
        }
    }

    /// Every English string of the package's catalog, or of the one at `catalog`, by its key: an
    /// entry's one string, or each form of a plural one, as Xcode writes it (`variations`,
    /// `plural`), keyed "key [form]".
    private func catalogForms(at catalog: URL? = nil) throws -> [String: String] {
        let data = try Data(
            contentsOf: catalog ?? sources.appendingPathComponent("Localizable.xcstrings"))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(json["strings"] as? [String: [String: Any]])
        var forms: [String: String] = [:]
        for (key, entry) in strings {
            let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
            let english = try XCTUnwrap(localizations["en"] as? [String: Any], key)
            if let unit = english["stringUnit"] as? [String: Any] {
                forms[key] = try XCTUnwrap(unit["value"] as? String, key)
                continue
            }
            let variations = try XCTUnwrap(english["variations"] as? [String: Any], key)
            let plural = try XCTUnwrap(variations["plural"] as? [String: [String: Any]], key)
            XCTAssertFalse(plural.isEmpty, key)
            for (form, variation) in plural {
                let unit = try XCTUnwrap(
                    variation["stringUnit"] as? [String: Any], "\(key) [\(form)]")
                forms["\(key) [\(form)]"] = try XCTUnwrap(
                    unit["value"] as? String, "\(key) [\(form)]")
            }
        }
        return forms
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
