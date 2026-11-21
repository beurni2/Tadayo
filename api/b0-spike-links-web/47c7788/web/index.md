# The invitation page G02-web at 47c7788

Branch `api/b0-spike-links-web`, commit `47c7788`. Screenshots of `apps/web/public/i.html` as Cloudflare Pages
would serve it at `https://tadayo.app/i#<token>`, with its `_headers` rules, in Chromium (Playwright), 393 x 852
points at 2x. The API's answers come from a route in the script, not from `dev`. The font is Arimo, the frames'
stand-in, for the comparison; the iPhone uses its system font.

Side by side with the renders (left: the render from `design/reference/claude-design/`; right: this build):

- `cmp-G02-web.png`: the live link, light (handoff 8's G02-web).
- `cmp-G02-web-dark.png`: the live link, dark.
- `cmp-G02-web-xl.png`: the live link with text at 200%.
- `cmp-G02-web-revoked.png`: the unavailable link (handoff 4's G02-web-revoked).

Every state on its own: `G02-web.png`, `-dark`, `-xl`, `-xl-full`, `-long-name`, `-rtl-name`, `-revoked`,
`-revoked-dark`, `-revoked-xl`, `-no-token` (a link with no token is the unavailable state, and nothing is
sent), `-checking`, `-failed`, `-failed-dark`. The checking and failed states have no render; they are built
from spec with copy that exists (plan section 5). `sheet-other-states.png` holds them together.

`log.json`: for each shot, the requests the page sent (only `POST /v1/invitations/web-preview`, the token in its
body only, no cookie, no referrer) and the console's errors and warnings (none).
