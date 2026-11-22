# api/b0-spike-links/a74d827/ios

The `ios` workflow's evidence for `a74d827a1f025e4a21c01a6638093ed5dad14738` (https://github.com/beurni2/Tadayo/actions/runs/44967380497).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 2 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 255 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A03-profile-failed-network: settled after 3 draws, SHA-256 6856712e 51e55688 51e55688; against the last draw, draw 1: 6369 pixels in x 30 to 305, y 123 to 214, by at most 18/255`
- `warning: ScreenSnapshot F01-error-no-club: settled after 3 draws, SHA-256 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 1: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

| State | Status | File | Render | Sheet | Snapshot |
|---|---|---|---|---|---|
| `A03-profile-failed-network` | changed | `apps/ios/TadayoSnapshotTests/__Snapshots__/SignInSnapshotTests/testA03ProfileFailedNetwork.A03-profile-failed-network.png` | design/reference/screens/A03-profile-failed-network.png | [A03-profile-failed-network.jpg](https://github.com/beurni2/Tadayo/blob/evidence/api/b0-spike-links/a74d827/ios/sheets/A03-profile-failed-network.jpg) | [A03-profile-failed-network.png](https://github.com/beurni2/Tadayo/blob/evidence/api/b0-spike-links/a74d827/ios/snapshots/A03-profile-failed-network.png) |

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b0-spike-links/a74d827/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b0-spike-links/a74d827/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b0-spike-links/a74d827/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b0-spike-links/a74d827/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b0-spike-links/a74d827/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b0-spike-links/a74d827/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b0-spike-links/a74d827/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b0-spike-links/a74d827/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b0-spike-links/a74d827/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b0-spike-links/a74d827/ios/logs/xcodegen.txt)
