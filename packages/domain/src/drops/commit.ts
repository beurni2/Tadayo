/// <reference lib="esnext.temporal" />
// Adding a drop to a day (the contract's `createDrop`, for a photo; spec 06, 07, 11, 14, 32; T1, T3, T4, T8, T9,
// T12, T14, T15, T17, T18, T19, T20, T21; docs/plans/api-b2-spike-commit.md), one command in one READ COMMITTED
// transaction the caller opens (TECH-DESIGN section 5). Only its answer means Added (T20). A refusal throws
// `Refused`, which rolls it back, so a refused request leaves nothing, its receipt included.
//
// 1. Who may add to the day, with no lock (../authorization/add-target.ts): anything but a member the day is
//    open to is the neutral NOT_FOUND, before the receipt (T14; Q06).
// 2. The receipt (T19, Q12): the same request under the same key gets its first answer back, as it was, after the
//    cutoff, midnight or a release, but for the day's star, whom it names as members see them now (FQ75, FQ139);
//    a star with no name to show any more (an ended interval with none kept, which only an account deletion
//    leaves) is MEMBERSHIP_CHANGED, since no answer may send the day nameless. Before the reveal that day is held
//    and the drop with it (FQ63), as a new commit would find it; after the reveal the drop stays active in the
//    opened day, which members no longer see (`placeable`), so the retry refuses an add that was made: account
//    deletion (B6) decides how such a day ends, and this answer with it (FQ139). Another request under the key is
//    IDEMPOTENCY_CONFLICT; a key an earlier interval of the account used names nothing to this one
//    (`reserveAsMember`, FQ112).
// 3. The locks, in TECH-DESIGN's order: the club's row, the day's and the caller's and the star's membership rows
//    `FOR SHARE` (./reserve.ts `lockDay`), which hold off a membership that begins or ends, a suspension and a
//    cancellation until this commits, so the audience written below is the club's as it stands; the counter
//    `FOR NO KEY UPDATE` (./counter.ts); then the caller's upload `FOR SHARE`, which waits for a preparation in
//    flight (../media/prepare.ts, `FOR NO KEY UPDATE`) and then reads it as it left it, and the upload's
//    reservation `FOR NO KEY UPDATE` when `ownsReservation` gives it to the caller, as a release takes it after the
//    same counter (./release.ts).
// 4. The clock, sampled after the locks (T1, T3): a commit that waited across 07:00 reads the time after it.
// 5. The rule again, on the facts read under the locks, in this order: NOT_FOUND (a leave, a suspension or a
//    rejoin came in between); MEMBERSHIP_CHANGED for a held day (FQ63); from the reveal on, OCCURRENCE_CLOSED
//    with the day and the same person's next day (T3, T4); a link, NOT_FOUND until the link's commit is built
//    (the plan's section 0.2); the upload the caller's own and live (../authorization/upload.ts `ownsUpload`), a
//    drop's photo, under a slot of the caller's interval in this day (`ownsReservation`), and `reservation_id`
//    naming that slot when sent, else NOT_FOUND (T4: nothing is moved; the plan's sections 0.3 and 0.7); not
//    ready, MEDIA_NOT_READY; the same photo as one of the caller's own active or held drops in the day,
//    DUPLICATE_DROP with that drop (T21); an upload another drop already used, NOT_FOUND; then the counter's
//    lapsed reservations settled, and the slot still live, or, when it has ended, the caller's limits by role:
//    QUOTA_FULL or PHOTO_LIMIT, QUOTA_FULL first, with the day, the caller's own allowance and the next day (T4,
//    T15, T17, T18).
// 6. The write: the drop, active at version 1, committed at the sample; its caption's first version; the slot
//    consumed, or a free one taken; the audience, every active member of the club, the author and the star among
//    them; and the seal (T8). The database's guards are the last word on each (db/migrations/0006).
// 7. The answer, made by `render`, stored in the receipt, and answered as the receipt keeps it: no caption, no
//    upload and no URL (TECH-DESIGN section 6). The receipt keeps the day's star by interval alone, so no copy of
//    a person's name outlives what they change or delete (FQ75, T27); each answer names them as it is sent.

