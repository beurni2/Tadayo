# Tadayo handoff 5 - club days and Home

Issued November 3, 2026. Snapshot region en-US, 12-hour clock; travel device zone Europe/London.

## Exact frame order

1. `G04-conflict` - 393 × 852 pt; SVG and 2× PNG.
2. `G04-confirmed-others` - 393 × 852 pt; SVG and 2× PNG.
3. `G04-change` - 393 × 852 pt; SVG and 2× PNG.
4. `G05-schedule-review` - 393 × 852 pt; SVG and 2× PNG.
5. `G05-local-times` - 393 × 852 pt; SVG and 2× PNG.
6. `G05-members-proposed` - 393 × 852 pt; SVG and 2× PNG.
7. `H01-confirm-days` - 393 × 852 pt; SVG and 2× PNG.
8. `H01-travelling` - 393 × 852 pt; SVG and 2× PNG.
9. `H01-unavailable` - 393 × 852 pt; SVG and 2× PNG.
10. `H01-access-lost` - 393 × 852 pt; SVG and 2× PNG.
11. `G06-switcher-status` - 393 × 852 pt; SVG and 2× PNG.
12. `G04-one-day` - 393 × 852 pt; SVG and 2× PNG.
13. `G04-two-days` - 393 × 852 pt; SVG and 2× PNG.
14. `brand-components` - 1200 × 6880 pt; SVG and 2× PNG.

## Delivery and source precedence

The thirteen phone frames follow the exact requested names and order; frame 14 is the complete replacement brand-components. All phone frames are 393 × 852 points with 786 × 1704 PNG exports. No dark or largest-text phone frames are added. The seven-day choices are a single vertical native selection design in G04-one-day, G04-two-days and G04-conflict.

Brand revision 1.1 stays byte-for-byte unchanged: brand-tokens.json, both vector wordmarks and the transparent dark-icon masters. Handoff 4’s cumulative sheet is retained except the two collecting-card specimens whose status lines and locks are corrected; H5 specimens are appended. Earlier entries in both contract JSON files remain exactly as supplied; replacements and additions exist only under handoff5.

Sources were checked in beurni2/Tadayo at commit bd3bd8063fe7726babe45d242265c4d6b2df94bd: design book 2.1, v3 build spec, INVARIANTS T1-T62 and QUESTIONS, especially FQ16/FQ44. Existing 2.1 renders provide visual continuity. The handoff 5 brief supplies its constructed fixtures and Defaults, which govern this work. Handoff 4’s restored pack is the asset and cumulative-contract base.

Snapshots fix the device region to en-US and a 12-hour clock. The travel fixture changes the device zone to Europe/London while retaining that region/clock setting; the club remains America/New_York. Production uses the phone’s native locale/clock formatter and server instants. A person in London does not automatically have a UK region or 24-hour preference.

SVG text is outlined from the included Arimo variable font for portable rendering; iOS uses the system font and native controls. The files are static design references, not a live app, native device run or authorization implementation.


## One day-choice component

The date plaque is omitted from all three G04 choice screens. It identifies a dated occurrence; these are unconfirmed recurring assignments with no promised date yet. G04-one-day therefore changes beyond the brand, as does G04-two-days: both are always supplied, and the pair’s old tile grid becomes the same vertical list as the six-member and contested states.

Available is a plain selectable row with an empty selection circle and no owner. Another member’s proposed day has an owner, an outlined diamond and Proposed words, plus an empty selection circle. Another member’s confirmed day has a quiet surface fill, the owner, check/Confirmed words and no selection control. A viewer’s own choice has surface fill, Name · You, a selected circle and Your choice. Contested adds a neutral outline, the state word and the permitted chooser names. None of these differences depends on colour alone.

Normal choice rows are 64 pt minimum; Contested is 88 pt minimum. Every row uses a 16 pt inset, including the outlined contested row. The outline is inputBorder, the text primaryText/secondaryText, and the selected accessory action/onAction. Destructive is never used for a contested choice. The native List row is the target; the accessory and state glyphs are decorative.

