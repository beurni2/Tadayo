-- 0017: device registrations for pushes, and the sign-ins whose registration has ended (spec 21, 23;
-- T1, T14, T27, T37, T52, T53; TECH-DESIGN section 6, device registration (a) to (e);
-- docs/plans/api-b2-spike-push.md, section 1).
--
-- A sign-in is named by the SHA-256 of the removal secret its app made at that sign-in (the
-- contract's `RemovalSecret`): the server keeps that hash and nothing else of the secret, so the
-- hash can't authorize a removal ((a)). `registerDevice` and `removeDevice`
-- (packages/domain/src/identity/devices.ts) write these tables, one command in one transaction.
--
-- The locks, in this order for every writer of these tables, each taking only those it needs:
-- transaction-scoped advisory locks first (a token's, `tadayo.device.token:<token>`, then each
-- sign-in's, `tadayo.device.sign-in:<hash in hex>`, in the hashes' ascending order), then the account's
-- row in `app.users`, then the registrations' rows. Each advisory lock is one 64-bit key,
-- `hashtextextended(name, 0)`.
-- - `registerDevice` takes them all, and locks only its own account's row, even when it moves a token
--   from another account's sign-in.
-- - `removeDevice` takes its sign-in's lock and locks no account's row.
-- - Spike S4's dispatch, deleting a dead token's registration, takes that sign-in's lock, then the
--   account's row.
-- - B8's account deletion takes no advisory lock: it locks the account's row as the deletion begins,
--   then deletes the account's registrations.
-- No writer takes an advisory lock after a row lock, so none of them deadlocks another on these tables.
--
-- The guards below are the last line behind the commands, and take the sign-in's lock themselves,
-- so a writer that forgot it can't slip a registration past an ending at once (each guard's check
-- would otherwise not see the other's row before it commits). A command holds that lock already, so it
-- never waits there. A writer without it can reach it after a row lock (an update's own row, or the
-- ending's check at the commit), out of the order above: Postgres may then end that writer with a
-- deadlock error, but never lets both rows commit. The guards:
-- - `device_registrations_guard`: a registration is written only for an active account with a
--   finished profile (FQ69), read `FOR SHARE` so that a deletion that begins waits for it or is seen
--   by it (T27), and never for a sign-in that has ended ((e)).
-- - `device_sign_ins_ended_guard`: a sign-in is ended only once its registration is gone, checked
--   at the commit.
-- - `users_deleted_without_devices`: the shell a deletion leaves keeps no registration (T27, spec
--   23), as 0009's receipts.
--
-- A token is a device's address (T52): the database holds it only here, in lowercase hex, unique,
-- so it belongs to one sign-in at a time ((a), the move). Nothing new is added to any other table.

CREATE TABLE app.device_registrations (
  -- The sign-in: the SHA-256 of its removal secret.
  sign_in bytea PRIMARY KEY CHECK (pg_catalog.octet_length(sign_in) = 32),
  user_id app.id NOT NULL REFERENCES app.users ON DELETE CASCADE,
  -- The APNs device token, as the contract's `apns_token` in lowercase (Postgres's regular expressions count
  -- to 255 at most, so the length is its own check).
  apns_token text NOT NULL UNIQUE
    CHECK (pg_catalog.char_length(apns_token) BETWEEN 16 AND 512 AND apns_token ~ '^[0-9a-f]+$'),
  apns_environment text NOT NULL CHECK (apns_environment IN ('sandbox', 'production')),
  -- The device's IANA zone, for its quiet hours (T37), as `app.clubs.timezone` checks it (0003); the
  -- domain keeps only the spelling the server resolves (`clubTimeZone`).
  timezone text NOT NULL CHECK (
    pg_catalog.char_length(timezone) <= 64 AND timezone ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)*$'),
  -- The server's clock at the registration (T1).
  registered_at timestamptz NOT NULL
);
ALTER TABLE app.device_registrations ENABLE ROW LEVEL SECURITY;
CREATE INDEX device_registrations_user ON app.device_registrations (user_id);
CREATE TRIGGER device_registrations_keep BEFORE UPDATE ON app.device_registrations
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('sign_in', 'user_id');

-- A sign-in whose registration was removed, or whose token moved to a later sign-in: a registration
-- of it that lands late changes nothing ((e)). It holds the hash and a time, nothing personal ((b)),
-- and nothing in it can refuse another sign-in's registration, since each sign-in has a secret of
-- its own. A row older than `ENDED_KEEP` (8 days, past the longest life of a Supabase access token)
-- is deleted by the next registration or removal.
CREATE TABLE app.device_sign_ins_ended (
  sign_in bytea PRIMARY KEY CHECK (pg_catalog.octet_length(sign_in) = 32),
  ended_at timestamptz NOT NULL
);
ALTER TABLE app.device_sign_ins_ended ENABLE ROW LEVEL SECURITY;
CREATE INDEX device_sign_ins_ended_at ON app.device_sign_ins_ended (ended_at);
CREATE TRIGGER device_sign_ins_ended_keep BEFORE UPDATE ON app.device_sign_ins_ended
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('sign_in', 'ended_at');

CREATE FUNCTION app.device_registrations_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- The sign-in's lock, which the command holds already (the header's order).
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'tadayo.device.sign-in:' OPERATOR(pg_catalog.||) pg_catalog.encode(NEW.sign_in, 'hex'), 0));
  PERFORM FROM app.users
    WHERE id = NEW.user_id AND state = 'active' AND age_confirmed_at IS NOT NULL AND display_name IS NOT NULL
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'app.device_registrations: a device is registered only for an active account with a finished profile (T27, FQ69)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF EXISTS (SELECT FROM app.device_sign_ins_ended WHERE sign_in = NEW.sign_in) THEN
    RAISE EXCEPTION 'app.device_registrations: a sign-in that has ended registers nothing (TECH-DESIGN section 6 (e))'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER device_registrations_guard BEFORE INSERT OR UPDATE ON app.device_registrations
  FOR EACH ROW EXECUTE FUNCTION app.device_registrations_guard();

CREATE FUNCTION app.device_sign_ins_ended_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- At the commit, the sign-in's lock, which the command holds already: a registration of it written
  -- at once by a writer without the lock holds it to its own commit, and is then seen here.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'tadayo.device.sign-in:' OPERATOR(pg_catalog.||) pg_catalog.encode(NEW.sign_in, 'hex'), 0));
  IF EXISTS (SELECT FROM app.device_registrations WHERE sign_in = NEW.sign_in) THEN
    RAISE EXCEPTION 'app.device_sign_ins_ended: a sign-in ends only once its registration is gone (TECH-DESIGN section 6 (e))'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER device_sign_ins_ended_guard AFTER INSERT ON app.device_sign_ins_ended
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.device_sign_ins_ended_guard();

CREATE FUNCTION app.users_deleted_without_devices() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT FROM app.device_registrations WHERE user_id = NEW.id) THEN
    RAISE EXCEPTION 'app.users: % was deleted with a device registration still kept (T27)', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER users_deleted_without_devices AFTER UPDATE ON app.users
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.state = 'deleted' AND OLD.state <> 'deleted')
  EXECUTE FUNCTION app.users_deleted_without_devices();
