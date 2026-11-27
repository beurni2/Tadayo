#!/usr/bin/env python3
"""B8 breakages, round 1 at the second commit (docs/plans/api-b2-test-gaps.md sections 3 and 5): each planted alone in place, run against the tests
named for it, every touched file restored from its own copy. Caught = the run fails and a failed test's name holds
the registered words."""
import json, os, shutil, subprocess, sys, tempfile

ROOT = "/home/user/tadayo-b8"
SP = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/b8"
ENV = dict(os.environ, PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"],
           DATABASE_URL="postgresql://tadayo_app:tadayo-app-ci-only@localhost:5432/postgres",
           DATABASE_ADMIN_URL="postgresql://supabase_admin:postgres@localhost:5432/postgres")

CLUB = ("tests", ["--config", "vitest.db.config.ts", "src/db/create-club.test.ts"])
ME = ("tests", ["--config", "vitest.db.config.ts", "src/db/update-me.test.ts"])
SCANNER = ("tests", ["--config", "vitest.privacy.config.ts", "src/privacy/scanner.test.ts"])
OWN_DB = ("tests", ["--config", "vitest.privacy.config.ts", "src/privacy/own-database.test.ts"])

RECEIPT = "packages/domain/src/idempotency/receipt.ts"
UPDATE_ME = "packages/domain/src/identity/update-me.ts"
SCAN = "tests/src/privacy/scanner.ts"
SETUP = "tests/src/privacy/global-setup.ts"
CONFIG = "tests/vitest.privacy.config.ts"
REPLAYS = "replays each account's own answer under a key both used"
MEDIA = "catches a media class that isn't its drop's"
AVATAR = "catches an avatar version that isn't the person's own account's"
CONNECTS = "is a copy of the migrated database ci gives"
LEAVE = ("tests", ["--config", "vitest.db.config.ts", "src/db/leave-club.test.ts"])
LEAVE_CLUB = "packages/domain/src/clubs/leave-club.ts"
FORMER = "answers a former member's retry from their own receipt"
ADMIN_PSQL = "postgresql://supabase_admin:postgres@localhost:5432/postgres"

