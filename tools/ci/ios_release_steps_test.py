#!/usr/bin/env python3
"""Tests for tools/ci/ios_release_steps.py. Run: python3 tools/ci/ios_release_steps_test.py

Each test builds a scratch repository and a sample archive with only the files a step reads, and
runs the step with a fake shell that records the commands and answers them: `xcodebuild`,
`codesign` and `assetutil` exist only on the workflow's runner. The .ipa a test exports is a
real zip, and the tar a test unpacks a real tar. One test class reads .github/workflows/ios-release.yml itself.
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import contextlib
import io
import json
import os
import plistlib
import re
import shutil
import stat
import struct
import sys
import tarfile
import tempfile
import unittest
import unittest.mock
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import ios_release_steps as release  # noqa: E402

TEAM = "A1B2C3D4E5"
KEY_ID = "K1L2M3N4P5"
ISSUER = "01234567-89ab-cdef-0123-456789abcdef"
KEY_TEXT = "-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----"
FIXTURE_NAMES = ["fixture-ben", "fixture-sea"]
WORKFLOW = os.path.join(ROOT, ".github", "workflows", "ios-release.yml")


def png(width, height, apple=False):
    """A PNG's first bytes: the signature, Xcode's own chunk when `apple`, then IHDR."""
    chunk = b"\x00\x00\x00\x04CgBI\x50\x00\x20\x02\x00\x00\x00\x00" if apple else b""
    return (release.PNG_SIGNATURE + chunk + struct.pack(">I4s", 13, b"IHDR")
            + struct.pack(">II", width, height) + b"\x08\x06\x00\x00\x00" + b"\x00" * 4)


def listing(names):
    return json.dumps([{"AssetStorageVersion": "Xcode 27.2"}]
                      + [{"AssetType": "Image", "Name": name} for name in names])


def entitlements(team=None, groups=(release.APP_GROUP,), bundle_id=release.APP_ID, debug=False):
    value = {"com.apple.security.application-groups": list(groups)}
    if team:
        value.update({"com.apple.developer.team-identifier": team,
                      "application-identifier": f"{team}.{bundle_id}", "get-task-allow": debug})
    return plistlib.dumps(value).decode("utf-8")


class FakeShell:
    """Records every command with whether the key's file was there when it ran. `run` writes its
    log and calls `effects`; `capture` answers from `answers`, (predicate, result) in order."""

    def __init__(self, answers=None, codes=None, effects=None, log_text=""):
        self.commands, self.key_seen, self.key_folders = [], [], []
        self.answers, self.codes, self.effects = answers or [], codes or [], effects or []
        self.log_text = log_text

    def _note(self, cmd):
        self.commands.append(cmd)
        if "-authenticationKeyPath" in cmd:
            path = cmd[cmd.index("-authenticationKeyPath") + 1]
            folder = os.path.dirname(path)
            self.key_folders.append((oct(os.stat(folder).st_mode & 0o777), os.listdir(folder)))
            with open(path) as f:
                self.key_seen.append((oct(os.stat(path).st_mode & 0o777), f.read()))

    def run(self, cmd, env=None, log=None, cwd=None):
        self._note(cmd)
        if log:
            os.makedirs(os.path.dirname(log), exist_ok=True)
            with open(log, "a") as f:
                f.write(self.log_text)
        for matches, effect in self.effects:
            if matches(cmd):
                effect(cmd)
        for matches, code in self.codes:
            if matches(cmd):
                return code
        return 0

    def capture(self, cmd, env=None, cwd=None):
        self._note(cmd)
        for matches, result in self.answers:
            if matches(cmd):
                return result(cmd) if callable(result) else result
        return 0, "", ""


def signed_as(team=None, app=None, share=None):
    """codesign's answer for each bundle: the app's entitlements for Tadayo.app and the share
    extension's for TadayoShare.appex, each its own unless `app` or `share` gives another."""
    texts = {"Tadayo.app": app or entitlements(team),
             "TadayoShare.appex": share or entitlements(team, bundle_id=release.SHARE_ID)}
    return lambda cmd: (0, texts[os.path.basename(cmd[-1])], "")


def has(*words):
    return lambda cmd: all(word in cmd for word in words)


class StepsTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="ios-release-")
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        self.temp = os.path.join(self.root, "_runner_temp")
        for name in FIXTURE_NAMES:
            os.makedirs(os.path.join(self.root, *release.FIXTURES.split("/"), name + ".imageset"))
        os.makedirs(os.path.join(self.root, "apps", "ios", "Tadayo.xcodeproj"))
        self.environ = {"RUNNER_TEMP": self.temp, "RELEASE_ENVIRONMENT": "dev",
                        "RELEASE_UPLOAD": "true", "GITHUB_RUN_NUMBER": "7",
                        "GITHUB_RUN_ATTEMPT": "2", "APPLE_TEAM_ID": TEAM, "ASC_KEY_ID": KEY_ID,
                        "ASC_ISSUER_ID": ISSUER, "ASC_KEY_P8": KEY_TEXT}

    def steps(self, shell=None, **environ):
        env = dict(self.environ)
        env.update(environ)
        return release.Steps(self.root, shell or FakeShell(), environ=env)

    def step(self, name, shell=None, **environ):
        steps = self.steps(shell, **environ)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = getattr(steps, name)()
        return code, out.getvalue()

    # A sample archive.

    def bundle(self, folder, bundle_id, build="7.2", **more):
        os.makedirs(folder, exist_ok=True)
        info = {"CFBundleIdentifier": bundle_id, "CFBundleVersion": build}
        info.update(more)
        with open(os.path.join(folder, "Info.plist"), "wb") as f:
            plistlib.dump(info, f, fmt=plistlib.FMT_BINARY)

    def archive(self, environment="dev", icon=(120, 120), rule=None,
                named="Applications/Tadayo.app", **app_info):
        app = self.steps().app_path()
        os.makedirs(app, exist_ok=True)
        with open(os.path.join(self.steps().archive_path(), "Info.plist"), "wb") as f:
            plistlib.dump({"ApplicationProperties": {"ApplicationPath": named}}, f)
        # The icon's name is where the built app has it (AppIconTests.testTheBuiltAppNamesItsIcon).
        info = {"TadayoEnvironment": environment,
                "CFBundleIcons": {"CFBundlePrimaryIcon": {"CFBundleIconName": "AppIcon",
                                                          "CFBundleIconFiles": ["AppIcon60x60"]}}}
        info.update(app_info)
        self.bundle(app, release.APP_ID, **info)
        if icon:
            with open(os.path.join(app, "AppIcon60x60@2x.png"), "wb") as f:
                f.write(png(*icon, apple=True))
        with open(os.path.join(app, "Assets.car"), "wb") as f:
            f.write(b"car")
        self.bundle(os.path.join(app, "PlugIns", "TadayoShare.appex"), release.SHARE_ID,
                    NSExtension={"NSExtensionAttributes": {"NSExtensionActivationRule":
                                 dict(release.ACTIVATION_RULE) if rule is None else rule}})
        return app

    def shell(self, names=None, signed=None, **more):
        names = ["Wordmark", "LaunchBackground"] + FIXTURE_NAMES if names is None else names
        return FakeShell(answers=[(has("assetutil"), (0, listing(names), "")),
                                  (has("codesign"), signed or signed_as())], **more)

    def check(self, shell=None, **environ):
        return self.step("check", shell or self.shell(), **environ)


