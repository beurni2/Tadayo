-- 0011: photo messages in a drop's conversation (spec 31: Comment, Upload, Rendition; spec 16;
-- T9, T10, T12, T24, T25, T28, T57, T58, T63 to T65; addendum 5 and 6; FQ107, FQ108; ADR-035).
--
-- After the reveal, anyone who may read a drop answers it with text, a photo or both. The photo is
-- an upload made for that one drop's conversation, after its reveal, by someone in its audience;
-- it becomes that message's photo only once it is ready and the message commits, it uses no
-- reservation and no allowance (T64), and it can never become a drop, a replacement or an avatar.
-- Its processing state is its upload's; its removal state is its message's. A message never
-- changes its photo, and loses it only with the whole message (FQ107). An upload is a message's
-- photo once: the commit marks it used, for good, so a photo a removal took away never comes back
-- in a new message, whatever is left of its upload (T25, T65).
--
-- Every path ends a message in place, clearing its text and photo. B6's paths then delete the
-- upload in the same transaction, whose renditions go with it, and write its tombstones (T24, T28);
-- an account's purge does it in its own job (T27). 0007 says a removal's purge deletes comments,
-- but one a moderation case names can't be deleted (moderation_cases' foreign key), so none is:
-- the row stays, empty, for the replies that point to it, and a DELETE is refused. A removal by
-- someone other than its author is recorded once, here, with its reason (T25).
--
-- No table, column or row is dropped or rewritten. Three CHECKs are replaced: the upload's
-- purposes and the renditions' kinds widen, and a message may be a photo alone (addendum 5); a
-- message that has ended may now keep neither text nor photo, where a removed one could keep its
-- text until a purge.

-- A photo message's upload, scoped when it is made to the drop whose conversation it is for (T63),
-- and the instant a message took it, set once by comments_photo_guard (T65).
ALTER TABLE app.uploads
  ADD COLUMN conversation_drop_id app.id REFERENCES app.drops,
  ADD COLUMN used_at timestamptz,
  DROP CONSTRAINT uploads_purpose_check,
  ADD CONSTRAINT uploads_purpose_check
    CHECK (purpose IN ('drop_photo', 'replacement', 'avatar', 'conversation_photo')),
  ADD CONSTRAINT uploads_conversation_drop CHECK ((purpose = 'conversation_photo') = (conversation_drop_id IS NOT NULL)),
  ADD CONSTRAINT uploads_for_conversation UNIQUE (id, conversation_drop_id);
-- The drop's withdrawal and removal find the photos no message holds yet (T24).
CREATE INDEX uploads_by_conversation_drop ON app.uploads (conversation_drop_id) WHERE conversation_drop_id IS NOT NULL;
CREATE TRIGGER uploads_keep_conversation BEFORE UPDATE ON app.uploads
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('conversation_drop_id');
CREATE TRIGGER uploads_used_once BEFORE UPDATE ON app.uploads
  FOR EACH ROW EXECUTE FUNCTION app.set_once('used_at');

-- BEFORE INSERT, for a photo message's upload: made only by someone in the drop's audience who is
-- still a member, for a drop still active, from its reveal on (T9, T63, T64). The membership, then
-- the drop, are read with locks a departure and a withdrawal wait for, in TECH-DESIGN section 5's
-- order, so neither lands between this check and the upload. Who may read the drop is the
-- authorization module's (T9); this is the last guard behind it.
CREATE FUNCTION app.uploads_conversation_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM FROM app.drop_audience a JOIN app.memberships m ON m.interval_id = a.interval_id
    WHERE a.drop_id = NEW.conversation_drop_id AND m.user_id = NEW.owner_user_id AND m.state = 'active'
    FOR SHARE OF m;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'app.uploads: % answers drop % only as a member of its audience (T9, T63)',
      NEW.owner_user_id, NEW.conversation_drop_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  PERFORM FROM app.drops WHERE id = NEW.conversation_drop_id AND state = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'app.uploads: drop % isn''t active, so nothing is added to it (T9, T24)', NEW.conversation_drop_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.created_at < app.drop_reveal_at(NEW.conversation_drop_id) THEN
    RAISE EXCEPTION 'app.uploads: drop %''s day hasn''t opened (D07, T63)', NEW.conversation_drop_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER uploads_conversation_guard BEFORE INSERT ON app.uploads
  FOR EACH ROW WHEN (NEW.conversation_drop_id IS NOT NULL)
  EXECUTE FUNCTION app.uploads_conversation_guard();

