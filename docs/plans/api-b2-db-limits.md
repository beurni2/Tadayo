# api/b2-db-limits: the outside audit's A7, part 1: one held lock can't stall the whole API

The outside audit of 2026-11-24, finding A7 (Medium, proven): the API's connection is `postgres(url, { types, ssl })`
(`services/api/src/connection.ts`), the driver's default of ten connections, with no statement, lock or
idle-transaction time limit. Its reproduction: another connection holds one account's row, ten `PATCH /v1/me` calls
for that account wait on it, and a different person's `GET /v1/me` is still pending after five seconds, answering
only once the lock is released. The worker sets a lock and a statement limit on each of its transactions
(`services/worker/src/generation.ts` `LOCK_WAIT_MS`, `STATEMENT_MS`); the API sets none.

Re-checked against `main` at `dd0154d` before the fix: `connect` is as the audit quotes it, no migration or
bootstrap line sets a time limit on `tadayo_app` (`grep -rn "lock_timeout\|statement_timeout" db/` finds nothing),
and `failed` in `services/api/src/app.ts` answers every database error with a 500. The new test below reproduces the
stall on `main`.

Sources: spec 34 (jobs reliability: bounded retries; prefer disabling the affected part over serving uncertain
content), spec 35 (p95 below 800 ms for a typical read), T19 (one commit per idempotency key), T52 (logs carry an
error's class and code only), TECH-DESIGN section 5 (the API and the worker, one connection each, through the
session pooler).

The audit's fix has three parts here and a fourth that is A7's second PR:

1. **Time limits on the database role the API uses.**
2. **A timeout answered with the bare 503** the API already sends when a service it needs is down.
3. **The pool sized on purpose**, for the API and for the worker.
4. Later, its own PR (`api/b2-health-check`): a health check that makes one database round trip, a route in the
   contract and the privacy matrix, and `fly.toml`'s service check on it in place of the TCP one. It is split off
   because it changes the contract and the matrix, and the stall is fixed without it.

## 0. Readings

0.1. **On the role, and again in each of the API's transactions.** The audit allows either; this does both. A limit
on the role (`ALTER ROLE CURRENT_USER SET ...`, `db/migrations/0018_role_time_limits.sql`; migrations run as
`tadayo_app`, `tools/ops/src/migrate.ts`, and a role may set its own session defaults) is the floor for every session as
`tadayo_app`: the API, the worker, the migration runner, the `ops` scripts, and the gate's reads outside a
transaction; the audit's own check reads it (`SELECT rolname, rolconfig FROM pg_roles WHERE rolname = 'tadayo_app'`).
It reaches `dev` with the next `deploy-dev`, no `ops` run needed. But Postgres applies a role's defaults only when a
server session starts, a session that started before them keeps what it started with (even through `RESET ALL`), and
Supabase's session pooler hands its server sessions from one client to the next; and a connection string's startup
parameters replace them (round 1 of the review, E3 and P2). So every transaction of the API also sets the two waits'
limits as its first statement (`services/api/src/connection.ts` `TRANSACTION_LIMITS`, two `SET LOCAL` in one
simple-protocol message: one round trip, no snapshot, allowed in a read-only transaction), as the worker's
transactions already do. `connect` wraps `begin`, so none of the API's thirty-odd transactions can forget it; a body that returns an array of
queries still has them run inside the transaction before its commit, as postgres.js does (round 2, R2-1).

0.2. **The values.**
- `lock_timeout = 5s`, the worker's `LOCK_WAIT_MS`: no command of the API waits on a lock for long in normal use
  (the leave holds a club's row for milliseconds since PR #121's round 1).
