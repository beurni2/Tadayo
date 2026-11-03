# Design inventory

Every screen and state Tadayo needs, the brand assets, and where each render comes from (`docs/DESIGN-HANDOFF.md`). The spec's screen ids (spec 29) start each state's name. Statuses: `missing`, `requested <n>`, `received`, `built from spec`, `built`, `approved` (the founder passed it at a gate).

Keep this current in the same commit as the change. Add rows for states you discover; never delete a row. The journal's state section quotes the counts.

Paths are relative to `design/reference/`:
- `2.1/`: the 53 renders from design revision 2.1, unchanged.
- `claude-design/`: Claude Design's deliveries as they arrived, one folder per handoff (`handoff-<n>/`). An export the founder uploads into `claude-design/` itself is moved into its folder in Claude Code's unpack commit.
- `screens/`: the PNGs Claude Code renders from those deliveries, for new states and for any state the founder has redrawn. When a state has a render in both `screens/` and `2.1/`, `screens/` wins.
- `brand/`: the brand assets, from the brand revision the founder adopted last: revision 1.1 since 3 November 2026 (FQ45, ADR-027), remade under the same names from handoffs 1 to 4; handoff 0's earlier files stay in `claude-design/handoff-0/`.

**Light, dark and large text.** Every state gets snapshots in light, dark and the largest accessibility text size. Renders exist in light for every state, plus dark and large-text renders for the representative set marked `-dark` and `-xl` below. The other dark and large-text snapshots are judged against book p26's rules: dark tokens, rows grow, the highlight rail becomes a list, the memory grid becomes one column.

## Brand (revision 1.1: handoffs 0, 1 and 4; ADR-027)

