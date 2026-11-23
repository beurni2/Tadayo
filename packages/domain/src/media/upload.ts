/// <reference lib="esnext.temporal" />
// Starting a drop's photo upload, reading it, and handing it to preparation (the contract's `createUpload` for
// `drop_photo`, `getUpload` and `completeUpload`; spec 11, 32, 33; TECH-DESIGN sections 5 and 6; T1, T3, T4,
// T9, T12, T14, T15, T17, T18, T19, T52, T54; docs/plans/api-b2-spike-uploads.md). Each runs in one READ
// COMMITTED transaction the caller opens. A refusal throws `Refused`, which rolls it back, so a refused
// request leaves nothing, its receipt included.
//
// `createDropPhotoUpload`, one command (TECH-DESIGN section 5):
// 1. Who may, with no lock: the reservation's day, by who may add to it (../authorization/add-target.ts), and
//    whose the reservation is (`ownsReservation`, the rule `releaseReservation` uses). Anyone else's slot, an
//    earlier interval's after a rejoin, a former member's and a guessed id get the neutral NOT_FOUND, before
//    the receipt (T14).
// 2. The receipt (T19), as `createReservation`'s: a replay returns its stored answer, and the route signs a new
//    URL for the same object while the upload is pending (TECH-DESIGN section 6).
// 3. The locks, in TECH-DESIGN's order: the club's row, the day's and the caller's and the star's membership
//    rows `FOR SHARE` (../drops/reserve.ts `lockDay`), the counter `FOR NO KEY UPDATE` (../drops/counter.ts),
//    then the reservation `FOR SHARE`. Every change of a reservation's state happens under its counter's lock,
//    so its state read after it is final for this command. The rule for anything that writes a drop's photo
//    upload: the counter's lock before the insert, whose guard reads the reservation `FOR SHARE` (migration
//    0016). A release takes the same two in the same order (../drops/release.ts), so neither waits on the other
//    while holding what the other needs.
// 4. The clock, sampled after the locks (T1, T3).
// 5. The rule again, on the facts read under the locks: `ownsReservation`, else NOT_FOUND (a leave, a
//    suspension or a rejoin came in between); MEMBERSHIP_CHANGED for a held day (FQ63); from the reveal on,
//    OCCURRENCE_CLOSED with the day and the same person's next day (T3, T4); then the reservation live at the
//    sample, for a photo, else NOT_FOUND: released, used, or lapsed at its `expires_at`, settled or not; and
//    holding no upload but rejected ones, else NOT_FOUND: one slot, one photo, so one live slot can't make any
//    number of objects (migration 0016's index is the last guard). After a rejection the same slot takes
//    another photo. Nothing is settled here: the counts are the reservation's and the commit's business.
// 6. The upload, pending, for one random object (./object.ts), living 24 hours.
// 7. The answer, with no URL, stored in the receipt. The URL is the route's, signed after the commit and never
//    stored (T12; the plan's section 0.3).
//
// `readOwnUpload` and `markPreparing`: the caller's own upload while it lives, and nobody else's
// (../authorization/upload.ts `ownsUpload`; T9, T12, T14). A replay signs only for an upload `ownsUpload` gives.

import { addTargetOutcome, loadAddTarget, ownsReservation } from "../authorization/add-target.ts";
import type { QuerySql } from "../authorization/read-sql.ts";
import { ownsUpload } from "../authorization/upload.ts";
import { lockCounter, type CounterKey } from "../drops/counter.ts";
import { lockDay, nextTarget } from "../drops/reserve.ts";
import { completeReceipt, reserveAsMember, type ReceiptKey } from "../idempotency/receipt.ts";
import type { Json } from "../idempotency/request.ts";
import { newId } from "../ids.ts";
import { Refused } from "../refused.ts";
import type { Clock, ClockSql, ServerNow } from "../time/clock.ts";
import { UPLOAD_MAX_BYTES } from "./limits.ts";
import { newObjectKey, uploadExpiry } from "./object.ts";

export const UPLOAD_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];
export const UPLOAD_PURPOSES = ["drop_photo", "replacement", "avatar", "conversation_photo"] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];
export const UPLOAD_STATES = ["pending", "preparing", "ready", "held", "rejected"] as const;
export type UploadState = (typeof UPLOAD_STATES)[number];
export const UPLOAD_REJECTIONS = ["unsupported_type", "too_large", "too_many_pixels", "unreadable"] as const;
export type UploadRejection = (typeof UPLOAD_REJECTIONS)[number];
export { UPLOAD_MAX_BYTES };

