-- 0006: what people add to a day, and who may read it (spec 31: ContributionCounter,
-- DropReservation, MediaAsset, ProviderLink, Drop, DropAudience, Highlight; spec 07, 09, 11, 15,
-- 33; T3, T8, T12, T17, T18, T21, T22, T29; TECH-DESIGN section 6).
--
-- The times these tables are checked against come from the API's time module after its locks
-- (T1, ADR-013), so a guard here compares the instant it was given with the day's reveal_at and
-- never reads a clock of its own.

-- One contributor's totals on one day: committed and reserved, all and external (T17). Its row
-- lock is what serializes six-and-two, so these CHECKs are only the last guard (spec 31).
CREATE TABLE app.contribution_counters (
  occurrence_id app.id NOT NULL,
  interval_id app.id NOT NULL,
  club_id app.id NOT NULL,
  committed_total smallint NOT NULL DEFAULT 0,
  committed_external smallint NOT NULL DEFAULT 0,
  reserved_total smallint NOT NULL DEFAULT 0,
  reserved_external smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (occurrence_id, interval_id),
  FOREIGN KEY (occurrence_id, club_id) REFERENCES app.occurrences (id, club_id),
  FOREIGN KEY (interval_id, club_id) REFERENCES app.memberships (interval_id, club_id),
  CHECK (committed_external BETWEEN 0 AND committed_total),
  CHECK (reserved_external BETWEEN 0 AND reserved_total),
  CHECK (committed_total + reserved_total <= 6),
  CHECK (committed_external + reserved_external <= 2)
);
ALTER TABLE app.contribution_counters ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER contribution_counters_keep BEFORE UPDATE ON app.contribution_counters
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('occurrence_id', 'interval_id', 'club_id');

-- A slot held while a photo uploads and prepares, counted until it is released, lapses or is
-- used (T18). Its contributor and day are its counter's, so they are the same club's.
CREATE TABLE app.reservations (
  id app.id PRIMARY KEY,
  occurrence_id app.id NOT NULL,
  interval_id app.id NOT NULL,
  media_class text NOT NULL CHECK (media_class IN ('photo', 'external_video')),
  state text NOT NULL DEFAULT 'live' CHECK (state IN ('live', 'released', 'expired', 'consumed')),
  -- The Idempotency-Key that made it (T19).
  request_key uuid NOT NULL,
  created_at timestamptz NOT NULL,
  -- Never after the day's reveal (T18).
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  -- The contributor's own drop on the same day that used it (T20); its key comes with drops.
  drop_id app.id,
  UNIQUE (interval_id, request_key),
  FOREIGN KEY (occurrence_id, interval_id) REFERENCES app.contribution_counters (occurrence_id, interval_id),
  CHECK (expires_at > created_at),
  CHECK ((state = 'live') = (ended_at IS NULL)),
  CHECK ((state = 'consumed') = (drop_id IS NOT NULL))
);
ALTER TABLE app.reservations ENABLE ROW LEVEL SECURITY;
CREATE INDEX reservations_live ON app.reservations (occurrence_id, interval_id) WHERE state = 'live';
CREATE INDEX reservations_lapsing ON app.reservations (expires_at) WHERE state = 'live';

CREATE FUNCTION app.reservations_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  reveal timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT reveal_at INTO reveal FROM app.occurrences WHERE id = NEW.occurrence_id;
    IF NEW.state <> 'live' OR NEW.created_at >= reveal OR NEW.expires_at > reveal THEN
      RAISE EXCEPTION 'app.reservations: a slot is held live, before the reveal, and never past it (T3, T18)'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  ELSIF OLD.state <> 'live' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'app.reservations: a % reservation never changes (T18)', OLD.state
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER reservations_guard BEFORE INSERT OR UPDATE ON app.reservations
  FOR EACH ROW EXECUTE FUNCTION app.reservations_guard();
