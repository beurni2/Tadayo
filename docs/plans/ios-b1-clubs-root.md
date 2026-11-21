# B1, PR 3a: the clubs root (`ios/b1-clubs-root`)

Branch `ios/b1-clubs-root`, from `main` at `5d52b2d`. Written on 21 November 2026. The third PR of `docs/plans/ios-b1-clubs.md` section 4, split in two:

- **3a, this branch:** the club list replaces `.notInThisBuild`, the selected club, its header, the switcher, and Home before a club starts.
- **3b, `ios/b1-club-details`, next:** `G05-club-details`, `G05-members`, `G05-members-two-days` and `G05-club-details-failed`'s form.

The split changes no product decision and no state the plan lists. It keeps each review to one part of the screen: the root and its sheet here, the screens Club details opens there. Until 3b merges, the switcher's Club details row is drawn and does nothing, as FQ85 did for B0's actions (ADR-029).

## 1. What it builds

### The model (`TadayoCore`)

`RootModel` (`packages/swift/TadayoCore/Sources/TadayoCore/RootModel.swift`):

- **`Clubs`.** `.listed(ClubList)` replaces `.notInThisBuild` whenever the list holds a club. A list with only accepted invitations stays `.notInThisBuild` until `ios/b1-invitation` builds `G03-waiting` (plan PR 6). `.noClub`, `.loading` and `.failed` are unchanged.
- **`selectedClubID`.** The selected club, chosen on each answer:
    - the club this account kept, if the list still holds it;
    - otherwise the first in the server's order.

  A suspended club stays selected: the app never substitutes another club for a denied one (handoff 5's `deniedHeader.selectedId`). `select(_:)` is the switcher's choice.
- **Kept across relaunches (spec 03: "The selected club persists across ordinary relaunches").** The choice is kept per account through a new `ClubSelectionStore`, a protocol holding the account's id and the club's id. The app's store keeps it in `UserDefaults` under one key, with no name, no token and nothing else of the club.
- **Forgotten on leaving (T11).** `RootModel` forgets the choice when it ends a session, before `left`, as it drops the account's other state, and whether or not the device could forget the session. A store holding another account's id answers nothing for this one (an account switch).
- **`home`, Home's state for the selected club**, read after the list:
    - **Proposed:**
        - `GET /v1/clubs/{club_id}`, then, when it names an open revision, `GET /v1/rosters/{revision_id}`;
        - the creator's `my_decision` `pending`, in a revision still `open`, gives `.awaiting(review: true)`: frame 13's words (FQ84; the api lane's FQ60, where proposing counts as the proposer's approval, so `pending` happens only in a revision the server made for a name);
        - anything else gives `.awaiting(review: false)`, a revision no longer open included (superseded, applied or not gone ahead between the two reads; one that replaced it is asked for at Home's next read);
        - Home shows its loading form while these are out, and its failure form with Retry if either fails (nothing is assumed while a call is out or failed);
        - when the details or the revision answer not found, or the details say the club is no longer proposed, the club changed since the list was read (suspended, which its reads answer as not found, T9; or started): the list is read again, once, and decides (handoffs 5 and 6, `deniedHeader`), with the list's loading form under the no-club header meanwhile; if the list read again still leads there, Home fails and its Retry starts over. Only that one chain of reads counts as reading the list again, so another club chosen meanwhile, or a new session, gets its own read of the list.
    - **Suspended:** `.unavailable`, with no call (T9).
    - **Active or paused:** `.notInThisBuild`. Their Home (`H01-confirm-days`, `H01-waiting`, `H01-paused`) is B2's.
    - **A failure answer:**
        - a `signedOut` answer ends the session as everywhere else;
        - an answer that lands after Leave sign-in, or after another club was chosen or Home read again, is dropped (the root's `epoch`, and its count of Home's reads, `homeReads`).
- **`ClubService`.** It joins `AccountService` in the root's services (`AppGraph`'s `Accounts` and the UI tests' fakes), through `TadayoAPIClient`'s calls from #88.

### The screens (`apps/ios`, `TadayoDesign`)

- **The selected club's header** (`handoff3.selectedClubHeader`, with `handoff8.selectedClubHeader`):
    - the club's name and a chevron as one button, 44 high, in `clubHeader`;
    - then "+ Add" and Account, as the no-club header has them;
    - it scrolls with the content, with the opaque band behind the status bar (handoff 7's);
    - at every accessibility size it takes two rows: the selector at full width, then + Add and Account.

  VoiceOver reads the selector as "Switch club. {clubName} selected." (`handoff8.header.club.vo`). + Add and Account do nothing yet (FQ85). A new `TadayoDesign` component, `SelectedClubHeader`, beside `NoClubHeader`; the Lab shows both.
- **The switcher (`G06-switcher`, `G06-switcher-status`, `G06-switcher-unavailable`).** A system sheet holding:
    - "Your clubs" (`handoff5.switcher.title`);
    - one row per club, in the list's order, with the club's name in the row title's role and its line under it;
    - the selected row's checkmark in `action`;
    - then Club details, Create a club and Cancel as text actions.

  Each row's line:

  | The club | Its line | Where the words come from |
  |---|---|---|
  | Proposed | "Not started" | `handoff5.switcher.notStarted` |
  | Paused | "Paused" | `handoff5.switcher.paused` |
  | Suspended | "Unavailable" | `handoff5.switcher.unavailable` |
  | Active, with a next day | "{N} people · Next: {name}" | `handoff6.switcher.active.row`, from `next_day`'s star |
  | Active, with an open day | "{N} people · {name}'s {weekday}" | as `G06-switcher` draws it (handoff 6's C-02) |
  | Active, with no confirmed day | "{N} people" alone | |

  Notes on the rows:
    - "N people" is as drawn: W-05 records that no template writes it.
    - The weekday comes from the open day's local date in the club's zone (`DateLabels`).
    - VoiceOver reads a row as "{clubName}. {line}." (`handoff5.switcher.row.vo`, `handoff6.switcher.active.row.vo`; for an open day, "{clubName}. {N} people. {name}'s {weekday}.", built from the same), with the native Selected trait on the selected row (`handoff6.switcher.row.selected.vo`).
    - Choosing a row selects that club and closes the sheet.
    - Create a club and Club details do nothing until plan PR 4 and 3b.
- **Home before the club starts (`H01-awaiting-activation`).** Under the header:
    - "Waiting for club confirmation";
    - "The club starts when another person accepts the same roster.";
    - the Private drafts card and "Drafts stay private when the club starts." (`handoff3.H01.awaiting.*`);
    - Review members pinned at the foot, its VoiceOver label Review members with the hint "Review the proposed roster for {clubName}." (handoff 5's `a11y.reviewMembers` and its hint, which replace handoff 3's `H01.awaiting.action.vo`).

  With the review pending, three things change (`handoff8.pending.review.*`, frame 13):
    - the title is "Review the updated members";
    - the line is "Review and approve the updated roster before {clubName} can start.";
    - the button's label is "Review {clubName}'s updated members."

  Review members and the card do nothing until plan PR 7 (`G05-members-proposed`) and B4's drafts. Spacing follows `handoff6.spacing`, not the frame (handoff 5's X-28).
- **Home for a suspended club (`H01-unavailable`, `F01-unavailable`, `M01-unavailable`).**
    - The header is the denied header: the wordmark, + Add and Account (handoff 5's `deniedHeader`), with no club name.
    - "Club unavailable" and "This club isn't available right now." on every tab.
    - Choose a club (primary), which opens the switcher.
    - Get help, 8 under Choose a club (`primaryToSecondaryTargetGap`), with the hint "Contact Tadayo support." (`handoff5.home.help.hint`), drawn and doing nothing: no support address is configured, and none is invented (`deniedHeader.GetHelp`).

  The inventory lists these under B2. They are built here because the club list already answers `suspended`, and the switcher must stay reachable from it.
- **Loading and failure with a club selected (`H01-loading`, `H01-error`).**
    - While Home's reads are out: the tabs' loading form under the selected club's header, "Loading Home…" seen and said once, with "For {clubName}." as its hint (handoff 5's `loading.label` and `loading.hint`, which replace handoff 3's `H01.loading.vo`, "Loading {clubName}.").
    - After a failure: the B0 form (`H01-error-no-club`'s) under that header, with Retry's hint "Retry loading Home for {clubName}." (`handoff3.H01.error.retryVO`).
    - The club list's own loading and failure keep the no-club header: no club is known yet.
- **An active or paused club in this build.** FQ90's "This version of Tadayo can't show clubs yet." under the selected club's header, on every tab, with no Retry: B2 builds their Home. Friends and Memories show it for a proposed club too (`F01-not-started` and `M01-not-started` are missing, B2).

## 2. Tests first

On Linux (`swift test --package-path packages/swift/TadayoCore`), in `RootModelTests`, with fake clubs and a fake selection store:

1. A list with a club gives `.listed`; one with only invitations stays `.notInThisBuild`.
2. The first club is selected when nothing is kept; the kept club when the list holds it; the first again when it doesn't. The choice is kept each time.
3. `select(_:)` keeps the new club and reloads Home for it. An answer for the club left behind is dropped.
4. A store holding another account's choice gives that account's nothing.
5. Leave sign-in forgets the choice, before `left` runs, including when the device can't forget the session. A server-ended session forgets it too.
6. A proposed club:
    - with no open revision, `.awaiting(review: false)` after one call;
    - with an open revision and `my_decision` `approved`, `.awaiting(review: false)`;
    - with `pending`, `.awaiting(review: true)`;
    - while either call is out, `.loading`;
    - with an open revision no longer `open` by the time it's read, `.awaiting(review: false)`;
    - a failure of either gives `.failed` with Retry reading both again;
    - a not found from either, or details no longer proposed, reads the list once more, which decides; still not found after it, `.failed`, and Retry starts over; a club chosen while the list is read again gets its own read of the list;
    - an answer after Leave sign-in reads nothing more;
    - `signedOut` from either ends the session.
7. A suspended club gives `.unavailable`; an active or paused one gives `.notInThisBuild`, with no call made.

Hosted tests (`apps/ios/TadayoTests`):

- `TabsLayoutTests`: the header's rectangles at the default size, against `handoff3.navigationAndTargets.selectedClubHeader`'s [20, 56, 230, 44], [274, 56, 59, 44] and [337, 56, 44, 44], as it measures the no-club header's; the same in every state it shows in; two rows at every accessibility size, and for a name too long for one row; Home before the club starts 32 under the header with Review members 24 above the foot; Choose a club 8 above Get help;
- `TabsAnnouncementTests`: nothing more said when the list answers while Home is still read, "Home updated." when Home before the club starts comes back, Home's failure and a suspended club's denial at once, the loading label again when another club is chosen.

Snapshot tests (`TabsSnapshotTests`, `ClubSwitcherSnapshotTests`) read what VoiceOver finds: the selector's label, the rows' labels and Selected trait, the headings, Review members' label and hint, the loading label's hint, Home's Retry hint, nothing of a suspended club on any tab, and that choosing a row selects that club.

## 3. States snapshotted

Each in light, dark and the largest text (`ScreenSnapshot`), paired with its render by name:

- `H01-awaiting-activation`;
- `H01-awaiting-activation-review` (frame 13's words on Home: a new inventory row, built from spec);
- `H01-loading` (handoff 3's frame), `H01-error` (built from spec);
- `H01-unavailable`, `F01-unavailable` (handoff 6's frames), `M01-unavailable` (built from spec);
- `G06-switcher`, `G06-switcher-status`, `G06-switcher-unavailable`;
- `global-club-not-in-build-selected` (an active club in this build, new row, built from spec).

The switcher's snapshots draw the sheet's content at its height, on its own. `ScreenSnapshot` draws a host's own view (`drawHierarchy`), which a presented sheet isn't part of. So the dimmed Home behind it, which the renders draw, is a known difference, and the system draws the real sheet's dimming and corners (handoff 6's note on `G06-switcher-status`).

## 4. Privacy and the review's checks

- **Nothing of a club from another account:**
    - the kept choice holds two ids and nothing else;
    - it is forgotten at Leave sign-in and on a server-ended session;
    - another account's choice is never read (T11).
- **A suspended club shows nothing readable:**
    - no name in the header;
    - no line but "Unavailable" in the switcher, where the list names it as the server sends it;
    - no call for its details (T9, spec 22).
- **No count or record of who decided:** Home's review state reads only the caller's own `my_decision` (book p30, T15, T33).
- **No log line or analytics event** carries a club's name or id (T52).

## 5. Not here

- Club details and the members lists (3b).
- Create a club (PR 4).
- Review members' screen (PR 7).
- The days (B2).
- Get help's contact, until a support address is configured.
