#!/usr/bin/env python3
"""Tests for tools/ci/deploy_dev_steps.py and .github/workflows/deploy-dev.yml.
Run: python3 tools/ci/deploy_dev_steps_test.py

The steps run against a fake Http that answers from a script and records every request, a fake
sleep that counts, and a fake process runner, so nothing here needs the network, GitHub,
Cloudflare or Fly. WorkflowFileTest reads deploy-dev.yml whole with ops_steps_test's strict reader
and holds every key and value to the ones built here, so each secret is named only in the steps
that use it. The committed lockfile is checked by the same function setup-wrangler runs.
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import contextlib
import io
import json
import os
import re
import shutil
import ssl
import sys
import tempfile
import unittest
import unittest.mock

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import deploy_dev_steps as steps_module  # noqa: E402
import ops_steps  # noqa: E402
from ops_steps_test import parse_yaml, pins  # noqa: E402

Answer = steps_module.Answer
SHA = "0123456789abcdef0123456789abcdef01234567"
OTHER_SHA = "fedcba9876543210fedcba9876543210fedcba98"
ACCOUNT = "0123456789abcdef0123456789abcdef"
TOKEN = "secret-token-value"
CLOUDFLARE = {"CLOUDFLARE_API_TOKEN": TOKEN, "CLOUDFLARE_ACCOUNT_ID": ACCOUNT, "GITHUB_SHA": SHA}
ASSOCIATION_BYTES = b'{\n  "applinks": {\n    "details": []\n  }\n}\n'


def answer(status, body=b"", headers=None):
    if isinstance(body, (dict, list)):
        body = json.dumps(body).encode()
    return Answer(status, {k: (v if isinstance(v, list) else [v]) for k, v in (headers or {}).items()}, body)


class FakeHttp:
    """Answers each request from a function of (method, host, path, body); records them all."""

    def __init__(self, respond):
        self.respond = respond
        self.requests = []

    def request(self, method, host, path, headers, body=None):
        self.requests.append({"method": method, "host": host, "path": path, "headers": dict(headers), "body": body})
        result = self.respond(method, host, path, body)
        if isinstance(result, BaseException):
            raise result
        return result


class Sleeps:
    def __init__(self):
        self.calls = []

    def __call__(self, seconds):
        self.calls.append(seconds)


class FakeRun:
    def __init__(self, code=0, install=None):
        self.code = code
        self.install = install
        self.calls = []

    def __call__(self, cmd, cwd, env):
        self.calls.append({"cmd": list(cmd), "cwd": cwd, "env": dict(env)})
        if self.install:
            self.install()
        return self.code


def call(step, environ, respond=None, run=None, root=ROOT):
    """Runs one step; returns (exit code, what it printed, the http fake, the sleeps)."""
    http = FakeHttp(respond or (lambda *a: AssertionError("no request expected")))
    sleeps = Sleeps()
    steps = steps_module.Steps(root, environ=environ, http=http, sleep=sleeps, run=run or FakeRun())
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = getattr(steps, step)()
    return code, out.getvalue(), http, sleeps


def ci_run(run_id, status="completed", conclusion="success", sha=SHA, branch="main", event="push"):
    return {"id": run_id, "status": status, "conclusion": conclusion, "head_sha": sha,
            "head_branch": branch, "event": event}


def runs_answer(*runs):
    return answer(200, {"total_count": len(runs), "workflow_runs": list(runs)})


def sequence(*answers):
    """A respond function that gives these answers in turn, then fails the test."""
    given = list(answers)

    def respond(method, host, path, body):
        if not given:
            return AssertionError(f"an unexpected request: {method} {host}{path}")
        return given.pop(0)
    return respond


class WaitCiTest(unittest.TestCase):
    environ = {"GITHUB_TOKEN": TOKEN, "GITHUB_SHA": SHA}

    def test_it_asks_github_for_this_commit_s_push_runs_on_main_with_the_job_s_token(self):
        code, out, http, sleeps = call("wait_ci", self.environ, sequence(runs_answer(ci_run(7))))
        self.assertEqual(code, 0, out)
        [request] = http.requests
        self.assertEqual((request["method"], request["host"]), ("GET", "api.github.com"))
        self.assertEqual(request["path"], f"/repos/beurni2/tadayo/actions/workflows/ci.yml/runs"
                                          f"?head_sha={SHA}&branch=main&event=push&per_page=100")
        self.assertEqual(request["headers"]["authorization"], f"Bearer {TOKEN}")
        self.assertEqual(request["headers"]["x-github-api-version"], "2022-11-28")
        self.assertIn("ci run 7 passed", out)
        self.assertNotIn(TOKEN, out)

    def test_it_waits_while_there_is_no_run_or_one_is_still_running(self):
        code, out, http, sleeps = call("wait_ci", self.environ, sequence(
            runs_answer(), runs_answer(ci_run(7, "queued", None)), runs_answer(ci_run(7, "in_progress", None)),
            runs_answer(ci_run(7))))
        self.assertEqual(code, 0, out)
        self.assertEqual(len(http.requests), 4)
        self.assertEqual(sleeps.calls, [20, 20, 20])

    def test_a_failed_run_fails_at_once_whatever_its_siblings(self):
        for conclusion in ("failure", "timed_out", "action_required", "startup_failure", "stale", "neutral", None):
            with self.subTest(conclusion=conclusion):
                code, out, http, sleeps = call("wait_ci", self.environ, sequence(
                    runs_answer(ci_run(7, "in_progress", None), ci_run(8, "completed", conclusion), ci_run(9))))
                self.assertEqual(code, 1, out)
                self.assertIn(f"ci run 8 failed ({conclusion})", out)
                self.assertEqual(sleeps.calls, [])

    def test_runs_of_another_commit_branch_or_event_are_not_this_commit_s(self):
        others = [ci_run(1, conclusion="failure", sha=OTHER_SHA), ci_run(2, conclusion="failure", branch="api/x"),
                  ci_run(3, conclusion="failure", event="pull_request"), ci_run(4, "in_progress", None, sha=OTHER_SHA),
                  {**ci_run(5), "id": "5"}, {**ci_run(6), "id": True}]
        code, out, http, sleeps = call("wait_ci", self.environ, sequence(runs_answer(*others, ci_run(10))))
        self.assertEqual(code, 0, out)
        self.assertIn("ci run 10 passed", out)

    def test_only_cancelled_or_skipped_runs_fail(self):
        code, out, _, _ = call("wait_ci", self.environ, sequence(
            runs_answer(ci_run(7, conclusion="cancelled"), ci_run(8, conclusion="skipped"))))
        self.assertEqual(code, 1, out)
        self.assertIn("cancelled or skipped", out)
        code, out, _, _ = call("wait_ci", self.environ, sequence(
            runs_answer(ci_run(7, conclusion="cancelled"), ci_run(8))))
        self.assertEqual(code, 0, out)

    def test_it_gives_up_after_its_last_look(self):
        code, out, http, sleeps = call("wait_ci", self.environ, lambda *a: runs_answer(ci_run(7, "in_progress", None)))
        self.assertEqual(code, 1, out)
        self.assertEqual(len(http.requests), 120)
        self.assertEqual(sleeps.calls, [20] * 119)
        self.assertIn("hadn't finished after 120 looks, 20 seconds apart; nothing was deployed", out)

    def test_a_server_error_or_a_lost_connection_is_asked_again_and_a_refusal_is_not(self):
        code, out, http, _ = call("wait_ci", self.environ, sequence(
            answer(502), OSError("connection reset"), runs_answer(ci_run(7))))
        self.assertEqual(code, 0, out)
        self.assertEqual(len(http.requests), 3)
        for status in (401, 403, 404):
            with self.subTest(status=status):
                code, out, http, _ = call("wait_ci", self.environ, sequence(answer(status)))
                self.assertEqual(code, 1, out)
                self.assertIn(f"GitHub answered HTTP {status}", out)

    def test_an_answer_without_a_list_of_runs_fails(self):
        for body in (b"not json", {"message": "x"}, {"workflow_runs": "x"}, []):
            with self.subTest(body=body):
                code, out, _, _ = call("wait_ci", self.environ, sequence(answer(200, body)))
                self.assertEqual(code, 1, out)

    def test_a_missing_token_or_commit_fails_before_any_request(self):
        for environ in ({"GITHUB_SHA": SHA}, {"GITHUB_TOKEN": TOKEN}, {"GITHUB_TOKEN": TOKEN, "GITHUB_SHA": "main"},
                        {"GITHUB_TOKEN": TOKEN, "GITHUB_SHA": SHA.upper()}, {"GITHUB_TOKEN": TOKEN, "GITHUB_SHA": SHA + "\n"}):
            with self.subTest(environ=environ):
                code, out, http, _ = call("wait_ci", environ)
                self.assertEqual(code, 1, out)
                self.assertEqual(http.requests, [])


GOOD_API = answer(401, b'{"code":"UNAUTHENTICATED"}', {
    "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store",
    "content-length": "26", "server": "Fly/abc", "via": "1.1 fly.io"})


class CheckApiTest(unittest.TestCase):
    def test_the_neutral_401_passes(self):
        code, out, http, sleeps = call("check_api", {}, sequence(GOOD_API))
        self.assertEqual(code, 0, out)
        [request] = http.requests
        self.assertEqual((request["method"], request["host"], request["path"]), ("GET", "api-dev.tadayo.app", "/v1/me"))
        self.assertNotIn("authorization", {k.lower() for k in request["headers"]})
        self.assertEqual(sleeps.calls, [])

    def test_any_other_answer_fails_at_once(self):
        cases = {
            "200": answer(200, b'{"code":"UNAUTHENTICATED"}', GOOD_API.headers),
            "404": answer(404, b'{"code":"NOT_FOUND"}', GOOD_API.headers),
            "500": answer(500, b"", GOOD_API.headers),
            "a redirect": answer(301, b"", {"location": "https://example.com/"}),
            "another body": answer(401, b'{"code":"UNAUTHENTICATED","x":1}', GOOD_API.headers),
            "no charset": answer(401, GOOD_API.body, {**GOOD_API.headers, "content-type": ["application/json"]}),
            "cached": answer(401, GOOD_API.body, {**GOOD_API.headers, "cache-control": ["public, max-age=60"]}),
            "no cache-control": answer(401, GOOD_API.body, {"content-type": GOOD_API.headers["content-type"]}),
            "two content-types": answer(401, GOOD_API.body, {**GOOD_API.headers,
                                                             "content-type": ["application/json; charset=utf-8"] * 2}),
        }
        for name, given in cases.items():
            with self.subTest(case=name):
                code, out, http, sleeps = call("check_api", {}, sequence(given))
                self.assertEqual(code, 1, out)
                self.assertEqual(len(http.requests), 1)
                self.assertEqual(sleeps.calls, [])

    def test_fly_s_proxy_errors_and_a_lost_connection_are_asked_again(self):
        code, out, http, sleeps = call("check_api", {}, sequence(
            answer(502), answer(503), answer(504), ConnectionRefusedError("refused"), GOOD_API))
        self.assertEqual(code, 0, out)
        self.assertEqual(sleeps.calls, [10, 10, 10, 10])

    def test_it_fails_after_its_last_try(self):
        code, out, http, sleeps = call("check_api", {}, lambda *a: answer(503))
        self.assertEqual(code, 1, out)
        self.assertEqual(len(http.requests), 6)
        self.assertEqual(sleeps.calls, [10] * 5)
        self.assertIn("answered HTTP 503, 6 times", out)

    def test_the_host_is_ops_dev_host(self):
        with open(os.path.join(ROOT, "tools", "ops", "src", "environment.ts"), encoding="utf-8") as f:
            found = re.findall(r'^export const DEV_HOST = "([^"]+)";$', f.read(), re.M)
        self.assertEqual(found, [steps_module.DEV_HOST])

    def test_the_expected_answer_is_the_api_s_pinned_one(self):
        with open(os.path.join(ROOT, "services", "api", "src", "session.test.ts"), encoding="utf-8") as f:
            text = f.read()
        block = re.search(r"const UNAUTHENTICATED = \{(.*?)\n\};", text, re.S).group(1)
        self.assertIn("status: 401,", block)
        self.assertIn("body: '%s'," % steps_module.EXPECTED_API["body"].decode(), block)
        for name in ("content-type", "cache-control"):
            self.assertIn(f'"{name}": "{steps_module.EXPECTED_API[name]}"', block)


class Repository:
    """A scratch copy of the files the Pages steps read: tools/ci/pages and the web job's build in
    apps/web/dist; and, beside it, a folder that stands for the runner's RUNNER_TEMP, holding the
    site as the pages job downloads it."""

    def __init__(self, test):
        self.root = tempfile.mkdtemp()
        test.addCleanup(shutil.rmtree, self.root)
        self.temp = tempfile.mkdtemp()
        test.addCleanup(shutil.rmtree, self.temp)
        pages = os.path.join(self.root, "tools", "ci", "pages")
        os.makedirs(pages)
        for name in ("package.json", "package-lock.json"):
            shutil.copy(os.path.join(ROOT, "tools", "ci", "pages", name), pages)
        for site in (self.build(), self.site()):
            os.makedirs(os.path.join(site, ".well-known"))
            with open(os.path.join(site, ".well-known", "apple-app-site-association"), "wb") as f:
                f.write(ASSOCIATION_BYTES)

    def path(self, *parts):
        return os.path.join(self.root, *parts)

    def build(self, *parts):
        """The web job's build, in the checkout."""
        return self.path("apps", "web", "dist", *parts)

    def site(self, *parts):
        """The pages job's download, under RUNNER_TEMP."""
        return os.path.join(os.path.realpath(self.temp), "deploy-dev-site", *parts)

    def edit_lock(self, change):
        with open(self.path("tools", "ci", "pages", "package-lock.json"), encoding="utf-8") as f:
            lock = json.load(f)
        change(lock)
        with open(self.path("tools", "ci", "pages", "package-lock.json"), "w", encoding="utf-8") as f:
            json.dump(lock, f)

    def wrangler_home(self):
        return os.path.join(os.path.realpath(self.temp), "deploy-dev-wrangler")

    def installer(self, version=steps_module.WRANGLER_VERSION):
        def install():
            folder = os.path.join(self.wrangler_home(), "node_modules", "wrangler")
            os.makedirs(os.path.join(folder, "bin"), exist_ok=True)
            with open(os.path.join(folder, "package.json"), "w", encoding="utf-8") as f:
                json.dump({"name": "wrangler", "version": version}, f)
            open(os.path.join(folder, "bin", "wrangler.js"), "w").close()
        return install

    def wrangler(self):
        """Installs a stand-in wrangler where setup-wrangler would; returns its path."""
        self.installer()()
        return os.path.join(self.wrangler_home(), "node_modules", "wrangler", "bin", "wrangler.js")


