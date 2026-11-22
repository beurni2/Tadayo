// The worker as a library, for the tests: importing it starts nothing (the entry is main.ts). Importing it does
// restrict `sharp`'s decoders, through ./image.ts, which is what every use of it here needs.
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
  contentHash,
  DECODE_SECONDS,
  ImageTimeout,
  MAX_PIXELS,
  prepareImage,
  RENDITION_KINDS,
  signatureOf,
  type Prepared,
  type Rendition,
  type RenditionKind,
} from "./image.ts";
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
  outboxPass,
  type Claim,
  type Handler,
  type OutboxEvent,
  type OutboxPassResult,
} from "./outbox.ts";
export {
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
