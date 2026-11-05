-- 0009: idempotency receipts and the outbox (spec 31: Outbox; spec 30, 32, 34; T19, T27, T52, T54;
-- TECH-DESIGN sections 5 and 6).

-- Whether a JSON value holds, at any depth, someone's text, a link or a token: a string, object or
-- array under a key that names one (caption, text, body, note, url, href, link, token, preview,
-- message, secret or signed, in any case and inside a longer key: `captions`, `player_url`,
-- `signedUpload`), or a string with a URL scheme's `://` anywhere but in a name, which is
-- anyone's own choice of text. A flag such as `text_previews: true` is no content. Receipts and
-- events hold ids, versions, targets and states only (TECH-DESIGN section 6; T12, T52), so this
-- is their last guard behind the code that writes them; text hidden inside a string that isn't a
-- link (a JSON document as a string) is that code's to keep out.
CREATE FUNCTION app.holds_content(value jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE SET search_path = ''
  RETURN pg_catalog.jsonb_path_exists(value,
      'strict $.** ? (@.type() == "object").keyvalue()
         ? (@.key like_regex "caption|text|body|note|url|href|link|token|preview|message|secret|signed" flag "i"
            && (@.value.type() == "string" || @.value.type() == "object" || @.value.type() == "array"))')
    OR pg_catalog.jsonb_path_exists(value,
      'strict $.** ? (@.type() == "object").keyvalue()
         ? (@.value.type() == "string" && @.value like_regex "://"
            && !(@.key like_regex "^(display_name|name|club_name|inviter_name|label)$"))')
    OR pg_catalog.jsonb_path_exists(value, 'strict $.** ? (@.type() == "array")[*] ? (@.type() == "string" && @ like_regex "://")')
    OR pg_catalog.jsonb_path_exists(value, 'strict $ ? (@.type() == "string" && @ like_regex "://")');

-- One commit per caller, operation and key (T19). The receipt is reserved first in the command's
-- own transaction and completed last, so it exists only with the effect it records; a request
-- that fails rolls it back with everything else (TECH-DESIGN section 5). A retry with the same
-- request hash replays the stored response; any other is IDEMPOTENCY_CONFLICT. An account's
-- receipts go with the account (T27): an account that anything names stays as a shell (0003),
-- so the deletion that makes the shell deletes its receipts first, or doesn't commit
-- (users_deleted_without_receipts), and nothing writes one for it afterwards.
CREATE TABLE app.idempotency_receipts (
  actor_user_id app.id NOT NULL REFERENCES app.users ON DELETE CASCADE,
  -- The contract's idempotent operations (packages/contracts; a test keeps the two lists equal).
  operation text NOT NULL CHECK (operation IN (
    'updateMe', 'deleteAccount', 'setNotificationPreferences', 'setClubNotificationPreferences', 'createClub',
    'proposeRoster', 'approveRoster', 'declineRoster', 'createInvitation', 'acceptInvitation', 'chooseScheduleDays',
    'confirmScheduleDays', 'leaveClub', 'blockMember', 'createUpload', 'createReservation', 'createDrop', 'updateDrop',
    'removeDrop', 'createReport', 'setHighlight', 'createComment', 'updateComment')),
  -- The Idempotency-Key header.
  idempotency_key uuid NOT NULL,
  -- requestHash in packages/domain: the operation, path, query and body, hashed.
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'completed')),
  response_status smallint CHECK (response_status BETWEEN 200 AND 299),
  -- The response without a caption, a comment, a note, a link or a token: the caller already holds
  -- what it sent, and a replay of createUpload signs a new upload URL (T12).
  response_body jsonb CHECK (NOT app.holds_content(response_body)),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (actor_user_id, operation, idempotency_key),
  CHECK ((state = 'completed') = (response_status IS NOT NULL)),
  CHECK ((state = 'completed') = (response_body IS NOT NULL))
);
ALTER TABLE app.idempotency_receipts ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION app.idempotency_receipts_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.state = 'completed' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'app.idempotency_receipts: a completed receipt never changes (T19)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE FUNCTION app.idempotency_receipts_actor_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Waits for a deletion making the account a shell, then sees it.
  PERFORM FROM app.users WHERE id = NEW.actor_user_id AND state <> 'deleted' FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'app.idempotency_receipts: % is deleted, so keeps no receipts (T27)', NEW.actor_user_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER idempotency_receipts_actor_guard BEFORE INSERT ON app.idempotency_receipts
  FOR EACH ROW EXECUTE FUNCTION app.idempotency_receipts_actor_guard();

CREATE FUNCTION app.users_deleted_without_receipts() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT FROM app.idempotency_receipts WHERE actor_user_id = NEW.id) THEN
    RAISE EXCEPTION 'app.users: % was deleted with its receipts still kept (T27)', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER users_deleted_without_receipts AFTER UPDATE ON app.users
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.state = 'deleted' AND OLD.state <> 'deleted')
  EXECUTE FUNCTION app.users_deleted_without_receipts();

CREATE TRIGGER idempotency_receipts_keep BEFORE UPDATE ON app.idempotency_receipts
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('actor_user_id', 'operation', 'idempotency_key', 'request_hash', 'created_at');
CREATE TRIGGER idempotency_receipts_guard BEFORE UPDATE ON app.idempotency_receipts
  FOR EACH ROW EXECUTE FUNCTION app.idempotency_receipts_guard();

CREATE FUNCTION app.idempotency_receipts_completed() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT FROM app.idempotency_receipts
              WHERE actor_user_id = NEW.actor_user_id AND operation = NEW.operation
                AND idempotency_key = NEW.idempotency_key AND state = 'pending') THEN
    RAISE EXCEPTION 'app.idempotency_receipts: a receipt commits only with its response (T19)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER idempotency_receipts_completed AFTER INSERT ON app.idempotency_receipts
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.idempotency_receipts_completed();

-- Events written in the same transaction as the change they follow, and handled at least once by
-- the worker's idempotent handlers (T54). Their payloads hold ids and codes only (T52).
CREATE TABLE app.outbox_events (
  id app.id PRIMARY KEY,
  topic text NOT NULL CHECK (topic ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'),
  -- A producer writes INSERT ... ON CONFLICT (dedupe_key) DO NOTHING, so a retried opening,
  -- closing or deletion step happens once (T54).
  dedupe_key text NOT NULL UNIQUE CHECK (dedupe_key ~ '^[A-Za-z0-9_.:-]{1,200}$'),
  payload jsonb NOT NULL CHECK (
    pg_catalog.jsonb_typeof(payload) = 'object'
    AND pg_catalog.octet_length(payload::text) <= 4096
    AND NOT app.holds_content(payload)
  ),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'done', 'dead')),
  -- When it is due: now, or a day's reveal_at or close_at, from the time module (T1, ADR-013).
  available_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  -- An error code, never a message that could quote content (T52).
  last_error text CHECK (last_error ~ '^[A-Za-z0-9_.:-]{1,200}$'),
  created_at timestamptz NOT NULL,
  processed_at timestamptz,
  CHECK ((state = 'pending') = (processed_at IS NULL))
);
ALTER TABLE app.outbox_events ENABLE ROW LEVEL SECURITY;
-- The worker's poll (FOR UPDATE SKIP LOCKED, TECH-DESIGN section 5).
CREATE INDEX outbox_events_due ON app.outbox_events (available_at) WHERE state = 'pending';
CREATE TRIGGER outbox_events_keep BEFORE UPDATE ON app.outbox_events
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('id', 'topic', 'dedupe_key', 'payload', 'created_at');
