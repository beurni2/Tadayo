#!/usr/bin/env python3
# Slice 8's deliberate breakages (api/b0-auth): each one exact change of text in one file of the branch,
# the check that must catch it, run with the file changed, a verdict, and the file restored whatever happens.
# A breakage counts as caught only if its command fails AND the output holds the words expected for it
# (a test's own name, mostly), so a change that merely breaks the build isn't counted.
#
# usage: breakages.py [--check] [--only NAME ...]
#   --check   only count the anchors: each text to change must occur the stated number of times
#   --only    run just these (results.json and summary.txt keep the rest)
# environment: BREAK_ROOT (a detached worktree of the branch's head), BREAK_OUT (where the evidence goes),
#   BREAK_PRIV and BREAK_DB (the privacy and database test wrappers).
import hashlib, json, os, re, subprocess, sys

ROOT = os.environ.get("BREAK_ROOT", "/home/user/tadayo-auth-breakages")
S = "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/auth"
OUT = os.environ.get("BREAK_OUT", f"{S}/breakages")
PRIV = os.environ.get("BREAK_PRIV", f"WT={ROOT} bash {S}/privtest.sh")
DB = os.environ.get("BREAK_DB", f"WT={ROOT} bash {S}/dbtest.sh")
NODE = "export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH; "


def api(*files):
    return NODE + f"cd {ROOT}/services/api && npx vitest run {' '.join(files)}"


def domain(*files):
    return NODE + f"cd {ROOT}/packages/domain && npx vitest run {' '.join(files)}"


def db(*files):
    return f"{DB} {' '.join(files)}"


def priv(*args):
    return f"{PRIV} {' '.join(args)}"


# Files, relative to ROOT.
TOKEN = "services/api/src/identity/token.ts"
SESSION = "services/api/src/session.ts"
APP = "services/api/src/app.ts"
ANSWERS = "services/api/src/answers.ts"
ME = "services/api/src/identity/me.ts"
CLUBS = "services/api/src/clubs/list.ts"
LOGGING = "services/api/src/logging.ts"
START = "services/api/src/start.ts"
ACCOUNT = "packages/domain/src/identity/account.ts"
UPDATE = "packages/domain/src/identity/update-me.ts"
CLUBLIST = "packages/domain/src/clubs/club-list.ts"
CLUBSTATE = "packages/domain/src/clubs/club-state.ts"
INVSTATE = "packages/domain/src/clubs/invitation-state.ts"
IDS = "packages/domain/src/ids.ts"
SCAN = "tests/src/privacy/scanner.ts"
ACC = "tests/src/privacy/account.ts"
HARNESS = "tests/src/privacy/harness.ts"

TOKEN_TESTS = api("src/identity/token.test.ts")
GATE_TESTS = api("src/session.test.ts", "src/identity/me.test.ts")
API_ALL = api()
ME_TESTS = api("src/identity/me.test.ts")
LOG_TESTS = api("src/logging.test.ts")
START_TESTS = api("src/start.test.ts")
UPDATE_TESTS = db("src/db/update-me.test.ts")
ACCOUNT_TESTS = db("src/db/identity.test.ts", "src/db/sign-in.test.ts")
CLUB_TESTS = db("src/db/club-list.test.ts")
SCANNER_TESTS = priv("src/privacy/scanner.test.ts")
ACCOUNT_JUDGE_TESTS = priv("src/privacy/account.test.ts")
UUID = "6f1c0c9e-39a5-4c7d-b2a5-0f4a7b3b2f11"


def one(path, old, new, count=1):
    return (path, old, new, count)


