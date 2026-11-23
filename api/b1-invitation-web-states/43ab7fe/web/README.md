# api/b1-invitation-web-states at `43ab7fe`: round 1's fixes

The signed-out invitation page (`apps/web/public/i.html`, `i.css`, `i.js`) after PR #117's review round 1, in
Chromium through Playwright, served from `apps/web/public` with `_headers`' CSP and the POST answered by a route for
each state, at 393 wide, Arimo as the local `system-ui` (the frames' typeface). `tools/shots.mjs` made every shot and
`shots/notes.json`; `tools/aria.mjs` made `aria.md`.

- `frames-beside.png`: handoff 9's frame 12 (`G02-web-checking`), the page's checking after Retry, frame 13
  (`G02-web-failed`), the page's network failure.
- `sheet-light.png`, `sheet-dark.png`, `sheet-xl.png` (200% text, the root's font size doubled): checking (first load
  and after Retry), failed by network and by answer, invited, unavailable, JavaScript off.
- `sheet-retry.png`: Retry pressed and focused, light and dark; a double press (one request); after Retry a failure
  and an invitation (the focus on Get Tadayo); `retry-offline-frames` (10 offline retries); `same-tab-new-link`.
- `shots/notes.json`, per shot: requests and bodies sent, console errors, the status region's text as read
  (`innerText`) and height, Retry's and Get Tadayo's attributes, each element's rect. What round 1 asked to see:
  - at 200% text Retry's top is 679.95 in the checking after Retry and in the failure that follows (S2);
  - `retry-offline-frames.extra.framesBetweenCheckingAndFailure` is 1 for each of the 10 retries (W1);
  - `same-tab-new-link`: 2 requests, 2 bodies, the second link's answer shown (W3);
  - Retry's `aria-describedby` is `retry-busy retry-hint` while busy (S4);
  - Get Tadayo is `get-hint`-described with no other name in every state (S1).
- `aria.md`: the accessibility tree of each state, with the CSP's refusals (0 each). Get Tadayo is "Get Tadayo"
  everywhere.
- `breakages/`: 15 deliberate breakages of round 1's fixes (`breakages.py`), each caught by `apps/web`'s tests
  (`run.log`); the tree's hash the same before and after.

Not here: Safari on an iPhone (VoiceOver, the pressed colour under the `touchstart` listener, the aA menu's zoom),
the next device run's.
