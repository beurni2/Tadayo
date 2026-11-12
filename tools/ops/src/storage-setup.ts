// `storage-setup`: makes the two private buckets and sets what each carries (docs/plans/B0.md, slice
// 10a; TECH-DESIGN sections 1 and 6; T12, T53; D09). `uploads` holds originals, quarantined until
// ready; `renditions` holds what the pipeline makes from them. Both are private, with D09's file-size
// limit (20 MiB) and JPEG, PNG and WebP only, so Storage itself refuses anything else. It makes no
// object policy: the buckets' objects have none (T53), so only the service key reaches them, and the
// clients' only storage URL is the signed upload URL of their own pending upload (T12).
//
// It runs where the service key is, on a Fly machine of the dev app (T56). It can run again: it
// looks at each bucket, makes it when it's missing, and sets it to what is declared when it
// differs, which includes making a public bucket private again. It never deletes a bucket or
// touches an object, and says what it changed, never a key.
//
// Storage answers every error with HTTP 400 and the real status in the body (supabase.ts), and the
// size limit is sent as a whole number of bytes, since a string such as "20MB" is read as decimal.

import { OpsError } from "./ops-error.ts";
import { describe, projectUrl, send, type Caller, type Reply } from "./supabase.ts";

export const BUCKETS = ["uploads", "renditions"] as const;
/** D09: a photo upload is 20 MiB. */
export const FILE_SIZE_LIMIT = 20 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export interface StorageSetupInput {
  readonly fetch: typeof fetch;
  /** The project's URL (`SUPABASE_URL`). */
  readonly url: string;
  readonly serviceKey: string;
  readonly say: (line: string) => void;
}

/** What differs between a bucket and what is declared, as phrases for the report; none when it is as declared. */
function differences(bucket: unknown): string[] {
  const found: string[] = [];
  const record = typeof bucket === "object" && bucket !== null ? (bucket as Record<string, unknown>) : {};
  if (record["public"] !== false) found.push("public");
  const limit = record["file_size_limit"];
  if (limit !== FILE_SIZE_LIMIT) {
    found.push(typeof limit === "number" ? `limit:${String(limit)}` : "limit:none");
  }
  const types = record["allowed_mime_types"];
  if (!Array.isArray(types) || types.length === 0) found.push("types:any");
  else if (types.length !== ALLOWED_TYPES.length || !ALLOWED_TYPES.every((type) => types.includes(type))) {
    found.push("types:other");
  }
  return found;
}

/** The phrase for `differences`' words, as the report says what a bucket was: "it was public". */
function saidBefore(difference: string): string {
  if (difference === "public") return "it was public";
  if (difference === "types:any") return "it allowed any type";
  if (difference === "types:other") return "it allowed other types";
  if (difference === "limit:none") return "it had no size limit";
  return `its size limit was ${difference.slice("limit:".length)} bytes`;
}

function saidAfter(difference: string): string {
  if (difference === "public") return "it is public";
  if (difference === "types:any") return "it allows any type";
  if (difference === "types:other") return "it allows other types";
  if (difference === "limit:none") return "it has no size limit";
  return `its size limit is ${difference.slice("limit:".length)} bytes`;
}

export async function storageSetup(input: StorageSetupInput): Promise<void> {
  const base = projectUrl(input.url);
  const caller: Caller = { kind: "service", key: input.serviceKey };
  const call = (path: string, options: Parameters<typeof send>[3] = {}) =>
    send(input.fetch, base, path, { caller, ...options });
  const fail = (bucket: string, what: string, reply: Reply) =>
    new OpsError(`storage-setup: ${bucket}: ${what}: ${describe(reply)}`);

  const declared = {
    public: false,
    file_size_limit: FILE_SIZE_LIMIT,
    allowed_mime_types: [...ALLOWED_TYPES],
  };

  async function look(bucket: string): Promise<unknown> {
    const reply = await call(`/storage/v1/bucket/${bucket}`);
    if (reply.status === 200) return reply.json;
    // A bucket that isn't there is a 404 in the body; anything else isn't a missing bucket.
    if (reply.logical === 404 && reply.code === "NoSuchBucket") return undefined;
    throw fail(bucket, "couldn't look at it", reply);
  }

  for (const bucket of BUCKETS) {
    let found = await look(bucket);
    let made = false;
    if (found === undefined) {
      const reply = await call("/storage/v1/bucket", {
        method: "POST",
        json: { id: bucket, name: bucket, ...declared },
      });
      // Another run made it between the look and now: it is there, and is set below.
      if (reply.status === 200) made = true;
      else if (reply.logical !== 409) throw fail(bucket, "couldn't make it", reply);
      found = await look(bucket);
      if (found === undefined) throw new OpsError(`storage-setup: ${bucket}: it isn't there after it was made`);
    }
    const before = differences(found);
    if (before.length > 0) {
      const reply = await call(`/storage/v1/bucket/${bucket}`, { method: "PUT", json: declared });
      if (reply.status !== 200) throw fail(bucket, "couldn't set it", reply);
      const after = differences(await look(bucket));
      if (after.length > 0) {
        throw new OpsError(
          `storage-setup: ${bucket} isn't as declared after the update: ${after.map(saidAfter).join("; ")}`,
        );
      }
    }
    if (made && before.length === 0) input.say(`storage-setup: ${bucket}: created`);
    else if (before.length === 0) input.say(`storage-setup: ${bucket}: already as declared`);
    else input.say(`storage-setup: ${bucket}: changed: ${before.map(saidBefore).join("; ")}`);
  }
}
