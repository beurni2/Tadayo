-- 0018: time limits on the role the API, the worker and the migrations use (the outside audit's A7;
-- spec 34; T19; docs/plans/api-b2-db-limits.md, sections 0.1 and 0.2).
--
-- Without them one held row stalls the whole API: every request that waits on it holds one of the API's
-- connections for as long as the row is held, and once they are all taken nobody else's request gets
-- one. These are the role's own session defaults, which Postgres applies at the start of every session as
-- this role, whatever the pooler passes on, so no transaction can forget them. A migration runs as the role
-- itself (tools/ops/src/migrate.ts), and a role may set its own defaults. They take effect in sessions made
-- after this commit, which every deploy makes.
--
-- - lock_timeout, 5 s: a wait on a lock ends with 55P03, and the API answers the bare 503 (failed in
--   services/api/src/app.ts); the transaction rolls back and nothing is committed, so the same request
--   under the same key commits once later (T19). The worker's own LOCK_WAIT_MS is the same.
-- - statement_timeout, 10 s: one statement ends with 57014, answered the same way. The worker's
--   STATEMENT_MS is the same, and it keeps setting both on each of its transactions.
-- - idle_in_transaction_session_timeout, 15 s: a session left idle inside a transaction is ended (25P03)
--   and its transaction rolled back, letting go of its locks. The API waits on nothing but the database
--   inside a transaction (Storage's signing comes after the commit).
--
-- An `ops` script that needs longer sets its own with SET LOCAL (tools/ops/src/spike-time.ts).

ALTER ROLE CURRENT_USER SET lock_timeout = '5s';
ALTER ROLE CURRENT_USER SET statement_timeout = '10s';
ALTER ROLE CURRENT_USER SET idle_in_transaction_session_timeout = '15s';
