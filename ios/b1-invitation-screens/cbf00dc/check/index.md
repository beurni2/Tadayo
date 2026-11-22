# Design handoff 9 beside B1 PR 6b (`ios/b1-invitation-screens`)

The check: `docs/design/handoff-9/check/handoff-9-check.md` (sections 2, 4 and 7) on the branch.

**Handoff 9's 20 frames**, as they arrived (`design/reference/claude-design/handoff-9/frames/`):
- `handoff-9-frames-1-6.png`: frames 1 to 6, which 6b adopts.
- `handoff-9-frames-7-13.png`: frames 7 to 13 (7 to 11 for 6d, `ios/b1-invitation-list`; 12 and 13 for the api lane's `apps/web`).
- `handoff-9-frames-14-20.png`: frames 14 to 20 (14 to 17 for `ios/b1-create-handoff-9`; 18 to 20 for `ios/b1-welcome`).

**6b's six states beside frames 1 to 6**, each row the frame, then the app in light, dark and the top of the largest text, drawn from the references `cbf00dc`'s `ios` run matched (45068037912) and, for `G02-opening`, that run's own images:
- `frame1-G02-checking-failed.png`
- `frame2-G02-opening.png`
- `frame3-G02-link-entry-signed-in-checking.png`
- `frame4-G02-link-entry-signed-in-invalid.png`
- `frame5-G02-link-entry-signed-in-cannot-check.png`
- `frame6-G02-changed-name-relaunch.png`

What they showed, and what the branch's ninth commit changes: Not now is centred under Accept, and a proposed person's avatar sits level with the top of their words, in every roster state (frame 6 and handoff 8's frames 9 and 15). Kept: the failure glyph (frames 4 and 5), the failure line's ink (frame 1), frame 6's count, and the paste control, which a snapshot can't draw.
