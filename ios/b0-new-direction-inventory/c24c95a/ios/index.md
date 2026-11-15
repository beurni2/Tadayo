# ios/b0-new-direction-inventory/c24c95a/ios

The `ios` workflow's evidence for `c24c95aff80f55cbd46349f0334cc54057aaa56e` (https://github.com/beurni2/Tadayo/actions/runs/43742526721).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 1 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 222 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A02-code-resend-failed-network-xl: settled after 3 draws, SHA-256 e9293262 600f0363 600f0363; against the last draw, draw 1: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-new-direction-inventory/c24c95a/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-new-direction-inventory/c24c95a/ios/logs/build.log), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-new-direction-inventory/c24c95a/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-new-direction-inventory/c24c95a/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-new-direction-inventory/c24c95a/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-new-direction-inventory/c24c95a/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-new-direction-inventory/c24c95a/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-new-direction-inventory/c24c95a/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-new-direction-inventory/c24c95a/ios/logs/xcodegen.txt)
