# api/b2-new-member-day/9dc210a/ios

The `ios` workflow's evidence for `9dc210af4ab0fc259570625eb21132585fcb4200` (https://github.com/beurni2/Tadayo/actions/runs/44816001499).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 3 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 223 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A02-code-error-waiting: settled after 3 draws, SHA-256 86f0713a 5b3aff73 5b3aff73; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend: settled after 3 draws, SHA-256 17b55557 da69c00b da69c00b; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot F01-error-no-club: settled after 3 draws, SHA-256 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 1: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-new-member-day/9dc210a/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-new-member-day/9dc210a/ios/logs/build.log), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-new-member-day/9dc210a/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-new-member-day/9dc210a/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-new-member-day/9dc210a/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-new-member-day/9dc210a/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-new-member-day/9dc210a/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-new-member-day/9dc210a/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-new-member-day/9dc210a/ios/logs/xcodegen.txt)
