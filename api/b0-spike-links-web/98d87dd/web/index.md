# The invitation page G02-web at 98d87dd

Branch `api/b0-spike-links-web`, commit `98d87dd` (PR #94 after its first review). Two kinds of evidence.

## The page beside the renders

Screenshots of `apps/web/public/i.html` as Cloudflare Pages would serve it at `https://tadayo.app/i#<token>`, with
its `_headers` rules, in Chromium (Playwright), 393 x 852 points at 2x. The API's answers come from Playwright
routes, which skip the browser's CORS checks, so these show the page's states, not CORS (see below). The font is
Arimo, the frames' stand-in, for the comparison; the iPhone uses its system font.

Side by side (left: the render in `design/reference/screens/`; right: this build):

- `cmp-G02-web.png`: the live link, light (handoff 8's G02-web). Every block within 0.5 px.
- `cmp-G02-web-dark.png`: the live link, dark. Every block within 0.5 px.
- `cmp-G02-web-xl.png`: the live link with text at 200% (the root's font size doubled: Chromium has no text-only
  zoom). The wordmark and the lines' pitch match; the title starts 2.5 px lower (268.5 against 266) and the brand
  line 4.5 px lower (580.5 against 576). Get Tadayo is below the frame's edge in both; its words sit in the middle
  of the frame's 88 px target (892.5 against 892), `G02-web-xl-full.png`.
- `cmp-G02-web-revoked.png`: the unavailable link (handoff 4's G02-web-revoked). The page keeps the wordmark at
  124 px from the top, as G02-web does, where this frame draws it at 130; below it, every block within 0.5 px
  once those 6 px are taken off.

Every state on its own: `G02-web.png`, `-dark`, `-xl`, `-xl-full`, `-long-name`, `-rtl-name`, `-revoked`,
`-revoked-dark`, `-revoked-xl`, `-no-token` (a link with no token is the unavailable state, and nothing is
sent), `-checking`, `-failed`, `-failed-dark`. The checking and failed states have no render; they are built
from spec with copy that exists (the plan's section 5). `sheet-other-states.png` holds them together.

`log.json`: for each shot, the requests the page sent (only `POST /v1/invitations/web-preview`, the token in its
body only, no cookie, no referrer) and the console's errors and warnings: none, but Chromium's own line for the
404 the unavailable shots asked for and the 503 the failed shots asked for.

## The real API's CORS answers in a real browser

`real-cors.json`: the page in Chromium with nothing intercepted. A local HTTPS server answered as `tadayo.app`
(the site, with `_headers`), as `api-dev.tadayo.app` (forwarded to the real app, `buildApp`, with the routes'
fake transaction: a live link, a link that names nothing, a failed database) and as `evil.example`; Chromium
resolved the three names to it. For each case: the state shown, where focus was, the console, and each request
the API got (method, status, the Origin, Referer and cookie it carried, and the allowance it answered).

- A live link: a preflight (204, allowed origin `https://tadayo.app`), then the POST (200, allowed, `Vary:
  Origin`); the page showed Ben.
- A link that names nothing: preflight, POST 404 (allowed); the unavailable page.
- A failed database: preflight, POST 500 (allowed); the failure, with Retry.
- Retry after a failure: focus on the heading of Ben's invitation, or on the failure's line if it failed again.
- `evil.example` with a live token: with a JSON body its preflight named another origin, so the browser sent no
  POST and the page got `TypeError: Failed to fetch`; with a `text/plain` body the POST went (400, no allowance)
  and the page could read nothing.
- No request carried a Referer or a cookie from the page; no answer allowed credentials. The app's log lines held
  neither the token nor an origin.
