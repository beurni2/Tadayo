-- 0010: each role's allowance as the counters' last guard (spec 31: ContributionCounter; T17,
-- T57, T58; addendum 2 and 7; ADR-035).
--
-- The star adds up to six drops, six of them photos and two video links, to their own day; anyone
-- else up to three: two photos and one video link. The role comes from the row's own key: its
-- holder is the day's star exactly when its interval is the occurrence's star interval, and
-- neither ever changes (contribution_counters_keep, occurrences_keep), so a row's role is fixed for
-- good. Its limits are written once, here, never by the caller. The command that holds the
-- counter's lock is what serializes the limits; these CHECKs are only the last guard behind it.
--
-- Expand, migrate, tighten (T57): three columns, filled from each row's two intervals, then made
-- NOT NULL and checked. No count, key or row is changed or deleted. No counter exists anywhere,
-- past or upcoming (the plan's decision 3), so nothing is grandfathered: a row that already
-- exceeds a friend's allowance stops this file, which keeps nothing, for the founder's answer (the
-- plan's section 6; no silent change: addendum 7, FQ39). A past, revealed row would stop it too,
-- though addendum 7 leaves historical revealed drops alone; that is accepted only because none
-- exists.
-- The old CHECKs on six and two stay: they are the star's own limits and hold for everyone.

DO $$
DECLARE
  over integer;
BEGIN
  SELECT pg_catalog.count(*) INTO over
    FROM app.contribution_counters c JOIN app.occurrences o ON o.id = c.occurrence_id
   WHERE c.interval_id <> o.star_interval_id
     AND (c.committed_total + c.reserved_total > 3
          OR (c.committed_total - c.committed_external) + (c.reserved_total - c.reserved_external) > 2
          OR c.committed_external + c.reserved_external > 1);
  IF over > 0 THEN
    RAISE EXCEPTION '0010: % contribution counters already exceed a friend''s allowance; nothing is changed (addendum 7, FQ39)', over
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

ALTER TABLE app.contribution_counters
  ADD COLUMN total_limit smallint,
  ADD COLUMN photo_limit smallint,
  ADD COLUMN external_limit smallint;

UPDATE app.contribution_counters c
   SET total_limit = CASE WHEN c.interval_id = o.star_interval_id THEN 6 ELSE 3 END,
       photo_limit = CASE WHEN c.interval_id = o.star_interval_id THEN 6 ELSE 2 END,
       external_limit = CASE WHEN c.interval_id = o.star_interval_id THEN 2 ELSE 1 END
  FROM app.occurrences o
 WHERE o.id = c.occurrence_id;

ALTER TABLE app.contribution_counters
  ALTER COLUMN total_limit SET NOT NULL,
  ALTER COLUMN photo_limit SET NOT NULL,
  ALTER COLUMN external_limit SET NOT NULL,
  ADD CONSTRAINT contribution_counters_limits_by_role CHECK (
    (total_limit = 6 AND photo_limit = 6 AND external_limit = 2)
    OR (total_limit = 3 AND photo_limit = 2 AND external_limit = 1)),
  ADD CONSTRAINT contribution_counters_total_within_limit
    CHECK (committed_total + reserved_total <= total_limit),
  ADD CONSTRAINT contribution_counters_photos_within_limit
    CHECK ((committed_total - committed_external) + (reserved_total - reserved_external) <= photo_limit),
  ADD CONSTRAINT contribution_counters_links_within_limit
    CHECK (committed_external + reserved_external <= external_limit);

-- BEFORE INSERT: the row's limits, from the day's star interval and the row's own, never from the
-- caller (T17; addendum 2). It takes no lock: both intervals never change, and the command already
-- holds the day's (TECH-DESIGN section 5).
CREATE FUNCTION app.contribution_counters_limits() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  star boolean;
BEGIN
  IF NEW.total_limit IS NOT NULL OR NEW.photo_limit IS NOT NULL OR NEW.external_limit IS NOT NULL THEN
    RAISE EXCEPTION 'app.contribution_counters: the limits come from the day''s star interval, never from the caller (T17)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT NEW.interval_id = o.star_interval_id INTO star FROM app.occurrences o WHERE o.id = NEW.occurrence_id;
  -- No such day: star stays null, the row takes the smaller set, and its foreign key refuses it.
  NEW.total_limit := CASE WHEN star THEN 6 ELSE 3 END;
  NEW.photo_limit := CASE WHEN star THEN 6 ELSE 2 END;
  NEW.external_limit := CASE WHEN star THEN 2 ELSE 1 END;
  RETURN NEW;
END
$$;
CREATE TRIGGER contribution_counters_limits BEFORE INSERT ON app.contribution_counters
  FOR EACH ROW EXECUTE FUNCTION app.contribution_counters_limits();
CREATE TRIGGER contribution_counters_keep_limits BEFORE UPDATE ON app.contribution_counters
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('total_limit', 'photo_limit', 'external_limit');