# (name, patches, commands, expected words): the words are a substring of the output, or a regex after "re:".
B = [
    # ---- The verifier (identity/token.ts, token.test.ts) ----
    ("verifier-algorithm-list-removed", [one(TOKEN, "        algorithms: ALGORITHMS,\n", "")], [TOKEN_TESTS],
     "takes RS256 from an RSA key the set holds"),
    ("verifier-accepts-a-keyed-hash-too", [one(TOKEN, 'const ALGORITHMS = ["ES256", "RS256"];', 'const ALGORITHMS = ["ES256", "RS256", "HS256", "RS512", "PS256"];')], [TOKEN_TESTS],
     "takes RS256 from an RSA key the set holds"),
    ("verifier-any-audience", [one(TOKEN, "        audience: AUDIENCE,\n", "")], [TOKEN_TESTS],
     "a token for another audience"),
    ("verifier-any-issuer", [one(TOKEN, "        issuer: options.issuer,\n", "")], [TOKEN_TESTS],
     "a token of another issuer"),
    ("verifier-any-role", [one(TOKEN, "    if (payload.role !== AUDIENCE) return null;\n", "")], [TOKEN_TESTS],
     "a service role's token"),
    ("verifier-anonymous-person-accepted", [one(TOKEN, '    if (payload["is_anonymous"] !== undefined && payload["is_anonymous"] !== false) return null;\n', "")], [TOKEN_TESTS],
     "an anonymous person's token"),
    ("verifier-subject-not-a-uuid", [one(TOKEN, '    if (typeof subject !== "string" || !UUID.test(subject)) return null;\n', '    if (typeof subject !== "string") return null;\n')], [TOKEN_TESTS],
     "a subject that isn't a UUID"),
    ("verifier-subject-not-lowercased", [one(TOKEN, "    return subject.toLowerCase();\n", "    return subject;\n")], [TOKEN_TESTS],
     "a subject in capitals"),
    ("verifier-no-key-id-accepted", [one(TOKEN, '    if (typeof header.kid !== "string" || header.kid === "") throw new errors.JWSInvalid("a token with no key id");\n', "")], [TOKEN_TESTS],
     "refuses a token with no key id"),
    # Equivalent, so not run: jose never matches an empty key id to any key, so `header.kid === ""` changes
    # no answer (the token is still refused, as no session).
    ("verifier-expiry-not-required", [one(TOKEN, '        requiredClaims: ["exp", "sub"],\n', '        requiredClaims: ["sub"],\n')], [TOKEN_TESTS],
     "a token with no expiry"),
    ("verifier-oversize-token-accepted", [one(TOKEN, "    if (token.length > MAX_TOKEN || !COMPACT.test(token)) return null;\n", "    if (!COMPACT.test(token)) return null;\n")], [TOKEN_TESTS],
     "takes a token as large as Supabase's can grow"),
    ("verifier-accepts-every-token", [one(TOKEN, "    if (token.length > MAX_TOKEN || !COMPACT.test(token)) return null;\n", f'    return "{UUID}";\n')], [TOKEN_TESTS],
     "an expired token, by one second"),
    ("verifier-key-trouble-is-no-session", [one(TOKEN, "      if (trouble === null) throw error;\n      throw new KeysUnavailable(trouble, { cause: error });\n", "      throw error;\n")], [TOKEN_TESTS],
     "is can't tell, never no session, when it can't be read"),
    ("verifier-empty-key-set-is-no-session", [one(TOKEN, "      if (error instanceof errors.JWKSNoMatchingKey && (keys.jwks()?.keys.length ?? 0) === 0) {\n", "      if (false) {\n")], [TOKEN_TESTS],
     "is can't tell when it holds no key at all"),
    ("verifier-unknown-key-id-is-can't-tell", [one(TOKEN, "  if (error instanceof errors.JWKSNoMatchingKey || error instanceof errors.JWKSMultipleMatchingKeys) return null;\n", "")], [TOKEN_TESTS],
     "a token whose key id the set doesn't"),
    ("keys-never-paused", [one(TOKEN, "    paused = true;\n", "")], [TOKEN_TESTS],
     "is let alone for a few seconds after a failure"),
    ("keys-never-kept", [one(TOKEN, "    cacheMaxAge: options.cacheMaxAge ?? 10 * 60_000,\n", "    cacheMaxAge: options.cacheMaxAge ?? 0,\n")], [TOKEN_TESTS],
     "is fetched once and kept"),
    ("keys-no-cooldown", [one(TOKEN, "    cooldownDuration: options.cooldown ?? 30_000,\n", "    cooldownDuration: options.cooldown ?? 0,\n")], [TOKEN_TESTS],
     "isn't fetched again for a token whose key id it lacks"),
    ("project-any-host", [one(TOKEN, "    !/^[a-z]{20}\\.supabase\\.co$/.test(url.hostname) ||\n", "")], [TOKEN_TESTS],
     "refuses what isn't one, without repeating it"),
    ("project-plain-http", [one(TOKEN, '    url.protocol !== "https:" ||\n', "")], [TOKEN_TESTS],
     "refuses what isn't one, without repeating it"),
    ("project-issuer-without-the-auth-path", [one(TOKEN, "    issuer: `${url.origin}/auth/v1`,\n", "    issuer: url.origin,\n")], [TOKEN_TESTS],
     "gives the issuer and the key set's address of a project"),
    ("project-key-set-at-the-wrong-path", [one(TOKEN, "    keys: new URL(`${url.origin}/auth/v1/.well-known/jwks.json`),\n", "    keys: new URL(`${url.origin}/auth/v1/.well-known/jwks`),\n")], [TOKEN_TESTS],
     "gives the issuer and the key set's address of a project"),
    # ---- The gate (session.ts, answers.ts, app.ts) ----
    ("gate-asks-for-public-routes", [one(SESSION, "    if (config.operation === undefined || config.public === true) return;\n", "    if (config.operation === undefined) return;\n")], [GATE_TESTS, db("src/db/sign-in.test.ts")],
     "never ask who is calling, whatever the header says"),
    ("gate-after-the-body", [one(SESSION, '  app.addHook("onRequest", async (request, reply) => {\n', '  app.addHook("preHandler", async (request, reply) => {\n')], [GATE_TESTS],
     "is judged before the body is read"),
    ("gate-no-session-is-403", [one(SESSION, "    if (account === null) return unauthenticated(reply);\n", '    if (account === null) return problem(reply, "PROFILE_INCOMPLETE");\n')], [GATE_TESTS],
     "gets the one 401 on every route that isn't public"),
    ("gate-answers-by-cause", [one(SESSION, "      account = await authenticate(request.headers.authorization);\n", '      if (request.headers.authorization === undefined) return problem(reply, "INVALID_REQUEST");\n      account = await authenticate(request.headers.authorization);\n')], [GATE_TESTS, db("src/db/sign-in.test.ts")],
     "is told the same 401 whichever header it sent"),
    ("gate-profile-never-checked", [one(SESSION, '    if (config.beforeProfile !== true && !profileFinished(account)) return problem(reply, "PROFILE_INCOMPLETE");\n', "")], [GATE_TESTS],
     "gets 403 PROFILE_INCOMPLETE on a route that isn't beforeProfile"),
    ("gate-profile-checked-on-before-profile-routes", [one(SESSION, "config.beforeProfile !== true && !profileFinished(account)", "!profileFinished(account)")], [GATE_TESTS],
     "is open to a caller whose profile isn't finished"),
    ("profile-needs-only-the-age", [one(SESSION, "  return account.ageConfirmed && account.displayName !== null;", "  return account.ageConfirmed;")], [GATE_TESTS],
     "gets 403 PROFILE_INCOMPLETE on a route that isn't beforeProfile"),
    ("profile-needs-only-a-name", [one(SESSION, "  return account.ageConfirmed && account.displayName !== null;", "  return account.displayName !== null;")], [GATE_TESTS],
     "gets 403 PROFILE_INCOMPLETE on a route that isn't beforeProfile"),
    ("gate-keys-unavailable-is-a-401", [one(SESSION, "        return unavailable(reply);\n", "        return unauthenticated(reply);\n")], [GATE_TESTS],
     "answers 503 with nothing in it on every route"),
    ("gate-other-errors-are-a-401", [one(SESSION, "      throw error;\n    }\n    if (account === null)", "      return unauthenticated(reply);\n    }\n    if (account === null)")], [GATE_TESTS],
     "answers 500 with an empty body, and never echoes the error"),
    ("authenticate-lets-a-deleting-account-in", [one(SESSION, '    return account !== null && account.state === "active" ? account : null;\n', "    return account;\n")], [GATE_TESTS, ACCOUNT_TESTS],
     "is no session for an account whose deletion has begun"),
    ("authenticate-makes-no-account", [one(SESSION, "    const account = known ?? (await deps.sql.begin((tx) => createAccount(tx, deps.clock, subject)));\n", "    const account = known;\n")], [GATE_TESTS],
     "makes the account on the first request, in one transaction"),
    ("bearer-any-scheme", [one(SESSION, "const BEARER = /^bearer ([^ ]+)$/i;", "const BEARER = /^\\w+ ([^ ]+)$/i;")], [GATE_TESTS],
     "the bearer header"),
    ("bearer-case-sensitive", [one(SESSION, "const BEARER = /^bearer ([^ ]+)$/i;", "const BEARER = /^Bearer ([^ ]+)$/;")], [GATE_TESTS],
     "the bearer header"),
    ("bearer-token-with-spaces", [one(SESSION, "const BEARER = /^bearer ([^ ]+)$/i;", "const BEARER = /^bearer (.+)$/i;")], [GATE_TESTS],
     "the bearer header"),
    ("app-gate-not-installed", [one(APP, "  installGate(app, deps.authenticate);\n", "")], [API_ALL],
     "re:(gets the one 401 on every route|never ask who is calling|answers 503 with nothing in it)"),
    ("app-500-echoes-the-error", [one(APP, '  return reply.code(500).header("cache-control", NO_STORE).send();\n', '  return reply.code(500).header("cache-control", NO_STORE).send(error.message);\n')], [API_ALL],
     "an error that isn't a refusal"),
    ("app-request-line-not-logged", [one(APP, "  logEachRequest(app);\n", "")], [LOG_TESTS],
     "is one line, with the request's random id"),
    ("answers-store-allowed", [one(ANSWERS, 'export const NO_STORE = "private, no-store";', 'export const NO_STORE = "no-store";')], [API_ALL],
     "private, no-store"),
    ("answers-503-with-a-body", [one(ANSWERS, '  return reply.code(503).header("cache-control", NO_STORE).send();\n', '  return reply.code(503).header("cache-control", NO_STORE).send("{}");\n')], [GATE_TESTS],
     "answers 503 with nothing in it on every route"),
    ("answers-error-with-a-message", [one(ANSWERS, "    .send(JSON.stringify({ code, ...facts }));", '    .send(JSON.stringify({ code, message: "refused", ...facts }));')], [GATE_TESTS],
     "UNAUTHENTICATED"),
    # ---- GET and PATCH /v1/me (identity/me.ts, update-me.ts, account.ts) ----
    ("me-serves-another-id", [one(ME, "    id: account.id,\n", '    id: "acct_someone-else",\n')], [ME_TESTS],
     "answers the contract's Me for the caller"),
    ("me-serves-an-email", [one(ME, "    age_confirmed: account.ageConfirmed,\n", '    age_confirmed: account.ageConfirmed,\n    email: "someone@example.invalid",\n')], [ME_TESTS],
     "re:(answers the contract's Me for the caller|is an explicit field list)"),
    ("me-says-null-for-no-name", [one(ME, "    ...(account.displayName === null ? {} : { display_name: account.displayName }),\n", "    display_name: account.displayName,\n")], [ME_TESTS],
     "leaves the name and the avatar out when there are none"),
    ("update-key-not-checked", [one(ME, '    if (typeof key !== "string" || !KEY.test(key))\n      return problem(reply, "INVALID_REQUEST", { field: "Idempotency-Key" });\n', "")], [ME_TESTS],
     "names the Idempotency-Key when it is missing"),
    ("update-key-uuid-v4-only", [one(ME, "const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;", "const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;")], [ME_TESTS],
     "takes the key the app makes, a UUIDv7"),
    ("update-unknown-field-named", [one(ME, '    if (typeof field === "string" && FIELDS.includes(field)) return field;\n', '    if (typeof field === "string") return field;\n')], [ME_TESTS],
     "names only a path that is a field of the contract's"),
    ("update-version-ignored", [one(UPDATE, '  if (version !== edit.expected_version) throw new Refused("VERSION_CONFLICT", { current_version: version });\n', "")], [UPDATE_TESTS],
     "is VERSION_CONFLICT with the current version"),
    ("update-conflict-hides-the-version", [one(UPDATE, 'throw new Refused("VERSION_CONFLICT", { current_version: version });', 'throw new Refused("VERSION_CONFLICT");')], [UPDATE_TESTS],
     "is VERSION_CONFLICT with the current version"),
    ("update-bumps-the-version-on-no-change", [one(UPDATE, "  if (confirmsAge || name !== null || avatar !== null) {\n", "  if (true) {\n")], [UPDATE_TESTS],
     "moves by one for each change and not at all when nothing changes"),
    ("update-age-overwritten", [one(UPDATE, "         SET age_confirmed_at = CASE WHEN ${confirmsAge}::pg_catalog.bool THEN ${at}::pg_catalog.timestamptz\n                                     ELSE age_confirmed_at END,\n", "         SET age_confirmed_at = ${at}::pg_catalog.timestamptz,\n")], [UPDATE_TESTS],
     "takes the confirmation once"),
    ("update-receipt-not-replayed", [one(UPDATE, "  if (reserved.length === 0) {\n", "  if (false) {\n")], [UPDATE_TESTS],
     "gives the same key and the same request the first answer again"),
    ("update-conflicting-key-replays", [one(UPDATE, '    if (replayOutcome(receipt["request_hash"], request) !== "replay") throw new Refused("IDEMPOTENCY_CONFLICT");\n', "")], [UPDATE_TESTS],
     "is IDEMPOTENCY_CONFLICT when the same key comes with another request"),
    ("update-name-before-the-age", [one(UPDATE, '    if (!ageKnown) throw new Refused("INVALID_REQUEST", { field: "display_name" });\n', "")], [UPDATE_TESTS],
     "refuses a name or an avatar before the age is confirmed"),
    ("update-avatar-before-the-age", [one(UPDATE, '    if (!ageKnown) throw new Refused("INVALID_REQUEST", { field: "avatar_upload_id" });\n', "")], [UPDATE_TESTS],
     "refuses a name or an avatar before the age is confirmed"),
    ("update-avatar-of-anyone", [one(UPDATE, "       WHERE id = ${edit.avatar_upload_id} AND owner_user_id = ${userId} AND purpose = 'avatar'`;", "       WHERE id = ${edit.avatar_upload_id} AND purpose = 'avatar'`;")], [UPDATE_TESTS],
     "answers NOT_FOUND alike for an upload that never existed"),
    ("update-avatar-of-any-purpose", [one(UPDATE, "       WHERE id = ${edit.avatar_upload_id} AND owner_user_id = ${userId} AND purpose = 'avatar'`;", "       WHERE id = ${edit.avatar_upload_id} AND owner_user_id = ${userId}`;")], [UPDATE_TESTS],
     "answers NOT_FOUND alike for an upload that never existed"),
    ("update-avatar-not-ready-taken", [one(UPDATE, '    if (upload["state"] !== "ready") throw new Refused("MEDIA_NOT_READY");\n', "")], [UPDATE_TESTS],
     "is MEDIA_NOT_READY for its own avatar upload until it is ready"),
    ("update-locks-for-update", [one(UPDATE, "FROM app.users WHERE id = ${userId} FOR NO KEY UPDATE`;", "FROM app.users WHERE id = ${userId} FOR UPDATE`;")], [UPDATE_TESTS],
     "lets twenty requests of one account at once serialize on its row"),
    ("update-no-lock", [one(UPDATE, "FROM app.users WHERE id = ${userId} FOR NO KEY UPDATE`;", "FROM app.users WHERE id = ${userId}`;")], [UPDATE_TESTS],
     "lets twenty requests of one account at once serialize on its row"),
    ("update-a-deleting-account-edits", [one(UPDATE, '  if (row === undefined || row["state"] !== "active") throw new Refused("UNAUTHENTICATED");\n', '  if (row === undefined) throw new Refused("UNAUTHENTICATED");\n')], [UPDATE_TESTS],
     "is refused once the account's deletion has begun"),
    ("update-answer-not-read-from-the-receipt", [one(UPDATE, '  return completed["response_body"] as Json;\n', "  return render(now);\n")], [UPDATE_TESTS],
     "re:(gives the same key and the same request the first answer again|gives the first answer even after)"),
    ("update-input-not-checked", [one(UPDATE, '  if (typeof key !== "string" || !UUID.test(key)) throw new TypeError("identity: the idempotency key is a UUID");\n', "")], [UPDATE_TESTS],
     "refuses an id, a key or a version that the route never sends"),
    ("account-insert-not-idempotent", [one(ACCOUNT, "\n    ON CONFLICT (auth_subject) DO NOTHING`;", "`;")], [ACCOUNT_TESTS],
     "makes one account when twenty first requests arrive at once"),
    ("account-made-at-the-wrong-clock", [one(ACCOUNT, "${checkSubject(subject)}::pg_catalog.uuid, ${at}::pg_catalog.timestamptz)", "${checkSubject(subject)}::pg_catalog.uuid, pg_catalog.now())")], [ACCOUNT_TESTS],
     "makes the account: active, no name, no age confirmation"),
    ("account-subject-not-checked", [one(ACCOUNT, 'if (typeof subject !== "string" || !SUBJECT.test(subject)) {', 'if (typeof subject !== "string") {')], [ACCOUNT_TESTS],
     "refuses a subject that isn't a lowercase UUID"),
    # Equivalent, so not run: `users_avatar_guard` takes no avatar that isn't a ready upload and `uploads_state_guard`
    # never moves an upload out of ready, so the query's `up.state = 'ready'` is a second lock no row can reach.
    # ---- GET /v1/clubs (clubs/list.ts, club-list.ts, club-state.ts, invitation-state.ts) ----
    ("clubs-a-left-club-is-listed", [one(CLUBLIST, "                WHERE m.user_id = ${userId} AND m.state = 'active'\n", "                WHERE m.user_id = ${userId}\n")], [CLUB_TESTS],
     "lists only a club with an active interval of the caller's"),
    ("clubs-the-count-includes-those-who-left", [one(CLUBLIST, "WHERE a.club_id = c.id AND a.state = 'active') AS member_count", "WHERE a.club_id = c.id) AS member_count")], [CLUB_TESTS],
     "lists only a club with an active interval of the caller's"),
    ("clubs-newest-first", [one(CLUBLIST, "ORDER BY k.joined_at, k.interval_id), '[]'::pg_catalog.jsonb)", "ORDER BY k.joined_at DESC, k.interval_id), '[]'::pg_catalog.jsonb)")], [CLUB_TESTS],
     "lists the oldest membership first, and at most the contract's fifty"),
    ("clubs-no-limit", [one(CLUBLIST, "                LIMIT ${String(LIST_LIMIT)}::pg_catalog.int4) k) AS clubs,", "                ) k) AS clubs,")], [CLUB_TESTS],
     "lists the oldest membership first, and at most the contract's fifty"),
    ("invitations-of-anyone", [one(CLUBLIST, "                WHERE i.bound_user_id = ${userId} AND cd.state <> 'joined'\n", "                WHERE cd.state <> 'joined'\n")], [CLUB_TESTS],
     "lists an invitation the caller accepted"),
    ("invitations-of-joined-candidates", [one(CLUBLIST, "WHERE i.bound_user_id = ${userId} AND cd.state <> 'joined'", "WHERE i.bound_user_id = ${userId}")], [CLUB_TESTS],
     "stops listing an invitation once its candidate has joined"),
    ("invitations-without-an-inviter-name", [one(CLUBLIST, "                  AND CASE WHEN pm.state = 'active' THEN pu.display_name ELSE pm.ended_display_name END IS NOT NULL\n", "")], [CLUB_TESTS],
     "names the inviter by FQ75's rule"),
    ("invitations-live-name-only", [one(CLUBLIST, "CASE WHEN pm.state = 'active' THEN pu.display_name ELSE pm.ended_display_name END AS inviter_name,", "pu.display_name AS inviter_name,")], [CLUB_TESTS],
     "names the inviter by FQ75's rule"),
    ("invitation-never-did-not-go-ahead", [one(CLUBLIST, 'candidateEnded: flag(row["candidate_ended"]),', "candidateEnded: false,")], [CLUB_TESTS],
     "says the roster changed once the open revision is not the one they accepted"),
    ("club-never-suspended", [one(CLUBLIST, 'suspended: flag(row["suspended"]),', "suspended: false,")], [CLUB_TESTS],
     "says each state the contract has"),
    ("club-state-suspended-ignored", [one(CLUBSTATE, '  if (facts.suspended) return "suspended";\n', "")], [domain("src/clubs")],
     "suspended"),
    ("club-state-paused-below-one", [one(CLUBSTATE, 'facts.activeMembers < 2 ? "paused" : "active"', 'facts.activeMembers < 1 ? "paused" : "active"')], [domain("src/clubs")],
     "paused"),
    ("invitation-state-ended-ignored", [one(INVSTATE, '  if (facts.candidateEnded) return "did_not_go_ahead";\n', "")], [domain("src/clubs")],
     "did_not_go_ahead"),
    ("clubs-server-now-with-a-fraction", [one(CLUBS, "    server_now: contractInstant(now),\n", "    server_now: now.toString(),\n")], [ME_TESTS],
     "is two empty lists and the server's instant, whole seconds rounded down"),
    ("clubs-open-day-listed", [one(CLUBS, "      member_count: club.memberCount,\n    })),", "      member_count: club.memberCount,\n      open_day: null,\n    })),")], [ME_TESTS],
     "lists a club and an invitation by the contract's names alone"),
    ("new-id-not-random", [one(IDS, 'randomBytes(16).toString("base64url")', 'Buffer.alloc(16).toString("base64url")')], [domain("src/ids.test.ts")],
     "never repeat, and carry no order"),
    # ---- Logging (logging.ts, start.ts) ----
    ("log-fastify-lines-on", [one(LOGGING, "new LogController({ disableRequestLogging: true })", "new LogController({ disableRequestLogging: false })")], [LOG_TESTS],
     "holds Fastify's own lines back"),
    ("log-request-id-from-the-header", [one(LOGGING, "    requestIdHeader: false,\n", '    requestIdHeader: "x-request-id",\n')], [LOG_TESTS],
     "has an id that is random, not a counter, and never the caller's own header"),
    ("log-request-id-a-counter", [one(LOGGING, "    genReqId: requestId,\n", "")], [LOG_TESTS],
     "has an id that is random, not a counter, and never the caller's own header"),
    ("log-redaction-off", [one(LOGGING, "redact: { paths: PATHS, censor: BLANKED },", "redact: { paths: [], censor: BLANKED },")], [LOG_TESTS],
     "blanks every listed field"),
    ("log-redaction-email-unlisted", [one(LOGGING, '  "email",\n  "phone",\n', '  "phone",\n')], [LOG_TESTS],
     "names the fields T52 lists"),
    ("log-redaction-top-level-only", [one(LOGGING, "REDACTED_FIELDS.flatMap((field) => [field, `*.${field}`]);", "REDACTED_FIELDS.flatMap((field) => [field]);")], [LOG_TESTS],
     "blanks every listed field, at the top and one level down"),
    ("log-error-message-kept", [one(LOGGING, '  if (typeof code === "string") described.code = code;\n', '  if (typeof code === "string") described.code = code;\n  (described as Record<string, unknown>).message = (error as Error).message;\n')], [LOG_TESTS],
     "reduces an error to its class and its code"),
    ("log-request-line-with-the-url", [one(LOGGING, "      { op: request.routeOptions.config.operation, status: reply.statusCode, ms: Math.round(reply.elapsedTime) },\n", "      { op: request.routeOptions.config.operation, status: reply.statusCode, ms: Math.round(reply.elapsedTime), path: request.url },\n")], [LOG_TESTS],
     "is one line, with the request's random id"),
    ("log-request-and-answer-objects-kept", [one(LOGGING, "serializers: { err: safeError, req: () => undefined, res: () => undefined },", "serializers: { err: safeError },")], [LOG_TESTS],
     "drops a whole request or answer object logged by mistake"),
    ("log-level-ignored", [one(LOGGING, "      level: config.level,\n", '      level: "info",\n')], [LOG_TESTS],
     "honours the level"),
    ("start-no-supabase-url-check", [one(START, '  if (supabase === undefined || supabase === "") throw new Error("api: SUPABASE_URL isn\'t set");\n', "")], [START_TESTS],
     "stops before it connects when SUPABASE_URL is missing or empty"),
    ("start-log-level-unchecked", [one(START, '  if (!LOG_LEVELS.includes(value)) throw new Error("api: LOG_LEVEL isn\'t a log level");\n', "")], [START_TESTS],
     "stops before it connects when LOG_LEVEL is set but isn't one of pino's levels"),
    # ---- The matrix on the real stack: what only a cell of it can see ----
    ("matrix-token-with-no-key-id-accepted", [one(TOKEN, '    if (typeof header.kid !== "string" || header.kid === "") throw new errors.JWSInvalid("a token with no key id");\n', "")], [priv("src/privacy/matrix.test.ts", "-t", '"callers without a session"')],
     "a token with no key id"),
    ("matrix-gate-not-installed", [one(APP, "  installGate(app, deps.authenticate);\n", "")], [priv("src/privacy/matrix.test.ts", "-t", '"callers without a session"')],
     "callers without a session"),
    ("matrix-a-deleting-account-is-let-in", [one(SESSION, '    return account !== null && account.state === "active" ? account : null;\n', "    return account;\n")], [priv("src/privacy/matrix.test.ts", "-t", '"deletion pending"')],
     "deletion pending"),
    ("matrix-getMe-serves-another-account", [one(ME, "    id: account.id,\n", '    id: "acct_someone-else",\n')], [priv("src/privacy/matrix.test.ts", "-t", '"stranger from another club"')],
     "getMe"),
    ("matrix-listClubs-lists-a-club-that-was-left", [one(CLUBLIST, "                WHERE m.user_id = ${userId} AND m.state = 'active'\n", "                WHERE m.user_id = ${userId}\n")], [priv("src/privacy/matrix.test.ts", "-t", '"former member"')],
     "listClubs"),
    ("matrix-updateMe-ignores-the-version", [one(UPDATE, '  if (version !== edit.expected_version) throw new Refused("VERSION_CONFLICT", { current_version: version });\n', "")], [priv("src/privacy/matrix.test.ts", "-t", '"profile not finished"')],
     "updateMe"),
    ("matrix-an-unfinished-account-passes-the-gate", [one(SESSION, '    if (config.beforeProfile !== true && !profileFinished(account)) return problem(reply, "PROFILE_INCOMPLETE");\n', "")], [priv("src/privacy/matrix.test.ts", "-t", '"profile not finished"')],
     "profile not finished"),
    ("matrix-another-issuer-accepted", [one(TOKEN, "        issuer: options.issuer,\n", "")], [priv("src/privacy/matrix.test.ts", "-t", '"callers without a session"')],
     "callers without a session"),
    # ---- Added by the review of PR #32 (body limits, the surrogate check, the key-set defaults, the invitations' order, LOG_LEVEL, the rename and the roster) ----
    ("body-limit-of-a-route-ignored", [one(APP, "      bodyLimit: bodyLimitOf(operation.id),\n", "")], [ME_TESTS],
     "refuses a body past the route's limit unread"),
    ("body-limit-raised-to-a-megabyte", [one(APP, "export const BODY_LIMIT = 64 * 1024;", "export const BODY_LIMIT = 1024 * 1024;")], [api("src/app.test.ts")],
     "reads a body up to its limit and refuses one past it unread"),
    ("body-limit-of-update-me-raised", [one(APP, "{ updateMe: 8 * 1024 }", "{ updateMe: 64 * 1024 }")], [api("src/app.test.ts")],
     "reads a body up to its limit and refuses one past it unread"),
    ("matrix-updateMe-body-limit-raised", [one(APP, "{ updateMe: 8 * 1024 }", "{ updateMe: 64 * 1024 }")], [priv("src/privacy/matrix.test.ts", "-t", '"member in the audience"')],
     "member in the audience"),
    ("harness-unread-order-ignored", [one(HARNESS, '  const sent = expected.headers.connection === "close" ? UNREAD_ORDER : NEUTRAL_ORDER;\n', "  const sent = NEUTRAL_ORDER;\n")], [priv("src/privacy/harness.test.ts")],
     "pins a refusal made before the body was read by its closed connection"),
    ("harness-pinned-always-keeps-the-connection", [one(HARNESS, '"content-length": String(Buffer.byteLength(body)), connection },', '"content-length": String(Buffer.byteLength(body)) },')], [priv("src/privacy/harness.test.ts")],
     "pins a refusal made before the body was read by its closed connection"),
    ("account-unread-form-not-closed", [one(ACC, "      () => unread(),\n", "      () => invalid(),\n")], [ACCOUNT_JUDGE_TESTS],
     "pins each refusal byte for byte: the code and the field, never a value (T55)"),
    ("update-name-not-well-formed-taken", [one(UPDATE, '  if (edit.display_name !== undefined && !edit.display_name.isWellFormed()) {\n    throw new Refused("INVALID_REQUEST", { field: "display_name" });\n  }\n', "")], [UPDATE_TESTS],
     "refuses a name that isn't well formed before touching anything"),
    ("update-name-ascii-only", [one(UPDATE, "!edit.display_name.isWellFormed()", "/[^\\x00-\\x7f]/.test(edit.display_name)")], [UPDATE_TESTS],
     "refuses a name that isn't well formed before touching anything"),
    ("matrix-updateMe-a-lone-surrogate-is-taken", [one(UPDATE, '  if (edit.display_name !== undefined && !edit.display_name.isWellFormed()) {\n    throw new Refused("INVALID_REQUEST", { field: "display_name" });\n  }\n', "")], [priv("src/privacy/matrix.test.ts", "-t", '"member in the audience"')],
     "member in the audience"),
    ("keys-cache-default-a-minute", [one(TOKEN, "    cacheMaxAge: options.cacheMaxAge ?? 10 * 60_000,\n", "    cacheMaxAge: options.cacheMaxAge ?? 60_000,\n")], [TOKEN_TESTS],
     "trusts a fetched key set for ten minutes"),
    ("keys-cache-default-a-day", [one(TOKEN, "    cacheMaxAge: options.cacheMaxAge ?? 10 * 60_000,\n", "    cacheMaxAge: options.cacheMaxAge ?? 24 * 3_600_000,\n")], [TOKEN_TESTS],
     "trusts a fetched key set for ten minutes"),
    ("keys-timeout-default-thirty-seconds", [one(TOKEN, "    timeoutDuration: options.timeout ?? 3_000,\n", "    timeoutDuration: options.timeout ?? 30_000,\n")], [TOKEN_TESTS],
     "gives a fetch three seconds and rests five after a failure"),
    ("keys-pause-default-fifty-milliseconds", [one(TOKEN, "  const pause = options.pause ?? 5_000;\n", "  const pause = options.pause ?? 50;\n")], [TOKEN_TESTS],
     "gives a fetch three seconds and rests five after a failure"),
    ("keys-cooldown-default-five-seconds", [one(TOKEN, "    cooldownDuration: options.cooldown ?? 30_000,\n", "    cooldownDuration: options.cooldown ?? 5_000,\n")], [TOKEN_TESTS],
     "finds a rotated key once the cooldown has passed"),
    ("keys-cooldown-default-a-day", [one(TOKEN, "    cooldownDuration: options.cooldown ?? 30_000,\n", "    cooldownDuration: options.cooldown ?? 86_400_000,\n")], [TOKEN_TESTS],
     "finds a rotated key once the cooldown has passed"),
    ("invitations-oldest-first", [one(CLUBLIST, "ORDER BY v.created_at DESC, v.id)", "ORDER BY v.created_at, v.id)")], [CLUB_TESTS],
     "lists the newest invitation first, and at most the contract's fifty"),
    ("invitations-the-oldest-fifty", [one(CLUBLIST, "ORDER BY i.created_at DESC, i.id\n", "ORDER BY i.created_at, i.id\n")], [CLUB_TESTS],
     "lists the newest invitation first, and at most the contract's fifty"),
    ("invitations-no-limit", [one(CLUBLIST, "                LIMIT ${String(LIST_LIMIT)}::pg_catalog.int4) v) AS invitations`;", "                ) v) AS invitations`;")], [CLUB_TESTS],
     "lists the newest invitation first, and at most the contract's fifty"),
    ("start-log-level-always-info", [one(START, '  if (!LOG_LEVELS.includes(value)) throw new Error("api: LOG_LEVEL isn\'t a log level");\n  return value;\n', '  if (!LOG_LEVELS.includes(value)) throw new Error("api: LOG_LEVEL isn\'t a log level");\n  return "info";\n')], [db("src/db/startup.test.ts")],
     "writes at the level LOG_LEVEL names"),
    ("update-a-rename-forgets-the-acceptance", [one(UPDATE, "       WHERE id = ${userId}`;\n  }\n  const now = await accountById(tx, userId);\n", "       WHERE id = ${userId}`;\n    await bound(tx)`\n      UPDATE app.roster_revision_candidates SET accepted_invitation_id = NULL\n       WHERE accepted_invitation_id IN (SELECT id FROM app.invitations WHERE bound_user_id = ${userId})`;\n  }\n  const now = await accountById(tx, userId);\n")], [UPDATE_TESTS],
     "leaves the roster alone when someone who has accepted an open revision renames themselves"),
]

