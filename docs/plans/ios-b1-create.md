# B1, PR 4: creating a club and inviting people (`ios/b1-create`)

Branch `ios/b1-create`, from `main` at `3893a40`. Written on 21 November 2026. The fourth PR of `docs/plans/ios-b1-clubs.md` section 4, split in two, as PR 3 was:

- **4a, this branch:** what the screens stand on, with no screen. `TadayoCore`'s models for the three steps (naming the club, the setup list, the name step), the per-account store of invitation links (ADR-037) with its rules, and the app's keychain for that store, forgotten at Leave sign-in and after a reinstall. ADR-037's third point is brought to the contract's words (section 4).
- **4b, `ios/b1-create-screens`, next:** the screens and their states (section 3), the routes from `G06-no-club` and the switcher, the share sheet, and the club list's read wired to the store. It starts once #98 (`ios/b1-club-details`) has merged, because both change the tabs, the root and the UI tests' fakes.

The split changes no product decision and no state the plan lists. It keeps the review of the link store, where a mistake leaks a token or keeps one too long, apart from the review of the screens. Until 4b merges, nothing calls the models; 4a's only change a person could notice is the keychain item forgotten at Leave sign-in and after a reinstall, which holds nothing until 4b keeps links in it.

## 1. What 4a builds

### The link store (`TadayoCore`, `InvitationLinks.swift`)

