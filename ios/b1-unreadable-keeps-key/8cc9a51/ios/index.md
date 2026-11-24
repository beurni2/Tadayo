# ios/b1-unreadable-keeps-key/8cc9a51/ios

The `ios` workflow's evidence for `8cc9a51a83d97c702d47c59c0646e6a3f1097f5f` (https://github.com/beurni2/Tadayo/actions/runs/45379275995).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 6 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G05-club-details-failed-xl: settled after 3 draws, SHA-256 1a116f6a 5d557f9e 5d557f9e; against the last draw, draw 1: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G05-members-failed-xl: settled after 3 draws, SHA-256 af68a48d bf55b78b bf55b78b; against the last draw, draw 1: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code: settled after 4 draws, SHA-256 c7f47bdf 12dab645 c7f47bdf c7f47bdf; against the last draw, draw 2: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend-refused: settled after 4 draws, SHA-256 c051d6f2 f3e589bc c051d6f2 c051d6f2; against the last draw, draw 2: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot F01-error-no-club: settled after 3 draws, SHA-256 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 1: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`
- `warning: ScreenSnapshot H01-awaiting-activation: settled after 3 draws, SHA-256 c4ac0d12 e74f0d32 e74f0d32; against the last draw, draw 1: 9038 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/xcodegen.txt)
