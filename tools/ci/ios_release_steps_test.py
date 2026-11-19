#!/usr/bin/env python3
"""Tests for tools/ci/ios_release_steps.py. Run: python3 tools/ci/ios_release_steps_test.py

Each test builds a scratch repository and a sample archive with only the files a step reads, and
runs the step with a fake shell that records the commands and answers them: `xcodebuild`,
`codesign` and `assetutil` exist only on the workflow's runner. The .ipa a test exports is a
real zip. One test class reads .github/workflows/ios-release.yml itself.
CI configuration: change this file only in its own PR (docs/INVARIANTS.md T58).
"""

import contextlib
import io
import json
import os
import plistlib
import re
import shutil
import struct
import sys
import tempfile
import unittest
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
        self.commands, self.key_seen = [], []
        self.answers, self.codes, self.effects = answers or [], codes or [], effects or []
        self.log_text = log_text

    def _note(self, cmd):
        self.commands.append(cmd)
        if "-authenticationKeyPath" in cmd:
            path = cmd[cmd.index("-authenticationKeyPath") + 1]
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

    def archive(self, environment="dev", icon=(120, 120), rule=None, **app_info):
        app = self.steps().app_path()
        info = {"TadayoEnvironment": environment, "CFBundleIconName": "AppIcon",
                "CFBundleIcons": {"CFBundlePrimaryIcon": {"CFBundleIconFiles": ["AppIcon60x60"]}}}
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
                                  (has("codesign"), (0, signed or entitlements(), ""))], **more)

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

    def test_entitlements(self):
        good = plistlib.loads(entitlements(TEAM).encode())
        self.assertEqual(release.entitlement_problems(good, TEAM), [])
        self.assertEqual(release.entitlement_problems(plistlib.loads(entitlements().encode())), [])
        for bad, word in ((entitlements(TEAM, groups=()), "app groups"),
                          (entitlements(TEAM, groups=("group.other",)), "app groups"),
                          (entitlements("Z9Y8X7W6V5"), "team"),
                          (entitlements(TEAM, debug=True), "get-task-allow")):
            with self.subTest(word=word):
                problems = release.entitlement_problems(plistlib.loads(bad.encode()), TEAM)
                self.assertTrue(any(word in p for p in problems), problems)

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
                       {"APPLE_TEAM_ID": "a1b2c3d4e5"}, {"ASC_KEY_ID": ""},
                       {"ASC_ISSUER_ID": "not-an-id"}, {"ASC_KEY_P8": ""},
                       {"ASC_KEY_P8": "K1L2M3N4P5"}):
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
                     "CODE_SIGN_STYLE=Manual"):
            self.assertIn(word, cmd)

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
            ({"CFBundleIconName": "Other"}, None, "CFBundleIconName"),
            ({"icon": None}, None, "120-pixel"),
            ({"icon": (180, 180)}, None, "120-pixel"),
            ({"CFBundleIcons": {}}, None, "120-pixel"),
            ({"rule": "TRUEPREDICATE"}, None, "activation rule"),
            ({"rule": {"NSExtensionActivationSupportsImageWithMaxCount": 10}}, None,
             "activation rule"),
            ({}, entitlements(groups=()), "app groups"),
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
                                TadayoEnvironment="dev", CFBundleIconName="AppIcon",
                                CFBundleIcons={"CFBundlePrimaryIcon":
                                               {"CFBundleIconFiles": ["AppIcon60x60"]}})
                code, out = self.check(self.shell(signed=signed))
                self.assertEqual(code, 1, out)
                self.assertIn(word, out)

    def test_the_share_extension_s_own_values_are_checked(self):
        app = self.archive()
        self.bundle(os.path.join(app, "PlugIns", "TadayoShare.appex"), "app.other", "1")
        code, out = self.check()
        self.assertEqual(code, 1)
        self.assertIn("the share extension: its bundle id", out)
        self.assertIn("the share extension: its build number", out)

    def test_what_can_t_be_read_fails(self):
        self.assertEqual(self.check()[0], 1)  # no archive at all
        self.archive()
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
        return FakeShell(answers=[(has("codesign"), (0, signed or entitlements(TEAM), ""))],
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
        self.assertFalse(os.path.exists(os.path.join(self.temp, "ios-release-key")))
        self.assertNotIn(KEY_TEXT, out)
        self.assertNotIn("not-a-key", out)

    def test_the_key_is_removed_when_the_command_fails(self):
        self.archive()
        code, out = self.step("export", self.export_shell(code=70))
        self.assertEqual(code, 70)
        self.assertIn("error: no profile", out)
        self.assertFalse(os.path.exists(os.path.join(self.temp, "ios-release-key")))

    def test_an_export_that_lost_the_app_group_fails(self):
        self.archive()
        code, out = self.step("export", self.export_shell(signed=entitlements(TEAM, groups=())))
        self.assertEqual(code, 1)
        self.assertIn("the app: its app groups", out)
        self.assertIn("the share extension: its app groups", out)

    def test_an_export_another_team_signed_or_a_debuggable_one_fails(self):
        self.archive()
        for signed, word in ((entitlements("Z9Y8X7W6V5"), "team"),
                             (entitlements(TEAM, debug=True), "get-task-allow")):
            with self.subTest(word=word):
                code, out = self.step("export", self.export_shell(signed=signed))
                self.assertEqual(code, 1)
                self.assertIn(word, out)

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


class WorkflowFileTest(unittest.TestCase):
    """ios-release.yml stays thin, runs only by hand, and keeps the key from the build."""

    def setUp(self):
        with open(WORKFLOW, encoding="utf-8") as f:
            self.text = f.read()
        self.steps = [b for b in re.split(r"\n(?=      - )", self.text.split("\n    steps:\n", 1)[1])]

    def test_every_run_calls_a_step_here_in_order(self):
        runs = re.findall(r"^\s+(?:- )?run: (.*)$", self.text, flags=re.M)
        names = []
        for run in runs:
            found = re.fullmatch(r"python3 tools/ci/ios_release_steps\.py ([a-z]+)", run.strip())
            self.assertIsNotNone(found, f"a run: that isn't one ios_release_steps.py step: {run}")
            names.append(found.group(1))
        self.assertEqual(names, list(release.STEPS))

    def test_it_runs_only_by_hand_with_the_two_inputs(self):
        on = self.text.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]
        self.assertTrue(on.startswith("  workflow_dispatch:\n    inputs:\n"))
        self.assertEqual(re.findall(r"^  ([a-z_]+):", on, flags=re.M), ["workflow_dispatch"])
        self.assertEqual(re.findall(r"^      ([a-z_]+):", on, flags=re.M), ["environment", "upload"])
        self.assertEqual(re.findall(r"^          - (.+)$", on, flags=re.M), ["dev", "prod"])

    def test_one_job_on_the_standard_xcode_runner_with_read_access_only(self):
        self.assertIn("\npermissions: {}\n", self.text)
        self.assertNotRegex(self.text, r"(?:read|write)-all|: write")
        self.assertEqual(re.findall(r"^  ([a-z-]+):$", self.text.split("\njobs:\n", 1)[1],
                                    flags=re.M), ["release"])
        self.assertEqual(re.findall(r"^    runs-on: (.+)$", self.text, flags=re.M), ["xcode-27"])
        self.assertIn("    permissions:\n      contents: read\n", self.text)
        self.assertIn("persist-credentials: false", self.text)

    def test_an_input_reaches_a_step_only_as_an_environment_variable(self):
        for line in self.text.splitlines():
            if re.match(r"\s+(- )?run:", line):
                self.assertNotIn("${{", line)
        self.assertIn("\nenv:\n  RELEASE_ENVIRONMENT: ${{ inputs.environment }}\n"
                      "  RELEASE_UPLOAD: ${{ inputs.upload }}\n", self.text)

    def test_the_key_reaches_plan_export_and_upload_and_only_on_an_upload_run(self):
        # Never the archive, which runs the packages' build plugins, nor any other step.
        holders = [b for b in self.steps if "secrets." in b]
        self.assertEqual([re.search(r"ios_release_steps\.py ([a-z]+)", b).group(1) for b in holders],
                         ["plan", "export", "upload"])
        for block in holders:
            self.assertEqual(sorted(re.findall(r"secrets\.([A-Z0-9_]+)", block)),
                             ["ASC_ISSUER_ID", "ASC_KEY_ID", "ASC_KEY_P8"])
        for name in ("ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8"):
            self.assertIn(f"          {name}: ${{{{ inputs.upload && secrets.{name} || '' }}}}\n",
                          holders[0] + "\n")
        for block in holders[1:]:
            self.assertIn("      - if: ${{ inputs.upload }}\n", block)
        self.assertEqual(self.text.count("secrets."), 9)
        # Nothing the run made is uploaded as an artifact: the logs name the key's path and ids.
        self.assertNotIn("upload-artifact", self.text)

    def test_every_action_is_pinned_to_a_commit(self):
        uses = re.findall(r"uses: (\S+)", self.text)
        self.assertTrue(uses)
        for use in uses:
            self.assertRegex(use, r"^[\w.-]+/[\w./-]+@[0-9a-f]{40}$")

    def test_uploads_take_turns_and_are_never_cancelled(self):
        self.assertIn("concurrency:\n  group: ios-release\n  cancel-in-progress: false\n", self.text)


if __name__ == "__main__":
    unittest.main()
