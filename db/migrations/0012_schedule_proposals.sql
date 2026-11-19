-- 0012: the proposals a club's members confirm (spec 31: ScheduleVersion; spec 04, 05; T6, T33,
-- T57; FQ39, FQ48, FQ55, FQ57, FQ79, FQ99, FQ102). 0005 left them to B2.
--
-- A proposal is one proposed week. In a club's first days (`activation`) each member holds the
-- days proposed for them until they choose others, and each day joins the club's week as its
-- member confirms it (FQ55). What a member holds changes with every choice, so it lives here and
-- never in schedule_assignments, which holds confirmed days alone and is written once. Two or
-- more members may hold the same day: that is the contest, kept until all but one have chosen
-- another, and nothing here settles it (T6). A membership change (`membership_change`) is the
-- other kind (spec 05; FQ56); its own rules come with the PR that builds it.
--
-- The schedule's commands decide who may choose and confirm what, under the club's row lock
-- (packages/domain/src/schedule/). These triggers are the last guards behind them: a day is
-- confirmed only by a member who holds it alone, and joins the first days' week only as its
-- holder's confirmation; a member who has confirmed, or who has left, changes nothing after; the
-- first days apply only once every member still in the club has confirmed; and a proposal that
-- has ended never changes.
--
-- No table, column or row is dropped or rewritten (FQ39).

CREATE TABLE app.schedule_proposals (
  id app.id PRIMARY KEY,
  club_id app.id NOT NULL REFERENCES app.clubs,
  reason text NOT NULL CHECK (reason IN ('activation', 'membership_change')),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'applied', 'superseded')),
  -- What a choice or a confirmation sends as expected_version. It moves with the state, and with
  -- a new revision of the proposed week, never on a choice or on a confirmation that leaves the
  -- state as it was, so it tells nobody that someone else has acted (T33).
  version app.version NOT NULL DEFAULT 1 CHECK (version >= 1),
  -- The first days': the club's first local date, never an opening date (FQ79).
  effective_from date NOT NULL,
  -- Spec 05's table for the roster it was last proposed for.
  days_per_member smallint NOT NULL CHECK (days_per_member IN (1, 2)),
  -- The week its confirmed days join: the first days' own, made with the proposal.
  schedule_version_id app.id,
  -- The proposal that replaced it, when one did.
  replaced_by app.id,
  created_at timestamptz NOT NULL,
  closed_at timestamptz,
  UNIQUE (id, club_id),
  FOREIGN KEY (schedule_version_id, club_id) REFERENCES app.schedule_versions (id, club_id),
  FOREIGN KEY (replaced_by, club_id) REFERENCES app.schedule_proposals (id, club_id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK ((state = 'open') = (closed_at IS NULL)),
  CHECK (closed_at IS NULL OR closed_at >= created_at),
  CHECK (reason <> 'activation' OR schedule_version_id IS NOT NULL),
  CHECK (replaced_by IS NULL OR (state = 'superseded' AND replaced_by <> id))
);
ALTER TABLE app.schedule_proposals ENABLE ROW LEVEL SECURITY;
-- The contract's one `Schedule.proposal`.
CREATE UNIQUE INDEX schedule_proposals_one_open ON app.schedule_proposals (club_id) WHERE state = 'open';

-- A proposal ends once, with the next version, and never changes after; its version never falls.
-- The first days apply only when every member they include who is still in the club has confirmed,
-- and at least one has (packages/domain/src/schedule/decide.ts `everyoneConfirmed`). The days a
-- member takes change only while nobody has confirmed and nobody holds more than the new number.
CREATE FUNCTION app.schedule_proposals_guard() RETURNS trigger
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
  IF NEW.days_per_member <> OLD.days_per_member AND (
       EXISTS (SELECT FROM app.schedule_proposal_members
                WHERE proposal_id = NEW.id AND confirmed_at IS NOT NULL)
       OR EXISTS (SELECT FROM app.schedule_proposal_days
                   WHERE proposal_id = NEW.id AND held
                   GROUP BY interval_id HAVING pg_catalog.count(*) > NEW.days_per_member)) THEN
    RAISE EXCEPTION 'app.schedule_proposals: the days a member takes in % change only while nobody has confirmed or holds more', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER schedule_proposals_keep BEFORE UPDATE ON app.schedule_proposals
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns(
    'id', 'club_id', 'reason', 'effective_from', 'schedule_version_id', 'created_at');
CREATE TRIGGER schedule_proposals_guard BEFORE UPDATE ON app.schedule_proposals
  FOR EACH ROW EXECUTE FUNCTION app.schedule_proposals_guard();
