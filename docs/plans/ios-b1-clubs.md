# Stage B1, clubs: the ios lane's plan

Branch `ios/b1-plan`, from `main` at `d5e2ec9`. Written on 20 November 2026, after the api lane's B1 PRs (#73 create, #76 propose, #77 accept, #78 leave) and B2's first PRs were on `main` and `dev`.

## 1. What is asked

`docs/MILESTONES.md`, B1, the ios lane:
- Screen A01 (`A01-welcome`, with the labelled example, FQ23), with the brand line and the new explanation (addendum 1, 3; FQ106). Screens A02 and A03 are brought to their renders as they arrive.
- G01 (`G01-create`, then inviting people), G02 (`G02-invitation`, plus expired, changed and full), G03 (`G03-approve`, plus waiting and declined), G05 (`G05-club-details` and its members list) and G06 (`G06-switcher`).
- `apps/web`'s invitation page, with the api lane.

`docs/plans/new-direction-r1.md` section 8 adds, for B1: A01's brand line and explanation (FQ106) and its handoff. Section 7.2: B1's handoff redraws `A01-welcome`, and `G02-invitation` only if its explanation changes. The inventory's Known differences, "The new direction, revision 1", add `G02-web`, `G02-web-dark` and `G02-web-xl`, where FQ106's default puts the brand line.

