-- 0005: schedule versions, their weekday assignments, and the days they make (spec 31:
-- ScheduleVersion, Assignment, Occurrence; spec 05, 06; T1, T2, T5, T6; FQ55, FQ61, FQ63).
--
-- A day stores its date and its two instants, and nothing about its phase: collecting, open and
-- past come from comparing reveal_at and close_at with the server's clock at read time (T1, T5).
-- Its status can only deny it. A day whose star left before it opened is held, which is read
-- from the star's interval (left_at before reveal_at, FQ63), so leaving writes no day. The
-- proposals every member confirms come with B2 (spec 05; FQ55, FQ56).

-- A club's week from a local date on (spec 05). The version in force on a date is the one with
-- the latest effective_from on or before it, and a new one starts after every day already
-- announced, so an announced day never moves (FQ61).
CREATE TABLE app.schedule_versions (
  id app.id PRIMARY KEY,
  club_id app.id NOT NULL REFERENCES app.clubs,
  effective_from date NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (id, club_id),
  UNIQUE (club_id, effective_from)
);
ALTER TABLE app.schedule_versions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER schedule_versions_written_once BEFORE UPDATE OR DELETE ON app.schedule_versions
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('an announced week never changes; a change is a new version (spec 05)');

-- One weekday of a version and its star, never Sunday (T6). At activation, a member's days join
-- the version as they confirm (FQ55); a weekday has one star.
CREATE TABLE app.schedule_assignments (
  schedule_version_id app.id NOT NULL,
  club_id app.id NOT NULL,
  weekday app.weekday NOT NULL,
  star_interval_id app.id NOT NULL,
  -- The first date it opens: the first such weekday from the version's start, or at activation
  -- the first after the member confirmed (FQ55).
  first_date date NOT NULL,
  confirmed_at timestamptz NOT NULL,
  PRIMARY KEY (schedule_version_id, weekday),
  FOREIGN KEY (schedule_version_id, club_id) REFERENCES app.schedule_versions (id, club_id),
  FOREIGN KEY (star_interval_id, club_id) REFERENCES app.memberships (interval_id, club_id),
  CHECK (EXTRACT(isodow FROM first_date) = pg_catalog.array_position(
    ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], weekday::text))
);
ALTER TABLE app.schedule_assignments ENABLE ROW LEVEL SECURITY;
CREATE INDEX schedule_assignments_by_star ON app.schedule_assignments (star_interval_id);
CREATE TRIGGER schedule_assignments_written_once BEFORE UPDATE OR DELETE ON app.schedule_assignments
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a confirmed day never changes; a change is a new version (spec 05)');

-- One person's day in one club. Its instants are resolved by the API's time module in the club's
-- zone: reveal_at is 07:00 on local_date and close_at 01:00 the next morning, each resolved on its
-- own, never one from the other (T2, ADR-008), so the database only compares them.
CREATE TABLE app.occurrences (
  id app.id PRIMARY KEY,
  club_id app.id NOT NULL,
  star_interval_id app.id NOT NULL,
  schedule_version_id app.id NOT NULL,
  local_date date NOT NULL CHECK (EXTRACT(isodow FROM local_date) <> 7),
  reveal_at timestamptz NOT NULL,
  close_at timestamptz NOT NULL,
  -- When it was made: collecting starts then (spec 06), and a member who joined after it joined
  -- later (T15).
  collecting_from timestamptz NOT NULL,
  -- Only what denies a day (T9): an operator's suspension (FQ27), or a cancellation that no trial
  -- command makes yet.
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'suspended', 'cancelled')),
  UNIQUE (id, club_id),
  -- One star per day (T6), and generation retries are idempotent.
  UNIQUE (club_id, local_date),
  FOREIGN KEY (star_interval_id, club_id) REFERENCES app.memberships (interval_id, club_id),
  FOREIGN KEY (schedule_version_id, club_id) REFERENCES app.schedule_versions (id, club_id),
  CHECK (close_at > reveal_at AND close_at - reveal_at < interval '24 hours'),
  CHECK (collecting_from < reveal_at)
);
ALTER TABLE app.occurrences ENABLE ROW LEVEL SECURITY;
-- Home and the club's open and next days: the first rows still to close (T5).
CREATE INDEX occurrences_upcoming ON app.occurrences (club_id, close_at) INCLUDE (reveal_at, star_interval_id)
  WHERE status = 'scheduled';
