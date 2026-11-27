// The worker's Storage client: it reads an upload's original from the private bucket `uploads` and puts its
// renditions in the private bucket `renditions` (docs/plans/api-b2-spike-prepare.md section 5; TECH-DESIGN sections
// 5 and 6; ADR-009; T12, T52, T53, T56). It holds the service key, which only the API and the worker have (Fly
// secrets), and reaches one object at a time, by a key the server made.
//
// What it knows of Storage, from the Supabase probe's runs on `dev` after every deploy (tools/ops/src/supabase-probe.ts):
// - `GET /storage/v1/object/authenticated/<bucket>/<key>` with the service key answers the object's bytes ("the
//   service key reads the object back"), or, for an object it doesn't have, Storage's own not-found: HTTP 400 and a
//   body of `statusCode` "404" and `code` "NoSuchKey" ("the service key reads no original never put in uploads").
//   Only that is an original gone. A plain 404, as a proxy's, one with no Storage body, a missing bucket
//   (`NoSuchBucket`) and an object Storage's table has and its backend lost (`S3Error`) are Storage away, waited out
//   (the outside audit's B1; docs/plans/api-b2-worker-storage-retry.md section 1.1).
// - `POST /storage/v1/object/<bucket>/<key>` with the service key and `x-upsert: true` puts the bytes at that key,
//   over any that are there ("the service key puts a rendition, and puts over it"). Upsert is on for renditions
//   alone: only the service key can write them, and a preparation tried again writes over its own objects, so no try
//   leaves an object that no row names (the plan's section 4.5).
// - Storage answers every error with HTTP 400 and the real status in the body's `statusCode`, read by `storageStatus`
//   (packages/domain/src/media/storage-http.ts), which the API's client reads with too.
//
// An original is read to at most 20 MiB and a byte (D09), then the read stops: a larger object is refused as
// too_large by the checks (./image.ts) and never held whole. Every call refuses redirects and has a time limit.
// Nothing it is given or answers is logged or put in an error: not the key, a URL or an object's key (T52, T56). A
// failure is a `StorageUnavailable`, an `Unavailable` whose code the outbox records, and the preparation is waited out
// and tried again (./outbox.ts, item 4).

import { storageProject, storageServiceKey, storageStatus, UPLOAD_MAX_BYTES } from "@tadayo/domain";
import type { RenditionKind } from "./image-process.ts";
import { Unavailable } from "./outbox.ts";

/** The bucket of originals, private (tools/ops/src/storage-setup.ts). */
export const UPLOADS_BUCKET = "uploads";
/** The bucket of what the pipeline makes, private. */
export const RENDITIONS_BUCKET = "renditions";

const TIMEOUT_MS = 30_000;

/** An upload's object key as the server makes it (packages/domain/src/media/object.ts). */
const OBJECT_KEY = /^[A-Za-z0-9_-]{32}$/;
/** A rendition's key: its upload's object key and its kind. */
const RENDITION_KEY = /^[A-Za-z0-9_-]{32}\/(?:full|display)$/;

/** What the preparation asks of Storage. */
export interface WorkerStorage {
  /** The original's bytes, cut off past 20 MiB and a byte; or null when Storage says it has no such object. */
  readOriginal(objectKey: string): Promise<Uint8Array | null>;
  /** Puts a rendition's JPEG at `key` (`renditionKey`), over any bytes there. */
  putRendition(key: string, bytes: Uint8Array): Promise<void>;
}

/** Storage couldn't be asked, or answered something this client doesn't believe. Its message names no value. */
export class StorageUnavailable extends Unavailable {
  constructor(what: string) {
    super("storage.unavailable", `storage: ${what}`);
    this.name = "StorageUnavailable";
  }
}

/**
 * Whether an answer is Storage's own not-found of an object (`ERRORS.NoSuchKey` in Storage's sources): its status 404
 * in the body and its code NoSuchKey. Nothing else is, whatever its HTTP status.
 */
function noSuchKey(json: unknown): boolean {
  if (typeof json !== "object" || json === null) return false;
  const body = json as Record<string, unknown>;
  return storageStatus(0, json) === 404 && body["code"] === "NoSuchKey";
}

/**
 * A rendition's key in `renditions`: its upload's object key, then its kind. Derived from a key that is random and
 * never leaves the server but inside the upload's own signed URL (T12, T21), so it says nothing of the account, the
 * day or the bytes; and B3's purge finds every rendition of an upload from the upload alone.
 */
export function renditionKey(objectKey: string, kind: RenditionKind): string {
  if (!OBJECT_KEY.test(objectKey)) throw new TypeError("storage: an object key is 32 base64url characters");
  return `${objectKey}/${kind}`;
}

/** The first `limit` bytes of a body and no more: the read stops there. */
async function readUpTo(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array> {
  if (body === null) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    // Past the limit the rest is never read; a body read to its end is already closed.
    await reader.cancel().catch(() => undefined);
  }
  const bytes = Buffer.concat(chunks, total);
  return total > limit ? bytes.subarray(0, limit) : bytes;
}

export interface WorkerStorageOptions {
  /** The project's URL (`SUPABASE_URL`). */
  readonly projectUrl: string;
  /** The service key (`SUPABASE_SERVICE_KEY`), from Fly secrets (T56). */
  readonly serviceKey: string;
  readonly fetch?: typeof fetch;
}

/** The client against a hosted project. */
export function workerStorage(options: WorkerStorageOptions): WorkerStorage {
  const base = storageProject(options.projectUrl, "worker");
  const key = storageServiceKey(options.serviceKey, "worker");
  const send = options.fetch ?? fetch;
  const auth = { apikey: key, authorization: `Bearer ${key}` };

  async function call(path: string, init: RequestInit, what: string): Promise<Response> {
    try {
      return await send(`${base}${path}`, { ...init, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new StorageUnavailable(`${what} got no answer`);
    }
  }

  async function jsonOf(response: Response): Promise<unknown> {
    try {
      return JSON.parse(await response.text()) as unknown;
    } catch {
      return undefined;
    }
  }

  return {
    async readOriginal(objectKey) {
      if (!OBJECT_KEY.test(objectKey)) throw new TypeError("storage: an object key is 32 base64url characters");
      const response = await call(
        `/storage/v1/object/authenticated/${UPLOADS_BUCKET}/${objectKey}`,
        { method: "GET", headers: auth },
        "reading an original",
      );
      if (response.status !== 200) {
        const json = await jsonOf(response);
        if (noSuchKey(json)) return null;
        throw new StorageUnavailable(`reading an original answered ${String(storageStatus(response.status, json))}`);
      }
      try {
        return await readUpTo(response.body, UPLOAD_MAX_BYTES + 1);
      } catch {
        throw new StorageUnavailable("reading an original broke off");
      }
    },

    async putRendition(renditionAt, bytes) {
      if (!RENDITION_KEY.test(renditionAt))
        throw new TypeError("storage: a rendition's key is its upload's key and kind");
      const response = await call(
        `/storage/v1/object/${RENDITIONS_BUCKET}/${renditionAt}`,
        {
          method: "POST",
          headers: { ...auth, "content-type": "image/jpeg", "x-upsert": "true" },
          body: bytes,
        },
        "putting a rendition",
      );
      const logical = storageStatus(response.status, await jsonOf(response));
      if (response.status !== 200 || logical !== 200) {
        throw new StorageUnavailable(`putting a rendition answered ${String(logical)}`);
      }
    },
  };
}
