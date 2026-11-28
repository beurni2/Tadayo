-- 0021: the reveal push's plan and its deliveries (spec 21; T1, T9, T27, T36, T37, T52, T53; FQ30;
-- docs/plans/api-b2-spike-push.md, section 2).
--
-- The worker's minute pass plans a day's pushes once the day has opened (services/worker/src/push.ts): one row in
-- `push_days`, which a second plan finds, and so plans nothing (Q17), and one row in `push_deliveries` for each
-- recipient and registration. Each delivery is then claimed, decided, sent and answered as the plan's section 2.3
-- says, its state moving from `pending` to `sending` and on to `sent`, `skipped` or `failed`, or back to `pending`
-- when quiet hours hold it or APNs asks for a retry.
--
-- Nothing personal but an account and a day is kept, and not for long. No token: 0017 keeps it alone, and the
-- dispatch reads it there when it sends. No name and no body: the dispatch writes the body from the day's facts at the
-- moment it sends (T37). A delivery names a sign-in only while that sign-in is registered: `sign_in` references the
-- registration `ON DELETE SET NULL`, so the transaction that deletes it (a removal, a move, a dead token, an
-- account's deletion) clears it from every delivery, and no kept row joins an ended sign-in, whose row holds no
-- account, to an account (TECH-DESIGN section 6 (b); PR #120's privacy review, P6). The worker's minute deletes a
-- day's rows 48 hours after it closes, whatever TADAYO_PUSH says.
--
-- The locks, in the order 0017's header gives for every writer of the registrations (transaction-scoped advisory
-- locks, then `app.users` rows, then the registrations, then the deliveries through the foreign key):
-- - The plan writes `push_days` first, then takes its readers' sign-in locks in their hashes' order, their
--   `app.users` rows `FOR KEY SHARE` in their ids' order and their registrations `FOR KEY SHARE`
--   (`lockDevicesOf`, packages/domain/src/identity/devices.ts), then writes the deliveries. A registration deleted
--   while it waited is left out. (PR #159's first review, D3 and D4: the first draft took the registrations alone,
--   reader by reader, and deadlocked a move that held one sign-in's lock while it waited for another's row.)
-- - The decision locks the recipient's `app.users` row `FOR NO KEY UPDATE`, then the delivery's row.
-- - The send locks the delivery's row alone, reads its registration's token under it, and holds the row across
--   Apple's answer, for at most the sender's 10 seconds: a removal or a move of that registration, whose foreign key
--   updates the row, waits for it after its own locks, and the send waits on nothing they hold.
-- - A dead token's deletion, in a transaction of its own once the send's has ended, takes the sign-in's advisory
--   lock, then the account's row, then deletes the registration (whose deliveries the foreign key then sets null).
-- - The purge deletes closed days' `push_days` rows, and their deliveries through the cascade.
-- A removal or a move from another account takes no `app.users` row of the recipient's and waits for a delivery's
-- row only through the foreign key's update, after its own locks, so none of these deadlocks another but one: the
-- purge's cascade and a removal's foreign key take a closed day's delivery rows each in its own order, and Postgres
-- then cancels one, which runs again (docs/LIMITATIONS.md; the review's D12).

CREATE TABLE app.push_days (
  occurrence_id app.id PRIMARY KEY REFERENCES app.occurrences ON DELETE CASCADE,
  -- The server's clock when the day's pushes were planned (T1).
  planned_at timestamptz NOT NULL
);
ALTER TABLE app.push_days ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER push_days_keep BEFORE UPDATE ON app.push_days
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('occurrence_id', 'planned_at');

CREATE TABLE app.push_deliveries (
  id app.id PRIMARY KEY,
  occurrence_id app.id NOT NULL REFERENCES app.push_days ON DELETE CASCADE,
  user_id app.id NOT NULL REFERENCES app.users,
  -- The registration it goes to, while it lives (above).
  sign_in bytea REFERENCES app.device_registrations ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sending', 'sent', 'skipped', 'failed')),
  -- When it may next be decided: the reveal, the end of the device's quiet hours, or a retry's (T37).
  due_at timestamptz NOT NULL,
  -- The end of the claim or the send that holds it, by the server's clock.
  lease_until timestamptz,
  -- The sends tried, counted as each is decided.
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  -- When a decision to send it was first made in its budget day: what the member's budget counts (T37, FQ30).
  -- Kept while Apple may have taken the push (no answer in time, a lost stream), cleared when Apple's answer says it
  -- took nothing (services/worker/src/push.ts).
  sent_at timestamptz,
  -- Why it was skipped or failed: one of the dispatch's codes, or APNs' reason (T52: a code, never a message).
  outcome text CHECK (pg_catalog.char_length(outcome) <= 64 AND outcome ~ '^[A-Za-z][A-Za-z0-9_.]*$'),
  finished_at timestamptz,
  planned_at timestamptz NOT NULL,
  UNIQUE (occurrence_id, user_id, sign_in),
  CHECK ((state IN ('sent', 'skipped', 'failed')) = (finished_at IS NOT NULL)),
  CHECK ((state IN ('skipped', 'failed')) = (outcome IS NOT NULL)),
  CHECK (state <> 'sending' OR (lease_until IS NOT NULL AND sent_at IS NOT NULL)),
  CHECK (state <> 'sent' OR sent_at IS NOT NULL),
  CHECK (state IN ('pending', 'sending') OR lease_until IS NULL)
);
ALTER TABLE app.push_deliveries ENABLE ROW LEVEL SECURITY;
CREATE INDEX push_deliveries_due ON app.push_deliveries (due_at) WHERE state IN ('pending', 'sending');
CREATE INDEX push_deliveries_budget ON app.push_deliveries (user_id, sent_at) WHERE sent_at IS NOT NULL;
-- For the foreign key's update when a registration is deleted.
CREATE INDEX push_deliveries_sign_in ON app.push_deliveries (sign_in) WHERE sign_in IS NOT NULL;
CREATE TRIGGER push_deliveries_keep BEFORE UPDATE ON app.push_deliveries
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('id', 'occurrence_id', 'user_id', 'planned_at');

-- A delivery's sign-in only ever goes, never comes or changes: a row can't be pointed at another device. A delivery
-- is planned only for a registration of its own account, and the send reads the token from that registration under
-- the delivery's lock; a token that moves to another account's sign-in deletes this registration first, which waits
-- for the send and then sets this row's sign-in null. So a push never goes to another account's device.
CREATE FUNCTION app.push_deliveries_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.sign_in IS NOT NULL AND NEW.sign_in IS DISTINCT FROM OLD.sign_in THEN
      RAISE EXCEPTION 'app.push_deliveries: a delivery''s sign-in only goes, when its registration does (T52)'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  ELSIF NEW.sign_in IS NOT NULL
        AND NOT EXISTS (SELECT FROM app.device_registrations
                         WHERE sign_in = NEW.sign_in AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'app.push_deliveries: a delivery goes only to a registration of its own account (T52)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER push_deliveries_guard BEFORE INSERT OR UPDATE ON app.push_deliveries
  FOR EACH ROW EXECUTE FUNCTION app.push_deliveries_guard();
