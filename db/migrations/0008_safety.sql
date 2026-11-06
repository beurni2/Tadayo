-- 0008: reports, moderation, removals, blocks and the deletion record (spec 31: Report, Removal,
-- Block; spec 22, 23, 34; T23 to T29; FQ27, FQ32; ADR-010; TECH-DESIGN section 6).
--
-- The operator works through audited scripts that act by id (FQ27, FQ32): no row here holds a
-- caption, a comment or a note except a report's own note, and nothing is ever served to the
-- club about who reported, removed or blocked (T25; spec 21, 22).

-- One case per reported drop or comment, open until an operator closes it.
CREATE TABLE app.moderation_cases (
  id app.id PRIMARY KEY,
  drop_id app.id NOT NULL REFERENCES app.drops,
  -- Set when the case is about one of the drop's comments.
  comment_id app.id,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),
  opened_at timestamptz NOT NULL,
  closed_at timestamptz,
  UNIQUE (id, drop_id),
  FOREIGN KEY (comment_id, drop_id) REFERENCES app.comments (id, drop_id),
  CHECK ((state = 'open') = (closed_at IS NULL)),
  CHECK (closed_at IS NULL OR closed_at >= opened_at)
);
ALTER TABLE app.moderation_cases ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX moderation_cases_one_open ON app.moderation_cases (drop_id, comment_id) NULLS NOT DISTINCT
  WHERE state = 'open';
CREATE TRIGGER moderation_cases_keep BEFORE UPDATE ON app.moderation_cases
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('id', 'drop_id', 'comment_id', 'opened_at');
CREATE TRIGGER moderation_cases_once BEFORE UPDATE ON app.moderation_cases
  FOR EACH ROW EXECUTE FUNCTION app.set_once('closed_at');
CREATE TRIGGER moderation_cases_no_delete BEFORE DELETE ON app.moderation_cases
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a case is closed, never deleted');
CREATE TRIGGER moderation_cases_no_truncate BEFORE TRUNCATE ON app.moderation_cases
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('a case is closed, never deleted');

