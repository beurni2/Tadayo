# Deliberate breakages of the read predicate (slice 6): each must make a test fail.
# Each breakage is one exact text change in one file; the file is restored after its run.
# Run from anywhere: REPO=<working tree> python3 run_breakages.py [name filter ...]; results go to
# results.json beside it (all of them only on a run with no filter).
import subprocess, sys, os, json, re, hashlib
HERE = os.path.dirname(os.path.abspath(__file__))
WT = os.environ.get("REPO", "/home/user/tadayo-authz")
ENV = dict(os.environ, PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"])
DB = os.path.join(HERE, "dbtest.sh")
ENV["REPO"] = WT
TS = "packages/domain/src/authorization/read.ts"
SQL = "packages/domain/src/authorization/read-sql.ts"
M = [
 # The TypeScript policy: each of its conditions, the reveal's edge, the held day's edge, the guards.
 ("ts: no account check", TS, '    facts.viewerAccount === "active" &&\n', "", "both"),
 ("ts: no interval check", TS, '    facts.viewerInterval === "active" &&\n', "", "both"),
 ("ts: any interval in the audience", TS, 'facts.viewerInterval === "active" &&', 'facts.viewerInterval !== null &&', "both"),
 ("ts: held and removed let in", TS, 'facts.drop === "active" &&', 'facts.drop !== "withdrawn" &&', "both"),
 ("ts: no day status", TS, '    facts.day === "scheduled" &&\n', "", "both"),
 ("ts: cancelled let in", TS, 'facts.day === "scheduled" &&', 'facts.day !== "suspended" &&', "both"),
 ("ts: no club suspension", TS, '    facts.clubSuspendedAt === null &&\n', "", "both"),
 ("ts: club suspension as truthy", TS, 'facts.clubSuspendedAt === null &&', '!facts.clubSuspendedAt &&', "unit"),
 ("ts: no held day", TS, "    notBeforeReveal(facts.starLeftAt, facts.revealAt) &&\n", "", "both"),
 ("ts: no star deletion", TS, "    notBeforeReveal(facts.starDeletionRequestedAt, facts.revealAt) &&\n", "", "both"),
 ("ts: held day at reveal_at", TS, "Temporal.Instant.compare(at, revealAt) >= 0", "Temporal.Instant.compare(at, revealAt) > 0", "both"),
 ("ts: held day's instants unguarded", TS, "    (at instanceof Temporal.Instant &&\n      revealAt instanceof Temporal.Instant &&\n      Temporal.Instant.compare(at, revealAt) >= 0)", "    Temporal.Instant.compare(at, revealAt) >= 0", "unit"),
 ("ts: no author account", TS, '    facts.authorAccount === "active" &&\n', "", "both"),
 ("ts: no block", TS, "    Object.is(facts.blocked, false) &&\n", "", "both"),
 ("ts: block as truthy", TS, "Object.is(facts.blocked, false) &&", "!facts.blocked &&", "unit"),
 ("ts: reveal after reveal_at", TS, "Temporal.Instant.compare(now, facts.revealAt) >= 0", "Temporal.Instant.compare(now, facts.revealAt) > 0", "both"),
 ("ts: reveal_at unguarded", TS, "(facts.revealAt instanceof Temporal.Instant && Temporal.Instant.compare(now, facts.revealAt) >= 0)", "Temporal.Instant.compare(now, facts.revealAt) >= 0", "unit"),
 ("ts: media before the reveal", TS, '(what === "caption" ||', '(what !== "reactions" ||', "both"),
 ("ts: reactions before the reveal", TS, '(what === "caption" ||', '(what !== "media" ||', "both"),
 ("ts: missing drop granted", TS, "  if (facts === null) return false;", "  if (facts === null) return true;", "both"),
 ("ts: unknown read taken", TS, "  if (!READS.includes(what as ReadWhat)) {", "  if (false) {", "both"),
 ("ts: any now taken", TS, "  if (!(now instanceof Temporal.Instant)) throw", "  if (false) throw", "both"),
 ("ts: nanoseconds taken", TS, '  wholeMicroseconds(now, "now");\n', "", "both"),
 # The SQL that filters lists.
 ("sql: no account check", SQL, "       AND u.state = 'active'\n", "", "db"),
 ("sql: no interval check", SQL, "       AND m.state = 'active'\n", "", "db"),
 ("sql: any interval of the club's", SQL, "      JOIN app.drop_audience a ON a.drop_id = d.id\n      JOIN app.memberships m ON m.interval_id = a.interval_id\n", "      JOIN app.memberships m ON m.club_id = d.club_id\n", "db"),
 ("sql: held and removed let in", SQL, "       AND d.state = 'active'\n", "       AND d.state <> 'withdrawn'\n", "db"),
 ("sql: no day status", SQL, "       AND o.status = 'scheduled'\n", "", "db"),
 ("sql: cancelled let in", SQL, "o.status = 'scheduled'", "o.status <> 'suspended'", "db"),
 ("sql: no club suspension", SQL, "       AND c.suspended_at IS NULL\n", "", "db"),
 ("sql: no held day", SQL, "       AND (s.left_at IS NULL OR s.left_at >= o.reveal_at)\n", "", "db"),
 ("sql: held day at reveal_at", SQL, "s.left_at >= o.reveal_at", "s.left_at > o.reveal_at", "db"),
 ("sql: no star deletion", SQL, "       AND (su.deletion_requested_at IS NULL OR su.deletion_requested_at >= o.reveal_at)\n", "", "db"),
 ("sql: star deletion at reveal_at", SQL, "su.deletion_requested_at >= o.reveal_at", "su.deletion_requested_at > o.reveal_at", "db"),
 ("sql: no author account", SQL, "       AND au.state = 'active'\n", "", "db"),
 ("sql: the author's interval must be active", SQL, "       AND au.state = 'active'\n", "       AND au.state = 'active' AND am.state = 'active'\n", "db"),
 ("sql: no block", SQL, "       AND NOT EXISTS (SELECT FROM app.blocks b\n                        WHERE (b.blocker_user_id = m.user_id AND b.blocked_user_id = am.user_id)\n                           OR (b.blocker_user_id = am.user_id AND b.blocked_user_id = m.user_id))\n", "", "db"),
 ("sql: only the viewer's blocks", SQL, "\n                           OR (b.blocker_user_id = am.user_id AND b.blocked_user_id = m.user_id))", ")", "db"),
 ("sql: only the author's blocks", SQL, "(b.blocker_user_id = m.user_id AND b.blocked_user_id = am.user_id)\n                           OR ", "", "db"),
 ("sql: reveal after reveal_at", SQL, "o.reveal_at <= ${now}::pg_catalog.timestamptz", "o.reveal_at < ${now}::pg_catalog.timestamptz", "db"),
 ("sql: everything before the reveal", SQL, "AND (NOT ${beyondCaption}::pg_catalog.bool OR o.reveal_at", "AND (true OR o.reveal_at", "db"),
 ("sql: the transaction's clock", SQL, "o.reveal_at <= ${now}::pg_catalog.timestamptz", "o.reveal_at <= pg_catalog.now() AND ${now}::pg_catalog.timestamptz IS NOT NULL", "both"),
 ("sql: any viewer string taken", SQL, "  if (typeof viewer !== \"string\" || !ID.test(viewer)) throw", "  if (typeof viewer !== \"string\" || viewer === \"\") throw", "db"),
 ("sql: now rounded up to the millisecond", SQL, "o.reveal_at <= ${now}::pg_catalog.timestamptz", 'o.reveal_at <= ${now.round({ smallestUnit: "millisecond", roundingMode: "ceil" })}::pg_catalog.timestamptz', "db"),
 # The facts the policy reads, loaded from rows.
 ("facts: no viewer account", SQL, "(SELECT u.state FROM app.users u WHERE u.id = ${viewer}::pg_catalog.text) AS viewer_account", "'active'::pg_catalog.text AS viewer_account", "db"),
 ("facts: any interval of the club's", SQL, "                  FROM app.drop_audience a JOIN app.memberships m ON m.interval_id = a.interval_id\n                 WHERE a.drop_id = d.id AND m.user_id", "                  FROM app.memberships m\n                 WHERE m.club_id = d.club_id AND m.state = 'active' AND m.user_id", "db"),
 ("facts: no author account", SQL, "           au.state AS author_account,", "           'active'::pg_catalog.text AS author_account,", "db"),
 ("facts: only the viewer's blocks", SQL, "\n                           OR (b.blocker_user_id = am.user_id AND b.blocked_user_id = ${viewer}::pg_catalog.text)) AS blocked", ") AS blocked", "db"),
 ("facts: only the author's blocks", SQL, "(b.blocker_user_id = ${viewer}::pg_catalog.text AND b.blocked_user_id = am.user_id)\n                           OR ", "", "db"),
 ("facts: the star's join, not leave", SQL, "           s.left_at AS star_left_at,", "           s.joined_at AS star_left_at,", "db"),
 ("facts: the star's deletion not loaded", SQL, "su.deletion_requested_at AS star_deletion_requested_at,", "NULL::pg_catalog.timestamptz AS star_deletion_requested_at,", "db"),
 ("facts: an ended interval before an active one", SQL, "ORDER BY m.state = 'active' DESC, m.interval_id", "ORDER BY m.state = 'active' ASC, m.interval_id", "db"),
 ("facts: any drop id queried", SQL, "  const id = ID.test(drop) ? drop : null;", "  const id = drop;", "db"),
 ("facts: a malformed id answered before the statement", SQL, "  const id = ID.test(drop) ? drop : null;", "  if (!ID.test(drop)) return null;\n  const id = drop;", "db"),
 ("facts: the server's time not read back", SQL, "  if (row === undefined || !instant(row[\"now\"], \"now\").equals(now))", "  if (row === undefined)", "db"),
 ("facts: a Date taken", SQL, "  if (value instanceof Temporal.Instant) return value;", "  if (value instanceof Temporal.Instant || value instanceof Date) return value as Temporal.Instant;", "db"),
]
only = sys.argv[1:]
RESULTS = []
def sha(path): return hashlib.sha256(open(os.path.join(WT, path), "rb").read()).hexdigest()
BEFORE = {path: sha(path) for _, path, _, _, _ in M}
def failed(output):
    return sorted({m.group(1).strip() for m in re.finditer(r"^\s*FAIL\s+(.+?\.test\.ts > .+)$", output, re.M)})
for name, path, old, new, where in M:
    if only and not any(o in name for o in only): continue
    full = os.path.join(WT, path)
    text = open(full).read()
    if text.count(old) != 1:
        print(f"SKIP {name}: anchor found {text.count(old)} times"); continue
    open(full, "w").write(text.replace(old, new))
    try:
        results, tests_failed = [], []
        if where in ("unit", "both"):
            r = subprocess.run(["pnpm", "--filter", "@tadayo/domain", "exec", "vitest", "run", "src/authorization", "src/time/one-clock.test.ts"], cwd=WT, env=ENV, capture_output=True, text=True)
            results.append(("unit", r.returncode))
            tests_failed += failed(r.stdout + r.stderr)
        if where in ("db", "both"):
            r = subprocess.run(["bash", DB, "src/db/authorization.test.ts"], env=ENV, capture_output=True, text=True)
            results.append(("db", 1 if " failed" in r.stdout or r.returncode != 0 else 0))
            tests_failed += failed(r.stdout + r.stderr)
        caught = any(code != 0 for _, code in results)
        print(("CAUGHT " if caught else "MISSED ") + name, results, len(tests_failed))
        RESULTS.append({"name": name, "file": path, "from": old, "to": new, "suites": where, "exit_codes": dict(results), "failed": tests_failed, "verdict": "caught" if caught else "missed"})
    finally:
        open(full, "w").write(text)
if not only:
    json.dump(RESULTS, open(os.path.join(HERE, "results.json"), "w"), indent=2)
AFTER = {path: sha(path) for path in BEFORE}
assert AFTER == BEFORE, "a file was not restored"
print("every file restored:", len(BEFORE), "caught", sum(r["verdict"] == "caught" for r in RESULTS), "of", len(RESULTS))