-- The feed's reply preview reads a photo message's thumbnail (T65). Every other upload keeps 0006's
-- two renditions, display and full (TECH-DESIGN section 1, "Images"), so the kind widens for a
-- photo message alone, and checks only get stronger (T58): a drop's photo has no thumbnail that
-- an answer before its reveal could carry (T10). Remember this (spec 19, T62), a later feature,
-- would lift this for its own suggestions.
ALTER TABLE app.upload_renditions
  DROP CONSTRAINT upload_renditions_kind_check,
  ADD CONSTRAINT upload_renditions_kind_check CHECK (kind IN ('display', 'full', 'thumbnail'));
CREATE FUNCTION app.upload_renditions_thumbnail_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT FROM app.uploads WHERE id = NEW.upload_id AND purpose = 'conversation_photo') THEN
    RAISE EXCEPTION 'app.upload_renditions: only a photo message''s upload has a thumbnail (T10, T65)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER upload_renditions_thumbnail_guard BEFORE INSERT ON app.upload_renditions
  FOR EACH ROW WHEN (NEW.kind = 'thumbnail')
  EXECUTE FUNCTION app.upload_renditions_thumbnail_guard();

-- A message holds text, a photo or both while it stands, and neither once it has ended (addendum 5;
-- FQ107: emptied text keeps the photo). Its photo is one upload made for this drop, held by no
-- other message.
ALTER TABLE app.comments
  ADD COLUMN photo_upload_id app.id,
  ADD CONSTRAINT comments_one_message_per_photo UNIQUE (photo_upload_id),
  ADD CONSTRAINT comments_photo_for_its_drop
    FOREIGN KEY (photo_upload_id, drop_id) REFERENCES app.uploads (id, conversation_drop_id),
  DROP CONSTRAINT comments_check,
  ADD CONSTRAINT comments_active_has_content CHECK (state <> 'active' OR body IS NOT NULL OR photo_upload_id IS NOT NULL),
  ADD CONSTRAINT comments_ended_empty CHECK (state = 'active' OR (body IS NULL AND photo_upload_id IS NULL));
-- The latest photo message on each drop, for each viewer's reply preview (T65).
CREATE INDEX comments_latest_photo ON app.comments (drop_id, created_at DESC, id DESC)
  WHERE state = 'active' AND photo_upload_id IS NOT NULL;

-- BEFORE INSERT: a message starts active, at its first version, written at its own instant, so
-- after_reveal_guard's check of updated_at is a check of created_at too, the order the thread and
-- the preview read (T63).
CREATE FUNCTION app.comments_start() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.state <> 'active' OR NEW.version <> 1 OR NEW.updated_at <> NEW.created_at THEN
    RAISE EXCEPTION 'app.comments: a message starts active, at version 1, with updated_at its created_at (T63)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER comments_start BEFORE INSERT ON app.comments
  FOR EACH ROW EXECUTE FUNCTION app.comments_start();

-- BEFORE INSERT OR UPDATE: at the commit, the photo is its author's own upload, ready, not lapsed
-- and never used, locked so a lapse that races the commit waits and then fails on the foreign key,
-- and a second commit of the same upload waits and then finds it used (T12, T63). The commit marks
-- it used for good. Afterwards it is never added or replaced, and goes only with the whole message
-- (T65, FQ107).
CREATE FUNCTION app.comments_photo_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.photo_upload_id IS NOT NULL AND NEW.photo_upload_id IS DISTINCT FROM OLD.photo_upload_id THEN
      RAISE EXCEPTION 'app.comments: a message''s photo is never added or replaced (T65, FQ107)'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF OLD.photo_upload_id IS NOT NULL AND NEW.photo_upload_id IS NULL AND NEW.state = 'active' THEN
      RAISE EXCEPTION 'app.comments: a photo goes only with its whole message (T65, FQ107)'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.photo_upload_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM FROM app.uploads u
    WHERE u.id = NEW.photo_upload_id AND u.state = 'ready' AND u.expires_at > NEW.created_at AND u.used_at IS NULL
      AND u.owner_user_id = (SELECT m.user_id FROM app.memberships m WHERE m.interval_id = NEW.author_interval_id)
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'app.comments: a message''s photo is its author''s own ready upload, not lapsed and never used (T12, T63, T65)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  UPDATE app.uploads SET used_at = NEW.created_at WHERE id = NEW.photo_upload_id;
  RETURN NEW;
END
$$;
CREATE TRIGGER comments_photo_guard BEFORE INSERT OR UPDATE ON app.comments
  FOR EACH ROW EXECUTE FUNCTION app.comments_photo_guard();
-- A message is ended in place, never deleted: its replies, a moderation case and its removal name
-- it, and its end is what every reader and purge path follows (T24, T25).
CREATE TRIGGER comments_no_delete BEFORE DELETE ON app.comments
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a message is ended in place, never deleted (T24, T25)');
CREATE TRIGGER comments_no_truncate BEFORE TRUNCATE ON app.comments
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('a message is ended in place, never deleted (T24, T25)');

