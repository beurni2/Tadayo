# ios/b1-design-handoff-8/3e36efb/ios

The `ios` workflow's evidence for `3e36efb0347f6c20b054352a6e044cfdc54438fe` (https://github.com/beurni2/Tadayo/actions/runs/44814216850).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 1 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 223 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A02-code-typed-dark: settled after 4 draws, SHA-256 6bdec719 0bb466b2 6bdec719 6bdec719; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-design-handoff-8/3e36efb/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-design-handoff-8/3e36efb/ios/logs/build.log), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-design-handoff-8/3e36efb/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-design-handoff-8/3e36efb/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-design-handoff-8/3e36efb/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-design-handoff-8/3e36efb/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-design-handoff-8/3e36efb/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-design-handoff-8/3e36efb/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-design-handoff-8/3e36efb/ios/logs/xcodegen.txt)
