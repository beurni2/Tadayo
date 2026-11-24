# ios/b1-audit-b3/aff83d8/ios

The `ios` workflow's evidence for `aff83d8c1ec53a608cd7029e020b3df92bc5976f` (https://github.com/beurni2/Tadayo/actions/runs/45409441164).

- Xcode `27.2`, Swift `6.4.2`, simulator SDK `27.2`
- iOS `27.2` on `iPhone 17`: tests `passed`, with the snapshot tests
- iOS `26.5` on `iPhone 17`: tests `passed`, without the snapshot tests
- References: iOS `27.2` (the ios-version file)
- Tests: `passed`
- Odd draws: 9 in `logs/test-27.2.log`, below
- Carries the states this branch touches; 424 snapshot(s) not carried

Odd draws: each a screen whose drawing took a third draw or more (`ScreenSnapshot.settled`; the system's glass, `docs/LIMITATIONS.md`, 2026-11-14). One odd draw passes; a second, or no two draws alike, fails the test.

- `warning: ScreenSnapshot G05-members-failed-xl: settled after 3 draws, SHA-256 af68a48d bf55b78b bf55b78b; against the last draw, draw 1: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot G02-link-entry-signed-in-xl: settled after 4 draws, SHA-256 f0577ebc 6d9e1a09 f0577ebc f0577ebc; against the last draw, draw 2: 1871 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code: settled after 3 draws, SHA-256 12dab645 c7f47bdf c7f47bdf; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-error-waiting: settled after 4 draws, SHA-256 5b3aff73 86f0713a 5b3aff73 5b3aff73; against the last draw, draw 2: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend: settled after 3 draws, SHA-256 17b55557 da69c00b da69c00b; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A02-code-resend-failed-network: settled after 3 draws, SHA-256 829dbf4d ed76810e ed76810e; against the last draw, draw 1: 1855 pixels in x 30 to 121, y 123 to 212, by at most 2/255`
- `warning: ScreenSnapshot A03-profile-refused: settled after 3 draws, SHA-256 e3b3d8bc 10872f7a 10872f7a; against the last draw, draw 1: 6369 pixels in x 30 to 305, y 123 to 214, by at most 18/255`
- `warning: ScreenSnapshot A03-profile-saving: settled after 3 draws, SHA-256 44108711 4e7737c3 4e7737c3; against the last draw, draw 1: 6670 pixels in x 30 to 305, y 123 to 214, by at most 18/255`
- `warning: ScreenSnapshot F01-error-no-club: settled after 3 draws, SHA-256 8cec8ef7 9c836df3 9c836df3; against the last draw, draw 1: 9455 pixels in x 118 to 668, y 1535 to 1662, by at most 17/255`

Logs: [attachments-manifest.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-audit-b3/aff83d8/ios/logs/attachments-manifest.json), [build.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-audit-b3/aff83d8/ios/logs/build.log), [runner.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-audit-b3/aff83d8/ios/logs/runner.txt), [simulators.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-audit-b3/aff83d8/ios/logs/simulators.txt), [test-26.5.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-audit-b3/aff83d8/ios/logs/test-26.5.log), [test-27.2.log](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-audit-b3/aff83d8/ios/logs/test-27.2.log), [test-summary-26.5.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-audit-b3/aff83d8/ios/logs/test-summary-26.5.json), [test-summary-27.2.json](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-audit-b3/aff83d8/ios/logs/test-summary-27.2.json), [toolchain.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-audit-b3/aff83d8/ios/logs/toolchain.txt), [xcodegen.txt](https://github.com/beurni2/Tadayo/blob/evidence/ios/b1-audit-b3/aff83d8/ios/logs/xcodegen.txt)