Only confirmed assignments are taken. A proposal belonging to another member can be chosen by an unconfirmed viewer, making that day contested. An abandoned proposal is free: no name appears publicly; the original viewer alone may see the earlier self-proposal hint. No swap, moved person, automatic winner, give-way instruction, chase, countdown or penalty is introduced.

For any number of choosers, the explanation template is “{chooserSentenceList} chose {weekday}.”. chooserSentenceList is a native localized list with You for the viewer and actual authorized names for the others. The help line “You can choose another day, or keep your choice.” works for two or more people. The label template “{weekday}. Contested. {chooserSpeech} Your choice.” uses Contested everywhere. chooserSpeech speaks one visible person field per sentence, with Name, you for the viewer, and no count.

Nobody on a contested day can confirm while another choice remains. It becomes confirmable only when all but one move by their own choice; the remaining person still confirms explicitly. Confirmed other days proceed. Default assessment: a day can remain contested indefinitely. The design makes that understandable without adding pressure to resolve it.

Not now moves to the native navigation bar in the three choice screens, keeping an easy way to leave while preserving choices. The bottom confirmation remains one 50 pt action. This makes room for the full week and the hours/zone without shrinking text. At large text the body scrolls and controls grow.


## Self names and public visibility

Visible person fields use “{personName} · You” for the viewer and the actual name for others. The same person field is spoken with “{personName}, you”. In explanation sentences and status hints use You/your rather than a third-person possessive. An occasion may use Your plus its localized weekday; contextual Add retains the explicit target name. No gender is inferred.

G04-conflict’s first row is free, with Available and the private earlier-self-proposal hint. The contested row includes the viewer’s Name · You plus the other authorized chooser name. The explanation uses You in the chooser list. The example parameters and rendered fixture text are separate from reusable templates.

G04-confirmed-others is the G04 post-confirmation summary, not G05. Maya sees the confirmation title, a read-only public week and Done. Monday names nobody. Friday uses “Contested · No reveal scheduled” and its label “{weekday}. Contested. No reveal scheduled.”. No participant names are serialized into that public row or its accessibility payload, and no action asks Maya to fix it.

The new public Friday key is handoff5.calendar.publicContested, replacing handoff3.G04.conflict.otherFriday wherever that public week appears, including G05. The longer old phrase and its participant names remain only as historical entries in the cumulative file. Current UI selects the H5 key through the replacement map.


## One Sunday row

SundayRow is always a nonselectable row: weekday leading; Revisit above No reveal scheduled in the right column. Its default minimum is 56 pt, with row 17/22 bold titles and metadata 13/18 detail. The same component appears in G04 choices, G04 after confirmation, G04-change and G05. At AX5 it becomes a growing vertical stack.

The one spoken phrase is “{weekday}. Revisit. No reveal scheduled.”. No owner, date, avatar, input circle, activity marker or catch-up prompt is added. It means there is no new Sunday opening; the preceding occurrence may still be open until its own next-morning close. The repeated phrase is not three different definitions of Sunday.


## G04-change and the current week

Keep the person-based comparison because it makes unchanged assignments easiest to compare. Before: two person groups, each with two preserved exact dates. After: three person groups, followed by the common SundayRow. Drawn groups and VoiceOver groups are identical; no seven invisible weekday elements remain.

The two preserved groups speak “{personSpeech}. {firstFullDate} and {secondFullDate}. Announced dates unchanged.”. The unchanged future groups speak “{personSpeech}. {weekdayList}. Unchanged.”; the new future assignment speaks “{personSpeech}. {weekdayList}. Proposed from {fullStartDate}.”. At AX5 each group’s dates or weekdays stack within the same semantic group. The order remains the visible person order, not a different chronological or seven-row accessibility order.

The preserved dates and exact future boundary remain the supplied fixture. Nothing says which dates have drops. Current days continue until all active members, including the new member, confirm the same proposal. If the proposed start passes, produce a fresh future version and require a fresh review; no backdating or silent carry-over of confirmations.

