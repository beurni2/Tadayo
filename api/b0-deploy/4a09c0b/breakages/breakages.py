#!/usr/bin/env python3
# Slice 10a's deliberate breakages (api/b0-deploy): each one exact change of text in one file (or two) of the
# branch, the check that must catch it, run with the file changed, a verdict, and the file restored whatever
# happens. A breakage counts as caught only if its command fails AND the output holds the words registered for
# it (a test's own name, mostly), so a change that merely breaks the build isn't counted.
#
# usage: breakages.py [--check] [--only NAME ...]
#   --check   only count the anchors: each text to change must occur the stated number of times
#   --only    run just these (results.json and summary.txt keep the rest)
# environment: BREAK_ROOT (a detached worktree of the branch's head), BREAK_OUT (where the evidence goes).
import hashlib, json, os, re, subprocess, sys

ROOT = os.environ.get("BREAK_ROOT", "/home/user/tadayo-deploy-breakages")
S = os.environ.get("BREAK_TOOLS", "/tmp/claude-0/-home-user/9ca8d668-d4fe-50df-8373-630646f606e4/scratchpad/c10a")
OUT = os.environ.get("BREAK_OUT", f"{S}/breakages")
NODE = "export PATH=/opt/nvm/versions/node/v26.13.0/bin:$PATH; "


def ops(*files):
    return NODE + f"cd {ROOT}/tools/ops && npx vitest run {' '.join(files)}"


def web(*files):
    return NODE + f"cd {ROOT}/apps/web && npx vitest run {' '.join(files)}"


def api(*files):
    return NODE + f"cd {ROOT}/services/api && npx vitest run {' '.join(files)}"


def db(*files):
    return f"WT={ROOT} bash {S}/dbtest-wt.sh {' '.join(files)}"


def one(path, old, new, count=1):
    return (path, old, new, count)


B = []


def m(name, path, old, new, command, words, count=1):
    B.append((name, [one(path, old, new, count)], [command], words))


def mm(name, patches, command, words):
    B.append((name, patches, [command], words))


OPS = "tools/ops/src"
ENV = f"{OPS}/environment.ts"
DEPLOY = f"{OPS}/deploy-branch.ts"
RUN = f"{OPS}/run.ts"
FLY = f"{OPS}/fly.ts"
FLYAPP = f"{OPS}/fly-app-create.ts"
WORKER = f"{OPS}/worker-scale.ts"
ONM = f"{OPS}/on-machine.ts"
STORAGE = f"{OPS}/storage-setup.ts"
SUPA = f"{OPS}/supabase.ts"
PROBE = f"{OPS}/supabase-probe.ts"
BOOT = f"{OPS}/bootstrap.ts"
SCRAM = f"{OPS}/scram.ts"
SEED = f"{OPS}/seed.ts"
DEVCLOCK = f"{OPS}/dev-clock.ts"
SHUT = "services/api/src/shutdown.ts"
APIMAIN = "services/api/src/main.ts"
WORKERMAIN = "services/worker/src/main.ts"
WEB = "apps/web/src/build.ts"
DOCKER = "Dockerfile"
DIGNORE = ".dockerignore"
FLYTOML = "fly.toml"
INDEX = "apps/web/public/index.html"
ASSOC = "apps/web/public/.well-known/apple-app-site-association"
HEADERS = "apps/web/public/_headers"

T_ENV = ops("src/environment.test.ts")
T_DEPLOY = ops("src/deploy-branch.test.ts")
T_RUN = ops("src/run.test.ts", "src/run-remote.test.ts")
T_FLY = ops("src/fly.test.ts", "src/worker-scale.test.ts", "src/fly-app-create.test.ts", "src/on-machine.test.ts", "src/run-remote.test.ts")
T_WORKER = ops("src/worker-scale.test.ts")
T_FLYAPP = ops("src/fly-app-create.test.ts")
T_ONM = ops("src/on-machine.test.ts")
T_STORAGE = ops("src/storage-setup.test.ts")
T_SUPA = ops("src/supabase-probe.test.ts", "src/storage-setup.test.ts")
T_PROBE = ops("src/supabase-probe.test.ts")
T_SBC = ops("src/supabase.test.ts")
T_FILES = ops("src/deploy-files.test.ts")
T_WEB = web("src/build.test.ts")

# ---- environment.ts: the one guard (T56) ----
m("env-ref-any-length", ENV, "const PROJECT_REF = /^[a-z]{20}$/;", "const PROJECT_REF = /^[a-z]{1,20}$/;", T_ENV,
  "refuses a reference that isn't a project's")
m("env-ref-capitals", ENV, "const PROJECT_REF = /^[a-z]{20}$/;", "const PROJECT_REF = /^[a-zA-Z]{20}$/;", T_ENV,
  "refuses a reference that isn't a project's")
m("env-dev-ref-not-checked", ENV, "  devProjectRef(devRef);\n  const refused", "  const refused", T_ENV,
  "refuses a reference that isn't a project's")
m("env-multi-host-allowed", ENV, '''  if (authority.slice(authority.lastIndexOf("@") + 1).includes(",")) throw refused("it names more than one host");
''', "", T_ENV, "says it names more than one host, as the string says it, before any parser reads it")
m("env-scheme-any", ENV, '''  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") throw refused("it isn't a postgresql: URL");
''', "", T_ENV, "refuses a second host, another scheme, and text that isn't a URL")
m("env-query-allowed", ENV, '''  if (parsed.search !== "" || parsed.hash !== "") throw refused("it has a query or a fragment");
''', "", T_ENV, "refuses the transaction pooler's port, another database, and anything after the path")
m("env-host-any", ENV, '''  if (!POOLER_HOST.test(parsed.hostname.toLowerCase())) throw refused("its host isn't a Supabase session pooler's");
''', "", T_ENV, "refuses a connection with no reference to read: a plain role, a local server, any other host")
m("env-host-regex-unanchored", ENV, r"const POOLER_HOST = /^[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/;",
  r"const POOLER_HOST = /pooler\.supabase\.com/;", T_ENV,
  "refuses a connection with no reference to read: a plain role, a local server, any other host")
m("env-port-any", ENV, '''  if (parsed.port !== "" && parsed.port !== "5432") throw refused("its port isn't the session pooler's, 5432");
''', "", T_ENV, "refuses the transaction pooler's port, another database, and anything after the path")
m("env-database-any", ENV, '''  if (parsed.pathname !== "/postgres") throw refused("its database isn't postgres");
''', "", T_ENV, "refuses the transaction pooler's port, another database, and anything after the path")
m("env-user-reference-not-checked", ENV, '''  if (reference !== devRef) throw refused("its user doesn't carry dev's project reference");
''', "", T_ENV, "refuses another project's reference")
m("env-user-pattern-open", ENV, r"const POOLER_USER = /^[a-z_][a-z0-9_]*\.([a-z]{20})$/;",
  r"const POOLER_USER = /^[a-z_][a-z0-9_]*\.?([a-z]{20})$/;", T_ENV,
  "refuses a connection with no reference to read: a plain role, a local server, any other host")
m("env-message-names-the-string", ENV, "session pooler: ${why}`);", "session pooler: ${why} ${url}`);", T_ENV,
  "never says the string or the reference when it refuses")
m("env-pg-tls-off", ENV, 'PGSSLMODE: "require",', 'PGSSLMODE: "prefer",', T_ENV, "decodes the user and the password, and asks for TLS")
m("env-pg-password-not-decoded", ENV, "    password: decodeURIComponent(parsed.password),", "    password: parsed.password,", T_ENV,
  "decodes the user and the password, and asks for TLS")
m("env-pg-user-not-decoded", ENV, "    user: decodeURIComponent(parsed.username),", "    user: parsed.username,", T_ENV,
  "decodes a user that is written with escapes, as the password is")
m("env-pg-default-port", ENV, '    port: parsed.port === "" ? 5432 : Number(parsed.port),', "    port: Number(parsed.port),", T_ENV,
  "gives port 5432 when the string has none")
m("env-variables-empty-allowed", ENV, '    if (value === undefined || value.trim() === "") missing.push(name);',
  "    if (value === undefined) missing.push(name);", T_ENV, "names every variable that is missing or empty, and none of the values")
m("env-variables-padded-allowed", ENV, "    else if (value !== value.trim()) padded.push(name);\n", "", T_ENV,
  "refuses a value with a space or a line break at either end")
m("env-dev-app", ENV, 'export const DEV_APP = "tadayo-api-dev";', 'export const DEV_APP = "tadayo-api-prod";', T_ENV,
  "is the one app the scripts act on")

# ---- deploy-branch.ts ----
BN = "refuses a branch name that isn't one"
m("db-branch-length-unbounded", DEPLOY, "    branch.length <= 100 &&\n", "", T_DEPLOY, BN)
m("db-branch-dotdot-allowed", DEPLOY, '    !branch.includes("..") &&\n', "", T_DEPLOY, BN)
m("db-branch-trailing-dot-allowed", DEPLOY, '    !branch.endsWith(".") &&\n', "", T_DEPLOY, BN)
m("db-branch-lock-part-allowed", DEPLOY, ' && !part.endsWith(".lock")', "", T_DEPLOY, BN)
m("db-branch-part-may-start-with-dot", DEPLOY, "const BRANCH_PART = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;",
  "const BRANCH_PART = /^[A-Za-z0-9._-]+$/;", T_DEPLOY, BN)
m("db-head-not-a-commit-accepted", DEPLOY,
  '''  if (!COMMIT.test(head)) throw new OpsError("deploy-branch: git's answer about the checkout isn't a commit");
''', "", T_DEPLOY, "when git's answer about the checkout isn't a commit, before it asks anyone")
m("db-untracked-files-ignored", DEPLOY, '["status", "--porcelain", "--untracked-files=all"]', '["status", "--porcelain"]', T_DEPLOY,
  "looks at the checkout before it asks anyone, and at the ci run before it deploys")
m("db-unclean-checkout-allowed", DEPLOY, '''--untracked-files=all"])).trim() !== "") {''', '''--untracked-files=all"])).trim() === "never") {''',
  T_DEPLOY, "when the checkout has changes or files that git doesn't know")
m("db-github-token-not-sent", DEPLOY, "          authorization: `Bearer ${input.githubToken}`,\n", "", T_DEPLOY,
  "asks GitHub for the branch's head and the ci runs of that commit, with the token, and nothing else")
m("db-github-api-version-not-sent", DEPLOY, '          "x-github-api-version": "2022-11-28",\n', "", T_DEPLOY,
  "asks GitHub for the branch's head and the ci runs of that commit, with the token, and nothing else")
m("db-github-error-statuses-accepted", DEPLOY, "    if (response.status !== 200) {", "    if (response.status >= 500) {", T_DEPLOY,
  "says the status GitHub gave, and not its words, and deploys nothing")
m("db-github-no-timeout", DEPLOY, "        signal: AbortSignal.timeout(GITHUB_MS),\n", "", T_DEPLOY,
  "asks GitHub for the branch's head and the ci runs of that commit, with the token, and nothing else")
m("db-github-sha-not-checked", DEPLOY, '  if (typeof onGitHub !== "string" || !COMMIT.test(onGitHub)) {', '  if (typeof onGitHub !== "string") {',
  T_DEPLOY, "says it got no sense from GitHub when the answer isn't what it asked for")
m("db-checkout-behind-the-branch-allowed", DEPLOY, "  if (onGitHub !== head) {", "  if (false) {", T_DEPLOY,
  "when the checkout is at another commit than the branch's head on GitHub")
m("db-run-of-another-commit-counted", DEPLOY, '    if (run?.["head_sha"] !== head || run["head_branch"] !== branch', '    if (run["head_branch"] !== branch', T_DEPLOY,
  "ignores a cancelled run of the same commit, and the runs of other commits and other branches")
m("db-run-of-another-branch-counted", DEPLOY, '|| run["head_branch"] !== branch || run["event"] !== "push") continue;', '|| run["event"] !== "push") continue;',
  T_DEPLOY, "ignores a cancelled run of the same commit, and the runs of other commits and other branches")
m("db-run-of-a-merge-counted", DEPLOY, ' || run["event"] !== "push") continue;', ") continue;", T_DEPLOY,
  "takes a run only from a push")
m("db-run-without-an-id-counted", DEPLOY, '    if (typeof id !== "number" || !Number.isInteger(id)) continue;\n', "", T_DEPLOY,
  "doesn't take a run it can't read for one that passed")
m("db-failure-allowed", DEPLOY, '["success", "cancelled", "skipped"].includes', '["success", "cancelled", "skipped", "failure"].includes',
  T_DEPLOY, "when it failed, however GitHub says so")
m("db-timed-out-allowed", DEPLOY, '["success", "cancelled", "skipped"].includes', '["success", "cancelled", "skipped", "timed_out"].includes',
  T_DEPLOY, "when it failed, however GitHub says so")
m("db-failed-needs-completed-status-dropped", DEPLOY, '(run) => run.status === "completed" && !["success"', '(run) => !["success"', T_DEPLOY,
  "when it is still running or waiting")
m("db-failed-run-not-refused", DEPLOY, "  if (failed !== undefined) throw refusal(", "  if (false) throw refusal(", T_DEPLOY,
  "when it failed, however GitHub says so")
m("db-running-run-not-refused", DEPLOY, "  if (running !== undefined) throw refusal(", "  if (false) throw refusal(", T_DEPLOY,
  "when it is still running or waiting")
m("db-running-run-ignored-when-another-ended", DEPLOY, '  const running = runs.find((run) => run.status !== "completed");',
  '  const running = runs.every((run) => run.status !== "completed") ? runs[0] : undefined;', T_DEPLOY,
  "when any run of it failed or is running, though another passed")
m("db-no-run-accepted", DEPLOY, "  if (passed === undefined) {", "  if (false) {", T_DEPLOY, "when there is none, or none of this commit on this branch")
m("db-cancelled-counts-as-passed", DEPLOY, '  const passed = runs.find((run) => run.conclusion === "success");',
  '  const passed = runs.find((run) => run.conclusion === "success" || run.conclusion === "cancelled");', T_DEPLOY,
  "when every run of it was cancelled")
m("db-image-label-not-the-commit", DEPLOY, "  const label = `sha-${head}`;", '  const label = "sha-latest";', T_DEPLOY,
  "builds and deploys that exact commit, from the checkout, and finds it running")
m("db-deploy-not-remote", DEPLOY, '      "--remote-only",\n', "", T_DEPLOY, "builds and deploys that exact commit, from the checkout, and finds it running")
m("db-deploy-no-app", DEPLOY, '      "--app",\n      DEV_APP,\n', "", T_DEPLOY, "builds and deploys that exact commit, from the checkout, and finds it running")
m("db-deploy-no-config", DEPLOY, '      "--config",\n      "fly.toml",\n', "", T_DEPLOY, "builds and deploys that exact commit, from the checkout, and finds it running")
m("db-deploy-no-image-label", DEPLOY, '      "--image-label",\n      label,\n', "", T_DEPLOY, "builds and deploys that exact commit, from the checkout, and finds it running")
m("db-deploy-with-a-spare-machine", DEPLOY, '      "--ha=false",\n', "", T_DEPLOY, "builds and deploys that exact commit, from the checkout, and finds it running")
m("db-deploy-strategy-immediate", DEPLOY, '      "rolling",\n', '      "immediate",\n', T_DEPLOY, "builds and deploys that exact commit, from the checkout, and finds it running")
m("db-deploy-asks-for-confirmation", DEPLOY, '      "--yes",\n', "", T_DEPLOY, "builds and deploys that exact commit, from the checkout, and finds it running")
m("db-deploy-from-another-directory", DEPLOY, "    { cwd: input.repo, timeoutMs: DEPLOY_MS },", "    { timeoutMs: DEPLOY_MS },", T_DEPLOY,
  "builds and deploys that exact commit, from the checkout, and finds it running")
m("db-deploy-failure-not-refused", DEPLOY, "  if (deployed.code !== 0) throw new OpsError(", "  if (false) throw new OpsError(", T_DEPLOY,
  "doesn't call a deploy that flyctl failed one, with flyctl's own words")
m("db-flyctl-output-not-said", DEPLOY, "  for (const text of [deployed.stdout, deployed.stderr]) for (const line of linesOf(text)) say(line);\n", "", T_DEPLOY,
  "says what flyctl printed, line by line, whether or not it worked")
m("db-no-api-machine-accepted", DEPLOY, '  if (!started.some((machine) => machine.group === "api")) {', "  if (false) {", T_DEPLOY,
  "doesn't take flyctl's word that it deployed")
m("db-machine-on-another-image-accepted", DEPLOY, "  if (behind.length > 0) {", "  if (false) {", T_DEPLOY,
  "doesn't take flyctl's word that it deployed: the Machines have to run the commit's image")
m("db-stopped-machines-checked-too", DEPLOY, '  const started = now.filter((machine) => machine.state === "started");', "  const started = now;", T_DEPLOY,
  "lets a stopped worker be")
m("db-image-read-from-the-tag-only", DEPLOY, '    machine.tag === label || (machine.image ?? "").endsWith(`:${label}`);', "    machine.tag === label;", T_DEPLOY,
  "reads the image from a Machine's config, or from its image reference's tag, whichever has it")
m("db-image-read-from-the-path-only", DEPLOY, '    machine.tag === label || (machine.image ?? "").endsWith(`:${label}`);',
  '    (machine.image ?? "").endsWith(`:${label}`);', T_DEPLOY, "reads the image from a Machine's config, or from its image reference's tag, whichever has it")
