// swift-tools-version: 6.2
// TadayoAPI: the client of the Tadayo API, generated from packages/contracts/openapi.yaml on every
// build by the Swift OpenAPI Generator's build plugin (docs/TECH-DESIGN.md section 4; ADR-005), so
// the client and the server can't drift. Foundation and the OpenAPI runtime only: it runs and is
// tested on Linux, like TadayoCore.
import PackageDescription

let package = Package(
    name: "TadayoAPI",
    platforms: [.iOS(.v26), .macOS(.v14)],
    products: [
        .library(name: "TadayoAPI", targets: ["TadayoAPI"])
    ],
    dependencies: [
        .package(path: "../TadayoCore"),
        .package(url: "https://github.com/apple/swift-openapi-generator", exact: "1.14.3"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", exact: "1.13.4"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", exact: "1.4.0"),
        // The runtime's own dependency, named because the middleware uses its types.
        .package(url: "https://github.com/apple/swift-http-types", exact: "1.8.0"),
    ],
    targets: [
        .target(
            name: "TadayoAPI",
            dependencies: [
                "TadayoCore",
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
                .product(name: "HTTPTypes", package: "swift-http-types"),
            ],
            plugins: [.plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator")]
        ),
        .testTarget(
            name: "TadayoAPITests",
            dependencies: [
                "TadayoAPI", "TadayoCore",
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "HTTPTypes", package: "swift-http-types"),
            ]),
    ]
)