| Asset | File in `brand/` | Status | Handoff |
|---|---|---|---|
| Wordmark, light and dark | `brand-wordmark.pdf`, `brand-wordmark-dark.pdf` | received | 0 (revision 1.1 keeps it byte-identical) |
| App icon, light, dark and tinted | `brand-icon-1024.png`, `brand-icon-dark-1024.png`, `brand-icon-tinted-1024.png` | received | 0 for light and tinted; 1 for dark (revision 1.1's transparent master) |
| Tokens: colours light and dark with the six covers, type roles, geometry (revision 1.1) | `brand-tokens.md` | received | 1 (byte-identical in 1 to 4; 0 before) |
| Component sheet: plaque, folded card, highlight cover, avatar fallback, button, allowance line, and the contracts handoffs 2 to 4 added | `brand-components.png` | received | 4 (holds every earlier sheet; 0 before) |
| The Welcome example photograph | One of the founder's own photographs, before Gate D (FQ23); builds that point at `dev` show the book's chair fixture until then | waiting for the founder | |

## Screens and states for the trial

| Screen | State | Shows | Render | Source | Status | Stage | Notes |
|---|---|---|---|---|---|---|---|
| A01 Welcome | `A01-welcome` | Welcome with the labelled example | `2.1/A01-welcome.png` | 2.1 #01 | received | B1 | FQ20: "before and on the day"; FQ23: example photograph |
| A02 Authentication | `A02-email` | Email entry | `screens/A02-email.png` | Handoff 1 | received | B0 |  |
| A02 Authentication | `A02-code` | Six-digit code | `screens/A02-code.png` | Handoff 1 | received | B0 | ADR-011 |
| A02 Authentication | `A02-code-error` | Wrong or expired code, resend | `screens/A02-code-error.png` | Handoff 2 (1 before) | received | B0 |  |
| A02 Authentication | `A02-age` | 18 or older confirmation | `screens/A02-age.png` | Handoff 1 | received | B0 | FQ13 |
| A03 Profile | `A03-profile` | Name and optional photo | `screens/A03-profile.png` | Handoff 1 | received | B0 |  |
| G01 Club creation | `G01-create` | Name the club | `2.1/G01-create.png` | 2.1 #47 | received | B1 | No cover in the trial (FQ17) |
| G01 Club creation | `G01-invite-people` | Make and share a link per person | `screens/G01-invite-people.png` | Handoff 1 | received | B1 |  |
| G01 Club creation | `G01-invite-name` | The name step: who an invitation is for | `screens/G01-invite-name.png` | Handoff 2 | received | B1 |  |
| G01 Club creation | `G01-invite-people-add` | The list with fewer people, Create an invitation, and the More menu's Revoke link | `screens/G01-invite-people-add.png` | Handoff 2 | received | B1 | The More menu is the system's own (T45) |
| G01 Club creation | `G01-invite-people-xl` | The invitation list at the largest text | `screens/G01-invite-people-xl.png` | Handoff 2 | received | B1 |  |
| G01 Club creation | `G01-invite-people-revoked` | A revoked link's row, Create new link; "Only you can see this list." | `screens/G01-invite-people-revoked.png` | Handoff 4 | received | B1 | FQ51 |
| G01 Club creation | `G01-pending` | Before activation; prepared work stays in Drafts | `screens/G01-pending.png` | Handoff 4 (1 before) | received | B1 |  |
| G02 Invite landing | `G02-invitation` | Inviter, club and exact roster | `2.1/G02-invitation.png` | 2.1 #02 | received | B1 |  |
| G02 Invite landing | `G02-expired` | Expired invitation | `screens/G02-expired.png` | Handoff 1 | received | B1 |  |
| G02 Invite landing | `G02-changed` | The roster changed; review again | `screens/G02-changed.png` | Handoff 2 (1 before) | received | B1 |  |
| G02 Invite landing | `G02-full` | The club already has six | `screens/G02-full.png` | Handoff 1 | received | B1 |  |
| G02 Invite landing | `G02-web` | Signed-out web page (apps/web) | `screens/G02-web.png` | Handoff 1 | received | B1 | Shows the inviter's name only (T7) |
| G02 Invite landing | `G02-web-dark` | The signed-out web page, dark | `screens/G02-web-dark.png` | Handoff 2 | received | B1 | T7 |
| G02 Invite landing | `G02-web-xl` | The signed-out web page at 200% text zoom | `screens/G02-web-xl.png` | Handoff 2 | received | B1 | T7 |
| G02 Invite landing | `G02-web-revoked` | The web page for a revoked, unknown or used link: no name, no club | `screens/G02-web-revoked.png` | Handoff 4 | received | B1 | FQ59, T7 |
| G02 Invite landing | `G02-link-entry` | I have an invite: paste a link, signed out | `screens/G02-link-entry.png` | Handoff 2 | received | B1 | The clipboard is read only on Paste; the system's paste control (T45) |
| G02 Invite landing | `G02-link-entry-signed-in` | I have an invite, signed in | `screens/G02-link-entry-signed-in.png` | Handoff 4 | received | B1 |  |
| G02 Invite landing | `G02-revoked` | A revoked, unknown or used link, in the app | `screens/G02-revoked.png` | Handoff 4 | received | B1 | FQ59: never "expired", no name |
| G03 Roster approval | `G03-approve` | Existing member approves a proposed member | `screens/G03-approve.png` | Handoff 4 (2, and 2.1 #30, before) | received | B1 | FQ20: "Leila will see only drops shared after joining". Maya is the viewer (FQ54, FQ60) |
| G03 Roster approval | `G03-waiting` | Candidate waiting for the members | `screens/G03-waiting.png` | Handoff 2 (1 before) | received | B1 |  |
| G03 Roster approval | `G03-declined` | Neutral: the invitation didn't go ahead | `screens/G03-declined.png` | Handoff 1 | received | B1 | Never says who declined |
| G04 Schedule proposal | `G04-one-day` | Confirm one day (four to six members) | `2.1/G04-one-day.png` | 2.1 #03 | received | B2 |  |
| G04 Schedule proposal | `G04-two-days` | Choose two days (two or three members) | `2.1/G04-two-days.png` | 2.1 #32 | received | B2 |  |
| G04 Schedule proposal | `G04-conflict` | Two members want the same day | `screens/G04-conflict.png` | Handoff 3 | received | B2 | Shown, never swapped (T6). Names only to the two members involved (FQ46): see Known differences |
| G04 Schedule proposal | `G04-change` | Membership changed: confirm days from a future date | `screens/G04-change.png` | Handoff 3 | received | B2 |  |
| G04 Schedule proposal | `G04-confirmed` | After you confirm your days | `screens/G04-confirmed.png` |  | missing | B2 | Words only (handoff 3) |
| G04 Schedule proposal | `G04-change-member` | Maya's view of a membership change | `screens/G04-change-member.png` |  | missing | B2 | Words only (handoff 3) |
| G04 Schedule proposal | `G04-day-taken` | This day was just taken | `screens/G04-day-taken.png` |  | missing | B2 | Words only (handoff 3) |
| G04 Schedule proposal | `G04-conflict-others` | The other members' view of a clash: no names | `screens/G04-conflict-others.png` |  | missing | B2 | FQ46. Words only (handoff 3) |
| G04 Schedule proposal | `G04-transition-week` | The week a club goes from three members to four | `screens/G04-transition-week.png` |  | missing | B2 | Words only (handoff 3) |
| G05 Club information | `G05-club-details` | Members, schedule, notifications, widget, drafts, leave | `2.1/G05-club-details.png` | 2.1 #20 | received | B1 | The Widget row waits for M1 (FQ9) |
| G05 Club information | `G05-members` | Roster with proposals | `screens/G05-members.png` | Handoff 1 | received | B1 |  |
| G05 Club information | `G05-members-two-days` | A two-person club's roster, two days each | `screens/G05-members-two-days.png` | Handoff 2 | received | B1 | The club's own name as the title (handoff 4) |
| G05 Club information | `G05-proposed-roster` | The proposed roster Review members opens | `screens/G05-proposed-roster.png` |  | missing | B1 | Words only, handoff 3 and 4's copy (`claude-design/handoff-4/copy-contracts.json`) |
| G05 Club information | `G05-review-days` | The "Review the club's days" row | `screens/G05-review-days.png` |  | missing | B2 | Words only (handoff 3) |
| G05 Club information | `G05-local-times` | The local-times sheet for a member who is travelling | `screens/G05-local-times.png` |  | missing | B2 | Words only (handoff 3) |
| G05 Club information | `G05-schedule` | The club's week | `screens/G05-schedule.png` | Handoff 3 | received | B2 |  |
| G05 Club information | `G05-notifications` | Notifications for this club | `screens/G05-notifications.png` |  | missing | B8 |  |
| G05 Club information | `G05-leave` | Leave: keep or withdraw my contributions | `screens/G05-leave.png` |  | missing | B6 | T26 |
| G06 Club switcher | `G06-switcher` | Your clubs | `2.1/G06-switcher.png` | 2.1 #45 | received | B1 | FQ20: shows "Her pick" behind the sheet |
| G06 Club switcher | `G06-no-club` | Signed in with no club: create or join | `screens/G06-no-club.png` | Handoff 4 (1 before) | received | B0 |  |
| G06 Club switcher | `G06-labels` | The club list's "Not started" and "Paused" labels | `screens/G06-labels.png` |  | missing | B2 | Words only (handoff 3) |
| H01 Home | `H01-first-drop` | After joining: something for Debby | `2.1/H01-first-drop.png` | 2.1 #04 | received | B4 | FQ20: "reminded you of Debby" |
| H01 Home | `H01-open` | Debby's day, the feed directly | `screens/H01-open.png` | Handoff 0 (2.1 #05 before) | received | B5 | FQ20, FQ26: handoff 0's render follows both. Layout: `2.1/H01-open.png` where no rule decides (FQ40). Its differences are under "Known differences" |
| H01 Home | `H01-open-dark` | Debby's day, dark | `screens/H01-open-dark.png` | Handoff 0 (2.1 #23 before) | received | B5 | FQ20: handoff 0's render follows it. Layout: `2.1/H01-open-dark.png` where no rule decides (FQ40). As `H01-open` |
| H01 Home | `H01-open-xl` | Debby's day at the largest text: the rail as a list | `screens/H01-open-xl.png` |  | missing | B5 |  |
| H01 Home | `H01-waiting` | Up next with countdown | `2.1/H01-waiting.png` | 2.1 #06 | received | B2 |  |
| H01 Home | `H01-quiet` | Open day with nothing added | `2.1/H01-quiet.png` | 2.1 #21 | received | B5 |  |
| H01 Home | `H01-after-close` | After 1 AM: next person; the day is in Memories | `2.1/H01-after-close.png` | 2.1 #27 | received | B2 | FQ20: "Revisit Debby's Friday" |
| H01 Home | `H01-sunday` | Sunday: next Monday and this week | `2.1/H01-sunday.png` | 2.1 #28 | received | B2 |  |
| H01 Home | `H01-your-day` | The viewer is the star | `2.1/H01-your-day.png` | 2.1 #29 | received | B5 |  |
| H01 Home | `H01-awaiting-activation` | Waiting for club confirmation | `screens/H01-awaiting-activation.png` | Handoff 3 | received | B2 |  |
| H01 Home | `H01-paused` | Club paused (fewer than two members) | `screens/H01-paused.png` | Handoff 3 | received | B2 | FQ16's pause only, where Memories stays readable; a suspended club is `H01-suspended` (spec 22, T9) |
| H01 Home | `H01-suspended` | Club unavailable (a moderation suspension): nothing readable | `screens/H01-suspended.png` |  | missing | B6 | Spec 22, T9. Words only (handoff 3) |
| H01 Home | `H01-day-suspended` | A single suspended day | `screens/H01-day-suspended.png` |  | missing | B6 | Spec 22. In neither handoff 3 nor 4 |
| H01 Home | `H01-lost-access` | Access to the club revoked | `screens/H01-lost-access.png` |  | missing | B2 | Spec 29. Words only (handoff 3) |
| H01 Home | `H01-days-unconfirmed` | The club has started; its days aren't all confirmed | `screens/H01-days-unconfirmed.png` |  | missing | B2 | Spec 04. In neither handoff 3 nor 4 |
| H01 Home | `H01-offline` | Cached state with its date | `screens/H01-offline.png` |  | missing | B5 | T49 |
| H01 Home | `H01-loading` | Loading shell | `screens/H01-loading.png` | Handoff 3 | received | B2 |  |
| H01 Home | `H01-error` | Home failed to load | `screens/H01-error.png` |  | missing | B2 | Words only (handoff 3); offline is `H01-offline` |
| F01 Friends | `F01-friends` | Roster with next dates | `screens/F01-friends.png` | Handoff 3 (2.1 #07 before) | received | B2 |  |
| F01 Friends | `F01-friends-dark` | Roster, dark | `screens/F01-friends-dark.png` | Handoff 3 | received | B2 |  |
| F01 Friends | `F01-friends-xl` | Roster at a large text size | `2.1/F01-friends-xl.png` | 2.1 #24 | received | B2 |  |
| F01 Friends | `F01-long-names` | Long names wrap | `2.1/F01-long-names.png` | 2.1 #41 | received | B2 |  |
| F01 Friends | `F01-no-club` | The Friends tab with no club yet: no example roster | `screens/F01-no-club.png` | Handoff 2 (1 before) | received | B0 |  |
| F01 Friends | `F01-not-started` | Friends before the club starts | `screens/F01-not-started.png` |  | missing | B2 | Words only (handoff 3) |
| F01 Friends | `F01-paused` | Friends while the club is paused | `screens/F01-paused.png` |  | missing | B2 | Words only (handoff 3) |
| F02 Upcoming day | `F02-upcoming` | Captions now, photos on Friday | `screens/F02-upcoming.png` | Handoff 0 (2.1 #08 before) | received | B4 | FQ21: handoff 0's render shows the Highlight label only on Ben's own card. Layout: `2.1/F02-upcoming.png` where no rule decides (FQ40), and for the blank-caption card. Its differences are under "Known differences" |
| F02 Upcoming day | `F02-upcoming-dark` | Upcoming day, dark | `screens/F02-upcoming-dark.png` | Handoff 0 | received | B4 | As `F02-upcoming` |
| F02 Upcoming day | `F02-upcoming-xl` | Upcoming day at the largest text | `screens/F02-upcoming-xl.png` |  | missing | B4 |  |
| F02 Upcoming day | `F02-added` | Compact receipt after a repeat contribution | `2.1/F02-added.png` | 2.1 #10 | received | B4 | FQ21: Highlight label |
| F02 Upcoming day | `F02-first-receipt` | First contribution: receipt and the notification offer | `screens/F02-first-receipt.png` |  | missing | B8 | T50 |
| F02 Upcoming day | `F02-your-drops` | The author's own drops | `2.1/F02-your-drops.png` | 2.1 #12 | received | B4 |  |
| F02 Upcoming day | `F02-empty` | No captions yet | `screens/F02-empty.png` |  | missing | B4 |  |
| F02 Upcoming day | `F02-star` | The star's own upcoming day | `screens/F02-star.png` |  | missing | B4 |  |
| F02 Upcoming day | `F02-author-preview` | Only you can preview this before Friday | `screens/F02-author-preview.png` |  | missing | B4 | T11 |
| F02 Upcoming day | `F02-edit` | Edit a caption, replace a photo | `screens/F02-edit.png` |  | missing | B4 |  |
| F02 Upcoming day | `F02-withdraw` | Withdraw before the reveal | `screens/F02-withdraw.png` |  | missing | B4 |  |
| F02 Upcoming day | `F02-joined-later` | A member who joined later: some drops aren't shown, no numbers | `screens/F02-joined-later.png` |  | missing | B4 | T15 |
| C01 Recipient picker | `C01-picker` | Private draft, then the club's members with dates | `2.1/C01-picker.png` | 2.1 #31 | received | B2 |  |
| C01 Recipient picker | `C01-drafts-only` | The Add menu with only Private draft and Open my drafts | `screens/C01-drafts-only.png` |  | missing | B2 | Words only (handoff 3) |
| C02 Composer | `C02-photo` | Photo, caption, audience line | `2.1/C02-photo.png` | 2.1 #09 | received | B4 |  |
| C02 Composer | `C02-photo-dark` | Composer, dark | `screens/C02-photo-dark.png` |  | missing | B4 |  |
| C02 Composer | `C02-photo-xl` | Composer at the largest text | `screens/C02-photo-xl.png` |  | missing | B4 |  |
| C02 Composer | `C02-keyboard` | Keyboard open, target still visible | `2.1/C02-keyboard.png` | 2.1 #33 | received | B4 |  |
| C02 Composer | `C02-link` | Video link: the author sees the provider | `screens/C02-link.png` |  | missing | B4 | T40 |
| C02 Composer | `C02-several` | Several photos, a caption each | `screens/C02-several.png` |  | missing | B4 | D05 |
| C02 Composer | `C02-star` | "What would you like your friends to see" | `screens/C02-star.png` |  | missing | B4 |  |
| C02 Composer | `C02-live-photo` | A Live Photo is added as a still | `screens/C02-live-photo.png` |  | missing | B4 | FQ10 |
| C02 Composer | `C02-unsupported` | Unsupported link or file, kept as a draft | `screens/C02-unsupported.png` |  | missing | B4 |  |
| C02 Composer | `C02-duplicate` | Already added: View existing | `screens/C02-duplicate.png` |  | missing | B4 | T21 |
| C02 Composer | `C02-external-limit` | Two video links already | `screens/C02-external-limit.png` |  | missing | B4 |  |
| C03 Source chooser | `C03-sources` | Choose a photo, take a photo, paste a link | `2.1/C03-sources.png` | 2.1 #37 | received | B4 |  |
| C03 Source chooser | `C03-system-picker` | The book's stand-in for the system picker | `2.1/C03-system-picker.png` | 2.1 #38 | received (reference only) | B4 | Not built: the system picker is used (T45) |
| C03 Source chooser | `C03-paste-link` | Paste a video link | `screens/C03-paste-link.png` |  | missing | B4 |  |
| C03 Source chooser | `C03-camera-denied` | Camera permission denied | `screens/C03-camera-denied.png` |  | missing | B4 |  |
| C04 Share extension | `C04-link` | TikTok link, choose who it's for | `2.1/C04-link.png` | 2.1 #11 | received | B4 |  |
| C04 Share extension | `C04-photos` | From Photos: one or several | `screens/C04-photos.png` |  | missing | B4 |  |
| C04 Share extension | `C04-signed-out` | Signed out | `screens/C04-signed-out.png` |  | missing | B4 |  |
| C04 Share extension | `C04-added` | Added for Debby's Friday, then back to the source | `screens/C04-added.png` |  | missing | B4 | T20 |
| C04 Share extension | `C04-pending` | No connection: kept, not added | `screens/C04-pending.png` |  | missing | B4 | T20 |
| C04 Share extension | `C04-failed` | The add failed: kept for retry, not added | `screens/C04-failed.png` |  | missing | B4 | T20 |
| C05 Private drafts | `C05-drafts` | Private drafts | `2.1/C05-drafts.png` | 2.1 #39 | received | B4 |  |
| C05 Private drafts | `C05-private-draft` | Private draft composer | `2.1/C05-private-draft.png` | 2.1 #51 | received | B4 |  |
| C05 Private drafts | `C05-empty` | No drafts | `screens/C05-empty.png` |  | missing | B4 |  |
| C05 Private drafts | `C05-retarget` | The intended date passed: choose the next | `screens/C05-retarget.png` |  | missing | B4 | T4 |
| C05 Private drafts | `C05-discard` | Discard a draft | `screens/C05-discard.png` |  | missing | B4 |  |
| C06 Idea helper | `C06-ideas` | The first three ideas | `2.1/C06-ideas.png` | 2.1 #19 | received | B4 |  |
| C06 Idea helper | `C06-more` | A later batch, with Back | `screens/C06-more.png` |  | missing | B4 |  |
| C06 Idea helper | `C06-end` | Back to first ideas | `screens/C06-end.png` |  | missing | B4 |  |
| C06 Idea helper | `C06-star` | Ideas for your own day | `screens/C06-star.png` |  | missing | B4 |  |
| C07 Upload status | `C07-uploading` | Uploading, not added yet | `2.1/C07-uploading.png` | 2.1 #34 | received | B4 | Check "Keep Tadayo open" against the background session (S1) |
| C07 Upload status | `C07-failed` | Your photo is safe | `2.1/C07-failed.png` | 2.1 #35 | received | B4 |  |
| C07 Upload status | `C07-missed-cutoff` | Kept in Drafts, review the next Friday | `2.1/C07-missed-cutoff.png` | 2.1 #22 | received | B4 | T4 |
| C07 Upload status | `C07-limit` | Six drops added | `2.1/C07-limit.png` | 2.1 #44 | received | B4 |  |
| C07 Upload status | `C07-processing` | Processing after upload | `screens/C07-processing.png` |  | missing | B4 |  |
| C07 Upload status | `C07-pending` | Pending with no connection | `screens/C07-pending.png` |  | missing | B4 |  |
| C07 Upload status | `C07-partial` | Batch partly added, each item named | `screens/C07-partial.png` |  | missing | B4 | Q11 |
| C07 Upload status | `C07-held` | Not added: back in Drafts after a hold | `screens/C07-held.png` |  | missing | B4 | T29; neutral copy |
| C08 Highlight selection | `C08-choose` | Make or replace my highlight | `screens/C08-choose.png` |  | missing | B4 |  |
| R01 Revealed day | `R01-blank-caption` | A drop with no caption | `2.1/R01-blank-caption.png` | 2.1 #43 | received | B5 | FQ20 |
| R01 Revealed day | `R01-past-day` | A past day from Memories | `2.1/R01-past-day.png` | 2.1 #49 | received | B5 | FQ20 |
| R01 Revealed day | `R01-end` | That's Debby's Friday. | `screens/R01-end.png` |  | missing | B5 | T35 |
| R01 Revealed day | `R01-removed` | Neutral placeholder for a removed drop | `screens/R01-removed.png` |  | missing | B5 |  |
| R01 Revealed day | `R01-video-card` | A revealed video drop in the feed | `screens/R01-video-card.png` |  | missing | B5 |  |
| R01 Revealed day | `R01-joined-later` | Partly visible day, no numbers | `screens/R01-joined-later.png` |  | missing | B5 | T15 |
| R01 Revealed day | `R01-reactions` | Reaction palette and summary | `screens/R01-reactions.png` |  | missing | B6 | FQ22 |
| R02 Photo viewer | `R02-photo` | Full frame, React, Comment, Save | `2.1/R02-photo.png` | 2.1 #14 | received | B5 | Share icon not in the trial (FQ14) |
| R02 Photo viewer | `R02-screenshot` | A text screenshot, full frame | `2.1/R02-screenshot.png` | 2.1 #42 | received | B5 |  |
| R02 Photo viewer | `R02-own` | The author's own drop: no React | `screens/R02-own.png` |  | missing | B5 |  |
| R02 Photo viewer | `R02-removed` | Removed while open | `screens/R02-removed.png` |  | missing | B5 |  |
| R03 Highlight opening | `R03-opening` | The fold, mid-animation | `2.1/R03-opening.png` | 2.1 #13 | received | B5 | T48 |
| R04 Comments | `R04-comments` | Comments sheet | `2.1/R04-comments.png` | 2.1 #15 | received | B6 |  |
| R04 Comments | `R04-empty` | No comments yet | `screens/R04-empty.png` |  | missing | B6 |  |
| R04 Comments | `R04-edit` | Edit or delete my comment, Edited label | `screens/R04-edit.png` |  | missing | B6 |  |
| R04 Comments | `R04-reply` | Replying to a comment | `screens/R04-reply.png` |  | missing | B6 |  |
| R04 Comments | `R04-menu` | Report a comment, mute the thread | `screens/R04-menu.png` |  | missing | B6 |  |
| E01 External viewer | `E01-entry` | Video entry: tap to load | `2.1/E01-entry.png` | 2.1 #36 | received | B7 |  |
| E01 External viewer | `E01-unavailable` | This video can't play here | `2.1/E01-unavailable.png` | 2.1 #16 | received | B7 |  |
| E01 External viewer | `E01-loading` | Loading shell with Close | `screens/E01-loading.png` |  | missing | B7 |  |
| E01 External viewer | `E01-playing` | The provider's player in place | `screens/E01-playing.png` |  | missing | B7 | T39 |
| E01 External viewer | `E01-login` | The provider asks for a login or consent | `screens/E01-login.png` |  | missing | B7 |  |
| E01 External viewer | `E01-timeout` | Timeout or network loss: retry, Open original | `screens/E01-timeout.png` |  | missing | B7 |  |
| E01 External viewer | `E01-instagram` | Instagram reel as a link | `screens/E01-instagram.png` |  | missing | B7 | FQ11 |
| M01 Memories | `M01-memories` | Past days by month | `2.1/M01-memories.png` | 2.1 #17 | received | B6 |  |
| M01 Memories | `M01-memories-xl` | Memories at the largest text: one column | `screens/M01-memories-xl.png` |  | missing | B6 |  |
| M01 Memories | `M01-search` | Search names, dates and captions | `2.1/M01-search.png` | 2.1 #40 | received | B6 |  |
| M01 Memories | `M01-empty` | Your first memories are ahead | `2.1/M01-empty.png` | 2.1 #50 | received | B6 |  |
| M01 Memories | `M01-filters` | Member, month, For me | `screens/M01-filters.png` |  | missing | B6 |  |
| M01 Memories | `M01-no-results` | Search with no results | `screens/M01-no-results.png` |  | missing | B6 |  |
| M01 Memories | `M01-no-club` | The Memories tab with no club yet: no fabricated history | `screens/M01-no-club.png` | Handoff 2 (1 before) | received | B0 |  |
| M01 Memories | `M01-not-started` | Memories before the club starts | `screens/M01-not-started.png` |  | missing | B2 | Words only (handoff 3) |
| M01 Memories | `M01-paused` | Memories while the club is paused: still readable | `screens/M01-paused.png` |  | missing | B2 | FQ16. Words only (handoff 3) |
| M02 Favourites | `M02-favourites` | Saved privately | `2.1/M02-favourites.png` | 2.1 #18 | received | B6 |  |
| M02 Favourites | `M02-empty` | Save a revealed drop to find it here | `screens/M02-empty.png` |  | missing | B6 |  |
| M02 Favourites | `M02-explainer` | One-time explanation | `screens/M02-explainer.png` |  | missing | B6 |  |
| S01 Drop safety menu | `S01-pictured-removal` | A photo of you? | `2.1/S01-pictured-removal.png` | 2.1 #26 | received | B6 | T25 |
| S01 Drop safety menu | `S01-author-menu` | Author: edit while collecting, withdraw | `screens/S01-author-menu.png` |  | missing | B6 |  |
| S01 Drop safety menu | `S01-member-menu` | Others: hide for me, report, I am in this photo | `screens/S01-member-menu.png` |  | missing | B6 |  |
| S01 Drop safety menu | `S01-report` | Report | `screens/S01-report.png` |  | missing | B6 |  |
| S01 Drop safety menu | `S01-withdraw` | Withdraw after the reveal | `screens/S01-withdraw.png` |  | missing | B6 |  |
| S02 Block and leave | `S02-block` | Shared clubs, Block and leave, keep or withdraw | `screens/S02-block.png` |  | missing | B6 | T26 |
| S02 Block and leave | `S02-blocked-list` | Blocked accounts | `screens/S02-blocked-list.png` |  | missing | B6 |  |
| S03 Account settings | `S03-account` | Account | `2.1/S03-account.png` | 2.1 #46 | received | B6 |  |
| S03 Account settings | `S03-notifications` | Notifications | `2.1/S03-notifications.png` | 2.1 #48 | received | B8 |  |
| S03 Account settings | `S03-privacy` | Privacy and safety: previews, blocked accounts, support, how privacy works | `screens/S03-privacy.png` |  | missing | B6 | FQ6 |
| S03 Account settings | `S03-contributions` | Your contributions | `screens/S03-contributions.png` |  | missing | B6 |  |
| S03 Account settings | `S03-appearance` | Appearance | `screens/S03-appearance.png` |  | missing | B6 |  |
| S03 Account settings | `S03-sound-haptics` | Sound and haptics | `screens/S03-sound-haptics.png` |  | missing | B6 | Spec 24 |
| S04 Delete account | `S04-delete` | Consequences and final confirmation | `screens/S04-delete.png` |  | missing | B6 | T27 |
| Global | `global-unavailable` | This drop is no longer available, Back to club | `screens/global-unavailable.png` |  | missing | B8 | T38 |
| Global | `global-offline` | Offline banner | `screens/global-offline.png` |  | missing | B5 |  |
| Global | `global-error` | A failed action with retry, input kept | `screens/global-error.png` |  | missing | B4 | T43 |

## Later

| Screen | State | Shows | Render | Source | Status | When | Notes |
|---|---|---|---|---|---|---|---|
| W01 Widget | `W01-setup` | Widget setup and privacy | `2.1/W01-setup.png` | 2.1 #25 | received | M1 | FQ9 |
| W01 Widget | `W01-small-medium` | Widget families: collecting, revealed star pick, other photo, quiet, stale, identity only | `screens/W01-small-medium.png` |  | missing | M1 | FQ9; Q29 |
| M03 Remember this | `M03-suggestion` | A suggestion in Memories | `screens/M03-suggestion.png` |  | missing | M1.5 | T62 |
| S05 External share (new id) | `S05-share-preview` | Share this photo | `2.1/S05-share-preview.png` | 2.1 #52 | received | After the trial | FQ14, T61 |
| S05 External share (new id) | `S05-restricted` | Kept in the club | `2.1/S05-restricted.png` | 2.1 #53 | received | After the trial | FQ14 |
| S05 External share (new id) | `S05-grants` | Asking the star and pictured members | `screens/S05-grants.png` |  | missing | After the trial | FQ14 |

Screen O01, the operator console, is not designed for the trial: the operator uses audited scripts (FQ27).

## Known differences

Where a 2.1 render breaks a rule, or the spec and the book disagree, build what this list says, not what's drawn. Each item stays listed until a render that matches arrives:
- **"Her pick", "her day", "Revisit her day", "reminded you of her", "She'll see"** (`G06-switcher`, `R01-blank-caption`, `R01-past-day`, `A01-welcome`, `H01-after-close`, `H01-first-drop`, `G03-approve`): names instead (FQ20, T42). Handoff 0's `H01-open` and `H01-open-dark` say "Debby's pick".
- **The Highlight label on someone else's collecting card** (`F02-added`): before the reveal it shows only on the viewer's own drops (FQ21, T10). Handoff 0's `F02-upcoming` and `F02-upcoming-dark` follow it.
- **The highlight rail's order** (`G06-switcher`, `R01-blank-caption`, `R01-past-day`): the star's pick, then the club's schedule order from Monday. On Debby's Friday: Debby's pick, then Ben, Maya and Sam (FQ26). Handoff 0's `H01-open` and `H01-open-dark` follow it.
- **The Share icon** in the feed and the photo viewer (`R02-photo` and other 2.1 renders): not in the trial (FQ14). Handoff 0's `H01-open` and `H01-open-dark` leave it out.
- **The tab bar, status bar and device frame:** iOS draws its own, and older iOS versions draw them differently again (T45).
- **Reduce Motion:** the spec says a short crossfade (spec 15); the book says the photo appears at once (book p19, p36). The book's version is built (T47).
- **"Added to" or "Added for":** spec 10 says "Added to Debby's Friday"; the book and `F02-added` say "Added for Debby's Friday". The book's wording is built everywhere, the share extension included (T20).
- **The type face:** the renders use Arimo as a stand-in; the app uses the system font (book p50).
- **Colours:** the brand's tokens arrived with handoff 0 (`brand/brand-tokens.md`) and replace 2.1's colours everywhere, so colour differences against 2.1 renders are expected; layout differences are what count. They keep book p35's palette and add a dark accent, a dark input border and the six cover colours, so the covers change most: Maya's card, yellow in 2.1, is her cover, lavender.
- **Handoff 0's renders** (`screens/H01-open.png`, `screens/H01-open-dark.png`, `screens/F02-upcoming.png`, `screens/F02-upcoming-dark.png`, and `brand/brand-components.png`) set the brand: the tokens, the cover colours and the components. Where they change 2.1's layout and no rule decides, 2.1's layout is built with the brand (FQ40). Where a rule applies, the rule is built. Each item below goes in the next handoff that covers its screen:
    - **The drop's ··· menu** is missing from H01's feed. Every revealed drop keeps it, opening the safety menu (S01) with no Share item (spec 15 and 22, T25, FQ14).
    - **F02's top bar** is Home's club bar, with no back button and no person in it. F02 is pushed from the tab that opened it, with the system back button and the title "Debby’s Friday", as 2.1 has it (spec 03 and 09, book p34, T45).
    - **The Highlight label after the reveal** is missing from Maya's photo in H01's feed. After the reveal, every highlight carries it in the feed, as 2.1 draws it (spec 15, book p6); FQ21's rule applies only before the reveal. No token pair exists yet for a label on a photograph.
    - **The club switcher's chevron** is missing beside "Sunday people". The club name stays a button with 2.1's chevron (spec 03, book p7).
    - **The action row** shows the words "Comment" and "Save", and no bookmark. The favourite control is the bookmark, filled when saved and labelled "Save to Favourites" (spec 18, book p8 and p36); the heart stays alone (FQ22); the comment control follows FQ40.
    - **"Locked · Opens Fri 13 Nov"** on F02's cards, with no lock glyph, where the component sheet's card says "Opens Fri 13 Nov". Built as 2.1 and the sheet: the lock glyph and "Opens Fri 13 Nov", without "Locked" (spec 03's "Opens with date", book p6). A tap on a card explains the time, "Photo opens Friday 13 Nov at 7 AM" (spec 14, book p8): built from spec.
    - **The star glyph** beside "Highlight" and on the star's pick cover is gone. It stays, beside the text (book p6, spec 24).
    - **The feed photo's corners** are square. Built at the photo radius, 14 (book p35, and the delivery's own list).
    - **People appear only as initials.** A member's photo shows when they have one; the initial is the fallback (spec 29's A03, book p8).
    - **The avatar fallback's circle** is cover2 everywhere, so it vanishes on Maya's cover2 card and rail cover, and H01-open-dark's rail uses the light value. Built as delivered, with the theme's cover2, until a handoff gives a fill that shows on every cover. Its sizes differ too: 36 points on the sheet, 28 and 18 in the screens.
    - **Text on a cover** is always that cover's ink: secondaryText is under 4.5:1 on every cover (4.06 to 4.21:1 light, 1.23 to 1.32:1 dark, measured by Claude Code with WCAG 2's formula).
    - **The input border** is a control boundary, not text: 3.17:1 on canvas and 2.92:1 on surface in light, 5.93:1 and 4.76:1 in dark (measured by Claude Code), so on surface in light it's under the 3:1 a control's boundary needs. Handoff 1 asks which border a field on surface takes.
    - **Sizes no type role names:** the plaque's two lines (about 10 and 25), F02's date title (about 25), the header's club name and "+ Add" (16 and 15) and the button's label (16). Built at the drawn sizes, as named tokens that scale with Dynamic Type, until handoff 1 names them.
    - **The card's status line** is drawn at about 11 points (12 on the sheet). Built at the metadata role, 13/18, which book p35 and the delivery both name, and which sits in spec 24's 13 to 15 points for secondary labels.
    - **The card radius:** the frames draw 14; the delivery's named token ("card 16") and spec 24 say 16; book p35 has a "ticket 18". Built at 16: the delivery asks for its "semantic tokens rather than tracing screenshots", and a render that differs from the spec doesn't change what's built (`docs/DESIGN-HANDOFF.md`). Handoff 1 asks.
    - **F02's audience line:** FQ43. **The cover colour each sender gets:** FQ41; the sheet's specimen colours are only illustrative, and the screens' mapping is the reference. **Dates and times:** FQ44.
    - **The blank-caption card** (2.1's "A photo for Debby.", book p13's "Photo for Debby") has no handoff 0 render: built from 2.1's `F02-upcoming` with the brand's covers. **"Past days"** (spec 09) is in neither render: built from spec.
    - **Apostrophes:** the frames draw ', the book's copy ’. The app's strings use ’.
    - **The tab bar's glyphs** are schematic: the system tab bar with the SF Symbols the delivery names (house, person.2, photo.on.rectangle), as the tab-bar item above says (T45).
    - **The delivery's notes** that reach beyond appearance aren't product rules: the stored cover slot (FQ41), how the highlight label is authorized (T9, T10, T55, FQ21) and the rail's order (FQ26). Its "These targeted directions supersede conflicting brand examples in the 2.1 book" covers colours, the wordmark, the icon and how components look.
    - **The brand assets:** the wordmark is traced from a raster: clean at the sizes the delivery names (96 points at least, 144 on Welcome, 120 CSS pixels on the invitation page), with uneven curves when drawn about 2,400 pixels wide. Its accessible name is "Tadayo", not its SVG title, "Tadayo design frame". The dark icon is an opaque square, where Apple asks for a dark icon with a transparent background: it goes in the asset catalog as delivered. Where the marks came from is FQ42.

- **What revision 1.1 answers in the list above** (handoffs 1 and 2, adopted under FQ45 and ADR-027; `brand/brand-tokens.md`): the avatar fallback (pale `avatarCanvas` on canvas and surface, dark `avatarOnCover` with a light initial on all six covers, sizes 68, 36, 28 and 18); the input border (#778579, 3.44:1 on surface); the sizes no role named (`plaqueWeekday` 10/12, `plaqueDay` 25/28, `dateTitle` 25/29, `clubHeader` 16/20, `headerAdd` 15/20, `button` 16/22); the card's status line (`cardStatus` 13/18) and radius (`cardRadius` 16); a label on a photograph (`photoLabel` and `onPhotoLabel`, the same in both themes, with the star); cover1 (now cream, #EEDFC4, apart from the plaque's yellow); the dark icon (now transparent). The items stay listed as the record of what handoff 0 drew; where 1.1 answers one, 1.1 is built.
- **Handoffs 1 to 4** (the checks in the project's files, `design/handoff-1/check/` to `design/handoff-3/check/`, and their findings files). Built the rules' way until a render that matches arrives:
    - **`A02-code` and `A02-code-error`'s resend wait:** Supabase gives no "send again after" time, so the 60 seconds count from the app's own successful send, in the background too. A refused send says handoff 4's "Couldn't send a new code. Try again." ("Try again shortly" is retired). "This code has expired." never shows: Supabase answers a wrong and an expired code the same way.
    - **`G02-web`'s Get Tadayo link** carries no invitation token, and the page sends no analytics (T7).
    - **Drafts across a sign-in** stay with the account that made them (T30); only the invitation carries over.
    - **A pending member** (`G03-waiting`) sees no captions or club activity either, not only no media (T7).
    - **Native controls:** the Paste button (`G02-link-entry`) and the More menu (`G01-invite-people-add`) are the system's own, and look like iOS's, not like the drawings (T45).
    - **`G04-conflict`'s names:** "Day choice conflict: Ben and Debby" is shown only to the two members involved; everyone else sees only that the day has no reveal scheduled (`G04-conflict-others`, FQ46).
    - **The offline Home:** days that have already opened stay readable offline, as spec 34 says, though handoff 3 shows only the last known opening time; nothing hidden unlocks offline (`H01-offline`).
    - **Times, places and names in the copy:** "7 AM", "New York", Ben, Kitchen table and the like are templates: times follow the phone's settings (FQ44), the zone is the club's own, the names are the club's.
    - **VoiceOver labels** that use other words than their button (nine, such as "Review Sunday people's proposed members" for "Review members") are kept, and the button's visible words also work for Voice Control.
    - **The two-person club's title** (`G05-members-two-days`) is the club's own name, not "Ben and Debby" (handoff 4).
    - **Frames changed only in words** carry older copy, and the newer words are built: the Members lists (every list ends "6 members · New York", then the hours), the invitation list, Club details (the same Private drafts row as elsewhere), `G03-declined` (with "We don't identify who declined."), and Friends at large text and with long names.
    - **Small spacing:** a gap drawn between two steps of book p35's scale is built at the nearest step (17 points as 16); the PR that builds the screen lists each.
    - **Copy namespaces:** `claude-design/handoff-4/copy-contracts.json` holds every earlier entry; its `handoff3` and `handoff4` keys stay apart, since one short key has a different value in each. Share and More are never wired to an accepted member's row; retired lines are never used. Apostrophes are curly.
    - **Fixtures:** Kitchen table has two data sets (five members for `G03-approve`, Ben alone for `H01-paused`); Ben has no photo in `G06-no-club` and a photo elsewhere.

## Counts

- Trial states: 179 (149 before handoffs 1 to 4 entered, 30 rows added with them: 11 delivered new states and 19 described only in words or in neither handoff). With a render: 86. 50 have a 2.1 render (one of them, `C03-system-picker`, is a reference for the system picker and isn't built), and of those `H01-open`, `H01-open-dark`, `F02-upcoming` (handoff 0), `G03-approve` (handoff 4) and `F01-friends` (handoff 3) also have a render in `screens/`, which wins. 36 have a render only in `screens/`: `F02-upcoming-dark` (handoff 0) and 35 from handoffs 1 to 4 (handoffs 1 to 4 sent 37 states' frames, two of them the 2.1 states above). Requested: 0. Missing: 93.
- Later states: 6, of which 3 have 2.1 renders.
- Brand assets: 4, all received (revision 1.1: handoffs 0, 1 and 4).