# ---- run.ts: the entry and the wiring ----
m("run-inherited-names-run", RUN, "Object.hasOwn(SCRIPTS, name) ? SCRIPTS[name] : undefined", "SCRIPTS[name]", T_RUN,
  "runs nothing for a name it doesn't have, and lists the ones it has")
m("run-loose-words-taken", RUN, "strict: true, allowPositionals: false", "strict: true, allowPositionals: true", T_RUN,
  "takes no option it doesn't know and no loose word")
m("run-unknown-options-taken", RUN, "strict: true, allowPositionals: false", "strict: false, allowPositionals: false", T_RUN,
  "takes no option it doesn't know and no loose word")
m("run-database-not-checked-as-dev", RUN, "  return devDatabaseUrl(variables.DATABASE_URL, variables.SUPABASE_DEV_PROJECT_REF);",
  "  return variables.DATABASE_URL as DevDatabaseUrl;", T_RUN, "refuses a database that isn't tadayo-dev's, before it connects or starts anything")
m("run-ref-without-here-taken", RUN, "    if (options.ref !== undefined) throw new OpsError(`${script}: --ref goes with --here`);\n", "", T_RUN,
  "takes --ref only with --here, and --here only with --ref")
m("run-here-without-ref-taken", RUN, "  if (options.ref === undefined) throw new OpsError(`${script}: --here takes --ref <the dev project's reference>`);\n", "",
  T_RUN, "takes --ref only with --here, and --here only with --ref")
m("run-machine-project-not-compared", RUN, "  if (project !== `https://${ref}.supabase.co`) {", "  if (false) {", T_RUN,
  "refuses a Machine whose SUPABASE_URL isn't the project --ref names, before it sends the key anywhere")
m("run-storage-machine-url-not-compared", RUN, '      const url = machineProject(variables.SUPABASE_URL, where.ref, "storage-setup");',
  "      const url = projectUrl(variables.SUPABASE_URL);", T_RUN,
  "refuses a Machine whose SUPABASE_URL isn't the project --ref names, before it sends the key anywhere")
m("run-probe-machine-url-not-compared", RUN, '  const url = machineProject(variables.SUPABASE_URL, ref, "supabase-probe");', "  const url = projectUrl(variables.SUPABASE_URL);",
  T_RUN, "refuses a project that isn't the one --ref names, a database that isn't dev's, and a missing key, before anything is opened")
m("run-probe-database-not-checked-as-dev", RUN, "  const database = devDatabaseUrl(variables.DATABASE_URL, ref);",
  "  const database = variables.DATABASE_URL as DevDatabaseUrl;", T_RUN,
  "refuses a project that isn't the one --ref names, a database that isn't dev's, and a missing key, before anything is opened")
m("run-probe-run-id-not-said", RUN, "  ctx.say(`supabase-probe: run ${run}`);\n", "", db("src/db/ops-scripts.test.ts"),
  "makes the two buckets, and then finds the project closed: the run's id first, every check ok, the count last")
m("run-probe-failures-not-thrown", RUN, "  if (failed > 0) throw new OpsError(", "  if (false) throw new OpsError(", db("src/db/ops-scripts.test.ts"),
  "fails, saying how many checks failed and which, when a door leaks, and still cleans up")
m("run-probe-anon-with-the-service-key", RUN, "    publishableKey: variables.SUPABASE_PUBLISHABLE_KEY,\n", "    publishableKey: variables.SUPABASE_SERVICE_KEY,\n",
  db("src/db/ops-scripts.test.ts"), "makes the two buckets, and then finds the project closed")
m("run-probe-service-with-the-public-key", RUN, "    serviceKey: variables.SUPABASE_SERVICE_KEY,\n    tables: report.tables,", "    serviceKey: variables.SUPABASE_PUBLISHABLE_KEY,\n    tables: report.tables,",
  db("src/db/ops-scripts.test.ts"), "makes the two buckets, and then finds the project closed")
m("run-probe-data-api-failure-not-thrown", RUN, '  if (settings.some((check) => !check.ok)) throw new OpsError("supabase-probe: the Data API check failed");\n  ctx.say',
  "  ctx.say", T_RUN, "still runs the Machine's checks when the Data API check fails, and then fails, naming the schema and not the secret")
m("run-probe-machine-failure-swallowed", RUN, "  if (onMachineFailure !== undefined) throw onMachineFailure;\n", "", T_RUN,
  "fails with the Machine's failure, after both have said what they found")
m("run-probe-machine-skipped-after-a-data-api-failure", RUN, '  try {\n    await onTheMachine(\n      {\n        ...ctx,',
  '  try {\n    if (settings.some((check) => !check.ok)) throw new OpsError("supabase-probe: the Data API check failed");\n    await onTheMachine(\n      {\n        ...ctx,',
  T_RUN, "still runs the Machine's checks when the Data API check fails")
m("run-machine-command-without-here", RUN, 'command: ["node", MACHINE_MAIN, script, "--here", "--ref", ref],', 'command: ["node", MACHINE_MAIN, script, "--ref", ref],',
  T_RUN, "runs itself on the API's Machine, with --here and the dev project's reference, and says what it printed")
m("run-storage-ref-not-validated", RUN, '    const heard = await onTheMachine(ctx, "storage-setup", devProjectRef(variables.SUPABASE_DEV_PROJECT_REF));',
  '    const heard = await onTheMachine(ctx, "storage-setup", variables.SUPABASE_DEV_PROJECT_REF);', T_RUN, "needs the dev project's reference, and one that is a reference")
m("run-worker-scale-any-target", RUN, '    if (to !== "stopped" && to !== "started") throw new OpsError("worker-scale: --to takes stopped or started");\n', "", T_RUN,
  "takes --to stopped or --to started, and nothing else")
m("run-worker-scale-no-waiting", RUN, "to, say: ctx.say, sleep: ctx.sleep });", "to, say: ctx.say, sleep: async () => undefined });", T_RUN,
  "stops the worker, waiting with the context's sleep between the times it looks")
m("run-fly-app-create-org-dropped", RUN, "...(org === undefined ? {} : { org }), say: ctx.say", "say: ctx.say", T_RUN,
  "passes --org on when it makes the app")
m("run-deploy-branch-without-a-branch", RUN, '    if (branch === undefined) throw new OpsError("deploy-branch: --branch <name> is needed");\n', "", T_RUN,
  "needs --branch, and the GitHub token, before it asks git or anyone")
m("run-deploy-branch-without-a-github-token", RUN, '    const variables = readVariables(ctx.env, ["FLY_API_TOKEN", "GITHUB_TOKEN"]);',
  '    const variables = { ...readVariables(ctx.env, ["FLY_API_TOKEN"]), GITHUB_TOKEN: ctx.env["GITHUB_TOKEN"] ?? "" };', T_RUN,
  "needs --branch, and the GitHub token, before it asks git or anyone")
m("run-deploy-branch-from-the-working-directory", RUN, "      repo: ctx.repo,\n      branch,", "      repo: process.cwd(),\n      branch,", T_RUN,
  "deploys from the checkout it was started in, asking GitHub with the token it was given")
m("run-bootstrap-passwords-not-compared", RUN, "    if (decodeURIComponent(new URL(app).password) !== variables.DATABASE_APP_PASSWORD) {", "    if (false) {", T_RUN,
  "refuses a DATABASE_URL that holds another password than DATABASE_APP_PASSWORD, before psql")
m("run-bootstrap-admin-not-checked-as-dev", RUN, '''    const admin = devDatabaseUrl(
      variables.DATABASE_ADMIN_URL,
      variables.SUPABASE_DEV_PROJECT_REF,
      "DATABASE_ADMIN_URL",
    );''', "    const admin = variables.DATABASE_ADMIN_URL as DevDatabaseUrl;", T_RUN, "refuses a database that isn't tadayo-dev's, before it connects or starts anything")
m("run-bootstrap-runs-psql-as-the-app-role", RUN, "      pgEnv: pgEnvOf(admin),", "      pgEnv: pgEnvOf(app),", T_RUN,
  "runs psql once with the admin's connection in its environment, then checks the role logs in")
m("run-bootstrap-role-not-checked", RUN, '    if (me !== "tadayo_app") throw new OpsError(', "    if (false) throw new OpsError(", T_RUN,
  "fails when DATABASE_URL connects as another role")
m("run-dev-clock-takes-a-local-time", RUN, "    return Temporal.Instant.from(text);",
  '    return Temporal.PlainDateTime.from(text).toZonedDateTime("UTC").toInstant();', T_RUN,
  "takes an instant with its offset only, and refuses anything else before it connects")
m("run-migrate-always-says-nothing", RUN, '    ctx.say(applied.length === 0 ? "migrate: nothing to apply" : `migrate: ${String(applied.length)} applied`);',
  '    ctx.say("migrate: nothing to apply");', db("src/db/ops-scripts.test.ts"), "migrate: says how many it applied when a migration is new, and applies it only once")
# ---- fly.ts, worker-scale.ts, fly-app-create.ts, on-machine.ts ----
m("fly-child-gets-the-whole-environment", FLY, '''  const childEnv: Record<string, string> =
    home === undefined || home === "" ? { FLY_API_TOKEN: token } : { FLY_API_TOKEN: token, HOME: home };''',
  "  const childEnv: Record<string, string> = { ...(env as Record<string, string>), FLY_API_TOKEN: token };", T_FLY,
  "gives flyctl the token and HOME, and nothing else of the environment")
m("fly-child-gets-no-home", FLY, '''  const childEnv: Record<string, string> =
    home === undefined || home === "" ? { FLY_API_TOKEN: token } : { FLY_API_TOKEN: token, HOME: home };''',
  "  const childEnv: Record<string, string> = { FLY_API_TOKEN: token };", T_FLY, "with the Fly token and HOME and nothing else")
m("fly-calls-have-no-time-limit", FLY, "{ env: childEnv, timeoutMs: QUICK_MS, ...options }", "{ env: childEnv, ...options }", T_FLY,
  "gives flyctl the token and HOME, the call's own directory, and two minutes")
m("fly-timeouts-unsaid", FLY, '  if (result.timedOut) return "it ran out of time";\n', "", T_FLY, "says that a call ran out of time, whatever it printed")
m("fly-why-says-every-line", FLY, "    .slice(0, 3)\n", "    .slice(0, 300)\n", T_FLY, "says the exit code and the first lines of what it printed, standard error before standard output")
m("fly-why-lines-uncut", FLY, "    .map((line) => (line.length > 200 ? `${line.slice(0, 200)}…` : line));", "    .map((line) => line);", T_FLY, "cuts a long line at 200 characters and keeps the shorter ones whole")
m("fly-list-failure-unsaid", FLY, "  if (result.code !== 0) throw new OpsError(`couldn't list ${DEV_APP}'s Machines: ${why(result)}`);\n", "", T_FLY,
  "an answer it can't read, with flyctl's own words and never the token")
m("fly-machine-without-an-id-taken", FLY, "    if (id === undefined || state === undefined) {", "    if (false) {", T_FLY, "an answer it can't read")
m("fly-process-group-not-read", FLY, '      group: text(record(config?.["metadata"])?.["fly_process_group"]),', "      group: undefined,", T_FLY,
  "stops the worker Machine and not the API's, then reads its state")

m("ws-stops-the-api", WORKER, '.filter((machine) => machine.group === "worker");', '.filter((machine) => machine.group === "api");', T_WORKER,
  "stops the worker Machine and not the API's, then reads its state")
m("ws-two-workers-taken", WORKER, "  if (others.length > 0) {", "  if (false) {", T_WORKER, "an app with no worker Machine, or two")
m("ws-no-worker-taken", WORKER, '  if (worker === undefined) throw new OpsError("worker-scale: the app has no worker Machine; deploy first");\n', "", T_WORKER,
  "an app with no worker Machine, or two")
m("ws-already-done-acts-again", WORKER, "  if (done(worker.state)) {", "  if (false) {", T_WORKER, "does nothing to a Machine that is stopped already")
m("ws-stop-with-sigkill", WORKER, '"-a", DEV_APP, "-s", "SIGTERM"]', '"-a", DEV_APP, "-s", "SIGKILL"]', T_WORKER, "stops the worker Machine and not the API's")
m("ws-suspended-is-not-stopped", WORKER, 'const STOPPED = ["stopped", "suspended"];', 'const STOPPED = ["stopped"];', T_WORKER, "takes a suspended Machine as stopped")
m("ws-one-look", WORKER, "const POLLS = 10;", "const POLLS = 1;", T_WORKER, "waits while it stops, a few seconds at a time")
m("ws-no-wait-between-looks", WORKER, "    await input.sleep(POLL_MS);\n", "", T_WORKER, "waits while it stops, a few seconds at a time")
m("ws-wait-of-no-time", WORKER, "const POLL_MS = 3000;", "const POLL_MS = 0;", T_WORKER, "waits while it stops, a few seconds at a time")
m("ws-timeout-is-success", WORKER, '''  throw new OpsError(
    `worker-scale: the worker Machine is ${state}, ${String((POLLS * POLL_MS) / 1000)} seconds after it was told to ${verb}`,
  );''', "  return;", T_WORKER, "says what it found when the Machine isn't stopped in time, and not that it is")
m("ws-odd-state-acted-on", WORKER, "  } else if (!waiting.includes(worker.state)) {", "  } else if (false) {", T_WORKER,
  "a Machine in a state it has no move for, changing nothing")
m("ws-flyctl-refusal-ignored", WORKER, '''    if (result.code !== 0)
      throw new OpsError(`worker-scale: flyctl couldn't ${verb} the worker Machine: ${why(result)}`);
''', "", T_WORKER, "a stop that flyctl refuses, saying so and not that the Machine is stopped")
m("ws-start-with-a-stop", WORKER, ': ["machine", "start", worker.id, "-a", DEV_APP];', ': ["machine", "stop", worker.id, "-a", DEV_APP];', T_WORKER,
  "starts a stopped worker Machine and reads its state")

m("fac-org-not-checked", FLYAPP, "  if (input.org !== undefined && !SLUG.test(input.org)) {", "  if (false) {", T_FLYAPP,
  "an organization name that isn't a slug, before it calls flyctl at all")
m("fac-app-made-when-there", FLYAPP, "  if (status.code === 0) {", "  if (status.code !== 0) {", T_FLYAPP, "makes nothing again: the app is there and the certificate is issued")
m("fac-guesses-an-organization", FLYAPP, "  if (slugs.length > 1) {", "  if (false) {", T_FLYAPP, "to guess between organizations, naming them, and makes nothing")
m("fac-no-organization-taken", FLYAPP, '  if (only === undefined) throw new OpsError("fly-app-create: the token sees no organization");\n', "", T_FLYAPP,
  "a token that sees no organization, saying so")
m("fac-unreadable-organizations-taken", FLYAPP, '''  if (orgs === undefined) throw new OpsError("fly-app-create: flyctl's list of organizations isn't one it can read");
''', "", T_FLYAPP, "an organization list it can't read")
m("fac-app-failure-ignored", FLYAPP, "    if (made.code !== 0) throw new OpsError(", "    if (false) throw new OpsError(", T_FLYAPP,
  "to go on when the app can't be made, with flyctl's words, and requests no certificate")
m("fac-certificate-failure-ignored", FLYAPP, "    if (added.code !== 0) {", "    if (false) {", T_FLYAPP, "to say the certificate is requested when flyctl refused it")
m("fac-issued-certificate-unseen", FLYAPP, '  if (issued || detail["status"] === "Ready") return "issued";', '  if (false) return "issued";', T_FLYAPP,
  "makes nothing again: the app is there and the certificate is issued")
m("fac-configured-is-waiting", FLYAPP, '  if (detail["configured"] === true) return "issuing";', '  if (detail["configured"] === true) return "waiting for DNS";',
  T_FLYAPP, "says where the certificate is: waiting for DNS, or DNS found and the certificate on its way")
m("fac-unconfigured-is-issuing", FLYAPP, '  if (detail["configured"] === false) return "waiting for DNS";', '  if (detail["configured"] === false) return "issuing";',
  T_FLYAPP, "says where the certificate is: waiting for DNS, or DNS found and the certificate on its way")
m("fac-unreadable-answer-is-issued", FLYAPP, '  if (detail["configured"] === false) return "waiting for DNS";\n  return "unknown";', '  if (detail["configured"] === false) return "waiting for DNS";\n  return "issued";',
  T_FLYAPP, "says it couldn't read an answer it doesn't understand, and still says what DNS needs")
m("fac-cname-any-text", FLYAPP, '  return typeof named === "string" && HOST_NAME.test(named) ? named : `${DEV_APP}.fly.dev`;',
  '  return typeof named === "string" ? named : `${DEV_APP}.fly.dev`;', T_FLYAPP,
  "names the CNAME target Fly gives, and the app's own fly.dev name when it gives none or a strange one")
m("fac-dns-instructions-unsaid", FLYAPP, "    say(dns);\n", "", T_FLYAPP, "says")

m("om-command-words-unchecked", ONM, "  if (input.command.length === 0 || !input.command.every((word) => PLAIN_WORD.test(word))) {", "  if (false) {", T_ONM,
  "takes only plain words for the command, so nothing in it is read as anything else")
m("om-any-machine", ONM, 'machine.group === "api" && machine.state === "started"', 'machine.state === "started"', T_ONM,
  "runs the command in the API's started Machine, as one string, and says what it printed")
