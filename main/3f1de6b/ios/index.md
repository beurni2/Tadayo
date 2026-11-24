# main/3f1de6b/ios

The `ios` workflow's evidence for `3f1de6b952348342f439d3bd4df58c51e3b00dc0` (https://github.com/beurni2/Tadayo/actions/runs/45299614463).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 7 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 423 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G01-create: settled after 3 draws, SHA-256 34d2aeaf e363b9a9 e363b9a9; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-changed: settled after 3 draws, SHA-256 3a0c1976 0ed19adc 0ed19adc; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-invitation-failed-refused-xl: settled after 3 draws, SHA-256 2acf7643 da8f1d14 da8f1d14; against the last draw, draw 1: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-age-failed-network: settled after 4 draws, SHA-256 dd445dbc 970332a1 dd445dbc dd445dbc; against the last draw, draw 2: 5433 pixels in x 30 to 305, y 123 to 214, by at most 2/255`
- `warning: ScreenSnapshot A02-age-saving: settled after 3 draws, SHA-256 1a4e4347 a7288b47 a7288b47; against the last draw, draw 1: 5730 pixels in x 30 to 305, y 123 to 214, by at most 2/255`
- `warning: ScreenSnapshot A02-code-error-waiting-dark: settled after 3 draws, SHA-256 001b6359 7a0d9f7e 7a0d9f7e; against the last draw, draw 1: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot F01-error-no-club: settled after 3 draws, SHA-256 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 1: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

| State | Status | File | Render | Sheet | Snapshot |
|---|---|---|---|---|---|
| `G02-changed` | changed | `apps/ios/TadayoSnapshotTests/__Snapshots__/InvitationSnapshotTests/testG02Changed.G02-changed.png` | design/reference/screens/G02-changed.png | [G02-changed.jpg](https://github.com/beurni2/Tadayo/blob/evidence/main/3f1de6b/ios/sheets/G02-changed.jpg) | [G02-changed.png](https://github.com/beurni2/Tadayo/blob/evidence/main/3f1de6b/ios/snapshots/G02-changed.png) |

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/main/3f1de6b/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/main/3f1de6b/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/3f1de6b/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/3f1de6b/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/main/3f1de6b/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/main/3f1de6b/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/main/3f1de6b/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/main/3f1de6b/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/3f1de6b/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/3f1de6b/ios/logs/xcodegen.txt)
