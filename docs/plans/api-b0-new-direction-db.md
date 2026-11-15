# The new direction's database PR: `api/b0-new-direction-db`

The api lane's plan for the third PR of the founder's new direction, revision 1 (`docs/plans/new-direction-r1.md`, section 3, the api lane's step 4; its section 6 lists what the schema must hold). It was written before the code, from a read-only map of the database by four fresh readers and a completeness critic (workflow `wf_5346f7c7-3fe`), with every constraint name it relies on read from a migrated database's catalog, and it is pasted into the PR's Plan section.

The PR changes:
- two new migrations, `db/migrations/0010_allowance_by_role.sql` and `db/migrations/0011_photo_messages.sql` (no merged migration is edited: T57);
- the database tests in `tests/src/db/` that the new rules touch, and new ones written first;
- `docs/QUESTIONS.md` (FQ111), and the records.

No route, job or command is built: the purge paths, the lapse and the commands that move the counters are B2 to B6's. This PR gives each of them the schema and the last guards they need. No workflow file changes.

## Sources

- **The founder's addendum** (`docs/tadayo-new-direction-addendum-r1.md`): section 2 (the allowances by role; the server decides the role), section 5 (a message holds text, a photo or both; "Until the upload is ready and the message commits, other members see no successful message or feed preview"; withdrawing a message removes its photo and thumbnail), section 6 (the attachment's record: parent drop, author interval, timestamps and version, media reference, processing state, removal state; authorization at preparation and at commit), section 7 ("Applying the new limits to existing data").
- **The plan** (`docs/plans/new-direction-r1.md`): section 2's decision 3 (no grandfathering code: no real upcoming data exceeds the new allowance) and 4 (tests of the old friend limit are replaced, each listed old and new), section 6 (this PR), section 9 (the privacy checks), section 12 (what not to do).
- **The contract as merged** (PR #63, `0cf30f3`): `Allowance`'s `limit`, `photo_limit`, `external_limit` and `is_star` (`packages/contracts/src/common.ts`); `CreateCommentRequest`, `CommentPhoto`, `CommentEditText` and `Comment` (`schemas/after.ts`); `ReplyPreview` (`schemas/days.ts`); the `conversation_photo` purpose (`schemas/contributing.ts`); `getCommentMedia`'s three renditions (`operations.ts`).
- **The invariants as amended:** T3, T8, T9, T12, T17, T19, T24, T25, T27, T28, T57, T58 and T63 to T65; ND01, ND02, ND04, ND08, ND09, ND11 to ND13.
- **The schema:** `0006_contributions.sql` (`contribution_counters`, `reservations`, `uploads`, `upload_renditions`, `drops`), `0007_after_the_reveal.sql` (`comments`, `app.after_reveal_guard`), `0008_safety.sql` (`drop_removals`, `moderation_cases`, `operator_actions`, `deletion_tombstones`), and `docs/TECH-DESIGN.md` section 5 (the lock order).

## 1. The counters' last guard by role (`0010_allowance_by_role.sql`)

Today `app.contribution_counters` holds everyone to six drops and two links (`contribution_counters_check2` and `_check3`). The role is known from the row's key alone: the holder is the day's star exactly when `interval_id = occurrences.star_interval_id`, and neither column ever changes (`contribution_counters_keep`, `occurrences_keep`), so a row's role is fixed for good.

- **Three limit columns,** `total_limit`, `photo_limit` and `external_limit`, written by a BEFORE INSERT trigger from the two intervals: 6, 6 and 2 for the star, 3, 2 and 1 for anyone else. A caller who names a limit is refused, so the app never chooses the role (T17; addendum 2; the plan's section 9, check 1). A BEFORE UPDATE `keep_columns` freezes them.
- **Four named CHECKs:** the limits are one of the two sets; committed plus reserved within `total_limit`; photos (total minus external, committed plus reserved) within `photo_limit`; links within `external_limit`. The old `_check2` and `_check3` stay (T58): they are the star's own limits and still hold for everyone.
- **Expand, migrate, tighten (T57):** add the columns nullable, fill them from each row's two intervals, then set them NOT NULL and add the CHECKs. No count, key or row changes or goes. Before that, a check of every existing row aborts the file, keeping nothing, if any row already exceeds someone else's allowance: the plan's decision 3 says no such data exists (`prod` doesn't exist; no route, job or `ops` script writes a counter, and `ci` starts empty), so the abort is the stop the addendum asks for, never a silent change (addendum 7; FQ39). The only real rows the fill meets are the privacy matrix's committed worlds in a local test database, each within 3, 2 and 1.
- **No new lock:** the trigger reads a column that never changes, and the command already holds the day's lock (`docs/TECH-DESIGN.md` section 5).
- **Its own file,** so the upgrade test can replay exactly the counters' change against rows made under 0006 (section 4).

The CHECKs are tested in name order (Postgres), so the star's seventh drop still reports `contribution_counters_check2` and the star's third link `_check3`; a friend's third photo reports `contribution_counters_photos_within_limit` and a friend's second link `contribution_counters_links_within_limit`.

## 2. A photo message's upload and its renditions (`0011_photo_messages.sql`)

- **The purpose `conversation_photo`** joins `uploads_purpose_check` (dropped and re-added, wider), with a new column `conversation_drop_id`, the drop whose conversation it is for: present exactly for that purpose (a named CHECK), never changing (a BEFORE UPDATE `keep_columns`), indexed for the drop's withdrawal to find the unused ones, and paired with the id in a UNIQUE key the comment's foreign key points at. The existing CHECKs already keep its `reservation_id` and `replaces_drop_id` empty, so it can never become a drop's photo, a replacement or an avatar.
- **Made only for a revealed drop its owner may answer:** a BEFORE INSERT guard refuses a conversation upload unless the owner is in the drop's audience through a membership that is still active, the drop is active, and the upload is made at or after the drop's `reveal_at` (T63, T64; the plan's section 9, check 4). It locks the membership, then the drop, `FOR SHARE`, in `docs/TECH-DESIGN.md`'s order, so a withdrawal or a departure waits for it and then sees the upload. The read predicate stays the API's (T9); this is the last guard behind it.
- **The `thumbnail` rendition** joins `upload_renditions_kind_check` (widened), for `getCommentMedia`'s feed preview. A guard refuses a `thumbnail` for any upload that isn't a conversation photo, so a drop's photo can never carry one (T10: a thumbnail is a pre-reveal leak). Its size is B3's (`docs/TECH-DESIGN.md`, the renditions line).

## 3. Comments gain an optional photo (`0011_photo_messages.sql`)

- **The media reference:** `photo_upload_id`, unique (one message per upload: "used"), with a foreign key `(photo_upload_id, drop_id)` to `uploads (id, conversation_drop_id)`, so only an upload made for this drop can be its photo. Its processing state is the upload's `state`, reached through the reference: a message commits only with a ready upload, and `ready` is final, so a second copy on the comment would be a second source of truth. Its removal state is the comment's `state` and `ended_at`, with section 3's removal record.
- **Text, a photo or both:** `comments_check` (active ⇒ text) is replaced by `comments_active_has_content` (active ⇒ text or photo), the addendum's photo-only message, a rule change, not a weakening (T58; addendum 5); `comments_ended_empty` (ended ⇒ neither text nor photo) is new, and stricter than `comments_check1` for removed messages, which kept their text until a purge. `comments_check1` stays. FQ107's emptied text is `body` null while the photo stays.
- **The photo guard,** a new BEFORE INSERT OR UPDATE trigger: at the commit, the photo is the author's own upload (the author interval's account), ready, not lapsed, and locked `FOR SHARE` so a lapse purge racing the commit waits and then fails on the foreign key; on an update, a photo is never added or replaced, and never cleared while the message stands (T65; FQ107).
- **The commit's instant:** a new BEFORE INSERT trigger makes every comment start active, at version 1, with `updated_at = created_at`. `app.after_reveal_guard` checks `updated_at` on an insert, so a message dated before the reveal with a later `updated_at` passed it; now the two are equal and the reveal check covers `created_at`, the order the thread and the preview sort by (T63). `app.after_reveal_guard` itself is not replaced: it also guards reactions and favourites, and its ended-row branch needs no change because `comments_ended_empty` refuses a photo on an ended row.
- **The latest photo reply on each drop:** a partial index on `(drop_id, created_at DESC, id DESC)` where the message is active and holds a photo, for the per-viewer preview (T65; the plan's section 9, check 6). The query and its per-viewer filters (the read predicate, blocks) are B6's.
- **The header says what 0007's can't:** 0007 says "A removal's purge deletes them", but a comment a moderation case names can't be deleted (`moderation_cases`' foreign key, never deleted), so every path ends a comment in place, clearing its text and photo, and then deletes the upload.

## 3a. Who removed a message (`app.comment_removals`, `0011_photo_messages.sql`)

T25 audits a removal, and the only removal record, `drop_removals`, is keyed by drop. A pictured member removing a photo message (FQ108's default: the whole message goes) and an operator's removal of a comment have no record today, and the plan's section 6 lists both among the paths this PR must let reach a reply photo.

- One row per removed message: its comment and drop, the reason (`pictured`, `moderation` or `drop_ended`), the pictured member's interval (kept for the audit only, never served: T25), the operator action for moderation, and the instant. Row-level security; written once, never updated, deleted or truncated (on `kept.test.ts`'s list).
- A BEFORE INSERT guard: the message is still active; for `pictured`, the actor isn't its author, it still holds its photo, and the actor is still an active member (locked `FOR SHARE`); for `moderation`, it cites an operator action `remove_comment` on this comment; for `drop_ended`, its drop is withdrawn or removed.
- A deferred constraint trigger: a message is `removed` exactly when it has a removal row, checked at commit. A message is also inserted active (section 3), so no insert can skip it.
- **End states by path:** the author's deletion ends it `deleted` (tombstone reason `comment_deleted`); account deletion ends the account's messages `deleted` (reason `account_deletion`), since its author took them away; a pictured or moderation removal ends it `removed` with its removal row (reasons `pictured` or `moderation`); a drop's withdrawal or removal ends each of its active messages `removed` with a `drop_ended` row (the drop's own reason). The tombstones' kinds and reasons already cover each path (`deletion_tombstones`); no change there.
- **A leaver's or blocker's messages** aren't decided by any source (the plan's section 9, check 7, "as the comment rules decide"). The schema allows both readings: a message kept as it is, or ended `deleted` with the tombstone reason `leave` or `block`. FQ111 (section 6) records it with a default; the paths are B6's.

