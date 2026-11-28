# api/b2-failure-alerts: the outside audit's B7, part two: a failure reaches the founder as a GitHub issue

The outside audit's B7 (low): "A failure in the trial can't be diagnosed or noticed." Its second fix, "send dead
events and 5xx counts somewhere you see", needed a decision, FQ150. The founder answered it on the card in the api
thread at 04:23 UTC on 2026-11-27: "A GitHub issue (GitHub emails you)", the option that read "a GitHub issue that a
check every 15 minutes opens or updates, one per environment, with error codes and counts only, which GitHub emails
(no new service, secret or address)". The first part, PR #148 (`docs/plans/api-b2-failure-signals.md`), gave every
error of the server's own code a site code; this part counts them and tells the founder.

Sources: spec 34 ("bounded retries, exponential backoff and a dead letter queue with alerts"); TECH-DESIGN section 5
("a dead-letter table that raises an alert", T54); T52 (codes and opaque ids, never a message); T1 (only the time
module reads a clock); T53; T58 (a workflow file in its own CI-configuration PR, under a freeze); FQ150.

## 0. The finding, re-checked on `main` at `4f5de34` (PR #148)

- **An API 500 is a line in Fly's log and nothing else.** `services/api/src/app.ts` `failed` logs the error by its
  class and, since #148, its site code (`{"type":"Fault","code":"propose_roster_6"}`), then answers 500. Nothing
  counts it, and Fly keeps no history of its log that a check could read later.
- **A dead outbox event is a row and a line.** `services/worker/src/outbox.ts` sets `state = 'dead'` in two places
  (a lease that lapsed too often, and a handler's last failure), with `last_error` a code, and writes
  `worker: an event is dead: …` to standard error. No one is told.
- **No check runs on a schedule.** The workflows are `ci`, `deploy-dev`, `ios`, `ios-release` and `ops`; none has a
  `schedule` trigger.
- **The repository is public** (`beurni2/tadayo`), so an issue in it is public too, as its source and its workflow
  logs already are. The issue carries codes and counts only (below), never an id, a name, a date of anyone's day or
  a message; the codes are already in the source.

## 1. The change

### 1.1. Counting, with no clock (`db/migrations/0020_failure_counts.sql`, `packages/domain/src/failure-count.ts`)

A new table, `app.failure_counts`: `source` (`api` or `worker`), `code` (1 to 200 of `[A-Za-z0-9_.:-]`, the outbox's
`last_error` alphabet and length), `total` (from 1) and `reported` (from 0, `reported <= total`), primary key
`(source, code)`, row level security on and no policy, like every table in `app` (T53). `keep_columns` keeps `source`
and `code`, and `failure_counts_grow` refuses an update that lowers either number. The counts are running totals, so
neither the writers nor the check read a clock (T1): what is new since the last alert is `total - reported`.

`countFailures(sql, source, counts)` adds a map of code to count in one statement (`INSERT … SELECT … FROM
jsonb_each_text(…) ORDER BY key COLLATE "C" ON CONFLICT (source, code) DO UPDATE SET total = total + EXCLUDED.total`),
refusing a source outside the two, a code outside the pattern and a count that isn't a whole number from 1, without
quoting either. Every writer locks rows in the codes' "C" order, so none deadlocks another.

### 1.2. The API counts its 5xx (`services/api/src/failure-count.ts`, `app.ts`)

`failed` sets the request's `failure` to `failureCode(error)`: the error's class and code exactly as the log line
shows them (`safeError`), `Fault:propose_roster_6`, `PostgresError:57014`, `Error:ECONNREFUSED`, `TypeError`,
`unknown`; never a message (T52). Fastify's `onResponse` hook (`countEachFailure`) then counts every answer from 500 up,
by that code or, for a 503 with no error of the server's own (Storage or the sign-in keys away), by its status and
operation (`503:createUpload`). The health check's 503 isn't counted (`UNCOUNTED`): Fly's proxy asks every 15 seconds,
no person waits on it, and the database it found away is the one the count would be written to.

The counter (`failureCounter`) holds at most one write at a time: one statement on the API's own pool, outside any
transaction, so a route's transaction stays the route's alone; counts that come meanwhile are summed into the next
write. Nothing waits for it, and nothing it does reaches the answer. A write that fails logs `failure not counted` (warn,
the error's class and code alone, and how many failures it kept) and keeps its counts for the next write, which the
next failure starts, so a database that is away isn't asked in a loop. While writes fail it holds at most 256 codes;
a further one is counted as `unknown`. A count the process holds when it stops is lost; its failure's log line stays.

### 1.3. The worker counts its dead events (`services/worker/src/outbox.ts`)

Both places that set `state = 'dead'` count `worker` and `deadCode(topic, code)` (`upload.prepare:lease_lapsed`) in
the same transaction, and the handler's last failure only when its write changed the row (a failure written over no
claim of its own changes nothing and counts nothing). So an event that dies is counted once, a death that rolls back
counts nothing, and a count that fails rolls the death back, for the next pass. The line on standard error stays.

### 1.4. The check (`tools/ops/src/failure-alert.ts`, the `ops` script `failure-alert`)

It runs on the runner, like `dev-clock`, connecting to `tadayo-dev`'s database through Supabase's session pooler
with `DATABASE_URL` (checked to be dev's, so it can't run on any other environment), and talks to GitHub's REST API
with the run's own `GITHUB_TOKEN` (no new secret):
1. Reads every row with `total > reported` (`unreportedCounts`). When there is none, it says `failure-alert: nothing
   new` and ends, asking GitHub nothing.
2. Lists the open issues (up to ten pages of 100) and takes the one opened by the Actions bot (login
   `github-actions[bot]` and type `Bot`), not a pull request, whose body carries `<!-- tadayo-failure-alert: dev -->`.
   It comments there with a table of source, code, failures since the last alert and failures in all. With no such
   issue open (none yet, or the founder closed the last one), it opens one, titled "dev: failures to look at", whose
   body names the founder's account (the repository's owner) once, so GitHub notifies the founder by email, says how
   to read a code, and holds the table. Named in the issue, the founder is subscribed to it, so each comment notifies
   them too.
