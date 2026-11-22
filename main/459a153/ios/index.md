# main/459a153/ios

The `ios` workflow's evidence for `459a153a89263c0fde88457d9c796da469934366` (https://github.com/beurni2/Tadayo/actions/runs/45046261024).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 4 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 330 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G05-club-details: settled after 3 draws, SHA-256 fec5cb63 8d5a6f2f 8d5a6f2f; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code: settled after 3 draws, SHA-256 12dab645 c7f47bdf c7f47bdf; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-typed-dark: settled after 4 draws, SHA-256 6bdec719 0bb466b2 6bdec719 6bdec719; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot F01-error-no-club: settled after 3 draws, SHA-256 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 1: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

| State | Status | File | Render | Sheet | Snapshot |
|---|---|---|---|---|---|
| `A02-code-verify-failed-network` | changed | `apps/ios/TadayoSnapshotTests/__Snapshots__/SignInSnapshotTests/testA02CodeVerifyFailedNetwork.A02-code-verify-failed-network.png` | design/reference/screens/A02-code-verify-failed-network.png | [A02-code-verify-failed-network.jpg](https://github.com/beurni2/Tadayo/blob/evidence/main/459a153/ios/sheets/A02-code-verify-failed-network.jpg) | [A02-code-verify-failed-network.png](https://github.com/beurni2/Tadayo/blob/evidence/main/459a153/ios/snapshots/A02-code-verify-failed-network.png) |

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/main/459a153/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/main/459a153/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/459a153/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/459a153/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/main/459a153/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/main/459a153/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/main/459a153/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/main/459a153/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/459a153/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/459a153/ios/logs/xcodegen.txt)
