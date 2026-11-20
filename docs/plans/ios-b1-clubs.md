# Stage B1, clubs: the ios lane's plan

Branch `ios/b1-plan`, from `main` at `d5e2ec9`. Written on 20 November 2026, after the api lane's B1 PRs (#73 create, #76 propose and a candidate's link, #77 accept, #78 leave) and B2's first PRs were on `main` and `dev`.

## 1. What is asked

`docs/MILESTONES.md`, B1, the ios lane:

- Screen A01 (`A01-welcome`, with the labelled example, FQ23), with the brand line and the new explanation (addendum 1, 3; FQ106). Screens A02 and A03 are brought to their renders as they arrive.
- G01 (`G01-create`, then inviting people), G02 (`G02-invitation`, plus expired, changed and full), G03 (`G03-approve`, plus waiting and declined), G05 (`G05-club-details` and its members list) and G06 (`G06-switcher`).
- `apps/web`'s invitation page, with the api lane.

`docs/plans/new-direction-r1.md` section 8 adds, for B1: A01's brand line and explanation (FQ106) and its handoff. Section 7.2: B1's handoff redraws `A01-welcome`, and `G02-invitation` only if its explanation changes. The inventory's Known differences, "The new direction, revision 1", add `G02-web`, `G02-web-dark` and `G02-web-xl`, where FQ106's default puts the brand line.

The rules B1 is held to:

- spec 03 (vocabulary, the top bar, Club information), spec 04 (club creation, the invite landing, activation), spec 07 (an invited but unaccepted person has no access), spec 29 (every screen's loading and recoverable errors); book p9 (Welcome and invitation, and Recovery), p24 (Club details), p30 (member approval), p32 (the switcher), p33 (Create a club);
- T7 (the exact roster, approved by at least two people; an invitation's token only in the link's fragment and a request body, never in a path, a query or a log), T11 (what is kept per account is purged at logout and account switch), T14 (a neutral not-found), T15 and T33 (no counts of who approved), T19 (one commit per idempotency key), T41 to T43 (copy), T45 and T46 (native first, no design of our own), T52 (logs carry no content: `APIFailure` carries nothing of the answer);
- Q05 (the unaccepted invitee and the stranger see nothing of a club's content).

## 2. What B0 left

- The sign-in (A02, A03) and the no-club root: `G06-no-club` on Home, `F01-no-club` and `M01-no-club`, with Create a club, I have an invite and Private drafts drawn and doing nothing yet (FQ85, ADR-029).
- `RootModel` (`packages/swift/TadayoCore/Sources/TadayoCore/RootModel.swift`) reads `GET /v1/clubs`: an empty list is `.noClub`, any club `.notInThisBuild` ("This version of Tadayo can't show clubs yet.", FQ90).
- `TadayoAPIClient` (`packages/swift/TadayoAPI/Sources/TadayoAPI/TadayoAPIClient.swift`) calls `getMe`, `updateMe` and `listClubs` through the generated client, with every failure an `APIFailure` (T52).
- The design system in `TadayoDesign`, the Lab, the snapshot tests and the contact sheets on `evidence`.
- `apps/web/public/.well-known/apple-app-site-association` has no app links yet (`"details": []`), and the app has no associated domain; `tools/ci/ios_release_steps.py` refuses any entitlement outside `ARCHIVED_ENTITLEMENTS` and `EXPORTED_ENTITLEMENTS`. An invitation link is `https://tadayo.app/i#<token>` (the contract's `InvitationLink` example), its token in the fragment (`InvitationToken`).

## 3. The API B1 calls

All on `dev` since the api lane's B1 PRs. Each is called through `TadayoAPIClient`, which keeps the generated client internal (`openapi-generator-config.yaml`) and exposes `TadayoCore` types.

| Call | Operation | Screen |
|---|---|---|
| `GET /v1/clubs` | `listClubs`: `clubs` (`ClubSummary`: `state` `proposed`, `active`, `paused` or `suspended`; `member_count`; `open_day`, `next_day`) and `invitations` (`MyInvitation`: `state` `waiting`, `roster_changed` or `did_not_go_ahead`) | G06, the top bar, G03-waiting, G02-changed and G03-declined |
| `POST /v1/clubs` | `createClub`: `name` and the required `timezone`, the device's zone, fixed from then on (FQ19); answers a `ClubDetail` at `roster_version` 0, people proposed next | G01-create |
| `POST /v1/clubs/{club_id}/roster` | `proposeRoster`: `expected_roster_version` and `add[]`, each a `label` (the name typed for a person) | G01-invite-name during setup, and G05's Invite someone later (FQ51) |
| `POST /v1/clubs/{club_id}/invitations` | `createInvitation`: one `candidate_id`; the link, with its token, reaches the proposer once (FQ77). Refused for a candidate who has accepted with the link | G01-invite-people (Share link, Create new link) |
| `DELETE /v1/invitations/{invitation_id}` | `revokeInvitation`: only a link not yet used to accept | G01-invite-people-revoked |
| `GET /v1/clubs/{club_id}` | `getClub` (`ClubDetail`: `roster_version`, `can_propose`, `open_revision_id`) | G05-club-details |
| `GET /v1/clubs/{club_id}/members` | `listMembers` (`Member`, in the server's `position`) | G05-members |
| `GET /v1/rosters/{revision_id}` | `getRosterRevision` (the exact roster: members and `Candidate`s, each candidate's `invitation` (`CandidateInvitation`, `CandidateLinkState`) for its proposer only; `my_decision`; never who decided) | G01-invite-people, G03-approve, G05-members-proposed |
| `POST /v1/rosters/{revision_id}/approvals`, `/declines` | `approveRoster` (VERSION_CONFLICT, ROSTER_CHANGED, CLUB_FULL besides the usual), `declineRoster` (ROSTER_CHANGED) | G03-approve |
| `POST /v1/invitations/preview` | `previewInvitation`, the token in the body: `open`, `changed`, `waiting`, `expired`, `full`, `did_not_go_ahead` or `joined`; NOT_FOUND for an unknown, revoked, replaced or used link (T14) | G02, G03-waiting, G03-declined |
| `POST /v1/invitations/accept` | `acceptInvitation`: `joined`, `waiting`, or `changed` when the account's name differs (FQ66) | G02, G03-waiting, G02-changed |
| `POST /v1/clubs/{club_id}/leave` | `leaveClub` | Not in B1: `G05-leave` is B6's (T26) |

Members' photographs (`getMemberAvatar`, from `Person.avatar_version`) come with B3, when profile photos upload; until then no account has one and every row shows the avatar's initial (handoff 1's fallback).

Every command carries an idempotency key made when the action starts and reused on every retry (T19), as `ProfileModel` already does. A failure shows the screen's own words and keeps what the person typed or chose; nothing of the server's answer reaches a log or the screen (T52).

## 4. The PRs, in order

Each is one branch from `main`, reviewed by a fresh subagent, approved by the founder in this thread. "States" are inventory names. Every state is snapshotted in light, dark and the largest text size (`CLAUDE.md`, "How you work"; the inventory's "Light, dark and large text"); a state with no render is "built from spec" and marked so in `design/reference/INVENTORY.md` until its frame arrives.

1. **`ios/b1-plan` (this branch):** this plan; design handoff 8's brief (`docs/design/handoff-8/handoff-8-brief.md`, and `.txt` to paste); the inventory's new rows for the states the brief asks for. Documents only, though the inventory's change starts `ios` (`.github/workflows/ios.yml` watches `design/reference/**`).
2. **`ios/b1-club-client`:** `TadayoCore`'s club types (`ClubSummary`, `ClubState`, `MyInvitation`, `ClubDetail`, `Member`, `RosterRevision`, `Candidate`, `CandidateInvitation`, `CandidateLinkState`, `InvitationLink`, `InvitationPreview`, `InvitationAcceptance`) and `TadayoAPIClient`'s twelve calls above, each with every documented answer mapped and an undocumented one an `APIFailure`. Tests first, on Linux (`swift test --package-path packages/swift/TadayoAPI`), with the existing `CannedTransport`: each answer the contract documents, the token only in the body and never in the path or the query (T7), a neutral NOT_FOUND kept neutral (T14), and an idempotency key reused across a retry (T19). No screen.
3. **`ios/b1-clubs-root`:** the club list replaces `.notInThisBuild`. `RootModel` keeps the selected club per account (and forgets it on Leave sign-in and account switch, as the account's other state); the selected club's header (`handoff3.selectedClubHeader`, with handoff 8's changes: two rows at every accessibility size, the selector first, and handoff 7's band behind the status bar; `handoff8.selectedClubHeader`); G06's sheet (`G06-switcher`, with Club details, Create a club and Cancel; `G06-switcher-status` and `G06-switcher-unavailable`, which the inventory lists under B2, are built here because `listClubs` already answers `proposed`, `paused` and `suspended`); `G05-club-details` (the B1 rows; Schedule, Notifications, Widget and Leave drawn and doing nothing until their stages, as FQ85 did for B0), `G05-members` and `G05-members-two-days`. Home for a club that hasn't started is `H01-awaiting-activation`, with handoff 8's frame 13 words when the creator's own decision on the current revision is pending (`getRosterRevision`'s `my_decision`): "Review the updated members", "Review and approve the updated roster before {clubName} can start." and Review members (`handoff8.pending.review`), and the ordinary waiting line otherwise; Home, Friends and Memories otherwise show their waiting and loading forms only, their content being B2's and later. States: those, and handoff 8's `G05-club-details-failed`, whose form serves every B1 screen that loads (members, a roster revision).
4. **`ios/b1-create`:** Create a club on `G06-no-club` and on the switcher sheet: `G01-create` (the name; no cover in the trial, FQ17; Continue to invitations), `G01-invite-name`, `G01-invite-people` (Share link, Share again, More's Revoke link, Create new link), `G01-invite-people-add`, `G01-invite-people-xl`, `G01-invite-people-revoked`, `G01-pending`, and handoff 8's `G01-create-failed`, `G01-invite-people-accept-again` and `G01-pending-approve`. The link is shared with the system share sheet (no contacts permission, spec 04). As FQ77's default has it, the app keeps each link it makes in its per-account store (the Keychain, purged at logout and at an account switch like T11's cache) until the link is used, revoked or expired, Share again shares that copy, and where the app no longer holds it the row offers Create new link, except for a used link, which the server won't replace: that row shows handoff 8's "This invitation link isn’t saved on this device." and "{name} can reopen the invitation already received." with no action (`handoff8.linkRetention`; handoff 8 asks to keep the link through `accepted` and `used` instead, which is FQ77's, for the founder); a cancelled share sheet never makes a second link (`createInvitation.retention`). Under the default, the used row with no action gets a state name of its own in the inventory when this PR builds it, so its snapshot isn't paired with frame 12, which draws Share again. The token is never in a log, an analytics event, a URL the app builds or a snapshot fixture (T7, T52).
5. **`ios/b1-associated-domains`, a CI-configuration PR (T58):** `com.apple.developer.associated-domains` added to `tools/ci/ios_release_steps.py`'s two entitlement sets, and nothing else but the logs. Before it, the founder is asked once: the app's associated domain is a capability of the App ID `app.tadayo`, which automatic signing turns on at Apple (`CLAUDE.md`, "Ask me first": App Store Connect settings and the bundle id).
6. **`ios/b1-invitation`:** `applinks:tadayo.app` in `apps/ios/project.yml` (the api lane adds the app's details to `apps/web/public/.well-known/apple-app-site-association`, asked under "Needs from the other lane" in `docs/PROGRESS.md`), and I have an invite (`G02-link-entry`, `G02-link-entry-signed-in`). A link opened or pasted is checked (`previewInvitation`): `G02-invitation`, `G02-expired`, `G02-changed`, `G02-full`, `G02-revoked`, and handoff 8's `G02-checking`, `G02-invitation-failed` and `G02-changed-name` (after a relaunch, when the app no longer holds the earlier name, its line is "The updated roster now shows your profile name. Review it before accepting again.", `handoff8.nameChanged.explanationAfterRelaunch`, never a name read from the link); the invitation roster lists every entry the server sends, once each, the viewer first and then the server's order, and "Proposed by {name}" shows only on the viewer's own row, from `inviter_name`, since `InvitationRosterEntry` has no proposer (other candidates' rows show the Proposed tag alone); `waiting` and `did_not_go_ahead` show `G03-waiting` and `G03-declined`, and `joined` opens the club with no line first, after "Opening {clubName}…" if it has to wait (`handoff8.joinedLink`). Accept this roster (`acceptInvitation`) ends at G03-waiting or the club, or at `G02-changed` when the name differs (FQ66). The pending invitation is kept through sign-in and nothing of the club shows before it (book p9, Recovery; `linkEntry.retention`); a signed-out link goes to sign-in first, since the app shows no club before it (`G02-web` is the signed-out page, on tadayo.app). `G03-waiting` and `G03-declined` also from `listClubs`' `invitations`.
7. **`ios/b1-approve`:** `G03-approve` (Approve Leila, Decline; never who declined, book p30), `G05-members-proposed` (Review members), Club details' Invite someone for a later addition (FQ51; handoff 5's `invitationControl`; handoff 8's `G05-club-details-active` and `G05-members-invite`), and handoff 8's `G03-approve-failed` with the approval's own outcomes (the roster changed, the club full). The approval is counted nowhere on screen (T15, T33).
8. **`ios/b1-welcome`:** `A01-welcome`, `A01-welcome-dark` and `A01-welcome-xl` from handoff 8 (the brand line, the turn-taking explanation, the labelled Example), before A02-email, which then has the system back to Welcome; a received invitation skips Welcome (book p9). Handoff 8 drew them; the app keeps 2.1's "Already here? Sign in" below the two routes, which handoff 8's frames leave out with no answer saying why (`design/reference/INVENTORY.md`, Known differences, "Handoff 8").

The web page (`G02-web` and its dark and 200% frames, redrawn by handoff 8 with the brand line) is the api lane's, in `apps/web`. This lane sends the frames there through `docs/PROGRESS.md` when handoff 8 is checked: `ios/b1-design-handoff-8` does.

**Privacy checks for each PR's review** (`docs/GITHUB.md`, step 3): before an acceptance has made a membership, the app shows the club's name, the inviter and the exact roster only, with no photographs and no counts (T7, FQ47); a token appears in no URL the app builds, no log line, no analytics event and no snapshot, and the kept links are purged at logout and account switch (T7, T11, FQ77); a NOT_FOUND reads the same for unknown, revoked, replaced and used links (T14); a decline names nobody (book p30).

**Device checks for the founder** (a TestFlight build at the end of B1, with exact steps, asked once): a link opened from Messages on the iPhone goes to the app; a link opened while signed out reaches the invitation after sign-in; the share sheet's Copy and Messages; Share again after the app was closed; VoiceOver on the invitation list and the approval.

## 5. Design handoff 8

The brief is `docs/design/handoff-8/handoff-8-brief.md`, with the text to paste in `handoff-8-brief.txt`. It asks for 15 frames and some words:

- the new direction's redraws: `A01-welcome` with its dark and largest-text frames, and `G02-web` with its dark and 200% frames, each with the brand line (FQ106);
- the failures and the wait B1's screens have no words for: creating the club, checking an opened link, accepting, approving or declining (with the approval's own outcomes), and Club details not loading, a form for every B1 screen that loads;
- the four points the ios lane kept for B1's brief when handoff 7 was written (`docs/design/handoff-7/ios-lane-needs.md`, items 27 to 30): the proposer's row for a candidate who must accept again, and how a changed name's revision reads "Proposed by"; where a later addition's link is shared once a club has started (FQ51); the first roster's waiting words when the creator must approve a revision a changed name made (FQ84), on `G01-pending` and Home's `H01-awaiting-activation`; and `G02-changed` when what changed is your own name.

Every other B1 state has a render (`design/reference/INVENTORY.md`, the B1 rows), so the screens are built from those meanwhile.

It came back at 14:30 UTC on 2026-11-20, as `Tadayo_Handoff_8_Pack.zip` in the ios thread: all 15 frames, a 16th (`G05-club-details-active`), and every answer. `ios/b1-design-handoff-8` brings it in (`design/reference/claude-design/handoff-8/`, the frames in `screens/`) and checks it: `docs/design/handoff-8/check/handoff-8-check.md`, whose section 6 lists what changes in the PRs above, all written into them.

## 6. Questions

No new FQ. Handoff 8 asks to change FQ77's default (the bullet under FQ77 in `docs/QUESTIONS.md`), which stands until the founder answers. The brief asks the design for what FQ51, FQ84 and FQ106 leave to it, and for Welcome's example under the new direction, and the lane builds on their defaults until then. FQ20's default label ("An example · before and on the day") and FQ23's (the founder's own photograph replaces the chair before Gate D) stand.

## 7. Not in B1

- `G05-leave` (B6, T26), `G05-notifications` (B8), the schedule rows and G04 (B2). The founder answered FQ125 to FQ127 in the api lane's thread at 12:06 UTC on 2026-11-20 (everyone keeps their day; nobody confirms again; a new approved member picks a free day, theirs from its next week), which changes G04-change after the api lane records the answers and makes its contract PR.
- Spikes S1, S2 and S4, once B1 and B2 are on `dev` (ADR-024; `docs/MILESTONES.md`).
