# Open questions for the founder

Each question has a default. Claude Code builds on the default until the founder answers, then records the answer here and in `docs/DECISIONS.md`. Add new questions at the end, each with a default and the stage that needs the answer. The questions are numbered FQ1 onwards; the spec already uses Q01 to Q30 for its acceptance tests.

## Decided

- **FQ1. Which phone first.**
    - Decided by the founder on 1 November 2026: iPhone first. The closed trial runs on iPhones through TestFlight.
    - Android follows the trial, as the native Kotlin app spec 30 proposes, against the same API (ADR-001).
- **FQ2. What Claude Design does with design revision 2.1.**
    - Decided by the founder on 1 November 2026: the 53 screens of 2.1 stay the reference.
    - Claude Design makes the brand first: wordmark, app icon, final colours and the cover palette. Then it makes every state 2.1 doesn't show.
    - The founder can replace any 2.1 screen with a Claude Design render later (ADR-006).

## Setup and accounts

- **FQ3. Where the servers live.**
    - For `dev`: the region nearest the founder, who runs every device check. Answered by the founder on 1 November 2026: they are in US East, so `dev` is there too (Supabase `us-east-1`, Fly `iad`; ADR-016).
    - For `prod`: the region where most trial members live. That's the US East region (Supabase `us-east-1`, Fly `iad`) for the US, and Paris for West Africa or Europe. The founder confirms it before `prod` is created at Gate D.
    - A Supabase project can't move region, only be recreated; for `dev`, which holds only test data, that's about an hour's work.
    - Needed by: B0 for `dev`; Gate D for `prod`.
- **FQ4. Your iPhone and iOS version, and the trial members'.** The app's minimum iOS decides which phones can install it, the founder's included. The founder's iPhone can't open Claude Docs, whose viewer asks him to update iOS, so it may not be on a recent version.
    - Answered in part by the founder on 1 November 2026: their iPhone runs iOS 18, so the iOS 17 minimum stands (ADR-018). The trial members' phones are still unknown.
    - Default: iOS 17 minimum, which runs on the iPhone XS, XR and later, built with the newest SDK so that newer iPhones get the current system look. The app's view models use Apple's Observation framework, which needs iOS 17.
    - If the founder's or a trial member's iPhone can't run iOS 17 (an iPhone 8 or X stops at iOS 16), tell Claude Code before B0. The app then needs iOS 16 and a slightly different structure.
    - Needed by: B0.
- **FQ5. Domain, identifiers and the name.**
    - The domain: `tadayo.app`. Answered by the founder on 1 November 2026, who registered it on Cloudflare (ADR-017).
    - The identifiers: bundle id `app.tadayo`, with `app.tadayo.share` and `app.tadayo.widgets`; app group `group.app.tadayo`. Answered by the founder on 2 November 2026, who confirmed them (ADR-019). The bundle id can't change after the App Store record exists.
    - The name: Tadayo, the default.
    - A search on 1 November 2026 found no App Store app named Tadayo, but similar names exist: Tadayou (a meditation app), Tayo Tayo and Tadaday. Trademark clearance stays a prelaunch task (spec intro).
    - Needed by: B0.
- **FQ6. Privacy policy, terms and a support contact.** Apple asks for a privacy policy URL and a contact before external testers.
    - Default: Claude Code drafts the in-app privacy explanations from the real architecture (spec 23, T24). They say plainly that:
        - Tadayo is not end-to-end encrypted;
        - a removed photo stops loading at once;
        - a copy already on someone's phone goes at the app's next check-in.

        It also hosts plain pages on `apps/web`.
    - The founder supplies the support email and has the policy and terms reviewed by a lawyer before the first external build.
    - Needed by: B9.

## Scope for the closed trial

- **FQ7. The defaults the spec asks you to review.** Spec 39 asks the product owner to review D02, D03, D06, D07, D08 and D10, and D11 because it affects membership. They are built as written until the founder says otherwise:
    - **D02:** the 7 AM reveal is also the cutoff. Later work targets the next date, after the person confirms it.
    - **D03:** one standard opening for highlights: the 650 ms fold, with Skip and a reduced-motion version.
    - **D06:** sign-in and age. The trial uses email codes (FQ12) and one 18-or-older confirmation (FQ13).
    - **D07:** reactions and comments open after the reveal.
    - **D08:** the widget's lead image order. It comes with widgets in M1.
    - **D10:**
        - media access within five minutes of issue; the trial is stricter, since media goes through the API and no URL leaves the server (ADR-009);
        - removed objects purged within 24 hours;
        - backups expired within 30 days.

        The 24-hour and 30-day figures are targets to validate before any privacy promise is published.
    - **D11:** blocking lists the shared clubs and offers Block and leave these clubs.
    - Needed by: before the trial for D02, D03, D06, D07, D10 and D11.
