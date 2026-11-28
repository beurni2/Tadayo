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
and `code`, and `failure_counts_grow` refuses an update that lowers either number and a new row with anything already
reported; `failure_counts_no_delete` and `failure_counts_no_truncate` (`app.refuse_change`, as the other tables kept
for good have them) keep every row, so a failure counted is never lost to a write (review finding P4). The counts are
running totals, so neither the writers nor the check read a clock (T1): what is new since the last alert is
`total - reported`.

`countFailures(sql, source, counts)` adds a map of code to count in one statement (`INSERT … SELECT … FROM
jsonb_each_text(…) ORDER BY key COLLATE "C" ON CONFLICT (source, code) DO UPDATE SET total = total + EXCLUDED.total`),
refusing a source outside the two, a code outside the pattern and a count that isn't a whole number from 1, without
quoting either. Every writer locks rows in the codes' "C" order, so none deadlocks another.

### 1.2. The API counts its 5xx (`services/api/src/failure-count.ts`, `app.ts`)

`failed` sets the request's `failure` to `failureCode(error)`: the error's class and code exactly as the log line
shows them (`safeError`), `Fault:propose_roster_6`, `PostgresError:57014`, `Error:ECONNREFUSED`, `TypeError`,
`unknown`; never a message (T52). Fastify's `onSend` hook (`countEachFailure`) then counts every answer from 500 up, as
it goes out, by that code or, for a 503 with no error of the server's own (Storage or the sign-in keys away), by its
status and operation (`503:createUpload`). `onSend` runs for an answer whose client has already gone, which
`onResponse` never reaches (it waits for the answer to finish on the socket, Fastify 5.12.7's `lib/reply.js`): a slow
request that ends in a 503 after its person left is counted (review finding C2). The health check's 503 isn't counted
(`UNCOUNTED`): Fly's proxy asks every 15 seconds, no person waits on it, and the database it found away is the one the
count would be written to; any other 5xx of the health check is a fault of the server's own, and is counted (C8).
Fastify's own 503 to a request that reaches it while it closes is written without hooks, and isn't counted.

The counter (`failureCounter`) holds at most one write at a time: a transaction of its own on the API's pool, so it
takes the API's `TRANSACTION_LIMITS` (`connection.ts`: a lock waited for 5 seconds at most, a statement 10) and a
route's transaction stays the route's alone; counts that come meanwhile are summed into the next write. Nothing waits
for it, and nothing it does reaches the answer. A write that fails logs `failure not counted` (warn, the error's class
and code alone, and how many failures it kept), keeps its counts, and writes them again on a timer that never keeps the
process alive: after 30 seconds, then twice as long each time up to 5 minutes, until a write gets through, and the
failures that come meanwhile join them rather than start a write of their own. So a database that is away isn't asked
in a loop, and the counts of an outage still reach the table once it is back, with no further failure needed to send
them (C1). Closing the app drops a retry that waits. While writes fail it holds at most 256 codes; a further one is
counted as `unknown`. A count the process holds when it stops is lost; its failure's log line stays. A write whose
commit went through but whose answer was lost on the way back is kept and written again, so a count is at least once:
it can be counted twice, never lost to that (C7). `buildApp` takes the counter as `Deps.failures` when it is given
one, and otherwise makes it on `sql`, as production does (`start.ts` gives none): a route test whose fake database
counts the route's own transactions gives one that counts nothing (`uncounted`, `services/api/src/testing.ts`),
since the count of its 5xx is a transaction of its own that such a fake would take for the route's.

### 1.3. The worker counts its dead events (`services/worker/src/outbox.ts`)

Both places that set `state = 'dead'` count `worker` and `deadCode(topic, code)` (`upload.prepare:lease_lapsed`) in
the same transaction, and the handler's last failure only when its write changed the row (a failure written over no
claim of its own changes nothing and counts nothing). So an event that dies is counted once, a death that rolls back
counts nothing, and a count that fails rolls the death back, and `outboxPass` throws. The event stays leased: one that
had used its last attempt dies once its lease has passed (300 seconds), written and counted then as `lease_lapsed`,
the code of the failure whose record rolled back gone with it; one a handler failed for good with attempts left is
worked again (C4). A count that kept failing (the table missing, a permission gone) would keep the oldest due event
from dying, and so hold up every event behind it; `deploy-dev` applies the migrations before it deploys, so that
needs a database changed by hand (P7). The line on standard error stays.