import { addTargetOutcome, loadAddTarget, ownsReservation } from "../authorization/add-target.ts";
import { placedStar, type PlacedDay } from "../authorization/days.ts";
import type { QuerySql } from "../authorization/read-sql.ts";
import { ownsUpload } from "../authorization/upload.ts";
import { completeReceipt, reserveAsMember, type ReceiptKey } from "../idempotency/receipt.ts";
import type { Json } from "../idempotency/request.ts";
import { newId } from "../ids.ts";
import { Refused } from "../refused.ts";
import type { Clock, ClockSql } from "../time/clock.ts";
import { allowanceOf, limitRefusal, type Allowance } from "./allowance.ts";
import { consumeSlot, lockCounter, settleLapsed, takeSlot, type CounterKey } from "./counter.ts";
import { lockDay, nextTarget } from "./reserve.ts";

/** What the drop holds, as the body names it: a photo upload of the caller's, or a source they resolved. */
export type DropMediaInput =
  | { readonly kind: "photo"; readonly uploadId: string }
  | { readonly kind: "external_video"; readonly sourceId: string };

export interface CreateDropInput {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The `Idempotency-Key`, a UUID, created when the action started and reused on every retry. */
  readonly key: string;
  /** The path's day. */
  readonly occurrenceId: string;
  /** The body's `reservation_id`, or undefined when it sent none. */
  readonly reservationId: string | undefined;
  readonly media: DropMediaInput;
  /** The body's caption as the contract parsed it, or undefined when it sent none. */
  readonly caption: string | undefined;
}

/** The commit's receipt: the contract's DropReceipt. */
export interface DropReceiptAnswer {
  readonly dropId: string;
  /** The day, as the contract's Occurrence at the clock's sample. */
  readonly occurrence: PlacedDay;
  readonly mediaClass: "photo";
  readonly version: 1;
  /** The caller's own allowance in the day, this drop counted (T15, T17). */
  readonly allowance: Allowance;
  /** The caller's own highlight in the day as it stands, and its version, 0 before the first (T22). */
  readonly highlight: { readonly dropId: string | null; readonly version: number };
}

