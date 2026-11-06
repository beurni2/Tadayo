# Deliberate breakages of the time module (slice 5): each must make a named test fail.
# Each breakage is one exact text change in one file; the file is restored after its run.
# Run from anywhere: python3 run_breakages.py [name filter ...]; results go to results.json.
import subprocess, sys, os, json, re, hashlib
HERE = os.path.dirname(os.path.abspath(__file__))
WT = os.environ.get("REPO", "/home/user/tadayo-time")
ENV = dict(os.environ, PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"])
DB = os.path.join(HERE, "dbtest.sh")
CIVIL = "packages/domain/src/time/civil.ts"
CLOCK = "packages/domain/src/time/clock.ts"
INSTANT = "packages/domain/src/time/instant.ts"
M = [
 ("gap: Temporal's compatible", CIVIL, "  const jump = first.getTimeZoneTransition(\"next\");", "  return wall.toZonedDateTime(zone).toInstant();\n  const jump = first.getTimeZoneTransition(\"next\");", "unit"),
 ("gap: later", CIVIL, "  const jump = first.getTimeZoneTransition(\"next\");", "  return wall.toZonedDateTime(zone, { disambiguation: \"later\" }).toInstant();\n  const jump = first.getTimeZoneTransition(\"next\");", "unit"),
 ("doubled: later", CIVIL, "{ disambiguation: \"earlier\" }", "{ disambiguation: \"later\" }", "unit"),
 ("doubled: compatible everywhere", CIVIL, "const first = wall.toZonedDateTime(clubTimeZone(zone), { disambiguation: \"earlier\" });", "const first = wall.toZonedDateTime(clubTimeZone(zone), { disambiguation: \"compatible\" });", "unit"),
 ("close = reveal + 18h", CIVIL, "const closeAt = resolveCivilTime(localDate.add({ days: 1 }), CLOSE_TIME, zone);", "const closeAt = revealAt.add({ hours: 18 });", "unit"),
 ("close on the same date", CIVIL, "resolveCivilTime(localDate.add({ days: 1 }), CLOSE_TIME, zone)", "resolveCivilTime(localDate, CLOSE_TIME, zone)", "unit"),
 ("no IANA check", CIVIL, "if (!/^[A-Za-z]/.test(zone))", "if (false)", "unit"),
 ("zone by Intl", CIVIL, "return Temporal.PlainDate.from(\"2026-01-01\").toZonedDateTime(zone).timeZoneId;", "return new Intl.DateTimeFormat(\"en-US\", { timeZone: zone }).resolvedOptions().timeZone;", "unit"),
 ("zone kept as given", CIVIL, "return Temporal.PlainDate.from(\"2026-01-01\").toZonedDateTime(zone).timeZoneId;", "Temporal.PlainDate.from(\"2026-01-01\").toZonedDateTime(zone);\n  return zone;", "unit"),
 ("any isolation", CLOCK, "if (isolation !== \"read committed\") {", "if (false) {", "both"),
 ("prod: any isolation", CLOCK, "SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) * 1000000)::bigint::text AS now_us,\n               pg_catalog.current_setting('transaction_isolation') AS isolation", "SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) * 1000000)::bigint::text AS now_us,\n               'read committed' AS isolation", "both"),
 ("dev: no table read at start", CLOCK, "    await sql`SELECT offset_microseconds FROM app.dev_clock`;", "", "both"),
 ("dev table: any role", "tools/ops/sql/dev_clock.sql", "IF current_user <> 'tadayo_app' THEN", "IF false THEN", "db"),
 ("dev table: PUBLIC runs its function", "tools/ops/sql/dev_clock.sql", "REVOKE EXECUTE ON FUNCTION app.dev_clock_forward() FROM PUBLIC;", "GRANT EXECUTE ON FUNCTION app.dev_clock_forward() TO PUBLIC;", "db"),
 ("fake clock in the main entry", "packages/domain/src/index.ts", "export { contractInstant, INSTANT_TYPE } from \"./time/instant.ts\";", "export { contractInstant, INSTANT_TYPE } from \"./time/instant.ts\";\nexport { fakeClock } from \"./time/testing.ts\";", "unit"),
 ("dev table: back in time", "tools/ops/sql/dev_clock.sql", "  IF NEW.offset_microseconds < OLD.offset_microseconds THEN", "  IF false THEN", "db"),
 ("dev table: negative", "tools/ops/sql/dev_clock.sql", " CHECK (offset_microseconds >= 0)", "", "db"),
 ("dev table: delete", "tools/ops/sql/dev_clock.sql", "CREATE TRIGGER dev_clock_kept BEFORE DELETE", "CREATE TRIGGER dev_clock_kept BEFORE INSERT", "db"),
 ("contract: half-expand", INSTANT, "roundingMode: \"floor\"", "roundingMode: \"halfExpand\"", "unit"),
 ("contract: trunc", INSTANT, "roundingMode: \"floor\"", "roundingMode: \"trunc\"", "unit"),
 ("database: milliseconds", INSTANT, "fractionalSecondDigits: 6", "fractionalSecondDigits: 3", "unit"),
 ("instant type takes a Date", INSTANT, "if (!(value instanceof Temporal.Instant)) {", "if (!(value instanceof Temporal.Instant) && !(value instanceof Date)) {", "unit"),
 ("fake: nanoseconds", INSTANT, "if (instant.epochNanoseconds % 1000n !== 0n) {", "if (false) {", "unit"),
 ("prod gets the dev clock", CLOCK, "    return PROD_CLOCK;\n", "    return DEV_CLOCK;\n", "unit"),
 ("prod skips its check", CLOCK, "    if (present) throw new Error(\"time: prod refuses", "    if (false) throw new Error(\"time: prod refuses", "unit"),
 ("dev skips its check", CLOCK, "  if (!present)", "  if (false)", "unit"),
 ("any environment is dev", CLOCK, "  if (environment !== \"dev\" && environment !== \"prod\") {", "  if (false) {", "unit"),
 ("prod reads now()", CLOCK, "SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) * 1000000)::bigint::text AS now_us,", "SELECT (extract(epoch FROM pg_catalog.now()) * 1000000)::bigint::text AS now_us,", "both"),
 ("dev reads now()", CLOCK, "SELECT ((extract(epoch FROM pg_catalog.clock_timestamp()) * 1000000)::bigint", "SELECT ((extract(epoch FROM pg_catalog.now()) * 1000000)::bigint", "both"),
 ("dev ignores its offset", CLOCK, "+ coalesce((SELECT offset_microseconds FROM app.dev_clock), 0))", "+ 0 * coalesce((SELECT offset_microseconds FROM app.dev_clock), 0))", "db"),
 ("dev offset in seconds", CLOCK, "+ coalesce((SELECT offset_microseconds FROM app.dev_clock), 0))", "+ coalesce((SELECT offset_microseconds / 1000000 * 1000000 FROM app.dev_clock), 0))", "db"),
 ("sample in milliseconds", CLOCK, "SELECT (extract(epoch FROM pg_catalog.clock_timestamp()) * 1000000)::bigint::text AS now_us,", "SELECT ((extract(epoch FROM pg_catalog.clock_timestamp()) * 1000)::bigint * 1000)::text AS now_us,", "db"),
 ("dev table: no RLS", "tools/ops/sql/dev_clock.sql", "ALTER TABLE app.dev_clock ENABLE ROW LEVEL SECURITY;", "", "db"),
 ("dev table: many rows", "tools/ops/sql/dev_clock.sql", "only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row),", "only_row boolean DEFAULT true,", "db"),
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