CREATE TRIGGER reservations_keep BEFORE UPDATE ON app.reservations
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns(
    'id', 'occurrence_id', 'interval_id', 'media_class', 'request_key', 'created_at', 'expires_at');

-- A resolved video link: the resolver's alone until its drop reveals (T40). Only its provider,
-- its normalized post identity and the rebuilt https link are kept: never the link as pasted, a
-- query string, embed HTML or anything else the provider serves (T10, T39, T52; spec 33).
CREATE TABLE app.sources (
  id app.id PRIMARY KEY,
  owner_user_id app.id NOT NULL REFERENCES app.users,
  provider text NOT NULL CHECK (provider IN ('tiktok', 'instagram')),
  provider_post_id text NOT NULL,
  canonical_url text NOT NULL CHECK (
    pg_catalog.char_length(canonical_url) <= 2048 AND canonical_url ~ '^https://[^?#[:space:]]+$'
  ),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CHECK ((provider = 'tiktok' AND provider_post_id ~ '^[0-9]{1,32}$')
         OR (provider = 'instagram' AND provider_post_id ~ '^[A-Za-z0-9_-]{1,64}$')),
  CHECK (expires_at > created_at)
);
ALTER TABLE app.sources ENABLE ROW LEVEL SECURITY;
-- The same caller and link give the same source until it is used.
CREATE UNIQUE INDEX sources_one_unused ON app.sources (owner_user_id, provider, provider_post_id) WHERE used_at IS NULL;
CREATE TRIGGER sources_keep BEFORE UPDATE ON app.sources
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns(
    'id', 'owner_user_id', 'provider', 'provider_post_id', 'canonical_url', 'created_at', 'expires_at');
CREATE TRIGGER sources_once BEFORE UPDATE ON app.sources
  FOR EACH ROW EXECUTE FUNCTION app.set_once('used_at');

-- A photo upload and its preparation, private to its owner (T12). Its object key is random and
-- leaves the server only inside the signed upload URL, which is never stored; nor is a file
-- name, EXIF or a capture date (spec 33, ADR-014).
CREATE TABLE app.uploads (
  id app.id PRIMARY KEY,
  owner_user_id app.id NOT NULL REFERENCES app.users,
  purpose text NOT NULL CHECK (purpose IN ('drop_photo', 'replacement', 'avatar')),
  reservation_id app.id REFERENCES app.reservations,
  -- Its key comes with drops.
  replaces_drop_id app.id,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 20971520),
  object_key text NOT NULL UNIQUE CHECK (pg_catalog.char_length(object_key) BETWEEN 1 AND 1024),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'preparing', 'ready', 'held', 'rejected')),
  rejection text CHECK (rejection IN ('unsupported_type', 'too_large', 'too_many_pixels', 'unreadable')),
  -- A hash of the bytes scoped to the owner, so it never matches another account's photo (T21).
  content_hash bytea CHECK (pg_catalog.octet_length(content_hash) = 32),
  -- Random, never derived from the bytes (T21): the photo's media_version or the avatar's version.
  content_version app.id,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  UNIQUE (id, owner_user_id),
  UNIQUE (id, replaces_drop_id),
  CHECK ((purpose = 'drop_photo') = (reservation_id IS NOT NULL)),
  CHECK ((purpose = 'replacement') = (replaces_drop_id IS NOT NULL)),
  CHECK ((state = 'rejected') = (rejection IS NOT NULL)),
  CHECK (state <> 'ready' OR (content_hash IS NOT NULL AND content_version IS NOT NULL)),
  CHECK (expires_at > created_at)
);
ALTER TABLE app.uploads ENABLE ROW LEVEL SECURITY;
CREATE INDEX uploads_by_owner ON app.uploads (owner_user_id);
CREATE INDEX uploads_lapsing ON app.uploads (expires_at);

