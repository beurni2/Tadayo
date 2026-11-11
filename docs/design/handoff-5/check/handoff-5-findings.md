# Design handoff 5: every finding, with its evidence

*4 November 2026. The evidence behind `handoff-5-check.md`. Five independent reviews read the delivery, each through one lens. A second reviewer then tried to refute each of the 97 findings: none was refuted, 69 were confirmed and 28 corrected (the corrected version is the one shown). The second reviewers added 20 findings they found themselves (ids with M), and a completeness critic added 11 more (ids C-) and disputed six actions (last section). Severity: must = breaks an invariant, the spec, a Default or the brief, or would mislead the build; should = a real gap the build or a later brief must handle; note = worth recording. "Who" says who acts: app (Claude Code, or the ios thread recording something), claude-design (a later brief), founder, or none. Where two findings describe one issue, section 8 of the report says which action the app takes.*


## Frames: the 13 numbered items of the brief

**Summary.** All 13 frames arrived in the order the brief asked for. Each one draws its item's state, viewer and fixture, and I checked the date arithmetic myself. November 2026 weekdays are right. The London times of 12 PM and 6 AM are right. H01-travelling's server_now 06:01Z, opening 12:00Z and 5h 59m all agree. FQ46, FQ48, FQ54 and FQ55 are drawn as the brief states them. Only the choosers see names on a contested day. Maya sees "Contested / No reveal scheduled". Monday names nobody except in Ben's view ("Proposed for you"). A proposed day ("Proposed" with a diamond and an empty circle) looks different from a confirmed one (fill, a check, "Confirmed" and no selector). The FQ56/57 and FQ50 answers are in writing. One finding is a must: H01-travelling's countdown VoiceOver label speaks a duration, "5 hours 59 minutes until opening.", rather than its target date, which T47 and book p26 forbid. The should findings, by kind: two missing or broken templates: the contested row's names, and "New York and New York". One misleading line of copy on H01-confirm-days. Member names placed where the club's name goes on G04-two-days. Changes the brief didn't ask for: Not now moved into the navigation bar; G04-change's label, its divider and the Sunday row's left edge; the G05 week geometry; the past-day card. And old handoff 3 keys left current although they contradict the new frames. One decision is for the founder: frames 12 and 13 replace the book's G04 screens and drop the MON 09 plaque, the "Your Monday." headline and the book's other lines.


**What was delivered, item by item**

