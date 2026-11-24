# ios/b1-unreadable-keeps-key/8cc9a51/ios

The `ios` workflow's evidence for `8cc9a51a83d97c702d47c59c0646e6a3f1097f5f` (https://github.com/beurni2/Tadayo/actions/runs/45379275995).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 8 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G01-create: settled after 3 draws, SHA-256 34d2aeaf e363b9a9 e363b9a9; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G01-invite-name-failed-dark: settled after 3 draws, SHA-256 212d1f79 e8a0725b e8a0725b; against the last draw, draw 1: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot G05-club-details: settled after 3 draws, SHA-256 fec5cb63 8d5a6f2f 8d5a6f2f; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-link-entry-signed-in-cannot-check-refused-dark: settled after 4 draws, SHA-256 a11b445a 7941314c a11b445a a11b445a; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-age-saving: settled after 3 draws, SHA-256 1a4e4347 a7288b47 a7288b47; against the last draw, draw 1: 5730 pixels in x 30 to 305, y 123 to 214, by at most 2/255`
- `warning: ScreenSnapshot A02-code-error-resend-failed-network: settled after 3 draws, SHA-256 8240bf56 8f789862 8f789862; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend-failed-network: settled after 3 draws, SHA-256 829dbf4d ed76810e ed76810e; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A03-profile-refused: settled after 3 draws, SHA-256 e3b3d8bc 10872f7a 10872f7a; against the last draw, draw 1: 6369 pixels in x 30 to 305, y 123 to 214, by at most 18/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-unreadable-keeps-key/8cc9a51/ios/logs/xcodegen.txt)