-- An upload is born pending and is ready only after preparation, which makes its renditions
-- (spec 33).
CREATE FUNCTION app.uploads_state_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'pending' THEN
      RAISE EXCEPTION 'app.uploads: an upload starts pending (spec 33)'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT (NEW.state = OLD.state
          OR (OLD.state = 'pending' AND NEW.state = 'preparing')
          OR (OLD.state = 'preparing' AND NEW.state IN ('ready', 'held', 'rejected'))
          OR (OLD.state = 'held' AND NEW.state IN ('ready', 'rejected'))) THEN
    RAISE EXCEPTION 'app.uploads: an upload goes from % to % (spec 33)', OLD.state, NEW.state
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER uploads_keep BEFORE UPDATE ON app.uploads
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns(
    'id', 'owner_user_id', 'purpose', 'reservation_id', 'replaces_drop_id', 'content_type', 'byte_size',
    'object_key', 'created_at', 'expires_at');
CREATE TRIGGER uploads_once BEFORE UPDATE ON app.uploads
  FOR EACH ROW EXECUTE FUNCTION app.set_once('rejection', 'content_hash', 'content_version');
CREATE TRIGGER uploads_state_guard BEFORE INSERT OR UPDATE ON app.uploads
  FOR EACH ROW EXECUTE FUNCTION app.uploads_state_guard();

-- A prepared upload's private derivatives, stripped of metadata and streamed only by the API's
-- media routes (T12, ADR-009, ADR-014). Their sizes are served only after the reveal (T10).
CREATE TABLE app.upload_renditions (
  upload_id app.id NOT NULL REFERENCES app.uploads ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('display', 'full')),
  object_key text NOT NULL UNIQUE CHECK (pg_catalog.char_length(object_key) BETWEEN 1 AND 1024),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 20000),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 20000),
  byte_size integer NOT NULL CHECK (byte_size > 0),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (upload_id, kind)
);
ALTER TABLE app.upload_renditions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER upload_renditions_written_once BEFORE UPDATE ON app.upload_renditions
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a rendition is made once');

-- One committed contribution to one day (spec 31). The server never moves it (T4): its day, its
-- club, its author and its kind are fixed, and its content is frozen at the reveal (T3).
CREATE TABLE app.drops (
  id app.id PRIMARY KEY,
  occurrence_id app.id NOT NULL,
  club_id app.id NOT NULL,
  author_interval_id app.id NOT NULL,
  media_class text NOT NULL CHECK (media_class IN ('photo', 'external_video')),
  upload_id app.id UNIQUE REFERENCES app.uploads,
  source_id app.id UNIQUE REFERENCES app.sources,
  -- A replacement still preparing (spec 09); the drop keeps its current photo until it is ready.
  pending_upload_id app.id UNIQUE,
  -- The upload's scoped hash, or the link's scoped identity (T21).
  dedupe_key bytea CHECK (pg_catalog.octet_length(dedupe_key) = 32),
  -- At most 140 grapheme clusters, counted by the API (T13); this bounds the wire form.
  caption text CHECK (pg_catalog.char_length(caption) BETWEEN 1 AND 2240),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'held', 'withdrawn', 'removed')),
  version app.version NOT NULL DEFAULT 1 CHECK (version >= 1),
  -- The commit's instant, and the last change's (T1, T3). Neither is ever served.
  submitted_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  ended_at timestamptz,
  -- Set by the commit once the audience is written (T8).
  audience_sealed_at timestamptz,
  UNIQUE (id, club_id),
  UNIQUE (id, occurrence_id, author_interval_id),
  FOREIGN KEY (occurrence_id, club_id) REFERENCES app.occurrences (id, club_id),
  FOREIGN KEY (occurrence_id, author_interval_id) REFERENCES app.contribution_counters (occurrence_id, interval_id),
  -- A replacement made for this drop.
  FOREIGN KEY (pending_upload_id, id) REFERENCES app.uploads (id, replaces_drop_id),
  CHECK ((media_class = 'photo' AND source_id IS NULL)
         OR (media_class = 'external_video' AND upload_id IS NULL AND pending_upload_id IS NULL)),
  CHECK (state IN ('withdrawn', 'removed') OR ((upload_id IS NOT NULL OR source_id IS NOT NULL) AND dedupe_key IS NOT NULL)),
  CHECK ((state IN ('withdrawn', 'removed')) = (ended_at IS NOT NULL)),
  CHECK (pending_upload_id IS NULL OR state IN ('active', 'held')),
  CHECK (updated_at >= submitted_at)
);
ALTER TABLE app.drops ENABLE ROW LEVEL SECURITY;
-- A day in the order it was added (spec 15, T35).
CREATE INDEX drops_by_day ON app.drops (occurrence_id, submitted_at, id);
CREATE INDEX drops_by_author ON app.drops (author_interval_id, occurrence_id);
-- The last guard against adding the same photo or link twice to a day (T21).
CREATE UNIQUE INDEX drops_no_duplicate ON app.drops (occurrence_id, author_interval_id, dedupe_key)
  WHERE state IN ('active', 'held');
