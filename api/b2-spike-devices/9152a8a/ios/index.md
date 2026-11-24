# api/b2-spike-devices/9152a8a/ios

The `ios` workflow's evidence for `9152a8ae981617bcda78436af1f77d30d2647d46` (https://github.com/beurni2/Tadayo/actions/runs/45334746008).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 8 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G01-invite-name-failed-dark: settled after 4 draws, SHA-256 e8a0725b 212d1f79 e8a0725b e8a0725b; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot G05-club-details: settled after 3 draws, SHA-256 fec5cb63 8d5a6f2f 8d5a6f2f; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-changed: settled after 3 draws, SHA-256 0ed19adc 3a0c1976 3a0c1976; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-link-entry-signed-in-cannot-check: settled after 3 draws, SHA-256 ea67c857 24a9ffaf 24a9ffaf; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-link-entry-signed-in-cannot-check-refused-dark: settled after 4 draws, SHA-256 a11b445a 7941314c a11b445a a11b445a; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot F01-error-no-club-dark: settled after 3 draws, SHA-256 72717d34 8b7401b9 8b7401b9; against the last draw, draw 1: 23879 pixels in x 117 to 667, y 1537 to 1661, by at most 2/255`
- `warning: ScreenSnapshot H01-awaiting-activation: settled after 3 draws, SHA-256 c4ac0d12 e74f0d32 e74f0d32; against the last draw, draw 1: 9038 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`
- `warning: ScreenSnapshot M01-error-no-club-dark: settled after 3 draws, SHA-256 50e88e51 e8acc679 e8acc679; against the last draw, draw 1: 24605 pixels in x 117 to 667, y 1537 to 1661, by at most 2/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-devices/9152a8a/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-devices/9152a8a/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-devices/9152a8a/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-devices/9152a8a/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-devices/9152a8a/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-devices/9152a8a/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-devices/9152a8a/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-devices/9152a8a/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-devices/9152a8a/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-devices/9152a8a/ios/logs/xcodegen.txt)
