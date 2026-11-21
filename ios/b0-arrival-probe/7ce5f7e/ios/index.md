# ios/b0-arrival-probe/7ce5f7e/ios

The `ios` workflow's evidence for `7ce5f7eee928f26c976efd1850a470269b1d8548` (https://github.com/beurni2/Tadayo/actions/runs/44842449226).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 4 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 220 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A02-age-refused-dark: settled after 4 draws, SHA-256 5c543ddf 1afa719d 5c543ddf 5c543ddf; against the last draw, draw 2: 10835 pixels in x 31 to 304, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-error: settled after 3 draws, SHA-256 093382d2 3f31e220 3f31e220; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-error-resend-failed-network: settled after 3 draws, SHA-256 8240bf56 8f789862 8f789862; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A03-profile-refused: settled after 3 draws, SHA-256 e3b3d8bc 10872f7a 10872f7a; against the last draw, draw 1: 6369 pixels in x 30 to 305, y 123 to 214, by at most 18/255`

| State | Status | File | Render | Sheet | Snapshot |
|---|---|---|---|---|---|
| `A03-profile-failed-network-dark` | changed | `apps/ios/TadayoSnapshotTests/__Snapshots__/SignInSnapshotTests/testA03ProfileFailedNetwork.A03-profile-failed-network-dark.png` | no render of its own: judged against book p26 (design/reference/INVENTORY.md) | [A03-profile-failed-network-dark.jpg](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/sheets/A03-profile-failed-network-dark.jpg) | [A03-profile-failed-network-dark.png](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/snapshots/A03-profile-failed-network-dark.png) |
| `A03-profile-failed-network-xl` | changed | `apps/ios/TadayoSnapshotTests/__Snapshots__/SignInSnapshotTests/testA03ProfileFailedNetwork.A03-profile-failed-network-xl.png` | no render of its own: judged against book p26 (design/reference/INVENTORY.md) | [A03-profile-failed-network-xl.jpg](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/sheets/A03-profile-failed-network-xl.jpg) | [A03-profile-failed-network-xl.png](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/snapshots/A03-profile-failed-network-xl.png) |
| `A03-profile-failed-network` | changed | `apps/ios/TadayoSnapshotTests/__Snapshots__/SignInSnapshotTests/testA03ProfileFailedNetwork.A03-profile-failed-network.png` | design/reference/screens/A03-profile-failed-network.png | [A03-profile-failed-network.jpg](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/sheets/A03-profile-failed-network.jpg) | [A03-profile-failed-network.png](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/snapshots/A03-profile-failed-network.png) |

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-arrival-probe/7ce5f7e/ios/logs/xcodegen.txt)