- **FQ8. Photo safety scanning.** The spec quarantines every upload until "safety checks" pass (spec 33) but names no provider, and photos are the product, so uploads can't stay off. Hash matching against known abuse material (Microsoft PhotoDNA, Thorn's Safer, or a moderation vendor) needs an approval or a contract.
    - Default: the pipeline has a provider interface, with the provider set to `none` for the closed trial of invited friends.
    - Report, remove, block and the operator scripts work from the first trial build. The founder accepts the risk in writing in `docs/DECISIONS.md` before Gate E.
    - A provider is required before anyone outside the trial joins. A lawyer reviews the reporting duties that come with it.
    - Needed by: Gate D.
- **FQ9. Widgets: in the trial or after it.** The spec's phases put widgets in M1 (spec 02); its build sequence lists them before the trial (spec 38, step 8).
    - Default: widgets are built after the trial, in M1, as the phases say. Push notifications, which the trial needs for "Debby's day is ready", are in the trial.
    - The widget setup render (`W01-setup`) waits in the inventory.
    - Needed by: B8.
- **FQ10. Live Photos.** A Live Photo's moving part is a short video with sound (spec 10, 33). It needs video processing and video safety checks.
    - Default: the trial uploads the still only, and the composer says so in one line. Motion comes when video checks exist.
    - Needed by: B3.
- **FQ11. Instagram.** Fetching Instagram's embed through Meta's oEmbed API needs a Meta developer app and Meta's app review. Instagram's public embed script works without one, but often asks for a login inside apps (spec 17, ref R02).
    - Default: TikTok plays in its official Embed Player. Instagram reels are accepted as links, stay hidden before the reveal like any source, and open the original after it.
    - The founder registers a Meta app if he wants embedded Instagram later.
    - Needed by: B7.
- **FQ12. Sign-in.** D06 proposes an email magic link with Sign in with Apple and Google. Magic links break when the email is opened on another device or in a mail app's browser.
    - Default: a six-digit email code for the trial, with Sign in with Apple and Google in M1. Apple's rules ask for Sign in with Apple once Google sign-in is offered (ADR-011).
    - Needed by: B0.
- **FQ13. Age eligibility.** D06: 18 and over.
    - Default: one confirmation at sign-up ("I'm 18 or older"), with no birthdate collected, and the matching App Store age rating.
    - Before the public launch, a lawyer reviews this, including the US state laws that make apps read the app stores' age signals.
    - Needed by: B0 for the confirmation; before the public launch for the review.
- **FQ14. Sharing outside Tadayo.** The design book moves external sharing into the design scope and adds a Share icon beside React and Comment (book p45, p46). Its consent needs "every pictured member", but nothing in either document says how the people in a photo are identified, and the native release stays gated.
    - Default: no Share icon in the trial, since a button that always says "Kept in the club" is a dead end. The export and its consent flow come after the trial behind `external_share`, with T61's rules.
    - The open decision for then: who marks the pictured members. The default proposal: the sender ticks them at export time; each of them and the star must agree; any member can still veto with "I am in this photo".
    - The `S05` renders wait in the inventory.
    - Needed by: after the trial.
- **FQ15. Where drafts live.** 2.1 makes drafts account-wide with optional targets (book p46); the spec keeps them encrypted on the device (spec 10, 23).
    - Default: drafts live on the device only, per account, encrypted, and are never synced. An upload in preparation is the only server-side trace, and it's private to the author.
    - Needed by: B4.
- **FQ16. A club with fewer than two members.** Unspecified.
    - Default: the club pauses. No new occurrences are generated, Home says the club needs another member, and Memories stays readable for whoever remains. An invitation restarts it.
    - Needed by: B2.
- **FQ17. Club cover.** Spec 04 lets the creator choose an optional cover; 2.1's create screen (`G01-create`) doesn't show one.
    - Default: no club cover in the trial.
    - Needed by: B1.
- **FQ18. Data export.** Spec 23 lists "export request" in the account settings without defining it.
    - Default: an export of the person's own drops, captions and comments, as a download, in M1. Not in the trial.
    - Needed by: M1.
- **FQ19. Changing a club's timezone.** Spec 05 stores one IANA zone per club without saying how it's chosen; the build sets it from the creator's device when the club is made.
    - Default: no zone change in the trial. In M1, a change goes through the same confirmation as a schedule change and never moves an announced reveal.
    - Needed by: M1.

## Design and copy

- **FQ20. 2.1 strings that infer a gender.** Spec 12 says to adapt pronouns to names "without inferring gender where unspecified", and the vocabulary is "Your pick or Debby's pick" (spec 03). 2.1 has:
    - "Her pick" on the highlight rail (`H01-open`, `H01-open-dark`, `G06-switcher`, `R01-blank-caption`, `R01-past-day`) → "Debby's pick";
    - "An example · before and on her day" (`A01-welcome`) → "An example · before and on the day";
    - "Revisit her day" (`H01-after-close`) → "Revisit Debby's Friday";
    - "A memory, a funny find, or something that reminded you of her." (`H01-first-drop`) → "… reminded you of Debby.";
    - "She'll see only drops shared after she joins." (`G03-approve`) → "Leila will see only drops shared after joining."

    Default: built with the right-hand wording. The brand handoff asks Claude Design how "Deborah-Anne's pick" fits a 91-point cover.

    Handoff 0 answered on 2 November 2026 (`design/reference/brand/brand-components.png`): at the default size the label wraps after the hyphen, "Deborah-" then "Anne's pick", at 12/14 bold, without shrinking or an ellipsis; at large text the rail becomes full-width rows, at least 96 points high and growing.

    Needed by: B1.
