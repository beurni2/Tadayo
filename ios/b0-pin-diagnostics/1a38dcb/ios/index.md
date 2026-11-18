# ios/b0-pin-diagnostics/1a38dcb/ios

The `ios` workflow's evidence for `1a38dcbcd68b10de4fabadcf0b642b0248ce15fd` (https://github.com/beurni2/Tadayo/actions/runs/44421896356).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 2 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 222 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A02-code-xl: settled after 4 draws, SHA-256 6c918d4f d5d7959a 6c918d4f 6c918d4f; against the last draw, draw 2: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend-refused-dark: settled after 4 draws, SHA-256 819264a5 689d2198 819264a5 819264a5; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-diagnostics/1a38dcb/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-diagnostics/1a38dcb/ios/logs/build.log), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-diagnostics/1a38dcb/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-diagnostics/1a38dcb/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-diagnostics/1a38dcb/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-diagnostics/1a38dcb/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-diagnostics/1a38dcb/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-diagnostics/1a38dcb/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-diagnostics/1a38dcb/ios/logs/xcodegen.txt)
