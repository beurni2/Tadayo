# ios/b1-create/058f6e0/ios

The `ios` workflow's evidence for `058f6e0dd638eb89c58b9a270c16a423ad87d6f9` (https://github.com/beurni2/Tadayo/actions/runs/44952449221).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 3 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 255 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A02-code: settled after 3 draws, SHA-256 12dab645 c7f47bdf c7f47bdf; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-error-waiting: didn't settle in 4 draws, SHA-256 5b3aff73 86f0713a 5b3aff73 86f0713a; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255; draw 3: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot M01-error-no-club: settled after 3 draws, SHA-256 546af4c1 12777442 12777442; against the last draw, draw 1: 9175 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

| State | Status | File | Render | Sheet | Snapshot |
|---|---|---|---|---|---|
| `A02-code-error-waiting` | changed | `apps/ios/TadayoSnapshotTests/__Snapshots__/SignInSnapshotTests/testA02CodeErrorWaiting.A02-code-error-waiting.png` | built from spec, awaiting render | [A02-code-error-waiting.jpg](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-create/058f6e0/ios/sheets/A02-code-error-waiting.jpg) | [A02-code-error-waiting.png](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-create/058f6e0/ios/snapshots/A02-code-error-waiting.png) |

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-create/058f6e0/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-create/058f6e0/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-create/058f6e0/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-create/058f6e0/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-create/058f6e0/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-create/058f6e0/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-create/058f6e0/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-create/058f6e0/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-create/058f6e0/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-create/058f6e0/ios/logs/xcodegen.txt)
