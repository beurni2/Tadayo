#!/usr/bin/env python3
# The pooler pin's deliberate breakages (api/b0-pooler-ca): each one exact change of text in
# packages/domain/src/db/ssl.ts, tools/ops/src/database.ts, environment.ts, run.ts or main.ts, the
# services' connection.ts, or .dockerignore, the tests that must catch it, run with the file changed, a verdict, and the
# file restored whatever happens. A breakage counts as caught only if its command fails AND the output
# holds the words registered for it (the start of a test's own name), so a change that merely breaks
# the build isn't counted.
#
# usage: breakages.py [--check] [--only NAME ...]
#   --check   only count the anchors: each text to change must occur the stated number of times
#   --only    run just these (results.json and summary.txt keep the rest)
# environment: BREAK_ROOT (a detached worktree of the branch's head), BREAK_OUT (where the evidence goes).
import hashlib, json, os, re, subprocess, sys

ROOT = os.environ.get("BREAK_ROOT", "/home/user/tadayo-ca-breakages")
S = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("BREAK_OUT", f"{S}/out")
NODE = "export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH; "


def vitest(folder, *files):
    return NODE + f"cd {ROOT}/{folder} && npx vitest run {' '.join(files)}"


DOMAIN = vitest("packages/domain", "src/db/ssl.test.ts")
API = vitest("services/api", "src/connection.test.ts", "src/connection-tls.test.ts")
WORKER = vitest("services/worker", "src/connection.test.ts")
OPS = vitest("tools/ops", "src/database.test.ts", "src/environment.test.ts", "src/deploy-files.test.ts", "src/run.test.ts", "src/main.test.ts", "src/bootstrap.test.ts")
ALL = [DOMAIN, API, WORKER, OPS]


def one(path, old, new, count=1):
    return (path, old, new, count)


B = []


def m(name, path, old, new, words, count=1):
    B.append((name, [one(path, old, new, count)], ALL, words))


def mm(name, patches, words):
    B.append((name, patches, ALL, words))


SSL = "packages/domain/src/db/ssl.ts"
DB = "tools/ops/src/database.ts"
ENV = "tools/ops/src/environment.ts"
APICONN = "services/api/src/connection.ts"
WORKERCONN = "services/worker/src/connection.ts"

# Test names (their start), as vitest prints them.
PINNED = "is the root Supabase's dashboard gives every project"
ONCE = "is read once and checked: supabaseRootCa gives the file's text"
CHECKED = "is checked when it is read, so a file that isn't the root reaches no link"
PSQL_CHECKED = "checks the root before psql is given its path"
REFUSES = "refuses anything but exactly that one certificate"
TRUSTS = "trusts only the root given, insists on the check, and leaves the name to the driver"
POOLER = "pins Supabase's root for the pooler"
TRANSPORT = "asks for TLS checked against Supabase's root for the pooler"
API_POOLER = "requires TLS checked against Supabase's root for the pooler, though the string says nothing of it"
WORKER_POOLER = "requires TLS checked against Supabase's root for the pooler, though the string says nothing of it, and the string"
OPS_DB = "names every part of the connection, decoded, with TLS checked against Supabase's root"
OPS_ENV = "decodes the user and the password, and asks for TLS that checks the pooler's chain"
TLS_PASS = "sends its StartupMessage, inside TLS"
TLS_IMPOSTOR = "refuses a chain from another root of the same name"
TLS_NAME = "refuses the right root, and a name that isn't the host"
TLS_ALONE = "refuses the leaf alone, without the intermediate it hangs from"
TLS_PLAIN = "never falls back to the clear when the server offers no TLS"
TLS_TWIN = "refuses a chain from another root with the same name and key identifier"
READ_DIFFERENTLY = "treats a string that postgres.js and `new URL` could read differently as remote"
API_DIFFERENTLY = "requires TLS of a string whose host postgres.js and `new URL` read differently"
API_EVERY_HOST = "asks for no TLS only when every host the driver would dial is a loopback one"
OPS_CLIENT = "builds the client every script is given from connectionOptions"
OPS_MAIN = "gives the scripts the pinned client, connectToDev, and makes no client of its own"
OPS_BOOTSTRAP = "runs psql once with the admin's connection in its environment"
REFUSAL = "names the pin's refusal of a certificate by Node's code"
RUN_REFUSAL = "says that the pin refused the server's certificate"
DOCKER_ALLOWLIST = "is an allowlist: everything out, then exactly what the Dockerfile copies"


ROOT_SHA = '"80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA"'
FROZEN = "return Object.freeze({ ca: Object.freeze([pem]), rejectUnauthorized: true });"

