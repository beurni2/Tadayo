# Design handoff 8: the check

*20 November 2026, by the ios lane. This checks Claude Design's answer to handoff 8's brief (`docs/design/handoff-8/handoff-8-brief.md`, and the text pasted, `handoff-8-brief.txt`). The lane read every frame at full size beside the frame it builds on, the written answers (`IMPLEMENTATION.md`, `component-contracts.json` and `copy-contracts.json` under `handoff8`) and the files' own checks, against the brief, the spec, the book, the addendum, the invariants and the open questions. One fresh reviewer then read the branch (section 7).*

## The answer

**Claude Design did what the brief asked.** All 15 frames came, titled and in the brief's order, with one more it sent to answer frame 14's question (`G05-club-details-active`), and every written question has an answer. What matters most:
- **Nothing leaks.** The signed-out page still shows the inviter's name alone. `G02-checking` shows nothing of the club while the link is checked. The failures keep what was on screen and say only that the action didn't happen. No approval is counted and no decliner is named. None of its 106 new strings has an inferred pronoun or "Sent".
- **The brand is untouched.** The tokens are revision 1.1, byte for byte, and every photograph, font and wordmark in the export is a file the repository already holds.
- **The new direction is drawn:** Welcome and the signed-out page carry "Your day. Your story. A thought from your friends.", and Welcome explains taking turns: "Take turns sharing what you’ve been up to. Friends can add something that reminded them of you."

**One decision for the founder,** FQ77 (section 5): handoff 8 asks the app to keep an invitation link longer, so the proposer can share it again with someone who must accept a newer roster. FQ77's default, a shorter keep, stands until the founder answers, and handoff 8 also drew what the row shows under it.

**Three places where the app keeps the earlier frames or the data over these frames** (section 4): Welcome keeps 2.1's "Already here? Sign in", which the redraw drops without saying why; Club details keeps Leave club at the leading edge; and the changed-name roster lists every member, where the frame draws three of six.

**Nothing blocks the build.** Section 6 lists what changes in B1's PRs; `docs/plans/ios-b1-clubs.md` has them written in.

## 1. What arrived, and where it is kept

- **The file:** `Tadayo_Handoff_8_Pack.zip`, attached by the founder in the ios thread at 14:30 UTC on 2026-11-20, sha256 `1072fefea2314a2a56440644fdb27fecb2cf78eedf027de259cc007e1d2055af`, 54 files. Its contents are in `design/reference/claude-design/handoff-8/` unchanged; the PDF inside is `Tadayo_Handoff_8_B1_Implementation.pdf` (14 pages).
- **The checks on the files:**
    - Its `checksums.sha256` verifies for all 53 files it lists, and the folder in the repository is identical to the unpacked zip (`diff -r`).
    - No file holds a script, an event handler or an outside link.
    - 16 frames, each an SVG at 393×852 points and a PNG at 786×1704, titled with the state's name (`frame-manifest.json`).
    - `brand-tokens.json` is byte-identical to revision 1.1's. `assets/` (Ben's, Debby's and Maya's portraits, the chair, the two wordmarks) and `fonts/` (Arimo and its licence) are byte-identical to files of handoffs 0, 1 and 7.
    - `copy-contracts.json` and `component-contracts.json` keep every earlier entry unchanged and add only `handoff8`, so they hold all earlier handoffs' words and contracts.
    - Its own `validation-report.json` lists 501 checks, all passed, and two limits: the frames are static drawings, not iOS snapshots, and frame 15 leaves three members unnamed.
    - `source-provenance.json`: Claude Design read the repository's `main` on 2026-11-20, every file at today's version except `design/reference/INVENTORY.md`, read as #72 left it, before #86 added the brief's 11 rows. That changes nothing, since the brief named every frame.
- **No new component sheet,** so `brand/brand-components.png` stays handoff 7's.
- **In the repository:** the frames are named in `design/reference/screens/` and the inventory says where each comes from (ADR-027): 13 new files, and `G02-web`, `G02-web-dark` and `G02-web-xl` replaced, handoff 1's and 2's frames staying in their folders. `A01-welcome`'s 2.1 render stays in `2.1/`; the new file in `screens/` wins.

## 2. What came back