class SetupWranglerTest(unittest.TestCase):
    def test_the_committed_lockfile_passes_its_own_check_and_names_the_pin(self):
        steps = steps_module.Steps(ROOT, environ={})
        self.assertIsNone(steps.lockfile_problem())
        with open(os.path.join(ROOT, "tools", "ci", "pages", "package-lock.json"), encoding="utf-8") as f:
            lock = json.load(f)
        self.assertEqual(lock["packages"]["node_modules/wrangler"]["version"], "4.153.0")

    def test_it_runs_npm_ci_without_install_scripts_outside_the_checkout(self):
        # npm looks upward for a workspace whose lockfile it would use instead, and Node looks upward
        # for modules, so wrangler is installed from a copy of the two files in a folder of its own
        # under RUNNER_TEMP (PR #52's review, round 2).
        repo = Repository(self)
        run = FakeRun(install=repo.installer())
        code, out, http, _ = call("setup_wrangler", {"PATH": "/bin", "RUNNER_TEMP": repo.temp}, run=run,
                                  root=repo.root)
        self.assertEqual(code, 0, out)
        [done] = run.calls
        self.assertEqual(done["cmd"], ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--workspaces=false"])
        self.assertEqual(done["cwd"], repo.wrangler_home())
        for name in ("package.json", "package-lock.json"):
            with open(repo.path("tools", "ci", "pages", name), "rb") as ours, \
                    open(os.path.join(repo.wrangler_home(), name), "rb") as copied:
                self.assertEqual(copied.read(), ours.read())
        self.assertEqual(sorted(os.listdir(repo.path("tools", "ci", "pages"))), ["package-lock.json", "package.json"])
        self.assertEqual(http.requests, [])

    def test_it_needs_a_runner_temp_outside_the_checkout_and_a_folder_of_its_own(self):
        repo = Repository(self)
        # A RUNNER_TEMP outside the checkout by its name that is a link to a folder inside it.
        linked = os.path.join(tempfile.mkdtemp(), "temp")
        self.addCleanup(shutil.rmtree, os.path.dirname(linked))
        os.symlink(repo.path("tools"), linked)
        for temp in (None, "relative/temp", repo.root, repo.path("tools"), linked):
            with self.subTest(temp=temp):
                run = FakeRun()
                code, out, _, _ = call("setup_wrangler", {} if temp is None else {"RUNNER_TEMP": temp}, run=run,
                                       root=repo.root)
                self.assertEqual(code, 1, out)
                self.assertEqual(run.calls, [])
                self.assertIn("RUNNER_TEMP", out)
        os.makedirs(repo.wrangler_home())
        run = FakeRun()
        code, out, _, _ = call("setup_wrangler", {"RUNNER_TEMP": repo.temp}, run=run, root=repo.root)
        self.assertEqual(code, 1, out)
        self.assertEqual(run.calls, [])
        self.assertIn("couldn't make", out)

    def test_it_refuses_a_lockfile_it_can_t_trust_before_installing(self):
        def drop(key):
            return lambda lock: lock["packages"][next(k for k in lock["packages"] if k.startswith("node_modules/@"))].pop(key)

        def move(lock):
            name = next(k for k in lock["packages"] if k.startswith("node_modules/@"))
            lock["packages"][name]["resolved"] = "https://example.com/x.tgz"

        def sha1(lock):
            name = next(k for k in lock["packages"] if k.startswith("node_modules/@"))
            lock["packages"][name]["integrity"] = "sha1-abc"

        def link(lock):
            lock["packages"]["../elsewhere"] = {"resolved": "https://registry.npmjs.org/x", "integrity": "sha512-x"}

        changes = {
            "no integrity": drop("integrity"), "not resolved": drop("resolved"), "resolved elsewhere": move,
            "a SHA-1 integrity": sha1, "an entry outside node_modules": link,
            "another wrangler": lambda lock: lock["packages"]["node_modules/wrangler"].update(version="4.161.0"),
            "another root": lambda lock: lock["packages"][""].update(dependencies={"wrangler": "^4.153.0"}),
            "another lockfile version": lambda lock: lock.update(lockfileVersion=2),
        }
        for name, change in changes.items():
            with self.subTest(change=name):
                repo = Repository(self)
                repo.edit_lock(change)
                run = FakeRun()
                code, out, _, _ = call("setup_wrangler", {}, run=run, root=repo.root)
                self.assertEqual(code, 1, out)
                self.assertEqual(run.calls, [])
                self.assertIn("nothing is installed", out)

    def test_it_refuses_another_manifest_or_a_missing_file(self):
        manifests = [{"private": True, "dependencies": {"wrangler": "^4.153.0"}},
                     {"dependencies": {"wrangler": "4.153.0"}},
                     {"private": True, "dependencies": {"wrangler": "4.153.0", "left-pad": "1.3.0"}},
                     {"private": True, "dependencies": {"wrangler": "4.153.0"}, "scripts": {"postinstall": "x"}}]
        for manifest in manifests:
            with self.subTest(manifest=manifest):
                repo = Repository(self)
                with open(repo.path("tools", "ci", "pages", "package.json"), "w", encoding="utf-8") as f:
                    json.dump(manifest, f)
                run = FakeRun()
                code, out, _, _ = call("setup_wrangler", {}, run=run, root=repo.root)
                self.assertEqual(code, 1, out)
                self.assertEqual(run.calls, [])
        for name, text in {"a missing lockfile": None, "a lockfile that is a list": "[]",
                           "a lockfile that isn't JSON": "{", "a manifest that is a list": "[]"}.items():
            with self.subTest(case=name):
                repo = Repository(self)
                file = "package.json" if "manifest" in name else "package-lock.json"
                os.remove(repo.path("tools", "ci", "pages", file))
                if text is not None:
                    with open(repo.path("tools", "ci", "pages", file), "w", encoding="utf-8") as f:
                        f.write(text)
                run = FakeRun()
                code, out, _, _ = call("setup_wrangler", {}, run=run, root=repo.root)
                self.assertEqual(code, 1, out)
                self.assertEqual(run.calls, [])
                self.assertIn("nothing is installed", out)

    def test_a_failed_install_or_another_version_installed_fails(self):
        repo = Repository(self)
        code, out, _, _ = call("setup_wrangler", {"RUNNER_TEMP": repo.temp}, run=FakeRun(code=1, install=repo.installer()),
                               root=repo.root)
        self.assertEqual(code, 1, out)
        self.assertIn("npm ci failed (exit 1)", out)
        repo = Repository(self)
        code, out, _, _ = call("setup_wrangler", {"RUNNER_TEMP": repo.temp},
                               run=FakeRun(install=repo.installer("4.161.0")), root=repo.root)
        self.assertEqual(code, 1, out)
        self.assertIn("npm installed wrangler 4.161.0", out)


PROJECT_PATH = f"/client/v4/accounts/{ACCOUNT}/pages/projects/tadayo"
CREATE_PATH = f"/client/v4/accounts/{ACCOUNT}/pages/projects"
NOT_FOUND = answer(404, {"success": False, "errors": [{"code": 8000007, "message": "Project not found."}],
                         "messages": [], "result": None})


def project(branch="main", deployment=None, subdomain="tadayo-x1y.pages.dev"):
    return {"name": "tadayo", "subdomain": subdomain, "production_branch": branch,
            "domains": [subdomain], "canonical_deployment": deployment}


def deployment(sha=SHA, status="success", stage="deploy", url="https://abc123.tadayo-x1y.pages.dev",
               environment="production"):
    return {"id": "d1", "url": url, "environment": environment,
            "deployment_trigger": {"type": "ad_hoc", "metadata": {"branch": "main", "commit_hash": sha}},
            "latest_stage": {"name": stage, "status": status}}


def found(result):
    return answer(200, {"success": True, "errors": [], "messages": [], "result": result})


class PagesProjectTest(unittest.TestCase):
    def test_it_makes_a_missing_project_for_main(self):
        code, out, http, _ = call("pages_project", CLOUDFLARE, sequence(NOT_FOUND, found(project())))
        self.assertEqual(code, 0, out)
        get, post = http.requests
        self.assertEqual((get["method"], get["host"], get["path"]), ("GET", "api.cloudflare.com", PROJECT_PATH))
        self.assertEqual((post["method"], post["path"]), ("POST", CREATE_PATH))
        self.assertEqual(json.loads(post["body"]), {"name": "tadayo", "production_branch": "main"})
        self.assertEqual(post["headers"]["content-type"], "application/json")
        for request in http.requests:
            self.assertEqual(request["headers"]["authorization"], f"Bearer {TOKEN}")
        self.assertIn("made the Pages project tadayo", out)
        self.assertIn("tadayo-x1y.pages.dev", out)
        self.assertNotIn(TOKEN, out)
        self.assertNotIn(ACCOUNT, out)

    def test_cloudflare_s_not_found_code_in_any_4xx_is_a_missing_project_and_nothing_else_is(self):
        for status in (400, 404, 422):
            with self.subTest(status=status):
                given = answer(status, {"success": False, "errors": [{"code": 8000007, "message": "Project not found."}]})
                code, out, http, _ = call("pages_project", CLOUDFLARE, sequence(given, found(project())))
                self.assertEqual(code, 0, out)
                self.assertEqual([r["method"] for r in http.requests], ["GET", "POST"])
        for name, given in {
                "a bare 404": answer(404, {"success": False, "errors": []}),
                "a 404 with no body": answer(404, b""),
                "a server error with the code": answer(500, {"success": False, "errors": [{"code": 8000007}]}),
                "a success with the code": answer(200, {"success": True, "errors": [{"code": 8000007}]}),
                "the code under another success": answer(404, {"success": True, "errors": [{"code": 8000007}]}),
                "the code as text": answer(404, {"success": False, "errors": [{"code": "8000007"}]})}.items():
            with self.subTest(case=name):
                code, out, http, _ = call("pages_project", CLOUDFLARE, sequence(given, found(project())))
                self.assertEqual(code, 1, out)
                self.assertEqual([r["method"] for r in http.requests], ["GET"])

    def test_it_leaves_an_existing_project_as_it_is(self):
        code, out, http, _ = call("pages_project", CLOUDFLARE, sequence(found(project())))
        self.assertEqual(code, 0, out)
        self.assertEqual([r["method"] for r in http.requests], ["GET"])

    def test_a_project_on_another_production_branch_is_refused_and_not_changed(self):
        code, out, http, _ = call("pages_project", CLOUDFLARE, sequence(found(project(branch="production"))))
        self.assertEqual(code, 1, out)
        self.assertEqual([r["method"] for r in http.requests], ["GET"])
        self.assertIn("'production'", out)

    def test_any_other_answer_fails_with_cloudflare_s_errors(self):
        refusal = answer(403, {"success": False, "errors": [{"code": 10000, "message": "Authentication error"}]})
        for given in (refusal, answer(404, {"success": False, "errors": [{"code": 7003, "message": "x"}]}),
                      answer(500, b"<html>"), answer(200, {"success": False, "errors": []}),
                      answer(200, {"success": False, "errors": [], "result": project()}), OSError("reset")):
            with self.subTest(given=given):
                code, out, http, _ = call("pages_project", CLOUDFLARE, sequence(given))
                self.assertEqual(code, 1, out)
                self.assertEqual(len(http.requests), 1)
                self.assertNotIn(TOKEN, out)
        code, out, _, _ = call("pages_project", CLOUDFLARE, sequence(refusal))
        self.assertIn("HTTP 403", out)
        self.assertIn("10000 Authentication error", out)
        for given in (refusal, answer(200, {"success": False, "errors": [], "result": project()})):
            with self.subTest(made=given):
                code, out, http, _ = call("pages_project", CLOUDFLARE, sequence(NOT_FOUND, given))
                self.assertEqual(code, 1, out)
                self.assertIn("to making the Pages project tadayo", out)
        code, out, http, _ = call("pages_project", CLOUDFLARE, sequence(NOT_FOUND, refusal))
        self.assertIn("to making the Pages project tadayo: 10000 Authentication error", out)

    def test_a_missing_token_or_account_fails_before_any_request(self):
        for environ in ({"CLOUDFLARE_ACCOUNT_ID": ACCOUNT}, {"CLOUDFLARE_API_TOKEN": TOKEN},
                        {"CLOUDFLARE_API_TOKEN": TOKEN, "CLOUDFLARE_ACCOUNT_ID": "acct"},
                        {"CLOUDFLARE_API_TOKEN": TOKEN, "CLOUDFLARE_ACCOUNT_ID": ACCOUNT + "/x"}):
            with self.subTest(environ=environ):
                code, out, http, _ = call("pages_project", environ)
                self.assertEqual(code, 1, out)
                self.assertEqual(http.requests, [])

    def test_a_token_that_isn_t_a_bearer_token_is_refused_and_never_said(self):
        # http.client refuses a header value with a line break by quoting it whole (PR #52's
        # review, round 3), so such a token is never sent.
        for token in ("pasted-token\n", "pasted token", "pasted-token\r\nx-other: 1", "t\u00f6ken", "=token"):
            with self.subTest(token=token):
                code, out, http, _ = call("pages_project", {**CLOUDFLARE, "CLOUDFLARE_API_TOKEN": token})
                self.assertEqual(code, 1, out)
                self.assertEqual(http.requests, [])
                self.assertIn("holds a character a bearer token can't", out)
                self.assertNotIn(token.strip(), out)
        token = "Az09._~+/-token=="
        code, out, http, _ = call("pages_project", {**CLOUDFLARE, "CLOUDFLARE_API_TOKEN": token}, sequence(found(project())))
        self.assertEqual(code, 0, out)
        self.assertEqual(http.requests[0]["headers"]["authorization"], f"Bearer {token}")


class WranglerRun(FakeRun):
    """Records, as wrangler starts, what its working folder holds and whether it exists."""

    def __call__(self, cmd, cwd, env):
        self.held = sorted(os.listdir(cwd)) if os.path.isdir(cwd) else None
        return super().__call__(cmd, cwd, env)


class PagesDeployTest(unittest.TestCase):
    def test_it_runs_the_pinned_wrangler_with_only_what_it_needs(self):
        repo = Repository(self)
        wrangler = repo.wrangler()
        run = WranglerRun()
        environ = {**CLOUDFLARE, "PATH": "/usr/bin", "HOME": "/home/runner", "FLY_API_TOKEN": "fly",
                   "GITHUB_TOKEN": "gh", "DATABASE_URL": "postgres://x", "NODE_OPTIONS": "--require /tmp/x.js",
                   "RUNNER_TEMP": repo.temp}
        code, out, http, _ = call("pages_deploy", environ, run=run, root=repo.root)
        self.assertEqual(code, 0, out)
        [done] = run.calls
        self.assertEqual(done["cmd"], [
            "node", wrangler,
            "pages", "deploy", repo.site(), "--project-name=tadayo", "--branch=main",
            f"--commit-hash={SHA}", f"--commit-message=main at {SHA[:12]}", "--commit-dirty=false"])
        self.assertEqual(done["env"], {"PATH": "/usr/bin", "HOME": done["cwd"], "CI": "true",
                                       "DO_NOT_TRACK": "1", "WRANGLER_SEND_METRICS": "false",
                                       "WRANGLER_SEND_ERROR_REPORTS": "false", "CLOUDFLARE_API_TOKEN": TOKEN,
                                       "CLOUDFLARE_ACCOUNT_ID": ACCOUNT})
        self.assertEqual(http.requests, [])

    def test_nothing_in_the_repository_reaches_wrangler_s_working_folder_or_home(self):
        # wrangler reads .env, .env.local, functions/ and a wrangler configuration from its working
        # folder (the configuration from every folder above it too), and writes under HOME.
        repo = Repository(self)
        for name in (".env", ".env.local", "wrangler.toml", "wrangler.json"):
            for folder in ((), ("tools", "ci", "pages")):
                with open(repo.path(*folder, name), "w", encoding="utf-8") as f:
                    f.write("CLOUDFLARE_API_BASE_URL=http://127.0.0.1:1/client/v4\n")
        os.makedirs(repo.path("functions"))
        repo.wrangler()
        run = WranglerRun()
        code, out, _, _ = call("pages_deploy", {**CLOUDFLARE, "PATH": "/usr/bin", "HOME": repo.root,
                                                "RUNNER_TEMP": repo.temp}, run=run, root=repo.root)
        self.assertEqual(code, 0, out)
        [done] = run.calls
        self.assertNotEqual(os.path.commonpath([done["cmd"][1], os.path.realpath(repo.root)]), os.path.realpath(repo.root),
                            "wrangler is run from inside the repository")
        cwd = done["cwd"]
        self.assertEqual(run.held, [], "wrangler's working folder isn't empty as it starts")
        self.assertEqual(done["env"]["HOME"], cwd)
        self.assertTrue(os.path.basename(cwd).startswith("deploy-dev-wrangler-"))
        inside = os.path.commonpath([os.path.realpath(cwd), os.path.realpath(repo.root)])
        self.assertNotEqual(inside, os.path.realpath(repo.root), "wrangler runs inside the repository")
        self.assertFalse(os.path.exists(cwd), "wrangler's folder is left behind")

    def test_a_worker_in_the_site_is_refused(self):
        for make in (lambda p: open(p, "w").close(), os.makedirs):
            with self.subTest(make=make):
                repo = Repository(self)
                repo.wrangler()
                make(repo.site("_worker.js"))
                run = FakeRun()
                code, out, _, _ = call("pages_deploy", {**CLOUDFLARE, "RUNNER_TEMP": repo.temp}, run=run, root=repo.root)
                self.assertEqual(code, 1, out)
                self.assertEqual(run.calls, [])
                self.assertIn("_worker.js", out)

    def test_a_link_in_the_site_is_refused(self):
        repo = Repository(self)
        repo.wrangler()
        os.symlink("/nonexistent/../proc/self/environ", repo.site("leak.txt"))
        run = FakeRun()
        code, out, _, _ = call("pages_deploy", {**CLOUDFLARE, "RUNNER_TEMP": repo.temp}, run=run, root=repo.root)
        self.assertEqual(code, 1, out)
        self.assertEqual(run.calls, [])
        self.assertIn("leak.txt is a link", out)

    def test_wrangler_s_failure_is_the_step_s(self):
        repo = Repository(self)
        repo.wrangler()
        code, out, _, _ = call("pages_deploy", {**CLOUDFLARE, "RUNNER_TEMP": repo.temp}, run=FakeRun(code=1),
                               root=repo.root)
        self.assertEqual(code, 1, out)
        self.assertIn("wrangler failed (exit 1)", out)

    def test_nothing_runs_without_the_site_the_secrets_the_commit_or_the_install(self):
        repo = Repository(self)
        repo.wrangler()
        os.remove(repo.site(".well-known", "apple-app-site-association"))
        code, out, _, _ = call("pages_deploy", {**CLOUDFLARE, "RUNNER_TEMP": repo.temp}, run=FakeRun(), root=repo.root)
        self.assertEqual(code, 1, out)
        self.assertIn("has no /.well-known/apple-app-site-association", out)
        # Each case lacks one thing alone, so only its own check can stop it (round 3).
        ready = Repository(self)
        ready.wrangler()
        bare = Repository(self)
        cases = (({**CLOUDFLARE, "CLOUDFLARE_API_TOKEN": ""}, ready, "has no CLOUDFLARE_API_TOKEN"),
                 ({**CLOUDFLARE, "CLOUDFLARE_ACCOUNT_ID": ""}, ready, "isn't an account id"),
                 ({**CLOUDFLARE, "GITHUB_SHA": ""}, ready, "GITHUB_SHA isn't"),
                 ({**CLOUDFLARE, "RUNNER_TEMP": ""}, ready, "RUNNER_TEMP isn't an absolute path"),
                 (CLOUDFLARE, bare, "setup-wrangler installs it"))
        for environ, where, said in cases:
            with self.subTest(said=said):
                run = FakeRun()
                code, out, _, _ = call("pages_deploy", {"RUNNER_TEMP": where.temp, **environ}, run=run, root=where.root)
                self.assertEqual(code, 1, out)
                self.assertEqual(run.calls, [])
                self.assertIn(said, out)

    def test_it_deploys_the_download_and_never_the_checkout_s_apps_web_dist(self):
        # download-artifact writes through a link already on its path: a link the repository held
        # at apps/web/dist would take the site's files into tools/ci/ (round 3), so the site is
        # downloaded under RUNNER_TEMP and nothing here reads apps/web/dist.
        for make in (lambda p: shutil.rmtree(p),
                     lambda p: (shutil.rmtree(p), os.symlink(os.path.join("..", "..", "tools", "ci"), p)),
                     lambda p: open(os.path.join(p, "_worker.js"), "w").close()):
            with self.subTest(make=make):
                repo = Repository(self)
                repo.wrangler()
                make(repo.build())
                environ = {**CLOUDFLARE, "RUNNER_TEMP": repo.temp}
                code, out, _, _ = call("check_site", environ, root=repo.root)
                self.assertEqual(code, 0, out)
                run = FakeRun()
                code, out, _, _ = call("pages_deploy", environ, run=run, root=repo.root)
                self.assertEqual(code, 0, out)
                self.assertEqual(run.calls[0]["cmd"][4], repo.site())
                code, out, _, _ = call("check_association", environ, CheckAssociationTest.both_served(), root=repo.root)
                self.assertEqual(code, 0, out)


class CheckSiteTest(unittest.TestCase):
    """wrangler follows a link and publishes what it points to (a link to /proc/self/environ would
    publish its own environment, the Cloudflare token in it), so the site holds plain files and
    folders only (PR #52's review, round 2): the web job's build, checked by check-build before the
    upload, and the pages job's download under RUNNER_TEMP, checked by check-site (round 3)."""

    STEPS = ("check_build", "check_site")

    def site(self, step):
        """A scratch repository, the folder `step` checks, and the environment it runs with."""
        repo = Repository(self)
        dist = repo.build() if step == "check_build" else repo.site()
        os.makedirs(os.path.join(dist, "privacy"))
        for name in ("index.html", "_headers", "404.html", os.path.join("privacy", "index.html")):
            with open(os.path.join(dist, name), "w", encoding="utf-8") as f:
                f.write("x")
        return repo, dist, ({} if step == "check_build" else {"RUNNER_TEMP": repo.temp})

    def check(self, step, repo, environ):
        return call(step, environ, root=repo.root)

    def test_a_site_of_plain_files_and_folders_passes(self):
        for step in self.STEPS:
            with self.subTest(step=step):
                repo, _, environ = self.site(step)
                code, out, http, _ = self.check(step, repo, environ)
                self.assertEqual(code, 0, out)
                self.assertEqual(http.requests, [])

    def test_each_step_checks_its_own_folder(self):
        repo, _, _ = self.site("check_build")
        shutil.rmtree(repo.site())
        code, out, _, _ = call("check_build", {}, root=repo.root)
        self.assertEqual(code, 0, out)
        self.assertIn("apps/web/dist holds plain files", out)
        code, out, _, _ = call("check_site", {"RUNNER_TEMP": repo.temp}, root=repo.root)
        self.assertEqual((code, "RUNNER_TEMP/deploy-dev-site isn't a folder" in out), (1, True), out)
        repo, _, _ = self.site("check_site")
        shutil.rmtree(repo.build())
        code, out, _, _ = call("check_site", {"RUNNER_TEMP": repo.temp}, root=repo.root)
        self.assertEqual(code, 0, out)
        self.assertIn("RUNNER_TEMP/deploy-dev-site holds plain files", out)
        code, out, _, _ = call("check_build", {}, root=repo.root)
        self.assertEqual((code, "apps/web/dist isn't a folder" in out), (1, True), out)

    def test_the_download_needs_a_runner_temp_outside_the_checkout(self):
        # Each refused RUNNER_TEMP holds a site that would pass, so only the check of RUNNER_TEMP
        # itself can refuse it (PR #52's review, round 4).
        repo, _, _ = self.site("check_site")
        inside = repo.path("tmp")
        linked = os.path.join(tempfile.mkdtemp(), "temp")
        self.addCleanup(shutil.rmtree, os.path.dirname(linked))
        os.symlink(inside, linked)
        for folder in (inside, repo.root):
            shutil.copytree(repo.site(), os.path.join(folder, "deploy-dev-site"))
        cases = ((None, "RUNNER_TEMP isn't an absolute path"), ("", "RUNNER_TEMP isn't an absolute path"),
                 (os.path.relpath(repo.temp), "RUNNER_TEMP isn't an absolute path"),
                 (inside, "RUNNER_TEMP is inside the checkout"), (repo.root, "RUNNER_TEMP is inside the checkout"),
                 (linked, "RUNNER_TEMP is inside the checkout"))
        for step in ("check_site", "pages_deploy", "check_association"):
            for temp, said in cases:
                with self.subTest(step=step, temp=temp):
                    environ = {**CLOUDFLARE, **({} if temp is None else {"RUNNER_TEMP": temp})}
                    run = FakeRun()
                    code, out, http, _ = call(step, environ, run=run, root=repo.root)
                    self.assertEqual(code, 1, out)
                    self.assertIn(said, out)
                    self.assertEqual((run.calls, http.requests), ([], []))
        code, out, _, _ = call("check_site", {"RUNNER_TEMP": repo.temp}, root=repo.root)
        self.assertEqual(code, 0, out)

    def test_a_link_anywhere_in_the_site_is_refused(self):
        outside = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, outside)
        cases = {
            "leak.txt": "/nonexistent/../proc/self/environ",
            os.path.join(".well-known", "x.json"): "/etc/hostname",
            "docs": outside,
            os.path.join("privacy", "dangling"): "/nonexistent",
        }
        for step in self.STEPS:
            for where, target in cases.items():
                with self.subTest(step=step, where=where):
                    repo, dist, environ = self.site(step)
                    os.symlink(target, os.path.join(dist, where))
                    code, out, _, _ = self.check(step, repo, environ)
                    self.assertEqual(code, 1, out)
                    self.assertIn(f"{where} is a link", out)
            with self.subTest(step=step, where="the association file"):
                repo, dist, environ = self.site(step)
                association = os.path.join(dist, ".well-known", "apple-app-site-association")
                os.rename(association, os.path.join(outside, f"aasa-{step}"))
                os.symlink(os.path.join(outside, f"aasa-{step}"), association)
                code, out, _, _ = self.check(step, repo, environ)
                self.assertEqual(code, 1, out)
                self.assertIn("apple-app-site-association is a link", out)

    def test_a_special_file_is_refused(self):
        for step in self.STEPS:
            with self.subTest(step=step):
                repo, dist, environ = self.site(step)
                os.mkfifo(os.path.join(dist, "pipe"))
                code, out, _, _ = self.check(step, repo, environ)
                self.assertEqual(code, 1, out)
                self.assertIn("pipe is neither a file nor a folder", out)

    def test_a_missing_or_linked_site_a_missing_association_file_or_a_worker_is_refused(self):
        for step in self.STEPS:
            with self.subTest(step=step, case="missing"):
                repo, dist, environ = self.site(step)
                shutil.rmtree(dist)
                code, out, _, _ = self.check(step, repo, environ)
                self.assertEqual((code, "isn't a folder" in out), (1, True), out)
            with self.subTest(step=step, case="linked"):
                repo, dist, environ = self.site(step)
                os.rename(dist, dist + "-real")
                os.symlink(dist + "-real", dist)
                code, out, _, _ = self.check(step, repo, environ)
                self.assertEqual((code, "isn't a folder" in out), (1, True), out)
            with self.subTest(step=step, case="no association file"):
                repo, dist, environ = self.site(step)
                os.remove(os.path.join(dist, ".well-known", "apple-app-site-association"))
                code, out, _, _ = self.check(step, repo, environ)
                self.assertEqual((code, "has no /.well-known/apple-app-site-association" in out), (1, True), out)
            for make in (lambda p: open(p, "w").close(), os.makedirs):
                with self.subTest(step=step, make=make):
                    repo, dist, environ = self.site(step)
                    make(os.path.join(dist, "_worker.js"))
                    code, out, _, _ = self.check(step, repo, environ)
                    self.assertEqual((code, "_worker.js" in out), (1, True), out)