The rules B1 is held to:
- spec 03 (vocabulary, the top bar, Club information), spec 04 (club creation, the invite landing, activation), spec 07 (an invited but unaccepted person has no access), book p9 (Welcome and invitation, and Recovery), p30 (member approval), p32 (the switcher);
- T6 and T7 (the exact roster, approved by at least two people; an invitation's token never in a path, a query or a log), T14 (a neutral not-found), T15 and T33 (no counts of who approved), T19 (one commit per idempotency key), T41 to T43 (copy), T45 and T46 (native first, no design of our own), T52 (a failure carries nothing of the answer);
- Q05 (the unaccepted invitee and the stranger see nothing of a club's content).

## 2. What B0 left

- The sign-in (A02, A03) and the no-club root: `G06-no-club` on Home, `F01-no-club` and `M01-no-club`, with Create a club, I have an invite and Private drafts drawn and doing nothing yet (FQ85, ADR-029).
- `RootModel` (`packages/swift/TadayoCore/Sources/TadayoCore/RootModel.swift`) reads `GET /v1/clubs`: an empty list is `.noClub`, any club `.notInThisBuild` ("This version of Tadayo can't show clubs yet.", FQ89).
- `TadayoAPIClient` (`packages/swift/TadayoAPI/Sources/TadayoAPI/TadayoAPIClient.swift`) calls `getMe`, `updateMe` and `listClubs` through the generated client, with every failure an `APIFailure` (T52).
- The design system in `TadayoDesign`, the Lab, the snapshot tests and the contact sheets on `evidence`.
- `apps/web/.well-known/apple-app-site-association` has no app links yet (`"details": []`), and the app has no associated domain. An invitation link is `https://tadayo.app/i#<token>` (the contract's `InvitationLink` example), its token in the fragment (`InvitationToken`).

## 3. The API B1 calls

All on `dev` since the api lane's B1 PRs. Each is called through `TadayoAPIClient`, which keeps the generated client internal (`openapi-generator-config.yaml`) and exposes `TadayoCore` types.

| Call | Operation | Screen |
|---|---|---|
| `GET /v1/clubs` | `listClubs`: `clubs` (`ClubSummary`: `state` proposed, active, paused or suspended; `member_count`; `open_day`, `next_day`) and `invitations` (`MyInvitation`: waiting, roster changed, didn't go ahead) | G06, the top bar, G03-waiting and G03-declined |
| `POST /v1/clubs` | `createClub` (a name; the creator's first revision) | G01-create |
| `GET /v1/clubs/{club_id}` | `getClub` (`ClubDetail`: `roster_version`, `can_propose`, `open_revision_id`) | G05-club-details |
| `GET /v1/clubs/{club_id}/members` | `listMembers` (`Member`, in the server's `position`) | G05-members |
| `POST /v1/clubs/{club_id}/invitations` | `createInvitation` (a name; the token reaches the proposer once, in the link) | G01-invite-name, G01-invite-people |
| `DELETE /v1/invitations/{invitation_id}` | `revokeInvitation` | G01-invite-people-revoked |
| `POST /v1/clubs/{club_id}/roster` | `proposeRoster` (`expected_roster_version`) | G05's Invite someone (FQ51) |
| `GET /v1/rosters/{revision_id}` | `getRosterRevision` (the exact roster; `my_decision`; never who decided) | G03-approve, G05-members-proposed, G01-invite-people |
| `POST /v1/rosters/{revision_id}/approvals`, `/declines` | `approveRoster`, `declineRoster` | G03-approve |
| `POST /v1/invitations/preview` | `previewInvitation` (the token in the body; open, expired, changed, full, joined; NOT_FOUND for unknown, revoked, replaced or used, T14) | G02 |
| `POST /v1/invitations/accept` | `acceptInvitation` (joined, waiting, or changed when the account's name differs, FQ66) | G02, G03-waiting, G02-changed |
| `POST /v1/clubs/{club_id}/leave` | `leaveClub` | Not in B1: `G05-leave` is B6's (T26) |

Every command carries an idempotency key made when the action starts and reused on every retry (T19), as `ProfileModel` already does. A failure shows the screen's own words and keeps what the person typed or chose; nothing of the server's answer reaches a log or the screen (T52).

## 4. The PRs, in order

Each is one branch from `main`, reviewed by a fresh subagent, approved by the founder in this thread. "States" are inventory names; each is snapshotted light, and dark and at the largest text where the inventory marks it or the screen has rows that can wrap. A state with no render is "built from spec" and marked so in `design/reference/INVENTORY.md` until its frame arrives.

1. **`ios/b1-plan` (this branch):** this plan; design handoff 8's brief (`docs/design/handoff-8/handoff-8-brief.md`, and `.txt` to paste); the inventory's new rows for the states the brief asks for. Documents only.
2. **`ios/b1-club-client`:** `TadayoCore`'s club types (`ClubSummary`, `ClubState`, `MyInvitation`, `ClubDetail`, `Member`, `RosterRevision`, `Candidate`, `InvitationPreview`, `InvitationAcceptance`) and `TadayoAPIClient`'s twelve calls above, each with every documented answer mapped and an undocumented one an `APIFailure`. Tests first, on Linux (`swift test --package-path packages/swift/TadayoAPI`), with a fake transport: each answer the contract documents, the token only in the body and never in the path or the query (T7), a neutral NOT_FOUND kept neutral (T14), and an idempotency key reused across a retry (T19). No screen.
3. **`ios/b1-clubs-root`:** the club list replaces `.notInThisBuild`. `RootModel` keeps the selected club per account (and forgets it on Leave sign-in and account switch, as the account's other state); the selected club's header (`handoff3.selectedClubHeader`); G06's sheet (`G06-switcher`, `G06-switcher-status`, `G06-switcher-unavailable`, with "Not started", "Paused" and "Unavailable"); `G05-club-details` (the B1 rows; Schedule, Notifications, Widget and Leave drawn and doing nothing until their stages, as FQ85 did for B0) and `G05-members`, `G05-members-two-days`. Home, Friends and Memories for a selected club show their waiting and loading forms only: their content is B2's and later. States: those, `G05-club-details-failed` (handoff 8), and the switcher at the largest text.
4. **`ios/b1-create`:** Create a club on `G06-no-club` and + Add's "Create a club": `G01-create` (the name; no cover in the trial, FQ17), `G01-invite-name`, `G01-invite-people` (Share link, Share again, More's Revoke link, Create new link), `G01-invite-people-add`, `G01-invite-people-xl`, `G01-invite-people-revoked`, `G01-pending`, and handoff 8's `G01-create-failed`, `G01-invite-people-accept-again` and `G01-pending-approve`. The link is shared with the system share sheet (no contacts permission, spec 04); a link already made is kept for that person while the screen lives and never made twice for a cancelled share (`createInvitation.retention`); a token is never written to disk, a log or the snapshot fixtures (T7).
5. **`ios/b1-invitation`:** the app's associated domain (`applinks:tadayo.app` in `apps/ios/project.yml`; the api lane adds the app's details to `apps/web`'s `apple-app-site-association`, asked under "Needs from the other lane" in `docs/PROGRESS.md`), and I have an invite (`G02-link-entry`, `G02-link-entry-signed-in`). A link opened or pasted is checked (`previewInvitation`): `G02-invitation`, `G02-expired`, `G02-changed`, `G02-full`, `G02-revoked`, and handoff 8's `G02-checking`, `G02-invitation-failed` and `G02-changed-name`. Accept this roster (`acceptInvitation`) ends at G03-waiting or the club, or at `G02-changed` when the name differs (FQ66). The pending invitation is kept through sign-in and nothing of the club shows before it (book p9, Recovery; `linkEntry.retention`); a signed-out link goes to sign-in first, since the app shows no club before it (`G02-web` is the signed-out page, on tadayo.app). `G03-waiting` and `G03-declined` from `listClubs`' `invitations`.
6. **`ios/b1-approve`:** `G03-approve` (Approve Leila, Decline; never who declined, book p30), `G05-members-proposed` (Review members), G05's Invite someone for a later addition (FQ51; handoff 8's `G05-members-invite`), and handoff 8's `G03-approve-failed`. The approval is counted nowhere on screen (T15, T33).
7. **`ios/b1-welcome`:** `A01-welcome`, `A01-welcome-dark` and `A01-welcome-xl` from handoff 8 (the brand line, the turn-taking explanation, the labelled Example), before A02-email, which then has the system back to Welcome; a received invitation skips Welcome (book p9). If handoff 8 hasn't come back, Welcome is built from the addendum's words and marked "built from spec".

The web page (`G02-web` and its dark and 200% frames, redrawn by handoff 8 with the brand line) is the api lane's, in `apps/web`. This lane sends the frames there through `docs/PROGRESS.md` when handoff 8 is checked.

**Privacy checks for each PR's review** (`docs/GITHUB.md`, step 3): before an acceptance has made a membership, the app shows the club's name, the inviter and the exact roster only, with no photographs and no counts (T7, FQ47); a token appears in no URL the app builds, no log line, no analytics event and no snapshot; a NOT_FOUND reads the same for unknown, revoked, replaced and used links (T14); a decline names nobody (book p30).

**Device checks for the founder** (a TestFlight build at the end of B1, with exact steps, asked once): a link opened from Messages on the iPhone goes to the app; a link opened while signed out reaches the invitation after sign-in; the share sheet's Copy and Messages; VoiceOver on the invitation list and the approval.

## 5. Design handoff 8

The brief is `docs/design/handoff-8/handoff-8-brief.md`, with the text to paste in `handoff-8-brief.txt`. It asks for 15 frames and some words:
- the new direction's redraws: `A01-welcome` with its dark and largest-text frames, and `G02-web` with its dark and 200% frames, each with the brand line (FQ106);
- the failures and the wait B1's screens have no words for: creating the club, checking an opened link, accepting, approving or declining, and Club details not loading;
- the four points the ios lane kept for B1's brief when handoff 7 was written (`docs/design/handoff-7/ios-lane-needs.md`, items 27 to 30): the proposer's row for a candidate who must accept again, where a later addition's link is shared once a club has started (FQ51), the first roster's waiting words when the creator must approve a revision a changed name made (FQ84), and `G02-changed` when what changed is your own name.

Every other B1 state has a render (`design/reference/INVENTORY.md`, the B1 rows), so the screens are built from those meanwhile.

## 6. Questions

No new FQ. The brief asks the design for the answers FQ20 (the Welcome label's "her day"), FQ23 (the example photograph stays the founder's own, before Gate D), FQ51, FQ84 and FQ106 leave to it, and builds on their defaults until then.

## 7. Not in B1

- `G05-leave` (B6, T26), `G05-notifications` (B8), the schedule rows and G04 (B2: and the founder's answers to FQ125 to FQ127 of 20 November 2026 change G04-change, after the api lane's contract PR).
- Spikes S1, S2 and S4, once B1 and B2 are on `dev` (ADR-024; `docs/MILESTONES.md`).