class HelpersTest(unittest.TestCase):
    def test_a_png_s_size_with_and_without_xcode_s_chunk(self):
        self.assertEqual(release.png_size(png(120, 120)), (120, 120))
        self.assertEqual(release.png_size(png(180, 120, apple=True)), (180, 120))
        self.assertIsNone(release.png_size(b"GIF89a" + b"\x00" * 40))
        self.assertIsNone(release.png_size(release.PNG_SIGNATURE + b"\x00\x00\x00\x0dIHDR"))

    def test_the_listing_s_names(self):
        self.assertEqual(release.asset_names(listing(["a", "b"])), {"a", "b"})
        for bad in ("{}", "[1]", "[]", listing([])):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                release.asset_names(bad)

    # The B0 plan's slice 12 test: "the prod-archive check on a sample archive listing".

    def test_a_prod_listing_with_a_fixture_fails(self):
        names = release.asset_names(listing(["Wordmark", "fixture-sea"]))
        problems = release.fixture_problems("prod", names, ["Assets.car"], FIXTURE_NAMES)
        self.assertEqual(len(problems), 1)
        self.assertIn("fixture-sea", problems[0])
        self.assertIn("T46", problems[0])

    def test_a_prod_listing_without_fixtures_passes(self):
        self.assertEqual(release.fixture_problems("prod", {"Wordmark"}, ["Assets.car"],
                                                  FIXTURE_NAMES), [])

    def test_a_prod_app_with_a_loose_fixture_file_fails(self):
        problems = release.fixture_problems("prod", {"Wordmark"}, ["fixture-ben.jpg"],
                                            FIXTURE_NAMES)
        self.assertEqual(len(problems), 1)
        self.assertIn("fixture-ben.jpg", problems[0])

    def test_a_dev_listing_must_hold_every_fixture(self):
        self.assertEqual(release.fixture_problems("dev", {"Wordmark", *FIXTURE_NAMES}, [],
                                                  FIXTURE_NAMES), [])
        problems = release.fixture_problems("dev", {"Wordmark", "fixture-ben"}, [], FIXTURE_NAMES)
        self.assertEqual(len(problems), 1)
        self.assertIn("fixture-sea", problems[0])

    def test_a_listing_without_the_app_s_own_image_fails_either_way(self):
        for environment in ("dev", "prod"):
            with self.subTest(environment=environment):
                problems = release.fixture_problems(environment, {"Other", *FIXTURE_NAMES}, [],
                                                    FIXTURE_NAMES)
                self.assertTrue(any("Wordmark" in p for p in problems))

    def test_no_fixture_to_look_for_fails(self):
        self.assertEqual(len(release.fixture_problems("prod", {"Wordmark"}, [], [])), 1)

    def test_the_fixtures_in_the_repository_are_what_the_check_looks_for(self):
        steps = release.Steps(ROOT, FakeShell(), environ={"RUNNER_TEMP": tempfile.gettempdir()})
        fixtures = steps.fixtures()
        self.assertGreaterEqual(len(fixtures), 10)
        self.assertTrue(all(name.startswith("fixture-") for name in fixtures))

    def test_the_activation_rule_is_the_project_s(self):
        with open(os.path.join(ROOT, "apps", "ios", "project.yml")) as f:
            text = f.read()
        block = text.split("NSExtensionActivationRule:\n", 1)[1]
        lines = []
        for line in block.splitlines():
            if not line.startswith("              "):
                break
            lines.append(line.strip())
        self.assertEqual(lines, ["NSExtensionActivationSupportsImageWithMaxCount: 6",
                                 "NSExtensionActivationSupportsWebURLWithMaxCount: 1",
                                 "NSExtensionActivationSupportsText: true"])
        self.assertEqual(release.ACTIVATION_RULE,
                         {"NSExtensionActivationSupportsImageWithMaxCount": 6,
                          "NSExtensionActivationSupportsWebURLWithMaxCount": 1,
                          "NSExtensionActivationSupportsText": True})

    def test_the_icon_s_name_nested_as_the_built_app_has_it_or_at_the_top(self):
        nested = {"CFBundleIcons": {"CFBundlePrimaryIcon": {"CFBundleIconName": "AppIcon"}}}
        self.assertEqual(release.icon_name(nested), "AppIcon")
        self.assertEqual(release.icon_name({"CFBundleIconName": "AppIcon"}), "AppIcon")
        self.assertIsNone(release.icon_name({}))
        self.assertIsNone(release.icon_name({"CFBundleIcons": ["AppIcon"]}))

    def test_entitlements(self):
        def problems(text, bundle_id=release.APP_ID):
            return release.entitlement_problems(plistlib.loads(text.encode()), TEAM, bundle_id)
        self.assertEqual(problems(entitlements(TEAM)), [])
        self.assertEqual(problems(entitlements(TEAM, bundle_id=release.SHARE_ID),
                                  release.SHARE_ID), [])
        self.assertEqual(release.entitlement_problems(plistlib.loads(entitlements().encode())), [])
        for bad, words in ((entitlements(TEAM, groups=()), ["app groups"]),
                           (entitlements(TEAM, groups=("group.other",)), ["app groups"]),
                           (entitlements("Z9Y8X7W6V5"), ["its team isn't", "application identifier"]),
                           (entitlements(TEAM, bundle_id="app.other"), ["application identifier"]),
                           (entitlements(TEAM, bundle_id=release.SHARE_ID),
                            ["application identifier"]),
                           (entitlements(TEAM, bundle_id=release.APP_ID + ".more"),
                            ["application identifier"]),
                           (entitlements(TEAM, debug=True), ["get-task-allow"])):
            with self.subTest(words=words):
                found = problems(bad)
                self.assertEqual(len(found), len(words), found)
                for word, problem in zip(words, found):
                    self.assertIn(word, problem)

    def test_the_key_leaves_the_environment_children_inherit(self):
        environ = {"PATH": "/usr/bin", "ASC_KEY_ID": KEY_ID, "ASC_ISSUER_ID": ISSUER,
                   "ASC_KEY_P8": KEY_TEXT}
        taken = release.take_environment(environ)
        self.assertEqual(environ, {"PATH": "/usr/bin"})
        self.assertEqual(taken["ASC_KEY_P8"], KEY_TEXT)
        self.assertEqual(taken["ASC_KEY_ID"], KEY_ID)
        self.assertEqual(taken["ASC_ISSUER_ID"], ISSUER)
        self.assertEqual(release.take_environment({"PATH": "/usr/bin"}), {"PATH": "/usr/bin"})

    def test_main_takes_the_key_before_any_step_runs(self):
        seen = {}

        def step(steps):
            seen["child"] = {name: os.environ.get(name) for name in release.KEY_NAMES}
            seen["own"] = steps.environ.get("ASC_KEY_P8")
            return 0
        saved = dict(os.environ)
        self.addCleanup(lambda: (os.environ.clear(), os.environ.update(saved)))
        os.environ.update({"ASC_KEY_ID": KEY_ID, "ASC_ISSUER_ID": ISSUER, "ASC_KEY_P8": KEY_TEXT})
        steps = dict(release.STEPS, plan=step)
        with unittest.mock.patch.object(release, "STEPS", steps):
            self.assertEqual(release.main(["ios_release_steps.py", "plan"]), 0)
        self.assertEqual(seen["child"], dict.fromkeys(release.KEY_NAMES))
        self.assertEqual(seen["own"], KEY_TEXT)

    def test_a_quoted_line_is_no_workflow_command(self):
        self.assertEqual(release.quoted("::add-mask::x\n"), "| ::add-mask::x")
        self.assertEqual(release.quoted("  ::error::x"), "|   ::error::x")
        self.assertEqual(release.quoted("a ##[set-output name=x]y"), "| a ## [set-output name=x]y")

    def test_a_tar_member_outside_the_archive_or_not_a_plain_file_is_unsafe(self):
        def member(name, kind=tarfile.REGTYPE):
            info = tarfile.TarInfo(name)
            info.type = kind
            return info
        for good in (member("Tadayo.xcarchive", tarfile.DIRTYPE),
                     member("Tadayo.xcarchive/Info.plist"),
                     member("Tadayo.xcarchive/Products/Applications", tarfile.DIRTYPE)):
            self.assertIsNone(release.unsafe_member(good), good.name)
        for bad in (member("/Tadayo.xcarchive/Info.plist"), member("Other/Info.plist"),
                    member("Tadayo.xcarchivex/Info.plist"), member("./Tadayo.xcarchive/Info.plist"),
                    member("Tadayo.xcarchive.tar"), member(""),
                    member("Info.plist"), member("Tadayo.xcarchive/../../tools/ci/x.py"),
                    member("Tadayo.xcarchive/link", tarfile.SYMTYPE),
                    member("Tadayo.xcarchive/hard", tarfile.LNKTYPE),
                    member("Tadayo.xcarchive/pipe", tarfile.FIFOTYPE),
                    member("Tadayo.xcarchive/device", tarfile.CHRTYPE)):
            self.assertIsNotNone(release.unsafe_member(bad), bad.name)

    def test_the_export_s_options(self):
        self.assertEqual(release.export_options(TEAM, "upload"),
                         {"method": "app-store-connect", "destination": "upload", "teamID": TEAM,
                          "signingStyle": "automatic", "manageAppVersionAndBuildNumber": False,
                          "uploadSymbols": True})