BRANCH_PATH = "/repos/beurni2/tadayo/branches/main"


def head(sha=SHA):
    return answer(200, {"name": "main", "commit": {"sha": sha, "url": "https://api.github.com/x"}, "protected": True})


class CheckHeadTest(unittest.TestCase):
    """Since the Pages steps run in a job of their own, re-running it doesn't run deploy-branch's
    check of main's head again; check-head does it, so an older commit's re-run publishes nothing
    (PR #52's review, round 2)."""

    environ = {"GITHUB_TOKEN": "gh-token", "GITHUB_SHA": SHA}

    def test_it_passes_while_this_commit_is_main_s_head(self):
        code, out, http, sleeps = call("check_head", self.environ, sequence(head()))
        self.assertEqual(code, 0, out)
        [request] = http.requests
        self.assertEqual((request["method"], request["host"], request["path"]), ("GET", "api.github.com", BRANCH_PATH))
        self.assertEqual(request["headers"]["authorization"], "Bearer gh-token")
        self.assertEqual(sleeps.calls, [])
        self.assertNotIn("gh-token", out)

    def test_another_head_fails_at_once_and_says_to_run_the_head_s_job_again(self):
        code, out, http, sleeps = call("check_head", self.environ, sequence(head(OTHER_SHA)))
        self.assertEqual(code, 1, out)
        self.assertEqual((len(http.requests), sleeps.calls), (1, []))
        self.assertIn(f"main is at {OTHER_SHA[:12]} now, not {SHA[:12]}", out)
        self.assertIn("run it again", out)

    def test_a_server_error_or_a_lost_connection_is_asked_again_and_a_refusal_is_not(self):
        code, out, http, sleeps = call("check_head", self.environ, sequence(OSError("reset"), answer(502), head()))
        self.assertEqual(code, 0, out)
        self.assertEqual(sleeps.calls, [10, 10])
        code, out, http, sleeps = call("check_head", self.environ, sequence(*[answer(503)] * 6))
        self.assertEqual(code, 1, out)
        self.assertEqual(sleeps.calls, [10] * 5)
        for status in (401, 403, 404):
            with self.subTest(status=status):
                code, out, http, sleeps = call("check_head", self.environ, sequence(answer(status)))
                self.assertEqual(code, 1, out)
                self.assertEqual((len(http.requests), sleeps.calls), (1, []))
                self.assertIn(f"HTTP {status}", out)

    def test_an_answer_that_names_no_commit_fails(self):
        for body in ({}, {"commit": None}, {"commit": {"sha": "abc"}}, {"commit": {"sha": SHA.upper()}}, b"<html>", []):
            with self.subTest(body=body):
                code, out, _, _ = call("check_head", self.environ, sequence(answer(200, body)))
                self.assertEqual(code, 1, out)
                self.assertIn("names no commit", out)

    def test_a_missing_token_or_commit_fails_before_any_request(self):
        for environ in ({"GITHUB_SHA": SHA}, {"GITHUB_TOKEN": "gh-token"}, {"GITHUB_TOKEN": "gh-token", "GITHUB_SHA": "main"}):
            with self.subTest(environ=environ):
                code, out, http, _ = call("check_head", environ)
                self.assertEqual(code, 1, out)
                self.assertEqual(http.requests, [])