3. Only after GitHub has answered 201, it marks each row reported up to the total it read (`markReported`:
   `GREATEST(reported, <total read>)`, a row at a time in "C" order, in one transaction), so a failure counted while
   the check ran stays for the next one, and a GitHub that refused leaves everything for the next run. A run that
   stops between the two repeats those counts in the next alert, where they come again with the same number in all,
   and its run fails, saying so; none is ever lost.

The issue's words are fixed text, sources, codes and numbers; the check prints the same to the run's log, and never
GitHub's own words. `prod` gets its own marker and issue when it exists (Gate D).

### 1.5. The schedule (`.github/workflows/alerts.yml`, its own CI-configuration PR)

A workflow with `schedule: 7,22,37,52 * * * *` (every 15 minutes, away from the hour's busy start) and
`workflow_dispatch`, one job with `permissions` `contents: read` (to check the repository out) and `issues: write`, nothing else, its own concurrency group (`alerts-dev`, so a run never overlaps another; it holds no Fly token, so
`ops-dev` isn't needed), running `python3 tools/ci/ops_steps.py run` with `OPS_SCRIPT=failure-alert`. A workflow
file changes only in its own PR, under a freeze the coordinator carries (T58; `docs/MILESTONES.md`, "Lanes"), so it
is a second PR, `api/b2-alerts-workflow`, opened once this one has merged (the script must be on `main` before the
schedule runs it). Any `tools/ci` change it needs goes in that PR too.

GitHub runs a scheduled workflow only from the default branch, may start it late or skip a slot when busy, and
turns a public repository's schedule off after 60 days with no activity in it; a check that fails is a failed run,
which GitHub notifies to whoever last changed the schedule's line. These go in `docs/LIMITATIONS.md` (read in GitHub's
documentation on 2026-11-28).

### 1.6. Records

FQ150's answer in `docs/QUESTIONS.md`; the audit map's T52 row (a count holds a code, never a message), T54's row
(the dead letters' alert, enforced and tested) and spec 34's row; `docs/LIMITATIONS.md`'s rows for GitHub's schedule
(1.5), for email that depends on the founder's notification settings, and for counts lost when a process stops (1.2);
the public issue flagged in the PR. The issue's body sends a reader to sections 1.2 and 1.3 of this plan for how the
codes are made.

## 2. Tests first

- `packages/domain/src/failure-count.test.ts`: one statement, source and counts bound as values in code order; nothing
  for no counts; a source outside the two, a code outside the pattern (never quoted) and a count that isn't a whole
  number from 1 refused before anything is sent.
- `tests/src/db/failure-counts.test.ts` (Postgres): the first count makes the row, later ones add, each source apart;
  forty counts at once over ten connections, in both code orders, make forty; the schema refuses a code outside the
  pattern or past 200 characters, a source outside the two, a count of 0 or less, `reported` past `total` or below 0, a
  lowered count or mark, a moved row; row level security on with no policy; the API counts each 500 through its own
  pool.
- `services/api/src/failure-count.test.ts`: `failureCode` for each kind of error, never a message; one write at a time,
  the rest summed into the next; a failed write kept for the next and logged with no message; a pool that throws as
  it's asked; at most 256 codes held; a code outside the pattern counted as `unknown`; the hook counts each answer from
  500 up but the health check's.
- `services/api/src/app.test.ts`: a 500 counted by its class and site code once; a database out of time by its
  SQLSTATE; the sign-in keys' 503 by its status and operation; no 4xx counted; a count that never finishes holds no
  answer and one write goes at a time; a count that fails still answers 500 and logs `failure not counted` with no
  message.
- `tests/src/db/worker-outbox.test.ts`: an event dead after five attempts counted once, its retries not at all; one dead
  at once and two claimed with attempts spent counted with their codes; a failure written over no claim of its own, a
  wait and a retry counted not at all; the count in the death's own transaction (while it waits on a held row, the
  event isn't dead to anyone else, and the two commit together).
- `tools/ops/src/failure-alert.test.ts` (fake store and fake GitHub): nothing new, no call to GitHub; an open marked
  issue of the bot's, one comment with exactly those rows, then the mark; none open, or only one without the marker,
  a pull request, a person's issue, one with no body, a bot-named user or another bot: one new issue naming the
  founder once, with no other `@`; the marked issue on a later page; GitHub refusing or silent, nothing marked and none
  of its words printed; the mark failing after GitHub answered, the run fails saying so; a count that isn't a source,
  a code and numbers refused before GitHub; nothing written but fixed words, sources, codes and numbers.
- `tests/src/db/ops-failure-alert.test.ts` (Postgres): the unreported counts in order as whole numbers; the mark is the
  total read, never the total by then; never lowered; no counts mark nothing; marks and counts of many codes at once in
  any order never deadlock.
- `tools/ops/src/run.test.ts`: `failure-alert` refuses a database that isn't dev's and a missing `GITHUB_TOKEN` before
  it connects; with nothing new it asks GitHub nothing.
- `tests/src/db/migrations.test.ts`: 0020 applies and is recorded (its existing test).

Each new test ran first on `main`'s code and failed for the reason the change is for: the modules weren't there, the
table wasn't there, and the app counted nothing (5 of 20 in `app.test.ts`).

## 3. Planted breakages (each must fail a test)

1. `countFailures` setting `total = 1` instead of adding.
2. `failureCode` returning the message.
3. The counter awaited before the answer (a slow count slows the 5xx).
4. A failed write left to throw.
5. The worker counting outside the death's transaction.
6. The check marking `reported = total` (current) instead of the total it read.
7. The check marking before GitHub answered.
8. The check commenting on an issue without the marker.
9. The schema's `reported <= total` dropped.
10. The check printing more than a count's source, code and numbers.
11. The worker counting a failure written over no claim of its own.
12. The health check's 503 counted.
13. `failure_counts_grow` dropped (a mark lowered).
14. The counter writing a second batch while one is under way.

Run on 2026-11-28, ending at 03:35 UTC (`breakages.py` in the session's scratch folder), in a scratch worktree holding
the working tree: each planted alone, run against the tests registered for it, its files restored from their own copies
and compared after, and for 9 and 13 the table's constraints and triggers read back after the schema was put back. Five
became two runs each (3 needs both the counter and the hook; 5 is 5a, the lapsed lease's death, and 5b, a handler's last
failure; 10 is 10a, GitHub's words in a refusal, and 10b, a date in the table), so 16 runs, and every one was caught by
the test registered for it:
- 1 by `failure-counts.test.ts` "makes a code's row with its first count…" (and two more);
- 2 by `failure-count.test.ts` "is the error's class and code as the log line shows them…" (and five of `app.test.ts`);
- 3 by `app.test.ts` "answers a 500 at once while its count never finishes…", alone;
- 4 by "keeps a write that failed for the next one…", "never throws…" and `app.test.ts`'s "still answers the 500 when
  its count fails…";
- 5a and 5b by `worker-outbox.test.ts` "counts in the event's own transaction…", alone;
- 6 by `ops-failure-alert.test.ts` "marks the total it read…", alone;
- 7 by `failure-alert.test.ts` "marks nothing when GitHub refuses…" (and three more);
- 8 by "opens a new issue, naming the founder's account once…" and "comments on the open issue it opened…";
- 9 and 13 by `failure-counts.test.ts` "refuses a code outside the pattern, a source outside the two…", alone;
- 10a by "marks nothing when GitHub refuses or doesn't answer, and never prints its words", alone; 10b by "writes
  nothing but fixed words, sources, codes and numbers…" (and the two that compare the bodies);
- 11 by `worker-outbox.test.ts` "counts nothing for a failure written over no claim of its own…", alone;
- 12 by `failure-count.test.ts` "counts each answer from 500 up but the health check's…", alone;
- 14 by "writes a count as the API's, at once, one write at a time…" (and two more).

## 4. What it leaves to others

- The workflow itself, `api/b2-alerts-workflow` (1.5), under a freeze.
- Counts for `prod`, when `prod` exists (Gate D).
- A worker that has stopped or lags is not a failure this counts: the worker's own health stays with
  `ops worker-scale` and the reveal's monitoring target (TECH-DESIGN's "Worker lag metric, alerted"), a later slice.
- 5xx answers the API never gives (Fly's proxy answering for a Machine that isn't there, Node's own refusals before a
  request exists) aren't counted; the `deploy-dev` probe and `check-api` cover a dead API. The health check's own 503 is
  left out on purpose (1.2).
