-- The dev clock (ADR-013; packages/domain/src/time/clock.ts): the offset `dev`'s server clock adds
-- to Postgres's own, so a gate can show the 7 AM reveal, the 1 AM close and a cutoff race on
-- demand. Only `dev` has it, so it isn't a numbered migration, which every environment runs. On
-- `dev`, `tools/ops`' `dev-clock` (slice 10a) makes it as `tadayo_app`, which then owns it, and
-- moves it; `dev`'s API refuses to start without it, and `prod`'s refuses to start with it.
--
-- One row at most; no row is no offset. Microseconds, Postgres's precision, never an interval: an
-- interval's days follow the session's time zone, so a day's offset could be 23 or 25 hours.
-- It only moves forward: a clock moved back past a reveal would let a day that has opened take
-- new drops (T3), and every row stamped later than the new time could no longer change (the
-- guards of migration 0006 refuse a change whose instant goes back).
-- Closed like every table in the schema (migration 0001, T53): row-level security on, no policy,
-- nothing granted. Whoever runs this file owns what it makes, so it refuses any role but
-- `tadayo_app`: made by another, the table would be one the API can't read and its function one
-- that PUBLIC could run.
DO $$
BEGIN
  IF current_user <> 'tadayo_app' THEN
    RAISE EXCEPTION 'app.dev_clock is made as tadayo_app, which then owns it (T53), not as %', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$$;

CREATE TABLE app.dev_clock (
  only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row),
  offset_microseconds bigint NOT NULL CHECK (offset_microseconds >= 0)
);
ALTER TABLE app.dev_clock ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION app.dev_clock_forward() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.offset_microseconds < OLD.offset_microseconds THEN
    RAISE EXCEPTION 'app.dev_clock: % microseconds ahead would move the clock back from % (T3)',
      NEW.offset_microseconds, OLD.offset_microseconds
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
REVOKE EXECUTE ON FUNCTION app.dev_clock_forward() FROM PUBLIC;
CREATE TRIGGER dev_clock_forward BEFORE UPDATE ON app.dev_clock
  FOR EACH ROW EXECUTE FUNCTION app.dev_clock_forward();
CREATE TRIGGER dev_clock_kept BEFORE DELETE ON app.dev_clock
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('the dev clock never moves back (T3)');
CREATE TRIGGER dev_clock_no_truncate BEFORE TRUNCATE ON app.dev_clock
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('the dev clock never moves back (T3)');
