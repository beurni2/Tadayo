# main/d4f1a97/ios

The `ios` workflow's evidence for `d4f1a9778ed4d11cd9ccfd317a33816721bfb76b` (https://github.com/beurni2/Tadayo/actions/runs/45542165590).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 7 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G05-club-details: settled after 3 draws, SHA-256 fec5cb63 8d5a6f2f 8d5a6f2f; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G05-club-details-xl: settled after 3 draws, SHA-256 d80aa04a 9de1c9fe 9de1c9fe; against the last draw, draw 1: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-changed-name-relaunch-xl: settled after 3 draws, SHA-256 9e550006 56949cb3 56949cb3; against the last draw, draw 1: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-link-entry-signed-in-cannot-check-refused-dark: settled after 4 draws, SHA-256 a11b445a 7941314c a11b445a a11b445a; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-age-refused-xl: settled after 4 draws, SHA-256 79c11c50 9c111216 79c11c50 79c11c50; against the last draw, draw 2: 8091 pixels in x 30 to 348, y 122 to 213, by at most 26/255`
- `warning: ScreenSnapshot A02-code-verify-unavailable: settled after 3 draws, SHA-256 7df72e6e 1236ea52 1236ea52; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A03-profile-refused: settled after 3 draws, SHA-256 e3b3d8bc 10872f7a 10872f7a; against the last draw, draw 1: 6369 pixels in x 30 to 305, y 123 to 214, by at most 18/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/main/d4f1a97/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/main/d4f1a97/ios/logs/build.log), [crashes-26.5.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/d4f1a97/ios/logs/crashes-26.5.txt), [crashes-27.2.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/d4f1a97/ios/logs/crashes-27.2.txt), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/d4f1a97/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/d4f1a97/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/main/d4f1a97/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/main/d4f1a97/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/main/d4f1a97/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/main/d4f1a97/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/d4f1a97/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/d4f1a97/ios/logs/xcodegen.txt)
