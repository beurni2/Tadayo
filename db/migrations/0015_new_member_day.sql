-- 0015: a new member picks a free day (spec 05; T6, T9, T33; FQ39, FQ48, FQ55, FQ57, FQ61, FQ63; the
-- founder's answers to FQ125 to FQ127 and to the three-to-four card, FQ129 to FQ131;
-- docs/plans/api-b2-new-member-day.md, section 2).
--
-- 0014 made a membership change one proposed week every member confirms as a whole, from a Monday
-- after every day already made. The founder replaced it: once a club's first days have applied,
-- nobody already in the week is asked anything or moves, and a new member picks free days and
-- chooses and confirms them as the first days do, each day theirs from that weekday in the week
-- after (packages/domain/src/schedule/change.ts, settle-change.ts, confirm-days.ts). Each new
-- member's confirmation writes a new week from the club's local date that day, which holds every
-- day of the latest week whose member is still in the club, as it was, and the new member's days;
-- a fourth member's join frees the others' second days in a new week the same way. Days are made
-- four weeks ahead (FQ115), so a week now starts before days already made, and the rule that
-- refused that (0005's schedule_versions_insert_guard, FQ61) is said again of the days themselves:
-- an announced day never goes to someone else.
--
-- 1. A date has one live day (T6): occurrences' UNIQUE (club_id, local_date) becomes a unique index
--    on the days not cancelled. A day of a member who left, on a weekday a new member picks, from the
--    new member's first date on, is cancelled, and the new member's day is made on that date (FQ129);
--    so is a day a fourth member's join freed, from the next week on. A cancelled day is kept, and
--    denies everything (T9).
-- 2. An announced day never moves (FQ61, T6): at commit, a day written into a week never gives a date
--    that already has a live day, on or after the week's start and the day's first date and while the
--    week is in force, to anyone but that day's star. A new week no longer has to start after every
--    day made; 0005's guard keeps only its lock on the club's row. And a week after the first days
--    holds only days its members had in the week before, as they were, and new members' confirmations.
-- 3. A membership change is proposed open at version 1 in its one week, with no week of its own,
--    once the club's first days have applied, its `effective_from` the club's local date it opened
--    on (the Monday rule goes). Its members choose and confirm as the first days' do (0013's rules),
--    a day of the club's latest week whose member is still in the club is never held, and a
--    confirmation writes the member's days into the club's latest week at its own instant. It
--    applies once every member it includes who is still in the club has confirmed. Its week is still
--    never proposed again: when the club's size changes the days each, another pick replaces it.
--
-- No table, column or row is dropped or rewritten (FQ39): one constraint is replaced by an index of
-- the same rule for the days not cancelled, four functions are replaced, and two are added.

-- 1. One live day per club and date.
ALTER TABLE app.occurrences DROP CONSTRAINT occurrences_club_id_local_date_key;
CREATE UNIQUE INDEX occurrences_one_live_day ON app.occurrences (club_id, local_date)
  WHERE status <> 'cancelled';

-- 2. A new week holds the club's row until it commits, as 0005's did: no day is made meanwhile under
-- the week it follows. What it may hold is judged at commit, day by day, below.
CREATE OR REPLACE FUNCTION app.schedule_versions_insert_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM FROM app.clubs WHERE id = NEW.club_id FOR UPDATE;
  RETURN NEW;
END
$$;

-- At commit, so that the days a confirmation cancels in its own transaction are cancelled by then.
CREATE FUNCTION app.schedule_assignment_keeps_announced() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  starts date;
  announced date;