m("om-no-machine-runs-anyway", ONM, "    throw new OpsError(`${label}: the API has no started Machine (the app's Machines: ${machineList(all)}); ${advice}`);\n", "", T_ONM,
  "fails when the API has no started Machine, names the Machines there are, and runs nothing")
m("om-flyctl-failure-ignored", ONM, "  if (result.code !== 0) throw new OpsError(`${label}: flyctl couldn't run it on the Machine: ${why(result)}`);\n", "", T_ONM,
  "fails when flyctl can't run it, saying why, or answers with something it can't read")
m("om-unreadable-answer-ignored", ONM, "  const answer = readAnswer(jsonOf(result));\n",
  '  const answer = readAnswer(jsonOf(result)) ?? { stdout: "", stderr: "", exitCode: 0, exitSignal: 0 };\n', T_ONM, "fails when flyctl can't run it, saying why, or answers with something it can't read")
m("om-command-failure-ignored", ONM, "  if (answer.exitCode !== 0) {", "  if (false) {", T_ONM,
  "fails, with the exit code and after saying what the command printed, when the command failed")
m("om-no-json", ONM, '"-a", DEV_APP, "--json", "--timeout", String(EXEC_SECONDS)],', '"-a", DEV_APP, "--timeout", String(EXEC_SECONDS)],', T_ONM,
  "runs the command in the API's started Machine, as one string, and says what it printed")
m("om-no-command-timeout", ONM, '"-a", DEV_APP, "--json", "--timeout", String(EXEC_SECONDS)],', '"-a", DEV_APP, "--json"],', T_ONM,
  "runs the command in the API's started Machine, as one string, and says what it printed")
m("om-call-no_longer-than-the-command", ONM, "const CALL_MS = (EXEC_SECONDS + 30) * 1000;", "const CALL_MS = EXEC_SECONDS * 1000;", T_ONM,
  "gives the call a little longer than it gave the command, and flyctl the token and nothing else")

# ---- storage-setup.ts, supabase.ts ----
SS = "makes both buckets when they're missing: private, with the limit and the types"
m("ss-bucket-made-public", STORAGE, "    public: false,\n    file_size_limit: FILE_SIZE_LIMIT,", "    public: true,\n    file_size_limit: FILE_SIZE_LIMIT,", T_STORAGE, SS)
m("ss-limit-in-decimal-megabytes", STORAGE, "export const FILE_SIZE_LIMIT = 20 * 1024 * 1024;", "export const FILE_SIZE_LIMIT = 20 * 1000 * 1000;", T_STORAGE,
  "declares D09's limit and the three image types, in numbers a reader can check")
m("ss-gif-allowed", STORAGE, 'export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;',
  'export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;', T_STORAGE,
  "declares D09's limit and the three image types, in numbers a reader can check")
m("ss-a-third-bucket", STORAGE, 'export const BUCKETS = ["uploads", "renditions"] as const;', 'export const BUCKETS = ["uploads", "renditions", "avatars"] as const;', T_STORAGE, SS)
m("ss-public-bucket-left-public", STORAGE, '  if (record["public"] !== false) found.push("public");\n', "", T_STORAGE,
  "makes a bucket private again, and sets its limit and types, when it was made another way, and says what it changed")
m("ss-other-limit-left", STORAGE, "  if (limit !== FILE_SIZE_LIMIT) {", "  if (false) {", T_STORAGE,
  "makes a bucket private again, and sets its limit and types, when it was made another way, and says what it changed")
m("ss-any-type-left", STORAGE, '  if (!Array.isArray(types) || types.length === 0) found.push("types:any");', '  if (!Array.isArray(types) || types.length === 0) undefined;', T_STORAGE,
  "makes a bucket private again, and sets its limit and types, when it was made another way, and says what it changed")
m("ss-other-types-left", STORAGE, '    found.push("types:other");', "    undefined;", T_STORAGE,
  "makes a bucket private again, and sets its limit and types, when it was made another way, and says what it changed")
m("ss-types-compared-in-order", STORAGE, "!ALLOWED_TYPES.every((type) => types.includes(type))", "JSON.stringify(types) !== JSON.stringify(ALLOWED_TYPES)", T_STORAGE,
  "takes the types in any order as the same")
m("ss-always-writes", STORAGE, "    if (before.length > 0) {\n      const reply = await call(", "    if (true) {\n      const reply = await call(", T_STORAGE,
  "makes nothing when they're as declared, and a second run writes nothing at all")
m("ss-update-failure-ignored", STORAGE, '      if (reply.status !== 200) throw fail(bucket, "couldn\'t set it", reply);\n', "", T_STORAGE,
  "says what it couldn't do, naming the bucket and the project's status, when the make or the update fails")
m("ss-update-not-read-back", STORAGE, "      if (after.length > 0) {", "      if (false) {", T_STORAGE,
  "fails when a bucket still isn't as declared after the update, rather than say it is")
m("ss-make-race-refused", STORAGE, '      else if (reply.logical !== 409) throw fail(bucket, "couldn\'t make it", reply);', '      else if (true) throw fail(bucket, "couldn\'t make it", reply);',
  T_STORAGE, "treats a bucket that appears between the look and the make as there, and goes on to make it as declared")
m("ss-make-failure-ignored", STORAGE, '      else if (reply.logical !== 409) throw fail(bucket, "couldn\'t make it", reply);', '      else if (false) throw fail(bucket, "couldn\'t make it", reply);',
  T_STORAGE, "says what it couldn't do, naming the bucket and the project's status, when the make or the update fails")
m("ss-any-error-is-a-missing-bucket", STORAGE, '    if (reply.logical === 404 && reply.code === "NoSuchBucket") return undefined;', "    if (reply.status >= 400) return undefined;", T_STORAGE,
  "doesn't take a server error for a missing bucket: it makes nothing")
m("ss-missing-after-making-accepted", STORAGE, "      if (found === undefined) throw new OpsError(`storage-setup: ${bucket}: it isn't there after it was made`);\n", "", T_STORAGE,
  "fails when a bucket isn't there after the project said it made it, rather than say it is made")
m("sb-no-api-key-header", SUPA, '    headers["apikey"] = caller.key;\n', "", T_SUPA, "sends the service key and never the public one, and prints neither")
m("sb-user-token-not-sent", SUPA, 'Bearer ${caller.kind === "user" ? caller.token : caller.key}', "Bearer ${caller.key}", T_PROBE,
  "calls with the key each caller has and no other")
m("sb-storage-status-not-read", SUPA, '  const logical = typeof statusCode === "string" && /^[0-9]{3}$/.test(statusCode) ? Number(statusCode) : status;', "  const logical = status;", T_SUPA,
  "makes both buckets when they're missing")
m("sb-storage-code-not-read", SUPA, '  return { logical, code: typeof code === "string" ? code : undefined };', "  return { logical, code: undefined };", T_STORAGE,
  "makes both buckets when they're missing")
m("sb-no-time-limit", SUPA, "          ? AbortSignal.timeout(TIMEOUT_MS)\n", "          ? undefined\n", T_SBC, "asks with GET unless told otherwise, at the project's URL, and with a time limit that hasn't run out")
m("sb-plain-http-project", SUPA, r"const match = /^https:\/\/([a-z]{20})\.supabase\.co\/?$/.exec(value);", r"const match = /^https?:\/\/([a-z]{20})\.supabase\.co\/?$/.exec(value);",
  T_SBC, "refuses plain http, another host or length, capitals, a path, a query and anything around it")
m("sb-any-code-printed", SUPA, "  if (reply.code !== undefined && /^[A-Za-z0-9_]{1,40}$/.test(reply.code)) parts.push(reply.code);", "  if (reply.code !== undefined) parts.push(reply.code);",
  T_SBC, "says a code only when it is a plain word of at most 40 letters, digits and underscores")
m("sb-logical-status-unsaid", SUPA, "  if (reply.logical !== reply.status) parts.push(`status ${String(reply.logical)}`);\n", "", T_SBC, "says the HTTP status, Storage's own status when it differs, and the code")
m("sb-path-with-its-query-in-the-message", SUPA, '${path.split("?")[0] ?? path}: no answer from the project', "${path}: no answer from the project", T_SBC,
  "says where it got no answer, by the path without its query, and never a header, a key or a body")
# ---- supabase-probe.ts ----
m("p-any-error-is-storage-refusing", PROBE, "(reply.logical === 403 || reply.logical === 404)", "reply.logical >= 400", T_PROBE,
  "fails a request Storage couldn't read (status 400), so a mistake of the probe's own can't pass as closed")
m("p-refusal-needs-no-body", PROBE, '  return text(reply.json, "statusCode") !== undefined && (reply.logical', "  return (reply.logical", T_PROBE,
  "fails a 404 that isn't Storage's, as a route that isn't there says it, and a server error")
m("p-a-404-is-not-a-refusal", PROBE, "(reply.logical === 403 || reply.logical === 404)", "(reply.logical === 403)", T_PROBE,
  "passes every check, controls and refusals, and leaves no object, no bucket and no user behind")
m("p-a-403-is-not-a-refusal", PROBE, "(reply.logical === 403 || reply.logical === 404)", "(reply.logical === 404)", T_PROBE,
  "passes every check, controls and refusals, and leaves no object, no bucket and no user behind")
m("p-an-open-read-passes", PROBE, "    return reply.status === 200 ? whenOpen : answered(reply);", "    return undefined;", T_PROBE, "names the surface when")
m("p-an-open-sign-passes", PROBE, '  return reply.status === 200 && signedUrl(reply.json) !== undefined ? "it gave a signed URL" : answered(reply);', "  return undefined;", T_PROBE,
  "names the surface when")
m("p-an-open-upload-url-passes", PROBE, '  return reply.status === 200 && given !== undefined ? "it gave an upload URL" : answered(reply);', "  return undefined;", T_PROBE,
  "names the surface when")
m("p-a-listing-passes", PROBE, '  return items.length === 0 ? undefined : `it listed ${String(items.length)} ${items.length === 1 ? "item" : "items"}`;', "  return undefined;", T_PROBE,
  "names the surface when")
m("p-a-signed-batch-passes", PROBE, '  return items.some((item) => signedUrl(item) !== undefined) ? "it gave a signed URL" : undefined;', "  return undefined;", T_PROBE,
  "names the surface when")
m("p-rest-rows-pass", PROBE, '  return rows.length === 0 ? undefined : "it returned rows";', "  return undefined;", T_PROBE, "names the surface when")
m("p-rest-error-is-open", PROBE, "  if (reply.status >= 400) return undefined;\n  const rows =", "  const rows =", T_PROBE,
  "passes every check, controls and refusals, and leaves no object, no bucket and no user behind")
m("p-rest-root-passes", PROBE, "const restRoot: Verdict = (reply) => (reply.status >= 400 ? undefined : answered(reply));", "const restRoot: Verdict = () => undefined;", T_PROBE,
  "still fails the public callers' root when a gateway answers it")
m("p-graphql-data-passes", PROBE, '  return typeof data === "object" && data !== null ? "it answered with data" : undefined;', "  return undefined;", T_PROBE,
  "names the surface when")
m("p-cleanup-failure-passes", PROBE, "  return reply.status === 200 || reply.status === 204 || reply.logical === 404 ? undefined : answered(reply);", "  return undefined;", T_PROBE,
  "reports a clean-up that fails, with what is left, so that no test user stays behind unseen")
m("p-cleanup-of-a-gone-thing-fails", PROBE, "  return reply.status === 200 || reply.status === 204 || reply.logical === 404 ? undefined : answered(reply);",
  "  return reply.status === 200 || reply.status === 204 ? undefined : answered(reply);", T_PROBE, "deletes the user and the objects even when a control throws half-way")
m("p-user-not-checked", PROBE, "        settle(made, () => userId !== undefined),", "        settle(made, () => true),", T_PROBE,
  "stops after the controls when the service key is refused, and says that nothing was proved")
m("p-token-not-checked", PROBE, '        else if (me.status !== 200 || text(me.json, "id") !== userId)', "        else if (false)", T_PROBE,
  "stops after the controls when Auth won't take the user's token, since every refusal of that token would mean nothing")
m("p-sign-in-code-not-checked", PROBE, "      link === undefined ? silence() : hashed === undefined ? `no sign-in code: ${describe(link)}` : undefined;",
  "      link === undefined ? silence() : undefined;", T_PROBE, "stops after the controls when the project gives the user no sign-in code")
m("p-put-not-checked", PROBE, "          settle(put, (reply) => reply.status === 200),", "          settle(put, () => true),", T_PROBE,
  "names the control of the signed URL's put when it doesn't answer 200, and runs no read after it")
m("p-read-back-bytes-not-compared", PROBE, "          settle(read, (reply) => reply.status === 200 && sameBytes(reply.bytes, PNG)),", "          settle(read, (reply) => reply.status === 200),", T_PROBE,
  "names the control of the read when the bytes aren't the ones the probe put there")
m("p-listing-not-compared", PROBE, "          settle(listed, (reply) => reply.status === 200 && listing(reply)),", "          settle(listed, (reply) => reply.status === 200),", T_PROBE,
  "takes an empty list or a batch with no URL as closed only because the service key listed and signed the same object")
m("p-listing-any-object", PROBE, '  const listing = (reply: Reply) => itemsOf(reply.json)?.some((item) => text(item, "name") === OBJECT) === true;',
  "  const listing = (reply: Reply) => itemsOf(reply.json) !== undefined;", T_PROBE,
  "takes an empty list or a batch with no URL as closed only because the service key listed and signed the same object")
m("p-batch-not-compared", PROBE, "          settle(batch, (reply) => reply.status === 200 && signedPath(reply)),", "          settle(batch, (reply) => reply.status === 200),", T_PROBE,
  "takes an empty list or a batch with no URL as closed only because the service key listed and signed the same object")
m("p-batch-any-path", PROBE, '        itemsOf(reply.json)?.some((item) => text(item, "path") === path && signedUrl(item) !== undefined) === true;',
  "        itemsOf(reply.json)?.some((item) => signedUrl(item) !== undefined) === true;", T_PROBE,
  "names the control of the batch when it signs some other path, or none")
m("p-user-refusals-skipped", PROBE, '      await refusals("user", user);\n', "", T_PROBE, "asks every door for each caller: REST for every table, GraphQL, and Storage's buckets and objects")
m("p-anon-refusals-skipped", PROBE, '      await refusals("anon", anon);\n', "", T_PROBE, "asks every door for each caller: REST for every table, GraphQL, and Storage's buckets and objects")
m("p-tables-not-asked", PROBE, "    for (const table of input.tables) {", "    for (const table of [] as string[]) {", T_PROBE,
  "asks every door for each caller: REST for every table, GraphQL, and Storage's buckets and objects")
m("p-profile-header-dropped", PROBE, '    const profile = { "accept-profile": "app" };', "    const profile = {};", T_PROBE,
  "asks REST for the schema app by name, since it would otherwise be asked for the public one")
m("p-anon-with-the-service-key", PROBE, '  const anon: Caller = { kind: "anon", key: input.publishableKey };', '  const anon: Caller = { kind: "anon", key: input.serviceKey };', T_PROBE,
  "passes every check, controls and refusals, and leaves no object, no bucket and no user behind")
m("p-user-with-the-service-key", PROBE, '        user = { kind: "user", key: input.publishableKey, token };', '        user = { kind: "user", key: input.serviceKey, token };', T_PROBE,
  "calls with the key each caller has and no other")
m("p-cleanup-leaves-objects", PROBE, "    for (const object of left.objects) {", "    for (const object of [] as typeof left.objects) {", T_PROBE,
  "passes every check, controls and refusals, and leaves no object, no bucket and no user behind")
m("p-cleanup-leaves-buckets", PROBE, "    for (const bucket of left.buckets) {", "    for (const bucket of [] as typeof left.buckets) {", T_PROBE,
  "removes what a leaked write made, by name, and says it did")
m("p-cleanup-leaves-the-user", PROBE, "    if (left.user !== undefined) {", "    if (false) {", T_PROBE,
  "passes every check, controls and refusals, and leaves no object, no bucket and no user behind")
m("p-user-not-remembered", PROBE, "    if (userId !== undefined) left.user = userId;\n", "", T_PROBE,
  "deletes the user and the objects even when a control throws half-way")
m("p-cleanup-not-in-finally", PROBE, "  } finally {\n    cleaning = true;\n    await cleanup();\n  }", "  } catch (error) {\n    throw error;\n  }\n  cleaning = true;\n  await cleanup();", T_PROBE,
  "deletes the user and the objects even when the run itself throws, which is no excuse to leave them")
m("p-leaked-bucket-not-remembered", PROBE, "      () => left.buckets.push({ name: bucketName, label: `the bucket ${who} made` }),", "      () => undefined,", T_PROBE,
  "removes what a leaked write made, by name, and says it did")
m("p-leaked-object-not-remembered", PROBE, "      () => left.objects.push({ bucket, path: added, label: `the object ${who} added to ${bucket}` }),", "      () => undefined,", T_PROBE,
  "removes what a leaked write made, by name, and says it did")
m("p-kept-never-called", PROBE, "    if (problem !== undefined && asked) kept?.();\n", "", T_PROBE, "removes what a leaked write made, by name, and says it did")
m("p-control-object-not-remembered", PROBE, "      left.objects.push({ bucket, path, label: `the probe object in ${bucket}` });\n", "", T_PROBE,
  "deletes the user and the objects even when a control throws half-way")
m("p-no-answer-is-a-pass", PROBE, "    const problem = reply === undefined ? silence() : verdict(reply);", "    const problem = reply === undefined ? undefined : verdict(reply);", T_PROBE,
  "fails a check, not the run, when a call gets no answer, and still cleans up")
