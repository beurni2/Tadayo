# main/c1fbdd3/ios

The `ios` workflow's evidence for `c1fbdd305e13060fbcda942b85a0bb7e02c8e498` (https://github.com/beurni2/Tadayo/actions/runs/44848520731).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 5 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 223 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A02-code-resend-refused: settled after 4 draws, SHA-256 c051d6f2 f3e589bc c051d6f2 c051d6f2; against the last draw, draw 2: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-typed: settled after 3 draws, SHA-256 bf7bf8e6 b3168405 b3168405; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A03-profile-refused: settled after 4 draws, SHA-256 10872f7a e3b3d8bc 10872f7a 10872f7a; against the last draw, draw 2: 6369 pixels in x 30 to 305, y 123 to 214, by at most 18/255`
- `warning: ScreenSnapshot F01-error-no-club: settled after 3 draws, SHA-256 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 1: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`
- `warning: ScreenSnapshot H01-error-no-club: settled after 3 draws, SHA-256 37012c2b 07906202 07906202; against the last draw, draw 1: 9038 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/main/c1fbdd3/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/main/c1fbdd3/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/c1fbdd3/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/c1fbdd3/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/main/c1fbdd3/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/main/c1fbdd3/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/main/c1fbdd3/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/main/c1fbdd3/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/c1fbdd3/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/c1fbdd3/ios/logs/xcodegen.txt)
