# Design handoff 6: every finding, with its evidence

*4 November 2026. The evidence behind `handoff-6-check.md`. Five independent reviews read the delivery, each through one lens. A second reviewer then tried to refute each of the 73 findings: 48 were confirmed, 24 corrected (the corrected version is the one shown) and 1 refuted (shown, marked refuted). The second reviewers added 14 findings they found themselves (ids with M), and a completeness critic added 6 more (ids C-) and disputed six actions (last section). Severity: must = breaks an invariant, the spec, a Default or the brief, or would mislead the build; should = a real gap the build or a later brief must handle; note = worth recording. "Who" says who acts: app (Claude Code, or the ios thread recording something), claude-design (a later brief), founder, or none. Each lens summary is that reviewer's own, written before the second review, so its severities can differ from the verified ones below. Where two findings describe one issue, section 8 of the report says which action the app takes.*


## Frames: the 16 numbered items of the brief, and the 11 redraws

**Summary.** Handoff 6 has all 15 requested states, the brand-components sheet and 11 extra redraws, each with an explanation. The fixtures and Defaults are drawn as the brief states them: FQ46, FQ48, FQ55, FQ57, FQ79, FQ16 and the first-days reading. So are the six app rules: "Next up", the club line with no peopleZone, the countdown spoken as its target, the small "your", "Selected" spoken once, and one zone at home. I checked every date with zoneinfo and all are correct: the FQ79 first dates (Nina 7, Maya 10, Alex 11, Sam 12 November; 5 November's 7 AM is 22 h after confirmation), the Auckland and London times (+18 h and +5 h), 5h 59m, and 29h 59m shown as 1d 5h 59m. One must-fix: four G04 frames draw proposed rows with no selector, against the delivery's own dayChoiceRow.otherProposed ("empty selector") and handoff 5's G04-one-day. Should-fix items: (1) Sam, who didn't choose Friday, gets the chooser's help line. (2) The switcher offers Club details while the selected club is suspended (a founder question). (3) In the switcher, the Kitchen table row and Club details targets overlap by 9 pt. (4) Several unexplained changes in the redraws: looser G04-change spacing hides Maya's group; the waiting card is restyled; the denied titles shrink; Friends loses its New York footer, its photo-avatar edges and the bold Next up; the local-times sheet drops Debby's Friday 13 November; frame 1's title moves. The notes cover rows outside the viewport, View local times moving from centred to leading, and the Private drafts card on Club details.


**What was delivered, item by item**

- **1 H01-confirm-days (redraw).** Same fixture. The body is now 'Your club’s next scheduled day will appear here.' (handoff6.home.confirm.body), which names nobody, counts nothing and gives no date. The Private drafts row is kept and drawn (rect 20,272,353,76). Choose your day (hint 'Review your choices in the proposed week.') and + Add (private only) are unchanged. FQ79 is stated in writing: the first 07:00 club instant at least 24 elapsed hours after confirmed_at, equality qualifies. Other changes are in F-11.
- **2 G04-conflict-three.** Ben's view. Friday reads 'Contested' with 'Ben · You, Alex and Debby' ({chooserNameList}, roster order), and the written answer says prose doesn't repeat the list. Explanation template: 'The proposed days overlap on {weekday}.' Monday reads 'Available / Proposed for you'. Wednesday reads 'Available' and names nobody. Confirm Friday is disabled (FQ55), hint 'This day is contested. Confirmation is not possible yet.'
- **3 G04-contested-other.** Sam's view. Thursday reads 'Sam · You / Your choice'. Friday is outlined, reads 'Contested / No reveal scheduled', has an empty selector and shows no names or count (FQ46). Label: '{weekday}. Contested. No reveal scheduled. Can be chosen.' Hint: 'Choose {weekday}. You’ll then see the people in this contested choice.' (FQ48). Confirm Thursday is enabled. See F-02 for the help line.
- **4 G04-confirm-refused.** Debby's view. The refusal reads 'Couldn’t confirm {weekday}. This day is contested. Your choice is kept.' in secondary ink, with no red. Friday reads 'Contested / Ben and Debby · You'. Confirm Friday is disabled. Monday reads 'Available' with no name, and Wednesday 'Alex / Proposed', as the fixture states.
- **5 G04-two-days-one-chosen.** Monday is Ben's choice. Thursday reads 'Available / Proposed for you'. The disabled button reads 'Confirm two days', with the same label and the hint 'Choose two days before confirming.'. A selected row's hint is 'Remove {weekday} from your choices.'. The club line is 'New York', with no name.
- **6 G04-confirmed-many.** 'Your days are confirmed.' over a read-only week: Monday and Thursday read 'Ben · You', Tuesday and Friday 'Debby', and the other days 'No reveal scheduled'. Done is at the bottom. In writing: Back and Done both return to the saved safe origin (Home or Schedule). An ownConfirmed row (check, Confirmed, no selector) covers a restored picker. FQ57 is kept.
- **7 G05-schedule-choose-own.** 'Sunday people · New York', then the hours. A 'Choose your day' row, seen only by Ben, opens G04-one-day, above the read-only week. Monday and Friday read 'No reveal scheduled' and name nobody. The labels follow '{weekday}. {personSpeech}. Confirmed.', and nextDates, nextUp and contentSignals stay false.
- **8 F01-friends-first-days.** Maya 'Tuesday, November 10 · 7 AM', Alex 'Wednesday, November 11 · 7 AM', Sam 'Thursday, November 12 · 7 AM', Nina 'Next up' 'Saturday, November 7 · 7 AM' (all verified under FQ79). The 'Ben · You' and 'Debby' rows show the name only, with no date, chevron or tap action. Label '{personSpeech}.', hint empty. In writing, tapping these rows does nothing.
- **9 G05-local-times-same-zone.** At 1:01 AM on 7 November in New York, the sheet 'Times in your time zone' has one 'Club and your time · New York' block per occurrence, from Nina's Saturday 7 to Debby's Friday 13. The hint template is 'Show dated opening and closing times in {clubZoneName}.' In writing: during an open day, the open occurrence comes first with its closing time and 'Open now'.
- **10 H01-travelling-dateline.** Status bar 7:01. 'Next up', 'Nina’s Saturday' and SAT 07. The time lines are 'Opens Sunday, November 8 · 1 AM · Auckland' and 'Saturday, November 7 · 7 AM · New York'; the countdown is 5h 59m. New templates: home.localOpening.dated and home.clubOpening.dated. The waiting card is spoken as one group ('Opens {localFullDateTime}, {deviceZoneName}; {clubFullDateTime}, {clubZoneName}'), and the countdown's spoken label is its target. The travelling Add hint names both zones. A wait over a day shows '1d 5h 59m' (29 h 59 m, verified). No second plaque.
- **11 F01-friends-travelling.** Each row shows the Auckland date and time, then the club's full date, time and New York (friends.date.club.dated). All six pairs are verified, for example Debby 'Saturday, November 14 · 1 AM · Auckland / Friday, November 13 · 7 AM · New York'. Ben's hint is 'Open your Monday.' See F-13.
- **12 F01-unavailable.** Friends selected. The header has the wordmark, + Add (private) and the account avatar. 'Club unavailable / This club isn’t available right now.', with one 'Choose a club' and 'Get help'. Nothing of the club is shown. In writing, M01-unavailable takes the same form.
- **13 M01-access-lost.** Memories selected. 'This club is no longer available. / Choose a club to continue.' with one 'Choose a club', and no past day, photograph or search. In writing, F01-access-lost takes the same form.
- **14 G06-switcher-unavailable.** The sheet sits over the denied Home. 'Sunday people / Unavailable' has a check, label 'Sunday people. Unavailable.' and the selected trait, so 'Selected' is spoken once. 'Kitchen table / 5 people · Next: Maya', as in 2.1. Club details, Create a club and Cancel follow. See F-03 and F-04.
- **15 G05-club-details-paused.** 'Kitchen table', '1 member' (zone left out; details.footer keeps {clubZoneName}), Members, Invite someone (hint 'Propose a new member for Kitchen table.'), Schedule, Notifications, Widget, the Private drafts card and Leave club. FQ16 is restated in writing. See F-14.
- **16 brand-components.** 1200x9680. The top 6880 pt are pixel-identical to handoff 5's sheet. The 2800 pt added at the bottom hold light and dark specimens: dark canvas and both accent fills appear. Per the PDF they cover the waiting hero, the dated time lines, the denied header, the switcher states, the review rows, the local-time blocks, every day-choice row and SundayRow. Dark pairings: plaque canvas/primaryText (#121D19/#F7F8F2) 16.2:1, initial avatarCanvas/onAvatarCanvas (#35463A/#F7F8F2) 9.4:1. Tokens are unchanged.
- **Redraw G04-conflict.** Asked for and explained: explanation 'You and Debby chose Friday.' becomes 'The proposed days overlap on Friday.'; VoiceOver 'Unavailable' becomes 'Taken'; 'Previously proposed for you. Not selected.' becomes 'Proposed for you.'; new Friday and Confirm hints; 4-pt gaps between rows. Fixture unchanged. The longer list pushes Sunday's 'No reveal scheduled' out of view (F-15).
- **Redraw G04-one-day.** Explained: instruction 'Choose a day that works for you, then confirm.'; the shared Proposed tag replaces the diamond; the own choice uses the cover2 fill; Monday's hint is 'Your current choice. Choose another day to change it.'. Not explained: the empty selectors on Tuesday to Saturday are gone (F-01).
- **Redraw G04-two-days.** Rule and explained answers: the club line 'Ben and Debby · New York' becomes 'New York'; Wednesday and Saturday rows are 48 pt; selected-row hints read 'Remove {weekday} from your choices.'; 'Taken' and no 'Not selected'. Fixture unchanged; Available rows keep their selectors.
- **Redraw G04-change.** Explained: Not now moves to the navigation bar with 'Leave this proposal without confirming it.'; the divider returns; zone and hours sit on two lines; every date carries its year; Sunday is at x=20; Confirm moves from y 724 to 760. Not explained: looser spacing hides Debby's and Maya's proposed groups and Sunday, and the kept dates are stacked with no middle dot (F-05).
- **Redraw G05-schedule-review.** Explained: zone then hours; row labels '{weekday}. {personSpeech}. Confirmed.'; the View local times hint names one zone. Not explained: View local times moves from centred (x 139–253) to leading (x 20–134) (F-12). Fixture unchanged.
- **Redraw G05-schedule (handoff 3's).** Explained: 'Sunday people · New York' then the hours, where handoff 3 had bold 'Sunday people', the hours, then bold 'New York'. The rows take handoff 5's weekRows two-column form (it replaced G05WeekView) with 'Confirmed' labels. Not explained: View local times moves from centred to leading (F-12).
- **Redraw H01-travelling.** Explained: 'Up next' becomes 'Next up'; 2.1's outlined past-day card with a check; a travelling Add hint naming both zones; the waiting card spoken as one group. Not explained: the waiting card's type, inset, avatar and countdown are restyled, and See captions moves from x 28 to 20 (F-06).
- **Redraw H01-unavailable.** Explained: the header's 'Choose a club' selector becomes the wordmark. Not explained: the title is smaller and lower, Choose a club moves up 6 pt, and Get help moves from centred to leading (F-07).
- **Redraw H01-access-lost.** Explained: the wordmark header replaces 'Choose a club'. Not explained: the title is smaller and lower (F-07).
- **Redraw F01-friends (handoff 3's).** Explained: title to subtitle 8 pt, subtitle to Private drafts 24 pt. Not explained: the 'New York' footer is dropped and See schedule moves to leading (F-08); the photo-avatar edges are gone, Next up is no longer bold, and the selected Friends tab icon is outlined (F-09). Fixture unchanged.
- **Redraw G05-local-times.** Explained: Debby's open Friday 6 November comes first, with 'Open now' and its closing time. The moment is now explicit: 2:41 PM London, 9:41 AM New York, matching handoff 5's brief ('during Debby's open Friday'). Debby's Friday 13 November is dropped and the title moves under Done (F-10).


**Findings**

### F-01 · must · claude-design · confirmed

- **State:** G04-one-day (redraw), G04-conflict-three, G04-contested-other, G04-confirm-refused
- **Rule:** FQ48 Default: a proposed-but-unconfirmed day can be chosen. The delivery's own handoff6.dayChoiceRow.otherProposed: 'Name plus existing proposedMemberTag (…); empty selector.' The same rule was in handoff5.dayChoiceRow.otherProposed ('Selectable empty circle + owner + …'). FQ2 makes handoff 5's G04-one-day, which drew those circles, the reference.
- **Finding:** Every row for another member's proposed day is drawn with no selector. Only Available, own and contested rows keep one, so a row that can be chosen looks like a confirmed row that can't. The four frames contradict the delivery's own contract and the frame the founder adopted (FQ2). No answer explains the change.
- **Evidence:** handoff6.dayChoiceRow.otherProposed: '... empty selector.' G04-one-day (h6): one selector, on Monday. Handoff 5 G04-one-day: empty circles on Tuesday to Saturday too. G04-conflict-three: none on Tuesday (Maya), Thursday (Sam) or Saturday (Nina). G04-contested-other: none on Tuesday or Saturday. G04-confirm-refused: circles only on Monday and Friday. The brand-components H6 specimen 'Tuesday. Maya. Proposed. Can be chosen.' also has no circle. screen-copy gives each proposed row 'Proposed. Can be chosen.', the hint 'Choose Tuesday.' and enabled true.
- **What the app does, and who acts:** The app follows the contract: a proposed row keeps the native empty selector, as handoff 5 drew it. The ios thread records that the four frames and the sheet specimen differ on this point.
- **Second reviewer:** Verified. handoff6.dayChoiceRow.otherProposed says 'Name plus existing proposedMemberTag (...); empty selector.' and prototypeControl keeps 'Native List selection with SF circle'. None of the proposed rows in G04-one-day, G04-conflict-three, G04-contested-other or G04-confirm-refused has a selector, but each row's label ends 'Can be chosen.', its hint is 'Choose {weekday}.' and enabled is true. Handoff 5's adopted G04-one-day drew empty circles on Tuesday to Saturday. The new light day-choice specimen on brand-components ('Tuesday. Maya. Proposed. Can be chosen.') has no circle either. Only the Available rows and the contestedOther row have circles (r=10, stroke #778579). So the drawings agree with each other but contradict the written contract and the FQ2 reference. IMPLEMENTATION doesn't explain it.

### F-02 · note · claude-design · adjusted

- **State:** G04-contested-other
- **Rule:** Brief item 3 (Sam 'hasn't confirmed and didn't choose Friday'). handoff5 calendar.contested.help is written for the members who chose the contested day. T33: nothing chases.
- **Finding:** Sam isn't one of Friday's choosers, yet sees the choosers' help line under the overlap sentence. The line is true for Sam, but it may read as if Sam's own choice were part of the clash.
- **Evidence:** G04-contested-other drawnText: 'The proposed days overlap on Friday.' / 'You can choose another day, or keep your choice.' (handoff5.calendar.contested.help). Sam's row is 'Thursday / Sam · You / Your choice'. The validation report's AX5 longestDefaultText for G04-contested-other is that line.
- **What the app does, and who acts:** The app follows the frame. The next brief can ask whether a non-chooser should get calendar.choice.help instead.
- **Second reviewer:** It's true that G04-contested-other draws handoff5.calendar.contested.help under the overlap sentence, and the validation report's AX5 entry names it. But for Sam the line is literally true: Sam can choose another day or keep Thursday. No source or Default limits the line to choosers. Handoff 5 says only that it 'works for two or more people'. Nothing breaks a rule, so the frame stands meanwhile. Swapping in calendar.choice.help would be the app choosing copy against a drawn frame. This is a wording question to record, not a gap the build must handle.

### F-03 · should · founder · confirmed

- **State:** G06-switcher-unavailable
- **Rule:** Brief item 12: a denied club shows 'nothing of the club from the server or the phone's cache (T9, T24)'. Book p24: Club details shows the club's count, roster and schedule. Spec 22 says nothing on whether a member can leave, or see the details of, a suspended club.
- **Finding:** With the suspended Sunday people selected, the sheet still offers 'Club details', and nothing says where it leads. Club details would show the suspended club's roster and schedule. Hiding it removes the member's usual route to Leave club. Which way to go is a product question that no source settles.
- **Evidence:** Controls: 'Sunday people', label 'Sunday people. Unavailable.', traits ['selected']; 'Club details' rect [20,670,353,44], route 'native sheet action', enabled true. IMPLEMENTATION: 'Sunday people is still in the authorized club list, selected, with Unavailable ...', with nothing on Club details for a denied selection.
- **What the app does, and who acts:** The app hides Club details while the selected club is unavailable, the safest reversible reading. The server's read predicate denies any club-details request for that club. The question goes in docs/QUESTIONS.md with that default.
- **Second reviewer:** Verified. G06-switcher-unavailable keeps 'Club details' (rect [20,670,353,44], enabled, route 'native sheet action') while the suspended Sunday people is selected. IMPLEMENTATION, deniedHeader and switcherStatus say nothing about where it leads for a denied club. Book p24 says Club details shows the count and roster. Spec 22 says nothing on leaving, or viewing the details of, a suspended club. The brief's item 12 asks for 'nothing of the club from the server or the phone's cache'.

### F-04 · note · app · adjusted

- **State:** G06-switcher-unavailable
- **Rule:** Book p26 and T47: every control is at least 44 pt, and targets must not overlap. Handoff 5's G06-switcher-status left a 16-pt gap between the last club row and Club details.
- **Finding:** The Kitchen table row's target and the Club details target overlap by 9 pt, and 'Club details' sits close under the row's separator. Handoff 5 left a 16-pt gap.
- **Evidence:** Kitchen table rect [20,615,353,64] ends at y 679; Club details rect [20,670,353,44] starts at y 670. Separator rect y 678, height 1. 'Club details' ink y 686.5–697.5. Handoff 5: Kitchen table [20,572,353,64] ends at 636; Club details starts at 652.
- **What the app does, and who acts:** The app builds the sheet with native list rows and spacing, so the targets don't overlap. The ios thread records the difference.
- **Second reviewer:** The 9-pt overlap is real: Kitchen table [20,615,353,64] ends at 679, and Club details [20,670,353,44] starts at 670. Handoff 5 left a 16-pt gap. The 'Club details' ink starts at y 686.5, about 8 pt below the separator at 678–679, not 6. But neither book p26 nor T47 says targets must not overlap; they set only the 44-pt minimum. The app builds this sheet from native list rows, which can't overlap. The build has nothing to resolve, so this is a note.

### F-05 · should · claude-design · confirmed

- **State:** G04-change (redraw)
- **Rule:** The brief's redraw rule ('A redraw keeps everything else in the earlier frame as it was'). handoff6.spacing still holds changeSectionGaps [12,8,12,8] and changePersonRowPitch 48. handoff6.changeRows.keptDates: 'Visible list uses a middle dot between dates; AX5 stacks dates in same person group.'
- **Finding:** The redraw roughly doubles the vertical gaps, and no answer explains it. As a result Debby's and Maya's proposed groups and the Sunday row fall below the viewport. The only proposed group visible is Ben's 'Unchanged', so Maya's new days, the change itself, no longer show. At default size the kept dates are also stacked with no middle dot, which contradicts the delivery's own keptDates rule.
- **Evidence:** bodyViewport [0,348,393,332] ends at y 680; bodyContentBottom 891. Gap from 'Current days through…' to 'Ben · You': 33 pt (handoff 5: 15.5). From Ben's last date to 'Debby': 29 pt (handoff 5: 11). drawnText 'Monday, November 9, 2026' | 'Thursday, November 12, 2026', each on its own line with no '·'. Joined with ' · ', each pair would be about 338–346 pt, under the 353-pt width. Handoff 5's frame showed all five groups and Sunday.
- **What the app does, and who acts:** The app uses the retained spacing values (12/8/12/8 section gaps, 48-pt person rows). It joins kept dates with a middle dot and stacks them only when they don't fit or at large text sizes. The ios thread records the frame's spacing as unexplained.
- **Second reviewer:** Verified. Ink gap from 'Current days through…' to 'Ben · You': 33 pt (364 → 397; handoff 5: 15.5). From Ben's last date to 'Debby': 28.5 pt (handoff 5: 10.5). The SVG clips the body at [0,348,393,332], and bodyContentBottom is 891. Only Ben's 'Unchanged' group shows below 'From Monday…'. The kept dates are stacked with no '·'. IMPLEMENTATION says the frame 'wraps preserved dates', but the lines measure 159.5 + 174.5 pt (Ben) and 170.5 + 155.5 pt (Debby). With ' · ' each pair fits within 353 pt, so the stacking isn't forced by width at default size.

### F-06 · note · app · adjusted

- **State:** H01-travelling (redraw); also H01-travelling-dateline
- **Rule:** The brief's redraw rule. IMPLEMENTATION accounts only for the past-day card ('H01-travelling (2.1 past card)').
- **Finding:** The redraw restyles the waiting card without saying so. Every change brings it closer to the book's own H01-waiting and H01-after-close cards: date at row size, a regular time line, content at x 40, a larger avatar. The exception is See captions, now at x 20 where 2.1 has x 28.
- **Evidence:** Handoff 5 → handoff 6 H01-travelling: content inset x 36 → 40. 'Saturday, November 7' ink height 24 → 16. 'Opens 12 PM · London' from bold 16 to regular 12.5. Countdown ink 24.5 → 21.5. 'See captions' x 28 → 20. In 2.1's H01-waiting and H01-after-close renders, the card is at x 20 with content at x 40, the date line is at row size, and See captions is at x 28.
- **What the app does, and who acts:** The app builds the waiting card from the book's H01-waiting and H01-after-close (p12, p29), with handoff6.waitingHero's tokens and dark pairings. The ios thread records the differences from handoff 5.
- **Second reviewer:** The measurements hold (handoff 5 → 6): content x 36 → 40; date ink 24 → 16; the time line 16 → 12.5 and no longer bold; countdown ink 24.5 → 21.5. But every change moves the card toward the book's own H01-waiting and H01-after-close renders. Those have the date at row size, a regular '7 AM · New York', content at x 40 inside a card at x 20, and a larger avatar. The book is the authority for H01-waiting, so the app has a clear reference meanwhile. The one exception is See captions, at x 20 where 2.1 has x 28. This is an unexplained change that the book settles, so it's a note.

### F-07 · note · app · adjusted

- **State:** H01-unavailable and H01-access-lost (redraws); the same layout on F01-unavailable and M01-access-lost
- **Rule:** The brief's redraw rule. IMPLEMENTATION accounts only for 'one chooser and neutral header'.
- **Finding:** Besides the requested header change, the denied title is set smaller and 21 pt lower, Choose a club moves up 6 pt, and Get help moves from centred to leading. None of this is explained, but all four denied frames in handoff 6 agree.
- **Evidence:** H01-unavailable 'Club unavailable': width 252.5 → 197 pt, ink top 144.5 → 165.5. Body ink top 199.5 → 225.5. Choose a club y 644 → 638. Get help x 167–226 → 20.5–80. H01-access-lost title width 330.5 → 258, ink top 144.5 → 165.5. F01-unavailable and M01-access-lost measure the same as the matching H01 frames.
- **What the app does, and who acts:** The app builds one denied layout for all three tabs from handoff 6's frames: wordmark header, the smaller title, a single Choose a club, and Get help leading. The ios thread records the differences from handoff 5.
- **Second reviewer:** The measurements hold. 'Club unavailable' is 252.5 → 197 pt wide, with ink top 144.5 → 165.5. Choose a club moves from y 644 to 638. Get help moves from x 167–226 to x 20.5–80. The access-lost title is 330.5 → 258 pt wide. No contract sets the denied title's size or Get help's alignment. All four handoff 6 denied frames (H01-unavailable, F01-unavailable, H01-access-lost, M01-access-lost) share the new layout, and it breaks no rule. The app can follow handoff 6, and nothing is left for a later brief to settle.

### F-08 · should · claude-design · confirmed

- **State:** F01-friends (redraw); also F01-friends-first-days
- **Rule:** handoff3.friendsScheduleFooter (zoneRole metadata; handoff 3: 'See schedule sits below the roster … with New York leading') and handoff3.navigationAndTargets.friendsFooter.scheduleTarget [245,725,128,44]. handoff6.replaces doesn't replace either, and handoff 5's replacement of navigationAndTargets kept 'prior destinations and unaffected geometry'.
- **Finding:** The redraw drops the 'New York' zone from the Friends footer and moves See schedule from trailing to leading, explained only as '(spacing)'. At home, Friends now shows no zone anywhere, though every row's VoiceOver label still names New York. The handoff 3 footer contract still stands.
- **Evidence:** Handoff 3 F01-friends drawnText: '… Next up | New York | See schedule'. Handoff 6 drawnText has no 'New York'; See schedule rect [20,713,353,44]. Handoff 3 IMPLEMENTATION: 'See schedule sits below the roster and above the native tab bar, with New York leading.' Row label: 'Maya. Tuesday, November 10, 2026 at 7 AM, New York.'
- **What the app does, and who acts:** The app keeps handoff 3's footer, with the zone leading and See schedule trailing, until Claude Design retires it in writing. The ios thread records the difference.
- **Second reviewer:** Verified. Handoff 3's F01-friends drawnText ends 'Next up | New York | See schedule', and handoff 3's IMPLEMENTATION says 'See schedule sits below the roster ... with New York leading'. handoff3.friendsScheduleFooter (zoneRole metadata) isn't in handoff6.replaces. Handoff 6's F01-friends and F01-friends-first-days have no 'New York', and See schedule's rect is [20,713,353,44], leading. The visible rows have no zone, but the row labels say 'New York'. IMPLEMENTATION accounts for the redraw only as 'F01-friends (spacing)'.

### F-09 · should · claude-design · confirmed

- **State:** All handoff 6 phone frames with photographs (F01-friends, F01-friends-first-days, F01-friends-travelling, H01-confirm-days, H01-travelling, H01-travelling-dateline, the denied headers, G06)
- **Rule:** handoff3.photoAvatarEdge ('1 pt outside the circular photo clip, separator, every photo avatar equally') and handoff3.supplementalTypeRoles.nextUp (13/18 bold). handoff6.replaces replaces neither.
- **Finding:** With no explanation, the redraws and new frames drop the 1-pt separator edge on photo avatars and set 'Next up' in regular weight. On Friends, the selected tab icon changes from filled to outlined, while Home's selected icon stays filled.
- **Evidence:** Avatar circles with stroke="#DCE2DA": 4 in handoff 3 F01-friends.svg; 1 in handoff 5 H01-confirm-days.svg and H01-travelling.svg; 0 in every handoff 6 phone SVG. handoff3.photoAvatarEdge: 'Every photo avatar equally'. handoff3.supplementalTypeRoles.nextUp: 13/18 bold; handoff6.friendsRow.nextUpRole: 'nextUp'. Friends tab icon in action ink: 595 px → 268 px; Home's selected icon: 1208 px.
- **What the app does, and who acts:** The app keeps the standing handoff 3 contracts (the photo edge, bold Next up) and the native filled selected tab symbol. The ios thread records the frames as differing.
- **Second reviewer:** Verified. Handoff 3's F01-friends.svg draws 4 photo-edge circles (r=18.5 and r=14.5, stroke #DCE2DA), and handoff 5's H01-confirm-days and H01-travelling draw 1 each. No handoff 6 phone SVG has one: H01-travelling's single #DCE2DA stroke is the past-day card's outline. A side-by-side crop shows 'Next up' bold in handoff 3 and regular in handoff 6. handoff6.friendsRow.nextUpRole still names 'nextUp', which handoff 3 sets at 13/18 bold. The Friends tab icon in action ink drops from 595 to 268 px (outlined). Home's selected icon is 1208 px (filled) in handoff 6.

### F-10 · note · founder · adjusted

- **State:** G05-local-times (redraw)
- **Rule:** Handoff 5's brief item 5 named the occurrences: 'Nina’s Saturday 7 November, Ben’s Monday 9, … and Debby’s Friday 13 November'. Spec 08: during the open day, the contextual Add targets 'that star's next collecting date'. Spec 09: Friends shows each member's next collecting occurrence.
- **Finding:** The redraw moves the sheet to Debby's open day and, as its written answer says, lists one occurrence per member. So Debby's next collecting occurrence, Friday 13 November, is not on the sheet, though Friends' Debby row and Home's contextual Add target show it during that day (spec 08, 09). No source settles whether it belongs there. The title also moves from beside Done to a large title under it, with no explanation.
- **Evidence:** Handoff 6 manifest allOccurrences: Debby 2026-11-06 (openNow true), Nina, Ben, Maya, Alex, Sam; no Debby 2026-11-13. Handoff 5 listed Nina to Debby 13. handoff6.localTimesSheet.openFirst: 'One current/next occurrence per member; no second future occurrence for the already-open member.' Status bar 9:41 → 2:41. Done rect [317,77,64,44] → [295,71,86,44]; title ink y 92.5 → 124.5.
- **What the app does, and who acts:** The app follows the delivery's openFirst rule: the open occurrence first, with Open now and its closing time, then one next occurrence for each other member. The question of whether the open star's next collecting occurrence is also listed goes in docs/QUESTIONS.md, with the delivery's reading as the default. The ios thread records the title arrangement.
- **Second reviewer:** The facts hold. The redraw moves the sheet to Debby's open day (status bar 2:41 PM London = 9:41 AM New York on Friday, November 6) and lists Debby 6 (openNow), then Nina, Ben, Maya, Alex and Sam. Debby's Friday 13 November is gone. But this is the delivery's explicit written answer to the brief's question ('one current/next occurrence per member, not a second future entry for the already-open member'; localTimesSheet.openFirst). No source or Default requires the open star's next collecting occurrence on this sheet. The traveller still sees that occurrence's local time on F02 and in the travelling Add hint. The app listing it anyway would be the app designing against the delivery. It's a product choice for the founder. Also, the reviewer's line 'matches handoff 5's brief' is wrong: that brief's list (Nina 7 to Debby 13) describes a moment after Debby's Friday closed, not the open day.

### F-11 · should · app · confirmed

- **State:** H01-confirm-days (frame 1)
- **Rule:** Brief item 1 and the redraw rule: 'What changes: the body line … A redraw keeps everything else in the earlier frame as it was' (plus the drafts row, if kept). handoff6.spacing keeps homeContentTopAfterHeader 32 and homeTitleToBody 24.
- **Finding:** Besides the body line and the Private drafts row, the redraw moves the title up, widens the gap between title and body, and drops the header avatar's 1-pt edge. IMPLEMENTATION says only that the frame 'retains the H5 root header, tabs and primary action'.
- **Evidence:** Title 'The club’s days' ink top 144.5 → 127.5 (17 pt higher). Body ink top 199.5 → 197.5, so the gap from title to body grows from 24.5 to 39.5 pt. The header avatar's r=14.5 #DCE2DA edge is gone. handoff6.spacing: homeContentTopAfterHeader 32, homeTitleToBody 24.
- **What the app does, and who acts:** The app builds frame 1 with the retained spacing values (32 after the header, 24 from title to body), the photo edge, and handoff 6's body line and drafts row. The ios thread records the differences.
- **Second reviewer:** Verified. Title ink top 144.5 → 127.5. Body ink top 199.5 → 197.5, so the gap from title ink to body ink grows from 24.5 to 39.5 pt. The r=14.5 #DCE2DA avatar edge in handoff 5's SVG is absent in handoff 6. handoff6.spacing still holds homeContentTopAfterHeader 32 and homeTitleToBody 24. IMPLEMENTATION: 'H01-confirm-days retains the H5 root header, tabs and primary action'.

### F-12 · note · app · confirmed

- **State:** G05-schedule-review and G05-schedule (redraws)
- **Rule:** The brief's redraw rule. IMPLEMENTATION accounts for 'context arrangement and spacing' only.
- **Finding:** View local times moves from centred to leading, with no explanation. No contract sets its alignment. G05-schedule's rows also change from handoff 3's full-width form, with the owner trailing, to the two-column weekRows form. That change follows from handoff 5's replacement of G05WeekView.
- **Evidence:** View local times ink x 139–253 (handoff 3 G05-schedule and handoff 5 G05-schedule-review) → x 20–134 (handoff 6). Handoff 3 rows: owner trailing, pitch ≈57 pt. Handoff 6: owner at x≈164, pitch 48 pt.
- **What the app does, and who acts:** The app follows handoff 6's arrangement, and the ios thread notes the alignment change in the inventory.
- **Second reviewer:** Verified in the redraw comparison sheet. View local times is centred in handoff 3's G05-schedule and handoff 5's G05-schedule-review, and leading in both handoff 6 redraws. No contract sets its alignment. Handoff 3's G05-schedule rows have the owner trailing. Handoff 6 uses the two-column weekRows form that handoff 5's replacement of G05WeekView introduced.

### F-13 · note · none · confirmed

- **State:** F01-friends-travelling
- **Rule:** Brief item 11 fixture: 'Nina’s Saturday 7 (Next up)'.
- **Finding:** With the 108-pt travelling rows, the drawn viewport ends partway through Sam's row. Debby's row and Nina's 'Next up' row are off-screen, so the frame never shows the Next up label in a travelling row. The data is in screen-copy, and the delivery says the cut is intentional.
- **Evidence:** listViewport [0,310,393,403] (ends at y 713); Nina rect [20,850,353,108]; listContentBottom 958. Nina's label: 'Nina. Next up. Sunday, November 8, 2026 at 1 AM, Auckland; Saturday, November 7, 2026 at 7 AM, New York.'
- **What the app does, and who acts:** The app builds Nina's travelling row from the contract: Next up on the name line and two dated lines. Its snapshot test scrolls to show it.
- **Second reviewer:** Verified. listViewport [0,310,393,403] ends at y 713. Nina's rect is [20,850,353,108]; listContentBottom is 958. The validation report's intentionalViewports says 'Friends travelling and local-time sheets show first viewport; full dated groups remain in JSON'.

### F-14 · note · app · confirmed

- **State:** G05-club-details-paused
- **Rule:** Brief item 15: 'as 2.1’s G05-club-details, with your row' (2.1: 'Drafts / Only you can see them' as an ordinary row).
- **Finding:** 2.1's Drafts row becomes the filled Private drafts card ('Private drafts / Only you can see these.'). IMPLEMENTATION explains the change, and it matches the account-wide drafts of book p46.
- **Evidence:** drawnText '… Widget | Preview and setup | Private drafts | Only you can see these. | Leave club'; Private drafts rect [20,546,353,76]. 2.1 G05-club-details: 'Drafts / Only you can see them'.
- **What the app does, and who acts:** The app builds the unified Private drafts row on Club details, and the ios thread notes the difference from 2.1 in INVENTORY.md.
- **Second reviewer:** Verified. 2.1's G05-club-details has 'Drafts / Only you can see them' as an ordinary row. Handoff 6 draws the filled 'Private drafts / Only you can see these.' card at [20,546,353,76]. IMPLEMENTATION: 'Keep the unified Private drafts row ... including on Club details.' This agrees with the account-wide drafts on book p46.

### F-15 · note · none · confirmed

- **State:** G04-conflict (redraw); G04-conflict-three
- **Rule:** The brief's redraw rule.
- **Finding:** The new 4-pt gaps and row heights make the list longer than the body viewport. On the redrawn G04-conflict, Sunday's 'No reveal scheduled' line falls out of view, where handoff 5 showed the whole week.
- **Evidence:** G04-conflict bodyViewport [0,280,393,464] (ends at 744), bodyContentBottom 768. G04-conflict-three bodyContentBottom 752.
- **What the app does, and who acts:** The list scrolls under the pinned Confirm button, as the contract says. No change is needed, and the ios thread records it.
- **Second reviewer:** Verified. The G04-conflict SVG clips the body at [0,280,393,464], ending at 744; bodyContentBottom is 768. The frame shows Sunday's 'Revisit' but not 'No reveal scheduled'. Handoff 5's G04-conflict showed the whole Sunday row. The validation report lists 'G04 lists can scroll beneath pinned confirmation' as intentional.


**Found by the second reviewer**

### FM-01 · should · claude-design · found in review

- **State:** H01-travelling-dateline
- **Finding:** When the local date differs from the club's, the waiting card drops its date heading (home.date, 'Saturday, November 7'), and nothing in writing says so. The countdown stays where it was, leaving an empty band in the card. The build has no rule for when the heading shows.
- **Evidence:** H01-travelling drawnText: 'Saturday, November 7' | 'Opens 12 PM · London' | '7 AM · New York'. H01-travelling-dateline: 'Opens Sunday, November 8 · 1 AM · Auckland' | 'Saturday, November 7 · 7 AM · New York', with no heading. Ink: dateline lines at y 297.5–310 and 323.5–336, then the countdown at 391.5, a 55.5-pt gap. In H01-travelling the gap from the last line (359.5) to the countdown (391.5) is 32 pt. Add for Nina is at [20,463,353,50] in both, so the card height didn't change. IMPLEMENTATION says only 'Both time lines carry their own date.' Neither waitingHero nor travellingRows mentions the heading.
- **What the app does, and who acts:** When the local and club dates differ, the app omits the heading as drawn, since both time lines carry their own dates (T41). It closes the band with the card's normal spacing. The ios thread records the rule as inferred, and the next brief asks Claude Design to confirm it.

### FM-02 · should · app · found in review

- **State:** G04 pickers (all), G04-change, F01-friends and its variants
- **Finding:** The frames clip the scrolling area below the header, so the title, context, hours, instruction and help (on Friends: the title, subtitle and Private drafts) are drawn as fixed above a scrolling list. On G04-change that leaves 332 pt for the content. At the largest text size, a fixed header that size would leave little or no room for the rows. No contract says whether the header scrolls; they pin only the native controls.
- **Evidence:** SVG clipPaths: G04-conflict, G04-conflict-three and G04-one-day 'body' at [0,280,393,464]; G04-change 'changebody' at [0,348,393,332]; F01-friends and F01-friends-travelling 'friendslist' at [0,310,393,403]. Scroll indicators start at y 286, 354 and 320. handoff6.replacementScopes.spacing: 'G04 body and local-time/Friends lists scroll under native pinned controls.' Book p26: 'Rows grow and dates wrap.'
- **What the app does, and who acts:** The app puts each screen's header in the same scroll view as its rows. Only the navigation bar, the Confirm button and the tab bar stay pinned. The largest-text snapshots must show at least one row under the header. The ios thread records the frames' fixed header as schematic.


## Written asks: questions, rules, return

**Summary.** Handoff 6 answers every written ask in the brief. That covers the six rules over handoff 5, all 16 items, every bullet under "Questions I need answered" and the Return paragraph. Each answer is in IMPLEMENTATION.md and the PDF, with templates under handoff6 in copy-contracts.json and component-contracts.json. Every named legacy key is now in handoff6.replaces, with handoff 6's map taking precedence. All 143 replaced keys and their targets exist, and Maya's Wednesday and Saturday now map to change.proposedRow.new.vo. The component scopes keep noLock, largest-text stacking and nextDates, nextUp and contentSignals as false. In all 27 frames, every control's VoiceOver label begins with its visible words, and no drawn target is under 44 pt. The handoff6 copy strings have no straight apostrophes and no fixture values outside the example keys. No finding is a must. Six findings are should. (1) The replacement map is still incomplete: 57 earlier keys whose exact text a handoff 5 or 6 key now holds are named in neither map. These include currentThrough, the local-times sheet keys, help.vo, F01.schedule.vo and the handoff 4 member footers. (2) The map points two old keys at templates no frame draws: hoursZone and calendar.assigned. (3) handoff6.friendsRow still names the retired handoff3.F01.row.vo.* fixture labels. (4) The kept dates are given three ways: the example has no year and a middle dot, the frame stacks dated lines, and the component says "two dates". (5) The switcher's "5 people" has no template. (6) Nothing says what Club details opens when the selected club is suspended. There are five notes: the year rule is worded two ways; seven component replacements have no stated scope; Sam's view shows the contested explanation; "Ben and Debby · You" can be misread; and two of G06's tap areas overlap by 9 pt.


**What was answered, ask by ask**

- **Rule 1: Home label Next up.** handoff6.home.upNext = 'Next up' replaces handoff5.home.upNext. It is drawn on H01-travelling-dateline and the H01-travelling redraw.
- **Rule 2: drop calendar.peopleZone; club line is calendar.clubZone.** handoff6.replaces maps handoff5.calendar.peopleZone to handoff5.calendar.clubZone. Nameless fixtures use the new calendar.context.zoneOnly '{clubZoneName}' ('New York' on G04-two-days, G04-two-days-one-chosen, G04-confirmed-many and G04-change).
- **Rule 3: countdown VoiceOver announces its target date.** handoff6.home.countdown.vo = 'Opens {fullDateTime}, {clubZoneName}.', plus a travelling form naming both zones. It replaces handoff5's '{durationSpoken} until opening.'.
- **Rule 4: 'your {weekday}' inside a sentence, the templates that take it, selfName.occasions replaced.** occasion.self.inSentence = 'your {weekday}'. home.revisit, home.addFor.hint, home.addFor.travelling.hint, home.captions.hint and friends.row.hint take {occasionInSentence}, and each replaces its handoff5 key. Component handoff5.selfName.occasions is replaced by handoff6.selfName.occasions. Example: 'Revisit your Monday'.
- **Rule 5: switcher.row.selected.vo says Selected once.** handoff6.switcher.row.selected.vo = '{clubName}. {stateLabel}.'. The frame label is 'Sunday people. Unavailable.' with the native selected trait.
- **Rule 6: zone not named twice in the View local times hint.** New schedule.localAction.sameZone.hint 'Show dated opening and closing times in {clubZoneName}.'. The two-zone hint now uses {zoneList}. G05 frames read '... in New York.'.
- **Item 1: true body line, Private drafts row, FQ79.** The body is 'Your club’s next scheduled day will appear here.': no names, counts or dates. The Private drafts row is kept and drawn on frame 1. FQ79 is written as the first 7 AM club instant at least 24 elapsed hours after confirmed_at, with equality qualifying.
- **Item 2: explanation template and chooser line.** calendar.contested.explanation = 'The proposed days overlap on {weekday}.', which stays true for a holder who never chose. The chooser line is calendar.contested.people '{chooserNameList}', with native ListFormatter and roster order. It reads 'Ben · You, Alex and Debby', not 'You, Debby and Alex'.
- **Item 3: contested row seen by a non-chooser.** Form: canvas with an inputBorder outline, 'Contested' over 'No reveal scheduled', an empty selector, and no names or count. Label '{weekday}. Contested. No reveal scheduled. Can be chosen.'. Hint 'Choose {weekday}. You’ll then see the people in this contested choice.'.
- **Item 4: refusal words.** calendar.contested.refused = 'Couldn’t confirm {weekday}. This day is contested. Your choice is kept.', drawn in secondary ink with no red. Friday shows 'Ben and Debby · You'. Confirm Friday is disabled with the hint 'This day is contested. Confirmation is not possible yet.'.
- **Item 5: Confirm before two days are chosen.** The visible words and label are both 'Confirm two days', with the hint 'Choose two days before confirming.' and the button disabled. Thursday reads Available / Proposed for you. Book p222 makes two days the rule for pairs and three-person clubs.
- **Item 6: where Back leads; own confirmed row.** Back and Done pop to the saved safe origin (Home or Schedule) and never reopen the editable picker. The ownConfirmed row is surface fill, Name · You, a check and 'Confirmed', with no selector. Its label is '{weekday}. {personSpeech}. Confirmed.'.
- **Item 7: Choose your day row and the unconfirmed-day row form.** A viewer-only Choose your day row sits above the read-only week. weekRows.unconfirmed is 'No reveal scheduled' with no owner, the same shape as an unused weekday.
- **Item 8: dateless Friends rows.** Avatar and name only, 52 pt minimum. Label '{personSpeech}.'. The hint is '' (accessibilityHint omitted). Tapping does nothing, because there is no F02 occurrence; Ben reaches Ben's own choice through See schedule.
- **Item 9: same-zone sheet title, block label, hint; open-day order.** The title stays 'Times in your time zone'. The block is 'Club and your time · {clubZoneName}' and the hint names one zone. During an open day the open occurrence comes first, with its closing time and 'Open now' (G05-local-times redrawn).
- **Item 10: dated templates, plaque, countdown VoiceOver, card group, travelling Add hint, long countdown.** home.localOpening.dated and home.clubOpening.dated carry dates. The plaque stays the club date (SAT 07) with no second plaque, for a stated reason. The card is one group via home.waiting(.travelling).group.vo, with the countdown decorative and no tick announcements. Add hint: 'Add to {occasionInSentence}, opening {localFullDateTime} in {deviceZoneName}; {clubFullDateTime} in {clubZoneName}.'. A wait of a day or more shows '1d 5h 59m'.
- **Item 11: friends.date.club with a date.** friends.date.club.dated = '{clubFullDate} · {clubOpenTime} · {clubZoneName}', used whenever the local date differs.
- **Item 12: F01-unavailable; M01-unavailable takes the same form.** Drawn with the neutral denied header and one Choose a club. IMPLEMENTATION states that M01-unavailable uses the same suspended form.
- **Item 13: M01-access-lost; F01-access-lost takes the same form.** Drawn with no past day, photograph or search. IMPLEMENTATION states that F01-access-lost uses the same access-lost form.
- **Item 14: switcher with a suspended club.** 'Unavailable' is plain secondary text with no count, lock or date. The selected label has no 'Selected'. Kitchen table reads '5 people · Next: Maya' as in 2.1, and opening it is explicit.
- **Item 15: paused Club details.** '1 member' counts active members only. The zone is left out for the fixture while details.footer keeps {clubZoneName}. Invite someone sits between Members and Schedule with the handoff 5 hint.
- **Item 16: dark pairings and component samples.** The plaque is canvas with primaryText and the avatar is avatarCanvas with onAvatarCanvas (dark #F7F8F2 on #35463A, about 9.4:1). Light and dark samples cover the waiting card, the time lines, the denied header, the status rows, the review rows, the local-time blocks, every day-choice row and SundayRow. brand-tokens 1.1 is unchanged.
- **Q: Ben's left Monday wording.** 'Proposed for you', both drawn and spoken (calendar.row.earlierSelf.vo '{weekday}. Available. Proposed for you.').
- **Q: G04-one-day instruction without 'Available'.** 'Choose a day that works for you, then confirm.'
- **Q: spoken word for another member's confirmed day.** 'Taken' ('{weekday}. {personSpeech}. Confirmed. Taken.'). Unavailable is kept for access removed.
- **Q: hint for an already-chosen row.** Two-day picker: 'Remove {weekday} from your choices.'. One-day picker: 'Your current choice. Choose another day to change it.'. Contested row: 'Your current choice is contested. Choose another day to change it.'.
- **Q: G04-change Not now hint, placement, Back vs Not now, SundayRow edge, divider.** Hint 'Leave this proposal without confirming it.'. Not now is in the nav bar on every G04 screen. Back goes to the previous screen, while Not now leaves the flow without confirming. Sunday's x is 20, stated in writing (it is below the frame's viewport). The divider is restored in separator ink with 12 pt gaps.
- **Q: G05 review row after the viewer confirms.** Same row and start date, adding 'Your confirmation is saved.' (change.review.confirmed), with nothing about others. It opens the revision read-only.
- **Q: shape questions.** Filled rows have a 4 pt canvas gap and keep their own 12 pt corners. A one-line row is 48 pt, vertically centred. Own choice is cover2/onCover2, a confirmed day is surface/primaryText. A proposed day and a proposed member share the Proposed tag. Everywhere, club and zone come first, then the hours. The denied header's club picker is removed (wordmark, as in the no-club header), so one Choose a club remains.
- **Q: past-day card.** 2.1's outlined card with a check is kept on every Home, and H01-travelling is redrawn with it. No replacement is proposed.
- **Q: spacing on book p35's scale.** Day choice: title to context 12, context to hours 4, hours to instruction 12, instruction to help 4, help to first row 16. G05: title to context 12, context to hours 4, hours to review/Choose row 24. F01: title to subtitle 8. All values are on p35's scale.
- **Q: H01-paused plainer hint.** 'Show past days you can view in {clubName}.' (a11y.viewMemories.hint).
- **Return: handoff6.replaces completes handoff 5's list with the named keys.** Mapped: G04.conflict.confirm.vo, friday.hint, assigned, G04.change.before, H01.unavailable.choose.vo, H01.paused.details.vo, all H01.suspended.*, all H01.accessLost.*, all G05.proposed.*, switcher.awaiting and switcher.paused (with their .vo keys). Wednesday and Saturday go to change.proposedRow.new.vo. Every key and target exists, and precedence is stated. The map is incomplete otherwise: see W-01.
- **Return: component replacement scopes.** dayChoiceRow keeps noLock = true and largest-text full-width stacking. weekRows keeps read-only, weekday order and nextDates, nextUp and contentSignals as false. Scopes are missing for seven other replacements: see W-08.
- **Return: year rule, kept-date templates, publicContested two lines, week labels, brand tokens.** The year rule is given (see W-07 for its two wordings). Kept-date templates take any count: change.keptDates '{dateList}' and preservedRow.vo with {spokenDateList} (see W-04). publicContested is 'Contested\nNo reveal scheduled', with a two-key list in weekRows. The G04 summary and G05 both use '{weekday}. {personSpeech}. Confirmed.'. brand-tokens 1.1 is unchanged.
- **Return: VoiceOver names begin with visible words; 44 pt targets.** Checked for every control in all 27 frames in screen-copy.json: every label starts with its visible words and every target is at least 44 pt. One 9 pt overlap is in W-11.


**Findings**

### W-01 · should · app · adjusted

- **State:** copy-contracts.json handoff6.replaces and provenance
- **Rule:** Brief Return: 'Under handoff6.replaces, complete handoff 5's replacement list … name every earlier key a handoff 5 or handoff 6 key takes over'. Delivery: IMPLEMENTATION.md 'The copy replacement map includes each earlier key actually taken over'.
- **Finding:** Every key the brief named is mapped, but the map is still incomplete. Several earlier keys that handoff 5 or 6 templates take over are in neither map, some with fixture values. Several handoff 6 keys that re-key earlier text are marked 'new'.
- **Evidence:** In neither replaces map: handoff3.G04.change.currentThrough 'Current days through {fullLastDate}' (handoff6.change.before has this text, but its provenance names only handoff5.change.before and handoff3.G04.change.before). handoff3.G05.schedule.localSheet.title, .club, .local, .clubValue and .localValue, taken over by handoff5.local.*. handoff3.H01.unavailable.help.vo 'Get help with club access.', where the frames use the hint 'Contact Tadayo support.'. handoff3.F01.schedule.vo 'See schedule for Sunday people.', where the frames use the hint 'Open the club’s week.' (handoff6.friends.schedule.hint, kind 'new'). handoff4.members.footer.one, .other and .kitchenTable, where handoff6.details.footer and details.memberCount.* are kind 'new'. handoff4.pending.review.*, with the same text as the mapped handoff3.G05.proposed.*. handoff3.G04.change.saved.title has the same text as handoff6.change.review.confirmed (kind 'new'). In all, 57 earlier keys (handoff 3, handoff 4, linkEntry) and 12 handoff 5 keys have exact text that a later key holds but appear in neither map. The 12 include calendar.confirmed.title.many, which handoff6.calendar.confirmed.own.title (kind 'new') repeats. Most are shared words such as Back, Done and Account.
- **What the app does, and who acts:** Meanwhile the app treats these earlier keys as superseded by the keys the frames use: handoff5.local.*, home.help.hint, friends.schedule.hint, details.footer with details.memberCount.*, change.before, change.review.confirmed and calendar.confirmed.title.many. The ios thread lists the mapping in INVENTORY.md. No strings change.
- **Second reviewer:** True. None of the named keys is in handoff5.replaces or handoff6.replaces, and the kinds and provenance are as quoted. The count needs care: 57 is the number of handoff 3, handoff 4 and earlier keys whose exact text a handoff 5 or 6 key holds. A further 12 handoff 5 keys have text that a handoff 6 key now holds, and calendar.confirmed.title.many, which the finding lists, is one of those 12, not one of the 57.

### W-02 · should · app · confirmed

- **State:** handoff6.replaces; G04 pickers, G04-change, G05
- **Rule:** Brief question: 'the club's hours and zone in one arrangement'. Delivery's answer: 'Club/zone metadata then hours metadata use the same arrangement as G04 pickers and G05'; component choiceRules.sameZoneContext 'Club name and zone metadata, then hours metadata'.
- **Finding:** handoff6.replaces still sends two earlier keys to templates that no handoff 5 or 6 frame draws: the one-line zone-and-hours form, and a one-line 'name · Confirmed'. Read literally, they would bring back arrangements the delivery has just retired.
- **Evidence:** 'handoff3.G05.schedule.revealHoursZone' maps to handoff5.calendar.hoursZone '{clubZoneName} · {hoursText}'. G04-change draws 'New York' then '7 AM to 1 AM the next morning'. G05-schedule draws 'Sunday people · New York' then the hours. choiceRules.sameZoneContext says 'Club name and zone metadata, then hours metadata'. 'handoff3.G04.conflict.assigned' maps to handoff6.calendar.assigned '{personName} · Confirmed', but every G04 frame draws the name and then 'Confirmed' on its own line (handoff5.calendar.state.confirmed). '· Confirmed' occurs 0 times in screen-copy.json.
- **What the app does, and who acts:** Meanwhile the app renders calendar.clubZone (or calendar.context.zoneOnly for a nameless fixture) above calendar.hours on G04, G04-change and G05. A confirmed row is the name over calendar.state.confirmed. The app treats hoursZone and calendar.assigned as unused and records this in INVENTORY.md.
- **Second reviewer:** Verified. handoff6.replaces maps handoff3.G05.schedule.revealHoursZone to handoff5.calendar.hoursZone '{clubZoneName} · {hoursText}'. Every handoff 6 G04 and G05 frame draws the zone line and the hours line separately, and 'New York · 7 AM' occurs 0 times in screen-copy.json. handoff6.calendar.assigned '{personName} · Confirmed' is a key this delivery created, and no frame draws it: confirmed rows draw the name, then 'Confirmed' on its own line (G04-two-days-one-chosen: 'Debby', 'Confirmed').

### W-03 · should · app · confirmed

- **State:** component-contracts.json handoff6.friendsRow; F01
- **Rule:** Brief Return: write reusable strings as templates, with fixture values only in screen-copy.json or example keys. The delivery's own copy map retires handoff3.F01.row.vo.*.
- **Finding:** The current friendsRow contract still names handoff 3's per-person fixture labels as its VoiceOver labels, though the same delivery's copy map has replaced them.
- **Evidence:** handoff6.friendsRow.allRowVoiceOverLabels = 'handoff3.F01.row.vo.*'. handoff3.F01.row.vo.Ben = 'Ben, you. Monday, November 9, 2026, at 7 AM, New York. Open Ben’s upcoming day.'. handoff6.replaces maps 'handoff3.F01.row.vo.Ben' to 'handoff5.friends.row.vo'. F01-friends speaks 'Ben, you. Monday, November 9, 2026 at 7 AM, New York.' with the hint 'Open your Monday.'.
- **What the app does, and who acts:** Meanwhile the app ignores allRowVoiceOverLabels. Labels come from handoff5.friends.row.vo, friends.row.travelling.vo and handoff6.friends.row.noDate.vo, and hints from handoff6.friends.row.hint. This is recorded in INVENTORY.md.
- **Second reviewer:** Verified. handoff6.friendsRow.allRowVoiceOverLabels is 'handoff3.F01.row.vo.*', copied unchanged from handoff3.friendsRow. The same delivery maps every handoff3.F01.row.vo.<name> to handoff5.friends.row.vo, and the frames speak the new template without 'Open Ben’s upcoming day.'.

### W-04 · should · claude-design · confirmed

- **State:** G04-change; handoff6.change.keptDates, examples.keptDates, component changeRows.kept
- **Rule:** Brief Return: 'kept-date templates, shown and spoken, for any number of dates' and 'Give the rule for when a date carries its year'. Delivery: 'Proposed starts, preservation boundaries and kept announced dates always carry the year'; 'join a visible list with middle dots'.
- **Finding:** The visible list of kept dates is described three ways that disagree on the year, the separator and the count.
- **Evidence:** examples.keptDates.value = 'Monday, November 9 · Thursday, November 12' (no year). IMPLEMENTATION.md: 'Format every full date separately, then join a visible list with middle dots'. G04-change draws 'Monday, November 9, 2026' and 'Thursday, November 12, 2026' on two lines, with no '·'. component changeRows.kept: 'Two person groups, each contains the two exact preserved dates', against replacementScopes.changeRows 'arbitrary-count kept-date formatting'.
- **What the app does, and who acts:** Meanwhile the app follows the year rule and the frame. Each kept date goes on its own line with its year, inside the person group, for any count. It is spoken with handoff6.change.preservedRow.vo and a native list formatter. A later brief asks for one visible form and a corrected example.
- **Second reviewer:** Verified. examples.keptDates.value has no year. IMPLEMENTATION.md says to join a visible list with middle dots. The G04-change SVG draws the dates on separate lines (baselines 431 and 449) with no '·'. changeRows.kept says 'each contains the two exact preserved dates', while changeRows.keptDates and replacementScopes.changeRows say any count.

### W-05 · should · claude-design · confirmed

- **State:** G06-switcher-unavailable; handoff6.switcher.active.row
- **Rule:** Brief Return: 'Write every reusable string as a template'. Item 14: Kitchen table's 'row is as 2.1's G06-switcher draws it' (2.1 draws '5 people · Next: Maya').
- **Finding:** The switcher row template takes {memberCountText}, but the only count templates produce 'member(s)'. Applied as delivered, the row would read '5 members · Next: Maya', not the drawn '5 people'.
- **Evidence:** handoff6.switcher.active.row = '{memberCountText} · Next: {personName}'. handoff6.details.memberCount.one = '{memberCount} member', .other = '{memberCount} members'. G06-switcher-unavailable draws '5 people · Next: Maya', with the label 'Kitchen table. 5 people. Next: Maya.'. switcherStatus.activeRows: 'Book fixture: Kitchen table, 5 people · Next: Maya.'
- **What the app does, and who acts:** Meanwhile the app shows the switcher count as 2.1's G06-switcher render does ('5 people'), and Club details as 'N member(s)'. INVENTORY.md notes that the switcher count comes from the 2.1 render. A later brief asks for the template.
- **Second reviewer:** Verified. The only templates that produce a member count are handoff6.details.memberCount.one and .other ('member'/'members'). No contract string forms '{n} people'. The frame and 2.1's G06-switcher render draw '5 people · Next: Maya'.

### W-06 · should · claude-design · confirmed

- **State:** G06-switcher-unavailable
- **Rule:** Brief item 12 (the denial item 14 opens from): 'nothing of the club from the server or the phone's cache (T9, T24)'. T9: one read predicate for every route.
- **Finding:** With the suspended Sunday people selected, the sheet keeps Club details enabled. Nothing in handoff 5 or 6 says what Club details opens for a club the viewer can't open.
- **Evidence:** G06-switcher-unavailable: 'Sunday people' has the label 'Sunday people. Unavailable.' and traits ['selected']. 'Club details' has enabled true and route 'native sheet action'. In handoff 5's G06-switcher-status, the selected club was 'Sunday people. Not started.'. Brief item 12 says 'nothing of the club from the server or the phone's cache (T9, T24)'.
- **What the app does, and who acts:** Meanwhile the app sends Club details through the read predicate. For a suspended or lost club it shows the same neutral denial as Home, with nothing of the club. A later brief asks whether the action is shown, hidden or disabled in this state.
- **Second reviewer:** Verified. In G06-switcher-unavailable, the selected row is the suspended Sunday people, and Club details is enabled with route 'native sheet action' and no hint. Handoff 5's line 'Club details, Create a club and Cancel remain the ordinary sheet actions.' was written for a frame whose selected club was Not started, so the club was still authorized. Neither handoff 6's IMPLEMENTATION.md nor its contracts give Club details any behaviour for a denied club.

### W-07 · note · app · adjusted

- **State:** Year rule; all dated frames
- **Rule:** Brief Return: 'Give the rule for when a date carries its year'.
- **Finding:** The year rule is worded two ways. IMPLEMENTATION.md's wording, read literally, covers neither the local-times sheet nor the Friends and Add spoken labels. The component's wording covers the spoken labels and the two-zone sheet, but covers the same-zone sheet only through 'no clear year context'. The frames put the year in all of them.
- **Evidence:** IMPLEMENTATION.md: 'always in spoken exact countdown targets. Other live Home/Friends dates include it if outside the contextual current year, crossing a year, or the context does not establish a year.' travellingRows.targetYear: '… exact VO targets always include year. Snapshot current-year live Home/Friends omit year; comparison explicitly includes it.' Frames: 'Maya. Tuesday, November 10, 2026 at 7 AM, New York.'; the Add hints carry 2026; G05-local-times-same-zone shows 'Opens Saturday, November 7, 2026 · 7 AM'. Visible current-year Home and Friends dates have no year.
- **What the app does, and who acts:** Meanwhile the app follows the frames. The year goes in every spoken full date and in both local-times sheets, and always in proposed starts, boundaries and kept dates. Current-year visible Home and Friends dates leave it out. This is recorded in INVENTORY.md.
- **Second reviewer:** True that the rule is worded two ways, and that IMPLEMENTATION.md's wording covers only Home and Friends dates and countdown targets. But the component's wording does not fully cover the local-times sheet either. 'Exact VO targets always include year' covers the spoken Friends and Add labels, and 'comparison explicitly includes it' covers the two-zone sheet. The same-zone sheet's year rests only on 'no clear year context'.

### W-08 · note · app · confirmed

- **State:** component-contracts.json handoff6.replaces and replacementScopes
- **Rule:** Brief Return: 'State the scope of each component replacement'.
- **Finding:** Seven of the 16 component replacements have no stated scope. Almost nothing is lost, but handoff 3's G04-change largest-text rule has no full successor.
- **Evidence:** replacementScopes keys: dayChoiceRow, weekRows, changeRows, deniedHeader, friendsRow, spacing. Unscoped: choiceRules, firstDays, waitingHero, localTimesSheet, travellingRows, switcherStatus, selfName.occasions. The only field dropped from those 7 is waitingHero.allTextToken 'onAccent', which plaqueInk 'primaryText' and otherText 'onAccent' replace. Also dropped: handoff3.G04ChangeLayout.largestText 'Stack the proposed start date … No columns, no font shrinking. Confirmation footer grows and body scrolls.'
- **What the app does, and who acts:** Meanwhile the app treats the unscoped entries as whole replacements. It keeps handoff 3's G04-change largest-text rule (no columns, no shrinking, footer grows, body scrolls) because nothing replaces it.
- **Second reviewer:** Verified. replacementScopes names dayChoiceRow, weekRows, changeRows, deniedHeader, friendsRow and spacing, which cover 9 of the 16 entries. The 7 unscoped entries are choiceRules, firstDays, waitingHero, deniedHeader-free localTimesSheet, travellingRows, switcherStatus and selfName.occasions. A field-by-field diff of those 7 finds only waitingHero.allTextToken missing. handoff3.G04ChangeLayout.largestText, beforeAtAX5 and afterAtAX5 are absent from handoff6.changeRows. Only changeRows.kept's AX5 stacking and the spacing scope's scrolling partly cover them.

### W-09 · note · claude-design · confirmed

- **State:** G04-contested-other
- **Rule:** Brief item 3: Sam 'hasn't confirmed and didn't choose Friday'; Sam's own Thursday shows as Sam's choice.
- **Finding:** Sam, who doesn't hold the contested day, gets the choosers' explanation and help lines. No rule says which instruction a viewer outside the contested day sees. The lines are true and name nobody, but they read as if Sam's choice were in the overlap.
- **Evidence:** G04-contested-other drawn text: 'The proposed days overlap on Friday.', 'You can choose another day, or keep your choice.' (handoff5.calendar.contested.help). Thursday: 'Thursday. Sam, you. Your choice.' G04-one-day uses calendar.one.body 'Choose a day that works for you, then confirm.'.
- **What the app does, and who acts:** Meanwhile the app builds frame 3 as drawn. A later brief asks whether a non-chooser gets the plain instruction instead.
- **Second reviewer:** Verified. G04-contested-other draws 'The proposed days overlap on Friday.' and 'You can choose another day, or keep your choice.', the same lines the choosers see in G04-conflict-three. Sam's Thursday is an uncontested own choice. Neither IMPLEMENTATION.md nor choiceRules gives a non-chooser's instruction, and Sam's screen has no 'then confirm' line.

### W-10 · note · claude-design · confirmed

- **State:** G04-confirm-refused
- **Rule:** Brief item 2: give the visible chooser line a template and say how it reads.
- **Finding:** With roster order and 'Name · You', the line reads 'Ben and Debby · You' in Debby's view. On screen, '· You' can be read as applying to both names. The spoken form is clear.
- **Evidence:** Drawn text 'Ben and Debby · You' (calendar.contested.people '{chooserNameList}', roster order, '{personName} · You'). Label 'Friday. Contested. Ben. Debby, you. Your choice.'.
- **What the app does, and who acts:** Meanwhile the app builds the template as delivered. A later brief can check the visible line when the viewer isn't first in roster order.
- **Second reviewer:** Verified. G04-confirm-refused draws 'Ben and Debby · You', and the label is 'Friday. Contested. Ben. Debby, you. Your choice.'. With roster order and '{personName} · You' inside a ListFormatter list, the visible suffix can read as applying to both names.

### W-11 · note · app · confirmed

- **State:** G06-switcher-unavailable
- **Rule:** Brief Rules: 'targets are at least 44 points'.
- **Finding:** Two declared tap areas overlap, so one of them is effectively smaller than drawn.
- **Evidence:** Kitchen table rect [20, 615, 353, 64] ends at y=679. Club details rect [20, 670, 353, 44] starts at y=670. That is a 9 pt overlap, which leaves Club details 35 pt of its own.
- **What the app does, and who acts:** Meanwhile the app uses native sheet rows and buttons, which don't overlap, and checks the hit regions in the snapshot run.
- **Second reviewer:** Verified. Kitchen table's rect [20, 615, 353, 64] ends at 679, and Club details' rect [20, 670, 353, 44] starts at 670, so they overlap by 9 pt. If the row wins the overlap, Club details' own area is 35 pt. Handoff 5's switcher had no overlap (Kitchen table 572 to 636, Club details from 652).


**Found by the second reviewer**

### WM-01 · should · app · found in review

- **State:** G05-local-times (redraw, frame 27)
- **Finding:** The G05-local-times redraw changes the state's moment as well as its layout. Handoff 5's frame showed no open day. The redraw shows Debby's Friday open and drops Debby's November 13. The manifest doesn't give the new moment.
- **Evidence:** Handoff 5's manifest G05-local-times lists Nina, Ben, Maya, Alex, Sam and Debby (November 13), with no open entry, and the status bar reads 9:41. Handoff 6's frame 27 lists Debby November 6 with openNow true, then Nina to Sam, with no Debby November 13, and the status bar reads '2:41'. Its manifest entry has no server_now and no constructed flag, while H01-travelling and H01-travelling-dateline carry server_now. Brief: 'A redraw keeps everything else in the earlier frame as it was' and 'Each constructed part says exactly what is constructed'. IMPLEMENTATION.md: 'the redrawn London sheet begins with Debby’s open Friday, November 6'.
- **What the app does, and who acts:** The ios thread records frame 27 as the open-day variant, at a moment inside Debby's Friday, November 6 window, with no stated server_now. It keeps handoff 5's G05-local-times as the reference for the two-zone sheet with no open day. Snapshot fixtures set server_now explicitly for both.

### WM-02 · should · app · found in review

- **State:** G04-confirm-refused
- **Finding:** No contract says how VoiceOver users learn that the confirmation was refused. The refusal line is drawn, but it isn't a semantic group, and no handoff 3, 5 or 6 rule announces it after the failed tap.
- **Evidence:** Drawn text: 'Couldn’t confirm Friday. This day is contested. Your choice is' / 'kept.' (handoff6.calendar.contested.refused). The G04-confirm-refused semanticGroups have no entry for it. handoff3.raceFailure.confirmation says only 'plus the inline exact failure'. The only announcement rules are handoff3.loadingAndCutoffFocus and handoff6.waitingHero. The Confirm Friday button becomes disabled with the hint 'This day is contested. Confirmation is not possible yet.'. T47: accessibility is part of done.
- **What the app does, and who acts:** Meanwhile, when the server refuses, the app posts the refusal text once as a VoiceOver announcement, keeps focus on the Confirm button and never re-announces. A later brief confirms the focus and announcement contract.

### WM-03 · note · founder · found in review

- **State:** G04-contested-other; FQ46 Default
- **Finding:** In Sam's view the contested Friday has no names or count, as FQ46's Default says. But the vacated proposed days show who the choosers are. Every member saw Ben proposed for Monday and Alex for Wednesday. Both days now read Available, and a one-day choice can't be empty. So Sam can tell that Ben and Alex, with Debby, are Friday's three choosers. The delivery's FQ46 assessment doesn't mention this.
- **Evidence:** G04-contested-other draws 'Monday' 'Available', 'Wednesday' 'Available', 'Friday' 'Contested' 'No reveal scheduled'. G04-one-day shows everyone 'Wednesday. Alex. Proposed. Can be chosen.'. choiceRules.abandonedProposal: 'Free; no previous owner in public views'. IMPLEMENTATION.md: 'The single-day own row stays selected'. Brief item 3: 'Sam sees Friday contested without names or a count.' defaultsAssessment.FQ46_FQ48 says nothing of the inference.
- **What the app does, and who acts:** Meanwhile the app builds the Default as drawn: free rows name nobody, and the contested row shows no names or count to non-choosers. The founder decides under FQ46 whether this inference is acceptable.

### WM-04 · note · app · found in review

- **State:** G04-confirmed-many
- **Finding:** The summary's Back route in screen-copy.json is the same 'previous safe screen' as on every editable G04 screen. The written rule says Back pops to the stored origin and never to the editable picker.
- **Evidence:** screen-copy G04-confirmed-many: Back route 'previous safe screen'; Done route 'safe originating Home or Schedule'. component confirmationNavigation.Back: 'Pop G04 completion to stored safe origin Home or Schedule, never editable choice list. Done does the same.' IMPLEMENTATION.md: 'Back and Done pop to the saved safe origin (Home or Schedule), removing the stale editable picker from the navigation stack.'
- **What the app does, and who acts:** Meanwhile the app follows confirmationNavigation. Back and Done on the completion summary both return to the stored origin, and the picker is removed from the stack. This is recorded in INVENTORY.md.

### WM-05 · note · app · found in review

- **State:** copy-contracts.json handoff6.calendar.context.zoneOnly, details.footer.zoneOmitted
- **Finding:** Two reusable templates exist only to draw nameless or zoneless fixtures. The delivery says real clubs always have a name and a zone, but the keys are listed as kind 'new' reusable templates, not as example keys.
- **Evidence:** handoff6.calendar.context.zoneOnly = '{clubZoneName}' and handoff6.details.footer.zoneOmitted = '{memberCountText}', both with provenance kind 'new'. IMPLEMENTATION.md: 'Nameless fixtures show New York alone on the context line; real clubs always supply their club name' and 'production uses the member-count/club-zone template with real data'. Brief: 'the day-picking screens' club line is always calendar.clubZone' and 'the template keeps {clubZoneName}'; 'fixture values go in screen-copy.json or a separate example key'.
- **What the app does, and who acts:** Meanwhile the app uses calendar.clubZone and details.footer for every real club, and uses zoneOnly and zoneOmitted only to reproduce the fixture snapshots. The ios thread marks both as fixture-only in INVENTORY.md.


## Copy, privacy and product rules

**Summary.** Copy, privacy and product-rule check of handoff 6.

**What passes:** Nothing hidden leaks. No drawn or spoken string uses a pronoun, counts contributions, ranks, reminds or makes up a date.
- **The four denied screens** (F01-unavailable, M01-access-lost and the H01 redraws) carry nothing of the club. I checked their SVG labels: only "Tadayo", Add, Account, the denial text, Choose a club, Get help and the tabs.
- **FQ79's first dates** are correct: Nina 7, Maya 10, Alex 11 and Sam 12 November.
- **The travelling lines:** both carry their dates, the countdown is the same 5h 59m as in New York (server time, T1), and the countdown is spoken as its target date (T47).
- **The defaults:** FQ46, FQ48, FQ55, FQ57 and FQ16 are drawn as the brief set them.

**2 must:**
- **R-01:** the contested line "The proposed days overlap on {weekday}." uses "proposed" for every holder of the day. The same screens keep "Proposed" for a member's original day and call a held day "Your choice". It reads as untrue for anyone who actively chose the day.
- **R-05:** the club list keeps an enabled "Club details" while the selected club is suspended. Nothing says what it opens.

**4 should:**
- **R-02:** Sam, whose day isn't in the clash, gets the choosers' explanation and help line.
- **R-03 (founder):** the hint "You’ll then see the people in this contested choice" advertises a way to peek at the names. The freed Available days already reveal them anyway.
- **R-04 (founder):** in a club's first days, Friends rows with no date and the week's "No reveal scheduled" show every member who hasn't confirmed. This follows the first-days default, and the founder report said the opposite.
- **R-06:** the kept-dates example leaves out the year that the delivery's own rule requires.

**4 notes:**
- **R-07:** the chooser line "Ben and Debby · You" can be misread.
- **R-08:** "Confirmed days will go ahead." appears on a screen with no clash.
- **R-09 (founder):** Leave club is offered to the last active member, and no source says what happens then.
- **R-10:** two fixture-only templates leave out the club's name or zone.


**What passes, rule by rule**

- **H01-confirm-days: "Your club’s next scheduled day will appear here." and its Private drafts row.** Not a problem. The line is true under the default: as soon as any day is confirmed, Home shows that next occurrence (component-contracts firstDays.whenFirstConfirms; IMPLEMENTATION, "Once any confirmed occurrence exists, Home shows the next actual confirmed occurrence"). It names nobody, counts nothing and gives no date or time (T15, T33, T49). It says what Home will show, not when. The Private drafts row agrees with book p7 (a prominent drafts row), book p46 (the owner is the only audience) and spec 04 ("Before activation, Ben can prepare private drafts"). Add offers only Private draft, then Open my drafts, with no collecting target.
- **"The proposed days overlap on {weekday}." when two of the holders actively chose the day, and shown to Sam.** Not true in the screen's own words (R-01, must). Showing it to Sam, who isn't in the clash, together with the choosers' help line, is R-02 (should).
- **G04-contested-other hint "Choose {weekday}. You’ll then see the people in this contested choice.".** Yes, it invites a peek that works against FQ46's purpose. The underlying behaviour (a new chooser sees the names) is the brief's FQ48 default, so this is the founder's decision: R-03 (should, founder).
- **Chooser line "Ben and Debby · You" (Debby's view) against "Ben · You, Alex and Debby" (Ben's view).** The varying position comes from stable roster order (spec 09's principle), and that is fine. The visible "· You" inside a list can be misread; the spoken labels are clear. R-07 (note).
- **Spoken "Taken" for another member's confirmed day.** Not a problem. It is FQ48's own word ("only a confirmed day is taken"). It is spoken only on read-only confirmed rows, after the visible "Confirmed", so the label still begins with the visible words. It leaves "Unavailable" for access removed (book p41), and the viewer's own confirmed row omits it (calendar.row.ownConfirmed.vo).
- **G04-confirm-refused "Couldn’t confirm Friday. This day is contested. Your choice is kept.".** Not a problem. It names the action that failed and keeps Debby's choice (T43). It is drawn in secondary ink (#607067), not error red. Ben is named only on the row, where Debby is a chooser (FQ46). It says nothing about who should move (FQ55). Only the overlap line above it is wrong (R-01).
- **G04-confirmed-many "Confirmed days will go ahead.".** True, and it promises no date. But it is reused from the clash screens on a screen with no clash, and it doesn't say when the first day opens, which FQ79 can push back a week. R-08 (note).
- **G05 review row "Your confirmation is saved." (T33).** Not a problem. It reports only the viewer's own state, with no count, names or waiting line, and it is handoff 3's own G04.change.saved.title. That the row stays while the change is pending is built into the all-member rule (FQ56) and names nobody.
- **Friends rows with no date and no chevron in a club's first days (T15, T33).** The default allows a missing date, and the missing chevron and tap add no information beyond it. But the default itself turns Friends, and the week's "No reveal scheduled" days, into a readable list of who hasn't confirmed. R-04 (should, founder).
- **F01 dates without a zone at home.** Not a problem. 2.1's F01-friends draws "Monday 9 November · 7 AM" with no zone. Book p13 and spec 05 ask for the club zone only beside a local equivalent when travelling. The spoken labels add "New York".
- **FQ79 "Equality qualifies".** Not a problem. The brief's default is "at least 24 hours", which includes exactly 24. Measuring elapsed instants across daylight-saving changes matches "after it was confirmed". The fixture's dates are correct (validation-report firstOpeningCases).
- **Visible countdown "1d 5h 59m" and the year policy (T41, FQ44).** The countdown is not a problem. It extends the book's "21h 19m" form (p29), comes from the server's clock (waitingHero.longDuration), the date leads (book p7) and VoiceOver speaks the target date (T47). The year policy meets T41 and FQ44 (weekday and month in words, the phone's region), but its own kept-dates example contradicts it: R-06 (should).
- **Denied header's wordmark instead of the club selector; does anything of a suspended or lost club leak (T9, T24)?.** No leak on the denied screens. The SVG labels of F01-unavailable, M01-access-lost, H01-unavailable and H01-access-lost hold no club name, roster, date or history, and the one Choose a club fixes the duplicate. A club you can no longer open is left out of the list. A suspended club's name with "Unavailable" in the list was asked for by the brief (item 14). The gap is the club list's "Club details" over a suspended club: R-05 (must).
- **G05-club-details-paused: "1 member", "New members need everyone’s approval", "Leave club", the Invite someone route (spec 04).** "1 member" is the roster count the brief asked for (book p24: the displayed count and roster agree), not a count of anyone's activity. "New members need everyone’s approval" is 2.1's own subtitle and is true with one member: FQ60 counts proposing as the proposer's approval, and T7 needs two approvals. The Invite route matches spec 04, T7 and FQ16: a per-person invitation, the candidate accepts the exact roster, and every current member approves. Leave club for the only remaining member has no defined outcome: R-09 (note, founder).


**Findings**

### R-01 · should · claude-design · adjusted

- **State:** G04-conflict-three, G04-contested-other, G04-confirm-refused and the G04-conflict redraw: handoff6.calendar.contested.explanation
- **Rule:** Brief item 2: "Write an explanation that stays true when a chooser holds the day only because it was proposed". Spec 03 and T41: "Use the same noun on every platform". T43: copy is direct and factual. Spec 05: the system proposes an allocation with one distinct day per member.
- **Finding:** 'The proposed days overlap on {weekday}.' uses 'proposed' for each holder's current day, whether chosen or not. The same screens use 'Proposed' only for the day the system suggested for a member, and 'Your choice' for a day someone holds. Under spec 05, suggested days never overlap, so in the tag's sense the line is never true. On G04-conflict-three it sits above Ben's 'Monday · Available · Proposed for you' and reads as if Ben's proposed day were Friday. It is true only in the delivery's wider sense: the days in the proposal.
- **Evidence:** copy handoff6 'calendar.contested.explanation': 'The proposed days overlap on {weekday}.' (replaces handoff5 '{chooserSentenceList} chose {weekday}.'). screen-copy G04-conflict-three: 'The proposed days overlap on Friday.' … 'Monday' 'Available' 'Proposed for you' … 'Friday' 'Contested' 'Ben · You, Alex and Debby' 'Your choice'. G04-confirm-refused and G04-conflict draw the same line over Friday rows labelled 'Your choice'. G04-one-day draws Ben's untouched proposed Monday as 'Ben · You' / 'Your choice'. IMPLEMENTATION: 'It stays true whether an overlapping holder actively chose the day or holds a current proposed assignment'. Spec 05: 'the system proposes an allocation that each member confirms'.
- **What the app does, and who acts:** Meanwhile the app builds the line as delivered. It names nobody, counts nothing and is true in the delivery's sense. The ios thread records the two meanings of 'proposed' in INVENTORY.md's Known differences. The next brief asks for one line in the screen's own nouns that is true both for a member who chose the day and for one who holds it by proposal.
- **Second reviewer:** The facts are right, but the line is ambiguous, not plainly false. The delivery uses 'proposal' for the whole set of current holdings (PDF p2: 'Proposals can overlap without each holder actively choosing'; H01-confirm-days hint 'Review your choices in the proposed week.'). In that sense the line is true for every holder, and it meets brief item 2's literal ask. What fails is that the same screen uses 'Proposed' for the day the system suggested for each member. Next to Ben's 'Proposed for you' Monday, the line reads as false. That is a wording inconsistency, not a break of the brief or an invariant. Handoff 5's line was flatly false and was graded should (C-01), so must overstates this one. With no rule clearly broken, the frame stands meanwhile.

### R-02 · note · claude-design · adjusted

- **State:** G04-contested-other (Sam, who didn't choose Friday): the explanation and help lines
- **Rule:** Brief item 3: Sam "hasn't confirmed and didn't choose Friday". T43: direct and factual. The brief's rule: "Nothing counts or chases" (T33).
- **Finding:** Sam's view reuses the choosers' explanation and help: 'The proposed days overlap on Friday.' and 'You can choose another day, or keep your choice.'. Both are true for Sam, but they were written for the people in the clash. G04-one-day's instruction, 'Choose a day that works for you, then confirm.', doesn't appear.
- **Evidence:** screen-copy G04-contested-other drawnText: 'The proposed days overlap on Friday.' 'You can choose another day, or keep your choice.' … 'Thursday' 'Sam · You' 'Your choice' … 'Friday' 'Contested' 'No reveal scheduled'; Confirm Thursday is enabled with the hint 'Confirm your recurring day choices.'. copy handoff5 'calendar.contested.help': 'You can choose another day, or keep your choice.'; handoff6 'calendar.one.body': 'Choose a day that works for you, then confirm.'; handoff5 'calendar.choice.help': 'You can change your choice before confirming.'.
- **What the app does, and who acts:** The app builds Sam's view as drawn. A later brief may confirm which lines a member outside the clash sees.
- **Second reviewer:** The reuse is real, but both lines are true for Sam and chase nobody. Sam can choose another day or keep Thursday, which is what the ordinary help ('You can change your choice before confirming.') says in other words. Sam's row reads 'Your choice' with no 'Contested', so the screen doesn't say Sam's choice is in the clash. Neither T43 nor T33 is broken, so the frame stands. The app shouldn't swap in other copy.

### R-03 · should · founder · adjusted

- **State:** G04-contested-other: the Friday row's hint (handoff6.calendar.row.contestedOther.hint)
- **Rule:** FQ46 in QUESTIONS.md (PR #13): showing the clash with names "tells the club who hasn't confirmed". The brief's FQ46 default: "Sam sees Friday contested without names or a count". The FQ48 default: choosing Friday makes Sam a chooser, "who then sees the names". T33.
- **Finding:** The hint tells Sam that choosing Friday shows who is in it. That follows both Defaults, but together they hide little. On Sam's screen, every unconfirmed member's day is named except Friday's: Tuesday Maya, Thursday Sam, Saturday Nina, and Monday and Wednesday Available. So Ben, Alex and Debby are the choosers, by elimination. The same is true of any public week with a contested day, where every other day names its owner. Joining in order to see the names isn't private either: Sam's Thursday turns Available for everyone, and the choosers see Sam's name. Whether FQ46's no-names rule is worth keeping, and whether the hint should say this, is the founder's call.
- **Evidence:** copy handoff6 'calendar.row.contestedOther.hint': 'Choose {weekday}. You’ll then see the people in this contested choice.'. screen-copy G04-contested-other: Friday hint 'Choose Friday. You’ll then see the people in this contested choice.'; 'Monday. Available.', 'Tuesday. Maya. Proposed. Can be chosen.', 'Wednesday. Available.', 'Thursday. Sam, you. Your choice.', 'Saturday. Nina. Proposed. Can be chosen.'. component-contracts dayChoiceRow.contestedOther: 'Selecting joins the choice and enables names, but not confirmation.'; defaultsAssessment.FQ46_FQ48: 'Non-chooser can join a contested day without seeing existing names beforehand. Explain in hint'. QUESTIONS (PR #13) FQ46: the named clash 'tells the club who hasn't confirmed'. Brief FQ48 Default: choosing 'makes Sam one of its choosers, who then sees the names'.
- **What the app does, and who acts:** Meanwhile the app builds the row and its hint as delivered, since both follow the Defaults. The founder report puts FQ46 and FQ48 to the founder together. It says that the names on a contested day can be worked out from the rest of the week, and that the hint tells a member outside the clash that choosing the day shows them.
- **Second reviewer:** The analysis is right, but the hint breaks no rule. It truthfully describes the brief's FQ48 Default ('doing so makes Sam one of its choosers, who then sees the names'), and the delivery flagged it in defaultsAssessment.FQ46_FQ48. Changing the hint meanwhile would change a frame with no rule behind it. The real point is the product question the two Defaults raise together, and the names can be worked out by elimination even without choosing.

### R-04 · should · founder · adjusted

- **State:** F01-friends-first-days and G05-schedule-choose-own (a club's first days)
- **Rule:** T33 ("Waiting for Debby"). The brief's rule: "no count or list of who hasn't confirmed, accepted or added anything". The brief's first-days default: "Ben's and Debby's rows show no date, and nothing else in their place that says they haven't confirmed (T15, T33)". Handoff 5's check, section 4 item 10: "Only the day-picking screens name who hasn't confirmed yet (FQ48)."
- **Finding:** Drawn as the Default, Friends shows everyone who hasn't confirmed. Ben's and Debby's rows are the only ones with no date, and they also lack the chevron and tap that every dated row has. The club's week does the same by elimination: Monday and Friday read 'No reveal scheduled', and every other day names its member. Every member can read this. The delivery adds nothing beyond the Default, and any truthful form has the same effect, because a made-up date is ruled out (T49). Handoff 5's check told the founder the opposite: 'Only the day-picking screens name who hasn't confirmed yet (FQ48).'
- **Evidence:** screen-copy F01-friends-first-days: semanticGroups {kind: 'noOccurrence', label: 'Ben, you.'} and {kind: 'noOccurrence', label: 'Debby.'}. Maya, Alex, Sam and Nina carry dates and the route 'F02 exact occurrence' (68 high; Nina 76). Debby's row is 52 high (Sam's [20,498,353,68] ends at 566; Nina's starts at 618). The PNG draws chevrons on Maya, Alex, Sam and Nina only. component-contracts friendsRow.noOccurrence.shape: 'Name and avatar only, 52 minimum … no date, status, placeholder, chevron or tap action'. G05-schedule-choose-own: 'Monday. No reveal scheduled.', 'Friday. No reveal scheduled.'. handoff-5-check.md section 4, item 10. Brief rule: 'no count or list of who hasn't confirmed'.
- **What the app does, and who acts:** Meanwhile the app builds the Default as drawn and never shows a placeholder date (T49). The founder report states plainly that in a club's first days, Friends and the club's week show every member who hasn't confirmed, correcting handoff 5's check, so the founder can keep or change the reading.
- **Second reviewer:** True as analysed, and a consequence of the brief's first-days Default, not a delivery error. One detail is off: handoff 6's founder report only says the week 'names nobody' and the row 'shows no date'. The report that told the founder the opposite is handoff 5's check (section 4, item 10).

### R-05 · should · claude-design · adjusted

- **State:** G06-switcher-unavailable: "Club details" while the suspended Sunday people is selected
- **Rule:** Brief item 12: "nothing of the club from the server or the phone's cache (T9, T24)". Spec 22: suspension "with a neutral client explanation". Spec 29: each screen implements "access revoked behaviour". T14. Book p7: "The club name opens switching and club details".
- **Finding:** Over a suspended selected club, the sheet keeps Club details enabled with no hint and no defined destination. Club details opens the selected club's details (book p7; 2.1's G05-club-details shows the member count, Members and Schedule). The denial contract covers only Home, Friends and Memories. So nothing says what Club details shows for a club Ben can't open, whether suspended or lost.
- **Evidence:** screen-copy G06-switcher-unavailable: 'Sunday people', label 'Sunday people. Unavailable.', traits ['selected'], route 'keep selected denied context'; 'Club details', enabled true, hint null, route 'native sheet action'. component-contracts replacementScopes.deniedHeader: 'All selected-context denials in Home, Friends and Memories.' Handoff 5 IMPLEMENTATION: 'Club details, Create a club and Cancel remain the ordinary sheet actions.' Book p7: 'The club name opens switching and club details'. Brief item 12: 'nothing of the club from the server or the phone's cache (T9, T24)'.
- **What the app does, and who acts:** Meanwhile, when the selected club is denied, the app's Club details opens the same neutral denial as Home, with nothing of the club from the server or the cache, and the server refuses that club's details (T14). The next brief asks how the sheet looks when the selected club is denied: Club details hidden, greyed out or leading to the denial.
- **Second reviewer:** The gap is real and new in handoff 6: handoff 5's switcher had only a club that hadn't started selected. But the frame doesn't draw Club details opening anything, and the brief didn't ask about it. So no brief item or invariant is broken, and the app's own denial rules decide where it leads. A similar unanswered denial route in handoff 5 (C-02, drafts under a denied club) was graded should.

### R-06 · should · claude-design · confirmed

- **State:** Year policy: the example for handoff6.change.keptDates against the delivery's own rule
- **Rule:** Brief, Return: "Give the rule for when a date carries its year". Handoff 3: "Exact start dates include year." T41 (exact dates). FQ44.
- **Finding:** The delivery's rule says kept dates always carry the year, and G04-change draws them that way. But the copy file's example for the kept-dates template has no year, so a build that follows the example drops the year from the dates the rule protects most. The rule's other condition, 'no clear year context', is never defined.
- **Evidence:** copy handoff6 examples.keptDates: template 'handoff6.change.keptDates', value 'Monday, November 9 · Thursday, November 12'. component-contracts travellingRows.targetYear: 'Always include year in proposed start/boundary/preserved-announced dates and their VO; elsewhere include year if outside contextual current year, crossing a year, no clear year context, or standalone specimen.' IMPLEMENTATION: 'Proposed starts, preservation boundaries and kept announced dates always carry the year'. screen-copy G04-change: 'Monday, November 9, 2026', 'Thursday, November 12, 2026'; label 'Ben, you. Monday, November 9, 2026 and Thursday, November 12, 2026. Announced dates unchanged.'
- **What the app does, and who acts:** Meanwhile the app follows the written rule and the frames. Kept dates, proposed starts and boundaries always carry the year, on screen and in VoiceOver, as do spoken targets and the local-times sheet. Home and Friends lines leave it out within the current year. The ios thread records the example as wrong. The next brief asks for it to be corrected and for 'no clear year context' to be defined.
- **Second reviewer:** Verified. examples.keptDates has no year, and that contradicts travellingRows.targetYear, IMPLEMENTATION and the G04-change frame. 'No clear year context' is never defined.

### R-07 · note · claude-design · confirmed

- **State:** Contested row's chooser line (handoff6.calendar.contested.people) in G04-confirm-refused and G04-conflict-three
- **Rule:** T43 (plain voice). T42 (names).
- **Finding:** The viewer's '· You' falls wherever roster order puts it inside a list. Debby's view, 'Ben and Debby · You', can be read as calling both people 'You'. Ben's view, 'Ben · You, Alex and Debby', can be read as a label 'Ben' followed by 'You, Alex and Debby'. The spoken labels are clear.
- **Evidence:** screen-copy G04-confirm-refused drawnText 'Ben and Debby · You', label 'Friday. Contested. Ben. Debby, you. Your choice.'; G04-conflict-three drawnText 'Ben · You, Alex and Debby', label 'Friday. Contested. Ben, you. Alex. Debby. Your choice.'. copy handoff6 'calendar.contested.people': '{chooserNameList}'; IMPLEMENTATION: 'Name · You for the viewer, in stable roster order'.
- **What the app does, and who acts:** The app builds the template as delivered, in stable roster order as spec 09 has it. A later brief may ask whether the visible list should mark the viewer another way.
- **Second reviewer:** Verified in screen-copy and the template. The visible list still joins the self marker to one name inside a list, which handoff 5's check also noted. The spoken labels separate each person.

### R-08 · note · claude-design · confirmed

- **State:** G04-confirmed-many: body line
- **Rule:** T43. The FQ79 default. Spec 04: "If the first reveal is days away, show the actual waiting card and exact date."
- **Finding:** 'Confirmed days will go ahead.' is reused from the clash screens. When the pair finishes confirming there is no clash, so the line answers a question this screen doesn't raise. It also doesn't say when Ben's first day opens, which FQ79 can push back a week. The line is true, names nobody and promises no date.
- **Evidence:** screen-copy G04-confirmed-many: 'Your days are' 'confirmed.' 'Confirmed days will go ahead.'. copy handoff3 'G04.conflict.confirmedBody' and handoff5 'calendar.confirmed.body': 'Confirmed days will go ahead.'. component-contracts defaultsAssessment.FQ79: 'a confirmation less than 24h before its weekday opening can defer the first date by a week. Display the real resolved date wherever dates are shown'.
- **What the app does, and who acts:** The app builds it as drawn, and Home then shows the real first date. A later brief may give the completion screen a line for the case with no clash.
- **Second reviewer:** Verified. The body is handoff 5's calendar.confirmed.body, first used over a contested week. The pair's fixture has no clash, and the screen shows no first date.

### R-09 · note · founder · confirmed

- **State:** G05-club-details-paused: "Leave club" offered to the only active member
- **Rule:** Spec 22: leaving asks keep or withdraw, and the member who leaves loses club access. FQ16: Memories stay readable "for whoever remains". FQ63: a leaver's days. Book p32: "Destructive choices explain consequences before confirmation."
- **Finding:** The paused Club details offers Leave club to Ben, the club's only active member. No source says what happens when the last member leaves: whether the club ends, what becomes of its Memories when nobody is left to read them, and what happens to an invitation still out.
- **Evidence:** screen-copy G05-club-details-paused: 'Kitchen table' '1 member' … 'Leave club', hint 'Review leaving Kitchen table.', route 'leave confirmation'; frame-manifest activeMemberCount 1. IMPLEMENTATION: 'This delivery adds no outcome for a departed member’s announced days.' Spec 22: 'If they keep, remaining eligible members may continue viewing their contributions.' FQ16: Memories stays readable 'for whoever remains'.
- **What the app does, and who acts:** Meanwhile the app shows the row as drawn and builds leaving in B6 under spec 22. It deletes nothing for a last member who leaves until the founder answers. The ios thread raises a new question for the founder: what leaving does for a club's last active member (needed by B6).
- **Second reviewer:** Verified. The frame offers Leave club with activeMemberCount 1. No source (spec 22, FQ16, FQ63, T26) says what leaving does when nobody would remain. The delivery draws 2.1's row as the brief asked and adds no outcome.

### R-10 · note · app · confirmed

- **State:** Fixture-only templates: handoff6.calendar.context.zoneOnly and handoff6.details.footer.zoneOmitted
- **Rule:** Spec 04: Ben names the club. Spec 05: every club stores an IANA zone. Brief item 15: "the template keeps {clubZoneName}". Handoff 5's check, R-10 (peopleZone).
- **Finding:** Two new reusable templates exist only to draw fixtures that the book leaves without a club name or zone: '{clubZoneName}' and '{memberCountText}'. The delivery says production always uses the club's name and zone, but a build could pick up these templates, as it could handoff 5's peopleZone.
- **Evidence:** copy handoff6 'calendar.context.zoneOnly': '{clubZoneName}' (provenance kind 'new'); 'details.footer.zoneOmitted': '{memberCountText}' (kind 'new'). IMPLEMENTATION: 'Nameless fixtures show New York alone on the context line; real clubs always supply their club name.' and 'production uses the member-count/club-zone template with real data'.
- **What the app does, and who acts:** The app never uses these two templates. G04's club line is always handoff5.calendar.clubZone with the club's own name, and Club details' line is handoff6.details.footer with the zone. The ios thread marks both templates fixture-only in its copy mapping.
- **Second reviewer:** Verified. Both keys are provenance 'new', and both exist only to draw fixtures the book leaves without a club name or zone. Spec 04 and spec 05 guarantee a name and a zone in production.


**Found by the second reviewer**

### RM-01 · should · app · found in review

- **State:** copy-contracts.json: handoff6.replaces and provenance, for earlier keys that handoff 6 keys take over
- **Finding:** The brief asked for every earlier key a handoff 5 or 6 key takes over to be named, but five are missing. handoff6.friends.title, friends.subtitle and friends.schedule are marked 'new' but repeat handoff3.F01.title, F01.subtitle and F01.schedule word for word. handoff3.F01.schedule.vo, 'See schedule for Sunday people.', writes one club's name in. It is not replaced, although the frames speak 'See schedule' with the hint 'Open the club’s week.'. handoff6.calendar.confirmed.own.title repeats handoff5.calendar.confirmed.title.many. handoff3.H01.unavailable.help.vo, 'Get help with club access.', is not replaced either, although the frames speak 'Get help' with handoff5.home.help.hint.
- **Evidence:** copy handoff6.provenance: friends.title, friends.subtitle, friends.schedule and calendar.confirmed.own.title are each {kind: 'new', replaces: []}. handoff3.F01.title 'Friends', F01.subtitle 'Choose who it’s for.', F01.schedule 'See schedule', F01.schedule.vo 'See schedule for Sunday people.'. handoff5.calendar.confirmed.title.many and handoff6.calendar.confirmed.own.title are both 'Your days are confirmed.'. None of these, and not handoff3.H01.unavailable.help.vo, appears in handoff5.replaces or handoff6.replaces. screen-copy F01-friends-first-days 'See schedule': label 'See schedule', hint 'Open the club’s week.'; F01-unavailable 'Get help': label 'Get help', hint 'Contact Tadayo support.'. Brief, Return: 'name every earlier key a handoff 5 or handoff 6 key takes over'.
- **What the app does, and who acts:** Meanwhile the app takes the handoff 6 keys and the frames' labels as current and treats the five earlier keys as superseded. It never speaks the club name written into F01.schedule.vo. The ios thread records the mapping in its copy mapping and in INVENTORY.md. A later brief can ask Claude Design to add the keys to handoff6.replaces.

### RM-02 · note · claude-design · found in review

- **State:** G05-local-times (redraw), during an open day
- **Finding:** During Debby's open day, the sheet lists Debby's open Friday first, then one next day for each other member. It leaves out Debby's next Friday, which is the date Home's contextual Add targets during the open day (spec 08). So a traveller can't find that date's local time in the sheet. Handoff 5's sheet listed every member's next day. The traveller still sees it on F02 (travellingRows.F02).
- **Evidence:** screen-copy G05-local-times allDatedOccurrences: Debby 2026-11-06 (openNow true), Nina 11-07, Ben 11-09, Maya 11-10, Alex 11-11, Sam 11-12; no Debby 11-13. component-contracts handoff6.localTimesSheet.openFirst: 'One current/next occurrence per member; no second future occurrence for the already-open member.' handoff5.localTimesSheet.why: 'sheet shows dated openings AND closings across all next authorized occurrences'. Spec 08: 'While the current feed is on Home, the contextual Add control explicitly targets that star's next collecting date'.
- **What the app does, and who acts:** The app builds the sheet as drawn. F02 and the composer show the next Friday's local time. A later brief may ask whether the open day's star should also get a block for their next day.


## Brand, visuals, native iOS and accessibility

**Summary.** Lens: brand, visuals, native iOS and accessibility. I measured every phone frame (type size and weight from the outlined glyph geometry against Arimo's advances, rects, circles and inks) and compared each one with its handoff 5 or handoff 3 frame and the 2.1 render. I checked targets in screen-copy.json, computed contrast from the hex values in both themes, and diffed the brand-components sheet against handoff 5's.

What holds:
- The upper 1200x6880 of the sheet is pixel-identical to handoff 5's: 0 differing pixels at 2x.
- All 239 of handoff 5's sheet labels are present, in order.
- The handoff 6 section adds light and dark specimens of every part the brief asked for. The dark plaque and the fallback avatar pass, using only revision 1.1 tokens.
- One-line rows are 48 pt, two-line rows 64 pt, contested rows 88 pt, with 4-pt canvas gaps. The Proposed tag is the same shape on a day and on a member.
- Disabled buttons pass. Every control is at least 44 pt.
- No text in any phone frame is below 4.5:1.
- The denied header's wordmark is the brand master itself (same path, same action ink, 96 pt).

What doesn't hold:
- **Must (1):** the day pickers lost their selection circles on every choosable Proposed row, including the redraw of handoff 5's G04-one-day, which the founder adopted. This contradicts the delivery's own contract.
- **Should (10):**
  - The waiting card was silently re-typed in the H01-travelling redraw, and its date-line variant drops the date line.
  - In dark, the selection mark on the viewer's own row loses its disc (1.28:1).
  - The denied header contradicts a handoff 3 header rule the delivery doesn't retire.
  - The denied screens were redrawn with a smaller, lower title that the delivery doesn't explain.
  - Friends rows break their contract: Next up is drawn regular, and the chevrons are 14 pt instead of 20.
  - Named spacing values don't match the frames by 5 to 18 pt.
  - The refusal on G04-confirm-refused has no spoken form.
  - In the switcher, the Club details target overlaps a club row by 9 pt.
  - The switcher offers Club details for a suspended club; the founder decides whether that route stays.
  - The denial screens and H01-confirm-days carry none of the book's objects.
- **Note (3):** the self marker at the end of a list, the outlined selected-tab icons, and an unexplained change to the local-times sheet's header.


**What holds**

- **Brand-components keeps everything handoff 5's sheet had.** Yes. The H6 PNG's top 2400x13760 px (1200x6880 pt) equals handoff 5's whole sheet: an ImageMagick-style difference finds 0 pixels off by more than 8. The 239 handoff 5 aria-labels appear in the same order. The new section starts at y=6896 with 'Handoff 6 · light' and 'Handoff 6 · dark' panels.
- **Sheet adds light and dark specimens of the requested parts.** Yes, in both themes:
- the waiting card (club-date plaque and avatar);
- the travelling time lines, inside that card;
- the denied header (wordmark, + Add, account photo);
- the switcher rows: Not started, Paused, Unavailable;
- the review row, before and after 'Your confirmation is saved.';
- the one-zone and two-zone local-time blocks;
- 8 day-choice forms: free, earlierSelf, otherProposed, otherConfirmed, ownChoice, ownConfirmed, contested chooser, contestedOther;
- SundayRow;
- the 2.1 past-day card.
- **Dark plaque and fallback-avatar pairings at 4.5:1 or more with revision 1.1 tokens only.** Yes. Plaque: canvas #121D19 with primaryText #F7F8F2, 16.18:1 (light 14.33:1). Fallback avatar: avatarCanvas #35463A with onAvatarCanvas #F7F8F2, 9.42:1 (light 11.86:1). Every token handoff6.waitingHero names exists in brand-tokens.json 1.1: canvas, primaryText, avatarCanvas, onAvatarCanvas, accent, onAccent. Dark hero text is onAccent #182B25 on accent #E4D8A2, 10.38:1.
- **Wordmark in action ink on denied screens: allowed by the brand?.** The asset use is allowed. The header path's md5 equals assets/brand-wordmark.svg, whose master fill is #284CDB (dark master #AFBEFF). The width is 915 x 0.104918 = 96.0 pt, which is wordmark.minimumWidth. It is byte-identical to handoff 4's G06-no-club header (noClubRootHeader). Book p6 and p7 don't forbid it.

The contract scope is not settled: handoff 3 still limits this header to clubs with no selected record (see V-04).
- **48-pt one-line rows and 4-pt canvas gaps.** Verified in G04-conflict-three, G04-contested-other, G04-confirm-refused and G04-two-days-one-chosen:
- one-line Available rows are 48 pt, with content centred (circle cy=440 in a 416-464 row);
- two-line and tag rows are 64 pt; contested rows are 88 pt;
- filled rows meet with a 4-pt canvas gap (for example 280-344 cover2, then 348-412 surface), each keeping rx 12;
- read-only week rows have a 48-pt pitch and SundayRow is 56 pt.
- **One Proposed tag for a proposed day and a proposed member.** Yes. Every day-row tag is rect 75.95x28 rx 6, fill surface #F0F2EC, stroke inputBorder #778579, with 'Proposed' 13 bold primaryText. That is the proposedMemberTag contract: 28 minimum, radius 6, proposedTag 13/18 bold. The diamond is gone.
- **Contested row: chooser versus outsider.** These are distinct, neutral shapes with no destructive ink:
- Chooser: surface fill, a #778579 outline, 88 pt, the names line at x=36, a selected circle.
- Outsider (G04-contested-other): canvas fill, a #778579 outline, 64 pt, 'Contested' over 'No reveal scheduled', an empty circle, no names.

In dark: chooser #203027 with #8C9B90, outsider #121D19 with #8C9B90.
- **Disabled button styling and contrast.** 'Confirm Friday' and 'Confirm two days' use actionDisabled #E2E6DF with onActionDisabled #4F5E55, 5.42:1. In dark it is #35463A with #BAC6BD, 5.70:1. This is the handoff 2 Disabled state: 50 pt, rx 13, no opacity multiplier. screen-copy marks them enabled:false.
- **Targets at least 44 pt.** Every control rect in screen-copy.json is at least 44 in both dimensions:
- Back 44x44, Not now 86x44, Account 44x44, + Add 59x44, tabs 131x59;
- rows 353 x 48 to 108; text actions 353x44.

The wordmark is non-interactive. The only geometry fault is an overlap, V-07.
- **Text contrast at least 4.5:1.** No phone-frame text falls below 4.5:1. The two weak pairs are avoided by design:
- secondaryText on cover2 (4.17:1): the own-choice 'Your choice' uses onCover2 #182B25, 11.86:1;
- secondaryText on accent (4.08:1): every hero line uses onAccent.

Other secondary text: on canvas 5.04:1, on surface 4.64:1, in dark 9.44:1 and 7.58:1.
- **Type sizes and weights against the named roles.** Every measured run maps to a named role except two (V-03, V-05):
- 32 bold utilityTitle; 31 bold dayTitle; 25 bold, with a 30 line, emptyTitle;
- 17 bold row; 17 regular body; 16 bold button or clubHeader; 16 regular textAction; 15 bold headerAdd;
- 13 regular metadata; 13 bold eyebrow or proposedTag; 11 tab; plaque 10 bold and 25 bold. The plaque glyphs are byte-identical to handoff 5's.

The exceptions: 'Next up' on Friends rows is 13 regular, and the waiting-card initial is 19 pt.
- **Private drafts row, buttons, plaque: one shape each.** Private drafts is 353x76 rx 12 surface, with text at +31/+53 and a folder icon, identical on H01-confirm-days, the F01 frames and G05-club-details-paused. Primary buttons are 353x50 rx 13 action/onAction everywhere. The plaque is 45x55 rx 9 canvas, SAT 07.
- **Past-day card.** It follows 2.1 on both H01-travelling frames and on the sheet: canvas fill, a separator outline, rx 12, a check in a 28-pt surface circle, primaryText title, secondaryText date and action link.
- **Selected spoken once.** G06-switcher-unavailable labels Sunday people 'Sunday people. Unavailable.' with traits ['selected']. The label itself no longer contains Selected.


**Findings**

### V-01 · must · claude-design · confirmed

- **State:** G04-conflict-three, G04-contested-other, G04-confirm-refused, G04-one-day (redraw), brand-components day-choice specimens
- **Rule:** These sources all say a proposed row can still be chosen:
- handoff6.dayChoiceRow.otherProposed: 'Name plus existing proposedMemberTag …; empty selector.'
- FQ48 Default (brief item 3): a day only proposed can still be chosen.
- FQ2: handoff 5's G04-one-day is the reference, and it drew an empty circle on every proposed row.
- Book p34: 'A component has one shape, one meaning and explicit states.'
- **Finding:** Every choosable Proposed row is drawn without a selection circle, though it is an enabled control that can be chosen. Only Available and Contested rows keep a circle. The redrawn G04-one-day drops the five empty circles from the frame the founder adopted (FQ2), and the sheet specimen repeats the omission. Built from the frames, these rows would look read-only but be selectable.
- **Evidence:** - G04-conflict-three.svg circles at cy=300, 440 and 556 only. The Tuesday, Thursday and Saturday rows carry the tag rect (x=164, 28 high) and no circle.
- screen-copy, Tuesday: enabled true, label 'Tuesday. Maya. Proposed. Can be chosen.', hint 'Choose Tuesday.'.
- Handoff 5 G04-one-day.svg: empty circles (#778579) at cy=364, 428, 492, 556 and 620. Handoff 6 G04-one-day.svg: only the selected circle at cy=300.
- handoff6.dayChoiceRow.otherProposed: '... empty selector.'
- brand-components.svg: no circle on the Proposed specimen, light or dark.
- **What the app does, and who acts:** Meanwhile the app draws the native empty selection accessory on every choosable Proposed row, following the contract and handoff 5's adopted frame. The ios thread records the difference on the four G04 inventory rows. The next brief asks Claude Design to redraw them and the sheet specimen with the selector.
- **Second reviewer:** Verified. In G04-conflict-three.svg the only selection circles are at cy=300 (Monday), 440 (Wednesday) and 556 (Friday). The Tuesday, Thursday and Saturday Proposed rows have none. screen-copy marks those rows enabled with the label '... Proposed. Can be chosen.' and the hint 'Choose Tuesday.'. Handoff 5's G04-one-day has empty circles at cy=364 to 620. Handoff 6's G04-one-day keeps only the selected circle at cy=300. The sheet's Proposed specimen (y=8621) also has no circle. handoff6.dayChoiceRow.otherProposed says 'empty selector', so the frames contradict the delivery's own contract and the FQ2 reference. (Handoff 5's G04-conflict already lacked the circle, but its G04-one-day had it.)

### V-02 · should · claude-design · adjusted

- **State:** H01-travelling (redraw), H01-travelling-dateline, brand-components waiting card
- **Rule:** The redraw rule and the brand's sizes:
- Brief: 'A redraw keeps everything else in the earlier frame as it was.'
- IMPLEMENTATION lists the H01-travelling redraw only as '(2.1 past card)'.
- brand-tokens avatar sizes are 68, 36, 28 and 18; avatar36 is 16/20 bold.
- handoff6.waitingHero names no type roles and no avatar size.
- **Finding:** The H01-travelling redraw re-types the whole waiting card, beyond the past card it names as the reason:
- date 25 bold to 17;
- opening line 17 to 13;
- countdown 31 to 25;
- radius 18 to 16 (now cardRadius);
- avatar 36 pt with a 16-pt initial to 44 pt with a 19-pt initial.

The new type is close to 2.1's H01-waiting. But the 44-pt avatar and 19-pt initial are not brand sizes or roles, and waitingHero names neither. 2.1 itself draws about 48 pt.
- **Evidence:** - Handoff 5 H01-travelling.svg: 'Saturday, November 7' scale 0.0122070 (25), 'Opens 12 PM · London' 0.0083008 (17), '5h 59m' 0.0151367 (31), card rect rx=18 h=248, circle r=18, 'N' 0.0078125 (16).
- Handoff 6: 17, 13 and 25; rx=16, h=238; circle r=22; 'N' 0.0092773 (19).
- H01-travelling-dateline and the sheet hero (r=22) match handoff 6.
- 2.1 H01-waiting.png: avatar spans x≈305 to 352.
- brand-tokens avatar.sizes: 68, 36, 28, 18.
- **What the app does, and who acts:** Meanwhile the app builds the handoff 6 card as drawn (17/13/25 type, 44-pt disc, cardRadius 16), the newest delivery and the closest to 2.1. The app doesn't choose a size of its own. The ios thread notes the undisclosed re-typing on the H01-travelling row. The next brief asks Claude Design to name the hero's type roles and avatar size in waitingHero.
- **Second reviewer:** The measurements are right:
- date line 25 to 17;
- opening line 17 to 13;
- countdown 31 to 25;
- card rx 18 to 16 and height 248 to 238;
- avatar r=18 with a 16-pt initial to r=22 with a 19-pt initial.

IMPLEMENTATION gives the redraw reason only as '2.1 past card'. But the proposed action, switching to avatar36, would have the app pick a size no source sets. The 2.1 H01-waiting render draws the hero avatar about 48 pt wide (x 305 to 352). The brand lists 68/36/28/18, and none of them is the hero's. The new card radius 16 is brand-tokens geometry.cardRadius, so that part matches the brand.

### V-03 · should · claude-design · confirmed

- **State:** H01-travelling-dateline
- **Rule:** - Book p12: 'Name Friday 6 November, 7 AM New York before the 5h 19m countdown.'
- Book p7: 'the next person, exact date and opening time lead, with a secondary countdown.'
- Book p34: one shape per meaning. 2.1's H01-waiting puts a bold date line first in the card.
- **Finding:** When the local date differs, the card drops its bold date line. Both dated times become 13-pt metadata, and the 25-pt countdown is the only strong text. About 50 pt of the card is left empty above the countdown (24 in the London variant). The same card has two hierarchies, and on this variant the exact date no longer leads visually.
- **Evidence:** - H01-travelling-dateline.svg: 'Opens Sunday, November 8 · 1 AM · Auckland' 13 regular at baseline 307; 'Saturday, November 7 · 7 AM · New York' 13 at 333; '5h 59m' 25 bold at 410; card height 244.
- H01-travelling.svg: 'Saturday, November 7' 17 bold at 307, then 13-pt lines at 333 and 359; card height 238.
- Book p7: 'the next person, exact date and opening time lead, with a secondary countdown.'
- **What the app does, and who acts:** Meanwhile the app builds the drawn lines (home.localOpening.dated, home.clubOpening.dated), keeping the dates before the countdown as p12 requires. The ios thread notes the hierarchy gap on the row. The next brief asks Claude Design for one card hierarchy for both variants, with a leading local date line.
- **Second reviewer:** Verified in H01-travelling-dateline.svg. Both dated lines are 13 pt regular at baselines 307 and 333, and '5h 59m' is 25 bold at 410. The line-box gap from the last time line to the countdown is about 50 pt, against about 24 in H01-travelling, which leads with 'Saturday, November 7' in 17 bold at 307. The dates still come before the countdown in reading order (book p12). But the countdown is the only strong text, against book p7's 'exact date and opening time lead, with a secondary countdown'.

### V-04 · note · none · refuted

- **State:** H01-unavailable, H01-access-lost, F01-unavailable, M01-access-lost (denied header)
- **Rule:** - handoff3.selectedClubHeader.noSelectedClub: 'Use handoff 2 noClubRootHeader wordmark only when there is no selected club record.'
- Brief: under handoff6.replaces, name every earlier key a handoff 5 or 6 key takes over.
- Book p7: 'The club name opens switching'.
- **Finding:** Not a problem. The replacement chain (handoff3.selectedClubHeader to handoff5.deniedHeader to handoff6.deniedHeader) and its denial-only scope are stated. The wordmark's spoken text 'Tadayo' is defined in the contracts and the SVG.
- **Evidence:** - component-contracts handoff5.replaces: "handoff3.selectedClubHeader": "handoff5.deniedHeader".
- handoff6.replaces: "handoff5.deniedHeader": "handoff6.deniedHeader".
- handoff6.replacementScopes.deniedHeader: '... Ordinary authorized headers unchanged.'
- copy handoff6.header.denied.brand = 'Tadayo'.
- F01-unavailable.svg: <g aria-label="Tadayo">.
- Handoff 4 G06-no-club drawnText has no wordmark entry.
- **What the app does, and who acts:** None. The app builds handoff6.deniedHeader for denied contexts, with the wordmark as one non-interactive element labelled 'Tadayo'.
- **Second reviewer:** The contracts already resolve both points.
- handoff5.replaces maps 'handoff3.selectedClubHeader' to 'handoff5.deniedHeader', and handoff6.replaces maps 'handoff5.deniedHeader' to 'handoff6.deniedHeader'. So the handoff 3 header is named as replaced. The brief told Claude Design to leave handoff5.replaces as it is and complete it, not to repeat it.
- handoff6.replacementScopes.deniedHeader scopes the change: 'All selected-context denials in Home, Friends and Memories ... Ordinary authorized headers unchanged.' That leaves handoff 3's header for ordinary contexts. There is no live conflict.
- The spoken form is defined. deniedHeader.title = 'handoff6.header.denied.brand', the copy key is 'Tadayo', and the SVG labels the wordmark group aria-label="Tadayo".
- Leaving the wordmark out of drawnText matches handoff 4's G06-no-club screen-copy, which also omits it.

Only the header trait is unstated, and the native build supplies it.

### V-05 · should · app · adjusted

- **State:** F01-friends (redraw), F01-friends-first-days, F01-friends-travelling
- **Rule:** - handoff6.friendsRow.nextUpRole 'nextUp' = handoff3.supplementalTypeRoles.nextUp, 13/18 bold.
- handoff6.friendsRow.chevronSize 20.
- IMPLEMENTATION gives the F01-friends redraw as '(spacing)' only.
- **Finding:** The Friends rows depart from their own retained contract. 'Next up' is drawn 13 regular, though it is bold on Home in the same delivery and on handoff 3's F01. Row chevrons are 14 pt, not the contracted 20. The redraw also drops handoff 3's 'New York' footer and moves See schedule from trailing to leading, without saying so; the reason given is 'spacing'.
- **Evidence:** - 'Next up' first-glyph outline md5 cb48e8 in F01-friends, -first-days and -travelling. It equals the regular 'N' in 'Saturday, November 7 · 7 AM'. Handoff 3 F01-friends and handoff 6 H01 use 2d1272, the bold 'N' of 'Nina'.
- Chevrons: handoff 6 translate(359 335) scale(0.5833); handoff 3 translate(351 328) scale(0.8333).
- handoff6.friendsRow: nextUpRole 'nextUp' (13/18 bold); chevronSize 20.
- Handoff 3 drawnText ends 'New York', 'See schedule' (See schedule at x=276).
- **What the app does, and who acts:** Meanwhile the app follows the contract: nextUp 13/18 bold in secondaryText, and the native 20-pt disclosure chevron. The ios thread notes the footer and See schedule changes on the F01 rows.
- **Second reviewer:** Weight and chevron are verified.
- In all three handoff 6 F01 frames, the 'Next up' glyph outlines match the regular 'N' of the metadata dates (md5 cb48e8). Handoff 3 F01 and handoff 6 Home use the bold outline (2d1272, the same as 'Nina').
- The chevrons are translate(359 y) scale(0.5833) of a 24-unit glyph, 14 pt, against handoff 3's scale(0.8333), 20 pt. The contract says 20.
- The footer change is real.

But the claim that it 'matches 2.1' doesn't hold. 2.1's F01-friends shows neither the New York footer nor See schedule in its viewport.

### V-06 · should · claude-design · adjusted

- **State:** brand-components dark day-choice specimens; G04 own-choice rows in dark
- **Rule:** - handoff6.dayChoiceRow.ownChoice: 'cover2/onCover2 fill/ink, selected accessory action/onAction'.
- Book p26: 'non-colour status labels'. A graphic that shows state needs 3:1.
- Book p34: one shape per meaning.
- brand-tokens coverAssignment: 'Colour conveys no status…'.
- **Finding:** In dark, the own-choice row is pale cover2 #D4D9EC and its selected disc is action #AFBEFF. The disc reads at 1.28:1 against the row, so only the dark check shows. On the contested chooser row (surface), the same disc reads at 7.69:1. 'Selected' therefore has two looks in dark. The own-choice fill reuses a member-cover token; 2.1 used the same hue for own tiles, so that part is a note only.
- **Evidence:** - brand-components.svg dark 'Monday. Ben, you. Your choice.': rect x=616 y=8748 fill #D4D9EC; circle cx=943 cy=8768 r=10 fill #AFBEFF; check stroke #18233B.
- Ratios: #AFBEFF on #D4D9EC 1.28:1; #18233B on #D4D9EC 11.13:1; #AFBEFF on #203027 7.69:1.
- 2.1 G04-two-days.png: #E2E5F6 is the fifth most common colour and fills the own 'Your day' tiles.
- **What the app does, and who acts:** Meanwhile the app uses the native selection accessory as contracted, with the check legible at 11.1:1. The next brief asks Claude Design for a dark selected accessory on cover2 whose disc reaches at least 3:1, or for a named selection pair.
- **Second reviewer:** The dark specimen and the ratios are right:
- own-choice rect fill #D4D9EC (dark cover2);
- disc #AFBEFF;
- check #18233B;
- 1.28:1, 11.13:1 and 7.69:1 computed.

The check glyph keeps the state legible, and the row also says 'Your choice'. But the evidence about 2.1 is wrong. In 2.1's G04-two-days, #E2E5F6 is the fifth most common colour, after canvas, white, surface #F0F3EC and action #284DDC, not the second. It is still the own-choice tile fill there.

### V-07 · note · app · adjusted

- **State:** G06-switcher-unavailable
- **Rule:** T47 and book p26: targets at least 44 pt, with distinct native regions. Spec 24 sets the touch-target minimums.
- **Finding:** In the delivered geometry, the Club details target overlaps the Kitchen table row by 9 pt. Handoff 5's switcher left a 16-pt gap. Native controls in the build can't overlap, so only the snapshot geometry differs.
- **Evidence:** - screen-copy G06-switcher-unavailable: Kitchen table rect [20,615,353,64]; Club details rect [20,670,353,44].
- Separator at y=678; 'Club details' baseline 698.
- Handoff 5 G06-switcher-status: Kitchen table [20,572,353,64]; Club details [20,652,353,44].
- **What the app does, and who acts:** Meanwhile the app builds the sheet with native List and Button regions, keeping at least 44-pt targets with no overlap. The ios thread notes the delta on the row.
- **Second reviewer:** The overlap is in the data. Kitchen table [20,615,353,64] ends at 679, and Club details [20,670,353,44] starts at 670. Handoff 5 had a 16-pt gap (636 to 652). But native List rows and sheet buttons can't share hit regions, so the build has nothing to decide. It only records a snapshot geometry difference. That is a note, not a should.

### V-08 · should · founder · confirmed

- **State:** G06-switcher-unavailable
- **Rule:** - handoff6.deniedHeader: 'no cached club metadata'.
- T9: one read predicate.
- Spec 22: a suspended club gets 'a neutral client explanation'.
- Book p41: revoked access cannot impersonate an empty club.
- **Finding:** The switcher opened over the suspended club still offers 'Club details' for the selected, suspended Sunday people. The delivery doesn't say what it shows: the roster and zone, Leave club, or the denial. The sources don't settle whether a suspended club's members can reach Club details, for example to leave.
- **Evidence:** - screen-copy G06-switcher-unavailable: 'Sunday people', label 'Sunday people. Unavailable.', traits ['selected']; 'Club details', route 'native sheet action', hint null.
- handoff6.deniedHeader.allTabs: 'no cached club metadata'.
- Spec 22: '... emergency suspension of an occurrence or club with a neutral client explanation.'
- **What the app does, and who acts:** Meanwhile the app routes Club details for a denied selected club to the same neutral denial, with no club metadata, through the read predicate (T9). The founder decides whether a suspended club's members can reach Club details or Leave club.
- **Second reviewer:** Verified. G06-switcher-unavailable lists Club details (route 'native sheet action', hint null) while the selected row is the suspended Sunday people. IMPLEMENTATION, handoff6.switcherStatus and deniedHeader say nothing about what it opens. Spec 22 requires only 'a neutral client explanation' for a suspended club, and it doesn't say whether members can still reach Club details, for example to leave (spec 22 'Leaving asks ...'). The sources don't settle it.

### V-09 · should · app · adjusted

- **State:** H01-unavailable, H01-access-lost (redraws), F01-unavailable, M01-access-lost
- **Rule:** - Brief: a redraw keeps everything else as it was. IMPLEMENTATION gives the reason as '(one chooser and neutral header)' only.
- handoff6.spacing.homeContentTopAfterHeader 32.
- **Finding:** The denial redraws also change the title role and its position, and move Get help, without saying so:
- the title drops from utilityTitle 32/35 to emptyTitle 25/30 and starts about 65 to 71 pt below the header, against the named 32;
- Get help moves from centred to leading.

All four new denial frames copy this, so the title tops on Home differ from H01-confirm-days.
- **Evidence:** - Handoff 5 H01-unavailable: title scale 0.015625 (32) at baseline 168; Get help x=166.258 at baseline 736.
- Handoff 6: 0.0122070 (25) at 184; Get help x=20 at 732; button rect y=638.
- H01-access-lost and M01-access-lost: title lines at 184 and 214.
- Wordmark translate(20 65), height ≈30.4.
- H01-confirm-days title (32/35) at 151, line-box top ≈122.
- handoff6.spacing.homeContentTopAfterHeader 32.
- **What the app does, and who acts:** Meanwhile the app builds the denials with emptyTitle 25/30 (a named role, as drawn) and leading Get help, but uses the named 32-pt top gap after the header, the rule over the frame. The ios thread records the changes on the rows. The next brief asks Claude Design to confirm the denial title role and top gap.
- **Second reviewer:** The measurements are right:
- 'Club unavailable' goes from 32 pt at baseline 168 to 25 pt at 184;
- the access-lost title lines move to 184 and 214;
- Get help moves from x=166.26 at baseline 736 to x=20 at 732;
- the button moves from y=644 to 638.

With Arimo metrics, the title line box starts about 65 pt below the wordmark's bottom (y≈95), or 71 pt below the club-header text. H01-confirm-days is at about 33, which matches homeContentTopAfterHeader 32.

But the action, building the denial 'as delivered', conflicts with the named 32-pt value the finding itself cites. The rule wins over the frame.

### V-10 · should · app · adjusted

- **State:** G05-schedule-choose-own, G05-schedule-review, F01 frames, H01-confirm-days, G04-change
- **Rule:** Spacing values the delivery names (handoff6.spacing and changeRows):
- hoursToReviewRow 24, friendsSubtitleToDrafts 24, homeTitleToBody 24;
- helpToFirstRow 16, changePersonRowPitch 48, personRowMinimumHeight 48.

'Gaps measure line-box edges, not baselines.'
- **Finding:** Several named gaps don't reproduce from the frames:
- G05: hours to the Choose or Review row is about 30, named hoursToReviewRow 24.
- F01: subtitle to Private drafts is about 30, named 24, and 14 pt looser than handoff 3.
- H01-confirm-days: title to body is about 35, named homeTitleToBody 24, and 15 pt looser than handoff 5.
- G04-change: the future person groups sit at a 66-pt pitch, named changePersonRowPitch 48.

Snapshots built to the contract will differ by about 6 to 18 pt. G04's help-to-row gap (about 16) matches.
- **Evidence:** Baselines and edges:
- G05-schedule-choose-own: hours at 205, Choose rect y=239.
- G05-schedule-review: hours at 205, row y=239 (handoff 5: 210 and 232).
- F01: subtitle at 182, drafts rect y=218 (handoff 3: 188 and 210).
- H01-confirm-days: title at 151, body at 210 (handoff 5: 168 and 212).
- G04-change: 'Ben · You' 631, 'Debby' 697, 'Maya' 763 (handoff 5: 498, 546, 594).
- G04-conflict-three: help at 260, first row at 280.
- 'Gaps measure line-box edges, not baselines.'
- **What the app does, and who acts:** Meanwhile the app builds the named values (rule over frame), with minimums growing at Dynamic Type, and lists the snapshot deltas in the PR. The next brief asks Claude Design to confirm the values or correct the frames.
- **Second reviewer:** Each figure checks out with Arimo's metrics (ascent 1854, descent 434, 2048 upm):
- G05-schedule-choose-own and G05-schedule-review: hours box bottom ≈209.5 to the row at 239, about 30, named 24.
- F01: subtitle box bottom ≈187.6 to the drafts card at 218, about 30, named 24. Handoff 3 had about 16.
- H01-confirm-days: title box bottom ≈157.4 to body top ≈192.6, about 35, named 24. Handoff 5 had about 20.
- G04-change: future groups at 631, 697 and 763, a 66 pitch, named 48.
- G04 help to the first row is about 16, as named.

But the finding's comparison of G05 with G04's 16 isn't like for like, because G05's own named value is 24. G05 is off by about 6, not 14.

### V-11 · should · app · confirmed

- **State:** G04-confirm-refused
- **Rule:** - Spec 24: 'error messages name the failed action'.
- Book p26: native focus order and accessible status.
- T47: every state has a spoken form.
- **Finding:** The refusal appears after a failed tap but has no spoken form: no announcement and no focus rule. It is drawn as 13-pt secondary text in place of the help line. A VoiceOver user who tapped Confirm Friday gets no feedback.
- **Evidence:** - screen-copy G04-confirm-refused semanticGroups: calendarContext, the day rows and SundayRow.
- Drawn: 'Couldn’t confirm Friday. This day is contested. Your choice is' and 'kept.', 13 regular #607067, baselines 252 and 270.
- copy handoff6.calendar.contested.refused.
- Components: only spacing.refusalToFirstRow 8.
- **What the app does, and who acts:** Meanwhile the app posts one VoiceOver announcement with the calendar.contested.refused text when the confirmation is refused, and puts the line in reading order after the explanation. The next brief asks Claude Design to confirm the spoken form.
- **Second reviewer:** Verified. screen-copy G04-confirm-refused semanticGroups holds calendarContext, the day rows and SundayRow only. The refusal is drawn as 13-pt #607067 text at baselines 252 and 270. copy handoff6.calendar.contested.refused exists. The component contracts mention it only as spacing.refusalToFirstRow 8, with no announcement or focus rule. Handoff 3's raceFailure also gives no spoken form.

### V-12 · note · founder · adjusted

- **State:** F01-unavailable, M01-access-lost, H01-confirm-days
- **Rule:** - Book p5: 'An interchangeable shell … could be reskinned into a finance or wellness app'; 'Build around a particular object and rhythm.'
- CLAUDE.md: 'A screen that could be reskinned into any other app is wrong (book p5)'.
- 2.1 E01-unavailable carries its state in a surface card with a glyph.
- **Finding:** H01-confirm-days, F01-unavailable and M01-access-lost use only a title, a sentence, a button and, on the denials, a link. H01-confirm-days falls under FQ53, which is open with the Default 'as delivered'. The denials can't show club objects by rule.
- **Evidence:** - F01-unavailable drawnText: '+ Add', 'Club unavailable', 'This club isn’t available right now.', 'Choose a club', 'Get help'.
- M01-access-lost: 'This club is no longer', 'available.', 'Choose a club to continue.', 'Choose a club'.
- H01-confirm-days: 'The club’s days', 'Your club’s next scheduled day will appear', 'here.', 'Private drafts', 'Choose your day'.
- QUESTIONS (PR #13) FQ53, Default: as delivered.
- **What the app does, and who acts:** Meanwhile the app builds them as drawn. The ios thread notes the redrawn H01-confirm-days beside FQ53. Nothing for Claude Design unless the founder answers FQ53 otherwise.
- **Second reviewer:** The screens are plain, as described. But plainness is already the founder's open call:
- FQ53 ('Plain screens. The waiting and paused Homes show none of the book's objects', Default 'as delivered') covers H01-confirm-days.
- The handoff 5 review concluded that the denial screens are plain because T9 and T24 forbid any club object there, so asking Claude Design about them repeats a question the rules answer.
- 2.1's E01-unavailable is a video-playback failure, not a club denial, so it isn't a model here.

Nothing goes to Claude Design unless the founder answers FQ53 otherwise.

### V-13 · note · none · confirmed

- **State:** G04-confirm-refused
- **Rule:** handoff6.calendar.contested.people '{chooserNameList}' uses 'Name · You for the viewer'. Book p34: one shape per meaning.
- **Finding:** When the viewer comes last in roster order, the self marker lands at the end of the list ('Ben and Debby · You'). It can read as if both are 'You'. It is unambiguous when the viewer comes first ('Ben · You, Alex and Debby').
- **Evidence:** - G04-confirm-refused.svg: 'Ben and Debby · You', 17 bold, x=36, baseline 587.
- G04-conflict-three: 'Ben · You, Alex and Debby'.
- VO label: 'Friday. Contested. Ben. Debby, you. Your choice.'
- **What the app does, and who acts:** Nothing needed now. The app builds the template as delivered. A later brief may ask whether the viewer leads the visible list.
- **Second reviewer:** Verified. G04-confirm-refused draws 'Ben and Debby · You' in 17 bold at x=36, baseline 587, for viewer Debby. G04-conflict-three draws 'Ben · You, Alex and Debby'. The template is calendar.contested.people '{chooserNameList}', and the VO label 'Friday. Contested. Ben. Debby, you. Your choice.' is clear.

### V-14 · note · app · confirmed

- **State:** F01 frames, M01-access-lost (tab bar)
- **Rule:** Handoff 3 sheet: 'Native TabView selection uses the system filled symbol and a persistent label.'
- **Finding:** The selected Friends and Memories tab icons are drawn as outlines in action ink. The selected Home icon is filled, and handoff 3 drew the selected Friends icon filled.
- **Evidence:** - Handoff 6 F01-friends: <circle ... fill="none" stroke="#284CDB"/>.
- Handoff 3 F01-friends: <circle ... fill="#284CDB" stroke="#284CDB"/>.
- M01-access-lost: <rect ... fill="none" stroke="#284CDB"/>.
- H01-confirm-days: Home path fill="#284CDB".
- **What the app does, and who acts:** Nothing needed in design. The app uses the native TabView with the .fill symbol variants, so every selected tab is filled.
- **Second reviewer:** Verified:
- handoff 6 F01-friends selected Friends icon: circles fill='none' stroke='#284CDB';
- handoff 3 F01-friends: circles fill='#284CDB';
- M01-access-lost Memories: rect fill='none' stroke='#284CDB';
- H01-confirm-days Home path: fill='#284CDB'.

The handoff 3 sheet carries the filled-symbol rule.

### V-15 · note · app · confirmed

- **State:** G05-local-times (redraw)
- **Rule:** Brief: a redraw keeps everything else as it was. IMPLEMENTATION gives the reason as '(open occurrence first)'.
- **Finding:** The G05-local-times redraw also changes the sheet header, which IMPLEMENTATION doesn't mention:
- the title moves from an inline 17-bold title beside Done to a 25-bold title under a Done-only row;
- 'Sunday people' drops from 17 bold primary to 13 regular secondary.

G05-local-times-same-zone uses the new form.
- **Evidence:** - Handoff 5: 'Times in your time zone' scale 0.0083008 at baseline 105; Done at 105; 'Sunday people' 0.0083008 #182B25 at 147.
- Handoff 6: Done at 99; title 0.0122070 at 143; 'Sunday people' 0.0063477 #607067 at 177.
- **What the app does, and who acts:** Nothing blocking. The app builds the handoff 6 sheet with a native large-title layout, and the ios thread notes the change on the row.
- **Second reviewer:** Verified. Handoff 5 G05-local-times: 'Times in your time zone' 17 pt at baseline 105, beside Done at 105; 'Sunday people' 17 pt #182B25 at 147. Handoff 6: Done at 99; title 25 pt at 143; 'Sunday people' 13 pt #607067 at 177. G05-local-times-same-zone uses the new form. IMPLEMENTATION gives the redraw reason only as 'open occurrence first'.


**Found by the second reviewer**

### VM-01 · note · app · found in review

- **State:** G05-club-details-paused
- **Finding:** The new 'Invite someone' row is a single-line row drawn with its text near the top and its chevron below centre. The text sits about 5 pt above the row's centre and the chevron about 8 pt below it. Every other row on the screen centres its chevron. This contradicts the delivery's own single-line rule ('Vertically centered, not baseline at top'), the defect the brief asked to fix for day rows.
- **Evidence:** - G05-club-details-paused.svg: separators at y=281 and 331, so the row is 282 to 331 (centre ≈306.5). screen-copy rect [20,282,353,50].
- 'Invite someone' 17 pt at baseline 307: line box ≈290 to 312, centre ≈301.
- Chevron translate(355 305) scale(0.75), an 18-pt glyph spanning 305 to 323, centre 314.
- Members row 216 to 281 (centre 248.5) with its chevron at translate(355 239), centre 248.
- handoff6.dayChoiceRow.singleLineAlignment: 'Vertically centered, not baseline at top of a 64-point blank row.'
- **What the app does, and who acts:** Meanwhile the app builds the row as a native List row with the title and chevron vertically centred, and the ios thread notes the difference on the G05-club-details-paused row.

### VM-02 · note · app · found in review

- **State:** G04-confirm-refused
- **Finding:** The two-line refusal is squeezed. Its line box touches the explanation above it (about −1 pt, where help sits about 7 pt below the explanation on G04-conflict-three; instructionToHelp is named 4). It ends about 5.5 pt above the first row, against the named refusalToFirstRow 8. The refusal reads as crammed against the explanation.
- **Evidence:** Arimo metrics (ascent 1854, descent 434, 2048 upm):
- Explanation 'The proposed days overlap on Friday.' 17/23 at baseline 234: box bottom ≈239.6.
- Refusal 13/18 first line at baseline 252: box top ≈238.5. Second line 'kept.' at 270: box bottom ≈274.5.
- First row rect [20,280,353,48].
- G04-conflict-three: help at baseline 260 (top ≈246.5), first row at 280.
- handoff6.spacing.instructionToHelp 4; refusalToFirstRow 8.
- **What the app does, and who acts:** Meanwhile the app lays out the refusal with the named values (4 above, 8 below, growing at Dynamic Type) and lists the snapshot delta in the PR.

### VM-03 · note · app · found in review

- **State:** G04-change (redraw)
- **Finding:** The redraw pushes most of the proposed change below the pinned footer. Debby's and Maya's future groups and the SundayRow are hidden, so the frame no longer shows Maya's new Wednesday and Saturday (the change being confirmed). It also doesn't visibly show the SundayRow left edge the brief asked about: that answer exists only in coordinates and in changeRows. Handoff 5's frame showed all groups and Sunday. The loose 66-pt group pitch (V-10) adds to it.
- **Evidence:** - Handoff 6 G04-change.svg: 'Debby' at baseline 697, 'Maya' 763, 'Sunday' 858 (frame height 852).
- Footer: 'Current days continue until the change is confirmed.' at 715; button rect y=760, h=50.
- The PNG shows only 'Ben · You / Monday and Thursday · Unchanged' under 'From Monday, November 16, 2026'.
- Handoff 5 G04-change: Maya at 594, Sunday at 648 (x=36), all above the button at 755.
- handoff6.changeRows SundayContentLeading 20.
- IMPLEMENTATION: 'the frame therefore wraps preserved dates and scrolls rather than shrinking them.'
- **What the app does, and who acts:** Meanwhile the app builds the scrolling list under the pinned footer with the named 48-pt person pitch and Sunday at x=20 (changeRows). It snapshots both the top and the scrolled-to-end states, so the future groups and Sunday are checked.


## Consistency, file integrity, inventory and questions

**Summary.** The pack is internally sound on most of what this lens checks, but it has one must-fix and several gaps the inventory and QUESTIONS.md need to handle.

**What checks out:**
- **handoff6.replaces:** all 143 earlier keys it names exist, and so do their targets. Every chain resolves in one step, and provenance matches the map. README's rule ("Resolve handoff6.replaces before handoff5.replaces, including when both name the same earlier key") agrees with the brief's Return.
- **Component replacements:** none drops a handoff 5 field, except waitingHero.allTextToken, which is replaced on purpose. The upper 6,880 points of brand-components are pixel-identical to handoff 5's sheet.
- **Consistency between frames:**
  - Week labels agree between G04's summary and G05.
  - The contested row is consistent across G04-conflict-three, G04-conflict and G04-confirm-refused.
  - The review row agrees across G04-change, G05-schedule-review and the sheet.
  - The two travelling Homes share one instant, one countdown and one plaque.
  - The three Friends frames keep roster order.
  - The four denied frames share one layout.
- **Validation report:** its dates, DST, contrast, target and hash claims hold when recomputed, and the manifest's fixture data matches the drawn text.

**The one must-fix:** the redraws and the sheet draw "Proposed" day rows with no selector. The contract, the screen-copy and handoff 5's chosen G04-one-day all have an empty, selectable circle there.

**Should-fixes:**
- Kept dates contradict each other. The frame stacks them with years, the contract joins them with a middle dot, and the example has no year.
- The replacement list is still incomplete (56 identical-text keys, plus several reworded ones), and calendar.assigned matches no frame.
- G06-switcher-unavailable keeps "Club details" for a suspended selected club, and nothing says what it opens.
- Two redraws change more than they say: the F01-friends zone footer and the size of the denied titles. G05-local-times moves to a new moment, with Debby's Friday open.

**For the inventory:** PR #13's file has none of the handoff 5 or handoff 6 names. It needs handoff 5's renames first, then 14 states set to received from handoff 6, then 12 rows updated for the redraws. G04-contested-other needs its own row, apart from G04-conflict-others. Six states described only in writing need rows or notes.

**For QUESTIONS.md:** it needs FQ79's exact reading ("equality qualifies", elapsed time, DST), FQ2's 4 November answer, and the first-days and clash readings. Two questions go to the founder:
- whether FQ79 applies to a membership change's new days;
- what leaving does for a paused club's last member.


**What checks out**

- **handoff6.replaces keys and targets exist.** Every one of the 143 earlier keys exists in copy-contracts.json, and so does every target. No target is itself replaced, so each chain resolves in one step. All 71 handoff5.replaces keys are re-listed under handoff6, with the Wednesday and Saturday change rows mapped to handoff5.change.proposedRow.new.vo as the brief asked. Provenance agrees with the map in both directions.
- **README precedence vs the brief's Return.** Consistent. README says "Resolve handoff6.replaces before handoff5.replaces, including when both name the same earlier key". The brief says "Where handoff6.replaces and handoff5.replaces name the same earlier key, handoff 6's wins." copy-contracts.json handoff6.precedence says the same.
- **Component replacements lose no earlier rule.** Every field of handoff5.dayChoiceRow, choiceRules, firstDays, changeRows, weekRows, localTimesSheet, travellingRows, switcherStatus, deniedHeader and spacing is still present under handoff6. waitingHero drops only allTextToken, which plaqueInk, avatarInk and otherText replace on purpose. The scopes keep noLock and largest-text stacking for dayChoiceRow, and nextDates, nextUp and contentSignals as false for weekRows, as the brief asked.
- **brand-components keeps the whole handoff 5 sheet.** The PNG's top 2400x13760 pixels are pixel-identical to handoff 5's brand-components.png: ImageMagick's compare finds 0 different pixels. Handoff 6 adds 2,800 points below.
- **G04 vs G05 week labels.** They agree. G04-confirmed-many, G05-schedule, G05-schedule-review and G05-schedule-choose-own all speak "{weekday}. {personSpeech}. Confirmed." for an assigned day, for example "Monday. Ben, you. Confirmed.", and "{weekday}. No reveal scheduled." for an empty one. The picker's rows keep "... Confirmed. Taken."
- **Contested row across G04-conflict-three, the G04-conflict redraw and G04-confirm-refused.** Consistent:
- the names are in stable roster order: "Ben · You, Alex and Debby", "Ben · You and Debby" and "Ben and Debby · You";
- each person is spoken as a sentence, as in "Friday. Contested. Ben. Debby, you. Your choice.";
- all three use the same hint, "Your current choice is contested. Choose another day to change it.";
- Confirm Friday is disabled in all three, with the same hint;
- the row is 88 points high in all three.

The non-chooser's form on G04-contested-other matches dayChoiceRow.contestedOther.
- **G04-change vs G05-schedule-review vs the sheet's review rows.** They agree:
- "Proposed from Monday, November 16, 2026" appears on all three, with its year;
- the zone comes first, then the hours, on all three;
- the pair's current days (Ben on Monday and Thursday, Debby on Tuesday and Friday) match G04-change's kept groups;
- the sheet's "Your confirmation is saved." variant uses handoff6.change.review.confirmed.
- **H01-travelling vs H01-travelling-dateline.** Both frames share:
- server_now 2026-11-07T06:01Z and next_reveal_at 12:00Z;
- the countdown "5h 59m";
- the plaque SAT 07 and the occasion "Nina's Saturday";
- the waiting-group template and the Add hint template.

Only the date lines differ, as travellingRows.differentDates allows.
- **F01-friends vs F01-friends-first-days vs F01-friends-travelling.** All three keep the order Ben, Maya, Alex, Sam, Debby, Nina, with Nina "Next up". "Ben · You" and See schedule (at [20,713,353,44]) are in the same place in all three. The rows without an occurrence are 52 points high and have no control. Each travelling row's local date and club date match the zone arithmetic.
- **Denied states across tabs.** H01-unavailable and F01-unavailable draw the title and body at identical positions. So do H01-access-lost and M01-access-lost. All four use the same header: wordmark, + Add with the hint "Save a private draft or open private drafts.", and Account. Each has exactly one Choose a club control. G06-switcher-unavailable sits over that same denied Home.
- **Dates and DST.** I checked 217 weekday-and-date pairs across the pack and the PDF; none is wrong. The FQ79 cases are right: confirmation at 9 AM EST on Wednesday 4 November; Thursday 5 November at 7 AM is 22 hours later, so the first Thursday is 12 November; Saturday 7, Tuesday 10 and Wednesday 11 November are first dates. Auckland is NZDT, 13 hours ahead of UTC, and New York EST, 5 hours behind, so the difference is 18 hours. London is on GMT. Sunday 1:01 AM to Monday 7 AM is 29h 59m. The G05-local-times status bar, 2:41 PM London, is 9:41 AM in New York on 6 November.
- **Contrast, targets and hashes in validation-report.json.** All 22 contrast pairs, recomputed from brand-tokens.json, match within 0.01. I sampled the sheet's dark waiting card: the plaque's #F7F8F2 on #121D19 is 16.2:1, and the initial's #F7F8F2 on #35463A is 9.4:1. All 175 controls in screen-copy.json are at least 44 points. Every hash in brandHashes matches its file.
- **Frame manifest vs drawn text.** They match:
- firstDates on F01-friends-first-days and F01-friends-travelling;
- server_now, plaqueDate and localOpeningDate on both travelling Homes;
- allOccurrences on both local-times sheets;
- clubName null on the pair's frames;
- activeMemberCount 1, drawn as "1 member" on G05-club-details-paused.


**Findings**

### X-01 · must · claude-design · confirmed

- **State:** G04-one-day (redraw), G04-conflict-three, G04-contested-other, G04-confirm-refused, brand-components (handoff 6 day-choice specimen)
- **Rule:** handoff6 dayChoiceRow.otherProposed: "Name plus existing proposedMemberTag (…); empty selector."

handoff6 choiceRules.taken: "Other proposals are selectable and become contested."

The FQ48 Default in the brief: "A day only proposed for someone can still be chosen."

FQ2: the founder chose handoff 5's G04-one-day, which draws the selector.
- **Finding:** Every 'Proposed' row in the handoff 6 frames, and the sheet's 'Tuesday · Maya · Proposed' specimen, has no selection circle. The contract says those rows have an empty selector, and screen-copy makes them enabled controls. Available rows and the contested row for someone who didn't choose it do have the empty circle. So the frames make proposed days look as if they can't be chosen. That contradicts the contract, the FQ48 Default and the handoff 5 screen the founder chose (FQ2).
- **Evidence:** Handoff 6 G04-one-day draws Tuesday to Saturday as name plus a 'Proposed' tag, with no circle. Handoff 5's G04-one-day draws an empty circle on each of those rows.

screen-copy G04-one-day: 'Tuesday | label: Tuesday. Maya. Proposed. Can be chosen. | hint: Choose Tuesday. | enabled: true'.

On G04-contested-other, Friday (contestedOther) has an empty circle, and Tuesday and Saturday (Proposed) have none.

handoff6.dayChoiceRow.otherProposed: 'Name plus existing proposedMemberTag (...); empty selector.'
- **What the app does, and who acts:** Meanwhile the app builds the contract: a native empty selection circle on every proposed row, which can be chosen, with the label and hint from screen-copy.

The snapshot review lists this as a difference from the frames. The next brief asks Claude Design to redraw G04-one-day, G04-conflict-three, G04-contested-other, G04-confirm-refused and the sheet's proposed specimen with the selector. The ios thread notes it on those inventory rows and under FQ2.
- **Second reviewer:** Checked G04-one-day (handoff 6 and handoff 5 PNGs), G04-contested-other, the contact sheet for G04-conflict-three and G04-confirm-refused, and the sheet's 'Handoff 6' day-choice specimens. No proposed row and no proposed specimen has a selection circle. Available rows and contestedOther do have one, and handoff 5 drew an empty circle on every proposed row. Meanwhile dayChoiceRow.otherProposed says 'empty selector', choiceRules.taken says 'Other proposals are selectable', and screen-copy makes these rows enabled controls labelled 'Can be chosen.'

### X-02 · should · claude-design · confirmed

- **State:** G04-change (redraw); handoff6 change.keptDates
- **Rule:** handoff6 changeRows.keptDates: "Visible list uses a middle dot between dates; AX5 stacks dates in same person group."

IMPLEMENTATION: "Proposed starts, preservation boundaries and kept announced dates always carry the year."

The brief's Return asked for kept-date templates, shown and spoken, for any number of dates.
- **Finding:** The three sources for the kept dates disagree:
- the frame puts each date on its own line, with its year and no middle dot, at the default text size;
- the contract joins the dates with a middle dot;
- the contract's own example has no years and doesn't stack.
- **Evidence:** G04-change drawnText: 'Ben · You | Monday, November 9, 2026 | Thursday, November 12, 2026 | Debby | Tuesday, November 10, 2026 | Friday, November 13, 2026'. There is no '·' between the dates.

handoff6.examples.keptDates value: 'Monday, November 9 · Thursday, November 12'.

travellingRows.targetYear: 'Always include year in proposed start/boundary/preserved-announced dates and their VO'.
- **What the app does, and who acts:** Meanwhile the app writes every kept date with its year, and joins the visible list with a middle dot as changeRows.keptDates says, letting it wrap. It speaks the list as handoff6.change.preservedRow.vo. It never uses the example value.

The next brief asks Claude Design for one form at the default text size (stacked or dot-joined) and a corrected example.
- **Second reviewer:** G04-change.png draws each kept date on its own line, with its year and no middle dot. handoff6.changeRows.keptDates says 'Visible list uses a middle dot between dates; AX5 stacks dates'. handoff6.examples.keptDates is 'Monday, November 9 · Thursday, November 12', with no year, against travellingRows.targetYear ('Always include year in ... preserved-announced dates'). Handoff 5 drew the dot-joined form, so the frame is the one that changed.

### X-03 · should · claude-design · confirmed

- **State:** copy-contracts.json, handoff6.replaces
- **Rule:** The brief's Return: "Under handoff6.replaces, complete handoff 5's replacement list … name every earlier key a handoff 5 or handoff 6 key takes over."

The handoff 5 check's W-04 found that 51 strings take over earlier keys without naming them.
- **Finding:** The replacement list covers the prefixes the brief named, but it is still incomplete:
- 56 earlier handoff 3 and 4 keys have exactly the text of a handoff 5 or 6 key and appear in neither replaces map;
- several reworded takeovers are unnamed too, including two that the handoff 5 check's W-04 had already named;
- handoff 6 repeats the pattern itself, with seven 'new' keys that take over handoff 3 and 4 keys.
- **Evidence:** Unmapped, though handoff 5 takes them over:
- handoff3.G05.schedule.localSheet.clubValue ('{clubOpenFullDateTime} to {clubCloseFullDateTime} · {clubZoneName}') and .localValue, by handoff5.local.opens and local.closes;
- handoff3.G04.change.currentThrough, the same text as handoff6.change.before.

Other unmapped takeovers:
- handoff3.H01.unavailable.help.vo ('Get help with club access.'), though its sibling H01.unavailable.choose.vo is mapped;
- handoff3.F01.schedule.vo ('See schedule for Sunday people.');
- handoff3.G04.change.newFrom ('New week from {fullStartDate}');
- handoff3.F01.you (' · You').

handoff6.provenance marks friends.title, friends.subtitle, friends.schedule, friends.schedule.hint, details.drafts, details.drafts.hint and change.review.confirmed as kind 'new' with replaces []. change.review.confirmed is the same text as handoff3.G04.change.saved.title.
- **What the app does, and who acts:** Meanwhile the app takes each screen's words from handoff 6's screen-copy.json and the handoff6 keys, falling back to handoff5. It treats every earlier key that a handoff 5 or 6 key takes over as historical, as the handoff 5 check's W-04 rule says. The ios thread lists these extra mappings in INVENTORY.md.

A later pack completes the map.
- **Second reviewer:** Recomputed it. Exactly 56 handoff 3 and 4 leaf keys have the same text as a handoff 5 or 6 key and are in neither replaces map. handoff3.G05.schedule.localSheet.clubValue and localValue, H01.unavailable.help.vo, F01.schedule.vo, G04.change.currentThrough, G04.change.newFrom and F01.you are all unmapped, while H01.unavailable.choose.vo is mapped. friends.title, friends.subtitle, friends.schedule, friends.schedule.hint, details.drafts, details.drafts.hint and change.review.confirmed are all marked kind 'new' with replaces []. The validation check is CompleteRequestedLegacyPrefix, which covers only the requested prefixes. W-04 had named clubValue/localValue and currentThrough, and they are still unmapped.

### X-04 · should · claude-design · confirmed

- **State:** G04 day-choice rows (all pickers)
- **Rule:** The brief's Return: "put new and replacement entries under handoff6 … naming the earlier key each one replaces". A replacement has to match what the frames draw.
- **Finding:** handoff6.calendar.assigned ('{personName} · Confirmed') replaces handoff3.G04.conflict.assigned. But no frame draws a one-line 'Name · Confirmed': every confirmed row draws the name, with a check and 'Confirmed' on the line below. No component contract refers to calendar.assigned. So the replacement map points at a string that nothing renders.
- **Evidence:** copy-contracts handoff6.replaces: 'handoff3.G04.conflict.assigned': 'handoff6.calendar.assigned'. handoff6.calendar.assigned = '{personName} · Confirmed'.

G04-two-days-one-chosen drawnText: 'Tuesday | Debby | Confirmed'.

dayChoiceRow.otherConfirmed: 'Surface fill; owner; check plus Confirmed.'
- **What the app does, and who acts:** Meanwhile the app draws the two-line form: the person, then the check and handoff5.calendar.state.confirmed. It never renders calendar.assigned.

The next pack either deletes the mapping or points it at calendar.state.confirmed.
- **Second reviewer:** handoff3.G04.conflict.assigned is '{name} · Assigned', the one-line form handoff 3 drew ('Maya · Assigned'). handoff6.replaces sends it to handoff6.calendar.assigned = '{personName} · Confirmed'. No handoff 6 frame or screen-copy string contains '· Confirmed'. The only references to calendar.assigned are in copy-contracts and validation-report. The component contract (dayChoiceRow.otherConfirmed) and every frame use the two-line name, then check and Confirmed. The handoff 5 check rated a similar wrong map target (W-03) as should.

### X-05 · should · claude-design · confirmed

- **State:** G06-switcher-unavailable
- **Rule:** Brief item 12: the same neutral denial as Home, with "nothing of the club from the server or the phone's cache (T9, T24)".

handoff6 deniedHeader.allTabs: "no cached club metadata".

T9: one read predicate.
- **Finding:** The sheet keeps 2.1's 'Club details' action while the selected club, Sunday people, is suspended. No contract says what Club details opens for a selected club that is denied. Built as an ordinary G05 Club details, it would show the club's name, member count, rows and schedule, which the neutral denial forbids.
- **Evidence:** screen-copy G06-switcher-unavailable:
- 'Sunday people | label: Sunday people. Unavailable. | traits: [selected] | route: keep selected denied context';
- 'Club details | label: Club details | hint: None | route: native sheet action'.

switcherStatus and deniedHeader don't mention Club details. deniedHeader.allTabs: 'no cached club metadata'.
- **What the app does, and who acts:** Meanwhile the app leaves Club details out of the sheet while the selected club is denied, so it shows nothing of that club. Every request still goes through the read predicate (T9).

The next brief asks Claude Design what the sheet offers for a denied selected club.
- **Second reviewer:** screen-copy G06-switcher-unavailable keeps 'Club details' (route 'native sheet action', no hint), while the selected row, Sunday people, is 'Unavailable' with route 'keep selected denied context'. switcherStatus, deniedHeader and IMPLEMENTATION don't say what Club details opens for a denied selected club. deniedHeader.allTabs forbids cached club metadata only on Home, Friends and Memories. Nothing is drawn behind the action, so the gap is real, though what it would show is unspecified rather than certain.

### X-06 · should · app · confirmed

- **State:** F01-friends (redraw), H01-unavailable (redraw), H01-access-lost (redraw)
- **Rule:** The brief: "A redraw keeps everything else in the earlier frame as it was." IMPLEMENTATION gives the redraws' reasons as "F01-friends (spacing)" and "H01-unavailable and H01-access-lost (one chooser and neutral header)".
- **Finding:** Two redraws change things their stated reasons don't cover:
- F01-friends drops handoff 3's 'New York' zone line beside See schedule, so at home Friends shows times with no zone (handoff 3's F01-friends-dark still has the line);
- H01-unavailable and H01-access-lost draw the title smaller and lower than handoff 5 did, and no contract names the denied title's type role.
- **Evidence:** Handoff 3 F01-friends drawnText: '... Next up | New York | See schedule ...'. F01-friends-dark has the same. Handoff 6 F01-friends: '... Next up | Saturday, November 7 · 7 AM | See schedule ...'.

Title ink runs in points:
- H01-unavailable: handoff 5, 145.0 to 168.0; handoff 6, 166.0 to 184.0;
- H01-access-lost: handoff 5, 145.0 to 174.5; handoff 6, 166.0 to 189.0.

F01-unavailable and M01-access-lost match handoff 6.
- **What the app does, and who acts:** Meanwhile the app builds handoff 6's F01 without the zone line. The row's VoiceOver label still carries the zone, and neither spec 09 nor 2.1's F01 has the line. It draws all four denied titles in handoff 6's one style.

The ios thread notes that F01-friends-dark predates the redraw. The next brief asks Claude Design to confirm both changes and name the denied title's type role.
- **Second reviewer:** Handoff 3's F01-friends and F01-friends-dark drawnText both have 'New York' beside See schedule, and handoff 6's F01-friends doesn't. I measured title ink runs from the 2x PNGs (points): handoff 5 H01-unavailable 145.0 to 168.0, handoff 6 166.0 to 184.0; handoff 5 H01-access-lost 145.0 to 174.5, handoff 6 166.0 to 189.0. Handoff 6's F01-unavailable and M01-access-lost match handoff 6's H01 frames. IMPLEMENTATION gives the reasons as 'F01-friends (spacing)' and 'one chooser and neutral header' only.

### X-07 · note · app · adjusted

- **State:** G05-local-times (redraw)
- **Rule:** The brief: "A redraw keeps everything else in the earlier frame as it was." The open-occurrence-first sheet was asked for "In writing" (item 9).
- **Finding:** The redraw moves G05-local-times to a different moment. Handoff 5 drew Ben in London before Nina's day opened. Handoff 6 draws Ben in London during Debby's open Friday, which is listed first as 'Open now'. The manifest records no moment, and the status bar's 2:41 fits either Friday afternoon or early Saturday. So the inventory's G05-local-times row now shows the open-day variant, and handoff 5's frame is the only render of the sheet with no open day while travelling.
- **Evidence:** Handoff 5 G05-local-times drawnText: '9:41 | Times in your time zone | Done | Sunday people | Nina's Saturday ...'.

Handoff 6: '2:41 | Done | Times in your time zone | Sunday people | Debby's Friday | Open now | ...'.

The manifest's allOccurrences has Debby openNow: true, reveal_at 2026-11-06T07:00:00-05:00, close_at 2026-11-07T01:00:00-05:00, deviceZone Europe/London, and no moment field.

IMPLEMENTATION: 'the redrawn London sheet begins with Debby's open Friday, November 6'.
- **What the app does, and who acts:** The ios thread sets G05-local-times's notes to: 'handoff 6: travelling (London) during Debby's open Friday; open occurrence first; the moment isn't recorded (status bar 2:41)'. It keeps handoff 5's frame in claude-design/handoff-5/ as the reference for the sheet with no open day. No new frame is needed.
- **Second reviewer:** True that the redraw moves G05-local-times to a moment during Debby's open Friday. Handoff 5 drew it at 9:41 with Nina's Saturday first; handoff 6 draws it at 2:41 with 'Debby's Friday | Open now' first. The manifest records deviceZone Europe/London but no moment. One part of the finding is wrong: a London status bar of 2:41 during Debby's open day can be Friday at 2:41 PM or Saturday at 2:41 AM (before 6 AM London), so 'Friday 6 November at 2:41 PM, 9:41 AM New York' is a guess. Also, the brief told Claude Design to resend any earlier frame its answers change, so the redraw is not a defect. This is bookkeeping, so the severity is note.

### X-08 · should · app · confirmed

- **State:** INVENTORY.md: the 14 states handoff 6 delivered
- **Rule:** The brief's founder report, section 5. The handoff 5 check, section 8: rename PR #13's rows to handoff 5's titles and add rows, deleting none (ADR-020).
- **Finding:** PR #13's INVENTORY.md has none of the handoff 5 or handoff 6 names. The 14 requested states have arrived, so each needs a row set to received:
- G04-conflict-three, G04-contested-other, G04-confirm-refused, G04-two-days-one-chosen, G04-confirmed-many;
- G05-schedule-choose-own, F01-friends-first-days, G05-local-times-same-zone;
- H01-travelling-dateline, F01-friends-travelling, F01-unavailable, M01-access-lost;
- G06-switcher-unavailable, G05-club-details-paused.

To avoid duplicates, these go in after handoff 5's renames and additions.
- **Evidence:** In PR #13's INVENTORY.md, grep finds 0 rows for each of the 14 names. It also finds 0 for H01-confirm-days, G04-confirmed-others, G06-switcher-status, H01-unavailable, H01-access-lost, H01-travelling and G05-schedule-review.

Only the older names exist: H01-suspended, H01-lost-access, H01-days-unconfirmed, G06-labels, G05-review-days and G04-conflict-others.
- **What the app does, and who acts:** In the design PR after #13, the ios thread first applies the handoff 5 check's section 8: the seven renames, the added rows, and the notes on G04-conflict and G06-switcher-status as pointers to G04-contested-other and G06-switcher-unavailable.

Then it sets these 14 rows to received at B2, with render screens/<name>.png, source 'Handoff 6' and the fixture each one uses. Finally it updates the Counts section.
- **Second reviewer:** Grepped PR #13's INVENTORY.md. Each of the 14 delivered names has 0 rows, and so do H01-confirm-days, G04-confirmed-others, G06-switcher-status, H01-unavailable, H01-access-lost, H01-travelling and G05-schedule-review. Only the older names exist: H01-suspended, H01-lost-access, H01-days-unconfirmed, G06-labels, G05-review-days and G04-conflict-others.

### X-09 · should · app · confirmed

- **State:** INVENTORY.md: H01-confirm-days and the 11 redraws
- **Rule:** The INVENTORY.md header: "When a state has a render in both screens/ and 2.1/, screens/ wins". The Source column records each render's handoff. The founder's FQ2 answer (4 November) chose handoff 5's day-picking screens.
- **Finding:** Handoff 6 also sends:
- H01-confirm-days, redrawn as the brief asked;
- 11 redraws it wasn't asked for: G04-conflict, G04-one-day, G04-two-days, G04-change, G05-schedule-review, G05-schedule, H01-travelling, H01-unavailable, H01-access-lost, F01-friends and G05-local-times.

Each row's source and render must move to handoff 6. Frames that weren't redrawn still carry words that handoff 6 replaced.
- **Evidence:** frame-manifest.json additionalRedrawOrder lists the 11.

PR #13 rows:
- G04-one-day: '2.1 #03';
- G04-two-days: '2.1 #32';
- F01-friends: 'Handoff 3 (2.1 #07 before)';
- G05-schedule: 'Handoff 3'.

Handoff 5 frames that weren't redrawn:
- G06-switcher-status label: 'Sunday people. Not started. Selected.';
- G04-confirmed-others group: 'Tuesday. Maya, you.', with no 'Confirmed'.
- **What the app does, and who acts:** The ios thread sets the source on these rows:
- H01-confirm-days, G04-change, G05-schedule-review, H01-travelling, H01-unavailable, H01-access-lost and G05-local-times: 'Handoff 6 (5 before)';
- G04-conflict: 'Handoff 6 (5, 3 before)';
- G04-one-day and G04-two-days: 'Handoff 6 (5; 2.1 #03/#32 before)';
- F01-friends: 'Handoff 6 (3; 2.1 #07 before)';
- G05-schedule: 'Handoff 6 (3 before)'.

It notes that G04-confirmed-others, G05-members-proposed and G06-switcher-status keep handoff 5's frames, with handoff 6's words built. G04-confirmed takes its layout from G04-confirmed-many and G04-confirmed-others. X-01's exception goes on the G04 rows.
- **Second reviewer:** frame-manifest additionalRedrawOrder lists exactly the 11 redraws. PR #13 sets G04-one-day to '2.1 #03', G04-two-days to '2.1 #32', F01-friends to 'Handoff 3 (2.1 #07 before)' and G05-schedule to 'Handoff 3'. Handoff 5 screen-copy still has G06-switcher-status 'Sunday people. Not started. Selected.' and G04-confirmed-others 'Tuesday. Maya, you.', both replaced by handoff6 keys.

### X-10 · note · app · adjusted

- **State:** INVENTORY.md: G04-conflict-others vs G04-contested-other
- **Rule:** INVENTORY.md: "Add rows for states you discover; never delete a row." The handoff 5 check's section 8: "G04-conflict-others is G04-confirmed-others".
- **Finding:** The handoff 5 check renames PR #13's G04-conflict-others row ('The other members' view of a clash: no names') to G04-confirmed-others. Handoff 6 now draws G04-contested-other, which is that same view inside the picker. The names differ by one letter, and the old row's description fits both states. Applying the renames needs care so that no row is merged or duplicated.
- **Evidence:** PR #13: '| G04 Schedule proposal | `G04-conflict-others` | The other members' view of a clash: no names | ... | missing | B2 | FQ46. Words only (handoff 3) |'.

The handoff 5 check, section 8: 'G04-conflict-others is G04-confirmed-others'.

The handoff 6 manifest, frame 3: G04-contested-other (Sam's view, Sam not a chooser).
- **What the app does, and who acts:** Keep the handoff 5 check's rename of G04-conflict-others to G04-confirmed-others, with the old name in its notes. Add G04-contested-other as its own row, received from handoff 6. Cross-reference the two in their notes: the contested day without names in the picker, and in the week after confirming. Merge nothing.
- **Second reviewer:** The facts are right. PR #13 has '`G04-conflict-others` | The other members' view of a clash: no names | ... | missing | B2 | FQ46. Words only (handoff 3)'. The handoff 5 check's section 8 says 'G04-conflict-others is G04-confirmed-others'. Handoff 6 frame 3 is G04-contested-other. But the rename is already decided, and nothing in the delivery is wrong: the risk is only a slip when applying it. That is a bookkeeping caution, so the severity is note.

### X-11 · should · app · confirmed

- **State:** States handoff 6 describes only in writing or on the component sheet
- **Rule:** CLAUDE.md, "Native first; you don't design": a state with no render gets a row marked built from spec. INVENTORY.md: "Add rows for states you discover."
- **Finding:** Several states that handoff 6 defines have no phone frame and no inventory row.

Shown only as specimens on the sheet:
- a restored or deep-linked picker with the viewer's read-only confirmed day (ownConfirmed);
- G05's review row after the viewer has confirmed ('Your confirmation is saved.').

Defined only in words:
- the read-only G04-change opened from that review row;
- a countdown of 24 hours or more ('1d 5h 59m');
- M01-unavailable, the same form as F01-unavailable;
- F01-access-lost, the same form as M01-access-lost;
- the local-times sheet at home during an open day;
- Friends while travelling when the local date matches the club's (London).
- **Evidence:** - confirmationNavigation.confirmedOwnRow: 'Defined for picker restored/deep-linked later: read-only check/Confirmed, no selector, edit or action'. Copy: handoff6.calendar.row.ownConfirmed.vo '{weekday}. {personSpeech}. Confirmed.'
- changeRows.reviewAfterOwnConfirm: '... Your confirmation is saved. ... Opens proposal read-only for this revision; do not confirm twice.'
- handoff6.home.countdown.long: '{dayCount}d {hourCount}h {minuteCount}m'.
- IMPLEMENTATION: 'F01-unavailable and M01-unavailable use the suspended explanation; M01-access-lost and F01-access-lost use the access-lost explanation.'
- localTimesSheet.openFirst.
- travellingRows.Friends: '...with full club date when local dates differ'.
- **What the app does, and who acts:** The ios thread adds rows at B2, built from spec:
- G04-own-confirmed, from the sheet's specimen;
- G05-schedule-review-confirmed, from the specimen;
- G04-change-confirmed-review, from handoff 3's saved words and handoff 6's read-only rule.

It marks the M01-unavailable and F01-access-lost rows (added by the handoff 5 check's section 8) 'built from spec, form of F01-unavailable / M01-access-lost (handoff 6)'. It notes the long countdown on H01-waiting and H01-sunday, the open-day variant on G05-local-times-same-zone, and the London same-date variant on F01-friends-travelling.

A later brief may draw G04-own-confirmed and G05-schedule-review-confirmed. Neither is urgent.
- **Second reviewer:** Verified each definition:
- confirmationNavigation.confirmedOwnRow and the sheet's 'Monday · Ben · You · Confirmed' specimen;
- changeRows.reviewAfterOwnConfirm and the sheet's second review-row specimen ('Your confirmation is saved.');
- handoff6.home.countdown.long with the example '1d 5h 59m';
- IMPLEMENTATION's sentence on M01-unavailable and F01-access-lost;
- localTimesSheet.openFirst;
- travellingRows.Friends.

None has a phone frame. PR #13 has no rows for them, nor for M01-unavailable and F01-access-lost, which the handoff 5 check's section 8 adds; X-08 applies that first.

### X-12 · should · app · confirmed

- **State:** docs/QUESTIONS.md: FQ79
- **Rule:** The brief's founder report, section 2: "The ios thread records them in docs/QUESTIONS.md." The handoff 5 check, section 8: add FQ79 with its interim reading, needed by B2.
- **Finding:** PR #13's QUESTIONS.md has no FQ79. Handoff 6 makes the Default an exact server rule:
- it compares instants, not calendar dates;
- the gap is 24 elapsed hours, and exactly 24 qualifies;
- DST comes from the club's IANA zone, so a 23-hour spring day defers the first date a week and a 25-hour autumn day doesn't;
- a first date can therefore move a week later.

The founder hasn't seen these points.
- **Evidence:** handoff6 firstDays.firstOpening: 'First local-calendar date for the confirmed weekday whose server-resolved 07:00 club instant is >= confirmed_at + 24 elapsed hours. Equality qualifies; never compare only calendar dates. Resolve DST through club IANA zone.'

validation-report checks: FQ79Exactly24Qualifies, FQ79OneSecondShortDefers, FQ79Spring23HourWallDayDefers, FQ79Fall25HourWallDayQualifies.

defaultsAssessment.FQ79: '...can defer the first date by a week.'
- **What the app does, and who acts:** Add FQ79 ('How soon a newly confirmed day can open') with the brief's Default and handoff 6's exact reading: at least 24 elapsed hours, equality qualifies, instants compared, DST through the club zone. Note Claude Design's comment on the one-week deferral. Needed by: B2.

Write the server tests from it, with fake clocks for exactly 24 hours, one second short, and the spring and autumn DST days.
- **Second reviewer:** PR #13's QUESTIONS.md runs to FQ68 and has no FQ79. handoff6.firstDays.firstOpening and IMPLEMENTATION give the exact reading. validation-report has FQ79Exactly24Qualifies, FQ79OneSecondShortDefers, FQ79Spring23HourWallDayDefers and FQ79Fall25HourWallDayQualifies, all true. defaultsAssessment.FQ79 notes the one-week deferral.

### X-13 · should · app · adjusted

- **State:** docs/QUESTIONS.md: FQ2, FQ46, FQ48 and FQ55
- **Rule:** The brief's founder report, section 2. The handoff 5 check, section 8 (X-04 to X-07): record FQ46, FQ48 and FQ55 as the brief states them, not PR #13's text.
- **Finding:** PR #13's FQ2 records only the 1 November decision. Its FQ46 and FQ55 still say 'only the two members involved' and 'two members'.

Handoff 6 draws the readings that should replace them:
- the members who chose a day, and only they, see names;
- a member who didn't choose a contested day can join it and then sees its names;
- three or more people can share one day;
- the first days' week and Friends (G05-schedule-choose-own, F01-friends-first-days).

It also redraws the two screens the founder picked on 4 November, with a changed look.
- **Evidence:** PR #13:
- FQ46 Default: 'only the two members involved see the clash with names';
- FQ55: 'while two members have chosen the same day'.

handoff6.choiceRules.multiway: 'No chooser can confirm until only one choice remains on a day.'

handoff6.calendar.row.contestedOther.hint: 'Choose {weekday}. You'll then see the people in this contested choice.'

On G04-one-day the own-choice fill changes from handoff 5's surface to cover2, and the diamond becomes the Proposed tag.
- **What the app does, and who acts:** The ios thread:
- records the founder's 4 November answer under FQ2, notes that handoff 6's redraws of G04-one-day and G04-two-days are now the reference, with X-01's exception, and says what changed visually;
- rewrites FQ46, FQ48 and FQ55 as the brief's section 2 states them, with handoff 6's multiway rule and joining rule;
- adds the first-days reading under FQ48.

The check of handoff 6 tells the founder that the screens the founder chose now look different: own choice in cover2, Proposed as a tag, and no selector on proposed rows (X-01).
- **Second reviewer:** The facts are right. PR #13's FQ2 records only the 1 November decision. FQ46 says 'only the two members involved see the clash with names', and FQ55 says 'while two members have chosen the same day'. Handoff 6 has choiceRules.multiway and the contestedOther joining hint, and the own-choice fill on G04-one-day changed from handoff 5's surface to cover2. But the action referred to the founder with an inferred pronoun, which the rules forbid. The wording is corrected below.

### X-14 · note · app · adjusted

- **State:** G04-change and FQ79
- **Rule:** Spec 04 forbids "an instant first reveal". The FQ79 Default covers "a newly confirmed day". FQ49 covers a change not confirmed by its start date.
- **Finding:** Handoff 6 states FQ79's lead-time rule only under firstDays. A confirmed membership change also brings in new days, such as Maya's Wednesday and Saturday. The brief's Default ('a newly confirmed day') already covers them, but neither file says so. A change whose last confirmation comes less than 24 hours before a new day's first 7 AM needs that reading applied.
- **Evidence:** The brief, item 1: 'Default (FQ79): a newly confirmed day first opens on the first of its dates whose 7 AM, club time, is at least 24 hours after it was confirmed'.

handoff6.firstDays.firstOpening applies to 'the confirmed weekday' in the first days. IMPLEMENTATION: 'for each confirmed weekday, find the first of that weekday's dates whose resolved 07:00 club instant is at least 24 elapsed hours after confirmed_at'.

changeRows.effectiveDatePassed: 'Fresh future version and fresh review, never backdate'. G04-change's proposed start is 'Monday, November 16, 2026', and Maya's new days are 'Wednesday and Saturday'.
- **What the app does, and who acts:** Meanwhile the app applies FQ79 to every newly confirmed weekday, including those a confirmed change adds. A new day's first occurrence is its first date, on or after the change's start, whose 7 AM is at least 24 elapsed hours after the last confirmation, so nothing opens straight after confirming.

The ios thread writes this scope into FQ79's entry so the founder's answer covers it, and adds a server test for a change confirmed less than 24 hours before a new day's first 7 AM.
- **Second reviewer:** True that handoff 6 puts FQ79's rule only under firstDays, and that changeRows says only 'Fresh future version and fresh review, never backdate'. But the claim that no Default covers the case is overstated. The brief's Default is worded for 'a newly confirmed day' (founder report, section 2: 'FQ79. How soon a newly confirmed day can open'; item 1: 'a newly confirmed day first opens on the first of its dates whose 7 AM ... is at least 24 hours after it was confirmed'). That already covers weekdays a confirmed membership change adds, and IMPLEMENTATION states the rule 'for each confirmed weekday'. So this isn't a new founder question. It's a scope line to record under FQ79, and the founder's answer to FQ79 then covers both. The case is narrow too: only a new weekday whose first date falls within 24 hours of the last confirmation (in practice the start date) is affected.

### X-15 · should · claude-design · confirmed

- **State:** C01 recipient picker in the first days (reached from F01-friends-first-days and Home's + Add)
- **Rule:** The brief item 8 Default: a member whose day isn't confirmed shows no date, and nothing that says they haven't confirmed (T15, T33). Spec 09: "Tapping a row opens F02 for the next collecting occurrence."
- **Finding:** F01-friends-first-days routes '+ Add' to the recipient picker, with the hint 'Choose a person and day, or save a private draft.'. Nothing says how C01 shows Ben and Debby, who have no occurrence. friendsRow.noOccurrence covers F01 only, and 2.1's C01 render lists every member with a date.
- **Evidence:** screen-copy F01-friends-first-days control: '+ Add | hint: Choose a person and day, or save a private draft. | route: recipient picker'.

handoff6 friendsRow.noOccurrence.shape: 'Name and avatar only ... no date, status, placeholder, chevron or tap action.'

PR #13 inventory row C01-picker: 'Private draft, then the club's members with dates', B2.
- **What the app does, and who acts:** Meanwhile the app shows a member with no occurrence in C01 the way F01 does: avatar and name only, not selectable, with no added words. The ios thread notes it on C01-picker as built from spec. The next B2 or B4 brief asks Claude Design for the row.
- **Second reviewer:** F01-friends-first-days '+ Add' has hint 'Choose a person and day, or save a private draft.' and route 'recipient picker'. friendsRow.noOccurrence covers only F01. No handoff 5 or 6 contract mentions C01 or a recipient picker row without an occurrence. PR #13 row 114: C01-picker 'Private draft, then the club's members with dates', 2.1 #31, B2.

### X-16 · note · founder · confirmed

- **State:** G05-club-details-paused
- **Rule:** CLAUDE.md: when the sources are silent, add the question to QUESTIONS.md with a default. FQ16 covers the pause; FQ63 covers a leaver's announced days.
- **Finding:** The frame offers 'Leave club' to Kitchen table's only active member. No source or Default says what happens to a club, its Memories or its pending invitations when its last member leaves.
- **Evidence:** screen-copy G05-club-details-paused: 'Leave club | hint: Review leaving Kitchen table. | route: leave confirmation'. The manifest has activeMemberCount: 1.

PR #13 FQ16 Default: 'the club pauses ... An invitation restarts it.' FQ63 covers only a leaver's announced days.
- **What the app does, and who acts:** Add a question, needed by B6 when leaving is built. Its default should be the reversible one: leaving is allowed, the club stays paused with no active member, and nothing is deleted. Nothing in B2 depends on it.
- **Second reviewer:** screen-copy G05-club-details-paused has 'Leave club | hint: Review leaving Kitchen table. | route: leave confirmation', and the manifest has activeMemberCount: 1. PR #13's FQ16 Default covers the pause and restart, and FQ63 a leaver's announced days. Neither covers the last active member leaving, nor what happens to the club's Memories or pending invitations then. Spec 22 covers leaving only per member.

### X-17 · note · app · adjusted

- **State:** H01-unavailable, F01-unavailable, H01-access-lost, M01-access-lost, G04-confirm-refused
- **Rule:** The brief's Rules: every control has a VoiceOver name. handoff6 denied.group.vo and deniedHeader.title define the denied screens' spoken parts.
- **Finding:** screen-copy.json leaves out the spoken parts the contracts define:
- the four denied frames list no semantic groups, and no element for the wordmark;
- G04-confirm-refused's refusal line is in no group and has no announcement rule.
- **Evidence:** In screen-copy.json, F01-unavailable, M01-access-lost, H01-unavailable and H01-access-lost all have 'semanticGroups': [].

The contracts define handoff6.denied.group.vo as '{titleText}. {bodyText}', and deniedHeader.title as 'handoff6.header.denied.brand' ('Tadayo'; leading: 'noninteractive Tadayo identity').

G04-confirm-refused draws 'Couldn't confirm Friday. This day is contested. Your choice is kept.', but no group carries that text.
- **What the app does, and who acts:** Meanwhile the app builds from the contracts: the denied title and body as one group (denied.group.vo), and the wordmark as a non-interactive image labelled 'Tadayo'. It posts the refusal once as a VoiceOver announcement of its visible words, as a meaningful state change. These go in each row's snapshot checklist.
- **Second reviewer:** The facts are right. F01-unavailable, M01-access-lost, H01-unavailable and H01-access-lost all have 'semanticGroups': []. G04-confirm-refused's refusal line is in drawnText but in no group, and no contract gives it an announcement rule (only spacing.refusalToFirstRow 8). But the action invents a 'header' trait for the wordmark. deniedHeader.leading says only 'noninteractive Tadayo identity', with its label from handoff6.header.denied.brand. The action is corrected below.

### X-18 · note · app · confirmed

- **State:** copy-contracts.json, handoff6
- **Rule:** The brief's Return: fixture values go in screen-copy.json or a separate example key. IMPLEMENTATION: "real clubs always supply their club name"; "production uses the member-count/club-zone template with real data".
- **Finding:** Two handoff6 templates exist only for fixtures with no name or no zone, and one handoff6 key duplicates an earlier key.
- **Evidence:** handoff6.calendar.context.zoneOnly = '{clubZoneName}'.

handoff6.details.footer.zoneOmitted = '{memberCountText}'.

handoff6.calendar.confirmed.own.title = 'Your days are confirmed.' (kind 'new', replaces []), the same as handoff5.calendar.confirmed.title.many.
- **What the app does, and who acts:** The app never uses zoneOnly or footer.zoneOmitted in production. Every club has a name and a zone (spec 04, spec 05), so it always renders calendar.clubZone and details.footer. It uses handoff5.calendar.confirmed.title.many as the one key for that title. The ios thread records these in INVENTORY.md's copy notes.
- **Second reviewer:** handoff6.calendar.context.zoneOnly = '{clubZoneName}' and handoff6.details.footer.zoneOmitted = '{memberCountText}' exist for the nameless pair and the zoneless Kitchen table fixture. IMPLEMENTATION says 'real clubs always supply their club name' and 'production uses the member-count/club-zone template'. handoff6.calendar.confirmed.own.title is 'Your days are confirmed.', marked new with replaces [], which is identical to handoff5.calendar.confirmed.title.many.

### X-19 · note · app · confirmed

- **State:** component-contracts.json, handoff6.replacementScopes and friendsRow
- **Rule:** The brief's Return: "State the scope of each component replacement."
- **Finding:** Replacement scopes are given for six component entries. None is given for choiceRules, firstDays, waitingHero, localTimesSheet, travellingRows, switcherStatus or selfName.occasions. Each of these handoff 6 entries keeps every handoff 5 field, except waitingHero's deliberate allTextToken, so nothing is lost. Separately, handoff6.friendsRow.allRowVoiceOverLabels still points at handoff 3's fixture keys, which the copy map replaces.
- **Evidence:** handoff6.replacementScopes has keys only for dayChoiceRow, weekRows, changeRows, deniedHeader, friendsRow and spacing.

handoff6.friendsRow.allRowVoiceOverLabels: 'handoff3.F01.row.vo.*'. Copy handoff6.replaces maps 'handoff3.F01.row.vo.Ben' to 'handoff5.friends.row.vo', and the same for the other five. friendsRow.noOccurrence.label is 'handoff6.friends.row.noDate.vo'.
- **What the app does, and who acts:** The app treats each unscoped entry as a whole replacement of its handoff 5 entry. For Friends rows it uses handoff5.friends.row.vo, friends.row.travelling.vo and handoff6.friends.row.noDate.vo. The ios thread notes both in INVENTORY.md.
- **Second reviewer:** component-contracts handoff6.replaces has 16 entries. replacementScopes has keys only for dayChoiceRow, weekRows, changeRows, deniedHeader, friendsRow and spacing. choiceRules, firstDays, waitingHero, localTimesSheet, travellingRows, switcherStatus and selfName.occasions have no scope. I compared fields: every handoff 5 field survives in the handoff 6 entries except waitingHero.allTextToken. friendsRow.allRowVoiceOverLabels = 'handoff3.F01.row.vo.*', which handoff6.replaces maps to handoff5.friends.row.vo.

### X-20 · note · app · confirmed

- **State:** G05-local-times, G05-local-times-same-zone; the year rule
- **Rule:** handoff6 travellingRows.targetYear: "elsewhere include year if outside contextual current year, crossing a year, no clear year context, or standalone specimen … Snapshot current-year live Home/Friends omit year". FQ44 covers date formats.
- **Finding:** The year rule doesn't name the local-times sheet, yet both sheets put the year on every date, while Home and Friends omit it for the same dates. The sheet's form fits only the rule's 'no clear year context' clause, and nothing in QUESTIONS.md records the rule.
- **Evidence:** G05-local-times-same-zone: 'Opens Saturday, November 7, 2026 · 7 AM'.

F01-friends-first-days: 'Saturday, November 7 · 7 AM'.

H01-travelling-dateline's past card: 'Friday, November 6'.

travellingRows.targetYear: '...elsewhere include year if outside contextual current year, crossing a year, no clear year context, or standalone specimen ... Snapshot current-year live Home/Friends omit year'.
- **What the app does, and who acts:** The app keeps the year on every date in the local-times sheet, as handoffs 5 and 6 draw it, and builds the rule elsewhere. The ios thread records the year rule under FQ44's notes and in INVENTORY.md's known differences.
- **Second reviewer:** travellingRows.targetYear and IMPLEMENTATION's year policy name proposed starts, boundaries, kept dates, spoken targets and live Home and Friends, but not the local-times sheet. Both sheets write every date with the year ('Opens Saturday, November 7, 2026 · 7 AM'), while F01-friends-first-days and H01 omit it ('Saturday, November 7 · 7 AM', 'Friday, November 6'). PR #13's FQ44 covers format only.

### X-21 · note · app · confirmed

- **State:** H01-travelling vs H01-travelling-dateline
- **Rule:** handoff6 travellingRows.differentDates: "Both time lines include their own exact date. Home plaque/occasion remain club date."
- **Finding:** When the local and club dates match, the London card draws a separate date line above two undated time lines. When they differ, the Auckland card drops the date line and dates each time line. The contract says each time line carries a date, but not that the date line goes, so a build could draw the date three times.
- **Evidence:** H01-travelling drawnText: 'Saturday, November 7 | Opens 12 PM · London | 7 AM · New York'.

H01-travelling-dateline: 'Opens Sunday, November 8 · 1 AM · Auckland | Saturday, November 7 · 7 AM · New York', with no separate date line.

travellingRows.differentDates: 'Both time lines include their own exact date. Home plaque/occasion remain club date.'
- **What the app does, and who acts:** The app follows the two frames. home.date shows only when the local and club dates match. When they differ, it uses home.localOpening.dated and home.clubOpening.dated without home.date. This is noted on the H01-travelling-dateline row.
- **Second reviewer:** H01-travelling drawnText: 'Saturday, November 7 | Opens 12 PM · London | 7 AM · New York'. H01-travelling-dateline: 'Opens Sunday, November 8 · 1 AM · Auckland | Saturday, November 7 · 7 AM · New York', with no separate date line (checked on the PNG). travellingRows.differentDates says both time lines carry a date, but doesn't say that home.date is dropped.

### X-22 · note · claude-design · confirmed

- **State:** G04-confirm-refused, G04-conflict, G04-conflict-three
- **Rule:** handoff6 dayChoiceRow.contested: "visible chooser ListFormatter includes Name · You for self", in stable roster order. The brief asked whether the line reads "You, Debby and Alex".
- **Finding:** In roster order, the ' · You' marker falls wherever the viewer is in the list. When the viewer comes last, as in Debby's view, the line can read as a label for the whole pair. The spoken label is unambiguous.
- **Evidence:** Drawn:
- G04-conflict: 'Ben · You and Debby';
- G04-conflict-three: 'Ben · You, Alex and Debby';
- G04-confirm-refused: 'Ben and Debby · You'.

Spoken: 'Friday. Contested. Ben. Debby, you. Your choice.'
- **What the app does, and who acts:** The app builds as delivered, which follows the contract. The next brief may ask Claude Design whether the viewer goes first in the visible line.
- **Second reviewer:** Drawn: G04-conflict 'Ben · You and Debby', G04-conflict-three 'Ben · You, Alex and Debby', G04-confirm-refused 'Ben and Debby · You'. Spoken on G04-confirm-refused: 'Friday. Contested. Ben. Debby, you. Your choice.'. dayChoiceRow.contested specifies a ListFormatter in stable roster order with Name · You. The brief's question on whether the viewer goes first was answered for prose only.


**Found by the second reviewer**

### CM-01 · note · app · found in review

- **State:** G06-switcher-unavailable (against handoff 5's G06-switcher-status and 2.1's G06-switcher)
- **Finding:** The new switcher frame packs the sheet's actions against the club list in a way handoff 5's sheet didn't, and no contract explains why:
- the Kitchen table row's target overlaps the Club details target by 9 points;
- the Club details text sits about 8 points under the divider, at x=20;
- handoff 5's sheet left a 16-point gap and inset the actions to 28, as 2.1 does.

The brief requires targets of at least 44 points (T47).
- **Evidence:** screen-copy G06-switcher-unavailable: Kitchen table rect [20, 615, 353, 64], which ends at 679; Club details rect [20, 670, 353, 44].

Handoff 5 G06-switcher-status: Kitchen table [20, 572, 353, 64], which ends at 636; Club details [20, 652, 353, 44].

In the 2x PNGs, handoff 6's divider is at about y=678.5 points with the Club details text from about 686, at x=20. Handoff 5's divider is at about 635.5, with the text near 667, at x=28.
- **What the app does, and who acts:** Meanwhile the app builds the native sheet with handoff 5's spacing between the list and its actions: no overlapping targets, each at least 44 points. The snapshot review lists the difference. The next brief may ask Claude Design to fix the frame.

### CM-02 · note · app · found in review

- **State:** H01-travelling (redraw), G05-local-times (redraw)
- **Finding:** Two more redraws change things their stated reasons don't cover (like X-06):
- H01-travelling, redrawn for '2.1 past card', also changes the waiting card's type: the date line drops from about 25 to about 17 points, and the local opening line from bold to a smaller regular weight.
- G05-local-times, redrawn for 'open occurrence first', also moves the sheet's title from the navigation row ('Times in your time zone' beside Done) to a large title below Done.

No component contract names the waiting card's type roles: handoff5.waitingHero and handoff6.waitingHero give only fills and inks. The new card is closer to 2.1's H01-after-close card, and matches H01-travelling-dateline and the sheet's specimen.
- **Evidence:** Ink runs in points from the 2x PNGs (x from 30 to 350):
- handoff 5 H01-travelling: date line 302.0 to 325.0, opening line 337.0 to 352.5;
- handoff 6 H01-travelling: date line 295.0 to 310.5, opening line 323.5 to 335.5.

The IMPLEMENTATION redraw reasons: 'H01-travelling (2.1 past card)'; 'G05-local-times (open occurrence first)'.

G05-local-times drawnText order: handoff 5 '9:41 | Times in your time zone | Done | ...'; handoff 6 '2:41 | Done | Times in your time zone | ...'.

handoff5.waitingHero keys: fillToken, allTextToken, plaqueOnAccentFillToken, plaqueRadiusToken, why. No type role is given.
- **What the app does, and who acts:** Meanwhile the app builds one waiting card for H01-waiting, H01-travelling and H01-travelling-dateline, in handoff 6's style (2.1's hierarchy). It builds the local-times sheet with handoff 6's header, as G05-local-times-same-zone also draws it. The ios thread notes both changes on the rows. The next brief asks Claude Design to name the waiting card's type roles and confirm the sheet header.


## Completeness critic

**Summary.** I checked what the five lenses left out. I found six new problems in the files: three should and three notes. None is a must.

**The three should findings:**
- **C-01: the first days before anyone confirms have no Memories state.** H01-confirm-days covers Home at that moment, but no frame or words cover Memories. handoff3.M01.awaiting.body is only for a club that hasn't started. 2.1's M01-empty names a next date that doesn't exist yet. The two first-days frames also give Friends' Add two different routes.
- **C-02: the switcher's active row has a single template,** "{memberCountText} · Next: {personName}". It has no form for 2.1's own open-day row ("6 people · Debby's Friday"), and none for a club with no confirmed day.
- **C-03: nothing says when G05's "Your confirmation is saved." row goes away.** In a small club, whether it is still there tells the viewer whether the others have confirmed. In a pair, that names the other member. This is for the founder.

**The three notes:**
- **C-04: the local-times sheet still puts club time first.** That is true of the redrawn frame 27 and the sheet's specimen. Every new travelling surface puts local time first. Handoff 5's C-08 asked for a single order, and the handoff 6 brief didn't carry that ask forward.
- **C-05: the hint "Confirmation is not possible yet." on a contested day.** It promises a resolution that FQ55 says may never come.
- **C-06: the calendarContext spoken group names the zone twice.**

**What I checked and found clean:**
- **Hidden leaks.** I searched the denied and non-chooser SVGs for club or chooser names in ids, aria-labels, title and desc, and in PNG text chunks. The only id is Ben's own photo, "ph3456428Ben". G04-contested-other carries no Ben, Alex or Debby anywhere.
- **Copy templates.** No mid-sentence "{occasionTitle}" and no capital "Your" survives unreplaced. Copy provenance matches handoff6.replaces exactly.
- **Labels and targets.** Every control label starts with its visible words, and every target is at least 44 pt. The only overlaps are scroll-viewport ones on F01, plus the G06 one already reported.
- **Dates.** All recomputed dates and times are right: FQ79's first dates, London (+5), Auckland (+18), 29h 59m shown as 1d 5h 59m, and the status-bar times.
- **Validation report.** Its "newTemplates: 84" counts the "precedence" note: there are 83 templates. That doesn't matter.


**Findings**

### C-01 · should · claude-design · critic

- **State:** Memories, and Friends' Add, in a club's first days before anyone has confirmed (the moment of H01-confirm-days)
- **Rule:** Book p21: 'Before the first accessible reveal, explain the real future date.' T49: no made-up date. handoff6.firstDays.noOccurrences: 'No guessed date, person, countdown or collecting destination until an actual confirmed occurrence exists.' Brief section 4 left out only 'Friends and Memories before a club starts and while paused'.
- **Finding:** In H01-confirm-days' fixture the club has started, all six members have joined, and nobody has confirmed. Home has a frame for that moment, but Memories has neither a frame nor words that fit. handoff3.M01.awaiting.body is for a club that hasn't started, so it is false here. 2.1's M01-empty is built around a 'Next:' date that doesn't exist yet. Friends at that moment is also undecided. Every row is the no-occurrence form, and the two first-days frames give two different Adds: private-only on H01-confirm-days, the recipient picker on F01-friends-first-days. With nobody confirmed, the picker would offer nobody who can be chosen.
- **Evidence:** copy handoff3.M01.awaiting.body = 'Memories will appear after the club starts and a day opens.' (the only Memories line for a club with nothing open). 2.1 M01-empty.png draws 'Your first memories are ahead.', 'Days shared after you joined will appear here after they open. Next: Nina’s Saturday, 7 November at 7 AM.' and 'See upcoming days'. H01-confirm-days fixture (brief item 1): 'Sunday people has started, all six members have joined, and nobody has confirmed a day.' H01-confirm-days '+ Add': hint 'Save a private draft or open private drafts.', route 'Private draft / Open my drafts'. F01-friends-first-days '+ Add': hint 'Choose a person and day, or save a private draft.', route 'recipient picker'. PR #13 INVENTORY.md lists M01-not-started ('Memories before the club starts', B2) and M01-empty (B6), with no row for the first days.
- **What the app does, and who acts:** Meanwhile Memories in the first days shows 2.1 M01-empty's title and first sentence. It adds the 'Next:' sentence only once a confirmed occurrence exists, with that occurrence's FQ79-resolved date, and never shows a guessed date (T49). Friends with nobody confirmed shows six name-only rows (friendsRow.noOccurrence) and H01-confirm-days' private-only Add (a11y.addPrivate.hint). The ios thread adds M01-first-days and F01-friends-unconfirmed at B2, marked built from spec. The next B2 brief asks Claude Design for both.

### C-02 · should · claude-design · critic

- **State:** G06 switcher: the row of an active club (handoff6.switcher.active.row)
- **Rule:** Brief item 14 says the active row is 'as 2.1's G06-switcher draws it (state 45, book p32)'. firstDays.noOccurrences: no guessed person. T49.
- **Finding:** The only template for an active club's row is the waiting form, 'N people · Next: X'. 2.1's own G06-switcher also draws a club whose day is open, as '6 people · Debby’s Friday', and no key produces that. A club in its first days with no confirmed day has neither a next person nor an open day, so the template can't render it at all. That is exactly the club selected behind H01-confirm-days.
- **Evidence:** copy handoff6.switcher.active.row = '{memberCountText} · Next: {personName}'; switcher.active.row.vo = '{clubName}. {memberCountText}. Next: {personName}.'. No other active-row key exists in any handoff: the only switcher keys are Not started, Paused and Unavailable. 2.1 G06-switcher.png: 'Sunday people / 6 people · Debby’s Friday' (selected, during the open day) and 'Kitchen table / 5 people · Next: Maya'. component handoff6.switcherStatus.activeRows: 'Book fixture: Kitchen table, 5 people · Next: Maya.'
- **What the app does, and who acts:** Meanwhile the app draws the open-day row as 2.1's G06-switcher render does, the member count followed by the open occasion. For a club with no confirmed occurrence it shows the member count only, with no person or date (T49). INVENTORY.md notes both forms as built from the 2.1 render and the spec. The next brief asks for templates for both.

### C-03 · should · founder · critic

- **State:** G05 review row after the viewer has confirmed a change (changeRows.reviewAfterOwnConfirm), in a small club
- **Rule:** Brief: 'no count or list of who hasn't confirmed, accepted or added anything' (T15, T33). The brief asked for the review row 'without a waiting line (T33)'.
- **Finding:** Handoff 6 says what the row shows after the viewer confirms ('Your confirmation is saved.'), but not when it leaves G05. If it leaves when the last active member confirms, then while it remains it tells the viewer that someone hasn't confirmed. When it goes, it tells them everyone has. In a two-member club that names the other member, and in a three-member club it narrows it to one of two. The written rules only say 'no confirmation count'.
- **Evidence:** component handoff6.changeRows.reviewAfterOwnConfirm: 'Review the club’s days; proposed full start; Your confirmation is saved. No others’ status. Opens proposal read-only for this revision; do not confirm twice.' weekRows.reviewRow: 'Top of current week; Review the club’s days + exact proposed start; no confirmation count.' changeRows.allActiveConfirm: true. IMPLEMENTATION: 'Current days continue until the change becomes effective under the existing all-active-member rule.' copy handoff3.G04.change.saved.body: 'The current days continue while this change is being confirmed.' G05-schedule-review's fixture is the pair, Ben and Debby (Maya joining). Nothing in handoffs 3, 5 or 6 says what G05 shows once every member has confirmed but before the start date.
- **What the app does, and who acts:** Meanwhile the app keeps the saved review row unchanged until the proposed start date, or until the proposal is replaced, so the moment the last member confirms is never shown. It adds no count, names or waiting line. The question goes in docs/QUESTIONS.md with that default, noting that in a two-member club a change that isn't fully confirmed by its start date still shows at that date.

### C-04 · note · claude-design · critic

- **State:** G05-local-times (redraw, frame 27) and brand-components' two-zone local-time specimen
- **Rule:** Book p29: 'Travelling members see their local equivalent with the club zone available.' Book p34: one shape, one meaning. Handoff 5 check C-08 asked a later brief for one order.
- **Finding:** The redrawn sheet and the new sheet specimen still put club time first, in what is drawn and in what is spoken. Every travelling surface handoff 6 adds puts local time first: the dated waiting card, its spoken group, Friends while travelling and the travelling Add hint. Handoff 5's C-08 flagged this, but the handoff 6 brief didn't carry the ask, so the order now differs between the sheet and the rest of the app.
- **Evidence:** G05-local-times drawnText: 'Club time · New York | Opens Friday, November 6, 2026 · 7 AM | ... | Your time · London | Opens Friday, November 6, 2026 · 12 PM'. Its label: 'Open now. Debby’s Friday. New York: opens ...; ... London: opens ...'. brand-components H6 specimen: 'Club time · New York' above 'Your time · Auckland'. H01-travelling-dateline: 'Opens Sunday, November 8 · 1 AM · Auckland' above 'Saturday, November 7 · 7 AM · New York'. copy handoff6.home.waiting.travelling.group.vo: '{occasionTitle}. Opens {localFullDateTime}, {deviceZoneName}; {clubFullDateTime}, {clubZoneName}.' travellingRows.Home: 'Local exact date/time first'. handoff-5-findings C-08: 'A later brief asks for one order across the travelling surfaces.'
- **What the app does, and who acts:** Meanwhile the app builds the sheet as drawn. The ios thread notes the order difference on the G05-local-times row, and the next brief asks for one order across travelling surfaces.

### C-05 · note · claude-design · critic

- **State:** G04 Confirm hint on a contested day (G04-conflict-three, G04-confirm-refused, G04-conflict)
- **Rule:** T33 (no 'Waiting for…', nothing chases). T43 (direct and factual). defaultsAssessment.FQ55: 'A day may remain contested indefinitely. No pressure or automatic winner.' defaultsAssessment.FQ46_FQ48: 'avoid suggesting anyone should leave'.
- **Finding:** The new hint on the disabled Confirm button ends 'not possible yet'. That promises a resolution FQ55 says may never come, and it implies the chooser is waiting for the others to give way. Handoff 5's hint had no 'yet'. The line names nobody.
- **Evidence:** copy handoff6.calendar.confirm.contested.hint = 'This day is contested. Confirmation is not possible yet.' (replaces handoff5.calendar.confirm.contested.hint '{stateLabel}. Confirmation is unavailable.'). screen-copy: the 'Confirm Friday' hint on G04-conflict-three, G04-confirm-refused and G04-conflict is 'This day is contested. Confirmation is not possible yet.'
- **What the app does, and who acts:** Meanwhile the app builds the hint as delivered, since it names and counts nobody. The next brief may ask for the hint without 'yet'.

### C-06 · note · claude-design · critic

- **State:** calendarContext spoken group on every G04 and G05 frame
- **Rule:** The brief's sixth rule over handoff 5 (the zone named once when the phone is in the club's zone). T47 (clear spoken names).
- **Finding:** The context group joins the club line to the hours sentence, and both carry the zone, so VoiceOver names New York twice in one group. This is the same repetition the founder had removed from the View local times hint.
- **Evidence:** screen-copy calendarContext labels: 'Sunday people · New York. Reveals open at 7 AM and Home closes at 1 AM the next morning, in New York.' (G04-conflict-three, G04-contested-other, G05-schedule-choose-own, G05-schedule) and 'New York. Reveals open at 7 AM and Home closes at 1 AM the next morning, in New York.' (G04-two-days-one-chosen, G04-confirmed-many, G04-change, G05-schedule-review). copy handoff5.calendar.clubZone '{clubName} · {clubZoneName}' plus handoff5.calendar.hours.vo 'Reveals open at {openTime} and Home closes at {closeTime} the next morning, in {clubZoneName}.'
- **What the app does, and who acts:** Meanwhile the app builds the group as delivered. The next brief may give the group a single zone.


**The critic's disputes of earlier actions**

- **dispute F-03 and X-05 (meanwhile action).** Both hide Club details on G06-switcher-unavailable. The frame draws it enabled, so hiding it changes what the frame shows, which T46 says is designing. W-06, R-05 and V-08 keep the drawn row and send it through the read predicate to the same neutral denial as Home. That shows nothing of the club either, and it changes no frame. Use that action until the founder, under F-03/V-08, or Claude Design, under X-05/W-06/R-05, decides.
- **dispute X-06 (F01 footer part only).** X-06 builds F01 without the New York zone line. handoff3.friendsScheduleFooter is not in handoff6.replaces in component-contracts, so it still stands. It sets zoneRole 'metadata' and placement 'Below the roster, immediately above the native tab bar; safe-area footer grows at large text'. The rule wins over the frame, so take F-08's action: keep the footer as handoff 3 contracts it. X-06's denied-title part stands, with V-09's top gap.
- **dispute W-04 (meanwhile action).** W-04 puts each kept date on its own line at every size. That follows the frame over the written rule. handoff6.changeRows.keptDates says 'Visible list uses a middle dot between dates; AX5 stacks dates in same person group', and IMPLEMENTATION says 'join a visible list with middle dots'. Take F-05's and X-02's action: middle dot, wrapping, stacked at the largest sizes. Keep the year, as R-06 says.
- **dispute F-07 (meanwhile action, partial).** F-07 builds the denied layout from handoff 6's frames, which would include the title's position about 65 to 71 pt below the header. V-09 shows that this contradicts handoff6.spacing.homeContentTopAfterHeader 32. Take V-09's action: the emptyTitle 25/30 role and Get help leading, as drawn, but the named 32-pt gap after the header.
- **dispute FM-02 (meanwhile action, partial).** FM-02 says only the navigation bar, Confirm and the tab bar stay pinned, so Friends' See schedule would scroll away with the list. handoff3.friendsScheduleFooter pins it ('safe-area footer ... scrollable roster above'), and handoff 6's IMPLEMENTATION says 'the list scrolls while See schedule and the tabs remain reachable'. Keep FM-02's scrolling header, but keep See schedule pinned above the tab bar on F01.
- **dispute V-02 and CM-02 (meanwhile action) against F-06.** V-02 and CM-02 build the waiting card to handoff 6's drawn geometry (44-pt disc, 17/13/25). F-06 builds it from 2.1's H01-waiting and H01-after-close, where the hero avatar is about 48 pt. Under FQ2, 2.1 stays the reference for H01-waiting and H01-after-close, as the handoff 5 critic ruled for the past-day card. The founder replaced only G04-one-day and G04-two-days. Build one card from 2.1's geometry with handoff 6's tokens, dated lines and dark pairings for every waiting Home, travelling ones included, so the card doesn't change size when you travel. Record handoff 6's 44-pt disc as a difference.