| # | Frame | What it shows |
|---|---|---|
| 1 | A01-welcome | The 144-point wordmark; the brand line in the day title's size; the explanation; "An example · before and on the day" over "Debby’s Friday · 6 November 2026"; "Caption now" (Maya's folded card, "Your future living room.") beside "Photo on the day" (the chair); Create a club and I have an invite. |
| 2 | A01-welcome-dark | The same in dark. |
| 3 | A01-welcome-xl | The largest text: one scrolling column, the two stages stacked, both routes in the scroll with no fixed footer. |
| 4 | G02-web | The wordmark, "Ben invited you to a club on Tadayo", the brand line, Get Tadayo. Nothing else. |
| 5 | G02-web-dark | The same in dark. |
| 6 | G02-web-xl | At 200% text zoom; the page scrolls to Get Tadayo. |
| 7 | G01-create-failed | "Sunday people" kept in the field, its border unchanged, and "Couldn’t create the club. Check your connection and try again." under it with a warning glyph; Continue to invitations available. |
| 8 | G02-checking | "Checking invitation…" with a spinner and "We’ll check the link before showing the club or its people." No club, inviter, roster, date or photo. |
| 9 | G02-invitation-failed | Debby's invitation to Sunday people, the roster kept (Ben · You first), "Couldn’t accept this roster. Check your connection and try again." over Accept this roster and Not now. |
| 10 | G03-approve-failed | Maya's approval of Leila for Kitchen table: the shield's note kept, "Couldn’t approve Leila. Check your connection and try again.", Approve Leila and Decline both available. |
| 11 | G05-club-details-failed | "Couldn’t load club details." and "Check your connection and try again." with Retry at the foot; no rows and no member count. |
| 12 | G01-invite-people-accept-again | Ben's list for Sunday people: Sam "Needs to accept again" with a circular arrow and Share again only; Maya Shared, Alex and Nina Not shared, Debby Accepted. |
| 13 | G01-pending-approve | "Review the updated members", "Review and approve the updated roster before Sunday people can start.", the Private drafts row, and Review members. |
| 14 | G05-members-invite | "Nina’s invitation" for Sunday people (five members): Nina "Proposed by Ben" with the Proposed tag, a Shared card, "New members need everyone’s approval. Nina will see only drops shared after joining.", Share again and More options. Nina, the book's Saturday member, is the candidate here, and frame 16 leaves Nina out of Sunday people's five, because the brief asked for a later addition to a club the book fills; nobody new is invented. |
| 15 | G02-changed-name | "Review the updated roster", "Ben invited you to Kitchen table.", "The invitation was made for Leila. The updated roster now shows your name.", then "Kitchen table · 5 current members" over Debby · You (Proposed by Ben, Proposed), Ben and Maya, and Accept this roster. |
| 16 | G05-club-details-active | Sunday people's Club details with five members: Members, Invite someone, Schedule, Notifications, Widget, Private drafts, Leave club. |

## 3. The written answers