-- Memory search over captions (spec 18), which a withdrawal or removal leaves at once (T24).
CREATE INDEX drops_caption_search ON app.drops USING gin (caption app_extensions.gin_trgm_ops)
  WHERE state = 'active' AND caption IS NOT NULL;

-- The reveal of the day a drop belongs to.
CREATE FUNCTION app.drop_reveal_at(drop_id app.id) RETURNS timestamptz
  LANGUAGE sql STABLE SET search_path = ''
  RETURN (SELECT o.reveal_at FROM app.drops d JOIN app.occurrences o ON o.id = d.occurrence_id WHERE d.id = drop_id);

ALTER TABLE app.reservations
  ADD CONSTRAINT reservations_used_by FOREIGN KEY (drop_id, occurrence_id, interval_id)
  REFERENCES app.drops (id, occurrence_id, author_interval_id);
ALTER TABLE app.uploads
  ADD CONSTRAINT uploads_replaces FOREIGN KEY (replaces_drop_id) REFERENCES app.drops;
ALTER TABLE app.users
  ADD CONSTRAINT users_avatar FOREIGN KEY (avatar_upload_id, id) REFERENCES app.uploads (id, owner_user_id);

CREATE FUNCTION app.drops_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  reveal timestamptz;
BEGIN
  SELECT reveal_at INTO reveal FROM app.occurrences WHERE id = NEW.occurrence_id;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'active' OR NEW.version <> 1 OR NEW.submitted_at >= reveal THEN
      RAISE EXCEPTION 'app.drops: a drop is committed active, at version 1, before the reveal (T3)'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- Withdrawn and removed are final; the purge only takes the content away (T23, T24).
  IF OLD.state IN ('withdrawn', 'removed') THEN
    IF (NEW.state, NEW.version, NEW.updated_at, NEW.ended_at) IS DISTINCT FROM (OLD.state, OLD.version, OLD.updated_at, OLD.ended_at)
       OR (NEW.caption IS NOT NULL AND NEW.caption IS DISTINCT FROM OLD.caption)
       OR (NEW.upload_id IS NOT NULL AND NEW.upload_id IS DISTINCT FROM OLD.upload_id)
       OR (NEW.source_id IS NOT NULL AND NEW.source_id IS DISTINCT FROM OLD.source_id)
       OR (NEW.pending_upload_id IS NOT NULL AND NEW.pending_upload_id IS DISTINCT FROM OLD.pending_upload_id)
       OR (NEW.dedupe_key IS NOT NULL AND NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key) THEN
      RAISE EXCEPTION 'app.drops: a % drop only loses its content (T24)', OLD.state
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.version < OLD.version OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'app.drops: a drop''s version and time never go back (T19)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- Frozen at the reveal: no edit, replacement or swap from then on (T3).
  IF NEW.state IN ('active', 'held') AND NEW.updated_at >= reveal
     AND (NEW.caption, NEW.upload_id, NEW.source_id, NEW.pending_upload_id, NEW.dedupe_key)
         IS DISTINCT FROM (OLD.caption, OLD.upload_id, OLD.source_id, OLD.pending_upload_id, OLD.dedupe_key) THEN
    RAISE EXCEPTION 'app.drops: the day opened at %, so the drop is frozen (T3)', reveal
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- A drop on hold at the reveal never appears afterwards (T29).
  IF OLD.state = 'held' AND NEW.state = 'active' AND NEW.updated_at >= reveal THEN
    RAISE EXCEPTION 'app.drops: a held drop never appears after the reveal (T29)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER drops_guard BEFORE INSERT OR UPDATE ON app.drops
  FOR EACH ROW EXECUTE FUNCTION app.drops_guard();
