# Breakage runs for the review fixes: each change disables one guard (or one clause of one);
# a test named for the rule must then fail. A change that stops a migration applying, or the
# runner loading, is reported as BROKEN, never as caught.
import os, re, shutil, subprocess, sys, json
REPO = "/home/user/tadayo-contract"
SCR = os.path.dirname(os.path.abspath(__file__))  # the folder holding these files
BACKUP = SCR + "/backup"
M = "db/migrations/"
R = "tools/ops/src/migrate.ts"
MUT = [
 # 0003
 ("T8 interval keeps its account", M+"0003_people_and_clubs.sql", "'interval_id', 'club_id', 'user_id', 'origin'", "'interval_id', 'club_id', 'origin'"),
 ("T8 interval keeps its club", M+"0003_people_and_clubs.sql", "'interval_id', 'club_id', 'user_id', 'origin'", "'interval_id', 'user_id', 'origin'"),
 ("T8 interval never deleted", M+"0003_people_and_clubs.sql", "CREATE TRIGGER memberships_no_delete BEFORE DELETE ON app.memberships\n  FOR EACH ROW EXECUTE", "CREATE TRIGGER memberships_no_delete BEFORE DELETE ON app.memberships\n  FOR EACH ROW WHEN (false) EXECUTE"),
 ("T27 deletion never goes back", M+"0003_people_and_clubs.sql", "  IF NOT (NEW.state = OLD.state\n", "  IF false AND NOT (NEW.state = OLD.state\n"),
 ("FQ13 age confirmation kept", M+"0003_people_and_clubs.sql", "  IF OLD.age_confirmed_at IS NOT NULL AND", "  IF false AND OLD.age_confirmed_at IS NOT NULL AND"),
 ("sign-in identity kept", M+"0003_people_and_clubs.sql", "  IF OLD.auth_subject IS DISTINCT FROM NEW.auth_subject", "  IF false AND OLD.auth_subject IS DISTINCT FROM NEW.auth_subject"),
 ("clubs truncate trigger gone", M+"0003_people_and_clubs.sql", "CREATE TRIGGER clubs_no_truncate BEFORE TRUNCATE ON app.clubs\n", "CREATE TRIGGER clubs_no_truncate BEFORE UPDATE ON app.clubs\n"),
 # 0004
 ("T7 seal: an active member left out", M+"0004_rosters.sql", "    IF EXISTS (SELECT FROM app.memberships m\n                WHERE m.club_id = NEW.club_id AND m.state = 'active'\n                  AND NOT EXISTS (SELECT FROM app.roster_revision_members r", "    IF false AND EXISTS (SELECT FROM app.memberships m\n                WHERE m.club_id = NEW.club_id AND m.state = 'active'\n                  AND NOT EXISTS (SELECT FROM app.roster_revision_members r"),
 ("T7 seal: a member who left listed", M+"0004_rosters.sql", "       OR EXISTS (SELECT FROM app.roster_revision_members r\n                    JOIN app.memberships m", "       OR false AND EXISTS (SELECT FROM app.roster_revision_members r\n                    JOIN app.memberships m"),
 ("T7 only an active member decides", M+"0004_rosters.sql", "    IF NOT FOUND THEN\n      RAISE EXCEPTION 'app.roster_approvals: % is no longer a member", "    IF false THEN\n      RAISE EXCEPTION 'app.roster_approvals: % is no longer a member"),
 ("FQ84 no implicit approval in a rename", M+"0004_rosters.sql", "IF NEW.implicit AND (revision.origin <> 'proposal' OR NEW.interval_id <> revision.proposed_by_interval_id) THEN", "IF NEW.implicit AND (NEW.interval_id <> revision.proposed_by_interval_id) THEN"),
 ("FQ60 implicit only for the proposer", M+"0004_rosters.sql", "IF NEW.implicit AND (revision.origin <> 'proposal' OR NEW.interval_id <> revision.proposed_by_interval_id) THEN", "IF NEW.implicit AND (revision.origin <> 'proposal') THEN"),
 ("T7 join: every current member approved", M+"0004_rosters.sql", "     OR EXISTS (SELECT FROM app.memberships m\n                 WHERE m.club_id = NEW.club_id AND m.state = 'active'", "     OR false AND EXISTS (SELECT FROM app.memberships m\n                 WHERE m.club_id = NEW.club_id AND m.state = 'active'"),
 ("FQ71 a link binds before it expires", M+"0004_rosters.sql", "CONSTRAINT invitations_bound_before_expiry CHECK (bound_at IS NULL OR bound_at < expires_at)", "CONSTRAINT invitations_bound_before_expiry CHECK (true)"),
 ("T7 a link binds one account", M+"0004_rosters.sql", "app.set_once('revoked_at', 'replaced_by_id', 'bound_user_id', 'bound_at')", "app.set_once('revoked_at', 'replaced_by_id', 'bound_at')"),
 ("T7 an acceptance names its link once", M+"0004_rosters.sql", "app.set_once('accepted_at', 'accepted_invitation_id')", "app.set_once('accepted_at')"),
 ("T7 no approval before the seal", M+"0004_rosters.sql", "  IF TG_TABLE_NAME = 'roster_approvals' AND revision.roster_sealed_at IS NULL THEN", "  IF false AND TG_TABLE_NAME = 'roster_approvals' AND revision.roster_sealed_at IS NULL THEN"),
 ("T7 a revision adds somebody", M+"0004_rosters.sql", "  IF NOT EXISTS (SELECT FROM app.roster_revision_candidates WHERE revision_id = NEW.id) THEN", "  IF false AND NOT EXISTS (SELECT FROM app.roster_revision_candidates WHERE revision_id = NEW.id) THEN"),
 ("T7 no member added once sealed", M+"0004_rosters.sql", "IF TG_OP = 'INSERT' AND TG_TABLE_NAME <> 'roster_approvals' AND revision.roster_sealed_at IS NOT NULL THEN", "IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'roster_revision_candidates' AND revision.roster_sealed_at IS NOT NULL THEN"),
 ("approvals truncate refused", M+"0004_rosters.sql", "CREATE TRIGGER roster_approvals_no_truncate BEFORE TRUNCATE ON app.roster_approvals\n  FOR EACH STATEMENT EXECUTE", "CREATE TRIGGER roster_approvals_no_truncate BEFORE TRUNCATE ON app.roster_approvals\n  FOR EACH STATEMENT WHEN (false) EXECUTE"),
 ("candidates truncate trigger gone", M+"0004_rosters.sql", "CREATE TRIGGER candidates_no_truncate BEFORE TRUNCATE ON app.candidates\n", "CREATE TRIGGER candidates_no_truncate BEFORE UPDATE ON app.candidates\n"),
 # 0005
 ("assignments truncate refused", M+"0005_schedules_and_days.sql", "CREATE TRIGGER schedule_assignments_no_truncate BEFORE TRUNCATE ON app.schedule_assignments\n  FOR EACH STATEMENT EXECUTE", "CREATE TRIGGER schedule_assignments_no_truncate BEFORE TRUNCATE ON app.schedule_assignments\n  FOR EACH STATEMENT WHEN (false) EXECUTE"),
 ("versions truncate trigger gone", M+"0005_schedules_and_days.sql", "CREATE TRIGGER schedule_versions_no_truncate BEFORE TRUNCATE ON app.schedule_versions\n", "CREATE TRIGGER schedule_versions_no_truncate BEFORE UPDATE ON app.schedule_versions\n"),
 ("a day keeps its week", M+"0005_schedules_and_days.sql", "'id', 'club_id', 'star_interval_id', 'schedule_version_id', 'local_date'", "'id', 'club_id', 'star_interval_id', 'local_date'"),
 ("a day keeps collecting_from", M+"0005_schedules_and_days.sql", "'reveal_at', 'close_at', 'collecting_from');", "'reveal_at', 'close_at');"),
 # 0006
 ("T12 upload into own slot", M+"0006_contributions.sql", "  IF (NEW.reservation_id IS NOT NULL\n", "  IF (false AND NEW.reservation_id IS NOT NULL\n"),
 ("T12 replacement by the author", M+"0006_contributions.sql", "     OR (NEW.replaces_drop_id IS NOT NULL\n         AND NOT EXISTS (SELECT FROM app.drops d", "     OR (false AND NEW.replaces_drop_id IS NOT NULL\n         AND NOT EXISTS (SELECT FROM app.drops d"),
 ("FQ74 avatar made as one", M+"0006_contributions.sql", "WHERE id = NEW.avatar_upload_id AND purpose = 'avatar' AND state = 'ready'", "WHERE id = NEW.avatar_upload_id AND state = 'ready'"),
 ("FQ74 avatar ready", M+"0006_contributions.sql", "WHERE id = NEW.avatar_upload_id AND purpose = 'avatar' AND state = 'ready'", "WHERE id = NEW.avatar_upload_id AND purpose = 'avatar'"),
 ("T12 drop photo is the author's (owner clause)", M+"0006_contributions.sql", "WHERE u.id = NEW.upload_id AND u.owner_user_id = author AND u.state = 'ready'", "WHERE u.id = NEW.upload_id AND u.state = 'ready'"),
 ("T12 drop photo is ready", M+"0006_contributions.sql", "WHERE u.id = NEW.upload_id AND u.owner_user_id = author AND u.state = 'ready'", "WHERE u.id = NEW.upload_id AND u.owner_user_id = author"),
 ("T12 drop photo for this slot or drop", M+"0006_contributions.sql", "          AND (u.replaces_drop_id = NEW.id\n", "          AND (true OR u.replaces_drop_id = NEW.id\n"),
 ("T40 link resolved by the author", M+"0006_contributions.sql", "WHERE id = NEW.source_id AND owner_user_id = author", "WHERE id = NEW.source_id"),
 ("T12 pending replacement is the author's", M+"0006_contributions.sql", "WHERE id = NEW.pending_upload_id AND owner_user_id = author", "WHERE id = NEW.pending_upload_id"),
 ("T3 every change carries its instant", M+"0006_contributions.sql", "    IF NEW.updated_at = OLD.updated_at\n", "    IF false AND NEW.updated_at = OLD.updated_at\n"),
 ("T19 an edit is a new version", M+"0006_contributions.sql", "    IF NEW.state IN ('active', 'held') AND NEW.version <> OLD.version + 1\n", "    IF false AND NEW.state IN ('active', 'held') AND NEW.version <> OLD.version + 1\n"),
 ("T19 version and time never go back", M+"0006_contributions.sql", "    IF NEW.version < OLD.version OR NEW.updated_at < OLD.updated_at THEN", "    IF false THEN"),
 ("T3 committed active", M+"0006_contributions.sql", "IF NEW.state <> 'active' OR NEW.version <> 1 OR NEW.submitted_at >= reveal THEN", "IF NEW.version <> 1 OR NEW.submitted_at >= reveal THEN"),
 ("T3 committed at version 1", M+"0006_contributions.sql", "IF NEW.state <> 'active' OR NEW.version <> 1 OR NEW.submitted_at >= reveal THEN", "IF NEW.state <> 'active' OR NEW.submitted_at >= reveal THEN"),
 ("T3 highlight cleared only with its drop's end", M+"0006_contributions.sql", "  IF TG_OP = 'UPDATE' AND OLD.drop_id IS NOT NULL AND NEW.drop_id IS NULL THEN", "  IF false AND TG_OP = 'UPDATE' AND OLD.drop_id IS NOT NULL AND NEW.drop_id IS NULL THEN"),
 ("highlights truncate refused", M+"0006_contributions.sql", "CREATE TRIGGER highlights_no_truncate BEFORE TRUNCATE ON app.highlights\n  FOR EACH STATEMENT EXECUTE", "CREATE TRIGGER highlights_no_truncate BEFORE TRUNCATE ON app.highlights\n  FOR EACH STATEMENT WHEN (false) EXECUTE"),
 ("audience truncate refused (own trigger)", M+"0006_contributions.sql", "CREATE TRIGGER drop_audience_no_truncate BEFORE TRUNCATE ON app.drop_audience\n  FOR EACH STATEMENT EXECUTE", "CREATE TRIGGER drop_audience_no_truncate BEFORE TRUNCATE ON app.drop_audience\n  FOR EACH STATEMENT WHEN (false) EXECUTE"),
 # 0007
 ("T24 nothing added to an inactive drop", M+"0007_after_the_reveal.sql", "    PERFORM FROM app.drops WHERE id = NEW.drop_id AND state = 'active' FOR SHARE;\n    IF NOT FOUND THEN", "    PERFORM FROM app.drops WHERE id = NEW.drop_id AND state = 'active' FOR SHARE;\n    IF false THEN"),
 ("T9 nothing added by someone who left", M+"0007_after_the_reveal.sql", "    PERFORM FROM app.memberships WHERE interval_id = writer AND state = 'active' FOR SHARE;\n    IF NOT FOUND THEN", "    PERFORM FROM app.memberships WHERE interval_id = writer AND state = 'active' FOR SHARE;\n    IF false THEN"),
 ("T9 a comment edit adds", M+"0007_after_the_reveal.sql", "    adds := TG_OP = 'INSERT' OR (NEW.state = 'active' AND NEW.body IS DISTINCT FROM OLD.body);", "    adds := TG_OP = 'INSERT';"),
 ("T9 clearing one's own reaction adds nothing", M+"0007_after_the_reveal.sql", "    adds := NEW.reaction IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.reaction IS DISTINCT FROM OLD.reaction);", "    adds := true;"),
 # 0008
 ("T9 pictured remover still a member", M+"0008_safety.sql", "  IF NEW.reason = 'pictured' THEN\n    PERFORM FROM app.memberships", "  IF false THEN\n    PERFORM FROM app.memberships"),
 ("FQ27 moderation cites a remove_drop", M+"0008_safety.sql", "WHERE id = NEW.operator_action_id AND action = 'remove_drop' AND target_kind = 'drop'", "WHERE id = NEW.operator_action_id AND target_kind = 'drop'"),
 ("FQ27 moderation cites this drop", M+"0008_safety.sql", "          AND target_id = NEW.drop_id) THEN", "          ) THEN"),
 ("moderation_cases truncate trigger gone", M+"0008_safety.sql", "CREATE TRIGGER moderation_cases_no_truncate BEFORE TRUNCATE ON app.moderation_cases\n", "CREATE TRIGGER moderation_cases_no_truncate BEFORE UPDATE ON app.moderation_cases\n"),
 # 0009
 ("T52 keys in any case", M+"0009_platform.sql", '"caption|text|body|note|url|href|link|token|preview|message|secret|signed" flag "i"', '"caption|text|body|note|url|href|link|token|preview|message|secret|signed"'),
 ("T52 a link under any key", M+"0009_platform.sql", "         ? (@.value.type() == \"string\" && @.value like_regex \"://\"", "         ? (@.value.type() == \"string\" && @.value like_regex \"^:///$\""),
 ("T52 a link in a list", M+"0009_platform.sql", "'strict $.** ? (@.type() == \"array\")[*] ? (@.type() == \"string\" && @ like_regex \"://\")'", "'strict $.** ? (@.type() == \"array\")[*] ? (@.type() == \"string\" && @ like_regex \"^:///$\")'"),
 ("T52 a flag is no content", M+"0009_platform.sql", "            && (@.value.type() == \"string\" || @.value.type() == \"object\" || @.value.type() == \"array\"))')", "            && true)')"),
 ("T52 a name may hold anything", M+"0009_platform.sql", "            && !(@.key like_regex \"^(display_name|name|club_name|inviter_name|label)$\"))')", "            && true)')"),
 ("T27 no receipt for a deleted account", M+"0009_platform.sql", "  PERFORM FROM app.users WHERE id = NEW.actor_user_id AND state <> 'deleted' FOR KEY SHARE;\n  IF NOT FOUND THEN", "  PERFORM FROM app.users WHERE id = NEW.actor_user_id AND state <> 'deleted' FOR KEY SHARE;\n  IF false THEN"),
 ("T27 receipts deleted with the account", M+"0009_platform.sql", "  IF EXISTS (SELECT FROM app.idempotency_receipts WHERE actor_user_id = NEW.id) THEN", "  IF false AND EXISTS (SELECT FROM app.idempotency_receipts WHERE actor_user_id = NEW.id) THEN"),
 # the runner
 ("T53 runner refuses COMMIT", R, '["BEGIN", "COMMIT", "END",', '["BEGIN", "END",'),
 ("T53 runner skips dollar-quoted bodies", R, '} else if (c === "$" && !word.test(text[i - 1] ?? "")) {', '} else if (false) {'),
 ("T53 runner refuses BEGIN in a file", R, '    if (control) {\n      throw new Error(', '    if (false) {\n      throw new Error('),
 ("T53 runner's transaction backstop", R, "  if (!before || after?.xid !== before.xid) {", "  if (false) {"),
 ("T53 check reads column grants", R, "     WHERE att.attrelid = relations.oid AND att.attnum > 0 AND NOT att.attisdropped", "     WHERE att.attrelid = relations.oid AND att.attnum > 1000 AND NOT att.attisdropped"),
 ("T53 check reads type grants", R, "     WHERE a.grantee NOT IN (types.typowner, app.nspowner)", "     WHERE a.grantee NOT IN (types.typowner, app.nspowner) AND false"),
 ("T53 check reads type owners", R, "      FROM types, app WHERE typowner <> app.nspowner", "      FROM types, app WHERE typowner <> app.nspowner AND false"),
 ("T53 check reads default privileges", R, "       AND a.grantee <> d.defaclrole", "       AND a.grantee <> d.defaclrole AND false"),
]
FILES = sorted({f for _, f, _, _ in MUT})
shutil.rmtree(BACKUP, ignore_errors=True)
os.makedirs(BACKUP)
for f in FILES:
    shutil.copy(os.path.join(REPO, f), os.path.join(BACKUP, f.replace("/", "__")))
