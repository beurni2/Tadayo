"""Deliberate breakages of spike S4's first PR, device registration (api/b2-spike-devices):
docs/plans/api-b2-spike-push.md section 1, the migration's guards, the routes and the judge (tests/src/privacy/device.ts).
Built from the commit's runner (wbrk).

For each: change the one place, run the suite registered for it, and check that a test whose name holds the
pre-registered words fails. The file is restored after each. Nothing else may use the local database meanwhile.

  breakages.py --check        count every anchor, change nothing
  breakages.py D01 J02 ...    only these
"""

import difflib
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get("BREAK_ROOT", "/home/user/tadayo-commit"))
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad"
OUT = pathlib.Path(os.environ.get("BREAK_OUT", SP + "/dbrk/out2"))
ENV = dict(
    os.environ,
    PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
    DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
    DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres",
)
DOMAIN = "packages/domain/src/identity/devices.ts"
MIGRATION = "db/migrations/0017_devices.sql"
ROUTE = "services/api/src/identity/devices.ts"
ANSWERS = "services/api/src/answers.ts"
APP = "services/api/src/app.ts"
JUDGE = "tests/src/privacy/device.ts"
LOGGING = "services/api/src/logging.ts"

DB = ["npx", "vitest", "run", "--config", "vitest.db.config.ts"]
V = ["npx", "vitest", "run"]
SUITES = {
    # The migration is applied by the db config's global setup, so a migration breakage is seen by these tests.
    "db": ("tests", [*DB, "src/db/devices.test.ts"]),
    "route": ("services/api", [*V, "src/identity/devices.test.ts"]),
    "pure": ("packages/domain", [*V, "src/identity/devices.test.ts"]),
    "judge": ("tests", [*V, "src/privacy/device.test.ts"]),
    "matrix": ("tests", ["npx", "vitest", "run", "--config", "vitest.privacy.config.ts", "src/privacy/matrix.test.ts"]),
    "logging": ("services/api", [*V, "src/logging.test.ts"]),
}

