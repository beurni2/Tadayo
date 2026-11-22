# B2: Reservations and the allowance counters (`api/b2-reservations`)

`POST /v1/occurrences/{occurrence_id}/reservations` and `DELETE /v1/reservations/{reservation_id}`, the contract's `createReservation` and `releaseReservation` (spec 06, 11, 31, 32; addendum 2; T1, T3, T4, T9, T14, T15, T17, T18, T19, T55; Q09, Q10, Q12; ND01, ND02, ND04; FQ50, FQ63, FQ112). `docs/MILESTONES.md` gives B2's api "Reservations and counters, with the allowance transaction by role (addendum 2; T17) (exercised with test uploads), the cutoff under the lock, idempotency", the last api item of B2.

## 0. The split, and the readings

1. **This PR builds the two reservation routes and the counter's transaction, nothing else.**
   - `createUpload`, `completeUpload` and `createDrop` are B3's: the commit needs a ready upload or a resolved source, which only B3's pipeline and `sources/resolve` make (`docs/MILESTONES.md`, B3). `getOwnDay` answers the author's own drops in their author form, which comes with the author preview (B3, B4).
   - "Exercised with test uploads": the Postgres tests drive the counter through the reservation routes' commands, and the world's `commitDrop` (`tests/src/db/world.ts`), which consumes a reservation and counts a commit as `createDrop` will, supplies the committed drops.
   - The pieces B3's commit reuses are built here and used here: the role's limits and the order of the refusals (`limitRefusal`), the counter's lock with its lapsed reservations settled (`lockCounter`), and who may add to a day at all (`addTargetOutcome`). Nothing is built for B3 alone.
2. **The role comes from the two intervals, never from the request.** The caller's active membership interval in the day's club is the star's exactly when it is the occurrence's `star_interval_id` (T17; addendum 2). `CreateReservationRequest` is a strict object holding only `media_class`, so a role field is refused as INVALID_REQUEST (new-direction plan, section 9, check 1). The counter row's limits are written once by its BEFORE INSERT trigger from the same two intervals (`db/migrations/0010_allowance_by_role.sql`); the command reads them back and throws if they ever disagree with its own reading, which would mean a bug, never a refusal.
3. **A lapsed reservation is settled under the counter's lock, by the command that holds it.** The counter's `reserved_total` and `reserved_external` count live reservations. A reservation lapses at its `expires_at` (T18) with nothing to run: before any command reads or changes a counter, `lockCounter` marks that counter's live reservations whose `expires_at` has come (`expires_at <= at`, the clock's sample after the locks) `expired`, with `ended_at` their `expires_at`, and takes them off the counts, in one statement. So a lapsed slot counts for nothing from its `expires_at` on, as `createDrop`'s description says ("A reservation that has lapsed counts as none"), with no worker (T1's spirit: a stopped worker changes no answer). It is the only writer of the `expired` state; a worker job that purges lapsed uploads (B3) must use it.
4. **A reservation holds its slot for 30 minutes, never past the day's reveal: `expires_at = min(at + 30 min, reveal_at)`.** No source gives the duration (spec 11: "an expiring reservation while an upload is preparing"). It is an engineering choice, recorded in the PR's decisions, not a product question: a reservation is the caller's own, so its length only ever affects the caller's own next slot. It covers a 20 MiB upload on a slow network and its preparation; a commit after it lapsed still takes a free slot (`createDrop`'s description), and one that finds none is refused with the caller's allowance and the person's next day, and the work stays in Drafts (T4). The cap at the reveal is also the database's guard (`app.reservations_guard`).
5. **A day whose star has left, or asked to delete their account, before its reveal is held (FQ63), and a reservation in it is MEMBERSHIP_CHANGED with no other field.**
   - The contract gives `createReservation` MEMBERSHIP_CHANGED for "a membership changed since the action started: the person's, so `target`, the day asked for, must be chosen again (T4, spec 32)". The person whose membership can change under a reservation is the day's star: the caller's own leaving makes the club nothing to them (NOT_FOUND, T14), and a request names no interval of the caller's.
   - It carries no `target`: `OccurrencePhase` gives a held day no stage before B6 ("gets its stage with leaving, in B6"), and the app already holds the day it asked for. B6, which builds leaving's days, may add it. This is a reading of the contract, recorded in the PR; FQ63 already asks the founder about held days.
   - It tells the caller nothing new: the caller is a member, the roster already shows the star gone, and Home and the club list already leave the held day out (`packages/domain/src/authorization/days.ts`).
6. **A paused club's days take reservations** like any other until they open (FQ50's default: "Until the day opens at 7 AM, + Add offers it").
7. **A refusal carries the caller's own facts only** (T4, T15): `target`, the day asked for, as the contract's `Occurrence` at the clock's sample; `allowance`, the caller's own counts and limits in that day; and `next_target`, the same person's next day, "for the person to confirm". The next day is the earliest day of the same star that the club list would offer (`days.ts`' `placeable` rule: scheduled, not held, a star to name) whose reveal is after both the clock's sample and the target's reveal, so a limit refusal never offers the full day again and a missed cutoff never offers a day that has also opened. With none, there is no `next_target`. Nothing is moved (T4).
8. **Idempotency (T19).** `createReservation`'s receipt is the caller's, for the operation and the `Idempotency-Key`, over the path's `occurrence_id` and the body (`packages/domain/src/idempotency/receipt.ts`). The same request under the same key gets its first 201 back byte for byte, even after the cutoff, midnight, or a release of the slot; another request under it is IDEMPOTENCY_CONFLICT. A key whose receipt an earlier interval of the account made names nothing to the new one (FQ112's default, `reserveAsMember`): NOT_FOUND. The reservation's own `request_key` is the same key, and `UNIQUE (interval_id, request_key)` is the database's last guard. `releaseReservation` takes no key (the contract): repeating it returns the same state.

