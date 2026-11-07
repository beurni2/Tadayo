// The worker as a library, for the tests: importing it starts nothing (the entry is main.ts).
export { connect, type WorkerSql } from "./connection.ts";
export { startWorker, type Started } from "./start.ts";
