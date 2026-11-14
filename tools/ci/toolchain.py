"""The toolchain versions CI pins, in one place (docs/TECH-DESIGN.md sections 1, 8 and 9).

Read by tools/ci/ci_steps.py (`ci`), and by tools/ci/ios_steps.py (the `ios` workflow, the B0
plan's slice 9), so the Swift that tests TadayoCore and TadayoAPI on Linux is the Swift of the
Xcode that builds the app. The Postgres image's digest lives in .github/workflows/ci.yml, where
the service is declared; `ci_steps.py db-check` fails when that server's major version isn't
POSTGRES_MAJOR.

Evidence, read on 2026-11-13 (the founder's decision of 05:06 UTC: iOS 26 is the minimum, and
one `ios` run builds once on Xcode 27 and tests on iOS 27.2, with the snapshot tests, and on iOS
26.5; iOS 17 and 18 are no longer tested):
- XCODE_VERSION: Xcode 27.2 (build 27B52, Apple's release of 2026-10-29) at
  /Applications/Xcode_27.2.app on GitHub's Xcode 27 runner image (actions/runner-images,
  images/macos/xcode-27-arm64-Readme.md, image 20261104.0337.1, macOS 27.0.1), where Xcode 27.1
  is the default and 27.0 is also installed. ios_steps.py selects it by its path, so the default
  doesn't matter. Its simulator SDK is iOS 27.2, the first runtime the tests run on. The image's
  labels are `xcode-27` and `xcode-27-xlarge`, arm64 only (runner-images' README); `ios.yml` runs
  on `xcode-27`, the standard runner, never the larger one, which is billed apart. That README
  still shows a "preview" badge on the Xcode 27 row, linking issue #14404 ("Xcode 27 is now
  available as a public preview", which the image's own README still lists among its
  announcements). The README puts Beta images outside the Actions SLA, doesn't say where a
  preview stands, and updates every image weekly. actionlint 1.7.12's list of GitHub's labels
  predates `xcode-27`, so .github/actionlint.yaml names it.
- SWIFT_VERSION: swift.org's release list (https://www.swift.org/api/v1/install/releases.json)
  gives 6.4.2 (2026-10-29) `"xcode": "Xcode 27.2"` with `"xcode_release": true`; it names no
  Swift for Xcode 27.1, and Apple's Xcode 27.2 release notes say only "Swift 6.4". The `ios`
  workflow cross-checks it on the runner: its `toolchain` step prints `xcrun swift --version` and
  fails when it isn't SWIFT_VERSION (slice 9).
- SWIFT_IMAGE: Docker Hub's `swift:6.4.2-noble`, pinned to its digest, read at 06:04 UTC on
  2026-11-13 from Docker Hub's tag API (https://hub.docker.com/v2/repositories/library/swift/tags/
  6.4.2-noble, last pushed 2026-11-12T03:50:44Z) and the registry's manifest: an OCI image index,
  multi-architecture, for linux/amd64 and linux/arm64/v8. Official images are rebuilt and their
  tags move (`swift:6.3.3-noble` has moved since it was pinned); the pinned digest doesn't.
- IOS_RUNTIMES: the iOS simulator runtimes every run tests on, in this order; the first is the
  build's destination and shares the Xcode's major. The image keeps "only three major.minor
  versions of platform tools and simulator runtimes" per installed Xcode (runner-images' README):
  on image 20261104.0337.1 they are iOS 27.0, 27.1 (one runtime, for iPhone Duo alone) and 27.2
  (two runtimes: one with the iPhones, one with iPhone Duo alone), and no iOS 26. So iOS 26.5 is
  downloaded on every run (`xcodebuild -downloadPlatform iOS -buildVersion 26.5`), and the
  simulator step's timeout in ios.yml allows for it.
- IOS_DOWNLOADS: the only runtimes a run may download. A later image may drop iOS 27.2 while it
  keeps Xcode 27.2; the simulator step then fails, naming it, rather than download it unseen and
  double every run's time.
- SNAPSHOT_RUNTIME: the runtime the founder chose for the snapshot tests, which run on one
  runtime only, the one the committed references are drawn on. The app names it in
  apps/ios/TadayoSnapshotTests/__Snapshots__/ios-version, which must hold exactly
  SNAPSHOT_RUNTIME (ios_steps.snapshot_runtime): a missing file, or anything else in it, fails
  the run before any command. So the file can name only the founder's runtime, and the snapshot
  tests can't move to another runtime without new references and a CI-configuration PR that
  changes this pin (T58). Before `ios/b0-snapshot-interim`, SNAPSHOT_RUNTIME_INTERIM, 26.5,
  stood in while the file was absent, the way back to iOS 26.5's references; it is gone.
- SIMULATOR_DEVICE: the `xcode-27` image's README lists the iPhone 17 simulator on iOS 27.0 and on
  the iPhones' iOS 27.2 runtime, and the `macos-26` image's README lists it on iOS 26.5, so every
  run uses that device on each runtime (docs/TECH-DESIGN.md section 8). There is no fallback: a
  runtime without it fails the simulator step.
- POSTGRES_MAJOR (read on 2026-11-03): the major version Supabase gives new projects, 17
  (Supabase's changelog on self-hosting moving to 17, "what we currently default to on the
  Supabase platform"). supabase.com itself is refused by the session's proxy
  (docs/LIMITATIONS.md); the Supabase probe reads `tadayo-dev`'s own version back in slice 10.

Evidence, read on 2026-11-03 for slice 9:
- XCODEGEN_VERSION: XcodeGen's newest release tag (`git ls-remote --tags
  https://github.com/yonaskolb/XcodeGen.git`). The `macos-26` image doesn't install XcodeGen,
  and neither does the `xcode-27` image (its README, image 20261104.0337.1, read on 2026-11-13).
- XCODEGEN_SHA256: the SHA-256 of that release's `xcodegen.zip`, downloaded over HTTPS from
  https://github.com/yonaskolb/XcodeGen/releases/download/2.46.0/xcodegen.zip (4,278,764
  bytes). tools/ci/ios_steps.py refuses to run a download with any other hash.

PACKAGE_PLUGINS (ADR-028): the `ios` build passes `-skipPackagePluginValidation`, so Xcode no
longer asks a person to trust each package build plugin in the app's graph. The build step reads
the build log for every plugin Xcode compiled or applied instead, and fails on one this doesn't
list, from another package, or on another target. A dependency that floats (`Package.resolved` is
ignored) can't bring one in unseen. Today the graph's only plugin is the Swift OpenAPI Generator's
(its build log in `ios` run 41961456622: `Compile plug-in “OpenAPIGenerator” in package
“swift-openapi-generator”`, `Apply build tool plug-in “OpenAPIGenerator” to target “TadayoAPI”`).

Changing a version or a plugin is a CI-configuration change (docs/INVARIANTS.md T58): it goes in
its own PR.
"""

XCODE_VERSION = "27.2"
SWIFT_VERSION = "6.4.2"
SWIFT_IMAGE = "swift:6.4.2-noble@sha256:23d9b28ad97fb1cf1999edc3a0cb265ee915ed42299a9344e7173d5a6d2b05f4"
POSTGRES_MAJOR = 17
XCODEGEN_VERSION = "2.46.0"
XCODEGEN_SHA256 = "4d9e34b62172d645eed6457cac13fc222569974098ef4ee9c3368bedf0196806"
SIMULATOR_DEVICE = "iPhone 17"
IOS_RUNTIMES = ("27.2", "26.5")
IOS_DOWNLOADS = ("26.5",)
SNAPSHOT_RUNTIME = "27.2"
# Each package build plugin Xcode may run: the package that declares it, and the targets it may
# be applied to.
PACKAGE_PLUGINS = {"OpenAPIGenerator": ("swift-openapi-generator", ("TadayoAPI",))}