# checkPinnedRoot
m("pin-another-fingerprint", SSL, ROOT_SHA, ROOT_SHA.replace("FA\"", "FB\""), PINNED)
RE = r"/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----(\r?\n)?$/"
m("check-any-text-between", SSL, RE, RE.replace("[A-Za-z0-9+/=\\r\\n]+", "[\\s\\S]+"), REFUSES)
m("check-unanchored-start", SSL, RE, RE.replace("/^", "/"), REFUSES)
m("check-unanchored-end", SSL, RE, RE.replace("$/", "/"), REFUSES)
m("check-any-label", SSL, RE, RE.replace("BEGIN CERTIFICATE", "BEGIN [A-Z ]*CERTIFICATE").replace("END CERTIFICATE", "END [A-Z ]*CERTIFICATE"), REFUSES)
m("check-shape-skipped", SSL, "if (!ONE_CERTIFICATE.test(pem)) throw", "if (false) throw", REFUSES)
m("check-takes-any-fingerprint", SSL, "if (fingerprint !== SUPABASE_ROOT_CA_SHA256) throw", "if (false) throw", REFUSES)
m("check-takes-a-same-named-root", SSL, "if (fingerprint !== SUPABASE_ROOT_CA_SHA256) throw",
  'if (!new X509Certificate(pem).subject.includes("Supabase Root 2021 CA")) throw', REFUSES)
m("check-takes-what-isnt-a-certificate", SSL, 'throw refused("it doesn\'t read as a certificate");', "return;", REFUSES)
m("check-never-throws", SSL, "export function checkPinnedRoot(pem: string): void {",
  "export function checkPinnedRoot(pem: string): void {\n  if (pem !== null) return;", REFUSES)
# supabaseRootCa
m("root-read-unchecked", SSL, "    checkPinnedRoot(pem);\n    root = pem;", "    root = pem;", CHECKED)
m("root-never-kept", SSL, "    root = pem;\n", "", ONCE)
m("root-empty", SSL, "    root = pem;\n  }\n  return root;", "    root = pem;\n  }\n  return \"\";", ONCE)
# tlsPinnedTo
m("pin-not-insisted", SSL, FROZEN, "return Object.freeze({ ca: Object.freeze([pem]), rejectUnauthorized: false as true });", TRUSTS)
m("pin-left-to-the-environment", SSL, FROZEN, "return Object.freeze({ ca: Object.freeze([pem]) }) as PinnedTls;", TRUSTS)
m("pin-names-its-own-servername", SSL, FROZEN,
  'return Object.freeze({ ca: Object.freeze([pem]), rejectUnauthorized: true, servername: "localhost" }) as PinnedTls;', TRUSTS)
m("pin-skips-the-name", SSL, FROZEN,
  "return Object.freeze({ ca: Object.freeze([pem]), rejectUnauthorized: true, checkServerIdentity: () => undefined }) as PinnedTls;", TRUSTS)
m("pin-unfrozen", SSL, FROZEN, "return { ca: Object.freeze([pem]), rejectUnauthorized: true };", TRUSTS)
m("pin-roots-unfrozen", SSL, FROZEN, "return Object.freeze({ ca: [pem], rejectUnauthorized: true });", TRUSTS)
m("pin-no-root", SSL, FROZEN, "return Object.freeze({ ca: Object.freeze([] as string[]), rejectUnauthorized: true });", TRUSTS)
m("pin-root-as-text", SSL, FROZEN, "return Object.freeze({ ca: pem as unknown as string[], rejectUnauthorized: true });", TRUSTS)
mm("pin-widened-by-the-system-store", [
  one(SSL, 'import { readFileSync } from "node:fs";', 'import { readFileSync } from "node:fs";\nimport { rootCertificates } from "node:tls";'),
  one(SSL, FROZEN, "return Object.freeze({ ca: Object.freeze([pem, ...rootCertificates]), rejectUnauthorized: true });"),
], TRUSTS)
# poolerTls and transportOptions
m("pooler-pinned-twice", SSL, "return tlsPinnedTo(supabaseRootCa());", "return tlsPinnedTo(supabaseRootCa() + supabaseRootCa());", POOLER)
m("transport-encrypted-only", SSL, "return isPlainLoopback(url) ? {} : { ssl: poolerTls() };",
  'return isPlainLoopback(url) ? {} : { ssl: "require" as never };', TRANSPORT)