## 4. Tests first (`tests/src/db/`)

Written before the migrations, each failing on `main`'s schema for the reason its title gives:

- **The allowance by role** (`drops.test.ts`, the T17 block, retitled "allowances by role, as a last guard behind the counter's lock"):
  - the limits are written by role: Ana, Saturday's star, 6, 6 and 2; Ben and Cleo, friends, 3, 2 and 1;
  - Ben, the star of Ben's own Friday, gets 6, 6 and 2 there;
  - a counter that names its own limit is refused, and a limit never changes;
  - a friend's third photo, second link, and two committed photos plus a live photo reservation are refused by the last guard; two photos and a link pass;
  - the star keeps six and two (Ana: six photos pass, four photos and two links pass, a seventh drop and a third link are refused, with `_check2` and `_check3`);
  - one member's and one day's counts never touch another's: Ben and Cleo each full as friends on Ana's Saturday, Ben full as a friend on Cleo's Thursday and full as the star on Ben's own Friday, each counter holding only its own (ND04).
- **The upgrade** (`migrations.test.ts`): inside a rolled-back transaction, counters made under 0006's rules (the star's and a friend's), 0010 undone and replayed from its exact text gets their limits right and their counts unchanged; a friend's row over the new limit makes the replay fail with nothing kept.
- **A photo message's upload** (a new file, `photo-messages.test.ts`, its "T63 and T64" block): refused before the reveal, from outside the audience, by a former member, by a rejoined account's new interval (ND12), and for a withdrawn or held drop; accepted from the star and a friend after the reveal; `conversation_drop_id` never changes; it can't become a drop's photo, a replacement or an avatar; a `thumbnail` rendition is accepted for it and refused for a drop's photo.
- **A photo message** (`photo-messages.test.ts`, its "T63 to T65" block):
  - one with only a photo is accepted (ND09), with text and a photo too; one with neither is refused;
  - one before the reveal is refused, and one dated before the reveal with a later `updated_at` (ND08);
  - one after `close_at` is accepted and moves no counter (T64; ND11);
  - someone else's upload, a drop's photo upload, another drop's upload, one not ready, a lapsed one, and one already used are each refused;
  - the photo is never added to, replaced on or cleared from a standing message; emptied text is accepted with a photo and refused without one (FQ107);
  - deleting a message clears its text and photo, and a deleted or removed message with either is refused (ND13); an upload a message holds can't be deleted;
  - every message is inserted active, at version 1.
