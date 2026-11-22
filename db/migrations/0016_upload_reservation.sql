-- 0016: a drop's photo is uploaded only under a live photo reservation (spec 11, 32, 33; T12, T17,
-- T18, T58; FQ39; docs/plans/api-b2-spike-uploads.md, section 0.10).
--
-- `createUpload` makes a drop's photo upload only for the holder of a live reservation for a photo,
-- checked under the counter's lock with the clock's sample after it
-- (packages/domain/src/media/upload.ts). 0006 checks only that the reservation is the owner's
-- (`app.uploads_owner_guard`); this is the last guard behind the domain for the rest: the
-- reservation is still live, holds a photo's slot, and hadn't lapsed at the upload's `created_at`.
-- It reads the reservation `FOR SHARE`, after the counter's lock the domain holds, so a release or a
-- lapse settled under that lock waits for the upload's transaction, never lands between this check
-- and the insert.
--
-- No table, column or row is added, dropped or rewritten, and only a check gets stronger.

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
