-- 0020: the failures the founder is told of (the outside audit's B7; FQ150; spec 34; TECH-DESIGN section 5, the
-- dead-letter table "that raises an alert"; T1, T52, T53, T54; docs/plans/api-b2-failure-alerts.md, section 1.1).
--
-- One row a source and a code: the API's 5xx answers, by the class and code of the error behind each
-- (services/api/src/failure-count.ts), and the worker's dead outbox events, by topic and code
-- (services/worker/src/outbox.ts). `total` counts every failure so far; `reported` is the part an alert has told of
-- (tools/ops/src/failure-alert.ts). Both only grow (`failure_counts_grow`), so what is new is `total - reported`,
-- and neither a writer nor the check reads a clock (T1). A row holds a code and two numbers, never an id, a name, a
-- date or a message (T52).
--
-- The writers: `countFailures` (packages/domain/src/failure-count.ts) adds to `total`, every code of one call in
-- one statement, in the codes' "C" order; the check marks `reported`, a row at a time in the same order, in one
-- transaction. Each takes its rows' locks in that one order, so none of them deadlocks another.

CREATE TABLE app.failure_counts (
  source text NOT NULL CHECK (source IN ('api', 'worker')),
  -- `app.outbox_events.last_error`'s alphabet (0009), and its length: a class and a code (`Fault:propose_roster_6`,
  -- `PostgresError:57014`), a status and an operation (`503:getHealth`), a topic and a code
  -- (`upload.prepare:lease_lapsed`). Postgres's regular expressions count to 255 at most, so the length is its own check.
  code text NOT NULL CHECK (pg_catalog.char_length(code) BETWEEN 1 AND 200 AND code ~ '^[A-Za-z0-9_.:-]+$'),
  -- A row is made by its first failure.
  total bigint NOT NULL CHECK (total >= 1),
  reported bigint NOT NULL DEFAULT 0 CHECK (reported >= 0),
  CHECK (reported <= total),
  PRIMARY KEY (source, code)
);
ALTER TABLE app.failure_counts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER failure_counts_keep BEFORE UPDATE ON app.failure_counts
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('source', 'code');

-- A count is never taken back and a mark never lowered: an update that lowers either is refused.
CREATE FUNCTION app.failure_counts_grow() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.total < OLD.total OR NEW.reported < OLD.reported THEN
    RAISE EXCEPTION 'app.failure_counts: a count and its mark only grow'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER failure_counts_grow BEFORE UPDATE ON app.failure_counts
  FOR EACH ROW EXECUTE FUNCTION app.failure_counts_grow();
