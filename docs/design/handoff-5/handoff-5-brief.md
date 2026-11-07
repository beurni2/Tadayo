# Design handoff 5: the brief

*3 November 2026. One brief for Claude Design, ready to paste as it is. It asks for what the check of handoffs 3 and 4 left for a later brief (section 6 of `design/handoff-3/check/handoff-3-4-check.md`). Four independent reviews checked the draft against the book, the spec, the rules, the check and both deliveries, and a second reviewer tried to refute each point and looked for more. Of 39 points, some raised twice, 3 were refuted; the other 36 are fixed in the brief or in this report. A second pair of reviews then checked the fixed text and found 11 more, and a last review of those changes found 7 more. All are fixed or answered here (section 6).*

## The answer

- **Handoff 5 asks for 13 frames:**
    - nine states with no picture yet: eight of stage B2 (the club's days and Home) and one of B1, the proposed roster that Review members opens;
    - handoff 3's G04-conflict and G04-change, redrawn;
    - the book's two day-picking screens (G04-one-day and G04-two-days), redrawn in one design with the clash screen.
- **It also asks for written answers** on wording, VoiceOver, spacing and the card.
- **One thing is your call:** redrawing a screen from the book (FQ2). Sending the brief says yes to frames 12 and 13. Tell me before you send it if you'd rather keep the book's two.
- **Nothing else needs a decision before you send it.** Where the sources are silent, the brief draws the interim readings I chose, reserved as FQ numbers (section 2). Each stands until you answer. Three of them go a step further here than before (FQ46, FQ50 and FQ55). Two points are new: the day-picking screens now show whose day is confirmed and whose is still only proposed, which relaxes a rule I wrote for handoff 3 (FQ48), and a club's first days (FQ55). All are marked in section 2.
- **A few fixtures are made up,** from the book's people only (section 3). Tell me before you send it if you'd like different ones.

## 1. How to send it

1. Paste the brief into the Claude Design project that made handoffs 1 to 4.
2. If that project no longer has the earlier work, attach:
    - `Tadayo_UI_UX_Design_Book.pdf` and `Tadayo_v3_Build_and_Design.pdf`;
    - from each of `design/handoff-1/export/` to `design/handoff-4/export/` in the project files, the pack (.zip) and the PDF.
3. When the export is ready, attach it as a .zip in this thread, with the message "Design handoff 5". I'll check it the same way as handoffs 3 and 4.

**The same protocol point as before.** `docs/DESIGN-HANDOFF.md` says to send a handoff only once the brand files it builds on are on `main`. Revision 1.1 reaches `main` only when the ios thread brings the handoffs in. The packs carry revision 1.1 in full, so sending now is safe.

## 2. The interim readings the brief draws (mine, until you answer)

Each is drawn as a "Default". The numbers are reserved; they go into `docs/QUESTIONS.md` when the ios thread builds that part.

- **FQ46. Who sees a clash over a day.**
    - Only the people who chose the day see names on it.
    - The others see that the day isn't settled yet, without names or a count, because spec 05 asks that a clash be visible (frame 2).
    - That is one step more than the check's summary, which said they'd see only that Friday has no reveal scheduled. It follows the check's finding X-18. If you'd rather they see only "No reveal scheduled", tell me and I'll change frame 2.
- **FQ48. A day proposed for someone else.**
    - Until that person confirms it, it isn't taken: anyone who hasn't confirmed may choose it, which makes a clash. A confirmed day can't be chosen (frames 1, 12 and 13).
    - Once that person has chosen another day instead, it's free and names nobody, except in that person's own view (frames 1 and 2).
    - On the day-picking screens, a confirmed day looks different from one still only proposed. That is my reading: book p11 says only that "Occupied days identify their owner", and under FQ48 only a confirmed day is occupied. So those screens show who hasn't confirmed yet. Friends and Home show it anyway, because a day nobody has confirmed doesn't open. What stays ruled out is chasing: no "Waiting for…", no count and no reminder. In a clash, only the people who chose the day see names on it (FQ46).
    - This relaxes a rule I wrote in the handoff 3 brief, against naming who hasn't confirmed. Tell me if you'd rather the day-picking screens hide it.
- **FQ50. A paused club that still has your own announced day.**
    - Home shows that day as usual until it closes, then the pause.
    - Until it opens at 7 AM, + Add offers it, as spec 08 requires. Once it's open, + Add offers your next announced day, or only private drafts if there's none. The words are asked in writing.
    - The announced days of a member who has left wait for FQ63, which has no default yet, so the brief leaves them out.
- **FQ52. A pending schedule change** shows only on the club's week and in Club details, with no push and nothing on Home (frame 4).
- **FQ54. When a club starts.** Ben's proposal counts as Ben's approval, so a club starts as soon as one person accepts (frame 6).
- **FQ55. Two or more people want the same day.**
    - None of them can confirm it until all but one choose another day. Every confirmed day goes ahead meanwhile (frames 1 and 2).
    - The brief extends my two-person default to three or more, as the check's finding R-12 does.
    - Frame 7 applies the same reading to a club's first days: each day goes ahead as soon as its member confirms it. Under FQ54 a club starts with two people, so frame 7's six reached their week by joining. I count members who join before any day is confirmed as part of the club's first days, not a membership change; that part is a new reading of mine. Once any day is confirmed, a later join is a membership change, which waits for everyone (FQ56).
- **FQ56 and FQ57.** Every member confirms a change, and the club's week is read-only (frames 3 and 4).
- **FQ16 and FQ44** as already written: a club under two members pauses; the phone's settings decide how dates are written.

## 3. Made-up fixtures

- **Frames 5 and 8: Ben travelling in London,** five hours ahead of New York on these dates. So Nina's Saturday opens at 12 PM London time. Any other place works as well.
- **Frame 7:** Sunday people with all six members and nobody's day confirmed yet, the moment of the book's one-day confirmation screen. The frame shows no person or date.
- **Frame 9:** Sunday people suspended by moderation.
- **Frame 10:** Kitchen table no longer open to Ben, for example because Ben left it on another phone.
- **Frame 11:** Ben's two clubs: Sunday people, not started, and Kitchen table, paused with Ben alone, as in handoff 3.
- **Frames 12 and 13:** on the book's G04-one-day nobody has confirmed yet, as on frame 7; on its G04-two-days Debby has confirmed Tuesday and Friday, which is why they can't be chosen.

## 4. Left out on purpose

- **The offline Home,** with and without an open day: it belongs to stage B5, so it goes in B5's brief, with spec 34's rule that cached days already opened stay readable.
- **Home during one suspended day:** stage B6, with moderation.
- **The week when a three-member club becomes four:** its days depend on FQ61, what "announced" means at a change's boundary. Once you answer, I can make up a fixture for it.
- **Your own calls:** FQ47 (photos or initials in an invitation's member list), FQ51 (invitations still out once a club has started) and FQ53 (plain waiting and paused screens). Each could change a frame, so they wait for your answer. Frame 7, Home after the club starts and before anyone's day is confirmed, is a waiting Home of the same kind, so your answer to FQ53 may change it too.
- **States handoff 3's words already cover:** Friends and Memories before a club starts and while paused, the Add menu with drafts only, the screen after confirming a change, Maya's view of it, a day just taken, and the failed load. The app builds them from those words.

## 5. For the ios thread (nothing for you to do)

- Once the founder sends the brief, set the inventory rows of frames 2 and 4 to 11 to `requested 5`, adding the ones that don't exist yet:
    - at B2: `G04-confirmed-others`, `G05-schedule-review`, `G05-local-times`, `H01-confirm-days`, `H01-travelling`, `H01-unavailable`, `H01-access-lost` and `G06-switcher-status`;
    - at B1: `G05-members-proposed` (finding X-05).
- Note the redraws asked of `G04-conflict`, `G04-change`, `G04-one-day` and `G04-two-days` (frames 1, 3, 12 and 13) on their rows.
- FQ46, FQ48, FQ50 and FQ55 go further here than in the check's section 4 and the briefs' section 2: record each as section 2 states it, with frame 7's first-days reading beside FQ55 and FQ56. On the day-picking screens only, FQ48's reading replaces the handoff 3 brief's rule against naming who hasn't confirmed.

## 6. What the later checks changed

- **I dropped a reading I had added.** After the first check, the brief made a confirmed day look the same as one still only proposed, to hide who hadn't confirmed. The second check showed it hid nothing: choosing the day, Friends and Home all tell anyway. So the brief keeps handoff 3's rule that a confirmed day can't be chosen and identifies its owner (book p11), and asks for another member's day that is still only proposed to look different from a confirmed one. Those screens then show who hasn't confirmed, which relaxes my handoff 3 rule against it: only chasing stays ruled out (FQ48 in section 2).
- **A paused club's own announced day:** + Add offers it only until it opens at 7 AM, because a day's submissions close then (spec 08).
- **Frame 7's first-days reading** is now stated in the brief and marked as mine (FQ55 in section 2).
- **Smaller fixes:** the frame order sentence, two more keys to turn into templates and two named as examples, and "my", not "your", for a default I chose.
- **The last review** made the founder report name every reading that goes further, said which days are confirmed on frames 12 and 13, and tightened frame 7's first-days reading.
- **Two points were refuted:** a clash between the photographs rule and frame 6's initials, and the stage of the switcher's labels.

---

## Design handoff 5

```
Design handoff 5: the club's days and Home, the remaining states

Sources: the linked Tadayo repository: docs/tadayo-design-book-2.1.md (the book), docs/tadayo-build-spec-v3.md (the spec), docs/INVARIANTS.md (the rules T1 to T62), docs/QUESTIONS.md (the founder's open decisions, FQ) and the 2.1 renders in design/reference/2.1/. If the repository isn't linked: the attached Tadayo_UI_UX_Design_Book.pdf (design revision 2.1) and Tadayo_v3_Build_and_Design.pdf; every rule this brief relies on is stated in it. Your handoffs 1 to 4, packs and PDFs, attached if this project no longer has them. The brand is revision 1.1, which the founder adopted: brand-tokens.json 1.1, the wordmark and brand-icon-dark, with handoff 4's brand-components, component-contracts.json and copy-contracts.json, which hold everything from handoffs 2 and 3. The repository's design/reference/brand/ still holds handoff 0's brand: don't take values from it. Use the brand's tokens, components and contracts as they are.

What to design: one frame per state, 393x852 points, titled with the state's exact name, in this order (if an export loses the titles, the order identifies the frames). Frames 1 to 11 are states of stage B2, the club's days and Home, that handoffs 3 and 4 left without a frame, with one state of stage B1 that the same moment opens (item 6, G05-members-proposed), and two of your handoff 3 frames redrawn (items 1 and 3). Frames 12 and 13 are 2.1's G04-one-day and G04-two-days in the one day-choice design. A redraw keeps everything else in the earlier frame as it was. Where the sources are silent, an item gives a "Default": the founder hasn't decided it yet, so draw it as stated, and say in writing if it makes the screen worse. Where a fixture is "constructed", the book has none: it uses the book's people and nothing else.

1. G04-conflict (redraw of your handoff 3 frame): the same fixture and rules: Sunday people, viewer Ben; Maya, Alex, Sam and Nina have confirmed their days; Ben and Debby have both chosen Friday, and neither has confirmed. What changes:
   - One day-choice design for G04-one-day, G04-two-days and G04-conflict (book p34: "A component has one shape, one meaning"). A free day, another member's confirmed day (naming its owner, book p11: "Occupied days identify their owner"), another member's day that is still only proposed, the viewer's own choice and a contested day each look different, in words and in form, never by colour alone (T44). Nothing on a proposed day waits, counts or chases (T33: no "Waiting for Debby"). Your handoff 3 frame draws free Monday and Maya's confirmed Tuesday alike; 2.1's G04-two-days tells them apart. Say whether the date plaque that G04-one-day leads with (book p6, p10) belongs here.
   - A contested day isn't an error: nobody did anything wrong, and nobody must give way (T33). Use an ink other than destructive, as your handoff 4 does for Link revoked ("there is no colour-only meaning or punitive red"), and keep the words.
   - The hours and the zone, which book p10 asks for: "7 AM to 1 AM the next morning" with New York, as on your G04-change.
   - Ben's own row reads "Ben · You", as on G04-one-day, G04-change and F01 (book p7, p11). In writing: how Ben's own name reads inside a sentence or a status, such as your "Friday is chosen by Ben and Debby." and "Proposed for Ben · Available", and in the day VoiceOver labels, where F01 speaks "Ben, you." but your G05-schedule and G04-change labels say "Ben’s day".
   - One name for the state, on screen and in every VoiceOver label: handoff 3 says both "Day conflict" and "day choice conflict" (spec 03: the same noun everywhere).
   - The contested row's text sits 14 points inside its outline, off book p35's scale (4, 8, 12, 16, 20, 24, 32): use a step of the scale, or name the inset in component-contracts.json.
   Default (handoff 3's, extended to three or more members): while two or more members have chosen the same day, none of them can confirm it, and the conflict ends only when all but one have chosen another day. Until then that day has no reveal, and every confirmed day goes ahead. Only a confirmed day is taken: a day still only proposed for a member can be chosen by anyone who hasn't confirmed, and choosing it makes it contested, as Ben's choice of Debby's Friday did. A day proposed for a member who has since chosen another day, like Monday here, is free and names nobody, except in Ben's own view.
   Send 2.1's G04-one-day and G04-two-days in the one design too, always both: frame 12 titled G04-one-day and frame 13 titled G04-two-days, each with 2.1's fixture (book p10, p11). Constructed for both: on frame 12 nobody has confirmed a day yet, as in item 7, so Maya's, Alex's, Sam's, Debby's and Nina's days are each still only proposed; on frame 13 Debby has confirmed Tuesday and Friday, so they are taken, as 2.1 draws them. If either doesn't change beyond the brand, send it anyway and say so in writing, so that the numbers stay fixed.

2. G04-confirmed-others: the same moment, seen by Maya, who has confirmed Tuesday. Your handoff 3 described it only in writing ("Your day is confirmed.", "Confirmed days will go ahead." and the week). Its line for Friday in that week, "Day choice conflict: Ben and Debby. No reveal scheduled." (handoff3.G04.conflict.otherFriday), names the two who haven't confirmed: replace it under handoff5 wherever that week appears, G05 included, and name that key. Screen G04 or G05: say which in writing (see the questions), and keep the frame's title G04-confirmed-others either way (spec section 29; rules in section 05).
   Fixture: as item 1, viewer Maya.
   Rules: the conflict stays visible (spec 05: "unresolved conflicts are visible rather than silently swapping dates"), without naming the members in it or counting anything (T15, T33). Nothing asks Maya to do anything about Friday (T33, T36). Maya's own row reads "Maya · You".
   Default: only the members who chose a contested day see names on it. Maya sees that Friday is contested, in the one name item 1 settles, and that it has no reveal scheduled, without Ben's or Debby's names. Monday, proposed for Ben and left by Ben for Friday, names nobody either.

3. G04-change (redraw of your handoff 3 frame): the same fixture, rules and Default. What changes: the drawn rows and the VoiceOver elements agree. Your frame groups the proposed week by person, with no Sunday row, and draws two kept dates per line; your seven G04.change.vo labels and your G04ChangeLayout's largest-text answer go by weekday, Monday to Sunday, with each kept date on its own row. Draw it the way that reads best, and make the labels match. Sunday takes the one form asked for below.

4. G05-schedule-review: the club's week while a membership change waits for confirmation. Screen G05 (spec section 29; sections 05 and 09). Your handoff 3 described its row only in writing.
   Fixture: G04-change's: now is Friday 6 November 2026; Ben (the viewer), Debby and Maya, New York. Maya has joined, and the new days from Monday 16 November 2026 wait for confirmation. The week shown is the current one, the pair's: Ben Monday and Thursday, Debby Tuesday and Friday, Wednesday and Saturday with no reveal, Sunday for revisiting. The club has no name in the book: don't invent one; leave it out, as your G04-change does.
   Rules: your handoff 3 row, "Review the club’s days" with "Proposed from {fullStartDate}", at the top of the week, opens Ben's G04-change. It names nobody who hasn't confirmed and counts nothing (T15, T33). No push, badge or reminder about it (T36). Unused days don't read as gaps to fill (spec 05; book p29).
   Default: the week is read-only in the trial, and the days change only through G04-change. Every active member, Maya included, confirms a change; until everyone has, the current days continue. Nothing on Home mentions the pending change.

5. G05-local-times: the "Times in your time zone" sheet your handoff 3 described in writing, opened from "View local times" on G05-schedule. Screen G05 (spec section 29; spec 05: "show a local equivalent when viewers travel"; book p29: "Travelling members see their local equivalent with the club zone available").
   Fixture: your handoff 3 G05-schedule: Sunday people, viewer Ben, during Debby's open Friday 6 November 2026. Constructed: Ben is travelling in London. The next occurrences are Nina's Saturday 7 November, Ben's Monday 9, Maya's Tuesday 10, Alex's Wednesday 11, Sam's Thursday 12 and Debby's Friday 13 November. Each of these occurrences opens at 7 AM and closes at 1 AM the next morning in New York, which on these dates is 12 PM to 6 AM the next morning in London. For example, Nina's Saturday opens on Saturday 7 November at 7 AM in New York, 12 PM in London, and closes on Sunday 8 November at 1 AM in New York, 6 AM in London. The difference isn't fixed: it is four hours for openings from 25 to 31 October 2026 and from 14 to 27 March 2027, so a recurring weekday has no London time of its own, as your handoff 3 says.
   Rules: one shared opening instant for every member: access and countdowns come from the server, never the phone's clock or zone (T1, T2). The phone's zone changes only how a time is written, and New York stays visible. Exact dates (T41).

6. G05-members-proposed: the proposed roster that "Review members" opens from H01-awaiting-activation and G01-pending. Your handoffs 3 and 4 described it only in writing: "Proposed roster", "These names are a proposal, not an active member list." and "Manage invitations". Screen G05 (spec section 29; spec 04).
   Fixture: H01-awaiting-activation's: Sunday people, just created by Ben, the viewer; nobody has accepted. Proposed: Maya, Alex, Sam, Debby and Nina.
   Rules: names only: no weekday, status or count, and nothing about who hasn't accepted (T7, T15, T33). The proposed people show initials, as on your G01-invite-people (M, A, S, D, N), in your invitationRosterRow; Ben's row reads "Ben · You", with Ben's photograph. Manage invitations opens G01-invite-people, the only place the link statuses show, and only to Ben. Nothing here could pass for an active member list (book p33).
   Default: Ben's proposal counts as Ben's approval, so the club starts as soon as one person accepts, and this screen exists only until then.

7. H01-confirm-days: Home after a club has started and before its days are confirmed. Screen H01 (spec 08, whose table has no row for it; spec 04: "On activation, propose the appropriate calendar and let each member confirm their days."). No 2.1 render. Closest: state 06, H01-waiting (book p12), and your H01-awaiting-activation.
   Fixture (constructed): Sunday people has started, and all six members have since joined (book p43). The proposed week is the one 2.1's G04-one-day shows (book p10), and nobody has confirmed a day yet, so no day is scheduled. Viewer Ben.
   Rules: no person, date or countdown, because nothing is scheduled, and never a made-up date (T5, T49). Nothing on Home says who hasn't confirmed or how many (T15, T33), and no push, badge or reminder (T36). The main action opens Ben's G04-one-day. + Add offers Private draft, then Open my drafts, as on H01-awaiting-activation, because no day is collecting yet. The club bar and the tabs as on H01-waiting.
   Default: members who join before any day of the club is confirmed are part of its first days: the proposed week includes them, however many joined after the club started, and each day goes ahead as soon as its member confirms it. Once any day is confirmed, Home shows the next confirmed day, as H01-waiting does, and anyone who joins after that is a membership change, which waits for everyone (item 4).

8. H01-travelling: Home for a member who is outside the club's zone. Screen H01 (spec 08; spec 05; book p29). Closest: state 27, H01-after-close (book p29).
   Fixture: 2.1's H01-after-close: Saturday 7 November 2026 at 1:01 AM in New York; Nina's Saturday opens at 7 AM New York time, in 5 hours 59 minutes; Debby's Friday is in Memories. Constructed: Ben, the viewer, is in London, where it is 6:01 AM, so Nina's Saturday opens at 12 PM London time.
   Rules: one shared opening instant: the countdown is the same as in New York, and it comes from the server (T1). The phone's zone changes only how the time is written, and the club's zone stays available (T2; book p29: "Travelling members see their local equivalent with the club zone available."). 2.1's "Revisit her day" becomes "Revisit Debby’s Friday" (FQ20: names, never pronouns).

9. H01-unavailable: Home for a club suspended by moderation, in your handoff 3 words: "Club unavailable", "This club isn’t available right now.", Choose a club and Get help. Your handoff 3 said it needs a frame of its own. Screen H01 (spec 08; spec 22: "emergency suspension of an occurrence or club with a neutral client explanation").
   Fixture (constructed): Sunday people is suspended; viewer Ben. The frame never says why, by whom or for how long.
   Rules: nothing of the club can be read: no person, date, caption, photograph or Memories, from the server or the phone's cache (T9, T14, T24). It never looks like an empty club or shows another club's content (book p41), and another club opens only when Ben chooses it (book p32: "Choosing another club is explicit."). Get help reaches Tadayo's support contact (spec 22). No lock (book p6).

10. H01-access-lost: Home when the selected club can no longer be opened, in your handoff 3 words: "This club is no longer available." and "Choose a club to continue.", with Choose a club. Screen H01 (spec section 29: every screen implements "access revoked behaviour"; book p41).
    Fixture (constructed): Kitchen table was Ben's selected club, and Ben can no longer open it, for example because Ben left it on another phone. The frame never says why.
    Rules: as item 9: nothing of the club from the server or the phone's cache (T24), never another club's content in its place (book p41), and choosing another club is explicit (book p32).

11. G06-switcher-status: the club switcher with a club that hasn't started and one that is paused. Screen G06 (spec section 29). Closest: state 45, G06-switcher (book p32).
    Fixture (constructed): Ben's two clubs. Sunday people, just created and not started, is selected, with your H01-awaiting-activation behind the sheet. Kitchen table is paused, with Ben its only active member, as on your H01-paused.
    Rules: your handoff 3 labels "Not started" and "Paused" as plain secondary text: no lock, colour-only sign, next date or countdown (T44, T49), and nobody named. Club details, Create a club and Cancel as 2.1 draws them. Settle whether a people count stays beside either label (2.1 draws "6 people · Debby’s Friday"). If it stays, it counts active members only, as your membersFooter does (proposedMemberCounted: false), never the proposed roster: here Ben is the only active member of each club.

Content: the book's fixtures. Sunday people: Ben (Monday, the viewer unless stated), Maya (Tuesday), Alex (Wednesday), Sam (Thursday), Debby (Friday), Nina (Saturday), New York. The pair of G04-two-days, Ben and Debby, joined by Maya in G04-change. Kitchen table: five members (the book names Ben and Maya among them); items 10 and 11 each give it a constructed state of its own. Dates as the book uses them (Friday 6 to Friday 13 November 2026), and G04-change's Monday 16 November 2026. The book's photographs for Ben, Maya and Debby (book p50), and initials for everyone else; never another face or photograph. Each constructed part says exactly what is constructed, and nothing else is invented.

Rules that apply to every frame: book p6, p7, p10 to p13, p24, p29, p32, p33, p34 (components), p35 (the spacing and type scale; every colour from revision 1.1), p41 (routes and labels); spec 03, 04, 05, 08, 09, 22, 24, 29. Names, never inferred pronouns ("Debby's Friday"). Exact dates (T41), written as FQ44's default has it: the phone's own region and clock settings decide the format, with the weekday and the month always as words; a recurring weekday needs no date. Plain voice and spec 03's words, never "Sent" (T41, T43). Times come from the server, never the phone's clock (T1). No push, badge or reminder about confirming days, a conflict, a pending change, or a club starting, pausing or being suspended (T36). Nothing counts or chases: no "Waiting for Debby", no count or list of who hasn't confirmed, accepted or added anything, and no progress (T15, T33). Two exceptions: on the day-choice screens, another member's day names its member and shows whether it is confirmed or still only proposed, because only a confirmed day is taken (item 1's Default; book p11: "Occupied days identify their owner"); and the members who chose a contested day, and only they, see names on it (items 1 and 2). Native iOS controls: the system's navigation, tab bar, sheets and Dynamic Type (T45). Every control has a VoiceOver name that begins with its visible words, targets are at least 44 points, and rows grow and dates wrap at the largest text size (book p26; T47). The type is the iOS system font; in the frames, Arimo stands in for it, included in the export.

Questions I need answered in the design (in writing, with the export, unless a frame answers them):
- G04-conflict: the words when three or more members choose the same day: the explanation, the help line (your "Either person can change a choice." fits only two) and the VoiceOver label.
- G04-confirmed-others: is it G04 after confirming, or the read-only week of G05 (your handoff 3 calls it "their read-only week", and your G05WeekView has no contested state)? Give the contested day's VoiceOver label without names.
- Sunday, in one form everywhere. Handoff 3 writes it three ways: "Revisit" on G04-conflict, spoken "Not a reveal day"; "Revisit" in the owner's place with "No reveal scheduled" on G05-schedule; no row on G04-change, spoken "No reveal scheduled in the proposed week". Give one shape and one phrase for G04, G04-change and G05.
- G05-schedule-review: does the current week show Maya, who has joined but has no day until the change starts, and how?
- G05-local-times: now that Home shows the local equivalent (item 8), is the sheet still needed, and does "View local times" show for a member who isn't travelling (your handoff 3 draws it for Ben in New York)? If the sheet goes, draw frame 5 as G05-schedule seen from London, keeping the title, and say where Ben then sees the London times of dated occurrences: a recurring weekday never carries a London time (your G05WeekView). In writing: Friends' rows and an upcoming day (F02) for a member who is travelling.
- H01-confirm-days: once other members' days are confirmed and Ben's isn't, Home shows the next confirmed day (item 7's Default). Where does Ben's own confirmation wait then, with no push, badge or reminder (T36)?
- H01-unavailable and H01-access-lost: what Friends and Memories show for that club, what + Add offers, and whether the club bar keeps the club's name.
- G06-switcher-status: the visible word for a club that is unavailable (handoff 3 gives it only a VoiceOver label, "{clubName}. Unavailable.").
- A paused club that still has the remaining member's own announced day, for example Kitchen table down to Ben with Ben's next day already announced. Default: Home shows that day as usual until it closes, then the pause. Until that day opens at 7 AM, + Add offers it, because Home's person, date and Add destination always agree (spec 08) and a member adds to their own day like everyone else. Once it opens, its submission has closed (spec 08), so + Add offers Ben's next announced day if there is one, and otherwise Private draft, then Open my drafts, as on your H01-paused. What happens to the announced days of a member who has left is still the founder's open question: write nothing that shows, promises or cancels them. In writing: the words for it, and where Club details' invitation control goes: your handoff 3 puts the way to restart a paused club there, and 2.1's G05-club-details draws none.
- VoiceOver: these labels drop the words on their buttons, so Voice Control can't match what people see. Reword each to start with the button's visible words, with anything more as a hint: "Not now" (handoff3.G04.conflict.notNow.vo); "View local times" (handoff3.G05.schedule.localAction.vo); "+ Add" before a club starts, while paused or loading, and with no club (handoff3.header.addPrivate.vo, handoff4.noClub.add.vo); "Review members" (handoff3.H01.awaiting.action.vo, handoff4.pending.primary.vo); "View Memories" (handoff3.H01.paused.action.vo); "I have an invite" (handoff4.noClub.invite.vo); "Continue" (handoff4.link.continue.vo); "Done for now" (handoff4.invite.done.vo); "Close invitation" (handoff4.unavailable.primary.vo). Make H01-loading's shown and spoken words agree: it shows "Loading Home…" and speaks "Loading {clubName}." (handoff3.H01.loading.vo). Give G03-approve's Decline a VoiceOver label that starts with "Decline" and names Leila, parallel to Approve's "Approve Leila joining Kitchen table." (handoff4.approval.decline.vo now reads "Decline this invitation for Kitchen table. No reason is required.").
- Spacing, on book p35's scale: name the vertical gaps on your handoff 3 and 4 frames and on these: title to body on the Home states and on your handoff 4 G01-pending (about 77 points; 35 to 48 on your other handoff 3 and 4 frames), G04-change's two row pitches (55 and 50), and G05-schedule's 57-point rows with a line's space left empty. Confirm that G06-no-club's two buttons take 16, as on F01-no-club, not 17.
- G05-schedule: the zone line's type role (the eyebrow on G05-schedule, metadata on F01 and G04-change), and "Ben · You" in the row role, bold, as your youLabel says (G05-schedule draws it regular).
- The collecting card on brand-components: its status line's fields, and its lock. Handoff 4's dark card reads "Opens Friday, November 13, 2026 at 7 AM" and the light one "Opens Fri 13 Nov", while F01 joins a date and a time with "·". 2.1's F02-upcoming draws a lock before the status (book p6: a lock "appears only before reveal"); neither specimen does.

Dark and large-text frames: none. Every state is checked in dark and at the largest text size against book p26 and your answers.

Return: a .zip with the SVG frames, 2x PNGs, screen-copy.json, a frame manifest and a short PDF, as for handoffs 1 to 4. Keep copy-contracts.json and component-contracts.json cumulative: leave every earlier entry as it is, and put new and replacement entries under handoff5, each string under its own key, with ’, naming the earlier key each one replaces. Write every reusable string as a template, as your H01.loading.vo "Loading {clubName}." does, with names, the club, weekdays, dates, times and zones as braced parameters, never Ben, Sunday people, New York, London or a clock time written in; the phone's own formatter writes the times (FQ44). The fixture's values go in screen-copy.json, or in a separate example key beside the template, as your G04.error.confirmFridayExample does. Give templates under handoff5 for the earlier keys that write "7 AM", "1 AM" or "New York" into their text: handoff3.G04.conflict.clubZone, G05.schedule.hours, G05.schedule.revealHoursZone, G05.schedule.hoursVO, the G05.schedule.vo.* labels, and the F01.date.* and F01.row.vo.* rows; handoff4.members.footer.hours and sheet.card.status. handoff4.members.footer.sundayPeople and .pair can stay as the examples beside members.footer.other. If an answer changes a brand asset, send the whole asset again under its handoff 1 name; leave brand-tokens.json 1.1 unchanged.
```