- **1. G04-conflict (redraw).** Uses the one day-choice design. Monday reads 'Available' and 'Proposed for you' with an empty circle. Tuesday, Wednesday, Thursday and Saturday (Maya, Alex, Sam, Nina) read 'Confirmed' with fill and a check, and have no selector. Friday reads 'Contested' with a neutral outline (#778579, not destructive) and a 16-pt inset, showing 'Ben · You and Debby' and 'Your choice' with a selected circle. Added: 'Sunday people · New York' and '7 AM to 1 AM the next morning'. The explanation is 'You and Debby chose Friday.' and the help line 'You can choose another day, or keep your choice.'. Confirm Friday is disabled. 'Contested' is the one name for the state. In writing: the plaque doesn't belong on this screen, plus templates for three or more choosers. Not now moved (F-07).
- **2. G04-confirmed-others.** Drawn as the G04 screen after confirming, which answers the question about G04 or G05. Viewer Maya; the row reads 'Maya · You'. Monday reads 'No reveal scheduled' and names nobody. Friday reads 'Contested' and 'No reveal scheduled', with the label 'Friday. Contested. No reveal scheduled.'. handoff5.calendar.publicContested replaces handoff3.G04.conflict.otherFriday. There is a Done button, and no names, counts or requests to act.
- **3. G04-change (redraw).** Keeps the grouping by person, and the VoiceOver groups now match what is drawn: two kept groups, three proposed groups, then SundayRow. Person rows sit 48 points apart, which the spacing question asked for. Other changes nobody asked for are in F-08.
- **4. G05-schedule-review.** Shows the pair's current week: Ben on Monday and Thursday ('Ben · You', bold), Debby on Tuesday and Friday, Wednesday and Saturday 'No reveal scheduled', Sunday 'Revisit'. No club name. 'Review the club’s days' / 'Proposed from Monday, November 16, 2026' sits at the top. It is read-only, with View local times. In writing: Maya isn't shown in the current week.
- **5. G05-local-times.** The sheet is kept, as a scrolling native sheet. It lists Nina Saturday 7, Your Monday 9, Maya Tuesday 10, Alex Wednesday 11, Sam Thursday 12 and Debby Friday 13 November 2026, each with opening and closing times in New York (7 AM to 1 AM) and London (12 PM to 6 AM). All are correct. In writing: View local times stays for members who aren't travelling. Friends and F02 templates for a travelling member are given.
- **6. G05-members-proposed.** 'Proposed roster' for Sunday people, with the line 'These names are a proposal, not an active member list.'. Ben's row reads 'Ben · You' with Ben's photograph; M, A, S, D and N show as initials. No weekday, status or count. Manage invitations is the action.
- **7. H01-confirm-days.** Club bar and tabs as on H01-waiting. Title 'The club’s days', body 'The club’s week will appear here after a day is confirmed.' (see F-04), and 'Choose your day', which opens G04-one-day. + Add's hint is 'Save a private draft or open private drafts.'. No person, date or countdown. In writing: Ben's own confirmation waits in Friends → See schedule and in Club details → Schedule.
- **8. H01-travelling.** The status bar reads 6:01, in London. 'Up next' and 'Nina’s Saturday', the plaque SAT 07, 'Saturday, November 7', 'Opens 12 PM · London', '7 AM · New York' and '5h 59m until opening'. The countdown matches New York's. Add for Nina, See captions, and 'Revisit Debby’s Friday' (FQ20).
- **9. H01-unavailable.** The club bar reads 'Choose a club'. 'Club unavailable' and 'This club isn’t available right now.', with Choose a club and Get help (hint 'Contact Tadayo support.'). No club content and no lock. In writing: Friends and Memories show the same denial, + Add offers only private drafts, and the club bar doesn't keep the club's name.
- **10. H01-access-lost.** 'This club is no longer available.' and 'Choose a club to continue.', with Choose a club. The club bar reads 'Choose a club'. No reason, and nothing of Kitchen table is shown.
- **11. G06-switcher-status.** The sheet sits over H01-awaiting-activation. Sunday people reads 'Not started', selected with a checkmark; Kitchen table reads 'Paused'. Both are plain secondary text with no people count. Club details, Create a club and Cancel follow. The visible word for an unavailable club is 'Unavailable'.
- **12. G04-one-day (redraw of 2.1).** Uses the one design. Monday reads 'Ben · You' and 'Your choice', selected. Tuesday to Saturday (Maya, Alex, Sam, Debby, Nina) read 'Proposed' with a diamond and are choosable. Sunday row added. Confirm Monday is enabled. The plaque is omitted, so the frame changes beyond the brand (F-05).
- **13. G04-two-days (redraw of 2.1).** Uses the one design as a vertical list. Monday and Thursday read 'Ben · You' and 'Your choice'. Debby's Tuesday and Friday read 'Confirmed' with no selector. Wednesday and Saturday read 'Available'. Sunday row added. The button reads 'Confirm Monday and Thursday'. The frame changes beyond the brand (F-05, F-06).

**Findings**

### F-01 · must · claude-design · confirmed

- **State:** H01-travelling (item 8)
- **Rule:** T47: 'A countdown announces its target date, not every tick.' Book p26: 'Countdowns announce the target date instead of speaking every minute.'
- **Finding:** The countdown's VoiceOver label speaks a duration that changes as time passes, not the opening it counts down to. The reusable template does the same, so every waiting Home would inherit it.
- **Evidence:** H01-travelling.svg aria-label="5 hours 59 minutes until opening.". New key handoff5.home.countdown.vo = '{durationSpoken} until opening.' (provenance 'new'), with no date or time parameter.
- **What the app does, and who acts:** Meanwhile the app labels the countdown with the target opening, taken from the server's reveal_at and formatted under FQ44. While travelling, the label gives the local opening, then the club opening. It never speaks the ticking duration. The next brief asks for a template that names the target date.

### F-02 · should · claude-design · confirmed

- **State:** G04-conflict (item 1)
- **Rule:** Brief item 1: Ben's own row reads 'Ben · You', and the copy for three or more choosers. Return: 'Write every reusable string as a template'.
- **Finding:** The contested row's line of names has no key. It joins the self marker to a list, so it can read as 'Ben · (You and Debby)'. No rule covers three or more choosers or Debby's view. Only the explanation, the help line and the VoiceOver label have templates.
- **Evidence:** 'Ben · You and Debby' is drawn at (36, 587). The handoff5 keys are calendar.contested.explanation '{chooserSentenceList} chose {weekday}.', calendar.row.contested.vo '{weekday}. Contested. {chooserSpeech} Your choice.', calendar.person.self '{personName} · You' and calendar.person.other '{personName}'. No key exists for the visible chooser line. component-contracts selfName gives rules for prose and for VoiceOver only.
- **What the app does, and who acts:** Meanwhile the app draws the two-chooser line as the frame does. For three or more choosers, it lists each person field (calendar.person.self or calendar.person.other) with the system list formatter. It speaks calendar.row.contested.vo. The next brief asks for the template and its form in each chooser's view.

### F-03 · should · claude-design · confirmed

- **State:** G05-schedule-review (item 4); G05-local-times entry
- **Rule:** The delivery's own rule: 'If both zones are equal, show one time block per occurrence rather than duplicate equivalent values.' Brief: plain voice.
- **Finding:** For a member who isn't travelling, the View local times hint names the same zone twice. The delivery's own rule says equal zones should show one zone.
- **Evidence:** screen-copy.json G05-schedule-review, View local times hint: 'Show dated opening and closing times in New York and New York.'. Template handoff5.schedule.localAction.hint = 'Show dated opening and closing times in {clubZoneName} and {deviceZoneName}.'. localTimesSheet.entry: 'equal zones show one block per occurrence.'
- **What the app does, and who acts:** Meanwhile the app uses the hint only when the two zones differ and leaves it out when they're equal. The label stays 'View local times'. The next brief asks for a one-zone form.

### F-04 · should · claude-design · confirmed

- **State:** H01-confirm-days (item 7)
- **Rule:** Item 7's Default: 'Once any day is confirmed, Home shows the next confirmed day, as H01-waiting does'. T49: truthful states.
- **Finding:** The body says the club's week will appear on Home. Under the Default, and under the delivery's own firstDays contract, Home will show the next confirmed day (Up next, person, date, countdown), not the week.
- **Evidence:** handoff5.home.confirm.body = 'The club’s week will appear here after a day is confirmed.' component-contracts firstDays.whenFirstConfirms: 'Home resolves to the next confirmed occurrence'. 2.1 H01-waiting shows 'UP NEXT / Debby’s Friday', not a week.
- **What the app does, and who acts:** Meanwhile the app builds the state as the Default says: after the first confirmation, Home is the next confirmed occurrence. It uses the delivered words until new ones arrive and records the mismatch in INVENTORY. The next brief asks for a body line that matches what Home will show.

### F-05 · should · founder · adjusted

- **State:** G04-one-day and G04-two-days (items 12, 13)
- **Rule:** FQ2: 'the 53 screens of 2.1 stay the reference … The founder can replace any 2.1 screen'. Book p6: 'Use one small weekday/date plaque'. Book p10 and p11. CLAUDE.md, 'Nothing generic': the dated day, the weekday plaque.
- **Finding:** The redraws switch to the one day-choice list, as asked. They also drop book copy and objects the brief didn't ask to change. G04-one-day loses the 'Your Monday.' headline, 'A day for your friends to collect things for you.', the MON 09 plaque, 'THE CLUB’S WEEK' and 'One shared opening time.'. G04-two-days loses 'Choose your two days.' (now 'Choose your days') and the same subtitle. Claude Design answered the plaque question by leaving the plaque out. Whether the redraws replace the book's screens in this form is the founder's call.
- **Evidence:** 2.1 G04-one-day: 'Your Monday.', 'A day for your friends to collect things for you.', MON 09 plaque, 'THE CLUB’S WEEK', 'New York · One shared opening time.'. h5 G04-one-day: 'Choose your day', 'Sunday people · New York', 'Choose an available day, then confirm.', 'You can change your choice before confirming.'. 2.1 G04-two-days: 'Choose your two days.', 'A day for your friends to collect things for you.'. h5: 'Choose your days', 'Choose two days that work for you.'. dayChoiceRow: datePlaque false, plaqueReason 'A recurring unconfirmed assignment is not an announced dated occurrence.'. Brief: 'A redraw keeps everything else in the earlier frame as it was.'
- **What the app does, and who acts:** Meanwhile the app builds the one day-choice design from handoff 5, as the brief asked. It keeps the 2.1 renders as the reference and marks both INVENTORY rows 'redrawn 5, awaiting the founder'. The founder decides whether these redraws replace the book's screens without the plaque, the headlines and the subtitle.
- **Second reviewer's correction:** The losses are real, but the evidence mixes them with changes the brief asked for. Item 1 asked for one day-choice design for all three screens, so the list replacing the tile grid is what was asked. One Sunday form was also asked, so the SundayRow in place of 'Sunday is for revisiting.' follows from the brief. The zone still shows, through calendar.clubZone. 'Confirm Monday and Thursday' follows calendar.confirm '{weekdayList}', as on handoff 3's 'Confirm Friday'. What goes beyond the brief, which says 'A redraw keeps everything else in the earlier frame as it was', is the book's own copy and objects. Both 2.1 headlines are replaced by the one choice title, 'A day for your friends to collect things for you.' is dropped from both, and G04-one-day loses the MON 09 plaque, 'THE CLUB’S WEEK' and 'One shared opening time.'. The plaque question was delegated to Claude Design, which answered it with a reason. The founder still decides whether the redraws replace the book's screens without these lines (FQ2; CLAUDE.md, 'Nothing generic').

### F-06 · should · app · confirmed

- **State:** G04-two-days (item 13)
- **Rule:** Spec 04: Ben 'names it', so every club has a name. Spec 03: 'The top bar displays the active club name'. Finding R-05 of the earlier check and handoff 4's 'Do not invent a pair club name'.
- **Finding:** The redraw puts the members' names where the club's name goes and adds a reusable template for it. No rule says when it replaces calendar.clubZone.
- **Evidence:** Drawn: 'Ben and Debby · New York'. New key handoff5.calendar.peopleZone = '{memberNames} · {clubZoneName}', beside calendar.clubZone = '{clubName} · {clubZoneName}'. Handoff 4 membersFooter.unnamedPair: 'No invented club name. 2 members · New York'. 2.1 drew 'A two-person club · Ben and Debby'.
- **What the app does, and who acts:** Meanwhile, as for R-05, the app uses calendar.clubZone with the club's own name on all three day-choice screens. It records 'Ben and Debby' and peopleZone in INVENTORY's Known differences as a stand-in for the fixture.

### F-07 · should · claude-design · confirmed

- **State:** G04-conflict (item 1); also G04-one-day and G04-two-days
- **Rule:** Brief: 'A redraw keeps everything else in the earlier frame as it was.'
- **Finding:** Not now moved from handoff 3's bottom secondary action into the navigation bar, next to the Back chevron. It was also added to 2.1's two screens, which had only Back. G04-change keeps Not now at the bottom, so G04 now places it in two ways. Nothing says what Back does that Not now doesn't.
- **Evidence:** h3 G04-conflict: Not now at the bottom, baseline 800. h5: 'Not now' rect [295,54,86,44] beside 'Back' rect [8,54,44,44], hint 'Keep your current choices and return.'. h5 G04-change: Not now rect [20,782,353,44]. IMPLEMENTATION.md: 'Not now moves to the native navigation bar in the three choice screens'.
- **What the app does, and who acts:** Meanwhile the app builds the delivered redraw, since the move is disclosed and makes room for content the brief asked for. It records the change in INVENTORY. The next brief asks for one place for Not now across G04, and for the difference between Back and Not now.

### F-08 · should · claude-design · adjusted

- **State:** G04-change (item 3)
- **Rule:** Brief: 'A redraw keeps everything else in the earlier frame as it was'. Return: name the earlier key each replacement replaces.
- **Finding:** Beyond what was asked (matching VoiceOver groups, the 48-pt pitch and SundayRow), the redraw changes four things. (a) The section label now reads 'Current days through…', the wording of handoff 3's own G04.change.currentThrough, but its provenance names no earlier key. (b) The divider under the header block is gone. (c) The Sunday row starts at a different left edge from every other line. (d) Not now reuses the day-choice hint about 'choices'.
- **Evidence:** (a) h3 'Through Sunday, November 15' (handoff3.G04.change.before) is now 'Current days through Sunday, November 15'. handoff3.G04.change.currentThrough = 'Current days through {fullLastDate}'. handoff5.change.before has provenance 'new', replaces []. (b) The h3 divider at y=319 (x 20 to 373) is gone; h5 dividers are at y=447 and y=680 only. (c) 'Sunday' x=36, 'Revisit' x=164, divider y=680 runs x 36 to 357; person groups at x=20. (d) Not now hint: 'Keep your current choices and return.'
- **What the app does, and who acts:** Meanwhile the app builds the delivered redraw with the shared SundayRow and the handoff5.change.* keys. It treats change.before as replacing handoff3.G04.change.before and records (a) to (d) in INVENTORY as differences from handoff 3. The next brief asks for one left edge for the Sunday row, the missing provenance and a Not now hint that fits this screen.
- **Second reviewer's correction:** Points (b) and (c) check out. In h3's G04-change, dividers run at y=319 and y=471, both x 20 to 373. In h5, the only dividers are y=447 (x 20 to 373) and y=680 (x 36 to 357). 'Sunday' sits at x=36 and 'Revisit' at x=164, while every person group starts at x=20. Point (a) needs correcting. 'Current days through {fullLastDate}' isn't new wording: handoff 3 already has it as G04.change.currentThrough. The real gap is that handoff5.change.before (provenance new, replaces []) names neither handoff3.G04.change.before nor G04.change.currentThrough. Point (d) is minor: Ben's current weekdays are the earlier choices, so the hint isn't false, only borrowed from the day-choice screens.

### F-09 · note · app · adjusted

- **State:** G05-schedule-review (item 4), against handoff 3's G05-schedule
- **Rule:** Brief: asked only for 'Ben · You' in the row role, bold, the zone line's role, and one form for Sunday. handoff5 'replaces' handoff3.G05WeekView with handoff5.weekRows.
- **Finding:** G05's week now uses the day-choice geometry. G05-schedule itself wasn't redrawn, so its handoff 3 frame is superseded for its rows. The replacement map and frame 4 already give the current rules.
- **Evidence:** h3 G05-schedule: weekday x=20, 'Ben · You' right-aligned at x=297.4 in regular weight, 57-pt rows. h5 G05-schedule-review: weekday x=36, names x=164 in bold, 48-pt rows (dividers at 371, 419 …). component-contracts handoff5.replaces: 'handoff3.G05WeekView': 'handoff5.weekRows'.
- **What the app does, and who acts:** Meanwhile the app builds every G05 week, G05-schedule included, from handoff5.weekRows with frame 4's geometry. It notes on G05-schedule's INVENTORY row that the handoff 3 frame is superseded for its rows.
- **Second reviewer's correction:** The geometry change is real. h3 G05-schedule has weekdays at x=20, right-aligned names ('Ben · You' at x=297.4) and a 57-pt pitch. h5 G05-schedule-review has weekdays at x=36, names at x=164 and a 48-pt pitch (dividers at 371, 419 and on), x 36 to 357. But the delivery already says which rules are current: component-contracts handoff5.replaces maps 'handoff3.G05WeekView' to 'handoff5.weekRows', and weekRows gives the 48/56-pt rows and the bold self name. Frame 4 is the G05 week with a review row on top, so the build has its geometry. Noting the superseded h3 frame in INVENTORY is bookkeeping, not a gap.

### F-10 · should · claude-design · confirmed

- **State:** H01-travelling (item 8), against 2.1's H01-after-close
- **Rule:** The brief named H01-after-close as the closest state and changed only 'Revisit her day' to 'Revisit Debby’s Friday' (FQ20). Book p34: 'A component has one shape, one meaning'.
- **Finding:** The past-day card was restyled with no contract naming the change, so H01-after-close (2.1) and H01-travelling (h5) draw the same card two ways. The eyebrow also changed, from 'UP NEXT' to 'Up next'.
- **Evidence:** 2.1 H01-after-close: an outlined white card with a check-circle icon. h5: a filled card, rect x=20 y=598 w=353 h=108 fill #F0F2EC, with a Memories image glyph and text at x=68. No past-day card entry in component-contracts handoff5.
- **What the app does, and who acts:** Meanwhile the app builds the past-day card as 2.1 draws it on both Home states (FQ2), with handoff 5's words ('Debby’s Friday is in Memories', 'Revisit Debby’s Friday'). The next brief asks which card is current.

### F-11 · should · app · confirmed

- **State:** G04-conflict, H01-unavailable, G05-local-times (items 1, 5, 9)
- **Rule:** Brief: 'One name for the state, on screen and in every VoiceOver label'; 'Every control has a VoiceOver name that begins with its visible words'. README: 'Apply handoff5 replacements only where their stated scope applies; keep earlier entries intact.'
- **Finding:** The replacement map leaves some handoff 3 keys current that contradict the new frames. Applied literally, they would bring back the old state name, 'Assigned' and labels that don't start with the visible words.
- **Evidence:** Not in handoff5.replaces: G04.conflict.confirm.vo 'Confirm Friday. Unavailable while Friday has a day choice conflict.'; G04.conflict.friday.hint 'Choose another available weekday, or keep this choice and wait.'; G04.conflict.assigned '{name} · Assigned' (h5 draws 'Confirmed'); G04.conflict.fridayPeople 'Ben and Debby'; H01.unavailable.choose.vo 'Choose another club explicitly.' (visible words 'Choose a club'); H01.unavailable.help.vo; G05.schedule.localSheet.clubValue/localValue ('{…} to {…} · zone'), where h5 draws separate Opens and Closes lines.
- **What the app does, and who acts:** Meanwhile the app takes the handoff 5 frames' labels and keys as current: calendar.confirm, calendar.confirm.contested.hint, calendar.state.confirmed, home.help.hint and local.*. It records the leftover handoff 3 keys as superseded in INVENTORY. The next brief asks Claude Design to complete the map.

### F-12 · note · app · confirmed

- **State:** G04-confirmed-others (item 2)
- **Rule:** Item 2: replace otherFriday 'wherever that week appears'. Book p34: one shape.
- **Finding:** The replacement key is one line, but the frame draws two. Friday's weekday also sits lower than its first line, while the Sunday row in the same frame aligns both.
- **Evidence:** handoff5.calendar.publicContested = 'Contested · No reveal scheduled'. Drawn: 'Contested' (baseline 509) above 'No reveal scheduled' (531). 'Friday' baseline 514; 'Sunday' and 'Revisit' both at 613. weekRows.contested: 'Weekday + Contested / No reveal scheduled'.
- **What the app does, and who acts:** Meanwhile the app draws the two-line form from calendar.state.contested and calendar.noReveal, aligned like SundayRow, and speaks calendar.publicContested.vo. No question is needed.

### F-13 · note · claude-design · confirmed

- **State:** G04-conflict (item 1)
- **Rule:** Brief: VoiceOver names begin with the visible words; one meaning on screen and in speech.
- **Finding:** Monday's hint for Ben is drawn in the present tense but spoken in the past, so what Ben sees and what VoiceOver says differ.
- **Evidence:** Drawn: 'Proposed for you' (handoff5.calendar.earlierSelfProposal). Label: 'Monday. Available. Previously proposed for you. Not selected.' (calendar.row.earlierSelf.vo).
- **What the app does, and who acts:** Meanwhile the app uses both strings as delivered. The next brief asks for one wording.

### F-14 · note · app · confirmed

- **State:** G05-local-times (item 5)
- **Rule:** Item 5 fixture: 'during Debby’s open Friday 6 November 2026', Ben in London.
- **Finding:** With the phone set to London, the status bar time can't fall within the fixture. H01-travelling set its clock to match its own fixture (6:01).
- **Evidence:** Status bar '9:41' with deviceZone Europe/London. Debby's Friday is open from 12:00 Friday 6 November to 06:00 Saturday 7 November in London (7 AM to 1 AM New York). At 9:41 on Friday the next occurrence would be Debby's own Friday 6. The drawn list, starting with Nina's Saturday, fits 9:41 on Saturday, after Debby's Friday has closed.
- **What the app does, and who acts:** Meanwhile the app's snapshot fixture uses a server time inside Debby's open Friday, for example 14:41 London (9:41 AM New York), with the same six occurrences.

### F-15 · note · app · confirmed

- **State:** G06-switcher-status (item 11)
- **Rule:** Item 11: 'Club details, Create a club and Cancel as 2.1 draws them'; 'your H01-awaiting-activation behind the sheet'.
- **Finding:** The action spacing and the checkmark's tint differ from 2.1. The background also drops a line of H01-awaiting-activation where it would still show above the sheet.
- **Evidence:** h5 baselines: Club details 680, Create a club 732, Cancel 808 (52 and 76 apart), against 2.1's 710, 754, 798 (44 and 44). The checkmark is stroked #284CDB; 2.1's is ink. 'Drafts stay private when the club starts.' is absent: the drafts card ends at y=376 and the sheet starts at y=432.
- **What the app does, and who acts:** Meanwhile the app uses the native sheet, list rows and tint (T45), so the system sets this spacing and tint. The background is H01-awaiting-activation as built. Nothing is needed from Claude Design.


**Found by the second reviewer**

### FM-01 · should · claude-design

- **State:** H01-travelling (item 8), and Friends while travelling
- **Finding:** The travelling Home card and Friends row have no form for a member whose local date differs from the club's date. The club line has no date parameter on either screen. The delivery's own Friends rule asks for the club date when the dates differ, but its template can't carry it. Home has no rule at all, while its plaque and title name the club's weekday. London, the only fixture, never shows the problem.
- **Evidence:** handoff5.home.localOpening = 'Opens {openTime} · {deviceZoneName}', home.clubOpening = '{openTime} · {clubZoneName}', friends.date.club = '{clubOpenTime} · {clubZoneName}': no date in any of them. component-contracts travellingRows.Friends: 'second metadata line club time + club zone, with full club date when local dates differ'. travellingRows.Home: 'Local exact date/time first, club-zone equivalent visible' (no rule for differing dates). Checked with zoneinfo: Nina's Saturday at 7 AM New York on 7 November 2026 is 01:00 on Sunday 8 November in Auckland.
- **What the app does, and who acts:** Meanwhile, when the two dates differ, the app writes the club line on Home and Friends with the delivered upcoming.club template ('{clubOpenFullDate} · {clubOpenTime} · {clubZoneName}'), which carries the club date. The plaque and title stay on the occurrence's club date. The next brief asks for the Home card and the Friends row with a fixture where the dates differ.

### FM-02 · note · app

- **State:** H01-travelling (item 8); Friends
- **Finding:** The delivery names the same label two ways. Home gets a new key 'Up next', while Friends keeps 'Next up', in both the visible label and VoiceOver. Spec 08 calls it 'Next up' on Home, and spec 03 asks for the same noun everywhere.
- **Evidence:** New key handoff5.home.upNext = 'Up next' (provenance new), drawn at (20, 133) on H01-travelling. handoff5.friends.nextUp.vo = 'Next up. '. handoff3 nextUpLabel.text = 'Next up'. Spec 08: 'Home shows Next up Nina'. Book p7 and p13: 'Next up'. 2.1's H01 renders draw 'UP NEXT'.
- **What the app does, and who acts:** Meanwhile the app uses 'Next up' on Home and Friends (spec 08, spec 03) and records the difference in INVENTORY's Known differences.

### FM-03 · note · app

- **State:** G06-switcher-status (item 11)
- **Finding:** The selected club's VoiceOver label writes 'Selected.' into the label, and the delivery also gives the row the native selected trait. VoiceOver would then say 'Selected' twice.
- **Evidence:** screen-copy.json G06-switcher-status control label: 'Sunday people. Not started. Selected.'. Template handoff5.switcher.row.selected.vo = '{clubName}. {stateLabel}. Selected.'. IMPLEMENTATION.md: 'the selected club has the native checkmark and selected trait'. component-contracts controlLabels: 'Native selected/disabled traits remain native.'
- **What the app does, and who acts:** Meanwhile the app uses switcher.row.vo ('{clubName}. {stateLabel}.') with the native selected trait, so 'Selected' is spoken once, and checks it with VoiceOver on a device.


## Written asks: questions, rules, return

**Summary.** Handoff 5 answers every question the brief asked in writing, and almost every ask inside items 1 to 13.
- **Templates are clean.** Every earlier key the brief asked to have templated has a handoff5 template that names it in "replaces". The strings write in no fixture names, places or clock times and use no straight apostrophes. Fixture values sit under handoff5.examples or in screen-copy.json.
- **Controls pass.** Every drawn control's label begins with its visible words, and every target is at least 44 pt.

What is wrong or missing:
- **Must (1): the countdown.** The new label is "{durationSpoken} until opening.", and H01-travelling has no other spoken group. T47 and book p26 say a countdown announces its target date.
- **Should: the replacement map.** One entry is wrong: Maya's proposed Wednesday and Saturday map to the "Unchanged" template. Five earlier labels that break the brief's rules are left current: the old noun "day choice conflict", "Assigned", and two labels that don't start with their visible words. 51 handoff5 strings re-key earlier text but are marked "new".
- **Should: missing variants.**
    - The View local times hint has no form for when both zones are equal. The fixture renders "in New York and New York".
    - The Home and Friends club lines have no form for when the local date and the club date differ.
- **Should: rules lost in replaced component entries.** Replacing dayChoiceRow and weekRows wholesale drops the old largest-text stacking rule and the no-dates/no-content-signal rules.
- **Should: other gaps.**
    - H01-confirm-days promises "The club's week will appear here", but under the Default Home shows the next confirmed day.
    - The week and Friends have no form for a day that is still unconfirmed during the club's first days.
    - The spacing ask is answered only for Home, pending, G04-change, the G05 rows and the no-club buttons.
    - Frames 12 and 13 (and G04-change) change 2.1's and handoff 3's words beyond the day-choice design, with no reason given.
- **Notes for the founder or a later brief:**
    - The plaque leaves G04-one-day (answered as asked).
    - The written Default assessments: a contested day can last indefinitely.
    - The "Invite someone" flow has no frame.
    - The selected switcher row speaks "Selected" twice.
    - The chooser line on the contested row has no template.
    - "Choose an available day" appears on a screen where no row reads Available.


**What was delivered, item by item**

- **Q: G04-conflict words for three or more choosers.** Explanation "{chooserSentenceList} chose {weekday}." (ListFormatter, You for the viewer). Help "You can choose another day, or keep your choice." VoiceOver "{weekday}. Contested. {chooserSpeech} Your choice." No count (copy calendar.contested.*, calendar.row.contested.vo).
- **Q: G04-confirmed-others, G04 or G05, and the contested label without names.** G04 post-confirmation summary, with Done. Public Friday reads "Contested · No reveal scheduled" with label "{weekday}. Contested. No reveal scheduled." handoff5.calendar.publicContested replaces handoff3.G04.conflict.otherFriday wherever the week appears, G05 included.
- **Q: Sunday in one form for G04, G04-change and G05.** One SundayRow (Revisit over No reveal scheduled, 56 pt minimum, stacks at AX5), spoken "{weekday}. Revisit. No reveal scheduled.". It replaces all three earlier Sunday labels and is drawn on every G04 and G05 frame.
- **Q: G05-schedule-review, does the current week show Maya.** No. Maya appears only in the roster and in the proposed future week, and is never put on an unused current weekday (weekRows.MayaCurrentWeek).
- **Q: G05-local-times, is the sheet still needed, and is View local times shown when not travelling.** The sheet is kept: Home shows only the next opening, while the sheet gives dated openings and closings. View local times shows even when not travelling, with one block per occurrence when the zones are equal. Travelling Friends and F02 get templates: friends.date.travelling, friends.date.club, friends.row.travelling.vo, upcoming.local, upcoming.club and card.status.travelling/club.
- **Q: H01-confirm-days, where does Ben's own confirmation wait once other days are confirmed.** In Friends → See schedule, or Club details → Schedule, as a "Choose your day(s)" row only Ben sees (schedule.chooseOwn), which opens the G04 choice. Home keeps the next confirmed day. No push, badge, reminder or count.
- **Q: H01-unavailable and H01-access-lost: Friends, Memories, + Add, club bar.** Friends and Memories show the same neutral denial for the selected club. + Add offers Private draft, then Open my drafts. The club bar reads "Choose a club", not the denied club's name (deniedHeader).
- **Q: G06 visible word for an unavailable club.** "Unavailable" (switcher.unavailable), shown only while the club is still in the authorized listing. A revoked club is left out of the list.
- **Q: paused club with the remaining member's own announced day.** Drawn as the Default: Home shows the day as usual until it closes. + Add offers it until it opens at 7 AM, then the next own day, else Private draft and Open my drafts. The ordinary wording is reused. The paused body becomes the template "{clubName} needs another member for new days.". Club details gets an "Invite someone" row below Members and above Schedule. Nothing is written about a departed member's days.
- **Q: VoiceOver labels that drop their button's words.** Ten labels are reworded to start with the button's visible words, with the extra text moved to a hint. All are under handoff5.a11y.*, each naming the earlier key it replaces: Not now, View local times, + Add, Review members, View Memories, I have an invite, Continue, Done for now, Close invitation and Decline. Loading Home shows and speaks "Loading Home…", with an optional "For {clubName}." hint. Decline reads "Decline {candidateName} joining {clubName}.".
- **Q: spacing on book p35's scale.** Home and pending title to body: 24. Body to secondary: 16. Sections: 24. G04-change person rows: 48 in both blocks. G05 rows: 48 for one line, 56 with a real subtitle. No-club buttons: 16, not 17. Footer gap 16; secondary target gap 8 (handoff5.spacing). Only partly answered for the other screens: see W-10.
- **Q: G05-schedule zone line role and "Ben · You".** The zone line is metadata 13/18 secondaryText, as on Friends and G04-change. "Name · You" uses the bold row role (weekRows.zoneRole, selfNameRole).
- **Q: collecting card status line and lock.** "Opens {fullDate} · {openTime}" (card.status, replacing handoff4.sheet.card.status), with a 12 pt lock.fill, an 8 pt gap and the cardStatus 13/18 role. The lock shows only before reveal. Both the light and dark specimens are redrawn this way on brand-components.
- **Item 1: the date plaque on the day-choice screens.** Left off all three G04 choice screens, with the reason that the plaque marks a dated occurrence and these are unconfirmed weekdays (dayChoiceRow.datePlaque false).
- **Item 1: a contested ink that isn't destructive, and the 14 pt inset.** Contested uses the inputBorder outline, primaryText and words, never destructive. Every row has a 16 pt inset (contentInset), named in component-contracts handoff5.dayChoiceRow.
- **Item 1: one name for the state; Ben's own name in rows, sentences and VoiceOver.** The state is called "Contested" in every handoff5 string and frame. Ben's name reads "{personName} · You" in rows, is spoken "{personName}, you", and becomes You or your in sentences: "Proposed for you", "You and Debby chose Friday.".
- **Item 1: hours and zone on G04-conflict.** Drawn: "Sunday people · New York" above "7 AM to 1 AM the next morning".
- **Item 3: G04-change rows and VoiceOver agree.** Grouped by person, both drawn and spoken: two groups that keep their dates, three proposed groups, then SundayRow. The seven weekday labels are gone.
- **Item 11: people count beside Not started or Paused.** Left out beside both labels (switcherStatus.counts false).
- **Return: templates for the listed earlier keys.** Every listed key has a handoff5 template and is named in handoff5.replaces: handoff3.G04.conflict.clubZone, G05.schedule.hours, revealHoursZone, hoursVO, G05.schedule.vo.Monday to Sunday, F01.date.* and F01.row.vo.* (six each), handoff4.members.footer.hours and sheet.card.status. members.footer.sundayPeople and .pair are kept unchanged as examples.
- **Return: template hygiene and apostrophes.** None of the 183 handoff5 strings writes in a fixture name, club, place, weekday, date or clock time. They contain no straight apostrophes. Fixture values are under handoff5.examples or in screen-copy.json.
- **Rules: VoiceOver names and 44 pt targets.** Every control in screen-copy.json has a label that begins with its visible words (the icon-only Back and Account keep their system names). Every rect is at least 44 pt: choice rows 64 and 88, tabs 131×59.
- **Dark and large-text frames.** No frames, as asked. Answered in writing: token contrast checks for light and dark (validation-report contrast), plus largest-text rules for SundayRow, the change rows, the local-times sheet, the travelling rows and the long titles. The day-choice row is the gap: see W-07.
- **Return: pack contents and the brand asset.** The zip holds SVG frames, 2x PNGs, screen-copy.json, frame-manifest.json and a 12-page PDF. The changed brand-components is sent again whole under its handoff 1 name, frames/brand-components.svg/png.

**Findings**

### W-01 · must · app · adjusted

- **State:** H01-travelling (and every waiting Home with a countdown)
- **Rule:** T47 ("A countdown announces its target date, not every tick."); book p26 ("Countdowns announce the target date instead of speaking every minute."); brief Rules (book p26; T47)
- **Finding:** The only VoiceOver template for the Home countdown speaks how long is left, not the target date. H01-travelling gives its waiting card no spoken group, so nothing announces the opening date and time.
- **Evidence:** copy-contracts.json handoff5 "home.countdown.vo": "{durationSpoken} until opening." (provenance kind new, replaces []). On the frame it renders as "5h 59m" / "until opening". screen-copy.json "H01-travelling" has "semanticGroups": [], an empty list. Its only date is in a button hint: "Add to Nina’s Saturday, opening Saturday, November 7, 2026 at 7 AM in New York." T47: "A countdown announces its target date, not every tick." Book p26: "Countdowns announce the target date instead of speaking every minute."
- **What the app does, and who acts:** App: the countdown's VoiceOver label announces its target, which is the occurrence's reveal_at as a full date and time with the zone. While travelling it uses the dated strings already delivered (upcoming.local and upcoming.club). If the duration is spoken at all, it is a value that is never re-announced each minute. The next brief asks Claude Design for the countdown label and for the travelling waiting card's spoken group.
- **Second reviewer's correction:** The core is true. home.countdown.vo = "{durationSpoken} until opening." is the only countdown label, and it speaks a duration, not the target date. T47 says "A countdown announces its target date, not every tick", and book p26 says the same. No earlier handoff gives a countdown label. One detail in the evidence is wrong: H01-travelling does have a "semanticGroups" key. It is an empty list, so the waiting card still has no spoken group. Severity, action and who stand.

### W-02 · should · app · adjusted

- **State:** G04-conflict, H01-unavailable, H01-paused
- **Rule:** Brief item 1 ("One name for the state, on screen and in every VoiceOver label"); brief Rules ("Every control has a VoiceOver name that begins with its visible words"); the delivery's own "Current UI selects the H5 key through the replacement map"
- **Finding:** handoff5.replaces leaves out five earlier keys that the new frames contradict. Under the delivery's own instruction to follow the replacement map, they still look current. Three of them break the brief's rules: one VoiceOver label uses "day choice conflict", and two labels don't begin with their visible words. The other two are words the new design has replaced.
- **Evidence:** Not in handoff5.replaces:
- handoff3.G04.conflict.confirm.vo = "Confirm Friday. Unavailable while Friday has a day choice conflict." Frame 1 uses the label "Confirm Friday" with the hint "Contested. Confirmation is unavailable."
- handoff3.H01.unavailable.choose.vo = "Choose another club explicitly." for the visible "Choose a club".
- handoff3.H01.paused.details.vo = "Open Kitchen table’s club details." for the visible "Club details".
- Superseded words: handoff3.G04.conflict.friday.hint = "Choose another available weekday, or keep this choice and wait." (frame 1 uses "Choose Friday."), and handoff3.G04.conflict.assigned = "{name} · Assigned" (every frame uses "Confirmed").
IMPLEMENTATION.md: "Current UI selects the H5 key through the replacement map."
- **What the app does, and who acts:** App: treat all five keys as superseded. Use calendar.confirm with calendar.confirm.contested.hint, calendar.row.choose.hint and calendar.state.confirmed. On H01-unavailable the label is "Choose a club". On H01-paused the label is "Club details", with no hint until Claude Design gives one. The ios thread records these mappings in INVENTORY.md.
- **Second reviewer's correction:** All five keys exist, none is in handoff5.replaces, and each conflicts with the handoff5 frames. Only three of them break a stated rule, though. handoff3.G04.conflict.confirm.vo says "day choice conflict", which goes against item 1's one name for the state. H01.unavailable.choose.vo and H01.paused.details.vo don't begin with their visible words, and paused.details.vo also writes in the club's name. The other two are words the new design has replaced, not rule breaks: friday.hint, and conflict.assigned ("Assigned" where the frames now say "Confirmed"). The original action also had the app write a new hint template, which is copy Claude Code shouldn't write.

### W-03 · should · app · confirmed

- **State:** G04-change
- **Rule:** Brief Return ("naming the earlier key each one replaces"); the brief's check that "replaces" entries are correct
- **Finding:** The replacement map sends Maya's two proposed weekdays to the "Unchanged" template. Maya's days are new. The frame speaks them with change.proposedRow.new.vo, which is marked new and replaces nothing.
- **Evidence:** handoff5.replaces: "handoff3.G04.change.vo.Wednesday": "handoff5.change.proposedRow.unchanged.vo" and "handoff3.G04.change.vo.Saturday": "handoff5.change.proposedRow.unchanged.vo" ("{personSpeech}. {weekdayList}. Unchanged."). The old keys read "Wednesday. Maya’s day in the proposed week from Monday, November 16, 2026." and the same for Saturday. The frame speaks "Maya. Wednesday and Saturday. Proposed from Monday, November 16, 2026.". Provenance: "change.proposedRow.new.vo": {"replaces": [], "kind": "new"}.
- **What the app does, and who acts:** App: map handoff3.G04.change.vo.Wednesday and .Saturday to handoff5.change.proposedRow.new.vo, and Monday, Tuesday, Thursday and Friday to proposedRow.unchanged.vo. The ios thread records the correction in INVENTORY.md.

### W-04 · should · app · confirmed

- **State:** All redrawn and new states
- **Rule:** Brief Return ("put new and replacement entries under handoff5 … naming the earlier key each one replaces")
- **Finding:** Many handoff5 strings take over earlier keys but are marked kind "new" with an empty replaces list, so both keys look current. Some of the earlier keys have fixture dates or names written in, which the new templates fix.
- **Evidence:** 51 handoff5 strings have exactly the text of an earlier key yet are marked new with replaces []. For example:
- calendar.confirmed.title = handoff3.G04.conflict.confirmedSelf;
- home.unavailable.title, body and help = handoff3.H01.suspended.*;
- home.lost.* = handoff3.H01.accessLost.*;
- change.before = handoff3.G04.change.currentThrough;
- local.title = handoff3.G05.schedule.localSheet.title;
- switcher.notStarted = handoff3.switcher.awaiting;
- proposed.* = handoff3.G05.proposed.*.

Templates that take over earlier keys with different text, also unnamed:
- change.startDate, keptDates, unchangedDays, newDays and confirm.hint take over handoff3.G04.change.startDate ("Monday, November 16, 2026"), benBefore, debbyBefore, benAfter, debbyAfter, mayaAfter and confirm.vo ("Confirm these days from Monday, November 16, 2026.");
- local.opens and local.closes take over handoff3.G05.schedule.localSheet.clubValue and localValue;
- switcher.row.vo takes over handoff3.switcher.awaiting.vo, paused.vo and unavailable.vo.
- **What the app does, and who acts:** App: build from the handoff5 keys and treat these earlier keys as superseded. The ios thread lists the mapping in INVENTORY.md. No string changes.

### W-05 · should · claude-design · confirmed

- **State:** G05-schedule-review (View local times when not travelling); G05-local-times
- **Rule:** Brief item 5 and its question ("does 'View local times' show for a member who isn't travelling"); the delivery's own "If both zones are equal, show one time block per occurrence"
- **Finding:** The delivery keeps View local times for members who aren't travelling. But its hint and the sheet's spoken group have no form for when both zones are the same, and the delivered fixture renders the hint with the same zone twice.
- **Evidence:** screen-copy.json G05-schedule-review control "View local times", hint: "Show dated opening and closing times in New York and New York.". Template schedule.localAction.hint: "Show dated opening and closing times in {clubZoneName} and {deviceZoneName}.". local.group.vo always names both zones. IMPLEMENTATION.md: "View local times remains available when the viewer is not travelling. If both zones are equal, show one time block per occurrence".
- **What the app does, and who acts:** App: when the device zone equals the club zone, leave the hint out, so the label "View local times" stands alone, and show one block per occurrence as the delivery says. The next brief asks for the hint and the sheet's strings when both zones are the same.

### W-06 · should · claude-design · adjusted

- **State:** H01-travelling; Friends (travelling)
- **Rule:** T41 ("A target always carries its exact date wherever a weekday alone could mislead"); brief Rules (exact dates); IMPLEMENTATION.md's own "including the club date when dates differ"
- **Finding:** For a traveller whose local date differs from the club's date, the Home and Friends club lines have no form. The Friends rule promises the club date in that case, but its template can't carry one. Home leads with the local date and gives the club time no date. Example: in Auckland in November (UTC+13), 7 AM Saturday in New York is 1 AM Sunday.
- **Evidence:** friends.date.club = "{clubOpenTime} · {clubZoneName}" has no date parameter and no variant. component travellingRows.Friends: "second metadata line club time + club zone, with full club date when local dates differ". IMPLEMENTATION.md: "including the club date when dates differ". Home: home.date = "{fullDate}", home.localOpening = "Opens {openTime} · {deviceZoneName}", home.clubOpening = "{openTime} · {clubZoneName}", drawn as "Saturday, November 7" / "Opens 12 PM · London" / "7 AM · New York". travellingRows.Home: "Local exact date/time first, club-zone equivalent visible". Nothing says which date the SAT 07 plaque shows.
- **What the app does, and who acts:** App: when the two dates differ, use the dated forms already delivered for F02, upcoming.local ("Opens {fullDate} · {localOpenTime} · {deviceZoneName}") and upcoming.club ("{clubOpenFullDate} · {clubOpenTime} · {clubZoneName}"), on both Home and Friends. The next brief asks for the Home and Friends variants and for which date the plaque shows.
- **Second reviewer's correction:** The core is true. friends.date.club and home.clubOpening have no date parameter and no variant, yet travellingRows.Friends promises "full club date when local dates differ". The Auckland arithmetic is right: in November 2026, 7 AM EST is 01:00 NZDT the next day. One line of the evidence is wrong: "Nothing says which zone home.date follows." travellingRows.Home says "Local exact date/time first", so home.date follows the local date. What stays unstated is a date on the club line, and which date the plaque shows.

### W-07 · should · app · adjusted

- **State:** G04-one-day, G04-two-days, G04-conflict; G04-confirmed-others and G05 weeks
- **Rule:** Brief "Dark and large-text frames" ("Every state is checked … at the largest text size against book p26 and your answers"); book p26 ("Rows grow and dates wrap"); T15/T33 (the week shows no dates or content signals)
- **Finding:** Two component replacements have no scope, so the earlier rules they leave out disappear. The new day-choice row has two columns (a 112 pt first column) and no rule for stacking at the largest text sizes, where handoff 3's row stacked. The new week rows drop handoff 3's rules that the week shows no next dates, no Next up and no content signals.
- **Evidence:** component-contracts handoff5.replaces: "handoff3.G04ChoiceRow": "handoff5.dayChoiceRow" and "handoff3.G05WeekView": "handoff5.weekRows". Neither is in replacementScopes. dayChoiceRow has "firstColumn": 112 and "columnGap": 16, but no largestText field and no "noLock". The dropped rule: "largestText": "One full-width vertical row per weekday. Stack day, owner and state; trailing checkmark remains separate and decorative to the row label. Grow and scroll." The delivery says only "At large text the body scrolls and controls grow." (IMPLEMENTATION.md) and "At AX5 the whole row and footer grow; no grid, abbreviated weekday or reduced font is used" (PDF page 5). weekRows has no "nextDates": false, "nextUp": false or "contentSignals": false.
- **What the app does, and who acts:** App: keep handoff 3's G04ChoiceRow largestText rule, so at accessibility sizes the weekday, owner and state stack in one full-width row. Keep G05WeekView's nextDates, nextUp and contentSignals as false, alongside the handoff5 values. The ios thread records both as kept rules in INVENTORY.md.
- **Second reviewer's correction:** The core is true. handoff3.G04ChoiceRow and handoff3.G05WeekView are replaced with no entry in replacementScopes. dayChoiceRow has firstColumn 112 and columnGap 16 but no largestText or stacking rule, and drops noLock. weekRows drops nextDates, nextUp and contentSignals false. One detail in the evidence is incomplete: the PDF (page 5) does say more than the one line quoted: "At AX5 the whole row and footer grow; no grid, abbreviated weekday or reduced font is used". It still never says the 112 pt two-column row stacks.

### W-08 · should · claude-design · confirmed

- **State:** H01-confirm-days
- **Rule:** Brief item 7 Default ("Once any day is confirmed, Home shows the next confirmed day, as H01-waiting does"); T43 plain, factual voice
- **Finding:** The body promises that the club's week will appear on Home. Under the Default, and under the delivery's own written rule, Home then shows the next confirmed day, not the week.
- **Evidence:** home.confirm.body = "The club’s week will appear here after a day is confirmed." (drawn on H01-confirm-days). IMPLEMENTATION.md: "the first confirmation makes Home show the next confirmed occurrence". Component firstDays.whenFirstConfirms: "Home resolves to the next confirmed occurrence".
- **What the app does, and who acts:** App: Home follows the Default and shows the next confirmed day. The app uses the delivered string until it is reworded, and the next brief asks Claude Design to reword it so it doesn't promise the week.

### W-09 · should · claude-design · confirmed

- **State:** G05 week and Friends during a club's first days
- **Rule:** Brief question on H01-confirm-days (where Ben's own confirmation waits); item 7 Default (each day goes ahead as its member confirms it); brief section 5 (FQ48 relaxes the rule against naming who hasn't confirmed on the day-picking screens only)
- **Finding:** The answer sends Ben's confirmation to Schedule and Friends while some days are confirmed and others aren't. Neither the week rows nor Friends has a form for a member whose day is only proposed: the week rows have assigned, unused, contested and Sunday only. The delivery itself says this state "requires a clear distinction between the active roster and actual scheduled assignments".
- **Evidence:** weekRows: singleLine "Weekday + owner", unused "Weekday + No reveal scheduled, no owner", contested and Sunday. There is no proposed or unconfirmed form. The written answer: "If the viewer’s own initial days are still unconfirmed, the route remains in Friends → See schedule or Club details → Schedule. A viewer-only Choose your day(s) row opens the personal G04 choice."
- **What the app does, and who acts:** App: in the week, a day not yet confirmed reads "No reveal scheduled" with no name, because the rule against naming who hasn't confirmed still holds away from the day-picking screens. In Friends, that member's row shows no date, never an invented one (T49). The next brief asks for these states.

### W-10 · should · claude-design · confirmed

- **State:** G04 choice screens, G05-schedule-review, earlier F01-friends
- **Rule:** Brief spacing question ("name the vertical gaps on your handoff 3 and 4 frames and on these … 35 to 48 on your other handoff 3 and 4 frames"); book p35 scale; T44
- **Finding:** The spacing answer names gaps for Home, pending, G04-change, the G05 rows and the no-club buttons. It names none for the block of text between the title and the list on the day-choice screens, for the G05 block between the title and the review row, or for F01-friends' title to subtitle.
- **Evidence:** handoff5.spacing keys: homeContentTopAfterHeader, pushedContentTopAfterHeader, homeTitleToBody, homeBodyToSecondary, pendingTitleToBody, sectionGap, reviewRowToWeek, changePersonRowPitch, changeTitleToSubtitle, changeHeaderSmallGaps, changeSectionGaps, weekSingleLineRow, weekRealSubtitleRow, footerBodyMinimumGap, primaryToSecondaryTargetGap, noClubButtonGap, datedHomeTitleToCard, waitingCardToPrimary, primaryToCaptions, captionsToPast.

None covers G04-one-day's baselines: title 152, club and zone 180, hours 202, explanation 236, help 263, first row 305. Nor G05-schedule-review's: title 152, hours 184, zone 210, review row 261. The earlier evidence measured F01-friends at 37.
- **What the app does, and who acts:** App: use the frames' measured gaps, and the named values where they exist. The next brief asks for these gaps to be named on the p35 scale.

### W-11 · should · founder · confirmed

- **State:** G04-one-day (frame 12), G04-two-days (frame 13), G04-change (frame 3)
- **Rule:** Brief "What to design" ("A redraw keeps everything else in the earlier frame as it was.")
- **Finding:** The redraws change words beyond the one day-choice design. The written answer explains only the plaque and the tile grid.
- **Evidence:** - 2.1 G04-one-day: the title "Your Monday." becomes "Choose your day". Dropped: "A day for your friends to collect things for you.", "THE CLUB’S WEEK" and "New York · One shared opening time.".
- 2.1 G04-two-days: "Choose your two days." becomes "Choose your days"; "A two-person club · Ben and Debby" becomes "Ben and Debby · New York"; "Confirm two days" becomes "Confirm Monday and Thursday". Dropped: "A day for your friends to collect things for you.", "New York · One shared opening time." and "Sunday is for revisiting.".
- handoff 3 G04-change: "Through Sunday, November 15" becomes "Current days through Sunday, November 15".
- The written reason covers only the plaque and the grid ("the pair’s old tile grid becomes the same vertical list").
- **What the app does, and who acts:** App: build frames 12, 13 and 3 as delivered, since book p10 and p11's contracts (week, club zone, hours, occupied owners) are all still met. The ios thread lists the dropped and changed lines in INVENTORY.md as known differences. The founder decides whether to keep the new words or ask for 2.1's lines back.

### W-12 · note · founder · confirmed

- **State:** G04-one-day, G04-two-days, G04-conflict
- **Rule:** Book p6 and p10 (G04-one-day leads with the date plaque); CLAUDE.md "Nothing generic" (the weekday plaque is one of the book's objects)
- **Finding:** As the brief asked, Claude Design says whether the plaque belongs on the choice screens. It leaves the plaque off all three, so one of the book's own objects leaves the confirm screen that 2.1 drew with it.
- **Evidence:** IMPLEMENTATION.md: "The date plaque is omitted from all three G04 choice screens. It identifies a dated occurrence; these are unconfirmed recurring assignments with no promised date yet." Component dayChoiceRow: "datePlaque": false. 2.1's G04-one-day draws a "MON 09" plaque.
- **What the app does, and who acts:** Nothing needed now: the app builds without the plaque, as delivered. The founder may want to know, since it changes book p10's render.

### W-13 · note · founder · confirmed

- **State:** G04-conflict; H01-confirm-days
- **Rule:** Brief "Default … say in writing if it makes the screen worse" (FQ55, item 7's first-days reading)
- **Finding:** The delivery draws both Defaults but questions them in writing. Under FQ55 a contested day can stay unresolved indefinitely, and the first-days reading needs a visible line between active members and scheduled days.
- **Evidence:** IMPLEMENTATION.md: "Default assessment: a day can remain contested indefinitely. The design makes that understandable without adding pressure to resolve it." and "Default assessment: this gives an early usable week but requires a clear distinction between the active roster and actual scheduled assignments."
- **What the app does, and who acts:** Nothing now: the Defaults stand and are built as drawn. These points are for the founder when answering FQ55 and the first-days reading.

### W-14 · note · claude-design · confirmed

- **State:** Club details of a paused club (no frame)
- **Rule:** Brief paused-club question ("where Club details' invitation control goes"); FQ16 (an invitation restarts the club); FQ51 Default (the invitation list only during setup)
- **Finding:** The answer places an "Invite someone" row, but the flow it opens has no frame and no strings: a "contextual per-person invitation-name flow". The row also depends on "proposal permission", which no source defines.
- **Evidence:** paused.details.invite = "Invite someone" and paused.details.invite.hint = "Propose a new member for {clubName}.". Component pausedOwnAnnounced.invitationControl: "only when the server authorizes a proposal and capacity permits". invitationRoute: "Contextual per-person invitation-name flow for this club, then exact roster review and required approvals."
- **What the app does, and who acts:** App: build the row's placement and words only when B2 or B1 reaches it. Mark the flow behind it "built from spec" or hold it, and put the flow in a later brief.

### W-15 · note · app · confirmed

- **State:** G06-switcher-status
- **Rule:** Delivery's own controlLabels rule ("Native selected/disabled traits remain native"); switcherStatus.selected ("Native checkmark + spoken selected trait")
- **Finding:** The selected club's label adds the word "Selected.", and the native selected trait is also set, so VoiceOver would say "selected" twice.
- **Evidence:** screen-copy.json G06-switcher-status label: "Sunday people. Not started. Selected.". Template switcher.row.selected.vo: "{clubName}. {stateLabel}. Selected.". switcherStatus.selected: "Native checkmark + spoken selected trait". controlLabels.rule: "Native selected/disabled traits remain native."
- **What the app does, and who acts:** App: use switcher.row.vo ("{clubName}. {stateLabel}.") with the native selected trait.

### W-16 · note · app · confirmed

- **State:** G04-conflict (contested row)
- **Rule:** Brief Return (every string under its own key, as a template)
- **Finding:** The contested row's visible line of choosers has no template. The handoff5 self-name rules cover sentences (ListFormatter with You) and VoiceOver, but not this visible list of person fields.
- **Evidence:** Drawn: "Ben · You and Debby". selfName has only listOfChoosersInProse and listOfChoosersInRowVO. dayChoiceRow.contested says only "participant names only for chooser".
- **What the app does, and who acts:** App: compose the line with the system list formatter over calendar.person.self and calendar.person.other, as drawn. The next brief confirms it.

### W-17 · note · claude-design · confirmed

- **State:** G04-one-day (frame 12)
- **Rule:** Item 1's five states told apart "in words and in form"; T43 plain voice
- **Finding:** The body asks the viewer to choose an available day, but in this fixture no row reads Available: every other day is Proposed, which can be chosen.
- **Evidence:** calendar.one.body = "Choose an available day, then confirm.". On frame 12, Tuesday to Saturday read "Proposed" (label "Proposed. Can be chosen."). calendar.state.available = "Available" applies only to free days.
- **What the app does, and who acts:** Nothing now: the app uses the delivered string. A later brief may ask for wording that fits days that are only proposed.


**Found by the second reviewer**

### WM-01 · note · app

- **State:** G04-change; G05-schedule-review
- **Finding:** One date parameter is drawn two ways with no written rule for the year. {fullStartDate} shows the year in the standalone start date, the review row and the hints, but not in the "From" header on the same screen. Handoff 3's rule says exact start dates include the year, and handoff 5 says only "Year is included when needed".
- **Evidence:** G04-change draws "Monday, November 16, 2026" (change.startDate "{fullStartDate}") and "From Monday, November 16" (change.after "From {fullStartDate}"), and "Current days through Sunday, November 15" (change.before "{fullLastDate}"). G05-schedule-review draws "Proposed from Monday, November 16, 2026" (schedule.review.date "Proposed from {fullStartDate}"). handoff3.snapshot.datePolicy: "Exact start dates include year." handoff5 IMPLEMENTATION.md: "Year is included when needed".
- **What the app does, and who acts:** App: format each key as drawn, with the year on the standalone start date, review row, hints, local-times sheet and card status, and without it in the G04-change section headers, Friends and Home. The ios thread records the per-key format. A later brief asks for the year rule in writing.

### WM-02 · note · app

- **State:** G04-one-day, G04-two-days, G04-conflict (rows already chosen)
- **Finding:** The hint "Choose {weekday}." is also put on rows that are already the viewer's choice. On the two-day screen, tapping a chosen row would remove it, and no string describes that.
- **Evidence:** G04-one-day control Monday: label "Monday. Ben, you. Your choice.", hint "Choose Monday.". G04-two-days Monday and Thursday: the same pattern. G04-conflict Friday: label "Friday. Contested. Ben, you. Debby. Your choice.", hint "Choose Friday.". Template calendar.row.choose.hint = "Choose {weekday}.". The handoff 3 hint it replaces explained the choice: "Choose another available weekday, or keep this choice and wait."
- **What the app does, and who acts:** App: leave the hint off rows that are already the viewer's choice, since their label already says "Your choice". The next brief asks for the hint on a chosen row, including removing one of two choices.

### WM-03 · note · app

- **State:** G04-two-days (and every day-choice screen)
- **Finding:** Two templates fill the club line on the day-choice screens: the club's name or the members' names. No written rule says when each applies. The member-names form exists only because the book's pair has no club name, but every real club is named when it's created.
- **Evidence:** calendar.clubZone = "{clubName} · {clubZoneName}" (G04-one-day and G04-conflict: "Sunday people · New York"). calendar.peopleZone = "{memberNames} · {clubZoneName}" (G04-two-days: "Ben and Debby · New York"). Handoff 4 membersFooter.unnamedPair: "No invented club name." Spec 04: the creator names the club. Neither IMPLEMENTATION.md nor dayChoiceRow mentions peopleZone.
- **What the app does, and who acts:** App: use calendar.clubZone for every club, because every club has a name (spec 04). The ios thread records peopleZone as the unnamed fixture's stand-in in INVENTORY.md.

### WM-04 · note · app

- **State:** G05-schedule-review
- **Finding:** The replacement map sends G05's hours-and-zone key to a one-line template with the zone first, but the G05 frame draws the hours and then the zone as two separate lines. No handoff5 key matches the bare zone line.
- **Evidence:** handoff5.replaces: "handoff3.G05.schedule.revealHoursZone" to "handoff5.calendar.hoursZone" = "{clubZoneName} · {hoursText}" (G04-change draws "New York · 7 AM to 1 AM the next morning"). G05-schedule-review drawnText: "7 AM to 1 AM the next morning" then "New York". weekRows.zoneRole: "metadata".
- **What the app does, and who acts:** App: build G05 as drawn, with calendar.hours followed by the club zone's name on its own metadata line, and use calendar.hoursZone only where it is drawn (G04-change). The ios thread records it in INVENTORY.md.

### WM-05 · note · app

- **State:** G04-change
- **Finding:** G04-change's Not now reuses the day-choice screens' hint, which speaks of keeping "your current choices". G04-change has no choices: Not now leaves without confirming the proposed week.
- **Evidence:** screen-copy.json G04-change control "Not now": hint "Keep your current choices and return." (calendar.notNow.hint, also used on G04-one-day, G04-two-days and G04-conflict). G04-change's only action is "Confirm these days" with the hint "Confirm this proposed week from Monday, November 16, 2026."
- **What the app does, and who acts:** App: on G04-change, give Not now no hint until Claude Design writes one. The next brief asks for it.


## Copy, privacy and product rules

**Summary.** Copy, privacy and product-rule check of handoff 5. Nothing hidden leaks. No drawn string or VoiceOver label in the 13 frames uses a pronoun. The denied Homes (H01-unavailable, H01-access-lost) show no club name, reason, cache or other club's content. Every Default in the brief is drawn as written: FQ46, FQ48, FQ50, FQ52, FQ54, FQ55, FQ56/57, FQ16 and FQ44.

One must-level problem: the only delivered countdown label, "{durationSpoken} until opening.", speaks the time left and no target date. That breaks T47 and spec 08.

Nine should-level problems:
- **Local-times hint:** the "View local times" hint renders "New York and New York" for a member who isn't travelling.
- **H01-confirm-days:** the body promises the club's week on Home, but under the Default Home shows the next confirmed day.
- **Read-only week and Friends:** neither has a form for another member's day that is still only proposed. During a club's first days that happens often.
- **Contested day on a choice screen:** there is no row state for a member who hasn't confirmed and didn't choose that day.
- **Travelling Home:** the time lines carry no dates, so a time loses its date when the phone's date differs from the club's.
- **G04-change:** the kept-dates line and its label hold exactly two dates per person.
- **"Your {weekday}":** it is inserted mid-sentence, giving "Revisit Your Monday".
- **G04-one-day:** "Choose an available day" contradicts rows that read "Proposed" but are spoken "Can be chosen".
- **G04-two-days:** a new template puts member names where the club's name goes.

Six notes:
- FQ46's hidden names can be worked out from the rest of the week (for the founder).
- The free Monday reads "Proposed for you" on screen but "Previously proposed for you" in VoiceOver.
- "Unavailable" has three meanings.
- G04-change's Not now hint talks about "choices".
- Home says "Up next" where Friends and spec 08 say "Next up".
- Nothing says what the review row shows once the viewer has confirmed.


**What was delivered, item by item**

- **G04-confirmed-others: what members outside the Friday contest see, and whether "Contested" chases or reveals who hasn't confirmed.** Not a problem as drawn. Maya sees "Contested · No reveal scheduled", and its label is "Friday. Contested. No reveal scheduled.". The row has no names (none in the SVG aria-labels either), no count and no action. The only button is Done. Monday names nobody. This matches the brief's interim FQ46 and FQ48 readings and T33/T36. The fact that the week as a whole identifies the contesters by elimination is recorded as R-11 (note, founder).
- **"Available / Proposed for you" on Ben's Monday (G04-conflict).** Allowed. The brief's Default says an abandoned proposal "is free and names nobody, except in Ben's own view", and only Ben's view carries the line. The difference between the drawn and spoken wording is recorded as R-12 (note).
- **G04-one-day: do the Proposed marks and the selectable proposed days obey FQ48 and avoid chasing?.** They obey FQ48. Another member's proposed day is selectable, and confirmed days in G04-two-days and G04-conflict have no selector. Naming members who haven't confirmed is allowed on day-picking screens only (brief section 5). There is no "Waiting for…", count, progress or reminder. The instruction's wording is recorded as R-09.
- **H01-confirm-days: "The club's week will appear here after a day is confirmed" and its CTA.** The CTA is fine. "Choose your day" is the viewer's own action, the brief asks for it, and nothing in it names, counts or pushes. The body is inaccurate under the Default: R-03.
- **+ Add on H01-unavailable and H01-access-lost.** Not a problem. It offers only Private draft, then Open my drafts, with no club target (deniedHeader.Add). Drafts belong to the author, with nullable hints (book p44, p46; T30; FQ15), so no upload destination is invented.
- **"Get help" on H01-unavailable, and what a suspended club reveals.** Not a problem. Get help opens the configured support contact (spec 22, FQ6) and invents no address. The header reads "Choose a club", not the club's name. The screen gives no reason, actor or duration, and Friends and Memories are denied too (handoff 3's suspendedVsPaused; T9, T14).
- **H01-access-lost: does it reveal anything about a club the viewer can no longer open (T9, T38)?.** No. The SVG holds no club name, either visible or in its aria-labels. The copy is neutral, nothing is painted from cache, and the club is left out of the switcher. That matches spec 22: a member who leaves loses club access.
- **H01-travelling: times, server countdown, status bar 6:01, "See captions", "Revisit Debby's Friday".** Correct for the fixture:
- the manifest's server_now of 2026-11-07T06:01Z and next reveal_at of 12:00Z give 5h 59m, the same as in New York (T1);
- 06:01 UTC is 1:01 AM EST and 6:01 AM GMT;
- the local time comes first with New York visible, which meets spec 05, book p29 and T2;
- See captions is spec 08's secondary action for an audience member;
- "Revisit Debby's Friday" follows FQ20.

The gaps are R-01 (countdown label) and R-06 (dates when local and club dates differ).
- **G05-local-times: whose days, with dates; FQ44.** Not a problem. It lists the club's generated occurrences, one per member, with exact dates. Friends already shows every member each person's next date (spec 09, book p13), and no hidden content appears. The dates follow FQ44: weekday and month as words. The DST ranges match the brief (4 hours from 25 to 31 October 2026 and from 14 to 27 March 2027).
- **G05-members-proposed: photo vs initials (FQ47), Manage invitations, who hasn't accepted (T15/T33).** Not a problem:
- initials, per FQ47's default and the brief;
- Ben's own photograph only;
- no statuses, weekdays or count;
- under FQ54 the screen exists only before anyone accepts;
- Manage invitations is creator-only and reached during setup (FQ51), and the link statuses stay on G01-invite-people.
- **G06-switcher-status: "Not started" and "Paused".** Not a problem. Both are plain secondary text with no count, date, lock or countdown, and nobody is named. Their labels begin with the visible words ("Sunday people. Not started. Selected.").
- **G05-schedule-review: the "Review the club's days" row and FQ52.** Matches FQ52. The row appears only in the week, with no count, no names, no badge, no push and nothing on Home. The hint's wording is R-02, and the row once the viewer has confirmed is R-16.
- **Counting, ranking, reminding, naming who hasn't acted, inferred pronouns, hidden-content leaks.** None found in screen-copy.json, the handoff5 copy keys or the SVG aria-labels. The only names of members who haven't confirmed are those the Defaults allow: the Proposed rows on the day-picking screens, and the choosers' own view of a contested day.

**Findings**

### R-01 · must · claude-design · confirmed

- **State:** H01-travelling (and every waiting Home): copy key handoff5.home.countdown.vo
- **Rule:** T47: "A countdown announces its target date, not every tick." Spec 08: "Announce the target date to screen readers without speaking every tick." Book p26: "Countdowns announce the target date instead of speaking every minute."
- **Finding:** The only spoken form delivered for the Home countdown gives the remaining time and no target date. That value changes every minute.
- **Evidence:** copy-contracts.json handoff5 "home.countdown.vo": "{durationSpoken} until opening." (provenance kind "new"). H01-travelling draws the countdown as "5h 59m" "until opening". Its screen-copy semanticGroups is empty, and no other key gives the countdown a date.
- **What the app does, and who acts:** Meanwhile the app labels the countdown with its target date, time and zone, using the delivered templates upcoming.local and upcoming.club, for example "Opens Saturday, November 7, 2026 · 12 PM · London" and "Saturday, November 7, 2026 · 7 AM · New York". The remaining time is read only on focus and is never re-announced as it ticks. The next brief asks for the wording.

### R-02 · should · claude-design · confirmed

- **State:** G05-schedule-review: hint of "View local times" (handoff5.schedule.localAction.hint)
- **Rule:** The delivery's own rule (IMPLEMENTATION.md): "If both zones are equal, show one time block per occurrence rather than duplicate equivalent values." T43: direct and factual copy.
- **Finding:** For a member who isn't travelling, the hint names the same zone twice.
- **Evidence:** screen-copy G05-schedule-review: "View local times" has the hint "Show dated opening and closing times in New York and New York.". copy handoff5 "schedule.localAction.hint": "Show dated opening and closing times in {clubZoneName} and {deviceZoneName}.". component-contracts localTimesSheet.entry: "View local times stays visible even when not travelling; equal zones show one block per occurrence."
- **What the app does, and who acts:** Meanwhile the app leaves out this optional hint when the phone's zone equals the club's, and uses the template only when they differ. The next brief asks for wording that names one zone.

### R-03 · should · claude-design · confirmed

- **State:** H01-confirm-days body (handoff5.home.confirm.body)
- **Rule:** Brief item 7 Default: "Once any day is confirmed, Home shows the next confirmed day, as H01-waiting does." The delivery's own firstDays.whenFirstConfirms: "Home resolves to the next confirmed occurrence". T43 (factual copy) and T49 (truthful states).
- **Finding:** The body says the club's week will appear on Home once a day is confirmed. By the Default, Home then shows only the next confirmed day, with its date and countdown. The week is in Schedule.
- **Evidence:** screen-copy H01-confirm-days: "The club’s days" and "The club’s week will appear here after a day is confirmed.". copy handoff5 "home.confirm.body" has the same text. component-contracts handoff5.firstDays.whenFirstConfirms: "Home resolves to the next confirmed occurrence; no unconfirmed person or guessed date."
- **What the app does, and who acts:** Meanwhile the app follows the rule: as soon as any day is confirmed, Home shows H01-waiting with the next confirmed day. It ships the delivered words and records the mismatch in INVENTORY.md's Known differences. The next brief asks for words that describe what Home will actually show.

### R-04 · should · claude-design · confirmed

- **State:** Read-only week (G04 after confirming, reused in G05) and Friends during a club's first days
- **Rule:** Brief section 5: "On the day-picking screens only, FQ48's reading replaces the handoff 3 brief's rule against naming who hasn't confirmed." Brief item 7 Default: "each day goes ahead as soon as its member confirms it". T15/T33. T49: a day nobody has confirmed doesn't open.
- **Finding:** Under the first-days Default, the read-only week and Friends will often hold days other members haven't confirmed yet, and the delivery defines no form for them. weekRows would draw a day that is still only proposed like a confirmed one: the owner named, implying a reveal. Friends has no row form for a member with no confirmed day. The delivery itself says the active roster and scheduled assignments must be visibly separated.
- **Evidence:** component-contracts handoff5.weekRows: singleLine "Weekday + owner, no empty subtitle space", unused "Weekday + No reveal scheduled, no owner", contested, Sunday, reviewRow, and no proposed state. confirmedOthers.notG05: "the same read-only public rows are reusable in G05". defaultsAssessment.firstDays: "must visibly separate active roster from scheduled assignments". Copy has calendar.week.assigned.vo "{weekday}. {personSpeech}." with no proposed variant, and no friends.* key for a member without a date.
- **What the app does, and who acts:** Meanwhile, in the read-only week, a day not yet confirmed reads "No reveal scheduled" with no name (handoff5.calendar.noReveal and calendar.emptyRow.vo). That is true, and it names nobody outside the day-picking screens. In Friends, that member's row keeps the name and photo, with no date line and no Add target, marked "built from spec". The next brief asks for both forms.

### R-05 · should · claude-design · confirmed

- **State:** Day-choice component: a contested day seen by a member who hasn't confirmed and didn't choose it
- **Rule:** Brief item 1 Default: "a day still only proposed for a member can be chosen by anyone who hasn't confirmed", extended to three or more choosers (FQ55). Brief FQ46 reading: only choosers see names.
- **Finding:** The design covers a contested day only from a chooser's side. For a member who hasn't confirmed and didn't choose that day, the row's form, whether it can be chosen and its label are all undefined. This happens in a club's first days, frame 12's fixture. The contested label always ends "Your choice", and the public label has no way to choose the day.
- **Evidence:** component-contracts handoff5.dayChoiceRow.contested: "Surface fill + inputBorder outline + Contested + participant names only for chooser + selected circle". choiceRules.taken: "Only another confirmed day is taken. Other proposals are selectable and become contested." choiceRules.participantVisibility: "everyone else receives Contested and No reveal scheduled". Copy: "calendar.row.contested.vo": "{weekday}. Contested. {chooserSpeech} Your choice."; "calendar.publicContested.vo": "{weekday}. Contested. No reveal scheduled."
- **What the app does, and who acts:** Meanwhile the server lets that member choose the day, since only confirmed days are taken. The app draws it in the public form without names, with an empty selection circle, the label calendar.publicContested.vo and the hint calendar.row.choose.hint, marked "built from spec". Once the member chooses it, they become a chooser and see the names (FQ46). The next brief asks for the state.

### R-06 · should · claude-design · adjusted

- **State:** H01-travelling: travelling Home templates when the local date differs from the club date
- **Rule:** T41: "A target always carries its exact date wherever a weekday alone could mislead." Spec 05: "Full dates appear when ambiguity is possible." T2. The delivery's own Friends rule: "including the club date when dates differ".
- **Finding:** Home's travelling lines give one date line and two times. When the phone's local date differs from the club's, one of the two times has no date. Example: a New York club with a member in Auckland, where Nina's Saturday at 7 AM in New York is 1 AM on Sunday 8 November. The contract puts the local date first, so the New York time then appears without its own date (Saturday). The plaque (SAT 07) has no rule for that case.
- **Evidence:** Copy handoff5: "home.date": "{fullDate}"; "home.localOpening": "Opens {openTime} · {deviceZoneName}"; "home.clubOpening": "{openTime} · {clubZoneName}". component-contracts travellingRows.Home: "Local exact date/time first, club-zone equivalent visible". Compare travellingRows.Friends: "... with full club date when local dates differ". upcoming.club carries {clubOpenFullDate}. T41: "A target always carries its exact date wherever a weekday alone could mislead." Spec 05: "Full dates appear when ambiguity is possible."
- **What the app does, and who acts:** Meanwhile, when the two dates differ, the app writes each line with its full date using the delivered upcoming.local and upcoming.club templates, so no time appears without its date. When the dates match, it uses the drawn form. The plaque keeps the occurrence's club date, as the occasion title does. The next brief asks for the Home form and the plaque's rule.
- **Second reviewer's correction:** The core gap is real. Home's travelling lines are home.date "{fullDate}", home.localOpening "Opens {openTime} · {deviceZoneName}" and home.clubOpening "{openTime} · {clubZoneName}". When the two dates differ, one time is left without a date, and the plaque (SAT 07) has no rule. The Auckland example is correct: 7 AM EST on 7 November 2026 is 1 AM NZDT on 8 November. Two details are wrong. First, the delivery does say which zone the date line follows: travellingRows.Home says "Local exact date/time first", so the date line is the local date, and it is the club time and the plaque that are left undefined. Second, Add's hint is not a problem: "opening Saturday, November 7, 2026 at 7 AM in New York" is a full, exact date in the club zone.

### R-07 · should · app · confirmed

- **State:** G04-change kept dates (handoff5.change.keptDates, change.preservedRow.vo)
- **Rule:** Spec 05: clubs of four to six get one day each, and occurrences are generated "several weeks ahead". FQ61 default: every occurrence already generated is announced. The delivery's own rule: "Native ListFormatter supplies person/day lists". The brief's Return asks for every reusable string as a template.
- **Finding:** The kept-dates line and its label hold exactly two dates per person. They can't show one kept date (clubs of four to six) or more than two (a boundary several weeks out, as FQ61's default implies).
- **Evidence:** Copy handoff5 "change.keptDates": "{firstFullDate} · {secondFullDate}"; "change.preservedRow.vo": "{personSpeech}. {firstFullDate} and {secondFullDate}. Announced dates unchanged.". component-contracts changeRows.kept: "Two person groups, each contains the two exact preserved dates". Spec 05: "Generate upcoming occurrences several weeks ahead." QUESTIONS.md (PR #13) FQ61 default: "every occurrence already generated is announced".
- **What the app does, and who acts:** Meanwhile the app takes the list of kept dates from the server and joins it with the system list formatter in the same words: "·" on screen and "and" when spoken, for any number of dates.

### R-08 · should · claude-design · confirmed

- **State:** Self occasion inside sentences (handoff5.occasion.self in home.revisit, home.addFor.hint, home.captions.hint, friends.row.hint)
- **Rule:** T43: plain, correct copy. The delivery's own selfName.occasions: "Your {weekday} when referring to self in a sentence".
- **Finding:** The self occasion has only one form, capitalised, and four templates insert it mid-sentence. After the viewer's own day closes, Home reads "Revisit Your Monday". The hints read "Add to Your Monday, opening …", "Open captions for Your Monday." and "Open Your Monday."
- **Evidence:** Copy handoff5: "occasion.self": "Your {weekday}"; "home.revisit": "Revisit {occasionTitle}"; "home.addFor.hint": "Add to {occasionTitle}, opening {fullDateTime} in {clubZoneName}."; "home.captions.hint": "Open captions for {occasionTitle}."; "friends.row.hint": "Open {occasionTitle}.". component-contracts selfName.occasions: "Your {weekday} when referring to self in a sentence".
- **What the app does, and who acts:** Meanwhile the app writes "your" in lower case when the occasion isn't at the start of a sentence. Only the casing changes, not the words. The next brief asks for both forms.

### R-09 · note · claude-design · adjusted

- **State:** G04-one-day instruction against the proposed rows
- **Rule:** Brief FQ48 reading: a day still only proposed for someone else can be chosen by anyone who hasn't confirmed. Brief item 1: the states "each look different, in words". Spec 03: the same noun everywhere.
- **Finding:** The instruction says to choose an "available" day, while "Available" is also the name of the free-day state. No row in G04-one-day reads Available: the other five read "Proposed", each with an empty selection circle. The overlap of words may suggest that proposed days are held, though the circles show they can be chosen.
- **Evidence:** screen-copy G04-one-day draws "Choose an available day, then confirm." and the rows "Maya" "Proposed" through "Nina" "Proposed". Their labels read "Tuesday. Maya. Proposed. Can be chosen." and so on. Copy handoff5: "calendar.one.body"; "calendar.state.available": "Available". IMPLEMENTATION.md: "Another member’s proposed day has an owner, an outlined diamond and Proposed words, plus an empty selection circle."
- **What the app does, and who acts:** The app builds it as delivered. The server follows FQ48 (only confirmed days are taken), and the proposed rows can be selected as drawn. A later brief may ask for an instruction that doesn't reuse the state word.
- **Second reviewer's correction:** The words are as cited. G04-one-day draws "Choose an available day, then confirm.", and every other row reads "Proposed", with the label "... Proposed. Can be chosen.". But the drawing and the speech don't disagree on FQ48. The proposed rows draw the same empty selection circle as a free row (IMPLEMENTATION: "Another member’s proposed day has an owner, an outlined diamond and Proposed words, plus an empty selection circle"), so the screen shows they can be chosen. "available" in the instruction is plain English. All that remains is that the word overlaps with the "Available" state label. That is a note, not a gap the build must handle.

### R-10 · should · app · confirmed

- **State:** G04-two-days club line (new key handoff5.calendar.peopleZone)
- **Rule:** Spec 04: Ben names the club, so every club has a name. Handoff 4's IMPLEMENTATION.md: "The title names the resolved club ... Do not invent a pair club name." Spec 03: the club's name identifies the context. 2.1's G04-two-days reads "A two-person club · Ben and Debby".
- **Finding:** The redraw puts the members' names in the slot where G04-one-day and G04-conflict put the club's name, and adds a reusable template for it. A build could then show member names instead of a pair club's own name.
- **Evidence:** screen-copy G04-two-days: "Ben and Debby · New York". Copy handoff5 "calendar.peopleZone": "{memberNames} · {clubZoneName}" (kind "new"), beside "calendar.clubZone": "{clubName} · {clubZoneName}" (G04-one-day: "Sunday people · New York"). Spec 04: the creator names the club. Brief item 4: "The club has no name in the book: don't invent one; leave it out".
- **What the app does, and who acts:** Meanwhile the app writes G04's club line from calendar.clubZone with the club's own name, for every club size, and never uses calendar.peopleZone. It records "Ben and Debby" as a fixture stand-in in INVENTORY.md's Known differences, as the earlier check did for handoff 2's pair title (R-05 there).

### R-11 · note · founder · confirmed

- **State:** G04-confirmed-others: FQ46's hidden names
- **Rule:** Brief FQ46 reading: "Only the people who chose the day see names on it. The others see that the day isn't settled yet, without names or a count."
- **Finding:** The contested row has no names, but the week around it names every confirmed member. In the fixture, Maya can tell that the two members missing from the week, Ben and Debby, are the ones on Friday. Any public form, plain "No reveal scheduled" included, gives this away whenever the people in the clash are the only members without a day. The founder report records this kind of disclosure for FQ48, not for FQ46.
- **Evidence:** screen-copy G04-confirmed-others: "Monday" "No reveal scheduled"; "Tuesday" "Maya · You"; "Wednesday" "Alex"; "Thursday" "Sam"; "Friday" "Contested" "No reveal scheduled"; "Saturday" "Nina". Brief Content: Sunday people is Ben, Maya, Alex, Sam, Debby and Nina. Brief section 2, FQ48: "Friends and Home show it anyway".
- **What the app does, and who acts:** Meanwhile the app builds it as delivered: no names on the public row or in its label. With FQ46, the founder is told that hiding the names doesn't hide who is in the clash in a full club, in case that changes the answer.

### R-12 · note · claude-design · confirmed

- **State:** G04-conflict: Ben's abandoned Monday
- **Rule:** Brief item 1: the five states "each look different, in words and in form". Book p34: "A component has one shape, one meaning."
- **Finding:** The free Monday reads "Available" with "Proposed for you" beneath it, which puts the proposed state's word on a free row. VoiceOver says "Previously proposed for you", which is clearer but isn't what is drawn.
- **Evidence:** screen-copy G04-conflict draws "Monday" "Available" "Proposed for you". Its label is "Monday. Available. Previously proposed for you. Not selected.". Copy handoff5: "calendar.earlierSelfProposal": "Proposed for you"; "calendar.row.earlierSelf.vo".
- **What the app does, and who acts:** The app builds it as delivered. The line is shown only to the member it was proposed for, as the brief allows. A later brief asks whether the drawn line should match the spoken one.

### R-13 · note · claude-design · adjusted

- **State:** "Unavailable" in the day-choice labels and the switcher
- **Rule:** Book p41: "Withdrawn/Unavailable = access removed." Book p34: one shape, one meaning. Spec 03: the same noun everywhere. The delivery's own controlLabels.rule: "Native selected/disabled traits remain native."
- **Finding:** "Unavailable" names a confirmed day that can't be chosen (in VoiceOver) and a suspended club (in the switcher). In the book it means access removed. The day-row use came from handoff 3.
- **Evidence:** Copy handoff5: "calendar.row.confirmed.vo": "{weekday}. {personSpeech}. Confirmed. Unavailable."; "switcher.unavailable": "Unavailable". Handoff 3: "G04.conflict.vo.Tuesday": "Tuesday. Maya’s day. Assigned and unavailable."; "switcher.unavailable.vo": "{clubName}. Unavailable.". Book p41: "Withdrawn/Unavailable = access removed." screen-copy G04-two-days lists no confirmed row among its controls.
- **What the app does, and who acts:** The app builds it as delivered. A later brief may ask for a different spoken word for another member's confirmed day.
- **Second reviewer's correction:** The word is used as cited, but two parts of the finding are wrong. The use isn't new to handoff 5: handoff 3 already said "Tuesday. Maya’s day. Assigned and unavailable." and "switcher.unavailable.vo": "{clubName}. Unavailable.". Handoff 5 adds the visible switcher word, which the brief asked for. And confirmed rows aren't controls: screen-copy G04-two-days lists only Monday, Wednesday, Thursday and Saturday as controls, so there is no native dimmed trait for "Unavailable" to repeat. What remains is that one word carries more than one meaning.

### R-14 · note · claude-design · confirmed

- **State:** G04-change Not now hint (handoff5.calendar.notNow.hint, reused)
- **Rule:** T43: copy is direct and factual.
- **Finding:** G04-change's Not now hint speaks of "your current choices", but this screen has no choices: it confirms a proposed change.
- **Evidence:** screen-copy G04-change: control "Not now", hint "Keep your current choices and return.". Copy handoff5 "calendar.notNow.hint" has the same text and is used on the day-choice screens.
- **What the app does, and who acts:** The app builds it as delivered. A later brief asks for G04-change's own hint.

### R-15 · note · app · confirmed

- **State:** Home "Up next" against Friends "Next up" (handoff5.home.upNext)
- **Rule:** Spec 03: "Use the same noun on every platform". Spec 08: "Home shows Next up Nina, Saturday 7 November at 7 AM". Book p7: "A small Next up label".
- **Finding:** Home's new key says "Up next", while Friends and its VoiceOver say "Next up", and spec 08 uses "Next up" for Home itself. 2.1's Home renders draw "UP NEXT".
- **Evidence:** Copy handoff5: "home.upNext": "Up next"; "friends.nextUp.vo": "Next up. ". Handoff 3 "F01.nextUp": "Next up". H01-travelling draws "Up next". 2.1/H01-after-close.png draws "UP NEXT". Spec 08: "Home shows Next up Nina, Saturday 7 November at 7 AM".
- **What the app does, and who acts:** The app builds it as delivered, since it matches 2.1's H01 renders. It records the difference in INVENTORY.md's Known differences, and a later brief asks for one phrase.

### R-16 · note · claude-design · confirmed

- **State:** G05 "Review the club’s days" row (and Club details' "New days to review") after the viewer has confirmed a change
- **Rule:** FQ52: no push and nothing on Home. T15/T33: no count, no names of who hasn't confirmed, no "Waiting for…".
- **Finding:** Nothing says what the review row, or handoff 3's Club details line, shows once the viewer has confirmed and others haven't. "To review" is then no longer true for that viewer, and the obvious replacement, a waiting line, is ruled out by T33.
- **Evidence:** component-contracts handoff5.weekRows.reviewRow: "Top of current week; Review the club’s days + exact proposed start; no confirmation count.". Copy handoff5 "schedule.review": "Review the club’s days". Handoff 3 "G04.change.detailsPending": "New days to review" and "G04.change.saved.body": "The current days continue while this change is being confirmed."
- **What the app does, and who acts:** Meanwhile the app keeps the same row and words for every member until the change is confirmed or replaced. The row opens G04-change, which shows handoff 3's saved state. The app never adds a count, names or a waiting line. A later brief asks what the row shows after the viewer confirms.


**Found by the second reviewer**

### RM-01 · should · app

- **State:** Replacement map: earlier keys for the controls this delivery redraws (G04-conflict, H01-unavailable)
- **Finding:** The delivery says the current UI picks keys through its replacement map, but several earlier keys for controls it redraws are left out of the map, so they still count as current. Some break the brief's own rules. "day choice conflict" is the name the brief asked to retire for one name everywhere. "...and wait" asks the person to wait. "Choose another club explicitly." doesn't start with the visible "Choose a club". The new handoff5 keys that take their place are marked "new" and name no earlier key.
- **Evidence:** Not in handoff5.replaces: handoff3 "G04.conflict.confirm.vo": "Confirm Friday. Unavailable while Friday has a day choice conflict."; "G04.conflict.friday.hint": "Choose another available weekday, or keep this choice and wait."; "G04.conflict.assigned": "{name} · Assigned"; "H01.unavailable.choose.vo": "Choose another club explicitly."; "H01.suspended.vo": "This club is unavailable. Friends and Memories can’t be opened for this club.". handoff5 provenance: calendar.confirm, calendar.confirm.contested.hint, calendar.state.confirmed, home.unavailable.title, home.help each {"replaces": [], "kind": "new"}. screen-copy H01-unavailable: "Choose a club", label "Choose a club". IMPLEMENTATION.md: "Current UI selects the H5 key through the replacement map." Brief item 1: "One name for the state, on screen and in every VoiceOver label"; Return: "naming the earlier key each one replaces".
- **What the app does, and who acts:** Meanwhile the app takes every visible string, label and hint for the 13 frames from handoff 5's screen-copy.json and handoff5 keys. The ios thread records the earlier handoff 3 keys for the same controls (listed above) as superseded in its copy mapping, so none of them ships.

### RM-02 · should · app

- **State:** G06-switcher-status: the selected club's VoiceOver label (handoff5.switcher.row.selected.vo)
- **Finding:** The selected club's label spells out "Selected.", while the same delivery says the selection comes from the native selected trait. VoiceOver would then say "selected" twice.
- **Evidence:** Copy handoff5 "switcher.row.selected.vo": "{clubName}. {stateLabel}. Selected.". screen-copy G06-switcher-status: "Sunday people", label "Sunday people. Not started. Selected.". component-contracts switcherStatus.selected: "Native checkmark + spoken selected trait"; controlLabels.rule: "Native selected/disabled traits remain native." IMPLEMENTATION.md: "the selected club has the native checkmark and selected trait".
- **What the app does, and who acts:** Meanwhile the app labels every switcher row with switcher.row.vo ("{clubName}. {stateLabel}.") and lets the native selected trait announce the selection.

### RM-03 · should · claude-design

- **State:** Day-choice rows already chosen (G04-one-day Monday, G04-two-days Monday and Thursday, G04-conflict Friday)
- **Finding:** Rows the viewer has already chosen carry the hint "Choose {weekday}.". On the two-day screen, activating a chosen row clears it. On the one-day screen it does nothing. Either way the hint isn't true (T43: direct and factual).
- **Evidence:** Copy handoff5 "calendar.row.choose.hint": "Choose {weekday}." is the only row hint. screen-copy G04-one-day: Monday, label "Monday. Ben, you. Your choice.", hint "Choose Monday.". G04-two-days: Monday and Thursday, labels "... Your choice.", hints "Choose Monday." and "Choose Thursday.". G04-conflict: Friday, label "Friday. Contested. Ben, you. Debby. Your choice.", hint "Choose Friday.". Book p11: "the confirmation enables only for two choices".
- **What the app does, and who acts:** Meanwhile the app gives a row the viewer has already chosen no hint. Hints are optional, and the label already says "Your choice". A later brief asks for that row's hint.


## Brand, visuals, native iOS and accessibility

**Summary.** Brand, visuals, native iOS and accessibility check of handoff 5. I viewed all 13 phone PNGs and the brand sheet, and compared them with the closest 2.1 renders (G04-one-day, G04-two-days, H01-after-close, H01-waiting, G06-switcher) and with handoff 3 and 4 frames. I also parsed every SVG: text size, weight and ink (weights from Arimo advance widths via fontTools), rects, strokes, separators and pixels. I checked screen-copy.json's 70 control rects against the drawn geometry, and computed WCAG contrast from the hex values.

**The brand holds.**
- Every text run maps to a named role.
- Every target is at least 44 pt.
- Every text pair passes 4.5:1. The lowest is secondaryText on surface at 4.64:1. Disabled Confirm Friday is 5.42:1 in light and 5.70:1 in dark.
- The handoff 3/4 visual findings are fixed: V-01 contested red, V-02 one day-choice design, V-03 the 14-pt inset, V-04 labels, V-06 Ben · You bold, V-08 named spacing, V-10 card status and lock.

**The brand sheet is a superset of handoff 4's.**
- All 203 of handoff 4's text runs are kept, except the 8 runs inside the two corrected collecting cards.
- Over handoff 4's area, pixels differ (2% fuzz) only inside those two card specimens.
- What it adds: an H5 section with six day-row specimens (Available, Proposed, Confirmed, Your choice, Contested, Sunday), 7 rule lines, a title and a footer.
- The light card's sender name goes from 14 pt to the 17-pt row role.
- Missing from the sheet: the new waiting-hero plaque pairing, the travelling card, the denied header, the switcher status rows, the review row, and any dark specimen of the new rows.

**Two must-fix problems, both in the contracts:**
- waitingHero's plaque reads at 1.16:1 in dark appearance.
- The travelling Home's countdown and card have no spoken target date (T47).

**Should-level problems in the one day-choice design:**
- Each filled row is its own rx-12 rounded rect, touching the next and leaving notches. This is not a native List.
- One surface fill now means both 'your choice' and 'someone else's confirmed day'.
- Selection is drawn three ways across the delivery.
- One-line Available rows keep an empty second line.
- G04-change's Sunday row sits 16 pt off the layout's 20-pt edge.
- The contested row breaks the two-column grid.

**Notes:**
- Both sheets are drawn schematically rather than as iOS's own.
- G06's background is not H01-awaiting-activation as drawn.
- The denied header changes ink.
- The mostly empty Homes join FQ53.
- A few gaps are off the delivery's own spacing values.

Files: delivery in /tmp/claude-0/-home-claude-tadayo/7ad06db5-d9b8-56e3-befa-0262075a1ed1/scratchpad/h5x/u5/; my measurement script /tmp/claude-0/-home-claude-tadayo/7ad06db5-d9b8-56e3-befa-0262075a1ed1/scratchpad/tools5/svgtext.py; crops in /tmp/claude-0/-home-claude-tadayo/7ad06db5-d9b8-56e3-befa-0262075a1ed1/scratchpad/bc5/ (notch.png, card1cmp.png, card2cmp.png, h5added.png, g05cmp.png).


**What was delivered, item by item**

- **Handoff 3/4 V-01: contested day in destructive red.** Fixed. The G04-conflict contested rect is fill #F0F2EC with stroke #778579 (inputBorder) and primaryText words. #AD3529 appears in no H5 phone frame, only in the kept brand-sheet specimens.
- **Handoff 3/4 V-03: contested row text 14 pt inside its outline.** Fixed and named. Text starts at x=36 with the outline at x=20, a 16-pt inset (component-contracts handoff5.dayChoiceRow.contentInset 16). The contested slot is 88 (contestedMinimumHeight 88).
- **Handoff 3/4 V-02: one day-choice shape across one-day, two-day and conflict.** Delivered: G04-one-day, G04-two-days and G04-conflict share dayChoiceRow (353 wide, 64 min, first column 112, gap 16). Free and confirmed now differ in form: no fill plus an empty circle, against surface fill plus a check with Confirmed and no circle. The form issues that remain are V-03 to V-07 below.
- **Handoff 3/4 V-06: G05 'Ben · You' weight and the zone line's role.** Fixed. In G05-schedule-review, 'Ben · You' is 17 pt bold (row) at y=352 and y=496, and the zone 'New York' is 13 pt regular #607067 (metadata), as in G04-change.
- **Handoff 3/4 V-07/V-08: unnamed spacing (17-pt buttons, 77-pt title gap, 55/50 pitches, 57-pt rows).** Named in handoff5.spacing: noClubButtonGap 16, homeTitleToBody 24, changePersonRowPitch 48, weekSingleLineRow 48, weekRealSubtitleRow 56. Verified: G04-change person baselines 364, 412 and 498, 546, 594 (pitch 48); G05-schedule-review separators every 48 (371 to 611), Sunday 611 to 667 (56). Small deviations are in V-17.
- **Handoff 3/4 V-10: collecting card status line and lock.** Both sheet specimens now read 'Opens Friday, November 13, 2026 · 7 AM', with a 12-pt lock and an 8-pt gap. Status to caption is 16 (light: status baseline 246, caption 288; dark: 4613 to 4655). The light card's sender 'Maya' moved from 14 pt to the 17-pt row role.
- **Handoff 3/4 V-04: VoiceOver labels that drop the visible words.** Every control label in screen-copy.json for the 13 frames starts with its visible words, with extra words in hints. Not now, View local times, Review members and the other named controls are remapped in the replacement map.
- **Brand sheet keeps everything handoff 4's sheet had.** Yes. All 203 handoff 4 text runs are present, except 8 runs in the two corrected collecting cards (status, caption, avatar and name moved by the lock). An ImageMagick difference over handoff 4's 1200x5780 area (2% fuzz) finds changes only inside those two card specimens (px 93..629 x 457..709 and 133..669 x 10953..11198). Added: the 'Handoff 5' section at y>=5800, with the six day-row specimens, SundayRow, 7 rule lines and a footer.
- **Disabled 'Confirm Friday' styling and contrast.** Token pair actionDisabled #E2E6DF with onActionDisabled #4F5E55, 16-pt bold text: 5.42:1 light and 5.70:1 dark (#BAC6BD on #35463A). The fill against canvas is 1.22:1, which WCAG exempts for inactive controls. Same treatment as handoff 3.
- **Targets of at least 44 pt.** All 70 control rects in screen-copy.json are at least 44 in both dimensions, and each matches the drawn geometry. Back is 44x44; Not now in the nav bar is 86x44; choice rows are 353x64 and 353x88; switcher rows are 353x64; tabs are 131x59; header Add is 59x44; Account is 44x44.
- **Text contrast of at least 4.5:1.** secondaryText on canvas is 5.04 and on surface 4.64. Action on canvas is 6.43 and on surface 5.92. All text on the accent card is onAccent #182B25 at 11.60. In dark, secondary on surface is 7.58. No secondary text sits on the yellow card.
- **Type sizes and weights against the named roles.** Every measured run maps to a role: 32 bold utilityTitle; 31 bold dayTitle (title, countdown); 25 bold dateTitle ('Saturday, November 7', 'Monday, November 16, 2026', 'Your clubs'); 17 regular body; 17 bold row; 16 bold button and clubHeader; 16 regular textAction; 15 bold headerAdd; 13 regular metadata; 13 bold eyebrow; 11 tab; plaque 10 bold and 25 bold.
- **Whether the date plaque belongs on the G04 choice screens.** Answered: omitted on all three (dayChoiceRow.datePlaque false, 'A recurring unconfirmed assignment is not an announced dated occurrence'). H01-travelling's plaque matches handoff4 dayPlaque: 45x55, rx 9, SAT 10 bold and 07 25 bold. It is a pale plaque on the accent card, as 2.1's H01-after-close draws it.
- **G06-switcher-status labels and counts.** 'Not started' and 'Paused' are 13-pt regular #607067, with no count, lock or date (switcherStatus.counts false). The selected club has a trailing checkmark in the action tint, as iOS's own list checkmark.

**Findings**

### V-01 · must · claude-design · confirmed

- **State:** H01-travelling (waitingHero contract), dark appearance
- **Rule:** T44 ('The dark theme is a real dark theme'); book p26 ('Semantic tokens include their foreground pairs'); T47; WCAG 1.4.3
- **Finding:** The new waitingHero contract pairs a canvas-filled plaque with onAccent ink for all text on the card. In dark, canvas becomes #121D19 and onAccent stays #182B25, so the plaque's weekday and day read at 1.16:1. Only the light frame is drawn. The validation report checks no plaque pair, and the sheet has no dark plaque specimen.
- **Evidence:** component-contracts handoff5.waitingHero: fillToken 'accent', allTextToken 'onAccent', plaqueOnAccentFillToken 'canvas'. H01-travelling.svg: <rect x="36" y="224" width="45" height="55" rx="9" fill="#FAFBF8"/>, with 'SAT' and '07' filled #182B25. brand-tokens dark: canvas #121D19, onAccent #182B25. Computed: #182B25 on #121D19 = 1.16:1. validation-report contrast checks only primaryText/canvas, secondaryText/surface, action/canvas, onAction/action, onAccent/accent and onCover2/cover2.
- **What the app does, and who acts:** Meanwhile the app pairs the plaque fill with canvas's own foreground (primaryText). In light that matches the frame (#182B25); in dark it gives #F7F8F2 on #121D19. The PR notes the deviation. The next brief asks Claude Design for the plaque's dark pairing on the accent card, with a dark specimen.

### V-02 · must · claude-design · confirmed

- **State:** H01-travelling
- **Rule:** T47 ('A countdown announces its target date, not every tick'); book p26 ('Countdowns announce the target date'); T2 and book p29 (the local equivalent with the club zone available)
- **Finding:** No spoken label is given for the travelling waiting card, and the countdown's template speaks only a duration. The one spoken time on the screen is New York's, while the visible card leads with London. Built as written, a VoiceOver user hears '5 hours 59 minutes until opening' with no date, and hears only 7 AM New York from Add for Nina.
- **Evidence:** screen-copy.json H01-travelling: "semanticGroups": []. copy-contracts handoff5.home.countdown.vo = '{durationSpoken} until opening.'. Add for Nina hint: 'Add to Nina’s Saturday, opening Saturday, November 7, 2026 at 7 AM in New York.' (home.addFor.hint '…opening {fullDateTime} in {clubZoneName}.', with no device-zone variant). Drawn: 'Saturday, November 7', 'Opens 12 PM · London' (17 bold), then '7 AM · New York' (13 regular).
- **What the app does, and who acts:** Meanwhile the app groups the card into one element. Its label is built from the delivered visible strings: occasion, date, home.localOpening and home.clubOpening, then the countdown, so the target date and both zones are spoken (T47). The next brief asks Claude Design for the waiting card's label and a travelling Add hint.

### V-03 · should · claude-design · confirmed

- **State:** G04-conflict, G04-one-day, G04-two-days (and the sheet specimens)
- **Rule:** T45 (native List); book p34 (one shape); dayChoiceRow.prototypeControl ('Native List selection … drawings are schematic')
- **Finding:** Each filled choice row is drawn as its own rounded rectangle (rx 12) that touches the next. Canvas shows in a wedge at every join, and the 1-pt separators are painted across the fills. Neither a native List row background nor an inset-grouped section looks like this. The build has no rule for adjacent filled rows: separate rounded surfaces with a gap, or one container.
- **Evidence:** G04-conflict.svg: <rect x="20" y="344" width="353" height="64" rx="12" fill="#F0F2EC"/>, then the same at y=408, 472, 536 (88, with stroke #778579) and 624. Separators <rect x="36" y="407" width="321" height="1" fill="#DCE2DA"/> are drawn over the fill above. G04-two-days: abutting fills at 280/344 and 472/536.
- **What the app does, and who acts:** Meanwhile the app builds the rows as a native List with surface row backgrounds, as the contract's prototypeControl says. The inventory row records that the join differs from the frame. The next brief asks Claude Design how adjacent filled rows meet.

### V-04 · note · claude-design · adjusted

- **State:** G04-one-day, G04-two-days, G04-conflict
- **Rule:** Book p34 ('A component has one shape, one meaning'); the brief's item 1 (each state looks different 'in words and in form'); book p11
- **Finding:** The viewer's own choice and another member's confirmed day share the same faint surface fill. In G04-two-days, Ben's Monday and Debby's Tuesday read as one grey block, as do Thursday and Friday. Words and the selection circle still tell them apart, so the brief's rule is met. 2.1 gave the own choice its own tint.
- **Evidence:** handoff5.dayChoiceRow: otherConfirmed 'Surface fill + owner + check/Confirmed words, no selection circle'; ownChoice 'Surface fill + self name/You + native selected circle + Your choice'. G04-two-days.svg: fills #F0F2EC at y=280 (Ben, filled circle), 344 (Debby, no circle), 472 (Ben) and 536 (Debby). Computed: #F0F2EC on #FAFBF8 = 1.09:1. 2.1 G04-two-days: own tiles tinted with an action border, Debby's tiles grey.
- **What the app does, and who acts:** Meanwhile the app builds as contracted. Words and accessories carry each state (T44 met). The inventory row notes the shared fill. A later brief may ask whether the own choice keeps a form of its own, as in 2.1.
- **Second reviewer's correction:** The facts are right: own and confirmed rows share #F0F2EC, and surface on canvas is 1.086:1. But the brief's item 1 asks only that the five states differ 'in words and in form, never by colour alone', and they do. Own has 'Ben · You', 'Your choice' and a filled selection circle. Confirmed has a small check, 'Confirmed' and no selector. The fill also has one consistent meaning: the day is held (own, confirmed or contested). What is left is visual: adjacent own and confirmed rows merge into one grey block, which is mostly V-03's join, and 2.1's own-choice tint is gone. That is a note, not a should.

### V-05 · note · claude-design · adjusted

- **State:** G04-conflict, G04-one-day, G04-two-days, G06-switcher-status
- **Rule:** Book p34 (one shape, one meaning); T45 (native controls); handoff3.G04ChoiceRow.selectionAccessory ('native checkmark + spoken selected state'), which handoff5.dayChoiceRow replaces
- **Finding:** Selection is drawn two ways. G06 marks the selected club with a trailing checkmark. G04 marks a chosen day with a trailing filled circle, and an empty circle when not chosen; that is not iOS's usual single-choice idiom on G04-one-day. A small grey check also marks 'Confirmed'. The change from handoff 3's native checkmark is a stated replacement.
- **Evidence:** G06-switcher-status.svg: trailing path 'M5 12 L10 17 L20 6' stroke #284CDB. G04-one-day.svg: <circle cx="347" cy="300" r="10" fill="#284CDB"/> with a white check; unselected <circle … r="10" fill="none" stroke="#778579"/>. G04-conflict: check stroke #607067 at scale 0.5 before 'Confirmed'. handoff5.replaces 'handoff3.G04ChoiceRow': 'handoff5.dayChoiceRow'; dayChoiceRow.prototypeControl 'Native List selection with SF circle/checkmark.circle.fill accessories'.
- **What the app does, and who acts:** Meanwhile the app builds each as contracted: circle and checkmark.circle.fill on G04, the native checkmark on G06. The inventory records the two idioms. A later brief may confirm one selection mark.
- **Second reviewer's correction:** The drawings are as described, but this is not a defect against handoff 3. component-contracts handoff5.replaces maps handoff3.G04ChoiceRow to handoff5.dayChoiceRow, whose prototypeControl names 'SF circle/checkmark.circle.fill accessories'. So dropping the native checkmark is a stated replacement. The Confirmed mark is a different, smaller glyph in secondary ink beside words, and it never appears on a selectable row. What remains is that the delivery uses two selection idioms: a checkmark in the G06 switcher and circles on G04. That is worth recording, not a should.

### V-06 · note · claude-design · confirmed

- **State:** G04-one-day (Proposed day) vs the brand's proposedMemberTag
- **Rule:** Book p34 (one shape, one meaning)
- **Finding:** The word 'Proposed' now has two forms in the brand. A proposed member gets handoff 2's bordered tag. A proposed day gets an outlined diamond and 13-pt regular secondary text. The meaning, not yet confirmed, is close.
- **Evidence:** component-contracts proposedMemberTag: fill surface, border inputBorder, radius 6, proposedTag 13/18 bold, primaryText (sheet specimen 'Leila … Proposed'). G04-one-day.svg: path 'M170 379 L176 385 L170 391 L164 385 Z' stroke #607067, then 'Proposed' at 13 pt, #607067, x=184.
- **What the app does, and who acts:** Meanwhile the app builds each as contracted. The next brief asks whether a proposed day and a proposed member should share the tag.

### V-07 · should · claude-design · adjusted

- **State:** G04-two-days (Wednesday, Saturday), sheet specimen 'Monday Available'
- **Rule:** The brief's spacing item (G05's rows 'with a line's space left empty'); handoff5.weekRows.singleLine ('no empty subtitle space'); T45 (native List rows centre their content)
- **Finding:** The defect the delivery fixed on G05 remains on the choice rows. A one-line Available row keeps the 64-pt minimum, with its text and circle at the top and an empty second line below.
- **Evidence:** G04-two-days.svg: separators at y=407 and 471 bound Wednesday's row (64 pt). 'Wednesday' and 'Available' sit at baseline 433, 38 pt above the next separator, and the circle at cy=428. Saturday is the same (599 to 663, baseline 625, cy=620). dayChoiceRow.minimumHeight 64 with no one-line variant, against weekRows ordinaryMinimumHeight 48 and singleLine 'Weekday + owner, no empty subtitle space'.
- **What the app does, and who acts:** Meanwhile the app builds the contracted 64-pt minimum with the content vertically centred, as a native List row does, and records the difference on the inventory row. The next brief asks for a one-line choice row height, or confirms 64 with centred content.
- **Second reviewer's correction:** The defect is real and visible on the contact sheet: Wednesday and Saturday 'Available' sit at the top of a 64-pt row with an empty band below. Two measurements in the evidence need correcting. Wednesday's baseline 433 is 38 pt above the next separator (471), not 33. The selection circle is centred at y=428, not at the row's centre (about 440), so the whole row is top-aligned. dayChoiceRow has minimumHeight 64 and no one-line variant, while weekRows.singleLine says 'no empty subtitle space'.

### V-08 · should · claude-design · adjusted

- **State:** G04-change (Sunday row), G04-confirmed-others
- **Rule:** Book p35 ('Standard inset 20 points'); book p34 (one shape)
- **Finding:** In G04-change, the shared SundayRow keeps its list inset inside a layout that has none. The person groups start at x=20, but Sunday and Revisit start at x=36 and x=164. Its separator is inset 36 to 357, while the section separator runs 20 to 373.
- **Evidence:** G04-change.svg: 'Ben · You', 'Debby' and 'Maya' at x=20; 'Sunday' at x=36 and 'Revisit' at x=164 (baseline 648); <rect x="36" y="680" width="321" height="1"/> against <rect x="20" y="447" width="353" height="1"/>. By contrast, G04-confirmed-others' 36/164 grid matches the unfilled rows of G04-one-day.
- **What the app does, and who acts:** Meanwhile the app builds as drawn and lists the misalignment on G04-change's inventory row. The next brief asks Claude Design to set SundayRow's inset where it stands outside a list.
- **Second reviewer's correction:** The G04-change part holds. The person groups start at x=20 and the section separator runs 20 to 373. The shared SundayRow puts 'Sunday' at x=36 and 'Revisit' at x=164, with its separator at x=36, width 321. On the contact sheet, Sunday sits visibly indented under Maya. The G04-confirmed-others part does not hold. Its rows use the same 36/164 grid and the same 36-to-357 separators as the unfilled rows of the three choice screens (e.g. G04-one-day's Tuesday to Saturday, under headers at x=20). So it continues the day-choice list's inset rather than adding a stray one.

### V-09 · note · claude-design · adjusted

- **State:** G04-conflict (contested row), G04-confirmed-others (public contested row)
- **Rule:** Book p34 (one shape); the brief's item 1 (how Ben's own name reads inside a status); T47 (shown and spoken words agree)
- **Finding:** The contested row leaves the two-column grid the other rows keep. 'Contested' takes the owner column, and the choosers move to a full-width line under the weekday. That line has no copy key of its own, though validation-report gives the pattern (list formatter over the visible person fields). In Maya's view, the public contested row puts its weekday 5 pt below the row's first line, while the Sunday row top-aligns.
- **Evidence:** G04-conflict.svg: 'Friday' x=36 and 'Contested' x=164 at baseline 561; 'Ben · You and Debby' 17 pt at x=36, baseline 587; 'Your choice' baseline 609. validation-report threeWayPattern: 'Native ListFormatter + one visible-person sentence per VO entry'. G04-confirmed-others.svg: 'Friday' baseline 514, 'Contested' 509; 'Sunday' and 'Revisit' both 613.
- **What the app does, and who acts:** Meanwhile the app builds the row as drawn. It renders the chooser line from calendar.person.self/other joined by the native list formatter, per threeWayPattern, and top-aligns the public contested row. The PR lists both. The next brief asks Claude Design for the chooser line's key and the row's alignment.
- **Second reviewer's correction:** The measurements are right. The contested row moves 'Contested' into the owner column and puts 'Ben · You and Debby' (17 bold) full width at baseline 587. In G04-confirmed-others, 'Friday' is at baseline 514 while 'Contested' is at 509, and Sunday and Revisit share 613. Two parts are overstated. First, the chooser line's pattern is given: validation-report largestTextDesignChecks.threeWayPattern says 'Native ListFormatter + one visible-person sentence per VO entry', with wrapped lines 'Ben · You,' 'Maya and' 'Debby', and selfName.visibleRow is '{personName} · You'. Only a named key is missing. Second, a sighted user is told why Confirm Friday is unavailable: the screen states 'You and Debby chose Friday.' with the row reading 'Contested'. What is left is a grid break and a 5-pt misalignment, so this is a note.

### V-10 · note · app · adjusted

- **State:** G04-conflict, G04-one-day, G04-two-days vs G04-change
- **Rule:** Book p34 (one shape per action); T45 (native navigation)
- **Finding:** 'Not now' sits in the navigation bar on the three choice screens, as the delivery explains, but stays under the primary action on G04-change. Back and Not now both leave, as they already did in handoff 3.
- **Evidence:** G04-conflict, G04-one-day, G04-two-days: Back [8,54,44,44] and 'Not now' [295,54,86,44], 16 pt #284CDB at baseline 84. G04-change: 'Not now' [20,782,353,44] under 'Confirm these days'. IMPLEMENTATION.md: 'Not now moves to the native navigation bar in the three choice screens…'
- **What the app does, and who acts:** Meanwhile the app uses native toolbar items, so the system sets their style, and keeps both placements as drawn. The inventory row of G04-change notes the difference.
- **Second reviewer's correction:** The placements are as described: Not now is in the bar at [295,54,86,44] on the three choice screens, and at the bottom at [20,782,353,44] on G04-change. But the delivery explains the move in IMPLEMENTATION.md: 'Not now moves to the native navigation bar in the three choice screens… This makes room for the full week and the hours/zone without shrinking text.' The two exits are not new either: handoff 3's G04-conflict already had a Back chevron and a bottom Not now. What remains is that G04-change keeps the old placement.

### V-11 · note · app · confirmed

- **State:** G06-switcher-status, G05-local-times
- **Rule:** T45 ('the app uses the system's … sheets'); book p35 ('Use native navigation, sheets')
- **Finding:** Neither sheet is drawn as iOS's own. G06 dims the background with brand ink at 18%, lighter than 2.1, and its sheet rounds all four corners, so the scrim shows in the bottom corners. G05-local-times draws its large sheet on bare canvas, with no presenting screen or dimming, and its title is a left-aligned 17-pt run beside Done rather than a native bar. G06's Club details, Create a club and Cancel are 16 regular with a 32-pt gap before Cancel; 2.1 draws them bold and evenly spaced. This follows the brand's textAction role.
- **Evidence:** G06-switcher-status.svg: <rect x="0" y="0" width="393" height="852" fill="#182B25" opacity="0.18"/>; <rect x="0" y="432" width="393" height="420" rx="24" fill="#FAFBF8"/>. Pixel (4,1700) = #D1D6D2. 2.1 G06-switcher dims to #BCC1BD. G05-local-times.svg: <rect x="0" y="56" width="393" height="796" rx="24" fill="#FAFBF8"/> over canvas; title at x=20, baseline 105. supplementalTypeRoles.textAction 16/22 regular.
- **What the app does, and who acts:** Meanwhile the app uses UISheetPresentationController (medium detent for G06, large for local times), with the system's dimming, corners and navigation bar. Snapshots will differ from the frames, and the inventory rows say why.

### V-12 · note · app · confirmed

- **State:** G06-switcher-status (background)
- **Rule:** The brief's item 11 ('with your H01-awaiting-activation behind the sheet')
- **Finding:** The background isn't H01-awaiting-activation as drawn in handoff 3. It is re-spaced to the new 24-pt title gap and drops the line 'Drafts stay private when the club starts.', which would sit above the sheet's top edge. That line still has a handoff 5 key. So no frame shows H01-awaiting-activation at the new spacing undimmed.
- **Evidence:** Handoff 3 H01-awaiting-activation.svg baselines: title 170/205, body 282/305, Private drafts 425/447, drafts line 498. G06 background: 168/203, 247/270, 331/353, and no drafts line. copy-contracts handoff5.home.awaiting.private = 'Drafts stay private when the club starts.'. Sheet top y=432; drafts row 300 to 376.
- **What the app does, and who acts:** Meanwhile the app renders the real H01-awaiting-activation behind the native sheet, with its line and the handoff 5 spacing contract. The inventory row records that the frame's background omits the line.

### V-13 · should · claude-design · confirmed

- **State:** G05-schedule-review ('View local times')
- **Rule:** T47 (accurate VoiceOver); handoff5.localTimesSheet.entry ('equal zones show one block per occurrence')
- **Finding:** For a member who isn't travelling, the hint template names the same zone twice. The delivery's own rule says equal zones collapse to one, but the template has no equal-zone form.
- **Evidence:** screen-copy.json G05-schedule-review: 'View local times' hint 'Show dated opening and closing times in New York and New York.'. copy-contracts handoff5.schedule.localAction.hint = 'Show dated opening and closing times in {clubZoneName} and {deviceZoneName}.'. localTimesSheet.entry: 'equal zones show one block per occurrence.'
- **What the app does, and who acts:** Meanwhile, when the phone's zone equals the club's, the app omits the hint and keeps the label 'View local times'. The next brief asks Claude Design for an equal-zone hint.

### V-14 · note · app · adjusted

- **State:** G04-one-day, G04-two-days, G04-conflict, G06-switcher-status, H01 headers
- **Rule:** T47; handoff5.controlLabels.rule ('Native selected/disabled traits remain native')
- **Finding:** The switcher row's label ends with 'Selected.' while the row also carries the native selected trait, so VoiceOver would say 'selected' twice. The day labels' 'Not selected.' and 'Unavailable.' are not duplicated by any trait and can stay.
- **Evidence:** switcher.row.selected.vo '{clubName}. {stateLabel}. Selected.'; switcherStatus.selected 'Native checkmark + spoken selected trait'. screen-copy G04-two-days controls: Monday, Wednesday, Thursday, Saturday only; Tuesday and Friday (Confirmed) are semantic groups. calendar.row.available.vo '{weekday}. Available. Not selected.'.
- **What the app does, and who acts:** Meanwhile the app sets the native selected trait on the switcher row and drops the trailing 'Selected.' from its label. Day labels stay as delivered. The PR lists the change, and a later brief confirms it.
- **Second reviewer's correction:** Only one duplication holds. switcher.row.selected.vo ends 'Selected.' while switcherStatus.selected also asks for the 'spoken selected trait', so VoiceOver would say it twice. 'Not selected.' duplicates nothing: VoiceOver announces no unselected state for a row, so the words add information. 'Unavailable.' is not doubled either: confirmed rows are not controls in screen-copy (G04-two-days lists only Monday, Wednesday, Thursday and Saturday as controls), so no dimmed trait is spoken. Whether '+ Add' is spoken as 'plus Add', and whether Voice Control matches 'Add', is not verifiable from the files. '+ Add' is the visible text, as the brief required.

### V-15 · note · claude-design · adjusted

- **State:** H01-unavailable, H01-access-lost (denied header)
- **Rule:** Book p34 (one shape); handoff5.deniedHeader; T47
- **Finding:** In the denied states, the club switcher's text turns action blue ('Choose a club'), where every other header sets the club name in primary ink. The deniedHeader contract names the words but no ink. The header and the main button share the name 'Choose a club', so Voice Control will number the two matches.
- **Evidence:** H01-unavailable.svg and H01-access-lost.svg: 'Choose a club' 16 pt #284CDB at (20,85). H01-travelling: 'Sunday people' 16 pt #182B25. handoff5.deniedHeader: {"title": "Choose a club", "oldClubName": false, …}, with no ink token. screen-copy controls: 'Choose a club' [20,56,230,44], and 'Choose a club' [20,644,353,50] (H01-unavailable) or [20,696,353,50] (H01-access-lost).
- **What the app does, and who acts:** Meanwhile the app builds the header in action ink as drawn and records the token on the inventory row. The next brief asks Claude Design to name the ink.
- **Second reviewer's correction:** The drawing is as described. Both denial frames set 'Choose a club' at 16 pt in #284CDB at (20,85), where every other header uses #182B25 ('Sunday people'). deniedHeader names no ink. The header control [20,56,230,44] and the primary [20,644,353,50] or [20,696,353,50] share the label 'Choose a club'. But the finding's own action says the next brief asks Claude Design to name the ink, so who is claude-design, not app.

### V-16 · note · app · adjusted

- **State:** H01-confirm-days, H01-unavailable, H01-access-lost
- **Rule:** Book p5 ('An interchangeable shell … could be reskinned'); CLAUDE.md 'Nothing generic'; FQ53 (plain waiting and paused screens, the founder's call); the brief's section 4
- **Finding:** H01-confirm-days is a plain title, body and button, as the brief foresaw under FQ53. Unlike H01-awaiting-activation, it has no Private drafts row, though both offer drafts only from + Add. The two denial Homes are plain because the rules forbid any club object there; they are not an FQ53 case.
- **Evidence:** H01-confirm-days.svg: title baseline 168; body 212/235; primary rect y=696; nothing between them. Handoff 3 H01-awaiting-activation: the 353x76 Private drafts row (y=394) and 'Drafts stay private when the club starts.'. Brief section 4: 'Frame 7 … is a waiting Home of the same kind, so your answer to FQ53 may change it too.' H01-confirm-days + Add hint: 'Save a private draft or open private drafts.'
- **What the app does, and who acts:** Meanwhile the app builds the three frames as drawn. The ios thread records frame 7 beside FQ53 in docs/QUESTIONS.md, and notes the missing drafts row on H01-confirm-days' inventory row.
- **Second reviewer's correction:** The measurements are right: H01-confirm-days has body at 212/235 and the primary at y=696, about 460 pt empty, and it has no Private drafts row. But frame 7 is already inside FQ53's reach: the brief's section 4 says 'Frame 7 … is a waiting Home of the same kind, so your answer to FQ53 may change it too.' H01-unavailable and H01-access-lost are not FQ53 cases. The brief's items 9 and 10 and T9/T24 rule out any person, date, caption, photograph or Memories, and deniedHeader keeps only the viewer's own photo. Adding them to FQ53 would ask the founder a question the rules already answer. What is new is that H01-confirm-days drops the Private drafts row that H01-awaiting-activation shows, though both offer drafts only from + Add.

### V-17 · note · app · confirmed

- **State:** H01-travelling vs 2.1 H01-after-close; G04-confirmed-others; G05-schedule-review
- **Rule:** Book p34 (one shape); T44 (spacing from tokens); handoff5.spacing
- **Finding:** H01-travelling redraws two of 2.1's H01-after-close parts without saying so. The past-day card is now a surface-filled card with the Memories glyph; 2.1 has an outlined canvas card with a check badge. The eyebrow reads 'Up next' in sentence case. The app needs one past-day card for both states. A few gaps sit off the delivery's own values. The delivery's numbers measure a text box from baseline minus font size; with Arimo's own metrics, homeTitleToBody 24 and changeTitleToSubtitle 16 come out as about 20 and 12. So the build should take the named values, not the frames' baselines. The AX5 check in validation-report wraps 'Saturday, November 7, 2026 at 7 AM', but the shipped template joins with '·'.
- **Evidence:** H01-travelling.svg: <rect x="20" y="598" width="353" height="108" rx="12" fill="#F0F2EC"/> with the Memories glyph; 2.1 H01-after-close.png: outlined white card with a check circle; 'UP NEXT' against 'Up next' (13 pt #607067). Gaps on the delivery's own measure: G04-confirmed-others body (196) to zone line (248) = 33 against sectionGap 24 or 32; H01-travelling eyebrow (133) to title (174) = 5; title to card (208) = 31 against datedHomeTitleToCard 32; G05-schedule-review 'New York' (210) to review row (232) = 17. validation-report largestTextDesignChecks clubOpenLines ['Saturday,', 'November 7,', '2026 at 7 AM'] against local.opens 'Opens {fullDate} · {time}'.
- **What the app does, and who acts:** Meanwhile the app builds the past-day card from H5, the latest delivery, on both H01-after-close and H01-travelling. It uses the named spacing values, with the nearest scale step where a gap is unnamed, and its own AX5 snapshots are the check. The PR lists each, and the next brief confirms the card.

### V-18 · note · claude-design · adjusted

- **State:** brand-components (frame 14)
- **Rule:** docs/DESIGN-HANDOFF.md (brand components as the reference); book p34 (component contracts)
- **Finding:** The replacement sheet adds only the day-choice specimens and rule lines. New components drawn only in phone frames have no specimen: the waiting hero's canvas plaque on accent, the travelling local and club lines, the denied header, the switcher status rows, the review row and the local-times block. No new component has a dark specimen.
- **Evidence:** brand-components.svg, y≥5835: 'Handoff 5: days, dates and accessible labels', the six row specimens, seven rule lines and a footer. The only 'FRI' plaque specimen is the light one at y≈141. The last 'Dark' label is at y=4380.
- **What the app does, and who acts:** Meanwhile the app takes these components from the phone frames and contracts. The next brief asks for specimens of them, light and dark, in a replacement sheet.
- **Second reviewer's correction:** The facts hold. The handoff 5 sheet section (from y=5835) has only the six day-choice row specimens (Monday Available; Tuesday Maya Proposed; Wednesday Alex Confirmed; Monday Ben · You; Friday Contested; Sunday Revisit) and rule lines. 'FRI' appears once, at y=141 (light). No 'Dark' label appears after y=4380. So there is no specimen of the waiting hero, the travelling lines, the denied header, the switcher rows, the review row or the local-times block, and no dark specimen of any new row. The causal clause 'which is how V-01 went unseen' is speculation and is dropped.


**Found by the second reviewer**

### VM-01 · should · claude-design

- **State:** H01-travelling and travelling Friends rows (templates)
- **Finding:** When the club date and the local date differ, the travelling club line has no date. travellingRows.Friends and IMPLEMENTATION.md promise the club date in that case, but friends.date.club and home.clubOpening carry only a time and a zone. Home has a single '{fullDate}'. A member far ahead of New York would read the club time against the wrong day. card.status.club and upcoming.club do carry a club date, so only Home and Friends lack it.
- **Evidence:** component-contracts handoff5.travellingRows.Friends: 'second metadata line club time + club zone, with full club date when local dates differ.' IMPLEMENTATION.md: 'the second line shows the club opening time and zone, including the club date when dates differ.' copy-contracts handoff5.friends.date.club = '{clubOpenTime} · {clubZoneName}'; home.clubOpening = '{openTime} · {clubZoneName}'; home.date = '{fullDate}'. By contrast upcoming.club = '{clubOpenFullDate} · {clubOpenTime} · {clubZoneName}'. Example: Nina's Saturday opens 7 AM EST, Saturday November 7, 2026 (12:00 UTC), which is 1 AM Sunday November 8 in Auckland (UTC+13). Home would show 'Sunday, November 8 / Opens 1 AM · Auckland / 7 AM · New York'. Rules: T41 (exact dates), T2, book p29.
- **What the app does, and who acts:** Meanwhile, when the dates differ, the app writes the club line on Home and Friends with the delivered upcoming.club template ('{clubOpenFullDate} · {clubOpenTime} · {clubZoneName}'), and tests it with a far-ahead fake zone. The PR notes it. The next brief asks Claude Design for the date-differs variants of home.clubOpening and friends.date.club.

### VM-02 · should · claude-design

- **State:** G05-schedule-review vs G04-change and the G04 choice screens
- **Finding:** The club's hours and zone are written three ways, and the G05 frame disagrees with its own replacement map. The G04 choice screens put 'Sunday people · New York' above the hours. G04-change writes 'New York · 7 AM to 1 AM the next morning' on one line (calendar.hoursZone). G05-schedule-review draws the hours, then 'New York' alone on a second line. Yet the map sends handoff3.G05.schedule.revealHoursZone to calendar.hoursZone, and no handoff5 key renders the zone alone.
- **Evidence:** G05-schedule-review.svg: '7 AM to 1 AM the next morning' (13 pt, baseline 184), then 'New York' (13 pt, baseline 210). copy-contracts handoff5.replaces 'handoff3.G05.schedule.revealHoursZone': 'handoff5.calendar.hoursZone' = '{clubZoneName} · {hoursText}'. G04-change.svg: 'New York · 7 AM to 1 AM the next morning' (baseline 304). G04-one-day.svg: 'Sunday people · New York' (180), then '7 AM to 1 AM the next morning' (202). Book p34: one shape, one meaning.
- **What the app does, and who acts:** Meanwhile the app follows the replacement map on G05 and renders calendar.hoursZone as one line, as G04-change does. The G05-schedule-review inventory row records the difference from the frame. The next brief asks Claude Design for one arrangement of club, zone and hours.

### VM-03 · should · claude-design

- **State:** waitingHero avatar (H01-travelling), dark appearance
- **Finding:** The waiting hero names no avatar pair, and its rule that all text on the card is onAccent clashes with the disc the frame draws. In light, the frame uses avatarCanvas (#E1E5F6) with an #182B25 'N'. In dark, avatarCanvas becomes #35463A. With the contract's onAccent initial (#182B25 in both themes), the initial would read at 1.48:1, the same flaw as V-01's plaque.
- **Evidence:** H01-travelling.svg: <circle cx="339.0" cy="242.0" r="18.0" fill="#E1E5F6"/> with 'N' #182B25 on the #F0E4A8 card. handoff5.waitingHero has only fillToken, allTextToken 'onAccent', plaqueOnAccentFillToken and plaqueRadiusToken. brand-tokens dark: avatarCanvas #35463A, onAvatarCanvas #F7F8F2, onAccent #182B25. Computed: #182B25 on #35463A = 1.48:1. The sheet names avatar pairs only 'On canvas' and 'Every light and dark cover: fill #182B25 · initial #FAFBF8'.
- **What the app does, and who acts:** Meanwhile the app pairs the disc with its own foreground (avatarCanvas with onAvatarCanvas). That matches the frame in light and gives #F7F8F2 on #35463A in dark. The PR notes it. The next brief asks for the hero's avatar pair with the plaque's dark specimen (V-01, V-18).

### VM-04 · note · app

- **State:** H01-unavailable (Choose a club to Get help)
- **Finding:** The gap between the primary button and the secondary text action is 16 pt on H01-unavailable. The delivery names primaryToSecondaryTargetGap 8, and its other frames use 8.
- **Evidence:** screen-copy H01-unavailable: 'Choose a club' [20,644,353,50] (ends 694), 'Get help' [20,710,353,44]: gap 16. G04-change: 'Confirm these days' [20,724,353,50] (ends 774), 'Not now' [20,782,…]: gap 8. H01-travelling: 'Add for Nina' ends 522, 'See captions' at 530: gap 8. component-contracts handoff5.spacing.primaryToSecondaryTargetGap = 8; noClubButtonGap 16 is named only for the two no-club buttons.
- **What the app does, and who acts:** Meanwhile the app uses the named 8-pt gap and records the frame's 16 on H01-unavailable's inventory row.


## Consistency, file integrity, inventory and questions

**Summary.** Lens: consistency with handoffs 1 to 4 and the repository, file integrity, and what the build and the inventory need now. The files are intact. All 28 frame hashes in frame-manifest.json match the files (sha256). All 71 copy replacements and all 9 component replacements name earlier keys that exist. The DST and contrast claims in validation-report.json recompute exactly (zoneinfo, WCAG). G04-change and G05-schedule-review agree with each other and with handoff 3 on words, routes, the read-only week and FQ52. The H01-unavailable and H01-access-lost words, and the switcher labels, match handoff 3's. Nothing in the delivery breaks an invariant outright. The problems are in the bookkeeping and the contracts:
(1) PR #13's INVENTORY.md already holds 7 of the 9 "new" states, under other names, and its Known differences are now out of date.
(2) PR #13's QUESTIONS.md records FQ46, FQ48, FQ50 and FQ55 more narrowly than brief section 2. FQ46 contradicts what is drawn.
(3) The replacement map is incomplete, and one mapping is wrong (Maya's new days map to "Unchanged"). Five component replacements have no stated scope, and several earlier keys are overridden silently.
(4) Three templates can't produce what is drawn or needed: travelling club dates, the year, and exactly two kept dates. Two others aren't safe to build as delivered: a hint that reads "New York and New York", and calendar.peopleZone, which brings back "Ben and Debby" as a club name.
(5) Four visual or copy points: a misaligned SundayRow on G04-change, the past-day card restyled without a contract, H01-confirm-days copy that promises "the club's week", and no VoiceOver group for the travelling card.
(6) About a dozen states are described only in writing and need inventory rows or later frames. One state is described nowhere: Friends and the week during a club's first days.
One product point is for the founder: the G04 redraws drop 2.1's plaque and the book's copy.


**What was delivered, item by item**

- **frame-manifest.json hashes.** Recomputed the sha256 of all 14 SVGs and 14 PNGs. All 28 match the manifest. The 13 phone PNGs are 786x1704 and brand-components is 2400x13760, as the manifest says.
- **validation-report.json DST claims.** Checked against zoneinfo. A 7 AM New York opening is 4 hours from London only for openings from 25 to 31 October 2026 and from 14 to 27 March 2027, and 5 hours otherwise. All 8 dstCases match exactly. dstCases[2] closes at the ambiguous 1 AM on 1 November 2026 and takes the first occurrence (-04:00), as T2 and spec 05 require.
- **validation-report.json contrast claims.** All 12 ratios recompute exactly from brand-tokens.json 1.1, for example secondaryText on surface at 4.642 light and 7.584 dark, and onAccent on accent at 11.599. Pairs not listed also pass: the inputBorder outline is 3.44:1 on surface in light (non-text, 3:1 needed), and onActionDisabled on actionDisabled is 5.42:1.
- **Replacement keys exist.** All 71 old keys in copy-contracts handoff5.replaces exist in handoff3 or handoff4, and every target exists under handoff5. The provenance index (183 entries, the same as the templates) agrees with the map. All 9 old paths in component-contracts handoff5.replaces exist.
- **G04-change vs G05-schedule-review vs handoff 3 G05-schedule.** These agree on the words ('Review the club’s days', 'Proposed from Monday, November 16, 2026', 'Current days continue until the change is confirmed.'), the route (the review row opens Ben's G04-change), the current pair's week (Ben Monday and Thursday, Debby Tuesday and Friday, the other days 'No reveal scheduled') and the read-only week. They also agree on FQ52: no badge, no count, nothing on Home.
- **H01-confirm-days vs H01-awaiting-activation and G01-pending.** These agree on the club bar, + Add (hint 'Save a private draft or open private drafts.'), the tabs and the primary action's position: [20,696,353,50], the same as handoff 3's H01Awaiting reviewTarget. The body is closer to the title because of handoff 5's new spacing (X-29). The Private drafts row is left out, which is reasonable once the club has started.
- **G06-switcher-status labels.** These match handoff 3: 'Not started' (handoff3.switcher.awaiting), 'Paused', and the spoken '{clubName}. Paused.' is now the template '{clubName}. {stateLabel}.'. 'Unavailable' is added as the visible word.
- **H01-unavailable and H01-access-lost words.** The words match handoff 3 exactly: 'Club unavailable', 'This club isn’t available right now.', 'Choose a club', 'Get help', 'This club is no longer available.' and 'Choose a club to continue.'.
- **G05-members-proposed words.** The words match handoff3.G05.proposed.* and handoff4.pending.review.*: 'Proposed roster', 'These names are a proposal, not an active member list.' and 'Manage invitations'. The frame shows initials M A S D N and 'Ben · You' with Ben's photograph, and no status or count.

**Findings**

### X-01 · should · app · confirmed

- **State:** INVENTORY.md (PR #13): the states of frames 2 and 4 to 11
- **Rule:** Brief section 5: set the rows of frames 2 and 4 to 11 to 'requested 5', 'adding the ones that don't exist yet'. ADR-020: never delete an inventory row.
- **Finding:** Seven of the nine states that section 5 treats as new already have rows in PR #13, under different names. Adding them as written would leave seven 'missing' rows that can't be deleted. Only H01-travelling has no row. One stage also differs.
- **Evidence:** PR #13 rows against the delivered titles: G04-conflict-others (line 63) is G04-confirmed-others. G05-proposed-roster (68) is G05-members-proposed. G05-review-days (69) is G05-schedule-review. G06-labels (76) is G06-switcher-status. H01-suspended (88, stage B6) is H01-unavailable, which the brief puts at B2. H01-lost-access (90) is H01-access-lost. H01-days-unconfirmed (91, 'its days aren't all confirmed') is H01-confirm-days, which draws only the case where no day is confirmed. G05-local-times (70) matches. No row exists for H01-travelling.
- **What the app does, and who acts:** In the design PR that brings handoff 5 in: rename those seven rows' state column to the delivered titles and keep the old names in Notes; delete nothing. Move H01-unavailable to B2. Add H01-travelling at B2. Set all nine to received, screens/<title>.png, 'Handoff 5'. In H01-confirm-days' notes, say that the case where some days are confirmed but not the viewer's exists only in writing.

### X-02 · should · app · confirmed

- **State:** G04-conflict, G04-change, G04-one-day, G04-two-days (inventory rows)
- **Rule:** Brief section 5: 'Note the redraws asked of G04-conflict, G04-change, G04-one-day and G04-two-days on their rows.' CLAUDE.md: when a state has a render in both screens/ and 2.1/, screens/ wins.
- **Finding:** The four redrawn states still point at their old renders in PR #13.
- **Evidence:** PR #13 line 56: 2.1/G04-one-day.png, '2.1 #03'. Line 57: 2.1/G04-two-days.png, '2.1 #32'. Lines 58 and 59: screens/G04-conflict.png and screens/G04-change.png, source 'Handoff 3'. Handoff 5 delivers all four (manifest orders 1, 3, 12 and 13).
- **What the app does, and who acts:** Point the rows at screens/. Set the sources to 'Handoff 5 (2.1 #03 before)', 'Handoff 5 (2.1 #32 before)' and 'Handoff 5 (handoff 3 before)', with status received.

### X-03 · should · app · confirmed

- **State:** INVENTORY.md Known differences (PR #13)
- **Rule:** CLAUDE.md: keep INVENTORY.md current, including the known differences between renders and rules.
- **Finding:** Three Known-differences entries describe handoff 3 and 4 behaviour that handoff 5 has now replaced.
- **Evidence:** Line 264: 'Day choice conflict: Ben and Debby' is shown only to the two members involved; everyone else sees only that the day has no reveal scheduled. Handoff 5 retires the noun (handoff5.calendar.state.contested 'Contested'), and non-choosers see Contested with No reveal scheduled (calendar.publicContested). Line 267: VoiceOver labels that use other words than their button 'are kept'. Handoff 5 replaces them with the visible words and moves the old wording to hints (handoff5.a11y.*). Line 266: the app turns copy into templates. Handoff 5 now supplies them.
- **What the app does, and who acts:** Rewrite lines 264, 266 and 267 to match handoff 5. Add the entries from X-13, X-19, X-20 and X-29.

### X-04 · must · app · confirmed

- **State:** docs/QUESTIONS.md FQ46 (PR #13)
- **Rule:** Brief section 2 FQ46 and section 5: 'record each as section 2 states it'. A Default in the brief is the founder's current rule.
- **Finding:** The recorded default contradicts the brief and the drawn frames. A build that follows QUESTIONS.md would show non-choosers only 'No reveal scheduled' and would limit names to exactly two people.
- **Evidence:** PR #13 FQ46 Default: 'only the two members involved see the clash with names; the others see only that the day has no reveal scheduled (G04-conflict-others).' Brief FQ46: 'The others see that the day isn't settled yet, without names or a count'. FQ55 extends this to three or more people. Delivered: 'Contested' over 'No reveal scheduled', spoken '{weekday}. Contested. No reveal scheduled.'
- **What the app does, and who acts:** Rewrite FQ46's default: only the members who chose a contested day see names on it, however many there are. Everyone else sees Contested and No reveal scheduled, with no names or count. Name the state G04-confirmed-others, and note that this goes further than the check's section 4, following X-18. Until then, the app builds the brief's reading as drawn.

### X-05 · should · app · confirmed

- **State:** docs/QUESTIONS.md FQ48 (PR #13)
- **Rule:** Brief section 2 FQ48 and section 5: 'On the day-picking screens only, FQ48's reading replaces the handoff 3 brief's rule against naming who hasn't confirmed.'
- **Finding:** The recorded default holds only the first clause of the brief's reading. Without the rest, G04-one-day's five 'Proposed' rows look like a T15 or T33 breach in review.
- **Evidence:** PR #13 FQ48 Default: 'only confirmed days are taken.' Brief FQ48 adds: anyone who hasn't confirmed may choose a proposed day, which makes a clash; a proposal its owner has left is free and names nobody except in that person's own view ('Proposed for you'); the day-picking screens show a confirmed day differently from a proposed one; and still 'no Waiting for…, no count and no reminder'. Delivered: G04-one-day draws Maya, Alex, Sam, Debby and Nina each with 'Proposed'; G04-conflict draws Monday 'Available / Proposed for you'.
- **What the app does, and who acts:** Record the brief's full FQ48 reading. Add that on the day-picking screens only, it replaces the handoff 3 brief's rule against naming who hasn't confirmed, and that chasing stays ruled out.

### X-06 · should · app · adjusted

- **State:** docs/QUESTIONS.md FQ50 (PR #13)
- **Rule:** Brief section 2 FQ50 and section 5.
- **Finding:** The recorded default says nothing about + Add or about other members' announced days, and the brief settles both. The delivery also adds the restart route.
- **Evidence:** PR #13 FQ50 Default: 'Home shows that day as usual until it passes, then shows the pause.' Brief: Home shows the day 'until it closes'. Until 7 AM, + Add offers it. After that, + Add offers your next announced day, or only private drafts if there is none. The days of a member who has left wait for FQ63. Delivered pausedOwnAnnounced: 'AddBeforeOpening: That exact own collecting occurrence.' 'AddAfterOpening: Next own announced collecting occurrence, else Private draft then Open my drafts.' invitationControl: 'Invite someone' in Club details, below Members.
- **What the app does, and who acts:** Rewrite FQ50's default as brief section 2 states it. Note the delivered paused body '{clubName} needs another member for new days.' and the 'Invite someone' row (see X-26).
- **Second reviewer's correction:** The finding holds: PR #13 FQ50 says 'until it passes' and says nothing about + Add, and pausedOwnAnnounced says what the finding quotes. But the action points to X-27 for the 'Invite someone' row. That row is X-26; X-27 is about Friends during a club's first days.

### X-07 · should · app · confirmed

- **State:** docs/QUESTIONS.md FQ55 and FQ56 (PR #13)
- **Rule:** Brief section 2 FQ55 and section 5: 'with frame 7's first-days reading beside FQ55 and FQ56'.
- **Finding:** The recorded default covers only two people, and it is missing the first-days reading that frame 7 draws.
- **Evidence:** PR #13 FQ55 Default: 'while two members have chosen the same day, neither can confirm it. The conflict ends only when one of them chooses another day.' Brief: 'None of them can confirm it until all but one choose another day'. Members who join before any day is confirmed are part of the club's first days, and each day goes ahead as soon as its member confirms it. Once any day is confirmed, a later join is a membership change. Delivered firstDays.beforeAnyConfirmed: 'Active members who join before any confirmation are included in the first proposal'. laterMembership: 'After the first confirmed day, membership changes use all-active-member confirmation'.
- **What the app does, and who acts:** Extend FQ55 to two or more choosers ('all but one'). Add the first-days reading beside FQ55 and FQ56, marked as Claude Code's own.

### X-08 · note · app · confirmed

- **State:** docs/QUESTIONS.md FQ63 and FQ53; component handoff5.replaces 'handoff3.pausedHome.announcedDaysIfAny'
- **Rule:** Brief section 2: 'The announced days of a member who has left wait for FQ63, which has no default yet'. FQ53 covers plain waiting Homes.
- **Finding:** The brief says FQ63 has no default, but PR #13 records one. The delivery is consistent with both, because it writes nothing about these days. FQ53's scope now also covers H01-confirm-days.
- **Evidence:** PR #13 FQ63: 'Default (Claude Code's; the briefs gave none): their days that haven't opened are held, neither opened nor deleted'. Handoff 5 replaces handoff3.pausedHome.announcedDaysIfAny ('Keep promised occurrences; do not cancel them because the club has fewer than two active members.') with pausedOwnAnnounced, scope 'Only the remaining member’s own already announced occurrence(s).' Brief section 4: 'Frame 7 … is a waiting Home of the same kind, so your answer to FQ53 may change it too.'
- **What the app does, and who acts:** Record that FQ63's default governs other members' announced days once handoff 5's replacement takes effect. Add H01-confirm-days to FQ53's list of plain screens.

### X-09 · should · claude-design · confirmed

- **State:** copy-contracts.json handoff5.replaces (G04-change VoiceOver)
- **Rule:** Brief Return: replacement entries name 'the earlier key each one replaces'. README: 'Resolve replacements'.
- **Finding:** Two map entries send Maya's new days to the 'Unchanged' template. A build that resolves the map would speak a false 'Unchanged' for Maya. The frame's own label uses the 'new' template, whose provenance lists nothing.
- **Evidence:** handoff3.G04.change.vo.Wednesday ('Wednesday. Maya’s day in the proposed week…') maps to handoff5.change.proposedRow.unchanged.vo, '{personSpeech}. {weekdayList}. Unchanged.' handoff3.G04.change.vo.Saturday maps to the same template. screen-copy G04-change speaks 'Maya. Wednesday and Saturday. Proposed from Monday, November 16, 2026.' from change.proposedRow.new.vo, provenance {'replaces': [], 'kind': 'new'}.
- **What the app does, and who acts:** Until Claude Design corrects the map, the app follows screen-copy.json: a new assignment takes change.proposedRow.new.vo, and those two map entries are ignored. The next brief asks for the correction.

### X-10 · should · claude-design · adjusted

- **State:** copy-contracts.json: earlier keys that handoff 5 supersedes without naming them
- **Rule:** Brief Return: '…naming the earlier key each one replaces'. README: 'Do not render historical keys merely because they remain in the catalogue.' Only the replacement map tells the build which keys are historical.
- **Finding:** Handoff 5's frames use new keys in place of several earlier keys whose text or format differs. The replacement map doesn't name those earlier keys, so they still look current.
- **Evidence:** Not in handoff5.replaces: handoff3.G04.conflict.assigned '{name} · Assigned' (frames say 'Confirmed', calendar.state.confirmed, 'new'); handoff3.G04.conflict.friday.hint; handoff3.G04.conflict.otherMonday; handoff3.G04.change.before 'Through Sunday, November 15', now drawn 'Current days through Sunday, November 15' from change.before ('new'), the same words as handoff3.G04.change.currentThrough; handoff3.G04.change.benBefore, debbyBefore, benAfter, debbyAfter, mayaAfter (now change.keptDates, unchangedDays, newDays, all 'new'); handoff3.G05.schedule.localSheet.club 'Club time', .local 'Your time', .clubValue and .localValue (now local.clubZone, local.deviceZone, local.opens, local.closes). Same words under new keys: G05.proposed.* and pending.review.* (proposed.*), H01.suspended.* (home.unavailable.*), H01.accessLost.* (home.lost.*), switcher.awaiting and paused (switcher.*). Of 183 handoff5 keys, 144 are 'new'.
- **What the app does, and who acts:** For each state, the app takes the handoff5 key that the handoff 5 frame uses, and treats the earlier key as historical. It lists these pairs in the design PR, including currentThrough beside change.before. The next brief asks Claude Design to add them to handoff5.replaces.
- **Second reviewer's correction:** Every earlier key listed is absent from handoff5.replaces, and provenance marks 144 of 183 keys 'new'. But the G04-change heading 'Current days through {fullLastDate}' isn't an unasked invention: it is handoff 3's own key handoff3.G04.change.currentThrough, word for word. That key belongs in the pairs; the claim that the redraw changed a heading on its own is dropped.

### X-11 · should · app · adjusted

- **State:** copy-contracts.json: VoiceOver labels that handoff 5 doesn't replace
- **Rule:** Brief item 1: 'One name for the state, on screen and in every VoiceOver label.' Handoff 5's controlLabels: 'Accessibility label starts with visible words'. T47.
- **Finding:** Three earlier control labels still break the rules handoff 5 adopts, and none is in handoff5.replaces. A fourth key, the suspended screen's announcement, has no handoff 5 counterpart.
- **Evidence:** handoff3.G04.conflict.confirm.vo 'Confirm Friday. Unavailable while Friday has a day choice conflict.' still uses the retired noun (brief item 1: one name in every VoiceOver label). handoff3.H01.unavailable.choose.vo 'Choose another club explicitly.' for the visible 'Choose a club'. handoff3.H01.paused.details.vo 'Open Kitchen table’s club details.' for the visible 'Club details', with the club name written in. handoff3.H01.suspended.vo 'This club is unavailable. Friends and Memories can’t be opened for this club.' has no handoff5 key. handoff5.controlLabels: 'Accessibility label starts with visible words'. Handoff 5 does replace drafts.vo, header.add.vo and clubSelector.vo, which the brief didn't list.
- **What the app does, and who acts:** Meanwhile, the app applies handoff 5's rule: 'Confirm Friday' takes calendar.confirm.contested.hint as its hint; 'Choose a club' has no hint; 'Club details' takes the old text as a hint with {clubName}; H01.suspended.vo isn't used, and the visible words carry the screen. The next brief confirms these.
- **Second reviewer's correction:** Three of the four keys are control labels that break handoff 5's own rule and aren't in handoff5.replaces. The fourth, handoff3.H01.suspended.vo, isn't a control label: it is a screen announcement. It doesn't break the visible-words rule; it just has no counterpart in handoff 5.

### X-12 · should · app · adjusted

- **State:** component-contracts.json handoff5.replaces and replacementScopes
- **Rule:** README: 'handoff5.replaces and replacement scopes identify the current rules'. 'Apply handoff5 replacements only where their stated scope applies'.
- **Finding:** G04ChoiceRow, G04ChangeLayout and G05WeekView are replaced whole, with no stated scope. weekRows doesn't restate G05WeekView's three negative rules, and dayChoiceRow doesn't restate G04ChoiceRow's noLock.
- **Evidence:** component-contracts handoff5.replacementScopes covers only selectedClubHeader, navigationAndTargets, friendsRow and collectingCard. handoff3.G05WeekView had "nextDates": false, "nextUp": false, "contentSignals": false; handoff5.weekRows has none of them. handoff3.G04ChoiceRow had "noLock": true; handoff5.dayChoiceRow has datePlaque false but no lock rule. navigationAndTargets' scope: 'Accessible-label rule only; retain the prior destinations and unaffected geometry.'
- **What the app does, and who acts:** The app treats the three as full replacements, and keeps G05WeekView's three negative rules and G04ChoiceRow's noLock, which nothing in handoff 5 contradicts (contentSignals false also matches T15). It takes the G04 and G04-change targets from handoff 5's screen-copy.json. The next brief asks for the scopes.
- **Second reviewer's correction:** Two of the five 'unscoped' entries are leaf keys (handoff3.loadingHome.mainVoiceOver and handoff3.pausedHome.announcedDaysIfAny), so the key is its own scope. The navigationAndTargets scope keeps only 'the prior destinations and unaffected geometry'; handoff 5's redraws affect the G04 and G04-change targets, so the scope doesn't tell the build to keep the old rects. That part is refuted. What holds: three whole components are replaced without a scope, and some of their negative rules are not restated.

### X-13 · should · app · adjusted

- **State:** G04-two-days and handoff5.calendar.peopleZone
- **Rule:** Handoff 4 membersFooter: 'unnamedPair: No invented club name.', and 'title/roster/count refer to the same resolved club'. Check finding R-05: 'Pair titles come from the club's own name, not handoff 2's "Ben and Debby"'. Spec 04: every club is named. Handoff 5's own selfName.prose: 'You / your for self'.
- **Finding:** Handoff 5 turns 2.1's pair fixture into a reusable template that puts member names where the club's name goes. This brings back the stand-in that handoff 4 retired.
- **Evidence:** G04-two-days draws 'Ben and Debby · New York', from the new key handoff5.calendar.peopleZone '{memberNames} · {clubZoneName}'. G04-conflict, G04-confirmed-others and G04-one-day use calendar.clubZone '{clubName} · {clubZoneName}'. G04-change, the same pair plus Maya, draws only 'New York · 7 AM to 1 AM the next morning'. Handoff 4 membersFooter: 'unnamedPair: No invented club name.' PR #13 INVENTORY line 268: the two-person club's title is the club's own name, not 'Ben and Debby' (handoff 4).
- **What the app does, and who acts:** The app builds calendar.clubZone with the club's own name for every club size, and doesn't build peopleZone. It records this in Known differences. The next brief asks Claude Design to drop peopleZone.
- **Second reviewer's correction:** The finding holds, but the evidence overstates: not every other G04 frame uses calendar.clubZone. G04-change, the same pair joined by Maya, draws no name at all ('New York · 7 AM to 1 AM the next morning', calendar.hoursZone), as the brief asked. So the same pair is unnamed on frame 3 and named by its members on frame 13, which strengthens the point.

### X-14 · should · claude-design · confirmed

- **State:** G05-schedule-review 'View local times' hint, and G05-local-times for a member who isn't travelling
- **Rule:** IMPLEMENTATION: 'View local times remains available when the viewer is not travelling. If both zones are equal, show one time block per occurrence rather than duplicate equivalent values.'
- **Finding:** The hint template repeats the zone when the two zones are the same, and the delivery's own controls ship it that way. The single-block sheet for a member who isn't travelling has no frame, and no label for its one block.
- **Evidence:** G05-schedule-review control hint: 'Show dated opening and closing times in New York and New York.', from handoff5.schedule.localAction.hint 'Show dated opening and closing times in {clubZoneName} and {deviceZoneName}.' The only block labels are local.clubZone 'Club time · {clubZoneName}' and local.deviceZone 'Your time · {deviceZoneName}'. IMPLEMENTATION: 'If both zones are equal, show one time block per occurrence'.
- **What the app does, and who acts:** Meanwhile, the app omits the hint when the zones are equal and builds the single-block sheet from spec. It adds an inventory row 'G05-local-times-same-zone', marked built from spec. The next brief asks for a same-zone hint, a block label and a frame.

### X-15 · should · claude-design · adjusted

- **State:** H01-travelling, plus Friends and F02 while travelling (templates)
- **Rule:** T2: 'Two civil times, resolved independently … A member who is travelling sees the local equivalent'. T41: an exact date wherever a weekday alone could mislead. IMPLEMENTATION: '…the second line shows the club opening time and zone, including the club date when dates differ.'
- **Finding:** Handoff 5's prose asks for the club's date when the local and club dates differ, but no Home or Friends template can carry it. On Home the date heading and plaque show one date, and nothing gives the other line its own date.
- **Evidence:** handoff5.friends.date.club '{clubOpenTime} · {clubZoneName}' and home.clubOpening '{openTime} · {clubZoneName}' have no date. home.localOpening 'Opens {openTime} · {deviceZoneName}' has no date. home.date '{fullDate}'; the plaque draws 'SAT 07'. travellingRows.Friends: 'with full club date when local dates differ'. travellingRows.Home: 'Local exact date/time first'. Example: 7 AM New York on Saturday 7 November 2026 is 12:00 UTC, 1 AM on Sunday 8 November in Auckland (UTC+13).
- **What the app does, and who acts:** Meanwhile, on Home the occasion title, plaque and date heading keep the club's date (the occurrence's date, T2). When the local date differs, the local line uses upcoming.local ('Opens {fullDate} · {localOpenTime} · {deviceZoneName}'). On Friends, the second line uses upcoming.club ('{clubOpenFullDate} · {clubOpenTime} · {clubZoneName}') when the dates differ. The next brief asks for Home and Friends templates that carry a date.
- **Second reviewer's correction:** The gap is real: friends.date.club and home.clubOpening carry no date, though IMPLEMENTATION and travellingRows ask for the club's date when the dates differ. But the proposed action adds the date to the wrong line on Home. If the plaque, title ('Nina's Saturday') and date heading keep the club's date, it is the local line ('Opens 1 AM · Auckland') that would mislead without its own date (T41), and the delivered upcoming.local template carries one. Also travellingRows.Home does say 'Local exact date/time first', so the contracts aren't silent, just not templated.

### X-16 · should · claude-design · confirmed

- **State:** Date parameters: G04-change, Friends, Home and the card
- **Rule:** Handoff 3 snapshot.datePolicy: 'Exact start dates include year.' T41.
- **Finding:** One parameter name is drawn both with and without the year, so the build can't choose one formatter per parameter. The year rule is 'when needed', and nothing defines when that is.
- **Evidence:** {fullStartDate} is 'Monday, November 16, 2026' in change.startDate and in schedule.review.date ('Proposed from Monday, November 16, 2026'), but 'From Monday, November 16' in change.after on the same G04-change frame. {fullDate} has a year in card.status and local.opens, but none in friends.date ('Monday, November 9') or home.date ('Saturday, November 7'). collectingCardStatus: 'with year when needed'. handoff3.snapshot.datePolicy: 'Exact start dates include year.'
- **What the app does, and who acts:** Meanwhile, the app writes start dates with the year, as handoff 3's datePolicy says, and keeps each other parameter as drawn on its own screen. It lists the differences in the PR. The next brief asks for the year rule.

### X-17 · should · claude-design · confirmed

- **State:** G04-change kept dates (change.keptDates, change.preservedRow.vo)
- **Rule:** Brief Return: write every reusable string as a template. Handoff 5: 'Native ListFormatter supplies person/day lists'.
- **Finding:** The templates allow exactly two kept dates per person. A club with one day per person (four to six members) keeps one date per week, and how many dates are kept depends on FQ61.
- **Evidence:** handoff5.change.keptDates: '{firstFullDate} · {secondFullDate}'. handoff5.change.preservedRow.vo: '{personSpeech}. {firstFullDate} and {secondFullDate}. Announced dates unchanged.' IMPLEMENTATION: 'Native ListFormatter supplies person/day lists'.
- **What the app does, and who acts:** The app passes a list of dates through ListFormatter, the method handoff 5 names. The next brief asks for list templates.

### X-18 · should · claude-design · confirmed

- **State:** G04-change (frame 3)
- **Rule:** Brief question: 'Sunday, in one form everywhere'. Book p34: 'A component has one shape, one meaning'. A redraw 'keeps everything else in the earlier frame as it was'.
- **Finding:** On G04-change, the shared SundayRow sits 16 points to the right of the person groups above it, and it is the only row there with its own separator. On G04's choice screens and on G05, the weekday column lines up.
- **Evidence:** frames/G04-change.png at 2x: person names at x=40 px (20 pt), 'Sunday' at x=72 px (36 pt), its rule from 36 to 357 pt. G04-conflict and G05-schedule-review: every weekday at 36 pt. Brief: 'Sunday, in one form everywhere'. Book p34: 'A component has one shape, one meaning'.
- **What the app does, and who acts:** The app builds SundayRow as specified (16 pt inset) and records the offset in the PR and in Known differences. The next brief asks how Sunday aligns in the person layout.

### X-19 · should · claude-design · confirmed

- **State:** H01-travelling: the 'Debby’s Friday is in Memories' card
- **Rule:** Book p34: one shape, one meaning. A redraw or new state keeps the book's components unless a contract changes them.
- **Finding:** The past-day card is restyled from 2.1's H01-after-close without a contract or any written note. That leaves two shapes for the same card.
- **Evidence:** H01-travelling: surface-filled card, no border, Memories glyph, regular-weight 'Revisit Debby’s Friday'. 2.1 H01-after-close: canvas card with a border, check-in-circle glyph, bold 'Revisit her day'. Nothing in component-contracts handoff5 or IMPLEMENTATION mentions the change (only spacing.captionsToPast 24).
- **What the app does, and who acts:** Meanwhile, the app builds one card, handoff 5's (the only one drawn in brand revision 1.1), for both H01-after-close and H01-travelling, and lists it in Known differences. The next brief asks Claude Design to confirm.

### X-20 · should · claude-design · confirmed

- **State:** H01-confirm-days body copy
- **Rule:** T49: truthful states. Brief item 7 Default: 'Once any day is confirmed, Home shows the next confirmed day, as H01-waiting does'. Book p7: Home shows the next person and the exact date.
- **Finding:** The body promises that Home will show the club's week, but under the delivery's own contract Home will show the next confirmed day.
- **Evidence:** handoff5.home.confirm.body: 'The club’s week will appear here after a day is confirmed.' firstDays.whenFirstConfirms: 'Home resolves to the next confirmed occurrence'. Brief item 7 Default: 'Once any day is confirmed, Home shows the next confirmed day, as H01-waiting does'.
- **What the app does, and who acts:** The app builds the rule (the next confirmed day) and ships the delivered sentence, flagged in the PR. The next brief asks for wording that matches.

### X-21 · should · app · confirmed

- **State:** H01-travelling: VoiceOver for the waiting card
- **Rule:** T47: 'A countdown announces its target date, not every tick.'
- **Finding:** The frame gives no VoiceOver group for the waiting card. The only countdown label speaks a duration, not the target date.
- **Evidence:** screen-copy H01-travelling: "semanticGroups": [] with controls only. handoff5.home.countdown.vo: '{durationSpoken} until opening.' T47: 'A countdown announces its target date, not every tick.'
- **What the app does, and who acts:** The app groups the card so that it speaks the occasion and its target date in both zones, from home.occasion, home.date, home.localOpening and home.clubOpening, with the countdown inside that group and not as a live region. The next brief asks for the card's label template.

### X-22 · should · app · confirmed

- **State:** G05-schedule with the viewer-only 'Choose your day(s)' row
- **Rule:** Every state described in writing needs an inventory row or a frame (T46: built from spec).
- **Finding:** Handoff 5 says where Ben's own confirmation waits, but doesn't draw it.
- **Evidence:** IMPLEMENTATION: 'If the viewer’s own initial days are still unconfirmed, the route remains in Friends → See schedule or Club details → Schedule. A viewer-only Choose your day(s) row opens the personal G04 choice.' Keys: handoff5.schedule.chooseOwn 'Choose your day', .chooseOwn.many 'Choose your days'. No frame draws them.
- **What the app does, and who acts:** Add an inventory row 'G05-schedule-choose-own' at B2, built from spec. Ask for a frame in the next brief.

### X-23 · should · claude-design · confirmed

- **State:** G04 variants described only in writing
- **Rule:** Every state described in writing needs an inventory row or a frame.
- **Finding:** Three G04 variants have copy but no frame, and one of them has no label template.
- **Evidence:** Three or more choosers: '{chooserSentenceList} chose {weekday}.'; largestTextDesignChecks wraps 'Ben · You, Maya and Debby'. Your days confirmed: calendar.confirmed.title.many 'Your days are confirmed.' A member who hasn't confirmed and isn't a chooser, on a choice screen, looking at a contested day: choiceRules give non-choosers 'Contested and No reveal scheduled' without names, but the only choice-row label, calendar.row.contested.vo, ends 'Your choice.'
- **What the app does, and who acts:** Add inventory rows 'G04-conflict-three' and 'G04-confirmed-many', and a note on G04-conflict for the non-chooser row. Build them from spec, and ask for frames and a non-chooser label template in the next brief.

### X-24 · should · app · confirmed

- **State:** F01 and F02 for a member who is travelling
- **Rule:** Every state described in writing needs an inventory row or a frame.
- **Finding:** Friends and the upcoming day for a member who is travelling exist only in writing and templates.
- **Evidence:** IMPLEMENTATION 'Travel and dated local times' gives friends.date.travelling, friends.date.club, friends.row.travelling.vo, upcoming.local, upcoming.club, card.status.travelling and card.status.club. No frame draws them.
- **What the app does, and who acts:** Add inventory rows 'F01-friends-travelling' and 'F02-upcoming-travelling' at B2, built from spec (see X-15). Ask for frames later.

### X-25 · should · app · confirmed

- **State:** Friends and Memories for an unavailable or lost club; the switcher's 'Unavailable' row
- **Rule:** Every state described in writing needs an inventory row or a frame.
- **Finding:** The other tabs for a denied club, and the switcher's 'Unavailable' label, are described but not drawn.
- **Evidence:** deniedHeader.allTabs: 'Home, Friends and Memories show the same neutral denial for that selected context, no cached club objects.' switcherStatus.labels include 'Unavailable' (handoff5.switcher.unavailable), shown 'only for a club still in the authorized club listing'. G06-switcher-status draws only 'Not started' and 'Paused'.
- **What the app does, and who acts:** Add inventory rows 'F01-unavailable', 'M01-unavailable', 'F01-access-lost' and 'M01-access-lost' (B2, built from spec), and a note on G06-switcher-status for the 'Unavailable' row.

### X-26 · should · app · confirmed

- **State:** A paused club with the remaining member's own announced day, and Club details' 'Invite someone'
- **Rule:** Every state described in writing needs an inventory row or a frame. FQ16 and FQ51 record the paused club and the invitation route.
- **Finding:** Handoff 5 answers in writing where the paused club's invitation control goes and what Home and + Add do. Neither is drawn. The new route sits beside FQ51's default, which reaches the invitation list only during setup.
- **Evidence:** pausedOwnAnnounced.invitationControl: 'Club details, below Members and above Schedule: Invite someone, only when the server authorizes a proposal and capacity permits.' invitationRoute: 'Contextual per-person invitation-name flow for this club … No creator-only list privilege is granted by being the remaining member.' Keys: paused.details.invite and .hint. 2.1's G05-club-details draws no such row.
- **What the app does, and who acts:** Add inventory rows 'H01-paused-own-day' (it reuses H01-waiting and H01-your-day) and 'G05-club-details-paused' at B2, built from spec. Record the route under FQ16, with a pointer from FQ51. Ask for frames later.

### X-27 · should · claude-design · confirmed

- **State:** Friends and the read-only week during a club's first days
- **Rule:** T49: never a made-up date. Brief FQ48: 'Friends and Home show it anyway, because a day nobody has confirmed doesn't open.'
- **Finding:** No source or handoff says how Friends rows and the G05 week show a member whose day is still only proposed, once some days are confirmed. weekRows has no 'proposed' state, and the F01 rows need a date.
- **Evidence:** weekRows: singleLine 'Weekday + owner', unused 'Weekday + No reveal scheduled, no owner', contested, Sunday. friends.date '{fullDate} · {openTime}', with no variant for a member with no confirmed day. defaultsAssessment.firstDays: 'must visibly separate active roster from scheduled assignments.' Brief FQ48: 'Friends and Home show it anyway, because a day nobody has confirmed doesn't open.'
- **What the app does, and who acts:** Meanwhile, as the safest reversible reading, the app shows only confirmed days as scheduled. An unconfirmed weekday reads 'No reveal scheduled', with no name, and a Friends row gives no date. The app records this as a QUESTIONS.md default and marks it built from spec. Ask for the state in the next brief.

### X-28 · should · app · confirmed

- **State:** G05-schedule (handoff 3), and H01-awaiting-activation, H01-paused, H01-loading and G01-pending
- **Rule:** CLAUDE.md: keep INVENTORY.md current. When a contract changes a received frame, the inventory says the frame is out of date.
- **Finding:** Handoff 5's contracts change frames already marked received, but those frames weren't redrawn.
- **Evidence:** weekRows replaces G05WeekView: names move to a left-aligned second column, 'Name · You' is bold, rows are 48 and 56 pt, and SundayRow puts Revisit on the right. Handoff 3's G05-schedule draws right-aligned regular names, with 'No reveal scheduled' under Sunday on the left. handoff5.spacing: homeTitleToBody 24, pendingTitleToBody 24, 'no fixed 77-point content gap'. Handoff 3's H01-awaiting-activation and handoff 4's G01-pending draw about 77 points.
- **What the app does, and who acts:** Annotate those rows: 'layout superseded by handoff 5 weekRows/SundayRow' and 'spacing per handoff5.spacing'. Build them from the contracts. A redraw is optional in a later brief.

### X-29 · note · founder · adjusted

- **State:** G04-one-day and G04-two-days (frames 12 and 13)
- **Rule:** CLAUDE.md, 'Nothing generic': the book's own objects include 'the dated day, the weekday plaque'. Book p10 and p11. FQ2: sending the brief said yes to redrawing these two frames, and the founder decides product questions.
- **Finding:** Frames 12 and 13 drop the plaque, as the brief let Claude Design decide, and also drop 2.1's line 'A day for your friends to collect things for you.', which the one design doesn't need. Nothing is blocked, but the book's objects and words are gone from the day-picking screens.
- **Evidence:** dayChoiceRow.datePlaque false: 'A recurring unconfirmed assignment is not an announced dated occurrence.' 2.1 G04-one-day: 'Your Monday.', 'A day for your friends to collect things for you.' and the MON 09 plaque. 2.1 G04-two-days: 'Choose your two days.', the same line, 'A two-person club · Ben and Debby', 'Confirm two days'. Handoff 5: 'Choose your day', 'Choose an available day, then confirm.', 'Choose two days that work for you.', 'You can change your choice before confirming.', 'Confirm Monday and Thursday'. Brief: 'A redraw keeps everything else in the earlier frame as it was.'
- **What the app does, and who acts:** Build handoff 5's redraws, which FQ2's yes covers. Mention the dropped plaque and line in the founder report beside FQ53. If the founder wants either back, a later brief asks for it.
- **Second reviewer's correction:** Not an open product choice. The brief itself asked Claude Design to 'Say whether the date plaque that G04-one-day leads with (book p6, p10) belongs here', and the delivery answered with a reason (dayChoiceRow.plaqueReason). The founder's FQ2 yes, given by sending the brief, covers redrawing frames 12 and 13. What remains is worth the founder seeing: the book's plaque and its line 'A day for your friends to collect things for you.' are gone from the day-picking screens, the line without any need from the one design. That is a note beside FQ53, not a should.

### X-30 · note · none · confirmed

- **State:** G06-switcher-status background
- **Rule:** Handoff 4 pendingScreen: the private line is 'Drafts stay private when the club starts.' (handoff3.H01.awaiting.private, also handoff5.home.awaiting.private).
- **Finding:** The background, drawn as H01-awaiting-activation with H5 spacing, leaves out the drafts-privacy line, even though there is room for it above the sheet.
- **Evidence:** screen-copy G06-switcher-status drawnText: 'Only you can see these.' then 'Home', 'Friends', 'Memories', with no 'Drafts stay private when the club starts.' At 2x the Private drafts row ends at about 375 pt and the sheet starts at about 432 pt. handoff5.home.awaiting.private keeps the line.
- **What the app does, and who acts:** The app keeps the line on H01-awaiting-activation as handoffs 3 and 4 and handoff5.home.awaiting.private have it. The render behind the sheet isn't a source.

### X-31 · note · claude-design · adjusted

- **State:** H01-unavailable and H01-access-lost header, and switcher row labels
- **Rule:** T47 and Voice Control: visible names identify controls. Native traits remain native (handoff5.controlLabels).
- **Finding:** Two accessibility details need handling in the build. Each denial screen has two different controls labelled 'Choose a club'. switcher.row.selected.vo puts the word 'Selected.' in the label as well as the native selected trait, so VoiceOver says it twice.
- **Evidence:** H01-unavailable controls 'Choose a club' at [20,56,230,44] and [20,644,353,50]; H01-access-lost at [20,56,230,44] and [20,696,353,50]. handoff5.switcher.row.selected.vo '{clubName}. {stateLabel}. Selected.'; G06-switcher-status speaks 'Sunday people. Not started. Selected.' switcherStatus.selected: 'Native checkmark + spoken selected trait'. controlLabels.rule: 'Native selected/disabled traits remain native.'
- **What the app does, and who acts:** The app uses the native selected trait and switcher.row.vo, not the word. It keeps both 'Choose a club' controls as delivered and notes them in the PR. Raise the duplicate label in the next brief.
- **Second reviewer's correction:** The two accessibility details are verified. The third point, the header hiding the club's name, is refuted as a finding: the brief asked 'whether the club bar keeps the club's name', and the delivery answered no with a reason (deniedHeader.oldClubName false, reason 'Avoid using a denied selected-club record or cache'). It needs no further brief.


**Found by the second reviewer**

### CM-01 · should · claude-design

- **State:** G04-conflict: the contested row's visible chooser line
- **Finding:** The contested row draws 'Ben · You and Debby', and no handoff5 key produces it. The form mixes the row's self-name form with a prose list, so it can read as 'Ben' followed by 'You and Debby'. The explanation on the same screen says 'You and Debby'.
- **Evidence:** screen-copy G04-conflict drawnText: 'Contested', 'Ben · You and Debby', 'Your choice'. The only chooser keys are calendar.contested.explanation '{chooserSentenceList} chose {weekday}.' (example 'You and Debby chose Friday.') and calendar.row.contested.vo. selfName.visibleRow '{personName} · You'; selfName.listOfChoosersInProse 'Locale ListFormatter with You as the self element'. Brief Return: write every reusable string as a template.
- **What the app does, and who acts:** Meanwhile, the app builds the line as drawn, with ListFormatter over calendar.person.self and calendar.person.other, and lists it in the PR as having no template. The next brief asks for a template and whether the row should read 'You and Debby' as the explanation does.

### CM-02 · should · claude-design

- **State:** Templates that embed {occasionTitle} mid-sentence, for the viewer's own day
- **Finding:** occasion.self is 'Your {weekday}', with a capital Y, and it fills {occasionTitle} inside sentences. For the viewer's own day the build would write 'Revisit Your Monday', 'Open Your Monday.', 'Open captions for Your Monday.' and 'Add to Your Monday, opening …'. Handoff 5's own rule is 'You / your for self'.
- **Evidence:** handoff5.occasion.self 'Your {weekday}'. Templates that embed it: home.revisit 'Revisit {occasionTitle}', friends.row.hint 'Open {occasionTitle}.', home.captions.hint 'Open captions for {occasionTitle}.', home.addFor.hint 'Add to {occasionTitle}, opening {fullDateTime} in {clubZoneName}.' G05-local-times draws 'Your Monday' as a title, so the self occasion is live. selfName.prose: 'You / your for self, without repeating the name'.
- **What the app does, and who acts:** Meanwhile, the app writes the self occasion as 'your {weekday}' inside a sentence and keeps 'Your {weekday}' where it starts a title or sentence, and lists these strings in the PR. The next brief asks for a mid-sentence self form.

### CM-03 · note · app

- **State:** G04-confirmed-others (and the G05 week): the public contested row
- **Finding:** The key the delivery names for the non-choosers' Friday is one line with a middle dot, but the frame draws two lines in two type roles, as weekRows describes. A build that renders the named key would lose the bold state word.
- **Evidence:** confirmedOthers.FridayCopyKey: 'handoff5.calendar.publicContested' = 'Contested · No reveal scheduled'. frames/G04-confirmed-others.png and screen-copy draw 'Contested' (bold row role) above 'No reveal scheduled' (metadata) as separate runs. weekRows.contested: 'Weekday + Contested / No reveal scheduled'. The two parts exist as calendar.state.contested and calendar.noReveal.
- **What the app does, and who acts:** The app follows the frame and weekRows: calendar.state.contested over calendar.noReveal, with calendar.publicContested.vo as the label. It uses calendar.publicContested only where one line is needed.

### CM-04 · should · app

- **State:** INVENTORY.md (PR #13): notes on the G04-conflict, G04-confirmed and H01-paused rows
- **Finding:** Three row notes that X-01 to X-03 don't touch go wrong once handoff 5 comes in. One limits names to two members, one says a frameless state is words only though handoff 5 now draws its layout, and one points to a state that X-01 renames.
- **Evidence:** Line 58 (G04-conflict): 'Names only to the two members involved (FQ46): see Known differences'; handoff 5 gives names to every chooser, however many. Line 60 (G04-confirmed): 'Words only (handoff 3)'; handoff5.confirmedOthers.surface is 'G04 post-confirmation summary, read-only', the same screen after anyone confirms. Line 87 (H01-paused): 'a suspended club is `H01-suspended`', which X-01 renames H01-unavailable.
- **What the app does, and who acts:** In the design PR, rewrite line 58's note to 'names only to the members who chose the day (FQ46)', add to line 60 'layout from G04-confirmed-others', and change line 87's pointer to H01-unavailable.

### CM-05 · should · claude-design

- **State:** G04-two-days with fewer than two days chosen
- **Finding:** Book p11 says the two-day confirmation enables only for two choices, but handoff 5 gives no label or hint for that disabled state. The confirm template would read 'Confirm Monday' after one choice, which looks like a complete choice.
- **Evidence:** Book p11: 'Occupied days identify their owner; the confirmation enables only for two choices.' handoff5.calendar.confirm 'Confirm {weekdayList}'; calendar.confirm.hint 'Confirm your recurring day choices.'; the only unavailable hint is calendar.confirm.contested.hint '{stateLabel}. Confirmation is unavailable.' G04-two-days draws only the state with two days chosen ('Confirm Monday and Thursday'). 2.1 drew 'Confirm two days'.
- **What the app does, and who acts:** Meanwhile, the app keeps the button disabled until two days are chosen (book p11), with the delivered label and no invented hint, and marks the state built from spec. The next brief asks for the disabled label and hint.


## Completeness critic

**Summary.** I checked the delivery for problems the five lenses missed, testing each one against the files. I found 11 that none of the surviving findings cover: 5 should and 6 note. None is a must.

The should findings:
- **C-01:** The contested explanation, "{chooserSentenceList} chose {weekday}.", can tell a member they "chose" a day they never touched. Under the Default, an untouched proposal counts as that member's choice.
- **C-02:** Neither denied Home (unavailable or access lost) says what the drafts list shows for a draft whose labelled target is in the denied club. The delivery's own + Add sends the person there.
- **C-03:** No words exist for a confirmation the server refuses because the day became contested a moment earlier. The only confirm error from handoff 3 would name an owner who doesn't exist.
- **C-04:** No surface gives a travelling member the open day's closing time. The open Home says "Until 1 AM" with no zone, and the local-times sheet leaves out the open day.
- **C-05:** The collecting card's only spoken string, card.status.vo, has no author. T47 requires a hidden drop to announce its author and opening time.

The notes:
- **C-06 (founder):** Nothing says how soon a newly confirmed day can first open.
- **C-07:** The read-only week is spoken two ways, on G04-confirmed-others and on G05-schedule-review.
- **C-08:** The local-times sheet puts club time first. Every other travelling surface puts local time first.
- **C-09:** No format exists for a countdown over 24 hours. Sunday people reaches one every Sunday morning.
- **C-10:** One VoiceOver hint uses the word "accessible", which reads as jargon.
- **C-11:** G04-confirmed-others keeps a Back button. It leads back to the choice list, which has no row for the viewer's own confirmed day.

Five surviving findings set what the app does meanwhile in a way that goes against a source or a sibling finding, and F-14 isn't a defect. I put all six in "resolved".

Checked and found clean:
- The denied and public-contested SVGs hold no hidden names in labels, titles or ids.
- The G05-local-times dates, the H01-travelling times and the G04-change dates are correct.
- The day-choice, Sunday and week row heights and the 16 pt footer gap match the contracts.
- Every written ask in the brief has an answer.

### C-01 · should · claude-design

- **State:** G04-conflict, G04-one-day and every day-choice screen: the contested explanation and the viewer's own proposed row
- **Rule:** T43 ("Copy is direct and factual"); T49 (truthful states)
- **Finding:** Under the Default, a member's untouched proposal counts as that member's choice, and the delivery draws it that way. G04-one-day shows Ben's proposal, which nobody has acted on, as "Your choice". Choosing another member's still-only-proposed day makes it contested. The one explanation template then says each chooser "chose" the day. So a member who has never opened the day-choice screen is told "You and Ben chose Friday." The words don't separate a day held only because it was proposed from a day someone picked.
- **Evidence:** copy handoff5 "calendar.contested.explanation": "{chooserSentenceList} chose {weekday}.", example "You and Debby chose Friday."; "calendar.row.contested.vo" ends "Your choice.". On G04-one-day, whose brief fixture is "nobody has confirmed a day yet ... each still only proposed", Monday is drawn "Ben · You" / "Your choice" with the label "Monday. Ben, you. Your choice.". dayChoiceRow.ownChoice: "Surface fill + self name/You + native selected circle + Your choice". Brief item 1 Default: "a day still only proposed for a member can be chosen by anyone who hasn't confirmed, and choosing it makes it contested, as Ben's choice of Debby's Friday did." T43: "Copy is direct and factual".
- **What the app does, and who acts:** Meanwhile the app uses the delivered strings, because the Default counts a member's proposal as their choice. The next brief asks for an explanation and a row state that stay true when one chooser holds the day only because it was proposed for them.

### C-02 · should · claude-design

- **State:** H01-unavailable and H01-access-lost: + Add, then Open my drafts
- **Rule:** Brief items 9 and 10 (nothing of the club from the phone's cache; T9, T14, T24); book p22, p46
- **Finding:** On both denied Homes the delivery routes + Add to Open my drafts. Drafts carry labelled hints for an intended club, person and date (book p22, p46), and FQ15's default keeps them on the phone. Nothing says what a draft whose hint points at the denied club shows. Built as book p22 says ("Optional intended targets remain labelled"), the list would show the suspended or lost club's person and date from local storage. That is exactly what the delivery forbids on these screens.
- **Evidence:** component-contracts handoff5.deniedHeader.Add: "Private draft, then Open my drafts; no selected-club target.". IMPLEMENTATION.md: "no cached club record is used to paint a title, person, date, caption, image or memory". Brief item 9: "nothing of the club can be read: no person, date, caption, photograph or Memories, from the server or the phone's cache (T9, T14, T24)". Book p22: "Optional intended targets remain labelled." Book p46: "intended_club, intended_person and intended_occurrence are nullable hints." PR #13 FQ15 default: "drafts live on the device only, per account".
- **What the app does, and who acts:** Meanwhile, in the drafts list, a draft whose intended club the account can no longer open shows no intended club, person or date. It reads as an unassigned private draft, and the stored hint is kept so nothing is lost. Choose a friend asks for an explicit destination (book p44). The next brief asks how such a draft is shown.

### C-03 · should · claude-design

- **State:** G04 choice screens: a confirmation refused because the day became contested in the meantime
- **Rule:** T43 ("Errors name the action that failed and keep the person's input"); spec 05 ("unresolved conflicts are visible")
- **Finding:** Under the Default, a day becomes contested as soon as another unconfirmed member chooses it. A Confirm sent from a screen loaded a moment earlier is then refused. Neither handoff has words for that refusal. The only confirm error that is still current is handoff 3's confirmTaken, and it says the day "is now {ownerName}'s day", which a contested day never is. Handoff 5's contested words exist only as the disabled button's hint.
- **Evidence:** handoff3.G04.error.confirmTaken: "Couldn’t confirm {weekday}. {weekday} is now {ownerName}’s day. Your other choices are unchanged." It isn't in handoff5.replaces. handoff5.choiceRules.taken: "Other proposals are selectable and become contested." multiway: "No chooser can confirm until only one choice remains on a day." calendar.confirm.contested.hint: "{stateLabel}. Confirmation is unavailable.". No handoff5 key begins "Couldn’t".
- **What the app does, and who acts:** Meanwhile, when the server refuses a confirmation because the day is now contested, the app keeps the person's choices. It reloads the screen so the row shows Contested with calendar.contested.explanation, and disables Confirm with calendar.confirm.contested.hint. It never uses confirmTaken for this case. The next brief asks for the refusal's words.

### C-04 · should · claude-design

- **State:** Home during an open day for a member who is travelling (2.1 H01-open, H01-your-day); G05-local-times during an open day
- **Rule:** T2 ("A member who is travelling sees the local equivalent, with the club's zone available"); book p29; T41
- **Finding:** The delivery covers travel for the waiting Home, Friends, F02 and the week, but not the open day. The open Home's closing line, "Until 1 AM", has no zone and no local equivalent. The local-times sheet lists only later occurrences, so it leaves out the open one. During Debby's open Friday, Ben in London can't see anywhere that Home closes at 6 AM London time.
- **Evidence:** 2.1 H01-open and H01-your-day: "Until 1 AM · Kept in Memories". No handoff has an "Until" template; the cumulative copy-contracts have none. handoff5.travellingRows has entries for Home ("countdown unchanged from the shared instant"), Friends, F02 and week only. localTimesSheet.why: "sheet shows dated openings AND closings across all next authorized occurrences". G05-local-times is drawn "during Debby's open Friday" and its list starts at "Nina’s Saturday". Debby's Friday closes Saturday, November 7, 2026 at 1 AM in New York, which is 6 AM in London (zoneinfo).
- **What the app does, and who acts:** Meanwhile the app lists the open occurrence first in G05-local-times, with its local.closes lines in both zones. On the open Home, when the phone's zone differs from the club's, it adds the club zone's name to the closing time, so 1 AM is never read as local. The next brief asks for the open Home's closing line while travelling.

### C-05 · should · app

- **State:** The collecting card (F02 and the brand-components specimens): VoiceOver
- **Rule:** T47 ("a hidden drop announces its author and opening time, never its content")
- **Finding:** Handoff 5 adds the first spoken string for a collecting card, and it covers only the status line, which has no author. No contract says how the card's sender, caption and status are grouped for VoiceOver. If card.status.vo becomes the card's label, a hidden drop is announced without its author.
- **Evidence:** copy handoff5 "card.status.vo": "Opens {fullDateTime}, {clubZoneName}. Hidden content." and "card.status.travelling.vo" (both provenance new) have no author parameter. collectingCardStatus has senderRole "row" and no card-level label. No earlier handoff gives a card label: the cumulative copy-contracts hold none.
- **What the app does, and who acts:** Meanwhile the app groups the card into one element. It speaks the sender's name, the caption, then card.status.vo or its travelling form, so the author and the opening time are announced and nothing hidden is. The next brief asks for the card's label template.

### C-06 · note · founder

- **State:** A club's first days: the first occurrence of a just-confirmed day (H01-confirm-days to H01-waiting)
- **Rule:** Spec 04 ("If the first reveal is days away, show the actual waiting card and exact date ... Do not ... silently provide an instant first reveal"); T3
- **Finding:** Neither the Default nor the delivery says which date a newly confirmed day first opens on. As written, a day confirmed at 6:59 AM could open at 7 AM that morning, and T3 freezes it at that instant, so nobody would have time to add anything. The delivery moves Home to "the next confirmed occurrence" without any lead time. Spec 05's boundary rule covers membership changes only.
- **Evidence:** Brief item 7 Default: "each day goes ahead as soon as its member confirms it". component-contracts handoff5.firstDays.beforeAnyConfirmed: "each confirmed assignment proceeds independently"; whenFirstConfirms: "Home resolves to the next confirmed occurrence". Spec 05: "The schedule service first finds a future boundary with no submitted occurrence affected, then requests confirmation", which is said of membership changes.
- **What the app does, and who acts:** Meanwhile the app adds the question to docs/QUESTIONS.md with a default. The safest reversible default is that a first occurrence never falls on the club-local date of its confirmation. The founder decides.

### C-07 · note · app

- **State:** The read-only week: G04-confirmed-others and G05-schedule-review
- **Rule:** Book p34 ("A component has one shape, one meaning")
- **Finding:** The delivery says the public week rows on G04-confirmed-others can be reused in G05, but the two frames speak them differently. G04 gives the weekday and the person. G05 adds the opening and closing times.
- **Evidence:** confirmedOthers.notG05: "the same read-only public rows are reusable in G05". G04-confirmed-others labels: "Tuesday. Maya, you.", "Saturday. Nina." (calendar.week.assigned.vo "{weekday}. {personSpeech}."). G05-schedule-review labels: "Monday. Ben, you. Opens at 7 AM. Home closes at 1 AM on Tuesday, New York." (schedule.row.vo).
- **What the app does, and who acts:** Meanwhile the app uses schedule.row.vo on G05, where it replaces handoff3.G05.schedule.vo.*, and calendar.week.assigned.vo on the G04 summary. It records both in INVENTORY.md. A later brief confirms whether the summary's rows also speak the hours.

### C-08 · note · claude-design

- **State:** G05-local-times against H01-travelling, Friends and F02 while travelling
- **Rule:** Book p29 ("Travelling members see their local equivalent with the club zone available")
- **Finding:** The sheet titled "Times in your time zone" puts club time first in every block and in its spoken label. Every other travelling surface in the delivery puts local time first.
- **Evidence:** G05-local-times draws "Club time · New York" above "Your time · London" in each block. local.group.vo speaks "{clubZoneName}: opens ..." before "{deviceZoneName}". travellingRows: Home is "Local exact date/time first", Friends is "Local next date/time + device zone, second metadata line club time", and F02 is "Local exact opening line, club exact date/time beneath it". H01-travelling draws "Opens 12 PM · London" above "7 AM · New York".
- **What the app does, and who acts:** Meanwhile the app builds the sheet as drawn. A later brief asks for one order across the travelling surfaces.

### C-09 · note · claude-design

- **State:** Home's countdown when the next opening is more than a day away
- **Rule:** Spec 08 ("Synchronize countdowns with server_now"); spec 04 ("If the first reveal is days away, show the actual waiting card and exact date")
- **Finding:** The first countdown template has no form for durations over 24 hours. They occur in the book's own club: at 1:01 AM on Sunday 8 November, Ben's Monday is 29h 59m away. In a club's first days with one confirmed day, the wait can be almost a week.
- **Evidence:** copy handoff5 "home.countdown": "{durationCompact}" (drawn "5h 59m"), with no rule or example past 24 hours. 2.1 draws only "5h 19m", "5h 59m" and "21h 19m". Saturday's occurrence closes Sunday 1 AM and Monday opens at 7 AM, a gap of 30 hours.
- **What the app does, and who acts:** Meanwhile the app formats the countdown from server_now with the system's abbreviated duration formatter, using at most two units. A later brief confirms the form for a countdown longer than a day.

### C-10 · note · claude-design

- **State:** H01-paused: the View Memories hint
- **Rule:** T43 (plain voice)
- **Finding:** The new hint says "accessible days". In a VoiceOver hint, that reads as the accessibility sense of the word. The same screen's visible line already says it plainly: "the days you can access".
- **Evidence:** copy handoff5 "a11y.viewMemories.hint": "Show accessible days in {clubName}.". handoff3.H01.paused.history, still current: "Memories still shows the days you can access."
- **What the app does, and who acts:** Meanwhile the app uses the delivered hint. A later brief asks for plain wording.

### C-11 · note · claude-design

- **State:** G04-confirmed-others: Back after confirming
- **Rule:** Brief item 4 Default (the week is read-only); book p11
- **Finding:** The post-confirmation summary keeps a Back chevron beside Done. Back would return to the choice list, but the day-choice row has no state for the viewer's own confirmed day. Nothing says what Maya would see there or whether the confirmed day can still be changed.
- **Evidence:** screen-copy G04-confirmed-others controls: Back [8,54,44,44] and Done [20,760,353,50]. confirmedOthers: "surface": "G04 post-confirmation summary, read-only", "primary": "Done". dayChoiceRow states are free, otherProposed, otherConfirmed, ownChoice and contested, with no own-confirmed state. calendar.row.confirmed.vo speaks another member's day: "{weekday}. {personSpeech}. Confirmed. Unavailable."
- **What the app does, and who acts:** Meanwhile Back and Done both leave the G04 flow, returning to the screen that opened it rather than to the choice list. The app records this in INVENTORY.md. A later brief asks for the own-confirmed row and the summary's navigation.


**The critic's disputes of earlier actions**

- **dispute F-14.** Not a defect. Handoff 3's date rule, which handoff 5 doesn't replace, says "Status-bar time is presentation chrome, not a scheduling clock." T45 says "The status bar, tab bar and device frame in the renders are presentation." So the 9:41 on G05-local-times is not a fixture time. F-14's action, a snapshot time inside Debby's open Friday, is still a fine test choice.
- **dispute X-15.** Its action is the outlier. It writes the club's date in Home's date heading, but the delivery says the opposite: travellingRows.Home is "Local exact date/time first, club-zone equivalent visible". R-06, FM-01 and VM-01 all keep the heading local. FM-01, W-06, R-06, VM-01 and X-15 describe one gap and should share one action. R-06's fits best: when the two dates differ, each time line carries its own full date (upcoming.local, upcoming.club), and the plaque and title keep the club's date. That meets T41 with delivered templates and doesn't override the contract.
- **dispute WM-01.** Its action builds G04-change's "From {fullStartDate}" header without the year, as drawn. Handoff 3's date rule says "Exact start dates include year.", and handoff 5 doesn't replace it: handoff5.replaces in component-contracts lists nine entries, and none is the date rule. X-16's action, start dates always with the year, follows the rule over the frame, so the ios thread should take X-16's.
- **dispute R-15.** Its action keeps "Up next" as delivered. Spec 08 says "Home shows Next up Nina". Spec 03 says to use the same noun everywhere. T41 and CLAUDE.md make the spec's vocabulary the authority for copy. FM-02's action uses "Next up" on Home and Friends, and it is the one to build.
- **dispute X-19 and V-17 (their past-day card action).** Both build handoff 5's restyled past-day card on 2.1's H01-after-close as well. FQ2 keeps the 53 screens of 2.1 as the reference until the founder replaces one, and the founder's yes in the brief covered only frames 12 and 13. Under design/reference/README.md, 2.1 governs component anatomy until the founder decides. F-10's action follows FQ2: 2.1's card on both Home states, with handoff 5's words.
- **dispute WM-04.** Its action conflicts with VM-02's on the same line. WM-04 builds G05 as drawn: the hours, then the zone on its own line. The delivery's replacement map sends handoff3.G05.schedule.revealHoursZone to calendar.hoursZone, and its README says "Resolve replacements". IMPLEMENTATION.md adds "Current UI selects the H5 key through the replacement map." VM-02's one-line calendar.hoursZone follows that and gives G04-change and G05 one form (book p34). The ios thread should pick VM-02's and record the frame difference.

**Other notes from the critic**

