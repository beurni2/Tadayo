// The worker as a library, for the tests: importing it starts nothing (the entry is main.ts).
export { connect, type WorkerSql } from "./connection.ts";
export {
  describeFailure,
  generationPass,
  LOCK_WAIT_MS,
  passLines,
  STATEMENT_MS,
  type PassResult,
} from "./generation.ts";
export { runLoop, type Loop } from "./loop.ts";
export { startWorker, type Started } from "./start.ts";
