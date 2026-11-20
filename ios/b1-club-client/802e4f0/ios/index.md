# ios/b1-club-client/802e4f0/ios

The `ios` workflow's evidence for `802e4f00590255078148fef1f4e66df5f3af9da0` (https://github.com/beurni2/Tadayo/actions/runs/44759022421).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `not run`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `not run`
- Odd draws: 2 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 223 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A02-code: settled after 3 draws, SHA-256 12dab645 c7f47bdf c7f47bdf; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-verify-unavailable: settled after 3 draws, SHA-256 7df72e6e 1236ea52 1236ea52; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-club-client/802e4f0/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-club-client/802e4f0/ios/logs/build.log), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-club-client/802e4f0/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-club-client/802e4f0/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-club-client/802e4f0/ios/logs/test-27.2.log), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-club-client/802e4f0/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-club-client/802e4f0/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-club-client/802e4f0/ios/logs/xcodegen.txt)
