# api/b1-invitation-web-states: the signed-out invitation page's checking and failed states, as handoff 9 draws them

B1 · api · block 1.2, step 11 (y). The signed-out invitation page (`apps/web/public/i.html`, `i.css`, `i.js`; `docs/plans/api-b0-spike-links-web.md`, PR #94) built `G02-web-checking` and `G02-web-failed` from spec, with no render. Handoff 9 drew them (frames 12 and 13) and wrote their rules, and the ios lane checked the handoff in PR #110 (`docs/design/handoff-9/check/handoff-9-check.md`, sections 3 and 6: "The signed-out page (frames 12 and 13) is the api lane's, in `apps/web`"). This PR builds them as drawn. No server change, no contract change, no migration, no workflow file.

## Sources

- The frames: `design/reference/claude-design/handoff-9/frames/G02-web-checking.png` and `.svg` (frame 12, the retry-in-progress variant) and `G02-web-failed.png` and `.svg` (frame 13), the same files as `design/reference/screens/G02-web-checking.png` and `G02-web-failed.png`.
- The rules: `component-contracts.json` `handoff9.webCheck` (viewport, wordmark, roles, `defaultGeometry`, `layout`, `firstLoad`, `afterRetry`, `liveRegion`, `focus`, `noScript`, `dark`, `textZoom200`, `getHint`).
- The words: `copy-contracts.json` `handoff9.strings` (`handoff9.web.checking`, `handoff9.web.noJavaScript`, `handoff9.web.get`, `handoff9.web.get.trialTestFlight.hint`, `handoff9.check.title`, `handoff9.check.network`, `handoff9.check.answeredFailure`, their `.vo`, `handoff9.check.retry.hint`, `handoff9.check.busy.value`, `handoff9.common.retry`) and `handoff9.failureStates.web.network` and `web.answeredFailure`; `handoff9.precedence.webFailure` ("do not instruct a connection check for an answered nonnetwork failure").
- The brand tokens, revision 1.1 (`design/reference/brand/brand-tokens.md`): `action`, `onAction`, `actionPressed`, `buttonRadius` 13, `primaryButtonMinimumHeight` 50, `button` 16/22 bold.
- T7 (the page shows no more than the inviter's name), T52 (no token in a log); FQ133 (Get Tadayo's address: the TestFlight app's App Store page in the closed trial).

## 1. What changes

**The four states, by answer** (`i.js` `outcomeOf`, `check`):

| State | When | Shows |
|---|---|---|
| checking | at once when the script starts, and again after Retry | "Checking invitation…" (utilityTitle 32/35 bold, primaryText); no Retry on the first load, its slot kept so Get Tadayo doesn't move; after Retry, Retry stays in place, busy (frame 12) |
| failed, network | no complete answer: the request failed (a connection, a CORS refusal, a redirect), the 15-second wait ran out, or the answer's body couldn't be read as JSON | "Couldn’t check the invitation link." (utilityTitle) over "Check your connection and try again." (body 17/23, secondaryText), Retry, Get Tadayo (frame 13) |
| failed, answered | an answer read in full that is neither a 404 nor a 200 with a name: a 400, a 429, a 5xx, a 200 without a usable name; and a page with no API named, which can't ask | "Couldn’t check the invitation link." over "Try again.", Retry, Get Tadayo |
| invited, unavailable | a 200 with a name; a 404 or a fragment that holds no token | as before (`G02-web`, `G02-web-revoked`) |

A 200 whose body isn't JSON is read as no usable answer, since a page the network put in the API's place (a captive portal) is a connection's fault; one that is JSON without a name is the server's answer.

**The live region** (`liveRegion`): one `role="status"`, `aria-live="polite"`, `aria-atomic="true"` element, in the HTML before any update, holding each state's title and line and nothing else. It stays polite after Retry; the script never turns it off, never focuses a heading, and sends no alert. Retry and Get Tadayo are outside it. PR #94 turned the region off after Retry and moved focus to each part's first line; both go.

**Retry** (`afterRetry`, `focus`): a button outside the region, shown in the failed state and, busy, in the checking state that follows Retry. A click while busy does nothing (the guard is the script's, not `disabled`, which would drop focus). Busy: `aria-disabled="true"`, its description "In progress" (`handoff9.check.busy.value`) in place of its hint, the label still "Retry", a decorative spinner (`aria-hidden`) to the label's left. Not busy: its description is the hint "Try checking this invitation link again.". The first load moves no focus. When the answer after Retry is a failure, Retry stays where it is, with the focus on it if the person left it there. When the answer is final (invited or unavailable), Retry goes; if it had the focus, the focus moves to Get Tadayo, and otherwise it stays where the person put it.

**The spinner:** an inline SVG of the frame's eight ticks (frame 12: centre, radii 4.32 to 6.88, stroke 2 with round caps, opacity 0.125 to 1 in eighths, `onAction`), 16 px square, its right edge 8 px from the label, which stays where it is without the spinner; turning in eight steps a second, and still under `prefers-reduced-motion: reduce`.

**Without JavaScript** (`noScript`): the wordmark, "Turn on JavaScript to check this invitation." (body, secondaryText) in a `<noscript>` where the state's title goes, and Get Tadayo. The checking part is hidden in the HTML and shown by the script when it starts, so a page with JavaScript off never says it is checking; Retry is hidden in the HTML too.

**Get Tadayo's hint** (`getHint`) follows its destination: "Open TestFlight in the App Store." under FQ133's trial address, in every state where it has a hint (invited, checking, failed). On the unavailable page its name stays handoff 4's "Get Tadayo from the App Store.", which handoff 9 doesn't change. Its visible label is unchanged.

**Layout** (`defaultGeometry`, at a 393 px viewport): the wordmark 144 × 45.64 from 124; in checking, failed and the no-JavaScript state, the status block from 260 (90.36 under the wordmark), at least 132 high, then Retry's slot 32 under it (424 to 474, 353 × 50, radius 13, `action` with `onAction` text, `actionPressed` while pressed, the brand's focus ring), and Get Tadayo's target 16 under that (490 to 540); the title's line 16 above its body. The contract's `statusBlockMinimum` is 134 with "+2 optical allowance", and its rects put Retry at 424, which is 132 + 32 from 260: the page follows the rects, which the SVG draws. Text in `rem`, gaps and the slot's least height in px, so at 200% text the text doubles, the blocks grow and the page scrolls (`textZoom200`); Retry and its slot are at least `max(50px, 2.75rem)` high, as Get Tadayo's target already is. At 200% the status block grows with its text, so the controls sit lower in a failure, whose text is longer, than in the checking after Retry: `textZoom200` asks for no fixed heights, so the controls keep their places only where the text fits the block. Dark: the dark tokens, `onAction` `#18233B` on `action` `#AFBEFF` (`dark`). The invited and unavailable states keep their gaps from PR #94.

## 2. Tests first (`apps/web/src/page.test.ts`)

- What each answer means: a failure carries its reason, network or answered, for each status, body and error above; the page with no API named is answered.
- What the page shows: one part at a time; the failed part shows its reason's line alone; Retry hidden but in failed and in a checking after Retry; Get Tadayo's hint and name by state.
- Retry: busy while it checks (`aria-disabled`, "In progress", still shown), a second click while busy asks nothing, focus never moved on a failure; a final answer moves the focus to Get Tadayo only if Retry had it; the first load moves none; the live region is never turned off.
- The files: one `role="status"` region, polite and atomic, holding the four parts and neither control; the checking part and Retry hidden in the HTML; the `<noscript>` line; every visible and spoken string of the page that handoff 9 gives, equal to `copy-contracts.json`'s; the spinner `aria-hidden` and still under reduced motion.

## 3. Look at it

The page in Chromium through Playwright, served from `apps/web/public` with `_headers`' rule and the POST answered by a route for each state, with Arimo, the frames' typeface, as the local `system-ui`: first-load checking, checking after Retry (busy), failed by network and by answer, light and dark, at 200% text (the root's font size doubled), JavaScript off; invited and unavailable again, unchanged from PR #94. Each at 393 wide beside its frame (`montage`), and measured: the rows of ink of the title, the line, Retry and Get Tadayo against frames 12 and 13 at 1x. In the browser too: focus after Retry and after a final answer, the region's text, the CSP blocking nothing.

## 4. Records

`design/reference/INVENTORY.md` is the ios lane's: `docs/PROGRESS.md`'s "Needs from the other lane" asks it to mark `G02-web-checking` and `G02-web-failed` built by the api lane in `apps/web` with this PR. The journal (block 1.2's step (y), the audit row for T7, a log entry, table 4.1's row), `docs/PROGRESS.md`. No ADR.

**Handoff 9's "Proposed by" on each candidate** (`invitationRosterTag`), weighed here as the journal's step (y) asks: the contract's `InvitationRosterEntry` names no proposer, and adding one would show an invitation's holder which member proposed each other candidate before they accept, beyond the inviter, the club and the roster that spec 04 and T7 give them. Raised as FQ140 with that default: the contract stays, and the tag stands alone on another candidate's row, as the ios lane built it. No contract change in this PR.

## 5. Risks and open points

- Safari on the founder's iPhone (VoiceOver reading the region once, focus after Retry, the aA menu's zoom, which scales px too) is the next device run's, with S6's report.
- The spinner is the frame's drawing in SVG; Safari draws it the same way, but its turning is untested on a phone.
