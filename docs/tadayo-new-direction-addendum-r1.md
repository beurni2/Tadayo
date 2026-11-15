# Tadayo new direction implementation addendum

Revision 1 · 14 November 2026

> This file transcribes the founder's PDF, `docs/tadayo-new-direction-addendum-r1.pdf`, word for word. Only the layout changed: headings, lists and tables are in Markdown, and the page footers are gone. If the two ever differ, the PDF wins, and the difference counts as a finding. It's cited as "addendum 4" for section 4, and its verification items as "ND01" to "ND15" (section 8). `docs/plans/new-direction-r1.md` says how it's applied.

## 1 Scope and authority

Apply this addendum to the build already in progress. It changes product emphasis, role-based drop allowances, revealed-feed ordering and conversation attachments. It does not replace the existing specification or earlier adopted handoffs. Everything not explicitly changed below keeps its current contract.

The feed grouping described below is adopted for this implementation, rather than remaining a layout proposal. Photo replies are included in the new scope.

### Product direction and copy

Tadayo is a private club where members take turns sharing what they have been up to. The person whose day it is shares moments from their life; friends can add photographs, memories or supported finds connected to that person.

Main brand line, exactly:

**Your day. Your story. A thought from your friends.**

The star’s own sharing is central to the presentation, but is never required for the day to open. There is no contribution minimum for the star or friends.

| Context | Required copy |
|---|---|
| Own-day preparation prompt | What have you been up to? |
| Friend preparation prompt | What made you think of {name}? |
| Revealed own-contribution section | From {starName} |
| Revealed friend-contribution section | From friends |

Keep existing nouns such as Drop, Highlight, Private drafts, Memories and Favourites. “Story” in the brand line does not introduce a disappearing Stories format or a new destination.

## 2 Role-based preparation allowances

Replace the uniform six-drop rule with the following policy for each contributor membership interval and specific recipient occurrence.

| Contributor | Photo limit | Supported external video-link limit | Total drop limit |
|---|---|---|---|
| Star adding to their own occurrence | Up to 6 | Up to 2 within the same total | 6 |
| Any other eligible club member | Up to 2 | Up to 1 within the same total | 3 |

The star’s existing supported formats are retained. Six photographs are allowed; six photographs plus a link are not.

For friends, the third slot is an optional supported video link. It cannot be converted into a third photograph. Supported formats and providers are the ones already implemented under the previous spec; this addendum does not authorize additional link types, uploaded video files, audio, documents or standalone text drops.

Examples for a friend:

- Two photos and one supported video link: allowed.
- Two photos only, one link only, or nothing: allowed.
- Three photos or two video links: refused.

A Live Photo keeps its existing classification as one photograph. A Highlight references an existing drop and uses no additional allowance.

### Enforcement changes

- Determine the contributor’s role on the server by comparing the authenticated author membership interval with the occurrence’s star membership interval. Never accept a client-supplied “self” flag as authority.
- Enforce total and media-class limits against committed drops plus live reservations, within the existing transaction and concurrency protections.
- Apply this policy in the app composer, multi-select, retry/resume, Drafts submission, share extension and server API.
- Re-evaluate the allowance when a destination changes. Keep the person’s work intact if it does not fit; require a deliberate change before committing.
- Return the exact occurrence and the caller’s own current allowance usage on a limit refusal. Never expose another member’s totals.
- Private drafts and conversation photos do not consume these preparation slots.
- The policy applies per occurrence, including when a person has two days in a week. It is not a weekly allowance.

Show usage only to the contributing person in the existing quiet allowance treatment. For friends, use “{usedPhotos} of 2 photos · {usedVideoLinks} of 1 video link”. The star keeps the existing six-drop/two-link line. Do not draw empty slots or a completion target.

## 3 Own-day preparation and onboarding

- Make self-contribution a normal, clearly explained part of preparing a day. Choosing your own row in the existing person picker uses “What have you been up to?”.
- Keep the current Add navigation and contextual destination behavior; do not add a separate story builder or tab.
- Own-day examples should concern ordinary life: something cooked, a walk, a small achievement, something noticed or a photograph worth sharing.
- Keep the curated idea helper. Its own-day examples use the new prompt; friend examples remain connected to the named person.
- Update Welcome and product explanations to describe taking turns sharing your life, with optional additions from friends.
- Keep the established onboarding sequence and first contribution. Do not add a requirement to submit both an own-day drop and a friend drop during onboarding.
- Private drafts never open or publish automatically. Explicitly choosing the club, person and occurrence and confirming Add is still required.
- Retain the submission cutoff at reveal for the star as well as friends. The composer continues to show the exact target date and opening time.

No additional preparation reminders, minimums or completion checks are introduced.

## 4 Revealed-feed grouping

