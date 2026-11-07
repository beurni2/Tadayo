# Design handoffs 3 and 4: every finding

*3 November 2026. The evidence behind `handoff-3-4-check.md`, for the thread that brings handoffs 3 and 4 into the repository. Four independent reviews each read both deliveries through one lens. A second reviewer then tried to refute each finding. Verdicts: 44 confirmed, 16 adjusted (the text below is the adjusted version), 0 refuted. The second reviewers also listed 13 items the first ones missed; they are at the end, with what I checked.*

Severity: **must** breaks an invariant, the spec, a Default or the brief, or would mislead the build. **should** is a real gap the build or a later brief must handle. **note** is worth recording. Who acts: **app** (Claude Code builds the rule), **claude-design** (a later brief), **founder** (a product decision), **none**.

Files cited: `u3/` is the unpacked `Tadayo_Handoff_3_Pack.zip` and `u4/` the unpacked `Tadayo_Handoff_4_Pack.zip` (both in `design/handoff-3/export/` and `design/handoff-4/export/`). "The brief" is `design/handoff-3/handoff-3-and-4-briefs.md`.


## Against the briefs

Both deliveries cover every frame item and every question in the two briefs. Handoff 3 has 8 phone frames in the brief's order: the 7 asked for, plus the light F01-friends redraw the brief invited as frame 8. Every Default is drawn as stated, and the three constructed fixtures are used exactly (viewer, names, weekdays, dates). All 197 new strings sit under copy-contracts.json handoff3, each with its own key and ’. Every quoted string in the written answers matches a key; checked by script against IMPLEMENTATION.md and the PDF. Handoff 4 has its 7 frames in order and answers every question. It uses ’ in every copy file (no straight apostrophes left), gives the three requested lines their own keys, and adds the token and analytics guidance. It keeps handoff 3's contracts unchanged. No finding is a must. Five are should: (1) G04-conflict leaves out the 7 AM to 1 AM line that book p10 asks for. (2) The other four members see the names of the two people who haven't confirmed (founder). (3) For a member who is travelling, local times sit behind a link on G05, the reverse of T2, and Friends and Home aren't covered. (4) The new Proposed roster screen, which both pending screens open, has no frame. (5) Home's suspended, offline and access-lost states exist only in writing. Seven notes record product choices for the founder, Claude Design's own comments on the Defaults, earlier frames that are now changed only in writing, a common.done key that has a different value in each handoff, and the retired first-send line.


### B-01 · The app shows the hours on G04 the way G04-change draws them, using the delivery's own key handoff3.G05.schedule.revealHoursZone ('New York · 7 AM to 1 AM the next morning'), and records the difference in INVENTORY.md. · handoff 3 · should · confirmed

- **Rule:** Book p10: 'Show the week, club timezone and 7 AM to 1 AM next morning.' The brief lists p10 under 'Rules that apply to every frame', and 2.1 G04-one-day draws '7 AM to 1 AM the next morning.'
- **Finding:** G04-conflict shows the week and the zone but not the opening hours.
- **Evidence:** In screen-copy.json, G04-conflict has no '7 AM' string, and neither does G04-conflict.svg. Its only club line is 'Sunday people · New York'. The same delivery's G04-change has 'New York · 7 AM to 1 AM the next morning'. Both 2.1 G04-one-day and G04-two-days draw '7 AM to 1 AM the next morning.'
- **Meanwhile, and who acts (claude-design):** The next brief asks Claude Design to add the hours line to G04-conflict.


### B-02 · Ben and Debby see both names on the contested day, as drawn; the brief asks for that. For the other four, the app shows Friday without names, using the delivery's 'No reveal scheduled' (handoff3.G04.conflict.otherMonday), until the founder answers. · handoff 3 · should · confirmed

- **Rule:** Brief, every frame: 'No counts, progress or names of who hasn't confirmed, accepted or added anything; your G03-waiting's "Waiting for club approval" names nobody (T15, T33).' This pulls against spec 05: 'unresolved conflicts are visible rather than silently swapping dates'.
- **Finding:** In writing, the members outside the conflict see the names of the two people who haven't confirmed.
- **Evidence:** IMPLEMENTATION.md: 'In their read-only week, Friday says “Day choice conflict: Ben and Debby. No reveal scheduled.”' (key handoff3.G04.conflict.otherFriday). The brief, for every frame: 'No counts, progress or names of who hasn't confirmed, accepted or added anything'. Spec 05: 'unresolved conflicts are visible rather than silently swapping dates'.
- **Meanwhile, and who acts (founder):** The founder decides whether members outside a conflict see the two names. Record it as a new FQ with the app's interim reading (no names) as the default.


### B-03 · The app builds the 'View local times' sheet and its keys (G05.schedule.localSheet.*). For a member whose phone zone differs from the club's, it shows dated times as the local equivalent with the club's zone available, per T2, marked 'built from spec'. · handoff 3 · should · adjusted

- **Rule:** T2: 'A member who is travelling sees the local equivalent, with the club's zone available.' Book p29 says the same. The brief, for every frame: 'a member who is travelling sees the local equivalent with the club's zone (spec 05; book p29; T2)'.
- **Finding:** The delivery covers a traveller's times only on G05, behind 'View local times'. It doesn't say what a traveller sees on Friends' dated rows or on Home, where T2 and book p29 put the local time first with the club's zone available. It also doesn't say whether the link appears when the phone's zone matches the club's.
- **Evidence:** IMPLEMENTATION.md: '“View local times” opens a native sheet titled “Times in your time zone” … Keep New York visible beside the local equivalent.' and 'Do not attach one fixed UTC offset to a recurring weekday.' F01 rows: 'Monday, November 9 · 7 AM'. No traveller rule exists for F01 or H01. Book p29: 'Travelling members see their local equivalent with the club zone available.'
- **Meanwhile, and who acts (claude-design):** The next brief asks for the traveller's view of F01 and H01, and whether View local times appears when the zones match. Meanwhile the app shows dated times in local time with the club's zone available (T2), marked 'built from spec'.
- **Second reviewer:** Calling the G05 order 'the reverse of T2' overstates it. G05's main list is a recurring rule, and the delivery gives a reason not to convert it: 'Do not attach one fixed UTC offset to a recurring weekday.' Its sheet pairs Club time with Your time for actual occurrences, keeping New York beside the local time. The real gap is the dated screens. F01's rows ('Monday, November 9 · 7 AM') and Home's date and countdown get no traveller rule, although the brief applies T2 to every frame. The delivery also doesn't say whether the link shows when the phone's zone matches the club's. The frame draws it for Ben in New York.


### B-04 · The app builds Proposed roster from handoff 1's G05-members list with handoff3 G05.proposed.title, body and manage. It shows no weekdays or statuses and is marked 'built from spec' in INVENTORY.md. · handoff both · should · confirmed

- **Rule:** H3 brief asks: 'Where does the action go: Ben's invitation list (G01-invite-people) or the members list (G05-members)?' T46: 'A state with no render is built from the spec and the book's contracts and marked "built from spec".'
- **Finding:** The only main action on both pending screens opens a new screen, Proposed roster, that neither handoff draws.
- **Evidence:** H3 IMPLEMENTATION.md: 'Review members opens G05-members in a creator-only proposed-roster review variant, titled “Proposed roster” … “Manage invitations” is a separate action into G01-invite-people'. H4 pendingScreen.primaryRoute: 'G05-members proposed-roster review, creator only, then optional Manage invitations -> G01-invite-people'. Neither frame-manifest.json lists it.
- **Meanwhile, and who acts (claude-design):** The next brief asks for a Proposed roster frame, including Manage invitations. Meanwhile the app builds it from the handoff3 G05.proposed.* keys, marked 'built from spec'.


### B-05 · The app builds Review members as delivered. These are spec 08's words for the state, and they match H01-awaiting-activation. · handoff 4 · note · adjusted

- **Rule:** H4 brief item 2: 'your handoff 2 … keeps Review invitations'. Its question: 'does Review invitations become it?' No source says where the creator's pending screen leads.
- **Finding:** G01-pending's primary action changes from Review invitations to Review members, so it matches spec 08 and H01-awaiting-activation. Invitations are reached through Proposed roster → Manage invitations, or through Back.
- **Evidence:** H4 IMPLEMENTATION.md: 'Review members is the primary action, not Review invitations.' Spec 08 table: 'Awaiting club activation | Waiting for club confirmation | Review members'. H3 brief: 'Where does the action go: Ben's invitation list (G01-invite-people) or the members list (G05-members)?' Handoff 1: 'Review invitations returns the creator to G01-invite-people.'
- **Meanwhile, and who acts (none):** None. The app builds Review members as delivered and records the route in INVENTORY.md.
- **Second reviewer:** The facts are right: handoff 1's G01-pending had 'Review invitations', and handoff 4 retires it. But this is not an unsettled product choice. The H3 brief asked Claude Design this exact question ('Where does the action go: Ben's invitation list (G01-invite-people) or the members list (G05-members)?'). Spec 08 names 'Review members' as this state's primary action, and the brief required G01-pending to agree with H01-awaiting-activation. G01-pending is a pushed screen with a native Back, and handoff 1 says Review invitations 'returns' the creator to G01-invite-people, so the list is still one tap back. Nothing for the founder to decide.


### B-06 · The app builds these states from the written contract and keys (handoff3.H01.suspended.*, H01.offline.*, H01.error.network, H01.accessLost.*), marked 'built from spec'. While a club is suspended, its Friends and Memories are denied too. · handoff 3 · should · confirmed

- **Rule:** Spec 29: 'Each screen must implement loading, empty, recoverable error and access revoked behaviour relevant to its content.' Spec 22: 'emergency suspension of an occurrence or club with a neutral client explanation'.
- **Finding:** Home's suspended, offline, load-error and access-lost states exist only in writing. The delivery itself says suspension needs its own frame.
- **Evidence:** README.md: 'H01-unavailable needs a distinct later frame and is intentionally outside the requested phone set.' Only keys exist: 'Club unavailable' / 'This club isn’t available right now.', 'Offline' / 'Last checked {fullDateAndTime}', 'Couldn’t load Home. Check your connection and try again.', 'This club is no longer available.' No frame is in the manifest.
- **Meanwhile, and who acts (claude-design):** The next brief asks for H01-unavailable, H01-offline (with and without a cached date) and H01-access-lost. Meanwhile the app builds them from the keys, marked 'built from spec', and denies Friends and Memories while a club is suspended (T9).


### B-07 · The current days continue (Default 3), and the app never activates a start date that has passed. It follows the delivery's re-proposal, which keeps announced dates (T6). · handoff 3 · note · confirmed

- **Rule:** Spec 05: 'The schedule service first finds a future boundary with no submitted occurrence affected, then requests confirmation.' Default 3: 'until everyone has, the current days continue.' Neither says what happens when the start date passes.
- **Finding:** The delivery makes a product choice: if a proposal isn't fully confirmed by its start date, a new date replaces it, and earlier confirmations don't carry over.
- **Evidence:** IMPLEMENTATION.md: 'If the proposed date passes without complete confirmation, the server chooses a fresh exact future boundary, preserving every announced occurrence, and asks for a new review of that proposal. It does not activate late or carry old confirmations silently.' Key G04.error.pastStart: 'Couldn’t confirm that start date. Review the new proposed date.'
- **Meanwhile, and who acts (founder):** The founder confirms or changes this. It goes into QUESTIONS.md with the B2 schedule-change questions.


### B-08 · The app generates no new days (FQ16) and never moves an announced reveal (T6), so it keeps any announced days as delivered. · handoff 3 · note · confirmed

- **Rule:** FQ16 says only 'No new occurrences are generated'. T6: 'A club has two to six active members' and 'Announced reveal times … never move'. The briefs' section 5 lists as open 'what happens to the announced days of a member who leaves'.
- **Finding:** The delivery decides that a paused club keeps the days already announced.
- **Evidence:** component-contracts.json handoff3.pausedHome.announcedDaysIfAny: 'Keep promised occurrences; do not cancel them because the club has fewer than two active members.' IMPLEMENTATION.md: 'if an actual paused club still has promised occurrences, preserve them rather than silently cancelling them.'
- **Meanwhile, and who acts (founder):** The founder answers it together with the open question about a leaving member's announced days. Meanwhile the app keeps announced days (T6) and generates no new ones (FQ16).