BEGIN
  SELECT effective_from INTO starts FROM app.schedule_versions WHERE id = NEW.schedule_version_id;
  SELECT o.local_date INTO announced
    FROM app.occurrences o
   WHERE o.club_id = NEW.club_id AND o.status <> 'cancelled' AND o.star_interval_id <> NEW.star_interval_id
     AND o.local_date >= GREATEST(starts, NEW.first_date)
     AND EXTRACT(isodow FROM o.local_date) = pg_catalog.array_position(
           ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], NEW.weekday::text)
     -- The week is in force on that date: no later week has started by then.
     AND NOT EXISTS (SELECT FROM app.schedule_versions v
                      WHERE v.club_id = NEW.club_id AND v.effective_from > starts AND v.effective_from <= o.local_date)
   ORDER BY o.local_date
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'app.schedule_assignments: % from % would give %, a day already announced, to someone else (FQ61, T6)',
      NEW.weekday, GREATEST(starts, NEW.first_date), announced
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER schedule_assignment_keeps_announced AFTER INSERT ON app.schedule_assignments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.schedule_assignment_keeps_announced();

-- At commit, for a day written into a week after the club's first days applied, as 0012's guard is for
-- the first days' own week: it is a day its star had in the week before, as it was (FQ125, FQ126), or
-- that star's confirmation in the club's pick, at the confirmation's own instant, of a day they hold
-- (FQ127, FQ130). Nobody already in the week moves, and nobody gains a day they didn't confirm. A week
-- may leave days out: a member who left, or a day a fourth member's join freed.
CREATE FUNCTION app.schedule_assignment_follows_week() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  starts date;
  before app.id;
BEGIN
  IF EXISTS (SELECT FROM app.schedule_proposals
              WHERE schedule_version_id = NEW.schedule_version_id AND reason = 'activation')
     OR NOT EXISTS (SELECT FROM app.schedule_proposals
                     WHERE club_id = NEW.club_id AND reason = 'activation' AND state = 'applied') THEN
    RETURN NULL;
  END IF;
  SELECT effective_from INTO starts FROM app.schedule_versions WHERE id = NEW.schedule_version_id;
  SELECT id INTO before FROM app.schedule_versions
   WHERE club_id = NEW.club_id AND effective_from < starts
   ORDER BY effective_from DESC LIMIT 1;
  IF EXISTS (SELECT FROM app.schedule_assignments a
              WHERE a.schedule_version_id = before AND a.weekday = NEW.weekday
                AND a.star_interval_id = NEW.star_interval_id AND a.first_date = NEW.first_date
                AND a.confirmed_at = NEW.confirmed_at)
     OR EXISTS (SELECT FROM app.schedule_proposals p
                  JOIN app.schedule_proposal_members m ON m.proposal_id = p.id
                  JOIN app.schedule_proposal_days d
                    ON d.proposal_id = p.id AND d.interval_id = m.interval_id AND d.week_revision = p.week_revision
                 WHERE p.club_id = NEW.club_id AND p.reason = 'membership_change'
                   AND m.interval_id = NEW.star_interval_id AND m.confirmed_at = NEW.confirmed_at
                   AND d.weekday = NEW.weekday AND d.held) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'app.schedule_assignments: % for % is neither a day its member had in the week before, as it was, nor their confirmation (FQ126, T6)',
    NEW.weekday, NEW.star_interval_id
    USING ERRCODE = 'integrity_constraint_violation';
END
$$;
CREATE CONSTRAINT TRIGGER schedule_assignment_follows_week AFTER INSERT ON app.schedule_assignments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.schedule_assignment_follows_week();

-- 3. As 0014's, with a membership change applying as the first days do.
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
  IF NEW.state = 'applied' AND OLD.state = 'open' AND (
       NOT EXISTS (SELECT FROM app.schedule_proposal_members m
                     JOIN app.memberships ms ON ms.interval_id = m.interval_id
                    WHERE m.proposal_id = NEW.id AND ms.state = 'active')
       OR EXISTS (SELECT FROM app.schedule_proposal_members m
                    JOIN app.memberships ms ON ms.interval_id = m.interval_id
                   WHERE m.proposal_id = NEW.id AND ms.state = 'active' AND m.confirmed_at IS NULL)) THEN
    RAISE EXCEPTION 'app.schedule_proposals: % applies once every member it includes who is still in the club has confirmed', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.week_revision <> OLD.week_revision THEN
    IF NEW.reason = 'membership_change' THEN
      RAISE EXCEPTION 'app.schedule_proposals: the week of the membership change % is never proposed again: another pick replaces it (FQ131)', NEW.id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
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