m("p-data-api-stand-in-exposed", PROBE, '    .filter((name) => name !== "" && name !== "pg_pgrst_no_exposed_schemas");', '    .filter((name) => name !== "");', T_PROBE,
  "passes when no schema is exposed, which is how Supabase says the Data API is off")
m("p-data-api-refusal-passes", PROBE, "  if (reply.status !== 200) return [{ name: DATA_API, ok: false, note: `the Management API ${answered(reply)}` }];\n", "", T_PROBE,
  "fails, saying only the status, when the Management API refuses or answers something else")
m("p-data-api-reference-unchecked", PROBE, '  if (!/^[a-z]{20}$/.test(ref)) throw new OpsError("the project\'s reference is twenty letters");\n', "", T_PROBE,
  "refuses a reference that isn't a project's, and asks nothing, since it goes into the path of the request")
m("p-data-api-no-token", PROBE, "      headers: { authorization: `Bearer ${accessToken}` },", "      headers: {},", T_PROBE,
  "asks the project's own configuration with the access token as a bearer, and reads nothing else of it")
m("p-data-api-odd-schema-printed", PROBE, r'''  const plain = (name: string) => (/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(name) ? name : "a schema with an odd name");''',
  "  const plain = (name: string) => name;", T_PROBE, "says a schema's name only when it is a plain one, and otherwise that it has an odd name")
m("p-data-api-exposed-passes", PROBE, "  if (exposed.length === 0) return [{ name: DATA_API, ok: true }];", "  if (true) return [{ name: DATA_API, ok: true }];", T_PROBE,
  "fails when any schema is exposed, naming it as the project's own list says and nothing else")
m("p-db-closed-check-skipped", PROBE, "  const problems = await closedProblems(sql);", "  const problems: string[] = [];", db("src/db/ops-probe.test.ts"),
  "names what is open to an API role, three at most, and counts the rest")
m("p-db-every-problem-named", PROBE, "const SOME = 3;", "const SOME = 30;", db("src/db/ops-probe.test.ts"), "names what is open to an API role, three at most, and counts the rest")
m("p-db-no-tables-passes", PROBE, "    tables.length > 0\n", "    true\n", db("src/db/ops-probe.test.ts"), "fails, saying so, when the schema has no table for REST to be asked for")
m("p-db-partitions-listed", PROBE, " AND c.relkind IN ('r', 'p') AND NOT c.relispartition", " AND c.relkind IN ('r', 'p')", db("src/db/ops-probe.test.ts"),
  "lists tables and partitioned tables of app, and not their partitions, views or other schemas' tables")
m("p-db-partitioned-tables-unlisted", PROBE, " AND c.relkind IN ('r', 'p') AND NOT c.relispartition", " AND c.relkind IN ('r') AND NOT c.relispartition", db("src/db/ops-probe.test.ts"),
  "lists tables and partitioned tables of app, and not their partitions, views or other schemas' tables")
m("p-db-storage-without-rls-passes", PROBE, "      if (!row.rls) found.push(`storage.${wanted} has no row-level security`);\n", "", db("src/db/ops-probe.test.ts"),
  "fails when row-level security is off, which would open every object to every role with a grant")
m("p-db-storage-policy-passes", PROBE, '      if (row.policies !== "0")\n        found.push(', "      if (false)\n        found.push(", db("src/db/ops-probe.test.ts"),
  "fails on a policy on objects, one or more, and on one on buckets")
m("p-db-missing-storage-table-passes", PROBE, "    if (row === undefined) found.push(`storage.${wanted} isn't there`);\n    else {", "    if (row === undefined) {\n    } else {", db("src/db/ops-probe.test.ts"),
  "fails, naming each table, when Storage's tables aren't there, so a probe of the wrong database passes nothing")
m("p-db-buckets-not-looked-at", PROBE, 'for (const wanted of ["buckets", "objects"]) {', 'for (const wanted of ["objects"]) {', db("src/db/ops-probe.test.ts"),
  "fails on a policy on objects, one or more, and on one on buckets")
m("p-db-objects-not-looked-at", PROBE, 'for (const wanted of ["buckets", "objects"]) {', 'for (const wanted of ["buckets"]) {', db("src/db/ops-probe.test.ts"),
  "fails on a policy on objects, one or more, and on one on buckets")

# ---- bootstrap.ts, scram.ts, seed.ts, dev-clock.ts (the real database) ----
T_BOOT = ops("src/bootstrap.test.ts")
T_BOOT_DB = db("src/db/ops-bootstrap.test.ts")
m("bs-short-password-taken", BOOT, "  if (input.password.length < SHORTEST_PASSWORD) {", "  if (false) {", T_BOOT, "refuses a password that is short or not printable ASCII before it starts anything, by name")
m("bs-non-ascii-password-taken", BOOT, "  if (!/^[\\x20-\\x7e]+$/.test(input.password)) {", "  if (false) {", T_BOOT, "refuses a password that is short or not printable ASCII before it starts anything, by name")
m("bs-odd-path-taken", BOOT, "  if (!/^\\/[\\w./-]+$/.test(input.file))", "  if (false)", T_BOOT, "refuses a file path that isn't plain, which would end its quotes")
m("bs-password-on-the-command-line", BOOT, '["-X", "-w", "-v", "ON_ERROR_STOP=1", "-f", "-"]', '["-X", "-w", "-v", "ON_ERROR_STOP=1", "-v", `app_password=${input.password}`, "-f", "-"]', T_BOOT,
  "puts the password nowhere: not in an argument, not in the environment, not in the script")
m("bs-password-in-the-script", BOOT, "const script = `\\\\set app_password '${verifier}'\\n\\\\i '${input.file}'\\n`;", "const script = `\\\\set app_password '${input.password}'\\n\\\\i '${input.file}'\\n`;", T_BOOT,
  "puts the password nowhere: not in an argument, not in the environment, not in the script")
m("bs-errors-not-stopped-on", BOOT, '"-X", "-w", "-v", "ON_ERROR_STOP=1", "-f", "-"]', '"-X", "-w", "-f", "-"]', T_BOOT_DB,
  "fails with what psql says and nothing secret when the file fails, and keeps nothing of it")
m("bs-psql-gets-no-connection", BOOT, "    env: input.pgEnv,\n", "    env: {},\n", T_BOOT, "runs psql with the admin's connection in its environment and the file as a script on standard input")
m("bs-verifier-not-held-back", BOOT, "text.split(verifier).join(REDACTED).split(input.password).join(REDACTED);", "text.split(input.password).join(REDACTED);", T_BOOT,
  "fails with psql's own words when it exits non-zero, holding back the password and the verifier it was given")
m("bs-password-not-held-back", BOOT, "text.split(verifier).join(REDACTED).split(input.password).join(REDACTED);", "text.split(verifier).join(REDACTED);", T_BOOT,
  "fails with psql's own words when it exits non-zero, holding back the password and the verifier it was given")
m("bs-missing-psql-unsaid", BOOT, '  if (result.code === 127) throw new OpsError("bootstrap: psql isn\'t installed here");\n', "", T_BOOT, "says when psql isn't there, and when it doesn't finish")
m("bs-timeout-unsaid", BOOT, '  if (result.timedOut) throw new OpsError("bootstrap: psql didn\'t finish in two minutes");\n', "", T_BOOT, "says when psql isn't there, and when it doesn't finish")
m("bs-failure-unsaid", BOOT, "  if (result.code !== 0) {\n    const lines = scrub", "  if (false) {\n    const lines = scrub", T_BOOT, "fails with psql's own words when it exits non-zero")
m("scram-fewer-iterations", SCRAM, "const ITERATIONS = 4096;", "const ITERATIONS = 4095;", ops("src/scram.test.ts"), "makes a new salt each time, and keeps the password out of the string")
m("scram-client-key-label", SCRAM, 'update("Client Key")', 'update("Client key")', ops("src/scram.test.ts"), "holds the keys of RFC 7677's own exchange")
m("scram-server-key-label", SCRAM, 'update("Server Key")', 'update("Server key")', ops("src/scram.test.ts"), "holds the keys of RFC 7677's own exchange")
m("scram-fixed-salt", SCRAM, "salt: Buffer = randomBytes(16)", "salt: Buffer = Buffer.alloc(16)", ops("src/scram.test.ts"), "makes a new salt each time, and keeps the password out of the string")
m("scram-non-ascii-taken", SCRAM, '  if (!/^[\\x20-\\x7e]+$/.test(password)) throw new Error("the password must be printable ASCII");\n', "", ops("src/scram.test.ts"),
  "takes printable ASCII only, which SASLprep leaves as it is; any other character would be stored changed")
m("scram-names-the-password", SCRAM, 'throw new Error("the password must be printable ASCII");', 'throw new Error(`the password ${password} must be printable ASCII`);', ops("src/scram.test.ts"),
  "never names the password when it refuses")

T_SEED = ops("src/seed.test.ts")
T_SEED_DB = db("src/db/ops-seed.test.ts")
m("seed-odd-file-names-taken", SEED, "    if (!FILE_NAME.test(entry)) throw new OpsError(", "    if (false) throw new OpsError(", T_SEED, "refuses a file that isn't named like a seed, so nothing runs by accident")
m("seed-latin1-taken", SEED, 'new TextDecoder("utf-8", { fatal: true })', 'new TextDecoder("utf-8", { fatal: false })', T_SEED, "refuses text that isn't UTF-8 or holds a NUL")
m("seed-nul-taken", SEED, '    if (text.includes("\\0")) throw new OpsError(', "    if (false) throw new OpsError(", T_SEED, "refuses text that isn't UTF-8 or holds a NUL")
m("seed-missing-folder-fails", SEED, '    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];\n', "", T_SEED, "finds none in a folder that isn't there yet")
m("seed-no-files-unsaid", SEED, '  if (files.length === 0) say("seed: no seed files in db/seed yet");\n', "", T_SEED, "says there are none, and touches no database, when the folder has no files")
m("seed-search-path-not-emptied", SEED, "    await tx`SELECT pg_catalog.set_config('search_path', '', true)`;\n    await tx`SELECT pg_catalog.set_config('tadayo.seed', ${file.text}, true)`;",
  "    await tx`SELECT pg_catalog.set_config('tadayo.seed', ${file.text}, true)`;", T_SEED_DB, "runs it with the search path empty even when the connection's isn't: a file that reads it finds it empty")
m("seed-text-left-in-the-session", SEED, "    await tx`SELECT pg_catalog.set_config('tadayo.seed', '', true)`;\n", "", T_SEED_DB,
  "leaves nothing of the file in the session: its text is cleared, and so is the search path it may have set")
m("seed-search-path-left-as-the-file-set-it", SEED, "    // Last, since the file may have set it: an operator found ahead of pg_catalog's would run in the check.\n    await tx`SELECT pg_catalog.set_config('search_path', '', true)`;\n",
  "", T_SEED_DB, "leaves nothing of the file in the session: its text is cleared, and so is the search path it may have set")
m("seed-transaction-commands-taken", SEED, "    if (/EXECUTE of transaction commands is not implemented|invalid transaction termination/.test(message)) {", "    if (false) {", T_SEED_DB,
  "refuses a file that begins, ends or splits the transaction, which would keep what it wrote before the check")
m("seed-open-schema-taken", SEED, "  if (problems.length > 0) {\n    throw new OpsError(`seed: ${file.name} would leave the schema app open", "  if (false) {\n    throw new OpsError(`seed: ${file.name} would leave the schema app open", T_SEED_DB,
  "refuses a file that would leave the schema open, and names it (T53)")
m("seed-all-files-in-one-transaction", SEED, "  for (const file of files) {\n    await sql.begin((tx) => applySeed(tx, file));\n    say(`seed: applied ${file.name}`);\n    applied.push(file.name);\n  }",
  "  await sql.begin(async (tx) => {\n    for (const file of files) await applySeed(tx, file);\n  });\n  for (const file of files) {\n    say(`seed: applied ${file.name}`);\n    applied.push(file.name);\n  }", T_SEED_DB,
  "applies the files in name order, one transaction each: a failing file keeps nothing, the earlier ones stay")

T_CLOCK_DB = db("src/db/ops-dev-clock.test.ts")
m("dc-schema-not-checked-first", DEVCLOCK, "  const open = await closedProblems(tx);\n  if (open.length > 0) {", "  const open: string[] = [];\n  if (open.length > 0) {", T_CLOCK_DB,
  "changes nothing when the schema isn't closed (T53), and says what's open")
m("dc-table-made-on-a-database-with-days", DEVCLOCK, "    if (days?.any !== false) {", "    if (false) {", T_CLOCK_DB,
  "refuses to make the table on a database that has occurrences, where a clock back at no offset would reopen days (T3)")
m("dc-table-never-made", DEVCLOCK, "    await tx.unsafe(options.makeSql);\n", "", T_CLOCK_DB,
  "makes app.dev_clock when it's missing, closed as the schema demands, and dev's API can start on it")
m("dc-table-made-again", DEVCLOCK, "  const made = !exists.present;", "  const made = true;", T_CLOCK_DB,
  "leaves a table that's there as it is: the same table, triggers and function, and says it made nothing")
m("dc-table-not-checked-as-the-api-checks-it", DEVCLOCK, '  try {\n    await prepareClock("dev", tx);\n  } catch', "  try {\n  } catch", T_CLOCK_DB,
  "won't move a clock whose guard is off: a disabled trigger is refused, as at the API's start-up")
m("dc-move-never-written", DEVCLOCK, "      ON CONFLICT (only_row) DO UPDATE SET offset_microseconds = EXCLUDED.offset_microseconds`;", "      ON CONFLICT (only_row) DO NOTHING`;", T_CLOCK_DB,
  "starts with no row, which is no offset, then keeps the one row it makes")
m("dc-schema-not-checked-after", DEVCLOCK, "  const after = await closedProblems(tx);\n  if (after.length > 0) {", "  const after: string[] = [];\n  if (after.length > 0) {", T_CLOCK_DB,
  "checks the schema again after it, and keeps nothing when the table it made would leave it open")
m("dc-same-target-refused", DEVCLOCK, "  if (offset < current) {", "  if (offset <= current) {", ops("src/dev-clock.test.ts"),
  "takes a target equal to what the clock reads now, and refuses one a microsecond before it (T3)")
m("dc-clock-moved-back", DEVCLOCK, "  if (offset < current) {", "  if (false) {", ops("src/dev-clock.test.ts"),
  "takes a target equal to what the clock reads now, and refuses one a microsecond before it (T3)")
m("dc-longest-offset-refused", DEVCLOCK, "  if (offset > BigInt(LONGEST_OFFSET_DAYS) * MICROSECONDS_PER_DAY) {", "  if (offset >= BigInt(LONGEST_OFFSET_DAYS) * MICROSECONDS_PER_DAY) {", ops("src/dev-clock.test.ts"),
  "goes as far as the longest offset, to the microsecond, and no further")
m("dc-no-longest-offset", DEVCLOCK, "  if (offset > BigInt(LONGEST_OFFSET_DAYS) * MICROSECONDS_PER_DAY) {", "  if (false) {", ops("src/dev-clock.test.ts"),
  "goes as far as the longest offset, to the microsecond, and no further")
m("dc-longest-offset-in-days", DEVCLOCK, "export const LONGEST_OFFSET_DAYS = 366;", "export const LONGEST_OFFSET_DAYS = 365;", ops("src/dev-clock.test.ts"),
  "goes as far as the longest offset, to the microsecond, and no further")
m("dc-offset-from-the-clocks-own-reading", DEVCLOCK, "const offset = target.epochNanoseconds / 1000n - postgresNowMicroseconds;", "const offset = target.epochNanoseconds / 1000n - postgresNowMicroseconds - current;", ops("src/dev-clock.test.ts"),
  "measures the longest offset from Postgres's clock, not from the clock's own reading")
m("dc-microseconds-rounded-up", DEVCLOCK, "const offset = target.epochNanoseconds / 1000n - postgresNowMicroseconds;", "const offset = (target.epochNanoseconds + 999n) / 1000n - postgresNowMicroseconds;", ops("src/dev-clock.test.ts"),
  "drops what is finer than a microsecond, Postgres's own precision")

# ---- the entries: shutdown.ts, main.ts of the API and the worker ----
T_SHUT = api("src/shutdown.test.ts")
T_ENTRY = db("src/db/startup.test.ts")
m("sd-server-not-closed", SHUT, "        const closing = app.close();\n", "        const closing = Promise.resolve();\n", T_SHUT, "stops listening and lets the requests in flight finish before it ends the database's connection, on SIGTERM")
m("sd-connection-not-ended", SHUT, "        await options.sql.end({ timeout: END_SECONDS });\n", "", T_SHUT, "stops listening and lets the requests in flight finish before it ends the database's connection, on SIGTERM")
mm("sd-connection-ended-before-the-server-closes", [one(SHUT, "        const closing = app.close();\n", "        await options.sql.end();\n        const closing = app.close();\n")],
   T_SHUT, "stops listening and lets the requests in flight finish before it ends the database's connection, on SIGTERM")
m("sd-handlers-kept", SHUT, '      events.off("SIGTERM", handlers.SIGTERM);\n      events.off("SIGINT", handlers.SIGINT);\n', "", T_SHUT,
  "closes once: after the first signal it lets go of both, so a second one ends the process as it would have")
m("sd-says-stopped-after-a-failure", SHUT, '      if (clean) options.say("api: stopped");', '      options.say("api: stopped");', T_SHUT,
  "still ends the database's connection when closing the server fails, and says so without the error's own words")
