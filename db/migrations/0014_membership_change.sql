-- 0014: the membership change (spec 05; T6, T33; FQ39, FQ56, FQ61, FQ81, FQ101, FQ125 to FQ127). 0012 named
-- the kind and left its rules to the PR that builds it: this one.
--
-- A membership change is one proposed week every active member confirms as a whole, with no
-- choosing (FQ56). It is proposed by the commands that start or end a membership, and when the
-- first days apply (packages/domain/src/schedule/settle-change.ts), under the club's row. These
-- are the last guards behind them:
--   - a change is proposed open, at version 1, in week 1, with no week of its own, from a Monday,
--     and only in a club whose first days have applied;
--   - its days are inserted only, never changed or deleted, each proposed and held, a weekday for
--     one member; no choice changes them, and its week is never proposed again: a join or a leave
--     replaces it;
--   - it never ends `applied` here. It applies at its start, which `api/b2-change-start` builds,
--     replacing this one rule with the start's own. To give an applied change its week, that PR
--     also makes 0012's `schedule_proposals_keep` again, which keeps `schedule_version_id` as
--     inserted.
-- What these guards leave to the command's lock on the club's row (settle-change.ts writes a
-- change's row, members and days in one transaction under it): that the days are written with
-- the proposal and not later, and that two transactions at once never give one weekday to two
-- members. The days' guard reads the proposal FOR SHARE, as 0012's does, so it orders nothing
-- between two inserts for different members; no command makes two.
-- A confirmation of it is already kept by 0012 and 0013: an active member, once, who holds the
-- proposal's number of days alone.
--
-- Two functions of 0013 are replaced with the same rules plus these, and one trigger is added.
-- No table, column or row is dropped or rewritten (FQ39).

-- As 0013's, with the change's two rules: it never applies here, and its week is never proposed
-- again.
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
  IF NEW.state = 'applied' AND NEW.reason = 'membership_change' THEN
    RAISE EXCEPTION 'app.schedule_proposals: the membership change % applies only at its start (FQ101)', NEW.id
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
    IF NEW.reason = 'membership_change' THEN
      RAISE EXCEPTION 'app.schedule_proposals: the week of the membership change % is never proposed again: another change replaces it (FQ126)', NEW.id
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

-- BEFORE INSERT, for a membership change: how one starts. The first days' own start is the
-- command's (packages/domain/src/schedule/open.ts) and 0012's CHECKs.
CREATE FUNCTION app.schedule_change_start_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.state <> 'open' OR NEW.version <> 1 OR NEW.week_revision <> 1 OR NEW.replaced_by IS NOT NULL THEN
    RAISE EXCEPTION 'app.schedule_proposals: a membership change is proposed open, at version 1, in its one week'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.schedule_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'app.schedule_proposals: a membership change has no week of its own until it applies (FQ101)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF pg_catalog.date_part('isodow', NEW.effective_from) <> 1 THEN
    RAISE EXCEPTION 'app.schedule_proposals: a membership change starts on a Monday, not on % (FQ61)', NEW.effective_from
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
CREATE TRIGGER schedule_change_start_guard BEFORE INSERT ON app.schedule_proposals
  FOR EACH ROW WHEN (NEW.reason = 'membership_change')
  EXECUTE FUNCTION app.schedule_change_start_guard();

-- As 0013's, with a membership change's days: written once, each proposed and held, a weekday for
-- one member, and never changed or deleted, since a change has no choosing (FQ56).
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
  IF proposal.reason = 'membership_change' THEN
    IF TG_OP <> 'INSERT' THEN
      RAISE EXCEPTION 'app.schedule_proposal_days: a membership change''s days are written once: it has no choosing (FQ56)'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NOT (NEW.suggested AND NEW.held) THEN
      RAISE EXCEPTION 'app.schedule_proposal_days: a membership change''s day is proposed and held (FQ56)'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF EXISTS (SELECT FROM app.schedule_proposal_days
                WHERE proposal_id = NEW.proposal_id AND weekday = NEW.weekday) THEN
      RAISE EXCEPTION 'app.schedule_proposal_days: a membership change proposes % for one member (T6)', NEW.weekday
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
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