- **Who removed a message** (`photo-messages.test.ts`, its "T25 and FQ108" block): a pictured removal by the author, of a text-only message, or by a former member is refused; a moderation removal without its operator action is refused; `drop_ended` for an active drop is refused; so are a removal of a message that has already ended, a pictured removal by a member outside the drop's audience (someone who joined after its commit), a moderation removal citing an operator's action about another message, and a removal carrying another reason's member or action; a message ended `removed` without a removal row fails at commit; the removal row is written once (`kept.test.ts`).
- **The latest-photo index** exists with its predicate (read from `pg_indexes`; `photo-messages.test.ts`'s last block).
- **The lists match the contract** (the same block): the database's upload purposes equal `UploadPurpose`'s, and its rendition kinds equal `getCommentMedia`'s, as `idempotency.test.ts` already does for the receipts' operations.

**Tests rewritten** (the plan's decision 4; each listed old and new in the PR):
- `drops.test.ts` `refuses a seventh drop or a third link in the counter`: Ben's four photos and two links become Ana's, with the same assertions; Ben's side is the new test of a friend's limits.
- `drops.test.ts`'s T21 test: the same author's two links become Ana's (a friend has one link now).
- `safety.test.ts` `adds nothing to a drop that isn't active…`: Ben's four photos would stop at the third; Ben keeps a removed photo, a live photo and a withdrawn link, and the held drop becomes Cleo's photo, so each actor and each case stays (the critic's note: making all four Ana's would have Ana react to Ana's own drop, which proves less).

Every other `commitDrop` call stays within 3, 2 and 1 (checked across `tests/src/`, `audience.test.ts`'s ten included).

## 5. What doesn't change

- `app.after_reveal_guard`, `app.uploads_owner_guard`, `uploads_keep` and every other existing function and trigger: the new rules are new triggers beside them.
- The privacy matrix and the leak scanner: no matrix world holds more than one photo or one link per friend, no world writes a comment, and nothing in them reads the counters. The matrix's canary query will map a reply photo's content version once B6 serves it.
- The pre-reveal whitelist (T10): nothing here is served.
- The tombstones' kinds and reasons, the receipts' operations (`updateComment` and `createComment` are already there).

## 6. Records

- `docs/QUESTIONS.md`: FQ111 (reserved through the coordinator at 20:02 UTC on 2026-11-15): what happens to the messages of someone who leaves a club or blocks someone; default, they follow the choice made for that person's drops (kept with "keep", ended with their photos with "withdraw"), and a blocked person's messages are never shown to the blocker (the plan's section 9, check 6).
- The journal: the state (blocks 1.1 and 1.2), the audit rows T17, T24, T25, T27, T28, T57, T63 to T65, ND01, ND02, ND04, ND08, ND09, ND11 to ND13, Q10 and spec 31 (33 tables); a log entry per commit; section 4's row.
- `docs/PROGRESS.md`, the api lane's section and the shared line.

## 7. Done when

- `python3 tools/ci/ci_steps.py guards`, `lint`, `typecheck`, `format`, `copy-lint`, `unit`, `openapi`, and `db-bootstrap`, `db-tests` and `privacy` on a fresh Postgres 16 made like `ci`'s, each exit 0;
- the deliberate breakages (each rule's line changed in a scratch worktree) are each caught by the test written for it;
- `python3 -B tools/ci/journal_check.py --branch` and `--all` pass;
- `ci` is green on the pushed head;
- the review at full depth (privacy: the plan's section 9) has had every finding fixed or answered;
- the founder has approved it in the api thread.
