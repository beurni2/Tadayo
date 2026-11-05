-- 0007: what members do with a drop once its day has opened (spec 31: Reaction, Comment,
-- Favourite; spec 16, 18; D07; T9, T23, T24, T32, T33).
--
-- Each row is keyed by a member of the drop's sealed audience (T8): a foreign key to
-- drop_audience, so nobody outside it can react, comment or save. Each is written only from the
-- reveal on (D07), which a guard checks against the instant the API gives it. A removal's purge
-- deletes them (T24). Nothing here is ever counted for anyone (T15, T32, T33).

-- One reaction per member per drop, changeable, and never on their own drop (spec 16). Clearing it
-- keeps the row, so setting it again isn't a first reaction.
CREATE TABLE app.reactions (
  drop_id app.id NOT NULL,
  interval_id app.id NOT NULL,
  -- The palette so far (FQ22); null once cleared.
  reaction text CHECK (reaction IN ('heart')),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (drop_id, interval_id),
  FOREIGN KEY (drop_id, interval_id) REFERENCES app.drop_audience (drop_id, interval_id)
);
ALTER TABLE app.reactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX reactions_by_interval ON app.reactions (interval_id);

-- A comment on a revealed drop, in a shallow thread whose replies stay on the same drop.
CREATE TABLE app.comments (
  id app.id PRIMARY KEY,
  drop_id app.id NOT NULL,
  author_interval_id app.id NOT NULL,
  reply_to_comment_id app.id,
  -- At most 500 grapheme clusters, counted by the API (T13); null once deleted or purged.
  body text CHECK (pg_catalog.char_length(body) BETWEEN 1 AND 8000),
  version app.version NOT NULL DEFAULT 1 CHECK (version >= 1),
  -- Deleted by its author, or removed by moderation (FQ27).
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'deleted', 'removed')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  ended_at timestamptz,
  UNIQUE (id, drop_id),
  FOREIGN KEY (drop_id, author_interval_id) REFERENCES app.drop_audience (drop_id, interval_id),
  FOREIGN KEY (reply_to_comment_id, drop_id) REFERENCES app.comments (id, drop_id),
  CHECK (state <> 'active' OR body IS NOT NULL),
  CHECK (state <> 'deleted' OR body IS NULL),
  CHECK ((state = 'active') = (ended_at IS NULL)),
  CHECK (reply_to_comment_id <> id),
  CHECK (updated_at >= created_at)
);
ALTER TABLE app.comments ENABLE ROW LEVEL SECURITY;
-- A thread in the order it was written.
CREATE INDEX comments_by_drop ON app.comments (drop_id, created_at, id);
CREATE INDEX comments_by_author ON app.comments (author_interval_id);
CREATE INDEX comments_replies ON app.comments (reply_to_comment_id) WHERE reply_to_comment_id IS NOT NULL;

-- A private bookmark: it copies nothing, and every read checks access again (T32). Keyed by the
-- member's interval, which a rejoin doesn't inherit (T8); an audience holds one interval per
-- account, so it is spec 31's one favourite per account and drop.
CREATE TABLE app.favourites (
  interval_id app.id NOT NULL,
  drop_id app.id NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (interval_id, drop_id),
  FOREIGN KEY (drop_id, interval_id) REFERENCES app.drop_audience (drop_id, interval_id)
);
ALTER TABLE app.favourites ENABLE ROW LEVEL SECURITY;
CREATE INDEX favourites_by_drop ON app.favourites (drop_id);

-- Written from the reveal on (D07); a reaction never on one's own drop (spec 16); an ended comment
-- only loses its text. Anything new (a reaction, a comment, an edit, a favourite) needs the drop
-- still active and the writer still a member, read with locks that a withdrawal, a removal or a
-- departure waits for, so nothing lands after a removal's purge (T9, T24). Clearing or deleting
-- one's own needs neither. These guard writes only: who may read is the authorization module's
-- (T9).
CREATE FUNCTION app.after_reveal_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  written_at timestamptz;
  writer app.id;
  adds boolean;
BEGIN
  IF TG_TABLE_NAME = 'comments' AND TG_OP = 'UPDATE' THEN
    IF OLD.state <> 'active' THEN
      IF (NEW.state, NEW.version, NEW.updated_at) IS DISTINCT FROM (OLD.state, OLD.version, OLD.updated_at)
         OR (NEW.body IS NOT NULL AND NEW.body IS DISTINCT FROM OLD.body) THEN
        RAISE EXCEPTION 'app.comments: a % comment only loses its text', OLD.state
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
      RETURN NEW;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'favourites' THEN
    written_at := NEW.created_at;
  ELSE
    written_at := NEW.updated_at;
  END IF;
  IF written_at < app.drop_reveal_at(NEW.drop_id) THEN
    RAISE EXCEPTION 'app.%: drop %''s day hasn''t opened (D07)', TG_TABLE_NAME, NEW.drop_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_TABLE_NAME = 'comments' THEN
    writer := NEW.author_interval_id;
    adds := TG_OP = 'INSERT' OR (NEW.state = 'active' AND NEW.body IS DISTINCT FROM OLD.body);
  ELSIF TG_TABLE_NAME = 'reactions' THEN
    writer := NEW.interval_id;
    adds := NEW.reaction IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.reaction IS DISTINCT FROM OLD.reaction);
  ELSE
    writer := NEW.interval_id;
    adds := true;
  END IF;
  IF adds THEN
    PERFORM FROM app.drops WHERE id = NEW.drop_id AND state = 'active' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'app.%: drop % isn''t active, so nothing is added to it (T9, T24)', TG_TABLE_NAME, NEW.drop_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    PERFORM FROM app.memberships WHERE interval_id = writer AND state = 'active' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'app.%: % is no longer a member, so adds nothing (T9)', TG_TABLE_NAME, writer
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'reactions' THEN
    IF EXISTS (SELECT FROM app.drops WHERE id = NEW.drop_id AND author_interval_id = NEW.interval_id) THEN
      RAISE EXCEPTION 'app.reactions: nobody reacts to their own drop (spec 16)'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER reactions_guard BEFORE INSERT OR UPDATE ON app.reactions
  FOR EACH ROW EXECUTE FUNCTION app.after_reveal_guard();
CREATE TRIGGER reactions_keep BEFORE UPDATE ON app.reactions
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('drop_id', 'interval_id');
CREATE TRIGGER comments_guard BEFORE INSERT OR UPDATE ON app.comments
  FOR EACH ROW EXECUTE FUNCTION app.after_reveal_guard();
CREATE TRIGGER comments_keep BEFORE UPDATE ON app.comments
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('id', 'drop_id', 'author_interval_id', 'reply_to_comment_id', 'created_at');
CREATE TRIGGER comments_once BEFORE UPDATE ON app.comments
  FOR EACH ROW EXECUTE FUNCTION app.set_once('ended_at');
CREATE TRIGGER favourites_guard BEFORE INSERT ON app.favourites
  FOR EACH ROW EXECUTE FUNCTION app.after_reveal_guard();
CREATE TRIGGER favourites_written_once BEFORE UPDATE ON app.favourites
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a favourite is saved or removed, never changed');
