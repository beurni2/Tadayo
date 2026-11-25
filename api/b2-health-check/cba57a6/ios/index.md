# api/b2-health-check/cba57a6/ios

The `ios` workflow's evidence for `cba57a6789c4c86cfb5fe8e99e875687fec3e144` (https://github.com/beurni2/Tadayo/actions/runs/45583203758).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 4 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G02-changed: settled after 3 draws, SHA-256 0ed19adc 3a0c1976 3a0c1976; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-age-saving-dark: settled after 4 draws, SHA-256 971887e3 bb32479f 971887e3 971887e3; against the last draw, draw 2: 11816 pixels in x 31 to 304, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-typed-dark: settled after 4 draws, SHA-256 6bdec719 0bb466b2 6bdec719 6bdec719; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A03-profile-failed-network: settled after 3 draws, SHA-256 51e55688 6856712e 6856712e; against the last draw, draw 1: 6369 pixels in x 30 to 305, y 123 to 214, by at most 18/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/cba57a6/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/cba57a6/ios/logs/build.log), [crashes-26.5.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/cba57a6/ios/logs/crashes-26.5.txt), [crashes-27.2.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/cba57a6/ios/logs/crashes-27.2.txt), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/cba57a6/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/cba57a6/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/cba57a6/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/cba57a6/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/cba57a6/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/cba57a6/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/cba57a6/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-health-check/cba57a6/ios/logs/xcodegen.txt)
