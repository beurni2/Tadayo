# api/b2-failure-signals: the outside audit's B7, part one: a failure names its site, and the safety provider is a setting

The outside audit's B7 (low): "A failure in the trial can't be diagnosed or noticed." Its three fixes: "give your own
errors a stable site code that is logged; send dead events and 5xx counts somewhere you see; make the safety provider
an explicit setting that `prod` must name". This slice takes the first and the third, which need no decision. The
second needs one, where the alert reaches the founder (FQ150), and is the slice after this one, built from the answer.

Sources: spec 34 ("bounded retries, exponential backoff and a dead letter queue with alerts"); T52 (codes and opaque
ids in lines and rows, never a message); T54; TECH-DESIGN section 5, "The worker"; FQ8 (the safety provider is `none`
for the closed trial; one is required before anyone outside it joins); the founder's order of the audit's items (the
coordinator's relay of 10:02 UTC on 2026-11-24: B1, B7, B8, B6).

## 0. The finding, re-checked on `main` at `954e47d`

- **A 500 says nothing of where it came from.** `services/api/src/app.ts` `failed` logs `{ err }` as "request failed",
  and `services/api/src/logging.ts` `safeError` reduces an error to its `name` and a string `code`. That is right for a
  database error (its message can quote rows) and a system error (`ECONNREFUSED`), which carry a code. But the code's
  own errors carry none: 235 sites in `services/api/src`, `services/worker/src` and `packages/domain/src` make a plain
  `Error`, `TypeError` or `RangeError` with a fixed message ("clubs: the club vanished under its own lock"), so each
  logs as `{ type: "Error" }` or `{ type: "TypeError" }` and nothing else. The worker's lines are the same:
  `services/worker/src/generation.ts` `describeFailure` gives the class and a code, and `outbox.ts` `failureCode`
  records such an error as `unknown`.
- **A dead event is a line on stderr** (`worker: an event is dead: …`), and nothing else: no one is told. Left to the
  next slice (FQ150).
- **The safety provider is fixed in code** (`services/worker/src/main.ts`, `safety: noSafetyProvider`), with no setting,
  so nothing in an environment's configuration says which provider screens its photos, and nothing would stop `none`
  outliving the trial unnoticed.

## 1. The change

### 1.1. Every error of the code's own carries a site code (`packages/domain/src/fault.ts`)

- Three classes, one for each kind the code throws today, so a test or a caller that tells them apart still can:
  `Fault` (an `Error`), `InputFault` (a `TypeError`: an argument the function refuses) and `RangeFault` (a
  `RangeError`). Each takes a site code, then the message it had, then the error's options (`cause`). Each `name` is
  its own class's.
- A site code is lower-case letters, digits and `_`, ending in `_` and a number, at most 32 characters
  (`/^[a-z][a-z0-9_]*_[0-9]+$/`): `propose_roster_7`, `worker_start_2`. The constructor refuses any other. That shape
  fits each place that reads a code already: `describeFailure`'s pattern (`^[A-Za-z0-9_]{1,32}$`), `failureCode`'s
  own codes, and 0009's `last_error` check. Its shape can't hold a URL, a message or an id of the database's (an id
  from `newId` ends in a letter), and its trailing number keeps it apart from the worker's reason codes
  (`storage.unavailable`, `payload`). The shape alone could still spell a word or a number (`debby_2`): what keeps a
  value out is that every code is a literal written at its site, which the scan holds (below).
- Each site's code is its file's name and its place among the file's sites when this slice wrote it: `home_3` is the
  third in `packages/domain/src/clubs/home.ts`; a file in `services/api` or `services/worker` adds `api_` or
  `worker_` in front. The code is a literal at its site, so a log's code finds its line with one search, and it never
  changes when the file moves or another site is added. A function that makes one fault for many checks (a parser's
  `shape()`: `home_2` for 25 checks of Home's rows) has one code, which names the parser, not the check (PR #148's
  review, G4). The message stays as it was, for the tests and the start's
  own failures, which print it (`main.ts`): a message can name a value (`time: ${zone} isn't an IANA time zone`), so
  it is never logged.
- `packages/domain/package.json` exports the module as `@tadayo/domain/fault`, which the services import: it imports
  nothing, so a module that took nothing of the domain's before (the worker's `loop.ts`) loads nothing more with it.
- `services/worker/src/privileges.ts` imports only Node's own modules, so that nothing of the worker's runs as root
  before the turn (`turn.ts`; `privileges.test.ts` holds it to that, its import list and the graph Node resolves). It
  keeps its own `PrivilegeFault`, of the same shape: `PRIVILEGE_SITE_CODE`, which `privileges.test.ts` holds to
  `SITE_CODE`, and a code that isn't one refused under `worker_privileges_0`.
