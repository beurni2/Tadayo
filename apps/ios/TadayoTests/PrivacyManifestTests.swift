import Foundation
import XCTest

/// The privacy manifests as built (Apple, "Describing use of required reason API"): the app reads
/// and writes its own standard `UserDefaults`, which keep the selected club
/// (`DefaultsClubSelection`), so its manifest gives that category the reason `CA92.1`, information
/// only the app itself reads; and the share extension calls no required-reason API, so its
/// manifest names none. Neither tracks (audit B3).
final class PrivacyManifestTests: XCTestCase {
    func testTheAppGivesItsReasonForUserDefaults() throws {
        let manifest = try self.manifest(in: Bundle.main)
        XCTAssertEqual(manifest["NSPrivacyTracking"] as? Bool, false)
        let types = try XCTUnwrap(manifest["NSPrivacyAccessedAPITypes"] as? [[String: Any]])
        XCTAssertEqual(types.count, 1)
        XCTAssertEqual(
            types.first?["NSPrivacyAccessedAPIType"] as? String,
            "NSPrivacyAccessedAPICategoryUserDefaults")
        XCTAssertEqual(types.first?["NSPrivacyAccessedAPITypeReasons"] as? [String], ["CA92.1"])
    }

    func testTheShareExtensionNamesNoRequiredReasonAPI() throws {
        let plugIns = try XCTUnwrap(Bundle.main.builtInPlugInsURL)
        let share = try XCTUnwrap(Bundle(url: plugIns.appending(path: "TadayoShare.appex")))
        let manifest = try self.manifest(in: share)
        XCTAssertEqual(manifest["NSPrivacyTracking"] as? Bool, false)
        XCTAssertEqual((manifest["NSPrivacyAccessedAPITypes"] as? [Any])?.count, 0)
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
