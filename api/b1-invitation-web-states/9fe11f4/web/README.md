# The invitation page's checking and failed states, at `9fe11f4`

`api/b1-invitation-web-states` (`docs/plans/api-b1-invitation-web-states.md`): handoff 9's frames 12
(`G02-web-checking`) and 13 (`G02-web-failed`) on `apps/web/public/i.html`, `i.css` and `i.js`. Taken in the api
thread's session at the pushed head, the slice's commit `b3fe0de6` with `main` (`6cd94fd`) merged in; that merge
changed nothing in `apps/web` (`git diff b3fe0de6 9fe11f4 -- apps/web` is empty), and every shot here is pixel for
pixel the one taken at `b3fe0de6` (ImageMagick `compare -metric AE`: 0 for all 23).

How: `tools/shots.mjs` serves `apps/web/public` as `https://tadayo.app` with `_headers`' rules (its CSP among them),
answers the API's POST as each state needs, and shoots Chromium (Playwright) at 393 by 852 points, scale 2, light,
dark and 200% text; `notes.json` has each state's POSTs, CSP violations (none), the status region's text and live
setting, the focused element, and the rects. `tools/aria.mjs` writes what the page exposes to assistive technology,
state by state (`aria.md`). `tools/ink.py` finds the rows that hold ink in a frame and in a shot, both at 393 by 852
(`ink.txt`).

- `frames-12-13-side-by-side.png`: frame 12, the page checking after Retry (Retry busy), frame 13, the page after a
  network failure, left to right. `ink.txt`: the rows match within 2 points: the wordmark at 125 (both), the title at
  263/264, the line at 298/299, Retry's slot at 424 to 473 (both), Get Tadayo at 505/507.
- `sheet-light.png`, `sheet-dark.png`: checking on the first load (Retry's place kept, empty), checking after Retry,
  failed (network), failed (an answer that isn't the API's), invited, unavailable, and the page without JavaScript.
- `sheet-xl.png`: at 200% text: checking on the first load, checking after Retry, failed, invited, no JavaScript.
  There the text outgrows the status block and the page scrolls, so the controls move between states; the handoff's
  `textZoom200` allows it.
- `sheet-after-retry.png`: a double press of Retry (one POST, `notes.json`), Retry then failed again, Retry then
  invited.
- `shots/`: every state alone.

Not shown here: VoiceOver on an iPhone, and the page on Safari itself (Chromium stands in); those come with the
founder's device check of the invitation link.