- **FQ21. The Highlight label before the reveal.** `F02-upcoming` and `F02-added` show Ben a "Highlight" label on Maya's collecting card. The spec's pre-reveal whitelist for non-authors doesn't include it (spec 14, T10).
    - Default: before the reveal, the label shows only on the viewer's own drops.
    - Needed by: B4.
- **FQ22. Reactions.** D07: one emoji reaction per viewer per drop, changeable or removable. The set isn't defined; 2.1 shows only a heart labelled React.
    - Default: a fixed palette of six emoji chosen in a Claude Design handoff, enforced by an allowlist on the server. Until the render arrives, the heart alone.
    - Needed by: B6.
- **FQ23. The Welcome example photograph.** `A01-welcome` shows a labelled example with the chair photograph, an Unsplash image listed on book p50. Spec 04 allows a labelled example; T46 and book p50 keep stock imagery out of the product.
    - Default: the founder supplies one of his own photographs before Gate D, and it ships as the labelled example.
    - Until then, builds that point at `dev` show the chair fixture, which never reaches a build that points at `prod`.
    - Needed by: Gate D.
- **FQ24. Test fixture photographs.** The renders use the ten Unsplash photographs listed on book p50.
    - Default: Claude Code downloads those exact images as test fixtures for the snapshot tests and the Lab: only in tests and in builds that point at `dev`, never in a build that points at `prod`. They sit in their own asset catalog, left out of prod builds (`docs/TECH-DESIGN.md` section 4). This needs `images.unsplash.com` in the environment's allowed domains; if that host is blocked, the founder attaches the files.
    - Needed by: B0.
- **FQ25. The design pack.** The book describes 54 screen PNGs, five boards, an interactive HTML reference, editable source, a tokens file, copy and state contracts and a screen index (book p40, p50). Only the PDF arrived, with 53 screens.
    - Default: build from the PDF. If the founder has the pack, he attaches it. The HTML reference and tokens file go in `design/reference/pack/`, and the 54th screen is added to the inventory.
    - Needed by: B0.
- **FQ26. The order of the highlight rail.** Spec 15 says the star's pick, then stable roster order. `H01-open` shows Debby's pick, then Maya, Sam and Ben, which isn't the Friends order (Ben, Maya, Alex, Sam, Debby, Nina).
    - Default: the star's pick, then the club's schedule order from Monday, so Ben, Maya, Sam. The render is a known difference in the inventory.
    - Also, raised by handoff 0's notes: in a club of two or three, each member has two days, and a contributor can have no day that week (a member whose days start later, or a former member whose drops stay). Default: by each contributor's earliest weekday in that occurrence's schedule; anyone without a day follows, in the order they joined; the order is fixed for each occurrence.
    - Needed by: B5.

## Operations and the trial

- **FQ27. Operator tools.** Screen O01 is an "audited reports and removals" console.
    - Default: the founder is the operator for the trial, using audited scripts that the `ops` workflow runs. Every action writes an audit row.
    - A web console comes when a second operator exists.
    - Needed by: B9.
- **FQ28. Trial testers and consent.** The design book's usability round is 8 to 12 people (book p39). Then come the two-week operational trial and at least six more weeks with consenting clubs (spec 36).
    - Default: up to Gate C, one friend on a second iPhone as an internal TestFlight tester, which needs no beta review; a scripted account on `dev` plays the rest of the club.
    - For the trial: three to six clubs as external testers. Apple reviews the first build of each new version before external testers get it.
    - The founder collects research consent outside the app before inviting anyone.
    - Needed by: Gate A for the second phone; Gate E for the trial.
- **FQ29. How Apple's reviewer signs in.** Beta review needs an account the reviewer can use, but a reviewer can't receive an email code, and needs a club with something in it to look at.
    - Default: a review account in `prod` whose fixed code works for that one address only. The code works only while the review-access switch is on. It's an operator setting, not a feature flag, because a flag never widens access (T60). The founder turns it on for a review and off after, with an audited `ops` script, and every use is audited.
    - The account belongs to a review club that no real member can join. Its other members are accounts the founder controls, his own included, and its drops are his own photos and captions, added through the app like any member's. So nothing in it is a fixture, a stock image or a made-up history (T46, T49).
    - The review account and the review club are flagged as staff, so analytics and the trial reports leave them out (spec 36 counts drops "excluding staff seeded examples").
    - The review notes explain the sign-in, the club's days, and where to look: Home on a day that's open, Memories otherwise.
    - Needed by: B9.
