# ios/b1-ui-code-wait/b22e6a7/ios

The `ios` workflow's evidence for `b22e6a7bf4a7d75b4e6ce90b3c85aea63ffb2091` (https://github.com/beurni2/Tadayo/actions/runs/45523739699).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 3 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G05-club-details-loading-xl: settled after 4 draws, SHA-256 de4cc2a5 0388192b de4cc2a5 de4cc2a5; against the last draw, draw 2: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend-refused: settled after 3 draws, SHA-256 f3e589bc c051d6f2 c051d6f2; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-verify-failed-network: settled after 3 draws, SHA-256 1018e1e2 3fd1558c 3fd1558c; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b22e6a7/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b22e6a7/ios/logs/build.log), [crashes-26.5.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b22e6a7/ios/logs/crashes-26.5.txt), [crashes-27.2.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b22e6a7/ios/logs/crashes-27.2.txt), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b22e6a7/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b22e6a7/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b22e6a7/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b22e6a7/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b22e6a7/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b22e6a7/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b22e6a7/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/b22e6a7/ios/logs/xcodegen.txt)