class PlanTest(StepsTest):
    def test_an_upload_run_says_what_it_does(self):
        code, out = self.step("plan")
        self.assertEqual(code, 0)
        self.assertIn("build 7.2", out)
        self.assertIn("uploaded", out)
        for secret in (KEY_TEXT, KEY_ID, ISSUER, TEAM):
            self.assertNotIn(secret, out)

    def test_plan_never_reads_the_key(self):
        # The build job is given no secret, so plan can't ask for one.
        code, out = self.step("plan", ASC_KEY_ID="", ASC_ISSUER_ID="", ASC_KEY_P8="")
        self.assertEqual(code, 0, out)
        self.assertIn("uploaded", out)

    def test_a_dry_run_needs_no_key_and_no_team(self):
        code, out = self.step("plan", RELEASE_UPLOAD="false", APPLE_TEAM_ID="", ASC_KEY_ID="",
                              ASC_ISSUER_ID="", ASC_KEY_P8="")
        self.assertEqual(code, 0)
        self.assertIn("dry run", out)

    def test_prod_is_never_uploaded(self):
        code, out = self.step("plan", RELEASE_ENVIRONMENT="prod")
        self.assertEqual(code, 1)
        self.assertIn("never uploaded", out)
        self.assertEqual(self.step("plan", RELEASE_ENVIRONMENT="prod", RELEASE_UPLOAD="false")[0], 0)

    def test_bad_inputs_fail_before_any_build(self):
        for change in ({"RELEASE_ENVIRONMENT": "staging"}, {"RELEASE_ENVIRONMENT": ""},
                       {"RELEASE_UPLOAD": "yes"}, {"RELEASE_UPLOAD": ""},
                       {"GITHUB_RUN_NUMBER": ""}, {"GITHUB_RUN_NUMBER": "7; rm"},
                       {"GITHUB_RUN_ATTEMPT": "0"}, {"APPLE_TEAM_ID": ""},
                       {"APPLE_TEAM_ID": "a1b2c3d4e5"}):
            with self.subTest(change=change):
                shell = FakeShell()
                code, out = self.step("plan", shell, **change)
                self.assertEqual(code, 1)
                self.assertEqual(shell.commands, [])
                self.assertNotIn(KEY_TEXT, out)


class ArchiveTest(StepsTest):
    def run_archive(self, shell=None, **environ):
        made = []

        def make(cmd):
            made.append(cmd)
            self.archive(environ.get("RELEASE_ENVIRONMENT", "dev"))
        shell = shell or FakeShell(effects=[(has("archive"), make)])
        return self.step("archive", shell, **environ) + (shell,)

    def test_the_command(self):
        code, out, shell = self.run_archive()
        self.assertEqual(code, 0, out)
        cmd = shell.commands[0]
        self.assertEqual(cmd[:2], ["xcodebuild", "archive"])
        for pair in (["-project", "apps/ios/Tadayo.xcodeproj"], ["-scheme", "Tadayo"],
                     ["-configuration", "Dev"], ["-destination", "generic/platform=iOS"]):
            self.assertEqual(cmd[cmd.index(pair[0]) + 1], pair[1])
        for word in ("-skipPackagePluginValidation", "CURRENT_PROJECT_VERSION=7.2",
                     "CODE_SIGN_IDENTITY=-", "AD_HOC_CODE_SIGNING_ALLOWED=YES",
                     "CODE_SIGN_STYLE=Manual", "PROVISIONING_PROFILE_SPECIFIER=",
                     "DEVELOPMENT_TEAM="):
            self.assertIn(word, cmd)
        steps = self.steps()
        self.assertEqual(cmd[cmd.index("-archivePath") + 1], steps.archive_path())
        self.assertEqual(cmd[cmd.index("-derivedDataPath") + 1], steps.ios.derived_data())
        self.assertTrue(steps.archive_path().startswith(self.temp + os.sep))

    def test_an_older_archive_is_removed_before_the_build(self):
        stale = os.path.join(self.archive(), "stale")
        os.makedirs(stale)
        seen = []
        shell = FakeShell(effects=[(has("archive"), lambda cmd: seen.append(os.path.exists(stale)))])
        code, out, _ = self.run_archive(shell)
        self.assertEqual(seen, [False])
        self.assertEqual(code, 1)  # this build made no app, and the old one doesn't stand in

    def test_a_failed_build_with_a_plugin_problem_still_shows_the_log_s_end(self):
        line = "Compile plug-in “Other” in package “other-package”\nerror: the cause\n"
        code, out, _ = self.run_archive(FakeShell(codes=[(has("archive"), 65)], log_text=line))
        self.assertEqual(code, 65)
        self.assertIn("ADR-028", out)
        self.assertIn("| error: the cause", out)

    def test_no_account_takes_part(self):
        _, out, shell = self.run_archive()
        flat = " ".join(shell.commands[0]) + out
        for word in ("-authenticationKeyPath", "-allowProvisioningUpdates", KEY_ID, ISSUER, TEAM):
            self.assertNotIn(word, flat)
        self.assertEqual(shell.key_seen, [])
        self.assertFalse(os.path.exists(os.path.join(self.temp, "ios-release-key")))

    def test_prod_archives_the_release_configuration(self):
        _, _, shell = self.run_archive(RELEASE_ENVIRONMENT="prod", RELEASE_UPLOAD="false")
        cmd = shell.commands[0]
        self.assertEqual(cmd[cmd.index("-configuration") + 1], "Release")

    def test_a_failed_build_fails_and_shows_the_log_s_end(self):
        shell = FakeShell(codes=[(has("archive"), 65)], log_text="line one\nerror: no such module\n")
        code, out, _ = self.run_archive(shell)
        self.assertEqual(code, 65)
        self.assertIn("error: no such module", out)

    def test_a_build_without_an_app_fails(self):
        code, out, _ = self.run_archive(FakeShell())
        self.assertEqual(code, 1)
        self.assertIn("no Tadayo.app", out)

    def test_a_plugin_the_list_doesn_t_allow_fails(self):
        line = "Compile plug-in “Other” in package “other-package”\n"
        shell = FakeShell(effects=[(has("archive"), lambda cmd: self.archive())], log_text=line)
        code, out, _ = self.run_archive(shell)
        self.assertEqual(code, 1)
        self.assertIn("ADR-028", out)


