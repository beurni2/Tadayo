# api/b2-spike-commit/3914acd/ios

The `ios` workflow's evidence for `3914acd8ac19a5f2cda3584a3b989fcc6aac6f6f` (https://github.com/beurni2/Tadayo/actions/runs/45298148759).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `failed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `failed`
- Odd draws: 13 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G01-create-failed: settled after 3 draws, SHA-256 2a86d94a 69d91981 69d91981; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G05-club-details: settled after 3 draws, SHA-256 fec5cb63 8d5a6f2f 8d5a6f2f; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-changed: settled after 3 draws, SHA-256 0ed19adc 3a0c1976 3a0c1976; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-changed-dark: settled after 3 draws, SHA-256 bc2e1423 e80e8e9f e80e8e9f; against the last draw, draw 1: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-changed-name-xl: settled after 3 draws, SHA-256 cf1fb628 fc0777ec fc0777ec; against the last draw, draw 1: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-invitation-accepting-xl: settled after 3 draws, SHA-256 8197ae49 16e049ac 16e049ac; against the last draw, draw 1: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-link-entry-signed-in-cannot-check: didn't settle in 4 draws, SHA-256 ea67c857 24a9ffaf ea67c857 24a9ffaf; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255; draw 3: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-link-entry-signed-in-cannot-check-refused-dark: settled after 3 draws, SHA-256 7941314c a11b445a a11b445a; against the last draw, draw 1: 2748 pixels in x 31 to 120, y 124 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-link-entry-signed-in-invalid-xl: settled after 4 draws, SHA-256 a5a4b4c8 cb12b7a2 a5a4b4c8 a5a4b4c8; against the last draw, draw 2: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-age-failed-network: settled after 3 draws, SHA-256 970332a1 dd445dbc dd445dbc; against the last draw, draw 1: 5433 pixels in x 30 to 305, y 123 to 214, by at most 2/255`
- `warning: ScreenSnapshot A02-code-error-resend-failed-network: settled after 4 draws, SHA-256 8f789862 8240bf56 8f789862 8f789862; against the last draw, draw 2: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend: settled after 3 draws, SHA-256 17b55557 da69c00b da69c00b; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot F01-error-no-club: settled after 3 draws, SHA-256 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 1: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-commit/3914acd/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-commit/3914acd/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-commit/3914acd/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-commit/3914acd/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-commit/3914acd/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-commit/3914acd/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-commit/3914acd/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-commit/3914acd/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-commit/3914acd/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/api/b2-spike-commit/3914acd/ios/logs/xcodegen.txt)
