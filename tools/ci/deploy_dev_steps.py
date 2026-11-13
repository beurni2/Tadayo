#!/usr/bin/env python3
"""The steps deploy-dev.yml calls that ops.yml and ci.yml don't (the B0 plan's slice 10c).

deploy-dev runs on every push to main. Its first job waits for that commit's ci run (wait-ci);
its second migrates dev, deploys main to Fly and runs storage-setup and the Supabase probe, all
through ops_steps.py, then asks the API for its neutral 401 (check-api). Its third builds apps/web
with no secret at all and hands the site on as an artifact, once check-site has found nothing in
it but plain files and folders. Its fourth publishes that site to Cloudflare Pages on a runner of
its own, which runs nothing but this script, GitHub's pinned actions and the pinned wrangler:
check-head stops a run whose commit is no longer main's head, check-site looks at the site again,
setup-wrangler installs wrangler outside the checkout, pages-project makes the Pages project when
it's missing (wrangler without a terminal won't), pages-deploy deploys, and check-association
checks that the production deployment is this commit's and serves the association file as Apple
fetches it (docs/plans/B0.md, slice 10c and the workflow table).

Every request goes through Http, which never follows a redirect and has a timeout; the tests
replace it, the sleep and the process runner with fakes, so nothing here needs the network to be
tested. Nothing this script prints holds a token or a request header; it prints the status and the
headers of the answers it judges. wrangler's own output in pages-deploy, and Cloudflare's error
messages, can name the account id, a repository variable, not a secret; and on an authentication
error wrangler also lists the token's accounts by name and id (an account's name holds its
owner's email unless it was renamed), and that email when the token may read it.

Tests: python3 tools/ci/deploy_dev_steps_test.py
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import http.client
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass

REPOSITORY = "beurni2/tadayo"
BRANCH = "main"
# tools/ops/src/environment.ts' DEV_HOST, which deploy_dev_steps_test.py holds this to.
DEV_HOST = "api-dev.tadayo.app"
# The one Pages project, serving tadayo.app once the founder attaches it (docs/plans/B0.md 1.2).
PAGES_PROJECT = "tadayo"
# wrangler, pinned with every package under it by tools/ci/pages/package-lock.json: the newest
# release at least two weeks old when it was chosen (4.153.0, published 2026-10-26).
WRANGLER_VERSION = "4.153.0"
PAGES_DIR = os.path.join("tools", "ci", "pages")
# Where setup-wrangler installs it: a folder of its own under the runner's RUNNER_TEMP, outside the
# checkout, so neither npm (looking upward for a workspace) nor Node (looking upward for a module)
# reaches a file in the repository.
WRANGLER_HOME = "deploy-dev-wrangler"
WRANGLER = os.path.join("node_modules", "wrangler", "bin", "wrangler.js")
SITE = os.path.join("apps", "web", "dist")
ASSOCIATION = "/.well-known/apple-app-site-association"
# A file Pages runs as a Worker in front of the site ("advanced mode"); the site is static.
WORKER = "_worker.js"
REGISTRY = "https://registry.npmjs.org/"

GITHUB_API = "api.github.com"
CLOUDFLARE_API = "api.cloudflare.com"
USER_AGENT = "deploy-dev"
REQUEST_SECONDS = 30
# A main ci run takes about six minutes; the wait gives it 40.
CI_POLLS, CI_POLL_SECONDS = 120, 20
# Fly's proxy answers 502 to 504 while a Machine is replaced, which deploy-branch has waited for.
API_TRIES, API_RETRY_SECONDS = 6, 10
# A new project's pages.dev name can take minutes to answer.
PAGES_POLLS, PAGES_POLL_SECONDS = 20, 15
# Cloudflare's error for a Pages project that doesn't exist.
PROJECT_NOT_FOUND = 8000007

SHA = re.compile(r"[0-9a-f]{40}")
ACCOUNT = re.compile(r"[0-9a-f]{32}")
OK_CONCLUSIONS = {"success", "cancelled", "skipped"}

EXPECTED_API = {
    "status": 401,
    "body": b'{"code":"UNAUTHENTICATED"}',
    # services/api/src/session.test.ts pins these for a request with no token.
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
}


@dataclass(frozen=True)
class Answer:
    status: int
    headers: dict  # lower-case name: list of values, in order
    body: bytes

    def header(self, name):
        """The header's one value, or None when it's missing or given more than once."""
        values = self.headers.get(name, [])
        return values[0] if len(values) == 1 else None


class Http:
    """HTTPS requests that never follow a redirect. The tests replace it with a fake."""

    def request(self, method, host, path, headers, body=None):
        connection = http.client.HTTPSConnection(host, timeout=REQUEST_SECONDS)
        try:
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            found = {}
            for name, value in response.getheaders():
                found.setdefault(name.lower(), []).append(value)
            return Answer(response.status, found, response.read())
        finally:
            connection.close()


def json_of(answer):
    try:
        return json.loads(answer.body)
    except ValueError:
        return None


def cloudflare_errors(document):
    """Cloudflare's error codes and messages, as `code message; …`, or a note when it gave none."""
    errors = document.get("errors") if isinstance(document, dict) else None
    if not isinstance(errors, list) or not errors:
        return "no error given"
    return "; ".join(f"{e.get('code')} {e.get('message')}" if isinstance(e, dict) else repr(e) for e in errors)