The brief's seven questions:
1. **Welcome's example** stays a friend's drop: Maya's card for Debby's Friday beside the chair, labelled "An example · before and on the day" (FQ20). The chair stays a stand-in for the founder's own photograph (FQ23). It is local to the app and never club data. The example's sender avatar is Maya's portrait, also one of book p50's photographs, which no answer mentions: `docs/QUESTIONS.md` now records it under FQ23, with the same default as the chair (a fixture in builds that point at `dev`, the brand's avatar fallback in a build that points at `prod`).
2. **The brand line** sits under the wordmark on Welcome, in the day title's role, and after the inviter's heading on the signed-out page, in the caption role. Nowhere else. The page for a revoked or unknown link (`G02-web-revoked`) doesn't carry it: it stays a neutral recovery page.
3. **The in-app invitation's explanation** (`G02-invitation`) doesn't change, and takes no brand line: it explains joining and the exact roster, which the new direction keeps. So no frame came for it.
4. **The failure words** (frames 7, 9, 10 and 11): "Couldn’t create the club." / "Couldn’t accept this roster." / "Couldn’t approve {name}." / "Couldn’t decline this invitation.", each followed by "Check your connection and try again." or, for a refusal, "Try again.", as handoff 7's lines are. VoiceOver reads the line once, politely, with the focus left on the button, and skips the warning glyph. The approval's own outcomes are native alerts:
    - the roster changed: "Review the updated roster" / "The members have changed. Review the updated roster before approving." (or "declining"), with Review members, which loads the newer roster and replays neither decision;
    - the club full: "{clubName} is full." / "{clubName} already has six members.", with See members.

   Loading and failing has one form for every B1 screen that loads, each with its own words: "Loading club details…", "Loading members…", "Loading proposed members…", "Loading invitation…", "Loading invitations…", and "Couldn’t load …" with Retry.
5. **A link for a club the person is already in** opens that club with no line first. If the app has to wait, it shows a neutral wait, then "Opening {clubName}…" only once the server has confirmed the club. Opening it doesn't use the link up.
6. **Sign-in** carries no new object: Welcome already carries the Example, and the profile's own photograph is setup's real object (handoff 7's needs list, item 32).
7. **A club's header** changes as the header before a club did: it scrolls with the content with the band behind the status bar, and takes two rows at every accessibility size, the club's selector first at full width, + Add and Account below. The header before a club is used only when no club is selected (item 55).

Also answered, for the four points kept for this stage:
- **A used link** (frame 12): its row says "Needs to accept again" until the server confirms the newer roster's acceptance, and offers Share again only. Sharing never says it was delivered or accepted.
- **"Proposed by"** keeps the candidate's proposer, the member whose link was used, across a revision a changed name made: "Proposed by Ben" (FQ84).
- **The creator's own approval** (frame 13): the same title, line and Review members show on Home before the club starts (`H01-awaiting-activation`) when the creator's decision on the current revision is pending; otherwise the ordinary waiting line stays.
- **A later addition's link** (frames 14 and 16): Club details' Invite someone, below Members and above Schedule, shows only when the server allows a proposal and a place is free, never at six. It leads to the person's name, then to that person's own invitation page, where the link is shared and managed. Only the proposer sees the link's controls, and comes back to them from the person's proposed row in Members. The setup list stays a setup screen.
- **The changed name** (frame 15): after a relaunch, when the app no longer holds the earlier name, the line is "The updated roster now shows your profile name. Review it before accepting again.", never a name read from the link.
- **The invitation roster** lists every entry the server sends, once each, the viewer first and then the server's order.

## 4. Where the app keeps the earlier frames or the data

1. **Welcome keeps "Already here? Sign in".** 2.1's Welcome has it under I have an invite. The three new Welcome frames leave it out, and nothing in the answers says why: `handoff8.replaces.welcome` says the redraw changes the "Headline and explanation only". Without it, someone with an account who is signed out, on a new phone or after a reinstall, reaches sign-in only through Create a club, whose route ends at `G01-create`. The app keeps the link below the two routes until the next brief asks. That isn't a product choice for the founder: 2.1 gives a returning person this way to sign in, and handoff 8 says it changed only Welcome's headline and explanation. Where the link sits in the redrawn layout, at the largest text too, is design's: `docs/design/handoff-7/ios-lane-needs.md` item 61 asks it for the next brief.
2. **Club details keeps Leave club at the leading edge** under the list, as 2.1's `G05-club-details` and handoff 6's `G05-club-details-paused` draw it, and as handoff 7 put text actions. Frame 16 centres it near the foot, with no answer saying why. Leaving is stage B6's. Item 62 of the needs list asks which place holds.
3. **The changed-name roster lists every member.** Frame 15 draws Debby · You, Ben and Maya under "Kitchen table · 5 current members", because the brief named only Ben and Maya of Kitchen table's five, and Claude Design invented none. The frame's own note says the app lists every name the server sends, which it does.

The inventory records all three under Known differences, "Handoff 8". Taken as drawn, since no rule speaks against them: the viewer first in the invitation roster (spec 09's stable roster order is Friends'), the selected club's header, the joined link, and sign-in with no new object.

## 5. For the founder: how long the app keeps an invitation link (FQ77)

The server returns a link once and keeps only a hash of its token, so Share again shares a copy the app kept. FQ77's default keeps that copy, in the account's own store on the phone, until the link is used, revoked or expired, and purges it at logout and at an account switch.

Handoff 8 asks for a longer keep (`handoff8.linkRetention`): while the person's proposal is open, through "accepted" and "used" too, and purged when the person joins, the invitation ends, the server says the link no longer works, at logout or at an account switch. That way Ben can share Sam's link again when Sam must accept a newer roster (frame 12).

- **With the default:** Sam's row says "Needs to accept again", then "This invitation link isn’t saved on this device." and "Sam can reopen the invitation already received.", with no action: the server won't make a new link or revoke one already used to accept. Sam still has the link in Messages. Since the default lets the copy go when the link is used, every used row reads this way, so the line names the device for what is the default's own choice. It is also the one exception to the default's "the row offers Create new link", which the contract makes, not the app.
- **With the longer keep:** Sam's row has Share again, as frame 12 draws it. The phone holds the link longer, but a used link only opens the roster for the account that accepted with it (the contract's `InvitationPreview`: any other account gets the neutral not found), so passing it on can't let someone else in.
- **What changes:** only the app's store, built later in B1 (`ios/b1-create`), and the contract's words for `InvitationLink`, which are the api lane's: if the founder chooses the longer keep, this lane asks for them under "Needs from the other lane" in `docs/PROGRESS.md`. No stored data.

The lane recommends the longer keep: it is what the design draws, and the token it holds can admit only the person it was used by. The default stands until the founder answers. `docs/QUESTIONS.md` records the ask under FQ77.

## 6. What changes in B1's PRs

`docs/plans/ios-b1-clubs.md` section 4 has these written in:
- **`ios/b1-clubs-root`:** the selected club's header in two rows at every accessibility size, with the band behind the status bar; `G05-club-details-failed`'s form, with its words, for every screen that loads.
- **`ios/b1-create`:** `G01-create-failed`'s line under the field; Sam's used row with Share again only, or handoff 8's two lines and no action when the app doesn't hold the link (FQ77); `G01-pending-approve` when the creator must approve.
- **`ios/b1-invitation`:** `G02-checking` while a link is checked; a joined link opens the club, with "Opening {clubName}…" only if it waits; `G02-invitation-failed`; `G02-changed-name`, with the relaunch line; the viewer first in the roster.
- **`ios/b1-approve`:** `G03-approve-failed`'s lines and its two alerts; Invite someone on Club details for an active club (`G05-club-details-active`) and the person's invitation page (`G05-members-invite`).
- **`ios/b1-welcome`:** Welcome as frames 1 to 3 draw it, with "Already here? Sign in" kept.
- **`H01-awaiting-activation`** (Home before the club starts, `ios/b1-clubs-root`): frame 13's words when the creator must approve.
- **The signed-out page** (`G02-web`, its dark and 200% frames) is the api lane's, in `apps/web`: `docs/PROGRESS.md` tells it the frames are in `screens/`.

## 7. The pictures, and the review

**The pictures** are on the `evidence` branch under `ios/b1-design-handoff-8/fef7877/check/` (its `index.md` lists them): the 16 frames on three contact sheets (`frames-1-6.png`, `frames-7-11.png`, `frames-12-16.png`), and eight frames each beside the frame it builds on (`before-after-<state>.png`).

**The review:** one fresh reviewer read the whole branch at `fef7877` (the export against its checksums, every frame beside the frames it builds on, this check's claims, the inventory's rows and counts, and the records). No must-fix; 3 should-fix and 8 notes, all taken in the review commit, whose log entry in `docs/JOURNAL.md` lists them:
- **Should-fix:** `docs/plans/ios-b1-clubs.md` lacked three of section 6's changes (the relaunch line and the viewer first, in `ios/b1-invitation`; frame 13's words on `H01-awaiting-activation`, in `ios/b1-clubs-root`), now written in; Welcome's example also shows Maya's portrait, a book p50 photograph, now recorded under FQ23 and on the `A01-welcome` row; the kept sign-in link and Leave club's place had no ask for the next brief, now the needs list's items 61 and 62.
- **Notes:** "Proposed by" on frame 15 can come only from `inviter_name`, for the viewer's own row (plan, `ios/b1-invitation`); the FQ77 default's exception for a used link, and the api lane's words if the longer keep is chosen (section 5); Nina's place in frames 14 and 16 (section 2); the journal's count of provenance sources, 30 not 31 (corrected in the review commit's entry); a stale sentence in `docs/PROGRESS.md`; four inventory wording slips; a state name of its own for the used row under the default (plan, `ios/b1-create`); the pictures' path, above.
