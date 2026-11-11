# Design handoffs 3 and 4: the briefs

*3 November 2026. Two briefs for Claude Design, each ready to paste as it is. Two independent reviews checked the drafts against the book, the spec, the rules and handoffs 1 and 2. They raised 37 points, a few of them more than once. Each is fixed in the briefs or answered in sections 2 to 5, except the question about a third thread, which you've already settled. A second pair of reviews then checked the final text and found 13 more, all fixed.*

## The answer

- **Handoff 3** covers the 7 states of stage B2 (the club's days and Home) that have no design yet. 
- **Handoff 4** covers what handoff 2 left: 7 frames, plus written answers.

**Nothing in them needs a decision from you before you send them.** Where the book and spec are silent, each brief draws a default that I chose, and says so (section 2). Each default holds until you decide otherwise.

## 1. How to send them

1. Paste **handoff 3** into the Claude Design project that made handoffs 1 and 2. When its export is ready, paste **handoff 4** in the same project, so its G01-pending can match handoff 3's H01-awaiting-activation.
2. If that project no longer has the earlier work, attach these files from the project files:
    - `Tadayo_UI_UX_Design_Book.pdf` and `Tadayo_v3_Build_and_Design.pdf`;
    - `design/handoff-1/export/`: `Tadayo_Handoff_1_Pack.zip` and `Tadayo_Handoff_1_Implementation.pdf`;
    - `design/handoff-2/export/`: `Tadayo_Handoff_2_Pack.zip` and `Tadayo_Handoff_2_Corrections.pdf`.
3. When each export is ready, attach it as a .zip in this thread, with the message "Design handoff 3" or "Design handoff 4". I'll check it the same way as handoffs 1 and 2.

**One protocol point.** `docs/DESIGN-HANDOFF.md` says to send a handoff only once the brand files it builds on are on `main`. Brand revision 1.1 reaches `main` only when the ios thread brings handoffs 1 and 2 in, after slice 12. The two packs carry revision 1.1 in full, so sending now is safe. If you'd rather follow the rule to the letter, keep these briefs until then.

## 2. Defaults the briefs draw

No source settles these. Each brief marks them "Default" and asks Claude Design to draw them as stated. Items 5 and 8 are already in `docs/QUESTIONS.md` (FQ16 and FQ44). The others go there when their lane builds that part. Each stands until you answer.

1. **FQ54. When a club starts** (handoff 1's question 1, still open). The creator's proposal counts as the creator's approval. So under T7 a club starts as soon as one person accepts, and the waiting-to-start screens show only while nobody has accepted.
2. **FQ55. Two members want the same day.** While two members have chosen the same day, neither can confirm it. The conflict ends only when one of them chooses another day. Until then that day has no reveal, and every confirmed day goes ahead. Nobody is moved, and nobody is asked to give way.
3. **FQ56. Who confirms a membership change.** Every active member confirms, including the new one. The current days continue until everyone has.
4. **FQ57. The club's week is read-only** in the trial. Days change only through a membership change.
5. **A club with fewer than two members:** FQ16 as written. It pauses, Memories stays readable, and an invitation restarts it.
6. **FQ58. Home while loading** shows only the club's name and your own photo, and nothing else until the server answers.
7. **FQ59. A revoked invitation link** looks exactly like an unknown one, or one another account has already used. It says neither "expired" nor the inviter's name, in the app and on the web page.
8. **How dates are written:** FQ44 as written. The phone's region and clock settings decide the format, with the weekday and the month always as words.

## 3. Made-up fixtures

The book has no example for three states. For each, I built one from the book's own people, and the brief marks it "constructed":
- **G04-conflict:** in Sunday people, Ben and Debby both choose Friday.
- **G04-change:** Maya joins Ben and Debby's two-person club, with the new days starting on Monday 16 November 2026. No source gives a date.
- **H01-paused:** Kitchen table, down to Ben alone.

If you'd rather use different ones, tell me before you send, and I'll change the briefs.

## 4. Left out on purpose

- **A01-welcome:** handoff 2 already applies the outlined "I have an invite" to Welcome (its `invitationEntryAction` contract). It needs no frame.
- **A Kitchen table members list with Leila proposed:** the book names only Ben and Maya among the five, so this needs three names from you first.
- **The star on a pick cover, and the highlight label's inset:** these belong in the handoff for Home's highlight rail (B5).
- **Something from the book on the empty Home:** still your call, as handoff 1's check said.

## 5. For the ios thread when it starts (nothing for you to do)

- **Inventory rows** (ADR-020) for handoff 4's four new states: `G02-link-entry-signed-in`, `G01-invite-people-revoked`, `G02-revoked` and `G02-web-revoked`. Handoff 2's seven new states still need rows too. Handoff 1's 17 states are at "requested 1" on `main`. Once the founder sends the briefs, set handoff 3's seven states to `requested 3` and handoff 4's seven to `requested 4`.
- **States no row covers yet:**
    - Home after a club starts but before every member has confirmed days (spec 04: "On activation, propose the appropriate calendar and let each member confirm their days");
    - Home with access revoked (spec 29);
    - Home during a single suspended day (spec 22).
- **`H01-paused` covers two cases with different rules:** FQ16's pause, where Memories stays readable, and a moderation suspension (spec 22), where under T9 nothing is. Handoff 3 draws the pause and asks about suspension in writing.
- **QUESTIONS.md:** record defaults 1 to 4, 6 and 7 of section 2 as FQ54 to FQ59 (5 and 8 are FQ16 and FQ44, already there). Also record four questions that have no default yet, as FQ60 to FQ63:
    - FQ60: whether a member who proposes an addition must also approve it (G03-approve);
    - FQ61: what "announced" means at a change's boundary;
    - FQ62: whether drops can be added between a change's proposal and its confirmation;
    - FQ63: what happens to the announced days of a member who leaves.

---

## Design handoff 3

```
Design handoff 3: the club's days, and Home before and between days

Sources: the linked Tadayo repository: docs/tadayo-design-book-2.1.md (the book), docs/tadayo-build-spec-v3.md (the spec), docs/INVARIANTS.md (the rules T1 to T62), docs/QUESTIONS.md (the founder's open decisions, FQ) and the 2.1 renders in design/reference/2.1/. If the repository isn't linked: the attached Tadayo_UI_UX_Design_Book.pdf (design revision 2.1) and Tadayo_v3_Build_and_Design.pdf; every rule this brief relies on is stated in it. The brand is revision 1.1, which the founder adopted: your handoff 1's brand-tokens.json 1.1, wordmark and brand-icon-dark, which handoff 2 left unchanged, with handoff 2's corrected brand-components, component-contracts.json and copy-contracts.json (in Tadayo_Handoff_1_Pack.zip and Tadayo_Handoff_2_Pack.zip, attached if this project no longer has them). The repository's design/reference/brand/ still holds handoff 0's brand: don't take values from it. Use the brand's tokens, components and contracts as they are.

What to design: one frame per state, 393x852 points, titled with the state's exact name, in this order (if an export loses the titles, the order identifies the frames). These are the states of stage B2, the club's days and Home, that have no render. Where the sources are silent, an item gives a "Default": the founder hasn't decided it yet, so draw it as stated, and say in writing if it makes the screen worse. Where a fixture is "constructed", the book has none: it uses the book's people and nothing else.

1. G04-conflict: two members have chosen the same weekday while the club confirms its days. Screen G04 of the spec (section 29, "Confirm assigned days and zone"; rules in section 05). Closest 2.1 screens: state 03, G04-one-day (book p10), and state 32, G04-two-days (book p11).
   Fixture (constructed): Sunday people's proposal (book p43), viewer Ben. Maya, Alex, Sam and Nina have confirmed their proposed days. Ben hasn't confirmed Monday and has chosen Friday instead. Debby has chosen Friday, as proposed, and hasn't confirmed it.
   Rules: the conflict is shown, never settled for anyone: no swap, and nobody is moved to another day (spec 05: "unresolved conflicts are visible rather than silently swapping dates"; T6). A day another member has already confirmed shows its owner and can't be chosen (book p11: "Occupied days identify their owner"). Nobody is asked or reminded to give way (T33, T36). Both names in words; colour is never the only sign of a chosen or contested day (T44). Receiving is never a duty (spec 05: "do not create compulsory receiving work").
   Default: while two members have chosen the same day, neither can confirm it, so the conflict ends only when one of them chooses another day. Until then that day has no star and no reveal, and every confirmed day goes ahead.

2. G04-change: the club's membership has changed, so its members confirm the club's days from one exact future date. Screen G04 (section 29; rules in section 05). Closest 2.1 screens: state 32, G04-two-days (book p11), and state 03, G04-one-day (book p10); your handoff 2's G05-members-two-days for the two-day roster.
   Fixture (constructed from spec 05's own tables): now is Friday 6 November 2026. The two-person club of G04-two-days, Ben (Monday and Thursday) and Debby (Tuesday and Friday), New York, becomes spec 05's example three-member club when Maya joins: Ben Monday and Thursday, Debby Tuesday and Friday, Maya Wednesday and Saturday. Ben is the viewer. The new days start on Monday 16 November 2026 (no source gives a date). Ben's announced Monday 9 and Thursday 12 November, and Debby's Tuesday 10 and Friday 13 November, keep their dates. For Ben and Debby the weekdays don't change: show that. The frame doesn't need the club's name: G04-two-days names its members instead.
   Rules: every reveal already announced keeps its date, and no submitted drop moves (spec 05: "Existing announced reveal times remain fixed", "Do not silently move submitted drops"; book p11; T6). The change starts on an exact date (spec 05: "Full dates appear when ambiguity is possible"; T41), written as FQ44's default has it. Anything that explains why it starts then stays general: never say which days already have drops (T8, T15). Maya sees nothing from before joining (book p30).
   Default: every active member confirms, Maya included; until everyone has, the current days continue.

3. G05-schedule: the club's week, opened from the Schedule row of Club details and from Friends' schedule link (spec 09: "A visible schedule link provides the whole week."). Screen G05 (section 29; sections 03 and 05). Closest 2.1 screens: the club's week on state 03, G04-one-day (book p10), and state 20, G05-club-details (book p24), whose Schedule row reads "7 AM to 1 AM the next morning"; your handoff 1's G05-members and handoff 2's G05-members-two-days.
   Fixture: Sunday people (book p43; spec 05's six-member table), viewer Ben, New York: Ben Monday, Maya Tuesday, Alex Wednesday, Sam Thursday, Debby Friday, Nina Saturday, no reveal on Sunday. If the week shows next dates, use 2.1 F01-friends' dates during Debby's open Friday 6 November 2026: Nina Saturday 7 November (Next up), Ben Monday 9, Maya Tuesday 10, Alex Wednesday 11, Sam Thursday 12, Debby Friday 13 November.
   Rules: fixed weekdays, one person on each assigned day (spec 05; T6); the hours are 7 AM to 1 AM the next morning in the club's zone (spec 05; book p10); stable order, nothing ranked (spec 09); no counts, markers, captions or activity on any day: the week looks the same whether or not anything has been added (T15, T33); unused days and Sunday ask nothing of anyone (spec 05; book p29: "Sunday does not manufacture a reveal or ask people to catch up"); it isn't a calendar tab (spec 03: "No separate tabs for ... calendar"), and distant scheduling is outside the first release (spec 06).
   Default: read-only in the trial; the days change only through G04-change.

4. H01-awaiting-activation: Home for a club that hasn't started. Screen H01 (spec 08, whose table gives this state as "Awaiting club activation", with main content "Waiting for club confirmation" and primary action "Review members"). No 2.1 render. Closest: state 06, H01-waiting (book p12), for Home's club bar, and your handoff 1's G01-pending, the same moment as a pushed screen, which the next handoff redraws: the two must agree.
   Fixture: Sunday people, just created by Ben, the viewer (book p33, p43); nobody has accepted yet.
   Rules: T7 decides when a club starts: once at least two people have approved the same roster (spec 04; book p33: "The club starts with two accepted people"). Never suggest that it waits for everyone, although book p9 can be read that way. No date, countdown or history, and nothing that could pass for a received drop; an example only if it is labelled Example and kept out of the club (spec 04, T49). No "Waiting for Debby" (T33). Drafts made now stay private and are never submitted when the club starts (spec 04: "Those drafts are not submitted and do not trigger reveal announcements"; book p33). The header is Home's club bar, as on H01-waiting: Sunday people with its chevron, + Add and Ben's photograph; the club selector, Home, Friends and Memories stay reachable (spec 08). Your noClubRootHeader gives the switcher the leading slot only once a club is active, so confirm in writing which header applies here. + Add opens the Add picker your noClubRootHeader's addRoute describes: Private draft first, then Open my drafts, no roster (book p44). No lock: in the book a lock "appears only before reveal", on hidden content (book p6).
   Default: Ben's proposal counts as Ben's approval, so the club starts as soon as one person accepts, and only Ben, while nobody has accepted, sees this Home.

5. H01-paused: Home for a club with fewer than two active members. Screen H01 (spec 08). No 2.1 render. Closest: state 27, H01-after-close (book p29), a Home whose past day is in Memories, and state 06, H01-waiting (book p12).
   Fixture (constructed: no source has a paused club): Kitchen table (2.1 G06-switcher: "Kitchen table", "5 people · Next: Maya"), now down to one active member, Ben, the viewer. The club bar reads Kitchen table. In this frame no announced day remains. The frame never says who left or why.
   Rules: leaving, blocking and deleting an account all read the same, and nobody is named (spec 21: "Never expose another user's block or moderation reason"). No pressure to invite: no repeated prompts, push, badge or countdown (T33, T36; book p33: no "friendship-maintenance reminder"). No date or countdown for anyone (T49). No lock (book p6). Never another club's Home in its place (book p41).
   Default (FQ16): the club pauses: no new days are generated, Home says the club needs another member, Memories stays readable for whoever remains, and an invitation restarts it.

6. H01-loading: Home while the app asks the server which Home to show: on launch, on return (including the first return after 1 AM) and after a club switch. At 7 AM and 1 AM Home never blanks to this shell: it updates in place, or on return (book p12; spec 08). Screen H01 (spec 08: "Use native refresh, stable loading shells and accessible names and dates."; spec 24: "Loading shells preserve layout"). No 2.1 render; the Homes it resolves into include state 06, H01-waiting, and state 05, H01-open (both book p12), and 2.1's H01-quiet, H01-sunday and H01-your-day.
   Fixture: Sunday people, viewer Ben; no date applies.
   Rules: book p41: "Loading, offline and revoked-access states cannot impersonate an empty club or substitute another club's content." Placeholders carry nothing: not the number of drops or people, and no shape or colour from a hidden photo (T10, T15). The app's only custom motion is the 650 ms highlight fold, so no shimmer or pulse (T48). The club bar and the tabs stay reachable (spec 08).
   Default: before the server answers, only the selected club's name (it persists across relaunches, spec 08) and Ben's own account photograph may show; no other person, date, countdown, caption or photograph, cached or not (T1, T24).

7. F01-friends-dark: Friends in the dark theme. Screen F01 (spec 09). Closest: state 07, F01-friends (book p13), for the content; state 23, H01-open-dark (book p26), for dark; your handoff 2's F01-no-club for the Private drafts row; G02-web-dark, the only dark screen in handoffs 1 and 2, and the dark specimens on brand-components.
   Fixture: as 2.1's F01-friends: Sunday people, viewer Ben, during Debby's open Friday 6 November 2026 (book p13): Ben (You) Monday 9 November, Maya Tuesday 10 November, Alex Wednesday 11 November, Sam Thursday 12 November, Debby Friday 13 November, Nina Saturday 7 November marked Next up, each at 7 AM. The book's photographs for Ben, Maya and Debby (book p50), and initials for Alex, Sam and Nina; never another face.
   Rules: your handoff 2's Private drafts row in place of 2.1's card with a lock (your privateDraftsEntry lists F01-friends); the header as 2.1 draws it, with the club switcher's chevron beside Sunday people, + Add and Ben's photograph (handoff 0's dark Home lost the chevron); a real dark theme, with photographs never tinted, dimmed or filtered (book p26, p35; T44); all six keep their places, and Next up neither reorders nor ranks (book p7, p13; spec 09); a row shows the person, their next date and time, and only the You and Next up labels: no counts, dots, presence or "nothing yet" (spec 09; T15, T33, T34); Next up and You take no cover colour, because covers mark senders and never popularity or permission (book p6, p34). The avatar fallback keeps your avatarCanvas.
   If the light F01-friends changes beyond the drafts row (for example to add the schedule link), send it redrawn too, as frame 8, titled F01-friends.

Content: the book's fixtures. Sunday people: Ben (Monday, the viewer unless stated), Maya (Tuesday), Alex (Wednesday), Sam (Thursday), Debby (Friday), Nina (Saturday), New York. The pair from G04-two-days: Ben and Debby. Kitchen table: five members (the book names Ben and Maya among them), Leila proposed by Ben. Dates as the book uses them (Friday 6 to Friday 13 November 2026). Three items have constructed fixtures (G04-conflict, G04-change, H01-paused); each says exactly what is constructed, and nothing else is invented.

Rules that apply to every frame: book p6, p7, p8, p10 to p13, p24, p26, p29, p33, p34 (components), p35 (the spacing and type scale; every colour from revision 1.1), p41 (routes and labels); spec 03, 04, 05, 08, 09, 21, 22, 24, 29. Names, never inferred pronouns ("Debby's Friday"). Exact dates (T41). Default (FQ44): the phone's own region and clock settings decide the format, with the weekday and the month always as words; a recurring weekday needs no date. Plain voice and spec 03's words, never "Sent" (T41, T43). Times come from the server, never the phone's clock (T1); a member who is travelling sees the local equivalent with the club's zone (spec 05; book p29; T2). No push, badge or reminder about confirming days, a conflict, a club starting or a club pausing: spec 21's table has no such event (T36). No counts, progress or names of who hasn't confirmed, accepted or added anything; your G03-waiting's "Waiting for club approval" names nobody (T15, T33). Native iOS controls: the system's navigation, tab bar, sheets and Dynamic Type (T45). Every control has a VoiceOver name, targets are at least 44 points, and rows grow and dates wrap at the largest text size (book p26; T47). The type is the iOS system font; in the frames, Arimo stands in for it, included in the export.

Questions I need answered in the design:
- G04-conflict: how the contested day reads, naming Ben and Debby, and what each of the two can do; how Ben chooses a day other than the proposed one, since 2.1's G04-one-day offers only Confirm Monday; and what Monday, Ben's proposed day, shows meanwhile. In writing: what the other four members see.
- G04: the words when the server refuses a day another member confirmed a moment earlier. They name what failed, keep the person's other choices, and offer no day in its place (spec 24: "error messages name the failed action"; T6, T43).
- G04: what a member sees after confirming while others haven't, with no names and no count. Draw it on G04-change, or say how in writing.
- G04-conflict and G04-change at the largest text size, in writing: how the week's days become rows (2.1 has no large-text G04), and each day's VoiceOver label; a contested day names both people.
- G04-change: how the exact start date and the weeks before and after it read, without suggesting that anything moved, and one general line on why it starts then. What Maya sees, compared with Ben. How a member finds a pending confirmation without a push (Home, Club details or Friends). In writing: how the same screen reads when a three-member club becomes four and each member goes from two days to one, with a transition week that differs from the usual table (spec 05; book p11: "A change from three to four members follows the existing versioned schedule process"), without the lost day reading as a penalty.
- G05-schedule: what it shows that G05-members doesn't; whether each day carries its next date and Next up; how unused days read in clubs of two, four and five (G04-two-days says "Available") without reading as gaps to fill; how Sunday reads (spec 05 says "Revisit", G04-two-days "Sunday is for revisiting."). In writing: the same screen for the pair, and where a member travelling outside New York sees the local equivalent.
- Friends: where its schedule link sits (spec 09); 2.1's F01-friends shows none.
- H01-awaiting-activation: which words, spec 08's "Waiting for club confirmation" and "Review members", or G01-pending's "Before the club starts" and "Review invitations"? Where does the action go: Ben's invitation list (G01-invite-people) or the members list (G05-members)? Does it share G01-pending's composition? Which of the book's own objects can appear truthfully here (book p5), and may the proposed people's names appear with no status beside them?
- H01-paused: the words for FQ16's meaning, where the way to Memories sits, and what + Add offers. In writing: the neutral words for a club suspended by moderation (spec 22: "a neutral client explanation"), where nothing of the club can be read, Memories included, and whether it needs a frame of its own.
- H01-awaiting-activation and H01-paused, in writing: how the club switcher marks a club that hasn't started or is paused, without colour alone and without a lock, and what Friends and Memories show for it.
- H01-loading: one neutral shell for every Home, or one per expected Home? Which native means: the system activity indicator, redacted placeholders, or the chrome alone? Its VoiceOver words. What follows a failure (spec 08's offline state: "Dated cached state and target time", with Retry), or a club the viewer can no longer open, which never silently becomes another club (book p32: "Choosing another club is explicit.")?
- F01-friends-dark: Next up's type role and token pair, light and dark: revision 1.1 names none, and 2.1's chip is nearly cover3, a sender's colour (book p34: one shape, one meaning). One shape for You: 2.1's smaller "You" after the name, or the "Ben · You" of G05-members and your roster row? Does the ring around Ben's own photograph stay, what does it mean, and what is its dark token? Name the Friends row as a component: avatar size, separator and its inset, chevron and date inks, light and dark. Does a photo avatar need an edge on the dark canvas, with the photograph itself untouched?

Dark and large-text frames: only F01-friends-dark, listed above. Every other state is checked in dark and at the largest text size against book p26 and your answers.

Return: a .zip with the SVG frames, 2x PNGs, screen-copy.json, a frame manifest and a short PDF, as for handoffs 1 and 2. Put every string you give only in writing (error words, VoiceOver labels, the suspended-club words) in copy-contracts.json, each under its own key, with ’. If an answer changes a brand asset, send the whole asset again under its handoff 1 name; put additions in component-contracts.json and leave brand-tokens.json 1.1 unchanged.
```

---

## Design handoff 4

```
Design handoff 4: corrections to handoffs 1 and 2 (sign-in and clubs)

Sources: your handoffs 1 and 2 (Tadayo_Handoff_1_Implementation.pdf and Tadayo_Handoff_1_Pack.zip, Tadayo_Handoff_2_Corrections.pdf and Tadayo_Handoff_2_Pack.zip), the design book (Tadayo_UI_UX_Design_Book.pdf, design revision 2.1) and the build spec (Tadayo_v3_Build_and_Design.pdf), or the linked Tadayo repository (docs/tadayo-design-book-2.1.md, docs/tadayo-build-spec-v3.md, docs/INVARIANTS.md, design/reference/2.1/). Keep the brand exactly as revision 1.1, which the founder adopted: brand-tokens.json 1.1, the wordmark and brand-icon-dark, with handoff 2's corrected brand-components, component-contracts.json and copy-contracts.json. Don't take values from the repository's design/reference/brand/, which still holds handoff 0's brand.

What to design: one frame per state, 393x852 points, titled with the state's exact name, in this order (if an export loses the titles, the order identifies the frames). A redraw keeps everything else in the earlier frame as it was. Where the sources are silent, an item gives a "Default": the founder hasn't decided it yet, so draw it as stated, and say in writing if it makes the screen worse.

1. G03-approve (redraw of your handoff 2 frame): in the book a lock "appears only before reveal", on hidden content (book p6), so give "We don't identify who declined. Nobody is asked to give a reason." 2.1's shield, or another glyph that isn't a lock. The viewer is Maya, a Kitchen table member, so the frame is true whether or not Ben's proposal of Leila also counts as Ben's approval. That is undecided: item 2's default covers only a new club's creator.
2. G01-pending (redraw of your handoff 1 frame): your handoff 2 replaces its Drafts card and Open Drafts button with the Private drafts row and keeps Review invitations. Draw it with nobody accepted yet. The club starts once two people have approved the same roster (spec 04; T7). Default: Ben's proposal counts as Ben's approval, so this screen lasts only until one person accepts. It must agree with H01-awaiting-activation in handoff 3, the same moment on Home.
3. G06-no-club (redraw of your handoff 1 frame): under your handoff 2 contracts: the no-club header, the Private drafts row, and "I have an invite" as the secondary button.
4. G02-link-entry-signed-in: your handoff 2's G02-link-entry for someone already signed in with no club, opened from G06-no-club or F01-no-club. "Sign in before you can see the club or its people." isn't true for this person (book p8 warns against "addressing the wrong viewer"). Still nothing about any club until the server has checked the link (spec 04; T7).
5. G01-invite-people-revoked: Ben's full list from your handoff 1 G01-invite-people (Maya Shared; Alex, Sam and Nina Not shared; Debby Accepted), with the More control on each row not yet accepted, as your G01-invite-people-add draws it, after Ben has revoked Alex's link. Use your handoff 2 words "Link revoked" and "Create new link". Not shared, Shared and Accepted each have a glyph beside the word: give Link revoked one too (book p34: one shape, one meaning). Revoking never removes an accepted member (your revokeLink scope).
6. G02-revoked: Alex, signed in with no club, opens the link Ben revoked. Default: a revoked link, an unknown one, and one already used by another account look exactly the same, because the server answers all three with the same neutral not-found (spec 32: "Unauthorized object lookups return a neutral not found response without confirming hidden content exists"). So the screen never says "expired" (your G02-expired is only for a link that expired) and never shows Ben's name or the club.
7. G02-web-revoked: the signed-out web page for the same link. Default: no inviter, club or roster, because the server gives the page nothing for such a link (spec 32). T7 allows the page at most the inviter's name; under this default, a link that no longer works shows not even that.

Content: Sunday people (Ben Monday, the viewer unless stated; Maya Tuesday; Alex Wednesday; Sam Thursday; Debby Friday; Nina Saturday) and Kitchen table (five members, the book names Ben and Maya among them; Leila proposed by Ben). Nothing invented.

Rules that apply: book p6, p8, p9, p24, p30, p34 (components), p35 (the spacing and type scale; every colour from revision 1.1), p41 (routes and labels); spec 03, 04, 07, 24, 32. Names, never inferred pronouns. Exact dates. Plain voice and spec 03's words (T41, T43). Native iOS controls (T45); every control has a VoiceOver name and a 44-point target (T47). The type is the iOS system font; in the frames, Arimo stands in for it, included in the export.

Questions I need answered in the design (in writing, with the export):
- G01-pending: the main action now that Open Drafts is gone (does Review invitations become it?), and whether "What you prepare stays only with you." and "Nothing is shared while the club is waiting to start." stay.
- G02-link-entry-signed-in: the line's words for a signed-in person, or that it's dropped, and anything else that changes.
- G01-invite-people-revoked: the VoiceOver label of "Create new link", naming Alex as your other labels do, and what Alex's row shows once a new link exists.
- G02-revoked and G02-web-revoked: keep these titles. Say whether the same screen serves every link that no longer works; whether Get Tadayo stays on the web page; and whether G02-web-dark's and G02-web-xl's rules cover it.
- G03-approve: the type role of the 28-point "Leila" (size, line height, weight, Dynamic Type style). Does the note box hug its text, with which spacing token, or keep an 89-point minimum? The brief for handoff 2 asked only for the sentence: were the dropped hairline above the buttons, the note in secondaryText and the 13-point "To Kitchen table · 5 current members" meant? Your guidance says "Pending status grants no history, media or upload access". A pending person, accepted or not, gets no captions, photographs, membership activity or upload destinations until the members approve: only the club's name and the exact roster in review (spec 04; T7, T9). Reword it.
- G05-members: the one-day list ends "Sunday people has six members."; the two-day list ends "New York · 7 AM to 1 AM the next morning." Should every club size end the same way (book p24: "The displayed club, count and roster agree")?
- G05-club-details: 2.1 draws Drafts as a plain row, "Only you can see them", and your privateDraftsEntry doesn't list this screen. Is Club details' row meant to differ (book p34), and which subtitle does it take?
- G01-invite-people: plainer words than "Only you can see these link states.": "link states" is a working term, and internal names don't reach the interface (spec 03).
- G03-declined, optional: should Leila's screen also say that Tadayo doesn't identify who declined (book p30)?
- Brand contracts, added to component-contracts.json with brand-tokens.json 1.1 unchanged (every value a token, book p35): inks, light and dark, for the Private drafts row's folder and chevron, the eyebrow and the field label; invitationRosterRow's separator and its inset; a Dynamic Type style for each of revision 1.1's own type roles (your five supplemental roles have one); and the sizes given only on the sheet or in your handoff 1 text, not yet in component-contracts.json (fold 18, card inset 18, card 353 x 151 minimum, plaque 45 x 55, highlight cover 91 x 69, the large-text row's 96 minimum and 20/26 label, the 54-point field). Are the paddings of 6 and 5 meant to sit off book p35's spacing scale (4, 8, 12, 16, 20, 24, 32)? Add a contrast entry for action used as text, light and dark. Optional: a dark folded card on the sheet.
- A02-code: for a refused resend, confirm or replace your handoff 1 line "A new code isn’t available yet. Try again shortly." (handoff 2 gave only the first-send line). Say whether "shortly" may promise a wait the app can't know: the app never reads the server's own message text, so it has no wait time to show. Errors name what failed (spec 24).
- Copy files: use ’ throughout, and give "A code can’t be sent yet. Try again shortly.", the refused-resend line and "Couldn’t save your profile. Check your connection and try again." keys of their own (the first and last sit inside retainedState prose). Say in your guidance that an invitation's token travels in the link's fragment, so it never reaches a server log (T7), and that it never goes to analytics, which carry only spec 36's events with pseudonymous ids (T51).

Dark and large-text frames: none. G02-web-revoked follows G02-web-dark and G02-web-xl unless you say otherwise.

Return: a .zip with the SVG frames, 2x PNGs, screen-copy.json, a frame manifest and a short PDF, as for handoffs 1 and 2. Put every string you give only in writing in copy-contracts.json, each under its own key, with ’. If an answer changes a brand asset, send the whole asset again under its handoff 1 name.
```
