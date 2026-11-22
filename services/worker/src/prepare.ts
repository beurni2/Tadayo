/// <reference lib="esnext.temporal" />
// The worker's `upload.prepare` handler: what `completeUpload` starts (docs/plans/api-b2-spike-prepare.md section 2;
// TECH-DESIGN section 5, "Media pipeline", step 2; spec 33; T12, T21, T52, T54). The event is `markPreparing`'s
// (packages/domain/src/media/upload.ts): dedupe key `upload.prepare:<upload id>`, payload `{ upload_id }`.
//
// 1. The payload's upload id, else failed for good (`payload`).
// 2. The upload, with no lock (`uploadToPrepare`): `preparing` and live, else nothing to do. So a repeat of the event,
//    or an event whose upload another run already prepared, changes nothing (T54).
// 3. Its purpose: a drop's photo (`drop_photo`, `replacement`) gets `full` and `display`. The avatar's and a photo
//    message's renditions aren't built, and their uploads can't be made yet, so their events fail for good.
// 4. The original from `uploads`, to at most 20 MiB and a byte (./storage.ts). Not there: rejected `unreadable`, as
//    `completeUpload` saw it there and it won't come back. Storage away: a failure, tried again.
// 5. The checks and the renditions (./image.ts), then the safety provider on a photo that passed (./safety.ts, FQ8),
//    then each rendition stored in `renditions`, at its upload's key and its kind, before anything is recorded.
// 6. One transaction (`recordPreparation`): the upload's row `FOR NO KEY UPDATE`, still `preparing`, then its
//    renditions' rows and its state, scoped hash and version, or its rejection; and the event done, in the same
//    transaction.
//
// Each step is bounded: Storage's calls by their time limit, each decode by its own (./image.ts), each statement by
// generation's limits. A line says what it came to and how long each step took, with the process's peak memory, for
// spike S2 (the plan's section 6): the upload's opaque id, never its owner, its key or anything of the photo (T52).

import { recordPreparation, stopwatch, uploadToPrepare, type Clock, type Preparation } from "@tadayo/domain";
import type { WorkerSql, WorkerTx } from "./connection.ts";
import { LOCK_WAIT_MS, STATEMENT_MS } from "./generation.ts";
import { contentHash, prepareImage, type Prepared } from "./image.ts";
import { FailedForGood, finishEvent, type Handler, type OutboxEvent } from "./outbox.ts";
import type { SafetyProvider } from "./safety.ts";
import { renditionKey, type WorkerStorage } from "./storage.ts";

/** The event `completeUpload` writes. */
export const PREPARE_TOPIC = "upload.prepare";

/** `app.id`'s pattern (db/migrations/0002_shared_rules.sql). */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The purposes whose renditions are a drop's photo's (TECH-DESIGN section 1, "Images"). */
const DROP_PHOTO = new Set(["drop_photo", "replacement"]);

export interface PrepareDeps {
  readonly sql: WorkerSql;
  readonly clock: Clock;
  readonly storage: WorkerStorage;
  readonly safety: SafetyProvider;
  /** Where the line of each preparation goes. */
  readonly say: (line: string) => void;
  /** The process's peak memory so far, in bytes; `process.resourceUsage().maxRSS` unless the tests give one. */
  readonly peakBytes?: () => number;
}

/** What a preparation came to, for its line. */
export interface Prepping {
  readonly upload: string;
  /** `skipped` when there was nothing to prepare, or another run recorded first. */
  readonly outcome: Preparation["state"] | "skipped";
  readonly rejection?: string;
  readonly ms: {
    readonly total: number;
    readonly read: number;
    readonly image: number;
    readonly store: number;
    readonly record: number;
  };
}

function uploadIdOf(payload: unknown): string {
  const id =
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>)["upload_id"] : undefined;
  if (typeof id !== "string" || !ID.test(id)) throw new FailedForGood("payload");
  return id;
}