m("transport-none", SSL, "return isPlainLoopback(url) ? {} : { ssl: poolerTls() };", "return {};", TRANSPORT)
m("transport-loose", SSL, "return isPlainLoopback(url) ? {} : { ssl: poolerTls() };",
  "return isPlainLoopback(url) ? {} : { ssl: { ...poolerTls(), rejectUnauthorized: false as true } };", TRANSPORT)
# the services and ops
m("api-no-transport", APICONN, ", ...transportOptions(url) }", " }", API_POOLER)
m("api-encrypted-only", APICONN, ", ...transportOptions(url) }", ', ssl: "require" as const }', API_POOLER)
m("worker-no-transport", WORKERCONN, ", ...transportOptions(url) }", " }", WORKER_POOLER)
m("worker-encrypted-only", WORKERCONN, ", ...transportOptions(url) }", ', ssl: "require" as const }', WORKER_POOLER)
m("ops-encrypted-only", DB, "ssl: poolerTls(),", 'ssl: "require",', OPS_DB)
m("ops-no-tls", DB, "    ssl: poolerTls(),\n", "", OPS_DB)
m("ops-loose", DB, "ssl: poolerTls(),", "ssl: { ...poolerTls(), rejectUnauthorized: false as true },", OPS_DB)
m("psql-encrypted-only", ENV, 'PGSSLMODE: "verify-full",', 'PGSSLMODE: "require",', OPS_ENV)
m("psql-chain-not-name", ENV, 'PGSSLMODE: "verify-full",', 'PGSSLMODE: "verify-ca",', OPS_ENV)
m("psql-no-root", ENV, "    PGSSLROOTCERT: rootFile(),\n", "", OPS_ENV)
m("psql-system-roots", ENV, "PGSSLROOTCERT: rootFile(),", 'PGSSLROOTCERT: "system",', OPS_ENV)
m("psql-root-unchecked", ENV, "  supabaseRootCa();\n  return SUPABASE_ROOT_CA_PATH;", "  return SUPABASE_ROOT_CA_PATH;", PSQL_CHECKED)
# round 1's fixes: the hosts as postgres.js reads them, the ops call sites, the refusal's words
m("loopback-reads-hosts-as-url-does", SSL, '    if (decodeURIComponent(hosts.slice(hosts.indexOf("@") + 1)).includes(",")) return false;\n', "", READ_DIFFERENTLY)
m("loopback-hosts-stop-at-fragment", SSL, 'const hosts = url.slice(url.indexOf("://") + 3).split(/[?/]/)[0] ?? "";',
  'const hosts = url.slice(url.indexOf("://") + 3).split(/[?/#]/)[0] ?? "";', READ_DIFFERENTLY)
m("loopback-two-at-allowed", SSL, '  if (authority.indexOf("@") !== authority.lastIndexOf("@")) return false;\n', "", READ_DIFFERENTLY)
m("ops-client-encrypted-only", DB, "  return postgres(connectionOptions(url, redact, write));",
  '  return postgres({ ...connectionOptions(url, redact, write), ssl: "require" });', OPS_CLIENT)
mm("ops-main-own-client", [
  one("tools/ops/src/main.ts", 'import { connectToDev } from "./database.ts";', 'import postgres from "postgres";\nimport { connectionOptions } from "./database.ts";'),
  one("tools/ops/src/main.ts", "connect: (url) =>\n      connectToDev(url, redact, (line) => {\n        console.error(line);\n      }),",
      "connect: (url) =>\n      postgres({ ...connectionOptions(url, redact, (line) => {\n        console.error(line);\n      }), ssl: \"require\" }),"),
], OPS_MAIN)
m("ops-bootstrap-encrypted-only", "tools/ops/src/run.ts", "pgEnv: pgEnvOf(admin),", 'pgEnv: { ...pgEnvOf(admin), PGSSLMODE: "require" },', OPS_BOOTSTRAP)
m("ops-bootstrap-system-roots", "tools/ops/src/run.ts", "pgEnv: pgEnvOf(admin),", 'pgEnv: { ...pgEnvOf(admin), PGSSLROOTCERT: "system" },', OPS_BOOTSTRAP)
m("refusal-never-recognised", DB, "  if (typeof code !== \"string\" || !REFUSED_CERTIFICATE.has(code)) return undefined;",
  "  if (typeof code === \"string\" || !REFUSED_CERTIFICATE.has(String(code))) return undefined;", REFUSAL)
