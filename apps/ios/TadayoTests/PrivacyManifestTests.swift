import Foundation
import XCTest

/// The privacy manifests as built (Apple, "Describing use of required reason API"): the app reads
/// and writes its own standard `UserDefaults`, which keep the selected club
/// (`DefaultsClubSelection`), so its manifest gives that category the reason `CA92.1`, information
/// only the app itself reads. The share extension's own code calls none, but it links
/// `TadayoCore`, whose `DefaultsClubSelection` Apple's scan of its binary can find, so its
/// manifest gives the same reason. Neither tracks (audit B3).
final class PrivacyManifestTests: XCTestCase {
    func testTheAppGivesItsReasonForUserDefaults() throws {
        try assertReasonForUserDefaults(in: self.manifest(in: Bundle.main))
    }

    func testTheShareExtensionGivesItsReasonForUserDefaults() throws {
        let plugIns = try XCTUnwrap(Bundle.main.builtInPlugInsURL)
        let share = try XCTUnwrap(Bundle(url: plugIns.appending(path: "TadayoShare.appex")))
        try assertReasonForUserDefaults(in: self.manifest(in: share))
    }

    /// No tracking, and one required-reason category, `UserDefaults`, for `CA92.1` alone.
    private func assertReasonForUserDefaults(
        in manifest: [String: Any], file: StaticString = #filePath, line: UInt = #line
    ) throws {
        XCTAssertEqual(manifest["NSPrivacyTracking"] as? Bool, false, file: file, line: line)
        let types = try XCTUnwrap(
            manifest["NSPrivacyAccessedAPITypes"] as? [[String: Any]], file: file, line: line)
        XCTAssertEqual(types.count, 1, file: file, line: line)
        XCTAssertEqual(
            types.first?["NSPrivacyAccessedAPIType"] as? String,
            "NSPrivacyAccessedAPICategoryUserDefaults", file: file, line: line)
        XCTAssertEqual(
            types.first?["NSPrivacyAccessedAPITypeReasons"] as? [String], ["CA92.1"], file: file,
            line: line)
    }

    private func manifest(in bundle: Bundle) throws -> [String: Any] {
        let url = try XCTUnwrap(
            bundle.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"),
            "no PrivacyInfo.xcprivacy in \(bundle.bundleURL.lastPathComponent)")
        let data = try Data(contentsOf: url)
        let plist = try PropertyListSerialization.propertyList(from: data, format: nil)
        return try XCTUnwrap(plist as? [String: Any])
    }
}