m("sd-close-failure-unsaid", SHUT, '        options.fail("api: the server didn\'t close cleanly");\n', "", T_SHUT,
  "still ends the database's connection when closing the server fails, and says so without the error's own words")
m("sd-stop-unsaid", SHUT, "      options.say(`api: stopping on ${signal}`);\n", "", T_SHUT, "stops listening and lets the requests in flight finish before it ends the database's connection, on SIGTERM")
m("api-never-stops-on-a-signal", APIMAIN, "  void stopOnSignal({\n    app,", "  void Promise.resolve({\n    app,", T_ENTRY, "SIGTERM")
m("api-stop-exits-with-failure", APIMAIN, "  }).then(() => process.exit());", "  }).then(() => process.exit(1));", T_ENTRY, "SIGTERM")
m("worker-not-held-open", WORKERMAIN, "  const hold = setInterval(() => undefined, 60_000);\n", "", T_ENTRY, "starts with prod and stays up, with no jobs yet, until it is told to stop")
m("worker-ignores-sigint", WORKERMAIN, '    process.once("SIGINT", () => {\n      resolve("SIGINT");\n    });\n', "", T_ENTRY, "SIGINT")
m("worker-ignores-sigterm", WORKERMAIN, '    process.once("SIGTERM", () => {\n      resolve("SIGTERM");\n    });\n', "", T_ENTRY, "SIGTERM")
m("worker-holds-its-connection", WORKERMAIN, "  await sql.end();\n  process.stdout.write", "  process.stdout.write", T_ENTRY, "starts with prod and stays up")
m("worker-stop-unsaid", WORKERMAIN, "  process.stdout.write(`worker: stopped on ${signal}\\n`);\n", "", T_ENTRY, "SIGTERM")
m("worker-start-unsaid", WORKERMAIN, '  process.stdout.write("worker: started, with no jobs yet\\n");\n', "", T_ENTRY, "starts with prod and stays up")

# ---- apps/web ----
m("web-association-up-to-a-megabyte", WEB, "const MOST_BYTES = 128 * 1024;", "const MOST_BYTES = 1024 * 1024;", T_WEB, "refuses a file Apple would refuse for its size")
m("web-association-not-json-taken", WEB, '  } catch {\n    return ["isn\'t JSON"];\n  }', "  } catch {\n    return [];\n  }", T_WEB, "says what is wrong with a file that isn't that, one problem each")
m("web-association-other-keys-taken", WEB, "  if (stray.length > 0) problems.push(", "  if (false) problems.push(", T_WEB, "says what is wrong with a file that isn't that, one problem each")
m("web-association-details-not-a-list-taken", WEB, '  if (!Array.isArray(details)) return [...problems, "applinks.details isn\'t a list"];\n', "", T_WEB,
  "says what is wrong with a file that isn't that, one problem each")
m("web-association-no-app-ids-taken", WEB, "    if (!Array.isArray(ids) || ids.length === 0) problems.push(`${where} has no appIDs`);", "    if (!Array.isArray(ids)) problems.push(`${where} has no appIDs`);", T_WEB,
  "says what is wrong with a file that isn't that, one problem each")
m("web-association-odd-app-id-taken", WEB, '        if (typeof id !== "string" || !APP_ID.test(id)) {', '        if (typeof id !== "string") {', T_WEB, "says what is wrong with a file that isn't that, one problem each")
m("web-association-no-path-taken", WEB, '        if (typeof path !== "string") problems.push(', "        if (false) problems.push(", T_WEB, "says what is wrong with a file that isn't that, one problem each")
m("web-association-relative-path-taken", WEB, "        else if (!path.startsWith(\"/\")) problems.push(", "        else if (false) problems.push(", T_WEB, "says what is wrong with a file that isn't that, one problem each")
m("web-headers-rule-missing-taken", WEB, "  if (rule === undefined) return [`has no rule for ${ASSOCIATION_PATH}`];\n", "", T_WEB, "says what is missing or wrong")
m("web-headers-type-missing-taken", WEB, "  if (types.length === 0) return [`has no Content-Type for ${ASSOCIATION_PATH}`];\n", "", T_WEB, "says what is missing or wrong")
m("web-headers-other-type-taken", WEB, '  if (types.length !== 1 || types[0] !== "application/json") {', "  if (false) {", T_WEB, "says what is missing or wrong")
m("web-headers-type-case-sensitive", WEB, "/^content-type\\s*:/i", "/^content-type\\s*:/", T_WEB, "wants the association file served as JSON")
m("web-same-folder-taken", WEB, '  if (source === out) throw new Error("web: the source and the output are the same folder");', "", T_WEB,
  "refuses a source or an output that is the other's folder, so a build can't erase the site")
m("web-output-inside-source-taken", WEB, "  if (out.startsWith(`${source}${sep}`))\n    throw new Error(\"web: the output is inside the source, and would be copied into itself\");\n", "", T_WEB,
  "refuses a source or an output that is the other's folder, so a build can't erase the site")
m("web-source-inside-output-taken", WEB, "  if (source.startsWith(`${out}${sep}`))\n    throw new Error(\"web: the output contains the source, which the build would erase\");\n", "", T_WEB,
  "refuses a source or an output that is the other's folder, so a build can't erase the site")
m("web-wrong-site-built-anyway", WEB, "  if (problems.length > 0) throw new Error(", "  if (false) throw new Error(", T_WEB, "builds nothing when the association file is missing or wrong, and leaves the old output as it was")
m("web-404-not-wanted", WEB, '  found("404.html");\n', "", T_WEB, "builds nothing when the association file is missing or wrong")
m("web-old-output-kept", WEB, "  rmSync(out, { recursive: true, force: true });\n", "", T_WEB, "replaces what a build before it left, so a file that was taken out isn't kept")
m("web-dot-folders-skipped", WEB, "  cpSync(source, out, { recursive: true });", "  cpSync(source, out, { recursive: true, filter: (path) => !/[\\\\/]\\.[^\\\\/]+([\\\\/]|$)/.test(path.slice(source.length)) });", T_WEB,
  "copies the site whole, dot-folders included, into an empty folder, and says what it made")
m("web-folders-counted-as-files", WEB, "  const files = readdirSync(out, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());",
  "  const files = readdirSync(out, { recursive: true, withFileTypes: true });", T_WEB, "copies the site whole, dot-folders included, into an empty folder, and says what it made")
m("web-index-sends-a-request", INDEX, "    <title>Tadayo</title>\n", "    <title>Tadayo</title>\n    <script>fetch('/x')</script>\n", T_WEB,
  "makes no request, and carries no script, so a page of it can't send anything anywhere")
m("web-index-indexed", INDEX, '    <meta name="robots" content="noindex" />\n', "", T_WEB, "makes no request, and carries no script, so a page of it can't send anything anywhere")
m("web-association-claims-an-app", ASSOC, '"details": []', '"details": [{"appIDs": ["ABCDE12345.app.tadayo"], "components": [{"/": "/join/*"}]}]', T_WEB,
  "claims no app and no path yet: the slice that adds the invitation page adds them, with its team ID")
m("web-headers-serve-text", HEADERS, "  Content-Type: application/json", "  Content-Type: text/plain", T_WEB, "builds, and has what Cloudflare Pages and Apple need")

# ---- Dockerfile, .dockerignore, fly.toml: the static checks (deploy-files.test.ts) ----
DIGEST = "@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc"
m("df-base-not-pinned", DOCKER, DIGEST, "", T_FILES, "has one base, pinned by digest, at the Node major .nvmrc names, for both stages")
m("df-base-of-another-major", DOCKER, "ARG NODE_IMAGE=node:26.13.1-trixie-slim", "ARG NODE_IMAGE=node:24.13.1-trixie-slim", T_FILES, "has one base, pinned by digest, at the Node major .nvmrc names, for both stages")
m("df-second-base", DOCKER, "FROM ${NODE_IMAGE}\nENV NODE_ENV=production", "FROM node:26.13.0-trixie-slim\nENV NODE_ENV=production", T_FILES, "has one base, pinned by digest, at the Node major .nvmrc names, for both stages")
m("df-another-pnpm", DOCKER, "pnpm@12.16.1", "pnpm@12.16.0", T_FILES, "installs the pnpm the repository pins")
m("df-lockfile-not-frozen", DOCKER, "pnpm install --frozen-lockfile --prod", "pnpm install --prod", T_FILES,
  "installs the production dependencies of the packages the process groups run, and of the ops scripts, from the lockfile")
m("df-dev-dependencies-installed", DOCKER, "pnpm install --frozen-lockfile --prod", "pnpm install --frozen-lockfile", T_FILES,
  "installs the production dependencies of the packages the process groups run, and of the ops scripts, from the lockfile")
m("df-worker-dependencies-not-installed", DOCKER, ' --filter "@tadayo/worker..."', "", T_FILES,
  "installs the production dependencies of the packages the process groups run, and of the ops scripts, from the lockfile")
m("df-ops-dependencies-not-installed", DOCKER, ' --filter "@tadayo/ops..."', "", T_FILES,
  "installs the production dependencies of the packages the process groups run, and of the ops scripts, from the lockfile")
m("df-everything-installed", DOCKER, ' --filter "@tadayo/api..." --filter "@tadayo/worker..." --filter "@tadayo/ops..."', "", T_FILES,
  "installs the production dependencies of the packages the process groups run, and of the ops scripts, from the lockfile")
m("df-manifest-not-copied", DOCKER, "COPY tests/package.json tests/\n", "", T_FILES,
  "copies every workspace package's manifest before it installs, and the source of what runs and what it needs, and nothing else")
m("df-docs-copied", DOCKER, "COPY tools/ops/src tools/ops/src\n", "COPY tools/ops/src tools/ops/src\nCOPY docs docs\n", T_FILES,
  "copies every workspace package's manifest before it installs, and the source of what runs and what it needs, and nothing else")
m("df-worker-source-not-copied", DOCKER, "COPY services/worker/src services/worker/src\n", "", T_FILES,
  "copies every workspace package's manifest before it installs, and the source of what runs and what it needs, and nothing else")
m("df-ops-source-not-copied", DOCKER, "COPY tools/ops/src tools/ops/src\n", "", T_FILES,
  "copies every workspace package's manifest before it installs, and the source of what runs and what it needs, and nothing else")
m("df-runs-as-root", DOCKER, "USER node\n", "", T_FILES, "runs, in the stage that is the image, as an unprivileged user and in production")
m("df-runs-as-root-explicitly", DOCKER, "USER node\n", "USER root\n", T_FILES, "runs, in the stage that is the image, as an unprivileged user and in production")
m("df-not-in-production", DOCKER, "ENV NODE_ENV=production\n", "", T_FILES, "runs, in the stage that is the image, as an unprivileged user and in production")
m("df-bare-run-starts-the-worker", DOCKER, 'CMD ["node", "services/api/src/main.ts"]', 'CMD ["node", "services/worker/src/main.ts"]', T_FILES,
  "puts the ops entry where the runner starts it, and the API's command where a bare run starts it")
m("df-ops-entry-elsewhere", DOCKER, "FROM ${NODE_IMAGE}\nENV NODE_ENV=production\nWORKDIR /app", "FROM ${NODE_IMAGE}\nENV NODE_ENV=production\nWORKDIR /srv", T_FILES,
  "puts the ops entry where the runner starts it, and the API's command where a bare run starts it")
m("df-secret-in-an-env", DOCKER, "ENV NODE_ENV=production\n", "ENV NODE_ENV=production\nENV SUPABASE_SERVICE_KEY=fixture\n", T_FILES, "names no secret, key, password or environment file in what it sets or copies")
m("df-env-file-copied", DOCKER, "COPY tools/ops/src tools/ops/src\n", "COPY tools/ops/src tools/ops/src\nCOPY .env .env\n", T_FILES, "names no secret, key, password or environment file in what it sets or copies")
m("di-not-an-allowlist", DIGNORE, "*\n\n!package.json", "!package.json", T_FILES, "is an allowlist: everything out, then exactly what the Dockerfile copies")
m("di-source-not-allowed", DIGNORE, "!services/worker/src\n", "", T_FILES, "is an allowlist: everything out, then exactly what the Dockerfile copies")
m("di-extra-allowed", DIGNORE, "!tools/ops/src\n", "!tools/ops/src\n!tools/ci\n", T_FILES, "is an allowlist: everything out, then exactly what the Dockerfile copies")
m("di-git-allowed", DIGNORE, "!tools/ops/src\n", "!tools/ops/src\n!.git\n", T_FILES, "lets nothing of the repository's records, renders, history or secrets in, and keeps tests and node_modules out")
m("di-docs-allowed", DIGNORE, "!tools/ops/src\n", "!tools/ops/src\n!docs\n", T_FILES, "lets nothing of the repository's records, renders, history or secrets in, and keeps tests and node_modules out")
m("di-env-files-allowed", DIGNORE, "!tools/ops/src\n", "!tools/ops/src\n!.env\n", T_FILES, "lets nothing of the repository's records, renders, history or secrets in, and keeps tests and node_modules out")
m("di-tests-allowed", DIGNORE, "**/*.test.ts\n", "", T_FILES, "lets nothing of the repository's records, renders, history or secrets in, and keeps tests and node_modules out")
m("di-node-modules-allowed", DIGNORE, "**/node_modules\n", "", T_FILES, "lets nothing of the repository's records, renders, history or secrets in, and keeps tests and node_modules out")
m("ft-another-region", FLYTOML, 'primary_region = "iad"', 'primary_region = "ord"', T_FILES, "is the dev app, in Virginia, built from the Dockerfile, with one rolling strategy and no release command")
m("ft-another-app", FLYTOML, 'app = "tadayo-api-dev"', 'app = "tadayo-api"', T_FILES, "is the dev app, in Virginia, built from the Dockerfile, with one rolling strategy and no release command")
m("ft-another-strategy", FLYTOML, 'strategy = "rolling"', 'strategy = "bluegreen"', T_FILES, "is the dev app, in Virginia, built from the Dockerfile, with one rolling strategy and no release command")
m("ft-release-command", FLYTOML, '  strategy = "rolling"\n', '  strategy = "rolling"\n  release_command = "node tools/ops/src/migrate-cli.ts"\n', T_FILES,
  "is the dev app, in Virginia, built from the Dockerfile, with one rolling strategy and no release command")
m("ft-another-dockerfile", FLYTOML, 'dockerfile = "Dockerfile"', 'dockerfile = "Dockerfile.dev"', T_FILES, "is the dev app, in Virginia, built from the Dockerfile, with one rolling strategy and no release command")
m("ft-no-worker-group", FLYTOML, '  worker = "node services/worker/src/main.ts"\n', "", T_FILES, "has the two process groups, each running a file that is there, and no other")
m("ft-a-group-runs-nothing", FLYTOML, 'node services/worker/src/main.ts"', 'node services/worker/src/mian.ts"', T_FILES, "has the two process groups, each running a file that is there, and no other")
m("ft-a-third-group", FLYTOML, '  worker = "node services/worker/src/main.ts"\n', '  worker = "node services/worker/src/main.ts"\n  extra = "node services/api/src/main.ts"\n', T_FILES,
  "has the two process groups, each running a file that is there, and no other")
m("ft-service-unscoped", FLYTOML, '  processes = ["api"]\n  protocol = "tcp"', '  protocol = "tcp"', T_FILES, "scopes every section that binds to a group to its group: flyctl refuses an unscoped service, and the others go to one group only")
m("ft-restart-unscoped", FLYTOML, '  policy = "on-failure"\n  processes = ["api", "worker"]\n', '  policy = "on-failure"\n', T_FILES,
  "scopes every section that binds to a group to its group: flyctl refuses an unscoped service, and the others go to one group only")
m("ft-another-internal-port", FLYTOML, "internal_port = 8080", "internal_port = 3000", T_FILES, "serves the API's port over TLS, redirects plain HTTP, never stops the Machine, and checks the port, not a route")
m("ft-plain-http-served", FLYTOML, "    force_https = true\n", "", T_FILES, "serves the API's port over TLS, redirects plain HTTP, never stops the Machine, and checks the port, not a route")
m("ft-machine-stops-when-idle", FLYTOML, 'auto_stop_machines = "off"', 'auto_stop_machines = "stop"', T_FILES, "serves the API's port over TLS, redirects plain HTTP, never stops the Machine, and checks the port, not a route")
m("ft-no-tls-port", FLYTOML, '    handlers = ["tls", "http"]', '    handlers = ["http"]', T_FILES, "serves the API's port over TLS, redirects plain HTTP, never stops the Machine, and checks the port, not a route")
m("ft-checks-a-route", FLYTOML, "  [[services.tcp_checks]]", '  [[services.http_checks]]\n    path = "/healthz"\n    interval = "15s"\n    timeout = "3s"\n\n  [[services.tcp_checks]]', T_FILES,
  "serves the API's port over TLS, redirects plain HTTP, never stops the Machine, and checks the port, not a route")
m("ft-no-check", FLYTOML, '  [[services.tcp_checks]]\n    grace_period = "20s"\n    interval = "15s"\n    timeout = "3s"\n', "", T_FILES,
  "serves the API's port over TLS, redirects plain HTTP, never stops the Machine, and checks the port, not a route")