G05-schedule-review displays only the current pair’s assignments. The newly joined member is in the actual roster and proposed future week, not assigned to an unused current weekday. The top row “Review the club’s days” with “Proposed from {fullStartDate}” opens the viewer’s G04-change. It has no count or list of confirmations, no badge and no Home reminder.

The week remains read-only. Assigned rows are 48 pt minimum with one real line and no reserved blank subtitle. Rows with actual second-line information, including Sunday and a public contested day, are 56 pt minimum. Unused weekdays say No reveal scheduled. Name · You uses the bold row role, not regular. The zone line uses metadata 13/18 secondaryText consistently with Friends and G04-change.


## The first days after activation

H01-confirm-days is an explicit active-club state before any day is confirmed. Its main content has no person, date or countdown. “The club’s week will appear here after a day is confirmed.” explains why; Choose your day opens G04-one-day for this fixture. In a two-day cadence the action uses the plural variant. The club bar, own account control and all tabs remain reachable.

Before a collecting day exists, + Add offers Private draft then Open my drafts. It does not manufacture an occurrence, upload destination, example reveal or remembered recipient. The own account photograph is global account identity, not club content or an announced star.

Under the explicit Default, members who join before the first confirmation belong to the initial proposed week. Confirmation uses the latest roster/schedule revision. Each assignment goes ahead once its owner confirms it; the first confirmation makes Home show the next confirmed occurrence. A member joining after that uses the all-active-member change process.

If the viewer’s own initial days are still unconfirmed, the route remains in Friends → See schedule or Club details → Schedule. A viewer-only Choose your day(s) row opens the personal G04 choice. Home keeps the next confirmed day; no badge, push, reminder, count or list of unconfirmed members is added. Default assessment: this gives an early usable week but requires a clear distinction between the active roster and actual scheduled assignments.


## Travel and dated local times

Keep G05-local-times as a native scrolling sheet. Home communicates one next opening; the sheet communicates opening and closing dates for all next authorized occurrences. View local times remains available when the viewer is not travelling. If both zones are equal, show one time block per occurrence rather than duplicate equivalent values.

The sheet uses the server’s actual reveal_at and close_at values for each occurrence, then native region/clock formatting into both zones. New York remains visible beside London. It is not a permanent offset attached to a recurring weekday. The full list and semantic labels are included in screen-copy.json; the PNG is the first scroll viewport, not a claim that all rows fit simultaneously.

H01-travelling represents the supplied server instant, with the actual device clock in London. The waiting card puts the London opening first and the New York equivalent beneath it. The countdown is the same 5h 59m as the club-zone view. Add and See captions target the same exact next collecting occurrence; the closed prior day’s revisit names its person, never an inferred pronoun.

Friends while travelling shows a local full date, local opening time and device-zone label on its first metadata line; the second line shows the club opening time and zone, including the club date when dates differ. Rows grow instead of reducing the text. F02 shows the local dated opening and the club dated equivalent. Both preserve the same occurrence ID, audience and cutoff.

The templates are friends.date.travelling, friends.date.club, friends.row.travelling.vo, upcoming.local and upcoming.club under handoff5. Current fixture examples live beside the templates. A collecting card in a travelling F02 uses a labelled local line and labelled club line, so it remains understandable after the day header scrolls away.

Format opening and closing independently. The device zone changes representation, never access, the cutoff or the shared countdown. DST can change the travel-zone relationship between an occurrence’s opening and closing. The specified October and March opening ranges and their boundaries are checked against IANA zone data in validation-report.json.


## Unavailable, lost access and switching

H01-unavailable and H01-access-lost are explicit denials, not empty states. The header uses Choose a club rather than a denied club name. The failed navigation identity remains internal so the app does not silently change context, but no cached club record is used to paint a title, person, date, caption, image or memory.