CREATE TRIGGER schedule_proposals_no_delete BEFORE DELETE ON app.schedule_proposals
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a proposal is kept: its members confirmed it');
CREATE TRIGGER schedule_proposals_no_truncate BEFORE TRUNCATE ON app.schedule_proposals
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('a proposal is kept: its members confirmed it');

-- The members a proposal includes, by membership interval: a member who joins later isn't one
-- (FQ100), and one who leaves stays listed and holds nothing, which is read from the interval.
CREATE TABLE app.schedule_proposal_members (
  proposal_id app.id NOT NULL,
  club_id app.id NOT NULL,
  interval_id app.id NOT NULL,
  -- When they confirmed their days, once and for good (FQ57); FQ79's 24 hours run from it.
  confirmed_at timestamptz,
  PRIMARY KEY (proposal_id, interval_id),
  FOREIGN KEY (proposal_id, club_id) REFERENCES app.schedule_proposals (id, club_id),
  FOREIGN KEY (interval_id, club_id) REFERENCES app.memberships (interval_id, club_id)
);
ALTER TABLE app.schedule_proposal_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX schedule_proposal_members_by_interval ON app.schedule_proposal_members (interval_id);

-- BEFORE INSERT OR UPDATE: only an open proposal gains a member or a confirmation, and only a
-- member still in the club confirms (FQ102). A confirmation
-- takes the proposal's row FOR UPDATE and a change of holds takes it FOR SHARE
-- (schedule_proposal_days_guard), so neither passes the other's check unseen: a hold on a day
-- being confirmed waits and is then refused, and a confirmation of a day being taken waits and
-- then finds its other holder.
CREATE FUNCTION app.schedule_proposal_members_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  proposal_state text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT state INTO proposal_state FROM app.schedule_proposals WHERE id = NEW.proposal_id FOR UPDATE;
  ELSE
    SELECT state INTO proposal_state FROM app.schedule_proposals WHERE id = NEW.proposal_id FOR SHARE;
  END IF;
  IF proposal_state IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'app.schedule_proposal_members: only an open proposal gains a member or a confirmation'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NOT EXISTS (SELECT FROM app.memberships
                                       WHERE interval_id = NEW.interval_id AND state = 'active') THEN
    RAISE EXCEPTION 'app.schedule_proposal_members: % is no longer a member, and confirms nothing (FQ102)', NEW.interval_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER schedule_proposal_members_keep BEFORE UPDATE ON app.schedule_proposal_members
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('proposal_id', 'club_id', 'interval_id');
CREATE TRIGGER schedule_proposal_members_once BEFORE UPDATE ON app.schedule_proposal_members
  FOR EACH ROW EXECUTE FUNCTION app.set_once('confirmed_at');
CREATE TRIGGER schedule_proposal_members_start BEFORE INSERT ON app.schedule_proposal_members
  FOR EACH ROW WHEN (NEW.confirmed_at IS NOT NULL)
  EXECUTE FUNCTION app.refuse_change('a member starts unconfirmed (FQ57)');
CREATE TRIGGER schedule_proposal_members_guard BEFORE INSERT OR UPDATE ON app.schedule_proposal_members
  FOR EACH ROW EXECUTE FUNCTION app.schedule_proposal_members_guard();
CREATE TRIGGER schedule_proposal_members_no_delete BEFORE DELETE ON app.schedule_proposal_members
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a proposal keeps the members it was made for');
CREATE TRIGGER schedule_proposal_members_no_truncate BEFORE TRUNCATE ON app.schedule_proposal_members
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('a proposal keeps the members it was made for');

-- Which weekday is proposed for which member, and who holds it now. A member holds the days
-- proposed for them until they first choose, then exactly what they last chose (FQ48): a proposed
-- day they set aside stays as proposed and not held, so only they see it was theirs, and a day
-- they chose that wasn't proposed for them is a row that goes when they set it aside. No key
-- spans members: two may hold one weekday (FQ55).
CREATE TABLE app.schedule_proposal_days (
  proposal_id app.id NOT NULL,
  interval_id app.id NOT NULL,
  weekday app.weekday NOT NULL,
  suggested boolean NOT NULL,
  held boolean NOT NULL,
  PRIMARY KEY (proposal_id, interval_id, weekday),
  FOREIGN KEY (proposal_id, interval_id) REFERENCES app.schedule_proposal_members (proposal_id, interval_id),
  CHECK (suggested OR held)
);
ALTER TABLE app.schedule_proposal_days ENABLE ROW LEVEL SECURITY;