- **FQ30. The two-a-day budget with several devices.** Spec 21 counts pushes "per member per device local day".
    - Default: one budget per member, counted in the zone of the member's most recently active device. Quiet hours apply per device, in that device's zone.
    - Needed by: B8.

## Raised by the starter-pack PR

Each is a place where two sources disagree and the fix would loosen one of them, so it waited for the founder, who answered each on 2 November 2026.

- **FQ31. Keeping `INVENTORY.md` current.** `CLAUDE.md` ("Repository layout") and `design/reference/README.md` forbid editing anything in `design/reference/`, `INVENTORY.md` included. `CLAUDE.md` ("The rules easiest to break by accident"), `INVENTORY.md` itself, `docs/DESIGN-HANDOFF.md` and the definition of done in `docs/MILESTONES.md` require keeping it current.
    - Answered by the founder on 2 November 2026: Claude Code may edit `INVENTORY.md` to keep it current, never deleting a row (ADR-020). Nothing else already in `design/reference/` is edited, moved or renamed, except to move an export the founder uploaded into `claude-design/` into its `handoff-<n>/` folder, which `CLAUDE.md` ("Repository layout") allows.
    - The default until then was that nothing already in `design/reference/` changed, `INVENTORY.md` included, so work that would add or change an inventory row waited. The starter-pack PR's edits to `INVENTORY.md` were part of the founder's request to fix the documents.
    - Needed by: B0, before design handoff 0 starts (its rows go to `requested 0`).
- **FQ32. The operator's case access.** T9 names the author's preview as the read rule's only exception. Spec 07 gives the moderation operator "restricted audited case access" before and after the reveal, and T55 has an `operator` role.
    - Answered by the founder on 2 November 2026: the default.
    - Default: T9 as written. No route serves a drop's content to the operator; the `ops` moderation scripts (FQ27) hold or remove a drop by its id and write an audit row. If a report can't be handled without seeing the content, Claude Code asks the founder first.
    - Needed by: B9.
- **FQ33. Which dismissals are durable.** T62 says "Dismissals are durable". Spec 19 has two controls: Dismiss hides the suggestion, and "Don't suggest this day again" stores the one durable per-user exclusion.
    - Answered by the founder on 2 November 2026: the default.
    - Default: T62 as written: every dismissal is durable.
    - Needed by: M1.5 (Remember this).
- **FQ34. The weekly trial report against `prod`.** ADR-012 and `docs/TECH-DESIGN.md` section 1 run the weekly trial report through `ops`, and the trial lives in `prod`. Section 9 lets `ops` act on `prod` only for the moderation scripts, the Supabase probe and the review-access switch.
    - Answered by the founder on 2 November 2026: the default. The report runs on `dev`'s seeded data, and running it against `prod` would need a new answer. Gate E's first weekly trial report (`docs/MILESTONES.md`) reads the trial in `prod`, so Claude Code asks for that answer before Gate E.
    - Default: the report runs on `dev`'s seeded data (Gate D's "trial report on seeded data"), and against `prod` only once the founder answers.
    - Needed by: Gate E.
- **FQ35. Adding 2.1's own pack.** FQ25's default has the founder attach 2.1's pack, with its HTML reference and tokens file in `design/reference/pack/`. `CLAUDE.md` ("Repository layout") and `design/reference/README.md` let Claude Code add only handoff deliveries and the files made from them. The README's table gives `pack/` to the founder, who can't create a folder from GitHub's upload page on a phone (`docs/DESIGN-HANDOFF.md`).
    - Answered by the founder on 2 November 2026: the default.
    - Default: build from the PDF, as FQ25 says. If the founder attaches the pack, Claude Code asks before committing it.
    - Needed by: B0.
- **FQ36. What `dev` holds.** `docs/TECH-DESIGN.md` section 7 says `dev` holds synthetic data only. ADR-003 and ADR-004 point the founder's builds, and so the founder's own account, at `dev` until Gate D. FQ28 adds a friend as an internal tester. Their email addresses, photos, captions and comments are real.
    - Answered by the founder on 2 November 2026: the default.
    - Default: `dev` stays synthetic apart from the founder's and the internal tester's sign-in addresses. Because `dev`'s keys reach workflows run by hand on any branch, and the dev clock can reveal a drop early (ADR-013), they add only test content there: photos with no people in them, and captions and comments written as tests. Their addresses, and everything their accounts add, test content included, are treated as personal data: they never go into logs, PRs, the journal or evidence (T52), and scripts and seeds never read or change their accounts.
    - Needed by: B0.
- **FQ37. One deletion-log bucket for both environments.** ADR-003 and `docs/TECH-DESIGN.md` section 1 name one R2 bucket for the deletion log (ADR-010). Both environments' workers write that log, with R2 keys in their Fly secrets, and `dev`'s app is reachable from workflows run by hand on any branch. From Gate D, section 9 lets no key that reaches `prod` be available to a run on any branch but `main`.
    - Answered by the founder on 2 November 2026: the default.
    - Default: one bucket per environment. Before `prod` exists, `prod`'s deletion log gets a bucket of its own, used for nothing else, and no key in `dev`'s app reaches it.
    - Needed by: Gate D.