def served(body=ASSOCIATION_BYTES, content_type="application/json", status=200):
    return answer(status, body, {"content-type": content_type} if content_type else {})


class CheckAssociationTest(unittest.TestCase):
    def respond(self, projects, files):
        """Cloudflare's answers in turn for the project; the hosts' answers in turn for the file."""
        projects, files = list(projects), {host: list(given) for host, given in files.items()}

        def respond(method, host, path, body):
            if host == "api.cloudflare.com":
                self.assertEqual((method, path), ("GET", PROJECT_PATH))
                return projects.pop(0) if len(projects) > 1 else projects[0]
            self.assertEqual((method, path), ("GET", "/.well-known/apple-app-site-association"))
            given = files[host]
            return given.pop(0) if len(given) > 1 else given[0]
        return respond

    @staticmethod
    def both_served():
        """Cloudflare and both addresses answering as they should, for a test that needs a pass."""
        def respond(method, host, path, body):
            return found(project(deployment=deployment())) if host == "api.cloudflare.com" else served()
        return respond

    def setUp(self):
        self.repo = Repository(self)

    def check(self, projects, files, environ=None):
        return call("check_association", {**CLOUDFLARE, "RUNNER_TEMP": self.repo.temp, **(environ or {})},
                    self.respond(projects, files), root=self.repo.root)

    def test_this_commit_s_deployment_served_as_built_on_both_addresses_passes(self):
        code, out, http, sleeps = self.check([found(project(deployment=deployment()))],
                                             {"tadayo-x1y.pages.dev": [served()], "abc123.tadayo-x1y.pages.dev": [served()]})
        self.assertEqual(code, 0, out)
        self.assertEqual([r["host"] for r in http.requests],
                         ["api.cloudflare.com", "tadayo-x1y.pages.dev", "abc123.tadayo-x1y.pages.dev"])
        self.assertEqual(sleeps.calls, [])
        self.assertNotIn(TOKEN, out)
        self.assertNotIn(ACCOUNT, out)

    def test_it_waits_for_this_commit_s_deployment_and_its_success(self):
        code, out, http, sleeps = self.check(
            [found(project(deployment=None)), found(project(deployment=deployment(sha=OTHER_SHA))),
             found(project(deployment=deployment(status="active"))), found(project(deployment=deployment()))],
            {"tadayo-x1y.pages.dev": [served()], "abc123.tadayo-x1y.pages.dev": [served()]})
        self.assertEqual(code, 0, out)
        self.assertEqual(sleeps.calls, [15, 15, 15])

    def test_it_waits_through_the_stages_before_deploy_even_skipped_ones(self):
        code, out, _, sleeps = self.check(
            [found(project(deployment=deployment(stage="queued", status="active"))),
             found(project(deployment=deployment(stage="initialize", status="success"))),
             found(project(deployment=deployment(stage="build", status="skipped"))),
             found(project(deployment=deployment(status="idle"))),
             found(project(deployment=deployment()))],
            {"tadayo-x1y.pages.dev": [served()], "abc123.tadayo-x1y.pages.dev": [served()]})
        self.assertEqual(code, 0, out)
        self.assertEqual(sleeps.calls, [15, 15, 15, 15])

    def test_a_failed_deployment_fails_at_once(self):
        for stage, status in (("deploy", "failure"), ("deploy", "canceled"), ("build", "failure"),
                              ("initialize", "canceled"), ("deploy", "skipped")):
            with self.subTest(stage=stage, status=status):
                code, out, _, sleeps = self.check(
                    [found(project(deployment=deployment(stage=stage, status=status)))], {})
                self.assertEqual(code, 1, out)
                self.assertEqual(sleeps.calls, [])
                self.assertIn(f"ended {status} at its {stage} stage", out)

    def test_a_lost_connection_or_a_server_error_while_waiting_is_asked_again(self):
        code, out, http, sleeps = self.check(
            [found(project(deployment=deployment(stage="queued", status="active"))), OSError("reset"),
             answer(502, b"<html>"), answer(503, {"success": False, "errors": [{"code": 10000, "message": "x"}]}),
             found(project(deployment=deployment()))],
            {"tadayo-x1y.pages.dev": [served()], "abc123.tadayo-x1y.pages.dev": [served()]})
        self.assertEqual(code, 0, out)
        self.assertEqual(sleeps.calls, [15, 15, 15, 15])
        code, out, http, sleeps = self.check([answer(500, b"")], {})
        self.assertEqual(code, 1, out)
        self.assertEqual(sleeps.calls, [15] * 19)
        self.assertIn("HTTP 500", out)

    def test_after_a_lost_connection_it_reports_what_cloudflare_answered_last(self):
        code, out, _, sleeps = self.check([OSError("reset"), found(project(deployment=None))], {})
        self.assertEqual(code, 1, out)
        self.assertEqual(sleeps.calls, [15] * 19)
        self.assertIn("after 20 looks, 15 seconds apart: no production deployment", out)
        self.assertNotIn("reset", out)

    def test_a_refusal_while_waiting_fails_at_once(self):
        for given in (answer(403, {"success": False, "errors": [{"code": 10000, "message": "Authentication error"}]}),
                      answer(429, b""), NOT_FOUND):
            with self.subTest(given=given.status):
                code, out, http, sleeps = self.check([found(project(deployment=deployment(sha=OTHER_SHA))), given], {})
                self.assertEqual(code, 1, out)
                self.assertEqual(sleeps.calls, [15])
                self.assertEqual(len(http.requests), 2)

    def test_a_preview_deployment_of_this_commit_is_not_the_production_one(self):
        code, out, http, sleeps = self.check(
            [found(project(deployment=deployment(environment="preview")))], {})
        self.assertEqual(code, 1, out)
        self.assertEqual(len(sleeps.calls), 19)
        self.assertEqual({r["host"] for r in http.requests}, {"api.cloudflare.com"})

    def test_another_commit_s_deployment_fails_after_the_last_look(self):
        code, out, http, sleeps = self.check([found(project(deployment=deployment(sha=OTHER_SHA)))], {})
        self.assertEqual(code, 1, out)
        self.assertEqual(len(http.requests), 20)
        self.assertEqual(sleeps.calls, [15] * 19)
        self.assertIn(f"the production deployment is of {OTHER_SHA[:12]}", out)

    def test_a_new_name_is_given_time_to_answer(self):
        code, out, _, sleeps = self.check([found(project(deployment=deployment()))], {
            "tadayo-x1y.pages.dev": [OSError("name not found"), served(status=404), served()],
            "abc123.tadayo-x1y.pages.dev": [served()]})
        self.assertEqual(code, 0, out)
        self.assertEqual(sleeps.calls, [15, 15])

    def test_the_file_served_otherwise_fails(self):
        cases = {
            "as octet-stream": served(content_type="application/octet-stream"),
            "with a charset": served(content_type="application/json; charset=utf-8"),
            "with no type": served(content_type=None),
            "other bytes": served(body=b'{"applinks": {"details": [1]}}'),
            "a redirect": answer(301, b"", {"location": "https://tadayo-x1y.pages.dev/x"}),
        }
        for name, given in cases.items():
            with self.subTest(case=name):
                code, out, _, sleeps = self.check([found(project(deployment=deployment()))],
                                                  {"tadayo-x1y.pages.dev": [given]})
                self.assertEqual(code, 1, out)
                self.assertEqual(sleeps.calls, [])
        code, out, _, sleeps = self.check([found(project(deployment=deployment()))],
                                          {"tadayo-x1y.pages.dev": [served(status=404)]})
        self.assertEqual(code, 1, out)
        self.assertEqual(len(sleeps.calls), 19)

    def test_the_deployment_s_own_address_is_checked_too(self):
        code, out, _, _ = self.check([found(project(deployment=deployment()))], {
            "tadayo-x1y.pages.dev": [served()], "abc123.tadayo-x1y.pages.dev": [served(content_type="text/plain")]})
        self.assertEqual(code, 1, out)
        self.assertIn("abc123.tadayo-x1y.pages.dev", out)

    def test_a_deployment_address_that_isn_t_an_https_host_fails(self):
        for url in ("http://abc.pages.dev", "https://abc.pages.dev/path", "https://user@abc.pages.dev", None):
            with self.subTest(url=url):
                code, out, _, _ = self.check([found(project(deployment=deployment(url=url)))],
                                             {"tadayo-x1y.pages.dev": [served()]})
                self.assertEqual(code, 1, out)

    def test_a_missing_project_or_site_fails(self):
        code, out, _, _ = self.check([NOT_FOUND], {})
        self.assertEqual(code, 1, out)
        os.remove(self.repo.site(".well-known", "apple-app-site-association"))
        code, out, http, _ = self.check([found(project(deployment=deployment()))], {})
        self.assertEqual(code, 1, out)
        self.assertIn("RUNNER_TEMP/deploy-dev-site/.well-known/apple-app-site-association can't be read", out)
        self.assertEqual(http.requests, [])

    def test_nothing_is_asked_without_the_token_the_account_the_commit_or_runner_temp(self):
        # Each case lacks one thing alone, so only its own check can stop it (round 3).
        cases = (({"CLOUDFLARE_API_TOKEN": ""}, "has no CLOUDFLARE_API_TOKEN"),
                 ({"CLOUDFLARE_API_TOKEN": "pasted-token\n"}, "holds a character a bearer token can't"),
                 ({"CLOUDFLARE_ACCOUNT_ID": ""}, "isn't an account id"),
                 ({"GITHUB_SHA": ""}, "GITHUB_SHA isn't"),
                 ({"RUNNER_TEMP": ""}, "RUNNER_TEMP isn't an absolute path"))
        for environ, said in cases:
            with self.subTest(said=said):
                code, out, http, _ = self.check([found(project(deployment=deployment()))], {}, environ)
                self.assertEqual(code, 1, out)
                self.assertEqual(http.requests, [])
                self.assertIn(said, out)


