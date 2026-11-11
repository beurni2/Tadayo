#!/usr/bin/env python3
# Slice 7's deliberate breakages: each patches the worktree, runs the check that must catch it,
# expects it to fail with the given pattern, and restores the file whatever happens.
import os, re, subprocess, sys, hashlib, json
ROOT = os.environ.get("BREAK_ROOT", "/home/user/tadayo-privacy")
S = "/tmp/claude-0/-home-user-Tadayo/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/privacy"
OUT = os.environ.get("BREAK_OUT", f"{S}/breakages")
PRIV = f"bash {S}/" + os.environ.get("BREAK_PRIV", "privtest.sh")
DB = f"bash {S}/" + os.environ.get("BREAK_DB", "dbtest.sh")
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

OWN_ID_IF = (
  "  if ([...reader.ids].some((id) => cursor.includes(id)) || reader.untagged().some((form) => cursor.includes(form.text)))\n"
  "    reasons.push(\"holds an id in its own text\");\n"
)
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
   API, r"× answers a body it can't read with INVALID_REQUEST alone, never the error's message"),
  ("route-added-to-the-app", [(APP, "  app.setNotFoundHandler(notFound);\n", "  app.get(\"/v1/debug\", notFound);\n  app.setNotFoundHandler(notFound);\n")],
   f"{API}; {PRIV} src/privacy/matrix.test.ts", r"GET /v1/debug"),
  ("route-left-out-of-the-app", [(APP, "  for (const operation of OPERATIONS) {\n", "  for (const operation of OPERATIONS.filter((candidate) => candidate.id !== \"getDrop\")) {\n")],
   f"{API}; {PRIV} src/privacy/matrix.test.ts", r"no route for GET /v1/drops/:drop_id"),  # after matrix.test checks routeProblems first
  ("row-removed", [(ROWS, "  getDrop: NONE,\n", "")],
   f"{PRIV} src/privacy/harness.test.ts src/privacy/matrix.test.ts", r"getDrop has no row in the privacy matrix"),
  ("row-not-none", [(ROWS, "  getDrop: NONE,\n", "  getDrop: { answer: \"the neutral NOT_FOUND to every role, in every state and phase\" },\n")],
   f"{PRIV} src/privacy/harness.test.ts src/privacy/matrix.test.ts", r"getDrop's row isn't NONE"),
  ("manipulation-step-not-run", [(MATRIX, "              record(await manipulationStep(app, spec, cell.w.ben.interval, CLAIMED));\n", "")],
   f"{PRIV} src/privacy/matrix.test.ts", r"expected \d+ to be 32963"),
  ("guess-step-not-run", [(MATRIX, "            const guessed = await guessStep(app, spec, elsewhere);\n", "            const guessed = { problems: [], answers: [], malformed: new Map<string, string>() };\n")],
   f"{PRIV} src/privacy/matrix.test.ts", r"expected \d+ to be 32963"),
  ("scanner-token-off-the-key-list", [(SCAN, "|link|token|", "|link|")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches media_token on a caption card"),
  ("scanner-whitelist-widened", [(SCAN, 'optional: ["caption"] }', 'optional: ["caption", "thumbnail_url", "width", "height", "dominant_colour", "blur_hash"] }')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches thumbnail_url on a caption card"),
  ("scanner-media-class-pin-removed", [(SCAN, 'if (typeof node.media_class !== "string" || !MEDIA_CLASSES.has(node.media_class)) {', 'if (typeof node.media_class !== "string") {')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a third media class with the whitelist's own pin"),
  ("scanner-own-card-by-its-author-field", [(SCAN, "if (reader.own(drop)) ownCards.add(node);", "if (isObject(node.author) && context.viewer.intervals.has(String(node.author.membership_id))) ownCards.add(node);")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× judges an own card by the world's author, never by the card's own author field"),
  ("scanner-revealed-card-let-through", [(SCAN, 'if (node.view === "revealed" && !reader.opened(drop.day)) {', 'if (node.view === "revealed" && !reader.opened(drop.day) && Math.random() > 2) {')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a revealed card before its day opens"),
  ("scanner-revealed-day-let-through", [(SCAN, 'if (node.stage === "revealed" && !reader.opened(day))', 'if (node.stage === "revealed" && !reader.opened(day) && Math.random() > 2)')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a revealed day, its highlight entry and a day link to it, before the day opens"),
  ("scanner-audience-check-removed", [(SCAN, "} else if (!reader.inAudience(drop)) {", "} else if (Math.random() > 2) {")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a caption card for a viewer outside the drop's audience"),
  ("scanner-people-text-not-compared", [(SCAN, '      find("values", at, "text people wrote that isn\'t the viewer\'s to read");\n', "")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches text people wrote that the world didn't store"),
  ("scanner-caption-not-compared", [(SCAN, '        if ((node.caption ?? null) !== drop.caption) find("world", `${at}.caption`, "not the drop\'s own caption");\n', "")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a caption swapped from another drop"),
  ("scanner-header-list-widened", [(SCAN, '} else if (header !== "cache-control" && !(header === "retry-after"', '} else if (header !== "cache-control" && header !== "etag" && header !== "x-media-version" && !(header === "retry-after"')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a header no answer may carry yet"),
  ("scanner-image-let-through", [(SCAN, "      if (value !== JSON_TYPE)\n", "      if (value !== JSON_TYPE && !value.startsWith(\"image/\"))\n")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an image body"),
  ("scanner-content-type-check-removed", [(SCAN, "      if (value !== JSON_TYPE)\n", "      if (value === \"never\")\n")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an image body"),
  ("scanner-header-canaries-not-checked", [(SCAN, "    noLinks(value, where);\n    keptBack(value, where);\n", "    noLinks(value, where);\n")],
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
  ("scanner-body-canaries-not-checked", [(SCAN, "      if (value.includes(canary) && !reader.shown(drops)) find(\"values\", at, \"a value the world keeps back (Q07)\");\n    }\n    for (const id of reader.unseen)", "      if (Math.random() > 2) find(\"values\", at, \"a value the world keeps back (Q07)\");\n    }\n    for (const id of reader.unseen)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"next_cursor"),
  ("not-found-handler-left-as-fastify-app-test", [(APP, "  app.setNotFoundHandler(notFound);\n", "")],
   API, r"Route (GET|DELETE|PATCH|HEAD|OPTIONS):|Not Found"),
  # Slice 7's review fixes, at the commit that records PR #27's review.
  ("scanner-person-of-any-club", [(SCAN, 'else if (!reader.clubs.has(member.club))\n        find("world", at, "a person of a club', 'else if (Math.random() > 2)\n        find("world", at, "a person of a club')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a day, its club and its people shown to someone with no interval in the club"),
  ("scanner-person-name-not-compared", [(SCAN, 'if (node.display_name !== member.name) find(', 'if (Math.random() > 2) find(')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a caption swapped from another drop, a wrong name"),
  ("scanner-day-of-any-club", [(SCAN, 'if (!reader.clubs.has(day.club)) find(', 'if (Math.random() > 2) find(')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a day, its club and its people shown to someone with no interval in the club"),
  ("scanner-club-of-anyone", [(SCAN, 'if (!reader.clubs.has(id)) find(', 'if (Math.random() > 2) find(')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a day, its club and its people shown to someone with no interval in the club"),
  ("scanner-drop-references-not-read", [(SCAN, "const reference = kind === undefined ? undefined : REFERENCES[kind];", "const reference = kind === undefined || Math.random() < 2 ? undefined : REFERENCES[kind];")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a highlight entry and a day link's cover for a viewer outside the drop's audience"),
  ("scanner-own-reference-taken-as-readable", [(SCAN, 'if (!reader.own(drop)) find("world", where, `someone else', 'if (!reader.readable(drop)) find("world", where, `someone else')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches someone else's drop where the schema says the viewer's own"),
  ("scanner-reference-before-the-reveal", [(SCAN, 'if (reference.form === "opened" && !reader.opened(drop.day))', 'if (reference.form === "opened" && !reader.opened(drop.day) && Math.random() > 2)')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a revealed day, its highlight entry and a day link to it, before the day opens"),
  ("scanner-who-reacted-to-anyone", [(SCAN, "if (!Array.isArray(node.reactions) || reader.ownActive(drop)) return;", "return;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches who reacted shown to someone but the drop's author"),
  ("scanner-error-fields-not-checked", [(SCAN, 'if (key !== "code" && !fields.includes(key))', 'if (Math.random() > 2)')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an error body with a field its code doesn't carry"),
  ("scanner-404-body-checked-only-on-the-skeleton", [(SCAN, "if (answer.status === 404 && answer.body !== NEUTRAL_BODY)", "if (skeleton404 && answer.body !== NEUTRAL_BODY)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an error body with a field its code doesn't carry"),
  ("scanner-retry-after-not-required", [(SCAN, "  if (answer.status === 429) {\n", "  if (answer.status === 429 && Math.random() > 2) {\n")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an image body, a body without private, no-store, a cacheable 204 and a 429"),
  ("scanner-empty-answer-any-cache-control", [(SCAN, 'answer.body === "" ? cacheControl !== undefined && cacheControl !== NO_STORE :', 'answer.body === "" ? false :')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an image body, a body without private, no-store, a cacheable 204"),
  ("scanner-kept-back-values-always-shown", [(SCAN, "      return found !== undefined && inAudience(found) && opened(found.day);", "      return found !== undefined;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a value the world keeps back, wherever it is, until its drop opens to the viewer"),
  ("scanner-kept-back-values-to-any-viewer", [(SCAN, "      return found !== undefined && inAudience(found) && opened(found.day);", "      return found !== undefined && opened(found.day);")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a value the world keeps back, wherever it is, until its drop opens to the viewer"),
  ("scanner-names-from-every-club", [(SCAN, "    if (knows(id)) texts.add(member.name);", "    texts.add(member.name);")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a day, its club and its people shown to someone with no interval in the club"),
  ("scanner-captions-whatever-the-audience", [(SCAN, "    if (readable(found) && found.caption !== null) texts.add(found.caption);", "    if (found.caption !== null) texts.add(found.caption);")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a caption card for a viewer outside the drop's audience"),
  ("scanner-day-references-not-read", [(SCAN, "  const found: [unknown, string][] = [];\n  if (isObject(node.drop))", "  const found: [unknown, string][] = [];\n  if (Math.random() < 2) return found;\n  if (isObject(node.drop))")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a drop of another day inside a day's object"),
  ("scanner-every-highlight-key-skipped", [(SCAN, 'if (NEVER_KEY.test(key) && walked.names.get(path) !== "HighlightPointer")', 'if (NEVER_KEY.test(key) && key !== "highlight")')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches highlight on a caption card"),
  ("scanner-highlight-entry-author-not-compared", [(SCAN, 'if (kind === "HighlightEntry" && isObject(node.author) && node.author.membership_id !== drop.author)', 'if (Math.random() > 2)')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a highlight entry and a day link's cover for a viewer outside the drop's audience"),
  ("harness-optional-ids-not-sent", [(HARNESS, "return [...queries, ...filled].map(", "return [...queries].map(")],
   f"{PRIV} src/privacy/harness.test.ts", r"× sends each optional Id parameter too"),
  ("harness-cursor-not-guessed", [(HARNESS, "  if (pages(spec.operation)) {\n    for (const value of", "  if (pages(spec.operation) && Math.random() > 2) {\n    for (const value of")],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that answers a cursor or an optional id differently"),
  ("harness-malformed-not-sent-beside-other-ids", [(HARNESS, "      if (others.length === 0) continue;\n", "      continue;\n")],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that looks the parent up before it checks a malformed child"),
  ("harness-signed-out-answers-not-compared", [(HARNESS, "      else if (text !== first)\n", "      else if (Math.random() > 2)\n")],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that tells a signed-out caller which drops exist"),
  ("harness-media-headers-not-sent", [(HARNESS, '    { ...spec, headers: { ...spec.headers, "if-none-match": "*" } },\n    { ...spec, headers: { ...spec.headers, range: "bytes=0-0" } },\n', "")],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that answers differently for If-None-Match"),
  ("matrix-signed-out-step-not-run", [(MATRIX, "          record(await signedOutStep(app, spec, elsewhere));\n", "")],
   f"{PRIV} src/privacy/matrix.test.ts", r"expected \+?\d+ to be 14868"),
  ("api-client-error-handler-left-as-fastify", [(APP, "    clientErrorHandler: clientError,\n", "")],
   API, r"Client Error|Bad Request"),
  ("api-empty-port-taken-as-zero", [("services/api/src/start.ts", "const port = portOf(env.PORT);", "const port = Number(env.PORT ?? \"8080\");")],
   API, r"PORT isn't a port"),
  # PR #27's fresh review (wf_e56a1b20-d51), at the commit that records it.
  ("scanner-opened-forms-to-a-former-author", [(SCAN, "        if (!reader.inAudience(drop))\n          find(\"world\", where, \"a drop whose audience", "        if (!reader.readable(drop))\n          find(\"world\", where, \"a drop whose audience")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a former author's view of their drop's reactions, comments and highlight"),
  ("scanner-who-reacted-to-a-former-author", [(SCAN, "if (!Array.isArray(node.reactions) || reader.ownActive(drop)) return;", "if (!Array.isArray(node.reactions) || reader.own(drop)) return;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a former author's view of their drop's reactions, comments and highlight"),
  ("scanner-comments-to-a-former-author", [(SCAN, "    if (inAudience(found) && opened(found.day)) for (const comment", "    if (readable(found) && opened(found.day)) for (const comment")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a former author's view of their drop's reactions, comments and highlight"),
  ("scanner-club-summary-to-a-former-member", [(SCAN, "        else if (summary && !reader.activeClubs.has(id))", "        else if (summary && Math.random() > 2)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a former member's club as one of theirs"),
  ("scanner-person-who-joined-after-the-viewer-left", [(SCAN, "if (!reader.knows(membership))", "if (Math.random() > 2)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a former member's club as one of theirs, a person who joined after they left"),
  ("scanner-avatar-after-an-interval-ended", [(SCAN, "if ((member.leftAt !== null || !active) && node.avatar_version !== undefined)", "if (Math.random() > 2)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a former member's club as one of theirs, a person who joined after they left, and avatars"),
  ("scanner-allowance-not-bounded", [(SCAN, 'if (typeof count === "number" && count > most)', "if (Math.random() > 2)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches counts the viewer may not see"),
  ("scanner-joined-later-not-checked", [(SCAN, "if (current !== undefined && node.viewer.joined_later !== before(", "if (Math.random() > 2 && node.viewer.joined_later !== before(")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches counts the viewer may not see"),
  ("scanner-is-star-not-checked", [(SCAN, "if (node.viewer.is_star !== mine(theDay.star))", "if (Math.random() > 2)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches counts the viewer may not see"),
  ("scanner-star-not-compared", [(SCAN, "if (star !== day.star) find(", "if (Math.random() > 2) find(")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a day, its club and its people shown to someone with no interval in the club"),
  ("scanner-day-link-to-nothing-readable", [(SCAN, "if (![...world.drops.values()].some((drop) => drop.day === id && reader.inAudience(drop)))", "if (Math.random() > 2)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a highlight entry and a day link's cover for a viewer outside the drop's audience"),
  ("scanner-day-link-before-close", [(SCAN, "if (day !== undefined && before(context.now, day.closeAt))", "if (Math.random() > 2)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a day link to a day that hasn't closed"),
  ("scanner-video-cover", [(SCAN, 'if (cover !== undefined && cover.media !== "photo")', "if (Math.random() > 2)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a day link to a day that hasn't closed, and a cover that isn't a photo"),
  ("scanner-bare-ids-not-read", [(SCAN, '  Reservation: [{ field: "occurrence_id", kind: "day" }],\n  LeftClub: [{ field: "club_id", kind: "club" }],\n  BlockResult: [{ field: "left_club_ids", kind: "club" }],\n', "")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a day or a club outside the viewer's clubs by its bare id"),
  ("scanner-unseen-ids-not-looked-for", [(SCAN, "    for (const id of reader.unseen) {", "    for (const id of [] as string[]) {")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else"),
  ("scanner-reservations-of-others-seen", [(SCAN, "  for (const [id, reservation] of world.reservations) if (!viewer.intervals.has(reservation.interval)) unseen.add(id);\n", "")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else"),
  ("scanner-cursor-not-decoded", [(SCAN, '    if (name === "Cursor") {', '    if (name === "Cursor" && Math.random() > 2) {')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor that is a readable key or hides one"),
  ("scanner-readable-people-text-checked-as-kept-back", [(SCAN, '        continue;\n      }\n      find("values", at, "text people wrote that isn\'t the viewer\'s to read");\n', '      } else find("values", at, "text people wrote that isn\'t the viewer\'s to read");\n')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× passes a caption that holds another drop's link"),
  ("scanner-reason-not-checked", [(SCAN, "  if (answer.reason !== STATUS_CODES[answer.status])", "  if (Math.random() > 2)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a reason phrase that isn't the status's"),
  ("scanner-transport-forms-not-checked", [(SCAN, 'if (problem !== undefined) find("shape", where, problem);', 'if (Math.random() > 2) find("shape", where, problem);')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a reason phrase that isn't the status's, a transport header out of its form"),
  ("scanner-content-length-not-compared", [(SCAN, "if (value !== String(Buffer.byteLength(answer.body)))", "if (Math.random() > 2)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a reason phrase that isn't the status's, a transport header out of its form, a wrong length"),
  ("harness-reason-not-compared", [(HARNESS, "  if (answer.reason !== NEUTRAL.reason) problems.push(", "  if (Math.random() > 2) problems.push(")],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that answers the neutral not-found with another reason phrase"),
  ("harness-reason-not-captured", [(HARNESS, "reason: response.statusMessage,", 'reason: "Not Found",')],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that answers the neutral not-found with another reason phrase"),
  ("harness-transport-forms-not-checked", [(HARNESS, "if (problem !== undefined) problems.push(", "if (Math.random() > 2) problems.push(")],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that answers the neutral not-found with a Date that isn't one"),
  ("harness-cursor-not-sent-beside-ids", [(HARNESS, "      if (ids.length === 0) continue;\n", "      continue;\n")],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that answers a cursor differently when the parent exists"),
  ("harness-signed-out-cursor-not-sent", [(HARNESS, "  if (pages(spec.operation)) {\n    for (const [ids, variant] of [...variants])", "  if (Math.random() > 2) {\n    for (const [ids, variant] of [...variants])")],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that answers a signed-out caller differently when the request carries a cursor"),
  ("matrix-a-request-left-out-of-each-world", [(HARNESS, "return [...queries, ...filled].map(", "return [...queries].map(")],
   f"{PRIV} src/privacy/matrix.test.ts", r"expected 68 to be 69"),
  ("matrix-a-state-left-out", [(MATRIX, "      for (const state of STATES) {\n", "      for (const state of STATES.slice(1)) {\n")],
   f"{PRIV} src/privacy/matrix.test.ts", r"expected 1656 to be 1932"),
  ("api-client-error-writes-into-an-answer-under-way", [(APP, "if (socket.writable && !answering?.headersSent) {", "if (socket.writable) {")],
   API, r"× writes nothing into an answer already under way"),
  ("scanner-date-time-not-checked", [(SCAN, 'if (at < earliest || at > latest)', 'if (Math.random() > 2)')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a reason phrase that isn't the status's, a transport header out of its form"),
  ("scanner-keep-alive-any-timeout", [(SCAN, '"keep-alive": /^timeout=72$/,', '"keep-alive": /^timeout=[0-9]{1,6}(, max=[0-9]{1,6})?$/,')],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a reason phrase that isn't the status's, a transport header out of its form"),
  ("harness-connection-compared-by-form", [(HARNESS, "    if (answer.headers[header] !== value) problems.push(", "    if (header !== \"connection\" && answer.headers[header] !== value) problems.push("),
                                            (HARNESS, 'return name === "date" && transportProblem(name, value, clock) === undefined ?', 'return (name === "date" || name === "connection") && transportProblem(name, value, clock) === undefined ?')],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that tells which drops exist through the transport's headers alone"),
  ("harness-date-time-not-compared", [(HARNESS, "      const problem = transportProblem(header, value, answer.clock);\n", "      const problem = /GMT$/.test(value) ? undefined : \"not its form\";\n"),
                                       (HARNESS, 'return name === "date" && transportProblem(name, value, clock) === undefined ?', 'return name === "date" && /GMT$/.test(value) ?')],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that answers the neutral not-found with a Date in its form that isn't the answer's time"),
  ("scanner-cursor-length-not-checked", [(SCAN, "  if (bytes.length < CURSOR_BYTES) reasons.push(", "  if (Math.random() > 2) reasons.push(")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-cursor-readable-text-not-checked", [(SCAN, 'reasons.push("holds readable text");', "void 0;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-cursor-date-not-checked", [(SCAN, 'reasons.push("holds a date");', "void 0;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-cursor-number-not-checked", [(SCAN, 'reasons.push("holds a long number, such as a time or a count");', "void 0;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-cursor-id-not-checked", [(SCAN, 'reasons.push("holds an id");', "void 0;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-cursor-text-not-checked", [(SCAN, 'reasons.push("holds text people wrote");', "void 0;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-knows-everyone-of-a-club", [(SCAN, "&& inClubSince(member.club, member.joinedAt);", "&& true;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a former member's club as one of theirs, a person who joined after they left"),
  ("scanner-unseen-people-by-club-alone", [(SCAN, "  for (const id of world.members.keys()) if (!knows(id)) unseen.add(id);", "  for (const [id, member] of world.members) if (!clubs.has(member.club)) unseen.add(id);")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a former member's club as one of theirs, a person who joined after they left"),
  ("scanner-names-by-club-alone", [(SCAN, "    if (knows(id)) texts.add(member.name);", "    if (clubs.has(member.club)) texts.add(member.name);")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a former member's club as one of theirs, a person who joined after they left"),
  ("scanner-allowance-counts-withdrawn-drops", [(SCAN, '          drop.state === "withdrawn" &&\n', "          false &&\n")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches counts the viewer may not see"),
  ("scanner-allowance-counts-ended-reservations", [(SCAN, ' && slot.state === "live" && before(context.now, slot.expiresAt),', ",")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches counts the viewer may not see"),
  ("scanner-caption-own-values-not-checked", [(SCAN, '        if (name === "Caption")\n', "        if (Math.random() > 2)\n")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a caption holding its own drop's hidden link and post id"),
  ("scanner-hidden-text-not-looked-for", [(SCAN, "if (text.length >= SHORTEST_TEXT && value.includes(text))", "if (Math.random() > 2)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches text people wrote that the viewer may not read inside another value"),
  ("api-keep-alive-timeout-changed", [(APP, "    clientErrorHandler: clientError,\n", "    clientErrorHandler: clientError,\n    keepAliveTimeout: 5_000,\n")],
   API, r"× keeps a connection open with Fastify's own timeout"),
  ("scanner-date-not-round-tripped", [(SCAN, "if (!Number.isFinite(at) || new Date(at).toUTCString() !== value)", "if (Math.random() > 2)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a reason phrase that isn't the status's, a transport header out of its form"),
  ("scanner-date-clock-ignored", [(SCAN, "  const { earliest, latest } = clock ?? {", "  const { earliest, latest } = undefined ?? {")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a reason phrase that isn't the status's, a transport header out of its form"),
  ("harness-date-order-not-kept", [(HARNESS, "lastDates.set(app, Date.parse(date));", "void 0;")],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that tells which drops exist by a Date of its own"),
  ("harness-date-lag-unbounded", [(HARNESS, "Math.floor(from / 1000) * 1000 - DATE_LAG_MS", "0")],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that answers the neutral not-found with a Date in its form that isn't the answer's time"),
  ("harness-header-order-not-compared", [(HARNESS, '  if (problems.length === 0 && order.join(", ") !== NEUTRAL_ORDER.join(", "))', "  if (Math.random() > 2)")],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that answers the neutral not-found with its headers in another order"),
  ("harness-said-sorts-headers", [(HARNESS, "compared(name, value, answer.clock)]);", "compared(name, value, answer.clock)]).sort();")],
   f"{PRIV} src/privacy/harness.test.ts", r"× tells apart two answers whose headers come in another order"),
  ("scanner-labels-from-any-revision", [(SCAN, "if (inClubSince(id, since)) texts.add(label);", "texts.add(label);")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a former member's club as one of theirs, a person who joined after they left"),
  ("scanner-allowance-releases-every-withdrawal", [(SCAN, "          before(drop.endedAt, revealAt);", "          true;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches counts the viewer may not see"),
  ("scanner-cursor-floor-above-the-contract", [(SCAN, "const CURSOR_BYTES = 12;", "const CURSOR_BYTES = 16;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-readable-run-shorter", [(SCAN, r"const READABLE_TEXT = /[\t\n\r\x20-\x7e]{24,}/;", r"const READABLE_TEXT = /[\t\n\r\x20-\x7e]{16,}/;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-whole-key-not-checked", [(SCAN, r"  if (ALL_TEXT.test(text)) reasons.push", "  if (Math.random() > 2) reasons.push")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-url-run-not-checked", [(SCAN, "      for (const run of decoded.match(URL_RUN) ?? []) noLinks(run, `${at} (decoded)`, LINK_MARKS);", "")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("harness-no-turn-before-request", [(HARNESS, "  await new Promise((resolve) => setImmediate(resolve));\n", "")],
   f"{PRIV} src/privacy/harness.test.ts", r"× lets the event loop turn before each request, so Node renews its Date"),
  ("harness-date-ahead-allowed", [(HARNESS, "    latest: Date.now(),\n", "    latest: Date.now() + 60_000,\n")],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that answers the neutral not-found with a Date three seconds ahead of the moment it came"),
  ("harness-date-lag-an-hour", [(HARNESS, "const DATE_LAG_MS = 5_000;", "const DATE_LAG_MS = 3_600_000;")],
   f"{PRIV} src/privacy/harness.test.ts", r"× reports a route that answers the neutral not-found with a Date ten seconds behind the moment it was asked"),
  ("scanner-url-run-longer", [(SCAN, r"const URL_RUN = /[\t\n\r\x20-\x7e]{12,}/g;", r"const URL_RUN = /[\t\n\r\x20-\x7e]{13,}/g;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-url-on-every-byte", [(SCAN, "      for (const run of decoded.match(URL_RUN) ?? []) noLinks(run, `${at} (decoded)`, LINK_MARKS);", "      noLinks(decoded, `${at} (decoded)`, LINK_MARKS);")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-readable-text-without-whitespace", [(SCAN, r"const READABLE_TEXT = /[\t\n\r\x20-\x7e]{24,}/;", r"const READABLE_TEXT = /[\x20-\x7e]{24,}/;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-whole-key-without-whitespace", [(SCAN, r"const ALL_TEXT = /^[\t\n\r\x20-\x7e]+$/;", r"const ALL_TEXT = /^[\x20-\x7e]+$/;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-whole-key-without-tab", [(SCAN, r"const ALL_TEXT = /^[\t\n\r\x20-\x7e]+$/;", r"const ALL_TEXT = /^[\n\r\x20-\x7e]+$/;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-url-run-first-only", [(SCAN, r"const URL_RUN = /[\t\n\r\x20-\x7e]{12,}/g;", r"const URL_RUN = /[\t\n\r\x20-\x7e]{12,}/;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-url-run-last-only", [(SCAN, "for (const run of decoded.match(URL_RUN) ?? [])", "for (const run of (decoded.match(URL_RUN) ?? []).slice(-1))")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-url-run-without-tab", [(SCAN, r"const URL_RUN = /[\t\n\r\x20-\x7e]{12,}/g;", r"const URL_RUN = /[\n\r\x20-\x7e]{12,}/g;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-url-run-without-newline", [(SCAN, r"const URL_RUN = /[\t\n\r\x20-\x7e]{12,}/g;", r"const URL_RUN = /[\t\r\x20-\x7e]{12,}/g;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-url-run-without-cr", [(SCAN, r"const URL_RUN = /[\t\n\r\x20-\x7e]{12,}/g;", r"const URL_RUN = /[\t\n\x20-\x7e]{12,}/g;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-url-run-shorter", [(SCAN, r"const URL_RUN = /[\t\n\r\x20-\x7e]{12,}/g;", r"const URL_RUN = /[\t\n\r\x20-\x7e]{11,}/g;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-link-marks-scheme-only", [(SCAN, "(decoded)`, LINK_MARKS);", "(decoded)`, LINK_MARKS.slice(0, 1));")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-link-marks-without-data", [(SCAN, "(decoded)`, LINK_MARKS);", "(decoded)`, LINK_MARKS.slice(0, 2));")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-path-marks-in-runs-only", [(SCAN, "      for (const run of decoded.match(URL_RUN) ?? []) noLinks(run, `${at} (decoded)`, LINK_MARKS);\n      noLinks(decoded, `${at} (decoded)`, PATH_MARKS);\n", "      for (const run of decoded.match(URL_RUN) ?? []) noLinks(run, `${at} (decoded)`);\n")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-path-marks-not-checked-in-cursors", [(SCAN, "      noLinks(decoded, `${at} (decoded)`, PATH_MARKS);\n", "")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-whole-key-longer", [(SCAN, r"const ALL_TEXT = /^[\t\n\r\x20-\x7e]+$/;", r"const ALL_TEXT = /^[\t\n\r\x20-\x7e]{13,}$/;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-whole-key-unanchored", [(SCAN, r"const ALL_TEXT = /^[\t\n\r\x20-\x7e]+$/;", r"const ALL_TEXT = /^[\t\n\r\x20-\x7e]{12,}/;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-url-run-exactly-12", [(SCAN, "const URL_RUN = /[\\t\\n\\r\\x20-\\x7e]{12,}/g;", "const URL_RUN = /[\\t\\n\\r\\x20-\\x7e]{12}/g;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-url-run-without-space", [(SCAN, "const URL_RUN = /[\\t\\n\\r\\x20-\\x7e]{12,}/g;", "const URL_RUN = /[\\t\\n\\r\\x21-\\x7e]{12,}/g;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-link-marks-www-anchored", [(SCAN, "const LINK_MARKS = [/[a-z][a-z0-9+.-]*:\\/\\//i, /www\\./i, /data:/i];", "const LINK_MARKS = [/[a-z][a-z0-9+.-]*:\\/\\//i, /(^|[^a-z0-9])www\\./i, /data:/i];")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-link-marks-data-anchored", [(SCAN, "const LINK_MARKS = [/[a-z][a-z0-9+.-]*:\\/\\//i, /www\\./i, /data:/i];", "const LINK_MARKS = [/[a-z][a-z0-9+.-]*:\\/\\//i, /www\\./i, /(^|[^a-z0-9])data:/i];")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-path-marks-anchored", [(SCAN, "const PATH_MARKS = [/(uploads|renditions)\\//i, /(tiktok|instagram)\\.com/i];", "const PATH_MARKS = [/(^|[^a-z0-9])(uploads|renditions)\\//i, /(tiktok|instagram)\\.com/i];")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-www-on-every-byte", [(SCAN, "const PATH_MARKS = [/(uploads|renditions)\\//i, /(tiktok|instagram)\\.com/i];", "const PATH_MARKS = [/(uploads|renditions)\\//i, /(tiktok|instagram)\\.com/i, /www\\./i];")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-data-on-every-byte", [(SCAN, "const PATH_MARKS = [/(uploads|renditions)\\//i, /(tiktok|instagram)\\.com/i];", "const PATH_MARKS = [/(uploads|renditions)\\//i, /(tiktok|instagram)\\.com/i, /data:/i];")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-link-marks-case-sensitive", [(SCAN, "const LINK_MARKS = [/[a-z][a-z0-9+.-]*:\\/\\//i, /www\\./i, /data:/i];", "const LINK_MARKS = [/[a-z][a-z0-9+.-]*:\\/\\//, /www\\./i, /data:/i];")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-path-marks-case-sensitive", [(SCAN, "const PATH_MARKS = [/(uploads|renditions)\\//i, /(tiktok|instagram)\\.com/i];", "const PATH_MARKS = [/(uploads|renditions)\\//, /(tiktok|instagram)\\.com/i];")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-host-dot-any-byte", [(SCAN, "const PATH_MARKS = [/(uploads|renditions)\\//i, /(tiktok|instagram)\\.com/i];", "const PATH_MARKS = [/(uploads|renditions)\\//i, /(tiktok|instagram).com/i];")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-scheme-two-letters", [(SCAN, "const LINK_MARKS = [/[a-z][a-z0-9+.-]*:\\/\\//i, /www\\./i, /data:/i];", "const LINK_MARKS = [/[a-z][a-z0-9+.-]+:\\/\\//i, /www\\./i, /data:/i];")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-values-without-path-marks", [(SCAN, "  /(^|[^a-z0-9])(uploads|renditions)\\//i,\n  /(tiktok|instagram)\\.com/i,\n];", "];")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-scheme-case-sensitive", [(SCAN, "  /[a-z][a-z0-9+.-]*:\\/\\//i,\n  /(^|[^a-z0-9])www", "  /[a-z][a-z0-9+.-]*:\\/\\//,\n  /(^|[^a-z0-9])www")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-www-case-sensitive", [(SCAN, "  /(^|[^a-z0-9])www\\./i,", "  /(^|[^a-z0-9])www\\./,")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-data-case-sensitive", [(SCAN, "  /(^|[^a-z0-9])data:/i,", "  /(^|[^a-z0-9])data:/,")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-path-case-sensitive", [(SCAN, "  /(^|[^a-z0-9])(uploads|renditions)\\//i,", "  /(^|[^a-z0-9])(uploads|renditions)\\//,")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-host-case-sensitive", [(SCAN, "  /(tiktok|instagram)\\.com/i,\n];", "  /(tiktok|instagram)\\.com/,\n];")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-scheme-two-letters", [(SCAN, "  /[a-z][a-z0-9+.-]*:\\/\\//i,\n  /(^|[^a-z0-9])www", "  /[a-z][a-z0-9+.-]+:\\/\\//i,\n  /(^|[^a-z0-9])www")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-scheme-without-digits", [(SCAN, "  /[a-z][a-z0-9+.-]*:\\/\\//i,\n  /(^|[^a-z0-9])www", "  /[a-z][a-z+.-]*:\\/\\//i,\n  /(^|[^a-z0-9])www")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-scheme-from-a-digit", [(SCAN, "  /[a-z][a-z0-9+.-]*:\\/\\//i,\n  /(^|[^a-z0-9])www", "  /[a-z0-9][a-z0-9+.-]*:\\/\\//i,\n  /(^|[^a-z0-9])www")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-path-anchor-not-negated", [(SCAN, "  /(^|[^a-z0-9])(uploads|renditions)\\//i,", "  /(^|[a-z0-9])(uploads|renditions)\\//i,")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-www-anchor-not-negated", [(SCAN, "  /(^|[^a-z0-9])www\\./i,", "  /(^|[a-z0-9])www\\./i,")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-data-anchor-not-negated", [(SCAN, "  /(^|[^a-z0-9])data:/i,", "  /(^|[a-z0-9])data:/i,")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-path-anchor-dropped", [(SCAN, "  /(^|[^a-z0-9])(uploads|renditions)\\//i,", "  /(uploads|renditions)\\//i,")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-www-anchor-dropped", [(SCAN, "  /(^|[^a-z0-9])www\\./i,", "  /www\\./i,")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-data-anchor-dropped", [(SCAN, "  /(^|[^a-z0-9])data:/i,", "  /data:/i,")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-path-at-start-only", [(SCAN, "  /(^|[^a-z0-9])(uploads|renditions)\\//i,", "  /(^)(uploads|renditions)\\//i,")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-values-host-dot-any-byte", [(SCAN, "  /(tiktok|instagram)\\.com/i,\n];", "  /(tiktok|instagram).com/i,\n];")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches a URL in an id"),
  ("scanner-url-run-capped-at-22", [(SCAN, "const URL_RUN = /[\\t\\n\\r\\x20-\\x7e]{12,}/g;", "const URL_RUN = /[\\t\\n\\r\\x20-\\x7e]{12,22}/g;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-own-text-not-checked", [(SCAN, "[...readableKey(bytes, reader), ...ownTextKey(value, reader)]", "readableKey(bytes, reader)")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-own-date-not-checked", [(SCAN, "  if (OWN_DATE.test(cursor)) reasons.push(\"holds a date in its own text\");\n", "")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-own-number-not-checked", [(SCAN, "  if (OWN_NUMBER.test(cursor)) reasons.push(\"holds a long number, such as a time, in its own text\");\n", "")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-own-id-not-checked", [(SCAN, OWN_ID_IF, "")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-own-number-of-17", [(SCAN, "const OWN_NUMBER = /[0-9]{16,}/;", "const OWN_NUMBER = /[0-9]{17,}/;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
  ("scanner-own-number-of-15", [(SCAN, "const OWN_NUMBER = /[0-9]{16,}/;", "const OWN_NUMBER = /[0-9]{15,}/;")],
   f"{PRIV} src/privacy/scanner.test.ts", r"× catches an id the viewer may not see anywhere else, and a cursor"),
]

# The checks of a cursor's own text and bytes, each pinned by changing one class, one alternative or one
# line of them: a mutant must fail the cursor test of scanner.test.ts, in which each digit of a date is tried
# as every value it may take.
TEST = r"× catches an id the viewer may not see anywhere else, and a cursor"
TESTS = f"{PRIV} src/privacy/scanner.test.ts"
def own_date(dashed="[-_][01][0-9][-_][0-3][0-9]", compact="[01][0-9][0-3][0-9][Tt][0-9]{4}", year="20[0-9]{2}", only_dashed=False):
    return f"const OWN_DATE = /{year}({dashed})/;" if only_dashed else f"const OWN_DATE = /{year}({dashed}|{compact})/;"
OWN_DATE_LINE = own_date()
assert OWN_DATE_LINE == "const OWN_DATE = /20[0-9]{2}([-_][01][0-9][-_][0-3][0-9]|[01][0-9][0-3][0-9][Tt][0-9]{4})/;"
for name, mutant in [
  ("month-tens-one", own_date(dashed="[-_][1][0-9][-_][0-3][0-9]")),
  ("month-tens-zero", own_date(dashed="[-_][0][0-9][-_][0-3][0-9]")),
  ("day-to-29", own_date(dashed="[-_][01][0-9][-_][0-2][0-9]")),
  ("any-month", own_date(dashed="[-_][0-9][0-9][-_][0-3][0-9]")),
  ("any-day", own_date(dashed="[-_][01][0-9][-_][0-9][0-9]")),
  ("any-century", own_date(year="[0-9]{4}")),
  ("compact-removed", own_date(only_dashed=True)),
  ("compact-any-letter", own_date(compact="[01][0-9][0-3][0-9][A-Za-z][0-9]{4}")),
  ("compact-three-digits", own_date(compact="[01][0-9][0-3][0-9][Tt][0-9]{3}")),
  ("compact-month-tens-one", own_date(compact="[1][0-9][0-3][0-9][Tt][0-9]{4}")),
  ("compact-month-tens-zero", own_date(compact="[0][0-9][0-3][0-9][Tt][0-9]{4}")),
  ("compact-day-to-29", own_date(compact="[01][0-9][0-2][0-9][Tt][0-9]{4}")),
  ("compact-any-month", own_date(compact="[0-9][0-9][0-3][0-9][Tt][0-9]{4}")),
  ("compact-any-day", own_date(compact="[01][0-9][0-9][0-9][Tt][0-9]{4}")),
  ("underscore-removed", own_date(dashed="[-][01][0-9][-][0-3][0-9]")),
  ("first-separator-dash-only", own_date(dashed="[-][01][0-9][-_][0-3][0-9]")),
  ("second-separator-dash-only", own_date(dashed="[-_][01][0-9][-][0-3][0-9]")),
  ("lowercase-t-removed", own_date(compact="[01][0-9][0-3][0-9][T][0-9]{4}")),
  ("uppercase-t-removed", own_date(compact="[01][0-9][0-3][0-9][t][0-9]{4}")),
  ("century-first-digit-any", own_date(year="[0-9]0[0-9]{2}")),
  ("century-second-digit-any", own_date(year="2[0-9][0-9]{2}")),
  ("year-third-digit-without-9", own_date(year="20[0-8][0-9]")),
  ("year-fourth-digit-without-0", own_date(year="20[0-9][1-9]")),
  ("month-ones-without-0", own_date(dashed="[-_][01][1-9][-_][0-3][0-9]")),
  ("day-ones-without-9", own_date(dashed="[-_][01][0-9][-_][0-3][0-8]")),
  ("compact-month-ones-without-0", own_date(compact="[01][1-9][0-3][0-9][Tt][0-9]{4}")),
  ("compact-day-ones-without-9", own_date(compact="[01][0-9][0-3][0-8][Tt][0-9]{4}")),
  ("compact-time-first-without-0", own_date(compact="[01][0-9][0-3][0-9][Tt][1-9][0-9]{3}")),
  ("compact-time-second-without-9", own_date(compact="[01][0-9][0-3][0-9][Tt][0-9][0-8][0-9]{2}")),
  ("compact-time-third-without-0", own_date(compact="[01][0-9][0-3][0-9][Tt][0-9]{2}[1-9][0-9]")),
  ("compact-time-fourth-without-9", own_date(compact="[01][0-9][0-3][0-9][Tt][0-9]{3}[0-8]")),
  ("separators-optional", own_date(dashed="[-_]?[01][0-9][-_]?[0-3][0-9]")),
  ("compact-t-optional", own_date(compact="[01][0-9][0-3][0-9][Tt]?[0-9]{4}")),
]:
    B.append((f"scanner-own-date-{name}", [(SCAN, OWN_DATE_LINE, mutant)], TESTS, TEST))
B.append(("scanner-own-number-anchored", [(SCAN, "const OWN_NUMBER = /[0-9]{16,}/;", "const OWN_NUMBER = /^[0-9]{16,}$/;")], TESTS, TEST))
BYTES_DATE_LINE = "const BYTES_DATE = /[0-9]{4}[-_][0-9]{2}[-_][0-9]{2}|[0-9]{8}[Tt][0-9]{4}/;"
for name, mutant in [
  ("underscore-removed", "const BYTES_DATE = /[0-9]{4}[-][0-9]{2}[-][0-9]{2}|[0-9]{8}[Tt][0-9]{4}/;"),
  ("dash-removed", "const BYTES_DATE = /[0-9]{4}[_][0-9]{2}[_][0-9]{2}|[0-9]{8}[Tt][0-9]{4}/;"),
  ("compact-removed", "const BYTES_DATE = /[0-9]{4}[-_][0-9]{2}[-_][0-9]{2}/;"),
  ("lowercase-t-removed", "const BYTES_DATE = /[0-9]{4}[-_][0-9]{2}[-_][0-9]{2}|[0-9]{8}[T][0-9]{4}/;"),
  ("uppercase-t-removed", "const BYTES_DATE = /[0-9]{4}[-_][0-9]{2}[-_][0-9]{2}|[0-9]{8}[t][0-9]{4}/;"),
]:
    B.append((f"scanner-bytes-date-{name}", [(SCAN, BYTES_DATE_LINE, mutant)], TESTS, TEST))
SHIFTED_LINE = '  return [1, 2, 3].map((shift) => Buffer.from(cursor.slice(shift), "base64url"));'
for name, mutant in [
  ("not-checked", '  return [1, 2, 3].filter(() => false).map((shift) => Buffer.from(cursor.slice(shift), "base64url"));'),
  ("first-shift-missing", '  return [2, 3].map((shift) => Buffer.from(cursor.slice(shift), "base64url"));'),
  ("second-shift-missing", '  return [1, 3].map((shift) => Buffer.from(cursor.slice(shift), "base64url"));'),
  ("third-shift-missing", '  return [1, 2].map((shift) => Buffer.from(cursor.slice(shift), "base64url"));'),
]:
    B.append((f"scanner-shifted-{name}", [(SCAN, SHIFTED_LINE, mutant)], TESTS, TEST))
B.append(("scanner-shifted-marks-not-checked", [(SCAN, "for (const reason of marksIn(shifted, reader))", "for (const reason of [] as string[])")], TESTS, TEST))
B.append(("scanner-shifted-paths-not-checked", [(SCAN, "        noLinks(shiftedText, `${at} (decoded ${from})`, PATH_MARKS);\n", "")], TESTS, TEST))
B.append(("scanner-shifted-kept-back-not-checked", [(SCAN, "        keptBack(shiftedText, `${at} (decoded ${from})`);\n", "")], TESTS, TEST))
B.append(("scanner-shifted-label-off-by-one", [(SCAN, "String(index + 2)", "String(index + 1)")], TESTS, TEST))
B.append(("scanner-url-run-without-tilde", [(SCAN, r"const URL_RUN = /[\t\n\r\x20-\x7e]{12,}/g;", r"const URL_RUN = /[\t\n\r\x20-\x7d]{12,}/g;")], TESTS, TEST))
B.append(("scanner-url-run-bound-backslash-deleted", [(SCAN, r"const URL_RUN = /[\t\n\r\x20-\x7e]{12,}/g;", r"const URL_RUN = /[\t\n\r\x20-x7e]{12,}/g;")], TESTS, TEST))
B.append(("scanner-readable-text-without-tilde", [(SCAN, r"const READABLE_TEXT = /[\t\n\r\x20-\x7e]{24,}/;", r"const READABLE_TEXT = /[\t\n\r\x20-\x7d]{24,}/;")], TESTS, TEST))
B.append(("scanner-whole-key-without-tilde", [(SCAN, r"const ALL_TEXT = /^[\t\n\r\x20-\x7e]+$/;", r"const ALL_TEXT = /^[\t\n\r\x20-\x7d]+$/;")], TESTS, TEST))


# The twelfth review's fixes (a4fca79 -> this commit): an id without its type tag, BYTES_DATE pinned digit by digit,
# marksIn's bounds, the canonical-cursor check, and the unpadded dates that pass.
B.append(("scanner-own-id-tagged-not-checked", [(SCAN, "[...reader.ids].some((id) => cursor.includes(id)) || reader.untagged()", "reader.untagged()")], TESTS, TEST))
B.append(("scanner-own-id-without-tag-not-checked", [(SCAN, " || reader.untagged().some((form) => cursor.includes(form.text)))\n    reasons.push(\"holds an id in its own text\");", ")\n    reasons.push(\"holds an id in its own text\");")], TESTS, TEST))
B.append(("scanner-bytes-id-tagged-not-checked", [(SCAN, "    [...reader.ids].some((id) => text.includes(id)) ||\n", "")], TESTS, TEST))
B.append(("scanner-bytes-id-text-without-tag-not-checked", [(SCAN, ".some((form) => text.includes(form.text) || (form.bytes !== undefined && bytes.includes(form.bytes)))", ".some((form) => form.bytes !== undefined && bytes.includes(form.bytes))")], TESTS, TEST))
B.append(("scanner-bytes-id-raw-not-checked", [(SCAN, ".some((form) => text.includes(form.text) || (form.bytes !== undefined && bytes.includes(form.bytes)))", ".some((form) => text.includes(form.text))")], TESTS, TEST))
B.append(("scanner-bytes-id-raw-without-its-guard", [(SCAN, "(form.bytes !== undefined && bytes.includes(form.bytes))", "bytes.includes(form.bytes as Buffer)")], TESTS, TEST))
B.append(("scanner-untagged-of-any-length", [(SCAN, "const SHORTEST_UNTAGGED = 16;", "const SHORTEST_UNTAGGED = 1;")], TESTS, TEST))
B.append(("scanner-untagged-of-23-or-more", [(SCAN, "const SHORTEST_UNTAGGED = 16;", "const SHORTEST_UNTAGGED = 23;")], TESTS, TEST))
B.append(("scanner-untagged-bytes-of-any-body", [(SCAN, 'return { text, bytes: bytes.toString("base64url") === text ? bytes : undefined };', "return { text, bytes };")], TESTS, TEST))
B.append(("scanner-untagged-cut-at-the-last-underscore", [(SCAN, 'const cut = id.indexOf("_");', 'const cut = id.lastIndexOf("_");')], TESTS, TEST))
B.append(("scanner-cursor-not-canonical-let-through", [(SCAN, "      if (!canonical) find(\"shape\", at, \"a cursor that isn't base64url (the contract's Cursor)\");\n", "")], TESTS, TEST))
for name, mutant in [
  ("year-without-9", "const BYTES_DATE = /[0-8]{4}[-_][0-9]{2}[-_][0-9]{2}|[0-9]{8}[Tt][0-9]{4}/;"),
  ("year-of-three-digits", "const BYTES_DATE = /[0-9]{3}[-_][0-9]{2}[-_][0-9]{2}|[0-9]{8}[Tt][0-9]{4}/;"),
  ("month-without-9", "const BYTES_DATE = /[0-9]{4}[-_][0-8]{2}[-_][0-9]{2}|[0-9]{8}[Tt][0-9]{4}/;"),
  ("month-without-0", "const BYTES_DATE = /[0-9]{4}[-_][1-9]{2}[-_][0-9]{2}|[0-9]{8}[Tt][0-9]{4}/;"),
  ("day-without-9", "const BYTES_DATE = /[0-9]{4}[-_][0-9]{2}[-_][0-8]{2}|[0-9]{8}[Tt][0-9]{4}/;"),
  ("day-of-one-digit", "const BYTES_DATE = /[0-9]{4}[-_][0-9]{2}[-_][0-9]{1}|[0-9]{8}[Tt][0-9]{4}/;"),
  ("compact-without-9", "const BYTES_DATE = /[0-9]{4}[-_][0-9]{2}[-_][0-9]{2}|[0-8]{8}[Tt][0-9]{4}/;"),
  ("compact-of-seven-digits", "const BYTES_DATE = /[0-9]{4}[-_][0-9]{2}[-_][0-9]{2}|[0-9]{7}[Tt][0-9]{4}/;"),
  ("time-without-9", "const BYTES_DATE = /[0-9]{4}[-_][0-9]{2}[-_][0-9]{2}|[0-9]{8}[Tt][0-8]{4}/;"),
  ("time-of-three-digits", "const BYTES_DATE = /[0-9]{4}[-_][0-9]{2}[-_][0-9]{2}|[0-9]{8}[Tt][0-9]{3}/;"),
  ("separators-optional", "const BYTES_DATE = /[0-9]{4}[-_]?[0-9]{2}[-_]?[0-9]{2}|[0-9]{8}[Tt][0-9]{4}/;"),
  ("slash-dot-and-space-as-separators", "const BYTES_DATE = /[0-9]{4}[-_/. ][0-9]{2}[-_/. ][0-9]{2}|[0-9]{8}[Tt][0-9]{4}/;"),
  ("parts-of-one-or-two-digits", "const BYTES_DATE = /[0-9]{4}[-_][0-9]{1,2}[-_][0-9]{1,2}|[0-9]{8}[Tt][0-9]{4}/;"),
]:
    B.append((f"scanner-bytes-date-{name}", [(SCAN, BYTES_DATE_LINE, mutant)], TESTS, TEST))
B.append(("scanner-own-date-parts-of-one-or-two-digits", [(SCAN, OWN_DATE_LINE, own_date(dashed="[-_][0-9]{1,2}[-_][0-9]{1,2}"))], TESTS, TEST))
B.append(("scanner-long-number-of-11", [(SCAN, "/[0-9]{10,}/.test(text)", "/[0-9]{11,}/.test(text)")], TESTS, TEST))
B.append(("scanner-long-number-of-9", [(SCAN, "/[0-9]{10,}/.test(text)", "/[0-9]{9,}/.test(text)")], TESTS, TEST))
B.append(("scanner-written-text-from-3", [(SCAN, "written.length >= 4 &&", "written.length >= 3 &&")], TESTS, TEST))
B.append(("scanner-written-text-from-5", [(SCAN, "written.length >= 4 &&", "written.length >= 5 &&")], TESTS, TEST))

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