### B-09 · The app draws every Default as stated. · handoff both · note · adjusted

- **Rule:** Brief: 'say in writing if it makes the screen worse.'
- **Finding:** Claude Design questions five Defaults in writing (2, 3, 6, 7 and 8). All of them are drawn as stated.
- **Evidence:** H3: 'neither-person-can-confirm … can leave Friday unresolved indefinitely' (Default 2); 'all-active-member confirmation can stall a change in a larger club' (Default 3); 'The locale default makes some labels longer' (Default 8); 'the neutral shell … can feel slower' (Default 6). H4: 'neutral recovery gives less diagnostic help … The no-inviter web page is less personal' (Default 7).
- **Meanwhile, and who acts (founder):** Record these comments next to the Defaults in QUESTIONS.md. Nothing needs doing now.
- **Second reviewer:** All four quotes are exact, and every Default is drawn as stated. But the delivery questions a fifth Default in writing, Default 8 (FQ44): its G05 assessment says 'The locale default makes some labels longer; the reference keeps full words and the implementation must grow rows rather than abbreviate dates.' The assessments of Defaults 1 and 5 raise no concern.


### B-10 · The app follows the written contracts over the earlier frames and lists each difference in INVENTORY.md. · handoff both · note · confirmed

- **Rule:** Brief: 'A redraw keeps everything else in the earlier frame as it was.' Changes given only in writing aren't redrawn.
- **Finding:** Several earlier frames are now changed in writing only, so building those frames as drawn would be wrong.
- **Evidence:** H4: the members footer '6 members · New York' plus '7 AM to 1 AM the next morning.' replaces H1 G05-members' 'Sunday people has six members.' and changes the end of H2 G05-members-two-days. G05-club-details' 2.1 'Drafts · Only you can see them' becomes the Private drafts row. G03-declined gains 'We don’t identify who declined. Nobody is asked to give a reason.' H3: 2.1 G06-switcher gains 'Not started' / 'Paused'. Club details' Schedule row may read 'New days to review'.
- **Meanwhile, and who acts (app):** The app follows the written contracts over the earlier frames and lists each difference in INVENTORY.md. Nothing for Claude Design unless the founder wants pictures of these.


### B-11 · The app keeps the handoff3 and handoff4 namespaces separate: G04-change's saved state uses 'Done', G01-invite-people uses 'Done for now'. · handoff both · note · confirmed

- **Rule:** Brief: every written string 'in copy-contracts.json, each under its own key'.
- **Finding:** The same short key holds a different value in each handoff, so flattening the namespaces would pick the wrong word.
- **Evidence:** handoff3 'common.done': 'Done'; handoff4 'common.done': 'Done for now'.
- **Meanwhile, and who acts (app):** The app's string generator keeps the namespace prefix. G04-change's saved state uses 'Done', and G01-invite-people uses 'Done for now'.


### B-12 · The app uses the active keys handoff4.auth.firstSend.refused and auth.resend.refused and never shows the retired lines. · handoff 4 · note · confirmed

- **Rule:** H4 brief asked to 'confirm or replace' only the refused-resend line, and only to key 'A code can’t be sent yet. Try again shortly.'
- **Finding:** The delivery also retires the first-send line. The same reason applies: the app knows no wait time.
- **Evidence:** copy-contracts.json handoff4 'auth.firstSend.refused': 'Couldn’t send a code. Try again.' copyStatus.retired 'handoff4.auth.legacy.firstSend.refused': 'Reference only; never render. Replaced by handoff4.auth.firstSend.refused.'
- **Meanwhile, and who acts (none):** None. The app uses the active keys handoff4.auth.firstSend.refused and auth.resend.refused and never shows the retired lines.


## Copy, privacy and product rules

Copy, privacy and product-rule check of handoffs 3 and 4. Most of both deliveries keep the rules: the revoked-link screens, the loading shell, the paused Home, the awaiting-activation Home with G01-pending, G04-change, G05-schedule, Friends, the A02 refusal lines and the token and analytics guidance all match the Defaults, the T-rules and the spec. I found 15 problems: 1 must, 7 should and 7 notes.

- **The must (R-01):** under the written answer for G04-conflict, Maya, Alex, Sam and Nina see "Day choice conflict: Ben and Debby." The brief forbids naming anyone who hasn't confirmed, so meanwhile the other four see only "No reveal scheduled". The founder decides whether spec 05's "visible" conflict means the whole club, with names.
- **Product choices the founder needs to make:**
  - A paused club keeps every promised day, including those of a member who has left (R-04).
  - A candidate's roster review shows initials, never photographs. The book's invitation render shows photographs (R-07).
  - A start date that passes unconfirmed is proposed again, and every member confirms again (R-09).
  - Whether Debby may take Monday, the day proposed for Ben (R-10).
- **For Claude Design:**
  - The destructive red on "Day conflict". Handoff 4 itself avoids "punitive red" for Link revoked (R-02).
  - The offline Home names no person and allows no cached revealed content, which spec 34 does allow (R-03).
  - The Decline button's VoiceOver label misnames Maya's action (R-08).
  - Ben is never marked "You" on G04-conflict (R-11).
  - Copy for a conflict between three people (R-12).
  - The invitation list's title once the club has started (R-13).
  - A frame for H01-unavailable (R-15).
- **The app handles alone:**
  - Pair titles come from the club's own name, not handoff 2's "Ben and Debby" (R-05).
  - Times are formatted per FQ44, not as a literal "7 AM" (R-06).
  - Copy keys that hold the fixture's names become templates (R-14).


### R-01 · G04-conflict (what the other four members see; written only) · handoff 3 · must · adjusted

- **Rule:** Brief, handoff 3, rule for every frame: 'No counts, progress or names of who hasn't confirmed, accepted or added anything; your G03-waiting's "Waiting for club approval" names nobody (T15, T33).' Brief item 1: 'Nobody is asked or reminded to give way (T33, T36).' T33 forbids '"Waiting for Debby"'. Spec 05 says only 'unresolved conflicts are visible rather than silently swapping dates', without saying to whom.
- **Finding:** In the written view for Maya, Alex, Sam and Nina, Friday reads 'Day choice conflict: Ben and Debby. No reveal scheduled.' That shows the whole club, all the time, the names of two members whose day isn't confirmed. The brief allows those names only for the two people involved. The delivery also gives the state a second name, 'Day choice conflict', beside the frame's 'Day conflict'.
- **Evidence:** copy-contracts.json handoff3: 'G04.conflict.otherFriday = Day choice conflict: Ben and Debby. No reveal scheduled.' and 'G04.conflict.confirm.vo = Confirm Friday. Unavailable while Friday has a day choice conflict.' IMPLEMENTATION.md: 'The other four members keep their confirmed days. In their read-only week, Friday says “Day choice conflict: Ben and Debby. No reveal scheduled.”' The frame and 'G04.conflict.status' say 'Day conflict'. Brief, every frame: 'No counts, progress or names of who hasn't confirmed, accepted or added anything'. T33: no 'Waiting for Debby'.
- **Meanwhile, and who acts (founder):** Meanwhile the brief's rule wins. The other four see Friday as 'No reveal scheduled' with no names. Ben and Debby see the conflict with both names, as drawn. Use 'Day conflict' everywhere, including the disabled button's VoiceOver label. Ask the founder whether spec 05's 'visible' means visible to the whole club with names, and record it in QUESTIONS.md.
- **Second reviewer:** The main point holds. The brief allowed both names on the contested day only for the two people choosing it: its rule for Ben's view says 'Both names in words', and its VoiceOver question says 'a contested day names both people'. For the other four, the every-frame rule applies: 'No counts, progress or names of who hasn't confirmed'. Under Default 2, Ben and Debby cannot confirm Friday, so 'Day choice conflict: Ben and Debby.' tells four other people who hasn't confirmed. T6 and spec 05 say conflicts are shown, but not to whom. The Monday part of the finding does not stand. 'No reveal scheduled' names nobody, and the finding's own action shows Monday with those same words. The second name for the state is true: 'Day choice conflict' appears in otherFriday and in G04.conflict.confirm.vo, while the frame, G04.conflict.status and the Friday VoiceOver label say 'Day conflict'.


### R-02 · G04-conflict · handoff 3 · should · confirmed

- **Rule:** Brief item 1: 'Nobody is asked or reminded to give way (T33, T36)'. Spec 05: 'Encourage spaced assignments, but do not create compulsory receiving work.' Book p34: 'A component has one shape, one meaning.' The brand uses destructive for Revoke link and the invalid-field border (handoffs 1 and 2). Handoff 4's own rule for Link revoked: 'Status ink stays secondaryText; there is no colour-only meaning or punitive red.'
- **Finding:** The contested Friday row has its border and its 'Day conflict' label in the destructive token. That is the brand's colour for destructive actions and errors. So a choice two friends made reads as an error to fix. Handoff 4 keeps Link revoked out of red for this reason.
- **Evidence:** G04-conflict.svg: <rect x="20" y="492" width="353" height="74" rx="12" fill="#F0F2EC" stroke="#AD3529" stroke-width="1"/>, with the 'Day conflict' glyphs filled #AD3529. component-contracts.json handoff3.G04ChoiceRow: "conflictInk": "destructive", "conflictBorder": "destructive". Handoff 4 IMPLEMENTATION.md: 'Status ink stays secondaryText; there is no colour-only meaning or punitive red.'
- **Meanwhile, and who acts (claude-design):** Meanwhile build it as drawn. It uses a token, and the words carry the state. In the next brief, ask Claude Design whether a state nobody is required to resolve should take a non-destructive ink, as Link revoked does.


### R-03 · H01-offline (written under H01-loading) · handoff 3 · should · confirmed

- **Rule:** Spec 08's table: 'Offline | Dated cached state and target time | Retry'. Spec 08's acceptance: 'The next person, date and Add destination always agree.' Spec 34: 'Offline clients can browse already authorized cached revealed content with a visible offline state.' T49: 'Offline shows the cached state with its date.' Spec 03: 'Member's upcoming occurrence | Person and date | Debby's Friday'.
- **Finding:** Offline Home keeps only a last-checked time and a 'Last known opening' with a date and zone. It names no person. It also forbids revealed content that is already authorized and cached, which spec 34 allows offline. During Debby's open Friday, offline Home would show only an opening time that has passed.
- **Evidence:** copy-contracts.json handoff3: 'H01.offline.target = Last known opening: {fullTargetDateAndTime} · {clubZoneName}', with no person parameter. IMPLEMENTATION.md: 'Only dated scheduling metadata is eligible; no captions, photos, live countdown or current-ready claim. The target is labelled last known, even when its time has passed.' Spec 34: 'Offline clients can browse already authorized cached revealed content with a visible offline state.'
- **Meanwhile, and who acts (claude-design):** Meanwhile build offline Home from spec 08 and 34 and T49, and mark it 'built from spec'. Show 'Offline', the last-checked date, the cached person with the exact target date and time, and Retry, with no live countdown. Revealed content already cached for this account and membership interval stays browsable. Nothing unrevealed unlocks, and a known denial clears the cache. Ask Claude Design for the H01-offline frame (B5), including an open day.


### R-04 · H01-paused · handoff 3 · note · adjusted

