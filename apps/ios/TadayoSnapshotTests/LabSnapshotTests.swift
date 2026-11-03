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
            return UITraitCollection(traitsFrom: [
                UITraitCollection(userInterfaceStyle: self == .dark ? .dark : .light),
                UITraitCollection(preferredContentSizeCategory: category),
            ])
        }
    }

    func testLabSections() {
        for section in LabSection.allCases {
            for variant in Variant.allCases {
                let view = section.view
                    .padding(.vertical, 24)
                    .frame(width: 393)
                    .background(Palette.canvas)
                    .environment(\.colorScheme, variant.scheme)
                    .environment(\.dynamicTypeSize, variant.size)
                assertSnapshot(
                    of: view,
                    as: .image(
                        perceptualPrecision: 0.98, layout: .sizeThatFits, traits: variant.traits),
                    named: "Lab-\(section.rawValue)\(variant.suffix)")
            }
        }
    }
}
