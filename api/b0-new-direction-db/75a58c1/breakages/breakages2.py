"""Deliberate breakages of migrations 0010 and 0011, one line each, in the scratch worktree.

For each: change the line, remake the local cluster, bootstrap it, run the named test file (whose
global setup migrates every file), and check that the pre-registered test fails. Restores the file
after each. Run with run_in_background; nothing else may use the local database meanwhile.
"""

import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path("<scratch worktree>")
SP = "$SCRATCH"
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
M10 = "db/migrations/0010_allowance_by_role.sql"
M11 = "db/migrations/0011_photo_messages.sql"
DROPS = "src/db/drops.test.ts"
MIG = "src/db/migrations.test.ts"
PHOTO = "src/db/photo-messages.test.ts"
KEPT = "src/db/kept.test.ts"

# (name, file, old, new, test file, pre-registered prefix of the test that must fail)
B = [
    ("B01 0010's check of existing rows lets one through", M10,
     "  IF over > 0 THEN", "  IF over > 1 THEN", MIG,
     "fills the star's limits and a friend's from the rows' intervals"),
    ("B02 0010's fill gives a friend the star's photos", M10,
     "       photo_limit = CASE WHEN c.interval_id = o.star_interval_id THEN 6 ELSE 2 END,",
     "       photo_limit = CASE WHEN c.interval_id = o.star_interval_id THEN 6 ELSE 6 END,", MIG,
     "fills the star's limits and a friend's from the rows' intervals"),
    ("B03 everyone is the star", M10,
     "  SELECT NEW.interval_id = o.star_interval_id INTO star FROM app.occurrences o WHERE o.id = NEW.occurrence_id;",
     "  SELECT true INTO star FROM app.occurrences o WHERE o.id = NEW.occurrence_id;", DROPS,
     "writes each counter's limits from its holder's role in that day"),
    ("B04 nobody is the star", M10,
     "  SELECT NEW.interval_id = o.star_interval_id INTO star FROM app.occurrences o WHERE o.id = NEW.occurrence_id;",
     "  SELECT false INTO star FROM app.occurrences o WHERE o.id = NEW.occurrence_id;", DROPS,
     "writes each counter's limits from its holder's role in that day"),
    ("B05 a caller may name the limits", M10,
     "  IF NEW.total_limit IS NOT NULL OR NEW.photo_limit IS NOT NULL OR NEW.external_limit IS NOT NULL THEN",
     "  IF false THEN", DROPS,
     "refuses a counter that names its own limits, and any change to them"),
    ("B06 the limits may change", M10,
     "CREATE TRIGGER contribution_counters_keep_limits BEFORE UPDATE ON app.contribution_counters",
     "CREATE TRIGGER contribution_counters_keep_limits BEFORE DELETE ON app.contribution_counters", DROPS,
     "refuses a counter that names its own limits, and any change to them"),
    ("B07 reserved photo slots uncounted", M10,
     "    CHECK ((committed_total - committed_external) + (reserved_total - reserved_external) <= photo_limit),",
     "    CHECK ((committed_total - committed_external) <= photo_limit),", DROPS,
     "refuses a friend's third photo, second link, or a photo slot beyond two photos"),
    ("B08 a link more", M10,
     "    CHECK (committed_external + reserved_external <= external_limit);",
     "    CHECK (committed_external + reserved_external <= external_limit + 1);", DROPS,
     "refuses a friend's third photo, second link, or a photo slot beyond two photos"),
    ("B09 a drop more (expected equivalent: photos and links bound the total)", M10,
     "    CHECK (committed_total + reserved_total <= total_limit),",
     "    CHECK (committed_total + reserved_total <= total_limit + 1),", DROPS,
     "refuses a friend's third photo, second link, or a photo slot beyond two photos"),
    ("B10 a friend's set may be the star's photos", M10,
     "    OR (total_limit = 3 AND photo_limit = 2 AND external_limit = 1)),",
     "    OR (total_limit = 3 AND photo_limit = 2 AND external_limit = 1) OR photo_limit = 6),", DROPS,
     "refuses limits outside the two roles' sets with the trigger off"),
    ("B11 an avatar may name a drop", M11,
     "  ADD CONSTRAINT uploads_conversation_drop CHECK ((purpose = 'conversation_photo') = (conversation_drop_id IS NOT NULL)),",
     "  ADD CONSTRAINT uploads_conversation_drop CHECK (purpose <> 'conversation_photo' OR conversation_drop_id IS NOT NULL),",
     PHOTO, "never changes the drop it's for, and can't become a drop's photo"),
    ("B12 the drop may change", M11,
     "  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('conversation_drop_id');",
     "  FOR EACH ROW EXECUTE FUNCTION app.keep_columns('id');", PHOTO,
     "never changes the drop it's for, and can't become a drop's photo"),
    ("B13 a former member may upload", M11,
     "    WHERE a.drop_id = NEW.conversation_drop_id AND m.user_id = NEW.owner_user_id AND m.state = 'active'",
     "    WHERE a.drop_id = NEW.conversation_drop_id AND m.user_id = NEW.owner_user_id", PHOTO,
     "is refused before the reveal, outside the audience, to a former member"),
    ("B14 anyone may upload", M11,
     "    WHERE a.drop_id = NEW.conversation_drop_id AND m.user_id = NEW.owner_user_id AND m.state = 'active'",
     "    WHERE a.drop_id = NEW.conversation_drop_id AND m.state = 'active'", PHOTO,
     "is refused before the reveal, outside the audience, to a former member"),
    ("B15 a held drop takes a photo", M11,
     "  PERFORM FROM app.drops WHERE id = NEW.conversation_drop_id AND state = 'active' FOR SHARE;",
     "  PERFORM FROM app.drops WHERE id = NEW.conversation_drop_id AND state IN ('active', 'held') FOR SHARE;", PHOTO,
     "is refused before the reveal, outside the audience, to a former member"),
    ("B16 before the reveal", M11,
     "  IF NEW.created_at < app.drop_reveal_at(NEW.conversation_drop_id) THEN",
     "  IF NEW.created_at < app.drop_reveal_at(NEW.conversation_drop_id) - interval '1 day' THEN", PHOTO,
     "is refused before the reveal, outside the audience, to a former member"),
    ("B17 not at the reveal itself", M11,
     "  IF NEW.created_at < app.drop_reveal_at(NEW.conversation_drop_id) THEN",
     "  IF NEW.created_at <= app.drop_reveal_at(NEW.conversation_drop_id) THEN", PHOTO,
     "is made by the star, a friend or the drop's author, from its reveal on"),
    ("B18 a drop's photo has a thumbnail", M11,
     "  IF NOT EXISTS (SELECT FROM app.uploads WHERE id = NEW.upload_id AND purpose = 'conversation_photo') THEN",
     "  IF NOT EXISTS (SELECT FROM app.uploads WHERE id = NEW.upload_id AND purpose IN ('conversation_photo', 'drop_photo')) THEN",
     PHOTO, "has a thumbnail for the feed's reply preview"),
    ("B19 a rendition kind outside the contract", M11,
     "  ADD CONSTRAINT upload_renditions_kind_check CHECK (kind IN ('display', 'full', 'thumbnail'));",
     "  ADD CONSTRAINT upload_renditions_kind_check CHECK (kind IN ('display', 'full', 'thumbnail', 'preview'));", PHOTO,
     "lists exactly the contract's upload purposes and renditions"),
    ("B20 a photo for two messages", M11,
     "  ADD CONSTRAINT comments_one_message_per_photo UNIQUE (photo_upload_id),",
     "  ADD CONSTRAINT comments_one_message_per_photo UNIQUE (photo_upload_id, id),", PHOTO,
     "takes only its author's own ready upload, not lapsed, made for its drop"),
    ("B21 another drop's photo", M11,
     "    FOREIGN KEY (photo_upload_id, drop_id) REFERENCES app.uploads (id, conversation_drop_id),",
     "    FOREIGN KEY (photo_upload_id) REFERENCES app.uploads (id),", PHOTO,
     "takes only its author's own ready upload, not lapsed, made for its drop"),
    ("B22 an edit empties a text message", M11,
     "  ADD CONSTRAINT comments_active_has_content CHECK (state <> 'active' OR body IS NOT NULL OR photo_upload_id IS NOT NULL),",
     "  ADD CONSTRAINT comments_active_has_content CHECK (state <> 'active' OR body IS NOT NULL OR photo_upload_id IS NOT NULL OR version > 1),",
     PHOTO, "never adds, replaces or clears a standing message's photo"),
    ("B23 an ended message keeps its photo", M11,
     "  ADD CONSTRAINT comments_ended_empty CHECK (state = 'active' OR (body IS NULL AND photo_upload_id IS NULL));",
     "  ADD CONSTRAINT comments_ended_empty CHECK (state = 'active' OR body IS NULL);", PHOTO,
     "keeps neither text nor photo once a message ends"),
    ("B24 the preview's index on every message", M11,
     "  WHERE state = 'active' AND photo_upload_id IS NOT NULL;",
     "  WHERE state = 'active';", PHOTO,
     "indexes each drop's standing photo messages, latest first"),
    ("B25 a message starts at a later version", M11,
     "  IF NEW.state <> 'active' OR NEW.version <> 1 OR NEW.updated_at <> NEW.created_at THEN",
     "  IF NEW.state <> 'active' OR NEW.updated_at <> NEW.created_at THEN", PHOTO,
     "starts every message active, at its first version"),
    ("B26 a message dated before the reveal", M11,
     "  IF NEW.state <> 'active' OR NEW.version <> 1 OR NEW.updated_at <> NEW.created_at THEN",
     "  IF NEW.state <> 'active' OR NEW.version <> 1 THEN", PHOTO,
     "refuses a message with neither, one before the reveal, and one dated before it"),
    ("B27 a message starts ended", M11,
     "  IF NEW.state <> 'active' OR NEW.version <> 1 OR NEW.updated_at <> NEW.created_at THEN",
     "  IF NEW.version <> 1 OR NEW.updated_at <> NEW.created_at THEN", PHOTO,
     "starts every message active, at its first version"),
    ("B28 a photo added to a text message", M11,
     "    IF NEW.photo_upload_id IS NOT NULL AND NEW.photo_upload_id IS DISTINCT FROM OLD.photo_upload_id THEN",
     "    IF NEW.photo_upload_id IS NOT NULL AND OLD.photo_upload_id IS NOT NULL AND NEW.photo_upload_id IS DISTINCT FROM OLD.photo_upload_id THEN",
     PHOTO, "never adds, replaces or clears a standing message's photo"),
    ("B29 a photo replaced", M11,
     "    IF NEW.photo_upload_id IS NOT NULL AND NEW.photo_upload_id IS DISTINCT FROM OLD.photo_upload_id THEN",
     "    IF NEW.photo_upload_id IS NOT NULL AND OLD.photo_upload_id IS NULL THEN",
     PHOTO, "never adds, replaces or clears a standing message's photo"),
    ("B30 a photo cleared from a standing message", M11,
     "    IF OLD.photo_upload_id IS NOT NULL AND NEW.photo_upload_id IS NULL AND NEW.state = 'active' THEN",
     "    IF false THEN", PHOTO,
     "never adds, replaces or clears a standing message's photo"),
    ("B31 an upload still being prepared", M11,
     "    WHERE u.id = NEW.photo_upload_id AND u.state = 'ready' AND u.expires_at > NEW.created_at",
     "    WHERE u.id = NEW.photo_upload_id AND u.state IN ('ready', 'preparing') AND u.expires_at > NEW.created_at", PHOTO,
     "takes only its author's own ready upload, not lapsed, made for its drop"),
    ("B32 a lapsed upload", M11,
     "    WHERE u.id = NEW.photo_upload_id AND u.state = 'ready' AND u.expires_at > NEW.created_at",
     "    WHERE u.id = NEW.photo_upload_id AND u.state = 'ready'", PHOTO,
     "takes only its author's own ready upload, not lapsed, made for its drop"),
    ("B33 someone else's upload", M11,
     "      AND u.owner_user_id = (SELECT m.user_id FROM app.memberships m WHERE m.interval_id = NEW.author_interval_id)",
     "      AND true", PHOTO,
     "takes only its author's own ready upload, not lapsed, made for its drop"),
    ("B34 a removal of a message already ended", M11,
     "  IF c.state <> 'active' THEN", "  IF false THEN", PHOTO,
     "refuses a removal of a message that has ended"),
    ("B35 its author removes it as pictured", M11,
     "  IF NEW.reason = 'pictured' AND (NEW.actor_interval_id = c.author_interval_id OR c.photo_upload_id IS NULL) THEN",
     "  IF NEW.reason = 'pictured' AND c.photo_upload_id IS NULL THEN", PHOTO,
     "refuses a pictured removal by its author, of a message with no photo"),
    ("B36 a text message removed as pictured", M11,
     "  IF NEW.reason = 'pictured' AND (NEW.actor_interval_id = c.author_interval_id OR c.photo_upload_id IS NULL) THEN",
     "  IF NEW.reason = 'pictured' AND NEW.actor_interval_id = c.author_interval_id THEN", PHOTO,
     "refuses a pictured removal by its author, of a message with no photo"),
    ("B37 a former member removes as pictured", M11,
     "    PERFORM FROM app.memberships WHERE interval_id = NEW.actor_interval_id AND state = 'active' FOR SHARE;",
     "    PERFORM FROM app.memberships WHERE interval_id = NEW.actor_interval_id FOR SHARE;", PHOTO,
     "refuses a pictured removal by its author, of a message with no photo"),
    ("B38 an operator's action about another message", M11,
     "          AND target_id = NEW.comment_id) THEN", "          ) THEN", PHOTO,
     "refuses a removal of a message that has ended"),
    ("B39 a moderation removal with no action at all", M11,
     "  IF NEW.reason = 'moderation' AND NOT EXISTS (", "  IF NEW.reason = 'none' AND NOT EXISTS (", PHOTO,
     "refuses a pictured removal by its author, of a message with no photo"),
    ("B40 a standing drop takes its conversation", M11,
     "       SELECT FROM app.drops WHERE id = NEW.drop_id AND state IN ('withdrawn', 'removed')) THEN",
     "       SELECT FROM app.drops WHERE id = NEW.drop_id AND state IN ('withdrawn', 'removed', 'active')) THEN", PHOTO,
     "refuses a pictured removal by its author, of a message with no photo"),
    ("B41 someone outside the drop's audience removes as pictured", M11,
     "  FOREIGN KEY (drop_id, actor_interval_id) REFERENCES app.drop_audience (drop_id, interval_id),",
     "  FOREIGN KEY (actor_interval_id) REFERENCES app.memberships (interval_id),", PHOTO,
     "refuses a removal of a message that has ended"),
    ("B42 an actor on another reason", M11,
     "  CONSTRAINT comment_removals_pictured_actor CHECK ((reason = 'pictured') = (actor_interval_id IS NOT NULL)),",
     "  CONSTRAINT comment_removals_pictured_actor CHECK (reason <> 'pictured' OR actor_interval_id IS NOT NULL),", PHOTO,
     "refuses a removal of a message that has ended"),
    ("B43 an action on another reason", M11,
     "  CONSTRAINT comment_removals_moderation_action CHECK ((reason = 'moderation') = (operator_action_id IS NOT NULL))",
     "  CONSTRAINT comment_removals_moderation_action CHECK (reason <> 'moderation' OR operator_action_id IS NOT NULL)", PHOTO,
     "refuses a removal of a message that has ended"),
    ("B44 a removal deleted", M11,
     "CREATE TRIGGER comment_removals_written_once BEFORE UPDATE OR DELETE ON app.comment_removals",
     "CREATE TRIGGER comment_removals_written_once BEFORE UPDATE ON app.comment_removals", PHOTO,
     "writes a removal once, never changed or deleted"),
    ("B45 a removal truncated", M11,
     "CREATE TRIGGER comment_removals_no_truncate BEFORE TRUNCATE ON app.comment_removals",
     "CREATE TRIGGER comment_removals_no_truncate BEFORE TRUNCATE ON app.deletion_tombstones", KEPT,
     "gives every table that refuses a DELETE a trigger that refuses TRUNCATE"),
    ("B46 a record whose message stands", M11,
     "  IF (comment_state = 'removed') IS DISTINCT FROM has_removal THEN",
     "  IF comment_state = 'removed' AND NOT has_removal THEN", PHOTO,
     "refuses at commit a removed message without its record, and a record whose message"),
    ("B47 a removed message with no record", M11,
     "  IF (comment_state = 'removed') IS DISTINCT FROM has_removal THEN",
     "  IF comment_state <> 'removed' AND has_removal THEN", PHOTO,
     "refuses at commit a removed message without its record, and a record whose message"),
]
B += [
    ("B48 an upload for any drop whose audience holds its owner", M11,
     "    WHERE a.drop_id = NEW.conversation_drop_id AND m.user_id = NEW.owner_user_id AND m.state = 'active'",
     "    WHERE m.user_id = NEW.owner_user_id AND m.state = 'active'", PHOTO,
     "is refused before the reveal, outside the audience, to a former member"),
    ("B49 a removal citing another drop", M11,
     "  FOREIGN KEY (comment_id, drop_id) REFERENCES app.comments (id, drop_id),",
     "  FOREIGN KEY (comment_id) REFERENCES app.comments (id),", PHOTO,
     "refuses a removal of a message that has ended"),
    ("B50 a friend's reserved link uncounted", M10,
     "    CHECK (committed_external + reserved_external <= external_limit);",
     "    CHECK (committed_external <= external_limit);", DROPS,
     "refuses a friend's third photo, second link, or a photo slot beyond two photos"),
    ("B51 a record for a message nobody ends", M11,
     "CREATE CONSTRAINT TRIGGER comment_removals_match AFTER INSERT ON app.comment_removals",
     "CREATE CONSTRAINT TRIGGER comment_removals_match AFTER UPDATE ON app.comment_removals", PHOTO,
     "refuses at commit a removed message without its record, and a record whose message"),
    ("B52 a moderation removal citing any action on the message", M11,
     "        WHERE id = NEW.operator_action_id AND action = 'remove_comment' AND target_kind = 'comment'",
     "        WHERE id = NEW.operator_action_id AND target_kind = 'comment'", PHOTO,
     "refuses a removal of a message that has ended"),
    ("B53 a moderation removal citing any kind of target", M11,
     "        WHERE id = NEW.operator_action_id AND action = 'remove_comment' AND target_kind = 'comment'",
     "        WHERE id = NEW.operator_action_id AND action = 'remove_comment'", PHOTO,
     "refuses a removal of a message that has ended"),
    ("B54 a reason outside the list", M11,
     "  reason text NOT NULL CHECK (reason IN ('pictured', 'moderation', 'drop_ended')),",
     "  reason text NOT NULL CHECK (reason IN ('pictured', 'moderation', 'drop_ended', 'withdraw')),", PHOTO,
     "refuses a removal of a message that has ended"),
    ("B55 0010 counts the star's rows against a friend's allowance", M10,
     "   WHERE c.interval_id <> o.star_interval_id",
     "   WHERE true", MIG,
     "fills the star's limits and a friend's from the rows' intervals"),
    ("B56 a used upload taken again", M11,
     "u.expires_at > NEW.created_at AND u.used_at IS NULL",
     "u.expires_at > NEW.created_at", PHOTO,
     "never lets a used upload back into a message"),
    ("B57 the commit leaves the upload unused", M11,
     "  UPDATE app.uploads SET used_at = NEW.created_at WHERE id = NEW.photo_upload_id;",
     "  NULL;", PHOTO,
     "never lets a used upload back into a message"),
    ("B58 the used mark cleared", M11,
     "  FOR EACH ROW EXECUTE FUNCTION app.set_once('used_at');",
     "  FOR EACH ROW EXECUTE FUNCTION app.set_once('expires_at');", PHOTO,
     "takes only its author's own ready upload, not lapsed, made for its drop"),
    ("B59 a message deleted", M11,
     "CREATE TRIGGER comments_no_delete BEFORE DELETE ON app.comments",
     "CREATE TRIGGER comments_no_delete BEFORE UPDATE OF id ON app.comments", PHOTO,
     "is ended in place and never deleted"),
    ("B60 a message truncated", M11,
     "CREATE TRIGGER comments_no_truncate BEFORE TRUNCATE ON app.comments",
     "CREATE TRIGGER comments_no_truncate BEFORE TRUNCATE ON app.deletion_tombstones", KEPT,
     "gives every table that refuses a DELETE a trigger that refuses TRUNCATE"),
]


