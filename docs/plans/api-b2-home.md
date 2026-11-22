# B2: Home's route (`api/b2-home`)

`GET /v1/clubs/{club_id}/home`, the contract's `getHome` and `Home` (spec 06, 08, 15, 32; T1, T5, T9, T14, T15, T22, T33, T34, T35, T49, T55; Q18; addendum 4; FQ16, FQ26, FQ50, FQ54, FQ63, FQ75, FQ80, FQ84). `docs/MILESTONES.md` gives B2 "`GET /v1/clubs/{id}/home` with `server_now`, the active or next occurrence and the countdown fields". The ios lane's B2 builds Home's waiting states on it (`H01-waiting`, `H01-after-close`, `H01-sunday`, awaiting activation, paused).

## 0. The split, and two readings

1. **This PR builds every mode of Home, the open day's frame, and the open day's first page, except what B6 owns.** Home's `day` mode carries a `RevealedDay`: the day's frame (`server_now`, `occurrence`, `club`, `viewer`, `add_target`), and its first page (`drops`, `next_cursor`, `highlights`).
   - **Revised while building.** The first version of this plan left the page to later stages and had the read refuse, with a server error, an open day holding a drop the viewer may see. The privacy matrix showed that can't stand: the leak scanner fails any status a route doesn't declare ("shape at status: 500 isn't an answer getHome declares"), and getHome declares only its 200 and the neutral not-found. Loosening the scanner is out (T58), and an empty page there would be false (T49). And Q18, one of B2's tests, is "Home is feed until 1 AM": the feed is Home's in B2.
   - **So the page is built here, from the rows, never from a worker's manifest (spec 07, T5):**
     - every drop of the open day the viewer may see the media of (`readableDrops(..., "media")`, the read predicate itself);
     - the star's own first, then friends', each section in commit order with the id as a tiebreak, byte by byte (T35; addendum 4), each card with its `section`;
     - each card's author as the club sees them (FQ75, the same rule as the roster's `person`), its caption, its `highlight` flag;
     - a photo's frame from its `display` rendition, the one the feed lays out, and its upload's random content version as `media_version` (spec 33; the media route's ETag in B3);
     - a video's provider;
     - the highlight rail: each highlight that points to a drop on the page, the star's pick first, then FQ26's default, the day's own schedule version from Monday by each contributor's earliest weekday, then anyone with no day in it in the order they joined.
   - **What stays later stages':**
     - **B6:** reactions (FQ73), favourites and the reply preview (T65). No route writes their rows before B6, so each card's `reactions` is `[]` and `viewer_favourite` is `false`, truly. The read checks, in the same statement, whether any drop on the page has a reaction, a favourite or a comment row, and throws if one does: the PR that first writes them must build those fields. This can't happen on `dev` or `prod` before B6, and no world of the matrix has those rows. Like any server error, the leak scanner would fail it wherever the matrix reached it, which is the point: the first matrix state with a reaction, a favourite or a comment (B6's) fails until those fields are built.
     - **B5:** paging through `getOccurrence` past the 36 drops a page holds, and the worker's manifests and opening events. A day can't reach 36 drops under the allowances (T17: six for the star, three for each friend, six members at once), so the read throws past 36 rather than cut the page short, and never sends `next_cursor`.
   - B5 also keeps its own work on the feed: the R01 screens, the opening animation, the worker's manifests, and its tests Q14 to Q18 on the reveal itself. The pieces this PR takes from B3 and B5 are decisions it records (the PR's decisions): the `display` rendition for the frame, and FQ26's default for the rail.
2. **`recent_days` is built here, whole.** It is `Home`'s secondary links in `waiting`, `day` and `paused`: closed days the caller can read something in (the contract's `DayLink`). Its rules are all written already:
   - the read predicate, through `readableDrops`;
   - D08's cover order: the star's highlighted photo, then the star's earliest photo, then the earliest photo, never a video.

   No stage after B2 owns it. Once B3 commits drops, the first day that closes with one in it would need it, and it can't be refused: refusing it would break Home for good once a day with drops had closed. On `dev` and `prod` it is empty until then.