Only global account identity remains: the own account avatar and account route are independent of club media. + Add offers Private draft then Open my drafts, without selected-club targets. A different eligible club is chosen explicitly. Friends and Memories show the same neutral selected-context denial; no roster, history, example, stale tile or other club’s data appears.

Club unavailable uses the requested neutral title and body with Choose a club and Get help. Get help opens the configured Tadayo support contact through a native contact route; no address is invented. Access lost uses its requested neutral copy and Choose a club, without explaining a departure, moderation reason, actor or duration.

G06-switcher-status omits people counts beside both Not started and Paused. Those labels are plain secondary text; the selected club has the native checkmark and selected trait. This avoids confusing a proposed roster with active members. No next date, countdown, lock or cover colour communicates status.

The visible label for an unavailable club is Unavailable. It is shown only when the authorized club listing still includes that identity; a revoked club is absent from the listing. The status label template is “{clubName}. {stateLabel}.”. Opening another club is always an explicit selection. Club details, Create a club and Cancel remain the ordinary sheet actions.

The sheet is shown over H01-awaiting-activation with the H5 spacing rules. Native modal dimming is presentation chrome, not an image tint/filter; the original own-account photo bytes are unchanged. Background controls are hidden from accessibility while the sheet is modal.


## A paused club with an own announced day

This contract covers only the remaining member’s own already announced occurrence(s). Home shows the usual waiting or open own day until that occurrence closes. It does not replace the day with the paused message early. The ordinary occasion/date/time/countdown wording is reused, with all actual values from the server.

Before that own day opens, + Add offers that exact collecting target. After it opens, submission to it is closed: Add offers the next own announced collecting day if one exists; otherwise it offers Private draft then Open my drafts. When no own announced occurrence remains, use the paused Home. Do not generate a fresh day simply to fill it.

The reusable paused explanation is “{clubName} needs another member for new days.”. Club details gets an authorized Invite someone row below Members and above Schedule, visible when proposal permission and capacity allow it. It opens the contextual per-person invitation-name flow for that club, followed by exact-roster acceptance and required approvals. It does not grant access to a creator-only invitation list merely because only one member remains.

An accepted and approved invitation can restart the club through the valid schedule process. Creating or sharing a link alone does not restart it. The invitation row is available in details, not a recurring Home prompt. No additional outcome rule is introduced outside this own-announced-day scope.


## Accessibility labels and loading

All control labels begin with the visible words. Longer explanations are separate hints. Native selected/disabled/focus traits remain native. This applies both to the drawn controls and the requested earlier-label replacements. An icon-only native Back or Account control retains its descriptive system name.

Not now, View local times, + Add, Review members, View Memories, I have an invite, Continue, Done for now and Close invitation now have exact visible-word labels. Their prior explanatory wording moves to a hint. The replacement map names each earlier H3/H4 key. The Private drafts and selected-club selectors receive the same prefix correction.

The Decline template is “Decline {candidateName} joining {clubName}.”, parallel to “Approve {candidateName} joining {clubName}.”. The optional hint gives the existing no-reason rule. Loading Home’s visible and announced label is exactly “Loading Home…”; club context can be a separate optional hint. Announce entry once, keep the native indicator unfocusable, and do not repeat it while waiting.

Row person fields speak Name, you rather than Name’s day for the viewer. Public contested-day labels never contain participant names. The G04-change semantic groups match the actual drawn person groups at default and largest text. Every control target is at least 44 pt; whole native rows are the selection targets and status/accessory glyphs are decorative.


## Spacing and collecting-card status

H5 measures spacing between line boxes rather than mixing baselines, glyph bounds and row pitches. Home and pending title-to-body use 24 pt; body-to-secondary content uses 16; section gaps use 24. This replaces the earlier fixed large title/body placements rather than codifying a 77 pt exception. The current Home states and the switcher’s background follow it.

