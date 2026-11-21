# The invitation page G02-web at b51a0d4

Branch `api/b0-spike-links-web`, commit `b51a0d4` (PR #94 after its second review). Three kinds of evidence.

## The page beside the renders

Screenshots of `apps/web/public/i.html` as Cloudflare Pages would serve it at `https://tadayo.app/i#<token>`, with
its `_headers` rules, in Chromium (Playwright), 393 x 852 points at 2x, taken by `shoot.mjs` (here). The API's
answers come from Playwright routes, which skip the browser's CORS checks, so these show the page's states, not
CORS (see below). The font is Arimo, the frames' stand-in; the iPhone uses its system font.

All 13 shots are the same pixel for pixel as at `98d87dd` (ImageMagick `compare -metric AE`: 0 for each): the
second review changed what the page says to VoiceOver, when it shows the failed state and how focus looks, not
what any state looks like. So `cmp-*.png` and `sheet-other-states.png` are the same images as in
[`98d87dd/web/`](../../98d87dd/web/index.md), whose index describes each one:

- `cmp-G02-web.png`, `cmp-G02-web-dark.png`: every block within 0.5 px of the render.
- `cmp-G02-web-xl.png`: text at 200% (the root's font size doubled: Chromium has no text-only zoom). The title
  starts 2.5 px lower and the brand line 4.5 px lower than the render.
- `cmp-G02-web-revoked.png`: the wordmark at 124 px from the top, as G02-web has it, where this frame draws it
  at 130; below it, every block within 0.5 px once those 6 px are taken off.

`log.json`: for each shot, the requests the page sent (only `POST /v1/invitations/web-preview`, the token in its
body only, no cookie, no referrer) and the console's errors and warnings: none, but Chromium's own line for the
404 and 503 the page asked for.

## The focus ring (new in the second review)

`sheet-focus.png`, from `shoot-focus.mjs` (`focus-log.json`): the failed state with focus moved by the keyboard
to Retry (light, dark) and to Get Tadayo. The ring is the brand's `focusRing` (`#284CDB` light, `#AFBEFF` dark),
2 px wide and 2 px off (`design/reference/brand/brand-tokens.md`); before, it was Chromium's own.

## The real API's CORS answers in a real browser

`real-cors.json`: the page in Chromium with nothing intercepted, at this commit. `front.mjs` (Node 26, from
`services/api`) is a local HTTPS server on 443 with a certificate made for the run (not kept): it answers as
`tadayo.app` (`apps/web/public` with `_headers`), as `api-dev.tadayo.app` (forwarded to the real app, `buildApp`,
with the routes' fake transaction on three ports: a live link, a link that names nothing, a failed database) and
as `evil.example`. `real.mjs` (Node 22, Playwright) starts Chromium with the three names resolved to it, the
session's proxy bypassed for them alone, and the certificate accepted. For each case: the state shown, where
focus was, the live region's value, the console, and each request the API got (method, status, the Origin,
Referer and cookie it carried, and the allowance it answered).

- A live link: a preflight (204, allowed origin `https://tadayo.app`), then the POST (200, allowed, `Vary:
  Origin`); the page showed Ben, and the live region was `polite`.
- A link that names nothing: preflight, POST 404 (allowed); the unavailable page.
- A failed database: preflight, POST 500 (allowed); the failure, with Retry.
- Retry after a failure: focus on the heading of Ben's invitation, or on the failure's line if it failed again;
  the live region `off`, so each part is read once, by focus.
- `evil.example` with a live token: with a JSON body its preflight named another origin, so the browser sent no
  POST (`TypeError: Failed to fetch`); with a `text/plain` body the POST went (400, no allowance) and the page
  could read nothing.
- No request carried a Referer or a cookie from the page; no answer allowed credentials.

`api-log.jsonl`: the three apps' log for the run, 23 lines (3 at listening, 20 requests). None holds the token
(`grep -c` of the run's token: 0) or an origin (`grep -ci "tadayo.app\|evil.example\|origin"`: 0).