3. **`club_today` is the calendar date in the club's timezone at `server_now`.** It is the contract's `LocalDate` read plainly: at 00:30 on Saturday it is Saturday's date, though Friday's day is still open until 1 AM. The contract's examples agree (`friday6Night`, 1:41 AM, gives `2026-11-06`).
4. **Home in an active club with no day to open is `no_days`: FQ134, new.**
   - This happens when generation has stopped, as on `dev`, whose worker stays stopped, or when every remaining day is held or cancelled.
   - `no_days` is the contract's only mode for it, and Home never invents a date (T49). But the app's `H01-confirm-days` says "Choose your day", which is untrue there.
   - Default: `no_days`, as built. With the worker running, generation keeps four weeks ahead (FQ115), so on `prod` this can only follow a failure of generation.

## 1. What Home answers

One read-only transaction. The clock's sample comes first, then one statement, so everything is one snapshot taken at that instant (T1, T5).

**Who.**
- **The caller has an active account and an active interval in the club:** they get Home.
- **Everyone else:** a stranger, a former member, a guessed or malformed id, an invited person who isn't a member yet. They get the neutral not-found (T9, T14). "Lost access is NOT_FOUND, not a mode" (the contract's `Home`).
- **A suspended club's members:** they get `unavailable`, as FQ80's default says ("the same 'Club unavailable' screen as Home"). The club list lists the suspended club for them too. So getHome's membership rule doesn't take the club's suspension into account, unlike `activeMemberships`. It is a new fragment in the authorization module, and its comment says why.

**Which mode.** The modes are taken in the contract's order. The first that holds wins:

| Mode | When | Body beyond the base |
|---|---|---|
| `unavailable` | the club is suspended (spec 22) | none |
| `awaiting_activation` | the club hasn't started (`activated_at` is null; FQ54, FQ84) | none |
| `day` | Home's day choice has an open day (`reveal_at <= now < close_at`; `daysByClub`) | `day` (the frame and its first page, section 0.1); `next` when there is one; `recent_days` |
| `waiting` | the day choice has a next day | `next`; `recent_days` |
| `paused` | fewer than two active members (FQ16) | `recent_days` |
| `no_days` | otherwise (FQ134) | none |

`day` and `waiting` come before `paused`, so a paused club's own announced day shows as usual until it closes (FQ50). The day choice never gives a day whose star left or asked to delete their account before it opened (FQ63, `starKeepsDay`), nor a cancelled or suspended day.

**The base.**
- `server_now`: the clock's sample, in whole seconds, rounded down.
- `club`: a `ClubRef`: its id, name, timezone and the caller's own interval.
- `club_today`: section 0.3.

**The day's frame.**
- `occurrence`: the open day.
- `club`: the same `ClubRef`.
- `viewer.is_star`: the caller's active interval is the day's star interval.
- `viewer.joined_later`: the caller's interval joined after the day's `collecting_from`, strictly. It comes from the caller's own membership, never from whether hidden drops exist (T15).
- `add_target`: the star's next day while this one is open, by the day choice among the days of that star (`nextDaysByStar`), or absent when the star has none (book p30, FQ50). The app never works it out (T4).

**The page.** Section 0.1.

**`recent_days`.** A new fragment in `packages/domain/src/authorization/days.ts`, beside `daysByClub`.
- Which days: the club's days that have closed (`close_at <= now`) and that hold a drop the caller may see the media of (`readableDrops(..., "media")`). That condition already denies:
  - cancelled and suspended days;
  - a suspended club;
  - a held day;
  - a withdrawn, removed or held drop;
  - a drop whose audience doesn't hold the caller's active interval;
  - the author's deletion, and a block.
- Order: newest first, by `reveal_at`, then id. At most six.
- Each day: as an `Occurrence` with phase `past`, its star named as `daysByClub` names one (a star whose day was kept after they left appears with the name they left with and no avatar version).
- Its cover: D08's order among the photos of that day the caller may see the media of:
  1. the star's photo that is the star's highlight;
  2. then the star's earliest photo;
  3. then the earliest photo.

  "Earliest" is by `submitted_at`, then id, the feed's order (T35). Never a video: a day with only videos the caller can read has no `cover_drop_id`.

**Nothing else.**
- No count, no "who hasn't" and nothing about whether anyone has added, the caller included (T15, T33).
- Nothing is written: the transaction is read-only, with no opened, seen or visited mark (T34).

## 2. Code