G04-change’s two person-row pitches become one 48 pt minimum in both blocks. Its sections use 12/8 pt gaps; meaningful subtitle lines retain their type-role line metrics. G05 assigned rows become 48 pt with one real line, while a real subtitle uses 56. The no-club primary/secondary buttons use a 16 pt gap, not 17. These are replacement contracts for the earlier H3/H4 references, not edits to the archived frames.

Pinned footers reserve at least a 16 pt body gap, which may become flexible extra space in a short state. Primary and secondary action targets have an 8 pt gap. At AX5 the body scrolls, rows and footer labels grow, and the header may stack; no text is shrunk, capped or clipped to preserve decoration.

Both collecting-card specimens now use a 12 pt lock, 8 pt gap and one common 13/18 status role. The status fields are Opens, exact wide weekday/month/date, a middle dot and the formatted opening time. Year is included when needed; the standalone specimens include it. The template is “Opens {fullDate} · {openTime}”. The lock appears only while content is hidden.

Normal club-context cards use club time. A travelling card uses the labelled local opening line plus the labelled club equivalent from the two travelling templates. A long status wraps and increases the card height. The 18 pt card inset and 16 pt status-to-caption gap are explicit. Sender names use the existing row role. No new colour or photograph treatment is introduced.


## Cumulative copy and validation

Every earlier entry in copy-contracts.json and component-contracts.json remains exactly equal to handoff 4. New and replacement entries exist only under handoff5. The copy replacement map points from old keys to current keys, and the reverse provenance index marks each new template as new, replacement or example. Do not render historical keys merely because they remain in the catalogue.

Reusable UI has parameters for names, club, weekdays, dates, times and zones. Snapshot values appear in screen-copy.json or in the template examples, not hard-coded into reusable text. Native ListFormatter supplies person/day lists; native date/time formatting supplies wide weekday/month text and the device’s clock format. The only fixed photo caption is explicitly a supplied-content example.

The requested old hour/zone strings are all covered: G04.conflict.clubZone; G05.schedule hours, hoursZone, hoursVO and day labels; all F01 dates/row labels; members.footer.hours; and sheet.card.status. The prior member-footer fixture examples remain unchanged, as requested. The old public Friday participant line is replaced wherever the public week is used.

Export checks cover exact titles/order and dimensions, full 2× PNG decoding, unchanged brand masters, cumulative subtree equality, replacement targets, template hygiene, visible-label prefixes, minimum targets, semantic/drawing agreement, forbidden identities in denied/public-contested states, original photo bytes, contrast and actual time-zone arithmetic. Every PDF page is rendered and visually reviewed.

Dark and AX5 checks are design-time token/metric checks plus explicit native reflow contracts. No extra dark or XL phone frames are exported. Native Dynamic Type, VoiceOver, support routing, live server authorization and state transitions still need real device/service verification. No live club, schedule, invitation or account was changed by producing this pack.


## Old-to-new copy replacements

