# Tadayo invariants

Every pull request keeps these rules. They come from the build specification v3 (`docs/tadayo-build-spec-v3.md`), the design book revision 2.1 (`docs/tadayo-design-book-2.1.md`), the founder's new direction addendum, revision 1 (`docs/tadayo-new-direction-addendum-r1.md`), and the founder. A change that breaks one is wrong even if it works. Every PR lists the invariants it touches, and its independent review checks them (`docs/GITHUB.md`).

How sources are cited:
- **spec 06**: section 06 of the build specification.
- **A06** and **D02**: the spec's accepted rules and implementation defaults.
- **Q10**: one of the spec's acceptance tests (spec 37).
- **screen H01**: a screen in the spec's inventory (spec 29). The spec reuses A01 to A03 for both rules and screens, so screens always carry the word "screen".
- **book p13**: page 13 of the design book.
- **FQ20** and **ADR-006**: entries in `docs/QUESTIONS.md` and `docs/DECISIONS.md`.
- **addendum 4**: section 4 of the new direction addendum (`docs/tadayo-new-direction-addendum-r1.md`).
- **ND07**: its verification item 7.

## Time, reveal and Home

- **T1. Server time decides.** Reveal, cutoff, Home placement and access are computed at read time from `reveal_at`, `close_at` and the server's clock. None of these changes them:
    - a device clock or a client timestamp;
    - push receipt, or the star opening the app;
    - a widget refresh;
    - a worker's progress. A stopped worker leaves access correct.

    (spec 06, 08, 34; Q09, Q18)
- **T2. Two civil times, resolved independently.** `reveal_at` is 07:00 on the occurrence's local date and `close_at` is 01:00 on the next local date, both in the club's IANA timezone.
    - Each instant is resolved on its own, never by adding a duration.
    - An ambiguous time takes its first occurrence. A nonexistent time takes the next valid instant.
    - Every member shares the same two instants. A member who is travelling sees the local equivalent, with the club's zone available.

    (A13, spec 05; Q03)
- **T3. The reveal is the cutoff (D02).** A drop joins an occurrence only if its commit, holding the occurrence lock, reads server time before `reveal_at`. From that instant the occurrence's drops and highlights are frozen: no new drops, replacements, caption edits or highlight changes, only removal. The freeze doesn't reach conversations: comments, photo replies included, go on after the reveal and after the day closes (T64). A withdrawal after the reveal never reopens a slot. (spec 06, 11; addendum 7; Q12, Q13)
- **T4. Nothing is retargeted silently.** A missed cutoff, an upload that finishes late, a changed recipient or a full allowance returns the work as a draft, with the exact next date for the person to confirm.
    - The server never moves a drop to another occurrence.
    - The client never advances a target by itself.
    - An error carries the current totals and the target, so the client can reconcile without losing anything.

    (spec 06, 10, 11, 32; Q13)
- **T5. Home is derived, not stored.**
    - **During a day:** Home shows the occurrence with `reveal_at ≤ now < close_at`.
    - **Otherwise:** it shows the next scheduled occurrence, its exact date and a countdown, skipping unused days and Sunday. A late worker can't extend or shorten that window.
    - **At 1 AM:** an open photo or comment sheet stays where it is, and Home changes when the person returns.
    - **Notifications and deep links** open their exact day, never as the current Home.

    (spec 06, 08; Q18)
- **T6. The calendar keeps its promises.**
    - A club has two to six active members.
    - The days are fixed weekdays, with one star per assignable day and no reveal on Sunday. Two- and three-member clubs get two days per person; four to six members, one day each.
    - A membership change takes effect at a future boundary with no submitted occurrence affected, once the members confirm. Announced reveal times and submitted drops never move.
    - Unresolved conflicts are shown, never swapped silently.

    (A01, A02, spec 05; Q01, Q02, Q04)

## Clubs, audience and hidden media

- **T7. Membership is by exact roster.**
    - A candidate accepts an exact roster revision, and existing members approve every addition. A club activates once at least two people have approved the same roster.
    - An invitation link is single-use and grants nothing before acceptance: no captions, photos, membership activity or upload destinations.
    - Its token travels in the URL fragment, so it never reaches a server log.
    - The signed-out web page shows no more than the inviter's name. The club and roster appear in the app after sign-in.

    (spec 04, 07; Q05; `docs/TECH-DESIGN.md` section 1)
