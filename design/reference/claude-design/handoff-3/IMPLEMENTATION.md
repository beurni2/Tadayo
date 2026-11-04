# Tadayo handoff 3 — club days and Home

Issued November 2, 2026 (New York). Source repository snapshot: bd3bd8063fe7726babe45d242265c4d6b2df94bd.

## Frames, exact order

1. `G04-conflict` — 393 × 852 pt; SVG and 2× PNG.
2. `G04-change` — 393 × 852 pt; SVG and 2× PNG.
3. `G05-schedule` — 393 × 852 pt; SVG and 2× PNG.
4. `H01-awaiting-activation` — 393 × 852 pt; SVG and 2× PNG.
5. `H01-paused` — 393 × 852 pt; SVG and 2× PNG.
6. `H01-loading` — 393 × 852 pt; SVG and 2× PNG.
7. `F01-friends-dark` — 393 × 852 pt; SVG and 2× PNG.
8. `F01-friends` — 393 × 852 pt; SVG and 2× PNG.
9. `brand-components` — 1200 × 4670 pt; SVG and 2× PNG.

## Delivery and source precedence

Eight phone frames follow the exact requested names and order. Only F01-friends-dark is a dark phone frame; there are no additional dark or XL phone frames. The complete replacement brand-components follows as frame 9, retaining the whole handoff 2 sheet and adding the handoff 3 component specimens.

brand-tokens.json revision 1.1 is byte-for-byte unchanged from handoff 2 and handoff 1. The retained wordmark, dark wordmark and transparent dark icon masters are unchanged. No values come from the repository’s older handoff 0 brand. Component additions are aliases of the adopted tokens, not a new palette revision.

The current brief and its explicit Defaults govern these constructed fixtures. The source snapshot is beurni2/Tadayo at commit bd3bd8063fe7726babe45d242265c4d6b2df94bd. The repository text, book 2.1, v3 spec and rules T1–T62 were checked. Existing local 2.1 renders were used for visual continuity; a fresh byte-identical copy of the repository’s binary PNGs was not available through the linked text API.

Snapshot formatting is en-US, 12-hour, America/New_York. Weekday and month names are words, through one native formatter (FQ44). Full boundary dates include the year; the four announced occurrence labels sit within that explicit 2026 context. A recurring weekday needs no date. Status-bar 9:41 is illustrative OS chrome, never the scheduling clock.

Every SVG has its exact frame title, outlined Arimo glyphs, and per-run accessibility text for inspection. The supplied Arimo variable font and OFL licence preserve portability. The app uses the iOS system font and native controls; these files do not implement or device-test the service.


## G04-conflict: choosing and resolving

Ben sees “Friday is chosen by Ben and Debby.” and “Either person can change a choice.”. Friday has the native selected checkmark, both names and “Day conflict”. “Confirm Friday” is disabled. The outline and words make the conflict readable without colour.

Monday says “Proposed for Ben · Available”. It has no star yet and remains selectable: Ben has not confirmed it. Tapping that row changes Ben’s local selection to Monday and enables the corresponding confirmation. It is a native selection row with no disclosure chevron; no page opens. The selected row alone takes the native checkmark.

Maya’s Tuesday, Alex’s Wednesday, Sam’s Thursday and Nina’s Saturday identify their owners, stay readable and cannot be selected. No lock marks a calendar assignment. The Sunday row is Revisit and cannot become a star day.

Debby sees the same Friday conflict with both names and cannot confirm Friday either. Debby can explicitly choose an available day, or keep the choice and leave. Ben can do the same. Neither is prompted to yield, swapped, reminded, given a deadline or assigned a replacement. If Ben confirms Monday, Debby may then confirm Friday; neither confirmation happens automatically.

The other four members keep their confirmed days. In their read-only week, Friday says “Day choice conflict: Ben and Debby. No reveal scheduled.”. Monday, until explicitly assigned and confirmed, says “No reveal scheduled”. Their own confirmation state reads “Your day is confirmed.” / “Confirmed days will go ahead.”. There is no list or count of pending people. The contested weekday generates no star or reveal; all confirmed days proceed.

Default assessment: neither-person-can-confirm preserves choice, but can leave Friday unresolved indefinitely. That is a real scheduling weakness to observe in the trial. This handoff does not hide it with auto-assignment, a reminder or a winner.


## G04 failures and a saved confirmation