-- A member's next day, and the next date a returned draft is offered (T4).
CREATE INDEX occurrences_by_star ON app.occurrences (star_interval_id, close_at) WHERE status = 'scheduled';

-- A day is made only for the star whose weekday it is in the version in force on its date, from
-- that weekday's first date on, while the star is a member (T6, FQ61, FQ63). Sunday is left to
-- the CHECK.
CREATE FUNCTION app.occurrences_insert_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  version app.schedule_versions%ROWTYPE;
BEGIN
  IF EXTRACT(isodow FROM NEW.local_date) = 7 THEN
    RETURN NEW;
  END IF;
  SELECT * INTO version FROM app.schedule_versions WHERE id = NEW.schedule_version_id;
  IF version.effective_from > NEW.local_date
     OR EXISTS (SELECT FROM app.schedule_versions
                 WHERE club_id = NEW.club_id AND effective_from > version.effective_from
                   AND effective_from <= NEW.local_date) THEN
    RAISE EXCEPTION 'app.occurrences: % isn''t in force on % (FQ61)', NEW.schedule_version_id, NEW.local_date
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NOT EXISTS (SELECT FROM app.schedule_assignments
                  WHERE schedule_version_id = NEW.schedule_version_id
                    AND weekday::text = (ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'])
                                        [EXTRACT(isodow FROM NEW.local_date)::integer]
                    AND star_interval_id = NEW.star_interval_id
                    AND first_date <= NEW.local_date) THEN
    RAISE EXCEPTION 'app.occurrences: % isn''t %''s day in its schedule (T6)', NEW.local_date, NEW.star_interval_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NOT EXISTS (SELECT FROM app.memberships WHERE interval_id = NEW.star_interval_id AND state = 'active') THEN
    RAISE EXCEPTION 'app.occurrences: % is no longer a member, so no day is made for them (FQ63)', NEW.star_interval_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER occurrences_insert_guard BEFORE INSERT ON app.occurrences
  FOR EACH ROW EXECUTE FUNCTION app.occurrences_insert_guard();

-- An announced day never moves (T4, T6, FQ61): only its status changes, and only towards denial.
CREATE FUNCTION app.occurrences_status_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT (NEW.status = OLD.status
          OR (OLD.status = 'scheduled' AND NEW.status IN ('suspended', 'cancelled'))
          OR (OLD.status = 'suspended' AND NEW.status = 'cancelled')) THEN
    RAISE EXCEPTION 'app.occurrences: a day goes from % to % (T9)', OLD.status, NEW.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER occurrences_keep BEFORE UPDATE ON app.occurrences
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns(
    'id', 'club_id', 'star_interval_id', 'schedule_version_id', 'local_date', 'reveal_at', 'close_at', 'collecting_from');
CREATE TRIGGER occurrences_status_guard BEFORE UPDATE ON app.occurrences
  FOR EACH ROW EXECUTE FUNCTION app.occurrences_status_guard();
CREATE TRIGGER occurrences_no_delete BEFORE DELETE ON app.occurrences
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a day is never deleted: its drops and memories name it');

-- A new version starts after every day already made for the club (FQ61).
CREATE FUNCTION app.schedule_versions_insert_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT FROM app.occurrences WHERE club_id = NEW.club_id AND local_date >= NEW.effective_from) THEN
    RAISE EXCEPTION 'app.schedule_versions: a version from % would move a day already announced (FQ61)', NEW.effective_from
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER schedule_versions_insert_guard BEFORE INSERT ON app.schedule_versions
  FOR EACH ROW EXECUTE FUNCTION app.schedule_versions_insert_guard();