- **T8. Audiences are immutable.** At commit, a drop's audience is the set of active membership intervals in its club, including the author's and the star's. An audience row is never added afterwards. Joining after a commit grants neither the caption nor the media, even before the reveal. Rejoining starts a new interval that inherits nothing. (A03, spec 07, 31; Q06)
- **T9. One read predicate.** A viewer reads a drop only when all of these hold:
    - the viewer's account is active;
    - the viewer's membership interval is in the drop's audience and still active;
    - the drop isn't withdrawn, removed or held, and its occurrence and club aren't suspended;
    - for anything beyond the caption, server time has reached `reveal_at`.

    The author's own preview is the only exception, through its own endpoint. Knowing an id grants nothing. The predicate lives in one authorization module, used by every route, job, notification, search, suggestion and widget. (spec 07, 30, 33)
- **T10. Before the reveal, others get the caption and nothing else.**
    - A pre-reveal response to anyone but the author carries only: the approved caption text, the author's display identity, the target person, the occurrence date, the media class and a safe status.
    - It never carries: a thumbnail, poster, blur hash or dominant colour; dimensions or aspect ratio; embed HTML; a source URL or provider post id; a media token; alt text; EXIF or a capture date; a duration or file size; a highlight flag (FQ21).

    (spec 14; Q07)
- **T11. The author's preview stays with the author.** It's served only by `GET /v1/drops/{id}/author-preview`, with no shared caching. It never enters a shared client store, another account's cache or a widget, and logging out or switching accounts purges it. (spec 14, 34; Q08, Q26)
- **T12. A cover is presentation; access is the server's.**
    - Media leaves the server only through the API: the media route, which runs the read predicate on every request, and the author's own preview (T11). Both stream the bytes with private, no-store caching.
    - No signed read URL or media token ever reaches a client: a CDN can keep serving a signed URL after it expires (ADR-009). This is stricter than D10's five minutes.
    - The one storage URL a client ever receives is the signed upload URL for its own pending upload: one object, write only, with overwriting off.
    - Every derivative (display, full, widget still, Live Photo motion) has the same audience and reveal boundary as its source. A photo in a conversation and its thumbnail have the audience of the drop they answer (T63).
    - Caches of manifests and media are keyed by viewer, membership interval and content version, never shared club-wide.

    (spec 33; D10)
- **T13. Captions are short and can't carry the find.**
    - A caption is at most 140 grapheme clusters, and a comment at most 500 (D09).
    - Both are counted the same way on the server and in the app: `Intl.Segmenter` and Swift's `String.count`, never UTF-16 units.
    - A caption containing the drop's own source URL is refused ("Move the link into your video drop").
    - Other URLs in captions never render as preview cards.

    (spec 14; D09)
- **T14. Unauthorized looks like missing.** Anything the caller may not see returns the same neutral not-found as a missing object. Errors never reveal another person's hidden content or counts. Cursor pagination is scoped to the viewer, and removing an item can't expose a skipped row. (spec 32)
- **T15. Hidden counts stay hidden.**
    - No response, notification or screen shows per-member totals, how many drops are hidden from a viewer, who hasn't contributed, or empty slots.
    - The captions a member may read, each with its sender, stay visible as the spec shows them.
    - A partly visible day is explained without numbers.

    (A09, spec 07, 09, 21)
- **T16. Leaks are tested where they happen.** Pre-reveal leakage is checked with a non-author account, under clock and parameter manipulation, in:
    - API responses, HTML and preloaded assets;
    - image caches and logs;
    - accessibility labels;
    - push payloads and widget files.

    (spec 14, 33; Q07, Q09)

## Limits, commits and receipts

- **T17. Allowances by role, per contributor per occurrence.** For each contributor membership interval and occurrence, live reservations included:
    - **the star** (the author's interval is the occurrence's star interval, as the server reads them; never a flag from the app): at most six drops, of which at most two are external video links;
    - **anyone else:** at most three drops: at most two photos and at most one external video link. A friend's third drop can only be a video link;
    - a Live Photo counts as one photo; a replacement that changes a drop's kind is checked against the limits again;
    - a highlight is a pointer, never an extra drop; Drafts and photos in conversations use none of it;
    - per occurrence, never per week, even for a member with two days;
    - enforced in one transaction with row locks or serializable isolation; the database's last guard holds each role's limits, and a counter CHECK is never the only guard;
    - a refusal names the exact day and the caller's own usage, never anyone else's (T15).

    (A06, A07, spec 11, 31; addendum 2; Q10, Q14; ND01 to ND04)
