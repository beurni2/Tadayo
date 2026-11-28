-- 0020: the failures the founder is told of (the outside audit's B7; FQ150; spec 34; TECH-DESIGN section 5, the
-- dead-letter table "that raises an alert"; T1, T52, T53, T54; docs/plans/api-b2-failure-alerts.md, section 1.1).
--
-- One row a source and a code: the API's 5xx answers, by the class and code of the error behind each
-- (services/api/src/failure-count.ts), and the worker's dead outbox events, by topic and code
-- (services/worker/src/outbox.ts). `total` counts every failure so far; `reported` is the part an alert has told of
-- (tools/ops/src/failure-alert.ts). Both only grow (`failure_counts_grow`), a new row starts with nothing reported,
-- and a row is never deleted (`failure_counts_no_delete`, `failure_counts_no_truncate`), so what is new is
-- `total - reported`, a failure counted is never lost to a write, and neither a writer nor the check reads a clock
-- (T1). A row holds a code and two numbers, never an id, a name, a date or a message (T52).
--
-- The writers: `countFailures` (packages/domain/src/failure-count.ts) adds to `total`, every code of one call in
-- one statement, in the codes' "C" order; the check marks `reported` in one statement that locks its rows in the same
-- order first (`markReported`). Each takes its rows' locks in that one order, so none of them deadlocks another.

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

-- A count is never taken back and a mark never lowered: an update that lowers either is refused, and so is a new row
-- that says some of its failures were already reported.
CREATE FUNCTION app.failure_counts_grow() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.reported <> 0 THEN
      RAISE EXCEPTION 'app.failure_counts: a new count has nothing reported yet'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  ELSIF NEW.total < OLD.total OR NEW.reported < OLD.reported THEN
    RAISE EXCEPTION 'app.failure_counts: a count and its mark only grow'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER failure_counts_grow BEFORE INSERT OR UPDATE ON app.failure_counts
  FOR EACH ROW EXECUTE FUNCTION app.failure_counts_grow();
CREATE TRIGGER failure_counts_no_delete BEFORE DELETE ON app.failure_counts
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a failure count is never deleted: what it holds may not be told yet');
CREATE TRIGGER failure_counts_no_truncate BEFORE TRUNCATE ON app.failure_counts
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('a failure count is never deleted: what it holds may not be told yet');
