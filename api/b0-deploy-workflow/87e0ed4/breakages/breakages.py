#!/usr/bin/env python3
"""Slice 10c's deliberate breakages: each changes deploy_dev_steps.py or deploy-dev.yml in a
scratch copy of tools/ci, tools/ops/src/environment.ts, services/api/src/session.test.ts and
.github, runs deploy_dev_steps_test.py, and is caught only when the run fails and its output
names the registered test (a name prefix).
usage: breakages.py <repository root> <out dir> [only these names...]
NO_YAML=1 runs the tests with -S, where no YAML library is found."""
import os, shutil, subprocess, sys, tempfile

root, out = sys.argv[1], sys.argv[2]
P, W = "tools/ci/deploy_dev_steps.py", ".github/workflows/deploy-dev.yml"
B = [
 # wait-ci
 ("ci-sha-not-in-query", P, "?head_sha={sha}&branch={BRANCH}&event=push&per_page=100", "?branch={BRANCH}&event=push&per_page=100", "test_it_asks_github_for_this_commit_s_push_runs"),
 ("ci-token-dropped", P, 'f"?head_sha={sha}&branch={BRANCH}&event=push&per_page=100")\n        headers = {"accept": "application/vnd.github+json", "authorization": f"Bearer {token}",\n', 'f"?head_sha={sha}&branch={BRANCH}&event=push&per_page=100")\n        headers = {"accept": "application/vnd.github+json",\n', "test_it_asks_github_for_this_commit_s_push_runs"),
 ("ci-other-sha-counted", P, 'r.get("head_sha") == sha\n', 'True\n', "test_runs_of_another_commit_branch_or_event"),
 ("ci-other-branch-counted", P, 'and r.get("head_branch") == BRANCH and ', 'and ', "test_runs_of_another_commit_branch_or_event"),
 ("ci-other-event-counted", P, ' and r.get("event") == "push"\n', '\n', "test_runs_of_another_commit_branch_or_event"),
 ("ci-failure-ignored-if-one-passed", P, '            if run.get("status") == "completed" and run.get("conclusion") not in OK_CONCLUSIONS:\n', '            if False:\n', "test_a_failed_run_fails_at_once"),
 ("ci-timed-out-ok", P, 'OK_CONCLUSIONS = {"success", "cancelled", "skipped"}', 'OK_CONCLUSIONS = {"success", "cancelled", "skipped", "timed_out"}', "test_a_failed_run_fails_at_once"),
 ("ci-running-not-waited", P, '        if waiting:\n            print', '        if False:\n            print', "test_it_waits_while_there_is_no_run_or_one_is_still_running"),
 ("ci-no-run-passes", P, '            print(f"deploy-dev: wait-ci: no ci run for {sha[:12]} on {BRANCH} yet")\n            return None', '            print(f"deploy-dev: wait-ci: no ci run for {sha[:12]} on {BRANCH} yet")\n            return 0', "test_it_waits_while_there_is_no_run_or_one_is_still_running"),
 ("ci-all-cancelled-passes", P, "        if not passed:\n", "        if False:\n", "test_only_cancelled_or_skipped_runs_fail"),
 ("ci-gives-up-passing", P, '              f"{CI_POLL_SECONDS} seconds apart; nothing was deployed")\n        return 1', '              f"{CI_POLL_SECONDS} seconds apart; nothing was deployed")\n        return 0', "test_it_gives_up_after_its_last_look"),
 ("ci-4xx-retried", P, "                    if answer.status < 500:\n                        return 1\n", "", "test_a_server_error_or_a_lost_connection_is_asked_again_and_a_refusal_is_not"),
 ("ci-5xx-fails", P, "                    if answer.status < 500:\n", "                    if answer.status < 600:\n", "test_a_server_error_or_a_lost_connection_is_asked_again_and_a_refusal_is_not"),
 ("ci-bool-id-counted", P, ' and not isinstance(r.get("id"), bool)]', ']', "test_runs_of_another_commit_branch_or_event"),
 ("ci-no-list-waits", P, '            print("deploy-dev: wait-ci: GitHub\'s answer has no list of runs")\n            return 1', '            print("deploy-dev: wait-ci: GitHub\'s answer has no list of runs")\n            return None', "test_an_answer_without_a_list_of_runs_fails"),
 ("ci-sha-not-checked", P, "        if not SHA.fullmatch(sha):\n", "        if not sha:\n", "test_a_missing_token_or_commit_fails_before_any_request"),
 # check-api
 ("api-200-passes", P, '    "status": 401,', '    "status": 200,', "test_the_neutral_401_passes"),
 ("api-body-not-checked", P, '        if answer.body != EXPECTED_API["body"]:\n', '        if False:\n', "test_any_other_answer_fails_at_once"),
 ("api-cache-not-checked", P, 'for name in ("content-type", "cache-control"):', 'for name in ("content-type",):', "test_any_other_answer_fails_at_once"),
 ("api-header-any-of-many", P, '        return values[0] if len(values) == 1 else None', '        return values[0] if values else None', "test_any_other_answer_fails_at_once"),
 ("api-500-retried", P, "if answer.status not in (502, 503, 504):", "if answer.status not in (500, 502, 503, 504):", "test_any_other_answer_fails_at_once"),
 ("api-502-fails", P, "if answer.status not in (502, 503, 504):", "if answer.status not in (503, 504):", "test_fly_s_proxy_errors"),
 ("api-tries-shortened", P, "API_TRIES, API_RETRY_SECONDS = 6, 10", "API_TRIES, API_RETRY_SECONDS = 2, 10", "test_it_fails_after_its_last_try"),
 ("api-host-other", P, 'DEV_HOST = "api-dev.tadayo.app"', 'DEV_HOST = "tadayo-api-dev.fly.dev"', "test_the_host_is_ops_dev_host"),
 ("api-charset-dropped", P, '"content-type": "application/json; charset=utf-8",', '"content-type": "application/json",', "test_the_expected_answer_is_the_api_s_pinned_one"),
 # setup-wrangler
 ("npm-scripts-run", P, 'cmd = ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--workspaces=false"]', 'cmd = ["npm", "ci", "--no-audit", "--no-fund", "--workspaces=false"]', "test_it_runs_npm_ci_without_install_scripts"),
 ("npm-install-not-ci", P, 'cmd = ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--workspaces=false"]', 'cmd = ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", "--workspaces=false"]', "test_it_runs_npm_ci_without_install_scripts"),
 ("lock-integrity-unchecked", P, '            if not isinstance(integrity, str) or not integrity.startswith("sha512-"):\n', '            if not isinstance(integrity, str):\n', "test_it_refuses_a_lockfile_it_can_t_trust"),
 ("lock-resolved-unchecked", P, '            if not isinstance(resolved, str) or not resolved.startswith(REGISTRY):\n', '            if not isinstance(resolved, str):\n', "test_it_refuses_a_lockfile_it_can_t_trust"),
 ("lock-outside-node-modules", P, '            if not name.startswith("node_modules/") or not isinstance(entry, dict):\n', '            if not isinstance(entry, dict):\n', "test_it_refuses_a_lockfile_it_can_t_trust"),
 ("lock-wrangler-version-unchecked", P, '                or packages["node_modules/wrangler"].get("version") != WRANGLER_VERSION:', '                or False:', "test_it_refuses_a_lockfile_it_can_t_trust"),
 ("lock-root-unchecked", P, ' or packages[""].get("dependencies") != wanted:', ':', "test_it_refuses_a_lockfile_it_can_t_trust"),
 ("lock-version-unchecked", P, ' or lock.get("lockfileVersion") != 3:', ':', "test_it_refuses_a_lockfile_it_can_t_trust"),
 ("manifest-loose", P, '        if manifest != {"private": True, "dependencies": wanted}:\n', '        if manifest.get("dependencies", {}).get("wrangler") is None:\n', "test_it_refuses_another_manifest"),
 ("installed-version-unchecked", P, "        if installed != WRANGLER_VERSION:\n", "        if installed is None:\n", "test_a_failed_install_or_another_version_installed_fails"),
 ("npm-exit-ignored", P, '            print(f"deploy-dev: setup-wrangler: npm ci failed (exit {code})")\n            return 1', '            print(f"deploy-dev: setup-wrangler: npm ci failed (exit {code})")', "test_a_failed_install_or_another_version_installed_fails"),
 ("wrangler-pin-moved", P, 'WRANGLER_VERSION = "4.153.0"', 'WRANGLER_VERSION = "4.161.0"', "test_the_committed_lockfile_passes_its_own_check_and_names_the_pin"),
 # pages-project
 ("project-bare-404-missing", P, ' and document.get("success") is False \\\n                and any(isinstance(e, dict) and e.get("code") == PROJECT_NOT_FOUND\n                        for e in document.get("errors") or []):', ':', "test_cloudflare_s_not_found_code_in_any_4xx"),
 ("project-404-only", P, "        if 400 <= answer.status < 500 and isinstance(document, dict)", "        if answer.status == 404 and isinstance(document, dict)", "test_cloudflare_s_not_found_code_in_any_4xx"),
 ("project-5xx-missing", P, "        if 400 <= answer.status < 500 and isinstance(document, dict)", "        if 400 <= answer.status < 600 and isinstance(document, dict)", "test_cloudflare_s_not_found_code_in_any_4xx"),
 ("project-success-flag-unchecked", P, ' and document.get("success") is False \\\n', ' \\\n', "test_cloudflare_s_not_found_code_in_any_4xx"),
 ("project-branch-other", P, '{"name": PAGES_PROJECT, "production_branch": BRANCH}', '{"name": PAGES_PROJECT, "production_branch": "production"}', "test_it_makes_a_missing_project_for_main"),
 ("project-branch-unchecked", P, "        if branch != BRANCH:\n", "        if False:\n", "test_a_project_on_another_production_branch"),
 ("project-200-failure-taken", P, '        if answer.status == 200 and isinstance(document, dict) and document.get("success") is True \\\n                and isinstance(document.get("result"), dict):\n            return document["result"]', '        if answer.status == 200 and isinstance(document, dict) \\\n                and isinstance(document.get("result"), dict):\n            return document["result"]', "test_any_other_answer_fails_with_cloudflare_s_errors"),
 ("project-account-unchecked", P, "        if not ACCOUNT.fullmatch(account):\n", "        if not account:\n", "test_a_missing_token_or_account_fails_before_any_request"),
 ("project-create-failure-taken", P, '            print(f"deploy-dev: pages-project: made the Pages project {PAGES_PROJECT}")\n            return document["result"]\n        raise', '            print(f"deploy-dev: pages-project: made the Pages project {PAGES_PROJECT}")\n            return document["result"]\n        return {"production_branch": BRANCH}\n        raise', "test_any_other_answer_fails_with_cloudflare_s_errors"),
 ("create-200-failure-taken", P, '        if answer.status == 200 and isinstance(document, dict) and document.get("success") is True \\\n                and isinstance(document.get("result"), dict):\n            print(f"deploy-dev: pages-project: made', '        if answer.status == 200 and isinstance(document, dict) \\\n                and isinstance(document.get("result"), dict):\n            print(f"deploy-dev: pages-project: made', "test_any_other_answer_fails_with_cloudflare_s_errors"),
 ("deploy-no-do-not-track", P, '"CI": "true", "DO_NOT_TRACK": "1",', '"CI": "true",', "test_it_runs_the_pinned_wrangler_with_only_what_it_needs"),
 # pages-deploy
 ("deploy-other-branch", P, 'f"--branch={BRANCH}", ', 'f"--branch=production", ', "test_it_runs_the_pinned_wrangler_with_only_what_it_needs"),
 ("deploy-runner-env", P, '            code = self.run_process(cmd, home, env)', '            code = self.run_process(cmd, home, {**self.environ, **env})', "test_it_runs_the_pinned_wrangler_with_only_what_it_needs"),
 ("deploy-metrics-on", P, '"WRANGLER_SEND_METRICS": "false", ', '', "test_it_runs_the_pinned_wrangler_with_only_what_it_needs"),
 ("deploy-npx-wrangler", P, 'cmd = ["node", wrangler, "pages",', 'cmd = ["npx", "wrangler", "pages",', "test_it_runs_the_pinned_wrangler_with_only_what_it_needs"),
 ("deploy-exit-ignored", P, '            print(f"deploy-dev: pages-deploy: wrangler failed (exit {code})")\n            return 1', '            print(f"deploy-dev: pages-deploy: wrangler failed (exit {code})")', "test_wrangler_s_failure_is_the_step_s"),
 ("deploy-without-build", P, '        if not os.path.isfile(self.path(SITE, ASSOCIATION.lstrip("/"))):\n            return f"{SITE} has no', '        if False:\n            return f"{SITE} has no', "test_nothing_runs_without_the_build"),
 # check-association
 ("assoc-other-commit-ok", P, '                if commit == sha and deployment.get("environment") == "production":', '                if deployment.get("environment") == "production":', "test_another_commit_s_deployment_fails_after_the_last_look"),
 ("assoc-preview-ok", P, '                if commit == sha and deployment.get("environment") == "production":', '                if commit == sha:', "test_a_preview_deployment_of_this_commit"),
 ("assoc-any-stage-success", P, '                    if stage.get("name") == "deploy" and stage.get("status") == "success" \\', '                    if stage.get("status") == "success" \\', "test_it_waits_through_the_stages_before_deploy"),
 ("assoc-skipped-build-fails", P, '                    if stage.get("status") in ("failure", "canceled") or \\\n                            (stage.get("name"), stage.get("status")) == ("deploy", "skipped"):', '                    if stage.get("status") in ("failure", "canceled", "skipped"):', "test_it_waits_through_the_stages_before_deploy"),
 ("assoc-skipped-deploy-waits", P, ' or \\\n                            (stage.get("name"), stage.get("status")) == ("deploy", "skipped"):', ':', "test_a_failed_deployment_fails_at_once"),
 ("assoc-failure-waits", P, 'if stage.get("status") in ("failure", "canceled") or', 'if stage.get("status") in ("canceled",) or', "test_a_failed_deployment_fails_at_once"),
 ("assoc-charset-ok", P, '                    if answer.header("content-type") != "application/json":', '                    if not (answer.header("content-type") or "").startswith("application/json"):', "test_the_file_served_otherwise_fails"),
 ("assoc-body-unchecked", P, "                    if answer.body != built:\n", "                    if False:\n", "test_the_file_served_otherwise_fails"),
 ("assoc-redirect-retried", P, "                if 300 <= answer.status < 400:\n", "                if False:\n", "test_the_file_served_otherwise_fails"),
 ("assoc-deployment-host-skipped", P, '            hosts = [project["subdomain"], host_of(deployment["url"])]', '            hosts = [project["subdomain"]]', "test_the_deployment_s_own_address_is_checked_too"),
 ("assoc-new-name-no-wait", P, '                problem = f"https://{host}{ASSOCIATION} answered HTTP {answer.status}"', '                raise StepFailed(f"https://{host}{ASSOCIATION} answered HTTP {answer.status}")', "test_a_new_name_is_given_time_to_answer"),
 ("assoc-host-loose", P, 'r"https://([a-z0-9.-]+)/?"', 'r"https?://([^/]+)/?.*"', "test_a_deployment_address_that_isn_t_an_https_host_fails"),
 ("assoc-polls-shortened", P, "PAGES_POLLS, PAGES_POLL_SECONDS = 20, 15", "PAGES_POLLS, PAGES_POLL_SECONDS = 5, 15", "test_another_commit_s_deployment_fails_after_the_last_look"),
 # main
 ("main-unknown-step-ok", P, "STEPS = {", "STEPS = {\"x\": lambda s: 0, ", "test_unknown_step"),
 # deploy-dev.yml
 ("wf-pr-trigger", W, "on:\n  push:\n    branches:\n      - main\n", "on:\n  pull_request:\n  push:\n    branches:\n      - main\n", "test_it_runs_only_on_a_push_to_main"),
 ("wf-any-branch", W, "    branches:\n      - main\n", "    branches:\n      - '**'\n", "test_it_runs_only_on_a_push_to_main"),
 ("wf-top-permissions", W, "\npermissions: {}\n", "\npermissions: read-all\n", "test_the_file_holds_these_keys"),
 ("wf-workflow-concurrency", W, "\npermissions: {}\n", "\nconcurrency:\n  group: ops-dev\n  cancel-in-progress: false\n\npermissions: {}\n", "test_the_file_holds_these_keys"),
 ("wf-deploy-cancelled", W, "      group: ops-dev\n      cancel-in-progress: false\n", "      group: ops-dev\n      cancel-in-progress: true\n", "test_only_the_deploy_job_holds_ops_dev"),
 ("wf-ci-holds-ops-dev", W, "      group: deploy-dev-ci-${{ github.sha }}\n", "      group: ops-dev\n", "test_only_the_deploy_job_holds_ops_dev"),
 ("wf-no-needs", W, "    name: deploy\n    needs: ci\n", "    name: deploy\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-ci-gets-fly-token", W, "        env:\n          GITHUB_TOKEN: ${{ github.token }}\n        run: python3 tools/ci/deploy_dev_steps.py wait-ci\n", "        env:\n          GITHUB_TOKEN: ${{ github.token }}\n          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}\n        run: python3 tools/ci/deploy_dev_steps.py wait-ci\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-contents-write", W, "    timeout-minutes: 80\n    permissions:\n      contents: read\n", "    timeout-minutes: 80\n    permissions:\n      contents: write\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-credentials-kept", W, "      group: deploy-dev-pages\n      cancel-in-progress: false\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1\n        with:\n          persist-credentials: false\n", "      group: deploy-dev-pages\n      cancel-in-progress: false\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-unpinned-action", W, "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1  # v7.1.0\n        with:\n          node-version-file: .nvmrc\n          package-manager-cache: false\n      - run: python3 tools/ci/ci_steps.py setup-pnpm\n      - run: python3 tools/ci/ci_steps.py install\n      - run: python3 tools/ci/ci_steps.py web\n", "actions/setup-node@v7\n        with:\n          node-version-file: .nvmrc\n          package-manager-cache: false\n      - run: python3 tools/ci/ci_steps.py setup-pnpm\n      - run: python3 tools/ci/ci_steps.py install\n      - run: python3 tools/ci/ci_steps.py web\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-pages-in-deploy-job", W, "      - run: python3 tools/ci/deploy_dev_steps.py check-api\n\n", "      - run: python3 tools/ci/deploy_dev_steps.py check-api\n      - run: python3 tools/ci/deploy_dev_steps.py setup-wrangler\n\n", "test_the_cloudflare_secret_is_on_a_runner"),
 ("wf-probe-dropped", W, "      - name: supabase-probe\n        env:\n          OPS_SCRIPT: supabase-probe\n          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}\n          SUPABASE_DEV_PROJECT_REF: ${{ secrets.SUPABASE_DEV_PROJECT_REF }}\n          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}\n        run: python3 tools/ci/ops_steps.py run\n", "", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-migrate-admin-url", W, "          DATABASE_URL: ${{ secrets.DEV_DATABASE_URL }}\n", "          DATABASE_URL: ${{ secrets.DEV_DATABASE_ADMIN_URL }}\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-deploy-other-branch", W, "          OPS_BRANCH: main\n", "          OPS_BRANCH: ${{ github.ref_name }}\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-cloudflare-token-on-web", W, "      - run: python3 tools/ci/ci_steps.py web\n", "      - env:\n          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n        run: python3 tools/ci/ci_steps.py web\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-account-as-secret", W, "      - name: pages-deploy\n        env:\n          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n          CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}\n", "      - name: pages-deploy\n        env:\n          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-job-env-secret", W, "    name: deploy\n    needs: ci\n", "    name: deploy\n    needs: ci\n    env:\n      FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-continue-on-error", W, "      - name: check-association\n", "      - name: check-association\n        continue-on-error: true\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-tojson-secrets", W, "          package-manager-cache: false\n      - run: python3 tools/ci/ci_steps.py setup-pnpm\n      - run: python3 tools/ci/ci_steps.py install\n      - name: setup-flyctl\n", "          package-manager-cache: false\n          token: ${{ toJSON(secrets) }}\n      - run: python3 tools/ci/ci_steps.py setup-pnpm\n      - run: python3 tools/ci/ci_steps.py install\n      - name: setup-flyctl\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-folded-hidden-secret", W, "          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}\n          GITHUB_TOKEN: ${{ github.token }}\n", "          FLY_API_TOKEN: >-\n            ${{ secrets.FLY_API_TOKEN }} #${{ secrets.DEV_DATABASE_URL }}\n          GITHUB_TOKEN: ${{ github.token }}\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-other-runner", W, "    name: deploy\n    needs: ci\n    runs-on: ubuntu-24.04\n", "    name: deploy\n    needs: ci\n    runs-on: ubuntu-latest\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-workflow-run-trigger", W, "on:\n  push:\n", "on:\n  workflow_run:\n    workflows: [ci]\n    types: [completed]\n  push:\n", "test_it_runs_only_on_a_push_to_main"),
 # round 1 of PR #52's review
 ("assoc-5xx-fatal", P, "        failed = Transient if answer.status >= 500 else StepFailed\n", "        failed = StepFailed\n", "test_a_lost_connection_or_a_server_error_while_waiting_is_asked_again"),
 ("assoc-oserror-fatal", P, "            raise Transient(f\"couldn't ask Cloudflare for the Pages project", "            raise StepFailed(f\"couldn't ask Cloudflare for the Pages project", "test_a_lost_connection_or_a_server_error_while_waiting_is_asked_again"),
 ("assoc-transient-not-caught", P, "            except Transient as failure:", "            except ZeroDivisionError as failure:", "test_a_lost_connection_or_a_server_error_while_waiting_is_asked_again"),
 ("assoc-4xx-retried", P, "        failed = Transient if answer.status >= 500 else StepFailed\n", "        failed = Transient\n", "test_a_refusal_while_waiting_fails_at_once"),
 ("deploy-cwd-repo", P, "            code = self.run_process(cmd, home, env)", "            code = self.run_process(cmd, self.root, env)", "test_nothing_in_the_repository_reaches_wrangler_s_working_folder_or_home"),
 ("deploy-cwd-pages-dir", P, "            code = self.run_process(cmd, home, env)", "            code = self.run_process(cmd, self.path(PAGES_DIR), env)", "test_nothing_in_the_repository_reaches_wrangler_s_working_folder_or_home"),
 ("deploy-home-runner", P, '"HOME": home,', '"HOME": self.value("HOME"),', "test_nothing_in_the_repository_reaches_wrangler_s_working_folder_or_home"),
 ("deploy-folder-kept", P, '        with tempfile.TemporaryDirectory(prefix="deploy-dev-wrangler-") as home:', '        home = tempfile.mkdtemp(prefix="deploy-dev-wrangler-")\n        if True:', "test_nothing_in_the_repository_reaches_wrangler_s_working_folder_or_home"),
 ("deploy-relative-site", P, 'self.path(SITE), f"--project-name', 'SITE, f"--project-name', "test_it_runs_the_pinned_wrangler_with_only_what_it_needs"),
 ("deploy-relative-wrangler", P, 'cmd = ["node", wrangler, "pages"', 'cmd = ["node", WRANGLER, "pages"', "test_it_runs_the_pinned_wrangler_with_only_what_it_needs"),
 ("deploy-worker-allowed", P, "        if os.path.lexists(self.path(SITE, WORKER)):\n", "        if False:\n", "test_a_worker_in_the_site_is_refused"),
 ("deploy-worker-file-only", P, "os.path.lexists(self.path(SITE, WORKER))", "os.path.isfile(self.path(SITE, WORKER))", "test_a_worker_in_the_site_is_refused"),
 ("http-plain", P, "        connection = http.client.HTTPSConnection(host, timeout=REQUEST_SECONDS)", "        connection = http.client.HTTPConnection(host, timeout=REQUEST_SECONDS)", "test_it_asks_once_over_https_with_a_timeout_and_closes"),
 ("http-no-timeout", P, "HTTPSConnection(host, timeout=REQUEST_SECONDS)", "HTTPSConnection(host)", "test_it_asks_once_over_https_with_a_timeout_and_closes"),
 ("http-header-overwritten", P, "                found.setdefault(name.lower(), []).append(value)", "                found[name.lower()] = [value]", "test_it_keeps_every_value_of_a_header_under_its_lower_case_name"),
 ("http-header-case", P, "found.setdefault(name.lower(), [])", "found.setdefault(name, [])", "test_it_keeps_every_value_of_a_header_under_its_lower_case_name"),
 ("http-not-closed", P, "        finally:\n            connection.close()", "        finally:\n            pass", "test_a_lost_connection_still_closes_it"),
 ("wf-pages-needs-ci", W, "    needs:\n      - deploy\n      - web\n", "    needs: ci\n", "test_the_cloudflare_secret_is_on_a_runner"),
 ("wf-pages-actions-read", W, "    timeout-minutes: 30\n    permissions:\n      contents: read\n", "    timeout-minutes: 30\n    permissions:\n      contents: read\n      actions: read\n", "test_the_cloudflare_secret_is_on_a_runner"),
 ("wf-pages-fly-token", W, "      - name: pages-project\n        env:\n          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n", "      - name: pages-project\n        env:\n          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}\n          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n", "test_the_cloudflare_secret_is_on_a_runner"),
 ("wf-pages-group-ops-dev", W, "      group: deploy-dev-pages\n", "      group: ops-dev\n", "test_only_the_deploy_job_holds_ops_dev"),
 ("wf-pages-cancelled", W, "      group: deploy-dev-pages\n      cancel-in-progress: false\n", "      group: deploy-dev-pages\n      cancel-in-progress: true\n", "test_only_the_deploy_job_holds_ops_dev"),
 ("wf-pages-no-group", W, "    concurrency:\n      group: deploy-dev-pages\n      cancel-in-progress: false\n", "", "test_only_the_deploy_job_holds_ops_dev"),
 # round 2: check-site
 ("site-link-allowed", P, "if stat.S_ISLNK(mode):\n                        return", "if False:\n                        return", "test_a_link_anywhere_in_the_site_is_refused"),
 ("site-stat-follows", P, "mode = os.lstat(os.path.join(folder, name)).st_mode", "mode = os.stat(os.path.join(folder, name)).st_mode", "test_a_link_anywhere_in_the_site_is_refused"),
 ("site-files-only", P, "for name in folders + files:", "for name in files:", "test_a_link_anywhere_in_the_site_is_refused"),
 ("site-special-allowed", P, "if not (stat.S_ISREG(mode) or stat.S_ISDIR(mode)):", "if False:", "test_a_special_file_is_refused"),
 ("site-root-link-allowed", P, "if os.path.islink(site) or not os.path.isdir(site):", "if not os.path.isdir(site):", "test_a_missing_or_linked_site"),
 ("site-check-passes-anyway", P, 'print(f"deploy-dev: check-site: {problem}")\n            return 1', 'print(f"deploy-dev: check-site: {problem}")\n            return 0', "test_a_link_anywhere_in_the_site_is_refused"),
 ("deploy-skips-site-check", P, "        problem = self.site_problem()\n        if problem:\n            print(f\"deploy-dev: pages-deploy:", "        problem = None\n        if problem:\n            print(f\"deploy-dev: pages-deploy:", "test_a_link_in_the_site_is_refused"),
 # round 2: check-head
 ("head-not-compared", P, "        if head != sha:\n", "        if False:\n", "test_another_head_fails_at_once"),
 ("head-token-dropped", P, 'sha = self.sha("check-head")\n        if sha is None:\n            return 1\n        headers = {"accept": "application/vnd.github+json", "authorization": f"Bearer {token}",\n', 'sha = self.sha("check-head")\n        if sha is None:\n            return 1\n        headers = {"accept": "application/vnd.github+json",\n', "test_it_passes_while_this_commit_is_main_s_head"),
 ("head-other-path", P, 'f"/repos/{REPOSITORY}/branches/{BRANCH}"', 'f"/repos/{REPOSITORY}/commits/{BRANCH}"', "test_it_passes_while_this_commit_is_main_s_head"),
 ("head-other-host", P, 'answer = self.http.request("GET", GITHUB_API, f"/repos/{REPOSITORY}/branches/{BRANCH}", headers)', 'answer = self.http.request("GET", DEV_HOST, f"/repos/{REPOSITORY}/branches/{BRANCH}", headers)', "test_it_passes_while_this_commit_is_main_s_head"),
 ("head-4xx-retried", P, '                if answer.status < 500:\n                    print(f"deploy-dev: check-head: {problem}")\n                    return 1\n', "", "test_a_server_error_or_a_lost_connection_is_asked_again_and_a_refusal_is_not"),
 ("head-5xx-fails", P, '                if answer.status < 500:\n                    print(f"deploy-dev: check-head: {problem}")', '                if answer.status < 600:\n                    print(f"deploy-dev: check-head: {problem}")', "test_a_server_error_or_a_lost_connection_is_asked_again_and_a_refusal_is_not"),
 ("head-sha-unchecked", P, "if not isinstance(head, str) or not SHA.fullmatch(head):", "if not isinstance(head, str):", "test_an_answer_that_names_no_commit_fails"),
 ("head-no-token-passes", P, 'print("deploy-dev: check-head has no GITHUB_TOKEN: its step gives it the job\'s token")\n            return 1', 'print("deploy-dev: check-head has no GITHUB_TOKEN: its step gives it the job\'s token")\n            return 0', "test_a_missing_token_or_commit_fails_before_any_request"),
 # round 2: setup-wrangler outside the checkout
 ("wr-in-checkout", P, "home = os.path.join(os.path.realpath(temp), WRANGLER_HOME)", "home = os.path.join(self.root, PAGES_DIR, WRANGLER_HOME)", "test_it_needs_a_runner_temp_outside_the_checkout"),
 ("wr-no-workspaces-flag", P, '"--no-fund", "--workspaces=false"]', '"--no-fund"]', "test_it_runs_npm_ci_without_install_scripts_outside_the_checkout"),
 ("wr-inside-checkout-allowed", P, "if os.path.commonpath([home, root]) == root:", "if False:", "test_it_needs_a_runner_temp_outside_the_checkout"),
 ("wr-relative-temp-allowed", P, "if not temp or not os.path.isabs(temp):", "if not temp:", "test_it_needs_a_runner_temp_outside_the_checkout"),
 ("wr-copy-skipped", P, "            for name in (\"package.json\", \"package-lock.json\"):\n                shutil.copyfile(self.path(PAGES_DIR, name), os.path.join(home, name))\n", "", "test_it_runs_npm_ci_without_install_scripts_outside_the_checkout"),
 ("wr-folder-reused", P, "            os.makedirs(home)\n", "            os.makedirs(home, exist_ok=True)\n", "test_it_needs_a_runner_temp_outside_the_checkout"),
 ("deploy-wrangler-in-checkout", P, "wrangler = os.path.join(home, WRANGLER)", "wrangler = self.path(PAGES_DIR, \"node_modules\", \"wrangler\", \"bin\", \"wrangler.js\")", "test_it_runs_the_pinned_wrangler_with_only_what_it_needs"),
 ("deploy-no-install-check", P, "        if not os.path.isfile(wrangler):\n", "        if False:\n", "test_nothing_runs_without_the_build"),
 # round 2: check-association's last answer
 ("assoc-seen-stale", P, '            else:\n                seen = "no production deployment"\n', "", "test_after_a_lost_connection_it_reports_what_cloudflare_answered_last"),
 # round 2: the workflow file
 ("wf-web-secret", W, "      - run: python3 tools/ci/ci_steps.py web\n      - run: python3 tools/ci/deploy_dev_steps.py check-site\n", "      - run: python3 tools/ci/ci_steps.py web\n      - name: check-site\n        env:\n          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}\n        run: python3 tools/ci/deploy_dev_steps.py check-site\n", "test_the_cloudflare_secret_is_on_a_runner"),
 ("wf-web-no-check-site", W, "      - run: python3 tools/ci/ci_steps.py web\n      - run: python3 tools/ci/deploy_dev_steps.py check-site\n", "      - run: python3 tools/ci/ci_steps.py web\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-hidden-files-off", W, "include-hidden-files: true", "include-hidden-files: false", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-no-files-warn", W, "if-no-files-found: error", "if-no-files-found: warn", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-artifact-kept", W, "retention-days: 1", "retention-days: 90", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-upload-unpinned", W, "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9  # v7.0.2", "actions/upload-artifact@v7", "test_the_pins_are_ci_yml_s"),
 ("wf-download-elsewhere", W, "          path: apps/web/dist\n", "          path: site\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-pages-builds", W, "      - run: python3 tools/ci/deploy_dev_steps.py setup-wrangler\n", "      - run: python3 tools/ci/ci_steps.py web\n      - run: python3 tools/ci/deploy_dev_steps.py setup-wrangler\n", "test_the_cloudflare_secret_is_on_a_runner"),
 ("wf-no-check-head", W, "      - name: check-head\n        env:\n          GITHUB_TOKEN: ${{ github.token }}\n        run: python3 tools/ci/deploy_dev_steps.py check-head\n", "", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-pages-no-check-site", W, "          path: apps/web/dist\n      - run: python3 tools/ci/deploy_dev_steps.py check-site\n", "          path: apps/web/dist\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-pages-needs-deploy-only", W, "    needs:\n      - deploy\n      - web\n", "    needs:\n      - deploy\n", "test_the_cloudflare_secret_is_on_a_runner"),
 ("wf-deploy-timeout-60", W, "    timeout-minutes: 80\n", "    timeout-minutes: 60\n", "test_its_jobs_and_steps_are_these_exactly"),
 ("wf-web-group-shared", W, "      group: deploy-dev-web-${{ github.sha }}\n", "      group: deploy-dev-pages\n", "test_only_the_deploy_job_holds_ops_dev"),
 ("wf-web-actions-read", W, "    timeout-minutes: 20\n    permissions:\n      contents: read\n", "    timeout-minutes: 20\n    permissions:\n      contents: read\n      actions: read\n", "test_its_jobs_and_steps_are_these_exactly"),
]
only = set(sys.argv[3:])
results = []
for entry in B:
    if only and entry[0] not in only:
        continue
    name, path, old, new, words = entry[:5]
    work = tempfile.mkdtemp()
    for part in ("tools/ci", ".github"):
        shutil.copytree(os.path.join(root, part), os.path.join(work, part), ignore=shutil.ignore_patterns("__pycache__", "node_modules"))
    for part in ("tools/ops/src/environment.ts", "services/api/src/session.test.ts"):
        os.makedirs(os.path.dirname(os.path.join(work, part)), exist_ok=True)
        shutil.copy(os.path.join(root, part), os.path.join(work, part))
    f = os.path.join(work, path)
    s = open(f).read()
    n = s.count(old)
    if n != 1:
        results.append((name, "NOT-APPLIED", n)); shutil.rmtree(work); continue
    open(f, "w").write(s.replace(old, new))
    flags = ["-B", "-I"] + (["-S"] if os.environ.get("NO_YAML") else [])
    r = subprocess.run([sys.executable, *flags, os.path.join(work, "tools/ci/deploy_dev_steps_test.py")], capture_output=True, text=True, cwd=work)
    text = r.stdout + r.stderr
    caught = r.returncode != 0 and words in text
    results.append((name, "caught" if caught else ("FAILED-OTHER" if r.returncode else "MISSED"), r.returncode))
    open(os.path.join(out, f"{name}.txt"), "w").write(f"{path}\n--- old\n{old}\n--- new\n{new}\n--- expected: {words}\n--- exit {r.returncode}\n{text}")
    shutil.rmtree(work)
for row in results:
    print(*row, sep="\t")
print(f"{sum(1 for r in results if r[1]=='caught')}/{len(results)} caught")
