# The new direction, revision 1: how to apply it

From the founder, 15 November 2026. For the api lane, the ios lane and the project's coordinator.

- **The directive:** `docs/tadayo-new-direction-addendum-r1.md`, cited as "addendum 4" for its section 4, with its verification items as "ND01" to "ND15". It transcribes `docs/tadayo-new-direction-addendum-r1.pdf` word for word: 2,396 words, with no difference in a word-by-word comparison. If the two ever differ, the PDF wins.
- **Its baseline:** the addendum was checked against three source blobs: the spec `56a6958`, the invariants `387a2aa` and the book `fa6b860`. On 15 November 2026 these are still the files on `main` at `2dbf2c2`. If any of the three changes on `main` before the rulebook PR merges, compare that change with the addendum and report what you find.
- **This file** turns the addendum into work: the decisions already made (section 2), the order of work (3), the exact rulebook edits (4), what the contract and the database must carry (5, 6), the design (7), the work by stage (8), the privacy checks (9), the verification map (10), seven questions with their defaults (11), and what not to do (12).

## 1. What changes

The addendum is my instruction. `CLAUDE.md` says the invariants beat everything except a direct instruction from me, so where the addendum explicitly changes a rule, it beats the spec, the book and the invariants. Everything else keeps its current contract, including every adopted handoff correction (addendum 1, 7).