- **T18. Reservations expire.** A slot reserved for a preparing upload has an expiry. The expiry, or a withdrawal before the reveal, releases it. A replacement reuses its slot. No phantom slots. (spec 11)
- **T19. One commit per idempotency key.** Every mutation that a retry could duplicate carries a key, created when the action starts and reused on every retry.
    - The same key and body return the original result, even after the cutoff or midnight.
    - The same key with a different body is refused.
    - Database uniqueness is the last guard.
    - Edits carry an expected version.

    (spec 11, 32; Q12)
- **T20. "Added" means committed.** The app says "Added for Debby's Friday" only after the server's commit response. Draft, Pending, Uploading and Processing are never shown as Added or Sent. A batch of photos names each item's result and keeps whatever wasn't added. (spec 10; book p41; Q11)
- **T21. Duplicates are checked privately.** Duplicates are checked per author and occurrence: by normalized provider identity for links, by a scoped content hash for photos. The answer is View existing, never a second slot. Nothing ever reveals that someone else uploaded the same photograph. (spec 11)
- **T22. Highlights are pointers.**
    - Each contributor has at most one highlight per occurrence, pointing to their own active drop in it.
    - The star's pick comes first, then the others in stable roster order.
    - Removing the drop clears the pointer and both entry points.
    - No empty slot shows who didn't choose one.

    (A07, A08, spec 15; Q15)

## Removal, safety and leaving

- **T23. Denials beat grants.** These override every grant:
    - a withdrawal, a pictured-member removal or a moderation removal;
    - the end of a membership, a block, or account deletion.

    A favourite, a cache, a widget snapshot, a notification or a deep link never brings content back. (spec 07, 18, 22)
- **T24. Removal reaches everything at once.**
    - Authoritative reads fail immediately. Media comes only through the API (T12), so a removed photo stops loading at once.
    - The feed, highlights, reactions, comments and their photos, the feed's reply preview, favourites, search, widget candidates, suggestions, manifests and renditions are invalidated.
    - A copy already on someone's phone goes at the app's next reconciliation. The app's privacy copy says exactly that.

    (spec 22, 33; Q19)
- **T25. A pictured member removes without asking.** Any club member who says they're in a photo removes it club-wide at once, with no approval and no public reason. The removal is audited. The star is told neutrally, without naming who asked. (spec 22) This holds for a photo in a conversation: removing it never removes the drop it answers (addendum 5; FQ108).
- **T26. Leaving and blocking are explicit.**
    - **Leaving** asks whether to keep or withdraw contributions, and ends club and favourites access either way.
    - **Blocking** lists the shared clubs and offers Block and leave these clubs. It withdraws pending contributions, asks keep or withdraw for past ones, and revokes membership access.
    - A block never just hides a row.

    (spec 22, D11)
- **T27. Deletion removes authored content everywhere,** whatever was chosen when leaving a club.
    1. Sessions and memberships are revoked first.
    2. Durable jobs then purge media, captions, comments and their photos, reactions and favourites, and derived renders are invalidated.

    The targets are D10's: objects purged within 24 hours, backups expired within 30 days, both to be validated before any privacy promise is published. Audit records keep the minimum identifiers, under a written retention policy. (spec 23; D10; Q27)
- **T28. Deletions survive a restore.** Every deletion also writes a tombstone to a log kept outside the main database. A restore replays that log before the service takes traffic. (spec 23, 34; Q28; ADR-010)
- **T29. A held drop never appears late.** A drop on moderation hold at the reveal is left out of the manifest. If it's cleared, it goes back to its author as a private draft; it is never inserted afterwards. No support action changes a promised date or audience without an audited policy. (spec 06)

## Drafts, favourites and attention

- **T30. Drafts belong to their owner alone.**
    - Drafts are encrypted on the device, per account.
    - The intended club, person and occurrence are optional hints, never filled in from the last-used recipient.
    - A draft is in no manifest, count, notification or widget. Analytics records only that a draft was saved (spec 36), never its content or intended target.
    - A draft never submits itself: Add always asks for an exact date.
    - After logout or an account switch, the next account can't read it.

    (book p44, p46; spec 10, 23; FQ15)
