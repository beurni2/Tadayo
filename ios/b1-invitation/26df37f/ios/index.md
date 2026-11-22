# ios/b1-invitation/26df37f/ios

The `ios` workflow's evidence for `26df37f2169c5147718751bf8941e3a747ed13e0` (https://github.com/beurni2/Tadayo/actions/runs/45017999181).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `failed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 4 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 331 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A02-code-resend-failed-network-dark: settled after 3 draws, SHA-256 6742963d 2addfdad 2addfdad; against the last draw, draw 1: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot F01-error-no-club: settled after 4 draws, SHA-256 9c836df3 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 2: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`
- `warning: ScreenSnapshot H01-awaiting-activation-dark: settled after 3 draws, SHA-256 80303405 45d38acb 45d38acb; against the last draw, draw 1: 24163 pixels in x 117 to 667, y 1537 to 1661, by at most 2/255`
- `warning: ScreenSnapshot M01-error-no-club: settled after 3 draws, SHA-256 546af4c1 12777442 12777442; against the last draw, draw 1: 9175 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/xcodegen.txt)
