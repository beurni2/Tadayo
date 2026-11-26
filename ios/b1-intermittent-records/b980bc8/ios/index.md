# ios/b1-intermittent-records/b980bc8/ios

The `ios` workflow's evidence for `b980bc8b7171d2acadc03932a159e82556a965e5` (https://github.com/beurni2/Tadayo/actions/runs/45721264692).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 1 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot F01-error-no-club: settled after 3 draws, SHA-256 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 1: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-intermittent-records/b980bc8/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-intermittent-records/b980bc8/ios/logs/build.log), [crashes-26.5.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-intermittent-records/b980bc8/ios/logs/crashes-26.5.txt), [crashes-27.2.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-intermittent-records/b980bc8/ios/logs/crashes-27.2.txt), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-intermittent-records/b980bc8/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-intermittent-records/b980bc8/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-intermittent-records/b980bc8/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-intermittent-records/b980bc8/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-intermittent-records/b980bc8/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-intermittent-records/b980bc8/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-intermittent-records/b980bc8/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-intermittent-records/b980bc8/ios/logs/xcodegen.txt)
