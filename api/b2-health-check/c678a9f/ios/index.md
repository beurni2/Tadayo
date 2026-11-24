# api/b2-health-check/c678a9f/ios

The `ios` workflow's evidence for `c678a9f5998506817fb8740aa22c35d523df092c` (https://github.com/beurni2/Tadayo/actions/runs/45462161561).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 4 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G01-invite-name-failed: settled after 3 draws, SHA-256 600257f0 7b290fee 7b290fee; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-age-failed-network: settled after 3 draws, SHA-256 970332a1 dd445dbc dd445dbc; against the last draw, draw 1: 5433 pixels in x 30 to 305, y 123 to 214, by at most 2/255`
- `warning: ScreenSnapshot A02-code-error-waiting: settled after 4 draws, SHA-256 5b3aff73 86f0713a 5b3aff73 5b3aff73; against the last draw, draw 2: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot H01-awaiting-activation: settled after 3 draws, SHA-256 c4ac0d12 e74f0d32 e74f0d32; against the last draw, draw 1: 9038 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/c678a9f/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/c678a9f/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/c678a9f/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/c678a9f/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/c678a9f/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/c678a9f/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/c678a9f/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/c678a9f/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/c678a9f/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/c678a9f/ios/logs/xcodegen.txt)
