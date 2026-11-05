-- 0003: accounts, clubs and membership intervals (spec 31: User, Club, Membership; spec 04, 22,
-- 23; T7, T8, T27; TECH-DESIGN section 6).
--
-- Supabase Auth owns sign-in and its sessions (spec 31's Session), so there is no session table:
-- the API maps the token's subject to `users` on every request and reads `users.state`, which a
-- deletion ends at once (T27).

CREATE TABLE app.users (
  id app.id PRIMARY KEY,
  -- Supabase Auth's user id, the token's `sub`; no foreign key into Supabase's schemas (ADR-015).
  -- A retried first sign-in finds the same row (INSERT ... ON CONFLICT). Null once deleted.
  auth_subject uuid UNIQUE,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'deleting', 'deleted')),
  -- The profile (FQ69): the one 18-or-older confirmation (FQ13; no birthdate, ever) and the name
  -- every club sees (spec 23). No email address is ever kept here (spec 23).
  age_confirmed_at timestamptz,
  display_name app.name,
  -- The avatar: a ready upload of the account's own (its foreign key comes with uploads, 0006),
  -- whose random content version is the avatar's (FQ74).
  avatar_upload_id app.id,
  version app.version NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  CHECK ((state = 'active') = (deletion_requested_at IS NULL)),
  CHECK ((state = 'deleted') = (deleted_at IS NOT NULL)),
  CHECK ((state = 'deleted') = (auth_subject IS NULL)),
  -- A deleted account is a shell that keeps nothing personal, so the memberships and sealed
  -- audiences that name it still resolve (T8, T27).
  CHECK (state <> 'deleted' OR (age_confirmed_at IS NULL AND display_name IS NULL AND avatar_upload_id IS NULL)),
  CHECK (display_name IS NULL OR age_confirmed_at IS NOT NULL),
  CHECK (avatar_upload_id IS NULL OR age_confirmed_at IS NOT NULL),
  CHECK (deleted_at IS NULL OR deleted_at >= deletion_requested_at)
);
ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;

-- A deletion goes one way: active, then deleting, then deleted (T27), and the 18-or-older
-- confirmation can't be taken back (FQ13), except that the shell drops it.
CREATE FUNCTION app.users_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT (NEW.state = OLD.state
          OR (OLD.state = 'active' AND NEW.state IN ('deleting', 'deleted'))
          OR (OLD.state = 'deleting' AND NEW.state = 'deleted')) THEN
    RAISE EXCEPTION 'app.users: an account goes from % back to % (T27)', OLD.state, NEW.state
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.age_confirmed_at IS NOT NULL AND NEW.age_confirmed_at IS DISTINCT FROM OLD.age_confirmed_at
     AND NEW.state <> 'deleted' THEN
    RAISE EXCEPTION 'app.users: the age confirmation can''t be taken back (FQ13)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.auth_subject IS DISTINCT FROM NEW.auth_subject AND NEW.state <> 'deleted' THEN
    RAISE EXCEPTION 'app.users: an account''s sign-in identity can''t change'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER users_keep BEFORE UPDATE ON app.users
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('id', 'created_at');
CREATE TRIGGER users_once BEFORE UPDATE ON app.users
  FOR EACH ROW EXECUTE FUNCTION app.set_once('deletion_requested_at', 'deleted_at');
CREATE TRIGGER users_guard BEFORE UPDATE ON app.users
  FOR EACH ROW EXECUTE FUNCTION app.users_guard();
CREATE INDEX users_deleting ON app.users (deletion_requested_at) WHERE state = 'deleting';

-- A club. Its state isn't stored: proposed until activated_at, suspended while suspended_at is
-- set, paused with fewer than two active members (FQ16), active otherwise, so it always agrees
-- with the roster (book p24). Nobody administers it: the creator's membership is kept only for
-- the first roster's start (FQ54, FQ84).
CREATE TABLE app.clubs (
  id app.id PRIMARY KEY,
  name app.name NOT NULL,
  -- The IANA zone it was made in, fixed for its life (spec 05, T2, FQ19); the API checks the
  -- server can resolve it.
  timezone text NOT NULL CHECK (
    pg_catalog.char_length(timezone) <= 64 AND timezone ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)*$'
  ),
  creator_interval_id app.id NOT NULL,
  -- What a proposal sends as expected_roster_version: it moves when a membership starts or ends
  -- or the open revision is proposed, made, applied or ended, never on an approval or an
  -- acceptance (T33).
  roster_version app.version NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  activated_at timestamptz,
  -- Moderation's emergency suspension (spec 22, T9), set only with an operator action (FQ27).
  suspended_at timestamptz,
  CHECK (activated_at IS NULL OR activated_at >= created_at)
);
ALTER TABLE app.clubs ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER clubs_keep BEFORE UPDATE ON app.clubs
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('id', 'timezone', 'creator_interval_id', 'created_at');
CREATE TRIGGER clubs_once BEFORE UPDATE ON app.clubs
  FOR EACH ROW EXECUTE FUNCTION app.set_once('activated_at');