const MiB = 1024 * 1024;

/** The line of one preparation: its opaque id, its outcome, its times and the peak memory, nothing else (T52). */
export function preparedLine(prepping: Prepping, peakBytes: number): string {
  const { ms } = prepping;
  const outcome = prepping.outcome === "rejected" ? `rejected ${prepping.rejection ?? ""}` : prepping.outcome;
  return (
    `worker: prepared an upload ${prepping.upload} in ${String(ms.total)} ms ` +
    `(read ${String(ms.read)}, image ${String(ms.image)}, store ${String(ms.store)}, record ${String(ms.record)}), ` +
    `${outcome}, peak memory ${String(Math.round(peakBytes / MiB))} MiB`
  );
}

/** Prepares the upload `event` names (steps 1 to 6 above), and says how it went. */
export async function prepareUpload(deps: PrepareDeps, event: OutboxEvent): Promise<Prepping> {
  const total = stopwatch();
  const id = uploadIdOf(event.payload);
  const { sql, clock } = deps;
  const limits = (tx: WorkerTx) => tx`
    SELECT pg_catalog.set_config('lock_timeout', ${`${String(LOCK_WAIT_MS)}ms`}, true),
           pg_catalog.set_config('statement_timeout', ${`${String(STATEMENT_MS)}ms`}, true)`;

  const upload = await sql.begin(async (tx) => {
    await limits(tx);
    return uploadToPrepare(tx, id, await clock.sample(tx));
  });
  const ms = { read: 0, image: 0, store: 0, record: 0 };
  if (upload === null) return { upload: id, outcome: "skipped", ms: { ...ms, total: total() } };
  if (!DROP_PHOTO.has(upload.purpose)) throw new FailedForGood(`purpose.${upload.purpose}`);

  let step = stopwatch();
  const original = await deps.storage.readOriginal(upload.objectKey);
  ms.read = step();

  step = stopwatch();
  const prepared: Prepared =
    original === null ? { ok: false, rejection: "unreadable" } : await prepareImage(original, upload.contentType);
  let outcome: Preparation;
  if (!prepared.ok || original === null) {
    outcome = { state: "rejected", rejection: prepared.ok ? "unreadable" : prepared.rejection };
    ms.image = step();
  } else {
    const verdict = await deps.safety.screen(original);
    ms.image = step();
    step = stopwatch();
    const renditions = [];
    for (const rendition of prepared.renditions) {
      const objectKey = renditionKey(upload.objectKey, rendition.kind);
      await deps.storage.putRendition(objectKey, rendition.bytes);
      renditions.push({
        kind: rendition.kind,
        objectKey,
        width: rendition.width,
        height: rendition.height,
        byteSize: rendition.bytes.length,
      });
    }
    ms.store = step();
    outcome = {
      state: verdict === "hold" ? "held" : "ready",
      contentHash: contentHash(upload.ownerUserId, original),
      renditions,
    };
  }

  step = stopwatch();
  const recorded = await sql.begin(async (tx) => {
    await limits(tx);
    const { at, recorded: wrote } = await recordPreparation(tx, clock, id, outcome);
    await finishEvent(tx, event.id, at);
    return wrote;
  });
  ms.record = step();
  return {
    upload: id,
    outcome: recorded ? outcome.state : "skipped",
    ...(recorded && outcome.state === "rejected" ? { rejection: outcome.rejection } : {}),
    ms: { ...ms, total: total() },
  };
}

/** The handler the outbox runs for `upload.prepare`: prepares, then writes the preparation's line. */
export function prepareHandler(deps: PrepareDeps): Handler {
  const peak = deps.peakBytes ?? (() => process.resourceUsage().maxRSS * 1024);
  return async (event) => {
    const prepping = await prepareUpload(deps, event);
    if (prepping.outcome !== "skipped") deps.say(preparedLine(prepping, peak()));
  };
}
