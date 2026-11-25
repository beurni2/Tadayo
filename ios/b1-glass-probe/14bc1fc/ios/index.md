# ios/b1-glass-probe/14bc1fc/ios

The `ios` workflow's evidence for `14bc1fcb5d1b71399ebfb2aca977a52f653333cd` (https://github.com/beurni2/Tadayo/actions/runs/45565897663).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `not run`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 1 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G02-changed: settled after 3 draws, SHA-256 0ed19adc 3a0c1976 3a0c1976; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-glass-probe/14bc1fc/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-glass-probe/14bc1fc/ios/logs/build.log), [crashes-27.2.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-glass-probe/14bc1fc/ios/logs/crashes-27.2.txt), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-glass-probe/14bc1fc/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-glass-probe/14bc1fc/ios/logs/simulators.txt), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-glass-probe/14bc1fc/ios/logs/test-27.2.log), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-glass-probe/14bc1fc/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-glass-probe/14bc1fc/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-glass-probe/14bc1fc/ios/logs/xcodegen.txt)