-- The one record of why a message was removed by someone other than its author (T25): a member in
-- its photo (FQ108: the whole message goes), the operator (FQ27), or its drop's own withdrawal or
-- removal (T24). Who removed it as pictured is kept here only, for the audit, and never served.
-- Its author's deletion, and their account's, end it as deleted, with no record here.
CREATE TABLE app.comment_removals (
  comment_id app.id PRIMARY KEY,
  drop_id app.id NOT NULL,
  reason text NOT NULL CHECK (reason IN ('pictured', 'moderation', 'drop_ended')),
  -- The member in the photo; none otherwise.
  actor_interval_id app.id,
  -- The operator's remove_comment action on this message, one per removal (FQ27).
  operator_action_id app.id UNIQUE REFERENCES app.operator_actions,
  removed_at timestamptz NOT NULL,
  FOREIGN KEY (comment_id, drop_id) REFERENCES app.comments (id, drop_id),
  FOREIGN KEY (drop_id, actor_interval_id) REFERENCES app.drop_audience (drop_id, interval_id),
  CONSTRAINT comment_removals_pictured_actor CHECK ((reason = 'pictured') = (actor_interval_id IS NOT NULL)),
  CONSTRAINT comment_removals_moderation_action CHECK ((reason = 'moderation') = (operator_action_id IS NOT NULL))
);
ALTER TABLE app.comment_removals ENABLE ROW LEVEL SECURITY;
CREATE INDEX comment_removals_by_drop ON app.comment_removals (drop_id);

-- BEFORE INSERT, written before the message is ended, while it still holds its photo. The member's
-- interval is locked before the message, in TECH-DESIGN section 5's order.
CREATE FUNCTION app.comment_removals_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  c app.comments%ROWTYPE;
BEGIN
  IF NEW.reason = 'pictured' THEN
    PERFORM FROM app.memberships WHERE interval_id = NEW.actor_interval_id AND state = 'active' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'app.comment_removals: % is no longer a member, so removes nothing as pictured (T9, T25)',
        NEW.actor_interval_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  SELECT * INTO c FROM app.comments WHERE id = NEW.comment_id FOR UPDATE;
  IF c.state <> 'active' THEN
    RAISE EXCEPTION 'app.comment_removals: message % has already ended', NEW.comment_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.reason = 'pictured' AND (NEW.actor_interval_id = c.author_interval_id OR c.photo_upload_id IS NULL) THEN
    RAISE EXCEPTION 'app.comment_removals: a member in a message''s photo, never its author, removes it as pictured (T25, FQ108)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.reason = 'moderation' AND NOT EXISTS (
       SELECT FROM app.operator_actions
        WHERE id = NEW.operator_action_id AND action = 'remove_comment' AND target_kind = 'comment'
          AND target_id = NEW.comment_id) THEN
    RAISE EXCEPTION 'app.comment_removals: a moderation removal cites the operator''s removal of this message (FQ27)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.reason = 'drop_ended' AND NOT EXISTS (
       SELECT FROM app.drops WHERE id = NEW.drop_id AND state IN ('withdrawn', 'removed')) THEN
    RAISE EXCEPTION 'app.comment_removals: only a withdrawn or removed drop takes its conversation with it (T24)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER comment_removals_guard BEFORE INSERT ON app.comment_removals
  FOR EACH ROW EXECUTE FUNCTION app.comment_removals_guard();
CREATE TRIGGER comment_removals_written_once BEFORE UPDATE OR DELETE ON app.comment_removals
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a removal is audited and written once (T25)');
CREATE TRIGGER comment_removals_no_truncate BEFORE TRUNCATE ON app.comment_removals
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('a removal is audited and written once (T25)');

-- A message is removed exactly when it has a removal, checked at commit.
CREATE FUNCTION app.comment_removal_matches() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  the_comment app.id;
  comment_state text;
  has_removal boolean;
BEGIN
  IF TG_TABLE_NAME = 'comments' THEN
    the_comment := NEW.id;
  ELSE
    the_comment := NEW.comment_id;
  END IF;
  SELECT c.state, r.comment_id IS NOT NULL INTO comment_state, has_removal
    FROM app.comments c LEFT JOIN app.comment_removals r ON r.comment_id = c.id
   WHERE c.id = the_comment;
  IF (comment_state = 'removed') IS DISTINCT FROM has_removal THEN
    RAISE EXCEPTION 'app.comments: message % is % and has % removal', the_comment, comment_state,
      CASE WHEN has_removal THEN 'a' ELSE 'no' END
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER comments_removal_matches AFTER UPDATE ON app.comments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.state IS DISTINCT FROM OLD.state)
  EXECUTE FUNCTION app.comment_removal_matches();
CREATE CONSTRAINT TRIGGER comment_removals_match AFTER INSERT ON app.comment_removals
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.comment_removal_matches();
