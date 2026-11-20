# ios/b0-ci-sim-diagnostics/464f980/ios

The `ios` workflow's evidence for `464f980068cd73fa007b9ca8092c0b49e0eb6795` (https://github.com/beurni2/Tadayo/actions/runs/44831422907).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 4 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 223 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot A03-profile-refused: didn't settle in 4 draws, SHA-256 e3b3d8bc 10872f7a e3b3d8bc 10872f7a; against the last draw, draw 1: 6369 pixels in x 30 to 305, y 123 to 214, by at most 18/255; draw 3: 6369 pixels in x 30 to 305, y 123 to 214, by at most 18/255`
- `warning: ScreenSnapshot A03-profile-saving: settled after 3 draws, SHA-256 a3d5fbcb 8610c7fd 8610c7fd; against the last draw, draw 1: 6670 pixels in x 30 to 305, y 123 to 214, by at most 18/255`
- `warning: ScreenSnapshot F01-error-no-club: settled after 3 draws, SHA-256 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 1: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`
- `warning: ScreenSnapshot H01-error-no-club: settled after 3 draws, SHA-256 37012c2b 07906202 07906202; against the last draw, draw 1: 9038 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-ci-sim-diagnostics/464f980/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-ci-sim-diagnostics/464f980/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-ci-sim-diagnostics/464f980/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-ci-sim-diagnostics/464f980/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-ci-sim-diagnostics/464f980/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-ci-sim-diagnostics/464f980/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-ci-sim-diagnostics/464f980/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-ci-sim-diagnostics/464f980/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-ci-sim-diagnostics/464f980/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b0-ci-sim-diagnostics/464f980/ios/logs/xcodegen.txt)
