-- 0016: a drop's photo is uploaded only under a live photo reservation, one at a time (spec 11, 32,
-- 33; T12, T17, T18, T58; FQ39; docs/plans/api-b2-spike-uploads.md, section 0.10).
--
-- `createUpload` makes a drop's photo upload only for the holder of a live reservation for a photo
-- that holds no other upload but rejected ones, checked under the counter's lock with the clock's
-- sample after it (packages/domain/src/media/upload.ts). 0006 checks only that the reservation is
-- the owner's (`app.uploads_owner_guard`); these are the last guards behind the domain for the rest:
-- - `app.uploads_reservation_guard`: the reservation is still live, holds a photo's slot, and hadn't
--   lapsed at the upload's `created_at`. It reads the reservation `FOR SHARE`, so any change of the
--   reservation's row (a release, a lapse settled, a commit) waits for the upload's transaction, and
--   an upload waits for a change in flight and then sees the reservation as it left it: neither lands
--   between this check and the insert.
-- - `uploads_one_per_reservation`: one slot, one photo. A reservation holds at most one upload that
--   isn't rejected, so one live slot can't make any number of objects; after a rejection the slot
--   takes another photo.
--
-- The rule for whatever writes a drop's photo upload: take the reservation's counter lock
-- (`app.contribution_counters`, `FOR NO KEY UPDATE`) before the insert, as `createUpload` does. A
-- release takes that lock and then the reservation's, so a writer that took the reservation's first
-- (this guard's `FOR SHARE`) and the counter's after could wait on a release that waits on it.
--
-- No table, column or row is added, dropped or rewritten, and only checks get stronger: `app.uploads`
-- has no drop's photo yet on any project, since nothing made one before this.

CREATE FUNCTION app.uploads_reservation_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM FROM app.reservations
    WHERE id = NEW.reservation_id AND state = 'live' AND media_class = 'photo' AND expires_at > NEW.created_at
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'app.uploads: a drop''s photo is uploaded only under a live photo reservation (T17, T18)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER uploads_reservation_guard BEFORE INSERT ON app.uploads
  FOR EACH ROW WHEN (NEW.reservation_id IS NOT NULL)
  EXECUTE FUNCTION app.uploads_reservation_guard();

CREATE UNIQUE INDEX uploads_one_per_reservation ON app.uploads (reservation_id)
  WHERE reservation_id IS NOT NULL AND state <> 'rejected';
