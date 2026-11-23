# ios/b1-ui-code-wait/b6e18c4/ios

The `ios` workflow's evidence for `b6e18c4a7aa1f54af7e266c161d1bffee17de8cb` (https://github.com/beurni2/Tadayo/actions/runs/45154528212).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `not run`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `not run`
- Odd draws: 3 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 418 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A02-age-refused: settled after 3 draws, SHA-256 0f01f245 788f0d04 788f0d04; against the last draw, draw 1: 5433 pixels in x 30 to 305, y 123 to 214, by at most 2/255`
- `warning: ScreenSnapshot A02-code-error-xl: settled after 4 draws, SHA-256 3e860fd8 cefd280c 3e860fd8 3e860fd8; against the last draw, draw 2: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend-refused: settled after 4 draws, SHA-256 c051d6f2 f3e589bc c051d6f2 c051d6f2; against the last draw, draw 2: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b6e18c4/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b6e18c4/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b6e18c4/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b6e18c4/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b6e18c4/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b6e18c4/ios/logs/test-27.2.log), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b6e18c4/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b6e18c4/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b6e18c4/ios/logs/xcodegen.txt)