CREATE TRIGGER clubs_no_delete BEFORE DELETE ON app.clubs
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a club is never deleted: its days and audiences name it');
CREATE TRIGGER clubs_no_truncate BEFORE TRUNCATE ON app.clubs
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('a club is never deleted: its days and audiences name it');

-- One row per membership interval (TECH-DESIGN section 6): a rejoin is a new interval, which
-- inherits nothing (T8, Q06). The contract calls its id `membership_id`.
CREATE TABLE app.memberships (
  interval_id app.id PRIMARY KEY,
  club_id app.id NOT NULL REFERENCES app.clubs,
  user_id app.id NOT NULL REFERENCES app.users,
  -- The two ways in (T7): the creator's own membership, made with the club, or a candidate's,
  -- made when the exact roster revision they accepted is applied (its keys come with 0004).
  origin text NOT NULL CHECK (origin IN ('creator', 'roster')),
  joined_via_revision_id app.id,
  joined_via_candidate_id app.id,
  joined_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'left', 'left_by_block', 'account_deleted')),
  left_at timestamptz,
  -- Leaving or blocking asks what happens to past contributions (spec 22, T26).
  contributions text CHECK (contributions IN ('keep', 'withdraw')),
  -- The name the person had when the interval ended, shown from then on with no avatar (FQ75's
  -- default). For a deleted account it is the founder's to decide (T27), so it may be empty.
  ended_display_name app.name,
  UNIQUE (interval_id, club_id),
  UNIQUE (interval_id, user_id),
  CHECK ((origin = 'roster') = (joined_via_revision_id IS NOT NULL)),
  CHECK ((joined_via_revision_id IS NULL) = (joined_via_candidate_id IS NULL)),
  CHECK ((state = 'active') = (left_at IS NULL)),
  CHECK (left_at IS NULL OR left_at >= joined_at),
  CHECK (state <> 'active' OR (contributions IS NULL AND ended_display_name IS NULL)),
  CHECK (state NOT IN ('left', 'left_by_block') OR (contributions IS NOT NULL AND ended_display_name IS NOT NULL))
);
ALTER TABLE app.memberships ENABLE ROW LEVEL SECURITY;
-- One active interval per club and account (TECH-DESIGN section 6).
CREATE UNIQUE INDEX memberships_one_active ON app.memberships (club_id, user_id) WHERE state = 'active';
CREATE INDEX memberships_by_user ON app.memberships (user_id) WHERE state = 'active';
-- The creator's membership is the one made with the club; every other comes by a roster (T7).
CREATE UNIQUE INDEX memberships_one_creator ON app.memberships (club_id) WHERE origin = 'creator';
CREATE UNIQUE INDEX memberships_one_per_candidate ON app.memberships (joined_via_candidate_id)
  WHERE joined_via_candidate_id IS NOT NULL;

-- An interval ends once and never starts again (T8, Q06). A club holds at most six active
-- members (A01, T6): every command that adds one holds the club's row, and this takes the same
-- lock before counting, so it is a last guard that no race can pass.
CREATE FUNCTION app.memberships_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  active integer;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.state <> 'active' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'app.memberships: an ended interval never changes; a rejoin is a new one (T8)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.state = 'active' AND (TG_OP = 'INSERT' OR OLD.state <> 'active') THEN
    PERFORM 1 FROM app.clubs WHERE id = NEW.club_id FOR UPDATE;
    SELECT pg_catalog.count(*) INTO active FROM app.memberships
     WHERE club_id = NEW.club_id AND state = 'active' AND interval_id <> NEW.interval_id;
    IF active >= 6 THEN
      RAISE EXCEPTION 'app.memberships: a club has at most six members (A01)'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER memberships_keep BEFORE UPDATE ON app.memberships
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns(
    'interval_id', 'club_id', 'user_id', 'origin', 'joined_via_revision_id', 'joined_via_candidate_id', 'joined_at');
CREATE TRIGGER memberships_guard BEFORE INSERT OR UPDATE ON app.memberships
  FOR EACH ROW EXECUTE FUNCTION app.memberships_guard();
CREATE TRIGGER memberships_no_delete BEFORE DELETE ON app.memberships
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('an interval is never deleted: audiences name it (T8)');
CREATE TRIGGER memberships_no_truncate BEFORE TRUNCATE ON app.memberships
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('an interval is never deleted: audiences name it (T8)');

-- The creator's membership is made in the club's own transaction.
ALTER TABLE app.clubs
  ADD CONSTRAINT clubs_creator FOREIGN KEY (creator_interval_id, id)
  REFERENCES app.memberships (interval_id, club_id) DEFERRABLE INITIALLY DEFERRED;