def restore():
    for f in FILES:
        shutil.copy(os.path.join(BACKUP, f.replace("/", "__")), os.path.join(REPO, f))
env = {**os.environ, "PATH": "/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"]}
results = []
only = sys.argv[1:]
try:
    for name, f, old, new in MUT:
        if only and not any(o in name for o in only):
            continue
        restore()
        p = os.path.join(REPO, f)
        s = open(p).read()
        n = s.count(old)
        if n != 1:
            results.append({"name": name, "file": f, "verdict": f"BAD MUTATION ({n} matches)", "failed": []}); print(results[-1], flush=True)
            continue
        open(p, "w").write(s.replace(old, new))
        out = ""
        if f == R:
            u = subprocess.run(["pnpm", "--filter", "@tadayo/ops", "exec", "vitest", "run"], cwd=REPO, env=env, capture_output=True, text=True)
            out += u.stdout + u.stderr
        r = subprocess.run(["bash", SCR + "/dbtest.sh"], env={**env, "FRESH": "1"}, capture_output=True, text=True)
        out += r.stdout + r.stderr
        failed = sorted(set(re.findall(r"^\s*FAIL\s+(?:src/\S+|\S+\.test\.ts)\s+>\s+(.*)$", out, re.M)))
        startup = "Startup Error" in out or "No test files found" in out
        verdict = "CAUGHT" if failed else ("BROKEN" if startup else "MISSED")
        results.append({"name": name, "file": f, "verdict": verdict, "failed": failed}); print(json.dumps(results[-1]), flush=True)
finally:
    restore()
json.dump(results, open(SCR + "/run3-results.json", "w"), indent=1)
print("\n==== SUMMARY")
for r in results:
    print(f"{r['verdict']:8} {r['name']}: {'; '.join(r['failed'])[:240]}")
