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
    - For `dev`: the region nearest the founder, who runs every device check. Answered by the founder on 1 November 2026: they are in Virginia, US, so `dev` is in US East (Supabase `us-east-1`, Fly `iad`; ADR-016).
    - For `prod`: the region where most trial members live. That's the US East region (Supabase `us-east-1`, Fly `iad`) for the US, and Paris for West Africa or Europe. The founder confirms it before `prod` is created at Gate D.
    - A Supabase project can't move region, only be recreated; for `dev`, which holds only test data, that's about an hour's work.
    - Needed by: B0 for `dev`; Gate D for `prod`.
- **FQ4. Your iPhone and iOS version, and the trial members'.** The app's minimum iOS decides which phones can install it, the founder's included. The founder's iPhone can't open Claude Docs, whose viewer asks him to update iOS, so it may not be on a recent version.
    - Answered in part by the founder on 1 November 2026: their iPhone is an iPhone 13 on iOS 18.3.2, so the iOS 17 minimum stands (ADR-018). The trial members' phones are still unknown.
    - Default: iOS 17 minimum, which runs on the iPhone XS, XR and later, built with the newest SDK so that newer iPhones get the current system look. The app's view models use Apple's Observation framework, which needs iOS 17.
    - If the founder's or a trial member's iPhone can't run iOS 17 (an iPhone 8 or X stops at iOS 16), tell Claude Code before B0. The app then needs iOS 16 and a slightly different structure.
    - Needed by: B0.
- **FQ5. Domain, identifiers and the name.**
    - The domain: `tadayo.app`. Answered by the founder on 1 November 2026, who registered it on Cloudflare (ADR-017).
    - Default: bundle id `app.tadayo`, with `app.tadayo.share` and `app.tadayo.widgets`; app group `group.app.tadayo`. The bundle id can't change after the App Store record exists.
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

Each is a place where two sources disagree and the fix would loosen one of them, so it waits for the founder. The default holds until then.

- **FQ31. Keeping `INVENTORY.md` current.** `CLAUDE.md` ("Repository layout") and `design/reference/README.md` forbid editing anything in `design/reference/`, `INVENTORY.md` included. `CLAUDE.md` ("The rules easiest to break by accident"), `INVENTORY.md` itself, `docs/DESIGN-HANDOFF.md` and the definition of done in `docs/MILESTONES.md` require keeping it current.
    - Default: Claude Code keeps `INVENTORY.md` current in the same commit as the change, adding rows and never deleting one. Nothing else already in `design/reference/` is edited, moved or renamed. The starter-pack PR's edits to it were part of the founder's request to fix the documents.
    - Needed by: B0.
- **FQ32. The operator's case access.** T9 names the author's preview as the read rule's only exception. Spec 07 gives the moderation operator "restricted audited case access" before and after the reveal, and T55 has an `operator` role.
    - Default: T9 as written. No route serves a drop's content to the operator; the `ops` moderation scripts (FQ27) hold or remove a drop by its id and write an audit row. If a report can't be handled without seeing the content, Claude Code asks the founder first.
    - Needed by: B9.
- **FQ33. Which dismissals are durable.** T62 says "Dismissals are durable". Spec 19 has two controls: Dismiss hides the suggestion, and "Don't suggest this day again" stores the one durable per-user exclusion.
    - Default: T62 as written: every dismissal is durable.
    - Needed by: M1.5 (Remember this).
- **FQ34. The weekly trial report against `prod`.** ADR-012 and `docs/TECH-DESIGN.md` section 1 run the weekly trial report through `ops`, and the trial lives in `prod`. Section 9 lets `ops` act on `prod` only for the moderation scripts, the Supabase probe and the review-access switch.
    - Default: the report runs on `dev`'s seeded data (Gate D's "trial report on seeded data"), and against `prod` only once the founder answers.
    - Needed by: Gate E.
- **FQ35. Adding 2.1's own pack.** FQ25's default has the founder attach 2.1's pack, with its HTML reference and tokens file in `design/reference/pack/`. `CLAUDE.md` ("Repository layout") and `design/reference/README.md` let Claude Code add only handoff deliveries and the files made from them. The README's table gives `pack/` to the founder, who can't create a folder from GitHub's upload page on a phone (`docs/DESIGN-HANDOFF.md`).
    - Default: build from the PDF, as FQ25 says. If the founder attaches the pack, Claude Code asks before committing it.
    - Needed by: B0.
- **FQ36. What `dev` holds.** `docs/TECH-DESIGN.md` section 7 says `dev` holds synthetic data only. ADR-004 and ADR-011 point the founder's builds, and so the founder's own account, at `dev` until Gate D. FQ28 adds a friend as an internal tester. Their email addresses, photos, captions and comments are real.
    - Default: everything the founder and the internal tester add on `dev` is personal data. It never goes into logs, PRs, the journal or evidence (T52), and scripts and seeds never read or change their accounts. Everything else on `dev` stays synthetic.
    - Needed by: B0.