- **Rule:** FQ16's default: 'No new occurrences are generated, Home says the club needs another member, and Memories stays readable for whoever remains. An invitation restarts it.' It is silent on occurrences already announced. Section 5 of the briefs lists 'what happens to the announced days of a member who leaves' as an open question. Spec 06: 'Removed or cancelled occurrences are terminal exceptions.' T6: 'Announced reveal times and submitted drops never move.'
- **Finding:** The delivery says a paused club keeps any promised occurrences rather than cancelling them because of the pause. This follows T6 and FQ16. It doesn't settle what happens to a departed member's announced days, which stays an open question.
- **Evidence:** component-contracts.json handoff3.pausedHome.announcedDaysIfAny: 'Keep promised occurrences; do not cancel them because the club has fewer than two active members.' IMPLEMENTATION.md: 'The fixture has no remaining announced day; if an actual paused club still has promised occurrences, preserve them rather than silently cancelling them.' Briefs section 5 already lists 'what happens to the announced days of a member who leaves'.
- **Meanwhile, and who acts (founder):** Meanwhile follow FQ16 (no new days) and T6: the remaining member's own announced occurrences stay. Write no copy that promises or cancels a departed member's days. Record the departure question in QUESTIONS.md as section 5 already plans.
- **Second reviewer:** The finding reads more into the delivery than it says. The contract limits the rule to a reason: 'do not cancel them because the club has fewer than two active members.' It says the pause alone cancels nothing. That follows T6 ('Announced reveal times ... never move') and FQ16, which stops only new occurrences. It doesn't decide whether a departed member's announced days survive their leaving, which is a different reason. That open question is already queued in the briefs' section 5 ('what happens to the announced days of a member who leaves'). One small gap: the paused Add picker has 'no new target in paused Kitchen table'. If a remaining member's own announced day survives, the picker would give no way to add to it.


### R-05 · G05-members-two-days (handoff 2 frame) under handoff 4's footer rule · handoff 4 · should · confirmed

- **Rule:** Handoff 4's own contract: 'membersFooter.clubName = Already in the title, and title/roster/count refer to the same resolved club' and 'Do not invent a pair club name'. Spec 04: Ben 'names it', so every club has a name. Book p24: 'The displayed club, count and roster agree.'
- **Finding:** Handoff 2's G05-members-two-days puts 'Ben and Debby' where the club's name goes. Handoff 4 says the title names the resolved club and that no pair club name should be invented. A real pair club has its own name, so that title is a fixture stand-in.
- **Evidence:** Handoff 2 screen-copy.json G05-members-two-days: 'Members', 'Ben and Debby', 'Two reveal days each.', ... 'New York · 7 AM to 1 AM the next morning.' Handoff 4 IMPLEMENTATION.md: 'The title names the resolved club ... for the unnamed pair use “2 members · New York”. Do not invent a pair club name.'
- **Meanwhile, and who acts (app):** Build every Members title from the club's own name, with handoff 4's two footer lines ('{count} members · {zone}' and '7 AM to 1 AM the next morning.'). Record 'Ben and Debby' as a fixture stand-in in INVENTORY.md's Known differences. No question is needed.


### R-06 · G05-schedule, G04-change, G05-members footer, F01 rows · handoff both · should · confirmed

- **Rule:** FQ44's default (Default 8): 'the phone's own region and clock settings, through iOS's date templates … Snapshot tests fix one region.' The delivery's own handoff3.snapshot.datePolicy: 'Device region and clock, wide weekday and month names.'
- **Finding:** Reusable keys write the opening and closing times as literal '7 AM' and '1 AM', and several also write 'New York'. A phone set to a 24-hour clock would still read '7 AM', and a club in another zone would read New York.
- **Evidence:** copy-contracts.json handoff3: 'G05.schedule.hours = 7 AM to 1 AM the next morning'; 'G05.schedule.revealHoursZone = New York · 7 AM to 1 AM the next morning'; 'G05.schedule.hoursVO = Each reveal opens at 7 AM and Home closes at 1 AM the next morning, in New York.'; 'G05.schedule.vo.Monday = Monday. Ben’s day. Opens at 7 AM and closes at 1 AM on Tuesday, New York.' handoff4: 'members.footer.hours = 7 AM to 1 AM the next morning.' handoff3.snapshot.datePolicy: 'Device region and clock, wide weekday and month names.'
- **Meanwhile, and who acts (app):** Build these keys as templates. The times come from the one formatter (FQ44) and the zone from the club. Snapshots fix en-US on a 12-hour clock, as the delivery did. Ask the next brief for templated keys.


### R-07 · Candidate roster review (G02-invitation, G02-changed) · handoff 4 · should · confirmed

- **Rule:** Book p9's render G02-invitation shows Maya's and Debby's photographs to the candidate. INVENTORY.md Known differences: 'People appear only as initials. A member's photo shows when they have one; the initial is the fallback (spec 29's A03, book p8).' T7 ('grants nothing before acceptance: no captions, photos, membership activity or upload destinations') and spec 04 ('Unaccepted invitees cannot see captions, photographs …') don't say whether profile photographs count.
- **Finding:** Handoff 4 adds a privacy rule that no source states: a candidate's roster review shows names and initials, never members' profile photographs. It is a stricter reading of T7's 'photos'. The book's invitation render and the inventory's build rule show photographs.
- **Evidence:** Handoff 4 IMPLEMENTATION.md, G03-approve: 'Roster review uses names and initials, not other members’ photograph avatars.' 2.1/G02-invitation.png shows Maya's and Debby's photographs to Ben, the candidate. INVENTORY.md: 'A member's photo shows when they have one; the initial is the fallback'.
- **Meanwhile, and who acts (founder):** Meanwhile the candidate's roster review shows initials only. That is the stricter, reversible reading. Members' own screens keep photographs. Ask the founder whether T7's 'photos' covers profile photographs, and record it as an FQ.


### R-08 · G03-approve · handoff 4 · note · adjusted

- **Rule:** T47: every control has a VoiceOver name. T43: copy is direct and factual. Book p30: 'Each current member approves the exact proposed roster; Leila accepts that roster.'
- **Finding:** The Decline button's VoiceOver label, 'Decline this invitation for Kitchen table. No reason is required.', doesn't name Leila. The primary's label does: 'Approve Leila joining Kitchen table.'
- **Evidence:** copy-contracts.json handoff4: 'approval.decline.vo = Decline this invitation for Kitchen table. No reason is required.' and 'approval.primary.vo = Approve Leila joining Kitchen table.' G03-approve.svg has the same aria-labels. The visible title is 'Invite Leila?'.
- **Meanwhile, and who acts (claude-design):** Meanwhile build the label as delivered. In the next brief, ask for a label that names Leila, parallel to the primary's.
- **Second reviewer:** The label doesn't describe the wrong action. The invitation in question is Leila's, which the visible title 'Invite Leila?' and the nav 'New member' name. The product's own words call a member's refusal 'declined' ('We don’t identify who declined'), so 'Decline this invitation' is a fair description of what Maya does. The only real gap is that the label doesn't name Leila, while the primary's does. That is wording, not a broken rule: T47 is met. The proposed replacement, the bare 'Decline', would drop 'No reason is required.'


### R-09 · G04-change (start date passed) · handoff 3 · note · confirmed

- **Rule:** Default 3: 'Every active member confirms, including the new one. The current days continue until everyone has.' Spec 05: 'The schedule service first finds a future boundary with no submitted occurrence affected, then requests confirmation.' Neither covers a proposal that lapses.
- **Finding:** The delivery adds a rule. When a proposed start passes without every confirmation, the server picks a new future date, keeps no earlier confirmations and asks everyone to review again.
- **Evidence:** IMPLEMENTATION.md: 'If the proposed date passes without complete confirmation, the server chooses a fresh exact future boundary, preserving every announced occurrence, and asks for a new review of that proposal. It does not activate late or carry old confirmations silently.' copy-contracts.json handoff3: 'G04.error.pastStart = Couldn’t confirm that start date. Review the new proposed date.'
- **Meanwhile, and who acts (founder):** Meanwhile build it this way. It never activates late and never moves an announced day. Record it in QUESTIONS.md with the G04 questions from section 5 of the briefs, noting the repeated re-review for members who already confirmed.


### R-10 · G04-conflict (Ben's proposed Monday) · handoff 3 · note · confirmed

- **Rule:** Book p11: 'Occupied days identify their owner.' Spec 05: 'Members select available slots and confirm.' Default 2 ends the conflict 'only when one of them chooses another day'.
- **Finding:** 'Available' on a day still 'Proposed for Ben' means any member who hasn't confirmed, Debby included, may take Ben's proposed day. No source or Default says whether a proposed but unconfirmed day is held for its proposed person.
- **Evidence:** screen-copy.json G04-conflict: 'Proposed for Ben · Available'. VoiceOver: 'Monday. Proposed for Ben. Available. Not selected. Choose Monday.' IMPLEMENTATION.md: 'Debby can explicitly choose an available day'.
- **Meanwhile, and who acts (founder):** Meanwhile the server treats only confirmed days as occupied (book p11), so Monday stays open to Ben or Debby. Build the row as drawn, and record the question in QUESTIONS.md.


### R-11 · G04-conflict; G05-schedule and G04-change VoiceOver · handoff 3 · note · confirmed

- **Rule:** Book p7: 'Mark the current member with You.' Book p11: 'Ben’s own row is You.' Handoff 3's own youLabel: 'Name · You'. F01's label 'Ben, you. …'.
- **Finding:** On G04-conflict, Ben reads Ben's own name in the third person ('Proposed for Ben', 'Friday is chosen by Ben and Debby.') with no You. That differs from 'Ben · You' on G04-change, G05-schedule, F01 and 2.1's G04-one-day. The VoiceOver labels on G05-schedule and G04-change also leave out the 'you' that F01's label keeps.
- **Evidence:** screen-copy.json G04-conflict has no 'You'. 'G05.schedule.vo.Monday = Monday. Ben’s day. Opens at 7 AM …' sits beside the visible 'Ben · You'. 'G04.change.vo.Monday = Monday. Ben’s day in the proposed week …'. 'F01.row.vo.Ben = Ben, you. …'. 2.1/G04-one-day.png: 'Ben · You'.
- **Meanwhile, and who acts (claude-design):** Build as delivered: the names are true, and Friday's label says 'Your current choice'. Put the question in the next brief.


### R-12 · G04-conflict · handoff 3 · note · confirmed

- **Rule:** Default 2: 'While two members have chosen the same day…'. Spec 05 allocates one day each in clubs of four to six, so three members can choose the same weekday.
- **Finding:** The conflict copy and VoiceOver labels assume exactly two people. No template or rule covers three or more.
- **Evidence:** copy-contracts.json handoff3: 'G04.conflict.help = Either person can change a choice.', 'G04.conflict.fridayPeople = Ben and Debby', 'G04.conflict.explanation = Friday is chosen by Ben and Debby.'
- **Meanwhile, and who acts (claude-design):** Meanwhile the server applies the Default to any number of people: nobody can confirm a day more than one member has chosen. The app joins the names with the system list formatter, and shows 'Either person …' only when exactly two people have chosen the day. Ask Claude Design for the wording for three or more.


### R-13 · G01-invite-people-revoked · handoff 4 · note · adjusted

- **Rule:** Default 1: 'under T7 a club starts as soon as one person accepts'. T7.
- **Finding:** The list shows Debby 'Accepted' under the title 'Create a club'. Under Default 1, Debby's acceptance has already started Sunday people, so this is an active club's invitation list, not club creation. Club details can hold new invitations (book p24), but no route says where Ben manages the links already sent once the club has started.
- **Evidence:** screen-copy.json G01-invite-people-revoked: 'Create a club', 'Invite your people', … 'Debby', 'Accepted'. frame-manifest.json: "acceptedInvitee": "Debby". Book p24: 'A full six-member club offers no extra member invitation.' Handoff 3 IMPLEMENTATION.md: 'An optional invitation action is available inside details'.
- **Meanwhile, and who acts (claude-design):** Build it as drawn for the setup route. In the next brief, ask for the title and route of the invitation list once a club has started, reached from Club details.
- **Second reviewer:** The title problem is true. The frame keeps 'Create a club' with Debby 'Accepted' (frame-manifest acceptedInvitee: Debby). Under Default 1, Debby's acceptance has already started Sunday people. The brief supplied this fixture from handoff 1. The route claim goes too far. Book p24 ('A full six-member club offers no extra member invitation') implies Club details offers invitations for a club that isn't full. Handoff 3 puts the paused club's invitation action 'inside details'. What no source routes is managing the links already sent (Share again, Revoke, Create new link) once the club has started.