If a fresh server response says a day was confirmed by someone else a moment earlier, name the attempted action and the now-confirmed owner. The exact parameterized copy and the Friday/Debby examples are in copy-contracts.json under handoff3.G04.error.*. Choosing failure keeps the previous stored selection; confirmation failure keeps the rejected local choice visible as unavailable while asking the member to make the next choice. No substitute is offered.

Keep every other draft choice and the current scroll position. Update only the affected row with the server-confirmed owner and “No longer available”. Do not infer that a failed response cancelled an occurrence or changed a confirmed assignment. Selection, confirmation and proposal version are revalidated atomically by the server.

After Ben confirms the new week, G04-change replaces its confirmation footer with “Your confirmation is saved.” and “The current days continue while this change is being confirmed.”, plus Done. Keep the exact proposal and preserved dates visible; do not name who is left to confirm or show a completion count. If every required confirmation is already in, render the returned server state instead of a fabricated waiting state.

A lost network response is not a successful confirmation. Keep the proposal and choices, name the failed action and allow retry. A changed roster/schedule invalidates confirmation of the old proposal; review the new revision before another attempt. A proposal whose effective date has passed must be replaced by a fresh future proposal, never backdated or silently accepted with old confirmations.


## G04-change: before, after and membership

On Friday, November 6, 2026, the pair becomes three when Maya joins. The proposed recurring week begins “Monday, November 16, 2026”. The reason is only “A future start keeps announced days unchanged.”. Never disclose which occurrences contain submissions, uploads or saved work.

The before block runs through Sunday, November 15. It explicitly preserves Ben’s Monday, November 9 and Thursday, November 12; Debby’s Tuesday, November 10 and Friday, November 13. The after block starts Monday, November 16: Ben Monday/Thursday, Debby Tuesday/Friday, Maya Wednesday/Saturday, Sunday Revisit. Ben and Debby each have an explicit Unchanged suffix. The 7 AM opening, next-morning 1 AM close and New York zone apply to both blocks.

Maya gets the same proposed start and full future week, with “Confirm your days”, “Wednesday and Saturday” and “You’ll see only drops shared after joining.”. Do not show the pre-join occurrence block or its content to Maya. Maya’s approval is required on the same roster/schedule revision. The new member receives no earlier drops even if an earlier submission reveals after joining.

Every active member, including Maya, confirms. Current days continue until agreement and a valid future start. If the proposed date passes without complete confirmation, the server chooses a fresh exact future boundary, preserving every announced occurrence, and asks for a new review of that proposal. It does not activate late or carry old confirmations silently.

Pending review is found through Friends → See schedule or Club details → Schedule. At the top of the recurring week, a neutral text row “Review the club’s days” with “Proposed from {fullStartDate}” opens the member’s G04-change. Club details may use “New days to review” as the Schedule row’s secondary text. There is no push, badge, count or approver list. Ordinary Home stays on its current day, rather than becoming a confirmation reminder.

Default assessment: all-active-member confirmation can stall a change in a larger club. Keeping the current schedule active and the review reachable makes that understandable without taking anyone’s choice. The screen does not add urgency or a deadline.


## Three to four and exceptional transition weeks

Reuse the same versioned review, not a separate punitive flow. The title is “Confirm the club’s days” with “One reveal day each week”. The general explanation is “The club changes from two days each week to one day each week for everyone.”. Show “Your announced dates stay the same.” and the member’s exact new assignment using “From {fullStartDate}, your day is {weekday}.”. Do not say a day was lost, earned, forfeited or removed for low participation.

Render the server’s real before block, then “Transition week” with each exceptional occurrence as its own full weekday/date/person row, followed by the steady week and “One day each week from {fullSteadyStartDate}.”. Both exact effective boundaries are visible when transition and steady-state dates differ. Never fake the steady table for a transition week. No fourth person, date or allocation is invented in this export.

One person has one steady reveal day after the transition in a four-person club. Already announced occurrences can temporarily produce a different transition week. Confirmations cover the exact versioned proposal, including the exceptional rows and steady boundary. Existing submitted drops stay on their original occurrence IDs and instants; the client never moves them while presenting this comparison.


## G05-schedule: the whole week and travel

Members is a stable people list with each person’s assignments. Schedule is the complete Monday–Sunday recurring week: who owns each weekday, the club’s zone, and its opening/closing rule. It is read-only in the trial. Membership-driven changes lead to G04-change; no picker, editing affordance or distant-date composer is added here.

