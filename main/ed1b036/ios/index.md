# main/ed1b036/ios

The `ios` workflow's evidence for `ed1b0360bb06de3721b37556daf7bd161dec9807` (https://github.com/beurni2/Tadayo/actions/runs/45371979400).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 5 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G02-checking-xl: settled after 3 draws, SHA-256 15c2c7e9 d126a740 d126a740; against the last draw, draw 1: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-invitation-failed-refused-xl: settled after 3 draws, SHA-256 2acf7643 da8f1d14 da8f1d14; against the last draw, draw 1: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-link-entry-signed-in-checking-dark: settled after 3 draws, SHA-256 1c149e97 6f343242 6f343242; against the last draw, draw 1: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend: settled after 4 draws, SHA-256 da69c00b 28260c45 da69c00b da69c00b; against the last draw, draw 2: 4081 pixels in x 305 to 489, y 825 to 858, by at most 161/255`
- `warning: ScreenSnapshot F01-error-no-club: settled after 3 draws, SHA-256 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 1: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/main/ed1b036/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/main/ed1b036/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/ed1b036/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/ed1b036/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/main/ed1b036/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/main/ed1b036/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/main/ed1b036/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/main/ed1b036/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/ed1b036/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/ed1b036/ios/logs/xcodegen.txt)
