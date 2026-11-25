-- 0018: time limits on the role the API, the worker and the migrations use (the outside audit's A7;
-- spec 34; T19; docs/plans/api-b2-db-limits.md, sections 0.1 and 0.2).
--
-- Without them one held row stalls the whole API: every request that waits on it holds one of the API's
-- connections for as long as the row is held, and once they are all taken nobody else's request gets
-- one. These are the role's own session defaults: Postgres applies them when a server session as this role
-- starts, unless the client's startup parameters name others. A migration runs as the role itself
-- (tools/ops/src/migrate.ts), and a role may set its own defaults. A server session that started before this
-- commit keeps what it started with, even through RESET ALL, and Supabase's session pooler hands its server
-- sessions from one client to the next; so the API's transactions also set the two waits' limits themselves
-- (services/api/src/connection.ts TRANSACTION_LIMITS), as the worker's do. These defaults are the floor for
-- every other session as the role that starts after this commit (the worker's reads, the migration runner, the
-- `ops` scripts); one the pooler opened before it has none (docs/LIMITATIONS.md, 2026-11-24).
--
-- - lock_timeout, 5 s: a wait on a lock ends with 55P03, and the API answers the bare 503 (failed in
--   services/api/src/app.ts); the transaction rolls back and nothing is committed, so the same request
--   under the same key commits once later (T19). The worker's own LOCK_WAIT_MS is the same.
-- - statement_timeout, 10 s: a statement ends with 57014, answered the same way. The worker's STATEMENT_MS is
--   the same. The migration runner sends a whole file as one statement, so this bounds a migration file as a
--   whole, and a SET LOCAL inside the file can't lift it; a migration that needs longer needs the runner to set
--   its own limit first.
-- - idle_in_transaction_session_timeout, 15 s: a session left idle inside a transaction is ended and its
--   transaction rolled back, letting go of its locks: a stopped process or a link that hung. Neither the API nor
--   the worker waits on anything but the database inside a transaction (Storage comes after the commit).
--
-- An `ops` script that needs longer sets its own with SET LOCAL, statement by statement
-- (tools/ops/src/spike-time.ts).

ALTER ROLE CURRENT_USER SET lock_timeout = '5s';
ALTER ROLE CURRENT_USER SET statement_timeout = '10s';
ALTER ROLE CURRENT_USER SET idle_in_transaction_session_timeout = '15s';
