import SwiftUI
import TadayoCore
import TadayoDesign
import XCTest

@testable import Tadayo

/// What VoiceOver reads for the target block, and what its input can hold: the person, the club
/// and the exact opening before Add (T31), with the year (FQ44), as one button with no hint
/// (FQ92's default), and nothing counted or taken from a drop (T33, T12). Names are drawn as
/// they are, never as Markdown: the block draws them with `Text(verbatim:)`, and
/// `DesignCatalogTests` refuses a literal in the package.
@MainActor
final class TargetBlockTests: XCTestCase {
    private var debby: String {
        "For Debby. Sunday people. Opens Friday, November 13, 2026 at \(seven), New York."
    }

    func testTheBlockIsOneButtonNamingThePersonTheClubAndTheOpening() {
        assertReads(
            block(FixtureCast.collectingDay, FixtureCast.debby), [Read(debby, isButton: true)])
    }

    func testTheCurrentYearsFormStillSpeaksTheYear() {
        assertReads(
            block(FixtureCast.collectingDayThisYear, FixtureCast.debby),
            [Read(debby, isButton: true)])
    }

    func testAnInitialIsNotRead() {
        assertReads(
            block(FixtureCast.alexsWednesday, FixtureCast.alex),
            [
                Read(
                    "For Alex. Sunday people. Opens Wednesday, November 11, 2026 at \(seven), "
                        + "New York.", isButton: true)
            ])
    }

    /// The block's input is the occasion, which names the person, the star's profile photo
    /// and the club's name, and nothing else: no allowance, count or anything of the drop.
    func testItsInputHoldsNothingElse() {
        let target = TargetBlock(
            for: FixtureCast.collectingDay, photo: FixtureCast.debby.image,
            club: FixtureCast.club, labels: FixtureCast.labels, action: {})
        XCTAssertEqual(
            fields(target).filter { !$0.hasPrefix("_") },
            [
                "occasion: Occasion", "photo: Optional<Image>", "club: String",
                "labels: DateLabels", "action: () -> ()",
            ])
    }

    private func block(_ occasion: Occasion, _ star: FixtureCast.Person) -> some View {
        TargetBlock(
            for: occasion, photo: star.image, club: FixtureCast.club, labels: FixtureCast.labels,
            action: {}
        ).padding(.horizontal, 20)
    }
}