m("ft-stops-with-sigint", FLYTOML, 'kill_signal = "SIGTERM"', 'kill_signal = "SIGINT"', T_FILES, "stops each group with SIGTERM and time to finish, and restarts one only when it failed")
m("ft-no-time-to-finish", FLYTOML, "kill_timeout = 30", "kill_timeout = 1", T_FILES, "stops each group with SIGTERM and time to finish, and restarts one only when it failed")
m("ft-always-restarts", FLYTOML, 'policy = "on-failure"', 'policy = "always"', T_FILES, "stops each group with SIGTERM and time to finish, and restarts one only when it failed")
m("ft-a-machine-for-one-group-only", FLYTOML, '[[vm]]\n  size = "shared-cpu-1x"', '[[vm]]\n  processes = ["api"]\n  size = "shared-cpu-1x"', T_FILES, "gives every group the same small Machine, and says so once")
m("ft-a-bigger-machine", FLYTOML, 'memory = "512mb"', 'memory = "8gb"', T_FILES, "gives every group the same small Machine, and says so once")
m("ft-a-secret-in-env", FLYTOML, '  LOG_LEVEL = "info"', '  LOG_LEVEL = "info"\n  DATABASE_URL = "postgresql://tadayo_app.rhsycmycocbzakrydahi:x@aws-0-us-east-1.pooler.supabase.com:5432/postgres"', T_FILES,
  "has only public values in [env]: the project's URL and publishable key, as the iOS app's Dev build has them")
m("ft-another-project", FLYTOML, "https://rhsycmycocbzakrydahi.supabase.co", "https://abcdefghijklmnopqrst.supabase.co", T_FILES,
  "has only public values in [env]: the project's URL and publishable key, as the iOS app's Dev build has them")
m("ft-another-publishable-key", FLYTOML, "sb_publishable_5kJcQ8JCyWiHHMGjucf00w_8ehpABvL", "sb_publishable_5kJcQ8JCyWiHHMGjucf00w_8ehpABvM", T_FILES,
  "has only public values in [env]: the project's URL and publishable key, as the iOS app's Dev build has them")
m("ft-prod-environment", FLYTOML, 'TADAYO_ENVIRONMENT = "dev"', 'TADAYO_ENVIRONMENT = "prod"', T_FILES,
  "has only public values in [env]: the project's URL and publishable key, as the iOS app's Dev build has them")
m("ft-service-key-named-in-a-comment-free-line", FLYTOML, '  LOG_LEVEL = "info"', '  LOG_LEVEL = "info"\n  SUPABASE_SERVICE_KEY = "x"', T_FILES, "names no secret anywhere: the database's string and the service key are Fly's, set by the founder")

# ---- output.ts: the redactor, what a failure and a notice print (T52, T56) ----
OUTPUT = f"{OPS}/output.ts"
SPAWN = f"{OPS}/spawn.ts"
MAIN = f"{OPS}/main.ts"
T_OUT = ops("src/output.test.ts")
T_SPAWN = ops("src/spawn.test.ts")
T_MAIN = ops("src/main.test.ts")
W_VARS = "holds back the value of each of the seven secret variables on its own, whatever it looks like"
W_TOKEN = "holds back what looks like a token whether or not the environment gave it: a JWT, a Supabase secret key, a SCRAM verifier, a Fly token"
W_SHAPES = "holds back a token of each shape the patterns know, with an empty environment"
W_FLYSTR = "holds back a Fly token's whole string, however the pieces after the word are joined"
W_DASH = "holds back a JWT whose parts have the dashes and underscores of base64url"
W_CONN = "holds back the user and password of any connection string in a line, even one the environment never held"
W_PWFORMS = "holds back a connection string's password, as it is written in the string and decoded"
W_BADPCT = "holds back a connection string's password that isn't percent-encoded properly, as it is written"
W_EIGHT = "holds back a value of eight characters and leaves a value of seven alone"
W_LONGER = "holds back a longer value whole when a shorter one is inside it"
W_BLANK = "does not blank ordinary text because a short or empty value is set"
W_BLANK2 = "does not blank ordinary text because a connection string has no password, or one too short to be one"

for variable in ["DATABASE_URL", "DATABASE_ADMIN_URL", "DATABASE_APP_PASSWORD", "SUPABASE_SERVICE_KEY", "SUPABASE_ACCESS_TOKEN", "FLY_API_TOKEN", "GITHUB_TOKEN"]:
    m(f"out-variable-{variable.lower().replace('_', '-')}-not-held-back", OUTPUT, f'  "{variable}",\n', "", T_OUT, W_VARS)

JWT_LINE = r"""  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, REDACTED], // a JWT: a user's token, a legacy key
"""
SBSECRET_LINE = r"""  [/\bsb_secret_[\w-]+/g, REDACTED], // a Supabase secret key
"""
SBP_LINE = r"""  [/\bsbp_[0-9a-f]{20,}/g, REDACTED], // a Supabase access token
"""
GH_LINE = r"""  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, REDACTED], // a GitHub token
"""
GHPAT_LINE = r"""  [/\bgithub_pat_\w{20,}/g, REDACTED],
"""
FLY_LINE = r"""  [/FlyV1 [\w+/=,-]+/g, REDACTED], // a Fly token
"""
FM_LINE = r"""  [/\bfm[12]_[\w+/=-]{16,}/g, REDACTED],
"""
SCRAMPAT_LINE = r"""  [/SCRAM-SHA-256\$[\w+/=:$-]+/g, REDACTED], // a role's password as Postgres stores it
"""
CONN_LINE = r"""  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s'"@]*@/gi, `$1${REDACTED}@`], // a connection string's user and password
"""
for name, line, words, first_words in [
    ("jwt", JWT_LINE, W_TOKEN, W_SHAPES), ("supabase-secret-key", SBSECRET_LINE, W_TOKEN, W_SHAPES),
    ("supabase-access-token", SBP_LINE, W_TOKEN, W_SHAPES), ("github-token", GH_LINE, W_TOKEN, W_SHAPES),
    ("github-fine-grained-token", GHPAT_LINE, W_SHAPES, W_SHAPES), ("fly-token", FLY_LINE, W_FLYSTR, W_SHAPES),
    ("fly-token-piece", FM_LINE, W_SHAPES, W_SHAPES), ("scram-verifier", SCRAMPAT_LINE, W_TOKEN, W_TOKEN),
    ("connection-string", CONN_LINE, W_CONN, W_CONN),
]:
    m(f"out-pattern-{name}-taken-out", OUTPUT, line, "", T_OUT, words)
    flags = "/gi," if line.rstrip().find("/gi,") != -1 else "/g,"
    m(f"out-pattern-{name}-only-the-first", OUTPUT, line, line.replace(flags, flags.replace("g", "", 1), 1), T_OUT, first_words)

m("out-jwt-parts-without-dashes", OUTPUT, r"[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}", r"\w{8,}\.\w{8,}\.\w{8,}", T_OUT, W_DASH)
m("out-sb-secret-key-without-dashes", OUTPUT, r"\bsb_secret_[\w-]+", r"\bsb_secret_\w+", T_OUT, W_SHAPES)
m("out-sbp-minimum-too-long", OUTPUT, r"\bsbp_[0-9a-f]{20,}", r"\bsbp_[0-9a-f]{50,}", T_OUT, W_TOKEN)
for letter, kinds in [("p", "ousr"), ("o", "pusr"), ("u", "posr"), ("s", "pour"), ("r", "pous")]:
    m(f"out-github-token-kind-{letter}-missed", OUTPUT, r"\bgh[pousr]_", rf"\bgh[{kinds}]_", T_OUT, W_SHAPES)
m("out-github-token-minimum-too-long", OUTPUT, r"\bgh[pousr]_[A-Za-z0-9]{20,}", r"\bgh[pousr]_[A-Za-z0-9]{40,}", T_OUT, W_SHAPES)
m("out-github-token-lower-case-only", OUTPUT, r"\bgh[pousr]_[A-Za-z0-9]{20,}", r"\bgh[pousr]_[a-z0-9]{20,}", T_OUT, W_SHAPES)
m("out-github-fine-grained-minimum-too-long", OUTPUT, r"\bgithub_pat_\w{20,}", r"\bgithub_pat_\w{50,}", T_OUT, W_SHAPES)
m("out-github-fine-grained-without-underscores", OUTPUT, r"\bgithub_pat_\w{20,}", r"\bgithub_pat_[A-Za-z0-9]{20,}", T_OUT, W_SHAPES)
for char, kept in [("comma", r"[\w+/=-]"), ("plus", r"[\w/=,-]"), ("slash", r"[\w+=,-]"), ("equals", r"[\w+/,-]"), ("dash", r"[\w+/=,]")]:
    m(f"out-fly-token-without-{char}", OUTPUT, r"FlyV1 [\w+/=,-]+", f"FlyV1 {kept}+", T_OUT, W_FLYSTR)
for kinds, name in [("2", "one"), ("1", "two")]:
    m(f"out-fly-token-piece-{name}-missed", OUTPUT, r"\bfm[12]_", rf"\bfm[{kinds}]_", T_OUT, W_SHAPES)
for char, kept in [("plus", r"[\w/=-]"), ("slash", r"[\w+=-]"), ("equals", r"[\w+/-]"), ("dash", r"[\w+/=]")]:
    m(f"out-fly-token-piece-without-{char}", OUTPUT, r"[\w+/=-]{16,}", f"{kept}{{16,}}", T_OUT, W_SHAPES)
m("out-fly-token-piece-minimum-too-long", OUTPUT, r"[\w+/=-]{16,}", r"[\w+/=-]{40,}", T_OUT, W_SHAPES)
for char, kept in [("plus", r"[\w/=:$-]"), ("slash", r"[\w+=:$-]"), ("equals", r"[\w+/:$-]"), ("colon", r"[\w+/=$-]"), ("dollar", r"[\w+/=:-]")]:
    m(f"out-scram-verifier-without-{char}", OUTPUT, r"SCRAM-SHA-256\$[\w+/=:$-]+", rf"SCRAM-SHA-256\${kept}+", T_OUT, W_TOKEN)
m("out-connection-string-keeps-no-mark", OUTPUT, "`$1${REDACTED}@`", "`$1@`", T_OUT, W_CONN)

m("out-short-values-held-back", OUTPUT, "if (value === undefined || value.length < SHORTEST) continue;", "if (value === undefined || value.length < 1) continue;", T_OUT, W_BLANK)
m("out-empty-values-held-back", OUTPUT, "if (value === undefined || value.length < SHORTEST) continue;", "if (value === undefined) continue;", T_OUT, W_BLANK)
m("out-shortest-nine", OUTPUT, "const SHORTEST = 8;", "const SHORTEST = 9;", T_OUT, W_EIGHT)
m("out-shortest-seven", OUTPUT, "const SHORTEST = 8;", "const SHORTEST = 7;", T_OUT, W_EIGHT)
m("out-password-forms-unfiltered", OUTPUT, "if (form.length >= SHORTEST) values.add(form);", "values.add(form);", T_OUT, W_BLANK2)
m("out-password-as-written-not-kept", OUTPUT, "const forms = [password];", "const forms: string[] = [];", T_OUT, W_PWFORMS)
m("out-password-decoded-not-kept", OUTPUT, "forms.push(decodeURIComponent(password));", "forms.push(password);", T_OUT, W_PWFORMS)
m("out-non-url-value-throws", OUTPUT, """  let password: string;
  try {
    password = new URL(value).password;
  } catch {
    return [];
  }
""", "  const password = new URL(value).password;\n", T_OUT, "re:Invalid URL")
m("out-bad-percent-encoding-throws", OUTPUT, """  try {
    forms.push(decodeURIComponent(password));
  } catch {
    // not percent-encoded
  }
""", "  forms.push(decodeURIComponent(password));\n", T_OUT, W_BADPCT)
m("out-values-in-variable-order", OUTPUT, "const exact = [...values].sort((a, b) => b.length - a.length);", "const exact = [...values];", T_OUT, W_LONGER)
m("out-values-shortest-first", OUTPUT, "const exact = [...values].sort((a, b) => b.length - a.length);", "const exact = [...values].sort((a, b) => a.length - b.length);", T_OUT, W_LONGER)
m("out-values-not-replaced", OUTPUT, "    for (const value of exact) out = out.split(value).join(REDACTED);\n", "", T_OUT, W_VARS)
m("out-patterns-not-applied", OUTPUT, "    for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);\n", "", T_OUT, W_TOKEN)

m("out-failure-prints-the-stack", OUTPUT, 'return error instanceof Error ? error.message : "ops: the script failed";', 'return error instanceof Error ? (error.stack ?? error.message) : "ops: the script failed";', T_OUT, "is an error's message and never its stack")
m("out-failure-prints-what-was-thrown", OUTPUT, 'return error instanceof Error ? error.message : "ops: the script failed";', "return error instanceof Error ? error.message : String(error);", T_OUT, "is plain words for anything that isn't an error, and none of what was thrown")
for severity in ["NOTICE", "DEBUG", "LOG"]:
    m(f"out-notice-{severity.lower()}-said", OUTPUT, f'severity === "{severity}"', "false", T_OUT, "says nothing of Postgres's routine notices: NOTICE, DEBUG and LOG", count=1)
m("out-notice-unsaid-severity", OUTPUT, "return `ops: ${severity}: ${String(notice[\"message\"])}`;", "return `ops: ${String(notice[\"message\"])}`;", T_OUT, "says a warning, and anything worse, with its severity and its words")
m("out-notice-unsaid-words", OUTPUT, "return `ops: ${severity}: ${String(notice[\"message\"])}`;", "return `ops: ${severity}`;", T_OUT, "says a warning, and anything worse, with its severity and its words")

# ---- spawn.ts: no shell, the environment given and PATH, a time limit that kills (T56) ----
m("spawn-whole-environment", SPAWN, 'env: { PATH: process.env["PATH"] ?? "", ...options.env },', "env: { ...process.env, ...options.env },", T_SPAWN, "gives the child the environment it is given and PATH, and nothing else of this process's")
m("spawn-no-path", SPAWN, 'env: { PATH: process.env["PATH"] ?? "", ...options.env },', "env: { ...options.env },", T_SPAWN, "gives the child the environment it is given and PATH, and nothing else of this process's")
m("spawn-given-environment-dropped", SPAWN, 'env: { PATH: process.env["PATH"] ?? "", ...options.env },', 'env: { PATH: process.env["PATH"] ?? "" },', T_SPAWN, "gives the child the environment it is given and PATH, and nothing else of this process's")
m("spawn-through-a-shell", SPAWN, "      cwd: options.cwd,\n", "      cwd: options.cwd,\n      shell: true,\n", T_SPAWN, "reads no argument as anything but an argument: there is no shell")
m("spawn-cwd-ignored", SPAWN, "      cwd: options.cwd,\n", "", T_SPAWN, "runs the child where it is told to")
m("spawn-timeout-never-set", SPAWN, "      options.timeoutMs === undefined\n        ? undefined", "      true\n        ? undefined", T_SPAWN, "kills a child that outlives its time, and says it ran out of time and has no exit code")
m("spawn-child-not-killed", SPAWN, '            child.kill("SIGKILL");\n', "", T_SPAWN, "kills a child that outlives its time, and says it ran out of time and has no exit code")
m("spawn-time-out-not-said", SPAWN, "            timedOut = true;\n", "", T_SPAWN, "kills a child that outlives its time, and says it ran out of time and has no exit code")
m("spawn-timer-kept-after-exit", SPAWN, "    child.on(\"close\", (code) => {\n      if (timer) clearTimeout(timer);\n", "    child.on(\"close\", (code) => {\n", T_SPAWN, "doesn't hold the process that ran it open once the child is done, whatever time it was given")
m("spawn-missing-program-another-code", SPAWN, "        code: 127,\n", "        code: 1,\n", T_SPAWN, "says a program that isn't there as exit code 127 and its name, and throws nothing")
m("spawn-missing-program-unnamed", SPAWN, 'error.code === "ENOENT" ? `${command}: not found`', 'error.code === "ENOENT" ? "not found"', T_SPAWN, "says a program that isn't there as exit code 127 and its name, and throws nothing")
m("spawn-other-failure-called-not-found", SPAWN, 'error.code === "ENOENT" ? `${command}: not found` :', "true ? `${command}: not found` :", T_SPAWN, "says a program that can't start for another reason as exit code 127 and the reason, and throws nothing")
m("spawn-stdin-error-thrown", SPAWN, "    child.stdin.on(\"error\", () => undefined);\n", "", T_SPAWN, "re:isn't thrown by a child that exits without reading its input|EPIPE")
m("spawn-input-never-closed", SPAWN, 'child.stdin.end(options.input ?? "");', 'child.stdin.write(options.input ?? "");', T_SPAWN, "writes the input to the child's standard input and closes it, and closes it at once when there is none")
m("spawn-input-dropped", SPAWN, 'child.stdin.end(options.input ?? "");', 'child.stdin.end("");', T_SPAWN, "writes the input to the child's standard input and closes it, and closes it at once when there is none")
m("spawn-stderr-with-stdout", SPAWN, 'child.stderr.on("data", (chunk: Buffer) => err.push(chunk));', 'child.stderr.on("data", (chunk: Buffer) => out.push(chunk));', T_SPAWN, "collects standard output and standard error apart, and the exit code")
m("spawn-resolves-on-exit", SPAWN, 'child.on("close", (code) => {', 'child.on("exit", (code) => {', T_SPAWN, "waits for the streams to close, and not only for the child to exit: what the child's own children write is kept")
# ---- main.ts: the entry that prints through the redactor and fails with code 1 (T52, T56) ----
m("main-failure-not-redacted", MAIN, "console.error(redact(failureText(error)));", "console.error(failureText(error));", T_MAIN, "holds back the environment's token from a failure's message, and prints no stack")
m("main-line-not-redacted", MAIN, "console.log(redact(line));", "console.log(line);", T_MAIN, "holds back the environment's token from a line a script says, and exits 0 when the script worked")
m("main-redactor-without-the-environment", MAIN, "const redact = redactor(process.env);", "const redact = redactor({});", T_MAIN, "holds back the environment's token from a failure's message, and prints no stack")
m("main-failure-exits-0", MAIN, "  process.exitCode = 1;\n", "", T_MAIN, "names the scripts and fails, with nothing on standard output, when no script is named")
m("main-failure-prints-the-stack", MAIN, "console.error(redact(failureText(error)));", 'console.error(redact(error instanceof Error ? (error.stack ?? error.message) : "ops: the script failed"));', T_MAIN, "holds back the environment's token from a failure's message, and prints no stack")
m("main-repository-one-folder-down", MAIN, 'repo: join(import.meta.dirname, "..", "..", ".."),', 'repo: join(import.meta.dirname, "..", ".."),', T_MAIN, "gives the scripts the repository's root: bootstrap names db/bootstrap.sql by its whole path")
m("main-script-not-the-first-argument", MAIN, "await runScript(process.argv[2], {", "await runScript(process.argv[3], {", T_MAIN, "names the scripts and fails when the one named isn't one")
m("main-script-name-in-its-options", MAIN, "args: process.argv.slice(3),", "args: process.argv.slice(2),", T_MAIN, "holds back the environment's token from a line a script says, and exits 0 when the script worked")