m("refusal-not-said", "tools/ops/src/run.ts", "      const refusal = certificateRefusal(error);", "      const refusal = undefined as string | undefined;", RUN_REFUSAL)
m("refusal-without-code", DB, "Supabase's root (${code}), so", "Supabase's root, so", REFUSAL)
# round 2's fixes: the root read once, the codes a refused handshake really gives, the image's root
m("root-read-each-time", SSL, "  if (root === undefined) {\n    const pem", "  {\n    const pem", ONCE)
m("refusal-misses-another-root", DB, '  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",\n', "", REFUSAL)
m("refusal-misses-a-twin-root", DB, '  "CERT_SIGNATURE_FAILURE",\n', "", REFUSAL)
m("refusal-misses-unspecified", DB, '  "UNSPECIFIED",\n', "", REFUSAL)
m("image-root-shut-out-again", ".dockerignore", "**/*.test.ts\n**/node_modules", "**/*.crt\n**/*.test.ts\n**/node_modules", DOCKER_ALLOWLIST)

def digest():
    out = subprocess.run(["git", "diff", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout
    untracked = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], cwd=ROOT, capture_output=True, text=True).stdout
    h = hashlib.sha256(out.encode())
    for path in sorted(untracked.split()):
        with open(os.path.join(ROOT, path), "rb") as f:
            h.update(path.encode() + f.read())
    return h.hexdigest()


def caught(output, code, words):
    if code == 0:
        return False
    if words.startswith("re:"):
        return re.search(words[3:], output) is not None
    return words in output


def main(argv):
    check = "--check" in argv
    only = []
    if "--only" in argv:
        only = argv[argv.index("--only") + 1:]
    names = [b[0] for b in B]
    if len(set(names)) != len(names):
        raise SystemExit("duplicate names: " + ", ".join(sorted({n for n in names if names.count(n) > 1})))
    if check:
        bad = 0
        for name, patches, _commands, _words in B:
            texts = {}
            for path, old, new, count in patches:
                text = texts.get(path) or open(os.path.join(ROOT, path)).read()
                if text.count(old) != count:
                    bad += 1
                    print(f"{name}: {path}: the text occurs {text.count(old)} times, not {count}: {old[:70]!r}")
                texts[path] = text.replace(old, new)
        print(f"{len(B)} breakages, {bad} anchors wrong")
        return 1 if bad else 0
    os.makedirs(OUT, exist_ok=True)
    before = digest()
    results = []
    for index, (name, patches, commands, words) in enumerate(B, 1):
        if only and name not in only:
            continue
        saved = {}
        try:
            for path, old, new, count in patches:
                full = os.path.join(ROOT, path)
                if full not in saved:
                    saved[full] = open(full).read()
                text = open(full).read()
                if text.count(old) != count:
                    raise SystemExit(f"{name}: {path}: the text to change occurs {text.count(old)} times, not {count}")
                open(full, "w").write(text.replace(old, new))
            output, code = "", 0
            for command in commands:
                run = subprocess.run(["bash", "-c", command], cwd=ROOT, capture_output=True, text=True, timeout=1200)
                output += run.stdout + run.stderr
                code = code or (1 if run.returncode != 0 else 0)
        finally:
            for full, text in saved.items():
                open(full, "w").write(text)
        verdict = caught(output, code, words)
        keep = [l for l in output.splitlines() if re.search(r"×|FAIL|Test Files|Tests |Error|expected|AssertionError", l)]
        with open(f"{OUT}/{index:03d}-{name}.txt", "w") as f:
            f.write(
                f"breakage: {name}\npatch: {json.dumps([(p, o, n, c) for p, o, n, c in patches], indent=1)}\n"
                f"command: {' ; '.join(commands)}\nexit: {code}\nexpected words: {words}\ncaught: {verdict}\n\n"
                + "\n".join(keep[:200]) + "\n"
            )
        results.append((index, name, code, verdict))
        print(f"{index:03d} {name}: exit {code}, caught {verdict}", flush=True)
    after = digest()
    print("worktree restored" if before == after else "WORKTREE CHANGED", flush=True)
    store = f"{OUT}/results.json"
    merged = json.load(open(store)) if os.path.exists(store) else {}
    for index, name, code, verdict in results:
        merged[name] = {"index": index, "exit": code, "caught": verdict}
    json.dump(merged, open(store, "w"), indent=1, sort_keys=True)
    with open(f"{OUT}/summary.txt", "w") as f:
        for name, r in sorted(merged.items(), key=lambda item: item[1]["index"]):
            f.write(f"{r['index']:03d} {'CAUGHT' if r['caught'] else 'MISSED'} {name} (exit {r['exit']})\n")
        f.write("worktree restored\n" if before == after else "WORKTREE CHANGED\n")
    return 0 if before == after else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