The server returns an invitation's link to its proposer once and keeps only its token's hash (the contract's `InvitationLink`; FQ77). The app keeps the link, as ADR-037 decided and the contract's `InvitationLink` words say.

- **`KeptInvitationLink`:** one link the app made: the club's id, the candidate's id, the invitation's id, the link (`https://tadayo.app/i#<token>`), and whether a share of it completed (`shared`, FQ67: the app's own record, which the server never knows; `CandidateLinkState`'s words). Nothing it prints, reflects or dumps holds the link (T7, T52), as `InvitationLink` and `InvitationToken` already do.
- **`InvitationLinkVault`:** where the kept links live, as one file for one account: `load()`, `save(_:)` and `delete()`, each able to fail. `InMemoryInvitationLinkVault` is the tests'.
- **`InvitationLinkBook`** (`@MainActor`), the rules, over a vault:
    - `keep(_:club:account:)` keeps a link the server just returned. An answer without its link (a retry's replay, T19) keeps nothing. A link kept for another account than the file's replaces the file: one account's links are never read for another (T11). An empty account id is nobody's: it keeps nothing, and a file left for it is never read.
    - `link(for:club:account:)` is the link kept for a candidate, if this account's file holds one.
    - `markShared(_:account:)` records a completed share (the share sheet's Copy among them, FQ67).
    - `beginRead()` gives a stamp to take before a read is requested. Only an answer to a read requested after a link was kept decides on it (the contract: "each successful `listMembers` answer it requested after storing the link decides"), so a read already on its way when the link was made, whose answer can't list it yet, never purges it.
    - `settle(_ list: MemberList, stamp:account:)` keeps each of the club's links while the answer's open revision lists a candidate with the link's candidate id and invitation id, in the state `live`, `accepted` or `used`, and purges it otherwise: the candidate joined, the proposal ended, or the link was revoked, expired or replaced by a newer one.
    - `settleGone(club:stamp:account:)`: a not found from `listMembers` purges the club's links.
    - `settle(_ list: ClubList, stamp:account:)`: a club the list no longer holds has its links purged.
    - `drop(_:account:)` removes a link the moment the server confirms its revoke: the server has said it no longer works (ADR-037), whatever a later read says.
    - `forget()` drops every link and the vault's file: the app calls it at Leave sign-in, which is both logout and the way to another account (ADR-037, T11). A vault that can neither delete the file nor leave an empty one in its place is tried again at the book's next access (review round 1, F7). Until then nothing reads the forgotten file back, and a write that reaches the vault meanwhile, the next account's link, replaces it and ends the retry (review round 2, R2-2).
    - A failed or offline read is never settled, so it changes nothing. Links loaded at launch count as kept before any read of that launch.
    - A vault that can't save keeps the link in memory for this launch only. One that can't load (the item is readable only while the iPhone is unlocked) reads as nothing kept, has nothing written over it, and is read again at the next access, where the links this launch kept meanwhile join the vault's, one account's file at a time and this launch's link in place of the vault's for the same candidate, and what a read or a revoke decided meanwhile holds for the vault's links too, before they're written back (review round 1, F1; round 2, R2-3). An item that can never be read, data no build decodes, is no item: the vault deletes it and reads nothing, so it holds no token and the next write starts afresh; only a failure to read it now is retried (review round 2, R2-1). Either way the screens then offer what the contract says for a link the app doesn't hold.

### The app's vault (`apps/ios/Tadayo/App/KeychainInvitationLinkVault.swift`)

One generic-password item, `app.tadayo.invitations`, whose account is the build's environment (`dev`, `prod`), in the access group `group.app.tadayo` that the session's item already proves on an unsigned simulator build (`KeychainSessionStore`), readable only while the iPhone is unlocked, on this device only, never synchronised. Its data is the account's id and its links, as JSON. A keychain failure carries its status and nothing else (`KeychainFailure`, T52).

- **Forgotten at Leave sign-in.** `AppGraph`'s `left` forgets the book, with the connections reset, before sign-in shows (T11).
- **Forgotten after a reinstall.** `KeychainSessionStore.forgetEarlierInstall` deletes the session's items when the app group's mark is missing (FQ87). It deletes the links' item too, before it writes the mark: ADR-037 counts a reinstall as a device that no longer holds the link.
- **Hosted tests** (`TadayoTests`, both iOS versions): the vault saves, loads, replaces and deletes its item under a test service of its own; nothing is kept for an environment it wasn't saved for; an item it can't decode is deleted and reads as none; a reinstall's forgetting deletes it.

### The models (`TadayoCore`)

Each command carries a key made when its action starts, sent again with the same body on every retry of it (T19), as `ProfileModel` does; a changed body is a new action with a new key, and so is a Create new link after a Share link for the same candidate failed (review round 1, F10). Each model takes `current`, with no default, and an answer that lands after the session it was asked in ended keeps no link, shows no failure, ends no session and calls nothing more (T11; review round 1, F2 and F9). The name step's proposal answer still records the person proposed, before its check, on a screen that goes with the session (review round 2, R2-5). A failure keeps what was typed. `APIFailure.network` is "Check your connection and try again."; any other failure "Try again."; `signedOut` ends the session; nothing of an answer reaches a log (T52).

- **`CreateClubModel` (`G01-create`, `G01-create-failed`).** The club's name, trimmed, 1 to 40 characters (FQ70; over 40, Continue waits, as the profile's name does). Continue to invitations calls `createClub` with the name and the device's zone, fixed with the key (FQ19). Its answer, a `ClubDetail` at roster version 0, goes to `created`. A failure is `.network` or `.other` (frame 7's two lines, `handoff8.failureStates`), with the name kept and editable.
- **`InvitationListModel` (`G01-invite-people` and its states).** For one club and the account: `GET /v1/clubs/{club_id}` and `GET /v1/clubs/{club_id}/members` together (the roster version a proposal sends and `can_propose`; the open revision's candidates), a stamp taken before both, and the book settled by the members answer. Its rows are the open revision's candidates the caller proposed, in the server's order, each with its status and actions (section 2). Its actions: Share link and Share again (the kept link, for the share sheet; a candidate with no link yet gets one first), a completed share (`markShared`), Create new link (a new key: the server replaces the old link), and Revoke link (`revokeInvitation`, then the list read again; a refusal is "Couldn’t revoke {name}’s invitation link. Try again.", a network failure "Couldn’t confirm that {name}’s invitation link was revoked. Check your connection and try again.", and both keep the row as it was: handoff 4's `revokeLink`). What a link made or revoked here tells the row shows at once, before the read again and even if it fails, until an answer to a read asked after it comes; Create new link holds its row while the link is made; once it's made the row shows it, held, so a second tap finds nothing to make while the list is read again, and the new link can be shared at once (review round 1, F3 to F5; round 2, R2-4, which ended the hold through the read). Done for now goes to the waiting screen, `G01-pending`, or `G01-pending-approve` when the open revision's `my_decision` is `pending` (handoff 8's `creatorReviewRequired`). Create an invitation shows only while `can_propose` says a place is free. A not found closes the list and has the club list read again, as Club details does.
- **`InviteNameModel` (`G01-invite-name`).** The person's name, trimmed, 1 to 40 characters (FQ70). Create link and share is one action with two keys, made when it starts: `proposeRoster` with the name and the roster version the list read, then `createInvitation` for the candidate the answer added (the one candidate with that name the list didn't hold before). The link is kept before the share sheet opens, so a cancelled share never makes a second link (`createInvitation.retention`). On a retry, a step already done isn't done again. If the retry's answer comes back without its link (the first answer was lost on the way, T19), the same tap makes one more link under a new key, since the lost one was never shared. A failure is "Couldn’t create the invitation link for {name}." with the network's or a refusal's second line (`createInvitation.createFailure`, and handoff 8's rule for failure words). A version conflict reads the list's roster version again, and the next tap is a new action.

### Tests first, on Linux (`swift test --package-path packages/swift/TadayoCore`)

- `InvitationLinkBookTests`: a link kept and read for its candidate; a replay's answer keeps nothing; another account's file is never read, and keeping for another account replaces it; a share marked; each `CandidateLinkState` settles as section 2's table says (live, accepted and used kept; revoked and expired purged); a candidate gone from the open revision, an open revision gone, and a newer invitation id each purge; a read requested before a link was kept never purges it; a not found and a club gone from the list purge only that club's links; `forget()` empties the vault; a vault that fails to save keeps the link for the launch; one that fails to load reads as empty; no link's text in its description, debug description or mirror.
- `CreateClubModelTests`: trimming and the 40-character limit; the key and the zone reused on a retry with the same name, a new key for a changed name; the network's and a refusal's failure, the name kept; `created` on success; `signedOut` ends the session; one create at a time.
- `InvitationListModelTests`: rows from the open revision, the caller's candidates only, in the server's order; each row's status and actions (section 2); a candidate with no link gets one before sharing; Create new link uses a new key and keeps the new link; a completed share marks Shared, a cancelled one doesn't; Revoke link's two failures keep the row; Create an invitation only with `can_propose`; the pending screen's two forms; a not found closes the list; an answer after the list went away is dropped.
- `InviteNameModelTests`: propose then create, the link kept before it's offered for sharing; a retry after a lost proposal answer reuses the proposal's key; a retry after a lost link answer reuses that key, and a replay without its link makes one more link under a new key; the failure words; a version conflict reads the roster version again.

## 2. A candidate's row in the setup list

From the server's `CandidateInvitation` (its state) and the app's book (whether it holds the link, and whether a share completed). The More menu is the system's own (T45).

| Server | The app holds the link | Status (glyph) | Action | More | Source |
|---|---|---|---|---|---|
| No link yet | – | Not shared (`link`) | Share link: makes the link, then shares it | – | the contract's `Candidate` ("their app offers to make one"); handoff 4's statuses |
| `live` | yes, not shared | Not shared (`link`) | Share link | Revoke link | handoff 4 |
| `live` | yes, shared | Shared (`square.and.arrow.up`) | Share again | Revoke link | handoff 4, FQ67 |
| `live` | no | Not shared (`link`) | Create new link | Revoke link | the contract's `InvitationLink`; built from spec |
| `accepted` | either | Accepted (`checkmark`) | – | – | handoff 4; the contract: neither Share again nor Revoke link |
| `used` | yes | Needs to accept again (`arrow.clockwise`) | Share again | – | handoff 8's `usedInvitationRow`, frame 12 |
| `used` | no | Needs to accept again, then "This invitation link isn’t saved on this device." and "{name} can reopen the invitation already received." | – | – | handoff 8's `links.used.missing` and `links.used.reopen` |
| `revoked` | purged | Link revoked (`xmark.circle`) | Create new link | Create new link | handoff 4's `revokedMoreMenu` |
| `expired` | purged | Link expired (`xmark.circle`) | Create new link | Create new link | built from spec |

Two rows have no render: a live link the app doesn't hold (a reinstall, another phone), and an expired one. 4b builds them from the contract and handoff 4's nearest variants, marks them `built from spec` in the inventory, and asks design handoff 9 for them (`docs/design/handoff-7/ios-lane-needs.md`, items 64 and 65). "Link expired" is the only new words, made as handoff 4's "Link revoked" is.

## 3. What 4b builds (for its own plan section, written on its branch)

States, each in light, dark and the largest text: `G01-create`, `G01-create-failed`, `G01-invite-name`, `G01-invite-people`, `G01-invite-people-add`, `G01-invite-people-xl`, `G01-invite-people-revoked`, `G01-invite-people-accept-again`, `G01-pending`, `G01-pending-approve`, and new `built from spec` rows: the used row with no link (`G01-invite-people-used-missing`, so its snapshot isn't paired with frame 12), the live row with no link and the expired row (section 2). The routes: Create a club on `G06-no-club` and on the switcher sheet. The share sheet is the system's (`UIActivityViewController`, whose completion says whether a share completed; no contacts permission, spec 04). `RootModel` settles the book on each club list it reads and reads the list again once a club is made, selecting it.

Two known differences to record then: `G01-create-failed` (handoff 8, frame 7) draws "Name your club" and "A private place for your people." above the field, where 2.1's `G01-create` has "Your people, together.", "Start a private club with two to six people.", the roster line and the Drafts note; handoff 8 says its other entries are unchanged (`handoff8.replaces.other`), so the app keeps 2.1's words and puts frame 7's line under the field, and the next brief asks which (item 66). And a club's name over 40 characters, and a person's, have no words of their own (the profile's are for "your name"), so Continue and Create link and share wait with no line until item 67 brings one.

## 4. ADR-037's third point

The api lane's #92 wrote the contract's words for `InvitationLink` and `CandidateLinkState` after ADR-037. They say more exactly what the ADR's third point said: the server neither replaces nor revokes a link the candidate has accepted with, `accepted` or `used`, so a row for either offers neither Create new link nor Revoke link, and an accepted row offers no Share again either; a used row the app holds the link for offers Share again, and one it doesn't, handoff 8's two lines and nothing else. They also say which answers decide the keep (each successful `listMembers` answer requested after the link was kept, a not found from it, the club gone from `listClubs`; never a failed or offline read). This branch writes those into ADR-037, marked as an amendment of 21 November 2026, with no change to what the founder decided: the app keeps the link while the candidate's proposal is open, and purges it when they join, when the invitation ends, when the server says the link no longer works, at logout and at an account switch.

## 5. Privacy checks for the review

- A link appears in no URL the app builds, no log line, no analytics event, no snapshot and no fixture; the book's types print nothing of it (T7, T52).
- The kept links are purged when their candidate joins, the invitation ends or the server says the link no longer works, and at Leave sign-in and after a reinstall; another account's links are never read (T11, ADR-037).
- Only a successful answer requested after a link was kept purges it; a failed read changes nothing.
- One commit per key: a retry sends the same key and body, and a replay's answer without its link never stands for a kept link (T19).
- The keychain item is this device's only, never synchronised, readable only while unlocked.

## 6. Questions

No new FQ: the rows and words section 2 and section 3 build from spec are design's to draw, asked in the needs list for handoff 9. FQ17 (no cover in the trial), FQ19 (the club's zone), FQ67 (a copy counts as Shared), FQ70 (40 characters) and FQ71 (seven days) keep their defaults.
