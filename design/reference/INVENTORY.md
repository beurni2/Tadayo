# Design inventory

Every screen and state Tadayo needs, the brand assets, and where each render comes from (`docs/DESIGN-HANDOFF.md`). The spec's screen ids (spec 29) start each state's name. Statuses: `missing`, `requested <n>`, `received`, `built from spec`, `built`, `approved` (the founder passed it at a gate).

Keep this current in the same commit as the change. Add rows for states you discover; never delete a row. The journal's state section quotes the counts.

Paths are relative to `design/reference/`:
- `2.1/`: the 53 renders from design revision 2.1, unchanged.
- `claude-design/`: Claude Design's deliveries as they arrived, one folder per handoff (`handoff-<n>/`). An export the founder uploads into `claude-design/` itself is moved into its folder in Claude Code's unpack commit.
- `screens/`: the PNGs Claude Code renders from those deliveries, for new states and for any state the founder has redrawn. When a state has a render in both `screens/` and `2.1/`, `screens/` wins.
- `brand/`: the brand assets, extracted from Design handoff 0's delivery.

**Light, dark and large text.** Every state gets snapshots in light, dark and the largest accessibility text size. Renders exist in light for every state, plus dark and large-text renders for the representative set marked `-dark` and `-xl` below. The other dark and large-text snapshots are judged against book p26's rules: dark tokens, rows grow, the highlight rail becomes a list, the memory grid becomes one column.

## Brand (Design handoff 0)

| Asset | File in `brand/` | Status | Handoff |
|---|---|---|---|
| Wordmark, light and dark | `brand-wordmark.pdf`, `brand-wordmark-dark.pdf` | missing | 0 |
| App icon, light, dark and tinted | `brand-icon-1024.png`, `brand-icon-dark-1024.png`, `brand-icon-tinted-1024.png` | missing | 0 |
| Colour tokens, light and dark, with the six cover colours | `brand-tokens.md` | missing | 0 |
| Component sheet: plaque, folded card, highlight cover, avatar fallback, button, allowance line | `brand-components.png` | missing | 0 |
| The Welcome example photograph | One of the founder's own photographs, before Gate D (FQ23); builds that point at `dev` show the book's chair fixture until then | waiting for the founder | |

## Screens and states for the trial

