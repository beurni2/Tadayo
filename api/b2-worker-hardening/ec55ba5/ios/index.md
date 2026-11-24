# api/b2-worker-hardening/ec55ba5/ios

The `ios` workflow's evidence for `ec55ba52ea7a7b75a4ae3b2c296db6efa8a64950` (https://github.com/beurni2/Tadayo/actions/runs/45305516934).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 7 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G05-club-details-loading-xl: settled after 3 draws, SHA-256 0388192b de4cc2a5 de4cc2a5; against the last draw, draw 1: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G05-members-loading-dark: settled after 4 draws, SHA-256 1d56cc5c 9f8eb93f 1d56cc5c 1d56cc5c; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-checking-dark: settled after 4 draws, SHA-256 66587f6d 4e9e3e09 66587f6d 66587f6d; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-age-refused-dark: settled after 4 draws, SHA-256 5c543ddf 1afa719d 5c543ddf 5c543ddf; against the last draw, draw 2: 10835 pixels in x 31 to 304, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-age-saving-dark: settled after 4 draws, SHA-256 971887e3 bb32479f 971887e3 971887e3; against the last draw, draw 2: 11816 pixels in x 31 to 304, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-error-dark: settled after 3 draws, SHA-256 3d058d42 6506d0b0 6506d0b0; against the last draw, draw 1: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot F01-error-no-club: settled after 3 draws, SHA-256 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 1: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-worker-hardening/ec55ba5/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-worker-hardening/ec55ba5/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-worker-hardening/ec55ba5/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-worker-hardening/ec55ba5/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-worker-hardening/ec55ba5/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-worker-hardening/ec55ba5/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-worker-hardening/ec55ba5/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-worker-hardening/ec55ba5/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-worker-hardening/ec55ba5/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-worker-hardening/ec55ba5/ios/logs/xcodegen.txt)