export interface CreateDropPhotoUploadInput {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The `Idempotency-Key`, a UUID, created when the action started and reused on every retry. */
  readonly key: string;
  /** The body's reservation. */
  readonly reservationId: string;
  readonly contentType: UploadContentType;
  /** The declared size in bytes, 1 to 20 MiB. */
  readonly byteSize: number;
}

/** The caller's own upload: the contract's UploadStatus, and `Upload` without its URL. */
export interface UploadAnswer {
  readonly id: string;
  readonly purpose: UploadPurpose;
  readonly state: UploadState;
  readonly rejection: UploadRejection | null;
  readonly expiresAt: Temporal.Instant;
}

/** What the route signs for a pending upload: its object, its type, the clock's sample and its own lapse. */
export interface ToSign {
  readonly objectKey: string;
  readonly contentType: UploadContentType;
  readonly at: ServerNow;
  /** The upload's `expires_at`: its signed URL is given as good until then at the latest. */
  readonly expiresAt: Temporal.Instant;
}

/** What `createDropPhotoUpload` leaves the route: the answer as the receipt keeps it, and what to sign. */
export interface MadeUpload {
  readonly body: Json;
  /**
   * What to sign, when the upload is still pending and live at the clock's sample, so the route signs a URL for
   * it; null when it isn't, and the answer carries no URL (TECH-DESIGN section 6).
   */
  readonly toSign: ToSign | null;
}

/** The caller's own live upload, with its object, which only the route's Storage calls use. */
export interface OwnUpload {
  readonly answer: UploadAnswer;
  readonly objectKey: string;
}

type Bound<R> = (template: TemplateStringsArray, ...values: readonly (string | number | Temporal.Instant)[]) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkCaller(userId: unknown): void {
  if (typeof userId !== "string" || !ID.test(userId)) throw new TypeError("media: the caller is an account id");
}

function check(input: CreateDropPhotoUploadInput): void {
  checkCaller(input.userId);
  if (typeof input.key !== "string" || !UUID.test(input.key)) {
    throw new TypeError("media: the idempotency key is a UUID");
  }
  if (typeof input.reservationId !== "string") throw new TypeError("media: the reservation is an id");
  if (!(UPLOAD_CONTENT_TYPES as readonly string[]).includes(input.contentType)) {
    throw new TypeError("media: the type is JPEG, PNG or WebP");
  }
  if (!Number.isInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > UPLOAD_MAX_BYTES) {
    throw new TypeError("media: the size is 1 byte to 20 MiB");
  }
}

function instantOf(value: unknown, what: string): Temporal.Instant {
  if (value instanceof Temporal.Instant) return value;
  throw new Error(`media: ${what} came back as no instant`);
}

function oneOf<T extends string>(values: readonly T[], value: unknown, what: string): T {
  if (typeof value === "string" && (values as readonly string[]).includes(value)) return value as T;
  throw new Error(`media: ${what} came back as something the command doesn't know`);
}

interface UploadRow extends OwnUpload {
  readonly owner: string;
  readonly expiresAt: Temporal.Instant;
  readonly contentType: UploadContentType;
}

function uploadOf(row: Readonly<Record<string, unknown>> | undefined): UploadRow | null {
  if (row === undefined) return null;
  const { id, owner_user_id: owner, object_key: objectKey, rejection } = row;
  if (typeof id !== "string" || typeof owner !== "string" || typeof objectKey !== "string") {
    throw new Error("media: an upload came back in a shape the command doesn't know");
  }
  const expiresAt = instantOf(row["expires_at"], "an upload's expiry");
  return {
    owner,
    objectKey,
    expiresAt,
    contentType: oneOf(UPLOAD_CONTENT_TYPES, row["content_type"], "an upload's type"),
    answer: {
      id,
      purpose: oneOf(UPLOAD_PURPOSES, row["purpose"], "an upload's purpose"),
      state: oneOf(UPLOAD_STATES, row["state"], "an upload's state"),
      rejection: rejection === null ? null : oneOf(UPLOAD_REJECTIONS, rejection, "an upload's rejection"),
      expiresAt,
    },
  };
}