### R-14 · copy-contracts.json, active handoff3 and handoff4 keys · handoff both · note · confirmed

- **Rule:** Spec 03 and T41 to T43 apply to every club. The delivery's own README: 'Braced date/time placeholders are formatter parameters, not literal UI.'
- **Finding:** Many active keys write the fixture's names into the string, with no template beside them. String files built straight from them would show Kitchen table, Sunday people, Ben, Debby, Alex, Friday or New York to every club.
- **Evidence:** 'G04.conflict.explanation = Friday is chosen by Ben and Debby.', 'G04.conflict.monday = Proposed for Ben · Available', 'H01.paused.body = Kitchen table needs another member for new days.', 'H01.paused.action.vo = View accessible Memories in Kitchen table.', 'F01.schedule.vo = See schedule for Sunday people.', 'handoff4.invite.createNew.Alex.vo = Create new link for Alex', 'common.newYork = New York'. Templated by contrast: 'G04.error.chooseTaken = Couldn’t choose {weekday}. …', 'H01.loading.vo = Loading {clubName}.'
- **Meanwhile, and who acts (app):** Build string templates with the same words and parameters for names, club, weekday and zone. This is mechanical and doesn't change the copy. The copy lint runs on the templates, and snapshot tests use the fixture values.


### R-15 · H01-unavailable (suspended club) · handoff 3 · note · confirmed

- **Rule:** T9: a suspended club or occurrence grants no reads. Spec 22 asks for 'a neutral client explanation'. INVENTORY.md's row reads 'H01-paused | Club paused (fewer than two members, or suspended)'.
- **Finding:** The delivery rightly separates suspension from pause: Memories stays readable in a paused club and is denied in a suspended one. It gives the copy and says suspension needs a frame of its own, but doesn't draw one. The inventory's H01-paused row still covers both cases.
- **Evidence:** IMPLEMENTATION.md: 'Yes, suspension needs its own frame: paused permits Memories, while unavailable denies it. It is outside this requested render set'. copy-contracts.json handoff3: 'H01.suspended.title = Club unavailable', 'H01.suspended.body = This club isn’t available right now.' INVENTORY.md: 'H01-paused | Club paused (fewer than two members, or suspended)'.
- **Meanwhile, and who acts (claude-design):** Build H01-unavailable from the H01.suspended.* keys and mark it 'built from spec'. Add an inventory row for it, deleting no row (ADR-020). Ask Claude Design for the frame in a later brief.


## Brand, visuals, native iOS and accessibility

Brand, visuals, native iOS and accessibility check of handoffs 3 and 4. I viewed every frame PNG and compared each with the nearest 2.1 render and with the handoff 1 and 2 frames. I also parsed every SVG: fills, strokes, glyph sizes, and weights measured from glyph outline area. The brand holds. Every colour in all 15 phone frames and both sheets is a revision 1.1 token, light or dark as fits the frame. The only exception is the Dynamic Island colour #090F0D, which is device chrome and appears in all 27 earlier frames that carry it. All text pairs are at least 4.5:1; the lowest is secondaryText on surface at 4.64:1. F01-friends-dark is a real dark theme, and its four photographs are byte-identical to the light frame's, with no filter or opacity. Both replacement sheets are complete supersets: handoff 3's sheet is pixel-identical to handoff 2's over handoff 2's 3790 points, and handoff 4's to handoff 3's over 4670 points, with every earlier label kept. Nothing reaches must. Five findings are should. (1) G04-conflict draws the contested day in destructive red. (2) G04-conflict adds a third shape for choosing a day, in which an available day and an assigned day look the same. (3) The contested row's geometry disagrees with its own contract and uses an inset outside the spacing scale. (4) Nine keyed VoiceOver labels drop the words shown on their buttons. (5) The pre-activation and paused Home screens carry no object from the book (founder's call). Five notes cover smaller inconsistencies: the You label and the zone, a 17-point button gap, the vertical rhythm, Ben's avatar, and the card status format on the sheet.


### V-01 · G04-conflict · handoff 3 · should · adjusted

- **Rule:** Book p34 ('A component has one shape, one meaning'); book p32 ('Destructive choices explain consequences before confirmation'); the brief's G04-conflict rule 'Nobody is asked or reminded to give way (T33, T36)'; handoff 4's own guidance for Link revoked
- **Finding:** G04-conflict marks the contested Friday in the destructive token: a red outline and a red 'Day conflict'. In these brand files, destructive means an error (A02-code-error) or a destructive action (Revoke link). A day two friends both chose is neither. Handoff 4 itself rules out 'punitive red' for a comparable status (Link revoked). In red, the contested day reads as an alarm, which works against the brief's 'Nobody is asked or reminded to give way'.
- **Evidence:** G04-conflict.svg: <rect x="20" y="492" width="353" height="74" rx="12" fill="#F0F2EC" stroke="#AD3529" stroke-width="1"/>; 'Day conflict' 13 pt bold, fill #AD3529. component-contracts.json handoff3.G04ChoiceRow: "conflictInk": "destructive", "conflictBorder": "destructive". Handoffs 1 and 2 A02-code-error.svg: field rect fill #F0F2EC, stroke #AD3529, error text fill #AD3529 (the same treatment). Handoff 2 G01-invite-people-add.svg: 'Revoke link' fill #AD3529. Handoff 4 IMPLEMENTATION.md, Link revoked: "Status ink stays secondaryText; there is no colour-only meaning or punitive red." Handoff 3 IMPLEMENTATION.md: "destructive text on the conflict uses destructive, not reduced opacity."
- **Meanwhile, and who acts (claude-design):** Meanwhile the app builds G04-conflict as drawn. The colour comes from a token, and the words 'Day conflict' carry the state, so colour isn't the only signal (T44). The PR notes that the conflict reuses the error treatment. The next brief asks Claude Design whether a contested day should take destructive or a neutral ink, given handoff 4's 'no punitive red'.
- **Second reviewer:** The red treatment is drawn as described. But the claim that destructive marks only a destructive action is false. Handoffs 1 and 2's A02-code-error use the same red outline and red text for an error message. So the conflict reuses the error treatment rather than giving the token a new meaning. The real problem is narrower: a contested day is nobody's error, and handoff 4 rules out red for a comparable status.


### V-02 · G04-conflict · handoff 3 · should · confirmed

