# The entries' signal handlers before their ready lines: `api/b0-entry-signal-order`

The api lane's plan for a small fix, written before the change and pasted into the PR's Plan section.

## What failed

`ci` run 43529336129 (job 132242848121, 23:45 UTC on 2026-11-13, on the ios lane's `ios/b0-ios26-glassprobe`, which changes no api code): `tests/src/db/startup.test.ts`, "the worker's entry against the test database > stops on SIGTERM with exit code 0, and says which", `expected null to be +0`: the worker's process ended with no exit code, as a process does when a signal's default action ends it. 316 of 317 passed; the same test passed on the runs before and after it.

## Why

`services/worker/src/main.ts` writes `worker: started, with no jobs yet` and only then installs its `SIGTERM` and `SIGINT` handlers (`process.once`). The test sends the signal as soon as it reads that line. The two are a few statements apart in the same synchronous run, but a busy runner can deschedule the worker between the `write` and the `once`, and a signal that arrives then finds no handler: the default action ends the process, with no exit code. `services/api/src/main.ts` has the same order: it writes `api: listening at` before `stopOnSignal` installs its handlers (`services/api/src/shutdown.ts`, synchronously in its body). Outside the tests the fix closes only those few statements: a signal sent once the line is written finds the handlers in place. A signal earlier in start-up, while the API still awaits `startApi` and `listen` or the worker `startWorker` and `sql.end`, still meets the default action and ends the process with no exit code, as it did before; a deploy's signal can come at any point of start-up, so this fix leaves most of that window as it was (narrowed after the PR's first review).

## The fix

- `services/worker/src/main.ts`: make the promise that installs the handlers, then write the line, then wait on it.
- `services/api/src/main.ts`: call `stopOnSignal` (which installs its handlers at once), then write the line, then wait on its promise and exit, as before.
- Nothing else changes: the lines' words, the exit codes, the stop's steps and the second signal's default action.

## The test, written first

A preload, `tests/src/db/signal-at-ready.ts`, loaded with `node --import` into the entry's process by `startup.test.ts`, wraps `process.stdout.write`: when the entry writes its ready line (`api: listening at `, `worker: started`), the process sends itself the signal `TADAYO_TEST_SIGNAL_AT_READY` names, the earliest moment a test reading that line could send one, every time. Four tests, each entry with each signal: the process exits 0, writes its stop lines, and writes nothing to stderr. Before the fix all four fail every time with an exit code of null, the `ci` failure made deterministic; after it they pass. The existing tests keep their checks; `start()` gains the optional signal, which adds the preload and its variable only when given.

## Not in it

No change to `shutdown.ts`, the lines, `fly.toml` or a workflow. A lower-risk PR: at most two rounds of review (the founder's rule of 11 November).
