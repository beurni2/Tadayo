# The new direction's contract PR: `api/b0-new-direction-contract`

The api lane's plan for the second PR of the founder's new direction, revision 1 (`docs/plans/new-direction-r1.md`, section 3, the api lane's step 3; its section 5 lists what the shapes must carry). It was written before the code, from a read-only map of the contract by five fresh readers and a completeness critic (workflow `wf_43301ccd-f99`), and it is pasted into the PR's Plan section.

The PR changes:
- the contract (`packages/contracts`) and its tests;
- the counts and rows that follow the contract's operations in `services/api` and `tests/src/privacy`;
- the leak scanner's allowance rule and error fields, and its fixtures that the contract's shapes now reject;
- `docs/TECH-DESIGN.md`'s lines that name the shapes, and the records.

No route is built: the new operation answers the neutral `NOT_FOUND` like every operation not built yet. No migration is written (that is the database PR, `api/b0-new-direction-db`), and no workflow file changes.

## Sources

- **The founder's addendum** (`docs/tadayo-new-direction-addendum-r1.md`): section 2 (the allowances by role, the refusal "Return the exact occurrence and the caller's own current allowance usage", the friend's line "{usedPhotos} of 2 photos · {usedVideoLinks} of 1 video link"); section 4 (the revealed feed's two sections, "Within each section, retain the existing committed-submission order and stable ID tiebreaker", "Omit an empty section, including its heading"); section 5 (the message contract, "Until the upload is ready and the message commits, other members see no successful message or feed preview", the main-feed preview, withdrawal and editing); section 6 (the attachment's record, authorization at preparation and at commit, the media route, no reusable signed read URL).
- **The plan** (`docs/plans/new-direction-r1.md`): section 2's decisions (5: the pre-reveal whitelist doesn't change; the allowance's new numbers are the caller's own and the scanner's allowance rules cover them; 8: the friend's line counts as the star's does), section 5 (this PR), section 9 (the privacy checks), section 12 (what not to do).
- **The invariants as amended:** T3 (the freeze doesn't reach conversations), T10, T12, T14, T15, T17, T19, T24, T25, T35, T55, T58, and T63 to T65.
- **The questions** (`docs/QUESTIONS.md`): FQ107 (a photo message's text may become empty; the photo can't be replaced) and FQ110 (every message keeps the shallow reply reference) are built on here; FQ104, FQ105 and FQ108 shape what the app draws and need no field.
- **The api/ios agreement** (`docs/PROGRESS.md`, the ios lane's "Needs from the other lane"): `TadayoAPIClient` calls only `getMe`, `updateMe` and `listClubs`; their statuses and fields stay as they are, an unknown error code is the one safe new enum value in their answers, and every other operation changes freely. `Allowance` is reachable from those three only through `Error.allowance`, which they never send, so its fields are kept and only added to.

## 1. The allowance (`packages/contracts/src/common.ts`, `Allowance`)

- The six fields keep their names: `added`, `reserved` and `limit` are drops; `external_added`, `external_reserved` and `external_limit` are video links. `limit` widens to 3 to 6 and `external_limit` to 1 to 2.
- Four new required fields: `photo_added`, `photo_reserved` and `photo_limit` (2 to 6), the photos of the same counts, and `is_star`, whether the caller is this day's star, the role the limits come from. The server reads it from the caller's membership interval and the occurrence's star interval (T17), never from a request.
- The limits are exactly one of two sets: 6 drops, 6 photos and 2 links with `is_star` true, or 3, 2 and 1 with it false. A JSON Schema range can't say "one of two tuples", and a literal renders `const`, which the contract tests forbid (the Swift generator reads no `const`), so the description states the two sets and a contract test holds every example to them.
- `photo_added` is `added` minus `external_added`, and `photo_reserved` is `reserved` minus `external_reserved`: the app draws "1 of 2 photos · 0 of 1 video link" or the star's line from the numbers and `is_star` without knowing the rule (the plan's section 5).
- The field is the caller's own, as today (T15). It is in `OwnDay`, `Reservation`, `ReleasedReservation`, `DropReceipt`, `RemovedDrop` and a refusal's body, all answers to the author alone; no other member's answer and no pre-reveal answer for anyone else carries it (the contract test pinning `UpcomingDay`'s reachable schemas stays as it is).
- Names checked against the scanner's `NEVER_KEY`: `photo_*` and `is_star` match none of its words, so the keys check needs no change.

## 2. The refusals (`packages/contracts/src/errors.ts`, `operations.ts`)

- `QUOTA_FULL`: the caller's total for their role in that day, live reservations included: six drops for the star, three for anyone else.
- `EXTERNAL_LIMIT`: the caller's video links for their role: two for the star, one for anyone else.
- `PHOTO_LIMIT` (new, 409): two photos already in someone else's day, live reservations included, while the total isn't reached: that day's last drop can only be a video link (T17). The star never meets it, since their photo limit is their total.
- Each carries `target`, the caller's `allowance` and `next_target`, as today (T4). When more than one limit is met, `QUOTA_FULL` comes first; otherwise the limit of the drop's own kind answers. Each description says so.
- `PHOTO_LIMIT` is declared on `createReservation` and `createDrop` only, next to the other two. It's never on `getMe`, `updateMe` or `listClubs`, whose statuses stay. An installed app reading an unknown code answers its generic refusal, the agreement's one safe addition, and it calls neither operation.
- `updateDrop` gains no limit code: a replacement stays in the same media class (spec 09; `UpdateDropRequest`), so T17's "a replacement that changes a drop's kind is checked against the limits again" has nothing to check yet. Flagged for B4.
- `createDrop`'s sentence "a free slot is taken if there is one, or QUOTA_FULL" names all three refusals.
- `SetHighlightRequest`'s "never a seventh drop (T22)" becomes "never an extra drop (T17, T22)".

## 3. No role in any request

Every request object is already strict (`additionalProperties: false`, tested), so a `role`, `is_star` or `self` key is refused. A new contract test sends each of them to every request schema on the contributing path (`CreateReservationRequest`, `CreateDropRequest`, `DropPhotoUploadRequest`, `UpdateDropRequest`, `SetHighlightRequest`, `CreateUploadRequest`) and to the new comment and upload requests, and expects a refusal (the plan's section 9, check 1).

## 4. The conversation photo's upload (`packages/contracts/src/schemas/contributing.ts`)

- `ConversationPhotoUploadRequest`, purpose `conversation_photo`, with the `drop_id` of the drop whose conversation it's for and the same types and size as a drop's photo (`uploadBase`: JPEG, PNG or WebP, 1 byte to 20 MiB; preparation keeps the 64-megapixel limit). It joins `CreateUploadRequest`'s members and `UploadPurpose`'s values; a contract test holds the two lists equal.
- `createUpload`'s description: this purpose answers the neutral `NOT_FOUND`, and makes nothing, for a drop the caller can't read now or whose day hasn't opened (T14, T63, T64). It never answers `OCCURRENCE_CLOSED` or `MEMBERSHIP_CHANGED`, which carry `target` and would tell a hidden drop from a missing one. It has no cutoff (T3), uses no reservation and no allowance (T64), and needs the finished profile like every purpose but the avatar.
- It can become only a message in that drop's conversation: never a drop's photo, a replacement or an avatar (T64). `Upload`'s sentence "the device's draft keeps the photo (FQ15)" is said of a drop's photo only; for a conversation photo, the app keeps its own attachment until the message commits, and an upload nobody commits lapses and is purged (the plan's section 9, check 4). `Upload` and `UploadStatus` don't echo the drop.

## 5. Comments (`packages/contracts/src/schemas/after.ts`, `operations.ts`)

- **Create:** `CreateCommentRequest` is `{ text?, photo_upload_id?, reply_to_id? }`, at least one of `text` and `photo_upload_id`, with text 1 to 500 grapheme clusters when present (`CommentText`). The rule is a refinement in the named schema, whose description states it (the contract test `RULES`); JSON Schema has no way to say it without `anyOf`, which the body limits refuse, so Prism doesn't check it and the API answers `INVALID_REQUEST`.
- `createComment` gains `MEDIA_NOT_READY` for an upload that is pending, preparing, held or rejected. An upload that isn't the caller's own conversation photo for this drop, or that is used or lapsed, is `NOT_FOUND` (the path names the drop). The commit checks the drop's read predicate and the reveal again, after its locks (T63, T64); one key gives one message (T19). Nothing about the message reaches anyone before it commits with a ready photo (T65), so a comment never carries a processing state.
- **The comment:** `Comment` is `{ id, author, text?, photo?, reply_to?, edited, version? }`. `photo` is `CommentPhoto`, `{ width, height, media_version }`, the frame for a stable layout and the content version that is the ETag of `GET /v1/comments/{comment_id}/media` (T12): never a URL. A comment has text, a photo or both.
- **Deleted or removed:** a deleted or removed comment leaves the thread, as a deleted one does today: no text, no photo, no author; its photo and thumbnail stop being served; and replies to it lose `reply_to` (`ReplyTo`: "deleted or removed"). The app keeps a neutral placeholder where a thread it has open needs one (the addendum's section 5; FQ108), from what it already holds. A placeholder the server sends could be added in B6 if its handoff needs one.
- **Edit:** `UpdateCommentRequest` stays text-only, so a photo can't be replaced (T65, FQ107). Its text becomes `CommentEditText`, 0 to 500 grapheme clusters: empty removes a photo message's text and keeps its photo (FQ107); emptying a comment with no photo answers `INVALID_REQUEST` with `field` `text`, as other rules only the server can check do. An answer never carries an empty `text`: it's absent.
- **Reply references:** every message keeps the shallow `reply_to`, photo or not (FQ110).
- `deleteComment`'s description: for a photo message, the photo and its text go together, its photo and thumbnail stop being served, and the drop's reply preview is worked out again (the addendum's section 5).
- A pictured member's removal of a photo message (T25 as amended, FQ108) has no route in the plan's section 5; it is B6's, as a new operation, which adds nothing the app already decodes. Flagged.

## 6. The media route (`operations.ts`, `MEDIA`)

- `getCommentMedia`: `GET /v1/comments/{comment_id}/media?rendition=thumbnail|display|full`, binary JPEG, with the `ETag` of its `media_version` and `Cache-Control: private, no-store` (added to every media answer by `document.ts`).
- Its description: on every request it runs the drop's read predicate, through the drop's immutable audience, and the photo's own state (ready, its message neither deleted nor removed), and answers the same `NOT_FOUND` otherwise, before the reveal included (T9, T12, T14, T63). Never a storage URL. `thumbnail` is the preview's, `display` the thread's and `full` the opened image's (the addendum's section 5); one content version serves all three, as a drop's does. B3 makes the renditions; the database PR adds the thumbnail's kind.
- It is the 67th operation. Its route answers `NOT_FOUND` like the 63 others not built (`services/api/src/app.ts`), so `services/api/src/app.test.ts`'s counts become 67 and 64, `tests/src/privacy/harness.test.ts`'s 67, and `tests/src/privacy/rows.ts` gains its `NONE` row. Its path parameter is `{comment_id}`, already bound in the harness.

## 7. The revealed day (`packages/contracts/src/schemas/days.ts`)

- `RevealedDay.drops` become `RevealedDayDrop`: a revealed drop (view `revealed`, every field of `DropRevealed`) with a required `section`, `DaySection` `star` or `friends`, and an optional `reply_preview`. The order is the star's drops, then friends', each in commit order with the id as a tiebreak (T35); an empty section is simply absent, and nothing says it's empty (T33). The server reads `section` from the author's interval against the occurrence's star interval, so a refresh never moves a card.
- One list with a field per drop, not two lists: paging and `next_cursor` keep working, and no empty `star_drops: []` ever says the star added nothing (the addendum's section 4).
- Only the revealed day carries them: Home's day, a day from Memories and a linked revealed day, as the addendum's section 4 says. `DropRevealed` itself is unchanged, so `getDrop`, Favourites and search don't carry a section or a preview; adding them later would be additive.
- `getOccurrence`'s cursor is bound to the day's stage too: a cursor from a day still collecting doesn't page its revealed list (`Cursor`'s description and `getOccurrence`'s). What a stale cursor answers is B5's.
- `UpcomingDay` keeps its one list in commit order (the addendum's section 4: "Preserve the existing pre-reveal folded caption-card treatment and ordering"). Nothing on `dayBase`, `ViewerDay`, `Occurrence`, `ClubRef`, `Person`, `DropCaption`, `DropOwn` or any error changes.

## 8. The reply preview (`days.ts`)

- `ReplyPreview`, `{ comment_id, author, media_version }`: the latest photo message on that drop this viewer may read now, its author, and the content version of `getCommentMedia`'s `thumbnail`. No text, no time, no count, no dimensions, no URL. "{authorName} added a photo" is the app's copy, from `author` (FQ105).
- Worked out per viewer, never cached across viewers (T12), and again after a withdrawal, a removal or a loss of access; absent when none remains (T65; the addendum's section 5).

## 9. The mock's fixtures (`packages/contracts/src/fixtures/`)

Ben stays the viewer of every scene (`world.ts`).
- `allowance()` takes the role. Ben on Debby's Friday 13 November is a friend (3, 2 and 1): `getOwnDay.your_drops` (two photos: "2 of 2 photos · 0 of 1 video link"), `nothing_yet`, `createReservation.held`, `releaseReservation.released` and `createDrop.added` (one photo: "1 of 2 photos · 0 of 1 video link"), `removeDrop.before_reveal`.
- A star's allowance: a new `getOwnDay` scene, Ben's own Monday 16 November (`day("sundayPeople", "ben", 16, "collecting")`, already in `getHome.your_day`).
- The refusals, Ben on Debby's Friday 13 November with Friday 20 November offered: `QUOTA_FULL` at three (two photos and a link), `EXTERNAL_LIMIT` at one link (one photo and a link), and `PHOTO_LIMIT` at two photos and no link. The old `QUOTA_FULL` gave a friend six drops and the old `EXTERNAL_LIMIT` two links: both are rewritten to the new limits (the plan's decision 4), old and new listed in the PR.
- Debby's Friday 6 November is reordered star first: Debby's own drop, then Maya's, Sam's, Ben's and Nina's, each with its section. `getHome.your_day` gets sections. A friends-only revealed day is added (Debby added nothing).
- On Sam's photo (`drp_sam_hill`), the thread gains a photo-only message and a photo with text, and the feed card a `reply_preview` naming the latest of them. `createComment` and `createUpload` get scenes for each.

## 10. Tests first (`packages/contracts/src/contract.test.ts`, `tests/src/privacy/`)

Written before the shapes; each fails on `main`'s contract for the reason named.
- **The allowance's two sets:** `Allowance`'s keys pinned; every example's allowance has limits (6, 6, 2) with `is_star` true or (3, 2, 1) with it false, `photo_* = total - external_*`, and every count within its limit (fails: no photo fields, limits 6 and 2 for a friend).
- **No role in a request** (section 3).
- **The refusals:** `PHOTO_LIMIT` in `createReservation`'s and `createDrop`'s pinned errors and among the codes that must carry `target` and `next_target`; each limit code's description names the role's numbers and the order.
- **Pre-reveal, unchanged:** `DropCaption`, `Person`, `ViewerDay`, `Occurrence`, `ClubRef` and `UpcomingDay`'s reachable set stay exactly as pinned; `DropOwn`'s keys pinned too (a field on it would otherwise pass every pin); `DaySection`, `RevealedDayDrop`, `ReplyPreview` and `CommentPhoto` are unreachable from `UpcomingDay`, `OwnDay`, `OwnContributionPage`, every request and the error body.
- **The revealed day's order:** in every revealed example, `section` is `star` exactly when the author is the day's star, and no `friends` drop comes before a `star` drop.
- **The preview:** `ReplyPreview`'s keys pinned; every preview sits on a revealed card in a revealed day, and names the latest photo message on that drop in the thread examples, by the same author.
- **Comments:** `CreateCommentRequest` and `CommentEditText` join `RULES` (and `CommentEditText` the guarded texts); `createComment`'s errors pinned as `MEDIA_NOT_READY`; the version check finds comments by `author` and `edited`, so a photo-only comment can't escape it.
- **Uploads:** `UploadPurpose`'s values equal `CreateUploadRequest`'s purposes.
- **The scanner** (`tests/src/privacy/scanner.ts`): its T15 rule covers `photo_added` and `photo_reserved` (no more than the viewer's own surviving photos and live photo reservations) and checks the limits and `is_star` against the viewer's role in that day; `PHOTO_LIMIT` joins `ERROR_FIELDS`. Negative tests: a friend's answer with the star's limits, a wrong `is_star`, and photo counts above the viewer's own are each caught. Its fixtures that build an allowance or a revealed day gain the new required fields, because `scan()` parses every answer with the contract's own schema; that follows the contract and loosens nothing.
- `tests/src/privacy/body-limits.test.ts`: the largest body becomes `createComment`'s (a new optional id), still under its route's limit; the pin names it.

## 11. What doesn't change

- The pre-reveal whitelist and the scanner's pre-reveal rules (`CAPTION_CARD`, `CARD_AUTHOR`, `NEVER_KEY`, the keys exemption): not touched (the plan's section 12). The author's own answers change, because their allowance now has the role's numbers: those are T15's own counts (the plan's decision 5), not T10, which covers answers to anyone but the author.
- The scanner's revealed-phase rules for `section`, `reply_preview` and a comment's photo (that a section matches the author, that a preview's comment is a readable, ready reply on that drop, comment facts and the reply photo's canary held by its drop) come with the PRs that first serve them, B5 and B6, with negative tests (the plan's decision 5). Today no route serves a revealed day or a thread.
- `packages/swift/`: the ios lane's. `ci`'s `swift` step regenerates `TadayoAPI` from the contract and must stay green; nothing here is in an answer the client decodes except `Error.allowance`'s new fields, and an unknown error code.

## 12. Records

`docs/TECH-DESIGN.md` (the renditions line gains the reply photo's thumbnail, display and full; the media route's line covers reply photos; the contract-notes line names `section`, `reply_preview`, `CommentPhoto`, the `conversation_photo` purpose and `PHOTO_LIMIT`); the journal's audit rows for T10, T12, T14, T15, T17, T35, T55, T63, T64, T65, ND01 to ND03 and ND07 to ND11 where this PR states a shape; the journal's state, log and section 4; `docs/PROGRESS.md`. No new ADR. No new question: every reading above is flagged in the PR instead (the deleted comment's absence, the thumbnail rendition, `is_star`, the refusals' order, the pictured removal's route left to B6, the kind-changing replacement left to B4).

## 13. Done when

- `pnpm --filter @tadayo/contracts test` and `openapi:check`, `python3 tools/ci/ci_steps.py guards`, `lint`, `typecheck`, `format`, `copy-lint`, `unit`, and `db-tests` and `privacy` on a fresh Postgres 16 made like `ci`'s, each exit 0;
- `python3 -B tools/ci/journal_check.py --branch` and `--all` pass;
- `ci` is green on the pushed head, its `swift` step included;
- the review at full depth (privacy: the plan's section 9) has had every finding fixed or answered;
- the founder has approved it in the api thread.
