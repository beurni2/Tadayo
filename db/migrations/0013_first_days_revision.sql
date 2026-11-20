-- 0013: a proposal's week, proposed again (spec 05; T6, T33; FQ39, FQ48, FQ55, FQ57, FQ102).
--
-- A join or a leave in a club's first days, before any day is confirmed, is a revision of the
-- proposed week (FQ55, FQ102). Where spec 05's table keeps the days each member has, nobody is
-- moved and only the new member's rows are written. Where it changes them (a club passing between
-- three and four members), every member holds the days the revision proposes for them. 0012 keeps
-- what was proposed for good (`suggested` never changes, a proposed day is never deleted), so that
-- no choice erases it; a revision therefore writes its week BESIDE the earlier one and changes no
-- row of it. `week_revision` says which week a proposal is on, and which week a row belongs to.
-- Only the current week's rows are read, counted, changed or confirmed; an earlier week's rows
-- stay exactly as they were.
--
-- The five guards of 0012 that read the days are replaced here with the same rules, each for the
-- current week. One rule changes: `days_per_member` moved while "nobody has confirmed and nobody
-- holds more than the new number"; it now moves only with a new week, which has no row yet, while
-- nobody has confirmed.
--
-- No table, column or row is dropped or rewritten (FQ39): two columns are added, each row of today
-- is in week 1, and the days' key gains the week.

ALTER TABLE app.schedule_proposals
  ADD COLUMN week_revision smallint NOT NULL DEFAULT 1 CHECK (week_revision >= 1);
ALTER TABLE app.schedule_proposal_days
  ADD COLUMN week_revision smallint NOT NULL DEFAULT 1 CHECK (week_revision >= 1);
-- The same member may be proposed the same weekday in two weeks.
ALTER TABLE app.schedule_proposal_days
  DROP CONSTRAINT schedule_proposal_days_pkey,
  ADD PRIMARY KEY (proposal_id, interval_id, week_revision, weekday);

