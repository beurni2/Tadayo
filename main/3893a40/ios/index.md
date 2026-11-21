# main/3893a40/ios

The `ios` workflow's evidence for `3893a409b3fa8028d2a3a7c66251b0bc7614d72a` (https://github.com/beurni2/Tadayo/actions/runs/44925728532).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 3 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 255 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A02-code-error-dark: settled after 3 draws, SHA-256 3d058d42 6506d0b0 6506d0b0; against the last draw, draw 1: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend-refused: settled after 3 draws, SHA-256 f3e589bc c051d6f2 c051d6f2; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-verify-unavailable: settled after 3 draws, SHA-256 7df72e6e 1236ea52 1236ea52; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`

| State | Status | File | Render | Sheet | Snapshot |
|---|---|---|---|---|---|
| `A03-profile-saving` | changed | `apps/ios/TadayoSnapshotTests/__Snapshots__/SignInSnapshotTests/testA03ProfileSaving.A03-profile-saving.png` | built from spec, awaiting render | [A03-profile-saving.jpg](https://github.com/beurni2/Tadayo/blob/evidence/main/3893a40/ios/sheets/A03-profile-saving.jpg) | [A03-profile-saving.png](https://github.com/beurni2/Tadayo/blob/evidence/main/3893a40/ios/snapshots/A03-profile-saving.png) |

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/main/3893a40/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/main/3893a40/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/3893a40/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/3893a40/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/main/3893a40/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/main/3893a40/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/main/3893a40/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/main/3893a40/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/3893a40/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/main/3893a40/ios/logs/xcodegen.txt)
