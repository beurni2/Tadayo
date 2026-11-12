#!/usr/bin/env python3
"""Slice 10b's deliberate breakages: each changes ops_steps.py or ops.yml in a scratch copy of
tools/ci and .github, runs ops_steps_test.py, and is caught only when the run fails and its
output names the registered test (a name prefix).
usage: breakages.py <repository root> <out dir>"""
import os, shutil, subprocess, sys, tempfile, json

root, out = sys.argv[1], sys.argv[2]
P, W = "tools/ci/ops_steps.py", ".github/workflows/ops.yml"
B = [
 # ops_steps.py (27 from the first commit, then the review's)
 ("ref-not-checked", P, "        if ref != MAIN:\n", "        if False:\n", "test_a_run_from_another_ref"),
 ("ref-prefix-only", P, "        if ref != MAIN:\n", "        if not ref.startswith(MAIN):\n", "test_a_run_from_another_ref"),
 ("unknown-script-taken", P, "        if name not in SCRIPTS:\n", "        if not name:\n", "test_an_unknown_script"),
 ("extra-input-ignored", P, "            if given and variable not in script.options:\n", "            if False:\n", "test_an_input_the_script_doesnt_take"),
 ("required-not-checked", P, "            if option.required and not self.value(variable):\n", "            if False:\n", "test_a_missing_required_option"),
 ("branch-rule-match-not-full", P, "BRANCH_PART.fullmatch(part)", "re.match(r'^[A-Za-z0-9][A-Za-z0-9._-]*$', part)", "test_a_branch_s_name"),
 ("branch-dotdot-allowed", P, '".." not in branch and ', "", "test_a_branch_s_name"),
 ("branch-lock-allowed", P, ' and not part.endswith(".lock")', "", "test_a_branch_s_name"),
 ("branch-length-unbounded", P, "len(branch) <= BRANCH_MAX and ", "", "test_a_branch_s_name"),
 ("branch-trailing-dot", P, ' and not branch.endswith(".")', "", "test_a_branch_s_name"),
 ("run-skips-validation", P, "        name = self.validated()\n        if name is None:\n            return 1\n        missing", "        name = self.value('OPS_SCRIPT')\n        missing", "test_run_refuses_what_check_refuses"),
 ("missing-variable-ignored", P, "        if missing:\n", "        if False:\n", "test_a_missing_variable"),
 ("option-two-arguments", P, '                cmd.append(f"{option.flag}={given}")', "                cmd += [option.flag, given]", "test_each_script_runs_with_its_option"),
 ("exit-code-dropped", P, "        return self.shell.run(cmd)", "        self.shell.run(cmd)\n        return 0", "test_the_script_s_exit_code"),
 ("sha-not-checked", P, "        if digest != FLYCTL_SHA256:\n", "        if False:\n", "test_an_archive_with_another_checksum"),
 ("sha-changed", P, '"0115ae5202c9984695e22e4e99a375565ae3d7edc462377ce00c833406c877ac"', '"0115ae5202c9984695e22e4e99a375565ae3d7edc462377ce00c833406c877ad"', "test_the_pinned_release"),
 ("version-changed", P, 'FLYCTL_VERSION = "0.5.8"', 'FLYCTL_VERSION = "0.5.9"', "test_the_pinned_release"),
 ("member-any-file", P, 'm.name == "flyctl"', 'm.name.endswith("flyctl")', "test_an_archive_without_the_file"),
 ("member-dir-ok", P, "            if member is None or not member.isfile():\n", "            if member is None:\n", "test_an_archive_without_the_file"),
 ("not-executable", P, "        os.chmod(binary, 0o755)\n", "", "test_flyctl_goes_on_the_job_s_path"),
 ("archive-kept", P, "        os.remove(archive)\n", "", "test_flyctl_goes_on_the_job_s_path"),
 ("path-not-written", P, '            f.write(folder + "\\n")', '            f.write("")', "test_flyctl_goes_on_the_job_s_path"),
 ("flyctl-for-all", P, "        if not SCRIPTS[name].flyctl:\n", "        if False:\n", "test_nothing_is_installed"),
 ("download-error-raises", P, "        except (OSError, http.client.HTTPException) as error:", "        except http.client.HTTPException as error:", "test_a_failed_download"),
 ("seed-reads-admin", P, '    "seed": Script(("DATABASE_URL", "SUPABASE_DEV_PROJECT_REF")),', '    "seed": Script(("DATABASE_ADMIN_URL", "DATABASE_URL", "SUPABASE_DEV_PROJECT_REF")),', "test_the_scripts_and_what_each_reads"),
 ("probe-no-flyctl", P, '"SUPABASE_ACCESS_TOKEN"), flyctl=True),', '"SUPABASE_ACCESS_TOKEN")),', "test_the_scripts_that_call_flyctl"),
 ("to-required-for-clock", P, '{"OPS_TO": Option("--to", False)}),', '{"OPS_TO": Option("--to", True)}),', "test_the_options_each_takes"),
 ("main-returns-0", P, "    return STEPS[argv[1]](Steps(root, Shell(root)))", "    STEPS[argv[1]](Steps(root, Shell(root)))\n    return 0", "test_a_refusal_is_the_process_s_failure"),
 ("no-sys-exit", P, "    sys.exit(main(sys.argv))", "    main(sys.argv)", "test_a_refusal_is_the_process_s_failure"),
 ("shell-true", P, "        return subprocess.run(cmd, cwd=self.root).returncode", "        return subprocess.run(' '.join(cmd), shell=True, cwd=self.root).returncode", "test_an_input_reaches_node_as_one_argument"),
 ("secret-unprefixed", P, '    "DATABASE_URL": "DEV_DATABASE_URL",', '    "DATABASE_URL": "DATABASE_URL",', "test_every_variable_has_its_repository_secret"),
 ("missing-said-as-ops-yml", P, '                print(f"ops: {name} has no {variable}: the repository secret {SECRETS[variable]} is "\n                      "empty in this run (is it set? Settings, Secrets and variables, Actions)")', '                print(f"ops: {name}\'s step in ops.yml doesn\'t give it {variable}")', "test_a_missing_variable_names_its_repository_secret"),
 # ops.yml
 ("push-trigger", W, "on:\n  workflow_dispatch:\n", "on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n", "test_it_runs_only_by_hand"),
 ("choice-missing-seed", W, "          - seed\n", "", "test_it_runs_only_by_hand"),
 ("input-in-run", W, "      - run: python3 tools/ci/ops_steps.py check\n", "      - run: python3 tools/ci/ops_steps.py check ${{ inputs.script }}\n", "test_each_script_has_its_own_job", 1),
 ("cancel-in-progress", W, "  cancel-in-progress: false\n", "  cancel-in-progress: true\n", "test_one_run_at_a_time"),
 ("group-renamed", W, "  group: ops-dev\n", "  group: ops-${{ github.ref }}\n", "test_one_run_at_a_time"),
 ("contents-write", W, "    if: inputs.script == 'migrate'\n    runs-on: ubuntu-24.04\n    timeout-minutes: 20\n    permissions:\n      contents: read\n", "    if: inputs.script == 'migrate'\n    runs-on: ubuntu-24.04\n    timeout-minutes: 20\n    permissions:\n      contents: write\n", "test_each_script_has_its_own_job"),
 ("actions-read-elsewhere", W, "    if: inputs.script == 'migrate'\n    runs-on: ubuntu-24.04\n    timeout-minutes: 20\n    permissions:\n      contents: read\n", "    if: inputs.script == 'migrate'\n    runs-on: ubuntu-24.04\n    timeout-minutes: 20\n    permissions:\n      contents: read\n      actions: read\n", "test_each_script_has_its_own_job"),
 ("top-permissions", W, "\npermissions: {}\n", "\npermissions: read-all\n", "test_the_file_holds_these_keys"),
 ("unpinned-action", W, "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1", "actions/setup-node@v7", "test_each_script_has_its_own_job", 3),
 ("credentials-kept", W, "          ref: refs/heads/${{ inputs.branch }}\n          persist-credentials: false\n", "          ref: refs/heads/${{ inputs.branch }}\n", "test_each_script_has_its_own_job"),
 ("branch-ref-unqualified", W, "          ref: refs/heads/${{ inputs.branch }}\n", "          ref: ${{ inputs.branch }}\n", "test_each_script_has_its_own_job"),
 ("branch-before-check", W, "      - run: python3 tools/ci/ops_steps.py check\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1\n        with:\n          ref:", "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1\n        with:\n          ref:", "test_each_script_has_its_own_job"),
 ("migrate-gets-admin", W, "      - name: migrate\n        env:\n", "      - name: migrate\n        env:\n          DATABASE_ADMIN_URL: ${{ secrets.DEV_DATABASE_ADMIN_URL }}\n", "test_each_script_has_its_own_job"),
 ("probe-no-access-token", W, "          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}\n", "", "test_each_script_has_its_own_job"),
 ("db-url-not-dev", W, "      - name: seed\n        env:\n          DATABASE_URL: ${{ secrets.DEV_DATABASE_URL }}\n", "      - name: seed\n        env:\n          DATABASE_URL: ${{ secrets.DATABASE_URL }}\n", "test_each_script_has_its_own_job"),
 ("wrong-if", W, "    if: inputs.script == 'worker-scale'\n", "    if: inputs.script == 'fly-app-create'\n", "test_each_script_has_its_own_job"),
 ("step-level-if", W, "    name: deploy-branch\n    if: inputs.script == 'deploy-branch'\n", "    name: deploy-branch\n", "test_each_script_has_its_own_job"),
 ("token-in-workflow-env", W, "  OPS_BRANCH: ${{ inputs.branch }}\n", "  OPS_BRANCH: ${{ inputs.branch }}\n  FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}\n", "test_the_inputs_reach_the_steps_as_variables_only"),
 ("job-env-secret", W, "    if: inputs.script == 'bootstrap'\n", "    if: inputs.script == 'bootstrap'\n    env:\n      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}\n", "test_each_script_has_its_own_job"),
 ("github-token-to-setup", W, "      - run: python3 tools/ci/ops_steps.py setup-flyctl\n      - name: storage-setup\n", "      - env:\n          GITHUB_TOKEN: ${{ github.token }}\n        run: python3 tools/ci/ops_steps.py setup-flyctl\n      - name: storage-setup\n", "test_each_script_has_its_own_job"),
 ("no-setup-flyctl", W, "      - run: python3 tools/ci/ops_steps.py setup-flyctl\n      - name: worker-scale\n", "      - name: worker-scale\n", "test_each_script_has_its_own_job"),
 ("setup-flyctl-in-db-job", W, "      - name: migrate\n", "      - run: python3 tools/ci/ops_steps.py setup-flyctl\n      - name: migrate\n", "test_each_script_has_its_own_job"),
 ("env-from-input-raw", W, "  OPS_TO: ${{ inputs.to }}\n", "  OPS_TO: ${{ inputs.org }}\n", "test_the_inputs_reach_the_steps_as_variables_only"),
 ("other-runner", W, "    if: inputs.script == 'seed'\n    runs-on: ubuntu-24.04\n", "    if: inputs.script == 'seed'\n    runs-on: ubuntu-latest\n", "test_each_script_has_its_own_job"),
 ("shell-run", W, "      - run: python3 tools/ci/ci_steps.py install\n", "      - run: pnpm install\n", "test_each_script_has_its_own_job", 1),
 ("missing-job", W, "  seed:\n    name: seed\n", "  seedless:\n    name: seed\n", "test_each_script_has_its_own_job"),
 ("deploy-timeout", W, "    timeout-minutes: 40\n", "    timeout-minutes: 360\n", "test_each_script_has_its_own_job"),
 # The review's cases (C1, C2, C5): each slipped past the first commit's tests.
 ("blank-line-extra-secret", W, "      - name: migrate\n        env:\n          DATABASE_URL: ${{ secrets.DEV_DATABASE_URL }}\n          SUPABASE_DEV_PROJECT_REF: ${{ secrets.SUPABASE_DEV_PROJECT_REF }}\n", "      - name: migrate\n        env:\n          DATABASE_URL: ${{ secrets.DEV_DATABASE_URL }}\n          SUPABASE_DEV_PROJECT_REF: ${{ secrets.SUPABASE_DEV_PROJECT_REF }}\n\n          DATABASE_ADMIN_URL: ${{ secrets.DEV_DATABASE_ADMIN_URL }}\n", "test_each_script_has_its_own_job"),
 ("comment-extra-secret", W, "      - name: migrate\n        env:\n          DATABASE_URL: ${{ secrets.DEV_DATABASE_URL }}\n          SUPABASE_DEV_PROJECT_REF: ${{ secrets.SUPABASE_DEV_PROJECT_REF }}\n", "      - name: migrate\n        env:\n          DATABASE_URL: ${{ secrets.DEV_DATABASE_URL }}\n          SUPABASE_DEV_PROJECT_REF: ${{ secrets.SUPABASE_DEV_PROJECT_REF }}\n        # admin too\n          DATABASE_ADMIN_URL: ${{ secrets.DEV_DATABASE_ADMIN_URL }}\n", "test_each_script_has_its_own_job"),
 ("blank-line-extra-permission", W, "      actions: read  # the commit's ci runs, read by deploy-branch\n", "      actions: read  # the commit's ci runs, read by deploy-branch\n\n      id-token: write\n      deployments: write\n", "test_each_script_has_its_own_job"),
 ("bracket-secret-on-install", W, "      - run: python3 tools/ci/ci_steps.py install\n", "      - run: python3 tools/ci/ci_steps.py install\n        env:\n          NPM_TOKEN: ${{ secrets['FLY_API_TOKEN'] }}\n", "test_each_script_has_its_own_job", 2),
 ("bracket-github-token", W, "      - run: python3 tools/ci/ops_steps.py setup-flyctl\n      - name: worker-scale\n", "      - env:\n          GH: ${{ github['token'] }}\n        run: python3 tools/ci/ops_steps.py setup-flyctl\n      - name: worker-scale\n", "test_each_script_has_its_own_job"),
 ("tojson-secrets", W, "          node-version-file: .nvmrc\n", "          node-version-file: .nvmrc\n          token: ${{ tojson(secrets) }}\n", "test_each_script_has_its_own_job", 4),
 ("continue-on-error-check", W, "      - run: python3 tools/ci/ops_steps.py check\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1\n        with:\n          ref:", "      - run: python3 tools/ci/ops_steps.py check\n        continue-on-error: true\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1\n        with:\n          ref:", "test_each_script_has_its_own_job"),
 ("description-expression", W, "        description: The script to run (tools/ops/src/run.ts says what each does)\n", "        description: The script to run ${{ secrets.FLY_API_TOKEN }}\n", "test_it_runs_only_by_hand"),
]
results = []
for entry in B:
    name, path, old, new, words = entry[:5]
    nth = entry[5] if len(entry) > 5 else None
    work = tempfile.mkdtemp()
    for part in ("tools/ci", ".github"):
        shutil.copytree(os.path.join(root, part), os.path.join(work, part), ignore=shutil.ignore_patterns("__pycache__"))
    f = os.path.join(work, path)
    s = open(f).read()
    n = s.count(old)
    if (nth is None and n != 1) or (nth is not None and n < nth):
        results.append((name, "NOT-APPLIED", n)); shutil.rmtree(work); continue
    at = -1
    for _ in range(nth or 1):
        at = s.index(old, at + 1)
    open(f, "w").write(s[:at] + new + s[at + len(old):])
    r = subprocess.run([sys.executable, "-B", "-I", os.path.join(work, "tools/ci/ops_steps_test.py")], capture_output=True, text=True, cwd=work)
    text = r.stdout + r.stderr
    caught = r.returncode != 0 and words in text
    results.append((name, "caught" if caught else ("FAILED-OTHER" if r.returncode else "MISSED"), r.returncode))
    open(os.path.join(out, f"{name}.txt"), "w").write(f"{path}\n--- old\n{old}\n--- new\n{new}\n--- expected: {words}\n--- exit {r.returncode}\n{text}")
    shutil.rmtree(work)
for row in results:
    print(*row, sep="\t")
print(f"{sum(1 for r in results if r[1]=='caught')}/{len(results)} caught")