- `statement_timeout = 10s`, the worker's `STATEMENT_MS`: twelve times spec 35's p95 for a read.
- `idle_in_transaction_session_timeout = 15s`, on the role only: the API never waits on anything but the database inside
  a transaction (Storage's signing runs after the commit, `services/api/src/media/uploads.ts`), so a transaction idle
  for 15 s is a process or a link that has stopped, holding its locks: an `ops` script's, or one whose link hung. Ended,
  the transaction rolls back and its locks are free for the requests waiting on them.
- The worker keeps setting its own per transaction (`SET LOCAL` through `set_config(..., true)`), the same values, so
  nothing changes for it; `ops` scripts that need longer set their own (`tools/ops/src/spike-time.ts`). The worker
  never holds a transaction while it reads, prepares or stores a photo (`services/worker/src/prepare.ts`: the claim
  and the record are each their own transaction), so the idle limit can't end one of its transactions in normal use.
- The migration runner (`tools/ops/src/migrate.ts`) inherits them too, on a server session that started after 0018:
  a migration that waits more than 5 s for a table's lock fails and rolls back, and the deploy stops, rather than
  queueing requests behind it. The pooler may hand the runner an older session, which has none (round 2, R2-2), and
  so may the `ops` scripts and the worker's reads outside a transaction; the API's own transactions still end at 5 s
  with the 503 (0.1), and `docs/LIMITATIONS.md` (2026-11-24) records the rest, with its follow-up: the runner sets
  its own limits in each of its transactions, with the runner change a longer migration needs. The runner sends a whole file as one statement (a `DO` block that `EXECUTE`s it), so the 10 s statement limit
  bounds a migration file as a whole, and a `SET LOCAL statement_timeout` inside the file can't lift it, since the
  statement's timer started with the `DO` (round 1, E2; a `SET LOCAL lock_timeout` inside the file does lift the lock
  limit, read at each wait). Every migration so far is small on the trial's data; one that needs longer needs the runner
  to set its own limit first, a change to `migrate.ts` in that migration's PR. The seeds (`seed.ts`) run the same way. A
  second runner waiting on the first's advisory lock for more than 5 s fails the same way and is run again.

0.3. **Which errors are a timeout, and the answer.** Postgres raises `55P03` (`lock_not_available`) when
`lock_timeout` ends a wait and `57014` (`query_canceled`) when `statement_timeout` ends a statement; postgres.js 3.4.9
rejects the query with a `PostgresError` carrying the code, and the connection stays usable. `failed` answers those two
with the bare 503, `Cache-Control: private, no-store` and no body (`answers.ts` `unavailable`), and logs one warning with
the error's class and code (T52). Every other error stays a 500. The transaction was rolled back, so nothing was
committed and no receipt written: the app retries under the same Idempotency-Key and the command commits once (T19).
The app treats any 503 as "try again" and keeps its key for it (the ios lane, 16:04 UTC on 2026-11-24: every 5xx maps
to `.unavailable`, which every model that sends a key keeps it for, and nothing ends a session on one). The contract
declares no 503 for any operation; the gate already answers this one on every authenticated route when sign-in's keys
can't be fetched, and the two public routes that read the database, `previewInvitationWeb` and `removeDevice`, can now
answer it too (round 1, P3). No contract change.

The idle limit is not among them (round 1, E1 and P1). It ends a session idle inside a transaction, and Postgres says so
(`25P03`) as a FATAL that arrives with no query in flight, which postgres.js 3.4.9 doesn't surface: it reports the
closed connection, `CONNECTION_CLOSED`, a plain `Error`. The API never leaves a transaction idle, so if it ever did,
that is a failure to look at, not a wait to retry: the 500. A database that can't be reached at all is the 500 too.
And postgres.js 3.4.9 then throws an uncaught `TypeError` from the transaction's next message on the closed socket,
which ends the process; that is true of any connection lost inside a transaction today, a pooler restart or a
`pg_terminate_backend` (`docs/LIMITATIONS.md`, 2026-11-24), and not this PR's to fix.