/**
 * The upload `id`, with no lock or `FOR NO KEY UPDATE`: `markPreparing` changes only its state, never a key, so
 * the foreign keys that name an upload (`app.drops.upload_id` and `pending_upload_id`,
 * `app.upload_renditions.upload_id`), whose checks lock it `FOR KEY SHARE`, aren't kept waiting, as they would be
 * under `FOR UPDATE` (tests/src/db/uploads.test.ts).
 */
async function uploadById(tx: QuerySql, id: string, lock: "" | "FOR NO KEY UPDATE"): Promise<UploadRow | null> {
  const rows =
    lock === ""
      ? await bound(tx)`SELECT id, owner_user_id, purpose, state, rejection, expires_at, object_key, content_type
                          FROM app.uploads WHERE id = ${id}`
      : await bound(tx)`SELECT id, owner_user_id, purpose, state, rejection, expires_at, object_key, content_type
                          FROM app.uploads WHERE id = ${id} FOR NO KEY UPDATE`;
  return uploadOf(rows[0]);
}

function toSignOf(row: UploadRow, at: ServerNow): ToSign {
  return { objectKey: row.objectKey, contentType: row.contentType, at, expiresAt: row.expiresAt };
}

interface SlotRow {
  readonly day: string;
  readonly interval: string;
  readonly mediaClass: string;
  readonly state: string;
  readonly expiresAt: Temporal.Instant;
}

function slotOf(row: Readonly<Record<string, unknown>> | undefined): SlotRow | null {
  if (row === undefined) return null;
  const { occurrence_id: day, interval_id: interval, media_class: mediaClass, state } = row;
  if (
    typeof day !== "string" ||
    typeof interval !== "string" ||
    typeof mediaClass !== "string" ||
    typeof state !== "string"
  ) {
    throw new Error("media: a reservation came back in a shape the command doesn't know");
  }
  return { day, interval, mediaClass, state, expiresAt: instantOf(row["expires_at"], "a reservation's expiry") };
}

async function slotById(tx: QuerySql, id: string, lock: "" | "FOR SHARE"): Promise<SlotRow | null> {
  const rows =
    lock === ""
      ? await bound(tx)`SELECT occurrence_id, interval_id, media_class, state, expires_at
                          FROM app.reservations WHERE id = ${id}`
      : await bound(tx)`SELECT occurrence_id, interval_id, media_class, state, expires_at
                          FROM app.reservations WHERE id = ${id} FOR SHARE`;
  return slotOf(rows[0]);
}

/**
 * Makes a pending upload for a drop's photo under the caller's live photo reservation, in `tx`, and returns what
 * `render` makes of it, as the receipt keeps it, with the object to sign. Throws `Refused`.
 */