| Earlier key | Current key |
|---|---|
| `handoff3.G04.conflict.clubZone` | `handoff5.calendar.clubZone` |
| `handoff3.G05.schedule.hours` | `handoff5.calendar.hours` |
| `handoff3.G05.schedule.revealHoursZone` | `handoff5.calendar.hoursZone` |
| `handoff3.G05.schedule.hoursVO` | `handoff5.calendar.hours.vo` |
| `handoff3.G04.conflict.status` | `handoff5.calendar.state.contested` |
| `handoff3.G04.conflict.explanation` | `handoff5.calendar.contested.explanation` |
| `handoff3.G04.conflict.help` | `handoff5.calendar.contested.help` |
| `handoff3.G04.conflict.monday` | `handoff5.calendar.earlierSelfProposal` |
| `handoff3.G04.conflict.otherFriday` | `handoff5.calendar.publicContested` |
| `handoff3.G05.schedule.sunday` | `handoff5.calendar.sunday.title` |
| `handoff3.G05.schedule.sundayDetail` | `handoff5.calendar.sunday.detail` |
| `handoff3.G04.conflict.notNow.vo` | `handoff5.a11y.notNow` |
| `handoff3.G05.schedule.localAction.vo` | `handoff5.a11y.localTimes` |
| `handoff3.header.addPrivate.vo` | `handoff5.a11y.addPrivate` |
| `handoff4.noClub.add.vo` | `handoff5.a11y.addPrivate` |
| `handoff3.header.add.vo` | `handoff5.a11y.add` |
| `handoff3.H01.awaiting.action.vo` | `handoff5.a11y.reviewMembers` |
| `handoff4.pending.primary.vo` | `handoff5.a11y.reviewMembers` |
| `handoff3.H01.paused.action.vo` | `handoff5.a11y.viewMemories` |
| `handoff4.noClub.invite.vo` | `handoff5.a11y.haveInvite` |
| `handoff4.link.continue.vo` | `handoff5.a11y.continue` |
| `handoff4.invite.done.vo` | `handoff5.a11y.doneForNow` |
| `handoff4.unavailable.primary.vo` | `handoff5.a11y.closeInvitation` |
| `handoff4.approval.decline.vo` | `handoff5.a11y.decline` |
| `handoff4.approval.primary.vo` | `handoff5.a11y.approve` |
| `handoff3.drafts.vo` | `handoff5.a11y.drafts` |
| `handoff4.drafts.vo` | `handoff5.a11y.drafts` |
| `handoff3.header.clubSelector.vo` | `handoff5.header.club.vo` |
| `handoff3.H01.loading.vo` | `handoff5.loading.label` |
| `handoff3.H01.loading.visible` | `handoff5.loading.label` |
| `handoff3.H01.loading.sundayVO` | `handoff5.loading.label` |
| `handoff4.members.footer.hours` | `handoff5.members.footer.hours` |
| `handoff4.sheet.card.status` | `handoff5.card.status` |
| `handoff3.H01.paused.body` | `handoff5.paused.body` |
| `handoff3.G05.schedule.vo.Monday` | `handoff5.schedule.row.vo` |
| `handoff3.G04.change.vo.Monday` | `handoff5.change.proposedRow.unchanged.vo` |
| `handoff3.G04.conflict.vo.Monday` | `handoff5.calendar.row.earlierSelf.vo` |
| `handoff3.G05.schedule.vo.Tuesday` | `handoff5.schedule.row.vo` |
| `handoff3.G04.change.vo.Tuesday` | `handoff5.change.proposedRow.unchanged.vo` |
| `handoff3.G04.conflict.vo.Tuesday` | `handoff5.calendar.row.confirmed.vo` |
| `handoff3.G05.schedule.vo.Wednesday` | `handoff5.schedule.row.vo` |
| `handoff3.G04.change.vo.Wednesday` | `handoff5.change.proposedRow.unchanged.vo` |
| `handoff3.G04.conflict.vo.Wednesday` | `handoff5.calendar.row.confirmed.vo` |
| `handoff3.G05.schedule.vo.Thursday` | `handoff5.schedule.row.vo` |
| `handoff3.G04.change.vo.Thursday` | `handoff5.change.proposedRow.unchanged.vo` |
| `handoff3.G04.conflict.vo.Thursday` | `handoff5.calendar.row.confirmed.vo` |
| `handoff3.G05.schedule.vo.Friday` | `handoff5.schedule.row.vo` |
| `handoff3.G04.change.vo.Friday` | `handoff5.change.proposedRow.unchanged.vo` |
| `handoff3.G04.conflict.vo.Friday` | `handoff5.calendar.row.contested.vo` |
| `handoff3.G05.schedule.vo.Saturday` | `handoff5.schedule.row.vo` |
| `handoff3.G04.change.vo.Saturday` | `handoff5.change.proposedRow.unchanged.vo` |
| `handoff3.G04.conflict.vo.Saturday` | `handoff5.calendar.row.confirmed.vo` |
| `handoff3.G05.schedule.vo.Sunday` | `handoff5.calendar.sunday.vo` |
| `handoff3.G04.change.vo.Sunday` | `handoff5.calendar.sunday.vo` |
| `handoff3.G04.conflict.vo.Sunday` | `handoff5.calendar.sunday.vo` |
| `handoff3.F01.date.Ben` | `handoff5.friends.date` |
| `handoff3.F01.row.vo.Ben` | `handoff5.friends.row.vo` |
| `handoff3.F01.date.Maya` | `handoff5.friends.date` |
| `handoff3.F01.row.vo.Maya` | `handoff5.friends.row.vo` |
| `handoff3.F01.date.Alex` | `handoff5.friends.date` |
| `handoff3.F01.row.vo.Alex` | `handoff5.friends.row.vo` |
| `handoff3.F01.date.Sam` | `handoff5.friends.date` |
| `handoff3.F01.row.vo.Sam` | `handoff5.friends.row.vo` |
| `handoff3.F01.date.Debby` | `handoff5.friends.date` |
| `handoff3.F01.row.vo.Debby` | `handoff5.friends.row.vo` |
| `handoff3.F01.date.Nina` | `handoff5.friends.date` |
| `handoff3.F01.row.vo.Nina` | `handoff5.friends.row.vo` |
| `handoff3.G04.change.preserved.vo.Monday` | `handoff5.change.preservedRow.vo` |
| `handoff3.G04.change.preserved.vo.Thursday` | `handoff5.change.preservedRow.vo` |
| `handoff3.G04.change.preserved.vo.Tuesday` | `handoff5.change.preservedRow.vo` |
| `handoff3.G04.change.preserved.vo.Friday` | `handoff5.change.preservedRow.vo` |