class RecordingConnection:
    """Stands in for http.client.HTTPSConnection, recording how Http uses it."""
    made = []

    def __init__(self, host, timeout=None, **rest):
        self.host, self.timeout, self.rest = host, timeout, rest
        self.sent, self.closed = [], False
        RecordingConnection.made.append(self)

    def request(self, method, path, body=None, headers=None):
        self.sent.append((method, path, body, dict(headers or {})))
        if self.host == "lost.example":
            raise OSError("reset")

    def getresponse(self):
        return RecordingResponse()

    def close(self):
        self.closed = True


class RecordingResponse:
    status = 301

    def getheaders(self):
        return [("Content-Type", "a"), ("Location", "https://elsewhere.example/"), ("content-type", "b")]

    def read(self):
        return b"moved"


class HttpTest(unittest.TestCase):
    """The real Http, which carries the GitHub and Cloudflare tokens, over a recording connection."""

    def setUp(self):
        RecordingConnection.made = []
        self.real = steps_module.http.client.HTTPSConnection
        steps_module.http.client.HTTPSConnection = RecordingConnection
        self.addCleanup(setattr, steps_module.http.client, "HTTPSConnection", self.real)

    def test_it_asks_once_over_https_with_a_timeout_and_closes(self):
        got = steps_module.Http().request("POST", "api.example", "/x?y=1", {"authorization": "Bearer t"}, b"{}")
        [made] = RecordingConnection.made
        self.assertEqual((made.host, made.timeout, made.rest), ("api.example", 30, {}))
        self.assertEqual(made.sent, [("POST", "/x?y=1", b"{}", {"authorization": "Bearer t"})])
        self.assertTrue(made.closed)
        # A redirect is an answer like any other: nothing follows it.
        self.assertEqual((got.status, got.body), (301, b"moved"))

    def test_it_keeps_every_value_of_a_header_under_its_lower_case_name(self):
        got = steps_module.Http().request("GET", "api.example", "/", {})
        self.assertEqual(got.headers, {"content-type": ["a", "b"], "location": ["https://elsewhere.example/"]})
        self.assertIsNone(got.header("content-type"))

    def test_a_lost_connection_still_closes_it(self):
        with self.assertRaises(OSError):
            steps_module.Http().request("GET", "lost.example", "/", {})
        [made] = RecordingConnection.made
        self.assertTrue(made.closed)

    def test_a_header_value_http_refuses_is_an_error_that_never_quotes_it(self):
        # The real connection: http.client checks each header as it is put, before it connects,
        # and its ValueError quotes the value whole (round 3).
        steps_module.http.client.HTTPSConnection = self.real
        for value in ("Bearer pasted-token\n", "Bearer pasted-token\r\nx-other: 1"):
            with self.subTest(value=value):
                with self.assertRaises(OSError) as raised:
                    steps_module.Http().request("GET", "unused.invalid", "/", {"authorization": value})
                self.assertNotIn("pasted-token", str(raised.exception))
                self.assertTrue(raised.exception.__suppress_context__)
                self.assertIsNone(raised.exception.__cause__)

    def test_any_other_error_goes_on_as_it_came(self):
        # A certificate's error is an OSError and a ValueError at once; it, and a ValueError that
        # isn't http.client's refusal of a header, keep their own words (round 4).
        for error in (ssl.SSLCertVerificationError("certificate verify failed: Hostname mismatch"),
                      UnicodeError("label too long")):
            with self.subTest(error=error):
                def refuse(connection, method, path, body=None, headers=None, error=error):
                    raise error
                with unittest.mock.patch.object(RecordingConnection, "request", refuse):
                    with self.assertRaises(type(error)) as raised:
                        steps_module.Http().request("GET", "api.example", "/", {"authorization": "Bearer t"})
                self.assertIs(raised.exception, error)
                [made] = RecordingConnection.made
                self.assertTrue(made.closed)
                RecordingConnection.made = []


