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
HARNESS = "tests/src/privacy/harness.ts"

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
   f"{PRIV} src/privacy/matrix.test.ts", r"reply.code is not a function"),
  ("not-found-handler-left-as-fastify", [(APP, "  app.setNotFoundHandler(notFound);\n", "")],
   f"{PRIV} src/privacy/matrix.test.ts", r"a/b.{0,6}: status 404"),  # the matrix's raw-slash guess reaches the not-found handler
  ("error-handler-echoes-the-message", [(APP, "send(INVALID_BODY)", "send(JSON.stringify({ code: \"INVALID_REQUEST\", message: error.message }))")],
   API, r"INVALID_REQUEST.*message|message"),
  ("route-added-to-the-app", [(APP, "  app.setNotFoundHandler(notFound);\n", "  app.get(\"/v1/debug\", notFound);\n  app.setNotFoundHandler(notFound);\n")],
   f"{API}; {PRIV} src/privacy/matrix.test.ts", r"GET /v1/debug"),
  ("route-left-out-of-the-app", [(APP, "  for (const operation of OPERATIONS) {\n", "  for (const operation of OPERATIONS.filter((candidate) => candidate.id !== \"getDrop\")) {\n")],
   f"{API}; {PRIV} src/privacy/matrix.test.ts", r"no route for GET /v1/drops/:drop_id"),  # after matrix.test checks routeProblems first
  ("row-removed", [(ROWS, "  getDrop: NONE,\n", "")],
   f"{PRIV} src/privacy/harness.test.ts src/privacy/matrix.test.ts", r"getDrop has no row in the privacy matrix"),
  ("row-not-none", [(ROWS, "  getDrop: NONE,\n", "  getDrop: { answer: \"the neutral NOT_FOUND to every role, in every state and phase\" },\n")],
   f"{PRIV} src/privacy/harness.test.ts src/privacy/matrix.test.ts", r"getDrop's row isn't NONE"),
  ("manipulation-step-not-run", [(MATRIX, "              record(await manipulationStep(app, spec, cell.w.ben.interval, CLAIMED));\n", "")],
   f"{PRIV} src/privacy/matrix.test.ts", r"expected \d+ to be \d+|AssertionError"),
  ("guess-step-not-run", [(MATRIX, "            const guessed = await guessStep(app, spec, elsewhere);\n", "            const guessed = { problems: [], answers: [], malformed: new Map<string, string>() };\n")],
   f"{PRIV} src/privacy/matrix.test.ts", r"expected \d+ to be \d+|AssertionError"),
  ("scanner-token-off-the-key-list", [(SCAN, "|link|token|", "|link|")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-whitelist-widened", [(SCAN, 'optional: ["caption"] }', 'optional: ["caption", "thumbnail_url", "width", "height", "dominant_colour", "blur_hash"] }')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-media-class-pin-removed", [(SCAN, 'if (typeof node.media_class !== "string" || !MEDIA_CLASSES.has(node.media_class)) {', 'if (typeof node.media_class !== "string") {')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-own-card-by-its-author-field", [(SCAN, "if (reader.own(drop)) ownCards.add(node);", "if (isObject(node.author) && context.viewer.intervals.has(String(node.author.membership_id))) ownCards.add(node);")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-revealed-card-let-through", [(SCAN, 'if (node.view === "revealed" && !reader.opened(drop.day)) {', 'if (node.view === "revealed" && !reader.opened(drop.day) && Math.random() > 2) {')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-revealed-day-let-through", [(SCAN, 'if (node.stage === "revealed" && !reader.opened(day))', 'if (node.stage === "revealed" && !reader.opened(day) && Math.random() > 2)')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-audience-check-removed", [(SCAN, "} else if (!reader.inAudience(drop)) {", "} else if (Math.random() > 2) {")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-people-text-not-compared", [(SCAN, 'if (!reader.texts.has(value)) find("values", at, "text people wrote that isn\'t the viewer\'s to read");', "")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-caption-not-compared", [(SCAN, '        if ((node.caption ?? null) !== drop.caption) find("world", `${at}.caption`, "not the drop\'s own caption");\n', "")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-header-list-widened", [(SCAN, '"date", "connection", "keep-alive"]);', '"date", "connection", "keep-alive", "etag", "x-media-version"]);')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-image-let-through", [(SCAN, "  } else {\n    if (answer.headers[\"content-type\"] !== \"application/json; charset=utf-8\") {", "  } else if (!(answer.headers[\"content-type\"] ?? \"\").startsWith(\"image/\")) {\n    if (answer.headers[\"content-type\"] !== \"application/json; charset=utf-8\") {")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-content-type-check-removed", [(SCAN, "    if (answer.headers[\"content-type\"] !== \"application/json; charset=utf-8\") {", "    if (answer.headers[\"content-type\"] === \"never\") {")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-header-canaries-not-checked", [(SCAN, "if (value.includes(canary) && !reader.shown(drops))\n        find(\"values\", `header ${header}`", "if (Math.random() > 2)\n        find(\"values\", `header ${header}`")],
   f"{PRIV} src/privacy/scanner.test.ts", r"values header date"),
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
  ("scanner-body-canaries-not-checked", [(SCAN, "if (value.includes(canary) && !reader.shown(drops)) find(\"values\", at,", "if (Math.random() > 2) find(\"values\", at,")],
   f"{PRIV} src/privacy/scanner.test.ts", r"next_cursor"),
  ("not-found-handler-left-as-fastify-app-test", [(APP, "  app.setNotFoundHandler(notFound);\n", "")],
   API, r"Route (GET|DELETE|PATCH|HEAD|OPTIONS):|Not Found"),
  # Slice 7's review fixes, at the commit that records PR #27's review.
  ("scanner-person-of-any-club", [(SCAN, 'if (!reader.clubs.has(member.club)) find("world", at, "a person of a club', 'if (Math.random() > 2) find("world", at, "a person of a club')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-person-name-not-compared", [(SCAN, 'if (node.display_name !== member.name) find(', 'if (Math.random() > 2) find(')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-day-of-any-club", [(SCAN, 'if (!reader.clubs.has(day.club)) find(', 'if (Math.random() > 2) find(')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-club-of-anyone", [(SCAN, 'if (!reader.clubs.has(id)) find(', 'if (Math.random() > 2) find(')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-drop-references-not-read", [(SCAN, "const reference = kind === undefined ? undefined : REFERENCES[kind];", "const reference = kind === undefined || Math.random() < 2 ? undefined : REFERENCES[kind];")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-own-reference-taken-as-readable", [(SCAN, 'if (!reader.own(drop)) find("world", where, `someone else', 'if (!reader.readable(drop)) find("world", where, `someone else')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-reference-before-the-reveal", [(SCAN, 'if (reference.form === "opened" && !reader.opened(drop.day))', 'if (reference.form === "opened" && !reader.opened(drop.day) && Math.random() > 2)')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-who-reacted-to-anyone", [(SCAN, "if (!Array.isArray(node.reactions) || reader.own(drop)) return;", "return;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-error-fields-not-checked", [(SCAN, 'if (key !== "code" && !fields.includes(key))', 'if (Math.random() > 2)')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-404-body-checked-only-on-the-skeleton", [(SCAN, "if (answer.status === 404 && answer.body !== NEUTRAL_BODY)", "if (skeleton404 && answer.body !== NEUTRAL_BODY)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-retry-after-not-required", [(SCAN, "  if (answer.status === 429) {\n", "  if (answer.status === 429 && Math.random() > 2) {\n")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-empty-answer-any-cache-control", [(SCAN, 'answer.body === "" ? cacheControl !== undefined && cacheControl !== NO_STORE :', 'answer.body === "" ? false :')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-kept-back-values-always-shown", [(SCAN, "      return found !== undefined && readable(found) && opened(found.day);", "      return found !== undefined;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-kept-back-values-to-any-viewer", [(SCAN, "      return found !== undefined && readable(found) && opened(found.day);", "      return found !== undefined && opened(found.day);")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-names-from-every-club", [(SCAN, "if (member.name !== null && clubs.has(member.club)) texts.add(member.name);", "if (member.name !== null) texts.add(member.name);")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-captions-whatever-the-audience", [(SCAN, "    if (!readable(found)) continue;\n", "")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-day-references-not-read", [(SCAN, "  const found: [unknown, string][] = [];\n  if (isObject(node.drop))", "  const found: [unknown, string][] = [];\n  if (Math.random() < 2) return found;\n  if (isObject(node.drop))")],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-every-highlight-key-skipped", [(SCAN, 'if (NEVER_KEY.test(key) && walked.names.get(path) !== "HighlightPointer")', 'if (NEVER_KEY.test(key) && key !== "highlight")')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("scanner-highlight-entry-author-not-compared", [(SCAN, 'if (kind === "HighlightEntry" && isObject(node.author) && node.author.membership_id !== drop.author)', 'if (Math.random() > 2)')],
   f"{PRIV} src/privacy/scanner.test.ts", r"FAIL"),
  ("harness-optional-ids-not-sent", [(HARNESS, "return [...queries, ...filled].map(", "return [...queries].map(")],
   f"{PRIV} src/privacy/harness.test.ts", r"FAIL"),
  ("harness-cursor-not-guessed", [(HARNESS, "  if (pages(spec.operation)) {\n", "  if (pages(spec.operation) && Math.random() > 2) {\n")],
   f"{PRIV} src/privacy/harness.test.ts", r"FAIL"),
  ("harness-malformed-not-sent-beside-other-ids", [(HARNESS, "      if (others.length === 0) continue;\n", "      continue;\n")],
   f"{PRIV} src/privacy/harness.test.ts", r"FAIL"),
  ("harness-signed-out-answers-not-compared", [(HARNESS, "      else if (text !== first)\n", "      else if (Math.random() > 2)\n")],
   f"{PRIV} src/privacy/harness.test.ts", r"another answer for fresh ids"),
  ("harness-media-headers-not-sent", [(HARNESS, '    { ...spec, headers: { ...spec.headers, "if-none-match": "*" } },\n    { ...spec, headers: { ...spec.headers, range: "bytes=0-0" } },\n', "")],
   f"{PRIV} src/privacy/harness.test.ts", r"FAIL"),
  ("matrix-signed-out-step-not-run", [(MATRIX, "          record(await signedOutStep(app, spec, elsewhere));\n", "")],
   f"{PRIV} src/privacy/matrix.test.ts", r"expected \d+ to be \d+|AssertionError"),
  ("api-client-error-handler-left-as-fastify", [(APP, "    clientErrorHandler: clientError,\n", "")],
   API, r"Client Error|Bad Request"),
  ("api-empty-port-taken-as-zero", [("services/api/src/start.ts", "const port = portOf(env.PORT);", "const port = Number(env.PORT ?? \"8080\");")],
   API, r"PORT isn't a port"),
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
        parts = [part.strip() for part in command.split("; bash ")]
        parts = [parts[0]] + ["bash " + part for part in parts[1:]]
        script = "set +e; code=0; " + " ".join(f"( {part} ); [ $? -eq 0 ] || code=1;" for part in parts) + " exit $code"
        run = subprocess.run(["bash", "-c", script], cwd=ROOT, capture_output=True, text=True, timeout=900)
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
store = f"{OUT}/results.json"
merged = json.load(open(store)) if os.path.exists(store) else {}
for index, name, code, caught in results: merged[name] = {"index": index, "exit": code, "caught": caught}
json.dump(merged, open(store, "w"), indent=1, sort_keys=True)
with open(f"{OUT}/summary.txt", "w") as f:
    for name, r in sorted(merged.items(), key=lambda item: item[1]["index"]):
        f.write(f"{r['index']:02d} {'CAUGHT' if r['caught'] else 'MISSED'} {name} (exit {r['exit']})\n")
    f.write("worktree restored\n" if before == after else "WORKTREE CHANGED\n")