## Raised by the B0 plan PR

- **FQ38. How spikes S1, S2 and S4 get a club for the founder's account.** S1's commit, S2's upload through S1's build, and S4's push that opens the exact club and day (`docs/MILESTONES.md`, "Spikes") need the account signed in on the founder's iPhone to be a member of an active club on `dev` with the founder's day in its calendar: the commit checks membership and audience (`docs/TECH-DESIGN.md` section 5), and a link opens its club or day only after access is rechecked (T38). B0 has no clubs: creation, invitations and approval come in B1, the calendar and occurrences in B2. A club activates only once at least two people approve the same roster (spec 04, T7), with two to six active members (A01). The seeded clubs are the book's fixtures: Sunday people is full at six, and Kitchen table's free place is the one Leila's proposal holds (book p30). ADR-021 (FQ36) says scripts and seeds never read or change the founder's account. Each way changes something the founder decided:
    - (a) S1, S2 and S4 run before Gate A instead of Gate 0, once B1 and B2 have built clubs and days, and before B3 and B4 build media and contributing on them. Gate 0 keeps S5, S3 and S6. It changes `CLAUDE.md`'s "Order of work" (B0 holds "the spikes S1 to S6 that retire the native unknowns" before the two lanes start) and, in `docs/MILESTONES.md`, B0's goal ("the native unknowns are retired"), its spikes, and Gate 0's and Gate A's evidence. Both are rulebook documents, so those changes go in a PR of their own. It relaxes Gate 0 and that order of work: Gate 0 would pass, and B1 and B2 would start, with three of the six spikes unproven. Those three are proven instead before Gate A, and before B3 and B4 build on them. No invariant is relaxed.
    - (b) the founder's internal tester (FQ28) joins early: the founder creates a club in a spike build and invites the tester, on a second iPhone, and both approve the roster and confirm their days, so the club activates (spec 04, T7) and has occurrences. It brings a minimal form of B1's club creation, invitation and approval and of B2's calendar into B0's spikes, as code that reaches `dev` through `deploy-branch` and merges only in B1 and B2. The tester joins before Gate A, which needs the founder's yes (`CLAUDE.md`), and the tester's account is treated like the founder's (ADR-021). No rule or invariant is relaxed.
    - (c) one `ops` run, with the founder's yes for that one change, adds the founder's account, named by its opaque id and never its address (T52), to a club of scripted members that the seed adds for the spikes, since the fixtures' only free place is Leila's. It relaxes ADR-021 once, and T6, T7 and spec 04, 05 and 32 once: the run inserts the membership directly, with no exact roster accepted by the founder and no member's approval, and gives the founder's account its days in the club's calendar, with their occurrences, which neither the founder nor the other members confirmed.
    - Default: none of the three. No script or seed reads or changes the founder's account (ADR-021), and nothing puts it in a club; the founder's own sign-in and profile through the app go ahead (slices 8 and 12). S1, S2 and S4 wait for the answer, while S5, S3 and S6 go ahead. Claude Code recommends (a).
    - Needed by: B0, before spike S1.
    - Answered by the founder on 2 November 2026: (a). S1, S2 and S4 run once B1 and B2 are on `dev`, before Gate A, with the founder's account joining its club in the app; `CLAUDE.md`'s "Order of work" and `docs/MILESTONES.md` say so (ADR-024).
- **FQ39. Where the founder approves a destructive change.** T57 says destructive changes "need the founder's approval in the PR". Until ADR-022, that approval was the founder's merge (`docs/GITHUB.md`: "his merge is the approval"). ADR-022 moves each PR's approval to the project's thread, because nothing on GitHub can show that the founder wrote it.
    - Default: no PR with a destructive migration is merged until the founder answers. Claude Code proposes that the founder's approval in the thread names the destructive change itself, and that the PR quotes it with its date and time; `docs/INVARIANTS.md` T57 would then be reworded in a rulebook PR of its own (`docs/MILESTONES.md`, "Lanes"); the rulebook PR that brings `CLAUDE.md`, `docs/GITHUB.md` and `README.md` in line with ADR-022 (PR #3) leaves T57 unchanged.
    - Needed by: the first destructive migration (none in B0).

## Raised by design handoff 0

- **FQ40. Which layout handoff 0's four screens set.** The brief asked for `H01-open` and `F02-upcoming` "with the brand applied, light and dark, so the system is seen in place", and said "The book's screens are the layouts we keep" (ADR-006). `design/reference/README.md` and `design/reference/INVENTORY.md` say a render in `screens/` wins over `2.1/`. Where no rule decides, handoff 0's screens change 2.1's layout: no photograph of Debby beside "Debby's Friday", smaller avatars, the word "Comment" in place of the comment bubble, and no line above F02's footer. Where a rule decides, the rule is built either way (`INVENTORY.md`, "Known differences").
    - Default: 2.1's layout with handoff 0's colours, cover colours and components, and the rule fixes the brief asked for (Debby's pick, the rail's order, no Share, the Highlight label only on your own cards before the reveal).
    - Needed by: B4.