- **Rule:** Book p34 (one shape, one meaning); book p6 ('Use one small weekday/date plaque'); book p11 ('Occupied days identify their owner'); the brief names 2.1's G04-one-day and G04-two-days as the closest renders
- **Finding:** G04-conflict adds a third shape for choosing a weekday: a plain list with a checkmark. 2.1 has a plaque with a week list (G04-one-day) and a tile grid (G04-two-days). In the new list, Monday (selectable) and Tuesday (Maya's, not selectable) are drawn identically; only the words 'Available' and 'Assigned' differ. 2.1's tiles make available, occupied and chosen visibly different. The date plaque that G04-one-day leads with is gone; no plaque appears in any handoff 3 or 4 phone frame.
- **Evidence:** G04-conflict.svg: seven 58-point rows divided by 1-point separators at y=316, 374, 432, 490, 624 and 682. Every weekday is a 17 pt bold primaryText run and every owner line 13 pt regular secondaryText, Monday and Tuesday alike, on canvas #FAFBF8. The only selection mark is a checkmark (path 'M5 12 L10 17 L20 6' at translate(337 514)). Pixels sampled from 2.1 G04-two-days: available Wed tile #FFFFFD; occupied Debby tile #F0F3EA; chosen 'Your day' tile #DFE2F1 with an action border #2F4EBA. 2.1 G04-one-day draws the MON 09 plaque, sampled #EFE79E. No phone frame in either delivery contains the accent #F0E4A8 or a 45x55 plaque.
- **Meanwhile, and who acts (claude-design):** Meanwhile the app builds G04-conflict as drawn for the contested state, using native List selection with the words. It keeps 2.1's G04-one-day and G04-two-days for their own states, and lists the three shapes in the PR. The next brief asks for one day-choice component across one-day, two-day and conflict, with available and occupied days visibly distinct, and whether the plaque belongs on it.


### V-03 · G04-conflict · handoff 3 · should · adjusted

- **Rule:** T44 ('Every colour, spacing, radius and type size comes from the design system's tokens'); book p35 spacing 4, 8, 12, 16, 20, 24, 32; handoff 4's own spacing policy
- **Finding:** The contested row's text is inset 14 points from its outline. That inset is off book p35's scale, and no contract names it. Handoff 4's optical exceptions name only 6 and 5, and the card's 18. The text field's placeholder sits at the same unnamed 14. The row's height agrees with its contract: a 76-point slot holding a 74-point outline.
- **Evidence:** G04-conflict.svg: the 'Friday', 'Ben and Debby' and 'Day conflict' runs start at x=34; the outline rect is at x=20 (every other row's text is at x=20). The separator occupies 490–491 and the outline 492–566. Saturday's row is 567–625 (baseline 590, separator 624), so the slot is 76, matching handoff3.G04ChoiceRow "contestedMinimumHeight": 76, just as 58-point rows include their separator. handoff4.opticalInsets lists only photoHighlightBlock 6 and proposedTagBlock 5, "Not additional general layout spacing steps." componentGeometry.collectingCard.inset 18: "not a new general spacing step". G02-link-entry-signed-in.svg: field rect x=20, placeholder 'Paste invitation link' x=34.
- **Meanwhile, and who acts (claude-design):** Meanwhile the app builds the contracted 76-point minimum slot, which grows with text. It keeps the drawn 14-point inner inset as one named constant, shared with the field's text inset, and flags it in the PR as outside book p35's scale (T44). The next brief asks Claude Design to name that inset.
- **Second reviewer:** The height contradiction doesn't hold. Ordinary rows are counted separator to separator (58), and the contested row's slot runs from the separator at 490 to Saturday's row at 567: 76 points, as contracted. The 74-point outline sits inside that slot with 1 point clear above and below, not 2 above and 0 below. The 14-point inner inset is real, off book p35's scale, and named nowhere. The text field's placeholder uses the same 14.


### V-04 · G04-conflict, G05-schedule, H01-awaiting-activation, H01-paused, H01-loading, G01-pending, G06-no-club, G02-link-entry-signed-in, G01-invite-people-revoked, G02-revoked · handoff both · should · confirmed

- **Rule:** T47 (every control has a VoiceOver name); book p26 ('Use native controls ... accessible icon names'); WCAG 2.5.3 Label in Name: a control's accessible name contains its visible words, which iOS Voice Control matches spoken commands against
- **Finding:** Nine keyed VoiceOver labels drop the words their buttons show. A Voice Control user who says the visible label ('Tap Done for now') gets no match. A VoiceOver user who can see the screen hears different words. Handoff 2's labels kept the visible words, and so does the rest of these deliveries. H01-loading shows 'Loading Home…' but speaks 'Loading Sunday people.'
- **Evidence:** Visible text, then keyed label in copy-contracts.json: 'Not now' → handoff3.G04.conflict.notNow.vo 'Keep the current choice and return.'; 'View local times' → handoff3.G05.schedule.localAction.vo 'View scheduled opening and closing times in your time zone.'; '+ Add' on H01-awaiting, H01-paused, H01-loading and G06-no-club → handoff3.header.addPrivate.vo and handoff4.noClub.add.vo 'Save a private draft or open private drafts.'; 'Review members' → handoff3.H01.awaiting.action.vo and handoff4.pending.primary.vo 'Review Sunday people’s proposed members.'; 'View Memories' → handoff3.H01.paused.action.vo 'View accessible Memories in Kitchen table.'; 'I have an invite' → handoff4.noClub.invite.vo 'Open an invitation link.'; 'Continue' → handoff4.link.continue.vo 'Check the invitation link.'; 'Done for now' → handoff4.invite.done.vo 'Finish managing invitations for now.'; 'Close invitation' → handoff4.unavailable.primary.vo 'Close this invitation and return to Home.' Handoff 2's F01-no-club labelled the same controls '+ Add' and 'I have an invite'. Kept elsewhere: 'Share link for Alex', 'Approve Leila joining Kitchen table.', 'See schedule for Sunday people.'
- **Meanwhile, and who acts (claude-design):** Meanwhile the app uses the keyed labels. On each of these nine controls it also sets accessibilityUserInputLabels to the visible words, so Voice Control works, and it lists them in the PR. The next brief asks Claude Design to reword each label so it starts with the visible words, with any extra words moved to a hint.


### V-05 · H01-awaiting-activation, G01-pending, H01-paused · handoff both · should · confirmed

- **Rule:** Book p5 ('An interchangeable shell ... could be reskinned'; 'Build around a particular object and rhythm. Tadayo repeats a date marker, a person's name and one folded-card geometry'); CLAUDE.md 'Nothing generic'; the briefs' section 4: 'Something from the book on the empty Home: still your call'
- **Finding:** The before-start and paused Home screens are a title, body text, the drafts row and a button over empty canvas. None of the book's objects appears: no plaque, no folded card, no other person's name or photograph. Claude Design argues this is deliberate: proposed names would make the club look started, and a paused club has no next day. Whether that's acceptable is the same call the founder still holds for the empty Home.
- **Evidence:** H01-awaiting-activation.svg and G01-pending.svg: a 32 bold title, a two-line body, the 353x76 Private drafts row, a 13 pt caption and one 50-point button. The only image is Ben's 28-point header photo on H01; G01-pending has none. Between the caption at y=498 and the button at y=696 (H01) or y=724 (G01) the canvas is empty. H01-paused.svg: a title and two body paragraphs ending at y=337, then nothing until View Memories at y=644. Handoff 3 IMPLEMENTATION.md: "The truthful objects here are the selected club’s name, Ben’s own photograph, native navigation/actions and the author’s Private drafts row. Proposed names ... are omitted from Home so it cannot look like a started club."
- **Meanwhile, and who acts (founder):** Meanwhile the app builds the three frames as drawn. The founder decides whether to ask Claude Design for a book object on these states, for example the proposed names in an explicitly labelled Proposed roster, or the club's week, or to accept the plain screens.


### V-06 · G05-schedule · handoff 3 · note · adjusted

- **Rule:** Book p34 (one shape, one meaning); handoff3.youLabel contract
- **Finding:** G05-schedule draws 'Ben · You' in regular weight, though the youLabel contract puts You in the bold row role, as on F01, G04-change and G05-members. The same frame sets the club's zone, 'New York', in the bold eyebrow role, where F01 and G04-change set it in regular metadata. The eyebrow is a named role, and no contract says which role G05-schedule's zone takes.
- **Evidence:** G05-schedule.svg: the 'Ben · You' glyphs are regular-weight outlines at 17 pt (B path 'M1258 397…'), like the other five names. F01-friends, G04-change and handoff 1's G05-members use the bold outline ('M1386 402…'). component-contracts.json handoff3.youLabel: {"shape": "Name · You", "typeRole": "row"}. Handoff 3 IMPLEMENTATION.md: "You is always part of the name line, Ben · You, in row 17/22 bold." 'New York' at y=242: 13 pt bold, #607067. supplementalTypeRoles.eyebrow: 13/18 bold, secondaryText. friendsScheduleFooter.zoneRole: "metadata" (Friends only). F01 'New York' (y=748) and G04-change 'New York · 7 AM to 1 AM the next morning' (y=300): 13 pt regular.
- **Meanwhile, and who acts (app):** Meanwhile the app sets 'Ben · You' in the row role, per the youLabel contract. It builds G05-schedule's 'New York' as drawn, in the named eyebrow role. The PR notes both differences, and the next brief asks Claude Design to confirm the zone's role on G05-schedule.
- **Second reviewer:** Both differences are real. Glyph outlines show G05-schedule's 'Ben · You' is regular Arimo (B path 'M1258 397…'), while F01-friends, G04-change and handoff 1's G05-members use bold ('M1386 402…'). G05-schedule's 'New York' is bold, while F01 and G04-change set it regular. The proposed action goes too far on the zone, though. The youLabel contract settles 'Ben · You', so the app follows it. But 13/18 bold secondaryText is the named eyebrow role (supplementalTypeRoles.eyebrow), and no contract names G05-schedule's zone role. Re-setting it in metadata would change the frame with no rule behind it.


### V-07 · G06-no-club · handoff 4 · note · confirmed

- **Rule:** T44 (spacing from tokens); book p35 spacing scale; handoff 2's invitationEntryAction (one shape for I have an invite)
- **Finding:** On the G06-no-club redraw, the Create a club and I have an invite buttons sit 17 points apart, outside the scale. Handoff 2's F01-no-club stacks the same pair 16 points apart. The 17 comes from keeping the old text link's baseline.
- **Evidence:** G06-no-club.svg: Create a club rect y=321 height=50; I have an invite rect y=388 height=50; gap 17. Handoff 2 F01-no-club.svg: rects y=492 and y=558, both height 50; gap 16. Handoff 4 IMPLEMENTATION.md: "I have an invite becomes the standard 50 pt secondary button at y388, preserving the prior text baseline."
- **Meanwhile, and who acts (app):** Meanwhile the app stacks the pair with spacing.16, as on F01-no-club (T44), and notes the 1-point difference in the PR.


### V-08 · H01-awaiting-activation, H01-paused, G01-pending, G04-change, G05-schedule · handoff both · note · confirmed

- **Rule:** T44; book p35 spacing scale; book p34 (one shape, one meaning)
- **Finding:** No contract names the vertical rhythm of the new frames, and it varies. On the Home states, the gap from title to body is about twice that on every other screen. The G01-pending redraw widens handoff 1's gap to match. G04-change draws the same person-and-dates row at two pitches. G05-schedule gives each one-line weekday row a 57-point height with the text near the top, as if a second line were reserved.
- **Evidence:** Baselines from title to body: H01-awaiting-activation 205→282 (77); H01-paused 174→250 (76); G01-pending 205→282 (77), against handoff 1's G01-pending 194→245 (51); F01-friends 151→188 (37); G04-change 149→184 (35); G06-no-club 174→222 (48). G04-change: the 'Through' list's names at y=375 and 430 (pitch 55, 22 to the dates line); the 'From' list at 529, 579 and 629 (pitch 50, 21). G05-schedule: separators every 57 points (324, 381, ...); Tuesday's caps start about 14 points below the separator above, and its descenders end about 27 points above the one below.
- **Meanwhile, and who acts (claude-design):** Meanwhile the app reproduces the frames' positions using the nearest stack spacing it can name, and records the unnamed gaps in the PR. The next brief asks Claude Design for the spacing tokens between title, body, rows and footer on these screens.


### V-09 · G06-no-club vs H01-awaiting-activation, H01-paused, H01-loading, F01-friends · handoff both · note · confirmed

- **Rule:** Book p8 ('Names and photographs carry the feeling'); book p34 (one shape, one meaning); the fixture cast (book p50)
- **Finding:** The same account, Ben, has a photograph in every handoff 3 header but only the 'B' initial in handoff 4's G06-no-club. Both are valid states of one header component. Snapshot fixtures still need one Ben.
- **Evidence:** H01-*.svg and F01-friends*.svg: the account is a 28-point image (SHA-256 prefix 9fc869770f80) with a 1-point separator edge at r=14.5. G06-no-club.svg: <circle cx="359.0" cy="78.0" r="14.0" fill="#E1E5F6"/> with a 13 bold 'B', labelled 'Account'. Handoff 4 IMPLEMENTATION.md: "the existing 28 pt Ben initial fallback trailing".
- **Meanwhile, and who acts (app):** Meanwhile the app's header shows the account's photograph when it has one and the initial otherwise. Snapshots use a photo-less Ben for G06-no-club, to match the frame, and Ben with a photograph elsewhere. The fixture split is noted in the PR.


### V-10 · brand-components (collecting card specimens) · handoff 4 · note · confirmed

- **Rule:** FQ44 (one formatter, the phone's region and clock); book p6 ('A folded card marks hidden content; a lock appears only before reveal'); 2.1 F02-upcoming; book p34
- **Finding:** One replacement sheet now shows the collecting card's status line two ways. The kept light specimen reads 'Opens Fri 13 Nov'. The new dark specimen reads 'Opens Friday, November 13, 2026 at 7 AM', adding the year and the time, and joining time to date with 'at' where Friends rows use '·'. Neither draws the lock that 2.1's F02-upcoming draws before the card status on a hidden card.
- **Evidence:** Handoff 4 brand-components.svg labels: 'Opens Fri 13 Nov' (kept from handoff 2) and 'Opens Friday, November 13, 2026 at 7 AM' (dark card: path fill #D4D9EC, fold stroke #8C8F84, no lock shape). F01-friends rows: 'Monday, November 9 · 7 AM'. 2.1 F02-upcoming.png draws a lock glyph before 'Opens Fri 13 Nov' on each card. INVENTORY.md already records: "Built as 2.1 and the sheet: the lock glyph and 'Opens Fri 13 Nov', without 'Locked'".
- **Meanwhile, and who acts (claude-design):** Meanwhile the app keeps what INVENTORY.md records: the lock glyph, with the date written through the FQ44 formatter, and the card status contents taken from 2.1's F02-upcoming. The next brief asks Claude Design to confirm the card status's fields (year, time) and the lock.


## Consistency, file integrity and what the build needs

Both packs hold together. Handoff 4's G01-pending matches handoff 3's H01-awaiting-activation in its words, its action, its route and what it keeps private. The two differ only where stated: the pushed navigation bar, no tabs, and the primary button at y724 instead of y696. Handoff 4's cumulative files keep every handoff 3 copy key (197) and component leaf (234) unchanged, and every handoff 2 key. The only handoff 2 changes are curly apostrophes, four retainedState notes that now point to handoff 4 keys, the G03-approve viewer changed from Ben to Maya, and one added approval.enforcement line. The frame-manifest hashes, PNG sizes, PDF page counts, key counts, contrast ratios, quoted-string keys and the claim that each component sheet adds to the last without changing it all check out. Handoff 4 states each override of a handoff 1 or 2 frame or string in writing. But five earlier frames that weren't redrawn now carry superseded text (G05-members, G05-members-two-days, G01-invite-people and its -add variant, G03-declined, 2.1 G05-club-details). The inventory needs Known-differences entries for them. Most of the remaining work is in the inventory. Handoff 3 describes about 20 states, variants and sheets in writing that have no frame and no row: the proposed-roster review that both waiting screens open, H01-unavailable, the access-lost and load-error Homes, Friends and Memories before a club starts or while it's paused, the switcher's status labels, the Add picker with drafts only, the G04 variants (saved footer, Maya's view, race failure, other members' view), the transition week, the "Review the club's days" row and the local-times sheet. The 7 handoff 2 states and 4 handoff 4 states still have no rows. Three need the founder: handoff 3's offline Home is stricter than spec 34; the brief's own fixture has Debby Accepted under Default 1, so G01-invite-people-revoked shows a club that has already started; and the other four members see Ben and Debby named in the day conflict. Two states the brief listed are covered by neither delivery: Home after a club starts but before its days are confirmed, and Home during a single suspended day.


### X-01 · G02-link-entry-signed-in, G01-invite-people-revoked, G02-revoked, G02-web-revoked; G05-members-two-days, G01-invite-people-add, G01-invite-name, G01-invite-people-xl, G02-link-entry, G02-web-dark, G02-web-xl; G04-conflict, G04-change, G05-schedule, H01-awaiting-activation, H01-paused, H01-loading, F01-friends-dark, F01-friends, G03-approve, G01-pending, G06-no-club · handoff both · should · confirmed

- **Rule:** INVENTORY.md: 'Add rows for states you discover; never delete a row.' DESIGN-HANDOFF.md: 'screens/ ... for any state the founder has redrawn. When a state has a render in both screens/ and 2.1/, screens/ wins.'
- **Finding:** The delivered frames aren't reflected in the inventory at main. Handoff 4's 4 new states and handoff 2's 7 have no rows. Handoff 3's 7 states are still 'missing'. F01-friends and G03-approve still point to 2.1 renders, though handoffs 3 and 4 redrew them. G01-pending and G06-no-club are at 'requested 1', though handoff 4 has replaced handoff 1's frames.
- **Evidence:** INVENTORY.md has no row for G02-link-entry-signed-in, G01-invite-people-revoked, G02-revoked, G02-web-revoked, G05-members-two-days, G01-invite-people-add, G01-invite-name, G01-invite-people-xl, G02-link-entry, G02-web-dark or G02-web-xl. G04-conflict, G04-change, G05-schedule, H01-awaiting-activation, H01-paused, H01-loading and F01-friends-dark are 'missing'. F01-friends: '`2.1/F01-friends.png` | 2.1 #07 | received'. G03-approve: '`2.1/G03-approve.png` | 2.1 #30 | received'. G01-pending and G06-no-club: 'requested 1'. Handoff 4 manifest base values: G03-approve 'Handoff 2 G03-approve'; G01-pending 'Handoff 1 G01-pending; H2/H3 contracts'; G06-no-club 'Handoff 1 G06-no-club; H2 contracts'.
- **Meanwhile, and who acts (app):** When the ios thread brings handoffs 1 to 4 in: add the 11 rows; set handoff 3's and handoff 4's states to received, with renders at screens/<name>.png and the handoff number in Source; point F01-friends and G03-approve at screens/; then update the counts.


### X-02 · H01-paused, H01-unavailable, H01-access-lost, H01-load-error · handoff 3 · should · confirmed

- **Rule:** INVENTORY.md row rule; spec 29: 'Each screen must implement loading, empty, recoverable error and access revoked behaviour'; T9 (suspended club unreadable); book p41
- **Finding:** Handoff 3 splits the inventory's single H01-paused into separate states and adds Home failure states that have no rows. The H01-paused row still includes suspension, which handoff 3 moves to H01-unavailable because Memories is denied there. Access lost and the load failure with no cache are separate states with their own copy. H01-loading is at B2, but its failure path has no row; H01-offline is at B5.
- **Evidence:** INVENTORY: '`H01-paused` | Club paused (fewer than two members, or suspended) | ... | missing | B2 | FQ16' and '`H01-offline` | Cached state with its date | ... | B5 | T49'. Handoff 3: 'Suspension is a distinct H01-unavailable state: “Club unavailable” / “This club isn’t available right now.”, with Choose a club and Get help. Block all selected-club content in Home, Friends and Memories.'; 'When the selected club cannot be opened, show “This club is no longer available.” and “Choose a club to continue.”'; 'Not-started, paused, loading, offline and access-lost remain distinct states.' Key handoff3.H01.error.network = 'Couldn’t load Home. Check your connection and try again.'
- **Meanwhile, and who acts (app):** Correct H01-paused's Shows to 'Club paused (fewer than two members)'. Add rows at B2 for H01-unavailable (suspended; Friends and Memories denied too), H01-access-lost and H01-load-error, each 'built from spec' from handoff 3's keys. Until a frame decides, route Get help to the FQ6 support contact.


### X-03 · H01-unavailable, H01-access-lost · handoff 3 · should · confirmed

- **Rule:** DESIGN-HANDOFF.md / CLAUDE.md T46: a state with no render gets a handoff; spec 22: 'emergency suspension of an occurrence or club with a neutral client explanation'
- **Finding:** Claude Design says suspension needs its own frame and, as the brief asked, gave only words. The access-lost Home is also a separate state, with different copy and actions, and no frame.
- **Evidence:** Handoff 3 README: 'H01-unavailable needs a distinct later frame and is intentionally outside the requested phone set.' handoff3.suspendedVsPaused: 'ownFrameNeeded': true, 'inThisFrameList': false. Keys: H01.suspended.* ('Club unavailable', 'This club isn’t available right now.', 'Choose a club', 'Get help'); H01.accessLost.* ('This club is no longer available.', 'Choose a club to continue.').
- **Meanwhile, and who acts (claude-design):** Meanwhile the app builds both from handoff 3's copy, under T9. Nothing from the club is readable on Home, Friends or Memories, and another club opens only when the person chooses it. Mark both 'built from spec'. Ask for both frames, with their Friends and Memories tabs, in a later brief.


### X-04 · H01-offline · handoff 3 · should · adjusted

- **Rule:** Spec 34: 'Offline clients can browse already authorized cached revealed content with a visible offline state.' T49: 'Offline shows the cached state with its date.' Spec 08: 'Offline | Dated cached state and target time | Retry'.
- **Finding:** Handoff 3's offline Home lets through only scheduling metadata. A viewer who opens the app offline during an open day can't see that day's feed, even when it is already cached and authorized. That is stricter than spec 34, which the app follows.
- **Evidence:** Handoff 3: 'Only dated scheduling metadata is eligible; no captions, photos, live countdown or current-ready claim.' handoff3.offlineAfterFailure.cachePresentation: 'Dated last-known identity and absolute target time only; no captions, media, current-ready claim or live countdown'. Spec 34: 'Offline clients can browse already authorized cached revealed content with a visible offline state.' T49: 'Offline shows the cached state with its date.'
- **Meanwhile, and who acts (claude-design):** Meanwhile the app follows spec 34 and T49. Already authorized cached revealed content stays browsable under a visible, dated offline state. The device clock never unlocks media, and the app never falls back to cache after a known denial. Handoff 3's 'Last checked' and 'Last known opening' copy serves the Home between days. Ask for the H01-offline frame in the B5 brief, showing both cases.
- **Second reviewer:** The conflict is real. Handoff 3 lets only scheduling metadata through after a failed load, on every Home, including during an open day. Spec 34 says offline clients 'can browse already authorized cached revealed content with a visible offline state', and T24 accepts that a phone's copy stays until the next reconciliation. Default 6 covers loading only, and handoff 3 itself keeps loading and offline as separate states. So the sources settle this: spec 34 wins, and no founder question is needed. The fix belongs in the B5 brief for H01-offline.


### X-05 · G05-members-proposed (the 'Proposed roster' review) · handoff both · should · confirmed

- **Rule:** T45/T46 and DESIGN-HANDOFF.md (states with no render get a handoff); book p5 (nothing generic)
- **Finding:** Review members is the main action on both waiting screens, H01-awaiting-activation and G01-pending. It opens a new creator-only G05-members variant that has no frame and no inventory row. Handoff 1's G05-members draws weekdays and a member count, which this variant must not show.
- **Evidence:** Handoff 3: 'Review members opens G05-members in a creator-only proposed-roster review variant, titled “Proposed roster”. It names the exact proposed people without weekdays, acceptance statuses, pending counts or a list of who has not accepted. Its explanatory line is “These names are a proposal, not an active member list.”' Handoff 4 manifest G01-pending: 'primaryRoute': 'G05-members proposed-roster review'. Handoff 1 G05-members copy: 'Ben · You', 'Monday', ..., 'Sunday people has six members.' INVENTORY: '`G05-members` | Roster with proposals' only.
- **Meanwhile, and who acts (claude-design):** Add a row (G05-members-proposed, B1, built from spec). Meanwhile build it from handoff 3's keys, using invitationRosterRow with names and initials and no status or weekday. Request a frame in a later brief.


### X-06 · G04-change-saved, G04-change-new-member, G04-taken, G04-confirmed-others · handoff 3 · should · confirmed

- **Rule:** INVENTORY.md row rule; DESIGN-HANDOFF.md 'built from spec'
- **Finding:** Four G04 variants exist only in writing and have no inventory rows: the footer after Ben confirms; Maya's view of the change; the failure when a day was just taken; and the view of the four members who confirmed during a conflict.
- **Evidence:** handoff3.G04.change.saved.title 'Your confirmation is saved.' / saved.body 'The current days continue while this change is being confirmed.'; G04.change.maya.title 'Confirm your days', maya.subtitle 'Wednesday and Saturday', maya.boundary 'You’ll see only drops shared after joining.'; G04.error.confirmTaken 'Couldn’t confirm {weekday}. {weekday} is now {ownerName}’s day. Your other choices are unchanged.', G04.error.unavailable 'No longer available'; G04.conflict.confirmedSelf 'Your day is confirmed.', confirmedBody 'Confirmed days will go ahead.', otherFriday 'Day choice conflict: Ben and Debby. No reveal scheduled.'
- **Meanwhile, and who acts (app):** Add the four rows at B2, each built from spec from these keys, with snapshots for each. Maya's view never shows the block of dates from before Maya joined (T8). No frame is needed now.


### X-07 · G04-change-transition (three to four members) · handoff 3 · should · confirmed

- **Rule:** Spec 05: 'Transition weeks can temporarily differ from the steady table to preserve promises.'; book p11
- **Finding:** The change from three members to four has a different layout: two exact boundaries, a 'Transition week' block of exceptional rows, then the steady week. It exists only in writing, Claude Design invented no fixture, and no row exists.
- **Evidence:** Keys: G04.change.oneDay.title 'Confirm the club’s days', oneDay.subtitle 'One reveal day each week', oneDay.everyone 'The club changes from two days each week to one day each week for everyone.', transition.title 'Transition week', transition.steady 'One day each week from {fullSteadyStartDate}.' IMPLEMENTATION.md: 'No fourth person, date or allocation is invented in this export.'
- **Meanwhile, and who acts (claude-design):** Add a row (B2, built from spec) and build it from these keys, showing only the rows the server returns. Ask for a frame in a later brief, with a four-member fixture constructed from the book's people and shown to the founder before sending.


### X-08 · G05-schedule-review, G05-club-details (New days to review), G05-schedule-two-days, G05-schedule-paused, G05-local-times · handoff 3 · should · confirmed

- **Rule:** INVENTORY.md row rule; spec 09: 'A visible schedule link provides the whole week.'; T2 (local equivalent)
- **Finding:** Several G05 variants exist only in writing and have no rows. The most important is the 'Review the club’s days' row, which handoff 3 makes the only way a member finds a pending change, since no push is sent. The others are Club details' secondary text, the pair's week, the paused week and the 'Times in your time zone' sheet.
- **Evidence:** Handoff 3: 'At the top of the recurring week, a neutral text row “Review the club’s days” with “Proposed from {fullStartDate}” opens the member’s G04-change. Club details may use “New days to review”'. Pair: 'Wednesday No reveal scheduled ... Saturday No reveal scheduled'. Keys: G05.schedule.paused 'New days are paused.', G05.schedule.localSheet.title 'Times in your time zone', localSheet.club 'Club time', localSheet.local 'Your time'. INVENTORY: '`G05-schedule` | The club's week' only.
- **Meanwhile, and who acts (app):** Add rows at B2 for G05-schedule-review, G05-schedule-two-days, G05-schedule-paused and G05-local-times, and a note on G05-club-details's row. Build them from the keys and mark them 'built from spec'.


### X-09 · G05-schedule-review, G05-local-times · handoff 3 · note · confirmed

- **Rule:** T46: the app doesn't design new compositions
- **Finding:** Two of the written G05 variants add layout that no frame draws: the review row above the week, and the sheet that pairs Club time and Your time with full dates, times and zones.
- **Evidence:** Handoff 3: 'pair Club time and Your time using the full opening and closing date/time with each zone. Keep New York visible beside the local equivalent.' G05-schedule screen copy has no 'Review the club’s days' and no sheet.
- **Meanwhile, and who acts (claude-design):** Meanwhile build them from the keys with native List rows and a native sheet. Include both in the next brief that covers B2's G05 states.


### X-10 · F01-awaiting-activation, M01-awaiting-activation, F01-paused · handoff 3 · should · confirmed

- **Rule:** INVENTORY.md row rule; spec 08: 'Keep the club selector and Home, Friends, Memories navigation reachable'; T49
- **Finding:** Handoff 3 defines Friends and Memories for a club that hasn't started and for a paused club, in writing only. The inventory has rows only for the no-club tabs and the empty Memories.
- **Evidence:** Keys: F01.awaiting.title 'The club hasn’t started.', F01.awaiting.review 'Review members', M01.awaiting.body 'Memories will appear after the club starts and a day opens.', F01.paused.day 'New days are paused.' IMPLEMENTATION.md: 'Paused Friends shows Private drafts, the actual active Ben row and “New days are paused.”, with no next date.' INVENTORY: F01-no-club, M01-no-club, M01-empty.
- **Meanwhile, and who acts (app):** Add three rows at B2 (F01-awaiting-activation, M01-awaiting-activation, F01-paused), built from spec from the Private drafts row and the F01-no-club and M01-no-club layouts. A paused club's Memories is the ordinary M01 under T9 and needs no row.


### X-11 · G06-switcher (not started, paused, unavailable) · handoff 3 · should · adjusted

- **Rule:** T44 (never colour alone); book p32; brief: 'how the club switcher marks a club that hasn't started or is paused'
- **Finding:** The switcher's status labels exist only in writing. Handoff 3 drops the next date for both, but doesn't say whether the people count stays beside 'Not started' or 'Paused'. An unavailable club has a VoiceOver label but no visible word, so what VoiceOver says differs from what is shown.
- **Evidence:** Keys: switcher.awaiting 'Not started', switcher.paused 'Paused', switcher.awaiting.vo '{clubName}. Not started.', switcher.paused.vo '{clubName}. Paused.', switcher.unavailable.vo '{clubName}. Unavailable.'; no visible switcher.unavailable key. Handoff 3: 'as plain secondary text beside the club identity ... No lock, colour-only status, next date or countdown is shown for either.' 2.1 G06-switcher: 'Kitchen table' / '5 people · Next: Maya'.
- **Meanwhile, and who acts (claude-design):** Meanwhile show 'Not started' and 'Paused' as the row's secondary line, with no next date. Show an unavailable club's row with the VoiceOver label only, marked 'built from spec'. Add a G06-switcher-status row. In a later brief, ask for a switcher frame with these rows, the people count settled, and a visible label for an unavailable club.
- **Second reviewer:** Part of the finding is wrong. Handoff 3 does say that neither status row shows a next date: 'No lock, colour-only status, next date or countdown is shown for either.' What it leaves open is whether the people count ('5 people') stays beside the status. The VoiceOver-only unavailable label is confirmed: there is no visible switcher.unavailable key.


### X-12 · C01-private-only (Add with no club roster) · handoff 3 · should · confirmed

- **Rule:** Book p7: 'an Open my drafts link in the Add picker'; T31
- **Finding:** The Add picker with only Private draft and Open my drafts is now used on the no-club, not-started, paused and loading Homes. The inventory has only the picker with a roster.
- **Evidence:** Keys: H01.awaiting.addPicker.private 'Private draft', openDrafts 'Open my drafts', with the same pair under H01.paused.* and H01.loading.*. noClubRootHeader.addRoute: 'Normal Add picker with Private draft first and Open my drafts; no club roster'. INVENTORY: '`C01-picker` | Private draft, then the club's members with dates'.
- **Meanwhile, and who acts (app):** Add a C01-private-only row (B2, built from spec), built from C01-picker without the roster section. No frame is needed.


### X-13 · F01-friends, F01-friends-xl, F01-long-names (and every photo avatar) · handoff 3 · should · adjusted

- **Rule:** INVENTORY.md 'Known differences': 'Where a 2.1 render breaks a rule ... build what this list says'
- **Finding:** Handoff 3 redraws F01-friends, but its 2.1 siblings at large text and with long names still draw what handoff 3 removes. Handoff 3's 1 pt photo edge applies to every photo avatar, which differs from every 2.1 render with a photograph.
- **Evidence:** 2.1/F01-friends-xl.png and 2.1/F01-long-names.png: lock on 'Private drafts / Only you · Saved for later', small 'You' after Ben, ring on Ben's photograph, no 'See schedule'. 2.1/F01-long-names.png also has a filled 'Next up' chip on Nina's row. Handoff 3: youLabel 'selfPhotoRing': false; nextUpLabel 'filledChip': false; photoAvatarEdge 'appliesTo': 'Every photo avatar equally, never only Ben'; friendsRow 'AX5': 'Name, Next up if present, and wrapped full date stack.'
- **Meanwhile, and who acts (app):** Point F01-friends at screens/ (handoff 3). Add Known-differences entries: build F01-friends-xl and F01-long-names with handoff 3's row, You, Next up, Private drafts row and schedule footer, and put the 1 pt separator edge on every photo avatar.
- **Second reviewer:** Looked at both 2.1 renders. F01-friends-xl and F01-long-names both draw the lock and 'Only you · Saved for later', the small 'You' tag and the ring on Ben's photograph. The filled Next up chip is visible only on F01-long-names: the xl render's visible rows end at Sam. Handoff 0's renders show people only as initials (Known differences), so the photo-edge difference is against 2.1 renders only.


### X-14 · F01-friends, F01-friends-dark · handoff 3 · note · adjusted

- **Rule:** Brief item 7: 'If the light F01-friends changes beyond the drafts row ... send it redrawn too'
- **Finding:** The redraw changes the row height, the separator inset and the date format compared with 2.1, and the manifest's list of changes mentions none of them.
- **Evidence:** Manifest F01-friends 'changes': ['Schedule footer', 'Private drafts row', 'Ben · You', 'Plain Next up', 'Uniform photo-avatar edge']. Separators: handoff 3 at y371, 439, 507, 575, 643, 711, x69 to x372.5 (68 pt pitch); 2.1 at y372, 449, 526, 603, 680, 757, x20 to x372 (77 pt pitch). Dates: 'Monday, November 9 · 7 AM' against 2.1's 'Monday 9 November · 7 AM'.
- **Meanwhile, and who acts (none):** Build handoff 3's friendsRow (68 pt minimum, separator inset 49) as the newer reference and note the change in the PR. No source fixes a row height, and FQ44 accounts for the dates.
- **Second reviewer:** The point is right, but the 2.1 measurements are off. Measured on 2.1/F01-friends.png: there are six separators, at y372, 449, 526, 603, 680 and 757, from x20 to x372, a 77 pt pitch. Handoff 3's are at y371, 439, 507, 575, 643 and 711, from x69 to x372.5, a 68 pt pitch. The manifest's 'changes' list mentions neither the geometry nor the date format.


### X-15 · G05-members, G05-members-two-days, G01-invite-people, G01-invite-people-add, G01-invite-people-xl, G03-declined, G05-club-details · handoff 4 · should · confirmed

- **Rule:** INVENTORY.md 'Known differences'; DESIGN-HANDOFF.md step 5: 'Differences go in the inventory'
- **Finding:** Handoff 4 changes text in frames it didn't redraw, so those frames now show superseded copy.
- **Evidence:** Handoff 1 G05-members ends 'Sunday people has six members.'; handoff 2 G05-members-two-days ends 'New York · 7 AM to 1 AM the next morning.'; handoff4 members.footer.sundayPeople '6 members · New York', members.footer.pair '2 members · New York', members.footer.hours '7 AM to 1 AM the next morning.' Handoff 1 G01-invite-people and handoff 2 G01-invite-people-add draw 'Only you can see these link states.'; handoff4.invite.private 'Only you can see this list.' Handoff 1 G03-declined lacks handoff4.declined.disclosure 'We don’t identify who declined. Nobody is asked to give a reason.' 2.1 G05-club-details draws 'Drafts' / 'Only you can see them'; handoff 4 privateDraftsEntry.usedBy adds 'G05-club-details'.
- **Meanwhile, and who acts (app):** Add a Known-differences entry for each, so the app builds handoff 4's written rule over the frame, and say so in the PR. No new frames are needed.


### X-16 · G01-invite-people-revoked · handoff 4 · should · confirmed

- **Rule:** Default 1 (club starts as soon as one person accepts); spec 04: 'Existing members approve any additions, including initial people added after they accepted a smaller roster. The club activates once at least two people have mutually approved the same active roster.'; T7
- **Finding:** The brief's fixture has Debby Accepted, so under Default 1 Sunday people has already started with Ben and Debby. Yet the frame keeps the creation flow's title and 'Done for now'. Handoffs 3 and 4 reach this list only through Proposed roster → Manage invitations, which exists only before the club starts. Once the club has started, nothing says whether Maya, Alex, Sam and Nina join on their own acceptance or need Debby's approval, or where Ben manages or revokes their links.
- **Evidence:** G01-invite-people-revoked screen copy: 'Create a club', 'Invite your people', 'Debby', 'Accepted', 'Done for now'. Manifest: 'acceptedInvitee': 'Debby'. Handoff 4: 'The before-start Proposed roster review is a separate variant'. Handoff 3: '“Manage invitations” is a separate action into G01-invite-people'. Default 1: 'the club starts as soon as one person accepts, and the waiting-to-start screens show only while nobody has accepted.' Handoff 1: 'Any broader roster still needs the required approvals.'
- **Meanwhile, and who acts (founder):** Meanwhile build the row states as drawn (Link revoked with xmark.circle, Create new link, More). Reach the list only from creation and from Proposed roster before activation. Add an FQ: once two people have started the club, what happens to the creation roster's outstanding invitations, and where does the creator manage them? A later brief then settles the title and route.


### X-17 · H01 after activation before days are confirmed; H01 during a suspended day · handoff 3 · should · confirmed

- **Rule:** Spec 04: 'On activation, propose the appropriate calendar and let each member confirm their days.' Spec 22: 'emergency suspension of an occurrence or club with a neutral client explanation'. T9, T49.
- **Finding:** Two Home states flagged in the briefs report appear in neither delivery, as frame or copy: a club that has started but has no confirmed days yet, and a single suspended day. Neither has an inventory row.
- **Evidence:** Neither IMPLEMENTATION.md mentions Home between activation and the first confirmed days, or the suspension of one occurrence. Handoff 3 covers only the whole club: 'Suspension is a distinct H01-unavailable state'. Briefs section 5, 'States no row covers yet', lists both (spec 04 'On activation, propose the appropriate calendar and let each member confirm their days'; spec 22).
- **Meanwhile, and who acts (claude-design):** Add two rows (B2 and B6, missing). Meanwhile build both from spec: no made-up date or countdown (T49), and a neutral line for a suspended day that reveals nothing about it (T9, T14). Include both in the next Home brief.


### X-18 · G04-conflict (seen by Maya, Alex, Sam and Nina) · handoff 3 · must · adjusted

- **Rule:** Brief: 'No counts, progress or names of who hasn't confirmed, accepted or added anything (T15, T33)'; spec 05 and T6: 'Unresolved conflicts are shown, never swapped silently.'
- **Finding:** The four members who confirmed see the two who haven't confirmed Friday named: 'Day choice conflict: Ben and Debby.' The brief forbids naming who hasn't confirmed. T6 only needs the conflict shown, which works without names.
- **Evidence:** handoff3.G04.conflict.otherFriday = 'Day choice conflict: Ben and Debby. No reveal scheduled.' IMPLEMENTATION.md: 'In their read-only week, Friday says “Day choice conflict: Ben and Debby. No reveal scheduled.”' Brief, rules for every frame: 'No counts, progress or names of who hasn't confirmed, accepted or added anything'. Spec 05: 'unresolved conflicts are visible rather than silently swapping dates'.
- **Meanwhile, and who acts (claude-design):** Meanwhile the app shows the other members that Friday has a conflict and 'No reveal scheduled', without naming Ben and Debby. Ask Claude Design for the unnamed wording in a later brief. If the founder wants the names shown, that becomes an FQ.
- **Second reviewer:** The finding is true, but the sources do settle it, so the severity and owner change. The brief's rule for every frame says: 'No counts, progress or names of who hasn't confirmed, accepted or added anything (T15, T33)'. Under Default 2, the two people in a conflict are exactly the two who can't confirm, so naming them to the other four breaks that rule. Spec 05 and T6 only require the conflict to be visible, and showing it without names does that. Breaking the brief makes this must, and the fix goes in a later brief rather than to the founder.


### X-19 · copy-contracts (cumulative) · handoff both · note · confirmed

- **Rule:** Copy lint and one key per string (T41 to T43)
- **Finding:** The combined copy file holds the same strings under two namespaces, and one key name has two different values. One phrase also differs by a full stop between the deliveries.
- **Evidence:** handoff3.H01.awaiting.* = handoff4.pending.*; handoff3.G05.proposed.{title,body,manage} = handoff4.pending.review.*; handoff3.drafts.* = handoff4.drafts.*. handoff3.common.done = 'Done'; handoff4.common.done = 'Done for now'. handoff3.G05.schedule.hours = '7 AM to 1 AM the next morning'; handoff4.members.footer.hours = '7 AM to 1 AM the next morning.'
- **Meanwhile, and who acts (app):** Keep the namespaces when generating strings, and never merge them into one common.* set. Give H01-awaiting-activation and G01-pending one shared string key each. Keep each phrase's punctuation as the delivery for its screen gives it.


### X-20 · privateDraftsEntry · handoff both · note · confirmed

- **Rule:** Book p34: one shape, one meaning
- **Finding:** The usedBy list leaves out screens that draw or describe the same Private drafts row.
- **Evidence:** handoff4 privateDraftsEntry.usedBy omits H01-awaiting-activation, which draws the row (rect 20/394/353x76 rx12). Handoff 3 also uses the row on Friends before the club starts and while paused ('Awaiting Friends shows Private drafts', 'Paused Friends shows Private drafts').
- **Meanwhile, and who acts (app):** Use the one component everywhere the row appears. Record the omission in the PR. No request needed.


### X-21 · G06-no-club against H01-awaiting-activation, H01-paused, H01-loading, F01-friends · handoff both · note · confirmed

- **Rule:** Book p8: a member's photo shows when they have one; the initial is the fallback
- **Finding:** The same account appears differently in neighbouring moments: Ben is the 28 pt initial 'B' with no club, and the book's photograph once Sunday people exists.
- **Evidence:** Handoff 4: 'the existing 28 pt Ben initial fallback trailing'; G06-no-club screen copy has 'B'. Handoff 3 validation-report embeddedPhotoInstances: ben (bbe70e94…) in H01-awaiting-activation, H01-paused and H01-loading.
- **Meanwhile, and who acts (app):** Show the account photo when there is one and the initial otherwise. Snapshot fixtures may keep a Ben without a photo for the no-club states, and should say so.


### X-22 · brand-components (dark collecting card) · handoff 4 · note · adjusted

- **Rule:** INVENTORY Known differences: the card status is built with 'the lock glyph and "Opens Fri 13 Nov", without "Locked"' (book p6)
- **Finding:** The new dark collecting-card specimen repeats the sheet's card without a lock glyph, and writes its status in a different format from the light card on the same sheet.
- **Evidence:** Handoff 4 brand-components: light card 'Opens Fri 13 Nov' (card at y215 to y366); dark card 'Opens Friday, November 13, 2026 at 7 AM' (card at sheet y≈5435 to y5688; y4582 inside translate(0 880)), copy key handoff4.sheet.card.status. Neither has a glyph before the text.
- **Meanwhile, and who acts (app):** Extend the existing Known-differences entry to the dark card: build the lock glyph, with the date from the FQ44 formatter.
- **Second reviewer:** The finding is right, but the position is in the wrong coordinates. The dark card's y4555 to y4733 sits inside a group translated by 880, so on the sheet it is at about y5435 to y5688. The light card is at y215 to y366. Both crops show no glyph before the status text.


### X-23 · G05-club-details (paused club) · handoff 3 · note · confirmed

- **Rule:** FQ16 Default: 'An invitation restarts it.'
- **Finding:** Handoff 3 puts the only way to restart a paused club inside Club details, but 2.1's G05-club-details draws no invitation control. No variant or row covers it.
- **Evidence:** Handoff 3: 'View Memories is the main action above the tab bar; Club details is secondary. An optional invitation action is available inside details'. handoff3.pausedHome.detailsRoute: 'Club details; optional invitation control lives there, not as a repeated Home prompt'. 2.1 G05-club-details: Members ('New members need everyone's approval'), Schedule, Notifications, Widget, Drafts, Leave club.
- **Meanwhile, and who acts (app):** Meanwhile reach invitations through Club details' Members row, built from spec. Note it on the G05-club-details row, and include it when Club details is next briefed.


## Found by the second reviewers

These were not put through a second check. The note after each says what I checked myself.

- **M1** (Against the briefs) Should, founder: a pending schedule change is easy to miss. Spec 05 says the service 'then requests confirmation', and Default 3 needs every active member, but the delivery's only signals are a written-only 'Review the club’s days' / 'Proposed from {fullStartDate}' row on G05-schedule and 'New days to review' in Club details. Home and Friends show nothing ('Ordinary Home stays on its current day'), and the delivery itself warns the change 'can stall'. *Checked: premise checked: handoff 3 IMPLEMENTATION.md says "Ordinary Home stays on its current day".*
- **M2** (Against the briefs) Should, app and claude-design: several G04 and G05 states exist only in writing and appear in no finding. They are the confirmed members' read-only week with 'Day choice conflict: Ben and Debby. No reveal scheduled.', G04-change's saved state ('Your confirmation is saved.' plus Done), Maya's G04-change ('Confirm your days' / 'Wednesday and Saturday'), the 3-to-4 'Transition week' review and G05-schedule's review row. They need INVENTORY rows marked 'built from spec' and a later brief. The delivery also never names the screen that holds the other four's 'read-only week', and the G05WeekView contract has no conflict state. *Checked: duplicates X-06 and X-08; the G05WeekView point not checked.*
- **M3** (Against the briefs) Note, claude-design: the Offline contract is ambiguous. component-contracts handoff3.offlineAfterFailure.cachePresentation allows 'Dated last-known identity and absolute target time', but the keyed line 'Last known opening: {fullTargetDateAndTime} · {clubZoneName}' names nobody, and Default 6 bars any other person until the server answers. Until it's clarified, the app shows no cached name. *Checked: checked: component-contracts handoff3.offlineAfterFailure.cachePresentation against copy key handoff3.H01.offline.target.*
- **M4** (Against the briefs) Note, claude-design: one state has two names. Ben's view and its VoiceOver use 'Day conflict' (G04.conflict.status, G04.conflict.vo.Friday), while the other members' line and the disabled button's label use 'day choice conflict' (G04.conflict.otherFriday, G04.conflict.confirm.vo), against spec 03's 'Use the same noun on every platform'. *Checked: checked: handoff3.G04.conflict.status "Day conflict" against G04.conflict.otherFriday and G04.conflict.confirm.vo "day choice conflict".*
- **M5** (Copy, privacy and product rules) Travel (T2, book p29): handoff 3 gives the local equivalent only behind an opt-in 'View local times' sheet on G05-schedule, and that button is drawn even for Ben in New York (IMPLEMENTATION.md: '“View local times” opens a native sheet titled “Times in your time zone”'). Friends' exact-date rows have no local-equivalent rule ('F01.row.vo.Maya = … at 7 AM, New York', footer 'New York'). T2 says 'A member who is travelling sees the local equivalent, with the club's zone available', so the app must build the travel case on Friends and Home from spec and ask Claude Design for it. *Checked: duplicates B-03.*
- **M6** (Copy, privacy and product rules) H01-paused's Add rule doesn't fit its own kept occurrences. IMPLEMENTATION.md says '+ Add offers Private draft then Open my drafts, with no new target in paused Kitchen table', while pausedHome.announcedDaysIfAny says 'Keep promised occurrences'. A paused club that still has the remaining member's own announced day would then have no Add route to it, against spec 08's 'The next person, date and Add destination always agree' and the rule that the star adds to their own day. *Checked: checked: handoff3.pausedHome.announcedDaysIfAny against the paused Add picker.*
- **M7** (Brand, visuals, native iOS and accessibility) G04-change groups the proposed week by person: three rows (Ben · You, Debby, Maya at y=529/579/629) and no Sunday row. Its own guidance ('Ben Monday/Thursday, Debby Tuesday/Friday, Maya Wednesday/Saturday, Sunday Revisit'), handoff3.G04ChangeLayout.afterAtAX5 and the seven keys handoff3.G04.change.vo.Monday…Sunday group it by weekday, with a Sunday Revisit row. Likewise the preserved block draws two dates per line ('Monday, November 9 · Thursday, November 12') but has four separate preserved.vo keys. So the drawn rows and the VoiceOver elements don't line up. *Checked: checked on the frame: G04-change groups rows by person and draws no Sunday row.*
- **M8** (Brand, visuals, native iOS and accessibility) G04-conflict leaves out the hours that book p10 asks the confirm-day screen to show ('Show the week, club timezone and 7 AM to 1 AM next morning'). 2.1's G04-one-day and G04-two-days and handoff 3's own G04-change all draw '7 AM to 1 AM the next morning'; G04-conflict's only context line is 'Sunday people · New York' (y=182). *Checked: duplicates B-01.*
- **M9** (Brand, visuals, native iOS and accessibility) Sunday takes three forms in one delivery, against book p34's one shape, one meaning. G04-conflict draws 'Sunday / Revisit', spoken 'Not a reveal day'. G05-schedule puts 'Revisit' in the owner column at 17 pt regular primaryText, styled like a member's name, with 'No reveal scheduled' below it. G04-change draws no Sunday row but speaks 'Sunday. Revisit. No reveal scheduled in the proposed week.' *Checked: checked on the frames and keys.*
- **M10** (Consistency, file integrity and what the build needs) Handoff 3 keeps a paused club's announced days ('if an actual paused club still has promised occurrences, preserve them rather than silently cancelling them'; handoff3.pausedHome.announcedDaysIfAny), but it doesn't say what Home shows until those days pass. Its paused Home has no date and its Add picker has no target ('Private draft then Open my drafts, with no new target'), while T5 says Home shows the next scheduled occurrence with its date and countdown. That case needs a row and a rule (should, claude-design). *Checked: same as M6.*
- **M11** (Consistency, file integrity and what the build needs) Handoff 3 words the same Sunday two ways. G04-conflict draws only 'Revisit' and speaks 'Sunday. Revisit. Not a reveal day.' (G04.conflict.vo.Sunday). G05-schedule draws 'Revisit' with 'No reveal scheduled' and speaks 'Sunday. Revisit. No reveal scheduled.', and G04-change speaks '...No reveal scheduled in the proposed week.' T41 asks for one vocabulary (note, app: use one phrase). *Checked: same as M9.*
- **M12** (Consistency, file integrity and what the build needs) The Kitchen table fixture is used for two states that can't both be true. Handoff 3's H01-paused has Kitchen table down to Ben alone. Handoff 4's G03-approve ('To Kitchen table · 5 current members', viewer Maya), handoff4.members.footer.kitchenTable ('5 members · {clubZoneName}') and 2.1 G06-switcher ('5 people · Next: Maya') keep five members, and FQ38 seeds Kitchen table as the book's five-member club. Snapshot fixtures need two separate Kitchen table data sets (note, app). *Checked: true by construction: the brief made H01-paused from Kitchen table.*
- **M13** (Consistency, file integrity and what the build needs) Handoff 4's copy has VoiceOver labels for controls Debby's row must not have: invite.share.Debby.vo, invite.shareAgain.Debby.vo and invite.more.Debby.vo. Meanwhile handoff4.invitationStatuses.Accepted says 'no Share or More controls' and invitationRowActions.acceptedMore is false. A string generator must not wire these keys to an accepted row (note, app). *Checked: checked: handoff4.invite.share.Debby.vo, shareAgain.Debby.vo and more.Debby.vo exist.*