-- As 0012's, with the week: it only rises, one week at a time, with the next version, while the
-- proposal stays open and nobody it includes has confirmed (a member who confirmed and left
-- included: their day is in the week); and the days a member takes change only with it.
CREATE OR REPLACE FUNCTION app.schedule_proposals_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.state <> 'open' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'app.schedule_proposals: % has ended and never changes', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.version < OLD.version THEN
    RAISE EXCEPTION 'app.schedule_proposals: a version never falls'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.state <> OLD.state AND NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'app.schedule_proposals: its state moves with its next version (T33)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.state = 'applied' AND OLD.state = 'open' AND NEW.reason = 'activation' AND (
       NOT EXISTS (SELECT FROM app.schedule_proposal_members m
                     JOIN app.memberships ms ON ms.interval_id = m.interval_id
                    WHERE m.proposal_id = NEW.id AND ms.state = 'active')
       OR EXISTS (SELECT FROM app.schedule_proposal_members m
                    JOIN app.memberships ms ON ms.interval_id = m.interval_id
                   WHERE m.proposal_id = NEW.id AND ms.state = 'active' AND m.confirmed_at IS NULL)) THEN
    RAISE EXCEPTION 'app.schedule_proposals: the first days of % apply once every member still in the club has confirmed', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.week_revision <> OLD.week_revision THEN
    IF NEW.week_revision <> OLD.week_revision + 1 THEN
      RAISE EXCEPTION 'app.schedule_proposals: the week of % is proposed again one week at a time, never back', NEW.id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'app.schedule_proposals: a new week of % comes with its next version (T33)', NEW.id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.state <> 'open' THEN
      RAISE EXCEPTION 'app.schedule_proposals: the week of % is proposed again only while it stays open', NEW.id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF EXISTS (SELECT FROM app.schedule_proposal_members
                WHERE proposal_id = NEW.id AND confirmed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'app.schedule_proposals: the week of % is proposed again only while nobody has confirmed (FQ102)', NEW.id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  ELSIF NEW.days_per_member <> OLD.days_per_member THEN
    RAISE EXCEPTION 'app.schedule_proposals: the days a member takes in % change only with a new week (FQ102)', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;

-- As 0012's, and first: a row is written, changed or deleted only in its proposal's current week.
CREATE OR REPLACE FUNCTION app.schedule_proposal_days_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  the_proposal app.id;
  the_interval app.id;
  the_week smallint;
  proposal app.schedule_proposals%ROWTYPE;
  member_confirmed_at timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    the_proposal := OLD.proposal_id;
    the_interval := OLD.interval_id;
    the_week := OLD.week_revision;
  ELSE
    the_proposal := NEW.proposal_id;
    the_interval := NEW.interval_id;
    the_week := NEW.week_revision;
  END IF;
  SELECT confirmed_at INTO member_confirmed_at FROM app.schedule_proposal_members
   WHERE proposal_id = the_proposal AND interval_id = the_interval FOR UPDATE;
  SELECT * INTO proposal FROM app.schedule_proposals WHERE id = the_proposal FOR SHARE;
  IF proposal.state IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'app.schedule_proposal_days: holds change only while their proposal is open'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF the_week <> proposal.week_revision OR (TG_OP = 'UPDATE' AND OLD.week_revision <> proposal.week_revision) THEN
    RAISE EXCEPTION 'app.schedule_proposal_days: a day is written, changed or deleted only in its proposal''s current week, % (FQ102)',
      proposal.week_revision
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF member_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'app.schedule_proposal_days: % has confirmed, and chooses nothing after (FQ57)', the_interval
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NOT EXISTS (SELECT FROM app.memberships WHERE interval_id = the_interval AND state = 'active') THEN
    RAISE EXCEPTION 'app.schedule_proposal_days: % is no longer a member, and holds nothing (FQ102)', the_interval
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.suggested THEN
      RAISE EXCEPTION 'app.schedule_proposal_days: a proposed day is set aside, never deleted (FQ48)'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.held AND (TG_OP = 'INSERT' OR NOT OLD.held)
     AND EXISTS (SELECT FROM app.schedule_assignments
                  WHERE schedule_version_id = proposal.schedule_version_id AND weekday = NEW.weekday) THEN
    RAISE EXCEPTION 'app.schedule_proposal_days: % is confirmed, and a confirmed day is taken (FQ48)', NEW.weekday
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
-- A row stays in its week.
DROP TRIGGER schedule_proposal_days_keep ON app.schedule_proposal_days;
CREATE TRIGGER schedule_proposal_days_keep BEFORE UPDATE ON app.schedule_proposal_days
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns(
    'proposal_id', 'interval_id', 'weekday', 'suggested', 'week_revision');

-- As 0012's, at commit, for the proposal's week as it then is: a row of a week the proposal has
-- left since isn't counted, and holds nothing.
CREATE OR REPLACE FUNCTION app.schedule_proposal_days_count() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  most smallint;
  week smallint;
  holds bigint;
BEGIN
  SELECT days_per_member, week_revision INTO most, week FROM app.schedule_proposals WHERE id = NEW.proposal_id;
  SELECT pg_catalog.count(*) INTO holds FROM app.schedule_proposal_days
   WHERE proposal_id = NEW.proposal_id AND interval_id = NEW.interval_id AND week_revision = week AND held;
  IF holds > most THEN
    RAISE EXCEPTION 'app.schedule_proposal_days: % holds at most % days in % (spec 05)',
      NEW.interval_id, most, NEW.proposal_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;

-- As 0012's, for the days held in the proposal's current week.
CREATE OR REPLACE FUNCTION app.schedule_confirmation_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  proposal app.schedule_proposals%ROWTYPE;
  held_days text[];
  written text[];
  contested text;
BEGIN
  SELECT * INTO proposal FROM app.schedule_proposals WHERE id = NEW.proposal_id;
  SELECT COALESCE(pg_catalog.array_agg(weekday::text ORDER BY weekday::text), '{}') INTO held_days
    FROM app.schedule_proposal_days
   WHERE proposal_id = NEW.proposal_id AND interval_id = NEW.interval_id
     AND week_revision = proposal.week_revision AND held;
  IF pg_catalog.cardinality(held_days) <> proposal.days_per_member THEN
    RAISE EXCEPTION 'app.schedule_proposal_members: % holds % of the % days a member confirms at once (book p11, FQ99)',
      NEW.interval_id, pg_catalog.cardinality(held_days), proposal.days_per_member
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT d.weekday::text INTO contested
    FROM app.schedule_proposal_days d
    JOIN app.schedule_proposal_members m ON m.proposal_id = d.proposal_id AND m.interval_id = d.interval_id
    JOIN app.memberships ms ON ms.interval_id = d.interval_id
   WHERE d.proposal_id = NEW.proposal_id AND d.interval_id <> NEW.interval_id AND d.held
     AND d.week_revision = proposal.week_revision
     AND d.weekday::text = ANY (held_days)
     AND (m.confirmed_at IS NOT NULL OR ms.state = 'active')
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'app.schedule_proposal_members: % can''t confirm %: another member holds it too (FQ55)',
      NEW.interval_id, contested
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF proposal.reason = 'activation' THEN
    SELECT COALESCE(pg_catalog.array_agg(weekday::text ORDER BY weekday::text), '{}') INTO written
      FROM app.schedule_assignments
     WHERE schedule_version_id = proposal.schedule_version_id AND star_interval_id = NEW.interval_id
       AND confirmed_at = NEW.confirmed_at;
    IF written <> held_days THEN
      RAISE EXCEPTION 'app.schedule_proposal_members: the % days % confirms aren''t the days written into the week for them (T6)',
        proposal.days_per_member, NEW.interval_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NULL;
END
$$;

-- As 0012's, for a day its star holds in the current week of the first days that confirmed it. A
-- club's week may be used by more than one first days (the first ended with no day confirmed, and
-- the club started again, FQ102): the day is the confirmation of a member of any of them.
CREATE OR REPLACE FUNCTION app.schedule_assignment_confirmed_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT FROM app.schedule_proposals
                  WHERE schedule_version_id = NEW.schedule_version_id AND reason = 'activation') THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT FROM app.schedule_proposals p
                   JOIN app.schedule_proposal_members m ON m.proposal_id = p.id
                   JOIN app.schedule_proposal_days d
                     ON d.proposal_id = m.proposal_id AND d.interval_id = m.interval_id
                    AND d.week_revision = p.week_revision
                  WHERE p.schedule_version_id = NEW.schedule_version_id AND p.reason = 'activation'
                    AND m.interval_id = NEW.star_interval_id
                    AND m.confirmed_at = NEW.confirmed_at AND d.weekday = NEW.weekday AND d.held) THEN
    RAISE EXCEPTION 'app.schedule_assignments: % joins the first days'' week only as the confirmation of %, who holds it (T6)',
      NEW.weekday, NEW.star_interval_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;