- `packages/domain/src/authorization/member.ts`: `listedMemberships(sql, userId)`, rows `(club_id, interval_id, joined_at)`: an active account with an active interval, whatever the club's state. Only the club list's meaning and Home's `unavailable` read a suspended club.
- `packages/domain/src/authorization/days.ts`: `recentDays(sql, viewer, now)`, rows `(club_id, recent_days)`, each club's list as a jsonb array, built on `readableDrops` and `starKeepsDay`, so the two can't drift. Plus `recentDay`, its parser, which throws on any shape outside the schema, as `chosenDay` does.
- `packages/domain/src/clubs/home.ts`:
  - `homeMode(facts)`: the pure rule of the table above;
  - `readHome(sql, userId, clubId, now)`: the statement and its parse, returning a `HomeRead` or null;
  - the page's three columns in that statement (`pageDrops`, `pageRail`, `laterRows`), each on `readableDrops`, and `openPage`, the parser that reads the page whole and throws on anything outside the shape, past 36 drops, or on a rail that isn't the page's highlights with the star's pick first (section 0.1).
- `services/api/src/clubs/home.ts`: `getHomeHandler`, registered in `app.ts`. `homeBody(now, home)` is an explicit field list (T55) that reuses `occurrenceBody` and the schedule routes' `personBody`.
- `tests/src/db/world.ts`: `commitDrop` writes a photo's two renditions, as preparation will (spec 33), at `PHOTO_FRAMES`' sizes. `tests/src/matrix.ts`' ending helpers clear a drop's highlight, as every real path that ends a drop must (the highlights guard).
- `packages/domain/src/index.ts`: the new exports.

## 3. Tests first

Each test is written before its code and seen failing on the code before it, and the run is recorded.

- **`packages/domain/src/clubs/home-mode.test.ts` (unit):** `homeMode` over every combination of suspended, activated, active members (1, 2, 6), an open day and a next day: the contract's order, each row named.
- **`packages/domain/src/clubs/home-page.test.ts` (unit):** `openPage` reads a page whole, a quiet day as empty, and refuses each shape outside the contract, a section its author doesn't give, a star's drop after a friend's, a rail that isn't the page's highlights or puts the star's pick later, and a 37th drop.
- **`tests/src/db/home.test.ts` (Postgres, instants passed in as the clock's sample):**
  1. Ana's Saturday at each edge, with no worker running (Q18's API half):
     - a microsecond before 7 AM: `waiting`, with Saturday;
     - at 7 AM: `day`, with an empty page, Ana `is_star` and Ben not;
     - at 00:30 on Sunday: still `day`, with `club_today` Sunday's date;
     - at 1 AM: `no_days`;
     - with a later day added: `waiting`, with that day.
  2. Null for: a stranger, a former member, a rejoined member's old interval, an account whose deletion has begun, an id nobody has, a malformed id, and an invited person whose roster isn't applied.
  3. `unavailable` for a suspended club's member. `awaiting_activation` for a club that hasn't started.
  4. `paused` with one active member and `recent_days`. With the remaining member's own announced day: `waiting`, then `day`, then `paused` (FQ50).
  5. A held day (the star left, or asked to delete their account, before it opened) is never `day`, `next` or `add_target`; a cancelled day neither.
  6. `joined_later`: a member who joined after `collecting_from` gets true; one who joined before gets false.
  7. `add_target`:
     - the star's next day;
     - absent when the star has none;
     - absent when the star's next day is held, or is cancelled.
  8. The page:
     - every drop the viewer may see, the star's first, each section in commit order, two drops at one instant by their ids;
     - each card's fields: author, caption, highlight, the display frame and media version, the video's provider, the section;
     - the author's avatar while both are active, and the name an interval ended with after it (FQ75);
     - a late joiner's page is empty; a withdrawn, removed or held drop, or one a block keeps away, is left out;
     - the rail: the star's pick, the day's schedule from Monday, anyone without a day as they joined; a member with two days by the earlier, in the day's own week and no later one; a held drop's highlight and one the viewer's audience doesn't hold left out;
     - a reaction, a favourite or a comment on a drop of the page makes the read throw (B6).
  9. `recent_days`:
     - seven closed days with drops give the newest six;
     - each cover follows D08: the star's highlighted photo, then the star's earliest, then the earliest;
     - a day with only a video has no cover;
     - none of these is listed: a day whose only drop was withdrawn, a day before a late joiner joined, a held day, a cancelled day;
     - a rejoined member's old drops aren't listed.
  10. `club_today` in a zone far from UTC (Pacific/Kiritimati and Pacific/Pago_Pago), on both sides of local midnight.