def workflow():
    with open(os.path.join(ROOT, ".github", "workflows", "deploy-dev.yml"), encoding="utf-8") as f:
        return f.read()


def ops_step(name, script, branch=None):
    """deploy-dev's step for an ops script: ops.yml's own command, with the script's variables
    from the secrets ops_steps.SECRETS names, and the job's token for GITHUB_TOKEN."""
    env = {"OPS_SCRIPT": script}
    if branch:
        env["OPS_BRANCH"] = branch
    for variable in ops_steps.SCRIPTS[script].variables:
        env[variable] = ("${{ github.token }}" if variable == ops_steps.JOB_TOKEN
                         else "${{ secrets.%s }}" % ops_steps.SECRETS[variable])
    return {"name": name, "env": env, "run": "python3 tools/ci/ops_steps.py run"}


CLOUDFLARE_ENV = {"CLOUDFLARE_API_TOKEN": "${{ secrets.CLOUDFLARE_API_TOKEN }}",
                  "CLOUDFLARE_ACCOUNT_ID": "${{ vars.CLOUDFLARE_ACCOUNT_ID }}"}


def all_pins():
    """ci.yml's pins, and ios.yml's for the two artifact actions, which ci.yml doesn't use."""
    pinned = pins()
    with open(os.path.join(ROOT, ".github", "workflows", "ios.yml"), encoding="utf-8") as f:
        found = dict(re.findall(r"uses: ([a-z-]+/[a-z-]+)@([0-9a-f]{40})", f.read()))
    for name in ("actions/upload-artifact", "actions/download-artifact"):
        pinned[name] = f"{name}@{found[name]}"
    return pinned