B = [
    # The commands (plan section 1.3 and 1.4).
    ("D01 the token's lock dropped", DOMAIN,
     "  await lock(tx, tokenLock(token));\n", "", "db",
     "lets twenty sign-ins register one token at once"),
    ("D02 the sign-ins' locks in no fixed order", DOMAIN,
     "...(seen === null ? [] : [seen])])].sort();", "...(seen === null ? [] : [seen])])];", "db",
     "lets two sign-ins each take the other's token at once without a deadlock"),
    ("D03 the account's state not read again", DOMAIN,
     'account["state"] !== "active"', 'account["state"] === "none"', "db",
     "is refused once the account's deletion has begun"),
    ("D04 the profile not checked", DOMAIN,
     'if (typeof account["display_name"] !== "string" || account["age_confirmed"] !== true) {', "if (account === null) {", "db",
     "is refused once the account's deletion has begun, and before its profile is finished"),
    ("D05 the registration's purge dropped", DOMAIN,
     "  const now = await clock.sample(tx);\n  await purgeEnded(tx, now);\n\n  // 2.", "  const now = await clock.sample(tx);\n\n  // 2.", "db",
     "keeps eight days of them, nothing personal, and the next command deletes those past it"),
    ("D06 the removal's purge dropped", DOMAIN,
     "  await purgeEnded(tx, now);\n  const removed", "  const removed", "db",
     "keeps eight days of them, nothing personal, and the next command deletes those past it"),
    ("D07 the keep an hour short", DOMAIN,
     "const cut = now.subtract(ENDED_KEEP);", "const cut = now.subtract({ hours: 191 });", "db",
     "keeps eight days of them, nothing personal, and the next command deletes those past it"),
    ("D08 the purge with no limit", DOMAIN,
     "ORDER BY ended_at LIMIT ${PURGE_BATCH}", "ORDER BY ended_at LIMIT ${PURGE_BATCH * 100}", "db",
     "deletes at most `PURGE_BATCH` in one command, the oldest first"),
    ("D09 the purge newest first", DOMAIN,
     "ORDER BY ended_at LIMIT", "ORDER BY ended_at DESC LIMIT", "db",
     "deletes at most `PURGE_BATCH` in one command, the oldest first"),
    ("D10 an ended sign-in not refused by the command", DOMAIN,
     '  if (ended !== undefined) throw new Refused("NOT_FOUND");\n', "", "db",
     "moves a token from an earlier sign-in of the same account, which then has ended"),
    ("D11 another account's secret not refused", DOMAIN,
     'if (own !== undefined && own["user_id"] !== input.userId) throw', 'if (own === null) throw', "db",
     "answers a secret whose registration is another account's with the neutral not-found"),
    ("D12 the move leaves the earlier registration", DOMAIN,
     "    await bound(tx)`DELETE FROM app.device_registrations WHERE sign_in = pg_catalog.decode(${holder}, 'hex')`;\n", "", "db",
     "moves a token from an earlier sign-in of the same account, which then has ended"),
    ("D13 the move doesn't end the earlier sign-in", DOMAIN,
     "    await endSignIn(tx, holder, now);\n", "", "db",
     "moves a token from an earlier sign-in of the same account, which then has ended"),
    ("D14 a new token not written over the old", DOMAIN,
     "      SET apns_token = EXCLUDED.apns_token, apns_environment", "      SET apns_environment", "db",
     "replaces its token, environment and zone with each new registration of the same sign-in"),
    ("D15 the zone kept as sent", DOMAIN,
     "    timezone = clubTimeZone(input.timezone);", "    timezone = input.timezone;", "db",
     "keeps the secret's hash as the sign-in, the token in lowercase, the zone the server resolves"),
    ("D16 a removal that finds nothing ends nothing", DOMAIN,
     '    DELETE FROM app.device_registrations WHERE sign_in = pg_catalog.decode(${signIn}, \'hex\') RETURNING 1 AS removed`;\n  await endSignIn(tx, signIn, now);',
     '    DELETE FROM app.device_registrations WHERE sign_in = pg_catalog.decode(${signIn}, \'hex\') RETURNING 1 AS removed`;\n  if (removed.length > 0) await endSignIn(tx, signIn, now);',
     "db", "ends a sign-in that has no registration yet"),
    ("D17 the removal's lock dropped", DOMAIN,
     "  await lock(tx, signInLock(signIn));\n  const now", "  const now", "db",
     "lets a registration and a removal of one sign-in race"),
    ("D18 every removal said removed", DOMAIN,
     'return removed.length > 0 ? "removed" : "none";', 'return "removed";', "db",
     "removes the sign-in's registration and ends it; the second removal finds nothing"),
    ("D19 the secret kept, not hashed", DOMAIN,
     'return createHash("sha256").update(secret, "ascii").digest("hex");',
     'return Buffer.from(secret, "ascii").toString("hex").slice(0, 64).padEnd(64, "0");', "pure",
     "is the secret's SHA-256 in hex"),
    ("D20 the token kept in its case", DOMAIN,
     "  return token.toLowerCase();", "  return token;", "pure",
     "lowercases the contract's token"),
    # The migration's guards (plan section 1.2).
    ("M01 the guard's ended sign-in dropped", MIGRATION,
     "  IF EXISTS (SELECT FROM app.device_sign_ins_ended WHERE sign_in = NEW.sign_in) THEN\n    RAISE EXCEPTION 'app.device_registrations: a sign-in that has ended",
     "  IF false AND EXISTS (SELECT FROM app.device_sign_ins_ended WHERE sign_in = NEW.sign_in) THEN\n    RAISE EXCEPTION 'app.device_registrations: a sign-in that has ended",
     "db", "refuses a registration for an ended sign-in"),
    ("M02 a deleting account registered", MIGRATION,
     "WHERE id = NEW.user_id AND state = 'active' AND", "WHERE id = NEW.user_id AND state IN ('active', 'deleting') AND", "db",
     "refuses a registration for an ended sign-in, for an account that isn't active or finished"),
    ("M03 a token in uppercase kept", MIGRATION,
     "apns_token ~ '^[0-9a-f]+$'", "apns_token ~ '^[0-9a-fA-F]+$'", "db",
     "a token not in lowercase hex"),
    ("M04 a token held by two sign-ins", MIGRATION,
     "apns_token text NOT NULL UNIQUE", "apns_token text NOT NULL", "db",
     "and a token another sign-in holds"),
    ("M05 a sign-in ended with its registration kept", MIGRATION,
     "  IF EXISTS (SELECT FROM app.device_registrations WHERE sign_in = NEW.sign_in) THEN",
     "  IF false AND EXISTS (SELECT FROM app.device_registrations WHERE sign_in = NEW.sign_in) THEN", "db",
     "refuses at the commit a sign-in ended while its registration stays"),
    ("M06 an account deleted with a registration", MIGRATION,
     "  IF EXISTS (SELECT FROM app.device_registrations WHERE user_id = NEW.id) THEN",
     "  IF false AND EXISTS (SELECT FROM app.device_registrations WHERE user_id = NEW.id) THEN", "db",
     "and an account deleted with one (T27)"),
    # The routes.
    ("R01 the time not in whole seconds", ROUTE,
     "    registered_at: contractInstant(registration.registeredAt),", "    registered_at: registration.registeredAt.toString(),", "route",
     "sends the time in whole seconds, rounded down"),
    ("R02 a removal that found nothing answered 204", ROUTE,
     'return outcome === "removed" ? noContent(reply) : problem(reply, "NOT_FOUND");', "return noContent(reply);", "route",
     "answers a removal that found nothing with the neutral not-found"),
    ("R03 the 204 cacheable", ANSWERS,
     '  return reply.code(204).header("cache-control", NO_STORE).send();', "  return reply.code(204).send();", "route",
     "answers a removal that removed a registration with 204, nothing in it"),
    ("R04 a refusal answered as a bad request", ROUTE,
     "      if (error instanceof Refused) return refusal(reply, error);", '      if (error instanceof Refused) return problem(reply, "INVALID_REQUEST");', "route",
     "maps the refusals"),
    ("R05 the registration's body limit the default", APP,
     "registerDevice: 10 * 1024", "registerDevice: 128 * 1024", "route",
     "takes a body up to its limit of 10 KiB and none above it"),
    ("R06 the removal's body limit the default", APP,
     "removeDevice: 2 * 1024", "removeDevice: 128 * 1024", "route",
     "takes a body up to its limit of 2 KiB and none above it"),
    # The judge (tests/src/privacy/device.ts).
    ("J01 the judge lets an ended sign-in register", JUDGE,
     '  if (rows.ended.has(signIn)) return { kind: "refused" };\n', "", "judge",
     "refuses an ended sign-in and a secret whose registration is another account's"),
    ("J02 the judge lets another account's secret register", JUDGE,
     '  if (own !== undefined && own.user !== viewer) return { kind: "refused" };\n', "", "judge",
     "refuses an ended sign-in and a secret whose registration is another account's"),
    ("J03 the judge sees no move", JUDGE,
     "moved: holder !== null && holder !== signIn ? holder : null", "moved: null", "judge",
     "moves a token another sign-in holds"),
    ("J04 the judge lets the earlier sign-in keep its registration", JUDGE,
     '    if (after.registrations.has(moved)) problems.push("the token\'s earlier sign-in kept its registration ((a))");\n', "", "judge",
     "refuses a move that left the earlier sign-in its registration"),
    ("J05 the judge lets another sign-in end", JUDGE,
     "if (!except.has(signIn) && !before.ended.has(signIn)) problems.push(`${what} ended another sign-in`);",
     "if (!except.has(signIn) && !before.ended.has(signIn) && except.size < 0) problems.push(`${what} ended another sign-in`);", "judge",
     "refuses a registration that changed, made or ended another sign-in"),
    ("J06 the judge takes a cacheable 204", JUDGE,
     '  if (answer.headers["cache-control"] !== "private, no-store")\n', '  if (answer.headers["cache-control"] === "never")\n', "judge",
     "refuses a body, a type, another status or a stale Date"),
    ("J07 the judge ends a removal again", JUDGE,
     "  const ended = before.ended.get(signIn) ?? micros(now);\n  if (after.ended.get(signIn) !== ended) problems.push(\"the removed",
     "  const ended = micros(now);\n  if (after.ended.get(signIn) !== ended) problems.push(\"the removed", "judge",
     "passes a removal that deleted the registration and ended the sign-in at the instant, or kept its first end"),
    ("J08 the judge's registration in microseconds", JUDGE,
     "    registered_at: seconds(now),", "    registered_at: micros(now),", "judge",
     "wants the registration as stored, in whole seconds"),
    # Through the app, every role: another account's secret registering (D11) is caught by the matrix's table too.
    ("X01 another account's secret not refused, through the matrix", DOMAIN,
     'if (own !== undefined && own["user_id"] !== input.userId) throw', 'if (own === null) throw', "matrix",
     "answers the author as its account and its row say"),
    # Round 1 of the review (the second commit).
    ("D21 ending a sign-in waits on another command's purge", DOMAIN,
     "    SELECT pg_catalog.decode(${signIn}, 'hex'), ${now}::pg_catalog.timestamptz\n"
     "     WHERE NOT EXISTS (SELECT FROM app.device_sign_ins_ended WHERE sign_in = pg_catalog.decode(${signIn}, 'hex'))\n",
     "    VALUES (pg_catalog.decode(${signIn}, 'hex'), ${now}::pg_catalog.timestamptz)\n", "db",
     "ends a sign-in whose old row another command's purge is deleting, without waiting for that purge"),
    ("M07 the registration guard without the sign-in's lock", MIGRATION,
     "BEGIN\n  -- The sign-in's lock, which the command holds already (the header's order).\n"
     "  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(\n"
     "    'tadayo.device.sign-in:' OPERATOR(pg_catalog.||) pg_catalog.encode(NEW.sign_in, 'hex'), 0));\n  PERFORM FROM app.users",
     "BEGIN\n  PERFORM FROM app.users", "db",
     "lets no registration and ending of one sign-in, written at once without the commands' lock"),
    ("M08 the ending guard without the sign-in's lock", MIGRATION,
     "  -- At the commit, the sign-in's lock, which the command holds already: a registration of it written\n"
     "  -- at once by a writer without the lock holds it to its own commit, and is then seen here.\n"
     "  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(\n"
     "    'tadayo.device.sign-in:' OPERATOR(pg_catalog.||) pg_catalog.encode(NEW.sign_in, 'hex'), 0));\n"
     "  IF EXISTS (SELECT FROM app.device_registrations WHERE sign_in = NEW.sign_in) THEN",
     "  IF EXISTS (SELECT FROM app.device_registrations WHERE sign_in = NEW.sign_in) THEN", "db",
     "lets no registration and ending of one sign-in, written at once without the commands' lock"),
    ("X02 a move from another account leaves its registration, through the matrix", DOMAIN,
     "    await bound(tx)`DELETE FROM app.device_registrations WHERE sign_in = pg_catalog.decode(${holder}, 'hex')`;",
     "    await bound(tx)`DELETE FROM app.device_registrations WHERE sign_in = pg_catalog.decode(${holder}, 'hex') AND user_id = ${input.userId}`;",
     "matrix", "answers the author as its account and its row say"),
    ("R07 the token's field not redacted", LOGGING,
     '  "apns_token",\n', "", "logging",
     "names the fields T52 lists"),
]