CREATE TRIGGER drops_keep BEFORE UPDATE ON app.drops
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns(
    'id', 'occurrence_id', 'club_id', 'author_interval_id', 'media_class', 'submitted_at');
CREATE TRIGGER drops_once BEFORE UPDATE ON app.drops
  FOR EACH ROW EXECUTE FUNCTION app.set_once('audience_sealed_at', 'ended_at');
CREATE TRIGGER drops_no_delete BEFORE DELETE ON app.drops
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a drop is withdrawn or removed, never deleted: its audience names it');

-- The intervals that may read a drop: every active member of its club at the commit, the
-- author and the star among them (T8). The commit writes them and then seals the drop; from
-- then on nobody is added, changed or taken away. A member who leaves is checked at read time
-- (T9), never by deleting their row.
CREATE TABLE app.drop_audience (
  drop_id app.id NOT NULL,
  club_id app.id NOT NULL,
  interval_id app.id NOT NULL,
  PRIMARY KEY (drop_id, interval_id),
  FOREIGN KEY (drop_id, club_id) REFERENCES app.drops (id, club_id),
  FOREIGN KEY (interval_id, club_id) REFERENCES app.memberships (interval_id, club_id)
);
ALTER TABLE app.drop_audience ENABLE ROW LEVEL SECURITY;
-- The read predicate, from the viewer's interval (T9).
CREATE INDEX drop_audience_by_interval ON app.drop_audience (interval_id, drop_id);

CREATE FUNCTION app.drop_audience_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  sealed_at timestamptz;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'app.drop_audience: an audience is written once and never changes (T8)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- Waits for a commit that is sealing the drop, then sees its seal.
  SELECT audience_sealed_at INTO sealed_at FROM app.drops WHERE id = NEW.drop_id FOR SHARE;
  IF sealed_at IS NOT NULL THEN
    RAISE EXCEPTION 'app.drop_audience: drop %''s audience was sealed at %; nobody joins it afterwards (T8)',
      NEW.drop_id, sealed_at
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  PERFORM FROM app.memberships WHERE interval_id = NEW.interval_id AND state = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'app.drop_audience: % isn''t an active member, so it isn''t in an audience (T8)', NEW.interval_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER drop_audience_guard BEFORE INSERT OR UPDATE OR DELETE ON app.drop_audience
  FOR EACH ROW EXECUTE FUNCTION app.drop_audience_guard();
CREATE TRIGGER drop_audience_no_truncate BEFORE TRUNCATE ON app.drop_audience
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('an audience never changes (T8)');

-- At the commit's end: the drop is sealed, and its audience is exactly the club's active members,
-- the author and the star among them (T8).
CREATE FUNCTION app.drops_sealed() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  d app.drops%ROWTYPE;
  star app.id;
