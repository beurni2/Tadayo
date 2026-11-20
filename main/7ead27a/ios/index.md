# main/7ead27a/ios

The `ios` workflow's evidence for `7ead27a2aa3ec66890cf568ee417fd2bb7069d02` (https://github.com/beurni2/Tadayo/actions/runs/44826915446).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 4 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 223 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A02-code-error-resend-failed-network: settled after 3 draws, SHA-256 8240bf56 8f789862 8f789862; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A03-profile-failed-network-dark: settled after 3 draws, SHA-256 f3d9b76f 1a74dda8 1a74dda8; against the last draw, draw 1: 12324 pixels in x 31 to 305, y 123 to 212, by at most 21/255`
- `warning: ScreenSnapshot A03-profile-saving: settled after 3 draws, SHA-256 a3d5fbcb 8610c7fd 8610c7fd; against the last draw, draw 1: 6670 pixels in x 30 to 305, y 123 to 214, by at most 18/255`
- `warning: ScreenSnapshot F01-error-no-club: settled after 3 draws, SHA-256 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 1: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/main/7ead27a/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/main/7ead27a/ios/logs/build.log), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/7ead27a/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/main/7ead27a/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/main/7ead27a/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/main/7ead27a/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/main/7ead27a/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/7ead27a/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/7ead27a/ios/logs/xcodegen.txt)
