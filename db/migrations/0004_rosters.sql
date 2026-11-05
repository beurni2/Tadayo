-- 0004: exact roster revisions, their approvals and acceptances, and the invitation links that
-- carry them (spec 31: RosterRevision and Approval; spec 04, 32; T7, T33; FQ54, FQ59, FQ60, FQ65,
-- FQ66, FQ71, FQ77, FQ84).
--
-- A person joins only by accepting an exact roster revision that every member of it has
-- approved (T7). So a revision's member list and candidate list are written once, in the
-- transaction that makes it, and sealed, as a drop's audience is (T8): nothing joins a roster
-- after people have approved or accepted it.

-- A person proposed for a club, kept across revisions (carried over, or renamed, FQ66) until
-- they join or the proposal ends. Only its proposer may make or revoke its link (handoff 1).
CREATE TABLE app.candidates (
  id app.id PRIMARY KEY,
  club_id app.id NOT NULL REFERENCES app.clubs,
  proposed_by_interval_id app.id NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'joined', 'ended')),
  created_at timestamptz NOT NULL,
  ended_at timestamptz,
  UNIQUE (id, club_id),
  FOREIGN KEY (proposed_by_interval_id, club_id) REFERENCES app.memberships (interval_id, club_id),
  CHECK ((state = 'open') = (ended_at IS NULL))
);
ALTER TABLE app.candidates ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER candidates_keep BEFORE UPDATE ON app.candidates
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('id', 'club_id', 'proposed_by_interval_id', 'created_at');
CREATE TRIGGER candidates_once BEFORE UPDATE ON app.candidates
  FOR EACH ROW EXECUTE FUNCTION app.set_once('ended_at');
CREATE TRIGGER candidates_no_delete BEFORE DELETE ON app.candidates
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a candidate is ended, never deleted');
CREATE INDEX candidates_by_proposer ON app.candidates (proposed_by_interval_id) WHERE state = 'open';

-- An exact proposed roster. At most one is open per club; a new proposal supersedes it.
CREATE TABLE app.roster_revisions (
  id app.id PRIMARY KEY,
  club_id app.id NOT NULL REFERENCES app.clubs,
  -- A member's proposal, or a revision the server made because the accepting account's profile
  -- name differs from the label it was invited under (FQ66, FQ84).
  origin text NOT NULL CHECK (origin IN ('proposal', 'rename')),
  proposed_by_interval_id app.id NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'applied', 'did_not_go_ahead', 'superseded')),
  -- Moves with the state and only with it, never on an approval or an acceptance (T33).
  version app.version NOT NULL DEFAULT 1 CHECK (version >= 1),
  superseded_by_id app.id,
  -- Set at the end of the transaction that wrote its members and candidates (T7).
  roster_sealed_at timestamptz,
  created_at timestamptz NOT NULL,
  ended_at timestamptz,
  UNIQUE (id, club_id),
  FOREIGN KEY (proposed_by_interval_id, club_id) REFERENCES app.memberships (interval_id, club_id),
  FOREIGN KEY (superseded_by_id, club_id) REFERENCES app.roster_revisions (id, club_id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK ((state = 'open') = (ended_at IS NULL)),
  CHECK ((state = 'superseded') = (superseded_by_id IS NOT NULL)),
  CHECK (superseded_by_id <> id)
);
ALTER TABLE app.roster_revisions ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX roster_revisions_one_open ON app.roster_revisions (club_id) WHERE state = 'open';

CREATE FUNCTION app.roster_revisions_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.state <> 'open' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'app.roster_revisions: an ended revision never changes (T7)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.version <> OLD.version + (CASE WHEN NEW.state = OLD.state THEN 0 ELSE 1 END) THEN
    RAISE EXCEPTION 'app.roster_revisions: a revision''s version moves by one with its state, and only then (T33)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER roster_revisions_keep BEFORE UPDATE ON app.roster_revisions
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('id', 'club_id', 'origin', 'proposed_by_interval_id', 'created_at');
CREATE TRIGGER roster_revisions_once BEFORE UPDATE ON app.roster_revisions
  FOR EACH ROW EXECUTE FUNCTION app.set_once('roster_sealed_at', 'ended_at', 'superseded_by_id');
CREATE TRIGGER roster_revisions_guard BEFORE UPDATE ON app.roster_revisions
  FOR EACH ROW EXECUTE FUNCTION app.roster_revisions_guard();
CREATE TRIGGER roster_revisions_no_delete BEFORE DELETE ON app.roster_revisions
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a revision is ended, never deleted (T7)');

-- The members a revision proposes the club to keep, as they were when it was made: the members
-- who approve it, and the names its candidates see. Names are read live, never copied.
CREATE TABLE app.roster_revision_members (
  revision_id app.id NOT NULL,
  club_id app.id NOT NULL,
  interval_id app.id NOT NULL,
  PRIMARY KEY (revision_id, interval_id),
  FOREIGN KEY (revision_id, club_id) REFERENCES app.roster_revisions (id, club_id),
  FOREIGN KEY (interval_id, club_id) REFERENCES app.memberships (interval_id, club_id)
);
ALTER TABLE app.roster_revision_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX roster_revision_members_by_interval ON app.roster_revision_members (interval_id);