/** How the route writes the commit's answers, an explicit field list each (T55). */
export interface DropRender {
  /** The contract's DropReceipt. */
  readonly receipt: (answer: DropReceiptAnswer) => Json;
  /** The contract's Person, for the day's star in it. */
  readonly star: (star: PlacedDay["star"]) => Json;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | null | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOAD_STATES = ["pending", "preparing", "ready", "held", "rejected"] as const;
const SLOT_STATES = ["live", "released", "expired", "consumed"] as const;

function check(input: CreateDropInput): void {
  if (typeof input.userId !== "string" || !ID.test(input.userId)) {
    throw new TypeError("drops: the caller is an account id");
  }
  if (typeof input.key !== "string" || !UUID.test(input.key)) {
    throw new TypeError("drops: the idempotency key is a UUID");
  }
  if (typeof input.occurrenceId !== "string") throw new TypeError("drops: the day is an id");
  if (input.reservationId !== undefined && typeof input.reservationId !== "string") {
    throw new TypeError("drops: the reservation is an id");
  }
  const { media } = input;
  if (!(
    (media.kind === "photo" && typeof media.uploadId === "string") ||
    (media.kind === "external_video" && typeof media.sourceId === "string")
  )) {
    throw new TypeError("drops: the media is a photo's upload or a link's source");
  }
  if (input.caption !== undefined && typeof input.caption !== "string") {
    throw new TypeError("drops: the caption is text");
  }
}

/** The caption as the drop keeps it: an empty one is none (the plan's section 0.9). */
export function keptCaption(caption: string | undefined): string | null {
  return caption === undefined || caption === "" ? null : caption;
}

function isRecord(value: Json | undefined): value is { readonly [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `body` with its day's star replaced by `star`, every other key where it was, so a replay keeps the first
 * answer's order. Throws for a body with no day and star, which no receipt of this command is.
 */
function withStar(body: Json, star: Json): Json {
  const occurrence = isRecord(body) ? body["occurrence"] : undefined;
  if (!isRecord(body) || !isRecord(occurrence) || !isRecord(occurrence["star"])) {
    throw new Error("drops: a receipt names no day and star");
  }
  return { ...body, occurrence: { ...occurrence, star } };
}

/** The interval of the star a receipt keeps (`withStar`'s other half). */
function keptStar(body: Json): string {
  const occurrence = isRecord(body) ? body["occurrence"] : undefined;
  const star = isRecord(occurrence) ? occurrence["star"] : undefined;
  const id = isRecord(star) ? star["membership_id"] : undefined;
  if (typeof id !== "string") throw new Error("drops: a receipt names no star");
  return id;
}

/** The body as the receipt knows it: the contract's names, only what was sent. */
function receiptBody(input: CreateDropInput): Json {
  return {
    ...(input.reservationId === undefined ? {} : { reservation_id: input.reservationId }),
    media:
      input.media.kind === "photo"
        ? { kind: "photo", upload_id: input.media.uploadId }
        : { kind: "external_video", source_id: input.media.sourceId },
    ...(input.caption === undefined ? {} : { caption: input.caption }),
  };
}

/** The caller's own upload, as the commit reads it under its lock. */
interface UploadFacts {
  readonly owner: string;
  readonly expiresAt: Temporal.Instant;
  readonly purpose: string;
  readonly state: (typeof UPLOAD_STATES)[number];
  readonly reservation: string | null;
}

function uploadOf(row: Readonly<Record<string, unknown>> | undefined): UploadFacts | null {
  if (row === undefined) return null;
  const { owner_user_id: owner, expires_at: expiresAt, purpose, state, reservation_id: reservation } = row;
  if (
    typeof owner !== "string" ||
    !(expiresAt instanceof Temporal.Instant) ||
    typeof purpose !== "string" ||
    typeof state !== "string" ||
    !(UPLOAD_STATES as readonly string[]).includes(state) ||
    !(reservation === null || typeof reservation === "string")
  ) {
    throw new Error("drops: an upload came back in a shape the command doesn't know");
  }
  return { owner, expiresAt, purpose, state: state as UploadFacts["state"], reservation };
}

/** A reservation's interval and day, which never change (`reservations_keep`), and its state. */
interface SlotFacts {
  readonly day: string;
  readonly interval: string;
  readonly state: (typeof SLOT_STATES)[number];
}

function slotOf(row: Readonly<Record<string, unknown>> | undefined): SlotFacts | null {
  if (row === undefined) return null;
  const { occurrence_id: day, interval_id: interval, state } = row;
  if (
    typeof day !== "string" ||
    typeof interval !== "string" ||
    typeof state !== "string" ||
    !(SLOT_STATES as readonly string[]).includes(state)
  ) {
    throw new Error("drops: a reservation came back in a shape the command doesn't know");
  }
  return { day, interval, state: state as SlotFacts["state"] };
}

async function readSlot(tx: QuerySql, id: string): Promise<SlotFacts | null> {
  return slotOf((await bound(tx)`SELECT occurrence_id, interval_id, state FROM app.reservations WHERE id = ${id}`)[0]);
}

/**
 * Commits one drop of the caller's to the day, in `tx`, and returns what `render` makes of its receipt, which is
 * also what the receipt stores and a replay returns. Throws `Refused`.
 */
export async function createDrop(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: CreateDropInput,
  render: DropRender,
): Promise<Json> {
  check(input);
  const { userId, occurrenceId, media } = input;
  // An id that can't be one names no day, as one nobody has.
  if (!ID.test(occurrenceId)) throw new Refused("NOT_FOUND");
  const receipt: ReceiptKey = {
    userId,
    key: input.key,
    request: { operation: "createDrop", path: { occurrence_id: occurrenceId }, query: {}, body: receiptBody(input) },
  };

  // 1. Who may add to the day, with no lock.
  const first = await clock.sample(tx);
  const seen = await loadAddTarget(tx, userId, occurrenceId);
  const looked = addTargetOutcome(seen, first);
  if (seen === null || looked.kind === "not_found" || seen.viewerInterval === null) throw new Refused("NOT_FOUND");
  const interval = seen.viewerInterval;

  // 2. The receipt, its star named as members see them now: a day's star never changes, so the one it keeps is
  //    this day's.
  const stored = await reserveAsMember(tx, receipt, first, interval);
  if (stored !== null) {
    if (keptStar(stored.replay) !== seen.day.starInterval) throw new Error("drops: a receipt names another star");
    const star = placedStar(seen.day);
    if (star === null) throw new Refused("MEMBERSHIP_CHANGED");
    return withStar(stored.replay, render.star(star));
  }

  // 3. The locks: the day's rows, the counter, then the caller's own upload and its slot when that slot is the
  //    caller's interval's in this day. Another account's upload is neither read nor locked.
  await lockDay(tx, seen, interval);
  const key: CounterKey = { day: seen.day.id, interval, club: seen.day.clubId };
  await lockCounter(tx, key);
  const uploadId = media.kind === "photo" && ID.test(media.uploadId) ? media.uploadId : null;
  const upload =
    uploadId === null
      ? null
      : uploadOf(
          (
            await bound(tx)`
              SELECT owner_user_id, expires_at, purpose, state, reservation_id FROM app.uploads
               WHERE id = ${uploadId} AND owner_user_id = ${userId}
                 FOR SHARE`
          )[0],
        );
  // The slot's day and interval never change, so they are read before its lock, and it is locked only when the
  // authorization module gives it to the caller (`ownsReservation`, as at step 1's facts and time): then it is
  // this counter's, and a slot of another counter is never locked without that counter's lock. Step 5 asks again.
  const slotId = upload?.reservation ?? null;
  const slotSeen = slotId === null ? null : await readSlot(tx, slotId);
  if (slotId !== null && slotSeen !== null && ownsReservation(seen, slotSeen, first)) {
    await bound(tx)`SELECT id FROM app.reservations WHERE id = ${slotId} FOR NO KEY UPDATE`;
  }

  // 4. The clock.
  const at = await clock.sample(tx);

  // 5. The rule again, under the locks.
  const facts = await loadAddTarget(tx, userId, occurrenceId);
  const outcome = addTargetOutcome(facts, at);
  if (facts === null || outcome.kind === "not_found" || facts.viewerInterval !== interval) {
    throw new Refused("NOT_FOUND");
  }
  if (outcome.kind === "held") throw new Refused("MEMBERSHIP_CHANGED");
  if (outcome.kind === "closed") {
    const next = await nextTarget(tx, facts, at);
    throw new Refused("OCCURRENCE_CLOSED", {
      ...(outcome.target === null ? {} : { target: outcome.target }),
      ...(next === undefined ? {} : { next_target: next }),
    });
  }
  // A link: no account can hold a source until `resolveSource` is built (the plan's section 0.2).
  if (media.kind !== "photo") throw new Refused("NOT_FOUND");
  if (
    uploadId === null ||
    !ownsUpload(upload, userId, at) ||
    upload.purpose !== "drop_photo" ||
    slotId === null ||
    slotSeen === null ||
    !ownsReservation(facts, slotSeen, at) ||
    (input.reservationId !== undefined && input.reservationId !== slotId)
  ) {
    throw new Refused("NOT_FOUND");
  }
  if (upload.state !== "ready") throw new Refused("MEDIA_NOT_READY");
  const duplicate = await bound(tx)`
    SELECT d.id FROM app.drops d JOIN app.uploads u ON u.id = ${uploadId}
     WHERE d.occurrence_id = ${key.day} AND d.author_interval_id = ${key.interval}
       AND d.state IN ('active', 'held') AND d.dedupe_key = u.content_hash
     ORDER BY d.submitted_at, d.id COLLATE "C"
     LIMIT 1`;
  const existing = duplicate[0]?.["id"];
  if (typeof existing === "string") throw new Refused("DUPLICATE_DROP", { existing_drop_id: existing });
  if ((await bound(tx)`SELECT 1 AS used FROM app.drops WHERE upload_id = ${uploadId}`).length > 0) {
    throw new Refused("NOT_FOUND");
  }
  const before = await settleLapsed(tx, key, at);
  const slot = await readSlot(tx, slotId);
  if (slot === null) throw new Error("drops: the reservation this command holds is gone");
  const live = slot.state === "live";
  if (!live) {
    const refusal = limitRefusal(allowanceOf(before, outcome.isStar), "photo");
    if (refusal !== null) {
      const next = await nextTarget(tx, facts, at);
      throw new Refused(refusal, {
        target: outcome.target,
        allowance: allowanceOf(before, outcome.isStar),
        ...(next === undefined ? {} : { next_target: next }),
      });
    }
  }

  // 6. The write.
  const dropId = newId("drp");
  const caption = keptCaption(input.caption);
  await bound(tx)`
    INSERT INTO app.drops (id, occurrence_id, club_id, author_interval_id, media_class, upload_id, dedupe_key, caption,
                           submitted_at, updated_at)
    SELECT ${dropId}, ${key.day}, ${key.club}, ${key.interval}, 'photo', u.id, u.content_hash, ${caption},
           ${at}::pg_catalog.timestamptz, ${at}::pg_catalog.timestamptz
      FROM app.uploads u WHERE u.id = ${uploadId}`;
  await bound(tx)`
    INSERT INTO app.drop_caption_versions (drop_id, drop_version, caption, created_at)
    VALUES (${dropId}, 1, ${caption}, ${at}::pg_catalog.timestamptz)`;
  const row = live ? await consumeSlot(tx, key, slotId, dropId, at) : await takeSlot(tx, key, "photo");
  await bound(tx)`
    INSERT INTO app.drop_audience (drop_id, club_id, interval_id)
    SELECT ${dropId}, m.club_id, m.interval_id FROM app.memberships m
     WHERE m.club_id = ${key.club} AND m.state = 'active'
     ORDER BY m.interval_id COLLATE "C"`;
  await bound(tx)`UPDATE app.drops SET audience_sealed_at = ${at}::pg_catalog.timestamptz WHERE id = ${dropId}`;
  const [pointer] = await bound(tx)`
    SELECT drop_id, version FROM app.highlights WHERE occurrence_id = ${key.day} AND interval_id = ${key.interval}`;
  const highlighted = pointer?.["drop_id"];
  const version = pointer?.["version"];
  if (
    pointer !== undefined &&
    (!(highlighted === null || typeof highlighted === "string") || typeof version !== "number")
  ) {
    throw new Error("drops: a highlight came back in a shape the command doesn't know");
  }

  // 7. The answer.
  const body = render.receipt({
    dropId,
    occurrence: outcome.target,
    mediaClass: "photo",
    version: 1,
    allowance: allowanceOf(row, outcome.isStar),
    highlight:
      pointer === undefined
        ? { dropId: null, version: 0 }
        : { dropId: highlighted as string | null, version: version as number },
  });
  const kept = await completeReceipt(
    tx,
    receipt,
    withStar(body, { membership_id: outcome.target.star.membershipId }),
    201,
  );
  return withStar(kept, render.star(outcome.target.star));
}