class CheckTest(StepsTest):
    def test_a_dev_archive_as_it_must_be(self):
        self.archive()
        code, out = self.check()
        self.assertEqual(code, 0, out)

    def test_a_prod_archive_as_it_must_be(self):
        self.archive("prod")
        code, out = self.check(self.shell(names=["Wordmark"]), RELEASE_ENVIRONMENT="prod",
                               RELEASE_UPLOAD="false")
        self.assertEqual(code, 0, out)

    def test_a_prod_archive_with_a_fixture_photograph_fails(self):
        self.archive("prod")
        code, out = self.check(RELEASE_ENVIRONMENT="prod", RELEASE_UPLOAD="false")
        self.assertEqual(code, 1)
        self.assertIn("fixture-ben, fixture-sea", out)

    def test_a_dev_archive_without_its_fixtures_fails(self):
        self.archive()
        code, out = self.check(self.shell(names=["Wordmark"]))
        self.assertEqual(code, 1)
        self.assertIn("missing fixture-ben, fixture-sea", out)

    def test_each_thing_wrong_fails(self):
        cases = (
            ({"environment": "prod"}, None, "points at 'prod'"),
            ({"CFBundleVersion": "1"}, None, "build number"),
            ({"CFBundleIdentifier": "app.other"}, None, "bundle id"),
            ({"CFBundleIcons": {"CFBundlePrimaryIcon": {
                "CFBundleIconName": "Other", "CFBundleIconFiles": ["AppIcon60x60"]}}}, None,
             "CFBundleIconName is 'Other'"),
            ({"CFBundleIcons": {"CFBundlePrimaryIcon": {
                "CFBundleIconFiles": ["AppIcon60x60"]}}}, None, "CFBundleIconName is None"),
            ({"icon": None}, None, "120-pixel"),
            ({"icon": (180, 180)}, None, "120-pixel"),
            ({"CFBundleIcons": {}}, None, "120-pixel"),
            ({"CFBundleIcons": "AppIcon"}, None, "120-pixel"),
            ({"CFBundleIcons": {"CFBundlePrimaryIcon": {
                "CFBundleIconName": "AppIcon", "CFBundleIconFiles": "AppIcon60x60"}}}, None,
             "120-pixel"),
            ({"rule": "TRUEPREDICATE"}, None, "activation rule"),
            ({"rule": {"NSExtensionActivationSupportsImageWithMaxCount": 10}}, None,
             "activation rule"),
            ({}, signed_as(app=entitlements(groups=())), "the app: its app groups"),
            ({}, signed_as(share=entitlements(groups=())),
             "the share extension: its app groups"),
            ({}, signed_as(share=entitlements(groups=("group.other",))),
             "the share extension: its app groups"),
        )
        for changes, signed, word in cases:
            with self.subTest(word=word, changes=changes):
                shutil.rmtree(self.temp, ignore_errors=True)
                changes = dict(changes)
                build = changes.pop("CFBundleVersion", None)
                bundle_id = changes.pop("CFBundleIdentifier", None)
                app = self.archive(**changes)
                if build or bundle_id:
                    self.bundle(app, bundle_id or release.APP_ID, build or "7.2",
                                TadayoEnvironment="dev",
                                CFBundleIcons={"CFBundlePrimaryIcon":
                                               {"CFBundleIconName": "AppIcon",
                                                "CFBundleIconFiles": ["AppIcon60x60"]}})
                code, out = self.check(self.shell(signed=signed))
                self.assertEqual(code, 1, out)
                self.assertIn(word, out)

    def test_the_archive_must_name_this_app_and_carry_no_other_code(self):
        def other_app(app):
            self.bundle(os.path.join(os.path.dirname(app), "Other.app"), "app.other")

        def clip(app):
            self.bundle(os.path.join(app, "AppClips", "Clip.app"), "app.tadayo.clip")

        def second_extension(app):
            self.bundle(os.path.join(app, "PlugIns", "Other.appex"), "app.tadayo.other")

        def service(app):
            os.makedirs(os.path.join(app, "XPCServices", "Helper.xpc"))

        def capitals(app):
            self.bundle(os.path.join(app, "PlugIns", "Other.APPEX"), "app.tadayo.other")

        def no_extension(app):
            os.rename(os.path.join(app, "PlugIns", "TadayoShare.appex"),
                      os.path.join(app, "PlugIns", "TadayoShare.off"))
        for change, word in ((other_app, "Applications holds ['Other.app', 'Tadayo.app']"),
                             (clip, "the app carries"), (second_extension, "the app carries"),
                             (service, "the app carries"), (capitals, "the app carries"),
                             (no_extension, "can't be read")):
            with self.subTest(change=change.__name__):
                shutil.rmtree(self.temp, ignore_errors=True)
                change(self.archive())
                code, out = self.check()
                self.assertEqual(code, 1, out)
                self.assertIn(word, out)
        for named in ("Applications/Other.app", "Applications/Tadayo.app/PlugIns/x.app",
                      "Other/Applications/Tadayo.app", None):
            with self.subTest(named=named):
                shutil.rmtree(self.temp, ignore_errors=True)
                self.archive(named=named) if named else self.archive(named=7)
                code, out = self.check()
                self.assertEqual(code, 1, out)
                self.assertIn("as its app, not Applications/Tadayo.app", out)

    def test_an_entitlement_the_project_doesn_t_declare_fails(self):
        self.archive()
        more = plistlib.loads(entitlements().encode())
        more["aps-environment"] = "production"
        more["com.apple.developer.associated-domains"] = ["applinks:example.com"]
        text = plistlib.dumps(more).decode()
        for bundle, label in (("app", "the app"), ("share", "the share extension")):
            with self.subTest(bundle=bundle):
                code, out = self.check(self.shell(signed=signed_as(**{bundle: text})))
                self.assertEqual(code, 1)
                self.assertEqual(out.count("doesn't declare"), 1, out)
                self.assertIn(f"{label}: it holds entitlements the project doesn't declare: "
                              "aps-environment, com.apple.developer.associated-domains", out)

    def test_what_only_an_export_may_hold_fails_in_an_archive(self):
        self.archive()
        more = plistlib.loads(entitlements().encode())
        more["keychain-access-groups"] = [TEAM + ".*"]
        code, out = self.check(self.shell(signed=signed_as(app=plistlib.dumps(more).decode())))
        self.assertEqual(code, 1)
        self.assertIn("the app: it holds entitlements the project doesn't declare: "
                      "keychain-access-groups", out)

    def test_an_icon_name_that_is_a_path_is_never_opened(self):
        outside = os.path.join(self.root, "outside@2x.png")
        with open(outside, "wb") as f:
            f.write(png(120, 120))
        self.archive(icon=None, CFBundleIcons={"CFBundlePrimaryIcon": {
            "CFBundleIconName": "AppIcon",
            "CFBundleIconFiles": [outside[:-len("@2x.png")], "../../../../../outside"]}})
        code, out = self.check()
        self.assertEqual(code, 1)
        self.assertIn("120-pixel", out)

    def test_an_archive_of_another_attempt_fails(self):
        # The sign job re-run alone would be attempt 3 reading attempt 2's archive.
        self.archive()
        code, out = self.check(GITHUB_RUN_ATTEMPT="3")
        self.assertEqual(code, 1)
        self.assertIn("not the run's 7.3", out)

    def test_what_a_step_says_is_one_redacted_line(self):
        self.archive()
        err = f"error one {KEY_ID.lower()}\n::add-mask::x\r\n##[error]y"
        shell = FakeShell(answers=[(has("assetutil"), (1, "", err)),
                                   (has("codesign"), signed_as())])
        code, out = self.check(shell)
        self.assertEqual(code, 1)
        self.assertEqual(out.count("\n"), 1, out)
        self.assertIn("error one *** ::add-mask::x ## [error]y", out)

    def test_the_share_extension_s_own_values_are_checked(self):
        app = self.archive()
        self.bundle(os.path.join(app, "PlugIns", "TadayoShare.appex"), "app.other", "1")
        code, out = self.check()
        self.assertEqual(code, 1)
        self.assertIn("the share extension: its bundle id", out)
        self.assertIn("the share extension: its build number", out)

    def test_what_can_t_be_read_fails(self):
        self.assertEqual(self.check()[0], 1)  # no archive at all
        app = self.archive()
        for text in (b"<?xml version=\"1.0\"?><plist><dict><key>a</key>", b"[1, 2]"):
            with self.subTest(info=text):
                with open(os.path.join(app, "Info.plist"), "wb") as f:
                    f.write(text)
                code, out = self.check()
                self.assertEqual(code, 1)
                self.assertIn("can't be read", out)
        shutil.rmtree(self.temp)
        self.archive()
        code, out = self.check(self.shell(signed=(0, "<?xml version=\"1.0\"?><plist><dict>", "")))
        self.assertEqual(code, 1)
        self.assertIn("can't be read", out)
        for shell in (FakeShell(answers=[(has("assetutil"), (1, "", "no such file")),
                                         (has("codesign"), (0, entitlements(), ""))]),
                      FakeShell(answers=[(has("assetutil"), (0, "not json", "")),
                                         (has("codesign"), (0, entitlements(), ""))]),
                      FakeShell(answers=[(has("assetutil"), (0, listing(["Wordmark"]), "")),
                                         (has("codesign"), (1, "", "not signed at all"))]),
                      FakeShell(answers=[(has("assetutil"), (0, listing(["Wordmark"]), "")),
                                         (has("codesign"), (0, "", ""))])):
            with self.subTest(answers=shell.answers):
                code, out = self.check(shell)
                self.assertEqual(code, 1)
                self.assertIn("can't be read", out)