class Steps:
    def __init__(self, root, environ=None, http=None, sleep=time.sleep, run=None):
        self.root = root
        self.environ = os.environ if environ is None else environ
        self.http = http or Http()
        self.sleep = sleep
        self.run_process = run or self.run_for_real

    def value(self, name):
        return self.environ.get(name, "")

    def path(self, *parts):
        return os.path.join(self.root, *parts)

    def run_for_real(self, cmd, cwd, env):
        return subprocess.run(cmd, cwd=cwd, env=env, check=False).returncode

    def sha(self, step):
        sha = self.value("GITHUB_SHA")
        if not SHA.fullmatch(sha):
            print(f"deploy-dev: {step}: GITHUB_SHA isn't a commit's 40 hexadecimal digits")
            return None
        return sha

    # wait-ci

    def wait_ci(self):
        token = self.value("GITHUB_TOKEN")
        if not token:
            print("deploy-dev: wait-ci has no GITHUB_TOKEN: its step gives it the job's token")
            return 1
        sha = self.sha("wait-ci")
        if sha is None:
            return 1
        path = (f"/repos/{REPOSITORY}/actions/workflows/ci.yml/runs"
                f"?head_sha={sha}&branch={BRANCH}&event=push&per_page=100")
        headers = {"accept": "application/vnd.github+json", "authorization": f"Bearer {token}",
                   "x-github-api-version": "2022-11-28", "user-agent": USER_AGENT}
        for poll in range(1, CI_POLLS + 1):
            try:
                answer = self.http.request("GET", GITHUB_API, path, headers)
            except (OSError, http.client.HTTPException) as error:
                print(f"deploy-dev: wait-ci: couldn't ask GitHub for {sha[:12]}'s ci runs ({error})")
            else:
                if answer.status != 200:
                    print(f"deploy-dev: wait-ci: GitHub answered HTTP {answer.status} to the request "
                          f"for {sha[:12]}'s ci runs")
                    if answer.status < 500:
                        return 1
                else:
                    verdict = self.judge_runs(sha, json_of(answer))
                    if verdict is not None:
                        return verdict
            if poll < CI_POLLS:
                self.sleep(CI_POLL_SECONDS)
        print(f"deploy-dev: wait-ci: {sha[:12]}'s ci run hadn't finished after {CI_POLLS} looks, "
              f"{CI_POLL_SECONDS} seconds apart; nothing was deployed")
        return 1

    def judge_runs(self, sha, document):
        """0 when deploy-branch would take the commit's ci runs, 1 when it would refuse them,
        None while they aren't all finished (deploy-branch.ts reads them the same way)."""
        listed = document.get("workflow_runs") if isinstance(document, dict) else None
        if not isinstance(listed, list):
            print("deploy-dev: wait-ci: GitHub's answer has no list of runs")
            return 1
        runs = [r for r in listed if isinstance(r, dict) and r.get("head_sha") == sha
                and r.get("head_branch") == BRANCH and r.get("event") == "push"
                and isinstance(r.get("id"), int) and not isinstance(r.get("id"), bool)]
        for run in runs:
            if run.get("status") == "completed" and run.get("conclusion") not in OK_CONCLUSIONS:
                print(f"deploy-dev: wait-ci: {sha[:12]}'s ci run {run['id']} failed "
                      f"({run.get('conclusion')}); nothing is deployed")
                return 1
        if not runs:
            print(f"deploy-dev: wait-ci: no ci run for {sha[:12]} on {BRANCH} yet")
            return None
        waiting = [r for r in runs if r.get("status") != "completed"]
        if waiting:
            print(f"deploy-dev: wait-ci: {sha[:12]}'s ci run {waiting[0]['id']} is {waiting[0].get('status')}")
            return None
        passed = [r for r in runs if r.get("conclusion") == "success"]
        if not passed:
            print(f"deploy-dev: wait-ci: every ci run for {sha[:12]} was cancelled or skipped; "
                  "run ci again, then this workflow")
            return 1
        print(f"deploy-dev: wait-ci: {sha[:12]}'s ci run {passed[0]['id']} passed")
        return 0

    # check-api

    def check_api(self):
        headers = {"accept": "application/json", "user-agent": USER_AGENT}
        for attempt in range(1, API_TRIES + 1):
            try:
                answer = self.http.request("GET", DEV_HOST, "/v1/me", headers)
            except (OSError, http.client.HTTPException) as error:
                problem = f"couldn't reach https://{DEV_HOST}/v1/me ({error})"
            else:
                if answer.status not in (502, 503, 504):
                    return self.judge_api(answer)
                problem = f"https://{DEV_HOST}/v1/me answered HTTP {answer.status}"
            if attempt < API_TRIES:
                print(f"deploy-dev: check-api: {problem}; asking again in {API_RETRY_SECONDS} seconds")
                self.sleep(API_RETRY_SECONDS)
            else:
                print(f"deploy-dev: check-api: {problem}, {API_TRIES} times")
        return 1

    def judge_api(self, answer):
        problems = []
        if answer.status != EXPECTED_API["status"]:
            problems.append(f"HTTP {answer.status}, not {EXPECTED_API['status']}")
        if answer.body != EXPECTED_API["body"]:
            problems.append(f"the body {answer.body[:200]!r}, not {EXPECTED_API['body']!r}")
        for name in ("content-type", "cache-control"):
            if answer.header(name) != EXPECTED_API[name]:
                problems.append(f"{name} {answer.headers.get(name)}, not {EXPECTED_API[name]!r}")
        if problems:
            print(f"deploy-dev: check-api: GET https://{DEV_HOST}/v1/me with no token answered "
                  + "; ".join(problems))
            return 1
        print(f"deploy-dev: check-api: GET https://{DEV_HOST}/v1/me with no token answered 401 "
              "UNAUTHENTICATED, private and not stored")
        return 0

    # check-head

    def check_head(self):
        """Passes only while this run's commit is main's head: a re-run of an older commit's pages
        job would otherwise put its older site back over a newer one."""
        token = self.value("GITHUB_TOKEN")
        if not token:
            print("deploy-dev: check-head has no GITHUB_TOKEN: its step gives it the job's token")
            return 1
        sha = self.sha("check-head")
        if sha is None:
            return 1
        headers = {"accept": "application/vnd.github+json", "authorization": f"Bearer {token}",
                   "x-github-api-version": "2022-11-28", "user-agent": USER_AGENT}
        for attempt in range(1, API_TRIES + 1):
            try:
                answer = self.http.request("GET", GITHUB_API, f"/repos/{REPOSITORY}/branches/{BRANCH}", headers)
            except (OSError, http.client.HTTPException) as error:
                problem = f"couldn't ask GitHub for {BRANCH}'s head ({error})"
            else:
                if answer.status == 200:
                    return self.judge_head(sha, json_of(answer))
                problem = f"GitHub answered HTTP {answer.status} to the request for {BRANCH}'s head"
                if answer.status < 500:
                    print(f"deploy-dev: check-head: {problem}")
                    return 1
            if attempt < API_TRIES:
                print(f"deploy-dev: check-head: {problem}; asking again in {API_RETRY_SECONDS} seconds")
                self.sleep(API_RETRY_SECONDS)
            else:
                print(f"deploy-dev: check-head: {problem}, {API_TRIES} times")
        return 1

    def judge_head(self, sha, document):
        commit = document.get("commit") if isinstance(document, dict) else None
        head = commit.get("sha") if isinstance(commit, dict) else None
        if not isinstance(head, str) or not SHA.fullmatch(head):
            print(f"deploy-dev: check-head: GitHub's answer about {BRANCH} names no commit")
            return 1
        if head != sha:
            print(f"deploy-dev: check-head: {BRANCH} is at {head[:12]} now, not {sha[:12]}; that commit's run "
                  "publishes its own site, so this one publishes nothing (if that run's pages job ended "
                  "cancelled, run it again)")
            return 1
        print(f"deploy-dev: check-head: {sha[:12]} is {BRANCH}'s head")
        return 0

    # check-site

    def site_problem(self):
        """Why apps/web/dist can't be published as it stands, or None. wrangler follows a link and
        publishes what it points to, and Pages runs a _worker.js as code, so the site may hold
        nothing but plain files and folders, and no _worker.js."""
        site = self.path(SITE)
        if os.path.islink(site) or not os.path.isdir(site):
            return f"{SITE} isn't a folder: build it first (ci_steps.py web)"

        def refuse(error):
            raise error
        try:
            for folder, folders, files in os.walk(site, onerror=refuse, followlinks=False):
                for name in folders + files:
                    mode = os.lstat(os.path.join(folder, name)).st_mode
                    where = os.path.relpath(os.path.join(folder, name), site)
                    if stat.S_ISLNK(mode):
                        return f"{SITE}/{where} is a link, which wrangler would follow and publish what it points to"
                    if not (stat.S_ISREG(mode) or stat.S_ISDIR(mode)):
                        return f"{SITE}/{where} is neither a file nor a folder"
        except OSError as error:
            return f"{SITE} can't be read whole ({error})"
        if not os.path.isfile(self.path(SITE, ASSOCIATION.lstrip("/"))):
            return f"{SITE} has no {ASSOCIATION}: build it first (ci_steps.py web)"
        if os.path.lexists(self.path(SITE, WORKER)):
            return f"{SITE} holds {WORKER}, which Pages would run as code on the site; the site is static"
        return None

    def check_site(self):
        problem = self.site_problem()
        if problem:
            print(f"deploy-dev: check-site: {problem}")
            return 1
        print(f"deploy-dev: check-site: {SITE} holds plain files and folders only, with {ASSOCIATION}")
        return 0

    # setup-wrangler

    def wrangler_home(self, step):
        """setup-wrangler's folder under RUNNER_TEMP, or None when there is no such place outside
        the checkout."""
        temp = self.value("RUNNER_TEMP")
        if not temp or not os.path.isabs(temp):
            print(f"deploy-dev: {step}: RUNNER_TEMP isn't an absolute path (GitHub's runner sets it)")
            return None
        home = os.path.join(os.path.realpath(temp), WRANGLER_HOME)
        root = os.path.realpath(self.root)
        if os.path.commonpath([home, root]) == root:
            print(f"deploy-dev: {step}: RUNNER_TEMP is inside the checkout")
            return None
        return home

    def setup_wrangler(self):
        problem = self.lockfile_problem()
        if problem:
            print(f"deploy-dev: setup-wrangler: {problem}, so nothing is installed")
            return 1
        home = self.wrangler_home("setup-wrangler")
        if home is None:
            return 1
        try:
            os.makedirs(home)
            for name in ("package.json", "package-lock.json"):
                shutil.copyfile(self.path(PAGES_DIR, name), os.path.join(home, name))
        except OSError as error:
            print(f"deploy-dev: setup-wrangler: couldn't make {home} with {PAGES_DIR}'s two files ({error})")
            return 1
        # --workspaces=false: npm takes this folder as the project, never a package.json above it.
        cmd = ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--workspaces=false"]
        code = self.run_process(cmd, home, dict(self.environ))
        if code != 0:
            print(f"deploy-dev: setup-wrangler: npm ci failed (exit {code})")
            return 1
        try:
            with open(os.path.join(home, "node_modules", "wrangler", "package.json"), encoding="utf-8") as f:
                installed = json.load(f).get("version")
        except (OSError, ValueError, AttributeError):
            installed = None
        if installed != WRANGLER_VERSION:
            print(f"deploy-dev: setup-wrangler: npm installed wrangler {installed}, not {WRANGLER_VERSION}")
            return 1
        print(f"deploy-dev: setup-wrangler: wrangler {WRANGLER_VERSION}, every package checked "
              "against the lockfile's SHA-512, no install script run")
        return 0

    def lockfile_problem(self):
        """Why tools/ci/pages' manifest and lockfile can't be installed as they stand, or None."""
        try:
            with open(self.path(PAGES_DIR, "package.json"), encoding="utf-8") as f:
                manifest = json.load(f)
            with open(self.path(PAGES_DIR, "package-lock.json"), encoding="utf-8") as f:
                lock = json.load(f)
        except (OSError, ValueError) as error:
            return f"{PAGES_DIR}'s package.json or package-lock.json can't be read ({error})"
        wanted = {"wrangler": WRANGLER_VERSION}
        if manifest != {"private": True, "dependencies": wanted}:
            return f"{PAGES_DIR}/package.json isn't exactly wrangler {WRANGLER_VERSION}, private"
        packages = lock.get("packages") if isinstance(lock, dict) else None
        if not isinstance(packages, dict) or lock.get("lockfileVersion") != 3:
            return "the lockfile isn't npm's version 3"
        if not isinstance(packages.get(""), dict) or packages[""].get("dependencies") != wanted:
            return f"the lockfile's root doesn't name wrangler {WRANGLER_VERSION} alone"
        if not isinstance(packages.get("node_modules/wrangler"), dict) \
                or packages["node_modules/wrangler"].get("version") != WRANGLER_VERSION:
            return f"the lockfile's wrangler isn't {WRANGLER_VERSION}"
        for name, entry in packages.items():
            if name == "":
                continue
            if not name.startswith("node_modules/") or not isinstance(entry, dict):
                return f"the lockfile's entry {name!r} isn't a package from the registry"
            resolved, integrity = entry.get("resolved"), entry.get("integrity")
            if not isinstance(resolved, str) or not resolved.startswith(REGISTRY):
                return f"the lockfile's {name} doesn't come from {REGISTRY}"
            if not isinstance(integrity, str) or not integrity.startswith("sha512-"):
                return f"the lockfile's {name} has no SHA-512 integrity"
        return None

    # Cloudflare Pages

    def cloudflare(self, step):
        token, account = self.value("CLOUDFLARE_API_TOKEN"), self.value("CLOUDFLARE_ACCOUNT_ID")
        if not token:
            print(f"deploy-dev: {step} has no CLOUDFLARE_API_TOKEN: the repository secret "
                  "CLOUDFLARE_API_TOKEN is empty in this run (is it set? Settings, Secrets and variables, Actions)")
            return None
        if not ACCOUNT.fullmatch(account):
            print(f"deploy-dev: {step}: the repository variable CLOUDFLARE_ACCOUNT_ID isn't an "
                  "account id of 32 hexadecimal digits (is it set? Settings, Secrets and variables, Actions)")
            return None
        return token, account

    def cloudflare_request(self, token, method, path, document=None):
        headers = {"authorization": f"Bearer {token}", "accept": "application/json", "user-agent": USER_AGENT}
        body = None
        if document is not None:
            headers["content-type"] = "application/json"
            body = json.dumps(document).encode()
        return self.http.request(method, CLOUDFLARE_API, f"/client/v4{path}", headers, body)

    def project(self, token, account):
        """The project as Cloudflare gives it, None when it doesn't exist; raises StepFailed."""
        try:
            answer = self.cloudflare_request(token, "GET", f"/accounts/{account}/pages/projects/{PAGES_PROJECT}")
        except (OSError, http.client.HTTPException) as error:
            raise Transient(f"couldn't ask Cloudflare for the Pages project {PAGES_PROJECT} ({error})") from error
        document = json_of(answer)
        if answer.status == 200 and isinstance(document, dict) and document.get("success") is True \
                and isinstance(document.get("result"), dict):
            return document["result"]
        # Cloudflare documents its failures only as "4XX"; wrangler, too, knows a missing project by
        # the error's code alone, so a 4xx that carries it is the one answer read as "not there".
        if 400 <= answer.status < 500 and isinstance(document, dict) and document.get("success") is False \
                and any(isinstance(e, dict) and e.get("code") == PROJECT_NOT_FOUND
                        for e in document.get("errors") or []):
            return None
        failed = Transient if answer.status >= 500 else StepFailed
        raise failed(f"Cloudflare answered HTTP {answer.status} to the request for the Pages project "
                     f"{PAGES_PROJECT}: {cloudflare_errors(document)}")

    def pages_project(self):
        given = self.cloudflare("pages-project")
        if given is None:
            return 1
        token, account = given
        try:
            project = self.project(token, account)
            if project is None:
                project = self.create_project(token, account)
        except StepFailed as failure:
            print(f"deploy-dev: pages-project: {failure}")
            return 1
        branch = project.get("production_branch")
        if branch != BRANCH:
            print(f"deploy-dev: pages-project: the Pages project {PAGES_PROJECT} deploys {branch!r} to "
                  f"production, not {BRANCH}; it is left as it is, and nothing is deployed")
            return 1
        print(f"deploy-dev: pages-project: {PAGES_PROJECT} serves {BRANCH} at {project.get('subdomain')}")
        return 0

    def create_project(self, token, account):
        try:
            answer = self.cloudflare_request(token, "POST", f"/accounts/{account}/pages/projects",
                                             {"name": PAGES_PROJECT, "production_branch": BRANCH})
        except (OSError, http.client.HTTPException) as error:
            raise StepFailed(f"couldn't ask Cloudflare to make the Pages project {PAGES_PROJECT} ({error})") from error
        document = json_of(answer)
        if answer.status == 200 and isinstance(document, dict) and document.get("success") is True \
                and isinstance(document.get("result"), dict):
            print(f"deploy-dev: pages-project: made the Pages project {PAGES_PROJECT}")
            return document["result"]
        raise StepFailed(f"Cloudflare answered HTTP {answer.status} to making the Pages project "
                         f"{PAGES_PROJECT}: {cloudflare_errors(document)}")

    def pages_deploy(self):
        given = self.cloudflare("pages-deploy")
        sha = self.sha("pages-deploy")
        if given is None or sha is None:
            return 1
        token, account = given
        problem = self.site_problem()
        if problem:
            print(f"deploy-dev: pages-deploy: {problem}, so nothing is deployed")
            return 1
        home = self.wrangler_home("pages-deploy")
        if home is None:
            return 1
        wrangler = os.path.join(home, WRANGLER)
        if not os.path.isfile(wrangler):
            print(f"deploy-dev: pages-deploy: there is no {wrangler}: setup-wrangler installs it")
            return 1
        cmd = ["node", wrangler, "pages", "deploy", self.path(SITE), f"--project-name={PAGES_PROJECT}",
               f"--branch={BRANCH}", f"--commit-hash={sha}", f"--commit-message=main at {sha[:12]}",
               "--commit-dirty=false"]
        # wrangler reads .env and .env.local, a functions/ folder and a wrangler configuration from
        # its working directory (the configuration from every folder above it too, up to /), and
        # writes under HOME: an empty folder of its own is both, so no file in the repository
        # changes what it does. Only these variables reach it; its usage data and error reports
        # stay off (DO_NOT_TRACK outranks every other setting).
        with tempfile.TemporaryDirectory(prefix="deploy-dev-wrangler-") as home:
            env = {"PATH": self.value("PATH"), "HOME": home, "CI": "true", "DO_NOT_TRACK": "1",
                   "WRANGLER_SEND_METRICS": "false", "WRANGLER_SEND_ERROR_REPORTS": "false",
                   "CLOUDFLARE_API_TOKEN": token, "CLOUDFLARE_ACCOUNT_ID": account}
            code = self.run_process(cmd, home, env)
        if code != 0:
            print(f"deploy-dev: pages-deploy: wrangler failed (exit {code})")
            return 1
        return 0

    def check_association(self):
        given = self.cloudflare("check-association")
        sha = self.sha("check-association")
        if given is None or sha is None:
            return 1
        token, account = given
        try:
            with open(self.path(SITE, ASSOCIATION.lstrip("/")), "rb") as f:
                built = f.read()
        except OSError as error:
            print(f"deploy-dev: check-association: {SITE}{ASSOCIATION} can't be read ({error})")
            return 1
        try:
            project, deployment = self.this_deployment(token, account, sha)
            hosts = [project["subdomain"], host_of(deployment["url"])]
            for host in hosts:
                self.served(host, built)
        except StepFailed as failure:
            print(f"deploy-dev: check-association: {failure}")
            return 1
        print(f"deploy-dev: check-association: {ASSOCIATION} is served as application/json, as built, "
              f"at {' and '.join(hosts)}")
        return 0

    def this_deployment(self, token, account, sha):
        """The project and its production deployment, once that is this commit's and has
        succeeded; raises StepFailed when it fails or doesn't come."""
        seen = "no production deployment"
        for poll in range(1, PAGES_POLLS + 1):
            try:
                project = self.project(token, account)
            except Transient as failure:
                # Fly and Pages are live by now: a lost connection or a 5xx is "not yet", as in every
                # other wait here; a 4xx still fails at once.
                seen = str(failure)
                project = {}
            else:
                seen = "no production deployment"
            if project is None:
                raise StepFailed(f"the Pages project {PAGES_PROJECT} doesn't exist")
            deployment = project.get("canonical_deployment")
            if isinstance(deployment, dict):
                trigger = deployment.get("deployment_trigger") or {}
                commit = (trigger.get("metadata") or {}).get("commit_hash")
                stage = deployment.get("latest_stage") or {}
                if commit == sha and deployment.get("environment") == "production":
                    if stage.get("name") == "deploy" and stage.get("status") == "success" \
                            and isinstance(deployment.get("url"), str) and isinstance(project.get("subdomain"), str):
                        return project, deployment
                    # A direct upload skips its build stages; a skipped deploy stage, like a failed or
                    # cancelled stage, never comes to success.
                    if stage.get("status") in ("failure", "canceled") or \
                            (stage.get("name"), stage.get("status")) == ("deploy", "skipped"):
                        raise StepFailed(f"the deployment of {sha[:12]} ended {stage.get('status')} at its "
                                         f"{stage.get('name')} stage")
                seen = f"the production deployment is of {str(commit)[:12]}, at {stage.get('name')} {stage.get('status')}"
            if poll < PAGES_POLLS:
                self.sleep(PAGES_POLL_SECONDS)
        raise StepFailed(f"{sha[:12]}'s deployment hadn't succeeded after {PAGES_POLLS} looks, "
                         f"{PAGES_POLL_SECONDS} seconds apart: {seen}")

    def served(self, host, built):
        """Returns once host serves the association file as built; raises StepFailed when it
        doesn't, after a new name has had its time to answer."""
        problem = None
        for poll in range(1, PAGES_POLLS + 1):
            try:
                answer = self.http.request("GET", host, ASSOCIATION, {"user-agent": USER_AGENT})
            except (OSError, http.client.HTTPException) as error:
                problem = f"couldn't reach https://{host}{ASSOCIATION} ({error})"
            else:
                if answer.status == 200:
                    if answer.header("content-type") != "application/json":
                        raise StepFailed(f"https://{host}{ASSOCIATION} is served as "
                                         f"{answer.headers.get('content-type')}, not 'application/json'")
                    if answer.body != built:
                        raise StepFailed(f"https://{host}{ASSOCIATION} isn't the file built from this commit")
                    return
                if 300 <= answer.status < 400:
                    raise StepFailed(f"https://{host}{ASSOCIATION} redirects (HTTP {answer.status}), which "
                                     "Apple doesn't follow")
                problem = f"https://{host}{ASSOCIATION} answered HTTP {answer.status}"
            if poll < PAGES_POLLS:
                self.sleep(PAGES_POLL_SECONDS)
        raise StepFailed(f"{problem}, after {PAGES_POLLS} looks, {PAGES_POLL_SECONDS} seconds apart")


class StepFailed(Exception):
    pass


class Transient(StepFailed):
    """A failure that a wait may ask again about: a lost connection or a server error."""


def host_of(url):
    match = re.fullmatch(r"https://([a-z0-9.-]+)/?", url or "")
    if not match:
        raise StepFailed(f"the deployment's address {url!r} isn't an https host")
    return match.group(1)


STEPS = {
    "wait-ci": Steps.wait_ci, "check-api": Steps.check_api, "check-head": Steps.check_head,
    "check-site": Steps.check_site, "setup-wrangler": Steps.setup_wrangler,
    "pages-project": Steps.pages_project, "pages-deploy": Steps.pages_deploy,
    "check-association": Steps.check_association,
}


def main(argv):
    if len(argv) != 2 or argv[1] not in STEPS:
        print("usage: python3 tools/ci/deploy_dev_steps.py <step>\nsteps: " + ", ".join(STEPS))
        return 2
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return STEPS[argv[1]](Steps(root))


if __name__ == "__main__":
    sys.exit(main(sys.argv))
