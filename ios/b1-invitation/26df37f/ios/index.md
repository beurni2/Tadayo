# ios/b1-invitation/26df37f/ios

The `ios` workflow's evidence for `26df37f2169c5147718751bf8941e3a747ed13e0` (https://github.com/beurni2/Tadayo/actions/runs/45017999181).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 7 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 330 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G01-create: settled after 3 draws, SHA-256 34d2aeaf e363b9a9 e363b9a9; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G01-invite-name-failed-dark: settled after 4 draws, SHA-256 e8a0725b 212d1f79 e8a0725b e8a0725b; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot G05-club-details: settled after 3 draws, SHA-256 fec5cb63 8d5a6f2f 8d5a6f2f; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G05-members-failed-xl: settled after 3 draws, SHA-256 bf55b78b af68a48d af68a48d; against the last draw, draw 1: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-age-refused-dark: settled after 3 draws, SHA-256 1afa719d 5c543ddf 5c543ddf; against the last draw, draw 1: 10835 pixels in x 31 to 304, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-verify-unavailable-xl: settled after 3 draws, SHA-256 1317a068 d25294ed d25294ed; against the last draw, draw 1: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot F01-error-no-club: settled after 3 draws, SHA-256 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 1: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

| State | Status | File | Render | Sheet | Snapshot |
|---|---|---|---|---|---|
| `G05-members-failed-xl` | changed | `apps/ios/TadayoSnapshotTests/__Snapshots__/ClubDetailsSnapshotTests/testG05MembersFailed.G05-members-failed-xl.png` | no render of its own: judged against book p26 (design/reference/INVENTORY.md) | [G05-members-failed-xl.jpg](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/sheets/G05-members-failed-xl.jpg) | [G05-members-failed-xl.png](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/snapshots/G05-members-failed-xl.png) |

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-invitation/26df37f/ios/logs/xcodegen.txt)