m("sb-body-read-outside-the-try", SUPA, """    // The signal still runs while the body comes, so a body that stops half-way ends here too.
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new OpsError(`${options.method ?? "GET"} ${path.split("?")[0] ?? path}: no answer from the project`);
  }
""", """  } catch {
    throw new OpsError(`${options.method ?? "GET"} ${path.split("?")[0] ?? path}: no answer from the project`);
  }
  bytes = new Uint8Array(await response.arrayBuffer());
""", ops("src/supabase.test.ts"), "says it got no answer when the body stops before it is whole, as it does when the call gets none")
m("p-token-url-parse-throws", PROBE, """  try {
    return new URL(url, "https://probe.invalid").searchParams.get("token") ?? undefined;
  } catch {
    // A URL that isn't one has no token, and the control that wanted one fails, as it should.
    return undefined;
  }
""", """  return new URL(url, "https://probe.invalid").searchParams.get("token") ?? undefined;
""", T_PROBE, "names the control of the upload URL when the project's answer has no token and no URL that is one")


# ---- added with the fix commit: what the first round of review found (the stop, TLS, flyctl's answer,
# ---- the guard on flyctl's arguments, the probe's time and buckets, psql's prompt) ----
DB = f"{OPS}/database.ts"
SSL = "packages/domain/src/db/ssl.ts"
APICONN = "services/api/src/connection.ts"
WORKERCONN = "services/worker/src/connection.ts"
T_FLYTEST = ops("src/fly.test.ts")
T_DBL = ops("src/database.test.ts")
T_SSL = NODE + f"cd {ROOT}/packages/domain && npx vitest run src/db/ssl.test.ts"
T_APICONN = api("src/connection.test.ts")
T_WORKERCONN = NODE + f"cd {ROOT}/services/worker && npx vitest run src/connection.test.ts"
T_SCRAM = ops("src/scram.test.ts")

# -- fly.ts: Fly.run makes no call that doesn't name the dev app (forDevApp)
m("fly-run-without-the-guard", FLY, "      if (!forDevApp(args)) {", "      if (false) {", T_FLYTEST,
  "makes no call that doesn't name it: Fly.run refuses before anything is spawned")
m("fly-guard-other-app-after-a-flag", FLY, "      if (args[index + 1] !== DEV_APP) return false;\n", "", T_FLYTEST,
  "refuses a call with no app, another app, an app flag with nothing after it, or another app besides the dev one")
m("fly-guard-short-spelling-read", FLY, '    } else if (/^-a./.test(arg) || arg.startsWith("--app=")) {\n      return false;\n',
  '    } else if (false) {\n      return false;\n', T_FLYTEST, "refuses an app flag in a spelling it doesn't read")
m("fly-guard-no-app-taken", FLY, "  return named;\n}", "  return true;\n}", T_FLYTEST,
  "refuses a call with no app, another app, an app flag with nothing after it, or another app besides the dev one")
m("fly-guard-any-orgs-call", FLY, 'if (args.length === 3 && args[0] === "orgs" && args[1] === "list" && args[2] === "--json") return true;',
  'if (args[0] === "orgs") return true;', T_FLYTEST, "takes the two calls that name none only in the one form each")
m("fly-guard-any-app-created", FLY, "    return args[2] === DEV_APP && (rest.length === 0 || named);", "    return rest.length === 0 || named;", T_FLYTEST,
  "takes the two calls that name none only in the one form each")
m("fly-guard-create-with-other-words", FLY, '    const named = rest.length === 2 && rest[0] === "--org" && org !== undefined && !org.startsWith("-");',
  "    const named = true;", T_FLYTEST, "takes the two calls that name none only in the one form each")
m("fly-guard-long-app-flag-unread", FLY, '    if (arg === "-a" || arg === "--app") {', '    if (arg === "-a") {', T_FLYTEST,
  "takes every call the scripts make: -a or --app with the dev app")

# -- environment.ts: a connection string needs a password; the driver and psql are given the same parts
m("env-no-password-allowed", ENV, '  if (parsed.password === "") throw refused("it has no password");\n', "", T_ENV,
  "refuses a string with no password, which psql would ask for on a terminal, and says so")
m("env-host-not-lowercased", ENV, "    host: parsed.hostname.toLowerCase(),", "    host: parsed.hostname,", T_ENV,
  "gives the host in lower case, as the guard read it, whatever case the string wrote it in")

# -- database.ts: the ops scripts' driver options
m("db-tls-not-required", DB, '    ssl: "require",\n', "    ssl: false,\n", T_DBL,
  "names every part of the connection, decoded, with TLS required, one connection and a time limit")
m("db-more-than-one-connection", DB, "    max: 1,\n", "    max: 10,\n", T_DBL,
  "names every part of the connection, decoded, with TLS required, one connection and a time limit")
m("db-no-connect-timeout", DB, "    connect_timeout: 20,\n", "", T_DBL,
  "names every part of the connection, decoded, with TLS required, one connection and a time limit")
m("db-port-left-to-the-environment", DB, "    port,\n", "", T_DBL,
  "makes a port-less string the session pooler's port, 5432, and the driver reads no variable for it")
m("db-notice-unredacted", DB, "      if (line !== undefined) write(redact(line));", "      if (line !== undefined) write(line);", T_DBL,
  "says Postgres's warnings through the redactor, and its routine notices not at all")
m("db-routine-notice-said", DB, "      if (line !== undefined) write(redact(line));", '      write(redact(line ?? ""));', T_DBL,
  "says Postgres's warnings through the redactor, and its routine notices not at all")

# -- ssl.ts and the two connections: TLS decided in code
m("ssl-never-asked", SSL, '  return isPlainLoopback(url) ? {} : { ssl: "require" };', "  return {};", T_SSL,
  "asks for TLS for Supabase's pooler, and for any other host that isn't loopback")
m("ssl-always-asked", SSL, '  return isPlainLoopback(url) ? {} : { ssl: "require" };', '  return { ssl: "require" };', T_SSL,
  "asks for nothing for a plainly written loopback host, which is CI's service and a developer's own")
m("ssl-two-ats-read-as-plain", SSL, '  if (at !== authority.lastIndexOf("@")) return false;\n', "", T_SSL,
  "treats a string that postgres.js and `new URL` could read differently as remote")
m("ssl-unreadable-string-plain", SSL, "  } catch {\n    return false;\n  }\n}", "  } catch {\n    return true;\n  }\n}", T_SSL,
  "treats a string it can't read, or with no host, as remote")
m("ssl-no-authority-plain", SSL, "  if (authority === undefined) return false;\n", "  if (authority === undefined) return true;\n", T_SSL,
  "treats a string it can't read, or with no host, as remote")
m("api-connect-asks-no-tls", APICONN, "  return postgres(url, { types: { instant: INSTANT_TYPE }, ...transportOptions(url) });",
  "  return postgres(url, { types: { instant: INSTANT_TYPE } });", T_APICONN, "requires TLS for Supabase's pooler, though the string says nothing of it")
m("worker-connect-asks-no-tls", WORKERCONN, "  return postgres(url, { types: { instant: INSTANT_TYPE }, ...transportOptions(url) });",
  "  return postgres(url, { types: { instant: INSTANT_TYPE } });", T_WORKERCONN,
  "requires TLS for Supabase's pooler, though the string says nothing of it, and the string can't switch it off")

# -- shutdown.ts: the sweeps, the grace and the failure messages
SD_GRACE = "ends the connections still in use only when the grace is over, says so, and goes on to end the database's connection"
SD_SWEEP = "ends the connections left idle, every sweep, while the server closes, and stops sweeping once it has"
m("sd-no-sweep", SHUT, "        app.server.closeIdleConnections();\n", "", T_SHUT, SD_SWEEP)
m("sd-sweep-never-stopped", SHUT, "        clearInterval(sweep);\n", "", T_SHUT, SD_SWEEP)
m("sd-grace-timer-not-cleared", SHUT, "        clearTimeout(grace);\n", "", T_SHUT, "does not wait for the grace when the server closes before it")
m("sd-grace-is-zero", SHUT, "          }, graceMs);\n", "          }, 0);\n", T_SHUT, SD_GRACE)
m("sd-all-connections-never-ended", SHUT, "          app.server.closeAllConnections();\n", "", T_SHUT, SD_GRACE)
m("sd-always-overdue", SHUT, '        if ((await Promise.race([closing.then(() => "closed" as const), overdue])) === "overdue") {', "        if (true) {", T_SHUT,
  "does not wait for the grace when the server closes before it")
m("sd-overdue-unsaid", SHUT, "          options.say(`api: requests still running after ${String(graceMs / 1000)} seconds are ended`);\n", "", T_SHUT, SD_GRACE)
m("sd-closing-not-awaited-after-force", SHUT, "          app.server.closeAllConnections();\n          await closing;\n", "          app.server.closeAllConnections();\n", T_SHUT, SD_GRACE)
m("sd-grace-too-long", SHUT, "export const GRACE_MS = 25_000;", "export const GRACE_MS = 29_000;", T_SHUT,
  "fits the grace and the database's end inside what Fly waits for before it kills the Machine")
m("sd-sweep-too-slow", SHUT, "export const SWEEP_MS = 250;", "export const SWEEP_MS = 5_000;", T_SHUT,
  "sweeps often enough that a connection left idle is ended long before the grace is over")
m("sd-database-failure-unsaid", SHUT, '        options.fail("api: the database\'s connection didn\'t end cleanly");\n', "", T_SHUT,
  "says when the database's connection doesn't end cleanly, without the error's own words, and doesn't say it stopped")
m("sd-database-failure-still-stopped", SHUT, "      } catch {\n        clean = false;\n        options.fail(\"api: the database's connection didn't end cleanly\");",
  "      } catch {\n        options.fail(\"api: the database's connection didn't end cleanly\");", T_SHUT,
  "says when the database's connection doesn't end cleanly, without the error's own words, and doesn't say it stopped")
m("sd-server-failure-skips-the-database", SHUT, "        options.fail(\"api: the server didn't close cleanly\");\n      } finally {",
  "        options.fail(\"api: the server didn't close cleanly\");\n        resolve();\n        return;\n      } finally {", T_SHUT,
  "still ends the database's connection when closing the server fails, and says so without the error's own words")
m("sd-server-failure-carries-the-error", SHUT, "      } catch {\n        clean = false;\n        options.fail(\"api: the server didn't close cleanly\");",
  "      } catch (error) {\n        clean = false;\n        options.fail(`api: the server didn't close cleanly: ${String(error)}`);", T_SHUT,
  "still ends the database's connection when closing the server fails, and says so without the error's own words")

# -- supabase-probe.ts: every bucket private; the checks' budget and the run's deadline
P_BUCKETS = "passes the two private buckets storage-setup makes, asking once, with the service key alone"
P_BUDGET = "stops asking when the budget runs out part-way, says so for every check it didn't ask, and still cleans up"
m("p-bucket-check-skipped", PROBE, '    const everyBucket = await ask("/storage/v1/bucket", { caller: service });\n    record(\n      "storage: every bucket is private, and only storage-setup\'s two exist",\n      everyBucket === undefined ? silence() : toBuckets(everyBucket),\n    );\n',
  "", T_PROBE, P_BUCKETS)
m("p-bucket-open-taken", PROBE, '  const open = items.filter((item) => flag(item, "public") !== false).length;',
  '  const open = items.filter((item) => flag(item, "public") === true).length;', T_PROBE, "takes a bucket that doesn't say it is private as not shown to be")
m("p-bucket-private-counted-open", PROBE, '  const open = items.filter((item) => flag(item, "public") !== false).length;',
  '  const open = items.filter((item) => flag(item, "public") === false).length;', T_PROBE, P_BUCKETS)
m("p-bucket-stranger-taken", PROBE, '  const strangers = items.filter((item) => !BUCKETS.some((name) => name === text(item, "name"))).length;',
  "  const strangers = 0;", T_PROBE, "fails a third bucket, which is none of storage-setup's, and counts it without naming it")
m("p-bucket-list-error-taken", PROBE, "  if (items === undefined) return answered(reply);\n  // A bucket that doesn't say",
  "  if (items === undefined) return undefined;\n  // A bucket that doesn't say", T_PROBE,
  "fails, with the status alone, when the answer is an error or is not a list, and the run goes on to the refusals")
m("p-bucket-list-with-the-public-key", PROBE, '    const everyBucket = await ask("/storage/v1/bucket", { caller: service });',
  '    const everyBucket = await ask("/storage/v1/bucket", { caller: anon });', T_PROBE, P_BUCKETS)
m("p-budget-never-applied", PROBE, "  const checking = AbortSignal.any([input.budget ?? AbortSignal.timeout(BUDGET_MS), deadline]);",
  "  const checking = deadline;", T_PROBE, P_BUDGET)
m("p-clean-up-cut-by-the-budget", PROBE, "  const limit = () => (cleaning ? deadline : checking);", "  const limit = () => checking;", T_PROBE, P_BUDGET)
m("p-clean-up-without-a-deadline", PROBE, "  const limit = () => (cleaning ? deadline : checking);",
  "  const limit = () => (cleaning ? new AbortController().signal : checking);", T_PROBE,
  "stops the clean-up too at the deadline, and names every object and the user it leaves")
m("p-call-in-flight-not-ended", PROBE, "      return await send(input.fetch, base, path, { ...options, within });",
  "      return await send(input.fetch, base, path, options);", T_PROBE,
  "ends a call that is in flight when the budget runs out, and removes what that call may have written")
m("p-spent-budget-still-asks", PROBE, "    if (within.aborted) return undefined;\n", "", T_PROBE,
  "asks nothing when its time is already spent, and says the first control wasn't answered for that reason")
m("p-out-of-time-said-as-no-answer", PROBE, "  const silence = () => (limit().aborted ? OUT_OF_TIME : NO_ANSWER);", "  const silence = () => NO_ANSWER;", T_PROBE, P_BUDGET)
m("p-unasked-refusal-kept", PROBE, "    const asked = !checking.aborted;\n", "    const asked = true;\n", T_PROBE, "leaves no bucket to remove for a refusal it never asked")
m("p-clean-up-flag-never-set", PROBE, "    cleaning = true;\n    await cleanup();", "    await cleanup();", T_PROBE, P_BUDGET)
m("p-budget-default-too-long", PROBE, "export const BUDGET_MS = 150_000;", "export const BUDGET_MS = 250_000;", T_PROBE,
  "gives the checks BUDGET_MS and the whole run DEADLINE_MS when nobody gives it others")
m("p-deadline-default-too-long", PROBE, "export const DEADLINE_MS = 240_000;", "export const DEADLINE_MS = 290_000;", T_PROBE,
  "gives the checks BUDGET_MS and the whole run DEADLINE_MS when nobody gives it others")

# -- supabase.ts: the caller's signal ends a call, beside the call's own time limit
m("sb-caller-signal-replaces-the-limit", SUPA, "          : AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), options.within]),", "          : options.within,", T_SBC,
  "gives each call 20 seconds, with the caller's own signal or without it")
m("sb-caller-signal-ignored", SUPA, "          : AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), options.within]),", "          : AbortSignal.timeout(TIMEOUT_MS),", T_SBC,
  "ends a call in flight when the signal aborts, and says it got no answer, as for any other end")
m("sb-time-limit-longer", SUPA, "const TIMEOUT_MS = 20_000;", "const TIMEOUT_MS = 200_000;", T_SBC, "gives each call 20 seconds, with the caller's own signal or without it")

# -- run.ts: what the runner says when the Machine's report never comes back
m("run-hint-never-said", RUN, "  if (heard.length === 0) {", "  if (false) {", T_RUN,
  "says what the project may hold when nothing came back from the Machine")
m("run-hint-always-said", RUN, "  if (heard.length === 0) {", "  if (true) {", T_RUN,
  "fails with the Machine's failure, after both have said what they found")
m("run-lines-not-heard", RUN, "          heard.push(line);\n", "", T_RUN, "fails with the Machine's failure, after both have said what they found")

