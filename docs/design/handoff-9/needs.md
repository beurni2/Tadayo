# Design handoff 9: what it will ask

Collected here until handoff 9's brief is written (`docs/DESIGN-HANDOFF.md`). Nothing here has been sent to Claude Design yet. Each item says where it comes from, and each lane adds its own; the brief, like handoff 8's (`docs/design/handoff-8/handoff-8-brief.md`), will gather them into one block for the founder to paste.

## 1. The invitation page's two states with no render (the api lane, #94)

`G02-web-checking` and `G02-web-failed`, built from spec by the api lane in `apps/web` and listed in `design/reference/INVENTORY.md`. The api lane's block, from `docs/plans/api-b0-spike-links-web.md` section 5, goes into the brief as it stands:

```
Two states of the signed-out invitation page on tadayo.app (G02-web), for Claude Design.

The page today: G02-web (handoff 8, frames 4 to 6: the wordmark 144 CSS px, "Ben invited you to a club on Tadayo" in utilityTitle, the brand line in caption, Get Tadayo as a text link) and G02-web-revoked (handoff 4: "This invitation isn’t available.", "Ask for a new invitation link.", Get Tadayo). The page reads the link's token from the address's fragment and asks the server for the inviter's name, which takes a moment, and can fail.

Please draw, each 393 × 852 at a 393 px browser viewport, light, with the same dark and 200% text-zoom rules as G02-web (no extra frames unless a state needs one):

1. G02-web-checking: while the page asks the server. Today it shows the wordmark, "Checking invitation…" (handoff 8's in-app copy for G02-checking) and Get Tadayo. Nothing of the club or the inviter, since nothing is known yet (T7).
2. G02-web-failed: no answer, a network error or a server error. Today: the wordmark, "Couldn’t check the invitation link. Check your connection and try again." (handoff 4's link.checkFailure), a Retry control (handoff 4's common.retry) and Get Tadayo. It must not say the link no longer works (handoff 4).

Say for each: the type role of each line, the gaps, whether Retry is a text link or a button and its size, whether Retry has a hint and its words (handoff 8 gives the app's Retry one that names its destination), where Get Tadayo sits, and whether "Checking invitation…" shows at once or only after a short delay. Say too where focus goes after Retry, whose control the checking state hides: today it moves to the first line of the state shown (checking, then the answer), and the page's live region is turned off after Retry so the state is read once. Say whether that is right, or whether the live region should stay and focus stay put. Say too whether the page needs a line for a browser with JavaScript off: today it stays at checking, with no `<noscript>` text. No new words unless you say why; the page shows no names, club, photographs or dates.
```
