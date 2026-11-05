# Breakage runs: each mutation disables one guard; a db test must then fail.
import os, re, shutil, subprocess, sys
ROOT = "/home/user/tadayo-contract/db/migrations"
SCR = "/tmp/claude-0/-home-user-Tadayo/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/s4"
BACKUP = SCR + "/mut/backup"
MUTATIONS = [
 ("T8 late audience row", "0006_contributions.sql", "  IF sealed_at IS NOT NULL THEN", "  IF false THEN"),
 ("T8 audience leaves out a member", "0006_contributions.sql", "  IF EXISTS (SELECT FROM app.memberships m\n", "  IF false AND EXISTS (SELECT FROM app.memberships m\n"),
 ("T8 audience of ended member", "0006_contributions.sql", "  PERFORM FROM app.memberships WHERE interval_id = NEW.interval_id AND state = 'active' FOR SHARE;", "  PERFORM FROM app.memberships WHERE interval_id = NEW.interval_id FOR SHARE;"),
 ("T3 commit after reveal", "0006_contributions.sql", "OR NEW.submitted_at >= reveal THEN", "THEN"),
 ("T3 frozen content", "0006_contributions.sql", "  IF NEW.state IN ('active', 'held') AND NEW.updated_at >= reveal\n", "  IF false AND NEW.state IN ('active', 'held') AND NEW.updated_at >= reveal\n"),
 ("T29 held never late", "0006_contributions.sql", "  IF OLD.state = 'held' AND NEW.state = 'active' AND NEW.updated_at >= reveal THEN", "  IF false THEN"),
 ("T24 ended drop only loses content", "0006_contributions.sql", "  IF OLD.state IN ('withdrawn', 'removed') THEN\n    IF", "  IF OLD.state IN ('withdrawn', 'removed') THEN\n    IF false AND"),
 ("T22 highlight active, before reveal", "0006_contributions.sql", "    IF drop_state <> 'active' OR NEW.updated_at >= app.drop_reveal_at(NEW.drop_id) THEN", "    IF false THEN"),
 ("T22 removal clears highlight", "0006_contributions.sql", "  IF EXISTS (SELECT FROM app.highlights WHERE drop_id = NEW.id) THEN", "  IF false THEN"),
 ("T22 highlight version", "0006_contributions.sql", "    IF NEW.version <> OLD.version + 1 THEN", "    IF false THEN"),
 ("T17 six", "0006_contributions.sql", "  CHECK (committed_total + reserved_total <= 6),", "  CHECK (committed_total + reserved_total <= 7),"),
 ("T18 reservation past reveal", "0006_contributions.sql", " OR NEW.expires_at > reveal THEN", " THEN"),
 ("T21 duplicate", "0006_contributions.sql", "CREATE UNIQUE INDEX drops_no_duplicate ON app.drops (occurrence_id, author_interval_id, dedupe_key)", "CREATE UNIQUE INDEX drops_no_duplicate ON app.drops (occurrence_id, author_interval_id, dedupe_key, id)"),
 ("spec 33 upload born pending", "0006_contributions.sql", "    IF NEW.state <> 'pending' THEN", "    IF false THEN"),
 ("T6 right star", "0005_schedules_and_days.sql", "                    AND star_interval_id = NEW.star_interval_id\n", "\n"),
 ("FQ61 version in force", "0005_schedules_and_days.sql", "  IF version.effective_from > NEW.local_date\n     OR EXISTS", "  IF version.effective_from > NEW.local_date\n     OR false AND EXISTS"),
 ("FQ61 new version moves a day", "0005_schedules_and_days.sql", "  IF EXISTS (SELECT FROM app.occurrences WHERE club_id = NEW.club_id AND local_date >= NEW.effective_from) THEN", "  IF false THEN"),
 ("FQ63 no day for a leaver", "0005_schedules_and_days.sql", "  IF NOT EXISTS (SELECT FROM app.memberships WHERE interval_id = NEW.star_interval_id AND state = 'active') THEN", "  IF false THEN"),
 ("T9 status only denies", "0005_schedules_and_days.sql", "          OR (OLD.status = 'suspended' AND NEW.status = 'cancelled')) THEN", "          OR (OLD.status = 'suspended' AND NEW.status = 'cancelled') OR true) THEN"),
 ("T7 join needs every approval", "0004_rosters.sql", "     OR EXISTS (SELECT FROM app.roster_revision_members m\n", "     OR false AND EXISTS (SELECT FROM app.roster_revision_members m\n"),
 ("T7 join needs applied revision", "0004_rosters.sql", "AND club_id = NEW.club_id AND state = 'applied')", "AND club_id = NEW.club_id)"),
 ("T7 one creator", "0003_people_and_clubs.sql", "CREATE UNIQUE INDEX memberships_one_creator ON app.memberships (club_id) WHERE origin = 'creator';", "CREATE INDEX memberships_one_creator ON app.memberships (club_id) WHERE origin = 'creator';"),
 ("T33 version with state", "0004_rosters.sql", "  IF NEW.version <> OLD.version + (CASE WHEN NEW.state = OLD.state THEN 0 ELSE 1 END) THEN", "  IF false THEN"),
 ("T7 sealed roster", "0004_rosters.sql", "  IF TG_OP = 'INSERT' AND TG_TABLE_NAME <> 'roster_approvals' AND revision.roster_sealed_at IS NOT NULL THEN", "  IF false THEN"),
 ("A01 six members", "0003_people_and_clubs.sql", "    IF active >= 6 THEN", "    IF active >= 7 THEN"),
 ("T25 removal state matches", "0008_safety.sql", "  IF drop_state IS DISTINCT FROM (CASE", "  IF false AND drop_state IS DISTINCT FROM (CASE"),
 ("T25 pictured after reveal", "0008_safety.sql", "\n                                  OR NEW.removed_at < app.drop_reveal_at(d.id)) THEN", ") THEN"),
 ("T25 removal written once", "0008_safety.sql", "CREATE TRIGGER drop_removals_written_once BEFORE UPDATE OR DELETE ON app.drop_removals", "CREATE TRIGGER drop_removals_written_once BEFORE TRUNCATE ON app.drop_removals"),
 ("spec 22 own report", "0008_safety.sql", "  IF target_author = NEW.reporter_interval_id THEN", "  IF false THEN"),
 ("D07 after reveal", "0007_after_the_reveal.sql", "  IF written_at < app.drop_reveal_at(NEW.drop_id) THEN", "  IF false THEN"),
 ("spec 16 own reaction", "0007_after_the_reveal.sql", "    IF EXISTS (SELECT FROM app.drops WHERE id = NEW.drop_id AND author_interval_id = NEW.interval_id) THEN", "    IF false THEN"),
 ("T19 receipt commits completed", "0009_platform.sql", "                AND idempotency_key = NEW.idempotency_key AND state = 'pending') THEN", "                AND idempotency_key = NEW.idempotency_key AND false) THEN"),
 ("T19 completed immutable", "0009_platform.sql", "  IF OLD.state = 'completed' AND NEW IS DISTINCT FROM OLD THEN", "  IF false THEN"),
 ("T19 one receipt per key", "0009_platform.sql", "  PRIMARY KEY (actor_user_id, operation, idempotency_key),", "  PRIMARY KEY (actor_user_id, operation, idempotency_key, request_hash),"),
 ("T52 no caption in receipts/outbox", "0009_platform.sql", "  RETURN pg_catalog.jsonb_path_exists(value, 'lax $.**.caption')\n    OR", "  RETURN"),
 ("T28 tombstone never deleted", "0008_safety.sql", "CREATE TRIGGER deletion_tombstones_no_delete BEFORE DELETE ON app.deletion_tombstones", "CREATE TRIGGER deletion_tombstones_no_delete BEFORE TRUNCATE ON app.deletion_tombstones"),
 ("FQ27 audit append-only", "0008_safety.sql", "CREATE TRIGGER operator_actions_append_only BEFORE UPDATE OR DELETE ON app.operator_actions", "CREATE TRIGGER operator_actions_append_only BEFORE UPDATE ON app.operator_actions"),
]
shutil.rmtree(BACKUP, ignore_errors=True)
shutil.copytree(ROOT, BACKUP)
def restore():
    for f in os.listdir(BACKUP):
        shutil.copy(os.path.join(BACKUP, f), os.path.join(ROOT, f))
results = []
only = sys.argv[1:]
try:
    for name, f, old, new in MUTATIONS:
        if only and not any(o in name for o in only):
            continue
        restore()
        p = os.path.join(ROOT, f)
        s = open(p).read()
        n = s.count(old)
        if n != 1:
            results.append((name, f"BAD MUTATION ({n} matches)", ""))
            continue
        open(p, "w").write(s.replace(old, new))
        r = subprocess.run(["bash", SCR + "/dbtest.sh"], env={**os.environ, "FRESH": "1"}, capture_output=True, text=True)
        out = r.stdout + r.stderr
        failed = re.findall(r"^\s*(?:FAIL|×) (.*)$", out, re.M)
        summary = re.search(r"Tests\s+(.*)", out)
        caught = bool(re.search(r"\d+ failed", out)) or "Error" in out and "passed" not in (summary.group(1) if summary else "")
        results.append((name, "CAUGHT" if caught else "MISSED", (summary.group(1) if summary else out[-300:]) + " | " + "; ".join(failed[:3])))
        print(results[-1], flush=True)
finally:
    restore()
print("\n==== SUMMARY")
for name, verdict, detail in results:
    print(f"{verdict:8} {name}: {detail[:300]}")
