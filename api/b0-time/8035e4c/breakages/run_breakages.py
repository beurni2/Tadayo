# Deliberate breakages of the time module (slice 5): each must make a named test fail.
# Each breakage is one exact text change in one file; the file is restored after its run.
# Run from anywhere: python3 run_breakages.py [name filter ...]; results go to results.json
# (all of them only on a run with no filter).
import subprocess, sys, os, json, re, hashlib
HERE = os.path.dirname(os.path.abspath(__file__))
WT = os.environ.get("REPO", "/home/user/tadayo-time")
ENV = dict(os.environ, PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"])
DB = os.path.join(HERE, "dbtest.sh")
CIVIL = "packages/domain/src/time/civil.ts"
CLOCK = "packages/domain/src/time/clock.ts"
INSTANT = "packages/domain/src/time/instant.ts"
TESTING = "packages/domain/src/time/testing.ts"
SCAN = "packages/domain/src/time/one-clock.test.ts"
DEVSQL = "tools/ops/sql/dev_clock.sql"
PROD_SELECT = "SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) OPERATOR(pg_catalog.*) 1000000)\n                 ::pg_catalog.int8::pg_catalog.text AS now_us,"
M = [
 # The day's two instants (spec 05, ADR-008).
 ("gap: Temporal's compatible", CIVIL, "  const jump = first.getTimeZoneTransition(\"next\");", "  return wall.toZonedDateTime(zone).toInstant();\n  const jump = first.getTimeZoneTransition(\"next\");", "unit"),
 ("gap: later", CIVIL, "  const jump = first.getTimeZoneTransition(\"next\");", "  return wall.toZonedDateTime(zone, { disambiguation: \"later\" }).toInstant();\n  const jump = first.getTimeZoneTransition(\"next\");", "unit"),
 ("doubled: later", CIVIL, "{ disambiguation: \"earlier\" }", "{ disambiguation: \"later\" }", "unit"),
 ("doubled: compatible everywhere", CIVIL, "const first = wall.toZonedDateTime(clubTimeZone(zone), { disambiguation: \"earlier\" });", "const first = wall.toZonedDateTime(clubTimeZone(zone), { disambiguation: \"compatible\" });", "unit"),
 ("close = reveal + 18h", CIVIL, "const closeAt = resolveCivilTime(localDate.add({ days: 1 }), CLOSE_TIME, zone);", "const closeAt = revealAt.add({ hours: 18 });", "unit"),
 ("close on the same date", CIVIL, "resolveCivilTime(localDate.add({ days: 1 }), CLOSE_TIME, zone)", "resolveCivilTime(localDate, CLOSE_TIME, zone)", "unit"),
 # The club's zone (T2, FQ19).
 ("zone: an offset let in", CIVIL, " || /^[+-]/.test(id)", "", "unit"),
 ("zone by Intl", CIVIL, "const id = Temporal.PlainDate.from(\"2026-01-01\").toZonedDateTime(zone).timeZoneId;", "const id = new Intl.DateTimeFormat(\"en-US\", { timeZone: zone }).resolvedOptions().timeZone;", "unit"),
 ("zone kept as given", CIVIL, "  return id;", "  return zone;", "unit"),
 ("zone: an ISO time let in", CIVIL, "if (id.toLowerCase() !== zone.toLowerCase() || /^[+-]/.test(id))", "if (/^[+-]/.test(id))", "unit"),
 # The isolation rule, for every clock.
 ("any isolation", CLOCK, "if (isolation !== \"read committed\") {", "if (false) {", "both"),
 ("prod: any isolation", CLOCK, "                 ::pg_catalog.int8::pg_catalog.text AS now_us,\n               pg_catalog.current_setting('transaction_isolation') AS isolation", "                 ::pg_catalog.int8::pg_catalog.text AS now_us,\n               'read committed' AS isolation", "both"),
 ("dev: any isolation", CLOCK, "                 ::pg_catalog.text AS now_us,\n               pg_catalog.current_setting('transaction_isolation') AS isolation", "                 ::pg_catalog.text AS now_us,\n               'read committed' AS isolation", "both"),
 ("fake: any isolation", TESTING, "      requireReadCommitted(rows[0]?.[\"isolation\"]);\n", "      void rows;\n", "both"),
 # Choosing the clock at startup (ADR-013).
 ("prod gets the dev clock", CLOCK, "    return PROD_CLOCK;\n", "    return DEV_CLOCK;\n", "unit"),
 ("prod skips its check", CLOCK, "    if (present) throw new Error(\"time: prod refuses", "    if (false) throw new Error(\"time: prod refuses", "unit"),
 ("dev skips its check", CLOCK, "  if (!present)", "  if (false)", "unit"),
 ("any environment is dev", CLOCK, "  if (environment !== \"dev\" && environment !== \"prod\") {", "  if (false) {", "unit"),
 ("no answer taken as no table", CLOCK, "  if (typeof present !== \"boolean\") throw new Error(\"time: the dev clock's check got no answer\");\n", "", "unit"),
 ("dev: no table read at start", CLOCK, "    await sql`SELECT offset_microseconds FROM app.dev_clock`;", "", "both"),
 ("dev: no shape check", CLOCK, "  if (shape[0]?.[\"sound\"] !== true) {", "  if (false) {", "both"),
 ("dev shape: any owner", CLOCK, "           AND c.relowner = (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = current_user)\n", "", "both"),
 ("dev shape: a view", CLOCK, "c.relkind = 'r' AND ", "", "both"),
 ("dev shape: forced RLS", CLOCK, " AND NOT c.relforcerowsecurity", "", "both"),
 ("dev shape: triggers off", CLOCK, "t.tgenabled IN ('O', 'A')", "true", "both"),
 # The samples.
 ("prod reads now()", CLOCK, PROD_SELECT, PROD_SELECT.replace("clock_timestamp()", "now()"), "both"),
 ("dev reads now()", CLOCK, "SELECT ((extract(epoch FROM pg_catalog.clock_timestamp())", "SELECT ((extract(epoch FROM pg_catalog.now())", "both"),
 ("sample in milliseconds", CLOCK, PROD_SELECT, "SELECT ((extract(epoch FROM pg_catalog.clock_timestamp()) * 1000)::bigint * 1000)::text AS now_us,", "db"),
 ("prod: * by the search path", CLOCK, "OPERATOR(pg_catalog.*) 1000000)\n                 ::pg_catalog.int8::pg_catalog.text", "* 1000000)\n                 ::pg_catalog.int8::pg_catalog.text", "both"),
 ("dev: * by the search path", CLOCK, "clock_timestamp()) OPERATOR(pg_catalog.*) 1000000)::pg_catalog.int8\n", "clock_timestamp()) * 1000000)::pg_catalog.int8\n", "both"),
 ("dev ignores its offset", CLOCK, "OPERATOR(pg_catalog.+) coalesce((SELECT offset_microseconds FROM app.dev_clock), 0))", "OPERATOR(pg_catalog.+) 0 * coalesce((SELECT offset_microseconds FROM app.dev_clock), 0))", "db"),
 ("dev offset in seconds", CLOCK, "coalesce((SELECT offset_microseconds FROM app.dev_clock), 0))", "coalesce((SELECT offset_microseconds / 1000000 * 1000000 FROM app.dev_clock), 0))", "db"),
 # The dev clock's table (tools/ops/sql/dev_clock.sql).
 ("dev table: any role", DEVSQL, "IF current_user <> 'tadayo_app' THEN", "IF false THEN", "db"),
 ("dev table: several statements", DEVSQL, "  END IF;\n\n  CREATE TABLE app.dev_clock (", "  END IF;\nEND\n$file$;\nDO $file$\nBEGIN\n  CREATE TABLE app.dev_clock (", "db"),
 ("dev table: PUBLIC runs its function", DEVSQL, "REVOKE EXECUTE ON FUNCTION app.dev_clock_forward() FROM PUBLIC;", "GRANT EXECUTE ON FUNCTION app.dev_clock_forward() TO PUBLIC;", "db"),
 ("dev table: back in time", DEVSQL, "IF NEW.offset_microseconds < OLD.offset_microseconds THEN", "IF false THEN", "db"),
 ("dev table: negative", DEVSQL, " CHECK (offset_microseconds >= 0)", "", "db"),
 ("dev table: delete", DEVSQL, "CREATE TRIGGER dev_clock_kept BEFORE DELETE", "CREATE TRIGGER dev_clock_kept BEFORE INSERT", "db"),
 ("dev table: no RLS", DEVSQL, "ALTER TABLE app.dev_clock ENABLE ROW LEVEL SECURITY;", "", "db"),
 ("dev table: many rows", DEVSQL, "only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row),", "only_row boolean DEFAULT true,", "db"),
 # Instants leaving the module.
 ("fake clock in the main entry", "packages/domain/src/index.ts", "export { contractInstant, INSTANT_TYPE } from \"./time/instant.ts\";", "export { contractInstant, INSTANT_TYPE } from \"./time/instant.ts\";\nexport { fakeClock } from \"./time/testing.ts\";", "unit"),
 ("contract: half-expand", INSTANT, "roundingMode: \"floor\"", "roundingMode: \"halfExpand\"", "unit"),
 ("contract: trunc", INSTANT, "roundingMode: \"floor\"", "roundingMode: \"trunc\"", "unit"),
 ("database: milliseconds", INSTANT, "fractionalSecondDigits: 6", "fractionalSecondDigits: 3", "unit"),
 ("instant type takes a Date", INSTANT, "if (!(value instanceof Temporal.Instant)) {", "if (!(value instanceof Temporal.Instant) && !(value instanceof Date)) {", "unit"),
 ("instant type reads by Date", INSTANT, "      return Temporal.Instant.from(text);", "      return Temporal.Instant.fromEpochMilliseconds(Date.parse(text));", "unit"),
 ("fake: nanoseconds", INSTANT, "if (instant.epochNanoseconds % 1000n !== 0n) {", "if (false) {", "unit"),
 # The one-clock scan (T1).
 ("scan: the literal word alone", SCAN, "pattern: /'\\s*(?:now|today|tomorrow|yesterday)\\b[^']*'|'[^']*\\b(?:now|today|tomorrow|yesterday)\\s*'/i,", "pattern: /'\\s*(?:now|today|tomorrow|yesterday)\\s*'/i,", "unit"),
 ("scan: no age()", SCAN, "  { what: \"SQL's age()\", pattern: /\\bage\\s*\\(/i },\n", "", "unit"),
 ("scan: format() let through", SCAN, "pattern: /\\.format(?:ToParts)?\\s*\\(\\s*\\)/,", "pattern: /(?!)/,", "unit"),
 ("scan: the global Date let through", SCAN, "pattern: /\\b(?:globalThis|global|window|self)\\s*\\.\\s*Date\\b/", "pattern: /(?!)/", "unit"),
 ("scan: no apps/web", SCAN, "const ROOTS = [\"packages\", \"services\", \"db\", join(\"apps\", \"web\"), join(\"tools\", \"ops\")];", "const ROOTS = [\"packages\", \"services\", \"db\", join(\"tools\", \"ops\")];", "unit"),
 ("scan: src only", SCAN, "SCANNED.test(file) &&", "SCANNED.test(file) && file.split(sep).includes(\"src\") &&", "unit"),
 ("scan: no SQL", SCAN, "const SCANNED = /\\.(?:ts|mts|cts|js|mjs|cjs|sql|html)$/;", "const SCANNED = /\\.(?:ts|mts|cts|js|mjs|cjs|html)$/;", "unit"),
]
only = sys.argv[1:]
RESULTS = []
ENV["REPO"] = WT
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
        results = []
        tests_failed = []
        if where in ("unit", "both"):
            r = subprocess.run(["pnpm", "--filter", "@tadayo/domain", "exec", "vitest", "run", "src/time"], cwd=WT, env=ENV, capture_output=True, text=True)
            results.append(("unit", r.returncode))
            tests_failed = failed(r.stdout + r.stderr)
        if where in ("db", "both"):
            r = subprocess.run(["bash", DB, "src/db/clock.test.ts"], env=ENV, capture_output=True, text=True)
            results.append(("db", 1 if " failed" in r.stdout else 0))
            tests_failed = tests_failed + failed(r.stdout + r.stderr)
        caught = any(code != 0 for _, code in results)
        print(("CAUGHT " if caught else "MISSED ") + name, results)
        RESULTS.append({"name": name, "file": path, "from": old, "to": new, "suites": where, "exit_codes": dict(results), "failed": tests_failed, "verdict": "caught" if caught else "missed"})
    finally:
        open(full, "w").write(text)
json.dump(RESULTS, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "results.json"), "w"), indent=2)
AFTER = {path: sha(path) for path in BEFORE}
assert AFTER == BEFORE, "a file was not restored"
print("every file restored:", len(BEFORE))