# -- on-machine.ts: flyctl's answer is read strictly, and the command is given its time
m("om-signal-ignored", ONM, "  if (answer.exitSignal !== 0) {", "  if (false) {", T_ONM, "fails when the command was ended by a signal, even with no exit code in the answer")
m("om-unknown-key-accepted", ONM, "  if (Object.keys(body).some((key) => !ANSWER_KEYS.includes(key))) return undefined;\n", "", T_ONM,
  "fails when flyctl can't run it, saying why, or answers with something it can't read")
m("om-code-type-unchecked", ONM, '  if (typeof exitCode !== "number" || !Number.isInteger(exitCode)) return undefined;\n', "", T_ONM,
  "fails when flyctl can't run it, saying why, or answers with something it can't read")
m("om-text-type-unchecked", ONM, '  if (typeof stdout !== "string" || typeof stderr !== "string") return undefined;\n', "", T_ONM,
  "fails when flyctl can't run it, saying why, or answers with something it can't read")
m("om-missing-code-unreadable", ONM, "exit_code: exitCode = 0", "exit_code: exitCode", T_ONM,
  "reads a command that worked from an answer with no exit code, as flyctl leaves a zero out")
m("om-exec-seconds-beyond-flys-limit", ONM, "export const EXEC_SECONDS = 300;", "export const EXEC_SECONDS = 900;", T_ONM,
  "runs the command in the API's started Machine, as one string, and says what it printed")

# -- bootstrap.ts, scram.ts: psql never asks for a password; the minimum is the founder's
m("bs-psql-may-ask-for-a-password", BOOT, '["-X", "-w", "-v", "ON_ERROR_STOP=1", "-f", "-"]', '["-X", "-v", "ON_ERROR_STOP=1", "-f", "-"]', T_BOOT,
  "runs psql with the admin's connection in its environment and the file as a script on standard input")
m("bs-psql-without-a-time-limit", BOOT, "    timeoutMs: 120_000,\n", "", T_BOOT,
  "runs psql with the admin's connection in its environment and the file as a script on standard input")
m("bs-shortest-password-31", BOOT, "export const SHORTEST_PASSWORD = 32;", "export const SHORTEST_PASSWORD = 31;", T_BOOT,
  "takes a password of exactly 32 characters, the founder's minimum, and refuses one of 31")
m("scram-salt-of-eight-bytes", SCRAM, "salt: Buffer = randomBytes(16)", "salt: Buffer = randomBytes(8)", T_SCRAM,
  "makes a salt of 16 random bytes, as Postgres does when it makes a verifier itself")

# -- deploy-branch.ts: no call waits for ever
m("deploy-git-time-limit-longer", DEPLOY, "const GIT_MS = 30_000;", "const GIT_MS = 300_000;", T_DEPLOY,
  "cuts every git call off after 30 seconds and every GitHub request after 30 seconds, and the deploy after 20 minutes")
m("deploy-github-time-limit-longer", DEPLOY, "const GITHUB_MS = 30_000;", "const GITHUB_MS = 300_000;", T_DEPLOY,
  "cuts every git call off after 30 seconds and every GitHub request after 30 seconds, and the deploy after 20 minutes")
m("deploy-flyctl-time-limit-longer", DEPLOY, "const DEPLOY_MS = 20 * 60 * 1000;", "const DEPLOY_MS = 200 * 60 * 1000;", T_DEPLOY,
  "cuts every git call off after 30 seconds and every GitHub request after 30 seconds, and the deploy after 20 minutes")

# -- Dockerfile: the final stage is the image
m("docker-final-stage-without-the-dependencies", DOCKER, "COPY --from=deps /app/ ./\n", "", T_FILES,
  "runs, in the stage that is the image, as an unprivileged user and in production, with the dependencies copied once as pnpm laid them")
m("docker-final-stage-not-in-production", DOCKER, "FROM ${NODE_IMAGE}\nENV NODE_ENV=production\n", "FROM ${NODE_IMAGE}\n", T_FILES,
  "runs, in the stage that is the image, as an unprivileged user and in production, with the dependencies copied once as pnpm laid them")


# ---- The fixes for the first round of review (the second commit) ----
MCLI = f"{OPS}/migrate-cli.ts"
T_MCLI = ops("src/migrate-cli.test.ts")
T_DBPROBE = db("src/db/ops-probe.test.ts")

# environment.ts: a password's comma, its encoding, and the hint for # / ?
m("env-comma-in-password-refused", ENV, 'if (authority.slice(authority.lastIndexOf("@") + 1).includes(","))', 'if (authority.includes(","))', T_ENV,
  "takes a comma in the password, which is the password's and not a second host's, and still refuses one after the @")
m("env-percent-encoding-unchecked", ENV, """  try {
    decodeURIComponent(parsed.password);
  } catch {
    throw refused("its password isn't valid percent-encoding: a % in it has to be written as %25");
  }
""", "", T_ENV, "says what is wrong with a password that isn't percent-encoded properly, by the variable's name and never the password")
m("env-unparsable-hint-dropped", ENV, 'throw refused("it isn\'t a connection string (a # / or ? in the password has to be written as %23, %2F or %3F)");',
  'throw refused("it isn\'t a connection string");', T_ENV,
  "tells a password with a # / or ? in it to write them encoded, since those end the user-info part")

# fly-app-create.ts: what counts as issued
m("fac-active-entry-read-as-issued", FLYAPP, '  if (issued || detail["status"] === "Ready") return "issued";',
  '  if (issued || detail["status"] === "Ready" || certificates.some((entry) => record(entry)?.["status"] === "active")) return "issued";', T_FLYAPP,
  "says the certificate is on its way, not issued, while Fly has verified the host and no certificate is in its list")
m("fac-ready-detail-unread", FLYAPP, '  if (issued || detail["status"] === "Ready") return "issued";', '  if (issued) return "issued";', T_FLYAPP,
  "says the certificate is issued when the detail is Ready, or when an entry lists an issued certificate, either alone")
m("fac-issued-list-unread", FLYAPP, '  if (issued || detail["status"] === "Ready") return "issued";', '  if (detail["status"] === "Ready") return "issued";', T_FLYAPP,
  "says the certificate is issued when the detail is Ready, or when an entry lists an issued certificate, either alone")
m("fac-empty-issued-list-is-issued", FLYAPP, "    return Array.isArray(list) && list.length > 0;", "    return Array.isArray(list);", T_FLYAPP,
  "says the certificate is on its way, not issued, while Fly has verified the host and no certificate is in its list")
m("fac-null-issued-list-throws", FLYAPP, "    return Array.isArray(list) && list.length > 0;", "    return list !== undefined && (list as unknown[]).length > 0;", T_FLYAPP,
  "says the certificate is on its way, not issued, while Fly has verified the host and no certificate is in its list")

# on-machine.ts, fly.ts and deploy-branch.ts: the Machines named in the message, and the advice
m("om-machines-unnamed", ONM, " (the app's Machines: ${machineList(all)})", "", T_ONM,
  "fails when the API has no started Machine, names the Machines there are, and runs nothing")
m("om-stopped-machine-told-to-deploy", ONM, "      ? `if it stopped on its own, Fly's log of ${DEV_APP} says why`\n", '      ? "deploy first"\n', T_ONM,
  "fails when the API has no started Machine, names the Machines there are, and runs nothing")
m("om-worker-taken-for-the-api", ONM, 'all.some((machine) => machine.group === "api")', "all.length > 0", T_ONM,
  "fails when the API has no started Machine, names the Machines there are, and runs nothing")
m("fly-machine-list-group-unsaid", FLY, '${machine.group ?? "no group"}', "${machine.group}", T_FLYTEST,
  "says the Machines in words for a message: id, group and state each, `no group` for a Machine made another way, and `none`")
m("fly-machine-list-none-unsaid", FLY, '  return list.length === 0\n    ? "none"\n    : list', "  return list", T_FLYTEST,
  "says the Machines in words for a message: id, group and state each, `no group` for a Machine made another way, and `none`")
m("deploy-machines-unnamed", DEPLOY, " (the app's Machines: ${machineList(now)})", "", T_DEPLOY,
  "doesn't take flyctl's word that it deployed: the Machines have to run the commit's image")

# run.ts: a connection the database refuses
m("run-connection-failure-unexplained", RUN, "    try {\n      await db`SELECT 1`;\n    } catch (error) {", "    try {\n      // nothing asked\n    } catch (error) {", T_RUN,
  "says which script and which variable, the driver's words, and what to look at, then closes it")
m("run-connection-reason-dropped", RUN, "`${site.script}: couldn't connect with ${site.variable}: ${reason}. Has ops", "`${site.script}: couldn't connect with ${site.variable}. Has ops", T_RUN,
  "says which script and which variable, the driver's words, and what to look at, then closes it")
m("run-connection-empty-reason-kept", RUN, 'error instanceof Error && error.message !== "" ? error.message', "error instanceof Error ? error.message", T_RUN,
  "says that no reason was given when the driver's error has no words, or isn't an Error")
m("run-script-failure-said-as-connection", RUN, "      await db`SELECT 1`;\n    } catch (error) {", "      await db`SELECT 1`;\n      return await body(db);\n    } catch (error) {", T_RUN,
  "is not said of a script's own failure: what its queries answer is the script's to say")

# migrate-cli.ts: local only
m("migrate-cli-any-host", MCLI, "if (transportOptions(url).ssl !== undefined) {", "if (false) {", T_MCLI,
  "refuses a host that isn't local, and points to ops migrate, before it connects, saying nothing of the string")

# supabase-probe.ts: the service key's root, and the role the Data API connects as
m("p-service-root-not-asked", PROBE, """      await refuse(
        "service: the Data API serves no schema at its root",
        "/rest/v1/",
        { caller: service },
        servedSchema,
      );
""", "", T_PROBE, "asks the Data API's root once as the service key, the one caller the gateway lets read it")
m("p-served-schema-passes-anything", PROBE, "  if (reply.status >= 400) return undefined;\n  const paths =", "  return undefined;\n  const paths =", T_PROBE,
  "passes the service key's root when the Data API answers an error, whichever one, and fails when it describes a schema")
m("p-served-schema-client-error-fails", PROBE, "  if (reply.status >= 400) return undefined;\n  const paths =", "  if (reply.status >= 500) return undefined;\n  const paths =", T_PROBE,
  "passes the service key's root when the Data API answers an error, whichever one, and fails when it describes a schema")
m("p-served-schema-paths-uncounted", PROBE, '  return `${answered(reply)}, with ${String(count)} ${count === 1 ? "path" : "paths"}`;', "  return answered(reply);", T_PROBE,
  "passes the service key's root when the Data API answers an error, whichever one, and fails when it describes a schema")
m("p-authenticator-setting-unread", PROBE, "     WHERE r.setrole = pg_catalog.to_regrole('authenticator')", "     WHERE r.setrole = pg_catalog.to_regrole('tadayo_nobody')", T_DBPROBE,
  "fails, with a count and no name, when the role's own setting exposes a schema, for the cluster or for this database")
m("p-authenticator-database-setting-unread", PROBE, "       AND r.setdatabase IN (0, (SELECT d.oid FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database()))", "       AND r.setdatabase = 0", T_DBPROBE,
  "fails, with a count and no name, when the role's own setting exposes a schema, for the cluster or for this database")
m("p-authenticator-any-role", PROBE, "     WHERE r.setrole = pg_catalog.to_regrole('authenticator')\n", "     WHERE true\n", T_DBPROBE,
  "looks only at authenticator: another role's setting, and another setting of its own, aren't the Data API's")
m("p-authenticator-any-setting", PROBE, "       AND pg_catalog.starts_with(s.setting, 'pgrst.db_schemas=')\n", "", T_DBPROBE,
  "looks only at authenticator: another role's setting, and another setting of its own, aren't the Data API's")

# apps/web/src/build.ts: the _headers rules and the association's note
m("web-headers-second-rule-taken", WEB, "  if (ours.length > 1) {\n    return [", "  if (false) {\n    return [", T_WEB,
  "refuses a second rule for the association's path, since what Pages makes of a path written twice isn't something to lean on")
m("web-headers-type-elsewhere-taken", WEB, "  if (elsewhere.length > 0) {", "  if (false) {", T_WEB,
  "refuses a Content-Type set or removed under any other path, since Pages applies every rule that matches")
m("web-headers-removal-unseen", WEB, "/^(!\\s*)?content-type\\s*(:|$)/i", "/^content-type\\s*:/i", T_WEB,
  "refuses a Content-Type set or removed under any other path, since Pages applies every rule that matches")
m("web-headers-own-removal-taken", WEB, "  if (settingType(rule.headers).length > set.length) return [`removes the Content-Type of ${ASSOCIATION_PATH}`];\n", "", T_WEB,
  "refuses the association's own rule when it removes the Content-Type, beside setting it or not")
m("web-headers-lines-untrimmed", WEB, "    const line = raw.trim();", "    const line = raw;", T_WEB,
  "reads the file as Pages does: a line is trimmed, so a header needs no indentation, and a path starts with a slash")
m("web-association-own-rules-unsaid", WEB, """    problems.push(
      `the rules for ${ASSOCIATION} are Tadayo's own, stricter than Apple's format: checkAssociation in apps/web/src/build.ts says which`,
    );
""", "", T_WEB, "says the association file's rules are Tadayo's own, when one of them refused it, and not for any other problem")
m("web-association-own-rules-always-said", WEB, "  if (problems.some((problem) => problem.startsWith(`${ASSOCIATION} `))) {", "  if (true) {", T_WEB,
  "says the association file's rules are Tadayo's own, when one of them refused it, and not for any other problem")

# ---- The fixes for the second round of review (the third commit): the Machine's last line, the
# ---- leftovers' hint, the probe's limits from the start, the database's end in time ----
T_RUNREM = ops("src/run-remote.test.ts")
APIAPP = "services/api/src/app.ts"
T_APIAPP = api("src/app.test.ts")
m("r2-probe-pass-unchecked", RUN, "  if (!passed) {", "  if (false) {", T_RUNREM,
  "doesn't take a report without the run's id, or one that only says its checks passed, as a pass")
m("r2-probe-passed-line-any", RUN, "const PROBE_PASSED = /^supabase-probe: all \\d+ checks passed$/;", "const PROBE_PASSED = /^supabase-probe: /;", T_RUNREM,
  "doesn't take a report without the run's id, or one that only says its checks passed, as a pass")
m("r2-probe-failed-line-unseen", RUN, "const PROBE_FAILED = /^supabase-probe: \\d+ of \\d+ checks failed$/;", "const PROBE_FAILED = /^$/;", T_RUNREM,
  "fails with the Machine's failure, after both have said what they found")
m("r2-probe-cut-report-unsaid", RUN, "  } else if (started && !ended) {", "  } else if (false) {", T_RUNREM,
  "fails, and says what the project may hold, when the Machine's report has the run's id")
m("r2-probe-early-failure-hinted", RUN, "  } else if (started && !ended) {", "  } else if (!ended) {", T_RUNREM,
  "says nothing of what the project may hold when the Machine's half failed before it made anything")
m("r2-probe-hint-without-buckets", RUN, ", and buckets whose names start with probe-. Delete them", ". Delete them", T_RUNREM,
  "says what the project may hold when nothing came back from the Machine")
m("r2-storage-bucket-lines-unchecked", RUN, "    for (const bucket of BUCKETS) {", "    for (const bucket of [] as string[]) {", T_RUNREM,
  "fails when the Machine's report ends before it says what became of each bucket")
m("r2-storage-one-bucket-checked", RUN, "    for (const bucket of BUCKETS) {", "    for (const bucket of BUCKETS.slice(0, 1)) {", T_RUNREM,
  "fails when the Machine's report ends before it says what became of each bucket")
m("r2-probe-limits-not-passed", RUN, "    id: () => run,\n    budget,\n    deadline,\n", "    id: () => run,\n", T_RUNREM,
  "gives the doors' checks those same limits, so that the run has one budget and one deadline")
mm("r2-probe-limits-after-the-database", [
    one(RUN, "  const budget = AbortSignal.timeout(BUDGET_MS);\n  const deadline = AbortSignal.timeout(DEADLINE_MS);\n", ""),
    one(RUN, "  const api = await apiChecks({\n", "  const budget = AbortSignal.timeout(BUDGET_MS);\n  const deadline = AbortSignal.timeout(DEADLINE_MS);\n  const api = await apiChecks({\n"),
  ], T_RUNREM, "starts the run's time limits before it opens the database")
m("r3-app-end-untimed", APIAPP, "    await deps.sql.end({ timeout: END_SECONDS });", "    await deps.sql.end();", T_APIAPP,
  "ends its connection when it closes, giving queries still running END_SECONDS")
m("r3-end-seconds-past-kill", SHUT, "export const END_SECONDS = 3;", "export const END_SECONDS = 6;", T_SHUT,
  "fits the grace and the database's end inside what Fly waits for before it kills the Machine")
m("r3-stop-end-untimed", SHUT, "        await options.sql.end({ timeout: END_SECONDS });", "        await options.sql.end({ timeout: 30 });", T_SHUT,
  "gives the database's connection END_SECONDS to end")
m("fac-empty-organizations-read-as-unreadable", FLYAPP, "  if (only === undefined) throw new OpsError(\"fly-app-create: the token sees no organization\");",
  "  if (only === undefined) throw new OpsError(\"fly-app-create: flyctl's list of organizations isn't one it can read\");", T_FLYAPP,
  "a token that sees no organization, saying so")


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
