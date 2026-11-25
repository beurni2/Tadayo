# ios/b1-reading-settle/ee70ab1/ios

The `ios` workflow's evidence for `ee70ab1d69c0eea0455b35afd93114aac5366979` (https://github.com/beurni2/Tadayo/actions/runs/45536016313).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 5 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G01-invite-name-failed: settled after 3 draws, SHA-256 600257f0 7b290fee 7b290fee; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-invitation-failed-refused-xl: settled after 4 draws, SHA-256 da8f1d14 2acf7643 da8f1d14 da8f1d14; against the last draw, draw 2: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-link-entry-signed-in-cannot-check-refused: settled after 3 draws, SHA-256 a298c408 fba62ed2 fba62ed2; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-age-saving-dark: settled after 4 draws, SHA-256 971887e3 bb32479f 971887e3 971887e3; against the last draw, draw 2: 11816 pixels in x 31 to 304, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend-dark: settled after 3 draws, SHA-256 1646fad4 d1b9a5f5 d1b9a5f5; against the last draw, draw 1: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-reading-settle/ee70ab1/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-reading-settle/ee70ab1/ios/logs/build.log), [crashes-26.5.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-reading-settle/ee70ab1/ios/logs/crashes-26.5.txt), [crashes-27.2.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-reading-settle/ee70ab1/ios/logs/crashes-27.2.txt), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-reading-settle/ee70ab1/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-reading-settle/ee70ab1/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-reading-settle/ee70ab1/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-reading-settle/ee70ab1/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-reading-settle/ee70ab1/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-reading-settle/ee70ab1/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-reading-settle/ee70ab1/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-reading-settle/ee70ab1/ios/logs/xcodegen.txt)
