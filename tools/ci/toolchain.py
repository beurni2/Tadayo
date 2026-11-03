"""The toolchain versions CI pins, in one place (docs/TECH-DESIGN.md sections 1, 8 and 9).

Read by tools/ci/ci_steps.py (`ci`), and by the `ios` workflow's scripts (the B0 plan's slice 9),
so the Swift that tests TadayoCore and TadayoAPI on Linux is the Swift of the Xcode that builds
the app. The Postgres image's digest lives in .github/workflows/ci.yml, where the service is
declared; `ci_steps.py db-check` fails when that server's major version isn't POSTGRES_MAJOR.

Evidence, read on 2026-11-03:
- XCODE_VERSION: the newest released Xcode on the `macos-26` runner image, its default, in the
  image's README (actions/runner-images, images/macos/macos-26-arm64-Readme.md, image
  20261026.0455.2). Xcode 27 exists only on a separate public-preview image, and the image keeps
  one major version of Xcode per macOS version.
- SWIFT_VERSION: swift.org's release list (https://www.swift.org/api/v1/install/releases.json)
  gives 6.3.3 (2026-06-29) `"xcode": "Xcode 26.6"` with `"xcode_release": true`, as it gives
  6.3.2 with Xcode 26.5 and 6.3 with Xcode 26.4. Apple's Xcode 26.6 release notes say only
  "Swift 6.3". The `ios` workflow cross-checks it on the runner: it prints
  `xcrun swift --version` and fails when it isn't SWIFT_VERSION (slice 9).
- SWIFT_IMAGE: Docker Hub's `swift:6.3.3-noble`, pinned to its multi-architecture digest.
- POSTGRES_MAJOR: the major version Supabase gives new projects, 17 (Supabase's changelog on
  self-hosting moving to 17, "what we currently default to on the Supabase platform").
  supabase.com itself is refused by the session's proxy (docs/LIMITATIONS.md); the Supabase
  probe reads `tadayo-dev`'s own version back in slice 10.

Changing a version is a CI-configuration change (docs/INVARIANTS.md T58): it goes in its own PR.
"""

XCODE_VERSION = "26.6"
SWIFT_VERSION = "6.3.3"
SWIFT_IMAGE = "swift:6.3.3-noble@sha256:1038d54c80063f5cdfabc4560990c30af64b5de8ebf28161deb22ca4ad5db866"
POSTGRES_MAJOR = 17
