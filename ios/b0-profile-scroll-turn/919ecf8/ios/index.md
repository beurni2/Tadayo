# ios/b0-profile-scroll-turn/919ecf8/ios

The `ios` workflow's evidence for `919ecf87397194ca3a255ef71d093eb4c8d89bb4` (https://github.com/beurni2/Tadayo/actions/runs/44866816565).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 2 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 223 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A02-age-failed-network-xl: settled after 3 draws, SHA-256 de32d2e5 80f2478e 80f2478e; against the last draw, draw 1: 8091 pixels in x 30 to 348, y 122 to 213, by at most 26/255`
- `warning: ScreenSnapshot A02-code-verify-failed-network: settled after 3 draws, SHA-256 1018e1e2 3fd1558c 3fd1558c; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-profile-scroll-turn/919ecf8/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-profile-scroll-turn/919ecf8/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-profile-scroll-turn/919ecf8/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-profile-scroll-turn/919ecf8/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-profile-scroll-turn/919ecf8/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-profile-scroll-turn/919ecf8/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-profile-scroll-turn/919ecf8/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-profile-scroll-turn/919ecf8/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-profile-scroll-turn/919ecf8/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-profile-scroll-turn/919ecf8/ios/logs/xcodegen.txt)
