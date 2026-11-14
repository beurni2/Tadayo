// swift-tools-version: 6.2
// TadayoCore: the app's logic that runs and is tested on Linux (docs/TECH-DESIGN.md sections 1, 2
// and 4). Foundation only: never SwiftUI, UIKit or Combine.
import PackageDescription

let package = Package(
    name: "TadayoCore",
    platforms: [.iOS(.v26), .macOS(.v14)],
    products: [
        .library(name: "TadayoCore", targets: ["TadayoCore"])
    ],
    targets: [
        .target(name: "TadayoCore"),
        .testTarget(name: "TadayoCoreTests", dependencies: ["TadayoCore"]),
    ]
)