B = [
    # (name, what, [(path, old, new)], suite, words, env, cleanup SQL)
    ("R1", "reserveReceipt's SELECT without the account", [
        (RECEIPT, """    SELECT request_hash, state, response_body FROM app.idempotency_receipts
     WHERE actor_user_id = ${userId} AND operation = ${request.operation}""",
         """    SELECT request_hash, state, response_body FROM app.idempotency_receipts
     WHERE operation = ${request.operation}"""),
    ], CLUB, REPLAYS, None, None),
    ("R2", "completeReceipt's UPDATE without the account", [
        (RECEIPT, """           response_body = ${JSON.stringify(body)}::pg_catalog.text::pg_catalog.jsonb
     WHERE actor_user_id = ${userId} AND operation = ${request.operation}""",
         """           response_body = ${JSON.stringify(body)}::pg_catalog.text::pg_catalog.jsonb
     WHERE operation = ${request.operation}"""),
    ], CLUB, REPLAYS, None, None),
    ("R3", "update-me's SELECT of the receipt without the account", [
        (UPDATE_ME, "       WHERE actor_user_id = ${userId} AND operation = 'updateMe' AND idempotency_key = ${key}::pg_catalog.uuid`;",
         "       WHERE operation = 'updateMe' AND idempotency_key = ${key}::pg_catalog.uuid`;"),
    ], ME, REPLAYS, None, None),
    ("R4", "update-me's UPDATE of the receipt without the account", [
        (UPDATE_ME, "     WHERE actor_user_id = ${userId} AND operation = 'updateMe' AND idempotency_key = ${key}::pg_catalog.uuid\n",
         "     WHERE operation = 'updateMe' AND idempotency_key = ${key}::pg_catalog.uuid\n"),
    ], ME, REPLAYS, None, None),
    ("L1", "leaveClub's read of a former member's receipt without the account", [
        (LEAVE_CLUB, "       WHERE r.actor_user_id = ${userId} AND r.operation = 'leaveClub'",
         "       WHERE r.operation = 'leaveClub'"),
    ], LEAVE, FORMER, None, None),
    ("S1", "the card's media class compare removed", [
        (SCAN, """        if (node.media_class !== drop.media) find("world", `${at}.media_class`, "not the drop's own media class");\n""", ""),
    ], SCANNER, MEDIA, None, None),
    ("S2", "the reference's media class compare removed", [
        (SCAN, """      if (drop && node.media_class !== undefined && node.media_class !== drop.media)
        find("world", `${at}.media_class`, "not the drop's own media class");\n""", ""),
    ], SCANNER, MEDIA, None, None),
    ("S3", "the reservation's media class compare removed", [
        (SCAN, """      else if (node.media_class !== slot.media)
        find("world", `${at}.media_class`, "not the reservation's own media class");\n""", ""),
    ], SCANNER, MEDIA, None, None),
    ("S4", "the active person's avatar version compare removed", [
        (SCAN, """        } else if ((node.avatar_version ?? null) !== account.avatar) {
          find(
            "world",
            `${at}.avatar_version`,
            "not the avatar version of the person's own account (the contract's Person)",
          );
        }""", "        }"),
    ], SCANNER, AVATAR, None, None),
    ("S5", "the avatar compare back to the first commit's, blind to the account's state", [
        (SCAN, """        } else if (account?.state !== "active") {
          if (node.avatar_version !== undefined)
            find("world", `${at}.avatar_version`, "an avatar version of an account that isn't active (spec 23)");
        } else if ((node.avatar_version ?? null) !== account.avatar) {""",
         """        } else if ((node.avatar_version ?? null) !== (account?.avatar ?? null)) {"""),
    ], SCANNER, AVATAR, None, None),
    ("S6", "a reservation the world doesn't have let through", [
        (SCAN, """      if (slot === undefined) find("world", at, "a reservation this world doesn't have");
      else if (node.media_class !== slot.media)""",
         """      if (slot !== undefined && node.media_class !== slot.media)"""),
    ], SCANNER, MEDIA, None, None),
    ("D1", "global-setup without the two process.env lines", [
        (SETUP, """  process.env.DATABASE_URL = onDatabase(appUrl, MATRIX_DATABASE);
  process.env.DATABASE_ADMIN_URL = onDatabase(adminUrl, MATRIX_DATABASE);\n""", ""),
    ], OWN_DB, CONNECTS, None, None),
    ("D2", "the privacy config back to the database tests' setup", [
        (CONFIG, 'globalSetup: ["src/privacy/global-setup.ts"],', 'globalSetup: ["src/db/global-setup.ts"],'),
    ], OWN_DB, CONNECTS, None, None),
    ("D3", "the copy given CREATE for tadayo_app, which the original doesn't give", [
        (SETUP, "    await admin`GRANT CONNECT ON DATABASE ${admin(MATRIX_DATABASE)} TO tadayo_app`;\n",
         "    await admin`GRANT CONNECT ON DATABASE ${admin(MATRIX_DATABASE)} TO tadayo_app`;\n    await admin`GRANT CREATE ON DATABASE ${admin(MATRIX_DATABASE)} TO tadayo_app`;\n"),
    ], OWN_DB, "gives other rights than", None, None),
    ("D4", "D3 with the setup's compare removed", [
        (SETUP, "    await admin`GRANT CONNECT ON DATABASE ${admin(MATRIX_DATABASE)} TO tadayo_app`;\n",
         "    await admin`GRANT CONNECT ON DATABASE ${admin(MATRIX_DATABASE)} TO tadayo_app`;\n    await admin`GRANT CREATE ON DATABASE ${admin(MATRIX_DATABASE)} TO tadayo_app`;\n"),
        (SETUP, """    if (JSON.stringify(copy) !== JSON.stringify(original))
      refuse(`${MATRIX_DATABASE} gives other rights than ${source}: ${copy.join(", ")} against ${original.join(", ")}`);\n""", ""),
    ], OWN_DB, CONNECTS, None, None),
    ("D5", "a time limit of tadayo_app's turned off on the copy alone", [
        (SETUP, "    await admin`GRANT CONNECT ON DATABASE ${admin(MATRIX_DATABASE)} TO tadayo_app`;\n",
         "    await admin`GRANT CONNECT ON DATABASE ${admin(MATRIX_DATABASE)} TO tadayo_app`;\n    await admin`ALTER ROLE tadayo_app IN DATABASE ${admin(MATRIX_DATABASE)} SET lock_timeout = 0`;\n"),
    ], OWN_DB, CONNECTS, None, None),
    ("D6", "a setting of the original's own, which the copy wouldn't keep", [
        (SETUP, "    const [found] = await admin<",
         "    await admin`ALTER ROLE tadayo_app IN DATABASE ${admin(source)} SET lock_timeout = '4s'`;\n    const [found] = await admin<"),
    ], OWN_DB, "has settings of its own", None, "ALTER ROLE tadayo_app IN DATABASE postgres RESET lock_timeout"),
    ("D7", "the admin's URL naming the server by another host", [], OWN_DB, "name different servers",
     {"DATABASE_ADMIN_URL": "postgresql://supabase_admin:postgres@127.0.0.1:5432/postgres"}, None),
]

