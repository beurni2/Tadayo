/// <reference lib="esnext.temporal" />
// The database's half of preparing an upload: what the worker's `upload.prepare` reads before it fetches the bytes,
// and what it records after (docs/plans/api-b2-spike-prepare.md section 2; TECH-DESIGN section 5, "Media pipeline",
// step 2; spec 33; T12, T21, T54). The bytes, the checks and the renditions are the worker's
// (services/worker/src/prepare.ts and image.ts); this module decides only what the rows say.
//
// `uploadToPrepare` reads with no lock: the work that follows takes seconds of network and CPU, and holding the
// upload's row across it would hold up nothing useful. `recordPreparation` then locks the row `FOR NO KEY UPDATE`,
// as `markPreparing` does (./upload.ts): it changes no key column, so the renditions' foreign keys, whose checks
// lock the upload `FOR KEY SHARE`, never wait on it. Under the lock it reads the state and the expiry again: another
// run of the same event may have recorded first, or the upload may have lapsed during the work, and then nothing is
// written (its renditions, already stored, are found by its key: docs/plans/api-b2-spike-prepare.md section 4.5).
//
// Both say when an upload is still `preparing` but has lapsed: its preparation never finished and never will, and
// the worker ends its event as a dead letter, `upload.lapsed`, so a photo lost that way is never a quiet done (the
// outside audit's B1, reviewed; docs/plans/api-b2-worker-storage-retry.md section 5).

import type { QuerySql } from "../authorization/read-sql.ts";
import { newId } from "../ids.ts";
import type { Clock, ClockSql, ServerNow } from "../time/clock.ts";
import {
  UPLOAD_CONTENT_TYPES,
  UPLOAD_PURPOSES,
  type UploadContentType,
  type UploadPurpose,
  type UploadRejection,
} from "./upload.ts";
import { Fault, InputFault } from "../fault.ts";

/** An upload waiting for its preparation, as the worker needs it. */
export interface UploadToPrepare {
  readonly id: string;
  /** Whose it is: the scoped content hash is keyed by it (T21). */
  readonly ownerUserId: string;
  readonly purpose: UploadPurpose;
  readonly objectKey: string;
  /** The type the intent declared, which the real bytes must be. */
  readonly contentType: UploadContentType;
}

/** A rendition the worker has stored. */
export interface StoredRendition {
  readonly kind: "full" | "display";
  readonly objectKey: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
}

/** What a preparation came to. */
export type Preparation =
  | { readonly state: "rejected"; readonly rejection: UploadRejection }
  | {
      readonly state: "ready" | "held";
      /** HMAC-SHA-256 of the original, keyed by its owner (T21): 32 bytes. */
      readonly contentHash: Uint8Array;
      readonly renditions: readonly StoredRendition[];
    };

type Bound<R> = (
  template: TemplateStringsArray,
  ...values: readonly (string | number | Temporal.Instant | Uint8Array)[]
) => R;

function bound<R>(sql: (template: TemplateStringsArray, ...values: readonly never[]) => R): Bound<R> {
  return sql as Bound<R>;
}

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function oneOf<T extends string>(values: readonly T[], value: unknown, what: string): T {
  if (typeof value === "string" && (values as readonly string[]).includes(value)) return value as T;
  throw new Fault("prepare_1", `media: ${what} came back as something the preparation doesn't know`);
}

/**
 * The upload `id` while it waits for its preparation: `preparing`, and live at `at` (an upload is nobody's from its
 * `expires_at` on: docs/plans/api-b2-spike-uploads.md section 0.6). `lapsed` for one still `preparing` whose
 * `expires_at` has come, whose preparation never finished; null for anything else, which has nothing to prepare. No
 * lock.
 */
export async function uploadToPrepare(
  tx: QuerySql,
  id: string,
  at: ServerNow,
): Promise<UploadToPrepare | "lapsed" | null> {
  if (typeof id !== "string" || !ID.test(id)) throw new InputFault("prepare_2", "media: the upload is an id");
  const rows = await bound(tx)`
    SELECT id, owner_user_id, purpose, object_key, content_type, expires_at > ${at} AS live FROM app.uploads
     WHERE id = ${id} AND state = 'preparing'`;
  const row = rows[0];
  if (row === undefined) return null;
  if (row["live"] !== true) return "lapsed";
  const { owner_user_id: owner, object_key: objectKey } = row;
  if (typeof owner !== "string" || typeof objectKey !== "string") {
    throw new Fault("prepare_3", "media: an upload came back in a shape the preparation doesn't know");
  }
  return {
    id,
    ownerUserId: owner,
    purpose: oneOf(UPLOAD_PURPOSES, row["purpose"], "an upload's purpose"),
    objectKey,
    contentType: oneOf(UPLOAD_CONTENT_TYPES, row["content_type"], "an upload's type"),
  };
}

/**
 * Records `outcome` for the upload `id`, in `tx`: its row `FOR NO KEY UPDATE`, the clock after the lock (T1), and,
 * if it is still `preparing` and live, its renditions' rows and its new state, hash and version, or its rejection.
 * Returns the clock's sample, whether it wrote anything, and whether the upload is still `preparing` but lapsed. An
 * upload no longer `preparing`, or lapsed, is left as it is.
 */
export async function recordPreparation(
  tx: QuerySql & ClockSql,
  clock: Clock,
  id: string,
  outcome: Preparation,
): Promise<{ readonly at: ServerNow; readonly recorded: boolean; readonly lapsed: boolean }> {
  if (typeof id !== "string" || !ID.test(id)) throw new InputFault("prepare_4", "media: the upload is an id");
  const rows = await bound(tx)`SELECT state, expires_at FROM app.uploads WHERE id = ${id} FOR NO KEY UPDATE`;
  const at = await clock.sample(tx);
  const row = rows[0];
  if (row?.["state"] !== "preparing") return { at, recorded: false, lapsed: false };
  const expiresAt = row["expires_at"];
  if (!(expiresAt instanceof Temporal.Instant))
    throw new Fault("prepare_5", "media: an upload came back with no expiry");
  if (Temporal.Instant.compare(expiresAt, at) <= 0) return { at, recorded: false, lapsed: true };
  if (outcome.state === "rejected") {
    await bound(tx)`UPDATE app.uploads SET state = 'rejected', rejection = ${outcome.rejection} WHERE id = ${id}`;
    return { at, recorded: true, lapsed: false };
  }
  if (outcome.contentHash.length !== 32) throw new InputFault("prepare_6", "media: the content hash is 32 bytes");
  for (const rendition of outcome.renditions) {
    await bound(tx)`
      INSERT INTO app.upload_renditions (upload_id, kind, object_key, width, height, byte_size, created_at)
      VALUES (${id}, ${rendition.kind}, ${rendition.objectKey}, ${rendition.width}, ${rendition.height},
              ${rendition.byteSize}, ${at})`;
  }
  // The photo's media_version: random, never derived from the bytes (T21; db/migrations/0006_contributions.sql).
  await bound(tx)`
    UPDATE app.uploads SET state = ${outcome.state}, content_hash = ${outcome.contentHash},
                           content_version = ${newId("mv")}
     WHERE id = ${id}`;
  return { at, recorded: true, lapsed: false };
}
