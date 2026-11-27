// The worker as a library, for the tests: importing it starts nothing (the entry is main.ts). Importing it does
// restrict `sharp`'s decoders in this process, through ./image.ts, which is what every use of it here needs; the
// worker itself decodes only in a photo's own process (./image-process.ts).
export { connect, type WorkerSql, type WorkerTx } from "./connection.ts";
export {
  describeFailure,
  generationPass,
  LOCK_WAIT_MS,
  passLines,
  STATEMENT_MS,
  type PassResult,
} from "./generation.ts";
export {
  MAX_HELD_BYTES,
  MAX_JPEG_SCANS,
  MAX_PIXELS,
  MAX_WEBP_CHUNKS,
  prepareImage,
  signatureOf,
  type Prepared,
  type Rendition,
} from "./image.ts";
export {
  DEADLINE_SECONDS,
  DECODE_SECONDS,
  ImageProcessFailed,
  ImageTimeout,
  PEAK_BYTES,
  prepareIsolated,
  RENDITION_BOXES,
  RENDITION_KINDS,
  type ProcessAnswer,
  type RenditionKind,
} from "./image-process.ts";
export { runLoop, type Loop } from "./loop.ts";
export {
  backoffSeconds,
  BACKOFF_SECONDS,
  claimNext,
  FailedForGood,
  failureCode,
  finishEvent,
  LEASE_SECONDS,
  MAX_ATTEMPTS,
  OUTAGE_SECONDS,
  OUTAGE_WAIT_SECONDS,
  outageWaitSeconds,
  outboxPass,
  Unavailable,
  type Claim,
  type Handler,
  type OutboxEvent,
  type OutboxPassOptions,
  type OutboxPassResult,
} from "./outbox.ts";
export {
  contentHash,
  MISSING_REJECTED_AT,
  OriginalMissing,
  PREPARE_TOPIC,
  prepareHandler,
  preparedLine,
  prepareUpload,
  type PrepareDeps,
  type Prepping,
} from "./prepare.ts";
export { noSafetyProvider, type SafetyProvider, type SafetyVerdict } from "./safety.ts";
export { startWorker, type Started } from "./start.ts";
export {
  RENDITIONS_BUCKET,
  renditionKey,
  StorageUnavailable,
  UPLOADS_BUCKET,
  workerStorage,
  type WorkerStorage,
} from "./storage.ts";