export async function createDropPhotoUpload(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: CreateDropPhotoUploadInput,
  render: (upload: UploadAnswer) => Json,
): Promise<MadeUpload> {
  check(input);
  const { userId, reservationId } = input;
  // An id that can't be one names no reservation, as one nobody has.
  if (!ID.test(reservationId)) throw new Refused("NOT_FOUND");
  const receipt: ReceiptKey = {
    userId,
    key: input.key,
    request: {
      operation: "createUpload",
      path: {},
      query: {},
      body: {
        purpose: "drop_photo",
        reservation_id: reservationId,
        content_type: input.contentType,
        byte_size: input.byteSize,
      },
    },
  };

  // 1. Who may, with no lock.
  const first = await clock.sample(tx);
  const seen = await slotById(tx, reservationId, "");
  if (seen === null) throw new Refused("NOT_FOUND");
  const facts = await loadAddTarget(tx, userId, seen.day);
  if (!ownsReservation(facts, seen.interval, first)) throw new Refused("NOT_FOUND");
  const interval = seen.interval;

  // 2. The receipt.
  const stored = await reserveAsMember(tx, receipt, first, interval);
  if (stored !== null) {
    const id = (stored.replay as { readonly id?: unknown } | null)?.id;
    if (typeof id !== "string") throw new Error("media: a stored upload answer names no upload");
    const upload = await uploadById(tx, id, "");
    const pending = ownsUpload(upload, userId, first) && upload.answer.state === "pending";
    return { body: stored.replay, toSign: pending ? toSignOf(upload, first) : null };
  }

  // 3. The locks.
  await lockDay(tx, facts, interval);
  const key: CounterKey = { day: seen.day, interval, club: facts.day.clubId };
  await lockCounter(tx, key);
  const slot = await slotById(tx, reservationId, "FOR SHARE");
  if (slot === null) throw new Error("media: the reservation this command holds is gone");

  // 4. The clock.
  const at = await clock.sample(tx);

  // 5. The rule again, under the locks.
  const again = await loadAddTarget(tx, userId, seen.day);
  if (!ownsReservation(again, interval, at)) throw new Refused("NOT_FOUND");
  const outcome = addTargetOutcome(again, at);
  if (outcome.kind === "held") throw new Refused("MEMBERSHIP_CHANGED");
  if (outcome.kind === "closed") {
    const next = await nextTarget(tx, again, at);
    throw new Refused("OCCURRENCE_CLOSED", {
      ...(outcome.target === null ? {} : { target: outcome.target }),
      ...(next === undefined ? {} : { next_target: next }),
    });
  }
  if (slot.state !== "live" || slot.mediaClass !== "photo" || Temporal.Instant.compare(at, slot.expiresAt) >= 0) {
    throw new Refused("NOT_FOUND");
  }
  const holding = await bound(tx)`
    SELECT id FROM app.uploads WHERE reservation_id = ${reservationId} AND state <> 'rejected' LIMIT 1`;
  if (holding.length > 0) throw new Refused("NOT_FOUND");

  // 6. The upload.
  const id = newId("upl");
  const objectKey = newObjectKey();
  const expiresAt = uploadExpiry(at);
  await bound(tx)`
    INSERT INTO app.uploads (id, owner_user_id, purpose, reservation_id, content_type, byte_size, object_key,
                             created_at, expires_at)
    VALUES (${id}, ${userId}, 'drop_photo', ${reservationId}, ${input.contentType}, ${input.byteSize}, ${objectKey},
            ${at}, ${expiresAt})`;

  // 7. The answer.
  const body = render({ id, purpose: "drop_photo", state: "pending", rejection: null, expiresAt });
  return {
    body: await completeReceipt(tx, receipt, body, 201),
    toSign: { objectKey, contentType: input.contentType, at, expiresAt },
  };
}

export interface OwnUploadInput {
  /** The account the gate loaded. */
  readonly userId: string;
  /** The path's upload. */
  readonly uploadId: string;
}

/** The caller's own upload while it lives, with no lock, read in `tx` at `now`. Throws `Refused` NOT_FOUND. */
export async function readOwnUpload(tx: QuerySql, input: OwnUploadInput, now: ServerNow): Promise<OwnUpload> {
  checkCaller(input.userId);
  if (typeof input.uploadId !== "string") throw new TypeError("media: the upload is an id");
  if (!ID.test(input.uploadId)) throw new Refused("NOT_FOUND");
  const row = await uploadById(tx, input.uploadId, "");
  if (!ownsUpload(row, input.userId, now)) throw new Refused("NOT_FOUND");
  return { answer: row.answer, objectKey: row.objectKey };
}

/**
 * Hands the caller's own pending upload to preparation, in `tx`: its row `FOR NO KEY UPDATE`, the clock after the
 * lock, and, still pending, `preparing` with an `upload.prepare` event, once (T54). An upload past pending is
 * answered as it is. The route has asked Storage that its bytes are there first. Throws `Refused` NOT_FOUND.
 */
export async function markPreparing(
  tx: QuerySql & ClockSql,
  clock: Clock,
  input: OwnUploadInput,
): Promise<UploadAnswer> {
  checkCaller(input.userId);
  if (typeof input.uploadId !== "string") throw new TypeError("media: the upload is an id");
  if (!ID.test(input.uploadId)) throw new Refused("NOT_FOUND");
  const row = await uploadById(tx, input.uploadId, "FOR NO KEY UPDATE");
  const at = await clock.sample(tx);
  if (!ownsUpload(row, input.userId, at)) throw new Refused("NOT_FOUND");
  if (row.answer.state !== "pending") return row.answer;
  await bound(tx)`UPDATE app.uploads SET state = 'preparing' WHERE id = ${row.answer.id}`;
  await bound(tx)`
    INSERT INTO app.outbox_events (id, topic, dedupe_key, payload, available_at, created_at)
    VALUES (${newId("evt")}, 'upload.prepare', ${`upload.prepare:${row.answer.id}`},
            ${JSON.stringify({ upload_id: row.answer.id })}::pg_catalog.text::pg_catalog.jsonb, ${at}, ${at})
    ON CONFLICT (dedupe_key) DO NOTHING`;
  return { ...row.answer, state: "preparing" };
}