class PackTest(StepsTest):
    def packed(self):
        return self.steps().packed_path()

    def incoming(self, name="Tadayo.xcarchive.tar"):
        folder = os.path.join(self.temp, "ios-release-in")
        os.makedirs(folder, exist_ok=True)
        return os.path.join(folder, name)

    def unpack_both_ways(self):
        """unpack with Python's own tar filter and without it, as an older Python runs it: each
        of the two defences holds alone."""
        for name, extra in (("with the filter", {"filter": "data"}), ("without", {})):
            with self.subTest(python=name), unittest.mock.patch.object(release, "DATA_ONLY",
                                                                       extra):
                yield

    def test_pack_then_unpack_gives_the_archive_back(self):
        app = self.archive()
        code, out = self.step("pack")
        self.assertEqual(code, 0, out)
        with tarfile.open(self.packed()) as packed:
            names = packed.getnames()
        self.assertTrue(all(n.split("/")[0] == "Tadayo.xcarchive" for n in names))
        self.assertIn("Tadayo.xcarchive/Products/Applications/Tadayo.app/Info.plist", names)
        # The sign job is another runner: it has the tar alone, in the folder it downloaded to.
        shutil.move(self.packed(), self.incoming())
        shutil.rmtree(os.path.join(self.temp, "ios-release-out"))
        code, out = self.step("unpack")
        self.assertEqual(code, 0, out)
        self.assertTrue(os.path.isfile(os.path.join(app, "PlugIns", "TadayoShare.appex",
                                                    "Info.plist")))
        self.assertEqual(self.check()[0], 0)

    def test_pack_refuses_what_isn_t_a_file_or_a_folder(self):
        app = self.archive()
        os.mkfifo(os.path.join(app, "pipe"))
        code, out = self.step("pack")
        self.assertEqual(code, 1)
        self.assertIn("pipe", out)

    def test_pack_without_an_archive_fails(self):
        code, out = self.step("pack")
        self.assertEqual(code, 1)
        self.assertFalse(os.path.exists(self.packed()))

    def test_pack_refuses_a_link(self):
        app = self.archive()
        os.symlink("/etc/hosts", os.path.join(app, "hosts"))
        code, out = self.step("pack")
        self.assertEqual(code, 1)
        self.assertIn("hosts", out)
        self.assertFalse(os.path.exists(self.packed()))

    def tar(self, extra):
        """The sample archive as a tar, with `extra(tar)` adding to it; the folder is removed."""
        shutil.rmtree(self.temp, ignore_errors=True)
        self.archive()
        folder = self.steps().archive_path()
        with tarfile.open(self.incoming(), "w") as packed:
            packed.add(folder, arcname="Tadayo.xcarchive")
            extra(packed)
        shutil.rmtree(os.path.join(self.temp, "ios-release-out"))

    def test_unpack_refuses_what_isn_t_a_plain_file_inside_the_archive(self):
        def link(packed):
            info = tarfile.TarInfo("Tadayo.xcarchive/link")
            info.type, info.linkname = tarfile.SYMTYPE, "../../../tools/ci"
            packed.addfile(info)

        def outside(packed):
            info = tarfile.TarInfo("Tadayo.xcarchive/../escaped.py")
            packed.addfile(info, io.BytesIO(b""))

        def other(packed):
            info = tarfile.TarInfo("tools/ci/ios_release_steps.py")
            packed.addfile(info, io.BytesIO(b""))
        def hard(packed):
            info = tarfile.TarInfo("Tadayo.xcarchive/hard")
            info.type, info.linkname = tarfile.LNKTYPE, "Tadayo.xcarchive/Info.plist"
            packed.addfile(info)
        for extra in (link, outside, other, hard):
            for _ in self.unpack_both_ways():
                self.tar(extra)
                code, out = self.step("unpack")
                self.assertEqual(code, 1)
                self.assertIn("refused", out)
                # Nothing at all was unpacked.
                self.assertEqual(os.listdir(os.path.join(self.temp, "ios-release-out")), [])

    def test_unpack_refuses_an_artifact_that_isn_t_the_one_plain_tar(self):
        def beside(path):
            with open(os.path.join(os.path.dirname(path), "run.json"), "w") as f:
                f.write("{}")

        def a_link(path):
            shutil.move(path, path + ".real")
            os.symlink(path + ".real", path)

        def link_only(path):
            target = os.path.join(self.root, "elsewhere.tar")
            shutil.move(path, target)
            os.symlink(target, path)

        def a_folder(path):
            os.remove(path)
            os.makedirs(path)

        def renamed(path):
            shutil.move(path, path + ".gz")
        def linked_folder(path):
            folder = os.path.dirname(path)
            os.rename(folder, folder + "-real")
            os.symlink(folder + "-real", folder)
        for change in (beside, a_link, link_only, a_folder, renamed, linked_folder):
            with self.subTest(change=change.__name__):
                self.tar(lambda packed: None)
                change(self.incoming())
                code, out = self.step("unpack")
                self.assertEqual(code, 1)
                self.assertIn("refused", out)
                self.assertFalse(os.path.exists(self.steps().archive_path()))
                folder = os.path.join(self.temp, "ios-release-in")
                os.remove(folder) if os.path.islink(folder) else None

    def test_unpack_never_writes_through_a_link_where_the_archive_goes(self):
        target = os.path.join(self.root, "tools-ci")
        for place in ("archive", "out"):
            for _ in self.unpack_both_ways():
                self.tar(lambda packed: None)
                shutil.rmtree(target, ignore_errors=True)
                os.makedirs(target)
                out_folder = os.path.join(self.temp, "ios-release-out")
                if place == "archive":
                    os.makedirs(out_folder)
                    os.symlink(target, os.path.join(out_folder, "Tadayo.xcarchive"))
                else:
                    os.symlink(target, out_folder)
                code, out = self.step("unpack")
                self.assertEqual(code, 1, place)
                self.assertIn("refused", out)
                self.assertEqual(os.listdir(target), [])

    def test_unpack_refuses_a_compressed_tar(self):
        self.tar(lambda packed: None)
        with tarfile.open(self.incoming()) as plain:
            members = [(m, plain.extractfile(m).read() if m.isreg() else None)
                       for m in plain.getmembers()]
        with tarfile.open(self.incoming(), "w:gz") as packed:
            for member, data in members:
                packed.addfile(member, io.BytesIO(data) if data is not None else None)
        code, out = self.step("unpack")
        self.assertEqual(code, 1)
        self.assertIn("can't be read", out)

    def test_unpack_drops_set_id_bits_and_owners(self):
        def setuid(packed):
            info = tarfile.TarInfo("Tadayo.xcarchive/tool")
            info.mode, info.uid, info.uname = 0o6777, 12345, "someone"
            packed.addfile(info, io.BytesIO(b""))
        for _ in self.unpack_both_ways():
            self.tar(setuid)
            code, out = self.step("unpack")
            self.assertEqual(code, 0, out)
            mode = os.stat(os.path.join(self.steps().archive_path(), "tool")).st_mode
            self.assertEqual(stat.S_IMODE(mode) & 0o7022, 0)

    def test_unpack_replaces_an_archive_already_there(self):
        self.tar(lambda packed: None)
        stale = os.path.join(self.steps().archive_path(), "stale")
        os.makedirs(stale)
        self.assertEqual(self.step("unpack")[0], 0)
        self.assertFalse(os.path.exists(stale))

    def test_unpack_fails_on_what_isn_t_the_build_job_s_tar(self):
        self.assertEqual(self.step("unpack")[0], 1)  # no download at all
        with open(self.incoming(), "wb") as f:
            f.write(b"not a tar")
        code, out = self.step("unpack")
        self.assertEqual(code, 1)
        self.assertIn("can't be read", out)
        with tarfile.open(self.incoming(), "w") as packed:  # a tar with no app in it
            packed.addfile(tarfile.TarInfo("Tadayo.xcarchive/Info.plist"), io.BytesIO(b""))
        code, out = self.step("unpack")
        self.assertEqual(code, 1)
        self.assertIn("no Tadayo.app", out)


class RedactTest(StepsTest):
    TOKEN = "eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJ4In0.c2lnbmF0dXJlLWJ5dGVz"

    def test_the_ids_in_any_case_and_tokens_are_hidden(self):
        steps = self.steps()
        text = steps.redact(f"key {KEY_ID} {KEY_ID.lower()} issuer {ISSUER} {ISSUER.upper()} "
                            f"Bearer {self.TOKEN} team {TEAM}")
        self.assertEqual(text, "key *** *** issuer *** *** Bearer *** team " + TEAM)

    def test_without_the_ids_only_tokens_are_hidden(self):
        steps = self.steps(ASC_KEY_ID="", ASC_ISSUER_ID="")
        self.assertEqual(steps.redact(f"plain text, {self.TOKEN}"), "plain text, ***")

    def test_what_a_step_says_and_a_log_s_tail_are_redacted(self):
        self.archive()
        shell = FakeShell(codes=[(has("-exportArchive"), 70)],
                          log_text=f"error: key {KEY_ID.lower()} of {ISSUER.upper()} refused\n"
                                   f"::add-mask::x\n")
        code, out = self.step("upload", shell)
        self.assertEqual(code, 70)
        self.assertIn("| error: key *** of *** refused", out)
        self.assertIn("| ::add-mask::x", out)
        for secret in (KEY_ID, KEY_ID.lower(), ISSUER, ISSUER.upper()):
            self.assertNotIn(secret, out)

    def test_the_real_shell_redacts_and_quotes_what_it_prints_and_logs(self):
        shell = release.Shell(self.root)
        steps = self.steps(shell)
        log = steps.log("export.log")
        program = ("print('error: " + KEY_ID.lower() + " " + self.TOKEN + "'); "
                   "print('::error::made up'); print('quiet line')")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = shell.run([sys.executable, "-c", program, KEY_ID, ISSUER], log=log)
        self.assertEqual(code, 0)
        with open(log) as f:
            logged = f.read()
        for text in (out.getvalue(), logged):
            for secret in (KEY_ID, KEY_ID.lower(), ISSUER, self.TOKEN):
                self.assertNotIn(secret, text)
        self.assertIn("| error: *** ***", out.getvalue())
        self.assertIn("| ::error::made up", out.getvalue())
        self.assertNotRegex(out.getvalue(), r"(?m)^\s*::")
        self.assertIn("quiet line", logged)
        self.assertNotIn("| quiet line", out.getvalue())