There are no next dates or Next up labels on the recurring week. Friends supplies those precise next targets, with Nina on Saturday, November 7 and the other five on November 9–13 in this fixture. This keeps Schedule unchanged whether there are no drops or many, and avoids making it a calendar tab.

An unused assignable weekday says “No reveal scheduled”, not Available. Available is for choosing a day in G04. A pair shows Monday Ben, Tuesday Debby, Wednesday No reveal scheduled, Thursday Ben, Friday Debby, Saturday No reveal scheduled, Sunday Revisit / No reveal scheduled. In four- and five-person clubs, render the actual confirmed server allocation; unassigned weekdays use the same quiet words. Never auto-rotate another turn into an unused slot.

Sunday has “Revisit” with “No reveal scheduled”. It neither invents a reveal nor asks anyone to catch up. There are no completion rings, contribution dots, counts, blank-cover placeholders or activity markers on any weekday.

“View local times” opens a native sheet titled “Times in your time zone”. For actual scheduled occurrences, pair Club time and Your time using the full opening and closing date/time with each zone. Keep New York visible beside the local equivalent. Values are the keyed templates G05.schedule.localSheet.clubValue/localValue, resolved from server instants with the phone’s region/clock. No travel city is invented.

Do not attach one fixed UTC offset to a recurring weekday. Resolve each club civil opening and closing independently through America/New_York and then format the device-zone equivalent; the 1 AM end is on the following club date. The server controls instants, versioning and cutoff state. No new occurrence is generated from the phone clock.

Default assessment: read-only is a good trial boundary. It makes the screen predictable and avoids accidental schedule edits. The locale default makes some labels longer; the reference keeps full words and the implementation must grow rows rather than abbreviate dates.


## H01-awaiting-activation and the proposed roster

Use spec 08’s “Waiting for club confirmation” and “Review members”. The selected club is already known, so the leading header is Sunday people plus chevron, not the no-club wordmark. + Add, Ben’s account photograph and all three native tabs remain reachable. This selected-club header applies before activation, during pause and during loading as well as when active.

Review members opens G05-members in a creator-only proposed-roster review variant, titled “Proposed roster”. It names the exact proposed people without weekdays, acceptance statuses, pending counts or a list of who has not accepted. Its explanatory line is “These names are a proposal, not an active member list.”. “Manage invitations” is a separate action into G01-invite-people, whose link-state visibility stays creator-only.

Ben’s proposal counts as Ben’s approval. One other acceptance of that exact roster can start the club; do not wait for every invitee, treat unaccepted people as active, or grant access from a link. Only Ben sees this constructed Home while nobody else has accepted.

The truthful objects here are the selected club’s name, Ben’s own photograph, native navigation/actions and the author’s Private drafts row. Proposed names may appear in an explicitly labelled proposed-roster review, not as a status-free active roster. They are omitted from Home so it cannot look like a started club.

Private drafts uses handoff 2’s same 76 pt rounded row, folder, subtitle and chevron. “Drafts stay private when the club starts.” means activation never submits a draft or announces a reveal. + Add opens the normal destination picker with Private draft first and Open my drafts, with no selected-club roster. An eligible different club is chosen explicitly, not substituted.

The next G01-pending redraw should share this content, row and Review members action; only its pushed navigation chrome differs. The old Open Drafts primary and Review invitations composition is superseded for that future redraw. No G01-pending frame is added here.

Default assessment: counting Ben’s proposal as approval makes the two-person start clear. It must stay tied to one exact roster revision; a changed proposal requires a new exact-roster agreement.


## H01-paused, switcher and other tabs

Kitchen table shows “This club is paused.”, “Kitchen table needs another member for new days.” and “Memories still shows the days you can access.”. View Memories is the main action above the tab bar; Club details is secondary. An optional invitation action is available inside details, with no recurring Home invitation prompt, push, badge, deadline or countdown.

+ Add offers Private draft then Open my drafts, with no new target in paused Kitchen table. No new occurrences are generated (FQ16). The fixture has no remaining announced day; if an actual paused club still has promised occurrences, preserve them rather than silently cancelling them. Restart follows the accepted invitation and valid schedule process, not merely the creation of a link.

In the switcher, a not-started club has “Not started” and a paused one “Paused”, as plain secondary text beside the club identity. Both are spoken in the keyed labels switcher.awaiting.vo / switcher.paused.vo. No lock, colour-only status, next date or countdown is shown for either.