BEGIN
  SELECT * INTO d FROM app.drops WHERE id = NEW.id;
  SELECT star_interval_id INTO star FROM app.occurrences WHERE id = d.occurrence_id;
  IF d.audience_sealed_at IS NULL THEN
    RAISE EXCEPTION 'app.drops: drop % was committed without sealing its audience (T8)', d.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NOT EXISTS (SELECT FROM app.drop_audience WHERE drop_id = d.id AND interval_id = d.author_interval_id)
     OR NOT EXISTS (SELECT FROM app.drop_audience WHERE drop_id = d.id AND interval_id = star) THEN
    RAISE EXCEPTION 'app.drops: drop %''s audience must hold its author and its star (T8)', d.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF EXISTS (SELECT FROM app.memberships m
              WHERE m.club_id = d.club_id AND m.state = 'active'
                AND NOT EXISTS (SELECT FROM app.drop_audience a WHERE a.drop_id = d.id AND a.interval_id = m.interval_id)) THEN
    RAISE EXCEPTION 'app.drops: drop %''s audience leaves out an active member (T8)', d.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER drops_sealed AFTER INSERT ON app.drops
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.drops_sealed();

-- Every caption a drop has had, for moderation's audit only and never served (spec 31). The
-- purge deletes them with the drop's caption.
CREATE TABLE app.drop_caption_versions (
  drop_id app.id NOT NULL REFERENCES app.drops,
  drop_version integer NOT NULL CHECK (drop_version >= 1),
  -- Null when the edit took the caption away.
  caption text CHECK (pg_catalog.char_length(caption) BETWEEN 1 AND 2240),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (drop_id, drop_version)
);
ALTER TABLE app.drop_caption_versions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER drop_caption_versions_written_once BEFORE UPDATE ON app.drop_caption_versions
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a caption version is written once');

-- Each contributor's one highlight on a day: a pointer to their own drop in it, never a seventh
-- drop (T17, T22). A removal clears the pointer and keeps the row, so its version never goes back.
CREATE TABLE app.highlights (
  occurrence_id app.id NOT NULL,
  interval_id app.id NOT NULL,
  drop_id app.id,
  version app.version NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (occurrence_id, interval_id),
  FOREIGN KEY (occurrence_id, interval_id) REFERENCES app.contribution_counters (occurrence_id, interval_id),
  -- The contributor's own drop, on the same day (TECH-DESIGN section 6).
  FOREIGN KEY (drop_id, occurrence_id, interval_id) REFERENCES app.drops (id, occurrence_id, author_interval_id)
);
ALTER TABLE app.highlights ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX highlights_by_drop ON app.highlights (drop_id) WHERE drop_id IS NOT NULL;

CREATE FUNCTION app.highlights_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  drop_state text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'app.highlights: a highlight is cleared, never deleted, so its version never goes back (T22)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'app.highlights: every change moves the version by one (T22)'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  -- Pointing it, but not clearing it, needs an active drop before the reveal (spec 31, T3).
  IF NEW.drop_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.drop_id IS DISTINCT FROM OLD.drop_id) THEN
    SELECT state INTO drop_state FROM app.drops WHERE id = NEW.drop_id FOR SHARE;
    IF drop_state <> 'active' OR NEW.updated_at >= app.drop_reveal_at(NEW.drop_id) THEN
      RAISE EXCEPTION 'app.highlights: a highlight points to an active drop, before the reveal (T3, T22)'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER highlights_guard BEFORE INSERT OR UPDATE OR DELETE ON app.highlights
  FOR EACH ROW EXECUTE FUNCTION app.highlights_guard();
CREATE TRIGGER highlights_keep BEFORE UPDATE ON app.highlights
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('occurrence_id', 'interval_id');

-- A withdrawal or removal clears the highlight on the drop in the same transaction (T22, T24).
CREATE FUNCTION app.drops_ended_unhighlighted() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT FROM app.highlights WHERE drop_id = NEW.id) THEN
    RAISE EXCEPTION 'app.drops: drop % ended with a highlight still on it (T22)', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER drops_ended_unhighlighted AFTER UPDATE ON app.drops
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.state IN ('withdrawn', 'removed') AND OLD.state IN ('active', 'held'))
  EXECUTE FUNCTION app.drops_ended_unhighlighted();