- With a code on every such error, nothing else changes to log it: `safeError` already keeps a string `code` (since
  the review, only a plain word: section 5's P2), so the 500's line reads
  `{ "err": { "type": "Fault", "code": "propose_roster_7" }, "msg": "request failed" }`;
  `describeFailure` gives `Fault propose_roster_7`; and `failureCode` records the event's failure as
  `propose_roster_7` where it said `unknown`.
- **The rule that keeps it so** (`packages/domain/src/fault.test.ts`): a scan of the three folders' TypeScript (not
  their tests, nor the four files that never run in a server, named by exact path: the three packages' `testing.ts`
  and the root harness) through the compiler, so a string that holds code (the sweep's script in `privileges.ts`)
  isn't read as code. It fails on any `new Error`, `TypeError`, `RangeError` or another built-in error, or a call of
  one without `new`, outside `fault.ts`; on a `Fault`, `InputFault` or `RangeFault` whose code isn't a string literal
  of the site code's shape; and on a code used twice. It reads a class through parentheses, `as`, `!` and a property
  (`f.Fault`, `globalThis["Error"]`), and fails on each way round it can see: one of these classes under another name
  (an alias, a renamed import, export or binding), passed as a value (`Reflect.construct(Error, …)`), a fault
  extended, or the fault module imported whole (PR #148's review, P1). It reads `PrivilegeFault` as a fault too. A
  part of it plants each of these in made-up files and checks the scan finds them. A class of the code's own that
  extends `Error` (`StorageUnavailable`, `ImageTimeout`) stays: its name already says where it came from.

### 1.2. The photo safety provider is a setting every environment names (`services/worker/src/start.ts`)

- `TADAYO_SAFETY_PROVIDER` names the provider. Unset or empty, the worker stops before it connects ("worker:
  TADAYO_SAFETY_PROVIDER isn't set"), as for its other settings; a name it doesn't know stops it too. The one name it
  knows is `none`, FQ8's for the closed trial. `startWorker` returns the provider, and `main.ts` hands it to the
  preparation in place of the constant.
- `fly.toml` sets `TADAYO_SAFETY_PROVIDER = "none"` for `dev`. The Dockerfile sets nothing, so an image alone names no
  provider: `prod`'s configuration, when it is made, must name one or its worker won't start (the audit's "that `prod`
  must name"). `tools/ops/src/deploy-files.test.ts` checks both.
- The worker's start line says which provider screens photos (`…, screened by no safety provider (FQ8)`), so each
  start's log says it.
- What it doesn't do: it can't tell the trial from what follows it, so it doesn't refuse `none` in `prod` (the trial
  runs on `prod`, Gate E). FQ8 keeps that rule: a provider before anyone outside the trial joins, Gate D, which adds
  its name here.

### 1.3. FQ150: where the alerts go (`docs/QUESTIONS.md`)

Asked on a card in the api thread at 02:09 UTC on 2026-11-27: "Choose where alerts for lost photos and server errors
reach you", with three options: a GitHub issue that a scheduled check opens or updates with codes and counts, which
GitHub emails (recommended: no new service, secret or address); an email through Resend (a new secret and the
founder's address); or logs only until Gate D. Default until answered: nothing is sent, as now, and the next slice
waits for the answer.

## 2. Tests first

- `packages/domain/src/fault.test.ts`: the classes (each code's shape refused or taken, the kind each extends, its
  name, its message and cause kept), and the scan. Run on `main`'s sources, the scan fails, listing the 235 sites
  (two of the 237 lines a text search finds are inside the sweep's script, a string).
- `services/worker/src/privileges.test.ts`: `PrivilegeFault`, and its pattern held to `SITE_CODE`.
- `services/api/src/logging.test.ts`: the 500 from a route whose handler throws a `Fault` logs its class and code and
  none of its message.
- `services/worker/src/generation.test.ts` `describeFailure` and `outbox.test.ts` `failureCode`: a `Fault`'s class and
  code, never its message.
- `services/worker/src/start.test.ts`: the worker refuses to start without `TADAYO_SAFETY_PROVIDER`, with it empty, or
  with a name it doesn't know (`None`, ` none`, `toString`, a random word), echoing none; its other tests give it
  `none`. `tests/src/db/startup.test.ts` and `worker-generation.test.ts` start it with `none` and read the new start
  line; `privileges-harness.ts` gives it `none`, so its start still fails at the sweep it tests.
- `tools/ops/src/deploy-files.test.ts`: `fly.toml` names the provider, and the Dockerfile doesn't.

## 3. Breakages

Each planted in place and restored from its own copy, each to be caught by the tests named for it:

1. one site put back to `new Error(...)` (`fault.test.ts`);
2. a site's code made a template literal (`fault.test.ts`);
3. two sites given the same code (`fault.test.ts`);
4. `Fault` accepting a code with a dot (`fault.test.ts`, and `privileges.test.ts`, which holds `PRIVILEGE_SITE_CODE` to
   `SITE_CODE`);
5. `safeError` dropping the code, the 500's line (`logging.test.ts`);
6. `startWorker` taking a missing `TADAYO_SAFETY_PROVIDER` for `none` (`start.test.ts`);
7. a name other than `none` taken, by trimming and lower-casing it (`start.test.ts`);
8. a provider looked up through the table's prototype, so `toString` names one (`start.test.ts`);
9. `fly.toml`'s line taken out (`deploy-files.test.ts`);
10. `TADAYO_SAFETY_PROVIDER` set in the Dockerfile (`deploy-files.test.ts`);
11. `privileges.ts`'s site code pattern drifting from `SITE_CODE` (`privileges.test.ts`).

The review's fixes (section 5) add six:

12. the safety setting read after the sweep (`privileges.test.ts`'s root harness, `start-no-provider`);
13. the scan leaving files out by their name again, with a server module named `upload-harness.ts` added
    (`fault.test.ts`);
14. the scan reading a class without unwrapping parentheses and casts (`fault.test.ts`'s planted files);
15. the scan not looking for a class under another name (`fault.test.ts`'s planted files);
16. `safeError` keeping any string code (`logging.test.ts`);
17. `safeError` keeping any string name (`logging.test.ts`).

## 4. What it leaves to others

- **The alert itself** (FQ150): the next slice, `api/b2-failure-alerts`, once the founder answers. Whatever the
  destination, it reads the dead events from `outbox_events` and counts the API's 500s by their site codes.
- A library's error with no code (a plain `Error` from a package) still logs as its class alone: its message is the
  package's to choose and can hold anything, and its site isn't ours to name.
- `tools/ops` keeps its own `OpsError`, which prints its message to the workflow's log by design.
- `packages/contracts/src`, which the API loads, still makes eight built-in errors (`document.ts`, `registry.ts`). Each
  fires while the contract is built or loaded, at the API's start or in a test, never in a request, so none reaches
  a 500's line (PR #148's review, G6). The scan, and every claim of this slice, is of the three folders.

## 5. The review

Round 1: two fresh subagents read the first commit, `a3dddb0`, one general (G1 to G6) and one for privacy and
security only (P1 to P3). Neither found a blocker. What was done with each, in the second commit:

- **G1, fixed:** the scan left out any `*-harness.ts` or `testing.ts` by its name, so a server module so named would
  have been skipped. It now leaves out four files by exact path (`NOT_SERVER`), and a test holds what it leaves out,
  beside the tests, to exactly those four and `fault.ts`. (The reviewer named three; `services/api/src/testing.ts` is
  the fourth.)
- **G2, answered:** the privacy and security review it asked for is P1 to P3, run beside it on the same commit.
- **G3 and P3, fixed:** nothing held that the setting is read before the sweep, as the comments and records say. The
  root harness's new case, `start-no-provider`, leaves a process of the photo user's running and starts the worker with
  a photo user and no `TADAYO_SAFETY_PROVIDER`: it stops as `worker_safety_1` and the process is still there
  (`privileges.test.ts`, "the worker's start reads TADAYO_SAFETY_PROVIDER before it sweeps, and stops there without
  it"). Breakage 12.
- **G4, answered in the code and here:** a function that makes one fault for many checks (a parser's `shape()`:
  `home_2` for 25 checks) has one code, which names the parser, not the check. The literal at the `new` is what keeps
  every code a literal, so the scheme stays; `fault.ts`'s header and section 1.1 say so.
- **G5, fixed:** `deploy-files.test.ts`'s comment on `[env]` names the worker among its readers.
- **G6, fixed:** "every error the server's own code makes" now says "in the three folders" where the records claimed
  more; `packages/contracts`' eight are in section 4.
- **P1, fixed:** the shape alone doesn't keep a value out (`debby_2` has it); the literal does, and the scan had blind
  spots. It now reads a class through parentheses, `as`, `satisfies`, `!`, `<T>`, a property and a written element
  (`new (Error)()`, `new f.Fault(…)`, `globalThis["Error"]`), and fails on a class under another name (an alias, a
  renamed import, export or binding), passed as a value (`Reflect.construct(Error, …)`), a fault extended, or the
  fault module imported whole, each planted in its self-test. Section 1.1 and `fault.test.ts`'s header say the
  literal is the rule. Breakages 13 to 15.
- **P2, fixed:** the API's `safeError` logged any string `code` and `name`. It keeps a code only of letters, digits and
  `_`, 64 at most, and a name only when it is a plain identifier, else `unknown`, as the worker's `describeFailure`
  does (`logging.test.ts`, "keeps an error's class and code only when each is a plain word, which could otherwise carry
  anything"). Breakages 16 and 17.