class ExportTest(StepsTest):
    def ipa(self, folder, signed=True, profile=True):
        os.makedirs(folder, exist_ok=True)
        with zipfile.ZipFile(os.path.join(folder, "Tadayo.ipa"), "w") as package:
            for bundle in ("Payload/Tadayo.app", "Payload/Tadayo.app/PlugIns/TadayoShare.appex"):
                package.writestr(bundle + "/Info.plist", b"plist")
                if profile:
                    package.writestr(bundle + "/embedded.mobileprovision", b"profile")

    def export_shell(self, signed=None, code=0, **ipa):
        def make(cmd):
            self.ipa(cmd[cmd.index("-exportPath") + 1], **ipa)
        return FakeShell(answers=[(has("codesign"), signed or signed_as(TEAM))],
                         effects=[(has("-exportArchive"), make)],
                         codes=[(has("-exportArchive"), code)], log_text="error: no profile\n")

    def test_export_signs_with_the_key_and_reads_the_result(self):
        self.archive()
        shell = self.export_shell()
        code, out = self.step("export", shell)
        self.assertEqual(code, 0, out)
        cmd = shell.commands[0]
        self.assertEqual(cmd[:2], ["xcodebuild", "-exportArchive"])
        for word in ("-allowProvisioningUpdates", "-authenticationKeyPath"):
            self.assertIn(word, cmd)
        self.assertEqual(cmd[cmd.index("-authenticationKeyID") + 1], KEY_ID)
        self.assertEqual(cmd[cmd.index("-authenticationKeyIssuerID") + 1], ISSUER)
        with open(cmd[cmd.index("-exportOptionsPlist") + 1], "rb") as f:
            self.assertEqual(plistlib.load(f), release.export_options(TEAM, "export"))
        # Both bundles' entitlements were read from the exported app.
        read = [c[-1] for c in shell.commands if "codesign" in c]
        self.assertEqual([os.path.basename(p) for p in read], ["Tadayo.app", "TadayoShare.appex"])
        self.assertTrue(all(os.sep + "payload" + os.sep in p for p in read))

    def test_the_key_is_a_private_file_for_one_command_only(self):
        self.archive()
        shell = self.export_shell()
        code, out = self.step("export", shell)
        self.assertEqual(shell.key_seen, [("0o600", KEY_TEXT + "\n")])
        self.assertEqual(shell.key_folders, [("0o700", [f"AuthKey_{KEY_ID}.p8"])])
        self.assertFalse(os.path.exists(os.path.join(self.temp, "ios-release-key")))
        self.assertNotIn(KEY_TEXT, out)

    def test_a_key_folder_left_by_someone_else_is_never_reused(self):
        self.archive()
        folder = os.path.join(self.temp, "ios-release-key")
        os.makedirs(folder, mode=0o777)
        os.chmod(folder, 0o777)
        with open(os.path.join(folder, f"AuthKey_{KEY_ID}.p8"), "w") as f:
            f.write("planted")
        with open(os.path.join(folder, "watcher"), "w") as f:
            f.write("planted")
        shell = self.export_shell()
        code, out = self.step("export", shell)
        self.assertEqual(code, 0, out)
        self.assertEqual(shell.key_seen, [("0o600", KEY_TEXT + "\n")])
        self.assertEqual(shell.key_folders, [("0o700", [f"AuthKey_{KEY_ID}.p8"])])

    def test_an_ipa_that_isn_t_a_zip_fails(self):
        self.archive()

        def make(cmd):
            folder = cmd[cmd.index("-exportPath") + 1]
            os.makedirs(folder)
            with open(os.path.join(folder, "Tadayo.ipa"), "wb") as f:
                f.write(b"not a zip")
        code, out = self.step("export", FakeShell(effects=[(has("-exportArchive"), make)]))
        self.assertEqual(code, 1)
        self.assertIn("can't be read", out)

    def test_an_export_that_carries_other_code_or_another_entitlement_fails(self):
        self.archive()

        def make(cmd):
            folder = cmd[cmd.index("-exportPath") + 1]
            self.ipa(folder)
            with zipfile.ZipFile(os.path.join(folder, "Tadayo.ipa"), "a") as package:
                package.writestr("Payload/Tadayo.app/PlugIns/Other.appex/Info.plist", b"plist")
        shell = FakeShell(answers=[(has("codesign"), signed_as(TEAM))],
                          effects=[(has("-exportArchive"), make)])
        code, out = self.step("export", shell)
        self.assertEqual(code, 1)
        self.assertIn("the app carries", out)
        more = plistlib.loads(entitlements(TEAM).encode())
        more.update({"beta-reports-active": True, "keychain-access-groups": [TEAM + ".*"]})
        fine = plistlib.dumps(more).decode()
        code, out = self.step("export", self.export_shell(signed=signed_as(TEAM, app=fine)))
        self.assertEqual(code, 0, out)
        more["aps-environment"] = "production"
        code, out = self.step("export", self.export_shell(
            signed=signed_as(TEAM, app=plistlib.dumps(more).decode())))
        self.assertEqual(code, 1)
        self.assertIn("the app: it holds entitlements the project doesn't declare: "
                      "aps-environment", out)
        self.assertNotIn("not-a-key", out)

    def test_the_key_is_removed_when_the_command_fails(self):
        self.archive()
        code, out = self.step("export", self.export_shell(code=70))
        self.assertEqual(code, 70)
        self.assertIn("error: no profile", out)
        self.assertFalse(os.path.exists(os.path.join(self.temp, "ios-release-key")))

    def test_a_key_folder_that_can_t_be_removed_fails_the_step(self):
        self.archive()
        real = shutil.rmtree

        def keep_the_key(path, *args, **kwargs):
            if os.path.basename(path) != "ios-release-key":
                real(path, *args, **kwargs)
        for name in ("export", "upload"):
            with self.subTest(step=name), unittest.mock.patch.object(shutil, "rmtree",
                                                                     keep_the_key):
                code, out = self.step(name, self.export_shell())
                self.assertEqual(code, 1)
                self.assertIn("couldn't be removed", out)
                self.assertNotIn("is uploaded", out)
            real(os.path.join(self.temp, "ios-release-key"))

    def test_the_key_is_never_written_without_the_runner_s_own_temporary_folder(self):
        self.archive()
        steps = self.steps()
        steps.environ.pop("RUNNER_TEMP")
        for name in ("export", "upload"):
            with self.subTest(step=name):
                shell = FakeShell()
                steps.shell = shell
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    code = getattr(steps, name)()
                self.assertEqual(code, 1)
                self.assertIn("RUNNER_TEMP", out.getvalue())
                self.assertEqual(shell.commands, [])

    def test_a_key_that_isn_t_one_fails_before_xcodebuild(self):
        self.archive()
        for change in ({"ASC_KEY_ID": ""}, {"ASC_ISSUER_ID": "not-an-id"}, {"ASC_KEY_P8": ""},
                       {"ASC_KEY_P8": "K1L2M3N4P5"}):
            for name in ("export", "upload"):
                with self.subTest(change=change, step=name):
                    shell = FakeShell()
                    code, out = self.step(name, shell, **change)
                    self.assertEqual(code, 1)
                    self.assertEqual(shell.commands, [])
                    self.assertFalse(os.path.exists(os.path.join(self.temp, "ios-release-key")))

    def test_an_export_that_lost_the_app_group_fails(self):
        self.archive()
        for bundle, label in (("app", "the app"), ("share", "the share extension")):
            with self.subTest(bundle=bundle):
                lost = entitlements(TEAM, groups=(), bundle_id=release.APP_ID if bundle == "app"
                                    else release.SHARE_ID)
                code, out = self.step("export", self.export_shell(
                    signed=signed_as(TEAM, **{bundle: lost})))
                self.assertEqual(code, 1)
                self.assertEqual(out.count("its app groups"), 1, out)
                self.assertIn(f"{label}: its app groups", out)

    def test_an_export_another_team_signed_or_a_debuggable_one_fails(self):
        self.archive()
        for signed, word in ((signed_as("Z9Y8X7W6V5"), "the app: its team isn't the run's"),
                             (signed_as(TEAM, app=entitlements(TEAM, debug=True)),
                              "the app: it allows a debugger"),
                             (signed_as(TEAM, share=entitlements(TEAM, debug=True,
                                                                 bundle_id=release.SHARE_ID)),
                              "the share extension: it allows a debugger"),
                             # The share extension signed as the app itself.
                             (signed_as(TEAM, share=entitlements(TEAM)),
                              "the share extension: its application identifier")):
            with self.subTest(word=word):
                code, out = self.step("export", self.export_shell(signed=signed))
                self.assertEqual(code, 1)
                self.assertIn(word, out)

    def test_an_ipa_with_a_path_outside_itself_is_never_unpacked(self):
        self.archive()

        def make(cmd):
            folder = cmd[cmd.index("-exportPath") + 1]
            self.ipa(folder)
            with zipfile.ZipFile(os.path.join(folder, "Tadayo.ipa"), "a") as package:
                package.writestr("../../escaped.txt", b"x")
        shell = FakeShell(effects=[(has("-exportArchive"), make)])
        code, out = self.step("export", shell)
        self.assertEqual(code, 1)
        self.assertIn("a path outside itself", out)
        self.assertEqual([c for c in shell.commands if "codesign" in c], [])
        self.assertFalse(os.path.exists(os.path.join(self.temp, "escaped.txt")))
        self.assertFalse(os.path.exists(os.path.join(self.temp, "ios-release-out", "payload")))

    def test_an_export_with_no_ipa_or_two_fails(self):
        self.archive()
        code, out = self.step("export", FakeShell(
            effects=[(has("-exportArchive"), lambda cmd: os.makedirs(cmd[cmd.index("-exportPath")
                                                                         + 1]))]))
        self.assertEqual(code, 1)
        self.assertIn("expected one .ipa", out)

    def test_an_export_without_a_profile_fails(self):
        self.archive()
        code, out = self.step("export", self.export_shell(profile=False))
        self.assertEqual(code, 1)
        self.assertIn("no provisioning profile", out)

    def test_nothing_exported_is_left_behind(self):
        self.archive()
        self.step("export", self.export_shell())
        out = os.path.join(self.temp, "ios-release-out")
        self.assertFalse(os.path.exists(os.path.join(out, "export")))
        self.assertFalse(os.path.exists(os.path.join(out, "payload")))

    def test_a_dry_run_skips_export_and_upload(self):
        self.archive()
        for name in ("export", "upload"):
            with self.subTest(step=name):
                shell = FakeShell()
                code, out = self.step(name, shell, RELEASE_UPLOAD="false", ASC_KEY_P8="")
                self.assertEqual(code, 0)
                self.assertIn("skipped", out)
                self.assertEqual(shell.commands, [])

    def test_without_an_archive_neither_runs_xcodebuild(self):
        for name in ("export", "upload"):
            with self.subTest(step=name):
                shell = FakeShell()
                self.assertEqual(self.step(name, shell)[0], 1)
                self.assertEqual(shell.commands, [])

    def test_upload_sends_the_same_archive_with_the_key(self):
        self.archive()
        shell = FakeShell()
        code, out = self.step("upload", shell)
        self.assertEqual(code, 0, out)
        self.assertIn("build 7.2 is uploaded", out)
        self.assertEqual(len(shell.commands), 1)
        cmd = shell.commands[0]
        self.assertEqual(cmd[cmd.index("-archivePath") + 1], self.steps().archive_path())
        with open(cmd[cmd.index("-exportOptionsPlist") + 1], "rb") as f:
            self.assertEqual(plistlib.load(f), release.export_options(TEAM, "upload"))
        self.assertEqual(shell.key_seen, [("0o600", KEY_TEXT + "\n")])
        self.assertFalse(os.path.exists(os.path.join(self.temp, "ios-release-key")))

    def test_a_failed_upload_fails(self):
        self.archive()
        shell = FakeShell(codes=[(has("-exportArchive"), 70)], log_text="error: redundant binary\n")
        code, out = self.step("upload", shell)
        self.assertEqual(code, 70)
        self.assertIn("redundant binary", out)
        self.assertNotIn("is uploaded", out)

    def test_prod_is_refused_by_the_steps_too(self):
        self.archive("prod")
        for name in ("export", "upload"):
            with self.subTest(step=name):
                shell = FakeShell()
                code, out = self.step(name, shell, RELEASE_ENVIRONMENT="prod")
                self.assertEqual(code, 1)
                self.assertEqual(shell.commands, [])