def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True)


def fresh():
    """A new cluster, bootstrapped: a migration once applied can't change, so each migration breakage needs one."""
    r = subprocess.run(["bash", SP + "/s4/pgci.sh"], env=ENV, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-500:]
    r = run(["python3", "tools/ci/ci_steps.py", "db-bootstrap"])
    assert r.returncode == 0, (r.stdout + r.stderr)[-800:]


def swap(text, old, new):
    assert text.count(old) == 1, (old[:70], text.count(old))
    return text.replace(old, new)


def main():
    args = sys.argv[1:]
    codes = [name.split()[0] for name, *_ in B]
    assert len(set(codes)) == len(codes), "a code used twice"
    if args == ["--check"]:
        bad = 0
        for name, path, old, new, suite, words in B:
            text = (ROOT / path).read_text()
            try:
                ok = swap(text, old, new) != text and suite in SUITES and len(words) > 6
            except AssertionError as e:
                ok = False
                print("  ", e)
            if not ok:
                bad += 1
                print("BAD", name)
        print(len(B), "entries,", bad, "bad")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    dirty = False
    for name, path, old, new, suite, words in B:
        code = name.split()[0]
        if args and code not in args:
            continue
        p = ROOT / path
        orig = p.read_text()
        if path == MIGRATION or dirty:
            fresh()
            dirty = path == MIGRATION
        try:
            broken = swap(orig, old, new)
            p.write_text(broken)
            (OUT / f"{code}.patch").write_text(
                "".join(difflib.unified_diff(orig.splitlines(True), broken.splitlines(True), f"a/{path}", f"b/{path}"))
            )
            cwd, cmd = SUITES[suite]
            r = run(cmd, cwd=ROOT / cwd)
            out = r.stdout + r.stderr
            (OUT / f"{code}.txt").write_text(out)
            failed = sorted({l.strip()[2:].strip()[:260] for l in out.splitlines() if l.strip().startswith("×")})
            summary = [l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")]
            caught = any(words[:105] in f for f in failed)
            verdict = "CAUGHT" if caught else ("CAUGHT BY ANOTHER TEST" if failed else ("NO RESULT" if not summary else "NOT CAUGHT"))
            print(f"== {name} [{suite}]: {verdict}; exit {r.returncode} {summary}", flush=True)
            for f in failed[:6]:
                print("    ×", f, flush=True)
            if not summary:
                print("   ", out[-500:].replace("\n", "\n    "), flush=True)
        finally:
            p.write_text(orig)
    print("restored:", repr(run(["git", "status", "--short"]).stdout), flush=True)


if __name__ == "__main__":
    main()
