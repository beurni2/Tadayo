# ios/b0-pin-stuck-shot-check/92fb7de/ios

The `ios` workflow's evidence for `92fb7debd2717c8fa601e491001963f387fa9168` (https://github.com/beurni2/Tadayo/actions/runs/44453939292).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `failed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 1 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 222 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A03-profile-failed-network-dark: settled after 4 draws, SHA-256 1a74dda8 f3d9b76f 1a74dda8 1a74dda8; against the last draw, draw 2: 12324 pixels in x 31 to 305, y 123 to 212, by at most 21/255`

| State | Status | File | Render | Sheet | Snapshot |
|---|---|---|---|---|---|
| `stuck-frame` | new | `SignInUITests/testVerifyCodeIsPinnedAboveTheKeyboardAtTheLargestText.stuck-frame.png` | not a state in design/reference/INVENTORY.md | [stuck-frame.jpg](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-stuck-shot-check/92fb7de/ios/sheets/stuck-frame.jpg) | [stuck-frame.png](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-stuck-shot-check/92fb7de/ios/snapshots/stuck-frame.png) |

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-stuck-shot-check/92fb7de/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-stuck-shot-check/92fb7de/ios/logs/build.log), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-stuck-shot-check/92fb7de/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-stuck-shot-check/92fb7de/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-stuck-shot-check/92fb7de/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-stuck-shot-check/92fb7de/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-stuck-shot-check/92fb7de/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-stuck-shot-check/92fb7de/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-pin-stuck-shot-check/92fb7de/ios/logs/xcodegen.txt)