# The scanner's new checks, one change each (tests/src/privacy/scanner.ts, scanner.test.ts).
for label, old, new, words in [
    ("scanner-me-id-not-judged", "      judged.add(`${at}.id`);\n      const account = context.viewer.account;", "      const account = context.viewer.account;", "passes each caller's own account"),
    ("scanner-me-any-id", "        if (node.id !== account)\n          find(", "        if (false)\n          find(", "catches a Me whose id isn't the viewer's"),
    ("scanner-me-any-name", "if ((node.display_name ?? null) !== row.name) find(", "if (false) find(", "catches a Me whose id isn't the viewer's"),
    ("scanner-me-any-avatar-version", "if ((node.avatar_version ?? null) !== row.avatar)\n          find(", "if (false)\n          find(", "catches a Me whose id isn't the viewer's"),
    ("scanner-me-any-age-confirmation", "if (node.age_confirmed !== row.ageConfirmed)\n          find(", "if (false)\n          find(", "catches a Me whose id isn't the viewer's"),
    ("scanner-me-any-version", "if (node.version !== row.version) find(", "if (false) find(", "catches a Me whose id isn't the viewer's"),
    ("scanner-me-of-an-account-the-world-lacks", 'else if (row === undefined) find("world", at, "an account this world doesn\'t have");', "else if (row === undefined) { /* passes */ }", "catches a Me for an account the world doesn't have"),
    ("scanner-me-for-a-caller-with-no-session", 'if (account === null) find("world", at, "an account shown to a caller with no session (spec 23)");', "if (account === null) { /* passes */ }", "catches a Me for an account the world doesn't have"),
    ("scanner-invitation-id-not-judged", "      judged.add(`${at}.invitation_id`);", "", "catches a former member's club as one of theirs"),
    ("scanner-invitation-the-world-lacks", 'if (!invitation) find("world", at, "an invitation this world doesn\'t have");', "if (!invitation) { /* passes */ }", "catches an invitation that isn't the viewer's"),
    ("scanner-invitation-of-anyone", "else if (context.viewer.account === null || invitation.boundTo !== context.viewer.account)\n        find(", "else if (false)\n        find(", "catches an invitation that isn't the viewer's"),
    ("scanner-invitation-any-club-name", "if (node.club_name !== invitation.clubName)\n          find(", "if (false)\n          find(", "catches an invitation that isn't the viewer's"),
    ("scanner-invitation-any-inviter-name", "if (node.inviter_name !== invitation.inviterName)\n          find(", "if (false)\n          find(", "catches an invitation that isn't the viewer's"),
    ("scanner-invitation-already-a-membership", "      else if (invitation.joined)\n        find(", "      else if (false)\n        find(", "catches an invitation that isn't the viewer's"),
    ("scanner-accepted-invitation-names-not-the-viewers-text", "    if (viewer.account === null || found.boundTo !== viewer.account) continue;\n    texts.add(found.clubName);", "    continue;\n    texts.add(found.clubName);", "passes each caller's own account"),
    ("scanner-every-invitation-names-are-the-viewers-text", "    if (viewer.account === null || found.boundTo !== viewer.account) continue;\n    texts.add(found.clubName);", "    texts.add(found.clubName);", "catches a day, its club and its people shown to someone with no interval in the club"),
    ("scanner-accounts-not-unseen-ids", "  for (const id of world.accounts.keys()) unseen.add(id);\n", "", "catches an account id anywhere but the viewer's own Me.id"),
    ("scanner-invitations-not-unseen-ids", "  for (const id of world.invitations.keys()) unseen.add(id);\n", "", "catches an invitation's id anywhere but where the invitation is judged"),
    ("scanner-cursor-may-hold-an-account-id", "    ...world.accounts.keys(),\n    ...world.invitations.keys(),\n  ]);", "    ...world.invitations.keys(),\n  ]);", "catches an id the viewer may not see anywhere else"),
    ("scanner-cursor-may-hold-an-invitation-id", "    ...world.accounts.keys(),\n    ...world.invitations.keys(),\n  ]);", "    ...world.accounts.keys(),\n  ]);", "catches an id the viewer may not see anywhere else"),
]:
    B.append((label, [one(SCAN, old, new)], [SCANNER_TESTS], words))

