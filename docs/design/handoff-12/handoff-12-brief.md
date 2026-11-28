# Design handoff 12: the brief

*28 November 2026, by the ios lane, for stage B2 (`docs/DESIGN-HANDOFF.md`, "When to write a handoff": states the inventory lacks; `docs/plans/ios-b2-calendar.md` section 7). The coordinator reserved the number at 09:26 UTC. The text to paste is `handoff-12-brief.txt` beside this file, whole and unchanged.*

## The answer

- **Handoff 12 asks for 22 frames,** all for stage B2:
    - frames 1 to 4, the day picker after a confirmation, reopened, when a day was just taken, and when a confirmation got no answer (`G04-confirmed`, `G04-own-confirmed`, `G04-day-taken`, `G04-confirm-failed`);
    - frames 5 and 6, a new member picking a free day, which replaces what handoff 6's `G04-change` drew before the founder's answers to FQ125 to FQ127, and the same when a fourth member's join frees days (`G04-change`, `G04-change-freed`; FQ130, FQ131);
    - frames 7 to 10, Home with no day coming (`H01-no-days`, FQ134), a paused club's own day (`H01-paused-own-day`, FQ50), the star's own quiet day (`H01-quiet-your-day`), and one hierarchy for the waiting card (`H01-travelling-dateline` redrawn);
    - frames 11 to 18, Friends, Memories and Add before the club starts, in the first days and while paused (`F01-friends-unconfirmed`, `F01-not-started`, `F01-paused`, `M01-not-started`, `M01-first-days`, `M01-paused`, `C01-drafts-only`, `C01-picker-first-days`);
    - the dark and largest-text forms of frames 5, 8 and 18.
- **It also asks for written answers:** whether the five states FQ125 to FQ127 made unreachable retire (`G04-change-member`, `G04-transition-week`, `G04-change-confirmed-review`, `G05-schedule-review`, `G05-schedule-review-confirmed`); what members see once a fourth member's join frees their second day; which past days a waiting Home shows; and the points handoff 6's check left for "the next stage B2 brief" (its section 7, moved there by handoff 7's brief: the circle on proposed days, the words, the states and the files), less those the founder's later answers made moot (the kept dates of the old `G04-change`). With them, the ios lane's needs list's items 81 to 84 (`docs/design/handoff-7/ios-lane-needs.md` sections 17 and 18), and item 85, which #158 adds to that list.
- **Not in it:** the feed, the reveal and past days (B5), the composer, drafts and the upcoming day's captions (B4), and the states each of those stages' briefs will ask for.

## 1. How to send it

1. Paste `handoff-12-brief.txt` into the Claude Design project that made handoffs 1 to 11, with the repository linked.
2. If that project no longer has the earlier work, attach the two PDFs (`Tadayo_UI_UX_Design_Book.pdf`, `Tadayo_v3_Build_and_Design.pdf`), the addendum's PDF (`docs/tadayo-new-direction-addendum-r1.pdf`), `design/reference/brand/brand-tokens.md` and `brand-components.png`.
3. When the export is ready, attach it as a .zip in the ios thread with the message "Design handoff 12", as handoffs 0 to 11 came (`docs/LIMITATIONS.md`, 2 November 2026). The lane unpacks it into `design/reference/claude-design/handoff-12/` and checks it against this brief.

## 2. The readings the lane builds until the answer

Each is marked "built from spec" in `design/reference/INVENTORY.md` until its frame arrives, and none blocks a PR (`docs/plans/ios-b2-calendar.md` section 4):

- **`G04-confirmed` and `G04-own-confirmed`:** `G04-confirmed-many`'s layout with "Your day is confirmed." (handoff 3), each confirmed day with its first date as the server sends it; reopened, the same week read-only, the viewer's day with a check and "Confirmed" (handoff 6's specimen).
- **`G04-day-taken`:** handoff 3's line in `G04-confirm-refused`'s place (under the explanation, said once to VoiceOver), and the day's row as the schedule read again shows it.
- **`G04-confirm-failed`:** the choice kept, "Couldn’t confirm your days. Check your connection and try again." in the same place (handoff 4's failure pattern), and the retry under the same key (T19). The words are the lane's placeholder until the frame's.
- **`G04-change`:** the first days' picker (`G04-one-day` or `G04-two-days` by `days_per_member`) for a `membership_change` proposal, the others' days taken with their owners, the free days to choose, and each confirmed day's first date as the server sends it (FQ130).
- **`H01-no-days`:** `H01-confirm-days` with no Choose your day.
- **`H01-paused-own-day` and `H01-quiet-your-day`:** the waiting card, and 2.1's `H01-your-day` header over `H01-quiet`'s body.
- **Friends, Memories and Add:** name-only rows; Memories' "Your first memories are ahead." without its "Next:" line; handoff 3's words where they exist; + Add with Private draft and Open my drafts only while no member has a day; a member with no day by name and photograph, not choosable.
- **The five unreachable states:** not built.

## 3. What came back

Nothing yet.
