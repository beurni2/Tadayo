#!/usr/bin/env python3
# Slice 7's deliberate breakages: each patches the worktree, runs the check that must catch it,
# expects it to fail with the given pattern, and restores the file whatever happens.
import os, re, subprocess, sys, hashlib, json
ROOT = "/home/user/tadayo-privacy"
S = "/tmp/claude-0/-home-user-Tadayo/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/privacy"
OUT = f"{S}/breakages"
PRIV = f"bash {S}/privtest.sh"
DB = f"bash {S}/dbtest.sh"
NODE = "export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH; "
API = NODE + f"cd {ROOT}/services/api && npx vitest run"
WORKER = NODE + f"cd {ROOT}/services/worker && npx vitest run"
APP = "services/api/src/app.ts"
SCAN = "tests/src/privacy/scanner.ts"
ROWS = "tests/src/privacy/rows.ts"
MATRIX = "tests/src/privacy/matrix.test.ts"

ROUTE = 'handler: notFound,\n    });\n  }'
def route(answer):
    return ROUTE.replace("handler: notFound,", f"handler: operation.id === \"getDrop\" ? {answer} : notFound,")

B = [
  ("route-403-everyone", [(APP, ROUTE, route("(_request: FastifyRequest, reply: FastifyReply) => reply.code(403).header(\"cache-control\", NO_STORE).type(JSON_TYPE).send('{\"code\":\"PROFILE_INCOMPLETE\"}')"))],
   f"{PRIV} src/privacy/matrix.test.ts", r"getDrop: status 403"),
  ("route-200-everyone", [(APP, ROUTE, route("(_request: FastifyRequest, reply: FastifyReply) => reply.code(200).header(\"cache-control\", NO_STORE).type(JSON_TYPE).send('{}')"))],
   f"{PRIV} src/privacy/matrix.test.ts", r"getDrop: status 200"),
  ("route-not-found-with-field", [(APP, ROUTE, route("(_request: FastifyRequest, reply: FastifyReply) => reply.code(404).header(\"cache-control\", NO_STORE).type(JSON_TYPE).send('{\"code\":\"NOT_FOUND\",\"field\":\"drop_id\"}')"))],
   f"{PRIV} src/privacy/matrix.test.ts", r"getDrop: body"),
  ("route-extra-header", [(APP, ROUTE, route("(request: FastifyRequest, reply: FastifyReply) => notFound(request, reply.header(\"x-drop-state\", \"held\"))"))],
   f"{PRIV} src/privacy/matrix.test.ts", r"an extra header, x-drop-state"),
  ("route-answers-the-audience-differently", [(APP, ROUTE, route(
      "async (request: FastifyRequest, reply: FastifyReply) => { const account = String(request.headers.authorization).replace(\"Bearer matrix-\", \"\"); "
      "const rows = await deps.sql`SELECT 1 FROM app.drop_audience a JOIN app.memberships m ON m.interval_id = a.interval_id "
      "WHERE a.drop_id = ${(request.params as { drop_id: string }).drop_id} AND m.user_id = ${account}`; "
      "return rows.length > 0 ? reply.code(403).header(\"cache-control\", NO_STORE).type(JSON_TYPE).send('{\"code\":\"PROFILE_INCOMPLETE\"}') : notFound(request, reply); }"))],
   f"{PRIV} src/privacy/matrix.test.ts", r"answers the author with"),
  ("framework-errors-removed", [(APP, "    frameworkErrors: (_error, request, reply) => {\n      void notFound(request, reply);\n    },\n", "")],
   f"{API}; {PRIV} src/privacy/matrix.test.ts", r"(414|echoes the value|status 400)"),
  ("framework-errors-given-the-handler", [(APP, "    frameworkErrors: (_error, request, reply) => {\n      void notFound(request, reply);\n    },\n", "    frameworkErrors: notFound as never,\n")],
   f"{PRIV} src/privacy/matrix.test.ts", r"guessed|status 500|neither the neutral"),
  ("not-found-handler-left-as-fastify", [(APP, "  app.setNotFoundHandler(notFound);\n", "")],
   f"{API}; {PRIV} src/privacy/matrix.test.ts", r"Route GET:|Not Found"),
  ("error-handler-echoes-the-message", [(APP, "send('{\"code\":\"INVALID_REQUEST\"}')", "send(JSON.stringify({ code: \"INVALID_REQUEST\", message: error.message }))")],
   API, r"INVALID_REQUEST.*message|message"),
  ("route-added-to-the-app", [(APP, "  app.setNotFoundHandler(notFound);\n", "  app.get(\"/v1/debug\", notFound);\n  app.setNotFoundHandler(notFound);\n")],
   f"{API}; {PRIV} src/privacy/matrix.test.ts", r"GET /v1/debug"),
  ("route-left-out-of-the-app", [(APP, "  for (const operation of OPERATIONS) {\n", "  for (const operation of OPERATIONS.filter((candidate) => candidate.id !== \"getDrop\")) {\n")],
   f"{API}; {PRIV} src/privacy/matrix.test.ts", r"no route for GET /v1/drops/:drop_id"),
  ("row-removed", [(ROWS, "  getDrop: NONE,\n", "")],
   f"{PRIV} src/privacy/harness.test.ts src/privacy/matrix.test.ts", r"getDrop has no row in the privacy matrix"),
  ("row-not-none", [(ROWS, "  getDrop: NONE,\n", "  getDrop: { answer: \"the neutral NOT_FOUND to every role, in every state and phase\" },\n")],
   f"{PRIV} src/privacy/harness.test.ts src/privacy/matrix.test.ts", r"getDrop's row isn't NONE"),
  ("manipulation-step-not-run", [(MATRIX, "              record(await manipulationStep(app, spec, cell.w.ben.user, CLAIMED));\n", "")],
   f"{PRIV} src/privacy/matrix.test.ts", r"expected \d+ to be \d+|AssertionError"),
  ("guess-step-not-run", [(MATRIX, "            const guessed = await guessStep(app, spec, elsewhere);\n", "            const guessed = { problems: [], answers: [], malformed: new Map<string, string>() };\n")],
   f"{PRIV} src/privacy/matrix.test.ts", r"expected \d+ to be \d+|AssertionError"),
  ("scanner-token-off-the-key-list", [(SCAN, "|link|token|", "|link|")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-whitelist-widened", [(SCAN, 'optional: ["caption"] }', 'optional: ["caption", "thumbnail_url", "width", "height", "dominant_colour", "blur_hash"] }')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-media-class-pin-removed", [(SCAN, 'if (typeof node.media_class !== "string" || !MEDIA_CLASSES.has(node.media_class)) {', 'if (typeof node.media_class !== "string") {')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-own-card-by-its-author-field", [(SCAN, "if (context.viewer.has(drop.author)) ownCards.add(node);", "if (isObject(node.author) && context.viewer.has(String(node.author.membership_id))) ownCards.add(node);")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-revealed-card-let-through", [(SCAN, 'if (node.view === "revealed" && !revealed(context, drop.day)) {', 'if (node.view === "revealed" && !revealed(context, drop.day) && Math.random() > 2) {')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-revealed-day-let-through", [(SCAN, 'if (typeof occurrence !== "string" || !revealed(context, occurrence)) {', 'if (typeof occurrence !== "string") {')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-audience-check-removed", [(SCAN, "if (![...drop.audience].some((interval) => context.viewer.has(interval))) {", "if (drop.audience.size < 0) {")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-people-text-not-compared", [(SCAN, 'if (!context.world.texts.has(value)) find("values", at, "text people wrote that the world didn\'t store");', "")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-caption-not-compared", [(SCAN, 'if ((node.caption ?? null) !== drop.caption) find("world", `${at}.caption`, "not the drop\'s own caption");', "")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-header-list-widened", [(SCAN, '"date", "connection", "keep-alive"]);', '"date", "connection", "keep-alive", "etag", "x-media-version"]);')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-image-let-through", [(SCAN, "  } else {\n    if (answer.headers[\"content-type\"] !== \"application/json; charset=utf-8\") {", "  } else if (!(answer.headers[\"content-type\"] ?? \"\").startsWith(\"image/\")) {\n    if (answer.headers[\"content-type\"] !== \"application/json; charset=utf-8\") {")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-content-type-check-removed", [(SCAN, "    if (answer.headers[\"content-type\"] !== \"application/json; charset=utf-8\") {", "    if (answer.headers[\"content-type\"] === \"never\") {")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-canaries-not-checked", [(SCAN, "      if (value.includes(canary)) find(\"values\", `header ${header}`, \"a value the world keeps back\");", "")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("api-environment-defaults-to-prod", [("services/api/src/start.ts", 'env.TADAYO_ENVIRONMENT ?? ""', 'env.TADAYO_ENVIRONMENT ?? "prod"')],
   API, r"not dev or prod"),
  ("worker-environment-defaults-to-prod", [("services/worker/src/start.ts", 'env.TADAYO_ENVIRONMENT ?? ""', 'env.TADAYO_ENVIRONMENT ?? "prod"')],
   WORKER, r"not dev or prod"),
  ("api-entry-prints-the-error-object", [("services/api/src/main.ts", 'process.stderr.write(`${error instanceof Error ? error.message : "api: failed to start"}\\n`);', "console.error(error);")],
   API, r"marker"),
  ("worker-entry-prints-the-error-object", [("services/worker/src/main.ts", 'process.stderr.write(`${error instanceof Error ? error.message : "worker: failed to start"}\\n`);', "console.error(error);")],
   WORKER, r"marker"),
  ("api-connection-without-instant-type", [("services/api/src/connection.ts", "postgres(url, { types: { instant: INSTANT_TYPE } })", "postgres(url) as unknown as ApiSql")],
   f"{DB} src/db/connection.test.ts", r"the API's"),
  ("worker-connection-without-instant-type", [("services/worker/src/connection.ts", "postgres(url, { types: { instant: INSTANT_TYPE } })", "postgres(url) as unknown as WorkerSql")],
   f"{DB} src/db/connection.test.ts", r"the worker's"),
]

def digest():
    out = subprocess.run(["git", "diff", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout
    untracked = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], cwd=ROOT, capture_output=True, text=True).stdout
    h = hashlib.sha256(out.encode())
    for path in sorted(untracked.split()):
        with open(os.path.join(ROOT, path), "rb") as f: h.update(path.encode() + f.read())
    return h.hexdigest()

only = sys.argv[1:]
before = digest()
results = []
for index, (name, patches, command, pattern) in enumerate(B, 1):
    if only and name not in only: continue
    saved = {}
    try:
        for path, old, new in patches:
            full = os.path.join(ROOT, path)
            text = saved.setdefault(full, open(full).read()) if full not in saved else open(full).read()
            if text.count(old) != 1: raise SystemExit(f"{name}: {path}: the text to patch occurs {text.count(old)} times")
            open(full, "w").write(text.replace(old, new))
        run = subprocess.run(["bash", "-c", command], cwd=ROOT, capture_output=True, text=True, timeout=900)
        output = run.stdout + run.stderr
        caught = run.returncode != 0 and re.search(pattern, output) is not None
    finally:
        for full, text in saved.items(): open(full, "w").write(text)
    lines = [l for l in output.splitlines() if re.search(r"✓|×|FAIL|passed|failed|Error|expected|getDrop|header|GET /v1|marker|not dev|neutral|Tests ", l)]
    with open(f"{OUT}/{index:02d}-{name}.txt", "w") as f:
        f.write(f"breakage: {name}\npatch: {json.dumps([(p, o, n) for p, o, n in patches], indent=1)}\ncommand: {command}\nexit: {run.returncode}\nexpected pattern: {pattern}\ncaught: {caught}\n\n" + "\n".join(lines[:200]) + "\n")
    results.append((index, name, run.returncode, caught))
    print(f"{index:02d} {name}: exit {run.returncode}, caught {caught}", flush=True)
after = digest()
print("worktree restored" if before == after else "WORKTREE CHANGED", flush=True)
with open(f"{OUT}/summary.txt", "w") as f:
    for index, name, code, caught in results: f.write(f"{index:02d} {'CAUGHT' if caught else 'MISSED'} {name} (exit {code})\n")
    f.write("worktree restored\n" if before == after else "WORKTREE CHANGED\n")