# The account judges' own changes (tests/src/privacy/account.ts, account.test.ts).
for label, old, new, words in [
    ("judge-a-public-route-is-gated", '  if (PUBLIC.has(operation.id)) return undefined;\n  if (session === "deleting")', '  if (session === "deleting")', "answers every route but the public ones with the one 401"),
    ("judge-a-deleting-account-gets-the-403", 'if (session === "deleting") return UNAUTHENTICATED;', 'if (session === "deleting") return PROFILE_INCOMPLETE;', "answers every route but the public ones with the one 401"),
    ("judge-an-unfinished-account-is-gated-on-before-profile-routes", 'if (session === "unfinished" && !BEFORE_PROFILE.has(operation.id)) return PROFILE_INCOMPLETE;', 'if (session === "unfinished") return PROFILE_INCOMPLETE;', "answers an unfinished account with the 403"),
    ("judge-an-unfinished-account-passes-every-route", 'if (session === "unfinished" && !BEFORE_PROFILE.has(operation.id)) return PROFILE_INCOMPLETE;', "", "answers an unfinished account with the 403"),
    ("judge-a-name-without-the-age-is-finished", 'return row.ageConfirmed && row.name !== null ? "active" : "unfinished";', 'return row.ageConfirmed || row.name !== null ? "active" : "unfinished";', "lets an active account with a name and a confirmed age have a session"),
    ("judge-a-deleted-account-has-a-session", 'if (row.state !== "active") return "deleting";', 'if (row.state === "deleting") return "deleting";', "lets an active account with a name and a confirmed age have a session"),
    ("judge-the-public-set-gains-a-route", 'new Set(["removeDevice", "previewInvitationWeb"])', 'new Set(["removeDevice", "previewInvitationWeb", "deleteAccount"])', "names the operations the contract marks public"),
    ("judge-updateMe-expects-the-neutral", '    case "updateMe":\n      return invalid();', '    case "updateMe":\n      return NEUTRAL;', "pins the neutral not-found for every route no slice has built"),
    ("judge-server-now-not-read", "if (body.server_now !== instant)\n      problems.push(", "if (false)\n      problems.push(", "re:(refuses a missing club|server_now)"),
    ("judge-member-count-not-read", "if (club.member_count !== active.get(club.id))", "if (false)", "refuses a missing club, another's, a club the viewer left"),
    ("judge-a-left-interval-is-a-club", ".filter(([id, member]) => viewer.intervals.has(id) && member.leftAt === null)\n        .map(([, member]) => member.club),", ".filter(([id]) => viewer.intervals.has(id))\n        .map(([, member]) => member.club),", "passes the clubs of the viewer's active intervals"),
    ("judge-anothers-invitation-is-the-viewers", "viewer.account !== null && found.boundTo === viewer.account && !found.joined && found.inviterName !== null,", "viewer.account !== null && !found.joined && found.inviterName !== null,", "passes the clubs of the viewer's active intervals"),
    ("judge-a-used-invitation-is-listed", "found.boundTo === viewer.account && !found.joined && found.inviterName !== null,", "found.boundTo === viewer.account && found.inviterName !== null,", "passes the clubs of the viewer's active intervals"),
    ("judge-an-invitation-with-no-inviter-is-listed", "found.boundTo === viewer.account && !found.joined && found.inviterName !== null,", "found.boundTo === viewer.account && !found.joined,", "passes the clubs of the viewer's active intervals"),
    ("judge-a-repeated-id-passes", "...(repeated ? [`${what} lists one twice`] : []),", "", "refuses a missing club, another's, a club the viewer left"),
    ("judge-the-stale-version-is-not-the-current", '(v) => pinned(409, "Conflict", `{"code":"VERSION_CONFLICT","current_version":${String(v)}}`),', '() => pinned(409, "Conflict", `{"code":"VERSION_CONFLICT","current_version":0}`),', "pins each refusal byte for byte"),
    ("judge-the-foreign-avatar-may-answer-anything", 'avatar("another account\'s avatar", own.foreign, group, NEUTRAL),', 'avatar("another account\'s avatar", own.foreign, group, () => []),', "pins each refusal byte for byte"),
    ("judge-an-unfinished-accounts-avatar-names-another-field", 'const early = invalid("avatar_upload_id");', 'const early = invalid("display_name");', "pins each refusal byte for byte"),
    ("judge-a-deleting-accounts-bodies-are-not-the-gates", "    request: (v) => ({ ...one.request(v), expected: UNAUTHENTICATED }),\n    mutates: false,", "    request: (v) => ({ ...one.request(v), expected: NEUTRAL }),\n    mutates: false,", "sends the same bodies to each session"),
]:
    B.append((label, [one(ACC, old, new)], [ACCOUNT_JUDGE_TESTS], words))


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
            for path, old, _new, count in patches:
                text = open(os.path.join(ROOT, path)).read()
                if text.count(old) != count:
                    bad += 1
                    print(f"{name}: {path}: the text occurs {text.count(old)} times, not {count}: {old[:70]!r}")
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