0.4. **No command uses a lock it couldn't get as a refusal.** Commands do wait on locks (`FOR UPDATE`, advisory
locks). But `grep` finds no `NOWAIT` and no code that catches `55P03` or `57014`, and the two `SKIP LOCKED` queries
(`packages/domain/src/identity/devices.ts`, the worker's outbox) never wait. So a timeout is never a refusal a command
meant to give.

0.5. **The pool.** postgres.js opens up to `max` connections, ten by default, and queues the rest. Supabase's session
pooler gives each client session one server connection; its pool size is a project setting the session can't read
(the audit couldn't either). The sizes, set in the code with their reason:
- the API: `max: 6` (`services/api/src/connection.ts` `API_POOL`);
- the worker: `max: 2` (`services/worker/src/connection.ts` `WORKER_POOL`): its two loops, generation and the outbox,
  each run one transaction at a time.

During a rolling deploy the old and the new API run together for a moment: 6 + 6 + 2, and one for a migration or an
`ops` script, is 15, Supabase's default pool size for the smallest compute as far as the session knows (not verified:
the founder can read it under Database, Connection pooling, Pool size). Six connections serve the trial's requests,
which each hold one for milliseconds.

0.6. **What the stall becomes.** With the reproduction's ten `PATCH /v1/me` waiting on a held row: six take the API's
connections and wait five seconds, then answer 503; the other person's `GET /v1/me` runs as soon as one is free, about
five seconds in, and answers 200; the four `PATCH`es left wait their own five seconds and answer 503 too. Once the row
is free, the same request under the same key answers 200. Nobody waits forever.

0.7. **Not built here, and why.** The health check (part 4 above). An acquire timeout for the pool: postgres.js has
none, and with every wait bounded the queue drains on its own. A limit on how many requests one account may have in
flight: no route lets a member hold a lock at will (the audit's own note), so this is resilience, not defence.

## 1. The change

1. `db/migrations/0018_role_time_limits.sql`: `ALTER ROLE CURRENT_USER SET lock_timeout = '5s'`, the same for
   `statement_timeout = '10s'` and `idle_in_transaction_session_timeout = '15s'`.
2. `services/api/src/connection.ts` `connect`: `begin` wrapped so each transaction runs `TRANSACTION_LIMITS` first
   (`SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '10s'`), with or without its options.
3. `services/api/src/app.ts` `failed`: the two codes of section 0.3 answer `unavailable(reply)`, logged as a warning.
4. `services/api/src/connection.ts`: `max: API_POOL` (6); `services/worker/src/connection.ts`: `max: WORKER_POOL` (2).

## 2. Tests first

2.1. `tests/src/db/time-limits.test.ts`, on Postgres as `tadayo_app`:
- the role's settings: `pg_roles.rolconfig` for `current_user` holds the three, and a new session shows them;
- the API's own (round 1): a `connect` client whose connection string turns both waits' limits off still runs every
  transaction, with options or without, under 5 s and 10 s, and its session's own come back after it; a held row's wait
  ends with a `PostgresError` `55P03` within the lock limit and a margin, and a statement of 11 s with `57014` within
  the statement limit and a margin, and the connection still answers; a body that returns two queries as an array gets
  both their rows, each read inside the transaction under 5 s and 10 s (round 2);
- the audit's reproduction through the real app (`buildApp` on `connect`, the real gate with a test signer): a
  connection holds Ana's account row `FOR UPDATE`; ten `PATCH /v1/me` for Ana each answer 503 with no body and
  `private, no-store`, none later than the lock limit twice over and a margin; Ben's `GET /v1/me`, sent after them,
  answers 200 within the lock limit and a margin; once the row is free, one of Ana's requests sent again under its key
  answers 200 and Ana's name is changed once;
- run on `main` first: the reproduction fails there (the `GET` is still pending, and the `PATCH`es answer only once
  the row is released, never 503).

2.2. `services/api/src/app.test.ts` (no database): a route whose query fails with each of `55P03` and `57014` answers
503, empty, `private, no-store`, and logs one warning with the class and code and nothing of the message; a failure with
another code (`23505`, `40001`, `08006`, and the idle limit's two forms, `25P03` and `CONNECTION_CLOSED`) is still the
500.

2.3. `services/api/src/connection.test.ts` and the worker's: the client is built with `max` 6 and 2.

2.4. The full suites run with the limits on: `db-tests` and `privacy` connect as `tadayo_app`, so any test that held a
lock or a transaction past the limits would now fail.

## 3. Breakages

At the PR's last head, each caught by the test it names:
- B1: the migration sets no `lock_timeout` (the role test; since round 1 the reproduction's transactions set their own);
- B2: `statement_timeout` left out (the role test);
- B3: `idle_in_transaction_session_timeout` left out (the role test);
- B4: `55P03` not mapped (app.test.ts's lock case), and again as B4r against the reproduction (time-limits.test.ts);
- B5: `57014` not mapped (app.test.ts);
- B6: `25P03` mapped to the 503 as well (app.test.ts's other-code case; round 1 took it out);
- B7: every database error mapped to 503 (app.test.ts's other-code case);
- B8: the API's `max` left at the default (connection.test.ts);
- B9: the worker's `max` left at the default (the worker's connection test);
- B10: the warning carries the error's message (app.test.ts's lock case: T52);
- B11: the timeout answered with a 503 of its own, without `private, no-store` (app.test.ts's lock case);
- B12: the API's transactions set no limits of their own (time-limits.test.ts, the API's own);
- B13: only a `begin` without options sets them, so a read-only transaction doesn't (the same test);
- B14: the API's transactions set only the lock limit (the same test: the statement's 57014);
- B15: the wrapper returns a body's array to postgres.js unrun, so its queries never run inside the transaction (the
  same test: the array's rows).

B1 to B3 change the migration, so each runs on a freshly made cluster, which is made again with the real migration
afterwards.