- **`services/api/src/clubs/home.test.ts` (the app, fake clock):**
  - every mode's body parses with the contract's `Home`, with no key beyond it;
  - the neutral not-found, byte for byte, for a stranger;
  - `server_now` in whole seconds;
  - `private, no-store`;
  - the transaction is read-only;
  - `homeBody` of each domain value equals the contract's example, field for field: every example (`your_day` among them, with drops and a rail), and `open` once B6's reactions, favourite and reply preview are taken from its drops.
- **The privacy matrix (`tests/src/privacy/home.ts`, its row in `rows.ts`):** getHome's answer in every cell, judged from the world's rows, apart from the statement the route runs:
  - the neutral not-found to everyone who isn't an active member;
  - for a member:
    - the mode;
    - the base;
    - `next` and the day by `daysOf`;
    - `viewer` from the world's intervals and the day's `collecting_from`;
    - `add_target` by `daysOf` with the star;
    - the open day's page, drop by drop, by the judge's own statement of the read predicate from the world's drops, audience, accounts and blocks, with each card's fields and the rail in FQ26's order (the matrix world's Ben's photo is Ben's highlight, so the rail is judged too);
    - `recent_days` by the same rule, with D08's cover.
  - So the matrix's past phases show `waiting` with a recent day, the world gains a later day for Ana, Saturday 14 November. Any row whose literals assumed one day is checked against the rows when built.
  - The leak scanner reads every answer as it does now (`DayLink.cover_drop_id` has the form `opened`, and must be a photo).
  - `rows.ts`' header: getHome built, and what's still owed (section 8).

## 4. Run it and look at it

- **Postgres** (local, or Docker if its daemon runs), with every suite:
  - `ci_steps.py db-tests`;
  - a fresh database, then `ci_steps.py privacy`;
  - the packages' unit tests, lint, type checks;
  - `journal_check.py --branch`.
- **The route by hand, on the local app against Postgres:** the matrix world's members before, during and after Ana's Saturday, and the server error's log line, checked for no personal data.

## 5. Critique before review

The three weakest things, to fix or answer:
- the B6 refusal and the 36-drop refusal (section 0.1);
- `no_days` while generation is stopped (FQ134);
- the cost of `recent_days`' statement on a club with many days, its plan read with `EXPLAIN` on a seeded club.

## 6. Review

A fresh subagent, full depth (privacy-critical: getHome is the first route that answers drop references, through `cover_drop_id`). Then every finding is fixed or answered in the PR.

## 7. Records

In the PR's last commit before it opens:
- the journal's api block;
- the audit map: T1, T5, T9, T14, T15, T22, T33, T34, T35, T49, T55, spec 06, spec 08, spec 15, Q18;
- a log entry;
- table 4.1's row;
- `docs/PROGRESS.md`;
- FQ134 in `docs/QUESTIONS.md`;
- `rows.ts`' header.

## 8. What later slices owe

- **B3:** the media route serves `display` and `full` with the upload's content version as its ETag, the `media_version` Home sends; the commit writes a photo's renditions before the drop, as `tests/src/db/world.ts`' `commitDrop` does.
- **B5:** `getOccurrence` and its cursor, and with it Home's `next_cursor` past 36 drops, taking out that refusal; the worker's manifests and opening events, which never decide what Home shows (spec 07).
- **B6:**
  - reactions (FQ73), the reply preview (T65) and favourites in the page, taking out section 0.1's refusal and its matrix judge's "refused" cells;
  - Home during a single suspended day (`H01-day-suspended`);
  - a matrix state where the star leaves or asks to delete their account.
- **Still to come, from `rows.ts`' header:** no freed day and no leaver's cancelled day in getHome. Both are true here by the day choice, which skips cancelled days, and `tests/src/db/home.test.ts` case 5 holds it on Postgres; the matrix's "a new member's pick through the app" can read getHome too, once built.

## 9. Not in this PR

- Reactions, favourites and reply previews in the page, and `getOccurrence` with its cursor (section 0.1).
- The global Add's choices (spec 08).
- Notifications and deep links (B8).