-- The audit trail of every moderation script (FQ27): who ran which script at which commit, what
-- it did to which id, and under which policy (T29). It holds ids and codes only (T52), and its
-- target is no foreign key, so purging content never touches it.
CREATE TABLE app.operator_actions (
  id app.id PRIMARY KEY,
  -- A stable label for the operator, never an email address (T52).
  operator text NOT NULL CHECK (operator ~ '^[a-z][a-z0-9_-]{0,63}$'),
  script text NOT NULL CHECK (script ~ '^[a-z][a-z0-9_-]{0,63}$'),
  -- The commit the script ran at, and the workflow run, when there was one.
  script_version text NOT NULL CHECK (script_version ~ '^[0-9a-f]{40}$'),
  run_ref text CHECK (run_ref ~ '^[0-9]{1,20}$'),
  action text NOT NULL CHECK (action IN (
    'hold_drop', 'release_hold', 'remove_drop', 'remove_comment', 'suspend_occurrence', 'suspend_club', 'close_case')),
  target_kind text NOT NULL CHECK (target_kind IN ('drop', 'comment', 'occurrence', 'club', 'case')),
  target_id app.id NOT NULL,
  case_id app.id REFERENCES app.moderation_cases,
  policy text NOT NULL CHECK (policy ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  acted_at timestamptz NOT NULL
);
ALTER TABLE app.operator_actions ENABLE ROW LEVEL SECURITY;
CREATE INDEX operator_actions_by_target ON app.operator_actions (target_kind, target_id);
CREATE INDEX operator_actions_by_case ON app.operator_actions (case_id) WHERE case_id IS NOT NULL;
CREATE TRIGGER operator_actions_append_only BEFORE UPDATE OR DELETE ON app.operator_actions
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('the audit trail is append-only (FQ27)');
CREATE TRIGGER operator_actions_no_truncate BEFORE TRUNCATE ON app.operator_actions
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('the audit trail is append-only (FQ27)');

-- A member's report of a drop they can read (its caption before the reveal) or of a comment on
-- it, never their own (spec 22). It joins the target's open case and changes nothing visible.
CREATE TABLE app.reports (
  id app.id PRIMARY KEY,
  case_id app.id NOT NULL,
  drop_id app.id NOT NULL,
  reporter_interval_id app.id NOT NULL,
  -- At most 500 grapheme clusters, counted by the API; never logged or analysed (T51, T52).
  note text CHECK (pg_catalog.char_length(note) BETWEEN 1 AND 8000),
  created_at timestamptz NOT NULL,
  FOREIGN KEY (case_id, drop_id) REFERENCES app.moderation_cases (id, drop_id),
  -- Only someone in the drop's audience reports it or its comments.
  FOREIGN KEY (drop_id, reporter_interval_id) REFERENCES app.drop_audience (drop_id, interval_id)
);
ALTER TABLE app.reports ENABLE ROW LEVEL SECURITY;
CREATE INDEX reports_by_case ON app.reports (case_id);
CREATE INDEX reports_by_reporter ON app.reports (reporter_interval_id);

CREATE FUNCTION app.reports_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  target_author app.id;
BEGIN
  SELECT coalesce(c.author_interval_id, d.author_interval_id) INTO target_author
    FROM app.moderation_cases mc
    JOIN app.drops d ON d.id = mc.drop_id
    LEFT JOIN app.comments c ON c.id = mc.comment_id
   WHERE mc.id = NEW.case_id;
  IF target_author = NEW.reporter_interval_id THEN
    RAISE EXCEPTION 'app.reports: nobody reports their own drop or comment (spec 22)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER reports_guard BEFORE INSERT ON app.reports
  FOR EACH ROW EXECUTE FUNCTION app.reports_guard();
CREATE TRIGGER reports_written_once BEFORE UPDATE ON app.reports
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a report is written once');

-- The one record of why a drop left the club (spec 32's distinct reason; T23 to T25): by its
-- author, by a member in the photograph, or by moderation. Who removed it as pictured is kept
-- here only, for the audit, and never served (T25).
CREATE TABLE app.drop_removals (
  drop_id app.id PRIMARY KEY REFERENCES app.drops,
  reason text NOT NULL CHECK (reason IN ('withdraw', 'leave', 'block', 'pictured', 'moderation', 'account_deletion')),
  -- The author, or the member in the photograph; none for moderation.
  actor_interval_id app.id,
  -- The operator's remove_drop action on this drop, one per removal (FQ27).
  operator_action_id app.id UNIQUE REFERENCES app.operator_actions,
  -- Server time under the day's lock (T3): before the reveal it frees the slot (T18).
  removed_at timestamptz NOT NULL,
  FOREIGN KEY (drop_id, actor_interval_id) REFERENCES app.drop_audience (drop_id, interval_id),
  CHECK ((reason = 'moderation') = (operator_action_id IS NOT NULL)),
  CHECK ((reason = 'moderation') = (actor_interval_id IS NULL))
);
ALTER TABLE app.drop_removals ENABLE ROW LEVEL SECURITY;
CREATE INDEX drop_removals_pictured_by ON app.drop_removals (actor_interval_id) WHERE reason = 'pictured';

CREATE FUNCTION app.drop_removals_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  d app.drops%ROWTYPE;
BEGIN
  SELECT * INTO d FROM app.drops WHERE id = NEW.drop_id;
  IF NEW.reason IN ('withdraw', 'leave', 'block', 'account_deletion') AND NEW.actor_interval_id <> d.author_interval_id THEN
    RAISE EXCEPTION 'app.drop_removals: only its author withdraws a drop (spec 22)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.reason = 'pictured' AND (NEW.actor_interval_id = d.author_interval_id OR d.media_class <> 'photo'
                                  OR NEW.removed_at < app.drop_reveal_at(d.id)) THEN
    RAISE EXCEPTION 'app.drop_removals: a member in a revealed photo, never its author, removes it as pictured (T25)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.reason = 'pictured' THEN
    PERFORM FROM app.memberships WHERE interval_id = NEW.actor_interval_id AND state = 'active' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'app.drop_removals: % is no longer a member, so removes nothing as pictured (T9, T25)',
        NEW.actor_interval_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  IF NEW.reason = 'moderation' AND NOT EXISTS (
       SELECT FROM app.operator_actions
        WHERE id = NEW.operator_action_id AND action = 'remove_drop' AND target_kind = 'drop'
          AND target_id = NEW.drop_id) THEN
    RAISE EXCEPTION 'app.drop_removals: a moderation removal cites the operator''s removal of this drop (FQ27)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER drop_removals_guard BEFORE INSERT ON app.drop_removals
  FOR EACH ROW EXECUTE FUNCTION app.drop_removals_guard();
CREATE TRIGGER drop_removals_written_once BEFORE UPDATE OR DELETE ON app.drop_removals
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a removal is audited and written once (T25)');
CREATE TRIGGER drop_removals_no_truncate BEFORE TRUNCATE ON app.drop_removals
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('a removal is audited and written once (T25)');

-- A drop is withdrawn or removed exactly when it has a removal, and its state says which: the
-- author's choices withdraw it, the others remove it.
CREATE FUNCTION app.drop_removal_matches() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  the_drop app.id;
  drop_state text;
  removal_reason text;
BEGIN
  IF TG_TABLE_NAME = 'drops' THEN
    the_drop := NEW.id;
  ELSE
    the_drop := NEW.drop_id;
  END IF;
  SELECT d.state, r.reason INTO drop_state, removal_reason
    FROM app.drops d LEFT JOIN app.drop_removals r ON r.drop_id = d.id
   WHERE d.id = the_drop;
  IF drop_state IS DISTINCT FROM (CASE
       WHEN removal_reason IN ('withdraw', 'leave', 'block') THEN 'withdrawn'
       WHEN removal_reason IN ('pictured', 'moderation', 'account_deletion') THEN 'removed'
       WHEN drop_state IN ('withdrawn', 'removed') THEN NULL
       ELSE drop_state END) THEN
    RAISE EXCEPTION 'app.drops: drop % is % with removal reason %', the_drop, drop_state, coalesce(removal_reason, 'none')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER drops_removal_matches AFTER UPDATE ON app.drops
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.state IS DISTINCT FROM OLD.state)
  EXECUTE FUNCTION app.drop_removal_matches();
