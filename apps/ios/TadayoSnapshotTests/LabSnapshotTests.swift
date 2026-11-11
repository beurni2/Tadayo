import SnapshotTesting
import SwiftUI
import TadayoDesign
import XCTest

@testable import Tadayo

/// The Lab's sections at the 393-point width, in light, in dark, at the largest standard text
/// size and at the largest accessibility size (docs/TECH-DESIGN.md sections 2 and 4), the
/// no-club header and the drop card's sections at 320 points, the receipt with its action
/// wrapped, and the author's own Highlight in a current-year card at 393 and 430. The Lab isn't
/// an inventory state, so the contact sheets show these alone; book p34 and p35 and handoffs 0
/// and 7's component sheets are what they are judged against.
///
/// CI runs in record mode `never`: a snapshot with no committed reference fails, and its image
/// goes to the evidence branch for review (`tools/ci/ios_steps.py test`).
///
/// Every snapshot renders in sRGB, as the renders are, so each reference is an 8-bit PNG: under
/// the simulator's P3 gamut the photographs came out at 16 bits, 27 MB a variant. The photographs
/// look the same in every variant (only their heading changes, and the other sections show that
/// role in all four), so they're snapshotted once, light at the default size, and at 1x. The
/// revealed drop card carries a photograph the width of the screen in all four variants, so it
/// is drawn at 2x, as the screens are, not the simulator's 3x: about 1 MB a variant, not 2.
///
/// Each section is drawn through `StillHost`, so the busy button's spinner is at rest.
@MainActor
final class LabSnapshotTests: XCTestCase {
    enum Variant {
        case light, dark, large, xl
        /// The first accessibility size, for the receipt whose action wraps there.
        case ax1

        /// The four every section is drawn in.
        static let sections: [Variant] = [.light, .dark, .large, .xl]

        var suffix: String {
            switch self {
            case .light: ""
            case .dark: "-dark"
            case .large: "-large"
            case .xl: "-xl"
            case .ax1: "-ax1"
            }
        }

        var scheme: ColorScheme { self == .dark ? .dark : .light }

        var size: DynamicTypeSize {
            switch self {
            case .light, .dark: .large
            case .large: .xxxLarge
            case .xl: .accessibility5
            case .ax1: .accessibility1
            }
        }

        var traits: UITraitCollection {
            let category: UIContentSizeCategory =
                switch self {
                case .light, .dark: .large
                case .large: .extraExtraExtraLarge
                case .xl: .accessibilityExtraExtraExtraLarge
                case .ax1: .accessibilityMedium
                }
            let style: UIUserInterfaceStyle = self == .dark ? .dark : .light
            return UITraitCollection(mutations: { traits in
                traits.userInterfaceStyle = style
                traits.preferredContentSizeCategory = category
                traits.displayGamut = .SRGB
            })
        }
    }

    func testLabSections() {
        for section in LabSection.allCases {
            let variants: [Variant] = section == .photos ? [.light] : Variant.sections
            for variant in variants {
                snap(section, variant, named: "Lab-\(section.rawValue)\(variant.suffix)")
            }
        }
    }

    /// The no-club header's second form, which no screen snapshot reaches, each being 393 points
    /// wide: at 320 points, the width of a 375-point iPhone with Display Zoom on, and the largest
    /// accessibility size, + Add and Account don't fit beside the wordmark, so they go on a row
    /// under it, still trailing (handoff 4: "can stack").
    func testTheHeaderStacksWhenItsActionsDontFit() {
        snap(.header, .xl, width: 320, named: "Lab-header-320-xl")
    }

    /// The drop card's sections at 320 points and the largest accessibility size, which no
    /// 393-point image reaches: every card, row, photograph and receipt keeps inside the screen.
    /// A word wider than its line breaks inside itself, as the system wraps it ("Choo" over "se",
    /// "Debby’" over "s" in the receipt, whose disc grows with its text), and a middle dot whose
    /// word fills the line goes to the next ("Processing" over "· Not added"), which book p26
    /// doesn't ask for and no delivery draws otherwise (INVENTORY.md's Known differences; the ios
    /// lane's needs list, items 39 and 45).
    func testTheDropCardKeepsInsideA320PointScreenAtTheLargestSize() {
        for section in [LabSection.cards, .drops, .revealed, .receipt] {
            snap(section, .xl, width: 320, named: "Lab-\(section.rawValue)-320-xl")
        }
    }

