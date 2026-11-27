#!/usr/bin/env python3
"""B8 breakages (docs/plans/api-b2-test-gaps.md section 3): each planted alone in place, run against the tests
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
CONNECTS = "is where every file of the matrix connects"

B = [
    # (name, what, [(path, old, new)], suite, words)
    ("R1", "reserveReceipt's SELECT without the account", [
        (RECEIPT, """    SELECT request_hash, state, response_body FROM app.idempotency_receipts
     WHERE actor_user_id = ${userId} AND operation = ${request.operation}""",
         """    SELECT request_hash, state, response_body FROM app.idempotency_receipts
     WHERE operation = ${request.operation}"""),
    ], CLUB, REPLAYS),
    ("R2", "completeReceipt's UPDATE without the account", [
        (RECEIPT, """           response_body = ${JSON.stringify(body)}::pg_catalog.text::pg_catalog.jsonb
     WHERE actor_user_id = ${userId} AND operation = ${request.operation}""",
         """           response_body = ${JSON.stringify(body)}::pg_catalog.text::pg_catalog.jsonb
     WHERE operation = ${request.operation}"""),
    ], CLUB, REPLAYS),
    ("R3", "update-me's SELECT of the receipt without the account", [
        (UPDATE_ME, "       WHERE actor_user_id = ${userId} AND operation = 'updateMe' AND idempotency_key = ${key}::pg_catalog.uuid`;",
         "       WHERE operation = 'updateMe' AND idempotency_key = ${key}::pg_catalog.uuid`;"),
    ], ME, REPLAYS),
    ("R4", "update-me's UPDATE of the receipt without the account", [
        (UPDATE_ME, "     WHERE actor_user_id = ${userId} AND operation = 'updateMe' AND idempotency_key = ${key}::pg_catalog.uuid\n",
         "     WHERE operation = 'updateMe' AND idempotency_key = ${key}::pg_catalog.uuid\n"),
    ], ME, REPLAYS),
    ("S1", "the card's media class compare removed", [
        (SCAN, """        if (node.media_class !== drop.media) find("world", `${at}.media_class`, "not the drop's own media class");\n""", ""),
    ], SCANNER, MEDIA),
    ("S2", "the reference's media class compare removed", [
        (SCAN, """      if (drop && node.media_class !== undefined && node.media_class !== drop.media)
        find("world", `${at}.media_class`, "not the drop's own media class");\n""", ""),
    ], SCANNER, MEDIA),
    ("S3", "the reservation's media class compare removed", [
        (SCAN, """      if (slot !== undefined && node.media_class !== slot.media)
        find("world", `${at}.media_class`, "not the reservation's own media class");\n""", ""),
    ], SCANNER, MEDIA),
    ("S4", "the active person's avatar version compare removed", [
        (SCAN, """        } else if ((node.avatar_version ?? null) !== (world.accounts.get(member.account)?.avatar ?? null)) {
          find("world", `${at}.avatar_version`, "not the avatar version of the person's own account (FQ74)");
        }""", "        }"),
    ], SCANNER, AVATAR),
    ("D1", "global-setup without the two process.env lines", [
        (SETUP, """  process.env.DATABASE_URL = onDatabase(appUrl, MATRIX_DATABASE);
  process.env.DATABASE_ADMIN_URL = onDatabase(adminUrl, MATRIX_DATABASE);\n""", ""),
    ], OWN_DB, CONNECTS),
    ("D2", "the privacy config back to the database tests' setup", [
        (CONFIG, 'globalSetup: ["src/privacy/global-setup.ts"],', 'globalSetup: ["src/db/global-setup.ts"],'),
    ], OWN_DB, CONNECTS),
]


def run(pkg, args):
    out = tempfile.NamedTemporaryFile(suffix=".json", delete=False, dir=SP).name
    proc = subprocess.run(["npx", "vitest", "run", *args, "--reporter=json", f"--outputFile={out}"],
                          cwd=os.path.join(ROOT, pkg), env=ENV, capture_output=True, text=True, timeout=900)
    try:
        data = json.load(open(out))
    except Exception as error:  # noqa: BLE001
        return proc.returncode, None, [f"no report: {error}", proc.stderr[-400:]]
    finally:
        os.remove(out)
    failed = [t["fullName"] for f in data["testResults"] for t in f["assertionResults"] if t["status"] == "failed"]
    errors = [f["message"][:300] for f in data["testResults"] if f.get("status") == "failed" and not f["assertionResults"]]
    return proc.returncode, data["numFailedTests"], failed + errors


check = "--check" in sys.argv
only = {a for a in sys.argv[1:] if not a.startswith("--")}
results = []
for name, what, edits, (pkg, args), words in B:
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
        code, n, names = run(pkg, args)
    finally:
        for path in paths:
            shutil.copyfile(backups[path], os.path.join(ROOT, path))
    restored = all(open(os.path.join(ROOT, path)).read() == originals[path] for path in paths)
    caught = code != 0 and any(words in item for item in names)
    results.append({"name": name, "what": what, "suite": f"{pkg} {' '.join(args)}", "exit": code, "failed": n,
                    "names": names, "words": words, "caught": caught, "restored": restored})
    print(f"{name}. {what}: {'CAUGHT' if caught else 'MISSED'}{'' if restored else ' (NOT RESTORED)'}", flush=True)
    print(f"   {pkg} {' '.join(args)}: exit {code}, {n} failed: {json.dumps(names)}", flush=True)
if not check:
    json.dump(results, open(os.path.join(SP, "breakages.json"), "w"), indent=1)