| Change | Until now | From now | Where it lands |
|---|---|---|---|
| Allowances by role | Six drops, at most two of them video links, for everyone (A06, A07, spec 11, T17) | **The star, on their own day:** six drops, at most two of them video links. **Anyone else:** at most two photos and one video link, three drops in all. The server decides the role. Per occurrence, never per week (addendum 2) | The contract and the database now; B2 (api); B4 (both lanes) |
| Own-day preparation | The star's prompt is "What would you like your friends to see" (spec 16); Welcome follows book p9 | "What have you been up to?" when the person chooses their own row. The brand line "Your day. Your story. A thought from your friends." Welcome explains taking turns sharing your life, with optional additions from friends (addendum 1, 3) | B1 (Welcome); B4 (composer, picker, idea helper) |
| The revealed feed | One chronological feed (spec 15, T35) | Two sections in one scroll: "From {starName}" (the star's own drops), then "From friends". Each is in commit order with the id as tiebreak. An empty section is left out with its heading. The same on Home, in Memories and on a linked day (addendum 4) | B5 (both lanes); Memories in B6 |
| Photo replies | A comment is text (spec 16) | A message is text, one photo, or one photo with text. Under the drop, at most one compact preview: "{authorName} added a photo" (addendum 5, 6) | The contract and the database now; B3, B6 and B8 (api); B6 (ios) |

## 2. Decisions already made

Don't re-derive these. If you think one is wrong, say so in your PR and keep the decision until I answer.

1. **The spec and the book stay as written.** The addendum supersedes them where it says so. `docs/INVARIANTS.md`, `CLAUDE.md`, `docs/TECH-DESIGN.md` and `docs/MILESTONES.md` are amended so that no rule contradicts it (section 4). Never edit the addendum, its PDF or this file. If one of them needs a fix, tell me.
2. **One ADR records the adoption** (section 4.5). It also adds photo replies to ADR-007's trial scope, since the addendum puts them in scope. And it records my choice to redraw the parts of 2.1's renders that the addendum changes, the way ADR-006's "Later" line records an earlier redraw.
3. **No grandfathering code.** The addendum grandfathers only real upcoming committed data that exceeds the new allowance. There isn't any:
    - `prod` doesn't exist until Gate D;
    - on `2dbf2c2`, no route, worker job or `ops` script creates a drop: only the tests in `tests/src/db/` insert into `app.drops`, and the routes that add drops come in B2 to B4.

    The rulebook PR checks both facts again and records them in the ADR. Development fixtures and tests move to the new rules (addendum 7).
4. **Tests of the old friend limit are replaced, not deleted.** Any test that lets a non-star add a fourth drop, a third photo or a second video link is rewritten to assert the new limit, in the same PR. The PR's description lists each one, old and new. The addendum asks for exactly this ("Update development fixtures and policy tests"), so it isn't editing a test to make it pass. The star's six-and-two tests stay. No check gets weaker (T58).
5. **The pre-reveal whitelist doesn't change** (T10). The new fields exist only in revealed answers: a drop's feed section, a comment's photo and the feed's reply preview. Each is added on purpose, in the PR that first serves it:
    - to the per-role serializers (T55);
    - to the leak scanner's revealed-phase rules (`tests/src/privacy/scanner.ts`), with negative tests showing it never appears before the reveal, outside the drop's audience, or after a removal;
    - with the privacy reviewer.

    That is a rule I changed, not a widening to pass a test, and the PR says so. The allowance's new numbers are the caller's own, as today's are (T15). Whatever rules the scanner applies to the allowance now cover them too.
6. **The share extension keeps its six-photo maximum** (`apps/ios/project.yml`, the activation rule), because a star can add six. Once the person is chosen, the extension applies that person's allowance. It keeps the whole selection when it doesn't fit, and asks for a deliberate change before Add.
7. **Copy.** The addendum's strings are exact:
    - "What have you been up to?";
    - "What made you think of {name}?";
    - "From {starName}" and "From friends";
    - "{usedPhotos} of 2 photos · {usedVideoLinks} of 1 video link";
    - "{authorName} added a photo";
    - "Add photo to this conversation" (VoiceOver);
    - the brand line.

    Copy the addendum doesn't give is a question in section 11, with its default. The copy lint (`packages/domain/src/copy/rules.ts`) runs on every new string. "Send" is fine on a button; "Sent" never names a state (T41).
8. **The friend's allowance line counts the way the star's does.** Whatever the star's line counts today (committed drops, or committed plus reserved), the friend's line counts the same, so the two lines behave alike.
9. **Native, with no new motion.** The camera route uses the system camera. The library route uses the system photo picker (PhotosPicker, iOS 16 or later, well inside the iOS 26 minimum), which runs outside the app and needs no photo-library permission, so the library route always works. Only the camera asks permission, and only when chosen (T45, T50). Nothing adds custom motion (T48).
10. **Design follows `docs/DESIGN-HANDOFF.md`, one brief per stage.**
    - The ios lane records now, in `design/reference/INVENTORY.md`, where the addendum overrides a 2.1 render, and adds a row for each new state (section 7.1).
    - Each stage's handoff (B1, B4, B5, B6) adds the states section 7.2 lists.
    - Meanwhile, those states are built from the addendum and the spec and marked "built from spec".
    - The visual identity stays brand revision 1.1 (addendum 7).
11. **When.**
    - Nothing open is interrupted.
    - The rulebook PR comes first. Then the contract and database PRs and the inventory PR, before Gate 0, so that Gate 0's report shows the contract and schema the build will use.
    - If Gate 0 is otherwise ready before they are, Gate 0 goes ahead and they become the first PRs of B1.
    - Routes and screens come at their stages (section 8).

## 3. The order of work

### The coordinator

1. Reserve one ADR number and seven FQ numbers, one for each of questions A to G in section 11. Keep them in the project's memory and tell both lanes.
2. Sequence the work:
    - the api lane's rulebook PR first;
    - its contract and database PRs after the rulebook PR;
    - the ios lane's inventory PR once the rulebook PR has merged.
3. The database PR takes the next free migration number (`0010` on `2dbf2c2`). If another migration is in flight, the later one to merge renumbers.

Your messages are a colleague's requests. Approvals come only from me, in the thread that reported the PR (ADR-025).

### The api lane

1. Finish your open PR, or set it aside as `docs/MILESTONES.md`, "Lanes", says. Nothing here is urgent enough to interrupt a review, a freeze or a run on `dev`.
2. **`api/b0-new-direction-rules`, the rulebook PR.** It does the following:
    - It adds three files exactly as given: `docs/tadayo-new-direction-addendum-r1.pdf`, `docs/tadayo-new-direction-addendum-r1.md`, and this file as `docs/plans/new-direction-r1.md`.
    - It makes sections 4.1 to 4.4's edits.
    - It adds the ADR (section 4.5) to `docs/DECISIONS.md`, and questions A to G (section 11) to `docs/QUESTIONS.md`.
    - In the journal, it updates:
        - section 0: 0.1's product lines, 0.4's table (the addendum's row), 0.6 and 0.7;
        - the audit map: the rows of the changed invariants (T3, T12, T17, T24, T25, T27, T31, T33, T35 and T36), new rows for T63 to T65, and a new table, "Addendum verification (ND01 to ND15)", with each item `planned` at the stage section 10 gives it;
        - `docs/PROGRESS.md`'s Shared section.
    - It's verified when:
        - `python3 tools/ci/journal_check.py --branch` passes;
        - the copy lint passes;
        - a search of `CLAUDE.md`, `docs/INVARIANTS.md`, `docs/TECH-DESIGN.md` and `docs/MILESTONES.md` finds no claim left that everyone has the same allowance, or that the feed is one chronological list. Leave alone the text of design handoff 0, in `docs/plans/B0.md` and `docs/DESIGN-HANDOFF.md`, which is history;
        - a fresh subagent has reviewed it, and I've approved it.
3. **`api/b0-new-direction-contract`, the contract PR** (section 5).
4. **`api/b0-new-direction-db`, the database PR** (section 6).
5. At each stage, the work section 8 lists.

### The ios lane

1. Finish your open PR, or set it aside as the lanes' rules say.
2. Once the rulebook PR is open, read the three files from its branch. Build nothing on them until it has merged.
3. **`ios/b0-new-direction-inventory`**, after the rulebook PR merges: the inventory changes in section 7.1.
4. At each stage, the work section 8 lists, with that stage's design handoff carrying section 7.2's states.

## 4. The rulebook edits

Here and below, "FQ<A>" to "FQ<G>" stand for the numbers the coordinator reserves for questions A to G (section 11), and "ADR-<n>" for the ADR's number.

### 4.1 `CLAUDE.md`

1. **The intro.** Replace "The star adds to their own day under the same allowance as everyone else. Nothing is counted, nobody is chased." with:

    > Members take turns sharing what they've been up to. The star adds up to six drops to their own day; each friend may add up to two photos and one video link. Nobody has to add anything, nothing is counted, nobody is chased. After the reveal, anyone who can see a drop can answer it in its conversation, with text, a photo or both.

2. **What matters most, item 3.** Replace "At 7 AM, Home is the day itself, finite and in order." with "At 7 AM, Home is the day itself, finite and in order: the star's own drops first, then friends'."
3. **Sources of truth.** After the book's bullet, add:

    > - **`docs/tadayo-new-direction-addendum-r1.md`:** my new direction, revision 1 (14 November 2026), transcribed word for word from its PDF beside it. Cite its sections as "addendum 4" and its verification items as "ND07". It supersedes the spec, the book and the invariants on what it explicitly changes: allowances by role, own-day preparation, the star-first revealed feed and photo replies in conversations. Everything else keeps its contract, and adopted handoff corrections still apply. `docs/plans/new-direction-r1.md` says how it's applied.

4. **The invariants' bullet.** "rules T1 to T62" becomes "rules T1 to T65".
5. **The rules easiest to break.**
    - Replace the bullet "**Six and two in one transaction (T17); one commit per idempotency key (T19).** The key is created when the action starts and reused on every retry." with:

        > **Allowances by role, in one transaction (T17); one commit per idempotency key (T19).** The server decides the role from the membership intervals, never from the app: six drops and two video links for the star, two photos and one video link for anyone else. The key is created when the action starts and reused on every retry.

    - After the bullet on removal (T24), add:

        > **Photo replies follow their drop (T63 to T65).** A reply photo is read through the drop's read predicate and the media route, commits only after the reveal, uses no allowance, and goes wherever the drop's removal goes.

### 4.2 `docs/INVARIANTS.md`

- **The opening paragraph** names the addendum as a source beside the spec, the book and the founder.
- **The citation list** gains:
    - "**addendum 4**: section 4 of the new direction addendum (`docs/tadayo-new-direction-addendum-r1.md`)";
    - "**ND07**: its verification item 7".
- **T3.** Replace "From that instant the occurrence is frozen: no new drops, replacements, caption edits or highlight changes, only removal." with:

    > From that instant the occurrence's drops and highlights are frozen: no new drops, replacements, caption edits or highlight changes, only removal. The freeze doesn't reach conversations: comments, photo replies included, go on after the reveal and after the day closes (T64).

    Add "addendum 7" to its sources.
- **T12.** After "Every derivative (display, full, widget still, Live Photo motion) has the same audience and reveal boundary as its source.", add "A photo in a conversation and its thumbnail have the audience of the drop they answer (T63)."
- **T17.** Replace the whole invariant with:

    > - **T17. Allowances by role, per contributor per occurrence.** For each contributor membership interval and occurrence, live reservations included:
    >     - **the star** (the author's interval is the occurrence's star interval, as the server reads them; never a flag from the app): at most six drops, of which at most two are external video links;
    >     - **anyone else:** at most three drops: at most two photos and at most one external video link. A friend's third drop can only be a video link;
    >     - a Live Photo counts as one photo; a replacement that changes a drop's kind is checked against the limits again;
    >     - a highlight is a pointer, never an extra drop; Drafts and photos in conversations use none of it;
    >     - per occurrence, never per week, even for a member with two days;
    >     - enforced in one transaction with row locks or serializable isolation; the database's last guard holds each role's limits, and a counter CHECK is never the only guard;
    >     - a refusal names the exact day and the caller's own usage, never anyone else's (T15).
    >
    >     (A06, A07, spec 11, 31; addendum 2; Q10, Q14; ND01 to ND04)

- **T24.** "The feed, highlights, reactions, comments, favourites, …" becomes "The feed, highlights, reactions, comments and their photos, the feed's reply preview, favourites, …".
- **T25.** Add at the end: "This holds for a photo in a conversation: removing it never removes the drop it answers (addendum 5; FQ<E>)."
- **T27.** In step 2, "purge media, captions, comments, reactions and favourites" becomes "purge media, captions, comments and their photos, reactions and favourites".
- **T31.** Replace "Changing the recipient recalculates the date and the allowance." with "Changing the recipient recalculates the date and the allowance for the new role, and keeps the person's work when it doesn't fit: nothing is added until they change it (addendum 2, 3)."
- **T33.**
    - "completion scores, progress rings or six empty slots;" becomes "completion scores, progress rings or empty slots;".
    - Add the bullet "a response count, or anything that says who hasn't answered, or that a section of the day is empty."
- **T35.** Replace the whole invariant with:

    > - **T35. The day is finite, the star's own drops first.**
    >     - A revealed day is two sections in one scroll: "From {starName}", the star's own drops, then "From friends", everyone else's. Each is in commit order, with the id as a tiebreak.
    >     - An empty section is left out with its heading. A day without the star's drops never says so.
    >     - It's never re-ranked by reactions, comments or photo replies, and never followed by another stream.
    >     - The same grouping on Home, in Memories and on a linked day. Stored submission times and records don't change.
    >     - It ends with "That's Debby's Friday."
    >     - A refresh doesn't move cards.
    >
    >     (spec 15; addendum 4; Q16; ND05, ND06)

- **T36.** After the list, add: "A photo reply is one comment event, never a category of its own (addendum 6)."
- **A new section at the end, "Photo replies":**

    > - **T63. A photo reply has its drop's audience.** A photo in a drop's conversation is read only by viewers who may read that drop: its immutable audience (T8), through the one read predicate (T9), plus the photo's own availability (ready, not deleted, not removed). Preparing its upload, committing the message, and every read of the message, its photo, its thumbnail and the feed's preview each check again; opening the conversation grants nothing. Joining or rejoining later never reaches an earlier drop or its replies. The bytes come only through the media route (T12). Losing the drop (a withdrawal, a removal, a suspension or the end of access) closes its conversation and every path to its photos, previews and notifications. A provider removing a video is not a withdrawal. (addendum 5, 6; ND08, ND12, ND13)
    > - **T64. Photo replies come after the reveal, outside the allowance.** A photo message commits only when the server's clock, read at commit, has reached the drop's `reveal_at` (T1). Before that, no upload is prepared for one. It stays possible after the day leaves Home, and in Memories. It uses no reservation or counter, and never changes the frozen manifest. It is never a drop: it can't be highlighted, favourited as a drop, copied into Drafts or shown as a card of the day. (addendum 5, 6; ND08, ND11)
    > - **T65. One quiet preview, per viewer.**
    >     - Under a revealed drop, the feed shows at most one preview: the thumbnail and "{authorName} added a photo" of the latest photo reply that viewer may read now. Tapping it opens the drop's conversation at that reply. It's computed for that viewer and never cached across viewers. It's recomputed after a withdrawal, a removal or a loss of access, and it's gone when none remains.
    >     - Nobody but its author sees a photo message, or a preview of it, until its photo is ready and the message has committed. Choosing or taking a photo never sends it; only Send does.
    >     - There's no response count anywhere, and replies never move the drop (T35).
    >     - A message holds at most one photo. Its text is optional when a ready photo is attached, keeps its 500-grapheme limit (T13), and can be edited like any comment's (FQ<D>). A sent photo is never replaced in place.
    >     - A retried send commits one message and one notification event (T19, T54).
    >
    >     (addendum 5, 6; ND09, ND10, ND13, ND15)

### 4.3 `docs/TECH-DESIGN.md`

- **The testing table's "Privacy matrix" row.** Add the states of a comment's photo: pending, ready, deleted by its author, removed (pictured or moderation), and on a withdrawn drop. Its roles already include the member who joined after the commit, the rejoined member, the former member and the blocked one.
- **The "Concurrency" row.** "Last-slot races give at most six drops and two links (Q10)" becomes "Last-slot races stay within the role's allowance: six drops and two links for the star, two photos and one link for anyone else (Q10, ND02)".
- **Section 6.** Wherever it describes the counters, the comment model, upload purposes or the media route, it says what sections 5 and 6 of this file add.

### 4.4 `docs/MILESTONES.md`

- **B1, ios:** A01 with the brand line and the new explanation (addendum 1, 3; FQ<C>).
- **B2, api:** "Reservations and counters, the six-and-two transaction" becomes "Reservations and counters, with the allowance transaction by role (addendum 2; T17)". Add ND01, ND02 (the API's half) and ND04 to its tests.
- **B3, api:**
    - upload intents gain a conversation photo's purpose, refused for a drop the caller can't read or whose day hasn't opened (T63, T64);
    - the media route serves reply photos and their thumbnails.
- **B4, ios:**
    - The role's allowance in the composer, multi-select, retry and resume, Drafts submission and the share extension.
    - The own-day prompt, and the idea helper's own-day set.
    - The friend's allowance line and limit states.
    - A change of person keeps the work.
    - Tests: ND01 to ND03 and ND07, the app's half.
- **Gate B.** "the allowance at six and two, with the race test's results" becomes "the allowances by role (six and two on one's own day, two photos and one link on a friend's), from the app and the share extension, with the race test's results".
- **B5, both lanes:** R01 in two sections on Home and on a linked day. Tests ND05 and ND06.
- **B6, api:**
    - comments with an optional photo (T63 to T65);
    - the feed's reply preview;
    - reply photos in every removal path, account deletion included.
    - Tests ND08, ND09 and ND11 to ND13.
- **B6, ios:**
    - R04's photo button, Camera and Photo Library, the attachment preview, Send, failure and retry, photo messages, and the full image and back;
    - the preview under the drop card;
    - Memories' day in two sections.
    - Tests ND09, ND10, ND13 and ND14.
- **B8:** a photo reply is one comment event (ND10's notification half).
- **B9:** analytics' categorical fields (addendum 7); ND15 in the readiness audit.
- **Gate C** gains:
    - the star's drops first, on Home and in Memories;
    - a photo reply with and without text, its preview, and its withdrawal;
    - a late joiner refused, with the privacy matrix's results.

### 4.5 The ADR

> **ADR-<n> · The new direction, revision 1 · 2026-11-15 · decided**
>
> **Context:** On 14 November 2026 the founder gave a new direction (`docs/tadayo-new-direction-addendum-r1.md`): allowances by role, own-day preparation, a star-first revealed feed and photos in conversations.
>
> **Decision:**
> - The addendum is a source of truth beside the spec and the book. It supersedes them, and the invariants, on what it explicitly changes; the spec and the book stay as written.
> - The invariants T3, T12, T17, T24, T25, T27, T31, T33, T35 and T36 are amended, and T63 to T65 added.
> - ADR-007's trial scope gains photo replies.
> - Where a 2.1 render shows what the addendum changes, the addendum wins until that stage's handoff redraws it; the rest of the render stays the reference.
> - No grandfathering is needed: `prod` doesn't exist before Gate D, and no route, job or script has ever committed a drop (checked at <sha>: <what was run>).
> - The order of work is the one in `docs/plans/new-direction-r1.md`.
>
> **Alternatives:**
> - Editing the spec and the book in place, which would lose the founder's text and the baseline it was checked against.
> - Applying the changes only stage by stage, which would leave Gate 0's contract and schema on rules the founder has replaced.
>
> **Consequences:**
> - More work in B3, B4, B5, B6 and B8.
> - Gate B's and Gate C's checks change.
> - Four stage handoffs carry the new states.
>
> **Links:** the addendum; ADR-006, ADR-007; T3, T17, T35, T63 to T65; FQ<A> to FQ<G>; ND01 to ND15.

## 5. The contract PR

The api lane designs the shapes. This is what they must carry. The contract changes only in its own PR.

- **The allowance.** The caller's own usage and limits on that day:
    - drops, photos and video links, each committed and reserved;
    - the limits: 6, 6 and 2 for the star; 3, 2 and 1 for anyone else.

    It's enough for the app to draw the star's line or the friend's without knowing the rule, and it holds nobody else's numbers (T15). `Allowance` in `packages/contracts/src/common.ts` fixes `limit` at 6 and `external_limit` at 2 today; those ranges change.
- **Refusals:**
    - `QUOTA_FULL` for the total;
    - `EXTERNAL_LIMIT` for video links (one for a friend, two for the star);
    - a new code for a friend's third photo while their link is still free (for example `PHOTO_LIMIT`).

    Each carries `target`, the caller's `allowance` and `next_target`, as today, and its description changes with it (`packages/contracts/src/errors.ts`).
- **No role field in any request** (addendum 2). An answer may tell callers which role they hold on that day, since it's their own.
- **Uploads:** a purpose for a conversation photo that names the drop, with the same types and size limits as a drop's photo.
- **Comments:**
    - create one with text, a ready photo upload, or both: at least one, with text of 1 to 500 graphemes when present;
    - a comment carries its photo as the media route's reference (never a URL), its author and its optional text;
    - a deleted or removed comment carries neither text nor photo;
    - an edit changes text only.
- **The revealed day:** each drop's section (the star's or friends'), or the two lists in order. It's absent from every pre-reveal answer.
- **The feed card:** the optional reply preview, holding the reply's comment id, its author, and the media route's reference to the thumbnail. It appears in revealed answers only.
- **The media route:** a reply photo and its thumbnail.
- **The mock's fixtures:**
    - a friend's allowance (Ben on Debby's Friday: "1 of 2 photos · 0 of 1 video link") and a star's;
    - the new refusal;
    - both sections;
    - a photo reply, a photo with text, and a preview.

    Rewrite the examples in `packages/contracts/src/fixtures/examples.ts` that give a non-star more than the new limits.
- **The app's client.** Changes to the operations `TadayoAPIClient` calls stay additive (the lanes' agreement of 2026-11-05). `ci`'s `swift` step regenerates `TadayoAPI` from the contract, and it must stay green.

## 6. The database PR

- **A new migration;** never edit a merged one (T57: expand, migrate, contract). If any step would drop or rewrite data, it's destructive: stop and raise it (FQ39).
- **The counters' last guard holds each role's limits.** `app.contribution_counters` (in `db/migrations/0006_contributions.sql`) checks only 6 and 2 today, whatever the role. The suggested design:
    - write the row's limits when the row is made, from the two intervals (the row's key already fixes the role);
    - CHECK against them, with photos as total minus external.

    Another design that gives the same last guard is fine.
- **Comments gain an optional photo:**
    - its media reference, its processing state and its removal state;
    - text may be absent only when the photo is there (a CHECK);
    - a deleted or removed comment keeps neither text nor media reference;
    - the existing guard that refuses a write before the drop's `reveal_at` (`db/migrations/0007_after_the_reveal.sql`) covers the photo too;
    - an index for the latest photo reply on each drop.
- **A reply photo's media** lives in the existing media tables, with its comment as owner, and every purge path reaches it: author deletion, account deletion, pictured removal, moderation and the drop's withdrawal. Each writes its tombstone (T28).
- **Tests in `tests/src/db/`** (`drops.test.ts` and `world.ts` assume six and two for everyone today):
    - a friend's third photo and second link are refused by the last guard;
    - the star keeps six and two;
    - one interval's and one occurrence's counts never touch another's;
    - a comment with only a photo is accepted, and one with neither text nor photo refused;
    - a photo comment before the reveal is refused;
    - deleting a comment clears its text and its media reference.

## 7. Design

### 7.1 The inventory, now (`ios/b0-new-direction-inventory`)

- **"Known differences":** each 2.1 render that shows what the addendum changes. The ones I found on `2dbf2c2`:
    - `A01-welcome`: its headline and explanation ("A day, made by your people. Friends collect things with you in mind. Open them together on your day.") give way to the brand line and the turn-taking explanation;
    - `C02-photo` and `F02-your-drops`: Ben, a friend on Debby's day, sees "2 of 6 drops · 0 of 2 video links" and "2 of 6 added". A friend's line is now "{usedPhotos} of 2 photos · {usedVideoLinks} of 1 video link";
    - `C07-limit`: Ben, a friend, has six drops for Debby, which a friend can no longer reach. The star keeps this state, and friends get their own (FQ<A>);
    - `H01-open`, `H01-open-dark`, `R01-blank-caption` and `R01-past-day`: on Debby's day, Maya's drop leads the feed although Debby has a pick, so Debby has drops of her own; and none of them has section headings;
    - `H01-your-day`: Ben's own drop leads, as the addendum wants, but without its heading;
    - `R04-comments`: no photo button beside the field.

    Add any others your check finds.
- **Rows that change their description, never deleted:** `C02-star` ("What would you like your friends to see" becomes "What have you been up to?").
- **New rows,** `missing`, at their stages, for every state in section 7.2 that has none. Never delete a row (ADR-020). The counts and the journal's design line change with them.

### 7.2 The states each stage's handoff adds

These names are suggestions; follow the naming rule and spec 29's ids. Each stage's brief also asks for the dark and largest-text frames its rule calls for.
- **B1:** `A01-welcome` redrawn, with the brand line and the turn-taking explanation; `G02-invitation` only if its explanation changes.
- **B4:**
    - the star's own composer with "What have you been up to?";
    - the friend's allowance line, also as a component on the sheet;
    - a friend's limit states: three drops, two photos, one link;
    - a person changed and the work no longer fits, with the work kept;
    - the share extension over a friend's allowance;
    - Drafts submitted over the allowance;
    - the idea helper's own-day set.
- **B5:**
    - R01 with both sections, with friends only (no star heading), and with the star only;
    - `H01-open`, `H01-open-dark` and `H01-your-day` redrawn with the sections;
    - the section heading as a component.
- **B6:**
    - R04 with the photo button before typing;
    - the attachment preview with optional text;
    - uploading;
    - a failed send, kept, with retry;
    - a photo message, and a photo with text;
    - a removed photo's placeholder, where the thread position needs one;
    - the author's menu on their photo message;
    - camera access denied, with the library still offered;
    - the full image from a reply, and back to the same place;
    - the drop card with "{authorName} added a photo";
    - Memories' day in two sections;
    - the reply message and the preview row as components.

## 8. The work by stage

| Stage | api | ios |
|---|---|---|
| Now (B0) | The rulebook, contract and database PRs | The inventory PR |
| B1 | None | A01's brand line and explanation (FQ<C>); its handoff |
| B2 | The allowance transaction by role: the role from the occurrence's star interval and the author's interval; counts of committed drops plus live reservations, under the counter's lock, with the clock read after the lock (T3); a refusal with the caller's own usage. Tests ND01, ND02, ND04 | None |
| B3 | The conversation photo's upload purpose, authorized against the drop's read predicate and its reveal, refused with the neutral not-found otherwise (T14); the existing preparation pipeline (20 MiB, metadata stripped, renditions, the safety setting); thumbnails; the media route | The upload client takes a conversation photo the same way it takes a drop's (JPEG up to 4096 px, GPS removed, PNG screenshots) |
| B4 | Edits and replacements under the role's allowance: a replacement that changes a drop's kind is checked again (T17) | The composer, multi-select, retry and resume, Drafts submission and the share extension under the role's allowance; the own-day prompt; the idea helper's own-day set, with addendum 3's ordinary-life examples under the new prompt, while friend examples stay about the named person; the friend's line and limit states (FQ<A>); a change of person keeps the work. Tests ND01 to ND03, ND07 |
| B5 | The revealed day's sections, in the same statement that reads the day; the rail unchanged (T22) | R01 and `H01-your-day` in sections, the empty section left out (FQ<B>). Tests ND05, ND06 |
| B6 | Comments with an optional photo; the commit rechecks the predicate and the reveal; the per-viewer preview; removal in every path; burst limits that count photo messages, never shown to anyone. Tests ND08, ND09, ND11 to ND13 | R04's photo flow: the photo button before typing, a removable local preview, Send as the only way to send, and the input kept through a failure; the preview on the card, opening the conversation at that reply; Memories in sections; the local attachment preview kept with its author and purged on logout and account switch. Tests ND09, ND10, ND13, ND14 |
| B8 | A photo reply as one comment event: preferences, grouping, mute, the budget, quiet hours, access rechecked at dispatch, no photo in the payload (FQ<F>) | None |
| B9 | Analytics: the role on drop-committed, and text, photo or photo with text on comment-posted, as categorical fields only (T51) | The same events from the app; ND15 in the readiness audit |

Things only an iPhone can judge go into a TestFlight build at Gate C, with exact steps for me:
- the camera route, and the camera denied;
- the photo library;
- a reply sent on a slow network;
- VoiceOver on the photo button and the reply rows;
- the feed's sections at the largest text.

## 9. Privacy checks for the reviewers

Every PR in this work that touches authorization, the database, media, caches or notifications gets the privacy reviewer (ADR-002). The reviewer checks at least:

1. The role comes from the two intervals only. A request carrying any role field is refused by the strict schema.
2. Limits count committed drops plus live reservations under the counter's lock, with the clock read after it (T3, T17).
3. A refusal carries the caller's own usage only. A day the caller can't see gives the neutral not-found (T14, T15).
4. A conversation photo's upload is refused before the reveal and for a drop the caller can't read. The commit checks both again. Nothing about the message reaches anyone else, the preview included, until its photo is ready and the message has committed. A pending upload whose message never commits is purged by the pending-upload expiry.
5. Every read of a reply photo or thumbnail goes through the media route and the drop's read predicate, plus the photo's own state. Private, no-store, and no URL ever leaves the server (T12).
6. The preview is computed per viewer, and every cache of it is keyed by viewer (T12). A blocked person's reply never reaches the blocker's preview. It changes after any removal.
7. Withdrawal of the reply or of its drop, pictured removal, moderation, account deletion, and leaving or blocking as the comment rules decide: each reaches the photo, its thumbnail, the preview and any pending notification, with tombstones (T24, T27, T28).
8. A late joiner, a rejoined account and a former member get nothing through the comment list, the media route, the preview or a push's deep link (ND12).
9. Logs carry no message text and opaque ids only (T52). Analytics are categorical only (T51).
10. Pushes: one comment event, within the budget and quiet hours, never carrying the photo, with access rechecked at dispatch (T36, T37).
11. Every pre-reveal answer is unchanged, and the leak scanner proves it (T10).
12. On the phone, the attachment's preview belongs to its author's account, reply images are cached per account, and both are purged on logout and account switch.

## 10. The verification map

| Item | What it proves | Stage | Lanes and tests |
|---|---|---|---|
| ND01 | The star: six photos, or four and two links, never a seventh | B2, B4 | api: transaction and race tests; ios: composer |
| ND02 | A friend: two photos and one link; a third photo or second link fails, in concurrent requests and from the share extension | B2, B4 | api: race tests; ios: the share extension |
| ND03 | A change of person checks the allowance again and keeps the work | B4 | ios; api: refusal shapes |
| ND04 | Each allowance belongs to one club, interval and occurrence | B2 | api |
| ND05 | The star's drops lead; order holds after replies and refresh | B5, B6 | both |
| ND06 | No empty star section, and the day still opens | B5 | both |
| ND07 | Drafts don't publish themselves or use slots | B4 | ios |
| ND08 | Pre-reveal media stays hidden; no photo message before the reveal | B3, B6 | api: privacy matrix and leak scanner |
| ND09 | Photo only, photo with text and text only, in one conversation | B6 | both |
| ND10 | A failed send keeps its input; a retry commits one message and one notification event | B6, B8 | both |
| ND11 | Replies after Home closes, with no drop submissions reopened and no counter changed | B6 | api |
| ND12 | A late joiner, a rejoined account or a former member gets nothing through any attachment or preview path | B6 | api: privacy matrix |
| ND13 | Withdrawing a reply clears its photo and preview; withdrawing the drop closes its conversation | B6 | both |
| ND14 | Camera denied, library, VoiceOver, largest text and Reduce Motion all work | B6 | ios: snapshots and UI tests; device checks in TestFlight |
| ND15 | No response count, missing-contributor display, receipt, ranking or pressure notification | B6 to B9 | both: the copy lint, the scanner and the audit |

## 11. Questions, with the default each keeps until I answer

Add these to `docs/QUESTIONS.md` under the numbers the coordinator reserves.

- **A. A friend's limit copy.** The addendum gives the friend's allowance line, but no friend version of `C07-limit`. 2.1's state says "Six drops added.", then "For Debby's Friday · 13 November", then the note "The six total can include up to two video links. A highlight is one of those six." **Default:** the same state, with its words changed for a friend:
    - the title: "Three drops added.", "Two photos added." or "One video link added.", for whichever limit was met;
    - the note, only where it's relevant: "For someone else's day, you can add up to two photos and one video link. A highlight is one of those three.";
    - the rest as the star's state has it: the day with its exact date, "You can edit or withdraw an existing drop before the reveal." and "This photo stays in Drafts."

    The note states the limit, and never invites another drop.
- **B. The viewer's own name in the new strings.** Does the star read "From Ben" on their own day, and do I read "Ben added a photo" for my own reply? **Default:** yes, the names exactly as the addendum writes them, for everyone. The alternative is "From you" and "You added a photo", like "Your pick".
- **C. Where the brand line appears.** **Default:** on Welcome (A01) and on the invitation page's introduction, and in the App Store text when B9 writes it. Nowhere else in the app's chrome.
- **D. Editing a photo message's text.** **Default:** like any comment's, with the Edited label. The text may become empty while the photo remains. The photo can't be replaced, only the whole message deleted.
- **E. A pictured member removing a photo message.** **Default:** it removes the whole message, photo and text, as the author's deletion does, leaving a neutral placeholder only where the thread position needs one.
- **F. The push for a photo reply.** **Default:** the existing comment push, word for word, with no mention of a photo.
- **G. Reply references on photo messages.** **Default:** every message keeps the existing shallow reply reference, photo or not. Nothing opens a thread under a photo.

## 12. What not to do

- Don't edit the spec, the book, the addendum, its PDF or this file.
- Don't widen the pre-reveal whitelist or the leak scanner's pre-reveal rules, and don't drop a route from the matrix (T10, T58).
- Don't add:
    - a story builder, a slideshow, Stories, a new tab or a chat inbox;
    - counts, reminders, minimums or a notification category;
    - visible reply quotas;
    - guest contributions, gifts, or an external-sharing entitlement;
    - new link types, uploaded videos, audio, documents or text-only drops.
- Don't add an onboarding step that asks for both an own-day drop and a friend's drop.
- Don't write grandfathering code, and never withdraw, delete or retarget anyone's work to make a migration pass.
- Don't lower the share extension's activation maximum.
- Don't change the brand's identity, the widgets' phase, or the pre-reveal caption cards.
- Don't treat a coordinator's relay as my approval.