    /// At 320 points and the first accessibility size, "Make my highlight" wraps while one of its
    /// lines is still under the 44-point target, the case the largest size never reaches: the
    /// full 12 is under the words once they fill the target (`compactReceipt.actionInsets`).
    func testTheReceiptKeeps12UnderAWrappedAction() {
        snap(.receipt, .ax1, width: 320, named: "Lab-receipt-320-ax1")
    }

    /// The author's own Highlight as a screen in 2026 writes the card, without the year (FQ44),
    /// the form handoff 7's specimen draws ("Opens Friday, November 13 · 7 AM"), so the two can be
    /// laid side by side at its 393 points; every Lab section's specimen carries its year, as a
    /// standalone specimen does (the check of handoff 7, D-23). The Highlight is a line of its own
    /// under the caption at every width (handoff 7's `ownHighlight`), 430 points included, where
    /// the card's first form put it at the status line's end.
    func testTheAuthorsHighlightTakesItsOwnLineInACurrentYearCard() {
        let ben = FixtureCast.ben
        let drop = HiddenDrop(
            caption: "Coffee, obviously.", mediaClass: .photo, sender: ben.sender,
            cover: Palette.cover(slot: ben.slot), occasion: FixtureCast.collectingDayThisYear,
            viewer: .author(isHighlight: true))
        for width: CGFloat in [393, 430] {
            snap(
                DropCard(.collecting(drop), labels: FixtureCast.labels).padding(.horizontal, 20),
                .light, width: width, scale: nil, busy: false,
                named: width == 393 ? "Lab-card-highlight" : "Lab-card-highlight-430")
        }
    }

    /// Book p34: "Portrait, landscape and text screenshot fixtures have distinct examples." The
    /// revealed section shows the chair, a portrait; this is the sea, a landscape, in the same
    /// 353 by 304 frame, filled the same way, from Nina with no caption, so no words are made
    /// up for it. No text screenshot is among the book's fixtures, and none may be made (T46,
    /// FQ24).
    func testTheFeedFramesALandscapePhotoTheSameWay() {
        let drop = RevealedDrop(
            caption: nil, sender: FixtureCast.nina.sender, photo: Image("fixture-sea"),
            isHighlight: false)
        snap(
            DropCard(.revealed(drop), labels: FixtureCast.labels).padding(.horizontal, 20),
            .light, scale: 2, busy: false, named: "Lab-revealed-landscape")
    }

    private func snap(
        _ section: LabSection, _ variant: Variant, width: CGFloat = 393, named name: String,
        file: StaticString = #filePath, testName: String = #function, line: UInt = #line
    ) {
        let scale: CGFloat? =
            switch section {
            case .photos: 1
            case .revealed: 2
            default: nil
            }
        snap(
            section.view, variant, width: width, scale: scale, busy: section == .actions,
            named: name, file: file, testName: testName, line: line)
    }

    private func snap(
        _ content: some View, _ variant: Variant, width: CGFloat = 393, scale: CGFloat?,
        busy: Bool, named name: String, file: StaticString = #filePath,
        testName: String = #function, line: UInt = #line
    ) {
        let traits =
            scale.map { scale in variant.traits.modifyingTraits { $0.displayScale = scale } }
            ?? variant.traits
        // The ideal height, as the Lab's scroll view gives it: under `.sizeThatFits` alone the
        // height proposed is zero, so text stays on one line and photographs vanish.
        let view =
            content
            .padding(.vertical, 24)
            .frame(width: width)
            .fixedSize(horizontal: false, vertical: true)
            .background(Palette.canvas)
            .environment(\.colorScheme, variant.scheme)
            .environment(\.dynamicTypeSize, variant.size)
        // As SnapshotTesting lays out a SwiftUI view to fit (no safe area, the size it fits in a
        // zero proposal), through a host that draws the busy spinner at rest.
        let host = StillHost(rootView: view)
        host.safeAreaRegions = []
        let fitted = host.sizeThatFits(in: .zero)
        assertSnapshot(
            of: host as UIViewController,
            as: .image(
                on: ViewImageConfig(safeArea: .zero, size: fitted, traits: traits),
                perceptualPrecision: 0.98, traits: traits),
            named: name, file: file, testName: testName, line: line)
        Spinners.check(host.view, busy: busy, name, file: file, line: line)
    }
}