def expected_jobs():
    pinned = all_pins()
    checkout = {"uses": pinned["actions/checkout"], "with": {"persist-credentials": "false"}}
    node = {"uses": pinned["actions/setup-node"], "with": {"node-version-file": ".nvmrc", "package-manager-cache": "false"}}
    return {
        "ci": {"name": "wait for ci", "runs-on": "ubuntu-24.04", "timeout-minutes": "45",
               "permissions": {"contents": "read", "actions": "read"},
               "concurrency": {"group": "deploy-dev-ci-${{ github.sha }}", "cancel-in-progress": "false"},
               "steps": [checkout, {"name": "wait-ci", "env": {"GITHUB_TOKEN": "${{ github.token }}"},
                                    "run": "python3 tools/ci/deploy_dev_steps.py wait-ci"}]},
        "deploy": {"name": "deploy", "needs": "ci", "runs-on": "ubuntu-24.04", "timeout-minutes": "80",
                   "permissions": {"contents": "read", "actions": "read"},
                   "concurrency": {"group": "ops-dev", "cancel-in-progress": "false"},
                   "steps": [
                       checkout,
                       {"uses": pinned["actions/setup-node"],
                        "with": {"node-version-file": ".nvmrc", "package-manager-cache": "false"}},
                       {"run": "python3 tools/ci/ci_steps.py setup-pnpm"},
                       {"run": "python3 tools/ci/ci_steps.py install"},
                       {"name": "setup-flyctl", "env": {"OPS_SCRIPT": "deploy-branch"},
                        "run": "python3 tools/ci/ops_steps.py setup-flyctl"},
                       ops_step("migrate", "migrate"),
                       ops_step("deploy-branch", "deploy-branch", branch="main"),
                       ops_step("storage-setup", "storage-setup"),
                       ops_step("supabase-probe", "supabase-probe"),
                       {"run": "python3 tools/ci/deploy_dev_steps.py check-api"},
                   ]},
        "web": {"name": "web", "needs": "ci", "runs-on": "ubuntu-24.04", "timeout-minutes": "20",
                "permissions": {"contents": "read"},
                "concurrency": {"group": "deploy-dev-web-${{ github.sha }}", "cancel-in-progress": "false"},
                "steps": [
                    checkout, node,
                    {"run": "python3 tools/ci/ci_steps.py setup-pnpm"},
                    {"run": "python3 tools/ci/ci_steps.py install"},
                    {"run": "python3 tools/ci/ci_steps.py web"},
                    {"run": "python3 tools/ci/deploy_dev_steps.py check-build"},
                    {"uses": pinned["actions/upload-artifact"],
                     "with": {"name": "site", "path": "apps/web/dist/", "if-no-files-found": "error",
                              "include-hidden-files": "true", "retention-days": "1"}},
                ]},
        "pages": {"name": "pages", "needs": ["deploy", "web"], "runs-on": "ubuntu-24.04", "timeout-minutes": "30",
                  "permissions": {"contents": "read"},
                  "concurrency": {"group": "deploy-dev-pages", "cancel-in-progress": "false"},
                  "steps": [
                       checkout,
                       {"name": "check-head", "env": {"GITHUB_TOKEN": "${{ github.token }}"},
                        "run": "python3 tools/ci/deploy_dev_steps.py check-head"},
                       node,
                       {"uses": pinned["actions/download-artifact"],
                        "with": {"name": "site", "path": "${{ runner.temp }}/deploy-dev-site"}},
                       {"run": "python3 tools/ci/deploy_dev_steps.py check-site"},
                       {"run": "python3 tools/ci/deploy_dev_steps.py setup-wrangler"},
                       {"name": "pages-project", "env": CLOUDFLARE_ENV,
                        "run": "python3 tools/ci/deploy_dev_steps.py pages-project"},
                       {"name": "pages-deploy", "env": CLOUDFLARE_ENV,
                        "run": "python3 tools/ci/deploy_dev_steps.py pages-deploy"},
                       {"name": "check-association", "env": CLOUDFLARE_ENV,
                        "run": "python3 tools/ci/deploy_dev_steps.py check-association"},
                   ]},
    }