def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True)


def main():
    only = sys.argv[1:]
    for name, path, old, new, test, prefix in B:
        if only and name.split()[0] not in only:
            continue
        p = ROOT / path
        orig = p.read_text()
        assert orig.count(old) == 1, (name, orig.count(old))
        try:
            p.write_text(orig.replace(old, new))
            r = run(["bash", f"{SP}/s4/pgci.sh"])
            if r.returncode != 0:
                print(f"== {name}: cluster failed", r.stderr[-300:], flush=True)
                continue
            r = run(["python3", "tools/ci/ci_steps.py", "db-bootstrap"])
            if r.returncode != 0:
                print(f"== {name}: bootstrap failed", flush=True)
                continue
            r = run(["npx", "vitest", "run", "--config", "vitest.db.config.ts", test], cwd=ROOT / "tests")
            out = r.stdout + r.stderr
            failed = sorted({l.strip()[2:].strip()[:150] for l in out.splitlines() if l.strip().startswith("×")})
            summary = [l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")]
            setup = "migrate:" in out and "failed" in out and not summary
            caught = any(f.startswith(prefix[:110]) for f in failed)
            verdict = "CAUGHT" if caught else ("SETUP-FAILED" if setup else "NOT CAUGHT")
            print(f"== {name}: {verdict}; exit {r.returncode} {summary}", flush=True)
            for f in failed:
                print("    ×", f, flush=True)
            if not summary:
                print("   ", out[-600:].replace("\n", "\n    "), flush=True)
        finally:
            p.write_text(orig)
    print("restored:", run(["git", "status", "--short"]).stdout, flush=True)


if __name__ == "__main__":
    main()