| Screen | State | Shows | Render | Source | Status | Stage | Notes |
|---|---|---|---|---|---|---|---|
| A01 Welcome | `A01-welcome` | Welcome with the labelled example | `2.1/A01-welcome.png` | 2.1 #01 | received | B1 | FQ20: "before and on the day"; FQ23: example photograph |
| A02 Authentication | `A02-email` | Email entry | `screens/A02-email.png` |  | missing | B0 |  |
| A02 Authentication | `A02-code` | Six-digit code | `screens/A02-code.png` |  | missing | B0 | ADR-011 |
| A02 Authentication | `A02-code-error` | Wrong or expired code, resend | `screens/A02-code-error.png` |  | missing | B0 |  |
| A02 Authentication | `A02-age` | 18 or older confirmation | `screens/A02-age.png` |  | missing | B0 | FQ13 |
| A03 Profile | `A03-profile` | Name and optional photo | `screens/A03-profile.png` |  | missing | B0 |  |
| G01 Club creation | `G01-create` | Name the club | `2.1/G01-create.png` | 2.1 #47 | received | B1 | No cover in the trial (FQ17) |
| G01 Club creation | `G01-invite-people` | Make and share a link per person | `screens/G01-invite-people.png` |  | missing | B1 |  |
| G01 Club creation | `G01-pending` | Before activation; prepared work stays in Drafts | `screens/G01-pending.png` |  | missing | B1 |  |
| G02 Invite landing | `G02-invitation` | Inviter, club and exact roster | `2.1/G02-invitation.png` | 2.1 #02 | received | B1 |  |
| G02 Invite landing | `G02-expired` | Expired invitation | `screens/G02-expired.png` |  | missing | B1 |  |
| G02 Invite landing | `G02-changed` | The roster changed; review again | `screens/G02-changed.png` |  | missing | B1 |  |
| G02 Invite landing | `G02-full` | The club already has six | `screens/G02-full.png` |  | missing | B1 |  |
| G02 Invite landing | `G02-web` | Signed-out web page (apps/web) | `screens/G02-web.png` |  | missing | B1 | Shows the inviter's name only (T7) |
| G03 Roster approval | `G03-approve` | Existing member approves a proposed member | `2.1/G03-approve.png` | 2.1 #30 | received | B1 | FQ20: "Leila will see only drops shared after joining" |
| G03 Roster approval | `G03-waiting` | Candidate waiting for the members | `screens/G03-waiting.png` |  | missing | B1 |  |
| G03 Roster approval | `G03-declined` | Neutral: the invitation didn't go ahead | `screens/G03-declined.png` |  | missing | B1 | Never says who declined |
| G04 Schedule proposal | `G04-one-day` | Confirm one day (four to six members) | `2.1/G04-one-day.png` | 2.1 #03 | received | B2 |  |
| G04 Schedule proposal | `G04-two-days` | Choose two days (two or three members) | `2.1/G04-two-days.png` | 2.1 #32 | received | B2 |  |
| G04 Schedule proposal | `G04-conflict` | Two members want the same day | `screens/G04-conflict.png` |  | missing | B2 | Shown, never swapped (T6) |
| G04 Schedule proposal | `G04-change` | Membership changed: confirm days from a future date | `screens/G04-change.png` |  | missing | B2 |  |
| G05 Club information | `G05-club-details` | Members, schedule, notifications, widget, drafts, leave | `2.1/G05-club-details.png` | 2.1 #20 | received | B1 | The Widget row waits for M1 (FQ9) |
| G05 Club information | `G05-members` | Roster with proposals | `screens/G05-members.png` |  | missing | B1 |  |
| G05 Club information | `G05-schedule` | The club's week | `screens/G05-schedule.png` |  | missing | B2 |  |
| G05 Club information | `G05-notifications` | Notifications for this club | `screens/G05-notifications.png` |  | missing | B8 |  |
| G05 Club information | `G05-leave` | Leave: keep or withdraw my contributions | `screens/G05-leave.png` |  | missing | B6 | T26 |
| G06 Club switcher | `G06-switcher` | Your clubs | `2.1/G06-switcher.png` | 2.1 #45 | received | B1 | FQ20: shows "Her pick" behind the sheet |
| G06 Club switcher | `G06-no-club` | Signed in with no club: create or join | `screens/G06-no-club.png` |  | missing | B1 |  |
| H01 Home | `H01-first-drop` | After joining: something for Debby | `2.1/H01-first-drop.png` | 2.1 #04 | received | B4 | FQ20: "reminded you of Debby" |
| H01 Home | `H01-open` | Debby's day, the feed directly | `2.1/H01-open.png` | 2.1 #05 | received | B5 | FQ20, FQ26; brand version requested in handoff 0 |
| H01 Home | `H01-open-dark` | Debby's day, dark | `2.1/H01-open-dark.png` | 2.1 #23 | received | B5 | FQ20; brand version requested in handoff 0 |
| H01 Home | `H01-open-xl` | Debby's day at the largest text: the rail as a list | `screens/H01-open-xl.png` |  | missing | B5 |  |
| H01 Home | `H01-waiting` | Up next with countdown | `2.1/H01-waiting.png` | 2.1 #06 | received | B2 |  |
| H01 Home | `H01-quiet` | Open day with nothing added | `2.1/H01-quiet.png` | 2.1 #21 | received | B5 |  |
| H01 Home | `H01-after-close` | After 1 AM: next person; the day is in Memories | `2.1/H01-after-close.png` | 2.1 #27 | received | B2 | FQ20: "Revisit Debby's Friday" |
| H01 Home | `H01-sunday` | Sunday: next Monday and this week | `2.1/H01-sunday.png` | 2.1 #28 | received | B2 |  |
| H01 Home | `H01-your-day` | The viewer is the star | `2.1/H01-your-day.png` | 2.1 #29 | received | B5 |  |
| H01 Home | `H01-awaiting-activation` | Waiting for club confirmation | `screens/H01-awaiting-activation.png` |  | missing | B2 |  |
| H01 Home | `H01-paused` | Club paused (fewer than two members, or suspended) | `screens/H01-paused.png` |  | missing | B2 | FQ16 |
| H01 Home | `H01-offline` | Cached state with its date | `screens/H01-offline.png` |  | missing | B5 | T49 |
| H01 Home | `H01-loading` | Loading shell | `screens/H01-loading.png` |  | missing | B2 |  |
| F01 Friends | `F01-friends` | Roster with next dates | `2.1/F01-friends.png` | 2.1 #07 | received | B2 |  |
| F01 Friends | `F01-friends-dark` | Roster, dark | `screens/F01-friends-dark.png` |  | missing | B2 |  |
| F01 Friends | `F01-friends-xl` | Roster at a large text size | `2.1/F01-friends-xl.png` | 2.1 #24 | received | B2 |  |
| F01 Friends | `F01-long-names` | Long names wrap | `2.1/F01-long-names.png` | 2.1 #41 | received | B2 |  |
| F02 Upcoming day | `F02-upcoming` | Captions now, photos on Friday | `2.1/F02-upcoming.png` | 2.1 #08 | received | B4 | FQ21: Highlight label; brand version requested in handoff 0 |
| F02 Upcoming day | `F02-upcoming-dark` | Upcoming day, dark | `screens/F02-upcoming-dark.png` |  | missing | B4 | Brand version requested in handoff 0 |
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
- **"Her pick", "her day", "Revisit her day", "reminded you of her", "She'll see"** (`H01-open`, `H01-open-dark`, `G06-switcher`, `R01-blank-caption`, `R01-past-day`, `A01-welcome`, `H01-after-close`, `H01-first-drop`, `G03-approve`): names instead (FQ20, T42).
- **The Highlight label on someone else's collecting card** (`F02-upcoming`, `F02-added`): before the reveal it shows only on the viewer's own drops (FQ21, T10).
- **The highlight rail's order** (`H01-open`, `H01-open-dark`, `G06-switcher`, `R01-blank-caption`, `R01-past-day`): the star's pick, then the club's schedule order from Monday. On Debby's Friday: Debby's pick, then Ben, Maya and Sam (FQ26).
- **The Share icon** in the feed and the photo viewer (`H01-open`, `R02-photo` and others): not in the trial (FQ14).
- **The tab bar, status bar and device frame:** iOS draws its own, and older iOS versions draw them differently again (T45).
- **Reduce Motion:** the spec says a short crossfade (spec 15); the book says the photo appears at once (book p19, p36). The book's version is built (T47).
- **"Added to" or "Added for":** spec 10 says "Added to Debby's Friday"; the book and `F02-added` say "Added for Debby's Friday". The book's wording is built everywhere, the share extension included (T20).
- **The type face:** the renders use Arimo as a stand-in; the app uses the system font (book p50).
- **Colours:** once the brand tokens arrive (handoff 0), they replace 2.1's colours everywhere, so colour differences against 2.1 renders are expected; layout differences are what count.

## Counts

- Trial states: 147. With a 2.1 render: 50 (one of them, `C03-system-picker`, is a reference for the system picker and isn't built). Missing: 97.
- Later states: 6, of which 3 have 2.1 renders.
- Brand assets: 4, none received.