def run(pkg, args, env=None):
    out = tempfile.NamedTemporaryFile(suffix=".json", delete=False, dir=SP).name
    proc = subprocess.run(["npx", "vitest", "run", *args, "--reporter=json", f"--outputFile={out}"],
                          cwd=os.path.join(ROOT, pkg), env=dict(ENV, **(env or {})), capture_output=True, text=True, timeout=900)
    try:
        data = json.load(open(out))
    except Exception as error:  # noqa: BLE001
        said = [line.strip() for line in (proc.stdout + proc.stderr).splitlines() if "Error" in line or "refused" in line][:3]
        return proc.returncode, None, [f"no report: {type(error).__name__}", *said]
    finally:
        os.remove(out)
    failed = [t["fullName"] for f in data["testResults"] for t in f["assertionResults"] if t["status"] == "failed"]
    errors = [f["message"][:300] for f in data["testResults"] if f.get("status") == "failed" and not f["assertionResults"]]
    if not failed and not errors and proc.returncode != 0:
        # A refusal in the global setup runs no test, so the report holds none: what it said is in the output.
        errors = [f"setup: {line.strip()[:300]}" for line in (proc.stdout + proc.stderr).splitlines() if "Error" in line or "refused" in line][:3]
    return proc.returncode, data["numFailedTests"], failed + errors


check = "--check" in sys.argv
only = {a for a in sys.argv[1:] if not a.startswith("--")}
results = []
for name, what, edits, (pkg, args), words, env, cleanup in B:
    if only and name not in only:
        continue
    paths = sorted({path for path, _, _ in edits})
    for path, old, _ in edits:
        count = open(os.path.join(ROOT, path)).read().count(old)
        assert count == 1, f"{name}: anchor in {path} found {count} times"
    if check:
        print(f"{name}: anchors ok")
        continue
    originals = {path: open(os.path.join(ROOT, path)).read() for path in paths}
    backups = {path: os.path.join(SP, name + "-" + path.replace("/", "_")) for path in paths}
    for path in paths:
        shutil.copyfile(os.path.join(ROOT, path), backups[path])
    try:
        for path, old, new in edits:
            full = os.path.join(ROOT, path)
            text = open(full).read()
            open(full, "w").write(text.replace(old, new))
        code, n, names = run(pkg, args, env)
    finally:
        for path in paths:
            shutil.copyfile(backups[path], os.path.join(ROOT, path))
        if cleanup:
            subprocess.run(["psql", ADMIN_PSQL, "-tAc", cleanup], check=True, capture_output=True)
    restored = all(open(os.path.join(ROOT, path)).read() == originals[path] for path in paths)
    caught = code != 0 and any(words in item for item in names)
    results.append({"name": name, "what": what, "suite": f"{pkg} {' '.join(args)}", "exit": code, "failed": n,
                    "names": names, "words": words, "caught": caught, "restored": restored})
    print(f"{name}. {what}: {'CAUGHT' if caught else 'MISSED'}{'' if restored else ' (NOT RESTORED)'}", flush=True)
    print(f"   {pkg} {' '.join(args)}: exit {code}, {n} failed: {json.dumps(names)}", flush=True)
if not check:
    path = os.path.join(SP, os.environ.get("BREAKAGES_OUT", "breakages2.json"))
    if only and os.path.exists(path):
        kept = [r for r in json.load(open(path)) if r["name"] not in only]
        order = [b[0] for b in B]
        results = sorted(kept + results, key=lambda r: order.index(r["name"]))
    json.dump(results, open(path, "w"), indent=1)
