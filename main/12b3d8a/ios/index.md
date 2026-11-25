# main/12b3d8a/ios

The `ios` workflow's evidence for `12b3d8ad22d781b1fb1f9c7d51b06ac571db1554` (https://github.com/beurni2/Tadayo/actions/runs/45523314156).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `failed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 6 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 422 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G02-changed: settled after 3 draws, SHA-256 3a0c1976 0ed19adc 0ed19adc; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-changed-name-relaunch-xl: settled after 4 draws, SHA-256 56949cb3 9e550006 56949cb3 56949cb3; against the last draw, draw 2: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-checking-failed-retrying-dark: settled after 4 draws, SHA-256 268b18a7 cc345e77 268b18a7 268b18a7; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-link-entry-signed-in-checking: settled after 3 draws, SHA-256 3255feba 9d928b20 9d928b20; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend: settled after 4 draws, SHA-256 da69c00b 17b55557 da69c00b da69c00b; against the last draw, draw 2: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot M01-error-no-club: settled after 3 draws, SHA-256 546af4c1 12777442 12777442; against the last draw, draw 1: 9175 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

| State | Status | File | Render | Sheet | Snapshot |
|---|---|---|---|---|---|
| `G02-changed` | changed | `apps/ios/TadayoSnapshotTests/__Snapshots__/InvitationSnapshotTests/testG02Changed.G02-changed.png` | design/reference/screens/G02-changed.png | [G02-changed.jpg](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/sheets/G02-changed.jpg) | [G02-changed.png](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/snapshots/G02-changed.png) |
| `G02-link-entry-signed-in-checking` | changed | `apps/ios/TadayoSnapshotTests/__Snapshots__/InvitationSnapshotTests/testG02LinkEntrySignedInChecking.G02-link-entry-signed-in-checking.png` | design/reference/screens/G02-link-entry-signed-in-checking.png | [G02-link-entry-signed-in-checking.jpg](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/sheets/G02-link-entry-signed-in-checking.jpg) | [G02-link-entry-signed-in-checking.png](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/snapshots/G02-link-entry-signed-in-checking.png) |

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/logs/build.log), [crashes-26.5.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/logs/crashes-26.5.txt), [crashes-27.2.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/logs/crashes-27.2.txt), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/12b3d8a/ios/logs/xcodegen.txt)
