# ios/b1-ui-code-wait/6e8ba7b/ios

The `ios` workflow's evidence for `6e8ba7b8571732f916ef1c634053103e9d81d295` (https://github.com/beurni2/Tadayo/actions/runs/45295563483).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 9 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G01-create: settled after 3 draws, SHA-256 34d2aeaf e363b9a9 e363b9a9; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-link-entry-signed-in-cannot-check-refused: settled after 3 draws, SHA-256 a298c408 fba62ed2 fba62ed2; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-age-failed-network: settled after 3 draws, SHA-256 dd445dbc 970332a1 970332a1; against the last draw, draw 1: 5433 pixels in x 30 to 305, y 123 to 214, by at most 2/255`
- `warning: ScreenSnapshot A02-age-refused-dark: settled after 3 draws, SHA-256 1afa719d 5c543ddf 5c543ddf; against the last draw, draw 1: 10835 pixels in x 31 to 304, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-age-saving: settled after 3 draws, SHA-256 1a4e4347 a7288b47 a7288b47; against the last draw, draw 1: 5730 pixels in x 30 to 305, y 123 to 214, by at most 2/255`
- `warning: ScreenSnapshot A02-code-error-resend-failed-network: settled after 3 draws, SHA-256 8240bf56 8f789862 8f789862; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend-failed-network-dark: settled after 3 draws, SHA-256 6742963d 2addfdad 2addfdad; against the last draw, draw 1: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend-refused-dark: settled after 4 draws, SHA-256 819264a5 689d2198 819264a5 819264a5; against the last draw, draw 2: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot F01-error-no-club: settled after 3 draws, SHA-256 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 1: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/6e8ba7b/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/6e8ba7b/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/6e8ba7b/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/6e8ba7b/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/6e8ba7b/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/6e8ba7b/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/6e8ba7b/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/6e8ba7b/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/6e8ba7b/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-ui-code-wait/6e8ba7b/ios/logs/xcodegen.txt)
