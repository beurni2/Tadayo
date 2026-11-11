// swift-tools-version: 6.0
// TadayoDesign: the design system's tokens and the book's components (docs/TECH-DESIGN.md
// section 4, "Design system"; book p34, p35). It imports SwiftUI, so it compiles only on macOS:
// the `ios` workflow builds it with the app. Screens compose these; nothing defines its own colour
// or size (T44). The words its components own are in its own string catalog
// (`Sources/TadayoDesign/Localizable.xcstrings`, read with `bundle: .module`), never the app's:
// in the share extension the main bundle is the extension, which has no copy of the app's.
import PackageDescription

let package = Package(
    name: "TadayoDesign",
    defaultLocalization: "en",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "TadayoDesign", targets: ["TadayoDesign"])
    ],
    dependencies: [
        .package(path: "../TadayoCore")
    ],
    targets: [
        .target(
            name: "TadayoDesign",
            dependencies: ["TadayoCore"],
            resources: [.process("Localizable.xcstrings")]
        )
    ]
)
