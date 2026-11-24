# ios/b1-ci-crash-reports/5f79091/ios

The `ios` workflow's evidence for `5f7909101fa20a3b4e51275be6c68ce14798e53e` (https://github.com/beurni2/Tadayo/actions/runs/45480952627).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 6 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G01-create-failed-dark: settled after 4 draws, SHA-256 335a4128 e0376219 335a4128 335a4128; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot G01-invite-people-failed-xl: settled after 4 draws, SHA-256 4116285c a67f6d5e 4116285c 4116285c; against the last draw, draw 2: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-changed: settled after 3 draws, SHA-256 0ed19adc 3a0c1976 3a0c1976; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-link-entry-signed-in-cannot-check-dark: settled after 4 draws, SHA-256 3cbce0f7 346d53f4 3cbce0f7 3cbce0f7; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend-failed-network: settled after 3 draws, SHA-256 829dbf4d ed76810e ed76810e; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot M01-error-no-club: settled after 3 draws, SHA-256 546af4c1 12777442 12777442; against the last draw, draw 1: 9175 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ci-crash-reports/5f79091/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ci-crash-reports/5f79091/ios/logs/build.log), [crashes-26.5.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ci-crash-reports/5f79091/ios/logs/crashes-26.5.txt), [crashes-27.2.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ci-crash-reports/5f79091/ios/logs/crashes-27.2.txt), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ci-crash-reports/5f79091/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ci-crash-reports/5f79091/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ci-crash-reports/5f79091/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ci-crash-reports/5f79091/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ci-crash-reports/5f79091/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ci-crash-reports/5f79091/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ci-crash-reports/5f79091/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ci-crash-reports/5f79091/ios/logs/xcodegen.txt)
