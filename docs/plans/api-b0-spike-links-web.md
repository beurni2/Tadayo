# api/b0-spike-links-web: the invitation page on tadayo.app, and the API's CORS rule for it

B0 · api · spike S6's `apps/web` part (`docs/plans/B0.md`, section 4, order 3): "The invitation page on Cloudflare Pages (`/i#<token>`, the inviter's name fetched with the token in the body, "Get Tadayo" as a placeholder), `apple-app-site-association`, the universal link into the app; a check that the token reaches no server log." The association file merged with PR #91 (`4e6d36e`), and the founder saw it served at `tadayo.app` in Safari at 01:41 UTC on 2026-11-21. This PR is the page, and the one server change the page needs: a browser on `tadayo.app` may read `previewInvitationWeb`'s answer (`docs/plans/api-b1-clubs.md`: "The web page that calls `previewInvitationWeb` (`apps/web`, with its CORS rule) comes with its own PR").

It merges to `main` first, reviewed and clean enough to keep, because only `deploy-dev` on `main` publishes Pages to `tadayo.app` (B0 section 4, S6's row). Its merge's `deploy-dev` also releases the API with the CORS rule, so the spike needs no `deploy-branch` for server code. The spike's run (the founder's iPhone, the ios lane's `ios/b0-spike-links` build, the log check on `dev`) and its report, `docs/spikes/S6-links.md`, come after it.

## Sources

- Spec 04 (invitations), T7 (nothing of a club before sign-in), T14 (one answer for every caller), T52 (no token in a log), T59 (the matrix runs every route); TECH-DESIGN section 1's Web row ("The invitation token travels in the URL fragment (`/i#<token>`), which never reaches a server or a log; the page's script shows only the inviter's name, fetched with the token in a request body") and section 8 (the privacy matrix).
- The contract: `previewInvitationWeb` (`POST /v1/invitations/web-preview`, public, body `InvitationTokenRequest`, 200 `WebInvitationPreview` with `inviter_name` only; an expired, revoked, replaced, used or unknown link is the same `NOT_FOUND`), built by `services/api/src/clubs/invitation.ts` `previewInvitationWebHandler` (PR #77), body limit 2 KiB. `InvitationToken`: base64url, 43 to 128 characters.
- The renders (`design/reference/INVENTORY.md`): `G02-web`, `G02-web-dark`, `G02-web-xl` (handoff 8's frames 4 to 6) and `G02-web-revoked` (handoff 4). The contracts: handoff 4's `component-contracts.json` (`neutralWebType`, `neutralInvitationRecovery`, `invitationTokenPolicy.web`) and `IMPLEMENTATION.md` ("G02-revoked and G02-web-revoked"); handoff 8's `component-contracts.json` (`handoff8.web`), `IMPLEMENTATION.md` and `screen-copy.json`; the brand tokens (`design/reference/brand/brand-tokens.md`); the wordmarks in `design/reference/claude-design/handoff-8/assets/`.

## 1. The page (`apps/web/public/i.html`, `i.css`, `i.js`, `brand/`)

Cloudflare Pages serves `i.html` at `/i` (it drops `.html` from a path), which is the path the association file claims. The page is static: plain HTML, CSS and one ES module of plain JavaScript, checked by `tsc` (`// @ts-check`, `checkJs`) and nothing compiled.

**What it shows, by state.** Every word is in the HTML, so the copy lint reads it (`packages/domain/src/copy/extract.ts` lints `.html`); the script only chooses which part is shown and puts the inviter's name in place.

| State | When | What | Source |
|---|---|---|---|
| checking | from the load until the answer | the wordmark, "Checking invitation…", Get Tadayo | built from spec: handoff 8's `handoff8.invitation.checking` (in the app, `G02-checking`); no web render |
| invited | 200 with a name | the wordmark, "{name} invited you to a club on Tadayo" (utilityTitle 32/35 bold), the brand line "Your day. Your story. A thought from your friends." (caption 21/28 bold, primaryText), Get Tadayo (16/22, action) | `G02-web`, `-dark`, `-xl` |
| unavailable | no token, a token that isn't 43 to 128 base64url characters, a 404 or a 400 | the wordmark, "This invitation isn’t available." (2rem/1.1875 bold), "Ask for a new invitation link." (17/23, secondaryText), Get Tadayo; no brand line, no name | `G02-web-revoked`; `handoff8.web.revokedUnknown` |
| failed | no answer within 15 seconds, a network error, a 429, a 5xx, a redirect, a 200 the page can't read | the wordmark, "Couldn’t check the invitation link. Check your connection and try again.", a Try again button, Get Tadayo | built from spec: handoff 4's `link.checkFailure`, its rule "Network/server failures stay recoverable errors… they do not claim the link no longer works"; no web render |

- A 400 can only mean the server reads the token differently from the page, which checks the contract's pattern first; it can't be fixed by trying again, so it is unavailable, like a 404. A malformed 200 is never upgraded to unavailable: it is failed (handoff 4: a neutral not-found is never inferred).
- The name goes in with `textContent`, inside `<bdi>`, so a right-to-left name can't reorder the sentence, and wraps anywhere. Nothing the server sends is shown but `inviter_name` (`invitationTokenPolicy.web`: "Do not interpolate a server message into UI").
- Try again checks the same token again, from the checking state. Reloading the page does the same.
- Without JavaScript the page stays at checking. The trial's phones run Safari with JavaScript on; a `<noscript>` line would be a state with no render and no copy.

**The token stays in the fragment.** The script reads `location.hash` and sends the token only in the POST body: `fetch` with `credentials: "omit"`, `referrerPolicy: "no-referrer"`, `cache: "no-store"`, `redirect: "error"`, `mode: "cors"`, and a 15-second `AbortSignal.timeout`. The page loads nothing from another origin: no font, analytics, image or script; its one request elsewhere is that POST. Its `<head>` has no Open Graph or Twitter tags, so a link preview shows nothing of the token or the inviter. The token never goes in Get Tadayo's link, a log or `localStorage`.

**Get Tadayo** is a placeholder in B0 (S6's row). It links to one fixed App Store address with no query and no fragment, the same in every state (`webStoreIntent`: "Generic configured App Store destination, without the unusable token"). Which address is FQ133 (new): its default is the TestFlight app's App Store page (`https://apps.apple.com/app/testflight/id899247664`) for the closed trial, since the trial's testers install Tadayo through TestFlight, and Tadayo's own App Store page at launch. Its accessible name is the visible "Get Tadayo"; on `G02-web` the hint "Open Tadayo in the App Store." is its description (`handoff8.web.get.hint`), and on the unavailable page its name is "Get Tadayo from the App Store." (`handoff4.unavailable.web.get.vo`).

**Layout, from the contracts.** A column 353 wide at a 393 viewport (20 px insets), centred; the wordmark 144 CSS px wide at every text size, from 124 px down, light or dark by `prefers-color-scheme` with `<picture>`; text in `rem`, so browser text zoom doubles every text role at 200% (title 64/70 on `G02-web`, 64/76 on the unavailable page, body 34/46, link 32/44); intrinsic height and vertical scroll; no `maximum-scale` or `user-scalable=no`; Get Tadayo's target at least 44 px. The gaps between blocks are taken from the frames' SVGs and stay in px: the wordmark 124 from the top, 88 from it to the heading, 31.5 from the heading to the brand line, 56 from the brand line to Get Tadayo's target; on the unavailable page 44 from the title to its line and 53 from that line to the target. `G02-web-revoked` draws its wordmark at 130, `G02-web` at 124: the page keeps 124 in every state, so the wordmark doesn't move when the answer comes. At 200% the frames' gaps differ by a few points: listed in the PR. The font is the system's (`system-ui, -apple-system`), SF Pro on the iPhone; the frames outline Arimo as a stand-in (handoff 4, `IMPLEMENTATION.md`).

**The API's address.** `i.html` names it in `<meta name="tadayo-api" content="https://api-dev.tadayo.app">`, and `_headers`' Content-Security-Policy allows that origin alone in `connect-src`. `tadayo.app` calls `dev` until `prod` exists (TECH-DESIGN section 7: `deploy-dev` publishes the web pages); `prod` changes both lines in its own PR. A test holds the two to the same origin.

**`_headers`**, one more rule, for every path (`/*`): `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src https://api-dev.tadayo.app; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`. It sets no Content-Type, so the build's rule for the association file holds (`checkHeaders`). The wordmarks are images under `img-src 'self'`; the page has no inline script or style.

## 2. The API: a page on tadayo.app may read `previewInvitationWeb` (`services/api/src/web-origin.ts`)

A browser lets a page read a cross-origin answer only when the answer says the page's origin may (`Access-Control-Allow-Origin`), and for a JSON POST it asks first with a preflight (`OPTIONS`, with `Access-Control-Request-Method` and `-Headers`). Today the API answers neither: an `OPTIONS` is the neutral not-found.

- **One origin, one operation.** `WEB_ORIGIN = "https://tadayo.app"`; the only operation it may read is `previewInvitationWeb`. No other route ever names an origin, and credentials are never allowed (no `Access-Control-Allow-Credentials`): the page sends no cookie and no `Authorization`, and the route is public.
- **The answers to the page.** A request to `previewInvitationWeb` whose `Origin` is exactly `https://tadayo.app` gets, on whatever it is answered (200, 400, 404, a body past the limit, a 500), `Access-Control-Allow-Origin: https://tadayo.app` and `Vary: Origin`, set in a route `onRequest` hook, before the body is read. Any other request, with no `Origin` or another one, gets exactly today's bytes, so the privacy matrix's pinned answers (which send no `Origin`) don't change, and the rule depends on a header the caller sends, never on who is calling or what the token names (T14). `Vary` goes only with the allowance: every answer is `private, no-store`, so no cache keeps one to give to another origin.
- **The preflight.** `OPTIONS /v1/invitations/web-preview` answers every caller the same: 204, `Access-Control-Allow-Origin: https://tadayo.app`, `Access-Control-Allow-Methods: POST`, `Access-Control-Allow-Headers: content-type`, `Access-Control-Max-Age: 600`, `Cache-Control: private, no-store`, no body. It reads no header, no body and no database, and passes no gate (it has no contract operation, so the gate's hook skips it). Its log line is the request's one line, with `preflight: "previewInvitationWeb"` in place of an operation id (`logging.ts`).
- **The one route outside the contract.** The contract describes the API's operations, and a preflight is the browser's, not an operation: putting it in `openapi.yaml` would give the Swift client a method nobody calls, and change the contract, which moves only in its own PR. So `buildApp` registers it beside the contract's routes, and the two tests that hold the routes to the contract (`services/api/src/app.test.ts`, "one route for each operation of the contract", and the privacy matrix's "no route is outside the contract") pin this one extra route by its literal method and path, not by a list the app exports. T59 still holds: the matrix sends the preflight as every role, with and without `Origin`, and pins its answer byte for byte.

## 3. Tests first

Written before the code, each seen failing first, on the branch:

- **`services/api/src/web-origin.test.ts`** (no database, the routes' fake transaction as in `clubs/invitation.test.ts`): with `Origin: https://tadayo.app`, a 200, a 404, a 400 for a bad token, a body past 2 KiB and a 500 each carry the two headers and otherwise today's bytes; with no `Origin`, with `https://tadayo.app.evil.example`, `http://tadayo.app`, `https://www.tadayo.app` and `null`, none; `previewInvitation` and `getMe` with `Origin: https://tadayo.app` carry none; the preflight's exact bytes, with and without `Origin`, signed in or not, and with a body; `OPTIONS` on every other path is still the neutral not-found; the log has the preflight's line and no token.
- **`app.test.ts`**: the route list is the contract's 67 plus `OPTIONS /v1/invitations/web-preview`, 68 in all.
- **The privacy matrix** (`tests/src/privacy/matrix.test.ts`): the route check allows exactly that one extra route; a step sends the preflight as every role, with and without `Origin`, and pins its bytes.
- **`apps/web/src/page.test.ts`** (Vitest, Node): `i.js`'s logic: the token from the fragment (43 and 128 characters pass; 42, 129, `=`, `+`, `/`, a space, percent-escapes and an empty fragment don't); the request (method, URL, JSON body of the token alone, `credentials`, `referrerPolicy`, `cache`, `redirect`, `mode`, the timeout signal); each answer's state (200 with a name; 200 with no name, an empty name, a number, a broken body; 404; 400; 429; 500; a thrown fetch; a timeout); that the name is set with `textContent`; and the files: no inline script or style, no `og:` or `twitter:` meta, every external address in `i.html` is the API's origin (in its meta) or the one App Store address with no `?` or `#`, the CSP's `connect-src` is the meta's origin alone, `Referrer-Policy: no-referrer`, the wordmarks are the delivered files byte for byte (their hashes), and the viewport allows zoom.
- **`build.test.ts`**: the site still builds with the new rule and files, and the association checks still refuse what they refused.

## 4. Look at it

The page in Chromium through Playwright (installed in the session), served at `https://tadayo.app/i` by a route handler with `_headers`' rule, its POST answered by another for each state: `G02-web` light and dark, at 200% text (the root's font size doubled, the nearest Chromium has to Safari's text zoom), the unavailable page, checking and failed, a long name and a right-to-left one, each at 393 wide, beside its render (`montage`), with the frames' Arimo installed locally so the comparison is of layout, not typeface. Also in the browser: the CSP blocks nothing the page needs (no console error but Chromium's own line for a 404 or 503 the page asked for), the POST carries `Origin: https://tadayo.app` and no `Referer` and no cookie, and the address bar keeps the token only in the fragment. Measured against the renders (the ink's rows, at 1x): `G02-web` and `G02-web-dark` within 0.5 px in every block; `G02-web-revoked` the same once its wordmark's 6 px is taken off. The sheets go to `evidence` under `api/b0-spike-links-web/<short-sha>/web/`.

## 5. The two states with no render

`checking` and `failed` are built from the spec and the copy above. The design handoffs and the inventory are the ios lane's (`docs/MILESTONES.md`, "Lanes"), so this PR asks it, under "Needs from the other lane" in `docs/PROGRESS.md`, to add two rows to `design/reference/INVENTORY.md` (`G02-web-checking` and `G02-web-failed`, built from spec, built by the api lane in `apps/web`) and to put this block in its next handoff:

```
Two states of the signed-out invitation page on tadayo.app (G02-web), for Claude Design.

The page today: G02-web (handoff 8, frames 4 to 6: the wordmark 144 CSS px, "Ben invited you to a club on Tadayo" in utilityTitle, the brand line in caption, Get Tadayo as a text link) and G02-web-revoked (handoff 4: "This invitation isn’t available.", "Ask for a new invitation link.", Get Tadayo). The page reads the link's token from the address's fragment and asks the server for the inviter's name, which takes a moment, and can fail.

Please draw, each 393 × 852 at a 393 px browser viewport, light, with the same dark and 200% text-zoom rules as G02-web (no extra frames unless a state needs one):

1. G02-web-checking: while the page asks the server. Today it shows the wordmark, "Checking invitation…" (handoff 8's in-app copy for G02-checking) and Get Tadayo. Nothing of the club or the inviter, since nothing is known yet (T7).
2. G02-web-failed: no answer, a network error or a server error. Today: the wordmark, "Couldn’t check the invitation link. Check your connection and try again." (handoff 4's link.checkFailure), a Try again control and Get Tadayo. It must not say the link no longer works (handoff 4).

Say for each: the type role of each line, the gaps, whether Try again is a text link or a button, where Get Tadayo sits, and whether "Checking invitation…" shows at once or only after a short delay. No new words unless you say why; the page shows no names, club, photographs or dates.
```

## 6. Verify, review, records

- `python3 tools/ci/ci_steps.py format|lint|typecheck|copy-lint|unit|web|guards`, the contracts' tests, the API's tests, the privacy matrix and the database tests on the session's Postgres; `ci` green on the last push.
- One independent review, at full depth: the change opens a server route to a browser origin (security). Then the founder's approval in this thread, the merge at the approved head under a `dev` claim, and `deploy-dev`'s run, with `check-association` green and the page served at `https://tadayo.app/i`.
- Records: the journal (blocks 1.1 and 1.2, the audit rows for T7, T14, T52 and T59, a log entry, the PR's row), `docs/PROGRESS.md`'s api section and the ios need, FQ133 in `docs/QUESTIONS.md`. No ADR: the plan for B1 already put the CORS rule here.

## 7. Risks and open points

- **FQ133** (Get Tadayo's address) is the founder's; the default stands until answered and changes one attribute in `i.html`.
- **The API's address in the page** is `dev`'s while `tadayo.app` is the only site; `prod` needs a second Pages site or a build that chooses, decided when `prod` is made (TECH-DESIGN section 7).
- **Not verified here:** Safari on the founder's iPhone (the page's look at its system font, text zoom with the aA menu, VoiceOver), and the universal link opening the app; both are the spike's run with the ios lane's build. The token-in-log check on `dev` reads Fly's logs after a request from the page, under a `dev` claim, in the spike's run.