- **FQ41. Which cover colour each sender gets.** Book p13: "Colours follow stable sender positions and never hidden media." Handoff 0 colours each card and rail cover by its sender, in the club's roster order (Ben cover 1, Maya 2, Sam 4, Debby 5), and its notes ask for a slot stored on each membership that is never given to anyone else after a departure. With six colours, a full club whose membership changes would then have no colour for its newcomer. Spec 31's membership has no such field.
    - Default: each membership keeps one of the six colours for as long as it lasts. A club's founding members take them in the club's roster order, as handoff 0's screens do; a newcomer takes the lowest colour no current member holds; a departure never changes anyone else's colour; a former member's drops that stay keep the colour their membership had. The colour travels with the club's member list, never with a drop (T10), and a name always shows beside it (spec 24). Spec 32's member list is the "Current eligible roster", so it can't carry the colour of a former member whose drops stay (spec 22): how those drops get their colour is for the founder to decide before B4. Claude Code proposes that the member list also carry each such former membership's name and colour, only to viewers in those drops' audiences, so that no drop gains a field. That departs from spec 32's `GET /v1/clubs/{id}/members`, so nothing is built for it before the founder answers. It's added to the membership by an expand-only migration (T57) before B4; slice 4 builds spec 31's membership as written.
    - Needed by: B4.
- **FQ42. Where the brand's identity boards came from.** Handoff 0's document says the wordmark and the icon are "a cleaned, flat reconstruction" of "two supplied identity boards", and keeps "the supplied identity", a folded t, rather than the plaque the brief suggested. The boards aren't in the delivery or the repository.
    - Default: the folded t and the wordmark stand as delivered, as Claude Design's work through the founder (T46), in `dev` and internal TestFlight builds. Before the marks first reach anyone outside the internal testers, the founder confirms where the boards came from and that Tadayo may use the marks. The first such place is the invitation page (`G02-web`, stage B1), which shows the wordmark and which `deploy-dev` publishes on `tadayo.app`, where anyone can load it; then B9's beta review submission, before Gate D. FQ5's trademark clearance stays a prelaunch task. If the founder attaches the boards, Claude Code asks before committing them, as FQ35 does for 2.1's pack: they are material given to Claude Design, not its delivery, and Claude Code adds to `design/reference/` only the deliveries that arrived through a handoff and the files it converts from them (`design/reference/README.md`, "Don't"), while `handoff-0/` stays as the delivery arrived (`docs/DESIGN-HANDOFF.md`, "Naming rule").
    - Needed by: B1, before the invitation page shows the wordmark on `tadayo.app`.
- **FQ43. F02's audience line.** Spec 09: "A short audience line reads Captions now. Photos and videos open for this club on Friday." 2.1 and handoff 0 draw "Captions now. Photos on Friday." above "Shared with Sunday people"; book p8 has "Caption visible to Sunday people now. Photo opens Friday 13 Nov at 7 AM."
    - Default: spec 09's sentence, above "Shared with Sunday people": a contract wins over a render until the founder decides (`design/reference/README.md`), and only its wording stays true when the day has video links.
    - Needed by: B4.