class WorkflowFileTest(unittest.TestCase):
    """deploy-dev.yml, read whole: every key and value is the one built here, so each secret is
    named only in the steps that use it (docs/TECH-DESIGN.md section 9)."""

    def setUp(self):
        self.text = workflow()
        self.document = parse_yaml(self.text)

    def test_it_reads_as_a_yaml_library_would(self):
        try:
            import yaml
        except ImportError:
            if os.environ.get("GITHUB_ACTIONS") == "true":
                self.fail("no yaml library on ci's runner (ops_steps_test.py says why it must be there)")
            self.skipTest("no yaml library here")
        theirs = yaml.safe_load(self.text)
        theirs["on"] = theirs.pop(True)  # YAML 1.1 reads the key `on` as true

        def text(value):
            if isinstance(value, dict):
                return {k: text(v) for k, v in value.items()}
            if isinstance(value, list):
                return [text(v) for v in value]
            return str(value).lower() if isinstance(value, bool) else str(value)
        self.assertEqual(text(theirs), self.document)

    def test_the_file_holds_these_keys_and_no_other(self):
        self.assertEqual(list(self.document), ["name", "on", "permissions", "defaults", "jobs"])
        self.assertEqual(self.document["name"], "deploy-dev")
        self.assertEqual(self.document["permissions"], {})
        self.assertEqual(self.document["defaults"], {"run": {"shell": "bash"}})

    def test_it_runs_only_on_a_push_to_main(self):
        self.assertEqual(self.document["on"], {"push": {"branches": ["main"]}})

    def test_its_jobs_and_steps_are_these_exactly(self):
        expected = expected_jobs()
        self.assertEqual(list(self.document["jobs"]), list(expected))
        for name in expected:
            with self.subTest(job=name):
                self.assertEqual(self.document["jobs"][name], expected[name])

    def test_only_the_deploy_job_holds_ops_dev_and_it_is_never_cancelled(self):
        self.assertNotIn("concurrency", self.document)
        self.assertEqual(self.document["jobs"]["ci"]["concurrency"],
                         {"group": "deploy-dev-ci-${{ github.sha }}", "cancel-in-progress": "false"})
        self.assertEqual(self.document["jobs"]["deploy"]["concurrency"], {"group": "ops-dev", "cancel-in-progress": "false"})
        self.assertEqual(self.document["jobs"]["web"]["concurrency"],
                         {"group": "deploy-dev-web-${{ github.sha }}", "cancel-in-progress": "false"})
        self.assertEqual(self.document["jobs"]["pages"]["concurrency"],
                         {"group": "deploy-dev-pages", "cancel-in-progress": "false"})
        with open(os.path.join(ROOT, ".github", "workflows", "ops.yml"), encoding="utf-8") as f:
            self.assertEqual(parse_yaml(f.read())["concurrency"], {"group": "ops-dev", "cancel-in-progress": "false"})

    def test_every_expression_in_the_file_is_one_this_test_knows(self):
        found = sorted(re.findall(r"\$\{\{.*?\}\}", self.text))
        self.assertEqual(self.text.count("${{"), len(found))
        wanted = ["${{ github.sha }}"] * 2  # the wait's group and the build's
        wanted += ["${{ runner.temp }}"]  # where the pages job downloads the site
        wanted += ["${{ github.token }}"] * 3  # wait-ci's, deploy-branch's and check-head's
        wanted += ["${{ secrets.DEV_DATABASE_URL }}", "${{ secrets.FLY_API_TOKEN }}", "${{ secrets.FLY_API_TOKEN }}",
                   "${{ secrets.FLY_API_TOKEN }}", "${{ secrets.SUPABASE_ACCESS_TOKEN }}"]
        wanted += ["${{ secrets.SUPABASE_DEV_PROJECT_REF }}"] * 3
        wanted += ["${{ secrets.CLOUDFLARE_API_TOKEN }}", "${{ vars.CLOUDFLARE_ACCOUNT_ID }}"] * 3
        self.assertEqual(found, sorted(wanted))

    def test_the_secrets_are_the_b0_plan_s(self):
        # docs/plans/B0.md's deploy-dev row: FLY_API_TOKEN, GITHUB_TOKEN, DEV_DATABASE_URL,
        # SUPABASE_DEV_PROJECT_REF, SUPABASE_ACCESS_TOKEN, CLOUDFLARE_API_TOKEN, and the variable
        # CLOUDFLARE_ACCOUNT_ID.
        self.assertEqual(set(re.findall(r"secrets\.([A-Z_]+)", self.text)),
                         {"FLY_API_TOKEN", "DEV_DATABASE_URL", "SUPABASE_DEV_PROJECT_REF", "SUPABASE_ACCESS_TOKEN",
                          "CLOUDFLARE_API_TOKEN"})
        self.assertEqual(set(re.findall(r"vars\.([A-Z_]+)", self.text)), {"CLOUDFLARE_ACCOUNT_ID"})

    def test_the_cloudflare_secret_is_on_a_runner_that_holds_no_other(self):
        # flyctl and Fly's token, the database's and Supabase's secrets are all on the deploy job's
        # runner, so wrangler and its packages run in a job of their own (PR #52's review, security-1); and
        # that job runs no file of the checkout but deploy_dev_steps.py, so the site is built in a
        # job that holds no secret (round 2) and downloaded outside the checkout (round 3).
        jobs = self.document["jobs"]

        def named(job):
            return {v for step in jobs[job]["steps"] for v in step.get("env", {}).values() if "${{" in v}
        self.assertEqual(named("pages"), {"${{ secrets.CLOUDFLARE_API_TOKEN }}", "${{ vars.CLOUDFLARE_ACCOUNT_ID }}",
                                          "${{ github.token }}"})
        self.assertEqual([s["name"] for s in jobs["pages"]["steps"] if "${{ github.token }}" in s.get("env", {}).values()],
                         ["check-head"])
        self.assertEqual(named("web"), set())
        self.assertEqual(jobs["pages"]["needs"], ["deploy", "web"])
        self.assertEqual(jobs["pages"]["permissions"], {"contents": "read"})
        self.assertEqual(jobs["web"]["permissions"], {"contents": "read"})
        self.assertNotIn("${{ secrets.CLOUDFLARE_API_TOKEN }}", named("deploy") | named("ci") | named("web"))
        pinned = all_pins()
        for step in jobs["pages"]["steps"]:
            with self.subTest(step=step):
                if "uses" in step:
                    self.assertIn(step["uses"], [pinned[a] for a in ("actions/checkout", "actions/setup-node",
                                                                    "actions/download-artifact")])
                else:
                    self.assertTrue(step["run"].startswith("python3 tools/ci/deploy_dev_steps.py "), step)
        self.assertEqual([s.get("run") for s in jobs["deploy"]["steps"]][-1],
                         "python3 tools/ci/deploy_dev_steps.py check-api")

    def test_the_pages_job_downloads_the_site_under_runner_temp_where_its_steps_read_it(self):
        # A path in the checkout could already be a link the repository holds, which the download
        # would write through (PR #52's review, round 3).
        steps = self.document["jobs"]["pages"]["steps"]
        [download] = [s for s in steps if s.get("uses", "").startswith("actions/download-artifact@")]
        self.assertEqual(download["with"]["path"], "${{ runner.temp }}/" + steps_module.DOWNLOAD)
        self.assertEqual(steps[steps.index(download) + 1], {"run": "python3 tools/ci/deploy_dev_steps.py check-site"})
        self.assertNotIn("dist", json.dumps(steps))

    def test_the_pins_are_ci_yml_s_and_ios_yml_s(self):
        pinned = all_pins()
        uses = re.findall(r"uses: (\S+)", self.text)
        self.assertEqual(len(uses), 9)
        self.assertTrue(set(uses) <= set(pinned.values()))


class UsageTest(unittest.TestCase):
    def test_unknown_step(self):
        for argv in (["deploy_dev_steps.py"], ["deploy_dev_steps.py", "deploy"], ["deploy_dev_steps.py", "wait-ci", "x"]):
            with self.subTest(argv=argv):
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    self.assertEqual(steps_module.main(argv), 2)
                self.assertIn("steps: wait-ci, check-api, check-build, check-head, check-site, setup-wrangler, "
                              "pages-project, pages-deploy, check-association", out.getvalue())


if __name__ == "__main__":
    unittest.main()
