# Design handoff 9: the check

*22 November 2026, by the ios lane, in `ios/b1-invitation-screens` (stage B1's PR 6b). This checks Claude Design's answer to handoff 9's brief (`docs/design/handoff-9/handoff-9-brief.md`, and the text pasted, `handoff-9-brief.txt`). The lane read every frame beside the frame it builds on, the written answers (`IMPLEMENTATION.md`, and `component-contracts.json` and `copy-contracts.json` under `handoff9`) and the files' own checks. It read them against the brief, the spec, the book, the addendum, the invariants and the open questions. The check is in 6b, not a design PR of its own, because 6b holds the brief and the rows handoff 9 answers. A fresh reviewer reads it with the rest of the branch (section 7).*

## The answer

**Claude Design did what the brief asked.** All 20 frames came, titled and in the brief's order, and every written question has an answer. What matters most:
- **Nothing leaks.**
    - The check's failure (frame 1), the paste step's three states (frames 3 to 5) and the signed-out page's two (frames 12 and 13) show nothing of the club, the inviter or the roster.
    - No failure says a link no longer works: only the server's answer does (`G02-revoked`).
    - The accepted invitations' rows (frames 7 to 11) show the club's name and the invitation's state, with no count, no progress and no name of who approved or declined.
    - None of the 75 new strings has an inferred pronoun or "Sent".
- **The brand is untouched.** The tokens are revision 1.1, byte for byte. Every photograph, font and wordmark in the export is a file the repository already holds.
- **Every open item for handoff 9 is answered:** the needs list's items 61 to 69 (`docs/design/handoff-7/ios-lane-needs.md` sections 12 to 14), the refusal words, Retry's hint, the Proposed tag and where accepted invitations show.

**One decision for the founder, FQ137, now answered** (section 5): handoff 9 gives `G03-declined` a line that promises nothing of the inviter, "You can close this invitation.". The founder chose it on 22 November 2026.

**Two places where the app keeps something other than the frames** (section 4):
- Another candidate's row in an invitation's roster has the Proposed tag without "Proposed by", because the roster the server sends names no proposer.
- The check's failure keeps the app's `secondaryText` for its line, as every other failure screen does.

**Nothing blocks the build.** Section 6 lists which PR adopts what. 6b adopts frames 1 to 6, the Proposed tag on every candidate, Retry's hint and the declined line.

## 1. What arrived, and where it is kept

- **The file:** `Tadayo_Handoff_9_Pack.zip`, attached by the founder in the ios thread at 18:41 UTC on 2026-11-22, sha256 `25653c437d26451aea63…` (the full hash is in the commit's log entry), 64 files. Its contents are in `design/reference/claude-design/handoff-9/` unchanged; the PDF inside is `Tadayo_Handoff_9_B1_Implementation.pdf` (18 pages).
- **The checks on the files:**
    - **Checksums:** `checksums.sha256` verifies for all 63 files it lists.
    - **Scripts and links:** no file holds a script or an event handler. `index.html` links only to the export's own files.
    - **The brief:** `SOURCE_BRIEF.txt` is `handoff-9-brief.txt` word for word. Only its line breaks differ: each list item's number sits on a line of its own.
    - **The frames:** 20, each an SVG at 393×852 points and a PNG at 786×1704, titled with the state's name (`frame-manifest.json`).
    - **The brand and the files it reuses:**
        - `brand-tokens.json` is byte-identical to revision 1.1's.
        - `assets/` and `fonts/` are byte-identical to handoff 8's files, except `dog.png`, which is handoff 7's (`claude-design/handoff-7/assets/dog.png`). The assets are Ben's, Debby's and Maya's portraits, the chair, the dog and the two wordmarks; the fonts are Arimo and its licence.
    - **The contracts:** `copy-contracts.json` and `component-contracts.json` keep every earlier entry unchanged and add only `handoff9`.
    - **Its own checks:** `validation-report.json` lists 807 checks, all passed. It says the frames are static drawings, not iOS or browser accessibility results.
    - **What it read:** `source-provenance.json` says Claude Design read the repository's `main` on 2026-11-22. All 15 files it lists are at `main`'s current version (`git rev-parse origin/main:<path>` matches each blob). It read `design/reference/INVENTORY.md` as `main` has it, without this branch's rows. That changes nothing, since the brief named every frame.
- **No new component sheet,** so `brand/brand-components.png` stays handoff 7's.
- **In the repository:**
    - The frames are named in `design/reference/screens/` and the inventory says where each comes from (ADR-027): 17 new files.
    - `A01-welcome`, `-dark` and `-xl` are replaced. Handoff 8's frames stay in `claude-design/handoff-8/frames/`.

## 2. What came back

| # | Frame | What it shows, against the brief |
|---|---|---|
| 1 | G02-checking-failed | "Couldn’t check the invitation link." over "Check your connection and try again.", Retry pinned. Nothing of the club. As asked. |
| 2 | G02-opening | The spinner beside "Opening Sunday people…", alone. As asked. |
| 3 | G02-link-entry-signed-in-checking | The link kept, the field read-only, Paste unavailable, Continue with its label and a spinner. As asked. |
| 4 | G02-link-entry-signed-in-invalid | "tadayo.app" kept, the field's invalid border, handoff 4's line, and Continue unavailable. As asked; Continue's state is new (section 3). |
| 5 | G02-link-entry-signed-in-cannot-check | The usual border, the line, Paste and Continue available. As asked. |
| 6 | G02-changed-name-relaunch | Handoff 8's frame 15 with the relaunch line; Debby · You with "Proposed by Ben" and the tag; Ben and Maya; "Kitchen table · 5 current members". As asked. |
| 7 | G06-no-club-invitation | Home with no club: an Invitations section under the header, Kitchen table's row ("Waiting for members"), then Start your club, its two routes and Private drafts. |
| 8 | G06-no-club-invitation-xl | The same at accessibility 5, in one scrolling column. |
| 9 | G06-no-club-invitation-changed | The row with "Review updated members" and "Open the invitation link to continue.", the case where the phone doesn't hold the link (FQ136). |
| 10 | G06-no-club-invitation-declined | The row with "Invitation didn’t go ahead". No one named. |
| 11 | G06-switcher-invitation | The switcher over Debby's Friday: Sunday people, then an Invitations section with Kitchen table's row, then Club details, Create a club and Cancel. |
| 12 | G02-web-checking | "Checking invitation…" with Retry busy below it and Get Tadayo: the check after a Retry. The first check has no Retry (section 3). |
| 13 | G02-web-failed | The title over "Check your connection and try again.", Retry as a primary button, Get Tadayo. |
| 14 | G01-invite-people-empty | As built: the title, Sunday people, "Each person gets a separate link.", Create an invitation, "Only you can see this list.", Done for now. |
| 15 | G01-invite-people-live-not-held | Alex's row: "Link not on this phone" with `iphone.slash`, Create new link, More, and "A new link replaces the previous link." under it. |
| 16 | G01-invite-people-expired | Alex's row: "Link expired" with `clock`, Create new link, More. |
| 17 | G01-invite-people-action-failed | Maya's Revoke not confirmed: "Couldn’t confirm that Maya’s invitation link was revoked. Check your connection and try again." 24 above Done for now; the rows as they were. |
| 18 | A01-welcome | Handoff 8's frame 1 with "Already here? Sign in" under I have an invite. |
| 19 | A01-welcome-dark | The same in dark. |
| 20 | A01-welcome-xl | The one column, scrolled to its three routes. |

Frame 16 draws a More button on Alex's expired row, where the written answer and `setupLinks.expiredUnused` say "omit More/Revoke for that already expired link". The written rule wins: no More on an expired row.

## 3. The written answers

- **The check's words** (`handoff9.failureStates`):
    - No answer: "Couldn’t check the invitation link." over "Check your connection and try again.". On the paste step it is one line, "Couldn’t check the invitation link. Check your connection and try again.".
    - A refusal, a rate limit or a server error: "Try again." in that place. On the paste step: "Couldn’t check the invitation link. Try again.".
    - Each is said once, politely. Retry's hint is "Try checking this invitation link again.".
    - The paste step's failure never marks the field invalid. Only text that isn't a link does, and Continue then waits until the text is a plausible link.
    - These are the words 6b built from spec, except the hint, which is new.
- **Focus on Retry:** "On Retry keep focus on its initiating control". The signed-out page keeps Retry in place, busy, while it checks again (frame 12). 6b does the same in the app (section 6).
- **The Proposed tag** (`invitationRosterTag`): on every candidate in an invitation's roster, the viewer included, never on a member, with "Proposed by {candidate.proposed_by}". It corrects handoff 8's frame 9, which drew none on "Ben · You". The viewer's own row reads "{name}. You. Proposed by {proposerName}. Proposed." (`handoff9.proposed.ownRow.vo`).
- **Accepted invitations** (`acceptedInvitations`):
    - **Where:** an Invitations section under Home's header when there is no club, and after the switcher's clubs when there are clubs. Each invitation is one full-width row and one button, and opens its state.
    - **The words, by state:**
        - `waiting`: "Waiting for members".
        - `roster_changed`: "Review updated members". When the phone doesn't hold the link, it adds "Open the invitation link to continue." and opens the paste step (FQ136).
        - `did_not_go_ahead`: "Invitation didn’t go ahead".
    - **VoiceOver** reads the club's name, then the state, as sentences, with a hint for each state.
- **The signed-out page** (`webCheck`):
    - **Live region:** a polite status region that stays.
    - **Retry:** stays in place while busy (`aria-disabled`), and the focus stays on it. When a final answer removes Retry, the focus goes to Get Tadayo.
    - **Timing:** "Checking invitation…" shows at once, and the first check has no Retry.
    - **No JavaScript:** a `noscript` line, "Turn on JavaScript to check this invitation.".
    - **Get Tadayo's hint** follows its destination: "Open TestFlight in the App Store." under FQ133's trial link.
    - **Dark and 200%:** the same rules as `G02-web`, with no extra frames.
- **The setup list** (`setupLinks`):
    - **Frame 14** needs no line of its own.
    - **A live link the phone doesn't hold** reads "Link not on this phone", with the replacement line under the row.
    - **An expired link** reads "Link expired" with `clock`, Create new link and no More.
    - **The VoiceOver labels name the person:** "Create new link for Alex", "More options for Alex’s invitation", and the same for Revoke link, Share link and Share again.
    - **A failed action** gets words for each operation and each failure. The line stays through scrolling, menus and a cancelled share sheet, and clears when another change starts or the person leaves.
- **`G01-create`'s words:** 2.1's, as built; handoff 8's shorter introduction was a slip.
- **A name over 40 characters:**
    - For a club: "Use 40 characters or fewer for the club name.".
    - For a person invited: "Use 40 characters or fewer for this person’s name.".
    - Both counted in grapheme clusters, as the profile's are.
- **Welcome's sign-in link:** kept, under I have an invite, hinted "Sign in to your existing account.".
- **Leave club:** at the leading edge, as built.

## 4. Where the app keeps something else

`design/reference/INVENTORY.md`'s Known differences ("Handoff 9") lists each:
- **"Proposed by" on another candidate's row.** Handoff 9 asks for each candidate's `proposed_by`. The roster the server sends with an invitation (the contract's `InvitationRoster`, `InvitationRosterEntry`) names no proposer for anyone, so:
    - The viewer's own row says "Proposed by {inviter}". The inviter is the viewer's proposer, since only a candidate's proposer makes their link (FQ71).
    - Another candidate's row has the tag alone.
    - Showing a proposer there would need the contract to carry one, which the api lane would weigh against T7. `docs/PROGRESS.md` asks it, with no rush.
- **The check's failure line's ink.** `checkFailure.bodyInk` is `primaryText`, as handoff 7's and 8's failure frames draw it. The app keeps `secondaryText` for every explanatory line (Known differences, "The body ink"), so this screen matches the other failures. Whether `primaryText` should hold everywhere goes in the next brief.
- **Frame 6's count** ("5 current members"): the snapshot's fixture holds the frame's three people, so its line says 2. This is the same difference as frame 15's.

## 5. FQ137: the founder's answer

FQ137 asked what `G03-declined` says when the inviter has left the club. Its default kept handoff 1's "You can close this invitation. Ben can start a new invitation later.", which is untrue then. Handoff 9 gives a line that promises nothing of the inviter, "You can close this invitation." (`handoff9.invitation.ended.close`). The founder chose "Use the new line" on a card in the ios thread at 18:45 UTC on 2026-11-22. It is recorded under FQ137 in `docs/QUESTIONS.md`. Only the app's string changes; the API still names the inviter (`InvitationEnded`), and `G03-declined` no longer shows the name.

## 6. What changes in which PR

- **`ios/b1-invitation-screens` (6b, this branch):**
    - Frames 1 to 6 as drawn.
    - Retry's hint. Retry stays in place, busy, with "Checking invitation…" as its title while it checks again (`G02-checking-failed-retrying`, built from spec on frame 12's form).
    - Continue waits after text that isn't a link (`InvitationLinkEntryModel.canContinue`).
    - The Proposed tag on every candidate, with handoff 9's reading on the viewer's row.
    - `G03-declined`'s new line.
- **`ios/b1-invitation-list` (6d):** frames 7 to 11 and their words, hints and routes.
- **The setup list's adoption,** a small PR after 6b, `ios/b1-create-handoff-9`:
    - Frames 15 to 17.
    - The action labels that name the person.
    - The failure words for each operation, and the line's lifetime.
    - No More on an expired row.
    - The two name-length lines.
    - Frame 14 and `G01-create`'s words are as built.
- **`ios/b1-welcome`:** frames 18 to 20, with the sign-in link's hint.
- **Leave club:** as built; nothing changes.
- **The signed-out page** (frames 12 and 13) is the api lane's, in `apps/web`. The api thread was told of the answers on 22 November 2026, and `docs/PROGRESS.md` points it to `handoff9.webCheck` and the frames.

## 7. The pictures, and the review

**The pictures:** the 20 frames on three contact sheets and 6b's snapshots of frames 1 to 6, beside them, on the `evidence` branch under `ios/b1-invitation-screens/` with the run that takes 6b's references.

**The review:** the fresh reviewer of PR 6b reads this check with the rest of the branch. Its findings are recorded in the PR and the journal.