## Fixture examples beside templates

| Template key under handoff5 | Rendered fixture example |
|---|---|
| `calendar.clubZone` | Sunday people · New York |
| `calendar.hours` | 7 AM to 1 AM the next morning |
| `calendar.contested.explanation` | You and Debby chose Friday. |
| `calendar.row.contested.vo` | Friday. Contested. Ben, you. Debby. Your choice. |
| `calendar.publicContested.vo` | Friday. Contested. No reveal scheduled. |
| `change.startDate` | Monday, November 16, 2026 |
| `friends.date` | Monday, November 9 · 7 AM |
| `card.status` | Opens Friday, November 13, 2026 · 7 AM |
| `a11y.decline` | Decline Leila joining Kitchen table. |
| `calendar.person.self` | Ben · You |
| `home.localOpening` | Opens 12 PM · London |
| `home.clubOpening` | 7 AM · New York |
| `friends.date.travelling` | Saturday, November 7 · 12 PM · London |
| `friends.date.club` | 7 AM · New York |
| `upcoming.local` | Opens Saturday, November 7, 2026 · 12 PM · London |
| `upcoming.club` | Saturday, November 7, 2026 · 7 AM · New York |

## Sources

- [docs/tadayo-design-book-2.1.md](https://github.com/beurni2/Tadayo/blob/bd3bd8063fe7726babe45d242265c4d6b2df94bd/docs/tadayo-design-book-2.1.md)
- [docs/tadayo-build-spec-v3.md](https://github.com/beurni2/Tadayo/blob/bd3bd8063fe7726babe45d242265c4d6b2df94bd/docs/tadayo-build-spec-v3.md)
- [docs/INVARIANTS.md](https://github.com/beurni2/Tadayo/blob/bd3bd8063fe7726babe45d242265c4d6b2df94bd/docs/INVARIANTS.md)
- [docs/QUESTIONS.md](https://github.com/beurni2/Tadayo/blob/bd3bd8063fe7726babe45d242265c4d6b2df94bd/docs/QUESTIONS.md)
- Handoff 4 pack and corrections PDF, cumulative H1–H3 definitions and specimens retained.
- Book pages 6, 7, 10–13, 24, 26, 29, 32–35, 41 and 50; spec 03–05, 08–09, 22, 24 and 29; handoff 5 explicit Defaults.

This delivery changes no repository file or live account. The static fixture photographs are the existing book assets, for reference/development use.