-- BEFORE INSERT OR UPDATE OR DELETE: holds change only in an open proposal, only for a member who
-- hasn't confirmed (FQ57) and is still in the club (FQ102), and never onto a day already confirmed,
-- since only a confirmed day is taken (FQ48). It takes the member's own row first, FOR UPDATE, so
-- two changes of one member's holds are in one order and the count at commit sees both
-- (schedule_proposal_days_count); then it holds the proposal's row against a confirmation
-- (schedule_proposal_members_guard), which takes the two rows in the same order.
CREATE FUNCTION app.schedule_proposal_days_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  the_proposal app.id;
  the_interval app.id;
  proposal app.schedule_proposals%ROWTYPE;
  member_confirmed_at timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    the_proposal := OLD.proposal_id;
    the_interval := OLD.interval_id;
  ELSE
    the_proposal := NEW.proposal_id;
    the_interval := NEW.interval_id;
  END IF;
  SELECT confirmed_at INTO member_confirmed_at FROM app.schedule_proposal_members
   WHERE proposal_id = the_proposal AND interval_id = the_interval FOR UPDATE;
  SELECT * INTO proposal FROM app.schedule_proposals WHERE id = the_proposal FOR SHARE;
  IF proposal.state IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'app.schedule_proposal_days: holds change only while their proposal is open'
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
CREATE TRIGGER schedule_proposal_days_keep BEFORE UPDATE ON app.schedule_proposal_days
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('proposal_id', 'interval_id', 'weekday', 'suggested');
CREATE TRIGGER schedule_proposal_days_guard BEFORE INSERT OR UPDATE OR DELETE ON app.schedule_proposal_days
  FOR EACH ROW EXECUTE FUNCTION app.schedule_proposal_days_guard();
CREATE TRIGGER schedule_proposal_days_no_truncate BEFORE TRUNCATE ON app.schedule_proposal_days
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('holds change one member at a time');

-- At commit: a member holds at most the proposal's days_per_member days (spec 05), so a choice
-- may release and take days in any order within its transaction.
CREATE FUNCTION app.schedule_proposal_days_count() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  most smallint;
  holds bigint;
BEGIN
  SELECT days_per_member INTO most FROM app.schedule_proposals WHERE id = NEW.proposal_id;
  SELECT pg_catalog.count(*) INTO holds FROM app.schedule_proposal_days
   WHERE proposal_id = NEW.proposal_id AND interval_id = NEW.interval_id AND held;
  IF holds > most THEN
    RAISE EXCEPTION 'app.schedule_proposal_days: % holds at most % days in % (spec 05)',
      NEW.interval_id, most, NEW.proposal_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER schedule_proposal_days_count AFTER INSERT OR UPDATE ON app.schedule_proposal_days
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.held)
  EXECUTE FUNCTION app.schedule_proposal_days_count();

-- At commit, for a confirmation: the member holds exactly days_per_member days (book p11: both
-- days at once, FQ99); nobody else holds any of them, a member who left aside, since they hold
-- nothing (FQ55, FQ102); and in the first days each is written into the proposal's week for them
-- with the confirmation's own instant, which FQ79's first date is counted from (T6).
CREATE FUNCTION app.schedule_confirmation_guard() RETURNS trigger
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
   WHERE proposal_id = NEW.proposal_id AND interval_id = NEW.interval_id AND held;
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
CREATE CONSTRAINT TRIGGER schedule_confirmation_guard AFTER UPDATE ON app.schedule_proposal_members
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.confirmed_at IS NOT NULL AND OLD.confirmed_at IS NULL)
  EXECUTE FUNCTION app.schedule_confirmation_guard();

-- At commit, for a day written into a first days' week: it is its star's confirmation and nothing
-- else. The star confirmed at the row's own instant and holds that weekday in the proposal, so no
-- day joins the week unconfirmed, for a member who doesn't hold it, or after the confirmation
-- (T6; FQ55, FQ57). schedule_confirmation_guard checks the same from the member's side: with it,
-- the week's rows for a member are exactly the days they confirmed. A week no first days made
-- (a membership change's, or a test's own) isn't judged here.
CREATE FUNCTION app.schedule_assignment_confirmed_guard() RETURNS trigger
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
CREATE CONSTRAINT TRIGGER schedule_assignment_confirmed_guard AFTER INSERT ON app.schedule_assignments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.schedule_assignment_confirmed_guard();
CREATE INDEX schedule_proposals_by_version ON app.schedule_proposals (schedule_version_id);