Awaiting Friends shows Private drafts, “The club hasn’t started.” and Review members for Ben; it does not invent active friends or days. Awaiting Memories says “Memories will appear after the club starts and a day opens.” without fabricated history. Paused Friends shows Private drafts, the actual active Ben row and “New days are paused.”, with no next date. Paused Memories retains only authorized days and drops under normal membership and removal predicates.

Suspension is a distinct H01-unavailable state: “Club unavailable” / “This club isn’t available right now.”, with Choose a club and Get help. Block all selected-club content in Home, Friends and Memories. Do not disclose moderation, a reporter, a departure or another person’s reason. Keep account-private drafts separately available if account access permits.

Yes, suspension needs its own frame: paused permits Memories, while unavailable denies it. It is outside this requested render set, so this pack gives its exact copy and route/access contract without adding an unrequested phone frame. A native tab switch must resolve to the same denial, never a readable stale selected-club tab.

Default assessment: FQ16 is understandable. Putting Memories first keeps a paused club useful without asking Ben to recruit. No reassurance about the reasons for departures is invented.


## H01-loading, failure and lost access

Use one neutral shell for every possible Home, with the native indeterminate activity indicator and “Loading Home…”. Do not guess the expected Home, draw redacted cards or show shimmer, pulse, count-bearing rows, media-derived colours or photos. The static spinner in the SVG is a schematic; the app uses the native system indicator.

Before authorization resolves, only the persisted selected club name and Ben’s own account photograph may be payload. Header and tabs stay reachable. + Add is private-safe. All other people, cached captions, cached media, dates and countdowns stay absent. A switch invalidates the prior payload immediately; responses must match account, selected club and membership interval before display.

VoiceOver announces “Loading Sunday people.” once on entry. The indicator is not a second focus target and does not keep announcing. Completion politely announces “Home updated.” once, retaining focus on surviving controls. All header and tab controls have keyed accessible labels. Do not announce the visible message repeatedly during a long request.

At 7 AM and 1 AM, a Home already being read updates the affected region in place; it does not blank into this launch/switch shell. A sheet or composer stays intact until safe return, with its existing explicit cutoff handling. The first return after 1 AM asks the server for the correct selected-club Home.

A failed request is an explicit Offline state, never an empty club. If an eligible last-verified cache exists for the same account, selected club and membership interval, show “Offline”, “Last checked {fullDateAndTime}” and “Last known opening: {fullTargetDateAndTime} · {clubZoneName}”, followed by “Home couldn’t be checked. The date shown is from the last check.” and Retry. Only dated scheduling metadata is eligible; no captions, photos, live countdown or current-ready claim. The target is labelled last known, even when its time has passed.

With no eligible target cache, show “Couldn’t load Home. Check your connection and try again.” and Retry, with no invented date. Retry keeps the same selected club. A separate explicit Choose a club action is allowed; it is never an automatic substitution. Known membership invalidation, revocation or server denial forbids cache fallback and clears prohibited media.

When the selected club cannot be opened, show “This club is no longer available.” and “Choose a club to continue.” with Choose a club. The selector may retain the selected club identity only to explain the failed destination; no content, member identity or another club’s Home is substituted. Not-started, paused, loading, offline and access-lost remain distinct states.

Default assessment: the neutral shell is safe and legible but can feel slower because it shows no speculative content. Keep the chrome stable and resolve the request promptly; do not trade that cost for unauthorized cached media.


## Friends components, type and dark

Friends keeps Sunday people, its chevron, + Add and Ben’s photograph. Private drafts is the first row. All six members keep the stable Monday–Saturday order even though Nina’s Saturday, November 7 is next. The exact next-target rows open the returned collecting occurrence ID, not a weekday-derived destination.

See schedule sits below the roster and above the native tab bar, with New York leading. The reference target is 128 × 44 pt, x245/y725, while the date rows remain visible. At large text, the footer becomes stacked zone and full-width link rows, grows with text and leaves the roster scrollable above it.

Next up is a plain label, not a chip: nextUp 13/18 bold, secondaryText ink on canvas in both themes, no fill container or cover colour. You is always part of the name line, Ben · You, in row 17/22 bold. No separate tiny tag, self-only ring, presence dot or activity meaning is added.

FriendsRow is 353 pt wide, 68 pt minimum high, avatar 36, text inset 49, name row 17/22 bold and date metadata 13/18. The separator begins 49 pt from the leading edge and ends at the trailing edge. Date and 20 pt chevron use secondaryText; separator uses separator. The whole growing row is the action target.

