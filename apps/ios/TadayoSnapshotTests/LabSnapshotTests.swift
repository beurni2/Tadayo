import SnapshotTesting
import SwiftUI
import TadayoDesign
import XCTest

@testable import Tadayo

/// The Lab's sections at the 393-point width, in light, in dark, at the largest standard text
/// size and at the largest accessibility size (docs/TECH-DESIGN.md sections 2 and 4). The Lab
/// isn't an inventory state, so the contact sheets show these alone; book p34 and p35 and handoff
/// 0's brand-components are what they are judged against.
///
/// CI runs in record mode `never`: a snapshot with no committed reference fails, and its image
/// goes to the evidence branch for review (`tools/ci/ios_steps.py test`).
///
/// Every snapshot renders in sRGB, as the renders are, so each reference is an 8-bit PNG: under
/// the simulator's P3 gamut the photographs came out at 16 bits, 27 MB a variant. The photographs
/// look the same in every variant (only their heading changes, and the other sections show that
/// role in all four), so they're snapshotted once, light at the default size, and at 1x.
///
/// Each section is drawn through `StillHost`, so the busy button's spinner is at rest.
@MainActor
final class LabSnapshotTests: XCTestCase {
    enum Variant: CaseIterable {
        case light, dark, large, xl

        var suffix: String {
            switch self {
            case .light: ""
            case .dark: "-dark"
            case .large: "-large"
            case .xl: "-xl"
            }
        }

        var scheme: ColorScheme { self == .dark ? .dark : .light }

        var size: DynamicTypeSize {
            switch self {
            case .light, .dark: .large
            case .large: .xxxLarge
            case .xl: .accessibility5
            }
        }

        var traits: UITraitCollection {
            let category: UIContentSizeCategory =
                switch self {
                case .light, .dark: .large
                case .large: .extraExtraExtraLarge
                case .xl: .accessibilityExtraExtraExtraLarge
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
            let variants: [Variant] = section == .photos ? [.light] : Variant.allCases
            for variant in variants {
                let traits =
                    section == .photos
                    ? variant.traits.modifyingTraits { $0.displayScale = 1 }
                    : variant.traits
                // The ideal height, as the Lab's scroll view gives it: under `.sizeThatFits` alone
                // the height proposed is zero, so text stays on one line and photographs vanish.
                let view = section.view
                    .padding(.vertical, 24)
                    .frame(width: 393)
                    .fixedSize(horizontal: false, vertical: true)
                    .background(Palette.canvas)
                    .environment(\.colorScheme, variant.scheme)
                    .environment(\.dynamicTypeSize, variant.size)
                // As SnapshotTesting lays out a SwiftUI view to fit (no safe area, the size it
                // fits in a zero proposal), through a host that draws the busy spinner at rest.
                let host = StillHost(rootView: view)
                host.safeAreaRegions = []
                let fitted = host.sizeThatFits(in: .zero)
                let name = "Lab-\(section.rawValue)\(variant.suffix)"
                assertSnapshot(
                    of: host as UIViewController,
                    as: .image(
                        on: ViewImageConfig(safeArea: .zero, size: fitted, traits: traits),
                        perceptualPrecision: 0.98, traits: traits),
                    named: name)
                Spinners.check(host.view, busy: section == .actions, name)
            }
        }
    }
}