### 1.4. The check (`tools/ops/src/failure-alert.ts`, the `ops` script `failure-alert`)

It runs on the runner, like `dev-clock`, connecting to `tadayo-dev`'s database through Supabase's session pooler
with `DATABASE_URL` (checked to be dev's, so it can't run on any other environment), and talks to GitHub's REST API
with the run's own `GITHUB_TOKEN` (no new secret):
1. Reads every row with `total > reported` (`unreportedCounts`). When there is none, it says `failure-alert: nothing
   new` and ends, asking GitHub nothing.
2. Lists the open issues oldest first (`sort=created&direction=asc`, up to ten pages of 100) and takes the oldest one
   opened by the Actions bot (login `github-actions[bot]` and type `Bot`), not a pull request, whose body carries
   `<!-- tadayo-failure-alert: dev -->`. It comments there with a table of source, code, failures since the last alert
   and failures in all. With no such issue open (none yet, or the founder closed the last one), it opens one, titled
   "dev: failures to look at", whose body names the founder's account (the repository's owner) once, so GitHub
   notifies the founder by email, says how to read a code, and holds the table. Named in the issue, the founder is
   subscribed to it, so each comment notifies them too. When all ten pages are full and none holds its issue, it can't
   tell that there is none, so it opens nothing and fails, rather than open a new issue on every run (C6, P3).
3. Only after GitHub has answered 201, it marks each row reported up to the total it read (`markReported`:
   `GREATEST(reported, <total read>)`, in one statement that first locks its rows in "C" order, in a transaction with
   limits of its own whatever the session's defaults: a lock waited for 5 seconds, the statement 10, the transaction
   left idle 15, so a runner that stops halfway can't hold the rows from the API's and the worker's counts, C3). So a
   failure counted while the check ran stays for the next one, and a GitHub that refused leaves everything for the
   next run. A run that stops between the two repeats those counts in the next alert, where they come again with the
   same number in all, and its run fails, saying so; none is ever lost.
4. It locks the issue's conversation (`PUT /issues/{n}/lock`, answered 204) once the counts are marked, when the issue
   is new or was found unlocked, so that only the repository's own accounts write there: anyone can comment on an
   open issue of a public repository, and the founder, subscribed to it, would get a stranger's comment by email in
   the alert's own thread (P2). GitHub's documentation says only accounts with write access comment on a locked
   issue, and doesn't say whether the run's own token is one. Should GitHub refuse the bot's comment on its locked
   issue (403), the check opens a new issue for the alert and locks that; a lock GitHub refuses fails the run once
   the counts are marked, and the next run with new counts tries it again. The first two alerts show which way GitHub
   goes.

Every request goes to GitHub's API alone and follows no redirect (`redirect: "error"`, P5). The issue's words are fixed
text, sources, codes and numbers; the check prints the same to the run's log, and never GitHub's own words. `prod`
gets its own marker and issue when it exists (Gate D).

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

The job holds `DEV_DATABASE_URL`, the password of `tadayo_app`, the owner of every table of dev, 96 times a day, each
run after a full `pnpm install` on a public repository's runner, beside a token that can write issues (P6). The `ops`
jobs hold it already, but on demand; a schedule makes it routine. A role that can only read and mark
`app.failure_counts` would need a new secret and a new role in `bootstrap.sql`, so the workflow PR says so, and the
founder decides there.

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
  lowered count or mark, a moved row, a new row already reported, a delete and a truncate; row level security on with no
  policy; the API counts each 500 through its own pool, still once after the app has closed. `kept.test.ts` lists the
  table among those kept for good.
- `services/api/src/failure-count.test.ts`: `failureCode` for each kind of error, never a message; one write at a time,
  the rest summed into the next; each write a transaction of its own; a failed write kept, logged with no message, and
  written again after 30 seconds, then 60, 120, 240 and 300, with what came meanwhile, and after 30 again once a write
  has got through, and dropped once the app closes; a pool that throws as it's asked; at most 256 codes held; a code
  outside the pattern counted as `unknown`; the hook counts each answer from 500 up but the health check's 503 (its 500
  counted), and a 5xx whose client went before it was answered, over a real socket.
