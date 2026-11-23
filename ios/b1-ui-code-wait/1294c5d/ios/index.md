# ios/b1-ui-code-wait/1294c5d/ios

The `ios` workflow's evidence for `1294c5d08a77eb0e665b97364739a121ce6dce8a` (https://github.com/beurni2/Tadayo/actions/runs/45176168837).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `not run`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `not run`
- Odd draws: 3 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 418 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G01-create-failed: settled after 3 draws, SHA-256 2a86d94a 69d91981 69d91981; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-link-entry-signed-in-checking: settled after 4 draws, SHA-256 3255feba 9d928b20 3255feba 3255feba; against the last draw, draw 2: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A03-profile-failed-network-dark: settled after 3 draws, SHA-256 f3d9b76f 1a74dda8 1a74dda8; against the last draw, draw 1: 12324 pixels in x 31 to 305, y 123 to 212, by at most 21/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/1294c5d/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/1294c5d/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/1294c5d/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/1294c5d/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/1294c5d/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/1294c5d/ios/logs/test-27.2.log), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/1294c5d/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/1294c5d/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/1294c5d/ios/logs/xcodegen.txt)