-- An invitation link: one candidate's, single use, and kept only as the SHA-256 of its token,
-- which is 256 random bits and never stored (T7, FQ77). Its state (live, accepted, used,
-- revoked, expired) is read from these columns, never stored (FQ59, FQ71).
CREATE TABLE app.invitations (
  id app.id PRIMARY KEY,
  candidate_id app.id NOT NULL REFERENCES app.candidates,
  token_sha256 bytea NOT NULL UNIQUE CHECK (pg_catalog.octet_length(token_sha256) = 32),
  created_at timestamptz NOT NULL,
  -- Fixed when it's made (FQ71).
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  -- A newer link for the same candidate (FQ71, FQ77): this one then answers NOT_FOUND.
  replaced_by_id app.id,
  -- The first account to accept with it; every other account gets NOT_FOUND (T7).
  bound_user_id app.id REFERENCES app.users,
  bound_at timestamptz,
  UNIQUE (id, candidate_id),
  FOREIGN KEY (replaced_by_id, candidate_id) REFERENCES app.invitations (id, candidate_id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK (expires_at > created_at),
  CHECK ((bound_user_id IS NULL) = (bound_at IS NULL)),
  -- A link used to accept can't be revoked or replaced (handoff 4).
  CHECK (bound_user_id IS NULL OR (revoked_at IS NULL AND replaced_by_id IS NULL)),
  CHECK (replaced_by_id <> id)
);
ALTER TABLE app.invitations ENABLE ROW LEVEL SECURITY;
-- One latest link per candidate.
CREATE UNIQUE INDEX invitations_one_latest ON app.invitations (candidate_id) WHERE replaced_by_id IS NULL;
CREATE INDEX invitations_by_bound_user ON app.invitations (bound_user_id) WHERE bound_user_id IS NOT NULL;
CREATE TRIGGER invitations_keep BEFORE UPDATE ON app.invitations
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('id', 'candidate_id', 'token_sha256', 'created_at', 'expires_at');
CREATE TRIGGER invitations_once BEFORE UPDATE ON app.invitations
  FOR EACH ROW EXECUTE FUNCTION app.set_once('revoked_at', 'replaced_by_id', 'bound_user_id', 'bound_at');
CREATE TRIGGER invitations_no_delete BEFORE DELETE ON app.invitations
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a link is revoked or replaced, never deleted');

-- Each candidate on a revision, with the one name that revision shows (FQ66) and that
-- candidate's acceptance of this exact revision.
CREATE TABLE app.roster_revision_candidates (
  revision_id app.id NOT NULL,
  club_id app.id NOT NULL,
  candidate_id app.id NOT NULL,
  -- The proposer's label, or the accepting account's profile name in a revision the server made
  -- for it (FQ66, FQ84).
  label app.name NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 5),
  accepted_at timestamptz,
  accepted_invitation_id app.id,
  PRIMARY KEY (revision_id, candidate_id),
  UNIQUE (revision_id, position),
  FOREIGN KEY (revision_id, club_id) REFERENCES app.roster_revisions (id, club_id),
  FOREIGN KEY (candidate_id, club_id) REFERENCES app.candidates (id, club_id),
  -- Accepted with that candidate's own link.
  FOREIGN KEY (accepted_invitation_id, candidate_id) REFERENCES app.invitations (id, candidate_id),
  CHECK ((accepted_at IS NULL) = (accepted_invitation_id IS NULL))
);
ALTER TABLE app.roster_revision_candidates ENABLE ROW LEVEL SECURITY;
CREATE INDEX roster_revision_candidates_by_candidate ON app.roster_revision_candidates (candidate_id);
CREATE TRIGGER roster_revision_candidates_keep BEFORE UPDATE ON app.roster_revision_candidates
  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('revision_id', 'club_id', 'candidate_id', 'label', 'position');
CREATE TRIGGER roster_revision_candidates_once BEFORE UPDATE ON app.roster_revision_candidates
  FOR EACH ROW EXECUTE FUNCTION app.set_once('accepted_at', 'accepted_invitation_id');

-- Each member's own decision on a revision; no row means not yet. Nobody else's decision, and no
-- count, is ever served (T15, T33, book p30).
CREATE TABLE app.roster_approvals (
  revision_id app.id NOT NULL,
  interval_id app.id NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'declined')),
  -- The proposer's approval by proposing (FQ60; the creator's, FQ54), never in a revision the
  -- server made (FQ84).
  implicit boolean NOT NULL DEFAULT false,
  decided_at timestamptz NOT NULL,
  PRIMARY KEY (revision_id, interval_id),
  -- Only a member of the exact roster decides.
  FOREIGN KEY (revision_id, interval_id) REFERENCES app.roster_revision_members (revision_id, interval_id),
  CHECK (NOT (implicit AND decision = 'declined'))
);
ALTER TABLE app.roster_approvals ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER roster_approvals_written_once BEFORE UPDATE OR DELETE ON app.roster_approvals
  FOR EACH ROW EXECUTE FUNCTION app.refuse_change('a decision is made once');