- `services/api/src/app.test.ts`: a 500 counted by its class and site code once, still once after the app has closed; a
  database out of time by its
  SQLSTATE; the sign-in keys' 503 by its status and operation; no 4xx counted; a count that never finishes holds no
  answer and one write goes at a time; a count that fails still answers 500 and logs `failure not counted` with no
  message.
- `tests/src/db/worker-outbox.test.ts`: an event dead after five attempts counted once, its retries not at all; one dead
  at once and two claimed with attempts spent counted with their codes; a failure written over no claim of its own, a
  wait and a retry counted not at all; the count in the death's own transaction (while it waits on a held row, the
  event isn't dead to anyone else, the transaction waiting is the one holding the event's row, and the two commit
  together).
- `tools/ops/src/failure-alert.test.ts` (fake store and fake GitHub): nothing new, no call to GitHub; an open marked
  issue of the bot's, one comment with exactly those rows, then the mark, then the lock; none open, or only one without
  the marker, a pull request, a person's issue, one with no body, a bot-named user or another bot: one new issue
  naming the founder once, with no other `@`, then locked; the list read oldest first, and every request to GitHub's
  API alone with no redirect followed; the marked issue on a later page; the oldest of several; ten full pages with
  none of its own, nothing opened and the run failed; an issue already locked left as it is, and a refused comment
  there answered with a new issue; GitHub refusing or silent, nothing marked and none of its words printed (a refused
  comment on an issue that isn't locked among them); the lock refused or unanswered, the run failed after the mark; the
  mark failing after GitHub answered, the run fails saying so; a count that isn't a source, a code and numbers refused
  before GitHub; nothing written but fixed words, sources, codes and numbers.
- `tests/src/db/ops-failure-alert.test.ts` (Postgres): the unreported counts in order as whole numbers; the mark is the
  total read, never the total by then; never lowered; no counts mark nothing; marks and counts of many codes at once in
  any order never deadlock; a row another writer holds is waited for 5 seconds at most, from a session whose own
  settings would wait without end, and those settings are as they were after a mark that committed.
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

Round 1 of the review (section 5) added one breakage for each fix, registered before any was run
(`breakages-r1.py`), each planted alone and restored the same way:
- R1. Kept counts waiting for the next failure again (no retry timer).
- R2. A failure meanwhile starting a write while kept counts wait for their retry.
- R3. The retry's wait never growing.
- R4. Counting in `onResponse` again, which an answer to a client that has gone never reaches.
- R5. Every 5xx of the health check left uncounted, not its 503 alone.
- R6. The API's count written on the pool, outside a transaction of its own.
- R7. A retry left waiting once the app has closed.
- R8. The mark with no limits of its own.
- R9. The mark's limits set for the session, not the transaction.
- R10. The list of open issues newest first, GitHub's default.
- R11. A new issue opened when ten full pages hold none of the alert's.
- R12. The issue never locked.
- R13. An issue already locked locked again.
- R14. No new issue when GitHub refuses the bot's comment on its locked issue.
- R15. A refused comment on an issue that isn't locked taken for a refusal on a locked one.
- R16. Requests that follow redirects.
- R17. A refused lock taken for a run that went well.
- R18. A row deleted (the two refusal triggers dropped).
- R19. A new row that says some of its failures were already reported.
- R20. The worker's death counted on the pool, inside the death's transaction but apart from it.

The first run, at 04:05 UTC on 2026-11-28, caught 18 of the 20. R9 passed: its test read the session's settings after
the mark had failed, and a session's setting made in a transaction that rolls back rolls back with it, so the test now
reads them after a mark that committed. R15 passed: the refused-comment case of "marks nothing when GitHub refuses…"
refused the new issue too, so it now refuses the comment alone. Both were then caught, and the rerun of all twenty
(04:06 to 04:07 UTC) caught every one. Two more came with `Deps.failures` (1.2), planted by hand in `app.ts` and run
against `app.test.ts`, each caught: R21, the app ignoring a counter it is given ("counts in the counter it's given…");
R22, the app counting nothing when it is given none (the five counting tests of `app.test.ts`).

## 4. What it leaves to others

- The workflow itself, `api/b2-alerts-workflow` (1.5), under a freeze.
- Counts for `prod`, when `prod` exists (Gate D).
- A worker that has stopped or lags is not a failure this counts: the worker's own health stays with
  `ops worker-scale` and the reveal's monitoring target (TECH-DESIGN's "Worker lag metric, alerted"), a later slice.
