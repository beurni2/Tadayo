-- A new member's pick checks its date without resolving the club's zone (ADR-008, T2; the outside
-- audit's A11; docs/plans/api-b2-club-zone.md).
--
-- 0015's guard took the pick's date from `created_at` in the club's zone (0015, line 296): Postgres
-- resolved the club's zone by its own list. The time module resolves every zone with Temporal, and Postgres only
-- compares instants and dates (ADR-008). The two lists differ: Node keeps an older name as given
-- (US/Eastern, Europe/Kiev, Asia/Calcutta), and some Postgres builds leave those names out (Ubuntu's
-- Postgres 16 does), so in a club with such a name every join after the first days failed, for good.
--
-- The command works the date out in the club's zone (packages/domain/src/schedule/settle-change.ts,
-- `today`), and tests/src/db/membership-change.test.ts holds it. Here Postgres refuses only a date no
-- zone puts at the instant the pick opened: every zone's offset lies between -12 and +14 hours, so the
-- date begins, at +14, 14 hours before its midnight by UTC's clock, and ends, at -12, 12 hours after
-- the next midnight by UTC's. A date's epoch is nominal, its midnight read with no zone, and a
-- timestamptz's epoch is the instant's; EXTRACT gives both exactly, by no session setting, and a date
-- out of any timestamp's range ('infinity' too) is refused here like any other. Each other check is
-- 0015's, unchanged.

CREATE OR REPLACE FUNCTION app.schedule_change_start_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  -- Seconds from the date's midnight, by UTC's clock, to the instant the pick opened.
  since_midnight numeric := EXTRACT(epoch FROM NEW.created_at) - EXTRACT(epoch FROM NEW.effective_from);
BEGIN
  IF NEW.state <> 'open' OR NEW.version <> 1 OR NEW.week_revision <> 1 OR NEW.replaced_by IS NOT NULL THEN
    RAISE EXCEPTION 'app.schedule_proposals: a membership change is proposed open, at version 1, in its one week'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.schedule_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'app.schedule_proposals: a membership change has no week of its own: each confirmation writes the club''s next (FQ130)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF since_midnight IS NULL OR since_midnight < -14 * 3600 OR since_midnight >= 36 * 3600 THEN
    RAISE EXCEPTION 'app.schedule_proposals: a membership change is from the club''s local date it opened on, which no zone makes % (ADR-008)', NEW.effective_from
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
