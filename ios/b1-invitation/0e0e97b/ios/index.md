# ios/b1-invitation/0e0e97b/ios

The `ios` workflow's evidence for `0e0e97bd4cca713587a764d3097a25743ec1c03d` (https://github.com/beurni2/Tadayo/actions/runs/45012983190).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `failed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 5 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 331 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G01-invite-people-revoked-dark: settled after 4 draws, SHA-256 a2821d81 b7ac91e1 a2821d81 a2821d81; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-age-refused-dark: settled after 4 draws, SHA-256 5c543ddf 1afa719d 5c543ddf 5c543ddf; against the last draw, draw 2: 10835 pixels in x 31 to 304, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-age-saving: settled after 3 draws, SHA-256 7212b970 fcc7237c fcc7237c; against the last draw, draw 1: 5730 pixels in x 30 to 305, y 123 to 214, by at most 2/255`
- `warning: ScreenSnapshot A03-profile-failed-network: settled after 3 draws, SHA-256 51e55688 6856712e 6856712e; against the last draw, draw 1: 6369 pixels in x 30 to 305, y 123 to 214, by at most 18/255`
- `warning: ScreenSnapshot A03-profile-refused-dark: settled after 3 draws, SHA-256 94b87ad3 6ebba93c 6ebba93c; against the last draw, draw 1: 12324 pixels in x 31 to 305, y 123 to 212, by at most 21/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/0e0e97b/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/0e0e97b/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/0e0e97b/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/0e0e97b/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/0e0e97b/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/0e0e97b/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/0e0e97b/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/0e0e97b/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/0e0e97b/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/0e0e97b/ios/logs/xcodegen.txt)