## 1. What each route answers

### `createReservation`, one command (TECH-DESIGN section 5)

1. **Who may add to the day, with no lock** (`loadAddTarget` and `addTargetOutcome`, in the authorization module): the day exists, it is `scheduled`, its club isn't suspended, and the caller's account is active with an active interval in that club. Otherwise the neutral NOT_FOUND, before the receipt is looked at (T14; FQ112's default), for a first request and a retry alike.
2. **The receipt** (`reserveAsMember`, with the clock's first sample as its `created_at`): a replay returns its stored answer here.
3. **The locks, in TECH-DESIGN's order:** the club's row `FOR SHARE`, the occurrence's `FOR SHARE`, the caller's and the star's membership rows `FOR SHARE` (by interval id, byte by byte), then the counter: `INSERT … ON CONFLICT DO NOTHING`, then `SELECT … FOR UPDATE`. A `FOR SHARE` holds off a suspension, a cancellation, a leave or the end of an interval until the command commits, while two contributors' reservations wait only for each other's counter, never for each other.
4. **The clock, sampled after the locks** (T1, T3), and the facts read again under them.
5. **The policy, in this order:**
   - the step 1 conditions again (a leave or a suspension may have come in between, and a rejoined account has another interval): NOT_FOUND;
   - a held day (section 0.5): MEMBERSHIP_CHANGED;
   - the cutoff, `at >= reveal_at` (T3): OCCURRENCE_CLOSED with `target` (its phase `open` or `past` at `at`) and `next_target`;
   - the lapsed reservations settled (section 0.3), then the caller's limits by role, counting committed drops and live reservations (T17): QUOTA_FULL when the whole allowance is used; then, for a video link, EXTERNAL_LIMIT when the role's links are used; for a photo, PHOTO_LIMIT when a friend's two photos are used (never the star's, whose photos are the whole allowance). Each with `target` (`collecting`), `allowance` and `next_target`.
6. **The write:** the reservation, `live`, `created_at` the sample, `expires_at` by section 0.4, `request_key` the key; the counter's `reserved_total`, and `reserved_external` for a link, one more.
7. **The answer:** 201 with the `Reservation` (`id`, `occurrence_id`, `media_class`, `expires_at` in whole seconds rounded down, never later than the database's, and the caller's `allowance` after the write), stored in the receipt and answered as the receipt keeps it.

### `releaseReservation`

1. **Whose it is, with no lock:** the reservation exists, its interval is the caller's active interval, its club isn't suspended, its day is `scheduled`. Otherwise NOT_FOUND (T14): another person's reservation, an earlier interval's after a rejoin, a former member's, a guessed id.
2. **The locks:** club, occurrence and the caller's membership `FOR SHARE`, the counter `FOR UPDATE`, then the reservation `FOR UPDATE`. Every change of a reservation's state happens under its counter's lock, so its state read after that lock is final for the command.
3. **The clock after the locks**, and step 1 again.
4. **The lapsed reservations settled**, this one among them if its time has come. Then a reservation still live is `released`, with `ended_at` the sample, and taken off the counts.
5. **The answer:** 200 with `ReleasedReservation`: its `id`, its `state` (`released`, `expired` or `consumed`), the `drop_id` of the caller's own drop that used it when consumed (T20), and the caller's `allowance` in that day. Repeating it returns the same state. A held day's reservation can be released like any other: the slot is the caller's own.

## 2. Code

- `packages/domain/src/authorization/add-target.ts`: `loadAddTarget(tx, userId, occurrenceId)`, the facts of one day for one caller (the day's `DayFacts` as `days.ts` reads them, the caller's account and interval, the club's suspension, and the star's later days), and `addTargetOutcome(facts, now)`, the pure rule of section 1's steps 1 and 5's first three, returning `not_found`, `held`, `closed` with `target` and `next`, or `collecting` with the caller's interval, `isStar`, `target` and `next`. It reuses `days.ts`' own rules (`placeable`, `chosen`, `chooseNextDayOf`), exported for it, so who may add and what Home offers can't drift.
- `packages/domain/src/drops/allowance.ts`: the two roles' limits, `AllowanceCounts`, `allowanceOf(counter, isStar)` and `limitRefusal(counts, mediaClass)`, pure.
- `packages/domain/src/drops/counter.ts`: `lockCounter(tx, day, interval, club, at)` (the row made if missing, locked, its lapsed reservations settled, returned), `holdSlot` and `freeSlot`.
- `packages/domain/src/drops/reserve.ts`: `createReservation(tx, clock, input, render)`; `packages/domain/src/drops/release.ts`: `releaseReservation(tx, clock, input)`.
- `packages/domain/src/refused.ts`: `RefusalFacts` gains `target`, `next_target` and `allowance`, as domain values the route renders.
- `services/api/src/drops/reservations.ts`: the two handlers, parsing by the contract's schemas, and `reservationBody` and `releasedBody`, explicit field lists (T55). `services/api/src/bodies.ts`: `occurrenceBody`, moved from `clubs/list.ts`, and `allowanceBody`, so `answers.ts`' `refusal` can render a refusal's days and allowance without an import cycle. `app.ts`: the handlers and their body limits.
- `tests/src/matrix.ts`: `withdraw` and `withdrawUnrevealed` give back the slot of a drop withdrawn before its reveal, as spec 11 says and B4's withdrawal will, so the world's counters agree with its drops.

## 3. Tests first

Planned here before the code, from the spec, the addendum and the invariants. They were written beside the commands rather than run failing first, so none was seen to fail before its rule existed: the deliberate breakages of section 5, run at the PR's last head, are what shows each can fail (the PR says so).

- **Pure** (`packages/domain`):
  - `add-target.test.ts`: every NOT_FOUND condition one at a time (no day, another club, a former member, a deleting account, a suspended club, a suspended day, a cancelled day); held by the star's leaving and by the star's deletion request, each before the reveal (and not held when after it); the cutoff a microsecond either side of `reveal_at`; `target`'s phase; `next` skipping the target, a held, cancelled or suspended day, and another star's day.
  - `allowance.test.ts`: spec 11's table and addendum 2's examples for each role (six photos; four and two links; one and one; three links refused; a friend's two and one; a third photo, a second link refused), QUOTA_FULL first when several are met, PHOTO_LIMIT never for the star, and the counts the allowance reports.
- **Postgres** (`tests/src/db/reservations.test.ts`):
  - **ND01:** the star reserves six photos, and a seventh is QUOTA_FULL; two links, and a third is EXTERNAL_LIMIT while the total is free, then four photos, and then QUOTA_FULL for either kind.
  - **ND02:** a friend reserves two photos and a link; a third photo is PHOTO_LIMIT, a second link EXTERNAL_LIMIT, a fourth anything QUOTA_FULL; with committed drops (`commitDrop`) and reservations mixed.
  - **Q10 and ND02's concurrency:** ten reservations at once on ten connections, by the star and by a friend, photos and links: never more than the role allows, every other one refused with its code, and the counter equal to the live rows.
  - **ND04:** a friend's reservations in one day touch nothing of another day, another member, another club, or the same account's new interval after leaving and joining again, whose allowance starts empty while the old interval's live slots stay the old interval's.
  - **T3, the cutoff under the lock:** a reservation that waits on the counter's lock while the clock passes 07:00 is OCCURRENCE_CLOSED; a reservation a microsecond before the reveal is held until exactly `reveal_at`; at the reveal and after the close, OCCURRENCE_CLOSED with the target's phase and the star's next day.
  - **T18:** a reservation lapses at 30 minutes: a reservation that would be refused is held once the earlier slot has lapsed, the lapsed row is `expired` with its `expires_at` as `ended_at`, and the counter equals the live rows; exactly at `expires_at` it counts as lapsed.
  - **T19 and Q12's reservation half:** the same request replayed after the cutoff, after midnight and after its release returns the first answer byte for byte; another body or another day under the key is IDEMPOTENCY_CONFLICT; a refusal leaves no receipt; a rejoined account's replay is NOT_FOUND (FQ112).
  - **Releases:** released, with the counter one less and the allowance; again, the same state; a lapsed one `expired`; a consumed one with its drop; another member's, an earlier interval's, a former member's and a guessed id NOT_FOUND.
  - **Held days and denials:** the star leaves, then MEMBERSHIP_CHANGED; a stranger, a suspended club, a cancelled or suspended day, NOT_FOUND.
  - **T15:** each refusal's allowance is the caller's own, never another member's numbers.
- **The route** (`services/api/src/drops/reservations.test.ts`): the key and the strict body (a role field, an unknown media class, an extra field), each refusal's body with its days and allowance and no other field, `Cache-Control: private, no-store`, and a handler whose transaction runs its body against a recording fake.
- **The privacy matrix** (`tests/src/privacy/reservation.ts`, its rows `RESERVATION` and `RELEASE_RESERVATION`, `reservation.test.ts` for each branch of its judge):
  - every cell sends `createReservation` with no body (INVALID_REQUEST) and `releaseReservation` for a reservation Ben released in the world (Ben: `released` with Ben's allowance; everyone else: NOT_FOUND), so the generic step changes nothing;
  - then, in every cell, a table on the cell's day: photo, photo, link, link, link, photo, photo, photo, each judged from the world's rows before it (NOT_FOUND, MEMBERSHIP_CHANGED, OCCURRENCE_CLOSED with the star's next day, the role's refusal with exact counts, or 201 with exact counts and `expires_at`), the first one's retry (the same bytes) and another body under its key (IDEMPOTENCY_CONFLICT); then every slot but the first released; in the next phase, the first released (`expired`) and released again;
  - each answer scanned by the leak scanner against the world read after it (scanner.ts' allowance and bare-id rules).

## 4. Run it and look at it

- **Postgres** (local, or Docker if its daemon runs): `ci_steps.py db-tests`; a fresh database, then `ci_steps.py privacy`; the packages' unit tests, lint, type checks, `openapi`, `copy-lint`, `guards`; `journal_check.py --branch`.
- **The routes by hand,** on the local app against Postgres: the matrix world's members before the reveal, at it and after the close, each limit reached as the star and as a friend, a replay, a release, and the log lines of each, checked for no personal data (T52).

## 5. Deliberate breakages

One-line changes in a scratch worktree, each of which some test must fail: the clock sampled before the locks; the counter read without `FOR UPDATE`; the role read from the account instead of the interval; lapsed reservations counted; lapse at `<` instead of `<=`; the cutoff at `>` instead of `>=`; QUOTA_FULL after the others; a friend's photo limit at three; the star's link limit at three; `expires_at` not capped; a release that frees a link as a photo; a release of another member's reservation; the receipt looked at before the membership; `next_target` the target itself; the allowance summed across the account's intervals; and the judge's own rules, one at a time.

## 6. Review

Full depth (T17 and T19 are allowance and idempotency rules; the routes are authorization paths): three fresh reviewers, privacy and security, the rules against the spec, the addendum and the invariants, and the SQL, concurrency and tests. Every finding fixed or answered in the PR; then one fresh reviewer of the fix commit.

## 7. Records

In the PR's last commit before it opens: the journal's api block, the audit map (T3, T4, T17, T18, T19, spec 06, spec 11, Q09, Q10, Q12, ND01, ND02, ND04), a log entry, table 4.1's row, `docs/PROGRESS.md`, and `rows.ts`' header.

## 8. What later slices owe

- **B3:** `createUpload`'s `drop_photo` purpose names a live reservation of the caller's (`DropPhotoUploadRequest`); `createDrop` consumes the reservation it names, or takes a free slot when it has lapsed, through `lockCounter` and `limitRefusal`, under the same lock order; a purge of lapsed uploads settles reservations only through `lockCounter`.
- **B4:** withdrawal before the reveal gives back its slot (the counter's `committed_total`), as the matrix world's helpers now do; a replacement that changes a drop's kind is checked again by `limitRefusal` (T17).
- **B6:** a held day's stage, and whether MEMBERSHIP_CHANGED then carries it as `target` (section 0.5).
- **Gate A's report:** Q01, Q02 and Q04 are proved by B2's schedule PRs' tests, but their audit-map rows still say planned; the report fills them from those PRs' tests.

## 9. Not in this PR

- `createUpload`, `completeUpload`, `createDrop`, `getOwnDay` (section 0.1).
- Rate limits on reservations (TECH-DESIGN section 5: the token bucket is its own slice).
- Any contract or migration change: the contract (PRs #23, #51, #63) and the schema (`0006`, `0010`) already hold every shape and guard this needs.