Replace the single globally chronological main feed with two consecutive sections within the same scroll view:

1. From {starName}: the star’s own eligible, surviving drops.
2. From friends: other contributors’ eligible, surviving drops.

Within each section, retain the existing committed-submission order and stable ID tiebreaker. Reactions, comments and photo replies never change the order.

Apply the grouping to the active Home feed, the day opened from Memories and a directly linked revealed day. Do not change stored submission timestamps or duplicate drop records.

- Omit an empty section, including its heading.
- If the star submits nothing, show friends’ available drops normally. Do not display an empty star panel or explain that the star failed to post.
- If the whole day is quiet, retain the existing quiet-day behavior and scheduled close.
- Keep the compact Highlight rail above the feed. The star’s selected pick leads when present; others retain the existing stable club order.
- Preserve the same drop, conversation and reactions between a Highlight shortcut and its feed card.
- Normal feed media is readable at reveal. Highlight animation is optional emphasis and never an access gate.
- Preserve the existing pre-reveal folded caption-card treatment and ordering. This addendum changes the revealed feed, not the hidden-card design.

The same grouping remains visible in Memories. “Story” does not turn the day into a full-screen slideshow or a mandatory sequence.

## 5 Photo attachments in conversations

Extend the existing comment/conversation model. Do not implement another top-level drop type or general chat inbox.

### Message contract

A message may contain:

- Text only, retaining existing behavior.
- One photograph only.
- One photograph plus optional text.

At least text or a ready photograph is required. Retain the existing 500-grapheme comment text limit. No video attachments, multi-photo messages, nested photo threads or Highlight selection for replies are introduced.

Eligible members, including the star, may attach a photo to any original drop they may access. It does not have to recreate the original.

### Entry and composition

- Keep the existing conversation entry on a revealed feed card and photo viewer.
- Place a clearly visible photo button beside the message field before typing begins. Its VoiceOver name is “Add photo to this conversation”.
- Offer the native Camera and Photo Library routes. Request permissions only when relevant, and retain a usable library route if camera access is denied.
- After selection, show a removable local attachment preview with the optional message text.
- Use Send for explicit submission. Selecting or taking the photograph never sends it.
- Keep unsent text and the chosen photo during upload or send failure. Offer retry without a duplicate message.
- Until the upload is ready and the message commits, other members see no successful message or feed preview.

### Timing and rendering

- Photo messages can commit only after the original occurrence’s reveal instant.
- They are available immediately after a successful send, including after the day leaves Home at 1 AM.
- They remain within the original drop’s conversation in Memories.
- Keep the original available at the top of the conversation through the existing anchored presentation.
- Render photo messages inline with author identity and optional text. Tapping a reply photograph opens the full image and returns to the same conversation position.
- Use the existing comment ordering and return behavior.

### Main-feed preview

Under the original, show at most one compact photo-response preview: a thumbnail and “{authorName} added a photo”, for the latest photo message the viewer can currently access. Tapping the preview opens the original conversation at that response. Do not stack full-size response photographs in the main feed, add a response count, promote the original or create new feed cards.

Recompute the preview after withdrawal, moderation or access loss. If no accessible photo response remains, remove the preview.

### Withdrawal and editing

The author can remove their photo message through the existing author deletion action. For a photo message, this removes the photograph and its accompanying text together. Retain ordinary comment text editing; sent photographs cannot be replaced in place in this first implementation.

Reuse existing deletion placeholders only where necessary to preserve an open thread position. Removed photos and thumbnails must stop being served and disappear from derived previews. A pictured member can remove the photo response under the existing pictured-person safety rule; this does not automatically remove the original drop.

Photo replies cannot be highlighted, independently bookmarked as drops, automatically copied into Private drafts or added to the day’s top-level feed.

## 6 Attachment security and backend changes

Add an optional photo attachment relationship to the existing comment model, or its equivalent in the current architecture. A record must establish the parent drop, message author membership interval, media reference, processing state, removal state and existing message timestamps/version.

- Reuse the existing private photo upload, processing, limits, metadata stripping and moderation pipeline.
- Authorize upload preparation and message commit against current membership, the original’s revealed state and the original’s read predicate. Recheck on commit, not just when the conversation opens.
- The effective audience is inherited from the original drop’s immutable membership-interval audience, intersected with current authorization. Never snapshot a wider audience from the current roster.
- Joining or rejoining later cannot grant access to an earlier original or its replies.
- Every reply-photo read runs the parent authorization and the attachment’s own availability checks. Use the existing authenticated media route and private no-store behavior; do not return reusable signed read URLs.
- Parent withdrawal, removal, suspension or authorization loss must block the conversation and all attachment paths, including previews and notifications.
- An external provider removing a video is not parent withdrawal: retain the existing authorized caption/conversation fallback.
- Author deletion, account deletion and safety removals cover reply media and derived thumbnails.
- Use the existing idempotent mutation and outbox conventions. A retry must not duplicate either the message or its notification.