- 5xx answers the API never gives (Fly's proxy answering for a Machine that isn't there, Node's own refusals before a
  request exists) aren't counted; the `deploy-dev` probe and `check-api` cover a dead API. The health check's own 503 is
  left out on purpose (1.2), and so is Fastify's 503 to a request that reaches it while it closes, written without
  hooks: a deploy closes the old Machine once the new one is up, so it answers nobody's request by then.
- Who reads the codes. The repository is public, so its issues are too: the issue shows each failure's code and count
  within 15 minutes, and the time of each comment. That is a product decision for the founder (review finding P1),
  put to them on the PR's card (section 5).

## 5. Review, round 1 (two fresh reviewers at `a149ec1`: privacy and security; correctness, tests and records)

No blocker. Each finding, and what was done:
- **C1 (should fix): kept counts waited for the next 5xx,** so an outage followed by quiet was never reported. Fixed:
  a timer writes them again after 30 seconds, then twice as long each time to 5 minutes (1.2). Tested with fake
  timers.
- **C2 (should fix): a 5xx whose client had gone wasn't counted** (`onResponse` waits for the socket). Fixed: counted
  in `onSend` (1.2), tested over a real socket whose client goes before the answer.
- **C3 (should fix): the mark and the API's count relied on the role's defaults for their time limits.** Fixed: the
  mark is one statement in a transaction with limits of its own (1.4), tested with a session whose defaults wait
  without end; the API's count is a transaction of its own and takes `TRANSACTION_LIMITS` (1.2). With it, eighteen
  route tests in ten files, whose fake database counts the route's transactions or answers its statements in turn,
  saw the count's transaction too; they now give the app a counter that counts nothing (`Deps.failures`,
  `uncounted`), and `app.test.ts` checks that a given counter is the one used and that the default counts in `sql`
  (breakages R21 and R22).
- **C4 (nit): what follows a death that rolls back was overstated.** Fixed in 1.3 and `outboxPass`'s comment.
- **C5 (nit): test gaps.** Fixed: the worker's test now checks that the transaction waiting for the count holds the
  event's row (R20); the "once" tests check again after the app has closed; the page cap and several marked issues
  have tests.
- **C6 and P3 (nits): the search read newest first and opened a new issue past ten pages.** Fixed (1.4).
- **C7 (nit): a commit whose answer was lost is counted twice.** Answered: at least once, written in 1.2 and
  `docs/LIMITATIONS.md`.
- **C8 (nit): every 5xx of the health check went uncounted.** Fixed: its 503 alone (1.2).
- **P1 (should fix): the public issue shows codes and when failures happen; the card the founder answered for FQ150
  didn't say "public".** Not a code change: it is the founder's to decide, so the PR's card asks it, with the build as
  it is (codes public, dev only, `prod` decided at Gate D) as the default. FQ150 records the answer.
- **P2 (should fix): anyone can comment on the issue, and the founder gets it by email in the alert's thread.** Fixed:
  the check locks the issue (1.4), with a new issue should GitHub refuse the bot's comment on its locked issue.
- **P4 (nit): a row could be deleted or truncated, or made already reported.** Fixed (1.1); `kept.test.ts` lists the
  table among those kept for good.
- **P5 (nit): the requests followed redirects with the token.** Fixed: `redirect: "error"` (1.4).
- **P6 (nit): the schedule holds the owner role's password.** Answered in 1.5, for the workflow PR and the founder.
- **P7 (nit): a count that kept failing would hold up the outbox.** Answered in 1.3.