Every photo avatar gets the same 1 pt edge outside the circular photo clip, using separator in both themes. It is decorative boundary definition, not a signal of the viewer or a selection. Ben’s special ring is removed. Original photograph bytes are unchanged: no dimming, tint, filter or replacement face. Initials retain avatarCanvas/onAvatarCanvas exactly.

The selected native tab uses its filled/selected symbol and label with action ink; unselected items use secondaryText. There is no custom selected pill, cover colour or non-native tab animation. Symbol choice, spoken selected trait and label identify selection without colour alone.

The full replacement brand-components retains all earlier specimens and adds FriendsRow light/dark, Next up and You roles, and the 36/28/18 pt uniform photo edge. brand-tokens.json is untouched; all new roles and aliases live under component-contracts.json → handoff3.


## Dark and largest-text checks

All other states have a dark and AX5 layout contract even though only the requested dark Friends is exported. These are design-time metric/contrast checks and written behavior, not iPhone screenshots or a claim of VoiceOver device testing. Production uses uncapped UIFontMetrics / Dynamic Type and native navigation, tab, sheet and activity controls.

At AX5 each weekday is one full-width growing row. For G04-conflict, stack weekday, owner and state with the checkmark separate; all day labels retain their full words. For G04-change, preserve four separate announced date rows, then the proposed Monday–Sunday rows, rather than squeezing two dates or two owners into columns. The exact start date wraps across lines without shrinking.

G05’s weekday and owner stack at AX5; unused and Sunday explanations sit below. Its body scrolls and View local times remains reachable. Home titles and descriptions wrap to the content width; the Private drafts row grows, its subtitle wraps, and primary action footers grow or join the vertical scroll if the native safe area leaves insufficient room.

Friends at AX5 stacks the name, Next up if any and wrapped date; the 36 pt avatar aligns to the first line, the row grows and the chevron remains decorative inside the full-row action. Drafts grows. The schedule footer stacks. Nothing is capped, clipped, ellipsized or reduced to make all six rows fit one screen.

When a large club name and trailing actions no longer fit, the native accessible selector occupies a growing full-width toolbar row and Add/Account occupy a second row with 44 pt targets. The content starts below that expanded header. Native bars/selected traits remain system-owned; do not compress the page body behind a fixed-height custom header.

VoiceOver groups each day row once. The exact seven labels for G04-conflict are handoff3.G04.conflict.vo.Monday through Sunday. The exact proposed-week labels for G04-change are handoff3.G04.change.vo.Monday through Sunday; the four preserved dates have their own G04.change.preserved.vo keys. Friends and Schedule also have one exact label per row. Decorative checkmarks, avatars, chevrons and indicator marks do not duplicate speech.

Dark uses the same semantic aliases and layout. Assigned weekday rows remain readable; destructive text on the conflict uses destructive, not reduced opacity. Buttons retain the existing default/pressed/disabled/focus contracts. Surface, canvas and separator use their dark values; photographs never change. Contrast results and bounded-text checks are in validation-report.json.


## Exact G04 failure messages

| Key under handoff3 | Exact value |
|---|---|
| `G04.error.chooseTaken` | Couldn’t choose {weekday}. {weekday} is now {ownerName}’s day. Your other choices are unchanged. |
| `G04.error.confirmTaken` | Couldn’t confirm {weekday}. {weekday} is now {ownerName}’s day. Your other choices are unchanged. |
| `G04.error.chooseFridayExample` | Couldn’t choose Friday. Friday is now Debby’s day. Your other choices are unchanged. |
| `G04.error.confirmFridayExample` | Couldn’t confirm Friday. Friday is now Debby’s day. Your other choices are unchanged. |
| `G04.error.network` | Couldn’t confirm your days. Check your connection and try again. Your choices are still here. |
| `G04.error.revision` | Couldn’t confirm these days because the proposed week changed. Review the updated week. |
| `G04.error.pastStart` | Couldn’t confirm that start date. Review the new proposed date. |
| `G04.error.unavailable` | No longer available |

## Exact day VoiceOver labels