These messages do not touch DropReservation or prepared-drop counters and do not mutate the frozen occurrence manifest. Keep server abuse protections; do not expose reply quotas, streaks or response obligations.

Use existing conversation notification preferences, grouping and mute rules. A photo reply is one real conversation event, not an extra notification category. Do not send photo content in push payloads or announce replies to ineligible members.

## 7 Existing source and implementation updates

| Area | Required delta |
|---|---|
| Spec 01 A06 and A07; spec 11 and 31; invariant T17 | Replace uniform limits with star six/two and friend three with at most two photos and one supported video link. |
| Spec 03, 04, 10, 12, 13 and 16 | Apply new brand explanation and own-day prompt; describe friends’ preparation as optional. |
| Spec 15 and 18; design book feed contracts | Adopt star-first section grouping across active and archived revealed days. |
| Spec 16, 22, 23, 29, 31, 32 and 33 | Extend existing conversation, media, removal and API contracts for optional photo attachments. |
| Invariant T3 and related cutoff wording | Clarify that the freeze governs top-level drops and Highlight changes. Existing conversations, now including authorized photo messages, may continue. |
| App and extension allowance UI, errors and fixtures | Show and enforce the correct author role and media-class policy. |
| Brand, component and copy references | Keep brand revision 1.1 and adopted handoff corrections. Update changed words and affected component contracts, not the visual identity. |

Preserve existing account/authentication handoffs, club approvals, membership boundaries, timezone/calendar rules, caption visibility, first-reveal preparation window, Home close, Drafts, Favourites and delivery phases. Widgets retain their current implementation phase and content-selection rules.

Do not add guest contributions, gifts/rewards, new tabs or an external-sharing entitlement. Existing external-sharing permissions and release gates remain intact.

### Applying the new limits to existing data

- Update development fixtures and policy tests to the new role-based rules.
- Do not delete or revalidate historical revealed drops against the reduced friend allowance.
- If real upcoming committed data already exceeds the new allowance, grandfather that contributor-occurrence under its existing policy. Persist that policy server-side, allow no additions while usage exceeds the new limit, and keep the announced reveal unchanged. All new contributor-occurrence allocations use the new policy.
- Do not silently withdraw, delete or retarget someone’s existing work to make migration pass.

### Analytics delta

Use the existing pseudonymous drop-committed and comment-posted event families. Distinguish self/friend contribution and text/photo/photo-with-text response using approved categorical state/media-class fields. Do not add content, message text, source links or personal names to analytics.

## 8 Required verification

1. A star can prepare six photos, or four photos and two supported links, but no seventh drop.
2. A friend can prepare two photos and one supported link; a third photo or second link fails, including in concurrent requests and the share extension.
3. Switching between own and friend destinations revalidates limits without discarding work.
4. Each allowance is isolated to the exact club, membership interval and occurrence.
5. The star’s own drops lead regardless of submission time; within sections, order stays stable after replies and refresh.
6. Missing star contributions produce no empty star section, and never block the day.
7. Private drafts do not publish automatically or consume prepared-drop slots.
8. Pre-reveal media remains hidden; photo messages cannot commit before reveal.
9. A photo-only response, photo-plus-text response and text-only response work in the same conversation.
10. Send failure preserves input; retry commits one message and one notification event.
11. Photo replies work after Home closes without reopening drop submissions or changing prepared-drop counters.
12. A late joiner, rejoined account or departed member cannot retrieve parent replies through any attachment or preview route.
13. Withdrawing a photo message clears its media and feed preview; withdrawing the original blocks its whole conversation.
14. Camera denial, photo-library selection, VoiceOver, largest Dynamic Type and reduced motion keep the interaction usable.
15. No new response count, missing-contributor display, receipt, ranking or pressure notification appears.

## Baseline checked

This addendum was checked against the linked repository’s existing documents on 14 November 2026. Its explicit deltas supersede the cited old behavior; adopted later handoff corrections continue to apply elsewhere.

- [Build specification v3](https://github.com/beurni2/Tadayo/blob/main/docs/tadayo-build-spec-v3.md) — source blob 56a69585a1f753af26f1dbb706b9f23bc9dfb907.
- [Tadayo invariants](https://github.com/beurni2/Tadayo/blob/main/docs/INVARIANTS.md) — source blob 387a2aa7902ed42cc4df8ab11927619594dc5012.
- [Design book revision 2.1](https://github.com/beurni2/Tadayo/blob/main/docs/tadayo-design-book-2.1.md) — source blob fa6b86006229821e565ff911f1210202cda5eb51.