-- The seal (T7). Members and candidates join a revision only in the transaction that makes it,
-- before it's sealed; an acceptance or approval counts only while it's open; and the
-- transaction that makes it seals it, with its proposer among its members and at least one
-- candidate, or doesn't commit.
CREATE FUNCTION app.roster_revision_rows_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  revision app.roster_revisions%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'app.%: a revision''s exact roster never changes (T7)', TG_TABLE_NAME
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT * INTO revision FROM app.roster_revisions WHERE id = NEW.revision_id FOR SHARE;
  IF TG_OP = 'INSERT' AND TG_TABLE_NAME <> 'roster_approvals' AND revision.roster_sealed_at IS NOT NULL THEN
    RAISE EXCEPTION 'app.%: revision % is sealed: its exact roster never changes (T7)', TG_TABLE_NAME, NEW.revision_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF revision.state <> 'open' AND (
       TG_TABLE_NAME = 'roster_approvals'
       OR (TG_TABLE_NAME = 'roster_revision_candidates' AND TG_OP = 'UPDATE')) THEN
    RAISE EXCEPTION 'app.%: revision % is no longer open (T7)', TG_TABLE_NAME, NEW.revision_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_TABLE_NAME = 'roster_approvals' AND revision.roster_sealed_at IS NULL THEN
    RAISE EXCEPTION 'app.roster_approvals: revision % isn''t sealed yet (T7)', NEW.revision_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER roster_revision_members_guard BEFORE INSERT OR UPDATE OR DELETE ON app.roster_revision_members
  FOR EACH ROW EXECUTE FUNCTION app.roster_revision_rows_guard();
CREATE TRIGGER roster_revision_candidates_guard BEFORE INSERT OR UPDATE OR DELETE ON app.roster_revision_candidates
  FOR EACH ROW EXECUTE FUNCTION app.roster_revision_rows_guard();
CREATE TRIGGER roster_approvals_guard BEFORE INSERT ON app.roster_approvals
  FOR EACH ROW EXECUTE FUNCTION app.roster_revision_rows_guard();
CREATE TRIGGER roster_revision_members_no_truncate BEFORE TRUNCATE ON app.roster_revision_members
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('a revision''s exact roster never changes (T7)');
CREATE TRIGGER roster_revision_candidates_no_truncate BEFORE TRUNCATE ON app.roster_revision_candidates
  FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change('a revision''s exact roster never changes (T7)');

CREATE FUNCTION app.roster_revisions_sealed() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  revision app.roster_revisions%ROWTYPE;
BEGIN
  SELECT * INTO revision FROM app.roster_revisions WHERE id = NEW.id;
  IF revision.roster_sealed_at IS NULL THEN
    RAISE EXCEPTION 'app.roster_revisions: revision % was made without being sealed (T7)', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NOT EXISTS (SELECT FROM app.roster_revision_members
                  WHERE revision_id = NEW.id AND interval_id = revision.proposed_by_interval_id) THEN
    RAISE EXCEPTION 'app.roster_revisions: revision %''s roster doesn''t hold its proposer (T7)', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NOT EXISTS (SELECT FROM app.roster_revision_candidates WHERE revision_id = NEW.id) THEN
    RAISE EXCEPTION 'app.roster_revisions: revision % adds nobody (T7)', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER roster_revisions_sealed AFTER INSERT ON app.roster_revisions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.roster_revisions_sealed();

-- A member who joined through a revision joined as one of its candidates.
ALTER TABLE app.memberships
  ADD CONSTRAINT memberships_joined_via FOREIGN KEY (joined_via_revision_id, joined_via_candidate_id)
  REFERENCES app.roster_revision_candidates (revision_id, candidate_id);

-- A candidate becomes a member only through the exact revision they accepted, with their own
-- link, once every member of that roster has approved it and it has been applied (T7).
CREATE FUNCTION app.memberships_join_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT FROM app.roster_revisions
                  WHERE id = NEW.joined_via_revision_id AND club_id = NEW.club_id AND state = 'applied')
     OR NOT EXISTS (SELECT FROM app.roster_revision_candidates rc
                      JOIN app.invitations i ON i.id = rc.accepted_invitation_id
                     WHERE rc.revision_id = NEW.joined_via_revision_id AND rc.candidate_id = NEW.joined_via_candidate_id
                       AND i.bound_user_id = NEW.user_id)
     OR EXISTS (SELECT FROM app.roster_revision_members m
                 WHERE m.revision_id = NEW.joined_via_revision_id
                   AND NOT EXISTS (SELECT FROM app.roster_approvals a
                                    WHERE a.revision_id = m.revision_id AND a.interval_id = m.interval_id
                                      AND a.decision = 'approved')) THEN
    RAISE EXCEPTION 'app.memberships: % joins only by an exact roster they accepted and every member approved (T7)',
      NEW.user_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER memberships_join_guard BEFORE INSERT ON app.memberships
  FOR EACH ROW WHEN (NEW.origin = 'roster')
  EXECUTE FUNCTION app.memberships_join_guard();