- **T31. The target is always explicit.** The composer and the share extension show the club, the person and the exact date before Add. Remembering the club is fine; reusing a recipient silently is not. Changing the recipient recalculates the date and the allowance for the new role, and keeps the person's work when it doesn't fit: nothing is added until they change it (addendum 2, 3). (spec 10)
- **T32. Favourites are private pointers.** Favourites notify no one and count nothing. They transfer no ownership, change no widget or feed order, and copy no content. Access is rechecked on every read. (A11, spec 18; Q23)
- **T33. Nothing is counted, ranked or chased.** None of these exist anywhere:
    - streaks, contributor rankings or leaderboards;
    - completion scores, progress rings or empty slots;
    - read receipts, opened times or "Waiting for Debby";
    - missed-contribution language, or reminders about who hasn't added anything;
    - a response count, or anything that says who hasn't answered, or that a section of the day is empty.

    (A09, spec 08, 16, 21; Q22, Q25)
- **T34. Opening is private.** Highlight animation state, opens and widget glances are local or pseudonymous instrumentation. They're never receipts and never notify anyone. (spec 15, 16, 36)
- **T35. The day is finite, the star's own drops first.**
    - A revealed day is two sections in one scroll: "From {starName}", the star's own drops, then "From friends", everyone else's. Each is in commit order, with the id as a tiebreak.
    - An empty section is left out with its heading. A day without the star's drops never says so.
    - It's never re-ranked by reactions, comments or photo replies, and never followed by another stream.
    - The same grouping on Home, in Memories and on a linked day. Stored submission times and records don't change.
    - It ends with "That's Debby's Friday."
    - A refresh doesn't move cards.

    (spec 15; addendum 4; Q16; ND05, ND06)

## Notifications

- **T36. Notifications report real events only:** the events in spec 21's table. Never:
    - a ready message for a viewer with no readable drops;
    - a 1 AM closing push;
    - a reminder;
    - an invented reaction.

    A photo reply is one comment event, never a category of its own (addendum 6). A held or removed drop is not an arrival. (spec 21; Q22)
- **T37. Two a day, with quiet hours.**
    - At most two ordinary social pushes per member per device-local day, across all clubs.
    - Quiet hours are 23:00 to 08:00 in the viewer's device zone. The 7 AM reveal opens in the app on time while its push waits.
    - Arrivals are aggregated, and dispatch rechecks access.
    - Default payloads carry names and timing only, never captions, media or sources.

    (spec 21; FQ30)
- **T38. Links keep their exact context.** A notification or deep link opens its exact club, day or drop after rechecking access. If the content was removed, it shows "This drop is no longer available" with Back to club. It never opens a similarly named person in the current club. (spec 03, 08, 21)

## External videos

- **T39. The player is a guest.**
    - **One player.** One active player, created only on a tap; paused on close, backgrounding and navigation, then released.
    - **Isolation.** An isolated web view with no app credentials or shared cookies, and allowlisted hosts. postMessage origin and schema are validated.
    - **Navigation.** Unexpected top-level navigation is stopped, and the person is asked before leaving.
    - **No tricks.** No scraping or rehosting of video, no masking of provider branding, and no claim that recommendations are off.
    - **Fallbacks.** Open original is always reachable. Each provider adapter has a remote switch, and a provider outage never stops photo drops.

    (spec 17, 30; Q20, Q21)
- **T40. Provider identity is hidden until the reveal.** The canonical URL, provider post id, embed payload, poster and title of a video drop go only to its author before the reveal. (spec 14, 17)

## Copy, design and accessibility

- **T41. One vocabulary.** The nouns of spec 03 on every surface: Club, Drop, Highlight, Your pick or Debby's pick, Drafts, Memories, Favourites, Caption, and "Photo opens Friday at 7 AM".
    - Never Dressing room, Edition, Publication, Quota or Sent.
    - A target always carries its exact date wherever a weekday alone could mislead.

    (spec 03; book p8, p41)