- **FQ44. Dates and times on iPhones set to other regions.** The renders write dates one way: "Friday 13 November", "Fri 13 Nov", "FRIDAY, 6 NOVEMBER", with "7 AM". iOS formats dates by the phone's region and its 12- or 24-hour setting: a US iPhone writes "Friday, November 13", and a UK one "07:00". No source says which applies.
    - Default: the phone's own region and clock settings, through iOS's date templates, with the weekday and the month always as words, never numbers, so a date stays exact (T41). Snapshot tests fix one region. Changing it later touches one formatter.
    - Needed by: B0 (slice 11's date labels).
- **FQ45. Where a later handoff's change to the brand goes.** Handoff 1 asks Claude Design about the avatar fallback's fills, the button's states, a label on a photograph, cover1 and the accent, and the dark icon's background (`docs/plans/B0.md` section 5.2), so its answer may change or add to the brand. ADR-006 makes `design/reference/brand/` the brand every later handoff names. `CLAUDE.md` and `design/reference/README.md` ("Don't") forbid editing a file there, and the naming rule (`docs/DESIGN-HANDOFF.md`) gives each brand asset one name.
    - Default: `design/reference/brand/` keeps handoff 0's files, and the app and the next handoff's brief keep to it until the founder answers, as ADR-006 says ("The brand lives in the repository, in `design/reference/brand/`, and every later handoff names those files as its source"). Anything handoff 1 changes or adds stays as it arrived in `design/reference/claude-design/handoff-1/`, and the inventory names it beside the brand file it would change; what the inventory builds until handoff 1 answers stays built that way until the founder answers this question. Claude Code proposes that the app build from what handoff 1 changes or adds, and that the next brief cite both. That departs from ADR-006 and from `docs/DESIGN-HANDOFF.md`, "Who does what" (once converted, the brand lives in `design/reference/brand/`), so nothing is built from it before the founder answers; if the founder takes it, a new ADR records it and `docs/DESIGN-HANDOFF.md` changes in a rulebook PR of its own. Any other answer changes `CLAUDE.md` and the design reference rules in a rulebook PR of its own.
    - Answered by the founder on 3 November 2026 at 00:58 UTC: adopt brand revision 1.1 (ADR-027). `design/reference/brand/` is remade from it, under the same names, in the design PR that brings handoffs 1 to 4 in; handoff 0's files stay in `design/reference/claude-design/handoff-0/`. On the same day, at 11:15 UTC, the founder chose to bring handoffs 1 to 4 into the repository before slice 11's screens (ADR-027).
    - Needed by: handoff 1's delivery.

## Raised by the contract (B0 slice 3)

- **FQ70. How long a name can be.** No source limits a person's display name, a club's name or the label a proposer types for someone they invite; D09 limits only captions (140) and comments (500).
    - Default: each is 1 to 40 grapheme clusters, counted as the app counts them (Swift's `String.count`) and never in UTF-16 units (T13). The app trims a name before sending it, and the API refuses one, rather than changing it, with a space at either end, a control character, any bidirectional control (U+061C, U+200E, U+200F, U+202A to U+202E, U+2066 to U+2069), a line or paragraph separator (U+2028, U+2029), or nothing visible (only spaces, format characters such as U+200B, combining marks with nothing to sit on, other characters Unicode says to draw as nothing, such as U+034F and U+FE0F, or the blank fillers U+115F, U+1160, U+2800, U+3164 and U+FFA0). Spaces and format characters between visible ones, as in "Ana María" or an emoji joined with U+200D, are kept. A longer limit or a looser rule later is a widening the app and the API can take without breaking anything already stored.
    - Needed by: B0 (slice 8, the profile's name) and B1 (clubs and invitations).
- **FQ71. How long an invitation link lasts.** T7 makes a link single-use; TECH-DESIGN section 6 adds revoking, and the G01 designs put Revoke link in the proposer's own invitation list, so the contract lets only the candidate's proposer make or revoke its link. No source says when an unused one stops working.
    - Default: 7 days from when it was made. Only a link that expires while still live is treated as expired: its preview in the app answers the `expired` state with the inviter's name (`G02-expired`), and accepting it answers `INVITATION_EXPIRED`. A revoked, replaced or used link is `NOT_FOUND`, exactly like an unknown one, even once past its expiry, in the app and on the web page, which shows the inviter's name only for a live link (FQ59). The proposer can make a new link, which replaces the old (one link per candidate). The length is one server setting; a link already made keeps the expiry it was given.
    - Needed by: B1.
- **FQ72. Whether a block can be undone.** Spec 22, spec 23 and D11 define blocking, its departure from shared clubs and a list of blocked accounts (S02-blocked-list); no source defines unblocking or what it would restore.
    - Default: no unblock in the trial. The contract lists blocked accounts and has no route to remove one. Adding it later is a new route that changes nothing already built; an unblock would never put anyone back in a club.
    - Needed by: B6.
- **FQ73. What a drop's reaction summary shows.** Spec 16 asks for "a compact reaction summary without ranking contributors"; D07 says reactions are shared after the reveal; book p3's lesson is "reactions without public counts"; R01-reactions has no render. No source says who sees which members reacted.
    - Default: after the reveal, everyone who can read the drop sees which reactions it has, with no names and no number, and their own reaction as theirs. The drop's author also sees the names of the members who gave each, in the club's roster order (FQ26), as their push already names them (spec 21). Nobody sees a count (T15, T33), and no name goes to anyone but the author. That doesn't make a reaction anonymous in a small club: there is one reaction (FQ22) and nobody reacts to their own drop (spec 16), so in a club of three, a heart a member didn't give on another's drop can only be the third member's, and in larger clubs a heart tells that someone else reacted. Giving members only their own reaction, with no summary, would close that, against D07's shared reactions; that is the founder's choice. Names shown to the club during the trial couldn't be taken back, so this is the narrower reading; showing them to everyone later changes one serializer and no stored data. A reaction from someone who later left or was blocked goes with their access. How it's drawn waits for R01-reactions' render (`docs/DESIGN-HANDOFF.md`).
    - Needed by: B6.
- **FQ74. Whether a caption card's opaque ids are inside T10.** T10 lets a pre-reveal response to anyone but the author carry "the approved caption text, the author's display identity, the target person, the occurrence date, the media class and a safe status", and names no id. The caption card (`DropCaption`) carries the drop's id, and names the author by their membership's id with their name and avatar version. Of identifiers, spec 07 forbids only "photograph identifiers that grant read access" ("Knowing a drop ID is not authorization"), T9 says knowing an id grants nothing, and spec 20's exact hidden drop and T38's exact deep links need one. The ids are random and carry no time, order, count or media (T9, T14); the app also needs them to report a caption before the reveal (spec 22), to keep each card in place when the day opens, and to fetch the author's avatar.
    - Default: this reading of spec 07, T9 and T38: the drop's opaque id and the author's membership id are part of the card's identity, and nothing else is added: no status, time, position, version, dimensions or any media field. The contract's tests pin the card's schema exactly (`id`, `view`, `author` as a `Person`, `media_class` as the two-value `MediaClass`, and `caption`), the author to `membership_id`, `display_name` and `avatar_version`, and every schema a day before the reveal can reach; the leak scanner (slice 7) allows no other field. It's recorded here, and as a departure in the journal's section 0.8, because T10 outranks the spec and lists no id, and only the founder widens its whitelist: the founder's answer is needed before slice 7 writes the leak scanner's whitelist.
    - Needed by: B0 (slice 7, the leak scanner's whitelist).
- **FQ75. How someone appears after a membership ends.** A `Person` carries a member's name and avatar version. When their membership in a club ends (they leave, block, are blocked out or delete their account), their kept drops, comments and reactions still show them, and someone who left still sees each day's star through their own contributions (spec 22, `GET /v1/me/drops`). No source says whether those show the person as they are now, so a later change of name or photo would reach the people they left or blocked.
    - Default: once either membership has ended (the person's, or the viewer's own in that club), the person appears with the name they had when it ended and no avatar version, so the app shows the initial; the avatar route already answers only while both memberships are active. The list of blocked accounts follows the same rule, since a block ends every membership the two shared: it shows the name the person had when the block took effect. Showing current names later needs no data change.
    - Needed by: B6.
- **FQ76. Whether a held drop's media goes back to its author.** A drop on a moderation hold at the cutoff (spec 06, T29) won't open with the day. The contract shows its author that it's held (`OwnDropState` `held`), which is the contract's choice: no source says what the author sees. The author's preview (T11) serves the author's own photo or link; no source says whether it still does while the drop is held.
    - Default: no. While a drop is held, its author sees its caption and the held state, and the preview answers `NOT_FOUND`, as it does once a drop is withdrawn or removed (T23). Serving it again later changes the route alone.
    - Needed by: B4 (the author's preview), with the hold itself in B5.
- **FQ77. Where Share again's link comes from, and what a retried link request returns.** The contract has the server return an invitation link once and keep only a hash of its token: no source says how a token is stored, and T7 requires only that the link be single-use, grant nothing before acceptance and carry its token in the URL's fragment. `G01-invite-people` offers Share again for a link already shared, and handoff 2 keeps a prepared link when the share sheet is cancelled, without making a second one. T19 says a retried request returns the original answer, which would need the token kept.
    - Default: the app keeps each link it makes in its per-account store, purged at logout and at an account switch like T11's cache, until the link is used, revoked or expired, and Share again shares that copy. Where the app no longer holds it (a reinstall, another phone, or a response lost before it arrived), the row offers Create new link, which replaces the earlier one, under a new key. A retry of `createInvitation` with the same key returns the first answer without its link and commits nothing new, as TECH-DESIGN section 6 has an upload's replay do once it's complete, so one key commits once (T19) and no stored answer holds a usable token. A revoke ends only the link: the candidate keeps their place, and the proposer can make a new link (handoff 2). Keeping tokens for replays instead would change the server alone.
    - Needed by: B1.
- **FQ78. Whether the schedule names who has confirmed.** Book p11 says "Occupied days identify their owner", the handoff 3 brief (in the project's files, `design/handoff-3/`) asks that "a day another member has already confirmed shows its owner", and handoff 3's delivery names them (`G04-conflict`, and the `G04.error.chooseTaken` and `confirmTaken` copy, "{weekday} is now {ownerName}'s day"; the ios lane's PR #13). FQ48 makes such a day `taken`. Naming owners also tells each member, by elimination, who hasn't confirmed yet, though nothing says it or counts it; the same brief asks that what a member sees after confirming while others haven't has "no names and no count".
    - Default: as book p11 asks, a taken day names its owner, and nothing else names, counts or waits on those who haven't confirmed (T33). The contract's first version named nobody, after its first review read the owners as telling who hadn't confirmed; this review found book p11 and handoff 3, so the default now follows them. With FQ55, where neither member of a clash can confirm, named owners also mean that when exactly two other members haven't confirmed and a day shows no reveal scheduled, those two are the ones who chose it, which FQ46's default keeps from the rest of the club; FQ46 and FQ78 are one choice for the founder. Naming nobody instead would change one field. `G04-one-day` and `G04-change` show the proposed week with each member's name, so B2's contract PR settles the proposal's shapes with FQ46, FQ48 and FQ55 before anything is built on them.
    - Needed by: B2.