-- BEFORE INSERT, for a membership change: how one starts.
CREATE OR REPLACE FUNCTION app.schedule_change_start_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.state <> 'open' OR NEW.version <> 1 OR NEW.week_revision <> 1 OR NEW.replaced_by IS NOT NULL THEN
    RAISE EXCEPTION 'app.schedule_proposals: a membership change is proposed open, at version 1, in its one week'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.schedule_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'app.schedule_proposals: a membership change has no week of its own: each confirmation writes the club''s next (FQ130)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.effective_from IS DISTINCT FROM (SELECT (NEW.created_at AT TIME ZONE c.timezone)::date
                                            FROM app.clubs c WHERE c.id = NEW.club_id) THEN
    RAISE EXCEPTION 'app.schedule_proposals: a membership change is from the club''s local date it opened on, not %', NEW.effective_from
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NOT EXISTS (SELECT FROM app.schedule_proposals
                  WHERE club_id = NEW.club_id AND reason = 'activation' AND state = 'applied') THEN
    RAISE EXCEPTION 'app.schedule_proposals: a membership change is proposed only once the first days of % have applied (FQ102)', NEW.club_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;

-- As 0013's for both kinds: a row is written, changed or deleted only in its proposal's current week,
-- only while the proposal is open, by a member who hasn't confirmed and is still in the club; a
-- proposed day is set aside, never deleted; and a held day is never a confirmed one: in the first days
-- a day of their own week, in a membership change a day of the club's latest week whose member is
-- still in the club, which is that member's (FQ125, FQ127).
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
  IF NEW.held AND (TG_OP = 'INSERT' OR NOT OLD.held) THEN
    IF proposal.reason = 'activation' AND EXISTS (
         SELECT FROM app.schedule_assignments
          WHERE schedule_version_id = proposal.schedule_version_id AND weekday = NEW.weekday) THEN
      RAISE EXCEPTION 'app.schedule_proposal_days: % is confirmed, and a confirmed day is taken (FQ48)', NEW.weekday
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF proposal.reason = 'membership_change' AND EXISTS (
         SELECT FROM app.schedule_assignments a
           JOIN app.memberships ms ON ms.interval_id = a.star_interval_id
          WHERE a.schedule_version_id = (SELECT v.id FROM app.schedule_versions v
                                          WHERE v.club_id = proposal.club_id
                                          ORDER BY v.effective_from DESC LIMIT 1)
            AND a.weekday = NEW.weekday AND ms.state = 'active') THEN
      RAISE EXCEPTION 'app.schedule_proposal_days: % is a day of the week in force, its member''s (FQ125)', NEW.weekday
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- As 0013's, and in a membership change each day is written into the club's latest week for the
-- member, with the confirmation's own instant, which FQ79's first date is counted from (T6, FQ130).
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
  ELSE
    SELECT COALESCE(pg_catalog.array_agg(a.weekday::text ORDER BY a.weekday::text), '{}') INTO written
      FROM app.schedule_assignments a
     WHERE a.schedule_version_id = (SELECT v.id FROM app.schedule_versions v
                                     WHERE v.club_id = proposal.club_id
                                     ORDER BY v.effective_from DESC LIMIT 1)
       AND a.star_interval_id = NEW.interval_id AND a.confirmed_at = NEW.confirmed_at;
  END IF;
  IF written <> held_days THEN
    RAISE EXCEPTION 'app.schedule_proposal_members: the % days % confirms aren''t the days written into the week for them (T6)',
      proposal.days_per_member, NEW.interval_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;