| Key under handoff3 | Exact value |
|---|---|
| `G04.conflict.vo.Monday` | Monday. Proposed for Ben. Available. Not selected. Choose Monday. |
| `G04.conflict.vo.Tuesday` | Tuesday. Maya’s day. Assigned and unavailable. |
| `G04.conflict.vo.Wednesday` | Wednesday. Alex’s day. Assigned and unavailable. |
| `G04.conflict.vo.Thursday` | Thursday. Sam’s day. Assigned and unavailable. |
| `G04.conflict.vo.Saturday` | Saturday. Nina’s day. Assigned and unavailable. |
| `G04.conflict.vo.Friday` | Friday. Chosen by Ben and Debby. Day conflict. Your current choice. Confirmation is unavailable. |
| `G04.conflict.vo.Sunday` | Sunday. Revisit. Not a reveal day. |
| `G04.change.vo.Monday` | Monday. Ben’s day in the proposed week from Monday, November 16, 2026. |
| `G04.change.vo.Tuesday` | Tuesday. Debby’s day in the proposed week from Monday, November 16, 2026. |
| `G04.change.vo.Wednesday` | Wednesday. Maya’s day in the proposed week from Monday, November 16, 2026. |
| `G04.change.vo.Thursday` | Thursday. Ben’s day in the proposed week from Monday, November 16, 2026. |
| `G04.change.vo.Friday` | Friday. Debby’s day in the proposed week from Monday, November 16, 2026. |
| `G04.change.vo.Saturday` | Saturday. Maya’s day in the proposed week from Monday, November 16, 2026. |
| `G04.change.vo.Sunday` | Sunday. Revisit. No reveal scheduled in the proposed week. |
| `G04.change.preserved.vo.Monday` | Monday, November 9, 2026. Ben’s announced day. The date stays the same. |
| `G04.change.preserved.vo.Thursday` | Thursday, November 12, 2026. Ben’s announced day. The date stays the same. |
| `G04.change.preserved.vo.Tuesday` | Tuesday, November 10, 2026. Debby’s announced day. The date stays the same. |
| `G04.change.preserved.vo.Friday` | Friday, November 13, 2026. Debby’s announced day. The date stays the same. |

## Token mappings

| Meaning | Light | Dark |
|---|---|
| Next up ink / canvas | #607067 / #FAFBF8 | #B6C3B7 / #121D19 |
| Date and chevron | secondaryText #607067 | secondaryText #B6C3B7 |
| Separator / photo edge | separator #DCE2DA | separator #35463A |
| Initial fallback fill / ink | #E1E5F6 / #182B25 | #35463A / #F7F8F2 |

## Sources

Repository documents are pinned to the reviewed snapshot, not the moving default branch. The current brief supersedes repository handoff 0 palette references and supplies the constructed fixtures and Defaults. No repository file is changed by this design delivery.

- [docs/tadayo-design-book-2.1.md](https://github.com/beurni2/Tadayo/blob/bd3bd8063fe7726babe45d242265c4d6b2df94bd/docs/tadayo-design-book-2.1.md)
- [docs/tadayo-build-spec-v3.md](https://github.com/beurni2/Tadayo/blob/bd3bd8063fe7726babe45d242265c4d6b2df94bd/docs/tadayo-build-spec-v3.md)
- [docs/INVARIANTS.md](https://github.com/beurni2/Tadayo/blob/bd3bd8063fe7726babe45d242265c4d6b2df94bd/docs/INVARIANTS.md)
- [docs/QUESTIONS.md](https://github.com/beurni2/Tadayo/blob/bd3bd8063fe7726babe45d242265c4d6b2df94bd/docs/QUESTIONS.md)
- Handoff 1 revision 1.1 brand and Handoff 2 pack: retained supplied files; SHA-256 preservation evidence in validation-report.json.
- Book pages 6–13, 24, 26, 29–35, 41, 43, 44 and 50; spec sections 03–05, 08, 09, 21–24 and 29; T1–T62; FQ16 and FQ44.

## Machine-readable files

`screen-copy.json` contains the drawn text per phone frame. `copy-contracts.json` retains all handoff 2 entries and adds 197 individually keyed handoff 3 strings under `handoff3`; all new apostrophes are typographic ’. Braced tokens are formatter parameters, not copy to display literally.

`component-contracts.json` retains the handoff 2 definitions and adds `handoff3`. `frame-manifest.json` fixes frame order, logical sizes, scale and source/brand revision. `validation-report.json` records export and preservation checks. `assets/` holds Arimo, licence and unchanged brand masters. Production code uses tokens and native controls, never raster screenshots as UI.

This static export is a design/implementation reference. Authentication, membership, server schedule state, actual device accessibility and network behavior still require implementation and device verification.