CREATE CONSTRAINT TRIGGER drop_removals_match AFTER INSERT ON app.drop_removals
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.drop_removal_matches();

-- A block the caller made: it ended every club they shared, there is no unblock, and it lists
-- the blocked person under the name they had then (spec 22, D11, T26; FQ72, FQ75). The blocked
-- person is never told (spec 21).
CREATE TABLE app.blocks (
  id app.id PRIMARY KEY,
  blocker_user_id app.id NOT NULL REFERENCES app.users,
  blocked_user_id app.id NOT NULL REFERENCES app.users,
  -- The membership the block named.
  blocked_interval_id app.id NOT NULL,
  blocked_name app.name NOT NULL,
  created_at timestamptz NOT NULL,
  FOREIGN KEY (blocked_interval_id, blocked_user_id) REFERENCES app.memberships (interval_id, user_id),
  CHECK (blocker_user_id <> blocked_user_id)
);
ALTER TABLE app.blocks ENABLE ROW LEVEL SECURITY;
CREATE INDEX blocks_by_blocker ON app.blocks (blocker_user_id, created_at DESC, id);
CREATE INDEX blocks_by_blocked ON app.blocks (blocked_user_id);
CREATE TRIGGER blocks_written_once BEFORE UPDATE ON app.blocks
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a block never changes, and there is no unblock (D11)');

-- Every deletion of content, mirrored to the append-only log so that a restore replays them before
-- it serves anyone (T28, ADR-010). Ids, storage keys and codes only (T52), with no foreign key, so
-- no purge reaches it.
CREATE TABLE app.deletion_tombstones (
  id app.id PRIMARY KEY,
  object_kind text NOT NULL CHECK (object_kind IN ('account', 'drop', 'comment', 'upload', 'source', 'media_object')),
  -- An id, or a random storage key for a media object.
  object_id text NOT NULL CHECK (pg_catalog.char_length(object_id) <= 1024 AND object_id ~ '^[A-Za-z0-9_./-]+$'),
  reason text NOT NULL CHECK (reason IN (
    'withdraw', 'leave', 'block', 'pictured', 'moderation', 'account_deletion', 'comment_deleted', 'lapsed', 'replaced')),
  deleted_at timestamptz NOT NULL,
  mirrored_at timestamptz,
  -- A replayed deletion is recorded once.
  UNIQUE (object_kind, object_id)
);
ALTER TABLE app.deletion_tombstones ENABLE ROW LEVEL SECURITY;
CREATE INDEX deletion_tombstones_unmirrored ON app.deletion_tombstones (deleted_at) WHERE mirrored_at IS NULL;
CREATE TRIGGER deletion_tombstones_keep BEFORE UPDATE ON app.deletion_tombstones
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('id', 'object_kind', 'object_id', 'reason', 'deleted_at');
CREATE TRIGGER deletion_tombstones_once BEFORE UPDATE ON app.deletion_tombstones
  FOR EACH ROW EXECUTE FUNCTION app.set_once('mirrored_at');
CREATE TRIGGER deletion_tombstones_no_delete BEFORE DELETE ON app.deletion_tombstones
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a deletion is recorded for good (T28)');
CREATE TRIGGER deletion_tombstones_no_truncate BEFORE TRUNCATE ON app.deletion_tombstones
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('a deletion is recorded for good (T28)');