- **T42. Names, not inferred pronouns.** System copy uses the person's name wherever a pronoun would need a gender nobody gave. The 2.1 strings that break this are reworded (FQ20). (spec 12)
- **T43. The voice is plain.**
    - Copy is direct and factual: no invented sentiment, staged enthusiasm, or slogans on utility screens.
    - Quiet days say "Nothing added for this day".
    - Errors name the action that failed and keep the person's input.

    (spec 24; book p8)
- **T44. Tokens, not values.** Every colour, spacing, radius and type size comes from the design system's tokens: book p35 now, the brand handoff's values once they arrive.
    - The dark theme is a real dark theme.
    - Photographs are never tinted, filtered or inverted.
    - Colour is never the only signal of a state.

    (spec 24; book p26, p35)
- **T45. Native first.** The app uses the system's navigation, tab bar, sheets, photo picker, camera, keyboard, share sheet and Dynamic Type. The status bar, tab bar and device frame in the renders are presentation; the app uses the system's own. (book p35, p40, p50)
- **T46. Claude Design designs; Claude Code never does.**
    - Screens, states, the icon, the wordmark and every brand asset come from design revision 2.1 or from Claude Design, through the founder (`docs/DESIGN-HANDOFF.md`).
    - Claude Code never invents a layout, never draws an icon, and never puts stock, placeholder or generated imagery in the product.
    - Turning a Claude Design delivery into the named files isn't designing: rendering its frames to PNG, rasterizing its vectors at a required size, reading its token values. Changing what a frame shows is.
    - Test fixtures (book p50's photographs) appear only in tests and in builds that point at `dev`, the Lab included, never in a build that points at `prod`; a prod archive is checked for them (FQ23, FQ24).
    - A state with no render is built from the spec and the book's contracts and marked "built from spec".

    (ADR-006)
- **T47. Accessibility is part of done.**
    - Touch targets are at least 44 points.
    - Dynamic Type works to the largest sizes, with layouts that grow: the highlight rail becomes a labelled list, the memory grid one column, and names wrap.
    - Every control has a VoiceOver name. A cover is "Open Maya's highlight"; a hidden drop announces its author and opening time, never its content.
    - A countdown announces its target date, not every tick.
    - Reduce Motion, or the in-app setting, opens a highlight's photo directly, without the fold (book p19, p36).
    - Sound is off by default. No hold, shake or precise gesture is ever required.

    (spec 24; book p26, p34, p36; Q30)
- **T48. Motion is one fold.** The only custom motion is the 650 ms highlight fold. It can be skipped, Reduce Motion removes it, and repeat viewings skip it. Everything else uses native transitions. No celebration screens on repeat sends, no confetti, no sounds. (spec 15; book p19, p36; Q16)
- **T49. Truthful states only.**
    - Never fabricate a received drop, a history or an instant first reveal.
    - An example is labelled Example and is never in a club.
    - Offline shows the cached state with its date.
    - A stale widget keeps its original date.

    (spec 04, 08, 18, 20; Q29)

## Permissions and data

- **T50. Ask only when needed.**
    - **Photos:** through the system picker, without full-library access.
    - **Camera:** when it's used.
    - **Notifications:** after the first completed contribution, or when explaining day-ready alerts.
    - **Contacts:** never required.

    Denying any permission leaves the app usable. (spec 04)
- **T51. Analytics are first-party and pseudonymous.**
    - Only the events of spec 36, carrying pseudonymous ids, state, media class and timing.
    - Never captions, comments, notes, photos, source URLs, report text or idea-helper choices.
    - No third-party analytics or tracking SDK.

    (spec 12, 36; ADR-012)
- **T52. Logs carry no content.** No captions, comments, notes, source URLs, signed URLs, tokens, EXIF, push text or email addresses: request ids and opaque ids only. (spec 14, 30)

## Engineering

- **T53. The server decides, and Supabase stays closed.**
    - Clients hold no database or service credentials. The app's only Supabase credential is the public key it signs in with.
    - Every write and every policy check happens in the API. A cached client record never overrides a server denial.
    - Supabase's own data API (REST and GraphQL) is off. The app's tables live outside any exposed schema, the public roles and `service_role` have no grants on them, and row-level security is on with no policies. Storage's buckets are private, with no policies on their objects.
    - The Supabase probe proves this on each real project, with the public key and with a signed-in user's token: every REST, GraphQL and Storage call is refused or comes back empty.

    (spec 30; ADR-015)
- **T54. Outbox and idempotent workers.**
    - Business transactions write their outbox events before acknowledging success.
    - Workers run at least once, with dedupe keys, bounded retries and a dead-letter queue.
    - A retried opening or closing never duplicates a push, alters an audience or reopens submission.

    (spec 30, 34; Q17)
- **T55. Serializers whitelist.** Every DTO is an explicit field list per viewer role: author, star, member before the reveal, member after it, operator. Nothing is serialized by default. (spec 14, 32)
- **T56. Secrets stay out** of the repository, binaries, logs and PRs (`docs/TECH-DESIGN.md` section 10).
- **T57. Migrations expand, migrate, contract.** Destructive changes need the founder's approval in the PR. No authorization fix waits on an app update. (spec 31; `docs/TECH-DESIGN.md` section 3; `CLAUDE.md`, "Git")
- **T58. Checks only get stronger.**
    - Logic changes come with tests.
    - Never weaken a test, a check or a lint rule to get a PR through.
    - Changes to CI configuration (`.yamllint.yaml`, `.github/`, `.claude/`, `tools/ci/`) go in their own PR, for the founder to read. Only the logs `docs/DECISIONS.md`, `docs/LIMITATIONS.md` and `docs/JOURNAL.md` may change with them.
    - The one exception is the starter-pack PR that creates the repository.
- **T59. Real Postgres and the privacy matrix.** Tests run against real Postgres, never only against mocks. The privacy matrix runs every route for every role, before, during and after the day. (spec 37)
- **T60. Flags for what can fail or wait.** Each provider adapter, widgets, resurfacing, external sharing and paid experiments sit behind flags. A flag never widens access. (spec 30)

## Later features, behind flags

- **T61. External sharing needs everyone's yes.**
    - Off by default.
    - An export needs current grants from the sender, the star and every pictured member, for the exact drop and version. Absence is not consent, and any pictured member can veto.
    - The server rechecks access and grants before every export.
    - GPS and identifying metadata are stripped. Nothing leaves but the photo and, if chosen, its caption.

    (book p45, p46; FQ14)
- **T62. Remember this stays private and old.**
    - Behind its flag.
    - Only older accessible days or drops, rechecked before every thumbnail and every open.
    - Never a push, a repost or a new drop. Dismissals are durable.

    (spec 19)

## Photo replies

- **T63. A photo reply has its drop's audience.** A photo in a drop's conversation is read only by viewers who may read that drop: its immutable audience (T8), through the one read predicate (T9), plus the photo's own availability (ready, not deleted, not removed). Preparing its upload, committing the message, and every read of the message, its photo, its thumbnail and the feed's preview each check again; opening the conversation grants nothing. Joining or rejoining later never reaches an earlier drop or its replies. The bytes come only through the media route (T12). Losing the drop (a withdrawal, a removal, a suspension or the end of access) closes its conversation and every path to its photos, previews and notifications. A provider removing a video is not a withdrawal. (addendum 5, 6; ND08, ND12, ND13)
- **T64. Photo replies come after the reveal, outside the allowance.** A photo message commits only when the server's clock, read at commit, has reached the drop's `reveal_at` (T1). Before that, no upload is prepared for one. It stays possible after the day leaves Home, and in Memories. It uses no reservation or counter, and never changes the frozen manifest. It is never a drop: it can't be highlighted, favourited as a drop, copied into Drafts or shown as a card of the day. (addendum 5, 6; ND08, ND11)
- **T65. One quiet preview, per viewer.**
    - Under a revealed drop, the feed shows at most one preview: the thumbnail and "{authorName} added a photo" of the latest photo reply that viewer may read now. Tapping it opens the drop's conversation at that reply. It's computed for that viewer and never cached across viewers. It's recomputed after a withdrawal, a removal or a loss of access, and it's gone when none remains.
    - Nobody but its author sees a photo message, or a preview of it, until its photo is ready and the message has committed. Choosing or taking a photo never sends it; only Send does.
    - There's no response count anywhere, and replies never move the drop (T35).
    - A message holds at most one photo. Its text is optional when a ready photo is attached, keeps its 500-grapheme limit (T13), and can be edited like any comment's (FQ107). A sent photo is never replaced in place.
    - A retried send commits one message and one notification event (T19, T54).

    (addendum 5, 6; ND09, ND10, ND13, ND15)