class UsageTest(unittest.TestCase):
    def test_unknown_step(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(release.main(["ios_release_steps.py", "deploy"]), 2)
        self.assertIn("steps:", out.getvalue())


class UnforeseenTest(unittest.TestCase):
    def test_an_exception_no_step_foresaw_fails_it_in_one_line(self):
        def step(steps):
            raise RecursionError("deep " + KEY_TEXT)
        out = io.StringIO()
        with unittest.mock.patch.object(release, "STEPS", dict(release.STEPS, plan=step)), \
                contextlib.redirect_stdout(out):
            self.assertEqual(release.main(["ios_release_steps.py", "plan"]), 1)
        self.assertEqual(out.getvalue(), "ios-release: plan: failed on RecursionError\n")


class WorkflowFileTest(unittest.TestCase):
    """ios-release.yml stays thin, runs only by hand, and keeps the key off the build's runner."""

    BUILD = ["plan", "toolchain", "xcodegen", "archive", "check", "pack"]
    SIGN = ["toolchain", "unpack", "check", "export", "upload"]
    DEV_UPLOAD = "${{ inputs.upload && inputs.environment == 'dev' }}"

    def setUp(self):
        with open(WORKFLOW, encoding="utf-8") as f:
            self.text = f.read()
        jobs = self.text.split("\njobs:\n", 1)[1]
        self.names = re.findall(r"^  ([a-z-]+):$", jobs, flags=re.M)
        self.jobs = dict(zip(self.names, re.split(r"^  [a-z-]+:$", jobs, flags=re.M)[1:]))

    @staticmethod
    def steps_of(job):
        return re.split(r"\n(?=      (?:# .*\n      )*- )", job.split("\n    steps:\n", 1)[1])

    @staticmethod
    def runs(text):
        names = []
        for run in re.findall(r"^\s+(?:- )?run: (.*)$", text, flags=re.M):
            found = re.fullmatch(r"python3 -I tools/ci/ios_release_steps\.py ([a-z]+)", run.strip())
            assert found, f"a run: that isn't one ios_release_steps.py step: {run}"
            names.append(found.group(1))
        return names

    def test_every_run_calls_a_step_here_in_order(self):
        self.assertEqual(self.names, ["build", "sign"])
        self.assertEqual(self.runs(self.jobs["build"]), self.BUILD)
        self.assertEqual(self.runs(self.jobs["sign"]), self.SIGN)
        self.assertEqual(set(self.BUILD + self.SIGN), set(release.STEPS))
        self.assertNotIn("run: |", self.text)

    def test_it_runs_only_by_hand_with_the_two_inputs(self):
        on = self.text.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]
        self.assertTrue(on.startswith("  workflow_dispatch:\n    inputs:\n"))
        self.assertEqual(re.findall(r"^  ([a-z_]+):", on, flags=re.M), ["workflow_dispatch"])
        self.assertEqual(re.findall(r"^      ([a-z_]+):", on, flags=re.M), ["environment", "upload"])
        self.assertEqual(re.findall(r"^          - (.+)$", on, flags=re.M), ["dev", "prod"])

    def test_two_jobs_on_the_standard_xcode_runner_with_read_access_only(self):
        self.assertIn("\npermissions: {}\n", self.text)
        self.assertNotRegex(self.text, r"(?:read|write)-all|: write")
        self.assertEqual(re.findall(r"^    runs-on: (.+)$", self.text, flags=re.M),
                         ["xcode-27", "xcode-27"])
        for job in self.jobs.values():
            self.assertIn("    permissions:\n      contents: read\n", job)
            self.assertIn("persist-credentials: false", job)

    def test_an_input_reaches_a_step_only_as_an_environment_variable(self):
        for line in self.text.splitlines():
            if re.match(r"\s+(- )?run:", line):
                self.assertNotIn("${{", line)
        self.assertIn("\nenv:\n  RELEASE_ENVIRONMENT: ${{ inputs.environment }}\n"
                      "  RELEASE_UPLOAD: ${{ inputs.upload }}\n", self.text)

    def test_the_build_job_holds_no_secret(self):
        # It runs the packages' build plugins, so nothing it could read is worth taking.
        self.assertNotIn("secrets.", self.jobs["build"])
        self.assertNotIn("github.token", self.text)
        self.assertNotIn("GITHUB_TOKEN", self.text)

    def test_the_key_reaches_export_and_upload_alone_on_a_dev_upload_s_fresh_runner(self):
        sign = self.jobs["sign"]
        self.assertIn(f"    needs: build\n    if: {self.DEV_UPLOAD}\n", sign)
        holders = [b for b in self.steps_of(sign) if "secrets." in b]
        self.assertEqual([self.runs(b) for b in holders], [["export"], ["upload"]])
        for block in holders:
            self.assertEqual(sorted(re.findall(r"secrets\.([A-Z0-9_]+)", block)),
                             ["ASC_ISSUER_ID", "ASC_KEY_ID", "ASC_KEY_P8"])
        self.assertEqual(self.text.count("secrets."), 6)
        # Its own checkout comes first, and the build's archive is the one thing it takes.
        steps = self.steps_of(sign)
        self.assertIn("uses: actions/checkout@", steps[0])
        self.assertIn("uses: actions/download-artifact@", steps[1])
        self.assertEqual(self.text.count("uses: actions/checkout@"), 2)

    def test_the_archive_alone_passes_between_the_jobs(self):
        # No log and no folder: one tar file, which holds no secret, kept a day.
        uploads = [b for b in self.steps_of(self.jobs["build"]) if "upload-artifact" in b]
        self.assertEqual(len(uploads), 1)
        self.assertEqual(self.text.count("upload-artifact"), 1)
        self.assertIn(f"      - if: {self.DEV_UPLOAD}\n", uploads[0])
        self.assertIn("          name: archive-${{ github.run_attempt }}\n"
                      "          path: ${{ runner.temp }}/ios-release-out/Tadayo.xcarchive.tar\n"
                      "          if-no-files-found: error\n"
                      "          retention-days: 1\n", uploads[0] + "\n")
        self.assertEqual(self.steps_of(self.jobs["build"])[-1], uploads[0])
        # Into a folder of its own, named for the attempt that built it.
        self.assertIn("          name: archive-${{ github.run_attempt }}\n"
                      "          path: ${{ runner.temp }}/ios-release-in\n", self.jobs["sign"])
        self.assertEqual(self.text.count("ios-release-out"), 1)
        self.assertEqual(self.text.count("download-artifact"), 1)
        self.assertEqual(release.PACKED_NAME, "Tadayo.xcarchive.tar")

    def test_no_step_is_skipped_or_allowed_to_fail_and_no_secret_comes_another_way(self):
        self.assertNotIn("continue-on-error", self.text)
        # The one condition in the file is the dev upload's: on the artifact and the sign job.
        self.assertEqual(re.findall(r"^\s+(?:- )?if: (.*)$", self.text, flags=re.M),
                         [self.DEV_UPLOAD, self.DEV_UPLOAD])
        for word in ("secrets[", "toJSON", "secrets: inherit", "fromJSON"):
            self.assertNotIn(word, self.text)
        # No job or workflow `env:` holds a secret: each is in a step's own `env:`.
        for line in self.text.splitlines():
            if "secrets." in line:
                self.assertRegex(line, r"^          ASC_[A-Z0-9_]+: \$\{\{ secrets\.ASC_[A-Z0-9_]+ \}\}$")
        self.assertEqual(self.text.count("\nenv:\n"), 1)
        self.assertNotRegex(self.text, r"(?m)^    env:")

    def test_every_step_is_only_what_it_is_here(self):
        # A `run` step holds its command, its time limit and, for three of them, its `env`; an
        # action holds its `with`. No other key (shell, working-directory, a second run) and no
        # other value can ride on a step, least of all on one that holds the key.
        team = "        env:\n          APPLE_TEAM_ID: ${{ vars.APPLE_TEAM_ID }}\n"
        key = team + "".join(f"          {name}: ${{{{ secrets.{name} }}}}\n"
                             for name in ("ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8"))
        minutes = {"plan": 2, "toolchain": 5, "xcodegen": 5, "archive": 30, "check": 5,
                   "pack": 5, "unpack": 5, "export": 15, "upload": 15}
        env = {"plan": team, "export": key, "upload": key}

        def run(name):
            return (f"      - run: python3 -I tools/ci/ios_release_steps.py {name}\n"
                    f"        timeout-minutes: {minutes[name]}\n" + env.get(name, ""))
        checkout = ("      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"
                    "  # v7.0.1\n        with:\n          persist-credentials: false\n")

        def plain(job):
            lines = self.jobs[job].split("\n    steps:\n", 1)[1].splitlines()
            return "\n".join(l for l in lines if l.strip() and not l.lstrip().startswith("#"))
        self.assertEqual(plain("build"), (
            checkout + "".join(map(run, self.BUILD))
            + f"      - if: {self.DEV_UPLOAD}\n"
              "        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9"
              "  # v7.0.2\n        with:\n"
              "          name: archive-${{ github.run_attempt }}\n"
              "          path: ${{ runner.temp }}/ios-release-out/Tadayo.xcarchive.tar\n"
              "          if-no-files-found: error\n"
              "          retention-days: 1").rstrip("\n"))
        self.assertEqual(plain("sign"), (
            checkout
            + "      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333"
              "  # v8.0.2\n        with:\n"
              "          name: archive-${{ github.run_attempt }}\n"
              "          path: ${{ runner.temp }}/ios-release-in\n"
            + "".join(map(run, self.SIGN))).rstrip("\n"))

    def test_nothing_rides_on_a_job_or_on_the_workflow_either(self):
        # No working-directory, container, matrix, environment, extra permission or variable:
        # everything outside the steps is exactly this.
        def plain(text):
            return [l for l in text.splitlines() if l.strip() and not l.lstrip().startswith("#")]
        top = self.text.split("\npermissions: {}\n", 1)[1].split("\njobs:\n", 1)[0]
        self.assertEqual(plain(top), [
            "concurrency:", "  group: ios-release", "  cancel-in-progress: false",
            "defaults:", "  run:", "    shell: bash",
            "env:", "  RELEASE_ENVIRONMENT: ${{ inputs.environment }}",
            "  RELEASE_UPLOAD: ${{ inputs.upload }}"])
        before = self.text.split("\npermissions: {}\n", 1)[0]
        self.assertEqual(re.findall(r"^([a-z-]+):", before, flags=re.M), ["name", "on"])
        header = ["    runs-on: xcode-27", "    timeout-minutes: {}", "    permissions:",
                  "      contents: read"]
        heads = {name: plain(job.split("\n    steps:\n", 1)[0]) for name, job in self.jobs.items()}
        self.assertEqual(heads["build"], ["    name: build"]
                         + [line.format(60) for line in header])
        self.assertEqual(heads["sign"], ["    name: sign", "    needs: build",
                                         f"    if: {self.DEV_UPLOAD}"]
                         + [line.format(45) for line in header])

    def test_every_action_is_pinned_to_a_commit_the_other_workflows_use(self):
        uses = re.findall(r"uses: (\S+)", self.text)
        self.assertEqual(len(uses), 4)
        others = ""
        for name in ("ios.yml", "deploy-dev.yml"):
            with open(os.path.join(os.path.dirname(WORKFLOW), name), encoding="utf-8") as f:
                others += f.read()
        for use in uses:
            self.assertRegex(use, r"^actions/[\w-]+@[0-9a-f]{40}$")
            self.assertIn(f"uses: {use} ", others)

    def test_uploads_take_turns_and_are_never_cancelled(self):
        self.assertIn("concurrency:\n  group: ios-release\n  cancel-in-progress: false\n", self.text)

if __name__ == "__main__":
    unittest.main()
